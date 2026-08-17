/**
 * Level C-1299.1 「浓汤美味」— 从 MEG 食堂角落的门进入。
 * 一条热气腾腾的后厨长廊，两侧站着 10 名端着锅子炒菜的工作人员。
 * 走到尽头推开一扇门即可抵达 Level 11。生存难度：食堂（安全，无实体、无环境伤害）。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
const levelId = "c1299_1";

/** 大厅尺寸 */
const HALL_HALF_X = 6;
const HALL_MIN_Z = -20;
const HALL_MAX_Z = 20;
const WALL_H = 4.6;
/** 出口门（南端） */
const EXIT_DOOR = { x: 0, z: HALL_MIN_Z + 0.2 };
/** 按 Q 的可交互范围（矩形，比圆形更宽容） */
const EXIT_REACH_X = 2.4;
const EXIT_REACH_Z = 3.2;
/** 直接贴到门上就自动开门，避免完全依赖按键 */
const EXIT_WALKIN_X = 1.1;
const EXIT_WALKIN_Z = 1.1;

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 17, radius: 0.34, speed: 3.6 },
});
fps.yaw = 0; // 面朝 -Z，正对长廊尽头的出口
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let exitLock = false;
/** 炒菜动作的手臂枢轴，逐帧摆动 */
const stirArms = [];

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2600 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1299.1 无法启动</strong></p><p>" + String(text) + "</p>";
}

function addBox(root, w, h, d, x, y, z, mat, collide) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

/**
 * 一名端着锅子炒菜的工作人员，面朝 faceX 方向（-1 朝西墙，+1 朝东墙）。
 * 组件全部按「局部 +Z 就是正面」摆放，朝向只由 group 的 Y 轴旋转决定，
 * 不要再在局部坐标里乘 faceX，否则会把朝向算两遍。
 */
function addWorker(root, x, z, faceX, mats) {
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  // 身体（白色厨师服） + 正面围裙
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.02, 0.34), mats.coat);
  body.position.y = 1.02;
  g.add(body);
  var apron = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.06), mats.apron);
  apron.position.set(0, 0.85, 0.19);
  g.add(apron);
  // 头 + 厨师帽
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mats.skin);
  head.position.y = 1.72;
  g.add(head);
  var hat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.28, 12), mats.coat);
  hat.position.y = 2.02;
  g.add(hat);
  // 炒菜的手臂枢轴（右肩），手臂与锅铲一起朝正前方伸进锅里
  var arm = new THREE.Group();
  arm.position.set(0.26, 1.35, 0);
  var upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), mats.skin);
  upper.position.set(-0.04, -0.06, 0.24);
  arm.add(upper);
  var ladle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), mats.metal);
  ladle.position.set(-0.1, -0.16, 0.66);
  arm.add(ladle);
  arm.rotation.x = -0.5;
  g.add(arm);
  stirArms.push({ arm: arm, phase: Math.random() * Math.PI * 2 });
  // 绕 Y 旋转 θ 会把局部 +Z 映射到世界 (sinθ, 0, cosθ)，所以朝 +X 用 +π/2
  g.rotation.y = faceX * Math.PI * 0.5;
  root.add(g);
}

/** 灶台 + 冒着热气的汤锅 */
function addStove(root, x, z, mats) {
  addBox(root, 1.3, 0.95, 0.9, x, 0.48, z, mats.stove, true);
  var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.34, 16), mats.metal);
  pot.position.set(x, 1.12, z);
  root.add(pot);
  var soup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), mats.soup);
  soup.position.set(x, 1.28, z);
  root.add(soup);
  // 三缕上升的“热气”（半透明面片，仅作氛围，不动）
  for (var i = 0; i < 3; i++) {
    var steam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.8),
      mats.steam
    );
    steam.position.set(x + (i - 1) * 0.12, 1.9 + i * 0.15, z);
    steam.rotation.y = Math.random() * Math.PI;
    root.add(steam);
  }
}

function buildHall(root) {
  var mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0xcdb79a, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x7d7266, roughness: 0.95 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0xd8cdbc, roughness: 0.9 }),
    door: new THREE.MeshStandardMaterial({ color: 0x5b3f28, roughness: 0.8 }),
    stove: new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.7, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8f9498, roughness: 0.5, metalness: 0.6 }),
    soup: new THREE.MeshStandardMaterial({ color: 0xd98a3a, roughness: 0.6, emissive: 0x3a1d08 }),
    coat: new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.85 }),
    apron: new THREE.MeshStandardMaterial({ color: 0xb5482f, roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd8a984, roughness: 0.9 }),
    steam: new THREE.MeshStandardMaterial({
      color: 0xf2ede4,
      roughness: 1,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  };

  var lenZ = HALL_MAX_Z - HALL_MIN_Z;
  var midZ = (HALL_MAX_Z + HALL_MIN_Z) * 0.5;
  addBox(root, HALL_HALF_X * 2, 0.16, lenZ, 0, -0.08, midZ, mats.floor, false);
  addBox(root, HALL_HALF_X * 2, 0.14, lenZ, 0, WALL_H, midZ, mats.ceil, false);
  // 东西长墙
  addBox(root, 0.3, WALL_H, lenZ, -HALL_HALF_X, WALL_H * 0.5, midZ, mats.wall, true);
  addBox(root, 0.3, WALL_H, lenZ, HALL_HALF_X, WALL_H * 0.5, midZ, mats.wall, true);
  // 北墙（入口端，封死）
  addBox(root, HALL_HALF_X * 2, WALL_H, 0.3, 0, WALL_H * 0.5, HALL_MAX_Z, mats.wall, true);
  // 南墙（出口端）+ 门
  addBox(root, HALL_HALF_X * 2, WALL_H, 0.3, 0, WALL_H * 0.5, HALL_MIN_Z, mats.wall, true);
  // 门 + 门框，并单独打一盏灯，让尽头的出口一眼可辨
  addBox(root, 1.6, 3.1, 0.16, EXIT_DOOR.x, 1.55, HALL_MIN_Z + 0.24, mats.door, false);
  addBox(root, 2.0, 0.16, 0.2, EXIT_DOOR.x, 3.18, HALL_MIN_Z + 0.26, mats.metal, false);
  addBox(root, 0.16, 3.3, 0.2, EXIT_DOOR.x - 0.88, 1.65, HALL_MIN_Z + 0.26, mats.metal, false);
  addBox(root, 0.16, 3.3, 0.2, EXIT_DOOR.x + 0.88, 1.65, HALL_MIN_Z + 0.26, mats.metal, false);
  var doorLamp = new THREE.PointLight(0xfff0cc, 0.85, 10, 2);
  doorLamp.position.set(EXIT_DOOR.x, 3.4, HALL_MIN_Z + 2.2);
  root.add(doorLamp);

  // 两排各 5 名炒菜工作人员 + 灶台，沿东西墙布置
  var rowZ = [12, 6, 0, -6, -12];
  var i;
  for (i = 0; i < rowZ.length; i++) {
    // 西侧（面朝西墙 -X）
    addStove(root, -HALL_HALF_X + 0.7, rowZ[i], mats);
    addWorker(root, -HALL_HALF_X + 1.5, rowZ[i], -1, mats);
    // 东侧（面朝东墙 +X）
    addStove(root, HALL_HALF_X - 0.7, rowZ[i], mats);
    addWorker(root, HALL_HALF_X - 1.5, rowZ[i], 1, mats);
  }

  // 照明
  root.add(new THREE.HemisphereLight(0xfff1d8, 0x4a4038, 1.05));
  for (i = 0; i < rowZ.length; i++) {
    var lamp = new THREE.PointLight(0xffe6b8, 0.7, 16, 2);
    lamp.position.set(0, WALL_H - 0.5, rowZ[i]);
    root.add(lamp);
  }
}

function isNearExitDoor() {
  return (
    Math.abs(fps.player.x - EXIT_DOOR.x) <= EXIT_REACH_X &&
    Math.abs(fps.player.z - EXIT_DOOR.z) <= EXIT_REACH_Z
  );
}

/** 是否已经贴到门上（走进门洞即视为推门） */
function isAtExitDoor() {
  return (
    Math.abs(fps.player.x - EXIT_DOOR.x) <= EXIT_WALKIN_X &&
    Math.abs(fps.player.z - EXIT_DOOR.z) <= EXIT_WALKIN_Z
  );
}

function tryExitToL11(requireAim) {
  if (exitLock || !survival || survival.dead) return;
  if (requireAim ? !isAtExitDoor() : !isNearExitDoor()) return;
  exitLock = true;
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l11", fps.yaw);
  queueEnterLevelNumber(11);
  showToast("你推开后厨尽头的门，眼前豁然开朗…");
  window.setTimeout(function () {
    window.location.href = "backrooms-level11.html";
  }, 700);
}

function updateExitHint() {
  if (!hintEl) return;
  if (isInventoryOpen() || isTaskUiOpen() || !survival || survival.dead) return;
  if (isNearExitDoor()) {
    hintEl.innerHTML = "尽头的门 · 按 <kbd>Q</kbd> 打开前往 Level 11";
  } else {
    hintEl.innerHTML =
      "浓汤美味 · 穿过后厨长廊 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 6.2);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat && !isInventoryOpen()) {
        event.preventDefault();
        tryExitToL11(false);
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry(levelId, function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered(levelId, showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a221a);
  scene.fog = new THREE.Fog(0x2a221a, 14, 46);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 120);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsC1299_1";
  scene.add(root);
  buildHall(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: levelId };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(levelId, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  updateExitHint();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 10);
      });
      // 走到门前即推门，不必依赖按键
      tryExitToL11(true);
    }
    // 炒菜手臂来回摆动
    var t = now * 0.006;
    for (var i = 0; i < stirArms.length; i++) {
      stirArms[i].arm.rotation.x = -0.5 + Math.sin(t + stirArms[i].phase) * 0.35;
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    updateExitHint();
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms " + levelId + "]", err);
  showError(err.message || String(err));
}

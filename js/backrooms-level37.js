/**
 * Backrooms Level 37 — 灰廊（stub）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
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
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { markLevelEntered } from "./backrooms-tasks.js";
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
const WALL_H = 9;
/** 水池半边长；玩家沿池边浅水行走 */
const POOL_HALF = 30;
const AIM_MAX = 5;
/** 白色楼梯（通往水池深处）位置 */
const STAIR_X = 0;
const STAIR_Z = -18;
const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 8, radius: 0.34, speed: 3.4 },
});
/** 平静的水池：不掉理智，反而缓慢回复 */
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const SANITY_CALM_PER_SEC = 1.2;
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let waterMesh = null;
let currentAimPick = null;
let transitionLock = false;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2400 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 37 无法启动</strong></p><p>" + String(text) + "</p>";
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

/** 通往水池深处的白色楼梯：向下延伸，尽头没入水中 */
function addWhiteStairs(root) {
  var white = new THREE.MeshStandardMaterial({
    color: 0xf4f7fa,
    emissive: 0xbcd2e4,
    emissiveIntensity: 0.16,
    roughness: 0.6,
  });
  var group = new THREE.Group();
  group.name = "Level37WhiteStairs";
  group.position.set(STAIR_X, 0, STAIR_Z);
  root.add(group);

  var steps = 12;
  var i;
  for (i = 0; i < steps; i++) {
    var y = -0.35 * i;
    var z = -0.85 * i;
    var step = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 0.85), white);
    step.position.set(0, y, z);
    group.add(step);
    var riser = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.16), white);
    riser.position.set(0, y - 0.32, z - 0.42);
    group.add(riser);
  }
  // 两侧栏杆
  var rail;
  for (rail = -1; rail <= 1; rail += 2) {
    var bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 12.4), white);
    bar.position.set(rail * 2.6, 0.95, -5.1);
    bar.rotation.x = -Math.atan2(0.35, 0.85);
    group.add(bar);
  }
  // 楼梯井只能看、不能走进去；下行由准心 Q 触发
  colliders.push(wallCollider(STAIR_X - 3.2, STAIR_X + 3.2, STAIR_Z - 0.9, STAIR_Z - 0.2));
  colliders.push(wallCollider(STAIR_X - 3.3, STAIR_X - 2.7, -POOL_HALF, STAIR_Z));
  colliders.push(wallCollider(STAIR_X + 2.7, STAIR_X + 3.3, -POOL_HALF, STAIR_Z));

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 3.2, 3.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 1.2, -0.6);
  pick.userData.brInteract = { kind: "l37_white_stairs" };
  group.add(pick);
  interactRoots.push(pick);
}

function buildWorld(root) {
  var tile = new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.72 });
  var wall = new THREE.MeshStandardMaterial({
    color: 0xe9f2f6,
    emissive: 0xa8c4d4,
    emissiveIntensity: 0.1,
    roughness: 0.8,
  });
  var deep = new THREE.MeshStandardMaterial({ color: 0x1c5f84, roughness: 0.9 });

  // 浅水池底（玩家可行走）：绕开楼梯井留出开口
  var wellHalfX = 3;
  var wellFrontZ = STAIR_Z - 0.5;
  var sideW = POOL_HALF - wellHalfX;
  addBox(root, sideW, 0.2, POOL_HALF * 2, -(wellHalfX + sideW * 0.5), 0.1, 0, tile, false);
  addBox(root, sideW, 0.2, POOL_HALF * 2, wellHalfX + sideW * 0.5, 0.1, 0, tile, false);
  var midD = POOL_HALF - wellFrontZ;
  addBox(root, wellHalfX * 2, 0.2, midD, 0, 0.1, wellFrontZ + midD * 0.5, tile, false);
  // 楼梯井井壁
  addBox(root, 0.3, 4.5, POOL_HALF + wellFrontZ, -wellHalfX, -2.1, (-POOL_HALF + wellFrontZ) * 0.5, tile, false);
  addBox(root, 0.3, 4.5, POOL_HALF + wellFrontZ, wellHalfX, -2.1, (-POOL_HALF + wellFrontZ) * 0.5, tile, false);

  addBox(root, POOL_HALF * 2, WALL_H, 0.5, 0, WALL_H * 0.5, -POOL_HALF, wall, true);
  addBox(root, POOL_HALF * 2, WALL_H, 0.5, 0, WALL_H * 0.5, POOL_HALF, wall, true);
  addBox(root, 0.5, WALL_H, POOL_HALF * 2, -POOL_HALF, WALL_H * 0.5, 0, wall, true);
  addBox(root, 0.5, WALL_H, POOL_HALF * 2, POOL_HALF, WALL_H * 0.5, 0, wall, true);

  // 池底深色纹路：让水面下有层次（避开楼梯井）
  var i;
  for (i = -3; i <= 5; i++) {
    addBox(root, POOL_HALF * 2 - 2, 0.02, 0.35, 0, 0.21, i * 4.5, deep, false);
  }

  addWhiteStairs(root);

  // 水面：单独抬高一层并关闭深度写入，避免与池底共面闪烁
  var waterMat = new THREE.MeshStandardMaterial({
    color: 0x5fb2da,
    roughness: 0.18,
    metalness: 0.2,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  waterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(POOL_HALF * 2 - 1, POOL_HALF * 2 - 1, 24, 24),
    waterMat
  );
  waterMesh.rotation.x = -Math.PI * 0.5;
  waterMesh.position.set(0, 0.55, 0);
  waterMesh.renderOrder = 2;
  root.add(waterMesh);

  root.add(new THREE.HemisphereLight(0xe6f6ff, 0x4a7a92, 1.15));
  var sun = new THREE.DirectionalLight(0xfdfbf2, 0.75);
  sun.position.set(-14, 26, 10);
  root.add(sun);
  var lamp = new THREE.PointLight(0xbfe6ff, 0.85, 46, 2);
  lamp.position.set(STAIR_X, 3.2, STAIR_Z + 4);
  root.add(lamp);
}

function exitToC370() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("你顺着白色楼梯走进水池深处…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("c370", fps.yaw);
  queueEnterLevelBanner("Level C-370 · 倾向 · 生存难度 0");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c370.html";
  }, 650);
}

function refreshAimPick() {
  if (!camera || transitionLock || isInventoryOpen() || !survival || survival.dead) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function resolveInteract() {
  return currentAimPick && currentAimPick.distance <= AIM_MAX
    ? currentAimPick.data
    : null;
}

function updateInteractUi() {
  var data = resolveInteract();
  var hidden = transitionLock || isInventoryOpen() || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML = "白色楼梯 · 按 <kbd>Q</kbd> 走向水池深处";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function tryQAction() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "l37_white_stairs") exitToC370();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || transitionLock;
    },
    onJump: function () {
      if (!transitionLock) tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l37", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l37", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe0ee);
  scene.fog = new THREE.Fog(0xbfe0ee, 22, 78);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 140);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevel37";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 37 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(37, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  hintEl.innerHTML =
    "Level 37 · 平静的水池 · <kbd>WASD</kbd> · <kbd>Q</kbd> · <kbd>B</kbd>";
  bindControls();
  showToast("水面平静得像镜子……你的心也慢慢静下来了");

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
      survival.sanity = Math.min(100, survival.sanity + SANITY_CALM_PER_SEC * dt);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (waterMesh) {
      waterMesh.position.y = 0.55 + Math.sin(now * 0.0007) * 0.02;
    }
    refreshAimPick();
    updateInteractUi();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L37]", err);
  showError(err.message || String(err));
}

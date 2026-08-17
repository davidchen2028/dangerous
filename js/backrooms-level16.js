/**
 * Backrooms Level 16 — 一大片冰层。
 * 冰面很滑、极寒；某处有一小块铺满沙子的冰层，站上去会被送往 Level 46。
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
const FIELD_HALF = 70;
/** 铺满沙子的那一小块冰层 */
const SAND_PATCH_X = 38;
const SAND_PATCH_Z = -44;
const SAND_PATCH_HALF = 2.4;

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null, floorY: 0 };

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
let transitionLock = false;
/** 冰面打滑：保留上一帧的滑行速度 */
let slideX = 0;
let slideZ = 0;

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
    "<p><strong>Level 16 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(n) {
  var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildWorld(root) {
  var ice = new THREE.MeshStandardMaterial({
    color: 0xc7e2ee,
    roughness: 0.16,
    metalness: 0.12,
  });
  var iceDeep = new THREE.MeshStandardMaterial({
    color: 0x8fb6c8,
    roughness: 0.22,
    metalness: 0.1,
  });
  var crackMat = new THREE.MeshBasicMaterial({
    color: 0x6c93a8,
    transparent: true,
    opacity: 0.5,
  });
  var sand = new THREE.MeshStandardMaterial({
    color: 0xd9bd7c,
    roughness: 0.96,
  });

  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_HALF * 2, FIELD_HALF * 2),
    ice
  );
  floor.rotation.x = -Math.PI * 0.5;
  root.add(floor);

  // 深色冰斑与裂缝，让一望无际的冰面仍有方位参照。
  var patchGeo = new THREE.CircleGeometry(1, 18);
  var i;
  for (i = 0; i < 46; i++) {
    var patch = new THREE.Mesh(patchGeo, iceDeep);
    patch.rotation.x = -Math.PI * 0.5;
    patch.position.set(
      (seeded(i * 1.7) - 0.5) * FIELD_HALF * 1.9,
      0.008,
      (seeded(i * 3.3 + 11) - 0.5) * FIELD_HALF * 1.9
    );
    patch.scale.setScalar(2.5 + seeded(i * 5.1) * 6);
    root.add(patch);
  }
  var crackGeo = new THREE.PlaneGeometry(1, 0.16);
  for (i = 0; i < 60; i++) {
    var crack = new THREE.Mesh(crackGeo, crackMat);
    crack.rotation.x = -Math.PI * 0.5;
    crack.rotation.z = seeded(i * 7.7) * Math.PI;
    crack.position.set(
      (seeded(i * 2.9 + 5) - 0.5) * FIELD_HALF * 1.9,
      0.012,
      (seeded(i * 4.7 + 23) - 0.5) * FIELD_HALF * 1.9
    );
    crack.scale.x = 4 + seeded(i * 9.1) * 12;
    root.add(crack);
  }

  // 出口：铺满沙子的一小块冰层。
  var patchSand = new THREE.Mesh(
    new THREE.PlaneGeometry(SAND_PATCH_HALF * 2, SAND_PATCH_HALF * 2),
    sand
  );
  patchSand.rotation.x = -Math.PI * 0.5;
  patchSand.position.set(SAND_PATCH_X, 0.02, SAND_PATCH_Z);
  root.add(patchSand);
  // 沙子边缘散开的薄薄一层，走近才看得清。
  var grainGeo = new THREE.CircleGeometry(0.42, 10);
  for (i = 0; i < 26; i++) {
    var grain = new THREE.Mesh(grainGeo, sand);
    grain.rotation.x = -Math.PI * 0.5;
    grain.position.set(
      SAND_PATCH_X + (seeded(i * 6.1) - 0.5) * SAND_PATCH_HALF * 3.4,
      0.016,
      SAND_PATCH_Z + (seeded(i * 8.3 + 3) - 0.5) * SAND_PATCH_HALF * 3.4
    );
    grain.scale.setScalar(0.5 + seeded(i * 2.3) * 1.1);
    root.add(grain);
  }

  // 冰脊：作为场地边界的可见提示 + 空气墙。
  var ridge = new THREE.MeshStandardMaterial({
    color: 0xa8cbdb,
    roughness: 0.3,
    metalness: 0.08,
  });
  var ridgeGeo = new THREE.ConeGeometry(1, 1, 5);
  for (i = 0; i < 96; i++) {
    var side = i % 4;
    var t = (Math.floor(i / 4) / 24 - 0.5) * FIELD_HALF * 2;
    var rx = side === 0 ? -FIELD_HALF : side === 1 ? FIELD_HALF : t;
    var rz = side === 2 ? -FIELD_HALF : side === 3 ? FIELD_HALF : t;
    var spike = new THREE.Mesh(ridgeGeo, ridge);
    var h = 2.6 + seeded(i * 3.7) * 3.4;
    spike.scale.set(1.6 + seeded(i * 1.3) * 1.4, h, 1.6 + seeded(i * 4.9) * 1.4);
    spike.position.set(rx, h * 0.5, rz);
    spike.rotation.y = seeded(i * 5.5) * Math.PI;
    root.add(spike);
  }
  colliders.push(wallCollider(-FIELD_HALF - 3, -FIELD_HALF + 1, -FIELD_HALF - 3, FIELD_HALF + 3));
  colliders.push(wallCollider(FIELD_HALF - 1, FIELD_HALF + 3, -FIELD_HALF - 3, FIELD_HALF + 3));
  colliders.push(wallCollider(-FIELD_HALF - 3, FIELD_HALF + 3, -FIELD_HALF - 3, -FIELD_HALF + 1));
  colliders.push(wallCollider(-FIELD_HALF - 3, FIELD_HALF + 3, FIELD_HALF - 1, FIELD_HALF + 3));

  root.add(new THREE.HemisphereLight(0xe8f6ff, 0x7e9cae, 1.25));
  var sun = new THREE.DirectionalLight(0xdfeeff, 1.1);
  sun.position.set(-26, 34, 18);
  root.add(sun);
  root.add(new THREE.AmbientLight(0xbcd8e8, 0.35));
}

function isOnSandPatch(px, pz) {
  return (
    Math.abs(px - SAND_PATCH_X) <= SAND_PATCH_HALF &&
    Math.abs(pz - SAND_PATCH_Z) <= SAND_PATCH_HALF
  );
}

function exitToLevel46() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("脚下的沙子突然变得滚烫——冰层不见了…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l46", fps.yaw);
  queueEnterLevelNumber(46);
  window.setTimeout(function () {
    window.location.href = "backrooms-level46.html";
  }, 700);
}

/** 冰面惯性：松开按键后仍会向原方向滑一段（按键期间只记录速度，不叠加位移） */
function applyIceSlide(dt) {
  slideX -= slideX * 0.55 * dt;
  slideZ -= slideZ * 0.55 * dt;
  if (Math.abs(slideX) < 0.05) slideX = 0;
  if (Math.abs(slideZ) < 0.05) slideZ = 0;
  if (slideX === 0 && slideZ === 0) return;
  var out = resolveBackroomsMoveCollisions(
    fps.player.x + slideX * dt,
    fps.player.z + slideZ * dt,
    fps.player.radius,
    colliders,
    12
  );
  fps.player.x = out.x;
  fps.player.z = out.z;
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen() || transitionLock;
    },
    onJump: function () {
      tryBackroomsJump(fps, 7.5);
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
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l16", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l16", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd6e9f3);
  scene.fog = new THREE.Fog(0xd6e9f3, 30, 130);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 200);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevel16";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 16 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(16, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 16 · 冰面很滑 · 找一小块铺满沙子的冰层 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  }
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
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen() && !transitionLock) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      var prevX = fps.player.x;
      var prevZ = fps.player.z;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
      if (dt > 0 && moving) {
        slideX = (fps.player.x - prevX) / dt;
        slideZ = (fps.player.z - prevZ) / dt;
      } else {
        applyIceSlide(dt);
      }
    }
    if (
      !transitionLock &&
      survival &&
      !survival.dead &&
      isOnSandPatch(fps.player.x, fps.player.z)
    ) {
      exitToLevel46();
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L16]", err);
  showError(err.message || String(err));
}

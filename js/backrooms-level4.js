/**
 * Backrooms Level 4 — 无限现代办公层（由 L3 电梯进入）
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
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import { buildLevel4World, L4_WALL_H } from "./backrooms-level4-world.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
import { refreshLevel1_1OutpostChestsOnFirstL4Visit } from "./backrooms-level1-1-chests.js";
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
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
  DEFAULT_BODY_HEIGHT,
} from "./backrooms-fps-controller.js";

const FOG_COLOR = 0xe8ebf0;
const FOG_NEAR = 6;
const FOG_FAR = 52;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const waterHintEl = document.getElementById("backroomsWaterHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const LOOK_SENS = 0.0022;
const AIM_INTERACT_MAX = 3.2;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildLevel4World> | null} */
let level4World = null;
let colliders = [];
let survival = null;
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.15 },
});
let spawnX = 0;
let spawnZ = 2;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let lootToastUntil = 0;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 4 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l4", function (y) {
        fps.yaw = y;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return false;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 4 办公层 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包" + nv;
}

function updateAimPick() {
  if (!camera || !interactRoots.length || isInventoryOpen() || !survival || survival.dead) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    colliders,
    0,
    L4_WALL_H
  );
  currentAimPick = pickCrosshairInteract(
    camera,
    interactRoots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function isAimWaterCooler() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_water_cooler") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function updateWaterHint() {
  if (!waterHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    waterHintEl.hidden = true;
    return;
  }
  waterHintEl.hidden = !isAimWaterCooler();
}

function tryWaterCoolerQ() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimWaterCooler()) return;
  if (!survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showLootToast("背包已满");
    return;
  }
  saveBackroomsSurvival(survival);
  showLootToast("接了一瓶杏仁水");
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryWaterCoolerQ();
        return true;
      }
      return false;
    },
    onPointerLockChange: function () {
      syncLookUi();
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  refreshLevel1_1OutpostChestsOnFirstL4Visit();
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var root = new THREE.Group();
  root.name = "BackroomsLevel4";
  scene.add(root);

  level4World = buildLevel4World(root);
  colliders = level4World.colliders;
  interactRoots = level4World.interactRoots;
  spawnX = level4World.spawnX;
  spawnZ = level4World.spawnZ;
  fps.player.x = spawnX;
  fps.player.z = spawnZ;

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showLootToast("杏仁水 · +15 血量 · +25 理智");
    },
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 4 };
  });

  initBackroomsTemperature(4, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) survival.update(dt, { sprinting: sprinting });
    updateBackroomsPlayerPhysics(fps, dt, {
      gravity: DEFAULT_GRAVITY,
      bodyHeight: BODY_HEIGHT,
      ceilingY: L4_WALL_H,
    });
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 16);
      });
    }
    if (level4World) level4World.update(fps.player.x, fps.player.z);
    updateAimPick();
    updateWaterHint();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead
      );
    }
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L4]", err);
  showError(err.message || String(err));
}

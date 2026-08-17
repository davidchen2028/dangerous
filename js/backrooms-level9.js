/**
 * Backrooms Level 9 — 明亮的无限郊区道路
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
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { buildLevel9World } from "./backrooms-level9-world.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
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
const BODY_HEIGHT = 1.78;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const lootToastEl = document.getElementById("backroomsLootToast");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let world = null;
let moths = null;
let clumps = null;
let firesalt = null;
let transitionLock = false;
let lootToastUntil = 0;
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.2 },
});
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: null,
};
const _mothUpdateOpts = { now: 0 };
const _clumpUpdateOpts = {};

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2400 });
  lootToastUntil = performance.now() + 2400;
}

function syncHint() {
  if (!hintEl) return;
  var nv = isNightVisionActive()
    ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>"
    : "";
  hintEl.innerHTML =
    "Level 9 · 沿道路前进 · 留意右侧人行道与道路尽头 · " +
    "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包" +
    nv;
}

function exitTo(levelNumber) {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass(levelNumber === 10 ? "l10" : "l11", fps.yaw);
  queueEnterLevelNumber(levelNumber);
  window.location.href = "backrooms-level" + levelNumber + ".html";
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
      tryBackroomsJump(fps, 8);
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
    onPointerLockChange: syncHint,
  });
  bindBackroomsWindowResize(renderer, camera);
}

function initEntities(root) {
  // 55m：各 1；70m：各 1；85m：各 2；之后不再生成
  moths = createDeathMothsAt(
    root,
    [
      { x: -1.9, z: 55, y: 1.65, rotY: Math.PI },
      { x: 1.9, z: 70, y: 1.68, rotY: Math.PI },
      { x: -2.4, z: 85, y: 1.64, rotY: Math.PI },
      { x: 2.4, z: 85.8, y: 1.7, rotY: Math.PI },
    ],
    colliders
  );
  clumps = createClumpsAt(
    root,
    [
      { x: 1.8, z: 55.8, rotY: Math.PI, seed: 55 },
      { x: -1.8, z: 70.8, rotY: Math.PI, seed: 70 },
      { x: -2.1, z: 86.4, rotY: Math.PI, seed: 851 },
      { x: 2.1, z: 87.2, rotY: Math.PI, seed: 852 },
    ],
    colliders
  );
}

function init() {
  if (!enforceLevelEntry("l9", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l9", showToast);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ed9f2);
  scene.fog = new THREE.Fog(0x9ed9f2, 65, 180);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 220);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer, 1);
  renderer.shadowMap.enabled = false;

  var root = new THREE.Group();
  root.name = "BackroomsLevel9";
  scene.add(root);
  world = buildLevel9World(root);
  colliders.push.apply(colliders, world.colliders);
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;
  initEntities(root);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showToast,
  });

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
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) syncHint();
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 9 };
  });
  initBackroomsTemperature(9, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncHint();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (lootToastEl && !lootToastEl.hidden && now >= lootToastUntil) {
      lootToastEl.hidden = true;
    }

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders);
      });
    }

    world.update(fps.player.x, fps.player.z);
    if (!transitionLock && world.isLevel10Exit(fps.player.x, fps.player.z)) {
      exitTo(10);
    } else if (!transitionLock && world.isLevel11Exit(fps.player.x, fps.player.z)) {
      exitTo(11);
    }

    if (moths && survival && !survival.dead && !transitionLock) {
      _mothUpdateOpts.now = now;
      moths.update(dt, fps.player.x, fps.player.z, survival, showToast, _mothUpdateOpts);
    }
    if (clumps && survival && !survival.dead && !transitionLock) {
      clumps.update(dt, fps.player.x, fps.player.z, survival, showToast, _clumpUpdateOpts);
    }
    if (firesalt) firesalt.update(dt);

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (error) {
  console.error("[Backrooms L9]", error);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = "Level 9 无法启动：" + (error.message || String(error));
  }
}

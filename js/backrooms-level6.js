/**
 * Backrooms Level 6 — 伸手不见五指的巨大黑暗空间
 * 每 10 秒：40% → L7，30% 留下，30% → L6.1
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
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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

const SPACE = 220;
const WALL_H = 12;
const FOG_COLOR = 0x000000;
const FOG_DENSITY = 0.22;
const ROLL_INTERVAL = 10;
const EYE_HEIGHT = 1.65;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let transitionLock = false;
let rollTimer = 0;
let lastHintKey = "";
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.6 },
});

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 6 无法启动</strong></p><p>" + msg + "</p>";
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2800 });
}

function syncLookUi() {
  if (!hintEl) return;
  var remain = Math.max(0, Math.ceil(ROLL_INTERVAL - rollTimer));
  hintEl.innerHTML =
    "Level 6 · 伸手不见五指 · 夜视无效 · 下一次偏移约 <strong>" +
    remain +
    "</strong> 秒 · <kbd>WASD</kbd> · <kbd>B</kbd>";
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l6", function (y) {
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

function exitTo(levelId, levelNumber, page, toast) {
  if (transitionLock) return;
  transitionLock = true;
  showToast(toast);
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelNumber(levelNumber);
  window.setTimeout(function () {
    window.location.href = page;
  }, 650);
}

function rollFate() {
  if (transitionLock || !survival || survival.dead) return;
  var r = Math.random();
  if (r < 0.4) {
    exitTo("l7", 7, "backrooms-level7.html", "黑暗撕开——你不断下坠…");
    return;
  }
  if (r < 0.7) {
    showToast("什么都没有发生。黑暗仍在等待。");
    return;
  }
  exitTo("l6_1", "6.1", "backrooms-level6-1.html", "地面下沉——你滑向未知空间…");
}

function buildDarkWorld(root) {
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x050507,
    roughness: 1,
    metalness: 0,
  });
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(SPACE, SPACE), floorMat);
  floor.rotation.x = -Math.PI * 0.5;
  root.add(floor);

  var half = SPACE * 0.5 - 0.4;
  colliders.push({ kind: "wall", minX: -half - 2, maxX: -half, minZ: -half, maxZ: half });
  colliders.push({ kind: "wall", minX: half, maxX: half + 2, minZ: -half, maxZ: half });
  colliders.push({ kind: "wall", minX: -half, maxX: half, minZ: -half - 2, maxZ: -half });
  colliders.push({ kind: "wall", minX: -half, maxX: half, minZ: half, maxZ: half + 2 });

  root.add(new THREE.AmbientLight(0xffffff, 0.012));
  root.add(new THREE.HemisphereLight(0x101018, 0x000000, 0.02));
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
      tryBackroomsJump(fps, 7.5);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  markLevelEntered("l6", showToast);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel6";
  scene.add(root);
  buildDarkWorld(root);

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
      // Level 6 禁止夜视：药水不消耗，也不产生任何提亮
      showToast("这里的黑暗吞没了夜视……");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 6 };
  });

  initBackroomsTemperature(6, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

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
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 40);
      });
    }

    if (!transitionLock && survival && !survival.dead) {
      rollTimer += dt;
      if (rollTimer >= ROLL_INTERVAL) {
        rollTimer = 0;
        rollFate();
      }
    }

    var hintKey = String(Math.ceil(Math.max(0, ROLL_INTERVAL - rollTimer)));
    if (hintKey !== lastHintKey) {
      lastHintKey = hintKey;
      syncLookUi();
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead
      );
    }
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L6]", err);
  showError(err.message || String(err));
}

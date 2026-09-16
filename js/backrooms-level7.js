/**
 * Backrooms Level 7 — 无尽海面上的破木屋；从缺口跳入水中 10 秒沉没后进入 Level 8。
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
import {
  PLATFORM_TOP_Y,
  WATER_SURFACE_Y,
  L7_SPAWN,
  isOnLevel7Platform,
} from "./backrooms-level7-layout.js";
import {
  buildLevel7World,
  updateLevel7Water,
  updateLevel7Lamp,
} from "./backrooms-level7-world.js?v=1";
import {
  bindLevel7AudioOnGesture,
  playLevel7Splash,
  startLevel7Audio,
  stopLevel7Audio,
  updateLevel7Audio,
} from "./backrooms-level7-audio.js?v=1";

const SINK_DURATION = 10;
const SINK_DEPTH = 3.2;
const EYE_HEIGHT = 1.65;
const WATER_SPEED_MUL = 0.38;
const FOG_COLOR = 0x0c161e;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");

const _survCtx = { sprinting: false, sanityDrainPerSec: 0.04 };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: null,
  floorY: PLATFORM_TOP_Y,
};

let renderer = null;
let camera = null;
let scene = null;
let world = null;
let waterOverlay = null;
let survival = null;
let transitionLock = false;
let inWater = false;
let sinkTimer = 0;
let lastHintKey = "";
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: L7_SPAWN.x, z: L7_SPAWN.z, radius: 0.34, speed: 4.1 },
});

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 7 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function syncHint() {
  if (!hintEl) return;
  if (inWater) {
    var left = Math.max(0, Math.ceil(SINK_DURATION - sinkTimer));
    hintEl.innerHTML = "你在下沉……还剩 <strong>" + left + "</strong> 秒";
  } else {
    hintEl.innerHTML =
      "Level 7 · 无尽之海 · 临海缺口可跳下 · 落水会慢慢沉没 · <kbd>WASD</kbd> · <kbd>Space</kbd> · <kbd>B</kbd>";
  }
}

function ensureWaterOverlay() {
  if (waterOverlay) return waterOverlay;
  waterOverlay = document.createElement("div");
  waterOverlay.id = "backroomsWaterOverlay";
  waterOverlay.className = "backrooms-l7-water";
  waterOverlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(waterOverlay);
  return waterOverlay;
}

function updateWaterVisual(progress) {
  var el = ensureWaterOverlay();
  el.style.opacity = String(progress <= 0 ? 0 : Math.min(0.96, 0.22 + progress * 0.74));
  if (!scene || !scene.fog || !scene.background) return;
  var deep = 0.14 + progress * 0.62;
  scene.fog.near = 6 - progress * 3.4;
  scene.fog.far = 42 - progress * 26;
  scene.background.setRGB(0.05 * (1 - deep), 0.09 * (1 - deep * 0.75), 0.12 * (1 - deep * 0.45));
}

function exitToLevel8() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("你完全沉入水中，四周只剩黑暗…");
  stopLevel7Audio();
  saveBackroomsSurvival(survival);
  grantLevelPass("l8", fps.yaw);
  queueEnterLevelNumber(8);
  window.setTimeout(function () {
    window.location.href = "backrooms-level8.html";
  }, 700);
}

function enterWater() {
  if (inWater) return;
  inWater = true;
  sinkTimer = 0;
  fps.velY = Math.min(fps.velY, -0.4);
  fps.grounded = false;
  startLevel7Audio();
  playLevel7Splash();
  showToast("你落入水中，开始下沉…");
  syncHint();
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
      if (inWater || transitionLock) return;
      tryBackroomsJump(fps, 8);
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
  try {
    if (
      !enforceLevelEntry("l7", function (yaw) {
        fps.yaw = yaw;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return;
  }

  showEnterLevelBannerIfQueued();
  markLevelEntered("l7", showToast);
  fps.feetY = PLATFORM_TOP_Y;
  fps.grounded = true;
  if (!Number.isFinite(fps.yaw)) fps.yaw = 0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 10, 48);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 110);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel7";
  scene.add(root);
  world = buildLevel7World(root, { gfxLow: gfx.tier === "low", colliders: colliders });

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
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 7 };
  });
  initBackroomsTemperature(7, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  ensureWaterOverlay();
  syncHint();
  bindLevel7AudioOnGesture();
  bindControls();
  window.addEventListener("pagehide", stopLevel7Audio);
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") {
      fps.player.x = 0;
      fps.player.z = -4.2;
      fps.feetY = WATER_SURFACE_Y;
      enterWater();
      window.setTimeout(function () {
        document.body.dataset.l7 = JSON.stringify({
          inWater: inWater,
          sinkTimer: sinkTimer,
          errorHidden: !errorEl || errorEl.hidden,
          hint: hintEl ? hintEl.textContent : "",
        });
      }, 400);
    }
  } catch (_dbg) {}

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var time = now * 0.001;
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && !inWater;
    var sinkProgress = inWater ? sinkTimer / SINK_DURATION : 0;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = inWater ? 0.16 + sinkProgress * 0.12 : 0.035;
      survival.update(dt, _survCtx);
    }

    var standingOnPlatform = isOnLevel7Platform(fps.player.x, fps.player.z, fps.player.radius);
    var floorY = PLATFORM_TOP_Y;

    if (inWater) {
      sinkTimer = Math.min(SINK_DURATION, sinkTimer + dt);
      sinkProgress = sinkTimer / SINK_DURATION;
      floorY = WATER_SURFACE_Y - SINK_DEPTH * sinkProgress;
      _physOpts.gravity = 4.5;
      updateWaterVisual(sinkProgress);
      var hintKey = String(Math.ceil(SINK_DURATION - sinkTimer));
      if (hintKey !== lastHintKey) {
        lastHintKey = hintKey;
        syncHint();
      }
      if (sinkTimer >= SINK_DURATION) {
        exitToLevel8();
      }
    } else if (standingOnPlatform) {
      floorY = PLATFORM_TOP_Y;
      _physOpts.gravity = DEFAULT_GRAVITY;
      updateWaterVisual(0);
    } else {
      floorY = WATER_SURFACE_Y;
      _physOpts.gravity = DEFAULT_GRAVITY;
      if (fps.feetY <= WATER_SURFACE_Y + 0.15) {
        enterWater();
      }
    }

    _physOpts.floorY = floorY;
    _physOpts.ceilingY = null;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul = inWater
        ? WATER_SPEED_MUL
        : survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 50);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (inWater) {
      camera.rotation.z = Math.sin(time * 1.55) * 0.045;
      camera.position.y += Math.sin(time * 2.05) * 0.035;
    } else {
      camera.rotation.z = 0;
    }

    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead || inWater
      );
    }
    updateLevel7Water(world, time);
    updateLevel7Lamp(world, time, sinkProgress);
    updateLevel7Audio(inWater, sinkProgress);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L7]", err);
  showError(err.message || String(err));
}

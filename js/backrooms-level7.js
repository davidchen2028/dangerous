/**
 * Backrooms Level 7 — 7×7 平台，周围是水；跳入水中 10 秒缓缓沉没后进入 Level 8
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

const PLATFORM_SIZE = 7;
const PLATFORM_HALF = PLATFORM_SIZE * 0.5;
const PLATFORM_TOP_Y = 0.42;
const WATER_SURFACE_Y = 0.08;
const SINK_DURATION = 10;
const SINK_DEPTH = 3.2;
const EYE_HEIGHT = 1.65;
const WATER_SPEED_MUL = 0.38;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");

const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: null,
  floorY: PLATFORM_TOP_Y,
};

let renderer = null;
let camera = null;
let scene = null;
let waterOverlay = null;
let survival = null;
let transitionLock = false;
let inWater = false;
let sinkTimer = 0;
let lastHintKey = "";
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 7 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function onPlatform(x, z) {
  var margin = fps.player.radius * 0.35;
  return (
    Math.abs(x) <= PLATFORM_HALF - margin &&
    Math.abs(z) <= PLATFORM_HALF - margin
  );
}

function syncHint() {
  if (!hintEl) return;
  if (inWater) {
    var left = Math.max(0, Math.ceil(SINK_DURATION - sinkTimer));
    hintEl.innerHTML =
      "你在下沉……还剩 <strong>" + left + "</strong> 秒";
  } else {
    hintEl.innerHTML =
      "Level 7 · 7×7 平台 · 跳进水里会慢慢沉没 · <kbd>WASD</kbd> · <kbd>Space</kbd> · <kbd>B</kbd>";
  }
}

function exitToLevel8() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("你完全沉入水中，四周只剩黑暗…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l8", fps.yaw);
  queueEnterLevelNumber(8);
  window.setTimeout(function () {
    window.location.href = "backrooms-level8.html";
  }, 700);
}

function buildWorld(root) {
  var waterMat = new THREE.MeshStandardMaterial({
    color: 0x1a4a68,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
  });
  var platformMat = new THREE.MeshStandardMaterial({
    color: 0x8a8072,
    roughness: 0.88,
    metalness: 0.05,
  });
  var rimMat = new THREE.MeshStandardMaterial({
    color: 0x6e675c,
    roughness: 0.8,
    metalness: 0.08,
  });

  var water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), waterMat);
  water.rotation.x = -Math.PI * 0.5;
  water.position.y = WATER_SURFACE_Y;
  root.add(water);

  var platform = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_SIZE, 0.55, PLATFORM_SIZE),
    platformMat
  );
  platform.position.set(0, PLATFORM_TOP_Y - 0.275, 0);
  root.add(platform);

  var rim = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_SIZE + 0.25, 0.12, PLATFORM_SIZE + 0.25),
    rimMat
  );
  rim.position.set(0, PLATFORM_TOP_Y + 0.02, 0);
  root.add(rim);

  // 远边界防止无限漂走
  var bound = 42;
  colliders.push({ kind: "wall", minX: -bound - 2, maxX: -bound, minZ: -bound, maxZ: bound });
  colliders.push({ kind: "wall", minX: bound, maxX: bound + 2, minZ: -bound, maxZ: bound });
  colliders.push({ kind: "wall", minX: -bound, maxX: bound, minZ: -bound - 2, maxZ: -bound });
  colliders.push({ kind: "wall", minX: -bound, maxX: bound, minZ: bound, maxZ: bound + 2 });

  root.add(new THREE.HemisphereLight(0x7a94aa, 0x1a2834, 0.7));
  var sun = new THREE.DirectionalLight(0xc8d8e8, 0.85);
  sun.position.set(-10, 20, 8);
  root.add(sun);
  root.add(new THREE.AmbientLight(0x405060, 0.35));
}

function ensureWaterOverlay() {
  if (waterOverlay) return waterOverlay;
  waterOverlay = document.createElement("div");
  waterOverlay.id = "backroomsWaterOverlay";
  waterOverlay.setAttribute("aria-hidden", "true");
  waterOverlay.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:18;" +
    "background:radial-gradient(ellipse at center,rgba(18,60,90,0.18),rgba(4,18,32,0.72));" +
    "opacity:0;transition:opacity 0.35s linear;";
  document.body.appendChild(waterOverlay);
  return waterOverlay;
}

function updateWaterVisual(progress) {
  var el = ensureWaterOverlay();
  el.style.opacity = String(Math.min(0.95, 0.2 + progress * 0.75));
  if (scene) {
    var deep = 0.12 + progress * 0.55;
    scene.fog.near = 4 - progress * 2.5;
    scene.fog.far = 36 - progress * 22;
    scene.background.setRGB(0.08 * (1 - deep), 0.14 * (1 - deep * 0.7), 0.18 * (1 - deep * 0.4));
  }
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
      if (inWater || transitionLock) return;
      tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (e) {
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
  fps.feetY = PLATFORM_TOP_Y;
  fps.grounded = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2834);
  scene.fog = new THREE.Fog(0x1c2834, 10, 48);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel7";
  scene.add(root);
  buildWorld(root);

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
  syncHint();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && !inWater;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }

    var standingOnPlatform = onPlatform(fps.player.x, fps.player.z);
    var floorY = PLATFORM_TOP_Y;

    if (inWater) {
      sinkTimer = Math.min(SINK_DURATION, sinkTimer + dt);
      var progress = sinkTimer / SINK_DURATION;
      floorY = WATER_SURFACE_Y - SINK_DEPTH * progress;
      _physOpts.gravity = 4.5;
      updateWaterVisual(progress);
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
      // 离开平台后落入水面，触水即开始下沉
      floorY = WATER_SURFACE_Y;
      _physOpts.gravity = DEFAULT_GRAVITY;
      if (fps.feetY <= WATER_SURFACE_Y + 0.15) {
        inWater = true;
        sinkTimer = 0;
        fps.velY = Math.min(fps.velY, -0.4);
        fps.grounded = false;
        showToast("你落入水中，开始下沉…");
        syncHint();
      }
    }

    _physOpts.floorY = floorY;
    _physOpts.ceilingY = null;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock) {
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
    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead || inWater
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
  console.error("[Backrooms L7]", err);
  showError(err.message || String(err));
}

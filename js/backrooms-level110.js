/**
 * Level 110 / C-24 — 环黑洞太空城控制器。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import { loadBackroomsSurvival, saveBackroomsSurvival, registerBackroomsSurvivalPersist } from "./backrooms-survival-persist.js";
import {
  installMegCheckpointDeathHooks,
  setL110MegExitFlag,
} from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
  updateBackroomsColdDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { resolveBackroomsGfxProfile, applyBackroomsRendererSize, applyBackroomsToneMapping } from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { buildLevel110World } from "./backrooms-level110-world.js";
import { applyL110HalfCaps } from "./backrooms-level110-caps.js";
import { getHpMax, getStaminaMax } from "./backrooms-royal-rations.js";
import { getSanityMax } from "./backrooms-death-penalty.js";
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
const AIM_MAX = 4.5;
const GRAVITY_MUL = 1.5;
const MOVE_MUL = 1 / 1.5;
const O2_KEY = "backrooms_l110_o2_used_v1";

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const errorEl = document.getElementById("backroomsError");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const o2RootEl = document.getElementById("l110Oxygen");
const o2ValueEl = document.getElementById("l110OxygenValue");
const o2FillEl = document.getElementById("l110OxygenFill");

const fps = createBackroomsFpsState({
  player: { x: 0, z: 10, radius: 0.32, speed: 4.2 * MOVE_MUL },
});
const _survCtx = { sprinting: false, sanityDrainPerSec: 0.04 };
const _physOpts = { gravity: DEFAULT_GRAVITY * GRAVITY_MUL, ceilingY: 4.4 };

let renderer;
let scene;
let camera;
let survival;
let world;
let currentAimPick = null;
let transitionLock = false;
let elapsed = 0;
let oxygen = 100;
let o2Refilled = false;
let pullWarnShown = false;
/** @type {{ x: number, z: number, strength: number } | null} */
let camPull = null;

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 110 无法启动</strong></p><p>" + String(text) + "</p>";
}

function resolveInteract() {
  return currentAimPick && currentAimPick.data ? currentAimPick.data : null;
}

function updateAim() {
  currentAimPick = camera
    ? pickCrosshairInteract(camera, world.interactRoots, AIM_MAX, null)
    : null;
}

function updateO2Hud() {
  if (o2ValueEl) o2ValueEl.textContent = String(Math.round(oxygen)) + "%";
  if (o2FillEl) o2FillEl.style.width = Math.max(0, Math.min(100, oxygen)) + "%";
  if (o2RootEl) o2RootEl.classList.toggle("l110-o2--critical", oxygen <= 20);
}

function updateUi() {
  var data = resolveInteract();
  var hidden = isInventoryOpen() || !survival || survival.dead;
  if (doorHintEl) {
    doorHintEl.hidden = hidden || !data;
    if (!hidden && data) {
      var actionHint =
        data.action === "refill_o2"
          ? "按 <kbd>Q</kbd> 补充氧气"
          : data.action === "particle_return"
            ? "按 <kbd>Q</kbd> 启动粒子对返航"
            : "按 <kbd>Q</kbd> 检查装置";
      doorHintEl.innerHTML = data.label + " · " + actionHint;
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", hidden);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
  updateO2Hud();
}

function hasUsedO2() {
  try {
    return sessionStorage.getItem(O2_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function markO2Used() {
  try {
    sessionStorage.setItem(O2_KEY, "1");
  } catch (err) {
    /* ignore */
  }
}

function refillOxygen() {
  if (o2Refilled || hasUsedO2()) {
    showToast("气闸补给已耗尽。", 2200);
    return;
  }
  oxygen = 100;
  o2Refilled = true;
  markO2Used();
  showToast("密封服氧气已充满。", 2600);
  updateO2Hud();
}

function exitToL1MegBase() {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  applyL110HalfCaps(survival, getHpMax, getStaminaMax, getSanityMax);
  saveBackroomsSurvival(survival);
  grantLevelPass("clip", fps.yaw, { noEscape: true });
  setL110MegExitFlag();
  queueEnterLevelBanner("Level 1 · M.E.G. 基地");
  showToast("正粒子逃脱，反粒子坠入视界。你留下了另一半。", 4200);
  window.setTimeout(function () {
    window.location.href = "backrooms-level1.html";
  }, 900);
}

function useInteract(data) {
  if (!data || transitionLock || !survival || survival.dead) return;
  if (data.action === "refill_o2") {
    refillOxygen();
    return;
  }
  if (data.action === "particle_return") {
    exitToL1MegBase();
    return;
  }
  if (data.action === "plasma_vent") {
    showToast("喷口在积蓄电弧。离远一点。", 2400);
    return;
  }
  showToast(data.label || "未知装置。", 2000);
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  useInteract(resolveInteract());
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    onTapInteract: tryQAction,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 5.2 / GRAVITY_MUL);
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
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function updateRuptures(dt) {
  camPull = null;
  if (!world || !survival || survival.dead) return;
  var px = fps.player.x;
  var pz = fps.player.z;
  var nearCold = false;
  for (var i = 0; i < world.ruptures.length; i++) {
    var r = world.ruptures[i];
    var dist = Math.hypot(px - r.x, pz - r.z);
    if (dist < r.killR) {
      showToast("裂口把你拽进真空。", 2800);
      survival.takeDamage(9999);
      return;
    }
    if (dist < r.pullR) {
      var strength = 1 - dist / r.pullR;
      var pull = strength * 2.8 * dt;
      var dx = r.x - px;
      var dz = r.z - pz;
      var len = Math.hypot(dx, dz) || 1;
      fps.player.x += (dx / len) * pull;
      fps.player.z += (dz / len) * pull;
      camPull = { x: dx / len, z: dz / len, strength: strength };
      nearCold = true;
      if (!pullWarnShown) {
        pullWarnShown = true;
        showToast("裂口引力在拉扯你。快后退！", 2600);
      }
      oxygen = Math.max(0, oxygen - 8 * dt);
    } else if (dist < r.warnR) {
      nearCold = true;
      oxygen = Math.max(0, oxygen - 2.5 * dt);
    }
  }
  updateBackroomsColdDamage(survival, dt, nearCold);
}

function updatePlasma(dt) {
  if (!world || !survival || survival.dead) return;
  for (var i = 0; i < world.plasmaVents.length; i++) {
    var vent = world.plasmaVents[i];
    var dist = Math.hypot(fps.player.x - vent.x, fps.player.z - vent.z);
    if (vent.cool > 0) {
      vent.cool -= dt;
      continue;
    }
    if (dist < 5.5) {
      vent.charge += dt;
      if (vent.charge > 1.4 && !vent.firing) {
        vent.firing = true;
        showToast("等离子体喷发！", 1800);
      }
      if (vent.firing && dist < 2.6) {
        survival.takeDamage(28 * dt);
        survival.sanity = Math.max(0, survival.sanity - 10 * dt);
      }
      if (vent.charge > 2.8) {
        vent.charge = 0;
        vent.firing = false;
        vent.cool = 4.5;
      }
    } else {
      vent.charge = Math.max(0, vent.charge - dt * 0.6);
      vent.firing = false;
    }
  }
}

function updateOxygen(dt, sprinting) {
  if (!survival || survival.dead) return;
  oxygen = Math.max(0, oxygen - (sprinting ? 3.2 : 1.1) * dt);
  if (oxygen <= 0) {
    survival.takeDamage(6 * dt);
    survival.sanity = Math.max(0, survival.sanity - 4 * dt);
  }
}

function init() {
  if (!enforceLevelEntry("l110", function (yaw) {
    fps.yaw = yaw;
  })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l110", showToast);
  o2Refilled = hasUsedO2();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050c);
  scene.fog = new THREE.FogExp2(0x02050c, 0.012);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 260);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildLevel110World(root);
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "l110" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智（无法抵消真空失温）");
    },
  });
  initBackroomsTemperature("l110", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "密封服运行中 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · 远离管壁裂口";
  }
  bindControls();
  showToast("应急密封模式启动。这里没有星光，只有视界。", 4800);
  updateO2Hud();
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    world.update(elapsed);

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(
          nx,
          nz,
          fps.player.radius,
          world.colliders,
          12
        );
      });
    }

    updateOxygen(dt, sprinting);
    updateRuptures(dt);
    updatePlasma(dt);
    updateAim();
    updateUi();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (camPull) {
      var sway = camPull.strength * 0.12;
      camera.position.x += camPull.x * sway;
      camera.position.z += camPull.z * sway;
      camera.rotation.z = camPull.strength * 0.04 * Math.sin(elapsed * 9);
    } else {
      camera.rotation.z = 0;
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
  console.error("[Level 110]", err);
  showError(err.message || String(err));
}

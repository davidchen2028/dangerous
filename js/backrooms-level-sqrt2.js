/**
 * Backrooms Level √2 — 深入现实的数学幻梦。青色纤维网，黄节点，非欧几里得。
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
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
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
  SQRT2_CEILING,
  SQRT2_SHIFT_SEC,
  SQRT2_SPAWN,
} from "./backrooms-level-sqrt2-layout.js";
import { buildSqrt2World, retargetSqrt2Nodes, updateSqrt2World } from "./backrooms-level-sqrt2-world.js?v=3";
import {
  bindSqrt2AudioOnGesture,
  startSqrt2Audio,
  stopSqrt2Audio,
  updateSqrt2Audio,
} from "./backrooms-level-sqrt2-audio.js?v=1";

const EYE_HEIGHT = 1.62;
const AIM_MAX = 3.8;
const FOG = 0x041018;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");

const _survCtx = { sprinting: false, sanityDrainPerSec: 0.045 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: SQRT2_CEILING, floorY: 0.08 };
const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: SQRT2_SPAWN.x, z: SQRT2_SPAWN.z, radius: 0.32, speed: 3.55 },
});

let renderer = null;
let camera = null;
let scene = null;
let world = null;
let survival = null;
let currentAimPick = null;
let transitionLock = false;
let shiftTimer = 0;
let shifting = false;
let shiftScale = 1;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level √2 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2800 });
}

function syncHint() {
  if (!hintEl) return;
  hintEl.innerHTML = shifting
    ? "坐标平面正在改写……跟着黄点走"
    : "青色纤维网 · 黄节点 · 找到任意一扇门 · <kbd>WASD</kbd> · <kbd>Q</kbd> · <kbd>B</kbd>";
}

function exitToUncomputed() {
  if (transitionLock) return;
  transitionLock = true;
  stopSqrt2Audio();
  showToast("门后是尚未计算之物…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l0", fps.yaw);
  queueEnterLevelBanner("Level 0");
  window.setTimeout(function () {
    window.location.href = "backrooms-level0.html";
  }, 550);
}

function maybeTouchExit() {
  if (transitionLock || !world || !world.door || !survival || survival.dead) return;
  var dx = fps.player.x - world.door.position.x;
  var dz = fps.player.z - world.door.position.z;
  if (dx * dx + dz * dz < 1.05 * 1.05) exitToUncomputed();
}

function interact() {
  if (transitionLock || !survival || survival.dead || isInventoryOpen() || isTaskUiOpen()) return;
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (!data) return;
  if (data.kind === "sqrt2_exit") exitToUncomputed();
}

function refreshAim() {
  if (!camera || isInventoryOpen() || !interactRoots.length) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function updateInteractUi() {
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  var hidden = isInventoryOpen() || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) interactHintEl.innerHTML = "一扇未计算的门 · 按 <kbd>Q</kbd>";
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
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
    onTapInteract: interact,
    onJump: function () {
      if (transitionLock) return;
      tryBackroomsJump(fps, 7.4);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        interact();
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
      !enforceLevelEntry("sqrt2", function (yaw) {
        if (Number.isFinite(yaw)) fps.yaw = yaw;
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
  markLevelEntered("sqrt2", showToast);
  fps.feetY = 0.08;
  fps.grounded = true;
  if (!Number.isFinite(fps.yaw)) fps.yaw = 0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 4, 18);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 48);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevelSqrt2";
  scene.add(root);
  world = buildSqrt2World(root, {
    gfxLow: gfx.tier === "low",
    colliders: colliders,
    interactRoots: interactRoots,
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
      showToast("数字在杏仁水里溶开。");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "sqrt2" };
  });
  initBackroomsTemperature("sqrt2", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  syncHint();
  bindSqrt2AudioOnGesture();
  bindControls();
  window.addEventListener("pagehide", stopSqrt2Audio);
  showToast("青色纤维网从中心的黄点伸开。不要离开我。");

  try {
    var debugFlag = new URLSearchParams(window.location.search).get("debug") || "";
    if (debugFlag === "1" || debugFlag === "exit") {
      window.__sqrt2Debug = {
        lookAtDoor: function () {
          if (!world || !world.door) return { aim: null };
          var door = world.door.position;
          var len = Math.hypot(door.x, door.z) || 1;
          fps.player.x = door.x - (door.x / len) * 1.45;
          fps.player.z = door.z - (door.z / len) * 1.45;
          fps.yaw = Math.atan2(-(door.x - fps.player.x), -(door.z - fps.player.z));
          fps.pitch = 0.08;
          applyBackroomsCamera(fps, camera, EYE_HEIGHT);
          refreshAim();
          updateInteractUi();
          return window.__sqrt2Debug.state();
        },
        state: function () {
          var data = currentAimPick && currentAimPick.data ? currentAimPick.data : null;
          var door = world && world.door ? world.door.position : null;
          return {
            errorHidden: !errorEl || errorEl.hidden,
            error: errorEl ? errorEl.textContent : "",
            hint: hintEl ? hintEl.textContent : "",
            nodes: world && world.nodes ? world.nodes.length : 0,
            x: fps.player.x,
            z: fps.player.z,
            doorX: door ? door.x : null,
            doorZ: door ? door.z : null,
            aim: data ? data.kind : null,
            dist: currentAimPick ? currentAimPick.distance : null,
          };
        },
      };
      window.setTimeout(function () {
        if (debugFlag === "exit") window.__sqrt2Debug.lookAtDoor();
        document.body.dataset.sqrt2 = JSON.stringify(window.__sqrt2Debug.state());
      }, 700);
    }
  } catch (_dbg) {}

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var time = now * 0.001;
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    shiftTimer += dt;
    if (!shifting && shiftTimer >= SQRT2_SHIFT_SEC) {
      shifting = true;
      shiftTimer = 0;
      shiftScale = 0.82 + Math.random() * 0.4;
      retargetSqrt2Nodes(world, shiftScale);
      showToast("孪生素数般的改写开始了。");
      syncHint();
    } else if (shifting && shiftTimer >= 2.4) {
      shifting = false;
      shiftTimer = 0;
      syncHint();
    }

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = shifting ? 0.07 : 0.04;
      survival.update(dt, _survCtx);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 50);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAim();
    updateInteractUi();
    maybeTouchExit();
    updateSqrt2World(world, dt, time, shifting);
    updateSqrt2Audio(now, shifting);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms √2]", err);
  showError(err.message || String(err));
}

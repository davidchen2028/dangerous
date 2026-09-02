/**
 * Ray Complex-2.1 — 五条失稳衍射光路。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import { loadBackroomsSurvival, saveBackroomsSurvival, registerBackroomsSurvivalPersist } from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import { initBackroomsTemperature, updateBackroomsTemperature, updateBackroomsHeatDamage } from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { resolveBackroomsGfxProfile, applyBackroomsRendererSize, applyBackroomsToneMapping } from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { buildLevelC21World, isOnRayComplexPath, C21_PATH_MIN_Z, C21_PATH_MAX_Z } from "./backrooms-level-c2-1-world.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.5;
const C2_ENTRY_KEY = "backrooms_c2_entry_v1";
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
const fps = createBackroomsFpsState({ player: { x: 10, z: 16, radius: 0.32, speed: 4.2 } });
const _survCtx = { sprinting: false, sanityDrainPerSec: 0.025 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 20 };
let renderer;
let scene;
let camera;
let survival;
let world;
let currentAimPick = null;
let transitionLock = false;
let voidExposure = 0;
let elapsed = 0;

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Ray Complex-2.1 无法启动</strong></p><p>" + String(text) + "</p>";
}

function resolveInteract() {
  return currentAimPick && currentAimPick.data ? currentAimPick.data : null;
}

function updateAim() {
  currentAimPick = camera ? pickCrosshairInteract(camera, world.interactRoots, AIM_MAX, null) : null;
}

function updateUi() {
  var data = resolveInteract();
  var hidden = isInventoryOpen() || !survival || survival.dead;
  if (doorHintEl) {
    doorHintEl.hidden = hidden || !data;
    if (!hidden && data) doorHintEl.innerHTML = data.label + " · 按 <kbd>Q</kbd> 沿光路行进";
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", hidden);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function returnToC2() {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  try {
    sessionStorage.setItem(C2_ENTRY_KEY, "phoropter");
  } catch (err) {
    /* ignore */
  }
  grantLevelPass("c2", fps.yaw);
  queueEnterLevelBanner("Level C-2 · 视 · 界");
  showToast("逆向光路把你送回失效的验光机。");
  window.setTimeout(function () { window.location.href = "backrooms-level-c2.html"; }, 600);
}

function annihilate(reason) {
  if (!survival || survival.dead || transitionLock) return;
  transitionLock = true;
  showToast(reason || "你的波长在光路中耗散。光子湮灭。", 4300);
  canvas.style.transition = "filter 1.2s, opacity 1.2s";
  canvas.style.filter = "grayscale(1) brightness(2)";
  canvas.style.opacity = "0.05";
  survival.takeDamage(9999);
}

function usePath(data) {
  if (!data || transitionLock || !survival || survival.dead) return;
  if (data.action === "annihilate") {
    annihilate("悬空群山吸收了剩余波长。你在中央明纹中湮灭。");
    return;
  }
  if (data.action === "return") {
    returnToC2();
    return;
  }
  var labels = {
    c666: "幻灯片仍未成像：通往 Level C-666 的光路尚未接通。",
    c5: "鲜艳色彩拒绝了当前光子：通往 Level C-5 的光路尚未接通。",
    c33: "海洋叠加态失稳：通往 Level C-33 的光路尚未接通。",
  };
  showToast(labels[data.dest] || "这条衍射光路尚未稳定。", 4200);
  fps.player.z = -18;
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  usePath(resolveInteract());
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    onTapInteract: tryQAction,
    shouldBlockPointerLock: function () { return isInventoryOpen() || isTaskUiOpen(); },
    onJump: function () { tryBackroomsJump(fps, 6.5); },
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

function init() {
  if (!enforceLevelEntry("c2_1", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c2_1", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000107);
  scene.fog = new THREE.FogExp2(0x000107, 0.018);
  camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 100);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  scene.add(root);
  world = buildLevelC21World(root);
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () { return { level: "c2_1" }; });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () { showToast("杏仁水 · +15 血量 · +25 理智"); },
  });
  initBackroomsTemperature("c2_1", { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) hintEl.innerHTML = "五条衍射明纹 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 沿光路行进 · 不要踏入黑暗";
  bindControls();
  showToast("偏振片夺走了绝大部分色彩。选择一条光路。", 4800);
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
      var speedMul = survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return { x: nx, z: nz };
      });
    }

    var insideLongSection = fps.player.z < 12 && fps.player.z > C21_PATH_MIN_Z - 2;
    var outsidePath = insideLongSection && !isOnRayComplexPath(fps.player.x);
    if (fps.player.z > C21_PATH_MAX_Z + 2 || fps.player.z < C21_PATH_MIN_Z - 2 || Math.abs(fps.player.x) > 16) outsidePath = true;
    voidExposure = Math.max(0, voidExposure + (outsidePath ? dt : -dt * 2));
    if (voidExposure > 1.1) annihilate("你没有沿任何 Ray Complex 行进。虚空吞没了光子；C-24 的光路尚未成形。");

    updateAim();
    updateUi();
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
  console.error("[Ray Complex-2.1]", err);
  showError(err.message || String(err));
}

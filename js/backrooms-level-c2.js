/**
 * Level C-2「视 · 界」— 无实体的二维景观与失效验光机。
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
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { buildLevelC2World, C2_WALL_HEIGHT } from "./backrooms-level-c2-world.js";
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
const AIM_MAX = 4.2;
const C2_ENTRY_KEY = "backrooms_c2_entry_v1";
const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const fps = createBackroomsFpsState({ player: { x: 0, z: 13, radius: 0.34, speed: 4 } });
const _survCtx = { sprinting: false, sanityDrainPerSec: 0 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: C2_WALL_HEIGHT };
let renderer;
let scene;
let camera;
let survival;
let world;
let currentAimPick = null;
let transitionLock = false;
let sceneryFocus = 0;

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level C-2 无法启动</strong></p><p>" + String(text) + "</p>";
}

function resolveInteract() {
  if (currentAimPick && currentAimPick.data) return currentAimPick.data;
  // 墙洞和门的触发体很薄；玩家贴到墙边后相机会进入 pick box，
  // 墙体遮挡射线可能让提示闪一下便消失。近距离时允许直接交互。
  if (!world) return null;
  for (var i = 0; i < world.interactRoots.length; i++) {
    var root = world.interactRoots[i];
    var dx = fps.player.x - root.position.x;
    var dz = fps.player.z - root.position.z;
    if (Math.hypot(dx, dz) <= 1.75) return root.userData.brInteract || null;
  }
  return null;
}

function updateAim() {
  if (!camera || !world) return;
  var ray = getCameraAimRay(camera, AIM_MAX);
  var block = raycastWallBlockDistance(ray.origin, ray.direction, AIM_MAX, world.colliders, 0, C2_WALL_HEIGHT);
  currentAimPick = pickCrosshairInteract(camera, world.interactRoots, AIM_MAX, block);
}

function updateInteractUi() {
  var data = resolveInteract();
  var hidden = isInventoryOpen() || !survival || survival.dead;
  var text = "";
  if (!hidden && data) {
    if (data.kind === "c2_phoropter") text = "失效的验光机 · 按 <kbd>Q</kbd> 沿偏振光前进";
    if (data.kind === "c2_peephole") text = "墙洞后的黄墙纸 · 按 <kbd>Q</kbd> 切回 C-1";
    if (data.kind === "c2_red_house") text = "有厚度的红瓦房 · 按 <kbd>Q</kbd> 推门";
  }
  if (doorHintEl) {
    doorHintEl.hidden = !text;
    if (text) doorHintEl.innerHTML = text;
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", hidden);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function goTo(levelId, page, label, text) {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelBanner(label);
  showToast(text);
  window.setTimeout(function () { window.location.href = page; }, 520);
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (!data) return;
  if (data.kind === "c2_phoropter") {
    goTo("c2_1", "backrooms-level-c2-1.html", "Ray Complex-2.1", "偏振片夺走了视野里的颜色……");
  } else if (data.kind === "c2_peephole") {
    goTo("c1", "backrooms-level-c1.html", "Level C-1 · 交点", "你贴近墙洞，从黄墙纸的另一侧切了出去。");
  } else if (data.kind === "c2_red_house") {
    fps.player.x = 0;
    fps.player.z = 13;
    fps.yaw += Math.PI;
    sceneryFocus = Math.max(sceneryFocus, 1.5);
    showToast("门后仍是视界。房屋像一张画片折回了原处。", 3800);
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    onTapInteract: tryQAction,
    shouldBlockPointerLock: function () { return isInventoryOpen() || isTaskUiOpen(); },
    onJump: function () { tryBackroomsJump(fps, 7); },
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

function initSurvival() {
  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () { return { level: "c2" }; });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () { showToast("杏仁水 · +15 血量 · +25 理智"); },
  });
}

function init() {
  if (!enforceLevelEntry("c2", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c2", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8c8cf);
  scene.fog = new THREE.Fog(0xb8c8cf, 18, 58);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 100);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  scene.add(root);
  world = buildLevelC2World(root);
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;
  try {
    if (sessionStorage.getItem(C2_ENTRY_KEY) === "phoropter") {
      fps.player.x = -13;
      fps.player.z = -8.5;
      fps.yaw = 0;
    }
    sessionStorage.removeItem(C2_ENTRY_KEY);
  } catch (err) {
    /* ignore */
  }
  initSurvival();
  initBackroomsTemperature("c2", { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) hintEl.innerHTML = "视 · 界 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · <kbd>B</kbd> 背包 · 不要相信远处的纵深";
  bindControls();
  window.setTimeout(function () { showToast("炫彩的光在这里失去复杂。远景薄得像贴在玻璃上。", 4800); }, 700);
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    // 玩家位于北半区且面向假景时，视界逐渐发生红绿分离。
    var facingScenery = fps.player.z < 5 && Math.cos(fps.yaw) > 0.45;
    sceneryFocus = Math.max(0, Math.min(8, sceneryFocus + (facingScenery ? dt : -dt * 1.6)));
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = sceneryFocus > 1 ? 0.04 + sceneryFocus * 0.035 : 0.01;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var speedMul = survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, world.colliders, 8);
      });
    }
    updateAim();
    updateInteractUi();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    var split = Math.max(0, sceneryFocus - 1) * 0.35;
    canvas.style.filter = split > 0 ? "saturate(" + (1 + split * 0.15) + ") contrast(" + (1 + split * 0.04) + ") hue-rotate(" + Math.sin(now * 0.003) * split + "deg)" : "";
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-2]", err);
  showError(err.message || String(err));
}

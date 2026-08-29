/**
 * Backrooms Level 8 — 巨型洞穴
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  addFireSalt,
  countUsedSlots,
  removeRandomItems,
  BACKPACK_CAPACITY,
} from "./backrooms-inventory.js";
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
  getNightVisionRemainingMs,
} from "./backrooms-night-vision.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { buildLevel8World, L8_WALL_H } from "./backrooms-level8-world.js?v=2";
import { createLevel8Chickens } from "./backrooms-level8-chickens.js";
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

const AIM_MAX = 5;
const EYE_HEIGHT = 1.65;
const JUMP_SPEED = 8;
const FOG_COLOR = 0x080a0d;
const FOG_DENSITY = 0.025;
const NV_FOG_COLOR = 0x3a4a58;
const NV_FOG_DENSITY = 0.012;
const FIRE_SALT_REWARD_KEY = "backrooms_l8_fire_salt_reward_v1";
/** 到访标记：M.E.G 基地火盐补给员据此出现 */

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let camera = null;
let scene = null;
let world = null;
let survival = null;
let interactRoots = [];
let currentAimPick = null;
let transitionLock = false;
let lootToastUntil = 0;
let caveChickens = null;
let firesalt = null;
let lastNightVisionApplied = null;
let lastNvHintSec = -1;
const wallColliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.15 },
});

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: L8_WALL_H,
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 8 无法启动</strong></p><p>" + msg + "</p>";
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
  lootToastUntil = performance.now() + 2600;
  if (lootToastEl) lootToastEl.hidden = false;
}

function enforceEntryOrRedirect() {
  try {
    if (!enforceLevelEntry("l8", function (yaw) { fps.yaw = yaw; })) {
      window.location.replace("backrooms-level0.html");
      return false;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 8 巨型洞穴 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包" +
    nv;
}

/** session 内夜视计时跨关继承；此处只负责 L8 洞穴视觉提亮 */
function applyLevel8NightVision(active) {
  if (!scene || !world || !world.lighting) return;
  if (active === lastNightVisionApplied) return;
  lastNightVisionApplied = active;
  var L = world.lighting;
  var mats = L.materials;
  if (active) {
    scene.background.setHex(NV_FOG_COLOR);
    if (scene.fog) {
      scene.fog.color.setHex(NV_FOG_COLOR);
      scene.fog.density = NV_FOG_DENSITY;
    }
    L.ambient.color.setHex(0xd0dce6);
    L.ambient.intensity = 0.95;
    L.hemi.color.setHex(0xe8f0f5);
    L.hemi.groundColor.setHex(0x3d5263);
    L.hemi.intensity = 0.55;
    L.entranceLight.intensity = 2.4;
    L.entranceLight.distance = 42;
    L.pitLight.intensity = 1.35;
    L.pitLight.distance = 18;
    mats.darkRock.color.setHex(0x6a727c);
    mats.darkRock.emissive.setHex(0x2a3340);
    mats.darkRock.emissiveIntensity = 0.45;
    mats.midRock.color.setHex(0x7a8490);
    mats.midRock.emissive.setHex(0x303848);
    mats.midRock.emissiveIntensity = 0.4;
    mats.floor.color.setHex(0x5a626c);
    mats.floor.emissive.setHex(0x283038);
    mats.floor.emissiveIntensity = 0.35;
  } else {
    scene.background.setHex(FOG_COLOR);
    if (scene.fog) {
      scene.fog.color.setHex(FOG_COLOR);
      scene.fog.density = FOG_DENSITY;
    }
    L.ambient.color.setHex(0x59616c);
    L.ambient.intensity = 0.32;
    L.hemi.color.setHex(0x6a7480);
    L.hemi.groundColor.setHex(0x1a1410);
    L.hemi.intensity = 0.22;
    L.entranceLight.intensity = 1.5;
    L.entranceLight.distance = 30;
    L.pitLight.intensity = 0.75;
    L.pitLight.distance = 13;
    mats.darkRock.color.setHex(0x25272a);
    mats.darkRock.emissive.setHex(0x000000);
    mats.darkRock.emissiveIntensity = 0;
    mats.midRock.color.setHex(0x35383c);
    mats.midRock.emissive.setHex(0x000000);
    mats.midRock.emissiveIntensity = 0;
    mats.floor.color.setHex(0x191b1e);
    mats.floor.emissive.setHex(0x000000);
    mats.floor.emissiveIntensity = 0;
  }
}

function refreshAimPick() {
  if (!camera || isInventoryOpen() || !survival || survival.dead) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_MAX);
  var block = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_MAX,
    wallColliders,
    0,
    L8_WALL_H
  );
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX, block);
}

function resolveInteract() {
  if (currentAimPick && currentAimPick.distance <= AIM_MAX) return currentAimPick.data;
  if (world && world.plankZone) {
    var zone = world.plankZone;
    if (
      fps.player.x >= zone.minX &&
      fps.player.x <= zone.maxX &&
      fps.player.z >= zone.minZ &&
      fps.player.z <= zone.maxZ
    ) {
      return { kind: "l8_plank" };
    }
  }
  return null;
}

function interactLabel(data) {
  if (!data) return "";
  if (data.kind === "l8_plank") return "腐朽木板 · 按 <kbd>Q</kbd> 跌穿";
  if (data.kind === "l8_silver_pipe") return "银色管道 · 按 <kbd>Q</kbd> 爬入";
  if (data.kind === "l8_level2_vent") return "足以容身的通风管 · 按 <kbd>Q</kbd> 爬入";
  return "";
}

function updateInteractUi() {
  var data = resolveInteract();
  var hidden = isInventoryOpen() || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) interactHintEl.innerHTML = interactLabel(data);
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen() || !survival || survival.dead);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function exitTo(levelId, levelNumber, page, toast) {
  if (transitionLock) return;
  transitionLock = true;
  var saltAdded = 0;
  var removedItems = [];
  var firstExit = true;
  try {
    firstExit = sessionStorage.getItem(FIRE_SALT_REWARD_KEY) == null;
  } catch (err) {
    firstExit = true;
  }
  if (firstExit) {
    var freeSlots = BACKPACK_CAPACITY - countUsedSlots();
    removedItems = removeRandomItems(Math.max(0, 3 - freeSlots));
    saltAdded = addFireSalt(3);
    try {
      sessionStorage.setItem(FIRE_SALT_REWARD_KEY, "1");
    } catch (err2) {
      /* ignore */
    }
  }
  showLootToast(
    toast +
      (removedItems.length
        ? " · 背包空间不足，随机遗失" + removedItems.length + "件物品"
        : "") +
      (saltAdded > 0
        ? " · 背包里出现了" + saltAdded + "块火盐"
        : "")
  );
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelNumber(levelNumber);
  window.setTimeout(function () {
    window.location.href = page;
  }, 550);
}

function tryQAction() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (!data) return;
  if (data.kind === "l8_plank") {
    exitTo("l9", 9, "backrooms-level9.html", "木板断裂——你跌入了黑暗…");
    return;
  }
  if (data.kind === "l8_silver_pipe") {
    exitTo("l75", 75, "backrooms-level75.html", "你爬进银色管道…");
    return;
  }
  if (data.kind === "l8_level2_vent") {
    exitTo("l2", 2, "backrooms-level2.html", "你挤进石壁上的通风管，前方传来机器的低鸣…");
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () { return isInventoryOpen() || isTaskUiOpen(); },
    onJump: function () { tryBackroomsJump(fps, JUMP_SPEED); },
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
      if ((e.code === "KeyQ" || e.key === "q" || e.key === "Q") && !e.repeat) {
        e.preventDefault();
        tryQAction();
        return true;
      }
      return false;
    },
    onPointerLockChange: syncLookUi,
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  markLevelEntered("l8", showLootToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 110);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildLevel8World(root);
  caveChickens = createLevel8Chickens(root);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showLootToast,
  });
  wallColliders.push.apply(wallColliders, world.colliders);
  interactRoots = world.interactRoots.slice();
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () { showLootToast("杏仁水 · +15 血量 · +25 理智"); },
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) {
        lastNightVisionApplied = null;
        applyLevel8NightVision(true);
        syncLookUi();
      }
    },
  });
  installMegCheckpointDeathHooks(survival, function () { return { level: 8 }; });
  initBackroomsTemperature(8, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  applyLevel8NightVision(isNightVisionActive());
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (lootToastEl && !lootToastEl.hidden && now >= lootToastUntil) lootToastEl.hidden = true;
    var nv = isNightVisionActive();
    applyLevel8NightVision(nv);
    var nvSec = nv ? Math.ceil(getNightVisionRemainingMs() / 1000) : -1;
    if (nvSec !== lastNvHintSec) {
      lastNvHintSec = nvSec;
      syncLookUi();
    }
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = L8_WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders);
      });
    }
    if (caveChickens && !transitionLock) {
      caveChickens.update(dt, fps.player, survival, showLootToast);
    }
    if (firesalt) firesalt.update(dt);
    refreshAimPick();
    updateInteractUi();
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
  console.error("[Backrooms L8]", err);
  showError(err.message || String(err));
}

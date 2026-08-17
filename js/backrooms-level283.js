/**
 * Backrooms Level 283 — 派对房 · 休息区 · 管道 · 海洋球池
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
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import {
  BLOCK_SIZE,
  CHUNK_CELLS,
  MEG_BASE_CHUNK_OFFSET,
  SPAWN_WORLD,
} from "./backrooms-level1-world.js";
import {
  saveMegBaseCheckpoint,
  defaultMegBaseSpawn,
  setL283MegExitFlag,
} from "./backrooms-meg-checkpoint.js";
import {
  buildLevel283World,
  pointInZone,
  L283_WALL_H,
} from "./backrooms-level283-world.js";
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

const ALMOND_KEY = "backrooms_l283_almond_v1";
const TABLE_SEARCH_KEY = "backrooms_l283_tables_v1";
const FOG_COLOR = 0xffeed8;
const FOG_NEAR = 4;
const FOG_FAR = 42;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const PIPE_EYE = 0.42;
const AIM_MAX = 4.2;
const BALL_SINK_RATE = 0.55;
const BALL_SINK_TRIGGER = 1.35;
const BALL_L4_CHANCE = 0.15;

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
/** @type {ReturnType<buildLevel283World> | null} */
let world = null;
const wallColliders = [];
let survival = null;
let lootToastUntil = 0;
let transitionLock = false;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;

/** @type {"walk" | "pipe"} */
let moveMode = "walk";
let pipeCrawlT = 0;
let pipeProgress = 0;
let l8Announced = false;

let ballSinkDepth = 0;
let ballResolved = false;
let inBallPit = false;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.2 },
});

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: L283_WALL_H,
};

function megBaseCenterForExit() {
  var gCol = Math.floor(SPAWN_WORLD.x / BLOCK_SIZE);
  var gRow = Math.floor(SPAWN_WORLD.z / BLOCK_SIZE);
  var cx = Math.floor(gCol / CHUNK_CELLS) + MEG_BASE_CHUNK_OFFSET.cx;
  var cz = Math.floor(gRow / CHUNK_CELLS) + MEG_BASE_CHUNK_OFFSET.cz;
  return {
    x: (cx * CHUNK_CELLS + CHUNK_CELLS * 0.5) * BLOCK_SIZE,
    z: (cz * CHUNK_CELLS + CHUNK_CELLS * 0.5) * BLOCK_SIZE,
  };
}

function almondAlreadyTaken() {
  try {
    return sessionStorage.getItem(ALMOND_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function markAlmondTaken() {
  try {
    sessionStorage.setItem(ALMOND_KEY, "1");
  } catch (err) {
    /* ignore */
  }
}

function getSearchedTables() {
  try {
    var raw = sessionStorage.getItem(TABLE_SEARCH_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function isTableSearched(tableId) {
  return !!getSearchedTables()[String(tableId)];
}

function markTableSearched(tableId) {
  try {
    var map = getSearchedTables();
    map[String(tableId)] = true;
    sessionStorage.setItem(TABLE_SEARCH_KEY, JSON.stringify(map));
  } catch (err) {
    /* ignore */
  }
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 283 无法启动</strong></p><p>" + msg + "</p>";
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
  lootToastUntil = performance.now() + 2600;
  if (lootToastEl) lootToastEl.hidden = false;
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l283", function (y) {
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

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  if (moveMode === "pipe") {
    hintEl.innerHTML =
      "管道爬行 · <kbd>W</kbd>/<kbd>S</kbd> 前进后退 · 退回入口按 <kbd>Q</kbd> 木门 · 爬满 15 秒…" + nv;
    return;
  }
  hintEl.innerHTML =
    "Level 283 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包" +
    nv;
}

function updateLootToast(now) {
  if (!lootToastEl || lootToastEl.hidden) return;
  if (now >= lootToastUntil) lootToastEl.hidden = true;
}

function resolveL283Interact() {
  if (currentAimPick && currentAimPick.distance <= AIM_MAX) {
    return currentAimPick.data;
  }
  return null;
}

function refreshAimPick() {
  if (!camera || moveMode === "pipe") {
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
    L283_WALL_H
  );
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX, block);
}

function interactLabel(data) {
  if (!data) return "";
  if (data.kind === "l283_table") {
    if (isTableSearched(data.tableId)) return "桌子（已搜过）";
    if (almondAlreadyTaken()) return "桌子 · 按 <kbd>Q</kbd> 搜索";
    return "桌子 · 按 <kbd>Q</kbd> 获得杏仁水";
  }
  if (data.kind === "l283_painting") return "小丑画作 · 按 <kbd>Q</kbd> 穿过";
  if (data.kind === "l283_floor_exit") return "休息区地板 · 按 <kbd>Q</kbd> 切出";
  if (data.kind === "l283_pipe_enter") return "管道 · 按 <kbd>Q</kbd> 爬入";
  if (data.kind === "l283_pipe_door") return "木门 · 按 <kbd>Q</kbd> 打开";
  return "";
}

function updateInteractHint() {
  if (!interactHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    interactHintEl.hidden = true;
    return;
  }
  if (moveMode === "pipe" && world) {
    if (pipeProgress <= 2) {
      interactHintEl.innerHTML = "管道口木门 · 按 <kbd>Q</kbd> 打开";
      interactHintEl.hidden = false;
      return;
    }
    interactHintEl.hidden = true;
    return;
  }
  var data = resolveL283Interact();
  if (!data) {
    interactHintEl.hidden = true;
    return;
  }
  var label = interactLabel(data);
  if (!label) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.innerHTML = label;
  interactHintEl.hidden = false;
}

function updateCrosshair() {
  if (!crosshairEl) return;
  var hide = isInventoryOpen() || !survival || survival.dead;
  crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
  crosshairEl.classList.toggle(
    "backrooms-crosshair--interact",
    !hide &&
      (!!resolveL283Interact() || (moveMode === "pipe" && pipeProgress <= 2))
  );
}

function tryTableAlmond(tableId) {
  if (tableId == null) return;
  if (isTableSearched(tableId)) {
    showLootToast("这张桌子已经搜过了");
    return;
  }
  if (almondAlreadyTaken()) {
    markTableSearched(tableId);
    showLootToast("空的");
    return;
  }
  if (!survival) return;
  if (!survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showLootToast("背包已满");
    return;
  }
  markTableSearched(tableId);
  markAlmondTaken();
  showLootToast("获得杏仁水 ×1（本层限一次）");
}

function exitToLevel0() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("l0", fps.yaw);
  grantLevelPass("clip", fps.yaw);
  queueEnterLevelNumber(0);
  window.location.href = "backrooms-level0.html";
}

function exitToMegBase() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("切出休息区 · 前往 M.E.G 基地…");
  saveBackroomsSurvival(survival);
  var center = megBaseCenterForExit();
  var sp = defaultMegBaseSpawn(center);
  saveMegBaseCheckpoint(sp);
  grantLevelPass("clip", sp.yaw);
  setL283MegExitFlag();
  queueEnterLevelNumber(1);
  window.location.href = "backrooms-level1.html";
}

function exitToLevel4() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("l4", fps.yaw);
  queueEnterLevelNumber(4);
  window.location.href = "backrooms-level4.html";
}

function exitToLevel57() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("你穿过了画作…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l57", fps.yaw);
  queueEnterLevelNumber(57);
  window.location.href = "backrooms-level57.html";
}

function exitToLevel8() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("l8", fps.yaw);
  queueEnterLevelNumber(8);
  // 爬满 15 秒立即传送，不再等待 toast/动画延迟
  window.location.href = "backrooms-level8.html";
}

function enterPipeMode() {
  if (!world || moveMode === "pipe") return;
  moveMode = "pipe";
  pipeCrawlT = 0;
  pipeProgress = 0;
  l8Announced = false;
  fps.player.x = world.pipe.startX;
  fps.player.z = world.pipe.startZ;
  fps.feetY = 0;
  fps.velY = 0;
  fps.grounded = true;
  if (world.pipeGroup) world.pipeGroup.visible = true;
  syncLookUi();
  showLootToast("爬进管道 · 退回入口可开木门 · 持续爬行 15 秒…");
}

function leavePipeMode() {
  moveMode = "walk";
  pipeCrawlT = 0;
  if (world && world.pipeGroup) world.pipeGroup.visible = false;
  syncLookUi();
}

function tryWoodDoor() {
  if (!world) return;
  showLootToast("穿过木门…");
  if (moveMode === "pipe") leavePipeMode();
  window.setTimeout(exitToLevel0, 400);
}

function tryPipeDoor() {
  if (!world || moveMode !== "pipe") return;
  if (pipeProgress > 2) return;
  tryWoodDoor();
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;

  if (moveMode === "pipe") {
    tryPipeDoor();
    return;
  }

  var data = resolveL283Interact();
  if (!data) return;
  var k = data.kind;

  if (k === "l283_table") {
    tryTableAlmond(data.tableId);
    return;
  }
  if (k === "l283_painting") {
    exitToLevel57();
    return;
  }
  if (k === "l283_floor_exit") {
    exitToMegBase();
    return;
  }
  if (k === "l283_pipe_enter") {
    enterPipeMode();
    return;
  }
  if (k === "l283_pipe_door") {
    tryWoodDoor();
  }
}

function updateBallPit(dt) {
  if (!world || !survival || survival.dead || moveMode === "pipe") return;

  var px = fps.player.x;
  var pz = fps.player.z;
  inBallPit = pointInZone(world.zones.ballPit, px, pz);

  if (!inBallPit) {
    if (ballSinkDepth > 0) {
      ballSinkDepth = Math.max(0, ballSinkDepth - dt * 1.2);
      fps.feetY = -ballSinkDepth * 0.35;
    }
    if (ballSinkDepth <= 0.01) {
      ballSinkDepth = 0;
      ballResolved = false;
      fps.feetY = 0;
    }
    return;
  }

  var sinking = inBallPit && !ballResolved;
  if (sinking) {
    var rate = fps.grounded ? 1 : 0.7;
    ballSinkDepth += dt * BALL_SINK_RATE * rate;
    fps.feetY = -ballSinkDepth * 0.42;
    fps.velY = Math.min(fps.velY, 0);
    fps.grounded = true;
  }

  if (!ballResolved && ballSinkDepth >= BALL_SINK_TRIGGER) {
    ballResolved = true;
    if (Math.random() < BALL_L4_CHANCE) {
      showLootToast("海洋球深处传来一股强大的拉力！");
      window.setTimeout(exitToLevel4, 700);
    } else {
      showLootToast("海洋球吞噬了你…");
      survival.takeDamage(9999);
    }
  }
}

function updatePipeCrawl(dt) {
  if (!world || moveMode !== "pipe") return;

  var forward = 0;
  if (fps.move.forward) forward += 1;
  if (fps.move.back) forward -= 1;

  pipeProgress += forward * world.pipe.crawlSpeed * dt;
  pipeProgress = Math.max(0, Math.min(world.pipe.length, pipeProgress));
  fps.player.z = world.pipe.startZ + pipeProgress;
  fps.player.x = world.pipe.startX;

  // 进入管道后持续计时，不依赖前进键或当前爬行位置
  pipeCrawlT += dt;

  if (!l8Announced && pipeCrawlT >= world.pipe.l8Seconds) {
    l8Announced = true;
    exitToLevel8();
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
    onJump: function () {
      if (moveMode === "pipe") return;
      tryBackroomsJump(fps, JUMP_SPEED);
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
      if (e.code === "KeyQ" || e.key === "q" || e.key === "Q") {
        if (!e.repeat) {
          e.preventDefault();
          tryQAction();
        }
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
  showEnterLevelBannerIfQueued();
  markLevelEntered("l283", showLootToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildLevel283World(root);
  wallColliders.length = 0;
  var i;
  for (i = 0; i < world.colliders.length; i++) {
    wallColliders.push(world.colliders[i]);
  }
  interactRoots = world.interactRoots.slice();

  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

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
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 283 };
  });

  initBackroomsTemperature(283, {
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
    updateLootToast(now);

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && moveMode === "walk";
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }

    if (moveMode === "pipe") {
      updatePipeCrawl(dt);
      fps.velY = 0;
      fps.grounded = true;
      fps.feetY = 0;
    } else {
      _physOpts.gravity = DEFAULT_GRAVITY;
      _physOpts.ceilingY = L283_WALL_H;
      updateBackroomsPlayerPhysics(fps, dt, _physOpts);
      if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
        var mul =
          survival && sprinting
            ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
            : 1;
        moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
          return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders);
        });
      }
      updateBallPit(dt);
    }

    refreshAimPick();
    updateInteractHint();
    updateCrosshair();
    applyBackroomsCamera(fps, camera, moveMode === "pipe" ? PIPE_EYE : EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    syncLookUi();
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L283]", err);
  showError(err.message || String(err));
}

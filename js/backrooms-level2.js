/**
 * Backrooms Level 2 — 蒸汽管道走廊
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
  addItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  buildBackroomsLevel2World,
  CORRIDOR_HEIGHT,
  SPAWN_Z,
} from "./backrooms-level2-world.js?v=2";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  pickCrosshairInteract,
  getCameraAimRay,
} from "./backrooms-interact-aim.js";
import {
  updateLevel2Doors,
  tryOpenLevel2Door,
  getLevel2DoorTransition,
} from "./backrooms-level2-doors.js?v=2";
import { createLevel2Xiaoye } from "./backrooms-level2-xiaoye.js";
import { createLevel2DeathMoth } from "./backrooms-death-moth.js";
import { createLevel2Clump } from "./backrooms-clump-ai.js";
import { createLevel2Hound } from "./backrooms-level2-hound.js?v=1";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
  getNightVisionRemainingMs,
} from "./backrooms-night-vision.js";
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
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
  syncBackroomsPointerLockBodyClass,
} from "./backrooms-fps-controller.js";

const FOG_COLOR = 0x14141c;
const FOG_NEAR = 4;
const FOG_FAR = 105;

/** 夜视开启时对齐 Level 0/1 可见度 */
const NV_FOG_COLOR = 0x3a4a58;
const NV_FOG_NEAR = 10;
const NV_FOG_FAR = 95;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const LOOK_SENS = 0.0022;
const MOBILE_LOOK_SENS_MULT = 1.35;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

const AIM_INTERACT_MAX = 4.2;
const AIM_DOOR_MAX = 3.4;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: CORRIDOR_HEIGHT,
};

let renderer = null;
let camera = null;
let scene = null;
const wallColliders = [];
let survival = null;

const fps = createBackroomsFpsState({
  player: { x: 0, z: SPAWN_Z, radius: 0.34, speed: 4.2 },
});

let level2Lighting = null;
/** @type {ReturnType<buildBackroomsLevel2World> | null} */
let level2World = null;
/** @type {{ key: THREE.PointLight, fill: THREE.PointLight } | null} */
let playerFollowLights = null;
let lootToastUntil = 0;
let lastNightVisionApplied = false;
let lastNvHintSec = -1;

let level2Doors = null;
let interactRoots = [];
/** @type {ReturnType<createLevel2Xiaoye> | null} */
let level2Xiaoye = null;
/** @type {ReturnType<createLevel2DeathMoth> | null} */
let level2DeathMoth = null;
/** @type {ReturnType<createLevel2Clump> | null} */
let level2Clump = null;
/** @type {ReturnType<createLevel2Hound> | null} */
let level2Hound = null;
let firesalt = null;
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let transitionLock = false;
let level2Environment = {
  blackout: false,
  steamDanger: false,
  sanityDrainPerSec: 0,
  movementMultiplier: 1,
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 2 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceLevel2EntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l2", function (y) {
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

function initSurvivalHud() {
  survival = new BackroomsSurvival();
  var hudHost = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(hudHost);
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
      if (useNightVisionPotionFromBackpack()) {
        showLootToast("夜视药水 · 5 分钟夜视");
        lastNightVisionApplied = false;
        applyLevel2NightVisionLighting(true);
        syncLookUi();
      }
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化 · 150 血 / 200 体");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 2 };
  });
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { updateSteamHungerClip } from "./backrooms-c1299-steam.js";

function showLootToast(text, durationMs) {
  var duration = durationMs != null ? durationMs : 2200;
  showBackroomsLootToast(text, { durationMs: duration });
  lootToastUntil = performance.now() + duration;
}

function updateAimPick() {
  if (!camera || !interactRoots.length) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    wallColliders,
    0,
    CORRIDOR_HEIGHT
  );
  currentAimPick = pickCrosshairInteract(
    camera,
    interactRoots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function isAimL2Door() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l2_door") return false;
  return currentAimPick.distance <= AIM_DOOR_MAX;
}

function getAimDoorId() {
  if (!isAimL2Door()) return null;
  return currentAimPick.data.doorId;
}

function tryDoorQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var id = getAimDoorId();
  if (!id) {
    if (level2World && currentAimPick && currentAimPick.data) {
      level2World.interact(currentAimPick.data, {
        showToast: showLootToast,
        grantItem: function (itemId, amount, info) {
          var count = Math.max(1, amount || 1);
          for (var i = 0; i < count; i++) {
            if (
              !addItem({
                id: itemId,
                name: (info && info.itemName) || "工业维修补给",
              })
            ) {
              return false;
            }
          }
          return true;
        },
        onDamage: function (amount) {
          survival.takeDamage(amount);
        },
      });
    }
    return;
  }
  if (!level2Doors) return;
  if (id === "l283") {
    if (tryOpenLevel2Door(level2Doors, id)) {
      showLootToast("彩色门已打开 · 可以穿过");
    }
    return;
  }
  if (tryOpenLevel2Door(level2Doors, id)) {
    showLootToast("未上锁的门已打开 · 穿过进入");
  }
}

function updateDoorHint() {
  if (!doorHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    doorHintEl.hidden = true;
    return;
  }
  var id = getAimDoorId();
  if (!id) {
    var worldHint =
      level2World && currentAimPick
        ? level2World.getInteractionHint(currentAimPick.data)
        : "";
    if (worldHint) {
      doorHintEl.innerHTML = worldHint.replace("按 Q", '按 <kbd>Q</kbd>');
      doorHintEl.hidden = false;
    } else {
      doorHintEl.hidden = true;
    }
    return;
  }
  if (!level2Doors || (level2Doors[id] && level2Doors[id].open)) {
    doorHintEl.hidden = true;
    return;
  }
  if (id === "l283") {
    doorHintEl.innerHTML = '彩色门 · 按 <kbd>Q</kbd> 打开';
  } else {
    doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开未上锁的门';
  }
  doorHintEl.hidden = false;
}

function tryLevelTransition() {
  if (transitionLock || !level2Doors) return;
  var dest = getLevel2DoorTransition(level2Doors, fps.player.x, fps.player.z);
  if (!dest) return;
  transitionLock = true;
  try {
    saveBackroomsSurvival(survival);
    if (dest === "l1") {
      grantLevelPass("l1", fps.yaw);
      queueEnterLevelNumber(1);
      window.location.href = "backrooms-level1.html";
    } else if (dest === "l4") {
      grantLevelPass("l4", fps.yaw);
      queueEnterLevelNumber(4);
      window.location.href = "backrooms-level4.html";
    } else if (dest === "l3") {
      grantLevelPass("l3", fps.yaw);
      queueEnterLevelNumber(3);
      window.location.href = "backrooms-level3.html";
    } else if (dest === "l283") {
      grantLevelPass("l283", fps.yaw);
      queueEnterLevelNumber(283);
      window.location.href = "backrooms-level283.html";
    }
  } catch (err) {
    transitionLock = false;
  }
}

function updateLootToast(now) {
  if (!lootToastEl || lootToastEl.hidden) return;
  if (now >= lootToastUntil) lootToastEl.hidden = true;
}

function createPlayerFollowLights(parent) {
  // 仅 2 盏真光源跟随玩家，替代走廊上几十盏装饰 PointLight
  var key = new THREE.PointLight(0xffe8b8, 1.05, 11, 1.55);
  var fill = new THREE.PointLight(0xb8c4d8, 0.32, 7.5, 1.75);
  parent.add(key);
  parent.add(fill);
  return { key: key, fill: fill };
}

function syncPlayerFollowLights() {
  if (!playerFollowLights) return;
  var eyeY = fps.feetY + EYE_HEIGHT;
  playerFollowLights.key.position.set(fps.player.x, eyeY + 0.12, fps.player.z);
  playerFollowLights.fill.position.set(fps.player.x, eyeY + 0.85, fps.player.z);
}

function applyLevel2EnvironmentLighting(nightVision, environment) {
  if (!playerFollowLights || nightVision) return;
  var dark = !!(environment && environment.blackout);
  playerFollowLights.key.intensity = dark ? 0.07 : 1.05;
  playerFollowLights.key.distance = dark ? 3.2 : 11;
  playerFollowLights.fill.intensity = dark ? 0.025 : 0.32;
  playerFollowLights.fill.distance = dark ? 2.2 : 7.5;
}

function applyLevel2NightVisionLighting(active) {
  if (!scene || !level2Lighting) return;
  if (active === lastNightVisionApplied) return;
  lastNightVisionApplied = active;
  var L = level2Lighting;
  if (active) {
    scene.background.setHex(NV_FOG_COLOR);
    scene.fog.color.setHex(NV_FOG_COLOR);
    scene.fog.near = NV_FOG_NEAR;
    scene.fog.far = NV_FOG_FAR;
    L.ambient.color.setHex(0xd0dce6);
    L.ambient.intensity = 1.05;
    L.fill.color.setHex(0xe8f0f5);
    L.fill.groundColor.setHex(0x3d5263);
    L.fill.intensity = 0.55;
    if (playerFollowLights) {
      playerFollowLights.key.intensity = 1.7;
      playerFollowLights.key.distance = 16;
      playerFollowLights.fill.intensity = 0.55;
      playerFollowLights.fill.distance = 11;
    }
    L.materials.wall.color.setHex(0x9aa4ae);
    L.materials.wall.emissive.setHex(0x4a5560);
    L.materials.wall.emissiveIntensity = 0.55;
    L.materials.floor.color.setHex(0x8a9098);
    L.materials.floor.emissive.setHex(0x383840);
    L.materials.floor.emissiveIntensity = 0.35;
    L.materials.ceil.color.setHex(0x889098);
    L.materials.ceil.emissive.setHex(0x303038);
    L.materials.pipe.color.setHex(0x6a7078);
    L.materials.pipe.emissive.setHex(0x282830);
    L.materials.lamp.emissiveIntensity = 1.9;
    if (L.steamHaze.material) L.steamHaze.material.opacity = 0.02;
  } else {
    scene.background.setHex(FOG_COLOR);
    scene.fog.color.setHex(FOG_COLOR);
    scene.fog.near = FOG_NEAR;
    scene.fog.far = FOG_FAR;
    L.ambient.color.setHex(0x2a2a38);
    L.ambient.intensity = 0.78;
    L.fill.color.setHex(0x3a3a50);
    L.fill.groundColor.setHex(0x0a0a10);
    L.fill.intensity = 0.4;
    if (playerFollowLights) {
      playerFollowLights.key.intensity = 1.05;
      playerFollowLights.key.distance = 11;
      playerFollowLights.fill.intensity = 0.32;
      playerFollowLights.fill.distance = 7.5;
    }
    L.materials.wall.color.setHex(0x3a3a44);
    L.materials.wall.emissive.setHex(0x181820);
    L.materials.wall.emissiveIntensity = 0.35;
    L.materials.floor.color.setHex(0x2a2a32);
    L.materials.floor.emissive.setHex(0x0c0c10);
    L.materials.floor.emissiveIntensity = 0.2;
    L.materials.ceil.color.setHex(0x050506);
    L.materials.ceil.emissive.setHex(0x010102);
    L.materials.pipe.color.setHex(0x2a2a32);
    L.materials.pipe.emissive.setHex(0x0a0a10);
    L.materials.lamp.emissiveIntensity = 1.65;
    if (L.steamHaze.material) L.steamHaze.material.opacity = 0.06;
  }
}

function syncLookUi() {
  syncBackroomsPointerLockBodyClass(fps);
  if (!hintEl) return;
  var nvLine = "";
  if (isNightVisionActive()) {
    nvLine =
      " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>";
  }
  hintEl.innerHTML =
    "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>Q</kbd> 开门 · <kbd>B</kbd> 背包" +
    nvLine;
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
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryDoorQAction();
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

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function init() {
  if (!enforceLevel2EntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  markLevelEntered("l2", showLootToast);
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 220);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel2";
  scene.add(root);

  wallColliders.length = 0;
  var built = buildBackroomsLevel2World(root);
  level2World = built;
  var i;
  for (i = 0; i < built.colliders.length; i++) {
    wallColliders.push(built.colliders[i]);
  }
  fps.player.x = built.spawnX;
  fps.player.z = built.spawnZ;
  level2Lighting = built.lighting;
  playerFollowLights = createPlayerFollowLights(root);
  level2Doors = built.doors;
  interactRoots = built.interactRoots || [];
  level2Xiaoye = createLevel2Xiaoye(root);
  level2DeathMoth = createLevel2DeathMoth(root, wallColliders);
  level2Clump = createLevel2Clump(root, wallColliders);
  level2Hound = createLevel2Hound(root, wallColliders);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showLootToast,
  });
  applyLevel2NightVisionLighting(isNightVisionActive());

  initSurvivalHud();
  initBackroomsTemperature(2, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  onResize();
  syncLookUi();
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var nv = isNightVisionActive();
    applyLevel2NightVisionLighting(nv);
    if (level2World && level2World.update) {
      level2Environment = level2World.update(dt, fps.player, {
        showToast: showLootToast,
        onDamage: function (amount) {
          if (survival) survival.takeDamage(amount);
        },
      });
    }
    applyLevel2EnvironmentLighting(nv, level2Environment);
    updateLootToast(now);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.blackout = !!level2Environment.blackout;
      _survCtx.sanityDrainPerSec = level2Environment.sanityDrainPerSec || 0;
      survival.update(dt, _survCtx);
      updateSteamHungerClip(dt, { survival: survival, yaw: fps.yaw });
    }

    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.bodyHeight = BODY_HEIGHT;
    _physOpts.ceilingY = CORRIDOR_HEIGHT;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      speedMul *= level2Environment.movementMultiplier || 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders, 14);
      });
      tryLevelTransition();
    }

    updateAimPick();
    updateDoorHint();
    updateLevel2Doors(level2Doors, dt);
    if (level2Xiaoye && survival && !survival.dead) {
      level2Xiaoye.update(dt, fps.player.x, fps.player.z, survival, showLootToast);
    }
    if (level2DeathMoth && survival && !survival.dead) {
      level2DeathMoth.update(dt, fps.player.x, fps.player.z, survival, showLootToast, {
        wallColliders: wallColliders,
        now: now,
      });
    }
    if (level2Clump && survival && !survival.dead) {
      level2Clump.update(dt, fps.player.x, fps.player.z, survival, showLootToast, {
        wallColliders: wallColliders,
      });
    }
    if (level2Hound && survival && !survival.dead) {
      level2Hound.update(dt, fps.player.x, fps.player.z, survival, showLootToast);
    }
    if (firesalt) firesalt.update(dt);

    if (crosshairEl) {
      var hide = isInventoryOpen() || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
      crosshairEl.classList.toggle(
        "backrooms-crosshair--interact",
        !hide && (isAimL2Door() || !!currentAimPick)
      );
    }

    if (nv) {
      var hintSec = Math.ceil(getNightVisionRemainingMs() / 1000);
      if (hintSec !== lastNvHintSec) {
        lastNvHintSec = hintSec;
        syncLookUi();
      }
    } else if (lastNvHintSec >= 0) {
      lastNvHintSec = -1;
      syncLookUi();
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    syncPlayerFollowLights();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L2]", err);
  showError(err.message || String(err));
}

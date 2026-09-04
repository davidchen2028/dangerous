/**
 * Backrooms Level 3 — 暗沉砖墙迷宫、夜视/虚空、管道危害、电网嗡鸣
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
  getNightVisionRemainingMs,
} from "./backrooms-night-vision.js";
import {
  generateLevel3Maze,
  buildLevel3World,
  getLevel3SpawnWorld,
  updateLevel3FlickerLights,
  resolveCircleAgainstLevel3Maze,
  WALL_H,
} from "./backrooms-level3-world.js?v=2";
import {
  createLevel3PipeHazards,
  updateLevel3PipeHazards,
} from "./backrooms-level3-hazards.js?v=2";
import { createLevel3DeathMoths } from "./backrooms-death-moth.js?v=2";
import { createLevel3Clumps } from "./backrooms-clump-ai.js?v=3";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import {
  bindLevel3HumOnGesture,
  startLevel3Hum,
  stopLevel3Hum,
  playLevel3PipeBurst,
  playLevel3ElevatorStart,
  playLevel3EntityAttack,
} from "./backrooms-level3-audio.js?v=3";
import {
  buildLevel3ElevatorShaft,
  isNearLevel3Elevator,
  updateLevel3ElevatorGlow,
} from "./backrooms-level3-elevator.js?v=2";
import {
  canStartLevel3Elevator,
  createLevel3TapInteraction,
  getLevel3ElevatorRiseAction,
} from "./backrooms-level3-transition.js?v=1";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
  BACKROOMS_TONE_MAPPING_EXPOSURE,
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
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const MAZE_SEED_KEY = "backrooms_l3_maze_v2";
const FOG_COLOR = 0x14141c;
const FOG_NEAR = 4;
const FOG_FAR = 48;
const NV_FOG_COLOR = 0x3a4a58;
const NV_FOG_NEAR = 8;
const NV_FOG_FAR = 36;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const elevatorHintEl = document.getElementById("backroomsElevatorHint");

const LOOK_SENS = 0.0022;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let mazeData = null;
const wallColliders = [];
/** 迷宫网格之外的少量墙体（挂壁管道），玩家碰撞时作为 extraColliders */
let extraColliders = [];
let flickerLights = [];
let pipeHazards = [];
/** @type {ReturnType<createLevel3DeathMoths> | null} */
let level3DeathMoths = null;
/** @type {ReturnType<createLevel3Clumps> | null} */
let level3Clumps = null;
let firesalt = null;
let hazardVfxGroup = null;
let lootToastUntil = 0;
let ambientLight = null;
let fillLight = null;
let level3Materials = null;
/** @type {{ key: THREE.PointLight, fill: THREE.PointLight } | null} */
let playerFollowLights = null;
let lastNvApplied = null;
let flickerIntensityScale = 1;
let lastNvHintSec = -1;
let flickerFrame = 0;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.05 },
});
let spawnX = 0;
let spawnZ = 0;
/** @type {ReturnType<buildLevel3ElevatorShaft> | null} */
let level3Elevator = null;
let elevatorRising = false;
let elevatorRiseT = 0;
let elevatorCompleted = false;
const ELEVATOR_RISE_DURATION = 3.6;
const ELEVATOR_RISE_HEIGHT = 88;
let elevatorStartPitch = 0;
let transitionLock = false;
let audioStoppedForDeath = false;
const _hazardCallbacks = {
  onBurst: function (hazard) {
    var dx = fps.player.x - hazard.x;
    var dz = fps.player.z - hazard.z;
    if (dx * dx + dz * dz <= 12 * 12) playLevel3PipeBurst(hazard.kind);
  },
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 3 无法启动</strong></p><p>" + msg + "</p>";
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showLootToast(text) {
  showBackroomsLootToast(text, { durationMs: 2600 });
  lootToastUntil = performance.now() + 2600;
}

function createPlayerFollowLights(parent) {
  var key = new THREE.PointLight(0xffe8b8, 1.15, 10, 1.55);
  var fill = new THREE.PointLight(0xb0bcd0, 0.28, 7, 1.8);
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

function applyLevel3Vision(nv) {
  if (!scene || !renderer) return;
  if (nv === lastNvApplied) return;
  lastNvApplied = nv;
  var wall = level3Materials && level3Materials.wall;
  var floor = level3Materials && level3Materials.floor;
  var pipe = level3Materials && level3Materials.pipe;
  var lamp = level3Materials && level3Materials.lamp;
  if (nv) {
    scene.background.setHex(NV_FOG_COLOR);
    scene.fog.color.setHex(NV_FOG_COLOR);
    scene.fog.near = NV_FOG_NEAR;
    scene.fog.far = NV_FOG_FAR;
    if (ambientLight) {
      ambientLight.color.setHex(0xd0dce6);
      ambientLight.intensity = 1.05;
    }
    if (fillLight) {
      fillLight.color.setHex(0xe8f0f5);
      fillLight.groundColor.setHex(0x3d5263);
      fillLight.intensity = 0.55;
    }
    renderer.toneMappingExposure = BACKROOMS_TONE_MAPPING_EXPOSURE;
    if (wall) {
      wall.color.setHex(0x9aa4ae);
      wall.emissive.setHex(0x4a5560);
      wall.emissiveIntensity = 0.55;
    }
    if (floor) {
      floor.color.setHex(0x8a9098);
      floor.emissive.setHex(0x383840);
      floor.emissiveIntensity = 0.35;
    }
    if (pipe) {
      pipe.color.setHex(0x6a7078);
      pipe.emissive.setHex(0x282830);
    }
    if (lamp) lamp.emissiveIntensity = 1.7;
    if (playerFollowLights) {
      playerFollowLights.key.intensity = 1.75;
      playerFollowLights.key.distance = 15;
      playerFollowLights.fill.intensity = 0.5;
      playerFollowLights.fill.distance = 10;
    }
    flickerIntensityScale = 1.65;
  } else {
    scene.background.setHex(FOG_COLOR);
    scene.fog.color.setHex(FOG_COLOR);
    scene.fog.near = FOG_NEAR;
    scene.fog.far = FOG_FAR;
    if (ambientLight) {
      ambientLight.color.setHex(0x3a3a48);
      ambientLight.intensity = 0.95;
    }
    if (fillLight) {
      fillLight.color.setHex(0x4a4a62);
      fillLight.groundColor.setHex(0x141418);
      fillLight.intensity = 0.52;
    }
    renderer.toneMappingExposure = BACKROOMS_TONE_MAPPING_EXPOSURE;
    if (wall) {
      wall.color.setHex(0x3a3a44);
      wall.emissive.setHex(0x181820);
      wall.emissiveIntensity = 0.35;
    }
    if (floor) {
      floor.color.setHex(0x2a2a32);
      floor.emissive.setHex(0x0c0c10);
      floor.emissiveIntensity = 0.2;
    }
    if (pipe) {
      pipe.color.setHex(0x2a2a32);
      pipe.emissive.setHex(0x141418);
    }
    if (lamp) lamp.emissiveIntensity = 1.55;
    if (playerFollowLights) {
      playerFollowLights.key.intensity = 1.15;
      playerFollowLights.key.distance = 10;
      playerFollowLights.fill.intensity = 0.28;
      playerFollowLights.fill.distance = 7;
    }
    flickerIntensityScale = 0.95;
  }
}

function getMazeSeed() {
  try {
    var raw = sessionStorage.getItem(MAZE_SEED_KEY);
    if (raw != null) {
      var n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch (err) {
    /* ignore */
  }
  var s = (Date.now() ^ (Math.random() * 1e9)) | 0;
  try {
    sessionStorage.setItem(MAZE_SEED_KEY, String(s));
  } catch (err2) {
    /* ignore */
  }
  return s;
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l3", function (y) {
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
  hintEl.innerHTML =
    "发电站 · 迷宫<strong>中央通天光柱</strong> · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>B</kbd> 背包" +
    nv;
}

function updateElevatorHint() {
  if (!elevatorHintEl) return;
  if (elevatorRising || isInventoryOpen() || !survival || survival.dead) {
    elevatorHintEl.hidden = true;
    return;
  }
  elevatorHintEl.hidden = !isNearLevel3Elevator(fps.player.x, fps.player.z, level3Elevator);
}

function tryStartElevator() {
  if (
    !canStartLevel3Elevator({
      transitionLock: transitionLock,
      elevatorRising: elevatorRising,
      inventoryOpen: isInventoryOpen(),
      dead: !survival || survival.dead,
      near: isNearLevel3Elevator(fps.player.x, fps.player.z, level3Elevator),
    })
  ) return;
  transitionLock = true;
  elevatorRising = true;
  elevatorRiseT = 0;
  elevatorCompleted = false;
  elevatorStartPitch = fps.pitch;
  fps.move.forward = false;
  fps.move.back = false;
  fps.move.left = false;
  fps.move.right = false;
  if (elevatorHintEl) elevatorHintEl.hidden = true;
  showLootToast("电梯上升…");
  playLevel3ElevatorStart();
  if (document.exitPointerLock) document.exitPointerLock();
}

function cancelElevatorRise() {
  if (!elevatorRising) return;
  elevatorRising = false;
  elevatorCompleted = false;
  transitionLock = false;
  elevatorRiseT = 0;
  fps.feetY = 0;
  fps.velY = 0;
  fps.pitch = elevatorStartPitch;
}

function updateElevatorRise(dt) {
  if (!elevatorRising) return false;
  if (elevatorCompleted) return true;
  var action = getLevel3ElevatorRiseAction(
    elevatorRising,
    !survival || survival.dead,
    elevatorRiseT / ELEVATOR_RISE_DURATION
  );
  if (action === "cancel") {
    cancelElevatorRise();
    return false;
  }
  elevatorRiseT += dt;
  var p = Math.min(1, elevatorRiseT / ELEVATOR_RISE_DURATION);
  var ease = p * p * (3 - 2 * p);
  fps.feetY = ease * ELEVATOR_RISE_HEIGHT;
  fps.pitch = elevatorStartPitch + (-0.42 - elevatorStartPitch) * ease;
  if (p >= 1) {
    if (!survival || survival.dead) {
      cancelElevatorRise();
      return false;
    }
    elevatorCompleted = true;
    try {
      saveBackroomsSurvival(survival);
      grantLevelPass("l4", fps.yaw);
    } catch (err) {
      /* ignore */
    }
    queueEnterLevelNumber(4);
    stopLevel3Hum();
    window.location.href = "backrooms-level4.html";
  }
  return true;
}

function bindControls() {
  bindLevel3HumOnGesture();
  var tapInteraction = createLevel3TapInteraction(tryStartElevator);
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    onTapInteract: tapInteraction.onTapInteract,
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
        tryStartElevator();
        return true;
      }
      return false;
    },
    onPointerLockChange: function (locked) {
      if (locked) startLevel3Hum();
      syncLookUi();
    },
  });
  bindBackroomsWindowResize(renderer, camera);
  window.addEventListener("pagehide", function () {
    stopLevel3Hum();
  });
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  markLevelEntered("l3", showLootToast);

  mazeData = generateLevel3Maze(getMazeSeed());
  var spawn = getLevel3SpawnWorld(mazeData);
  spawnX = spawn.x;
  spawnZ = spawn.z;
  fps.player.x = spawnX;
  fps.player.z = spawnZ;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 100);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);

  var built = buildLevel3World(mazeData);
  root.add(built.group);
  wallColliders.length = 0;
  var ci;
  for (ci = 0; ci < built.colliders.length; ci++) {
    wallColliders.push(built.colliders[ci]);
  }
  extraColliders = built.extraColliders || [];
  flickerLights = built.flickerLights;
  level3Materials = built.materials;

  hazardVfxGroup = new THREE.Group();
  hazardVfxGroup.name = "L3HazardVfx";
  root.add(hazardVfxGroup);
  pipeHazards = createLevel3PipeHazards(
    built.pipeHazardSlots,
    hazardVfxGroup,
    mazeData.seed
  );
  level3DeathMoths = createLevel3DeathMoths(root, mazeData);
  level3Clumps = createLevel3Clumps(root, mazeData);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showLootToast,
  });

  level3Elevator = buildLevel3ElevatorShaft(root);

  ambientLight = new THREE.AmbientLight(0x3a3a48, 0.95);
  scene.add(ambientLight);
  fillLight = new THREE.HemisphereLight(0x4a4a62, 0x141418, 0.52);
  scene.add(fillLight);
  playerFollowLights = createPlayerFollowLights(root);

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
      if (useNightVisionPotionFromBackpack()) {
        lastNvApplied = null;
        syncLookUi();
      }
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化 · 150 血 / 200 体");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 3 };
  });

  initBackroomsTemperature(3, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  applyLevel3Vision(isNightVisionActive());
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (lootToastEl && !lootToastEl.hidden && now >= lootToastUntil) {
      lootToastEl.hidden = true;
    }

    var nv = isNightVisionActive();
    applyLevel3Vision(nv);

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting && !elevatorRising;
      survival.update(dt, _survCtx);
    }
    if (survival && survival.dead && !audioStoppedForDeath) {
      audioStoppedForDeath = true;
      stopLevel3Hum();
    }
    if (elevatorRising) {
      updateElevatorRise(dt);
      fps.velY = 0;
      fps.grounded = false;
    } else {
      _physOpts.gravity = DEFAULT_GRAVITY;
      _physOpts.bodyHeight = BODY_HEIGHT;
      _physOpts.ceilingY = WALL_H;
      updateBackroomsPlayerPhysics(fps, dt, _physOpts);
      if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
        var mul =
          survival && sprinting
            ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
            : 1;
        moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
          if (mazeData && mazeData.grid) {
            return resolveCircleAgainstLevel3Maze(
              nx,
              nz,
              fps.player.radius,
              mazeData.grid,
              extraColliders
            );
          }
          return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders, 14);
        });
      }
    }

    var hazardMsg = updateLevel3PipeHazards(
      elevatorRising ? null : survival,
      pipeHazards,
      fps.player.x,
      fps.player.z,
      now,
      _hazardCallbacks
    );
    if (hazardMsg) showLootToast(hazardMsg);
    if (level3DeathMoths && survival && !survival.dead) {
      level3DeathMoths.update(dt, fps.player.x, fps.player.z, survival, showLootToast, {
        pipeHazards: pipeHazards,
        mazeGrid: mazeData ? mazeData.grid : null,
        extraColliders: extraColliders,
        now: now,
        onAttack: playLevel3EntityAttack,
        playerSafe:
          elevatorRising ||
          isNearLevel3Elevator(fps.player.x, fps.player.z, level3Elevator),
      });
    }
    if (level3Clumps && survival && !survival.dead) {
      level3Clumps.update(dt, fps.player.x, fps.player.z, survival, showLootToast, {
        mazeGrid: mazeData ? mazeData.grid : null,
        extraColliders: extraColliders,
        onAttack: playLevel3EntityAttack,
        playerSafe:
          elevatorRising ||
          isNearLevel3Elevator(fps.player.x, fps.player.z, level3Elevator),
      });
    }
    if (firesalt) firesalt.update(dt);
    flickerFrame += 1;
    if ((flickerFrame & 1) === 0) {
      updateLevel3FlickerLights(flickerLights, now, flickerIntensityScale);
    }
    updateLevel3ElevatorGlow(level3Elevator, now);

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    syncPlayerFollowLights();

    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead
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

    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    updateElevatorHint();
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L3]", err);
  showError(err.message || String(err));
}

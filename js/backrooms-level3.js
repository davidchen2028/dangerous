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
  WALL_H,
} from "./backrooms-level3-world.js";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";
import {
  createLevel3PipeHazards,
  updateLevel3PipeHazards,
} from "./backrooms-level3-hazards.js";
import { bindLevel3HumOnGesture, startLevel3Hum, stopLevel3Hum } from "./backrooms-level3-audio.js";
import { attachMobileDragLook } from "./backrooms-fps-look.js";
import {
  buildLevel3ElevatorShaft,
  isNearLevel3Elevator,
  updateLevel3ElevatorGlow,
} from "./backrooms-level3-elevator.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";

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

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let mazeData = null;
const wallColliders = [];
let flickerLights = [];
let pipeHazards = [];
let hazardVfxGroup = null;
let lootToastUntil = 0;
let ambientLight = null;
let fillLight = null;
let level3Materials = null;
let decorPointLights = [];
let lastNvApplied = null;
let flickerIntensityScale = 1;
let lastNvHintSec = -1;
let flickerFrame = 0;

const keys = Object.create(null);
const move = { forward: false, back: false, left: false, right: false };
let yaw = 0;
let pitch = 0;
let pointerLocked = false;
/** @type {ReturnType<attachMobileDragLook> | null} */
let mobileLook = null;
const player = { x: 0, z: 0, radius: 0.32, speed: 4.05 };
let feetY = 0;
let velY = 0;
let grounded = true;
let spawnX = 0;
let spawnZ = 0;
/** @type {ReturnType<buildLevel3ElevatorShaft> | null} */
let level3Elevator = null;
let elevatorRising = false;
let elevatorRiseT = 0;
const ELEVATOR_RISE_DURATION = 3.6;
const ELEVATOR_RISE_HEIGHT = 88;
let elevatorStartPitch = 0;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 3 无法启动</strong></p><p>" + msg + "</p>";
}

function showLootToast(text) {
  if (!lootToastEl) return;
  lootToastEl.textContent = text;
  lootToastEl.hidden = false;
  lootToastUntil = performance.now() + 2600;
}

function applyLevel3Vision(nv) {
  if (!scene || !renderer) return;
  if (nv === lastNvApplied) return;
  lastNvApplied = nv;
  var wall = level3Materials && level3Materials.wall;
  var floor = level3Materials && level3Materials.floor;
  var pipe = level3Materials && level3Materials.pipe;
  var lamp = level3Materials && level3Materials.lamp;
  var i;
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
    renderer.toneMappingExposure = 0.95;
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
    if (lamp) lamp.emissiveIntensity = 1.45;
    for (i = 0; i < decorPointLights.length; i++) decorPointLights[i].intensity = 1.55;
    flickerIntensityScale = 1.65;
  } else {
    scene.background.setHex(FOG_COLOR);
    scene.fog.color.setHex(FOG_COLOR);
    scene.fog.near = FOG_NEAR;
    scene.fog.far = FOG_FAR;
    if (ambientLight) {
      ambientLight.color.setHex(0x3a3a48);
      ambientLight.intensity = 0.82;
    }
    if (fillLight) {
      fillLight.color.setHex(0x4a4a62);
      fillLight.groundColor.setHex(0x141418);
      fillLight.intensity = 0.45;
    }
    renderer.toneMappingExposure = 0.98;
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
    if (lamp) lamp.emissiveIntensity = 1.1;
    for (i = 0; i < decorPointLights.length; i++) decorPointLights[i].intensity = 0.98;
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
  var nav =
    typeof performance !== "undefined" &&
    performance.getEntriesByType &&
    performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "reload") {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  try {
    if (sessionStorage.getItem("backrooms_l3_pass") !== "1") {
      window.location.replace("backrooms-level0.html");
      return false;
    }
    sessionStorage.removeItem("backrooms_l3_pass");
    var rawYaw = sessionStorage.getItem("backrooms_l3_yaw");
    sessionStorage.removeItem("backrooms_l3_yaw");
    if (rawYaw != null) {
      var y = parseFloat(rawYaw);
      if (Number.isFinite(y)) yaw = y;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function movePlayer(dt, speedMul) {
  var dx = 0;
  var dz = 0;
  if (move.forward) dz -= 1;
  if (move.back) dz += 1;
  if (move.left) dx -= 1;
  if (move.right) dx += 1;
  if (dx === 0 && dz === 0) return;
  var len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  var sinY = Math.sin(yaw);
  var cosY = Math.cos(yaw);
  var worldX = dx * cosY + dz * sinY;
  var worldZ = -dx * sinY + dz * cosY;
  var step = player.speed * speedMul * dt;
  var out = resolveCircleAgainstColliders(
    player.x + worldX * step,
    player.z + worldZ * step,
    player.radius,
    wallColliders,
    14
  );
  player.x = out.x;
  player.z = out.z;
}

function updatePlayerPhysics(dt) {
  velY -= GRAVITY * dt;
  feetY += velY * dt;
  if (feetY <= 0) {
    feetY = 0;
    velY = 0;
    grounded = true;
  } else grounded = false;
  if (feetY + BODY_HEIGHT > WALL_H) {
    feetY = WALL_H - BODY_HEIGHT;
    if (velY > 0) velY = 0;
  }
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "发电站 · 迷宫<strong>中央通天光柱</strong> → Level 4 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>B</kbd> 背包" +
    nv;
}

function updateElevatorHint() {
  if (!elevatorHintEl) return;
  if (elevatorRising || isInventoryOpen() || !survival || survival.dead) {
    elevatorHintEl.hidden = true;
    return;
  }
  elevatorHintEl.hidden = !isNearLevel3Elevator(player.x, player.z, level3Elevator);
}

function tryStartElevator() {
  if (elevatorRising || isInventoryOpen() || !survival || survival.dead) return;
  if (!isNearLevel3Elevator(player.x, player.z, level3Elevator)) return;
  elevatorRising = true;
  elevatorRiseT = 0;
  elevatorStartPitch = pitch;
  move.forward = false;
  move.back = false;
  move.left = false;
  move.right = false;
  if (elevatorHintEl) elevatorHintEl.hidden = true;
  showLootToast("电梯上升…");
  if (document.exitPointerLock) document.exitPointerLock();
}

function updateElevatorRise(dt) {
  if (!elevatorRising) return false;
  elevatorRiseT += dt;
  var p = Math.min(1, elevatorRiseT / ELEVATOR_RISE_DURATION);
  var ease = p * p * (3 - 2 * p);
  feetY = ease * ELEVATOR_RISE_HEIGHT;
  pitch = elevatorStartPitch + (-0.42 - elevatorStartPitch) * ease;
  if (p >= 1) {
    try {
      saveBackroomsSurvival(survival);
      sessionStorage.setItem("backrooms_l4_pass", "1");
      sessionStorage.setItem("backrooms_l4_yaw", String(yaw));
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
  var cap = inputEl || canvas;
  if (cap) {
    mobileLook = attachMobileDragLook({
      captureEl: cap,
      inputEl: inputEl,
      lookSens: LOOK_SENS,
      getPointerLocked: function () {
        return pointerLocked;
      },
      getYaw: function () {
        return yaw;
      },
      setYaw: function (v) {
        yaw = v;
      },
      getPitch: function () {
        return pitch;
      },
      setPitch: function (v) {
        pitch = v;
      },
      shouldBlockPointerLock: function () {
        return isInventoryOpen();
      },
    });
  }
  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "KeyW") move.forward = true;
    if (e.code === "KeyS") move.back = true;
    if (e.code === "KeyA") move.left = true;
    if (e.code === "KeyD") move.right = true;
    if (e.code === "Space" && !e.repeat && grounded) {
      e.preventDefault();
      velY = JUMP_SPEED;
      grounded = false;
    }
    if (e.code === "KeyB" && !e.repeat) {
      e.preventDefault();
      toggleBackpack();
    }
    if (e.code === "KeyQ" && !e.repeat) {
      e.preventDefault();
      tryStartElevator();
    }
  });
  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
    if (e.code === "KeyW") move.forward = false;
    if (e.code === "KeyS") move.back = false;
    if (e.code === "KeyA") move.left = false;
    if (e.code === "KeyD") move.right = false;
  });
  document.addEventListener("mousemove", function (e) {
    if (!pointerLocked) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch -= e.movementY * LOOK_SENS;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
  });
  document.addEventListener("pointerlockchange", function () {
    pointerLocked = document.pointerLockElement === inputEl || document.pointerLockElement === canvas;
    if (pointerLocked) startLevel3Hum();
    if (mobileLook) mobileLook.syncInputDragClass(pointerLocked);
  });
  if (cap) {
    cap.addEventListener("pointerdown", function (e) {
      if (mobileLook && mobileLook.isDragLook()) return;
      if (!isInventoryOpen() && e.button === 0 && !pointerLocked && cap.requestPointerLock) {
        cap.requestPointerLock();
      }
    });
  }
  window.addEventListener("pagehide", function () {
    stopLevel3Hum();
  });
  window.addEventListener("resize", function () {
    if (!renderer || !camera) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();

  mazeData = generateLevel3Maze(getMazeSeed());
  var spawn = getLevel3SpawnWorld(mazeData);
  spawnX = spawn.x;
  spawnZ = spawn.z;
  player.x = spawnX;
  player.z = spawnZ;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 100);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  var root = new THREE.Group();
  scene.add(root);

  var built = buildLevel3World(mazeData);
  root.add(built.group);
  wallColliders.length = 0;
  var ci;
  for (ci = 0; ci < built.colliders.length; ci++) {
    wallColliders.push(built.colliders[ci]);
  }
  flickerLights = built.flickerLights;
  decorPointLights = built.decorPointLights || [];
  level3Materials = built.materials;

  hazardVfxGroup = new THREE.Group();
  hazardVfxGroup.name = "L3HazardVfx";
  root.add(hazardVfxGroup);
  pipeHazards = createLevel3PipeHazards(built.pipeHazardSlots, hazardVfxGroup);

  level3Elevator = buildLevel3ElevatorShaft(root);
  if (level3Elevator.pl) decorPointLights.push(level3Elevator.pl);
  if (level3Elevator.plMid) decorPointLights.push(level3Elevator.plMid);
  if (level3Elevator.plUp) decorPointLights.push(level3Elevator.plUp);

  ambientLight = new THREE.AmbientLight(0x3a3a48, 0.82);
  scene.add(ambientLight);
  fillLight = new THREE.HemisphereLight(0x4a4a62, 0x141418, 0.45);
  scene.add(fillLight);

  survival = new BackroomsSurvival({
    onRespawn: function () {
      player.x = spawnX;
      player.z = spawnZ;
      feetY = 0;
      velY = 0;
    },
  });
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

    var nv = isNightVisionActive(now);
    applyLevel3Vision(nv);

    var moving = move.forward || move.back || move.left || move.right;
    var sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && moving;
    if (survival && !survival.dead) survival.update(dt, { sprinting: sprinting && !elevatorRising });
    if (elevatorRising) {
      updateElevatorRise(dt);
      velY = 0;
      grounded = false;
    } else {
      updatePlayerPhysics(dt);
      if ((!survival || !survival.dead) && !isInventoryOpen()) {
        var mul = survival && sprinting ? survival.getSprintSpeedMul(player.speed, sprinting, moving) : 1;
        movePlayer(dt, mul);
      }
    }

    var hazardMsg = updateLevel3PipeHazards(survival, pipeHazards, player.x, player.z, now);
    if (hazardMsg) showLootToast(hazardMsg);
    flickerFrame += 1;
    if ((flickerFrame & 1) === 0) {
      updateLevel3FlickerLights(flickerLights, now, flickerIntensityScale);
    }
    updateLevel3ElevatorGlow(level3Elevator, now);

    camera.position.set(player.x, feetY + EYE_HEIGHT, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || !survival || survival.dead
      );
    }

    if (nv) {
      var hintSec = Math.ceil(getNightVisionRemainingMs(now) / 1000);
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

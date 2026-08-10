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
} from "./backrooms-level2-world.js";
import { resolveCircleAgainstColliders, raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  pickCrosshairInteract,
  getCameraAimRay,
} from "./backrooms-interact-aim.js";
import {
  updateLevel2Doors,
  tryOpenLevel2Door,
  getLevel2DoorTransition,
} from "./backrooms-level2-doors.js";
import { createLevel2Xiaoye } from "./backrooms-level2-xiaoye.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
  getNightVisionRemainingMs,
} from "./backrooms-night-vision.js";

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

let renderer = null;
let camera = null;
let scene = null;
const wallColliders = [];
let survival = null;

const keys = Object.create(null);
const move = { forward: false, back: false, left: false, right: false };
let yaw = 0;
let pitch = 0;
let pointerLocked = false;
let useDragLook = false;
let lookDragId = null;
let lookLastX = 0;
let lookLastY = 0;
const player = { x: 0, z: SPAWN_Z, radius: 0.34, speed: 4.2 };
let feetY = 0;
let velY = 0;
let grounded = true;

let level2Lighting = null;
let lootToastUntil = 0;
let lastNightVisionApplied = false;
let lastNvHintSec = -1;

let level2Doors = null;
let interactRoots = [];
/** @type {ReturnType<createLevel2Xiaoye> | null} */
let level2Xiaoye = null;
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let transitionLock = false;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 2 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceLevel2EntryOrRedirect() {
  var nav =
    typeof performance !== "undefined" &&
    performance.getEntriesByType &&
    performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "reload") {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  try {
    if (sessionStorage.getItem("backrooms_l2_pass") !== "1") {
      window.location.replace("backrooms-level0.html");
      return false;
    }
    sessionStorage.removeItem("backrooms_l2_pass");
    var rawYaw = sessionStorage.getItem("backrooms_l2_yaw");
    sessionStorage.removeItem("backrooms_l2_yaw");
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

function initSurvivalHud() {
  survival = new BackroomsSurvival({ onRespawn: respawn });
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

function respawn() {
  player.x = 0;
  player.z = SPAWN_Z;
  feetY = 0;
  velY = 0;
  yaw = 0;
  pitch = 0;
}

function resolvePlayerCollisions(px, pz) {
  return resolveCircleAgainstColliders(px, pz, player.radius, wallColliders, 14);
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
  if (!id || !level2Doors) return;
  if (id === "l283") {
    showLootToast("作者未制作");
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
  if (!id || !level2Doors || (level2Doors[id] && level2Doors[id].open)) {
    doorHintEl.hidden = true;
    return;
  }
  if (id === "l283") {
    doorHintEl.innerHTML = '彩色门 · 按 <kbd>Q</kbd>（未开放）';
  } else {
    doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开未上锁的门 · 通往深处';
  }
  doorHintEl.hidden = false;
}

function tryLevelTransition() {
  if (transitionLock || !level2Doors) return;
  var dest = getLevel2DoorTransition(level2Doors, player.x, player.z);
  if (!dest) return;
  transitionLock = true;
  try {
    saveBackroomsSurvival(survival);
    if (dest === "l4") {
      sessionStorage.setItem("backrooms_l4_pass", "1");
      sessionStorage.setItem("backrooms_l4_yaw", String(yaw));
      window.location.href = "backrooms-level4.html";
    } else if (dest === "l3") {
      sessionStorage.setItem("backrooms_l3_pass", "1");
      sessionStorage.setItem("backrooms_l3_yaw", String(yaw));
      window.location.href = "backrooms-level3.html";
    }
  } catch (err) {
    transitionLock = false;
  }
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
  var next = resolvePlayerCollisions(player.x + worldX * step, player.z + worldZ * step);
  player.x = next.x;
  player.z = next.z;
}

function updatePlayerPhysics(dt) {
  velY -= GRAVITY * dt;
  feetY += velY * dt;
  if (feetY <= 0) {
    feetY = 0;
    velY = 0;
    grounded = true;
  } else {
    grounded = false;
  }
  if (feetY + BODY_HEIGHT > CORRIDOR_HEIGHT) {
    feetY = CORRIDOR_HEIGHT - BODY_HEIGHT;
    if (velY > 0) velY = 0;
  }
}

function isTouchPrimaryDevice() {
  var ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod|Android|Mobile/i.test(ua)) return true;
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  return false;
}

function showLootToast(text) {
  if (!lootToastEl) return;
  lootToastEl.textContent = text;
  lootToastEl.hidden = false;
  lootToastUntil = performance.now() + 2200;
}

function updateLootToast(now) {
  if (!lootToastEl || lootToastEl.hidden) return;
  if (now >= lootToastUntil) lootToastEl.hidden = true;
}

function applyLevel2NightVisionLighting(active) {
  if (!scene || !level2Lighting) return;
  if (active === lastNightVisionApplied) return;
  lastNightVisionApplied = active;
  var L = level2Lighting;
  var i;
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
    for (i = 0; i < L.pointLights.length; i++) {
      L.pointLights[i].intensity = 1.65;
      L.pointLights[i].distance = 14;
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
    L.materials.lamp.emissiveIntensity = 1.45;
    if (L.steamHaze.material) L.steamHaze.material.opacity = 0.02;
  } else {
    scene.background.setHex(FOG_COLOR);
    scene.fog.color.setHex(FOG_COLOR);
    scene.fog.near = FOG_NEAR;
    scene.fog.far = FOG_FAR;
    L.ambient.color.setHex(0x2a2a38);
    L.ambient.intensity = 0.58;
    L.fill.color.setHex(0x3a3a50);
    L.fill.groundColor.setHex(0x0a0a10);
    L.fill.intensity = 0.28;
    for (i = 0; i < L.pointLights.length; i++) {
      L.pointLights[i].intensity = 0.78;
      L.pointLights[i].distance = 7;
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
    L.materials.lamp.emissiveIntensity = 1.1;
    if (L.steamHaze.material) L.steamHaze.material.opacity = 0.06;
  }
}

function syncLookUi() {
  document.body.classList.toggle("backrooms-pointer-locked", pointerLocked);
  if (inputEl) inputEl.classList.toggle("backrooms-input--drag", !pointerLocked && useDragLook);
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
  useDragLook = isTouchPrimaryDevice();
  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "KeyW") move.forward = true;
    if (e.code === "KeyS") move.back = true;
    if (e.code === "KeyA") move.left = true;
    if (e.code === "KeyD") move.right = true;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      if (grounded) {
        velY = JUMP_SPEED;
        grounded = false;
      }
    }
    if (e.code === "KeyB" && !e.repeat) {
      e.preventDefault();
      toggleBackpack();
    }
    if (e.code === "KeyQ" && !e.repeat) {
      e.preventDefault();
      tryDoorQAction();
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
    syncLookUi();
  });
  var cap = inputEl || canvas;
  if (cap) {
    cap.addEventListener("pointerdown", function (e) {
      if (!pointerLocked && useDragLook) {
        lookDragId = e.pointerId;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
        cap.setPointerCapture(e.pointerId);
        return;
      }
      if (!isInventoryOpen() && e.button === 0 && !pointerLocked && cap.requestPointerLock) {
        cap.requestPointerLock();
      }
    });
    cap.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  }
  window.addEventListener("pointermove", function (e) {
    if (lookDragId !== e.pointerId) return;
    yaw -= (e.clientX - lookLastX) * LOOK_SENS * MOBILE_LOOK_SENS_MULT;
    pitch -= (e.clientY - lookLastY) * LOOK_SENS * MOBILE_LOOK_SENS_MULT;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
    lookLastX = e.clientX;
    lookLastY = e.clientY;
  });
  window.addEventListener("pointerup", function (e) {
    if (lookDragId !== e.pointerId) return;
    try {
      cap.releasePointerCapture(lookDragId);
    } catch (err) {
      /* ignore */
    }
    lookDragId = null;
  });
  window.addEventListener("resize", onResize);
}

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function init() {
  if (!enforceLevel2EntryOrRedirect()) return;
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 220);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  var root = new THREE.Group();
  root.name = "BackroomsLevel2";
  scene.add(root);

  wallColliders.length = 0;
  var built = buildBackroomsLevel2World(root);
  var i;
  for (i = 0; i < built.colliders.length; i++) {
    wallColliders.push(built.colliders[i]);
  }
  player.x = built.spawnX;
  player.z = built.spawnZ;
  level2Lighting = built.lighting;
  level2Doors = built.doors;
  interactRoots = built.interactRoots || [];
  level2Xiaoye = createLevel2Xiaoye(root);
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
    var nv = isNightVisionActive(now);
    applyLevel2NightVisionLighting(nv);
    updateLootToast(now);
    var moving = move.forward || move.back || move.left || move.right;
    var sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && moving;

    if (survival && !survival.dead) {
      survival.update(dt, { sprinting: sprinting });
    }

    updatePlayerPhysics(dt);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(player.speed, sprinting, moving)
          : 1;
      movePlayer(dt, speedMul);
      tryLevelTransition();
    }

    updateAimPick();
    updateDoorHint();
    updateLevel2Doors(level2Doors, dt);
    if (level2Xiaoye && survival && !survival.dead) {
      level2Xiaoye.update(dt, player.x, player.z, survival, showLootToast);
    }

    if (crosshairEl) {
      var hide = isInventoryOpen() || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
      crosshairEl.classList.toggle(
        "backrooms-crosshair--interact",
        !hide && (isAimL2Door() || !!currentAimPick)
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

    camera.position.set(player.x, feetY + EYE_HEIGHT, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
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

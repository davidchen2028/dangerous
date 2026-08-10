/**
 * Backrooms Level 4 — 无限现代办公层（由 L3 电梯进入）
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
import { resolveCircleAgainstColliders, raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import { attachMobileDragLook } from "./backrooms-fps-look.js";
import { buildLevel4World, L4_WALL_H } from "./backrooms-level4-world.js";

const FOG_COLOR = 0xe8ebf0;
const FOG_NEAR = 6;
const FOG_FAR = 52;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const waterHintEl = document.getElementById("backroomsWaterHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const LOOK_SENS = 0.0022;
const AIM_INTERACT_MAX = 3.2;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildLevel4World> | null} */
let level4World = null;
let colliders = [];
let survival = null;
const keys = Object.create(null);
const move = { forward: false, back: false, left: false, right: false };
let yaw = 0;
let pitch = 0;
let pointerLocked = false;
let mobileLook = null;
const player = { x: 0, z: 0, radius: 0.32, speed: 4.15 };
let feetY = 0;
let velY = 0;
let grounded = true;
let spawnX = 0;
let spawnZ = 2;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let lootToastUntil = 0;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 4 无法启动</strong></p><p>" + msg + "</p>";
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
    if (sessionStorage.getItem("backrooms_l4_pass") !== "1") {
      window.location.replace("backrooms-level0.html");
      return false;
    }
    sessionStorage.removeItem("backrooms_l4_pass");
    var rawYaw = sessionStorage.getItem("backrooms_l4_yaw");
    sessionStorage.removeItem("backrooms_l4_yaw");
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
    colliders,
    16
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
  if (feetY + BODY_HEIGHT > L4_WALL_H) {
    feetY = L4_WALL_H - BODY_HEIGHT;
    if (velY > 0) velY = 0;
  }
}

function showLootToast(msg) {
  if (!lootToastEl) return;
  lootToastEl.textContent = msg;
  lootToastEl.hidden = false;
  lootToastUntil = performance.now() + 2600;
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 4 办公层 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包" + nv;
}

function updateAimPick() {
  if (!camera || !interactRoots.length || isInventoryOpen() || !survival || survival.dead) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    colliders,
    0,
    L4_WALL_H
  );
  currentAimPick = pickCrosshairInteract(
    camera,
    interactRoots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function isAimWaterCooler() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_water_cooler") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function updateWaterHint() {
  if (!waterHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    waterHintEl.hidden = true;
    return;
  }
  waterHintEl.hidden = !isAimWaterCooler();
}

function tryWaterCoolerQ() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimWaterCooler()) return;
  if (!survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showLootToast("背包已满");
    return;
  }
  saveBackroomsSurvival(survival);
  showLootToast("接了一瓶杏仁水");
}

function bindControls() {
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
      tryWaterCoolerQ();
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
    if (mobileLook) mobileLook.syncInputDragClass(pointerLocked);
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
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  var root = new THREE.Group();
  root.name = "BackroomsLevel4";
  scene.add(root);

  level4World = buildLevel4World(root);
  colliders = level4World.colliders;
  interactRoots = level4World.interactRoots;
  spawnX = level4World.spawnX;
  spawnZ = level4World.spawnZ;
  player.x = spawnX;
  player.z = spawnZ;

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
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 4 };
  });

  initBackroomsTemperature(4, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = move.forward || move.back || move.left || move.right;
    var sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && moving;
    if (survival && !survival.dead) survival.update(dt, { sprinting: sprinting });
    updatePlayerPhysics(dt);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul = survival && sprinting ? survival.getSprintSpeedMul(player.speed, sprinting, moving) : 1;
      movePlayer(dt, mul);
    }
    if (level4World) level4World.update(player.x, player.z);
    updateAimPick();
    updateWaterHint();
    if (lootToastEl && lootToastUntil && performance.now() > lootToastUntil) {
      lootToastEl.hidden = true;
      lootToastUntil = 0;
    }
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
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L4]", err);
  showError(err.message || String(err));
}

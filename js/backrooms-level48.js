/**
 * Backrooms Level 48 — 日落沙滩
 * 酒店（床）、后方农舍→L10、小湖湖底→L121
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
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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

const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.2;
const WATER_SURFACE_Y = -0.35;
const LAKE_CX = 28;
const LAKE_CZ = 8;
const LAKE_RX = 9;
const LAKE_RZ = 7;
const SINK_DURATION = 5;
const SINK_DEPTH = 4.2;

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

const fps = createBackroomsFpsState({
  player: { x: 0, z: 18, radius: 0.34, speed: 4.15 },
});
const colliders = [];
const interactRoots = [];
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 18 };

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let transitionLock = false;
let currentAimPick = null;
let inLake = false;
let sinkTimer = 0;
let waterOverlay = null;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat, collide) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 48 无法启动</strong></p><p>" + String(text) + "</p>";
}

function buildBeach(root) {
  var sand = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1 });
  var wet = new THREE.MeshStandardMaterial({ color: 0xb8966a, roughness: 0.95 });
  addBox(root, 120, 0.25, 90, 0, -0.12, 10, sand, false);
  addBox(root, 120, 0.08, 18, 0, -0.02, 36, wet, false);

  var ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 80),
    new THREE.MeshStandardMaterial({
      color: 0x2a5f7a,
      roughness: 0.28,
      metalness: 0.12,
      transparent: true,
      opacity: 0.9,
    })
  );
  ocean.rotation.x = -Math.PI * 0.5;
  ocean.position.set(0, -0.4, 58);
  root.add(ocean);

  var lake = new THREE.Mesh(
    new THREE.CircleGeometry(9.5, 28),
    new THREE.MeshStandardMaterial({
      color: 0x1c4e62,
      roughness: 0.2,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    })
  );
  lake.rotation.x = -Math.PI * 0.5;
  lake.position.set(LAKE_CX, WATER_SURFACE_Y, LAKE_CZ);
  lake.scale.set(1, LAKE_RZ / LAKE_RX, 1);
  root.add(lake);
}

function buildHotel(root) {
  var wall = new THREE.MeshStandardMaterial({ color: 0xe8d7c0, roughness: 0.9 });
  var roof = new THREE.MeshStandardMaterial({ color: 0x8a5a42, roughness: 0.85 });
  var trim = new THREE.MeshStandardMaterial({ color: 0xc9b59a, roughness: 0.86 });
  var dark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.95 });
  var wood = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
  var fabric = new THREE.MeshStandardMaterial({ color: 0xd8c4a8, roughness: 0.95 });

  // 外壳：门口留空（勿整面封死）
  addBox(root, 22, 8, 0.4, 0, 4, -14.2, wall, true);
  addBox(root, 0.4, 8, 16.4, -11, 4, -6, wall, true);
  addBox(root, 0.4, 8, 16.4, 11, 4, -6, wall, true);
  // 门洞两侧与楣
  addBox(root, 7.2, 8, 0.42, -7.4, 4, 2.2, wall, true);
  addBox(root, 7.2, 8, 0.42, 7.4, 4, 2.2, wall, true);
  addBox(root, 7.6, 2.2, 0.42, 0, 6.9, 2.2, wall, true);
  addBox(root, 24, 0.45, 18, 0, 8.15, -6, roof, false);
  addBox(root, 20, 0.12, 14, 0, 0.06, -6, trim, false);

  // 大厅柱与家具感
  addBox(root, 0.55, 5.5, 0.55, -4.5, 2.75, -4, trim, true);
  addBox(root, 0.55, 5.5, 0.55, 4.5, 2.75, -4, trim, true);

  // 床
  addBox(root, 2.4, 0.45, 3.4, -5.5, 0.4, -10.2, wood, true);
  addBox(root, 2.2, 0.28, 3.1, -5.5, 0.72, -10.2, fabric, false);
  addBox(root, 2.2, 0.35, 0.55, -5.5, 0.95, -11.5, fabric, false);
  addBox(root, 2.5, 1.3, 0.18, -5.5, 1.15, -12.05, wood, true);

  // 客房门（封死，无层级出口）
  var roomDoor = addBox(root, 1.5, 2.5, 0.12, 6.2, 1.25, -14.05, dark, false);
  roomDoor.name = "L48RoomDoor";
  var knob = addBox(root, 0.08, 0.08, 0.12, 6.75, 1.2, -13.95, trim, false);
  void knob;

  // 农舍（酒店后方）
  var barn = new THREE.MeshStandardMaterial({ color: 0xa8744a, roughness: 0.92 });
  var barnRoof = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 });
  addBox(root, 12, 5.5, 10, 0, 2.75, -28, barn, true);
  addBox(root, 13, 0.35, 11, 0, 5.7, -28, barnRoof, false);
  // 农舍门洞
  addBox(root, 3.8, 2.2, 0.12, -3.4, 1.1, -23, barn, true);
  addBox(root, 3.8, 2.2, 0.12, 3.4, 1.1, -23, barn, true);
  addBox(root, 3.2, 1.4, 0.12, 0, 3.5, -23, barn, true);
}

function buildProps(root) {
  var umbrella = new THREE.MeshStandardMaterial({ color: 0xd95c4a, roughness: 0.7 });
  var pole = new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.85 });
  var i;
  for (i = 0; i < 5; i++) {
    var x = -18 + i * 7;
    addBox(root, 0.12, 2.4, 0.12, x, 1.2, 22, pole, false);
    var shade = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.55, 10), umbrella);
    shade.position.set(x, 2.55, 22);
    root.add(shade);
  }
  var rock = new THREE.MeshStandardMaterial({ color: 0x7a7368, roughness: 1 });
  for (i = 0; i < 8; i++) {
    addBox(root, 1.2 + (i % 3) * 0.4, 0.55, 1.1, -30 + i * 8, 0.25, 30 + (i % 2), rock, true);
  }
}

function buildLighting(root) {
  root.add(new THREE.HemisphereLight(0xffc08a, 0x4a3a2a, 0.85));
  var sun = new THREE.DirectionalLight(0xff8a4a, 1.35);
  sun.position.set(-40, 12, 55);
  root.add(sun);
  var fill = new THREE.DirectionalLight(0xffd0a8, 0.35);
  fill.position.set(20, 18, -10);
  root.add(fill);
  root.add(new THREE.AmbientLight(0xffb070, 0.28));
}

function buildWorld(root) {
  buildBeach(root);
  buildHotel(root);
  buildProps(root);
  buildLighting(root);
  var bound = 58;
  colliders.push(wallCollider(-bound - 2, -bound, -bound, bound));
  colliders.push(wallCollider(bound, bound + 2, -bound, bound));
  colliders.push(wallCollider(-bound, bound, -bound - 2, -bound));
  colliders.push(wallCollider(-bound, bound, bound, bound + 2));
}

function inLakeZone(px, pz) {
  var dx = (px - LAKE_CX) / LAKE_RX;
  var dz = (pz - LAKE_CZ) / LAKE_RZ;
  return dx * dx + dz * dz <= 1;
}

function inFarmhouseDoor(px, pz) {
  return Math.abs(px) <= 1.45 && pz <= -22.4 && pz >= -24.2;
}

function exitTo(levelId, levelNumber, page, toast) {
  if (transitionLock) return;
  transitionLock = true;
  showToast(toast);
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelNumber(levelNumber);
  window.setTimeout(function () {
    window.location.href = page;
  }, 650);
}

function exitFarmhouseToL10() {
  exitTo("l10", 10, "backrooms-level10.html", "你走进农舍——田野的气味涌了进来…");
}

function exitLakeToL121() {
  exitTo("l121", 121, "backrooms-level121.html", "你沉到湖底，四周只剩幽蓝…");
}

function ensureWaterOverlay() {
  if (waterOverlay) return waterOverlay;
  waterOverlay = document.createElement("div");
  waterOverlay.id = "backroomsL48WaterOverlay";
  waterOverlay.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:18;" +
    "background:radial-gradient(ellipse at center,rgba(20,70,95,0.2),rgba(4,20,34,0.78));" +
    "opacity:0;transition:opacity 0.3s linear;";
  document.body.appendChild(waterOverlay);
  return waterOverlay;
}

function updateWaterVisual(progress) {
  ensureWaterOverlay().style.opacity = String(Math.min(0.95, 0.15 + progress * 0.8));
  if (!scene) return;
  scene.fog.near = 12 - progress * 8;
  scene.fog.far = 90 - progress * 55;
}

function refreshAimPick() {
  if (!camera || transitionLock || isInventoryOpen() || !survival || survival.dead || inLake) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function resolveInteract() {
  return currentAimPick && currentAimPick.distance <= AIM_MAX
    ? currentAimPick.data
    : null;
}

function updateInteractUi() {
  if (interactHintEl) interactHintEl.hidden = true;
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      isInventoryOpen() || !survival || survival.dead || inLake
    );
    crosshairEl.classList.remove("backrooms-crosshair--interact");
  }
}

function tryQAction() {
  /* Level 48 暂无 Q 交互 */
}

function syncHint() {
  if (!hintEl) return;
  if (inLake) {
    hintEl.innerHTML =
      "你在下沉……还剩 <strong>" +
      Math.max(0, Math.ceil(SINK_DURATION - sinkTimer)) +
      "</strong> 秒";
  } else {
    hintEl.innerHTML =
      "Level 48 · 日落沙滩 · 酒店 / 农舍 / 小湖 · <kbd>WASD</kbd> · <kbd>B</kbd>";
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || transitionLock || isTaskUiOpen();
    },
    onJump: function () {
      if (!inLake && !transitionLock) tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l48", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l48", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xff9a62);
  scene.fog = new THREE.Fog(0xff9a62, 18, 95);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 180);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel48";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 48 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(48, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  syncHint();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && !inLake;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }

    var floorY = 0;
    if (inLake) {
      sinkTimer = Math.min(SINK_DURATION, sinkTimer + dt);
      var progress = sinkTimer / SINK_DURATION;
      floorY = WATER_SURFACE_Y - SINK_DEPTH * progress;
      _physOpts.gravity = 4.2;
      updateWaterVisual(progress);
      syncHint();
      if (sinkTimer >= SINK_DURATION) exitLakeToL121();
    } else {
      _physOpts.gravity = DEFAULT_GRAVITY;
      updateWaterVisual(0);
      if (inLakeZone(fps.player.x, fps.player.z) && fps.feetY <= WATER_SURFACE_Y + 0.2) {
        inLake = true;
        sinkTimer = 0;
        fps.velY = Math.min(fps.velY, -0.35);
        showToast("你游进小湖，身体开始下沉…");
        syncHint();
      }
    }

    _physOpts.floorY = floorY;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      if (inLake) mul *= 0.45;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 16);
      });
    }

    if (!transitionLock && inFarmhouseDoor(fps.player.x, fps.player.z)) {
      exitFarmhouseToL10();
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAimPick();
    updateInteractUi();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L48]", err);
  showError(err.message || String(err));
}

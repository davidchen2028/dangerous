/**
 * Level XW-0 腐朽试练
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
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
  buildBackroomsLevelXw0World,
  XW0_HEIGHT,
} from "./backrooms-level-xw0-world.js?v=2";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { createFixedXiaoye } from "./backrooms-level2-xiaoye.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
  getNightVisionRemainingMs,
} from "./backrooms-night-vision.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
  syncBackroomsPointerLockBodyClass,
} from "./backrooms-fps-controller.js";

const FOG = 0x101114;
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

const wallColliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 3, radius: 0.34, speed: 4.15 },
});

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let world = null;
let smiler = null;
let clumps = null;
let follow = null;
let currentAim = null;
let lastSafe = { x: 0, z: 3 };
let pitLock = 0;
let hazardToastAt = 0;
let lastNvSec = -1;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level XW-0 无法启动</strong></p><p>" + msg + "</p>";
}

function showLootToast(text) {
  showBackroomsLootToast(text, { durationMs: 2200 });
}

function initSurvival() {
  survival = new BackroomsSurvival();
  var host = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(host);
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
      if (useNightVisionPotionFromBackpack()) showLootToast("夜视药水 · 5 分钟夜视");
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "xw0" };
  });
}

function updateAim() {
  if (!camera || !world) {
    currentAim = null;
    return;
  }
  var aim = getCameraAimRay(camera, 3.6);
  var block = raycastWallBlockDistance(aim.origin, aim.direction, 3.6, wallColliders, 0, XW0_HEIGHT);
  currentAim = pickCrosshairInteract(camera, world.interactRoots, 3.6, block);
}

function tryInteract() {
  if (!world || !currentAim || !currentAim.data || isInventoryOpen() || !survival || survival.dead) return;
  world.interact(currentAim.data, {
    showToast: showLootToast,
    grantItem: function (id, name) {
      return addItem({ id: id, name: name });
    },
  });
}

function syncHint() {
  syncBackroomsPointerLockBodyClass(fps);
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML = "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>Q</kbd> 互动 · <kbd>B</kbd> 背包" + nv;
}

function init() {
  if (!enforceLevelEntry("xw0", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("xw0", showLootToast);
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 3.5, 28);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildBackroomsLevelXw0World(root, { colliders: wallColliders });
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

  follow = {
    key: new THREE.PointLight(0xffe0b8, 0.85, 8, 2),
    fill: new THREE.PointLight(0x88909a, 0.2, 5, 2),
  };
  root.add(follow.key);
  root.add(follow.fill);

  smiler = createFixedXiaoye(root, {
    x: world.entitySpawns[0].x,
    z: world.entitySpawns[0].z,
    rotY: Math.PI,
    faceW: 1.8,
    faceH: 2.4,
    canSee: function (ax, az, bx, bz) {
      return !world.blocksSight(ax, az, bx, bz);
    },
  });
  clumps = createClumpsAt(root, [world.entitySpawns[1]], wallColliders, { applyLuck: false });

  initSurvival();
  initBackroomsTemperature("xw0", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 7.5);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryInteract();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
    onPointerLockChange: syncHint,
  });
  window.addEventListener("resize", function () {
    if (!renderer || !camera) return;
    applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  syncHint();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var hazard = world.update(dt, fps.player);
    var floorY = world.sampleFloor(fps.player.x, fps.player.z);
    if (floorY >= 0 && !world.isNearPit(fps.player.x, fps.player.z, 1.15)) {
      lastSafe = { x: fps.player.x, z: fps.player.z };
    }

    if (survival && !survival.dead) {
      survival.update(dt, { sprinting: isBackroomsSprintHeld(fps) && isBackroomsPlayerMoving(fps) });
      if (hazard.dps > 0) {
        survival.takeDamage(hazard.dps * dt);
        if (now - hazardToastAt > 1600) {
          hazardToastAt = now;
          showLootToast(hazard.text);
        }
      }
    }
    updateBackroomsPlayerPhysics(fps, dt, {
      gravity: DEFAULT_GRAVITY,
      bodyHeight: 1.85,
      ceilingY: XW0_HEIGHT,
      floorY: floorY,
    });
    if (fps.feetY < -2.2 && survival && !survival.dead) {
      if (pitLock <= 0) survival.takeDamage(80);
      fps.player.x = lastSafe.x;
      fps.player.z = lastSafe.z;
      fps.feetY = 0;
      fps.velY = 0;
      pitLock = 0.85;
      showLootToast("脚下是空的");
    }
    if (pitLock > 0) pitLock -= dt;
    if ((!survival || !survival.dead) && pitLock <= 0) {
      if (!isInventoryOpen() && !isTaskUiOpen()) {
        var sprinting = isBackroomsSprintHeld(fps) && isBackroomsPlayerMoving(fps);
        var speedMul = survival ? survival.getSprintSpeedMul(fps.player.speed, sprinting, isBackroomsPlayerMoving(fps)) : 1;
        moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
          return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders, 12);
        });
      }
    }
    updateAim();
    if (doorHintEl) {
      var text = world.getInteractionHint(currentAim && currentAim.data);
      doorHintEl.hidden = !text;
      if (text) doorHintEl.innerHTML = text.replace("按 Q", "按 <kbd>Q</kbd>");
    }
    if (crosshairEl) {
      var hide = isInventoryOpen() || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
      crosshairEl.classList.toggle("backrooms-crosshair--interact", !hide && !!(currentAim && currentAim.data));
    }
    if (smiler) smiler.update(dt, fps.player.x, fps.player.z, survival, showLootToast);
    if (clumps) clumps.update(dt, fps.player.x, fps.player.z, survival, showLootToast, { wallColliders: wallColliders });
    var eye = fps.feetY + DEFAULT_EYE_HEIGHT;
    follow.key.position.set(fps.player.x, eye, fps.player.z);
    follow.fill.position.set(fps.player.x, eye + 0.4, fps.player.z);
    applyBackroomsCamera(fps, camera, DEFAULT_EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    if (isNightVisionActive()) {
      var sec = Math.ceil(getNightVisionRemainingMs() / 1000);
      if (sec !== lastNvSec) {
        lastNvSec = sec;
        syncHint();
      }
    }
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  showError(err && err.message ? err.message : String(err));
}

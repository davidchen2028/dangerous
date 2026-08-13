/**
 * Backrooms Level C-370 — 水池深处的沉静空间（stub）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
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
const HALL_HALF = 26;
const WALL_H = 7;
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 18, radius: 0.34, speed: 3.6 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let causticLight = null;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2600 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-370 无法启动</strong></p><p>" + String(text) + "</p>";
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

function buildWorld(root) {
  var floor = new THREE.MeshStandardMaterial({ color: 0x20465c, roughness: 0.9 });
  var wall = new THREE.MeshStandardMaterial({
    color: 0x2c5f7c,
    emissive: 0x0e2a3c,
    emissiveIntensity: 0.2,
    roughness: 0.85,
  });
  var pillar = new THREE.MeshStandardMaterial({
    color: 0xdcecf4,
    emissive: 0x8ab4cc,
    emissiveIntensity: 0.12,
    roughness: 0.65,
  });

  addBox(root, HALL_HALF * 2, 0.2, HALL_HALF * 2, 0, 0.1, 0, floor, false);
  addBox(root, HALL_HALF * 2, 0.2, HALL_HALF * 2, 0, WALL_H, 0, wall, false);
  addBox(root, HALL_HALF * 2, WALL_H, 0.5, 0, WALL_H * 0.5, -HALL_HALF, wall, true);
  addBox(root, HALL_HALF * 2, WALL_H, 0.5, 0, WALL_H * 0.5, HALL_HALF, wall, true);
  addBox(root, 0.5, WALL_H, HALL_HALF * 2, -HALL_HALF, WALL_H * 0.5, 0, wall, true);
  addBox(root, 0.5, WALL_H, HALL_HALF * 2, HALL_HALF, WALL_H * 0.5, 0, wall, true);

  // 白色立柱阵列
  var gx;
  var gz;
  for (gx = -2; gx <= 2; gx++) {
    for (gz = -2; gz <= 2; gz++) {
      if (gx === 0 && gz === 2) continue;
      var px = gx * 9;
      var pz = gz * 9;
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, WALL_H, 14), pillar);
      col.position.set(px, WALL_H * 0.5, pz);
      root.add(col);
      colliders.push(wallCollider(px - 0.9, px + 0.9, pz - 0.9, pz + 0.9));
    }
  }

  root.add(new THREE.HemisphereLight(0x7fc0e0, 0x0c2432, 0.95));
  causticLight = new THREE.PointLight(0xa8e0ff, 1.15, 60, 2);
  causticLight.position.set(0, WALL_H - 1, 0);
  root.add(causticLight);
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 7);
    },
    onKeyDown: function (event) {
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
  if (!enforceLevelEntry("c370", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x123a52);
  scene.fog = new THREE.FogExp2(0x123a52, 0.03);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 100);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC370";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c370" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("c370", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  hintEl.innerHTML = "Level C-370 · <kbd>WASD</kbd> · <kbd>B</kbd>";
  bindControls();
  showToast("水声消失了，只剩下柱林间的回响");

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (causticLight) {
      causticLight.intensity = 1.0 + Math.sin(now * 0.0011) * 0.22;
    }
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-370]", err);
  showError(err.message || String(err));
}

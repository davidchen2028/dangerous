/**
 * Level 9 / 75 基础场景（后续可独立扩展）
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

const level = Number(document.body.dataset.level || 9);
const passId = level === 75 ? "l75" : "l9";
const wallH = level === 75 ? 5 : 4;
const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
let renderer;
let camera;
let scene;
let survival;
let lootToastUntil = 0;
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: wallH,
};

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2500 });
  lootToastUntil = performance.now() + 2500;
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
}

function buildLevel9(root) {
  var groundMat = new THREE.MeshStandardMaterial({ color: 0x121518, roughness: 1 });
  var houseMat = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.95 });
  addBox(root, 50, 0.15, 50, 0, 0.02, 0, groundMat);
  var i;
  for (i = 0; i < 18; i++) {
    var side = i % 2 ? 1 : -1;
    var z = -20 + Math.floor(i / 2) * 5;
    addBox(root, 7, 3.8, 4, side * 10, 1.9, z, houseMat);
  }
  colliders.push(wallCollider(-25, -23.5, -25, 25));
  colliders.push(wallCollider(23.5, 25, -25, 25));
  colliders.push(wallCollider(-25, 25, -25, -23.5));
  colliders.push(wallCollider(-25, 25, 23.5, 25));
  var moon = new THREE.DirectionalLight(0x9db4d0, 1.1);
  moon.position.set(-10, 20, -8);
  root.add(moon);
  root.add(new THREE.AmbientLight(0x27313d, 0.5));
}

function buildLevel75(root) {
  var metal = new THREE.MeshStandardMaterial({
    color: 0x747d86,
    metalness: 0.82,
    roughness: 0.32,
  });
  var floor = new THREE.MeshStandardMaterial({
    color: 0x343a40,
    metalness: 0.6,
    roughness: 0.45,
  });
  addBox(root, 26, 0.15, 36, 0, 0.02, 0, floor);
  addBox(root, 0.25, wallH, 36, -13, wallH * 0.5, 0, metal);
  addBox(root, 0.25, wallH, 36, 13, wallH * 0.5, 0, metal);
  addBox(root, 26, wallH, 0.25, 0, wallH * 0.5, -18, metal);
  addBox(root, 26, wallH, 0.25, 0, wallH * 0.5, 18, metal);
  addBox(root, 26, 0.18, 36, 0, wallH, 0, metal);
  colliders.push(wallCollider(-13.2, -12.7, -18, 18));
  colliders.push(wallCollider(12.7, 13.2, -18, 18));
  colliders.push(wallCollider(-13, 13, -18.2, -17.7));
  colliders.push(wallCollider(-13, 13, 17.7, 18.2));
  var i;
  for (i = -14; i <= 14; i += 4) {
    var light = new THREE.PointLight(0xc8e2ff, 0.75, 10, 2);
    light.position.set(0, 4.2, i);
    root.add(light);
  }
  root.add(new THREE.AmbientLight(0x64707c, 0.55));
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () { return isInventoryOpen(); },
    onJump: function () { tryBackroomsJump(fps, 8); },
    onKeyDown: function (e) {
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry(passId, function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(level === 75 ? 0x303840 : 0x030509);
  scene.fog = level === 75
    ? new THREE.Fog(0x303840, 8, 42)
    : new THREE.FogExp2(0x030509, 0.04);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  scene.add(root);
  if (level === 75) buildLevel75(root);
  else buildLevel9(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () { showToast("杏仁水 · +15 血量 · +25 理智"); },
  });
  installMegCheckpointDeathHooks(survival, function () { return { level: level }; });
  initBackroomsTemperature(level, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level " + level + " · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  }
  bindControls();

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
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = wallH;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders);
      });
    }
    applyBackroomsCamera(fps, camera, 1.65);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms destination]", err);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = "Level " + level + " 无法启动：" + (err.message || String(err));
  }
}

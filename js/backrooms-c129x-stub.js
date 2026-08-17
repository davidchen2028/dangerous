/**
 * C-1290 ~ C-1299 共用占位关卡。
 * 由各 HTML 的 data-c-level / data-c-title / data-c-blurb 配置外观文案。
 * C-1291 额外生成简易居民楼几何。
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
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
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
const levelId = document.body.dataset.cLevel || "c1290";
const levelNum = Number(document.body.dataset.cNum || "1290");
const titleText = document.body.dataset.cTitle || ("Level C-" + levelNum);
const blurb = document.body.dataset.cBlurb || "这片空间暂时没有出口。";
const isResidential = levelNum === 1291;

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: isResidential ? 8 : 0, radius: 0.34, speed: 3.6 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: isResidential ? 12 : 4 };

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
    "<p><strong>" + titleText + " 无法启动</strong></p><p>" + String(text) + "</p>";
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

function buildStubRoom(root) {
  var wall = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.92 });
  var floor = new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.95 });
  var ceil = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.9 });
  addBox(root, 16, 0.16, 16, 0, -0.08, 0, floor, false);
  addBox(root, 16, 0.12, 16, 0, 4, 0, ceil, false);
  addBox(root, 0.3, 4, 16, -8, 2, 0, wall, true);
  addBox(root, 0.3, 4, 16, 8, 2, 0, wall, true);
  addBox(root, 16, 4, 0.3, 0, 2, -8, wall, true);
  addBox(root, 16, 4, 0.3, 0, 2, 8, wall, true);
  root.add(new THREE.HemisphereLight(0xf0ebe0, 0x5a564c, 1));
  var lamp = new THREE.PointLight(0xfff0d8, 1.1, 22, 2);
  lamp.position.set(0, 3.2, 0);
  root.add(lamp);
}

function buildResidential(root) {
  var wall = new THREE.MeshStandardMaterial({ color: 0xc9bba4, roughness: 0.9 });
  var floor = new THREE.MeshStandardMaterial({ color: 0x9a8f7c, roughness: 0.94 });
  var brick = new THREE.MeshStandardMaterial({ color: 0xa67c5a, roughness: 0.88 });
  var door = new THREE.MeshStandardMaterial({ color: 0x6b4e32, roughness: 0.8 });
  var night = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.7 });

  // 地面院子
  addBox(root, 40, 0.16, 40, 0, -0.08, 0, floor, false);
  colliders.push(wallCollider(-20.5, -19.5, -20, 20));
  colliders.push(wallCollider(19.5, 20.5, -20, 20));
  colliders.push(wallCollider(-20, 20, -20.5, -19.5));
  colliders.push(wallCollider(-20, 20, 19.5, 20.5));

  // 一栋简易居民楼
  addBox(root, 14, 11, 10, 0, 5.5, -4, brick, true);
  addBox(root, 13.5, 0.2, 9.5, 0, 3.6, -4, wall, false);
  addBox(root, 13.5, 0.2, 9.5, 0, 7.2, -4, wall, false);
  var i;
  for (i = 0; i < 6; i++) {
    var wx = -5 + (i % 3) * 5;
    var wy = 2.2 + Math.floor(i / 3) * 3.6;
    addBox(root, 1.6, 1.3, 0.1, wx, wy, 1.05, night, false);
  }
  addBox(root, 1.8, 2.6, 0.16, 0, 1.3, 1.1, door, false);
  // 楼道走廊
  addBox(root, 3.2, 0.16, 18, 0, -0.02, 8, floor, false);
  addBox(root, 0.24, 3, 18, -1.6, 1.5, 8, wall, true);
  addBox(root, 0.24, 3, 18, 1.6, 1.5, 8, wall, true);

  root.add(new THREE.HemisphereLight(0xdde6ef, 0x5a4a38, 1.15));
  var sun = new THREE.DirectionalLight(0xfff1d0, 1.1);
  sun.position.set(-10, 24, 12);
  root.add(sun);
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
      tryBackroomsJump(fps, 6.2);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
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
  if (!enforceLevelEntry(levelId, function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered(levelId, showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(isResidential ? 0x8aa4b8 : 0x1a1814);
  scene.fog = isResidential
    ? new THREE.Fog(0x8aa4b8, 20, 70)
    : new THREE.Fog(0x1a1814, 6, 28);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 100);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "Backrooms" + levelId;
  scene.add(root);
  if (isResidential) buildResidential(root);
  else buildStubRoom(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: levelId };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(levelId, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      titleText + " · " + blurb + " · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
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
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 10);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms " + levelId + "]", err);
  showError(err.message || String(err));
}

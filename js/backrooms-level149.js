/**
 * Backrooms Level 149 — 椰树岛屿。
 * 生存难度：宜居。四面环海的小岛，长着椰子树，没有出口。
 * 入口：在 Level 46 沿任意方向行进约 50 米，重力降低后来到此处。
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
/** 沙滩半径（可行走），之外是浅海空气墙 */
const ISLAND_RADIUS = 26;

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.7 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null, floorY: 0 };

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
    "<p><strong>Level 149 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(n) {
  var x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 一棵椰子树：微微倾斜的树干 + 几片叶子 + 椰子 */
function addPalmTree(root, x, z, tilt, rotY) {
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
  var leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3a, roughness: 0.82 });
  var coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });

  var tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.rotation.y = rotY;
  tree.rotation.z = tilt;

  var h = 5.2 + seeded(x * 3.1 + z) * 2.4;
  var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, h, 8), trunkMat);
  trunk.position.y = h * 0.5;
  tree.add(trunk);

  var crownY = h;
  var f;
  for (f = 0; f < 7; f++) {
    var frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 5), leafMat);
    var ang = (f / 7) * Math.PI * 2;
    frond.position.set(Math.cos(ang) * 1.4, crownY - 0.2, Math.sin(ang) * 1.4);
    frond.rotation.z = Math.PI * 0.5 - 0.5;
    frond.rotation.y = -ang;
    tree.add(frond);
  }
  var c;
  for (c = 0; c < 3; c++) {
    var nut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), coconutMat);
    nut.position.set(Math.cos(c * 2.1) * 0.4, crownY - 0.5, Math.sin(c * 2.1) * 0.4);
    tree.add(nut);
  }
  root.add(tree);
  // 树干碰撞（按倾斜后的大致落点，简单用直立近似）
  colliders.push(wallCollider(x - 0.42, x + 0.42, z - 0.42, z + 0.42));
}

function buildWorld(root) {
  var sand = new THREE.MeshStandardMaterial({ color: 0xe4d09a, roughness: 0.98 });
  var wetSand = new THREE.MeshStandardMaterial({ color: 0xcbb184, roughness: 0.9 });
  var sea = new THREE.MeshStandardMaterial({
    color: 0x2f8fb5,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  });

  // 大片海面
  var ocean = new THREE.Mesh(new THREE.CircleGeometry(160, 48), sea);
  ocean.rotation.x = -Math.PI * 0.5;
  ocean.position.y = -0.25;
  root.add(ocean);

  // 岛屿沙滩：沙滩略高于海面，边缘一圈湿沙。
  var beach = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_RADIUS + 4, 40), wetSand);
  beach.rotation.x = -Math.PI * 0.5;
  beach.position.y = 0.02;
  root.add(beach);
  var dry = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_RADIUS, 40), sand);
  dry.rotation.x = -Math.PI * 0.5;
  dry.position.y = 0.05;
  root.add(dry);

  // 中央缓坡小丘，增加层次。
  var mound = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), sand);
  mound.scale.set(1, 0.32, 1);
  mound.position.y = -0.4;
  root.add(mound);

  // 椰子树散布在沙滩上。
  var i;
  for (i = 0; i < 16; i++) {
    var ang = seeded(i * 1.7) * Math.PI * 2;
    var r = 4 + seeded(i * 2.9 + 3) * (ISLAND_RADIUS - 6);
    var tx = Math.cos(ang) * r;
    var tz = Math.sin(ang) * r;
    var tilt = (seeded(i * 5.3) - 0.5) * 0.32;
    addPalmTree(root, tx, tz, tilt, seeded(i * 4.1) * Math.PI * 2);
  }

  // 几块礁石与浮木点缀。
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8073, roughness: 0.95 });
  for (i = 0; i < 8; i++) {
    var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    var rr = ISLAND_RADIUS - 2 + seeded(i * 6.7) * 3;
    var ra = seeded(i * 3.3 + 11) * Math.PI * 2;
    var rs = 0.6 + seeded(i * 8.1) * 1.1;
    rock.scale.set(rs, rs * 0.7, rs);
    rock.position.set(Math.cos(ra) * rr, 0.15, Math.sin(ra) * rr);
    rock.rotation.y = seeded(i * 2.2) * Math.PI;
    root.add(rock);
  }

  // 环岛空气墙：把玩家挡在沙滩上（无出口）。
  var seg = 28;
  for (i = 0; i < seg; i++) {
    var a0 = (i / seg) * Math.PI * 2;
    var wx = Math.cos(a0) * (ISLAND_RADIUS + 1.5);
    var wz = Math.sin(a0) * (ISLAND_RADIUS + 1.5);
    colliders.push(wallCollider(wx - 2, wx + 2, wz - 2, wz + 2));
  }

  root.add(new THREE.HemisphereLight(0xdff2ff, 0xcaa96a, 1.25));
  var sun = new THREE.DirectionalLight(0xfff4d8, 1.35);
  sun.position.set(24, 36, -18);
  root.add(sun);
  root.add(new THREE.AmbientLight(0xbfe0ef, 0.32));
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
      tryBackroomsJump(fps, 6.4);
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
  if (!enforceLevelEntry("l149", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l149", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd7ea);
  scene.fog = new THREE.Fog(0x9fd7ea, 55, 170);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 260);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevel149";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 149 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(149, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 149 · 椰树岛屿 · 生存难度 宜居 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
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
  console.error("[Backrooms L149]", err);
  showError(err.message || String(err));
}

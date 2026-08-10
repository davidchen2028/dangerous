/**
 * Backrooms Level 283 — 彩色走廊（由 L2 彩色门进入）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";

const CORRIDOR_LEN = 36;
const CORRIDOR_W = 3.2;
const WALL_H = 3.2;
const FOG_COLOR = 0x4a68a8;
const FOG_NEAR = 6;
const FOG_FAR = 48;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const LOOK_SENS = 0.0022;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;

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
const player = { x: 0, z: CORRIDOR_LEN * 0.5 - 2, radius: 0.34, speed: 4.2 };
let feetY = 0;
let velY = 0;
let grounded = true;

function rainbowCanvas() {
  var w = 128;
  var h = 128;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var i;
  for (i = 0; i < 8; i++) {
    ctx.fillStyle = ["#ff5588", "#ffaa33", "#ffee55", "#55dd88", "#55bbff", "#8855ff", "#ff55cc", "#88ffff"][i];
    ctx.fillRect(0, (h / 8) * i, w, h / 8 + 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 8);
  return tex;
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 283 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceEntryOrRedirect() {
  try {
    if (sessionStorage.getItem("backrooms_l283_pass") !== "1") {
      window.location.replace("backrooms-level0.html");
      return false;
    }
    sessionStorage.removeItem("backrooms_l283_pass");
    var rawYaw = sessionStorage.getItem("backrooms_l283_yaw");
    sessionStorage.removeItem("backrooms_l283_yaw");
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

function buildCorridor(root) {
  var len = CORRIDOR_LEN;
  var halfW = CORRIDOR_W * 0.5;
  var midZ = 0;
  var group = new THREE.Group();
  var map = rainbowCanvas();
  var wallMat = new THREE.MeshStandardMaterial({
    map: map || undefined,
    color: 0xffffff,
    emissive: 0x334466,
    emissiveIntensity: 0.25,
    roughness: 0.75,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x3a5a88,
    emissive: 0x223355,
    emissiveIntensity: 0.35,
    roughness: 0.85,
  });

  group.add(new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_W, 0.12, len), floorMat));
  group.children[0].position.set(0, 0.06, midZ);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_W, 0.1, len), wallMat));
  group.children[1].position.set(0, WALL_H, midZ);

  function side(x, c) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.12, WALL_H, len), wallMat);
    m.position.set(x, WALL_H * 0.5, midZ);
    group.add(m);
    wallColliders.push(c);
  }
  side(-halfW, { kind: "wall", minX: -halfW - 0.12, maxX: -halfW, minZ: -len * 0.5, maxZ: len * 0.5 });
  side(halfW, { kind: "wall", minX: halfW, maxX: halfW + 0.12, minZ: -len * 0.5, maxZ: len * 0.5 });

  root.add(group);
  root.add(new THREE.AmbientLight(0xaaccff, 0.85));
  var pl = new THREE.PointLight(0xffeedd, 1.2, 14, 1.3);
  pl.position.set(0, 2, 0);
  root.add(pl);
}

function resolvePlayerCollisions(px, pz) {
  return resolveCircleAgainstColliders(px, pz, player.radius, wallColliders);
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
  } else grounded = false;
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 283 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包" + nv;
}

function bindControls() {
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
  });
  var cap = inputEl || canvas;
  if (cap && cap.addEventListener) {
    cap.addEventListener("pointerdown", function (e) {
      if (!isInventoryOpen() && e.button === 0 && !pointerLocked && cap.requestPointerLock) {
        cap.requestPointerLock();
      }
    });
  }
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
  scene.add(root);
  buildCorridor(root);

  survival = new BackroomsSurvival({ onRespawn: function () {
    player.z = CORRIDOR_LEN * 0.5 - 2;
    player.x = 0;
    feetY = 0;
  }});
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
  });

  initBackroomsTemperature(283, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = move.forward || move.back || move.left || move.right;
    var sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && moving;
    if (survival && !survival.dead) survival.update(dt, { sprinting: sprinting });
    updatePlayerPhysics(dt);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul = survival && sprinting ? survival.getSprintSpeedMul(player.speed, sprinting, moving) : 1;
      movePlayer(dt, mul);
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
  console.error("[Backrooms L283]", err);
  showError(err.message || String(err));
}

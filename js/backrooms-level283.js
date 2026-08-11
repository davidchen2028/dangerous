/**
 * Backrooms Level 283 — 彩色走廊（由 L2 彩色门进入）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
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
} from "./backrooms-night-vision.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
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
  DEFAULT_LOOK_SENS,
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const CORRIDOR_LEN = 36;
const CORRIDOR_W = 3.2;
const WALL_H = 3.2;
const FOG_COLOR = 0x4a68a8;
const FOG_NEAR = 6;
const FOG_FAR = 48;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let camera = null;
let scene = null;
const wallColliders = [];
let survival = null;

const fps = createBackroomsFpsState({
  player: { x: 0, z: CORRIDOR_LEN * 0.5 - 2, radius: 0.34, speed: 4.2 },
});

function rainbowCanvas() {
  var w = 128;
  var h = 128;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  var i;
  for (i = 0; i < 8; i++) {
    ctx.fillStyle = ["#ff5588", "#ffaa33", "#ffee55", "#55dd88", "#55bbff", "#8855ff", "#ff55cc", "#88ffff"][i];
    ctx.fillRect(0, (h / 8) * i, w, h / 8 + 1);
  }
  var tex = new THREE.CanvasTexture(c);
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
    if (
      !enforceLevelEntry("l283", function (y) {
        fps.yaw = y;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return false;
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

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 283 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包" + nv;
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
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
    onPointerLockChange: function () {
      syncLookUi();
    },
  });
  bindBackroomsWindowResize(renderer, camera);
  syncLookUi();
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
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

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 283 };
  });

  initBackroomsTemperature(283, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      survival.update(dt, { sprinting: sprinting });
    }
    updateBackroomsPlayerPhysics(fps, dt, { gravity: DEFAULT_GRAVITY });
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders);
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
  console.error("[Backrooms L283]", err);
  showError(err.message || String(err));
}

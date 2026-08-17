/**
 * Backrooms Level 6.1 — 10×10 零食货架间
 * 玻璃门打开 → Level 11；通风管 Q → Level 3；画作 Q → Level C-144
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
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
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

const ROOM = 10;
const HALF = ROOM * 0.5;
const WALL_H = 3.1;
const AIM_MAX = 3.6;
const EYE_HEIGHT = 1.65;
const FOG_COLOR = 0xd8dce2;

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

const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let transitionLock = false;
let glassDoorOpen = false;
let glassDoorPivot = null;
let glassDoorCollider = null;
let doorOpenT = 0;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 2.2, radius: 0.32, speed: 4.05 },
});

const SNACK_COLORS = [0xe85d4c, 0xf0c040, 0x4caf7a, 0x5b7fd6, 0xd67ab8, 0xf28b3c];

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 6.1 无法启动</strong></p><p>" + msg + "</p>";
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function makeCommunityPaintingTexture() {
  var canvas2d = document.createElement("canvas");
  canvas2d.width = 512;
  canvas2d.height = 320;
  var ctx = canvas2d.getContext("2d");
  var sky = ctx.createLinearGradient(0, 0, 0, 210);
  sky.addColorStop(0, "#849aa8");
  sky.addColorStop(1, "#d5c6a1");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = "#646c70";
  var i;
  for (i = 0; i < 12; i++) {
    var h = 70 + ((i * 37) % 110);
    ctx.fillRect(i * 46 - 12, 210 - h, 34, h);
  }
  ctx.fillStyle = "#4d5947";
  ctx.fillRect(0, 210, 512, 110);
  ctx.fillStyle = "#f4ead0";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("和爱社区", 256, 286);
  var texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addShelf(root, collidersRef, x, z) {
  var frame = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.65, metalness: 0.25 });
  var board = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.85 });
  // 立柱与层板错开，避免共面闪烁
  var postW = 0.08;
  var postSpan = 2.32; // 左右立柱中心距
  var boardW = postSpan - postW - 0.02; // 夹在立柱内侧
  var boardD = 0.52;
  var boardT = 0.07;
  var shelfYs = [0.55, 1.15, 1.75];
  var postH = 2.12;
  var postY = postH * 0.5;

  addBox(root, postW, postH, boardD, x - postSpan * 0.5, postY, z, frame);
  addBox(root, postW, postH, boardD, x + postSpan * 0.5, postY, z, frame);
  // 底座略窄于立柱外侧，不与立柱端面共面
  addBox(root, postSpan + postW - 0.04, boardT, boardD - 0.02, x, boardT * 0.5 + 0.01, z, frame);

  var si;
  for (si = 0; si < shelfYs.length; si++) {
    addBox(root, boardW, boardT, boardD, x, shelfYs[si], z, board);
  }
  collidersRef.push(wallCollider(x - 1.25, x + 1.25, z - 0.32, z + 0.32));

  var row;
  var col;
  for (row = 0; row < 3; row++) {
    for (col = 0; col < 6; col++) {
      var color = SNACK_COLORS[(row * 5 + col) % SNACK_COLORS.length];
      var snack = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.55,
        metalness: 0.05,
        emissive: color,
        emissiveIntensity: 0.08,
      });
      var sx = x - 0.9 + col * 0.36;
      // 搁在层板上方，留出缝隙避免与层板重叠
      var sy = shelfYs[row] + boardT * 0.5 + 0.12;
      addBox(root, 0.26, 0.2, 0.18, sx, sy, z + 0.04, snack);
    }
  }
}

function buildWorld(root) {
  var floorMat = new THREE.MeshStandardMaterial({ color: 0xc4bfb6, roughness: 0.92 });
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.9 });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0xf2f4f6,
    emissive: 0xe8ecf0,
    emissiveIntensity: 0.18,
  });
  var metal = new THREE.MeshStandardMaterial({ color: 0x7a828c, metalness: 0.45, roughness: 0.4 });
  var glass = new THREE.MeshStandardMaterial({
    color: 0xb8d4e8,
    transparent: true,
    opacity: 0.38,
    roughness: 0.15,
    metalness: 0.08,
    depthWrite: false,
  });
  var ventMat = new THREE.MeshStandardMaterial({ color: 0x555c66, metalness: 0.55, roughness: 0.45 });

  addBox(root, ROOM, 0.12, ROOM, 0, 0.06, 0, floorMat);
  addBox(root, ROOM, 0.1, ROOM, 0, WALL_H, 0, ceilMat);

  // 北 / 东墙整面；西墙整面（通风口嵌在墙上）；南墙中间留玻璃门洞
  addBox(root, ROOM, WALL_H, 0.18, 0, WALL_H * 0.5, -HALF, wallMat);
  addBox(root, 0.18, WALL_H, ROOM, HALF, WALL_H * 0.5, 0, wallMat);
  addBox(root, 0.18, WALL_H, ROOM, -HALF, WALL_H * 0.5, 0, wallMat);
  var southWingW = (ROOM - 1.9) * 0.5;
  addBox(root, southWingW, WALL_H, 0.18, -HALF + southWingW * 0.5, WALL_H * 0.5, HALF, wallMat);
  addBox(root, southWingW, WALL_H, 0.18, HALF - southWingW * 0.5, WALL_H * 0.5, HALF, wallMat);
  // 门洞上方楣板
  addBox(root, 1.9, 0.55, 0.18, 0, WALL_H - 0.275, HALF, wallMat);

  colliders.push(wallCollider(-HALF - 0.2, HALF + 0.2, -HALF - 0.2, -HALF + 0.12));
  colliders.push(wallCollider(-HALF - 0.2, -HALF + 0.12, -HALF, HALF));
  colliders.push(wallCollider(HALF - 0.12, HALF + 0.2, -HALF, HALF));
  colliders.push(wallCollider(-HALF, -0.95, HALF - 0.12, HALF + 0.2));
  colliders.push(wallCollider(0.95, HALF, HALF - 0.12, HALF + 0.2));
  glassDoorCollider = wallCollider(-0.95, 0.95, HALF - 0.12, HALF + 0.2);
  colliders.push(glassDoorCollider);

  // 三排货架
  addShelf(root, colliders, -2.6, -2.4);
  addShelf(root, colliders, 2.6, -2.4);
  addShelf(root, colliders, 0, -0.2);

  // 玻璃门（南墙）
  glassDoorPivot = new THREE.Group();
  glassDoorPivot.position.set(-0.9, 0, HALF - 0.05);
  root.add(glassDoorPivot);
  var doorFrame = addBox(glassDoorPivot, 1.85, 2.35, 0.08, 0.9, 1.2, 0, metal);
  doorFrame.material = metal;
  var pane = addBox(glassDoorPivot, 1.55, 2.05, 0.04, 0.9, 1.2, 0.02, glass);
  var pickDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 2.4, 0.35),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickDoor.position.set(0.9, 1.2, 0);
  pickDoor.userData.brInteract = { kind: "l61_glass_door" };
  glassDoorPivot.add(pickDoor);
  interactRoots.push(pickDoor);

  // 通风管（西墙高处）
  addBox(root, 0.9, 0.55, 0.55, -HALF + 0.05, 2.35, 2.4, ventMat);
  var grate = addBox(root, 0.06, 0.42, 0.42, -HALF + 0.32, 2.35, 2.4, metal);
  var pickVent = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.8, 0.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickVent.position.set(-HALF + 0.45, 2.2, 2.4);
  pickVent.userData.brInteract = { kind: "l61_vent" };
  root.add(pickVent);
  interactRoots.push(pickVent);
  void grate;

  // 北墙上的社区画作：切出至 Level C-144
  var frameMat = new THREE.MeshStandardMaterial({
    color: 0x4a3425,
    roughness: 0.72,
  });
  addBox(root, 3.5, 2.35, 0.12, 0, 1.65, -HALF + 0.13, frameMat);
  var painting = new THREE.Mesh(
    new THREE.PlaneGeometry(3.15, 2),
    new THREE.MeshBasicMaterial({ map: makeCommunityPaintingTexture() })
  );
  painting.position.set(0, 1.65, -HALF + 0.2);
  root.add(painting);
  var pickPainting = new THREE.Mesh(
    new THREE.BoxGeometry(3.3, 2.2, 0.45),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pickPainting.position.set(0, 1.65, -HALF + 0.38);
  pickPainting.userData.brInteract = { kind: "l61_c144_painting" };
  root.add(pickPainting);
  interactRoots.push(pickPainting);

  root.add(new THREE.AmbientLight(0xffffff, 0.55));
  root.add(new THREE.HemisphereLight(0xf4f7fa, 0xa8a090, 0.45));
  var lamp = new THREE.PointLight(0xfff4e0, 0.85, 14, 2);
  lamp.position.set(0, WALL_H - 0.35, 0);
  root.add(lamp);
}

function syncHint() {
  if (!hintEl) return;
  hintEl.innerHTML =
    "Level 6.1 零食间 · <kbd>Q</kbd> 交互 · <kbd>WASD</kbd> · <kbd>B</kbd>";
}

function refreshAimPick() {
  if (!camera || isInventoryOpen() || !survival || survival.dead || transitionLock) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_MAX,
    colliders,
    0,
    WALL_H
  );
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX, wallBlock);
}

function aimedKind() {
  if (!currentAimPick || !currentAimPick.data) return null;
  if (currentAimPick.distance > AIM_MAX) return null;
  return currentAimPick.data.kind || null;
}

function updateInteractUi() {
  var kind = aimedKind();
  var hidden =
    isInventoryOpen() || !survival || survival.dead || transitionLock || !kind;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      if (kind === "l61_glass_door") {
        interactHintEl.innerHTML = glassDoorOpen
          ? "玻璃门已开 · 穿过门口"
          : "按 <kbd>Q</kbd> 打开玻璃门";
      } else if (kind === "l61_vent") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 爬进通风管";
      } else if (kind === "l61_c144_painting") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 切入画作";
      }
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      isInventoryOpen() || !survival || survival.dead
    );
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
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

function openGlassDoorToL11() {
  if (glassDoorOpen || transitionLock) return;
  glassDoorOpen = true;
  doorOpenT = 0;
  showToast("玻璃门滑开……");
  if (glassDoorCollider) {
    var idx = colliders.indexOf(glassDoorCollider);
    if (idx >= 0) colliders.splice(idx, 1);
    glassDoorCollider = null;
  }
  window.setTimeout(function () {
    exitTo("l11", 11, "backrooms-level11.html", "你穿过了玻璃门…");
  }, 900);
}

function crawlVentToL3() {
  exitTo("l3", 3, "backrooms-level3.html", "你爬进通风管，身体不断下坠…");
}

function clipPaintingToC144() {
  exitTo(
    "c144",
    "C-144",
    "backrooms-level-c144.html",
    "画布变得柔软，你从画中切了出去…"
  );
}

function tryQAction() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var kind = aimedKind();
  if (kind === "l61_glass_door") {
    openGlassDoorToL11();
    return;
  }
  if (kind === "l61_vent") {
    crawlVentToL3();
    return;
  }
  if (kind === "l61_c144_painting") {
    clipPaintingToC144();
  }
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
      tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryQAction();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  try {
    if (
      !enforceLevelEntry("l6_1", function (yaw) {
        fps.yaw = yaw;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return;
  }

  showEnterLevelBannerIfQueued();
  markLevelEntered("l6_1", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 8, 28);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 40);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel61";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
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
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "6.1" };
  });
  initBackroomsTemperature("6.1", {
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
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }

    if (glassDoorOpen && glassDoorPivot && doorOpenT < 1) {
      doorOpenT = Math.min(1, doorOpenT + dt * 1.6);
      glassDoorPivot.rotation.y = -doorOpenT * (Math.PI * 0.55);
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
  console.error("[Backrooms L6.1]", err);
  showError(err.message || String(err));
}

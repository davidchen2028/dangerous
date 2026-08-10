/**
 * Backrooms Level 0 — 确定性网格空间生成
 * 独立页面 backrooms-level0.html，不修改 action-scene.js
 */
import * as THREE from "three";
import { BackroomsSurvival, resetBackroomsRun, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay, resetMegPoints } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";

// =============================================================================
// 基础空间尺寸（放在最顶部，方便微调）
// =============================================================================
const GRID_SIZE = 2.0; // 每个网格单元的边长（2 米）
const WALL_HEIGHT = 2.4; // 墙体的高度（2.4 米）
const WALL_THICKNESS = 2.0; // 墙体厚度（与网格等宽，杜绝漏缝）
const MAP_ROWS = 12; // 迷宫地图行数
const MAP_COLS = 12; // 迷宫地图列数

// =============================================================================
// 材质与氛围
// =============================================================================
const WALL_COLOR = 0xc2b280; // 经典后室泛黄壁纸
const WALL_ROUGHNESS = 0.8;
/** 特殊墙块 [row, col] — 深黄色 */
const SPECIAL_WALL_CELL = { row: 9, col: 11 };
const SPECIAL_WALL_COLOR = 0x7a5a12;
const FLOOR_COLOR = 0x8a8563; // 潮湿灰绿地毯
const FLOOR_ROUGHNESS = 0.95;
const CEILING_COLOR = 0xd4c896;
const CEILING_ROUGHNESS = 0.85;
const FOG_COLOR = 0xc9bc88;
const FOG_NEAR = 4;
const FOG_FAR = 28;

// =============================================================================
// 后室 Level 0 经典迷宫矩阵
// 1 = 实心墙体   0 = 走廊空地
// 设计要点：外圈全封闭、大片可行走区、错落短墙、L 形拐角与死胡同
// =============================================================================
const BACKROOMS_MATRIX = [
  //  0  1  2  3  4  5  6  7  8  9 10 11
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], // row 1
  [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1], // row 2
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1], // row 3
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1], // row 4
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1], // row 5
  [1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1], // row 6
  [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1], // row 7
  [1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1], // row 8
  [1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1], // row 9
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1], // row 10
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 11
];

// =============================================================================
// 运行时
// =============================================================================
const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const clipHintEl = document.getElementById("backroomsClipHint");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");

const LOOK_SENS = 0.0022;
const MOBILE_LOOK_SENS_MULT = 1.35;
const GRAVITY = 32;
const JUMP_SPEED = 9;
const EYE_HEIGHT = 1.6;
const BODY_HEIGHT = 1.78;

const MAP_WIDTH = MAP_COLS * GRID_SIZE;
const MAP_DEPTH = MAP_ROWS * GRID_SIZE;
const HALF_W = MAP_WIDTH * 0.5;
const HALF_D = MAP_DEPTH * 0.5;

/** @type {THREE.WebGLRenderer | null} */
let renderer = null;
/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {THREE.Scene | null} */
let scene = null;
/** @type {number} */
let animId = 0;

/** 墙体 AABB，供第一人称碰撞使用 */
const wallColliders = [];

/** @type {Array<{ light: THREE.PointLight, glowMat: THREE.MeshStandardMaterial, bloomMat: THREE.MeshBasicMaterial, baseIntensity: number, baseEmissive: number, baseBloom: number, dimUntil: number, buzzPhase: number }>} */
const fluorescentFixtures = [];

/** 荧光灯管尺寸（米）— 整个长方体即灯体 */
const FLUORO_LENGTH = 1.75;
const FLUORO_WIDTH = 0.16;
const FLUORO_DEPTH = 0.11;
const FLUORO_MOUNT_Y = WALL_HEIGHT - 0.02;

const keys = Object.create(null);
const move = { forward: false, back: false, left: false, right: false };
let yaw = 0;
let pitch = 0;
let pointerLocked = false;
let useDragLook = false;
let lookDragId = null;
let lookLastX = 0;
let lookLastY = 0;
const player = {
  x: 0,
  z: 0,
  radius: 0.32,
  speed: 4.2,
};
let feetY = 0;
let velY = 0;
let grounded = true;

/** @type {THREE.HemisphereLight | null} */
let sceneHemi = null;
/** @type {THREE.AmbientLight | null} */
let sceneAmbient = null;

/** 诡异地标 — 过近时每秒 -2 理智（示例：迷宫深处黑猫雕像位） */
const CREEPY_LANDMARKS = [
  { x: 0, z: 0, radius: 2.8, row: 4, col: 8 },
];

/** @type {THREE.Mesh | null} */
let specialClipWallMesh = null;
/** @type {THREE.Mesh[]} */
let level0WallPickMeshes = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPickL0 = null;
let spawnPoint = { x: 0, z: 0 };
/** @type {BackroomsSurvival | null} */
let survival = null;

/** 切出状态：idle → dashing → done */
let clipState = "idle";
let clipDashLeft = 0;
const CLIP_DASH_SPEED = 13;
const CLIP_DASH_TIME = 0.55;

// =============================================================================
// 坐标工具 — 与墙体生成公式完全一致
// =============================================================================
function cellCenterX(col) {
  return col * GRID_SIZE - HALF_W;
}

function cellCenterZ(row) {
  return row * GRID_SIZE - HALF_D;
}

function validateMatrix() {
  if (BACKROOMS_MATRIX.length !== MAP_ROWS) {
    throw new Error("BACKROOMS_MATRIX 行数与 MAP_ROWS 不一致");
  }
  for (var row = 0; row < MAP_ROWS; row++) {
    if (!BACKROOMS_MATRIX[row] || BACKROOMS_MATRIX[row].length !== MAP_COLS) {
      throw new Error("BACKROOMS_MATRIX 第 " + row + " 行列数与 MAP_COLS 不一致");
    }
  }
}

// =============================================================================
// 材质
// =============================================================================
function createWallMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: color || WALL_COLOR,
    roughness: WALL_ROUGHNESS,
    metalness: 0,
  });
}

function isSpecialWallCell(row, col) {
  return row === SPECIAL_WALL_CELL.row && col === SPECIAL_WALL_CELL.col;
}

/** 切出 Level 1 的特殊墙 — 棕色底 + 棕色闪烁（非金色） */
function createSpecialClipWallMaterial() {
  return new THREE.MeshStandardMaterial({
    color: SPECIAL_WALL_COLOR,
    emissive: 0x6b4e14,
    emissiveIntensity: 0.42,
    roughness: WALL_ROUGHNESS,
    metalness: 0,
  });
}

/** 切出 Level 1 的特殊墙 — 更明显闪烁 */
function updateSpecialClipWallFlicker(elapsed) {
  if (!specialClipWallMesh || clipState !== "idle") return;
  var mat = specialClipWallMesh.material;
  if (!mat || mat.emissiveIntensity == null) return;

  var buzz =
    0.72 +
    Math.sin(elapsed * 5.4) * 0.22 +
    Math.sin(elapsed * 13.7 + 0.8) * 0.1;

  if (Math.random() < 0.045) {
    buzz *= 0.06 + Math.random() * 0.12;
  }
  if (Math.random() < 0.012) {
    buzz *= 0.02;
  }

  mat.emissiveIntensity = 0.22 + buzz * 0.55;
}

function createFloorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: FLOOR_ROUGHNESS,
    metalness: 0,
    side: THREE.FrontSide,
  });
}

function createCeilingMaterial() {
  return new THREE.MeshStandardMaterial({
    color: CEILING_COLOR,
    roughness: CEILING_ROUGHNESS,
    metalness: 0,
    side: THREE.FrontSide,
  });
}

// =============================================================================
// 核心生成：双重循环 + 绝对坐标对齐
// =============================================================================
function buildBackroomsLevel(root) {
  validateMatrix();

  var wallGeo = new THREE.BoxGeometry(GRID_SIZE, WALL_HEIGHT, GRID_SIZE);
  var wallMat = createWallMaterial();
  var specialWallMat = createSpecialClipWallMaterial();
  var wallsGroup = new THREE.Group();
  wallsGroup.name = "BackroomsWalls";

  wallColliders.length = 0;
  level0WallPickMeshes.length = 0;
  specialClipWallMesh = null;

  for (var row = 0; row < MAP_ROWS; row++) {
    for (var col = 0; col < MAP_COLS; col++) {
      if (BACKROOMS_MATRIX[row][col] !== 1) continue;

      var mesh = new THREE.Mesh(
        wallGeo,
        isSpecialWallCell(row, col) ? specialWallMat : wallMat
      );
      mesh.name = "Wall_" + row + "_" + col;
      mesh.visible = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // 严格网格对齐：墙根落在 Y=0，绝不悬空
      mesh.position.x = cellCenterX(col);
      mesh.position.z = cellCenterZ(row);
      mesh.position.y = WALL_HEIGHT * 0.5;

      wallsGroup.add(mesh);
      level0WallPickMeshes.push(mesh);

      if (isSpecialWallCell(row, col)) {
        specialClipWallMesh = mesh;
        mesh.userData.brInteract = { kind: "clip_wall" };
      }

      var half = GRID_SIZE * 0.5;
      wallColliders.push({
        minX: mesh.position.x - half,
        maxX: mesh.position.x + half,
        minZ: mesh.position.z - half,
        maxZ: mesh.position.z + half,
        special: isSpecialWallCell(row, col),
        ghost: false,
      });
    }
  }

  root.add(wallsGroup);

  // 地板 — 一张大平面，覆盖整个迷宫 footprint
  var floorGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH);
  var floor = new THREE.Mesh(floorGeo, createFloorMaterial());
  floor.name = "BackroomsFloor";
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = 0;
  floor.receiveShadow = true;
  root.add(floor);

  // 天花板 — 覆盖墙体顶部 Y = WALL_HEIGHT
  var ceilingGeo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH);
  var ceiling = new THREE.Mesh(ceilingGeo, createCeilingMaterial());
  ceiling.name = "BackroomsCeiling";
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = WALL_HEIGHT;
  ceiling.receiveShadow = false;
  root.add(ceiling);

  addFluorescentLights(root);
  return wallsGroup;
}

/** 后室天花板荧光灯 — 整个长方体通体发光 + 闪烁 */
function createFluorescentFixture(x, z, rotY) {
  var group = new THREE.Group();
  group.name = "FluorescentFixture";

  var glowMat = new THREE.MeshStandardMaterial({
    color: 0xfffef6,
    emissive: 0xfff2cc,
    emissiveIntensity: 1.55,
    roughness: 0.18,
    metalness: 0,
    toneMapped: false,
  });
  var fixture = new THREE.Mesh(
    new THREE.BoxGeometry(FLUORO_LENGTH, FLUORO_DEPTH, FLUORO_WIDTH),
    glowMat
  );
  fixture.position.y = -FLUORO_DEPTH * 0.5;
  fixture.castShadow = false;
  fixture.receiveShadow = false;

  // 略大的半透明光晕，让整块长方体看起来在向外溢光
  var bloomMat = new THREE.MeshBasicMaterial({
    color: 0xfff6dc,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  var bloom = new THREE.Mesh(
    new THREE.BoxGeometry(
      FLUORO_LENGTH * 1.04,
      FLUORO_DEPTH * 1.35,
      FLUORO_WIDTH * 1.22
    ),
    bloomMat
  );
  bloom.position.y = -FLUORO_DEPTH * 0.5;
  bloom.renderOrder = 1;

  var light = new THREE.PointLight(0xfff6e8, 0.52, 10, 1.4);
  light.position.y = -FLUORO_DEPTH * 0.45;

  group.add(fixture, bloom, light);
  group.position.set(x, FLUORO_MOUNT_Y, z);
  group.rotation.y = rotY;

  fluorescentFixtures.push({
    light: light,
    glowMat: glowMat,
    bloomMat: bloomMat,
    baseIntensity: 0.44 + Math.random() * 0.16,
    baseEmissive: 1.35 + Math.random() * 0.4,
    baseBloom: 0.36 + Math.random() * 0.14,
    dimUntil: 0,
    buzzPhase: Math.random() * Math.PI * 2,
  });

  return group;
}

function addFluorescentLights(root) {
  fluorescentFixtures.length = 0;

  var hemi = new THREE.HemisphereLight(0xfff8e0, 0x8a8563, 0.38);
  hemi.name = "BackroomsHemi";
  root.add(hemi);
  sceneHemi = hemi;

  var ambient = new THREE.AmbientLight(0xfff4d0, 0.22);
  ambient.name = "BackroomsAmbient";
  root.add(ambient);
  sceneAmbient = ambient;

  var fixturesGroup = new THREE.Group();
  fixturesGroup.name = "FluorescentFixtures";

  for (var row = 0; row < MAP_ROWS; row++) {
    for (var col = 0; col < MAP_COLS; col++) {
      if (BACKROOMS_MATRIX[row][col] !== 0) continue;
      if ((row + col) % 2 !== 0) continue;

      var x = cellCenterX(col);
      var z = cellCenterZ(row);
      var rotY = row % 2 === 0 ? 0 : Math.PI * 0.5;
      fixturesGroup.add(createFluorescentFixture(x, z, rotY));
    }
  }

  root.add(fixturesGroup);
}

/** 荧光灯经典闪烁：工频微颤 + 偶发瞬断 + 稀有长暗 */
function updateFluorescentFlicker(elapsed) {
  var i;
  for (i = 0; i < fluorescentFixtures.length; i++) {
    var f = fluorescentFixtures[i];
    var buzz =
      1 +
      Math.sin(elapsed * 118 + f.buzzPhase) * 0.022 +
      Math.sin(elapsed * 367 + f.buzzPhase * 1.7) * 0.012;

    if (Math.random() < 0.006) {
      f.dimUntil = elapsed + 0.025 + Math.random() * 0.055;
    }
    if (Math.random() < 0.00035) {
      f.dimUntil = elapsed + 0.12 + Math.random() * 0.28;
    }

    var dimMul = 1;
    if (elapsed < f.dimUntil) {
      dimMul = 0.28 + Math.random() * 0.35;
    }

    var mul = Math.max(0.45, Math.min(1.08, buzz * dimMul));
    f.light.intensity = f.baseIntensity * mul;
    f.glowMat.emissiveIntensity = f.baseEmissive * mul;
    f.bloomMat.opacity = f.baseBloom * mul;
  }
}

/** 荧光灯日常微闪烁 */
function updateLevel0Lighting(elapsed) {
  if (sceneHemi) sceneHemi.intensity = 0.38;
  if (sceneAmbient) sceneAmbient.intensity = 0.22;
  updateFluorescentFlicker(elapsed);
  return false;
}

function isPlayerMoving() {
  return move.forward || move.back || move.left || move.right;
}

function isSprintHeld() {
  return !!(keys.ShiftLeft || keys.ShiftRight);
}

function isNearCreepyLandmark() {
  var i;
  for (i = 0; i < CREEPY_LANDMARKS.length; i++) {
    var lm = CREEPY_LANDMARKS[i];
    var lx = lm.x;
    var lz = lm.z;
    if (lm.row != null && lm.col != null) {
      lx = cellCenterX(lm.col);
      lz = cellCenterZ(lm.row);
    }
    var dist = Math.hypot(lx - player.x, lz - player.z);
    if (dist <= lm.radius) return true;
  }
  return false;
}

function respawnAtSafePoint() {
  player.x = spawnPoint.x;
  player.z = spawnPoint.z;
  feetY = 0;
  velY = 0;
  yaw = 0;
  pitch = 0;
  clipState = "idle";
  clipDashLeft = 0;
  move.forward = false;
  move.back = false;
  move.left = false;
  move.right = false;
  setSpecialWallGhost(false);
}

function initSurvivalHud() {
  survival = new BackroomsSurvival({
    onRespawn: respawnAtSafePoint,
  });
  var hudHost = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(hudHost);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  });
  registerBackroomsInventoryUseHandlers(survival);
}

// =============================================================================
// 第一人称漫游
// =============================================================================
function resolveCircleAabbXZ(px, pz, radius, collider) {
  if (collider.ghost) return { x: px, z: pz };
  var nx = px;
  var nz = pz;
  if (px + radius > collider.minX && px - radius < collider.maxX) {
    if (pz + radius > collider.minZ && pz - radius < collider.minZ) {
      nz = collider.minZ - radius;
    } else if (pz - radius < collider.maxZ && pz + radius > collider.maxZ) {
      nz = collider.maxZ + radius;
    }
  }
  if (pz + radius > collider.minZ && pz - radius < collider.maxZ) {
    if (px + radius > collider.minX && px - radius < collider.minX) {
      nx = collider.minX - radius;
    } else if (px - radius < collider.maxX && px + radius > collider.maxX) {
      nx = collider.maxX + radius;
    }
  }
  return { x: nx, z: nz };
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

  var speed = player.speed * (speedMul || 1);
  var nextX = player.x + worldX * speed * dt;
  var nextZ = player.z + worldZ * speed * dt;
  var r = player.radius;
  var i;

  for (i = 0; i < wallColliders.length; i++) {
    var resolved = resolveCircleAabbXZ(nextX, player.z, r, wallColliders[i]);
    nextX = resolved.x;
  }
  for (i = 0; i < wallColliders.length; i++) {
    var resolvedZ = resolveCircleAabbXZ(nextX, nextZ, r, wallColliders[i]);
    nextZ = resolvedZ.z;
  }

  player.x = nextX;
  player.z = nextZ;
}

function tryJump() {
  if (grounded) {
    velY = JUMP_SPEED;
    grounded = false;
  }
}

function updatePlayerPhysics(dt) {
  velY -= GRAVITY * dt;
  feetY += velY * dt;

  if (feetY <= 0) {
    feetY = 0;
    velY = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  var headY = feetY + BODY_HEIGHT;
  if (headY > WALL_HEIGHT) {
    feetY = WALL_HEIGHT - BODY_HEIGHT;
    if (velY > 0) velY = 0;
  }
}

function getCameraEyeY() {
  return feetY + EYE_HEIGHT;
}

function getSpecialWallCenter() {
  return {
    x: cellCenterX(SPECIAL_WALL_CELL.col),
    z: cellCenterZ(SPECIAL_WALL_CELL.row),
  };
}

function refreshAimPickL0() {
  currentAimPickL0 = null;
  if (!camera || !specialClipWallMesh || clipState !== "idle") return;
  if (isInventoryOpen()) return;

  var maxDist = 4.2;
  var aim = getCameraAimRay(camera, maxDist);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    maxDist,
    wallColliders,
    0,
    WALL_HEIGHT
  );

  currentAimPickL0 = pickCrosshairInteract(
    camera,
    [specialClipWallMesh],
    maxDist,
    wallBlock
  );
}

function isAimingClipWall() {
  if (!currentAimPickL0 || !currentAimPickL0.data) return false;
  if (currentAimPickL0.data.kind !== "clip_wall") return false;
  return currentAimPickL0.distance <= 3.6;
}

function isNearSpecialWall() {
  return isAimingClipWall();
}

function setSpecialWallGhost(ghost) {
  var i;
  for (i = 0; i < wallColliders.length; i++) {
    if (wallColliders[i].special) {
      wallColliders[i].ghost = ghost;
    }
  }
}

function updateClipPrompt() {
  if (!clipHintEl) return;
  if (clipState !== "idle") {
    clipHintEl.hidden = true;
    return;
  }
  clipHintEl.hidden = !isNearSpecialWall();
}

function updateCrosshairL0() {
  if (!crosshairEl) return;
  var hide =
    isInventoryOpen() || !survival || survival.dead || clipState !== "idle";
  crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
  crosshairEl.classList.toggle(
    "backrooms-crosshair--interact",
    !hide && isAimingClipWall()
  );
}

function tryClipOut() {
  if (clipState !== "idle" || !isNearSpecialWall()) return;
  player.x += Math.sin(yaw);
  player.z -= Math.cos(yaw);
  setSpecialWallGhost(true);
  clipState = "dashing";
  clipDashLeft = CLIP_DASH_TIME;
  move.forward = true;
  if (clipHintEl) clipHintEl.hidden = true;
}

function updateClipDash(dt) {
  if (clipState !== "dashing") return;
  movePlayer(dt, CLIP_DASH_SPEED / player.speed);
  clipDashLeft -= dt;
  var c = getSpecialWallCenter();
  if (clipDashLeft <= 0 || player.x > c.x - 0.35) {
    clipState = "done";
    move.forward = false;
    try {
      sessionStorage.setItem("backrooms_clip_pass", "1");
      sessionStorage.setItem("backrooms_clip_yaw", String(yaw));
    } catch (err) {
      /* ignore */
    }
    window.location.href = "backrooms-level1.html";
  }
}

function isTouchPrimaryDevice() {
  var ua = navigator.userAgent || "";
  if (
    /iPad/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return true;
  }
  if (
    /iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      ua
    )
  ) {
    return true;
  }
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  ) {
    return true;
  }
  return false;
}

function isPointerLockActive() {
  var el = document.pointerLockElement;
  return el === inputEl || el === canvas;
}

function shouldUseDragLook() {
  if (pointerLocked) return false;
  return useDragLook;
}

function getCaptureElement() {
  return inputEl || canvas;
}

function getLockElement() {
  return inputEl || canvas;
}

function syncLookUi() {
  document.body.classList.toggle("backrooms-pointer-locked", pointerLocked);
  if (inputEl) {
    inputEl.classList.toggle("backrooms-input--drag", shouldUseDragLook());
  }
  if (!hintEl) return;
  if (pointerLocked) {
    hintEl.innerHTML =
      "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>B</kbd> 背包";
  } else if (shouldUseDragLook()) {
    hintEl.innerHTML =
      "拖动视角 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包";
  } else {
    hintEl.innerHTML =
      "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包 · 点击画面锁定鼠标";
  }
}

function requestLock(fromEl) {
  if (shouldUseDragLook()) return;
  var target = fromEl || getLockElement();
  if (!target || !target.requestPointerLock) {
    useDragLook = true;
    syncLookUi();
    return;
  }
  var req = target.requestPointerLock();
  if (req && typeof req.catch === "function") {
    req.catch(function () {
      useDragLook = true;
      syncLookUi();
    });
  }
}

function onPointerLockChange() {
  pointerLocked = isPointerLockActive();
  syncLookUi();
}

function onPointerLockError() {
  useDragLook = true;
  syncLookUi();
}

function applyLookDelta(dx, dy) {
  if (!dx && !dy) return;
  var sens = shouldUseDragLook() ? LOOK_SENS * MOBILE_LOOK_SENS_MULT : LOOK_SENS;
  yaw -= dx * sens;
  pitch -= dy * sens;
  pitch = Math.max(-1.35, Math.min(1.35, pitch));
}

function onLookPointerDown(e) {
  if (!shouldUseDragLook()) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  lookDragId = e.pointerId;
  lookLastX = e.clientX;
  lookLastY = e.clientY;
  var cap = getCaptureElement();
  if (cap && cap.setPointerCapture) {
    cap.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}

function onInputPointerDown(e) {
  if (isInventoryOpen()) return;
  if (shouldUseDragLook()) {
    onLookPointerDown(e);
    return;
  }
  if (e.pointerType === "mouse" && e.button === 0 && !pointerLocked) {
    requestLock(e.currentTarget);
  }
}

function onLookPointerMove(e) {
  if (lookDragId !== e.pointerId) return;
  applyLookDelta(e.clientX - lookLastX, e.clientY - lookLastY);
  lookLastX = e.clientX;
  lookLastY = e.clientY;
  e.preventDefault();
}

function onLookPointerUp(e) {
  if (lookDragId === null || (e && e.pointerId !== lookDragId)) return;
  var cap = getCaptureElement();
  if (cap && cap.releasePointerCapture) {
    try {
      cap.releasePointerCapture(lookDragId);
    } catch (err) {
      /* ignore */
    }
  }
  lookDragId = null;
}

function bindControls() {
  useDragLook = isTouchPrimaryDevice();

  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "KeyW") move.forward = true;
    if (e.code === "KeyS") move.back = true;
    if (e.code === "KeyA") move.left = true;
    if (e.code === "KeyD") move.right = true;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      tryJump();
    }
    if (e.code === "KeyQ" && !e.repeat) {
      e.preventDefault();
      tryClipOut();
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
    applyLookDelta(e.movementX, e.movementY);
  });

  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("pointerlockerror", onPointerLockError);

  var cap = getCaptureElement();
  if (cap) {
    cap.addEventListener("pointerdown", onInputPointerDown);
    cap.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });
  }

  window.addEventListener("pointermove", onLookPointerMove);
  window.addEventListener("pointerup", onLookPointerUp);
  window.addEventListener("pointercancel", onLookPointerUp);
  window.addEventListener("resize", onResize);

  syncLookUi();
}

function onResize() {
  if (!renderer || !camera) return;
  var w = window.innerWidth;
  var h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>后室场景无法启动</strong></p><p>" +
    msg +
    "</p><p>请用终端运行 <code>./run.sh</code>，在浏览器打开 " +
    '<a href="http://127.0.0.1:8080/backrooms-level0.html">http://127.0.0.1:8080/backrooms-level0.html</a> ' +
    "（不要双击 HTML 文件）。</p>";
}

function pickSpawnCell() {
  // 优先 (1,1) 角落地带；否则扫描第一个空地
  if (BACKROOMS_MATRIX[1] && BACKROOMS_MATRIX[1][1] === 0) {
    return { row: 1, col: 1 };
  }
  for (var row = 0; row < MAP_ROWS; row++) {
    for (var col = 0; col < MAP_COLS; col++) {
      if (BACKROOMS_MATRIX[row][col] === 0) return { row: row, col: col };
    }
  }
  return { row: 1, col: 1 };
}

function init() {
  if (!canvas) {
    throw new Error("找不到 canvas 元素");
  }
  resetBackroomsRun();
  resetMegPoints();
  validateMatrix();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.08,
    80
  );

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var levelRoot = new THREE.Group();
  levelRoot.name = "BackroomsLevel0";
  scene.add(levelRoot);

  buildBackroomsLevel(levelRoot);
  console.info(
    "[Backrooms] 地图已生成：",
    wallColliders.length,
    "面墙 ·",
    fluorescentFixtures.length,
    "盏荧光灯 ·",
    MAP_ROWS,
    "×",
    MAP_COLS,
    "格"
  );

  var spawn = pickSpawnCell();
  spawnPoint.x = cellCenterX(spawn.col);
  spawnPoint.z = cellCenterZ(spawn.row);
  player.x = spawnPoint.x;
  player.z = spawnPoint.z;
  feetY = 0;
  velY = 0;
  grounded = true;

  initSurvivalHud();
  initBackroomsTemperature(0, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  onResize();
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    animId = requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var elapsed = clock.getElapsedTime();
    var blackout = updateLevel0Lighting(elapsed);
    updateSpecialClipWallFlicker(elapsed);
    var moving = isPlayerMoving();
    var sprinting = isSprintHeld() && moving;

    if (survival && !survival.dead) {
      survival.update(dt, {
        blackout: blackout,
        nearLandmark: isNearCreepyLandmark(),
        sprinting: sprinting,
      });
    }

    updatePlayerPhysics(dt);
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(player.speed, sprinting, moving)
          : 1;
      if (clipState === "dashing") {
        updateClipDash(dt);
      } else {
        movePlayer(dt, speedMul);
      }
    }
    if (camera) {
      camera.position.set(player.x, getCameraEyeY(), player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      refreshAimPickL0();
    }
    updateClipPrompt();
    updateCrosshairL0();
    updateMegPointsDisplay(megPointsEl);
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
  frame();
}

function boot() {
  try {
    init();
  } catch (err) {
    console.error("[Backrooms] 初始化失败:", err);
    showError(err.message || String(err));
  }
}

boot();

export {
  GRID_SIZE,
  WALL_HEIGHT,
  WALL_THICKNESS,
  MAP_ROWS,
  MAP_COLS,
  BACKROOMS_MATRIX,
  buildBackroomsLevel,
  cellCenterX,
  cellCenterZ,
};

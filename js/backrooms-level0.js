/**
 * Backrooms Level 0 — 确定性网格空间生成
 * 独立页面 backrooms-level0.html，不修改 action-scene.js
 */
import * as THREE from "three";
import { BackroomsSurvival, resetBackroomsRun, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
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
  updateBackroomsColdDamage,
  setBackroomsTemperatureZone,
} from "./backrooms-temperature.js";
import {
  bindLevel0Music,
  startLevel0Music,
  fadeOutLevel0Music,
  setLevel0MusicDuck,
  LEVEL0_MUSIC_FADE_OUT_MS as MUSIC_FADE_OUT_MS,
} from "./backrooms-level0-music.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  queueEnterLevelBanner,
  queueEnterLevelNumber,
  showEnterLevelBannerIfQueued,
} from "./backrooms-level-enter.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { createPointLightPool } from "./backrooms-point-light-pool.js";
import { startGuardedRafLoop } from "./backrooms-frame-guard.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  syncBackroomsPointerLockBodyClass,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";
import {
  isRedChannelCell,
  buildRedChannelWall,
  updateRedDoorWallFlicker,
  updateRedEntranceControllers,
} from "./backrooms-level0-red-room.js";
import {
  isGrayDoorCell,
  buildGrayDoorWall,
  getGrayDoorPickMesh,
  updateLevel02Entrances,
} from "./backrooms-level0-02.js?v=16";
import { BLUE_HOLE_CELL, buildBlueHole } from "./backrooms-level0-03.js?v=3";
import { createLevel0ZoneManager } from "./backrooms-level0-zones.js?v=3";
import { grantLevelPass, consumeLevel0CarryEntry } from "./backrooms-level-pass.js";
import {
  handleTaskUiKey,
  isTaskUiOpen,
  markLevelEntered,
  markRedRoomSeenAndLeft,
} from "./backrooms-tasks.js";
import {
  mountLevel0WallDecor,
  updateClipWallVortex,
  disposeClipWallVortex,
  L0_POSTER_WALL_CELL,
} from "./backrooms-level0-wall-decor.js";
import { createLevel0WorldManager } from "./backrooms-level0-world.js?v=2";
import { createLevel0HallucinationPool } from "./backrooms-level0-hallucinations.js";
import {
  buildManilaRoom,
  MANILA_SESSION_KEY,
} from "./backrooms-level0-manila.js";
import { resetLevel01LootSession } from "./backrooms-level0-01.js";

// =============================================================================
// 基础空间尺寸（放在最顶部，方便微调）
// =============================================================================
const GRID_SIZE = 2.0; // 每个网格单元的边长（2 米）
const WALL_HEIGHT = 2.4; // 墙体的高度（2.4 米）
const WALL_THICKNESS = 2.0; // 墙体厚度（与网格等宽，杜绝漏缝）
const MAP_ROWS = 12; // 迷宫地图行数
const MAP_COLS = 12; // 迷宫地图列数
const MAZE_TILES_PER_AXIS = 3; // 将原迷宫按 3×3 拼成巨大迷宫
const CENTER_TILE = 1; // 特殊区域与出生点所在的中央迷宫

// =============================================================================
// 材质与氛围
// =============================================================================
const WALL_COLOR = 0xc2b280; // 无 Canvas 时的兜底色
const WALL_ROUGHNESS = 0.8;
/** 壁纸图案在世界里大约多少米重复一次 */
const WALLPAPER_METERS_PER_TILE = 1.0;
/** 随机切出墙；初始化矩阵后从九个迷宫的普通墙体中选出 */
let SPECIAL_WALL_CELL = null;
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

/**
 * 相邻模板之间各拆掉一对边界墙，形成贯通九宫格的通道。
 * 横向通道取 row 3，纵向通道取 col 3；两侧对应的内层格均为可走区域。
 */
function isMazeSeamOpening(tileRow, tileCol, row, col) {
  if (row === 3) {
    if (col === 0 && tileCol > 0) return true;
    if (col === MAP_COLS - 1 && tileCol < MAZE_TILES_PER_AXIS - 1) return true;
  }
  if (col === 3) {
    if (row === 0 && tileRow > 0) return true;
    if (row === MAP_ROWS - 1 && tileRow < MAZE_TILES_PER_AXIS - 1) return true;
  }
  return false;
}

function hasWalkableNeighbor(row, col) {
  var dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (var i = 0; i < dirs.length; i++) {
    var nr = row + dirs[i][0];
    var nc = col + dirs[i][1];
    if (
      nr >= 0 &&
      nr < MAP_ROWS &&
      nc >= 0 &&
      nc < MAP_COLS &&
      BACKROOMS_MATRIX[nr][nc] === 0
    ) {
      return true;
    }
  }
  return false;
}

/** 每次载入 L0 都随机选择一面玩家能够靠近的普通墙作为切出墙。 */
function pickRandomClipWallCell() {
  var candidates = [];
  for (var tileRow = 0; tileRow < MAZE_TILES_PER_AXIS; tileRow++) {
    for (var tileCol = 0; tileCol < MAZE_TILES_PER_AXIS; tileCol++) {
      for (var row = 0; row < MAP_ROWS; row++) {
        for (var col = 0; col < MAP_COLS; col++) {
          if (BACKROOMS_MATRIX[row][col] !== 1) continue;
          if (isMazeSeamOpening(tileRow, tileCol, row, col)) continue;
          if (!hasWalkableNeighbor(row, col)) continue;
          if (
            tileRow === CENTER_TILE &&
            tileCol === CENTER_TILE &&
            (isRedChannelCell(row, col) || isGrayDoorCell(row, col))
          ) {
            continue;
          }
          candidates.push({
            tileRow: tileRow,
            tileCol: tileCol,
            row: row,
            col: col,
          });
        }
      }
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

SPECIAL_WALL_CELL = pickRandomClipWallCell();

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
const devJumpEl = document.getElementById("backroomsDevJump");
const devJumpInputEl = document.getElementById("backroomsDevJumpInput");

const LOOK_SENS = 0.0022;
const MOBILE_LOOK_SENS_MULT = 1.35;
const GRAVITY = 32;
const JUMP_SPEED = 9;
const EYE_HEIGHT = 1.6;
const BODY_HEIGHT = 1.78;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = {
  blackout: false,
  nearLandmark: false,
  sprinting: false,
  skipPassiveSanity: false,
  sanityDrainPerSec: 0,
};
const _physOpts = {
  gravity: GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: WALL_HEIGHT,
};
const _emptyZoneEnv = { skipPassiveSanity: false, sanityDrainPerSec: 0 };

const MAP_WIDTH = MAP_COLS * GRID_SIZE;
const MAP_DEPTH = MAP_ROWS * GRID_SIZE;
const HALF_W = MAP_WIDTH * 0.5;
const HALF_D = MAP_DEPTH * 0.5;
const WORLD_WIDTH = MAP_WIDTH * MAZE_TILES_PER_AXIS;
const WORLD_DEPTH = MAP_DEPTH * MAZE_TILES_PER_AXIS;

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

/** @type {Array<{ x: number, y: number, z: number, intensity: number, glowMat: THREE.MeshStandardMaterial, bloomMat: THREE.MeshBasicMaterial, baseIntensity: number, baseEmissive: number, baseBloom: number, dimUntil: number, buzzPhase: number }>} */
const fluorescentFixtures = [];
/** @type {ReturnType<createPointLightPool> | null} */
let fluorescentLightPool = null;
/** @type {ReturnType<resolveBackroomsGfxProfile> | null} */
let level0GfxProfile = null;
let aimPickFrame = 0;

/** 荧光灯管尺寸（米）— 整个长方体即灯体 */
const FLUORO_LENGTH = 1.75;
const FLUORO_WIDTH = 0.16;
const FLUORO_DEPTH = 0.11;
const FLUORO_MOUNT_Y = WALL_HEIGHT - 0.02;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.2 },
});

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
/** @type {THREE.Group | null} */
let level0WorldRoot = null;
/** @type {ReturnType<createLevel0WorldManager> | null} */
let level0World = null;
/** @type {ReturnType<createLevel0ZoneManager> | null} */
let level0Zones = null;
/** @type {ReturnType<createLevel0HallucinationPool> | null} */
let hallucinations = null;
/** @type {ReturnType<buildManilaRoom> | null} */
let manilaRoom = null;
let manilaReturnSnapshot = null;
let manilaTriggerCooldownUntil = 0;
let lightHallucinationMul = 1;
let redProximityLightMul = 1;
const seenRedEntrances = new WeakSet();
const completedRedEntrances = new WeakSet();
let redTinnitusAudio = null;
let failedClipAttempts = 0;
/** 与切出墙 minDistance 一致：走出主区域后才可能刷切出墙 */
const MAIN_AREA_RADIUS = 96;
let leftMainAreaHintShown = false;
const CLIP_DASH_SPEED = 13;
const CLIP_DASH_TIME = 0.55;

function syncLevel0HudTitle(title) {
  var el = document.querySelector(".backrooms-hud__title");
  if (el) el.textContent = title;
}

// =============================================================================
// 坐标工具 — 与墙体生成公式完全一致
// =============================================================================
function cellCenterX(col) {
  return col * GRID_SIZE - HALF_W;
}

function cellCenterZ(row) {
  return row * GRID_SIZE - HALF_D;
}

function tiledCellCenterX(tileCol, col) {
  return cellCenterX(col) + (tileCol - CENTER_TILE) * MAP_WIDTH;
}

function tiledCellCenterZ(tileRow, row) {
  return cellCenterZ(row) + (tileRow - CENTER_TILE) * MAP_DEPTH;
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
/** 经典 Level 0 壁纸 — Canvas 绘制（竖向短划沿菱形边排列） */
function createLevel0WallPaperTexture() {
  var colW = 38;
  var rowH = 41;
  var cw = colW * 2;
  var ch = rowH * 2;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#b8ba62";
  ctx.fillRect(0, 0, cw, ch);

  var n;
  for (n = 0; n < cw * ch * 0.08; n++) {
    ctx.fillStyle =
      "rgba(0,0,0," + (0.012 + Math.random() * 0.022).toFixed(3) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }
  for (n = 0; n < cw * ch * 0.04; n++) {
    ctx.fillStyle =
      "rgba(255,255,210," + (0.018 + Math.random() * 0.028).toFixed(3) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }

  var ink = "#2c2820";

  function verticalDashesAlong(x0, y0, x1, y1, dashLen, step) {
    var len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.001) return;
    var count = Math.max(1, Math.floor(len / step));
    var i;
    for (i = 0; i <= count; i++) {
      var t = i / count;
      var px = x0 + (x1 - x0) * t;
      var py = y0 + (y1 - y0) * t;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.floor(px), Math.floor(py - dashLen * 0.5), 1, dashLen);
    }
  }

  function drawDiamond(cx, cy, rx, ry) {
    var top = [cx, cy - ry];
    var right = [cx + rx, cy];
    var bottom = [cx, cy + ry];
    var left = [cx - rx, cy];
    var dash = 3.2;
    var step = 3.4;
    verticalDashesAlong(top[0], top[1], right[0], right[1], dash, step);
    verticalDashesAlong(right[0], right[1], bottom[0], bottom[1], dash, step);
    verticalDashesAlong(bottom[0], bottom[1], left[0], left[1], dash, step);
    verticalDashesAlong(left[0], left[1], top[0], top[1], dash, step);
  }

  var col;
  var row;
  for (col = 0; col < 2; col++) {
    var xBase = col * colW + colW * 0.5;
    var yShift = col & 1 ? rowH * 0.5 : 0;
    for (row = -1; row < 3; row++) {
      var cy = row * rowH + yShift;
      drawDiamond(xBase, cy, 7.5, 9.5);
    }
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(
    GRID_SIZE / WALLPAPER_METERS_PER_TILE,
    WALL_HEIGHT / WALLPAPER_METERS_PER_TILE
  );
  tex.anisotropy = 4;
  return tex;
}

function createWallMaterial() {
  var mat = new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: WALL_ROUGHNESS,
    metalness: 0,
  });
  var tex = createLevel0WallPaperTexture();
  if (tex) {
    mat.map = tex;
    mat.color.setHex(0xffffff);
  }
  return mat;
}

function isSpecialWallCell(tileRow, tileCol, row, col) {
  return (
    SPECIAL_WALL_CELL &&
    tileRow === SPECIAL_WALL_CELL.tileRow &&
    tileCol === SPECIAL_WALL_CELL.tileCol &&
    row === SPECIAL_WALL_CELL.row &&
    col === SPECIAL_WALL_CELL.col
  );
}

/** 切出 Level 1 的特殊墙 — 深底 + 高亮旋涡贴花 */
function createSpecialClipWallMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x1a1208,
    emissive: 0x2a1808,
    emissiveIntensity: 0.28,
    roughness: WALL_ROUGHNESS,
    metalness: 0,
  });
}

/** 切出 Level 1 的特殊墙 — 更明显闪烁 */
function updateSpecialClipWallFlicker(elapsed) {
  updateClipWallVortex(elapsed);
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

  mat.emissiveIntensity = 0.12 + buzz * 0.35;
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

  for (var tileRow = 0; tileRow < MAZE_TILES_PER_AXIS; tileRow++) {
    for (var tileCol = 0; tileCol < MAZE_TILES_PER_AXIS; tileCol++) {
      for (var row = 0; row < MAP_ROWS; row++) {
        for (var col = 0; col < MAP_COLS; col++) {
          if (BACKROOMS_MATRIX[row][col] !== 1) continue;
          if (isMazeSeamOpening(tileRow, tileCol, row, col)) continue;

          var isCenterTile = tileRow === CENTER_TILE && tileCol === CENTER_TILE;
          var wx = tiledCellCenterX(tileCol, col);
          var wz = tiledCellCenterZ(tileRow, row);

          // 红室、0.2 灰门等特殊内容只放在中央模板，避免生成九份子层级入口。
          if (isCenterTile && isRedChannelCell(row, col)) {
            buildRedChannelWall(
              wallsGroup,
              wx,
              wz,
              GRID_SIZE,
              WALL_HEIGHT,
              wallColliders
            );
            continue;
          }

          if (isCenterTile && isGrayDoorCell(row, col)) {
            buildGrayDoorWall(
              wallsGroup,
              wx,
              wz,
              GRID_SIZE,
              WALL_HEIGHT,
              wallColliders
            );
            continue;
          }

          var special = isSpecialWallCell(tileRow, tileCol, row, col);
          var mesh = new THREE.Mesh(wallGeo, special ? specialWallMat : wallMat);
          mesh.name =
            "Wall_" + tileRow + "_" + tileCol + "_" + row + "_" + col;
          mesh.visible = true;
          // L0 无 DirectionalLight，阴影恒关（见 gfx-profile.shadows 注释）
          mesh.castShadow = false;
          mesh.receiveShadow = false;

          // 严格网格对齐：墙根落在 Y=0，绝不悬空
          mesh.position.x = wx;
          mesh.position.z = wz;
          mesh.position.y = WALL_HEIGHT * 0.5;

          wallsGroup.add(mesh);
          level0WallPickMeshes.push(mesh);

          if (special) {
            specialClipWallMesh = mesh;
            mesh.userData.brInteract = { kind: "clip_wall" };
          }

          var half = GRID_SIZE * 0.5;
          wallColliders.push({
            minX: mesh.position.x - half,
            maxX: mesh.position.x + half,
            minZ: mesh.position.z - half,
            maxZ: mesh.position.z + half,
            special: special,
            ghost: false,
          });
        }
      }
    }
  }

  root.add(wallsGroup);

  // 地板 — 一张大平面，覆盖整个迷宫 footprint
  var floorGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
  var floor = new THREE.Mesh(floorGeo, createFloorMaterial());
  floor.name = "BackroomsFloor";
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = 0;
  floor.receiveShadow = false;
  root.add(floor);

  buildBlueHole(
    root,
    cellCenterX(BLUE_HOLE_CELL.col),
    cellCenterZ(BLUE_HOLE_CELL.row),
    GRID_SIZE
  );

  // 天花板 — 覆盖墙体顶部 Y = WALL_HEIGHT
  var ceilingGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
  var ceiling = new THREE.Mesh(ceilingGeo, createCeilingMaterial());
  ceiling.name = "BackroomsCeiling";
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = WALL_HEIGHT;
  ceiling.receiveShadow = false;
  root.add(ceiling);

  addFluorescentLights(root);

  mountLevel0WallDecor(wallsGroup, {
    matrix: BACKROOMS_MATRIX,
    gridSize: GRID_SIZE,
    wallHeight: WALL_HEIGHT,
    cellCenterX: cellCenterX,
    cellCenterZ: cellCenterZ,
    spawnRow: 1,
    spawnCol: 1,
    posterCell: L0_POSTER_WALL_CELL,
    clipCell: null,
  });

  // 随机切出墙可能位于任意模板，使用带模板偏移的坐标函数挂旋涡。
  mountLevel0WallDecor(wallsGroup, {
    matrix: BACKROOMS_MATRIX,
    gridSize: GRID_SIZE,
    wallHeight: WALL_HEIGHT,
    cellCenterX: function (col) {
      return tiledCellCenterX(SPECIAL_WALL_CELL.tileCol, col);
    },
    cellCenterZ: function (row) {
      return tiledCellCenterZ(SPECIAL_WALL_CELL.tileRow, row);
    },
    spawnRow: 1,
    spawnCol: 1,
    posterCell: null,
    clipCell: SPECIAL_WALL_CELL,
  });

  return wallsGroup;
}

/** 后室天花板荧光灯 — 整个长方体通体发光 + 闪烁 */
function createFluorescentFixture(x, z, rotY) {
  var group = new THREE.Group();
  group.name = "FluorescentFixture";

  var glowMat = new THREE.MeshStandardMaterial({
    color: 0xfffef6,
    emissive: 0xfff2cc,
    // ACES 下参与 tone mapping，避免 NoToneMapping 时 1.55 过曝
    emissiveIntensity: 1.15,
    roughness: 0.18,
    metalness: 0,
  });
  var fixture = new THREE.Mesh(
    new THREE.BoxGeometry(FLUORO_LENGTH, FLUORO_DEPTH, FLUORO_WIDTH),
    glowMat
  );
  fixture.position.y = -FLUORO_DEPTH * 0.5;
  fixture.castShadow = false;
  fixture.receiveShadow = false;

  // 假 bloom：加性叠加、不写深度、跳过 tone mapping
  var bloomMat = new THREE.MeshBasicMaterial({
    color: 0xfff6dc,
    transparent: true,
    opacity: 0.32,
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

  group.add(fixture, bloom);
  group.position.set(x, FLUORO_MOUNT_Y, z);
  group.rotation.y = rotY;

  // 灯具本身只发 emissive；真正的点光由 fluorescentLightPool 按距离复用（见 backrooms-point-light-pool.js）
  fluorescentFixtures.push({
    x: x,
    y: FLUORO_MOUNT_Y - FLUORO_DEPTH * 0.45,
    z: z,
    intensity: 0,
    glowMat: glowMat,
    bloomMat: bloomMat,
    baseIntensity: 0.44 + Math.random() * 0.16,
    baseEmissive: 1.0 + Math.random() * 0.3,
    baseBloom: 0.26 + Math.random() * 0.12,
    dimUntil: 0,
    buzzPhase: Math.random() * Math.PI * 2,
  });

  return group;
}

function addFluorescentLights(root) {
  fluorescentFixtures.length = 0;
  if (fluorescentLightPool) {
    fluorescentLightPool.dispose();
    fluorescentLightPool = null;
  }

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

  for (var tileRow = 0; tileRow < MAZE_TILES_PER_AXIS; tileRow++) {
    for (var tileCol = 0; tileCol < MAZE_TILES_PER_AXIS; tileCol++) {
      for (var row = 0; row < MAP_ROWS; row++) {
        for (var col = 0; col < MAP_COLS; col++) {
          if (BACKROOMS_MATRIX[row][col] !== 0) continue;
          if ((row + col) % 2 !== 0) continue;

          var x = tiledCellCenterX(tileCol, col);
          var z = tiledCellCenterZ(tileRow, row);
          var rotY = row % 2 === 0 ? 0 : Math.PI * 0.5;
          fixturesGroup.add(createFluorescentFixture(x, z, rotY));
        }
      }
    }
  }

  root.add(fixturesGroup);

  var budget = level0GfxProfile ? level0GfxProfile.pointLightBudget : 6;
  if (level0GfxProfile && !level0GfxProfile.fluorescentPointLights) {
    budget = Math.min(budget, 3);
  }
  fluorescentLightPool = createPointLightPool(root, {
    count: Math.min(budget, fluorescentFixtures.length),
    color: 0xfff6e8,
    distance: 10,
    decay: 1.4,
    y: FLUORO_MOUNT_Y - FLUORO_DEPTH * 0.45,
    name: "FluorescentPooledLight",
  });
}

function addStreamingAmbientLights(root) {
  var hemi = new THREE.HemisphereLight(0xfff8e0, 0x8a8563, 0.38);
  hemi.name = "BackroomsHemi";
  root.add(hemi);
  sceneHemi = hemi;
  var ambient = new THREE.AmbientLight(0xfff4d0, 0.22);
  ambient.name = "BackroomsAmbient";
  root.add(ambient);
  sceneAmbient = ambient;
  var budget = level0GfxProfile ? level0GfxProfile.pointLightBudget : 6;
  if (level0GfxProfile && !level0GfxProfile.fluorescentPointLights) {
    budget = Math.min(budget, 3);
  }
  fluorescentLightPool = createPointLightPool(root, {
    count: Math.max(1, budget),
    color: 0xfff6e8,
    distance: 10,
    decay: 1.4,
    y: FLUORO_MOUNT_Y - FLUORO_DEPTH * 0.45,
    name: "FluorescentPooledLight",
  });
}

/** 荧光灯经典闪烁：工频微颤 + 偶发瞬断 + 稀有长暗 */
function updateFluorescentFlicker(elapsed) {
  if (level0World) {
    var streamed = level0World.getLightCandidates(
      fps.player.x,
      fps.player.z,
      20
    );
    fluorescentFixtures.length = 0;
    for (var si = 0; si < streamed.length; si++) {
      var source = streamed[si];
      if (source.baseIntensity == null) source.baseIntensity = source.intensity;
      if (source.dimUntil == null) source.dimUntil = 0;
      if (source.buzzPhase == null) source.buzzPhase = source.phase || 0;
      fluorescentFixtures.push(source);
    }
  }
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
    f.intensity =
      f.baseIntensity * mul * lightHallucinationMul * redProximityLightMul;
    if (f.glowMat) f.glowMat.emissiveIntensity = f.baseEmissive * mul;
    if (f.bloomMat) f.bloomMat.opacity = f.baseBloom * mul;
  }

  if (fluorescentLightPool) {
    fluorescentLightPool.update(fps.player.x, fps.player.z, fluorescentFixtures);
  }
}

/** 荧光灯日常微闪烁 */
function updateLevel0Lighting(elapsed) {
  var environmentMul = lightHallucinationMul * redProximityLightMul;
  if (sceneHemi) sceneHemi.intensity = 0.38 * environmentMul;
  if (sceneAmbient) sceneAmbient.intensity = 0.22 * environmentMul;
  updateFluorescentFlicker(elapsed);
  return false;
}

function updateLevel02EntryAnomaly(nowMs) {
  if (!level0World || (level0Zones && level0Zones.isInSubZone())) {
    setLevel0MusicDuck(1, "level02_entry");
    return;
  }
  var controllers = updateLevel02Entrances(
    fps.player.x,
    fps.player.z,
    nowMs,
    { showToast: showBackroomsToast }
  );
  var silent = false;
  for (var i = 0; i < controllers.length; i++) {
    var controller = controllers[i];
    if (
      controller.silenceSent &&
      Math.hypot(fps.player.x - controller.x, fps.player.z - controller.z) <= 4.8
    ) {
      silent = true;
      break;
    }
  }
  setLevel0MusicDuck(silent ? 0.025 : 1, "level02_entry");
}

function updateRedEntranceAnomaly(nowMs) {
  if (
    !level0World ||
    manilaRoom ||
    (level0Zones && level0Zones.isInSubZone())
  ) {
    redProximityLightMul = 1;
    setLevel0MusicDuck(1, "red_proximity");
    return;
  }
  var maxAmount = 0;
  updateRedEntranceControllers(fps.player.x, fps.player.z, nowMs, {
    onSeen: function (controller) {
      seenRedEntrances.add(controller);
    },
    setProximity: function (amount, controller) {
      maxAmount = Math.max(maxAmount, amount);
      if (
        amount < 0.012 &&
        seenRedEntrances.has(controller) &&
        !completedRedEntrances.has(controller)
      ) {
        completedRedEntrances.add(controller);
        markRedRoomSeenAndLeft(showBackroomsToast);
      }
    },
  });
  redProximityLightMul = 1 - maxAmount * 0.68;
  setLevel0MusicDuck(1 - maxAmount * 0.88, "red_proximity");
}

function stopRedTinnitus() {
  if (!redTinnitusAudio) return;
  try {
    redTinnitusAudio.osc.stop();
    redTinnitusAudio.context.close();
  } catch (err) {
    /* ignore */
  }
  redTinnitusAudio = null;
  setLevel0MusicDuck(1, "red_room");
}

function updateRedRoomAudio() {
  var effects =
    level0Zones && level0Zones.getRedEffects
      ? level0Zones.getRedEffects()
      : null;
  if (!effects) {
    stopRedTinnitus();
    return;
  }
  setLevel0MusicDuck(
    Math.max(0.08, 1 - effects.communicationDegradation * 0.9),
    "red_room"
  );
  if (!redTinnitusAudio) {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var context = new AudioCtx();
      var osc = context.createOscillator();
      var gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = 5850;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      redTinnitusAudio = { context: context, osc: osc, gain: gain };
    } catch (err) {
      redTinnitusAudio = null;
      return;
    }
  }
  var target = 0.002 + Math.max(0, effects.tinnitus || 0) * 0.024;
  try {
    redTinnitusAudio.gain.gain.setTargetAtTime(
      target,
      redTinnitusAudio.context.currentTime,
      0.08
    );
  } catch (err2) {
    stopRedTinnitus();
  }
}

function isNearCreepyLandmark() {
  if (level0World) {
    var streamedLandmarks = level0World.getLandmarks();
    for (var li = 0; li < streamedLandmarks.length; li++) {
      var streamedLm = streamedLandmarks[li];
      if (Math.hypot(streamedLm.x - fps.player.x, streamedLm.z - fps.player.z) <= 2.8) {
        return true;
      }
    }
    return false;
  }
  var i;
  for (i = 0; i < CREEPY_LANDMARKS.length; i++) {
    var lm = CREEPY_LANDMARKS[i];
    var lx = lm.x;
    var lz = lm.z;
    if (lm.row != null && lm.col != null) {
      lx = cellCenterX(lm.col);
      lz = cellCenterZ(lm.row);
    }
    var dist = Math.hypot(lx - fps.player.x, lz - fps.player.z);
    if (dist <= lm.radius) return true;
  }
  return false;
}

function getActiveColliders() {
  if (manilaRoom) return manilaRoom.colliders;
  if (level0Zones) return level0Zones.getColliders();
  if (level0World) return level0World.getColliders();
  return wallColliders;
}

function maybeHintLeftMainArea() {
  if (leftMainAreaHintShown) return;
  if (survival && survival.dead) return;
  if (manilaRoom) return;
  if (level0Zones && level0Zones.isInSubZone()) return;
  var dist = Math.hypot(fps.player.x - spawnPoint.x, fps.player.z - spawnPoint.z);
  if (dist < MAIN_AREA_RADIUS) return;
  leftMainAreaHintShown = true;
  showBackroomsToast("你已离开了主区域");
}

function showBackroomsToast(msg) {
  var el = document.getElementById("backroomsToast");
  if (!el) {
    el = document.createElement("p");
    el.id = "backroomsToast";
    el.className = "backrooms-toast";
    el.setAttribute("role", "status");
    var hud = document.querySelector(".backrooms-hud");
    if (hud) hud.appendChild(el);
    else document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove("backrooms-toast--hide");
  if (el._toastTimer) clearTimeout(el._toastTimer);
  el._toastTimer = setTimeout(function () {
    el.classList.add("backrooms-toast--hide");
    setTimeout(function () {
      el.hidden = true;
      el.classList.remove("backrooms-toast--hide");
    }, 400);
  }, 2400);
}

function initSurvivalHud() {
  survival = new BackroomsSurvival();
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
  installMegCheckpointDeathHooks(
    survival,
    function () {
      return { level: 0 };
    },
    {
      beforeNavigate: function () {
        return fadeOutLevel0Music(MUSIC_FADE_OUT_MS);
      },
    }
  );
}

// =============================================================================
// 第一人称漫游
// =============================================================================
function isPlayerMoving() {
  return isBackroomsPlayerMoving(fps);
}

function isSprintHeld() {
  return isBackroomsSprintHeld(fps);
}

function movePlayer(dt, speedMul) {
  moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
    return resolveBackroomsMoveCollisions(
      nx,
      nz,
      fps.player.radius,
      getActiveColliders(),
      8
    );
  });
}

function tryJump() {
  tryBackroomsJump(fps, JUMP_SPEED);
}

function updatePlayerPhysics(dt) {
  _physOpts.gravity = GRAVITY;
  _physOpts.bodyHeight = BODY_HEIGHT;
  _physOpts.ceilingY = WALL_HEIGHT;
  updateBackroomsPlayerPhysics(fps, dt, _physOpts);
}

function getCameraEyeY() {
  return fps.feetY + EYE_HEIGHT;
}

function getSpecialWallCenter() {
  if (level0World) return level0World.getSpecialClipCenter();
  if (!SPECIAL_WALL_CELL) return null;
  return {
    x: cellCenterX(SPECIAL_WALL_CELL.col),
    z: cellCenterZ(SPECIAL_WALL_CELL.row),
  };
}

function getInteractPickMeshes() {
  if (manilaRoom) return manilaRoom.interactMeshes;
  if (level0Zones && level0Zones.isInSubZone()) {
    return level0Zones.getInteractMeshes();
  }
  if (clipState !== "idle") return [];
  var list = [];
  if (level0World) {
    list = level0World.getInteractMeshes().slice();
  } else {
    if (specialClipWallMesh) list.push(specialClipWallMesh);
    var grayM = getGrayDoorPickMesh();
    if (grayM) list.push(grayM);
  }
  return list;
}

function refreshAimPickL0() {
  currentAimPickL0 = null;
  var meshes = getInteractPickMeshes();
  if (!camera || !meshes.length) return;
  if (isInventoryOpen()) return;

  var maxDist = 4.2;
  var aim = getCameraAimRay(camera, maxDist);
  var wallBlock = manilaRoom
    ? Infinity
    : raycastWallBlockDistance(
        aim.origin,
        aim.direction,
        maxDist,
        getActiveColliders(),
        0,
        WALL_HEIGHT
      );

  currentAimPickL0 = pickCrosshairInteract(
    camera,
    meshes,
    maxDist,
    wallBlock
  );
}

function isAimingInteractKind(kind) {
  if (!currentAimPickL0 || !currentAimPickL0.data) return false;
  if (currentAimPickL0.data.kind !== kind) return false;
  return currentAimPickL0.distance <= 3.6;
}

function isAimingClipWall() {
  return isAimingInteractKind("clip_wall");
}

function isAimingGrayDoor() {
  return (
    isAimingInteractKind("gray_door") ||
    isAimingInteractKind("white_door")
  );
}

function isAimingLevel02Exit() {
  return isAimingInteractKind("level02_exit");
}

function isAimingLevel01Entry() {
  return isAimingInteractKind("level01_entrance");
}

function isAimingActiveZoneInteraction() {
  return !!(
    level0Zones &&
    level0Zones.isInSubZone() &&
    currentAimPickL0 &&
    currentAimPickL0.data
  );
}

function isAimingManilaEntry() {
  return isAimingInteractKind("manila_room");
}

function isAimingManilaInteraction() {
  if (!manilaRoom || !currentAimPickL0 || !currentAimPickL0.data) return false;
  return /^manila_/.test(currentAimPickL0.data.kind || "");
}

function isNearSpecialWall() {
  return isAimingClipWall();
}

function setSpecialWallGhost(ghost) {
  if (level0World) {
    level0World.setSpecialClipGhost(ghost);
    return;
  }
  var i;
  for (i = 0; i < wallColliders.length; i++) {
    if (wallColliders[i].special) {
      wallColliders[i].ghost = ghost;
    }
  }
}

function updateClipPrompt() {
  if (!clipHintEl) return;
  if (level0Zones && level0Zones.isActive("red")) {
    clipHintEl.hidden = true;
    return;
  }
  if (clipState !== "idle") {
    clipHintEl.hidden = true;
    return;
  }
  if (manilaRoom) {
    if (isAimingManilaInteraction()) {
      var manilaText = manilaRoom.getInteractionHint(currentAimPickL0.data);
      clipHintEl.textContent = manilaText || "";
      clipHintEl.hidden = !manilaText;
    } else {
      clipHintEl.hidden = true;
    }
    return;
  }
  if (level0Zones && level0Zones.isInSubZone()) {
    if (isAimingLevel02Exit()) {
      clipHintEl.innerHTML = '按 <kbd>Q</kbd> 打开 · 返回白门口';
      clipHintEl.hidden = false;
    } else if (isAimingActiveZoneInteraction()) {
      var zoneHint = level0Zones.getInteractionHint(currentAimPickL0.data);
      clipHintEl.innerHTML = zoneHint || "";
      clipHintEl.hidden = !zoneHint;
    } else {
      clipHintEl.hidden = true;
    }
    return;
  }
  if (isAimingGrayDoor()) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 打开';
    clipHintEl.hidden = false;
    return;
  }
  if (isAimingLevel01Entry()) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 进入天顶站';
    clipHintEl.hidden = false;
    return;
  }
  if (isAimingInteractKind("level02_construction")) {
    clipHintEl.textContent = "施工痕迹正在改变，继续靠近观察";
    clipHintEl.hidden = false;
    return;
  }
  if (isAimingManilaEntry()) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 进入';
    clipHintEl.hidden = false;
    return;
  }
  if (isAimingInteractKind("level05_entrance")) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 沿熄灯楼梯进入 Level 0.5';
    clipHintEl.hidden = false;
    return;
  }
  if (isAimingInteractKind("level07_entrance")) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 触碰时间错位';
    clipHintEl.hidden = false;
    return;
  }
  if (isNearSpecialWall()) {
    clipHintEl.innerHTML = '按 <kbd>Q</kbd> 切出';
    clipHintEl.hidden = false;
    return;
  }
  clipHintEl.hidden = true;
}

function updateCrosshairL0() {
  if (!crosshairEl) return;
  var hide =
    (level0Zones && level0Zones.isActive("red")) ||
    isInventoryOpen() ||
    !survival ||
    survival.dead ||
    (!level0Zones || !level0Zones.isActive("02")) && clipState !== "idle";
  crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
  var interact =
    !hide &&
    (isAimingClipWall() ||
      isAimingGrayDoor() ||
      isAimingLevel02Exit() ||
      isAimingLevel01Entry() ||
      isAimingActiveZoneInteraction() ||
      isAimingManilaEntry() ||
      isAimingInteractKind("level05_entrance") ||
      isAimingInteractKind("level07_entrance") ||
      isAimingManilaInteraction());
  crosshairEl.classList.toggle("backrooms-crosshair--interact", interact);
}

function tryOpenGrayDoor() {
  if (
    (level0Zones && level0Zones.isInSubZone()) ||
    clipState !== "idle" ||
    !isAimingGrayDoor()
  ) {
    return;
  }
  if (level0Zones) level0Zones.enterLevel02();
}

function tryEnterLevel01() {
  if (
    !level0Zones ||
    level0Zones.isInSubZone() ||
    clipState !== "idle" ||
    !isAimingLevel01Entry()
  ) {
    return;
  }
  level0Zones.enterLevel01();
}

function tryLevel02ExitDoor() {
  if (!level0Zones || !level0Zones.isActive("02") || !isAimingLevel02Exit()) return;
  level0Zones.exitLevel02ToSpawn();
}

function pointInTrigger(px, pz, trigger) {
  return (
    trigger &&
    px >= trigger.minX &&
    px <= trigger.maxX &&
    pz >= trigger.minZ &&
    pz <= trigger.maxZ
  );
}

function enterManilaRoom() {
  if (
    manilaRoom ||
    !scene ||
    !level0WorldRoot ||
    (level0Zones && level0Zones.isInSubZone()) ||
    (survival && survival.dead)
  ) {
    return false;
  }
  manilaReturnSnapshot = {
    x: fps.player.x,
    z: fps.player.z,
    yaw: fps.yaw,
  };
  manilaRoom = buildManilaRoom(scene, {
    wallHeight: WALL_HEIGHT + 0.65,
    showToast: showBackroomsToast,
    grantAlmondWater: function () {
      return survival
        ? survival.addItem({ id: "almond_water", name: "杏仁水" })
        : false;
    },
  });
  level0WorldRoot.visible = false;
  fps.player.x = 0;
  fps.player.z = 2.9;
  fps.yaw = 0;
  fps.feetY = 0;
  fps.velY = 0;
  if (hallucinations) hallucinations.suspend();
  syncLevel0HudTitle("Backrooms · Level 0 · 马尼拉房间");
  showBackroomsToast("一间未登记的昏黄办公室。北面没有出口。");
  return true;
}

function exitManilaRoom() {
  if (!manilaRoom) return;
  manilaRoom.dispose();
  manilaRoom = null;
  level0WorldRoot.visible = true;
  if (manilaReturnSnapshot) {
    fps.player.x = manilaReturnSnapshot.x;
    fps.player.z = manilaReturnSnapshot.z;
    fps.yaw = manilaReturnSnapshot.yaw;
  }
  manilaReturnSnapshot = null;
  manilaTriggerCooldownUntil = performance.now() + 1800;
  fps.feetY = 0;
  fps.velY = 0;
  if (hallucinations) hallucinations.resume();
  syncLevel0HudTitle("Backrooms · Level 0 · 生存难度 1");
}

function checkManilaTriggers() {
  if (manilaRoom) {
    if (pointInTrigger(fps.player.x, fps.player.z, manilaRoom.exitTrigger)) {
      exitManilaRoom();
    }
    return;
  }
  if (!level0World || performance.now() < manilaTriggerCooldownUntil) return;
  var triggers = level0World.getPoiTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (
      (triggers[i].kind === "manila" || triggers[i].poiKind === "manila") &&
      pointInTrigger(fps.player.x, fps.player.z, triggers[i])
    ) {
      enterManilaRoom();
      return;
    }
  }
}

function tryPrimaryQAction() {
  if (manilaRoom) {
    if (isAimingManilaInteraction()) manilaRoom.interact(currentAimPickL0.data);
    return;
  }
  if (level0Zones && level0Zones.isActive("torment")) {
    if (isAimingActiveZoneInteraction()) {
      level0Zones.interact(currentAimPickL0.data);
    }
    return;
  }
  if (level0Zones && level0Zones.isActive("03")) {
    if (isAimingActiveZoneInteraction()) {
      level0Zones.interact(currentAimPickL0.data);
    }
    return;
  }
  if (
    level0Zones &&
    (level0Zones.isActive("05") || level0Zones.isActive("07"))
  ) {
    if (isAimingActiveZoneInteraction()) {
      level0Zones.interact(currentAimPickL0.data);
    }
    return;
  }
  if (level0Zones && level0Zones.isActive("02")) {
    if (isAimingLevel02Exit()) tryLevel02ExitDoor();
    else if (isAimingActiveZoneInteraction()) {
      level0Zones.interact(currentAimPickL0.data);
    }
    return;
  }
  if (level0Zones && level0Zones.isActive("01")) {
    if (isAimingActiveZoneInteraction()) {
      level0Zones.interact(currentAimPickL0.data);
    }
    return;
  }
  if (isAimingGrayDoor()) {
    tryOpenGrayDoor();
    return;
  }
  if (isAimingInteractKind("level02_construction")) {
    showBackroomsToast("白灰覆盖着尚未完成的门洞。");
    return;
  }
  if (isAimingManilaEntry()) {
    enterManilaRoom();
    return;
  }
  if (isAimingInteractKind("level05_entrance")) {
    if (level0Zones) level0Zones.enterLevel05();
    return;
  }
  if (isAimingInteractKind("level07_entrance")) {
    if (level0Zones) level0Zones.enterLevel07();
    return;
  }
  if (isAimingLevel01Entry()) {
    tryEnterLevel01();
    return;
  }
  if (isNearSpecialWall()) {
    tryClipOut();
    return;
  }
  if (!camera) return;
  var aim = getCameraAimRay(camera, 3.6);
  var wallDistance = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    3.6,
    getActiveColliders(),
    0,
    WALL_HEIGHT
  );
  if (!Number.isFinite(wallDistance) || wallDistance > 3.6) return;
  failedClipAttempts += 1;
  if (level0World) level0World.noteFailedClip();
  if (failedClipAttempts === 3) {
    showBackroomsToast("这面墙没有反应。远处的嗡鸣似乎改变了方向。");
  } else if (failedClipAttempts === 6) {
    showBackroomsToast("别相信每一面墙。留意异常闪烁。");
  }
}

function tryClipOut() {
  if (clipState !== "idle" || !isNearSpecialWall()) return;
  fps.player.x += Math.sin(fps.yaw);
  fps.player.z -= Math.cos(fps.yaw);
  setSpecialWallGhost(true);
  clipState = "dashing";
  clipDashLeft = CLIP_DASH_TIME;
  fps.move.forward = true;
  if (clipHintEl) clipHintEl.hidden = true;
}

function goToLevel1FromL0() {
  if (clipState === "done") return;
  clipState = "done";
  if (hallucinations) hallucinations.dispose();
  hallucinations = null;
  fps.move.forward = false;
  if (clipHintEl) clipHintEl.hidden = true;
  saveBackroomsSurvival(survival);
  var entersC101 = Math.random() < 0.015;
  if (entersC101) {
    try {
      grantLevelPass("c101", fps.yaw);
    } catch (err0) {
      /* ignore */
    }
    queueEnterLevelBanner("Level C-101 · 服务器机房");
    fadeOutLevel0Music(MUSIC_FADE_OUT_MS).then(function () {
      window.location.href = "backrooms-level-c101.html";
    });
    return;
  }
  try {
    grantLevelPass("clip");
    sessionStorage.setItem("backrooms_clip_yaw", String(fps.yaw));
  } catch (err) {
    /* ignore */
  }
  queueEnterLevelNumber(1);
  fadeOutLevel0Music(MUSIC_FADE_OUT_MS).then(function () {
    window.location.href = "backrooms-level1.html";
  });
}

function goToLevel37FromL0() {
  if (clipState === "done") return;
  clipState = "done";
  if (hallucinations) hallucinations.dispose();
  hallucinations = null;
  fps.move.forward = false;
  if (clipHintEl) clipHintEl.hidden = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("l37", fps.yaw);
  queueEnterLevelNumber(37);
  fadeOutLevel0Music(MUSIC_FADE_OUT_MS).then(function () {
    window.location.href = "backrooms-level37.html";
  });
}

function updateClipDash(dt) {
  if (clipState !== "dashing") return;
  movePlayer(dt, CLIP_DASH_SPEED / fps.player.speed);
  clipDashLeft -= dt;
  if (clipDashLeft <= 0) {
    goToLevel1FromL0();
  }
}

function isDevJumpOpen() {
  return !!(devJumpEl && !devJumpEl.hidden);
}

function closeDevJump() {
  if (!devJumpEl) return;
  devJumpEl.hidden = true;
  if (devJumpInputEl) devJumpInputEl.value = "";
  if (canvas && canvas.focus) canvas.focus();
}

function openDevJump() {
  if (!devJumpEl || clipState !== "idle") return;
  if (level0Zones && level0Zones.isInSubZone()) return;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  fps.move.forward = false;
  fps.move.back = false;
  fps.move.left = false;
  fps.move.right = false;
  devJumpEl.hidden = false;
  if (devJumpInputEl) {
    devJumpInputEl.value = "";
    devJumpInputEl.focus();
  }
}

function bindDevJump() {
  if (!devJumpEl) return;
  devJumpEl.addEventListener("submit", function (event) {
    event.preventDefault();
    var command = devJumpInputEl ? devJumpInputEl.value.trim().toLowerCase() : "";
    if (command === "chen") {
      closeDevJump();
      goToLevel1FromL0();
      return;
    }
    showBackroomsToast("测试指令无效");
    if (devJumpInputEl) {
      devJumpInputEl.select();
      devJumpInputEl.focus();
    }
  });
  var cancel = devJumpEl.querySelector("[data-dev-jump-cancel]");
  if (cancel) cancel.addEventListener("click", closeDevJump);
}

const mobileLookRef = { current: null };

function syncLookUi() {
  syncBackroomsPointerLockBodyClass(fps);
  if (mobileLookRef.current) {
    mobileLookRef.current.syncInputDragClass(fps.pointerLocked);
  }
  if (!hintEl) return;
  var drag = mobileLookRef.current && mobileLookRef.current.isDragLook();
  if (fps.pointerLocked) {
    hintEl.innerHTML =
      "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>B</kbd> 背包";
  } else if (drag) {
    hintEl.innerHTML =
      "拖动视角 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包";
  } else {
    hintEl.innerHTML =
      "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包 · 点击画面锁定鼠标";
  }
}

function bindControls() {
  bindLevel0Music();
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    mobileLookRef: mobileLookRef,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen() || isDevJumpOpen();
    },
    onJump: function () {
      tryJump();
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (isDevJumpOpen()) {
        if (e.code === "Escape") closeDevJump();
        return true;
      }
      if (e.code === "KeyC" && !e.repeat) {
        e.preventDefault();
        openDevJump();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryPrimaryQAction();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
    onPointerLockChange: function (locked) {
      if (locked) startLevel0Music();
      syncLookUi();
    },
  });
  window.addEventListener("resize", onResize);
  bindDevJump();
  syncLookUi();
}

function onResize() {
  if (!renderer || !camera) return;
  var w = window.innerWidth;
  var h = window.innerHeight;
  applyBackroomsRendererSize(renderer, w, h, level0GfxProfile || undefined);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  var fx = document.getElementById("backroomsL0Fx");
  if (fx) {
    var fxScale = Math.min(2, window.devicePixelRatio || 1);
    fx.width = Math.max(1, Math.floor(w * fxScale));
    fx.height = Math.max(1, Math.floor(h * fxScale));
  }
}

function disposeLevel0Runtime() {
  stopRedTinnitus();
  if (hallucinations) hallucinations.dispose();
  hallucinations = null;
  if (manilaRoom) manilaRoom.dispose();
  manilaRoom = null;
  if (level0Zones) level0Zones.dispose();
  level0Zones = null;
  if (level0World) level0World.dispose();
  level0World = null;
  if (fluorescentLightPool) fluorescentLightPool.dispose();
  fluorescentLightPool = null;
  disposeClipWallVortex();
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
  // 由其他层级切入 L0 时保留背包、血量、积分与夜视计时；只有新开一局才清档。
  var carried = consumeLevel0CarryEntry(function (yaw) {
    fps.yaw = yaw;
  });
  if (!carried) {
    resetBackroomsRun();
    resetMegPoints();
    try {
      sessionStorage.removeItem(MANILA_SESSION_KEY);
      resetLevel01LootSession();
    } catch (manilaResetErr) {
      /* ignore */
    }
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l0");
  validateMatrix();

  level0GfxProfile = resolveBackroomsGfxProfile();
  if (level0GfxProfile.tier === "low") {
    console.info(
      "[Backrooms L0] 轻量画质（Retina/Safari 或 ?gfx=low）。高清：?gfx=high 或 localStorage backrooms_gfx_tier=high"
    );
  }

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
    antialias: level0GfxProfile.antialias,
    powerPreference: "high-performance",
  });
  applyBackroomsRendererSize(
    renderer,
    window.innerWidth,
    window.innerHeight,
    level0GfxProfile
  );
  // L0 只有 hemi/ambient/点光，开 shadowMap 无平行光投射源，恒关
  renderer.shadowMap.enabled = false;
  applyBackroomsToneMapping(renderer);

  var levelRoot = new THREE.Group();
  levelRoot.name = "BackroomsLevel0";
  scene.add(levelRoot);
  level0WorldRoot = levelRoot;

  var seedKey = "backrooms_level0_world_seed_v1";
  var worldSeed = "";
  try {
    worldSeed = sessionStorage.getItem(seedKey) || "";
    if (!worldSeed || !carried) {
      worldSeed =
        Date.now().toString(36) + Math.floor(Math.random() * 0xffffffff).toString(36);
      sessionStorage.setItem(seedKey, worldSeed);
    }
  } catch (seedErr) {
    worldSeed = Date.now().toString(36);
  }
  level0World = createLevel0WorldManager(levelRoot, {
    gridSize: GRID_SIZE,
    wallHeight: WALL_HEIGHT,
    sessionSeed: worldSeed,
    gfxProfile: level0GfxProfile,
    wallMaterialFactory: createWallMaterial,
    floorMaterialFactory: createFloorMaterial,
    ceilingMaterialFactory: createCeilingMaterial,
    specialMaterialFactory: createSpecialClipWallMaterial,
  });
  addStreamingAmbientLights(levelRoot);
  var streamedSpawn = level0World.getSpawnPoint();
  spawnPoint.x = streamedSpawn.x;
  spawnPoint.z = streamedSpawn.z;

  level0Zones = createLevel0ZoneManager({
    scene: scene,
    camera: camera,
    level0WorldRoot: level0WorldRoot,
    getMainColliders: function () {
      return level0World ? level0World.getColliders() : wallColliders;
    },
    getPoiTriggers: function () {
      return level0World ? level0World.getPoiTriggers() : [];
    },
    getLevel02Snapshot: function () {
      return level0World ? level0World.getSnapshotMatrix() : BACKROOMS_MATRIX;
    },
    fps: fps,
    getSurvival: function () {
      return survival;
    },
    isPlayerMoving: isPlayerMoving,
    canRunMainPhenomena: function () {
      return !manilaRoom && clipState === "idle";
    },
    spawnPoint: spawnPoint,
    gridSize: GRID_SIZE,
    wallHeight: WALL_HEIGHT,
    bodyHeight: BODY_HEIGHT,
    fogNear: FOG_NEAR,
    fogFar: FOG_FAR,
    l0FogColor: FOG_COLOR,
    matrix: BACKROOMS_MATRIX,
    mapRows: MAP_ROWS,
    mapCols: MAP_COLS,
    mapWidth: MAP_WIDTH,
    mapDepth: MAP_DEPTH,
    cellCenterX: cellCenterX,
    cellCenterZ: cellCenterZ,
    showToast: showBackroomsToast,
    onHudTitleChange: syncLevel0HudTitle,
    onEnterSubLevel: function (id) {
      if (hallucinations) {
        if (id === "01") hallucinations.resume();
        else hallucinations.suspend();
      }
      if (id !== "01") fadeOutLevel0Music(MUSIC_FADE_OUT_MS);
    },
    onExitSubLevel: function (id) {
      if (hallucinations) hallucinations.resume();
      if (id === "red" && hallucinations && hallucinations.beginAfterglow) {
        hallucinations.beginAfterglow(45000 + Math.random() * 30000);
      }
      startLevel0Music();
    },
    onRedRoomEscaped: function () {
      markRedRoomSeenAndLeft(showBackroomsToast);
    },
    onLevel01Clip: function () {
      goToLevel1FromL0();
    },
    onLevel05Exit: function (destination) {
      if (destination === "level37") goToLevel37FromL0();
      else goToLevel1FromL0();
    },
  });
  level0Zones.init();

  fps.player.x = spawnPoint.x;
  fps.player.z = spawnPoint.z;
  fps.feetY = 0;
  fps.velY = 0;
  fps.grounded = true;

  initSurvivalHud();
  hallucinations = createLevel0HallucinationPool({
    fxCanvas: document.getElementById("backroomsL0Fx"),
    camera: camera,
    getPlayer: function () {
      return {
        x: fps.player.x,
        z: fps.player.z,
        yaw: fps.yaw,
        pitch: fps.pitch,
      };
    },
    getSurvival: function () {
      return survival;
    },
    isPaused: function () {
      return (
        !!manilaRoom ||
        (level0Zones &&
          level0Zones.isInSubZone() &&
          !level0Zones.isActive("01")) ||
        isInventoryOpen() ||
        isTaskUiOpen() ||
        isDevJumpOpen() ||
        clipState !== "idle" ||
        !!(survival && survival.dead)
      );
    },
    showToast: showBackroomsToast,
    setMusicDuck: setLevel0MusicDuck,
    getFrequencyMultiplier: function () {
      return level0Zones && level0Zones.isActive("01") ? 2.6 : 1;
    },
    setLightHallucinationMul: function (value) {
      lightHallucinationMul = value;
    },
  });
  initBackroomsTemperature(0, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  window.addEventListener("pagehide", disposeLevel0Runtime, { once: true });
  bindControls();
  syncLookUi();
  onResize();
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  startGuardedRafLoop({
    label: "Backrooms L0",
    showError: showError,
    tick: function () {
    var dt = Math.min(clock.getDelta(), 0.05);
    if (typeof document !== "undefined" && document.hidden) return;

    var elapsed = clock.getElapsedTime();
    var nowMs = performance.now();
    if (
      level0World &&
      !manilaRoom &&
      (!level0Zones || !level0Zones.isInSubZone())
    ) {
      level0World.update(fps.player.x, fps.player.z, nowMs);
      specialClipWallMesh = level0World.getSpecialClipWall();
    }
    updateLevel02EntryAnomaly(nowMs);
    updateRedEntranceAnomaly(nowMs);
    var blackout = updateLevel0Lighting(elapsed);
    updateSpecialClipWallFlicker(elapsed);
    if (!level0Zones || level0Zones.shouldUpdateRedDoorFlicker()) {
      updateRedDoorWallFlicker(elapsed);
    }
    var moving = isPlayerMoving();
    var sprinting = isSprintHeld() && moving;
    var zoneEnv = level0Zones ? level0Zones.getSurvivalEnv() : _emptyZoneEnv;
    if (hallucinations) hallucinations.update(dt, nowMs);

    if (survival && !survival.dead) {
      _survCtx.blackout = blackout;
      _survCtx.nearLandmark = isNearCreepyLandmark();
      _survCtx.sprinting = sprinting;
      _survCtx.skipPassiveSanity = zoneEnv.skipPassiveSanity;
      _survCtx.sanityDrainPerSec =
        zoneEnv.sanityDrainPerSec +
        (hallucinations ? hallucinations.getSanityDrainPerSec() : 0);
      survival.update(dt, _survCtx);
    }

    updatePlayerPhysics(dt);
    if (level0Zones) level0Zones.update(dt);
    updateRedRoomAudio();
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isTaskUiOpen() &&
      !isDevJumpOpen()
    ) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      if (level0Zones && level0Zones.getMovementSpeedMul) {
        speedMul *= level0Zones.getMovementSpeedMul();
      }
      if (clipState === "dashing") {
        updateClipDash(dt);
      } else {
        movePlayer(dt, speedMul);
      }
      if (level0Zones) {
        if (level0Zones.isInSubZone()) level0Zones.checkSubZoneExits();
        else if (!manilaRoom && clipState === "idle") level0Zones.checkMainTriggers();
      }
      checkManilaTriggers();
      maybeHintLeftMainArea();
      if (
        level0World &&
        !manilaRoom &&
        (!level0Zones || !level0Zones.isInSubZone())
      ) {
        var loop = level0World.consumeLoopSuggestion(
          fps.player.x,
          fps.player.z,
          fps.yaw,
          nowMs
        );
        if (loop) {
          fps.player.x = loop.x;
          fps.player.z = loop.z;
          fps.velY = 0;
          showBackroomsToast("灯光跳了一拍。这个转角似乎见过。");
        }
      }
    }
    if (camera) {
      camera.position.set(fps.player.x, getCameraEyeY(), fps.player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = fps.yaw;
      camera.rotation.x = fps.pitch;
      aimPickFrame += 1;
      var pickEvery =
        level0GfxProfile && level0GfxProfile.aimPickEveryNFrames
          ? level0GfxProfile.aimPickEveryNFrames
          : 1;
      if (aimPickFrame % pickEvery === 0) refreshAimPickL0();
    }
    updateClipPrompt();
    updateCrosshairL0();
    if (hallucinations) hallucinations.draw(nowMs);
    if (level0Zones) {
      level0Zones.drawFx(document.getElementById("backroomsL0Fx"), nowMs);
    }
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    updateBackroomsColdDamage(
      survival,
      dt,
      level0Zones ? level0Zones.isColdDamageZone() : false
    );
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    },
  });
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

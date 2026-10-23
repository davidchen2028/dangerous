/**
 * 后室 Level 1 — 无限工业仓库（分块流式加载）
 * 供 backrooms-level1.js 与 action-scene.js 共用
 */
import * as THREE from "three";
import { resolveBackroomsGfxProfile } from "./backrooms-gfx-profile.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { LEVEL1_PROP, attachFittedProp, placeFittedProp } from "./backrooms-static-prop.js";
import {
  resolveCircleAgainstColliders,
  circleOverlapsAny,
} from "./backrooms-collide.js";
import { createPartygoersAt } from "./backrooms-partygoer.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";
import { buildEntity81CallDoor } from "./backrooms-entity81-spawn.js";
import {
  ALPHA_BRIEFING_TOAST,
  ALPHA_LOCKED_NOTE,
  ALPHA_OFFICE_LOCK_NOTE,
  ALPHA_SIGN,
  ALPHA_ZEPHYR_NOTE,
  ALPHA_AQUILA_NOTE,
  ALPHA_CELLAR_H,
  ALPHA_CELLAR_Y,
  ALPHA_LOBBY,
  ALPHA_ROOM_H,
  ALPHA_WING_DOOR_H,
  ALPHA_WING_DOOR_W,
  ALPHA_CORRIDOR_LEN,
  corridorProgress,
  getAlphaCeilingY,
  getAlphaFloorY,
  getAlphaLayout,
  getHubCorridor,
  isInsideAabb,
  isInsideAlphaCorridor,
  stickAlphaRampY,
  getZephyrBarricade,
  isInsideAlphaComplex,
  listAlphaClearBounds,
  listAlphaSolidColliders,
} from "./backrooms-level1-alpha-layout.js";

export const BLOCK_SIZE = 4.0;
export const WAREHOUSE_HEIGHT = 4.5;
/** 程序化铺砖用的模板尺寸（9×9 循环，降低柱密度） */
export const MAP_ROWS = 9;
export const MAP_COLS = 9;
export const SPAWN_CELL = { row: 0, col: 0 };
/** 切出落地世界坐标 — 独立切入大厅中心，保证开阔 */
export const SPAWN_WORLD = { x: 10, z: 10 };
/** 切出落点所在格（世界 10,10 → 格 2,2） */
export function spawnGridCell() {
  return {
    col: Math.floor(SPAWN_WORLD.x / BLOCK_SIZE),
    row: Math.floor(SPAWN_WORLD.z / BLOCK_SIZE),
  };
}

/** 仅保证出生格本身无柱（相邻格可刷柱） */
export const SPAWN_SAFE_CELL_RADIUS = 0;

/** 流式区块内放宝箱的本地格（相对区块左下角 0…8） */
const CHEST_LOCAL_CELL = { col: 4, row: 4 };
/** 每 2 个流式区块生成 1 个宝箱 */
const CHEST_CHUNK_STRIDE = 2;
/** 玩家走过多少个不同流式区块后生成 M.E.G 基地 */
export const MEG_BASE_CHUNK_TRAVEL = 5;
/** M.E.G 基地相对出生区块的偏移（向东 5 格） */
export const MEG_BASE_CHUNK_OFFSET = { cx: 5, cz: 0 };

var _megBaseCenter = null;
var _megBaseOccluderGroup = null;
var _megBaseHalfW = 8;
var _megBaseHalfD = 6;
/** @type {object[] | null} M.E.G 基地外墙碰撞（用于恢复同步） */
var _megBaseColliders = null;
/** @type {object | null} 基地正门（西） */
var _megDoorState = null;
/** @type {object | null} 基地后门（东） */
var _megBackDoorState = null;
/** @type {object[] | null} 四边门 */
var _megSideDoors = null;
/** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
var _megCorridorFootprint = null;
/** @type {{ group: THREE.Group, colliders: object[], collidersActive: boolean, ctx: object } | null} */
var _megCorridorState = null;
/** @type {THREE.Object3D[] | null} */
var _megAlphaPicks = null;
/** @type {object | null} */
var _megOfficeDoorState = null;
/** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }[] | null} */
var _megWingBounds = null;
/** @type {{ x: number, z: number } | null} */
var _megAlphaCenter = null;
export const CHEST_GLB_URL = "models/pirate-chest.glb";
/** 已预处理为 4 × 4.5 × 4 米、原点在几何中心，与 sharedWallGeo 的盒子同尺寸 */
export const PILLAR_GLB_URL = "models/level1-pillar.glb";
/** 已预处理为 2.4 × 0.08 × 0.5 米、原点在几何中心，与 sharedPanelGeo 的盒子同尺寸 */
export const LIGHT_PANEL_GLB_URL = "models/level1-light-panel.glb";
/** 区段地标。尺寸和朝向已烘焙进模型，原点在底面中心；铜轨例外，原点在顶面中心 */
export const EAGLE_GLB_URL = "models/level1-eagle-emblem.glb";
export const BRASS_RAIL_GLB_URL = "models/level1-brass-rail.glb";
export const FAKE_WINDOW_GLB_URL = "models/level1-fake-window.glb";
export const GOTHIC_ARCH_GLB_URL = "models/level1-gothic-arch.glb";
export const GOTHIC_COLUMN_GLB_URL = "models/level1-gothic-column.glb";
/** 已预处理为 3 米高、原点在藤茎根部；根须朝 -X 铺开，贴柱时 -X 朝向柱子 */
export const GARDEN_VINE_GLB_URL = "models/level1-garden-vine.glb";
/** 已预处理为 3.2 米高、原点在门框底部中心；门洞朝 +Z，门框占 x ±0.97、z -0.55..0.69 */
export const OVERGROWN_DOORWAY_GLB_URL = "models/level1-overgrown-doorway.glb";
/** 已预处理为 3.6 × 0.38 × 2.45 米、顶面 y=0 贴天花板；四根灯管沿 X */
export const LEGEND_NEON_GLB_URL = "models/level1-legend-neon.glb";
/** 静态全身。源模型高约 0.98 米、面朝 -Z，装入后拉到 1.82 米并转到 +Z */
export const MEG_STAFF_GLB_URL = "models/level1-meg-staff.glb";
/** 静态路障。源模型宽沿 X 约 0.98 米、木板在 -Z、木箱朝 +Z */
export const ZEPHYR_BARRICADE_GLB_URL = "models/level1-zephyr-barricade.glb";
var MEG_STAFF_HEIGHT = 1.82;
var ZEPHYR_BARRICADE_WIDTH = 2.45;
/** 宝箱实体碰撞半宽（米） */
export const CHEST_COLLIDE_HALF = 0.46;
/** 墙体碰撞内缩（米）— 与视觉对齐，避免「看得见穿进墙」 */
export const WALL_COLLIDE_INSET = 0;

/** 每个流式区块 = 一整块 9×9 铺砖 */
export const CHUNK_CELLS = 9;
/** 玩家周围加载半径（区块数） */
export const STREAM_RADIUS = 2;

/** 9×9 稀疏柱阵 — 出生格 (2,2) 必为空地 */
export const LEVEL1_MATRIX = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 1, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 1, 0, 0, 0],
];

const CONCRETE_COLOR = 0x7f8c8d;
const FLOOR_COLOR = 0x2c3e50;
const CEILING_COLOR = 0xbdc3c7;
const LIGHT_COLOR = 0xdff9fb;

const LEVEL1_SECTIONS = [
  {
    id: "eagle",
    name: "天鹰段",
    floor: 0x34434c,
    wall: 0x7f8c8d,
    ceiling: 0xb9c1c4,
    light: 0xdff9fb,
  },
  {
    id: "golden",
    name: "跃金段",
    floor: 0x594738,
    wall: 0x9b8062,
    ceiling: 0xc8ab7b,
    light: 0xffd68a,
  },
  {
    id: "gothic",
    name: "哥特段",
    floor: 0x292c33,
    wall: 0x56515d,
    ceiling: 0x77717d,
    light: 0xb9c7e8,
  },
  {
    id: "garden",
    name: "花园段",
    floor: 0x263b32,
    wall: 0x617565,
    ceiling: 0x84917f,
    light: 0xb8d59b,
  },
  {
    id: "legend",
    name: "传说段",
    floor: 0x3b2928,
    wall: 0x77564c,
    ceiling: 0x806c62,
    light: 0xff7fd5,
  },
];

function sectionHash(cx, cz) {
  var n = Math.imul(cx ^ 0x45d9f3b, 0x27d4eb2d);
  n ^= Math.imul(cz ^ 0x119de1f3, 0x165667b1);
  n ^= n >>> 15;
  return n >>> 0;
}

function sectionForChunk(cx, cz) {
  // Level 0 切入点与 Alpha 基地都属于新人最常抵达的天鹰段。
  if (Math.abs(cx) <= 2 && Math.abs(cz) <= 2) return LEVEL1_SECTIONS[0];
  if (Math.abs(cx - MEG_BASE_CHUNK_OFFSET.cx) <= 1 && Math.abs(cz) <= 1) {
    return LEVEL1_SECTIONS[0];
  }
  var regionX = Math.floor(cx / 3);
  var regionZ = Math.floor(cz / 3);
  return LEVEL1_SECTIONS[
    1 + (sectionHash(regionX, regionZ) % (LEVEL1_SECTIONS.length - 1))
  ];
}

export function getLevel1SectionAt(wx, wz) {
  var chunk = worldToChunk(wx, wz);
  var section = sectionForChunk(chunk.cx, chunk.cz);
  return { id: section.id, name: section.name };
}

var _wallGeo = null;
var _wallMat = null;
var _floorMat = null;
var _ceilingMat = null;
var _panelGeo = null;
var _panelMat = null;
var _chestGeo = null;
var _chestMat = null;
var _chestTemplate = null;
var _chestLoadStarted = false;
var _chestLoadPending = [];
var _wallDummy = null;
/** 重构模组改了柱色后，柱子不再贴模型贴图 */
var _wallMatLocked = false;
var _propModelsStarted = false;
/** 当前存活的世界 ctx，模型异步到达后刷新它们已加载的区块 */
var _propModelCtxs = new Set();
/** @type {Record<string, THREE.Object3D>} 区段地标模板，几何和材质在各区块间共享 */
var _sectionPropTemplates = Object.create(null);
/** @type {THREE.Object3D | null} */
var _staffTemplate = null;
var _staffLoadStarted = false;
/** @type {THREE.Group[]} */
var _staffSlots = [];
/** @type {THREE.Object3D | null} */
var _zephyrTemplate = null;
var _zephyrLoadStarted = false;
/** @type {THREE.Group[]} */
var _zephyrSlots = [];

function imod(n, m) {
  return ((n % m) + m) % m;
}

function chunkKey(cx, cz) {
  return cx + "," + cz;
}

export function cellWorldCenter(gCol, gRow) {
  return {
    x: gCol * BLOCK_SIZE + BLOCK_SIZE * 0.5,
    z: gRow * BLOCK_SIZE + BLOCK_SIZE * 0.5,
  };
}

export function worldToChunk(wx, wz) {
  var gCol = Math.floor(wx / BLOCK_SIZE);
  var gRow = Math.floor(wz / BLOCK_SIZE);
  return {
    cx: Math.floor(gCol / CHUNK_CELLS),
    cz: Math.floor(gRow / CHUNK_CELLS),
    gCol: gCol,
    gRow: gRow,
  };
}

function isSpawnSafeCell(gCol, gRow) {
  var s = spawnGridCell();
  return (
    Math.abs(gCol - s.col) <= SPAWN_SAFE_CELL_RADIUS &&
    Math.abs(gRow - s.row) <= SPAWN_SAFE_CELL_RADIUS
  );
}

function spawnChunkCoords() {
  return worldToChunk(SPAWN_WORLD.x, SPAWN_WORLD.z);
}

/** 出生点所在流式区块的世界坐标包围盒（半开区间） */
export function getSpawnChunkBounds() {
  var sc = spawnChunkCoords();
  var size = CHUNK_CELLS * BLOCK_SIZE;
  return {
    minX: sc.cx * size,
    maxX: (sc.cx + 1) * size,
    minZ: sc.cz * size,
    maxZ: (sc.cz + 1) * size,
  };
}

function megBaseWorldCenter() {
  var sc = spawnChunkCoords();
  var cx = sc.cx + MEG_BASE_CHUNK_OFFSET.cx;
  var cz = sc.cz + MEG_BASE_CHUNK_OFFSET.cz;
  var baseCol = cx * CHUNK_CELLS;
  var baseRow = cz * CHUNK_CELLS;
  return {
    x: (baseCol + CHUNK_CELLS * 0.5) * BLOCK_SIZE,
    z: (baseRow + CHUNK_CELLS * 0.5) * BLOCK_SIZE,
    cx: cx,
    cz: cz,
  };
}

function isInMegBaseFootprint(gCol, gRow) {
  if (!_megBaseCenter) return false;
  var c = cellWorldCenter(gCol, gRow);
  var L = getAlphaLayout(_megBaseCenter);
  return cellAabbOverlaps(c.x, c.z, L.lobby, 0);
}

var MEG_CORRIDOR_LEN = 52;

function unionCorridorFootprints(center) {
  var L = getAlphaLayout(center);
  var keys = ["sw", "se", "nw", "ne"];
  var minX = Infinity;
  var maxX = -Infinity;
  var minZ = Infinity;
  var maxZ = -Infinity;
  for (var i = 0; i < keys.length; i++) {
    var b = L.corridors[keys[i]];
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  return {
    minX: minX - 0.5,
    maxX: maxX + 0.5,
    minZ: minZ - 0.5,
    maxZ: maxZ + 0.5,
  };
}

function cellAabbOverlaps(cx, cz, b, pad) {
  if (!b) return false;
  var half = BLOCK_SIZE * 0.5 + (pad || 0);
  return (
    cx + half > b.minX &&
    cx - half < b.maxX &&
    cz + half > b.minZ &&
    cz - half < b.maxZ
  );
}

function isInMegCorridorFootprint(gCol, gRow) {
  if (!_megAlphaCenter && !_megBaseCenter) return false;
  var L = getAlphaLayout(_megAlphaCenter || _megBaseCenter);
  var c = cellWorldCenter(gCol, gRow);
  var keys = ["sw", "se", "nw", "ne"];
  for (var i = 0; i < keys.length; i++) {
    if (cellAabbOverlaps(c.x, c.z, L.corridors[keys[i]], 0.15)) return true;
  }
  return false;
}

function isInMegWingFootprint(gCol, gRow) {
  if (!_megWingBounds) return false;
  var c = cellWorldCenter(gCol, gRow);
  for (var i = 0; i < _megWingBounds.length; i++) {
    if (cellAabbOverlaps(c.x, c.z, _megWingBounds[i], 0)) return true;
  }
  return false;
}

function isInMegClearFootprint(gCol, gRow) {
  return (
    isInMegBaseFootprint(gCol, gRow) ||
    isInMegCorridorFootprint(gCol, gRow) ||
    isInMegWingFootprint(gCol, gRow)
  );
}

function isInsideMegBaseInterior(px, pz) {
  var center = megAlphaCenterOrNull();
  if (!center) return false;
  var L = getAlphaLayout(center);
  if (isInsideAabb(px, pz, L.lobby, 0)) return true;
  return isInsideAabb(px, pz, L.stairs, 0) || isInsideAabb(px, pz, L.cellar, 0);
}

function megAlphaCenterOrNull() {
  return _megAlphaCenter || _megBaseCenter;
}

function isInsideMegBaseComplex(px, pz) {
  if (isInsideMegBaseInterior(px, pz)) return true;
  var center = megAlphaCenterOrNull();
  if (!center) return false;
  return isInsideAlphaComplex(px, pz, center);
}

function createMegSignTexture(text) {
  var canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 160;
  var ctx2d = canvas.getContext("2d");
  ctx2d.fillStyle = "#142028";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  ctx2d.strokeStyle = "#5eb3e8";
  ctx2d.lineWidth = 6;
  ctx2d.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx2d.fillStyle = "#e8f6ff";
  var fontSize = text.length > 14 ? 34 : text.length > 10 ? 42 : 52;
  ctx2d.font =
    "bold " +
    fontSize +
    "px system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillText(text, canvas.width * 0.5, canvas.height * 0.5);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function registerMegCollider(ctx, list, minX, maxX, minZ, maxZ, minY, maxY) {
  var c = {
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  };
  if (minY != null) c.minY = minY;
  if (maxY != null) c.maxY = maxY;
  registerMegColliderObject(ctx, list, c);
}

function syncMegBaseColliders(ctx) {
  if (!_megBaseColliders || !ctx) return;
  var i;
  for (i = 0; i < _megBaseColliders.length; i++) {
    var c = _megBaseColliders[i];
    if (!c || c.ghost) continue;
    if (ctx.colliders.indexOf(c) < 0) {
      ctx.colliders.push(c);
    }
    if (ctx.onWallCollider) ctx.onWallCollider(c);
  }
}

function registerMegColliderObject(ctx, list, collider) {
  list.push(collider);
  ctx.colliders.push(collider);
  if (ctx.onWallCollider) ctx.onWallCollider(collider);
}

function removeColliderFromCtx(ctx, collider) {
  if (!ctx || !collider) return;
  var idx = ctx.colliders.indexOf(collider);
  if (idx >= 0) ctx.colliders.splice(idx, 1);
  if (ctx.onWallColliderRemove) ctx.onWallColliderRemove(collider);
}

function ghostRemoveMegCollider(ctx, collider) {
  if (!collider) return;
  collider.ghost = true;
  removeColliderFromCtx(ctx, collider);
}

function updateSingleMegDoor(d, dt) {
  if (!d || !d.opening) return;
  d.t += dt;
  var p = d.t / d.duration;
  if (p >= 1) {
    p = 1;
    d.opening = false;
    d.open = true;
  }
  var ease = p * p * (3 - 2 * p);
  var y = d.y0 + (d.y1 - d.y0) * ease;
  d.mesh.position.y = y;
  if (d.extraMeshes) {
    for (var ei = 0; ei < d.extraMeshes.length; ei++) {
      d.extraMeshes[ei].position.y = y;
    }
  }
}

function updateMegDoorAnimation(dt) {
  updateSingleMegDoor(_megDoorState, dt);
  updateSingleMegDoor(_megBackDoorState, dt);
  if (_megSideDoors) {
    for (var di = 0; di < _megSideDoors.length; di++) {
      updateSingleMegDoor(_megSideDoors[di], dt);
    }
  }
  updateSingleMegDoor(_megOfficeDoorState, dt);
}

function pushAlphaPick(mesh) {
  if (!_megAlphaPicks) _megAlphaPicks = [];
  _megAlphaPicks.push(mesh);
}

function tryOpenMegOfficeDoorAim() {
  var d = _megOfficeDoorState;
  if (!d || d.open || d.opening) return false;
  d.opening = true;
  d.t = 0;
  if (d.collider) ghostRemoveMegCollider(d.ctx, d.collider);
  if (d.extraColliders) {
    for (var ci = 0; ci < d.extraColliders.length; ci++) {
      ghostRemoveMegCollider(d.ctx, d.extraColliders[ci]);
    }
  }
  if (d.pickMesh) d.pickMesh.visible = false;
  if (d.extraPicks) {
    for (var pi = 0; pi < d.extraPicks.length; pi++) {
      d.extraPicks[pi].visible = false;
    }
  }
  return true;
}

function isNearMegFrontDoor(px, pz) {
  var d = _megDoorState;
  if (!d || d.open || d.opening) return false;
  var dx = px - d.interactX;
  var dz = pz - d.interactZ;
  return Math.hypot(dx, dz) <= d.interactDist;
}

function isNearMegBackDoor(px, pz) {
  var d = _megBackDoorState;
  if (!d || d.open || d.opening) return false;
  if (!isInsideMegBaseInterior(px, pz)) return false;
  var dx = px - d.interactX;
  var dz = pz - d.interactZ;
  return Math.hypot(dx, dz) <= d.interactDist;
}

function isNearMegSideDoor(px, pz) {
  if (!_megSideDoors) return false;
  for (var i = 0; i < _megSideDoors.length; i++) {
    var d = _megSideDoors[i];
    if (!d || d.open || d.opening) continue;
    if (Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist) return true;
  }
  return false;
}

function isNearMegDoor(px, pz) {
  return (
    isNearMegFrontDoor(px, pz) ||
    isNearMegBackDoor(px, pz) ||
    isNearMegSideDoor(px, pz)
  );
}

function addZephyrPlaceholder(parent, mat, w, h, d, x, y, z) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.userData.l1ZephyrPlaceholder = true;
  parent.add(mesh);
  return mesh;
}

function addZephyrAt(group, innerW, signX, signZ, yaw) {
  var holder = new THREE.Group();
  holder.name = "ZephyrBarricade";
  holder.position.set(signX, 0, signZ);
  // 告示原朝向的 +Z 对着来人。模型木板在 -Z，再转半圈才让板面朝向来人。
  holder.rotation.y = yaw + Math.PI;
  group.add(holder);

  var crateMat = new THREE.MeshLambertMaterial({
    color: 0x6a5340,
    emissive: 0x181008,
  });
  var plankMat = new THREE.MeshLambertMaterial({
    color: 0x8a6a48,
    emissive: 0x1a1008,
  });
  var span = Math.max(0.4, innerW - 0.15);
  addZephyrPlaceholder(holder, crateMat, 1.15, 0.7, 0.7, -0.35, 0.35, 0.2);
  addZephyrPlaceholder(holder, crateMat, 1.15, 0.7, 0.7, 0.42, 0.35, 0.2);
  addZephyrPlaceholder(holder, plankMat, span, 1.6, 0.12, 0, 0.9, -0.22);
  var zephyrSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 0.42),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture(ALPHA_ZEPHYR_NOTE),
      transparent: false,
    })
  );
  zephyrSign.position.set(0, 1.55, -0.62);
  zephyrSign.rotation.y = Math.PI;
  zephyrSign.userData.l1Keep = true;
  holder.add(zephyrSign);
  addAlphaInteractPick(group, 0.55, 1.8, innerW, signX - 0.2, 1.0, signZ, {
    kind: "meg_zephyr_barricade",
    note: ALPHA_ZEPHYR_NOTE,
  });
  _zephyrSlots.push(holder);
  fillZephyrSlot(holder);
}

function buildOneCornerCorridor(root, ctx, co, id, bh) {
  var group = new THREE.Group();
  group.name = "MegCornerCorridor_" + id;
  var whiteFloor = new THREE.MeshLambertMaterial({
    color: 0xf2f2f2,
    emissive: 0x282828,
  });
  var whiteWall = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0x222222,
  });
  var whiteCeil = new THREE.MeshLambertMaterial({
    color: 0xfafafa,
    emissive: 0x1a1a1a,
  });
  var innerW = co.halfW * 2;
  var len = ALPHA_CORRIDOR_LEN;
  var alongX = co.axis === "x";
  var mx = alongX ? co.midX : co.midX;
  var mz = alongX ? co.midZ : co.midZ;
  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? len : innerW, 0.14, alongX ? innerW : len),
    whiteFloor
  );
  floor.position.set(mx, 0.07, mz);
  group.add(floor);
  var ceil = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? len : innerW, 0.1, alongX ? innerW : len),
    whiteCeil
  );
  ceil.position.set(mx, bh, mz);
  group.add(ceil);
  var wallA = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? len : 0.14, bh, alongX ? 0.14 : len),
    whiteWall
  );
  if (alongX) wallA.position.set(mx, bh * 0.5, co.midZ + co.halfW);
  else wallA.position.set(co.midX + co.halfW, bh * 0.5, mz);
  group.add(wallA);
  var wallB = wallA.clone();
  if (alongX) wallB.position.z = co.midZ - co.halfW;
  else wallB.position.x = co.midX - co.halfW;
  group.add(wallB);
  var endWall = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.14 : innerW, bh, alongX ? innerW : 0.14),
    whiteWall
  );
  if (alongX) endWall.position.set(co.endX, bh * 0.5, co.midZ);
  else endWall.position.set(co.midX, bh * 0.5, co.endZ);
  group.add(endWall);
  var yaw = alongX ? (co.sign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5) : co.sign > 0 ? Math.PI : 0;
  if (id === "se") {
    addZephyrAt(
      group,
      innerW,
      alongX ? co.endX - co.sign * 0.72 : co.midX,
      alongX ? co.midZ : co.endZ - co.sign * 0.72,
      yaw
    );
  }
  var panelMat = sharedPanelMat();
  var panelGeo = sharedPanelGeo();
  for (var li = 0; li < 6; li++) {
    var panel = new THREE.Mesh(panelGeo, panelMat);
    var t = 4 + li * 8;
    if (alongX) panel.position.set(co.startX + co.sign * t, bh - 0.22, co.midZ);
    else panel.position.set(co.midX, bh - 0.22, co.startZ + co.sign * t);
    if (!alongX) panel.rotation.y = Math.PI * 0.5;
    group.add(panel);
  }
  root.add(group);
  var colliders;
  if (alongX) {
    colliders = [
      {
        kind: "wall",
        minX: co.minX,
        maxX: co.maxX,
        minZ: co.midZ + co.halfW - 0.07,
        maxZ: co.midZ + co.halfW + 0.14,
      },
      {
        kind: "wall",
        minX: co.minX,
        maxX: co.maxX,
        minZ: co.midZ - co.halfW - 0.14,
        maxZ: co.midZ - co.halfW + 0.07,
      },
      {
        kind: "wall",
        minX: co.endX - 0.07,
        maxX: co.endX + 0.14,
        minZ: co.midZ - co.halfW,
        maxZ: co.midZ + co.halfW,
      },
    ];
  } else {
    colliders = [
      {
        kind: "wall",
        minX: co.midX + co.halfW - 0.07,
        maxX: co.midX + co.halfW + 0.14,
        minZ: co.minZ,
        maxZ: co.maxZ,
      },
      {
        kind: "wall",
        minX: co.midX - co.halfW - 0.14,
        maxX: co.midX - co.halfW + 0.07,
        minZ: co.minZ,
        maxZ: co.maxZ,
      },
      {
        kind: "wall",
        minX: co.midX - co.halfW,
        maxX: co.midX + co.halfW,
        minZ: co.endZ - 0.07,
        maxZ: co.endZ + 0.14,
      },
    ];
  }
  return { group: group, colliders: colliders, wallN: alongX ? wallA : null, co: co, id: id };
}

function buildMegCornerCorridors(root, ctx, center, bh) {
  if (_megCorridorState) return _megCorridorState;
  var L = getAlphaLayout(center);
  var keys = ["sw", "se", "nw", "ne"];
  var all = [];
  var colliders = [];
  var seState = null;
  for (var i = 0; i < keys.length; i++) {
    var built = buildOneCornerCorridor(root, ctx, L.corridors[keys[i]], keys[i], bh);
    all.push(built);
    colliders = colliders.concat(built.colliders);
    if (keys[i] === "se") seState = built;
  }
  var zephyr = getZephyrBarricade(center);
  colliders.push({
    kind: "meg_zephyr_barricade",
    minX: Math.min(zephyr.minX, zephyr.maxX),
    maxX: Math.max(zephyr.minX, zephyr.maxX),
    minZ: Math.min(zephyr.minZ, zephyr.maxZ),
    maxZ: Math.max(zephyr.minZ, zephyr.maxZ),
  });
  _megCorridorState = {
    group: seState.group,
    colliders: colliders,
    collidersActive: false,
    ctx: ctx,
    wallN: seState.wallN,
    northGapOpen: false,
    all: all,
    bh: bh,
  };
  activateMegCorridor();
  return _megCorridorState;
}

/**
 * 在走廊北墙上开出通往枢纽路线的岔路口：北墙拆成两段，中间留出通行缺口。
 * @returns {boolean} 是否成功开口
 */
function carveMegCorridorNorthGap(gapMinX, gapMaxX) {
  var st = _megCorridorState;
  if (!st || st.northGapOpen || !_megAlphaCenter) return false;
  var hub = getHubCorridor(_megAlphaCenter);
  var startX = hub.startX;
  var endX = hub.endX;
  if (gapMinX <= startX + 0.4 || gapMaxX >= endX - 0.4) return false;

  var north = null;
  for (var i = 0; i < st.colliders.length; i++) {
    var c = st.colliders[i];
    if (
      c.minZ > hub.midZ &&
      c.maxX - c.minX > MEG_CORRIDOR_LEN * 0.5 &&
      c.minX <= startX + 0.5 &&
      c.maxX >= endX - 0.5
    ) {
      north = c;
      break;
    }
  }
  if (!north) return false;

  st.northGapOpen = true;
  var leftLen = gapMinX - startX;
  var rightLen = endX - gapMaxX;
  if (st.wallN) {
    st.wallN.scale.x = leftLen / MEG_CORRIDOR_LEN;
    st.wallN.position.x = startX + leftLen * 0.5;
    var wallN2 = st.wallN.clone();
    wallN2.scale.x = rightLen / MEG_CORRIDOR_LEN;
    wallN2.position.x = gapMaxX + rightLen * 0.5;
    st.group.add(wallN2);
  }
  north.maxX = gapMinX;
  var tail = {
    kind: "wall",
    minX: gapMaxX,
    maxX: endX,
    minZ: north.minZ,
    maxZ: north.maxZ,
  };
  st.colliders.push(tail);
  if (st.collidersActive && st.ctx) {
    st.ctx.colliders.push(tail);
    if (st.ctx.onWallCollider) st.ctx.onWallCollider(tail);
  }
  return true;
}

function activateMegCorridor() {
  var st = _megCorridorState;
  if (!st) return;
  if (st.collidersActive || !st.ctx) return;
  st.collidersActive = true;
  for (var i = 0; i < st.colliders.length; i++) {
    var c = st.colliders[i];
    st.ctx.colliders.push(c);
    if (st.ctx.onWallCollider) st.ctx.onWallCollider(c);
  }
}

function updateMegCorridorVisibility(px, pz) {
  var st = _megCorridorState;
  if (!st || !st.all) return;
  for (var i = 0; i < st.all.length; i++) {
    if (st.all[i].group) st.all[i].group.visible = true;
  }
}

function tryOpenMegFrontDoor(px, pz) {
  var d = _megDoorState;
  if (!d || d.open || d.opening) return false;
  if (!isNearMegFrontDoor(px, pz)) return false;
  d.opening = true;
  d.t = 0;
  if (d.collider) {
    ghostRemoveMegCollider(d.ctx, d.collider);
  }
  return true;
}

function tryOpenMegBackDoor(px, pz) {
  var d = _megBackDoorState;
  if (!d || d.open || d.opening) return false;
  if (!isNearMegBackDoor(px, pz)) return false;
  return openMegBackDoorInternal();
}

function openMegSideDoor(d) {
  if (!d || d.open || d.opening) return false;
  d.opening = true;
  d.t = 0;
  if (d.collider) ghostRemoveMegCollider(d.ctx, d.collider);
  if (d.outerBlocker) ghostRemoveMegCollider(d.ctx, d.outerBlocker);
  return true;
}

function openMegBackDoorInternal() {
  return openMegSideDoor(_megBackDoorState);
}

function tryOpenMegFrontDoorAim() {
  return openMegSideDoor(_megDoorState);
}

function tryOpenMegSideDoorAim(which) {
  if (which === "front") return openMegSideDoor(_megDoorState);
  if (which === "back") return openMegSideDoor(_megBackDoorState);
  if (!_megSideDoors) return false;
  for (var i = 0; i < _megSideDoors.length; i++) {
    if (_megSideDoors[i].which === which) return openMegSideDoor(_megSideDoors[i]);
  }
  return false;
}

function openMegBackDoorByAim() {
  return openMegBackDoorInternal();
}

function tryOpenMegDoor(px, pz) {
  if (tryOpenMegFrontDoor(px, pz)) return true;
  if (tryOpenMegBackDoor(px, pz)) return true;
  if (!_megSideDoors) return false;
  for (var i = 0; i < _megSideDoors.length; i++) {
    var d = _megSideDoors[i];
    if (!d || d.open || d.opening) continue;
    if (Math.hypot(px - d.interactX, pz - d.interactZ) <= d.interactDist) {
      return openMegSideDoor(d);
    }
  }
  return false;
}

/** @type {{ x: number, z: number, talkRadius: number } | null} */
var _megInteriorNpc = null;
/** @type {{ x: number, z: number, talkRadius: number } | null} 后门引导员 */
var _megBackDoorStaffNpc = null;
/** @type {{ x: number, z: number, talkRadius: number, group: THREE.Object3D } | null} Level 1.1 介绍员 */
var _megLevel11Npc = null;
/** @type {{ x: number, z: number, talkRadius: number, group: THREE.Object3D } | null} 任务包裹收件员 */
var _megPackageReceiverNpc = null;
/** @type {{ x: number, z: number, talkRadius: number, group: THREE.Object3D } | null} 寄存柜管理员 */
var _megStorageClerkNpc = null;
/** @type {{ x: number, z: number, talkRadius: number, group: THREE.Object3D } | null} 人事招募员 */
var _megRecruiterNpc = null;
/** @type {THREE.Object3D | null} */
var _level13Entrance = null;
/** @type {THREE.Object3D | null} 通往 Level C-1「交点」的封锁楼梯间门 */
var _levelC1Entrance = null;
/** @type {THREE.Object3D | null} */
var _e81CallPick = null;
function resetMegModuleState() {
  _megBaseCenter = null;
  _megBaseOccluderGroup = null;
  _megBaseColliders = null;
  _megDoorState = null;
  _megBackDoorState = null;
  _megSideDoors = null;
  _megCorridorFootprint = null;
  _megCorridorState = null;
  _megAlphaPicks = null;
  _megOfficeDoorState = null;
  _megWingBounds = null;
  _megAlphaCenter = null;
  _megInteriorNpc = null;
  _megBackDoorStaffNpc = null;
  _megLevel11Npc = null;
  _megPackageReceiverNpc = null;
  _megStorageClerkNpc = null;
  _megRecruiterNpc = null;
  _level13Entrance = null;
  _levelC1Entrance = null;
  _e81CallPick = null;
}

/** 出生区块 M.E.G 引导员 */
function buildMegStaffFigure(root, wx, wz, name, interactRole, uniformColor) {
  var group = new THREE.Group();
  group.name = name || "MegStaff";
  group.position.set(wx, 0, wz);
  group.userData.brInteract = {
    kind: "meg_npc",
    role: interactRole || "staff",
  };

  var uniformMat = new THREE.MeshLambertMaterial({
    color: uniformColor == null ? 0x2a5080 : uniformColor,
    emissive: 0x0a1828,
  });
  var skinMat = new THREE.MeshLambertMaterial({
    color: 0xc89a6a,
    emissive: 0x100804,
  });
  var legMat = new THREE.MeshLambertMaterial({
    color: 0x1a2840,
    emissive: 0x060810,
  });

  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), legMat);
  legL.position.set(-0.14, 0.425, 0);
  legL.userData.l1StaffPlaceholder = true;
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);

  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), uniformMat);
  torso.position.y = 1.21;
  torso.userData.l1StaffPlaceholder = true;
  group.add(torso);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.72;
  head.userData.l1StaffPlaceholder = true;
  group.add(head);

  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), uniformMat);
  armL.position.set(-0.36, 1.18, 0);
  armL.userData.l1StaffPlaceholder = true;
  group.add(armL);
  var armR = armL.clone();
  armR.position.x = 0.36;
  group.add(armR);

  var badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 128;
  badgeCanvas.height = 64;
  var bctx = badgeCanvas.getContext("2d");
  bctx.fillStyle = "#1a3050";
  bctx.fillRect(0, 0, 128, 64);
  bctx.fillStyle = "#8ec8ff";
  bctx.font = "bold 28px system-ui, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText("M.E.G", 64, 32);
  var badgeTex = new THREE.CanvasTexture(badgeCanvas);
  var badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.16),
    new THREE.MeshBasicMaterial({ map: badgeTex })
  );
  badge.position.set(0, 1.28, 0.17);
  badge.userData.l1StaffPlaceholder = true;
  group.add(badge);

  root.add(group);
  _staffSlots.push(group);
  fillStaffSlot(group);
  return { group: group, x: wx, z: wz };
}

export function buildMegGuideNpc(root) {
  var px = SPAWN_WORLD.x + 3.8;
  var pz = SPAWN_WORLD.z + 1.2;
  var built = buildMegStaffFigure(root, px, pz, "MegGuideNpc", "guide");
  return { group: built.group, x: px, z: pz, talkRadius: 3.2 };
}

function addAlphaInteractPick(parent, w, h, d, x, y, z, data) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    sharedChestPickMat()
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = data;
  parent.add(pick);
  pushAlphaPick(pick);
  return pick;
}

function buildAlphaRoomBox(group, mat, w, h, d, x, y, z) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

function hideMeshes(list) {
  return function () {
    var i;
    for (i = 0; i < list.length; i++) list[i].visible = false;
  };
}

/** 门枢在门洞中心。模型贴地后下移半扇，方块在模型到达前顶着门洞。 */
function mountMetalDoor(parent, x, z, yaw, height, width, fallbackMat) {
  var pivot = new THREE.Group();
  pivot.position.set(x, height * 0.5, z);
  pivot.rotation.y = yaw;
  parent.add(pivot);
  var slab = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1), fallbackMat);
  pivot.add(slab);
  attachFittedProp(
    pivot,
    LEVEL1_PROP.metalDoor,
    {
      axis: "y",
      target: height,
      name: "MetalDoorModel",
      offset: { y: -height * 0.5 },
    },
    function () {
      slab.visible = false;
    }
  );
  return pivot;
}

function registerAlphaLayoutColliders(ctx, megColliders, center, officeOpen) {
  var solids = listAlphaSolidColliders(center, { officeOpen: officeOpen });
  for (var i = 0; i < solids.length; i++) {
    var c = solids[i];
    if (c.kind === "meg_office_door") continue;
    registerMegColliderObject(ctx, megColliders, c);
  }
}

function buildAlphaHeadquarters(group, ctx, megColliders, center, wallBox) {
  var L = getAlphaLayout(center);
  _megAlphaCenter = { x: center.x, z: center.z };
  _megWingBounds = listAlphaClearBounds(center);
  _megAlphaPicks = _megAlphaPicks || [];

  var roomMat = new THREE.MeshLambertMaterial({
    color: 0x4e5d6c,
    emissive: 0x121820,
  });
  var floorMat = new THREE.MeshLambertMaterial({
    color: 0x3c4a56,
    emissive: 0x10161c,
  });
  var woodMat = new THREE.MeshLambertMaterial({
    color: 0x6a4a2e,
    emissive: 0x140c06,
  });
  var metalMat = new THREE.MeshLambertMaterial({
    color: 0x3a4048,
    emissive: 0x0c1014,
  });
  var doorMat = new THREE.MeshLambertMaterial({
    color: 0x2a3340,
    emissive: 0x080c10,
  });
  var lockDoorMat = new THREE.MeshLambertMaterial({
    color: 0x1c2430,
    emissive: 0x06080c,
  });

  var i;
  for (i = 0; i < L.wings.length; i++) {
    var wing = L.wings[i];
    var faceSouth = wing.z > L.cells.n.mz;
    var plaqueYaw = faceSouth ? Math.PI : 0;
    var plaqueZ = wing.z + (faceSouth ? -0.24 : 0.24);
    var pickZ = wing.z + (faceSouth ? -0.28 : 0.28);
    var plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.32),
      new THREE.MeshBasicMaterial({
        map: createMegSignTexture(wing.label),
        transparent: false,
      })
    );
    plaque.position.set(wing.x, ALPHA_WING_DOOR_H + 0.28, plaqueZ);
    plaque.rotation.y = plaqueYaw;
    group.add(plaque);

    if (wing.locked) {
      var lockedDoor = mountMetalDoor(
        group,
        wing.x,
        wing.z,
        faceSouth ? Math.PI : 0,
        ALPHA_WING_DOOR_H,
        ALPHA_WING_DOOR_W - 0.12,
        lockDoorMat
      );
      addAlphaInteractPick(
        group,
        ALPHA_WING_DOOR_W + 0.2,
        ALPHA_WING_DOOR_H + 0.15,
        0.7,
        wing.x,
        ALPHA_WING_DOOR_H * 0.5,
        pickZ,
        {
          kind: "meg_wing_door",
          wing: wing.id,
          label: wing.label,
          note: ALPHA_LOCKED_NOTE,
        }
      );
    }
  }

  var officeDoorMesh = mountMetalDoor(
    group,
    L.officeDoor.x,
    L.officeDoor.z,
    -Math.PI * 0.5,
    ALPHA_WING_DOOR_H,
    ALPHA_WING_DOOR_W - 0.12,
    doorMat
  );
  var officePlaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.32),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("高级办公室"),
      transparent: false,
    })
  );
  officePlaque.position.set(L.officeDoor.x - 0.24, ALPHA_WING_DOOR_H + 0.28, L.officeDoor.z);
  officePlaque.rotation.y = -Math.PI * 0.5;
  group.add(officePlaque);
  var officePick = addAlphaInteractPick(
    group,
    0.7,
    ALPHA_WING_DOOR_H + 0.15,
    ALPHA_WING_DOOR_W + 0.2,
    L.officeDoor.x - 0.28,
    ALPHA_WING_DOOR_H * 0.5,
    L.officeDoor.z,
    {
      kind: "meg_office_door",
      note: ALPHA_OFFICE_LOCK_NOTE,
    }
  );
  var officeDoorCollider = {
    kind: "meg_office_door",
    minX: L.officeDoor.x - 0.16,
    maxX: L.officeDoor.x + 0.16,
    minZ: L.officeDoor.minZ + 0.02,
    maxZ: L.officeDoor.maxZ - 0.02,
  };
  registerMegColliderObject(ctx, megColliders, officeDoorCollider);
  var officeNorthMesh = mountMetalDoor(
    group,
    L.officeNorthDoor.x,
    L.officeNorthDoor.z,
    Math.PI,
    ALPHA_WING_DOOR_H,
    ALPHA_WING_DOOR_W - 0.12,
    doorMat
  );
  var officeNorthPick = addAlphaInteractPick(
    group,
    ALPHA_WING_DOOR_W + 0.2,
    ALPHA_WING_DOOR_H + 0.15,
    0.7,
    L.officeNorthDoor.x,
    ALPHA_WING_DOOR_H * 0.5,
    L.officeNorthDoor.z,
    {
      kind: "meg_office_door",
      note: ALPHA_OFFICE_LOCK_NOTE,
    }
  );
  var officeNorthCollider = {
    kind: "meg_office_door",
    minX: L.officeNorthDoor.minX + 0.02,
    maxX: L.officeNorthDoor.maxX - 0.02,
    minZ: L.officeNorthDoor.z - 0.16,
    maxZ: L.officeNorthDoor.z + 0.16,
  };
  registerMegColliderObject(ctx, megColliders, officeNorthCollider);
  _megOfficeDoorState = {
    mesh: officeDoorMesh,
    pickMesh: officePick,
    collider: officeDoorCollider,
    extraMeshes: [officeNorthMesh],
    extraPicks: [officeNorthPick],
    extraColliders: [officeNorthCollider],
    ctx: ctx,
    open: false,
    opening: false,
    t: 0,
    duration: 1.05,
    y0: ALPHA_WING_DOOR_H * 0.5,
    y1: ALPHA_WING_DOOR_H * 1.45,
  };

  registerAlphaLayoutColliders(ctx, megColliders, center, false);

  var notice = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.72),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("失物招领 / 天鹰币"),
      transparent: false,
    })
  );
  notice.position.set(L.cells.n.mx + 5.5, 1.7, L.northZ - 0.23);
  notice.rotation.y = Math.PI;
  group.add(notice);
  addAlphaInteractPick(group, 1.8, 0.9, 0.45, L.cells.n.mx + 5.5, 1.7, L.northZ - 0.4, {
    kind: "meg_alpha_notice",
    note: ALPHA_AQUILA_NOTE,
  });

  function buildPocket(b, height, name) {
    var pocket = new THREE.Group();
    pocket.name = name;
    var fw = b.maxX - b.minX;
    var fd = b.maxZ - b.minZ;
    var mx = (b.minX + b.maxX) * 0.5;
    var mz = (b.minZ + b.maxZ) * 0.5;
    var floor = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.12, fd), floorMat);
    floor.position.set(mx, 0.06, mz);
    pocket.add(floor);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.2, 0.16, fd + 0.2), roomMat);
    roof.position.set(mx, height + 0.08, mz);
    pocket.add(roof);
    var lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.06, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xc8d8e8 })
    );
    lamp.position.set(mx, height - 0.12, mz);
    pocket.add(lamp);
    if (fw > 8 || fd > 8) {
      var extras = [
        [mx - fw * 0.28, mz - fd * 0.22],
        [mx + fw * 0.28, mz + fd * 0.22],
      ];
      for (var ei = 0; ei < extras.length; ei++) {
        var extraLamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.06, 0.7),
          new THREE.MeshBasicMaterial({ color: 0xc8d8e8 })
        );
        extraLamp.position.set(extras[ei][0], height - 0.12, extras[ei][1]);
        pocket.add(extraLamp);
      }
    }
    group.add(pocket);
    return { mx: mx, mz: mz, fw: fw, fd: fd, pocket: pocket };
  }

  var exploreBuilt = buildPocket(L.explore, ALPHA_ROOM_H, "MegExploreWing");
  var exploreDeskBoxes = [
    buildAlphaRoomBox(exploreBuilt.pocket, woodMat, 1.6, 0.08, 0.9, exploreBuilt.mx, 0.86, exploreBuilt.mz),
    buildAlphaRoomBox(exploreBuilt.pocket, woodMat, 0.08, 0.78, 0.08, exploreBuilt.mx - 0.62, 0.42, exploreBuilt.mz - 0.3),
    buildAlphaRoomBox(exploreBuilt.pocket, woodMat, 0.08, 0.78, 0.08, exploreBuilt.mx + 0.62, 0.42, exploreBuilt.mz + 0.3),
    buildAlphaRoomBox(exploreBuilt.pocket, metalMat, 0.28, 0.16, 0.22, exploreBuilt.mx + 0.28, 0.98, exploreBuilt.mz),
  ];
  placeFittedProp(
    exploreBuilt.pocket,
    LEVEL1_PROP.exploreDesk,
    exploreBuilt.mx,
    0,
    exploreBuilt.mz,
    { yaw: Math.PI * 0.5, axis: "x", target: 1.6, name: "ExploreDesk" },
    hideMeshes(exploreDeskBoxes)
  );
  placeFittedProp(exploreBuilt.pocket, LEVEL1_PROP.locker, L.explore.minX + 0.55, 0, exploreBuilt.mz - 2.4, {
    yaw: Math.PI * 0.5,
    axis: "y",
    target: 1.85,
    name: "ExploreLocker",
  });
  var briefing = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 0.7),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("路线简报"),
      transparent: false,
    })
  );
  briefing.position.set(exploreBuilt.mx, 1.85, L.explore.maxZ - 0.12);
  briefing.rotation.y = Math.PI;
  exploreBuilt.pocket.add(briefing);
  addAlphaInteractPick(exploreBuilt.pocket, 1.7, 0.9, 0.4, exploreBuilt.mx, 1.85, L.explore.maxZ - 0.28, {
    kind: "meg_explore_briefing",
    note: ALPHA_BRIEFING_TOAST,
  });

  var officeBuilt = buildPocket(L.office, ALPHA_ROOM_H, "MegOfficerOffice");
  var deskX = officeBuilt.mx - 0.85;
  var deskZ = officeBuilt.mz - 0.35;
  var officeDeskBoxes = [
    buildAlphaRoomBox(officeBuilt.pocket, woodMat, 1.7, 0.08, 0.86, deskX, 0.84, deskZ),
    buildAlphaRoomBox(officeBuilt.pocket, woodMat, 0.08, 0.76, 0.08, deskX - 0.7, 0.4, deskZ - 0.3),
    buildAlphaRoomBox(officeBuilt.pocket, woodMat, 0.08, 0.76, 0.08, deskX + 0.7, 0.4, deskZ + 0.3),
  ];
  placeFittedProp(
    officeBuilt.pocket,
    LEVEL1_PROP.officeDesk,
    deskX,
    0,
    deskZ,
    { axis: "x", target: 1.65, name: "OfficeDesk" },
    hideMeshes(officeDeskBoxes)
  );
  buildAlphaRoomBox(
    officeBuilt.pocket,
    new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    0.12,
    0.22,
    0.12,
    deskX + 0.55,
    1.08,
    deskZ
  );
  var fakeWin = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x8aa8c4 })
  );
  fakeWin.position.set(L.office.maxX - 0.12, 1.7, officeBuilt.mz);
  fakeWin.rotation.y = -Math.PI * 0.5;
  officeBuilt.pocket.add(fakeWin);
  placeFittedProp(
    officeBuilt.pocket,
    LEVEL1_PROP.officeWindow,
    L.office.maxX - 0.16,
    1.2,
    officeBuilt.mz,
    { yaw: -Math.PI * 0.5, axis: "y", target: 1.5, name: "OfficeWindow" },
    function () {
      fakeWin.visible = false;
    }
  );
  var officeCab = buildAlphaRoomBox(
    officeBuilt.pocket,
    metalMat,
    0.55,
    1.15,
    0.42,
    L.office.minX + 0.7,
    0.62,
    L.office.maxZ - 0.7
  );
  placeFittedProp(
    officeBuilt.pocket,
    LEVEL1_PROP.fileCabinet,
    L.office.minX + 0.7,
    0,
    L.office.maxZ - 0.75,
    { yaw: Math.PI, axis: "y", target: 1.25, name: "OfficeFileCabinet" },
    function () {
      officeCab.visible = false;
    }
  );
  var bedX = officeBuilt.mx + 2.5;
  var bedZ = L.office.minZ + 1.2;
  placeFittedProp(officeBuilt.pocket, LEVEL1_PROP.hospitalBed, bedX, 0, bedZ, {
    yaw: Math.PI * 0.5,
    axis: "x",
    target: 2.05,
    name: "OfficeBed",
  });
  placeFittedProp(officeBuilt.pocket, LEVEL1_PROP.bedsideCabinet, bedX + 1.4, 0, bedZ, {
    axis: "y",
    target: 0.62,
    name: "OfficeBedside",
  });
  var chairX = deskX;
  var chairZ = deskZ + 0.72;
  buildAlphaRoomBox(officeBuilt.pocket, woodMat, 0.42, 0.08, 0.42, chairX, 0.46, chairZ);
  buildAlphaRoomBox(officeBuilt.pocket, woodMat, 0.08, 0.42, 0.42, chairX, 0.72, chairZ + 0.16);
  addAlphaInteractPick(officeBuilt.pocket, 1.55, 0.55, 0.68, deskX, 0.88, deskZ, {
    kind: "meg_office_desk",
  });
  addAlphaInteractPick(officeBuilt.pocket, 0.55, 0.75, 0.55, chairX, 0.52, chairZ, {
    kind: "meg_office_chair",
  });
  var noticeX = L.office.minX + 2.4;
  var deptNotice = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.55),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("本职告示"),
      transparent: false,
    })
  );
  deptNotice.position.set(noticeX, 1.7, L.office.maxZ - 0.12);
  deptNotice.rotation.y = Math.PI;
  officeBuilt.pocket.add(deptNotice);
  addAlphaInteractPick(officeBuilt.pocket, 1.4, 0.7, 0.4, noticeX, 1.7, L.office.maxZ - 0.28, {
    kind: "meg_office_notice",
  });
  var plateZ = deskZ - 0.52;
  var rankPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.2),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("职级铭牌"),
      transparent: false,
    })
  );
  rankPlate.position.set(deskX + 0.48, 1.12, plateZ);
  rankPlate.rotation.y = Math.PI;
  officeBuilt.pocket.add(rankPlate);
  addAlphaInteractPick(officeBuilt.pocket, 0.7, 0.28, 0.28, deskX + 0.48, 1.12, plateZ, {
    kind: "meg_office_plate",
  });

  var stairGroup = new THREE.Group();
  stairGroup.name = "MegOfficeStairs";
  var stepCount = 8;
  var stepLen = (L.stairs.maxZ - L.stairs.minZ) / stepCount;
  var stepW = L.stairs.maxX - L.stairs.minX - 0.08;
  var sx = (L.stairs.minX + L.stairs.maxX) * 0.5;
  var stairMidZ = (L.stairs.minZ + L.stairs.maxZ) * 0.5;
  var stairSteps = [];
  for (var si = 0; si < stepCount; si++) {
    var sy = (ALPHA_CELLAR_Y * (si + 0.5)) / stepCount;
    var sz = L.stairs.minZ + stepLen * (si + 0.5);
    stairSteps.push(
      buildAlphaRoomBox(stairGroup, metalMat, stepW, 0.1, stepLen * 0.92, sx, sy + 0.05, sz)
    );
  }
  placeFittedProp(
    stairGroup,
    LEVEL1_PROP.cellarStairs,
    sx,
    ALPHA_CELLAR_Y + 0.12,
    stairMidZ,
    { axis: "y", target: -ALPHA_CELLAR_Y - 0.12, name: "CellarStairs" },
    hideMeshes(stairSteps)
  );
  var railH = ALPHA_ROOM_H - ALPHA_CELLAR_Y + 0.4;
  var railY = ALPHA_CELLAR_Y + railH * 0.5;
  buildAlphaRoomBox(
    stairGroup,
    roomMat,
    0.14,
    railH,
    L.stairs.maxZ - L.stairs.minZ,
    L.stairs.minX - 0.07,
    railY,
    stairMidZ
  );
  buildAlphaRoomBox(
    stairGroup,
    roomMat,
    0.14,
    railH,
    L.stairs.maxZ - L.stairs.minZ,
    L.stairs.maxX + 0.07,
    railY,
    stairMidZ
  );
  buildAlphaRoomBox(
    stairGroup,
    roomMat,
    stepW + 0.28,
    0.14,
    L.stairs.maxZ - L.stairs.minZ,
    sx,
    ALPHA_ROOM_H + 0.08,
    stairMidZ
  );
  group.add(stairGroup);

  var cellarFloor = new THREE.Mesh(
    new THREE.BoxGeometry(L.cellar.maxX - L.cellar.minX, 0.12, L.cellar.maxZ - L.cellar.minZ),
    floorMat
  );
  cellarFloor.position.set(
    (L.cellar.minX + L.cellar.maxX) * 0.5,
    ALPHA_CELLAR_Y + 0.06,
    (L.cellar.minZ + L.cellar.maxZ) * 0.5
  );
  group.add(cellarFloor);
  var cellarRoof = new THREE.Mesh(
    new THREE.BoxGeometry(L.cellar.maxX - L.cellar.minX + 0.2, 0.14, L.cellar.maxZ - L.cellar.minZ + 0.2),
    roomMat
  );
  cellarRoof.position.set(
    (L.cellar.minX + L.cellar.maxX) * 0.5,
    ALPHA_CELLAR_Y + ALPHA_CELLAR_H,
    (L.cellar.minZ + L.cellar.maxZ) * 0.5
  );
  group.add(cellarRoof);
  var cellarMidX = (L.cellar.minX + L.cellar.maxX) * 0.5;
  var cellarMidZ = (L.cellar.minZ + L.cellar.maxZ) * 0.5;
  buildAlphaRoomBox(group, roomMat, L.cellar.maxX - L.cellar.minX, ALPHA_CELLAR_H, 0.16, cellarMidX, ALPHA_CELLAR_Y + ALPHA_CELLAR_H * 0.5, L.cellar.maxZ);
  buildAlphaRoomBox(group, roomMat, 0.16, ALPHA_CELLAR_H, L.cellar.maxZ - L.cellar.minZ, L.cellar.minX, ALPHA_CELLAR_Y + ALPHA_CELLAR_H * 0.5, cellarMidZ);
  buildAlphaRoomBox(group, roomMat, 0.16, ALPHA_CELLAR_H, L.cellar.maxZ - L.cellar.minZ, L.cellar.maxX, ALPHA_CELLAR_Y + ALPHA_CELLAR_H * 0.5, cellarMidZ);
  var cellarSouthW = L.stairs.minX - L.cellar.minX;
  if (cellarSouthW > 0.3) {
    buildAlphaRoomBox(
      group,
      roomMat,
      cellarSouthW,
      ALPHA_CELLAR_H,
      0.16,
      L.cellar.minX + cellarSouthW * 0.5,
      ALPHA_CELLAR_Y + ALPHA_CELLAR_H * 0.5,
      L.cellar.minZ
    );
  }
  var cellarLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.06, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xc4b070 })
  );
  cellarLamp.position.set(cellarMidX, ALPHA_CELLAR_Y + ALPHA_CELLAR_H - 0.16, cellarMidZ);
  group.add(cellarLamp);
  var cellarLampA = cellarLamp.clone();
  cellarLampA.position.set(
    L.cellar.minX + 2.2,
    ALPHA_CELLAR_Y + ALPHA_CELLAR_H - 0.16,
    L.cellar.minZ + 2.2
  );
  group.add(cellarLampA);
  var cellarLampB = cellarLamp.clone();
  cellarLampB.position.set(
    L.cellar.maxX - 2.2,
    ALPHA_CELLAR_Y + ALPHA_CELLAR_H - 0.16,
    L.cellar.maxZ - 2.2
  );
  group.add(cellarLampB);
  var cellarLockerBox = buildAlphaRoomBox(
    group,
    metalMat,
    1.4,
    1.5,
    0.36,
    L.cellar.minX + 1.1,
    ALPHA_CELLAR_Y + 0.82,
    L.cellar.maxZ - 0.7
  );
  var cellarCabBox = buildAlphaRoomBox(
    group,
    metalMat,
    0.7,
    1.35,
    0.48,
    L.cellar.maxX - 0.85,
    ALPHA_CELLAR_Y + 0.74,
    cellarMidZ
  );
  placeFittedProp(
    group,
    LEVEL1_PROP.locker,
    L.cellar.minX + 1.1,
    ALPHA_CELLAR_Y + 0.12,
    L.cellar.maxZ - 0.55,
    { yaw: Math.PI, axis: "y", target: 1.55, name: "CellarLocker" },
    function () {
      cellarLockerBox.visible = false;
    }
  );
  placeFittedProp(
    group,
    LEVEL1_PROP.medicalCabinet,
    L.cellar.maxX - 0.85,
    ALPHA_CELLAR_Y + 0.12,
    cellarMidZ,
    { yaw: -Math.PI * 0.5, axis: "y", target: 1.45, name: "CellarMedicalCabinet" },
    function () {
      cellarCabBox.visible = false;
    }
  );
  var restrict = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.38),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("受限贮存"),
      transparent: false,
    })
  );
  restrict.position.set(cellarMidX, ALPHA_CELLAR_Y + 2.15, L.cellar.maxZ - 0.12);
  restrict.rotation.y = Math.PI;
  group.add(restrict);
  addAlphaInteractPick(group, 0.9, 1.4, 0.7, L.cellar.maxX - 0.85, ALPHA_CELLAR_Y + 0.85, cellarMidZ, {
    kind: "meg_cellar_cabinet",
  });
  addAlphaInteractPick(group, 1.6, 0.5, 0.35, cellarMidX, ALPHA_CELLAR_Y + 2.15, L.cellar.maxZ - 0.28, {
    kind: "meg_cellar_notice",
    note: "受限贮存 · 正式队员以上可开柜。容量仍是基地 100 格。",
  });
}

function buildMegAlphaBase(root, ctx) {
  var center = megBaseWorldCenter();
  _megBaseCenter = { x: center.x, z: center.z };

  var group = new THREE.Group();
  group.name = "MegAlphaBase";

  var wallMat = new THREE.MeshLambertMaterial({
    color: 0x5a6d7e,
    emissive: 0x182028,
  });
  var roofMat = new THREE.MeshLambertMaterial({
    color: 0x3a4652,
    emissive: 0x101820,
  });
  var padMat = new THREE.MeshLambertMaterial({
    color: 0x4a5868,
    emissive: 0x141c24,
  });
  var doorMat = new THREE.MeshLambertMaterial({
    color: 0x2e3844,
    emissive: 0x080c10,
  });

  var bw = ALPHA_LOBBY.w;
  var bd = ALPHA_LOBBY.d;
  var bh = ALPHA_LOBBY.h;
  var wallT = 0.4;
  var doorW = 2.8;
  var doorH = 3.2;
  var hx = bw * 0.5;
  var hz = bd * 0.5;
  _megBaseHalfW = hx;
  _megBaseHalfD = hz;
  var megColliders = [];
  var lintelH = bh - doorH;
  var doorThick = 0.14;
  var doorY0 = doorH * 0.5;
  var doorY1 = bh + doorH * 0.35;
  var wallPad = 0.22;

  function megWall(minX, maxX, minZ, maxZ) {
    registerMegCollider(
      ctx,
      megColliders,
      minX - wallPad,
      maxX + wallPad,
      minZ - wallPad,
      maxZ + wallPad
    );
  }

  var pad = new THREE.Mesh(
    new THREE.BoxGeometry(bw + 0.35, 0.18, bd + 0.35),
    padMat
  );
  pad.position.set(center.x, 0.09, center.z);
  root.add(pad);

  function wallBox(w, h, d, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    group.add(m);
  }

  var gridLayout = getAlphaLayout(center);
  var solids = listAlphaSolidColliders(center, { officeOpen: false });
  var si;
  for (si = 0; si < solids.length; si++) {
    var sc = solids[si];
    if (sc.kind && sc.kind !== "wall") continue;
    var sw = Math.max(0.12, sc.maxX - sc.minX);
    var sd = Math.max(0.12, sc.maxZ - sc.minZ);
    wallBox(sw, bh, sd, (sc.minX + sc.maxX) * 0.5, bh * 0.5, (sc.minZ + sc.maxZ) * 0.5);
  }

  function makeCardinalDoor(spec) {
    var alongZ = spec.axis === "x";
    var faceYaw = Math.atan2(spec.ix - spec.x, spec.iz - spec.z);
    var pivot = new THREE.Group();
    pivot.name = "MegDoor_" + spec.which;
    pivot.position.set(spec.x, doorY0, spec.z);
    pivot.rotation.y = faceYaw;
    group.add(pivot);
    var slab = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.2, doorH, doorThick),
      spec.mat || doorMat
    );
    pivot.add(slab);
    attachFittedProp(
      pivot,
      LEVEL1_PROP.industrialGate,
      {
        axis: "y",
        target: doorH,
        name: "MegGateModel",
        offset: { y: -doorH * 0.5 },
      },
      function () {
        slab.visible = false;
      }
    );
    var mesh = pivot;
    wallBox(
      alongZ ? wallT : doorW,
      lintelH,
      alongZ ? doorW : wallT,
      spec.x,
      doorH + lintelH * 0.5,
      spec.z
    );
    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(
        alongZ ? 0.62 : doorW + 0.08,
        doorH + 0.2,
        alongZ ? doorW + 0.08 : 0.62
      ),
      sharedChestPickMat()
    );
    pick.position.set(spec.x, doorY0, spec.z);
    pick.userData.brInteract = { kind: "meg_door", which: spec.which };
    group.add(pick);
    var collider = {
      kind: "meg_door",
      minX: spec.x - (alongZ ? 0.12 : doorW * 0.5 - 0.08),
      maxX: spec.x + (alongZ ? 0.12 : doorW * 0.5 - 0.08),
      minZ: spec.z - (alongZ ? doorW * 0.5 - 0.08 : 0.12),
      maxZ: spec.z + (alongZ ? doorW * 0.5 - 0.08 : 0.12),
    };
    registerMegColliderObject(ctx, megColliders, collider);
    return {
      which: spec.which,
      mesh: mesh,
      pickMesh: pick,
      collider: collider,
      ctx: ctx,
      open: false,
      opening: false,
      t: 0,
      duration: 1.15,
      y0: doorY0,
      y1: doorY1,
      interactDist: spec.dist || 3.2,
      interactX: spec.ix,
      interactZ: spec.iz,
    };
  }

  var D = gridLayout.doors;
  _megDoorState = makeCardinalDoor({
    which: "front",
    axis: "x",
    x: D.front.x + doorThick * 0.5,
    z: D.front.z,
    ix: D.front.x - 1.4,
    iz: D.front.z,
    dist: 3.4,
    mat: doorMat,
  });
  _megBackDoorState = makeCardinalDoor({
    which: "back",
    axis: "x",
    x: D.back.x - doorThick * 0.5,
    z: D.back.z,
    ix: D.back.x - 1.35,
    iz: D.back.z,
    dist: 2.8,
    mat: wallMat,
  });
  var leftDoor = makeCardinalDoor({
    which: "left",
    axis: "z",
    x: D.left.x,
    z: D.left.z - doorThick * 0.5,
    ix: D.left.x,
    iz: D.left.z + 1.35,
    mat: doorMat,
  });
  var rightDoor = makeCardinalDoor({
    which: "right",
    axis: "z",
    x: D.right.x,
    z: D.right.z + doorThick * 0.5,
    ix: D.right.x,
    iz: D.right.z - 1.35,
    mat: doorMat,
  });
  var Co = gridLayout.corridors;
  var seCoDoor = makeCardinalDoor({
    which: "se",
    axis: "x",
    x: Co.se.startX - doorThick * 0.5,
    z: Co.se.midZ,
    ix: Co.se.startX - 1.35,
    iz: Co.se.midZ,
    mat: doorMat,
  });
  var swCoDoor = makeCardinalDoor({
    which: "sw",
    axis: "z",
    x: Co.sw.midX,
    z: Co.sw.startZ + doorThick * 0.5,
    ix: Co.sw.midX,
    iz: Co.sw.startZ + 1.35,
    mat: doorMat,
  });
  var nwCoDoor = makeCardinalDoor({
    which: "nw",
    axis: "x",
    x: Co.nw.startX + doorThick * 0.5,
    z: Co.nw.midZ,
    ix: Co.nw.startX + 1.35,
    iz: Co.nw.midZ,
    mat: doorMat,
  });
  _megSideDoors = [leftDoor, rightDoor, seCoDoor, swCoDoor, nwCoDoor];

  // 屋顶
  var roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 0.55, bd + 0.8), roofMat);
  roof.position.set(center.x, bh + 0.28, center.z);
  group.add(roof);

  // 门上方标牌
  var signTex = createMegSignTexture(ALPHA_SIGN);
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 1.05),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: false })
  );
  sign.position.set(center.x - hx - 0.22, doorH + 0.85, center.z);
  sign.rotation.y = -Math.PI * 0.5;
  group.add(sign);

  // 入口灯条 + 大厅顶灯（面积放大后单盏不够）
  var entryLight = new THREE.Mesh(sharedPanelGeo(), sharedPanelMat());
  entryLight.position.set(center.x - hx + 0.5, bh - 0.35, center.z);
  entryLight.rotation.y = Math.PI * 0.5;
  group.add(entryLight);
  var lx;
  var lz;
  for (lx = -1; lx <= 1; lx++) {
    for (lz = -1; lz <= 1; lz++) {
      var hallLamp = new THREE.Mesh(sharedPanelGeo(), sharedPanelMat());
      hallLamp.position.set(
        center.x + lx * (hx * 0.55),
        bh - 0.28,
        center.z + lz * (hz * 0.55)
      );
      group.add(hallLamp);
    }
  }

  var level13Tex = createMegSignTexture("Level 1.3 · 封禁");
  var level13X = gridLayout.cells.s.mx + 4.6;
  var level13Z = gridLayout.southZ + 0.7;
  var level13Entrance = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.5),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: level13Tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.22,
      roughness: 0.32,
    })
  );
  level13Entrance.name = "Level13SealedWhiteWall";
  level13Entrance.position.set(level13X, 1.35, level13Z);
  level13Entrance.rotation.y = 0;
  root.add(level13Entrance);
  var level13Pick = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  level13Pick.position.set(level13X, 1.35, level13Z);
  level13Pick.userData.brInteract = {
    kind: "l1_sublevel_entry",
    levelId: "1.3",
  };
  root.add(level13Pick);
  _level13Entrance = level13Pick;
  var level13Sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.42),
    new THREE.MeshBasicMaterial({ map: level13Tex, transparent: false })
  );
  level13Sign.position.set(level13X, 2.25, level13Z + 0.2);
  level13Sign.visible = false;
  root.add(level13Sign);
  placeFittedProp(
    root,
    LEVEL1_PROP.sealedWall,
    level13X,
    0,
    level13Z,
    { axis: "x", target: 3.2, name: "Level13SealedWall" },
    function () {
      level13Entrance.visible = false;
      level13Sign.visible = true;
    }
  );

  // Level C-1「交点」：一段被封住的灰白色楼梯间门，推开即可切入交点。
  var c1Door = new THREE.Group();
  c1Door.name = "LevelC1StairDoor";
  var c1FrameMat = new THREE.MeshStandardMaterial({
    color: 0xb4b8b7,
    roughness: 0.72,
    metalness: 0.18,
  });
  var c1PanelMat = new THREE.MeshStandardMaterial({
    color: 0x969c9d,
    roughness: 0.62,
    metalness: 0.22,
  });
  var c1Frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.16), c1FrameMat);
  c1Frame.position.y = 1.1;
  c1Door.add(c1Frame);
  var c1Panel = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2, 0.09), c1PanelMat);
  c1Panel.position.set(0, 1.02, 0.1);
  c1Door.add(c1Panel);
  var c1Sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.34),
    new THREE.MeshBasicMaterial({
      map: createMegSignTexture("楼梯间 · 封锁"),
      transparent: false,
    })
  );
  c1Sign.position.set(0, 2.28, 0.32);
  c1Door.add(c1Sign);
  attachFittedProp(
    c1Door,
    LEVEL1_PROP.metalDoor,
    { axis: "y", target: 2.15, name: "C1StairDoorModel" },
    function () {
      c1Frame.visible = false;
      c1Panel.visible = false;
    }
  );
  var c1Pick = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 2.3, 1),
    sharedChestPickMat()
  );
  c1Pick.position.set(0, 1.15, 0.4);
  c1Pick.userData.brInteract = { kind: "l1_c1_door" };
  c1Door.add(c1Pick);
  c1Door.position.set(gridLayout.cells.s.mx - 4.6, 0, gridLayout.southZ + 0.72);
  c1Door.rotation.y = 0;
  root.add(c1Door);
  _levelC1Entrance = c1Pick;

  var e81Door = buildEntity81CallDoor({
    theme: "industrial",
    originPass: "clip",
    x: gridLayout.cells.c.mx + 2.4,
    z: gridLayout.cells.c.minZ + 0.22,
    yaw: Math.PI,
  });
  root.add(e81Door.group);
  _e81CallPick = e81Door.pick;
  registerMegCollider(
    ctx,
    megColliders,
    e81Door.collider.minX,
    e81Door.collider.maxX,
    e81Door.collider.minZ,
    e81Door.collider.maxZ
  );

  var backDoorStaff = buildMegStaffFigure(
    root,
    gridLayout.cells.c.mx + 3.2,
    gridLayout.cells.c.mz - 0.85,
    "MegBackDoorStaff",
    "backdoor"
  );
  _megBackDoorStaffNpc = {
    x: backDoorStaff.x,
    z: backDoorStaff.z,
    talkRadius: 2.6,
    group: backDoorStaff.group,
  };

  var interior = buildMegStaffFigure(
    root,
    gridLayout.cells.c.mx - 3.2,
    gridLayout.cells.c.mz + 0.85,
    "MegInteriorStaff",
    "trade"
  );
  _megInteriorNpc = {
    x: interior.x,
    z: interior.z,
    talkRadius: 2.8,
    group: interior.group,
  };

  var level11Guide = buildMegStaffFigure(
    root,
    center.x + 0.35,
    center.z + 2.05,
    "MegLevel11Guide",
    "level11"
  );
  _megLevel11Npc = {
    x: level11Guide.x,
    z: level11Guide.z,
    talkRadius: 2.85,
    group: level11Guide.group,
  };

  var packageReceiver = buildMegStaffFigure(
    root,
    center.x - 0.65,
    center.z - 2.05,
    "MegPackageReceiver",
    "package_receiver",
    0x2f7a43
  );
  packageReceiver.group.visible = false;
  _megPackageReceiverNpc = {
    x: packageReceiver.x,
    z: packageReceiver.z,
    talkRadius: 2.85,
    group: packageReceiver.group,
  };

  var storageClerk = buildMegStaffFigure(
    root,
    center.x + 1.85,
    center.z - 1.55,
    "MegStorageClerk",
    "storage",
    0x5a4a2a
  );
  _megStorageClerkNpc = {
    x: storageClerk.x,
    z: storageClerk.z,
    talkRadius: 2.8,
    group: storageClerk.group,
  };

  var recruiter = buildMegStaffFigure(
    root,
    center.x - 2.05,
    center.z + 1.75,
    "MegRecruiter",
    "recruiter",
    0x674a87
  );
  _megRecruiterNpc = {
    x: recruiter.x,
    z: recruiter.z,
    talkRadius: 2.8,
    group: recruiter.group,
  };

  buildAlphaHeadquarters(group, ctx, megColliders, center, wallBox);

  root.add(group);
  _megBaseOccluderGroup = group;
  _megBaseColliders = megColliders;
  _megCorridorFootprint = unionCorridorFootprints(center);
  buildMegCornerCorridors(root, ctx, center, bh);
  return { group: group, colliders: megColliders, center: center };
}

function isNearMegInteriorNpc(px, pz) {
  if (!_megInteriorNpc) return false;
  var dx = px - _megInteriorNpc.x;
  var dz = pz - _megInteriorNpc.z;
  return Math.hypot(dx, dz) <= _megInteriorNpc.talkRadius;
}

function isNearMegBackDoorStaffNpc(px, pz) {
  if (!_megBackDoorStaffNpc) return false;
  var dx = px - _megBackDoorStaffNpc.x;
  var dz = pz - _megBackDoorStaffNpc.z;
  return Math.hypot(dx, dz) <= _megBackDoorStaffNpc.talkRadius;
}

function isWallCell(gCol, gRow) {
  if (isInMegClearFootprint(gCol, gRow)) return false;
  var s = spawnGridCell();
  if (gCol === s.col && gRow === s.row) return false;
  if (isSpawnSafeCell(gCol, gRow)) return false;
  return LEVEL1_MATRIX[imod(gRow, MAP_ROWS)][imod(gCol, MAP_COLS)] === 1;
}

export function isOpenCell(gCol, gRow) {
  return !isWallCell(gCol, gRow);
}

function shouldSpawnLight(gCol, gRow) {
  if (isInMegClearFootprint(gCol, gRow)) return false;
  if (isWallCell(gCol, gRow)) return false;
  if (isSpawnSafeCell(gCol, gRow)) return true;
  return imod(gCol, 3) === 1 && imod(gRow, 3) === 1;
}

function shouldSpawnChest(gCol, gRow) {
  if (isInMegClearFootprint(gCol, gRow)) return false;
  if (isWallCell(gCol, gRow)) return false;
  if (isSpawnSafeCell(gCol, gRow)) return false;

  var cx = Math.floor(gCol / CHUNK_CELLS);
  var cz = Math.floor(gRow / CHUNK_CELLS);
  if (imod(cx + cz, CHEST_CHUNK_STRIDE) !== 0) return false;

  var localCol = imod(gCol, CHUNK_CELLS);
  var localRow = imod(gRow, CHUNK_CELLS);
  return (
    localCol === CHEST_LOCAL_CELL.col && localRow === CHEST_LOCAL_CELL.row
  );
}

function createLevel1PillarConcreteTexture() {
  var cw = 128;
  var ch = 144;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#8a9098";
  ctx.fillRect(0, 0, cw, ch);

  var n;
  for (n = 0; n < 2800; n++) {
    var g = 118 + Math.floor(Math.random() * 28);
    ctx.fillStyle = "rgb(" + g + "," + g + "," + (g + 4) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }

  var grimeGrad = ctx.createLinearGradient(0, ch * 0.35, 0, ch);
  grimeGrad.addColorStop(0, "rgba(40,38,36,0)");
  grimeGrad.addColorStop(0.55, "rgba(35,33,30,0.35)");
  grimeGrad.addColorStop(1, "rgba(22,20,18,0.72)");
  ctx.fillStyle = grimeGrad;
  ctx.fillRect(0, 0, cw, ch);

  for (n = 0; n < 18; n++) {
    var bx = Math.random() * cw;
    var by = ch - Math.random() * ch * 0.55;
    var bw = 8 + Math.random() * 28;
    var bh = 6 + Math.random() * 22;
    ctx.fillStyle = "rgba(28,26,24," + (0.15 + Math.random() * 0.35).toFixed(2) + ")";
    ctx.beginPath();
    ctx.ellipse(bx, by, bw, bh, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(45,42,38,0.22)";
  ctx.lineWidth = 1;
  for (n = 0; n < 7; n++) {
    var sx = Math.random() * cw;
    ctx.beginPath();
    ctx.moveTo(sx, ch * 0.2);
    ctx.lineTo(sx + (Math.random() - 0.5) * 6, ch);
    ctx.stroke();
  }

  var woodH = ch * 0.28;
  var woodW = 5;
  ctx.fillStyle = "#a88858";
  ctx.fillRect(2, ch - woodH, woodW, woodH);
  ctx.fillRect(cw - woodW - 2, ch - woodH, woodW, woodH);
  ctx.fillStyle = "rgba(60,45,28,0.35)";
  ctx.fillRect(3, ch - woodH + 2, 1, woodH - 4);
  ctx.fillRect(cw - woodW - 1, ch - woodH + 2, 1, woodH - 4);

  var lightGrad = ctx.createLinearGradient(0, 0, cw, 0);
  lightGrad.addColorStop(0, "rgba(0,0,0,0.38)");
  lightGrad.addColorStop(0.45, "rgba(0,0,0,0.06)");
  lightGrad.addColorStop(1, "rgba(255,255,255,0.28)");
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, cw, ch);

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  return tex;
}

function wallMaterial() {
  var mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
  });
  var tex = createLevel1PillarConcreteTexture();
  if (tex) mat.map = tex;
  else mat.color.setHex(CONCRETE_COLOR);
  return mat;
}

function sharedWallGeo() {
  if (!_wallGeo) {
    _wallGeo = new THREE.BoxGeometry(BLOCK_SIZE, WAREHOUSE_HEIGHT, BLOCK_SIZE);
  }
  return _wallGeo;
}

function sharedWallMat() {
  if (!_wallMat) _wallMat = wallMaterial();
  return _wallMat;
}

function sharedFloorMat() {
  if (!_floorMat) {
    _floorMat = new THREE.MeshLambertMaterial({
      color: 0x3d5263,
      emissive: 0x1e2d38,
    });
  }
  return _floorMat;
}

function sharedCeilingMat() {
  if (!_ceilingMat) {
    _ceilingMat = new THREE.MeshLambertMaterial({
      color: CEILING_COLOR,
      emissive: 0x222830,
    });
  }
  return _ceilingMat;
}

var _sharedChunkPlaneGeo = null;
function sharedChunkPlaneGeo(size) {
  if (!_sharedChunkPlaneGeo) {
    _sharedChunkPlaneGeo = new THREE.PlaneGeometry(size, size);
  }
  return _sharedChunkPlaneGeo;
}

var _sharedCellPlaneGeo = null;
function sharedCellPlaneGeo() {
  if (!_sharedCellPlaneGeo) {
    _sharedCellPlaneGeo = new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE);
  }
  return _sharedCellPlaneGeo;
}

function cellOverlapsAlphaBelowGrade(gCol, gRow) {
  var center = megAlphaCenterOrNull();
  if (!center) return false;
  var L = getAlphaLayout(center);
  var c = cellWorldCenter(gCol, gRow);
  return cellAabbOverlaps(c.x, c.z, L.stairs, 0) || cellAabbOverlaps(c.x, c.z, L.cellar, 0);
}

function chunkHasBelowGradeCut(baseCol, baseRow) {
  var lr;
  var lc;
  for (lr = 0; lr < CHUNK_CELLS; lr++) {
    for (lc = 0; lc < CHUNK_CELLS; lc++) {
      if (cellOverlapsAlphaBelowGrade(baseCol + lc, baseRow + lr)) return true;
    }
  }
  return false;
}

function chunkOverlapsAlphaClear(baseCol, baseRow) {
  var center = megAlphaCenterOrNull();
  if (!center) return false;
  var bounds = listAlphaClearBounds(center);
  var minX = baseCol * BLOCK_SIZE;
  var maxX = (baseCol + CHUNK_CELLS) * BLOCK_SIZE;
  var minZ = baseRow * BLOCK_SIZE;
  var maxZ = (baseRow + CHUNK_CELLS) * BLOCK_SIZE;
  for (var i = 0; i < bounds.length; i++) {
    var b = bounds[i];
    if (maxX > b.minX && minX < b.maxX && maxZ > b.minZ && minZ < b.maxZ) return true;
  }
  return false;
}

function reloadMegClearChunks(ctx) {
  if (!ctx || !ctx.chunks) return;
  var reload = [];
  ctx.chunks.forEach(function (rec, key) {
    var baseCol = rec.cx * CHUNK_CELLS;
    var baseRow = rec.cz * CHUNK_CELLS;
    if (chunkOverlapsAlphaClear(baseCol, baseRow) || chunkHasBelowGradeCut(baseCol, baseRow)) {
      reload.push({ key: key, cx: rec.cx, cz: rec.cz });
    }
  });
  var i;
  for (i = 0; i < reload.length; i++) {
    unloadChunk(reload[i].key, ctx);
    loadChunk(reload[i].cx, reload[i].cz, ctx);
  }
}

function reloadBelowGradeChunks(ctx) {
  reloadMegClearChunks(ctx);
}

function isUnderNamedAncestor(obj, name) {
  var p = obj;
  while (p) {
    if (p.name === name) return true;
    p = p.parent;
  }
  return false;
}

function disposeChunkMeshResources(group) {
  var chunkPlane = _sharedChunkPlaneGeo;
  var cellPlane = _sharedCellPlaneGeo;
  var wallGeo = sharedWallGeo();
  var chestGeo = sharedChestGeo();
  var pickGeo = sharedChestPickGeo();
  var panelGeo = sharedPanelGeo();
  group.traverse(function (child) {
    if (!child.isMesh) return;
    // clone(true) 与 _chestTemplate 共享 geometry，不可 dispose
    if (isUnderNamedAncestor(child, "QuantumPirateChest")) return;
    if (child.userData && child.userData.sharedSectionProp) return;
    var geo = child.geometry;
    if (
      geo &&
      geo !== chunkPlane &&
      geo !== cellPlane &&
      geo !== wallGeo &&
      geo !== chestGeo &&
      geo !== pickGeo &&
      geo !== panelGeo
    ) {
      geo.dispose();
    }
  });
}

function sharedPanelGeo() {
  if (!_panelGeo) _panelGeo = new THREE.BoxGeometry(2.4, 0.08, 0.5);
  return _panelGeo;
}

function sharedPanelMat() {
  if (!_panelMat) _panelMat = new THREE.MeshBasicMaterial({ color: LIGHT_COLOR });
  return _panelMat;
}

function loadFirstGltfMesh(loadGltf, url, onMesh) {
  function pick(gltf) {
    var found = null;
    if (gltf && gltf.scene) {
      gltf.scene.traverse(function (o) {
        if (!found && o.isMesh) found = o;
      });
    }
    onMesh(found);
  }
  function fail() {
    onMesh(null);
  }
  if (loadGltf) {
    loadGltf(url, pick, fail);
    return;
  }
  new GLTFLoader().load(url, pick, undefined, fail);
}

/** 原地替换：所有引用共享几何体的网格（区块、大厅、基地）一起换成模型 */
function replaceSharedGeometry(target, source) {
  target.dispose();
  target.copy(source);
  target.computeBoundingBox();
  target.computeBoundingSphere();
}

function applyPillarModel(mesh) {
  if (!mesh) return;
  replaceSharedGeometry(sharedWallGeo(), mesh.geometry);
  var src = mesh.material;
  var mat = sharedWallMat();
  if (!_wallMatLocked && src && src.map) {
    if (mat.map && mat.map !== src.map) mat.map.dispose();
    mat.map = src.map;
    mat.normalMap = src.normalMap || null;
    mat.needsUpdate = true;
  }
  _propModelCtxs.forEach(function (ctx) {
    ctx.chunks.forEach(function (record) {
      if (!record.walls) return;
      // InstancedMesh 缓存了按旧几何体算的包围球，不清掉会被错误剔除
      record.walls.boundingSphere = null;
      record.walls.boundingBox = null;
      if (_wallMatLocked) return;
      record.walls.material.map = mat.map;
      record.walls.material.normalMap = mat.normalMap;
      record.walls.material.needsUpdate = true;
    });
  });
}

function applyPanelModel(mesh) {
  if (!mesh) return;
  replaceSharedGeometry(sharedPanelGeo(), mesh.geometry);
  var map = mesh.material && mesh.material.map;
  if (!map) return;
  var mat = sharedPanelMat();
  mat.map = map;
  mat.needsUpdate = true;
  _propModelCtxs.forEach(function (ctx) {
    for (var i = 0; i < ctx.industrialLights.length; i++) {
      var panelMat = ctx.industrialLights[i].panelMat;
      if (!panelMat || panelMat === mat) continue;
      panelMat.map = map;
      panelMat.needsUpdate = true;
    }
  });
}

function addPropSlot(parent, key, x, y, z) {
  var slot = new THREE.Group();
  slot.name = "L1PropSlot";
  slot.userData.l1Prop = key;
  slot.position.set(x, y, z);
  parent.add(slot);
  return slot;
}

function fillPropSlot(slot) {
  if (!slot || slot.userData.l1PropFilled) return;
  var tpl = _sectionPropTemplates[slot.userData.l1Prop];
  if (!tpl) return;
  var clone = tpl.clone();
  clone.traverse(function (child) {
    if (child.isMesh) child.userData.sharedSectionProp = true;
  });
  slot.add(clone);
  var kids = slot.children.slice();
  var i;
  for (i = 0; i < kids.length; i++) {
    var kid = kids[i];
    if (kid === clone) continue;
    if (kid.userData && kid.userData.l1Keep) {
      // 准星拾取会跳过 visible=false，所以交互体留着，只是不再画出来
      if (kid.material) {
        kid.material.transparent = true;
        kid.material.opacity = 0;
        kid.material.depthWrite = false;
      }
      continue;
    }
    slot.remove(kid);
    if (kid.geometry) kid.geometry.dispose();
  }
  slot.userData.l1PropFilled = true;
}

function refreshSectionProps(ctx) {
  var slots = [];
  ctx.chunks.forEach(function (record) {
    record.group.traverse(function (obj) {
      if (obj.userData && obj.userData.l1Prop && !obj.userData.l1PropFilled) slots.push(obj);
    });
  });
  var i;
  for (i = 0; i < slots.length; i++) fillPropSlot(slots[i]);
}

function propUnderRoot(obj, root) {
  var o = obj;
  while (o) {
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}

function dropLevel1PropSlots(root) {
  _staffSlots = _staffSlots.filter(function (group) {
    return !propUnderRoot(group, root);
  });
  _zephyrSlots = _zephyrSlots.filter(function (group) {
    return !propUnderRoot(group, root);
  });
}

/** 仓库没有环境贴图，金属度贴图会把人照成一块黑。只留底色。 */
function useLambertBaseColor(root) {
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    var src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    var map = src && src.map ? src.map : null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    obj.material = new THREE.MeshLambertMaterial({
      map: map,
      color: 0xffffff,
    });
  });
}

function groundAndScale(object, axis, target) {
  object.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(object);
  var size = new THREE.Vector3();
  box.getSize(size);
  var current = axis === "x" ? size.x : axis === "y" ? size.y : size.z;
  object.scale.multiplyScalar(target / Math.max(current, 0.0001));
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  var center = new THREE.Vector3();
  box.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
}

function loadGltfScene(loadGltf, url, onScene) {
  function ok(gltf) {
    onScene(gltf && gltf.scene ? gltf.scene : null);
  }
  function fail() {
    onScene(null);
  }
  if (loadGltf) {
    loadGltf(url, ok, fail);
    return;
  }
  new GLTFLoader().load(url, ok, undefined, fail);
}

function fillStaffSlot(group) {
  if (!_staffTemplate || !group || group.userData.l1StaffFilled) return;
  var model = _staffTemplate.clone(true);
  model.name = "MegStaffModel";
  group.add(model);
  var kids = group.children.slice();
  var i;
  for (i = 0; i < kids.length; i++) {
    var kid = kids[i];
    if (!kid.userData || !kid.userData.l1StaffPlaceholder) continue;
    group.remove(kid);
    if (kid.geometry) kid.geometry.dispose();
    if (kid.material && !kid.material.userData.l1Disposed) {
      kid.material.userData.l1Disposed = true;
      if (kid.material.map && kid.material.map.dispose) kid.material.map.dispose();
      kid.material.dispose();
    }
  }
  group.userData.l1StaffFilled = true;
}

function refreshStaffSlots() {
  var i;
  for (i = _staffSlots.length - 1; i >= 0; i--) {
    if (!_staffSlots[i].parent) {
      _staffSlots.splice(i, 1);
      continue;
    }
    fillStaffSlot(_staffSlots[i]);
  }
}

function fillZephyrSlot(group) {
  if (!_zephyrTemplate || !group || group.userData.l1ZephyrFilled) return;
  var model = _zephyrTemplate.clone(true);
  model.name = "ZephyrBarricadeModel";
  group.add(model);
  var kids = group.children.slice();
  var i;
  for (i = 0; i < kids.length; i++) {
    var kid = kids[i];
    if (!kid.userData || !kid.userData.l1ZephyrPlaceholder) continue;
    group.remove(kid);
    if (kid.geometry) kid.geometry.dispose();
    if (kid.material && !kid.material.userData.l1Disposed) {
      kid.material.userData.l1Disposed = true;
      kid.material.dispose();
    }
  }
  group.userData.l1ZephyrFilled = true;
}

function refreshZephyrSlots() {
  var i;
  for (i = _zephyrSlots.length - 1; i >= 0; i--) {
    if (!_zephyrSlots[i].parent) {
      _zephyrSlots.splice(i, 1);
      continue;
    }
    fillZephyrSlot(_zephyrSlots[i]);
  }
}

function ensureMegStaffModel(loadGltf) {
  if (_staffLoadStarted) return;
  _staffLoadStarted = true;
  loadGltfScene(loadGltf, MEG_STAFF_GLB_URL, function (scene) {
    if (!scene) return;
    useLambertBaseColor(scene);
    // 模型面朝 -Z。徽章和对话都在人物前方的 +Z。
    scene.rotation.y = Math.PI;
    groundAndScale(scene, "y", MEG_STAFF_HEIGHT);
    _staffTemplate = scene;
    refreshStaffSlots();
  });
}

function ensureZephyrModel(loadGltf) {
  if (_zephyrLoadStarted) return;
  _zephyrLoadStarted = true;
  loadGltfScene(loadGltf, ZEPHYR_BARRICADE_GLB_URL, function (scene) {
    if (!scene) return;
    useLambertBaseColor(scene);
    groundAndScale(scene, "x", ZEPHYR_BARRICADE_WIDTH);
    _zephyrTemplate = scene;
    refreshZephyrSlots();
  });
}

function ensureLevel1PropModels(loadGltf) {
  if (_propModelsStarted) return;
  _propModelsStarted = true;
  loadFirstGltfMesh(loadGltf, PILLAR_GLB_URL, applyPillarModel);
  loadFirstGltfMesh(loadGltf, LIGHT_PANEL_GLB_URL, applyPanelModel);
  [
    ["eagle", EAGLE_GLB_URL],
    ["rail", BRASS_RAIL_GLB_URL],
    ["window", FAKE_WINDOW_GLB_URL],
    ["arch", GOTHIC_ARCH_GLB_URL],
    ["column", GOTHIC_COLUMN_GLB_URL],
    ["vine", GARDEN_VINE_GLB_URL],
    ["doorway", OVERGROWN_DOORWAY_GLB_URL],
    ["neon", LEGEND_NEON_GLB_URL],
  ].forEach(function (pair) {
    loadFirstGltfMesh(loadGltf, pair[1], function (mesh) {
      if (!mesh) return;
      if (pair[0] === "neon" && mesh.material && mesh.material.map) {
        mesh.material.emissiveMap = mesh.material.map;
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveIntensity = 1.1;
        mesh.material.needsUpdate = true;
      }
      _sectionPropTemplates[pair[0]] = mesh;
      _propModelCtxs.forEach(refreshSectionProps);
    });
  });
}

function sharedChestGeo() {
  if (!_chestGeo) _chestGeo = new THREE.BoxGeometry(1.0, 0.75, 0.8);
  return _chestGeo;
}

function sharedChestMat() {
  if (!_chestMat) {
    _chestMat = new THREE.MeshLambertMaterial({
      color: 0x6d4c41,
      emissive: 0x1a1008,
    });
  }
  return _chestMat;
}

function wallDummy() {
  if (!_wallDummy) _wallDummy = new THREE.Object3D();
  return _wallDummy;
}

function registerChunkCollider(ctx, record, collider) {
  record.colliders.push(collider);
  ctx.colliders.push(collider);
  if (ctx.onWallCollider) ctx.onWallCollider(collider);
}

function createWallCollider(center, wallScale) {
  wallScale = wallScale == null ? 0.88 : wallScale;
  var half = BLOCK_SIZE * 0.5 * wallScale;
  return {
    kind: "wall",
    minX: center.x - half,
    maxX: center.x + half,
    minZ: center.z - half,
    maxZ: center.z + half,
  };
}

function buildClipEntryHall(root) {
  var hall = new THREE.Group();
  hall.name = "ClipEntryHall";
  var size = 28;
  var cx = SPAWN_WORLD.x;
  var cz = SPAWN_WORLD.z;

  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({
      color: 0x4d6478,
      emissive: 0x283848,
    })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.set(cx, 0.01, cz);
  hall.add(floor);

  var lampSpots = [
    [-9, -9],
    [9, -9],
    [-9, 9],
    [9, 9],
    [0, 0],
  ];
  var i;
  for (i = 0; i < lampSpots.length; i++) {
    var lp = lampSpots[i];
    var panel = new THREE.Mesh(sharedPanelGeo(), sharedPanelMat());
    panel.position.set(cx + lp[0], WAREHOUSE_HEIGHT - 0.06, cz + lp[1]);
    hall.add(panel);
  }

  root.add(hall);
}

/** 木门所在的柱格 — 矩阵里真实存在的柱子，且远离 M.E.G 引导员 */
const C101_DOOR_CELL = { col: 3, row: 1 };

/**
 * 把木门嵌进出生点附近的既有柱子西侧面。
 * 柱体与碰撞都由流式区块生成，这里只贴门板与拾取面。
 */
function buildC101Entrance(root, wallScale) {
  var group = new THREE.Group();
  group.name = "LevelC101Entrance";
  var center = cellWorldCenter(C101_DOOR_CELL.col, C101_DOOR_CELL.row);
  // 柱子西面：门与柱面齐平，看起来是嵌进混凝土里的
  var faceX = center.x - BLOCK_SIZE * 0.5 * wallScale;
  var wood = new THREE.MeshLambertMaterial({ color: 0x6b4020 });
  var darkWood = new THREE.MeshLambertMaterial({ color: 0x2f1c11 });
  var doorH = 2.2;
  var doorHalfW = 0.8;

  var door = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, doorHalfW * 2), wood);
  door.position.set(faceX - 0.03, doorH * 0.5, center.z);
  group.add(door);

  var lintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.16, doorHalfW * 2 + 0.3),
    darkWood
  );
  lintel.position.set(faceX - 0.05, doorH + 0.08, center.z);
  group.add(lintel);
  [-1, 1].forEach(function (side) {
    var jamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, doorH + 0.16, 0.15),
      darkWood
    );
    jamb.position.set(faceX - 0.05, (doorH + 0.16) * 0.5, center.z + side * (doorHalfW + 0.075));
    group.add(jamb);
  });

  var handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xcaa85e, metalness: 0.7, roughness: 0.3 })
  );
  handle.position.set(faceX - 0.12, 1.05, center.z + doorHalfW - 0.22);
  group.add(handle);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, doorH + 0.2, doorHalfW * 2 + 0.3),
    sharedChestPickMat()
  );
  pick.position.set(faceX - 0.22, doorH * 0.5, center.z);
  pick.userData.brInteract = { kind: "l1_c101_door" };
  group.add(pick);
  root.add(group);

  return {
    group: group,
    pickMesh: pick,
    // 面朝东（+X），正对嵌在柱子里的木门
    returnSpawn: { x: faceX - 1.5, z: center.z, yaw: -Math.PI * 0.5 },
  };
}

/**
 * C-101 create() 生成的实体：环绕出生点铺开，并接上各自的追击/攻击系统。
 * 返回的 update 必须每帧调用，否则实体只会站着不动。
 */
function buildC101Entities(root, names, colliders) {
  var list = Array.isArray(names) ? names : [];
  var byKind = { partygoer: [], clump: [], death_moth: [] };
  for (var i = 0; i < list.length; i++) {
    if (!byKind[list[i]]) continue;
    // 全部推到出生点外一圈，避免和玩家出生位置重叠导致立刻挨打
    var angle = (i / Math.max(1, list.length)) * Math.PI * 2;
    byKind[list[i]].push({
      x: SPAWN_WORLD.x + Math.sin(angle) * 3.2,
      z: SPAWN_WORLD.z + Math.cos(angle) * 3.2,
      y: 1.62,
      rotY: angle + Math.PI,
      seed: 101 + i * 17,
    });
  }

  var systems = [];
  if (byKind.partygoer.length) {
    systems.push(createPartygoersAt(root, byKind.partygoer));
  }
  if (byKind.clump.length) {
    systems.push(createClumpsAt(root, byKind.clump, colliders));
  }
  if (byKind.death_moth.length) {
    systems.push(createDeathMothsAt(root, byKind.death_moth, colliders));
  }

  return {
    systems: systems,
    update: function (dt, px, pz, survival, toastFn) {
      for (var j = 0; j < systems.length; j++) {
        systems[j].update(dt, px, pz, survival, toastFn);
      }
    },
    dispose: function () {
      for (var j = 0; j < systems.length; j++) {
        if (systems[j].clear) systems[j].clear();
        else if (systems[j].dispose) systems[j].dispose();
      }
      systems.length = 0;
    },
  };
}

var _chestPickGeo = null;
var _chestPickMat = null;

function sharedChestPickGeo() {
  if (!_chestPickGeo) {
    _chestPickGeo = new THREE.BoxGeometry(0.92, 0.78, 0.72);
  }
  return _chestPickGeo;
}

function sharedChestPickMat() {
  if (!_chestPickMat) {
    _chestPickMat = new THREE.MeshBasicMaterial({
      visible: false,
      depthWrite: false,
    });
  }
  return _chestPickMat;
}

function createChestCollider(cx, cz) {
  return {
    kind: "chest",
    minX: cx - CHEST_COLLIDE_HALF,
    maxX: cx + CHEST_COLLIDE_HALF,
    minZ: cz - CHEST_COLLIDE_HALF,
    maxZ: cz + CHEST_COLLIDE_HALF,
  };
}

function fitChestModel(model) {
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  var maxDim = Math.max(size.x, size.y, size.z, 0.001);
  var scale = 1.05 / maxDim;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  var center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);
  model.position.y -= box.min.y;
}

function ensureChestTemplate(loadGltf, onReady) {
  if (_chestTemplate) {
    onReady(_chestTemplate);
    return;
  }
  _chestLoadPending.push(onReady);
  if (_chestLoadStarted) return;
  _chestLoadStarted = true;

  function finish(scene) {
    _chestTemplate = scene;
    var pending = _chestLoadPending.slice();
    _chestLoadPending.length = 0;
    var i;
    for (i = 0; i < pending.length; i++) {
      pending[i](_chestTemplate);
    }
  }

  if (loadGltf) {
    loadGltf(
      CHEST_GLB_URL,
      function (gltf) {
        finish(gltf.scene);
      },
      function () {
        finish(null);
      }
    );
    return;
  }

  var loader = new GLTFLoader();
  loader.load(
    CHEST_GLB_URL,
    function (gltf) {
      finish(gltf.scene);
    },
    undefined,
    function () {
      finish(null);
    }
  );
}

function spawnChestInstance(parent, cx, cz, sourceModel, horror) {
  var root = new THREE.Group();
  root.name = "QuantumPirateChest";
  root.position.set(cx, 0, cz);

  if (sourceModel) {
    var model = sourceModel.clone(true);
    fitChestModel(model);
    root.add(model);
  } else {
    var box = new THREE.Mesh(sharedChestGeo(), sharedChestMat());
    box.position.y = 0.375;
    root.add(box);
  }
  parent.add(root);

  var collider = createChestCollider(cx, cz);
  var entry = {
    root: root,
    pickMesh: null,
    glowLight: null,
    collider: collider,
    x: cx,
    z: cz,
    opened: false,
  };
  var pickMesh = new THREE.Mesh(sharedChestPickGeo(), sharedChestPickMat());
  pickMesh.position.y = 0.38;
  pickMesh.userData.brInteract = { kind: "chest", chestEntry: entry };
  root.add(pickMesh);
  entry.pickMesh = pickMesh;
  if (horror) horror.registerQuantumChest(entry);
  return entry;
}

function addSectionDetails(group, record, profile, centerX, centerZ, chunkSize, ctx) {
  var material;
  var mesh;
  function findOpenSectionCell() {
    for (var row = 0; row < CHUNK_CELLS; row++) {
      for (var col = 0; col < CHUNK_CELLS; col++) {
        var globalCol = record.cx * CHUNK_CELLS + col;
        var globalRow = record.cz * CHUNK_CELLS + row;
        if (!isWallCell(globalCol, globalRow)) return cellWorldCenter(globalCol, globalRow);
      }
    }
    return { x: centerX, z: centerZ };
  }
  if (profile.id === "eagle") {
    material = new THREE.MeshBasicMaterial({
      color: 0x566f77,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    var eagleSlot = addPropSlot(group, "eagle", centerX + 5.5, 0, centerZ - 4.5);
    mesh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), material);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = 0.012;
    eagleSlot.add(mesh);
    fillPropSlot(eagleSlot);
    record.materials.push(material);
    return;
  }
  if (profile.id === "golden") {
    material = new THREE.MeshBasicMaterial({ color: 0xffb84d });
    for (var gi = -1; gi <= 1; gi++) {
      var railSlot = addPropSlot(
        group,
        "rail",
        centerX,
        WAREHOUSE_HEIGHT - 0.02,
        centerZ + gi * 7
      );
      mesh = new THREE.Mesh(new THREE.BoxGeometry(chunkSize * 0.62, 0.035, 0.055), material);
      mesh.position.y = -0.11;
      railSlot.add(mesh);
      fillPropSlot(railSlot);
    }
    record.materials.push(material);
    return;
  }
  if (profile.id === "gothic") {
    material = new THREE.MeshStandardMaterial({
      color: 0x403b47,
      roughness: 0.95,
    });
    for (var gx = -1; gx <= 1; gx += 2) {
      var columnSlot = addPropSlot(group, "column", centerX + gx * 8.5, 0, centerZ);
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.46, WAREHOUSE_HEIGHT - 0.1, 8),
        material
      );
      mesh.position.y = WAREHOUSE_HEIGHT * 0.5;
      columnSlot.add(mesh);
      fillPropSlot(columnSlot);
    }
    var archSlot = addPropSlot(group, "arch", centerX, 0, centerZ);
    var arch = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.3, 6, 20, Math.PI), material);
    arch.position.y = WAREHOUSE_HEIGHT - 0.2;
    arch.rotation.z = Math.PI;
    archSlot.add(arch);
    fillPropSlot(archSlot);
    var fakeWindowCenter = findOpenSectionCell();
    var fakeWindowFrameMat = new THREE.MeshStandardMaterial({
      color: 0xe5e5e5,
      emissive: 0x303030,
      emissiveIntensity: 0.4,
      roughness: 0.72,
    });
    var fakeWindowPaneMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x000000,
      roughness: 1,
    });
    var fakeWindow = new THREE.Group();
    fakeWindow.name = "Level15FakeWindow";
    fakeWindow.position.set(fakeWindowCenter.x, 0, fakeWindowCenter.z);
    var windowSlot = addPropSlot(fakeWindow, "window", 0, 0, 0);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 0.24), fakeWindowFrameMat);
    frame.position.y = 1.55;
    windowSlot.add(frame);
    var pane = new THREE.Mesh(new THREE.BoxGeometry(2.65, 2.25, 0.5), fakeWindowPaneMat);
    pane.position.set(0, 1.55, -0.02);
    pane.userData.l1Keep = true;
    pane.userData.brInteract = {
      kind: "l1_sublevel_entry",
      levelId: "1.5",
    };
    windowSlot.add(pane);
    fillPropSlot(windowSlot);
    group.add(fakeWindow);
    record.interacts.push(pane);
    ctx.sublevelInteracts.push(pane);
    registerChunkCollider(ctx, record, {
      kind: "wall",
      minX: fakeWindowCenter.x - 1.6,
      maxX: fakeWindowCenter.x + 1.6,
      minZ: fakeWindowCenter.z - 0.18,
      maxZ: fakeWindowCenter.z + 0.18,
    });
    record.materials.push(material, fakeWindowFrameMat, fakeWindowPaneMat);
    return;
  }
  if (profile.id === "garden") {
    material = new THREE.MeshStandardMaterial({
      color: 0x315b36,
      emissive: 0x0c210d,
      emissiveIntensity: 0.18,
      roughness: 0.9,
    });
    var vineGeo = new THREE.CylinderGeometry(0.08, 0.13, 2.6, 6);
    vineGeo.translate(0, 1.3, 0);
    var pillarHalf = BLOCK_SIZE * 0.5 * 0.88 * ctx.pillarScale;
    var vineCount = 0;
    for (var vr = 0; vr < CHUNK_CELLS && vineCount < 6; vr++) {
      for (var vc = 0; vc < CHUNK_CELLS && vineCount < 6; vc++) {
        var vCol = record.cx * CHUNK_CELLS + vc;
        var vRow = record.cz * CHUNK_CELLS + vr;
        if (!isWallCell(vCol, vRow)) continue;
        var face = openNeighbourDir(vCol, vRow, vCol + vRow);
        if (!face) continue;
        var pillar = cellWorldCenter(vCol, vRow);
        var vineSlot = addPropSlot(
          group,
          "vine",
          pillar.x + face.dx * (pillarHalf + 0.12),
          0,
          pillar.z + face.dz * (pillarHalf + 0.12)
        );
        // 模型里藤蔓主体贴着原点，长根朝局部 -Z。转到空地一侧，根才铺在柱外地面上。
        vineSlot.rotation.y = Math.atan2(-face.dx, -face.dz);
        vineSlot.scale.setScalar(0.85 + imod(vCol * 7 + vRow * 13, 5) * 0.08);
        vineSlot.add(new THREE.Mesh(vineGeo, material));
        fillPropSlot(vineSlot);
        vineCount++;
      }
    }
    var entranceMat = new THREE.MeshStandardMaterial({
      color: 0x294b2f,
      emissive: 0x112d15,
      emissiveIntensity: 0.34,
      roughness: 0.96,
    });
    var doorCell = findOpenSectionCellIndex();
    var doorCenter = cellWorldCenter(doorCell.col, doorCell.row);
    var doorFace = openNeighbourDir(doorCell.col, doorCell.row, 0) || { dx: 0, dz: 1 };
    var doorSlot = addPropSlot(group, "doorway", doorCenter.x, 0, doorCenter.z);
    doorSlot.rotation.y = Math.atan2(doorFace.dx, doorFace.dz);
    var entrance = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 3.0, 0.3),
      entranceMat
    );
    entrance.name = "Level12OvergrownThreshold";
    entrance.position.set(0, 1.5, 0.78);
    entrance.userData.l1Keep = true;
    entrance.userData.brInteract = {
      kind: "l1_sublevel_entry",
      levelId: "1.2",
    };
    doorSlot.add(entrance);
    fillPropSlot(doorSlot);
    record.interacts.push(entrance);
    ctx.sublevelInteracts.push(entrance);
    // 左右门框各一块，中间留出约 1.1 米，碰撞体不再封住门口。
    registerChunkCollider(
      ctx,
      record,
      rotatedBoxCollider(doorCenter, doorFace, -1.15, -0.55, -0.45, 0.8)
    );
    registerChunkCollider(
      ctx,
      record,
      rotatedBoxCollider(doorCenter, doorFace, 0.55, 1.15, -0.45, 0.8)
    );
    record.materials.push(entranceMat);
    record.materials.push(material);
    return;
  }
  material = new THREE.MeshBasicMaterial({ color: 0xff4fc5 });
  var cableMat = new THREE.MeshBasicMaterial({ color: 0x54d9ff });
  var neonCount = 0;
  for (var nr = 0; nr < CHUNK_CELLS && neonCount < 4; nr++) {
    for (var nc = 0; nc < CHUNK_CELLS && neonCount < 4; nc++) {
      var nCol = record.cx * CHUNK_CELLS + nc;
      var nRow = record.cz * CHUNK_CELLS + nr;
      if (imod(nCol, 3) !== 1 || imod(nRow, 3) !== 2) continue;
      if (isWallCell(nCol, nRow) || isInMegClearFootprint(nCol, nRow)) continue;
      var neonCenter = cellWorldCenter(nCol, nRow);
      var neonSlot = addPropSlot(group, "neon", neonCenter.x, WAREHOUSE_HEIGHT - 0.04, neonCenter.z);
      if (imod(nCol + nRow, 2)) neonSlot.rotation.y = Math.PI;
      for (var tube = 0; tube < 2; tube++) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.06), tube ? cableMat : material);
        mesh.position.set(0, -0.16, tube ? 0.45 : -0.45);
        neonSlot.add(mesh);
      }
      fillPropSlot(neonSlot);
      neonCount++;
    }
  }
  record.materials.push(material, cableMat);

  function findOpenSectionCellIndex() {
    for (var row = 0; row < CHUNK_CELLS; row++) {
      for (var col = 0; col < CHUNK_CELLS; col++) {
        var globalCol = record.cx * CHUNK_CELLS + col;
        var globalRow = record.cz * CHUNK_CELLS + row;
        if (!isWallCell(globalCol, globalRow)) return { col: globalCol, row: globalRow };
      }
    }
    return {
      col: record.cx * CHUNK_CELLS + Math.floor(CHUNK_CELLS / 2),
      row: record.cz * CHUNK_CELLS + Math.floor(CHUNK_CELLS / 2),
    };
  }
}

/** 返回一个相邻空地的方向；seed 决定先试哪一面，没有空地时返回 null。 */
function openNeighbourDir(gCol, gRow, seed) {
  var dirs = [
    { dx: 0, dz: 1 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: -1 },
    { dx: -1, dz: 0 },
  ];
  for (var i = 0; i < 4; i++) {
    var d = dirs[imod(seed + i, 4)];
    if (!isWallCell(gCol + d.dx, gRow + d.dz)) return d;
  }
  return null;
}

/** 模型局部 +Z 朝向 face 时，把局部矩形 [x0,x1]×[z0,z1] 转成世界 AABB 碰撞体。 */
function rotatedBoxCollider(center, face, x0, x1, z0, z1) {
  var rx = face.dz;
  var rz = -face.dx;
  var xs = [];
  var zs = [];
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) {
    xs.push(center.x + p[0] * rx + p[1] * face.dx);
    zs.push(center.z + p[0] * rz + p[1] * face.dz);
  });
  return {
    kind: "wall",
    minX: Math.min.apply(null, xs),
    maxX: Math.max.apply(null, xs),
    minZ: Math.min.apply(null, zs),
    maxZ: Math.max.apply(null, zs),
  };
}

function loadChunk(cx, cz, ctx) {
  var key = chunkKey(cx, cz);
  if (ctx.chunks.has(key)) return;

  var group = new THREE.Group();
  group.name = "L1Chunk_" + cx + "_" + cz;
  ctx.chunksRoot.add(group);

  var baseCol = cx * CHUNK_CELLS;
  var baseRow = cz * CHUNK_CELLS;
  var chunkSize = CHUNK_CELLS * BLOCK_SIZE;
  var centerX = (baseCol + CHUNK_CELLS * 0.5) * BLOCK_SIZE;
  var centerZ = (baseRow + CHUNK_CELLS * 0.5) * BLOCK_SIZE;
  var section = ctx.sectionMode
    ? sectionForChunk(cx, cz)
    : {
        id: "reconfigured",
        name: "重构区段",
        floor: sharedFloorMat().color.getHex(),
        wall: sharedWallMat().color.getHex(),
        ceiling: sharedCeilingMat().color.getHex(),
        light: sharedPanelMat().color.getHex(),
      };
  var floorMat = sharedFloorMat().clone();
  floorMat.color.setHex(section.floor);
  var ceilingMat = sharedCeilingMat().clone();
  ceilingMat.color.setHex(section.ceiling);

  if (chunkHasBelowGradeCut(baseCol, baseRow)) {
    var cellGeo = sharedCellPlaneGeo();
    var wr;
    var wc;
    for (wr = 0; wr < CHUNK_CELLS; wr++) {
      for (wc = 0; wc < CHUNK_CELLS; wc++) {
        if (cellOverlapsAlphaBelowGrade(baseCol + wc, baseRow + wr)) continue;
        var cell = cellWorldCenter(baseCol + wc, baseRow + wr);
        var cellFloor = new THREE.Mesh(cellGeo, floorMat);
        cellFloor.rotation.x = -Math.PI * 0.5;
        cellFloor.position.set(cell.x, 0, cell.z);
        group.add(cellFloor);
        var cellCeil = new THREE.Mesh(cellGeo, ceilingMat);
        cellCeil.rotation.x = Math.PI * 0.5;
        cellCeil.position.set(cell.x, WAREHOUSE_HEIGHT, cell.z);
        group.add(cellCeil);
      }
    }
  } else {
    var floor = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.set(centerX, 0, centerZ);
    group.add(floor);

    var ceiling = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), ceilingMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.set(centerX, WAREHOUSE_HEIGHT, centerZ);
    group.add(ceiling);
  }

  var record = {
    cx: cx,
    cz: cz,
    group: group,
    colliders: [],
    lights: [],
    chests: [],
    interacts: [],
    materials: [floorMat, ceilingMat],
    section: section,
  };
  if (ctx.sectionMode) {
    addSectionDetails(group, record, section, centerX, centerZ, chunkSize, ctx);
  }

  var wallScale = 0.88 * ctx.pillarScale;
  var wallPositions = [];
  var lr;
  var lc;
  for (lr = 0; lr < CHUNK_CELLS; lr++) {
    for (lc = 0; lc < CHUNK_CELLS; lc++) {
      var gCol = baseCol + lc;
      var gRow = baseRow + lr;
      var center = cellWorldCenter(gCol, gRow);

      if (isWallCell(gCol, gRow)) {
        wallPositions.push(
          center.x,
          WAREHOUSE_HEIGHT * ctx.pillarHeight * 0.5,
          center.z
        );
        registerChunkCollider(ctx, record, createWallCollider(center, wallScale));
        continue;
      }

      if (shouldSpawnLight(gCol, gRow)) {
        var panelMat = sharedPanelMat().clone();
        panelMat.color.setHex(section.light);
        if (panelMat.emissive) panelMat.emissive.setHex(section.light);
        record.materials.push(panelMat);
        var panel = new THREE.Mesh(sharedPanelGeo(), panelMat);
        panel.position.set(center.x, WAREHOUSE_HEIGHT - 0.06, center.z);
        group.add(panel);
        var lightEntry = {
          light: null,
          panelMat: panel.material,
          baseIntensity: 1,
          baseEmissive: 1,
          baseColor: section.light,
        };
        record.lights.push(lightEntry);
        ctx.industrialLights.push(lightEntry);
        if (ctx.horror) ctx.horror.registerIndustrialLight(lightEntry);
      }

      if (shouldSpawnChest(gCol, gRow)) {
        (function (wx, wz) {
          ensureChestTemplate(ctx.loadGltf, function (template) {
            // key 可能已 unload 再 reload；必须校验仍是同一 record，避免向旧 group 注入孤立碰撞体
            if (ctx.chunks.get(key) !== record) return;
            var chestEntry = spawnChestInstance(
              group,
              wx,
              wz,
              template,
              ctx.horror
            );
            record.chests.push(chestEntry);
            registerChunkCollider(ctx, record, chestEntry.collider);
          });
        })(center.x, center.z);
      }
    }
  }

  if (wallPositions.length > 0) {
    var wallCount = wallPositions.length / 3;
    var walls = new THREE.InstancedMesh(
      sharedWallGeo(),
      sharedWallMat().clone(),
      wallCount
    );
    walls.name = "WallsInstanced";
    var dummy = wallDummy();
    var wi;
    for (wi = 0; wi < wallCount; wi++) {
      dummy.position.set(
        wallPositions[wi * 3],
        wallPositions[wi * 3 + 1],
        wallPositions[wi * 3 + 2]
      );
      dummy.scale.set(wallScale, ctx.pillarHeight, wallScale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      walls.setMatrixAt(wi, dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    group.add(walls);
    walls.material.color.setHex(section.wall);
    record.materials.push(walls.material);
    record.walls = walls;
  }

  ctx.chunks.set(key, record);
}

function unloadChunk(key, ctx) {
  var record = ctx.chunks.get(key);
  if (!record) return;

  var i;
  for (i = 0; i < record.colliders.length; i++) {
    var c = record.colliders[i];
    var idx = ctx.colliders.indexOf(c);
    if (idx >= 0) ctx.colliders.splice(idx, 1);
    if (ctx.onWallColliderRemove) ctx.onWallColliderRemove(c);
  }

  for (i = 0; i < record.lights.length; i++) {
    var lightEntry = record.lights[i];
    var li = ctx.industrialLights.indexOf(lightEntry);
    if (li >= 0) ctx.industrialLights.splice(li, 1);
    if (ctx.horror) ctx.horror.unregisterIndustrialLight(lightEntry);
  }

  for (i = 0; i < record.chests.length; i++) {
    if (ctx.horror) ctx.horror.unregisterQuantumChest(record.chests[i]);
  }
  for (i = 0; i < record.interacts.length; i++) {
    var interactIndex = ctx.sublevelInteracts.indexOf(record.interacts[i]);
    if (interactIndex >= 0) ctx.sublevelInteracts.splice(interactIndex, 1);
  }

  if (record.group.parent) record.group.parent.remove(record.group);
  disposeChunkMeshResources(record.group);
  if (record.materials) {
    for (i = 0; i < record.materials.length; i++) {
      record.materials[i].dispose();
    }
    record.materials.length = 0;
  }

  ctx.chunks.delete(key);
}

function updateStreaming(px, pz, ctx) {
  var here = worldToChunk(px, pz);
  var want = Object.create(null);
  var dx;
  var dz;
  var radius =
    ctx && ctx.streamRadius != null ? ctx.streamRadius : STREAM_RADIUS;
  for (dz = -radius; dz <= radius; dz++) {
    for (dx = -radius; dx <= radius; dx++) {
      want[chunkKey(here.cx + dx, here.cz + dz)] = true;
    }
  }

  var key;
  for (key in want) {
    if (!Object.prototype.hasOwnProperty.call(want, key)) continue;
    var parts = key.split(",");
    loadChunk(parseInt(parts[0], 10), parseInt(parts[1], 10), ctx);
  }

  var toRemove = [];
  ctx.chunks.forEach(function (_rec, k) {
    if (!want[k]) toRemove.push(k);
  });
  for (var i = 0; i < toRemove.length; i++) {
    unloadChunk(toRemove[i], ctx);
  }
}

/** @deprecated 保留旧名 — 请使用 buildBackroomsLevel1World 返回的 update() */
export function spawnQuantumPirateChests() {
  /* 宝箱改由分块流式生成 */
}

/**
 * 构建无限延伸的 Level 1 工业仓库
 * @returns {{ update: Function, dispose: Function, colliders: object[], industrialLights: object[], spawnX: number, spawnZ: number }}
 */
export function buildBackroomsLevel1World(root, opts) {
  opts = opts || {};
  var horror = opts.horror;
  var modConfig = opts.modConfig || null;
  var pillarScale =
    modConfig && modConfig.pillars ? modConfig.pillars.scale : 1;
  var pillarHeight =
    modConfig && modConfig.pillars ? modConfig.pillars.height : 1;
  if (modConfig && modConfig.pillars) {
    _wallMatLocked = true;
    sharedWallMat().map = null;
    sharedWallMat().normalMap = null;
    sharedWallMat().color.set(modConfig.pillars.color);
    sharedWallMat().needsUpdate = true;
  }
  if (modConfig && modConfig.lights) {
    sharedPanelMat().color.set(modConfig.lights.color);
  }
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level1InfiniteChunks";
  root.add(chunksRoot);

  buildClipEntryHall(root);
  var megGuideNpc = buildMegGuideNpc(root);

  var lightColor =
    modConfig && modConfig.lights ? modConfig.lights.color : 0xd0dce6;
  var lightIntensity =
    modConfig && modConfig.lights ? modConfig.lights.intensity : 1;
  var ambient = new THREE.AmbientLight(lightColor, 1.05 * lightIntensity);
  root.add(ambient);
  if (horror) horror.registerAmbient(ambient, 1.05);

  var hemi = new THREE.HemisphereLight(0xe8f0f5, 0x3d5263, 0.55);
  root.add(hemi);

  var spawn = { x: SPAWN_WORLD.x, z: SPAWN_WORLD.z };
  var industrialLights = [];
  var colliders = [];
  var chunks = new Map();
  // Level C-101 的公开入口已按 Wiki 改为 Level 0 随机切出；
  // 保留构建函数供未来 M.E.G. 监督者权限支线使用。
  var c101Entrance = null;
  var c101Entities = buildC101Entities(
    root,
    modConfig && modConfig.entities ? modConfig.entities : [],
    colliders
  );

  var gfxProfile = resolveBackroomsGfxProfile();
  var streamRadius =
    gfxProfile.streamRadius != null ? gfxProfile.streamRadius | 0 : STREAM_RADIUS;
  var ctx = {
    horror: horror,
    loadGltf: opts.loadGltf,
    streamRadius: Math.max(0, streamRadius),
    chunksRoot: chunksRoot,
    chunks: chunks,
    colliders: colliders,
    industrialLights: industrialLights,
    sublevelInteracts: [],
    pillarScale: pillarScale,
    pillarHeight: pillarHeight,
    sectionMode: !modConfig,
    onWallCollider: opts.onWallCollider || null,
    onWallColliderRemove: opts.onWallColliderRemove || null,
  };
  _propModelCtxs.add(ctx);
  ensureLevel1PropModels(opts.loadGltf);
  ensureMegStaffModel(opts.loadGltf);
  ensureZephyrModel(opts.loadGltf);

  var lastCx = null;
  var lastCz = null;
  var visitedChunks = new Set();
  var megBaseBuilt = false;

  function update(px, pz) {
    var here = worldToChunk(px, pz);
    visitedChunks.add(chunkKey(here.cx, here.cz));
    if (!megBaseBuilt && visitedChunks.size >= MEG_BASE_CHUNK_TRAVEL) {
      megBaseBuilt = true;
      buildMegAlphaBase(root, ctx);
      reloadBelowGradeChunks(ctx);
    }

    if (here.cx === lastCx && here.cz === lastCz && chunks.size > 0) return;
    lastCx = here.cx;
    lastCz = here.cz;
    updateStreaming(px, pz, ctx);
  }

  function dispose() {
    var keys = [];
    chunks.forEach(function (_rec, k) {
      keys.push(k);
    });
    var i;
    for (i = 0; i < keys.length; i++) {
      unloadChunk(keys[i], ctx);
    }
    if (chunksRoot.parent) chunksRoot.parent.remove(chunksRoot);
    _propModelCtxs.delete(ctx);
    dropLevel1PropSlots(root);
    c101Entities.dispose();
    resetMegModuleState();
  }

  update(spawn.x, spawn.z);

  ensureChestTemplate(opts.loadGltf, function () {
    /* 预加载 pirate-chest.glb，附近区块生成时直接 clone */
  });

  return {
    update: update,
    dispose: dispose,
    colliders: colliders,
    industrialLights: industrialLights,
    ambientLight: ambient,
    spawnX: spawn.x,
    spawnZ: spawn.z,
    megGuideNpc: megGuideNpc,
    getSectionAt: function (px, pz) {
      return modConfig
        ? { id: "reconfigured", name: "重构区段" }
        : getLevel1SectionAt(px, pz);
    },
    getMegBaseCenter: function () {
      return megBaseBuilt ? megBaseWorldCenter() : null;
    },
    isInsideMegBaseInterior: function (px, pz) {
      return isInsideMegBaseInterior(px, pz);
    },
    isInsideMegBaseComplex: function (px, pz) {
      return isInsideMegBaseComplex(px, pz);
    },
    getAlphaFloorY: function (px, pz) {
      var center = megAlphaCenterOrNull();
      return center ? getAlphaFloorY(px, pz, center) : 0;
    },
    stickAlphaRampY: function (feetY, velY, px, pz) {
      var center = megAlphaCenterOrNull();
      return center ? stickAlphaRampY(feetY, velY, px, pz, center) : feetY;
    },
    getAlphaCeilingY: function (px, pz, fallback) {
      var center = megAlphaCenterOrNull();
      return center ? getAlphaCeilingY(px, pz, center, fallback) : fallback;
    },
    tryOpenMegOfficeDoorAim: function () {
      return tryOpenMegOfficeDoorAim();
    },
    ensureMegBase: function () {
      if (!megBaseBuilt) {
        megBaseBuilt = true;
        buildMegAlphaBase(root, ctx);
        reloadMegClearChunks(ctx);
      } else {
        syncMegBaseColliders(ctx);
      }
      return megBaseWorldCenter();
    },
    updateMegDoor: function (dt) {
      updateMegDoorAnimation(dt);
    },
    updateMegCorridorVisibility: function (px, pz) {
      updateMegCorridorVisibility(px, pz);
    },
    tryOpenMegDoor: function (px, pz) {
      return tryOpenMegDoor(px, pz);
    },
    isNearMegDoor: function (px, pz) {
      return isNearMegDoor(px, pz);
    },
    isNearMegFrontDoor: function (px, pz) {
      return isNearMegFrontDoor(px, pz);
    },
    isNearMegBackDoor: function (px, pz) {
      return isNearMegBackDoor(px, pz);
    },
    isMegDoorOpen: function () {
      return _megDoorState ? _megDoorState.open : false;
    },
    getMegInteriorNpc: function () {
      return _megInteriorNpc;
    },
    setPackageReceiverVisible: function (visible) {
      if (_megPackageReceiverNpc && _megPackageReceiverNpc.group) {
        _megPackageReceiverNpc.group.visible = !!visible;
      }
    },
    isNearMegInteriorNpc: function (px, pz) {
      return isNearMegInteriorNpc(px, pz);
    },
    isNearMegBackDoorStaffNpc: function (px, pz) {
      return isNearMegBackDoorStaffNpc(px, pz);
    },
    getAimInteractRoots: function () {
      var roots = [];
      if (megGuideNpc && megGuideNpc.group) roots.push(megGuideNpc.group);
      if (_megInteriorNpc && _megInteriorNpc.group) roots.push(_megInteriorNpc.group);
      if (_megBackDoorStaffNpc && _megBackDoorStaffNpc.group) {
        roots.push(_megBackDoorStaffNpc.group);
      }
      if (_megLevel11Npc && _megLevel11Npc.group) {
        roots.push(_megLevel11Npc.group);
      }
      if (
        _megPackageReceiverNpc &&
        _megPackageReceiverNpc.group &&
        _megPackageReceiverNpc.group.visible
      ) {
        roots.push(_megPackageReceiverNpc.group);
      }
      if (_megStorageClerkNpc && _megStorageClerkNpc.group) {
        roots.push(_megStorageClerkNpc.group);
      }
      if (_megRecruiterNpc && _megRecruiterNpc.group) {
        roots.push(_megRecruiterNpc.group);
      }
      if (
        _megDoorState &&
        _megDoorState.pickMesh &&
        !_megDoorState.open &&
        !_megDoorState.opening
      ) {
        roots.push(_megDoorState.pickMesh);
      }
      if (
        _megBackDoorState &&
        _megBackDoorState.pickMesh &&
        !_megBackDoorState.open &&
        !_megBackDoorState.opening
      ) {
        roots.push(_megBackDoorState.pickMesh);
      }
      if (_megSideDoors) {
        for (var sdi = 0; sdi < _megSideDoors.length; sdi++) {
          var side = _megSideDoors[sdi];
          if (side && side.pickMesh && !side.open && !side.opening) {
            roots.push(side.pickMesh);
          }
        }
      }
      if (c101Entrance && c101Entrance.pickMesh) {
        roots.push(c101Entrance.pickMesh);
      }
      if (_level13Entrance) roots.push(_level13Entrance);
      if (_levelC1Entrance) roots.push(_levelC1Entrance);
      if (_e81CallPick) roots.push(_e81CallPick);
      if (_megAlphaPicks) {
        for (var ai = 0; ai < _megAlphaPicks.length; ai++) {
          var pick = _megAlphaPicks[ai];
          if (pick && pick.visible) roots.push(pick);
        }
      }
      for (var si = 0; si < ctx.sublevelInteracts.length; si++) {
        roots.push(ctx.sublevelInteracts[si]);
      }
      return roots;
    },
    getC101ReturnSpawn: function () {
      return c101Entrance ? c101Entrance.returnSpawn : null;
    },
    updateC101Entities: function (dt, px, pz, survival, toastFn) {
      c101Entities.update(dt, px, pz, survival, toastFn);
    },
    tryOpenMegFrontDoorAim: function () {
      return tryOpenMegFrontDoorAim();
    },
    tryOpenMegSideDoorAim: function (which) {
      return tryOpenMegSideDoorAim(which);
    },
    openMegBackDoorByAim: function () {
      return openMegBackDoorByAim();
    },
    isPlayerInMegCorridor: function (px, pz) {
      var center = megAlphaCenterOrNull();
      return !!(center && isInsideAlphaCorridor(px, pz, center));
    },
    isPlayerInHubCorridor: function (px, pz) {
      var center = megAlphaCenterOrNull();
      return !!(center && isInsideAlphaCorridor(px, pz, center) === "se");
    },
    getMegCorridorProgress: function (px, pz) {
      var center = megAlphaCenterOrNull();
      if (!center) return 0;
      var key = isInsideAlphaCorridor(px, pz, center);
      if (!key) return 0;
      return corridorProgress(px, pz, getAlphaLayout(center).corridors[key]);
    },
    isMegBackCorridorOpen: function () {
      return !!_megCorridorState;
    },
    /** 东南角 +X 走廊几何，供枢纽岔路口就地生成 */
    getMegCorridorInfo: function () {
      var st = _megCorridorState;
      var center = megAlphaCenterOrNull();
      if (!st || !center) return null;
      var hub = getHubCorridor(center);
      return {
        startX: hub.startX,
        length: ALPHA_CORRIDOR_LEN,
        centerZ: hub.midZ,
        halfW: hub.halfW,
        height: st.bh || ALPHA_LOBBY.h,
        group: st.group,
      };
    },
    carveMegCorridorNorthGap: function (gapMinX, gapMaxX) {
      return carveMegCorridorNorthGap(gapMinX, gapMaxX);
    },
  };
}

/**
 * 切出进入 Level 1 的安全出生点 — 沿 Level 0 切出朝向前推，避开墙/宝箱碰撞
 * @param {object[]} colliders
 * @param {number} playerRadius
 */
export function resolveClipEntrySpawn(colliders, playerRadius) {
  var yaw = 0;
  try {
    var raw = sessionStorage.getItem("backrooms_clip_yaw");
    if (raw != null) yaw = parseFloat(raw);
    sessionStorage.removeItem("backrooms_clip_yaw");
  } catch (err) {
    /* ignore */
  }
  if (!Number.isFinite(yaw)) yaw = 0;

  var fx = -Math.sin(yaw);
  var fz = Math.cos(yaw);
  var base = { x: SPAWN_WORLD.x, z: SPAWN_WORLD.z };
  var dist;
  var tx;
  var tz;
  var gCol;
  var gRow;
  var center;
  var resolved;
  var s = spawnGridCell();

  for (dist = 0; dist <= 4; dist += 1.2) {
    tx = base.x + fx * dist;
    tz = base.z + fz * dist;
    gCol = Math.floor(tx / BLOCK_SIZE);
    gRow = Math.floor(tz / BLOCK_SIZE);
    if (
      Math.abs(gCol - s.col) > SPAWN_SAFE_CELL_RADIUS ||
      Math.abs(gRow - s.row) > SPAWN_SAFE_CELL_RADIUS
    ) {
      continue;
    }
    if (!isOpenCell(gCol, gRow)) continue;
    center = cellWorldCenter(gCol, gRow);
    if (!circleOverlapsAny(center.x, center.z, playerRadius + 0.08, colliders)) {
      return { x: center.x, z: center.z, yaw: yaw };
    }
    resolved = resolveCircleAgainstColliders(
      center.x,
      center.z,
      playerRadius,
      colliders,
      64,
      20
    );
    if (!circleOverlapsAny(resolved.x, resolved.z, playerRadius + 0.08, colliders)) {
      return { x: resolved.x, z: resolved.z, yaw: yaw };
    }
  }

  var fallback = findNearestClearCell(colliders, playerRadius, base.x, base.z);
  fallback.yaw = yaw;
  return fallback;
}

function findNearestClearCell(colliders, playerRadius, px, pz) {
  var gCol0 = Math.floor(px / BLOCK_SIZE);
  var gRow0 = Math.floor(pz / BLOCK_SIZE);
  var ring;
  var dc;
  var dr;
  var gc;
  var gr;
  var center;
  var resolved;
  var s = spawnGridCell();

  for (ring = 0; ring <= SPAWN_SAFE_CELL_RADIUS + 2; ring++) {
    for (dc = -ring; dc <= ring; dc++) {
      for (dr = -ring; dr <= ring; dr++) {
        if (ring > 0 && Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
        gc = gCol0 + dc;
        gr = gRow0 + dr;
        if (
          Math.abs(gc - s.col) > SPAWN_SAFE_CELL_RADIUS + 2 ||
          Math.abs(gr - s.row) > SPAWN_SAFE_CELL_RADIUS + 2
        ) {
          continue;
        }
        if (!isOpenCell(gc, gr)) continue;
        center = cellWorldCenter(gc, gr);
        if (!circleOverlapsAny(center.x, center.z, playerRadius + 0.08, colliders)) {
          return { x: center.x, z: center.z };
        }
      }
    }
  }

  resolved = resolveCircleAgainstColliders(px, pz, playerRadius, colliders, 64, 28);
  return { x: resolved.x, z: resolved.z };
}

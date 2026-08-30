/**
 * 后室 Level 1 — 无限工业仓库（分块流式加载）
 * 供 backrooms-level1.js 与 action-scene.js 共用
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import {
  resolveCircleAgainstColliders,
  circleOverlapsAny,
} from "./backrooms-collide.js";
import { createPartygoersAt } from "./backrooms-partygoer.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";

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
/** @type {object | null} 基地后门（东，仅室内可开） */
var _megBackDoorState = null;
/** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
var _megCorridorFootprint = null;
/** @type {{ group: THREE.Group, colliders: object[], collidersActive: boolean, ctx: object } | null} */
var _megCorridorState = null;
export const CHEST_GLB_URL = "models/pirate-chest.glb";
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
  return (
    Math.abs(c.x - _megBaseCenter.x) <= _megBaseHalfW &&
    Math.abs(c.z - _megBaseCenter.z) <= _megBaseHalfD
  );
}

var MEG_CORRIDOR_LEN = 52;

function megCorridorStartX(center, hx, wallT) {
  return center.x + hx + wallT + 0.14;
}

function megCorridorFootprintBounds(center, hx, doorW, wallT) {
  var innerW = doorW - 0.2;
  var halfW = innerW * 0.5;
  var startX = megCorridorStartX(center, hx, wallT);
  var endX = startX + MEG_CORRIDOR_LEN;
  return {
    minX: startX - 0.5,
    maxX: endX + 0.5,
    minZ: center.z - halfW - 0.5,
    maxZ: center.z + halfW + 0.5,
  };
}

function isInMegCorridorFootprint(gCol, gRow) {
  if (!_megCorridorFootprint) return false;
  var b = _megCorridorFootprint;
  var c = cellWorldCenter(gCol, gRow);
  return (
    c.x >= b.minX &&
    c.x <= b.maxX &&
    c.z >= b.minZ &&
    c.z <= b.maxZ
  );
}

function isInMegClearFootprint(gCol, gRow) {
  return isInMegBaseFootprint(gCol, gRow) || isInMegCorridorFootprint(gCol, gRow);
}

function isInsideMegBaseInterior(px, pz) {
  if (!_megBaseCenter) return false;
  return (
    Math.abs(px - _megBaseCenter.x) <= _megBaseHalfW - 1.2 &&
    Math.abs(pz - _megBaseCenter.z) <= _megBaseHalfD - 1.2
  );
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
  ctx2d.font = "bold 52px system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif";
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
  d.mesh.position.y = d.y0 + (d.y1 - d.y0) * ease;
}

function updateMegDoorAnimation(dt) {
  updateSingleMegDoor(_megDoorState, dt);
  updateSingleMegDoor(_megBackDoorState, dt);
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

function isNearMegDoor(px, pz) {
  return isNearMegFrontDoor(px, pz) || isNearMegBackDoor(px, pz);
}

function buildMegHiddenCorridor(root, ctx, center, hx, doorW, bh, wallT) {
  if (_megCorridorState) return _megCorridorState;

  var len = MEG_CORRIDOR_LEN;
  var innerW = doorW - 0.2;
  var halfW = innerW * 0.5;
  var startX = megCorridorStartX(center, hx, wallT);
  var midX = startX + len * 0.5;
  var endX = startX + len;

  var corridorGroup = new THREE.Group();
  corridorGroup.name = "MegHiddenCorridor";
  corridorGroup.visible = false;

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

  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.14, innerW),
    whiteFloor
  );
  floor.position.set(midX, 0.07, center.z);
  corridorGroup.add(floor);

  var ceil = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.1, innerW),
    whiteCeil
  );
  ceil.position.set(midX, bh, center.z);
  corridorGroup.add(ceil);

  var wallN = new THREE.Mesh(
    new THREE.BoxGeometry(len, bh, 0.14),
    whiteWall
  );
  wallN.position.set(midX, bh * 0.5, center.z + halfW);
  corridorGroup.add(wallN);

  var wallS = wallN.clone();
  wallS.position.z = center.z - halfW;
  corridorGroup.add(wallS);

  var endWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, bh, innerW),
    whiteWall
  );
  endWall.position.set(endX, bh * 0.5, center.z);
  corridorGroup.add(endWall);

  var panelMat = sharedPanelMat();
  var panelGeo = sharedPanelGeo();
  for (var li = 0; li < 6; li++) {
    var panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(startX + 4 + li * 8, bh - 0.22, center.z);
    panel.rotation.x = Math.PI * 0.5;
    corridorGroup.add(panel);
  }

  root.add(corridorGroup);

  var corridorColliders = [
    {
      kind: "wall",
      minX: startX,
      maxX: endX,
      minZ: center.z + halfW - 0.07,
      maxZ: center.z + halfW + 0.14,
    },
    {
      kind: "wall",
      minX: startX,
      maxX: endX,
      minZ: center.z - halfW - 0.14,
      maxZ: center.z - halfW + 0.07,
    },
    {
      kind: "wall",
      minX: endX - 0.07,
      maxX: endX + 0.14,
      minZ: center.z - halfW,
      maxZ: center.z + halfW,
    },
  ];

  _megCorridorState = {
    group: corridorGroup,
    colliders: corridorColliders,
    collidersActive: false,
    ctx: ctx,
    wallN: wallN,
    northGapOpen: false,
  };
  return _megCorridorState;
}

/**
 * 在走廊北墙上开出通往枢纽路线的岔路口：北墙拆成两段，中间留出通行缺口。
 * @returns {boolean} 是否成功开口
 */
function carveMegCorridorNorthGap(gapMinX, gapMaxX) {
  var st = _megCorridorState;
  var d = _megBackDoorState;
  if (!st || !d || st.northGapOpen) return false;

  var startX = megCorridorStartX(d.center, d.hx, d.wallT);
  var endX = startX + MEG_CORRIDOR_LEN;
  if (gapMinX <= startX + 0.4 || gapMaxX >= endX - 0.4) return false;
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

  var north = null;
  for (var i = 0; i < st.colliders.length; i++) {
    var c = st.colliders[i];
    if (c.minZ > d.center.z && c.maxX - c.minX > MEG_CORRIDOR_LEN * 0.5) {
      north = c;
      break;
    }
  }
  if (north) {
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

/** 走廊仅在后门已开且人在基地内或已在走廊中时渲染，室外永远看不到白墙 */
function updateMegCorridorVisibility(px, pz) {
  var st = _megCorridorState;
  var bd = _megBackDoorState;
  if (!st || !st.group) return;
  if (!bd || (!bd.open && !bd.opening)) {
    st.group.visible = false;
    return;
  }
  var insideBase =
    isInsideMegBaseInterior(px, pz) ||
    (bd.center &&
      px <= bd.center.x + bd.hx - 0.15 &&
      Math.abs(pz - bd.center.z) <= bd.doorW * 0.55);
  var inCorridor = false;
  if (_megCorridorFootprint) {
    var b = _megCorridorFootprint;
    inCorridor =
      px >= b.minX &&
      px <= b.maxX &&
      pz >= b.minZ &&
      pz <= b.maxZ;
  }
  st.group.visible = insideBase || inCorridor;
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

function openMegBackDoorInternal() {
  var d = _megBackDoorState;
  if (!d || d.open || d.opening) return false;
  buildMegHiddenCorridor(d.root, d.ctx, d.center, d.hx, d.doorW, d.bh, d.wallT);
  activateMegCorridor();
  d.opening = true;
  d.t = 0;
  if (d.collider) {
    ghostRemoveMegCollider(d.ctx, d.collider);
  }
  if (d.outerBlocker) {
    ghostRemoveMegCollider(d.ctx, d.outerBlocker);
  }
  return true;
}

function tryOpenMegFrontDoorAim() {
  var d = _megDoorState;
  if (!d || d.open || d.opening) return false;
  d.opening = true;
  d.t = 0;
  if (d.collider) {
    ghostRemoveMegCollider(d.ctx, d.collider);
  }
  return true;
}

function openMegBackDoorByAim() {
  return openMegBackDoorInternal();
}

function tryOpenMegDoor(px, pz) {
  if (tryOpenMegFrontDoor(px, pz)) return true;
  if (tryOpenMegBackDoor(px, pz)) return true;
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
function resetMegModuleState() {
  _megBaseCenter = null;
  _megBaseOccluderGroup = null;
  _megBaseColliders = null;
  _megDoorState = null;
  _megBackDoorState = null;
  _megCorridorFootprint = null;
  _megCorridorState = null;
  _megInteriorNpc = null;
  _megBackDoorStaffNpc = null;
  _megLevel11Npc = null;
  _megPackageReceiverNpc = null;
  _megStorageClerkNpc = null;
  _megRecruiterNpc = null;
  _level13Entrance = null;
  _levelC1Entrance = null;
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
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);

  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), uniformMat);
  torso.position.y = 1.21;
  group.add(torso);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.72;
  group.add(head);

  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), uniformMat);
  armL.position.set(-0.36, 1.18, 0);
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
  group.add(badge);

  root.add(group);
  return { group: group, x: wx, z: wz };
}

export function buildMegGuideNpc(root) {
  var px = SPAWN_WORLD.x + 3.8;
  var pz = SPAWN_WORLD.z + 1.2;
  var built = buildMegStaffFigure(root, px, pz, "MegGuideNpc", "guide");
  return { group: built.group, x: px, z: pz, talkRadius: 3.2 };
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

  var bw = 14;
  var bd = 10;
  var bh = 6;
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
    new THREE.BoxGeometry(bw + 2.5, 0.18, bd + 2.5),
    padMat
  );
  pad.position.set(center.x, 0.09, center.z);
  root.add(pad);

  function wallBox(w, h, d, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    group.add(m);
  }

  // 北墙 (+Z)
  wallBox(bw, bh, wallT, center.x, bh * 0.5, center.z + hz);
  megWall(center.x - hx, center.x + hx, center.z + hz - wallT, center.z + hz + wallT);
  // 南墙 (-Z)
  wallBox(bw, bh, wallT, center.x, bh * 0.5, center.z - hz);
  megWall(center.x - hx, center.x + hx, center.z - hz - wallT, center.z - hz + wallT);
  // 东墙 (+X) 留后门 — 外侧与基地墙同色门板，走廊仅开门后生成
  var segZEast = (bd - doorW) * 0.5;
  var segCenterZEast = hz - segZEast * 0.5;
  wallBox(wallT, bh, segZEast, center.x + hx, bh * 0.5, center.z + segCenterZEast);
  megWall(center.x + hx - wallT, center.x + hx + wallT, center.z + doorW * 0.5, center.z + hz);
  wallBox(wallT, bh, segZEast, center.x + hx, bh * 0.5, center.z - segCenterZEast);
  megWall(center.x + hx - wallT, center.x + hx + wallT, center.z - hz, center.z - doorW * 0.5);
  wallBox(wallT, lintelH, doorW, center.x + hx, doorH + lintelH * 0.5, center.z);

  var backDoor = new THREE.Mesh(
    new THREE.BoxGeometry(doorThick, doorH, doorW - 0.2),
    wallMat
  );
  backDoor.position.set(center.x + hx - doorThick * 0.5, doorY0, center.z);
  group.add(backDoor);

  var backDoorCollider = {
    kind: "meg_door",
    minX: center.x + hx - doorThick - 0.05,
    maxX: center.x + hx + 0.05,
    minZ: center.z - doorW * 0.5 + 0.08,
    maxZ: center.z + doorW * 0.5 - 0.08,
  };
  registerMegColliderObject(ctx, megColliders, backDoorCollider);

  var backDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, doorH + 0.2, doorW + 0.08),
    sharedChestPickMat()
  );
  backDoorPick.position.set(center.x + hx - doorThick * 0.5, doorY0, center.z);
  backDoorPick.userData.brInteract = { kind: "meg_door", which: "back" };
  group.add(backDoorPick);

  var outerPlug = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, doorH + 0.04, doorW + 0.06),
    wallMat
  );
  outerPlug.name = "MegBackDoorOuterPlug";
  outerPlug.position.set(center.x + hx + wallT * 0.5 + 0.03, doorY0, center.z);
  group.add(outerPlug);

  var outerBlocker = {
    kind: "wall",
    minX: center.x + hx - 0.04,
    maxX: center.x + hx + wallT + 0.22,
    minZ: center.z - doorW * 0.5 + 0.05,
    maxZ: center.z + doorW * 0.5 - 0.05,
  };
  registerMegColliderObject(ctx, megColliders, outerBlocker);

  _megBackDoorState = {
    mesh: backDoor,
    pickMesh: backDoorPick,
    collider: backDoorCollider,
    outerBlocker: outerBlocker,
    ctx: ctx,
    root: root,
    center: center,
    hx: hx,
    doorW: doorW,
    bh: bh,
    wallT: wallT,
    open: false,
    opening: false,
    t: 0,
    duration: 1.15,
    y0: doorY0,
    y1: doorY1,
    interactDist: 2.8,
    interactX: center.x + hx - 1.35,
    interactZ: center.z,
  };

  // 西墙 (-X) 留门 — 面向出生点方向
  var segZ = (bd - doorW) * 0.5;
  var segCenterZ = hz - segZ * 0.5;
  wallBox(wallT, bh, segZ, center.x - hx, bh * 0.5, center.z + segCenterZ);
  megWall(center.x - hx - wallT, center.x - hx + wallT, center.z + doorW * 0.5, center.z + hz);
  wallBox(wallT, bh, segZ, center.x - hx, bh * 0.5, center.z - segCenterZ);
  megWall(center.x - hx - wallT, center.x - hx + wallT, center.z - hz, center.z - doorW * 0.5);

  // 门楣（仅视觉；2D 碰撞不挡门洞）
  wallBox(wallT, lintelH, doorW, center.x - hx, doorH + lintelH * 0.5, center.z);

  var door = new THREE.Mesh(
    new THREE.BoxGeometry(doorThick, doorH, doorW - 0.2),
    doorMat
  );
  door.position.set(center.x - hx + doorThick * 0.5, doorY0, center.z);
  group.add(door);

  var frontDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, doorH + 0.2, doorW + 0.08),
    sharedChestPickMat()
  );
  frontDoorPick.position.set(center.x - hx + doorThick * 0.5, doorY0, center.z);
  frontDoorPick.userData.brInteract = { kind: "meg_door", which: "front" };
  group.add(frontDoorPick);

  var doorCollider = {
    kind: "meg_door",
    minX: center.x - hx - 0.05,
    maxX: center.x - hx + doorThick + 0.05,
    minZ: center.z - doorW * 0.5 + 0.08,
    maxZ: center.z + doorW * 0.5 - 0.08,
  };
  registerMegColliderObject(ctx, megColliders, doorCollider);

  _megDoorState = {
    mesh: door,
    pickMesh: frontDoorPick,
    collider: doorCollider,
    ctx: ctx,
    open: false,
    opening: false,
    t: 0,
    duration: 1.15,
    y0: doorY0,
    y1: doorY1,
    interactDist: 3.4,
    interactX: center.x - hx - 1.4,
    interactZ: center.z,
  };

  // 屋顶
  var roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 0.55, bd + 0.8), roofMat);
  roof.position.set(center.x, bh + 0.28, center.z);
  group.add(roof);

  // 门上方标牌
  var signTex = createMegSignTexture("alpha");
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 1.05),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: false })
  );
  sign.position.set(center.x - hx - 0.22, doorH + 0.85, center.z);
  sign.rotation.y = -Math.PI * 0.5;
  group.add(sign);

  // 入口灯条
  var entryLight = new THREE.Mesh(sharedPanelGeo(), sharedPanelMat());
  entryLight.position.set(center.x - hx + 0.5, bh - 0.35, center.z);
  entryLight.rotation.y = Math.PI * 0.5;
  group.add(entryLight);

  var level13Tex = createMegSignTexture("Level 1.3 · 封禁");
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
  level13Entrance.position.set(center.x + 1.8, 1.35, center.z - hz - 0.7);
  level13Entrance.rotation.y = Math.PI;
  level13Entrance.userData.brInteract = {
    kind: "l1_sublevel_entry",
    levelId: "1.3",
  };
  root.add(level13Entrance);
  _level13Entrance = level13Entrance;

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
  c1Sign.position.set(0, 1.92, 0.16);
  c1Door.add(c1Sign);
  var c1Pick = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 2.3, 1),
    sharedChestPickMat()
  );
  c1Pick.position.set(0, 1.15, 0.4);
  c1Pick.userData.brInteract = { kind: "l1_c1_door" };
  c1Door.add(c1Pick);
  c1Door.position.set(center.x - 3.6, 0, center.z - hz - 0.72);
  c1Door.rotation.y = Math.PI;
  root.add(c1Door);
  _levelC1Entrance = c1Pick;

  var backDoorStaff = buildMegStaffFigure(
    root,
    center.x + hx - 2.15,
    center.z - 0.85,
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
    center.x - hx + 2.15,
    center.z + 0.85,
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

  root.add(group);
  _megBaseOccluderGroup = group;
  _megBaseColliders = megColliders;
  _megCorridorFootprint = megCorridorFootprintBounds(center, hx, doorW, wallT);
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
  var wallGeo = sharedWallGeo();
  var chestGeo = sharedChestGeo();
  var pickGeo = sharedChestPickGeo();
  var panelGeo = sharedPanelGeo();
  group.traverse(function (child) {
    if (!child.isMesh) return;
    // clone(true) 与 _chestTemplate 共享 geometry，不可 dispose
    if (isUnderNamedAncestor(child, "QuantumPirateChest")) return;
    var geo = child.geometry;
    if (
      geo &&
      geo !== chunkPlane &&
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
    mesh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), material);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.set(centerX + 5.5, 0.012, centerZ - 4.5);
    group.add(mesh);
    record.materials.push(material);
    return;
  }
  if (profile.id === "golden") {
    material = new THREE.MeshBasicMaterial({ color: 0xffb84d });
    for (var gi = -1; gi <= 1; gi++) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(chunkSize * 0.62, 0.035, 0.055), material);
      mesh.position.set(centerX, WAREHOUSE_HEIGHT - 0.13, centerZ + gi * 7);
      group.add(mesh);
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
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.46, WAREHOUSE_HEIGHT - 0.1, 8),
        material
      );
      mesh.position.set(centerX + gx * 8.5, WAREHOUSE_HEIGHT * 0.5, centerZ);
      group.add(mesh);
    }
    var arch = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.3, 6, 20, Math.PI), material);
    arch.position.set(centerX, WAREHOUSE_HEIGHT - 0.2, centerZ);
    arch.rotation.z = Math.PI;
    group.add(arch);
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
    var frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 0.24), fakeWindowFrameMat);
    frame.position.y = 1.55;
    fakeWindow.add(frame);
    var pane = new THREE.Mesh(new THREE.BoxGeometry(2.65, 2.25, 0.5), fakeWindowPaneMat);
    pane.position.set(0, 1.55, -0.02);
    pane.userData.brInteract = {
      kind: "l1_sublevel_entry",
      levelId: "1.5",
    };
    fakeWindow.add(pane);
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
    for (var vi = 0; vi < 5; vi++) {
      var angle = vi * 2.17;
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.13, 2.2 + (vi % 2), 6),
        material
      );
      mesh.position.set(
        centerX + Math.cos(angle) * 10,
        mesh.geometry.parameters.height * 0.5,
        centerZ + Math.sin(angle) * 10
      );
      mesh.rotation.z = Math.sin(angle) * 0.16;
      group.add(mesh);
    }
    var entranceMat = new THREE.MeshStandardMaterial({
      color: 0x294b2f,
      emissive: 0x112d15,
      emissiveIntensity: 0.34,
      roughness: 0.96,
    });
    var entrance = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 3.2, 0.22),
      entranceMat
    );
    entrance.name = "Level12OvergrownThreshold";
    var gardenEntranceCenter = findOpenSectionCell();
    entrance.position.set(gardenEntranceCenter.x, 1.6, gardenEntranceCenter.z);
    entrance.userData.brInteract = {
      kind: "l1_sublevel_entry",
      levelId: "1.2",
    };
    group.add(entrance);
    record.interacts.push(entrance);
    ctx.sublevelInteracts.push(entrance);
    record.materials.push(entranceMat);
    record.materials.push(material);
    return;
  }
  material = new THREE.MeshBasicMaterial({ color: 0xff4fc5 });
  var cableMat = new THREE.MeshBasicMaterial({ color: 0x54d9ff });
  for (var li = -1; li <= 1; li++) {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(chunkSize * 0.7, 0.045, 0.045), li ? material : cableMat);
    mesh.position.set(centerX, WAREHOUSE_HEIGHT - 0.22 - Math.abs(li) * 0.08, centerZ + li * 4.5);
    mesh.rotation.y = li * 0.03;
    group.add(mesh);
  }
  record.materials.push(material, cableMat);
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

  var floor = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), floorMat);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.set(centerX, 0, centerZ);
  group.add(floor);

  var ceiling = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), ceilingMat);
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.set(centerX, WAREHOUSE_HEIGHT, centerZ);
  group.add(ceiling);

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
  for (dz = -STREAM_RADIUS; dz <= STREAM_RADIUS; dz++) {
    for (dx = -STREAM_RADIUS; dx <= STREAM_RADIUS; dx++) {
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
    sharedWallMat().map = null;
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

  var ctx = {
    horror: horror,
    loadGltf: opts.loadGltf,
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
    ensureMegBase: function () {
      if (!megBaseBuilt) {
        megBaseBuilt = true;
        buildMegAlphaBase(root, ctx);
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
      if (c101Entrance && c101Entrance.pickMesh) {
        roots.push(c101Entrance.pickMesh);
      }
      if (_level13Entrance) roots.push(_level13Entrance);
      if (_levelC1Entrance) roots.push(_levelC1Entrance);
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
    openMegBackDoorByAim: function () {
      return openMegBackDoorByAim();
    },
    isPlayerInMegCorridor: function (px, pz) {
      if (!_megCorridorFootprint) return false;
      var b = _megCorridorFootprint;
      return (
        px >= b.minX &&
        px <= b.maxX &&
        pz >= b.minZ &&
        pz <= b.maxZ
      );
    },
    getMegCorridorProgress: function (px) {
      if (!_megCorridorFootprint) return 0;
      var b = _megCorridorFootprint;
      var span = b.maxX - b.minX;
      if (span <= 0.01) return 0;
      return Math.max(0, Math.min(1, (px - b.minX) / span));
    },
    isMegBackCorridorOpen: function () {
      var d = _megBackDoorState;
      return !!(d && (d.open || d.opening));
    },
    /** 走廊真实几何，供枢纽岔路口就地生成使用；后门未开时为 null */
    getMegCorridorInfo: function () {
      var st = _megCorridorState;
      var d = _megBackDoorState;
      if (!st || !d) return null;
      return {
        startX: megCorridorStartX(d.center, d.hx, d.wallT),
        length: MEG_CORRIDOR_LEN,
        centerZ: d.center.z,
        halfW: (d.doorW - 0.2) * 0.5,
        height: d.bh,
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

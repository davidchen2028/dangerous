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
  };
  return _megCorridorState;
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
}

/** 出生区块 M.E.G 引导员 */
function buildMegStaffFigure(root, wx, wz, name, interactRole) {
  var group = new THREE.Group();
  group.name = name || "MegStaff";
  group.position.set(wx, 0, wz);
  group.userData.brInteract = {
    kind: "meg_npc",
    role: interactRole || "staff",
  };

  var uniformMat = new THREE.MeshLambertMaterial({
    color: 0x2a5080,
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

  var floor = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), sharedFloorMat());
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.set(centerX, 0, centerZ);
  group.add(floor);

  var ceiling = new THREE.Mesh(sharedChunkPlaneGeo(chunkSize), sharedCeilingMat());
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
  };

  var wallScale = 0.88;
  var wallPositions = [];
  var lr;
  var lc;
  for (lr = 0; lr < CHUNK_CELLS; lr++) {
    for (lc = 0; lc < CHUNK_CELLS; lc++) {
      var gCol = baseCol + lc;
      var gRow = baseRow + lr;
      var center = cellWorldCenter(gCol, gRow);

      if (isWallCell(gCol, gRow)) {
        wallPositions.push(center.x, WAREHOUSE_HEIGHT * 0.5, center.z);
        registerChunkCollider(ctx, record, createWallCollider(center, wallScale));
        continue;
      }

      if (shouldSpawnLight(gCol, gRow)) {
        var panel = new THREE.Mesh(sharedPanelGeo(), sharedPanelMat());
        panel.position.set(center.x, WAREHOUSE_HEIGHT - 0.06, center.z);
        group.add(panel);
        var lightEntry = {
          light: null,
          panelMat: panel.material,
          baseIntensity: 1,
          baseEmissive: 1,
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
      sharedWallMat(),
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
      dummy.scale.set(wallScale, 1, wallScale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      walls.setMatrixAt(wi, dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    group.add(walls);
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

  if (record.group.parent) record.group.parent.remove(record.group);
  disposeChunkMeshResources(record.group);

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
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level1InfiniteChunks";
  root.add(chunksRoot);

  buildClipEntryHall(root);
  var megGuideNpc = buildMegGuideNpc(root);

  var ambient = new THREE.AmbientLight(0xd0dce6, 1.05);
  root.add(ambient);
  if (horror) horror.registerAmbient(ambient, 1.05);

  var hemi = new THREE.HemisphereLight(0xe8f0f5, 0x3d5263, 0.55);
  root.add(hemi);

  var spawn = { x: SPAWN_WORLD.x, z: SPAWN_WORLD.z };
  var industrialLights = [];
  var colliders = [];
  var chunks = new Map();

  var ctx = {
    horror: horror,
    loadGltf: opts.loadGltf,
    chunksRoot: chunksRoot,
    chunks: chunks,
    colliders: colliders,
    industrialLights: industrialLights,
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
      return roots;
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

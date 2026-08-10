/**
 * Level 0 — 红室通道与 10×10 红房间
 */
import * as THREE from "three";

/** 替换的墙格（须为 BACKROOMS_MATRIX 中的 1） */
export const RED_CHANNEL_CELL = { row: 6, col: 4 };
/** 通道朝向：邻接可走格在西侧 (col 3) */
export const RED_CHANNEL_OPEN = "east";

export const RED_ROOM_GRID = 10;
export const RED_ROOM_SANITY_DRAIN_PER_SEC = 5;

var _redDoorWallMesh = null;
/** @type {THREE.MeshStandardMaterial | null} */
var _redDoorFaceMat = null;

export function isRedChannelCell(row, col) {
  return row === RED_CHANNEL_CELL.row && col === RED_CHANNEL_CELL.col;
}

function createSolidRedWallTexture() {
  var cw = 128;
  var ch = 192;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#c93030";
  ctx.fillRect(0, 0, cw, ch);
  var n;
  for (n = 0; n < 280; n++) {
    ctx.fillStyle = "rgba(0,0,0," + (0.015 + Math.random() * 0.035) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRedDoorWallTexture() {
  var cw = 128;
  var ch = 192;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#c93030";
  ctx.fillRect(0, 0, cw, ch);

  var n;
  for (n = 0; n < 400; n++) {
    ctx.fillStyle = "rgba(0,0,0," + (0.02 + Math.random() * 0.04) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }

  var doorW = cw * 0.42;
  var doorH = ch * 0.72;
  var doorX = (cw - doorW) * 0.5;
  var doorY = ch * 0.12;
  ctx.fillStyle = "#4a0808";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = "#2a0404";
  ctx.fillRect(doorX + doorW * 0.08, doorY + doorH * 0.06, doorW * 0.84, doorH * 0.88);

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 仅西侧面（朝走廊）闪烁 */
export function updateRedDoorWallFlicker(elapsed) {
  var mat = _redDoorFaceMat;
  if (!mat) return;
  var buzz =
    0.78 +
    Math.sin(elapsed * 4.1) * 0.14 +
    Math.sin(elapsed * 11.3) * 0.06;
  if (Math.random() < 0.03) buzz *= 0.5 + Math.random() * 0.35;
  mat.emissiveIntensity = 0.32 + buzz * 0.42;
}

function makeRedWallMaterial(tex, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({
    map: tex || undefined,
    color: tex ? 0xffffff : 0xc93030,
    emissive: 0xaa1818,
    emissiveIntensity: emissiveIntensity == null ? 0.38 : emissiveIntensity,
    roughness: 0.82,
    metalness: 0.04,
  });
}

/**
 * 一整块墙；只有西侧（-X，从 col3 走来能看见）有一扇门
 */
export function buildRedChannelWall(parent, wx, wz, gridSize, wallH, wallColliders) {
  var group = new THREE.Group();
  group.name = "RedChannel";
  group.position.set(wx, 0, wz);

  var solidTex = createSolidRedWallTexture();
  var doorTex = createRedDoorWallTexture();
  var solidMat = makeRedWallMaterial(solidTex, 0.32);
  var doorMat = makeRedWallMaterial(doorTex, 0.48);
  _redDoorFaceMat = doorMat;

  var mesh = new THREE.Mesh(new THREE.BoxGeometry(gridSize, wallH, gridSize), [
    solidMat,
    doorMat,
    solidMat,
    solidMat,
    solidMat,
    solidMat,
  ]);
  mesh.name = "RedDoorWall";
  mesh.position.y = wallH * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  _redDoorWallMesh = mesh;

  parent.add(group);

  var half = gridSize * 0.5;
  var halfGapZ = 0.525;
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz - halfGapZ,
    redChannel: true,
    ghost: false,
  });
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz + halfGapZ,
    maxZ: wz + half,
    redChannel: true,
    ghost: false,
  });
}

export function getRedChannelTriggerAabb(cellCenterX, cellCenterZ, gridSize) {
  var wx = cellCenterX(RED_CHANNEL_CELL.col);
  var wz = cellCenterZ(RED_CHANNEL_CELL.row);
  var half = gridSize * 0.5;
  var halfGapZ = 0.525;
  return {
    minX: wx - half - 0.45,
    maxX: wx - half + 0.75,
    minZ: wz - halfGapZ - 0.08,
    maxZ: wz + halfGapZ + 0.08,
  };
}

export function pointInAabb(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

export function buildRedRoom(parent, gridSize, wallH) {
  var group = new THREE.Group();
  group.name = "RedRoom";
  group.visible = false;

  var span = RED_ROOM_GRID * gridSize;
  var half = span * 0.5;

  var wallMat = new THREE.MeshStandardMaterial({
    color: 0x5a1010,
    emissive: 0x661010,
    emissiveIntensity: 0.22,
    roughness: 0.88,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x060608,
    emissive: 0x020204,
    emissiveIntensity: 0.08,
    roughness: 0.96,
    metalness: 0.05,
  });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0x6e1848,
    emissive: 0x9a2868,
    emissiveIntensity: 0.62,
    roughness: 0.78,
  });

  var floor = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1, span), floorMat);
  floor.position.y = 0.05;
  group.add(floor);
  var ceiling = new THREE.Mesh(new THREE.BoxGeometry(span, 0.08, span), ceilMat);
  ceiling.position.y = wallH;
  group.add(ceiling);

  var thick = gridSize;
  var colliders = [];
  function addWall(w, h, d, x, y, z, cMinX, cMaxX, cMinZ, cMaxZ) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    group.add(m);
    colliders.push({
      kind: "wall",
      minX: cMinX,
      maxX: cMaxX,
      minZ: cMinZ,
      maxZ: cMaxZ,
    });
  }

  var exitGap = 1.1;
  var northZ = -half - thick * 0.5;
  var segLen = (span - exitGap) * 0.5;

  addWall(
    segLen,
    wallH,
    thick,
    -half + segLen * 0.5,
    wallH * 0.5,
    northZ,
    -half,
    -half + segLen,
    -half - thick,
    -half
  );
  addWall(
    segLen,
    wallH,
    thick,
    half - segLen * 0.5,
    wallH * 0.5,
    northZ,
    half - segLen,
    half,
    -half - thick,
    -half
  );

  addWall(span + thick, wallH, thick, 0, wallH * 0.5, half + thick * 0.5, -half, half, half, half + thick);
  addWall(thick, wallH, span, -half - thick * 0.5, wallH * 0.5, 0, -half - thick, -half, half, half);
  addWall(thick, wallH, span, half + thick * 0.5, wallH * 0.5, 0, half, half + thick, -half, half);

  var exitTrigger = {
    minX: -exitGap * 0.5,
    maxX: exitGap * 0.5,
    minZ: -half + 0.15,
    maxZ: -half + 1.05,
  };

  var pl = new THREE.PointLight(0xff6644, 1.2, span * 1.6, 1.6);
  pl.position.set(0, wallH - 0.35, 0);
  group.add(pl);
  var ceilPl = new THREE.PointLight(0xc84888, 0.75, span * 1.2, 1.8);
  ceilPl.position.set(0, wallH - 0.15, 0);
  group.add(ceilPl);
  var amb = new THREE.HemisphereLight(0x883044, 0x060608, 0.42);
  group.add(amb);

  parent.add(group);

  return {
    group: group,
    colliders: colliders,
    exitTrigger: exitTrigger,
    half: half,
  };
}

/**
 * Level 0 — 蓝洞 → Level 0.3 极寒房间
 */
import * as THREE from "three";

/** 须为 BACKROOMS_MATRIX 中的 0（可走格） */
export const BLUE_HOLE_CELL = { row: 10, col: 4 };

export const LEVEL03_GRID = 10;
export const LEVEL03_FOG = 0x0a1428;
export const LEVEL03_COLD_HP_PER_SEC = 3;

export function isBlueHoleCell(row, col) {
  return row === BLUE_HOLE_CELL.row && col === BLUE_HOLE_CELL.col;
}

export function getBlueHoleTriggerAabb(cellCenterX, cellCenterZ, gridSize) {
  var wx = cellCenterX(BLUE_HOLE_CELL.col);
  var wz = cellCenterZ(BLUE_HOLE_CELL.row);
  var half = gridSize * 0.38;
  return {
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz + half,
  };
}

/**
 * L0 地面上的洞 + 下方可见的蓝色“底”
 */
export function buildBlueHole(parent, wx, wz, gridSize) {
  var group = new THREE.Group();
  group.name = "BlueHole";
  group.position.set(wx, 0, wz);

  var holeSize = gridSize * 0.72;
  var rim = new THREE.Mesh(
    new THREE.BoxGeometry(holeSize + 0.08, 0.06, holeSize + 0.08),
    new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.92 })
  );
  rim.position.y = 0.03;
  group.add(rim);

  var voidMat = new THREE.MeshStandardMaterial({
    color: 0x1a4a8a,
    emissive: 0x2060b0,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.1,
  });
  var pit = new THREE.Mesh(
    new THREE.PlaneGeometry(holeSize * 0.92, holeSize * 0.92),
    voidMat
  );
  pit.rotation.x = -Math.PI * 0.5;
  pit.position.y = -0.55;
  group.add(pit);

  var deep = new THREE.Mesh(
    new THREE.PlaneGeometry(holeSize * 1.4, holeSize * 1.4),
    new THREE.MeshBasicMaterial({ color: 0x0c2048 })
  );
  deep.rotation.x = -Math.PI * 0.5;
  deep.position.y = -1.15;
  group.add(deep);

  var glow = new THREE.PointLight(0x4488ff, 0.85, 5, 1.6);
  glow.position.set(0, -0.35, 0);
  group.add(glow);

  parent.add(group);
  return group;
}

export function buildLevel03Room(parent, gridSize, wallH) {
  var group = new THREE.Group();
  group.name = "Level03Room";
  group.visible = false;

  var span = LEVEL03_GRID * gridSize;
  var half = span * 0.5;
  var thick = gridSize;

  var wallMat = new THREE.MeshStandardMaterial({
    color: 0x5a9fd4,
    emissive: 0x2868a8,
    emissiveIntensity: 0.35,
    roughness: 0.75,
    metalness: 0.08,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x081830,
    emissive: 0x040c20,
    emissiveIntensity: 0.2,
    roughness: 0.96,
    metalness: 0.12,
  });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0x3a6898,
    emissive: 0x204870,
    emissiveIntensity: 0.28,
    roughness: 0.82,
  });

  var floor = new THREE.Mesh(new THREE.BoxGeometry(span, 0.12, span), floorMat);
  floor.position.y = 0.06;
  group.add(floor);
  var ceiling = new THREE.Mesh(new THREE.BoxGeometry(span, 0.08, span), ceilMat);
  ceiling.position.y = wallH;
  group.add(ceiling);

  var colliders = [];
  function addWall(w, h, d, x, y, z, cMinX, cMaxX, cMinZ, cMaxZ) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    group.add(m);
    colliders.push({
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
  addWall(
    span + thick,
    wallH,
    thick,
    0,
    wallH * 0.5,
    half + thick * 0.5,
    -half,
    half,
    half,
    half + thick
  );
  addWall(
    thick,
    wallH,
    span,
    -half - thick * 0.5,
    wallH * 0.5,
    0,
    -half - thick,
    -half,
    half,
    half
  );
  addWall(
    thick,
    wallH,
    span,
    half + thick * 0.5,
    wallH * 0.5,
    0,
    half,
    half + thick,
    -half,
    half
  );

  var exitTrigger = {
    minX: -exitGap * 0.5,
    maxX: exitGap * 0.5,
    minZ: -half + 0.15,
    maxZ: -half + 1.05,
  };

  var pl = new THREE.PointLight(0x88bbff, 1.1, span * 1.5, 1.5);
  pl.position.set(0, wallH - 0.4, 0);
  group.add(pl);
  var amb = new THREE.HemisphereLight(0x7090c0, 0x081020, 0.48);
  group.add(amb);

  parent.add(group);

  return {
    group: group,
    colliders: colliders,
    exitTrigger: exitTrigger,
    half: half,
  };
}

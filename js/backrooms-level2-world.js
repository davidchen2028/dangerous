/**
 * 后室 Level 2 — 蒸汽管道十字走廊（黑墙、圆灯、管道）
 */
import * as THREE from "three";
import { buildLevel2Doors } from "./backrooms-level2-doors.js";

export const CORRIDOR_LENGTH = 144;
export const CORRIDOR_WIDTH = 2.9;
export const CORRIDOR_HEIGHT = 3.4;
/** 出生在 +Z 端，朝十字中心 */
export const SPAWN_Z = CORRIDOR_LENGTH * 0.5 - 2;

const CEIL = 0x050506;
const PIPE = 0x2a2a32;
const WALL_THICK = 0.14;

function createLevel2WallTexture() {
  var cw = 128;
  var ch = 256;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#1c1c24";
  ctx.fillRect(0, 0, cw, ch);

  var y;
  for (y = 0; y < ch; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? "#14141a" : "#181820";
    ctx.fillRect(0, y, cw, 30);
    ctx.fillStyle = "#0e0e12";
    ctx.fillRect(0, y + 30, cw, 2);
  }

  var x;
  for (x = 0; x < cw; x += 16) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x, 0, 1, ch);
  }

  var n;
  for (n = 0; n < 800; n++) {
    var px = Math.random() * cw;
    var py = Math.random() * ch;
    var a = 0.04 + Math.random() * 0.08;
    ctx.fillStyle = "rgba(80,75,70," + a + ")";
    ctx.fillRect(px, py, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  tex.anisotropy = 4;
  return tex;
}

function createLevel2FloorTexture() {
  var size = 128;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#16161c";
  ctx.fillRect(0, 0, size, size);
  var i;
  for (i = 0; i < 600; i++) {
    ctx.fillStyle = "rgba(255,255,255," + (0.01 + Math.random() * 0.03) + ")";
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 48);
  tex.anisotropy = 4;
  return tex;
}

function pushWallBox(colliders, minX, maxX, minZ, maxZ) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  });
}

function addWallSegment(group, colliders, mat, w, h, d, x, y, z, cMinX, cMaxX, cMinZ, cMaxZ) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  group.add(mesh);
  pushWallBox(colliders, cMinX, cMaxX, cMinZ, cMaxZ);
}

function addZArmSideWalls(group, colliders, mat, halfW, halfLen, armSeg) {
  var y = CORRIDOR_HEIGHT * 0.5;
  var zNeg = -(halfW + halfLen) * 0.5;
  var zPos = (halfW + halfLen) * 0.5;

  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    armSeg,
    -halfW,
    y,
    zNeg,
    -halfW - WALL_THICK,
    -halfW,
    -halfLen,
    -halfW
  );
  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    armSeg,
    halfW,
    y,
    zNeg,
    halfW,
    halfW + WALL_THICK,
    -halfLen,
    -halfW
  );
  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    armSeg,
    -halfW,
    y,
    zPos,
    -halfW - WALL_THICK,
    -halfW,
    halfW,
    halfLen
  );
  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    armSeg,
    halfW,
    y,
    zPos,
    halfW,
    halfW + WALL_THICK,
    halfW,
    halfLen
  );
}

function addXArmSideWalls(group, colliders, mat, halfW, halfLen, armSeg) {
  var y = CORRIDOR_HEIGHT * 0.5;
  var xNeg = -(halfW + halfLen) * 0.5;
  var xPos = (halfW + halfLen) * 0.5;

  addWallSegment(
    group,
    colliders,
    mat,
    armSeg,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    xNeg,
    y,
    -halfW,
    -halfLen,
    -halfW,
    -halfW - WALL_THICK,
    -halfW
  );
  addWallSegment(
    group,
    colliders,
    mat,
    armSeg,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    xNeg,
    y,
    halfW,
    -halfLen,
    -halfW,
    halfW,
    halfW + WALL_THICK
  );
  addWallSegment(
    group,
    colliders,
    mat,
    armSeg,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    xPos,
    y,
    -halfW,
    halfW,
    halfLen,
    -halfW - WALL_THICK,
    -halfW
  );
  addWallSegment(
    group,
    colliders,
    mat,
    armSeg,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    xPos,
    y,
    halfW,
    halfW,
    halfLen,
    halfW,
    halfW + WALL_THICK
  );
}

function addEndCaps(group, colliders, mat, halfW, halfLen) {
  var y = CORRIDOR_HEIGHT * 0.5;
  var inset = WALL_THICK * 0.5;

  addWallSegment(
    group,
    colliders,
    mat,
    CORRIDOR_WIDTH,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    0,
    y,
    halfLen - inset,
    -halfW,
    halfW,
    halfLen - WALL_THICK,
    halfLen + 0.02
  );
  addWallSegment(
    group,
    colliders,
    mat,
    CORRIDOR_WIDTH,
    CORRIDOR_HEIGHT,
    WALL_THICK,
    0,
    y,
    -halfLen + inset,
    -halfW,
    halfW,
    -halfLen - 0.02,
    -halfLen + WALL_THICK
  );
  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    CORRIDOR_WIDTH,
    halfLen - inset,
    y,
    0,
    halfLen - WALL_THICK,
    halfLen + 0.02,
    -halfW,
    halfW
  );
  addWallSegment(
    group,
    colliders,
    mat,
    WALL_THICK,
    CORRIDOR_HEIGHT,
    CORRIDOR_WIDTH,
    -halfLen + inset,
    y,
    0,
    -halfLen - 0.02,
    -halfLen + WALL_THICK,
    -halfW,
    halfW
  );
}

function decorateZArm(
  group,
  colliders,
  halfW,
  zFrom,
  zTo,
  step,
  lampMat,
  pipeMat,
  pipeSpecs,
  pointLights,
  lampsOnLeft
) {
  var z = zFrom;
  var dir = zTo > zFrom ? 1 : -1;
  if (dir < 0) step = -Math.abs(step);
  else step = Math.abs(step);

  while (dir > 0 ? z <= zTo : z >= zTo) {
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), lampMat);
    var lampX = lampsOnLeft ? -halfW + 0.12 : halfW - 0.12;
    lamp.position.set(lampX, 1.65 + (Math.abs(z) % 3) * 0.08, z);
    group.add(lamp);

    var pl = new THREE.PointLight(0xffe8b8, 0.78, 7, 1.45);
    pl.position.set(lampsOnLeft ? -halfW + 0.25 : halfW - 0.25, 1.65, z);
    group.add(pl);
    pointLights.push(pl);

    z += step;
  }

  var armLen = Math.abs(zTo - zFrom);
  var pipeLen = Math.max(armLen - 1.2, 4);
  var pipeCenterZ = (zFrom + zTo) * 0.5;
  var pipeMinZ = pipeCenterZ - pipeLen * 0.5;
  var pipeMaxZ = pipeCenterZ + pipeLen * 0.5;
  var pi;
  for (pi = 0; pi < pipeSpecs.length; pi++) {
    var spec = pipeSpecs[pi];
    var pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.r, spec.r, pipeLen, 12, 1, false),
      pipeMat
    );
    pipe.rotation.x = Math.PI * 0.5;
    var pipeX = lampsOnLeft ? halfW - spec.xOff : -halfW + spec.xOff;
    pipe.position.set(pipeX, spec.y, pipeCenterZ);
    group.add(pipe);

    var pad = 0.05;
    colliders.push({
      kind: "wall",
      minX: pipeX - spec.r - pad,
      maxX: pipeX + spec.r + pad,
      minZ: pipeMinZ,
      maxZ: pipeMaxZ,
    });
  }
}

function decorateXArm(
  group,
  colliders,
  halfW,
  xFrom,
  xTo,
  step,
  lampMat,
  pipeMat,
  pipeSpecs,
  pointLights,
  lampsOnNegZSide
) {
  var x = xFrom;
  var dir = xTo > xFrom ? 1 : -1;
  if (dir < 0) step = -Math.abs(step);
  else step = Math.abs(step);

  while (dir > 0 ? x <= xTo : x >= xTo) {
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), lampMat);
    var lampZ = lampsOnNegZSide ? -halfW + 0.12 : halfW - 0.12;
    lamp.position.set(x, 1.65 + (Math.abs(x) % 3) * 0.08, lampZ);
    group.add(lamp);

    var pl = new THREE.PointLight(0xffe8b8, 0.78, 7, 1.45);
    pl.position.set(x, 1.65, lampsOnNegZSide ? -halfW + 0.25 : halfW - 0.25);
    group.add(pl);
    pointLights.push(pl);

    x += step;
  }

  var armLen = Math.abs(xTo - xFrom);
  var pipeLen = Math.max(armLen - 1.2, 4);
  var pipeCenterX = (xFrom + xTo) * 0.5;
  var pipeMinX = pipeCenterX - pipeLen * 0.5;
  var pipeMaxX = pipeCenterX + pipeLen * 0.5;
  var pi;
  for (pi = 0; pi < pipeSpecs.length; pi++) {
    var spec = pipeSpecs[pi];
    var pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.r, spec.r, pipeLen, 12, 1, false),
      pipeMat
    );
    pipe.rotation.z = Math.PI * 0.5;
    var pipeZ = lampsOnNegZSide ? halfW - spec.xOff : -halfW + spec.xOff;
    pipe.position.set(pipeCenterX, spec.y, pipeZ);
    group.add(pipe);

    var pad = 0.05;
    colliders.push({
      kind: "wall",
      minX: pipeMinX,
      maxX: pipeMaxX,
      minZ: pipeZ - spec.r - pad,
      maxZ: pipeZ + spec.r + pad,
    });
  }
}

export function buildBackroomsLevel2World(root) {
  var group = new THREE.Group();
  group.name = "Level2SteamCross";

  var len = CORRIDOR_LENGTH;
  var halfLen = len * 0.5;
  var halfW = CORRIDOR_WIDTH * 0.5;
  var armSeg = halfLen - halfW;
  var colliders = [];

  var wallMap = createLevel2WallTexture();
  var floorMap = createLevel2FloorTexture();

  var wallMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a44,
    emissive: 0x181820,
    emissiveIntensity: 0.35,
    roughness: 0.92,
    metalness: 0.06,
    map: wallMap || undefined,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a32,
    emissive: 0x0c0c10,
    emissiveIntensity: 0.2,
    roughness: 0.95,
    metalness: 0.04,
    map: floorMap || undefined,
  });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: CEIL,
    emissive: 0x08080c,
    emissiveIntensity: 0.25,
    roughness: 0.9,
    metalness: 0,
  });
  var pipeMat = new THREE.MeshStandardMaterial({
    color: PIPE,
    emissive: 0x141418,
    emissiveIntensity: 0.15,
    roughness: 0.75,
    metalness: 0.35,
  });

  var floorZ = new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_WIDTH, 0.14, len), floorMat);
  floorZ.position.set(0, 0.07, 0);
  group.add(floorZ);

  var floorX = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, CORRIDOR_WIDTH), floorMat);
  floorX.position.set(0, 0.07, 0);
  group.add(floorX);

  var ceilZ = new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_WIDTH, 0.12, len), ceilMat);
  ceilZ.position.set(0, CORRIDOR_HEIGHT, 0);
  group.add(ceilZ);

  var ceilX = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, CORRIDOR_WIDTH), ceilMat);
  ceilX.position.set(0, CORRIDOR_HEIGHT, 0);
  group.add(ceilX);

  addZArmSideWalls(group, colliders, wallMat, halfW, halfLen, armSeg);
  addXArmSideWalls(group, colliders, wallMat, halfW, halfLen, armSeg);
  addEndCaps(group, colliders, wallMat, halfW, halfLen);

  var lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d0,
    emissive: 0xffcc66,
    emissiveIntensity: 1.1,
    roughness: 0.4,
    metalness: 0,
  });
  var pointLights = [];
  var pipeSpecs = [
    { r: 0.2, y: 0.95, xOff: 0.38 },
    { r: 0.14, y: 1.55, xOff: 0.52 },
    { r: 0.24, y: 2.15, xOff: 0.34 },
  ];
  var lampStep = 5.5;
  var hubEdge = halfW + 0.35;

  decorateZArm(
    group,
    colliders,
    halfW,
    halfLen - 3,
    hubEdge,
    -lampStep,
    lampMat,
    pipeMat,
    pipeSpecs,
    pointLights,
    true
  );
  decorateZArm(
    group,
    colliders,
    halfW,
    -hubEdge,
    -halfLen + 3,
    -lampStep,
    lampMat,
    pipeMat,
    pipeSpecs,
    pointLights,
    true
  );
  decorateXArm(
    group,
    colliders,
    halfW,
    halfLen - 3,
    hubEdge,
    -lampStep,
    lampMat,
    pipeMat,
    pipeSpecs,
    pointLights,
    true
  );
  decorateXArm(
    group,
    colliders,
    halfW,
    -hubEdge,
    -halfLen + 3,
    -lampStep,
    lampMat,
    pipeMat,
    pipeSpecs,
    pointLights,
    true
  );

  var steamHaze = new THREE.Mesh(
    new THREE.PlaneGeometry(CORRIDOR_WIDTH * 2.2, CORRIDOR_WIDTH * 2.2),
    new THREE.MeshBasicMaterial({
      color: 0x8899aa,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    })
  );
  steamHaze.rotation.x = -Math.PI * 0.5;
  steamHaze.position.set(0, 0.5, 0);
  group.add(steamHaze);

  var doorPack = buildLevel2Doors(group, colliders, halfW, halfLen, hubEdge);

  root.add(group);

  var ambient = new THREE.AmbientLight(0x2a2a38, 0.58);
  root.add(ambient);

  var fill = new THREE.HemisphereLight(0x3a3a50, 0x0a0a10, 0.28);
  root.add(fill);

  return {
    colliders: colliders,
    spawnX: 0,
    spawnZ: SPAWN_Z,
    lighting: {
      ambient: ambient,
      fill: fill,
      pointLights: pointLights,
      materials: {
        wall: wallMat,
        floor: floorMat,
        ceil: ceilMat,
        pipe: pipeMat,
        lamp: lampMat,
      },
      steamHaze: steamHaze,
    },
    doors: doorPack.doors,
    interactRoots: doorPack.interactRoots,
  };
}

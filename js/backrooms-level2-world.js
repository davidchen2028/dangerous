/**
 * 后室 Level 2 — 蒸汽管道十字走廊（黑墙、圆灯、管道）
 */
import * as THREE from "three";
import { buildLevel2Doors } from "./backrooms-level2-doors.js?v=2";
import {
  CORRIDOR_LENGTH,
  CORRIDOR_WIDTH,
  CORRIDOR_HEIGHT,
  SPAWN_Z,
} from "./backrooms-level2-constants.js";

export {
  CORRIDOR_LENGTH,
  CORRIDOR_WIDTH,
  CORRIDOR_HEIGHT,
  SPAWN_Z,
} from "./backrooms-level2-constants.js";

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

  ctx.fillStyle = "#302d29";
  ctx.fillRect(0, 0, cw, ch);

  var y;
  for (y = 0; y < ch; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? "#312d28" : "#252421";
    ctx.fillRect(0, y, cw, 30);
    ctx.fillStyle = "#181715";
    ctx.fillRect(0, y + 30, cw, 2);
  }

  var x;
  for (y = 0; y < ch; y += 32) {
    var offset = (y / 32) % 2 ? 16 : 0;
    for (x = -offset; x < cw; x += 32) {
      ctx.fillStyle = "rgba(12,9,7,0.42)";
      ctx.fillRect(x, y, 2, 30);
    }
  }

  var n;
  for (n = 0; n < 800; n++) {
    var px = Math.random() * cw;
    var py = Math.random() * ch;
    var a = 0.04 + Math.random() * 0.08;
    ctx.fillStyle = n % 5 ? "rgba(116,108,94," + a + ")" : "rgba(35,25,18," + a + ")";
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
  lampsOnLeft
) {
  var z = zFrom;
  var dir = zTo > zFrom ? 1 : -1;
  if (dir < 0) step = -Math.abs(step);
  else step = Math.abs(step);

  while (dir > 0 ? z <= zTo : z >= zTo) {
    // 仅用 emissive 灯体模拟发光，避免每盏 PointLight 拖垮移动端
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), lampMat);
    var lampX = lampsOnLeft ? -halfW + 0.12 : halfW - 0.12;
    lamp.position.set(lampX, 1.65 + (Math.abs(z) % 3) * 0.08, z);
    group.add(lamp);

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

function addBox(group, material, sx, sy, sz, x, y, z, rotY) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY || 0;
  group.add(mesh);
  return mesh;
}

function addObstacle(group, colliders, material, sx, sy, sz, x, z, kind) {
  var mesh = addBox(group, material, sx, sy, sz, x, sy * 0.5 + 0.14, z, 0);
  colliders.push({
    kind: kind || "obstacle",
    minX: x - sx * 0.5,
    maxX: x + sx * 0.5,
    minZ: z - sz * 0.5,
    maxZ: z + sz * 0.5,
  });
  return mesh;
}

function addPickRoot(group, interactRoots, x, y, z, sx, sy, sz, data) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = data;
  group.add(pick);
  interactRoots.push(pick);
  return pick;
}

function addMachine(group, colliders, mats, x, z, alongX, size) {
  var sx = alongX ? size : 0.72;
  var sz = alongX ? 0.72 : size;
  var body = addObstacle(group, colliders, mats.machine, sx, 2.5, sz, x, z, "machine");
  body.name = "Level2FailedMachine";
  var axis = alongX ? "x" : "z";
  for (var i = -1; i <= 1; i++) {
    var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 12), mats.rust);
    wheel.rotation[axis] = Math.PI * 0.5;
    wheel.position.set(
      x + (alongX ? i * size * 0.27 : -0.4),
      1.1 + (i + 1) * 0.38,
      z + (alongX ? -0.4 : i * size * 0.27)
    );
    group.add(wheel);
  }
  addBox(
    group,
    mats.warning,
    alongX ? size * 0.55 : 0.07,
    0.11,
    alongX ? 0.07 : size * 0.55,
    x + (alongX ? 0 : -0.39),
    2.5,
    z + (alongX ? -0.39 : 0),
    0
  );
}

function addCableReel(group, colliders, mats, x, z, alongX) {
  var reel = new THREE.Group();
  reel.position.set(x, 0.63, z);
  var axle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14), mats.cable);
  axle.rotation.z = alongX ? Math.PI * 0.5 : 0;
  axle.rotation.x = alongX ? 0 : Math.PI * 0.5;
  reel.add(axle);
  for (var side = -1; side <= 1; side += 2) {
    var flange = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.08, 14), mats.rust);
    flange.rotation.z = alongX ? Math.PI * 0.5 : 0;
    flange.rotation.x = alongX ? 0 : Math.PI * 0.5;
    if (alongX) flange.position.x = side * 0.39;
    else flange.position.z = side * 0.39;
    reel.add(flange);
  }
  group.add(reel);
  colliders.push({
    kind: "cable_reel",
    minX: x - (alongX ? 0.48 : 0.62),
    maxX: x + (alongX ? 0.48 : 0.62),
    minZ: z - (alongX ? 0.62 : 0.48),
    maxZ: z + (alongX ? 0.62 : 0.48),
  });
}

function addWoodStack(group, colliders, mats, x, z, alongX) {
  var sx = alongX ? 1.7 : 0.65;
  var sz = alongX ? 0.65 : 1.7;
  for (var i = 0; i < 5; i++) {
    addBox(group, mats.wood, sx, 0.12, sz, x, 0.25 + i * 0.13, z, 0);
  }
  colliders.push({
    kind: "wood_stack",
    minX: x - sx * 0.5,
    maxX: x + sx * 0.5,
    minZ: z - sz * 0.5,
    maxZ: z + sz * 0.5,
  });
}

function addFoldingLadder(group, colliders, mats, x, z, alongX) {
  var ladder = new THREE.Group();
  ladder.position.set(x, 0.14, z);
  ladder.rotation.y = alongX ? 0 : Math.PI * 0.5;
  for (var side = -1; side <= 1; side += 2) {
    var rail = addBox(ladder, mats.rust, 0.08, 1.8, 0.08, side * 0.31, 0.9, 0, 0);
    rail.rotation.z = side * 0.17;
  }
  for (var r = 0; r < 5; r++) {
    addBox(ladder, mats.rust, 0.58, 0.05, 0.07, 0, 0.32 + r * 0.31, 0, 0);
  }
  group.add(ladder);
  colliders.push({
    kind: "folding_ladder",
    minX: x - (alongX ? 0.45 : 0.25),
    maxX: x + (alongX ? 0.45 : 0.25),
    minZ: z - (alongX ? 0.25 : 0.45),
    maxZ: z + (alongX ? 0.25 : 0.45),
  });
}

function addSideRoomFacade(group, colliders, mats, spec, interactRoots) {
  var alongX = spec.arm === "px" || spec.arm === "nx";
  var x = alongX ? spec.pos : CORRIDOR_WIDTH * 0.5 - 0.025;
  var z = alongX ? CORRIDOR_WIDTH * 0.5 - 0.025 : spec.pos;
  var facade = new THREE.Group();
  facade.position.set(x, 0, z);
  facade.rotation.y = alongX ? 0 : Math.PI * 0.5;
  facade.name = "Level2SideRoom_" + spec.id;
  var frameMat = spec.id === "void" ? mats.warning : mats.rust;
  addBox(facade, frameMat, 0.11, 2.5, 0.16, -0.62, 1.25, 0, 0);
  addBox(facade, frameMat, 0.11, 2.5, 0.16, 0.62, 1.25, 0, 0);
  addBox(facade, frameMat, 1.35, 0.12, 0.16, 0, 2.46, 0, 0);
  var portal = addBox(facade, spec.id === "void" ? mats.void : spec.material, 1.12, 2.24, 0.05, 0, 1.18, 0.03, 0);
  portal.userData.brInteract = spec.data || null;
  if (spec.id === "office") {
    for (var i = 0; i < 3; i++) {
      addBox(facade, mats.office, 0.78 - i * 0.13, 0.05, 0.04, 0, 0.65 + i * 0.48, -0.01, 0);
    }
  } else if (spec.id === "storage") {
    for (var c = 0; c < 3; c++) {
      addBox(facade, mats.wood, 0.3, 0.27, 0.08, (c - 1) * 0.34, 0.34 + (c % 2) * 0.3, -0.01, 0);
    }
  }
  group.add(facade);
  if (spec.data) interactRoots.push(portal);
  if (spec.id === "void") {
    colliders.push({
      kind: "sealed_void_door",
      minX: x - (alongX ? 0.75 : 0.24),
      maxX: x + (alongX ? 0.75 : 0.24),
      minZ: z - (alongX ? 0.24 : 0.75),
      maxZ: z + (alongX ? 0.24 : 0.75),
    });
  }
}

function addAbandonedTrack(group, colliders, mats) {
  var railX = [0.7, 1.08];
  for (var r = 0; r < railX.length; r++) {
    addBox(group, mats.rail, 0.08, 0.08, 24, railX[r], 0.22, 36, 0);
    colliders.push({
      kind: "rail",
      minX: railX[r] - 0.045,
      maxX: railX[r] + 0.045,
      minZ: 24,
      maxZ: 48,
    });
  }
  for (var z = 24; z <= 48; z += 0.75) {
    addBox(group, mats.wood, 0.72, 0.06, 0.14, 0.89, 0.19, z, 0);
  }
  colliders.push({
    kind: "track_sleepers",
    minX: 0.5,
    maxX: 1.28,
    minZ: 23.9,
    maxZ: 48.1,
  });
  var sign = addBox(group, mats.warning, 0.58, 0.32, 0.05, 1.34, 1.62, 31, Math.PI * 0.5);
  sign.name = "BNTGAbandonedRailMarker";
}

function addMechanicalFolkRuins(group, colliders, mats) {
  var x = 0.95;
  var z = -34;
  addObstacle(group, colliders, mats.rust, 0.72, 0.7, 1.35, x, z, "mechanical_folk_ruin");
  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.36, 0.82, 7), mats.machine);
  torso.position.set(x, 1.13, z);
  torso.rotation.z = 0.25;
  group.add(torso);
  for (var i = 0; i < 4; i++) {
    var limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 6), mats.rust);
    limb.position.set(x + (i % 2 ? 0.36 : -0.32), 0.74 + (i > 1 ? 0.48 : 0), z + (i - 1.5) * 0.22);
    limb.rotation.z = i % 2 ? -0.65 : 0.65;
    group.add(limb);
  }
}

function playerPosition(player) {
  if (!player) return { x: 9999, z: 9999 };
  if (player.position) return { x: Number(player.position.x) || 0, z: Number(player.position.z) || 0 };
  return { x: Number(player.x) || 0, z: Number(player.z) || 0 };
}

function resolveInteraction(data) {
  if (!data) return null;
  if (data.kind) return data;
  if (data.brInteract) return data.brInteract;
  if (data.userData && data.userData.brInteract) return data.userData.brInteract;
  if (data.object) return resolveInteraction(data.object);
  return null;
}

export function buildBackroomsLevel2World(root) {
  var group = new THREE.Group();
  group.name = "Level2AbandonedUtilityBelt";

  var len = CORRIDOR_LENGTH;
  var halfLen = len * 0.5;
  var halfW = CORRIDOR_WIDTH * 0.5;
  var armSeg = halfLen - halfW;
  var colliders = [];
  var interactRoots = [];
  var disposed = false;

  var wallMap = createLevel2WallTexture();
  var floorMap = createLevel2FloorTexture();

  var wallMat = new THREE.MeshStandardMaterial({
    color: 0x756d60,
    emissive: 0x151310,
    emissiveIntensity: 0.2,
    roughness: 1,
    metalness: 0.01,
    map: wallMap || undefined,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x34322f,
    emissive: 0x090909,
    emissiveIntensity: 0.12,
    roughness: 0.98,
    metalness: 0.02,
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
    emissive: 0x0c0b0d,
    emissiveIntensity: 0.12,
    roughness: 0.68,
    metalness: 0.48,
  });
  var mats = {
    machine: new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.78, metalness: 0.5 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x664333, roughness: 0.9, metalness: 0.42 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x151315, roughness: 0.88, metalness: 0.08 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x654a32, roughness: 0.96 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x585352, roughness: 0.55, metalness: 0.72 }),
    warning: new THREE.MeshStandardMaterial({
      color: 0x8d7430,
      emissive: 0x251400,
      emissiveIntensity: 0.35,
      roughness: 0.78,
    }),
    void: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    darkRoom: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1 }),
    office: new THREE.MeshStandardMaterial({
      color: 0xc9c0a8,
      emissive: 0x3b3426,
      emissiveIntensity: 0.3,
      roughness: 0.9,
    }),
    storage: new THREE.MeshStandardMaterial({ color: 0x30291f, roughness: 0.95 }),
  };

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

  var armIds = ["pz", "nz", "px", "nx"];
  var lampMaterials = {};
  for (var lm = 0; lm < armIds.length; lm++) {
    lampMaterials[armIds[lm]] = new THREE.MeshStandardMaterial({
      color: lm % 3 === 0 ? 0xbba5ff : 0xe4decf,
      emissive: lm % 3 === 0 ? 0x7244ff : 0xc8bca0,
      emissiveIntensity: lm % 3 === 0 ? 2.2 : 1.25,
      roughness: 0.4,
      metalness: 0,
    });
  }
  var lampMat = lampMaterials.pz;
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
    lampMaterials.pz,
    pipeMat,
    pipeSpecs,
    true
  );
  decorateZArm(
    group,
    colliders,
    halfW,
    -hubEdge,
    -halfLen + 3,
    -lampStep,
    lampMaterials.nz,
    pipeMat,
    pipeSpecs,
    true
  );
  decorateXArm(
    group,
    colliders,
    halfW,
    halfLen - 3,
    hubEdge,
    -lampStep,
    lampMaterials.px,
    pipeMat,
    pipeSpecs,
    true
  );
  decorateXArm(
    group,
    colliders,
    halfW,
    -hubEdge,
    -halfLen + 3,
    -lampStep,
    lampMaterials.nx,
    pipeMat,
    pipeSpecs,
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
  for (var di = 0; di < doorPack.interactRoots.length; di++) {
    interactRoots.push(doorPack.interactRoots[di]);
  }

  // 设备全部收在正侧设备带，负侧随机出口和中间连续通行带保持净空。
  addMachine(group, colliders, mats, 0.98, 15, false, 3.1);
  addMachine(group, colliders, mats, 0.98, -17, false, 2.7);
  addMachine(group, colliders, mats, 18, 0.98, true, 3.4);
  addMachine(group, colliders, mats, -22, 0.98, true, 2.8);
  addCableReel(group, colliders, mats, 0.88, 8.5, false);
  addCableReel(group, colliders, mats, -10.5, 0.88, true);
  addWoodStack(group, colliders, mats, 0.96, -9.5, false);
  addWoodStack(group, colliders, mats, 10.5, 0.96, true);
  addFoldingLadder(group, colliders, mats, 1.12, 54, false);
  addFoldingLadder(group, colliders, mats, 44, 1.12, true);
  addObstacle(group, colliders, mats.rust, 0.7, 0.34, 1.15, 1.03, -47, "dismantled_parts");
  addObstacle(group, colliders, mats.machine, 1.3, 0.38, 0.65, -45, 1.03, "power_tools");

  addAbandonedTrack(group, colliders, mats);
  addMechanicalFolkRuins(group, colliders, mats);

  addSideRoomFacade(group, colliders, mats, {
    id: "empty",
    arm: "pz",
    pos: 58,
    material: mats.darkRoom,
  }, interactRoots);
  addSideRoomFacade(group, colliders, mats, {
    id: "office",
    arm: "nz",
    pos: -56,
    material: mats.office,
  }, interactRoots);
  addSideRoomFacade(group, colliders, mats, {
    id: "storage",
    arm: "px",
    pos: 54,
    material: mats.storage,
  }, interactRoots);
  addSideRoomFacade(group, colliders, mats, {
    id: "void",
    arm: "nx",
    pos: -57,
    material: mats.void,
    data: {
      kind: "l2_void_warning",
      id: "sealed-void",
      text: "门窗后没有反光、回声或边界。焊死的挡条阻止你踏入虚空。",
    },
  }, interactRoots);

  var toolbox = addObstacle(group, colliders, mats.warning, 0.66, 0.42, 0.42, 0.98, 4.9, "toolbox");
  toolbox.name = "Level2SupplyToolbox";
  addPickRoot(group, interactRoots, 0.98, 0.63, 4.9, 0.85, 0.8, 0.72, {
    kind: "l2_toolbox",
    id: "utility-toolbox",
    itemId: "industrial_supplies",
    amount: 1,
  });
  var record = addBox(group, mats.office, 0.43, 0.03, 0.3, -0.82, 0.34, -28, 0.12);
  record.name = "Level2AbandonedRecord";
  addPickRoot(group, interactRoots, -0.82, 0.48, -28, 0.72, 0.55, 0.72, {
    kind: "l2_record",
    id: "bntg-blackout-log",
    text: "B.N.T.G. 维护记录：第三组蓄电池接入后全线短路。轨道停运，紫色应急灯在数日后自行亮起；不要打开能看见纯黑的门。",
  });

  // 蒸汽泄漏点及阀门，雾团仅作提示；危险由 update 统一计算。
  var steamLeaks = [
    { x: -0.78, z: 39, phase: 0.2, active: false, cloud: null },
    { x: 36, z: -0.78, phase: 2.1, active: false, cloud: null },
    { x: 0.78, z: -42, phase: 4.3, active: false, cloud: null },
  ];
  var steamMat = new THREE.MeshBasicMaterial({
    color: 0xb8c1c9,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (var si = 0; si < steamLeaks.length; si++) {
    var cloud = new THREE.Mesh(new THREE.SphereGeometry(0.78, 10, 8), steamMat.clone());
    cloud.position.set(steamLeaks[si].x, 1.05, steamLeaks[si].z);
    cloud.scale.set(0.45, 0.7, 0.45);
    group.add(cloud);
    steamLeaks[si].cloud = cloud;
  }

  // 不等距横梁与设备密度塑造宽窄不同、但始终保持直角和直线的欧几里得隧道。
  for (var rib = -60; rib <= 60; rib += 12) {
    if (Math.abs(rib) < 4) continue;
    addBox(group, mats.rust, CORRIDOR_WIDTH, 0.12, 0.16, 0, 2.82 + (Math.abs(rib) % 24 ? 0.18 : 0), rib, 0);
    addBox(group, mats.rust, 0.16, 0.12, CORRIDOR_WIDTH, rib, 3.02 - (Math.abs(rib) % 24 ? 0.18 : 0), 0, 0);
  }
  var brokenLampPositions = [
    [-1.31, 1.72, 21],
    [-1.31, 1.58, -13],
    [29, 1.68, -1.31],
    [-51, 1.54, -1.31],
  ];
  for (var bl = 0; bl < brokenLampPositions.length; bl++) {
    var deadLamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), mats.machine);
    deadLamp.position.set(
      brokenLampPositions[bl][0],
      brokenLampPositions[bl][1],
      brokenLampPositions[bl][2]
    );
    deadLamp.scale.y = 0.55;
    deadLamp.name = "Level2BrokenLamp";
    group.add(deadLamp);
  }

  root.add(group);

  var ambient = new THREE.AmbientLight(0x26232d, 0.56);
  root.add(ambient);

  var fill = new THREE.HemisphereLight(0x44385d, 0x09080a, 0.32);
  root.add(fill);

  var pointLights = [];
  var lightPositions = [
    [0, 2.55, 27],
    [0, 2.55, -31],
    [33, 2.55, 0],
    [-37, 2.55, 0],
  ];
  for (var pl = 0; pl < lightPositions.length; pl++) {
    var emergency = new THREE.PointLight(0x7650ff, 0.55, 13, 2);
    emergency.position.set(lightPositions[pl][0], lightPositions[pl][1], lightPositions[pl][2]);
    group.add(emergency);
    pointLights.push(emergency);
  }

  var elapsed = 0;
  var blackoutArm = armIds[Math.floor(Math.random() * armIds.length)];
  var blackout = false;
  var powerTimer = 9 + Math.random() * 8;
  var damageTimer = 0;
  var toolboxTaken = false;
  var recordsRead = Object.create(null);
  var environment = {
    blackout: false,
    blackoutArm: null,
    steamDanger: false,
    sanityDrainPerSec: 0,
    movementMultiplier: 1,
  };

  function armForPosition(pos) {
    if (Math.abs(pos.z) >= Math.abs(pos.x)) return pos.z >= 0 ? "pz" : "nz";
    return pos.x >= 0 ? "px" : "nx";
  }

  function setBlackout(next, playerArm) {
    blackout = next;
    if (blackout) {
      var candidates = armIds.filter(function (id) { return id !== playerArm; });
      blackoutArm = candidates[Math.floor(Math.random() * candidates.length)] || "nz";
    }
    for (var i = 0; i < armIds.length; i++) {
      var id = armIds[i];
      lampMaterials[id].emissiveIntensity = blackout && id === blackoutArm ? 0.015 : (i % 3 === 0 ? 2.2 : 1.25);
      pointLights[i].intensity = blackout && id === blackoutArm ? 0.02 : 0.55;
    }
  }

  function getInteractionHint(data) {
    var info = resolveInteraction(data);
    if (!info) return "";
    if (info.kind === "l2_toolbox") {
      return toolboxTaken ? "空工具箱 · 已搜刮" : "废弃工具箱 · 按 Q 搜寻补给";
    }
    if (info.kind === "l2_record") {
      return recordsRead[info.id] ? "B.N.T.G. 废弃记录 · 已读" : "B.N.T.G. 废弃记录 · 按 Q 阅读";
    }
    if (info.kind === "l2_void_warning") return "危险虚空门 · 按 Q 检查警告";
    return "";
  }

  function interact(data, callbacks) {
    if (disposed) return false;
    var info = resolveInteraction(data);
    if (!info) return false;
    callbacks = callbacks || {};
    if (info.kind === "l2_toolbox") {
      if (toolboxTaken) {
        if (typeof callbacks.showToast === "function") callbacks.showToast("工具箱里已经没有可用物资。", 1800);
        return true;
      }
      var granted = true;
      if (typeof callbacks.grantItem === "function") {
        granted = callbacks.grantItem(info.itemId, info.amount || 1, info) !== false;
      }
      if (!granted) {
        if (typeof callbacks.showToast === "function") callbacks.showToast("背包已满，补给仍留在工具箱内。", 2200);
        return true;
      }
      toolboxTaken = true;
      toolbox.material = mats.rust;
      if (typeof callbacks.showToast === "function") callbacks.showToast("取得工业补给：密封胶、旧滤芯与一支扳手。", 2600);
      return true;
    }
    if (info.kind === "l2_record") {
      recordsRead[info.id] = true;
      if (typeof callbacks.showToast === "function") callbacks.showToast(info.text, 5600);
      return true;
    }
    if (info.kind === "l2_void_warning") {
      if (typeof callbacks.showToast === "function") callbacks.showToast(info.text, 4800);
      return true;
    }
    return false;
  }

  function update(dt, player, callbacks) {
    if (disposed) return getEnvironmentState();
    callbacks = callbacks || {};
    dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    elapsed += dt;
    powerTimer -= dt;
    var pos = playerPosition(player);
    var playerArm = armForPosition(pos);
    if (powerTimer <= 0) {
      setBlackout(!blackout, playerArm);
      powerTimer = blackout ? 7 + Math.random() * 7 : 15 + Math.random() * 14;
      if (typeof callbacks.showToast === "function") {
        callbacks.showToast(
          blackout ? "远处一片隧道骤然断电，紫色应急灯接管照明。" : "断联的供电线路咔哒作响，部分灯具恢复。",
          2600
        );
      }
    }

    var inSteam = false;
    for (var i = 0; i < steamLeaks.length; i++) {
      var leak = steamLeaks[i];
      var pulse = (elapsed + leak.phase) % 9;
      leak.active = pulse < 4.2;
      var strength = leak.active ? Math.sin((pulse / 4.2) * Math.PI) : 0;
      leak.cloud.visible = leak.active;
      leak.cloud.material.opacity = 0.05 + strength * 0.22;
      leak.cloud.scale.setScalar(0.5 + strength * 0.85);
      leak.cloud.scale.y *= 0.8;
      if (leak.active && Math.hypot(pos.x - leak.x, pos.z - leak.z) < 2.15) inSteam = true;
    }

    environment.blackout = blackout && playerArm === blackoutArm;
    environment.blackoutArm = blackout ? blackoutArm : null;
    environment.steamDanger = inSteam;
    environment.sanityDrainPerSec = (environment.blackout ? 0.14 : 0.035) + (inSteam ? 0.08 : 0);
    environment.movementMultiplier = inSteam ? 0.82 : 1;
    steamHaze.material.opacity = environment.blackout ? 0.095 : 0.045;

    damageTimer = inSteam ? damageTimer + dt : 0;
    if (inSteam && damageTimer >= 1) {
      damageTimer -= 1;
      if (typeof callbacks.onDamage === "function") {
        callbacks.onDamage(4, { source: "level2_steam_leak", type: "steam", x: pos.x, z: pos.z });
      }
    }
    return getEnvironmentState();
  }

  function getEnvironmentState() {
    return {
      blackout: environment.blackout,
      blackoutArm: environment.blackoutArm,
      steamDanger: environment.steamDanger,
      sanityDrainPerSec: environment.sanityDrainPerSec,
      movementMultiplier: environment.movementMultiplier,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    var geometries = new Set();
    var materials = new Set();
    var textures = new Set();
    group.traverse(function (object) {
      if (object.geometry) geometries.add(object.geometry);
      var objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (var i = 0; i < objectMaterials.length; i++) {
        var material = objectMaterials[i];
        if (!material) continue;
        materials.add(material);
        if (material.map) textures.add(material.map);
        if (material.alphaMap) textures.add(material.alphaMap);
      }
    });
    textures.forEach(function (texture) { texture.dispose(); });
    materials.forEach(function (material) { material.dispose(); });
    geometries.forEach(function (geometry) { geometry.dispose(); });
    if (group.parent) group.parent.remove(group);
    if (ambient.parent) ambient.parent.remove(ambient);
    if (fill.parent) fill.parent.remove(fill);
    colliders.length = 0;
    interactRoots.length = 0;
    group.clear();
  }

  return {
    colliders: colliders,
    spawnX: 0,
    spawnZ: SPAWN_Z,
    lighting: {
      ambient: ambient,
      fill: fill,
      pointLights: [],
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
    interactRoots: interactRoots,
    getInteractionHint: getInteractionHint,
    interact: interact,
    update: update,
    getEnvironmentState: getEnvironmentState,
    dispose: dispose,
  };
}

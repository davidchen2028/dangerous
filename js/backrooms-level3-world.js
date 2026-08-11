/**
 * Level 3 — 砖墙迷宫、管线与电缆（程序化生成）
 */
import * as THREE from "three";
import { pushOutCircleAABB } from "./backrooms-collide.js";

export const CELL = 2.65;
export const WALL_H = 3.4;
export const MAZE_W = 36;
export const MAZE_H = 36;

const PIPE = 0x2a2a32;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  var i = arr.length;
  while (i > 1) {
    i -= 1;
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function generateLevel3Maze(seed) {
  var w = MAZE_W;
  var h = MAZE_H;
  var rng = mulberry32(seed | 0);
  var grid = [];
  var z;
  var x;
  for (z = 0; z < h; z++) {
    grid[z] = [];
    for (x = 0; x < w; x++) grid[z][x] = 1;
  }

  function carve(cx, cz) {
    grid[cz][cx] = 0;
    var dirs = shuffle(
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
      rng
    );
    var i;
    for (i = 0; i < dirs.length; i++) {
      var dx = dirs[i][0];
      var dz = dirs[i][1];
      var nx = cx + dx * 2;
      var nz = cz + dz * 2;
      if (nx > 0 && nx < w - 1 && nz > 0 && nz < h - 1 && grid[nz][nx] === 1) {
        grid[cz + dz][cx + dx] = 0;
        carve(nx, nz);
      }
    }
  }
  carve(1, 1);

  var knock = Math.floor(w * h * 0.028);
  var k;
  for (k = 0; k < knock; k++) {
    x = 2 + Math.floor(rng() * (w - 4));
    z = 2 + Math.floor(rng() * (h - 4));
    if (grid[z][x] === 1) grid[z][x] = 0;
  }

  function carveRoom(rx, rz, rw, rh) {
    var ix;
    var iz;
    for (iz = rz; iz < rz + rh && iz < h - 1; iz++) {
      for (ix = rx; ix < rx + rw && ix < w - 1; ix++) {
        grid[iz][ix] = 0;
      }
    }
  }
  carveRoom(8, 6, 5, 4);
  carveRoom(w - 14, h - 12, 6, 5);
  carveRoom(Math.floor(w * 0.45), Math.floor(h * 0.38), 4, 4);
  carveRoom(6, h - 18, 5, 5);

  var mid = Math.floor(w * 0.5) - 2;
  carveRoom(mid, mid, 4, 4);

  return { grid: grid, seed: seed, spawnCell: { x: 1, z: 1 } };
}

function createLevel2StyleWallTexture() {
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
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.anisotropy = 4;
  return tex;
}

function createLevel2StyleFloorTexture() {
  var size = 128;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#16161c";
  ctx.fillRect(0, 0, size, size);
  var i;
  for (i = 0; i < 500; i++) {
    ctx.fillStyle = "rgba(255,255,255," + (0.01 + Math.random() * 0.03) + ")";
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function cellToWorld(cx, cz) {
  return {
    x: (cx - MAZE_W * 0.5) * CELL,
    z: (cz - MAZE_H * 0.5) * CELL,
  };
}

export function getLevel3SpawnWorld(mazeData) {
  var c = mazeData.spawnCell;
  return cellToWorld(c.x, c.z);
}

function cellAabb(cx, cz) {
  var wpos = cellToWorld(cx, cz);
  var h = CELL * 0.5;
  return {
    kind: "wall",
    minX: wpos.x - h,
    maxX: wpos.x + h,
    minZ: wpos.z - h,
    maxZ: wpos.z + h,
  };
}

export function resolveCircleAgainstLevel3Maze(px, pz, radius, grid) {
  var cx0 = Math.floor((px - radius) / CELL + MAZE_W * 0.5);
  var cx1 = Math.floor((px + radius) / CELL + MAZE_W * 0.5);
  var cz0 = Math.floor((pz - radius) / CELL + MAZE_H * 0.5);
  var cz1 = Math.floor((pz + radius) / CELL + MAZE_H * 0.5);
  var iter;
  var cx;
  var cz;
  for (iter = 0; iter < 6; iter++) {
    var moved = false;
    for (cz = cz0; cz <= cz1; cz++) {
      for (cx = cx0; cx <= cx1; cx++) {
        if (cz < 0 || cx < 0 || cz >= MAZE_H || cx >= MAZE_W) continue;
        if (grid[cz][cx] !== 1) continue;
        var out = pushOutCircleAABB(px, pz, radius, cellAabb(cx, cz));
        if (out.x !== px || out.z !== pz) {
          px = out.x;
          pz = out.z;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

var PIPE_SPECS = [
  { r: 0.18, y: 0.95, xOff: 0.02 },
  { r: 0.12, y: 1.52, xOff: 0.02 },
  { r: 0.2, y: 2.08, xOff: 0.02 },
];

const PIPE_WALL_INSET = 0.06;

function pickPrimaryWallSide(grid, x, z) {
  if (x + 1 < MAZE_W && grid[z][x + 1] === 1) return "e";
  if (x - 1 >= 0 && grid[z][x - 1] === 1) return "w";
  if (z + 1 < MAZE_H && grid[z + 1][x] === 1) return "n";
  if (z - 1 >= 0 && grid[z - 1][x] === 1) return "s";
  return null;
}

function wallSides(grid, x, z) {
  var sides = [];
  if (x + 1 < MAZE_W && grid[z][x + 1] === 1) sides.push("e");
  if (x - 1 >= 0 && grid[z][x - 1] === 1) sides.push("w");
  if (z + 1 < MAZE_H && grid[z + 1][x] === 1) sides.push("n");
  if (z - 1 >= 0 && grid[z - 1][x] === 1) sides.push("s");
  return sides;
}

function pushPipeCollider(colliders, side, wpos, spec, pipeLen) {
  var pad = 0.05;
  var half = CELL * 0.5;
  var halfLen = pipeLen * 0.5;
  if (side === "e") {
    var cx = wpos.x + half - spec.r - PIPE_WALL_INSET;
    colliders.push({
      kind: "wall",
      minX: cx - spec.r - pad,
      maxX: cx + spec.r + pad,
      minZ: wpos.z - halfLen,
      maxZ: wpos.z + halfLen,
    });
  } else if (side === "w") {
    cx = wpos.x - half + spec.r + PIPE_WALL_INSET;
    colliders.push({
      kind: "wall",
      minX: cx - spec.r - pad,
      maxX: cx + spec.r + pad,
      minZ: wpos.z - halfLen,
      maxZ: wpos.z + halfLen,
    });
  } else if (side === "n") {
    var cz = wpos.z + half - spec.r - PIPE_WALL_INSET;
    colliders.push({
      kind: "wall",
      minX: wpos.x - halfLen,
      maxX: wpos.x + halfLen,
      minZ: cz - spec.r - pad,
      maxZ: cz + spec.r + pad,
    });
  } else {
    cz = wpos.z - half + spec.r + PIPE_WALL_INSET;
    colliders.push({
      kind: "wall",
      minX: wpos.x - halfLen,
      maxX: wpos.x + halfLen,
      minZ: cz - spec.r - pad,
      maxZ: cz + spec.r + pad,
    });
  }
}

function addWallMountedPipes(group, colliders, grid, x, z, wpos, rng, pipeMat, pipeHazardSlots, pipeSide) {
  if (!pipeSide) return;
  var half = CELL * 0.5;
  var pipeLen = CELL * 0.86;
  var pi;
  var bracketMat = pipeMat;

  for (pi = 0; pi < PIPE_SPECS.length; pi++) {
    var spec = PIPE_SPECS[pi];
    var pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.r, spec.r, pipeLen, 8, 1, false),
      pipeMat
    );
    var hx = wpos.x;
    var hz = wpos.z;
    if (pipeSide === "e") {
      pipe.rotation.x = Math.PI * 0.5;
      hx = wpos.x + half - spec.r - PIPE_WALL_INSET;
    } else if (pipeSide === "w") {
      pipe.rotation.x = Math.PI * 0.5;
      hx = wpos.x - half + spec.r + PIPE_WALL_INSET;
    } else if (pipeSide === "n") {
      pipe.rotation.z = Math.PI * 0.5;
      hz = wpos.z + half - spec.r - PIPE_WALL_INSET;
    } else {
      pipe.rotation.z = Math.PI * 0.5;
      hz = wpos.z - half + spec.r + PIPE_WALL_INSET;
    }
    pipe.position.set(hx, spec.y, hz);
    group.add(pipe);
    pushPipeCollider(colliders, pipeSide, wpos, spec, pipeLen);

    var bracket = new THREE.Mesh(
      new THREE.BoxGeometry(spec.r * 2.4, 0.08, spec.r * 2.4),
      bracketMat
    );
    bracket.position.set(hx, spec.y, hz);
    group.add(bracket);
  }

  if (rng() < 0.38) {
    var mid = PIPE_SPECS[1];
    var inset = 0.62;
    var sx = wpos.x;
    var sz = wpos.z;
    if (pipeSide === "e") sx = wpos.x + half - inset;
    else if (pipeSide === "w") sx = wpos.x - half + inset;
    else if (pipeSide === "n") sz = wpos.z + half - inset;
    else sz = wpos.z - half + inset;
    pipeHazardSlots.push({
      x: sx,
      z: sz,
      y: mid.y - 0.05,
      side: pipeSide,
    });
  }
}

var _wallLampGeo = null;

function wallLampGeo() {
  if (!_wallLampGeo) _wallLampGeo = new THREE.SphereGeometry(0.07, 8, 8);
  return _wallLampGeo;
}

function addWallLamp(group, grid, x, z, wpos, rng, lampMat, flickerLights, avoidSide) {
  // 装饰灯仅保留 emissive mesh；闪烁改材质，不再挂 PointLight
  if (flickerLights.length >= 48) return;
  if (rng() > 0.065) return;
  var sides = wallSides(grid, x, z);
  if (avoidSide) {
    sides = sides.filter(function (s) {
      return s !== avoidSide;
    });
  }
  if (!sides.length) return;
  var side = sides[Math.floor(rng() * sides.length)];
  var half = CELL * 0.5;
  var lx = wpos.x;
  var lz = wpos.z;
  if (side === "e") lx = wpos.x + half - 0.14;
  else if (side === "w") lx = wpos.x - half + 0.14;
  else if (side === "n") lz = wpos.z + half - 0.14;
  else lz = wpos.z - half + 0.14;
  var mat = lampMat.clone();
  var lamp = new THREE.Mesh(wallLampGeo(), mat);
  lamp.position.set(lx, 1.62, lz);
  group.add(lamp);
  flickerLights.push({
    mat: mat,
    base: 1.2,
    phase: rng() * Math.PI * 2,
    speed: 5 + rng() * 4,
  });
}

/**
 * @returns {{ group, flickerLights, pipeHazardSlots, materials, decorPointLights }}
 */
export function buildLevel3World(mazeData) {
  var grid = mazeData.grid;
  var group = new THREE.Group();
  group.name = "Level3PowerMaze";
  var flickerLights = [];
  var pipeHazardSlots = [];
  var rng = mulberry32((mazeData.seed + 991) | 0);

  var wallMap = createLevel2StyleWallTexture();
  var floorMap = createLevel2StyleFloorTexture();
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
  var pipeMat = new THREE.MeshStandardMaterial({
    color: PIPE,
    emissive: 0x141418,
    emissiveIntensity: 0.15,
    roughness: 0.75,
    metalness: 0.35,
  });
  var cableMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    emissive: 0x050508,
    roughness: 0.85,
    metalness: 0.2,
  });
  var lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d0,
    emissive: 0xffcc66,
    emissiveIntensity: 1.55,
    roughness: 0.4,
    metalness: 0,
  });

  var wallColliders = [];
  var wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
  var floorGeo = new THREE.BoxGeometry(CELL, 0.11, CELL);
  var wallCount = 0;
  var floorCount = 0;
  var z;
  var x;
  for (z = 0; z < MAZE_H; z++) {
    for (x = 0; x < MAZE_W; x++) {
      if (grid[z][x] === 1) wallCount++;
      else floorCount++;
    }
  }

  var wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  var floorMesh = new THREE.InstancedMesh(floorGeo, floorMat, floorCount);
  var mat4 = new THREE.Matrix4();
  var pos = new THREE.Vector3();
  var wi = 0;
  var fi = 0;
  for (z = 0; z < MAZE_H; z++) {
    for (x = 0; x < MAZE_W; x++) {
      var wpos = cellToWorld(x, z);
      if (grid[z][x] === 1) {
        pos.set(wpos.x, WALL_H * 0.5, wpos.z);
        mat4.makeTranslation(pos.x, pos.y, pos.z);
        wallMesh.setMatrixAt(wi++, mat4);
        wallColliders.push(cellAabb(x, z));
      } else {
        pos.set(wpos.x, 0.055, wpos.z);
        mat4.makeTranslation(pos.x, pos.y, pos.z);
        floorMesh.setMatrixAt(fi++, mat4);

        var pipeSide = pickPrimaryWallSide(grid, x, z);
        if (pipeSide && rng() < 0.22) {
          addWallMountedPipes(
            group,
            wallColliders,
            grid,
            x,
            z,
            wpos,
            rng,
            pipeMat,
            pipeHazardSlots,
            pipeSide
          );
        }
        addWallLamp(
          group,
          grid,
          x,
          z,
          wpos,
          rng,
          lampMat,
          flickerLights,
          pipeSide
        );

        if (rng() < 0.07) {
          var cable = new THREE.Mesh(
            new THREE.BoxGeometry(CELL * 0.82, 0.035, 0.05),
            cableMat
          );
          cable.position.set(wpos.x, WALL_H - 0.07, wpos.z);
          cable.rotation.y = rng() < 0.5 ? 0 : Math.PI * 0.5;
          group.add(cable);
        }
      }
    }
  }
  wallMesh.instanceMatrix.needsUpdate = true;
  floorMesh.instanceMatrix.needsUpdate = true;
  group.add(wallMesh);
  group.add(floorMesh);

  return {
    group: group,
    colliders: wallColliders,
    flickerLights: flickerLights,
    pipeHazardSlots: pipeHazardSlots,
    decorPointLights: [],
    materials: { wall: wallMat, floor: floorMat, pipe: pipeMat, lamp: lampMat },
  };
}

export function updateLevel3FlickerLights(lights, now, intensityScale) {
  if (!lights || !lights.length) return;
  var scale = intensityScale == null ? 1 : intensityScale;
  var t = now * 0.001;
  var i;
  var flickerGlitch = Math.random() < 0.002;
  for (i = 0; i < lights.length; i++) {
    var L = lights[i];
    var flick = L.base * (0.35 + 0.65 * Math.abs(Math.sin(t * L.speed + L.phase)));
    if (flickerGlitch) flick *= 0.15;
    if (L.mat) L.mat.emissiveIntensity = flick * scale;
    else if (L.light) L.light.intensity = flick * scale;
  }
}

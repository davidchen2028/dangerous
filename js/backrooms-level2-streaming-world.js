import * as THREE from "three";
import * as Layout from "./backrooms-level2-layout.js";
import { createPointLightPool } from "./backrooms-point-light-pool.js";
import { createStreamingLevel2Doors } from "./backrooms-level2-doors.js?v=4";
import { createObbCollider } from "./backrooms-collide.js";

const CHUNK_SIZE = Layout.LEVEL2_CHUNK_SIZE || Layout.L2_CHUNK_SIZE || 60;
const STREAM_RADIUS = Layout.LEVEL2_STREAM_RADIUS || Layout.L2_STREAM_RADIUS || 2;
const L2_SPAWN_X = Layout.LEVEL2_SPAWN_X != null
  ? Layout.LEVEL2_SPAWN_X
  : (Layout.L2_SPAWN_X != null ? Layout.L2_SPAWN_X : 0);
const L2_SPAWN_Z = Layout.LEVEL2_SPAWN_Z != null
  ? Layout.LEVEL2_SPAWN_Z
  : (Layout.L2_SPAWN_Z != null ? Layout.L2_SPAWN_Z : 0);
const WALL_THICK = 0.18;
const MIN_CLEAR_WIDTH = Layout.L2_MIN_CLEAR_WIDTH || 2.4;
const INTERACTION_KEY = "backrooms_l2_interactions_v2";
export const LEVEL2_LAYOUT_SEED_KEY = "backrooms_l2_layout_seed_v2";
var activeLayoutSeed = "0";

function hashText(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getChunkCoords(x, z) {
  if (typeof Layout.worldToLevel2Chunk === "function") {
    return Layout.worldToLevel2Chunk(x, z);
  }
  if (typeof Layout.worldToChunk === "function") {
    return Layout.worldToChunk(x, z);
  }
  return {
    cx: Math.floor((x + CHUNK_SIZE * 0.5) / CHUNK_SIZE),
    cz: Math.floor((z + CHUNK_SIZE * 0.5) / CHUNK_SIZE),
  };
}

function chunkKey(cx, cz) {
  return cx + "," + cz;
}

function getLayout(cx, cz) {
  return Layout.getLevel2ChunkLayout(activeLayoutSeed, cx, cz);
}

function getOrCreateLayoutSeed() {
  try {
    var stored = sessionStorage.getItem(LEVEL2_LAYOUT_SEED_KEY);
    if (stored) return stored;
    var seed = String((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    sessionStorage.setItem(LEVEL2_LAYOUT_SEED_KEY, seed);
    return seed;
  } catch (err) {
    return "level2-default";
  }
}

function spawnBounds() {
  if (typeof Layout.getLevel2SpawnZone !== "function") {
    return {
      minX: 0,
      maxX: CHUNK_SIZE,
      minZ: 0,
      maxZ: CHUNK_SIZE,
    };
  }
  var zone = Layout.getLevel2SpawnZone(activeLayoutSeed);
  return zone.rescueBounds || zone.bounds || zone;
}

function segmentEnds(segment) {
  var a = segment.a || segment.start || segment.from;
  var b = segment.b || segment.end || segment.to;
  if (a && b) return { a: a, b: b };
  return {
    a: { x: segment.x1, z: segment.z1 },
    b: { x: segment.x2, z: segment.z2 },
  };
}

function segmentInfo(segment) {
  var ends = segmentEnds(segment);
  var dx = ends.b.x - ends.a.x;
  var dz = ends.b.z - ends.a.z;
  var length = Math.hypot(dx, dz);
  var rotation = Math.atan2(dx, dz);
  return {
    a: ends.a,
    b: ends.b,
    x: (ends.a.x + ends.b.x) * 0.5,
    z: (ends.a.z + ends.b.z) * 0.5,
    dx: dx,
    dz: dz,
    length: length,
    rotation: rotation,
    tx: Math.sin(rotation),
    tz: Math.cos(rotation),
    nx: Math.cos(rotation),
    nz: -Math.sin(rotation),
    kind: segment.kind,
    feature: segment.feature,
    width: Math.max(MIN_CLEAR_WIDTH, Number(segment.width) || 4),
    height: Math.max(3.4, Number(segment.height) || 3.8),
  };
}

export const L2_FEATURE_ROOM_DEPTH = 5;

/** 特征支路末端的房间尺寸。挖墙与建房必须用同一套数字。 */
export function featureRoomBox(s) {
  var depth = L2_FEATURE_ROOM_DEPTH;
  var width = Math.max(6.2, s.width + 1);
  var tx = s.dx / s.length;
  var tz = s.dz / s.length;
  return {
    x: s.b.x + tx * depth * 0.5,
    z: s.b.z + tz * depth * 0.5,
    tx: s.tx,
    tz: s.tz,
    nx: s.nx,
    nz: s.nz,
    rotation: s.rotation,
    length: depth,
    width: width,
    height: s.height,
    isFeatureRoom: true,
  };
}

/**
 * 走廊墙沿整段铺设，只在别的走廊真正压过来的地方开口。
 * 邻块也要参与，否则区块接缝处的墙会横插进对面的走廊。
 *
 * 特征房间（EL3A 办公室等）在支路终点之外另起一块净空，也必须参与挖墙，
 * 否则别的走廊会把墙和管道直接横在房间入口上。
 */
function collectCarvers(cx, cz) {
  var own = [];
  var all = [];
  for (var dz = -1; dz <= 1; dz++) {
    for (var dx = -1; dx <= 1; dx++) {
      var center = dx === 0 && dz === 0;
      var layout = getLayout(cx + dx, cz + dz);
      var segments = Array.isArray(layout.segments) ? layout.segments : [];
      for (var i = 0; i < segments.length; i++) {
        var info = segmentInfo(segments[i]);
        if (center) own.push(info);
        if (info.length > 0.1) all.push(info);
        if (info.length > 0.1 && segments[i].kind === "diagonal_branch" && segments[i].feature) {
          all.push(featureRoomBox(info));
        }
      }
    }
  }
  return { own: own, all: all };
}

/** 点落在另一条走廊的净空内 → 该处应当是开口而不是墙 */
function pointOpensWall(carvers, self, x, z) {
  for (var i = 0; i < carvers.length; i++) {
    var o = carvers[i];
    if (o === self) continue;
    var dx = x - o.x;
    var dz = z - o.z;
    var du = dx * o.tx + dz * o.tz;
    if (Math.abs(du) > o.length * 0.5 + 0.1) continue;
    var dv = dx * o.nx + dz * o.nz;
    // 严格小于净空半宽：等宽平行段互相贴合时不会把对方的墙削掉
    if (Math.abs(dv) < o.width * 0.5 - 0.05) return true;
  }
  return false;
}

function pointInDoorCut(cuts, x, z) {
  for (var i = 0; i < cuts.length; i++) {
    var dx = x - cuts[i].x;
    var dz = z - cuts[i].z;
    if (dx * dx + dz * dz <= cuts[i].r * cuts[i].r) return true;
  }
  return false;
}

/** 返回该侧墙需要实体化的 [起点, 终点] 区间（沿段中心线的局部坐标） */
function solidWallSpans(self, side, carvers, cuts) {
  var half = self.length * 0.5;
  var steps = Math.max(2, Math.ceil(self.length / 0.25));
  var offX = self.nx * side * self.width * 0.5;
  var offZ = self.nz * side * self.width * 0.5;
  var spans = [];
  var runStart = null;
  for (var i = 0; i <= steps; i++) {
    var u = -half + (self.length * i) / steps;
    var x = self.x + self.tx * u + offX;
    var z = self.z + self.tz * u + offZ;
    var open = pointOpensWall(carvers, self, x, z) || pointInDoorCut(cuts, x, z);
    if (open) {
      if (runStart !== null && u - runStart >= 0.3) spans.push([runStart, u]);
      runStart = null;
    } else if (runStart === null) {
      runStart = u;
    }
  }
  if (runStart !== null && half - runStart >= 0.3) spans.push([runStart, half]);
  return spans;
}

/** 端点没有任何其他走廊接续时补一堵封头，避免走到断头处直接看见虚空 */
function endpointIsOpen(carvers, self, point) {
  for (var i = 0; i < carvers.length; i++) {
    var o = carvers[i];
    if (o === self) continue;
    var dx = point.x - o.x;
    var dz = point.z - o.z;
    var du = dx * o.tx + dz * o.tz;
    if (Math.abs(du) > o.length * 0.5 + 0.05) continue;
    var dv = dx * o.nx + dz * o.nz;
    if (Math.abs(dv) < o.width * 0.5 - 0.05) return true;
  }
  return false;
}

function createObb(cx, cz, halfX, halfZ, rotation, kind) {
  return createObbCollider(cx, cz, halfX, halfZ, rotation, {
    kind: kind || "wall",
  });
}

function addCollider(ctx, record, collider) {
  record.colliders.push(collider);
  ctx.colliders.push(collider);
  try {
    delete ctx.colliders.__brSpatial;
  } catch (err) {
    /* ignore */
  }
}

function addBox(group, geometry, material, x, y, z, rotation) {
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation || 0;
  group.add(mesh);
  return mesh;
}

function addPipeCylinder(group, geometry, material, x, y, z, tx, tz) {
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(tx, 0, tz).normalize()
  );
  group.add(mesh);
  return mesh;
}

/**
 * 管线规格保持确定性。窄支路只放高位细管；宽走廊才允许低位粗管参与碰撞。
 */
export function deriveLevel2PipeProfile(width, detailSeed) {
  var narrow = width < 3.1;
  var count = narrow ? 1 : 2 + (detailSeed % 2);
  var firstSide = ((detailSeed >>> 3) & 1) ? 1 : -1;
  var pipes = [];
  for (var i = 0; i < count; i++) {
    pipes.push({
      side: i % 2 === 0 ? firstSide : -firstSide,
      radius: narrow ? 0.085 : 0.11 + i * 0.025,
      y: narrow ? 2.35 : 0.92 + i * 0.62,
      collidable: !narrow && i === 0 && width >= 3.4,
    });
  }
  return pipes;
}

/**
 * 将管线限制在实体墙 span 内；两端收缩，给门框、路口和接头留空。
 */
export function deriveLevel2PipeRuns(segment, spansBySide, detailSeed) {
  var profile = deriveLevel2PipeProfile(segment.width, detailSeed);
  var runs = [];
  for (var i = 0; i < profile.length; i++) {
    var pipe = profile[i];
    var spans = spansBySide[pipe.side] || [];
    for (var si = 0; si < spans.length; si++) {
      var start = spans[si][0] + 0.22;
      var finish = spans[si][1] - 0.22;
      if (finish - start < 0.65) continue;
      runs.push(Object.assign({}, pipe, {
        start: start,
        end: finish,
        length: finish - start,
        along: (start + finish) * 0.5,
      }));
    }
  }
  return runs;
}

function sharedMaterials() {
  var wallCanvas = document.createElement("canvas");
  wallCanvas.width = 128;
  wallCanvas.height = 128;
  var wc = wallCanvas.getContext("2d");
  wc.fillStyle = "#514d47";
  wc.fillRect(0, 0, 128, 128);
  for (var i = 0; i < 560; i++) {
    var shade = 35 + Math.floor(Math.random() * 55);
    wc.fillStyle = "rgba(" + shade + "," + (shade - 4) + "," + (shade - 8) + ",0.18)";
    wc.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1);
  }
  var wallMap = new THREE.CanvasTexture(wallCanvas);
  wallMap.wrapS = THREE.RepeatWrapping;
  wallMap.wrapT = THREE.RepeatWrapping;
  wallMap.repeat.set(3, 2);

  var signCanvas = document.createElement("canvas");
  signCanvas.width = 256;
  signCanvas.height = 96;
  var sc = signCanvas.getContext("2d");
  sc.fillStyle = "#111820";
  sc.fillRect(0, 0, 256, 96);
  sc.strokeStyle = "#9fc8de";
  sc.lineWidth = 5;
  sc.strokeRect(5, 5, 246, 86);
  sc.fillStyle = "#d7edf7";
  sc.font = "bold 54px sans-serif";
  sc.textAlign = "center";
  sc.textBaseline = "middle";
  sc.fillText("EL3A", 128, 50);
  var signMap = new THREE.CanvasTexture(signCanvas);

  return {
    wall: new THREE.MeshStandardMaterial({
      color: 0x756f65,
      emissive: 0x2b2721,
      emissiveIntensity: 0.38,
      roughness: 1,
      map: wallMap,
    }),
    brick: new THREE.MeshStandardMaterial({
      color: 0x3c3028,
      emissive: 0x100907,
      emissiveIntensity: 0.18,
      roughness: 1,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x3c3a37,
      emissive: 0x141315,
      emissiveIntensity: 0.2,
      roughness: 0.98,
    }),
    ceil: new THREE.MeshStandardMaterial({
      color: 0x202026,
      emissive: 0x0d0d12,
      emissiveIntensity: 0.26,
      roughness: 0.94,
    }),
    pipe: new THREE.MeshStandardMaterial({
      color: 0x34383a,
      emissive: 0x0b0b0d,
      emissiveIntensity: 0.12,
      roughness: 0.66,
      metalness: 0.55,
    }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x604333,
      roughness: 0.88,
      metalness: 0.38,
    }),
    wood: new THREE.MeshStandardMaterial({ color: 0x60452e, roughness: 0.96 }),
    office: new THREE.MeshStandardMaterial({
      color: 0x8b887e,
      emissive: 0x292b2d,
      emissiveIntensity: 0.32,
      roughness: 0.9,
    }),
    monitor: new THREE.MeshStandardMaterial({
      color: 0x172a30,
      emissive: 0x285f6b,
      emissiveIntensity: 0.7,
      roughness: 0.4,
    }),
    el3aSign: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x8ac6df,
      emissiveIntensity: 0.45,
      map: signMap,
      roughness: 0.5,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xe7dec6,
      emissive: 0xc8b990,
      emissiveIntensity: 1.65,
      roughness: 0.35,
    }),
    blackoutLamp: new THREE.MeshStandardMaterial({
      color: 0x28232e,
      emissive: 0x28164a,
      emissiveIntensity: 0.25,
      roughness: 0.5,
    }),
  };
}

function addCorridorSegment(ctx, record, segment, index, s, carvers, doorCuts) {
  if (!s || !(s.length > 0.1)) return;
  var group = record.group;
  var floorGeo = new THREE.BoxGeometry(s.width, 0.12, s.length + 0.25);
  var ceilGeo = new THREE.BoxGeometry(s.width, 0.1, s.length + 0.25);
  record.geometries.push(floorGeo, ceilGeo);
  addBox(group, floorGeo, ctx.materials.floor, s.x, 0.04, s.z, s.rotation);
  addBox(group, ceilGeo, ctx.materials.ceil, s.x, s.height, s.z, s.rotation);

  var nx = s.nx;
  var nz = s.nz;
  var wallMat = (hashText(record.key + ":brick:" + index) % 5 === 0)
    ? ctx.materials.brick
    : ctx.materials.wall;
  var spansBySide = { "-1": [], "1": [] };
  for (var side = -1; side <= 1; side += 2) {
    var spans = solidWallSpans(s, side, carvers, doorCuts);
    spansBySide[side] = spans;
    var offX = nx * side * s.width * 0.5;
    var offZ = nz * side * s.width * 0.5;
    for (var si = 0; si < spans.length; si++) {
      var spanLen = spans[si][1] - spans[si][0];
      var mid = (spans[si][0] + spans[si][1]) * 0.5;
      var wx = s.x + s.tx * mid + offX;
      var wz = s.z + s.tz * mid + offZ;
      var spanGeo = new THREE.BoxGeometry(WALL_THICK, s.height, spanLen);
      record.geometries.push(spanGeo);
      addBox(group, spanGeo, wallMat, wx, s.height * 0.5, wz, s.rotation);
      addCollider(
        ctx,
        record,
        createObb(wx, wz, WALL_THICK * 0.5, spanLen * 0.5, -s.rotation, "wall")
      );
    }
  }

  if (segment.kind !== "diagonal_branch") {
    var ends = [s.a, s.b];
    for (var ei = 0; ei < ends.length; ei++) {
      if (endpointIsOpen(carvers, s, ends[ei])) continue;
      var capGeoEnd = new THREE.BoxGeometry(s.width + WALL_THICK * 2, s.height, WALL_THICK);
      record.geometries.push(capGeoEnd);
      addBox(group, capGeoEnd, wallMat, ends[ei].x, s.height * 0.5, ends[ei].z, s.rotation);
      addCollider(
        ctx,
        record,
        createObb(
          ends[ei].x,
          ends[ei].z,
          s.width * 0.5 + WALL_THICK,
          WALL_THICK * 0.5,
          -s.rotation,
          "wall"
        )
      );
    }
  }

  if (segment.kind === "diagonal_branch" && segment.feature) {
    var room = featureRoomBox(s);
    var roomDepth = room.length;
    var roomWidth = room.width;
    var tx = s.dx / s.length;
    var tz = s.dz / s.length;
    var roomX = room.x;
    var roomZ = room.z;
    var roomFloorGeo = new THREE.BoxGeometry(roomWidth, 0.12, roomDepth);
    var roomCeilGeo = new THREE.BoxGeometry(roomWidth, 0.1, roomDepth);
    var roomSideGeo = new THREE.BoxGeometry(WALL_THICK, s.height, roomDepth);
    var roomFarGeo = new THREE.BoxGeometry(roomWidth, s.height, WALL_THICK);
    record.geometries.push(roomFloorGeo, roomCeilGeo, roomSideGeo, roomFarGeo);
    addBox(group, roomFloorGeo, ctx.materials.floor, roomX, 0.04, roomZ, s.rotation);
    addBox(group, roomCeilGeo, ctx.materials.ceil, roomX, s.height, roomZ, s.rotation);
    for (var roomSide = -1; roomSide <= 1; roomSide += 2) {
      var sideX = roomX + nx * roomSide * roomWidth * 0.5;
      var sideZ = roomZ + nz * roomSide * roomWidth * 0.5;
      addBox(group, roomSideGeo, wallMat, sideX, s.height * 0.5, sideZ, s.rotation);
      addCollider(
        ctx,
        record,
        createObb(sideX, sideZ, WALL_THICK * 0.5, roomDepth * 0.5, -s.rotation, "wall")
      );
    }
    var farX = s.b.x + tx * roomDepth;
    var farZ = s.b.z + tz * roomDepth;
    addBox(group, roomFarGeo, wallMat, farX, s.height * 0.5, farZ, s.rotation);
    addCollider(
      ctx,
      record,
      createObb(farX, farZ, roomWidth * 0.5, WALL_THICK * 0.5, -s.rotation, "wall")
    );
    // 房间比支路宽，近端两侧要补墙，否则入口两边直接漏到虚空。
    var stubW = (roomWidth - s.width) * 0.5;
    if (stubW > 0.1) {
      var stubGeo = new THREE.BoxGeometry(stubW, s.height, WALL_THICK);
      record.geometries.push(stubGeo);
      for (var stubSide = -1; stubSide <= 1; stubSide += 2) {
        var stubOff = stubSide * (s.width * 0.5 + stubW * 0.5);
        var stubX = s.b.x + nx * stubOff;
        var stubZ = s.b.z + nz * stubOff;
        addBox(group, stubGeo, wallMat, stubX, s.height * 0.5, stubZ, s.rotation);
        addCollider(
          ctx,
          record,
          createObb(stubX, stubZ, stubW * 0.5, WALL_THICK * 0.5, -s.rotation, "wall")
        );
      }
    }
  } else if (segment.kind === "diagonal_branch") {
    var capGeo = new THREE.BoxGeometry(s.width + WALL_THICK * 2, s.height, WALL_THICK);
    record.geometries.push(capGeo);
    addBox(group, capGeo, wallMat, s.b.x, s.height * 0.5, s.b.z, s.rotation);
    addCollider(
      ctx,
      record,
      createObb(s.b.x, s.b.z, s.width * 0.5 + WALL_THICK, WALL_THICK * 0.5, -s.rotation, "wall")
    );
  }

  var detailSeed = hashText(record.key + ":segment:" + index);
  var random = rngFor(detailSeed);
  var pipeRuns = deriveLevel2PipeRuns(s, spansBySide, detailSeed);
  for (var p = 0; p < pipeRuns.length; p++) {
    var run = pipeRuns[p];
    var pipeGeo = new THREE.CylinderGeometry(run.radius, run.radius, run.length, 8, 1, false);
    record.geometries.push(pipeGeo);
    // 略嵌入墙面，减少对通道净宽的侵占。
    var inset = s.width * 0.5 - run.radius * 0.35;
    var pipeX = s.x + s.tx * run.along + nx * run.side * inset;
    var pipeZ = s.z + s.tz * run.along + nz * run.side * inset;
    var pipe = addPipeCylinder(
      group,
      pipeGeo,
      ctx.materials.pipe,
      pipeX,
      run.y,
      pipeZ,
      s.tx,
      s.tz
    );
    pipe.name = "Level2WallPipe";
    if (run.collidable) {
      addCollider(
        ctx,
        record,
        createObb(pipeX, pipeZ, run.radius, run.length * 0.5, -s.rotation, "pipe")
      );
    }
    // 每段端点加法兰，让断开的管线看起来由阀件封闭，而非悬空。
    var flangeGeo = new THREE.CylinderGeometry(
      run.radius * 1.45,
      run.radius * 1.45,
      0.08,
      8
    );
    record.geometries.push(flangeGeo);
    for (var fe = -1; fe <= 1; fe += 2) {
      var endAlong = fe < 0 ? run.start : run.end;
      var flangeX = s.x + s.tx * endAlong + nx * run.side * inset;
      var flangeZ = s.z + s.tz * endAlong + nz * run.side * inset;
      var flange = addPipeCylinder(
        group,
        flangeGeo,
        ctx.materials.rust,
        flangeX,
        run.y,
        flangeZ,
        s.tx,
        s.tz
      );
      flange.name = "Level2PipeFlange";
    }
  }

  var lampStep = 5;
  var lampCount = Math.max(1, Math.floor(s.length / lampStep));
  for (var l = 0; l < lampCount; l++) {
    var along = -s.length * 0.5 + (l + 0.5) * (s.length / lampCount);
    var lx = s.x + Math.sin(s.rotation) * along;
    var lz = s.z + Math.cos(s.rotation) * along;
    var lampGeo = new THREE.BoxGeometry(Math.min(1.35, s.width * 0.28), 0.06, 0.2);
    record.geometries.push(lampGeo);
    var lamp = addBox(
      group,
      lampGeo,
      record.blackout ? ctx.materials.blackoutLamp : ctx.materials.lamp,
      lx,
      s.height - 0.1,
      lz,
      s.rotation
    );
    lamp.name = "Level2CeilingLamp";
    record.lampMeshes.push(lamp);
    var candidate = {
      x: lx,
      y: s.height - 0.35,
      z: lz,
      baseIntensity: 0.95,
      intensity: record.blackout ? 0.04 : 0.95,
      // 照射半径与走廊宽度脱钩，否则窄隧道会连墙面都照不亮
      distance: Math.max(12, s.width * 2.6),
    };
    record.lights.push(candidate);
    ctx.lightCandidates.push(candidate);
  }

  // Larger rooms and some long corridors receive carts/crates without blocking the center lane.
  if ((segment.kind === "room" || random() < 0.18) && s.width >= 3.4) {
    var sideOffset = s.width * 0.5 - 0.78;
    var propX = s.x + nx * sideOffset;
    var propZ = s.z + nz * sideOffset;
    var crateGeo = new THREE.BoxGeometry(0.8, 0.72, 1.05);
    record.geometries.push(crateGeo);
    addBox(group, crateGeo, random() < 0.5 ? ctx.materials.wood : ctx.materials.rust,
      propX, 0.36, propZ, s.rotation);
    addCollider(ctx, record, createObb(propX, propZ, 0.42, 0.55, -s.rotation, "obstacle"));
  }
}

/** 特征所在支路的净高。房间天花板跟着它走，灯和标牌不能写死高度。 */
function featureHeight(record, feature) {
  var best = null;
  var bestDist = Infinity;
  for (var i = 0; i < record.navSegments.length; i++) {
    var seg = record.navSegments[i];
    var dist = Math.hypot(seg.b.x - feature.x, seg.b.z - feature.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best && bestDist < 0.5 ? best.height : 3.8;
}

function featurePosition(record, feature) {
  if (Number.isFinite(feature.x) && Number.isFinite(feature.z)) {
    var rotation = feature.rotation || 0;
    if (feature.approachFrom) {
      rotation = Math.atan2(
        feature.x - feature.approachFrom.x,
        feature.z - feature.approachFrom.z
      );
    }
    return {
      x: feature.x,
      z: feature.z,
      rotation: rotation,
      height: featureHeight(record, feature),
    };
  }
  var seg = record.navSegments[feature.segmentIndex || 0] || record.navSegments[0];
  return seg
    ? { x: seg.x, z: seg.z, rotation: seg.rotation, height: seg.height }
    : {
        x: record.cx * CHUNK_SIZE,
        z: record.cz * CHUNK_SIZE,
        rotation: 0,
        height: 3.8,
      };
}

function addPickRoot(ctx, record, x, y, z, data) {
  var geometry = new THREE.BoxGeometry(1.25, 1.25, 1.25);
  var material = new THREE.MeshBasicMaterial({ visible: false });
  var pick = new THREE.Mesh(geometry, material);
  pick.position.set(x, y, z);
  pick.userData.brInteract = data;
  record.group.add(pick);
  record.geometries.push(geometry);
  record.materials.push(material);
  record.interacts.push(pick);
  ctx.interactRoots.push(pick);
}

function readInteractionState() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(INTERACTION_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeInteractionState(state) {
  try {
    sessionStorage.setItem(INTERACTION_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function deriveFeatures(record) {
  var layoutFeatures = Array.isArray(record.layout.features) ? record.layout.features.slice() : [];
  var seed = hashText(record.key + ":features");
  if (record.key !== "0,0" && seed % 7 === 0) {
    layoutFeatures.push({ type: "toolbox", segmentIndex: seed % Math.max(1, record.navSegments.length) });
  }
  if (record.key !== "0,0" && seed % 11 === 0) {
    layoutFeatures.push({ type: "record", segmentIndex: (seed >>> 3) % Math.max(1, record.navSegments.length) });
  }
  return layoutFeatures;
}

/** 在某条走廊的侧墙上挑一处不会落在路口开口里的门位 */
function pickDoorSpot(record, carvers, slot) {
  var segments = record.navSegments;
  if (!segments.length) return null;
  for (var attempt = 0; attempt < 8; attempt++) {
    var h = hashText(record.key + ":doorspot:" + slot + ":" + attempt);
    var info = segments[h % segments.length];
    var span = info.length * 0.5 - 2.4;
    if (span <= 0) continue;
    var side = (h >>> 4) & 1 ? 1 : -1;
    var along = -span + (((h >>> 6) % 1000) / 1000) * span * 2;
    var x = info.x + info.tx * along + info.nx * side * (info.width * 0.5 - 0.04);
    var z = info.z + info.tz * along + info.nz * side * (info.width * 0.5 - 0.04);
    if (pointOpensWall(carvers, info, x, z)) continue;
    return {
      x: x,
      z: z,
      rotation: info.rotation - Math.PI * 0.5 * side,
      height: info.height,
    };
  }
  return null;
}

function deriveDoorSpecs(record, carvers) {
  var specs = [];
  var seed = hashText(record.key + ":exits");
  var count = record.key === "0,0" ? 1 : 2 + (seed % 2);
  var destinations = ["l1", "l3_or_l4", "l283"];
  for (var i = 0; i < count; i++) {
    var spot = pickDoorSpot(record, carvers, i);
    if (!spot) continue;
    var crowded = false;
    for (var j = 0; j < specs.length; j++) {
      if (Math.hypot(specs[j].x - spot.x, specs[j].z - spot.z) < 4.5) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    var dh = hashText(record.key + ":dest:" + i);
    var destination = destinations[dh % destinations.length];
    specs.push({
      key: record.key + ":exit:" + i,
      x: spot.x,
      z: spot.z,
      rotation: spot.rotation,
      height: spot.height,
      destination: destination,
      style: destination === "l283" ? "rainbow" : (dh & 1 ? "wood" : "plain"),
    });
  }
  return specs;
}

function addEl3aOffice(ctx, record, feature, pos, id) {
  var tx = Math.sin(pos.rotation);
  var tz = Math.cos(pos.rotation);
  var nx = Math.cos(pos.rotation);
  var nz = -Math.sin(pos.rotation);
  var height = Math.max(3.4, Number(pos.height) || 3.8);

  // 入口上方的 EL3A 识别牌，挂在门楣与天花板之间。
  var signGeo = new THREE.BoxGeometry(1.55, 0.56, 0.07);
  record.geometries.push(signGeo);
  var sign = addBox(
    record.group,
    signGeo,
    ctx.materials.el3aSign,
    pos.x + tx * 0.12,
    height - 0.62,
    pos.z + tz * 0.12,
    pos.rotation
  );
  sign.name = "Level2EL3ASign";

  // 办公桌靠房间深处，椅子留在玩家侧，中央仍可绕行。
  var deskX = pos.x + tx * 3.15;
  var deskZ = pos.z + tz * 3.15;
  var deskGeo = new THREE.BoxGeometry(2.05, 0.76, 0.72);
  record.geometries.push(deskGeo);
  var desk = addBox(
    record.group,
    deskGeo,
    ctx.materials.wood,
    deskX,
    0.38,
    deskZ,
    pos.rotation
  );
  desk.name = "Level2EL3ADesk";
  addCollider(ctx, record, createObb(deskX, deskZ, 1.025, 0.36, -pos.rotation, "obstacle"));

  var chairX = pos.x + tx * 1.92 - nx * 0.68;
  var chairZ = pos.z + tz * 1.92 - nz * 0.68;
  var chairGeo = new THREE.BoxGeometry(0.62, 0.82, 0.62);
  record.geometries.push(chairGeo);
  var chair = addBox(
    record.group,
    chairGeo,
    ctx.materials.office,
    chairX,
    0.41,
    chairZ,
    pos.rotation
  );
  chair.name = "Level2EL3AChair";
  addCollider(ctx, record, createObb(chairX, chairZ, 0.31, 0.31, -pos.rotation, "obstacle"));

  var monitorX = deskX - tx * 0.08;
  var monitorZ = deskZ - tz * 0.08;
  var monitorGeo = new THREE.BoxGeometry(0.82, 0.52, 0.12);
  record.geometries.push(monitorGeo);
  var monitor = addBox(
    record.group,
    monitorGeo,
    ctx.materials.monitor,
    monitorX,
    1.08,
    monitorZ,
    pos.rotation
  );
  monitor.name = "Level2EL3AMonitor";

  var cabinetX = pos.x + tx * 3.75 + nx * 2.25;
  var cabinetZ = pos.z + tz * 3.75 + nz * 2.25;
  var cabinetGeo = new THREE.BoxGeometry(0.82, 1.75, 0.62);
  record.geometries.push(cabinetGeo);
  var cabinet = addBox(
    record.group,
    cabinetGeo,
    ctx.materials.office,
    cabinetX,
    0.875,
    cabinetZ,
    pos.rotation
  );
  cabinet.name = "Level2EL3AFileCabinet";
  addCollider(ctx, record, createObb(cabinetX, cabinetZ, 0.41, 0.31, -pos.rotation, "obstacle"));

  var lampX = pos.x + tx * 2.65;
  var lampZ = pos.z + tz * 2.65;
  var lampGeo = new THREE.BoxGeometry(1.35, 0.06, 0.28);
  record.geometries.push(lampGeo);
  var lamp = addBox(
    record.group,
    lampGeo,
    record.blackout ? ctx.materials.blackoutLamp : ctx.materials.lamp,
    lampX,
    height - 0.1,
    lampZ,
    pos.rotation
  );
  lamp.name = "Level2EL3AOfficeLamp";
  record.lampMeshes.push(lamp);
  var light = {
    x: lampX,
    y: height - 0.44,
    z: lampZ,
    baseIntensity: 0.82,
    intensity: record.blackout ? 0.04 : 0.82,
    distance: 9,
  };
  record.lights.push(light);
  ctx.lightCandidates.push(light);

  // 桌面维护记录沿用 L2 的 session 交互状态。
  var noteX = deskX - nx * 0.5;
  var noteZ = deskZ - nz * 0.5;
  var noteGeo = new THREE.BoxGeometry(0.42, 0.035, 0.3);
  record.geometries.push(noteGeo);
  addBox(record.group, noteGeo, ctx.materials.office, noteX, 0.79, noteZ, pos.rotation);
  addPickRoot(ctx, record, noteX, 1.0, noteZ, {
    kind: "l2_el3a_record",
    id: id + ":record",
    code: feature.code || "EL3A",
    text: "EL3A 办公室维护记录：墙内管线与隧道图纸存在偏移。门洞附近的管道已经被强制截断。",
  });
}

function addChunkFeatures(ctx, record) {
  var features = deriveFeatures(record);
  for (var i = 0; i < features.length; i++) {
    var feature = features[i];
    var pos = featurePosition(record, feature);
    var id = record.key + ":" + feature.type + ":" + i;
    if (feature.type === "toolbox") {
      var geo = new THREE.BoxGeometry(0.76, 0.48, 0.52);
      record.geometries.push(geo);
      addBox(record.group, geo, ctx.materials.rust, pos.x, 0.24, pos.z, pos.rotation);
      addPickRoot(ctx, record, pos.x, 0.72, pos.z, {
        kind: "l2_toolbox",
        id: id,
        itemId: "industrial_supplies",
        amount: 1,
      });
    } else if (feature.type === "record") {
      var noteGeo = new THREE.BoxGeometry(0.42, 0.035, 0.3);
      record.geometries.push(noteGeo);
      addBox(record.group, noteGeo, ctx.materials.wood, pos.x, 0.42, pos.z, pos.rotation);
      addPickRoot(ctx, record, pos.x, 0.7, pos.z, {
        kind: "l2_record",
        id: id,
        text: "褪色维护记录：每段隧道仍遵循测绘尺度，但供电与管线并不服从同一套图纸。",
      });
    } else if (feature.type === "office") {
      addEl3aOffice(ctx, record, feature, pos, id);
    } else if (feature.type === "equipment" || feature.type === "storage") {
      var tangentX = Math.sin(pos.rotation);
      var tangentZ = Math.cos(pos.rotation);
      var propX = pos.x + tangentX * 2.7;
      var propZ = pos.z + tangentZ * 2.7;
      var propGeo = new THREE.BoxGeometry(1.25, 1.45, 0.72);
      record.geometries.push(propGeo);
      addBox(
        record.group,
        propGeo,
        ctx.materials.rust,
        propX,
        0.725,
        propZ,
        pos.rotation
      );
      addCollider(
        ctx,
        record,
        createObb(propX, propZ, 0.625, 0.36, -pos.rotation, "obstacle")
      );
    }
  }
  ctx.doors.loadChunk(record.key, record.doorSpecs || []);
}

function deriveEntitySpawns(record) {
  var list = Array.isArray(record.layout.entitySpawns)
    ? record.layout.entitySpawns.slice()
    : [];
  if (record.key === "0,0" || !record.navSegments.length) return list;
  var seed = hashText(record.key + ":entities");
  if (seed % 3 !== 0) return list;
  var kinds = ["smiler", "death_moth", "clump", "hound"];
  var kind = kinds[(seed >>> 4) % kinds.length];
  var seg = record.navSegments[(seed >>> 8) % record.navSegments.length];
  var offset = Math.min(seg.width * 0.22, 1.2);
  var x = seg.x + Math.cos(seg.rotation) * offset;
  var z = seg.z - Math.sin(seg.rotation) * offset;
  list.push({
    id: record.key + ":" + kind,
    kind: kind,
    seed: seed,
    x: x,
    z: z,
    rotation: seg.rotation,
    waypoints: [seg.a, seg.b],
  });
  return list;
}

function loadChunk(cx, cz, ctx) {
  var key = chunkKey(cx, cz);
  if (ctx.chunks.has(key)) return;
  var layout = getLayout(cx, cz);
  var group = new THREE.Group();
  group.name = "Level2TunnelChunk_" + key;
  ctx.chunksRoot.add(group);
  var record = {
    key: key,
    cx: cx,
    cz: cz,
    group: group,
    layout: layout,
    colliders: [],
    interacts: [],
    lights: [],
    lampMeshes: [],
    geometries: [],
    materials: [],
    navSegments: [],
    entitySpawns: [],
    steamLeaks: [],
    blackout: (hashText(key + ":power") % 9) === ctx.blackoutBand,
  };
  ctx.chunks.set(key, record);
  var segments = Array.isArray(layout.segments) ? layout.segments : [];
  var carverPack = collectCarvers(cx, cz);
  record.navSegments = carverPack.own.filter(function (info) {
    return info.length > 0.1;
  });
  record.doorSpecs = deriveDoorSpecs(record, carverPack.all);
  var doorCuts = record.doorSpecs.map(function (spec) {
    return { x: spec.x, z: spec.z, r: 0.92 };
  });
  for (var i = 0; i < segments.length; i++) {
    addCorridorSegment(
      ctx,
      record,
      segments[i],
      i,
      carverPack.own[i],
      carverPack.all,
      doorCuts
    );
  }
  addChunkFeatures(ctx, record);
  record.entitySpawns = deriveEntitySpawns(record);

  if (key !== "0,0" && hashText(key + ":steam") % 5 === 0 && record.navSegments.length) {
    var seg = record.navSegments[hashText(key) % record.navSegments.length];
    var material = new THREE.MeshBasicMaterial({
      color: 0xb9c2ca,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });
    var geometry = new THREE.SphereGeometry(0.82, 9, 7);
    var cloud = new THREE.Mesh(geometry, material);
    cloud.position.set(seg.x, 1.05, seg.z);
    group.add(cloud);
    record.materials.push(material);
    record.geometries.push(geometry);
    record.steamLeaks.push({
      x: seg.x,
      z: seg.z,
      phase: (hashText(key + ":phase") % 700) / 100,
      cloud: cloud,
    });
  }
}

function unloadChunk(key, ctx) {
  var record = ctx.chunks.get(key);
  if (!record) return;
  ctx.doors.unloadChunk(key);
  record.colliders.forEach(function (collider) {
    var i = ctx.colliders.indexOf(collider);
    if (i >= 0) ctx.colliders.splice(i, 1);
  });
  record.interacts.forEach(function (root) {
    var i = ctx.interactRoots.indexOf(root);
    if (i >= 0) ctx.interactRoots.splice(i, 1);
  });
  record.lights.forEach(function (light) {
    var i = ctx.lightCandidates.indexOf(light);
    if (i >= 0) ctx.lightCandidates.splice(i, 1);
  });
  try {
    delete ctx.colliders.__brSpatial;
  } catch (err) {
    /* ignore */
  }
  if (record.group.parent) record.group.parent.remove(record.group);
  record.materials.forEach(function (material) { material.dispose(); });
  record.geometries.forEach(function (geometry) { geometry.dispose(); });
  ctx.chunks.delete(key);
}

function updateStreaming(px, pz, ctx) {
  var here = getChunkCoords(px, pz);
  var wanted = Object.create(null);
  for (var dz = -STREAM_RADIUS; dz <= STREAM_RADIUS; dz++) {
    for (var dx = -STREAM_RADIUS; dx <= STREAM_RADIUS; dx++) {
      var key = chunkKey(here.cx + dx, here.cz + dz);
      wanted[key] = true;
      loadChunk(here.cx + dx, here.cz + dz, ctx);
    }
  }
  var remove = [];
  ctx.chunks.forEach(function (_record, key) {
    if (!wanted[key]) remove.push(key);
  });
  remove.forEach(function (key) { unloadChunk(key, ctx); });
}

export function buildBackroomsLevel2World(root, opts) {
  opts = opts || {};
  activeLayoutSeed = getOrCreateLayoutSeed();
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level2InfiniteTunnelChunks";
  root.add(chunksRoot);
  var colliders = opts.colliders || [];
  colliders.length = 0;
  var interactRoots = [];
  var materials = sharedMaterials();
  var chunks = new Map();
  var lightCandidates = [];
  var ambient = new THREE.AmbientLight(0x56515f, 0.92);
  var fill = new THREE.HemisphereLight(0x6f687b, 0x17151b, 0.58);
  root.add(ambient, fill);
  var lightPool = createPointLightPool(root, {
    count: 7,
    color: 0xffe9b8,
    distance: 13,
    decay: 1.65,
    y: 3.2,
    name: "Level2TunnelLight",
  });
  var steamHaze = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({
      color: 0x8996a2,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    })
  );
  steamHaze.rotation.x = -Math.PI * 0.5;
  steamHaze.visible = false;
  root.add(steamHaze);
  var ctx = {
    chunksRoot: chunksRoot,
    chunks: chunks,
    colliders: colliders,
    interactRoots: interactRoots,
    materials: materials,
    lightCandidates: lightCandidates,
    doors: null,
    blackoutBand: Math.floor(Math.random() * 9),
  };
  ctx.doors = createStreamingLevel2Doors(chunksRoot, colliders, interactRoots);
  var interactionState = readInteractionState();
  var powerTimer = 14;
  var elapsed = 0;
  var damageTimer = 0;
  var environment = {
    blackout: false,
    steamDanger: false,
    sanityDrainPerSec: 0.035,
    movementMultiplier: 1,
    spawnSafe: true,
  };

  updateStreaming(L2_SPAWN_X, L2_SPAWN_Z, ctx);

  function update(dt, player, callbacks) {
    callbacks = callbacks || {};
    var px = Number(player.x != null ? player.x : player.position.x) || 0;
    var pz = Number(player.z != null ? player.z : player.position.z) || 0;
    elapsed += dt;
    powerTimer -= dt;
    if (powerTimer <= 0) {
      ctx.blackoutBand = (ctx.blackoutBand + 1 + (hashText(String(elapsed)) % 7)) % 9;
      powerTimer = 13 + (hashText(String(ctx.blackoutBand + elapsed)) % 1200) / 100;
      if (callbacks.showToast) callbacks.showToast("远处的供电线路跳闸，黑暗沿隧道扩散。", 2200);
      // Rebuild only loaded chunk lamp material choices on the next stream pass.
    }
    updateStreaming(px, pz, ctx);
    chunks.forEach(function (chunk) {
      var dark = (hashText(chunk.key + ":power") % 9) === ctx.blackoutBand;
      if (chunk.blackout === dark) return;
      chunk.blackout = dark;
      for (var li = 0; li < chunk.lampMeshes.length; li++) {
        chunk.lampMeshes[li].material = dark
          ? materials.blackoutLamp
          : materials.lamp;
      }
      for (var ci = 0; ci < chunk.lights.length; ci++) {
        var candidate = chunk.lights[ci];
        candidate.intensity = dark
          ? 0.04
          : (candidate.baseIntensity != null ? candidate.baseIntensity : 0.95);
      }
    });
    lightPool.update(px, pz, lightCandidates);

    var here = getChunkCoords(px, pz);
    var record = chunks.get(chunkKey(here.cx, here.cz));
    environment.blackout =
      !!record && (hashText(record.key + ":power") % 9) === ctx.blackoutBand;
    var spawnZone = spawnBounds();
    environment.spawnSafe =
      px >= spawnZone.minX && px < spawnZone.maxX &&
      pz >= spawnZone.minZ && pz < spawnZone.maxZ;

    var inSteam = false;
    chunks.forEach(function (chunk) {
      for (var i = 0; i < chunk.steamLeaks.length; i++) {
        var leak = chunk.steamLeaks[i];
        var pulse = (elapsed + leak.phase) % 9;
        var active = pulse < 4.2;
        var strength = active ? Math.sin((pulse / 4.2) * Math.PI) : 0;
        leak.cloud.visible = active;
        leak.cloud.material.opacity = 0.05 + strength * 0.2;
        leak.cloud.scale.setScalar(0.55 + strength * 0.85);
        if (active && Math.hypot(px - leak.x, pz - leak.z) < 2.1) inSteam = true;
      }
    });
    environment.steamDanger = inSteam;
    environment.sanityDrainPerSec = (environment.blackout ? 0.14 : 0.035) + (inSteam ? 0.08 : 0);
    environment.movementMultiplier = inSteam ? 0.82 : 1;
    damageTimer = inSteam ? damageTimer + dt : 0;
    if (inSteam && damageTimer >= 1) {
      damageTimer -= 1;
      if (callbacks.onDamage) callbacks.onDamage(4);
    }
    return Object.assign({}, environment);
  }

  function resolveInteraction(data) {
    if (!data) return null;
    if (data.kind) return data;
    if (data.userData && data.userData.brInteract) return data.userData.brInteract;
    return null;
  }

  return {
    colliders: colliders,
    interactRoots: interactRoots,
    doors: ctx.doors,
    spawnX: L2_SPAWN_X,
    spawnZ: L2_SPAWN_Z,
    spawnYaw:
      typeof Layout.getLevel2SpawnYaw === "function"
        ? Layout.getLevel2SpawnYaw(activeLayoutSeed)
        : 0,
    spawnZone: spawnBounds(),
    lighting: {
      ambient: ambient,
      fill: fill,
      pointLights: lightPool.lights,
      materials: materials,
      steamHaze: steamHaze,
    },
    update: update,
    getEnvironmentState: function () { return Object.assign({}, environment); },
    getActiveEntitySpawns: function () {
      var result = [];
      chunks.forEach(function (record) {
        result.push.apply(result, record.entitySpawns);
      });
      return result;
    },
    getWandererSpawns: function () {
      var points = [];
      chunks.forEach(function (record) {
        for (var i = 0; i < record.navSegments.length; i++) {
          var segment = record.navSegments[i];
          var distance = Math.hypot(segment.x - L2_SPAWN_X, segment.z - L2_SPAWN_Z);
          if (distance < 18 || distance > CHUNK_SIZE * (STREAM_RADIUS + 0.5)) continue;
          var crowded = false;
          for (var p = 0; p < points.length; p++) {
            if (Math.hypot(points[p].x - segment.x, points[p].z - segment.z) < 6) {
              crowded = true;
              break;
            }
          }
          if (crowded) continue;
          points.push({
            x: segment.x,
            z: segment.z,
            score: hashText(record.key + ":wanderer:" + i),
          });
        }
      });
      points.sort(function (a, b) { return a.score - b.score; });
      return points.slice(0, 7);
    },
    getInteractionHint: function (data) {
      var info = resolveInteraction(data);
      if (!info) return "";
      if (info.kind === "l2_toolbox") {
        return interactionState[info.id] ? "空工具箱 · 已搜刮" : "废弃工具箱 · 按 Q 搜寻补给";
      }
      if (info.kind === "l2_record") {
        return interactionState[info.id] ? "工业维护记录 · 已读" : "工业维护记录 · 按 Q 阅读";
      }
      if (info.kind === "l2_el3a_record") {
        return interactionState[info.id] ? "EL3A 办公室记录 · 已读" : "EL3A 办公室记录 · 按 Q 阅读";
      }
      return "";
    },
    interact: function (data, callbacks) {
      var info = resolveInteraction(data);
      callbacks = callbacks || {};
      if (!info) return false;
      if (info.kind === "l2_toolbox") {
        if (interactionState[info.id]) {
          if (callbacks.showToast) callbacks.showToast("工具箱已经空了。", 1600);
          return true;
        }
        if (callbacks.grantItem && callbacks.grantItem(info.itemId, info.amount || 1, info) === false) {
          if (callbacks.showToast) callbacks.showToast("背包已满。", 1600);
          return true;
        }
        interactionState[info.id] = true;
        writeInteractionState(interactionState);
        if (callbacks.showToast) callbacks.showToast("取得工业维修补给。", 1800);
        return true;
      }
      if (info.kind === "l2_record" || info.kind === "l2_el3a_record") {
        interactionState[info.id] = true;
        writeInteractionState(interactionState);
        if (callbacks.showToast) callbacks.showToast(info.text, 4800);
        return true;
      }
      return false;
    },
    dispose: function () {
      Array.from(chunks.keys()).forEach(function (key) { unloadChunk(key, ctx); });
      ctx.doors.dispose();
      lightPool.dispose();
      if (chunksRoot.parent) chunksRoot.parent.remove(chunksRoot);
      if (ambient.parent) ambient.parent.remove(ambient);
      if (fill.parent) fill.parent.remove(fill);
      if (steamHaze.parent) steamHaze.parent.remove(steamHaze);
      steamHaze.geometry.dispose();
      steamHaze.material.dispose();
      Object.keys(materials).forEach(function (key) {
        if (materials[key].map) materials[key].map.dispose();
        materials[key].dispose();
      });
    },
  };
}

export const CORRIDOR_HEIGHT = 5;
export const SPAWN_Z = L2_SPAWN_Z;

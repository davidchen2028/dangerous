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

/**
 * 走廊墙沿整段铺设，只在别的走廊真正压过来的地方开口。
 * 邻块也要参与，否则区块接缝处的墙会横插进对面的走廊。
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

  var wallLength = Math.max(1, s.length - 1.2);
  var nx = s.nx;
  var nz = s.nz;
  var wallMat = (hashText(record.key + ":brick:" + index) % 5 === 0)
    ? ctx.materials.brick
    : ctx.materials.wall;
  for (var side = -1; side <= 1; side += 2) {
    var spans = solidWallSpans(s, side, carvers, doorCuts);
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
    var roomDepth = 5;
    var roomWidth = Math.max(6.2, s.width + 1);
    var tx = s.dx / s.length;
    var tz = s.dz / s.length;
    var roomX = s.b.x + tx * roomDepth * 0.5;
    var roomZ = s.b.z + tz * roomDepth * 0.5;
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
  var pipeCount = 2 + (detailSeed % 3);
  for (var p = 0; p < pipeCount; p++) {
    var pipeLength = Math.max(1, wallLength - p * 0.35);
    var pipeGeo = new THREE.BoxGeometry(0.13 + p * 0.035, 0.13 + p * 0.035, pipeLength);
    record.geometries.push(pipeGeo);
    var pipeSide = p % 2 ? -1 : 1;
    addBox(
      group,
      pipeGeo,
      ctx.materials.pipe,
      s.x + nx * pipeSide * (s.width * 0.5 - 0.22),
      1.05 + p * 0.52,
      s.z + nz * pipeSide * (s.width * 0.5 - 0.22),
      s.rotation
    );
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

function featurePosition(record, feature) {
  if (Number.isFinite(feature.x) && Number.isFinite(feature.z)) {
    var rotation = feature.rotation || 0;
    if (feature.approachFrom) {
      rotation = Math.atan2(
        feature.x - feature.approachFrom.x,
        feature.z - feature.approachFrom.z
      );
    }
    return { x: feature.x, z: feature.z, rotation: rotation };
  }
  var seg = record.navSegments[feature.segmentIndex || 0] || record.navSegments[0];
  return seg
    ? { x: seg.x, z: seg.z, rotation: seg.rotation }
    : { x: record.cx * CHUNK_SIZE, z: record.cz * CHUNK_SIZE, rotation: 0 };
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
    } else if (
      feature.type === "equipment" ||
      feature.type === "storage" ||
      feature.type === "office"
    ) {
      var tangentX = Math.sin(pos.rotation);
      var tangentZ = Math.cos(pos.rotation);
      var propX = pos.x + tangentX * 2.7;
      var propZ = pos.z + tangentZ * 2.7;
      var isOffice = feature.type === "office";
      var propGeo = new THREE.BoxGeometry(isOffice ? 1.8 : 1.25, isOffice ? 0.76 : 1.45, 0.72);
      record.geometries.push(propGeo);
      addBox(
        record.group,
        propGeo,
        isOffice ? ctx.materials.wood : ctx.materials.rust,
        propX,
        isOffice ? 0.38 : 0.725,
        propZ,
        pos.rotation
      );
      addCollider(
        ctx,
        record,
        createObb(propX, propZ, isOffice ? 0.9 : 0.625, 0.36, -pos.rotation, "obstacle")
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
        chunk.lights[ci].intensity = dark ? 0.04 : 0.95;
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
      if (info.kind === "l2_record") {
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

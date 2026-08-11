/**
 * Level 4 — 无限延伸的现代办公层（流式区块）
 */
import * as THREE from "three";
import { resolveBackroomsGfxProfile } from "./backrooms-gfx-profile.js";
import { createPointLightPool } from "./backrooms-point-light-pool.js";

export const L4_CHUNK_SIZE = 24;
export const L4_WALL_H = 2.75;
export const L4_STREAM_RADIUS = 2;
export const L4_SPAWN_X = 0;
export const L4_SPAWN_Z = 2;

const DESK_W = 1.45;
const DESK_D = 0.72;
const DESK_H = 0.74;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkKey(cx, cz) {
  return cx + "," + cz;
}

function worldToChunk(px, pz) {
  return {
    cx: Math.floor(px / L4_CHUNK_SIZE),
    cz: Math.floor(pz / L4_CHUNK_SIZE),
  };
}

var _voidWindowTex = null;
function voidWindowTexture() {
  if (_voidWindowTex) return _voidWindowTex;
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  var g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0a0c12");
  g.addColorStop(0.45, "#1a2030");
  g.addColorStop(1, "#3a4558");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  var i;
  for (i = 0; i < 1200; i++) {
    ctx.fillStyle = "rgba(200,210,230," + (0.02 + Math.random() * 0.04) + ")";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  _voidWindowTex = new THREE.CanvasTexture(c);
  _voidWindowTex.colorSpace = THREE.SRGBColorSpace;
  return _voidWindowTex;
}

var _mats = null;
var _unitBoxGeo = null;
var _unitPlaneGeo = null;
var _instanceDummy = new THREE.Object3D();

function sharedBoxGeometry() {
  if (!_unitBoxGeo) _unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  return _unitBoxGeo;
}

function sharedPlaneGeometry() {
  if (!_unitPlaneGeo) _unitPlaneGeo = new THREE.PlaneGeometry(1, 1);
  return _unitPlaneGeo;
}

function sharedMaterials() {
  if (_mats) return _mats;
  var voidTex = voidWindowTexture();
  _mats = {
    carpet: new THREE.MeshStandardMaterial({
      color: 0x9a9590,
      roughness: 0.94,
      metalness: 0.02,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: 0xf0f2f5,
      emissive: 0xe8ecf0,
      emissiveIntensity: 0.1,
      roughness: 0.88,
    }),
    lightPanel: new THREE.MeshStandardMaterial({
      color: 0xfffaf0,
      emissive: 0xfff6dc,
      // 远处区块已无自带点光，靠灯板自发光补偿亮度
      emissiveIntensity: 1.05,
      roughness: 0.35,
    }),
    windowFrame: new THREE.MeshStandardMaterial({
      color: 0xc8ccd4,
      roughness: 0.55,
      metalness: 0.15,
    }),
    windowVoid: new THREE.MeshBasicMaterial({
      map: voidTex || undefined,
      color: voidTex ? 0xffffff : 0x121820,
    }),
    desk: new THREE.MeshStandardMaterial({
      color: 0xb8b0a4,
      roughness: 0.72,
      metalness: 0.08,
    }),
    chair: new THREE.MeshStandardMaterial({
      color: 0x2a3038,
      roughness: 0.78,
      metalness: 0.12,
    }),
    monitor: new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.55,
      metalness: 0.15,
    }),
    monitorScreen: new THREE.MeshStandardMaterial({
      color: 0xb4b8c0,
      emissive: 0x888990,
      emissiveIntensity: 0.12,
      roughness: 0.72,
      metalness: 0.05,
    }),
    cabinet: new THREE.MeshStandardMaterial({
      color: 0x707880,
      roughness: 0.65,
      metalness: 0.2,
    }),
    whiteboard: new THREE.MeshStandardMaterial({
      color: 0xf5f8fa,
      roughness: 0.4,
      metalness: 0.05,
    }),
    cooler: new THREE.MeshStandardMaterial({
      color: 0xd8dce4,
      roughness: 0.5,
      metalness: 0.25,
    }),
    coolerLabel: new THREE.MeshStandardMaterial({
      map: waterCoolerLabelTexture() || undefined,
      color: _waterCoolerLabelTex ? 0xffffff : 0x2a3038,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: _waterCoolerLabelTex ? 1 : 0.9,
    }),
    invisiblePick: new THREE.MeshBasicMaterial({ visible: false }),
    shaft: new THREE.MeshStandardMaterial({
      color: 0x889098,
      emissive: 0x334455,
      emissiveIntensity: 0.25,
      metalness: 0.35,
      roughness: 0.55,
    }),
  };
  return _mats;
}

var _waterCoolerLabelTex = null;
function waterCoolerLabelTexture() {
  if (_waterCoolerLabelTex) return _waterCoolerLabelTex;
  var canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(255,255,255,0)";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#2a3038";
  ctx.font = "bold 28px Arial, PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("饮水机", 64, 34);
  _waterCoolerLabelTex = new THREE.CanvasTexture(canvas);
  _waterCoolerLabelTex.colorSpace = THREE.SRGBColorSpace;
  return _waterCoolerLabelTex;
}

function queueInstance(batches, key, geometry, material, x, y, z, sx, sy, sz, rotY, cast, receive) {
  var batch = batches[key];
  if (!batch) {
    batch = batches[key] = {
      geometry: geometry,
      material: material,
      transforms: [],
      castShadow: !!cast,
      receiveShadow: !!receive,
    };
  }
  batch.transforms.push({
    x: x,
    y: y,
    z: z,
    sx: sx,
    sy: sy,
    sz: sz,
    rotY: rotY || 0,
  });
}

function queueBox(batches, key, material, x, y, z, sx, sy, sz, rotY, cast, receive) {
  queueInstance(
    batches,
    key,
    sharedBoxGeometry(),
    material,
    x,
    y,
    z,
    sx,
    sy,
    sz,
    rotY,
    cast,
    receive
  );
}

function queuePlane(batches, key, material, x, y, z, sx, sy, rotY) {
  queueInstance(
    batches,
    key,
    sharedPlaneGeometry(),
    material,
    x,
    y,
    z,
    sx,
    sy,
    1,
    rotY,
    false,
    false
  );
}

function flushInstanceBatches(group, batches) {
  var key;
  for (key in batches) {
    if (!Object.prototype.hasOwnProperty.call(batches, key)) continue;
    var batch = batches[key];
    var count = batch.transforms.length;
    if (!count) continue;
    var mesh = new THREE.InstancedMesh(batch.geometry, batch.material, count);
    mesh.name = "L4Instances_" + key;
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    for (var i = 0; i < count; i++) {
      var tr = batch.transforms[i];
      _instanceDummy.position.set(tr.x, tr.y, tr.z);
      _instanceDummy.rotation.set(0, tr.rotY, 0);
      _instanceDummy.scale.set(tr.sx, tr.sy, tr.sz);
      _instanceDummy.updateMatrix();
      mesh.setMatrixAt(i, _instanceDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
}

function addOfficeMonitor(batches, wx, wy, wz, mats) {
  queueBox(batches, "monitor", mats.monitor, wx, wy, wz, 0.56, 0.42, 0.05, 0, true, false);
  queueBox(
    batches,
    "monitorScreen",
    mats.monitorScreen,
    wx,
    wy,
    wz + 0.028,
    0.46,
    0.34,
    0.018,
    0,
    false,
    false
  );
}

function addChairWithLegs(batches, colliders, wx, wz, mats) {
  var seatY = 0.48;
  var legH = 0.44;
  var legY = legH * 0.5;
  var legMat = mats.chair;
  var offsets = [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ];
  var li;
  for (li = 0; li < offsets.length; li++) {
    queueBox(
      batches,
      "chair",
      legMat,
      wx + offsets[li][0],
      legY,
      wz + 0.62 + offsets[li][1],
      0.07,
      legH,
      0.07,
      0,
      true,
      false
    );
  }

  queueBox(batches, "chair", legMat, wx, seatY, wz + 0.62, 0.52, 0.08, 0.52, 0, true, false);
  pushBoxCollider(
    colliders,
    wx - 0.28,
    wx + 0.28,
    wz + 0.62 - 0.28,
    wz + 0.62 + 0.28
  );
  queueBox(batches, "chair", legMat, wx, 0.78, wz + 0.86, 0.48, 0.55, 0.06, 0, true, false);
  pushBoxCollider(
    colliders,
    wx - 0.26,
    wx + 0.26,
    wz + 0.86 - 0.05,
    wz + 0.86 + 0.05
  );
}

function pushBoxCollider(colliders, minX, maxX, minZ, maxZ, h) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  });
}

function tagShadowMesh(mesh, cast, receive) {
  if (!mesh) return;
  mesh.castShadow = !!cast;
  mesh.receiveShadow = !!receive;
}

/** 区块顶灯只登记候选灯位，真正的点光由 ctx.lightPool 复用最近的几盏 */
function registerChunkCeilingGlow(ctx, ox, oz) {
  var cand = {
    x: ox,
    y: L4_WALL_H - 0.42,
    z: oz,
    intensity: 0.38,
    distance: L4_CHUNK_SIZE * 0.92,
  };
  ctx.lightCandidates.push(cand);
  return cand;
}

function addFluorescentGrid(batches, cx, cz, mats) {
  var ox = cx * L4_CHUNK_SIZE;
  var oz = cz * L4_CHUNK_SIZE;
  var ix;
  var iz;
  for (ix = -1; ix <= 1; ix++) {
    for (iz = -1; iz <= 1; iz++) {
      queueBox(
        batches,
        "lightPanel",
        mats.lightPanel,
        ox + ix * 6.5,
        L4_WALL_H - 0.08,
        oz + iz * 6.5,
        1.85,
        0.06,
        0.42,
        0,
        false,
        false
      );
    }
  }
}

function addWindowWall(batches, colliders, wx, wz, rotY, along, mats) {
  var segLen = 7.2;
  var winH = 1.35;
  var winY = 1.05;
  var frameT = 0.12;
  var i;
  for (i = 0; i < 3; i++) {
    var base = (i - 1) * segLen;
    if (along) {
      queueBox(
        batches,
        "windowFrame",
        mats.windowFrame,
        wx + base,
        winY,
        wz,
        segLen,
        winH + 0.35,
        frameT,
        0,
        false,
        false
      );
      queuePlane(
        batches,
        "windowVoid",
        mats.windowVoid,
        wx + base,
        winY,
        wz + 0.07,
        segLen - 0.35,
        winH,
        rotY
      );
      pushBoxCollider(
        colliders,
        wx + base - segLen * 0.5,
        wx + base + segLen * 0.5,
        wz - 0.2,
        wz + 0.35
      );
    } else {
      queueBox(
        batches,
        "windowFrame",
        mats.windowFrame,
        wx,
        winY,
        wz + base,
        frameT,
        winH + 0.35,
        segLen,
        0,
        false,
        false
      );
      queuePlane(
        batches,
        "windowVoid",
        mats.windowVoid,
        wx + 0.07,
        winY,
        wz + base,
        segLen - 0.35,
        winH,
        rotY
      );
      pushBoxCollider(
        colliders,
        wx - 0.35,
        wx + 0.2,
        wz + base - segLen * 0.5,
        wz + base + segLen * 0.5
      );
    }
  }
}

function addDeskStation(batches, colliders, wx, wz, mats, rng) {
  queueBox(
    batches,
    "desk",
    mats.desk,
    wx,
    DESK_H * 0.5,
    wz,
    DESK_W,
    DESK_H,
    DESK_D,
    0,
    true,
    true
  );
  pushBoxCollider(
    colliders,
    wx - DESK_W * 0.5,
    wx + DESK_W * 0.5,
    wz - DESK_D * 0.5,
    wz + DESK_D * 0.5
  );

  addChairWithLegs(batches, colliders, wx, wz, mats);

  var monY = DESK_H + 0.22;
  var monZ = wz - 0.18;
  addOfficeMonitor(batches, wx, monY, monZ, mats);
  pushBoxCollider(
    colliders,
    wx - 0.28,
    wx + 0.28,
    monZ - 0.04,
    monZ + 0.04
  );

  if (rng() < 0.35) {
    queueBox(
      batches,
      "cabinet",
      mats.cabinet,
      wx + DESK_W * 0.5 + 0.35,
      0.525,
      wz + 0.15,
      0.42,
      1.05,
      0.48,
      0,
      true,
      true
    );
    pushBoxCollider(
      colliders,
      wx + DESK_W * 0.5 + 0.1,
      wx + DESK_W * 0.5 + 0.62,
      wz - 0.1,
      wz + 0.42
    );
  }
}

function addWaterCooler(group, batches, colliders, interactRoots, wx, wz, mats, coolerId) {
  queueBox(batches, "cooler", mats.cooler, wx, 0.575, wz, 0.38, 1.15, 0.38, 0, true, true);
  queuePlane(batches, "coolerLabel", mats.coolerLabel, wx, 0.72, wz + 0.2, 0.32, 0.16, 0);

  pushBoxCollider(colliders, wx - 0.22, wx + 0.22, wz - 0.22, wz + 0.22);

  var pick = new THREE.Mesh(
    sharedBoxGeometry(),
    mats.invisiblePick
  );
  pick.position.set(wx, 0.64, wz);
  pick.scale.set(0.48, 1.28, 0.48);
  pick.userData.brInteract = { kind: "l4_water_cooler", id: coolerId };
  group.add(pick);
  interactRoots.push(pick);
}

function addWhiteboard(batches, colliders, wx, wz, mats) {
  queueBox(
    batches,
    "whiteboard",
    mats.whiteboard,
    wx,
    1.45,
    wz,
    1.6,
    0.9,
    0.05,
    0,
    true,
    false
  );
  pushBoxCollider(colliders, wx - 0.82, wx + 0.82, wz - 0.12, wz + 0.12);
}

function loadChunk(cx, cz, ctx) {
  var key = chunkKey(cx, cz);
  if (ctx.chunks.has(key)) return;

  var mats = sharedMaterials();
  var batches = Object.create(null);
  var group = new THREE.Group();
  group.name = "L4Chunk_" + cx + "_" + cz;
  ctx.chunksRoot.add(group);

  var ox = cx * L4_CHUNK_SIZE;
  var oz = cz * L4_CHUNK_SIZE;
  var half = L4_CHUNK_SIZE * 0.5;

  var floor = new THREE.Mesh(sharedBoxGeometry(), mats.carpet);
  floor.position.set(ox, 0.06, oz);
  floor.scale.set(L4_CHUNK_SIZE, 0.12, L4_CHUNK_SIZE);
  tagShadowMesh(floor, false, true);
  group.add(floor);

  var ceiling = new THREE.Mesh(sharedBoxGeometry(), mats.ceiling);
  ceiling.position.set(ox, L4_WALL_H, oz);
  ceiling.scale.set(L4_CHUNK_SIZE, 0.1, L4_CHUNK_SIZE);
  tagShadowMesh(ceiling, false, false);
  group.add(ceiling);

  var colliders = [];
  var chunkInteractRoots = [];

  addFluorescentGrid(batches, cx, cz, mats);
  var lightCand = registerChunkCeilingGlow(ctx, ox, oz);

  if (Math.abs(cx) % 2 === 0) {
    addWindowWall(batches, colliders, ox - half + 0.15, oz, Math.PI * 0.5, false, mats);
  }
  if (Math.abs(cz) % 2 === 0) {
    addWindowWall(batches, colliders, ox, oz - half + 0.15, 0, true, mats);
  }

  var rng = mulberry32((cx * 73856093) ^ (cz * 19349663));
  var slots = [
    [-6, -5],
    [-6, 2],
    [-6, 8],
    [0, -6],
    [0, 1],
    [0, 7],
    [6, -4],
    [6, 3],
    [6, 8],
  ];
  var si;
  for (si = 0; si < slots.length; si++) {
    if (rng() < 0.12) continue;
    addDeskStation(batches, colliders, ox + slots[si][0], oz + slots[si][1], mats, rng);
  }

  if (rng() < 0.55) {
    var cwx = ox + half - 1.2;
    var cwz = oz - half + 1.2;
    addWaterCooler(
      group,
      batches,
      colliders,
      chunkInteractRoots,
      cwx,
      cwz,
      mats,
      key + "_cooler"
    );
  }
  if (rng() < 0.45) addWhiteboard(batches, colliders, ox - 2, oz + half - 0.2, mats);

  if (cx === 0 && cz === 0) {
    var shaft = new THREE.Mesh(sharedBoxGeometry(), mats.shaft);
    shaft.position.set(ox, 1.3, oz - 1);
    shaft.scale.set(2.1, 2.6, 2.1);
    tagShadowMesh(shaft, true, true);
    group.add(shaft);
    pushBoxCollider(colliders, ox - 1.08, ox + 1.08, oz - 1 - 1.08, oz - 1 + 1.08);
  }

  flushInstanceBatches(group, batches);

  var i;
  for (i = 0; i < chunkInteractRoots.length; i++) {
    ctx.interactRoots.push(chunkInteractRoots[i]);
  }
  for (i = 0; i < colliders.length; i++) ctx.colliders.push(colliders[i]);

  ctx.chunks.set(key, {
    group: group,
    colliders: colliders,
    interactRoots: chunkInteractRoots,
    lightCandidate: lightCand,
  });
}

function disposeChunkMeshResources(group) {
  // 所有固定 geometry/material 都是模块级共享资源；这里只释放 InstancedMesh 的实例缓冲。
  group.traverse(function (child) {
    if (child.isInstancedMesh && child.dispose) child.dispose();
  });
}

function unloadChunk(key, ctx) {
  var record = ctx.chunks.get(key);
  if (!record) return;
  var i;
  if (record.interactRoots) {
    for (i = 0; i < record.interactRoots.length; i++) {
      var ir = record.interactRoots[i];
      var iri = ctx.interactRoots.indexOf(ir);
      if (iri >= 0) ctx.interactRoots.splice(iri, 1);
    }
  }
  for (i = 0; i < record.colliders.length; i++) {
    var c = record.colliders[i];
    var idx = ctx.colliders.indexOf(c);
    if (idx >= 0) ctx.colliders.splice(idx, 1);
  }
  if (record.lightCandidate) {
    var li = ctx.lightCandidates.indexOf(record.lightCandidate);
    if (li >= 0) ctx.lightCandidates.splice(li, 1);
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
  for (dz = -L4_STREAM_RADIUS; dz <= L4_STREAM_RADIUS; dz++) {
    for (dx = -L4_STREAM_RADIUS; dx <= L4_STREAM_RADIUS; dx++) {
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
  for (var i = 0; i < toRemove.length; i++) unloadChunk(toRemove[i], ctx);
}

export function buildLevel4World(root, gfxProfile) {
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level4OfficeChunks";
  root.add(chunksRoot);

  var colliders = [];
  var interactRoots = [];
  var chunks = new Map();
  var ctx = {
    chunksRoot: chunksRoot,
    chunks: chunks,
    colliders: colliders,
    interactRoots: interactRoots,
    lightCandidates: [],
  };

  var ambient = new THREE.AmbientLight(0xf2f4f8, 0.58);
  root.add(ambient);
  var hemi = new THREE.HemisphereLight(0xffffff, 0x9098a0, 0.36);
  root.add(hemi);

  var gfx = gfxProfile || resolveBackroomsGfxProfile();

  var sunLight = new THREE.DirectionalLight(0xfff2e0, 0.52);
  sunLight.position.set(L4_SPAWN_X + 8, 16, L4_SPAWN_Z + 6);
  sunLight.castShadow = gfx.shadows;
  // high=2048 / low=512；正交范围 ±16，光到地面约 19m，far 收至 20
  var mapSize = gfx.shadowMapSize || 1024;
  sunLight.shadow.mapSize.set(mapSize, mapSize);
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.02;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 20;
  var shCam = sunLight.shadow.camera;
  shCam.left = -16;
  shCam.right = 16;
  shCam.top = 16;
  shCam.bottom = -16;
  shCam.updateProjectionMatrix();
  root.add(sunLight);
  root.add(sunLight.target);

  var followKey = new THREE.PointLight(0xfff0d8, 0.62, 11, 1.5);
  var followFill = new THREE.PointLight(0xc8d0e0, 0.2, 7.5, 1.85);
  root.add(followKey);
  root.add(followFill);

  // 两盏跟随灯已占掉预算，剩下的额度给区块顶灯池
  var ceilingPool = createPointLightPool(root, {
    count: Math.max(1, gfx.pointLightBudget - 2),
    color: 0xfff6dc,
    distance: L4_CHUNK_SIZE * 0.92,
    decay: 1.4,
    y: L4_WALL_H - 0.42,
    name: "Level4CeilingPooledLight",
  });

  updateStreaming(L4_SPAWN_X, L4_SPAWN_Z, ctx);

  function syncLighting(px, pz) {
    sunLight.position.set(px + 10, 15, pz + 7);
    sunLight.target.position.set(px, 0, pz);
    sunLight.target.updateMatrixWorld();
    followKey.position.set(px, 2.15, pz);
    followFill.position.set(px + 0.35, 2.75, pz + 0.45);
    ceilingPool.update(px, pz, ctx.lightCandidates);
  }
  syncLighting(L4_SPAWN_X, L4_SPAWN_Z);

  return {
    update: function (px, pz) {
      updateStreaming(px, pz, ctx);
      syncLighting(px, pz);
    },
    dispose: function () {
      var keys = [];
      chunks.forEach(function (_r, k) {
        keys.push(k);
      });
      var i;
      for (i = 0; i < keys.length; i++) unloadChunk(keys[i], ctx);
      ceilingPool.dispose();
      if (chunksRoot.parent) chunksRoot.parent.remove(chunksRoot);
    },
    colliders: colliders,
    interactRoots: interactRoots,
    spawnX: L4_SPAWN_X,
    spawnZ: L4_SPAWN_Z,
  };
}

/**
 * Level 4 — 无限延伸的现代办公层（流式区块）
 */
import * as THREE from "three";

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
      emissiveIntensity: 0.15,
      roughness: 0.88,
    }),
    lightPanel: new THREE.MeshStandardMaterial({
      color: 0xfffaf0,
      emissive: 0xfff6dc,
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
      color: 0x1a1a1e,
      emissive: 0x050508,
      emissiveIntensity: 0.08,
      roughness: 0.6,
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
  };
  return _mats;
}

var _deskGeo = null;
var _chairSeatGeo = null;
var _monitorGeo = null;

function pushBoxCollider(colliders, minX, maxX, minZ, maxZ, h) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  });
}

function addFluorescentGrid(group, cx, cz, mats) {
  var panelGeo = new THREE.BoxGeometry(1.85, 0.06, 0.42);
  var ox = cx * L4_CHUNK_SIZE;
  var oz = cz * L4_CHUNK_SIZE;
  var ix;
  var iz;
  for (ix = -1; ix <= 1; ix++) {
    for (iz = -1; iz <= 1; iz++) {
      var panel = new THREE.Mesh(panelGeo, mats.lightPanel);
      panel.position.set(ox + ix * 6.5, L4_WALL_H - 0.08, oz + iz * 6.5);
      group.add(panel);
    }
  }
}

function addWindowWall(group, colliders, wx, wz, rotY, along, mats) {
  var segLen = 7.2;
  var winH = 1.35;
  var winY = 1.05;
  var frameT = 0.12;
  var i;
  for (i = 0; i < 3; i++) {
    var base = (i - 1) * segLen;
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(along ? segLen : frameT, winH + 0.35, along ? frameT : segLen),
      mats.windowFrame
    );
    var voidPane = new THREE.Mesh(new THREE.PlaneGeometry(segLen - 0.35, winH), mats.windowVoid);
    if (along) {
      frame.position.set(wx + base, winY, wz);
      voidPane.position.set(wx + base, winY, wz + 0.07);
      voidPane.rotation.y = rotY;
      pushBoxCollider(
        colliders,
        wx + base - segLen * 0.5,
        wx + base + segLen * 0.5,
        wz - 0.2,
        wz + 0.35
      );
    } else {
      frame.position.set(wx, winY, wz + base);
      voidPane.position.set(wx + 0.07, winY, wz + base);
      voidPane.rotation.y = rotY;
      pushBoxCollider(
        colliders,
        wx - 0.35,
        wx + 0.2,
        wz + base - segLen * 0.5,
        wz + base + segLen * 0.5
      );
    }
    group.add(frame);
    group.add(voidPane);
  }
}

function addDeskStation(group, colliders, wx, wz, mats, rng) {
  if (!_deskGeo) _deskGeo = new THREE.BoxGeometry(DESK_W, DESK_H, DESK_D);
  if (!_chairSeatGeo) _chairSeatGeo = new THREE.BoxGeometry(0.52, 0.08, 0.52);
  if (!_monitorGeo) _monitorGeo = new THREE.BoxGeometry(0.52, 0.38, 0.04);

  var desk = new THREE.Mesh(_deskGeo, mats.desk);
  desk.position.set(wx, DESK_H * 0.5, wz);
  group.add(desk);
  pushBoxCollider(
    colliders,
    wx - DESK_W * 0.5,
    wx + DESK_W * 0.5,
    wz - DESK_D * 0.5,
    wz + DESK_D * 0.5
  );

  var chair = new THREE.Mesh(_chairSeatGeo, mats.chair);
  chair.position.set(wx, 0.48, wz + 0.62);
  group.add(chair);
  pushBoxCollider(
    colliders,
    wx - 0.28,
    wx + 0.28,
    wz + 0.62 - 0.28,
    wz + 0.62 + 0.28
  );
  var chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.06), mats.chair);
  chairBack.position.set(wx, 0.78, wz + 0.86);
  group.add(chairBack);
  pushBoxCollider(
    colliders,
    wx - 0.26,
    wx + 0.26,
    wz + 0.86 - 0.05,
    wz + 0.86 + 0.05
  );

  var mon = new THREE.Mesh(_monitorGeo, mats.monitor);
  mon.position.set(wx, DESK_H + 0.22, wz - 0.18);
  group.add(mon);
  pushBoxCollider(
    colliders,
    wx - 0.28,
    wx + 0.28,
    wz - 0.18 - 0.04,
    wz - 0.18 + 0.04
  );

  if (rng() < 0.35) {
    var cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.48), mats.cabinet);
    cab.position.set(wx + DESK_W * 0.5 + 0.35, 0.525, wz + 0.15);
    group.add(cab);
    pushBoxCollider(
      colliders,
      wx + DESK_W * 0.5 + 0.1,
      wx + DESK_W * 0.5 + 0.62,
      wz - 0.1,
      wz + 0.42
    );
  }
}

function addWaterCooler(group, colliders, interactRoots, wx, wz, mats, coolerId) {
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.15, 0.38), mats.cooler);
  body.position.set(wx, 0.575, wz);
  group.add(body);
  pushBoxCollider(colliders, wx - 0.22, wx + 0.22, wz - 0.22, wz + 0.22);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 1.28, 0.48),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(wx, 0.64, wz);
  pick.userData.brInteract = { kind: "l4_water_cooler", id: coolerId };
  group.add(pick);
  interactRoots.push(pick);
}

function addWhiteboard(group, colliders, wx, wz, mats) {
  var board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), mats.whiteboard);
  board.position.set(wx, 1.45, wz);
  group.add(board);
  pushBoxCollider(colliders, wx - 0.82, wx + 0.82, wz - 0.12, wz + 0.12);
}

function loadChunk(cx, cz, ctx) {
  var key = chunkKey(cx, cz);
  if (ctx.chunks.has(key)) return;

  var mats = sharedMaterials();
  var group = new THREE.Group();
  group.name = "L4Chunk_" + cx + "_" + cz;
  ctx.chunksRoot.add(group);

  var ox = cx * L4_CHUNK_SIZE;
  var oz = cz * L4_CHUNK_SIZE;
  var half = L4_CHUNK_SIZE * 0.5;

  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(L4_CHUNK_SIZE, 0.12, L4_CHUNK_SIZE),
    mats.carpet
  );
  floor.position.set(ox, 0.06, oz);
  group.add(floor);

  var ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(L4_CHUNK_SIZE, 0.1, L4_CHUNK_SIZE),
    mats.ceiling
  );
  ceiling.position.set(ox, L4_WALL_H, oz);
  group.add(ceiling);

  var colliders = [];
  var chunkInteractRoots = [];

  addFluorescentGrid(group, cx, cz, mats);

  if (Math.abs(cx) % 2 === 0) {
    addWindowWall(group, colliders, ox - half + 0.15, oz, Math.PI * 0.5, false, mats);
  }
  if (Math.abs(cz) % 2 === 0) {
    addWindowWall(group, colliders, ox, oz - half + 0.15, 0, true, mats);
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
    addDeskStation(group, colliders, ox + slots[si][0], oz + slots[si][1], mats, rng);
  }

  if (rng() < 0.55) {
    var cwx = ox + half - 1.2;
    var cwz = oz - half + 1.2;
    addWaterCooler(group, colliders, chunkInteractRoots, cwx, cwz, mats, key + "_cooler");
  }
  if (rng() < 0.45) addWhiteboard(group, colliders, ox - 2, oz + half - 0.2, mats);

  if (cx === 0 && cz === 0) {
    var shaft = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 2.6, 2.1),
      new THREE.MeshStandardMaterial({
        color: 0x889098,
        emissive: 0x334455,
        emissiveIntensity: 0.25,
        metalness: 0.35,
        roughness: 0.55,
      })
    );
    shaft.position.set(ox, 1.3, oz - 1);
    group.add(shaft);
    pushBoxCollider(colliders, ox - 1.08, ox + 1.08, oz - 1 - 1.08, oz - 1 + 1.08);
  }

  var i;
  for (i = 0; i < chunkInteractRoots.length; i++) {
    ctx.interactRoots.push(chunkInteractRoots[i]);
  }
  for (i = 0; i < colliders.length; i++) ctx.colliders.push(colliders[i]);

  ctx.chunks.set(key, { group: group, colliders: colliders, interactRoots: chunkInteractRoots });
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
  if (record.group.parent) record.group.parent.remove(record.group);
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

export function buildLevel4World(root) {
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
  };

  var ambient = new THREE.AmbientLight(0xf2f4f8, 0.92);
  root.add(ambient);
  var hemi = new THREE.HemisphereLight(0xffffff, 0x9098a0, 0.48);
  root.add(hemi);

  updateStreaming(L4_SPAWN_X, L4_SPAWN_Z, ctx);

  return {
    update: function (px, pz) {
      updateStreaming(px, pz, ctx);
    },
    dispose: function () {
      var keys = [];
      chunks.forEach(function (_r, k) {
        keys.push(k);
      });
      var i;
      for (i = 0; i < keys.length; i++) unloadChunk(keys[i], ctx);
      if (chunksRoot.parent) chunksRoot.parent.remove(chunksRoot);
    },
    colliders: colliders,
    interactRoots: interactRoots,
    spawnX: L4_SPAWN_X,
    spawnZ: L4_SPAWN_Z,
  };
}

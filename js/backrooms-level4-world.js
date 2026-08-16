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
    stair: new THREE.MeshStandardMaterial({
      color: 0x6e6558,
      roughness: 0.82,
      metalness: 0.08,
    }),
    stairRail: new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.55,
      metalness: 0.35,
    }),
    stairVoid: new THREE.MeshBasicMaterial({
      color: 0x050608,
    }),
    vending: new THREE.MeshStandardMaterial({
      color: 0xc45a4a,
      roughness: 0.45,
      metalness: 0.28,
    }),
    vendingGlass: new THREE.MeshStandardMaterial({
      color: 0x9ec4d8,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      metalness: 0.1,
      depthWrite: false,
    }),
    vendingLabel: new THREE.MeshStandardMaterial({
      map: vendingLabelTexture() || undefined,
      color: _vendingLabelTex ? 0xffffff : 0x222222,
      roughness: 0.7,
      metalness: 0,
    }),
  };
  return _mats;
}

var _vendingLabelTex = null;
function vendingLabelTexture() {
  if (_vendingLabelTex) return _vendingLabelTex;
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = "#c45a4a";
  ctx.fillRect(0, 0, 256, 10);
  ctx.fillRect(0, 86, 256, 10);
  ctx.fillStyle = "#1a1c20";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("自动售货机", 128, 50);
  _vendingLabelTex = new THREE.CanvasTexture(canvas);
  _vendingLabelTex.colorSpace = THREE.SRGBColorSpace;
  return _vendingLabelTex;
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

/** 出生区块自动售货机 → Level 6.1 */
function addVendingMachineToL61(group, colliders, interactRoots, vx, vz, mats) {
  var body = new THREE.Mesh(sharedBoxGeometry(), mats.vending);
  body.position.set(vx, 1.05, vz);
  body.scale.set(1.15, 2.1, 0.85);
  tagShadowMesh(body, true, true);
  group.add(body);

  var glass = new THREE.Mesh(sharedBoxGeometry(), mats.vendingGlass);
  glass.position.set(vx, 1.15, vz + 0.4);
  glass.scale.set(0.9, 1.45, 0.06);
  group.add(glass);

  var label = new THREE.Mesh(sharedBoxGeometry(), mats.vendingLabel);
  label.position.set(vx, 2.05, vz + 0.44);
  label.scale.set(0.95, 0.28, 0.04);
  group.add(label);

  // 窗口里几排“零食”色块
  var snackColors = [0xe85d4c, 0xf0c040, 0x4caf7a, 0x5b7fd6];
  var r;
  var c;
  for (r = 0; r < 3; r++) {
    for (c = 0; c < 3; c++) {
      var snack = new THREE.Mesh(
        sharedBoxGeometry(),
        new THREE.MeshStandardMaterial({
          color: snackColors[(r + c) % snackColors.length],
          roughness: 0.6,
        })
      );
      snack.position.set(vx - 0.28 + c * 0.28, 0.75 + r * 0.38, vz + 0.28);
      snack.scale.set(0.2, 0.22, 0.16);
      group.add(snack);
    }
  }

  pushBoxCollider(colliders, vx - 0.62, vx + 0.62, vz - 0.48, vz + 0.48);

  var pick = new THREE.Mesh(sharedBoxGeometry(), mats.invisiblePick);
  pick.position.set(vx, 1.1, vz);
  pick.scale.set(1.35, 2.3, 1.1);
  pick.userData.brInteract = { kind: "l4_vending_l61" };
  group.add(pick);
  interactRoots.push(pick);
}

/** 出生区块向下楼梯 → Level 6 */
function addStairsDownToL6(group, colliders, interactRoots, sx, sz, mats) {
  var hole = new THREE.Mesh(sharedBoxGeometry(), mats.stairVoid);
  hole.position.set(sx, 0.02, sz);
  hole.scale.set(2.4, 0.08, 3.4);
  group.add(hole);

  var step;
  for (step = 0; step < 6; step++) {
    var tread = new THREE.Mesh(sharedBoxGeometry(), mats.stair);
    tread.position.set(sx, -0.18 - step * 0.22, sz - 1.1 + step * 0.42);
    tread.scale.set(1.8, 0.14, 0.4);
    tagShadowMesh(tread, true, true);
    group.add(tread);
  }

  var railL = new THREE.Mesh(sharedBoxGeometry(), mats.stairRail);
  railL.position.set(sx - 1.05, 0.55, sz);
  railL.scale.set(0.08, 1.1, 3.2);
  tagShadowMesh(railL, true, false);
  group.add(railL);
  var railR = new THREE.Mesh(sharedBoxGeometry(), mats.stairRail);
  railR.position.set(sx + 1.05, 0.55, sz);
  railR.scale.set(0.08, 1.1, 3.2);
  tagShadowMesh(railR, true, false);
  group.add(railR);

  pushBoxCollider(colliders, sx - 1.2, sx - 0.95, sz - 1.7, sz + 1.7);
  pushBoxCollider(colliders, sx + 0.95, sx + 1.2, sz - 1.7, sz + 1.7);

  var pick = new THREE.Mesh(sharedBoxGeometry(), mats.invisiblePick);
  pick.position.set(sx, 0.7, sz);
  pick.scale.set(2.2, 1.5, 3.2);
  pick.userData.brInteract = { kind: "l4_stairs_down" };
  group.add(pick);
  interactRoots.push(pick);
}

var _megL4SignTex = null;
function megL4SignTexture() {
  if (_megL4SignTex) return _megL4SignTex;
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#183d64";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#8fc5ec";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = "#eef8ff";
  ctx.font = "bold 42px Arial, PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("M.E.G · LEVEL 4 前哨站", 256, 64);
  _megL4SignTex = new THREE.CanvasTexture(canvas);
  _megL4SignTex.colorSpace = THREE.SRGBColorSpace;
  return _megL4SignTex;
}

/** 出生区东侧固定区块：空置的 M.E.G Level 4 任务前哨站 + B.N.T.G 联络员 */
function addMegL4Outpost(group, batches, colliders, interactRoots, ox, oz, mats) {
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.86 });
  var blueMat = new THREE.MeshStandardMaterial({ color: 0x214f7a, roughness: 0.68 });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x26313b, roughness: 0.75 });
  var skinMat = new THREE.MeshStandardMaterial({ color: 0xc89a76, roughness: 0.82 });
  var signMat = new THREE.MeshStandardMaterial({
    map: megL4SignTexture() || undefined,
    color: 0xffffff,
    roughness: 0.55,
  });
  var minX = ox - 9;
  var maxX = ox + 9;
  var minZ = oz - 8;
  var maxZ = oz + 8;
  var wallT = 0.22;

  // 西墙留 3 米入口，其余三面封闭。
  queueBox(batches, "megWall", wallMat, minX, 1.35, oz - 5.4, wallT, 2.7, 5.2, 0, true, true);
  queueBox(batches, "megWall", wallMat, minX, 1.35, oz + 5.4, wallT, 2.7, 5.2, 0, true, true);
  queueBox(batches, "megWall", wallMat, maxX, 1.35, oz, wallT, 2.7, 16, 0, true, true);
  queueBox(batches, "megWall", wallMat, ox, 1.35, minZ, 18, 2.7, wallT, 0, true, true);
  queueBox(batches, "megWall", wallMat, ox, 1.35, maxZ, 18, 2.7, wallT, 0, true, true);
  pushBoxCollider(colliders, minX - 0.2, minX + 0.2, minZ, oz - 2.8);
  pushBoxCollider(colliders, minX - 0.2, minX + 0.2, oz + 2.8, maxZ);
  pushBoxCollider(colliders, maxX - 0.2, maxX + 0.2, minZ, maxZ);
  pushBoxCollider(colliders, minX, maxX, minZ - 0.2, minZ + 0.2);
  pushBoxCollider(colliders, minX, maxX, maxZ - 0.2, maxZ + 0.2);

  var sign = new THREE.Mesh(sharedBoxGeometry(), signMat);
  sign.position.set(minX + 0.13, 2.05, oz);
  sign.scale.set(0.08, 0.6, 3.6);
  group.add(sign);

  // 任务发布台目前空置。
  queueBox(batches, "megDesk", darkMat, ox + 4.8, 0.55, oz, 1.0, 1.1, 7.5, 0, true, true);
  pushBoxCollider(colliders, ox + 4.25, ox + 5.35, oz - 3.8, oz + 3.8);
  var board = new THREE.Mesh(sharedBoxGeometry(), blueMat);
  board.position.set(maxX - 0.18, 1.55, oz);
  board.scale.set(0.08, 1.3, 5.8);
  group.add(board);

  // B.N.T.G 联络员。
  var npc = new THREE.Group();
  npc.name = "L4BntgLiaison";
  npc.position.set(ox + 1.8, 0, oz);
  npc.userData.brInteract = { kind: "l4_bntg_liaison" };
  var legs = new THREE.Mesh(sharedBoxGeometry(), darkMat);
  legs.position.y = 0.48;
  legs.scale.set(0.42, 0.95, 0.34);
  npc.add(legs);
  var torso = new THREE.Mesh(sharedBoxGeometry(), blueMat);
  torso.position.y = 1.18;
  torso.scale.set(0.68, 0.75, 0.38);
  npc.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), skinMat);
  head.position.y = 1.82;
  npc.add(head);
  var badge = new THREE.Mesh(sharedBoxGeometry(), mats.lightPanel);
  badge.position.set(0.22, 1.27, 0.21);
  badge.scale.set(0.16, 0.1, 0.025);
  npc.add(badge);
  var pick = new THREE.Mesh(sharedBoxGeometry(), mats.invisiblePick);
  pick.position.y = 1.05;
  pick.scale.set(0.9, 2.2, 0.9);
  npc.add(pick);
  group.add(npc);
  interactRoots.push(npc);
  pushBoxCollider(colliders, ox + 1.4, ox + 2.2, oz - 0.4, oz + 0.4);
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

  var isMegOutpost = cx === 1 && cz === 0;
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
    if (isMegOutpost || rng() < 0.12) continue;
    addDeskStation(batches, colliders, ox + slots[si][0], oz + slots[si][1], mats, rng);
  }

  if (!isMegOutpost && rng() < 0.55) {
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
  if (!isMegOutpost && rng() < 0.45) {
    addWhiteboard(batches, colliders, ox - 2, oz + half - 0.2, mats);
  }

  if (isMegOutpost) {
    addMegL4Outpost(group, batches, colliders, chunkInteractRoots, ox, oz, mats);
  }

  if (cx === 0 && cz === 0) {
    var shaft = new THREE.Mesh(sharedBoxGeometry(), mats.shaft);
    shaft.position.set(ox, 1.3, oz - 1);
    shaft.scale.set(2.1, 2.6, 2.1);
    tagShadowMesh(shaft, true, true);
    group.add(shaft);
    pushBoxCollider(colliders, ox - 1.08, ox + 1.08, oz - 1 - 1.08, oz - 1 + 1.08);
    // 电梯井东侧：通往 Level 6 的向下楼梯
    addStairsDownToL6(group, colliders, chunkInteractRoots, ox + 4.2, oz + 1.2, mats);
    // 出生区西侧：写着“自动售货机”，Q 切入 Level 6.1
    addVendingMachineToL61(group, colliders, chunkInteractRoots, ox - 8.2, oz + 3.5, mats);
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

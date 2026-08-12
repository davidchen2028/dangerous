/**
 * Level 9 — 明亮、无限延伸的郊区道路（沿 +Z 前进）
 */
import * as THREE from "three";

export const L9_SPAWN_X = 0;
export const L9_SPAWN_Z = 0;
export const L9_SPAWN_YAW = 0;
export const L9_L10_Z = 50;
export const L9_L11_Z = 100;

const SEGMENT_LEN = 40;
const STREAM_RADIUS = 3;
const ROAD_W = 8;
const SIDEWALK_W = 2.2;
const WORLD_W = 70;

var _geo = null;
var _mats = null;

function sharedGeometry() {
  if (_geo) return _geo;
  _geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  return _geo;
}

function sharedMaterials() {
  if (_mats) return _mats;
  _mats = {
    grass: new THREE.MeshStandardMaterial({ color: 0x6f9d55, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x555b60, roughness: 0.94 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0xc8c7bd, roughness: 0.92 }),
    curb: new THREE.MeshStandardMaterial({ color: 0xe2ded0, roughness: 0.86 }),
    stripe: new THREE.MeshStandardMaterial({
      color: 0xffefaa,
      emissive: 0x544718,
      emissiveIntensity: 0.12,
      roughness: 0.72,
    }),
    houseA: new THREE.MeshStandardMaterial({ color: 0xe7d6bd, roughness: 0.86 }),
    houseB: new THREE.MeshStandardMaterial({ color: 0xbfd4df, roughness: 0.86 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x774f42, roughness: 0.94 }),
    window: new THREE.MeshStandardMaterial({
      color: 0xbfe7ff,
      emissive: 0x80b9d0,
      emissiveIntensity: 0.25,
      roughness: 0.35,
    }),
  };
  return _mats;
}

function addBox(group, mat, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(sharedGeometry().box, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function addHouse(group, x, z, side, variant) {
  var mats = sharedMaterials();
  var bodyMat = variant ? mats.houseA : mats.houseB;
  addBox(group, bodyMat, x, 2.1, z, 7.5, 4.2, 6.2);
  var roof = new THREE.Mesh(
    new THREE.ConeGeometry(5.2, 2.2, 4),
    mats.roof
  );
  roof.position.set(x, 5.25, z);
  roof.rotation.y = Math.PI * 0.25;
  group.add(roof);
  addBox(group, mats.window, x - side * 3.78, 2.35, z - 1.35, 0.06, 1.25, 1.5);
  addBox(group, mats.window, x - side * 3.78, 2.35, z + 1.35, 0.06, 1.25, 1.5);
}

function addRoadSegment(root, index) {
  var mats = sharedMaterials();
  var group = new THREE.Group();
  group.name = "L9RoadSegment_" + index;
  var z = index * SEGMENT_LEN;

  addBox(group, mats.grass, 0, -0.12, z, WORLD_W, 0.2, SEGMENT_LEN + 0.2);
  addBox(group, mats.road, 0, 0.01, z, ROAD_W, 0.12, SEGMENT_LEN + 0.2);
  addBox(
    group,
    mats.sidewalk,
    -(ROAD_W + SIDEWALK_W) * 0.5,
    0.1,
    z,
    SIDEWALK_W,
    0.18,
    SEGMENT_LEN + 0.2
  );
  addBox(
    group,
    mats.sidewalk,
    (ROAD_W + SIDEWALK_W) * 0.5,
    0.1,
    z,
    SIDEWALK_W,
    0.18,
    SEGMENT_LEN + 0.2
  );
  addBox(group, mats.curb, -ROAD_W * 0.5, 0.13, z, 0.18, 0.24, SEGMENT_LEN);
  addBox(group, mats.curb, ROAD_W * 0.5, 0.13, z, 0.18, 0.24, SEGMENT_LEN);

  var lineZ;
  for (lineZ = z - SEGMENT_LEN * 0.5 + 2; lineZ < z + SEGMENT_LEN * 0.5; lineZ += 7) {
    addBox(group, mats.stripe, 0, 0.085, lineZ, 0.15, 0.025, 3.4);
  }

  var houseOffset;
  for (houseOffset = -14; houseOffset <= 14; houseOffset += 14) {
    var serial = index * 11 + houseOffset;
    addHouse(group, -14.5, z + houseOffset, -1, (serial & 1) === 0);
    var rightHouseZ = z + houseOffset + 4;
    // 50 米处给通往 L10 的右侧人行道留出完整出口
    if (Math.abs(rightHouseZ - L9_L10_Z) > 8) {
      addHouse(group, 14.5, rightHouseZ, 1, (serial & 2) === 0);
    }
  }

  root.add(group);
  return group;
}

function buildLevel10Sidewalk(root) {
  var mats = sharedMaterials();
  var group = new THREE.Group();
  group.name = "L9Level10Sidewalk";
  addBox(group, mats.sidewalk, 12, 0.105, L9_L10_Z, 16, 0.19, 2.6);
  addBox(group, mats.curb, 12, 0.13, L9_L10_Z - 1.3, 16, 0.22, 0.16);
  addBox(group, mats.curb, 12, 0.13, L9_L10_Z + 1.3, 16, 0.22, 0.16);
  root.add(group);
}

export function buildLevel9World(root) {
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level9InfiniteRoad";
  root.add(chunksRoot);
  var chunks = new Map();

  buildLevel10Sidewalk(root);

  var hemi = new THREE.HemisphereLight(0xeaf7ff, 0x72925c, 1.35);
  root.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff4d2, 1.65);
  sun.position.set(-22, 34, -18);
  sun.castShadow = false;
  root.add(sun);
  root.add(new THREE.AmbientLight(0xffffff, 0.42));

  function updateStreaming(pz) {
    var center = Math.floor(pz / SEGMENT_LEN);
    var wanted = Object.create(null);
    var i;
    for (i = center - STREAM_RADIUS; i <= center + STREAM_RADIUS; i++) {
      wanted[i] = true;
      if (!chunks.has(i)) chunks.set(i, addRoadSegment(chunksRoot, i));
    }
    var remove = [];
    chunks.forEach(function (_group, key) {
      if (!wanted[key]) remove.push(key);
    });
    for (i = 0; i < remove.length; i++) {
      var old = chunks.get(remove[i]);
      if (old && old.parent) old.parent.remove(old);
      chunks.delete(remove[i]);
    }
  }

  updateStreaming(L9_SPAWN_Z);

  return {
    spawnX: L9_SPAWN_X,
    spawnZ: L9_SPAWN_Z,
    spawnYaw: L9_SPAWN_YAW,
    colliders: [],
    update: function (_px, pz) {
      updateStreaming(pz);
    },
    isLevel10Exit: function (px, pz) {
      return px >= 18 && Math.abs(pz - L9_L10_Z) <= 1.8;
    },
    isLevel11Exit: function (_px, pz) {
      return pz >= L9_L11_Z;
    },
  };
}

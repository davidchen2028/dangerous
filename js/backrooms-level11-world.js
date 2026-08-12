/**
 * Level 11 — 无限延伸的城市街道。
 * 沿 Z 轴流式生成；楼体有实体碰撞，楼后以空气墙封住不可见区域。
 */
import * as THREE from "three";

const SEGMENT_LEN = 48;
const STREAM_RADIUS = 3;
const CITY_HALF_W = 34;
const ROAD_W = 13;
const SIDEWALK_W = 4;
const BUILDING_X = 23;
const BUILDING_W = 16;
const BUILDING_D = 14;
const BACK_WALL_THICKNESS = 1;
const BACK_WALL_X = BUILDING_X + BUILDING_W * 0.5;

var _boxGeo = null;
var _materials = null;

function boxGeometry() {
  if (!_boxGeo) _boxGeo = new THREE.BoxGeometry(1, 1, 1);
  return _boxGeo;
}

function materials() {
  if (_materials) return _materials;
  _materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x50565d, roughness: 0.94 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0xbfc1bd, roughness: 0.9 }),
    curb: new THREE.MeshStandardMaterial({ color: 0xd8d7cf, roughness: 0.86 }),
    stripe: new THREE.MeshStandardMaterial({
      color: 0xf2e7ad,
      emissive: 0x504615,
      emissiveIntensity: 0.1,
      roughness: 0.75,
    }),
    buildingA: new THREE.MeshStandardMaterial({ color: 0x929da8, roughness: 0.84 }),
    buildingB: new THREE.MeshStandardMaterial({ color: 0xb4a895, roughness: 0.87 }),
    buildingC: new THREE.MeshStandardMaterial({ color: 0x858b91, roughness: 0.82 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xa9d8ee,
      emissive: 0x426a7d,
      emissiveIntensity: 0.22,
      roughness: 0.3,
    }),
  };
  return _materials;
}

function addBox(group, material, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(boxGeometry(), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

function collider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBuilding(group, entries, x, z, side, serial) {
  var mats = materials();
  var height = 10 + (Math.abs(serial * 7) % 4) * 3;
  var bodyMats = [mats.buildingA, mats.buildingB, mats.buildingC];
  addBox(
    group,
    bodyMats[Math.abs(serial) % bodyMats.length],
    x,
    height * 0.5,
    z,
    BUILDING_W,
    height,
    BUILDING_D
  );
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );

  // 面向街道的窗带。
  var facadeX = x - side * (BUILDING_W * 0.5 + 0.045);
  var floorY;
  for (floorY = 3; floorY < height - 1; floorY += 3) {
    addBox(group, mats.glass, facadeX, floorY, z, 0.08, 1.45, BUILDING_D - 2.2);
  }
}

function addSegment(root, index) {
  var mats = materials();
  var group = new THREE.Group();
  group.name = "L11CitySegment_" + index;
  var z = index * SEGMENT_LEN;
  var entries = [];

  addBox(group, mats.sidewalk, 0, -0.13, z, CITY_HALF_W * 2, 0.2, SEGMENT_LEN + 0.3);
  addBox(group, mats.road, 0, 0, z, ROAD_W, 0.12, SEGMENT_LEN + 0.3);
  var walkX = (ROAD_W + SIDEWALK_W) * 0.5;
  addBox(group, mats.sidewalk, -walkX, 0.08, z, SIDEWALK_W, 0.18, SEGMENT_LEN + 0.3);
  addBox(group, mats.sidewalk, walkX, 0.08, z, SIDEWALK_W, 0.18, SEGMENT_LEN + 0.3);
  addBox(group, mats.curb, -ROAD_W * 0.5, 0.13, z, 0.2, 0.24, SEGMENT_LEN);
  addBox(group, mats.curb, ROAD_W * 0.5, 0.13, z, 0.2, 0.24, SEGMENT_LEN);

  var stripeZ;
  for (stripeZ = z - SEGMENT_LEN * 0.5 + 3; stripeZ < z + SEGMENT_LEN * 0.5; stripeZ += 8) {
    addBox(group, mats.stripe, 0, 0.075, stripeZ, 0.16, 0.025, 4);
  }

  var rowZ;
  for (rowZ = z - 16; rowZ <= z + 16; rowZ += 16) {
    var serial = index * 13 + Math.round((rowZ - z) / 16);
    addBuilding(group, entries, -BUILDING_X, rowZ, -1, serial);
    addBuilding(group, entries, BUILDING_X, rowZ + 7, 1, serial + 5);
  }

  // 楼后空气墙：阻止玩家进入未生成、不可见的楼后空间。
  entries.push(
    collider(
      -BACK_WALL_X - BACK_WALL_THICKNESS,
      -BACK_WALL_X,
      z - SEGMENT_LEN * 0.5,
      z + SEGMENT_LEN * 0.5
    )
  );
  entries.push(
    collider(
      BACK_WALL_X,
      BACK_WALL_X + BACK_WALL_THICKNESS,
      z - SEGMENT_LEN * 0.5,
      z + SEGMENT_LEN * 0.5
    )
  );

  root.add(group);
  return { group: group, colliders: entries };
}

export function buildLevel11World(root) {
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level11InfiniteCity";
  root.add(chunksRoot);
  var chunks = new Map();
  var activeColliders = [];

  root.add(new THREE.HemisphereLight(0xeef8ff, 0x68727d, 1.35));
  var sun = new THREE.DirectionalLight(0xfff2d5, 1.45);
  sun.position.set(-20, 32, -16);
  root.add(sun);
  root.add(new THREE.AmbientLight(0xffffff, 0.32));

  function rebuildColliders() {
    activeColliders.length = 0;
    chunks.forEach(function (chunk) {
      Array.prototype.push.apply(activeColliders, chunk.colliders);
    });
  }

  function updateStreaming(pz) {
    var center = Math.floor(pz / SEGMENT_LEN);
    var wanted = Object.create(null);
    var changed = false;
    var i;
    for (i = center - STREAM_RADIUS; i <= center + STREAM_RADIUS; i++) {
      wanted[i] = true;
      if (!chunks.has(i)) {
        chunks.set(i, addSegment(chunksRoot, i));
        changed = true;
      }
    }
    var remove = [];
    chunks.forEach(function (_chunk, key) {
      if (!wanted[key]) remove.push(key);
    });
    for (i = 0; i < remove.length; i++) {
      var old = chunks.get(remove[i]);
      if (old && old.group.parent) old.group.parent.remove(old.group);
      chunks.delete(remove[i]);
      changed = true;
    }
    if (changed) rebuildColliders();
  }

  updateStreaming(0);
  return {
    colliders: activeColliders,
    update: function (_px, pz) {
      updateStreaming(pz);
    },
  };
}

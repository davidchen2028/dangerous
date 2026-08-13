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
const L13_HIGHRISE_X = BUILDING_X;
const L13_HIGHRISE_Z = 7;
/** 沙子房间：左侧街，停留后晕倒进入 Level 48 */
const L48_SAND_X = -BUILDING_X;
const L48_SAND_Z = -16;
/** Alom Wotor 水上商店：左侧街，进门进入 Level 119 */
const L119_SHOP_X = -BUILDING_X;
const L119_SHOP_Z = 0;
/** 出生点（0,0）旁的 M.E.G 工作人员 */
const STAFF_X = 0.9;
const STAFF_Z = -3;

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
    highrise: new THREE.MeshStandardMaterial({
      color: 0xe0bd32,
      emissive: 0x4a3504,
      emissiveIntensity: 0.12,
      roughness: 0.78,
    }),
    darkDoor: new THREE.MeshStandardMaterial({
      color: 0x11151a,
      emissive: 0x050709,
      emissiveIntensity: 0.08,
      roughness: 0.95,
    }),
    sand: new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 1,
    }),
    sandWall: new THREE.MeshStandardMaterial({
      color: 0xc4a574,
      roughness: 0.95,
    }),
    shopWater: new THREE.MeshStandardMaterial({
      color: 0x3a8fc4,
      emissive: 0x123a58,
      emissiveIntensity: 0.16,
      roughness: 0.55,
    }),
    shopTrim: new THREE.MeshStandardMaterial({
      color: 0xe8f4ff,
      roughness: 0.7,
    }),
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

function addLevel13Highrise(group, entries) {
  var mats = materials();
  var height = 34;
  addBox(
    group,
    mats.highrise,
    L13_HIGHRISE_X,
    height * 0.5,
    L13_HIGHRISE_Z,
    BUILDING_W,
    height,
    BUILDING_D
  );
  entries.push(
    collider(
      L13_HIGHRISE_X - BUILDING_W * 0.5,
      L13_HIGHRISE_X + BUILDING_W * 0.5,
      L13_HIGHRISE_Z - BUILDING_D * 0.5,
      L13_HIGHRISE_Z + BUILDING_D * 0.5
    )
  );

  var facadeX = L13_HIGHRISE_X - BUILDING_W * 0.5 - 0.05;
  var floorY;
  for (floorY = 5; floorY < height - 1; floorY += 3.2) {
    addBox(group, mats.glass, facadeX, floorY, L13_HIGHRISE_Z, 0.08, 1.35, BUILDING_D - 2);
  }
  // 黑色门洞贴在临街立面；玩家靠近门洞自动进入。
  addBox(group, mats.darkDoor, facadeX - 0.02, 1.55, L13_HIGHRISE_Z, 0.11, 3.1, 2.5);
  var awning = addBox(
    group,
    mats.highrise,
    facadeX - 1.2,
    3.35,
    L13_HIGHRISE_Z,
    2.5,
    0.22,
    3.4
  );
  awning.rotation.z = -0.05;
}

function makeAlomWotorSignTexture() {
  var canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 128;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#0d3a5c";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#1a6fa8";
  ctx.fillRect(8, 8, 496, 112);
  ctx.fillStyle = "#e8f6ff";
  ctx.font = "bold 52px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Alom Wotor", 256, 64);
  var texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addAlomWotorShop(group, entries) {
  var mats = materials();
  var x = L119_SHOP_X;
  var z = L119_SHOP_Z;
  var height = 11;
  addBox(group, mats.shopWater, x, height * 0.5, z, BUILDING_W, height, BUILDING_D);
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );
  var facadeX = x + BUILDING_W * 0.5 + 0.05;
  var floorY;
  for (floorY = 3.2; floorY < height - 1; floorY += 3) {
    addBox(group, mats.glass, facadeX, floorY, z, 0.08, 1.5, BUILDING_D - 2.4);
  }
  addBox(group, mats.darkDoor, facadeX + 0.02, 1.55, z, 0.12, 3.1, 2.6);
  addBox(group, mats.shopTrim, facadeX + 0.9, 3.5, z, 1.8, 0.2, 3.6);
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.3),
    new THREE.MeshBasicMaterial({ map: makeAlomWotorSignTexture() })
  );
  sign.position.set(facadeX + 0.08, 5.1, z);
  sign.rotation.y = Math.PI * 0.5;
  group.add(sign);
  // 门口水桶装饰
  addBox(group, mats.shopTrim, facadeX + 1.1, 0.45, z - 2.2, 0.7, 0.9, 0.7);
  addBox(group, mats.shopTrim, facadeX + 1.1, 0.45, z + 2.2, 0.7, 0.9, 0.7);
}

function addLevel48SandRoom(group, entries) {
  var mats = materials();
  var x = L48_SAND_X;
  var z = L48_SAND_Z;
  var height = 8;
  var depth = BUILDING_D + 2;
  var width = BUILDING_W;
  // 四面墙，临街开一个门洞
  addBox(group, mats.sandWall, x, height * 0.5, z - depth * 0.5, width, height, 0.4);
  entries.push(
    collider(x - width * 0.5, x + width * 0.5, z - depth * 0.5 - 0.2, z - depth * 0.5 + 0.2)
  );
  addBox(group, mats.sandWall, x - width * 0.5, height * 0.5, z, 0.4, height, depth);
  entries.push(
    collider(x - width * 0.5 - 0.2, x - width * 0.5 + 0.2, z - depth * 0.5, z + depth * 0.5)
  );
  addBox(group, mats.sandWall, x + width * 0.5, height * 0.5, z, 0.4, height, depth);
  entries.push(
    collider(x + width * 0.5 - 0.2, x + width * 0.5 + 0.2, z - depth * 0.5, z + depth * 0.5)
  );
  // 临街墙：门洞两侧 + 楣
  var doorW = 2.8;
  var wing = (width - doorW) * 0.5;
  var facadeZ = z + depth * 0.5;
  addBox(group, mats.sandWall, x - (doorW * 0.5 + wing * 0.5), height * 0.5, facadeZ, wing, height, 0.4);
  entries.push(
    collider(
      x - width * 0.5,
      x - doorW * 0.5,
      facadeZ - 0.2,
      facadeZ + 0.2
    )
  );
  addBox(group, mats.sandWall, x + (doorW * 0.5 + wing * 0.5), height * 0.5, facadeZ, wing, height, 0.4);
  entries.push(
    collider(
      x + doorW * 0.5,
      x + width * 0.5,
      facadeZ - 0.2,
      facadeZ + 0.2
    )
  );
  addBox(group, mats.sandWall, x, height - 1.1, facadeZ, doorW + 0.2, 2.2, 0.4);
  // 楣板不做 XZ 碰撞，否则会挡住门洞
  // 沙地地板与沙堆
  addBox(group, mats.sand, x, 0.18, z, width - 0.6, 0.35, depth - 0.6);
  var pile;
  for (pile = 0; pile < 7; pile++) {
    addBox(
      group,
      mats.sand,
      x - 4 + pile * 1.3,
      0.55 + (pile % 3) * 0.25,
      z - 2 + (pile % 2) * 2.4,
      2.1,
      1.1 + (pile % 3) * 0.35,
      2.1
    );
  }
  addBox(group, mats.darkDoor, x, 1.4, facadeZ + 0.05, doorW - 0.2, 2.8, 0.08);
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
    if (index === 0 && Math.abs(rowZ - L119_SHOP_Z) < 0.1) {
      addAlomWotorShop(group, entries);
    } else if (index === 0 && Math.abs(rowZ - L48_SAND_Z) < 0.1) {
      addLevel48SandRoom(group, entries);
    } else {
      addBuilding(group, entries, -BUILDING_X, rowZ, -1, serial);
    }
    if (index === 0 && rowZ === 0) {
      addLevel13Highrise(group, entries);
    } else {
      addBuilding(group, entries, BUILDING_X, rowZ + 7, 1, serial + 5);
    }
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

/** 出生点旁的 M.E.G 工作人员：程序化人形 + 不可见准心拾取盒 */
function addStaffNpc(root, interactRoots) {
  var group = new THREE.Group();
  group.name = "Level11MegStaff";
  group.position.set(STAFF_X, 0, STAFF_Z);
  group.rotation.y = Math.atan2(-STAFF_X, -STAFF_Z);
  root.add(group);

  var uniformMat = new THREE.MeshLambertMaterial({ color: 0x2a5080, emissive: 0x0a1828 });
  var skinMat = new THREE.MeshLambertMaterial({ color: 0xc89a6a, emissive: 0x100804 });
  var legMat = new THREE.MeshLambertMaterial({ color: 0x1a2840, emissive: 0x060810 });

  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), legMat);
  legL.position.set(-0.14, 0.425, 0);
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);

  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), uniformMat);
  torso.position.y = 1.21;
  group.add(torso);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.72;
  group.add(head);

  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), uniformMat);
  armL.position.set(-0.36, 1.18, 0);
  group.add(armL);
  var armR = armL.clone();
  armR.position.x = 0.36;
  group.add(armR);

  var badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 128;
  badgeCanvas.height = 64;
  var bctx = badgeCanvas.getContext("2d");
  bctx.fillStyle = "#1a3050";
  bctx.fillRect(0, 0, 128, 64);
  bctx.fillStyle = "#8ec8ff";
  bctx.font = "bold 28px system-ui, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText("M.E.G", 64, 32);
  var badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(badgeCanvas) })
  );
  badge.position.set(0, 1.28, 0.17);
  group.add(badge);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.95;
  pick.userData.brInteract = { kind: "l11_meg_staff" };
  group.add(pick);
  interactRoots.push(pick);
}

export function buildLevel11World(root) {
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level11InfiniteCity";
  root.add(chunksRoot);
  var chunks = new Map();
  var activeColliders = [];
  var interactRoots = [];

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
  // NPC 挂在常驻 root 上，不随街区流式卸载。
  addStaffNpc(root, interactRoots);
  return {
    colliders: activeColliders,
    interactRoots: interactRoots,
    update: function (_px, pz) {
      updateStreaming(pz);
    },
    isLevel13Entrance: function (px, pz) {
      return (
        px >= L13_HIGHRISE_X - BUILDING_W * 0.5 - 1.35 &&
        Math.abs(pz - L13_HIGHRISE_Z) <= 1.35
      );
    },
    isLevel48SandRoom: function (px, pz) {
      var halfW = BUILDING_W * 0.5 - 0.8;
      var halfD = (BUILDING_D + 2) * 0.5 - 0.6;
      return (
        Math.abs(px - L48_SAND_X) <= halfW &&
        Math.abs(pz - L48_SAND_Z) <= halfD
      );
    },
    isLevel119Entrance: function (px, pz) {
      var facadeX = L119_SHOP_X + BUILDING_W * 0.5;
      return px <= facadeX + 1.4 && Math.abs(pz - L119_SHOP_Z) <= 1.4;
    },
  };
}

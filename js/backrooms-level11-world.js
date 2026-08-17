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
/** B.N.T.G 大房子：右侧街，门开在房子侧面（-Z），很难发现 */
const BNTG_X = BUILDING_X;
const BNTG_Z = -9;
/** 三处通往 C-129x 死区的建筑，都在左侧街的第 1 段（z=48 附近） */
const C1291_BLACK_X = -BUILDING_X;
const C1291_BLACK_Z = 32;
const C1290_STONE_X = -BUILDING_X;
const C1290_STONE_Z = 48;
const C1289_COLOR_X = -BUILDING_X;
const C1289_COLOR_Z = 64;
/** “happy！！！”房屋：进入后触发「新的旅途」结局并前往沙盒新游戏 */
const HAPPY_HOUSE_X = BUILDING_X;
const HAPPY_HOUSE_Z = 71;

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
    // 黑色居民楼（→ C-1291）
    blockBlack: new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.92 }),
    blockBlackWindow: new THREE.MeshStandardMaterial({
      color: 0x23282d,
      emissive: 0x0a0d10,
      emissiveIntensity: 0.3,
      roughness: 0.55,
    }),
    // 石头房子（→ C-1290）
    stoneWall: new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.98 }),
    stoneBlock: new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 1 }),
    stoneBlockDark: new THREE.MeshStandardMaterial({ color: 0x7a756c, roughness: 1 }),
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

function makeHappySignTexture() {
  var canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 160;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#fff4a8";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#ff7b54";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 146);
  ctx.fillStyle = "#e33b55";
  ctx.font = "bold 74px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("happy！！！", 256, 84);
  var tex = new THREE.CanvasTexture(canvasEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 临街的快乐小屋；门洞保持非碰撞，由外围楼体碰撞配合入口判定切场景。 */
function addHappyHouse(group, entries) {
  var mats = materials();
  var x = HAPPY_HOUSE_X;
  var z = HAPPY_HOUSE_Z;
  var facadeX = x - BUILDING_W * 0.5 - 0.05;
  addBox(group, mats.buildingC, x, 4.2, z, BUILDING_W, 8.4, BUILDING_D);
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );
  addBox(group, mats.darkDoor, facadeX, 1.55, z, 0.12, 3.1, 2.4);
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 1.8),
    new THREE.MeshBasicMaterial({ map: makeHappySignTexture() })
  );
  sign.position.set(facadeX - 0.08, 5.2, z);
  sign.rotation.y = -Math.PI * 0.5;
  group.add(sign);
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

/** 通往 C-1291 的黑色居民楼：整栋漆黑，窗户不透光，门洞更黑 */
function addBlackApartment(group, entries) {
  var mats = materials();
  var x = C1291_BLACK_X;
  var z = C1291_BLACK_Z;
  var height = 28;
  addBox(group, mats.blockBlack, x, height * 0.5, z, BUILDING_W, height, BUILDING_D);
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );
  // 临街立面（+X 朝向马路）
  var facadeX = x + BUILDING_W * 0.5 + 0.05;
  var floorY;
  var col;
  for (floorY = 3.4; floorY < height - 1.4; floorY += 3.2) {
    for (col = -1; col <= 1; col++) {
      addBox(group, mats.blockBlackWindow, facadeX, floorY, z + col * 3.6, 0.08, 1.5, 2.2);
    }
  }
  // 门洞
  addBox(group, mats.darkDoor, facadeX + 0.02, 1.6, z, 0.12, 3.2, 2.6);
  addBox(group, mats.blockBlack, facadeX + 0.85, 3.6, z, 1.7, 0.22, 3.6);
}

/** 通往 C-1290 的石头房子：粗砌石块 + 拱形门洞，呼应石茧的希腊拱门 */
function addStoneHouse(group, entries) {
  var mats = materials();
  var x = C1290_STONE_X;
  var z = C1290_STONE_Z;
  var height = 9;
  addBox(group, mats.stoneWall, x, height * 0.5, z, BUILDING_W, height, BUILDING_D);
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );
  // 立面上错落的石块，看起来是一块块垒起来的
  var facadeX = x + BUILDING_W * 0.5 + 0.06;
  var row;
  var i;
  for (row = 0; row < 7; row++) {
    var y = 0.6 + row * 1.25;
    var offset = (row % 2) * 1.1;
    for (i = 0; i < 5; i++) {
      var bz = z - 5 + offset + i * 2.4;
      if (Math.abs(bz - z) < 1.8 && y < 3.4) continue; // 让出门洞
      addBox(
        group,
        (row + i) % 2 === 0 ? mats.stoneBlock : mats.stoneBlockDark,
        facadeX,
        y,
        bz,
        0.22,
        1.1,
        2.1
      );
    }
  }
  // 拱形门洞：底部方洞 + 顶部半圆由几块楔形石块拼出
  addBox(group, mats.darkDoor, facadeX + 0.03, 1.5, z, 0.14, 3, 2.6);
  var arc;
  for (arc = 0; arc < 7; arc++) {
    var a = Math.PI * (arc / 6);
    var stone = addBox(
      group,
      arc % 2 === 0 ? mats.stoneBlock : mats.stoneBlockDark,
      facadeX + 0.02,
      3.0 + Math.sin(a) * 1.35,
      z - Math.cos(a) * 1.5,
      0.26,
      0.62,
      0.72
    );
    stone.rotation.x = a - Math.PI * 0.5;
  }
  // 屋顶压石
  addBox(group, mats.stoneBlockDark, x, height + 0.25, z, BUILDING_W + 0.8, 0.5, BUILDING_D + 0.8);
}

var _rainbowBodyMat = null;
var _rainbowPatchMats = null;

function makeRainbowTexture() {
  var canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 256;
  var ctx = canvasEl.getContext("2d");
  var colors = [
    "#e8443a",
    "#f08c1e",
    "#f5d327",
    "#4fb14e",
    "#2f7fd1",
    "#7a49b8",
    "#e05fa8",
    "#22b3a6",
  ];
  var i;
  var j;
  for (j = 0; j < 8; j++) {
    for (i = 0; i < 8; i++) {
      ctx.fillStyle = colors[(i + j * 3) % colors.length];
      ctx.fillRect(i * 32, j * 32, 32, 32);
    }
  }
  var texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 通往 C-1289 的五彩斑斓的房子：拼色方块外墙 */
function addRainbowHouse(group, entries) {
  var mats = materials();
  var x = C1289_COLOR_X;
  var z = C1289_COLOR_Z;
  var height = 10;
  if (!_rainbowBodyMat) {
    _rainbowBodyMat = new THREE.MeshStandardMaterial({
      map: makeRainbowTexture(),
      roughness: 0.72,
    });
  }
  addBox(group, _rainbowBodyMat, x, height * 0.5, z, BUILDING_W, height, BUILDING_D);
  entries.push(
    collider(
      x - BUILDING_W * 0.5,
      x + BUILDING_W * 0.5,
      z - BUILDING_D * 0.5,
      z + BUILDING_D * 0.5
    )
  );
  // 立面上再叠一层更饱和的色块，远远就能看出来这栋不正常
  var facadeX = x + BUILDING_W * 0.5 + 0.06;
  var i;
  if (!_rainbowPatchMats) {
    var palette = [0xe8443a, 0xf5d327, 0x4fb14e, 0x2f7fd1, 0x7a49b8, 0xe05fa8];
    _rainbowPatchMats = [];
    for (i = 0; i < palette.length; i++) {
      _rainbowPatchMats.push(
        new THREE.MeshStandardMaterial({
          color: palette[i],
          emissive: palette[i],
          emissiveIntensity: 0.14,
          roughness: 0.6,
        })
      );
    }
  }
  var patchMats = _rainbowPatchMats;
  var row;
  for (row = 0; row < 5; row++) {
    for (i = 0; i < 5; i++) {
      var y = 1.1 + row * 1.9;
      var pz = z - 4.8 + i * 2.4;
      if (Math.abs(pz - z) < 1.7 && y < 3.4) continue; // 让出门洞
      addBox(group, patchMats[(row * 3 + i) % patchMats.length], facadeX, y, pz, 0.16, 1.6, 2.1);
    }
  }
  addBox(group, mats.darkDoor, facadeX + 0.03, 1.55, z, 0.14, 3.1, 2.6);
  addBox(group, patchMats[1], facadeX + 0.9, 3.55, z, 1.8, 0.22, 3.6);
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
    } else if (index === 1 && Math.abs(rowZ - C1291_BLACK_Z) < 0.1) {
      addBlackApartment(group, entries);
    } else {
      addBuilding(group, entries, -BUILDING_X, rowZ, -1, serial);
    }
    if (index === 0 && rowZ === 0) {
      addLevel13Highrise(group, entries);
    } else if (index === 0 && rowZ === -16) {
      // B.N.T.G 大房子占用此格；房子本体挂常驻 root，这里留空避免重叠。
    } else if (index === 1 && rowZ === 64) {
      // “happy！！！”房屋占用右侧 z=71 的格子。
      addHappyHouse(group, entries);
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

/** B.N.T.G 员工：房内的商人，外观普通制服 + 不可见拾取盒 */
function addBntgNpc(root, interactRoots, x, z) {
  var group = new THREE.Group();
  group.name = "Level11BntgVendor";
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI; // 面向门口（-Z）
  root.add(group);

  var uniformMat = new THREE.MeshLambertMaterial({ color: 0x5a4632, emissive: 0x140d06 });
  var skinMat = new THREE.MeshLambertMaterial({ color: 0xc89a6a, emissive: 0x100804 });
  var legMat = new THREE.MeshLambertMaterial({ color: 0x2c2216, emissive: 0x080602 });

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
  bctx.fillStyle = "#3a2a16";
  bctx.fillRect(0, 0, 128, 64);
  bctx.fillStyle = "#f0d59a";
  bctx.font = "bold 26px system-ui, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText("B.N.T.G", 64, 32);
  var badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(badgeCanvas) })
  );
  badge.position.set(0, 1.28, -0.17);
  badge.rotation.y = Math.PI;
  group.add(badge);

  // 简易柜台
  var counter = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.95, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x6b5334, roughness: 0.8 })
  );
  counter.position.set(x, 0.475, z - 1.4);
  root.add(counter);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 2.2, 2.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, 1.1, z - 0.6);
  pick.userData.brInteract = { kind: "l11_bntg_vendor" };
  root.add(pick);
  interactRoots.push(pick);
}

/** B.N.T.G 收购员：站在售货员旁，负责回收玩家物资 */
function addBntgBuyerNpc(root, interactRoots, x, z) {
  var group = new THREE.Group();
  group.name = "Level11BntgBuyer";
  group.position.set(x, 0, z);
  group.rotation.y = Math.PI; // 面向门口（-Z）
  root.add(group);

  var uniformMat = new THREE.MeshLambertMaterial({ color: 0x35506e, emissive: 0x0a141f });
  var skinMat = new THREE.MeshLambertMaterial({ color: 0xd0a878, emissive: 0x120a05 });
  var legMat = new THREE.MeshLambertMaterial({ color: 0x1c2a3a, emissive: 0x060810 });

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
  bctx.fillStyle = "#16324a";
  bctx.fillRect(0, 0, 128, 64);
  bctx.fillStyle = "#a8d4ff";
  bctx.font = "bold 24px system-ui, sans-serif";
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText("B.N.T.G 收购", 64, 32);
  var badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.17),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(badgeCanvas) })
  );
  badge.position.set(0, 1.28, -0.17);
  badge.rotation.y = Math.PI;
  group.add(badge);

  // 简易柜台
  var counter = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.95, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x53606f, roughness: 0.8 })
  );
  counter.position.set(x, 0.475, z - 1.4);
  root.add(counter);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.2, 2.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, 1.1, z - 0.6);
  pick.userData.brInteract = { kind: "l11_bntg_buyer" };
  root.add(pick);
  interactRoots.push(pick);
}

/** B.N.T.G 大房子：外观与普通民居无异，门开在侧面（-Z），内有商人 */
function addBntgHouse(root, staticColliders, interactRoots) {
  var mats = materials();
  var x = BNTG_X;
  var z = BNTG_Z;
  var W = BUILDING_W;
  var D = BUILDING_D;
  var H = 11;
  var wallMat = mats.buildingB;
  var t = 0.4;

  // 地板与屋顶
  addBox(root, mats.sidewalk, x, 0.06, z, W - 0.4, 0.12, D - 0.4);
  addBox(root, wallMat, x, H, z, W, 0.4, D);

  // 背墙（+X，背对街道）
  addBox(root, wallMat, x + W * 0.5, H * 0.5, z, t, H, D);
  staticColliders.push(collider(x + W * 0.5 - 0.2, x + W * 0.5 + 0.2, z - D * 0.5, z + D * 0.5));
  // 临街立面（-X）
  addBox(root, wallMat, x - W * 0.5, H * 0.5, z, t, H, D);
  staticColliders.push(collider(x - W * 0.5 - 0.2, x - W * 0.5 + 0.2, z - D * 0.5, z + D * 0.5));
  // +Z 侧墙（完整）
  addBox(root, wallMat, x, H * 0.5, z + D * 0.5, W, H, t);
  staticColliders.push(collider(x - W * 0.5, x + W * 0.5, z + D * 0.5 - 0.2, z + D * 0.5 + 0.2));

  // -Z 侧墙：开一道窄门（与墙同色，很难发现）
  var doorW = 1.3;
  var wing = (W - doorW) * 0.5;
  var facadeZ = z - D * 0.5;
  addBox(root, wallMat, x - (doorW * 0.5 + wing * 0.5), H * 0.5, facadeZ, wing, H, t);
  staticColliders.push(collider(x - W * 0.5, x - doorW * 0.5, facadeZ - 0.2, facadeZ + 0.2));
  addBox(root, wallMat, x + (doorW * 0.5 + wing * 0.5), H * 0.5, facadeZ, wing, H, t);
  staticColliders.push(collider(x + doorW * 0.5, x + W * 0.5, facadeZ - 0.2, facadeZ + 0.2));
  // 门楣（不做碰撞，避免挡住门洞）
  addBox(root, wallMat, x, H - 1.1, facadeZ, doorW + 0.2, 2.2, t);

  // 临街立面的窗带，让房子看起来和普通民居一样
  var floorY;
  for (floorY = 3; floorY < H - 1; floorY += 3) {
    addBox(root, mats.glass, x - W * 0.5 - 0.05, floorY, z, 0.08, 1.4, D - 3);
  }

  // 室内暖光
  var lamp = new THREE.PointLight(0xffe9c0, 0.95, 24, 2);
  lamp.position.set(x, H - 1.6, z);
  root.add(lamp);

  addBntgNpc(root, interactRoots, x, z + 2);
  addBntgBuyerNpc(root, interactRoots, x + 3.4, z + 2);
}

export function buildLevel11World(root) {
  var chunksRoot = new THREE.Group();
  chunksRoot.name = "Level11InfiniteCity";
  root.add(chunksRoot);
  var chunks = new Map();
  var activeColliders = [];
  var staticColliders = [];
  var interactRoots = [];

  root.add(new THREE.HemisphereLight(0xeef8ff, 0x68727d, 1.35));
  var sun = new THREE.DirectionalLight(0xfff2d5, 1.45);
  sun.position.set(-20, 32, -16);
  root.add(sun);
  root.add(new THREE.AmbientLight(0xffffff, 0.32));

  function rebuildColliders() {
    activeColliders.length = 0;
    Array.prototype.push.apply(activeColliders, staticColliders);
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

  // 常驻结构（房子/NPC）先建，静态碰撞随后并入 activeColliders。
  addBntgHouse(root, staticColliders, interactRoots);
  updateStreaming(0);
  rebuildColliders();
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
    /** 黑色居民楼门洞 → Level C-1291 */
    isLevelC1291Entrance: function (px, pz) {
      var facadeX = C1291_BLACK_X + BUILDING_W * 0.5;
      return px <= facadeX + 1.4 && Math.abs(pz - C1291_BLACK_Z) <= 1.4;
    },
    isHappyHouseEntrance: function (px, pz) {
      var facadeX = HAPPY_HOUSE_X - BUILDING_W * 0.5;
      return px >= facadeX - 1.4 && Math.abs(pz - HAPPY_HOUSE_Z) <= 1.4;
    },
  };
}

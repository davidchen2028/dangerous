/**
 * Level 1 基地后门通往枢纽的隐秘路线。
 * 观察序列：看隧道尽头 → 回头，北墙上就地裂开一条岔路口（不是传送）。
 * 走进岔路后，四个 T 字路口依次左转、右转、左转、右转；走错方向会被走廊送回岔路口。
 * 尽头的 7×7 房间里 A、B 两扇门并排，先选 B 进入第二个房间，再选 A 抵达枢纽。
 */
import * as THREE from "three";

/** 路线本体建在远离 Level 1 迷宫的独立坐标，避免和程序化迷宫互相穿插 */
const ROUTE_X = 5000;
const ROUTE_Z = 5000;
const CORRIDOR_W = 3.2;
const WALL_H = 5;
/** 岔路口距离走廊起点的距离（必须小于掉落 Level 2 的触发深度） */
const BRANCH_OFFSET_X = 9;
const ROOM_SIZE = 7;
/** 门洞半宽 */
const DOOR_HALF = 0.8;
/** 两扇门中心相对房间中心的偏移 */
const DOOR_SPREAD = 1.75;

function collider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function makeDoorLetterTexture(letter) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#e8e6dd";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#282b2d";
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.fillStyle = "#181a1c";
  ctx.font = "bold 170px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, 128, 137);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHubRoute(options) {
  options = options || {};
  var root = options.root;
  var collidersA = options.colliders || [];
  var collidersB = options.mirrorColliders || collidersA;
  var showToast = typeof options.showToast === "function" ? options.showToast : function () {};
  var onEnterHub = typeof options.onEnterHub === "function" ? options.onEnterHub : function () {};
  var onEatFood = typeof options.onEatFood === "function" ? options.onEatFood : function () {};
  var onEnterCanteen =
    typeof options.onEnterCanteen === "function" ? options.onEnterCanteen : function () {};
  var getCorridorInfo =
    typeof options.getCorridorInfo === "function" ? options.getCorridorInfo : function () {
      return null;
    };
  var carveNorthGap =
    typeof options.carveNorthGap === "function" ? options.carveNorthGap : function () {
      return false;
    };

  var group = new THREE.Group();
  group.name = "Level1HubSecretRoute";
  group.visible = false;
  root.add(group);

  var aimRoots = [];
  /** 走错方向时把玩家送回岔路口的触发区 */
  var backZones = [];
  var inRoute = false;
  var forkOpen = false;
  var sawEnd = false;
  var pendingTeleport = null;
  var built = false;
  var gapMinX = 0;
  var gapMaxX = 0;
  var gateZ = 0;

  var boxGeo = new THREE.BoxGeometry(1, 1, 1);
  var signGeo = new THREE.PlaneGeometry(1.35, 1.35);
  var wallMat = new THREE.MeshLambertMaterial({ color: 0xe7e7e4, emissive: 0x222222 });
  var floorMat = new THREE.MeshLambertMaterial({ color: 0xc7c7c3, emissive: 0x151515 });
  var doorMat = new THREE.MeshLambertMaterial({ color: 0x303438, emissive: 0x08090a });
  var tableMat = new THREE.MeshLambertMaterial({ color: 0x8a5a34, emissive: 0x140d07 });
  var trayMat = new THREE.MeshLambertMaterial({ color: 0xc9ccce, emissive: 0x101112 });
  var soupMat = new THREE.MeshLambertMaterial({ color: 0xd98a3a, emissive: 0x2a1608 });
  var pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  // 凹室要和后门白隧道无缝衔接，用同样的纯白配色
  var alcoveWallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 });
  var alcoveFloorMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x282828 });
  var alcoveCeilMat = new THREE.MeshLambertMaterial({ color: 0xfafafa, emissive: 0x1a1a1a });
  /** @type {Record<string, THREE.MeshBasicMaterial>} */
  var signMats = Object.create(null);

  function signMaterial(letter) {
    if (!signMats[letter]) {
      signMats[letter] = new THREE.MeshBasicMaterial({
        map: makeDoorLetterTexture(letter),
      });
    }
    return signMats[letter];
  }

  function addCollider(c) {
    collidersA.push(c);
    if (collidersB !== collidersA && collidersB.indexOf(c) < 0) collidersB.push(c);
  }

  function addBoxTo(parent, mat, x, y, z, sx, sy, sz, collide) {
    var mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    if (collide) {
      addCollider(collider(x - sx * 0.5, x + sx * 0.5, z - sz * 0.5, z + sz * 0.5));
    }
    return mesh;
  }

  function addBox(mat, x, y, z, sx, sy, sz, collide) {
    return addBoxTo(group, mat, x, y, z, sx, sy, sz, collide);
  }

  function addSegment(ax, az, bx, bz) {
    var dx = bx - ax;
    var dz = bz - az;
    var horizontal = Math.abs(dx) > Math.abs(dz);
    var length = Math.hypot(dx, dz);
    var cx = (ax + bx) * 0.5;
    var cz = (az + bz) * 0.5;
    addBox(
      floorMat,
      cx,
      0,
      cz,
      horizontal ? length : CORRIDOR_W,
      0.14,
      horizontal ? CORRIDOR_W : length,
      false
    );
    addBox(
      wallMat,
      cx,
      WALL_H,
      cz,
      horizontal ? length : CORRIDOR_W,
      0.12,
      horizontal ? CORRIDOR_W : length,
      false
    );
    // 两端各缩短半个走廊宽，把路口拐角留空
    var wallLength = Math.max(0.8, length - CORRIDOR_W);
    if (horizontal) {
      addBox(wallMat, cx, WALL_H * 0.5, cz - CORRIDOR_W * 0.5, wallLength, WALL_H, 0.22, true);
      addBox(wallMat, cx, WALL_H * 0.5, cz + CORRIDOR_W * 0.5, wallLength, WALL_H, 0.22, true);
    } else {
      addBox(wallMat, cx - CORRIDOR_W * 0.5, WALL_H * 0.5, cz, 0.22, WALL_H, wallLength, true);
      addBox(wallMat, cx + CORRIDOR_W * 0.5, WALL_H * 0.5, cz, 0.22, WALL_H, wallLength, true);
    }
  }

  /** 封死一个方向：thinInX=true 时墙薄在 X 轴（挡住东西向通行） */
  function addCap(x, z, thinInX) {
    addBox(
      wallMat,
      x,
      WALL_H * 0.5,
      z,
      thinInX ? 0.24 : CORRIDOR_W,
      WALL_H,
      thinInX ? CORRIDOR_W : 0.24,
      true
    );
  }

  /** 右转的错误岔路：尽头是一段死路，踩进去会被送回岔路口 */
  function addWrongTurn(ax, az, bx, bz) {
    addSegment(ax, az, bx, bz);
    var dx = bx - ax;
    var dz = bz - az;
    var len = Math.hypot(dx, dz) || 1;
    var ux = dx / len;
    var uz = dz / len;
    var horizontal = Math.abs(dx) > Math.abs(dz);
    addCap(bx + ux * CORRIDOR_W * 0.5, bz + uz * CORRIDOR_W * 0.5, horizontal);
    var zx = bx - ux * 1.4;
    var zz = bz - uz * 1.4;
    backZones.push({
      minX: zx - 1.5,
      maxX: zx + 1.5,
      minZ: zz - 1.5,
      maxZ: zz + 1.5,
    });
  }

  function addDoor(dx, dz, letter, roomIndex) {
    addBox(doorMat, dx, 1.6, dz, DOOR_HALF * 2, 3.2, 0.22, true);
    var sign = new THREE.Mesh(signGeo, signMaterial(letter));
    sign.position.set(dx, 3.55, dz - 0.18);
    sign.rotation.y = Math.PI;
    group.add(sign);
    var pick = new THREE.Mesh(boxGeo, pickMat);
    pick.position.set(dx, 1.8, dz - 0.24);
    pick.scale.set(DOOR_HALF * 2 + 0.3, 3.6, 0.7);
    pick.userData.brInteract = {
      kind: "hub_route_door",
      letter: letter,
      room: roomIndex,
    };
    group.add(pick);
    aimRoots.push(pick);
  }

  /** 7×7 房间；北墙上并排 A、B 两扇门，玩家必须自己选一扇 */
  function addRoom(cx, cz, roomIndex, southEntry) {
    var h = ROOM_SIZE * 0.5;
    addBox(floorMat, cx, 0, cz, ROOM_SIZE, 0.14, ROOM_SIZE, false);
    addBox(wallMat, cx, WALL_H, cz, ROOM_SIZE, 0.12, ROOM_SIZE, false);
    addBox(wallMat, cx - h, WALL_H * 0.5, cz, 0.25, WALL_H, ROOM_SIZE, true);
    addBox(wallMat, cx + h, WALL_H * 0.5, cz, 0.25, WALL_H, ROOM_SIZE, true);
    if (southEntry) {
      addBox(wallMat, cx - 2.375, WALL_H * 0.5, cz - h, 2.25, WALL_H, 0.25, true);
      addBox(wallMat, cx + 2.375, WALL_H * 0.5, cz - h, 2.25, WALL_H, 0.25, true);
    } else {
      addBox(wallMat, cx, WALL_H * 0.5, cz - h, ROOM_SIZE, WALL_H, 0.25, true);
    }
    var edge = DOOR_SPREAD + DOOR_HALF;
    var outerLen = h - edge;
    addBox(
      wallMat,
      cx - (edge + outerLen * 0.5),
      WALL_H * 0.5,
      cz + h,
      outerLen,
      WALL_H,
      0.25,
      true
    );
    addBox(
      wallMat,
      cx + (edge + outerLen * 0.5),
      WALL_H * 0.5,
      cz + h,
      outerLen,
      WALL_H,
      0.25,
      true
    );
    addBox(
      wallMat,
      cx,
      WALL_H * 0.5,
      cz + h,
      (DOOR_SPREAD - DOOR_HALF) * 2,
      WALL_H,
      0.25,
      true
    );
    addDoor(cx - DOOR_SPREAD, cz + h, "A", roomIndex);
    addDoor(cx + DOOR_SPREAD, cz + h, "B", roomIndex);
    var light = new THREE.PointLight(0xf4f2e8, 0.62, 15, 2);
    light.position.set(cx, WALL_H - 0.6, cz);
    group.add(light);
  }

  /**
   * 食堂里的一张餐桌 + 托盘浓汤 + 取食交互框。
   * (ax, az) 是从桌子指向过道的方向：取食框放在桌子的过道一侧，
   * 避免被桌子的碰撞盒挡住准星射线（墙体射线是二维的）。
   */
  function addCanteenTable(x, z, ax, az) {
    // 桌腿 + 桌面（作为整体碰撞盒）
    addBox(tableMat, x, 0.45, z, 2.2, 0.9, 1.2, true);
    addBox(tableMat, x, 0.95, z, 2.4, 0.14, 1.4, false);
    // 两份托盘浓汤
    var dishX = [x - 0.5, x + 0.5];
    for (var i = 0; i < dishX.length; i++) {
      addBox(trayMat, dishX[i], 1.06, z, 0.52, 0.06, 0.52, false);
      addBox(soupMat, dishX[i], 1.14, z, 0.42, 0.12, 0.42, false);
    }
    // 取食交互框（透明），偏向过道一侧
    var pick = new THREE.Mesh(boxGeo, pickMat);
    pick.position.set(x + ax * 1.5, 1.15, z + az * 1.5);
    pick.scale.set(2.2, 1.4, 2.2);
    pick.userData.brInteract = { kind: "hub_canteen_food" };
    group.add(pick);
    aimRoots.push(pick);
  }

  /** 食堂角落通往 C-1299.1 的门（贴在南墙内侧，按 Q 打开） */
  function addCanteenExitDoor(dx, dz) {
    addBox(doorMat, dx, 1.6, dz, DOOR_HALF * 2, 3.2, 0.14, false);
    var pick = new THREE.Mesh(boxGeo, pickMat);
    pick.position.set(dx, 1.8, dz + 0.28);
    pick.scale.set(DOOR_HALF * 2 + 0.3, 3.6, 0.7);
    pick.userData.brInteract = { kind: "hub_canteen_exit" };
    group.add(pick);
    aimRoots.push(pick);
  }

  /** 「左右右左」尽头的 MEG 食堂：宽敞大厅，北侧走廊进入，南墙有通往 C-1299.1 的门 */
  function addMessHall(cx, cz) {
    var hx = 8;
    var hz = 8;
    addBox(floorMat, cx, 0, cz, hx * 2, 0.14, hz * 2, false);
    addBox(wallMat, cx, WALL_H, cz, hx * 2, 0.12, hz * 2, false);
    // 东、西墙
    addBox(wallMat, cx - hx, WALL_H * 0.5, cz, 0.25, WALL_H, hz * 2, true);
    addBox(wallMat, cx + hx, WALL_H * 0.5, cz, 0.25, WALL_H, hz * 2, true);
    // 北墙留出走廊宽度的入口（对齐 x = cx 的竖直走廊）
    var gapHalf = CORRIDOR_W * 0.5;
    var northSeg = hx - gapHalf;
    addBox(
      wallMat,
      cx - (gapHalf + northSeg * 0.5),
      WALL_H * 0.5,
      cz + hz,
      northSeg,
      WALL_H,
      0.25,
      true
    );
    addBox(
      wallMat,
      cx + (gapHalf + northSeg * 0.5),
      WALL_H * 0.5,
      cz + hz,
      northSeg,
      WALL_H,
      0.25,
      true
    );
    // 南墙整堵实体，门贴在墙内侧（不真正开洞，靠交互切层）
    addBox(wallMat, cx, WALL_H * 0.5, cz - hz, hx * 2, WALL_H, 0.25, true);
    addCanteenExitDoor(cx, cz - hz + 0.2);
    // 三张餐桌（取食框朝向中央过道）
    addCanteenTable(cx - 4, cz + 2.5, 1, 0);
    addCanteenTable(cx + 4, cz + 2.5, -1, 0);
    addCanteenTable(cx, cz - 3, 0, 1);
    // 照明
    var spots = [
      [cx - 4, cz + 2],
      [cx + 4, cz + 2],
      [cx, cz - 2],
    ];
    for (var i = 0; i < spots.length; i++) {
      var light = new THREE.PointLight(0xfdf3dc, 0.7, 16, 2);
      light.position.set(spots[i][0], WALL_H - 0.6, spots[i][1]);
      group.add(light);
    }
    var amb = new THREE.PointLight(0xf4f0e2, 0.4, 26, 2);
    amb.position.set(cx, WALL_H - 0.3, cz);
    group.add(amb);
  }

  function build() {
    if (built) return;
    built = true;
    var rx = ROUTE_X;
    var rz = ROUTE_Z;
    // 起点朝 +Z；左、右、左、右依次转向 +X、+Z、+X、+Z，走成向东北的阶梯
    var p0 = { x: rx, z: rz };
    var p1 = { x: rx, z: rz + 20 };
    var p2 = { x: rx + 18, z: rz + 20 };
    var p3 = { x: rx + 18, z: rz + 38 };
    var p4 = { x: rx + 34, z: rz + 38 };
    var room1 = { x: rx + 34, z: rz + 49 };
    var room2 = { x: rx, z: rz + 80 };

    var roomSouthZ = room1.z - ROOM_SIZE * 0.5;
    addSegment(p0.x, p0.z, p1.x, p1.z);
    addSegment(p1.x, p1.z, p2.x, p2.z);
    addSegment(p2.x, p2.z, p3.x, p3.z);
    addSegment(p3.x, p3.z, p4.x, p4.z);
    addSegment(p4.x, p4.z, room1.x, roomSouthZ);

    // 入口落点两侧补墙，避免从起点拐角缺口滑出走廊
    addBox(wallMat, p0.x - CORRIDOR_W * 0.5, WALL_H * 0.5, p0.z, 0.22, WALL_H, CORRIDOR_W, true);
    addBox(wallMat, p0.x + CORRIDOR_W * 0.5, WALL_H * 0.5, p0.z, 0.22, WALL_H, CORRIDOR_W, true);
    // 末段走廊与房间南墙之间补墙
    var seamZ = roomSouthZ - CORRIDOR_W * 0.5;
    var seamLen = CORRIDOR_W * 0.5;
    addBox(
      wallMat,
      p4.x - CORRIDOR_W * 0.5,
      WALL_H * 0.5,
      seamZ + seamLen * 0.5,
      0.22,
      WALL_H,
      seamLen,
      true
    );
    addBox(
      wallMat,
      p4.x + CORRIDOR_W * 0.5,
      WALL_H * 0.5,
      seamZ + seamLen * 0.5,
      0.22,
      WALL_H,
      seamLen,
      true
    );

    // 每个路口正前方封死，形成 T 字，只剩左右两个选择
    addCap(p0.x, p0.z - CORRIDOR_W * 0.5, false);
    addCap(p1.x, p1.z + CORRIDOR_W * 0.5, false);
    addCap(p2.x + CORRIDOR_W * 0.5, p2.z, true);
    addCap(p3.x, p3.z + CORRIDOR_W * 0.5, false);
    addCap(p4.x + CORRIDOR_W * 0.5, p4.z, true);

    // 通往枢纽的正确方向依次是左、右、左、右；这些反方向都是死路
    addWrongTurn(p1.x, p1.z, p1.x - 9, p1.z);
    addWrongTurn(p2.x, p2.z, p2.x, p2.z - 9);
    addWrongTurn(p4.x, p4.z, p4.x, p4.z - 9);

    // 「左右右左」通往 MEG 食堂：p3 处不再左转去枢纽，而是右转（-X）进入食堂支路
    var cp1 = { x: rx - 12, z: rz + 38 };
    var hallCenter = { x: cp1.x, z: rz + 22 };
    var hallNorthZ = hallCenter.z + 8;
    addSegment(p3.x, p3.z, cp1.x, cp1.z);
    addSegment(cp1.x, cp1.z, cp1.x, hallNorthZ);
    // cp1 处：继续向西是死路；北侧封死；只剩左转（-Z）进食堂
    addWrongTurn(cp1.x, cp1.z, cp1.x - 9, cp1.z);
    addCap(cp1.x, cp1.z + CORRIDOR_W * 0.5, false);
    // addSegment 会把侧墙两端各缩短半个走廊宽，补上竖直走廊与食堂北墙之间的接缝，
    // 否则入口两侧各留一个缺口，玩家能从这里侧移出地图。
    var seamHalf = CORRIDOR_W * 0.5;
    addBox(
      wallMat,
      cp1.x - seamHalf,
      WALL_H * 0.5,
      hallNorthZ + seamHalf * 0.5,
      0.22,
      WALL_H,
      seamHalf,
      true
    );
    addBox(
      wallMat,
      cp1.x + seamHalf,
      WALL_H * 0.5,
      hallNorthZ + seamHalf * 0.5,
      0.22,
      WALL_H,
      seamHalf,
      true
    );
    addMessHall(hallCenter.x, hallCenter.z);

    addRoom(room1.x, room1.z, 1, true);
    addRoom(room2.x, room2.z, 2, false);

    var lightSpots = [
      [rx, rz + 6],
      [rx, rz + 15],
      [rx + 6, rz + 20],
      [rx + 14, rz + 20],
      [rx + 18, rz + 26],
      [rx + 18, rz + 34],
      [rx + 24, rz + 38],
      [rx + 31, rz + 38],
      [rx + 34, rz + 42],
    ];
    for (var i = 0; i < lightSpots.length; i++) {
      var light = new THREE.PointLight(0xf2f1e7, 0.55, 14, 2);
      light.position.set(lightSpots[i][0], WALL_H - 0.5, lightSpots[i][1]);
      group.add(light);
    }
  }

  /** 走廊北墙缺口后方的短凹室，用来遮住 Level 1 迷宫、让岔路口看起来是条通路 */
  function buildAlcove(info, centerX, northZ) {
    var depth = 2.6;
    var midZ = northZ + depth * 0.5;
    var g = info.group || group;
    var bh = info.height || WALL_H;
    addBoxTo(g, alcoveFloorMat, centerX, 0.07, midZ, CORRIDOR_W, 0.14, depth, false);
    addBoxTo(g, alcoveCeilMat, centerX, bh, midZ, CORRIDOR_W, 0.1, depth, false);
    addBoxTo(
      g,
      alcoveWallMat,
      centerX - CORRIDOR_W * 0.5,
      bh * 0.5,
      midZ,
      0.22,
      bh,
      depth,
      true
    );
    addBoxTo(
      g,
      alcoveWallMat,
      centerX + CORRIDOR_W * 0.5,
      bh * 0.5,
      midZ,
      0.22,
      bh,
      depth,
      true
    );
    addBoxTo(
      g,
      alcoveWallMat,
      centerX,
      bh * 0.5,
      northZ + depth,
      CORRIDOR_W,
      bh,
      0.22,
      true
    );
    var light = new THREE.PointLight(0xf6f5ec, 0.7, 10, 2);
    light.position.set(centerX, bh - 0.5, northZ + depth * 0.5);
    g.add(light);
  }

  function openFork() {
    if (forkOpen) return false;
    var info = getCorridorInfo();
    if (!info) return false;
    var centerX = info.startX + BRANCH_OFFSET_X;
    gapMinX = centerX - CORRIDOR_W * 0.5;
    gapMaxX = centerX + CORRIDOR_W * 0.5;
    if (!carveNorthGap(gapMinX, gapMaxX)) return false;
    forkOpen = true;
    var northZ = info.centerZ + info.halfW;
    // 只要跨过北墙平面就接进路线，玩家感觉是直接走进岔路，不是被传送
    gateZ = northZ + 0.45;
    buildAlcove(info, centerX, northZ);
    showToast("你回头时，白色隧道的北墙上裂开了一条本不存在的岔路。");
    return true;
  }

  function enterRoute() {
    build();
    inRoute = true;
    group.visible = true;
    // 不改 yaw，保留玩家当前朝向，走进去是连续的
    pendingTeleport = { x: ROUTE_X, z: ROUTE_Z + 0.8 };
  }

  function sendBackToFork(message) {
    pendingTeleport = { x: ROUTE_X, z: ROUTE_Z + 0.8, yaw: Math.PI };
    if (message) showToast(message);
  }

  return {
    updateObservation: function (px, pz, yaw, inMegCorridor) {
      if (forkOpen || inRoute || !inMegCorridor) return;
      // Level 1 后门隧道沿 +X 延伸；前视 +X（看尽头）后再回看 -X。
      var lookX = -Math.sin(yaw);
      if (!sawEnd && lookX > 0.55) {
        sawEnd = true;
        showToast("你凝视着白色隧道的尽头。");
      } else if (sawEnd && lookX < -0.55) {
        openFork();
      }
    },
    /** 玩家走进走廊北墙缺口时接入路线 */
    updateBranchGate: function (px, pz) {
      if (!forkOpen || inRoute) return;
      if (px < gapMinX || px > gapMaxX) return;
      if (pz < gateZ) return;
      enterRoute();
    },
    /** 路线内部：踩进死路尽头就送回岔路口，不会卡在地图外 */
    updateRoute: function (px, pz) {
      if (!inRoute) return;
      for (var i = 0; i < backZones.length; i++) {
        var b = backZones[i];
        if (px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ) {
          sendBackToFork("这条路是死的。白色走廊把你送回了岔路口。");
          return;
        }
      }
    },
    consumeTeleport: function () {
      var out = pendingTeleport;
      pendingTeleport = null;
      return out;
    },
    isActive: function () {
      return inRoute;
    },
    isForkOpen: function () {
      return forkOpen;
    },
    getAimInteractRoots: function () {
      return inRoute ? aimRoots : [];
    },
    handleDoor: function (data) {
      if (!inRoute || !data) return false;
      if (data.kind === "hub_canteen_food") {
        onEatFood();
        return true;
      }
      if (data.kind === "hub_canteen_exit") {
        onEnterCanteen();
        return true;
      }
      if (data.kind !== "hub_route_door") return false;
      if (data.room === 1) {
        if (data.letter === "B") {
          pendingTeleport = { x: ROUTE_X, z: ROUTE_Z + 80, yaw: Math.PI };
          showToast("写着 B 的门后是另一个一模一样的 7×7 房间。");
        } else {
          sendBackToFork("写着 A 的门后是空的。你被推回了岔路口。");
        }
        return true;
      }
      if (data.room === 2) {
        if (data.letter === "A") {
          onEnterHub();
        } else {
          sendBackToFork("写着 B 的门后是空的。你被推回了岔路口。");
        }
        return true;
      }
      return false;
    },
  };
}

/**
 * Level 6.1 零食室 — 大厅、档口、Clippers、MEG 铁门、出口墙。
 */
import * as THREE from "three";
import {
  L61_BLUE_WALL,
  L61_CLOSED,
  L61_CLIPPERS,
  L61_GIB,
  L61_GLASS,
  L61_HALF_D,
  L61_HALF_W,
  L61_IRON_DOOR,
  L61_JAM_ALCOVE,
  L61_JAM_GATE,
  L61_MEG,
  L61_MEG_ROOM,
  L61_PAINTING,
  L61_PAINTING_YAW,
  L61_ROOM_D,
  L61_ROOM_W,
  L61_STAFF,
  L61_TABLES,
  L61_VENDORS,
  L61_VENT,
  L61_VENT_PICK,
  L61_WALL_H,
  wallCollider,
} from "./backrooms-level6-1-layout.js";

const SNACK_COLORS = [0xe85d4c, 0xf0c040, 0x4caf7a, 0x5b7fd6, 0xd67ab8, 0xf28b3c];

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function addPick(root, interactRoots, w, h, d, x, y, z, kind, extra) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = Object.assign({ kind: kind }, extra || {});
  root.add(pick);
  interactRoots.push(pick);
  return pick;
}

function signTexture(title, sub, bg, fg) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  var g = canvas.getContext("2d");
  g.fillStyle = bg || "#2a1c14";
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = fg || "#f3d9a4";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 172);
  g.fillStyle = fg || "#f3d9a4";
  g.textAlign = "center";
  g.font = "bold 42px sans-serif";
  g.fillText(title || "", 256, sub ? 88 : 112);
  if (sub) {
    g.font = "26px sans-serif";
    g.fillStyle = "#d8c49a";
    g.fillText(sub, 256, 140);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeCommunityPaintingTexture() {
  var canvas2d = document.createElement("canvas");
  canvas2d.width = 512;
  canvas2d.height = 320;
  var ctx = canvas2d.getContext("2d");
  var sky = ctx.createLinearGradient(0, 0, 0, 210);
  sky.addColorStop(0, "#849aa8");
  sky.addColorStop(1, "#d5c6a1");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = "#646c70";
  var i;
  for (i = 0; i < 12; i++) {
    var h = 70 + ((i * 37) % 110);
    ctx.fillRect(i * 46 - 12, 210 - h, 34, h);
  }
  ctx.fillStyle = "#4d5947";
  ctx.fillRect(0, 210, 512, 110);
  ctx.fillStyle = "#f4ead0";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("和爱社区", 256, 286);
  var texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addNpc(root, interactRoots, x, z, kind, bodyColor, vestColor, pickX, pickZ) {
  var body = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.78 });
  var vest = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.7 });
  var skin = new THREE.MeshStandardMaterial({ color: 0xc9b09a, roughness: 0.62 });
  addBox(root, 0.42, 0.95, 0.28, x, 0.95, z, body);
  addBox(root, 0.46, 0.42, 0.3, x, 1.28, z + 0.01, vest);
  addBox(root, 0.28, 0.28, 0.26, x, 1.68, z, skin);
  addPick(
    root,
    interactRoots,
    0.7,
    1.9,
    0.7,
    pickX != null ? pickX : x,
    1.05,
    pickZ != null ? pickZ : z,
    kind
  );
}

function addTableSet(root, colliders, x, z, mats) {
  addBox(root, 1.15, 0.08, 1.15, x, 0.78, z, mats.wood);
  addBox(root, 0.1, 0.74, 0.1, x, 0.37, z, mats.woodDark);
  addBox(root, 0.36, 0.08, 0.36, x - 0.62, 0.46, z + 0.55, mats.woodDark);
  addBox(root, 0.36, 0.08, 0.36, x + 0.62, 0.46, z + 0.55, mats.woodDark);
  addBox(root, 0.36, 0.08, 0.36, x, 0.46, z - 0.62, mats.woodDark);
  colliders.push(wallCollider(x - 0.58, x + 0.58, z - 0.58, z + 0.58));
}

function addVending(root, colliders, interactRoots, spec, mats) {
  var x = spec.x;
  var z = spec.z;
  addBox(root, 0.92, 1.95, 0.7, x, 0.98, z, mats.vending);
  addBox(root, 0.72, 1.15, 0.06, x, 1.15, z + 0.34, mats.vendingGlass);
  addBox(root, 0.78, 0.22, 0.05, x, 1.92, z + 0.36, mats.vendingLabel);
  var r;
  var c;
  for (r = 0; r < 3; r++) {
    for (c = 0; c < 3; c++) {
      var color = SNACK_COLORS[(r * 2 + c + spec.id.charCodeAt(1)) % SNACK_COLORS.length];
      var snack = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.55,
        emissive: color,
        emissiveIntensity: 0.08,
      });
      addBox(root, 0.16, 0.16, 0.12, x - 0.22 + c * 0.22, 0.72 + r * 0.32, z + 0.22, snack);
    }
  }
  colliders.push(wallCollider(x - 0.5, x + 0.5, z - 0.4, z + 0.4));
  addPick(root, interactRoots, 1.05, 2.1, 0.95, x, 1.05, z, "l61_vending", {
    id: spec.id,
    item: spec.item,
    itemName: spec.name,
  });
}

function addFridge(root, colliders, interactRoots, spec, mats) {
  var x = spec.x;
  var z = spec.z;
  addBox(root, 0.95, 1.85, 0.72, x, 0.93, z, mats.fridge);
  addBox(root, 0.78, 1.35, 0.06, x, 1.05, z + 0.34, mats.fridgeGlass);
  colliders.push(wallCollider(x - 0.5, x + 0.5, z - 0.4, z + 0.4));
  addPick(root, interactRoots, 1.05, 2.0, 0.95, x, 1.0, z, "l61_fridge", {
    id: spec.id,
    item: spec.item,
    itemName: spec.name,
  });
}

function addOpenShelf(root, colliders, interactRoots, spec, mats) {
  var x = spec.x;
  var z = spec.z;
  addBox(root, 0.08, 1.85, 0.48, x - 0.7, 0.95, z, mats.metal);
  addBox(root, 0.08, 1.85, 0.48, x + 0.7, 0.95, z, mats.metal);
  var row;
  for (row = 0; row < 3; row++) {
    addBox(root, 1.32, 0.06, 0.46, x, 0.5 + row * 0.52, z, mats.board);
    var col;
    for (col = 0; col < 4; col++) {
      var color = SNACK_COLORS[(row + col) % SNACK_COLORS.length];
      addBox(
        root,
        0.22,
        0.16,
        0.16,
        x - 0.48 + col * 0.32,
        0.64 + row * 0.52,
        z + 0.04,
        new THREE.MeshStandardMaterial({ color: color, roughness: 0.55 })
      );
    }
  }
  colliders.push(wallCollider(x - 0.78, x + 0.78, z - 0.3, z + 0.3));
  addPick(root, interactRoots, 1.6, 2.0, 0.8, x, 1.0, z, "l61_shelf", {
    id: spec.id,
    item: spec.item,
    itemName: spec.name,
  });
}

function addHallShell(root, colliders, mats) {
  addBox(root, L61_ROOM_W, 0.12, L61_ROOM_D, 0, 0.06, 0, mats.floor);
  addBox(root, 2.5, 0.12, 0.85, 0, 0.06, L61_HALF_D + 0.32, mats.floor);
  addBox(root, L61_ROOM_W, 0.1, L61_ROOM_D, 0, L61_WALL_H, 0, mats.ceil);

  addBox(root, L61_ROOM_W, L61_WALL_H, 0.18, 0, L61_WALL_H * 0.5, -L61_HALF_D, mats.wall);
  addBox(root, 0.18, L61_WALL_H, L61_ROOM_D, L61_HALF_W, L61_WALL_H * 0.5, 0, mats.wall);
  addBox(root, 0.18, L61_WALL_H, L61_ROOM_D, -L61_HALF_W, L61_WALL_H * 0.5, 0, mats.wall);

  var southWingW = (L61_ROOM_W - 2.1) * 0.5;
  addBox(
    root,
    southWingW,
    L61_WALL_H,
    0.18,
    -L61_HALF_W + southWingW * 0.5,
    L61_WALL_H * 0.5,
    L61_HALF_D,
    mats.wall
  );
  addBox(
    root,
    southWingW,
    L61_WALL_H,
    0.18,
    L61_HALF_W - southWingW * 0.5,
    L61_WALL_H * 0.5,
    L61_HALF_D,
    mats.wall
  );
  addBox(root, 2.1, 0.55, 0.18, 0, L61_WALL_H - 0.275, L61_HALF_D, mats.wall);

  colliders.push(wallCollider(-L61_HALF_W - 0.2, L61_HALF_W + 0.2, -L61_HALF_D - 0.2, -L61_HALF_D + 0.12));
  colliders.push(wallCollider(-L61_HALF_W - 0.2, -L61_HALF_W + 0.12, -L61_HALF_D, L61_HALF_D));
  colliders.push(wallCollider(L61_HALF_W - 0.12, L61_HALF_W + 0.2, -L61_HALF_D, L61_HALF_D));
  colliders.push(wallCollider(-L61_HALF_W, -L61_GLASS.halfW, L61_HALF_D - 0.12, L61_HALF_D + 0.2));
  colliders.push(wallCollider(L61_GLASS.halfW, L61_HALF_W, L61_HALF_D - 0.12, L61_HALF_D + 0.2));
}

function addClippers(root, colliders, mats) {
  var c = L61_CLIPPERS;
  addBox(root, c.maxX - c.minX, 0.04, c.maxZ - c.minZ, (c.minX + c.maxX) * 0.5, 0.13, (c.minZ + c.maxZ) * 0.5, mats.woodFloor);
  var northLen = c.doorMinZ - c.minZ;
  var southLen = c.maxZ - c.doorMaxZ;
  addBox(root, 0.16, L61_WALL_H, northLen, c.wallX, L61_WALL_H * 0.5, c.minZ + northLen * 0.5, mats.redWall);
  addBox(root, 0.16, L61_WALL_H, southLen, c.wallX, L61_WALL_H * 0.5, c.doorMaxZ + southLen * 0.5, mats.redWall);
  addBox(root, 0.16, 0.95, c.doorMaxZ - c.doorMinZ, c.wallX, L61_WALL_H - 0.48, (c.doorMinZ + c.doorMaxZ) * 0.5, mats.redWall);
  addBox(root, c.maxX - c.minX, L61_WALL_H, 0.16, (c.minX + c.maxX) * 0.5, L61_WALL_H * 0.5, c.minZ, mats.redWall);
  addBox(root, c.maxX - c.minX, L61_WALL_H, 0.16, (c.minX + c.maxX) * 0.5, L61_WALL_H * 0.5, c.maxZ, mats.redWall);

  colliders.push(wallCollider(c.wallX - 0.12, c.wallX + 0.12, c.minZ, c.doorMinZ));
  colliders.push(wallCollider(c.wallX - 0.12, c.wallX + 0.12, c.doorMaxZ, c.maxZ));
  colliders.push(wallCollider(c.minX, c.maxX, c.minZ - 0.12, c.minZ + 0.12));
  colliders.push(wallCollider(c.minX, c.maxX, c.maxZ - 0.12, c.maxZ + 0.12));

  addBox(root, 0.7, 1.05, 4.1, -10.55, 0.55, 1.15, mats.wood);
  colliders.push(wallCollider(-10.95, -10.15, -0.85, 3.15));
  addBox(root, 0.32, 0.08, 0.32, -9.75, 0.48, 0.15, mats.woodDark);
  addBox(root, 0.32, 0.08, 0.32, -9.75, 0.48, 1.15, mats.woodDark);
  addBox(root, 0.32, 0.08, 0.32, -9.75, 0.48, 2.15, mats.woodDark);

  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.7),
    new THREE.MeshBasicMaterial({ map: signTexture("CLIPPERS", "est. 1954", "#4a1014", "#f4c97a") })
  );
  sign.position.set(-9.4, 2.45, c.minZ + 0.1);
  root.add(sign);
}

function addStalls(root, colliders, interactRoots, mats) {
  addBox(root, L61_GIB.maxX - L61_GIB.minX, 1.08, 0.42, (L61_GIB.minX + L61_GIB.maxX) * 0.5, 0.54, L61_GIB.counterZ, mats.wood);
  addBox(root, 0.16, L61_WALL_H, 2.55, L61_GIB.minX, L61_WALL_H * 0.5, -6.7, mats.wall);
  addBox(root, 0.16, L61_WALL_H, 2.55, L61_GIB.maxX, L61_WALL_H * 0.5, -6.7, mats.wall);
  colliders.push(wallCollider(L61_GIB.minX, L61_GIB.maxX, L61_GIB.counterZ - 0.24, L61_GIB.counterZ + 0.24));
  colliders.push(wallCollider(L61_GIB.minX - 0.12, L61_GIB.minX + 0.12, -8, -5.4));
  colliders.push(wallCollider(L61_GIB.maxX - 0.12, L61_GIB.maxX + 0.12, -8, -5.4));

  var gibSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.7),
    new THREE.MeshBasicMaterial({ map: signTexture("Gib's Grub", "不用付钱", "#3a2a18", "#f6e2b0") })
  );
  gibSign.position.set((L61_GIB.minX + L61_GIB.maxX) * 0.5, 2.5, L61_GIB.counterZ + 0.24);
  root.add(gibSign);

  addNpc(
    root,
    interactRoots,
    L61_STAFF.x,
    L61_STAFF.z,
    "l61_staff",
    0xd8c4a8,
    0xc45a3a,
    L61_STAFF.x,
    L61_GIB.counterZ + 0.42
  );

  addBox(
    root,
    L61_CLOSED.maxX - L61_CLOSED.minX,
    2.35,
    0.1,
    (L61_CLOSED.minX + L61_CLOSED.maxX) * 0.5,
    1.2,
    L61_CLOSED.shutterZ,
    mats.shutter
  );
  addBox(root, 0.16, L61_WALL_H, 2.55, L61_CLOSED.minX, L61_WALL_H * 0.5, -6.7, mats.wall);
  addBox(root, 0.16, L61_WALL_H, 2.55, L61_CLOSED.maxX, L61_WALL_H * 0.5, -6.7, mats.wall);
  colliders.push(
    wallCollider(L61_CLOSED.minX, L61_CLOSED.maxX, L61_CLOSED.shutterZ - 0.16, L61_CLOSED.shutterZ + 0.16)
  );
  addPick(
    root,
    interactRoots,
    L61_CLOSED.maxX - L61_CLOSED.minX,
    2.2,
    0.5,
    (L61_CLOSED.minX + L61_CLOSED.maxX) * 0.5,
    1.15,
    L61_CLOSED.shutterZ + 0.2,
    "l61_shutter"
  );

  var shutSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.62),
    new THREE.MeshBasicMaterial({ map: signTexture("本周补货中", "", "#2c2c2c", "#e8d08a") })
  );
  shutSign.position.set((L61_CLOSED.minX + L61_CLOSED.maxX) * 0.5, 2.48, L61_CLOSED.shutterZ + 0.08);
  root.add(shutSign);
}

function addMegRoom(root, colliders, interactRoots, mats) {
  var m = L61_MEG_ROOM;
  var megNorth = m.doorMinZ - m.minZ;
  var megSouth = m.maxZ - m.doorMaxZ;
  addBox(root, 0.16, L61_WALL_H, megNorth, m.wallX, L61_WALL_H * 0.5, m.minZ + megNorth * 0.5, mats.megWall);
  addBox(root, 0.16, L61_WALL_H, megSouth, m.wallX, L61_WALL_H * 0.5, m.doorMaxZ + megSouth * 0.5, mats.megWall);
  addBox(root, 0.16, 0.95, m.doorMaxZ - m.doorMinZ, m.wallX, L61_WALL_H - 0.48, (m.doorMinZ + m.doorMaxZ) * 0.5, mats.megWall);
  addBox(root, m.maxX - m.minX, L61_WALL_H, 0.16, (m.minX + m.maxX) * 0.5, L61_WALL_H * 0.5, m.maxZ, mats.megWall);
  colliders.push(wallCollider(m.wallX - 0.12, m.wallX + 0.12, m.minZ, m.doorMinZ));
  colliders.push(wallCollider(m.wallX - 0.12, m.wallX + 0.12, m.doorMaxZ, m.maxZ));
  colliders.push(wallCollider(m.minX, m.maxX, m.maxZ - 0.12, m.maxZ + 0.12));

  addBox(root, 1.05, 2.25, 0.1, L61_IRON_DOOR.x - 0.12, 1.15, L61_IRON_DOOR.z, mats.iron);
  addBox(root, 0.16, 0.16, 0.08, L61_IRON_DOOR.x - 0.2, 1.15, L61_IRON_DOOR.z + 0.08, mats.metal);
  addBox(root, 0.9, 2.1, 0.04, L61_IRON_DOOR.x - 0.05, 1.15, L61_IRON_DOOR.z, mats.darkVoid);
  addPick(root, interactRoots, 1.2, 2.4, 0.55, L61_IRON_DOOR.x - 0.25, 1.2, L61_IRON_DOOR.z, "l61_iron_door");

  addBox(root, 0.85, 0.85, 0.55, 9.7, 0.45, -6.55, mats.metal);
  colliders.push(wallCollider(9.25, 10.15, -6.9, -6.2));
  addNpc(root, interactRoots, L61_MEG.x, L61_MEG.z, "l61_meg", 0x3a4038, 0x2f4a32);

  var megSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.55),
    new THREE.MeshBasicMaterial({ map: signTexture("M.E.G.", "通行前哨", "#1c2418", "#c8d4b4") })
  );
  megSign.position.set(9.55, 2.45, m.maxZ + 0.1);
  root.add(megSign);
}

function addJamAlcove(root, colliders, interactRoots, mats) {
  var a = L61_JAM_ALCOVE;
  addBox(root, a.maxX - a.minX, L61_WALL_H, 0.16, (a.minX + a.maxX) * 0.5, L61_WALL_H * 0.5, a.minZ, mats.wall);
  colliders.push(wallCollider(a.minX, a.maxX, a.minZ - 0.12, a.minZ + 0.12));
  colliders.push(wallCollider(L61_JAM_GATE.minX, L61_JAM_GATE.maxX, L61_JAM_GATE.minZ, L61_JAM_GATE.maxZ));
  var xs = [8.55, 9.55, 10.55];
  var i;
  for (i = 0; i < xs.length; i++) {
    addBox(root, 0.9, 1.95, 0.72, xs[i], 0.98, 4.35 + (i % 2) * 0.85, mats.vendingDead);
    colliders.push(wallCollider(xs[i] - 0.5, xs[i] + 0.5, 3.9, 5.7));
  }
  var gateZ = [3.7, 5.15, 6.6];
  for (i = 0; i < gateZ.length; i++) {
    addBox(root, 0.72, 1.95, 0.9, 8.28, 0.98, gateZ[i], mats.vendingDead);
  }
  addPick(root, interactRoots, 1.4, 2.1, 1.1, 8.22, 1.05, 4.8, "l61_jammed");
}

function addWarpedWall(root, colliders, interactRoots, mats) {
  var i;
  for (i = 0; i < 5; i++) {
    var yaw = -0.28 + i * 0.14;
    var mesh = addBox(root, 0.55, 2.55, 0.14, L61_BLUE_WALL.x + i * 0.42, 1.3, L61_BLUE_WALL.z + Math.sin(i * 0.7) * 0.18, mats.warp);
    mesh.rotation.y = yaw;
  }
  colliders.push(
    wallCollider(L61_BLUE_WALL.x - 0.2, L61_BLUE_WALL.x + 2.1, L61_BLUE_WALL.z - 0.22, L61_BLUE_WALL.z + 0.12)
  );
  addPick(root, interactRoots, 2.4, 2.6, 0.7, L61_BLUE_WALL.x + 0.85, 1.3, L61_BLUE_WALL.z + 0.22, "l61_blue_wall");
}

function addGlassDoor(root, interactRoots, mats) {
  var pivot = new THREE.Group();
  pivot.position.set(-L61_GLASS.halfW, 0, L61_HALF_D - 0.05);
  root.add(pivot);
  addBox(pivot, 2.05, 2.4, 0.08, L61_GLASS.halfW, 1.22, 0, mats.metal);
  addBox(pivot, 1.72, 2.1, 0.04, L61_GLASS.halfW, 1.22, 0.02, mats.glass);
  addPick(pivot, interactRoots, 2.1, 2.45, 0.4, L61_GLASS.halfW, 1.22, 0, "l61_glass_door");
  return {
    pivot: pivot,
    collider: wallCollider(-L61_GLASS.halfW, L61_GLASS.halfW, L61_HALF_D - 0.12, L61_HALF_D + 0.2),
  };
}

function addSidePainting(root, interactRoots, mats) {
  addBox(root, 0.1, 1.7, 2.15, L61_PAINTING.x - 0.08, 1.55, L61_PAINTING.z, mats.frame);
  var painting = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.4),
    new THREE.MeshBasicMaterial({ map: makeCommunityPaintingTexture() })
  );
  painting.position.set(L61_PAINTING.x - 0.16, 1.55, L61_PAINTING.z);
  painting.rotation.y = L61_PAINTING_YAW;
  painting.material.side = THREE.DoubleSide;
  root.add(painting);
  addPick(root, interactRoots, 0.5, 1.8, 2.2, L61_PAINTING.x - 0.28, 1.55, L61_PAINTING.z, "l61_c144_painting");
}

function addVent(root, interactRoots, mats) {
  addBox(root, 0.55, 0.5, 0.85, L61_VENT.x + 0.08, L61_VENT.y, L61_VENT.z, mats.vent);
  addBox(root, 0.06, 0.38, 0.62, L61_VENT.x + 0.32, L61_VENT.y, L61_VENT.z, mats.metal);
  addPick(
    root,
    interactRoots,
    L61_VENT_PICK.w,
    L61_VENT_PICK.h,
    L61_VENT_PICK.d,
    L61_VENT_PICK.x,
    L61_VENT_PICK.y,
    L61_VENT_PICK.z,
    "l61_vent"
  );
}

function addLights(root) {
  root.add(new THREE.AmbientLight(0xfff2dc, 0.48));
  root.add(new THREE.HemisphereLight(0xfff4e4, 0x8a7060, 0.42));
  var spots = [
    [0, L61_WALL_H - 0.4, 1.2, 0.7],
    [-9.4, 2.7, 1.1, 0.55],
    [-2.8, L61_WALL_H - 0.4, -5.2, 0.5],
    [9.4, L61_WALL_H - 0.45, -5.4, 0.4],
    [0, L61_WALL_H - 0.4, 6.2, 0.45],
  ];
  var i;
  for (i = 0; i < spots.length; i++) {
    var lamp = new THREE.PointLight(0xffe6c0, spots[i][3], 16, 2);
    lamp.position.set(spots[i][0], spots[i][1], spots[i][2]);
    root.add(lamp);
  }
}

export function buildLevel61World(root, opts) {
  opts = opts || {};
  var colliders = opts.colliders || [];
  var interactRoots = opts.interactRoots || [];

  var mats = {
    floor: new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.92 }),
    woodFloor: new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 0.86 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xf0ebe3, roughness: 0.9 }),
    redWall: new THREE.MeshStandardMaterial({ color: 0x8b1e24, roughness: 0.82 }),
    megWall: new THREE.MeshStandardMaterial({ color: 0x5a5e52, roughness: 0.88 }),
    ceil: new THREE.MeshStandardMaterial({
      color: 0xf7f0e4,
      emissive: 0xe8d8c0,
      emissiveIntensity: 0.16,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x7a828c, metalness: 0.45, roughness: 0.4 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.62, roughness: 0.38 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xb8d4e8,
      transparent: true,
      opacity: 0.38,
      roughness: 0.15,
      metalness: 0.08,
      depthWrite: false,
    }),
    vent: new THREE.MeshStandardMaterial({ color: 0x555c66, metalness: 0.55, roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.78 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.82 }),
    board: new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.85 }),
    vending: new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.45, metalness: 0.35 }),
    vendingDead: new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.7, metalness: 0.15 }),
    vendingGlass: new THREE.MeshStandardMaterial({
      color: 0x88c4e0,
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      depthWrite: false,
    }),
    vendingLabel: new THREE.MeshStandardMaterial({
      map: signTexture("FREE", "免费", "#1a1a1a", "#f2d27a"),
      roughness: 0.5,
    }),
    fridge: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.4 }),
    fridgeGlass: new THREE.MeshStandardMaterial({
      color: 0xa8d0e8,
      transparent: true,
      opacity: 0.28,
      roughness: 0.12,
      depthWrite: false,
    }),
    shutter: new THREE.MeshStandardMaterial({ color: 0x4a4e54, metalness: 0.4, roughness: 0.5 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x4a3425, roughness: 0.72 }),
    warp: new THREE.MeshStandardMaterial({
      color: 0x3a6aa8,
      emissive: 0x1a3a88,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    }),
    darkVoid: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 1 }),
  };

  addHallShell(root, colliders, mats);
  addClippers(root, colliders, mats);
  addStalls(root, colliders, interactRoots, mats);
  addMegRoom(root, colliders, interactRoots, mats);
  addJamAlcove(root, colliders, interactRoots, mats);
  addWarpedWall(root, colliders, interactRoots, mats);
  addSidePainting(root, interactRoots, mats);
  addVent(root, interactRoots, mats);

  var i;
  for (i = 0; i < L61_TABLES.length; i++) {
    addTableSet(root, colliders, L61_TABLES[i].x, L61_TABLES[i].z, mats);
  }
  for (i = 0; i < L61_VENDORS.length; i++) {
    var spec = L61_VENDORS[i];
    if (spec.kind === "fridge") addFridge(root, colliders, interactRoots, spec, mats);
    else if (spec.kind === "shelf") addOpenShelf(root, colliders, interactRoots, spec, mats);
    else addVending(root, colliders, interactRoots, spec, mats);
  }

  var door = addGlassDoor(root, interactRoots, mats);
  colliders.push(door.collider);
  addLights(root);

  return {
    glassDoorPivot: door.pivot,
    glassDoorCollider: door.collider,
  };
}

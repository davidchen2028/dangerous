/**
 * Level C-1166 单宫几何。调用方每次只装一宫，并自己清空碰撞表。
 */
import * as THREE from "three";
import {
  C1166_PILL_ORANGE,
  C1166_PILL_WHITE,
  c1166ItemName,
} from "./backrooms-level-c1166-pills.js";

export const C1166_ROOM_RADIUS = 14;
export const C1166_ROOM_HEIGHT = 4.5;

var COPPER = 0x8a4a28;
var COPPER_DARK = 0x4a2614;
var ASH = 0x3a3836;

function copperMat(color, emissive, intensity) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.42,
    metalness: 0.72,
    emissive: emissive || 0x000000,
    emissiveIntensity: intensity || 0,
    side: THREE.FrontSide,
  });
}

function addBox(parent, mat, w, h, d, x, y, z, colliders) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  if (colliders) {
    colliders.push({
      minX: x - w * 0.5,
      maxX: x + w * 0.5,
      minZ: z - d * 0.5,
      maxZ: z + d * 0.5,
    });
  }
  return mesh;
}

function addPick(parent, roots, x, y, z, sx, sy, sz, data) {
  var mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  mesh.position.set(x, y, z);
  data.pick = mesh;
  mesh.userData.brInteract = data;
  parent.add(mesh);
  roots.push(mesh);
  return mesh;
}

function addRing(parent, colliders, radius, height, mat) {
  var seg = 20;
  var i;
  var arc = (Math.PI * 2) / seg;
  var chord = 2 * radius * Math.sin(arc * 0.5) + 0.28;
  for (i = 0; i < seg; i++) {
    var a = arc * (i + 0.5);
    var x = Math.sin(a) * radius;
    var z = Math.cos(a) * radius;
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(chord, height, 0.55), mat);
    mesh.position.set(x, height * 0.5, z);
    mesh.rotation.y = -a;
    parent.add(mesh);
    colliders.push({
      minX: x - 0.7,
      maxX: x + 0.7,
      minZ: z - 0.7,
      maxZ: z + 0.7,
    });
  }
}

function addDome(parent, radius, wallH) {
  var geo = new THREE.SphereGeometry(radius, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  geo.scale(1, 0.45, 1);
  var mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: COPPER_DARK,
      roughness: 0.5,
      metalness: 0.66,
      side: THREE.BackSide,
    })
  );
  mesh.position.y = wallH;
  parent.add(mesh);
}

function addFloor(parent, radius) {
  var mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.2, 28),
    copperMat(0x6e3b20, 0x2a1008, 0.08)
  );
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.y = 0.02;
  parent.add(mesh);
}

function addTorch(parent, x, z) {
  var post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6),
    copperMat(0x5c331c)
  );
  post.position.set(x, 1.5, z);
  parent.add(post);
  var flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff6a2a })
  );
  flame.position.set(x, 2.15, z);
  parent.add(flame);
  var light = new THREE.PointLight(0xff6a2a, 2.1, 15, 2);
  light.position.set(x, 2.2, z);
  parent.add(light);
  return { x: x, z: z };
}

function circleRoom(parent, colliders, radius) {
  addFloor(parent, radius);
  addRing(parent, colliders, radius, C1166_ROOM_HEIGHT, copperMat(COPPER));
  addDome(parent, radius, C1166_ROOM_HEIGHT);
}

function npc(parent, roots, x, z, color, kind, name) {
  var body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })
  );
  body.position.set(x, 0.95, z);
  parent.add(body);
  addPick(parent, roots, x, 1.1, z, 0.7, 1.8, 0.7, { kind: kind, name: name });
}

export function buildC1166Palace(id, parent, colliders, interactRoots) {
  var radius = C1166_ROOM_RADIUS;
  var torches = [];
  var puddles = [];
  var ashes = [];
  var kunRing = null;
  var gong = null;
  var bridgeEnd = null;
  var i;

  if (id !== "li") {
    circleRoom(parent, colliders, radius);
    var baseAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    var count = id === "kan" || id === "dui" ? 8 : 4;
    for (i = 0; i < count; i++) {
      var a = (baseAngles[i] * Math.PI) / 180;
      torches.push(addTorch(parent, Math.sin(a) * (radius - 1.3), Math.cos(a) * (radius - 1.3)));
    }
  }

  if (id === "kan") {
    addPick(parent, interactRoots, 0, 1.15, -6, 1.6, 2.2, 0.7, { kind: "c1166_door" });
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.15, 20),
      new THREE.MeshBasicMaterial({ color: 0xffb060, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.set(0, 0.05, -6);
    parent.add(ring);
    var grounds = [
      { id: C1166_PILL_WHITE, x: 2.2, z: 2.4 },
      { id: C1166_PILL_WHITE, x: -2.4, z: 3 },
      { id: C1166_PILL_ORANGE, x: 1.2, z: -2.2 },
    ];
    for (i = 0; i < grounds.length; i++) {
      var pill = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshStandardMaterial({
          color: grounds[i].id === C1166_PILL_ORANGE ? 0xe07020 : 0xf4efe6,
          roughness: 0.45,
        })
      );
      pill.position.set(grounds[i].x, 0.16, grounds[i].z);
      parent.add(pill);
      addPick(parent, interactRoots, grounds[i].x, 0.3, grounds[i].z, 0.4, 0.4, 0.4, {
        kind: "c1166_ground",
        itemId: grounds[i].id,
        name: c1166ItemName(grounds[i].id),
        mesh: pill,
      });
    }
  }

  if (id === "kun") {
    kunRing = { x: 0, z: -6, radius: 3 };
    var mark = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3, 28),
      new THREE.MeshBasicMaterial({ color: 0xf0d2a0, side: THREE.DoubleSide })
    );
    mark.rotation.x = -Math.PI * 0.5;
    mark.position.set(0, 0.06, -6);
    parent.add(mark);
    addPick(parent, interactRoots, 0, 0.9, -6, 2.4, 1.6, 2.4, { kind: "c1166_floor" });
  }

  if (id === "zhen") {
    gong = { x: 10, z: 0 };
    addBox(parent, copperMat(0xc47a3a, 0xff6a2a, 0.35), 1.1, 1.1, 0.18, 10, 1.5, 0, null);
    addPick(parent, interactRoots, 10, 1.5, 0, 1.2, 1.4, 0.6, { kind: "c1166_gong" });
  }

  if (id === "xun") {
    npc(parent, interactRoots, -3.2, -2, 0xc8d0d6, "c1166_meg", "M.E.G. 炼丹坊");
    npc(parent, interactRoots, 3.2, -2, 0x8d2e16, "c1166_dan", "丹宗");
    addBox(parent, copperMat(0xd7c4a1), 1.4, 2.4, 0.2, 0, 1.2, 11, null);
    addPick(parent, interactRoots, 0, 1.2, 10.2, 1.6, 2.2, 0.5, { kind: "c1166_to_qian" });
  }

  if (id === "qian") {
    addBox(parent, copperMat(0xd7c4a1), 1.4, 2.4, 0.2, 0, 1.2, 11, null);
    addPick(parent, interactRoots, 0, 1.2, 10.2, 1.6, 2.2, 0.5, { kind: "c1166_to_xun" });
  }

  if (id === "dui") {
    var spots = [
      { x: 4, z: 4 },
      { x: -5, z: 2 },
      { x: 3, z: -6 },
      { x: -4, z: -3 },
    ];
    for (i = 0; i < spots.length; i++) {
      puddles.push({ x: spots[i].x, z: spots[i].z, radius: 1.6 });
      var water = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 16),
        new THREE.MeshStandardMaterial({
          color: 0x6a3a28,
          roughness: 0.2,
          metalness: 0.4,
          transparent: true,
          opacity: 0.85,
        })
      );
      water.rotation.x = -Math.PI * 0.5;
      water.position.set(spots[i].x, 0.05, spots[i].z);
      parent.add(water);
    }
    addBox(parent, copperMat(0xf0d2a0, 0xffb060, 0.2), 2.4, 2.6, 0.3, 0, 1.3, -12, null);
    addPick(parent, interactRoots, 0, 1.2, -11.2, 2, 2.2, 0.6, {
      kind: "c1166_arch",
      to: "gen",
    });
  }

  if (id === "gen") {
    for (i = 0; i < 6; i++) {
      var ax = i % 2 === 0 ? -1.4 : 1.4;
      var az = 5 - i * 2.2;
      ashes.push({
        index: i,
        x: ax,
        z: az,
        buried: i === 1 || i === 4,
        burning: i === 3,
      });
      var mound = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 10, 8),
        new THREE.MeshStandardMaterial({
          color: i === 3 ? 0x6a2a12 : ASH,
          emissive: i === 3 ? 0xff4a12 : 0x000000,
          emissiveIntensity: i === 3 ? 0.6 : 0,
          roughness: 1,
        })
      );
      mound.scale.y = 0.45;
      mound.position.set(ax, 0.2, az);
      parent.add(mound);
    }
    addBox(parent, copperMat(0xf0d2a0, 0xffb060, 0.2), 2.4, 2.6, 0.3, 0, 1.3, -12, null);
    addPick(parent, interactRoots, 0, 1.2, -11.2, 2, 2.2, 0.6, {
      kind: "c1166_arch",
      to: "li",
    });
  }

  if (id === "li") {
    bridgeEnd = -40;
    var deck = copperMat(0x5c3018);
    addBox(parent, deck, 6, 0.3, 6, 0, 0.15, 0, null);
    addBox(parent, deck, 1.2, 0.2, 36, 0, 0.2, -22, null);
    addBox(parent, deck, 6, 0.3, 8, 0, 0.15, -44, null);
    addBox(parent, copperMat(COPPER_DARK), 0.12, 0.7, 36, -0.72, 0.55, -22, null);
    addBox(parent, copperMat(COPPER_DARK), 0.12, 0.7, 36, 0.72, 0.55, -22, null);
    addBox(parent, copperMat(COPPER), 0.4, 3, 8, -3.2, 1.5, 0, colliders);
    addBox(parent, copperMat(COPPER), 0.4, 3, 8, 3.2, 1.5, 0, colliders);
    addBox(parent, copperMat(COPPER), 0.4, 3, 8, -3.2, 1.5, -44, colliders);
    addBox(parent, copperMat(COPPER), 0.4, 3, 8, 3.2, 1.5, -44, colliders);
    var pit = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 36),
      new THREE.MeshBasicMaterial({ color: 0xff3a10 })
    );
    pit.rotation.x = -Math.PI * 0.5;
    pit.position.set(0, -2.2, -22);
    parent.add(pit);
    var fire = new THREE.PointLight(0xff4a18, 3.2, 18, 2);
    fire.position.set(0, 1.2, -16);
    parent.add(fire);
    torches.push(addTorch(parent, -2, 1));
    torches.push(addTorch(parent, 2, -43));
  }

  if (id === "zhong") {
    var pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.7, 3.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4d2 })
    );
    pillar.position.set(0, 1.6, -4);
    parent.add(pillar);
    var glow = new THREE.PointLight(0xfff1c2, 2.4, 12, 2);
    glow.position.set(0, 2.2, -4);
    parent.add(glow);
    addPick(parent, interactRoots, 0, 1.5, -4, 1.2, 3, 1.2, { kind: "c1166_pillar" });
  }

  return {
    spawnX: 0,
    spawnZ: id === "li" ? 1.2 : 8,
    spawnYaw: 0,
    kunRing: kunRing,
    gong: gong,
    puddles: puddles,
    torches: torches,
    ashes: ashes,
    bridgeEnd: bridgeEnd,
    sampleFloor: function (x, z) {
      if (id !== "li") return 0;
      if (z > -4 && z < 3 && Math.abs(x) < 3) return 0;
      if (z < -40 && z > -48 && Math.abs(x) < 3) return 0;
      if (z <= -4 && z >= -40 && Math.abs(x) <= 0.6) return 0;
      return -8;
    },
  };
}

export function disposeC1166Group(group) {
  if (!group) return;
  group.traverse(function (node) {
    if (node.geometry) node.geometry.dispose();
    var mats = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    for (var i = 0; i < mats.length; i++) {
      if (mats[i] && mats[i].dispose) mats[i].dispose();
    }
  });
  if (group.parent) group.parent.remove(group);
}

/**
 * Level XW-0 腐朽试练 — 五段固定廊道。
 * 墙地用程序几何；门、灯、尸体、桌椅、管道、窗和纸袋用共享 GLB。
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";

export const XW0_HEIGHT = 3;
export const XW0_SPAWN_X = 0;
export const XW0_SPAWN_Z = 3;

const HW = 1.7;
const WALL_T = 0.22;
const Z_BACK = 5.6;
const Z_END = -152;

const MODELS = {
  door: "models/level-xw0-double-door.glb",
  light: "models/level-xw0-light.glb",
  corpse: "models/level-xw0-corpse.glb",
  desk: "models/level-xw0-desk.glb",
  chair: "models/level-xw0-chair.glb",
  pipe: "models/level-xw0-pipe.glb",
  blue: "models/level-xw0-blue-door.glb",
  window: "models/level-xw0-window.glb",
  papers: "models/level-xw0-papers.glb",
  iron: "models/level-xw0-iron-door.glb",
};

const ROOMS = [
  { z: -24, side: 1, loot: "almond_water", name: "杏仁水" },
  { z: -36, side: -1, loot: "royal_rations", name: "最小有效分量皇家口粮" },
  { z: -58, side: 1, locked: true },
  { z: -70, side: -1, loot: "fire_salt", name: "火盐" },
  { z: -124, side: 1, blue: true, locked: true },
  { z: -136, side: -1, blue: true, loot: "canned_dragon_meat", name: "罐装龙肉" },
];

function mat(color, roughness, emissive, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: roughness,
    metalness: 0.04,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissiveIntensity || 0,
  });
}

function addBox(parent, material, w, h, d, x, y, z, colliders) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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

function wallSpans(z0, z1, gaps) {
  var cursor = z0;
  var spans = [];
  var list = gaps
    .filter(function (gap) {
      return gap.center < z0 - 0.2 && gap.center > z1 + 0.2;
    })
    .sort(function (a, b) {
      return b.center - a.center;
    });
  for (var i = 0; i < list.length; i++) {
    var top = list[i].center + list[i].half;
    var bot = list[i].center - list[i].half;
    if (cursor - top > 0.25) spans.push([cursor, top]);
    cursor = Math.min(cursor, bot);
  }
  if (cursor - z1 > 0.25) spans.push([cursor, z1]);
  return spans;
}

/**
 * @param {THREE.Object3D} root
 * @param {{ colliders: object[] }} opts
 */
export function buildBackroomsLevelXw0World(root, opts) {
  var colliders = opts.colliders;
  var interactRoots = [];
  var slots = [];
  var templates = Object.create(null);
  var doors = [];
  var pits = [];
  var hazards = [];
  var lurkers = [];
  var rubble = null;
  var rubbleCollider = null;

  var concrete = mat(0x6d7074, 0.92, 0x1a1c1e, 0.08);
  var rotten = mat(0x3c3e42, 0.94, 0x121316, 0.12);
  var floorMat = mat(0x2a2c2e, 0.96, 0x0c0d0e, 0.05);
  var wetFloor = mat(0x4a4e52, 0.72, 0x16181a, 0.06);
  var pitMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
  var rotMat = new THREE.MeshStandardMaterial({
    color: 0x140e0c,
    roughness: 0.28,
    metalness: 0.18,
    emissive: 0x1a0906,
    emissiveIntensity: 0.25,
  });
  var steamMat = new THREE.MeshBasicMaterial({
    color: 0xd8d2c8,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  var lurkerMat = new THREE.MeshBasicMaterial({
    color: 0xe6e0d6,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  function slot(key, x, y, z, rotY) {
    var group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY || 0;
    var placeholder = addBox(group, rotten, 0.4, 0.4, 0.4, 0, 0.2, 0, null);
    placeholder.name = "xw0-placeholder";
    root.add(group);
    slots.push({ key: key, group: group, placeholder: placeholder });
    return group;
  }

  function fill(key) {
    var source = templates[key];
    if (!source) return;
    for (var i = 0; i < slots.length; i++) {
      var entry = slots[i];
      if (entry.key !== key || entry.filled) continue;
      var clone = source.clone();
      if (entry.group.userData.hingeShift) clone.position.x = entry.group.userData.hingeShift;
      entry.group.add(clone);
      if (entry.placeholder) {
        entry.group.remove(entry.placeholder);
        entry.placeholder.geometry.dispose();
        entry.placeholder = null;
      }
      entry.filled = true;
    }
  }

  function loadModels() {
    var loader = new GLTFLoader();
    Object.keys(MODELS).forEach(function (key) {
      try {
        loader.load(MODELS[key], function (gltf) {
          var found = null;
          gltf.scene.traverse(function (child) {
            if (!found && child.isMesh) found = child;
          });
          if (!found) return;
          templates[key] = found;
          fill(key);
        });
      } catch (err) {
        console.warn("[XW-0] 模型加载失败", key, err);
      }
    });
  }

  function addSpanWall(material, x, zTop, zBot) {
    var depth = zTop - zBot;
    addBox(root, material, WALL_T, XW0_HEIGHT, depth, x, XW0_HEIGHT * 0.5, (zTop + zBot) * 0.5, colliders);
  }

  function buildRun(z0, z1, material, floorMaterial, gaps, options) {
    options = options || {};
    var left = [];
    var right = [];
    for (var i = 0; i < gaps.length; i++) {
      if (gaps[i].side < 0) left.push(gaps[i]);
      else right.push(gaps[i]);
    }
    wallSpans(z0, z1, left).forEach(function (span) {
      addSpanWall(material, -HW - WALL_T * 0.5, span[0], span[1]);
    });
    wallSpans(z0, z1, right).forEach(function (span) {
      addSpanWall(material, HW + WALL_T * 0.5, span[0], span[1]);
    });
    if (!options.skipFloor) {
      addBox(root, floorMaterial, HW * 2, 0.12, z0 - z1, 0, -0.06, (z0 + z1) * 0.5, null);
    }
    if (!options.skipCeil) {
      addBox(root, material, HW * 2, 0.12, z0 - z1, 0, XW0_HEIGHT + 0.06, (z0 + z1) * 0.5, null);
    }
  }

  function addDoor(spec) {
    var key = spec.blue ? "blue" : "door";
    var rot = spec.side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    var hinge = key === "blue" ? 0.48 : 0.775;
    var group = slot(key, spec.side * HW, 0, spec.z + (spec.side > 0 ? -hinge : hinge), rot);
    group.userData.hingeShift = -hinge;
    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.1, 0.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    pick.position.set(-hinge, 1.05, -0.45);
    pick.userData.brInteract = {
      kind: spec.blue ? "xw0_blue" : "xw0_door",
      door: spec,
    };
    group.add(pick);
    interactRoots.push(pick);
    var blocker = {
      minX: spec.side * HW - 0.16,
      maxX: spec.side * HW + 0.16,
      minZ: spec.z - 0.78,
      maxZ: spec.z + 0.78,
      kind: "xw0_door",
    };
    colliders.push(blocker);
    doors.push({ spec: spec, group: group, blocker: blocker, base: rot, open: false });
  }

  function addRoom(spec) {
    var side = spec.side;
    var depth = 3.1;
    var along = 3.3;
    var x0 = side * HW;
    var x1 = side * (HW + depth);
    var cx = (x0 + x1) * 0.5;
    var z0 = spec.z + along * 0.5;
    var z1 = spec.z - along * 0.5;
    var shell = spec.blue ? concrete : rotten;
    addBox(root, spec.blue ? wetFloor : floorMat, depth, 0.12, along, cx, -0.06, spec.z, null);
    addBox(root, shell, depth, 0.12, along, cx, XW0_HEIGHT + 0.06, spec.z, null);
    addBox(root, shell, depth, XW0_HEIGHT, WALL_T, cx, XW0_HEIGHT * 0.5, z0 + WALL_T * 0.5, colliders);
    addBox(root, shell, depth, XW0_HEIGHT, WALL_T, cx, XW0_HEIGHT * 0.5, z1 - WALL_T * 0.5, colliders);
    addBox(root, shell, WALL_T, XW0_HEIGHT, along, x1 + side * WALL_T * 0.5, XW0_HEIGHT * 0.5, spec.z, colliders);
    if (!spec.locked && spec.loot) {
      slot("desk", cx, 0, spec.z - 0.35, side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
      slot("chair", cx - side * 0.85, 0, spec.z + 0.45, 0);
      var loot = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.28, 0.42),
        mat(0x6a5434, 0.8, 0x000000, 0)
      );
      loot.position.set(cx, 0.9, spec.z - 0.35);
      loot.userData.brInteract = {
        kind: "xw0_loot",
        itemId: spec.loot,
        itemName: spec.name,
        taken: false,
      };
      root.add(loot);
      interactRoots.push(loot);
    }
    if (spec.blue) {
      var lamp = new THREE.PointLight(0xfff2d2, 0.7, 7, 2);
      lamp.position.set(cx, 2.6, spec.z);
      root.add(lamp);
    }
    addDoor(spec);
  }

  function addPit(z, x0, x1) {
    var z0 = z + 1.15;
    var z1 = z - 1.15;
    pits.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: z1, maxZ: z0 });
    addBox(root, pitMat, Math.abs(x1 - x0), 0.04, 2.3, (x0 + x1) * 0.5, -0.2, z, null);
  }

  function addRot(x, z, r) {
    var mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 18), rotMat);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.set(x, 0.03, z);
    root.add(mesh);
    hazards.push({ kind: "rot", x: x, z: z, r: r, dps: 9 });
  }

  function addSteam(x, z) {
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), steamMat);
    mesh.position.set(x, 1.5, z);
    root.add(mesh);
    hazards.push({ kind: "steam", x: x, z: z, r: 1.35, dps: 14, mesh: mesh });
  }

  function makeLurker(x, z) {
    var group = new THREE.Group();
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), lurkerMat);
    body.scale.set(1, 1.7, 0.8);
    body.position.y = 1.15;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lurkerMat);
    head.position.y = 1.85;
    group.add(body);
    group.add(head);
    group.position.set(x, 0, z);
    root.add(group);
    lurkers.push({ group: group, x: x, z: z, homeX: x, homeZ: z, phase: Math.random() * 6 });
  }

  var gaps = ROOMS.map(function (room) {
    return { center: room.z, half: 0.82, side: room.side };
  });

  addBox(root, rotten, HW * 2 + WALL_T * 2, XW0_HEIGHT, WALL_T, 0, XW0_HEIGHT * 0.5, Z_BACK + WALL_T * 0.5, colliders);
  buildRun(Z_BACK, -16, rotten, floorMat, gaps);
  buildRun(-16, -50, rotten, floorMat, gaps);
  buildRun(-50, -82, rotten, floorMat, gaps);
  buildRun(-82, -112, rotten, floorMat, gaps, { skipFloor: true });
  buildRun(-112, Z_END, concrete, wetFloor, gaps.concat([
    { center: -128, half: 1.2, side: 1 },
    { center: -142, half: 1.2, side: -1 },
  ]));

  addBox(
    root,
    concrete,
    HW * 2,
    XW0_HEIGHT,
    WALL_T,
    0,
    XW0_HEIGHT * 0.5,
    Z_END - 0.9,
    null
  );
  var iron = slot("iron", 0, 0, Z_END - 0.72, 0);
  var ironPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 2.2, 0.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  ironPick.position.y = 1.1;
  ironPick.userData.brInteract = { kind: "xw0_iron" };
  ironPick.position.z = 0.28;
  iron.add(ironPick);
  interactRoots.push(ironPick);

  ROOMS.forEach(addRoom);

  [-6, -20, -34, -48, -64, -78, -96, -120, -140].forEach(function (z) {
    slot("light", 0, XW0_HEIGHT - 0.12, z, 0);
  });
  slot("corpse", -0.7, 0, -14, 0.4);
  slot("corpse", 0.55, 0, -88, -0.8);
  slot("corpse", -0.4, 0, -118, 1.2);
  addRot(0.6, -10, 0.7);
  addRot(-0.8, -32, 0.85);
  addRot(0.2, -66, 1.05);
  addRot(-0.4, -92, 0.75);

  [-56, -64, -74].forEach(function (z, index) {
    slot("pipe", (index % 2 ? 1 : -1) * (HW - 0.35), 2.15, z, Math.PI * 0.5);
    addSteam((index % 2 ? 1 : -1) * 0.85, z);
  });
  makeLurker(-0.9, -60);
  makeLurker(0.8, -74);

  addBox(root, floorMat, HW * 2, 0.12, 6.85, 0, -0.06, -85.425, null);
  addBox(root, floorMat, 1.55, 0.12, 2.3, -0.925, -0.06, -90, null);
  addBox(root, floorMat, HW * 2, 0.12, 11.7, 0, -0.06, -97, null);
  addBox(root, floorMat, 1.5, 0.12, 2.3, 0.95, -0.06, -104, null);
  addBox(root, floorMat, HW * 2, 0.12, 6.85, 0, -0.06, -108.575, null);
  addPit(-90, -0.15, HW - 0.05);
  addPit(-104, -HW + 0.05, 0.2);
  addBox(root, concrete, WALL_T, 0.4, 2.4, HW + WALL_T * 0.5, 2.8, -128, null);
  addBox(root, concrete, WALL_T, 0.4, 2.4, -(HW + WALL_T * 0.5), 2.8, -142, null);
  colliders.push({ minX: HW - 0.08, maxX: HW + 0.3, minZ: -129.2, maxZ: -126.8 });
  colliders.push({ minX: -HW - 0.3, maxX: -HW + 0.08, minZ: -143.2, maxZ: -140.8 });
  colliders.push({ minX: -HW, maxX: HW, minZ: Z_END - 1.35, maxZ: Z_END - 1.15 });
  var fall = addBox(root, rotten, 1.4, 0.28, 1.4, 0.2, XW0_HEIGHT - 0.2, -84, null);
  rubble = { mesh: fall, z: -84, dropped: false, y: XW0_HEIGHT - 0.2 };

  slot("window", HW, 0, -128, Math.PI * 0.5);
  slot("window", -HW, 0, -142, -Math.PI * 0.5);
  var garden = document.createElement("canvas");
  garden.width = 256;
  garden.height = 160;
  var ctx = garden.getContext("2d");
  ctx.fillStyle = "#6d8a45";
  ctx.fillRect(0, 0, 256, 160);
  for (var row = 0; row < 6; row++) {
    ctx.fillStyle = row % 2 ? "#3f6a32" : "#8ea85a";
    ctx.fillRect(8, 12 + row * 24, 240, 14);
  }
  var gardenTex = new THREE.CanvasTexture(garden);
  [-128, -142].forEach(function (z, index) {
    var side = index === 0 ? 1 : -1;
    var plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.3),
      new THREE.MeshBasicMaterial({ map: gardenTex })
    );
    plane.position.set(side * (HW + 0.55), 1.45, z);
    plane.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    root.add(plane);
  });
  slot("papers", 0.8, 0.02, -122, 0.3);
  slot("papers", -0.6, 0.02, -133, -0.5);
  slot("papers", 0.3, 0.02, -146, 1.1);

  var rebar = new THREE.Group();
  for (var n = 0; n < 5; n++) {
    addBox(rebar, mat(0x8a6848, 0.55, 0x000000, 0), 0.06, 1.1, 0.06, (n - 2) * 0.14, 0.55, 0, null);
  }
  rebar.position.set(-1.15, 0, -147);
  var rebarPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.2, 0.5),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  rebarPick.position.y = 0.6;
  rebarPick.userData.brInteract = { kind: "xw0_rebar" };
  rebar.add(rebarPick);
  root.add(rebar);
  interactRoots.push(rebarPick);

  [-8, -30, -54, -86, -130].forEach(function (z) {
    var light = new THREE.PointLight(0xffe2b0, z < -80 ? 0.22 : 0.45, 9, 2);
    light.position.set(0, 2.55, z);
    root.add(light);
  });

  var hemi = new THREE.HemisphereLight(0x686a72, 0x1a1816, 0.38);
  root.add(hemi);
  var ambient = new THREE.AmbientLight(0x2a2c30, 0.55);
  root.add(ambient);

  loadModels();

  function pitContains(x, z, pad) {
    var extra = pad || 0;
    for (var i = 0; i < pits.length; i++) {
      var pit = pits[i];
      if (
        x >= pit.minX - extra &&
        x <= pit.maxX + extra &&
        z >= pit.minZ - extra &&
        z <= pit.maxZ + extra
      ) {
        return true;
      }
    }
    return false;
  }

  function sampleFloor(x, z) {
    return pitContains(x, z, 0) ? -8 : 0;
  }

  function lineBlocked(ax, az, bx, bz) {
    var dx = bx - ax;
    var dz = bz - az;
    var dist = Math.hypot(dx, dz);
    if (dist < 0.08) return false;
    var block = raycastWallBlockDistance(
      { x: ax, y: 1.2, z: az },
      { x: dx / dist, y: 0, z: dz / dist },
      dist,
      colliders,
      0,
      XW0_HEIGHT
    );
    if (block < dist - 0.25) return true;
    for (var i = 0; i < colliders.length; i++) {
      var box = colliders[i];
      if (box.kind === "xw0_door" && segmentHitsAabb(ax, az, bx, bz, box)) return true;
    }
    return false;
  }

  function segmentHitsAabb(ax, az, bx, bz, box) {
    var dx = bx - ax;
    var dz = bz - az;
    var t0 = 0;
    var t1 = 1;
    function clip(p, q) {
      if (Math.abs(p) < 1e-8) return q >= 0;
      var r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }
    return (
      clip(-dx, ax - box.minX) &&
      clip(dx, box.maxX - ax) &&
      clip(-dz, az - box.minZ) &&
      clip(dz, box.maxZ - az) &&
      t0 <= t1
    );
  }

  function hazardDamage(x, z) {
    var total = 0;
    var text = "";
    for (var i = 0; i < hazards.length; i++) {
      var hazard = hazards[i];
      if (Math.hypot(hazard.x - x, hazard.z - z) <= hazard.r) {
        total += hazard.dps;
        text = hazard.kind === "steam" ? "高温气体灼伤" : "腐朽液体腐蚀";
      }
    }
    for (var j = 0; j < lurkers.length; j++) {
      var lurker = lurkers[j];
      if (
        Math.hypot(lurker.group.position.x - x, lurker.group.position.z - z) < 1.35 &&
        !lineBlocked(lurker.group.position.x, lurker.group.position.z, x, z)
      ) {
        total += 16;
        text = "蒸汽里的人影碰到了你";
      }
    }
    return { dps: total, text: text };
  }

  function update(dt, player) {
    var t = performance.now() * 0.001;
    for (var i = 0; i < hazards.length; i++) {
      var hazard = hazards[i];
      if (hazard.mesh) {
        hazard.mesh.position.y = 1.45 + Math.sin(t * 1.7 + hazard.z) * 0.15;
        hazard.mesh.scale.setScalar(1 + Math.sin(t * 2.2 + hazard.x) * 0.08);
      }
    }
    for (var j = 0; j < lurkers.length; j++) {
      var lurker = lurkers[j];
      var targetX = lurker.homeX;
      var targetZ = lurker.homeZ;
      var dist = Math.hypot(player.x - lurker.homeX, player.z - lurker.homeZ);
      if (dist < 8 && !lineBlocked(lurker.homeX, lurker.homeZ, player.x, player.z)) {
        targetX = player.x;
        targetZ = player.z;
      } else {
        targetX += Math.sin(t + lurker.phase) * 0.8;
        targetZ += Math.cos(t * 0.7 + lurker.phase) * 0.6;
      }
      lurker.group.position.x += (targetX - lurker.group.position.x) * Math.min(1, dt * 0.7);
      lurker.group.position.z += (targetZ - lurker.group.position.z) * Math.min(1, dt * 0.7);
      lurker.group.position.y = Math.sin(t * 2 + lurker.phase) * 0.05;
    }
    for (var d = 0; d < doors.length; d++) {
      var door = doors[d];
      var target = door.open ? door.base + door.spec.side * 1.25 : door.base;
      door.group.rotation.y += (target - door.group.rotation.y) * Math.min(1, dt * 4);
    }
    if (!rubble.dropped && player.z < -74) {
      rubble.dropped = true;
    }
    if (rubble.dropped && rubble.y > 0.2) {
      rubble.y = Math.max(0.2, rubble.y - dt * 7);
      rubble.mesh.position.y = rubble.y;
      if (rubble.y <= 0.21 && !rubbleCollider) {
        var landed = {
          minX: -0.5,
          maxX: 0.9,
          minZ: rubble.z - 0.7,
          maxZ: rubble.z + 0.7,
        };
        var body = 0.36;
        var inside =
          player.x + body > landed.minX &&
          player.x - body < landed.maxX &&
          player.z + body > landed.minZ &&
          player.z - body < landed.maxZ;
        if (!inside) {
          rubbleCollider = landed;
          colliders.push(rubbleCollider);
        }
      }
    }
    return hazardDamage(player.x, player.z);
  }

  function findDoor(data) {
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].spec === data.door) return doors[i];
    }
    return null;
  }

  function getInteractionHint(data) {
    if (!data) return "";
    if (data.kind === "xw0_door" || data.kind === "xw0_blue") {
      var door = findDoor(data);
      if (!door || door.open) return "";
      if (door.spec.locked) return "这扇门锈死了";
      return "按 Q 打开";
    }
    if (data.kind === "xw0_loot" && !data.taken) return "按 Q 搜索";
    if (data.kind === "xw0_iron") return "按 Q 推开金属铁门";
    if (data.kind === "xw0_rebar") return "按 Q 对着钢筋切出";
    return "";
  }

  function interact(data, api) {
    if (!data) return;
    if (data.kind === "xw0_door" || data.kind === "xw0_blue") {
      var door = findDoor(data);
      if (!door || door.open) return;
      if (door.spec.locked) {
        api.showToast("门板焊死在框上，推不动");
        return;
      }
      door.open = true;
      var index = colliders.indexOf(door.blocker);
      if (index >= 0) colliders.splice(index, 1);
      api.showToast("门开了");
      return;
    }
    if (data.kind === "xw0_loot") {
      if (data.taken) return;
      if (!api.grantItem(data.itemId, data.itemName)) {
        api.showToast("背包已满");
        return;
      }
      data.taken = true;
      api.showToast("找到 " + data.itemName);
      return;
    }
    if (data.kind === "xw0_iron") {
      api.showToast("金属门后的 Level XW-1 还没有路");
      return;
    }
    if (data.kind === "xw0_rebar") {
      api.showToast("钢筋另一侧的 Level 61 还没有路");
    }
  }

  return {
    interactRoots: interactRoots,
    spawnX: XW0_SPAWN_X,
    spawnZ: XW0_SPAWN_Z,
    spawnYaw: 0,
    entitySpawns: [
      { kind: "smiler", x: 0, z: -44 },
      { kind: "clump", x: 0.35, z: -68 },
    ],
    sampleFloor: sampleFloor,
    isNearPit: pitContains,
    blocksSight: lineBlocked,
    update: update,
    getInteractionHint: getInteractionHint,
    interact: interact,
  };
}

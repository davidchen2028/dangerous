/**
 * Backrooms Level 0.1 — 天顶站核心。
 * 局部坐标约定：入口在 +Z，站内地面 Y=0。
 */
import * as THREE from "three";
import { createLevel01Robots } from "./backrooms-level0-01-robots.js";

export const LEVEL01_LOOT_SESSION_KEY = "backrooms_level01_zenith_loot_v1";

var ITEM_NAMES = {
  circuit: "电路板",
  alloy_plate: "合金板",
  almond_water: "杏仁水",
  royal_rations: "皇家口粮",
};

function wallCollider(minX, maxX, minZ, maxZ, extra) {
  var collider = {
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    ghost: false,
  };
  if (extra) {
    var key;
    for (key in extra) collider[key] = extra[key];
  }
  return collider;
}

function resolveInteractData(target) {
  if (!target) return null;
  if (target.kind) return target;
  if (target.userData && target.userData.brInteract) return target.userData.brInteract;
  if (target.object && target.object.userData) {
    return target.object.userData.brInteract || null;
  }
  return null;
}

function readLootState() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(LEVEL01_LOOT_SESSION_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeLootState(state) {
  try {
    sessionStorage.setItem(LEVEL01_LOOT_SESSION_KEY, JSON.stringify(state));
  } catch (err) {
    /* sessionStorage 不可用时仍允许场景运行。 */
  }
}

export function resetLevel01LootSession() {
  try {
    sessionStorage.removeItem(LEVEL01_LOOT_SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
}

/**
 * Level 0 墙格中的天顶站入口。入口方向与红门墙一致，沿 X 穿过墙格。
 */
export function buildZenithEntryWall(
  parent,
  wx,
  wz,
  gridSize,
  wallH,
  colliders
) {
  var group = new THREE.Group();
  group.name = "Level01ZenithEntry";
  group.position.set(wx, 0, wz);
  group.userData.brInteract = { kind: "level01_entrance" };

  var steelMat = new THREE.MeshStandardMaterial({
    color: 0x596269,
    roughness: 0.36,
    metalness: 0.82,
  });
  var glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb9d7d9,
    transparent: true,
    opacity: 0.34,
    roughness: 0.12,
    metalness: 0.1,
    transmission: 0.24,
    depthWrite: false,
  });
  var yellowMat = new THREE.MeshStandardMaterial({
    color: 0xc9b341,
    emissive: 0x665413,
    emissiveIntensity: 0.42,
    roughness: 0.83,
  });
  var lightMat = new THREE.MeshStandardMaterial({
    color: 0xffed9b,
    emissive: 0xffcc48,
    emissiveIntensity: 1.35,
    roughness: 0.35,
  });
  var invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

  var half = gridSize * 0.5;
  var opening = Math.min(1.35, gridSize * 0.68);
  var side = Math.max(0.12, (gridSize - opening) * 0.5);
  function addBox(w, h, d, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  addBox(gridSize, 0.14, side, 0, 0.07, -half + side * 0.5, yellowMat);
  addBox(gridSize, 0.14, side, 0, 0.07, half - side * 0.5, yellowMat);
  addBox(gridSize, 0.12, opening, 0, wallH - 0.06, 0, yellowMat);
  addBox(gridSize, wallH, 0.1, 0, wallH * 0.5, -opening * 0.5, steelMat);
  addBox(gridSize, wallH, 0.1, 0, wallH * 0.5, opening * 0.5, steelMat);
  addBox(gridSize * 0.78, wallH * 0.72, 0.035, 0, wallH * 0.52, -opening * 0.5 + 0.055, glassMat);
  addBox(gridSize * 0.78, wallH * 0.72, 0.035, 0, wallH * 0.52, opening * 0.5 - 0.055, glassMat);
  var cut = addBox(gridSize * 0.9, 0.055, opening * 0.64, 0, wallH - 0.2, 0, lightMat);
  cut.name = "Level01YellowCorridorCut";
  cut.userData.brInteract = { kind: "level01_entrance" };

  var proxy = addBox(gridSize, wallH * 0.92, opening * 0.72, 0, wallH * 0.5, 0, invisibleMat);
  proxy.name = "Level01EntranceInteract";
  proxy.userData.brInteract = { kind: "level01_entrance" };

  if (colliders && colliders.push) {
    colliders.push(
      wallCollider(wx - half, wx + half, wz - half, wz - opening * 0.5, {
        level01Entrance: true,
      })
    );
    colliders.push(
      wallCollider(wx - half, wx + half, wz + opening * 0.5, wz + half, {
        level01Entrance: true,
      })
    );
  }
  parent.add(group);
  return group;
}

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {object} [opts]
 * @param {number} [opts.x=0]
 * @param {number} [opts.z=0]
 * @param {number} [opts.wallHeight=3.2]
 * @param {number} [opts.ringRadius=16.8]
 */
export function buildLevel01Station(scene, opts) {
  opts = opts || {};
  var centerX = Number.isFinite(opts.x) ? opts.x : 0;
  var centerZ = Number.isFinite(opts.z) ? opts.z : 0;
  var wallH = Math.max(2.7, Number.isFinite(opts.wallHeight) ? opts.wallHeight : 3.2);
  var ringRadius = Math.max(15.5, Number.isFinite(opts.ringRadius) ? opts.ringRadius : 16.8);
  var innerRadius = ringRadius - 1.65;
  var outerRadius = ringRadius + 1.65;
  var disposed = false;
  var elapsed = 0;
  var lootState = readLootState();
  var colliders = [];
  var interactMeshes = [];
  var lootVisuals = Object.create(null);
  var group = new THREE.Group();
  group.name = "BackroomsLevel01ZenithStation";
  group.position.set(centerX, 0, centerZ);
  if (scene && scene.add) scene.add(group);

  var materials = {
    steel: new THREE.MeshStandardMaterial({
      color: 0x59646a,
      roughness: 0.36,
      metalness: 0.82,
    }),
    darkSteel: new THREE.MeshStandardMaterial({
      color: 0x252c30,
      roughness: 0.52,
      metalness: 0.76,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x737b7b,
      roughness: 0.61,
      metalness: 0.52,
    }),
    yellow: new THREE.MeshStandardMaterial({
      color: 0xc2ad43,
      emissive: 0x554711,
      emissiveIntensity: 0.25,
      roughness: 0.88,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x9fcbd0,
      transparent: true,
      opacity: 0.28,
      roughness: 0.12,
      metalness: 0.08,
      transmission: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    light: new THREE.MeshStandardMaterial({
      color: 0xfff1b0,
      emissive: 0xffd45b,
      emissiveIntensity: 1.4,
      roughness: 0.3,
    }),
    black: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.98 }),
    hot: new THREE.MeshStandardMaterial({
      color: 0x68261c,
      emissive: 0xb62b15,
      emissiveIntensity: 0.68,
      roughness: 0.62,
    }),
    cold: new THREE.MeshStandardMaterial({
      color: 0x6fa4c2,
      emissive: 0x2c7fb2,
      emissiveIntensity: 0.52,
      roughness: 0.55,
    }),
    plant: new THREE.MeshStandardMaterial({ color: 0x315b35, roughness: 0.93 }),
    bed: new THREE.MeshStandardMaterial({ color: 0x9ca8aa, roughness: 0.92 }),
    anomaly: new THREE.MeshStandardMaterial({
      color: 0xd2bd58,
      emissive: 0x725b14,
      emissiveIntensity: 0.5,
      roughness: 0.86,
    }),
    loot: new THREE.MeshStandardMaterial({
      color: 0xe6c967,
      emissive: 0x73520e,
      emissiveIntensity: 0.48,
      roughness: 0.55,
      metalness: 0.25,
    }),
  };

  function addBox(w, h, d, x, y, z, material, parent) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }

  function addLocalCollider(minX, maxX, minZ, maxZ, extra) {
    var collider = wallCollider(
      centerX + minX,
      centerX + maxX,
      centerZ + minZ,
      centerZ + maxZ,
      extra
    );
    colliders.push(collider);
    return collider;
  }

  function addInteract(mesh, data) {
    mesh.userData.brInteract = data;
    interactMeshes.push(mesh);
    return mesh;
  }

  // 黄色过渡走廊，从 +Z 外侧通向环廊。
  var corridorLen = 8.2;
  var corridorCenterZ = outerRadius + corridorLen * 0.5 - 0.2;
  addBox(3.2, 0.12, corridorLen, 0, 0.04, corridorCenterZ, materials.yellow);
  addBox(3.2, 0.1, corridorLen, 0, wallH, corridorCenterZ, materials.yellow);
  addBox(0.16, wallH, corridorLen, -1.6, wallH * 0.5, corridorCenterZ, materials.yellow);
  addBox(0.16, wallH, corridorLen, 1.6, wallH * 0.5, corridorCenterZ, materials.yellow);
  addLocalCollider(-1.68, -1.52, outerRadius - 0.3, outerRadius + corridorLen - 0.1);
  addLocalCollider(1.52, 1.68, outerRadius - 0.3, outerRadius + corridorLen - 0.1);
  var ci;
  for (ci = 0; ci < 5; ci++) {
    addBox(1.15, 0.045, 0.32, 0, wallH - 0.07, outerRadius + ci * 1.7 + 0.5, materials.light);
  }

  // 单层环形钢玻走廊与中央空洞。
  var floor = new THREE.Mesh(
    new THREE.RingGeometry(innerRadius, outerRadius, 64, 1),
    materials.floor
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  group.add(floor);
  var ceiling = new THREE.Mesh(
    new THREE.RingGeometry(innerRadius, outerRadius, 64, 1),
    materials.darkSteel
  );
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = wallH;
  group.add(ceiling);

  var railTop = new THREE.Mesh(
    new THREE.TorusGeometry(innerRadius + 0.08, 0.055, 6, 64),
    materials.steel
  );
  railTop.rotation.x = Math.PI * 0.5;
  railTop.position.y = 1.05;
  group.add(railTop);
  var railMid = railTop.clone();
  railMid.position.y = 0.52;
  group.add(railMid);

  var segments = 32;
  var segLengthOuter = (Math.PI * 2 * outerRadius) / segments * 0.94;
  var segLengthInner = (Math.PI * 2 * innerRadius) / segments * 0.93;
  for (var si = 0; si < segments; si++) {
    var angle = (si / segments) * Math.PI * 2;
    var sin = Math.sin(angle);
    var cos = Math.cos(angle);
    var isEntrance = si === 0 || si === 1 || si === segments - 1;
    var isRoomDoor =
      si === 3 ||
      si === 8 ||
      si === 12 ||
      si === 16 ||
      si === 20 ||
      si === 24 ||
      si === 29;

    if (!isEntrance && !isRoomDoor) {
      var pane = addBox(
        segLengthOuter,
        wallH - 0.32,
        0.06,
        sin * outerRadius,
        wallH * 0.5,
        cos * outerRadius,
        materials.glass
      );
      pane.rotation.y = angle;
      addBox(
        0.09,
        wallH,
        0.12,
        Math.sin(angle - Math.PI / segments) * outerRadius,
        wallH * 0.5,
        Math.cos(angle - Math.PI / segments) * outerRadius,
        materials.steel
      ).rotation.y = angle;
      var tangentHalf = segLengthOuter * 0.47;
      var radial = 0.09;
      addLocalCollider(
        sin * outerRadius - Math.abs(cos) * tangentHalf - Math.abs(sin) * radial,
        sin * outerRadius + Math.abs(cos) * tangentHalf + Math.abs(sin) * radial,
        cos * outerRadius - Math.abs(sin) * tangentHalf - Math.abs(cos) * radial,
        cos * outerRadius + Math.abs(sin) * tangentHalf + Math.abs(cos) * radial,
        { level01Window: true }
      );
    }

    var railPost = addBox(
      0.075,
      1.08,
      0.075,
      sin * (innerRadius + 0.08),
      0.54,
      cos * (innerRadius + 0.08),
      materials.steel
    );
    railPost.rotation.y = angle;
    if ((si & 1) === 0) {
      var innerPane = addBox(
        segLengthInner * 1.9,
        0.58,
        0.025,
        sin * (innerRadius + 0.06),
        0.69,
        cos * (innerRadius + 0.06),
        materials.glass
      );
      innerPane.rotation.y = angle;
    }
    var innerTangentHalf = segLengthInner * 0.5;
    var innerRadial = 0.08;
    addLocalCollider(
      sin * innerRadius - Math.abs(cos) * innerTangentHalf - Math.abs(sin) * innerRadial,
      sin * innerRadius + Math.abs(cos) * innerTangentHalf + Math.abs(sin) * innerRadial,
      cos * innerRadius - Math.abs(sin) * innerTangentHalf - Math.abs(cos) * innerRadial,
      cos * innerRadius + Math.abs(sin) * innerTangentHalf + Math.abs(cos) * innerRadial,
      { level01VoidRail: true }
    );
  }

  // 中央空洞只保留微弱的深度参照。
  var voidDisk = new THREE.Mesh(
    new THREE.CircleGeometry(innerRadius - 0.3, 48),
    new THREE.MeshBasicMaterial({ color: 0x050708 })
  );
  voidDisk.rotation.x = -Math.PI * 0.5;
  voidDisk.position.y = -5.5;
  group.add(voidDisk);

  // 外窗之外的四层缩略黄色 L0 走廊假象；每层共享 geometry/material。
  var illusionGroup = new THREE.Group();
  illusionGroup.name = "Level01MiniatureLevel0Illusion";
  group.add(illusionGroup);
  var illusionGeo = new THREE.BoxGeometry(1, 1, 1);
  var illusionMat = new THREE.MeshStandardMaterial({
    color: 0x9b8c38,
    emissive: 0x574a12,
    emissiveIntensity: 0.28,
    roughness: 0.94,
  });
  var illusionCount = 4 * 28;
  var illusion = new THREE.InstancedMesh(illusionGeo, illusionMat, illusionCount);
  illusion.name = "Level01NestedYellowCorridors";
  var dummy = new THREE.Object3D();
  var ii = 0;
  for (var layer = 0; layer < 4; layer++) {
    var fakeRadius = outerRadius + 4.2 + layer * 3.1;
    var scale = 0.9 - layer * 0.13;
    for (var cell = 0; cell < 28; cell++) {
      var fakeAngle = (cell / 28) * Math.PI * 2 + layer * 0.07;
      dummy.position.set(
        Math.sin(fakeAngle) * fakeRadius,
        0.75 + layer * 0.34,
        Math.cos(fakeAngle) * fakeRadius
      );
      dummy.rotation.set(0, fakeAngle, 0);
      dummy.scale.set(1.65 * scale, 1.7 * scale, 0.18 * scale);
      dummy.updateMatrix();
      illusion.setMatrixAt(ii++, dummy.matrix);
    }
  }
  illusion.instanceMatrix.needsUpdate = true;
  illusionGroup.add(illusion);

  function addRoomShell(name, x, z, w, d, colorMat, openingSide) {
    var room = new THREE.Group();
    room.name = name;
    group.add(room);
    addBox(w, 0.12, d, x, 0.04, z, materials.darkSteel, room);
    addBox(w, 0.1, d, x, wallH, z, colorMat, room);
    var t = 0.18;
    if (openingSide !== "west") {
      addBox(t, wallH, d, x - w * 0.5, wallH * 0.5, z, colorMat, room);
      addLocalCollider(x - w * 0.5 - t * 0.5, x - w * 0.5 + t * 0.5, z - d * 0.5, z + d * 0.5);
    }
    if (openingSide !== "east") {
      addBox(t, wallH, d, x + w * 0.5, wallH * 0.5, z, colorMat, room);
      addLocalCollider(x + w * 0.5 - t * 0.5, x + w * 0.5 + t * 0.5, z - d * 0.5, z + d * 0.5);
    }
    if (openingSide !== "north") {
      addBox(w, wallH, t, x, wallH * 0.5, z + d * 0.5, colorMat, room);
      addLocalCollider(x - w * 0.5, x + w * 0.5, z + d * 0.5 - t * 0.5, z + d * 0.5 + t * 0.5);
    }
    if (openingSide !== "south") {
      addBox(w, wallH, t, x, wallH * 0.5, z - d * 0.5, colorMat, room);
      addLocalCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5 - t * 0.5, z - d * 0.5 + t * 0.5);
    }
    return room;
  }

  // 功能室：卧室、厨房、温室。
  var bedroom = addRoomShell("Level01Bedroom", -11.5, 17.6, 5.6, 4.8, materials.steel, "south");
  addBox(2.1, 0.45, 1.2, -12.1, 0.26, 18.1, materials.bed, bedroom);
  addBox(0.55, 0.72, 0.55, -9.8, 0.36, 18.1, materials.darkSteel, bedroom);

  var kitchen = addRoomShell("Level01Kitchen", -20.8, 0, 4.8, 6.4, materials.steel, "east");
  addBox(0.7, 0.92, 4.4, -22.2, 0.46, 0, materials.darkSteel, kitchen);
  addBox(1.2, 0.12, 2.8, -20.7, 0.92, 0, materials.steel, kitchen);

  var greenhouse = addRoomShell("Level01Greenhouse", 11.5, 17.6, 5.6, 4.8, materials.glass, "south");
  for (var pi = 0; pi < 8; pi++) {
    var plant = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.8, 7), materials.plant);
    plant.position.set(9.7 + (pi % 4) * 1.15, 0.45, 16.7 + Math.floor(pi / 4) * 1.55);
    greenhouse.add(plant);
  }

  // 四种舱室。
  var intact = addRoomShell("Level01IntactCabin", 21.1, 0, 5.2, 5.4, materials.steel, "west");
  addBox(1.8, 0.42, 0.95, 21.7, 0.23, 0.8, materials.bed, intact);
  addBox(0.75, 1.4, 0.55, 22.5, 0.7, -1.45, materials.darkSteel, intact);

  var damaged = addRoomShell("Level01DamagedCabin", 15.1, -15.1, 5.4, 5.4, materials.black, "north");
  addBox(3.7, 0.09, 0.09, 15.2, 1.65, -14.5, materials.black, damaged).rotation.z = 0.42;
  addBox(0.09, 2.7, 0.09, 14.2, 1.25, -15.3, materials.black, damaged).rotation.x = 0.7;

  var hotCabin = addRoomShell("Level01HotFailureCabin", 0, -21.1, 5.4, 5.2, materials.hot, "north");
  var hotLight = new THREE.PointLight(0xff3d20, 1.15, 7, 1.7);
  hotLight.position.set(0, 2.3, -21.1);
  group.add(hotLight);

  var coldCabin = addRoomShell("Level01ColdFailureCabin", -15.1, -15.1, 5.4, 5.4, materials.cold, "north");
  var coldLight = new THREE.PointLight(0x58bfff, 0.95, 7, 1.8);
  coldLight.position.set(-15.1, 2.3, -15.1);
  group.add(coldLight);

  // 完好舱自动门与 ghost collider。
  var autoDoor = addBox(0.15, 2.5, 1.55, outerRadius + 0.12, 1.25, 0, materials.steel);
  autoDoor.name = "Level01IntactAutoDoor";
  var doorCollider = addLocalCollider(
    outerRadius,
    outerRadius + 0.28,
    -0.78,
    0.78,
    { level01AutoDoor: true }
  );
  var doorOpen = 0;

  // 异常墙。
  var clipWall = addBox(2.6, 2.7, 0.13, -10.5, 1.35, -12.4, materials.anomaly);
  clipWall.name = "Level01ClipWall";
  addInteract(clipWall, { kind: "level01_clip" });

  // 少量固定拾取点，不含武器。
  var lootSpecs = [
    { id: "circuit_a", itemId: "circuit", x: 21.8, y: 0.78, z: -1.4 },
    { id: "alloy_a", itemId: "alloy_plate", x: 14.1, y: 0.2, z: -14.5 },
    { id: "almond_a", itemId: "almond_water", x: -11.0, y: 0.82, z: 18.1 },
    { id: "rations_a", itemId: "royal_rations", x: -20.7, y: 1.05, z: 0.15 },
  ];
  for (var li = 0; li < lootSpecs.length; li++) {
    var spec = lootSpecs[li];
    var lootMesh;
    if (spec.itemId === "almond_water") {
      lootMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 10), materials.loot);
    } else {
      lootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.3), materials.loot);
    }
    lootMesh.name = "Level01Loot_" + spec.id;
    lootMesh.position.set(spec.x, spec.y, spec.z);
    addInteract(lootMesh, {
      kind: "level01_loot",
      lootId: spec.id,
      itemId: spec.itemId,
      amount: 1,
    });
    group.add(lootMesh);
    lootVisuals[spec.id] = lootMesh;
    lootMesh.visible = !lootState[spec.id];
  }

  var ambient = new THREE.HemisphereLight(0xb9d4d5, 0x111516, 0.64);
  group.add(ambient);
  for (var lampI = 0; lampI < 8; lampI++) {
    var lampAngle = (lampI / 8) * Math.PI * 2;
    var lamp = new THREE.PointLight(0xffe49a, 0.55, 10, 1.9);
    lamp.position.set(
      Math.sin(lampAngle) * ringRadius,
      wallH - 0.3,
      Math.cos(lampAngle) * ringRadius
    );
    group.add(lamp);
  }

  var robots = createLevel01Robots(group, { ringRadius: ringRadius });
  var exitTrigger = {
    kind: "level01_exit",
    minX: centerX - 1.35,
    maxX: centerX + 1.35,
    minZ: centerZ + outerRadius + corridorLen - 1.35,
    maxZ: centerZ + outerRadius + corridorLen - 0.05,
  };
  var spawn = {
    x: centerX,
    y: 0,
    z: centerZ + outerRadius + corridorLen - 2.2,
    yaw: Math.PI,
  };

  function playerPosition(player) {
    var source = player && player.player ? player.player : player;
    return {
      x: source && Number.isFinite(source.x) ? source.x - centerX : 0,
      z: source && Number.isFinite(source.z) ? source.z - centerZ : 0,
    };
  }

  function update(dt, player) {
    if (disposed) return;
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    elapsed += delta;
    robots.update(delta);

    var pos = playerPosition(player);
    var dx = pos.x - (outerRadius + 0.1);
    var dz = pos.z;
    var target = dx * dx + dz * dz < 10.2 ? 1 : 0;
    doorOpen += (target - doorOpen) * Math.min(1, delta * 5.5);
    autoDoor.position.z = doorOpen * 1.5;
    doorCollider.ghost = doorOpen > 0.72;

    materials.anomaly.emissiveIntensity =
      0.42 + Math.sin(elapsed * 3.1) * 0.13 + Math.sin(elapsed * 8.7) * 0.04;
    hotLight.intensity = 0.9 + Math.sin(elapsed * 6.4) * 0.2;
  }

  function getTemperatureZone(px, pz) {
    var x = Number(px) - centerX;
    var z = Number(pz) - centerZ;
    if (Math.abs(x) <= 3.2 && z >= -24.2 && z <= -18.0) return "hot";
    if (x >= -18.4 && x <= -11.8 && z >= -18.4 && z <= -11.8) return "cold";
    return null;
  }

  function getInteractionHint(target) {
    var data = resolveInteractData(target);
    if (!data) return "";
    if (data.kind === "level01_clip") return "接缝错位的异常墙 · 按 Q 检查";
    if (data.kind === "level01_loot") {
      if (lootState[data.lootId]) return "";
      return (ITEM_NAMES[data.itemId] || data.itemId) + " · 按 Q 拾取";
    }
    return "";
  }

  function interact(target, callbacks) {
    if (disposed) return false;
    var data = resolveInteractData(target);
    if (!data) return false;
    callbacks = callbacks || {};
    var showToast =
      typeof callbacks.showToast === "function" ? callbacks.showToast : function () {};

    if (data.kind === "level01_clip") {
      showToast("墙面后的空间测距结果互相矛盾。这里可以切出，但本核心不直接执行跳层。", 4800);
      if (typeof callbacks.onClip === "function") callbacks.onClip(data);
      return true;
    }
    if (data.kind !== "level01_loot" || lootState[data.lootId]) return false;
    if (typeof callbacks.grantItem !== "function") {
      showToast("未连接物品接收接口。");
      return false;
    }
    var granted;
    try {
      granted = callbacks.grantItem(data.itemId, data.amount || 1, data);
    } catch (err) {
      granted = false;
    }
    if (granted === false) {
      showToast("背包没有空位，物品仍留在原处。");
      return false;
    }
    lootState[data.lootId] = true;
    writeLootState(lootState);
    if (lootVisuals[data.lootId]) lootVisuals[data.lootId].visible = false;
    showToast("获得" + (ITEM_NAMES[data.itemId] || data.itemId) + " ×" + (data.amount || 1));
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    robots.dispose();
    if (group.parent) group.parent.remove(group);
    var geometries = new Set();
    var materialSet = new Set();
    var textures = new Set();
    group.traverse(function (object) {
      if (object.geometry) geometries.add(object.geometry);
      var objectMaterials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (var mi = 0; mi < objectMaterials.length; mi++) {
        var material = objectMaterials[mi];
        if (!material) continue;
        materialSet.add(material);
        var key;
        for (key in material) {
          if (material[key] && material[key].isTexture) textures.add(material[key]);
        }
      }
    });
    textures.forEach(function (texture) {
      texture.dispose();
    });
    materialSet.forEach(function (material) {
      material.dispose();
    });
    geometries.forEach(function (geometry) {
      geometry.dispose();
    });
    interactMeshes.length = 0;
    colliders.length = 0;
    group.clear();
  }

  return {
    group: group,
    colliders: colliders,
    interactMeshes: interactMeshes,
    exitTrigger: exitTrigger,
    spawn: spawn,
    update: update,
    getTemperatureZone: getTemperatureZone,
    getInteractionHint: getInteractionHint,
    interact: interact,
    dispose: dispose,
  };
}


/**
 * Backrooms Level 0.5 — 浸濡通道与废弃医院。
 * 本模块不直接修改宿主生存数据；环境压力、伤害和物品均经 API/callbacks 暴露。
 */
import * as THREE from "three";
import { createLevel05Drowned } from "./backrooms-level0-05-drowned.js";

export const LEVEL05_LOOT_SESSION_KEY = "backrooms_level05_loot_v1";

var ITEM_NAMES = {
  almond_water: "杏仁水",
  royal_rations: "最小有效分量皇家口粮",
};

function resolveInteraction(target) {
  if (!target) return null;
  if (target.kind) return target;
  var object = target.object || target;
  while (object) {
    if (object.userData && object.userData.brInteract) {
      return object.userData.brInteract;
    }
    object = object.parent;
  }
  return null;
}

function readLootState() {
  try {
    var value = JSON.parse(sessionStorage.getItem(LEVEL05_LOOT_SESSION_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (err) {
    return {};
  }
}

function writeLootState(value) {
  try {
    sessionStorage.setItem(LEVEL05_LOOT_SESSION_KEY, JSON.stringify(value));
  } catch (err) {
    /* 无 sessionStorage 时仅在本次实例内保持。 */
  }
}

export function resetLevel05LootSession() {
  try {
    sessionStorage.removeItem(LEVEL05_LOOT_SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
}

function addEntranceCollider(target, minX, maxX, minZ, maxZ) {
  if (!target || !target.push) return;
  target.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    ghost: false,
    level05Entrance: true,
  });
}

/**
 * Level 0 熄灯区墙格中的向下楼梯入口。
 * 与其他入口 builder 一致：parent、世界坐标、网格尺寸、墙高、碰撞数组。
 */
export function buildLevel05Entrance(parent, wx, wz, gridSize, wallH, colliders) {
  gridSize = Math.max(1.2, Number(gridSize) || 2);
  wallH = Math.max(2.35, Number(wallH) || 2.6);
  var group = new THREE.Group();
  group.name = "Level05LightsOutStairEntrance";
  group.position.set(wx, 0, wz);

  var concrete = new THREE.MeshStandardMaterial({
    color: 0x302f2a,
    roughness: 0.98,
  });
  var edge = new THREE.MeshStandardMaterial({
    color: 0x101213,
    roughness: 0.76,
    metalness: 0.35,
  });
  var deadLamp = new THREE.MeshStandardMaterial({
    color: 0x233040,
    emissive: 0x07101d,
    emissiveIntensity: 0.12,
    roughness: 0.65,
  });
  var cube = new THREE.BoxGeometry(1, 1, 1);
  function box(w, h, d, x, y, z, material) {
    var mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  var half = gridSize * 0.5;
  var opening = Math.min(1.35, gridSize * 0.66);
  var side = Math.max(0.12, (gridSize - opening) * 0.5);
  box(gridSize, wallH, side, 0, wallH * 0.5, -half + side * 0.5, concrete);
  box(gridSize, wallH, side, 0, wallH * 0.5, half - side * 0.5, concrete);
  box(gridSize, 0.18, opening, 0, wallH - 0.09, 0, edge);
  for (var i = 0; i < 5; i++) {
    var step = box(
      gridSize * 0.82,
      0.12,
      opening * 0.92,
      -half + 0.18 + i * gridSize * 0.16,
      0.06 - i * 0.11,
      0,
      concrete
    );
    step.name = "Level05DescendingStep";
  }
  var lamp = box(0.08, 0.5, opening * 0.7, -half + 0.08, wallH * 0.67, 0, deadLamp);
  lamp.name = "Level05DeadBlueLamp";
  lamp.userData.brInteract = { kind: "level05_entrance" };
  group.userData.brInteract = { kind: "level05_entrance" };

  addEntranceCollider(
    colliders,
    wx - half,
    wx + half,
    wz - half,
    wz - opening * 0.5
  );
  addEntranceCollider(
    colliders,
    wx - half,
    wx + half,
    wz + opening * 0.5,
    wz + half
  );
  if (parent && parent.add) parent.add(group);
  group.userData.dispose = function disposeLevel05Entrance() {
    if (group.parent) group.parent.remove(group);
    cube.dispose();
    concrete.dispose();
    edge.dispose();
    deadLamp.dispose();
    group.clear();
  };
  return group;
}

/** 语义更明确的入口别名。 */
export const buildLevel05EntryStairs = buildLevel05Entrance;

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {object} [opts]
 * @returns {{group:THREE.Group,colliders:Array,interactMeshes:Array,spawn:object,update:Function,drawFx:Function,getSurvivalEnv:Function,getEnvironmentState:Function,getInteractionHint:Function,interact:Function,getExitRequest:Function,dispose:Function}}
 */
export function buildLevel05World(scene, opts) {
  opts = opts || {};
  var centerX = Number.isFinite(opts.x) ? opts.x : 0;
  var centerZ = Number.isFinite(opts.z) ? opts.z : 0;
  var wallH = Math.max(2.7, Number.isFinite(opts.wallHeight) ? opts.wallHeight : 3.05);
  var disposed = false;
  var elapsed = 0;
  var exitRequest = null;
  var interactMeshes = [];
  var colliders = [];
  var localColliders = [];
  var doors = [];
  var lootState = readLootState();
  var lootMeshes = Object.create(null);
  var lastZone = "";
  var fxCanvas = null;
  var fxContext = null;
  var audio = null;

  var group = new THREE.Group();
  group.name = "BackroomsLevel05";
  group.position.set(centerX, 0, centerZ);
  if (scene && scene.add) scene.add(group);

  var cube = new THREE.BoxGeometry(1, 1, 1);
  var plane = new THREE.PlaneGeometry(1, 1);
  var cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  var materials = {
    wallpaper: new THREE.MeshStandardMaterial({
      color: 0xb9aa78,
      roughness: 0.98,
    }),
    peel: new THREE.MeshStandardMaterial({
      color: 0xe1d4a7,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x4c351f,
      transparent: true,
      opacity: 0.79,
      roughness: 0.32,
      metalness: 0.04,
      depthWrite: false,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x59442e,
      roughness: 0.94,
    }),
    blueLight: new THREE.MeshStandardMaterial({
      color: 0x83bce2,
      emissive: 0x2d82c2,
      emissiveIntensity: 1.7,
      roughness: 0.26,
    }),
    spark: new THREE.MeshBasicMaterial({ color: 0x9edcff }),
    hospitalWall: new THREE.MeshStandardMaterial({
      color: 0x9aa09a,
      roughness: 0.91,
    }),
    tile: new THREE.MeshStandardMaterial({
      color: 0x5d6562,
      roughness: 0.75,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x3c4548,
      roughness: 0.48,
      metalness: 0.72,
    }),
    bed: new THREE.MeshStandardMaterial({
      color: 0x787e78,
      roughness: 1,
    }),
    wetSheet: new THREE.MeshStandardMaterial({
      color: 0x7b8a82,
      roughness: 0.72,
    }),
    rubble: new THREE.MeshStandardMaterial({
      color: 0x4c4d48,
      roughness: 1,
    }),
    loot: new THREE.MeshStandardMaterial({
      color: 0xc9a85c,
      emissive: 0x49330b,
      emissiveIntensity: 0.3,
      roughness: 0.62,
    }),
    chlorine: new THREE.MeshPhysicalMaterial({
      color: 0x89d8d1,
      transparent: true,
      opacity: 0.68,
      roughness: 0.16,
      transmission: 0.18,
      depthWrite: false,
    }),
    gradient: new THREE.MeshStandardMaterial({
      color: 0x665b73,
      emissive: 0x2b183e,
      emissiveIntensity: 0.52,
      roughness: 0.84,
    }),
    invisible: new THREE.MeshBasicMaterial({ visible: false }),
  };

  function addBox(w, h, d, x, y, z, material, parent) {
    var mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = material !== materials.water && material !== materials.invisible;
    mesh.receiveShadow = material !== materials.invisible;
    (parent || group).add(mesh);
    return mesh;
  }

  function addCollider(minX, maxX, minZ, maxZ, extra) {
    var local = {
      kind: "wall",
      minX: minX,
      maxX: maxX,
      minZ: minZ,
      maxZ: maxZ,
      ghost: false,
    };
    var world = {
      kind: "wall",
      minX: centerX + minX,
      maxX: centerX + maxX,
      minZ: centerZ + minZ,
      maxZ: centerZ + maxZ,
      ghost: false,
    };
    var key;
    if (extra) {
      for (key in extra) {
        local[key] = extra[key];
        world[key] = extra[key];
      }
    }
    localColliders.push(local);
    colliders.push(world);
    return { local: local, world: world };
  }

  function wall(w, d, x, z, material, extra) {
    addBox(w, wallH, d, x, wallH * 0.5, z, material);
    return addCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5, extra);
  }

  function addInteract(mesh, data) {
    mesh.userData.brInteract = data;
    interactMeshes.push(mesh);
    return mesh;
  }

  // 浸濡通道：棕水、剥落墙纸、变化木板和低矮入口梯。
  addBox(7, 0.12, 28, 0, -0.06, 8.5, materials.wood);
  addBox(7, 0.1, 28, 0, wallH, 8.5, materials.wallpaper);
  wall(0.18, 28, -3.5, 8.5, materials.wallpaper);
  wall(0.18, 28, 3.5, 8.5, materials.wallpaper);
  var water = addBox(6.8, 0.36, 27.8, 0, 0.19, 8.5, materials.water);
  water.name = "Level05KneeDeepBrownWater";
  for (var p = 0; p < 7; p++) {
    var peel = new THREE.Mesh(plane, materials.peel);
    peel.scale.set(0.46 + (p % 3) * 0.16, 0.72 + (p % 2) * 0.34, 1);
    peel.position.set(p % 2 ? 3.395 : -3.395, 1.25 + (p % 3) * 0.31, 19 - p * 3.65);
    peel.rotation.y = p % 2 ? -Math.PI * 0.5 : Math.PI * 0.5;
    peel.rotation.z = (p - 3) * 0.055;
    group.add(peel);
  }
  var boardSpecs = [
    [-1.2, 0.42, 16.2, 2.2, 0.1],
    [1.1, 0.47, 10.8, 1.7, -0.18],
    [-0.5, 0.5, 5.6, 2.8, 0.25],
    [1.35, 0.46, 0.1, 1.65, -0.28],
  ];
  var boards = [];
  for (var bi = 0; bi < boardSpecs.length; bi++) {
    var spec = boardSpecs[bi];
    var board = addBox(spec[3], 0.1, 0.48, spec[0], spec[1], spec[2], materials.wood);
    board.rotation.y = spec[4];
    boards.push(board);
  }

  var hangingLights = [];
  var sparkMeshes = [];
  for (var li = 0; li < 4; li++) {
    var cable = addBox(0.035, 0.62 + li * 0.08, 0.035, li % 2 ? 1.1 : -0.9, wallH - 0.31, 17 - li * 6.2, materials.metal);
    cable.rotation.z = li % 2 ? 0.14 : -0.11;
    var bulb = addBox(0.65, 0.08, 0.22, cable.position.x, wallH - 0.65 - li * 0.04, cable.position.z, materials.blueLight);
    hangingLights.push(bulb);
    var sparks = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.12, 0, 0),
        new THREE.Vector3(0.08, -0.18, 0.03),
        new THREE.Vector3(0.15, -0.36, -0.04),
      ]),
      materials.spark
    );
    sparks.position.copy(bulb.position);
    group.add(sparks);
    sparkMeshes.push(sparks);
  }
  var blueA = new THREE.PointLight(0x429ee2, 0.68, 8, 1.8);
  blueA.position.set(-0.9, 2.25, 16.8);
  group.add(blueA);
  var blueB = new THREE.PointLight(0x429ee2, 0.54, 7, 1.9);
  blueB.position.set(1.0, 2.15, 4.4);
  group.add(blueB);

  // 零食手推车与可搜刮物。
  var cart = new THREE.Group();
  cart.name = "Level05SnackCart";
  group.add(cart);
  addBox(1.28, 0.1, 0.66, 1.55, 0.82, 13.5, materials.metal, cart);
  addBox(0.08, 0.78, 0.08, 1.03, 0.4, 13.25, materials.metal, cart);
  addBox(0.08, 0.78, 0.08, 2.07, 0.4, 13.25, materials.metal, cart);
  var cartLoot = addBox(0.42, 0.2, 0.3, 1.48, 0.98, 13.5, materials.loot, cart);
  addInteract(cartLoot, {
    kind: "level05_loot",
    lootId: "cart_snack",
    itemId: "royal_rations",
    amount: 1,
  });
  lootMeshes.cart_snack = cartLoot;

  // 医院主体：中央走廊与六间病房。
  addBox(20, 0.12, 37, 0, -0.06, -23.5, materials.tile);
  addBox(20, 0.1, 37, 0, wallH, -23.5, materials.hospitalWall);
  wall(0.2, 37, -10, -23.5, materials.hospitalWall);
  wall(0.2, 37, 10, -23.5, materials.hospitalWall);
  wall(20, 0.2, 0, -42, materials.hospitalWall);
  wall(6.5, 0.2, -6.75, -5, materials.hospitalWall);
  wall(6.5, 0.2, 6.75, -5, materials.hospitalWall);

  var roomCenters = [-12, -24, -35.5];
  for (var sideIndex = 0; sideIndex < 2; sideIndex++) {
    var side = sideIndex ? 1 : -1;
    var wallX = side * 2.55;
    var segments = [
      [-41.9, -36.5],
      [-34.5, -25],
      [-23, -13],
      [-11, -5.1],
    ];
    for (var si = 0; si < segments.length; si++) {
      var start = segments[si][0];
      var end = segments[si][1];
      wall(0.16, end - start, wallX, (start + end) * 0.5, materials.hospitalWall);
    }
    wall(7.3, 0.16, side * 6.3, -18, materials.hospitalWall);
    wall(7.3, 0.16, side * 6.3, -30, materials.hospitalWall);

    for (var ri = 0; ri < roomCenters.length; ri++) {
      var bedX = side * (5.7 + (ri % 2) * 0.7);
      var bed = addBox(2.15, 0.42, 0.92, bedX, 0.27, roomCenters[ri], materials.bed);
      bed.rotation.y = side > 0 ? 0.05 : -0.05;
      var sheet = addBox(1.45, 0.08, 0.94, bedX + side * 0.22, 0.52, roomCenters[ri], materials.wetSheet);
      sheet.rotation.y = bed.rotation.y;
      addCollider(
        bedX - 1.12,
        bedX + 1.12,
        roomCenters[ri] - 0.55,
        roomCenters[ri] + 0.55,
        { level05Bed: true }
      );
    }
  }

  var rubbleSpecs = [
    [-7.8, -20.2, 0.8, 0.35],
    [7.5, -27.4, 1.1, -0.2],
    [-6.4, -38.2, 1.45, 0.42],
    [1.1, -32.3, 0.75, -0.5],
  ];
  for (var r = 0; r < rubbleSpecs.length; r++) {
    var rubbleSpec = rubbleSpecs[r];
    var rubble = addBox(
      rubbleSpec[2],
      0.24 + (r % 2) * 0.15,
      0.72,
      rubbleSpec[0],
      0.16,
      rubbleSpec[1],
      materials.rubble
    );
    rubble.rotation.y = rubbleSpec[3];
  }

  function createDoor(id, side, z, locked) {
    var x = side * 2.55;
    var mesh = addBox(0.13, 2.45, 1.55, x, 1.225, z, materials.metal);
    mesh.name = "Level05HospitalDoor_" + id;
    var pair = addCollider(x - 0.12, x + 0.12, z - 0.78, z + 0.78, {
      level05Door: true,
      doorId: id,
    });
    var state = {
      id: id,
      mesh: mesh,
      panel: null,
      side: side,
      z: z,
      open: 0,
      target: 0,
      locked: !!locked,
      collider: pair,
    };
    addInteract(mesh, { kind: "level05_door", doorId: id });
    var panel = addBox(0.08, 0.22, 0.16, x - side * 0.13, 1.15, z + 1.02, materials.blueLight);
    addInteract(panel, { kind: "level05_lock", doorId: id });
    state.panel = panel;
    doors.push(state);
    return state;
  }
  createDoor("ward_l1", -1, -12, false);
  createDoor("ward_r1", 1, -12, false);
  createDoor("ward_l2", -1, -24, true);
  createDoor("ward_r2", 1, -24, false);
  createDoor("ward_l3", -1, -35.5, false);
  createDoor("ward_r3", 1, -35.5, true);

  // 少量医院补给。
  var almond = new THREE.Mesh(cylinder, materials.loot);
  almond.scale.set(0.1, 0.36, 0.1);
  almond.position.set(-6.2, 0.74, -25.4);
  group.add(almond);
  addInteract(almond, {
    kind: "level05_loot",
    lootId: "ward_almond",
    itemId: "almond_water",
    amount: 1,
  });
  lootMeshes.ward_almond = almond;
  var canned = addBox(0.24, 0.28, 0.24, 6.4, 0.68, -13.1, materials.loot);
  addInteract(canned, {
    kind: "level05_loot",
    lootId: "ward_can",
    itemId: "royal_rations",
    amount: 1,
  });
  lootMeshes.ward_can = canned;
  Object.keys(lootMeshes).forEach(function (id) {
    lootMeshes[id].visible = !lootState[id];
  });

  // 三类出口：Level 1、Level 37，以及永不跳转的 Level 109 伏笔。
  var grate = addBox(4.2, 2.55, 0.14, 0, 1.28, -41.75, materials.metal);
  grate.name = "Level05Level1GrateStairs";
  addInteract(grate, { kind: "level05_exit", destination: "level1" });
  for (var stepIndex = 0; stepIndex < 5; stepIndex++) {
    addBox(3.5, 0.13, 0.58, 0, 0.07 + stepIndex * 0.11, -40.8 + stepIndex * 0.52, materials.metal);
  }

  var clearPool = new THREE.Mesh(plane, materials.chlorine);
  clearPool.rotation.x = -Math.PI * 0.5;
  clearPool.scale.set(3.6, 2.8, 1);
  clearPool.position.set(7.4, 0.045, -38.2);
  clearPool.name = "Level05RareWarmChlorinePool";
  group.add(clearPool);
  addInteract(clearPool, { kind: "level05_exit", destination: "level37" });

  var teaser = addBox(4.7, 2.65, 0.18, -6.3, 1.33, -41.72, materials.gradient);
  teaser.name = "Level05Level109GradientTeaser";
  addInteract(teaser, { kind: "level05_teaser109" });

  var hospitalLight = new THREE.HemisphereLight(0xb1c4c8, 0x171a18, 0.5);
  group.add(hospitalLight);
  var hospitalPoint = new THREE.PointLight(0xb9d8df, 0.55, 13, 2);
  hospitalPoint.position.set(0, 2.55, -22);
  group.add(hospitalPoint);

  // 显式走廊图：门关闭时边会被碰撞检查剔除，实体不会穿墙。
  var navNodes = [
    { x: 0, z: -7, links: [1] },
    { x: 0, z: -12, links: [0, 2, 7, 8] },
    { x: 0, z: -18, links: [1, 3] },
    { x: 0, z: -24, links: [2, 4, 9, 10] },
    { x: 0, z: -30, links: [3, 5] },
    { x: 0, z: -35.5, links: [4, 6, 11, 12] },
    { x: 0, z: -40, links: [5] },
    { x: -4.1, z: -12, links: [1, 13] },
    { x: 4.1, z: -12, links: [1, 14] },
    { x: -4.1, z: -24, links: [3, 15] },
    { x: 4.1, z: -24, links: [3, 16] },
    { x: -4.1, z: -35.5, links: [5, 17] },
    { x: 4.1, z: -35.5, links: [5, 18] },
    { x: -7.2, z: -12, links: [7] },
    { x: 7.2, z: -12, links: [8] },
    { x: -7.2, z: -24, links: [9] },
    { x: 7.2, z: -24, links: [10] },
    { x: -7.2, z: -35.5, links: [11] },
    { x: 7.2, z: -35.5, links: [12] },
  ];

  var drowned = createLevel05Drowned(group, {
    x: Number.isFinite(opts.drownedX) ? opts.drownedX : 0.8,
    z: Number.isFinite(opts.drownedZ) ? opts.drownedZ : -33,
    speed: Number.isFinite(opts.drownedSpeed) ? opts.drownedSpeed : 1.68,
    colliders: localColliders,
    navNodes: navNodes,
    waterBounds: { minX: -3.35, maxX: 3.35, minZ: -5, maxZ: 22.5 },
    onDoorPressure: function (collider) {
      for (var i = 0; i < doors.length; i++) {
        if (doors[i].id === collider.doorId && !doors[i].locked) {
          doors[i].target = 1;
          return;
        }
      }
    },
  });

  var environment = {
    zone: "water",
    inWater: true,
    movementMultiplier: 0.62,
    staminaRecoveryMultiplier: 0.35,
    infectionPressurePerSec: 0.055,
    sanityDrainPerSec: 0.18,
    wetness: 1,
  };

  function playerLocal(player) {
    var source = player && player.player ? player.player : player;
    return {
      x: (source && Number.isFinite(source.x) ? source.x : centerX) - centerX,
      z: (source && Number.isFinite(source.z) ? source.z : centerZ) - centerZ,
    };
  }

  function updateEnvironment(position, callbacks, delta) {
    var inWater =
      position.x >= -3.35 &&
      position.x <= 3.35 &&
      position.z >= -5 &&
      position.z <= 22.5;
    var zone = inWater ? "water" : position.z < -5 ? "hospital" : "stairs";
    environment.zone = zone;
    environment.inWater = inWater;
    environment.movementMultiplier = inWater ? 0.62 : 1;
    environment.staminaRecoveryMultiplier = inWater ? 0.35 : 0.82;
    environment.infectionPressurePerSec = inWater ? 0.055 : 0.009;
    environment.sanityDrainPerSec = inWater ? 0.18 : 0.11;
    environment.wetness = inWater ? 1 : Math.max(0.28, environment.wetness - delta * 0.035);
    if (zone !== lastZone && typeof callbacks.onEnvironmentChange === "function") {
      callbacks.onEnvironmentChange(getEnvironmentState());
    }
    lastZone = zone;
    var exposure = {
      source: "level05",
      zone: zone,
      inWater: inWater,
      infectionDelta: environment.infectionPressurePerSec * delta,
      sanityPressure: environment.sanityDrainPerSec,
      movementMultiplier: environment.movementMultiplier,
      staminaRecoveryMultiplier: environment.staminaRecoveryMultiplier,
    };
    if (typeof callbacks.onExposure === "function") callbacks.onExposure(exposure);
    if (typeof callbacks.onInfectionPressure === "function") {
      callbacks.onInfectionPressure(exposure.infectionDelta, exposure);
    }
    if (typeof callbacks.onSanityPressure === "function") {
      callbacks.onSanityPressure(exposure.sanityPressure, exposure);
    }
  }

  function createAmbientAudio() {
    if (!opts.enableAudio || audio || typeof window === "undefined") return;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      var context = new AudioContext();
      var gain = context.createGain();
      gain.gain.value = 0.006;
      gain.connect(context.destination);
      var oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 47;
      oscillator.connect(gain);
      oscillator.start();
      audio = { context: context, oscillator: oscillator, gain: gain };
    } catch (err) {
      audio = null;
    }
  }

  function update(dt, player, callbacks) {
    if (disposed) return getEnvironmentState();
    callbacks = callbacks || {};
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.08));
    elapsed += delta;
    createAmbientAudio();
    var position = playerLocal(player);
    updateEnvironment(position, callbacks, delta);

    for (var i = 0; i < doors.length; i++) {
      var door = doors[i];
      door.open += (door.target - door.open) * Math.min(1, delta * 4.8);
      door.mesh.position.z = door.z + door.open * 1.48;
      var ghost = door.open > 0.76;
      door.collider.local.ghost = ghost;
      door.collider.world.ghost = ghost;
      door.panel.material = door.locked ? materials.gradient : materials.blueLight;
    }
    for (var b = 0; b < boards.length; b++) {
      boards[b].position.y = boardSpecs[b][1] + Math.sin(elapsed * (0.72 + b * 0.09) + b) * 0.025;
      boards[b].rotation.z = Math.sin(elapsed * 0.48 + b * 1.7) * 0.025;
    }
    for (var l = 0; l < hangingLights.length; l++) {
      var flicker = Math.sin(elapsed * (8.5 + l * 1.7) + l * 2.1);
      hangingLights[l].material.emissiveIntensity = 1.25 + Math.max(0, flicker) * 0.65;
      sparkMeshes[l].visible = flicker > 0.91;
    }
    blueA.intensity = 0.5 + Math.max(0, Math.sin(elapsed * 9.1)) * 0.3;
    blueB.intensity = 0.43 + Math.max(0, Math.sin(elapsed * 7.3 + 2)) * 0.24;

    drowned.update(delta, position, callbacks);
    return getEnvironmentState();
  }

  function getSurvivalEnv() {
    return {
      movementMultiplier: environment.movementMultiplier,
      staminaRecoveryMultiplier: environment.staminaRecoveryMultiplier,
      infectionPressurePerSec: environment.infectionPressurePerSec,
      sanityDrainPerSec: environment.sanityDrainPerSec,
      skipPassiveSanity: false,
      inWater: environment.inWater,
    };
  }

  function getEnvironmentState() {
    return {
      zone: environment.zone,
      inWater: environment.inWater,
      wetness: environment.wetness,
      movementMultiplier: environment.movementMultiplier,
      staminaRecoveryMultiplier: environment.staminaRecoveryMultiplier,
      infectionPressurePerSec: environment.infectionPressurePerSec,
      sanityDrainPerSec: environment.sanityDrainPerSec,
      drowned: drowned.getState(),
    };
  }

  function doorById(id) {
    for (var i = 0; i < doors.length; i++) {
      if (doors[i].id === id) return doors[i];
    }
    return null;
  }

  function getInteractionHint(target) {
    var data = resolveInteraction(target);
    if (!data) return "";
    if (data.kind === "level05_entrance") return "熄灯楼梯向下延伸 · 按 Q 进入 Level 0.5";
    if (data.kind === "level05_door") {
      var door = doorById(data.doorId);
      if (!door) return "";
      if (door.locked) return "病房门已锁 · 使用旁侧锁控";
      return door.target > 0.5 ? "关闭病房门 · 按 Q" : "打开病房门 · 按 Q";
    }
    if (data.kind === "level05_lock") {
      var lockDoor = doorById(data.doorId);
      return lockDoor && lockDoor.locked ? "解除病房门锁 · 按 Q" : "锁定病房门 · 按 Q";
    }
    if (data.kind === "level05_loot") {
      if (lootState[data.lootId]) return "";
      return (ITEM_NAMES[data.itemId] || data.itemId) + " · 按 Q 搜刮";
    }
    if (data.kind === "level05_exit" && data.destination === "level1") {
      return "金属格栅后的深层楼梯 · 按 Q 前往 Level 1";
    }
    if (data.kind === "level05_exit" && data.destination === "level37") {
      return "罕见的清澈温暖氯水 · 按 Q 没入";
    }
    if (data.kind === "level05_teaser109") {
      return "色彩逐渐失真的封闭走廊 · 按 Q 检查";
    }
    return "";
  }

  function interact(target, callbacks) {
    if (disposed) return false;
    callbacks = callbacks || {};
    var data = resolveInteraction(target);
    if (!data) return false;
    var toast =
      typeof callbacks.showToast === "function" ? callbacks.showToast : function () {};
    if (data.kind === "level05_door") {
      var door = doorById(data.doorId);
      if (!door) return false;
      if (door.locked) {
        toast("门锁咬死了。旁边的锁控仍有微弱电流。");
        return true;
      }
      door.target = door.target > 0.5 ? 0 : 1;
      return true;
    }
    if (data.kind === "level05_lock") {
      var lockDoor = doorById(data.doorId);
      if (!lockDoor) return false;
      if (lockDoor.open > 0.18) {
        toast("必须先把门完全关上。");
        return true;
      }
      lockDoor.locked = !lockDoor.locked;
      toast(lockDoor.locked ? "病房门已锁定。" : "病房门锁已解除。");
      if (typeof callbacks.onDoorLockChange === "function") {
        callbacks.onDoorLockChange(lockDoor.id, lockDoor.locked);
      }
      return true;
    }
    if (data.kind === "level05_loot") {
      if (lootState[data.lootId]) return false;
      if (typeof callbacks.grantItem !== "function") {
        toast("未连接物品接收接口。");
        return false;
      }
      var granted;
      try {
        granted = callbacks.grantItem(data.itemId, data.amount || 1, data);
      } catch (err) {
        granted = false;
      }
      if (granted === false) {
        toast("无法收下，物品仍留在原处。");
        return false;
      }
      lootState[data.lootId] = true;
      writeLootState(lootState);
      if (lootMeshes[data.lootId]) lootMeshes[data.lootId].visible = false;
      toast("获得" + (ITEM_NAMES[data.itemId] || data.itemId) + " ×" + (data.amount || 1));
      return true;
    }
    if (data.kind === "level05_exit") {
      if (data.destination !== "level1" && data.destination !== "level37") return false;
      exitRequest = {
        destination: data.destination,
        source: "level05",
        reason: data.destination === "level1" ? "hospital_grate_stairs" : "warm_chlorine_water",
      };
      if (typeof callbacks.onExitRequest === "function") {
        callbacks.onExitRequest(exitRequest);
      }
      return true;
    }
    if (data.kind === "level05_teaser109") {
      toast("走廊被焊死在渐变色深处。Level 109 的编号反复出现，但这里没有可用通路。", 5200);
      if (typeof callbacks.onLevel109Teaser === "function") {
        callbacks.onLevel109Teaser({ source: "level05", sealed: true });
      }
      return true;
    }
    return false;
  }

  function drawFx(canvas, now) {
    if (disposed || !canvas) return;
    if (fxCanvas !== canvas) {
      fxCanvas = canvas;
      fxContext = canvas.getContext("2d");
    }
    if (!fxContext) return;
    var width = canvas.width;
    var height = canvas.height;
    fxContext.clearRect(0, 0, width, height);
    var time = (Number(now) || 0) * 0.001;
    if (environment.inWater) {
      var gradient = fxContext.createLinearGradient(0, height * 0.58, 0, height);
      gradient.addColorStop(0, "rgba(82,58,31,0)");
      gradient.addColorStop(1, "rgba(65,42,22,0.29)");
      fxContext.fillStyle = gradient;
      fxContext.fillRect(0, height * 0.55, width, height * 0.45);
      fxContext.strokeStyle = "rgba(151,119,74,0.12)";
      for (var i = 0; i < 4; i++) {
        var y = height * (0.72 + i * 0.055) + Math.sin(time * 1.7 + i) * 3;
        fxContext.beginPath();
        fxContext.moveTo(0, y);
        fxContext.quadraticCurveTo(width * 0.5, y + Math.sin(time + i) * 5, width, y);
        fxContext.stroke();
      }
    } else {
      fxContext.fillStyle = "rgba(24,32,31,0.08)";
      fxContext.fillRect(0, 0, width, height);
    }
  }

  function stopAudio() {
    if (!audio) return;
    try {
      audio.oscillator.stop();
      audio.oscillator.disconnect();
      audio.gain.disconnect();
      audio.context.close();
    } catch (err) {
      /* 已停止的节点不再处理。 */
    }
    audio = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopAudio();
    drowned.dispose();
    if (group.parent) group.parent.remove(group);
    for (var i = 0; i < sparkMeshes.length; i++) {
      sparkMeshes[i].geometry.dispose();
    }
    cube.dispose();
    plane.dispose();
    cylinder.dispose();
    Object.keys(materials).forEach(function (key) {
      materials[key].dispose();
    });
    group.clear();
    colliders.length = 0;
    localColliders.length = 0;
    interactMeshes.length = 0;
    doors.length = 0;
    fxCanvas = null;
    fxContext = null;
  }

  return {
    group: group,
    colliders: colliders,
    interactMeshes: interactMeshes,
    spawn: { x: centerX, y: 0.42, z: centerZ + 20.2, yaw: Math.PI },
    update: update,
    drawFx: drawFx,
    getSurvivalEnv: getSurvivalEnv,
    getEnvironmentState: getEnvironmentState,
    getInteractionHint: getInteractionHint,
    interact: interact,
    getExitRequest: function getExitRequest(clear) {
      var request = exitRequest;
      if (clear === true) exitRequest = null;
      return request;
    },
    dispose: dispose,
  };
}

export default buildLevel05World;

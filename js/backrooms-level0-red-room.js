/**
 * Level 0 — 红室入口与程序化红室。
 * 本模块只提供视觉、碰撞与气氛参数；理智、伤害和实体均由宿主管理。
 */
import * as THREE from "three";

/** 替换的墙格（须为 BACKROOMS_MATRIX 中的 1） */
export const RED_CHANNEL_CELL = { row: 6, col: 4 };
/** 通道朝向：邻接可走格在西侧 (col 3) */
export const RED_CHANNEL_OPEN = "east";
export const RED_ROOM_GRID = 10;
/** 保留给旧宿主读取，本模块不会自行扣除理智。 */
export const RED_ROOM_SANITY_DRAIN_PER_SEC = 5;

var ENTRANCE_RADIUS = 7;
var _redDoorWallMesh = null;
/** @type {THREE.MeshStandardMaterial | null} */
var _redDoorFaceMat = null;
var _entranceControllers = [];

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value) {
  value = clamp01(value);
  return value * value * (3 - 2 * value);
}

function getRoot(object) {
  var root = object;
  while (root && root.parent) root = root.parent;
  return root;
}

function hashSeed(seed) {
  var text = String(seed == null ? Math.random() : seed);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  var state = hashSeed(seed) || 0x6d2b79f5;
  return function random() {
    state += 0x6d2b79f5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createPatternTexture(width, height, paint, repeatX, repeatY) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx, width, height);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX || 1, repeatY || 1);
  return texture;
}

function createEntranceTexture(hasDoor, random) {
  return createPatternTexture(
    128,
    192,
    function paintEntrance(ctx, width, height) {
      ctx.fillStyle = "#6f5b52";
      ctx.fillRect(0, 0, width, height);
      for (var stripe = 0; stripe < 9; stripe++) {
        ctx.fillStyle = stripe % 2 ? "rgba(45,24,24,.12)" : "rgba(235,213,178,.055)";
        ctx.fillRect((stripe * width) / 9, 0, width / 18, height);
      }
      for (var n = 0; n < 360; n++) {
        var alpha = 0.025 + random() * 0.06;
        ctx.fillStyle = "rgba(33,12,11," + alpha + ")";
        ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 4);
      }
      if (!hasDoor) return;
      var doorW = width * 0.42;
      var doorH = height * 0.72;
      var doorX = (width - doorW) * 0.5;
      var doorY = height * 0.12;
      ctx.fillStyle = "#3e2726";
      ctx.fillRect(doorX, doorY, doorW, doorH);
      ctx.strokeStyle = "#1e1514";
      ctx.lineWidth = 5;
      ctx.strokeRect(doorX + 2, doorY + 2, doorW - 4, doorH - 4);
      ctx.fillStyle = "#76504a";
      ctx.fillRect(doorX + doorW * 0.12, doorY + doorH * 0.08, doorW * 0.76, doorH * 0.84);
    },
    1,
    1
  );
}

function disposeMaterial(material) {
  if (!material) return;
  var maps = ["map", "alphaMap", "bumpMap", "roughnessMap", "emissiveMap"];
  for (var i = 0; i < maps.length; i++) {
    var texture = material[maps[i]];
    if (texture && texture.dispose) texture.dispose();
  }
  material.dispose();
}

export function isRedChannelCell(row, col) {
  return row === RED_CHANNEL_CELL.row && col === RED_CHANNEL_CELL.col;
}

function entranceIsAlive(controller) {
  if (!controller || controller.disposed || controller.group.parent !== controller.parent) {
    return false;
  }
  return !controller.attachedRoot || getRoot(controller.parent) === controller.attachedRoot;
}

function pruneEntranceControllers() {
  var live = [];
  for (var i = 0; i < _entranceControllers.length; i++) {
    var controller = _entranceControllers[i];
    if (entranceIsAlive(controller)) live.push(controller);
    else if (controller && !controller.disposed) controller.dispose();
  }
  _entranceControllers = live;
}

/** 返回当前仍挂载在原父树上的入口控制器快照。 */
export function getRedEntranceControllers() {
  pruneEntranceControllers();
  return _entranceControllers.slice();
}

/**
 * 批量更新入口的约 7m 渐进效果。
 * callbacks: onSeen(controller)，setProximity(amount, controller)。
 */
export function updateRedEntranceControllers(px, pz, now, callbacks) {
  var controllers = getRedEntranceControllers();
  for (var i = 0; i < controllers.length; i++) {
    controllers[i].update(px, pz, now, callbacks);
  }
  return controllers;
}

/** 保留旧入口闪烁调用；新控制器会将闪烁叠加在 proximity 上。 */
export function updateRedDoorWallFlicker(elapsed) {
  var controllers = getRedEntranceControllers();
  for (var i = 0; i < controllers.length; i++) {
    controllers[i].applyFlicker(elapsed);
  }
  if (!controllers.length && _redDoorFaceMat) {
    _redDoorFaceMat.emissiveIntensity = 0.12 + Math.max(0, Math.sin(elapsed * 4.1)) * 0.08;
  }
}

/**
 * 构建低饱和红化入口。旧调用可以忽略返回值；新宿主可直接保存 controller。
 */
export function buildRedChannelWall(parent, wx, wz, gridSize, wallH, wallColliders) {
  var random = makeRandom(wx + ":" + wz);
  var group = new THREE.Group();
  group.name = "RedChannel";
  group.position.set(wx, 0, wz);

  var solidTexture = createEntranceTexture(false, random);
  var doorTexture = createEntranceTexture(true, random);
  var solidMaterial = new THREE.MeshStandardMaterial({
    map: solidTexture || undefined,
    color: 0x76635d,
    emissive: 0x2c1110,
    emissiveIntensity: 0.03,
    roughness: 0.92,
  });
  var doorMaterial = new THREE.MeshStandardMaterial({
    map: doorTexture || undefined,
    color: 0x735d58,
    emissive: 0x5b1715,
    emissiveIntensity: 0.08,
    roughness: 0.88,
  });
  _redDoorFaceMat = doorMaterial;

  var geometry = new THREE.BoxGeometry(gridSize, wallH, gridSize);
  var mesh = new THREE.Mesh(geometry, [
    solidMaterial,
    doorMaterial,
    solidMaterial,
    solidMaterial,
    solidMaterial,
    solidMaterial,
  ]);
  mesh.name = "RedDoorWall";
  mesh.position.y = wallH * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  _redDoorWallMesh = mesh;

  var peelMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f2925,
    roughness: 1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  var peelGeometry = new THREE.PlaneGeometry(gridSize * 0.17, wallH * 0.28, 3, 5);
  var peels = [];
  for (var pi = 0; pi < 4; pi++) {
    var peel = new THREE.Mesh(peelGeometry, peelMaterial);
    peel.position.set(
      -gridSize * 0.501 - pi * 0.001,
      wallH * (0.25 + pi * 0.15),
      (pi - 1.5) * gridSize * 0.17
    );
    peel.rotation.y = -Math.PI * 0.5;
    peel.rotation.z = (random() - 0.5) * 0.28;
    peel.scale.setScalar(0.72 + random() * 0.45);
    group.add(peel);
    peels.push(peel);
  }

  var trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f3631,
    emissive: 0x140807,
    emissiveIntensity: 0,
    roughness: 0.95,
  });
  var trimGeometry = new THREE.BoxGeometry(0.035, wallH * 0.82, gridSize * 0.035);
  var trims = [];
  for (var ti = -1; ti <= 1; ti += 2) {
    var trim = new THREE.Mesh(trimGeometry, trimMaterial);
    trim.position.set(-gridSize * 0.507, wallH * 0.46, ti * gridSize * 0.23);
    group.add(trim);
    trims.push(trim);
  }

  parent.add(group);
  var attachedRoot = getRoot(parent);
  if (!attachedRoot || !attachedRoot.isScene) attachedRoot = null;

  var neutralSolid = new THREE.Color(0x76635d);
  var nearSolid = new THREE.Color(0x6e3431);
  var neutralDoor = new THREE.Color(0x735d58);
  var nearDoor = new THREE.Color(0x712e2a);
  var neutralTrim = new THREE.Color(0x3f3631);
  var nearTrim = new THREE.Color(0x1c1413);
  var controller = {
    group: group,
    mesh: mesh,
    parent: parent,
    position: { x: wx, z: wz },
    radius: ENTRANCE_RADIUS,
    amount: 0,
    seen: false,
    disposed: false,
    attachedRoot: attachedRoot,
    update: function update(px, pz, now, callbacks) {
      if (!entranceIsAlive(controller)) return 0;
      var dx = px - wx;
      var dz = pz - wz;
      var amount = smoothstep01(1 - Math.sqrt(dx * dx + dz * dz) / ENTRANCE_RADIUS);
      controller.amount = amount;
      solidMaterial.color.copy(neutralSolid).lerp(nearSolid, amount);
      solidMaterial.emissiveIntensity = 0.03 + amount * 0.11;
      doorMaterial.color.copy(neutralDoor).lerp(nearDoor, amount);
      peelMaterial.opacity = amount * 0.82;
      for (var i = 0; i < peels.length; i++) {
        peels[i].rotation.x = amount * (0.08 + i * 0.025);
      }
      trimMaterial.color.copy(neutralTrim).lerp(nearTrim, amount);
      controller.applyFlicker((now || 0) * 0.001);
      if (!controller.seen && amount > 0.04) {
        controller.seen = true;
        if (callbacks && callbacks.onSeen) callbacks.onSeen(controller);
      }
      if (callbacks && callbacks.setProximity) callbacks.setProximity(amount, controller);
      return amount;
    },
    applyFlicker: function applyFlicker(elapsed) {
      var amount = controller.amount;
      var buzz = 0.82 + Math.sin(elapsed * 4.1) * 0.11 + Math.sin(elapsed * 11.3) * 0.05;
      doorMaterial.emissiveIntensity = 0.07 + amount * (0.38 + Math.max(0.2, buzz) * 0.34);
    },
    dispose: function disposeEntrance() {
      if (controller.disposed) return;
      controller.disposed = true;
      if (group.parent) group.parent.remove(group);
      geometry.dispose();
      peelGeometry.dispose();
      trimGeometry.dispose();
      disposeMaterial(solidMaterial);
      disposeMaterial(doorMaterial);
      disposeMaterial(peelMaterial);
      disposeMaterial(trimMaterial);
      if (_redDoorWallMesh === mesh) _redDoorWallMesh = null;
      if (_redDoorFaceMat === doorMaterial) _redDoorFaceMat = null;
    },
  };
  group.userData.redEntranceController = controller;
  _entranceControllers.push(controller);

  var half = gridSize * 0.5;
  var halfGapZ = 0.525;
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz - halfGapZ,
    redChannel: true,
    ghost: false,
  });
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz + halfGapZ,
    maxZ: wz + half,
    redChannel: true,
    ghost: false,
  });
  return controller;
}

export function getRedChannelTriggerAabb(cellCenterX, cellCenterZ, gridSize) {
  var wx = cellCenterX(RED_CHANNEL_CELL.col);
  var wz = cellCenterZ(RED_CHANNEL_CELL.row);
  var half = gridSize * 0.5;
  var halfGapZ = 0.525;
  return {
    minX: wx - half - 0.45,
    maxX: wx - half + 0.75,
    minZ: wz - halfGapZ - 0.08,
    maxZ: wz + halfGapZ + 0.08,
  };
}

export function pointInAabb(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

function rotateAabb(box, angle) {
  var corners = [
    [box.minX, box.minZ],
    [box.minX, box.maxZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
  ];
  var minX = Infinity;
  var maxX = -Infinity;
  var minZ = Infinity;
  var maxZ = -Infinity;
  for (var i = 0; i < corners.length; i++) {
    var x = corners[i][0];
    var z = corners[i][1];
    var rx = Math.cos(angle) * x + Math.sin(angle) * z;
    var rz = -Math.sin(angle) * x + Math.cos(angle) * z;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minZ = Math.min(minZ, rz);
    maxZ = Math.max(maxZ, rz);
  }
  box.minX = minX;
  box.maxX = maxX;
  box.minZ = minZ;
  box.maxZ = maxZ;
}

function makeRoomTextures(random) {
  var wallpaper = createPatternTexture(
    128,
    192,
    function paintWallpaper(ctx, width, height) {
      ctx.fillStyle = "#604442";
      ctx.fillRect(0, 0, width, height);
      for (var stripe = 0; stripe < 8; stripe++) {
        ctx.fillStyle = stripe % 2 ? "rgba(35,12,13,.12)" : "rgba(190,145,119,.045)";
        ctx.fillRect((stripe * width) / 8, 0, width / 16, height);
      }
      for (var n = 0; n < 430; n++) {
        ctx.fillStyle = "rgba(28,16,15," + (0.02 + random() * 0.09) + ")";
        ctx.fillRect(random() * width, random() * height, 1 + random() * 4, 1 + random() * 7);
      }
    },
    3,
    2
  );
  var carpet = createPatternTexture(
    128,
    128,
    function paintCarpet(ctx, width, height) {
      ctx.fillStyle = "#2a2020";
      ctx.fillRect(0, 0, width, height);
      for (var n = 0; n < 900; n++) {
        var shade = 26 + Math.floor(random() * 34);
        ctx.fillStyle = "rgb(" + (shade + 20) + "," + shade + "," + shade + ")";
        ctx.fillRect(random() * width, random() * height, 1, 2 + random() * 3);
      }
    },
    14,
    14
  );
  return { wallpaper: wallpaper, carpet: carpet };
}

/**
 * 构建 3–5 个连通分区的程序化红室。
 * 返回值保留 group/colliders/exitTrigger/half/exitQuarterTurns，并新增
 * seed/layout/update/getEffects/dispose。
 */
export function buildRedRoom(parent, gridSize, wallH, opts) {
  opts = opts || {};
  var generatedSeed = opts.seed == null ? Math.floor(Math.random() * 0x100000000) : opts.seed;
  var random = makeRandom(generatedSeed);
  var group = new THREE.Group();
  group.name = "RedRoom";
  group.visible = false;

  var span = RED_ROOM_GRID * gridSize;
  var half = span * 0.5;
  var wallThickness = Math.max(0.14, Math.min(0.24, gridSize * 0.09));
  var exitGap = Math.max(1.1, Math.min(1.45, gridSize * 0.68));
  var textures = makeRoomTextures(random);
  var unitBox = new THREE.BoxGeometry(1, 1, 1);
  var unitPlane = new THREE.PlaneGeometry(1, 1);
  var mushroomStemGeometry = new THREE.CylinderGeometry(0.025, 0.045, 0.13, 6);
  var mushroomCapGeometry = new THREE.SphereGeometry(0.075, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.48);
  var wallMaterial = new THREE.MeshStandardMaterial({
    map: textures.wallpaper || undefined,
    color: 0x684b48,
    emissive: 0x321010,
    emissiveIntensity: 0.1,
    roughness: 0.94,
  });
  var floorMaterial = new THREE.MeshStandardMaterial({
    map: textures.carpet || undefined,
    bumpMap: textures.carpet || undefined,
    bumpScale: 0.035,
    color: 0x4a3534,
    roughness: 1,
  });
  var ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x493b39,
    emissive: 0x341917,
    emissiveIntensity: 0.08,
    roughness: 0.96,
  });
  var moldMaterial = new THREE.MeshBasicMaterial({
    color: 0x17201a,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  var fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0x776864,
    emissive: 0x6e302b,
    emissiveIntensity: 0.28,
    roughness: 0.83,
    metalness: 0.08,
  });
  var mushroomMaterial = new THREE.MeshStandardMaterial({
    color: 0x59483f,
    roughness: 1,
  });
  var colliders = [];
  var wallMeshes = [];
  var lights = [];

  function addBox(material, w, h, d, x, y, z, name) {
    var mesh = new THREE.Mesh(unitBox, material);
    mesh.name = name || "";
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = name === "RedRoomWall";
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addWall(w, d, x, z) {
    if (w <= 0.02 || d <= 0.02) return;
    var wall = addBox(wallMaterial, w, wallH, d, x, wallH * 0.5, z, "RedRoomWall");
    wallMeshes.push(wall);
    colliders.push({
      kind: "wall",
      minX: x - w * 0.5,
      maxX: x + w * 0.5,
      minZ: z - d * 0.5,
      maxZ: z + d * 0.5,
    });
  }

  addBox(floorMaterial, span, 0.1, span, 0, 0.05, 0, "RedRoomCarpet");
  addBox(ceilingMaterial, span, 0.08, span, 0, wallH, 0, "RedRoomCeiling");

  // 出口先在任意一边和偏移位置生成，再由 quarterTurns 整体漂移。
  var baseExitSide = Math.floor(random() * 4);
  var exitOffset = (random() - 0.5) * span * 0.48;
  var edge = half + wallThickness * 0.5;
  function addHorizontalBoundary(z, opening) {
    if (!opening) {
      addWall(span + wallThickness, wallThickness, 0, z);
      return;
    }
    var leftLength = opening.center + half - opening.size * 0.5;
    var rightStart = opening.center + opening.size * 0.5;
    addWall(leftLength, wallThickness, -half + leftLength * 0.5, z);
    addWall(half - rightStart, wallThickness, rightStart + (half - rightStart) * 0.5, z);
  }
  function addVerticalBoundary(x, opening) {
    if (!opening) {
      addWall(wallThickness, span + wallThickness, x, 0);
      return;
    }
    var topLength = opening.center + half - opening.size * 0.5;
    var bottomStart = opening.center + opening.size * 0.5;
    addWall(wallThickness, topLength, x, -half + topLength * 0.5);
    addWall(wallThickness, half - bottomStart, x, bottomStart + (half - bottomStart) * 0.5);
  }
  addHorizontalBoundary(-edge, baseExitSide === 0 ? { center: exitOffset, size: exitGap } : null);
  addVerticalBoundary(edge, baseExitSide === 1 ? { center: exitOffset, size: exitGap } : null);
  addHorizontalBoundary(edge, baseExitSide === 2 ? { center: exitOffset, size: exitGap } : null);
  addVerticalBoundary(-edge, baseExitSide === 3 ? { center: exitOffset, size: exitGap } : null);

  var exitTrigger;
  if (baseExitSide === 0) {
    exitTrigger = {
      minX: exitOffset - exitGap * 0.5,
      maxX: exitOffset + exitGap * 0.5,
      minZ: -half + 0.12,
      maxZ: -half + 1.08,
    };
  } else if (baseExitSide === 1) {
    exitTrigger = {
      minX: half - 1.08,
      maxX: half - 0.12,
      minZ: exitOffset - exitGap * 0.5,
      maxZ: exitOffset + exitGap * 0.5,
    };
  } else if (baseExitSide === 2) {
    exitTrigger = {
      minX: exitOffset - exitGap * 0.5,
      maxX: exitOffset + exitGap * 0.5,
      minZ: half - 1.08,
      maxZ: half - 0.12,
    };
  } else {
    exitTrigger = {
      minX: -half + 0.12,
      maxX: -half + 1.08,
      minZ: exitOffset - exitGap * 0.5,
      maxZ: exitOffset + exitGap * 0.5,
    };
  }

  // 平行隔墙形成严格连通的 3–5 个分区；每道开口与短墙位置均由 seed 决定。
  var roomCount = 3 + Math.floor(random() * 3);
  var splitVertical = random() < 0.5;
  var openingSize = Math.max(1.25, Math.min(1.8, gridSize * 0.82));
  var layoutRooms = [];
  for (var roomIndex = 0; roomIndex < roomCount; roomIndex++) {
    layoutRooms.push({ index: roomIndex, kind: roomIndex % 2 ? "corridor" : "room" });
  }
  for (var divider = 1; divider < roomCount; divider++) {
    var axisPosition = -half + (span * divider) / roomCount;
    var gapCenter = (random() - 0.5) * span * 0.56;
    // 宿主当前固定在原点出生；穿过原点的隔墙必须在出生点留口。
    if (Math.abs(axisPosition) < openingSize) gapCenter = 0;
    var firstLength = gapCenter + half - openingSize * 0.5;
    var secondStart = gapCenter + openingSize * 0.5;
    if (splitVertical) {
      addWall(wallThickness, firstLength, axisPosition, -half + firstLength * 0.5);
      addWall(wallThickness, half - secondStart, axisPosition, secondStart + (half - secondStart) * 0.5);
    } else {
      addWall(firstLength, wallThickness, -half + firstLength * 0.5, axisPosition);
      addWall(half - secondStart, wallThickness, secondStart + (half - secondStart) * 0.5, axisPosition);
    }
    layoutRooms[divider - 1].opening = gapCenter;
  }
  // 局部短墙增加模板差异，但长度不足以封死任何分区。
  for (var shortIndex = 0; shortIndex < roomCount - 1; shortIndex++) {
    var shortLength = span * (0.07 + random() * 0.07);
    var shortX = (random() - 0.5) * span * 0.68;
    var shortZ = (random() - 0.5) * span * 0.68;
    if (
      Math.abs(shortX) < shortLength * 0.5 + 0.8 &&
      Math.abs(shortZ) < shortLength * 0.5 + 0.8
    ) {
      if (splitVertical) shortZ += shortZ < 0 ? -openingSize : openingSize;
      else shortX += shortX < 0 ? -openingSize : openingSize;
    }
    if (splitVertical) addWall(wallThickness, shortLength, shortX, shortZ);
    else addWall(shortLength, wallThickness, shortX, shortZ);
  }

  // 霉斑贴花、少量蘑菇与磨损灯具均为纯场景装饰。
  for (var moldIndex = 0; moldIndex < 9; moldIndex++) {
    var mold = new THREE.Mesh(unitPlane, moldMaterial);
    mold.name = "RedRoomMold";
    mold.position.set(
      (random() - 0.5) * span * 0.88,
      0.012 + random() * 0.008,
      (random() - 0.5) * span * 0.88
    );
    mold.rotation.x = -Math.PI * 0.5;
    mold.rotation.z = random() * Math.PI;
    mold.scale.set(0.35 + random() * 1.05, 0.22 + random() * 0.7, 1);
    group.add(mold);
  }
  var mushroomCount = 2 + Math.floor(random() * 4);
  for (var mushroomIndex = 0; mushroomIndex < mushroomCount; mushroomIndex++) {
    var mushroom = new THREE.Group();
    mushroom.name = "RedRoomMushroomDecoration";
    var stem = new THREE.Mesh(mushroomStemGeometry, mushroomMaterial);
    stem.position.y = 0.065;
    var cap = new THREE.Mesh(mushroomCapGeometry, mushroomMaterial);
    cap.position.y = 0.135;
    mushroom.add(stem, cap);
    mushroom.position.set(
      (random() < 0.5 ? -1 : 1) * (half * 0.72 + random() * half * 0.18),
      0.1,
      (random() - 0.5) * span * 0.75
    );
    mushroom.rotation.y = random() * Math.PI * 2;
    group.add(mushroom);
  }
  var lightCount = Math.max(2, Math.min(4, roomCount));
  for (var lightIndex = 0; lightIndex < lightCount; lightIndex++) {
    var lightAxis = -half + (span * (lightIndex + 0.5)) / lightCount;
    var fixture = addBox(
      fixtureMaterial,
      splitVertical ? gridSize * 0.75 : 0.12,
      0.07,
      splitVertical ? 0.12 : gridSize * 0.75,
      splitVertical ? lightAxis : (random() - 0.5) * span * 0.34,
      wallH - 0.1,
      splitVertical ? (random() - 0.5) * span * 0.34 : lightAxis,
      "WornRedLight"
    );
    fixture.rotation.y = (random() - 0.5) * 0.035;
    var light = new THREE.PointLight(0x9b5048, 0.46 + random() * 0.2, span * 0.58, 1.9);
    light.position.copy(fixture.position);
    light.position.y -= 0.13;
    light.userData.baseIntensity = light.intensity;
    light.userData.phase = random() * Math.PI * 2;
    lights.push(light);
    group.add(light);
  }
  group.add(new THREE.HemisphereLight(0x56302d, 0x100d0d, 0.24));

  var quarterTurns =
    opts.exitQuarterTurns == null
      ? Math.floor(random() * 4)
      : ((opts.exitQuarterTurns | 0) % 4 + 4) % 4;
  if (quarterTurns) {
    var angle = quarterTurns * Math.PI * 0.5;
    group.rotation.y = angle;
    for (var colliderIndex = 0; colliderIndex < colliders.length; colliderIndex++) {
      rotateAabb(colliders[colliderIndex], angle);
    }
    rotateAabb(exitTrigger, angle);
  }

  parent.add(group);
  var elapsed = 0;
  var disposed = false;
  var effects = {
    wallpaperCreep: 0,
    lightFlicker: 0,
    tinnitus: 0,
    communicationDegradation: 0,
  };

  function getEffects() {
    return {
      wallpaperCreep: effects.wallpaperCreep,
      lightFlicker: effects.lightFlicker,
      tinnitus: effects.tinnitus,
      communicationDegradation: effects.communicationDegradation,
    };
  }

  function update(dt, player) {
    if (disposed) return getEffects();
    dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    elapsed += dt;
    var playerX = player && Number.isFinite(player.x) ? player.x : 0;
    var playerZ = player && Number.isFinite(player.z) ? player.z : 0;
    var centerDistance = Math.sqrt(playerX * playerX + playerZ * playerZ);
    var depth = clamp01(1 - centerDistance / (half * 1.25));
    var creep = 0.5 + Math.sin(elapsed * 0.23) * 0.28 + Math.sin(elapsed * 0.071) * 0.16;
    effects.wallpaperCreep = clamp01(creep);
    effects.tinnitus = clamp01(0.2 + depth * 0.62 + Math.sin(elapsed * 0.39) * 0.08);
    effects.communicationDegradation = clamp01(0.18 + depth * 0.7);
    var flickerTotal = 0;
    for (var i = 0; i < lights.length; i++) {
      var wave =
        0.78 +
        Math.sin(elapsed * (4.3 + i * 0.47) + lights[i].userData.phase) * 0.16 +
        Math.sin(elapsed * 13.7 + i) * 0.055;
      lights[i].intensity = lights[i].userData.baseIntensity * Math.max(0.18, wave);
      flickerTotal += 1 - Math.max(0.18, wave);
    }
    effects.lightFlicker = clamp01(flickerTotal / Math.max(1, lights.length));
    fixtureMaterial.emissiveIntensity = 0.2 + effects.lightFlicker * 0.34;
    wallMaterial.emissiveIntensity = 0.075 + effects.wallpaperCreep * 0.055;
    if (textures.wallpaper) {
      textures.wallpaper.offset.y = Math.sin(elapsed * 0.11) * 0.004;
      textures.wallpaper.offset.x = Math.sin(elapsed * 0.067) * 0.002;
    }
    return getEffects();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    unitBox.dispose();
    unitPlane.dispose();
    mushroomStemGeometry.dispose();
    mushroomCapGeometry.dispose();
    disposeMaterial(wallMaterial);
    // carpet map 与 bumpMap 是同一纹理，避免 disposeMaterial 重复释放。
    floorMaterial.bumpMap = null;
    disposeMaterial(floorMaterial);
    disposeMaterial(ceilingMaterial);
    disposeMaterial(moldMaterial);
    disposeMaterial(fixtureMaterial);
    disposeMaterial(mushroomMaterial);
  }

  return {
    group: group,
    colliders: colliders,
    exitTrigger: exitTrigger,
    half: half,
    exitQuarterTurns: quarterTurns,
    seed: generatedSeed,
    layout: {
      roomCount: roomCount,
      rooms: layoutRooms,
      splitAxis: splitVertical ? "x" : "z",
      baseExitSide: baseExitSide,
      exitOffset: exitOffset,
    },
    update: update,
    getEffects: getEffects,
    dispose: dispose,
  };
}

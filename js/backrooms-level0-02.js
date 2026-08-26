/**
 * Level 0.2 — 被遗弃的翻修区。
 *
 * 本文件刻意不依赖宿主的渲染循环细节：旧版 start/update 接口仍可使用，
 * 新版入口控制器、阶段、灰尘和文档则通过附加 API 暴露。
 */
import * as THREE from "three";
import { isRedChannelCell } from "./backrooms-level0-red-room.js";
import { resolveBackroomsGfxProfile } from "./backrooms-gfx-profile.js";
import { createPointLightPool } from "./backrooms-point-light-pool.js";

export const GRAY_DOOR_CELL = { row: 8, col: 2 };
export const LEVEL02_EXIT_CELL = { row: 9, col: 11 };
export const LEVEL02_FOG = 0xd8d5cf;
export const LEVEL02_DAMAGE = 18;
export const LEVEL02_BIG_DAMAGE = 28;
export const LEVEL02_DUST_DAMAGE_PER_SEC = 1.2;
export const LEVEL02_EXIT_SAFE_RADIUS = 4;
export const LEVEL02_DEBRIS_DELAY_SEC = 2;
export const LEVEL02_DEBRIS_INTERVAL_SEC = 1.15;
export const LEVEL02_WALL_INTERVAL_SEC = 1.35;
export const LEVEL02_MAX_ACTIVE_WALL_FALLS = 4;
export const LEVEL02_MAX_DEBRIS = 24;
export const LEVEL02_PHASES = Object.freeze({
  RENOVATED: "renovated",
  COLLAPSE_TILES: "collapse_tiles",
  COLLAPSE_WALLS: "collapse_walls",
  SKELETON_EXPOSED: "skeleton_exposed",
  EXIT_SAFE: "exit_safe",
});

var _grayDoorPickMesh = null;
var _level02ExitPickMesh = null;
var _entranceControllers = [];
var _worldSerial = 0;

export function isGrayDoorCell(row, col) {
  return row === GRAY_DOOR_CELL.row && col === GRAY_DOOR_CELL.col;
}

export function isLevel02ExitCell(row, col) {
  return row === LEVEL02_EXIT_CELL.row && col === LEVEL02_EXIT_CELL.col;
}

export function getGrayDoorPickMesh() {
  return _grayDoorPickMesh;
}

export function getLevel02ExitPickMesh() {
  return _level02ExitPickMesh;
}

export function getLevel02EntranceControllers() {
  _entranceControllers = _entranceControllers.filter(function (controller) {
    return !controller.disposed && controller.group && controller.group.parent;
  });
  return _entranceControllers.slice();
}

function canvasTexture(width, height, painter) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  painter(ctx, width, height);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeNoiseTexture(base, fleck, lines) {
  return canvasTexture(128, 128, function (ctx, w, h) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < 260; i++) {
      ctx.fillStyle = fleck;
      ctx.globalAlpha = 0.025 + Math.random() * 0.08;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
    }
    ctx.globalAlpha = 1;
    if (lines) lines(ctx, w, h);
  });
}

function material(color, roughness, opts) {
  opts = opts || {};
  return new THREE.MeshStandardMaterial({
    color: color,
    map: opts.map || undefined,
    roughness: roughness == null ? 0.9 : roughness,
    metalness: opts.metalness || 0,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
    side: opts.side,
    transparent: !!opts.transparent,
    opacity: opts.opacity == null ? 1 : opts.opacity,
    depthWrite: opts.depthWrite == null ? true : opts.depthWrite,
  });
}

function addBox(parent, name, size, position, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * L0 入口：施工遮挡会在玩家驻留时逐步安静、显出干地毯，最后露出白门。
 * collider 从创建到显门后始终有效。
 */
export function buildGrayDoorWall(parent, wx, wz, gridSize, wallH, wallColliders) {
  var group = new THREE.Group();
  group.name = "Level02ConstructionEntrance";
  group.position.set(wx, 0, wz);

  var dustMat = material(0xc2bba8, 0.98);
  var plasterMat = material(0xe5e2da, 0.94);
  var timberMat = material(0x8b6542, 0.86);
  var whiteDoorMat = material(0xf4f2eb, 0.72, {
    emissive: 0xc9c4b8,
    emissiveIntensity: 0.08,
  });
  var darkMat = material(0x2d2c29, 0.8);

  var blocker = addBox(
    group,
    "Level02ConstructionBlocker",
    [gridSize, wallH, gridSize],
    [0, wallH * 0.5, 0],
    plasterMat
  );
  blocker.userData.brInteract = { kind: "level02_construction" };
  _grayDoorPickMesh = blocker;

  var frame = new THREE.Group();
  frame.name = "Level02TimberFrame";
  addBox(frame, "StudL", [0.11, wallH * 0.92, 0.1], [-gridSize * 0.22, wallH * 0.46, -gridSize * 0.51], timberMat);
  addBox(frame, "StudR", [0.11, wallH * 0.92, 0.1], [gridSize * 0.22, wallH * 0.46, -gridSize * 0.51], timberMat);
  addBox(frame, "Header", [gridSize * 0.56, 0.11, 0.1], [0, wallH * 0.88, -gridSize * 0.51], timberMat);
  group.add(frame);

  var dryTrace = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize * 0.72, gridSize * 0.82),
    material(0x9b1f20, 1, { transparent: true, opacity: 0 })
  );
  dryTrace.name = "Level02DryCarpetTrace";
  dryTrace.rotation.x = -Math.PI * 0.5;
  dryTrace.position.set(0, 0.012, -gridSize * 0.12);
  group.add(dryTrace);

  var door = addBox(
    group,
    "Level02WhiteDoor",
    [gridSize * 0.46, wallH * 0.76, 0.09],
    [0, wallH * 0.38, -gridSize * 0.515],
    whiteDoorMat
  );
  door.visible = false;
  door.userData.brInteract = { kind: "white_door" };
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), darkMat);
  knob.position.set(gridSize * 0.16, wallH * 0.39, -0.06);
  door.add(knob);

  var tape = addBox(group, "WarningTape", [gridSize * 0.74, 0.055, 0.025], [0, wallH * 0.57, -gridSize * 0.525], dustMat);
  tape.rotation.z = -0.14;

  var half = gridSize * 0.5;
  var collider = {
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz + half,
    grayDoor: true,
    level02Entrance: true,
    ghost: false,
  };
  wallColliders.push(collider);
  parent.add(group);

  var controller = {
    group: group,
    pickMesh: blocker,
    door: door,
    collider: collider,
    x: wx,
    z: wz,
    startedAt: 0,
    elapsed: 0,
    phase: "construction",
    disposed: false,
    silenceSent: false,
    traceSent: false,
    doorSent: false,
    reset: function () {
      this.startedAt = 0;
      this.elapsed = 0;
      this.phase = "construction";
      this.silenceSent = false;
      this.traceSent = false;
      this.doorSent = false;
      blocker.visible = true;
      blocker.userData.brInteract.kind = "level02_construction";
      dryTrace.material.opacity = 0;
      door.visible = false;
      frame.visible = true;
      tape.visible = true;
      this.pickMesh = blocker;
      _grayDoorPickMesh = blocker;
    },
    dispose: function () {
      this.disposed = true;
    },
  };
  group.userData.level02EntranceController = controller;
  _entranceControllers.push(controller);
  return controller;
}

/**
 * 更新所有入口。now 应为 performance.now() 风格的毫秒值。
 */
export function updateLevel02Entrances(px, pz, now, callbacks) {
  callbacks = callbacks || {};
  var controllers = getLevel02EntranceControllers();
  var i;
  for (i = 0; i < controllers.length; i++) {
    var c = controllers[i];
    var near = Math.hypot(px - c.x, pz - c.z) <= 4.2;
    if (!near || c.doorSent) continue;
    if (!c.startedAt) c.startedAt = now;
    c.elapsed = Math.max(0, (now - c.startedAt) / 1000);
    if (c.elapsed >= 1.5 && !c.silenceSent) {
      c.silenceSent = true;
      c.phase = "silenced";
      if (callbacks.setHumSilence) callbacks.setHumSilence(true, c);
    }
    if (c.elapsed >= 3 && !c.traceSent) {
      c.traceSent = true;
      c.phase = "dry_trace";
      c.group.getObjectByName("Level02DryCarpetTrace").material.opacity = 0.92;
      c.group.getObjectByName("WarningTape").visible = false;
      if (callbacks.showToast) callbacks.showToast("潮湿的地毯在施工灰下变干了");
    }
    if (c.elapsed >= 5.8) {
      c.doorSent = true;
      c.phase = "white_door";
      c.group.getObjectByName("Level02ConstructionBlocker").visible = false;
      c.group.getObjectByName("Level02TimberFrame").visible = false;
      c.door.visible = true;
      c.pickMesh = c.door;
      _grayDoorPickMesh = c.door;
      if (callbacks.showToast) callbacks.showToast("一扇没有标记的白门露了出来");
    }
  }
  return controllers;
}

function makeWhiteWallTexture(gridSize, wallH) {
  var texture = makeNoiseTexture("#dedbd3", "#6f6b63", function (ctx, w, h) {
    ctx.strokeStyle = "rgba(135,130,120,.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.lineTo(w, h * 0.72);
    ctx.stroke();
  });
  if (texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, gridSize / 1.5), Math.max(1, wallH / 1.5));
  }
  return texture;
}

function addCollider(colliders, wx, wz, gridSize, extra) {
  var half = gridSize * 0.5;
  var collider = Object.assign({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz + half,
    ghost: false,
    fallen: false,
  }, extra || {});
  colliders.push(collider);
  return collider;
}

function buildLevel02ExitDoor(parent, wx, wz, gridSize, wallH, colliders, interactMeshes) {
  var jambMat = material(0xd5d1c8, 0.82);
  var doorMat = material(0x85847f, 0.78);
  var mesh = addBox(parent, "Level02ExitDoor", [gridSize, wallH, gridSize], [wx, wallH * 0.5, wz], jambMat);
  var face = addBox(mesh, "Level02ExitDoorFace", [gridSize * 0.46, wallH * 0.74, 0.08], [0, -wallH * 0.1, -gridSize * 0.51], doorMat);
  face.userData.brInteract = { kind: "level02_exit" };
  mesh.userData.brInteract = { kind: "level02_exit" };
  _level02ExitPickMesh = face;
  interactMeshes.push(face);
  addCollider(colliders, wx, wz, gridSize, { level02Exit: true });
}

function addOutlet(parent, x, z, y, rotationY) {
  var plate = addBox(parent, "Level02Outlet", [0.12, 0.17, 0.025], [x, y, z], material(0xd8d4cb, 0.8));
  plate.rotation.y = rotationY || 0;
  var slots = addBox(plate, "OutletSlots", [0.045, 0.07, 0.008], [0, 0, -0.018], material(0x4b4944, 0.95));
  slots.castShadow = false;
}

function addDocument(parent, x, z, index, interactMeshes) {
  var texts = [
    "残页 01：白墙不是新刷的。它们是在我们离开后自己变白的。",
    "残页 02：先掉的是板，然后是墙。木骨架不会倒，它想让你看见里面。",
    "残页 03：灰尘开始变浓时，往旧灰门跑。门边四米是唯一能呼吸的地方。",
  ];
  var paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.36),
    material(0xd6c7a1, 0.98, { side: THREE.DoubleSide })
  );
  paper.name = "Level02Document_" + (index + 1);
  paper.rotation.set(-Math.PI * 0.49, 0, (index - 1) * 0.31);
  paper.position.set(x, 0.026, z);
  paper.userData.brInteract = {
    kind: "level02_document",
    title: "施工记录残页 " + (index + 1),
    text: texts[index],
    page: index + 1,
  };
  parent.add(paper);
  interactMeshes.push(paper);
  return paper;
}

export function getLevel02DocumentText(mesh) {
  return mesh && mesh.userData && mesh.userData.brInteract
    ? mesh.userData.brInteract.text || ""
    : "";
}

function createPhaseController() {
  return {
    phase: LEVEL02_PHASES.RENOVATED,
    elapsed: 0,
    phaseElapsed: 0,
    dustLevel: 0,
    exitSafe: false,
    generation: _worldSerial,
    reset: function () {
      this.phase = LEVEL02_PHASES.RENOVATED;
      this.elapsed = 0;
      this.phaseElapsed = 0;
      this.dustLevel = 0;
      this.exitSafe = false;
    },
    setPhase: function (next) {
      if (this.phase === next) return false;
      this.phase = next;
      this.phaseElapsed = 0;
      return true;
    },
    getPhase: function () { return this.phase; },
    getDustLevel: function () { return this.dustLevel; },
    isExitSafe: function () { return this.exitSafe; },
  };
}

/**
 * 新建即生成全新的 geometry/material、collider、交互和阶段状态。
 */
export function buildLevel02World(parent, opts) {
  opts = opts || {};
  _worldSerial++;
  _level02ExitPickMesh = null;

  var gridSize = opts.gridSize || 2;
  var wallH = opts.wallHeight || 2.4;
  var matrix = opts.matrix || [[0]];
  var mapRows = opts.mapRows || matrix.length;
  var mapCols = opts.mapCols || matrix[0].length;
  var cellCenterX = opts.cellCenterX || function (col) { return (col - mapCols * 0.5) * gridSize; };
  var cellCenterZ = opts.cellCenterZ || function (row) { return (row - mapRows * 0.5) * gridSize; };
  var mapWidth = opts.mapWidth || mapCols * gridSize;
  var mapDepth = opts.mapDepth || mapRows * gridSize;

  var group = new THREE.Group();
  group.name = "BackroomsLevel02";
  group.visible = false;
  group.userData.level02Generation = _worldSerial;
  var architecture = new THREE.Group();
  var dressing = new THREE.Group();
  var skeletonLayer = new THREE.Group();
  var hazardGroup = new THREE.Group();
  architecture.name = "Level02Architecture";
  dressing.name = "Level02Dressing";
  skeletonLayer.name = "Level02SkeletonLayer";
  hazardGroup.name = "Level02Hazards";
  group.add(architecture, dressing, skeletonLayer, hazardGroup);

  var colliders = [];
  var wallAnimTargets = [];
  var interactMeshes = [];
  var phaseController = createPhaseController();
  colliders._l02Gen = 0;
  colliders._l02PhaseController = phaseController;

  var wallTex = makeWhiteWallTexture(gridSize, wallH);
  var wallMat = material(0xf0ede6, 0.92, { map: wallTex });
  var shellMat = material(0xd8d5cd, 0.95);
  var studMat = material(0x8c6845, 0.88);
  var wallGeo = new THREE.BoxGeometry(gridSize, wallH, gridSize);
  var studGeo = new THREE.BoxGeometry(0.1, wallH * 0.92, 0.11);
  var row;
  var col;
  for (row = 0; row < mapRows; row++) {
    for (col = 0; col < mapCols; col++) {
      if (matrix[row][col] !== 1 || isRedChannelCell(row, col) || isGrayDoorCell(row, col)) continue;
      var wx = cellCenterX(col);
      var wz = cellCenterZ(row);
      if (isLevel02ExitCell(row, col)) {
        buildLevel02ExitDoor(architecture, wx, wz, gridSize, wallH, colliders, interactMeshes);
        continue;
      }
      var wall = new THREE.Mesh(wallGeo, wallMat);
      wall.name = "L02_WhiteWall_" + row + "_" + col;
      wall.position.set(wx, wallH * 0.5, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      architecture.add(wall);
      var wallCollider = addCollider(colliders, wx, wz, gridSize, { row: row, col: col });
      wallAnimTargets.push({ mesh: wall, row: row, col: col, collider: wallCollider, colliderIndex: colliders.length - 1 });

      if ((row * 3 + col) % 4 === 0) {
        var stud = new THREE.Mesh(studGeo, studMat);
        stud.name = "L02_Stud_" + row + "_" + col;
        stud.position.set(wx, wallH * 0.48, wz);
        stud.visible = false;
        skeletonLayer.add(stud);
        wall.userData.exposedStud = stud;
      }
      if ((row + col) % 5 === 0) addOutlet(dressing, wx, wz - gridSize * 0.505, 0.28, 0);
    }
  }

  function addShell(shellRow, shellCol) {
    var x = cellCenterX(shellCol);
    var z = cellCenterZ(shellRow);
    var shell = new THREE.Mesh(wallGeo, shellMat);
    shell.name = "L02_Shell_" + shellRow + "_" + shellCol;
    shell.position.set(x, wallH * 0.5, z);
    architecture.add(shell);
    addCollider(colliders, x, z, gridSize, { shell: true });
  }
  for (col = -1; col <= mapCols; col++) {
    addShell(-1, col);
    addShell(mapRows, col);
  }
  for (row = 0; row < mapRows; row++) {
    addShell(row, -1);
    addShell(row, mapCols);
  }

  var pad = gridSize * 2;
  var supportFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth + pad, mapDepth + pad),
    material(0x4c4640, 1)
  );
  supportFloor.name = "Level02SafetySupportFloor";
  supportFloor.rotation.x = -Math.PI * 0.5;
  supportFloor.position.y = -0.035;
  supportFloor.receiveShadow = true;
  architecture.add(supportFloor);

  var carpetTex = makeNoiseTexture("#8d1f22", "#2c1112", function (ctx, w, h) {
    ctx.fillStyle = "rgba(255,210,180,.05)";
    for (var i = 0; i < 18; i++) ctx.fillRect(Math.random() * w, 0, 1, h);
  });
  if (carpetTex) {
    carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping;
    carpetTex.repeat.set(mapWidth / 2, mapDepth / 2);
  }
  var carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth + pad, mapDepth + pad, 12, 12),
    material(0x8d1f22, 1, { map: carpetTex })
  );
  carpet.name = "Level02RedCarpet";
  carpet.rotation.x = -Math.PI * 0.5;
  carpet.position.y = 0.006;
  carpet.receiveShadow = true;
  architecture.add(carpet);

  var damageLayer = new THREE.Group();
  damageLayer.name = "Level02CarpetDamage";
  damageLayer.visible = false;
  var tearMat = material(0x302924, 1, { side: THREE.DoubleSide });
  for (var ti = 0; ti < 11; ti++) {
    var tear = new THREE.Mesh(
      new THREE.CircleGeometry(0.2 + (ti % 4) * 0.09, 5),
      tearMat
    );
    tear.rotation.x = -Math.PI * 0.5;
    tear.rotation.z = ti * 1.73;
    tear.scale.set(1.8, 0.42 + (ti % 3) * 0.18, 1);
    tear.position.set(
      ((ti * 7) % 13) / 13 * mapWidth - mapWidth * 0.5,
      0.012,
      ((ti * 11) % 17) / 17 * mapDepth - mapDepth * 0.5
    );
    damageLayer.add(tear);
  }
  architecture.add(damageLayer);

  var ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth + pad, mapDepth + pad),
    material(0xe5e2da, 0.94, { side: THREE.DoubleSide })
  );
  ceiling.name = "Level02Ceiling";
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = wallH;
  architecture.add(ceiling);

  // 简单洗手间暗示：磨砂隔板、洗手台和失效标牌。
  var restroom = new THREE.Group();
  restroom.name = "Level02Restroom";
  var rrX = cellCenterX(Math.max(1, Math.floor(mapCols * 0.25)));
  var rrZ = cellCenterZ(Math.max(1, Math.floor(mapRows * 0.25)));
  restroom.position.set(rrX, 0, rrZ);
  addBox(restroom, "RestroomPartition", [1.4, wallH * 0.82, 0.08], [0, wallH * 0.41, 0], material(0xc9cbc8, 0.72));
  addBox(restroom, "RestroomSink", [0.56, 0.14, 0.42], [0, 0.72, -0.3], material(0xe5e3dc, 0.65));
  addBox(restroom, "RestroomSign", [0.28, 0.18, 0.025], [0.43, 1.45, -0.055], material(0x41484c, 0.8));
  dressing.add(restroom);

  // 板夹与三张可阅读残页。
  var clipboard = addBox(
    dressing,
    "Level02Clipboard",
    [0.34, 0.035, 0.46],
    [cellCenterX(2), 0.025, cellCenterZ(2)],
    material(0x6d4a2e, 0.9)
  );
  clipboard.userData.brInteract = {
    kind: "level02_document",
    title: "装修公司板夹",
    text: "工单：旧墙拆除后必须保留木骨架。施工队未签署撤离记录。",
  };
  interactMeshes.push(clipboard);
  var walkable = [];
  for (row = 0; row < mapRows; row++) {
    for (col = 0; col < mapCols; col++) {
      if (matrix[row][col] === 0) walkable.push({ x: cellCenterX(col), z: cellCenterZ(row) });
    }
  }
  var docs = Math.min(3, walkable.length);
  for (var di = 0; di < docs; di++) {
    var spot = walkable[Math.floor(((di + 1) * walkable.length) / (docs + 1))];
    addDocument(dressing, spot.x + (di - 1) * 0.2, spot.z + 0.15, di, interactMeshes);
  }

  var spawnSpot = walkable[0] || { x: 0, z: 0 };
  var exitCenter = {
    x: cellCenterX(LEVEL02_EXIT_CELL.col),
    z: cellCenterZ(LEVEL02_EXIT_CELL.row),
  };
  var spawn = { x: spawnSpot.x, y: 0, z: spawnSpot.z };

  group.add(new THREE.HemisphereLight(0xfffdf3, 0x593d36, 0.48));
  group.add(new THREE.AmbientLight(0xe9dfd2, 0.24));
  var lightCandidates = walkable.filter(function (_, index) { return index % 3 === 0; }).map(function (p) {
    return { x: p.x, y: wallH - 0.25, z: p.z, intensity: 0.42 };
  });
  var gfx = resolveBackroomsGfxProfile();
  var lightPool = createPointLightPool(group, {
    count: Math.min(gfx.pointLightBudget, lightCandidates.length),
    color: 0xffe8ce,
    distance: 9,
    decay: 1.7,
    y: wallH - 0.25,
    name: "Level02PooledLight",
  });

  phaseController.skeletonLayer = skeletonLayer;
  phaseController.carpet = carpet;
  phaseController.damageLayer = damageLayer;
  phaseController.ceiling = ceiling;
  phaseController.exitCenter = exitCenter;
  phaseController.interactMeshes = interactMeshes;
  parent.add(group);

  return {
    group: group,
    hazardGroup: hazardGroup,
    colliders: colliders,
    wallAnimTargets: wallAnimTargets,
    spawn: spawn,
    exitCenter: exitCenter,
    interactMeshes: interactMeshes,
    phaseController: phaseController,
    updateLights: function (px, pz) { lightPool.update(px, pz, lightCandidates); },
    disposeLights: function () { lightPool.dispose(); },
  };
}

function playCrackSound() {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ac = new AudioCtx();
    var length = Math.floor(ac.sampleRate * 0.22);
    var buffer = ac.createBuffer(1, length, ac.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      var decay = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    var source = ac.createBufferSource();
    var filter = ac.createBiquadFilter();
    var gain = ac.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 520;
    gain.gain.value = 0.12;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start();
    source.onended = function () { ac.close().catch(function () {}); };
  } catch (_) {
    // WebAudio 可能受自动播放策略限制；灾害视觉不依赖声音。
  }
}

/**
 * 兼容旧宿主的灾害入口，并提供阶段/灰尘/FX 查询。
 */
export function createLevel02EnterHazards(scene, ctx) {
  ctx = ctx || {};
  var wallH = ctx.wallHeight || 2.4;
  var active = false;
  var hazardParent = null;
  var debrisRoot = null;
  var wallTargets = [];
  var colliders = null;
  var phase = createPhaseController();
  var exitCenter = null;
  var debris = [];
  var warnings = [];
  var fallen = Object.create(null);
  var elapsed = 0;
  var renovatedDuration = 10 + Math.random() * 10;
  var spawnAcc = 0;
  var wallAcc = 0;
  var dustDamageAcc = 0;
  var sharedGeo = null;
  var tileMat = null;
  var dustMat = null;

  function ensureAssets() {
    if (!sharedGeo) sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    if (!tileMat) tileMat = new THREE.MeshBasicMaterial({ color: 0xc6c0b5 });
    if (!dustMat) {
      dustMat = new THREE.MeshBasicMaterial({
        color: 0xa89d8c,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
    }
  }

  function rootAdd(mesh) {
    (debrisRoot || hazardParent || scene).add(mesh);
  }

  function remove(mesh) {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
  }

  function bumpColliderGeneration() {
    if (colliders) colliders._l02Gen = (colliders._l02Gen | 0) + 1;
  }

  function spawnDustPuff(x, z, count) {
    ensureAssets();
    for (var i = 0; i < count && debris.length < LEVEL02_MAX_DEBRIS; i++) {
      var puff = new THREE.Mesh(sharedGeo, dustMat);
      var size = 0.07 + Math.random() * 0.14;
      puff.scale.set(size, size, size);
      puff.position.set(x + (Math.random() - 0.5) * 1.4, 0.35 + Math.random() * wallH * 0.7, z + (Math.random() - 0.5) * 1.4);
      puff.userData.l02Debris = { vy: -0.18 - Math.random() * 0.22, ttl: 1.1 + Math.random() * 1.1, dust: true };
      rootAdd(puff);
      debris.push(puff);
    }
  }

  function spawnTile(x, z, dangerous) {
    if (debris.length >= LEVEL02_MAX_DEBRIS) return;
    ensureAssets();
    var mesh = new THREE.Mesh(sharedGeo, tileMat);
    mesh.scale.set(0.32 + Math.random() * 0.42, 0.06, 0.32 + Math.random() * 0.42);
    mesh.position.set(x + (Math.random() - 0.5) * 0.7, wallH - 0.16, z + (Math.random() - 0.5) * 0.7);
    mesh.userData.l02Debris = {
      vy: -3.4 - Math.random() * 2.4,
      ttl: 2.2,
      dangerous: dangerous,
      hit: false,
    };
    rootAdd(mesh);
    debris.push(mesh);
  }

  function queueCeilingWarning(px, pz) {
    if (warnings.length >= 3) return;
    warnings.push({ x: px + (Math.random() - 0.5) * 1.2, z: pz + (Math.random() - 0.5) * 1.2, time: 1 + Math.random() * 0.5, kind: "tile" });
    playCrackSound();
    spawnDustPuff(px, pz, 4);
  }

  function queueWallWarning(px, pz) {
    if (warnings.length >= 3 || !wallTargets.length) return;
    var candidates = wallTargets.filter(function (w) {
      if (!w.mesh || !w.mesh.parent || w.collider.fallen) return false;
      var p = w.mesh.position;
      var d = Math.hypot(p.x - px, p.z - pz);
      return d > 1 && d < 10 && !fallen[w.row + "_" + w.col];
    });
    if (!candidates.length) return;
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    warnings.push({ target: target, x: target.mesh.position.x, z: target.mesh.position.z, time: 1 + Math.random() * 0.5, kind: "wall" });
    playCrackSound();
    spawnDustPuff(target.mesh.position.x, target.mesh.position.z, 5);
  }

  function collapseWall(w, player, survival, onToast) {
    if (!w || !w.collider || w.collider.fallen) return;
    var key = w.row + "_" + w.col;
    fallen[key] = true;
    w.collider.fallen = true;
    w.collider.ghost = true;
    w.collider.minX = w.collider.minZ = 1e9;
    w.collider.maxX = w.collider.maxZ = -1e9;
    bumpColliderGeneration();
    if (w.mesh.userData.exposedStud) w.mesh.userData.exposedStud.visible = true;
    w.mesh.visible = false;
    spawnDustPuff(w.mesh.position.x, w.mesh.position.z, 8);
    var dist = Math.hypot(player.x - w.mesh.position.x, player.z - w.mesh.position.z);
    if (dist < 1.8 && survival && !survival.dead) {
      survival.takeDamage(LEVEL02_BIG_DAMAGE);
      if (onToast) onToast("倒下的墙板擦中了你");
    }
  }

  function setPhase(next, onToast) {
    phase.setPhase(next);
    if (next === LEVEL02_PHASES.COLLAPSE_TILES && phase.damageLayer) {
      phase.damageLayer.visible = true;
    }
    if (next === LEVEL02_PHASES.SKELETON_EXPOSED && phase.skeletonLayer) {
      phase.skeletonLayer.traverse(function (obj) {
        if (obj.isMesh) obj.visible = true;
      });
    }
    if (colliders && colliders._l02PhaseController) {
      colliders._l02PhaseController.setPhase(next);
      colliders._l02PhaseController.dustLevel = phase.dustLevel;
    }
    if (!onToast) return;
    if (next === LEVEL02_PHASES.COLLAPSE_TILES) onToast("天花板开始发出连续的裂响");
    else if (next === LEVEL02_PHASES.COLLAPSE_WALLS) onToast("白墙正在从木骨架上剥离");
    else if (next === LEVEL02_PHASES.SKELETON_EXPOSED) onToast("翻修层只剩裸露骨架");
    else if (next === LEVEL02_PHASES.EXIT_SAFE) onToast("门边的空气暂时没有灰尘");
  }

  function start(px, pz, targets, colliderList, hazardGroup, visualRoot) {
    disposeVisuals();
    ensureAssets();
    active = true;
    hazardParent = hazardGroup || null;
    debrisRoot = visualRoot || hazardGroup || null;
    wallTargets = targets || [];
    colliders = colliderList || null;
    phase = colliders && colliders._l02PhaseController
      ? colliders._l02PhaseController
      : createPhaseController();
    phase.reset();
    exitCenter = phase.exitCenter || ctx.exitCenter || null;
    elapsed = 0;
    renovatedDuration = 10 + Math.random() * 10;
    spawnAcc = wallAcc = dustDamageAcc = 0;
    fallen = Object.create(null);
  }

  function disposeVisuals() {
    for (var i = 0; i < debris.length; i++) remove(debris[i]);
    debris.length = 0;
    warnings.length = 0;
  }

  function update(dt, player, survival, onToast) {
    if (!active || !player) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    elapsed += dt;
    phase.elapsed += dt;
    phase.phaseElapsed += dt;

    if (!exitCenter && colliders && colliders._l02PhaseController) exitCenter = colliders._l02PhaseController.exitCenter;
    if (exitCenter && Math.hypot(player.x - exitCenter.x, player.z - exitCenter.z) <= LEVEL02_EXIT_SAFE_RADIUS) {
      if (!phase.exitSafe) {
        phase.exitSafe = true;
        phase.dustLevel = 0;
        warnings.length = 0;
        setPhase(LEVEL02_PHASES.EXIT_SAFE, onToast);
      }
    }

    if (!phase.exitSafe) {
      if (phase.phase === LEVEL02_PHASES.RENOVATED && elapsed >= renovatedDuration) {
        setPhase(LEVEL02_PHASES.COLLAPSE_TILES, onToast);
      } else if (phase.phase === LEVEL02_PHASES.COLLAPSE_TILES && phase.phaseElapsed >= 5.5) {
        setPhase(LEVEL02_PHASES.COLLAPSE_WALLS, onToast);
      } else if (phase.phase === LEVEL02_PHASES.COLLAPSE_WALLS && phase.phaseElapsed >= 8) {
        setPhase(LEVEL02_PHASES.SKELETON_EXPOSED, onToast);
      }

      var collapsing = phase.phase !== LEVEL02_PHASES.RENOVATED;
      if (collapsing) {
        phase.dustLevel = Math.min(1, phase.dustLevel + dt * (phase.phase === LEVEL02_PHASES.SKELETON_EXPOSED ? 0.045 : 0.08));
        dustDamageAcc += dt * LEVEL02_DUST_DAMAGE_PER_SEC;
        if (dustDamageAcc >= 0.25 && survival && !survival.dead) {
          survival.takeDamage(dustDamageAcc);
          dustDamageAcc = 0;
        }
        spawnAcc += dt;
        if (spawnAcc >= LEVEL02_DEBRIS_INTERVAL_SEC) {
          spawnAcc = 0;
          queueCeilingWarning(player.x, player.z);
        }
        if (phase.phase === LEVEL02_PHASES.COLLAPSE_WALLS || phase.phase === LEVEL02_PHASES.SKELETON_EXPOSED) {
          wallAcc += dt;
          if (wallAcc >= LEVEL02_WALL_INTERVAL_SEC) {
            wallAcc = 0;
            queueWallWarning(player.x, player.z);
          }
        }
      }
    }

    var i;
    for (i = warnings.length - 1; i >= 0; i--) {
      warnings[i].time -= dt;
      if (warnings[i].time > 0) continue;
      if (warnings[i].kind === "wall") collapseWall(warnings[i].target, player, survival, onToast);
      else spawnTile(warnings[i].x, warnings[i].z, true);
      warnings.splice(i, 1);
    }

    var feetY = player.feetY == null ? 0 : player.feetY;
    var radius = player.radius || 0.32;
    for (i = debris.length - 1; i >= 0; i--) {
      var mesh = debris[i];
      var state = mesh.userData.l02Debris;
      state.ttl -= dt;
      state.vy -= state.dust ? 0 : 18 * dt;
      mesh.position.y += state.vy * dt;
      mesh.rotation.x += dt * 2.5;
      if (state.dangerous && !state.hit && Math.abs(mesh.position.x - player.x) < radius + 0.4 &&
          Math.abs(mesh.position.z - player.z) < radius + 0.4 && mesh.position.y < feetY + 1.8) {
        state.hit = true;
        if (survival && !survival.dead) survival.takeDamage(LEVEL02_DAMAGE);
        if (onToast) onToast("坠落的顶板砸中了你");
      }
      if (state.ttl <= 0 || mesh.position.y < -0.4) {
        remove(mesh);
        debris.splice(i, 1);
      }
    }
    if (colliders && colliders._l02PhaseController) {
      colliders._l02PhaseController.dustLevel = phase.dustLevel;
      colliders._l02PhaseController.exitSafe = phase.exitSafe;
    }
  }

  function drawFx(canvas, now) {
    if (!canvas || !phase.dustLevel || phase.exitSafe) return;
    var ctx2d = canvas.getContext && canvas.getContext("2d");
    if (!ctx2d) return;
    var w = canvas.width;
    var h = canvas.height;
    var amount = phase.dustLevel;
    ctx2d.save();
    ctx2d.fillStyle = "rgba(137,122,101," + (amount * 0.16).toFixed(3) + ")";
    ctx2d.fillRect(0, 0, w, h);
    var seed = Math.floor((now || 0) / 80);
    for (var i = 0; i < Math.floor(12 + amount * 32); i++) {
      var x = ((i * 97 + seed * 29) % 997) / 997 * w;
      var y = ((i * 53 + seed * 17) % 991) / 991 * h;
      ctx2d.fillStyle = "rgba(220,208,187," + (0.025 + amount * 0.055) + ")";
      ctx2d.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
    }
    ctx2d.restore();
  }

  function isActive() { return active; }
  function getPhase() { return phase.phase; }
  function getDustLevel() { return phase.dustLevel; }
  function isExitSafe() { return phase.exitSafe; }

  function dispose() {
    disposeVisuals();
    if (sharedGeo) sharedGeo.dispose();
    if (tileMat) tileMat.dispose();
    if (dustMat) dustMat.dispose();
    sharedGeo = null;
    tileMat = null;
    dustMat = null;
    active = false;
    hazardParent = null;
    debrisRoot = null;
    wallTargets = [];
    colliders = null;
    exitCenter = null;
    fallen = Object.create(null);
    elapsed = spawnAcc = wallAcc = dustDamageAcc = 0;
  }

  return {
    start: start,
    update: update,
    isActive: isActive,
    dispose: dispose,
    getPhase: getPhase,
    getDustLevel: getDustLevel,
    drawFx: drawFx,
    isExitSafe: isExitSafe,
    getVisionParams: function () {
      var dust = phase.exitSafe ? 0 : phase.dustLevel;
      return { dust: dust, visibility: 1 - dust * 0.62, fogNear: 0.7 + dust * 0.8, fogFarScale: 1 - dust * 0.68 };
    },
  };
}

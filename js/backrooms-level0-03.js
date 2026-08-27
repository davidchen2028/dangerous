/**
 * Level 0 — 蓝洞 → Level 0.3 “冰封翻修区”
 *
 * 本模块不读写 survival 状态。伤害、提示和报告回收全部通过 callbacks 发出，
 * 因而也可以被独立场景或测试工具安全复用。
 */
import * as THREE from "three";

/** 须为 BACKROOMS_MATRIX 中的 0（可走格） */
export const BLUE_HOLE_CELL = { row: 10, col: 4 };
export const LEVEL03_GRID = 10;
export const LEVEL03_FOG = 0x0a1428;
export const LEVEL03_COLD_HP_PER_SEC = 3;
export const LEVEL03_REPORT_COUNT = 4;

var _matrix = new THREE.Matrix4();
var _position = new THREE.Vector3();
var _quaternion = new THREE.Quaternion();
var _scale = new THREE.Vector3();

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function disposeMaterial(material) {
  if (!material) return;
  var maps = ["map", "alphaMap", "bumpMap", "normalMap", "roughnessMap", "emissiveMap"];
  for (var i = 0; i < maps.length; i++) {
    if (material[maps[i]] && material[maps[i]].dispose) material[maps[i]].dispose();
    material[maps[i]] = null;
  }
  material.dispose();
}

function setInstance(mesh, index, x, y, z, sx, sy, sz, rotationY) {
  _position.set(x, y, z);
  _quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotationY || 0);
  _scale.set(sx, sy, sz);
  _matrix.compose(_position, _quaternion, _scale);
  mesh.setMatrixAt(index, _matrix);
}

function resolveInteraction(target) {
  var object = target && (target.object || target);
  if (!object) return null;
  return object.userData && object.userData.brInteract
    ? object.userData.brInteract
    : object.kind
      ? object
      : null;
}

export function isBlueHoleCell(row, col) {
  return row === BLUE_HOLE_CELL.row && col === BLUE_HOLE_CELL.col;
}

export function getBlueHoleTriggerAabb(cellCenterX, cellCenterZ, gridSize) {
  var wx = cellCenterX(BLUE_HOLE_CELL.col);
  var wz = cellCenterZ(BLUE_HOLE_CELL.row);
  var half = gridSize * 0.38;
  return { minX: wx - half, maxX: wx + half, minZ: wz - half, maxZ: wz + half };
}

/**
 * 结霜裂口。返回值仍是 THREE.Group，并附带幂等 dispose() 以兼容旧调用方。
 */
export function buildBlueHole(parent, wx, wz, gridSize) {
  var group = new THREE.Group();
  group.name = "BlueHole";
  group.position.set(wx, 0, wz);

  var holeSize = gridSize * 0.72;
  var boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  var shardGeometry = new THREE.ConeGeometry(0.055, 0.42, 5);
  var discGeometry = new THREE.CircleGeometry(0.5, 40);
  var rimMaterial = new THREE.MeshStandardMaterial({
    color: 0x9bc5d9,
    emissive: 0x173d5d,
    emissiveIntensity: 0.26,
    roughness: 0.68,
  });
  var iceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x7fc9ed,
    emissive: 0x164e7d,
    emissiveIntensity: 0.5,
    roughness: 0.18,
    transmission: 0.22,
    transparent: true,
    opacity: 0.9,
  });
  var voidMaterial = new THREE.MeshBasicMaterial({ color: 0x06142c });

  var rim = new THREE.InstancedMesh(boxGeometry, rimMaterial, 16);
  rim.name = "BlueHoleFrozenRim";
  for (var i = 0; i < 16; i++) {
    var angle = (i / 16) * Math.PI * 2;
    var radius = holeSize * (0.47 + (i % 3) * 0.018);
    setInstance(
      rim,
      i,
      Math.cos(angle) * radius,
      0.035 + (i % 2) * 0.012,
      Math.sin(angle) * radius,
      holeSize * 0.2,
      0.07,
      0.12,
      -angle
    );
  }
  rim.instanceMatrix.needsUpdate = true;
  group.add(rim);

  var shards = new THREE.InstancedMesh(shardGeometry, iceMaterial, 12);
  shards.name = "BlueHoleFrostTeeth";
  for (i = 0; i < 12; i++) {
    angle = (i / 12) * Math.PI * 2 + 0.13;
    setInstance(
      shards,
      i,
      Math.cos(angle) * holeSize * 0.39,
      -0.12,
      Math.sin(angle) * holeSize * 0.39,
      0.8 + (i % 4) * 0.12,
      0.8 + (i % 3) * 0.18,
      0.8,
      angle
    );
  }
  shards.instanceMatrix.needsUpdate = true;
  group.add(shards);

  var ice = new THREE.Mesh(discGeometry, iceMaterial);
  ice.name = "BlueHoleIceSheen";
  ice.rotation.x = -Math.PI * 0.5;
  ice.scale.setScalar(holeSize * 0.93);
  ice.position.y = -0.24;
  group.add(ice);
  var deep = new THREE.Mesh(discGeometry, voidMaterial);
  deep.name = "BlueHoleDepth";
  deep.rotation.x = -Math.PI * 0.5;
  deep.scale.setScalar(holeSize * 0.78);
  deep.position.y = -0.7;
  group.add(deep);
  var glow = new THREE.PointLight(0x70caff, 1.2, gridSize * 3.4, 1.7);
  glow.position.y = -0.18;
  group.add(glow);

  var disposed = false;
  group.dispose = function disposeBlueHole() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    boxGeometry.dispose();
    shardGeometry.dispose();
    discGeometry.dispose();
    disposeMaterial(rimMaterial);
    disposeMaterial(iceMaterial);
    disposeMaterial(voidMaterial);
  };
  if (parent) parent.add(group);
  return group;
}

/**
 * 构造严格封闭的 Level 0.3。所有坐标均为房间局部/世界同源坐标。
 */
export function buildLevel03Room(parent, gridSize, wallH, opts) {
  opts = opts || {};
  gridSize = Math.max(1.8, Number(gridSize) || 3);
  wallH = Math.max(2.4, Number(wallH) || 3.2);

  var group = new THREE.Group();
  group.name = "Level03FrozenRenovationMaze";
  group.visible = opts.visible === true;
  var span = LEVEL03_GRID * gridSize;
  var half = span * 0.5;
  var wallThickness = Math.max(0.16, gridSize * 0.075);
  var colliders = [];
  var interactMeshes = [];
  var geometries = [];
  var materials = [];
  var lights = [];

  var unitBox = new THREE.BoxGeometry(1, 1, 1);
  var unitPlane = new THREE.PlaneGeometry(1, 1);
  var ventGeometry = new THREE.BoxGeometry(1, 0.16, 0.58);
  geometries.push(unitBox, unitPlane, ventGeometry);

  function ownMaterial(material) {
    materials.push(material);
    return material;
  }

  var wallMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xd9e2dd,
      emissive: 0x16384a,
      emissiveIntensity: 0.075,
      roughness: 0.94,
    })
  );
  var carpetMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x47585c,
      roughness: 1,
      bumpScale: 0.08,
    })
  );
  var ceilingMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({ color: 0x89999b, roughness: 0.9 })
  );
  var iceMaterial = ownMaterial(
    new THREE.MeshPhysicalMaterial({
      color: 0x8fd1e6,
      emissive: 0x17465c,
      emissiveIntensity: 0.18,
      roughness: 0.24,
      transparent: true,
      opacity: 0.86,
      transmission: 0.12,
    })
  );
  var peelMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xf3f2df,
      roughness: 0.98,
      side: THREE.DoubleSide,
    })
  );
  var metalMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x53636a,
      roughness: 0.62,
      metalness: 0.46,
    })
  );
  var lampMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0xd9eff1,
      emissive: 0x9ad8e8,
      emissiveIntensity: 0.75,
      roughness: 0.45,
    })
  );
  var paperMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.92 })
  );
  var torchMaterial = ownMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x8d3d28,
      emissive: 0x3b1008,
      emissiveIntensity: 0.1,
      roughness: 0.7,
    })
  );

  function addScaledBox(material, name, x, y, z, sx, sy, sz) {
    var mesh = new THREE.Mesh(unitBox, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    return mesh;
  }

  function addCollider(x, z, width, depth, kind) {
    colliders.push({
      minX: x - width * 0.5,
      maxX: x + width * 0.5,
      minZ: z - depth * 0.5,
      maxZ: z + depth * 0.5,
      kind: kind || "wall",
    });
  }

  function addWall(x, z, width, depth) {
    addScaledBox(wallMaterial, "FrozenPeelingWall", x, wallH * 0.5, z, width, wallH, depth);
    addCollider(x, z, width, depth, "frozen_wall");
  }

  // 粗硬地毯和密闭顶板。
  addScaledBox(carpetMaterial, "FrozenCoarseCarpet", 0, -0.07, 0, span, 0.14, span);
  addScaledBox(ceilingMaterial, "SealedCeiling", 0, wallH + 0.045, 0, span, 0.09, span);

  // 四边不留缝；这里刻意不存在 exitTrigger。
  addWall(0, -half, span + wallThickness, wallThickness);
  addWall(0, half, span + wallThickness, wallThickness);
  addWall(-half, 0, wallThickness, span);
  addWall(half, 0, wallThickness, span);

  // 宽通道手工迷宫。每段都短于房间跨度，保证区域连通但没有正常出口。
  var mazeSegments = [
    [-gridSize * 2.8, -gridSize * 2.2, wallThickness, gridSize * 4.2],
    [-gridSize * 2.8, gridSize * 2.5, wallThickness, gridSize * 3.0],
    [-gridSize * 0.8, -gridSize * 3.0, gridSize * 3.9, wallThickness],
    [gridSize * 2.2, -gridSize * 2.6, wallThickness, gridSize * 3.7],
    [gridSize * 2.2, gridSize * 2.6, wallThickness, gridSize * 3.1],
    [-gridSize * 0.3, gridSize * 0.5, gridSize * 3.5, wallThickness],
    [-gridSize * 3.7, gridSize * 1.2, gridSize * 1.8, wallThickness],
    [gridSize * 3.4, gridSize * 0.8, gridSize * 2.0, wallThickness],
    [-gridSize * 0.5, gridSize * 3.3, gridSize * 3.8, wallThickness],
    [gridSize * 0.2, -gridSize * 1.2, wallThickness, gridSize * 2.1],
  ];
  for (var i = 0; i < mazeSegments.length; i++) {
    addWall(
      mazeSegments[i][0],
      mazeSegments[i][1],
      mazeSegments[i][2],
      mazeSegments[i][3]
    );
  }

  // 冻白墙纸的剥落片全部共用几何，并用实例批量绘制。
  var peelCount = 46;
  var peels = new THREE.InstancedMesh(unitPlane, peelMaterial, peelCount);
  peels.name = "PeelingWallpaperSheets";
  for (i = 0; i < peelCount; i++) {
    var peelX = -half + gridSize * (0.45 + ((i * 37) % 91) / 10);
    var peelZ = i % 2 ? -half + 0.012 : half - 0.012;
    setInstance(
      peels,
      i,
      peelX,
      wallH * (0.25 + ((i * 19) % 48) / 100),
      peelZ,
      gridSize * (0.15 + (i % 5) * 0.025),
      wallH * (0.12 + (i % 3) * 0.035),
      1,
      i % 2 ? 0 : Math.PI
    );
  }
  peels.instanceMatrix.needsUpdate = true;
  group.add(peels);

  // 大冰块使用一个 InstancedMesh；其 AABB 同时成为静态碰撞体。
  var iceBlocksData = [
    [-gridSize * 3.8, -gridSize * 0.7, 0.76, 0.92, 0.68],
    [gridSize * 3.6, -gridSize * 1.3, 0.9, 0.72, 0.78],
    [-gridSize * 1.5, gridSize * 2.2, 0.68, 1.08, 0.82],
    [gridSize * 1.0, gridSize * 3.9, 0.88, 0.76, 0.7],
    [gridSize * 0.9, -gridSize * 3.8, 0.72, 0.86, 0.94],
  ];
  var iceBlocks = new THREE.InstancedMesh(unitBox, iceMaterial, iceBlocksData.length);
  iceBlocks.name = "Level03LargeIceBlocks";
  for (i = 0; i < iceBlocksData.length; i++) {
    var block = iceBlocksData[i];
    var bw = gridSize * block[2];
    var bh = wallH * block[3];
    var bd = gridSize * block[4];
    setInstance(iceBlocks, i, block[0], bh * 0.5, block[1], bw, bh, bd, (i % 3 - 1) * 0.08);
    addCollider(block[0], block[1], bw * 0.9, bd * 0.9, "ice_block");
  }
  iceBlocks.instanceMatrix.needsUpdate = true;
  group.add(iceBlocks);

  // 悬挂灯：灯壳实例化，少量真实光源负责照明和故障闪烁。
  var lampPositions = [
    [-gridSize * 3.2, -gridSize * 3.6],
    [0, -gridSize * 2.2],
    [gridSize * 3.2, -gridSize * 3.4],
    [-gridSize * 3.3, gridSize * 2.7],
    [0, gridSize * 2.4],
    [gridSize * 3.1, gridSize * 3.4],
  ];
  var lampFixtures = new THREE.InstancedMesh(unitBox, lampMaterial, lampPositions.length);
  lampFixtures.name = "HangingFrozenLights";
  for (i = 0; i < lampPositions.length; i++) {
    setInstance(
      lampFixtures,
      i,
      lampPositions[i][0],
      wallH - 0.22,
      lampPositions[i][1],
      gridSize * 0.62,
      0.07,
      0.12,
      i % 2 ? Math.PI * 0.5 : 0
    );
    var light = new THREE.PointLight(0xbcecff, 0.42, gridSize * 4.2, 2);
    light.position.set(lampPositions[i][0], wallH - 0.35, lampPositions[i][1]);
    light.userData.baseIntensity = light.intensity;
    light.userData.phase = i * 1.73;
    lights.push(light);
    group.add(light);
  }
  lampFixtures.instanceMatrix.needsUpdate = true;
  group.add(lampFixtures);
  group.add(new THREE.HemisphereLight(0x90bad0, 0x101b25, 0.27));

  // 通风口只在顶板下移动，不作为碰撞体；换位前仍显式检查玩家附近区域。
  var ventSlots = [
    [-gridSize * 3.7, -gridSize * 2.3],
    [-gridSize * 1.0, gridSize * 1.5],
    [gridSize * 1.3, -gridSize * 0.4],
    [gridSize * 3.5, gridSize * 2.1],
  ];
  var vents = new THREE.InstancedMesh(ventGeometry, metalMaterial, ventSlots.length);
  vents.name = "CyclingCeilingVents";
  var ventStates = [];
  for (i = 0; i < ventSlots.length; i++) {
    ventStates.push({
      x: ventSlots[i][0],
      z: ventSlots[i][1],
      fromX: ventSlots[i][0],
      fromZ: ventSlots[i][1],
      targetX: ventSlots[i][0],
      targetZ: ventSlots[i][1],
      moving: false,
      progress: 1,
    });
    setInstance(vents, i, ventSlots[i][0], wallH - 0.09, ventSlots[i][1], gridSize * 0.75, 1, 1, i % 2 ? Math.PI * 0.5 : 0);
  }
  vents.instanceMatrix.needsUpdate = true;
  group.add(vents);

  // 废弃故障喷枪：仅提供一次短时热源，不承担任何离开关卡的功能。
  var torch = addScaledBox(
    torchMaterial,
    "AbandonedFaultyTorch",
    -gridSize * 3.9,
    0.34,
    gridSize * 3.8,
    0.2,
    0.55,
    0.18
  );
  torch.rotation.z = -0.35;
  torch.userData.brInteract = { kind: "level03_torch" };
  interactMeshes.push(torch);
  var torchLight = new THREE.PointLight(0xff7a38, 0, gridSize * 3, 2);
  torchLight.position.set(torch.position.x, 0.8, torch.position.z);
  group.add(torchLight);

  // 多份装修记录，最后一份是重建报告。
  var reportTexts = [
    "装修记录 01：地毯在一夜之间冻硬，胶层无法剥离。",
    "装修记录 02：封闭所有门洞后，冷风仍从顶板通风口出现。",
    "装修记录 03：蓝色结冰区域继续扩大；喷枪只能延缓失温。",
    "最终重建报告：本区无可确认出口。施工队已失联，停止重建。",
  ];
  var reportPositions = [
    [-gridSize * 1.7, -gridSize * 3.7],
    [gridSize * 3.8, gridSize * 0.1],
    [-gridSize * 3.7, gridSize * 2.0],
    [gridSize * 1.7, gridSize * 3.85],
  ];
  for (i = 0; i < reportTexts.length; i++) {
    var paper = new THREE.Mesh(unitPlane, paperMaterial);
    paper.name = i === reportTexts.length - 1 ? "FinalReconstructionReport" : "RenovationRecord";
    paper.rotation.x = -Math.PI * 0.5;
    paper.rotation.z = (i - 1.5) * 0.16;
    paper.position.set(reportPositions[i][0], 0.018, reportPositions[i][1]);
    paper.scale.set(gridSize * 0.34, gridSize * 0.24, 1);
    paper.userData.brInteract = {
      kind: "level03_report",
      id: i,
      final: i === reportTexts.length - 1,
      text: reportTexts[i],
    };
    group.add(paper);
    interactMeshes.push(paper);
  }

  if (parent) parent.add(group);

  var spawn = { x: -gridSize * 4.15, z: -gridSize * 4.15, yaw: Math.PI * 0.25 };
  var elapsed = 0;
  var ventTimer = 0;
  var coldExposure = 0;
  var coldDamageBuffer = 0;
  var warningCooldown = 0;
  var torchUsed = false;
  var torchTime = 0;
  var finalReportRecovered = false;
  var readReports = Object.create(null);
  var disposed = false;
  var fxCanvas = null;
  var fxContext = null;
  var stats = {
    reportsRead: 0,
    reportCount: reportTexts.length,
    finalReportRecovered: false,
    torchUsed: false,
    torchSecondsRemaining: 0,
    ventMoves: 0,
    coldExposure: 0,
    elapsed: 0,
  };

  function getInteractionHint(data) {
    var info = resolveInteraction(data);
    if (!info) return "";
    if (info.kind === "level03_torch") {
      return torchUsed ? "故障喷枪 · 燃料耗尽" : "故障喷枪 · 按 Q 启动（仅一次）";
    }
    if (info.kind === "level03_report") {
      return readReports[info.id] ? "已读装修记录" : "装修记录 · 按 Q 阅读";
    }
    return "";
  }

  function interact(data, callbacks) {
    if (disposed) return false;
    var info = resolveInteraction(data);
    if (!info) return false;
    callbacks = callbacks || {};
    if (info.kind === "level03_torch") {
      if (torchUsed) {
        if (typeof callbacks.showToast === "function") callbacks.showToast("喷枪燃料已经耗尽", 1800);
        return true;
      }
      torchUsed = true;
      torchTime = 18;
      stats.torchUsed = true;
      torchMaterial.emissiveIntensity = 1.4;
      if (typeof callbacks.showToast === "function") {
        callbacks.showToast("故障喷枪点燃了；这点热量只能短暂延命", 3600);
      }
      return true;
    }
    if (info.kind !== "level03_report") return false;
    if (!readReports[info.id]) {
      readReports[info.id] = true;
      stats.reportsRead += 1;
    }
    if (typeof callbacks.showToast === "function") callbacks.showToast(info.text, info.final ? 6200 : 4400);
    if (info.final && !finalReportRecovered) {
      finalReportRecovered = true;
      stats.finalReportRecovered = true;
      if (typeof callbacks.onReportRecovered === "function") {
        callbacks.onReportRecovered({
          level: "0.3",
          id: "level03-final-reconstruction-report",
          text: info.text,
        });
      }
    }
    return true;
  }

  function isPlayerClear(player, x, z) {
    if (!player) return true;
    var px = Number.isFinite(player.x) ? player.x : 0;
    var pz = Number.isFinite(player.z) ? player.z : 0;
    return Math.hypot(px - x, pz - z) > gridSize * 1.2;
  }

  function scheduleVentMove(player) {
    var index = Math.floor(elapsed / 7) % ventStates.length;
    var target = ventSlots[(index + 1 + Math.floor(elapsed / 13)) % ventSlots.length];
    var state = ventStates[index];
    if (
      state.moving ||
      !isPlayerClear(player, state.x, state.z) ||
      !isPlayerClear(player, target[0], target[1])
    ) {
      return;
    }
    state.fromX = state.x;
    state.fromZ = state.z;
    state.targetX = target[0];
    state.targetZ = target[1];
    state.progress = 0;
    state.moving = true;
    stats.ventMoves += 1;
  }

  function updateVents(dt) {
    var changed = false;
    for (var index = 0; index < ventStates.length; index++) {
      var state = ventStates[index];
      if (state.moving) {
        state.progress = Math.min(1, state.progress + dt * 0.38);
        var smooth = state.progress * state.progress * (3 - 2 * state.progress);
        state.x = THREE.MathUtils.lerp(state.fromX, state.targetX, smooth);
        state.z = THREE.MathUtils.lerp(state.fromZ, state.targetZ, smooth);
        if (state.progress >= 1) state.moving = false;
        changed = true;
      }
      setInstance(
        vents,
        index,
        state.x,
        wallH - 0.09,
        state.z,
        gridSize * 0.75,
        1,
        1,
        index % 2 ? Math.PI * 0.5 : 0
      );
    }
    if (changed) vents.instanceMatrix.needsUpdate = true;
  }

  function emitColdDamage(amount, callbacks) {
    if (!(amount > 0)) return;
    if (typeof callbacks.onDamage === "function") {
      callbacks.onDamage(amount, { source: "level03_cold", exposure: coldExposure });
    } else if (typeof callbacks.damagePlayer === "function") {
      callbacks.damagePlayer(amount, "level03_cold");
    }
  }

  function update(dt, player, callbacks) {
    if (disposed) return getStats();
    callbacks = callbacks || {};
    dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    elapsed += dt;
    ventTimer += dt;
    warningCooldown = Math.max(0, warningCooldown - dt);

    if (ventTimer >= 7) {
      ventTimer -= 7;
      scheduleVentMove(player);
    }
    updateVents(dt);

    if (torchTime > 0) {
      torchTime = Math.max(0, torchTime - dt);
      coldExposure = Math.max(0, coldExposure - dt * 0.075);
      torchLight.intensity = 1.5 + Math.sin(elapsed * 17) * 0.3;
      torchMaterial.emissiveIntensity = 1 + Math.sin(elapsed * 11) * 0.25;
      if (torchTime === 0) {
        torchLight.intensity = 0;
        torchMaterial.emissiveIntensity = 0.1;
        if (typeof callbacks.showToast === "function") callbacks.showToast("喷枪熄灭了，寒冷重新逼近", 2800);
      }
    } else {
      coldExposure = Math.min(1, coldExposure + dt * 0.018);
    }

    if (coldExposure > 0.55) {
      coldDamageBuffer +=
        dt * LEVEL03_COLD_HP_PER_SEC * ((coldExposure - 0.55) / 0.45);
      if (coldDamageBuffer >= 0.5) {
        emitColdDamage(coldDamageBuffer, callbacks);
        coldDamageBuffer = 0;
      }
      if (warningCooldown <= 0 && typeof callbacks.showToast === "function") {
        callbacks.showToast(
          coldExposure > 0.86 ? "四肢正在失去知觉" : "严寒正在持续消耗生命",
          1900
        );
        warningCooldown = 8;
      }
    }

    for (var lightIndex = 0; lightIndex < lights.length; lightIndex++) {
      var flicker =
        0.76 +
        Math.sin(elapsed * (5.1 + lightIndex * 0.27) + lights[lightIndex].userData.phase) *
          0.13;
      if ((Math.floor(elapsed * 9 + lightIndex * 7) % 47) === 0) flicker *= 0.2;
      lights[lightIndex].intensity = lights[lightIndex].userData.baseIntensity * flicker;
    }
    iceMaterial.opacity = 0.82 + Math.sin(elapsed * 0.7) * 0.04;
    stats.coldExposure = coldExposure;
    stats.torchSecondsRemaining = torchTime;
    stats.elapsed = elapsed;
    return getStats();
  }

  function getSurvivalEnv() {
    return {
      id: "level0.3",
      temperature: "extreme_cold",
      sealed: true,
      hasExit: false,
      coldHpPerSec: LEVEL03_COLD_HP_PER_SEC,
      heatSourceTemporary: true,
      fogColor: LEVEL03_FOG,
      fogNear: gridSize * 0.7,
      fogFar: gridSize * 4.8,
    };
  }

  function getColdExposure() {
    return coldExposure;
  }

  function drawFx(canvas, now) {
    if (disposed || !canvas || !canvas.getContext) return;
    if (fxCanvas !== canvas) {
      fxCanvas = canvas;
      fxContext = canvas.getContext("2d");
    }
    if (!fxContext) return;
    var width = canvas.width;
    var height = canvas.height;
    var time = (Number(now) || 0) * 0.001;
    fxContext.save();
    var edge = fxContext.createRadialGradient(
      width * 0.5,
      height * 0.52,
      Math.min(width, height) * 0.12,
      width * 0.5,
      height * 0.52,
      Math.max(width, height) * 0.7
    );
    edge.addColorStop(0, "rgba(150,210,230,0)");
    edge.addColorStop(0.62, "rgba(95,160,190," + (0.035 + coldExposure * 0.08) + ")");
    edge.addColorStop(1, "rgba(195,235,245," + (0.12 + coldExposure * 0.32) + ")");
    fxContext.fillStyle = edge;
    fxContext.fillRect(0, 0, width, height);
    var fogAlpha = 0.018 + coldExposure * 0.04;
    fxContext.fillStyle = "rgba(205,235,244," + fogAlpha + ")";
    for (var i = 0; i < 22; i++) {
      var x = (((i * 127 + time * 23) % 997) / 997) * width;
      var y = (((i * 71 + time * 11) % 991) / 991) * height;
      var radius = 8 + (i % 6) * 5;
      fxContext.beginPath();
      fxContext.arc(x, y, radius, 0, Math.PI * 2);
      fxContext.fill();
    }
    fxContext.restore();
  }

  function getStats() {
    return {
      reportsRead: stats.reportsRead,
      reportCount: stats.reportCount,
      finalReportRecovered: stats.finalReportRecovered,
      torchUsed: stats.torchUsed,
      torchSecondsRemaining: stats.torchSecondsRemaining,
      ventMoves: stats.ventMoves,
      coldExposure: stats.coldExposure,
      elapsed: stats.elapsed,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    for (var i = 0; i < geometries.length; i++) geometries[i].dispose();
    for (i = 0; i < materials.length; i++) disposeMaterial(materials[i]);
    colliders.length = 0;
    interactMeshes.length = 0;
    lights.length = 0;
    ventStates.length = 0;
    fxCanvas = null;
    fxContext = null;
  }

  return {
    group: group,
    colliders: colliders,
    interactMeshes: interactMeshes,
    spawn: spawn,
    half: half,
    update: update,
    getInteractionHint: getInteractionHint,
    interact: interact,
    getSurvivalEnv: getSurvivalEnv,
    getColdExposure: getColdExposure,
    drawFx: drawFx,
    getStats: getStats,
    dispose: dispose,
  };
}

/**
 * Backrooms Level 0.7 — 忆域
 *
 * 局部坐标约定：入口位于 +Z，路线向 -Z 延伸。模块不修改全局雾、
 * renderer 或相机；宿主只需转发 update / Q 交互 / drawFx。
 */
import * as THREE from "three";

export const LEVEL07_RECORD_COUNT = 7;

var ERA_DEFS = [
  { id: "early", name: "早期昏黄房间", near: 8, far: -18, color: 0xd1b45e },
  { id: "ornate", name: "旧式华饰柱廊", near: -18, far: -42, color: 0xb98243 },
  { id: "industrial", name: "工业混凝土", near: -42, far: -68, color: 0x91a2a0 },
  { id: "fortress", name: "洞穴石堡", near: -68, far: -94, color: 0x738187 },
  { id: "archive", name: "褪色 N.T.G. 档案区", near: -94, far: -128, color: 0x90a884 },
];

function wallCollider(minX, maxX, minZ, maxZ, extra) {
  var result = {
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    ghost: false,
  };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      result[key] = extra[key];
    });
  }
  return result;
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

function readPlayer(player, originX, originZ) {
  var source = player && player.player ? player.player : player;
  source = source || {};
  return {
    x: (Number.isFinite(source.x) ? source.x : originX) - originX,
    y: Number.isFinite(source.y)
      ? source.y
      : Number.isFinite(source.feetY)
        ? source.feetY
        : 0,
    z: (Number.isFinite(source.z) ? source.z : originZ + 4) - originZ,
    yaw: Number.isFinite(source.yaw)
      ? source.yaw
      : Number.isFinite(player && player.yaw)
        ? player.yaw
        : 0,
  };
}

function setInteract(object, data, interactMeshes) {
  object.userData.brInteract = data;
  interactMeshes.push(object);
  return object;
}

/**
 * 在 Level 0 主世界中建造“时间错位”入口。
 * trigger 是非碰撞入口区；穿过入口的墙体始终保留可通行开口。
 */
export function buildLevel07TimeDislocationEntry(
  parent,
  wx,
  wz,
  gridSize,
  wallH,
  colliders,
  interactMeshes
) {
  gridSize = Math.max(1.8, Number(gridSize) || 3);
  wallH = Math.max(2.6, Number(wallH) || 3.2);
  wx = Number(wx) || 0;
  wz = Number(wz) || 0;
  var group = new THREE.Group();
  group.name = "Level07TimeDislocationEntry";
  group.position.set(wx, 0, wz);

  var frameMat = new THREE.MeshStandardMaterial({
    color: 0x8c815e,
    roughness: 0.83,
    metalness: 0.12,
  });
  var echoMat = new THREE.MeshBasicMaterial({
    color: 0xd8c274,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  var darkMat = new THREE.MeshBasicMaterial({ color: 0x17150f });
  var ownedMaterials = [frameMat, echoMat, darkMat];
  var ownedGeometries = [];

  function box(w, h, d, x, y, z, mat) {
    var geometry = new THREE.BoxGeometry(w, h, d);
    ownedGeometries.push(geometry);
    var mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  var opening = Math.min(1.55, gridSize * 0.58);
  var half = gridSize * 0.5;
  box(gridSize, wallH, 0.08, 0, wallH * 0.5, -opening * 0.5 - 0.05, frameMat);
  box(gridSize, wallH, 0.08, 0, wallH * 0.5, opening * 0.5 + 0.05, frameMat);
  box(gridSize, 0.2, opening, 0, wallH - 0.1, 0, frameMat);
  box(gridSize * 0.9, wallH * 0.76, opening * 0.94, -0.08, wallH * 0.5, 0, darkMat);
  var echo = box(
    gridSize * 0.82,
    wallH * 0.68,
    opening * 0.03,
    -0.11,
    wallH * 0.52,
    0,
    echoMat
  );
  echo.name = "Level07MisalignedAfterimage";
  echo.userData.brInteract = {
    kind: "level07_entrance",
    text: "墙后的嗡鸣比眼前的灯早了几秒。按 Q 触碰时间错位。",
  };
  if (interactMeshes && interactMeshes.push) interactMeshes.push(echo);

  if (colliders && colliders.push) {
    colliders.push(
      wallCollider(wx - half, wx + half, wz - half, wz - opening * 0.5, {
        level07Entrance: true,
      }),
      wallCollider(wx - half, wx + half, wz + opening * 0.5, wz + half, {
        level07Entrance: true,
      })
    );
  }
  var trigger = {
    kind: "level07_entrance",
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - opening * 0.45,
    maxZ: wz + opening * 0.45,
  };
  group.userData.level07Trigger = trigger;
  if (parent && parent.add) parent.add(group);

  var disposed = false;
  group.update = function updateEntry(timeSeconds) {
    if (disposed) return;
    var t = Number(timeSeconds) || 0;
    echo.position.x = -0.11 + Math.sin(t * 1.7) * 0.035;
    echoMat.opacity = 0.1 + (Math.sin(t * 2.3) + 1) * 0.045;
  };
  group.dispose = function disposeEntry() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    ownedGeometries.forEach(function (geometry) {
      geometry.dispose();
    });
    ownedMaterials.forEach(function (material) {
      material.dispose();
    });
    group.clear();
  };
  return group;
}

/* 简短别名，便于主世界 POI 生成器按关卡号接入。 */
export const buildLevel07Entry = buildLevel07TimeDislocationEntry;

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {object} [opts]
 * @param {number} [opts.x=0]
 * @param {number} [opts.z=0]
 * @param {number} [opts.wallHeight=3.4]
 * @param {function} [opts.onAllRecords]
 * @param {AudioContext} [opts.audioContext]
 */
export function buildLevel07World(scene, opts) {
  opts = opts || {};
  var originX = Number.isFinite(opts.x) ? opts.x : 0;
  var originZ = Number.isFinite(opts.z) ? opts.z : 0;
  var wallH = Math.max(2.8, Number(opts.wallHeight) || 3.4);
  var disposed = false;
  var elapsed = 0;
  var colliders = [];
  var interactMeshes = [];
  var recordsFound = Object.create(null);
  var recordsCount = 0;
  var allRecordsNotified = false;
  var exitRequest = null;
  var exitArmed = false;
  var activeEra = 0;
  var deepestEra = 0;
  var rewriteCount = 0;
  var threatEncounters = 0;
  var damageTaken = 0;
  var roarCount = 0;
  var lastPlayer = { x: 0, y: 0, z: 4, yaw: Math.PI };

  var group = new THREE.Group();
  group.name = "BackroomsLevel07MemoryDomain";
  group.position.set(originX, 0, originZ);
  if (scene && scene.add) scene.add(group);

  var mats = {
    earlyWall: new THREE.MeshStandardMaterial({
      color: 0xb59e55,
      roughness: 0.92,
      emissive: 0x3a2c0b,
      emissiveIntensity: 0.12,
    }),
    earlyFloor: new THREE.MeshStandardMaterial({ color: 0x756736, roughness: 0.95 }),
    ornateWall: new THREE.MeshStandardMaterial({ color: 0x755032, roughness: 0.78 }),
    ornateGold: new THREE.MeshStandardMaterial({
      color: 0x9d7440,
      roughness: 0.48,
      metalness: 0.35,
    }),
    ornateFloor: new THREE.MeshStandardMaterial({ color: 0x49352b, roughness: 0.75 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x6f7471, roughness: 0.98 }),
    concreteDark: new THREE.MeshStandardMaterial({
      color: 0x3e4443,
      roughness: 0.86,
      metalness: 0.18,
    }),
    rock: new THREE.MeshStandardMaterial({ color: 0x343b3a, roughness: 1 }),
    mortar: new THREE.MeshStandardMaterial({ color: 0x55564f, roughness: 0.96 }),
    archive: new THREE.MeshStandardMaterial({ color: 0x69715c, roughness: 0.9 }),
    archiveDark: new THREE.MeshStandardMaterial({
      color: 0x2d3931,
      roughness: 0.78,
      metalness: 0.2,
    }),
    light: new THREE.MeshStandardMaterial({
      color: 0xffe9a3,
      emissive: 0xffc84d,
      emissiveIntensity: 1.25,
      roughness: 0.3,
    }),
    coldLight: new THREE.MeshStandardMaterial({
      color: 0xc8e0d0,
      emissive: 0x83ad91,
      emissiveIntensity: 1.1,
    }),
    paper: new THREE.MeshStandardMaterial({ color: 0xb9b18d, roughness: 0.96 }),
    terminal: new THREE.MeshStandardMaterial({
      color: 0x202824,
      roughness: 0.55,
      metalness: 0.35,
    }),
    screen: new THREE.MeshStandardMaterial({
      color: 0x7da477,
      emissive: 0x4f9458,
      emissiveIntensity: 1.2,
    }),
    floppy: new THREE.MeshStandardMaterial({ color: 0x252b2a, roughness: 0.7 }),
    growler: new THREE.MeshStandardMaterial({ color: 0x171816, roughness: 1 }),
    growlerEye: new THREE.MeshStandardMaterial({
      color: 0xe7c664,
      emissive: 0xb98224,
      emissiveIntensity: 1.6,
    }),
  };

  function addBox(parent, w, h, d, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addCylinder(parent, rt, rb, h, x, y, z, mat, segments) {
    var mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, segments || 10),
      mat
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  var widthByEra = [7.2, 8.4, 7.6, 6.8, 8.8];
  var eraGroups = [];
  var eraLights = [];
  var rewriteVariants = [];

  ERA_DEFS.forEach(function (era, index) {
    var eraGroup = new THREE.Group();
    eraGroup.name = "Level07Era_" + era.id;
    group.add(eraGroup);
    eraGroups.push(eraGroup);
    var width = widthByEra[index];
    var length = era.near - era.far;
    var centerZ = (era.near + era.far) * 0.5;
    var wallMat =
      index === 0
        ? mats.earlyWall
        : index === 1
          ? mats.ornateWall
          : index === 2
            ? mats.concrete
            : index === 3
              ? mats.rock
              : mats.archive;
    var floorMat =
      index === 0
        ? mats.earlyFloor
        : index === 1
          ? mats.ornateFloor
          : index === 2
            ? mats.concreteDark
            : index === 3
              ? mats.mortar
              : mats.archiveDark;
    addBox(eraGroup, width, 0.18, length, 0, -0.09, centerZ, floorMat);
    addBox(eraGroup, width, 0.16, length, 0, wallH + 0.08, centerZ, wallMat);
    addBox(eraGroup, 0.22, wallH, length, -width * 0.5, wallH * 0.5, centerZ, wallMat);
    addBox(eraGroup, 0.22, wallH, length, width * 0.5, wallH * 0.5, centerZ, wallMat);

    colliders.push(
      wallCollider(
        originX - width * 0.5 - 0.15,
        originX - width * 0.5 + 0.15,
        originZ + era.far,
        originZ + era.near,
        { level07Era: era.id }
      ),
      wallCollider(
        originX + width * 0.5 - 0.15,
        originX + width * 0.5 + 0.15,
        originZ + era.far,
        originZ + era.near,
        { level07Era: era.id }
      )
    );

    var light = new THREE.PointLight(era.color, 0, index === 4 ? 18 : 15, 1.7);
    light.position.set(0, wallH - 0.45, centerZ);
    eraGroup.add(light);
    eraLights.push(light);
    for (var lz = era.near - 5; lz > era.far + 2; lz -= 8) {
      addBox(
        eraGroup,
        index === 2 ? 2.2 : 1.15,
        0.06,
        0.22,
        0,
        wallH - 0.16,
        lz,
        index >= 4 ? mats.coldLight : mats.light
      );
    }

    var variant = new THREE.Group();
    variant.name = "Level07Rewrite_" + era.id;
    variant.visible = false;
    eraGroup.add(variant);
    rewriteVariants.push(variant);
    for (var vi = 0; vi < 4; vi++) {
      var side = vi % 2 ? 1 : -1;
      addBox(
        variant,
        0.08,
        0.7 + vi * 0.12,
        1.1,
        side * (width * 0.5 - 0.18),
        1.15 + (vi % 2) * 0.4,
        era.near - 4 - vi * 4.2,
        index < 2 ? mats.ornateGold : index === 4 ? mats.paper : mats.mortar
      ).rotation.z = (side * Math.PI) / 16;
    }
  });

  /* 相邻时代宽度变化处用斜墙搭接，不产生横向封口。 */
  for (var bi = 0; bi < ERA_DEFS.length - 1; bi++) {
    var bz = ERA_DEFS[bi].far;
    var oldHalf = widthByEra[bi] * 0.5;
    var newHalf = widthByEra[bi + 1] * 0.5;
    var joinLength = 2.2;
    [-1, 1].forEach(function (side) {
      var x1 = side * oldHalf;
      var x2 = side * newHalf;
      var dx = x2 - x1;
      var join = addBox(
        group,
        0.2,
        wallH,
        Math.sqrt(joinLength * joinLength + dx * dx),
        (x1 + x2) * 0.5,
        wallH * 0.5,
        bz,
        bi < 1 ? mats.ornateWall : bi < 3 ? mats.concrete : mats.archive
      );
      join.rotation.y = Math.atan2(dx, joinLength);
    });
  }

  /* 时代辨识性装饰。 */
  for (var oz = -23; oz > -40; oz -= 6) {
    addCylinder(group, 0.35, 0.48, wallH - 0.2, -3.35, wallH * 0.5, oz, mats.ornateGold, 12);
    addCylinder(group, 0.35, 0.48, wallH - 0.2, 3.35, wallH * 0.5, oz, mats.ornateGold, 12);
  }
  for (var iz = -46; iz > -67; iz -= 7) {
    addBox(group, 7.1, 0.16, 0.18, 0, wallH - 0.35, iz, mats.concreteDark);
    addCylinder(group, 0.1, 0.1, 7, -2.7, wallH - 0.65, iz, mats.concreteDark, 8).rotation.z =
      Math.PI * 0.5;
  }
  for (var rz = -72; rz > -93; rz -= 4.5) {
    var rock = addBox(
      group,
      0.65 + ((-rz * 13) % 5) * 0.14,
      0.7 + ((-rz * 7) % 4) * 0.18,
      0.7,
      rz % 2 > -1 ? -2.7 : 2.7,
      0.35,
      rz,
      mats.rock
    );
    rock.rotation.y = rz * 0.13;
  }
  for (var az = -99; az > -126; az -= 5.2) {
    addBox(group, 1.15, 2.4, 0.42, -3.65, 1.2, az, mats.archiveDark);
    addBox(group, 1.15, 2.4, 0.42, 3.65, 1.2, az, mats.archiveDark);
  }

  var recordDefs = [
    {
      id: "tag-1988",
      kind: "tag",
      x: -2.7,
      z: -13,
      title: "年代标签：1988？",
      text: "标签的油墨尚未干：1988 / Level 0 初次库存。背面却盖着 N.T.G. 尚未采用的徽记。",
    },
    {
      id: "tag-1912",
      kind: "tag",
      x: 3.15,
      z: -34,
      title: "年代标签：1912",
      text: "黄铜牌写着“1912 年移交”。柱廊比任何已知的后室测绘记录都更早。",
    },
    {
      id: "terminal-shift",
      kind: "terminal",
      x: -2.6,
      z: -57,
      title: "旧终端：错时货单",
      text: "新贸易者集团货单：同一批货物在 03:14 入库，又在前一天 22:06 被领走。备注：时间泡泡内禁止追讨差额。",
    },
    {
      id: "tag-fort",
      kind: "tag",
      x: 2.45,
      z: -78,
      title: "石堡刻记",
      text: "石灰下压着 N.T.G. 铅笔字：“不是遗迹，是泡泡把后来之物磨旧了。”",
    },
    {
      id: "floppy-route",
      kind: "floppy",
      x: -2.25,
      z: -101,
      title: "N.T.G. 软盘：路线 0.7-A",
      text: "软盘恢复：忆域不会稳定补充物资。每一次补给记录都来自不同年代的同一只空箱。",
    },
    {
      id: "terminal-bubble",
      kind: "terminal",
      x: 2.65,
      z: -111,
      title: "旧终端：时间泡泡",
      text: "N.T.G. 调查结论：走廊由相互嵌套的时间泡泡构成。观察者回头时，未被注视的历史会选择另一个版本。",
    },
    {
      id: "floppy-exit",
      kind: "floppy",
      x: 0.8,
      z: -123,
      title: "N.T.G. 软盘：撤离令",
      text: "新贸易者集团撤离令：深处出口全为重复档案。唯一可复现路线是原路折返时间错位入口。",
    },
  ];
  var recordVisuals = Object.create(null);

  function buildRecord(def) {
    var root = new THREE.Group();
    root.position.set(def.x, 0, def.z);
    root.name = "Level07Record_" + def.id;
    group.add(root);
    var pick;
    if (def.kind === "terminal") {
      addBox(root, 1.05, 0.85, 0.55, 0, 0.75, 0, mats.terminal);
      pick = addBox(root, 0.72, 0.42, 0.025, 0, 0.86, -0.29, mats.screen);
      addBox(root, 1.2, 0.12, 0.68, 0, 0.28, 0, mats.terminal);
    } else if (def.kind === "floppy") {
      pick = addBox(root, 0.42, 0.045, 0.42, 0, 0.78, 0, mats.floppy);
      addBox(root, 0.2, 0.008, 0.13, 0, 0.806, -0.05, mats.paper);
    } else {
      pick = addBox(root, 0.5, 0.32, 0.035, 0, 1.35, 0, mats.paper);
    }
    var data = {
      kind: "level07_record",
      recordId: def.id,
      recordKind: def.kind,
      title: def.title,
      text: def.text,
    };
    setInteract(pick, data, interactMeshes);
    recordVisuals[def.id] = root;
  }
  recordDefs.forEach(buildRecord);

  /* 唯一出口位于玩家的进入位置，深端没有出口或物资生成器。 */
  var entranceArch = new THREE.Group();
  entranceArch.position.z = 5.4;
  group.add(entranceArch);
  addBox(entranceArch, 0.28, wallH, 0.35, -1.25, wallH * 0.5, 0, mats.earlyWall);
  addBox(entranceArch, 0.28, wallH, 0.35, 1.25, wallH * 0.5, 0, mats.earlyWall);
  addBox(entranceArch, 2.78, 0.24, 0.35, 0, wallH - 0.12, 0, mats.earlyWall);
  var exitShimmer = addBox(
    entranceArch,
    2.25,
    wallH - 0.5,
    0.025,
    0,
    wallH * 0.5,
    0.05,
    mats.light
  );
  exitShimmer.material = mats.light;
  var exitTrigger = { minX: -1.3, maxX: 1.3, minZ: 4.75, maxZ: 6.15 };

  function makeGrowler(id, x, z) {
    var root = new THREE.Group();
    root.name = "Level07Growler_" + id;
    root.position.set(x, 0, z);
    group.add(root);
    addCylinder(root, 0.38, 0.48, 1.25, 0, 0.78, 0, mats.growler, 9);
    var head = addBox(root, 0.72, 0.5, 0.62, 0, 1.48, -0.12, mats.growler);
    head.rotation.x = -0.12;
    addBox(root, 0.09, 0.075, 0.04, -0.2, 1.57, -0.45, mats.growlerEye);
    addBox(root, 0.09, 0.075, 0.04, 0.2, 1.57, -0.45, mats.growlerEye);
    [-0.28, 0.28].forEach(function (lx) {
      addCylinder(root, 0.095, 0.12, 1, lx, 0.42, 0, mats.growler, 7);
    });
    root.visible = false;
    return {
      id: id,
      root: root,
      homeX: x,
      homeZ: z,
      state: "dormant",
      chaseLeft: 0,
      roarCooldown: 0,
      damageCooldown: 0,
      seen: false,
    };
  }
  var growlers = [makeGrowler("g1", -1.8, -88), makeGrowler("g2", 2.1, -117)];

  var audio = {
    context: null,
    ownsContext: false,
    master: null,
    eraGains: [],
    sources: [],
    oneShots: [],
    started: false,
  };

  function startAudio() {
    if (disposed || opts.audio === false) return;
    if (audio.started) {
      if (audio.context && audio.context.state === "suspended" && audio.context.resume) {
        audio.context.resume().catch(function () {});
      }
      return;
    }
    var AudioCtor =
      typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    var context = opts.audioContext || (AudioCtor ? new AudioCtor() : null);
    if (!context) return;
    audio.context = context;
    audio.ownsContext = !opts.audioContext;
    audio.master = context.createGain();
    audio.master.gain.value = 0.09;
    audio.master.connect(context.destination);
    ERA_DEFS.forEach(function (_era, index) {
      var gain = context.createGain();
      gain.gain.value = index === 0 ? 1 : 0;
      gain.connect(audio.master);
      var oscillator = context.createOscillator();
      oscillator.type = index === 2 ? "square" : index === 3 ? "sine" : "triangle";
      oscillator.frequency.value = [58, 73, 46, 38, 64][index];
      var toneGain = context.createGain();
      toneGain.gain.value = [0.08, 0.065, 0.045, 0.09, 0.055][index];
      oscillator.connect(toneGain);
      toneGain.connect(gain);
      oscillator.start();
      audio.eraGains.push(gain);
      audio.sources.push(oscillator);
    });
    audio.started = true;
    if (context.state === "suspended" && context.resume) context.resume().catch(function () {});
  }

  function playRoar(callbacks, growler) {
    roarCount += 1;
    if (callbacks && typeof callbacks.onGrowlerRoar === "function") {
      callbacks.onGrowlerRoar({ id: growler.id, x: growler.root.position.x + originX, z: growler.root.position.z + originZ });
    }
    startAudio();
    if (!audio.context || !audio.master) return;
    var context = audio.context;
    var osc = context.createOscillator();
    var gain = context.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(92, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(34, context.currentTime + 0.48);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.55, context.currentTime + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    osc.stop(context.currentTime + 0.62);
    audio.oneShots.push({ source: osc, gain: gain });
    osc.onended = function () {
      osc.disconnect();
      gain.disconnect();
      audio.oneShots = audio.oneShots.filter(function (shot) {
        return shot.source !== osc;
      });
    };
  }

  function eraAt(z) {
    for (var i = 0; i < ERA_DEFS.length; i++) {
      if (z <= ERA_DEFS[i].near && z > ERA_DEFS[i].far) return i;
    }
    return z <= ERA_DEFS[ERA_DEFS.length - 1].far ? ERA_DEFS.length - 1 : 0;
  }

  function rewritePassedEra(nextEra) {
    if (nextEra <= deepestEra) return;
    for (var i = deepestEra; i < nextEra; i++) {
      if (!rewriteVariants[i].visible) {
        rewriteVariants[i].visible = true;
        rewriteVariants[i].rotation.y = (i % 2 ? -1 : 1) * 0.018;
        rewriteCount += 1;
      }
    }
    deepestEra = nextEra;
  }

  function updateGrowler(growler, dt, player, callbacks) {
    growler.roarCooldown = Math.max(0, growler.roarCooldown - dt);
    growler.damageCooldown = Math.max(0, growler.damageCooldown - dt);
    var root = growler.root;
    var dx = player.x - root.position.x;
    var dz = player.z - root.position.z;
    var distance = Math.sqrt(dx * dx + dz * dz);
    var inDeep = player.z < -68;

    if (!inDeep) {
      growler.state = "retreat";
      growler.chaseLeft = 0;
    } else if (growler.state === "dormant" && distance < 14) {
      root.visible = true;
      growler.state = "watch";
    }

    if (growler.state === "watch") {
      root.lookAt(player.x, 1, player.z);
      if (distance < 9.5 && growler.roarCooldown <= 0) {
        growler.state = "chase";
        growler.chaseLeft = 3.1 + (growler.id === "g2" ? 0.6 : 0);
        growler.roarCooldown = 8;
        threatEncounters += 1;
        playRoar(callbacks, growler);
      }
    } else if (growler.state === "chase") {
      growler.chaseLeft -= dt;
      var speed = 2.25;
      if (distance > 0.001) {
        root.position.x += (dx / distance) * speed * dt;
        root.position.z += (dz / distance) * speed * dt;
      }
      root.lookAt(player.x, 1, player.z);
      root.position.y = Math.abs(Math.sin(elapsed * 8.5)) * 0.06;
      if (distance < 1.05 && growler.damageCooldown <= 0) {
        var damage = 14;
        growler.damageCooldown = 1.25;
        damageTaken += damage;
        if (callbacks && typeof callbacks.onDamage === "function") {
          callbacks.onDamage(damage, {
            kind: "level07_growler",
            sourceId: growler.id,
            message: "Growler 的短程扑击撕伤了你。",
          });
        }
      }
      if (growler.chaseLeft <= 0 || distance > 16) growler.state = "retreat";
    }

    if (growler.state === "retreat") {
      var homeDx = growler.homeX - root.position.x;
      var homeDz = growler.homeZ - root.position.z;
      var homeDistance = Math.sqrt(homeDx * homeDx + homeDz * homeDz);
      if (homeDistance > 0.12) {
        root.position.x += (homeDx / homeDistance) * 3 * dt;
        root.position.z += (homeDz / homeDistance) * 3 * dt;
      } else {
        root.position.set(growler.homeX, 0, growler.homeZ);
        growler.state = inDeep ? "watch" : "dormant";
        root.visible = inDeep;
      }
    }
  }

  function update(dt, player, callbacks) {
    if (disposed) return;
    callbacks = callbacks || {};
    startAudio();
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    elapsed += delta;
    var pos = readPlayer(player, originX, originZ);
    lastPlayer = pos;
    if (pos.z < 1.5) exitArmed = true;
    var nextEra = eraAt(pos.z);
    if (nextEra > deepestEra) rewritePassedEra(nextEra);
    activeEra = nextEra;

    for (var i = 0; i < eraLights.length; i++) {
      var targetIntensity = i === activeEra ? (i === 3 ? 1.05 : 1.35) : 0.15;
      eraLights[i].intensity +=
        (targetIntensity - eraLights[i].intensity) * Math.min(1, delta * 3.4);
      if (audio.eraGains[i] && audio.context) {
        audio.eraGains[i].gain.setTargetAtTime(
          i === activeEra ? 1 : 0.001,
          audio.context.currentTime,
          0.22
        );
      }
    }
    mats.light.emissiveIntensity = 1.12 + Math.sin(elapsed * 4.1) * 0.13;
    mats.coldLight.emissiveIntensity = 0.9 + Math.sin(elapsed * 2.3) * 0.18;
    exitShimmer.scale.x = 0.98 + Math.sin(elapsed * 1.7) * 0.015;

    growlers.forEach(function (growler) {
      updateGrowler(growler, delta, pos, callbacks);
    });

    if (
      exitArmed &&
      pos.x >= exitTrigger.minX &&
      pos.x <= exitTrigger.maxX &&
      pos.z >= exitTrigger.minZ &&
      pos.z <= exitTrigger.maxZ
    ) {
      exitRequest = { destination: "level0" };
    }
  }

  function drawFx(canvas, now) {
    if (disposed || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    var t = (Number(now) || 0) * 0.001;
    var eraColor = [
      "126,99,34",
      "104,62,35",
      "67,77,75",
      "38,50,51",
      "59,78,63",
    ][activeEra];
    var edge = ctx.createRadialGradient(
      width * 0.5,
      height * 0.52,
      Math.min(width, height) * 0.18,
      width * 0.5,
      height * 0.52,
      Math.max(width, height) * 0.72
    );
    edge.addColorStop(0, "rgba(" + eraColor + ",0)");
    edge.addColorStop(1, "rgba(" + eraColor + "," + (0.16 + activeEra * 0.025) + ")");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);
    if (activeEra > 0) {
      ctx.fillStyle = "rgba(230,224,190,0.035)";
      for (var i = 0; i < 18; i++) {
        var y = ((i * 71 + t * (11 + activeEra * 3)) % height + height) % height;
        ctx.fillRect(0, y, width, i % 5 === 0 ? 2 : 1);
      }
    }
  }

  function getSurvivalEnv() {
    return {
      skipPassiveSanity: false,
      sanityDrainPerSec: activeEra < 3 ? 0 : activeEra === 3 ? 0.12 : 0.22,
      areaId: ERA_DEFS[activeEra].id,
      areaName: ERA_DEFS[activeEra].name,
      hasStableSupplies: false,
      threatLevel: activeEra < 3 ? 0 : activeEra === 3 ? 1 : 2,
    };
  }

  function getInteractionHint(target) {
    var data = resolveInteractData(target);
    if (!data) return "";
    if (data.kind === "level07_entrance") return "时间错位 · 按 Q 进入忆域";
    if (data.kind !== "level07_record" || recordsFound[data.recordId]) return "";
    var label =
      data.recordKind === "floppy"
        ? "N.T.G. 软盘"
        : data.recordKind === "terminal"
          ? "旧终端"
          : "年代标签";
    return label + " · 按 Q 调查";
  }

  function interact(target, callbacks) {
    if (disposed) return false;
    var data = resolveInteractData(target);
    if (!data) return false;
    callbacks = callbacks || {};
    startAudio();
    if (data.kind === "level07_entrance") {
      if (typeof callbacks.onEnter === "function") callbacks.onEnter(data);
      return true;
    }
    if (data.kind !== "level07_record") return false;
    if (recordsFound[data.recordId]) {
      if (typeof callbacks.showToast === "function") {
        callbacks.showToast("这份记录已经归档。");
      }
      return true;
    }
    recordsFound[data.recordId] = true;
    recordsCount += 1;
    var visual = recordVisuals[data.recordId];
    if (visual) {
      visual.traverse(function (object) {
        if (object.material && object.material.emissiveIntensity != null) {
          object.userData.level07Read = true;
        }
      });
    }
    if (typeof callbacks.showText === "function") {
      callbacks.showText(data.title, data.text);
    } else if (typeof callbacks.showToast === "function") {
      callbacks.showToast(data.title + "：" + data.text, 7000);
    }
    if (typeof callbacks.onRecord === "function") {
      callbacks.onRecord({
        id: data.recordId,
        title: data.title,
        text: data.text,
        recordsFound: recordsCount,
        totalRecords: LEVEL07_RECORD_COUNT,
      });
    }
    if (recordsCount === LEVEL07_RECORD_COUNT && !allRecordsNotified) {
      allRecordsNotified = true;
      var allCallback =
        typeof callbacks.onAllRecords === "function"
          ? callbacks.onAllRecords
          : typeof opts.onAllRecords === "function"
            ? opts.onAllRecords
            : null;
      if (allCallback) allCallback(getStats());
    }
    return true;
  }

  function getExitRequest() {
    return exitRequest ? { destination: "level0" } : null;
  }

  function getStats() {
    return {
      recordsFound: recordsCount,
      totalRecords: LEVEL07_RECORD_COUNT,
      allRecordsFound: recordsCount === LEVEL07_RECORD_COUNT,
      foundRecordIds: Object.keys(recordsFound),
      deepestEra: ERA_DEFS[deepestEra].id,
      currentEra: ERA_DEFS[activeEra].id,
      rewritesObserved: rewriteCount,
      threatEncounters: threatEncounters,
      roarCount: roarCount,
      damageTaken: damageTaken,
      exitArmed: exitArmed,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (audio.sources.length) {
      audio.sources.forEach(function (source) {
        try {
          source.stop();
        } catch (_err) {
          /* source 已自然停止 */
        }
        try {
          source.disconnect();
        } catch (_err2) {
          /* ignore */
        }
      });
    }
    audio.eraGains.forEach(function (gain) {
      try {
        gain.disconnect();
      } catch (_err) {
        /* ignore */
      }
    });
    audio.oneShots.forEach(function (shot) {
      try {
        shot.source.onended = null;
        shot.source.stop();
      } catch (_err) {
        /* source 已停止 */
      }
      try {
        shot.source.disconnect();
        shot.gain.disconnect();
      } catch (_err2) {
        /* ignore */
      }
    });
    if (audio.master) {
      try {
        audio.master.disconnect();
      } catch (_err) {
        /* ignore */
      }
    }
    if (audio.ownsContext && audio.context && audio.context.close) {
      audio.context.close().catch(function () {});
    }
    audio.sources.length = 0;
    audio.eraGains.length = 0;
    audio.oneShots.length = 0;
    audio.context = null;
    audio.master = null;

    if (group.parent) group.parent.remove(group);
    var geometries = new Set();
    var materials = new Set();
    var textures = new Set();
    group.traverse(function (object) {
      if (object.geometry) geometries.add(object.geometry);
      var objectMats = object.material
        ? Array.isArray(object.material)
          ? object.material
          : [object.material]
        : [];
      objectMats.forEach(function (material) {
        if (!material) return;
        materials.add(material);
        Object.keys(material).forEach(function (key) {
          if (material[key] && material[key].isTexture) textures.add(material[key]);
        });
      });
    });
    textures.forEach(function (texture) {
      texture.dispose();
    });
    materials.forEach(function (material) {
      material.dispose();
    });
    geometries.forEach(function (geometry) {
      geometry.dispose();
    });
    group.clear();
    colliders.length = 0;
    interactMeshes.length = 0;
    growlers.length = 0;
    exitRequest = null;
  }

  return {
    group: group,
    colliders: colliders,
    interactMeshes: interactMeshes,
    spawn: { x: originX, y: 0, z: originZ + 3.8, yaw: Math.PI },
    update: update,
    drawFx: drawFx,
    getSurvivalEnv: getSurvivalEnv,
    getInteractionHint: getInteractionHint,
    interact: interact,
    getExitRequest: getExitRequest,
    getStats: getStats,
    dispose: dispose,
  };
}

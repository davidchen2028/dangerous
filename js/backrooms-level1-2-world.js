/**
 * Backrooms Level 1.2 — “砼苑”
 *
 * 自包含的 68×100 米可玩迷宫。局部坐标 +Z 为入口，向 -Z 深入废弃聚落。
 * 本模块不直接修改宿主状态；伤害、植物化与提示均通过 callbacks 抛出。
 */
import * as THREE from 'three';

var COLS = 17;
var ROWS = 25;
var CELL = 4;
var WALL_H = 4.15;
var ENTRANCE_COL = 8;
var ENTRANCE_ROW = ROWS - 1;

function seededRandom(seed) {
  var state = (seed >>> 0) || 0x6d2b79f5;
  return function random() {
    state += 0x6d2b79f5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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
    z: (Number.isFinite(source.z) ? source.z : originZ) - originZ,
  };
}

function makeMaze(random) {
  var cells = [];
  var visited = [];
  var row;
  var col;
  for (row = 0; row < ROWS; row++) {
    cells[row] = [];
    visited[row] = [];
    for (col = 0; col < COLS; col++) {
      cells[row][col] = { n: true, e: true, s: true, w: true };
      visited[row][col] = false;
    }
  }

  var stack = [{ row: ENTRANCE_ROW, col: ENTRANCE_COL }];
  visited[ENTRANCE_ROW][ENTRANCE_COL] = true;
  var directions = [
    { dr: -1, dc: 0, here: 'n', there: 's' },
    { dr: 0, dc: 1, here: 'e', there: 'w' },
    { dr: 1, dc: 0, here: 's', there: 'n' },
    { dr: 0, dc: -1, here: 'w', there: 'e' },
  ];

  while (stack.length) {
    var current = stack[stack.length - 1];
    var choices = [];
    for (var i = 0; i < directions.length; i++) {
      var direction = directions[i];
      var nr = current.row + direction.dr;
      var nc = current.col + direction.dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {
        choices.push(direction);
      }
    }
    if (!choices.length) {
      stack.pop();
      continue;
    }
    var selected = choices[Math.floor(random() * choices.length)];
    var nextRow = current.row + selected.dr;
    var nextCol = current.col + selected.dc;
    cells[current.row][current.col][selected.here] = false;
    cells[nextRow][nextCol][selected.there] = false;
    visited[nextRow][nextCol] = true;
    stack.push({ row: nextRow, col: nextCol });
  }

  // 聚落中心形成一个被迷宫包围、但内部开阔的庭院。
  for (row = 2; row <= 5; row++) {
    for (col = 5; col <= 11; col++) {
      if (row > 2) {
        cells[row][col].n = false;
        cells[row - 1][col].s = false;
      }
      if (col > 5) {
        cells[row][col].w = false;
        cells[row][col - 1].e = false;
      }
    }
  }
  cells[ENTRANCE_ROW][ENTRANCE_COL].s = false;
  return cells;
}

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {object} [opts]
 * @returns {{group:THREE.Group,colliders:Array,interactMeshes:Array,spawn:object,update:Function,drawFx:Function,getSurvivalEnv:Function,getInteractionHint:Function,interact:Function,getExitRequest:Function,dispose:Function}}
 */
export function buildLevel1_2World(scene, opts) {
  opts = opts || {};
  var originX = Number.isFinite(opts.x) ? opts.x : 0;
  var originZ = Number.isFinite(opts.z) ? opts.z : 0;
  var random = seededRandom(Number.isFinite(opts.seed) ? opts.seed : 12012012);
  var group = new THREE.Group();
  group.name = 'BackroomsLevel1_2ConcreteGarden';
  group.position.set(originX, 0, originZ);
  if (scene && scene.add) scene.add(group);

  var colliders = [];
  var interactMeshes = [];
  var ownedGeometries = [];
  var ownedMaterials = [];
  var animatedFlowers = [];
  var investigated = Object.create(null);
  var disposed = false;
  var elapsed = 0;
  var exposure = 0;
  var mutationStage = 0;
  var damageClock = 0;
  var exitRequest = null;
  var latestCallbacks = {};
  var lastDepthBand = -1;
  var fxSeed = random() * 1000;

  var materials = {
    floor: new THREE.MeshStandardMaterial({ color: 0x354138, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x747a70, roughness: 0.96 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x777c73, roughness: 0.98 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x525950, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({
      color: 0x315f2c,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
    vine: new THREE.MeshStandardMaterial({ color: 0x244c25, roughness: 0.94 }),
    flower: new THREE.MeshStandardMaterial({
      color: 0xe5b84f,
      emissive: 0x342207,
      emissiveIntensity: 0.16,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    flowerBlue: new THREE.MeshStandardMaterial({
      color: 0x557fc8,
      emissive: 0x101b36,
      emissiveIntensity: 0.18,
      roughness: 0.82,
      side: THREE.DoubleSide,
    }),
    wood: new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xc7bea0,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    warning: new THREE.MeshStandardMaterial({
      color: 0x987c43,
      emissive: 0x47320b,
      emissiveIntensity: 0.45,
      roughness: 0.78,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xa7c7a2,
      transparent: true,
      opacity: 0.58,
      roughness: 0.2,
      metalness: 0.08,
    }),
  };
  Object.keys(materials).forEach(function rememberMaterial(key) {
    ownedMaterials.push(materials[key]);
  });

  function geometry(value) {
    ownedGeometries.push(value);
    return value;
  }

  var unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
  var grassBlade = geometry(new THREE.PlaneGeometry(0.12, 1.45, 1, 2));
  grassBlade.translate(0, 0.725, 0);
  var flowerHead = geometry(new THREE.CircleGeometry(0.16, 7));
  var vineSegment = geometry(new THREE.CylinderGeometry(0.025, 0.045, 1, 5));
  var sampleJarGeo = geometry(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10));

  function addBox(w, h, d, x, y, z, material, parent) {
    var mesh = new THREE.Mesh(unitBox, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }

  function addCollider(minX, maxX, minZ, maxZ, extra) {
    var item = {
      kind: 'wall',
      minX: minX + originX,
      maxX: maxX + originX,
      minZ: minZ + originZ,
      maxZ: maxZ + originZ,
      ghost: false,
    };
    if (extra) {
      Object.keys(extra).forEach(function copyColliderProperty(key) {
        item[key] = extra[key];
      });
    }
    colliders.push(item);
    return item;
  }

  function addWall(w, d, x, z) {
    addBox(w, WALL_H, d, x, WALL_H * 0.5, z, materials.concrete);
    addCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5);
  }

  function addInteraction(mesh, data) {
    mesh.userData.brInteract = data;
    interactMeshes.push(mesh);
    return mesh;
  }

  var width = COLS * CELL;
  var length = ROWS * CELL;
  addBox(width, 0.18, length, 0, -0.09, 0, materials.floor);
  addBox(width, 0.14, length, 0, WALL_H + 0.07, 0, materials.ceiling);

  var maze = makeMaze(random);
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var x = (col - (COLS - 1) * 0.5) * CELL;
      var z = (row - (ROWS - 1) * 0.5) * CELL;
      var cell = maze[row][col];
      if (cell.n) addWall(CELL + 0.18, 0.18, x, z - CELL * 0.5);
      if (cell.w) addWall(0.18, CELL + 0.18, x - CELL * 0.5, z);
      if (row === ROWS - 1 && cell.s) {
        addWall(CELL + 0.18, 0.18, x, z + CELL * 0.5);
      }
      if (col === COLS - 1 && cell.e) {
        addWall(0.18, CELL + 0.18, x + CELL * 0.5, z);
      }
    }
  }

  // 入口门洞两侧加厚，明确唯一出口方向。
  var south = length * 0.5;
  addWall(width * 0.5 - 1.15, 0.32, -width * 0.25 - 0.575, south);
  addWall(width * 0.5 - 1.15, 0.32, width * 0.25 + 0.575, south);
  // 告示牌固定在封闭的中央墙面上；离开必须调查告示牌，不能直接穿墙。
  addWall(2.3, 0.32, 0, south);
  var warning = addBox(1.55, 0.62, 0.08, 0, 2.35, south - 0.19, materials.warning);
  warning.name = 'ConcreteGardenReturnWarning';
  addInteraction(warning, { kind: 'level12_exit', destination: 'level1' });

  // 荧光灯为固定网格；没有任何普通实体生成逻辑。
  for (var lightRow = 1; lightRow < ROWS; lightRow += 4) {
    for (var lightCol = 1; lightCol < COLS; lightCol += 4) {
      var lx = (lightCol - (COLS - 1) * 0.5) * CELL;
      var lz = (lightRow - (ROWS - 1) * 0.5) * CELL;
      var lamp = addBox(1.55, 0.06, 0.18, lx, WALL_H - 0.1, lz, materials.warning);
      lamp.castShadow = false;
    }
  }
  var ambient = new THREE.HemisphereLight(0xc4d7a5, 0x253427, 0.72);
  group.add(ambient);
  var entryLight = new THREE.PointLight(0xe5d890, 0.8, 16, 1.8);
  entryLight.position.set(0, 3.25, south - 4);
  group.add(entryLight);
  var villageLight = new THREE.PointLight(0xa7c881, 0.65, 24, 1.7);
  villageLight.position.set(0, 3.2, -34);
  group.add(villageLight);

  // 大量植物使用实例化网格，以控制 draw call。
  var grassCount = 1450;
  var grass = new THREE.InstancedMesh(grassBlade, materials.grass, grassCount);
  grass.name = 'ConcreteGardenTallGrass';
  grass.castShadow = false;
  grass.receiveShadow = true;
  var dummy = new THREE.Object3D();
  for (var g = 0; g < grassCount; g++) {
    var gx = (random() - 0.5) * (width - 1.1);
    var gz = (random() - 0.5) * (length - 1.1);
    var depth = (south - gz) / length;
    var scale = 0.42 + random() * (0.48 + depth * 0.58);
    dummy.position.set(gx, 0, gz);
    dummy.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.12);
    dummy.scale.set(0.75 + random() * 0.65, scale, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(g, dummy.matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);

  function createFlowerPatch(x, z, count, blue) {
    var patch = new THREE.Group();
    patch.position.set(x, 0, z);
    patch.name = blue ? 'MemoryCornflowers' : 'MemorySunflowers';
    for (var i = 0; i < count; i++) {
      var stemHeight = 0.58 + random() * 0.72;
      var px = (random() - 0.5) * 2.7;
      var pz = (random() - 0.5) * 2.7;
      var stem = new THREE.Mesh(vineSegment, materials.vine);
      stem.scale.set(1, stemHeight, 1);
      stem.position.set(px, stemHeight * 0.5, pz);
      patch.add(stem);
      var head = new THREE.Mesh(flowerHead, blue ? materials.flowerBlue : materials.flower);
      head.position.set(px, stemHeight, pz);
      head.rotation.x = -Math.PI * 0.5;
      head.rotation.z = random() * Math.PI;
      patch.add(head);
      animatedFlowers.push({
        mesh: head,
        baseY: stemHeight,
        phase: random() * Math.PI * 2,
      });
    }
    group.add(patch);
    return patch;
  }

  var patchSpecs = [
    [-10, 35, 10, false],
    [13, 22, 9, true],
    [-20, 5, 10, false],
    [18, -12, 11, true],
    [-12, -27, 12, false],
    [4, -38, 15, true],
  ];
  for (var p = 0; p < patchSpecs.length; p++) {
    createFlowerPatch(
      patchSpecs[p][0],
      patchSpecs[p][1],
      patchSpecs[p][2],
      patchSpecs[p][3]
    );
  }

  // 支柱与墙面上的藤蔓。
  for (var v = 0; v < 52; v++) {
    var vine = new THREE.Mesh(vineSegment, materials.vine);
    var vx = (random() - 0.5) * (width - 2);
    var vz = (random() - 0.5) * (length - 2);
    var vh = 1.1 + random() * 3.15;
    vine.scale.set(1.2 + random(), vh, 1.2 + random());
    vine.position.set(vx, vh * 0.5, vz);
    vine.rotation.z = (random() - 0.5) * 0.24;
    group.add(vine);
  }

  // 深处废弃聚落：倒塌矮屋、石栏与空床架。
  function ruinHouse(x, z, rotation) {
    var ruin = new THREE.Group();
    ruin.position.set(x, 0, z);
    ruin.rotation.y = rotation || 0;
    group.add(ruin);
    addBox(5.3, 0.18, 4.2, 0, 0.09, 0, materials.concreteDark, ruin);
    addBox(5.3, 2.15, 0.22, 0, 1.075, -2.0, materials.concreteDark, ruin);
    addBox(0.22, 1.65, 4.1, -2.55, 0.825, 0, materials.concreteDark, ruin);
    addBox(1.8, 0.24, 3.6, 1.65, 1.35, 0.2, materials.wood, ruin).rotation.z = -0.18;
    // 聚落建筑使用轴对齐摆放，碰撞保持简单可靠。
    addCollider(x - 2.7, x + 2.7, z - 2.15, z - 1.85, { settlement: true });
    addCollider(x - 2.7, x - 2.4, z - 2.1, z + 2.1, { settlement: true });
  }
  ruinHouse(-9, -36, 0);
  ruinHouse(9, -32, Math.PI);
  ruinHouse(0, -42, 0);
  addBox(10, 0.72, 0.42, 0, 0.36, -29.2, materials.concreteDark);
  addCollider(-5, 5, -29.41, -28.99, { settlement: true });

  function addLog(id, x, y, z, title, text) {
    var page = addBox(0.55, 0.025, 0.72, x, y, z, materials.paper);
    page.rotation.y = (random() - 0.5) * 0.4;
    page.name = 'ConcreteGardenLog_' + id;
    addInteraction(page, {
      kind: 'level12_log',
      id: id,
      title: title,
      text: text,
    });
    return page;
  }

  addLog(
    'entry',
    1.05,
    0.42,
    south - 4.2,
    '被雨水晕开的警告',
    '若看见草甸，立即沿原路返回。光会兜圈，植物会记住你。'
  );
  addLog(
    'settlement',
    -8.4,
    0.35,
    -35.4,
    '聚落值守记录',
    '第七码头无人归来。我们开始忘记彼此的名字，墙缝里却开出了熟悉的花。'
  );
  addLog(
    'olivia',
    1.3,
    0.83,
    -41.2,
    '植物学家的残页',
    '它们并非植物，而是死者与迷失者的记忆。不要采摘。不要停留。'
  );

  function addSample(id, x, z, label) {
    var jar = new THREE.Mesh(sampleJarGeo, materials.glass);
    jar.position.set(x, 0.38, z);
    jar.name = 'ConcreteGardenSample_' + id;
    group.add(jar);
    addInteraction(jar, { kind: 'level12_sample', id: id, label: label });
  }
  addSample('cornflower', 13.2, 21.8, '矢车菊花粉样本');
  addSample('root', -7.8, -37.1, '盘根藤蔓切片');

  var environment = {
    id: 'level1.2',
    depth: 0,
    exposure: 0,
    mutationStage: 0,
    memoryIntegrity: 1,
    movementMultiplier: 1,
    staminaRecoveryMultiplier: 0.9,
    sanityDrainPerSec: 0.12,
  };

  var stageMessages = [
    '',
    '你的舌尖浮现出一个名字，但下一秒便忘了。',
    '细小的根须正沿着皮肤下方延伸。',
    '花瓣从撕裂的皮肤中舒展开来。必须马上返回入口。',
    '你的双腿正在扎根。砼苑开始替你保存最后的记忆。',
  ];

  function emitMutation(callbacks, previous) {
    var payload = {
      source: 'level1.2',
      stage: mutationStage,
      previousStage: previous,
      exposure: exposure,
      memoryIntegrity: environment.memoryIntegrity,
      description: stageMessages[mutationStage],
    };
    if (typeof callbacks.onMutation === 'function') callbacks.onMutation(payload);
    if (typeof callbacks.showToast === 'function') callbacks.showToast(stageMessages[mutationStage]);
  }

  function update(dt, player, callbacks) {
    if (disposed) return getSurvivalEnv();
    callbacks = callbacks || {};
    latestCallbacks = callbacks;
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    elapsed += delta;
    var position = readPlayer(player, originX, originZ);
    var depth = THREE.MathUtils.clamp((south - position.z) / length, 0, 1);
    environment.depth = depth;

    // 即使停在入口也有轻微压力；深入与调查样本会明显加速植物化。
    exposure = Math.min(1.18, exposure + delta * (0.0017 + depth * depth * 0.0048));
    environment.exposure = exposure;
    environment.memoryIntegrity = Math.max(0, 1 - exposure * 0.86);
    var nextStage =
      exposure < 0.18 ? 0 : exposure < 0.4 ? 1 : exposure < 0.64 ? 2 : exposure < 0.88 ? 3 : 4;
    if (nextStage !== mutationStage) {
      var previous = mutationStage;
      mutationStage = nextStage;
      emitMutation(callbacks, previous);
    }
    environment.mutationStage = mutationStage;
    environment.movementMultiplier = Math.max(0.42, 1 - mutationStage * 0.1 - depth * 0.08);
    environment.staminaRecoveryMultiplier = Math.max(0.25, 0.92 - mutationStage * 0.14);
    environment.sanityDrainPerSec = 0.1 + depth * 0.22 + mutationStage * 0.11;

    var depthBand = Math.min(3, Math.floor(depth * 4));
    if (depthBand !== lastDepthBand) {
      lastDepthBand = depthBand;
      if (depthBand === 1 && typeof callbacks.showToast === 'function') {
        callbacks.showToast('高草吞没了身后的路线。空气里没有任何实体的声响。');
      } else if (depthBand === 3 && typeof callbacks.showToast === 'function') {
        callbacks.showToast('前方出现一片废弃聚落。你已很难回忆入口的方向。');
      }
    }

    var exposureEvent = {
      source: 'level1.2',
      depth: depth,
      exposure: exposure,
      mutationStage: mutationStage,
      memoryLossPerSec: 0.0017 + depth * depth * 0.0048,
      sanityPressure: environment.sanityDrainPerSec,
      movementMultiplier: environment.movementMultiplier,
    };
    if (typeof callbacks.onExposure === 'function') callbacks.onExposure(exposureEvent);
    if (typeof callbacks.onSanityPressure === 'function') {
      callbacks.onSanityPressure(environment.sanityDrainPerSec, exposureEvent);
    }

    if (mutationStage >= 3) {
      damageClock += delta;
      var interval = mutationStage === 4 ? 1.7 : 3.1;
      if (damageClock >= interval) {
        damageClock %= interval;
        var damage = mutationStage === 4 ? 5 : 2;
        if (typeof callbacks.onDamage === 'function') {
          callbacks.onDamage(damage, {
            source: 'level1.2_plant_conversion',
            type: 'mutation',
            stage: mutationStage,
          });
        }
      }
    } else {
      damageClock = 0;
    }

    for (var i = 0; i < animatedFlowers.length; i++) {
      var flower = animatedFlowers[i];
      flower.mesh.position.y = flower.baseY + Math.sin(elapsed * 1.2 + flower.phase) * 0.025;
      flower.mesh.rotation.z += delta * 0.08;
    }
    entryLight.intensity = 0.65 + Math.max(0, Math.sin(elapsed * 8.7)) * 0.22;
    villageLight.intensity = 0.5 + Math.sin(elapsed * 0.47) * 0.12;
    return getSurvivalEnv();
  }

  function getSurvivalEnv() {
    return {
      id: environment.id,
      depth: environment.depth,
      exposure: environment.exposure,
      mutationStage: environment.mutationStage,
      memoryIntegrity: environment.memoryIntegrity,
      movementMultiplier: environment.movementMultiplier,
      staminaRecoveryMultiplier: environment.staminaRecoveryMultiplier,
      sanityDrainPerSec: environment.sanityDrainPerSec,
      memoryLossPerSec: 0.0017 + environment.depth * environment.depth * 0.0048,
      skipPassiveSanity: false,
      hasEntities: false,
    };
  }

  function getInteractionHint(target) {
    var data = resolveInteraction(target);
    if (!data) return '';
    if (data.kind === 'level12_exit') return '沿原路返回 Level 1 · 按 Q';
    if (data.kind === 'level12_log') {
      return investigated['log:' + data.id] ? data.title + ' · 已读' : data.title + ' · 按 Q 调查';
    }
    if (data.kind === 'level12_sample') {
      return investigated['sample:' + data.id]
        ? data.label + ' · 已调查'
        : data.label + ' · 按 Q 近距离调查';
    }
    return '';
  }

  function interact(target, callbacks) {
    if (disposed) return false;
    callbacks = callbacks || latestCallbacks || {};
    var data = resolveInteraction(target);
    if (!data) return false;
    var toast =
      typeof callbacks.showToast === 'function' ? callbacks.showToast : function noop() {};

    if (data.kind === 'level12_exit') {
      exitRequest = {
        destination: 'level1',
        reason: 'returned_through_level1_2_entrance',
        mutationStage: mutationStage,
        exposure: exposure,
      };
      toast('你强迫自己记住来路，退回了 Level 1。');
      return true;
    }
    if (data.kind === 'level12_log') {
      investigated['log:' + data.id] = true;
      toast(data.title + '：' + data.text);
      if (typeof callbacks.onInvestigate === 'function') {
        callbacks.onInvestigate({
          source: 'level1.2',
          kind: 'log',
          id: data.id,
          title: data.title,
          text: data.text,
        });
      }
      return true;
    }
    if (data.kind === 'level12_sample') {
      var sampleKey = 'sample:' + data.id;
      if (investigated[sampleKey]) {
        toast('你已经记录过这份样本。最好别再靠近。');
        return true;
      }
      investigated[sampleKey] = true;
      exposure = Math.min(1.18, exposure + 0.075);
      toast(data.label + '释放出带有陌生记忆的花粉。植物化加剧了。');
      if (typeof callbacks.onMutation === 'function') {
        callbacks.onMutation({
          source: 'level1.2_sample',
          stage: mutationStage,
          exposure: exposure,
          sampleId: data.id,
          description: '样本接触导致额外植物化暴露。',
        });
      }
      if (typeof callbacks.onInvestigate === 'function') {
        callbacks.onInvestigate({
          source: 'level1.2',
          kind: 'sample',
          id: data.id,
          label: data.label,
        });
      }
      return true;
    }
    return false;
  }

  function drawFx(canvas, now) {
    if (disposed || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width || 1;
    var h = canvas.height || 1;
    var stage = mutationStage;
    var alpha = Math.min(0.35, exposure * 0.24);
    if (alpha > 0.005) {
      var gradient = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.12, w * 0.5, h * 0.5, h * 0.75);
      gradient.addColorStop(0, 'rgba(43,78,37,0)');
      gradient.addColorStop(1, 'rgba(29,65,27,' + alpha.toFixed(3) + ')');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    if (stage >= 1) {
      var time = (Number(now) || elapsed * 1000) * 0.001;
      ctx.save();
      ctx.globalAlpha = Math.min(0.28, 0.045 + exposure * 0.2);
      ctx.fillStyle = stage >= 3 ? '#d7a45c' : '#e9ddad';
      var specks = 8 + stage * 7;
      for (var i = 0; i < specks; i++) {
        var sx = ((Math.sin(i * 91.7 + time * 0.17 + fxSeed) + 1) * 0.5) * w;
        var sy = ((Math.sin(i * 47.3 - time * (0.11 + i * 0.003) + fxSeed * 0.3) + 1) * 0.5) * h;
        var radius = 0.8 + (i % 4) * 0.55;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (stage >= 3) {
      ctx.save();
      ctx.globalAlpha = 0.08 + (stage - 3) * 0.06;
      ctx.strokeStyle = '#315d2d';
      ctx.lineWidth = 3;
      for (var branch = 0; branch < 5; branch++) {
        ctx.beginPath();
        ctx.moveTo(branch % 2 ? 0 : w, h * (0.3 + branch * 0.13));
        ctx.bezierCurveTo(
          w * (branch % 2 ? 0.12 : 0.88),
          h * 0.45,
          w * (branch % 2 ? 0.05 : 0.95),
          h * 0.72,
          w * (branch % 2 ? 0.22 : 0.78),
          h
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function getExitRequest(clear) {
    var request = exitRequest;
    if (clear === true) exitRequest = null;
    return request;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    for (var i = 0; i < ownedGeometries.length; i++) ownedGeometries[i].dispose();
    for (var m = 0; m < ownedMaterials.length; m++) ownedMaterials[m].dispose();
    group.clear();
    colliders.length = 0;
    interactMeshes.length = 0;
    animatedFlowers.length = 0;
    latestCallbacks = {};
  }

  return {
    group: group,
    colliders: colliders,
    interactMeshes: interactMeshes,
    spawn: {
      x: originX,
      y: 0.36,
      z: originZ + south - 3.15,
      yaw: Math.PI,
    },
    update: update,
    drawFx: drawFx,
    getSurvivalEnv: getSurvivalEnv,
    getInteractionHint: getInteractionHint,
    interact: interact,
    getExitRequest: getExitRequest,
    dispose: dispose,
  };
}

export default buildLevel1_2World;

/**
 * Level C-1「交点」世界层
 *
 * 交点与 Level 0 高度相似——同样的黄墙纸、地毯与荧光灯，同样的非欧几里得空间，
 * 所以这里直接复用 Level 0 的流式迷宫生成器，只是关掉它的专属地标（红门、蓝洞、
 * 马尼拉房间、切出墙），换成交点自己的东西：
 *
 *   - 安全出口标志：常态绿色，断电前会变红，是玩家唯一的预警来源
 *   - 墙角补给：杏仁水、火盐、工具
 *   - 罕见的红色房间与只通往天花板的楼梯
 *   - 破损墙纸露出的黄色混凝土砖，以及能窥见 Level C-2 的墙洞
 *   - 灰白色消防通道：通往 Level 1 的出口
 */
import * as THREE from "three";
import { createLevel0WorldManager } from "./backrooms-level0-world.js";

/** 每个区块最多放几块安全出口标志 */
const SIGNS_PER_CHUNK = 2;

const SIGN_GREEN = 0x35c46a;
const SIGN_RED = 0xd23b2f;

/** 墙角补给的掉落表：权重越大越常见 */
const LOOT_TABLE = [
  { itemId: "almond_water", name: "杏仁水", weight: 5 },
  { itemId: "fire_salt", name: "小块可爆炸火盐", weight: 3 },
  { itemId: "industrial_supplies", name: "工具包", weight: 2 },
];

function pickLoot(roll) {
  var total = 0;
  var i;
  for (i = 0; i < LOOT_TABLE.length; i++) total += LOOT_TABLE[i].weight;
  var cursor = roll * total;
  for (i = 0; i < LOOT_TABLE.length; i++) {
    cursor -= LOOT_TABLE[i].weight;
    if (cursor <= 0) return LOOT_TABLE[i];
  }
  return LOOT_TABLE[0];
}

/** 安全出口标志：绿底白色小人，断电预警时整块转红 */
function buildExitSign(ctx) {
  var group = new THREE.Group();
  var plateMat = new THREE.MeshStandardMaterial({
    color: SIGN_GREEN,
    emissive: SIGN_GREEN,
    emissiveIntensity: 0.85,
    roughness: 0.5,
  });
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), plateMat);
  group.add(plate);

  var glyphMat = new THREE.MeshBasicMaterial({ color: 0xf3fff5 });
  var glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.17), glyphMat);
  glyph.position.set(-0.16, 0, 0.006);
  group.add(glyph);
  var arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), glyphMat);
  arrow.position.set(0.14, 0, 0.006);
  group.add(arrow);

  group.userData.c1Sign = { plateMat: plateMat, glyphMat: glyphMat };
  return group;
}

/** 墙角补给堆：一个矮箱 + 拾取用的 pick 体 */
function buildLootCache(loot, id) {
  var group = new THREE.Group();
  var boxMat = new THREE.MeshStandardMaterial({
    color: loot.itemId === "almond_water" ? 0xcfd6c2 : 0x8c7a52,
    roughness: 0.85,
  });
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.28), boxMat);
  box.position.y = 0.15;
  group.add(box);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.1, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.55;
  pick.userData.brInteract = {
    kind: "c1_loot",
    id: id,
    itemId: loot.itemId,
    name: loot.name,
    amount: 1,
  };
  group.add(pick);
  return { group: group, pick: pick };
}

/** 破损墙纸后露出的黄色混凝土砖，中央是能窥见 C-2 的小洞 */
function buildPeepHole(id) {
  var group = new THREE.Group();
  var brickMat = new THREE.MeshStandardMaterial({
    color: 0xa89a55,
    roughness: 0.98,
  });
  var brick = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), brickMat);
  group.add(brick);

  var holeMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d });
  var hole = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), holeMat);
  hole.position.z = 0.008;
  group.add(hole);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.z = 0.2;
  pick.userData.brInteract = { kind: "c1_peephole", id: id };
  group.add(pick);
  return { group: group, pick: pick };
}

/** 灰白色消防通道：交点通往 Level 1 的出口 */
function buildFireExit(ctx, id) {
  var group = new THREE.Group();
  var frameMat = new THREE.MeshStandardMaterial({
    color: 0xb9bcbb,
    roughness: 0.7,
    metalness: 0.15,
  });
  var doorMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a1,
    roughness: 0.6,
    metalness: 0.2,
  });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.15, 0.14), frameMat);
  frame.position.y = 1.075;
  group.add(frame);
  var door = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.95, 0.08), doorMat);
  door.position.set(0, 1, 0.08);
  group.add(door);

  // 楼梯的头几级：暗示门后是向下的灰白色梯段
  var stepMat = new THREE.MeshStandardMaterial({ color: 0x8f9494, roughness: 0.9 });
  var s;
  for (s = 0; s < 3; s++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.26), stepMat);
    step.position.set(0, 0.06 + s * 0.02, 0.22 + s * 0.26);
    group.add(step);
  }

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.2, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 1.1, 0.35);
  pick.userData.brInteract = { kind: "c1_fire_exit", id: id };
  group.add(pick);
  return { group: group, pick: pick };
}

/** 只通往天花板的楼梯——原文明确提到的反常结构 */
function buildDeadStair(ctx) {
  var group = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: 0x8a8360, roughness: 0.95 });
  var steps = 7;
  var rise = (ctx.wallHeight - 0.15) / steps;
  var s;
  for (s = 0; s < steps; s++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(1.1, rise, 0.34), mat);
    step.position.set(0, rise * (s + 0.5), -0.34 * s);
    group.add(step);
  }
  return group;
}

/** 罕见的红色房间：墙面与灯光都偏红 */
function buildRedRoomMarker(ctx) {
  var group = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({
    color: 0x7c1d1a,
    emissive: 0x3a0b09,
    emissiveIntensity: 0.6,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  var panel = new THREE.Mesh(
    new THREE.PlaneGeometry(ctx.gridSize * 0.96, ctx.wallHeight * 0.98),
    mat
  );
  panel.position.y = ctx.wallHeight * 0.5;
  group.add(panel);
  var glow = new THREE.PointLight(0xd23b2f, 0.5, 7, 2);
  glow.position.set(0, ctx.wallHeight * 0.6, 0.6);
  group.add(glow);
  return group;
}

/**
 * @param {THREE.Object3D} root
 * @param {{ sessionSeed?: string, gfxProfile?: object, wallHeight?: number, gridSize?: number }} [opts]
 */
export function buildLevelC1World(root, opts) {
  opts = opts || {};

  /** 当前已加载区块里的安全出口标志，供断电系统整体切红 */
  var exitSigns = [];
  /** 当前已加载区块里的补给点，拾取后按 id 记住不再刷新 */
  var lootCaches = [];
  var takenLoot = Object.create(null);
  var interactMeshes = [];

  function decorateChunk(chunk, ctx) {
    var rng = ctx.mulberry32(
      ctx.hashString(ctx.seed + "|c1|" + chunk.cx + "|" + chunk.cz + "|" + chunk.epoch)
    );

    // 收集本区块所有可走格，装饰只放在这些格子里
    var open = [];
    var row;
    var col;
    for (row = 1; row < ctx.cellsPerChunk - 1; row++) {
      for (col = 1; col < ctx.cellsPerChunk - 1; col++) {
        if (ctx.isOpenCell(row, col)) open.push({ row: row, col: col });
      }
    }
    if (!open.length) return;

    function takeCell() {
      if (!open.length) return null;
      var idx = Math.floor(rng() * open.length);
      return open.splice(idx, 1)[0];
    }

    // 生成器每个区块只保存一处地标（chunk.landmark），登记第二处会让第一处
    // 永远停在 active 状态，非欧循环就会把人送到早已卸载的坐标上。
    var landmarkTaken = false;
    function claimLandmark(kind, position) {
      if (landmarkTaken) return;
      landmarkTaken = true;
      ctx.addLandmark(kind, position, position);
    }

    /** 找出该格贴着的一面墙，返回朝向走廊内侧的法线 */
    function wallFacing(cell) {
      var dirs = [
        { dx: 0, dz: -1, rot: 0 },
        { dx: 0, dz: 1, rot: Math.PI },
        { dx: -1, dz: 0, rot: -Math.PI * 0.5 },
        { dx: 1, dz: 0, rot: Math.PI * 0.5 },
      ];
      var i;
      for (i = 0; i < dirs.length; i++) {
        var d = dirs[i];
        if (!ctx.isOpenCell(cell.row + d.dz, cell.col + d.dx)) return d;
      }
      return null;
    }

    // —— 安全出口标志 ——
    var signCount = 1 + (rng() < 0.5 ? 1 : 0);
    var n;
    for (n = 0; n < signCount && n < SIGNS_PER_CHUNK; n++) {
      var signCell = takeCell();
      if (!signCell) break;
      var signFace = wallFacing(signCell);
      if (!signFace) continue;
      var signPos = ctx.cellWorldCenter(signCell.row, signCell.col);
      var sign = buildExitSign(ctx);
      sign.position.set(
        signPos.x + signFace.dx * ctx.gridSize * 0.48,
        ctx.wallHeight - 0.42,
        signPos.z + signFace.dz * ctx.gridSize * 0.48
      );
      sign.rotation.y = signFace.rot;
      chunk.group.add(sign);
      ctx.addDisposable(sign);
      exitSigns.push(sign);
    }

    // —— 墙角补给 ——
    if (rng() < 0.62) {
      var lootCell = takeCell();
      if (lootCell) {
        var lootId =
          "c1-loot-" + chunk.cx + "_" + chunk.cz + "_" + chunk.epoch + "_" + lootCell.row + "_" + lootCell.col;
        if (!takenLoot[lootId]) {
          var loot = pickLoot(rng());
          var lootPos = ctx.cellWorldCenter(lootCell.row, lootCell.col);
          var cache = buildLootCache(loot, lootId);
          cache.group.position.set(
            lootPos.x + (rng() - 0.5) * ctx.gridSize * 0.4,
            0,
            lootPos.z + (rng() - 0.5) * ctx.gridSize * 0.4
          );
          chunk.group.add(cache.group);
          ctx.addDisposable(cache.group);
          ctx.addInteract(cache.pick);
          interactMeshes.push(cache.pick);
          lootCaches.push({ id: lootId, group: cache.group, pick: cache.pick });
        }
      }
    }

    // —— 墙洞：能窥见 Level C-2 ——
    if (rng() < 0.16) {
      var holeCell = takeCell();
      var holeFace = holeCell ? wallFacing(holeCell) : null;
      if (holeFace) {
        var holePos = ctx.cellWorldCenter(holeCell.row, holeCell.col);
        var holeId = "c1-hole-" + chunk.cx + "_" + chunk.cz + "_" + chunk.epoch;
        var peep = buildPeepHole(holeId);
        peep.group.position.set(
          holePos.x + holeFace.dx * ctx.gridSize * 0.47,
          1.45,
          holePos.z + holeFace.dz * ctx.gridSize * 0.47
        );
        peep.group.rotation.y = holeFace.rot;
        chunk.group.add(peep.group);
        ctx.addDisposable(peep.group);
        ctx.addInteract(peep.pick);
        interactMeshes.push(peep.pick);
      }
    }

    // —— 消防通道：通往 Level 1 的出口 ——
    if (rng() < 0.075) {
      var exitCell = takeCell();
      var exitFace = exitCell ? wallFacing(exitCell) : null;
      if (exitFace) {
        var exitPos = ctx.cellWorldCenter(exitCell.row, exitCell.col);
        var exitId = "c1-exit-" + chunk.cx + "_" + chunk.cz + "_" + chunk.epoch;
        var fireExit = buildFireExit(ctx, exitId);
        fireExit.group.position.set(
          exitPos.x + exitFace.dx * ctx.gridSize * 0.46,
          0,
          exitPos.z + exitFace.dz * ctx.gridSize * 0.46
        );
        fireExit.group.rotation.y = exitFace.rot;
        chunk.group.add(fireExit.group);
        ctx.addDisposable(fireExit.group);
        ctx.addInteract(fireExit.pick);
        interactMeshes.push(fireExit.pick);
        claimLandmark("c1_fire_exit", exitPos);
      }
    }

    // —— 只通往天花板的楼梯 ——
    if (rng() < 0.1) {
      var stairCell = takeCell();
      var stairFace = stairCell ? wallFacing(stairCell) : null;
      if (stairFace) {
        var stairPos = ctx.cellWorldCenter(stairCell.row, stairCell.col);
        var stair = buildDeadStair(ctx);
        stair.position.set(
          stairPos.x + stairFace.dx * ctx.gridSize * 0.3,
          0,
          stairPos.z + stairFace.dz * ctx.gridSize * 0.3
        );
        stair.rotation.y = stairFace.rot;
        chunk.group.add(stair);
        ctx.addDisposable(stair);
        // 登记成地标：这类醒目结构是非欧循环的锚点
        claimLandmark("c1_stair", stairPos);
      }
    }

    // —— 红色房间 ——
    if (rng() < 0.045) {
      var redCell = takeCell();
      var redFace = redCell ? wallFacing(redCell) : null;
      if (redFace) {
        var redPos = ctx.cellWorldCenter(redCell.row, redCell.col);
        var red = buildRedRoomMarker(ctx);
        red.position.set(
          redPos.x + redFace.dx * ctx.gridSize * 0.49,
          0,
          redPos.z + redFace.dz * ctx.gridSize * 0.49
        );
        red.rotation.y = redFace.rot;
        chunk.group.add(red);
        ctx.addDisposable(red);
        claimLandmark("c1_red_room", redPos);
      }
    }
  }

  var manager = createLevel0WorldManager(root, {
    gridSize: opts.gridSize,
    wallHeight: opts.wallHeight,
    sessionSeed: opts.sessionSeed,
    gfxProfile: opts.gfxProfile,
    // 关掉 Level 0 专属地标：交点有自己的一套
    poiSpecs: [],
    onChunkBuilt: decorateChunk,
  });

  /**
   * 区块卸载只是把 chunk.group 从 root 上摘下来，装饰对象自身的 parent 仍然指着
   * chunk.group，所以必须一路向上走到 root 才能判断它是否真的还在场景里。
   * 射线拾取不要求对象挂在场景上，漏掉这一步会让玩家隔空点到已卸载的东西。
   */
  function isAttached(object) {
    var node = object;
    while (node) {
      if (node === root) return true;
      node = node.parent;
    }
    return false;
  }

  /** 卸载后的标志/补给引用会失效，每帧剔除已脱离场景的条目 */
  function pruneStale() {
    var i;
    for (i = exitSigns.length - 1; i >= 0; i--) {
      if (!isAttached(exitSigns[i])) exitSigns.splice(i, 1);
    }
    for (i = lootCaches.length - 1; i >= 0; i--) {
      if (!isAttached(lootCaches[i].group)) lootCaches.splice(i, 1);
    }
    for (i = interactMeshes.length - 1; i >= 0; i--) {
      if (!isAttached(interactMeshes[i])) interactMeshes.splice(i, 1);
    }
  }

  return {
    /** @param {number} px @param {number} pz @param {number} now */
    update: function (px, pz, now) {
      manager.update(px, pz, now);
      pruneStale();
    },
    getColliders: function () {
      return manager.getColliders();
    },
    getLightCandidates: function (px, pz, radius) {
      return manager.getLightCandidates(px, pz, radius);
    },
    // 交点关掉了 Level 0 的 POI，可交互物全部来自这一层，直接返回自己的清单，
    // 这样拾取后能立刻把对象摘出去，不必等生成器那边同步。
    getInteractMeshes: function () {
      return interactMeshes;
    },
    getSpawnPoint: function () {
      return manager.getSpawnPoint();
    },
    consumeLoopSuggestion: function (px, pz, yaw, now) {
      return manager.consumeLoopSuggestion(px, pz, yaw, now);
    },
    /** 断电系统用它把全部标志切成红色（或恢复绿色） */
    setSignsAlarmed: function (alarmed) {
      var i;
      for (i = 0; i < exitSigns.length; i++) {
        var data = exitSigns[i].userData.c1Sign;
        if (!data) continue;
        var color = alarmed ? SIGN_RED : SIGN_GREEN;
        data.plateMat.color.setHex(color);
        data.plateMat.emissive.setHex(color);
        data.plateMat.emissiveIntensity = alarmed ? 1.25 : 0.85;
      }
    },
    /** 断电时标志本身也熄灭，只留极暗的余辉 */
    setSignsPowered: function (powered) {
      var i;
      for (i = 0; i < exitSigns.length; i++) {
        var data = exitSigns[i].userData.c1Sign;
        if (!data) continue;
        data.plateMat.emissiveIntensity = powered ? 0.85 : 0.16;
        data.glyphMat.opacity = powered ? 1 : 0.35;
        data.glyphMat.transparent = !powered;
      }
    },
    hasExitSigns: function () {
      return exitSigns.length > 0;
    },
    /** 拾取后移除补给点，并记住本局不再重复刷出 */
    consumeLoot: function (id) {
      takenLoot[id] = true;
      var i;
      for (i = lootCaches.length - 1; i >= 0; i--) {
        if (lootCaches[i].id !== id) continue;
        var cache = lootCaches[i];
        if (cache.group.parent) cache.group.parent.remove(cache.group);
        // 射线拾取不看对象是否还挂在场景上，必须同时摘掉交互标记与清单条目，
        // 否则玩家能对着空气反复拾取同一份补给。
        delete cache.pick.userData.brInteract;
        var at = interactMeshes.indexOf(cache.pick);
        if (at >= 0) interactMeshes.splice(at, 1);
        lootCaches.splice(i, 1);
      }
    },
    restoreTakenLoot: function (ids) {
      if (!ids) return;
      var i;
      for (i = 0; i < ids.length; i++) takenLoot[ids[i]] = true;
    },
    getTakenLootIds: function () {
      return Object.keys(takenLoot);
    },
    dispose: function () {
      exitSigns.length = 0;
      lootCaches.length = 0;
      interactMeshes.length = 0;
      manager.dispose();
    },
  };
}

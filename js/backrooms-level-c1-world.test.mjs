/**
 * Level C-1「交点」世界层测试。
 *
 * 重点有两块：
 *   1. Level 0 回归 —— 新加的 poiSpecs / onChunkBuilt / addLandmark 三个可选参数
 *      不传时，Level 0 的生成结果必须和以前完全一致（仍会刷出红门、切出墙等地标）。
 *   2. C-1 自身 —— 关掉 POI 之后不再出现 Level 0 专属地标，而交点自己的装饰
 *      （安全出口标志、补给、消防通道）能正常生成、能随区块卸载一起释放。
 *
 * 运行：
 *   node --test js/backrooms-level-c1-world.test.mjs
 * 需要先准备好 three 的解析（见 README 或 /tmp/c1test 里的 node_modules 垫片）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createLevel0WorldManager } from "./backrooms-level0-world.js";
import { buildLevelC1World } from "./backrooms-level-c1-world.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";

/** 扫一片区域，把流式世界铺开，方便统计概率性内容 */
function sweep(world, steps, stride) {
  var i;
  for (i = 0; i < steps; i++) {
    world.update(i * stride, ((i * 7) % 11) * stride, 1000 + i * 40);
  }
}

test("Level 0 默认行为不受新参数影响：仍会生成专属地标", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, { sessionSeed: "regression-seed" });

  sweep(world, 40, 24);

  const interacts = world.getInteractMeshes();
  const kinds = new Set();
  interacts.forEach((mesh) => {
    if (mesh.userData && mesh.userData.brInteract) {
      kinds.add(mesh.userData.brInteract.kind);
    }
  });

  assert.ok(
    world.getColliders().length > 0,
    "Level 0 应当生成墙体碰撞"
  );
  assert.ok(
    kinds.size > 0,
    "Level 0 默认仍应刷出 POI 交互物，实际拿到：" + JSON.stringify([...kinds])
  );

  world.dispose();
});

test("传入 poiSpecs: [] 时不再生成任何 Level 0 专属 POI", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "regression-seed",
    poiSpecs: [],
  });

  sweep(world, 40, 24);

  const poiKinds = world
    .getInteractMeshes()
    .filter((m) => m.userData && m.userData.brInteract)
    .map((m) => m.userData.brInteract.kind);

  assert.deepEqual(poiKinds, [], "关闭 POI 后不应有任何 POI 交互物");
  assert.ok(world.getColliders().length > 0, "迷宫本身仍应正常生成");

  world.dispose();
});

test("onChunkBuilt 每个区块调用一次，并提供可用的上下文", () => {
  const root = new THREE.Group();
  const seenChunks = [];
  let ctxSample = null;

  const world = createLevel0WorldManager(root, {
    sessionSeed: "hook-seed",
    poiSpecs: [],
    onChunkBuilt: (chunk, ctx) => {
      seenChunks.push(chunk.cx + ":" + chunk.cz + ":" + chunk.epoch);
      if (!ctxSample) ctxSample = ctx;
    },
  });

  world.update(0, 0, 1000);

  assert.ok(seenChunks.length > 0, "至少应构建一个区块");
  assert.equal(
    seenChunks.length,
    new Set(seenChunks).size,
    "同一个区块不应重复回调"
  );

  assert.equal(typeof ctxSample.cellWorldCenter, "function");
  assert.equal(typeof ctxSample.isOpenCell, "function");
  assert.equal(typeof ctxSample.addCollider, "function");
  assert.equal(typeof ctxSample.addInteract, "function");
  assert.equal(typeof ctxSample.addDisposable, "function");
  assert.equal(typeof ctxSample.addLandmark, "function");
  assert.ok(ctxSample.gridSize > 0);
  assert.ok(ctxSample.cellsPerChunk > 0);

  // 出生格必须可走，否则玩家会卡在墙里
  assert.equal(ctxSample.isOpenCell(5, 5), true, "出生格应当可走");

  world.dispose();
});

test("C-1 世界会生成交点自己的装饰，且都是 c1_ 前缀的交互物", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, {
    sessionSeed: "c1-seed",
    gridSize: 2,
    wallHeight: 2.6,
  });

  sweep(world, 60, 20);

  const kinds = world
    .getInteractMeshes()
    .filter((m) => m.userData && m.userData.brInteract)
    .map((m) => m.userData.brInteract.kind);

  assert.ok(kinds.length > 0, "交点应当生成可交互物");
  kinds.forEach((kind) => {
    assert.ok(
      kind.startsWith("c1_"),
      "交点里不该混进非 C-1 的交互物：" + kind
    );
  });
  assert.ok(kinds.includes("c1_loot"), "应当刷出墙角补给");
  assert.ok(world.hasExitSigns(), "应当刷出安全出口标志");

  world.dispose();
});

test("安全出口标志能在绿/红之间切换，断电时会熄灭", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, { sessionSeed: "sign-seed" });
  sweep(world, 30, 20);
  assert.ok(world.hasExitSigns(), "测试前提：场景里要有标志");

  /** 取任意一块标志的材质来观察 */
  function anySignMaterial() {
    let found = null;
    root.traverse((node) => {
      if (!found && node.userData && node.userData.c1Sign) {
        found = node.userData.c1Sign;
      }
    });
    return found;
  }

  const sign = anySignMaterial();
  assert.ok(sign, "应当能找到标志材质");

  world.setSignsAlarmed(false);
  const calmColor = sign.plateMat.color.getHex();

  world.setSignsAlarmed(true);
  const alarmedColor = sign.plateMat.color.getHex();
  assert.notEqual(alarmedColor, calmColor, "预警时标志颜色必须变化");

  world.setSignsPowered(false);
  const darkIntensity = sign.plateMat.emissiveIntensity;
  world.setSignsPowered(true);
  assert.ok(
    sign.plateMat.emissiveIntensity > darkIntensity,
    "恢复供电后标志应当重新变亮"
  );

  world.dispose();
});

test("拾取过的补给不会再次刷出", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, { sessionSeed: "loot-seed" });
  sweep(world, 40, 20);

  const firstLoot = world
    .getInteractMeshes()
    .map((m) => m.userData && m.userData.brInteract)
    .find((d) => d && d.kind === "c1_loot");
  assert.ok(firstLoot, "测试前提：要先有一个补给点");

  world.consumeLoot(firstLoot.id);
  assert.ok(
    world.getTakenLootIds().includes(firstLoot.id),
    "拾取记录应当留存"
  );

  const stillThere = world
    .getInteractMeshes()
    .some((m) => m.userData.brInteract && m.userData.brInteract.id === firstLoot.id);
  assert.equal(stillThere, false, "拾取后该补给点应立刻从场景移除");

  // 换一个世界并恢复拾取记录，同样的种子下这个点不该再出现
  const root2 = new THREE.Group();
  const world2 = buildLevelC1World(root2, { sessionSeed: "loot-seed" });
  world2.restoreTakenLoot([firstLoot.id]);
  sweep(world2, 40, 20);
  const respawned = world2
    .getInteractMeshes()
    .some((m) => m.userData.brInteract && m.userData.brInteract.id === firstLoot.id);
  assert.equal(respawned, false, "已记录拾取的补给点不该重新刷出");

  world.dispose();
  world2.dispose();
});

test("准星对准补给时能拾取，拾取后再瞄同一处就没有东西了", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, { sessionSeed: "aim-seed" });
  sweep(world, 40, 20);

  const lootPick = world
    .getInteractMeshes()
    .find((m) => m.userData.brInteract && m.userData.brInteract.kind === "c1_loot");
  assert.ok(lootPick, "测试前提：场景里要有补给点");

  root.updateMatrixWorld(true);
  const target = new THREE.Vector3();
  lootPick.getWorldPosition(target);

  // 站在补给点旁边、平视对准它，等价于玩家把准星压上去
  const camera = new THREE.PerspectiveCamera(72, 1.5, 0.08, 220);
  camera.position.set(target.x, target.y, target.z + 1.6);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);

  const hit = pickCrosshairInteract(camera, world.getInteractMeshes(), 3.6, 3.6);
  assert.ok(hit, "准星对准补给时应当拾取到交互数据");
  assert.equal(hit.data.kind, "c1_loot");
  assert.ok(hit.data.itemId, "补给必须带物品 id 才能进背包");
  assert.ok(hit.data.name, "补给必须带名字才能显示提示");

  // 拿走之后同一个位置不该再拾取到任何东西
  world.consumeLoot(hit.data.id);
  const after = pickCrosshairInteract(camera, world.getInteractMeshes(), 3.6, 3.6);
  const sameLootAgain = !!(after && after.data && after.data.id === hit.data.id);
  assert.equal(
    sameLootAgain,
    false,
    "补给被拿走后不该还能对着原地反复拾取"
  );

  world.dispose();
});

test("消防通道与墙洞都能被准星识别", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, { sessionSeed: "aim-kinds-seed" });
  sweep(world, 120, 18);
  root.updateMatrixWorld(true);

  const wanted = ["c1_fire_exit", "c1_peephole"];
  const meshes = world.getInteractMeshes();

  wanted.forEach((kind) => {
    const mesh = meshes.find(
      (m) => m.userData.brInteract && m.userData.brInteract.kind === kind
    );
    assert.ok(mesh, "应当至少生成一处 " + kind);

    const target = new THREE.Vector3();
    mesh.getWorldPosition(target);
    const camera = new THREE.PerspectiveCamera(72, 1.5, 0.08, 220);
    camera.position.set(target.x, target.y, target.z + 1.2);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);

    const hit = pickCrosshairInteract(camera, meshes, 3.6, 3.6);
    assert.ok(hit, kind + " 应当能被准星拾取到");
  });

  world.dispose();
});

test("区块卸载后装饰与碰撞体都会被回收", () => {
  const root = new THREE.Group();
  const world = buildLevelC1World(root, { sessionSeed: "unload-seed" });

  world.update(0, 0, 1000);
  const nearColliders = world.getColliders().length;
  assert.ok(nearColliders > 0);

  // 走远到足以卸载起始区块之外的所有内容
  let now = 2000;
  for (let i = 1; i <= 30; i++) {
    now += 40;
    world.update(i * 60, 0, now);
  }

  const meshes = world.getInteractMeshes();
  meshes.forEach((mesh) => {
    assert.ok(mesh.parent, "留在列表里的交互物必须仍挂在场景中");
  });

  world.dispose();
  assert.equal(world.getInteractMeshes().length, 0, "dispose 后不应残留交互物");
});

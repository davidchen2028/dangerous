/**
 * Level C-1 断电循环与弱化实体测试。
 *
 * 关注点：状态机必须走完 calm → warning → blackout → recover → calm 的整圈，
 * 实体只在断电期间存在（供电恢复后必须清场），同时数量不超过原文写死的三只。
 *
 * 运行：
 *   node --import ./server/three-test-resolver.mjs --test js/backrooms-c1-blackout.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createC1BlackoutSystem } from "./backrooms-c1-blackout.js";
import { createC1Figure } from "./backrooms-c1-figures.js";
import {
  getBackroomsEntityTargetRoots,
  getBackroomsEntityTargetFromObject,
} from "./backrooms-entity-health.js";

/** 记录标志状态变化的假世界 */
function fakeWorld() {
  return {
    alarmed: null,
    powered: null,
    setSignsAlarmed(v) {
      this.alarmed = v;
    },
    setSignsPowered(v) {
      this.powered = v;
    },
  };
}

/** 只实现实体会用到的那部分 survival */
function fakeSurvival() {
  return {
    dead: false,
    hp: 100,
    takeDamage(amount) {
      this.hp -= amount;
      return true;
    },
  };
}

function makeSystem(colliders) {
  const root = new THREE.Group();
  const world = fakeWorld();
  const system = createC1BlackoutSystem({
    root,
    colliders: colliders || [],
    world,
    showToast: () => {},
    getPlayer: () => ({ x: 0, z: 0 }),
  });
  return { root, world, system };
}

/** 推进到目标状态，返回途中经过的状态序列 */
function advanceUntil(system, survival, targetState, maxMs) {
  const seen = [];
  let now = 0;
  const step = 250;
  while (now < (maxMs || 200000)) {
    system.update(step / 1000, now, survival);
    const state = system.getState();
    if (seen[seen.length - 1] !== state) seen.push(state);
    if (state === targetState) return { seen, now };
    now += step;
  }
  return { seen, now: -1 };
}

test("状态机会走完 calm → warning → blackout → recover 的整圈", () => {
  const { system } = makeSystem();
  const survival = fakeSurvival();

  const toWarning = advanceUntil(system, survival, "warning");
  assert.notEqual(toWarning.now, -1, "应当进入预警状态");

  const toBlackout = advanceUntil(system, survival, "blackout");
  assert.notEqual(toBlackout.now, -1, "预警之后应当断电");

  const toRecover = advanceUntil(system, survival, "recover");
  assert.notEqual(toRecover.now, -1, "断电之后应当恢复供电");

  const toCalm = advanceUntil(system, survival, "calm");
  assert.notEqual(toCalm.now, -1, "恢复之后应当回到常态");

  system.dispose();
});

test("预警时标志转红，断电时标志断电，恢复后复原", () => {
  const { world, system } = makeSystem();
  const survival = fakeSurvival();

  advanceUntil(system, survival, "warning");
  assert.equal(world.alarmed, true, "预警时安全出口标志必须变红");

  advanceUntil(system, survival, "blackout");
  assert.equal(world.powered, false, "断电时标志本身也应熄灭");

  advanceUntil(system, survival, "recover");
  assert.equal(world.powered, true, "恢复供电后标志应重新亮起");
  assert.equal(world.alarmed, false, "恢复供电后标志应变回绿色");

  system.dispose();
});

test("实体只在断电期间存在，且不超过三只", () => {
  const { system } = makeSystem();
  const survival = fakeSurvival();

  advanceUntil(system, survival, "blackout");
  const during = system.getActiveCount();
  assert.ok(during >= 2, "断电时至少刷出两只，实际 " + during);
  assert.ok(during <= 3, "断电时最多三只，实际 " + during);

  advanceUntil(system, survival, "recover");
  assert.equal(system.getActiveCount(), 0, "供电恢复后必须清场");

  system.dispose();
});

test("断电给出压暗系数，常态不压暗", () => {
  const { system } = makeSystem();
  const survival = fakeSurvival();

  let env = system.update(0.05, 0, survival);
  assert.equal(env.lightMul, 1, "常态不应压暗");

  advanceUntil(system, survival, "blackout");
  env = system.update(0.05, 1, survival);
  assert.ok(env.lightMul < 0.2, "断电时应当显著压暗，实际 " + env.lightMul);
  assert.equal(env.blackout, true);

  system.dispose();
});

test("dispose 会清掉所有实体，不留注册残余", () => {
  const { system } = makeSystem();
  const survival = fakeSurvival();
  advanceUntil(system, survival, "blackout");
  assert.ok(system.getActiveCount() > 0);

  const before = getBackroomsEntityTargetRoots().length;
  system.dispose();
  const after = getBackroomsEntityTargetRoots().length;

  assert.ok(after < before, "dispose 后存活实体应当减少");
  assert.equal(system.getActiveCount(), 0);
});

test("弱化实体血量低于常态，且能被击杀", () => {
  const root = new THREE.Group();
  const faceling = createC1Figure(root, [], { kind: "faceling", id: "t1" });
  const duller = createC1Figure(root, [], { kind: "duller", id: "t2" });

  assert.equal(faceling.health.maxHp, 70, "交点里的成年无面灵被弱化到 70");
  assert.equal(duller.health.maxHp, 55, "交点里的钝人被弱化到 55");

  // 火盐命中走的就是 brEntityTarget 这条路
  const target = getBackroomsEntityTargetFromObject(faceling.group);
  assert.ok(target, "实体必须能被准星锁定");

  target.takeDamage(40);
  assert.equal(target.alive, true, "没打死之前应当仍然存活");
  target.takeDamage(40);
  assert.equal(target.alive, false, "血量归零后应当死亡");
  assert.equal(faceling.group.visible, false, "死亡后应当从视野里消失");

  faceling.dispose();
  duller.dispose();
});

test("实体贴近玩家时造成伤害，且有攻击冷却", () => {
  const root = new THREE.Group();
  const duller = createC1Figure(root, [], { kind: "duller", id: "t3", x: 0, z: 0 });
  const survival = fakeSurvival();

  // 贴脸站定，连续推进若干帧
  let i;
  for (i = 0; i < 5; i++) duller.update(0.05, 0, 0.3, survival, () => {});
  const afterBurst = survival.hp;
  assert.ok(afterBurst < 100, "贴身时应当造成伤害");

  // 冷却期内不应连续掉血
  for (i = 0; i < 5; i++) duller.update(0.05, 0, 0.3, survival, () => {});
  assert.equal(survival.hp, afterBurst, "攻击冷却期内不应重复造成伤害");

  duller.dispose();
});

test("实体会朝玩家移动", () => {
  const root = new THREE.Group();
  const faceling = createC1Figure(root, [], { kind: "faceling", id: "t4", x: 0, z: 10 });
  const survival = fakeSurvival();

  const startDistance = Math.hypot(faceling.group.position.x, faceling.group.position.z);
  let i;
  for (i = 0; i < 40; i++) faceling.update(0.05, 0, 0, survival, () => {});
  const endDistance = Math.hypot(faceling.group.position.x, faceling.group.position.z);

  assert.ok(endDistance < startDistance, "应当朝玩家靠近");
  faceling.dispose();
});

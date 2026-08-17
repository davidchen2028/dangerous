/**
 * B.N.T.G. 交易保险库：奖池、幸运修正与 25 抽保底。
 */
import { addItem, countUsedSlots, countUsedHotbarSlots } from "./backrooms-inventory.js";
import { addMegPoints, getMegPoints } from "./backrooms-meg-points.js";
import { getLuck } from "./backrooms-luck.js";
import { noteVaultDraw } from "./backrooms-tasks.js";

export const VAULT_SINGLE_COST = 50;
export const VAULT_TEN_COST = 450;
export const VAULT_PITY_LIMIT = 25;
export const VAULT_PITY_KEY = "backrooms_trade_vault_pity_v1";

/** 十连折后单价，背包装不下时按此价退回未领取的抽数。 */
const VAULT_TEN_UNIT = VAULT_TEN_COST / 10;

const INVENTORY_CAPACITY = 26;

const ITEMS = {
  almond_water: { id: "almond_water", name: "杏仁水", variableCount: true },
  fire_salt: { id: "fire_salt", name: "小块可爆炸火盐", variableCount: true },
  royal_rations: { id: "royal_rations", name: "最小有效分量皇家口粮" },
  archive_c11: { id: "archive_c11", name: "一次性查看工具" },
  royal_rations_medium: {
    id: "royal_rations_medium",
    name: "中等大小皇家口粮",
  },
  banana_lucky_soy_milk: {
    id: "banana_lucky_soy_milk",
    name: "香蕉味幸运豆奶",
  },
  strawberry_lucky_soy_milk: {
    id: "strawberry_lucky_soy_milk",
    name: "草莓味幸运豆奶",
  },
  lucky_soy_milk: { id: "lucky_soy_milk", name: "幸运豆奶" },
  roulette: { id: "roulette", name: "后室轮盘赌" },
};

const NORMAL_POOL = [
  ["almond_water", 31],
  ["fire_salt", 21],
  ["royal_rations", 13],
  ["archive_c11", 8],
  ["royal_rations_medium", 6.5],
  ["banana_lucky_soy_milk", 7],
  ["strawberry_lucky_soy_milk", 6],
  ["lucky_soy_milk", 5],
  ["roulette", 2.5],
];

// 倒霉时压低优质物资，轮盘赌最低为 0.4%。
const UNLUCKY_POOL = [
  ["almond_water", 42.6],
  ["fire_salt", 32],
  ["royal_rations", 10],
  ["archive_c11", 4],
  ["royal_rations_medium", 1.5],
  ["banana_lucky_soy_milk", 4],
  ["strawberry_lucky_soy_milk", 3],
  ["lucky_soy_milk", 2.5],
  ["roulette", 0.4],
];

// 幸运时轮盘赌提升到 5%，并提高高级物资占比。
const LUCKY_POOL = [
  ["almond_water", 24],
  ["fire_salt", 15],
  ["royal_rations", 15],
  ["archive_c11", 12],
  ["royal_rations_medium", 8],
  ["banana_lucky_soy_milk", 8],
  ["strawberry_lucky_soy_milk", 7],
  ["lucky_soy_milk", 6],
  ["roulette", 5],
];

const PITY_IDS = [
  "roulette",
  "royal_rations_medium",
  "banana_lucky_soy_milk",
  "strawberry_lucky_soy_milk",
  "lucky_soy_milk",
];

function readPity() {
  try {
    var n = parseInt(sessionStorage.getItem(VAULT_PITY_KEY) || "0", 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(VAULT_PITY_LIMIT - 1, n)) : 0;
  } catch (err) {
    return 0;
  }
}

function writePity(value) {
  try {
    sessionStorage.setItem(VAULT_PITY_KEY, String(Math.max(0, value | 0)));
  } catch (err) {
    /* ignore */
  }
}

function isPityItem(id) {
  return PITY_IDS.indexOf(id) >= 0;
}

function pickWeighted(pool) {
  var roll = Math.random() * 100;
  var cursor = 0;
  for (var i = 0; i < pool.length; i++) {
    cursor += pool[i][1];
    if (roll < cursor) return pool[i][0];
  }
  return pool[pool.length - 1][0];
}

/** 保底三选一：轮盘赌 / 中等口粮 / 任意一款豆奶。 */
function pickPity() {
  var group = Math.floor(Math.random() * 3);
  if (group === 0) return "roulette";
  if (group === 1) return "royal_rations_medium";
  return PITY_IDS[2 + Math.floor(Math.random() * 3)];
}

function freeSlots() {
  return Math.max(
    0,
    INVENTORY_CAPACITY - countUsedSlots() - countUsedHotbarSlots()
  );
}

/** 定下一抽的结果，但不发货；保底计数在掷点时就推进。 */
function rollOne() {
  var pity = readPity();
  var forced = pity + 1 >= VAULT_PITY_LIMIT;
  var luck = getLuck();
  var pool = luck <= -30 ? UNLUCKY_POOL : luck >= 30 ? LUCKY_POOL : NORMAL_POOL;
  var id = forced ? pickPity() : pickWeighted(pool);
  var def = ITEMS[id];
  if (isPityItem(id)) writePity(0);
  else writePity(pity + 1);
  return {
    id: id,
    name: def.name,
    wanted: def.variableCount ? 1 + Math.floor(Math.random() * 3) : 1,
    forced: forced,
  };
}

/**
 * 扣积分并锁定抽取结果，物品要到保险库房间的桌子上才领取。
 * @returns {{ ok: boolean, reason?: string, pulls?: number, rolls?: object[] }}
 */
export function rollTradeVault(count) {
  var pulls = count === 10 ? 10 : 1;
  var cost = pulls === 10 ? VAULT_TEN_COST : VAULT_SINGLE_COST;
  if (getMegPoints() < cost) return { ok: false, reason: "积分不足" };
  if (freeSlots() < 1) return { ok: false, reason: "背包和快捷栏已满" };

  addMegPoints(-cost);
  var rolls = [];
  for (var i = 0; i < pulls; i++) rolls.push(rollOne());
  try {
    noteVaultDraw(rolls, pulls);
  } catch (err) {
    /* ignore */
  }
  return { ok: true, pulls: pulls, rolls: rolls };
}

/**
 * 在保险库房间领取已锁定的结果；装不下的抽数按折后单价退回积分。
 * @returns {{ ok: boolean, reason?: string, results?: object[], refunded?: number }}
 */
export function claimTradeVault(pending) {
  if (!pending || !pending.ok || !pending.rolls) {
    return { ok: false, reason: "没有待领取的物品" };
  }
  var results = [];
  var skipped = 0;
  for (var i = 0; i < pending.rolls.length; i++) {
    var roll = pending.rolls[i];
    var def = ITEMS[roll.id];
    var wanted = Math.max(1, roll.wanted | 0);
    // 整抽要么一次放完，要么整抽跳过退款，避免「放进 2 个丢掉第 3 个」。
    if (freeSlots() < wanted) {
      skipped++;
      continue;
    }
    var added = 0;
    for (var n = 0; n < wanted; n++) {
      if (!addItem(def)) break;
      added++;
    }
    if (added < wanted) {
      // 竞态：已装入一部分但未满，按剩余数量比例退该抽积分。
      skipped += (wanted - added) / wanted;
    }
    if (added < 1) continue;
    results.push({
      id: roll.id,
      name: roll.name,
      count: added,
      forced: roll.forced,
    });
  }
  var unit = pending.pulls === 10 ? VAULT_TEN_UNIT : VAULT_SINGLE_COST;
  var refunded = skipped > 0 ? Math.round(skipped * unit) : 0;
  if (refunded) addMegPoints(refunded);
  return { ok: true, results: results, refunded: refunded };
}

export function getTradeVaultPity() {
  return readPity();
}

export function formatTradeVaultResults(result) {
  if (!result || !result.ok) return result && result.reason ? result.reason : "抽取失败";
  var grouped = Object.create(null);
  for (var i = 0; i < result.results.length; i++) {
    var item = result.results[i];
    if (!grouped[item.id]) {
      grouped[item.id] = { name: item.name, count: 0, forced: false };
    }
    grouped[item.id].count += item.count;
    grouped[item.id].forced = grouped[item.id].forced || item.forced;
  }
  var lines = [];
  Object.keys(grouped).forEach(function (id) {
    var item = grouped[id];
    lines.push(
      item.name + " ×" + item.count + (item.forced ? "（25 抽保底）" : "")
    );
  });
  if (!lines.length) lines.push("背包和快捷栏已满，什么都没能拿走");
  if (result.refunded) lines.push("装不下的部分退回 " + result.refunded + " 积分");
  lines.push("当前保底计数：" + getTradeVaultPity() + "/" + VAULT_PITY_LIMIT);
  return lines.join("\n");
}

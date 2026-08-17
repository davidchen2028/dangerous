/**
 * M.E.G 任务与成就：任务板数据、接取状态、成就解锁，以及白板 / Y 面板两套 UI。
 */
import { addItem, countItem, removeFirstItem } from "./backrooms-inventory.js";
import { addMegPoints } from "./backrooms-meg-points.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";

const ACCEPTED_KEY = "backrooms_tasks_accepted_v1";
const COMPLETED_KEY = "backrooms_tasks_completed_v1";
const DELIVERED_KEY = "backrooms_tasks_delivered_v1";
const ACHIEVEMENTS_KEY = "backrooms_achievements_v1";
const BOARD_KEY = "backrooms_l4_taskboard_v1";
const VISITED_KEY = "backrooms_ach_visited_v1";
const CRIT_HP_KEY = "backrooms_ach_crit_hp_v1";
const CRIT_SAN_KEY = "backrooms_ach_crit_san_v1";
const SOY_DRINKS_KEY = "backrooms_ach_soy_drinks_v1";
const LUCKY_TEN_PENDING_KEY = "backrooms_ach_lucky_ten_v1";
const VAULT_DRY_KEY = "backrooms_ach_vault_dry_v1";
/** 限时任务的截止时间戳：{ [taskId]: epochMs } */
const DEADLINE_KEY = "backrooms_task_deadline_v1";
/** 侦查记录进度：{ [taskId]: string[] }，元素为已记录目标的唯一标识 */
const RECON_KEY = "backrooms_task_recon_v1";
/** 稀有委托本次是否挂在任务板上 */
const BOARD_OFFERS_KEY = "backrooms_task_board_offers_v1";

const SOY_BINGE_WINDOW_MS = 60 * 1000;
const VAULT_DRY_LIMIT = 10;

const VAULT_SOY_IDS = [
  "lucky_soy_milk",
  "strawberry_lucky_soy_milk",
  "banana_lucky_soy_milk",
];
const VAULT_RARE_IDS = VAULT_SOY_IDS.concat(["roulette"]);

/** M.E.G Level 4 前哨站任务板上的委托 */
export const TASK_DEFS = [
  {
    id: "package_l1",
    title: "给 Level 1 基地运一个包裹",
    reward: 15,
    type: "package",
    packageId: "package_l1",
    packageName: "L1包裹",
    deathPenalty: 10,
    desc: "把这件包裹送到 Level 1 的 M.E.G 基地。接取后背包里会出现待运送的包裹。中途死亡视为任务失败，扣 10 积分。",
  },
  {
    id: "map_l21",
    title: "绘制 Level 21 地图",
    reward: 30,
    type: "map",
    drawLevelId: "l21",
    desc: "前往 Level 21，按 Q 绘制地图，再回 Level 4 交付。若中途死亡，可重新绘制。",
  },
  {
    id: "recon_c1291",
    title: "死区侦查记录｜井盖迷阵",
    reward: 260,
    type: "recon",
    rare: true,
    /** 每次进入 Level 4 才重新掷一次是否挂出这张委托 */
    offerChance: 0.15,
    deviceId: "meg_recorder",
    deviceName: "M.E.G 特制记录设备",
    reconLevelId: "c1291",
    reconTarget: 3,
    deathPenalty: 50,
    timeLimitMs: 30 * 60 * 1000,
    desc:
      "极高风险委托。携带 M.E.G 特制记录设备进入 Level C-1291 井盖迷阵（死区），" +
      "对 3 个不同的井盖按 E 拍摄弹射与虚空井口现象，采集完立刻撤离，禁止长时间停留。" +
      "限时 30 分钟，死亡或超时判定失败并扣 50 积分。层级内没有怪物实体，" +
      "全部伤害来自井盖砸击、虚空井口与高温蒸汽。",
  },
];

/**
 * 成就定义。
 * category: explore=探索(常显) | set=合集(隐藏) | danger=危险遭遇(隐藏)
 * hidden: true 时未解锁不显示
 * levelId: 探索成就绑定的进入层级
 */
export const ACHIEVEMENT_DEFS = [
  // —— 一、探索成就（常显）——
  { id: "reshaped_chaos", title: "重塑的混乱", category: "explore", levelId: "0.2", reward: 0, condition: "进入 Level 0.2" },
  { id: "so_cold", title: "好冷", category: "explore", levelId: "0.3", reward: 0, condition: "进入 Level 0.3（本层级无法正常离开）" },
  { id: "lost_warehouse", title: "仓库迷途", category: "explore", levelId: "l1", reward: 0, condition: "进入 Level 1" },
  { id: "many_corridors", title: "多段走廊", category: "explore", levelId: "l1.1", reward: 0, condition: "进入 Level 1.1" },
  { id: "too_hot", title: "太热了", category: "explore", levelId: "l2", reward: 0, condition: "进入 Level 2" },
  { id: "pipe_maze", title: "管道迷宫", category: "explore", levelId: "l3", reward: 0, condition: "进入 Level 3" },
  { id: "safe_office", title: "安全办公间", category: "explore", levelId: "l4", reward: 0, condition: "进入 Level 4" },
  { id: "so_dark", title: "好黑", category: "explore", levelId: "l6", reward: 0, condition: "进入 Level 6" },
  { id: "snacks_here", title: "零食，我来了", category: "explore", levelId: "l6_1", reward: 0, condition: "进入 Level 6.1" },
  { id: "vast_sea", title: "大海，广阔", category: "explore", levelId: "l7", reward: 0, condition: "进入 Level 7" },
  { id: "cave_explore", title: "洞穴探险", category: "explore", levelId: "l8", reward: 0, condition: "进入 Level 8" },
  { id: "suburb_road", title: "郊区大道", category: "explore", levelId: "l9", reward: 0, condition: "进入 Level 9" },
  { id: "farm_life", title: "农田生活", category: "explore", levelId: "l10", reward: 0, condition: "进入 Level 10" },
  { id: "all_roads_to_11", title: "条条大路通11", category: "explore", levelId: "l11", reward: 0, condition: "进入 Level 11" },
  { id: "cold_buildings", title: "冰冷楼宇", category: "explore", levelId: "l13", reward: 0, condition: "进入 Level 13" },
  { id: "sweet_heaven", title: "美好的天堂", category: "explore", levelId: "l14", reward: 0, condition: "进入 Level 14（本层级极难逃生）" },
  { id: "choose_door", title: "选择你的门", category: "explore", levelId: "l21", reward: 0, condition: "进入 Level 21" },
  { id: "beach_holiday", title: "沙滩度假", category: "explore", levelId: "l48", reward: 0, condition: "进入 Level 48" },
  { id: "painting", title: "画", category: "explore", levelId: "l57", reward: 0, condition: "进入 Level 57" },
  { id: "have_fun", title: "尽情欢乐吧", category: "explore", levelId: "l283", reward: 0, condition: "进入 Level 283" },

  // —— 二、合集成就（隐藏）——
  {
    id: "wanderer_trail",
    title: "漫游者足迹",
    category: "set",
    hidden: true,
    reward: 30,
    condition: "通关 Level 0–14（排除 5、12）全部主线层级",
  },
  {
    id: "off_mainline",
    title: "偏离主线",
    category: "set",
    hidden: true,
    reward: 45,
    condition: "通关 / 存活子层级：0.2、0.3、1.1、6.1",
  },
  {
    id: "distant_lost",
    title: "远方的迷途者",
    category: "set",
    hidden: true,
    reward: 25,
    condition: "通关 Level 21、48、57、283",
  },
  {
    id: "veteran_explorer",
    title: "探险老手",
    category: "set",
    hidden: true,
    reward: 50,
    condition: "完成漫游者足迹 + 偏离主线 + 远方的迷途者",
  },

  // —— 三、危险遭遇成就（隐藏）——
  {
    id: "near_death",
    title: "九死一生",
    category: "danger",
    hidden: true,
    reward: 30,
    condition: "血量掉到 15 点及以下，仍然存活逃离当前层级",
  },
  {
    id: "sanity_edge",
    title: "理智摇摇欲坠",
    category: "danger",
    hidden: true,
    reward: 35,
    condition: "理智掉到 15 点及以下，存活逃离当前层级",
  },
  {
    id: "soy_binge",
    title: "豆奶狂饮",
    category: "danger",
    hidden: true,
    reward: 100,
    condition: "在 1 分钟内喝过幸运豆奶、草莓、香蕉三种豆奶",
  },
  {
    id: "unlucky_home",
    title: "倒霉到家",
    category: "danger",
    hidden: true,
    reward: 40,
    condition: "喝下幸运豆奶触发倒霉状态",
  },
  {
    id: "lucky_favor",
    title: "幸运眷顾",
    category: "danger",
    hidden: true,
    reward: 100,
    condition: "喝下幸运豆奶触发幸运状态，完成一次保险库十连抽",
  },

  // —— 四、道具 & 交易保险库成就（隐藏）——
  {
    id: "stockpile",
    title: "物资储备",
    category: "vault",
    hidden: true,
    reward: 15,
    condition: "背包同时持有：杏仁水、火盐、皇家口粮各至少 2 个",
  },
  {
    id: "vault_visitor",
    title: "金库访客",
    category: "vault",
    hidden: true,
    reward: 35,
    condition: "第一次使用交易保险库抽卡",
  },
  {
    id: "gambler",
    title: "赌徒",
    category: "vault",
    hidden: true,
    reward: 45,
    condition: "在保险库抽到【后室轮盘赌】",
  },
  {
    id: "tool_expert",
    title: "工具专家",
    category: "vault",
    hidden: true,
    reward: 0,
    condition: "获得一次性查看工具",
  },
  {
    id: "ration_rich",
    title: "口粮富足",
    category: "vault",
    hidden: true,
    reward: 20,
    condition: "同时拥有最小、中等两种皇家口粮",
  },
  {
    id: "soy_collector",
    title: "豆奶收藏家",
    category: "vault",
    hidden: true,
    reward: 50,
    condition: "背包同时集齐三款豆奶：幸运、草莓、香蕉",
  },
  {
    id: "unlucky_streak",
    title: "非酋本色",
    category: "vault",
    hidden: true,
    reward: 30,
    condition: "连续 10 次保险库抽卡，没有抽到任何豆奶 / 轮盘赌",
  },
  {
    id: "lucky_burst",
    title: "欧气迸发",
    category: "vault",
    hidden: true,
    reward: 70,
    condition: "一次十连，同时出轮盘赌 + 任意一款豆奶",
  },
];

/** 主线通关判定：Level 0–14 排除 5、12 */
const MAINLINE_LEVELS = [
  "l0",
  "l1",
  "l2",
  "l3",
  "l4",
  "l6",
  "l7",
  "l8",
  "l9",
  "l10",
  "l11",
  "l13",
  "l14",
];
const SUB_LEVELS = ["0.2", "0.3", "l1.1", "l6_1"];
const FAR_LEVELS = ["l21", "l48", "l57", "l283"];

function getAchievementDef(id) {
  for (var i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
    if (ACHIEVEMENT_DEFS[i].id === id) return ACHIEVEMENT_DEFS[i];
  }
  return null;
}

export function getTaskDef(id) {
  for (var i = 0; i < TASK_DEFS.length; i++) {
    if (TASK_DEFS[i].id === id) return TASK_DEFS[i];
  }
  return null;
}

function readIds(key) {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (id) {
      return typeof id === "string";
    });
  } catch (err) {
    return [];
  }
}

function writeIds(key, ids) {
  try {
    sessionStorage.setItem(key, JSON.stringify(ids));
  } catch (err) {
    /* ignore */
  }
}

function readMap(key) {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    return {};
  }
}

function writeMap(key, map) {
  try {
    sessionStorage.setItem(key, JSON.stringify(map || {}));
  } catch (err) {
    /* ignore */
  }
}

function readFlag(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch (err) {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch (err) {
    /* ignore */
  }
}

function hasVisitedAll(list) {
  var visited = readIds(VISITED_KEY);
  for (var i = 0; i < list.length; i++) {
    if (visited.indexOf(list[i]) < 0) return false;
  }
  return true;
}

function defaultToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 3400 });
}

export function getAcceptedTaskIds() {
  return readIds(ACCEPTED_KEY);
}

export function getCompletedTaskIds() {
  return readIds(COMPLETED_KEY);
}

export function getDeliveredTaskIds() {
  return readIds(DELIVERED_KEY);
}

/** 枢纽按本局已发现的层级动态生成对应大门。 */
export function getVisitedLevelIds() {
  return readIds(VISITED_KEY);
}

export function isTaskAccepted(id) {
  return getAcceptedTaskIds().indexOf(id) >= 0;
}

export function isTaskCompleted(id) {
  return getCompletedTaskIds().indexOf(id) >= 0;
}

export function isTaskDelivered(id) {
  return getDeliveredTaskIds().indexOf(id) >= 0;
}

/** 在目的地交出包裹，进入“回 L4 领赏”状态。 */
export function deliverPackageTask(id) {
  var task = getTaskDef(id);
  if (!task) return { ok: false, reason: "没有这个任务" };
  if (!isTaskAccepted(id)) return { ok: false, reason: "你还没有接取这个任务" };
  if (isTaskCompleted(id)) return { ok: false, reason: "这个任务已经完成了" };
  if (isTaskDelivered(id)) return { ok: false, reason: "包裹已经交付，回 Level 4 领赏吧" };
  if (countItem(task.packageId) < 1 || !removeFirstItem(task.packageId)) {
    return { ok: false, reason: "你没有携带对应包裹" };
  }
  var delivered = getDeliveredTaskIds();
  delivered.push(id);
  writeIds(DELIVERED_KEY, delivered);
  renderTaskPanel();
  return { ok: true, task: task };
}

/** 回到 L4 向 M.E.G 成员结算任务并发放积分。 */
export function claimTaskReward(id) {
  var task = getTaskDef(id);
  if (!task) return { ok: false, reason: "没有这个任务" };
  if (!isTaskDelivered(id)) return { ok: false, reason: "任务还没有交付" };
  if (isTaskCompleted(id)) return { ok: false, reason: "奖励已经领取" };
  var completed = getCompletedTaskIds();
  completed.push(id);
  writeIds(COMPLETED_KEY, completed);
  addMegPoints(task.reward);
  clearTaskDeadline(id);
  clearReconProgress(id);
  if (task.deviceId) {
    while (countItem(task.deviceId) > 0) {
      if (!removeFirstItem(task.deviceId)) break;
    }
  }
  renderTaskPanel();
  return { ok: true, task: task, reward: task.reward };
}

export function getFirstDeliveredUnclaimedTask() {
  var delivered = getDeliveredTaskIds();
  for (var i = 0; i < delivered.length; i++) {
    if (!isTaskCompleted(delivered[i])) return getTaskDef(delivered[i]);
  }
  return null;
}

export function getUnlockedAchievementIds() {
  return readIds(ACHIEVEMENTS_KEY);
}

/**
 * 解锁成就；已解锁则返回 false。
 * 有奖励积分时自动入账；可选 toast 回调。
 */
export function unlockAchievement(id, onToast) {
  var def = getAchievementDef(id);
  if (!def) return false;
  var ids = getUnlockedAchievementIds();
  if (ids.indexOf(id) >= 0) return false;
  ids.push(id);
  writeIds(ACHIEVEMENTS_KEY, ids);
  var toast = typeof onToast === "function" ? onToast : defaultToast;
  var msg = "成就解锁：" + def.title;
  if (def.reward > 0) {
    addMegPoints(def.reward);
    msg += " · +" + def.reward + " 积分";
  }
  toast(msg);
  renderTaskPanel();
  if (
    id === "wanderer_trail" ||
    id === "off_mainline" ||
    id === "distant_lost"
  ) {
    maybeUnlockSetMaster(toast);
  }
  return true;
}

function maybeUnlockSetAchievements(onToast) {
  if (hasVisitedAll(MAINLINE_LEVELS)) {
    unlockAchievement("wanderer_trail", onToast);
  }
  if (hasVisitedAll(SUB_LEVELS)) {
    unlockAchievement("off_mainline", onToast);
  }
  if (hasVisitedAll(FAR_LEVELS)) {
    unlockAchievement("distant_lost", onToast);
  }
  maybeUnlockSetMaster(onToast);
}

function maybeUnlockSetMaster(onToast) {
  var got = getUnlockedAchievementIds();
  if (
    got.indexOf("wanderer_trail") >= 0 &&
    got.indexOf("off_mainline") >= 0 &&
    got.indexOf("distant_lost") >= 0
  ) {
    unlockAchievement("veteran_explorer", onToast);
  }
}

function recordVisit(levelId) {
  if (!levelId) return;
  var ids = readIds(VISITED_KEY);
  if (ids.indexOf(levelId) >= 0) return;
  ids.push(levelId);
  writeIds(VISITED_KEY, ids);
}

/**
 * 进入某层级：记录通关进度、解锁探索成就、刷新合集；
 * 并清空本层「濒死」标记，开始新的逃离判定窗口。
 */
export function markLevelEntered(levelId, onToast) {
  writeFlag(CRIT_HP_KEY, false);
  writeFlag(CRIT_SAN_KEY, false);
  recordVisit(levelId);
  // 每次踏进 Level 4 才重掷稀有委托是否挂在任务板上。
  if (levelId === "l4") rollRareBoardOffers();

  var def = null;
  for (var i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
    if (ACHIEVEMENT_DEFS[i].levelId === levelId) {
      def = ACHIEVEMENT_DEFS[i];
      break;
    }
  }
  if (def) unlockAchievement(def.id, onToast);
  maybeUnlockSetAchievements(onToast);
}

/**
 * 存活逃离当前层级（切到其他层级前调用）。
 * 死亡回城 / 同页续令牌请传 noEscape。
 */
export function markLevelEscaped(onToast) {
  if (readFlag(CRIT_HP_KEY)) {
    unlockAchievement("near_death", onToast);
  }
  if (readFlag(CRIT_SAN_KEY)) {
    unlockAchievement("sanity_edge", onToast);
  }
  writeFlag(CRIT_HP_KEY, false);
  writeFlag(CRIT_SAN_KEY, false);
}

/** 生存循环里调用：血量 / 理智 ≤15 时打上本层濒死标记 */
export function noteCriticalVitals(hp, sanity) {
  if (hp != null && hp <= 15 && hp > 0) writeFlag(CRIT_HP_KEY, true);
  if (sanity != null && sanity <= 15 && sanity > 0) writeFlag(CRIT_SAN_KEY, true);
}

/**
 * 饮用豆奶。kind: "lucky" | "strawberry" | "banana"
 * 一分钟内三种齐 → 豆奶狂饮。
 */
export function noteSoyMilkDrunk(kind, onToast) {
  if (kind !== "lucky" && kind !== "strawberry" && kind !== "banana") return;
  var map = {};
  try {
    map = JSON.parse(sessionStorage.getItem(SOY_DRINKS_KEY) || "{}") || {};
  } catch (err) {
    map = {};
  }
  var now = Date.now();
  map[kind] = now;
  var keys = ["lucky", "strawberry", "banana"];
  var i;
  for (i = 0; i < keys.length; i++) {
    if (map[keys[i]] && now - map[keys[i]] > SOY_BINGE_WINDOW_MS) {
      delete map[keys[i]];
    }
  }
  try {
    sessionStorage.setItem(SOY_DRINKS_KEY, JSON.stringify(map));
  } catch (err2) {
    /* ignore */
  }
  if (map.lucky && map.strawberry && map.banana) {
    var times = [map.lucky, map.strawberry, map.banana];
    var min = Math.min.apply(null, times);
    var max = Math.max.apply(null, times);
    if (max - min <= SOY_BINGE_WINDOW_MS) {
      unlockAchievement("soy_binge", onToast);
    }
  }
}

/**
 * 幸运豆奶（保险库款）结果：lucky / unlucky / none
 */
export function noteLuckySoyMilkOutcome(outcome, onToast) {
  if (outcome === "unlucky") {
    unlockAchievement("unlucky_home", onToast);
    writeFlag(LUCKY_TEN_PENDING_KEY, false);
    return;
  }
  if (outcome === "lucky") {
    writeFlag(LUCKY_TEN_PENDING_KEY, true);
  }
}

/** 保险库十连抽完成：若正处于幸运豆奶的幸运状态，解锁幸运眷顾 */
export function noteVaultTenPull(onToast) {
  if (!readFlag(LUCKY_TEN_PENDING_KEY)) return;
  if (unlockAchievement("lucky_favor", onToast)) {
    writeFlag(LUCKY_TEN_PENDING_KEY, false);
  }
}

function countAny(ids) {
  var n = 0;
  for (var i = 0; i < ids.length; i++) n += countItem(ids[i]);
  return n;
}

function readDryStreak() {
  try {
    var n = parseInt(sessionStorage.getItem(VAULT_DRY_KEY) || "0", 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch (err) {
    return 0;
  }
}

function writeDryStreak(n) {
  try {
    sessionStorage.setItem(VAULT_DRY_KEY, String(Math.max(0, n | 0)));
  } catch (err) {
    /* ignore */
  }
}

function isVaultSoy(id) {
  return VAULT_SOY_IDS.indexOf(id) >= 0;
}

function isVaultRare(id) {
  return VAULT_RARE_IDS.indexOf(id) >= 0;
}

/**
 * 背包内容变化后检查持有类成就。
 * 由 inventory.addItem 通过 window 钩子调用，避免循环 import。
 */
export function checkItemAchievements(onToast) {
  if (countItem("archive_c11") >= 1) {
    unlockAchievement("tool_expert", onToast);
  }
  if (
    countItem("almond_water") >= 2 &&
    countItem("fire_salt") >= 2 &&
    countItem("royal_rations") >= 2
  ) {
    unlockAchievement("stockpile", onToast);
  }
  if (countItem("royal_rations") >= 1 && countItem("royal_rations_medium") >= 1) {
    unlockAchievement("ration_rich", onToast);
  }
  var hasLucky =
    countAny(["lucky_soy_milk", "lucky_soy_milk_cold", "lucky_soy_milk_hot"]) >= 1;
  var hasStrawberry =
    countAny(["strawberry_soy_milk", "strawberry_lucky_soy_milk"]) >= 1;
  var hasBanana = countAny(["banana_soy_milk", "banana_lucky_soy_milk"]) >= 1;
  if (hasLucky && hasStrawberry && hasBanana) {
    unlockAchievement("soy_collector", onToast);
  }
}

/**
 * 保险库一次抽卡结果（单抽或十连的 rolls 数组）。
 * @param {object[]} rolls
 * @param {number} pulls
 */
export function noteVaultDraw(rolls, pulls, onToast) {
  if (!rolls || !rolls.length) return;
  unlockAchievement("vault_visitor", onToast);

  var dry = readDryStreak();
  var hasRoulette = false;
  var hasSoy = false;
  var i;
  for (i = 0; i < rolls.length; i++) {
    var id = rolls[i] && rolls[i].id;
    if (!id) continue;
    if (id === "roulette") {
      hasRoulette = true;
      unlockAchievement("gambler", onToast);
    }
    if (isVaultSoy(id)) hasSoy = true;
    if (isVaultRare(id)) dry = 0;
    else dry += 1;
  }
  writeDryStreak(dry);
  if (dry >= VAULT_DRY_LIMIT) {
    unlockAchievement("unlucky_streak", onToast);
  }
  if (pulls === 10 && hasRoulette && hasSoy) {
    unlockAchievement("lucky_burst", onToast);
  }
  // 十连幸运眷顾仍由 noteVaultTenPull 负责；这里不重复。
}

/** 任务板要等 M.E.G 成员同意后才挂到墙上 */
export function isTaskBoardUnlocked() {
  try {
    return sessionStorage.getItem(BOARD_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function unlockTaskBoard() {
  try {
    sessionStorage.setItem(BOARD_KEY, "1");
  } catch (err) {
    /* ignore */
  }
}

/**
 * 接取任务：写入状态并把待运送包裹放进背包。
 * @returns {{ ok: boolean, reason?: string, task?: object }}
 */
export function acceptTask(id) {
  var task = getTaskDef(id);
  if (!task) return { ok: false, reason: "没有这个任务" };
  if (isTaskAccepted(id)) return { ok: false, reason: "这个任务已经接取了" };
  if (isTaskCompleted(id)) return { ok: false, reason: "这个任务已经完成了" };
  // 包裹类要放入待运送包裹，侦查类要发下记录设备；地图类无需道具。
  if (task.packageId) {
    if (!addItem({ id: task.packageId, name: task.packageName })) {
      return { ok: false, reason: "背包和快捷栏已满，放不下包裹" };
    }
  }
  if (task.deviceId) {
    if (!addItem({ id: task.deviceId, name: task.deviceName })) {
      return { ok: false, reason: "背包和快捷栏已满，放不下" + task.deviceName };
    }
  }
  var ids = getAcceptedTaskIds();
  ids.push(id);
  writeIds(ACCEPTED_KEY, ids);
  clearReconProgress(id);
  if (task.timeLimitMs > 0) setTaskDeadline(id, task.timeLimitMs);
  else clearTaskDeadline(id);
  return { ok: true, task: task };
}

/** 在 Level 21 按 Q 绘制地图，进入「回 L4 交付」状态。 */
export function deliverMapTask(id) {
  var task = getTaskDef(id);
  if (!task || task.type !== "map") return { ok: false, reason: "没有这个任务" };
  if (!isTaskAccepted(id)) return { ok: false, reason: "你还没有接取这个任务" };
  if (isTaskCompleted(id)) return { ok: false, reason: "这个任务已经完成了" };
  if (isTaskDelivered(id)) {
    return { ok: false, reason: "地图已经绘制好了，回 Level 4 交付吧" };
  }
  var delivered = getDeliveredTaskIds();
  delivered.push(id);
  writeIds(DELIVERED_KEY, delivered);
  renderTaskPanel();
  return { ok: true, task: task };
}

/* ------------------------------ 稀有委托挂出 ------------------------------ */

/**
 * 稀有委托每次进入 Level 4 重掷一次是否挂上任务板；
 * 已接取但没完成的稀有委托始终保留在板上。
 */
function rollRareBoardOffers() {
  var offers = [];
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (!task.rare) continue;
    if (isTaskCompleted(task.id)) continue;
    if (isTaskAccepted(task.id) || isTaskDelivered(task.id)) {
      offers.push(task.id);
      continue;
    }
    var chance = task.offerChance == null ? 0.15 : task.offerChance;
    if (Math.random() < chance) offers.push(task.id);
  }
  writeIds(BOARD_OFFERS_KEY, offers);
}

function isTaskOnBoard(task) {
  if (!task.rare) return true;
  if (isTaskAccepted(task.id) || isTaskDelivered(task.id) || isTaskCompleted(task.id)) {
    return true;
  }
  return readIds(BOARD_OFFERS_KEY).indexOf(task.id) >= 0;
}

/* ---------------------------- 限时任务与侦查记录 ---------------------------- */

function setTaskDeadline(id, ms) {
  var map = readMap(DEADLINE_KEY);
  map[id] = Date.now() + Math.max(0, ms);
  writeMap(DEADLINE_KEY, map);
}

function clearTaskDeadline(id) {
  var map = readMap(DEADLINE_KEY);
  if (map[id] == null) return;
  delete map[id];
  writeMap(DEADLINE_KEY, map);
}

/** @returns {number | null} 无限时任务返回 null */
export function getTaskDeadlineRemainingMs(id) {
  var map = readMap(DEADLINE_KEY);
  var until = map[id];
  if (typeof until !== "number" || !Number.isFinite(until)) return null;
  return Math.max(0, until - Date.now());
}

function readReconProgress(id) {
  var map = readMap(RECON_KEY);
  var list = map[id];
  if (!Array.isArray(list)) return [];
  return list.filter(function (k) {
    return typeof k === "string";
  });
}

function writeReconProgress(id, list) {
  var map = readMap(RECON_KEY);
  map[id] = list;
  writeMap(RECON_KEY, map);
}

function clearReconProgress(id) {
  var map = readMap(RECON_KEY);
  if (map[id] == null) return;
  delete map[id];
  writeMap(RECON_KEY, map);
}

export function getReconProgress(id) {
  var task = getTaskDef(id);
  return {
    count: readReconProgress(id).length,
    target: task && task.reconTarget ? task.reconTarget : 0,
  };
}

/**
 * 在侦查层级记录一个目标（如一个井盖）。同一目标重复记录不计数。
 * 记满目标数即视为「已交付」，回 Level 4 领赏。
 * @param {string} id 任务 id
 * @param {string} targetKey 目标唯一标识
 */
export function recordReconSighting(id, targetKey) {
  var task = getTaskDef(id);
  if (!task || task.type !== "recon") return { ok: false, reason: "没有这个任务" };
  if (!isTaskAccepted(id)) return { ok: false, reason: "你还没有接取这个任务" };
  if (isTaskCompleted(id)) return { ok: false, reason: "这个任务已经完成了" };
  if (isTaskDelivered(id)) {
    return { ok: false, reason: "数据已经采集齐了，立刻撤离并回 Level 4 交付" };
  }
  if (task.deviceId && countItem(task.deviceId) < 1) {
    return { ok: false, reason: "你没有携带" + task.deviceName };
  }
  var list = readReconProgress(id);
  if (list.indexOf(targetKey) >= 0) {
    return { ok: false, reason: "这个目标已经记录过了，换一个" };
  }
  list.push(targetKey);
  writeReconProgress(id, list);
  var target = task.reconTarget || 0;
  if (list.length < target) {
    renderTaskPanel();
    return { ok: true, task: task, count: list.length, target: target, done: false };
  }
  // 采集完成：进入「回 L4 领赏」状态，同时停止限时倒计时。
  var delivered = getDeliveredTaskIds();
  if (delivered.indexOf(id) < 0) {
    delivered.push(id);
    writeIds(DELIVERED_KEY, delivered);
  }
  clearTaskDeadline(id);
  renderTaskPanel();
  return { ok: true, task: task, count: list.length, target: target, done: true };
}

function failTask(task, reasonText, onToast) {
  var toast = typeof onToast === "function" ? onToast : defaultToast;
  if (task.packageId) {
    while (countItem(task.packageId) > 0) {
      if (!removeFirstItem(task.packageId)) break;
    }
  }
  if (task.deviceId) {
    while (countItem(task.deviceId) > 0) {
      if (!removeFirstItem(task.deviceId)) break;
    }
  }
  var accepted = getAcceptedTaskIds();
  var ai = accepted.indexOf(task.id);
  if (ai >= 0) {
    accepted.splice(ai, 1);
    writeIds(ACCEPTED_KEY, accepted);
  }
  var delivered = getDeliveredTaskIds();
  var di = delivered.indexOf(task.id);
  if (di >= 0) {
    delivered.splice(di, 1);
    writeIds(DELIVERED_KEY, delivered);
  }
  clearTaskDeadline(task.id);
  clearReconProgress(task.id);
  var penalty = task.deathPenalty || 0;
  if (penalty > 0) addMegPoints(-penalty);
  toast(
    "任务失败：" +
      task.title +
      (reasonText ? "（" + reasonText + "）" : "") +
      (penalty > 0 ? " · -" + penalty + " 积分" : "")
  );
  renderTaskPanel();
}

/**
 * C-1293 等极端环境损毁任务道具。
 * 每个携带实体任务物品的未完成任务独立判定；损毁即按该任务失败规则扣分。
 * @returns {string[]} 被判定失败的任务 id
 */
export function damageCarriedTaskItems(chance, onToast) {
  var probability = Math.max(0, Math.min(1, Number(chance) || 0));
  var accepted = getAcceptedTaskIds().slice();
  var failed = [];
  for (var i = 0; i < accepted.length; i++) {
    var task = getTaskDef(accepted[i]);
    if (!task || isTaskCompleted(task.id)) continue;
    var itemId = task.packageId || task.deviceId;
    if (!itemId || countItem(itemId) < 1) continue;
    if (Math.random() >= probability) continue;
    failTask(task, "任务道具被风暴撕毁", onToast);
    failed.push(task.id);
  }
  return failed;
}

let nextDeadlineCheckAt = 0;

/**
 * 限时任务超时结算。由生存循环每帧调用，内部按秒节流。
 */
export function checkTaskDeadlines(onToast) {
  var now = Date.now();
  if (now < nextDeadlineCheckAt) return;
  nextDeadlineCheckAt = now + 1000;
  var map = readMap(DEADLINE_KEY);
  var ids = Object.keys(map);
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var until = map[id];
    if (typeof until !== "number" || !Number.isFinite(until)) {
      clearTaskDeadline(id);
      continue;
    }
    if (now < until) continue;
    var task = getTaskDef(id);
    if (!task || !isTaskAccepted(id) || isTaskCompleted(id)) {
      clearTaskDeadline(id);
      continue;
    }
    failTask(task, "超时", onToast);
  }
}

/**
 * 死亡结算：包裹类任务失败（移除任务与包裹、扣分）；地图类作废其绘制进度（可重绘）。
 */
export function failTasksOnDeath(onToast) {
  var accepted = getAcceptedTaskIds();
  if (!accepted.length) return;
  var toast = typeof onToast === "function" ? onToast : defaultToast;
  var remaining = accepted.slice();
  var delivered = getDeliveredTaskIds();
  var changed = false;
  for (var i = 0; i < accepted.length; i++) {
    var id = accepted[i];
    if (isTaskCompleted(id)) continue;
    var task = getTaskDef(id);
    if (!task) continue;
    if (task.type === "map") {
      var di = delivered.indexOf(id);
      if (di >= 0) {
        delivered.splice(di, 1);
        changed = true;
        toast("你在死亡中弄丢了「" + task.title + "」的成果，需要重新绘制。");
      }
      continue;
    }
    if (task.type === "recon") {
      // 侦查类：死亡直接判定失败（含已采集完但还没交付的情况）。
      failTask(task, "侦查员死亡", toast);
      remaining = getAcceptedTaskIds();
      delivered = getDeliveredTaskIds();
      continue;
    }
    // 包裹类：中途死亡视为失败。
    while (task.packageId && countItem(task.packageId) > 0) {
      if (!removeFirstItem(task.packageId)) break;
    }
    var ai = remaining.indexOf(id);
    if (ai >= 0) remaining.splice(ai, 1);
    var ddi = delivered.indexOf(id);
    if (ddi >= 0) delivered.splice(ddi, 1);
    var penalty = task.deathPenalty || 0;
    if (penalty > 0) addMegPoints(-penalty);
    changed = true;
    toast(
      "任务失败：" + task.title + (penalty > 0 ? " · -" + penalty + " 积分" : "")
    );
  }
  if (changed) {
    writeIds(ACCEPTED_KEY, remaining);
    writeIds(DELIVERED_KEY, delivered);
    renderTaskPanel();
  }
}

/* ------------------------------ 白板任务面板 ------------------------------ */

const STYLE_HREF = "css/backrooms-tasks.css?v=2";
let stylesReady = false;

/** 没有在 HTML 里手动引入样式的关卡，这里补上 */
function ensureStyles() {
  if (stylesReady) return;
  stylesReady = true;
  var links = document.querySelectorAll('link[rel="stylesheet"]');
  for (var i = 0; i < links.length; i++) {
    if ((links[i].getAttribute("href") || "").indexOf("backrooms-tasks.css") >= 0) return;
  }
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

let boardEl = null;
let boardOpen = false;
/** @type {null | string} */
let boardSelectedId = null;
/** @type {null | (msg: string) => void} */
let boardToast = null;

function formatRemaining(ms) {
  var total = Math.max(0, Math.ceil(ms / 1000));
  var mm = Math.floor(total / 60);
  var ss = total % 60;
  return mm + ":" + (ss < 10 ? "0" + ss : String(ss));
}

/** Y 面板里单个任务的进度描述 */
function taskProgressText(task) {
  if (isTaskCompleted(task.id)) return "已完成";
  if (isTaskDelivered(task.id)) return "已交付 · 回 Level 4 找 M.E.G 成员领赏";
  var text;
  if (task.type === "recon") {
    var p = getReconProgress(task.id);
    text = "进行中 · 已记录 " + p.count + " / " + p.target;
  } else if (task.type === "map") {
    text = "进行中 · 前往 Level 21 按 Q 绘制";
  } else {
    text = "进行中 · 携带" + (task.packageName || task.deviceName || "任务物品");
  }
  var left = getTaskDeadlineRemainingMs(task.id);
  if (left != null) text += " · 剩余 " + formatRemaining(left);
  return text;
}

function taskStatusLabel(task) {
  if (isTaskCompleted(task.id)) return "已完成";
  if (isTaskDelivered(task.id)) return "已交付 · 回 Level 4 领赏";
  if (isTaskAccepted(task.id)) return "已接取";
  return "可接取";
}

function renderBoard(note) {
  if (!boardEl) return;
  var listHtml = "";
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (!isTaskOnBoard(task)) continue;
    var taken = isTaskAccepted(task.id) || isTaskCompleted(task.id);
    var selected = boardSelectedId === task.id;
    listHtml +=
      '<li class="br-board__task' +
      (selected ? " br-board__task--selected" : "") +
      (taken ? " br-board__task--taken" : "") +
      '" data-task="' +
      task.id +
      '">' +
      '<p class="br-board__task-head">' +
      '<span class="br-board__task-title">' +
      (task.rare ? "★ " : "") +
      task.title +
      "</span>" +
      '<span class="br-board__task-reward">' +
      task.reward +
      " 积分</span>" +
      "</p>" +
      '<p class="br-board__task-desc">' +
      task.desc +
      "</p>" +
      '<p class="br-board__task-state">' +
      taskStatusLabel(task) +
      "</p>" +
      (selected && !taken
        ? '<p class="br-board__confirm">确定接取？按 <kbd>A</kbd> 确认</p>'
        : "") +
      "</li>";
  }
  boardEl.querySelector(".br-board__list").innerHTML = listHtml;
  var noteEl = boardEl.querySelector(".br-board__note");
  noteEl.textContent = note || "";
  noteEl.hidden = !note;
}

function ensureBoardDom() {
  if (boardEl) return boardEl;
  ensureStyles();
  boardEl = document.createElement("div");
  boardEl.id = "backroomsTaskBoard";
  boardEl.className = "br-board";
  boardEl.hidden = true;
  boardEl.setAttribute("role", "dialog");
  boardEl.setAttribute("aria-label", "M.E.G 任务板");
  boardEl.innerHTML =
    '<div class="br-board__sheet">' +
    '<p class="br-board__title">M.E.G · 任务板</p>' +
    '<ul class="br-board__list"></ul>' +
    '<p class="br-board__note" hidden></p>' +
    '<p class="br-board__foot">单击任务查看 · <kbd>A</kbd> 接取 · <kbd>Q</kbd> / <kbd>Esc</kbd> 离开</p>' +
    "</div>";
  document.body.appendChild(boardEl);

  boardEl.querySelector(".br-board__list").addEventListener("click", function (e) {
    var li = e.target.closest("[data-task]");
    if (!li) return;
    boardSelectedId = li.getAttribute("data-task");
    renderBoard("");
  });
  return boardEl;
}

export function openTaskBoard(options) {
  options = options || {};
  boardToast = typeof options.onToast === "function" ? options.onToast : null;
  ensureBoardDom();
  boardOpen = true;
  boardSelectedId = null;
  boardEl.hidden = false;
  document.body.classList.add("backrooms-taskui-open");
  renderBoard("");
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

export function closeTaskBoard() {
  boardOpen = false;
  boardSelectedId = null;
  if (boardEl) boardEl.hidden = true;
  if (!isTaskPanelOpen()) document.body.classList.remove("backrooms-taskui-open");
}

export function isTaskBoardOpen() {
  return boardOpen;
}

function confirmBoardSelection() {
  if (!boardSelectedId) {
    renderBoard("先单击一个任务。");
    return;
  }
  var result = acceptTask(boardSelectedId);
  if (!result.ok) {
    renderBoard(result.reason || "接取失败");
    return;
  }
  boardSelectedId = null;
  var gained = result.task.packageName || result.task.deviceName;
  var msg = "已接取：" + result.task.title + (gained ? " · 获得" + gained : "");
  if (result.task.timeLimitMs > 0) {
    msg += " · 限时 " + Math.round(result.task.timeLimitMs / 60000) + " 分钟";
  }
  renderBoard(msg);
  if (boardToast) boardToast(msg);
  renderTaskPanel();
}

/* --------------------------- Y 键成就 / 任务面板 --------------------------- */

let panelEl = null;
let panelOpen = false;
/** "task" | "achievement" */
let panelView = "task";
/** 打开某个成就的条件详情页时记录其 id，否则为 null */
let achDetailId = null;

function renderTaskPanel() {
  if (!panelEl) return;
  var toggle = panelEl.querySelector(".br-tasks__toggle");
  var titleEl = panelEl.querySelector(".br-tasks__title");
  var listEl = panelEl.querySelector(".br-tasks__list");

  // 成就条件详情页：左上角按钮变成叉，点它退出详情。
  if (panelView === "achievement" && achDetailId) {
    var def = getAchievementDef(achDetailId);
    var done = def && getUnlockedAchievementIds().indexOf(def.id) >= 0;
    toggle.textContent = "✕";
    toggle.classList.add("br-tasks__toggle--close");
    titleEl.textContent = def ? def.title : "成就";
    listEl.innerHTML = def
      ? '<li class="br-tasks__row' +
        (done ? " br-tasks__row--gold" : "") +
        '">' +
        '<p class="br-tasks__row-head"><span>解锁条件</span>' +
        (def.reward ? '<span class="br-tasks__reward">' + def.reward + " 积分</span>" : "") +
        "</p>" +
        '<p class="br-tasks__row-desc">' +
        def.condition +
        "</p>" +
        '<p class="br-tasks__row-state">' +
        (done ? "已完成" : "未完成") +
        "</p>" +
        "</li>"
      : '<li class="br-tasks__empty">找不到该成就。</li>';
    return;
  }

  toggle.classList.remove("br-tasks__toggle--close");
  // 左上角按钮显示的是“可切换过去的那一栏”
  toggle.textContent = panelView === "task" ? "成就" : "任务";
  titleEl.textContent = panelView === "task" ? "已接取的任务" : "成就";

  var html = "";
  var i;
  if (panelView === "task") {
    var accepted = getAcceptedTaskIds();
    for (i = 0; i < accepted.length; i++) {
      var task = getTaskDef(accepted[i]);
      if (!task) continue;
      html +=
        '<li class="br-tasks__row">' +
        '<p class="br-tasks__row-head"><span>' +
        task.title +
        '</span><span class="br-tasks__reward">' +
        task.reward +
        " 积分</span></p>" +
        '<p class="br-tasks__row-desc">' +
        task.desc +
        "</p>" +
        '<p class="br-tasks__row-state">' +
        taskProgressText(task) +
        "</p>" +
        "</li>";
    }
    if (!html) html = '<li class="br-tasks__empty">还没有接取任何任务。</li>';
  } else {
    // 探索成就常显；合集 / 危险遭遇未解锁时隐藏。
    var unlocked = getUnlockedAchievementIds();
    for (i = 0; i < ACHIEVEMENT_DEFS.length; i++) {
      var a = ACHIEVEMENT_DEFS[i];
      var got = unlocked.indexOf(a.id) >= 0;
      if (a.hidden && !got) continue;
      html +=
        '<li class="br-tasks__ach' +
        (got ? " br-tasks__ach--gold" : " br-tasks__ach--locked") +
        '" data-ach="' +
        a.id +
        '">' +
        '<span class="br-tasks__ach-name">' +
        a.title +
        "</span>" +
        '<span class="br-tasks__ach-tag">' +
        (got ? "已完成" : "未完成") +
        "</span>" +
        "</li>";
    }
  }
  listEl.innerHTML = html;
}

function ensurePanelDom() {
  if (panelEl) return panelEl;
  ensureStyles();
  panelEl = document.createElement("div");
  panelEl.id = "backroomsTaskPanel";
  panelEl.className = "br-tasks";
  panelEl.hidden = true;
  panelEl.setAttribute("role", "dialog");
  panelEl.setAttribute("aria-label", "成就与任务");
  panelEl.innerHTML =
    '<div class="br-tasks__sheet">' +
    '<button type="button" class="br-tasks__toggle">成就</button>' +
    '<p class="br-tasks__title">已接取的任务</p>' +
    '<ul class="br-tasks__list"></ul>' +
    '<p class="br-tasks__foot"><kbd>Y</kbd> / <kbd>Esc</kbd> 关闭 · 左上角按钮切换 / 返回</p>' +
    "</div>";
  document.body.appendChild(panelEl);
  panelEl.querySelector(".br-tasks__toggle").addEventListener("click", function () {
    if (panelView === "achievement" && achDetailId) {
      // 详情页 → 退回成就列表
      achDetailId = null;
    } else {
      panelView = panelView === "task" ? "achievement" : "task";
      achDetailId = null;
    }
    renderTaskPanel();
  });
  panelEl.querySelector(".br-tasks__list").addEventListener("click", function (e) {
    var li = e.target.closest("[data-ach]");
    if (!li || panelView !== "achievement") return;
    achDetailId = li.getAttribute("data-ach");
    renderTaskPanel();
  });
  return panelEl;
}

export function openTaskPanel() {
  ensurePanelDom();
  panelOpen = true;
  achDetailId = null;
  panelEl.hidden = false;
  document.body.classList.add("backrooms-taskui-open");
  renderTaskPanel();
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

export function closeTaskPanel() {
  panelOpen = false;
  if (panelEl) panelEl.hidden = true;
  if (!boardOpen) document.body.classList.remove("backrooms-taskui-open");
}

export function isTaskPanelOpen() {
  return panelOpen;
}

export function isTaskUiOpen() {
  return boardOpen || panelOpen;
}

/**
 * 任务 UI 的键盘处理，交给关卡的 onKeyDown 优先调用。
 * @returns {boolean} 是否已消费该按键
 */
export function handleTaskUiKey(e) {
  if (e.repeat) return false;
  if (boardOpen) {
    if (e.code === "KeyA") {
      confirmBoardSelection();
      return true;
    }
    if (e.code === "Escape" || e.code === "KeyQ") {
      closeTaskBoard();
      return true;
    }
    return true;
  }
  if (panelOpen) {
    if (e.code === "Escape" && panelView === "achievement" && achDetailId) {
      achDetailId = null;
      renderTaskPanel();
      return true;
    }
    if (e.code === "KeyY" || e.code === "Escape") {
      closeTaskPanel();
      return true;
    }
    return true;
  }
  if (e.code === "KeyY") {
    openTaskPanel();
    return true;
  }
  return false;
}

// 背包入包后检查持有类成就（inventory 通过此钩子回调，避免循环依赖）
try {
  window.__backroomsOnItemAdded = function () {
    checkItemAchievements();
  };
} catch (err) {
  /* ignore */
}

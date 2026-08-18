/**
 * M.E.G 任务与成就：任务板数据、接取状态、成就解锁，以及白板 / Y 面板两套 UI。
 */
import { addItem, countItem, removeFirstItem } from "./backrooms-inventory.js";
import { addMegPoints, getMegPoints } from "./backrooms-meg-points.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";
import { grantItemListOrStore } from "./backrooms-base-storage.js?v=4";

const ACCEPTED_KEY = "backrooms_tasks_accepted_v1";
const COMPLETED_KEY = "backrooms_tasks_completed_v1";
const DELIVERED_KEY = "backrooms_tasks_delivered_v1";
const EVER_DONE_KEY = "backrooms_tasks_ever_done_v1";
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
/** 任务板当前挂出的委托 id 列表 */
const BOARD_OFFERS_KEY = "backrooms_task_board_offers_v1";
/** 按间隔刷新的委托上次掷点时间：{ [taskId]: epochMs } */
const BOARD_OFFER_ROLLS_KEY = "backrooms_task_board_offer_rolls_v1";
/** 各任务本周期内已完成次数：{ [taskId]: number } */
const COMPLETE_COUNTS_KEY = "backrooms_task_complete_counts_v1";
/** 各任务冷却截止：{ [taskId]: epochMs } */
const COOLDOWN_UNTIL_KEY = "backrooms_task_cooldown_until_v1";
/** 饮水机「已检修」标签到期：{ [coolerId]: epochMs } */
const COOLER_INSPECTED_KEY = "backrooms_l4_cooler_inspected_v1";
/** 巡检任务本轮已检饮水机：{ [taskId]: string[] } */
const INSPECT_PROGRESS_KEY = "backrooms_task_inspect_progress_v1";
/** 「断粮巡航」成就：本次断粮连续过程中已到访的路线层级 */
const FASTING_KEY = "backrooms_ach_fasting_v1";

/** 同时进行中的任务上限（已接取未领赏） */
const MAX_ACTIVE_TASKS = 4;
/** 花积分主动重掷任务板挂出 */
export const BOARD_REROLL_COST = 20;
/** 饮水机「已检修」标签持续时长 */
export const COOLER_INSPECTED_MS = 10 * 60 * 1000;

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
    offerChance: 0.8,
    refresh: "enter",
    completeLimit: 3,
    cooldownMs: 5 * 60 * 1000,
    desc: "把这件包裹送到 Level 1 的 M.E.G 基地。接取后背包里会出现待运送的包裹。中途死亡视为任务失败，扣 10 积分。完成 3 次后冷却 5 分钟。",
  },
  {
    id: "map_l21",
    title: "绘制 Level 21 地图",
    reward: 30,
    type: "map",
    drawLevelId: "l21",
    offerChance: 0.7,
    refresh: "enter",
    completeLimit: 2,
    cooldownMs: 5 * 60 * 1000,
    desc: "前往 Level 21，按 E 绘制地图，再回 Level 4 交付。若中途死亡，可重新绘制。完成 2 次后冷却 5 分钟。",
  },
  {
    id: "recon_c1291",
    title: "死区侦查记录｜井盖迷阵",
    reward: 260,
    type: "recon",
    rare: true,
    offerChance: 0.4,
    refresh: "interval",
    refreshIntervalMs: 3 * 60 * 1000,
    deviceId: "meg_recorder",
    deviceName: "M.E.G 特制记录设备",
    reconLevelId: "c1291",
    reconTarget: 3,
    deathPenalty: 50,
    timeLimitMs: 30 * 60 * 1000,
    completeLimit: 1,
    cooldownMs: 45 * 60 * 1000,
    desc:
      "极高风险委托。携带 M.E.G 特制记录设备进入 Level C-1291 井盖迷阵（死区），" +
      "对 3 个不同的井盖按 E 拍摄弹射与虚空井口现象，采集完立刻撤离，禁止长时间停留。" +
      "限时 30 分钟，死亡或超时判定失败并扣 50 积分。完成 1 次后冷却 45 分钟。",
  },
  {
    id: "inspect_coolers",
    title: "Level 4 饮水机巡检",
    reward: 5,
    type: "inspect",
    inspectTarget: 2,
    offerChance: 0.9,
    refresh: "enter",
    completeLimit: 4,
    cooldownMs: 5 * 60 * 1000,
    desc:
      "在 Level 4 任意办公区对 2 台饮水机按 E 完成巡检即可领赏，前哨站和外围办公室的饮水机都算。" +
      "同一台饮水机在本轮内只能检一次，本轮领赏后标签立即清除。" +
      "无失败惩罚。完成 4 次后冷却 5 分钟。",
  },
  {
    id: "map_l13",
    title: "绘制 Level 13 楼层平面",
    reward: 25,
    type: "map",
    drawLevelId: "l13",
    offerChance: 0.55,
    refresh: "enter",
    completeLimit: 2,
    cooldownMs: 5 * 60 * 1000,
    desc: "前往 Level 13，按 E 绘制楼层平面，再回 Level 4 交付。若中途死亡，可重新绘制。完成 2 次后冷却 5 分钟。",
  },
  {
    id: "rubbing_c1290",
    title: "C-1290 拓片",
    reward: 100,
    type: "recon",
    rare: true,
    offerChance: 0.3,
    refresh: "interval",
    refreshIntervalMs: 5 * 60 * 1000,
    reconLevelId: "c1290",
    reconTarget: 3,
    deathPenalty: 40,
    completeLimit: 1,
    cooldownMs: 35 * 60 * 1000,
    desc:
      "极高风险委托。进入 Level C-1290 夕前石茧，趁石化尚未过半，对 3 块石碑各按 E 拓印碑文，" +
      "拓满后立刻撤离并回 Level 4 领赏。石化满（化为雕像）或中途死亡判定失败并扣 40 积分。" +
      "完成 1 次后冷却 35 分钟。",
  },
  {
    id: "docs_c1292",
    title: "C-1292 实验档案回收",
    reward: 120,
    type: "recon",
    rare: true,
    offerChance: 0.35,
    refresh: "interval",
    refreshIntervalMs: 5 * 60 * 1000,
    reconLevelId: "c1292",
    reconTarget: 3,
    deathPenalty: 30,
    completeLimit: 1,
    cooldownMs: 40 * 60 * 1000,
    desc:
      "可选高风险委托。进入 Level C-1292「项目：衰退瘾」，在档案室、观测室、主控机房各按 E 阅读一份 UEC 实验文档。" +
      "阅读会加重衰退瘾侵蚀（倒霉翻倍、幸运减半）。集齐三份后立刻撤离，回 Level 4 领赏。" +
      "中途死亡判定失败并扣 30 积分。完成 1 次后冷却 40 分钟。",
  },
  {
    id: "sample_c144_collapse",
    title: "塌楼灾情取样",
    reward: 55,
    type: "recon",
    rare: true,
    offerChance: 0.4,
    refresh: "interval",
    refreshIntervalMs: 5 * 60 * 1000,
    deviceId: "sample_can_c144",
    deviceName: "M.E.G 采样罐",
    reconLevelId: "c144",
    reconTarget: 2,
    deathPenalty: 25,
    timeLimitMs: 25 * 60 * 1000,
    completeLimit: 2,
    cooldownMs: 30 * 60 * 1000,
    desc:
      "中高风险委托。携带采样罐进入 Level C-144 和爱社区，在社区度过一夜后塌楼开始，" +
      "对 2 处正在倒塌或已塌的建筑残墟按 E 取样，回 Level 4 领赏。" +
      "限时 25 分钟；死亡或采样罐损毁判定失败并扣 25 积分。完成 2 次后冷却 30 分钟。",
  },
  {
    id: "recon_c144_mutant",
    title: "变异肢团活动周期记录",
    reward: 80,
    type: "recon",
    rare: true,
    offerChance: 0.3,
    refresh: "interval",
    refreshIntervalMs: 5 * 60 * 1000,
    deviceId: "meg_recorder",
    deviceName: "M.E.G 特制记录设备",
    reconLevelId: "c144",
    reconTarget: 2,
    deathPenalty: 35,
    timeLimitMs: 20 * 60 * 1000,
    completeLimit: 2,
    cooldownMs: 35 * 60 * 1000,
    desc:
      "高风险侦查。携带记录仪进入 Level C-144，待一夜过后变异肢团出没，" +
      "分别在其「活动」与「休息」阶段靠近它们各按 E 记录一次（共 2 次），回 Level 4 领赏。" +
      "限时 20 分钟；死亡或记录仪损毁判定失败并扣 35 积分。完成 2 次后冷却 35 分钟。",
  },
  {
    id: "loop_c192",
    title: "封闭森林回路确认",
    reward: 40,
    type: "recon",
    offerChance: 0.4,
    refresh: "enter",
    reconLevelId: "c192",
    reconTarget: 1,
    deathPenalty: 15,
    completeLimit: 3,
    cooldownMs: 15 * 60 * 1000,
    desc:
      "进入 Level C-192 封闭森林后不要立刻切树离开，在林内停留满 90 秒再按 E 完成回路确认，" +
      "随后可切树去 Level 48 或自行撤离，回 Level 4 领赏。" +
      "中途死亡判定失败并扣 15 积分。完成 3 次后冷却 15 分钟。",
  },
  {
    id: "sample_c1299_fog",
    title: "汤雾样本采集",
    reward: 220,
    type: "recon",
    offerChance: 0.75,
    refresh: "enter",
    deviceId: "sample_can_c1299",
    deviceName: "密封采样罐",
    reconLevelId: "c1299",
    reconTarget: 1,
    deferDeliver: true,
    deathPenalty: 60,
    completeLimit: 1,
    cooldownMs: 30 * 60 * 1000,
    rewardItems: [{ id: "lucky_soy_milk", name: "幸运豆奶", count: 1 }],
    desc:
      "普通难度。携带密封采样罐进入 Level C-1299，在漂浮中靠近浓密白雾按 E 采样一份汤雾，" +
      "采样罐不能被高温损毁，带着样本抵达黑石浮石撤离。熬煮进度满即死亡，无额外计时。" +
      "奖励 220 积分 + 幸运豆奶 ×1。失败（死亡 / 采样罐损毁）扣 60 积分。上限 1 次，冷却 30 分钟。",
  },
  {
    id: "beacon_c1299",
    title: "标记空间坐标",
    reward: 420,
    type: "recon",
    rare: true,
    offerChance: 0.75,
    refresh: "enter",
    deviceId: "beacon_c1299",
    deviceName: "微型定位信标",
    deviceCount: 3,
    reconLevelId: "c1299",
    reconTarget: 3,
    deferDeliver: true,
    deathPenalty: 120,
    completeLimit: 1,
    cooldownMs: 30 * 60 * 1000,
    rewardItems: [
      { id: "almond_water", name: "杏仁水", count: 2 },
      { id: "lucky_soy_milk", name: "幸运豆奶", count: 2 },
      { id: "strawberry_soy_milk", name: "草莓豆奶", count: 1 },
    ],
    desc:
      "高风险。任务发放 3 枚微型定位信标。在 C-1299 漂浮中向三处不同方位各投放一枚（靠近投放点按 E），" +
      "三枚全部部署且不能被汤雾摧毁，活着抵达黑石撤离。漂浮难控，停留越久熬煮越快。" +
      "奖励 420 积分 + 杏仁水×2 + 幸运豆奶×2 + 草莓豆奶×1。失败扣 120 积分。上限 1 次，冷却 30 分钟。",
  },
  {
    id: "pages_c1299",
    title: "高危调查：解读飘流残页",
    reward: 550,
    type: "recon",
    rare: true,
    offerChance: 1,
    refresh: "enter",
    alwaysOfferWhenUnlocked: true,
    requiresEverCompleted: ["sample_c1299_fog", "beacon_c1299"],
    requireEverCount: 2,
    // 领赏进入冷却后清空前置「曾完成」标记，下次需重新完成汤雾采样与信标任务。
    resetPrereqsOnCooldown: true,
    reconLevelId: "c1299",
    reconTarget: 4,
    deferDeliver: true,
    fragileItemIds: ["scrap_page_c1299"],
    deathPenalty: 160,
    completeLimit: 1,
    cooldownMs: 60 * 60 * 1000,
    rewardItems: [
      { id: "level_key_l14", name: "层级密钥 · Level 14", count: 1 },
      { id: "almond_water", name: "杏仁水", count: 5 },
      { id: "lucky_soy_milk", name: "幸运豆奶", count: 2 },
      { id: "strawberry_soy_milk", name: "草莓豆奶", count: 2 },
      { id: "banana_soy_milk", name: "香蕉豆奶", count: 2 },
      { id: "fire_salt", name: "小块可爆炸火盐", count: 3 },
    ],
    desc:
      "极限任务（需先完成「汤雾样本采集」与「标记空间坐标」后才会挂出）。" +
      "在 C-1299 汤雾中搜寻拾取 4 份漂浮残页，残页不能被烧蚀，携带全部残页成功撤离。" +
      "中途阅读残页会加快熬煮进度——请带回 Level 4 再查阅。" +
      "奖励 550 保险库积分 + 层级密钥(L14) + 大量补给。失败扣 160 积分。" +
      "上限 1 次，冷却 60 分钟；冷却开始后前置重置，下次须再次完成上述两项任务。",
  },
];

/**
 * 成就定义。
 * category: explore=探索(常显) | set=合集(隐藏) | danger=危险遭遇(隐藏)
 * hidden: true 时未解锁不显示
 * levelId: 探索成就绑定的进入层级
 */
export const ACHIEVEMENT_DEFS = [
  // —— 〇、挑战成就（常显）——
  {
    id: "fasting_cruise",
    title: "断粮巡航",
    category: "challenge",
    reward: 75,
    condition:
      "一段旅程中全程不吃不喝，到访 Level 4 → 6.1 → 11 → 119 → 0 → 1 → 1.1-1 → 1.1-2 → 2 → 3，" +
      "最后返回 Level 4 即解锁。期间进食 / 饮用任何物品或死亡都会中断，需要重新开始。" +
      "做此挑战期间（走到 L2 前），Level 2 的普通门必定通往 Level 3。",
  },

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

/** 任务道具 id 集合：包裹 / 设备 / 易损采集物。奖励补给不算。 */
var taskPropIdSet = null;
function getTaskPropIdSet() {
  if (taskPropIdSet) return taskPropIdSet;
  taskPropIdSet = Object.create(null);
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var t = TASK_DEFS[i];
    if (t.packageId) taskPropIdSet[t.packageId] = true;
    if (t.deviceId) taskPropIdSet[t.deviceId] = true;
    if (t.fragileItemIds) {
      for (var f = 0; f < t.fragileItemIds.length; f++) {
        if (t.fragileItemIds[f]) taskPropIdSet[t.fragileItemIds[f]] = true;
      }
    }
  }
  return taskPropIdSet;
}

/** 是否为接取/执行任务用的实体道具（不可进基地寄存柜）。 */
export function isTaskPropItem(itemId) {
  return !!(itemId && getTaskPropIdSet()[itemId]);
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

export function getEverDoneTaskIds() {
  return readIds(EVER_DONE_KEY);
}

export function hasEverCompletedTask(id) {
  return getEverDoneTaskIds().indexOf(id) >= 0;
}

function markTaskEverDone(id) {
  var ids = getEverDoneTaskIds();
  if (ids.indexOf(id) >= 0) return;
  ids.push(id);
  writeIds(EVER_DONE_KEY, ids);
}

/** 清空「曾完成」标记（用于冷却后重置前置链）。 */
function clearTasksEverDone(taskIds) {
  if (!taskIds || !taskIds.length) return;
  var ids = getEverDoneTaskIds().slice();
  var changed = false;
  for (var i = 0; i < taskIds.length; i++) {
    var idx = ids.indexOf(taskIds[i]);
    if (idx >= 0) {
      ids.splice(idx, 1);
      changed = true;
    }
  }
  if (changed) writeIds(EVER_DONE_KEY, ids);
}

/**
 * 领赏进入冷却时，若任务声明了 resetPrereqsOnCooldown，
 * 清掉前置任务的 ever-done，下次须重新完成前置才会再挂出。
 */
function resetPrereqsOnCooldownIfNeeded(task) {
  if (!task || !task.resetPrereqsOnCooldown) return;
  if (!task.requiresEverCompleted || !task.requiresEverCompleted.length) return;
  clearTasksEverDone(task.requiresEverCompleted);
}

function taskPrereqsMet(task) {
  if (!task || !task.requiresEverCompleted || !task.requiresEverCompleted.length) {
    return true;
  }
  var need = task.requireEverCount > 0 ? task.requireEverCount : task.requiresEverCompleted.length;
  var got = 0;
  for (var i = 0; i < task.requiresEverCompleted.length; i++) {
    if (hasEverCompletedTask(task.requiresEverCompleted[i])) got++;
  }
  return got >= need;
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

/** 回到 L4 向 M.E.G 成员结算任务并发放积分。可重复接取的任务领赏后会清掉接取状态并计入次数上限。 */
export function claimTaskReward(id) {
  var task = getTaskDef(id);
  if (!task) return { ok: false, reason: "没有这个任务" };
  if (!isTaskDelivered(id)) return { ok: false, reason: "任务还没有交付" };
  // 有次数上限的可重复任务不走永久完成标记；旧存档若残留 completed 也不应卡死领赏。
  if (!(task.completeLimit > 0) && isTaskCompleted(id)) {
    return { ok: false, reason: "奖励已经领取" };
  }

  addMegPoints(task.reward);
  clearTaskDeadline(id);
  clearReconProgress(id);
  clearInspectProgress(id);
  if (task.deviceId) {
    while (countItem(task.deviceId) > 0) {
      if (!removeFirstItem(task.deviceId)) break;
    }
  }
  if (task.fragileItemIds) {
    for (var fi = 0; fi < task.fragileItemIds.length; fi++) {
      var fid = task.fragileItemIds[fi];
      while (countItem(fid) > 0) {
        if (!removeFirstItem(fid)) break;
      }
    }
  }

  var rewardGrant = { stored: 0, failed: 0 };
  if (task.rewardItems && task.rewardItems.length) {
    rewardGrant = grantItemListOrStore(task.rewardItems, defaultToast);
  }
  markTaskEverDone(id);

  // 可重复任务：领赏后从接取/交付列表移除，计入完成次数；达上限则进入冷却。
  var accepted = getAcceptedTaskIds();
  var ai = accepted.indexOf(id);
  if (ai >= 0) {
    accepted.splice(ai, 1);
    writeIds(ACCEPTED_KEY, accepted);
  }
  var delivered = getDeliveredTaskIds();
  var di = delivered.indexOf(id);
  if (di >= 0) {
    delivered.splice(di, 1);
    writeIds(DELIVERED_KEY, delivered);
  }
  // 永久完成标记仅用于非重复旧逻辑兼容；有次数上限的任务不写入，并清掉旧残留。
  if (task.completeLimit > 0) {
    var completedRepeat = getCompletedTaskIds();
    var ci = completedRepeat.indexOf(id);
    if (ci >= 0) {
      completedRepeat.splice(ci, 1);
      writeIds(COMPLETED_KEY, completedRepeat);
    }
  } else {
    var completed = getCompletedTaskIds();
    if (completed.indexOf(id) < 0) {
      completed.push(id);
      writeIds(COMPLETED_KEY, completed);
    }
  }
  var cooldownNote = noteTaskCompletion(id);
  publishNewlyUnlockedTasks();
  renderTaskPanel();
  if (boardOpen) renderBoard("");
  return {
    ok: true,
    task: task,
    reward: task.reward,
    cooldownNote: cooldownNote,
    stored: rewardGrant.stored,
  };
}

/**
 * 刚领赏可能满足了某个前置解锁任务的条件。
 * 这类任务标了 alwaysOfferWhenUnlocked，立刻挂上白板，
 * 否则要等玩家离开再进 Level 4 才会刷出来。
 */
function publishNewlyUnlockedTasks() {
  var offers = readIds(BOARD_OFFERS_KEY).slice();
  var changed = false;
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (!task.alwaysOfferWhenUnlocked) continue;
    if (!task.requiresEverCompleted || !task.requiresEverCompleted.length) continue;
    if (!taskPrereqsMet(task) || isTaskCooling(task.id)) continue;
    if (offers.indexOf(task.id) >= 0) continue;
    setOfferPresent(offers, task.id, true);
    changed = true;
  }
  if (changed) writeIds(BOARD_OFFERS_KEY, offers);
}

export function getFirstDeliveredUnclaimedTask() {
  var delivered = getDeliveredTaskIds();
  for (var i = 0; i < delivered.length; i++) {
    var task = getTaskDef(delivered[i]);
    if (!task) continue;
    // 可重复任务不看永久完成标记。
    if (task.completeLimit > 0 || !isTaskCompleted(delivered[i])) return task;
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

/* ------------------------------ 断粮巡航成就 ------------------------------ */

const FASTING_ACH_ID = "fasting_cruise";
/** 需要在一次断粮过程中全部到访的层级 */
const FASTING_ROUTE = [
  "l4",
  "l6_1",
  "l11",
  "l119",
  "l0",
  "l1",
  "l1.1",
  "l1.1-2",
  "l2",
  "l3",
];
/** 走到 L2 之前应当到访的层级 —— 用于判定 L2 门是否强制通往 L3 */
const FASTING_PRE_L2 = ["l4", "l6_1", "l11", "l119", "l0", "l1", "l1.1", "l1.1-2"];

function isFastingUnlocked() {
  return getUnlockedAchievementIds().indexOf(FASTING_ACH_ID) >= 0;
}

/** 进入路线层级时记录（非路线层级不影响，也不会打断连续性）。 */
function recordFastingVisit(levelId) {
  if (isFastingUnlocked()) return;
  if (FASTING_ROUTE.indexOf(levelId) < 0) return;
  var visited = readIds(FASTING_KEY);
  if (visited.indexOf(levelId) >= 0) return;
  visited.push(levelId);
  writeIds(FASTING_KEY, visited);
}

/** 回到 L4 且路线全部到访 → 解锁并清空进度。 */
function maybeCompleteFasting(onToast) {
  if (isFastingUnlocked()) return;
  var visited = readIds(FASTING_KEY);
  for (var i = 0; i < FASTING_ROUTE.length; i++) {
    if (visited.indexOf(FASTING_ROUTE[i]) < 0) return;
  }
  unlockAchievement(FASTING_ACH_ID, onToast);
  writeIds(FASTING_KEY, []);
}

/** 进食 / 饮用 / 死亡时打断断粮连续性。 */
export function noteFastingBroken() {
  if (isFastingUnlocked()) return;
  if (!readIds(FASTING_KEY).length) return;
  writeIds(FASTING_KEY, []);
}

/**
 * 断粮巡航是否已进行到「即将进入 L2」的阶段 —— 此时 L2 普通门必定通往 L3。
 * 供 Level 2 门逻辑调用。
 */
export function isFastingRunActive() {
  if (isFastingUnlocked()) return false;
  var visited = readIds(FASTING_KEY);
  for (var i = 0; i < FASTING_PRE_L2.length; i++) {
    if (visited.indexOf(FASTING_PRE_L2[i]) < 0) return false;
  }
  return true;
}

/**
 * 进入某层级：记录通关进度、解锁探索成就、刷新合集；
 * 并清空本层「濒死」标记，开始新的逃离判定窗口。
 */
export function markLevelEntered(levelId, onToast) {
  writeFlag(CRIT_HP_KEY, false);
  writeFlag(CRIT_SAN_KEY, false);
  recordVisit(levelId);
  recordFastingVisit(levelId);
  // 每次踏进 Level 4：重掷「进层刷新」的委托；间隔类委托另行计时。
  if (levelId === "l4") {
    // 有次数上限的任务视为可重复：清掉旧的永久完成标记，避免卡死接取。
    var completed = getCompletedTaskIds().filter(function (id) {
      var t = getTaskDef(id);
      return !(t && t.completeLimit > 0);
    });
    writeIds(COMPLETED_KEY, completed);
    rollEnterBoardOffers();
    refreshIntervalBoardOffers();
    maybeCompleteFasting(onToast);
  }

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
  // 可重复任务忽略永久完成标记（与领赏逻辑一致）。
  if (!(task.completeLimit > 0) && isTaskCompleted(id)) {
    return { ok: false, reason: "这个任务已经完成了" };
  }
  if (isTaskCooling(id)) {
    return {
      ok: false,
      reason: "该任务冷却中，还剩 " + formatRemaining(getTaskCooldownRemainingMs(id)),
    };
  }
  // 上一轮已交付但没领赏时先去领，否则重新接取会卡在「已经完成」状态。
  if (isTaskDelivered(id)) {
    return { ok: false, reason: "上一轮奖励还没领，先找 M.E.G 成员领赏" };
  }
  if (!isTaskOnBoard(task)) return { ok: false, reason: "白板上没有这个委托" };
  if (!taskPrereqsMet(task)) {
    return { ok: false, reason: "尚未满足前置条件，无法接取" };
  }
  if (countActiveTasks() >= MAX_ACTIVE_TASKS) {
    return { ok: false, reason: "手头任务已满（最多同时 " + MAX_ACTIVE_TASKS + " 个）" };
  }
  // 包裹类要放入待运送包裹，侦查类要发下记录设备；地图/巡检类无需道具。
  if (task.packageId) {
    if (!addItem({ id: task.packageId, name: task.packageName })) {
      return { ok: false, reason: "背包和快捷栏已满，放不下包裹" };
    }
  }
  if (task.deviceId) {
    // 任务设备必须随身携带，不能进寄存柜；背包满则拒接。
    var deviceCount = task.deviceCount > 0 ? task.deviceCount : 1;
    var granted = 0;
    for (var di = 0; di < deviceCount; di++) {
      if (addItem({ id: task.deviceId, name: task.deviceName || task.deviceId })) {
        granted++;
      } else {
        break;
      }
    }
    if (granted < deviceCount) {
      for (var ri = 0; ri < granted; ri++) removeFirstItem(task.deviceId);
      if (task.packageId) removeFirstItem(task.packageId);
      return {
        ok: false,
        reason: "背包和快捷栏已满，放不下全部" + (task.deviceName || "任务设备"),
      };
    }
  }
  if (task.grantItems && task.grantItems.length) {
    var g = grantItemListOrStore(task.grantItems, defaultToast);
    if (g.failed > 0) {
      return { ok: false, reason: "背包与寄存柜都满了，无法接取" };
    }
  }
  var ids = getAcceptedTaskIds();
  ids.push(id);
  writeIds(ACCEPTED_KEY, ids);
  clearReconProgress(id);
  clearInspectProgress(id);
  if (task.timeLimitMs > 0) setTaskDeadline(id, task.timeLimitMs);
  else clearTaskDeadline(id);
  return { ok: true, task: task };
}

/** 在指定层级按 E 绘制地图，进入「回 L4 交付」状态。 */
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

/* ------------------------------ 任务板挂出 ------------------------------ */

function taskOfferChance(task) {
  if (task.offerChance == null) return 1;
  return task.offerChance;
}

function taskRefreshMode(task) {
  return task.refresh === "interval" ? "interval" : "enter";
}

function countActiveTasks() {
  return getAcceptedTaskIds().length;
}

export function isTaskCooling(id) {
  pruneExpiredCooldowns();
  var map = readMap(COOLDOWN_UNTIL_KEY);
  var until = map[id];
  return typeof until === "number" && Number.isFinite(until) && Date.now() < until;
}

export function getTaskCooldownRemainingMs(id) {
  if (!isTaskCooling(id)) return null;
  var until = readMap(COOLDOWN_UNTIL_KEY)[id];
  return Math.max(0, until - Date.now());
}

function pruneExpiredCooldowns() {
  var map = readMap(COOLDOWN_UNTIL_KEY);
  var now = Date.now();
  var changed = false;
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var until = map[keys[i]];
    if (typeof until !== "number" || !Number.isFinite(until) || now >= until) {
      delete map[keys[i]];
      changed = true;
    }
  }
  if (changed) writeMap(COOLDOWN_UNTIL_KEY, map);
}

/**
 * 领赏后计入完成次数；达到 completeLimit 则进入冷却并清零计数。
 * @returns {string} 可选提示文案
 */
function noteTaskCompletion(id) {
  var task = getTaskDef(id);
  if (!task || !(task.completeLimit > 0)) return "";
  var counts = readMap(COMPLETE_COUNTS_KEY);
  var n = (typeof counts[id] === "number" ? counts[id] : 0) + 1;
  if (n >= task.completeLimit) {
    counts[id] = 0;
    writeMap(COMPLETE_COUNTS_KEY, counts);
    var cd = task.cooldownMs > 0 ? task.cooldownMs : 5 * 60 * 1000;
    var untilMap = readMap(COOLDOWN_UNTIL_KEY);
    untilMap[id] = Date.now() + cd;
    writeMap(COOLDOWN_UNTIL_KEY, untilMap);
    var offers = readIds(BOARD_OFFERS_KEY).slice();
    setOfferPresent(offers, id, false);
    writeIds(BOARD_OFFERS_KEY, offers);
    resetPrereqsOnCooldownIfNeeded(task);
    return "已达次数上限，冷却 " + Math.round(cd / 60000) + " 分钟";
  }
  counts[id] = n;
  writeMap(COMPLETE_COUNTS_KEY, counts);
  var left = task.completeLimit - n;
  return left > 0 ? "本周期还可完成 " + left + " 次" : "";
}

function shouldKeepOffer(task) {
  return isTaskAccepted(task.id) || isTaskDelivered(task.id);
}

function rollOfferOnce(task) {
  if (shouldKeepOffer(task)) return true;
  if (isTaskCooling(task.id)) return false;
  if (!taskPrereqsMet(task)) return false;
  if (task.alwaysOfferWhenUnlocked && taskPrereqsMet(task)) return true;
  return Math.random() < taskOfferChance(task);
}

function setOfferPresent(offers, taskId, present) {
  var idx = offers.indexOf(taskId);
  if (present && idx < 0) offers.push(taskId);
  if (!present && idx >= 0) offers.splice(idx, 1);
}

function isHighDifficultyTask(task) {
  return !!(task && task.rare);
}

/** 当前挂出里是否已有高难度（★）委托。 */
function boardHasHighDifficulty(offers) {
  for (var i = 0; i < offers.length; i++) {
    if (isHighDifficultyTask(getTaskDef(offers[i]))) return true;
  }
  return false;
}

/**
 * 保底：若板上没有任何高难度任务，从可挂出的 ★ 任务里随机塞一个。
 * 冷却中 / 前置未满足的不参与；无可塞时保持原样。
 */
function ensureHighDifficultyPity(offers) {
  if (boardHasHighDifficulty(offers)) return;
  for (var k = 0; k < TASK_DEFS.length; k++) {
    var kept = TASK_DEFS[k];
    if (isHighDifficultyTask(kept) && shouldKeepOffer(kept)) {
      setOfferPresent(offers, kept.id, true);
      return;
    }
  }
  var pool = [];
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (!isHighDifficultyTask(task)) continue;
    if (isTaskCooling(task.id)) continue;
    if (!taskPrereqsMet(task)) continue;
    if (offers.indexOf(task.id) >= 0) continue;
    pool.push(task);
  }
  if (!pool.length) return;
  var pick = pool[Math.floor(Math.random() * pool.length)];
  setOfferPresent(offers, pick.id, true);
}

/**
 * 每次进入 Level 4 重掷「进层刷新」委托；间隔类委托的挂出状态保留不动。
 * 已接取 / 已交付的委托始终保留在板上；冷却中的不挂出。
 */
function rollEnterBoardOffers() {
  var offers = readIds(BOARD_OFFERS_KEY).slice();
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (taskRefreshMode(task) !== "enter") continue;
    if (shouldKeepOffer(task)) {
      setOfferPresent(offers, task.id, true);
      continue;
    }
    if (isTaskCooling(task.id)) {
      setOfferPresent(offers, task.id, false);
      continue;
    }
    setOfferPresent(offers, task.id, rollOfferOnce(task));
  }
  ensureHighDifficultyPity(offers);
  writeIds(BOARD_OFFERS_KEY, offers);
}

/**
 * 按各自间隔重掷「间隔刷新」委托。
 * 若从未掷过，立刻掷一次；之后每隔 refreshIntervalMs 再掷。
 */
function refreshIntervalBoardOffers() {
  var offers = readIds(BOARD_OFFERS_KEY).slice();
  var rolls = readMap(BOARD_OFFER_ROLLS_KEY);
  var now = Date.now();
  var changed = false;
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (taskRefreshMode(task) !== "interval") continue;
    if (shouldKeepOffer(task)) {
      if (offers.indexOf(task.id) < 0) {
        offers.push(task.id);
        changed = true;
      }
      continue;
    }
    if (isTaskCooling(task.id)) {
      if (offers.indexOf(task.id) >= 0) {
        setOfferPresent(offers, task.id, false);
        changed = true;
      }
      continue;
    }
    var interval = task.refreshIntervalMs > 0 ? task.refreshIntervalMs : 3 * 60 * 1000;
    var last = rolls[task.id];
    var due =
      typeof last !== "number" ||
      !Number.isFinite(last) ||
      now - last >= interval;
    if (!due) continue;
    setOfferPresent(offers, task.id, rollOfferOnce(task));
    rolls[task.id] = now;
    changed = true;
  }
  if (!boardHasHighDifficulty(offers)) {
    var before = offers.slice();
    ensureHighDifficultyPity(offers);
    if (offers.length !== before.length || offers.join(",") !== before.join(",")) {
      changed = true;
    }
  }
  if (changed) {
    writeIds(BOARD_OFFERS_KEY, offers);
    writeMap(BOARD_OFFER_ROLLS_KEY, rolls);
    if (boardOpen) renderBoard("");
  }
}

function isTaskOnBoard(task) {
  if (shouldKeepOffer(task)) return true;
  if (isTaskCooling(task.id)) return false;
  if (task.offerChance == null) return true;
  return readIds(BOARD_OFFERS_KEY).indexOf(task.id) >= 0;
}

/**
 * 花积分强制重掷任务板挂出（冷却中的仍不出现；已接取的保留）。
 */
export function rerollBoardOffersWithPoints() {
  if (getMegPoints() < BOARD_REROLL_COST) {
    return { ok: false, reason: "积分不足（需要 " + BOARD_REROLL_COST + "）" };
  }
  addMegPoints(-BOARD_REROLL_COST);
  rollEnterBoardOffers();
  // 间隔类也立刻重掷一次
  var offers = readIds(BOARD_OFFERS_KEY).slice();
  var rolls = readMap(BOARD_OFFER_ROLLS_KEY);
  var now = Date.now();
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (taskRefreshMode(task) !== "interval") continue;
    if (shouldKeepOffer(task)) {
      setOfferPresent(offers, task.id, true);
      continue;
    }
    if (isTaskCooling(task.id)) {
      setOfferPresent(offers, task.id, false);
      continue;
    }
    setOfferPresent(offers, task.id, rollOfferOnce(task));
    rolls[task.id] = now;
  }
  ensureHighDifficultyPity(offers);
  writeIds(BOARD_OFFERS_KEY, offers);
  writeMap(BOARD_OFFER_ROLLS_KEY, rolls);
  if (boardOpen) renderBoard("已花费 " + BOARD_REROLL_COST + " 积分刷新委托。");
  return { ok: true, cost: BOARD_REROLL_COST };
}

/* ---------------------------- 饮水机巡检 ---------------------------- */

function pruneInspectedCoolers() {
  var map = readMap(COOLER_INSPECTED_KEY);
  var now = Date.now();
  var changed = false;
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var until = map[keys[i]];
    if (typeof until !== "number" || !Number.isFinite(until) || now >= until) {
      delete map[keys[i]];
      changed = true;
    }
  }
  if (changed) writeMap(COOLER_INSPECTED_KEY, map);
  return map;
}

export function isCoolerInspected(coolerId) {
  if (!coolerId) return false;
  var map = pruneInspectedCoolers();
  var until = map[coolerId];
  return typeof until === "number" && Date.now() < until;
}

export function getCoolerInspectedRemainingMs(coolerId) {
  if (!isCoolerInspected(coolerId)) return null;
  return Math.max(0, pruneInspectedCoolers()[coolerId] - Date.now());
}

function markCoolerInspectedTag(coolerId) {
  var map = pruneInspectedCoolers();
  map[coolerId] = Date.now() + COOLER_INSPECTED_MS;
  writeMap(COOLER_INSPECTED_KEY, map);
}

/**
 * 本轮领赏后清掉这些饮水机的「已检修」标签。
 * 标签本身有 10 分钟时长，比 completeLimit 的重复节奏长，不清会让后续几轮无机可检。
 */
function clearCoolerInspectedTags(coolerIds) {
  if (!coolerIds || !coolerIds.length) return;
  var map = readMap(COOLER_INSPECTED_KEY);
  var changed = false;
  for (var i = 0; i < coolerIds.length; i++) {
    if (map[coolerIds[i]] != null) {
      delete map[coolerIds[i]];
      changed = true;
    }
  }
  if (changed) writeMap(COOLER_INSPECTED_KEY, map);
}

function readInspectProgress(id) {
  var map = readMap(INSPECT_PROGRESS_KEY);
  var list = map[id];
  return Array.isArray(list) ? list.slice() : [];
}

function writeInspectProgress(id, list) {
  var map = readMap(INSPECT_PROGRESS_KEY);
  map[id] = list;
  writeMap(INSPECT_PROGRESS_KEY, map);
}

function clearInspectProgress(id) {
  var map = readMap(INSPECT_PROGRESS_KEY);
  if (map[id] == null) return;
  delete map[id];
  writeMap(INSPECT_PROGRESS_KEY, map);
}

export function getInspectProgress(id) {
  var task = getTaskDef(id);
  return {
    count: readInspectProgress(id).length,
    target: task && task.inspectTarget ? task.inspectTarget : 0,
  };
}

/**
 * Level 4 对饮水机按 E：记录巡检。检满后自动领赏。
 */
export function recordCoolerInspect(coolerId) {
  var task = getTaskDef("inspect_coolers");
  if (!task) return { ok: false, reason: "没有这个任务" };
  if (!isTaskAccepted(task.id)) return { ok: false, reason: "你还没有接取巡检任务" };
  if (isTaskDelivered(task.id)) {
    return { ok: false, reason: "巡检已经完成，找 M.E.G 成员领赏吧" };
  }
  if (!(task.completeLimit > 0) && isTaskCompleted(task.id)) {
    return { ok: false, reason: "巡检已经完成了" };
  }
  if (!coolerId) return { ok: false, reason: "无效的饮水机" };
  if (isCoolerInspected(coolerId)) {
    var left = getCoolerInspectedRemainingMs(coolerId);
    return {
      ok: false,
      reason:
        "这台饮水机已检修" +
        (left != null ? "（约 " + Math.ceil(left / 60000) + " 分钟后可再检）" : "") +
        " · Level 4 其它办公区的饮水机同样算数",
    };
  }
  var list = readInspectProgress(task.id);
  if (list.indexOf(coolerId) >= 0) {
    return { ok: false, reason: "这台你已经巡检过了，换 Level 4 里另一台" };
  }
  list.push(coolerId);
  writeInspectProgress(task.id, list);
  markCoolerInspectedTag(coolerId);
  var target = task.inspectTarget || 2;
  if (list.length < target) {
    renderTaskPanel();
    return {
      ok: true,
      done: false,
      count: list.length,
      target: target,
      task: task,
    };
  }
  // 检满：标记交付并立刻领赏（本任务无需再找 M.E.G）
  var inspectedThisRound = list.slice();
  var delivered = getDeliveredTaskIds();
  if (delivered.indexOf(task.id) < 0) {
    delivered.push(task.id);
    writeIds(DELIVERED_KEY, delivered);
  }
  var claim = claimTaskReward(task.id);
  if (!claim.ok) {
    // 自动领赏失败时保留「已交付」，可回 M.E.G 成员处手动领取。
    renderTaskPanel();
    return {
      ok: true,
      done: true,
      count: list.length,
      target: target,
      task: task,
      reward: 0,
      claimFailed: true,
      reason: claim.reason || "自动领赏失败，请找 M.E.G 成员领取",
      cooldownNote: "",
    };
  }
  clearCoolerInspectedTags(inspectedThisRound);
  return {
    ok: true,
    done: true,
    count: list.length,
    target: target,
    task: task,
    reward: claim.reward,
    cooldownNote: claim.cooldownNote || "",
  };
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

/** 已记录 / 已拓印的目标标识列表（供关卡显示单个目标是否已完成）。 */
export function getReconRecordedKeys(id) {
  return readReconProgress(id);
}

/**
 * 将 deferDeliver 侦查任务标为已交付（撤离点调用）。
 * @param {string} id
 * @param {{ requireDevice?: boolean, requireFragileCount?: number }} [opts]
 */
export function deliverDeferredReconTask(id, opts) {
  opts = opts || {};
  var task = getTaskDef(id);
  if (!task || task.type !== "recon") return { ok: false, reason: "没有这个任务" };
  if (!isTaskAccepted(id)) return { ok: false, reason: "未接取" };
  if (isTaskCompleted(id)) return { ok: false, reason: "已完成" };
  if (isTaskDelivered(id)) return { ok: true, already: true };
  var prog = getReconProgress(id);
  if (prog.count < prog.target) {
    return { ok: false, reason: "目标尚未完成（" + prog.count + "/" + prog.target + "）" };
  }
  if (opts.requireDevice && task.deviceId && countItem(task.deviceId) < 1) {
    return { ok: false, reason: "缺少" + (task.deviceName || "任务道具") };
  }
  if (opts.requireFragileCount > 0 && task.fragileItemIds && task.fragileItemIds.length) {
    var total = 0;
    for (var i = 0; i < task.fragileItemIds.length; i++) {
      total += countItem(task.fragileItemIds[i]);
    }
    if (total < opts.requireFragileCount) {
      return { ok: false, reason: "携带的残页不足" };
    }
  }
  var delivered = getDeliveredTaskIds();
  if (delivered.indexOf(id) < 0) {
    delivered.push(id);
    writeIds(DELIVERED_KEY, delivered);
  }
  clearTaskDeadline(id);
  renderTaskPanel();
  return { ok: true, task: task };
}

/**
 * 在侦查层级记录一个目标（如一个井盖）。同一目标重复记录不计数。
 * 记满目标数即视为「已交付」，回 Level 4 领赏（除非 deferDeliver）。
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
  if (task.deferDeliver) {
    renderTaskPanel();
    return { ok: true, task: task, count: list.length, target: target, done: true, deferred: true };
  }
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
  if (task.fragileItemIds) {
    for (var fi = 0; fi < task.fragileItemIds.length; fi++) {
      var fid = task.fragileItemIds[fi];
      while (countItem(fid) > 0) {
        if (!removeFirstItem(fid)) break;
      }
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
  clearInspectProgress(task.id);
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
    var itemIds = [];
    if (task.packageId) itemIds.push(task.packageId);
    if (task.deviceId) itemIds.push(task.deviceId);
    if (task.fragileItemIds) {
      for (var f = 0; f < task.fragileItemIds.length; f++) {
        itemIds.push(task.fragileItemIds[f]);
      }
    }
    var holding = false;
    for (var j = 0; j < itemIds.length; j++) {
      if (countItem(itemIds[j]) >= 1) {
        holding = true;
        break;
      }
    }
    if (!holding) continue;
    if (Math.random() >= probability) continue;
    failTask(task, "任务道具被环境损毁", onToast);
    failed.push(task.id);
  }
  return failed;
}

let nextDeadlineCheckAt = 0;

/**
 * 限时任务超时结算，并顺带刷新「间隔挂出」的委托。由生存循环每帧调用，内部按秒节流。
 */
export function checkTaskDeadlines(onToast) {
  var now = Date.now();
  if (now < nextDeadlineCheckAt) return;
  nextDeadlineCheckAt = now + 1000;
  refreshIntervalBoardOffers(false);
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
  // 死亡打断「断粮巡航」连续性（无论有没有接取的任务）。
  noteFastingBroken();
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
    if (task.type === "inspect") {
      // 巡检类：无失败惩罚，死亡不撤销接取与进度。
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

const STYLE_HREF = "css/backrooms-tasks.css?v=3";
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
    var verb = task.reconLevelId === "c1290" ? "已拓印" : "已记录";
    text = "进行中 · " + verb + " " + p.count + " / " + p.target;
  } else if (task.type === "inspect") {
    var ip = getInspectProgress(task.id);
    text = "进行中 · 已巡检 " + ip.count + " / " + ip.target;
  } else if (task.type === "map") {
    var lvl =
      task.drawLevelId === "l13"
        ? "Level 13"
        : task.drawLevelId === "l21"
          ? "Level 21"
          : task.drawLevelId || "目标层级";
    text = "进行中 · 前往 " + lvl + " 按 E 绘制";
  } else {
    text = "进行中 · 携带" + (task.packageName || task.deviceName || "任务物品");
  }
  var left = getTaskDeadlineRemainingMs(task.id);
  if (left != null) text += " · 剩余 " + formatRemaining(left);
  return text;
}

function taskStatusLabel(task) {
  if (isTaskCooling(task.id)) {
    return "冷却中 · 还剩 " + formatRemaining(getTaskCooldownRemainingMs(task.id));
  }
  if (isTaskCompleted(task.id)) return "已完成";
  if (isTaskDelivered(task.id)) return "已交付 · 回 Level 4 领赏";
  if (isTaskAccepted(task.id)) {
    if (task.type === "inspect") {
      var ip = getInspectProgress(task.id);
      return "已接取 · 巡检 " + ip.count + " / " + ip.target;
    }
    return "已接取";
  }
  var counts = readMap(COMPLETE_COUNTS_KEY);
  var n = typeof counts[task.id] === "number" ? counts[task.id] : 0;
  if (task.completeLimit > 0) {
    return "可接取 · 本周期 " + n + " / " + task.completeLimit;
  }
  return "可接取";
}

function renderBoard(note) {
  if (!boardEl) return;
  var listHtml = "";
  var shown = 0;
  for (var i = 0; i < TASK_DEFS.length; i++) {
    var task = TASK_DEFS[i];
    if (!isTaskOnBoard(task)) continue;
    shown += 1;
    var taken = isTaskAccepted(task.id) || isTaskDelivered(task.id);
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
  if (!shown) {
    listHtml =
      '<li class="br-board__empty">当前没有挂出的委托。可按 <kbd>R</kbd> 花费 ' +
      BOARD_REROLL_COST +
      " 积分刷新。</li>";
  }
  boardEl.querySelector(".br-board__list").innerHTML = listHtml;
  var noteEl = boardEl.querySelector(".br-board__note");
  noteEl.textContent = note || "";
  noteEl.hidden = !note;
  var ptsEl = boardEl.querySelector(".br-board__points");
  if (ptsEl) ptsEl.textContent = "当前积分 " + getMegPoints();
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
    '<div class="br-board__head">' +
    '<p class="br-board__title">M.E.G · 任务板</p>' +
    '<p class="br-board__points">当前积分 0</p>' +
    "</div>" +
    '<ul class="br-board__list"></ul>' +
    '<p class="br-board__note" hidden></p>' +
    '<p class="br-board__foot">单击任务 · <kbd>A</kbd> 接取 · <kbd>R</kbd> 花 ' +
    BOARD_REROLL_COST +
    " 积分刷新 · <kbd>E</kbd> / <kbd>Esc</kbd> 离开 · 列表可滚轮下滑</p>" +
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
  if (result.task.type === "inspect") {
    msg += " · 对饮水机按 E 巡检";
  }
  if (result.task.type === "map") {
    msg += " · 目标层按 E 绘制";
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
    if (e.code === "KeyR") {
      var reroll = rerollBoardOffersWithPoints();
      if (!reroll.ok) renderBoard(reroll.reason || "刷新失败");
      else if (boardToast) boardToast("任务板已刷新 · -" + reroll.cost + " 积分");
      return true;
    }
    if (e.code === "Escape" || e.code === "KeyE") {
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

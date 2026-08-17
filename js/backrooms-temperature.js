/**
 * 后室 — 右上角环境温度（各 Level 区间 + 波动）
 */

/**
 * @typedef {{
 *   min: number,
 *   max: number,
 *   base: number,
 *   swing: number,
 *   swing2?: number,
 *   volatile?: boolean,
 * }} TempProfile
 */

/** @type {Record<string | number, TempProfile>} */
const LEVEL_PROFILE = {
  /** 舒适常温 / 室温 18–24°C */
  0: { min: 18, max: 24, base: 21, swing: 2.6 },
  /** 偏凉宜居 15–20°C */
  1: { min: 15, max: 20, base: 17.5, swing: 2.2 },
  /** 蒸汽管道：偏高、波动大，常 40°C+，峰值可达 50°C 以上 */
  2: {
    min: 36,
    max: 52,
    base: 44,
    swing: 6.5,
    swing2: 5,
    volatile: true,
  },
  /** Level 3 — 阴冷潮湿 */
  3: { min: 10, max: 16, base: 13, swing: 2.4 },
  /** Level 283 — 诡谲恒温 */
  283: { min: 19, max: 23, base: 21, swing: 1.8 },
  /** Level 4 — 明亮办公区（稳定日光灯，无 L0 式电流噪） */
  4: { min: 20, max: 24, base: 22, swing: 1.2 },
  /** Level 6 — 伸手不见五指的黑暗空洞 */
  6: { min: 6, max: 11, base: 8.5, swing: 1.1 },
  /** Level 6.1 — 零食货架间 */
  "6.1": { min: 18, max: 23, base: 20.5, swing: 1.2 },
  /** Level 7 — 水上栈道 */
  7: { min: 12, max: 17, base: 14.5, swing: 1.6 },
  /** Level 8 — 阴冷潮湿的巨型洞穴 */
  8: { min: 8, max: 13, base: 10.5, swing: 1.8 },
  /** Level 9 — 明亮的郊区道路 */
  9: { min: 17, max: 23, base: 20, swing: 2 },
  /** Level 10 — 户外田野 */
  10: { min: 16, max: 24, base: 20, swing: 2.8 },
  /** Level 11 — 明亮城市 */
  11: { min: 18, max: 25, base: 21.5, swing: 2.2 },
  /** Level 13 — 酒店大厅与客房走廊 */
  13: { min: 19, max: 23, base: 21, swing: 1.1 },
  /** Level 14 — 红叶树林的黄昏 */
  14: { min: 13, max: 19, base: 16, swing: 2.2 },
  /** Level 16 — 一望无际的冰层，寒风贴着冰面吹 */
  16: { min: -9, max: -2, base: -5.5, swing: 1.9 },
  /** Level 21 — 静谧花园与十字走廊 */
  21: { min: 17, max: 22, base: 19.5, swing: 1.6 },
  /** Level 46 · 黎明 — 温和，不造成环境伤害 */
  "46_dawn": { min: 20, max: 30, base: 25, swing: 3.5, swing2: 1.4 },
  /** Level 46 · 白天 — 极端高温，关卡脚本按 2 HP/秒结算 */
  "46_day": { min: 67, max: 73, base: 70, swing: 2.2, swing2: 1.1 },
  /** Level 46 · 夜晚 — 极端低温，关卡脚本按 2 HP/秒结算 */
  "46_night": { min: -33, max: -27, base: -30, swing: 2.1, swing2: 1 },
  /** 兼容旧存档/旧调用 */
  "46_forest": { min: 20, max: 30, base: 25, swing: 3.5 },
  "46_desert": { min: 67, max: 73, base: 70, swing: 2.2 },
  /** Level 149 — 椰树岛屿，温暖宜人的海风 */
  149: { min: 24, max: 30, base: 27, swing: 2 },
  /** Level 37 — 平静的水池，温水般宜人 */
  37: { min: 24, max: 28, base: 26, swing: 0.8 },
  /** Level 48 — 日落沙滩 */
  48: { min: 22, max: 28, base: 25, swing: 1.8 },
  /** Level 57 — 黄色房间 */
  57: { min: 19, max: 23, base: 21, swing: 1.2 },
  /** Level 75 — 金属管道区域 */
  75: { min: 14, max: 19, base: 16.5, swing: 1.7 },
  /** Level 119 — 水滑梯房 */
  119: { min: 20, max: 26, base: 23, swing: 1.4 },
  /** Level 121 — 湖底 */
  121: { min: 8, max: 14, base: 11, swing: 1.4 },
  /** 蓝色通道 */
  blue_channel: { min: 14, max: 19, base: 16.5, swing: 1.2 },
  /** 枢纽 — 稳定、干燥的地下公路隧道 */
  hub: { min: 19, max: 22, base: 20.5, swing: 0.5 },
  /** Level C-144 — 和爱社区，温和的城区与郊区 */
  c144: { min: 16, max: 24, base: 20, swing: 2.6 },
  /** Level C-192 — 封闭森林 */
  c192: { min: 14, max: 20, base: 17, swing: 1.6 },
  /** Level C-370 — 水池深处的沉静空间 */
  c370: { min: 20, max: 25, base: 22.5, swing: 1 },
  /** Level C-1289 — 死亡回廊 */
  c1289: { min: 16, max: 21, base: 18.5, swing: 1.4 },
  c1290: { min: 15, max: 20, base: 17.5, swing: 1.5 },
  c1291: { min: 18, max: 23, base: 20.5, swing: 1.6 },
  c1292: { min: 14, max: 19, base: 16.5, swing: 1.5 },
  c1293: { min: 13, max: 18, base: 15.5, swing: 1.8 },
  c1294: { min: 12, max: 17, base: 14.5, swing: 1.6 },
  c1295: { min: 16, max: 21, base: 18.5, swing: 1.4 },
  c1296: { min: 15, max: 20, base: 17.5, swing: 1.3 },
  c1297: { min: 22, max: 28, base: 25, swing: 2 },
  c1298: { min: 14, max: 19, base: 16.5, swing: 1.5 },
  c1299: { min: 17, max: 22, base: 19.5, swing: 1.4 },
  /** Level C-1299.1 — 热气腾腾的浓汤食堂，暖而宜人 */
  c1299_1: { min: 23, max: 28, base: 25.5, swing: 1.3 },
  /** Level 0.3 — 极寒 */
  "0.3": { min: -22, max: -18, base: -20, swing: 1.1 },
};

/** @type {number | string} */
let levelIndex = 0;
let fillEl = null;
let valueEl = null;
let rootEl = null;
let overheatEl = null;
let overcoldEl = null;
let displayC = 21;
let phase = Math.random() * Math.PI * 2;

/** 超过此温度（严格大于）触发热伤害 */
export const HEAT_DAMAGE_THRESHOLD_C = 45;
export const HEAT_DAMAGE_HP = 3;
export const HEAT_DAMAGE_COOLDOWN_MS = 2000;

/** 低于此温度显示「过冷」 */
export const COLD_OVERCOLD_THRESHOLD_C = 0;
/** Level 0.3 等极寒区每秒扣血 */
export const COLD_DAMAGE_HP_PER_SEC = 3;

let heatDamageNextCheckAt = 0;

/** @param {number | string} zone 如 0、1、"0.3" */
export function setBackroomsTemperatureZone(zone) {
  levelIndex = zone != null ? zone : 0;
  var profile = LEVEL_PROFILE[levelIndex] || LEVEL_PROFILE[0];
  displayC = profile.base;
  heatDamageNextCheckAt = 0;
  renderTemperature(displayC);
}

/**
 * 极寒环境持续扣血（按 dt）
 * @param {import("./backrooms-survival.js").BackroomsSurvival | null} survival
 * @param {number} dt
 * @param {boolean} active
 */
export function updateBackroomsColdDamage(survival, dt, active) {
  if (!active || !survival || survival.dead) return;
  if (displayC >= COLD_OVERCOLD_THRESHOLD_C) return;
  var dmg = COLD_DAMAGE_HP_PER_SEC * (dt || 0);
  if (dmg > 0) survival.takeDamage(dmg);
}

export function getBackroomsDisplayTemperature() {
  return displayC;
}

/**
 * 环境温度 > 45°C 时扣 3 血量；每次判定后 2 秒内不再检测
 * @param {import("./backrooms-survival.js").BackroomsSurvival | null} survival
 */
export function updateBackroomsHeatDamage(survival, now) {
  if (!survival || survival.dead) return;
  var t = now != null ? now : performance.now();
  if (t < heatDamageNextCheckAt) return;
  if (displayC > HEAT_DAMAGE_THRESHOLD_C) {
    survival.takeDamage(HEAT_DAMAGE_HP);
    heatDamageNextCheckAt = t + HEAT_DAMAGE_COOLDOWN_MS;
  }
}

function clampTemp(c, profile) {
  return Math.max(profile.min, Math.min(profile.max, c));
}

function sampleTarget(profile, t) {
  if (profile.volatile) {
    var swing2 = profile.swing2 != null ? profile.swing2 : 4;
    return clampTemp(
      profile.base +
        Math.sin(t * 0.00115 + phase) * profile.swing +
        Math.sin(t * 0.0042 + phase * 1.35) * swing2 +
        Math.sin(t * 0.00038 + phase * 0.6) * 2.8,
      profile
    );
  }
  return clampTemp(
    profile.base +
      Math.sin(t * 0.00085 + phase) * profile.swing +
      Math.sin(t * 0.0023 + phase * 1.7) * (profile.swing * 0.32),
    profile
  );
}

export function initBackroomsTemperature(level, elements) {
  levelIndex = level != null ? level : 0;
  fillEl = elements && elements.fillEl ? elements.fillEl : null;
  valueEl = elements && elements.valueEl ? elements.valueEl : null;
  rootEl = elements && elements.rootEl ? elements.rootEl : null;
  overheatEl =
    elements && elements.overheatEl
      ? elements.overheatEl
      : typeof document !== "undefined"
        ? document.getElementById("backroomsOverheat")
        : null;
  overcoldEl =
    elements && elements.overcoldEl
      ? elements.overcoldEl
      : typeof document !== "undefined"
        ? document.getElementById("backroomsOvercold")
        : null;
  var profile = LEVEL_PROFILE[levelIndex] || LEVEL_PROFILE[0];
  displayC = profile.base;
  heatDamageNextCheckAt = 0;
  renderTemperature(displayC);
}

export function updateBackroomsTemperature(dt, now) {
  if (!fillEl && !valueEl) return;
  var profile = LEVEL_PROFILE[levelIndex] || LEVEL_PROFILE[0];
  var t = now != null ? now : performance.now();
  var target = sampleTarget(profile, t);
  var lerp = profile.volatile
    ? Math.min(1, (dt || 0.016) * 3.2)
    : Math.min(1, (dt || 0.016) * 2.5);
  displayC += (target - displayC) * lerp;
  renderTemperature(displayC);
}

function renderTemperature(celsius) {
  var c = Math.round(celsius * 10) / 10;
  var pct;
  if (c < 12) {
    pct = Math.max(0, Math.min(100, ((c + 35) / 47) * 100));
  } else {
    pct = Math.max(0, Math.min(100, ((c - 12) / 42) * 100));
  }
  if (valueEl) {
    valueEl.textContent = c.toFixed(1) + "°C";
  }
  if (fillEl) {
    fillEl.style.width = pct + "%";
  }
  if (rootEl) {
    rootEl.classList.remove(
      "backrooms-temp--cool",
      "backrooms-temp--warm",
      "backrooms-temp--hot",
      "backrooms-temp--freezing"
    );
    if (c < 0) rootEl.classList.add("backrooms-temp--freezing");
    else if (c < 20) rootEl.classList.add("backrooms-temp--cool");
    else if (c >= 36) rootEl.classList.add("backrooms-temp--hot");
    else if (c >= 28) rootEl.classList.add("backrooms-temp--warm");
  }
  if (overheatEl) {
    overheatEl.hidden = !(c > HEAT_DAMAGE_THRESHOLD_C);
  }
  if (overcoldEl) {
    overcoldEl.hidden = !(c < COLD_OVERCOLD_THRESHOLD_C);
  }
}

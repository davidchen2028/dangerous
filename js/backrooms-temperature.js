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

/** @type {Record<number, TempProfile>} */
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
};

let levelIndex = 0;
let fillEl = null;
let valueEl = null;
let rootEl = null;
let overheatEl = null;
let displayC = 21;
let phase = Math.random() * Math.PI * 2;

/** 超过此温度（严格大于）触发热伤害 */
export const HEAT_DAMAGE_THRESHOLD_C = 45;
export const HEAT_DAMAGE_HP = 3;
export const HEAT_DAMAGE_COOLDOWN_MS = 2000;

let heatDamageNextCheckAt = 0;

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
  var pct = Math.max(0, Math.min(100, ((c - 12) / 42) * 100));
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
      "backrooms-temp--hot"
    );
    if (c < 20) rootEl.classList.add("backrooms-temp--cool");
    else if (c >= 36) rootEl.classList.add("backrooms-temp--hot");
    else if (c >= 28) rootEl.classList.add("backrooms-temp--warm");
  }
  if (overheatEl) {
    overheatEl.hidden = !(c > HEAT_DAMAGE_THRESHOLD_C);
  }
}

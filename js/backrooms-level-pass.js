/**
 * 后室关卡入场令牌 + 刷新策略（任意关卡 F5 → 重置并回 L0）
 */
import { resetBackroomsRun } from "./backrooms-survival.js";
import { markLevelEscaped } from "./backrooms-tasks.js";

export const LEVEL0_PAGE = "backrooms-level0.html";
/** @typedef {"clip" | "hub" | "l0" | "l1_bntg" | "l2" | "l3" | "l4" | "l6" | "l6_1" | "l7" | "l8" | "l9" | "l10" | "l11" | "l13" | "l14" | "l16" | "l21" | "l37" | "l46" | "l48" | "l57" | "l75" | "l119" | "l121" | "l149" | "l283" | "l363" | "blue_channel" | "c1" | "c101" | "c102" | "c144" | "c192" | "c370" | "c1289" | "c1290" | "c1291" | "c1292" | "c1293" | "c1294" | "c1295" | "c1296" | "c1297" | "c1298" | "c1299" | "c1299_1"} BackroomsLevelPassId */

/** @type {Record<BackroomsLevelPassId, { pass: string, yaw: string | null }>} */
export const LEVEL_PASS_KEYS = {
  clip: { pass: "backrooms_clip_pass", yaw: null },
  hub: { pass: "backrooms_hub_pass", yaw: "backrooms_hub_yaw" },
  /** 从其他层级切回 L0：持有此令牌表示延续本局，不清档 */
  l0: { pass: "backrooms_l0_pass", yaw: "backrooms_l0_yaw" },
  l1_bntg: {
    pass: "backrooms_l1_bntg_pass",
    yaw: "backrooms_l1_bntg_yaw",
  },
  l2: { pass: "backrooms_l2_pass", yaw: "backrooms_l2_yaw" },
  l3: { pass: "backrooms_l3_pass", yaw: "backrooms_l3_yaw" },
  l4: { pass: "backrooms_l4_pass", yaw: "backrooms_l4_yaw" },
  l6: { pass: "backrooms_l6_pass", yaw: "backrooms_l6_yaw" },
  l6_1: { pass: "backrooms_l6_1_pass", yaw: "backrooms_l6_1_yaw" },
  l7: { pass: "backrooms_l7_pass", yaw: "backrooms_l7_yaw" },
  l8: { pass: "backrooms_l8_pass", yaw: "backrooms_l8_yaw" },
  l9: { pass: "backrooms_l9_pass", yaw: "backrooms_l9_yaw" },
  l10: { pass: "backrooms_l10_pass", yaw: "backrooms_l10_yaw" },
  l11: { pass: "backrooms_l11_pass", yaw: "backrooms_l11_yaw" },
  l13: { pass: "backrooms_l13_pass", yaw: "backrooms_l13_yaw" },
  l14: { pass: "backrooms_l14_pass", yaw: "backrooms_l14_yaw" },
  l16: { pass: "backrooms_l16_pass", yaw: "backrooms_l16_yaw" },
  l21: { pass: "backrooms_l21_pass", yaw: "backrooms_l21_yaw" },
  l37: { pass: "backrooms_l37_pass", yaw: "backrooms_l37_yaw" },
  l46: { pass: "backrooms_l46_pass", yaw: "backrooms_l46_yaw" },
  l48: { pass: "backrooms_l48_pass", yaw: "backrooms_l48_yaw" },
  l57: { pass: "backrooms_l57_pass", yaw: "backrooms_l57_yaw" },
  l75: { pass: "backrooms_l75_pass", yaw: "backrooms_l75_yaw" },
  l119: { pass: "backrooms_l119_pass", yaw: "backrooms_l119_yaw" },
  l121: { pass: "backrooms_l121_pass", yaw: "backrooms_l121_yaw" },
  l149: { pass: "backrooms_l149_pass", yaw: "backrooms_l149_yaw" },
  l283: { pass: "backrooms_l283_pass", yaw: "backrooms_l283_yaw" },
  l363: { pass: "backrooms_l363_pass", yaw: "backrooms_l363_yaw" },
  blue_channel: { pass: "backrooms_blue_channel_pass", yaw: "backrooms_blue_channel_yaw" },
  c1: { pass: "backrooms_c1_pass", yaw: "backrooms_c1_yaw" },
  c101: { pass: "backrooms_c101_pass", yaw: "backrooms_c101_yaw" },
  c102: { pass: "backrooms_c102_pass", yaw: "backrooms_c102_yaw" },
  c144: { pass: "backrooms_c144_pass", yaw: "backrooms_c144_yaw" },
  c192: { pass: "backrooms_c192_pass", yaw: "backrooms_c192_yaw" },
  c370: { pass: "backrooms_c370_pass", yaw: "backrooms_c370_yaw" },
  c1289: { pass: "backrooms_c1289_pass", yaw: "backrooms_c1289_yaw" },
  c1290: { pass: "backrooms_c1290_pass", yaw: "backrooms_c1290_yaw" },
  c1291: { pass: "backrooms_c1291_pass", yaw: "backrooms_c1291_yaw" },
  c1292: { pass: "backrooms_c1292_pass", yaw: "backrooms_c1292_yaw" },
  c1293: { pass: "backrooms_c1293_pass", yaw: "backrooms_c1293_yaw" },
  c1294: { pass: "backrooms_c1294_pass", yaw: "backrooms_c1294_yaw" },
  c1295: { pass: "backrooms_c1295_pass", yaw: "backrooms_c1295_yaw" },
  c1296: { pass: "backrooms_c1296_pass", yaw: "backrooms_c1296_yaw" },
  c1299: { pass: "backrooms_c1299_pass", yaw: "backrooms_c1299_yaw" },
  c1299_1: { pass: "backrooms_c1299_1_pass", yaw: "backrooms_c1299_1_yaw" },
  c1297: { pass: "backrooms_c1297_pass", yaw: "backrooms_c1297_yaw" },
  c1298: { pass: "backrooms_c1298_pass", yaw: "backrooms_c1298_yaw" },
};

function keysFor(levelId) {
  return LEVEL_PASS_KEYS[levelId] || null;
}

export function isBackroomsPageReload() {
  var nav =
    typeof performance !== "undefined" &&
    performance.getEntriesByType &&
    performance.getEntriesByType("navigation")[0];
  return !!(nav && nav.type === "reload");
}

/** 刷新页面：清空后室进度并回到 Level 0 */
export function redirectReloadToLevel0Reset() {
  resetBackroomsRun();
  window.location.replace(LEVEL0_PAGE);
}

/**
 * 非刷新才继续加载当前关卡；刷新则重置并跳转 L0
 * @returns {boolean}
 */
export function guardBackroomsReloadOrContinue() {
  if (!isBackroomsPageReload()) return true;
  redirectReloadToLevel0Reset();
  return false;
}

export function hasLevelPass(levelId) {
  var keys = keysFor(levelId);
  if (!keys) return false;
  try {
    return sessionStorage.getItem(keys.pass) === "1";
  } catch (err) {
    return false;
  }
}

/** 授予或续期令牌（进入关卡 / 同页复活后重发）
 * @param {BackroomsLevelPassId} levelId
 * @param {number} [yaw]
 * @param {{ noEscape?: boolean }} [opts] 死亡回城 / 同页续令牌时传 noEscape，不触发逃离成就
 */
export function grantLevelPass(levelId, yaw, opts) {
  var keys = keysFor(levelId);
  if (!keys) return;
  try {
    sessionStorage.setItem(keys.pass, "1");
    if (keys.yaw != null && yaw != null && Number.isFinite(yaw)) {
      sessionStorage.setItem(keys.yaw, String(yaw));
    }
  } catch (err2) {
    /* ignore */
  }
  // 默认视为存活逃离当前层；死亡回城等路径需显式 noEscape。
  if (!opts || !opts.noEscape) {
    try {
      markLevelEscaped();
    } catch (err3) {
      /* ignore */
    }
  }
}

export function refreshLevelPass(levelId, yaw) {
  grantLevelPass(levelId, yaw, { noEscape: true });
}

export function revokeLevelPass(levelId) {
  var keys = keysFor(levelId);
  if (!keys) return;
  try {
    sessionStorage.removeItem(keys.pass);
    if (keys.yaw) sessionStorage.removeItem(keys.yaw);
  } catch (err) {
    /* ignore */
  }
}

/** 读取并清除一次性朝向（pass 本身保留） */
export function consumeEntryYaw(levelId) {
  var keys = keysFor(levelId);
  if (!keys || !keys.yaw) return null;
  try {
    var raw = sessionStorage.getItem(keys.yaw);
    sessionStorage.removeItem(keys.yaw);
    if (raw == null) return null;
    var y = parseFloat(raw);
    return Number.isFinite(y) ? y : null;
  } catch (err) {
    return null;
  }
}

/**
 * 校验子关卡入场：须有效 pass；刷新由 guard 拦截
 */
export function enforceLevelEntry(levelId, applyYaw) {
  if (!guardBackroomsReloadOrContinue()) return false;
  if (!hasLevelPass(levelId)) return false;
  var yaw = consumeEntryYaw(levelId);
  if (yaw != null && applyYaw) applyYaw(yaw);
  return true;
}

/**
 * Level 0 入场：带 l0 令牌表示由其他层级切入，沿用当前存档；
 * 否则视为新开一局，由调用方清档。刷新一律当新局。
 * @returns {boolean} 是否延续本局
 */
export function consumeLevel0CarryEntry(applyYaw) {
  if (isBackroomsPageReload()) {
    revokeLevelPass("l0");
    return false;
  }
  if (!hasLevelPass("l0")) return false;
  var yaw = consumeEntryYaw("l0");
  revokeLevelPass("l0");
  if (yaw != null && applyYaw) applyYaw(yaw);
  return true;
}

/**
 * Level 1：M.E.G 死亡回城 或 clip 通行证
 */
export function enforceLevel1Entry(opts) {
  if (!guardBackroomsReloadOrContinue()) return false;
  opts = opts || {};
  try {
    if (opts.megRespawn && sessionStorage.getItem("backrooms_meg_respawn") === "1") {
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  if (!hasLevelPass("clip")) return false;
  var yaw = consumeEntryYaw("clip");
  if (yaw != null && opts.applyYaw) opts.applyYaw(yaw);
  return true;
}

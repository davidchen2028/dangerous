/**
 * 后室关卡入场令牌 + 刷新策略（任意关卡 F5 → 重置并回 L0）
 */
import { resetBackroomsRun } from "./backrooms-survival.js";

export const LEVEL0_PAGE = "backrooms-level0.html";
/** @typedef {"clip" | "l0" | "l2" | "l3" | "l4" | "l6" | "l6_1" | "l7" | "l8" | "l9" | "l10" | "l11" | "l13" | "l14" | "l21" | "l37" | "l48" | "l57" | "l75" | "l119" | "l121" | "l283" | "blue_channel" | "c144" | "c192" | "c370"} BackroomsLevelPassId */

/** @type {Record<BackroomsLevelPassId, { pass: string, yaw: string | null }>} */
export const LEVEL_PASS_KEYS = {
  clip: { pass: "backrooms_clip_pass", yaw: null },
  /** 从其他层级切回 L0：持有此令牌表示延续本局，不清档 */
  l0: { pass: "backrooms_l0_pass", yaw: "backrooms_l0_yaw" },
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
  l21: { pass: "backrooms_l21_pass", yaw: "backrooms_l21_yaw" },
  l37: { pass: "backrooms_l37_pass", yaw: "backrooms_l37_yaw" },
  l48: { pass: "backrooms_l48_pass", yaw: "backrooms_l48_yaw" },
  l57: { pass: "backrooms_l57_pass", yaw: "backrooms_l57_yaw" },
  l75: { pass: "backrooms_l75_pass", yaw: "backrooms_l75_yaw" },
  l119: { pass: "backrooms_l119_pass", yaw: "backrooms_l119_yaw" },
  l121: { pass: "backrooms_l121_pass", yaw: "backrooms_l121_yaw" },
  l283: { pass: "backrooms_l283_pass", yaw: "backrooms_l283_yaw" },
  blue_channel: { pass: "backrooms_blue_channel_pass", yaw: "backrooms_blue_channel_yaw" },
  c144: { pass: "backrooms_c144_pass", yaw: "backrooms_c144_yaw" },
  c192: { pass: "backrooms_c192_pass", yaw: "backrooms_c192_yaw" },
  c370: { pass: "backrooms_c370_pass", yaw: "backrooms_c370_yaw" },
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

/** 授予或续期令牌（进入关卡 / 同页复活后重发） */
export function grantLevelPass(levelId, yaw) {
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
}

export function refreshLevelPass(levelId, yaw) {
  grantLevelPass(levelId, yaw);
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

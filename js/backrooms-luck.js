/**
 * 后室幸运值（临时实现）
 * 幸运豆奶会写入带时限的修正；完整规则以后再定。
 */
import { SOY_MILK_DURATION_MS } from "./backrooms-soy-milk.js";

export const LUCK_MOD_KEY = "backrooms_luck_mod_v1";
export const LUCKY_VAULT_SOY_MILK_DURATION_MS = 8 * 60 * 1000;
export const UNLUCKY_MERCHANT_LOCK_KEY =
  "backrooms_unlucky_merchant_lock_until_v1";
const MERCHANT_LOCK_MS = 2 * 60 * 1000;
let stumbleUntil = 0;
let nextStumbleCheck = 0;

function readMod() {
  try {
    var raw = sessionStorage.getItem(LUCK_MOD_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.delta) || !Number.isFinite(parsed.until)) {
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

function writeMod(delta, until) {
  try {
    sessionStorage.setItem(
      LUCK_MOD_KEY,
      JSON.stringify({ delta: delta, until: until })
    );
    return true;
  } catch (err) {
    return false;
  }
}

export function clearLuck() {
  try {
    sessionStorage.removeItem(LUCK_MOD_KEY);
  } catch (err) {
    /* ignore */
  }
}

/** @returns {number} */
export function getLuck() {
  var mod = readMod();
  if (!mod) return 0;
  if (mod.until <= Date.now()) {
    clearLuck();
    return 0;
  }
  return mod.delta | 0;
}

/**
 * 饮用幸运豆奶：写入 15 分钟幸运修正。
 * @param {number} delta
 */
export function applyLuckySoyMilkLuck(delta, durationMs) {
  var duration =
    durationMs == null ? SOY_MILK_DURATION_MS : Math.max(0, durationMs);
  return writeMod(delta | 0, Date.now() + duration);
}

/** 过期时清掉修正；返回是否发生了变化 */
export function syncLuckExpiry() {
  var mod = readMod();
  if (!mod) return false;
  if (mod.until > Date.now()) return false;
  clearLuck();
  return true;
}

export function getMerchantLockRemainingMs() {
  try {
    var until = parseInt(
      sessionStorage.getItem(UNLUCKY_MERCHANT_LOCK_KEY) || "0",
      10
    );
    return Math.max(0, (Number.isFinite(until) ? until : 0) - Date.now());
  } catch (err) {
    return 0;
  }
}

/**
 * 倒霉时每次开始一段新交易有 20% 概率遭拒；一旦遭拒锁定两分钟。
 */
export function tryBeginMerchantTrade() {
  if (getMerchantLockRemainingMs() > 0) return false;
  if (getLuck() <= -30 && Math.random() < 0.2) {
    try {
      sessionStorage.setItem(
        UNLUCKY_MERCHANT_LOCK_KEY,
        String(Date.now() + MERCHANT_LOCK_MS)
      );
    } catch (err) {
      /* ignore */
    }
    return false;
  }
  return true;
}

export function shouldGiveLuckyMerchantGift() {
  return getLuck() >= 30 && Math.random() < 0.15;
}

/** 倒霉时偶发 1.4 秒踉跄；由统一移动函数调用。 */
export function getLuckMovementMul() {
  if (getLuck() > -30) {
    stumbleUntil = 0;
    nextStumbleCheck = 0;
    return 1;
  }
  var now = performance.now();
  if (now < stumbleUntil) return 0.58;
  if (!nextStumbleCheck) nextStumbleCheck = now + 12000;
  if (now >= nextStumbleCheck) {
    nextStumbleCheck = now + 12000 + Math.random() * 18000;
    if (Math.random() < 0.35) {
      stumbleUntil = now + 1400;
      return 0.58;
    }
  }
  return 1;
}

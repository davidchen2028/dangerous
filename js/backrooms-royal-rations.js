/**
 * 皇家口粮 —
 *  · 普通：10 分钟，血量上限 150、体力上限 200
 *  · 中等：10 分钟，血量上限 400、体力上限 300、奔跑速度 2 倍
 * 截止时间同夜视，用 Date.now() 墙钟存储，避免切层后 performance.now() 归零导致续期。
 * 死亡负面（最大生命/体力百分比削减）叠加在口粮上限之上。
 */
import { getDeathHpMul, getDeathStaminaMul } from "./backrooms-death-penalty.js";

export const ROYAL_RATIONS_BUFF_KEY = "backrooms_royal_rations_until";
export const ROYAL_RATIONS_MEDIUM_KEY = "backrooms_royal_rations_medium_until";
export const HP_MAX_DEFAULT = 100;
export const HP_MAX_ROYAL = 150;
export const HP_MAX_ROYAL_MEDIUM = 400;
export const STAMINA_MAX_DEFAULT = 100;
export const STAMINA_MAX_ROYAL = 200;
export const STAMINA_MAX_ROYAL_MEDIUM = 300;
export const SPRINT_MUL_DEFAULT = 1.65;
export const SPRINT_MUL_ROYAL_MEDIUM = 2;
export const ROYAL_RATIONS_DURATION_MS = 10 * 60 * 1000;

function readUntil(key) {
  try {
    var raw = sessionStorage.getItem(key);
    if (raw == null || raw === "") return 0;
    var n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    return 0;
  }
}

export function clearRoyalRationsBuff() {
  try {
    sessionStorage.removeItem(ROYAL_RATIONS_BUFF_KEY);
    sessionStorage.removeItem(ROYAL_RATIONS_MEDIUM_KEY);
  } catch (err) {
    /* ignore */
  }
}

export function getRoyalRationsUntil() {
  return readUntil(ROYAL_RATIONS_BUFF_KEY);
}

export function getRoyalRationsMediumUntil() {
  return readUntil(ROYAL_RATIONS_MEDIUM_KEY);
}

export function isRoyalRationsActive() {
  return getRoyalRationsUntil() > Date.now();
}

export function isRoyalRationsMediumActive() {
  return getRoyalRationsMediumUntil() > Date.now();
}

function baseHpMax() {
  if (isRoyalRationsMediumActive()) return HP_MAX_ROYAL_MEDIUM;
  return isRoyalRationsActive() ? HP_MAX_ROYAL : HP_MAX_DEFAULT;
}

function baseStaminaMax() {
  if (isRoyalRationsMediumActive()) return STAMINA_MAX_ROYAL_MEDIUM;
  return isRoyalRationsActive() ? STAMINA_MAX_ROYAL : STAMINA_MAX_DEFAULT;
}

export function getHpMax() {
  return Math.max(1, Math.floor(baseHpMax() * getDeathHpMul()));
}

export function getStaminaMax() {
  return Math.max(1, Math.floor(baseStaminaMax() * getDeathStaminaMul()));
}

/** 奔跑加速倍率：中等皇家口粮期间 2 倍 */
export function getRoyalSprintMul() {
  return isRoyalRationsMediumActive() ? SPRINT_MUL_ROYAL_MEDIUM : SPRINT_MUL_DEFAULT;
}

export function activateRoyalRationsBuff() {
  try {
    sessionStorage.setItem(
      ROYAL_RATIONS_BUFF_KEY,
      String(Date.now() + ROYAL_RATIONS_DURATION_MS)
    );
  } catch (err) {
    return false;
  }
  return true;
}

export function activateRoyalRationsMediumBuff() {
  try {
    sessionStorage.setItem(
      ROYAL_RATIONS_MEDIUM_KEY,
      String(Date.now() + ROYAL_RATIONS_DURATION_MS)
    );
  } catch (err) {
    return false;
  }
  return true;
}

/**  buff 结束时将 hp / 体力压回当前上限 */
export function syncRoyalRationsExpiry(survival) {
  if (!survival) return false;
  var changed = false;
  var mediumUntil = getRoyalRationsMediumUntil();
  if (mediumUntil > 0 && mediumUntil <= Date.now()) {
    try {
      sessionStorage.removeItem(ROYAL_RATIONS_MEDIUM_KEY);
    } catch (err) {
      /* ignore */
    }
    changed = true;
  }
  var until = getRoyalRationsUntil();
  if (until > 0 && until <= Date.now()) {
    try {
      sessionStorage.removeItem(ROYAL_RATIONS_BUFF_KEY);
    } catch (err) {
      /* ignore */
    }
    changed = true;
  }
  if (!changed) return false;
  var hpCap = getHpMax();
  var staCap = getStaminaMax();
  survival.hp = Math.min(hpCap, survival.hp);
  survival.stamina = Math.min(staCap, survival.stamina);
  survival.refreshHud();
  return true;
}

export function formatRoyalRationsRemaining() {
  var now = Date.now();
  var until = Math.max(getRoyalRationsUntil(), getRoyalRationsMediumUntil());
  if (until <= now) return "";
  var sec = Math.ceil((until - now) / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

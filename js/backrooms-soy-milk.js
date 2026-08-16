/**
 * 豆奶 —
 *  · 草莓味：15 分钟，理智上限 +25%，饮用时回复当前上限的 25%
 *  · 香蕉味：饮用时回复 25 血量（无持续效果）
 *  · 幸运豆奶（冷）：15 分钟，幸运值 −100
 *  · 幸运豆奶（热）：15 分钟，幸运值 +100；由火盐拖到冷幸运豆奶格子加热得到
 * 截止时间用 Date.now() 墙钟，避免切层后 performance.now() 归零。
 */
export const STRAWBERRY_SOY_MILK_KEY = "backrooms_strawberry_soy_milk_until";
export const BANANA_SOY_MILK_KEY = "backrooms_banana_soy_milk_until";
export const STRAWBERRY_LUCKY_SOY_MILK_KEY =
  "backrooms_strawberry_lucky_soy_milk_until";
export const SOY_MILK_DURATION_MS = 15 * 60 * 1000;
export const STRAWBERRY_LUCKY_DURATION_MS = 6 * 60 * 1000;
export const STRAWBERRY_SOY_MILK_SANITY_MUL = 1.25;
export const BANANA_SOY_MILK_HEAL = 25;
export const LUCKY_SOY_MILK_COLD_ID = "lucky_soy_milk_cold";
export const LUCKY_SOY_MILK_HOT_ID = "lucky_soy_milk_hot";
export const LUCKY_SOY_MILK_COLD_LUCK = -100;
export const LUCKY_SOY_MILK_HOT_LUCK = 100;

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

function writeUntil(key, durationMs) {
  try {
    sessionStorage.setItem(
      key,
      String(Date.now() + (durationMs == null ? SOY_MILK_DURATION_MS : durationMs))
    );
    return true;
  } catch (err) {
    return false;
  }
}

export function clearSoyMilkBuffs() {
  try {
    sessionStorage.removeItem(STRAWBERRY_SOY_MILK_KEY);
    sessionStorage.removeItem(BANANA_SOY_MILK_KEY);
    sessionStorage.removeItem(STRAWBERRY_LUCKY_SOY_MILK_KEY);
  } catch (err) {
    /* ignore */
  }
}

export function getStrawberrySoyMilkUntil() {
  return readUntil(STRAWBERRY_SOY_MILK_KEY);
}

export function isStrawberrySoyMilkActive() {
  return getStrawberrySoyMilkUntil() > Date.now();
}

export function activateStrawberrySoyMilkBuff() {
  return writeUntil(STRAWBERRY_SOY_MILK_KEY);
}

export function getStrawberryLuckySoyMilkUntil() {
  return readUntil(STRAWBERRY_LUCKY_SOY_MILK_KEY);
}

export function isStrawberryLuckySoyMilkActive() {
  return getStrawberryLuckySoyMilkUntil() > Date.now();
}

/** 再次饮用只覆盖 6 分钟期限，不叠加倍率。 */
export function activateStrawberryLuckySoyMilkBuff() {
  return writeUntil(
    STRAWBERRY_LUCKY_SOY_MILK_KEY,
    STRAWBERRY_LUCKY_DURATION_MS
  );
}

/** 叠加在基础理智上限之上 */
export function applySoyMilkSanityMax(baseMax) {
  var n = Math.max(1, Math.floor(baseMax || 0));
  if (
    !isStrawberrySoyMilkActive() &&
    !isStrawberryLuckySoyMilkActive()
  ) {
    return n;
  }
  return Math.max(1, Math.floor(n * STRAWBERRY_SOY_MILK_SANITY_MUL));
}

/** 草莓味 buff 结束时将理智压回当前上限 */
export function syncSoyMilkExpiry(survival) {
  if (!survival) return false;
  var expired = false;
  var strawberryUntil = getStrawberrySoyMilkUntil();
  if (strawberryUntil > 0 && strawberryUntil <= Date.now()) {
    try {
      sessionStorage.removeItem(STRAWBERRY_SOY_MILK_KEY);
    } catch (err) {
      /* ignore */
    }
    expired = "strawberry";
  }
  var luckyUntil = getStrawberryLuckySoyMilkUntil();
  if (luckyUntil > 0 && luckyUntil <= Date.now()) {
    try {
      sessionStorage.removeItem(STRAWBERRY_LUCKY_SOY_MILK_KEY);
    } catch (err2) {
      /* ignore */
    }
    expired = "strawberry_lucky";
  }
  return expired;
}

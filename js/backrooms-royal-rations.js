/**
 * 皇家口粮 — 10 分钟：血量上限 150、体力上限 200，使用后回满该上限内血量
 * 截止时间同夜视，用 Date.now() 墙钟存储，避免切层后 performance.now() 归零导致续期。
 */
export const ROYAL_RATIONS_BUFF_KEY = "backrooms_royal_rations_until";
export const HP_MAX_DEFAULT = 100;
export const HP_MAX_ROYAL = 150;
export const STAMINA_MAX_DEFAULT = 100;
export const STAMINA_MAX_ROYAL = 200;
export const ROYAL_RATIONS_DURATION_MS = 10 * 60 * 1000;

export function clearRoyalRationsBuff() {
  try {
    sessionStorage.removeItem(ROYAL_RATIONS_BUFF_KEY);
  } catch (err) {
    /* ignore */
  }
}

export function getRoyalRationsUntil() {
  try {
    var raw = sessionStorage.getItem(ROYAL_RATIONS_BUFF_KEY);
    if (raw == null || raw === "") return 0;
    var n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    return 0;
  }
}

export function isRoyalRationsActive() {
  return getRoyalRationsUntil() > Date.now();
}

export function getHpMax() {
  return isRoyalRationsActive() ? HP_MAX_ROYAL : HP_MAX_DEFAULT;
}

export function getStaminaMax() {
  return isRoyalRationsActive() ? STAMINA_MAX_ROYAL : STAMINA_MAX_DEFAULT;
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

/**  buff 结束时将 hp / 体力压回默认上限 */
export function syncRoyalRationsExpiry(survival) {
  if (!survival) return false;
  var until = getRoyalRationsUntil();
  if (until <= 0 || until > Date.now()) return false;
  clearRoyalRationsBuff();
  survival.hp = Math.min(HP_MAX_DEFAULT, survival.hp);
  survival.stamina = Math.min(STAMINA_MAX_DEFAULT, survival.stamina);
  survival.refreshHud();
  return true;
}

export function formatRoyalRationsRemaining() {
  var now = Date.now();
  var until = getRoyalRationsUntil();
  if (until <= now) return "";
  var sec = Math.ceil((until - now) / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

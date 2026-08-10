/**
 * 皇家口粮 — 10 分钟：血量上限 150、体力上限 200，使用后回满该上限内血量
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

export function isRoyalRationsActive(now) {
  var until = getRoyalRationsUntil();
  return until > (now != null ? now : performance.now());
}

export function getHpMax(now) {
  return isRoyalRationsActive(now) ? HP_MAX_ROYAL : HP_MAX_DEFAULT;
}

export function getStaminaMax(now) {
  return isRoyalRationsActive(now) ? STAMINA_MAX_ROYAL : STAMINA_MAX_DEFAULT;
}

export function activateRoyalRationsBuff(now) {
  now = now != null ? now : performance.now();
  try {
    sessionStorage.setItem(
      ROYAL_RATIONS_BUFF_KEY,
      String(now + ROYAL_RATIONS_DURATION_MS)
    );
  } catch (err) {
    return false;
  }
  return true;
}

/**  buff 结束时将 hp / 体力压回默认上限 */
export function syncRoyalRationsExpiry(survival, now) {
  if (!survival) return false;
  now = now != null ? now : performance.now();
  var until = getRoyalRationsUntil();
  if (until <= 0 || until > now) return false;
  clearRoyalRationsBuff();
  survival.hp = Math.min(HP_MAX_DEFAULT, survival.hp);
  survival.stamina = Math.min(STAMINA_MAX_DEFAULT, survival.stamina);
  survival.refreshHud();
  return true;
}

export function formatRoyalRationsRemaining(now) {
  now = now != null ? now : performance.now();
  var until = getRoyalRationsUntil();
  if (until <= now) return "";
  var sec = Math.ceil((until - now) / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

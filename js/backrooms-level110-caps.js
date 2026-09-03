/**
 * Level 110 粒子对返航：生命 / 理智 / 体力上限减半（本局 session 持久）。
 * 独立模块，避免 meg-checkpoint ↔ royal-rations 循环依赖。
 */

export const L110_HALF_CAPS_KEY = "backrooms_l110_half_caps_v1";

export function hasL110HalfCaps() {
  try {
    return sessionStorage.getItem(L110_HALF_CAPS_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function getL110CapMul() {
  return hasL110HalfCaps() ? 0.5 : 1;
}

export function setL110HalfCapsFlag() {
  try {
    sessionStorage.setItem(L110_HALF_CAPS_KEY, "1");
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * @param {{ hp: number, sanity: number, stamina: number, refreshHud?: () => void }} survival
 * @param {() => number} getHpMax
 * @param {() => number} getStaminaMax
 * @param {() => number} getSanityMax
 */
export function applyL110HalfCaps(survival, getHpMax, getStaminaMax, getSanityMax) {
  setL110HalfCapsFlag();
  if (!survival) return;
  survival.hp = Math.max(1, Math.min(survival.hp, getHpMax()));
  survival.stamina = Math.max(0, Math.min(survival.stamina, getStaminaMax()));
  survival.sanity = Math.max(1, Math.min(survival.sanity, getSanityMax()));
  if (typeof survival.refreshHud === "function") survival.refreshHud();
}

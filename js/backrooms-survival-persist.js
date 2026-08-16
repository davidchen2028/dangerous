/**
 * 后室 — 跨关卡 survival 状态（sessionStorage）
 */

export const SURVIVAL_STORAGE_KEY = "backrooms_survival_v1";

let boundSurvival = null;

import { getHpMax, getStaminaMax } from "./backrooms-royal-rations.js";
import { getSanityMax } from "./backrooms-death-penalty.js";

export function saveBackroomsSurvival(survival) {
  if (!survival || survival.dead) return;
  try {
    sessionStorage.setItem(
      SURVIVAL_STORAGE_KEY,
      JSON.stringify({
        hp: survival.hp,
        sanity: survival.sanity,
        stamina: survival.stamina,
      })
    );
  } catch (err) {
    /* ignore */
  }
}

export function loadBackroomsSurvival(survival) {
  if (!survival) return false;
  var hpCap = getHpMax();
  var staCap = getStaminaMax();
  var sanityCap = getSanityMax();
  try {
    var raw = sessionStorage.getItem(SURVIVAL_STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    if (Number.isFinite(data.hp)) survival.hp = Math.max(0, Math.min(hpCap, data.hp));
    if (Number.isFinite(data.sanity)) {
      survival.sanity = Math.max(0, Math.min(sanityCap, data.sanity));
    }
    if (Number.isFinite(data.stamina)) {
      survival.stamina = Math.max(0, Math.min(staCap, data.stamina));
    }
    survival.refreshHud();
    return true;
  } catch (err2) {
    return false;
  }
}

export function registerBackroomsSurvivalPersist(survival) {
  boundSurvival = survival;
  if (typeof window === "undefined" || window.__backroomsSurvivalPersistBound) return;
  window.__backroomsSurvivalPersistBound = true;
  function flush() {
    saveBackroomsSurvival(boundSurvival);
  }
  // 切层是整页跳转：pagehide 之外再挂 visibilitychange / beforeunload，
  // 避免个别浏览器漏触发导致血量、理智回退。
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
}

export function clearBackroomsSurvivalPersist() {
  try {
    sessionStorage.removeItem(SURVIVAL_STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
}

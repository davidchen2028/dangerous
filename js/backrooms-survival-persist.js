/**
 * 后室 — 跨关卡 survival 状态（sessionStorage）
 */

export const SURVIVAL_STORAGE_KEY = "backrooms_survival_v1";

let boundSurvival = null;

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
  try {
    var raw = sessionStorage.getItem(SURVIVAL_STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    if (Number.isFinite(data.hp)) survival.hp = Math.max(0, Math.min(100, data.hp));
    if (Number.isFinite(data.sanity)) survival.sanity = Math.max(0, Math.min(100, data.sanity));
    if (Number.isFinite(data.stamina)) survival.stamina = Math.max(0, Math.min(100, data.stamina));
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
  window.addEventListener("pagehide", function () {
    saveBackroomsSurvival(boundSurvival);
  });
}

export function clearBackroomsSurvivalPersist() {
  try {
    sessionStorage.removeItem(SURVIVAL_STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
}

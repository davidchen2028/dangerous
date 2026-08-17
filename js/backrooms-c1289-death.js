/**
 * 死亡时 90% 概率转入 Level C-1289（已在 C-1289~C-1299 内则不再转入）。
 */
import {
  clearRoyalRationsBuff,
  getHpMax,
  getStaminaMax,
} from "./backrooms-royal-rations.js";
import { clearSoyMilkBuffs } from "./backrooms-soy-milk.js";
import { clearLuck } from "./backrooms-luck.js";
import { getSanityMax } from "./backrooms-death-penalty.js";
import { clearNightVision } from "./backrooms-night-vision.js";
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";

export const C1289_PAGE = "backrooms-level-c1289.html";
export const C1289_DEATH_CHANCE = 0.9;

/** @param {number | string | null | undefined} level */
export function isC1289FamilyLevel(level) {
  if (level == null) return false;
  var s = String(level).toLowerCase();
  if (s === "c1289" || s.indexOf("c129") === 0) return true;
  var n = Number(level);
  return Number.isFinite(n) && n >= 1289 && n <= 1299;
}

function softRevive(survival) {
  if (!survival) return;
  try {
    clearRoyalRationsBuff();
    clearSoyMilkBuffs();
    clearLuck();
    clearNightVision();
    survival.hp = getHpMax();
    survival.sanity = getSanityMax();
    survival.stamina = getStaminaMax();
    survival.dead = false;
    survival.sanityBreaking = false;
    if (survival._deathTimer) {
      clearTimeout(survival._deathTimer);
      survival._deathTimer = null;
    }
    document.body.classList.remove("backrooms-sanity-break", "backrooms-dead");
    if (survival.deathEl) survival.deathEl.classList.remove("br-survival__death--show");
    survival.refreshHud();
    saveBackroomsSurvival(survival);
  } catch (err) {
    /* ignore */
  }
}

/**
 * @param {import("./backrooms-survival.js").BackroomsSurvival} survival
 * @param {number | string | null | undefined} currentLevel
 * @param {(go: () => void) => void} leavePage
 * @returns {boolean} 是否已接管本次死亡跳转
 */
export function tryRedirectDeathToC1289(survival, currentLevel, leavePage) {
  if (isC1289FamilyLevel(currentLevel)) return false;
  if (Math.random() >= C1289_DEATH_CHANCE) return false;
  softRevive(survival);
  grantLevelPass("c1289", null, { noEscape: true });
  queueEnterLevelBanner("Level C-1289");
  if (typeof leavePage === "function") {
    leavePage(function () {
      window.location.replace(C1289_PAGE);
    });
  } else {
    window.location.replace(C1289_PAGE);
  }
  return true;
}

/**
 * 夜视药水 — 双击使用，5 分钟内 Level 2 等场景可提亮（session 内跨关卡）
 */
import { countItem, removeFirstItem } from "./backrooms-inventory.js";

export const NIGHT_VISION_DURATION_MS = 5 * 60 * 1000;
const STORAGE_UNTIL = "backrooms_night_vision_until";
export const MEG_NV_POTION_GIVEN_KEY = "backrooms_meg_nv_potion_given";

function readUntil() {
  try {
    var raw = sessionStorage.getItem(STORAGE_UNTIL);
    if (raw == null) return 0;
    var n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    return 0;
  }
}

function writeUntil(ts) {
  try {
    if (ts > 0) sessionStorage.setItem(STORAGE_UNTIL, String(ts));
    else sessionStorage.removeItem(STORAGE_UNTIL);
  } catch (err) {
    /* ignore */
  }
}

export function activateNightVision(now) {
  var t = now != null ? now : performance.now();
  var next = Math.max(readUntil(), t + NIGHT_VISION_DURATION_MS);
  writeUntil(next);
  return next;
}

export function isNightVisionActive(now) {
  var t = now != null ? now : performance.now();
  return readUntil() > t;
}

export function getNightVisionRemainingMs(now) {
  var t = now != null ? now : performance.now();
  return Math.max(0, readUntil() - t);
}

export function clearNightVision() {
  writeUntil(0);
}

export function useNightVisionPotionFromBackpack(now) {
  if (countItem("night_vision_potion") < 1) return false;
  if (!removeFirstItem("night_vision_potion")) return false;
  activateNightVision(now);
  return true;
}

export function formatNightVisionRemaining(now) {
  var ms = getNightVisionRemainingMs(now);
  var sec = Math.ceil(ms / 1000);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

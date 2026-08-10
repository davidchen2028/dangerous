/**
 * 后室 M.E.G 积分点（Level 0 / Level 1 共用，sessionStorage）
 * 进入 Level 0 视为新一局；L0→L1 切层期间保留，刷新会回到 L0 并清零。
 */
const STORAGE_KEY = "backrooms_meg_points";

/** @type {HTMLElement | null} */
let boundPointsEl = null;

export function bindMegPointsDisplay(el) {
  boundPointsEl = el || null;
  refreshMegPointsDisplay();
}

export function resetMegPoints() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
  refreshMegPointsDisplay();
  return 0;
}

export function getMegPoints() {
  try {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return 0;
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  } catch (err) {
    return 0;
  }
}

function refreshMegPointsDisplay() {
  if (!boundPointsEl) return;
  boundPointsEl.textContent = String(getMegPoints());
}

export function setMegPoints(value) {
  var n = Math.max(0, Math.floor(value));
  try {
    sessionStorage.setItem(STORAGE_KEY, String(n));
  } catch (err) {
    /* ignore */
  }
  refreshMegPointsDisplay();
  return n;
}

export function addMegPoints(delta) {
  return setMegPoints(getMegPoints() + delta);
}

/** @param {HTMLElement | null} el */
export function updateMegPointsDisplay(el) {
  if (el) boundPointsEl = el;
  refreshMegPointsDisplay();
}

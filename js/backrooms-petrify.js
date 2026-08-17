/**
 * 跨层持久化的「石化」状态（源自 Level C-1290）。
 * 存 0..1 的进度；穿过希腊拱门进入 Level 11 后石化仍会继续。
 */
export const PETRIFY_KEY = "backrooms_petrify_v1";

let overlayEl = null;

/** @returns {number | null} 未激活返回 null */
export function getPetrify() {
  try {
    var raw = sessionStorage.getItem(PETRIFY_KEY);
    if (raw == null || raw === "") return null;
    var v = parseFloat(raw);
    if (!Number.isFinite(v)) return null;
    return Math.max(0, Math.min(1, v));
  } catch (err) {
    return null;
  }
}

export function isPetrifyActive() {
  return getPetrify() != null;
}

export function setPetrify(v) {
  var clamped = Math.max(0, Math.min(1, v));
  try {
    sessionStorage.setItem(PETRIFY_KEY, String(clamped));
  } catch (err) {
    /* ignore */
  }
  return clamped;
}

export function clearPetrify() {
  try {
    sessionStorage.removeItem(PETRIFY_KEY);
  } catch (err) {
    /* ignore */
  }
  removePetrifyOverlay();
}

export function ensurePetrifyOverlay() {
  if (overlayEl) return overlayEl;
  var el = document.createElement("div");
  el.id = "backroomsPetrify";
  el.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;" +
    "transition:opacity 0.25s linear;" +
    "background:radial-gradient(circle at 50% 45%, rgba(214,209,198,0) 22%, rgba(198,192,178,0.55) 70%, rgba(120,114,101,0.9) 100%);" +
    "mix-blend-mode:screen;";
  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

export function updatePetrifyOverlay(v) {
  if (!overlayEl) return;
  overlayEl.style.opacity = String(Math.min(0.96, Math.max(0, v)));
}

export function removePetrifyOverlay() {
  if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
  overlayEl = null;
}

/** 石化越深越难移动 */
export function petrifySpeedMul(v) {
  return Math.max(0.15, 1 - v * 0.85);
}

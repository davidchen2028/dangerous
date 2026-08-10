/**
 * 后室各 Level 共用 — 右上角指南针
 * @param {HTMLElement | null} roseEl
 * @param {number} yaw 相机水平转角（弧度）
 */
export function updateBackroomsCompass(roseEl, yaw) {
  if (!roseEl) return;
  roseEl.style.transform =
    "rotate(" + ((Math.PI - yaw) * 180) / Math.PI + "deg)";
}

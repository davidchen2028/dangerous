/**
 * 渲染循环兜底：单帧异常不卡死整条 rAF；连续失败则停循环并限频提示。
 */

const DEFAULT_FAIL_LIMIT = 12;
const DEFAULT_TOAST_MS = 4000;

/**
 * @param {{
 *   label?: string,
 *   tick: () => void,
 *   showError?: (msg: string) => void,
 *   failLimit?: number,
 *   toastEveryMs?: number,
 * }} opts
 * @returns {{ stop: () => void }}
 */
export function startGuardedRafLoop(opts) {
  opts = opts || {};
  var label = opts.label || "Backrooms";
  var tick = opts.tick;
  var showError = opts.showError;
  var failLimit = opts.failLimit > 0 ? opts.failLimit : DEFAULT_FAIL_LIMIT;
  var toastEveryMs = opts.toastEveryMs > 0 ? opts.toastEveryMs : DEFAULT_TOAST_MS;
  var consecutive = 0;
  var lastToastAt = 0;
  var stopped = false;
  var animId = 0;

  function report(err) {
    consecutive += 1;
    console.error("[" + label + "] frame", err);
    var now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (typeof showError === "function" && now - lastToastAt >= toastEveryMs) {
      lastToastAt = now;
      try {
        showError((err && err.message) || String(err));
      } catch (err2) {
        /* ignore */
      }
    }
    if (consecutive >= failLimit) {
      stopped = true;
      if (animId) cancelAnimationFrame(animId);
      if (typeof showError === "function") {
        try {
          showError("画面循环连续异常，已停止渲染。请刷新页面。");
        } catch (err3) {
          /* ignore */
        }
      }
    }
  }

  function frame() {
    if (stopped) return;
    animId = requestAnimationFrame(frame);
    try {
      tick();
      consecutive = 0;
    } catch (err) {
      report(err);
    }
  }

  animId = requestAnimationFrame(frame);
  return {
    stop: function () {
      stopped = true;
      if (animId) cancelAnimationFrame(animId);
    },
  };
}

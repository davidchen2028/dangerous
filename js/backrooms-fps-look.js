/**
 * 后室 FPS — 触屏拖动视角（L0/L1/L2/L3/L283 共用）
 */
export const MOBILE_LOOK_SENS_MULT = 1.35;

export function isTouchPrimaryDevice() {
  var ua = navigator.userAgent || "";
  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return true;
  }
  if (/iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  return false;
}

/**
 * @param {{
 *   captureEl: HTMLElement,
 *   inputEl?: HTMLElement | null,
 *   lookSens: number,
 *   pitchMin?: number,
 *   pitchMax?: number,
 *   getPointerLocked: () => boolean,
 *   getYaw: () => number,
 *   setYaw: (y: number) => void,
 *   getPitch: () => number,
 *   setPitch: (p: number) => void,
 *   shouldBlockDrag?: () => boolean,
 *   shouldBlockPointerLock?: () => boolean,
 *   onDragModeChange?: (useDrag: boolean) => void,
 * }} opts
 */
export function attachMobileDragLook(opts) {
  var useDragLook = isTouchPrimaryDevice();
  if (opts.onDragModeChange) opts.onDragModeChange(useDragLook);

  var lookDragId = null;
  var lookLastX = 0;
  var lookLastY = 0;
  var pitchMin = opts.pitchMin != null ? opts.pitchMin : -1.35;
  var pitchMax = opts.pitchMax != null ? opts.pitchMax : 1.35;
  var cap = opts.captureEl;
  var inputEl = opts.inputEl || null;

  function applyLookDelta(dx, dy, mult) {
    var m = mult != null ? mult : 1;
    opts.setYaw(opts.getYaw() - dx * opts.lookSens * m);
    var p = opts.getPitch() - dy * opts.lookSens * m;
    opts.setPitch(Math.max(pitchMin, Math.min(pitchMax, p)));
  }

  cap.addEventListener(
    "pointerdown",
    function (e) {
      if (opts.shouldBlockDrag && opts.shouldBlockDrag()) return;
      if (!opts.getPointerLocked() && useDragLook) {
        lookDragId = e.pointerId;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
        try {
          cap.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignore */
        }
        e.preventDefault();
        return;
      }
      if (opts.shouldBlockPointerLock && opts.shouldBlockPointerLock()) return;
      if (e.pointerType === "mouse" && e.button === 0 && !opts.getPointerLocked() && cap.requestPointerLock) {
        cap.requestPointerLock();
      }
    },
    { passive: false }
  );

  cap.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  window.addEventListener("pointermove", function (e) {
    if (lookDragId !== e.pointerId) return;
    applyLookDelta(e.clientX - lookLastX, e.clientY - lookLastY, MOBILE_LOOK_SENS_MULT);
    lookLastX = e.clientX;
    lookLastY = e.clientY;
  });

  window.addEventListener("pointerup", function (e) {
    if (lookDragId !== e.pointerId) return;
    try {
      cap.releasePointerCapture(lookDragId);
    } catch (err2) {
      /* ignore */
    }
    lookDragId = null;
  });

  function syncInputDragClass(pointerLocked) {
    if (!inputEl) return;
    inputEl.classList.toggle("backrooms-input--drag", !pointerLocked && useDragLook);
  }

  return {
    isDragLook: function () {
      return useDragLook;
    },
    syncInputDragClass: syncInputDragClass,
  };
}

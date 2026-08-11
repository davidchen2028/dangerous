/**
 * 后室 WebGL 画质档位 — Retina / Safari / M 系 Mac 上默认走轻量路径
 * URL: ?gfx=low | ?gfx=high · localStorage: backrooms_gfx_tier
 */

export const GFX_STORAGE_KEY = "backrooms_gfx_tier";

/** @returns {"auto" | "low" | "high"} */
export function getBackroomsGfxTierOverride() {
  try {
    var params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    var q = params.get("gfx") || params.get("quality");
    if (q === "low" || q === "high") return q;
    var stored = localStorage.getItem(GFX_STORAGE_KEY);
    if (stored === "low" || stored === "high") return stored;
  } catch (err) {
    /* ignore */
  }
  return "auto";
}

function isLikelySafari() {
  if (typeof navigator === "undefined") return false;
  var ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua);
}

/**
 * @returns {{
 *   tier: "low" | "high",
 *   antialias: boolean,
 *   pixelRatio: number,
 *   shadows: boolean,
 *   fluorescentPointLights: boolean,
 *   aimPickEveryNFrames: number,
 * }}
 */
export function resolveBackroomsGfxProfile() {
  var override = getBackroomsGfxTierOverride();
  var dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  var low = override === "low";
  if (override === "auto") {
    // 与 L1 一致：Retina 默认 1x 渲染，避免 M 系 + Safari 掉帧
    low = dpr > 1.05 || isLikelySafari();
  }
  if (override === "high") low = false;

  var pixelCap = low ? 1 : 1.5;

  return {
    tier: low ? "low" : "high",
    antialias: !low,
    pixelRatio: Math.min(dpr, pixelCap),
    shadows: false,
    fluorescentPointLights: !low,
    aimPickEveryNFrames: low ? 2 : 1,
  };
}

/** @param {THREE.WebGLRenderer} renderer */
export function applyBackroomsRendererSize(renderer, width, height, profile) {
  var p = profile || resolveBackroomsGfxProfile();
  renderer.setPixelRatio(p.pixelRatio);
  renderer.setSize(width, height, false);
}

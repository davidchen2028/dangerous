/**
 * 后室 WebGL 画质档位 — Retina / Safari / M 系 Mac 上默认走轻量路径
 * URL: ?gfx=low | ?gfx=high · localStorage: backrooms_gfx_tier
 */

import * as THREE from "three";

export const GFX_STORAGE_KEY = "backrooms_gfx_tier";

/** 全关卡统一 ACES，避免切换时 HDR / emissive 表现跳变 */
export const BACKROOMS_TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const BACKROOMS_TONE_MAPPING_EXPOSURE = 0.95;

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
 *   shadowMapSize: number,
 *   fluorescentPointLights: boolean,
 *   pointLightBudget: number,
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
    // 阴影预算：low（Retina/Safari）关闭，high 开启。无投影光源的关卡仍应显式关闭。
    shadows: !low,
    shadowMapSize: low ? 512 : 2048,
    fluorescentPointLights: !low,
    // 场景同时存在的点光上限：超过 8 个前向渲染的逐片元开销就压不住了
    pointLightBudget: low ? 3 : 6,
    aimPickEveryNFrames: low ? 2 : 1,
  };
}

/** @param {THREE.WebGLRenderer} renderer */
export function applyBackroomsRendererSize(renderer, width, height, profile) {
  var p = profile || resolveBackroomsGfxProfile();
  renderer.setPixelRatio(p.pixelRatio);
  renderer.setSize(width, height, false);
}

/**
 * 统一 HDR tone mapping（ACES）。假 bloom（Additive MeshBasic）可单独 toneMapped:false。
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} [exposure]
 */
export function applyBackroomsToneMapping(renderer, exposure) {
  renderer.toneMapping = BACKROOMS_TONE_MAPPING;
  renderer.toneMappingExposure =
    exposure != null ? exposure : BACKROOMS_TONE_MAPPING_EXPOSURE;
}

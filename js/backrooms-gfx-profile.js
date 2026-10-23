/**
 * 后室 WebGL 画质档位 — Retina / Safari / M 系 Mac 上默认走轻量路径。
 * iPad（含伪装成 Macintosh 的 iPadOS）再降一档：锁 30 帧、压分辨率、收视距。
 * URL: ?gfx=low | ?gfx=high · localStorage: backrooms_gfx_tier
 */

import * as THREE from "three";

export const GFX_STORAGE_KEY = "backrooms_gfx_tier";

/** 全关卡统一 ACES，避免切换时 HDR / emissive 表现跳变 */
export const BACKROOMS_TONE_MAPPING = THREE.ACESFilmicToneMapping;
export const BACKROOMS_TONE_MAPPING_EXPOSURE = 0.95;

/** iPad 绘制像素上限。横屏约 1280×720，Pro 会低于 1x。 */
var IPAD_MAX_DRAW_PIXELS = 1280 * 720;
var IPAD_MAX_FPS = 30;

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

function isLikelySafari(ua) {
  return /Safari/i.test(ua || "") && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua || "");
}

function readBackroomsDevice() {
  var nav = typeof navigator !== "undefined" ? navigator : null;
  return {
    dpr: typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1,
    ua: nav && nav.userAgent ? nav.userAgent : "",
    platform: nav && nav.platform ? nav.platform : "",
    maxTouchPoints: nav && nav.maxTouchPoints ? nav.maxTouchPoints : 0,
  };
}

/** iPad 本体，以及 iPadOS 报成 Macintosh 的情况。 */
export function isBackroomsIpadDevice(device) {
  var info = device || readBackroomsDevice();
  var ua = info.ua || "";
  var platform = info.platform || "";
  var points = info.maxTouchPoints || 0;
  return (
    /iPad/i.test(ua) ||
    (platform === "MacIntel" && points > 1 && !/iPhone|iPod/i.test(ua))
  );
}

/**
 * 雾以外的远平面只增加填充，不增加可见内容。
 * 已经比雾更近的相机保持原值。
 */
export function backroomsCameraFar(cameraFar, fogFar, pad) {
  if (!(pad > 0) || !(fogFar > 0) || !(cameraFar > 0)) return cameraFar;
  var cap = fogFar + pad;
  return cameraFar > cap ? cap : cameraFar;
}

function clampBackroomsCameraFar(scene, camera, pad) {
  if (!camera || !camera.isPerspectiveCamera) return;
  if (!scene || !scene.fog || !(scene.fog.far > 0)) return;
  var next = backroomsCameraFar(camera.far, scene.fog.far, pad);
  if (Math.abs(camera.far - next) < 0.05) return;
  camera.far = next;
  camera.updateProjectionMatrix();
}

function tuneBackroomsRenderer(renderer, profile) {
  if (!renderer || renderer.__brTuned) return;
  renderer.__brTuned = true;
  var pad = profile && profile.cameraFarPad;
  if (!(pad > 0) || typeof renderer.render !== "function") return;
  var orig = renderer.render;
  renderer.render = function (scene, camera) {
    clampBackroomsCameraFar(scene, camera, pad);
    return orig.apply(this, arguments);
  };
}

/**
 * 把 rAF 压到 maxFps。游戏循环是各关卡各自写的，只改一处循环盖不住。
 * @param {number} maxFps
 * @param {Window | { requestAnimationFrame: Function, cancelAnimationFrame?: Function }} [host]
 */
export function installBackroomsFrameCap(maxFps, host) {
  if (!(maxFps > 0)) return;
  var target = host || (typeof window !== "undefined" ? window : null);
  if (!target || target.__brFrameCap || typeof target.requestAnimationFrame !== "function") return;
  target.__brFrameCap = true;
  var minMs = 1000 / maxFps;
  var nativeRaf = target.requestAnimationFrame.bind(target);
  var nativeCancel =
    typeof target.cancelAnimationFrame === "function"
      ? target.cancelAnimationFrame.bind(target)
      : function () {};
  var queue = [];
  var nextId = 1000000;
  var pumpId = 0;
  var nextDue = 0;

  function pump(now) {
    pumpId = 0;
    if (now + 5 < nextDue) {
      pumpId = nativeRaf(pump);
      return;
    }
    nextDue = now + minMs;
    var batch = queue;
    queue = [];
    var i;
    for (i = 0; i < batch.length; i++) {
      if (!batch[i].cancelled) batch[i].cb(now);
    }
  }

  target.requestAnimationFrame = function (cb) {
    var id = nextId++;
    queue.push({ id: id, cb: cb, cancelled: false });
    if (!pumpId) pumpId = nativeRaf(pump);
    return id;
  };

  target.cancelAnimationFrame = function (id) {
    var i;
    for (i = 0; i < queue.length; i++) {
      if (queue[i].id === id) {
        queue[i].cancelled = true;
        return;
      }
    }
    nativeCancel(id);
  };
}

/**
 * @returns {{
 *   tier: "low" | "high",
 *   antialias: boolean,
 *   pixelRatio: number,
 *   maxDrawPixels: number,
 *   shadows: boolean,
 *   shadowMapSize: number,
 *   fluorescentPointLights: boolean,
 *   pointLightBudget: number,
 *   aimPickEveryNFrames: number,
 *   maxFps: number,
 *   cameraFarPad: number,
 *   streamRadius: number | null,
 *   unloadRadius: number | null,
 *   powerPreference: string,
 *   stencil: boolean,
 * }}
 */
export function resolveBackroomsGfxProfile(device) {
  var info = device || readBackroomsDevice();
  var override =
    device && device.override != null ? device.override : getBackroomsGfxTierOverride();
  var dpr = info.dpr > 0 ? info.dpr : 1;
  var ipad = isBackroomsIpadDevice(info);

  if (ipad && override !== "high") {
    var ipadProfile = {
      tier: "low",
      antialias: false,
      pixelRatio: Math.min(dpr, 1),
      maxDrawPixels: IPAD_MAX_DRAW_PIXELS,
      shadows: false,
      shadowMapSize: 512,
      fluorescentPointLights: false,
      pointLightBudget: 1,
      aimPickEveryNFrames: 3,
      maxFps: IPAD_MAX_FPS,
      cameraFarPad: 4,
      streamRadius: 1,
      unloadRadius: 2,
      powerPreference: "default",
      stencil: false,
    };
    if (!device) installBackroomsFrameCap(ipadProfile.maxFps);
    return ipadProfile;
  }

  var low = override === "low";
  if (override === "auto") {
    // 与 L1 一致：Retina 默认 1x 渲染，避免 M 系 + Safari 掉帧
    low = dpr > 1.05 || isLikelySafari(info.ua);
  }
  if (override === "high") low = false;

  var pixelCap = low ? 1 : 1.5;

  return {
    tier: low ? "low" : "high",
    antialias: !low,
    pixelRatio: Math.min(dpr, pixelCap),
    maxDrawPixels: 0,
    shadows: !low,
    shadowMapSize: low ? 512 : 2048,
    fluorescentPointLights: !low,
    // 场景同时存在的点光上限：超过 8 个前向渲染的逐片元开销就压不住了
    pointLightBudget: low ? 3 : 6,
    aimPickEveryNFrames: low ? 2 : 1,
    maxFps: 0,
    cameraFarPad: 0,
    streamRadius: null,
    unloadRadius: null,
    powerPreference: "",
    stencil: true,
  };
}

/** @param {THREE.WebGLRenderer} renderer */
export function applyBackroomsRendererSize(renderer, width, height, profile) {
  var p = profile || resolveBackroomsGfxProfile();
  var ratio = p.pixelRatio > 0 ? p.pixelRatio : 1;
  if (p.maxDrawPixels > 0 && width > 0 && height > 0) {
    var area = width * height;
    if (area * ratio * ratio > p.maxDrawPixels) {
      ratio = Math.sqrt(p.maxDrawPixels / area);
    }
  }
  if (ratio < 0.5) ratio = 0.5;
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  tuneBackroomsRenderer(renderer, p);
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
  tuneBackroomsRenderer(renderer, resolveBackroomsGfxProfile());
}

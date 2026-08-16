/**
 * Level 4 — 背景音乐循环播放
 */

const MUSIC_SRC = "audio/level4-music.mp4";
const MUSIC_VOLUME = 0.35;
export const LEVEL4_MUSIC_FADE_OUT_MS = 800;

/** @type {HTMLAudioElement | null} */
let audio = null;
let gestureBound = false;
let fadeFrame = 0;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(MUSIC_SRC);
  audio.loop = true;
  audio.volume = MUSIC_VOLUME;
  audio.preload = "auto";
  return audio;
}

function bindGestureOnce() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
    window.removeEventListener("touchstart", once);
    gestureBound = false;
    startLevel4Music();
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
  window.addEventListener("touchstart", once, { passive: true });
}

export function startLevel4Music() {
  var el = ensureAudio();
  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
  }
  el.volume = MUSIC_VOLUME;
  if (!el.paused) return;
  var p = el.play();
  // 浏览器要求先有用户交互才允许带声播放：被拒绝时等首次交互重试
  if (p && typeof p.catch === "function") {
    p.catch(function () {
      bindGestureOnce();
    });
  }
}

export function fadeOutLevel4Music(durationMs) {
  var el = audio;
  var duration = Math.max(
    0,
    durationMs == null ? LEVEL4_MUSIC_FADE_OUT_MS : durationMs
  );
  if (!el || el.paused || duration === 0) {
    stopLevel4Music();
    return Promise.resolve();
  }
  if (fadeFrame) cancelAnimationFrame(fadeFrame);
  var startedAt = performance.now();
  var startedVolume = el.volume;
  return new Promise(function (resolve) {
    function step(now) {
      var progress = Math.min(1, (now - startedAt) / duration);
      el.volume = startedVolume * (1 - progress);
      if (progress < 1) {
        fadeFrame = requestAnimationFrame(step);
        return;
      }
      fadeFrame = 0;
      stopLevel4Music();
      resolve();
    }
    fadeFrame = requestAnimationFrame(step);
  });
}

export function stopLevel4Music() {
  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
  }
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = MUSIC_VOLUME;
  } catch (err) {
    /* ignore */
  }
}

export function bindLevel4Music() {
  startLevel4Music();
  window.addEventListener("pagehide", stopLevel4Music);
}

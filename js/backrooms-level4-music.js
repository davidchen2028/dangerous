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
let audioFailed = false;
let pagehideBound = false;
let ambientCtx = null;
let humOsc = null;
let humGain = null;

function ensureAmbient() {
  if (ambientCtx) return ambientCtx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ambientCtx = new AC();
  return ambientCtx;
}

function startOfficeHum() {
  var ac = ensureAmbient();
  if (!ac) return;
  if (ac.state === "suspended" || ac.state === "interrupted") {
    var resumed = ac.resume();
    if (resumed && typeof resumed.catch === "function") resumed.catch(function () {});
  }
  if (humOsc) return;
  humGain = ac.createGain();
  humGain.gain.value = 0.018;
  humGain.connect(ac.destination);
  humOsc = ac.createOscillator();
  humOsc.type = "sine";
  humOsc.frequency.value = 60;
  humOsc.connect(humGain);
  humOsc.start();
}

export function playLevel4Sfx(kind) {
  var ac = ensureAmbient();
  if (!ac) return;
  function emit() {
    if (ambientCtx !== ac || ac.state !== "running") return;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    var now = ac.currentTime;
    var from = kind === "danger" ? 680 : kind === "water" ? 240 : kind === "entity" ? 110 : 160;
    var to = kind === "danger" ? 90 : kind === "water" ? 420 : kind === "entity" ? 55 : 360;
    osc.type = kind === "danger" || kind === "entity" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + 0.24);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
  if (ac.state === "running") {
    emit();
  } else if (ac.state === "suspended" || ac.state === "interrupted") {
    var resumed = ac.resume();
    if (resumed && typeof resumed.then === "function") resumed.then(emit).catch(function () {});
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(MUSIC_SRC);
  audio.loop = true;
  audio.volume = MUSIC_VOLUME;
  audio.preload = "auto";
  audio.addEventListener("error", function () {
    audioFailed = true;
    console.warn("[Backrooms L4] 背景音乐加载失败", MUSIC_SRC, audio && audio.error);
  });
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
  if (audioFailed) return;
  startOfficeHum();
  var el = ensureAudio();
  if (audioFailed) return;
  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
  }
  el.volume = MUSIC_VOLUME;
  if (!el.paused) return;
  var p = el.play();
  // 浏览器要求先有用户交互才允许带声播放：被拒绝时等首次交互重试
  if (p && typeof p.catch === "function") {
    p.catch(function (err) {
      if (audioFailed || (el && el.error)) {
        audioFailed = true;
        console.warn("[Backrooms L4] 背景音乐无法播放", MUSIC_SRC, err);
        return;
      }
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
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      fadeFrame = 0;
      stopLevel4Music();
      resolve();
    }
    function step(now) {
      try {
        var progress = Math.min(1, (now - startedAt) / duration);
        el.volume = startedVolume * (1 - progress);
        if (progress < 1) {
          fadeFrame = requestAnimationFrame(step);
          return;
        }
      } catch (err) {
        // 音频元素异常时直接收尾，绝不让调用方永远等待。
      }
      finish();
    }
    // rAF 在后台标签页会被完全暂停，这里用计时器兜底收尾。
    setTimeout(finish, duration + 250);
    fadeFrame = requestAnimationFrame(step);
  });
}

export function stopLevel4Music() {
  if (fadeFrame) {
    cancelAnimationFrame(fadeFrame);
    fadeFrame = 0;
  }
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = MUSIC_VOLUME;
    } catch (err) {
      /* ignore */
    }
  }
  if (humOsc) {
    try {
      humOsc.stop();
      humOsc.disconnect();
    } catch (err2) {
      /* ignore */
    }
    humOsc = null;
  }
  if (humGain) humGain.disconnect();
  humGain = null;
  if (ambientCtx) {
    ambientCtx.close();
    ambientCtx = null;
  }
}

export function bindLevel4Music() {
  startLevel4Music();
  if (!pagehideBound) {
    pagehideBound = true;
    window.addEventListener("pagehide", stopLevel4Music);
  }
}

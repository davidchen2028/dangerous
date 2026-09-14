/**
 * Level 81 — 雨声、旧谣与远处猫头鹰。
 */
let ctx = null;
let started = false;
let gestureBound = false;
let rainSource = null;
let rainGain = null;
let rainFilter = null;
let songTimer = 0;
let owlAt = 0;
let restBlend = 0;

const LULLABY = [196, 220, 247, 262, 247, 220, 196, 165];

function ensureContext() {
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function createNoiseBuffer(ac, seconds) {
  var length = Math.max(1, Math.floor(ac.sampleRate * seconds));
  var buffer = ac.createBuffer(1, length, ac.sampleRate);
  var data = buffer.getChannelData(0);
  var value = 0;
  var i;
  for (i = 0; i < length; i++) {
    value = value * 0.975 + (Math.random() * 2 - 1) * 0.055;
    data[i] = value;
  }
  return buffer;
}

function runWhenReady(ac, fn) {
  if (ac.state === "running") {
    fn();
    return;
  }
  var resumed = ac.resume();
  if (resumed && typeof resumed.then === "function") {
    resumed.then(fn).catch(function () {});
  }
}

function playTone(freq, dur, gainVal) {
  if (!ctx || ctx.state !== "running") return;
  var osc = ctx.createOscillator();
  var filter = ctx.createBiquadFilter();
  var gain = ctx.createGain();
  var t = ctx.currentTime;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq * (0.992 + Math.random() * 0.016), t);
  filter.type = "lowpass";
  filter.frequency.value = 780;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainVal, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function playOwl() {
  if (!ctx || ctx.state !== "running") return;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  var t = ctx.currentTime;
  osc.type = "sine";
  osc.frequency.setValueAtTime(312, t);
  osc.frequency.exponentialRampToValueAtTime(188, t + 0.22);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.028, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.42);
}

export function startLevel81Audio() {
  if (started) return;
  var ac = ensureContext();
  if (!ac) return;
  runWhenReady(ac, function () {
    if (started || ctx !== ac || ac.state !== "running") return;
    rainSource = ac.createBufferSource();
    rainSource.buffer = createNoiseBuffer(ac, 2.8);
    rainSource.loop = true;
    rainFilter = ac.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1680;
    rainFilter.Q.value = 0.55;
    rainGain = ac.createGain();
    rainGain.gain.value = 0.0001;
    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(ac.destination);
    rainSource.start();
    rainGain.gain.setTargetAtTime(0.034, ac.currentTime, 0.6);
    started = true;
    songTimer = 0;
    owlAt = performance.now() + 9000;
  });
}

export function updateLevel81Audio(now, resting) {
  restBlend += ((resting ? 1 : 0) - restBlend) * 0.04;
  if (!started || !ctx || !rainGain) return;
  rainGain.gain.setTargetAtTime(0.03 + restBlend * 0.018, ctx.currentTime, 0.35);
  if (now >= owlAt) {
    owlAt = now + 11000 + Math.random() * 9000;
    playOwl();
  }
  if (now - songTimer < 2200 - restBlend * 280) return;
  songTimer = now;
  var note = LULLABY[Math.floor(Math.random() * LULLABY.length)];
  playTone(note, 1.35 + restBlend * 0.4, 0.012 + restBlend * 0.01);
}

export function bindLevel81AudioOnGesture() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    startLevel81Audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

export function stopLevel81Audio() {
  if (rainSource) {
    try {
      rainSource.stop();
    } catch (_err) {}
    try {
      rainSource.disconnect();
    } catch (_err2) {}
  }
  rainSource = null;
  rainGain = null;
  rainFilter = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (_err3) {}
    ctx = null;
  }
}

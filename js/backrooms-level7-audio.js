/**
 * Level 7 — 海浪与落水。无常驻音乐。
 */
let ctx = null;
let oceanSource = null;
let oceanGain = null;
let oceanFilter = null;
let started = false;
let gestureBound = false;

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
    value = value * 0.982 + (Math.random() * 2 - 1) * 0.045;
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

export function startLevel7Audio() {
  if (started) return;
  var ac = ensureContext();
  if (!ac) return;
  runWhenReady(ac, function () {
    if (started || ctx !== ac || ac.state !== "running") return;
    oceanSource = ac.createBufferSource();
    oceanSource.buffer = createNoiseBuffer(ac, 3.2);
    oceanSource.loop = true;
    oceanFilter = ac.createBiquadFilter();
    oceanFilter.type = "lowpass";
    oceanFilter.frequency.value = 620;
    oceanFilter.Q.value = 0.55;
    oceanGain = ac.createGain();
    oceanGain.gain.value = 0.0001;
    oceanSource.connect(oceanFilter);
    oceanFilter.connect(oceanGain);
    oceanGain.connect(ac.destination);
    oceanSource.start();
    oceanGain.gain.setTargetAtTime(0.085, ac.currentTime, 0.45);
    started = true;
  });
}

export function updateLevel7Audio(inWater, sinkProgress) {
  if (!started || !ctx || !oceanGain || !oceanFilter) return;
  var now = ctx.currentTime;
  var progress = Math.max(0, Math.min(1, Number(sinkProgress) || 0));
  var gain = inWater ? 0.035 + progress * 0.02 : 0.085;
  var cutoff = inWater ? 180 - progress * 70 : 620;
  oceanGain.gain.setTargetAtTime(Math.max(0.0001, gain), now, 0.28);
  oceanFilter.frequency.setTargetAtTime(cutoff, now, 0.22);
}

export function playLevel7Splash() {
  var ac = ensureContext();
  if (!ac) return;
  runWhenReady(ac, function () {
    if (ctx !== ac || ac.state !== "running") return;
    var source = ac.createBufferSource();
    source.buffer = createNoiseBuffer(ac, 0.55);
    var filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 340;
    filter.Q.value = 1.1;
    var gain = ac.createGain();
    var t = ac.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start(t);
    source.stop(t + 0.52);
  });
}

export function bindLevel7AudioOnGesture() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    startLevel7Audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

export function stopLevel7Audio() {
  if (oceanSource) {
    try {
      oceanSource.stop();
    } catch (_err) {}
    try {
      oceanSource.disconnect();
    } catch (_err2) {}
  }
  oceanSource = null;
  oceanGain = null;
  oceanFilter = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (_err3) {}
    ctx = null;
  }
}

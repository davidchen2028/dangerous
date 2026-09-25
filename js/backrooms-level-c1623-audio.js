/**
 * Level C-1623 — 二十的低频与三十的切断节拍。
 */
let ctx = null;
let started = false;
let gestureBound = false;
let twenty = null;
let thirty = null;
let gain = null;

function ensureContext() {
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
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

export function startC1623Audio() {
  if (started) return;
  var ac = ensureContext();
  if (!ac) return;
  runWhenReady(ac, function () {
    if (started || ctx !== ac || ac.state !== "running") return;
    gain = ac.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ac.destination);
    twenty = ac.createOscillator();
    twenty.type = "sine";
    twenty.frequency.value = 20 * 11;
    thirty = ac.createOscillator();
    thirty.type = "triangle";
    thirty.frequency.value = 30 * 8;
    twenty.connect(gain);
    thirty.connect(gain);
    twenty.start();
    thirty.start();
    gain.gain.setTargetAtTime(0.014, ac.currentTime, 0.9);
    started = true;
  });
}

export function updateC1623Audio(inVoid) {
  if (!started || !ctx || !gain) return;
  gain.gain.setTargetAtTime(inVoid ? 0.028 : 0.013, ctx.currentTime, 0.25);
}

export function bindC1623AudioOnGesture() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    startC1623Audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

export function stopC1623Audio() {
  if (twenty) {
    try {
      twenty.stop();
    } catch (_err) {}
  }
  if (thirty) {
    try {
      thirty.stop();
    } catch (_err2) {}
  }
  twenty = null;
  thirty = null;
  gain = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (_err3) {}
    ctx = null;
  }
}

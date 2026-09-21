/**
 * Level √2 — 稀疏正弦与素数节拍。
 */
let ctx = null;
let started = false;
let gestureBound = false;
let drone = null;
let droneGain = null;
let nextClick = 0;

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

export function startSqrt2Audio() {
  if (started) return;
  var ac = ensureContext();
  if (!ac) return;
  runWhenReady(ac, function () {
    if (started || ctx !== ac || ac.state !== "running") return;
    drone = ac.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 220 * Math.SQRT2;
    droneGain = ac.createGain();
    droneGain.gain.value = 0.0001;
    drone.connect(droneGain);
    droneGain.connect(ac.destination);
    drone.start();
    droneGain.gain.setTargetAtTime(0.018, ac.currentTime, 0.8);
    started = true;
    nextClick = performance.now() + 1800;
  });
}

export function updateSqrt2Audio(now, shifting) {
  if (!started || !ctx || !drone || !droneGain) return;
  var t = ctx.currentTime;
  drone.frequency.setTargetAtTime(220 * Math.SQRT2 * (shifting ? 1.06 : 1), t, 0.25);
  droneGain.gain.setTargetAtTime(shifting ? 0.03 : 0.016, t, 0.2);
  if (now < nextClick) return;
  nextClick = now + 1400 + Math.random() * 2200;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = 330 + Math.random() * 190;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.04, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

export function bindSqrt2AudioOnGesture() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    startSqrt2Audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

export function stopSqrt2Audio() {
  if (drone) {
    try {
      drone.stop();
    } catch (_err) {}
    try {
      drone.disconnect();
    } catch (_err2) {}
  }
  drone = null;
  droneGain = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (_err3) {}
    ctx = null;
  }
}

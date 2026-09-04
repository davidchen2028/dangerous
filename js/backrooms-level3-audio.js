/**
 * Level 3 — 电网低频嗡鸣（Web Audio）
 */

let ctx = null;
let humGain = null;
/** @type {OscillatorNode[]} */
let oscillators = [];
/** @type {GainNode[]} */
let extraGains = [];
let started = false;

function ensureCtx() {
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function playTone(type, fromHz, toHz, duration, volume) {
  var ac = ensureCtx();
  if (!ac || ac.state !== "running") return;
  var osc = ac.createOscillator();
  var gain = ac.createGain();
  var now = ac.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(fromHz, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function playLevel3PipeBurst(kind) {
  playTone(kind === "acid" ? "sawtooth" : "triangle", kind === "acid" ? 180 : 520, 70, 0.28, 0.045);
}

export function playLevel3ElevatorStart() {
  playTone("sine", 72, 150, 0.75, 0.06);
  playTone("triangle", 116, 420, 1.4, 0.025);
}

export function playLevel3EntityAttack(kind) {
  playTone("sawtooth", kind === "moth" ? 820 : 150, kind === "moth" ? 240 : 55, 0.2, 0.055);
}

export function startLevel3Hum() {
  if (started) return;
  var ac = ensureCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume();

  humGain = ac.createGain();
  humGain.gain.value = 0.038;
  humGain.connect(ac.destination);

  var osc1 = ac.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 58;
  osc1.connect(humGain);
  oscillators.push(osc1);

  // osc2 旁路 humGain：LFO 只调制主嗡鸣，辅音保持恒定底噪
  var osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 116;
  var g2 = ac.createGain();
  g2.gain.value = 0.012;
  osc2.connect(g2);
  g2.connect(ac.destination);
  extraGains.push(g2);
  oscillators.push(osc2);

  var lfo = ac.createOscillator();
  lfo.frequency.value = 0.35;
  var lfoGain = ac.createGain();
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain);
  lfoGain.connect(humGain.gain);
  oscillators.push(lfo);

  osc1.start();
  osc2.start();
  lfo.start();
  started = true;
}

export function stopLevel3Hum() {
  var i;
  for (i = 0; i < oscillators.length; i++) {
    try {
      oscillators[i].stop();
      oscillators[i].disconnect();
    } catch (err) {
      /* ignore */
    }
  }
  for (i = 0; i < extraGains.length; i++) {
    try {
      extraGains[i].disconnect();
    } catch (err2) {
      /* ignore */
    }
  }
  if (humGain) {
    try {
      humGain.disconnect();
    } catch (err3) {
      /* ignore */
    }
  }
  oscillators.length = 0;
  extraGains.length = 0;
  humGain = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (err4) {
      /* ignore */
    }
    ctx = null;
  }
}

export function bindLevel3HumOnGesture() {
  function once() {
    startLevel3Hum();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

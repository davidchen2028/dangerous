/**
 * Level 3 — 电网低频嗡鸣（Web Audio）
 */

let ctx = null;
let humGain = null;
let started = false;

function ensureCtx() {
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
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

  var osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 116;
  var g2 = ac.createGain();
  g2.gain.value = 0.012;
  osc2.connect(g2);
  g2.connect(ac.destination);
  osc2.start();

  var lfo = ac.createOscillator();
  lfo.frequency.value = 0.35;
  var lfoGain = ac.createGain();
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain);
  lfoGain.connect(humGain.gain);
  lfo.start();

  osc1.start();
  started = true;
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

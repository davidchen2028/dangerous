/**
 * Level 6「熄灯」音频：无常驻音乐，只有远处海浪与稀疏幻听。
 */
let ctx = null;
let oceanSource = null;
let oceanGain = null;
let oceanPan = null;
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
  for (var i = 0; i < length; i++) {
    value = value * 0.985 + (Math.random() * 2 - 1) * 0.04;
    data[i] = value;
  }
  return buffer;
}

export function computeLevel6OceanCue(progress, targetAngle, yaw) {
  progress = Math.max(0, Math.min(1, Number(progress) || 0));
  var gain = progress <= 0.35 ? 0 : Math.pow((progress - 0.35) / 0.65, 1.7) * 0.075;
  var relative = targetAngle - yaw;
  while (relative > Math.PI) relative -= Math.PI * 2;
  while (relative < -Math.PI) relative += Math.PI * 2;
  return { gain: gain, pan: Math.max(-1, Math.min(1, Math.sin(relative))) };
}

export function startLevel6Audio() {
  if (started) return;
  var ac = ensureContext();
  if (!ac) return;
  function begin() {
    if (started || ctx !== ac || ac.state !== "running") return;
    oceanSource = ac.createBufferSource();
    oceanSource.buffer = createNoiseBuffer(ac, 2.5);
    oceanSource.loop = true;
    var low = ac.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 430;
    low.Q.value = 0.6;
    oceanGain = ac.createGain();
    oceanGain.gain.value = 0.0001;
    oceanPan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    oceanSource.connect(low);
    low.connect(oceanGain);
    if (oceanPan) {
      oceanGain.connect(oceanPan);
      oceanPan.connect(ac.destination);
    } else {
      oceanGain.connect(ac.destination);
    }
    oceanSource.start();
    started = true;
  }
  if (ac.state === "running") begin();
  else {
    var resumed = ac.resume();
    if (resumed && typeof resumed.then === "function") {
      resumed.then(begin).catch(function () {});
    }
  }
}

export function updateLevel6Ocean(progress, targetAngle, yaw) {
  if (!started || !ctx || !oceanGain) return;
  var cue = computeLevel6OceanCue(progress, targetAngle, yaw);
  var now = ctx.currentTime;
  oceanGain.gain.cancelScheduledValues(now);
  oceanGain.gain.setTargetAtTime(Math.max(0.0001, cue.gain), now, 0.35);
  if (oceanPan) oceanPan.pan.setTargetAtTime(cue.pan, now, 0.18);
}

function playNoiseBurst(duration, volume, pan, highpass) {
  var ac = ensureContext();
  if (!ac) return;
  function emit() {
    if (ctx !== ac || ac.state !== "running") return;
    var source = ac.createBufferSource();
    source.buffer = createNoiseBuffer(ac, duration + 0.1);
    var filter = ac.createBiquadFilter();
    filter.type = highpass ? "highpass" : "bandpass";
    filter.frequency.value = highpass ? 900 : 230;
    filter.Q.value = highpass ? 0.7 : 2.5;
    var gain = ac.createGain();
    var panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
    var now = ac.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
      gain.connect(panner);
      panner.connect(ac.destination);
    } else {
      gain.connect(ac.destination);
    }
    source.start(now);
    source.stop(now + duration + 0.05);
  }
  if (ac.state === "running") emit();
  else {
    var resumed = ac.resume();
    if (resumed && typeof resumed.then === "function") {
      resumed.then(emit).catch(function () {});
    }
  }
}

export function playLevel6Hallucination(kind, pan) {
  if (kind === "breath") playNoiseBurst(1.1, 0.035, pan, true);
  else if (kind === "whisper") playNoiseBurst(0.75, 0.028, pan, false);
  else {
    playNoiseBurst(0.09, 0.055, pan, true);
    window.setTimeout(function () {
      playNoiseBurst(0.08, 0.045, (pan || 0) * 0.8, true);
    }, 190);
  }
}

export function playLevel6Switch() {
  playNoiseBurst(0.07, 0.065, 0, true);
}

export function bindLevel6AudioOnGesture() {
  if (gestureBound) return;
  gestureBound = true;
  function once() {
    startLevel6Audio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  }
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once, { passive: true });
}

export function stopLevel6Audio() {
  if (oceanSource) {
    try {
      oceanSource.stop();
    } catch (err) {
      /* already stopped */
    }
    try {
      oceanSource.disconnect();
    } catch (err2) {
      /* ignore */
    }
  }
  oceanSource = null;
  oceanGain = null;
  oceanPan = null;
  started = false;
  if (ctx) {
    try {
      ctx.close();
    } catch (err3) {
      /* ignore */
    }
    ctx = null;
  }
}

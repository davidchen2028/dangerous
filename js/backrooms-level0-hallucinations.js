/**
 * Level 0 非实体幻觉池。
 *
 * 这里只产生屏幕覆盖层、程序化音频和短暂的镜头/环境参数变化；
 * 不创建场景物体、碰撞体，也不直接扣除生命值。
 */

var EVENT_DEFS = {
  hum: { duration: 6200, sanityDrain: 0.08 },
  projection: { duration: 3900, sanityDrain: 0.16 },
  peripheral: { duration: 3100, sanityDrain: 0.22 },
  voice: { duration: 4300, sanityDrain: 0.3 },
  deja: { duration: 5200, sanityDrain: 0.42 },
  co2: { duration: 7600, sanityDrain: 0.72 },
};

var EVENT_NAMES = [
  "hum",
  "projection",
  "peripheral",
  "voice",
  "deja",
  "co2",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  var t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function safeCall(fn, value) {
  if (typeof fn !== "function") return;
  try {
    fn(value);
  } catch (err) {
    /* 外部视觉/音量桥接失败不应中断游戏循环。 */
  }
}

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.fxCanvas
 * @param {object} deps.camera
 * @param {Function} deps.getPlayer
 * @param {Function} deps.getSurvival
 * @param {Function} deps.isPaused
 * @param {Function} deps.showToast
 * @param {Function} deps.setMusicDuck
 * @param {Function} deps.setLightHallucinationMul
 */
export function createLevel0HallucinationPool(deps) {
  deps = deps || {};

  var canvas = deps.fxCanvas || null;
  var ctx = null;
  try {
    ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  } catch (err) {
    ctx = null;
  }

  var camera = deps.camera || null;
  var originalFov =
    camera && typeof camera.fov === "number" ? camera.fov : null;
  var eventBaseFov = originalFov;

  var state = "idle";
  var activeEvent = null;
  var eventStartedAt = 0;
  var eventEndsAt = 0;
  var nextEventAt = 0;
  var lastNow = 0;
  var cooldownMs = 0;
  var suspended = false;
  var suspendedAt = 0;
  var pausedAt = 0;
  var disposed = false;
  var afterglowUntil = 0;
  var afterglowStrength = 0;
  var eventSerial = 0;
  var projectionKind = "door";
  var peripheralKind = "figure";
  var peripheralSide = 1;
  var voiceMessage = "";
  var sanityDrain = 0;
  var musicMul = 1;
  var lightMul = 1;

  var reducedMotion = false;
  var motionQuery = null;
  function syncReducedMotion() {
    reducedMotion = !!(motionQuery && motionQuery.matches);
  }
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      syncReducedMotion();
      if (motionQuery.addEventListener) {
        motionQuery.addEventListener("change", syncReducedMotion);
      } else if (motionQuery.addListener) {
        motionQuery.addListener(syncReducedMotion);
      }
    }
  } catch (err) {
    motionQuery = null;
  }

  var audioContext = null;
  var audioMaster = null;
  var audioFailed = false;
  var gestureUnlocked = false;
  var gestureBound = false;
  var activeAudioNodes = [];

  function trackAudioNode(node) {
    if (!node) return node;
    activeAudioNodes.push(node);
    return node;
  }

  function stopEventAudio() {
    for (var i = 0; i < activeAudioNodes.length; i++) {
      var node = activeAudioNodes[i];
      try {
        if (node.stop) node.stop();
      } catch (err) {
        /* 已停止的 AudioScheduledSourceNode 会抛异常。 */
      }
      try {
        node.disconnect();
      } catch (err2) {
        /* ignore */
      }
    }
    activeAudioNodes.length = 0;
    if (audioMaster && audioContext) {
      try {
        audioMaster.gain.cancelScheduledValues(audioContext.currentTime);
        audioMaster.gain.setValueAtTime(0.0001, audioContext.currentTime);
      } catch (err3) {
        /* ignore */
      }
    }
  }

  function ensureAudioAfterGesture() {
    if (!gestureUnlocked || audioFailed || disposed) return null;
    if (audioContext) {
      if (audioContext.state === "suspended") {
        try {
          var resumed = audioContext.resume();
          if (resumed && resumed.catch) resumed.catch(function () {});
        } catch (err) {
          /* ignore */
        }
      }
      return audioContext;
    }
    try {
      var AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        audioFailed = true;
        return null;
      }
      audioContext = new AudioContextClass();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = 0.0001;
      audioMaster.connect(audioContext.destination);
      return audioContext;
    } catch (err2) {
      audioContext = null;
      audioMaster = null;
      audioFailed = true;
      return null;
    }
  }

  function createNoiseBuffer(seconds) {
    if (!audioContext) return null;
    var length = Math.max(
      1,
      Math.floor(audioContext.sampleRate * seconds)
    );
    var buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i++) {
      var white = Math.random() * 2 - 1;
      last = last * 0.965 + white * 0.035;
      data[i] = white * 0.28 + last * 0.72;
    }
    return buffer;
  }

  function connectOscillator(type, frequency, destination) {
    var osc = trackAudioNode(audioContext.createOscillator());
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(destination);
    return osc;
  }

  function playHumAudio(progress) {
    var ac = audioContext;
    var now = ac.currentTime;
    var remaining = Math.max(0.08, (1 - progress) * EVENT_DEFS.hum.duration / 1000);
    var loudTime = Math.max(0.04, remaining * 0.72);
    var bus = ac.createGain();
    var lowpass = ac.createBiquadFilter();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.13, now + loudTime);
    bus.gain.setValueAtTime(0.0001, now + Math.min(remaining, loudTime + 0.015));
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1450;
    bus.connect(lowpass);
    lowpass.connect(audioMaster);
    var a = connectOscillator("sawtooth", 59.8, bus);
    var b = connectOscillator("sine", 119.6, bus);
    b.detune.value = 7;
    a.start(now);
    b.start(now);
    a.stop(now + remaining);
    b.stop(now + remaining);
    audioMaster.gain.setValueAtTime(0.7, now);
  }

  function playVoiceAudio(progress) {
    var ac = audioContext;
    var now = ac.currentTime;
    var remaining = Math.max(0.1, (1 - progress) * EVENT_DEFS.voice.duration / 1000);
    var bus = ac.createGain();
    var formant = ac.createBiquadFilter();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.11, now + 0.16);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(remaining, 2.7));
    formant.type = "bandpass";
    formant.frequency.value = 520 + Math.random() * 180;
    formant.Q.value = 5.5;
    bus.connect(formant);
    formant.connect(audioMaster);
    var voice = connectOscillator("sawtooth", 78 + Math.random() * 22, bus);
    var tremolo = trackAudioNode(ac.createOscillator());
    var tremoloGain = ac.createGain();
    tremolo.frequency.value = 4.2;
    tremoloGain.gain.value = 0.035;
    tremolo.connect(tremoloGain);
    tremoloGain.connect(bus.gain);
    voice.frequency.linearRampToValueAtTime(
      62 + Math.random() * 12,
      now + Math.min(2.2, remaining)
    );
    voice.start(now);
    tremolo.start(now);
    voice.stop(now + remaining);
    tremolo.stop(now + remaining);
    audioMaster.gain.setValueAtTime(0.72, now);
  }

  function playBreathAudio(progress) {
    var ac = audioContext;
    var now = ac.currentTime;
    var remaining = Math.max(0.1, (1 - progress) * EVENT_DEFS.co2.duration / 1000);
    var source = trackAudioNode(ac.createBufferSource());
    var band = ac.createBiquadFilter();
    var breathGain = ac.createGain();
    var lfo = trackAudioNode(ac.createOscillator());
    var lfoGain = ac.createGain();
    source.buffer = createNoiseBuffer(Math.max(0.25, remaining));
    band.type = "bandpass";
    band.frequency.value = 460;
    band.Q.value = 1.1;
    breathGain.gain.value = 0.055;
    lfo.frequency.value = 0.42;
    lfoGain.gain.value = 0.045;
    source.connect(band);
    band.connect(breathGain);
    lfo.connect(lfoGain);
    lfoGain.connect(breathGain.gain);
    breathGain.connect(audioMaster);
    source.start(now);
    lfo.start(now);
    source.stop(now + remaining);
    lfo.stop(now + remaining);
    audioMaster.gain.setValueAtTime(0.68, now);
  }

  function playTransientAudio(kind, progress) {
    var ac = audioContext;
    var now = ac.currentTime;
    var remaining = Math.max(0.1, (1 - progress) * EVENT_DEFS[kind].duration / 1000);
    var bus = ac.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(
      kind === "peripheral" ? 0.09 : 0.065,
      now + 0.025
    );
    bus.gain.exponentialRampToValueAtTime(
      0.0001,
      now + Math.min(remaining, kind === "deja" ? 1.8 : 0.65)
    );
    bus.connect(audioMaster);
    var osc = connectOscillator(
      kind === "projection" ? "sine" : "triangle",
      kind === "projection" ? 285 : kind === "deja" ? 112 : 48,
      bus
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "projection" ? 170 : 34,
      now + Math.min(remaining, 0.65)
    );
    osc.start(now);
    osc.stop(now + Math.min(remaining, 1.9));
    audioMaster.gain.setValueAtTime(0.62, now);
  }

  function startAudioForCurrent() {
    if (!activeEvent || suspended || disposed) return;
    var ac = ensureAudioAfterGesture();
    if (!ac || !audioMaster) return;
    stopEventAudio();
    var progress = clamp(
      (lastNow - eventStartedAt) / (eventEndsAt - eventStartedAt || 1),
      0,
      1
    );
    try {
      if (activeEvent === "hum") playHumAudio(progress);
      else if (activeEvent === "voice") playVoiceAudio(progress);
      else if (activeEvent === "co2") playBreathAudio(progress);
      else playTransientAudio(activeEvent, progress);
    } catch (err) {
      stopEventAudio();
    }
  }

  function onFirstGesture() {
    gestureUnlocked = true;
    unbindGesture();
    ensureAudioAfterGesture();
    startAudioForCurrent();
  }

  function bindGesture() {
    if (
      gestureBound ||
      typeof window === "undefined" ||
      disposed
    ) {
      return;
    }
    gestureBound = true;
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture, { passive: true });
    window.addEventListener("touchstart", onFirstGesture, { passive: true });
  }

  function unbindGesture() {
    if (!gestureBound || typeof window === "undefined") return;
    gestureBound = false;
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("keydown", onFirstGesture);
    window.removeEventListener("touchstart", onFirstGesture);
  }

  function setMusic(value) {
    value = clamp(value, 0, 1);
    if (Math.abs(value - musicMul) < 0.005) return;
    musicMul = value;
    safeCall(deps.setMusicDuck, value);
  }

  function setLight(value) {
    value = clamp(value, 0.05, 1.5);
    if (Math.abs(value - lightMul) < 0.005) return;
    lightMul = value;
    safeCall(deps.setLightHallucinationMul, value);
  }

  function applyFov(value) {
    if (!camera || typeof camera.fov !== "number") return;
    if (Math.abs(camera.fov - value) < 0.01) return;
    camera.fov = value;
    if (typeof camera.updateProjectionMatrix === "function") {
      camera.updateProjectionMatrix();
    }
  }

  function restoreEventFov() {
    if (eventBaseFov != null) applyFov(eventBaseFov);
  }

  function resetEffects() {
    sanityDrain = 0;
    setMusic(1);
    setLight(1);
    restoreEventFov();
  }

  function getSanityRatio() {
    var survival = null;
    try {
      survival =
        typeof deps.getSurvival === "function" ? deps.getSurvival() : null;
    } catch (err) {
      survival = null;
    }
    if (!survival || typeof survival.sanity !== "number") return 1;
    var maximum =
      typeof survival.maxSanity === "number"
        ? survival.maxSanity
        : typeof survival.sanityMax === "number"
          ? survival.sanityMax
          : 100;
    return clamp(survival.sanity / Math.max(1, maximum), 0, 1);
  }

  function chooseEvent() {
    var lowSanity = 1 - getSanityRatio();
    var weights = [
      1.35 - lowSanity * 0.45,
      1.15,
      0.9 + lowSanity * 0.8,
      0.72 + lowSanity * 1.1,
      0.55 + lowSanity * 1.35,
      0.42 + lowSanity * 1.55,
    ];
    if (lastNow < afterglowUntil) {
      weights[0] *= 1.35;
      weights[2] *= 1.8;
      weights[3] *= 2.1;
      weights[4] *= 2.25;
    }
    var total = 0;
    var i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var roll = Math.random() * total;
    for (i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return EVENT_NAMES[i];
    }
    return "hum";
  }

  function scheduleNext(now) {
    var frequencyMul = 1;
    try {
      if (typeof deps.getFrequencyMultiplier === "function") {
        frequencyMul = Math.max(0.5, Number(deps.getFrequencyMultiplier()) || 1);
      }
    } catch (err) {
      frequencyMul = 1;
    }
    if (now < afterglowUntil) frequencyMul *= 0.38;
    cooldownMs = randomBetween(10500, 22500) * frequencyMul;
    nextEventAt = now + cooldownMs;
    state = "cooldown";
  }

  function notifyEvent(kind) {
    if (typeof deps.showToast !== "function") return;
    var text = "";
    if (kind === "hum") text = "嗡鸣越来越近。";
    else if (kind === "projection") text = "前面刚才有一条路。";
    else if (kind === "peripheral") text = "余光里有什么动了一下。";
    else if (kind === "voice") text = voiceMessage;
    else if (kind === "deja") text = "这里……来过。";
    else if (kind === "co2") text = "空气变得很重。";
    safeCall(deps.showToast, text);
  }

  function beginEvent(kind, now) {
    if (activeEvent || disposed || suspended) return;
    eventSerial += 1;
    activeEvent = kind;
    state = "active";
    eventStartedAt = now;
    eventEndsAt = now + EVENT_DEFS[kind].duration;
    eventBaseFov =
      camera && typeof camera.fov === "number" ? camera.fov : originalFov;
    projectionKind = Math.random() < 0.55 ? "door" : "stairs";
    peripheralKind = Math.random() < 0.58 ? "figure" : "worms";
    peripheralSide = Math.random() < 0.5 ? -1 : 1;
    voiceMessage =
      ["“别回头。”", "“你又走错了。”", "“这里有人吗？”", "“醒醒。”"][
        Math.floor(Math.random() * 4)
      ];
    notifyEvent(kind);
    startAudioForCurrent();
  }

  function endEvent(now) {
    stopEventAudio();
    resetEffects();
    activeEvent = null;
    eventStartedAt = 0;
    eventEndsAt = 0;
    scheduleNext(now);
  }

  function updateActiveEffects(now) {
    var duration = eventEndsAt - eventStartedAt;
    var p = clamp((now - eventStartedAt) / Math.max(1, duration), 0, 1);
    var envelope =
      smoothstep(0, 0.16, p) * (1 - smoothstep(0.78, 1, p));
    sanityDrain = EVENT_DEFS[activeEvent].sanityDrain * envelope;

    if (activeEvent === "hum") {
      var ramp = clamp(p / 0.72, 0, 1);
      setMusic(p < 0.73 ? 1 - ramp * 0.7 : 0.2);
      setLight(p < 0.73 ? 1 + ramp * 0.22 : 0.48);
    } else if (activeEvent === "voice") {
      setMusic(1 - envelope * 0.72);
      setLight(1 - envelope * 0.08);
    } else if (activeEvent === "deja") {
      setMusic(1 - envelope * 0.36);
      setLight(1 + Math.sin(p * Math.PI * 8) * 0.035 * envelope);
      if (eventBaseFov != null) {
        var sway = reducedMotion ? 0 : Math.sin(p * Math.PI * 5) * 1.45;
        applyFov(eventBaseFov + envelope * (2.1 + sway));
      }
    } else if (activeEvent === "co2") {
      setMusic(1 - envelope * 0.48);
      setLight(1 - envelope * 0.2);
      if (eventBaseFov != null) {
        var breath = reducedMotion ? 0 : Math.sin(p * Math.PI * 7) * 0.65;
        applyFov(eventBaseFov - envelope * (8 + breath));
      }
    } else {
      setMusic(1 - envelope * 0.22);
      setLight(1 - envelope * 0.07);
    }
  }

  function isExternallyPaused() {
    try {
      return typeof deps.isPaused === "function" && !!deps.isPaused();
    } catch (err) {
      return false;
    }
  }

  function shiftTimeline(delta) {
    if (!(delta > 0)) return;
    if (eventStartedAt) eventStartedAt += delta;
    if (eventEndsAt) eventEndsAt += delta;
    if (nextEventAt) nextEventAt += delta;
  }

  function getCanvasSize() {
    if (!canvas) return { width: 0, height: 0 };
    return {
      width: canvas.width || canvas.clientWidth || 0,
      height: canvas.height || canvas.clientHeight || 0,
    };
  }

  function drawVignette(width, height, alpha, innerStop) {
    var radius = Math.max(width, height) * 0.72;
    var gradient = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      radius * (innerStop || 0.25),
      width * 0.5,
      height * 0.5,
      radius
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0," + alpha + ")");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawProjection(width, height, p, envelope) {
    var jitter = reducedMotion ? 0 : Math.sin(p * 47) * width * 0.004;
    var centerX = width * 0.5 + jitter;
    var floorY = height * 0.78;
    ctx.save();
    ctx.globalAlpha = envelope * (0.42 + Math.sin(p * 73) * 0.08);
    ctx.strokeStyle = "rgba(224,215,154,0.88)";
    ctx.fillStyle = "rgba(45,42,24,0.38)";
    ctx.lineWidth = Math.max(1, width / 700);
    ctx.shadowColor = "rgba(244,231,156,0.75)";
    ctx.shadowBlur = 12;
    if (projectionKind === "door") {
      var doorW = width * 0.18;
      var doorH = height * 0.48;
      ctx.fillRect(centerX - doorW / 2, floorY - doorH, doorW, doorH);
      ctx.strokeRect(centerX - doorW / 2, floorY - doorH, doorW, doorH);
      ctx.beginPath();
      ctx.arc(centerX + doorW * 0.3, floorY - doorH * 0.48, 3, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (var i = 0; i < 7; i++) {
        var depth = i / 7;
        var y = floorY - depth * height * 0.42;
        var halfW = width * (0.24 - depth * 0.15);
        ctx.beginPath();
        ctx.moveTo(centerX - halfW, y);
        ctx.lineTo(centerX + halfW, y);
        ctx.lineTo(centerX + halfW * 0.92, y - height * 0.035);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPeripheral(width, height, p, envelope) {
    ctx.save();
    var sideX = peripheralSide < 0 ? width * 0.07 : width * 0.93;
    if (peripheralKind === "figure") {
      var drift = reducedMotion ? 0 : Math.sin(p * 25) * width * 0.015;
      ctx.globalAlpha = envelope * 0.55;
      ctx.fillStyle = "rgba(5,4,2,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(sideX + drift, height * 0.36, width * 0.025, height * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sideX - width * 0.035 + drift, height * 0.42);
      ctx.lineTo(sideX + width * 0.038 + drift, height * 0.42);
      ctx.lineTo(sideX + width * 0.052 + drift, height * 0.78);
      ctx.lineTo(sideX - width * 0.045 + drift, height * 0.78);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(35,24,8,0.85)";
      ctx.lineWidth = Math.max(1, width / 620);
      ctx.globalAlpha = envelope * 0.72;
      for (var i = 0; i < 13; i++) {
        var seed = (i * 0.618033 + eventSerial * 0.173) % 1;
        var x = peripheralSide < 0
          ? width * (0.015 + seed * 0.18)
          : width * (0.985 - seed * 0.18);
        var y = height * (0.12 + ((seed * 3.7) % 1) * 0.76);
        var crawl = reducedMotion ? 0 : Math.sin(p * 34 + i) * 7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + peripheralSide * 7, y + crawl, x + peripheralSide * 15, y + 12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDeja(width, height, p, envelope) {
    ctx.save();
    var shift = reducedMotion ? width * 0.004 : Math.sin(p * 38) * width * 0.012;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = envelope * 0.11;
    ctx.fillStyle = "rgb(120,30,15)";
    ctx.fillRect(shift, 0, width, height);
    ctx.fillStyle = "rgb(15,55,110)";
    ctx.fillRect(-shift, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = envelope * 0.17;
    for (var i = 0; i < 5; i++) {
      var y = ((i * 0.217 + p * (reducedMotion ? 0 : 0.37)) % 1) * height;
      ctx.fillStyle = i % 2 ? "rgba(248,232,154,0.45)" : "rgba(20,18,10,0.42)";
      ctx.fillRect(0, y, width, Math.max(1, height * 0.008));
    }
    drawVignette(width, height, envelope * 0.32, 0.32);
    ctx.restore();
  }

  function drawCo2(width, height, p, envelope) {
    drawVignette(width, height, envelope * 0.78, 0.12);
    ctx.save();
    ctx.globalAlpha = envelope * 0.18;
    ctx.strokeStyle = "rgba(225,230,205,0.72)";
    ctx.lineWidth = Math.max(1, width / 800);
    var count = reducedMotion ? 8 : 16;
    for (var i = 0; i < count; i++) {
      var seed = (i * 0.754877 + eventSerial * 0.31) % 1;
      var x = seed * width;
      var y = height * (0.82 - ((seed * 5.3 + p * 0.12) % 1) * 0.72);
      var r = 2 + ((seed * 31) % 1) * 8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  bindGesture();
  scheduleNext(
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now()
  );
  nextEventAt += randomBetween(4500, 9000);

  return {
    /**
     * 推进互斥事件状态机。dt 以秒计，now 以毫秒计。
     */
    update: function (dt, now) {
      if (disposed) return;
      now =
        typeof now === "number"
          ? now
          : typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
      lastNow = now;

      var paused = suspended || isExternallyPaused();
      if (paused) {
        if (!pausedAt) {
          pausedAt = now;
          stopEventAudio();
          resetEffects();
          if (ctx && canvas) {
            var pausedSize = getCanvasSize();
            ctx.clearRect(0, 0, pausedSize.width, pausedSize.height);
          }
        }
        sanityDrain = 0;
        return;
      }
      if (pausedAt) {
        shiftTimeline(Math.max(0, now - pausedAt));
        pausedAt = 0;
        if (activeEvent) startAudioForCurrent();
      }

      if (activeEvent) {
        if (now >= eventEndsAt) {
          endEvent(now);
        } else {
          updateActiveEffects(now);
        }
        return;
      }

      sanityDrain = 0;
      if (now >= nextEventAt) beginEvent(chooseEvent(), now);
    },

    /**
     * 清理并重绘本模块的 fxCanvas 覆盖层。
     */
    draw: function (now) {
      if (!ctx || !canvas || disposed) return;
      var size = getCanvasSize();
      var width = size.width;
      var height = size.height;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      if (!activeEvent || suspended || pausedAt) return;

      now = typeof now === "number" ? now : lastNow;
      var p = clamp(
        (now - eventStartedAt) / Math.max(1, eventEndsAt - eventStartedAt),
        0,
        1
      );
      var envelope =
        smoothstep(0, 0.13, p) * (1 - smoothstep(0.8, 1, p));

      if (activeEvent === "hum") {
        var beforeSilence = p < 0.73;
        ctx.fillStyle = beforeSilence
          ? "rgba(238,225,142," + (p * 0.12) + ")"
          : "rgba(0,0,0," + ((1 - smoothstep(0.73, 1, p)) * 0.24) + ")";
        ctx.fillRect(0, 0, width, height);
      } else if (activeEvent === "projection") {
        drawProjection(width, height, p, envelope);
      } else if (activeEvent === "peripheral") {
        drawPeripheral(width, height, p, envelope);
      } else if (activeEvent === "voice") {
        drawVignette(width, height, envelope * 0.34, 0.38);
      } else if (activeEvent === "deja") {
        drawDeja(width, height, p, envelope);
      } else if (activeEvent === "co2") {
        drawCo2(width, height, p, envelope);
      }
    },

    /**
     * 当前事件要求宿主叠加的理智损耗（每秒）。
     */
    getSanityDrainPerSec: function () {
      return disposed || suspended || pausedAt ? 0 : sanityDrain;
    },

    beginAfterglow: function (durationMs, now) {
      if (disposed) return false;
      now =
        typeof now === "number"
          ? now
          : typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
      var duration = Math.max(15000, Number(durationMs) || 60000);
      afterglowUntil = Math.max(afterglowUntil, now + duration);
      afterglowStrength = 1;
      nextEventAt = Math.min(nextEventAt || Infinity, now + 900);
      if (!suspended && !activeEvent) beginEvent("hum", now);
      return true;
    },

    suspend: function () {
      if (disposed || suspended) return;
      suspended = true;
      suspendedAt =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      sanityDrain = 0;
      stopEventAudio();
      setMusic(1);
      setLight(1);
      restoreEventFov();
      if (ctx && canvas) {
        var size = getCanvasSize();
        ctx.clearRect(0, 0, size.width, size.height);
      }
    },

    resume: function () {
      if (disposed || !suspended) return;
      var now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      shiftTimeline(Math.max(0, now - suspendedAt));
      lastNow = now;
      suspended = false;
      suspendedAt = 0;
      pausedAt = 0;
      if (activeEvent) {
        updateActiveEffects(now);
        startAudioForCurrent();
      }
    },

    dispose: function () {
      if (disposed) return;
      disposed = true;
      unbindGesture();
      stopEventAudio();
      sanityDrain = 0;
      musicMul = 1;
      lightMul = 1;
      safeCall(deps.setMusicDuck, 1);
      safeCall(deps.setLightHallucinationMul, 1);
      if (originalFov != null) applyFov(originalFov);
      if (ctx && canvas) {
        var size = getCanvasSize();
        ctx.clearRect(0, 0, size.width, size.height);
      }
      if (motionQuery) {
        try {
          if (motionQuery.removeEventListener) {
            motionQuery.removeEventListener("change", syncReducedMotion);
          } else if (motionQuery.removeListener) {
            motionQuery.removeListener(syncReducedMotion);
          }
        } catch (err) {
          /* ignore */
        }
      }
      if (audioContext) {
        try {
          var closed = audioContext.close();
          if (closed && closed.catch) closed.catch(function () {});
        } catch (err2) {
          /* ignore */
        }
      }
      audioContext = null;
      audioMaster = null;
      activeEvent = null;
      afterglowUntil = 0;
      afterglowStrength = 0;
      state = "disposed";
    },

    getDebugState: function () {
      return {
        state: state,
        activeEvent: activeEvent,
        eventStartedAt: eventStartedAt,
        eventEndsAt: eventEndsAt,
        nextEventAt: nextEventAt,
        cooldownRemainingMs: Math.max(0, nextEventAt - lastNow),
        progress: activeEvent
          ? clamp(
              (lastNow - eventStartedAt) /
                Math.max(1, eventEndsAt - eventStartedAt),
              0,
              1
            )
          : 0,
        afterglowRemainingMs: Math.max(0, afterglowUntil - lastNow),
        afterglowStrength: afterglowStrength,
        sanityDrainPerSec: sanityDrain,
        reducedMotion: reducedMotion,
        suspended: suspended,
        audioReady: !!audioContext,
        audioFailed: audioFailed,
        gestureUnlocked: gestureUnlocked,
        eventSerial: eventSerial,
      };
    },
  };
}

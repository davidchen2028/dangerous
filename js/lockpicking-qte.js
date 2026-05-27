/**
 * 战术开锁 QTE（本地单机）— 对应 Unity LockpickingQTEManager
 */
(function () {
  "use strict";

  /** 绿色成功区 [0,1]，可在控制台改 LockpickingQTE.setGreenZone(0.4, 0.7) */
  var greenMin = 0.42;
  var greenMax = 0.68;

  var pointerSpeed = 0.72;
  var pointerT = 0.5;
  var pointerDir = 1;
  var successCount = 0;
  var requiredSuccesses = 3;
  var active = false;
  var onSuccessCb = null;
  var onFailCb = null;
  var audioCtx = null;

  var rootEl = null;
  var pointerEl = null;
  var greenEl = null;
  var counterEls = [];
  var animId = 0;
  var lastFrameTs = 0;

  function ensureAudio() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
    return audioCtx;
  }

  function playTone(freq, dur, vol) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function playSuccessSound() {
    playTone(880, 0.06, 0.12);
    setTimeout(function () {
      playTone(1175, 0.05, 0.1);
    }, 55);
  }

  function playFailSound() {
    playTone(180, 0.12, 0.14);
  }

  function playWinSound() {
    playTone(660, 0.08, 0.12);
    setTimeout(function () {
      playTone(990, 0.1, 0.12);
    }, 90);
    setTimeout(function () {
      playTone(1320, 0.14, 0.1);
    }, 180);
  }

  function applyGreenZoneVisual() {
    if (!greenEl) return;
    greenEl.style.left = greenMin * 100 + "%";
    greenEl.style.width = (greenMax - greenMin) * 100 + "%";
  }

  function updateCounterUI() {
    var i;
    for (i = 0; i < counterEls.length; i++) {
      counterEls[i].classList.toggle("lockpick-qte__pip--on", i < successCount);
      counterEls[i].classList.toggle(
        "lockpick-qte__pip--fail",
        false
      );
    }
  }

  function flashCountersFail() {
    var i;
    for (i = 0; i < counterEls.length; i++) {
      counterEls[i].classList.add("lockpick-qte__pip--fail");
    }
    setTimeout(function () {
      updateCounterUI();
    }, 320);
  }

  function resetPointer() {
    pointerT = 0.5;
    pointerDir = 1;
  }

  function setPointerVisual() {
    if (!pointerEl) return;
    pointerEl.style.left = pointerT * 100 + "%";
    pointerEl.style.transform = "translateX(-50%)";
  }

  function isInGreenZone(t) {
    return t >= greenMin && t <= greenMax;
  }

  function handleSpacePress() {
    if (!active) return false;

    if (isInGreenZone(pointerT)) {
      successCount += 1;
      playSuccessSound();
      updateCounterUI();
      resetPointer();
      setPointerVisual();

      if (successCount >= requiredSuccesses) {
        playWinSound();
        var cb = onSuccessCb;
        close();
        if (cb) cb();
      }
      return true;
    }

    successCount = 0;
    pointerSpeed = Math.min(pointerSpeed * 1.12, 1.75);
    playFailSound();
    flashCountersFail();
    resetPointer();
    setPointerVisual();
    if (onFailCb) onFailCb();
    return false;
  }

  function update(dt) {
    if (!active) return;

    pointerT += pointerDir * pointerSpeed * dt;
    if (pointerT >= 1) {
      pointerT = 1;
      pointerDir = -1;
    } else if (pointerT <= 0) {
      pointerT = 0;
      pointerDir = 1;
    }
    setPointerVisual();
  }

  function bindDom() {
    rootEl = document.getElementById("lockpickQte");
    if (!rootEl) return;
    pointerEl = rootEl.querySelector(".lockpick-qte__pointer");
    greenEl = rootEl.querySelector(".lockpick-qte__zone--green");
    counterEls = [];
    var pips = rootEl.querySelectorAll(".lockpick-qte__pip");
    var i;
    for (i = 0; i < pips.length; i++) counterEls.push(pips[i]);
    applyGreenZoneVisual();
  }

  function open(opts) {
    opts = opts || {};
    bindDom();
    if (!rootEl) return false;

    ensureAudio();
    active = true;
    successCount = 0;
    pointerSpeed = opts.speed != null ? opts.speed : 0.72;
    requiredSuccesses =
      opts.requiredSuccesses != null ? opts.requiredSuccesses : 3;
    if (opts.greenMin != null) greenMin = opts.greenMin;
    if (opts.greenMax != null) greenMax = opts.greenMax;
    onSuccessCb = opts.onSuccess || null;
    onFailCb = opts.onFail || null;

    resetPointer();
    applyGreenZoneVisual();
    updateCounterUI();
    setPointerVisual();

    rootEl.hidden = false;
    document.body.classList.add("lockpick-qte-open");
    startAnimLoop();
    return true;
  }

  function stopAnimLoop() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = 0;
    }
    lastFrameTs = 0;
  }

  function animLoop(ts) {
    if (!active) {
      stopAnimLoop();
      return;
    }
    animId = requestAnimationFrame(animLoop);
    var dt = 0;
    if (lastFrameTs > 0) {
      dt = Math.min((ts - lastFrameTs) / 1000, 0.05);
    }
    lastFrameTs = ts;
    if (dt > 0) update(dt);
  }

  function startAnimLoop() {
    stopAnimLoop();
    lastFrameTs = 0;
    animId = requestAnimationFrame(animLoop);
  }

  function close() {
    active = false;
    stopAnimLoop();
    onSuccessCb = null;
    onFailCb = null;
    if (rootEl) rootEl.hidden = true;
    document.body.classList.remove("lockpick-qte-open");
  }

  function isOpen() {
    return active;
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      handleSpacePress();
      return;
    }
    if (e.code === "Escape" && !e.repeat) {
      e.preventDefault();
      close();
    }
  }

  document.addEventListener("keydown", onKeyDown, true);

  window.LockpickingQTE = {
    open: open,
    close: close,
    update: update,
    isOpen: isOpen,
    handleSpacePress: handleSpacePress,
    setGreenZone: function (min, max) {
      greenMin = min;
      greenMax = max;
      applyGreenZoneVisual();
    },
    getState: function () {
      return {
        pointerT: pointerT,
        successCount: successCount,
        greenMin: greenMin,
        greenMax: greenMax,
      };
    },
  };

  bindDom();
})();

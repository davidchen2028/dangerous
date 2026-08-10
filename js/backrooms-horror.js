/**
 * 后室 Level 1 — 环境暴盲（宝箱不再量子消失）
 * 供 backrooms-level1.js 与 action-scene.js 共用
 */

/** 暴盲窗口内环境光/点光源保留的极弱强度 */
export const BLACKOUT_LIGHT_FLOOR = 0.14;

/**
 * @param {object} config
 * @param {number} [config.blackoutChance=0]
 */
export function createBackroomsHorrorSystem(config) {
  config = config || {};
  var blackoutChance =
    config.blackoutChance != null ? config.blackoutChance : 0;

  /** @type {{ light: import("three").PointLight, baseIntensity: number, panelMat?: import("three").Material, baseEmissive?: number }[]} */
  var industrialLights = [];
  /** @type {import("three").AmbientLight | null} */
  var ambientLight = null;
  var ambientBase = 0.18;

  /** @type {{ root: import("three").Object3D, glowLight: import("three").PointLight | null, x: number, z: number, opened: boolean, collider?: object }[]} */
  var quantumChests = [];

  var blackoutActive = false;
  var blackoutUntilMs = 0;
  /** 下一次掷骰是否暴盲的时间戳 */
  var nextBlackoutRollMs = 0;
  /** 暴盲结束后才允许日常闪烁 */
  var flickerHandler = null;

  var dripCtx = null;
  var dripInterval = null;
  var dripGain = null;

  function ensureDripAudio() {
    if (dripCtx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      dripCtx = new AC();
      dripGain = dripCtx.createGain();
      dripGain.gain.value = 0;
      dripGain.connect(dripCtx.destination);
    } catch (err) {
      dripCtx = null;
    }
  }

  /** 管道滴水 — 暴盲期间周期性噪声脉冲 */
  function playDripBurst() {
    if (!dripCtx || !dripGain) return;
    if (dripCtx.state === "suspended") {
      dripCtx.resume().catch(function () {});
    }
    var t0 = dripCtx.currentTime;
    dripGain.gain.cancelScheduledValues(t0);
    dripGain.gain.setValueAtTime(0.0001, t0);
    dripGain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    dripGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

    var osc = dripCtx.createOscillator();
    var band = dripCtx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 680 + Math.random() * 420;
    band.Q.value = 8;
    osc.type = "sine";
    osc.frequency.value = 900 + Math.random() * 300;
    osc.connect(band);
    band.connect(dripGain);
    osc.start(t0);
    osc.stop(t0 + 0.36);
  }

  function startDripLoop() {
    stopDripLoop();
    ensureDripAudio();
    if (!dripCtx) return;
    playDripBurst();
    dripInterval = setInterval(function () {
      if (blackoutActive) playDripBurst();
    }, 420 + Math.random() * 380);
  }

  function stopDripLoop() {
    if (dripInterval) {
      clearInterval(dripInterval);
      dripInterval = null;
    }
    if (dripGain && dripCtx) {
      dripGain.gain.setValueAtTime(0.0001, dripCtx.currentTime);
    }
  }

  function applyBlackoutVisuals(active) {
    var i;
    if (ambientLight) {
      ambientLight.intensity = active ? BLACKOUT_LIGHT_FLOOR : ambientBase;
    }
    for (i = 0; i < industrialLights.length; i++) {
      var entry = industrialLights[i];
      if (active) {
        if (entry.light) entry.light.intensity = BLACKOUT_LIGHT_FLOOR;
        if (entry.panelMat && entry.panelMat.emissiveIntensity != null) {
          entry.panelMat.emissiveIntensity = BLACKOUT_LIGHT_FLOOR;
        } else if (entry.panelMat && entry.panelMat.color) {
          entry.panelMat.color.setHex(0x0a0c0e);
        }
      } else {
        if (entry.light) entry.light.intensity = entry.baseIntensity;
        if (entry.panelMat && entry.baseEmissive != null && entry.panelMat.emissiveIntensity != null) {
          entry.panelMat.emissiveIntensity = entry.baseEmissive;
        } else if (entry.panelMat && entry.panelMat.color) {
          entry.panelMat.color.setHex(0xdff9fb);
        }
      }
    }
  }

  function beginBlackout(nowMs) {
    blackoutActive = true;
    blackoutUntilMs = nowMs + 2000 + Math.random() * 3000;
    applyBlackoutVisuals(true);
    startDripLoop();
  }

  function endBlackout() {
    blackoutActive = false;
    applyBlackoutVisuals(false);
    stopDripLoop();
  }

  function scheduleNextRoll(nowMs) {
    nextBlackoutRollMs = nowMs + 40000 + Math.random() * 20000;
  }

  function rollBlackout(nowMs) {
    if (blackoutChance <= 0) return;
    if (blackoutActive) return;
    if (nowMs < nextBlackoutRollMs) return;
    scheduleNextRoll(nowMs);
    if (Math.random() < blackoutChance) {
      beginBlackout(nowMs);
    }
  }

  return {
    /** 注册全局环境光（暴盲时一并压暗） */
    registerAmbient: function (light, baseIntensity) {
      ambientLight = light;
      ambientBase = baseIntensity != null ? baseIntensity : light.intensity;
    },

    /** 注册工业冷色点光源 + 灯面板 emissive */
    registerIndustrialLight: function (entry) {
      industrialLights.push(entry);
    },

    /** 注册海盗宝箱（仅用于 F 搜索，不会消失） */
    registerQuantumChest: function (entry) {
      entry.opened = !!entry.opened;
      quantumChests.push(entry);
      return entry;
    },

    /** 日常微闪烁（非暴盲时段） */
    setFlickerHandler: function (fn) {
      flickerHandler = fn;
    },

    resetSchedule: function (nowMs) {
      scheduleNextRoll(nowMs || performance.now());
    },

    /**
     * 每帧更新 — 返回 { blackout: boolean }
     * @param {number} nowMs
     * @param {number} playerX
     * @param {number} playerZ
     */
    update: function (nowMs, playerX, playerZ) {
      if (blackoutActive) {
        if (nowMs >= blackoutUntilMs) {
          endBlackout();
        }
      } else {
        rollBlackout(nowMs);
        if (flickerHandler) flickerHandler(nowMs);
      }
      return { blackout: blackoutActive };
    },

    isBlackoutActive: function () {
      return blackoutActive;
    },

    getQuantumChests: function () {
      return quantumChests;
    },

    unregisterQuantumChest: function (entry) {
      var idx = quantumChests.indexOf(entry);
      if (idx >= 0) quantumChests.splice(idx, 1);
    },

    unregisterIndustrialLight: function (entry) {
      var i;
      for (i = industrialLights.length - 1; i >= 0; i--) {
        if (industrialLights[i] === entry) {
          industrialLights.splice(i, 1);
          break;
        }
      }
    },

    dispose: function () {
      stopDripLoop();
      if (dripCtx) {
        dripCtx.close().catch(function () {});
        dripCtx = null;
      }
      industrialLights = [];
      ambientLight = null;
      quantumChests = [];
      blackoutActive = false;
    },
  };
}

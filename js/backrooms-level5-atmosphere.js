/**
 * Level 5 氛围层：老唱片杂音、整点钟声、看不见的脚步与锅炉蒸汽。
 */
export function createLevel5Atmosphere(showToast) {
  showToast = showToast || function () {};
  var audio = null;
  var nextEvent = 0;
  var eventStep = 0;
  var steamClock = 0;

  function context() {
    if (audio) return audio;
    if (typeof window === "undefined") return null;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audio = new Ctx();
    } catch (err) {
      audio = null;
    }
    return audio;
  }

  function tone(freq, duration, volume, type) {
    var ac = context();
    if (!ac) return;
    try {
      var now = ac.currentTime;
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || 0.035, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      /* ignore */
    }
  }

  function playClock() {
    tone(196, 1.8, 0.06, "sine");
    window.setTimeout(function () { tone(147, 2.1, 0.045, "sine"); }, 420);
  }

  function update(dt, now, environment, survival) {
    environment = environment || { zone: "lobby", inSteam: false };
    if (!nextEvent) nextEvent = now + 18000 + Math.random() * 18000;
    if (now >= nextEvent) {
      if (environment.zone === "lobby") {
        showToast("前台后方的老唱机自己转了一圈，针尖却没有落下。", 3600);
        tone(83, 2.6, 0.018, "sawtooth");
      } else if (eventStep % 2 === 0) {
        showToast("走廊尽头传来皮鞋声，经过转角后却突然消失。", 3400);
      } else {
        showToast("远处的大钟敲响；回声里似乎夹着另一组脚步。", 3800);
        playClock();
      }
      eventStep++;
      nextEvent = now + 28000 + Math.random() * 36000;
    }

    if (environment.inSteam && survival && !survival.dead) {
      steamClock += dt;
      if (steamClock >= 1) {
        steamClock -= 1;
        survival.takeDamage(7);
        showToast("高温蒸汽灼伤 · −7 血量", 1100);
      }
    } else {
      steamClock = 0;
    }

    return {
      sanityDrainPerSec: environment.sanityDrainPerSec || 0,
      movementMultiplier: environment.movementMultiplier || 1,
      heatIntensity:
        environment.zone === "boiler" ? (environment.inSteam ? 1 : 0.45) : 0,
    };
  }

  return {
    update: update,
    dispose: function () {
      if (audio && audio.close) {
        try { audio.close(); } catch (err) { /* ignore */ }
      }
      audio = null;
    },
  };
}

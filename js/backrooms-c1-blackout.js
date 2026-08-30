/**
 * Level C-1「交点」的断电循环。
 *
 * 原文：「流浪者身处环境的四周的荧光灯会发出烧断或爆裂的声音并瞬间熄灭，此时钝人、
 * 成年无面灵、猎犬……将有可能出现，但数量极少，最多只会同时出现二到三只实体。」
 * 以及「在流浪者附近存在的话，在灯光熄灭前能够看到它们会由绿色变成红色，应该注意其变化。」
 *
 * 所以这一层的节奏完全围绕四个状态展开：
 *
 *   calm ──► warning（安全出口标志转红，约 2.5 秒）
 *     ▲          │
 *     │          ▼
 *   recover ◄── blackout（灯全灭，刷出 2~3 只弱化实体）
 *
 * 实体只在 blackout 期间存在，供电一恢复就整批撤走——这让「熬过黑暗」成为
 * 一个明确的、有终点的目标，而不是无止境的追逐。
 */
import { createC1Figure } from "./backrooms-c1-figures.js";
import { createLevel2Hound } from "./backrooms-level2-hound.js";

/** 同时存在的实体上限——原文写死了「最多二到三只」 */
const MAX_ACTIVE = 3;

/** 预警窗口：标志变红到灯真正熄灭之间留给玩家的反应时间 */
const WARNING_MS = 2500;
const BLACKOUT_MIN_MS = 13000;
const BLACKOUT_MAX_MS = 21000;
const CALM_MIN_MS = 26000;
const CALM_MAX_MS = 48000;
const RECOVER_MS = 1800;

/** 实体刷在玩家周围这个距离环内：够近能形成压力，又不至于贴脸 */
const SPAWN_MIN_RADIUS = 9;
const SPAWN_MAX_RADIUS = 17;

const SPAWN_KINDS = ["faceling", "duller", "hound"];

/**
 * @param {{
 *   root: import("three").Object3D,
 *   colliders: object[],
 *   world: { setSignsAlarmed: Function, setSignsPowered: Function },
 *   showToast?: (text: string) => void,
 *   getPlayer: () => { x: number, z: number },
 * }} deps
 */
export function createC1BlackoutSystem(deps) {
  var root = deps.root;
  var colliders = deps.colliders;
  var world = deps.world;
  var showToast = deps.showToast || function () {};
  var getPlayer = deps.getPlayer;

  var state = "calm";
  var stateUntil = 0;
  var started = false;
  var actors = [];
  var spawnSerial = 0;
  var audioContext = null;

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function ensureAudio() {
    if (audioContext) return audioContext;
    if (typeof window === "undefined") return null;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioContext = new Ctx();
    } catch (err) {
      audioContext = null;
    }
    return audioContext;
  }

  /** 灯管烧断的爆裂声：一记短促的宽带噪声脉冲 */
  function playBurst() {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var now = ac.currentTime;
      var length = Math.floor(ac.sampleRate * 0.22);
      var buffer = ac.createBuffer(1, length, ac.sampleRate);
      var data = buffer.getChannelData(0);
      var i;
      for (i = 0; i < length; i++) {
        var decay = Math.pow(1 - i / length, 5);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
      var source = ac.createBufferSource();
      source.buffer = buffer;
      var gain = ac.createGain();
      gain.gain.setValueAtTime(0.32, now);
      var bandpass = ac.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 2600;
      bandpass.Q.value = 0.9;
      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ac.destination);
      source.start(now);
      source.stop(now + 0.24);
    } catch (err) {
      /* 音频不可用时静默降级 */
    }
  }

  /** 供电恢复：荧光灯重新点亮时的低频嗡鸣 */
  function playPowerUp() {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var now = ac.currentTime;
      var bus = ac.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.exponentialRampToValueAtTime(0.06, now + 0.25);
      bus.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      var a = ac.createOscillator();
      a.type = "sawtooth";
      a.frequency.value = 59.8;
      var b = ac.createOscillator();
      b.type = "sine";
      b.frequency.value = 119.6;
      a.connect(bus);
      b.connect(bus);
      bus.connect(ac.destination);
      a.start(now);
      b.start(now);
      a.stop(now + 1.2);
      b.stop(now + 1.2);
    } catch (err) {
      /* 音频不可用时静默降级 */
    }
  }

  /** 在玩家周围的环形区域里找一个不卡墙的落点 */
  function findSpawnPoint(px, pz) {
    var attempt;
    for (attempt = 0; attempt < 14; attempt++) {
      var angle = Math.random() * Math.PI * 2;
      var radius = randRange(SPAWN_MIN_RADIUS, SPAWN_MAX_RADIUS);
      var x = px + Math.cos(angle) * radius;
      var z = pz + Math.sin(angle) * radius;
      if (!isBlocked(x, z)) return { x: x, z: z };
    }
    return null;
  }

  function isBlocked(x, z) {
    var list = colliders || [];
    var i;
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.ghost) continue;
      if (c.minX == null) continue;
      if (
        x > c.minX - 0.6 &&
        x < c.maxX + 0.6 &&
        z > c.minZ - 0.6 &&
        z < c.maxZ + 0.6
      ) {
        return true;
      }
    }
    return false;
  }

  function spawnWave() {
    var player = getPlayer();
    var count = 2 + (Math.random() < 0.45 ? 1 : 0);
    var n;
    for (n = 0; n < count && actors.length < MAX_ACTIVE; n++) {
      var point = findSpawnPoint(player.x, player.z);
      if (!point) continue;
      var kind = SPAWN_KINDS[Math.floor(Math.random() * SPAWN_KINDS.length)];
      spawnSerial++;
      var actor;
      if (kind === "hound") {
        // 交点里的猎犬同样被弱化：血量约为常态的一半
        actor = createLevel2Hound(root, colliders, {
          id: "c1-" + spawnSerial,
          x: point.x,
          z: point.z,
          waypoints: [
            { x: point.x, z: point.z - 5 },
            { x: point.x, z: point.z + 5 },
          ],
        });
        if (actor.health) {
          actor.health.maxHp = 45;
          actor.health.hp = 45;
        }
      } else {
        actor = createC1Figure(root, colliders, {
          kind: kind,
          id: "c1-" + spawnSerial,
          x: point.x,
          z: point.z,
        });
      }
      actors.push(actor);
    }
  }

  function clearActors() {
    var i;
    for (i = 0; i < actors.length; i++) {
      try {
        actors[i].dispose();
      } catch (err) {
        /* ignore */
      }
    }
    actors.length = 0;
  }

  function enterWarning(now) {
    state = "warning";
    stateUntil = now + WARNING_MS;
    world.setSignsAlarmed(true);
    showToast("安全出口标志变成了红色——灯要灭了。", 2600);
  }

  function enterBlackout(now) {
    state = "blackout";
    stateUntil = now + randRange(BLACKOUT_MIN_MS, BLACKOUT_MAX_MS);
    world.setSignsPowered(false);
    playBurst();
    spawnWave();
  }

  function enterRecover(now) {
    state = "recover";
    stateUntil = now + RECOVER_MS;
    clearActors();
    world.setSignsPowered(true);
    world.setSignsAlarmed(false);
    playPowerUp();
    showToast("荧光灯重新亮起，黑暗里的东西退了回去。", 2600);
  }

  function enterCalm(now) {
    state = "calm";
    stateUntil = now + randRange(CALM_MIN_MS, CALM_MAX_MS);
  }

  /**
   * @param {number} dt
   * @param {number} now performance.now()
   * @param {object} survival
   * @returns {{ blackout: boolean, warning: boolean, lightMul: number }}
   */
  function update(dt, now, survival) {
    if (!started) {
      started = true;
      enterCalm(now);
    }

    if (now >= stateUntil) {
      if (state === "calm") enterWarning(now);
      else if (state === "warning") enterBlackout(now);
      else if (state === "blackout") enterRecover(now);
      else enterCalm(now);
    }

    var player = getPlayer();
    if (state === "blackout") {
      var i;
      for (i = 0; i < actors.length; i++) {
        actors[i].update(dt, player.x, player.z, survival, showToast);
      }
    }

    var lightMul = 1;
    if (state === "blackout") lightMul = 0.06;
    else if (state === "warning") {
      // 预警末段灯已经开始不稳，给玩家一个视觉上的加速提示
      var progress = 1 - Math.max(0, stateUntil - now) / WARNING_MS;
      lightMul = 1 - progress * 0.35;
    } else if (state === "recover") {
      var back = 1 - Math.max(0, stateUntil - now) / RECOVER_MS;
      lightMul = 0.06 + back * 0.94;
    }

    return {
      blackout: state === "blackout",
      warning: state === "warning",
      lightMul: lightMul,
    };
  }

  return {
    update: update,
    isBlackout: function () {
      return state === "blackout";
    },
    getState: function () {
      return state;
    },
    getActiveCount: function () {
      return actors.length;
    },
    dispose: function () {
      clearActors();
      if (audioContext && audioContext.close) {
        try {
          audioContext.close();
        } catch (err) {
          /* ignore */
        }
      }
      audioContext = null;
    },
  };
}

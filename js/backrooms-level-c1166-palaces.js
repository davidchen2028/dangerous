/**
 * 兜率天九宫进度。几何不在这里，只决定时钟、换宫和几条判定。
 */
import {
  C1166_DEATH_SEC,
  C1166_STAGE_SEC,
  refineAllowsSprint,
  refineJumpMul,
  refineLabel,
  refineSpeedMul,
  refineStage,
  refineStickSec,
} from "./backrooms-level-c1166-refine.js";

export function convertElapsed(elapsed, fromDeath, toDeath) {
  if (!(fromDeath > 0) || !(toDeath > 0)) return elapsed > 0 ? elapsed : 0;
  return Math.max(0, (elapsed / fromDeath) * toDeath);
}

function deathOf(id, base) {
  if (id === "zhen") return base * 14;
  if (id === "gen") return base * 2;
  if (id === "xun" || id === "zhong" || id === "li") return 0;
  return base * 7;
}

function stageLenOf(id, base) {
  if (id === "zhen") return base * 2;
  if (id === "gen") return (base * 20) / 70;
  return base;
}

function isStaged(id) {
  return id === "kan" || id === "kun" || id === "zhen" || id === "dui" || id === "gen";
}

export function createC1166Run(options) {
  options = options || {};
  var base = options.stageSec > 0 ? options.stageSec : C1166_STAGE_SEC;
  var liLimit = options.liSec > 0 ? options.liSec : 90;
  var qianStep = options.qianStep > 0 ? options.qianStep : 5;
  var gongGap = options.gongGap > 0 ? options.gongGap : 10;
  var xunLimit = options.xunLimit > 0 ? options.xunLimit : 49;
  var rng = options.rng || Math.random;

  var palace = "kan";
  var penaltyPalace = "kan";
  var elapsed = 0;
  var hold = 0;
  var time = 0;
  var dead = false;
  var qianSeconds = 0;
  var qianStepsRolled = 0;
  var gong = 0;
  var gongAt = -999;
  var kanCleared = false;
  var xunMelt = 0;
  var liLeft = 0;
  var snapshot = null;
  var megGiven = false;
  var lastStage = 0;
  var ashWoken = {};

  function stageSecNow() {
    return stageLenOf(penaltyPalace, base);
  }

  function stageIndex() {
    if (palace === "xun" || palace === "zhong" || palace === "qian") return 0;
    return refineStage(elapsed, stageSecNow());
  }

  function enter(id, vitals) {
    if (dead) return;
    var prev = palace;
    if (id === "li") {
      snapshot = {
        hp: vitals && vitals.hp != null ? vitals.hp : 0,
        sanity: vitals && vitals.sanity != null ? vitals.sanity : 0,
        stamina: vitals && vitals.stamina != null ? vitals.stamina : 0,
        elapsed: elapsed,
        hold: hold,
      };
      liLeft = liLimit;
      palace = "li";
      return;
    }
    if (id === "xun" || id === "zhong") {
      elapsed = 0;
      hold = 0;
      lastStage = 0;
      palace = id;
      if (id === "xun") {
        megGiven = false;
        xunMelt = 0;
      }
      return;
    }
    if (isStaged(prev) && isStaged(id)) {
      elapsed = convertElapsed(elapsed, deathOf(prev, base), deathOf(id, base));
    }
    if (isStaged(id)) penaltyPalace = id;
    if (id === "qian") penaltyPalace = "qian";
    palace = id;
    lastStage = stageIndex();
  }

  function tick(dt, ctx) {
    ctx = ctx || {};
    var events = [];
    var raw = dt > 0 ? dt : 0;
    var step = raw;
    time += raw;
    if (dead || ctx.blocked) return events;

    if (palace === "xun") {
      var head = ctx.headcount != null ? ctx.headcount : 1;
      if (head >= 49) {
        xunMelt += step;
        if (xunMelt >= xunLimit) {
          dead = true;
          events.push({ type: "death", reason: "xun" });
        }
      } else {
        xunMelt = 0;
      }
      return events;
    }

    if (palace === "zhong") return events;

    if (palace === "li") {
      liLeft -= step;
      if (liLeft <= 0) {
        dead = true;
        snapshot = null;
        events.push({ type: "death", reason: "li" });
      }
      return events;
    }

    if (hold > 0) {
      if (step <= hold) {
        hold -= step;
        step = 0;
      } else {
        step -= hold;
        hold = 0;
      }
    }
    if (step > 0) elapsed += step;

    if (palace === "qian") {
      qianSeconds += raw;
      var steps = Math.floor(qianSeconds / qianStep);
      while (qianStepsRolled < steps) {
        qianStepsRolled += 1;
        var chance = Math.min(0.8, qianStepsRolled * 0.08);
        if (rng() < chance) {
          events.push({ type: "goto", palace: "dui" });
          break;
        }
      }
    }

    var limit = deathOf(palace, base);
    if (limit > 0 && elapsed >= limit) {
      dead = true;
      events.push({ type: "death", reason: "refine" });
    } else {
      var nowStage = stageIndex();
      if (isStaged(palace) && nowStage !== lastStage && nowStage < 7) {
        events.push({ type: "stage", stage: nowStage, label: refineLabel(nowStage) });
      }
      lastStage = nowStage;
    }
    return events;
  }

  function finishLi() {
    if (palace !== "li" || dead || !snapshot) return null;
    var snap = snapshot;
    elapsed = snap.elapsed;
    hold = snap.hold;
    palace = "zhong";
    lastStage = 0;
    snapshot = null;
    return snap;
  }

  function strikeGong(dist) {
    if (palace !== "zhen") return { aggro: false, counted: false, teleport: false };
    if (time - gongAt < gongGap) return { aggro: true, counted: false, teleport: false };
    gongAt = time;
    gong += 1;
    var teleport = gong >= 3 && dist <= 2;
    if (teleport) gong = 0;
    return { aggro: true, counted: true, teleport: teleport };
  }

  function tryKunFloor(inRing) {
    if (palace !== "kun") return { ok: false, toast: "" };
    if (!inRing) return { ok: false, toast: "这里的地面拒绝切入" };
    return { ok: true, palace: "zhen" };
  }

  return {
    enter: enter,
    tick: tick,
    finishLi: finishLi,
    strikeGong: strikeGong,
    tryKunFloor: tryKunFloor,
    addHold: function (sec) {
      hold += sec > 0 ? sec : 0;
    },
    rewind: function (sec) {
      elapsed = Math.max(0, elapsed - (sec > 0 ? sec : 0));
      lastStage = stageIndex();
    },
    markKanCleared: function () {
      kanCleared = true;
    },
    markMegGiven: function () {
      megGiven = true;
    },
    palaceId: function () {
      return palace;
    },
    elapsedSec: function () {
      return elapsed;
    },
    holdSec: function () {
      return hold;
    },
    qianSeconds: function () {
      return qianSeconds;
    },
    isDead: function () {
      return dead;
    },
    kanCleared: function () {
      return kanCleared;
    },
    megGiven: function () {
      return megGiven;
    },
    liLeftSec: function () {
      return liLeft;
    },
    wind: function () {
      return palace === "xun" ? 1.6 : 0;
    },
    gravity: function (inRing) {
      if (palace === "kun" && !inRing) return 48;
      return 32;
    },
    speedMul: function (inRing) {
      if (palace === "xun" || palace === "zhong" || palace === "qian") return 1;
      var mul = refineSpeedMul(stageIndex());
      if (palace === "kun" && stageIndex() >= 3 && !inRing) mul *= 0.85;
      return mul;
    },
    allowsSprint: function () {
      if (palace === "xun" || palace === "zhong" || palace === "qian") return true;
      return refineAllowsSprint(stageIndex());
    },
    jumpMul: function () {
      if (palace === "xun" || palace === "zhong" || palace === "qian") return 1;
      return refineJumpMul(stageIndex());
    },
    stickSec: function () {
      if (palace === "xun" || palace === "zhong" || palace === "qian") return 0;
      return refineStickSec(stageIndex());
    },
    stageIndex: stageIndex,
    wakeAsh: function (index) {
      if (ashWoken[index]) return false;
      ashWoken[index] = true;
      return true;
    },
    hudText: function () {
      if (palace === "xun" || palace === "zhong") return "炼化已停";
      if (palace === "li") return "离宫 " + Math.max(0, Math.ceil(liLeft)) + " 秒";
      if (palace === "qian") {
        return "炼化累计 " + Math.floor(elapsed) + " / " + Math.floor(deathOf("qian", base)) + " 秒";
      }
      var stage = stageIndex();
      var sec = stageSecNow();
      var into = stage >= 7 ? 0 : Math.max(0, sec - (elapsed - stage * sec));
      return "炼化 " + refineLabel(stage) + " · " + Math.ceil(into) + " 秒";
    },
  };
}

export { C1166_DEATH_SEC };

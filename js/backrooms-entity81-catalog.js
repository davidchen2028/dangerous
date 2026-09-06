/**
 * Entity 81 目的地与按钮算式。
 * 算式只使用特殊角三角与对数，结果等于层级编号；禁止四则与阶乘。
 */
import { LEVEL_KEY_CATALOG } from "./backrooms-level-key-catalog.js";

export const E81_ORIGIN_KEY = "backrooms_e81_origin_v1";
export const E81_SEED_KEY = "backrooms_e81_layout_seed_v1";
export const E81_CALL_KIND = "e81_call";
export const E81_BUTTON_KIND = "e81_button";
export const E81_DOOR_KIND = "e81_door";
export const E81_SCREEN_KIND = "e81_screen";

export const E81_HOSTS = Object.freeze({
  clip: { pass: "clip", number: 1, page: "backrooms-level1.html", theme: "industrial" },
  l4: { pass: "l4", number: 4, page: "backrooms-level4.html", theme: "luxury" },
  l5: { pass: "l5", number: 5, page: "backrooms-level5.html", theme: "luxury" },
  l11: { pass: "l11", number: 11, page: "backrooms-level11.html", theme: "luxury" },
});

const FORBIDDEN_LEVEL_IDS = {
  l6_1: true,
  l110: true,
  hub: true,
};

function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  var s = String(text || "");
  var h = 2166136261;
  var i;
  for (i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseEntity81LevelNumber(levelId) {
  var match = /^l(\d+)$/.exec(String(levelId || ""));
  return match ? Number(match[1]) : null;
}

export function listEntity81Destinations() {
  var out = [];
  var i;
  for (i = 0; i < LEVEL_KEY_CATALOG.length; i++) {
    var entry = LEVEL_KEY_CATALOG[i];
    if (!entry || !entry.page || !entry.pass) continue;
    if (entry.independent === false) continue;
    if (FORBIDDEN_LEVEL_IDS[entry.levelId]) continue;
    if (/^c/.test(entry.levelId)) continue;
    var number = parseEntity81LevelNumber(entry.levelId);
    if (number == null) continue;
    out.push({
      levelId: entry.levelId,
      number: number,
      pass: entry.pass,
      page: entry.page,
      label: entry.label,
    });
  }
  return out;
}

function trigCoeff(n, unitExpr) {
  return n === 1 ? unitExpr : n + " " + unitExpr;
}

export function listEntity81Expressions(n) {
  n = n | 0;
  if (n < 0) return [];
  if (n === 0) {
    return [
      "sin(0)",
      "tan(0)",
      "cos(π/2)",
      "cot(π/2)",
      "sin²(0)",
      "cos(π/2)",
      "log₂(1)",
      "lg(1)",
      "ln(1)",
      "log₁₀(1)",
      "log₃(1)",
      "log₅(1)",
      "log₇(1)",
      "log₁₁(1)",
    ];
  }
  var list = [
    trigCoeff(n, "tan(π/4)"),
    trigCoeff(n, "cos(0)"),
    trigCoeff(n, "sin(π/2)"),
    trigCoeff(n, "sec(0)"),
    trigCoeff(n, "csc(π/2)"),
    trigCoeff(n, "cot(π/4)"),
    trigCoeff(n, "cos(2π)"),
    trigCoeff(n, "cos(4π)"),
    n === 1 ? "2sin(π/6)" : 2 * n + " sin(π/6)",
    n === 1 ? "2cos(π/3)" : 2 * n + " cos(π/3)",
    "log₂(2^" + n + ")",
    "lg(10^" + n + ")",
    "ln(e^" + n + ")",
    "log₁₀(10^" + n + ")",
    "log₃(3^" + n + ")",
    "log₅(5^" + n + ")",
    "log₇(7^" + n + ")",
    "log₁₁(11^" + n + ")",
  ];
  if (n === 1) {
    list.push("log₂(2)", "lg(10)", "ln(e)", "log₃(3)", "log₅(5)", "log₇(7)", "log₁₁(11)");
  } else {
    list.push("log_" + n + "(" + n + "^" + n + ")");
  }
  return list;
}

export function expressionLooksLikeArithmeticOrFactorial(expr) {
  var text = String(expr || "");
  if (/!/.test(text)) return true;
  if (/\d+\s*[+\-×÷*]\s*\d+/.test(text)) return true;
  return false;
}

export function pickEntity81Expression(n, rng, used) {
  var pool = listEntity81Expressions(n).filter(function (expr) {
    return !used[expr] && !expressionLooksLikeArithmeticOrFactorial(expr);
  });
  if (!pool.length) {
    pool = listEntity81Expressions(n);
  }
  var expr = pool[Math.floor((rng ? rng() : Math.random()) * pool.length) % pool.length];
  used[expr] = true;
  return expr;
}

export function getEntity81Host(originPass) {
  return E81_HOSTS[originPass] || null;
}

export function getOrCreateEntity81Seed() {
  try {
    var raw = sessionStorage.getItem(E81_SEED_KEY);
    if (raw && /^\d+$/.test(raw)) return Number(raw);
    var seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
    sessionStorage.setItem(E81_SEED_KEY, String(seed));
    return seed;
  } catch (err) {
    return 81;
  }
}

export function readEntity81Origin() {
  try {
    return sessionStorage.getItem(E81_ORIGIN_KEY) || "";
  } catch (err) {
    return "";
  }
}

export function writeEntity81Origin(originPass) {
  try {
    sessionStorage.setItem(E81_ORIGIN_KEY, String(originPass || ""));
  } catch (err) {
    /* ignore */
  }
}

export function pickEntity81Buttons(originPass, seed) {
  var host = getEntity81Host(originPass);
  var dests = listEntity81Destinations();
  var rng = mulberry32((seed >>> 0) ^ hashSeed(originPass || "e81"));
  var count = 8 + Math.floor(rng() * 9);
  if (count < 4) count = 4;
  if (count > 20) count = 20;
  var byNumber = Object.create(null);
  var i;
  for (i = 0; i < dests.length; i++) byNumber[dests[i].number] = dests[i];
  var picked = [];
  var usedNumbers = Object.create(null);
  if (host && byNumber[host.number]) {
    picked.push(byNumber[host.number]);
    usedNumbers[host.number] = true;
  }
  var pool = dests.filter(function (d) {
    return !usedNumbers[d.number];
  });
  while (picked.length < count && pool.length) {
    var at = Math.floor(rng() * pool.length);
    picked.push(pool[at]);
    usedNumbers[pool[at].number] = true;
    pool.splice(at, 1);
  }
  picked.sort(function (a, b) {
    return a.number - b.number;
  });
  var usedExpr = Object.create(null);
  return picked.map(function (dest) {
    return {
      levelId: dest.levelId,
      number: dest.number,
      pass: dest.pass,
      page: dest.page,
      label: dest.label,
      expr: pickEntity81Expression(dest.number, rng, usedExpr),
      isCurrent: !!(host && dest.number === host.number),
    };
  });
}

export function chooseEntity81CabinAction(kind, button, opts) {
  opts = opts || {};
  if (opts.dead || opts.transitionLock || opts.uiBlocked) return null;
  if (kind === E81_DOOR_KIND) return "return_origin";
  if (kind === E81_SCREEN_KIND) return "talk";
  if (kind !== E81_BUTTON_KIND || !button) return null;
  if (button.isCurrent) return "stay";
  return "travel";
}

export function getEntity81CallHint() {
  return "Entity 81 · 电梯 · 按 <kbd>Q</kbd> / 点击进入";
}

export function getEntity81ButtonHint(button) {
  if (!button || !button.expr) return "";
  return button.expr + " · 按 <kbd>Q</kbd> / 点击";
}

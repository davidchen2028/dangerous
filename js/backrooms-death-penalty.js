/**
 * 后室死亡负面效果
 *
 * 第 1 次死：理智上限 −20%，理智消耗加快，更容易幻觉
 * 第 2 次死：最大生命 −25%，体力 −25%
 * 第 3 次死：永久删档（重置回 Level 0）
 *
 * 死亡时可花 30 积分免除「本次」负面（死亡次数仍 +1）
 * 删档时可花 80 积分免除所有负面（清空次数与效果，不删档）
 */
import { getMegPoints, addMegPoints, updateMegPointsDisplay } from "./backrooms-meg-points.js";
import { applySoyMilkSanityMax } from "./backrooms-soy-milk.js";

export const DEATH_COUNT_KEY = "backrooms_death_count_v1";
export const DEATH_P1_KEY = "backrooms_death_penalty_p1_v1";
export const DEATH_P2_KEY = "backrooms_death_penalty_p2_v1";

export const BUYOUT_SINGLE_COST = 30;
export const BUYOUT_WIPE_COST = 80;

const SANITY_MAX_DEFAULT = 100;
const SANITY_MAX_P1 = 80;
const SANITY_DRAIN_MUL_P1 = 2;
const HP_MUL_P2 = 0.75;
const STA_MUL_P2 = 0.75;

/** @type {HTMLElement | null} */
let choiceRoot = null;
/** @type {HTMLElement | null} */
let hallRoot = null;
let hallPhase = 0;

function readFlag(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch (err) {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch (err) {
    /* ignore */
  }
}

export function getDeathCount() {
  try {
    var n = parseInt(sessionStorage.getItem(DEATH_COUNT_KEY) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err) {
    return 0;
  }
}

function setDeathCount(n) {
  try {
    sessionStorage.setItem(DEATH_COUNT_KEY, String(Math.max(0, n | 0)));
  } catch (err) {
    /* ignore */
  }
}

export function hasDeathPenalty1() {
  return readFlag(DEATH_P1_KEY);
}

export function hasDeathPenalty2() {
  return readFlag(DEATH_P2_KEY);
}

export function clearDeathPenalties() {
  try {
    sessionStorage.removeItem(DEATH_COUNT_KEY);
    sessionStorage.removeItem(DEATH_P1_KEY);
    sessionStorage.removeItem(DEATH_P2_KEY);
  } catch (err) {
    /* ignore */
  }
}

export function getSanityMax() {
  var base = hasDeathPenalty1() ? SANITY_MAX_P1 : SANITY_MAX_DEFAULT;
  return applySoyMilkSanityMax(base);
}

export function getSanityDrainMul() {
  return hasDeathPenalty1() ? SANITY_DRAIN_MUL_P1 : 1;
}

export function getDeathHpMul() {
  return hasDeathPenalty2() ? HP_MUL_P2 : 1;
}

export function getDeathStaminaMul() {
  return hasDeathPenalty2() ? STA_MUL_P2 : 1;
}

function describePendingPenalty(nextCount) {
  if (nextCount === 1) {
    return "第 1 次死亡负面：理智上限 −20%，理智消耗加快，更容易看见幻觉。";
  }
  if (nextCount === 2) {
    return "第 2 次死亡负面：最大生命 −25%，体力 −25%。";
  }
  return "第 3 次死亡：永久删档，重置回 Level 0，并清除本局一切进度。";
}

function closeChoiceUi() {
  if (choiceRoot && choiceRoot.parentNode) choiceRoot.parentNode.removeChild(choiceRoot);
  choiceRoot = null;
}

function ensureHallucinationLayer() {
  if (hallRoot) return hallRoot;
  hallRoot = document.createElement("div");
  hallRoot.id = "backroomsDeathHallucination";
  hallRoot.setAttribute("aria-hidden", "true");
  hallRoot.style.cssText =
    "position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;" +
    "background:radial-gradient(ellipse at 40% 35%,rgba(120,40,160,0.28),transparent 55%)," +
    "radial-gradient(ellipse at 70% 65%,rgba(20,0,0,0.35),transparent 50%);" +
    "mix-blend-mode:screen;transition:opacity 0.2s linear;";
  document.body.appendChild(hallRoot);
  return hallRoot;
}

/**
 * 第 1 次死亡负面激活时：理智越低，幻觉越强。
 * @param {import("./backrooms-survival.js").BackroomsSurvival | null} survival
 * @param {number} dt
 */
export function updateDeathHallucinations(survival, dt) {
  if (!hasDeathPenalty1() || !survival || survival.dead) {
    if (hallRoot) hallRoot.style.opacity = "0";
    return;
  }
  var layer = ensureHallucinationLayer();
  hallPhase += dt;
  var sanMax = getSanityMax();
  var sanRatio = sanMax > 0 ? survival.sanity / sanMax : 0;
  var stress = Math.max(0, 1 - sanRatio);
  var pulse = 0.12 + stress * 0.55 + Math.sin(hallPhase * (1.6 + stress * 3)) * (0.05 + stress * 0.18);
  layer.style.opacity = String(Math.max(0, Math.min(0.85, pulse)));
  if (stress > 0.55 && Math.sin(hallPhase * 7.3) > 0.92) {
    layer.style.filter = "hue-rotate(" + String(Math.floor(hallPhase * 40) % 360) + "deg)";
  } else {
    layer.style.filter = "none";
  }
}

function applyAcceptedPenalty(nextCount) {
  setDeathCount(nextCount);
  if (nextCount === 1) writeFlag(DEATH_P1_KEY, true);
  if (nextCount === 2) writeFlag(DEATH_P2_KEY, true);
}

function buyOutSingle(nextCount) {
  if (getMegPoints() < BUYOUT_SINGLE_COST) return false;
  addMegPoints(-BUYOUT_SINGLE_COST);
  updateMegPointsDisplay(null);
  // 死亡次数仍计入，但本次负面不生效
  setDeathCount(nextCount);
  return true;
}

function buyOutWipe() {
  if (getMegPoints() < BUYOUT_WIPE_COST) return false;
  addMegPoints(-BUYOUT_WIPE_COST);
  updateMegPointsDisplay(null);
  clearDeathPenalties();
  return true;
}

/**
 * 死亡后弹出负面选择；选定后回调 continueFn。
 * @param {import("./backrooms-survival.js").BackroomsSurvival} survival
 * @param {string} reason
 * @param {(outcome: "continue" | "wipe") => void} continueFn
 */
export function offerDeathPenaltyChoice(survival, reason, continueFn) {
  if (choiceRoot) return;
  var nextCount = getDeathCount() + 1;
  var isWipe = nextCount >= 3;
  var points = getMegPoints();

  if (survival && survival.deathEl) {
    survival.deathEl.style.pointerEvents = "auto";
    var msg = survival.deathEl.querySelector("[data-death-msg]");
    if (msg) {
      msg.textContent = isWipe
        ? "你已死亡 — 第三次死亡将永久删档"
        : reason === "sanity"
          ? "精神崩溃 — 选择是否免除负面效果"
          : "你已死亡 — 选择是否免除负面效果";
    }
  }

  choiceRoot = document.createElement("div");
  choiceRoot.id = "backroomsDeathPenaltyChoice";
  choiceRoot.style.cssText =
    "position:fixed;inset:0;z-index:140;display:flex;align-items:flex-end;" +
    "justify-content:center;padding:0 16px max(28px,env(safe-area-inset-bottom));" +
    "pointer-events:auto;background:linear-gradient(to top,rgba(0,0,0,0.72),transparent 55%);" +
    "font-family:system-ui,-apple-system,sans-serif;color:#f2e9e4;";

  var card = document.createElement("div");
  card.style.cssText =
    "width:min(520px,94vw);padding:18px 18px 16px;border-radius:12px;" +
    "border:1px solid rgba(255,255,255,0.14);background:rgba(10,8,8,0.88);" +
    "box-shadow:0 16px 50px rgba(0,0,0,0.55);";

  var title = document.createElement("p");
  title.style.cssText = "margin:0 0 8px;font-size:16px;letter-spacing:0.06em;font-weight:600;";
  title.textContent = isWipe ? "永久删档警告" : "死亡负面 · 第 " + nextCount + " 次";

  var desc = document.createElement("p");
  desc.style.cssText = "margin:0 0 14px;font-size:13px;line-height:1.65;color:#d9cfc8;";
  desc.textContent = describePendingPenalty(nextCount) + "（当前积分点：" + points + "）";

  var actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  function finish(outcome) {
    closeChoiceUi();
    if (survival && survival.deathEl) survival.deathEl.style.pointerEvents = "none";
    continueFn(outcome);
  }

  if (isWipe) {
    var acceptWipe = document.createElement("button");
    acceptWipe.type = "button";
    acceptWipe.textContent = "接受删档 · 重置回 Level 0";
    acceptWipe.style.cssText =
      "padding:11px 14px;border-radius:8px;border:1px solid #8a3030;cursor:pointer;" +
      "background:#4a1410;color:#ffe8e2;font-size:14px;";
    acceptWipe.addEventListener("click", function () {
      clearDeathPenalties();
      finish("wipe");
    });

    var buyWipe = document.createElement("button");
    buyWipe.type = "button";
    buyWipe.textContent = "花费 " + BUYOUT_WIPE_COST + " 积分 · 免除所有负面效果";
    buyWipe.disabled = points < BUYOUT_WIPE_COST;
    buyWipe.style.cssText =
      "padding:11px 14px;border-radius:8px;border:1px solid #c9a45a;cursor:pointer;" +
      "background:#3a2a10;color:#ffe9b8;font-size:14px;" +
      (buyWipe.disabled ? "opacity:0.45;cursor:not-allowed;" : "");
    buyWipe.addEventListener("click", function () {
      if (!buyOutWipe()) {
        desc.textContent = "积分点不足（需要 " + BUYOUT_WIPE_COST + "）。";
        return;
      }
      finish("continue");
    });

    actions.appendChild(acceptWipe);
    actions.appendChild(buyWipe);
  } else {
    var accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "接受本次负面效果";
    accept.style.cssText =
      "padding:11px 14px;border-radius:8px;border:1px solid #6a6a72;cursor:pointer;" +
      "background:#242428;color:#eee;font-size:14px;";
    accept.addEventListener("click", function () {
      applyAcceptedPenalty(nextCount);
      finish("continue");
    });

    var buy = document.createElement("button");
    buy.type = "button";
    buy.textContent = "花费 " + BUYOUT_SINGLE_COST + " 积分 · 免除本次负面";
    buy.disabled = points < BUYOUT_SINGLE_COST;
    buy.style.cssText =
      "padding:11px 14px;border-radius:8px;border:1px solid #c9a45a;cursor:pointer;" +
      "background:#3a2a10;color:#ffe9b8;font-size:14px;" +
      (buy.disabled ? "opacity:0.45;cursor:not-allowed;" : "");
    buy.addEventListener("click", function () {
      if (!buyOutSingle(nextCount)) {
        desc.textContent = "积分点不足（需要 " + BUYOUT_SINGLE_COST + "）。";
        return;
      }
      finish("continue");
    });

    actions.appendChild(accept);
    actions.appendChild(buy);
  }

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(actions);
  choiceRoot.appendChild(card);
  document.body.appendChild(choiceRoot);
}

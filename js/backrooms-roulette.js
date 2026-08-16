/**
 * 后室轮盘赌 — 改装左轮装置
 *
 * 机制：
 *  · 转轮随机装入实弹，但不会向玩家显示实弹数量。
 *  · 扣扳机：转轮停下后，屏幕顶端只显示对应结局文字。
 *      - 实弹 → 直接死亡。
 *      - 空弹且 L=6（还乡道）→ 依然死亡（必死项）。
 *      - 空弹且 L∈1..5 → 依据编号传送到对应后室层级。
 */
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";

const REVOLVER_IMG = "img/backrooms/roulette-revolver.png";

/** 每个编号对应的结局标识 */
const OUTCOME_LABELS = {
  1: "下地狱",
  2: "回人间",
  3: "好去处",
  4: "归家路",
  5: "上天堂",
  6: "还乡道",
};

/** 空弹传送目的地池（{pass,page,banner}）；6 号为必死，无目的地 */
const DEST_POOLS = {
  // 1 下地狱：生存难度 4-5 高危层级
  1: [
    { pass: "l3", page: "backrooms-level3.html", banner: "Level 3" },
    { pass: "l7", page: "backrooms-level7.html", banner: "Level 7" },
    { pass: "l8", page: "backrooms-level8.html", banner: "Level 8" },
    { pass: "l9", page: "backrooms-level9.html", banner: "Level 9" },
    { pass: "l21", page: "backrooms-level21.html", banner: "Level 21" },
    { pass: "l75", page: "backrooms-level75.html", banner: "Level 75" },
    { pass: "l119", page: "backrooms-level119.html", banner: "Level 119" },
  ],
  // 2 回人间：生存难度 2-3 中高风险
  2: [
    { pass: "l2", page: "backrooms-level2.html", banner: "Level 2" },
    { pass: "l13", page: "backrooms-level13.html", banner: "Level 13" },
    { pass: "l121", page: "backrooms-level121.html", banner: "Level 121" },
    { pass: "l283", page: "backrooms-level283.html", banner: "Level 283" },
  ],
  // 3 好去处：生存难度 0-1 中低威胁
  3: [
    { pass: "l0", page: "backrooms-level0.html", banner: "Level 0" },
    { pass: "l4", page: "backrooms-level4.html", banner: "Level 4" },
    { pass: "l10", page: "backrooms-level10.html", banner: "Level 10" },
    { pass: "l37", page: "backrooms-level37.html", banner: "Level 37" },
    { pass: "l57", page: "backrooms-level57.html", banner: "Level 57" },
  ],
  // 4 归家路：Level 11
  4: [{ pass: "l11", page: "backrooms-level11.html", banner: "Level 11" }],
  // 5 上天堂：宜居 / 天堂
  5: [
    { pass: "l48", page: "backrooms-level48.html", banner: "Level 48" },
    { pass: "l14", page: "backrooms-level14.html", banner: "Level 14" },
  ],
};

let overlayEl = null;
let keyHandler = null;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function closeOverlay() {
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler, true);
    keyHandler = null;
  }
  if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
  overlayEl = null;
}

function teleport(survival, dest) {
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass(dest.pass);
  queueEnterLevelBanner(dest.banner);
  window.setTimeout(function () {
    window.location.href = dest.page;
  }, 900);
}

function killPlayer(survival) {
  window.setTimeout(function () {
    closeOverlay();
    if (survival && typeof survival.takeDamage === "function") {
      survival.takeDamage(99999);
    }
  }, 900);
}

/**
 * 开始一局轮盘赌。
 * @param {import("./backrooms-survival.js").BackroomsSurvival | null} survival
 * @param {(() => void) | undefined} onPull 真正扣动扳机时消耗物品
 */
export function playBackroomsRoulette(survival, onPull) {
  if (overlayEl) return false;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();

  var liveCount = 1 + Math.floor(Math.random() * 6); // 1..6 发实弹
  var spun = false;

  overlayEl = document.createElement("div");
  overlayEl.id = "backroomsRoulette";
  overlayEl.setAttribute("role", "dialog");
  overlayEl.style.cssText =
    "position:fixed;inset:0;z-index:130;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;gap:18px;" +
    "background:radial-gradient(ellipse at center,rgba(40,6,6,0.82),rgba(4,2,2,0.94));" +
    "font-family:system-ui,-apple-system,sans-serif;color:#f3e7e3;text-align:center;";

  var badge = document.createElement("div");
  badge.style.cssText =
    "min-width:280px;padding:10px 22px;border-radius:10px;" +
    "border:1px solid rgba(230,120,90,0.5);background:rgba(30,8,8,0.7);" +
    "font-size:clamp(18px,4.4vw,26px);letter-spacing:0.12em;text-shadow:0 2px 10px #000;";
  badge.textContent = "后室轮盘赌";

  var img = document.createElement("img");
  img.src = REVOLVER_IMG;
  img.alt = "改装左轮";
  img.draggable = false;
  img.style.cssText =
    "width:min(58vw,360px);max-height:34vh;object-fit:contain;" +
    "filter:drop-shadow(0 12px 30px rgba(0,0,0,0.6));";

  var info = document.createElement("p");
  info.style.cssText =
    "margin:0;font-size:clamp(14px,3.4vw,18px);line-height:1.7;color:#f0d6cf;white-space:pre-line;";
  info.textContent = "没人知道装入了多少实弹。\n扣动扳机——空弹传送、实弹归零。";

  var result = document.createElement("p");
  result.style.cssText =
    "margin:0;min-height:1.7em;font-size:clamp(15px,3.6vw,20px);font-weight:600;" +
    "letter-spacing:0.06em;text-shadow:0 2px 10px #000;";

  var actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:14px;flex-wrap:wrap;justify-content:center;";

  var pullBtn = document.createElement("button");
  pullBtn.type = "button";
  pullBtn.textContent = "扣动扳机";
  pullBtn.style.cssText =
    "padding:12px 26px;border-radius:10px;border:1px solid #d15a44;cursor:pointer;" +
    "background:#7a1f16;color:#ffe9e3;font-size:16px;letter-spacing:0.08em;";

  var leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.textContent = "放下轮盘";
  leaveBtn.style.cssText =
    "padding:12px 26px;border-radius:10px;border:1px solid #6a6a72;cursor:pointer;" +
    "background:#2a2a30;color:#e7e7ee;font-size:16px;letter-spacing:0.08em;";

  function resolvePull() {
    if (spun) return;
    spun = true;
    if (onPull) onPull();
    pullBtn.disabled = true;
    leaveBtn.disabled = true;
    pullBtn.style.opacity = "0.5";
    leaveBtn.style.opacity = "0.5";

    var landed = 1 + Math.floor(Math.random() * 6); // 停在的编号 1..6
    var isLive = Math.random() < liveCount / 6;
    badge.textContent = OUTCOME_LABELS[landed];
    result.textContent = "转轮飞速旋转……停在了「" + OUTCOME_LABELS[landed] + "」。";

    window.setTimeout(function () {
      if (isLive) {
        result.style.color = "#ff6a5a";
        result.textContent = "实弹！枪响的瞬间一切归于黑暗……";
        killPlayer(survival);
        return;
      }
      if (landed === 6) {
        result.style.color = "#ff6a5a";
        result.textContent = "还乡道——空膛，可这条路本就通往终点……";
        killPlayer(survival);
        return;
      }
      result.style.color = "#8fe6a0";
      var dest = pick(DEST_POOLS[landed]);
      result.textContent =
        "空膛！「" + OUTCOME_LABELS[landed] + "」——你被卷向 " + dest.banner + "……";
      teleport(survival, dest);
    }, 850);
  }

  pullBtn.addEventListener("click", resolvePull);
  leaveBtn.addEventListener("click", function () {
    if (spun) return;
    closeOverlay();
  });

  actions.appendChild(pullBtn);
  actions.appendChild(leaveBtn);
  overlayEl.appendChild(badge);
  overlayEl.appendChild(img);
  overlayEl.appendChild(info);
  overlayEl.appendChild(result);
  overlayEl.appendChild(actions);
  document.body.appendChild(overlayEl);

  keyHandler = function (e) {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      resolvePull();
    } else if (e.code === "Escape" && !spun) {
      e.preventDefault();
      e.stopPropagation();
      closeOverlay();
    }
  };
  document.addEventListener("keydown", keyHandler, true);
  return true;
}

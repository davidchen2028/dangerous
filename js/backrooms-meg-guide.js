import {
  MEG_DEPARTMENT_LABELS,
  MEG_RANK_LABELS,
  formatMegCareer,
  getMegCareerProfile,
} from "./backrooms-meg-career.js";

let guideEl = null;
let guideOpen = false;

function esc(value) {
  var node = document.createElement("span");
  node.textContent = String(value == null ? "" : value);
  return node.innerHTML;
}

function rankRouteHtml() {
  return [
    "none",
    "volunteer",
    "trainee",
    "member",
    "senior",
    "lead",
    "officer",
    "clearance",
    "supervisor",
  ]
    .map(function (rank) {
      return "<span>" + esc(MEG_RANK_LABELS[rank] || rank) + "</span>";
    })
    .join("<b>→</b>");
}

function profileHtml() {
  var profile = getMegCareerProfile();
  if (profile.locked || profile.online !== true) {
    return (
      '<section class="backrooms-meg-guide__profile">' +
      "<h2>你的编制档案</h2>" +
      "<p><strong>🔒 职务锁定</strong></p>" +
      "<p>单机模式不创建或晋升 M.E.G. 编制档案；连接游戏服务器后自动解锁。</p></section>"
    );
  }
  var stats = profile.stats || {};
  return (
    '<section class="backrooms-meg-guide__profile">' +
    "<h2>你的编制档案</h2>" +
    "<p><strong>" +
    esc(formatMegCareer(profile)) +
    "</strong>　档案 #" +
    esc(profile.identityId || profile.playerId || "本地") +
    "</p>" +
    "<p>职业贡献 " +
    Math.max(0, Number(profile.contribution) || 0) +
    "　完成任务 " +
    Math.max(0, Number(stats.tasks) || 0) +
    "　高危行动 " +
    Math.max(0, Number(stats.highRisk) || 0) +
    "　层级足迹 " +
    Math.max(0, Number(stats.footprints) || 0) +
    "</p></section>"
  );
}

function guideHtml() {
  return (
    '<div class="backrooms-meg-guide__panel" role="document">' +
    '<header><div><p class="backrooms-meg-guide__eyebrow">M.E.G. ALPHA 人事资料</p>' +
    "<h1>M.E.G. 编制说明</h1></div>" +
    '<button type="button" data-meg-guide-close aria-label="关闭编制说明">关闭 <kbd>E</kbd></button></header>' +
    '<div class="backrooms-meg-guide__body">' +
    profileHtml() +
    "<section><h2>什么是编制</h2>" +
    "<p>编制记录你在 M.E.G. 内的正式身份、职务、贡献、行动履历和纪律状态。职业贡献与商店使用的积分点不同：积分点可以消费，职业贡献只用于衡量履历和晋升资格。</p>" +
    '<div class="backrooms-meg-guide__route">' +
    rankRouteHtml() +
    "</div></section>" +
    "<section><h2>职业贡献</h2><ul>" +
    "<li>完成普通任务：+25；完成高危任务：普通完成 +25 后再加 +50。</li>" +
    "<li>消灭威胁实体：+20 职业贡献；帮助流浪者的救援与补给直接奖励积分点，不计职业贡献。</li>" +
    "<li>首次记录一个层级足迹：+2；阅读有效 C-101 档案：+40。</li>" +
    "<li>任务失败：-5；死亡：-10；袭击未主动攻击的流浪者：-40；袭击基地：-250。</li>" +
    "<li>同一事件不会重复记账，贡献最低为 0。</li>" +
    "</ul></section>" +
    "<section><h2>逐级晋升要求</h2>" +
    '<div class="backrooms-meg-guide__requirements">' +
    "<p><strong>志愿者</strong>贡献 25、任务 1、足迹 1；申请时生命至少 70、理智至少 65，且必须存活。</p>" +
    "<p><strong>见习队员</strong>贡献 75、任务 3、足迹 2。</p>" +
    "<p><strong>正式队员</strong>贡献 180、任务 6、足迹 3，并选择正式职务。</p>" +
    "<p><strong>资深队员</strong>贡献 350、任务 10、高危 1、足迹 4。</p>" +
    "<p><strong>小队领队</strong>贡献 600、任务 14、高危 2、足迹 6。</p>" +
    "<p><strong>前哨主管</strong>贡献 900、任务 18、高危 2、足迹 7，任务失败不超过 4 次。</p>" +
    "<p><strong>数据库授权员</strong>贡献 1200、任务 22、高危 3、足迹 9；失败不超过 3 次、死亡不超过 5 次，且无处分或调查。</p>" +
    "<p><strong>监督者</strong>贡献 1500、任务 25、高危 3、足迹 10；失败不超过 2 次、死亡不超过 3 次，阅读 4 份 C-101 档案，且档案清白。</p>" +
    "</div></section>" +
    "<section><h2>四种正式职务</h2><ul>" +
    "<li><strong>" +
    esc(MEG_DEPARTMENT_LABELS.explore) +
    "</strong>：地图测绘、路线确认和未知区域侦察。</li>" +
    "<li><strong>" +
    esc(MEG_DEPARTMENT_LABELS.research) +
    "</strong>：异常研究、采样、文档和资料分析。</li>" +
    "<li><strong>" +
    esc(MEG_DEPARTMENT_LABELS.logistics) +
    "</strong>：补给、包裹、仓储和基地保障。</li>" +
    "<li><strong>" +
    esc(MEG_DEPARTMENT_LABELS.security) +
    "</strong>：设施巡检、基地防卫和威胁处置。</li>" +
    "</ul><p>完成与职务匹配的任务会获得 10% 额外积分点，但不会额外增加职业贡献。</p></section>" +
    "<section><h2>权限与纪律</h2>" +
    "<p>正式队员起可使用编制寄存柜；领队和主管逐步获得高级任务及管理权限；数据库授权员可阅读 C-101 受保护档案；监督者可提交 C-101 指令。</p>" +
    "<p>处分、停权或调查会冻结晋升，并可能暂停高密级权限。职务、贡献、举报和全服监督者席位均使用服务器档案；单机模式下职务系统锁定。</p></section>" +
    "<section><h2>监督者编号</h2>" +
    "<p>A–D 已由既有监督者占用，Z 为永久保留编号。玩家编号从 E 开始，由全服席位和管理员审批决定。</p>" +
    "</section></div></div>"
  );
}

function ensureGuide() {
  if (guideEl && guideEl.isConnected) return guideEl;
  guideEl = document.createElement("div");
  guideEl.className = "backrooms-meg-guide";
  guideEl.hidden = true;
  guideEl.setAttribute("role", "dialog");
  guideEl.setAttribute("aria-modal", "true");
  guideEl.setAttribute("aria-label", "M.E.G. 编制说明");
  guideEl.addEventListener("click", function (event) {
    if (event.target === guideEl || event.target.closest("[data-meg-guide-close]")) {
      closeMegCareerGuide();
    }
  });
  document.body.appendChild(guideEl);
  return guideEl;
}

export function openMegCareerGuide() {
  var root = ensureGuide();
  root.innerHTML = guideHtml();
  root.hidden = false;
  guideOpen = true;
  document.body.classList.add("backrooms-meg-guide-open");
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  var panel = root.querySelector(".backrooms-meg-guide__body");
  if (panel) panel.scrollTop = 0;
}

export function closeMegCareerGuide() {
  if (!guideEl) return;
  guideEl.hidden = true;
  guideOpen = false;
  document.body.classList.remove("backrooms-meg-guide-open");
}

export function isMegCareerGuideOpen() {
  return guideOpen;
}

window.addEventListener(
  "keydown",
  function (event) {
    if (!guideOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat && (event.code === "KeyE" || event.code === "Escape")) {
      closeMegCareerGuide();
    }
  },
  true
);

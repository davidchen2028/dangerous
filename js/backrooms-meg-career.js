import {
  PROFILE_EVENT,
  getMegOnlineProfile,
  megApi,
  syncMegOnlineProfile,
} from "./backrooms-online-profile.js";

export const MEG_RANKS = Object.freeze([
  "none",
  "volunteer",
  "trainee",
  "member",
  "senior",
  "lead",
  "officer",
  "clearance",
  "supervisor",
]);

export const MEG_RANK_LABELS = Object.freeze({
  none: "流浪者",
  volunteer: "志愿者",
  trainee: "见习队员",
  member: "正式队员",
  senior: "资深队员",
  lead: "小队领队",
  officer: "前哨主管",
  clearance: "数据库授权员",
  supervisor: "监督者",
});

export const MEG_DEPARTMENT_LABELS = Object.freeze({
  explore: "探索专员",
  research: "研究专员",
  logistics: "后勤专员",
  security: "安保专员",
});

const PERMISSIONS = Object.freeze({
  none: [],
  volunteer: ["report", "tasks"],
  trainee: ["report", "tasks", "training", "storage_view"],
  member: ["report", "tasks", "training", "storage", "department_tasks"],
  senior: ["report", "tasks", "training", "storage", "department_tasks", "advanced_storage"],
  lead: [
    "report",
    "tasks",
    "training",
    "storage",
    "department_tasks",
    "advanced_storage",
    "lead_tasks",
  ],
  officer: [
    "report",
    "tasks",
    "training",
    "storage",
    "department_tasks",
    "advanced_storage",
    "lead_tasks",
    "outpost_manage",
    "apply_clearance",
  ],
  clearance: [
    "report",
    "tasks",
    "training",
    "storage",
    "department_tasks",
    "advanced_storage",
    "lead_tasks",
    "outpost_manage",
    "c101_read",
    "review_low_cases",
    "apply_supervisor",
  ],
  supervisor: [
    "report",
    "tasks",
    "training",
    "storage",
    "department_tasks",
    "advanced_storage",
    "lead_tasks",
    "outpost_manage",
    "c101_read",
    "c101_submit",
    "review_low_cases",
    "supervisor_roster",
  ],
});

let mountedEls = [];

function emptyCareerStub() {
  return {
    rank: "none",
    department: "",
    contribution: 0,
    online: true,
    local: true,
    authorityActive: true,
  };
}

export function getMegCareerProfile() {
  return getMegOnlineProfile() || emptyCareerStub();
}

export function getMegRankIndex(rank) {
  var i = MEG_RANKS.indexOf(rank);
  return i < 0 ? 0 : i;
}

export function getNextMegRank(rank) {
  var i = getMegRankIndex(rank);
  return i >= MEG_RANKS.length - 1 ? null : MEG_RANKS[i + 1];
}

export function hasMegPermission(permission, profile) {
  var p = profile || getMegCareerProfile();
  if (p.online === false && (permission === "c101_submit" || permission === "review_low_cases")) {
    return false;
  }
  if (p.authorityActive === false && (permission === "c101_submit" || permission === "review_low_cases")) {
    return false;
  }
  return (PERMISSIONS[p.rank] || []).indexOf(permission) >= 0;
}

export function formatMegCareer(profile) {
  var p = profile || getMegCareerProfile();
  var text = MEG_RANK_LABELS[p.rank] || MEG_RANK_LABELS.none;
  if (p.department && MEG_DEPARTMENT_LABELS[p.department]) {
    text += " · " + MEG_DEPARTMENT_LABELS[p.department];
  }
  if (p.rank === "supervisor" && p.supervisorCode) text += " " + p.supervisorCode;
  if (p.authorityActive === false && p.rank !== "none") text += "（停权）";
  return text;
}

function renderMounted() {
  var profile = getMegCareerProfile();
  for (var i = mountedEls.length - 1; i >= 0; i -= 1) {
    var el = mountedEls[i];
    if (!el || !el.isConnected) {
      mountedEls.splice(i, 1);
      continue;
    }
    el.textContent = formatMegCareer(profile);
    el.title =
      "职业贡献 " +
      Math.max(0, Number(profile.contribution) || 0) +
      (profile.local ? " · 单机档案" : "");
  }
}

export function mountMegCareerHud(anchor) {
  if (!anchor || !anchor.parentNode) return null;
  var root = document.createElement("p");
  root.className = "backrooms-points backrooms-meg-career";
  root.innerHTML =
    '<span class="backrooms-points__label">M.E.G</span>' +
    '<strong class="backrooms-points__value">连接中…</strong>';
  anchor.parentNode.insertBefore(root, anchor.nextSibling);
  var value = root.querySelector("strong");
  mountedEls.push(value);
  renderMounted();
  return value;
}

export function initMegCareer(options) {
  var opts = options || {};
  if (opts.hudAnchor) mountMegCareerHud(opts.hudAnchor);
  window.addEventListener(PROFILE_EVENT, renderMounted);
  return syncMegOnlineProfile()
    .then(function (profile) {
      renderMounted();
      return profile;
    })
    .catch(function (err) {
      renderMounted();
      if (opts.onError) opts.onError(err);
      return null;
    });
}

function requirementText(profile) {
  var reasons = profile && (profile.promotionReasons || profile.reasons);
  if (!Array.isArray(reasons) || !reasons.length) return "人事系统将核验任务、足迹、纪律与职业贡献。";
  return reasons.join("；");
}

export function describeMegCareer() {
  var profile = getMegCareerProfile();
  var next = getNextMegRank(profile.rank);
  var text =
    "档案 #" +
    (profile.identityId || profile.playerId || "本地") +
    "。当前编制：" +
    formatMegCareer(profile) +
    "。职业贡献：" +
    Math.max(0, Number(profile.contribution) || 0) +
    "。";
  if (!next) return text + " 你已进入监督者编制。";
  var pending = profile.pendingApplication || profile.pendingPromotion;
  if (pending) {
    return text + " 你的" + (MEG_RANK_LABELS[pending.requestedRank || pending.to_rank] || "晋升") + "申请正在审批。";
  }
  return text + " 下一职级：" + MEG_RANK_LABELS[next] + "。尚需：" + requirementText(profile);
}

export async function applyForNextMegRank(department, vitals) {
  var profile = getMegCareerProfile();
  var targetRank = getNextMegRank(profile.rank);
  if (!targetRank) throw new Error("已经达到当前最高编制");
  if (targetRank === "member" && !department && !profile.department) {
    throw new Error("资质认证前必须选择探索、研究、后勤或安保职务");
  }
  var payload = await megApi("promotion/apply", {
    body: {
      targetRank: targetRank,
      department: department || profile.department || "",
      vitals: vitals || null,
    },
  });
  return payload;
}

export async function chooseMegDepartment(department) {
  if (!MEG_DEPARTMENT_LABELS[department]) throw new Error("未知的 M.E.G 职务");
  return megApi("department", { body: { department: department } });
}

export async function submitMegReport(targetPlayerId, reason, statement, evidenceEventIds) {
  if (!targetPlayerId) throw new Error("必须填写被举报者的后室玩家 ID");
  if (!reason) throw new Error("必须选择举报原因");
  return megApi("report", {
    body: {
      targetIdentityId: targetPlayerId,
      reason: reason,
      details: statement || "",
      evidence: (evidenceEventIds || []).map(function (eventId) {
        return { eventId: eventId };
      }),
    },
  });
}

export async function getReviewableMegCases() {
  var payload = await megApi("cases/reviewable", { method: "GET" });
  return payload.cases || [];
}

export async function reviewMegCase(caseId, decision, action, note) {
  return megApi("cases/review", {
    body: {
      caseId: caseId,
      decision: decision,
      action: action || "",
      note: note || "",
    },
  });
}

export function megDepartmentChoicesHtml(attributeName) {
  var attr = attributeName || "data-meg-department";
  return Object.keys(MEG_DEPARTMENT_LABELS)
    .map(function (id) {
      return (
        '<button type="button" class="backrooms-dialogue__choice" ' +
        attr +
        '="' +
        id +
        '">' +
        MEG_DEPARTMENT_LABELS[id] +
        "</button>"
      );
    })
    .join("");
}

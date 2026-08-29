/**
 * 单机 M.E.G 编制档案。
 *
 * 规则与 server/db.py 保持一致，但所有数据都保存在浏览器 localStorage。
 * 将来恢复联机时，可继续由 backrooms-online-profile.js 切回服务端 API。
 */
const STORE_KEY = "backrooms_meg_career_local_v2";
const OLD_PROFILE_KEY = "backrooms_meg_profile_v1";
const DISPLAY_NAME_KEY = "backrooms_display_name_v1";

const RANKS = [
  "none",
  "volunteer",
  "trainee",
  "member",
  "senior",
  "lead",
  "officer",
  "clearance",
  "supervisor",
];

const DEPARTMENTS = ["explore", "security", "logistics", "research"];

const CONTRIBUTION = {
  task_complete: 25,
  task_failed: -5,
  death: -10,
  level_enter: 2,
  c101_archive: 40,
  c101_submit: 0,
  high_risk_complete: 50,
  base_assault: -250,
  civilian_assault: -40,
  entity_neutralized: 20,
  rescue_complete: 35,
  supply_delivered: 15,
};

const TASK_IDS = new Set([
  "package_l1",
  "map_l21",
  "recon_c1291",
  "inspect_coolers",
  "map_l13",
  "rubbing_c1290",
  "docs_c1292",
  "sample_c144_collapse",
  "recon_c144_mutant",
  "loop_c192",
  "sample_c1299_fog",
  "beacon_c1299",
  "pages_c1299",
  "fasting_cruise",
]);

const HIGH_RISK_TASK_IDS = new Set([
  "recon_c1291",
  "rubbing_c1290",
  "docs_c1292",
  "sample_c144_collapse",
  "recon_c144_mutant",
  "loop_c192",
  "sample_c1299_fog",
  "beacon_c1299",
  "pages_c1299",
]);

const REQUIREMENTS = {
  volunteer: { contribution: 25, tasks: 1, footprints: 1 },
  trainee: { contribution: 75, tasks: 3, footprints: 2 },
  member: { contribution: 180, tasks: 6, footprints: 3, department: true },
  senior: { contribution: 350, tasks: 10, highRisk: 1, footprints: 4 },
  lead: { contribution: 600, tasks: 14, highRisk: 2, footprints: 6 },
  officer: {
    contribution: 900,
    tasks: 18,
    highRisk: 2,
    footprints: 7,
    failuresMax: 4,
  },
  clearance: {
    contribution: 1200,
    tasks: 22,
    highRisk: 3,
    footprints: 9,
    failuresMax: 3,
    deathsMax: 5,
    cleanRecord: true,
  },
  supervisor: {
    contribution: 1500,
    tasks: 25,
    highRisk: 3,
    footprints: 10,
    failuresMax: 2,
    deathsMax: 3,
    c101Archives: 4,
    cleanRecord: true,
  },
};

let memoryState = null;

function nowIso() {
  return new Date().toISOString();
}

function readStorage(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (_err) {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_err) {
    return false;
  }
}

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return "LOCAL-" + globalThis.crypto.randomUUID().slice(0, 8).toUpperCase();
  }
  return (
    "LOCAL-" +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function displayName() {
  var saved = readStorage(DISPLAY_NAME_KEY).trim();
  if (saved) return saved;
  var generated = "流浪者-" + Math.floor(Math.random() * 9000 + 1000);
  writeStorage(DISPLAY_NAME_KEY, generated);
  return generated;
}

function blankStats() {
  return {
    tasks: 0,
    failures: 0,
    deaths: 0,
    highRisk: 0,
    c101Archives: 0,
    footprints: {},
  };
}

function createState() {
  var createdAt = nowIso();
  return {
    schemaVersion: 2,
    identity: {
      identityId: randomId(),
      displayName: displayName(),
      createdAt: createdAt,
      lastSeenAt: createdAt,
    },
    profile: {
      rank: "none",
      department: "",
      contribution: 0,
      status: "active",
      supervisorCode: "",
      promotionFrozen: false,
      updatedAt: createdAt,
    },
    stats: blankStats(),
    eventIds: {},
    events: [],
    reports: [],
    sanctions: [],
    nextId: 1,
  };
}

function sanitizeState(value) {
  var state = value && typeof value === "object" ? value : createState();
  state.schemaVersion = 2;
  state.identity = state.identity || createState().identity;
  state.identity.identityId = String(state.identity.identityId || randomId());
  state.identity.displayName = String(state.identity.displayName || displayName());
  state.profile = state.profile || createState().profile;
  if (RANKS.indexOf(state.profile.rank) < 0) state.profile.rank = "none";
  if (DEPARTMENTS.indexOf(state.profile.department) < 0) state.profile.department = "";
  state.profile.contribution = Math.max(0, Number(state.profile.contribution) || 0);
  state.profile.status = state.profile.status || "active";
  state.stats = Object.assign(blankStats(), state.stats || {});
  if (!state.stats.footprints || typeof state.stats.footprints !== "object") {
    state.stats.footprints = {};
  }
  state.eventIds = state.eventIds && typeof state.eventIds === "object" ? state.eventIds : {};
  state.events = Array.isArray(state.events) ? state.events : [];
  state.reports = Array.isArray(state.reports) ? state.reports : [];
  state.sanctions = Array.isArray(state.sanctions) ? state.sanctions : [];
  state.nextId = Math.max(1, Number(state.nextId) || 1);
  return state;
}

function migrateOldProfile(state) {
  var raw = readStorage(OLD_PROFILE_KEY);
  if (!raw) return state;
  try {
    var old = JSON.parse(raw);
    if (!old || typeof old !== "object") return state;
    // 显示名 / 本地身份可以继承；未标记为 local 的旧联网缓存不得直接送监督者席位。
    if (old.displayName) state.identity.displayName = String(old.displayName);
    if (old.local === true || old.mode === "local") {
      if (RANKS.indexOf(old.rank) >= 0) state.profile.rank = old.rank;
      if (DEPARTMENTS.indexOf(old.department) >= 0) state.profile.department = old.department;
      state.profile.contribution = Math.max(0, Number(old.contribution) || 0);
      state.profile.status = old.status || "active";
      state.profile.supervisorCode = old.supervisorCode || "";
      if (old.identityId || old.playerId) {
        state.identity.identityId = String(old.identityId || old.playerId);
      }
    }
  } catch (_err) {
    /* 损坏的旧联网缓存不阻止创建新单机档案。 */
  }
  return state;
}

function loadState() {
  var raw = readStorage(STORE_KEY);
  if (raw) {
    try {
      memoryState = sanitizeState(JSON.parse(raw));
      return memoryState;
    } catch (_err) {
      /* 继续创建可用的新档案。 */
    }
  }
  memoryState = migrateOldProfile(createState());
  saveState(memoryState);
  return memoryState;
}

function saveState(state) {
  state.identity.lastSeenAt = nowIso();
  state.profile.updatedAt = state.identity.lastSeenAt;
  memoryState = sanitizeState(state);
  writeStorage(STORE_KEY, JSON.stringify(memoryState));
  return memoryState;
}

function activeSanctions(state) {
  return state.sanctions.filter(function (item) {
    return item.active !== false;
  });
}

function openCases(state) {
  return state.reports.filter(function (item) {
    return (
      String(item.targetIdentityId) === String(state.identity.identityId) &&
      (item.status === "pending" || item.status === "investigating")
    );
  });
}

function eligibility(state, targetRank) {
  var req = REQUIREMENTS[targetRank] || {};
  var stats = state.stats;
  var reasons = [];
  var values = {
    contribution: state.profile.contribution,
    tasks: Number(stats.tasks) || 0,
    highRisk: Number(stats.highRisk) || 0,
    footprints: Object.keys(stats.footprints || {}).length,
    c101Archives: Number(stats.c101Archives) || 0,
  };
  var labels = {
    contribution: "职业贡献",
    tasks: "完成任务",
    highRisk: "高危行动",
    footprints: "层级足迹",
    c101Archives: "C-101 档案阅读",
  };
  Object.keys(values).forEach(function (name) {
    if (req[name] != null && values[name] < req[name]) {
      reasons.push(
        (labels[name] || name) + "需要至少 " + req[name] + "（当前 " + values[name] + "）"
      );
    }
  });
  if (req.failuresMax != null && stats.failures > req.failuresMax) {
    reasons.push("任务失败不得超过 " + req.failuresMax + " 次（当前 " + stats.failures + "）");
  }
  if (req.deathsMax != null && stats.deaths > req.deathsMax) {
    reasons.push("死亡次数不得超过 " + req.deathsMax + " 次（当前 " + stats.deaths + "）");
  }
  if (req.department && !state.profile.department) reasons.push("正式队员晋升前必须选择职务");
  if (req.cleanRecord && activeSanctions(state).length) reasons.push("存在有效处分");
  if (req.cleanRecord && openCases(state).length) reasons.push("存在调查中的案件");
  if (state.profile.promotionFrozen) reasons.push("晋升已被冻结");
  if (state.profile.status !== "active") {
    var statusLabels = { active: "正常", suspended: "停权", archived: "封存" };
    reasons.push("档案状态为" + (statusLabels[state.profile.status] || state.profile.status));
  }
  return { requirements: req, reasons: reasons };
}

function profileFromState(state) {
  var rank = state.profile.rank;
  var rankIndex = Math.max(0, RANKS.indexOf(rank));
  var nextRank = rank === "supervisor" ? null : RANKS[rankIndex + 1];
  var check = nextRank ? eligibility(state, nextRank) : { requirements: {}, reasons: [] };
  var investigations = openCases(state);
  var highRiskAuthorityEffective =
    (rank === "clearance" || rank === "supervisor") &&
    state.profile.status === "active" &&
    investigations.length === 0;
  var authorityActive =
    rank === "clearance" || rank === "supervisor"
      ? highRiskAuthorityEffective
      : state.profile.status === "active";
  return {
    identityId: state.identity.identityId,
    playerId: state.identity.identityId,
    displayName: state.identity.displayName,
    rank: rank,
    department: state.profile.department,
    contribution: state.profile.contribution,
    status: state.profile.status,
    supervisorCode: state.profile.supervisorCode || "",
    promotionFrozen: !!state.profile.promotionFrozen,
    stats: {
      tasks: Number(state.stats.tasks) || 0,
      failures: Number(state.stats.failures) || 0,
      deaths: Number(state.stats.deaths) || 0,
      highRisk: Number(state.stats.highRisk) || 0,
      c101Archives: Number(state.stats.c101Archives) || 0,
      footprints: Object.keys(state.stats.footprints || {}).length,
    },
    nextRank: nextRank,
    requirements: check.requirements,
    reasons: check.reasons,
    eligible: !!nextRank && check.reasons.length === 0,
    highRiskAuthorityEffective: highRiskAuthorityEffective,
    authorityActive: authorityActive,
    activeSanctions: activeSanctions(state),
    openInvestigations: investigations,
    pendingPromotion: null,
    pendingApplication: null,
    online: true,
    local: true,
    mode: "local",
  };
}

function eventAllowed(state, type, levelId, payload) {
  if (!Object.prototype.hasOwnProperty.call(CONTRIBUTION, type)) return false;
  var taskId = String(payload.taskId || "");
  if ((type === "task_complete" || type === "task_failed") && !TASK_IDS.has(taskId)) {
    return false;
  }
  if (type === "high_risk_complete" && !HIGH_RISK_TASK_IDS.has(taskId)) return false;
  if (type === "level_enter" && !levelId) return false;
  if (type === "c101_archive") {
    if (state.profile.rank !== "clearance" && state.profile.rank !== "supervisor") return false;
    if (["A", "B", "E", "F"].indexOf(String(payload.archiveId || "")) < 0) return false;
  }
  if (type === "c101_submit") {
    if (state.profile.rank !== "supervisor" || state.profile.status !== "active") return false;
    if (openCases(state).length) return false;
  }
  return true;
}

function recordEvent(state, body) {
  var type = String(body.type || "");
  var levelId = String(body.levelId || "");
  var payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  var eventId = String(body.eventId || "");
  if (!eventId || !eventAllowed(state, type, levelId, payload)) {
    throw new Error("事件记录失败");
  }
  if (state.eventIds[eventId]) {
    return { ok: true, duplicate: true, serverValidated: false };
  }
  state.eventIds[eventId] = true;
  var delta = CONTRIBUTION[type];
  state.profile.contribution = Math.max(0, state.profile.contribution + delta);
  if (type === "task_complete") state.stats.tasks += 1;
  if (type === "task_failed") state.stats.failures += 1;
  if (type === "death") state.stats.deaths += 1;
  if (
    type === "high_risk_complete" ||
    type === "entity_neutralized" ||
    type === "rescue_complete"
  ) {
    state.stats.highRisk += 1;
  }
  if (type === "level_enter") state.stats.footprints[levelId] = true;
  if (type === "c101_archive") state.stats.c101Archives += 1;
  state.events.push({
    eventId: eventId,
    type: type,
    levelId: levelId,
    payload: payload,
    contributionDelta: delta,
    createdAt: nowIso(),
  });
  saveState(state);
  return { ok: true, duplicate: false, serverValidated: false };
}

function applyPromotion(state, body) {
  var profile = profileFromState(state);
  var target = profile.nextRank;
  if (!target) throw new Error("已经达到当前最高编制");
  if (target === "volunteer") {
    var vitals = body.vitals && typeof body.vitals === "object" ? body.vitals : {};
    if (vitals.dead || Number(vitals.hp) < 70 || Number(vitals.sanity) < 65) {
      throw new Error("入职体检未通过：生命须至少 70、理智须至少 65，且申请人必须存活");
    }
  }
  var department = String(body.department || "").toLowerCase();
  if (department) {
    if (DEPARTMENTS.indexOf(department) < 0) throw new Error("无效职务");
    state.profile.department = department;
  }
  var check = eligibility(state, target);
  if (check.reasons.length) throw new Error(check.reasons.join("；"));
  state.profile.rank = target;
  if (target === "supervisor") state.profile.supervisorCode = "E";
  saveState(state);
  var rankLabels = {
    volunteer: "志愿者",
    trainee: "见习队员",
    member: "正式队员",
    senior: "资深队员",
    lead: "小队领队",
    officer: "前哨主管",
    clearance: "数据库授权员",
    supervisor: "监督者",
  };
  return {
    ok: true,
    pending: false,
    applicationId: null,
    message:
      target === "supervisor"
        ? "单机编制核验通过：已晋升为监督者并分配编号 E"
        : "编制核验通过，已晋升为" + (rankLabels[target] || target),
  };
}

/** 与 server/db.py recommendation_for_report 对齐；联机后仍由服务端裁决，本地保留同规则便于切回。 */
function recommendation(reason) {
  var text = String(reason || "").toLowerCase();
  if (/叛变|泄密|滥权|腐败|c101_abuse/.test(text)) return "revoke_supervisor";
  if (/伪造|清除权限|密级|rank_forgery/.test(text)) return "revoke_clearance";
  if (/重大失职|危害基地/.test(text)) return "suspend_supervisor";
  if (/暴力|袭击|蓄意伤害|base_assault/.test(text)) return "demote";
  if (/拒绝命令|失职|task_sabotage/.test(text)) return "suspend_role";
  if (/作弊|虚报|刷贡献/.test(text)) return "freeze_promotion";
  return "warning";
}

function createReport(state, body) {
  if (state.profile.rank === "none" || state.profile.status !== "active") {
    throw new Error("只有在编且未停权的 M.E.G 人员可以提交纪律举报");
  }
  var targetId = String(body.targetIdentityId || "");
  if (!targetId) throw new Error("必须填写被举报者的后室玩家 ID");
  if (targetId === String(state.identity.identityId)) throw new Error("不能举报自己的单机档案");
  var suggested = recommendation(String(body.reason || "") + " " + String(body.details || ""));
  throw new Error(
    "单机模式中不存在其他玩家档案；纪律举报将在联机后生效（届时推荐处罚：" + suggested + "）"
  );
}

export function recommendMegSanction(reason) {
  return recommendation(reason);
}

function reviewCase(state, body) {
  var profile = profileFromState(state);
  if (
    profile.rank !== "clearance" &&
    profile.rank !== "supervisor"
  ) {
    throw new Error("数据库权限不足");
  }
  var item = state.reports.find(function (entry) {
    return Number(entry.id) === Number(body.caseId);
  });
  if (!item || item.status !== "pending") throw new Error("案件不存在或已处理");
  if (String(item.targetIdentityId) === String(state.identity.identityId)) {
    throw new Error("不能审理涉及自己的案件");
  }
  item.status = body.decision === "dismiss" ? "dismissed" : "sanctioned";
  item.reviewNote = String(body.note || "");
  item.reviewedAt = nowIso();
  saveState(state);
  return { ok: true, message: "案件处理完毕" };
}

export function isMegHighRiskTaskId(taskId) {
  return HIGH_RISK_TASK_IDS.has(String(taskId || ""));
}

export function isMegTaskId(taskId) {
  return TASK_IDS.has(String(taskId || ""));
}

export function getLocalMegProfile() {
  return profileFromState(loadState());
}

export function setLocalMegDisplayName(name) {
  var value = String(name || "").trim();
  if (value.length < 2 || value.length > 24) throw new Error("显示名须为 2～24 个字符");
  var state = loadState();
  state.identity.displayName = value;
  writeStorage(DISPLAY_NAME_KEY, value);
  saveState(state);
  return { ok: true, profile: profileFromState(state) };
}

export function localMegApi(path, options) {
  var route = String(path || "").replace(/^\/+/, "");
  var opts = options || {};
  var body = opts.body && typeof opts.body === "object" ? opts.body : {};
  var state = loadState();
  var result;
  if (route === "profile") {
    result =
      String(opts.method || "GET").toUpperCase() === "PATCH"
        ? setLocalMegDisplayName(body.displayName)
        : { ok: true };
  } else if (route === "event") {
    result = recordEvent(state, body);
  } else if (route === "promotion/apply") {
    result = applyPromotion(state, body);
  } else if (route === "department") {
    if (String(opts.method || "POST").toUpperCase() !== "GET") {
      if (DEPARTMENTS.indexOf(String(body.department || "")) < 0) throw new Error("无效职务");
      state.profile.department = String(body.department);
      saveState(state);
    }
    result = { ok: true, departments: DEPARTMENTS.slice() };
  } else if (route === "report") {
    result = createReport(state, body);
  } else if (route === "cases/mine") {
    result = { ok: true, cases: state.reports.slice() };
  } else if (route === "cases/reviewable") {
    result = {
      ok: true,
      cases: state.reports.filter(function (item) {
        return item.status === "pending" && !item.requiresAdmin;
      }),
    };
  } else if (route === "cases/review") {
    result = reviewCase(state, body);
  } else {
    throw new Error("单机编制接口不存在：" + route);
  }
  var latest = loadState();
  result.profile = profileFromState(latest);
  result.local = true;
  return Promise.resolve(result);
}

export function resetLocalMegMemoryCache() {
  memoryState = null;
}

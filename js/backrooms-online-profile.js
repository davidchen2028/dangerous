/** M.E.G. 编制只使用服务端档案；静态/离线单机模式保持锁定。 */
const DISPLAY_NAME_KEY = "backrooms_display_name_v1";
const IDENTITY_TOKEN_KEY = "backrooms_meg_identity_token_v1";
const LOBBY_NAME_KEY = "jiwei_nick";
const PROFILE_EVENT = "backrooms-meg-profile";
/** 单机时每个事件都去探活会打出大量必然失败的请求，锁定后冷却一段时间再重试。 */
const LOCK_RETRY_COOLDOWN_MS = 15000;
const DEFAULT_LOCK_REASON = "单机模式下 M.E.G. 职务已锁定，连接服务器后解锁";

let currentProfile = null;
let syncPromise = null;
let lockedAt = 0;
let lockReason = DEFAULT_LOCK_REASON;

function lockedProfile() {
  return {
    rank: "none",
    department: "",
    contribution: 0,
    online: false,
    local: false,
    locked: true,
    authorityActive: false,
    lockReason: lockReason,
  };
}

function readLocal(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (_err) {
    return "";
  }
}

function writeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch (_err) {
    /* private mode: online career remains unavailable */
  }
}

function publish(profile) {
  currentProfile = profile ? Object.assign({}, profile) : null;
  if (currentProfile) {
    if (typeof currentProfile.online !== "boolean") currentProfile.online = true;
    currentProfile.local = false;
    currentProfile.locked = currentProfile.online === false;
    currentProfile.authorityActive =
      currentProfile.locked
        ? false
        : currentProfile.rank === "clearance" || currentProfile.rank === "supervisor"
        ? currentProfile.highRiskAuthorityEffective !== false
        : currentProfile.status === "active";
    try {
      sessionStorage.setItem("backrooms_meg_rank", currentProfile.rank || "none");
      sessionStorage.setItem("backrooms_meg_department", currentProfile.department || "");
      sessionStorage.setItem("backrooms_meg_supervisor_code", currentProfile.supervisorCode || "");
      sessionStorage.setItem(
        "backrooms_meg_authority_active",
        currentProfile.authorityActive === false ? "0" : "1"
      );
    } catch (_err) {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: currentProfile }));
  return currentProfile;
}

function cachedProfile() {
  if (currentProfile) return currentProfile;
  currentProfile = lockedProfile();
  return currentProfile;
}

function serverDisplayName() {
  var name = (readLocal(DISPLAY_NAME_KEY) || readLocal(LOBBY_NAME_KEY) || "").trim();
  if (name.length >= 2 && name.length <= 24) return name;
  return "流浪者" + Math.floor(1000 + Math.random() * 9000);
}

async function requestJson(path, options) {
  var opts = options || {};
  var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
  var token = readLocal(IDENTITY_TOKEN_KEY);
  if (token) headers.Authorization = "Bearer " + token;
  if (opts.body != null) headers["Content-Type"] = "application/json";
  var response;
  try {
    response = await fetch("/api/backrooms/" + String(path || "").replace(/^\/+/, ""), {
      method: opts.method || (opts.body != null ? "POST" : "GET"),
      headers: headers,
      body: opts.body == null ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
  } catch (_err) {
    /* 传输层报错（静态托管、断网、CORS）不适合直接展示给玩家 */
    throw new Error("未连接到游戏服务器");
  }
  var payload;
  try {
    payload = await response.json();
  } catch (_err) {
    throw new Error("未连接到游戏服务器");
  }
  if (!response.ok || payload.ok === false) {
    var error = new Error(payload.message || "服务器拒绝了编制请求");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function restoreOrCreateIdentity() {
  var token = readLocal(IDENTITY_TOKEN_KEY);
  try {
    var payload = await requestJson("identity", {
      body: token ? {} : { displayName: serverDisplayName() },
    });
    if (payload.token) writeLocal(IDENTITY_TOKEN_KEY, payload.token);
    return payload.profile;
  } catch (err) {
    if (token && err && err.status === 401) {
      writeLocal(IDENTITY_TOKEN_KEY, null);
      var created = await requestJson("identity", {
        body: { displayName: serverDisplayName() },
      });
      if (created.token) writeLocal(IDENTITY_TOKEN_KEY, created.token);
      return created.profile;
    }
    throw err;
  }
}

/**
 * 探测服务器编制档案。始终复用进行中的请求，避免并发调用重复创建身份；
 * 单机锁定后进入冷却，冷却期内直接返回锁定档案而不再发请求。
 */
export async function syncMegOnlineProfile(force) {
  if (syncPromise) return syncPromise;
  if (!force && !isMegOnline() && lockedAt && Date.now() - lockedAt < LOCK_RETRY_COOLDOWN_MS) {
    return cachedProfile();
  }
  syncPromise = requestJson("status")
    .then(function (status) {
      if (!status.megOnline || status.locked) {
        throw new Error(status.message || "服务器职务系统未开放");
      }
      return restoreOrCreateIdentity();
    })
    .then(function (profile) {
      lockedAt = 0;
      lockReason = DEFAULT_LOCK_REASON;
      return publish(Object.assign({}, profile, { online: true, locked: false }));
    })
    .catch(function (err) {
      lockedAt = Date.now();
      lockReason = (err && err.message) || DEFAULT_LOCK_REASON;
      return publish(lockedProfile());
    })
    .finally(function () {
      syncPromise = null;
    });
  return syncPromise;
}

export async function megApi(path, options) {
  if (!isMegOnline()) await syncMegOnlineProfile();
  if (!isMegOnline()) throw new Error(lockReason);
  var payload = await requestJson(path, options || {});
  if (payload.profile) publish(payload.profile);
  return payload;
}

export function getMegOnlineProfile() {
  return cachedProfile();
}

export function isMegOnline() {
  var profile = cachedProfile();
  return !!(profile && profile.online === true && profile.locked !== true);
}

export function getBackroomsPlayerId() {
  var profile = cachedProfile();
  return profile ? profile.playerId || profile.identityId || profile.id || "" : "";
}

export async function setBackroomsDisplayName(displayName) {
  var name = String(displayName || "").trim();
  if (name.length < 2 || name.length > 24) throw new Error("显示名须为 2～24 个字符");
  writeLocal(DISPLAY_NAME_KEY, name);
  var payload = await megApi("profile", {
    method: "PATCH",
    body: { displayName: name },
  });
  if (payload.profile) publish(payload.profile);
  return payload;
}

export async function recordMegCareerEvent(type, data, eventId) {
  var id =
    eventId ||
    type +
      ":" +
      Date.now().toString(36) +
      ":" +
      Math.random().toString(36).slice(2, 10);
  return megApi("event", {
    body: {
      eventId: id,
      type: type,
      levelId: data && data.levelId ? String(data.levelId) : "",
      payload: data || {},
    },
  });
}

export { PROFILE_EVENT };

import {
  getLocalMegProfile,
  localMegApi,
  setLocalMegDisplayName,
} from "./backrooms-meg-local-store.js";

/** 当前使用单机本地编制；公开函数名保持不变，方便未来切回联机实现。 */
const DISPLAY_NAME_KEY = "backrooms_display_name_v1";
const PROFILE_CACHE_KEY = "backrooms_meg_profile_v1";
const PROFILE_EVENT = "backrooms-meg-profile";

let currentProfile = null;
let syncPromise = null;

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
    currentProfile.authorityActive =
      currentProfile.rank === "clearance" || currentProfile.rank === "supervisor"
        ? currentProfile.highRiskAuthorityEffective !== false
        : currentProfile.status === "active";
    writeLocal(PROFILE_CACHE_KEY, JSON.stringify(currentProfile));
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
  var raw = readLocal(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    currentProfile = JSON.parse(raw);
  } catch (_err) {
    currentProfile = null;
  }
  return currentProfile;
}

export async function syncMegOnlineProfile(force) {
  if (syncPromise && !force) return syncPromise;
  syncPromise = Promise.resolve()
    .then(function () {
      return publish(getLocalMegProfile());
    })
    .finally(function () {
      syncPromise = null;
    });
  return syncPromise;
}

export async function megApi(path, options) {
  var payload = await localMegApi(path, options || {});
  if (payload.profile) publish(payload.profile);
  return payload;
}

export function getMegOnlineProfile() {
  try {
    var profile = getLocalMegProfile();
    currentProfile = profile;
    return profile;
  } catch (_err) {
    return cachedProfile();
  }
}

export function isMegOnline() {
  var profile = cachedProfile();
  return !!(profile && profile.online !== false);
}

export function getBackroomsPlayerId() {
  var profile = cachedProfile();
  return profile ? profile.playerId || profile.identityId || profile.id || "" : "";
}

export async function setBackroomsDisplayName(displayName) {
  var name = String(displayName || "").trim();
  if (name.length < 2 || name.length > 24) throw new Error("显示名须为 2～24 个字符");
  writeLocal(DISPLAY_NAME_KEY, name);
  var payload = setLocalMegDisplayName(name);
  if (payload.profile) publish(payload.profile);
  return payload;
}

export async function recordMegCareerEvent(type, data, eventId) {
  var profile = getMegOnlineProfile();
  if (!profile) {
    try {
      profile = await syncMegOnlineProfile();
    } catch (_err) {
      throw new Error("M.E.G 单机档案无法读取，职业事件未记录");
    }
  }
  var localId =
    eventId ||
    type +
      ":" +
      Date.now().toString(36) +
      ":" +
      Math.random().toString(36).slice(2, 10);
  var id = localId;
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

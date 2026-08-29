/**
 * 流浪者生态单局状态。人物外观和经历都由稳定 id 驱动，
 * 刷新页面不会重新抽脸、补货或清除救援结果。
 */
export const WANDERER_STORE_KEY = "backrooms_wanderers_v1";
export const WANDERER_PLAYER_KEY = "backrooms_wanderer_player_v1";

function readJson(key, fallback) {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_err) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    /* storage may be unavailable */
  }
}

export function loadWandererLevelState(levelId) {
  var all = readJson(WANDERER_STORE_KEY, {});
  var level = all[String(levelId || "")];
  return level && typeof level === "object" ? level : {};
}

export function saveWandererState(levelId, wandererId, state) {
  var all = readJson(WANDERER_STORE_KEY, {});
  var levelKey = String(levelId || "");
  if (!all[levelKey] || typeof all[levelKey] !== "object") all[levelKey] = {};
  all[levelKey][String(wandererId || "")] = Object.assign({}, state || {});
  writeJson(WANDERER_STORE_KEY, all);
}

/**
 * 地图拓扑升级时只清除旧坐标，保留人物经历、库存、敌对与完成状态。
 */
export function prepareWandererLevelLayout(levelId, version) {
  var all = readJson(WANDERER_STORE_KEY, {});
  var levelKey = String(levelId || "");
  var level = all[levelKey];
  if (!level || typeof level !== "object") {
    all[levelKey] = { __layoutVersion: String(version || "") };
    writeJson(WANDERER_STORE_KEY, all);
    return;
  }
  if (level.__layoutVersion === String(version || "")) return;
  Object.keys(level).forEach(function (id) {
    if (id === "__layoutVersion") return;
    var state = level[id];
    if (!state || typeof state !== "object") return;
    delete state.x;
    delete state.z;
    delete state.heading;
    state.following = false;
  });
  level.__layoutVersion = String(version || "");
  writeJson(WANDERER_STORE_KEY, all);
}

export function getOrCreateWandererPlayerAppearance() {
  var saved = readJson(WANDERER_PLAYER_KEY, null);
  if (saved && Number.isFinite(saved.seed)) return saved;
  var created = {
    seed: Math.floor(Math.random() * 2147483646) + 1,
    createdAt: new Date().toISOString(),
  };
  writeJson(WANDERER_PLAYER_KEY, created);
  return created;
}

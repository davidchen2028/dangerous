/**
 * Level 1.1 固定宝箱状态 — 走廊宝箱不可刷新；前哨内部宝箱在首次进入 L4 时刷新一次。
 */

export const LEVEL1_1_CHEST_STATE_KEY = "backrooms_level1_1_chests_v1";
export const LEVEL1_1_OUTPOST_L4_REFRESH_KEY = "backrooms_level1_1_outpost_l4_refreshed";

/** @type {readonly string[]} */
export const LEVEL1_1_OUTPOST_CHEST_IDS = [
  "level1_1_outpost_0",
  "level1_1_outpost_1",
  "level1_1_outpost_2",
];

/** @type {readonly string[]} */
export const LEVEL1_1_2_OUTPOST_CHEST_IDS = ["level1_1_2_outpost_0"];

export const LEVEL1_1_2_OUTPOST_L4_REFRESH_KEY = "backrooms_level1_1_2_outpost_l4_refreshed";

export const LEVEL1_1_3_OUTPOST_CHEST_IDS = ["level1_1_3_outpost_0"];

export const LEVEL1_1_3_OUTPOST_L11_REFRESH_KEY = "backrooms_level1_1_3_outpost_l11_refreshed";

/** @type {readonly string[]} */
export const LEVEL1_1_ALL_CHEST_IDS = [
  "level1_1_corridor_left_5",
  "level1_1_corridor_left_15",
  "level1_1_corridor_right_13",
  ...LEVEL1_1_OUTPOST_CHEST_IDS,
  "level1_1_2_corridor_left_35",
  ...LEVEL1_1_2_OUTPOST_CHEST_IDS,
  ...LEVEL1_1_3_OUTPOST_CHEST_IDS,
];

function readState() {
  try {
    var raw = sessionStorage.getItem(LEVEL1_1_CHEST_STATE_KEY);
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(LEVEL1_1_CHEST_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

export function isLevel1_1ChestOpened(chestId) {
  var state = readState();
  return !!state[chestId];
}

export function markLevel1_1ChestOpened(chestId) {
  var state = readState();
  state[chestId] = true;
  writeState(state);
}

export function resetLevel1_1OutpostChests() {
  var state = readState();
  var i;
  for (i = 0; i < LEVEL1_1_OUTPOST_CHEST_IDS.length; i++) {
    delete state[LEVEL1_1_OUTPOST_CHEST_IDS[i]];
  }
  writeState(state);
}

export function resetLevel1_1_2OutpostChests() {
  var state = readState();
  var i;
  for (i = 0; i < LEVEL1_1_2_OUTPOST_CHEST_IDS.length; i++) {
    delete state[LEVEL1_1_2_OUTPOST_CHEST_IDS[i]];
  }
  writeState(state);
}

/** 玩家首次进入 L4 时调用 — 刷新前哨 1 / 前哨 2 内部宝箱（各一次） */
export function refreshLevel1_1OutpostChestsOnFirstL4Visit() {
  var refreshed = false;
  try {
    if (sessionStorage.getItem(LEVEL1_1_OUTPOST_L4_REFRESH_KEY) !== "1") {
      sessionStorage.setItem(LEVEL1_1_OUTPOST_L4_REFRESH_KEY, "1");
      resetLevel1_1OutpostChests();
      refreshed = true;
    }
  } catch (err) {
    /* ignore */
  }
  try {
    if (sessionStorage.getItem(LEVEL1_1_2_OUTPOST_L4_REFRESH_KEY) !== "1") {
      sessionStorage.setItem(LEVEL1_1_2_OUTPOST_L4_REFRESH_KEY, "1");
      resetLevel1_1_2OutpostChests();
      refreshed = true;
    }
  } catch (err) {
    /* ignore */
  }
  return refreshed;
}

export function resetLevel1_1_3OutpostChests() {
  var state = readState();
  var i;
  for (i = 0; i < LEVEL1_1_3_OUTPOST_CHEST_IDS.length; i++) {
    delete state[LEVEL1_1_3_OUTPOST_CHEST_IDS[i]];
  }
  writeState(state);
}

/** 玩家首次来到 L11 时调用 — 刷新前哨 3 内部宝箱（一次） */
export function refreshLevel1_1_3OutpostChestsOnFirstL11Visit() {
  try {
    if (sessionStorage.getItem(LEVEL1_1_3_OUTPOST_L11_REFRESH_KEY) === "1") return false;
    sessionStorage.setItem(LEVEL1_1_3_OUTPOST_L11_REFRESH_KEY, "1");
  } catch (err) {
    return false;
  }
  resetLevel1_1_3OutpostChests();
  return true;
}

export function syncLevel1_1ChestEntryOpened(entry) {
  if (!entry || !entry.chestId) return;
  entry.opened = isLevel1_1ChestOpened(entry.chestId);
}

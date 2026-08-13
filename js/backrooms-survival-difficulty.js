/**
 * 后室各层级生存难度（显示用）
 * @typedef {string | number} SurvivalDifficulty
 */

/** @type {Record<string | number, SurvivalDifficulty>} */
export const SURVIVAL_DIFFICULTY = {
  0: 1,
  1: 1,
  2: 2,
  3: 4,
  4: 1,
  6: "等待分级",
  7: 4,
  8: 5,
  9: 5,
  10: 1,
  11: 1,
  13: 2,
  14: "天堂",
  21: 4,
  37: 0,
  48: "宜居",
  57: 0,
  75: 5,
  119: 4,
  121: 2,
  283: 3,
};

/**
 * @param {string | number} level
 * @returns {string}
 */
export function formatSurvivalDifficulty(level) {
  var value = SURVIVAL_DIFFICULTY[level];
  if (value == null) return "";
  return "生存难度 " + value;
}

/**
 * @param {string | number} level
 * @param {string} [baseTitle]
 * @returns {string}
 */
export function formatLevelHudTitle(level, baseTitle) {
  var diff = formatSurvivalDifficulty(level);
  var base = baseTitle || ("Backrooms · Level " + level);
  return diff ? base + " · " + diff : base;
}

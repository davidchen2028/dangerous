/**
 * 兜率天丸药与壳。离开本层即失效，效果本身不碰背包。
 */

export const C1166_SHELL_ID = "c1166_shell";
export const C1166_PILL_WHITE = "c1166_pill_white";
export const C1166_PILL_ORANGE = "c1166_pill_orange";
export const C1166_PILL_BLUE = "c1166_pill_blue";
export const C1166_PILL_BLACK = "c1166_pill_black";
export const C1166_PILL_CENTER = "c1166_pill_black_center";

export const C1166_BOUND_IDS = Object.freeze([
  C1166_SHELL_ID,
  C1166_PILL_WHITE,
  C1166_PILL_ORANGE,
  C1166_PILL_BLUE,
  C1166_PILL_BLACK,
  C1166_PILL_CENTER,
]);

var NAMES = {};
NAMES[C1166_SHELL_ID] = "丹灵壳";
NAMES[C1166_PILL_WHITE] = "白色丸药";
NAMES[C1166_PILL_ORANGE] = "橙色丸药";
NAMES[C1166_PILL_BLUE] = "蓝色丸药";
NAMES[C1166_PILL_BLACK] = "黑色丸药";
NAMES[C1166_PILL_CENTER] = "中宫黑丸";

export function c1166ItemName(id) {
  return NAMES[id] || "丸药";
}

export function isC1166BoundId(id) {
  return C1166_BOUND_IDS.indexOf(id) >= 0;
}

export function rollSpiritPill(palace, rng) {
  var roll = rng();
  if (palace === "zhen") {
    if (roll < 0.4) return C1166_PILL_WHITE;
    if (roll < 0.55) return C1166_PILL_ORANGE;
    return C1166_PILL_BLUE;
  }
  if (roll < 0.7) return C1166_PILL_WHITE;
  if (roll < 0.9) return C1166_PILL_ORANGE;
  return C1166_PILL_BLUE;
}

/**
 * @returns {{
 *   pause?: number,
 *   rewind?: number,
 *   heal?: number,
 *   sanity?: number,
 *   fullHeal?: boolean,
 *   damage?: number,
 *   kill?: boolean,
 *   toast: string,
 * }}
 */
export function applyPill(id, rng) {
  if (id === C1166_PILL_WHITE) {
    return {
      pause: 70,
      heal: 15,
      sanity: 25,
      toast: "白色丸药 · 清凉一阵，炼化停了 70 秒",
    };
  }
  if (id === C1166_PILL_BLUE) {
    return { rewind: 70, toast: "蓝色丸药 · 炼化退回一段" };
  }
  if (id === C1166_PILL_ORANGE) {
    return { kill: true, toast: "你变成了丹魔" };
  }
  if (id === C1166_PILL_BLACK) {
    if (rng() < 0.5) return { fullHeal: true, toast: "黑丸药发苦，但伤口闭上了" };
    return { damage: 40, toast: "黑丸药在胃里发烫" };
  }
  if (id === C1166_PILL_CENTER) {
    if (rng() < 0.8) return { fullHeal: true, toast: "金丹入腹" };
    return { kill: true, toast: "黑丸药把你收成别的东西" };
  }
  return null;
}

export function stripBoundItems(removeFirst) {
  var removed = 0;
  var i;
  for (i = 0; i < C1166_BOUND_IDS.length; i++) {
    while (removeFirst(C1166_BOUND_IDS[i])) removed += 1;
  }
  return removed;
}

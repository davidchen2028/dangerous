/** Level C-1623 — 二十里面有过量的三十。可走 PRS−40～+40。 */

export const C1623_MIN = -40;
export const C1623_MAX = 40;
export const C1623_ROAD_HALF = 26;
export const C1623_VOID_Z = 24.2;
export const C1623_ROAD_HALF_W = 4.15;
export const C1623_SPAWN = Object.freeze({ x: 0, z: 2.4 });
export const C1623_CEILING = 8.4;
/** 抬头超过此俯仰才算“向上突破”去蓝色通道，避免对着虚空墙误传。 */
export const C1623_LOOK_UP = 0.88;

export function isC1623LookUp(pitch) {
  return Number(pitch) >= C1623_LOOK_UP;
}

function shut(label, note) {
  return Object.freeze({ label: label, note: note || "", open: false });
}

function open(label, pass, page) {
  return Object.freeze({ label: label, pass: pass, page: page, note: "", open: true });
}

/** wiki PRS−40～+40；open 仅指向游戏里已做关卡。远区段不收录。 */
const EXITS = Object.freeze({
  "-40": { doors: [shut("Level C-1207")] },
  "-39": { doors: [shut("Level C-10")] },
  "-38": { doors: [shut("Level C-291", "C-█")] },
  "-37": { doors: [shut("Level 203", "存疑")] },
  "-36": { doors: [] },
  "-35": { doors: [shut("Level C-54")] },
  "-34": { doors: [shut("Level 63.3")] },
  "-33": { doors: [shut("Level 458")] },
  "-32": { doors: [] },
  "-31": { doors: [shut("Level C-788")] },
  "-30": { doors: [] },
  "-29": { doors: [] },
  "-28": { doors: [shut("Level 272", "存疑")] },
  "-27": { doors: [], flavor: "fire", note: "此区段到处都在燃烧" },
  "-26": { doors: [open("Level 75", "l75", "backrooms-level75.html")] },
  "-25": { doors: [shut("速切终点", "诺贴才能从路面切出")], flavor: "noclip" },
  "-24": { doors: [] },
  "-23": { doors: [shut("拥挤至死", "存疑")] },
  "-22": { doors: [open("Level 46", "l46", "backrooms-level46.html")] },
  "-21": { doors: [shut("Level C-824")] },
  "-20": { doors: [open("Level 13", "l13", "backrooms-level13.html")] },
  "-19": { doors: [shut("Level C-780")] },
  "-18": { doors: [shut("Level C-999", "存疑")] },
  "-17": { doors: [open("Level 6", "l6", "backrooms-level6.html")] },
  "-16": { doors: [] },
  "-15": { doors: [] },
  "-14": { doors: [] },
  "-13": { doors: [shut("Level 125")] },
  "-12": { doors: [shut("Level 70")] },
  "-11": { doors: [open("Level 2", "l2", "backrooms-level2.html")] },
  "-10": { doors: [shut("Level C-1531")] },
  "-9": { doors: [shut("黯洃銫", "壹一层")] },
  "-8": { doors: [] },
  "-7": { doors: [shut("Level 726")] },
  "-6": { doors: [open("Level 9", "l9", "backrooms-level9.html")] },
  "-5": { doors: [] },
  "-4": { doors: [shut("Level C-34")] },
  "-3": { doors: [shut("Level 409")] },
  "-2": { doors: [shut("Level C-597")] },
  "-1": { doors: [shut("Level 483", "存疑")] },
  0: { doors: [shut("Level C-211", "不稳定")], flavor: "prismriver" },
  1: { doors: [shut("Level C-912")] },
  2: { doors: [] },
  3: { doors: [shut("Level 922", "存疑")] },
  4: { doors: [shut("Level 950", "存疑")] },
  5: { doors: [open("Level 0", "l0", "backrooms-level0.html")] },
  6: { doors: [shut("Level C-803")] },
  7: { doors: [shut("Level C-668")] },
  8: { doors: [open("Level 21", "l21", "backrooms-level21.html")] },
  9: { doors: [] },
  10: { doors: [shut("Level 4.4")] },
  11: { doors: [shut("Level 172")] },
  12: { doors: [shut("Level C-421")] },
  13: {
    doors: [
      open("Level 11", "l11", "backrooms-level11.html"),
      shut("Level C-199"),
    ],
  },
  14: { doors: [] },
  15: { doors: [open("枢纽", "hub", "backrooms-hub.html")] },
  16: { doors: [open("Level 10", "l10", "backrooms-level10.html")] },
  17: { doors: [shut("Level C-30")] },
  18: { doors: [] },
  19: { doors: [] },
  20: { doors: [open("Level 8", "l8", "backrooms-level8.html")] },
  21: { doors: [shut("Level C-737")] },
  22: { doors: [shut("Level C-98")] },
  23: { doors: [shut("Level 235")] },
  24: { doors: [shut("Level 448")] },
  25: { doors: [] },
  26: { doors: [shut("Level C-18")] },
  27: { doors: [shut("Level C-636")] },
  28: { doors: [] },
  29: { doors: [shut("Level 65")] },
  30: { doors: [shut("Level C-22")] },
  31: { doors: [shut("Level C-918")] },
  32: { doors: [shut("Level 404", "存疑")] },
  33: { doors: [shut("Level 414")], flavor: "plants", note: "此区段全是植物" },
  34: { doors: [shut("Level 87", "存疑")] },
  35: { doors: [] },
  36: { doors: [] },
  37: { doors: [] },
  38: { doors: [shut("Level 185")] },
  39: { doors: [shut("Level PT-1", "交给 I.P.D.L.B. 代管")], flavor: "sealed" },
  40: { doors: [] },
});

export function clampC1623Segment(n) {
  var i = Math.round(Number(n) || 0);
  if (i < C1623_MIN) return C1623_MIN;
  if (i > C1623_MAX) return C1623_MAX;
  return i;
}

export function formatPrs(n) {
  var i = clampC1623Segment(n);
  if (i === 0) return "PRS±0";
  return i > 0 ? "PRS+" + i : "PRS" + i;
}

export function getC1623Segment(n) {
  var index = clampC1623Segment(n);
  var spec = EXITS[index] || EXITS[String(index)] || { doors: [] };
  return {
    index: index,
    id: formatPrs(index),
    doors: spec.doors ? spec.doors.slice() : [],
    flavor: spec.flavor || "road",
    note: spec.note || "",
  };
}

export function stepC1623Segment(n, dir) {
  var cur = clampC1623Segment(n);
  var next = cur + (dir < 0 ? -1 : 1);
  if (next < C1623_MIN || next > C1623_MAX) {
    return { index: cur, blocked: true };
  }
  return { index: next, blocked: false };
}

export function listC1623OpenPasses() {
  var out = [];
  var i;
  for (i = C1623_MIN; i <= C1623_MAX; i++) {
    var seg = getC1623Segment(i);
    var d;
    for (d = 0; d < seg.doors.length; d++) {
      if (seg.doors[d].open) out.push({ index: i, pass: seg.doors[d].pass, page: seg.doors[d].page });
    }
  }
  return out;
}

export function isC1623Void(z) {
  return Math.abs(Number(z) || 0) >= C1623_VOID_Z;
}

export function voidDirection(z) {
  if (z >= C1623_VOID_Z) return 1;
  if (z <= -C1623_VOID_Z) return -1;
  return 0;
}

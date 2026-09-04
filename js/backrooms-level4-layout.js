export const L4_LAYOUT_SEED_KEY = "backrooms_l4_layout_seed_v1";
export const L4_OUTPOST_CX = 1;
export const L4_OUTPOST_CZ = 0;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getLevel4LayoutSeed(storage) {
  storage = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!storage) return 4404;
  try {
    var raw = storage.getItem(L4_LAYOUT_SEED_KEY);
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw) | 0;
    var seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    storage.setItem(L4_LAYOUT_SEED_KEY, String(seed));
    return seed;
  } catch (err) {
    return 4404;
  }
}

export function deriveLevel4ChunkLayout(cx, cz, seed) {
  var hash = ((seed | 0) ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) | 0;
  var rng = mulberry32(hash);
  var isOutpost = cx === L4_OUTPOST_CX && cz === L4_OUTPOST_CZ;
  var desks = [];
  for (var i = 0; i < 9; i++) desks.push(!isOutpost && rng() < 0.28);
  var westWindows = Math.abs(cx) % 2 === 0;
  var northWindows = Math.abs(cz) % 2 === 0;
  return {
    cx: cx,
    cz: cz,
    isOutpost: isOutpost,
    desks: desks,
    cooler: !isOutpost && rng() < 0.62,
    whiteboard: !isOutpost && rng() < 0.25,
    westWindows: westWindows,
    northWindows: northWindows,
    westWindowTrap: westWindows && rng() < 0.035,
    northWindowTrap: northWindows && rng() < 0.035,
  };
}

export function deriveLevel4EntitySpecs(cx, cz, seed, chunkSize) {
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return [];
  if (Math.abs(cx - L4_OUTPOST_CX) <= 1 && Math.abs(cz - L4_OUTPOST_CZ) <= 1) return [];
  var hash = ((seed | 0) + Math.imul(cx, 83492791) + Math.imul(cz, 297657976)) | 0;
  var rng = mulberry32(hash);
  if (rng() >= 0.055) return [];
  var size = chunkSize || 24;
  return [{
    id: "l4_entity_" + cx + "_" + cz,
    kind: rng() < 0.58 ? "hound" : "duller",
    x: cx * size + (rng() - 0.5) * size * 0.55,
    z: cz * size + (rng() - 0.5) * size * 0.55,
    rotation: rng() * Math.PI * 2,
    seed: hash,
  }];
}

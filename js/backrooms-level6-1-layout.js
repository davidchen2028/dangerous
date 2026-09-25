/**
 * Level 6.1 零食室 — 可走完的一小圈商场餐厅 AABB。
 * 24×16，不是无限商场。
 */

export const L61_ROOM_W = 24;
export const L61_ROOM_D = 16;
export const L61_HALF_W = 12;
export const L61_HALF_D = 8;
export const L61_WALL_H = 3.4;
export const L61_SPAWN = Object.freeze({ x: 0, z: 3.45 });
export const L61_RESTOCK_MS = 8 * 60 * 1000;
export const L61_STOCK_KEY = "backrooms_l61_stock_v1";
export const L61_STAFF_GIFT_ID = "staff_water";

export const L61_GLASS = Object.freeze({
  x: 0,
  z: L61_HALF_D,
  halfW: 1.05,
  exitZ: L61_HALF_D + 0.12,
  /** 门扇本地右缘约 +2.075，必须滑过开口左缘 −1.05 */
  slide: 2.2,
});

export const L61_VENT = Object.freeze({ x: -11.82, y: 2.35, z: 6.35 });
export const L61_VENT_PICK = Object.freeze({
  x: -11.42,
  y: 1.7,
  z: 6.35,
  w: 0.85,
  h: 1.6,
  d: 0.95,
});
export const L61_EYE_HEIGHT = 1.65;
export const L61_PAINTING = Object.freeze({ x: 11.82, z: 0.55 });
/** 东墙内侧，local +Z 朝 −X（大厅）。 */
export const L61_PAINTING_YAW = -Math.PI / 2;
export const L61_BLUE_WALL = Object.freeze({ x: -10.15, z: -6.85 });
export const L61_IRON_DOOR = Object.freeze({ x: 11.82, z: -5.55 });
export const L61_STAFF = Object.freeze({ x: -2.85, z: -6.45 });
export const L61_MEG = Object.freeze({ x: 8.55, z: -5.15 });

export const L61_CLIPPERS = Object.freeze({
  minX: -11.75,
  maxX: -7.05,
  minZ: -2.35,
  maxZ: 4.75,
  doorMinZ: -0.35,
  doorMaxZ: 2.55,
  wallX: -7.05,
});

export const L61_MEG_ROOM = Object.freeze({
  minX: 7.35,
  maxX: 11.85,
  minZ: -7.85,
  maxZ: -3.35,
  doorMinZ: -5.95,
  doorMaxZ: -4.45,
  wallX: 7.35,
});

export const L61_GIB = Object.freeze({
  minX: -5.45,
  maxX: -0.25,
  counterZ: -5.45,
});

export const L61_CLOSED = Object.freeze({
  minX: 0.95,
  maxX: 6.15,
  shutterZ: -5.45,
});

export const L61_JAM_ALCOVE = Object.freeze({
  minX: 8.15,
  maxX: 11.85,
  minZ: 3.05,
  maxZ: 7.65,
});

/** 堵死 alcove 西侧整面，避免从缝里挤进去。 */
export const L61_JAM_GATE = Object.freeze({
  minX: 8.0,
  maxX: 8.6,
  minZ: 3.05,
  maxZ: 7.65,
});

export const L61_TABLES = Object.freeze([
  { x: -2.15, z: 1.55 },
  { x: 2.15, z: 1.55 },
  { x: 0, z: -1.15 },
]);

/** 免费售货机 / 冰箱 / 开着的货架。每周（8 分钟）补一次。 */
export const L61_VENDORS = Object.freeze([
  { id: "v0", kind: "vending", x: -4.05, z: 0.15, item: "almond_water", name: "杏仁水" },
  { id: "v1", kind: "vending", x: -4.05, z: 1.95, item: "strawberry_soy_milk", name: "草莓豆奶" },
  { id: "v2", kind: "vending", x: -4.05, z: 3.75, item: "royal_rations", name: "皇家口粮" },
  { id: "v3", kind: "vending", x: 4.05, z: 0.15, item: "banana_soy_milk", name: "香蕉豆奶" },
  { id: "v4", kind: "vending", x: 4.05, z: 1.95, item: "almond_water", name: "杏仁水" },
  { id: "v5", kind: "vending", x: 4.05, z: 3.75, item: "lucky_soy_milk", name: "幸运豆奶" },
  { id: "f0", kind: "fridge", x: 5.55, z: -3.75, item: "almond_water", name: "杏仁水" },
  { id: "s0", kind: "shelf", x: -5.35, z: -3.25, item: "royal_rations", name: "皇家口粮" },
]);

export const L61_FREE_LOOT = Object.freeze(
  L61_VENDORS.map(function (v) {
    return { id: v.item, name: v.name };
  })
);

export function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

export function isInsideGlassExit(x, z) {
  return Number(z) > L61_GLASS.exitZ && Math.abs(Number(x)) < L61_GLASS.halfW;
}

export function circleHitsAabb(x, z, radius, box) {
  if (!box) return false;
  var r = Number(radius) > 0 ? Number(radius) : 0;
  var nx = Math.max(box.minX, Math.min(Number(x), box.maxX));
  var nz = Math.max(box.minZ, Math.min(Number(z), box.maxZ));
  var dx = Number(x) - nx;
  var dz = Number(z) - nz;
  return dx * dx + dz * dz < r * r;
}

export function isInsideClippers(x, z) {
  return (
    Number(x) > L61_CLIPPERS.minX &&
    Number(x) < L61_CLIPPERS.maxX &&
    Number(z) > L61_CLIPPERS.minZ &&
    Number(z) < L61_CLIPPERS.maxZ
  );
}

export function readL61StockMap(raw, now, restockMs) {
  var t = Number(now) || 0;
  var windowMs = Number(restockMs) > 0 ? Number(restockMs) : L61_RESTOCK_MS;
  var src = raw && typeof raw === "object" ? raw : {};
  var out = {};
  var key;
  for (key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    var takenAt = Number(src[key]);
    if (Number.isFinite(takenAt) && t - takenAt < windowMs) out[key] = takenAt;
  }
  return out;
}

export function glassDoorClearsOpening(slide) {
  var s = Number(slide);
  if (!Number.isFinite(s)) s = L61_GLASS.slide;
  var doorLocalMaxX = L61_GLASS.halfW + 2.05 * 0.5;
  var worldMaxX = -L61_GLASS.halfW - s + doorLocalMaxX;
  return worldMaxX < -L61_GLASS.halfW;
}

export function ventPickCoversEye(eyeY) {
  var y = Number(eyeY);
  if (!Number.isFinite(y)) y = L61_EYE_HEIGHT;
  var half = L61_VENT_PICK.h * 0.5;
  return y >= L61_VENT_PICK.y - half && y <= L61_VENT_PICK.y + half;
}

export function isL61StockEmpty(stock, id, now, restockMs) {
  if (!id || !stock) return false;
  var takenAt = Number(stock[id]);
  if (!Number.isFinite(takenAt)) return false;
  var t = Number(now) || 0;
  var windowMs = Number(restockMs) > 0 ? Number(restockMs) : L61_RESTOCK_MS;
  return t - takenAt < windowMs;
}

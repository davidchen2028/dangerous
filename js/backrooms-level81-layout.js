/** Level 81 赋闲结局：安静室内与中央毛毯。 */
export const L81_WALL_H = 3.05;
export const L81_SPAWN = Object.freeze({ x: 0, z: 4.15 });
export const L81_SIT = Object.freeze({ x: 0, z: 0 });
export const L81_SIT_RADIUS = 1.22;
export const L81_REST_SEC = 22;
/** 雨窗右下角的虚数；站位在它前方，不在毛毯坐下区。 */
export const L81_IMAGINARY = Object.freeze({ x: 0.95, y: 1.48, z: -6.12 });
export const L81_IMAGINARY_STAND = Object.freeze({ x: 0.95, z: -5.2 });
export const L81_WINDOW_PICK = Object.freeze({
  w: 2.15,
  h: 1.85,
  d: 0.32,
  x: -0.28,
  y: 1.72,
  z: -6.32,
});
export const L81_IMAGINARY_PICK = Object.freeze({
  w: 0.5,
  h: 1.05,
  d: 0.28,
  x: 0.95,
  y: 1.48,
  z: -5.8,
});

export function aabbXZ(cx, cz, w, d) {
  var hw = Number(w) * 0.5;
  var hd = Number(d) * 0.5;
  return {
    minX: Number(cx) - hw,
    maxX: Number(cx) + hw,
    minZ: Number(cz) - hd,
    maxZ: Number(cz) + hd,
  };
}

export function aabbXZOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function isLevel81SitZone(x, z) {
  var dx = Number(x) - L81_SIT.x;
  var dz = Number(z) - L81_SIT.z;
  return dx * dx + dz * dz <= L81_SIT_RADIUS * L81_SIT_RADIUS;
}

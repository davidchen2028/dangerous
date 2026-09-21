/** Level √2 — 非欧几里得青纤维网。 */
export const SQRT2_SPAWN = Object.freeze({ x: 0, z: 3.15 });
export const SQRT2_CEILING = 7.2;
export const SQRT2_RADIUS = 14.5;
export const SQRT2_NODE_COUNT = 14;
export const SQRT2_SHIFT_SEC = 9.2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function sqrt2NodeHome(index, radiusScale) {
  var i = Number(index) || 0;
  var scale = Number.isFinite(radiusScale) ? radiusScale : 1;
  if (i <= 0) return { x: 0, y: 1.05, z: 0 };
  var r = (2.1 + (i / SQRT2_NODE_COUNT) * 9.4) * scale;
  var a = i * GOLDEN_ANGLE;
  return {
    x: Math.cos(a) * r,
    y: 0.82 + Math.sin(i * 1.618) * 0.42,
    z: Math.sin(a) * r,
  };
}

export function isInsideSqrt2Ring(x, z) {
  return x * x + z * z <= SQRT2_RADIUS * SQRT2_RADIUS;
}

export function dist2(ax, az, bx, bz) {
  var dx = ax - bx;
  var dz = az - bz;
  return dx * dx + dz * dz;
}

export function sqrt2DoorPosFromNode(node) {
  var x = node && node.x != null ? Number(node.x) : 0;
  var z = node && node.z != null ? Number(node.z) : 0;
  var len = Math.hypot(x, z) || 1;
  return {
    x: x - (x / len) * 0.75,
    z: z - (z / len) * 0.75,
  };
}

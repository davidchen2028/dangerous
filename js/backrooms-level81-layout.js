/** Level 81 赋闲结局：安静室内与中央毛毯。 */
export const L81_WALL_H = 3.05;
export const L81_SPAWN = Object.freeze({ x: 0, z: 4.15 });
export const L81_SIT = Object.freeze({ x: 0, z: 0 });
export const L81_SIT_RADIUS = 1.22;
export const L81_REST_SEC = 22;

export function isLevel81SitZone(x, z) {
  var dx = Number(x) - L81_SIT.x;
  var dz = Number(z) - L81_SIT.z;
  return dx * dx + dz * dz <= L81_SIT_RADIUS * L81_SIT_RADIUS;
}

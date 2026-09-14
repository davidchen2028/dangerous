/** Level 7 栈道尺寸与落水判定。 */
export const PLATFORM_SIZE = 7;
export const PLATFORM_HALF = PLATFORM_SIZE * 0.5;
export const PLATFORM_TOP_Y = 0.42;
export const WATER_SURFACE_Y = 0.08;
export const L7_SPAWN = Object.freeze({ x: 0, z: 1.55 });

export function isOnLevel7Platform(x, z, radius) {
  var margin = (Number(radius) || 0.34) * 0.35;
  return (
    Math.abs(x) <= PLATFORM_HALF - margin &&
    Math.abs(z) <= PLATFORM_HALF - margin
  );
}

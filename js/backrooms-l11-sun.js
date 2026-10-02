/**
 * Level 11 的太阳：方向、可视位置，以及直视太阳的对准判定。
 * 与 three.js 解耦，纯数学便于单测。
 */

/** 与 L11 平行光一致的方向（-20, 32, -16）归一化后的结果 */
function normalized(x, y, z) {
  var len = Math.hypot(x, y, z) || 1;
  return Object.freeze({ x: x / len, y: y / len, z: z / len });
}

export const L11_SUN_DIR = normalized(-20, 32, -16);
/** 相机远裁剪面 80，太阳盘放在 64 处仍在可视范围内 */
export const L11_SUN_DISTANCE = 64;
export const L11_SUN_RADIUS = 5.2;
/** cos(9°)：准星落在日面内才开始计时 */
export const L11_SUN_ALIGN = 0.9877;
export const L11_STARE_SEC = 5;
/** 移开视线后的衰减速度，允许眨眼级别的抖动 */
const STARE_DECAY = 1.5;

export function l11SunWorldPos(px, pz, eyeY) {
  var y = eyeY != null ? eyeY : 1.65;
  return {
    x: px + L11_SUN_DIR.x * L11_SUN_DISTANCE,
    y: y + L11_SUN_DIR.y * L11_SUN_DISTANCE,
    z: pz + L11_SUN_DIR.z * L11_SUN_DISTANCE,
  };
}

/** 相机 YXZ 欧拉角（rotation.y = yaw, rotation.x = pitch）对应的前向量 */
export function lookDirFromYawPitch(yaw, pitch) {
  var cp = Math.cos(pitch);
  return {
    x: -cp * Math.sin(yaw),
    y: Math.sin(pitch),
    z: -cp * Math.cos(yaw),
  };
}

/** 视线与太阳方向的夹角余弦：1 为正对日心 */
export function sunStareAlign(yaw, pitch) {
  var dir = lookDirFromYawPitch(yaw, pitch);
  return dir.x * L11_SUN_DIR.x + dir.y * L11_SUN_DIR.y + dir.z * L11_SUN_DIR.z;
}

export function createSunStareState() {
  return { seconds: 0, triggered: false };
}

/**
 * @param {{ seconds: number, triggered: boolean }} state
 * @param {number} dt
 * @param {number} yaw
 * @param {number} pitch
 * @returns {{ staring: boolean, seconds: number, remaining: number, triggered: boolean }}
 */
export function updateSunStare(state, dt, yaw, pitch) {
  var step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (state.triggered) {
    return { staring: true, seconds: L11_STARE_SEC, remaining: 0, triggered: false };
  }
  var staring = sunStareAlign(yaw, pitch) >= L11_SUN_ALIGN;
  state.seconds = staring
    ? state.seconds + step
    : Math.max(0, state.seconds - step * STARE_DECAY);
  var triggered = false;
  if (state.seconds >= L11_STARE_SEC) {
    state.seconds = L11_STARE_SEC;
    state.triggered = true;
    triggered = true;
  }
  return {
    staring: staring,
    seconds: state.seconds,
    remaining: Math.max(0, L11_STARE_SEC - state.seconds),
    triggered: triggered,
  };
}

/**
 * Level C-1166 炼化阶段。98 小时压成 490 秒，每段 70 秒。
 */

export const C1166_STAGE_SEC = 70;
export const C1166_STAGE_COUNT = 7;
export const C1166_DEATH_SEC = C1166_STAGE_SEC * C1166_STAGE_COUNT;

var SPEED = [0.92, 0.82, 0.72, 0.55, 0.42, 0.28, 0];
var JUMP = [1, 1, 0.65, 0.4, 0, 0, 0];
var LABELS = ["发粘", "鞋底磨穿", "衣物粘肤", "脱力", "体表融化", "骨骼软化", "不能动", "化为丹灵"];

export function refineStage(elapsedSec, stageSec) {
  var sec = stageSec > 0 ? stageSec : C1166_STAGE_SEC;
  if (!(elapsedSec > 0)) return 0;
  if (elapsedSec >= sec * C1166_STAGE_COUNT) return 7;
  return Math.min(6, Math.floor(elapsedSec / sec));
}

export function refineSpeedMul(stage) {
  if (stage >= 7) return 0;
  return SPEED[stage] != null ? SPEED[stage] : 0;
}

export function refineAllowsSprint(stage) {
  return stage < 3;
}

export function refineJumpMul(stage) {
  if (stage >= 7) return 0;
  return JUMP[stage] != null ? JUMP[stage] : 0;
}

export function refineStickSec(stage) {
  var s = stage >= 7 ? 6 : stage;
  if (s < 0) s = 0;
  return Math.min(0.4, 0.12 * (s + 1));
}

export function refineLabel(stage) {
  var i = stage < 0 ? 0 : stage > 7 ? 7 : stage;
  return LABELS[i];
}

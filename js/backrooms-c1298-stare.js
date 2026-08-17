/**
 * 田园类层级：长时间原地发呆凝视，极低概率切入 C-1298「人景」。
 * 由 L14 / C-192 等自然层在主循环中调用。
 */
import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";

/** 开始计概率的发呆秒数 */
const IDLE_ARM_SEC = 22;
/** 武装后每秒切入概率（约 1/120） */
const CLIP_CHANCE_PER_SEC = 0.008;

let idleSec = 0;
let triggered = false;

/**
 * @param {number} dt
 * @param {{
 *   moving: boolean,
 *   dead?: boolean,
 *   survival?: { dead?: boolean } | null,
 *   yaw?: number,
 * }} opts
 * @returns {boolean} 是否已触发跳转
 */
export function updatePastoralStareClip(dt, opts) {
  if (triggered) return true;
  if (!opts || opts.dead || (opts.survival && opts.survival.dead)) {
    idleSec = 0;
    return false;
  }
  if (opts.moving) {
    idleSec = 0;
    return false;
  }
  idleSec += dt;
  if (idleSec < IDLE_ARM_SEC) return false;
  if (Math.random() >= CLIP_CHANCE_PER_SEC * dt) return false;

  triggered = true;
  showBackroomsLootToast(
    "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！",
    { durationMs: 3200 }
  );
  if (opts.survival) saveBackroomsSurvival(opts.survival);
  grantLevelPass("c1298", opts.yaw == null ? 0 : opts.yaw);
  queueEnterLevelBanner("Level C-1298");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c1298.html";
  }, 700);
  return true;
}

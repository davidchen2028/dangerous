/**
 * 湿热蒸汽环境：产生强烈进食欲望时，极低概率切入 C-1299「浓汤煮沸」。
 * 由 Level 2 等蒸汽层在主循环中调用。
 */
import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";

const CRAVE_ARM_SEC = 28;
const CLIP_CHANCE_PER_SEC = 0.007;

let steamSec = 0;
let craveToasted = false;
let triggered = false;

/**
 * @param {number} dt
 * @param {{
 *   survival?: { dead?: boolean } | null,
 *   yaw?: number,
 * }} opts
 */
export function updateSteamHungerClip(dt, opts) {
  if (triggered) return true;
  if (!opts || (opts.survival && opts.survival.dead)) {
    steamSec = 0;
    craveToasted = false;
    return false;
  }
  steamSec += dt;
  if (steamSec >= 18 && !craveToasted) {
    craveToasted = true;
    showBackroomsLootToast("湿热蒸汽让你忽然产生强烈的进食欲望……", {
      durationMs: 3200,
    });
  }
  if (steamSec < CRAVE_ARM_SEC) return false;
  if (Math.random() >= CLIP_CHANCE_PER_SEC * dt) return false;

  triggered = true;
  showBackroomsLootToast(
    "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！",
    { durationMs: 3200 }
  );
  if (opts.survival) saveBackroomsSurvival(opts.survival);
  grantLevelPass("c1299", opts.yaw == null ? 0 : opts.yaw);
  queueEnterLevelBanner("Level C-1299");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c1299.html";
  }, 700);
  return true;
}

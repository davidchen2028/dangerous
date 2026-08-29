import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";

/**
 * C 层群电脑相关地点的统一稀有切出入口。
 * 目前暂无可接入的电脑交互；后续层级调用此函数即可复用 Wiki 的 <3‰ 规则。
 */
export function tryComputerNoclipToC101(opts) {
  opts = opts || {};
  var chance = Number.isFinite(opts.chance) ? opts.chance : 0.0025;
  chance = Math.max(0, Math.min(0.002999, chance));
  if (Math.random() >= chance) return false;
  if (typeof opts.saveSurvival === "function") opts.saveSurvival();
  grantLevelPass("c101", opts.yaw);
  queueEnterLevelBanner("Level C-101 · 服务器机房");
  if (typeof opts.showToast === "function") {
    opts.showToast("屏幕中的像素向外翻折——服务器风扇声覆盖了周围的一切。");
  }
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c101.html";
  }, Number.isFinite(opts.delayMs) ? Math.max(0, opts.delayMs) : 450);
  return true;
}

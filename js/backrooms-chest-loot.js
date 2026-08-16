/**
 * 后室海盗宝箱 — 仅产出杏仁水（与主游戏 pirate-loot-roll 完全分离）
 */
import { getLuck } from "./backrooms-luck.js";

/** 开箱杏仁水数量：1 瓶 65% · 2 瓶 35% */
export function rollAlmondWaterFromChest() {
  var luck = getLuck();
  var twoChance = luck >= 30 ? 0.55 : luck <= -30 ? 0.25 : 0.35;
  return Math.random() < twoChance ? 2 : 1;
}

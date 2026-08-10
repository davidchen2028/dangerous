/**
 * 后室海盗宝箱 — 仅产出杏仁水（与主游戏 pirate-loot-roll 完全分离）
 */

/** 开箱杏仁水数量：1 瓶 65% · 2 瓶 35% */
export function rollAlmondWaterFromChest() {
  return Math.random() < 0.35 ? 2 : 1;
}

/**
 * 后室商店价目表 — 玩家购买价 / 商店收购价
 * sell 为 null 表示不可收购。
 */

/** @typedef {{ id: string, name: string, buy: number, sell: number | null }} ShopPrice */

/** @type {Record<string, ShopPrice>} */
export const SHOP_PRICES = {
  almond_water: { id: "almond_water", name: "杏仁水", buy: 7, sell: 5 },
  royal_rations: {
    id: "royal_rations",
    name: "最小有效分量皇家口粮",
    buy: 22,
    sell: 18,
  },
  royal_rations_medium: {
    id: "royal_rations_medium",
    name: "中等大小皇家口粮",
    buy: 42,
    sell: 34,
  },
  fire_salt: { id: "fire_salt", name: "小块可爆炸火盐", buy: 8, sell: 6 },
  roulette: { id: "roulette", name: "后室轮盘赌", buy: 52, sell: null },
  escort_l0: { id: "escort_l0", name: "Lv11→Level 0 护送服务", buy: 15, sell: null },
  escort_l4: { id: "escort_l4", name: "Lv11→Level 4 护送服务", buy: 32, sell: null },
  escort_l61: { id: "escort_l61", name: "Lv11→Level 6.1 护送服务", buy: 75, sell: null },
  archive_c11: { id: "archive_c11", name: "一次性查看工具", buy: 15, sell: null },
};

/** @param {string} itemId */
export function getBuyPrice(itemId) {
  var entry = SHOP_PRICES[itemId];
  return entry ? entry.buy : null;
}

/** @param {string} itemId @returns {number | null} null = 不可收购 */
export function getSellPrice(itemId) {
  var entry = SHOP_PRICES[itemId];
  if (!entry) return null;
  return entry.sell;
}

/** @param {string} itemId */
export function getShopItemName(itemId) {
  var entry = SHOP_PRICES[itemId];
  return entry ? entry.name : itemId;
}

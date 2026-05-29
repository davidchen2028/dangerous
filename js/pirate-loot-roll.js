/**
 * 海盗宝箱 — 藏品类 3001–3005 + 1004（Unity ItemDatabase 对齐）
 * 先 roll 件数：1 件 20% · 2 件 40% · 3 件 30% · 4 件 10%
 * 再按单件权重 roll 具体藏品（无空手）
 */
(function () {
  "use strict";

  var CHEST_WEIGHT_TOTAL = 1000;
  var CHEST_WEIGHT_1004 = 20;
  var CHEST_WEIGHT_3001 = 35;
  var CHEST_WEIGHT_3002 = 40;
  var CHEST_WEIGHT_EPIC = 142;
  var CHEST_WEIGHT_RARE = 398;

  var LOOT_COUNT_TABLE = [
    { count: 1, w: 200 },
    { count: 2, w: 400 },
    { count: 3, w: 300 },
    { count: 4, w: 100 },
  ];

  var PIRATE_ID_TO_CATALOG = {
    "1004": "pirate_1004",
    "3001": "collectible_3001",
    "3002": "collectible_3002",
    "3003": "collectible_3003",
    "3004": "collectible_3004",
    "3005": "collectible_3005",
  };

  var CHEST_ITEM_POOL = [
    { id: 1004, w: CHEST_WEIGHT_1004 },
    { id: 3001, w: CHEST_WEIGHT_3001 },
    { id: 3002, w: CHEST_WEIGHT_3002 },
    { id: 3003, w: CHEST_WEIGHT_EPIC },
    { id: 3004, w: CHEST_WEIGHT_EPIC },
    { id: 3005, w: CHEST_WEIGHT_RARE },
  ];

  function rollWeighted(pool) {
    var total = 0;
    var i;
    for (i = 0; i < pool.length; i++) {
      total += Math.max(0, pool[i].w);
    }
    if (total <= 0) return 0;

    var roll = Math.floor(Math.random() * total);
    var cumulative = 0;
    for (i = 0; i < pool.length; i++) {
      cumulative += Math.max(0, pool[i].w);
      if (roll < cumulative) return pool[i].id;
    }
    return pool[pool.length - 1].id;
  }

  function rollLootItemCount() {
    return rollWeighted(LOOT_COUNT_TABLE);
  }

  function pirateIdToCatalog(pirateId) {
    if (!pirateId || pirateId === 0) return null;
    var key = String(pirateId);
    var catId = PIRATE_ID_TO_CATALOG[key];
    if (!catId || !window.ItemCatalog) return null;
    return window.ItemCatalog.getItem(catId);
  }

  /** @returns {string[]} catalog id 列表，1–4 件 */
  function rollPirateChest() {
    var count = rollLootItemCount();
    var ids = [];
    var tries = 0;
    var maxTries = Math.max(count * 12, 12);

    while (ids.length < count && tries < maxTries) {
      tries += 1;
      var rolled = rollWeighted(CHEST_ITEM_POOL);
      var cat = pirateIdToCatalog(rolled);
      if (cat) ids.push(cat.id);
    }

    if (ids.length === 0) {
      var fallback = pirateIdToCatalog(rollWeighted(CHEST_ITEM_POOL));
      if (fallback) ids.push(fallback.id);
    }

    return ids;
  }

  window.PirateLootRoll = {
    rollPirateChest: rollPirateChest,
    rollLootItemCount: rollLootItemCount,
    pirateIdToCatalog: pirateIdToCatalog,
    CHEST_ITEM_POOL: CHEST_ITEM_POOL,
    LOOT_COUNT_TABLE: LOOT_COUNT_TABLE,
    CHEST_WEIGHT_TOTAL: CHEST_WEIGHT_TOTAL,
  };
})();

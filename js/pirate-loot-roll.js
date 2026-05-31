/**
 * 海盗宝箱 — 藏品类 3001–3007 + 1004（Unity ItemDatabase 对齐）
 * 先 roll 件数：1 件 20% · 2 件 40% · 3 件 30% · 4 件 10%
 * 单槽分母 10000：1004 2% · 3001 3.5% · 3002 4% · 3006 0.5% · 3007 0.05%
 */
(function () {
  "use strict";

  var CHEST_WEIGHT_TOTAL = 10000;
  var CHEST_WEIGHT_1004 = 200;
  var CHEST_WEIGHT_3001 = 350;
  var CHEST_WEIGHT_3002 = 400;
  var CHEST_WEIGHT_3006 = 50;
  var CHEST_WEIGHT_3007 = 5;
  var CHEST_WEIGHT_EPIC = 1420;
  var CHEST_WEIGHT_RARE = 3980;

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
    "3006": "collectible_3006",
    "3007": "collectible_3007",
  };

  var CHEST_ITEM_POOL = [
    { id: 1004, w: CHEST_WEIGHT_1004 },
    { id: 3001, w: CHEST_WEIGHT_3001 },
    { id: 3002, w: CHEST_WEIGHT_3002 },
    { id: 3006, w: CHEST_WEIGHT_3006 },
    { id: 3007, w: CHEST_WEIGHT_3007 },
    { id: 3003, w: CHEST_WEIGHT_EPIC },
    { id: 3004, w: CHEST_WEIGHT_EPIC },
    { id: 3005, w: CHEST_WEIGHT_RARE },
  ];

  var EPIC_GUARANTEE_POOL = [
    { id: 3003, w: 1 },
    { id: 3004, w: 1 },
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

  function catalogIdIsPurpleOrBetter(catalogId) {
    if (!window.ItemCatalog || !catalogId) return false;
    var cat = window.ItemCatalog.getItem(catalogId);
    if (!cat || !cat.rarity) return false;
    return (
      cat.rarity === "epic" ||
      cat.rarity === "legendary" ||
      cat.rarity === "mythic" ||
      cat.rarity === "ultimate"
    );
  }

  function rollEpicCatalogId() {
    var cat = pirateIdToCatalog(rollWeighted(EPIC_GUARANTEE_POOL));
    return cat ? cat.id : "collectible_3003";
  }

  function ensurePurpleInRoll(ids) {
    var i;
    for (i = 0; i < ids.length; i++) {
      if (catalogIdIsPurpleOrBetter(ids[i])) return ids;
    }
    ids.push(rollEpicCatalogId());
    return ids;
  }

  /** @returns {string[]} catalog id 列表，1–4 件（可选首箱史诗保底） */
  function rollPirateChest(options) {
    options = options || {};
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

    if (options.guaranteeEpic) {
      ids = ensurePurpleInRoll(ids);
    }

    return ids;
  }

  window.PirateLootRoll = {
    rollPirateChest: rollPirateChest,
    catalogIdIsPurpleOrBetter: catalogIdIsPurpleOrBetter,
    rollLootItemCount: rollLootItemCount,
    pirateIdToCatalog: pirateIdToCatalog,
    CHEST_ITEM_POOL: CHEST_ITEM_POOL,
    LOOT_COUNT_TABLE: LOOT_COUNT_TABLE,
    CHEST_WEIGHT_TOTAL: CHEST_WEIGHT_TOTAL,
  };
})();

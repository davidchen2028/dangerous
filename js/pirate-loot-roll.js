/**
 * 海盗宝箱 — 仅藏品类 3001–3005（对应 Unity ItemDatabase + PirateLootManager）
 * 空手 30 · 传奇各 6 · 史诗各 19 · 稀有 57 · 含 1004 鹰雕像 · 三槽独立 roll
 */
(function () {
  "use strict";

  var CHEST_WEIGHT_EMPTY = 30;
  var CHEST_WEIGHT_LEGENDARY = 6;
  var CHEST_WEIGHT_EPIC = 19;
  var CHEST_WEIGHT_RARE = 57;
  var CHEST_SLOT_COUNT = 3;

  var PIRATE_ID_TO_CATALOG = {
    "1004": "pirate_1004",
    "3001": "collectible_3001",
    "3002": "collectible_3002",
    "3003": "collectible_3003",
    "3004": "collectible_3004",
    "3005": "collectible_3005",
  };

  var CHEST_POOL = [
    { id: 0, w: CHEST_WEIGHT_EMPTY },
    { id: 1004, w: CHEST_WEIGHT_LEGENDARY },
    { id: 3001, w: CHEST_WEIGHT_LEGENDARY },
    { id: 3002, w: CHEST_WEIGHT_LEGENDARY },
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

  function pirateIdToCatalog(pirateId) {
    if (!pirateId || pirateId === 0) return null;
    var key = String(pirateId);
    var catId = PIRATE_ID_TO_CATALOG[key];
    if (!catId || !window.ItemCatalog) return null;
    return window.ItemCatalog.getItem(catId);
  }

  /** @returns {string[]} 抽中的 catalog id 列表（已去空手，最多 3 件） */
  function rollPirateChest() {
    var ids = [];
    var s;
    for (s = 0; s < CHEST_SLOT_COUNT; s++) {
      var rolled = rollWeighted(CHEST_POOL);
      var cat = pirateIdToCatalog(rolled);
      if (cat) ids.push(cat.id);
    }
    return ids;
  }

  window.PirateLootRoll = {
    rollPirateChest: rollPirateChest,
    pirateIdToCatalog: pirateIdToCatalog,
    CHEST_POOL: CHEST_POOL,
  };
})();

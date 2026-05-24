/**
 * 物品目录 — 市场 / 仓库 / 装备栏共用
 */
(function () {
  "use strict";

  var ITEMS = {
    medkit: {
      id: "medkit",
      name: "野战医疗包",
      type: "loot",
      w: 1,
      h: 2,
      image: null,
    },
    bolt: {
      id: "bolt",
      name: "螺栓组",
      type: "loot",
      w: 1,
      h: 2,
    },
    truck_part: {
      id: "truck_part",
      name: "卡车部件",
      type: "loot",
      w: 2,
      h: 2,
    },
    circuit: {
      id: "circuit",
      name: "废弃电路板",
      type: "loot",
      w: 1,
      h: 1,
    },
    keycard: {
      id: "keycard",
      name: "侧门仓库",
      type: "loot",
      w: 1,
      h: 1,
    },
    helm_basic: {
      id: "helm_basic",
      name: "战术头盔",
      type: "helmet",
      w: 1,
      h: 1,
      image: "img/market/helmet.svg",
    },
    armr_basic: {
      id: "armr_basic",
      name: "轻型护甲",
      type: "armor",
      w: 1,
      h: 1,
      image: "img/market/armor.svg",
    },
    rig_light: {
      id: "rig_light",
      name: "轻型弹挂",
      type: "rig",
      w: 1,
      h: 1,
      rigSlots: 6,
      image: "img/market/rig-light.svg",
    },
    bp_sport: {
      id: "bp_sport",
      name: "运动背包",
      type: "backpack",
      w: 1,
      h: 1,
      cols: 2,
      rows: 4,
      image: "img/market/backpack-sport.svg",
    },
    bp_light: {
      id: "bp_light",
      name: "轻型背包",
      type: "backpack",
      w: 1,
      h: 1,
      cols: 3,
      rows: 4,
      image: "img/market/backpack-light.svg",
    },
  };

  var STASH_TO_ITEM = {
    circuit: "circuit",
    keycard: "keycard",
    helm1: "helm_basic",
    armr1: "armr_basic",
    riglt: "rig_light",
    bpspt: "bp_sport",
    bplgt: "bp_light",
  };

  var SLOT_TYPES = {
    primary: ["weapon_primary"],
    melee: ["weapon_melee"],
    secondary: ["weapon_secondary"],
    pistol: ["weapon_pistol"],
    helmet: ["helmet"],
    armor: ["armor"],
    rig: ["rig"],
    backpack: ["backpack"],
    card: ["keycard", "loot"],
  };

  function getItem(id) {
    return ITEMS[id] ? Object.assign({}, ITEMS[id]) : null;
  }

  function fromStashId(stashId) {
    var itemId = STASH_TO_ITEM[stashId];
    return itemId ? getItem(itemId) : null;
  }

  function acceptsSlot(slotKey, item) {
    if (!item) return false;
    var allowed = SLOT_TYPES[slotKey];
    if (!allowed) return false;
    if (allowed.indexOf(item.type) >= 0) return true;
    if (slotKey === "card" && item.type === "loot") return true;
    return false;
  }

  window.ItemCatalog = {
    ITEMS: ITEMS,
    STASH_TO_ITEM: STASH_TO_ITEM,
    getItem: getItem,
    fromStashId: fromStashId,
    acceptsSlot: acceptsSlot,
  };
})();

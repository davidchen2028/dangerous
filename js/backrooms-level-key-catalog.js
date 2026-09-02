/**
 * 层级钥匙统一目录。
 *
 * 价格由玩法配置决定；null 表示尚未定价，因此不得进入买卖流程。
 * levelId 与关卡/访问记录一致，itemId 使用只含字母、数字和下划线的存档安全格式。
 */

const DEFAULT_ICON = "img/backrooms/archive-viewer.png";

function defineKey(itemId, levelId, label, page, pass, opts) {
  opts = opts || {};
  return Object.freeze({
    itemId: itemId,
    levelId: levelId,
    name: "层级钥匙 · " + label,
    label: label,
    page: page || null,
    pass: pass || null,
    independent: opts.independent !== false,
    hubTarget: !!opts.hubTarget,
    nativeHub: !!opts.nativeHub,
    icon: opts.icon || DEFAULT_ICON,
    grade: opts.grade || null,
    buyPrice: Number.isFinite(opts.buyPrice) ? opts.buyPrice : null,
    sellPrice: Number.isFinite(opts.sellPrice) ? opts.sellPrice : null,
    enabled: opts.enabled === true,
  });
}

/** 61 个已制作、可游玩区域；C-102 与纯过渡场景不列入。 */
function trade(buyPrice, sellPrice, extra) {
  extra = extra || {};
  extra.buyPrice = buyPrice;
  extra.sellPrice = sellPrice;
  extra.enabled = true;
  return extra;
}

export const LEVEL_KEY_CATALOG = Object.freeze([
  // 普通层级（26）
  defineKey("level_key_l0", "l0", "Level 0", "backrooms-level0.html", "l0", trade(60, 30, { hubTarget: true })),
  defineKey("level_key_l1", "l1", "Level 1", "backrooms-level1.html", "clip", { hubTarget: true, nativeHub: true }),
  defineKey("level_key_l2", "l2", "Level 2", "backrooms-level2.html", "l2", trade(90, 45, { hubTarget: true })),
  defineKey("level_key_l3", "l3", "Level 3", "backrooms-level3.html", "l3", trade(110, 55, { hubTarget: true })),
  defineKey("level_key_l4", "l4", "Level 4", "backrooms-level4.html", "l4", { hubTarget: true, nativeHub: true }),
  defineKey("level_key_l5", "l5", "Level 5", "backrooms-level5.html", "l5", trade(140, 70, { hubTarget: true })),
  defineKey("level_key_l6", "l6", "Level 6", "backrooms-level6.html", "l6", trade(150, 75, { hubTarget: true })),
  defineKey("level_key_l7", "l7", "Level 7", "backrooms-level7.html", "l7", trade(180, 90, { hubTarget: true })),
  defineKey("level_key_l8", "l8", "Level 8", "backrooms-level8.html", "l8", trade(130, 65, { hubTarget: true })),
  defineKey("level_key_l9", "l9", "Level 9", "backrooms-level9.html", "l9", trade(150, 75, { hubTarget: true })),
  defineKey("level_key_l10", "l10", "Level 10", "backrooms-level10.html", "l10", trade(65, 30, { hubTarget: true })),
  defineKey("level_key_l11", "l11", "Level 11", "backrooms-level11.html", "l11", { hubTarget: true, nativeHub: true }),
  defineKey("level_key_l13", "l13", "Level 13", "backrooms-level13.html", "l13", trade(100, 60, { hubTarget: true })),
  defineKey("level_key_l14", "l14", "Level 14", "backrooms-level14.html", "l14", trade(80, 60, { hubTarget: true })),
  defineKey("level_key_l16", "l16", "Level 16", "backrooms-level16.html", "l16", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_l21", "l21", "Level 21", "backrooms-level21.html", "l21", trade(120, 60, { hubTarget: true })),
  defineKey("level_key_l37", "l37", "Level 37", "backrooms-level37.html", "l37", trade(170, 135, { hubTarget: true })),
  defineKey("level_key_l46", "l46", "Level 46", "backrooms-level46.html", "l46", trade(100, 50, { hubTarget: true })),
  defineKey("level_key_l48", "l48", "Level 48", "backrooms-level48.html", "l48", trade(155, 125, { hubTarget: true })),
  defineKey("level_key_l57", "l57", "Level 57", "backrooms-level57.html", "l57", trade(85, 40, { hubTarget: true })),
  defineKey("level_key_l75", "l75", "Level 75", "backrooms-level75.html", "l75", trade(95, 45, { hubTarget: true })),
  defineKey("level_key_l119", "l119", "Level 119", "backrooms-level119.html", "l119", trade(130, 65, { hubTarget: true })),
  defineKey("level_key_l121", "l121", "Level 121", "backrooms-level121.html", "l121", trade(100, 50, { hubTarget: true })),
  defineKey("level_key_l149", "l149", "Level 149", "backrooms-level149.html", "l149", trade(135, 65, { hubTarget: true })),
  defineKey("level_key_l283", "l283", "Level 283", "backrooms-level283.html", "l283", trade(200, 100, { hubTarget: true })),
  defineKey("level_key_l363", "l363", "Level 363", "backrooms-level363.html", "l363", { hubTarget: true, nativeHub: true }),

  // 子层级与独立基地（16）
  defineKey("level_key_l0_1", "0.1", "Level 0.1 天顶站", "backrooms-level0.html", null, { independent: false }),
  defineKey("level_key_l0_2", "0.2", "Level 0.2", "backrooms-level0.html", null, { independent: false }),
  defineKey("level_key_l0_3", "0.3", "Level 0.3", "backrooms-level0.html", null, { independent: false }),
  defineKey("level_key_l0_5", "0.5", "Level 0.5 渊闭疗舍", "backrooms-level0.html", null, { independent: false }),
  defineKey("level_key_l0_7", "0.7", "Level 0.7 忆域", "backrooms-level0.html", null, { independent: false }),
  defineKey("level_key_l1_1", "l1.1", "Level 1.1 区域 1", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_1_1", "l1.1-1", "Level 1.1 前哨走廊 1", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_1_2", "l1.1-2", "Level 1.1 区域 2", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_1_3", "l1.1-3", "Level 1.1 区域 3", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_1_4", "l1.1-4", "Level 1.1 区域 4 死区", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_2", "l1.2", "Level 1.2 砼苑", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_3", "l1.3", "Level 1.3 恶性肿瘤", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_5", "l1.5", "Level 1.5 颠倒", "backrooms-level1.html", null, { independent: false }),
  defineKey("level_key_l1_bntg", "l1_bntg", "Level 1 B.N.T.G. 独立基地", "backrooms-level1-bntg-base.html", "l1_bntg"),
  defineKey("level_key_l6_1", "l6_1", "Level 6.1 零食间", "backrooms-level6-1.html", "l6_1", { hubTarget: true }),
  defineKey("level_key_c2_1", "c2_1", "Ray Complex-2.1", "backrooms-level-c2-1.html", "c2_1", { independent: false }),

  // C 层级（18）
  defineKey("level_key_c1", "c1", "Level C-1 交点", "backrooms-level-c1.html", "c1", trade(180, 90, { hubTarget: true })),
  defineKey("level_key_c2", "c2", "Level C-2 视 · 界", "backrooms-level-c2.html", "c2", { hubTarget: true }),
  defineKey("level_key_c101", "c101", "Level C-101 服务器机房", "backrooms-level-c101.html", "c101", trade(140, 70, { hubTarget: true })),
  defineKey("level_key_c144", "c144", "Level C-144 和爱社区", "backrooms-level-c144.html", "c144", trade(90, 45, { hubTarget: true })),
  defineKey("level_key_c192", "c192", "Level C-192 森林", "backrooms-level-c192.html", "c192", trade(120, 60, { hubTarget: true })),
  defineKey("level_key_c370", "c370", "Level C-370 倾向", "backrooms-level-c370.html", "c370", trade(200, 165, { hubTarget: true })),
  defineKey("level_key_c1289", "c1289", "Level C-1289", "backrooms-level-c1289.html", "c1289", { hubTarget: true, nativeHub: true }),
  defineKey("level_key_c1290", "c1290", "Level C-1290 夕前石茧", "backrooms-level-c1290.html", "c1290", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1291", "c1291", "Level C-1291 井盖迷阵", "backrooms-level-c1291.html", "c1291", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1292", "c1292", "Level C-1292 项目：衰退瘾", "backrooms-level-c1292.html", "c1292", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1293", "c1293", "Level C-1293 故此悬置", "backrooms-level-c1293.html", "c1293", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1294", "c1294", "Level C-1294 流萤死地", "backrooms-level-c1294.html", "c1294", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1295", "c1295", "Level C-1295 凝固", "backrooms-level-c1295.html", "c1295", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1296", "c1296", "Level C-1296 0.1296%", "backrooms-level-c1296.html", "c1296", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1297", "c1297", "Level C-1297 无界之痿", "backrooms-level-c1297.html", "c1297", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1298", "c1298", "Level C-1298 人景", "backrooms-level-c1298.html", "c1298", trade(170, 85, { hubTarget: true })),
  defineKey("level_key_c1299", "c1299", "Level C-1299 浓汤煮沸", "backrooms-level-c1299.html", "c1299", trade(300, 150, { hubTarget: true })),
  defineKey("level_key_c1299_1", "c1299_1", "Level C-1299.1 浓汤美味", "backrooms-level-c1299-1.html", "c1299_1", trade(300, 150, { hubTarget: true })),

  // 隐秘层级（1）：可鉴定/交易，但不在 Hub 内生成指向自身的门。
  defineKey("level_key_hub", "hub", "枢纽 The Hub", "backrooms-hub.html", "hub", trade(200, 100)),
]);

const BY_ITEM_ID = Object.create(null);
const BY_LEVEL_ID = Object.create(null);
for (var i = 0; i < LEVEL_KEY_CATALOG.length; i++) {
  var entry = LEVEL_KEY_CATALOG[i];
  BY_ITEM_ID[entry.itemId] = entry;
  BY_LEVEL_ID[entry.levelId] = entry;
}

export function getLevelKeyByItemId(itemId) {
  return BY_ITEM_ID[itemId] || null;
}

export function getLevelKeyByLevelId(levelId) {
  return BY_LEVEL_ID[levelId] || null;
}

export function getLevelKeyItemId(levelId) {
  var entry = getLevelKeyByLevelId(levelId);
  return entry ? entry.itemId : null;
}

export function getTradableLevelKeys(mode) {
  var priceField = mode === "sell" ? "sellPrice" : "buyPrice";
  return LEVEL_KEY_CATALOG.filter(function (entry) {
    return entry.enabled && Number.isFinite(entry[priceField]);
  });
}

export function validateLevelKeyCatalog() {
  var errors = [];
  var itemIds = Object.create(null);
  var levelIds = Object.create(null);
  LEVEL_KEY_CATALOG.forEach(function (entry) {
    if (!/^level_key_[a-z0-9_]+$/.test(entry.itemId)) {
      errors.push("unsafe item id: " + entry.itemId);
    }
    if (itemIds[entry.itemId]) errors.push("duplicate item id: " + entry.itemId);
    if (levelIds[entry.levelId]) errors.push("duplicate level id: " + entry.levelId);
    itemIds[entry.itemId] = true;
    levelIds[entry.levelId] = true;
    if (entry.enabled && entry.buyPrice == null && entry.sellPrice == null) {
      errors.push("enabled without price: " + entry.itemId);
    }
    if (entry.hubTarget && (!entry.page || !entry.pass)) {
      errors.push("hub target missing page/pass: " + entry.itemId);
    }
  });
  return errors;
}

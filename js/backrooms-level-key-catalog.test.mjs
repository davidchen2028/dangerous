import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  LEVEL_KEY_CATALOG,
  getLevelKeyByItemId,
  getLevelKeyByLevelId,
  getLevelKeyItemId,
  getTradableLevelKeys,
  validateLevelKeyCatalog,
} from "./backrooms-level-key-catalog.js";
import {
  getBuyPrice,
  getSellPrice,
  getShopItemName,
} from "./backrooms-shop-prices.js";

const ROOT = resolve(import.meta.dirname, "..");

const EXPECTED_PRICES = {
  level_key_l0: [60, 30],
  level_key_l2: [90, 45],
  level_key_l3: [110, 55],
  level_key_l5: [140, 70],
  level_key_l6: [150, 75],
  level_key_l7: [180, 90],
  level_key_l8: [130, 65],
  level_key_l9: [150, 75],
  level_key_l10: [65, 30],
  level_key_l13: [100, 60],
  level_key_l14: [80, 60],
  level_key_l16: [170, 85],
  level_key_l21: [120, 60],
  level_key_l37: [170, 135],
  level_key_l46: [100, 50],
  level_key_l48: [155, 125],
  level_key_l57: [85, 40],
  level_key_l75: [95, 45],
  level_key_l119: [130, 65],
  level_key_l121: [100, 50],
  level_key_l149: [135, 65],
  level_key_l283: [200, 100],
  level_key_c1: [180, 90],
  level_key_c101: [140, 70],
  level_key_c144: [90, 45],
  level_key_c192: [120, 60],
  level_key_c370: [200, 165],
  level_key_c1290: [170, 85],
  level_key_c1291: [170, 85],
  level_key_c1292: [170, 85],
  level_key_c1293: [170, 85],
  level_key_c1294: [170, 85],
  level_key_c1295: [170, 85],
  level_key_c1296: [170, 85],
  level_key_c1297: [170, 85],
  level_key_c1298: [170, 85],
  level_key_c1299: [300, 150],
  level_key_c1299_1: [300, 150],
  level_key_hub: [200, 100],
};

const UNTRADED_IDS = [
  "level_key_l1",
  "level_key_l4",
  "level_key_l11",
  "level_key_l363",
  "level_key_c1289",
  "level_key_l0_1",
  "level_key_l0_2",
  "level_key_l0_3",
  "level_key_l0_5",
  "level_key_l0_7",
  "level_key_l1_1",
  "level_key_l1_1_1",
  "level_key_l1_1_2",
  "level_key_l1_1_3",
  "level_key_l1_1_4",
  "level_key_l1_2",
  "level_key_l1_3",
  "level_key_l1_5",
  "level_key_l1_bntg",
  "level_key_l6_1",
];

const NATIVE_HUB_IDS = [
  "level_key_l1",
  "level_key_l4",
  "level_key_l11",
  "level_key_c1289",
  "level_key_l363",
];

test("catalog contains exactly 59 unique, valid level keys", () => {
  assert.equal(LEVEL_KEY_CATALOG.length, 59);
  assert.deepEqual(validateLevelKeyCatalog(), []);
  assert.equal(new Set(LEVEL_KEY_CATALOG.map((entry) => entry.itemId)).size, 59);
  assert.equal(new Set(LEVEL_KEY_CATALOG.map((entry) => entry.levelId)).size, 59);
  for (const entry of LEVEL_KEY_CATALOG) {
    assert.match(entry.itemId, /^level_key_[a-z0-9_]+$/);
    assert.ok(entry.page);
    assert.equal(existsSync(resolve(ROOT, entry.page)), true, entry.page);
    assert.equal(getLevelKeyByItemId(entry.itemId), entry);
    assert.equal(getLevelKeyByLevelId(entry.levelId), entry);
    assert.equal(getLevelKeyItemId(entry.levelId), entry.itemId);
  }
});

test("catalog excludes placeholders and transition scenes", () => {
  const pages = LEVEL_KEY_CATALOG.map((entry) => entry.page);
  assert.equal(pages.includes("backrooms-level-c102.html"), false);
  assert.equal(pages.includes("backrooms-level-c101-glitch.html"), false);
  assert.equal(LEVEL_KEY_CATALOG.some((entry) => /blue|sandbox|preview/.test(entry.levelId)), false);
});

test("priced keys match the confirmed shop table", () => {
  const buyable = getTradableLevelKeys("buy").map((entry) => entry.itemId).sort();
  const sellable = getTradableLevelKeys("sell").map((entry) => entry.itemId).sort();
  const expectedIds = Object.keys(EXPECTED_PRICES).sort();
  assert.deepEqual(buyable, expectedIds);
  assert.deepEqual(sellable, expectedIds);
  for (const [itemId, [buy, sell]] of Object.entries(EXPECTED_PRICES)) {
    const entry = getLevelKeyByItemId(itemId);
    assert.equal(entry.enabled, true, itemId);
    assert.equal(entry.buyPrice, buy, itemId);
    assert.equal(entry.sellPrice, sell, itemId);
    assert.equal(getBuyPrice(itemId), buy, itemId);
    assert.equal(getSellPrice(itemId), sell, itemId);
  }
});

test("sub-levels and Hub-native keys stay unpriced", () => {
  for (const itemId of UNTRADED_IDS) {
    const entry = getLevelKeyByItemId(itemId);
    assert.ok(entry, itemId);
    assert.equal(entry.enabled, false, itemId);
    assert.equal(entry.buyPrice, null, itemId);
    assert.equal(entry.sellPrice, null, itemId);
    assert.equal(getBuyPrice(itemId), null, itemId);
    assert.equal(getSellPrice(itemId), null, itemId);
  }
  for (const itemId of NATIVE_HUB_IDS) {
    assert.equal(getLevelKeyByItemId(itemId).nativeHub, true, itemId);
  }
  assert.equal(getLevelKeyByItemId("level_key_l14").nativeHub, false);
  assert.equal(getLevelKeyByItemId("level_key_hub").hubTarget, false);
});

test("C-370 lucky sell bonus cannot arbitrage the buy price", () => {
  const key = getLevelKeyByItemId("level_key_c370");
  const luckySell = Math.round(key.sellPrice * 1.15);
  assert.equal(luckySell, 190);
  assert.equal(luckySell < key.buyPrice, true);
});

test("legacy Level 14 key remains identifiable and opens Hub target", () => {
  const key = getLevelKeyByItemId("level_key_l14");
  assert.ok(key);
  assert.equal(key.levelId, "l14");
  assert.equal(key.hubTarget, true);
  assert.equal(key.page, "backrooms-level14.html");
  assert.equal(getShopItemName(key.itemId), "层级钥匙 · Level 14");
});

test("Level 14 no longer contains its special return door", () => {
  const source = readFileSync(resolve(ROOT, "js/backrooms-level14.js"), "utf8");
  assert.equal(source.includes("l14_hub_door"), false);
  assert.equal(source.includes("leaveToHub"), false);
  assert.equal(source.includes('grantLevelPass("hub"'), false);
});

test("Hub native unlock reads catalog nativeHub instead of door indexes", () => {
  const source = readFileSync(resolve(ROOT, "js/backrooms-hub.js"), "utf8");
  assert.equal(source.includes("index === 2 || index === 11"), false);
  assert.equal(source.includes("key.nativeHub"), true);
});

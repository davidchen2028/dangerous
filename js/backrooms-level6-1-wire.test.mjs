import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getLevelKeyByLevelId } from "./backrooms-level-key-catalog.js";
import {
  L61_PAINTING_YAW,
  L61_FREE_LOOT,
  L61_GLASS,
  L61_JAM_GATE,
  L61_ROOM_D,
  L61_ROOM_W,
  L61_SPAWN,
  L61_TABLES,
  L61_VENDORS,
  circleHitsAabb,
  glassDoorClearsOpening,
  isInsideGlassExit,
  isL61StockEmpty,
  readL61StockMap,
  ventPickCoversEye,
  wallCollider,
} from "./backrooms-level6-1-layout.js";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

test("Level 6.1 is a 24×16 snackrooms food court", () => {
  assert.equal(L61_ROOM_W, 24);
  assert.equal(L61_ROOM_D, 16);
  assert.equal(isInsideGlassExit(0, 8.2), true);
  assert.equal(isInsideGlassExit(1.2, 8.2), false);
  assert.equal(isInsideGlassExit(0, 0), false);
  assert.ok(L61_FREE_LOOT.some((item) => item.id === "almond_water"));
  assert.ok(L61_FREE_LOOT.some((item) => item.id === "royal_rations"));
});

test("Level 6.1 weekly stock cools down instead of staying empty forever", () => {
  const now = 1_000_000;
  const stock = readL61StockMap({ v0: now - 1000, stale: now - 9 * 60 * 1000 }, now, 8 * 60 * 1000);
  assert.equal(isL61StockEmpty(stock, "v0", now, 8 * 60 * 1000), true);
  assert.equal(isL61StockEmpty(stock, "stale", now, 8 * 60 * 1000), false);
  assert.equal(isL61StockEmpty(stock, "v0", now + 8 * 60 * 1000, 8 * 60 * 1000), false);
});

test("Level 6.1 wires MEG iron door, blue wall, and free vending", () => {
  const world = read("js/backrooms-level6-1-world.js");
  const src = read("js/backrooms-level6-1.js");
  const html = read("backrooms-level6-1.html");
  assert.match(world, /l61_iron_door/);
  assert.match(world, /l61_blue_wall/);
  assert.match(world, /l61_vending/);
  assert.match(world, /FREE/);
  assert.match(src, /tryFreeLoot/);
  assert.match(src, /openStaffTalk/);
  assert.match(src, /exitTo\("l6"/);
  assert.match(src, /exitTo\("blue_channel"/);
  assert.match(html, /零食室/);
  assert.match(html, /生存难度 1/);
  assert.match(html, /backrooms-level6-1\.js\?v=13/);
  assert.match(src, /onTapInteract: tryQAction/);
  assert.match(src, /isTaskUiOpen\(\)/);
  assert.match(src, /const AIM_MAX = 5/);
  assert.match(src, /queueEnterLevelBanner\("Level C-144"\)/);
  assert.doesNotMatch(src, /queueEnterLevelNumber\("C-144"\)/);
  assert.match(world, /L61_VENT_PICK/);
  assert.match(src, /L61_GLASS\.slide/);
  assert.match(world, /L61_JAM_GATE/);
  assert.equal(L61_PAINTING_YAW, -Math.PI / 2);
  assert.match(world, /L61_PAINTING_YAW/);
  assert.doesNotMatch(world, /painting\.rotation\.y = Math\.PI \/ 2/);
  assert.doesNotMatch(world, /megSign\.rotation\.y = Math\.PI/);
  assert.match(src, /queueEnterLevelBanner\("蓝色通道"\)/);
  assert.doesNotMatch(src, /queueEnterLevelNumber\("蓝色通道"\)/);
});

test("Level 6.1 jammed alcove cannot be squeezed through", () => {
  assert.equal(circleHitsAabb(8.2, 4.8, 0.32, L61_JAM_GATE), true);
  assert.equal(circleHitsAabb(8.2, 3.4, 0.32, L61_JAM_GATE), true);
  assert.equal(circleHitsAabb(8.2, 7.2, 0.32, L61_JAM_GATE), true);
  assert.equal(circleHitsAabb(7.2, 4.8, 0.32, L61_JAM_GATE), false);
});

test("Level 6.1 glass door opens first; walking out later goes to Level 11", () => {
  const src = read("js/backrooms-level6-1.js");
  const start = src.indexOf("function openGlassDoor(");
  assert.ok(start >= 0);
  const end = src.indexOf("\nfunction ", start + 10);
  const fn = src.slice(start, end);
  assert.doesNotMatch(fn, /exitTo/);
  assert.match(src, /isInsideGlassExit/);
  assert.match(src, /maybeWalkOutGlass/);
  assert.match(src, /exitTo\("l11"/);
});

test("Level 6.1 glass door slides clear and vent pick is at eye height", () => {
  assert.equal(glassDoorClearsOpening(1.85), false);
  assert.equal(glassDoorClearsOpening(L61_GLASS.slide), true);
  assert.equal(ventPickCoversEye(1.65), true);
  assert.equal(ventPickCoversEye(2.35), true);
  assert.equal(ventPickCoversEye(0.4), false);
});

test("Level 6.1 spawn is not inside tables or vendors", () => {
  for (const table of L61_TABLES) {
    assert.equal(
      circleHitsAabb(L61_SPAWN.x, L61_SPAWN.z, 0.32, wallCollider(table.x - 0.58, table.x + 0.58, table.z - 0.58, table.z + 0.58)),
      false,
      `table ${table.x},${table.z}`
    );
  }
  for (const vendor of L61_VENDORS) {
    const padX = vendor.kind === "shelf" ? 0.78 : 0.5;
    const padZ = vendor.kind === "shelf" ? 0.3 : 0.4;
    assert.equal(
      circleHitsAabb(
        L61_SPAWN.x,
        L61_SPAWN.z,
        0.32,
        wallCollider(vendor.x - padX, vendor.x + padX, vendor.z - padZ, vendor.z + padZ)
      ),
      false,
      vendor.id
    );
  }
});

test("Level 6.1 weekly stock is cleared on a new run", () => {
  const keys = read("js/backrooms-session-keys.js");
  assert.match(keys, /backrooms_l61_stock_v1/);
});

test("Level 6.1 catalog label is 零食室", () => {
  const key = getLevelKeyByLevelId("l6_1");
  assert.ok(key);
  assert.match(key.name, /零食室/);
  assert.doesNotMatch(key.name, /零食间/);
});

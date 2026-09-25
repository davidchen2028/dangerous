import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { LEVEL_KEY_CATALOG, getLevelKeyByLevelId } from "./backrooms-level-key-catalog.js";
import { listEntity81Destinations } from "./backrooms-entity81-catalog.js";
import { levelKeyFromPath } from "./backrooms-world-level.js";
import { C1623_ROAD_HALF_W, C1623_SPAWN } from "./backrooms-level-c1623-layout.js";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

test("Level C-1623 is an independent playable key", () => {
  const key = getLevelKeyByLevelId("c1623");
  assert.ok(key);
  assert.equal(key.page, "backrooms-level-c1623.html");
  assert.equal(key.pass, "c1623");
  assert.equal(key.buyPrice, 155);
  assert.equal(key.sellPrice, 75);
  assert.equal(existsSync(resolve(ROOT, key.page)), true);
  assert.equal(LEVEL_KEY_CATALOG.some((entry) => entry.levelId === "c1623"), true);
});

test("C-1623 pass exists and Entity 81 does not list it", () => {
  const pass = read("js/backrooms-level-pass.js");
  const session = read("js/backrooms-session-keys.js");
  assert.match(pass, /c1623: \{ pass: "backrooms_c1623_pass"/);
  assert.match(session, /"backrooms_c1623_pass"/);
  assert.equal(listEntity81Destinations().some((d) => d.levelId === "c1623"), false);
  assert.equal(levelKeyFromPath("/backrooms-level-c1623.html"), "c1623");
});

test("Level √2 crack grants C-1623 and the old door still returns to Level 0", () => {
  const src = read("js/backrooms-level-sqrt2.js");
  const world = read("js/backrooms-level-sqrt2-world.js");
  const tasks = read("js/backrooms-tasks.js");
  assert.match(world, /sqrt2_crack/);
  assert.match(src, /grantLevelPass\("c1623"/);
  assert.match(src, /backrooms-level-c1623\.html/);
  assert.match(src, /grantLevelPass\("l0"/);
  const interact = src.slice(src.indexOf("function interact("), src.indexOf("function refreshAim("));
  assert.ok(interact.indexOf("sqrt2_crack") < interact.indexOf("sqrt2_exit"));
  assert.match(tasks, /id: "excess_thirties"/);
  assert.match(tasks, /levelId: "c1623"/);
});

test("C-1623 spawn can aim the first roadside door", () => {
  const src = read("js/backrooms-level-c1623.js");
  const html = read("backrooms-level-c1623.html");
  assert.match(src, /const AIM_MAX = 5/);
  assert.match(html, /backrooms-level-c1623\.js\?v=3/);
  const pickX = C1623_ROAD_HALF_W - 0.55;
  const dist = Math.hypot(pickX - C1623_SPAWN.x, 1.2 - 1.62, 3.15 - C1623_SPAWN.z);
  assert.ok(dist > 3.6, "regression: old 3.6m aim missed the first door");
  assert.ok(dist <= 5, "spawn must reach the first door after the aim bump");
});

test("C-1623 leaves the blue channel by looking up, not a void-wall pick", () => {
  const src = read("js/backrooms-level-c1623.js");
  const world = read("js/backrooms-level-c1623-world.js");
  const aim = read("js/backrooms-interact-aim.js");
  assert.doesNotMatch(world, /c1623_up/);
  assert.doesNotMatch(src, /c1623_up/);
  assert.doesNotMatch(src, /maybeJumpUp/);
  assert.match(src, /isC1623LookUp/);
  assert.match(src, /leaveTo\("blue_channel"/);
  assert.match(src, /camera\.updateMatrixWorld/);
  assert.match(world, /setPickLive/);
  assert.match(aim, /isInteractObjectShown/);
});

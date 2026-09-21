import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { LEVEL_KEY_CATALOG, getLevelKeyByLevelId } from "./backrooms-level-key-catalog.js";
import { listEntity81Destinations } from "./backrooms-entity81-catalog.js";
import { levelKeyFromPath } from "./backrooms-world-level.js";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

test("Level √2 is an independent playable key with pass, page, and shop prices", () => {
  const key = getLevelKeyByLevelId("sqrt2");
  assert.ok(key);
  assert.equal(key.itemId, "level_key_sqrt2");
  assert.equal(key.page, "backrooms-level-sqrt2.html");
  assert.equal(key.pass, "sqrt2");
  assert.equal(key.hubTarget, true);
  assert.equal(key.buyPrice, 125);
  assert.equal(key.sellPrice, 60);
  assert.equal(existsSync(resolve(ROOT, key.page)), true);
  assert.equal(LEVEL_KEY_CATALOG.some((entry) => entry.levelId === "sqrt2"), true);
});

test("Level √2 pass and session keys exist, Entity 81 does not list it", () => {
  const pass = read("js/backrooms-level-pass.js");
  const session = read("js/backrooms-session-keys.js");
  assert.match(pass, /sqrt2: \{ pass: "backrooms_sqrt2_pass"/);
  assert.match(session, /"backrooms_sqrt2_pass"/);
  assert.match(session, /"backrooms_sqrt2_yaw"/);
  assert.equal(listEntity81Destinations().some((d) => d.levelId === "sqrt2"), false);
  assert.equal(levelKeyFromPath("/backrooms-level-sqrt2.html"), "sqrt2");
});

test("Level 81 hides a cyan i that grants √2, sitting does not steal the aim", () => {
  const world = read("js/backrooms-level81-world.js");
  const level = read("js/backrooms-level81.js");
  assert.match(world, /l81_imaginary/);
  assert.match(world, /hangImaginary/);
  assert.match(level, /aimImaginaryFallback/);
  assert.match(level, /l81_sit/);
  assert.match(level, /align < 0\.85/);
  assert.match(level, /grantLevelPass\("sqrt2"/);
  assert.match(level, /backrooms-level-sqrt2\.html/);
  const interact = level.slice(level.indexOf("function interact("), level.indexOf("function refreshAim("));
  assert.ok(interact.indexOf("l81_imaginary") < interact.indexOf("canSitNow"));
});

test("Level √2 exits to Level 0 and records the irrational explore task", () => {
  const src = read("js/backrooms-level-sqrt2.js");
  const tasks = read("js/backrooms-tasks.js");
  assert.match(src, /grantLevelPass\("l0"/);
  assert.match(src, /backrooms-level0\.html/);
  assert.match(src, /enforceLevelEntry\("sqrt2"/);
  assert.match(src, /markLevelEntered\("sqrt2"/);
  assert.match(tasks, /id: "irrational"/);
  assert.match(tasks, /levelId: "sqrt2"/);
});

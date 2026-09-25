import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getLevelKeyByLevelId } from "./backrooms-level-key-catalog.js";
import {
  L8_AVENUE,
  L8_CHICKEN_HOMES,
  L8_L9_ROAD,
  L8_MARKERS,
  L8_MEG_NOTICE_YAW,
  L8_PIPE_YAW,
  L8_PLANK_ZONE,
  L8_SPAWN,
  L8_VENT_YAW,
  eastNookIsOpen,
  hitsLevel8Wall,
  isInsideL9Road,
  isOnNinthAvenue,
  listLevel8WallColliders,
  ventPickClearsEastWall,
  ventPickClearsStandNear,
  ventPickCoversEye,
  ventPickIsOnAvenueSide,
} from "./backrooms-level8-layout.js";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

test("Level 8 is a walkable 12×80 ninth-avenue cave", () => {
  assert.equal(L8_AVENUE.maxX - L8_AVENUE.minX, 12);
  assert.equal(L8_AVENUE.maxZ - L8_AVENUE.minZ, 80);
  assert.ok(L8_MARKERS.length >= 4);
  assert.equal(isOnNinthAvenue(0, 0), true);
  assert.equal(isInsideL9Road(0, -38), false);
  assert.equal(isInsideL9Road(0, L8_L9_ROAD.exitZ - 0.2), true);
  assert.equal(isInsideL9Road(0, 0), false);
  assert.ok(listLevel8WallColliders().length > 8);
});

test("Level 8 chickens stay off the avenue spine", () => {
  for (const home of L8_CHICKEN_HOMES) {
    assert.equal(Math.abs(home.x) > 6, true, "chicken " + home.x);
  }
});

test("Level 8 wires mile markers, L9 road, and the Level 2 vent", () => {
  const world = read("js/backrooms-level8-world.js");
  const src = read("js/backrooms-level8.js");
  const html = read("backrooms-level8.html");
  assert.match(world, /l8_mile_marker/);
  assert.match(world, /l8_l9_road/);
  assert.match(world, /l8_level2_vent/);
  assert.match(world, /l8_meg_notice/);
  assert.match(src, /isInsideL9Road/);
  assert.match(src, /maybeWalkOutL9/);
  assert.match(src, /exitTo\("l2"/);
  assert.match(src, /exitTo\("l75"/);
  assert.match(html, /岩洞系统/);
  assert.match(html, /生存难度 4/);
  assert.match(html, /backrooms-level8\.js\?v=17/);
  assert.match(src, /onTapInteract: tryQAction/);
  assert.match(src, /isTaskUiOpen\(\)/);
  assert.match(src, /applyBackroomsCamera[\s\S]*refreshAimPick/);
  assert.match(world, /darkness\.rotation\.y = Math\.PI/);
  assert.match(world, /L8_VENT_PICK/);
  assert.match(world, /L8_VENT_YAW/);
  assert.match(world, /L8_PIPE_YAW/);
  assert.match(world, /L8_MEG_NOTICE_YAW/);
  assert.match(world, /addColliderWalls/);
  assert.doesNotMatch(world, /plate\.rotation\.y = m\.x > 0/);
  assert.match(world, /DoubleSide/);
});

test("Level 8 L9 main road does not exitTo on the first Q", () => {
  const src = read("js/backrooms-level8.js");
  const start = src.indexOf("function tryQAction(");
  assert.ok(start >= 0);
  const end = src.indexOf("\nfunction ", start + 10);
  const fn = src.slice(start, end);
  const road = fn.indexOf("l8_l9_road");
  assert.ok(road >= 0);
  const after = fn.slice(road, fn.indexOf("if (data.kind === \"l8_plank\")"));
  assert.doesNotMatch(after, /exitTo/);
  assert.match(src, /maybeWalkOutL9/);
  assert.match(src, /exitTo\("l9"/);
});

test("Level 8 catalog label is 岩洞系统", () => {
  const key = getLevelKeyByLevelId("l8");
  assert.ok(key);
  assert.match(key.name, /岩洞系统/);
});

test("Level 8 checkpoint stays numeric 8", () => {
  const src = read("js/backrooms-level8.js");
  assert.match(src, /return \{ level: 8 \}/);
});

test("Level 8 vent faces the avenue and sits at eye height", () => {
  assert.equal(L8_VENT_YAW, -Math.PI * 0.5);
  assert.equal(L8_PIPE_YAW, -Math.PI * 0.5);
  assert.equal(L8_MEG_NOTICE_YAW, Math.PI * 0.5);
  assert.equal(ventPickIsOnAvenueSide(), true);
  assert.equal(ventPickClearsEastWall(), true);
  assert.equal(ventPickClearsStandNear(0.06), true);
  assert.equal(ventPickCoversEye(1.65), true);
  assert.equal(ventPickCoversEye(2.4), true);
  assert.equal(ventPickCoversEye(0.4), false);
});

test("Level 8 pool shoulders block the void beside the wet beach", () => {
  assert.equal(hitsLevel8Wall(L8_SPAWN.x, L8_SPAWN.z, 0.34), false);
  assert.equal(hitsLevel8Wall(0, 0, 0.34), false);
  assert.equal(hitsLevel8Wall(-11.2, 2, 0.34), false);
  assert.equal(hitsLevel8Wall(7.2, 27.95, 0.34), true);
  assert.equal(hitsLevel8Wall(-7.2, 27.95, 0.34), true);
});

test("Level 8 ninth avenue and side rooms stay walkable", () => {
  const step = (x0, z0, x1, z1, n) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      assert.equal(hitsLevel8Wall(x, z, 0.34), false, x.toFixed(2) + "," + z.toFixed(2));
    }
  };
  step(0, 34, 0, -37.6, 90);
  step(0, 2, -11.2, 2, 24);
  step(0, 16, 11.1, 16, 24);
  step(0, -8, 5.2, -8, 18);
  step(0, -22, 9.4, -22, 24);
  assert.equal(eastNookIsOpen(), true);
  assert.equal(isInsideL9Road(0, -38), false);
  assert.equal(isInsideL9Road(0, -39.6), true);
  assert.equal(L8_PLANK_ZONE.minX > 8, true);
});

test("Level 8 chickens do not hunt on the avenue", () => {
  const src = read("js/backrooms-level8-chickens.js");
  assert.match(src, /isOnNinthAvenue/);
  assert.equal(isOnNinthAvenue(0, 16), true);
  for (const home of L8_CHICKEN_HOMES) {
    assert.equal(isOnNinthAvenue(home.x, home.z), false, "chicken " + home.x);
  }
});

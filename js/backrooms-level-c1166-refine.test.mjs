import test from "node:test";
import assert from "node:assert/strict";

import {
  refineAllowsSprint,
  refineJumpMul,
  refineSpeedMul,
  refineStage,
  refineStickSec,
} from "./backrooms-level-c1166-refine.js";
import {
  C1166_BOUND_IDS,
  C1166_PILL_BLACK,
  C1166_PILL_BLUE,
  C1166_PILL_CENTER,
  C1166_PILL_ORANGE,
  C1166_PILL_WHITE,
  applyPill,
  rollSpiritPill,
  stripBoundItems,
} from "./backrooms-level-c1166-pills.js";
import { convertElapsed, createC1166Run } from "./backrooms-level-c1166-palaces.js";

test("refine stages match the 70 second table", () => {
  assert.equal(refineStage(0), 0);
  assert.equal(refineStage(69.9), 0);
  assert.equal(refineStage(70), 1);
  assert.equal(refineStage(489.9), 6);
  assert.equal(refineStage(490), 7);
  assert.equal(refineSpeedMul(0), 0.92);
  assert.equal(refineSpeedMul(3), 0.55);
  assert.equal(refineSpeedMul(6), 0);
  assert.equal(refineAllowsSprint(2), true);
  assert.equal(refineAllowsSprint(3), false);
  assert.equal(refineJumpMul(2), 0.65);
  assert.equal(refineJumpMul(4), 0);
  assert.equal(refineStickSec(0), 0.12);
  assert.equal(refineStickSec(6), 0.4);
});

test("white pill pauses and blue pill rewinds", () => {
  var run = createC1166Run({ rng: function () { return 0; } });
  run.tick(80, {});
  assert.equal(run.hudText().indexOf("鞋底磨穿") >= 0, true);
  var white = applyPill(C1166_PILL_WHITE, function () { return 0; });
  run.addHold(white.pause);
  run.tick(69, {});
  assert.equal(run.elapsedSec(), 80);
  run.tick(2, {});
  assert.equal(run.elapsedSec(), 81);
  run.rewind(applyPill(C1166_PILL_BLUE, function () { return 0; }).rewind);
  assert.equal(run.elapsedSec(), 11);
  assert.equal(run.hudText().indexOf("发粘") >= 0, true);
});

test("palace change keeps progress by death-clock ratio", () => {
  assert.equal(convertElapsed(100, 490, 980), 200);
  var run = createC1166Run({ rng: function () { return 1; } });
  run.tick(100, {});
  run.enter("zhen");
  assert.ok(Math.abs(run.elapsedSec() - 200) < 0.001);
});

test("qian chance survives a trip back to xun", () => {
  var run = createC1166Run({ rng: function () { return 0.5; } });
  run.enter("qian");
  run.tick(5, {});
  var stayed = run.qianSeconds();
  assert.equal(stayed, 5);
  run.enter("xun");
  run.enter("qian");
  assert.equal(run.qianSeconds(), stayed);
  assert.equal(run.elapsedSec(), 0);
});

test("qian roll sends the player to dui", () => {
  var run = createC1166Run({ rng: function () { return 0; } });
  run.enter("qian");
  var events = run.tick(5, {});
  assert.equal(events.some(function (ev) { return ev.type === "goto" && ev.palace === "dui"; }), true);
});

test("li snapshot restores on a finished bridge and kills when time runs out", () => {
  var run = createC1166Run({ rng: function () { return 1; } });
  run.tick(50, {});
  run.enter("li", { hp: 40, sanity: 80, stamina: 70 });
  assert.equal(run.tick(89, {}).length, 0);
  var snap = run.finishLi();
  assert.equal(snap.hp, 40);
  assert.equal(run.palaceId(), "zhong");
  assert.equal(run.elapsedSec(), 50);

  var doomed = createC1166Run({ rng: function () { return 1; } });
  doomed.enter("li", { hp: 10, sanity: 10, stamina: 10 });
  var died = doomed.tick(90, {});
  assert.equal(died[0].reason, "li");
  assert.equal(doomed.finishLi(), null);
});

test("xun melts only while 49 people stay", () => {
  var run = createC1166Run({ rng: function () { return 1; } });
  run.enter("xun");
  run.tick(20, { headcount: 49 });
  run.tick(40, { headcount: 1 });
  assert.equal(run.isDead(), false);
  var melted = run.tick(49, { headcount: 49 });
  assert.equal(melted[0].reason, "xun");
});

test("gong teleports on the third hit inside 2 meters", () => {
  var run = createC1166Run({ rng: function () { return 1; } });
  run.enter("zhen");
  assert.equal(run.strikeGong(1).counted, true);
  assert.equal(run.strikeGong(1).counted, false);
  run.tick(10, {});
  assert.equal(run.strikeGong(1).teleport, false);
  run.tick(10, {});
  assert.equal(run.strikeGong(1).teleport, true);
});

test("kun floor only opens inside the ring", () => {
  var run = createC1166Run({ rng: function () { return 1; } });
  run.enter("kun");
  assert.equal(run.tryKunFloor(false).ok, false);
  assert.equal(run.tryKunFloor(true).palace, "zhen");
});

test("pill table and bound ids", () => {
  assert.equal(rollSpiritPill("kan", function () { return 0.95; }), C1166_PILL_BLUE);
  assert.equal(rollSpiritPill("zhen", function () { return 0.5; }), C1166_PILL_ORANGE);
  assert.equal(applyPill(C1166_PILL_ORANGE, function () { return 0; }).kill, true);
  assert.equal(applyPill(C1166_PILL_CENTER, function () { return 0.1; }).toast, "金丹入腹");
  assert.equal(applyPill(C1166_PILL_BLACK, function () { return 0.9; }).damage, 40);
  var bag = {};
  C1166_BOUND_IDS.forEach(function (id) { bag[id] = 1; });
  var removed = stripBoundItems(function (id) {
    if (!bag[id]) return false;
    bag[id] = 0;
    return true;
  });
  assert.equal(removed, C1166_BOUND_IDS.length);
  assert.equal(stripBoundItems(function () { return false; }), 0);
});

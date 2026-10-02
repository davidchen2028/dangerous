import assert from "node:assert/strict";
import test from "node:test";

import {
  L0_LEFT_KEY,
  createLevel0ExitClock,
  firstVisitPoiProfile,
  hasLeftLevel0Before,
  markLeftLevel0,
  boostedPoiProfile,
  revisitPoiProfile,
  rollFirstVisitAutoMs,
  rollRevisitAutoMs,
  rollRevisitBoostMs,
  rollSubzoneGraceMs,
} from "./backrooms-level0-exit-clock.js";

function memoryStorage(start) {
  var data = Object.assign({}, start || {});
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
  };
}

test("first visit auto-clip is 30–60s and starts boosted", () => {
  const clock = createLevel0ExitClock({
    firstVisit: true,
    random: function () {
      return 0;
    },
  });
  assert.equal(clock.firstVisit, true);
  assert.equal(clock.isBoosted(), true);
  assert.equal(clock.getAutoAtMs(), 30000);
  assert.equal(clock.tick(29999).shouldAutoClip, false);
  assert.equal(clock.tick(2).shouldAutoClip, true);
});

test("revisit boosts at 2–3 min and auto-clips at 4–5 min", () => {
  const clock = createLevel0ExitClock({
    firstVisit: false,
    random: function () {
      return 0;
    },
  });
  assert.equal(clock.firstVisit, false);
  assert.equal(clock.getBoostAtMs(), 120000);
  assert.equal(clock.getAutoAtMs(), 240000);
  assert.equal(clock.tick(119999).justBoosted, false);
  assert.equal(clock.isBoosted(), false);
  const boost = clock.tick(2);
  assert.equal(boost.justBoosted, true);
  assert.equal(boost.boosted, true);
  assert.equal(clock.tick(120000).shouldAutoClip, true);
});

test("pause without grace does not extend the auto-clip deadline", () => {
  const clock = createLevel0ExitClock({
    firstVisit: false,
    random: function () {
      return 0;
    },
  });
  clock.tick(1000);
  clock.setPaused(true, { grace: false });
  clock.tick(5000);
  clock.setPaused(false, { grace: false });
  assert.equal(clock.getAutoAtMs(), 240000);
  assert.equal(clock.getActiveMs(), 1000);
});

test("sub-level pause freezes the clock and adds 60–90s on return", () => {
  const clock = createLevel0ExitClock({
    firstVisit: false,
    random: function () {
      return 0;
    },
  });
  clock.tick(239000);
  clock.setPaused(true);
  assert.equal(clock.tick(80000).shouldAutoClip, false);
  assert.equal(clock.getActiveMs(), 239000);
  clock.setPaused(false);
  assert.equal(clock.getAutoAtMs(), 239000 + 60000);
  assert.equal(clock.tick(59999).shouldAutoClip, false);
  assert.equal(clock.tick(2).shouldAutoClip, true);
});

test("roll helpers stay in the requested windows", () => {
  assert.equal(rollFirstVisitAutoMs(function () { return 1; }), 60000);
  assert.equal(rollRevisitBoostMs(function () { return 1; }), 180000);
  assert.equal(rollRevisitAutoMs(function () { return 1; }), 300000);
  assert.equal(rollSubzoneGraceMs(function () { return 1; }), 90000);
});

test("nudgeAuto postpones a due auto-clip without resetting active time", () => {
  const clock = createLevel0ExitClock({
    firstVisit: true,
    random: function () {
      return 0;
    },
  });
  clock.tick(30000);
  assert.equal(clock.tick(0).shouldAutoClip, true);
  clock.nudgeAuto(8000);
  assert.equal(clock.tick(0).shouldAutoClip, false);
  assert.equal(clock.getActiveMs(), 30000);
  assert.equal(clock.tick(8000).shouldAutoClip, true);
});

test("left-L0 flag and poi profiles split first visit from revisits", () => {
  const store = memoryStorage();
  assert.equal(hasLeftLevel0Before(store), false);
  markLeftLevel0(store);
  assert.equal(store.getItem(L0_LEFT_KEY), "1");
  assert.equal(hasLeftLevel0Before(store), true);
  const first = firstVisitPoiProfile();
  const revisit = revisitPoiProfile();
  const boosted = boostedPoiProfile();
  assert.equal(first.rareEnabled, false);
  assert.ok(first.clipChance > revisit.clipChance);
  assert.ok(first.clipMinDistance < revisit.clipMinDistance);
  assert.ok(first.manilaMinDistance < 168);
  assert.ok(first.manilaChance > 0.0025);
  assert.equal(revisit.rareEnabled, true);
  assert.equal(boosted.clipGuarantee, true);
  assert.ok(boosted.clipChance > revisit.clipChance);
});

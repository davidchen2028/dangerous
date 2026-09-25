import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  C1623_LOOK_UP,
  C1623_MAX,
  C1623_MIN,
  formatPrs,
  getC1623Segment,
  isC1623LookUp,
  listC1623OpenPasses,
  stepC1623Segment,
} from "./backrooms-level-c1623-layout.js";

const ROOT = resolve(import.meta.dirname, "..");
const MADE = new Set(["l0", "l2", "l6", "l8", "l9", "l10", "l11", "l13", "l21", "l46", "l75", "hub"]);

test("C-1623 walkable range is PRS−40 to +40 with no far shortcuts", () => {
  assert.equal(C1623_MIN, -40);
  assert.equal(C1623_MAX, 40);
  assert.equal(formatPrs(0), "PRS±0");
  assert.equal(formatPrs(5), "PRS+5");
  assert.equal(formatPrs(-11), "PRS-11");
  assert.equal(stepC1623Segment(40, 1).blocked, true);
  assert.equal(stepC1623Segment(-40, -1).blocked, true);
  assert.equal(stepC1623Segment(0, 1).index, 1);
  assert.equal(getC1623Segment(172).index, 40);
  assert.equal(getC1623Segment(-95).index, -40);
});

test("C-1623 open doors only point at already-made pages", () => {
  const open = listC1623OpenPasses();
  assert.deepEqual(
    open.map((d) => d.pass).sort(),
    ["hub", "l0", "l10", "l11", "l13", "l2", "l21", "l46", "l6", "l75", "l8", "l9"]
  );
  for (const door of open) {
    assert.equal(MADE.has(door.pass), true, door.pass);
    assert.equal(existsSync(resolve(ROOT, door.page)), true, door.page);
  }
});

test("C-1623 keeps locked wiki exits and empty 无数据 segments", () => {
  assert.equal(getC1623Segment(0).flavor, "prismriver");
  assert.equal(getC1623Segment(0).doors[0].open, false);
  assert.equal(getC1623Segment(0).doors[0].label, "Level C-211");
  assert.equal(getC1623Segment(5).doors[0].pass, "l0");
  assert.equal(getC1623Segment(13).doors.length, 2);
  assert.equal(getC1623Segment(13).doors[0].open, true);
  assert.equal(getC1623Segment(13).doors[1].open, false);
  assert.equal(getC1623Segment(-27).flavor, "fire");
  assert.equal(getC1623Segment(-27).doors.length, 0);
  assert.equal(getC1623Segment(2).doors.length, 0);
  assert.equal(getC1623Segment(39).flavor, "sealed");
});

test("C-1623 look-up threshold is a high pitch, not a void-wall volume", () => {
  assert.equal(C1623_LOOK_UP, 0.88);
  assert.equal(isC1623LookUp(0.87), false);
  assert.equal(isC1623LookUp(0.88), true);
  assert.equal(isC1623LookUp(1.05), true);
  assert.equal(isC1623LookUp(-1.2), false);
});

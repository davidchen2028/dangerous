import assert from "node:assert/strict";
import test from "node:test";

import {
  aabbXZ,
  aabbXZOverlap,
  isLevel81SitZone,
  L81_IMAGINARY,
  L81_IMAGINARY_PICK,
  L81_IMAGINARY_STAND,
  L81_REST_SEC,
  L81_SPAWN,
  L81_WINDOW_PICK,
} from "./backrooms-level81-layout.js";

test("Level 81 sit zone is the central blankets", () => {
  assert.equal(isLevel81SitZone(0, 0), true);
  assert.equal(isLevel81SitZone(0.4, -0.3), true);
  assert.equal(isLevel81SitZone(L81_SPAWN.x, L81_SPAWN.z), false);
  assert.equal(isLevel81SitZone(3, 3), false);
  assert.ok(L81_REST_SEC >= 18);
});

test("Level 81 imaginary i stands at the rain window, not on the blankets", () => {
  assert.equal(isLevel81SitZone(L81_IMAGINARY.x, L81_IMAGINARY.z), false);
  assert.equal(isLevel81SitZone(L81_IMAGINARY_STAND.x, L81_IMAGINARY_STAND.z), false);
  assert.ok(L81_IMAGINARY.z < -5.5);
  assert.ok(L81_IMAGINARY_STAND.z > L81_IMAGINARY.z);
});

test("Level 81 imaginary pick sits in front of the rain window, not inside it", () => {
  const windowBox = aabbXZ(L81_WINDOW_PICK.x, L81_WINDOW_PICK.z, L81_WINDOW_PICK.w, L81_WINDOW_PICK.d);
  const imagBox = aabbXZ(L81_IMAGINARY_PICK.x, L81_IMAGINARY_PICK.z, L81_IMAGINARY_PICK.w, L81_IMAGINARY_PICK.d);
  assert.equal(aabbXZOverlap(windowBox, imagBox), false);
  assert.ok(L81_IMAGINARY_PICK.z > L81_WINDOW_PICK.z);
  assert.ok(L81_IMAGINARY_PICK.x > windowBox.maxX - 0.16);
});

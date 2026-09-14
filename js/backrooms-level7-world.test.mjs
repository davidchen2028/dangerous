import assert from "node:assert/strict";
import test from "node:test";

import { PLATFORM_HALF, isOnLevel7Platform } from "./backrooms-level7-layout.js";

test("the 7x7 deck counts as the walkable platform", () => {
  assert.equal(isOnLevel7Platform(0, 0, 0.34), true);
  assert.equal(isOnLevel7Platform(1.4, 1.2, 0.34), true);
  assert.equal(isOnLevel7Platform(PLATFORM_HALF, 0, 0.34), false);
  assert.equal(isOnLevel7Platform(0, -4.2, 0.34), false);
});

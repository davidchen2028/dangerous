import assert from "node:assert/strict";
import test from "node:test";

import { isLevel81SitZone, L81_REST_SEC, L81_SPAWN } from "./backrooms-level81-layout.js";

test("Level 81 sit zone is the central blankets", () => {
  assert.equal(isLevel81SitZone(0, 0), true);
  assert.equal(isLevel81SitZone(0.4, -0.3), true);
  assert.equal(isLevel81SitZone(L81_SPAWN.x, L81_SPAWN.z), false);
  assert.equal(isLevel81SitZone(3, 3), false);
  assert.ok(L81_REST_SEC >= 18);
});

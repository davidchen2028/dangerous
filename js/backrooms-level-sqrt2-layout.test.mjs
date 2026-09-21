import assert from "node:assert/strict";
import test from "node:test";

import {
  SQRT2_SPAWN,
  isInsideSqrt2Ring,
  sqrt2DoorPosFromNode,
  sqrt2NodeHome,
  dist2,
} from "./backrooms-level-sqrt2-layout.js";

test("Level √2 keeps the spawn inside the fiber ring and a yellow node at origin", () => {
  assert.equal(isInsideSqrt2Ring(SQRT2_SPAWN.x, SQRT2_SPAWN.z), true);
  assert.equal(isInsideSqrt2Ring(40, 40), false);
  var origin = sqrt2NodeHome(0);
  assert.equal(origin.x, 0);
  assert.equal(origin.z, 0);
  var outer = sqrt2NodeHome(13);
  assert.ok(dist2(outer.x, outer.z, 0, 0) > 40);
  var door = sqrt2DoorPosFromNode(outer);
  assert.ok(dist2(door.x, door.z, SQRT2_SPAWN.x, SQRT2_SPAWN.z) > 1.05 * 1.05);
  assert.ok(dist2(door.x, door.z, 0, 0) < dist2(outer.x, outer.z, 0, 0));
});

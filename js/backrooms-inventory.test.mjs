import assert from "node:assert/strict";
import test from "node:test";

import { isRetiredBackroomsItemId } from "./backrooms-inventory.js";

test("retired placeholder items cannot re-enter the backrooms inventory", () => {
  for (const id of [
    "bandage",
    "industrial_supplies",
    "circuit",
    "alloy_plate",
    "roulette_revolver",
    "package_l159",
    "mechanism_room_pass",
    "stasis_room_pass",
  ]) {
    assert.equal(isRetiredBackroomsItemId(id), true, id);
  }
  assert.equal(isRetiredBackroomsItemId("almond_water"), false);
  assert.equal(isRetiredBackroomsItemId("fire_salt"), false);
});

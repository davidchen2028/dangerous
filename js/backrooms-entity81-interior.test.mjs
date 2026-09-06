import test from "node:test";
import assert from "node:assert/strict";
import { pickEntity81Buttons } from "./backrooms-entity81-catalog.js";
import { buildEntity81Interior, resolveEntity81CabinCircle } from "./backrooms-entity81-interior.js";

test("cabin batches buttons and keeps the player inside the car", () => {
  const buttons = pickEntity81Buttons("l4", 12);
  const world = buildEntity81Interior(buttons, "luxury");
  assert.ok(world.interactRoots.length >= buttons.length + 2);
  const kinds = world.interactRoots.map((m) => m.userData.brInteract.kind);
  assert.ok(kinds.includes("e81_button"));
  assert.ok(kinds.includes("e81_door"));
  const pushed = resolveEntity81CabinCircle(40, 40, 0.28);
  assert.ok(Math.abs(pushed.x) < 2);
  assert.ok(Math.abs(pushed.z) < 2);
});

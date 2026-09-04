import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartLevel3Elevator,
  createLevel3TapInteraction,
  getLevel3ElevatorRiseAction,
} from "./backrooms-level3-transition.js";

test("dead players cancel an active elevator transition", () => {
  assert.equal(getLevel3ElevatorRiseAction(true, true, 0.4), "cancel");
  assert.equal(getLevel3ElevatorRiseAction(true, true, 1), "cancel");
  assert.equal(getLevel3ElevatorRiseAction(true, false, 1), "complete");
});

test("transition lock and survival state gate elevator startup", () => {
  const ready = {
    transitionLock: false,
    elevatorRising: false,
    inventoryOpen: false,
    dead: false,
    near: true,
  };
  assert.equal(canStartLevel3Elevator(ready), true);
  assert.equal(canStartLevel3Elevator({ ...ready, transitionLock: true }), false);
  assert.equal(canStartLevel3Elevator({ ...ready, dead: true }), false);
  assert.equal(canStartLevel3Elevator({ ...ready, near: false }), false);
});

test("mobile tap is wired to the same elevator function", () => {
  const tryStart = () => {};
  const bindings = createLevel3TapInteraction(tryStart);
  assert.equal(bindings.onTapInteract, tryStart);
});

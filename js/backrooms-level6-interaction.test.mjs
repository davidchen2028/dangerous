import test from "node:test";
import assert from "node:assert/strict";
import {
  canCompleteLevel6Transition,
  chooseLevel6Interaction,
  getLevel6InteractionLabel,
  shouldTriggerLevel6Wire,
} from "./backrooms-level6-interaction.js";

const alive = { dead: false };

test("Level 6 interactions map only to valid implemented actions", () => {
  const opts = { survival: alive, transitionLock: false, uiBlocked: false };
  assert.equal(chooseLevel6Interaction("l6_exit_l5", opts), "exit_l5");
  assert.equal(chooseLevel6Interaction("l6_exit_l7", opts), "exit_l7");
  assert.equal(chooseLevel6Interaction("l6_dead_switch", opts), "dead_switch");
  assert.equal(chooseLevel6Interaction("l6_iron_door_129", opts), "iron_door");
  assert.equal(chooseLevel6Interaction("l6_exit_c1290", opts), null);
  assert.match(getLevel6InteractionLabel("l6_iron_door_129"), /巨大铁门/);
});

test("death, transition lock, and open UI block every action", () => {
  assert.equal(canCompleteLevel6Transition(alive, false, false), true);
  assert.equal(canCompleteLevel6Transition({ dead: true }, false, false), false);
  assert.equal(canCompleteLevel6Transition(alive, true, false), false);
  assert.equal(canCompleteLevel6Transition(alive, false, true), false);
  assert.equal(chooseLevel6Interaction("l6_exit_l7", {
    survival: alive,
    transitionLock: false,
    uiBlocked: true,
  }), null);
});

test("trip wire triggers once by proximity", () => {
  const layout = {};
  const near = () => true;
  assert.equal(shouldTriggerLevel6Wire(layout, { wireTriggered: false }, 0, 0, near), true);
  assert.equal(shouldTriggerLevel6Wire(layout, { wireTriggered: true }, 0, 0, near), false);
  assert.equal(shouldTriggerLevel6Wire(layout, { wireTriggered: false }, 0, 0, () => false), false);
});

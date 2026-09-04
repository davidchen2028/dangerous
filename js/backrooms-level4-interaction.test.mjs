import test from "node:test";
import assert from "node:assert/strict";
import {
  canCompleteLevel4Transition,
  chooseLevel4Interaction,
  isPlayerNearLevel4FalseWindow,
} from "./backrooms-level4-interaction.js";

test("smart tap routes exits, NPCs, and task board through one dispatcher", () => {
  assert.equal(chooseLevel4Interaction("l4_elevator_l3", "smart"), "exit_l3");
  assert.equal(chooseLevel4Interaction("l4_stairs_down", "smart"), "exit_l5");
  assert.equal(chooseLevel4Interaction("l4_meg_member", "smart"), "meg");
  assert.equal(chooseLevel4Interaction("l4_task_board", "smart"), "task_board");
});

test("smart cooler interaction prioritizes active inspection", () => {
  assert.equal(
    chooseLevel4Interaction("l4_water_cooler", "smart", {
      inspectTask: true,
      inspected: false,
    }),
    "inspect_cooler"
  );
  assert.equal(
    chooseLevel4Interaction("l4_water_cooler", "smart", {
      inspectTask: true,
      inspected: true,
    }),
    "water"
  );
  assert.equal(
    chooseLevel4Interaction("l4_water_cooler", "secondary"),
    "inspect_cooler"
  );
});

test("dead players cannot complete a Level 4 transition", () => {
  assert.equal(canCompleteLevel4Transition({ dead: false }), true);
  assert.equal(canCompleteLevel4Transition({ dead: true }), false);
  assert.equal(canCompleteLevel4Transition(null), false);
});

test("false windows hurt by proximity, not by selecting their interaction", () => {
  const windowData = {
    kind: "l4_false_window",
    x: 24,
    z: 12,
    along: true,
  };
  assert.equal(chooseLevel4Interaction("l4_false_window", "smart"), "false_window");
  assert.equal(isPlayerNearLevel4FalseWindow(24, 12.7, windowData), true);
  assert.equal(isPlayerNearLevel4FalseWindow(24, 14, windowData), false);
  assert.equal(isPlayerNearLevel4FalseWindow(40, 12.2, windowData), false);
});

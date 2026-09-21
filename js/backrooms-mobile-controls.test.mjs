import assert from "node:assert/strict";
import test from "node:test";

import {
  isPortraitViewport,
  parseMobileActions,
  stickToMoveKeys,
} from "./backrooms-mobile-controls.js";
import {
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  mergeBackroomsMoveInput,
} from "./backrooms-fps-controller.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("mobile orientation guard blocks only portrait viewports", () => {
  assert.equal(isPortraitViewport(390, 844), true);
  assert.equal(isPortraitViewport(844, 390), false);
  assert.equal(isPortraitViewport(600, 600), false);
  assert.equal(isPortraitViewport("bad", 844), false);
});

test("mobile actions split simultaneous Q and E prompts in display order", () => {
  assert.deepEqual(
    parseMobileActions("前哨人事员 · 按 Q 办理编制 · 按 E 阅读编制介绍"),
    [
      { key: "Q", code: "KeyQ", label: "办理编制", hold: false },
      { key: "E", code: "KeyE", label: "阅读编制介绍", hold: false },
    ]
  );
});

test("mobile actions preserve hold input for revive", () => {
  assert.deepEqual(parseMobileActions("按住 E 救援 流浪者"), [
    { key: "E", code: "KeyE", label: "救援 流浪者", hold: true },
  ]);
});

test("mobile actions ignore non-interaction HUD text", () => {
  assert.deepEqual(parseMobileActions("新人保护 42s"), []);
});

test("mobile stick maps analog up to walk/sprint keys", () => {
  assert.deepEqual(stickToMoveKeys(0, 0), {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ShiftLeft: false,
  });
  assert.equal(stickToMoveKeys(0, 0.4).KeyW, true);
  assert.equal(stickToMoveKeys(0, 0.4).ShiftLeft, false);
  assert.equal(stickToMoveKeys(0, 0.8).ShiftLeft, true);
  assert.equal(stickToMoveKeys(-0.7, 0.2).KeyA, true);
  assert.equal(stickToMoveKeys(0.7, -0.4).KeyD, true);
  assert.equal(stickToMoveKeys(0.7, -0.4).KeyS, true);
});

test("FPS movement merges analog stick without trusting synthetic key events", () => {
  const prev = globalThis.window;
  globalThis.window = {
    BackroomsMobileControls: {
      getMove: function () {
        return { KeyW: true, KeyS: false, KeyA: false, KeyD: true, ShiftLeft: true };
      },
    },
  };
  try {
    const merged = mergeBackroomsMoveInput({
      forward: false,
      back: false,
      left: false,
      right: false,
    });
    assert.equal(merged.forward, true);
    assert.equal(merged.right, true);
    assert.equal(merged.back, false);
    assert.equal(
      isBackroomsPlayerMoving({
        move: { forward: false, back: false, left: false, right: false },
      }),
      true
    );
    assert.equal(isBackroomsSprintHeld({ keys: {} }), true);
    assert.equal(
      isBackroomsPlayerMoving({
        move: { forward: false, back: false, left: false, right: false },
        skipStickMerge: true,
      }),
      false
    );
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
});

test("Backrooms stick tracks the finger on window, above rain overlays", () => {
  const src = readFileSync(resolve(import.meta.dirname, "backrooms-mobile-controls.js"), "utf8");
  const css = readFileSync(resolve(import.meta.dirname, "../css/backrooms-survival.css"), "utf8");
  assert.match(src, /window\.addEventListener\(\s*"pointermove"/);
  assert.match(src, /getMove: getMobileStickMove/);
  assert.match(css, /\.br-mobile-stick \{[\s\S]*z-index: 40;/);
  assert.match(css, /\.br-mobile-jump \{[\s\S]*z-index: 40;/);
});

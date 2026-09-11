import assert from "node:assert/strict";
import test from "node:test";

import {
  isPortraitViewport,
  parseMobileActions,
} from "./backrooms-mobile-controls.js";

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

test("mobile actions use the preceding label when the key is at the end", () => {
  assert.deepEqual(parseMobileActions("关闭病房门 · 按 Q"), [
    { key: "Q", code: "KeyQ", label: "关闭病房门", hold: false },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  levelKeyFromPath,
  pageFileFromPath,
} from "./backrooms-world-level.js";

test("maps L1 page to clip pass key", () => {
  assert.equal(pageFileFromPath("/backrooms-level1.html"), "backrooms-level1.html");
  assert.equal(levelKeyFromPath("/foo/backrooms-level1.html"), "clip");
});

test("maps numbered and C-level pages", () => {
  assert.equal(levelKeyFromPath("backrooms-level4.html"), "l4");
  assert.equal(levelKeyFromPath("/backrooms-level-c1289.html?x=1"), "c1289");
  assert.equal(levelKeyFromPath("/backrooms-entity81.html"), "e81");
  assert.equal(levelKeyFromPath("/backrooms-hub.html"), "hub");
});

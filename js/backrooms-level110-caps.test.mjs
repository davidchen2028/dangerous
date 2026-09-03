import test from "node:test";
import assert from "node:assert/strict";
import {
  applyL110HalfCaps,
  getL110CapMul,
  hasL110HalfCaps,
  L110_HALF_CAPS_KEY,
} from "./backrooms-level110-caps.js";

function mockStorage() {
  const map = new Map();
  globalThis.sessionStorage = {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test("L110 half-caps flag halves max mul and clamps vitals", () => {
  mockStorage();
  assert.equal(hasL110HalfCaps(), false);
  assert.equal(getL110CapMul(), 1);

  const survival = { hp: 90, sanity: 80, stamina: 70, refreshHud() {} };
  applyL110HalfCaps(
    survival,
    () => Math.floor(100 * getL110CapMul()),
    () => Math.floor(100 * getL110CapMul()),
    () => Math.floor(100 * getL110CapMul())
  );

  assert.equal(sessionStorage.getItem(L110_HALF_CAPS_KEY), "1");
  assert.equal(getL110CapMul(), 0.5);
  assert.equal(survival.hp, 50);
  assert.equal(survival.sanity, 50);
  assert.equal(survival.stamina, 50);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveLevel4ChunkLayout,
  deriveLevel4EntitySpecs,
} from "../js/backrooms-level4-layout.js";

test("Level 4 layout is deterministic and mostly empty", () => {
  let occupied = 0;
  let total = 0;
  for (let cx = -8; cx <= 8; cx += 1) {
    for (let cz = -8; cz <= 8; cz += 1) {
      const a = deriveLevel4ChunkLayout(cx, cz, 443);
      const b = deriveLevel4ChunkLayout(cx, cz, 443);
      assert.deepEqual(a, b);
      occupied += a.desks.filter(Boolean).length;
      total += a.desks.length;
    }
  }
  const ratio = occupied / total;
  assert.ok(ratio >= 0.2 && ratio <= 0.36, `desk ratio ${ratio}`);
});

test("Omega and spawn neighborhoods never produce hostile entities", () => {
  for (let cx = -1; cx <= 2; cx += 1) {
    for (let cz = -1; cz <= 1; cz += 1) {
      assert.deepEqual(deriveLevel4EntitySpecs(cx, cz, 88, 24), []);
    }
  }
});

test("rare entities and false windows are deterministic but uncommon", () => {
  let entities = 0;
  let traps = 0;
  let windowWalls = 0;
  for (let cx = -20; cx <= 20; cx += 1) {
    for (let cz = -20; cz <= 20; cz += 1) {
      entities += deriveLevel4EntitySpecs(cx, cz, 991, 24).length;
      const layout = deriveLevel4ChunkLayout(cx, cz, 991);
      traps += Number(layout.westWindowTrap) + Number(layout.northWindowTrap);
      windowWalls += Number(layout.westWindows) + Number(layout.northWindows);
    }
  }
  assert.ok(entities > 20 && entities < 150);
  assert.ok(traps > 5 && traps / windowWalls < 0.08);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  L6_MAZE_H,
  L6_MAZE_W,
  generateLevel6Layout,
  getLevel6PathProgress,
  isNearLevel6Feature,
  level6CellToWorld,
  resolveCircleAgainstLevel6Maze,
} from "./backrooms-level6-layout.js";

test("Level 6 layout is deterministic and fully connected", () => {
  const a = generateLevel6Layout(60123);
  const b = generateLevel6Layout(60123);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.features, b.features);
  const openCount = a.grid.flat().filter((v) => v === 0).length;
  assert.equal(a.openCells.length, openCount);
  assert.ok(openCount > 350);
});

test("features are distinct, reachable, and the Level 7 stair is remote", () => {
  const layout = generateLevel6Layout(77);
  const seen = new Set();
  for (const [name, cell] of Object.entries(layout.features)) {
    assert.equal(layout.grid[cell.z][cell.x], 0, name + " must occupy an open cell");
    const key = cell.x + ":" + cell.z;
    if (name !== "l5Door") assert.ok(!seen.has(key), name + " overlaps another feature");
    seen.add(key);
  }
  const stair = layout.features.l7Stair;
  assert.equal(layout.distances[stair.z][stair.x], layout.maxDistance);
  assert.ok(layout.maxDistance > 80);
  assert.ok(layout.distances[layout.features.wire.z][layout.features.wire.x] > 20);
});

test("world conversion, progress, proximity and wall collision stay aligned", () => {
  const layout = generateLevel6Layout(9001);
  const stair = layout.features.l7Stair;
  const p = level6CellToWorld(layout, stair.x, stair.z);
  assert.equal(getLevel6PathProgress(layout, p.x, p.z), 1);
  assert.equal(isNearLevel6Feature(layout, "l7Stair", p.x, p.z, 0.1), true);

  const wall = (() => {
    for (let z = 0; z < L6_MAZE_H; z++) {
      for (let x = 0; x < L6_MAZE_W; x++) {
        if (layout.grid[z][x] === 1) return { x, z };
      }
    }
  })();
  assert.ok(wall);
  const wp = level6CellToWorld(layout, wall.x, wall.z);
  const out = resolveCircleAgainstLevel6Maze(wp.x, wp.z, 0.34, layout);
  assert.ok(out.x !== wp.x || out.z !== wp.z);
});

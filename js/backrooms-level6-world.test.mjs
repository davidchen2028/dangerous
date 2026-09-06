import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { generateLevel6Layout } from "./backrooms-level6-layout.js";
import { buildLevel6World } from "./backrooms-level6-world.js";

test("Level 6 world batches maze surfaces and exposes wiki interactions", () => {
  const layout = generateLevel6Layout(611);
  const world = buildLevel6World(layout);
  assert.ok(world.root instanceof THREE.Group);
  assert.ok(world.batchCounts.walls > 0);
  assert.equal(world.batchCounts.floors, layout.openCells.length);
  assert.equal(world.batchCounts.ceilings, layout.openCells.length);
  const kinds = world.interactRoots.map((mesh) => mesh.userData.brInteract.kind).sort();
  assert.deepEqual(kinds, [
    "l6_dead_switch",
    "l6_exit_l5",
    "l6_exit_l7",
    "l6_iron_door_129",
  ]);
  assert.ok(world.root.getObjectByName("L6TripWire"));
  assert.ok(world.root.getObjectByName("L6WallInstances").isInstancedMesh);
  world.dispose();
});

test("Level 6 feature models align with generated feature cells", () => {
  const layout = generateLevel6Layout(612);
  const world = buildLevel6World(layout);
  for (const name of Object.keys(layout.features)) {
    assert.ok(world.featurePositions[name], name);
  }
  const spawn = world.featurePositions.l5Door;
  assert.equal(spawn.x, 0);
  assert.equal(spawn.z, 0);
  world.dispose();
});

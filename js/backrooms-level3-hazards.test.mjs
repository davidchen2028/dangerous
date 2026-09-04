import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  BURST_DURATION_MS,
  PIPE_HAZARD_DAMAGE,
  createLevel3PipeHazards,
  updateLevel3PipeHazards,
} from "./backrooms-level3-hazards.js";

const slots = [
  { x: 1, y: 1.4, z: 2 },
  { x: 4, y: 1.5, z: 5 },
  { x: -2, y: 1.2, z: 8 },
];

test("hazard kind, phase, and first burst are deterministic by seed", () => {
  const a = createLevel3PipeHazards(slots, new THREE.Group(), 998, 1000);
  const b = createLevel3PipeHazards(slots, new THREE.Group(), 998, 1000);
  const c = createLevel3PipeHazards(slots, new THREE.Group(), 999, 1000);
  assert.deepEqual(
    a.map((hazard) => [hazard.kind, hazard.nextAt]),
    b.map((hazard) => [hazard.kind, hazard.nextAt])
  );
  assert.notDeepEqual(
    a.map((hazard) => [hazard.kind, hazard.nextAt]),
    c.map((hazard) => [hazard.kind, hazard.nextAt])
  );
});

test("burst callback fires once and damage is limited to once per burst", () => {
  const hazards = createLevel3PipeHazards(slots.slice(0, 1), null, 12, 0);
  const hazard = hazards[0];
  hazard.nextAt = 100;
  let bursts = 0;
  let damage = 0;
  const survival = {
    dead: false,
    takeDamage(value) {
      damage += value;
      return true;
    },
  };
  updateLevel3PipeHazards(survival, hazards, hazard.x, hazard.z, 100, {
    onBurst() {
      bursts += 1;
    },
  });
  updateLevel3PipeHazards(survival, hazards, hazard.x, hazard.z, 200);
  assert.equal(bursts, 1);
  assert.equal(damage, PIPE_HAZARD_DAMAGE);
  assert.equal(hazard.activeUntil, 100 + BURST_DURATION_MS);
});

test("null survival keeps burst simulation active without damage", () => {
  const hazards = createLevel3PipeHazards(slots.slice(0, 1), null, 12, 0);
  hazards[0].nextAt = 10;
  updateLevel3PipeHazards(null, hazards, slots[0].x, slots[0].z, 10);
  assert.ok(hazards[0].activeUntil > 10);
  assert.equal(hazards[0].hitThisBurst, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildLevel110World,
  L110_TUBE_LEN,
  L110_SPAWN,
} from "./backrooms-level110-world.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";

test("Level 110 world has black hole, accretion disk, and return device", () => {
  const root = new THREE.Group();
  const world = buildLevel110World(root);

  assert.ok(world.blackHole, "black hole mesh");
  assert.equal(world.blackHole.name, "L110BlackHole");
  assert.ok(world.accretionDisk, "accretion disk");
  assert.equal(world.accretionDisk.name, "L110AccretionDisk");
  assert.ok(world.returnDevice, "return device");
  assert.equal(world.returnDevice.name, "L110ReturnDevice");
  assert.ok(world.colliders.length > 8, "tube colliders");
  assert.equal(world.spawnX, L110_SPAWN.x);
  assert.equal(world.spawnZ, L110_SPAWN.z);
});

test("Level 110 has three zones along the playable tube", () => {
  const root = new THREE.Group();
  const world = buildLevel110World(root);
  const zones = world.zoneMarkers;

  assert.ok(zones.airlock.maxZ <= zones.ruins.minZ);
  assert.ok(zones.ruins.maxZ <= zones.observatory.minZ);
  assert.equal(zones.observatory.maxZ, L110_TUBE_LEN);
  assert.ok(L110_TUBE_LEN >= 160 && L110_TUBE_LEN <= 200);
});

test("ruptures expose warn / pull / kill radii", () => {
  const root = new THREE.Group();
  const world = buildLevel110World(root);
  assert.ok(world.ruptures.length >= 3);
  for (const r of world.ruptures) {
    assert.ok(r.warnR > r.pullR);
    assert.ok(r.pullR > r.killR);
    assert.ok(r.killR > 0);
  }
});

test("particle return and O2 refill interacts are aimable", () => {
  const root = new THREE.Group();
  const world = buildLevel110World(root);
  root.updateMatrixWorld(true);

  const actions = world.interactRoots.map((m) => m.userData.brInteract.action);
  assert.ok(actions.includes("refill_o2"));
  assert.ok(actions.includes("particle_return"));
  assert.ok(actions.includes("plasma_vent"));

  const ret = world.interactRoots.find((m) => m.userData.brInteract.action === "particle_return");
  const center = new THREE.Vector3();
  ret.getWorldPosition(center);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 100);
  camera.position.copy(center);
  camera.lookAt(center.x, center.y, center.z - 4);
  camera.updateMatrixWorld(true);

  const hit = pickCrosshairInteract(camera, [ret], 4.5, null);
  assert.ok(hit, "return device should remain interactable inside volume");
  assert.equal(hit.data.action, "particle_return");
});

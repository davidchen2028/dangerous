import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildLevelC2World } from "./backrooms-level-c2-world.js";

test("C-2 world exposes its canonical landmarks and no entities", () => {
  const root = new THREE.Group();
  const world = buildLevelC2World(root);
  const kinds = world.interactRoots.map((mesh) => mesh.userData.brInteract.kind);

  assert.ok(world.colliders.length > 0);
  assert.ok(
    world.colliders.some((entry) => entry.minZ <= -27 && entry.maxZ >= -27),
    "二维假景前必须有北侧边界，不能走出地板"
  );
  assert.ok(world.fakeSceneryMeshes.length >= 2);
  assert.deepEqual(
    new Set(kinds),
    new Set(["c2_phoropter", "c2_red_house", "c2_peephole"])
  );
  kinds.forEach((kind) => assert.match(kind, /^c2_/));
  assert.equal(root.getObjectByName("entity"), undefined);
});

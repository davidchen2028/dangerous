import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildLevelC21World,
  isOnRayComplexPath,
  C21_PATH_CENTERS,
} from "./backrooms-level-c2-1-world.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";

test("Ray Complex-2.1 contains exactly five mapped diffraction paths", () => {
  const root = new THREE.Group();
  const world = buildLevelC21World(root);
  const data = world.interactRoots.map((mesh) => mesh.userData.brInteract);

  assert.equal(data.length, 5);
  assert.deepEqual(data.map((entry) => entry.kind), [
    "c2_1_path_1",
    "c2_1_path_2",
    "c2_1_path_3",
    "c2_1_path_4",
    "c2_1_path_5",
  ]);
  assert.equal(data[0].action, "annihilate");
  assert.deepEqual(data.slice(1, 4).map((entry) => entry.dest), ["c666", "c5", "c33"]);
  assert.equal(data[4].dest, "c2");
  assert.equal(data[4].action, "return");
});

test("path boundary helper distinguishes light from void", () => {
  C21_PATH_CENTERS.forEach((x) => assert.equal(isOnRayComplexPath(x), true));
  assert.equal(isOnRayComplexPath(2.5), false);
  assert.equal(isOnRayComplexPath(20), false);
});

test("endpoint remains interactable after the player enters its trigger volume", () => {
  const root = new THREE.Group();
  const world = buildLevelC21World(root);
  root.updateMatrixWorld(true);
  const endpoint = world.interactRoots[4];
  const center = new THREE.Vector3();
  endpoint.getWorldPosition(center);
  const camera = new THREE.PerspectiveCamera(76, 16 / 9, 0.05, 100);
  camera.position.copy(center);
  camera.lookAt(center.x, center.y, center.z - 5);
  camera.updateMatrixWorld(true);

  const hit = pickCrosshairInteract(camera, [endpoint], 4.5, null);
  assert.ok(hit, "进入触发体后仍应能按 Q");
  assert.equal(hit.data.kind, "c2_1_path_5");
});

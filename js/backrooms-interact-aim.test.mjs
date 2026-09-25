/**
 *   node --import ./server/three-test-resolver.mjs --test js/backrooms-interact-aim.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { isInteractObjectShown, pickCrosshairInteract } from "./backrooms-interact-aim.js";

test("pickCrosshairInteract skips hidden ancestor groups", () => {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 40);
  camera.position.set(0, 1.6, 2);
  camera.lookAt(0, 1.6, 0);
  camera.updateMatrixWorld(true);

  const group = new THREE.Group();
  const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  pick.position.set(0, 1.6, 0);
  pick.userData.brInteract = { kind: "hidden_test" };
  group.add(pick);
  group.visible = false;
  group.updateMatrixWorld(true);

  assert.equal(isInteractObjectShown(pick), false);
  assert.equal(pickCrosshairInteract(camera, [pick], 4), null);

  group.visible = true;
  group.updateMatrixWorld(true);
  const shown = pickCrosshairInteract(camera, [pick], 4);
  assert.ok(shown);
  assert.equal(shown.data.kind, "hidden_test");
});

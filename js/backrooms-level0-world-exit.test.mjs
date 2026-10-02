/**
 *   node --import ./server/three-test-resolver.mjs --test js/backrooms-level0-world-exit.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createLevel0WorldManager } from "./backrooms-level0-world.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";

function interactKinds(world) {
  return world
    .getInteractMeshes()
    .filter(function (mesh) {
      return mesh.userData && mesh.userData.brInteract;
    })
    .map(function (mesh) {
      return mesh.userData.brInteract.kind;
    });
}

const CLOSED_ENTRANCES = [
  "red_door",
  "gray_door",
  "white_door",
  "level01_entrance",
  "level05_entrance",
  "level07_entrance",
  "blue_hole",
];

test("默认不刷 0 子层级入口，只留切出墙和马尼拉", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "no-sublevel-entrances",
    clipChance: 0.11,
    clipMinDistance: 28,
    clipGuarantee: true,
  });
  assert.equal(world.getExitPressure().sublevelEntrancesEnabled, false);
  assert.ok(world.getSpecialClipCenter(), "出生流送范围内应有切出墙");
  const clipBox = world.getColliders().find(function (c) {
    return c.special;
  });
  assert.ok(clipBox, "切出墙应有碰撞");
  assert.equal(clipBox.kind, "clip", "准星射线不应把切出墙碰撞盒当成普通墙");
  const clipPick = world.getInteractMeshes().find(function (mesh) {
    return mesh.name === "L0ClipPick";
  });
  assert.ok(clipPick, "切出墙走廊侧应有拾取盒");
  clipPick.updateWorldMatrix(true, true);
  const clipPos = new THREE.Vector3();
  clipPick.getWorldPosition(clipPos);
  const clipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    clipPick.getWorldQuaternion(new THREE.Quaternion())
  );
  const clipCam = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
  const clipSide = new THREE.Vector3(-clipForward.z, 0, clipForward.x);
  clipCam.position.set(
    clipPos.x + clipForward.x * 1.2 + clipSide.x * 0.65,
    1.5,
    clipPos.z + clipForward.z * 1.2 + clipSide.z * 0.65
  );
  clipCam.lookAt(clipPos.x, 1.2, clipPos.z);
  clipCam.updateMatrixWorld(true);
  const clipOrigin = clipCam.position.clone();
  const clipDir = clipPos.clone().sub(clipOrigin).normalize();
  const clipBlock = raycastWallBlockDistance(
    clipOrigin,
    clipDir,
    4.2,
    world.getColliders(),
    0,
    2.4
  );
  const clipHit = pickCrosshairInteract(clipCam, [clipPick], 4.2, clipBlock);
  assert.ok(
    clipHit && clipHit.data && clipHit.data.kind === "clip_wall",
    "斜对着切出墙时应能拾取"
  );
  const seen = new Set();
  for (var i = 0; i < 48; i++) {
    world.update(i * 24, ((i * 11) % 13) * 24, 1000 + i * 40);
    interactKinds(world).forEach(function (kind) {
      seen.add(kind);
    });
  }
  CLOSED_ENTRANCES.forEach(function (kind) {
    assert.equal(seen.has(kind), false, "不应刷入口 " + kind);
  });
  world.dispose();
});

test("切出墙卸载后仍能指路，且不会对空气切出", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "clip-hint-persist",
    clipChance: 0.11,
    clipMinDistance: 28,
    clipGuarantee: true,
  });
  const first = world.getSpecialClipCenter();
  assert.ok(first, "出生附近应有切出墙");
  world.update(240, 0, 2000);
  assert.equal(world.getSpecialClipCenter(), null, "走远后切出墙本体应卸载");
  const hint = world.getClipHintCenter();
  assert.ok(hint, "卸载后仍应记住出口方向");
  assert.equal(hint.x, first.x);
  assert.equal(hint.z, first.z);
  world.update(first.x, first.z, 3000);
  assert.ok(world.getSpecialClipCenter(), "走回原处应重新刷出同一面切出墙");
  world.dispose();
});

test("切出墙卸载后加压能在新区块补一口", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "clip-replace-after-unload",
    clipChance: 0.11,
    clipMinDistance: 28,
    clipGuarantee: true,
  });
  const first = world.getSpecialClipCenter();
  assert.ok(first);
  world.update(240, 0, 2000);
  assert.equal(world.getSpecialClipCenter(), null);
  world.setExitPressure({
    clipChance: 0.9,
    clipMinDistance: 24,
    clipGuarantee: true,
  });
  world.update(288, 0, 4000);
  const next = world.getSpecialClipCenter();
  assert.ok(next, "加压后新区块应补切出墙");
  assert.ok(
    Math.hypot(next.x - first.x, next.z - first.z) > 8,
    "补的应是新位置，不是已卸载的旧墙"
  );
  world.dispose();
});

test("马尼拉入口在墙面上，有碰撞且能被准星拾取", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "manila-wall-door",
    clipChance: 0,
    clipMinDistance: 999,
    manilaChance: 1,
    manilaMinDistance: 24,
  });
  const seen = new Set();
  for (var i = 0; i < 24; i++) {
    world.update(i * 24, 0, 1000 + i * 40);
    interactKinds(world).forEach(function (kind) {
      seen.add(kind);
    });
  }
  assert.equal(seen.has("manila_room"), true, "应刷出马尼拉门");
  const manilaBox = world.getColliders().find(function (c) {
    return c.poiKind === "manila";
  });
  assert.ok(manilaBox, "马尼拉门应挡住去路");
  assert.equal(manilaBox.kind, "manila", "准星射线不应把马尼拉碰撞盒当成普通墙");
  const manilaTrigger = world.getPoiTriggers().find(function (t) {
    return (t.kind || t.poiKind) === "manila";
  });
  assert.ok(manilaTrigger, "走廊侧应有马尼拉门口判定");
  const boxCx = (manilaBox.minX + manilaBox.maxX) * 0.5;
  const boxCz = (manilaBox.minZ + manilaBox.maxZ) * 0.5;
  const triCx = (manilaTrigger.minX + manilaTrigger.maxX) * 0.5;
  const triCz = (manilaTrigger.minZ + manilaTrigger.maxZ) * 0.5;
  const faceX = triCx - boxCx;
  const faceZ = triCz - boxCz;
  const standX = Math.abs(faceX) >= Math.abs(faceZ) ? boxCx + Math.sign(faceX) * 1.32 : triCx;
  const standZ = Math.abs(faceZ) > Math.abs(faceX) ? boxCz + Math.sign(faceZ) * 1.32 : triCz;
  assert.equal(
    standX >= manilaTrigger.minX &&
      standX <= manilaTrigger.maxX &&
      standZ >= manilaTrigger.minZ &&
      standZ <= manilaTrigger.maxZ,
    true,
    "贴着门站时应算找到出口，不能被保底切走"
  );

  const door = world
    .getInteractMeshes()
    .find(function (mesh) {
      return mesh.userData && mesh.userData.brInteract && mesh.userData.brInteract.kind === "manila_room";
    });
  assert.ok(door, "应有马尼拉交互物");
  door.updateWorldMatrix(true, true);
  const doorPos = new THREE.Vector3();
  door.getWorldPosition(doorPos);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(door.getWorldQuaternion(new THREE.Quaternion()));
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
  camera.position.set(
    doorPos.x + forward.x * 1.4,
    1.5,
    doorPos.z + forward.z * 1.4
  );
  camera.lookAt(doorPos.x, 1.2, doorPos.z);
  camera.updateMatrixWorld(true);
  const origin = camera.position.clone();
  const direction = doorPos.clone().sub(origin).setY(0);
  if (direction.lengthSq() < 0.0001) direction.set(forward.x, 0, forward.z);
  direction.normalize();
  const wallBlock = raycastWallBlockDistance(
    origin,
    direction,
    4.2,
    world.getColliders(),
    0,
    2.4
  );
  const hit = pickCrosshairInteract(camera, [door], 4.2, wallBlock);
  assert.ok(hit && hit.data && hit.data.kind === "manila_room", "正对门口时应能拾取马尼拉门");

  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  camera.position.set(
    doorPos.x + forward.x * 1.15 + side.x * 0.7,
    1.5,
    doorPos.z + forward.z * 1.15 + side.z * 0.7
  );
  camera.lookAt(doorPos.x, 1.2, doorPos.z);
  camera.updateMatrixWorld(true);
  const angledOrigin = camera.position.clone();
  const angledDir = doorPos.clone().sub(angledOrigin).normalize();
  const neighborWall = {
    minX: doorPos.x + side.x * 2 - 1,
    maxX: doorPos.x + side.x * 2 + 1,
    minZ: doorPos.z + side.z * 2 - 1,
    maxZ: doorPos.z + side.z * 2 + 1,
  };
  const angledBlock = raycastWallBlockDistance(
    angledOrigin,
    angledDir,
    4.2,
    world.getColliders().concat([neighborWall]),
    0,
    2.4
  );
  const angledHit = pickCrosshairInteract(camera, [door], 4.2, angledBlock);
  assert.ok(
    angledHit && angledHit.data && angledHit.data.kind === "manila_room",
    "斜对着门口时也不该被邻墙挡住"
  );
  world.dispose();
});

test("重访加压会在新区块刷出切出墙", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "revisit-boost-exit",
    rareEnabled: true,
    clipChance: 0.012,
    clipMinDistance: 96,
  });
  world.setExitPressure({
    clipChance: 0.9,
    clipMinDistance: 24,
    clipGuarantee: true,
    rareEnabled: true,
  });
  world.update(288, 0, 2000);
  assert.ok(world.getSpecialClipCenter(), "加压后走进新区块应刷出切出墙");
  assert.equal(world.getExitPressure().clipChance, 0.9);
  world.dispose();
});

test("切出墙和马尼拉门口不会把人拐到另一处", () => {
  const root = new THREE.Group();
  const world = createLevel0WorldManager(root, {
    sessionSeed: "no-loop-at-exits",
    clipChance: 0.9,
    clipMinDistance: 24,
    clipGuarantee: true,
    manilaChance: 1,
    manilaMinDistance: 24,
  });
  var clip = null;
  var manila = null;
  for (var i = 0; i < 32; i++) {
    world.update(i * 24, ((i * 7) % 11) * 24, 1000 + i * 80);
    clip = clip || world.getSpecialClipCenter();
    manila = manila || world.getPoiTriggers().find(function (t) {
      return (t.kind || t.poiKind) === "manila";
    });
  }
  assert.ok(clip, "应有切出墙");
  assert.ok(manila, "应有马尼拉门");
  world.update(clip.x, clip.z, 8000);
  world.update(manila.x, manila.z, 12000);
  var n;
  for (n = 0; n < 24; n++) {
    assert.equal(
      world.consumeLoopSuggestion(manila.x, manila.z, 0, 16000 + n * 4000),
      null,
      "站在马尼拉门口不应被拐走"
    );
    assert.equal(
      world.consumeLoopSuggestion(clip.x, clip.z, 0, 17000 + n * 4000),
      null,
      "站在切出墙前不应被拐走"
    );
  }
  world.dispose();
});

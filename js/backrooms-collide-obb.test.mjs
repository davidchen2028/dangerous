/**
 * 纯 Node 测试：backrooms-collide OBB 支持
 *
 * 运行：
 *   node --check js/backrooms-collide.js
 *   node js/backrooms-collide-obb.test.mjs
 */
import assert from "node:assert/strict";
import {
  createObbCollider,
  pushOutCircleAABB,
  pushOutCircleObb,
  circleOverlapsAabb,
  circleOverlapsAny,
  distancePointToAabb,
  distancePointToObb,
  resolveCircleAgainstColliders,
  raycastAabbDistance,
  raycastObbDistance,
  raycastWallBlockDistance,
  aabbCenter,
} from "./backrooms-collide.js";

var passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok -", name);
}

test("createObbCollider fills AABB bounds and caches basis", function () {
  var box = createObbCollider(10, 20, 2, 1, Math.PI / 4, { kind: "wall" });
  assert.equal(box.shape, "obb");
  assert.equal(box.cx, 10);
  assert.equal(box.cz, 20);
  assert.equal(box.halfX, 2);
  assert.equal(box.halfZ, 1);
  assert.equal(box.kind, "wall");
  assert.ok(Math.abs(box.cos - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(box.sin - Math.SQRT1_2) < 1e-10);
  var ext = 2 * Math.SQRT1_2 + 1 * Math.SQRT1_2;
  assert.ok(Math.abs(box.minX - (10 - ext)) < 1e-10);
  assert.ok(Math.abs(box.maxX - (10 + ext)) < 1e-10);
  assert.ok(Math.abs(box.minZ - (20 - ext)) < 1e-10);
  assert.ok(Math.abs(box.maxZ - (20 + ext)) < 1e-10);
  var c = aabbCenter(box);
  assert.equal(c.x, 10);
  assert.equal(c.z, 20);
});

test("AABB push-out / overlap / distance unchanged", function () {
  var aabb = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  assert.equal(distancePointToAabb(3, 0, aabb), 2);
  assert.equal(circleOverlapsAabb(0, 0, 0.5, aabb), true);
  assert.equal(circleOverlapsAabb(3, 0, 0.5, aabb), false);
  var out = pushOutCircleAABB(0.5, 0, 0.6, aabb);
  assert.ok(out.x > 0.5);
  assert.ok(Math.abs(out.z) < 1e-10);
  assert.ok(Math.abs(out.x - 1.6) < 1e-6);
});

test("rotation=0 OBB matches AABB for distance and overlap", function () {
  var aabb = { minX: -2, maxX: 2, minZ: -1, maxZ: 1 };
  var obb = createObbCollider(0, 0, 2, 1, 0);
  assert.ok(Math.abs(distancePointToAabb(3, 0, aabb) - distancePointToObb(3, 0, obb)) < 1e-10);
  assert.equal(circleOverlapsAabb(2.3, 0, 0.5, aabb), circleOverlapsAabb(2.3, 0, 0.5, obb));
  assert.equal(circleOverlapsAabb(3, 0, 0.5, aabb), circleOverlapsAabb(3, 0, 0.5, obb));
});

test("rotated OBB: point on diagonal axis uses local slab", function () {
  var obb = createObbCollider(0, 0, 1, 1, Math.PI / 4);
  var wx = 1.5 * Math.SQRT1_2;
  var wz = 1.5 * Math.SQRT1_2;
  assert.ok(Math.abs(distancePointToObb(wx, wz, obb) - 0.5) < 1e-8);
  assert.ok(
    distancePointToAabb(wx, wz, {
      minX: obb.minX,
      maxX: obb.maxX,
      minZ: obb.minZ,
      maxZ: obb.maxZ,
    }) < 0.5
  );
});

test("pushOutCircleObb ejects along local normal", function () {
  var obb = createObbCollider(0, 0, 2, 0.5, Math.PI / 2);
  var out = pushOutCircleObb(0, 0, 0.6, obb);
  var dist = Math.hypot(out.x, out.z);
  assert.ok(dist >= 0.5 + 0.6 - 1e-6);
  assert.equal(circleOverlapsAabb(out.x, out.z, 0.6, obb), false);
});

test("pushOutCircleAABB dispatches OBB", function () {
  var obb = createObbCollider(5, 5, 1, 1, 0.3);
  var a = pushOutCircleObb(5, 5, 0.5, obb);
  var ax = a.x;
  var az = a.z;
  var b = pushOutCircleAABB(5, 5, 0.5, obb);
  assert.ok(Math.abs(b.x - ax) < 1e-10);
  assert.ok(Math.abs(b.z - az) < 1e-10);
});

test("resolveCircleAgainstColliders handles mixed AABB+OBB", function () {
  var aabb = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, kind: "wall" };
  var obb = createObbCollider(4, 0, 1, 0.4, Math.PI / 6, { kind: "wall" });
  var r = resolveCircleAgainstColliders(0, 0, 0.5, [aabb, obb], 2, 8);
  assert.equal(circleOverlapsAny(r.x, r.z, 0.5, [aabb, obb]), false);
  var r2 = resolveCircleAgainstColliders(4, 0, 0.5, [aabb, obb], 2, 8);
  assert.equal(circleOverlapsAny(r2.x, r2.z, 0.5, [aabb, obb]), false);
});

test("raycastObbDistance reuses slab; rotation=0 matches AABB", function () {
  var obb = createObbCollider(0, 0, 1, 1, 0);
  var tAabb = raycastAabbDistance(0, 1, -5, 0, 0, 1, -1, 0, -1, 1, 2, 1, 20);
  var tObb = raycastObbDistance(0, 1, -5, 0, 0, 1, obb, 0, 2, 20);
  assert.ok(tAabb != null && tObb != null);
  assert.ok(Math.abs(tAabb - tObb) < 1e-10);
  assert.ok(Math.abs(tObb - 4) < 1e-8);
});

test("raycastWallBlockDistance sees rotated wall OBB", function () {
  var wall = createObbCollider(0, 2, 2, 0.1, Math.PI / 4, { kind: "wall" });
  var block = raycastWallBlockDistance(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    10,
    [wall],
    0,
    2
  );
  assert.ok(block < 10, "expected hit, got " + block);
  assert.ok(block > 1.5 && block < 3);

  var miss = raycastWallBlockDistance(
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    10,
    [wall],
    0,
    2
  );
  assert.ok(miss > 10);

  var aabbWall = { minX: -1, maxX: 1, minZ: 3, maxZ: 3.2, kind: "wall" };
  var b2 = raycastWallBlockDistance(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    10,
    [aabbWall],
    0,
    2
  );
  assert.ok(Math.abs(b2 - 3) < 1e-6);
});

test("ghost OBB skipped by resolve and raycast", function () {
  var ghost = createObbCollider(0, 0, 2, 2, 0.2, { ghost: true, kind: "wall" });
  var r = resolveCircleAgainstColliders(0, 0, 0.5, [ghost], 2, 4);
  assert.equal(r.x, 0);
  assert.equal(r.z, 0);
  var block = raycastWallBlockDistance(
    { x: -5, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    20,
    [ghost],
    0,
    2
  );
  assert.ok(block > 20);
});

console.log("\n" + passed + " tests passed");

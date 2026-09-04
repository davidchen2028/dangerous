import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const store = new Map([["backrooms_l4_layout_seed_v1", "4404"]]);
globalThis.sessionStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "",
      textBaseline: "",
      fillRect() {},
      strokeRect() {},
      fillText() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
    }),
  }),
};

const {
  L4_CHUNK_SIZE,
  L4_SPAWN_X,
  L4_SPAWN_Z,
  buildLevel4World,
} = await import("./backrooms-level4-world.js");
const { resolveCircleAgainstColliders } = await import("./backrooms-collide.js");

function kinds(world) {
  return new Set(
    world.interactRoots
      .map((root) => root.userData && root.userData.brInteract)
      .filter(Boolean)
      .map((data) => data.kind)
  );
}

test("spawn chunk exposes the three canonical exits and is walkable", () => {
  const root = new THREE.Group();
  const world = buildLevel4World(root, { shadows: false, pointLightBudget: 3 });
  const available = kinds(world);
  assert.ok(available.has("l4_elevator_l3"));
  assert.ok(available.has("l4_stairs_down"));
  assert.ok(available.has("l4_vending_l61"));
  const out = resolveCircleAgainstColliders(
    L4_SPAWN_X,
    L4_SPAWN_Z,
    0.32,
    world.colliders,
    16
  );
  assert.equal(out.x, L4_SPAWN_X);
  assert.equal(out.z, L4_SPAWN_Z);
  world.dispose();
});

test("Omega base and spawn chunks remain pinned while streaming stays bounded", () => {
  const root = new THREE.Group();
  const world = buildLevel4World(root, { shadows: false, pointLightBudget: 3 });
  for (let i = 1; i <= 18; i++) world.update(i * L4_CHUNK_SIZE * 2, 0);
  const keys = world.getLoadedChunkKeys();
  assert.ok(keys.includes("0,0"));
  assert.ok(keys.includes("1,0"));
  assert.ok(world.getLoadedChunkCount() <= 51);
  assert.ok(kinds(world).has("l4_meg_member"));
  world.dispose();
  assert.equal(world.colliders.length, 0);
});

test("office decor is batched and loaded chunks expose deterministic entity specs", () => {
  const root = new THREE.Group();
  const world = buildLevel4World(root, { shadows: false, pointLightBudget: 3 });
  for (let i = 2; i <= 20; i++) world.update(i * L4_CHUNK_SIZE, 8 * L4_CHUNK_SIZE);
  let batches = 0;
  root.traverse((object) => {
    if (object.isInstancedMesh && object.name.startsWith("L4Instances_")) batches += 1;
  });
  assert.ok(batches > 0);
  assert.ok(world.getEntitySpecs().every((spec) =>
    spec.kind === "hound" || spec.kind === "duller"
  ));
  world.dispose();
});

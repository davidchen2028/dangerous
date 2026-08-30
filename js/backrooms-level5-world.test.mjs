import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const store = new Map();
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
    }),
  }),
};

const { buildLevel5World } = await import("./backrooms-level5-world.js");
const { resolveCircleAgainstColliders } = await import("./backrooms-collide.js");

test("world builds a safe lobby with a Level 4 exit", () => {
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "world-test", gfxProfile: {} });
  const env = world.update(0, 3, 1000);
  assert.equal(env.zone, "lobby");
  assert.equal(env.spawnSafe, true);
  assert.ok(world.colliders.length > 0);
  assert.ok(world.interactRoots.some((mesh) =>
    mesh.userData.brInteract && mesh.userData.brInteract.kind === "l5_exit_l4"
  ));
  world.dispose();
});

test("travel east reaches boiler and the Level 6 tunnel", () => {
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "world-test", gfxProfile: {} });
  const env = world.update(4 * 24, 0, 2000);
  assert.equal(env.zone, "boiler");
  assert.ok(world.interactRoots.some((mesh) =>
    mesh.userData.brInteract && mesh.userData.brInteract.kind === "l5_exit_l6"
  ));
  assert.ok(world.getSteamHazards().length > 0);
  world.dispose();
});

test("streaming unloads distant chunks and keeps a bounded working set", () => {
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "stream-test", gfxProfile: {} });
  world.update(0, 0, 1000);
  const initial = world.getLoadedChunkCount();
  for (let i = 1; i <= 20; i++) world.update(i * 48, 0, 1000 + i * 50);
  assert.ok(world.getLoadedChunkCount() <= initial + 12);
  world.interactRoots.forEach((mesh) => assert.ok(mesh.parent));
  world.dispose();
  assert.equal(world.colliders.length, 0);
});

test("loot disappears immediately and persists in session state", () => {
  store.clear();
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "loot-test", gfxProfile: {} });
  for (let x = -1; x >= -15; x--) world.update(x * 24, 0, 1000 + Math.abs(x));
  const loot = world.interactRoots.find((mesh) =>
    mesh.userData.brInteract && mesh.userData.brInteract.kind === "l5_loot"
  );
  assert.ok(loot, "seed should generate at least one loot point");
  const id = loot.userData.brInteract.id;
  world.consumeLoot(id);
  assert.equal(world.interactRoots.some((mesh) =>
    mesh.userData.brInteract && mesh.userData.brInteract.id === id
  ), false);
  assert.equal(JSON.parse(store.get("backrooms_l5_state_v1")).taken[id], true);
  world.dispose();
});

test("guest doors have stable stateful interaction", () => {
  store.clear();
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "doors-test", gfxProfile: {} });
  world.update(-24, 0, 1000);
  const door = world.interactRoots.find((mesh) =>
    mesh.userData.brInteract && mesh.userData.brInteract.kind === "l5_guest_door"
  );
  assert.ok(door);
  const id = door.userData.brInteract.id;
  assert.equal(world.openGuestDoor(id), true);
  assert.equal(world.openGuestDoor(id), false);
  world.dispose();
});

test("a collision-resolved player can walk from lobby to the Level 6 boiler exit", () => {
  const root = new THREE.Group();
  const world = buildLevel5World(root, { seed: "terror-hotel", gfxProfile: {} });
  let x = 0;
  let z = 3;
  let now = 1000;

  function walk(dx, dz, distance) {
    const steps = Math.ceil(distance / 0.12);
    for (let i = 0; i < steps; i++) {
      world.update(x, z, now++);
      const out = resolveCircleAgainstColliders(
        x + dx * 0.12,
        z + dz * 0.12,
        0.33,
        world.colliders,
        10
      );
      x = out.x;
      z = out.z;
    }
  }

  walk(0, -1, 3);
  walk(1, 0, 18);
  walk(0, 1, 2.2);
  walk(1, 0, 11);
  walk(0, -1, 2.2);
  walk(1, 0, 68);

  assert.ok(x > 85, "player should pass all chunk boundaries, actual x=" + x);
  assert.equal(world.update(x, z, now).zone, "boiler");
  world.dispose();
});

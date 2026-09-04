import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const store = new Map();
globalThis.sessionStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const {
  L4_MAX_ACTIVE_ENTITIES,
  createLevel4EntityManager,
} = await import("./backrooms-level4-entities.js");

function spec(index, kind = "duller") {
  return {
    id: `entity_${index}`,
    kind,
    x: 80 + index * 3,
    z: 80,
    rotation: 0,
    seed: index + 1,
  };
}

test("entity manager enforces a small active population", () => {
  const manager = createLevel4EntityManager(new THREE.Group(), []);
  const specs = Array.from({ length: 10 }, (_, index) => spec(index));
  manager.update(0.016, 80, 80, { dead: false, takeDamage() {} }, null, specs, false);
  assert.equal(manager.getActiveCount(), L4_MAX_ACTIVE_ENTITIES);
  manager.dispose();
});

test("spawn and Omega safe radius rejects hostile specs", () => {
  const manager = createLevel4EntityManager(new THREE.Group(), []);
  manager.update(
    0.016,
    0,
    2,
    { dead: false, takeDamage() {} },
    null,
    [{ id: "unsafe", kind: "hound", x: 10, z: 4 }],
    true
  );
  assert.equal(manager.getActiveCount(), 0);
  manager.dispose();
});

test("duller movement respects office colliders", () => {
  const barrier = { minX: 89.9, maxX: 90.1, minZ: 75, maxZ: 85 };
  const manager = createLevel4EntityManager(new THREE.Group(), [barrier]);
  const duller = { id: "blocked", kind: "duller", x: 89, z: 80, seed: 2 };
  const survival = { dead: false, takeDamage() { return true; } };
  for (let i = 0; i < 80; i += 1) {
    manager.update(0.05, 92, 80, survival, null, [duller], false);
  }
  const entry = manager.getActiveEntries()[0];
  assert.ok(entry.system.group.position.x <= barrier.minX - 0.34 + 1e-6);
  manager.dispose();
});

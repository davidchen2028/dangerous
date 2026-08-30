import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const store = new Map();
globalThis.sessionStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { createLevel5EntityManager } = await import("./backrooms-level5-entities.js");

function hounds(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: "test-hound-" + i,
      kind: "hound",
      x: 30 + i * 2,
      z: 0,
      waypoints: [{ x: 30 + i * 2, z: -3 }, { x: 30 + i * 2, z: 3 }],
    });
  }
  return out;
}

function survival() {
  return { dead: false, hp: 100, takeDamage(amount) { this.hp -= amount; return true; } };
}

test("entity manager caps the active population at eight", () => {
  store.clear();
  const root = new THREE.Group();
  const manager = createLevel5EntityManager(root, []);
  manager.update(0.05, 30, 0, survival(), () => {}, hounds(14), { spawnSafe: false }, []);
  assert.equal(manager.getActiveCount(), 8);
  manager.dispose();
});

test("entities are removed when their streamed descriptors unload", () => {
  store.clear();
  const root = new THREE.Group();
  const manager = createLevel5EntityManager(root, []);
  manager.update(0.05, 30, 0, survival(), () => {}, hounds(3), { spawnSafe: false }, []);
  assert.equal(manager.getActiveCount(), 3);
  manager.update(0.05, 0, 0, survival(), () => {}, [], { spawnSafe: true }, []);
  assert.equal(manager.getActiveCount(), 0);
  manager.dispose();
});

test("safe lobby prevents entity damage", () => {
  store.clear();
  const root = new THREE.Group();
  const manager = createLevel5EntityManager(root, []);
  const player = survival();
  const specs = [{
    id: "close-hound",
    kind: "hound",
    x: 25,
    z: 3,
    waypoints: [{ x: 25, z: 3 }],
  }];
  manager.update(2, 25, 3, player, () => {}, specs, { spawnSafe: true }, []);
  assert.equal(player.hp, 100);
  manager.dispose();
});

test("killed entities stay dead after manager recreate", () => {
  store.clear();
  store.set(
    "backrooms_l5_entities_v1",
    JSON.stringify({ "persist-hound": { hp: 0, dead: true } })
  );
  const root = new THREE.Group();
  const specs = [{
    id: "persist-hound",
    kind: "hound",
    x: 40,
    z: 0,
    waypoints: [{ x: 40, z: 0 }],
  }];
  const manager = createLevel5EntityManager(root, []);
  manager.update(0.05, 40, 0, survival(), () => {}, specs, { spawnSafe: false }, []);
  assert.equal(manager.getActiveCount(), 0);
  manager.dispose();
});

test("unload persists damaged hp without waiting for the heartbeat", () => {
  store.clear();
  const root = new THREE.Group();
  const manager = createLevel5EntityManager(root, []);
  const specs = [{
    id: "hurt-hound",
    kind: "hound",
    x: 42,
    z: 0,
    waypoints: [{ x: 42, z: 0 }],
  }];
  manager.update(0.05, 42, 0, survival(), () => {}, specs, { spawnSafe: false }, []);
  assert.equal(manager.getActiveCount(), 1);
  // Unload all active entities immediately; remove() must write session state.
  manager.update(0.05, 0, 0, survival(), () => {}, [], { spawnSafe: true }, []);
  assert.equal(manager.getActiveCount(), 0);
  const saved = JSON.parse(store.get("backrooms_l5_entities_v1") || "{}");
  assert.ok(saved["hurt-hound"], "unload should persist entity state");
  assert.equal(saved["hurt-hound"].dead, false);
  assert.ok(Number.isFinite(saved["hurt-hound"].hp));
  manager.dispose();
});

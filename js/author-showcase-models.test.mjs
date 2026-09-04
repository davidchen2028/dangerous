import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  AUTHOR_MODEL_CATALOG,
  AUTHOR_MODEL_CATEGORIES,
  getAuthorModels,
  disposeAuthorModel,
} from "./author-showcase-models.js";

globalThis.document = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy(
          {
            createLinearGradient() {
              return { addColorStop() {} };
            },
            createRadialGradient() {
              return { addColorStop() {} };
            },
            measureText() {
              return { width: 24 };
            },
          },
          {
            get(target, key) {
              if (key in target) return target[key];
              return () => {};
            },
            set(target, key, value) {
              target[key] = value;
              return true;
            },
          }
        );
      },
    };
  },
};

test("author model catalog has four complete unique categories", () => {
  assert.deepEqual(Object.keys(AUTHOR_MODEL_CATEGORIES), [
    "doors",
    "offices",
    "people",
    "monsters",
  ]);
  assert.equal(AUTHOR_MODEL_CATALOG.length, 27);
  assert.equal(new Set(AUTHOR_MODEL_CATALOG.map((entry) => entry.id)).size, 27);
  assert.equal(getAuthorModels("doors").length, 6);
  assert.equal(getAuthorModels("offices").length, 3);
  assert.equal(getAuthorModels("people").length, 6);
  assert.equal(getAuthorModels("monsters").length, 12);
});

test("required showcase subjects are present", () => {
  const ids = new Set(AUTHOR_MODEL_CATALOG.map((entry) => entry.id));
  [
    "door-industrial",
    "door-rainbow",
    "door-iron",
    "office-el3a",
    "office-el3a-room",
    "person-meg",
    "person-wanderer",
    "person-guard",
    "monster-smiler",
    "monster-death-moth",
    "monster-clump",
    "monster-hound",
    "monster-partygoer",
    "monster-faceling",
    "monster-duller",
    "monster-chicken",
    "monster-wanderer",
    "monster-drowned",
    "monster-growler",
  ].forEach((id) => assert.ok(ids.has(id), `missing ${id}`));
});

test("every catalog builder creates finite renderable geometry and disposes", () => {
  for (const entry of AUTHOR_MODEL_CATALOG) {
    const built = entry.build();
    assert.ok(built?.group instanceof THREE.Object3D, `${entry.id} group`);
    built.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(built.group);
    assert.ok(!bounds.isEmpty(), `${entry.id} bounds`);
    for (const value of [...bounds.min.toArray(), ...bounds.max.toArray()]) {
      assert.ok(Number.isFinite(value), `${entry.id} finite bounds`);
    }
    if (built.update) built.update(0.016, 0.016);
    disposeAuthorModel(built);
    assert.equal(built.group.parent, null, `${entry.id} detached`);
  }
});

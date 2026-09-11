import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadThree() {
  try {
    return await import("three");
  } catch (_err) {
    try {
      return await import(pathToFileURL(require.resolve("./vendor/three.module.min.js")).href);
    } catch (_err2) {
      return null;
    }
  }
}

test("removing a remote player releases geometry and material", async (t) => {
  const threeMod = await loadThree();
  if (!threeMod) {
    t.skip("three is unavailable in this Node environment");
    return;
  }
  const THREE = threeMod.default && threeMod.default.Scene ? threeMod.default : threeMod;
  const { register } = await import("node:module");
  // Prefer the same package name the production module imports.
  try {
    await import("three");
  } catch (_err) {
    t.skip("bare 'three' import is unresolved; browser import-map covers runtime");
    return;
  }
  const { createRemotePlayerPool } = await import("./backrooms-remote-players.js");
  const scene = new THREE.Scene();
  const pool = createRemotePlayerPool();
  pool.setScene(scene);
  pool.syncPeers(
    [
      {
        userId: 7,
        nickname: "测试",
        x: 2,
        y: 0,
        z: 3,
        yaw: 0,
        downed: false,
      },
    ],
    0
  );

  const avatar = scene.getObjectByName("RemoteWanderer");
  assert.ok(avatar);
  const body = avatar.userData.brRemoteBody;
  let geometryDisposed = false;
  let materialDisposed = false;
  body.geometry.addEventListener("dispose", () => {
    geometryDisposed = true;
  });
  body.material.addEventListener("dispose", () => {
    materialDisposed = true;
  });

  pool.syncPeers([], 100);
  assert.equal(scene.getObjectByName("RemoteWanderer"), undefined);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

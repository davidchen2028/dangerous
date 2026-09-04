import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildBackroomsLevel2World,
  deriveLevel2PipeProfile,
  deriveLevel2PipeRuns,
  LEVEL2_LAYOUT_SEED_KEY,
} from "./backrooms-level2-streaming-world.js";
import { getLevel2ChunkLayout } from "./backrooms-level2-layout.js";
import { circleOverlapsAny } from "./backrooms-collide.js";

function installBrowserStubs(seed) {
  const values = new Map([[LEVEL2_LAYOUT_SEED_KEY, String(seed)]]);
  globalThis.sessionStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            font: "",
            textAlign: "",
            textBaseline: "",
            fillRect() {},
            strokeRect() {},
            fillText() {},
          };
        },
      };
    },
  };
}

test("pipe profile preserves narrow corridor clearance", () => {
  const narrow = deriveLevel2PipeProfile(2.6, 123);
  assert.equal(narrow.length, 1);
  assert.ok(narrow[0].y > 2);
  assert.equal(narrow[0].collidable, false);

  const wide = deriveLevel2PipeProfile(4.2, 124);
  assert.ok(wide.length >= 2);
  assert.ok(wide.some((pipe) => pipe.collidable));
  assert.ok(wide.every((pipe) => pipe.radius <= 0.17));
});

test("pipe runs stay inside solid wall spans and leave opening gaps", () => {
  const segment = { width: 4.2 };
  const spans = {
    "-1": [[-5, -1], [1, 5]],
    "1": [[-5, -1], [1, 5]],
  };
  const runs = deriveLevel2PipeRuns(segment, spans, 44);
  assert.ok(runs.length > 0);
  for (const run of runs) {
    const source = spans[run.side].find(
      ([start, end]) => run.start >= start && run.end <= end
    );
    assert.ok(source, "run must belong to a solid wall span");
    assert.ok(run.end <= -1 || run.start >= 1, "run must not cross the opening");
    assert.ok(run.start >= source[0] + 0.2);
    assert.ok(run.end <= source[1] - 0.2);
  }
});

test("streamed seed builds an enterable EL3A office and round wall pipes", () => {
  installBrowserStubs("0");
  const root = new THREE.Group();
  const world = buildBackroomsLevel2World(root, { colliders: [] });
  const names = new Set();
  let wallPipe = null;
  root.traverse((obj) => {
    if (obj.name) names.add(obj.name);
    if (obj.name === "Level2WallPipe" && !wallPipe) wallPipe = obj;
  });

  assert.ok(names.has("Level2EL3ASign"));
  assert.ok(names.has("Level2EL3ADesk"));
  assert.ok(names.has("Level2EL3AChair"));
  assert.ok(names.has("Level2EL3AMonitor"));
  assert.ok(names.has("Level2EL3AFileCabinet"));
  assert.ok(names.has("Level2WallPipe"));
  assert.ok(names.has("Level2PipeFlange"));
  assert.equal(wallPipe.geometry.type, "CylinderGeometry");
  const recordRoot = world.interactRoots.find(
    (mesh) => mesh.userData.brInteract?.kind === "l2_el3a_record"
  );
  assert.ok(recordRoot);
  assert.match(world.getInteractionHint(recordRoot.userData.brInteract), /按 Q 阅读/);
  let toast = "";
  assert.equal(
    world.interact(recordRoot.userData.brInteract, {
      showToast(text) {
        toast = text;
      },
    }),
    true
  );
  assert.match(toast, /EL3A 办公室维护记录/);
  assert.match(world.getInteractionHint(recordRoot.userData.brInteract), /已读/);
  assert.ok(world.colliders.some((collider) => collider.kind === "pipe"));

  world.dispose();
});

/** 房间在支路终点之外，只有把它注册成 carver，别的走廊才会为入口让路。 */
test("EL3A office entrance stays walkable across seeds", () => {
  const PLAYER_RADIUS = 0.34;
  let offices = 0;
  let blocked = 0;

  for (let seed = 0; seed < 12; seed++) {
    installBrowserStubs(seed);
    const root = new THREE.Group();
    const world = buildBackroomsLevel2World(root, { colliders: [] });

    for (let cx = -2; cx <= 2; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        for (const feature of getLevel2ChunkLayout(String(seed), cx, cz).features) {
          if (feature.type !== "office") continue;
          offices += 1;
          const rotation = Math.atan2(
            feature.x - feature.approachFrom.x,
            feature.z - feature.approachFrom.z
          );
          const tx = Math.sin(rotation);
          const tz = Math.cos(rotation);
          // 入口到办公桌前沿之间必须全程无阻挡。
          for (let d = 0; d <= 2.2; d += 0.1) {
            if (
              circleOverlapsAny(
                feature.x + tx * d,
                feature.z + tz * d,
                PLAYER_RADIUS,
                world.colliders
              )
            ) {
              blocked += 1;
              break;
            }
          }
        }
      }
    }
    world.dispose();
  }

  assert.ok(offices > 20, `expected sampled offices, got ${offices}`);
  assert.equal(blocked, 0, `${blocked}/${offices} office entrances were blocked`);
});

test("office lamp and sign follow the room height instead of fixed values", () => {
  const heights = new Set();
  for (let seed = 0; seed < 12; seed++) {
    installBrowserStubs(seed);
    const root = new THREE.Group();
    const world = buildBackroomsLevel2World(root, { colliders: [] });
    root.updateMatrixWorld(true);

    root.traverse((obj) => {
      if (obj.name === "Level2EL3AOfficeLamp" || obj.name === "Level2EL3ASign") {
        const y = obj.getWorldPosition(new THREE.Vector3()).y;
        // 走廊净高 3.4..5，灯贴顶、标牌挂在门楣与顶之间。
        assert.ok(y > 2.7 && y < 5, `${obj.name} at unexpected height ${y}`);
        if (obj.name === "Level2EL3AOfficeLamp") heights.add(y.toFixed(2));
      }
    });
    world.dispose();
  }
  assert.ok(heights.size > 1, "office lamps should vary with corridor height");
});

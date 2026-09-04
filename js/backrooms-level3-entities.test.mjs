import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MAZE_H, MAZE_W } from "./backrooms-level3-world.js";
import {
  DEATH_MOTH_RADIUS,
  createDeathMothsAt,
} from "./backrooms-death-moth.js";
import {
  CLUMP_RADIUS,
  canClumpPounceHit,
  createClumpsAt,
  isClumpPouncePathClear,
} from "./backrooms-clump-ai.js";

function openMaze() {
  return Array.from({ length: MAZE_H }, () => Array(MAZE_W).fill(0));
}

const pipeBarrier = {
  minX: -0.12,
  maxX: 0.12,
  minZ: -2,
  maxZ: 2,
};

globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          fillStyle: "",
          strokeStyle: "",
          lineWidth: 1,
          beginPath() {},
          moveTo() {},
          lineTo() {},
          quadraticCurveTo() {},
          closePath() {},
          fill() {},
          stroke() {},
          fillRect() {},
          ellipse() {},
        };
      },
    };
  },
};

test("death moth movement respects Level 3 pipe colliders", () => {
  const system = createDeathMothsAt(
    new THREE.Group(),
    [{ x: -1, y: 1.5, z: 0, rotY: 0 }],
    null,
    { applyLuck: false }
  );
  const moth = system.moths[0];
  for (let i = 0; i < 60; i += 1) {
    system.update(0.05, 6, 0, { dead: false }, null, {
      mazeGrid: openMaze(),
      extraColliders: [pipeBarrier],
      now: i * 50,
    });
  }
  assert.ok(moth.x <= pipeBarrier.minX - DEATH_MOTH_RADIUS + 1e-6);
  system.dispose();
});

test("blocked clump lunge cannot cross a pipe or damage through it", () => {
  const system = createClumpsAt(
    new THREE.Group(),
    [{ x: -1, z: 0, rotY: 0, seed: 1 }],
    null,
    { applyLuck: false }
  );
  const clump = system.clumps[0];
  let damage = 0;
  const survival = {
    dead: false,
    takeDamage(value) {
      damage += value;
      return true;
    },
  };
  const extra = {
    mazeGrid: openMaze(),
    extraColliders: [pipeBarrier],
  };
  system.update(0.05, 1, 0, survival, null, extra);
  for (let i = 0; i < 7; i += 1) {
    system.update(0.05, 1, 0, survival, null, extra);
  }
  assert.ok(clump.x <= pipeBarrier.minX - CLUMP_RADIUS + 1e-6);
  assert.equal(damage, 0);
  assert.equal(canClumpPounceHit(clump.x, clump.z, 1, 0), false);
  system.dispose();
});

test("a wall pipe blocks pounce damage even when both sides are in hit range", () => {
  const clumpX = pipeBarrier.minX - CLUMP_RADIUS;
  const playerX = pipeBarrier.maxX + 0.32;
  assert.equal(canClumpPounceHit(clumpX, 0, playerX, 0), true);
  assert.equal(
    isClumpPouncePathClear(clumpX, 0, playerX, 0, [pipeBarrier]),
    false
  );
});

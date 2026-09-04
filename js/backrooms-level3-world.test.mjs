import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CELL,
  MAZE_H,
  MAZE_W,
  buildLevel3World,
  generateLevel3Maze,
  getLevel3PipeClearWidth,
  getLevel3SpawnWorld,
  resolveCircleAgainstLevel3Maze,
} from "./backrooms-level3-world.js";
import { getLevel3ElevatorWorldCenter } from "./backrooms-level3-elevator.js";

function installDocumentStub() {
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: "",
            fillRect() {},
          };
        },
      };
    },
  };
}

function worldToCell(value, size) {
  return Math.floor(value / CELL + size * 0.5);
}

function canReachElevator(maze) {
  const center = getLevel3ElevatorWorldCenter();
  const targetX = worldToCell(center.x, MAZE_W);
  const targetZ = worldToCell(center.z, MAZE_H);
  const queue = [maze.spawnCell];
  const seen = new Set([`${maze.spawnCell.x},${maze.spawnCell.z}`]);
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (
      Math.abs(cell.x - targetX) <= 1 &&
      Math.abs(cell.z - targetZ) <= 1
    ) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cell.x + dx;
      const z = cell.z + dz;
      const key = `${x},${z}`;
      if (
        x >= 0 && z >= 0 && x < MAZE_W && z < MAZE_H &&
        maze.grid[z][x] === 0 && !seen.has(key)
      ) {
        seen.add(key);
        queue.push({ x, z });
      }
    }
  }
  return false;
}

test("multiple seeds keep spawn and central elevator connected", () => {
  for (const seed of [1, 17, 404, 9001, -31]) {
    const maze = generateLevel3Maze(seed);
    const spawn = getLevel3SpawnWorld(maze);
    const center = getLevel3ElevatorWorldCenter();
    assert.equal(maze.grid[maze.spawnCell.z][maze.spawnCell.x], 0);
    assert.equal(
      maze.grid[worldToCell(center.z, MAZE_H)][worldToCell(center.x, MAZE_W)],
      0
    );
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z));
    assert.ok(canReachElevator(maze), `seed ${seed} must reach elevator`);
  }
});

test("maze collision pushes a circle out of walls and pipes", () => {
  const maze = generateLevel3Maze(44);
  const wallX = (0 - MAZE_W * 0.5) * CELL;
  const wallZ = (0 - MAZE_H * 0.5) * CELL;
  const pipe = {
    minX: wallX - 0.3,
    maxX: wallX + 0.3,
    minZ: wallZ + CELL,
    maxZ: wallZ + CELL + 0.2,
  };
  const wallOut = resolveCircleAgainstLevel3Maze(
    wallX,
    wallZ,
    0.32,
    maze.grid,
    []
  );
  assert.ok(wallOut.x !== wallX || wallOut.z !== wallZ);
  const pipeOut = resolveCircleAgainstLevel3Maze(
    wallX,
    wallZ + CELL + 0.1,
    0.32,
    maze.grid.map((row) => row.map(() => 0)),
    [pipe]
  );
  assert.ok(
    pipeOut.x < pipe.minX - 0.31 ||
    pipeOut.x > pipe.maxX + 0.31 ||
    pipeOut.z < pipe.minZ - 0.31 ||
    pipeOut.z > pipe.maxZ + 0.31
  );
});

test("world batches pipe decor while preserving hazards and clearance", () => {
  installDocumentStub();
  const world = buildLevel3World(generateLevel3Maze(312));
  assert.ok(world.pipeHazardSlots.length > 0);
  assert.ok(world.extraColliders.length > 0);
  assert.ok(world.decorInstanceCount > 100);
  assert.ok(world.instanceBatches.length <= 7);
  assert.ok(world.instanceBatches.every((mesh) => mesh.isInstancedMesh));
  assert.ok(getLevel3PipeClearWidth(0.2) >= 2.1);
  const individualDecor = world.group.children.filter(
    (child) =>
      child.name.startsWith("Level3PipeBatch") ||
      child.name.startsWith("Level3PipeBracketBatch") ||
      child.name === "Level3CableBatch"
  );
  assert.equal(individualDecor.length, world.instanceBatches.length);
});

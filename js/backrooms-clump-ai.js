/**
 * 肢团（Clump）— 靠近扑击 −45 血量，冷却 50 秒
 */
import * as THREE from "three";
import { buildClumpFigure } from "./backrooms-clump.js";
import { CORRIDOR_LENGTH, CORRIDOR_WIDTH } from "./backrooms-level2-world.js";
import {
  getLevel2SharedCorridorSpec,
  insetCorridorPosition,
} from "./backrooms-level2-xiaoye.js";
import {
  CELL,
  MAZE_H,
  MAZE_W,
  resolveCircleAgainstLevel3Maze,
} from "./backrooms-level3-world.js";
import { resolveBackroomsMoveCollisions } from "./backrooms-fps-controller.js";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";

export const CLUMP_POUNCE_DAMAGE = 45;
export const CLUMP_POUNCE_COOLDOWN = 50;
export const CLUMP_SEE_DIST = 14;
export const CLUMP_TRIGGER_DIST = 9;
export const CLUMP_CREEP_SPEED = 1.85;
export const CLUMP_LUNGE_DURATION = 0.42;
export const CLUMP_RADIUS = 0.52;

const L3_CLUMP_COUNT = 4;

function distSq(ax, az, bx, bz) {
  var dx = ax - bx;
  var dz = az - bz;
  return dx * dx + dz * dz;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  var i = arr.length;
  while (i > 1) {
    i -= 1;
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function cellToWorld(cx, cz) {
  return {
    x: (cx - MAZE_W * 0.5) * CELL,
    z: (cz - MAZE_H * 0.5) * CELL,
  };
}

function pickLevel3ClumpSpawns(mazeData, count) {
  var grid = mazeData.grid;
  var spawn = mazeData.spawnCell;
  var cells = [];
  var z;
  var x;
  for (z = 1; z < MAZE_H - 1; z++) {
    for (x = 1; x < MAZE_W - 1; x++) {
      if (grid[z][x] === 0) cells.push({ x: x, z: z });
    }
  }
  var seed = ((mazeData.seed | 0) + 9097) | 0;
  var rng = mulberry32(seed);
  shuffle(cells, rng);
  var out = [];
  var i;
  for (i = 0; i < cells.length && out.length < count; i++) {
    var c = cells[i];
    if (Math.abs(c.x - spawn.x) + Math.abs(c.z - spawn.z) < 10) continue;
    var w = cellToWorld(c.x, c.z);
    out.push({
      x: w.x + (rng() - 0.5) * 0.4,
      z: w.z + (rng() - 0.5) * 0.4,
      rotY: rng() * Math.PI * 2,
      seed: Math.floor(rng() * 1000),
    });
  }
  return out;
}

function offsetBesideCorridor(pos, lateral) {
  var x = pos.x;
  var z = pos.z;
  if (pos.arm === "pz" || pos.arm === "nz") x += lateral;
  else z += lateral;
  return { x: x, z: z, rotY: pos.rotY, arm: pos.arm };
}

function createClumpEntity(parent, spawn, opts) {
  opts = opts || {};
  var figure = buildClumpFigure({ scale: opts.scale || 1, seed: spawn.seed || 0 });
  var group = figure.group;
  group.position.set(spawn.x, 0, spawn.z);
  if (spawn.rotY != null) group.rotation.y = spawn.rotY;
  parent.add(group);

  var clump = {
    figure: figure,
    group: group,
    homeX: spawn.x,
    homeZ: spawn.z,
    x: spawn.x,
    z: spawn.z,
    rotY: spawn.rotY || 0,
    cooldown: 0,
    lungeLeft: 0,
    lungeTargetX: 0,
    lungeTargetZ: 0,
    lungeApplied: false,
    animT: Math.random() * 10,
    mode: "idle",
    lungeFromX: spawn.x,
    lungeFromZ: spawn.z,
    dead: false,
  };
  clump.health = registerBackroomsEntityTarget(group, {
    kind: "clump",
    name: "肢团",
    maxHp: BACKROOMS_ENTITY_HEALTH.clump,
    aimHeight: 0.7,
    onDeath: function () {
      clump.dead = true;
      clump.mode = "dead";
      clump.group.visible = false;
    },
  });
  return clump;
}

function faceToward(clump, tx, tz) {
  var dx = tx - clump.x;
  var dz = tz - clump.z;
  if (dx * dx + dz * dz > 0.0004) {
    clump.rotY = Math.atan2(dx, dz);
    clump.group.rotation.y = clump.rotY;
  }
}

function moveClump(clump, nx, nz, opts) {
  if (opts.mazeGrid) {
    var out = resolveCircleAgainstLevel3Maze(nx, nz, CLUMP_RADIUS, opts.mazeGrid);
    nx = out.x;
    nz = out.z;
  } else if (opts.wallColliders) {
    var resolved = resolveBackroomsMoveCollisions(
      nx,
      nz,
      CLUMP_RADIUS,
      opts.wallColliders,
      8
    );
    nx = resolved.x;
    nz = resolved.z;
  }
  clump.x = nx;
  clump.z = nz;
  clump.group.position.x = nx;
  clump.group.position.z = nz;
}

function applyPounceDamage(clump, survival, toastFn) {
  if (clump.lungeApplied || !survival || survival.dead) return;
  clump.lungeApplied = true;
  survival.takeDamage(CLUMP_POUNCE_DAMAGE);
  if (typeof toastFn === "function") {
    toastFn("肢团扑击！−" + CLUMP_POUNCE_DAMAGE + " 血量");
  }
}

function updateSingleClump(clump, dt, px, pz, survival, toastFn, opts) {
  if (clump.dead) return;
  clump.animT += dt;
  clump.figure.update(clump.animT);

  if (clump.cooldown > 0) clump.cooldown = Math.max(0, clump.cooldown - dt);

  if (clump.lungeLeft > 0) {
    clump.lungeLeft -= dt;
    var p = 1 - Math.max(0, clump.lungeLeft) / CLUMP_LUNGE_DURATION;
    var ease = p * p * (3 - 2 * p);
    var nx = clump.lungeFromX + (clump.lungeTargetX - clump.lungeFromX) * ease;
    var nz = clump.lungeFromZ + (clump.lungeTargetZ - clump.lungeFromZ) * ease;
    clump.x = nx;
    clump.z = nz;
    clump.group.position.x = nx;
    clump.group.position.z = nz;
    faceToward(clump, clump.lungeTargetX, clump.lungeTargetZ);
    var lungeScale = 1 + ease * 0.35;
    clump.group.scale.setScalar(lungeScale);
    if (p >= 0.12 && p <= 0.55) {
      if (!opts.playerSafe) applyPounceDamage(clump, survival, toastFn);
    }
    if (clump.lungeLeft <= 0) {
      clump.mode = "cooldown";
      clump.cooldown = CLUMP_POUNCE_COOLDOWN;
      clump.x = clump.homeX;
      clump.z = clump.homeZ;
      clump.group.position.set(clump.homeX, 0, clump.homeZ);
      clump.group.scale.setScalar(1);
      clump.lungeApplied = false;
    }
    return;
  }

  if (clump.mode === "cooldown") {
    clump.group.position.set(clump.homeX, 0, clump.homeZ);
    clump.x = clump.homeX;
    clump.z = clump.homeZ;
    if (clump.cooldown <= 0) clump.mode = "idle";
    return;
  }

  var seeSq = CLUMP_SEE_DIST * CLUMP_SEE_DIST;
  var triggerSq = CLUMP_TRIGGER_DIST * CLUMP_TRIGGER_DIST;
  var toPlayerSq = distSq(clump.x, clump.z, px, pz);

  if (!opts.playerSafe && toPlayerSq <= seeSq && survival && !survival.dead) {
    faceToward(clump, px, pz);
    if (toPlayerSq <= triggerSq && clump.cooldown <= 0) {
      clump.mode = "lunge";
      clump.lungeLeft = CLUMP_LUNGE_DURATION;
      clump.lungeFromX = clump.x;
      clump.lungeFromZ = clump.z;
      clump.lungeTargetX = px;
      clump.lungeTargetZ = pz;
      clump.lungeApplied = false;
      return;
    }
    if (toPlayerSq > triggerSq * 0.85) {
      clump.mode = "creep";
      var dist = Math.sqrt(toPlayerSq) || 0.001;
      var step = Math.min(CLUMP_CREEP_SPEED * dt, Math.max(0, dist - CLUMP_TRIGGER_DIST * 0.65));
      if (step > 0.0001) {
        moveClump(
          clump,
          clump.x + ((px - clump.x) / dist) * step,
          clump.z + ((pz - clump.z) / dist) * step,
          opts
        );
      }
    }
  } else {
    clump.mode = "idle";
    var hdx = clump.homeX - clump.x;
    var hdz = clump.homeZ - clump.z;
    var homeSq = hdx * hdx + hdz * hdz;
    if (homeSq > 0.06) {
      var hdist = Math.sqrt(homeSq);
      var hstep = Math.min(CLUMP_CREEP_SPEED * 0.55 * dt, hdist);
      moveClump(
        clump,
        clump.x + (hdx / hdist) * hstep,
        clump.z + (hdz / hdist) * hstep,
        opts
      );
    }
  }

  clump.group.scale.setScalar(1);
}

function createClumpSystem(parent, spawns, opts) {
  opts = opts || {};
  var root = new THREE.Group();
  root.name = "Clumps";
  parent.add(root);

  var clumps = [];
  var i;
  for (i = 0; i < spawns.length; i++) {
    clumps.push(createClumpEntity(root, spawns[i], opts));
  }

  return {
    root: root,
    clumps: clumps,
    update: function (dt, px, pz, survival, toastFn, extra) {
      extra = extra || {};
      var moveOpts = {
        mazeGrid: extra.mazeGrid != null ? extra.mazeGrid : opts.mazeGrid,
        wallColliders: extra.wallColliders != null ? extra.wallColliders : opts.wallColliders,
        playerSafe: !!extra.playerSafe,
      };
      for (i = 0; i < clumps.length; i++) {
        updateSingleClump(clumps[i], dt, px, pz, survival, toastFn, moveOpts);
      }
    },
    dispose: function () {
      for (i = 0; i < clumps.length; i++) {
        unregisterBackroomsEntityTarget(clumps[i].health);
        clumps[i].figure.dispose();
      }
    },
  };
}

/** 自定义关卡：按给定世界坐标生成肢团 */
export function createClumpsAt(parent, spawns, wallColliders) {
  return createClumpSystem(parent, spawns || [], {
    wallColliders: wallColliders || null,
  });
}

/** L1.1-3 走廊 1 只 */
export function createLevel1_1_3Clump(parent, wallColliders) {
  return createClumpSystem(
    parent,
    [{ x: 1.4, z: 44, rotY: Math.PI, seed: 11 }],
    { wallColliders: wallColliders }
  );
}

/** L1.1-4 走廊 3 只 */
export function createLevel1_1_4Clumps(parent, wallColliders) {
  return createClumpSystem(
    parent,
    [
      { x: -1.3, z: 58, rotY: 0.2, seed: 21 },
      { x: 1.2, z: 118, rotY: Math.PI + 0.15, seed: 33 },
      { x: -1.1, z: 172, rotY: -0.3, seed: 47 },
    ],
    { wallColliders: wallColliders }
  );
}

/** L2：与死亡飞蛾同走廊，侧向偏移保持在走廊半宽内，避免生成在墙外 */
export function createLevel2Clump(parent, wallColliders) {
  var halfLen = CORRIDOR_LENGTH * 0.5;
  var spec = getLevel2SharedCorridorSpec(halfLen);
  var mothPos = insetCorridorPosition(spec, 14);
  var lateral = Math.max(0.35, CORRIDOR_WIDTH * 0.5 - CLUMP_RADIUS - 0.08);
  var beside = offsetBesideCorridor(mothPos, lateral);
  return createClumpSystem(
    parent,
    [
      {
        x: beside.x,
        z: beside.z,
        rotY: mothPos.rotY + Math.PI,
        seed: 5,
      },
    ],
    { wallColliders: wallColliders }
  );
}

/** L3：迷宫内随机 4 只 */
export function createLevel3Clumps(parent, mazeData) {
  var spawns = pickLevel3ClumpSpawns(mazeData, L3_CLUMP_COUNT);
  return createClumpSystem(parent, spawns, { mazeGrid: mazeData.grid });
}

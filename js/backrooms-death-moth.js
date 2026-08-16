/**
 * 死亡飞蛾 — L2 笑靥同走廊 1 只；L3 随机 3 只（可被管道蒸汽/强酸喷死）
 */
import * as THREE from "three";
import { buildDeathMothFigure } from "./backrooms-moth.js";
import { CORRIDOR_LENGTH } from "./backrooms-level2-world.js";
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
import { BURST_RADIUS } from "./backrooms-level3-hazards.js";
import { resolveBackroomsMoveCollisions } from "./backrooms-fps-controller.js";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import { getLuck } from "./backrooms-luck.js";

export const DEATH_MOTH_SPRAY_DAMAGE = 35;
export const DEATH_MOTH_SPRAY_COOLDOWN = 10;
export const DEATH_MOTH_SEE_DIST = 18;
export const DEATH_MOTH_SPRAY_RANGE = 4.5;
export const DEATH_MOTH_FLY_SPEED = 3.1;
export const DEATH_MOTH_HOVER_Y = 1.55;
export const DEATH_MOTH_RADIUS = 0.34;

const SPRAY_DURATION = 0.42;
const HOME_RETURN_SPEED = 1.6;
const L3_MOTH_COUNT = 3;

var _sprayGeo = null;
var _sprayMat = null;

function sprayVfxAssets() {
  if (!_sprayGeo) _sprayGeo = new THREE.SphereGeometry(0.28, 8, 8);
  if (!_sprayMat) {
    _sprayMat = new THREE.MeshBasicMaterial({
      color: 0x3dcc44,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
  }
  return { geo: _sprayGeo, mat: _sprayMat };
}

function pickLevel3MothSpawns(mazeData, count) {
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
  var seed = ((mazeData.seed | 0) + 4041) | 0;
  var rng = mulberry32(seed);
  shuffle(cells, rng);
  var out = [];
  var i;
  for (i = 0; i < cells.length && out.length < count; i++) {
    var c = cells[i];
    if (Math.abs(c.x - spawn.x) + Math.abs(c.z - spawn.z) < 8) continue;
    var w = cellToWorld(c.x, c.z);
    out.push({
      x: w.x + (rng() - 0.5) * 0.35,
      z: w.z + (rng() - 0.5) * 0.35,
      y: DEATH_MOTH_HOVER_Y + rng() * 0.25,
    });
  }
  return out;
}

function cellToWorld(cx, cz) {
  return {
    x: (cx - MAZE_W * 0.5) * CELL,
    z: (cz - MAZE_H * 0.5) * CELL,
  };
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

function distSq(ax, az, bx, bz) {
  var dx = ax - bx;
  var dz = az - bz;
  return dx * dx + dz * dz;
}

function createSprayVfx(parent) {
  var assets = sprayVfxAssets();
  var mesh = new THREE.Mesh(assets.geo, assets.mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function createMothEntity(parent, spawn, opts) {
  opts = opts || {};
  var figure = buildDeathMothFigure();
  var group = figure.group;
  group.position.set(spawn.x, spawn.y != null ? spawn.y : DEATH_MOTH_HOVER_Y, spawn.z);
  if (spawn.rotY != null) group.rotation.y = spawn.rotY;
  parent.add(group);

  var sprayVfx = createSprayVfx(parent);

  var moth = {
    figure: figure,
    group: group,
    sprayVfx: sprayVfx,
    homeX: spawn.x,
    homeZ: spawn.z,
    homeY: spawn.y != null ? spawn.y : DEATH_MOTH_HOVER_Y,
    x: spawn.x,
    z: spawn.z,
    y: spawn.y != null ? spawn.y : DEATH_MOTH_HOVER_Y,
    rotY: spawn.rotY || 0,
    cooldown: 0,
    sprayLeft: 0,
    sprayApplied: false,
    dead: false,
    animT: Math.random() * 10,
    mode: "idle",
  };
  moth.health = registerBackroomsEntityTarget(group, {
    kind: "death_moth",
    name: "死亡飞蛾",
    maxHp: BACKROOMS_ENTITY_HEALTH.death_moth,
    aimHeight: 0,
    onDeath: function () {
      moth.dead = true;
      moth.mode = "dead";
      moth.group.visible = false;
      if (moth.sprayVfx) moth.sprayVfx.visible = false;
    },
  });
  return moth;
}

function killMoth(moth, toastFn, reason) {
  if (moth.dead) return;
  moth.dead = true;
  moth.mode = "dead";
  if (moth.health) {
    moth.health.hp = 0;
    moth.health.alive = false;
  }
  moth.group.visible = false;
  if (moth.sprayVfx) moth.sprayVfx.visible = false;
  if (toastFn && reason) toastFn(reason);
}

function isMothInActivePipeBurst(moth, pipeHazards, now) {
  if (!pipeHazards || !pipeHazards.length) return null;
  var i;
  for (i = 0; i < pipeHazards.length; i++) {
    var h = pipeHazards[i];
    if (now >= h.activeUntil) continue;
    if (distSq(moth.x, moth.z, h.x, h.z) <= BURST_RADIUS * BURST_RADIUS) {
      return h.kind === "acid" ? "强酸" : "蒸汽";
    }
  }
  return null;
}

function faceToward(moth, tx, tz) {
  var dx = tx - moth.x;
  var dz = tz - moth.z;
  if (dx * dx + dz * dz > 0.0004) {
    moth.rotY = Math.atan2(dx, dz);
    moth.group.rotation.y = moth.rotY;
  }
}

function moveMoth(moth, nx, nz, opts) {
  if (opts.mazeGrid) {
    var out = resolveCircleAgainstLevel3Maze(nx, nz, DEATH_MOTH_RADIUS, opts.mazeGrid);
    nx = out.x;
    nz = out.z;
  } else if (opts.wallColliders) {
    var resolved = resolveBackroomsMoveCollisions(
      nx,
      nz,
      DEATH_MOTH_RADIUS,
      opts.wallColliders,
      8
    );
    nx = resolved.x;
    nz = resolved.z;
  }
  moth.x = nx;
  moth.z = nz;
  moth.group.position.x = nx;
  moth.group.position.z = nz;
}

function updateSingleMoth(moth, dt, px, pz, survival, toastFn, opts) {
  if (moth.dead) return;

  var now = opts.now != null ? opts.now : performance.now();
  var hazardKind = isMothInActivePipeBurst(moth, opts.pipeHazards, now);
  if (hazardKind) {
    killMoth(moth, toastFn, "死亡飞蛾被" + hazardKind + "喷死");
    return;
  }

  moth.animT += dt;
  moth.figure.update(moth.animT);

  if (moth.cooldown > 0) moth.cooldown = Math.max(0, moth.cooldown - dt);

  if (moth.sprayLeft > 0) {
    moth.sprayLeft -= dt;
    faceToward(moth, px, pz);
    if (moth.sprayVfx) {
      moth.sprayVfx.visible = true;
      moth.sprayVfx.position.set(moth.x, moth.y - 0.05, moth.z);
      var pulse = 0.85 + Math.sin(moth.animT * 28) * 0.18;
      moth.sprayVfx.scale.setScalar(pulse);
      moth.sprayVfx.material.opacity = 0.25 + (moth.sprayLeft / SPRAY_DURATION) * 0.45;
    }
    if (!opts.playerSafe && !moth.sprayApplied && survival && !survival.dead) {
      var sdx = px - moth.x;
      var sdz = pz - moth.z;
      if (sdx * sdx + sdz * sdz <= (DEATH_MOTH_SPRAY_RANGE + 0.8) * (DEATH_MOTH_SPRAY_RANGE + 0.8)) {
        survival.takeDamage(DEATH_MOTH_SPRAY_DAMAGE);
        if (toastFn) toastFn("死亡飞蛾毒液！−" + DEATH_MOTH_SPRAY_DAMAGE + " 血量");
      }
      moth.sprayApplied = true;
    }
    if (moth.sprayLeft <= 0) {
      moth.mode = "idle";
      if (moth.sprayVfx) moth.sprayVfx.visible = false;
    }
    moth.group.position.y = moth.y + Math.sin(moth.animT * 5.5) * 0.03;
    return;
  }

  var seeSq = DEATH_MOTH_SEE_DIST * DEATH_MOTH_SEE_DIST;
  var spraySq = DEATH_MOTH_SPRAY_RANGE * DEATH_MOTH_SPRAY_RANGE;
  var toPlayerSq = distSq(moth.x, moth.z, px, pz);

  if (!opts.playerSafe && toPlayerSq <= seeSq) {
    faceToward(moth, px, pz);
    if (toPlayerSq <= spraySq && moth.cooldown <= 0) {
      moth.mode = "spray";
      moth.sprayLeft = SPRAY_DURATION;
      moth.sprayApplied = false;
      moth.cooldown = DEATH_MOTH_SPRAY_COOLDOWN;
      return;
    }
    moth.mode = "chase";
    var dist = Math.sqrt(toPlayerSq) || 0.001;
    var step = Math.min(DEATH_MOTH_FLY_SPEED * dt, Math.max(0, dist - DEATH_MOTH_SPRAY_RANGE * 0.72));
    if (step > 0.0001) {
      var nx = moth.x + ((px - moth.x) / dist) * step;
      var nz = moth.z + ((pz - moth.z) / dist) * step;
      moveMoth(moth, nx, nz, opts);
    }
  } else {
    moth.mode = "idle";
    var hdx = moth.homeX - moth.x;
    var hdz = moth.homeZ - moth.z;
    var homeSq = hdx * hdx + hdz * hdz;
    if (homeSq > 0.04) {
      var hdist = Math.sqrt(homeSq);
      var hstep = Math.min(HOME_RETURN_SPEED * dt, hdist);
      moveMoth(moth, moth.x + (hdx / hdist) * hstep, moth.z + (hdz / hdist) * hstep, opts);
    }
  }

  moth.y = moth.homeY + Math.sin(moth.animT * 4.2) * 0.04;
  moth.group.position.y = moth.y;
}

function createDeathMothSystem(parent, spawns, opts) {
  opts = opts || {};
  var luck = getLuck();
  if (luck >= 30) {
    spawns = spawns.filter(function () {
      return Math.random() < 0.55;
    });
  } else if (luck <= -30) {
    spawns = spawns.slice();
    var originals = spawns.slice();
    for (var s = 0; s < originals.length; s++) {
      if (Math.random() < 0.65) {
        spawns.push({
          x: originals[s].x + 1.15,
          z: originals[s].z + 1.15,
          y: originals[s].y,
          rotY: originals[s].rotY,
        });
      }
    }
  }
  var root = new THREE.Group();
  root.name = "DeathMoths";
  parent.add(root);

  var moths = [];
  var i;
  for (i = 0; i < spawns.length; i++) {
    moths.push(createMothEntity(root, spawns[i], opts));
  }

  return {
    root: root,
    moths: moths,
    mazeGrid: opts.mazeGrid || null,
    wallColliders: opts.wallColliders || null,
    update: function (dt, px, pz, survival, toastFn, extra) {
      extra = extra || {};
      var moveOpts = {
        mazeGrid: extra.mazeGrid != null ? extra.mazeGrid : opts.mazeGrid,
        wallColliders: extra.wallColliders != null ? extra.wallColliders : opts.wallColliders,
        pipeHazards: extra.pipeHazards,
        now: extra.now,
        playerSafe: !!extra.playerSafe,
      };
      for (i = 0; i < moths.length; i++) {
        updateSingleMoth(moths[i], dt, px, pz, survival, toastFn, moveOpts);
      }
    },
    dispose: function () {
      for (i = 0; i < moths.length; i++) {
        unregisterBackroomsEntityTarget(moths[i].health);
        moths[i].figure.dispose();
      }
    },
  };
}

/** 自定义关卡：按给定世界坐标生成死亡飞蛾 */
export function createDeathMothsAt(parent, spawns, wallColliders) {
  return createDeathMothSystem(parent, spawns || [], {
    wallColliders: wallColliders || null,
  });
}

/** L2：与笑靥同一走廊 1 只 */
export function createLevel2DeathMoth(parent, wallColliders) {
  var halfLen = CORRIDOR_LENGTH * 0.5;
  var spec = getLevel2SharedCorridorSpec(halfLen);
  var pos = insetCorridorPosition(spec, 14);
  return createDeathMothSystem(
    parent,
    [
      {
        x: pos.x,
        z: pos.z,
        y: 1.62,
        rotY: pos.rotY + Math.PI,
      },
    ],
    { wallColliders: wallColliders }
  );
}

/** L1.1-4 走廊 10 只死亡飞蛾 */
export function createLevel1_1_4DeathMoths(parent, wallColliders) {
  var spawns = [
    { x: -0.7, z: 22, y: 1.62 },
    { x: 0.5, z: 42, y: 1.66 },
    { x: -0.6, z: 62, y: 1.64 },
    { x: 0.4, z: 82, y: 1.68 },
    { x: -0.8, z: 102, y: 1.63 },
    { x: 0.6, z: 122, y: 1.67 },
    { x: -0.5, z: 142, y: 1.65 },
    { x: 0.7, z: 162, y: 1.64 },
    { x: -0.4, z: 178, y: 1.66 },
    { x: 0.3, z: 192, y: 1.68 },
  ];
  return createDeathMothSystem(parent, spawns, { wallColliders: wallColliders });
}

/** L1.1-3 走廊 3 只死亡飞蛾 */
export function createLevel1_1_3DeathMoths(parent, wallColliders) {
  return createDeathMothSystem(
    parent,
    [
      { x: -0.8, z: 14, y: 1.62 },
      { x: 0.6, z: 28, y: 1.68 },
      { x: -0.5, z: 42, y: 1.64 },
    ],
    { wallColliders: wallColliders }
  );
}

/** L1.1-2 走廊 1 只死亡飞蛾 */
export function createLevel1_1_2DeathMoth(parent, wallColliders, spawn) {
  spawn = spawn || { x: 0, z: 24, y: 1.62 };
  return createDeathMothSystem(parent, [spawn], { wallColliders: wallColliders });
}

/** L3：迷宫内随机 3 只（可被管道危害喷死） */
export function createLevel3DeathMoths(parent, mazeData) {
  var spawns = pickLevel3MothSpawns(mazeData, L3_MOTH_COUNT);
  return createDeathMothSystem(parent, spawns, { mazeGrid: mazeData.grid });
}

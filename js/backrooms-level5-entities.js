/**
 * Level 5 流式实体协调器：世界只产出描述符，本模块管理战斗实体生命周期。
 */
import { createFixedXiaoye } from "./backrooms-level2-xiaoye.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { createLevel2Hound } from "./backrooms-level2-hound.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";

export const L5_ENTITY_STATE_KEY = "backrooms_l5_entities_v1";
const MAX_ACTIVE = 8;
const SAFE_RADIUS = 20;

function readState() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(L5_ENTITY_STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(L5_ENTITY_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function healthFor(entry) {
  var system = entry && entry.system;
  if (!system) return null;
  if (system.health) return system.health;
  if (entry.kind === "death_moth" && system.moths && system.moths[0]) {
    return system.moths[0].health;
  }
  if (entry.kind === "clump" && system.clumps && system.clumps[0]) {
    return system.clumps[0].health;
  }
  return null;
}

export function createLevel5EntityManager(parent, colliders) {
  var active = new Map();
  var state = readState();
  var saveClock = 0;
  var liveSurvival = null;
  var liveEnvironment = null;

  var guardedSurvival = {
    get dead() {
      return !liveSurvival || liveSurvival.dead;
    },
    takeDamage: function (amount) {
      if (
        !liveSurvival ||
        liveSurvival.dead ||
        (liveEnvironment && liveEnvironment.spawnSafe)
      ) {
        return false;
      }
      return liveSurvival.takeDamage(amount);
    },
  };

  function canSee(fromX, fromZ, toX, toZ) {
    var dx = toX - fromX;
    var dz = toZ - fromZ;
    var distance = Math.hypot(dx, dz);
    if (distance < 0.01) return true;
    var block = raycastWallBlockDistance(
      { x: fromX, y: 1.3, z: fromZ },
      { x: dx / distance, y: 0, z: dz / distance },
      distance,
      colliders,
      0,
      3.4
    );
    return block >= distance - 0.35;
  }

  function makeSystem(spec) {
    if (spec.kind === "death_moth") {
      return createDeathMothsAt(
        parent,
        [{ x: spec.x, y: 1.7, z: spec.z, rotY: spec.rotation || 0 }],
        colliders,
        { applyLuck: false }
      );
    }
    if (spec.kind === "clump") {
      return createClumpsAt(
        parent,
        [{ x: spec.x, z: spec.z, rotY: spec.rotation || 0, seed: spec.seed || 1 }],
        colliders,
        { applyLuck: false }
      );
    }
    if (spec.kind === "hound") {
      return createLevel2Hound(parent, colliders, {
        id: spec.id,
        x: spec.x,
        z: spec.z,
        waypoints: spec.waypoints,
        canSee: canSee,
      });
    }
    if (spec.kind === "smiler") {
      return createFixedXiaoye(parent, {
        x: spec.x,
        z: spec.z,
        rotY: spec.rotation || 0,
        faceW: 1.8,
        faceH: 2.6,
        canSee: canSee,
      });
    }
    return null;
  }

  function remember(entry) {
    var health = healthFor(entry);
    if (!health) return;
    state[entry.id] = { hp: health.hp, dead: !health.alive || health.hp <= 0 };
  }

  function remove(id) {
    var entry = active.get(id);
    if (!entry) return;
    remember(entry);
    if (entry.system && entry.system.dispose) entry.system.dispose();
    var root = entry.system && (entry.system.root || entry.system.group);
    if (root && root.parent) root.parent.remove(root);
    active.delete(id);
  }

  function add(spec) {
    var stored = state[spec.id];
    if (stored && stored.dead) return;
    var system = makeSystem(spec);
    if (!system) return;
    var entry = { id: spec.id, kind: spec.kind, system: system, spec: spec };
    var health = healthFor(entry);
    if (health && stored && Number.isFinite(stored.hp)) {
      health.hp = Math.max(1, Math.min(health.maxHp, stored.hp));
    }
    active.set(spec.id, entry);
  }

  function reconcile(specs, px, pz) {
    var candidates = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      if (!spec || !spec.id || !spec.kind) continue;
      var distance = Math.hypot(spec.x - px, spec.z - pz);
      if (Math.hypot(spec.x, spec.z - 3) < SAFE_RADIUS) continue;
      candidates.push({ spec: spec, distance: distance });
    }
    candidates.sort(function (a, b) { return a.distance - b.distance; });
    var wanted = Object.create(null);
    for (var c = 0; c < Math.min(MAX_ACTIVE, candidates.length); c++) {
      wanted[candidates[c].spec.id] = candidates[c].spec;
    }
    var stale = [];
    active.forEach(function (_entry, id) {
      if (!wanted[id]) stale.push(id);
    });
    stale.forEach(remove);
    Object.keys(wanted).forEach(function (id) {
      if (!active.has(id)) add(wanted[id]);
    });
  }

  function update(dt, px, pz, survival, showToast, specs, environment, steamHazards) {
    reconcile(Array.isArray(specs) ? specs : [], px, pz);
    liveSurvival = survival;
    liveEnvironment = environment || null;
    active.forEach(function (entry) {
      var system = entry.system;
      if (!system || !system.update) return;
      if (entry.kind === "death_moth") {
        system.update(dt, px, pz, guardedSurvival, showToast, {
          wallColliders: colliders,
          pipeHazards: steamHazards,
          now: performance.now(),
          playerSafe: !!(environment && environment.spawnSafe),
        });
      } else if (entry.kind === "clump") {
        system.update(dt, px, pz, guardedSurvival, showToast, {
          wallColliders: colliders,
          playerSafe: !!(environment && environment.spawnSafe),
        });
      } else {
        system.update(dt, px, pz, guardedSurvival, showToast);
      }
    });
    liveSurvival = null;
    liveEnvironment = null;
    saveClock += dt;
    if (saveClock >= 5) {
      saveClock = 0;
      active.forEach(remember);
      writeState(state);
    }
  }

  return {
    update: update,
    getActiveCount: function () { return active.size; },
    dispose: function () {
      Array.from(active.keys()).forEach(remove);
      writeState(state);
    },
  };
}

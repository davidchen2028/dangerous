import { createFixedXiaoye } from "./backrooms-level2-xiaoye.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
import { createLevel2Hound } from "./backrooms-level2-hound.js?v=2";
import { L2_SPAWN_X, L2_SPAWN_Z } from "./backrooms-level2-constants.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";

export const LEVEL2_ENTITY_STATE_KEY = "backrooms_l2_entities_v2";
const MAX_ACTIVE_ENTITIES = 10;
const MIN_PLAYER_SPAWN_DISTANCE = 28;

function readState() {
  try {
    var value = JSON.parse(sessionStorage.getItem(LEVEL2_ENTITY_STATE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(LEVEL2_ENTITY_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* storage may be unavailable */
  }
}

function healthFor(entry) {
  if (!entry || !entry.system) return null;
  if (entry.system.health) return entry.system.health;
  if (entry.kind === "death_moth" && entry.system.moths && entry.system.moths[0]) {
    return entry.system.moths[0].health;
  }
  if (entry.kind === "clump" && entry.system.clumps && entry.system.clumps[0]) {
    return entry.system.clumps[0].health;
  }
  return null;
}

function createSystem(parent, colliders, spec) {
  function canSee(fromX, fromZ, toX, toZ) {
    var dx = toX - fromX;
    var dz = toZ - fromZ;
    var distance = Math.hypot(dx, dz);
    if (distance < 0.01) return true;
    var block = raycastWallBlockDistance(
      { x: fromX, y: 1.35, z: fromZ },
      { x: dx / distance, y: 0, z: dz / distance },
      distance,
      colliders,
      0,
      3.2
    );
    return block >= distance - 0.35;
  }
  if (spec.kind === "smiler") {
    return createFixedXiaoye(parent, {
      x: spec.x,
      z: spec.z,
      rotY: spec.rotation || 0,
      faceW: 2.4,
      faceH: 3.2,
      canSee: canSee,
    });
  }
  if (spec.kind === "death_moth") {
    return createDeathMothsAt(
      parent,
      [{ x: spec.x, z: spec.z, y: 1.75, rotY: spec.rotation || 0 }],
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
  return null;
}

/**
 * Reconciles deterministic chunk spawn descriptors with live entity systems.
 * The world owns descriptor generation; this manager owns combat lifetime.
 */
export function createLevel2EntityManager(parent, colliders, opts) {
  opts = opts || {};
  var state = readState();
  var active = new Map();
  var saveClock = 0;
  var damageGrace = 0;
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
        damageGrace > 0 ||
        (liveEnvironment && liveEnvironment.spawnSafe)
      ) {
        return false;
      }
      damageGrace = 0.7;
      liveSurvival.takeDamage(amount);
      return true;
    },
  };

  function remember(entry) {
    var health = healthFor(entry);
    if (!health) return;
    state[entry.id] = {
      hp: health.hp,
      dead: !health.alive || health.hp <= 0,
    };
  }

  function remove(id) {
    var entry = active.get(id);
    if (!entry) return;
    remember(entry);
    if (entry.system && entry.system.dispose) entry.system.dispose();
    active.delete(id);
  }

  function add(spec) {
    var stored = state[spec.id];
    if (stored && stored.dead) return;
    var system = createSystem(parent, colliders, spec);
    if (!system) return;
    var entry = { id: spec.id, kind: spec.kind, spec: spec, system: system };
    var health = healthFor(entry);
    if (health && stored && Number.isFinite(stored.hp)) {
      health.hp = Math.max(1, Math.min(health.maxHp, stored.hp));
    }
    active.set(spec.id, entry);
  }

  function reconcile(specs, playerX, playerZ) {
    specs = Array.isArray(specs) ? specs : [];
    var wanted = Object.create(null);
    var candidates = [];
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      if (!spec || !spec.id || !spec.kind) continue;
      if (
        Math.hypot(spec.x - L2_SPAWN_X, spec.z - L2_SPAWN_Z) <
        MIN_PLAYER_SPAWN_DISTANCE
      ) {
        continue;
      }
      var distance = Math.hypot(spec.x - playerX, spec.z - playerZ);
      candidates.push({ spec: spec, distance: distance });
    }
    candidates.sort(function (a, b) { return a.distance - b.distance; });
    for (var c = 0; c < Math.min(MAX_ACTIVE_ENTITIES, candidates.length); c++) {
      wanted[candidates[c].spec.id] = candidates[c].spec;
    }
    var removeIds = [];
    active.forEach(function (_entry, id) {
      if (!wanted[id]) removeIds.push(id);
    });
    removeIds.forEach(remove);
    Object.keys(wanted).forEach(function (id) {
      if (!active.has(id)) add(wanted[id]);
    });
  }

  function update(dt, px, pz, survival, showToast, specs, environment) {
    reconcile(specs, px, pz);
    damageGrace = Math.max(0, damageGrace - dt);
    liveSurvival = survival;
    liveEnvironment = environment || null;
    active.forEach(function (entry) {
      var system = entry.system;
      if (!system || !system.update) return;
      if (entry.kind === "death_moth") {
        system.update(dt, px, pz, guardedSurvival, showToast, {
          wallColliders: colliders,
          now: performance.now(),
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

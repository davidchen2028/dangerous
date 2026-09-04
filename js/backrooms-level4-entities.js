import * as THREE from "three";
import { createLevel2Hound } from "./backrooms-level2-hound.js";
import {
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import {
  raycastWallBlockDistance,
  resolveCircleAgainstColliders,
} from "./backrooms-collide.js";

export const L4_ENTITY_STATE_KEY = "backrooms_l4_entities_v1";
export const L4_MAX_ACTIVE_ENTITIES = 3;
export const L4_ENTITY_SAFE_RADIUS = 34;

function readState() {
  try {
    var value = JSON.parse(sessionStorage.getItem(L4_ENTITY_STATE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(L4_ENTITY_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function createDuller(parent, colliders, spec, canSee) {
  var group = new THREE.Group();
  group.name = "Level4Duller_" + spec.id;
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.rotation || 0;
  parent.add(group);
  var bodyMat = new THREE.MeshStandardMaterial({
    color: 0x73777c,
    emissive: 0x101114,
    roughness: 0.92,
  });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.95 });
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.05, 0.32), bodyMat);
  torso.position.y = 1.05;
  group.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 7), darkMat);
  head.position.y = 1.75;
  group.add(head);
  for (var side = -1; side <= 1; side += 2) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), bodyMat);
    leg.position.set(side * 0.17, 0.4, 0);
    group.add(leg);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.9, 0.14), bodyMat);
    arm.position.set(side * 0.4, 1.02, 0);
    group.add(arm);
  }
  var alive = true;
  var cooldown = 0;
  var health = registerBackroomsEntityTarget(group, {
    kind: "duller",
    name: "钝人",
    maxHp: 75,
    aimHeight: 1.2,
    onDeath: function () {
      alive = false;
      group.visible = false;
    },
  });

  function update(dt, px, pz, survival, showToast) {
    if (!alive) return;
    cooldown = Math.max(0, cooldown - dt);
    var dx = px - group.position.x;
    var dz = pz - group.position.z;
    var distance = Math.hypot(dx, dz);
    var sees = distance <= 12 && canSee(group.position.x, group.position.z, px, pz);
    var targetX = sees ? px : spec.x + Math.sin(performance.now() * 0.00018 + spec.seed) * 4;
    var targetZ = sees ? pz : spec.z + Math.cos(performance.now() * 0.00016 + spec.seed) * 4;
    var mdx = targetX - group.position.x;
    var mdz = targetZ - group.position.z;
    var moveDistance = Math.hypot(mdx, mdz) || 1;
    var speed = sees ? 1.65 : 0.45;
    var step = Math.min(speed * dt, moveDistance);
    var resolved = resolveCircleAgainstColliders(
      group.position.x + (mdx / moveDistance) * step,
      group.position.z + (mdz / moveDistance) * step,
      0.34,
      colliders,
      10
    );
    group.position.x = resolved.x;
    group.position.z = resolved.z;
    group.rotation.y = Math.atan2(mdx, mdz);
    if (sees && distance <= 1.1 && cooldown <= 0 && survival && !survival.dead) {
      cooldown = 2.2;
      if (survival.takeDamage(18) !== false && showToast) {
        showToast("钝人抓伤 · −18 血量");
      }
    }
  }

  return {
    group: group,
    health: health,
    update: update,
    dispose: function () {
      unregisterBackroomsEntityTarget(health);
      if (group.parent) group.parent.remove(group);
      group.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
      });
      bodyMat.dispose();
      darkMat.dispose();
    },
  };
}

export function createLevel4EntityManager(parent, colliders) {
  var active = new Map();
  var state = readState();

  function canSee(fromX, fromZ, toX, toZ) {
    var dx = toX - fromX;
    var dz = toZ - fromZ;
    var distance = Math.hypot(dx, dz);
    if (distance < 0.01) return true;
    return raycastWallBlockDistance(
      { x: fromX, y: 1.2, z: fromZ },
      { x: dx / distance, y: 0, z: dz / distance },
      distance,
      colliders,
      0,
      2.75
    ) >= distance - 0.3;
  }

  function remember(entry) {
    if (!entry || !entry.system || !entry.system.health) return;
    state[entry.id] = {
      hp: entry.system.health.hp,
      dead: !entry.system.health.alive || entry.system.health.hp <= 0,
    };
  }

  function remove(id) {
    var entry = active.get(id);
    if (!entry) return;
    remember(entry);
    entry.system.dispose();
    active.delete(id);
  }

  function add(spec) {
    var stored = state[spec.id];
    if (stored && stored.dead) return;
    var system =
      spec.kind === "hound"
        ? createLevel2Hound(parent, colliders, {
            id: spec.id,
            x: spec.x,
            z: spec.z,
            canSee: canSee,
            waypoints: [
              { x: spec.x - 4, z: spec.z },
              { x: spec.x + 4, z: spec.z },
            ],
          })
        : createDuller(parent, colliders, spec, canSee);
    if (stored && Number.isFinite(stored.hp)) {
      system.health.hp = Math.max(1, Math.min(system.health.maxHp, stored.hp));
    }
    active.set(spec.id, { id: spec.id, kind: spec.kind, system: system });
  }

  function reconcile(specs, px, pz) {
    var candidates = (specs || [])
      .filter(function (spec) {
        return spec && Math.hypot(spec.x, spec.z - 2) >= L4_ENTITY_SAFE_RADIUS;
      })
      .map(function (spec) {
        return { spec: spec, distance: Math.hypot(spec.x - px, spec.z - pz) };
      })
      .sort(function (a, b) {
        return a.distance - b.distance;
      })
      .slice(0, L4_MAX_ACTIVE_ENTITIES);
    var wanted = Object.create(null);
    candidates.forEach(function (candidate) {
      wanted[candidate.spec.id] = candidate.spec;
    });
    Array.from(active.keys()).forEach(function (id) {
      if (!wanted[id]) remove(id);
    });
    Object.keys(wanted).forEach(function (id) {
      if (!active.has(id)) add(wanted[id]);
    });
  }

  return {
    update: function (dt, px, pz, survival, showToast, specs, playerSafe) {
      reconcile(specs, px, pz);
      if (playerSafe) return;
      active.forEach(function (entry) {
        entry.system.update(dt, px, pz, survival, showToast);
      });
    },
    getActiveCount: function () {
      return active.size;
    },
    getActiveEntries: function () {
      return Array.from(active.values());
    },
    dispose: function () {
      Array.from(active.keys()).forEach(remove);
      writeState(state);
    },
  };
}

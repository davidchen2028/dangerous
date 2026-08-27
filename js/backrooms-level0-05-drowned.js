/**
 * Level 0.5 “溺尸”。
 * 控制器只通过 callbacks 报告伤害；碰撞体、门与污水边界由场景注入。
 */
import * as THREE from "three";

function getPosition(value) {
  var source = value && value.player ? value.player : value;
  return {
    x: source && Number.isFinite(source.x) ? source.x : 0,
    z: source && Number.isFinite(source.z) ? source.z : 0,
  };
}

function activeCollider(box) {
  return box && !box.ghost && box.minX < box.maxX && box.minZ < box.maxZ;
}

function circleHitsBox(x, z, radius, box) {
  if (!activeCollider(box)) return false;
  var cx = Math.max(box.minX, Math.min(x, box.maxX));
  var cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  var dx = x - cx;
  var dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

function segmentClear(ax, az, bx, bz, radius, colliders, ignoreDoors) {
  var distance = Math.hypot(bx - ax, bz - az);
  var steps = Math.max(1, Math.ceil(distance / 0.32));
  for (var step = 1; step <= steps; step++) {
    var t = step / steps;
    var x = ax + (bx - ax) * t;
    var z = az + (bz - az) * t;
    for (var i = 0; i < colliders.length; i++) {
      if (ignoreDoors && colliders[i] && colliders[i].level05Door) continue;
      if (circleHitsBox(x, z, radius, colliders[i])) return false;
    }
  }
  return true;
}

function nearestNode(nodes, x, z) {
  var best = -1;
  var bestDistance = Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var dx = nodes[i].x - x;
    var dz = nodes[i].z - z;
    var distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function findPath(nodes, start, goal, colliders, radius) {
  if (start < 0 || goal < 0) return [];
  var queue = [start];
  var parent = new Array(nodes.length).fill(-1);
  parent[start] = start;
  for (var read = 0; read < queue.length; read++) {
    var current = queue[read];
    if (current === goal) break;
    var links = nodes[current].links || [];
    for (var li = 0; li < links.length; li++) {
      var next = links[li];
      if (parent[next] !== -1 || !nodes[next]) continue;
      if (
        !segmentClear(
          nodes[current].x,
          nodes[current].z,
          nodes[next].x,
          nodes[next].z,
          radius,
          colliders,
          true
        )
      ) {
        continue;
      }
      parent[next] = current;
      queue.push(next);
    }
  }
  if (parent[goal] === -1) return [];
  var path = [];
  var cursor = goal;
  while (cursor !== start) {
    path.push(cursor);
    cursor = parent[cursor];
  }
  path.reverse();
  return path;
}

/**
 * @param {THREE.Object3D} parent
 * @param {object} opts
 * @returns {{group:THREE.Group,update:Function,getState:Function,dispose:Function}}
 */
export function createLevel05Drowned(parent, opts) {
  opts = opts || {};
  var colliders = opts.colliders || [];
  var navNodes = opts.navNodes || [];
  var waterBounds = opts.waterBounds || {
    minX: -4,
    maxX: 4,
    minZ: -5,
    maxZ: 24,
  };
  var speed = Number.isFinite(opts.speed) ? opts.speed : 1.68;
  var radius = Number.isFinite(opts.radius) ? opts.radius : 0.31;
  var disposed = false;
  var dissolved = false;
  var dissolve = 0;
  var elapsed = 0;
  var damageCooldown = 0;
  var repathTimer = 0;
  var path = [];
  var pathCursor = 0;
  var blockedTime = 0;

  var group = new THREE.Group();
  group.name = "Level05Drowned";
  group.position.set(
    Number.isFinite(opts.x) ? opts.x : 0,
    0,
    Number.isFinite(opts.z) ? opts.z : -35
  );
  if (parent && parent.add) parent.add(group);

  var skin = new THREE.MeshStandardMaterial({
    color: 0x59645d,
    roughness: 0.96,
    transparent: true,
  });
  var cloth = new THREE.MeshStandardMaterial({
    color: 0x343b39,
    roughness: 1,
    transparent: true,
  });
  var wet = new THREE.MeshStandardMaterial({
    color: 0x171d1b,
    roughness: 0.48,
    metalness: 0.08,
    transparent: true,
  });
  var eye = new THREE.MeshBasicMaterial({
    color: 0xcdd9b0,
    transparent: true,
  });
  var bodyGeo = new THREE.BoxGeometry(0.48, 0.78, 0.25);
  var headGeo = new THREE.SphereGeometry(0.22, 8, 6);
  var limbGeo = new THREE.BoxGeometry(0.13, 0.72, 0.13);
  var eyeGeo = new THREE.SphereGeometry(0.032, 5, 4);

  var torso = new THREE.Mesh(bodyGeo, cloth);
  torso.position.y = 1.12;
  group.add(torso);
  var head = new THREE.Mesh(headGeo, skin);
  head.position.set(0, 1.68, -0.03);
  group.add(head);
  var limbs = [];
  for (var i = 0; i < 4; i++) {
    var limb = new THREE.Mesh(limbGeo, i < 2 ? skin : wet);
    limb.position.set(i % 2 ? 0.29 : -0.29, i < 2 ? 1.08 : 0.42, 0);
    if (i >= 2) limb.position.x *= 0.55;
    group.add(limb);
    limbs.push(limb);
  }
  for (var e = 0; e < 2; e++) {
    var pupil = new THREE.Mesh(eyeGeo, eye);
    pupil.position.set(e ? 0.078 : -0.078, 1.72, -0.2);
    group.add(pupil);
  }

  function inWater(x, z) {
    return (
      x >= waterBounds.minX &&
      x <= waterBounds.maxX &&
      z >= waterBounds.minZ &&
      z <= waterBounds.maxZ
    );
  }

  function moveWithCollision(dx, dz) {
    var oldX = group.position.x;
    var oldZ = group.position.z;
    var nextX = oldX + dx;
    var nextZ = oldZ + dz;
    var hit = null;
    for (var i = 0; i < colliders.length; i++) {
      if (circleHitsBox(nextX, oldZ, radius, colliders[i])) {
        hit = colliders[i];
        nextX = oldX;
        break;
      }
    }
    for (var j = 0; j < colliders.length; j++) {
      if (circleHitsBox(nextX, nextZ, radius, colliders[j])) {
        hit = colliders[j];
        nextZ = oldZ;
        break;
      }
    }
    group.position.set(nextX, 0, nextZ);
    return hit;
  }

  function rebuildPath(target) {
    var start = nearestNode(navNodes, group.position.x, group.position.z);
    var goal = nearestNode(navNodes, target.x, target.z);
    path = findPath(navNodes, start, goal, colliders, radius);
    pathCursor = 0;
  }

  function update(dt, player, callbacks) {
    if (disposed || dissolved) return;
    callbacks = callbacks || {};
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.08));
    elapsed += delta;
    damageCooldown = Math.max(0, damageCooldown - delta);
    repathTimer -= delta;
    var target = getPosition(player);

    if (inWater(group.position.x, group.position.z)) {
      dissolve += delta / 1.65;
      var opacity = Math.max(0, 1 - dissolve);
      skin.opacity = opacity;
      cloth.opacity = opacity;
      wet.opacity = opacity;
      eye.opacity = opacity;
      group.scale.y = Math.max(0.08, opacity);
      group.position.y = -dissolve * 0.7;
      if (typeof callbacks.onDrownedDissolve === "function") {
        callbacks.onDrownedDissolve(Math.min(1, dissolve), group);
      }
      if (dissolve >= 1) {
        dissolved = true;
        group.visible = false;
      }
      return;
    }

    var dx = target.x - group.position.x;
    var dz = target.z - group.position.z;
    var distance = Math.hypot(dx, dz);
    var goalX = target.x;
    var goalZ = target.z;
    if (!segmentClear(group.position.x, group.position.z, target.x, target.z, radius, colliders)) {
      if (repathTimer <= 0) {
        rebuildPath(target);
        repathTimer = 0.38;
      }
      if (pathCursor < path.length) {
        var node = navNodes[path[pathCursor]];
        goalX = node.x;
        goalZ = node.z;
        if (Math.hypot(goalX - group.position.x, goalZ - group.position.z) < 0.38) {
          pathCursor += 1;
          if (pathCursor < path.length) {
            node = navNodes[path[pathCursor]];
            goalX = node.x;
            goalZ = node.z;
          }
        }
      }
    }

    var mx = goalX - group.position.x;
    var mz = goalZ - group.position.z;
    var moveDistance = Math.hypot(mx, mz);
    var hit = null;
    if (moveDistance > 0.025) {
      var step = Math.min(moveDistance, speed * delta);
      hit = moveWithCollision((mx / moveDistance) * step, (mz / moveDistance) * step);
      group.rotation.y = Math.atan2(mx, mz);
      blockedTime = hit ? blockedTime + delta : 0;
      if (
        hit &&
        hit.level05Door &&
        blockedTime > 1.15 &&
        typeof opts.onDoorPressure === "function"
      ) {
        opts.onDoorPressure(hit, group);
        blockedTime = 0;
        repathTimer = 0;
      }
    }

    var stride = Math.sin(elapsed * speed * 8.2) * 0.42;
    limbs[0].rotation.x = stride;
    limbs[1].rotation.x = -stride;
    limbs[2].rotation.x = -stride * 0.72;
    limbs[3].rotation.x = stride * 0.72;
    torso.rotation.z = Math.sin(elapsed * 3.1) * 0.035;

    if (distance < 0.72 && damageCooldown <= 0) {
      damageCooldown = 0.72;
      if (typeof callbacks.onDamage === "function") {
        callbacks.onDamage(12, {
          source: "level05_drowned",
          entity: group,
          unavoidableAwareness: true,
        });
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    bodyGeo.dispose();
    headGeo.dispose();
    limbGeo.dispose();
    eyeGeo.dispose();
    skin.dispose();
    cloth.dispose();
    wet.dispose();
    eye.dispose();
    group.clear();
    path.length = 0;
  }

  return {
    group: group,
    update: update,
    getState: function getState() {
      return {
        dissolved: dissolved,
        dissolve: Math.min(1, dissolve),
        x: group.position.x,
        z: group.position.z,
        alwaysAware: true,
      };
    },
    dispose: dispose,
  };
}

export default createLevel05Drowned;

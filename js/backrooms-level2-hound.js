import * as THREE from "three";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";

const NOTICE_DISTANCE = 15;
const ATTACK_DISTANCE = 1.25;
const WALK_SPEED = 1.15;
const CHASE_SPEED = 3.65;
const ATTACK_DAMAGE = 28;

export function createLevel2Hound(parent, wallColliders) {
  var group = new THREE.Group();
  group.name = "Level2Hound";
  group.position.set(0.25, 0, 36);
  parent.add(group);

  var hideMat = new THREE.MeshStandardMaterial({
    color: 0x302b27,
    emissive: 0x080706,
    roughness: 0.96,
  });
  var eyeMat = new THREE.MeshBasicMaterial({ color: 0xe9d8ba });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.52, 0.52), hideMat);
  body.position.y = 0.72;
  group.add(body);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.58), hideMat);
  head.position.set(0, 0.84, -0.65);
  group.add(head);
  for (var eyeSide = -1; eyeSide <= 1; eyeSide += 2) {
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), eyeMat);
    eye.position.set(eyeSide * 0.16, 0.93, -0.95);
    group.add(eye);
  }
  var legs = [];
  for (var i = 0; i < 4; i++) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), hideMat);
    leg.position.set(i % 2 ? 0.42 : -0.42, 0.32, i < 2 ? -0.26 : 0.26);
    group.add(leg);
    legs.push(leg);
  }

  var home = { x: group.position.x, z: group.position.z };
  var patrolAngle = Math.PI;
  var attackCooldown = 0;
  var alive = true;
  var health = registerBackroomsEntityTarget(group, {
    kind: "hound",
    name: "猎犬",
    maxHp: BACKROOMS_ENTITY_HEALTH.hound || 90,
    aimHeight: 0.72,
    onDeath: function () {
      alive = false;
      group.visible = false;
    },
  });

  function moveToward(tx, tz, speed, dt) {
    var dx = tx - group.position.x;
    var dz = tz - group.position.z;
    var distance = Math.hypot(dx, dz) || 1;
    var step = Math.min(distance, speed * dt);
    var nextX = group.position.x + (dx / distance) * step;
    var nextZ = group.position.z + (dz / distance) * step;
    var resolved = resolveCircleAgainstColliders(
      nextX,
      nextZ,
      0.38,
      wallColliders || [],
      8
    );
    group.position.x = resolved.x;
    group.position.z = resolved.z;
    group.rotation.y = Math.atan2(dx, dz);
    return distance;
  }

  function update(dt, px, pz, survival, showToast) {
    if (!alive) return;
    attackCooldown = Math.max(0, attackCooldown - dt);
    var dx = px - group.position.x;
    var dz = pz - group.position.z;
    var distance = Math.hypot(dx, dz);
    var chasing = distance <= NOTICE_DISTANCE;
    if (chasing) {
      distance = moveToward(px, pz, CHASE_SPEED, dt);
    } else {
      patrolAngle += dt * 0.28;
      moveToward(home.x + Math.sin(patrolAngle) * 0.65, home.z + Math.cos(patrolAngle) * 8, WALK_SPEED, dt);
    }
    var stride = performance.now() * (chasing ? 0.011 : 0.0045);
    for (var i = 0; i < legs.length; i++) {
      legs[i].rotation.x = Math.sin(stride + (i % 2 ? Math.PI : 0)) * (chasing ? 0.72 : 0.28);
    }
    if (distance <= ATTACK_DISTANCE && attackCooldown <= 0 && survival && !survival.dead) {
      attackCooldown = 1.4;
      survival.takeDamage(ATTACK_DAMAGE);
      if (showToast) showToast("猎犬扑咬 · −" + ATTACK_DAMAGE + " 血量");
    }
  }

  function dispose() {
    unregisterBackroomsEntityTarget(health);
    if (group.parent) group.parent.remove(group);
    group.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
    });
    hideMat.dispose();
    eyeMat.dispose();
  }

  return { group: group, update: update, dispose: dispose };
}

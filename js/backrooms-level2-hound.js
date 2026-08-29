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

/**
 * @param {THREE.Object3D} parent
 * @param {object[]} wallColliders
 * @param {{x?:number,z?:number,id?:string,waypoints?:Array<{x:number,z:number}>,canSee?:Function}} [spec]
 */
export function createLevel2Hound(parent, wallColliders, spec) {
  spec = spec || {};
  var group = new THREE.Group();
  group.name = "Level2Hound_" + (spec.id || "legacy");
  group.position.set(
    Number.isFinite(spec.x) ? spec.x : 0.25,
    0,
    Number.isFinite(spec.z) ? spec.z : 36
  );
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
  var waypoints =
    Array.isArray(spec.waypoints) && spec.waypoints.length
      ? spec.waypoints
      : [
          { x: home.x, z: home.z - 7 },
          { x: home.x, z: home.z + 7 },
        ];
  var waypointIndex = 0;
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
    var noticed = distance <= NOTICE_DISTANCE;
    var chasing =
      noticed &&
      (!spec.canSee ||
        spec.canSee(group.position.x, group.position.z, px, pz));
    if (chasing) {
      distance = moveToward(px, pz, CHASE_SPEED, dt);
    } else if (noticed && waypoints.length) {
      // 玩家拐过墙角后先追到离玩家最近的路网端点，再重新获取视线。
      var chasePoint = waypoints[0];
      var chasePointDistance = Math.hypot(px - chasePoint.x, pz - chasePoint.z);
      for (var wi = 1; wi < waypoints.length; wi++) {
        var candidateDistance = Math.hypot(px - waypoints[wi].x, pz - waypoints[wi].z);
        if (candidateDistance < chasePointDistance) {
          chasePoint = waypoints[wi];
          chasePointDistance = candidateDistance;
        }
      }
      moveToward(chasePoint.x, chasePoint.z, CHASE_SPEED * 0.72, dt);
    } else {
      var waypoint = waypoints[waypointIndex % waypoints.length];
      if (Math.hypot(group.position.x - waypoint.x, group.position.z - waypoint.z) < 0.7) {
        waypointIndex = (waypointIndex + 1) % waypoints.length;
        waypoint = waypoints[waypointIndex];
      }
      moveToward(waypoint.x, waypoint.z, WALK_SPEED, dt);
    }
    var stride = performance.now() * (chasing ? 0.011 : 0.0045);
    for (var i = 0; i < legs.length; i++) {
      legs[i].rotation.x = Math.sin(stride + (i % 2 ? Math.PI : 0)) * (chasing ? 0.72 : 0.28);
    }
    if (distance <= ATTACK_DISTANCE && attackCooldown <= 0 && survival && !survival.dead) {
      attackCooldown = 1.4;
      var applied = survival.takeDamage(ATTACK_DAMAGE) !== false;
      if (applied && showToast) showToast("猎犬扑咬 · −" + ATTACK_DAMAGE + " 血量");
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

  return { group: group, health: health, update: update, dispose: dispose };
}

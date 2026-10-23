/**
 * 丹灵逃跑、丹魔追击、壳投掷。
 */
import * as THREE from "three";
import { resolveBackroomsMoveCollisions } from "./backrooms-fps-controller.js";
import {
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import {
  C1166_PILL_BLACK,
  C1166_SHELL_ID,
  c1166ItemName,
  rollSpiritPill,
} from "./backrooms-level-c1166-pills.js";
import { getSelectedHotbarItem } from "./backrooms-inventory.js";

var SPIRIT_SPEED = 8;
var DEMON_SPEED = 6.5;
var SHELL_SPEED = 16;
var SHELL_RANGE = 18;

function polar(deg, radius) {
  var a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * radius, z: Math.cos(a) * radius };
}

function copyMove(resolved) {
  return { x: resolved.x, z: resolved.z };
}

export function createC1166Entities(opts) {
  var parent = opts.parent;
  var colliders = opts.colliders;
  var interactRoots = opts.interactRoots;
  var showToast = opts.showToast || function () {};
  var onKanClear = opts.onKanClear || function () {};
  var rng = opts.rng || Math.random;
  var list = [];
  var shells = [];
  var palace = "kan";
  var respawn = 0;
  var demonToastAt = 0;
  var aggro = false;

  function dropLoot(x, z, itemId) {
    var color = 0xf4efe6;
    if (itemId === "c1166_pill_orange") color = 0xe07020;
    if (itemId === "c1166_pill_blue") color = 0x3a6fd8;
    if (itemId === C1166_PILL_BLACK) color = 0x1a1a1a;
    if (itemId === C1166_SHELL_ID) color = 0xf7f1e4;
    var mesh = new THREE.Mesh(
      itemId === C1166_SHELL_ID
        ? new THREE.SphereGeometry(0.16, 10, 8)
        : new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: itemId === C1166_SHELL_ID ? 0.4 : 0.05 })
    );
    if (itemId === C1166_SHELL_ID) mesh.scale.y = 0.35;
    mesh.position.set(x, 0.2, z);
    parent.add(mesh);
    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.4, 0.45),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.set(x, 0.25, z);
    var lootData = {
      kind: "c1166_loot",
      itemId: itemId,
      name: c1166ItemName(itemId),
      mesh: mesh,
      pick: pick,
    };
    pick.userData.brInteract = lootData;
    parent.add(pick);
    interactRoots.push(pick);
  }

  function removeActor(actor) {
    unregisterBackroomsEntityTarget(actor.target);
    if (actor.group.parent) actor.group.parent.remove(actor.group);
    var at = list.indexOf(actor);
    if (at >= 0) list.splice(at, 1);
  }

  function spawnSpirit(x, z) {
    var group = new THREE.Group();
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.72 })
    );
    mesh.position.y = 0.28;
    group.add(mesh);
    group.position.set(x, 0, z);
    parent.add(group);
    var actor = { kind: "spirit", group: group, x: x, z: z, stuck: 0, px: x, pz: z };
    actor.target = registerBackroomsEntityTarget(group, {
      kind: "c1166_spirit",
      name: "丹灵",
      maxHp: 40,
      aimHeight: 0.28,
      onDeath: function () {
        dropLoot(actor.x, actor.z, C1166_SHELL_ID);
        dropLoot(actor.x + 0.35, actor.z, rollSpiritPill(palace, rng));
        if (palace === "kan") {
          onKanClear();
          respawn = 8;
        }
        removeActor(actor);
      },
    });
    list.push(actor);
    return actor;
  }

  function spawnDemon(x, z) {
    var group = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.15, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x4a3028, metalness: 0.8, roughness: 0.35 })
    );
    body.position.y = 0.95;
    group.add(body);
    var head = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.28, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x2c1c18, metalness: 0.7, roughness: 0.4 })
    );
    head.position.y = 1.7;
    group.add(head);
    group.position.set(x, 0, z);
    parent.add(group);
    var actor = { kind: "demon", group: group, x: x, z: z, cool: 0 };
    actor.target = registerBackroomsEntityTarget(group, {
      kind: "c1166_demon",
      name: "丹魔",
      maxHp: 100000,
      aimHeight: 1.1,
      onDamage: function (target) {
        target.hp = target.maxHp;
        var now = performance.now();
        if (now - demonToastAt > 1000) {
          demonToastAt = now;
          showToast("甲壳没破");
        }
      },
      onDeath: function () {
        dropLoot(actor.x, actor.z + 0.4, C1166_PILL_BLACK);
        removeActor(actor);
      },
    });
    actor.target.breakByShell = function () {
      if (!actor.target.alive) return;
      actor.target.hp = 0;
      actor.target.alive = false;
      dropLoot(actor.x, actor.z + 0.4, C1166_PILL_BLACK);
      showToast("丹灵壳击碎了丹魔");
      removeActor(actor);
    };
    list.push(actor);
    return actor;
  }

  function clear() {
    var i;
    for (i = list.length - 1; i >= 0; i--) removeActor(list[i]);
    list.length = 0;
    for (i = shells.length - 1; i >= 0; i--) {
      if (shells[i].mesh.parent) shells[i].mesh.parent.remove(shells[i].mesh);
    }
    shells.length = 0;
    aggro = false;
    respawn = 0;
  }

  function spawnPalace(next) {
    clear();
    palace = next;
    var specs = [];
    if (next === "kan") {
      specs = [
        ["spirit", 30],
        ["spirit", 150],
        ["spirit", 270],
      ];
    } else if (next === "zhen") {
      specs = [
        ["demon", 0],
        ["demon", 120],
        ["demon", 240],
        ["spirit", 60],
        ["spirit", 200],
      ];
    } else if (next === "qian" || next === "dui") {
      specs = [
        ["demon", 20],
        ["demon", 200],
        ["spirit", 90],
        ["spirit", 270],
      ];
    } else if (next === "gen") {
      specs = [
        ["demon", 45],
        ["demon", 135],
        ["demon", 225],
        ["demon", 315],
      ];
    } else if (next === "li") {
      spawnDemon(0, -16);
      spawnDemon(0, -28);
      return;
    }
    var i;
    for (i = 0; i < specs.length; i++) {
      var at = polar(specs[i][1], specs[i][0] === "demon" ? 7 : 8);
      if (specs[i][0] === "demon") spawnDemon(at.x, at.z);
      else spawnSpirit(at.x, at.z);
    }
  }

  function spiritCount() {
    var n = 0;
    var i;
    for (i = 0; i < list.length; i++) if (list[i].kind === "spirit") n += 1;
    return n;
  }

  function update(dt, px, pz, survival) {
    var i;
    if (palace === "kan" && respawn > 0) {
      respawn -= dt;
      if (respawn <= 0 && spiritCount() < 3) {
        var at = polar(rng() * 360, 8);
        spawnSpirit(at.x, at.z);
      }
    }
    for (i = list.length - 1; i >= 0; i--) {
      var actor = list[i];
      if (!actor.target.alive) continue;
      var dx = actor.x - px;
      var dz = actor.z - pz;
      var dist = Math.hypot(dx, dz) || 0.001;
      if (actor.kind === "spirit") {
        if (dist < 10) {
          var nx = actor.x + (dx / dist) * SPIRIT_SPEED * dt;
          var nz = actor.z + (dz / dist) * SPIRIT_SPEED * dt;
          var moved = copyMove(resolveBackroomsMoveCollisions(nx, nz, 0.2, colliders, 2));
          if (Math.hypot(moved.x - actor.x, moved.z - actor.z) < 0.15) {
            actor.stuck += dt;
            if (actor.stuck > 0.35) {
              moved = copyMove(
                resolveBackroomsMoveCollisions(
                  actor.x + (-dz / dist) * SPIRIT_SPEED * dt,
                  actor.z + (dx / dist) * SPIRIT_SPEED * dt,
                  0.2,
                  colliders,
                  2
                )
              );
            }
          } else actor.stuck = 0;
          actor.x = moved.x;
          actor.z = moved.z;
        }
      } else if (aggro || dist < 16) {
        var chase = dist > 1.35;
        if (chase) {
          var mx = actor.x + ((px - actor.x) / dist) * DEMON_SPEED * dt;
          var mz = actor.z + ((pz - actor.z) / dist) * DEMON_SPEED * dt;
          var step = copyMove(resolveBackroomsMoveCollisions(mx, mz, 0.34, colliders, 2));
          actor.x = step.x;
          actor.z = step.z;
        }
        actor.cool -= dt;
        if (dist < 1.5 && actor.cool <= 0 && survival && !survival.dead) {
          var held = getSelectedHotbarItem();
          if (held && held.id === C1166_SHELL_ID) {
            actor.cool = 2;
            showToast("壳挡住了这一下");
          } else {
            actor.cool = 1.1;
            survival.takeDamage(28);
          }
        }
      }
      actor.group.position.set(actor.x, 0, actor.z);
    }
    for (i = shells.length - 1; i >= 0; i--) {
      var shell = shells[i];
      shell.life += dt;
      shell.mesh.position.addScaledVector(shell.dir, SHELL_SPEED * dt);
      var traveled = shell.life * SHELL_SPEED;
      var hit = null;
      var j;
      for (j = 0; j < list.length; j++) {
        if (!list[j].target.alive) continue;
        if (Math.hypot(list[j].x - shell.mesh.position.x, list[j].z - shell.mesh.position.z) < 0.45) {
          hit = list[j];
          break;
        }
      }
      if (hit || traveled > SHELL_RANGE || shell.life > 2) {
        if (hit && hit.kind === "demon" && hit.target.breakByShell) hit.target.breakByShell();
        else if (hit && hit.kind === "spirit") showToast("壳砸在丹灵上弹开了");
        if (shell.mesh.parent) shell.mesh.parent.remove(shell.mesh);
        shells.splice(i, 1);
      }
    }
  }

  function trySmash(camera, px, pz) {
    var origin = new THREE.Vector3();
    var dir = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);
    var i;
    for (i = 0; i < list.length; i++) {
      var actor = list[i];
      if (!actor.target.alive || actor.kind !== "spirit") continue;
      var dist = Math.hypot(actor.x - px, actor.z - pz);
      if (dist > 2.2) continue;
      var to = new THREE.Vector3(actor.x - origin.x, 0.3 - origin.y, actor.z - origin.z);
      if (to.angleTo(dir) > 0.35) continue;
      actor.target.takeDamage(100);
      return true;
    }
    return false;
  }

  function throwShell(camera) {
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xf4efe6 })
    );
    mesh.scale.y = 0.4;
    var origin = new THREE.Vector3();
    var dir = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);
    mesh.position.copy(origin);
    parent.add(mesh);
    shells.push({ mesh: mesh, dir: dir.normalize(), life: 0 });
  }

  function wakeDemons() {
    aggro = true;
  }

  function spawnDemonAt(x, z) {
    return spawnDemon(x, z);
  }

  return {
    setParent: function (next) {
      parent = next;
    },
    spawnPalace: spawnPalace,
    update: update,
    clear: clear,
    trySmash: trySmash,
    throwShell: throwShell,
    dropLoot: dropLoot,
    wakeDemons: wakeDemons,
    spawnDemonAt: spawnDemonAt,
    aliveDemons: function () {
      var n = 0;
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i].kind === "demon" && list[i].target.alive) n += 1;
      }
      return n;
    },
  };
}

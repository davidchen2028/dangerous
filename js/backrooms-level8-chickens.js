/**
 * Level 8 洞穴鸡 — 跳到玩家身上造成 20 伤害，随后飞走，冷却 10 秒
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";

export const L8_CHICKEN_COUNT = 3;
export const L8_CHICKEN_DAMAGE = 20;
export const L8_CHICKEN_COOLDOWN = 10;

const MODEL_URL = "models/backrooms-chicken.glb";
const ATTACK_RANGE = 9;
const LEAP_DURATION = 0.72;
const FLY_DURATION = 1.35;
const CHICKEN_HEIGHT = 0.82;

var template = null;
var loadStarted = false;
var pending = [];

function modelMaterial(color) {
  return new THREE.MeshLambertMaterial({
    color: color,
    emissive: 0x100a06,
  });
}

function buildFallbackChicken() {
  var group = new THREE.Group();
  var white = modelMaterial(0xe8dfca);
  var red = modelMaterial(0xb82c26);
  var yellow = modelMaterial(0xd49b25);
  var body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), white);
  body.scale.set(1, 1.1, 1.25);
  body.position.y = 0.38;
  group.add(body);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), white);
  head.position.set(0, 0.68, 0.22);
  group.add(head);
  var comb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), red);
  comb.position.set(0, 0.88, 0.2);
  group.add(comb);
  var beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), yellow);
  beak.rotation.x = Math.PI * 0.5;
  beak.position.set(0, 0.66, 0.48);
  group.add(beak);
  return group;
}

function normalizeModel(model) {
  model.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 0.001) return false;
  model.scale.multiplyScalar(CHICKEN_HEIGHT / size.y);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  var center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.traverse(function (child) {
    if (child.isMesh) child.frustumCulled = false;
  });
  return true;
}

function ensureTemplate(onReady) {
  if (template) {
    onReady(template);
    return;
  }
  pending.push(onReady);
  if (loadStarted) return;
  loadStarted = true;
  new GLTFLoader().load(
    MODEL_URL,
    function (gltf) {
      template = gltf.scene;
      normalizeModel(template);
      var callbacks = pending.slice();
      pending.length = 0;
      var i;
      for (i = 0; i < callbacks.length; i++) callbacks[i](template);
    },
    undefined,
    function () {
      var callbacks = pending.slice();
      pending.length = 0;
      var i;
      for (i = 0; i < callbacks.length; i++) callbacks[i](null);
    }
  );
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

function faceToward(chicken, x, z) {
  var dx = x - chicken.group.position.x;
  var dz = z - chicken.group.position.z;
  if (dx * dx + dz * dz > 0.0001) {
    chicken.group.rotation.y = Math.atan2(dx, dz);
  }
}

function createChicken(parent, spawn, index) {
  var group = new THREE.Group();
  group.name = "L8Chicken_" + index;
  group.position.set(spawn.x, 0, spawn.z);
  group.rotation.y = spawn.rotY;
  parent.add(group);

  var fallback = buildFallbackChicken();
  group.add(fallback);
  ensureTemplate(function (source) {
    if (!source || !group.parent) return;
    var model = source.clone(true);
    group.remove(fallback);
    group.add(model);
  });

  var chicken = {
    group: group,
    homeX: spawn.x,
    homeZ: spawn.z,
    cooldown: index * 1.2,
    mode: "idle",
    modeTime: 0,
    fromX: spawn.x,
    fromZ: spawn.z,
    targetX: spawn.x,
    targetZ: spawn.z,
    damageApplied: false,
    phase: index * 2.1,
    dead: false,
  };
  chicken.health = registerBackroomsEntityTarget(group, {
    kind: "chicken",
    name: "洞穴鸡",
    maxHp: BACKROOMS_ENTITY_HEALTH.chicken,
    aimHeight: 0.45,
    onDeath: function () {
      chicken.dead = true;
      chicken.mode = "dead";
      chicken.group.visible = false;
    },
  });
  return chicken;
}

function startLeap(chicken, px, pz) {
  chicken.mode = "leap";
  chicken.modeTime = 0;
  chicken.fromX = chicken.group.position.x;
  chicken.fromZ = chicken.group.position.z;
  chicken.targetX = px;
  chicken.targetZ = pz;
  chicken.damageApplied = false;
  faceToward(chicken, px, pz);
}

function startFlyAway(chicken, px, pz) {
  chicken.mode = "fly";
  chicken.modeTime = 0;
  chicken.fromX = chicken.group.position.x;
  chicken.fromZ = chicken.group.position.z;
  var dx = chicken.fromX - px;
  var dz = chicken.fromZ - pz;
  var len = Math.hypot(dx, dz) || 1;
  chicken.targetX = chicken.fromX + (dx / len) * 11;
  chicken.targetZ = chicken.fromZ + (dz / len) * 11;
  chicken.cooldown = L8_CHICKEN_COOLDOWN;
  faceToward(chicken, chicken.targetX, chicken.targetZ);
}

function updateChicken(chicken, dt, player, survival, toastFn) {
  if (chicken.dead) return;
  chicken.phase += dt;
  if (chicken.cooldown > 0) chicken.cooldown = Math.max(0, chicken.cooldown - dt);
  var px = player.x;
  var pz = player.z;

  if (chicken.mode === "leap") {
    chicken.modeTime += dt;
    var p = Math.min(1, chicken.modeTime / LEAP_DURATION);
    var eased = smoothStep(p);
    chicken.group.position.x = chicken.fromX + (chicken.targetX - chicken.fromX) * eased;
    chicken.group.position.z = chicken.fromZ + (chicken.targetZ - chicken.fromZ) * eased;
    chicken.group.position.y = Math.sin(p * Math.PI) * 2.2;
    chicken.group.rotation.z = Math.sin(p * Math.PI * 6) * 0.12;
    if (!chicken.damageApplied && p >= 0.55) {
      var dx = chicken.group.position.x - px;
      var dz = chicken.group.position.z - pz;
      if (dx * dx + dz * dz <= 2.25 && survival && !survival.dead) {
        chicken.damageApplied = true;
        survival.takeDamage(L8_CHICKEN_DAMAGE);
        if (toastFn) toastFn("洞穴鸡扑到你身上！−" + L8_CHICKEN_DAMAGE + " 血量");
      }
    }
    if (p >= 1) startFlyAway(chicken, px, pz);
    return;
  }

  if (chicken.mode === "fly") {
    chicken.modeTime += dt;
    var fp = Math.min(1, chicken.modeTime / FLY_DURATION);
    var fe = smoothStep(fp);
    chicken.group.position.x = chicken.fromX + (chicken.targetX - chicken.fromX) * fe;
    chicken.group.position.z = chicken.fromZ + (chicken.targetZ - chicken.fromZ) * fe;
    chicken.group.position.y = 0.3 + fe * 5.5;
    chicken.group.rotation.z = Math.sin(fp * Math.PI * 12) * 0.24;
    if (fp >= 1) {
      chicken.mode = "cooldown";
      chicken.group.visible = false;
      chicken.group.rotation.z = 0;
    }
    return;
  }

  if (chicken.mode === "cooldown") {
    if (chicken.cooldown <= 0) {
      chicken.mode = "idle";
      chicken.group.visible = true;
      chicken.group.position.set(chicken.homeX, 0, chicken.homeZ);
    }
    return;
  }

  chicken.group.position.y = Math.sin(chicken.phase * 2.4) * 0.025;
  var dist = Math.hypot(px - chicken.group.position.x, pz - chicken.group.position.z);
  if (dist <= ATTACK_RANGE && chicken.cooldown <= 0 && survival && !survival.dead) {
    startLeap(chicken, px, pz);
  } else if (dist <= ATTACK_RANGE * 1.4) {
    faceToward(chicken, px, pz);
  }
}

export function createLevel8Chickens(parent) {
  var spawns = [
    { x: -8, z: -10, rotY: 0.4 },
    { x: 12, z: 2, rotY: -1.2 },
    { x: -11, z: 17, rotY: 2.4 },
  ];
  var chickens = [];
  var i;
  for (i = 0; i < L8_CHICKEN_COUNT; i++) {
    chickens.push(createChicken(parent, spawns[i], i));
  }
  return {
    update: function (dt, player, survival, toastFn) {
      for (var j = 0; j < chickens.length; j++) {
        updateChicken(chickens[j], dt, player, survival, toastFn);
      }
    },
    dispose: function () {
      for (var j = 0; j < chickens.length; j++) {
        unregisterBackroomsEntityTarget(chickens[j].health);
        if (chickens[j].group.parent) chickens[j].group.parent.remove(chickens[j].group);
      }
      chickens.length = 0;
    },
  };
}

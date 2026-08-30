/**
 * Level C-1「交点」的两种人形实体：成年无面灵与钝人。
 *
 * 原文写明交点里的实体「身体素质和攻击性似乎弱于它们的一般状态，这使得击杀它们
 * 会更加容易一些」，所以这里的血量与伤害都低于同名实体在其他层级的常态值，
 * 而且它们只在断电期间出现——供电一恢复就会退回黑暗里。
 *
 * 两者共用一套程序化的方块人形（与流浪者同一套做法），只在体型、配色和行为上分化：
 *   - 成年无面灵：又高又瘦，面部一片空白，始终不紧不慢地逼近，接触伤害较低
 *   - 钝人：矮壮迟钝，平时挪得很慢，但进入扑击距离后会突然加速撞上来
 */
import * as THREE from "three";
import {
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";

/** 弱化后的属性表：血量与伤害都明显低于常态 */
const FIGURE_SPECS = {
  faceling: {
    name: "成年无面灵",
    maxHp: 70,
    damage: 16,
    walkSpeed: 1.55,
    chaseSpeed: 2.35,
    lungeSpeed: 0,
    attackDistance: 1.15,
    attackCooldown: 1.6,
    noticeDistance: 17,
    aimHeight: 1.15,
    scale: 1.14,
    skin: 0xd8cfc0,
    cloth: 0x6f6a60,
    stocky: false,
  },
  duller: {
    name: "钝人",
    maxHp: 55,
    damage: 26,
    walkSpeed: 0.85,
    chaseSpeed: 1.45,
    lungeSpeed: 4.6,
    attackDistance: 1.3,
    attackCooldown: 2.2,
    noticeDistance: 13,
    aimHeight: 0.95,
    scale: 0.92,
    skin: 0x9b8f84,
    cloth: 0x4a4640,
    stocky: true,
  },
};

let _boxGeo = null;
let _pickMat = null;

function boxGeo() {
  if (!_boxGeo) _boxGeo = new THREE.BoxGeometry(1, 1, 1);
  return _boxGeo;
}

function pickMat() {
  if (!_pickMat) {
    _pickMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  }
  return _pickMat;
}

function addPart(group, mat, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(boxGeo(), mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function buildFigure(spec) {
  var group = new THREE.Group();
  var skinMat = new THREE.MeshLambertMaterial({
    color: spec.skin,
    emissive: 0x0a0908,
  });
  var clothMat = new THREE.MeshLambertMaterial({
    color: spec.cloth,
    emissive: 0x050505,
  });

  var torsoW = spec.stocky ? 0.66 : 0.4;
  var torsoH = spec.stocky ? 0.58 : 0.78;
  var legH = spec.stocky ? 0.62 : 1.02;
  var armH = spec.stocky ? 0.46 : 0.72;
  var hipY = legH * 0.5;
  var torsoY = legH + torsoH * 0.5;
  var headY = legH + torsoH + 0.19;

  var legL = addPart(group, clothMat, -0.13, hipY, 0, 0.2, legH, 0.22);
  var legR = addPart(group, clothMat, 0.13, hipY, 0, 0.2, legH, 0.22);
  addPart(group, clothMat, 0, torsoY, 0, torsoW, torsoH, 0.3);
  var armL = addPart(group, skinMat, -(torsoW * 0.5 + 0.09), torsoY, 0, 0.15, armH, 0.15);
  var armR = addPart(group, skinMat, torsoW * 0.5 + 0.09, torsoY, 0, 0.15, armH, 0.15);

  // 无面灵的头是一整块没有五官的空白；钝人的头略扁略宽
  var headW = spec.stocky ? 0.34 : 0.27;
  addPart(group, skinMat, 0, headY, 0, headW, spec.stocky ? 0.3 : 0.36, headW);

  group.scale.setScalar(spec.scale);

  var pick = new THREE.Mesh(boxGeo(), pickMat());
  pick.position.set(0, (headY + 0.2) * 0.5, 0);
  pick.scale.set(0.9, headY + 0.4, 0.85);
  group.add(pick);

  return {
    group: group,
    materials: [skinMat, clothMat],
    limbs: { legL: legL, legR: legR, armL: armL, armR: armR },
  };
}

/**
 * @param {THREE.Object3D} parent
 * @param {object[]} colliders
 * @param {{ kind: "faceling" | "duller", x?: number, z?: number, id?: string, canSee?: Function }} spec
 */
export function createC1Figure(parent, colliders, spec) {
  spec = spec || {};
  var cfg = FIGURE_SPECS[spec.kind] || FIGURE_SPECS.faceling;
  var built = buildFigure(cfg);
  var group = built.group;
  group.name = "C1Figure_" + (spec.kind || "faceling") + "_" + (spec.id || "0");
  group.position.set(
    Number.isFinite(spec.x) ? spec.x : 0,
    0,
    Number.isFinite(spec.z) ? spec.z : 0
  );
  parent.add(group);

  var alive = true;
  var attackCooldown = 0;
  var lungeTimer = 0;
  var stride = Math.random() * 6.28;

  var health = registerBackroomsEntityTarget(group, {
    kind: spec.kind === "duller" ? "duller" : "faceling",
    name: cfg.name,
    maxHp: cfg.maxHp,
    aimHeight: cfg.aimHeight,
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
    var resolved = resolveCircleAgainstColliders(
      group.position.x + (dx / distance) * step,
      group.position.z + (dz / distance) * step,
      0.34,
      colliders || [],
      8
    );
    group.position.x = resolved.x;
    group.position.z = resolved.z;
    group.rotation.y = Math.atan2(dx, dz);
    return Math.hypot(tx - group.position.x, tz - group.position.z);
  }

  function update(dt, px, pz, survival, showToast) {
    if (!alive) return;
    attackCooldown = Math.max(0, attackCooldown - dt);
    lungeTimer = Math.max(0, lungeTimer - dt);

    var distance = Math.hypot(px - group.position.x, pz - group.position.z);
    var noticed = distance <= cfg.noticeDistance;
    var visible =
      noticed && (!spec.canSee || spec.canSee(group.position.x, group.position.z, px, pz));

    var speed = cfg.walkSpeed;
    if (visible) {
      speed = cfg.chaseSpeed;
      // 钝人平时迟钝，但一旦够近就会毫无预兆地扑上来
      if (cfg.lungeSpeed > 0 && distance <= 4.5) {
        if (lungeTimer <= 0) lungeTimer = 0.55;
        speed = cfg.lungeSpeed;
      }
    }

    if (noticed) {
      distance = moveToward(px, pz, speed, dt);
    }

    stride += dt * (visible ? 7.5 : 3);
    var swing = visible ? 0.55 : 0.24;
    built.limbs.legL.rotation.x = Math.sin(stride) * swing;
    built.limbs.legR.rotation.x = Math.sin(stride + Math.PI) * swing;
    built.limbs.armL.rotation.x = Math.sin(stride + Math.PI) * swing * 0.7;
    built.limbs.armR.rotation.x = Math.sin(stride) * swing * 0.7;

    if (
      distance <= cfg.attackDistance &&
      attackCooldown <= 0 &&
      survival &&
      !survival.dead
    ) {
      attackCooldown = cfg.attackCooldown;
      var applied = survival.takeDamage(cfg.damage) !== false;
      if (applied && showToast) {
        showToast(cfg.name + "撞了上来 · −" + cfg.damage + " 血量");
      }
    }
  }

  function dispose() {
    unregisterBackroomsEntityTarget(health);
    if (group.parent) group.parent.remove(group);
    var i;
    for (i = 0; i < built.materials.length; i++) built.materials[i].dispose();
  }

  return { group: group, health: health, update: update, dispose: dispose };
}

/** 供刷怪器读取的可用种类 */
export const C1_FIGURE_KINDS = ["faceling", "duller"];

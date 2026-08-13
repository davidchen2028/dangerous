/**
 * 派对客（Partygoer）— 黄色笑脸人形 + 红气球，程序化建模
 */
import * as THREE from "three";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";

export const PARTYGOER_DEFAULT_SCALE = 1;
/** 站立高约 2.15m */
export const PARTYGOER_HEIGHT = 2.15;

var _bodyGeo = null;
var _armGeo = null;
var _headGeo = null;
var _balloonGeo = null;
var _stringGeo = null;

function bodyGeo() {
  if (!_bodyGeo) {
    var pts = [];
    var i;
    for (i = 0; i <= 16; i++) {
      var t = i / 16;
      var y = t * 1.35;
      var r = 0.22 + Math.pow(t, 0.55) * 0.38;
      pts.push(new THREE.Vector2(r, y));
    }
    _bodyGeo = new THREE.LatheGeometry(pts, 14);
  }
  return _bodyGeo;
}

function armGeo() {
  if (!_armGeo) _armGeo = new THREE.CylinderGeometry(0.028, 0.022, 0.92, 6);
  return _armGeo;
}

function headGeo() {
  if (!_headGeo) _headGeo = new THREE.CylinderGeometry(0.19, 0.21, 0.38, 12);
  return _headGeo;
}

function balloonGeo() {
  if (!_balloonGeo) _balloonGeo = new THREE.SphereGeometry(0.16, 10, 10);
  return _balloonGeo;
}

function stringGeo() {
  if (!_stringGeo) _stringGeo = new THREE.CylinderGeometry(0.003, 0.003, 1, 4);
  return _stringGeo;
}

function createPartygoerFaceTexture() {
  var w = 256;
  var h = 256;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#c9a028";
  ctx.fillRect(0, 0, w, h);

  var g = ctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.08, w * 0.5, h * 0.5, w * 0.52);
  g.addColorStop(0, "#e8c848");
  g.addColorStop(0.55, "#c89820");
  g.addColorStop(1, "#a07818");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#0a0806";
  ctx.beginPath();
  ctx.arc(w * 0.36, h * 0.42, w * 0.045, 0, Math.PI * 2);
  ctx.arc(w * 0.64, h * 0.42, w * 0.045, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0a0806";
  ctx.lineWidth = w * 0.038;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.56, w * 0.22, 0.08 * Math.PI, 0.92 * Math.PI, false);
  ctx.stroke();

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function yellowMaterial(seed) {
  var hue = 0.12 + (seed % 5) * 0.012;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.62, 0.48),
    roughness: 0.88,
    metalness: 0.02,
  });
}

/**
 * @param {{ scale?: number, seed?: number }} [opts]
 */
export function buildPartygoerFigure(opts) {
  opts = opts || {};
  var unitScale = opts.scale != null ? opts.scale : PARTYGOER_DEFAULT_SCALE;
  var seed = opts.seed != null ? opts.seed : 0;

  var group = new THREE.Group();
  group.name = "Partygoer";

  var bodyMat = yellowMaterial(seed);
  var faceTex = createPartygoerFaceTexture();
  var faceMat = new THREE.MeshStandardMaterial({
    map: faceTex || undefined,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
  });
  if (!faceTex) faceMat.color.setHSL(0.12, 0.62, 0.5);

  var body = new THREE.Mesh(bodyGeo(), bodyMat);
  body.position.y = 0.02;
  group.add(body);

  var head = new THREE.Mesh(headGeo(), faceMat);
  head.position.y = 1.52;
  group.add(head);

  var neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.12, 8),
    bodyMat
  );
  neck.position.y = 1.28;
  group.add(neck);

  var armL = new THREE.Group();
  armL.name = "PartygoerArmL";
  var armMeshL = new THREE.Mesh(armGeo(), bodyMat);
  armMeshL.position.y = -0.42;
  armL.add(armMeshL);
  armL.position.set(-0.38, 1.22, 0.02);
  armL.rotation.z = 0.55;
  armL.rotation.x = 0.12;
  group.add(armL);

  var armR = new THREE.Group();
  armR.name = "PartygoerArmR";
  var armMeshR = new THREE.Mesh(armGeo(), bodyMat);
  armMeshR.position.y = -0.42;
  armR.add(armMeshR);
  armR.position.set(0.38, 1.22, 0.02);
  armR.rotation.z = -0.55;
  armR.rotation.x = 0.12;
  group.add(armR);

  var balloonPivot = new THREE.Group();
  balloonPivot.name = "PartygoerBalloon";
  balloonPivot.position.set(0.55, 1.65, 0.15);

  var string = new THREE.Mesh(stringGeo(), new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.95,
  }));
  string.position.y = 0.55;
  balloonPivot.add(string);

  var balloonMat = new THREE.MeshStandardMaterial({
    color: 0xdd2233,
    emissive: 0x440808,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.05,
  });
  var balloon = new THREE.Mesh(balloonGeo(), balloonMat);
  balloon.scale.set(1, 1.18, 1);
  balloon.position.y = 1.12;
  balloonPivot.add(balloon);

  var knot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 6, 6),
    balloonMat
  );
  knot.position.y = 0.08;
  balloonPivot.add(knot);

  group.add(balloonPivot);

  group.scale.setScalar(unitScale);

  function update(t) {
    var sway = Math.sin(t * 0.9) * 0.025;
    body.rotation.y = sway * 0.4;
    head.rotation.y = sway * 0.25;
    armL.rotation.z = 0.55 + Math.sin(t * 1.1 + 0.3) * 0.08;
    armR.rotation.z = -0.55 - Math.sin(t * 1.05) * 0.08;
    balloonPivot.position.y = 1.65 + Math.sin(t * 2.2) * 0.06;
    balloonPivot.rotation.z = Math.sin(t * 1.4) * 0.06;
    balloon.position.x = Math.sin(t * 1.8) * 0.03;
  }

  function dispose() {
    bodyMat.dispose();
    faceMat.dispose();
    balloonMat.dispose();
    if (faceTex) faceTex.dispose();
  }

  return {
    group: group,
    body: body,
    head: head,
    armL: armL,
    armR: armR,
    balloonPivot: balloonPivot,
    scale: unitScale,
    update: update,
    dispose: dispose,
  };
}

/**
 * @param {THREE.Object3D} parent
 * @param {{ x: number, z: number, rotY?: number, scale?: number, seed?: number }} spec
 */
export function spawnPartygoer(parent, spec) {
  spec = spec || {};
  var fig = buildPartygoerFigure({ scale: spec.scale, seed: spec.seed });
  fig.group.position.set(spec.x || 0, 0, spec.z || 0);
  if (spec.rotY != null) fig.group.rotation.y = spec.rotY;
  parent.add(fig.group);
  var health = registerBackroomsEntityTarget(fig.group, {
    kind: "partygoer",
    name: "派对客",
    maxHp: BACKROOMS_ENTITY_HEALTH.partygoer,
    aimHeight: 1.2 * (spec.scale || 1),
    onDeath: function () {
      fig.group.visible = false;
    },
  });
  var disposeFigure = fig.dispose;
  fig.health = health;
  fig.dispose = function () {
    unregisterBackroomsEntityTarget(health);
    disposeFigure();
  };
  return fig;
}

export const PARTYGOER_ATTACK_DAMAGE = 60;
export const PARTYGOER_ATTACK_COOLDOWN = 20;
export const PARTYGOER_SEE_DIST = 16;
export const PARTYGOER_ATTACK_RANGE = 1.55;
export const PARTYGOER_MOVE_SPEED = 2.35;

function distSq(ax, az, bx, bz) {
  var dx = ax - bx;
  var dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * 可追击的派对客系统（伤害 / 冷却可配置）
 * @param {THREE.Object3D} parent
 * @param {{ x: number, z: number, rotY?: number, scale?: number, seed?: number }[]} spawns
 * @param {{ damage?: number, cooldown?: number }} [opts]
 */
export function createPartygoersAt(parent, spawns, opts) {
  opts = opts || {};
  var damage = opts.damage != null ? opts.damage : PARTYGOER_ATTACK_DAMAGE;
  var cooldown = opts.cooldown != null ? opts.cooldown : PARTYGOER_ATTACK_COOLDOWN;
  var root = new THREE.Group();
  root.name = "Partygoers";
  parent.add(root);

  var units = [];
  var i;
  for (i = 0; i < (spawns || []).length; i++) {
    var fig = spawnPartygoer(root, spawns[i]);
    units.push({
      figure: fig,
      group: fig.group,
      x: spawns[i].x || 0,
      z: spawns[i].z || 0,
      cooldown: 0,
      animT: Math.random() * 10,
      dead: false,
    });
  }

  return {
    root: root,
    units: units,
    clear: function () {
      for (i = 0; i < units.length; i++) {
        units[i].figure.dispose();
        if (units[i].group.parent) units[i].group.parent.remove(units[i].group);
      }
      units.length = 0;
      if (root.parent) root.parent.remove(root);
    },
    update: function (dt, px, pz, survival, toastFn, extra) {
      extra = extra || {};
      var seeSq = PARTYGOER_SEE_DIST * PARTYGOER_SEE_DIST;
      var atkSq = PARTYGOER_ATTACK_RANGE * PARTYGOER_ATTACK_RANGE;
      for (i = 0; i < units.length; i++) {
        var unit = units[i];
        if (unit.dead || !unit.group.visible) continue;
        if (unit.figure.health && !unit.figure.health.alive) {
          unit.dead = true;
          continue;
        }
        unit.animT += dt;
        unit.figure.update(unit.animT);
        if (unit.cooldown > 0) unit.cooldown = Math.max(0, unit.cooldown - dt);
        if (extra.playerSafe || !survival || survival.dead) continue;

        var d2 = distSq(unit.x, unit.z, px, pz);
        if (d2 > seeSq) continue;
        var dist = Math.sqrt(d2) || 0.001;
        unit.group.rotation.y = Math.atan2(px - unit.x, pz - unit.z);
        if (d2 > atkSq) {
          var step = Math.min(PARTYGOER_MOVE_SPEED * dt, dist - PARTYGOER_ATTACK_RANGE * 0.75);
          if (step > 0) {
            unit.x += ((px - unit.x) / dist) * step;
            unit.z += ((pz - unit.z) / dist) * step;
            unit.group.position.x = unit.x;
            unit.group.position.z = unit.z;
          }
        } else if (unit.cooldown <= 0) {
          survival.takeDamage(damage);
          unit.cooldown = cooldown;
          if (typeof toastFn === "function") {
            toastFn("派对客扑上来！−" + damage + " 血量");
          }
        }
      }
    },
  };
}

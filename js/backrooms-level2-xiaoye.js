/**
 * Level 2 — 笑靥：三条非出生走廊末端随机一只，靠近扑击 -100；扑击后下次进 L2 再刷
 */
import * as THREE from "three";
import { CORRIDOR_LENGTH, CORRIDOR_WIDTH } from "./backrooms-level2-constants.js";
import {
  BACKROOMS_ENTITY_HEALTH,
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";

export const XIAOYE_STORAGE_KEY = "backrooms_l2_xiaoye_v1";
export const XIAOYE_FULL_HEAL_KEY = "backrooms_l2_xiaoye_full_heal";

/** 出生在 +Z 端，该走廊末端不刷笑靥 */
const SPAWN_ARM_ID = "pz";

const XIAOYE_DAMAGE = 100;
const TRIGGER_DIST = 11;
const LUNGE_DURATION = 0.38;
const COOLDOWN_SEC = 30;
const FACE_W = CORRIDOR_WIDTH * 2.4;
const FACE_H = 5.6;

function allCorridorEndArms(halfLen) {
  return [
    { x: 0, z: halfLen - 1.4, rotY: Math.PI, arm: "pz" },
    { x: 0, z: -halfLen + 1.4, rotY: 0, arm: "nz" },
    { x: halfLen - 1.4, z: 0, rotY: -Math.PI * 0.5, arm: "px" },
    { x: -halfLen + 1.4, z: 0, rotY: Math.PI * 0.5, arm: "nx" },
  ];
}

function readSpawnSpec(halfLen) {
  try {
    var raw = sessionStorage.getItem(XIAOYE_STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.arm !== SPAWN_ARM_ID &&
        Number.isFinite(parsed.x) &&
        Number.isFinite(parsed.z)
      ) {
        return parsed;
      }
    }
  } catch (err) {
    /* ignore */
  }
  var pick = pickRandomSpawnArm(halfLen);
  try {
    sessionStorage.setItem(XIAOYE_STORAGE_KEY, JSON.stringify(pick));
  } catch (err2) {
    /* ignore */
  }
  return pick;
}

function pickRandomSpawnArm(halfLen) {
  var pool = allCorridorEndArms(halfLen).filter(function (a) {
    return a.arm !== SPAWN_ARM_ID;
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 与笑靥共用走廊（L2 死亡飞蛾等） */
export function getLevel2SharedCorridorSpec(halfLen) {
  return readSpawnSpec(halfLen);
}

/** 当前 L2 实体（笑靥/飞蛾/肢团）所在走廊臂 — 门不得刷在此臂 */
export function getLevel2EntityCorridorArm(halfLen) {
  return readSpawnSpec(halfLen).arm;
}

/** 从走廊末端向十字中心偏移 */
export function insetCorridorPosition(spec, inset) {
  var x = spec.x;
  var z = spec.z;
  if (spec.arm === "pz") z -= inset;
  else if (spec.arm === "nz") z += inset;
  else if (spec.arm === "px") x -= inset;
  else if (spec.arm === "nx") x += inset;
  return { x: x, z: z, rotY: spec.rotY, arm: spec.arm };
}

function clearXiaoyeSpawnSlot() {
  try {
    sessionStorage.removeItem(XIAOYE_STORAGE_KEY);
  } catch (err) {
    /* ignore */
  }
}

function createSmileFaceTexture() {
  var w = 512;
  var h = 640;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, w, h);

  var eyeY = h * 0.28;
  var eyeOffX = w * 0.22;
  var eyeR = w * 0.09;

  function drawEye(cx, cy) {
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, eyeR * 1.8);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(240,248,255,0.95)");
    g.addColorStop(0.7, "rgba(200,220,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, eyeR * 1.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEye(w * 0.5 - eyeOffX, eyeY);
  drawEye(w * 0.5 + eyeOffX, eyeY);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = w * 0.065;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = w * 0.08;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.52, w * 0.36, 0.12 * Math.PI, 0.88 * Math.PI, false);
  ctx.stroke();

  ctx.lineWidth = w * 0.028;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, w * 0.31, 0.18 * Math.PI, 0.82 * Math.PI, false);
  ctx.stroke();

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function clearXiaoyeSessionKeys() {
  try {
    sessionStorage.removeItem(XIAOYE_STORAGE_KEY);
    sessionStorage.removeItem(XIAOYE_FULL_HEAL_KEY);
    sessionStorage.removeItem("backrooms_l2_xiaoye_triggered");
  } catch (err) {
    /* ignore */
  }
}

export function markXiaoyeKillFullHealOnRespawn() {
  try {
    sessionStorage.setItem(XIAOYE_FULL_HEAL_KEY, "1");
  } catch (err) {
    /* ignore */
  }
}

export function consumeXiaoyeFullHealFlag() {
  try {
    if (sessionStorage.getItem(XIAOYE_FULL_HEAL_KEY) !== "1") return false;
    sessionStorage.removeItem(XIAOYE_FULL_HEAL_KEY);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * @param {THREE.Group} parent
 * @returns {{ update: Function, dispose: Function, group: THREE.Group | null }}
 */
export function createLevel2Xiaoye(parent) {
  var halfLen = CORRIDOR_LENGTH * 0.5;
  var spec = readSpawnSpec(halfLen);

  var group = new THREE.Group();
  group.name = "L2Xiaoye";

  var faceTex = createSmileFaceTexture();
  var faceMat = new THREE.MeshBasicMaterial({
    map: faceTex || undefined,
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (!faceTex) {
    faceMat.color.setHex(0xffffff);
  }

  var face = new THREE.Mesh(new THREE.PlaneGeometry(FACE_W, FACE_H), faceMat);
  face.position.y = FACE_H * 0.42;
  group.add(face);

  var glow = new THREE.PointLight(0xe8f4ff, 0.55, 14, 2);
  glow.position.set(0, FACE_H * 0.45, 0.6);
  group.add(glow);

  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.rotY;

  parent.add(group);

  var homeX = spec.x;
  var homeZ = spec.z;
  var phase = "wait";
  var lungeT = 0;
  var lungeTargetX = 0;
  var lungeTargetZ = 0;
  var attacked = false;
  var cooldownLeft = 0;
  var health = registerBackroomsEntityTarget(group, {
    kind: "smiler",
    name: "笑靥",
    maxHp: BACKROOMS_ENTITY_HEALTH.smiler,
    aimHeight: FACE_H * 0.42,
    onDeath: function () {
      phase = "gone";
      group.visible = false;
      clearXiaoyeSpawnSlot();
    },
  });

  function applyAttack(survival, toastFn) {
    if (attacked || !survival || survival.dead) return;
    attacked = true;
    clearXiaoyeSpawnSlot();
    markXiaoyeKillFullHealOnRespawn();
    var applied = survival.takeDamage(XIAOYE_DAMAGE) !== false;
    if (applied && typeof toastFn === "function") {
      toastFn("笑靥 — −100 血量");
    }
  }

  function update(dt, px, pz, survival, toastFn) {
    if (phase === "gone" || !survival) return;

    if (phase === "cooldown") {
      cooldownLeft -= dt;
      group.position.set(homeX, 0, homeZ);
      group.rotation.y = spec.rotY;
      var coolPulse = 0.35 + 0.08 * Math.sin(performance.now() * 0.003);
      faceMat.opacity = coolPulse;
      glow.intensity = 0.18;
      group.scale.setScalar(0.75);
      group.visible = true;
      if (cooldownLeft <= 0) {
        phase = "wait";
        attacked = false;
      }
      return;
    }

    var dx = px - group.position.x;
    var dz = pz - group.position.z;
    var dist = Math.hypot(dx, dz);

    var reveal = 1 - Math.min(1, Math.max(0, (dist - 8) / 28));
    var pulse = 0.88 + 0.12 * Math.sin(performance.now() * 0.004);
    faceMat.opacity = (0.08 + reveal * 0.88) * pulse;
    glow.intensity = 0.12 + reveal * 0.65;

    if (phase === "wait") {
      group.scale.setScalar(0.85 + reveal * 0.35);
      if (dist <= TRIGGER_DIST && !survival.dead && !attacked) {
        phase = "lunge";
        lungeT = 0;
        lungeTargetX = px;
        lungeTargetZ = pz;
        applyAttack(survival, toastFn);
      }
      return;
    }

    if (phase === "lunge") {
      lungeT += dt;
      var p = Math.min(1, lungeT / LUNGE_DURATION);
      var ease = p * p * (3 - 2 * p);
      group.position.x = homeX + (lungeTargetX - homeX) * ease;
      group.position.z = homeZ + (lungeTargetZ - homeZ) * ease;
      var scale = 1.1 + ease * 2.4;
      group.scale.setScalar(scale);
      faceMat.opacity = Math.min(1, 0.95 + ease * 0.05);
      glow.intensity = 1.2 + ease * 2.5;
      if (p >= 1) {
        phase = "cooldown";
        cooldownLeft = COOLDOWN_SEC;
        group.position.set(homeX, 0, homeZ);
        group.rotation.y = spec.rotY;
      }
    }
  }

  function dispose() {
    unregisterBackroomsEntityTarget(health);
    if (group.parent) group.parent.remove(group);
    if (faceTex) faceTex.dispose();
    faceMat.dispose();
    face.geometry.dispose();
  }

  return { group: group, health: health, update: update, dispose: dispose };
}

/**
 * 固定位置笑靥（L1.1-3 等）
 * @param {THREE.Group} parent
 * @param {{ x: number, z: number, rotY?: number, faceW?: number, faceH?: number, canSee?:Function, noPointLight?: boolean }} spec
 */
export function createFixedXiaoye(parent, spec) {
  var rotY = spec.rotY != null ? spec.rotY : 0;
  var faceW = spec.faceW != null ? spec.faceW : FACE_W * 0.72;
  var faceH = spec.faceH != null ? spec.faceH : FACE_H * 0.72;

  var group = new THREE.Group();
  group.name = "FixedXiaoye";

  var faceTex = createSmileFaceTexture();
  var faceMat = new THREE.MeshBasicMaterial({
    map: faceTex || undefined,
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (!faceTex) faceMat.color.setHex(0xffffff);

  var face = new THREE.Mesh(new THREE.PlaneGeometry(faceW, faceH), faceMat);
  face.position.y = faceH * 0.42;
  group.add(face);

  var glow = null;
  if (!spec.noPointLight) {
    glow = new THREE.PointLight(0xe8f4ff, 0.55, 14, 2);
    glow.position.set(0, faceH * 0.45, 0.6);
    group.add(glow);
  }

  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = rotY;
  parent.add(group);

  var homeX = spec.x;
  var homeZ = spec.z;
  var phase = "wait";
  var lungeT = 0;
  var lungeTargetX = 0;
  var lungeTargetZ = 0;
  var attacked = false;
  var cooldownLeft = 0;
  var health = registerBackroomsEntityTarget(group, {
    kind: "smiler",
    name: "笑靥",
    maxHp: BACKROOMS_ENTITY_HEALTH.smiler,
    aimHeight: faceH * 0.42,
    onDeath: function () {
      phase = "gone";
      group.visible = false;
    },
  });

  function applyAttack(survival, toastFn) {
    if (attacked || !survival || survival.dead) return;
    attacked = true;
    var applied = survival.takeDamage(XIAOYE_DAMAGE) !== false;
    if (applied && typeof toastFn === "function") toastFn("笑靥 — −100 血量");
  }

  function update(dt, px, pz, survival, toastFn) {
    if (phase === "gone" || !survival) return;

    if (phase === "cooldown") {
      cooldownLeft -= dt;
      group.position.set(homeX, 0, homeZ);
      group.rotation.y = rotY;
      faceMat.opacity = 0.35 + 0.08 * Math.sin(performance.now() * 0.003);
      if (glow) glow.intensity = 0.18;
      group.scale.setScalar(0.75);
      group.visible = true;
      if (cooldownLeft <= 0) {
        phase = "wait";
        attacked = false;
      }
      return;
    }

    var dx = px - group.position.x;
    var dz = pz - group.position.z;
    var dist = Math.hypot(dx, dz);
    var reveal = 1 - Math.min(1, Math.max(0, (dist - 8) / 28));
    var pulse = 0.88 + 0.12 * Math.sin(performance.now() * 0.004);
    faceMat.opacity = (0.08 + reveal * 0.88) * pulse;
    if (glow) glow.intensity = 0.12 + reveal * 0.65;

    if (phase === "wait") {
      group.scale.setScalar(0.85 + reveal * 0.35);
      var visible =
        !spec.canSee ||
        spec.canSee(group.position.x, group.position.z, px, pz);
      if (visible && dist <= TRIGGER_DIST && !survival.dead && !attacked) {
        phase = "lunge";
        lungeT = 0;
        lungeTargetX = px;
        lungeTargetZ = pz;
        applyAttack(survival, toastFn);
      }
      return;
    }

    if (phase === "lunge") {
      lungeT += dt;
      var p = Math.min(1, lungeT / LUNGE_DURATION);
      var ease = p * p * (3 - 2 * p);
      group.position.x = homeX + (lungeTargetX - homeX) * ease;
      group.position.z = homeZ + (lungeTargetZ - homeZ) * ease;
      group.scale.setScalar(1.1 + ease * 2.4);
      faceMat.opacity = Math.min(1, 0.95 + ease * 0.05);
      if (glow) glow.intensity = 1.2 + ease * 2.5;
      if (p >= 1) {
        phase = "cooldown";
        cooldownLeft = COOLDOWN_SEC;
        group.position.set(homeX, 0, homeZ);
        group.rotation.y = rotY;
      }
    }
  }

  function dispose() {
    unregisterBackroomsEntityTarget(health);
    if (group.parent) group.parent.remove(group);
    if (faceTex) faceTex.dispose();
    faceMat.dispose();
    face.geometry.dispose();
  }

  return { group: group, health: health, update: update, dispose: dispose };
}

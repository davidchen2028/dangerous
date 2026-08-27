/**
 * Level 0 — 「痛楚」临时现象（独立场景模块）。
 *
 * 本文件只负责裂口预警、黑白墓园几何、FX 与气氛参数；理智扣除、
 * 进入/退出与主 L0 快照恢复由宿主在 backrooms-level0.js / zones 中调度。
 */
import * as THREE from "three";

export const TORMENT_SESSION_KEY = "backrooms_level0_torment_v1";
export const TORMENT_SANITY_DRAIN_PER_SEC = 3.2;
export const TORMENT_MIN_DURATION_MS = 60000;
export const TORMENT_MAX_DURATION_MS = 90000;

/** 供宿主写入 scene.fog / 背景色。约 5 英尺可见度。 */
export const TORMENT_FOG_PRESET = {
  color: 0x8a9098,
  background: 0x6f737a,
  near: 0.35,
  far: 5.2,
};

var STATUE_TEXT =
  "石像的帽檐压得很低，像是为了遮住一张已经碎裂的脸。" +
  "你只看了一眼，便觉得不该再靠近。";

var _activeBreaches = [];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function hashSeed(seed) {
  var text = String(seed == null ? Math.random() : seed);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  var state = hashSeed(seed) || 0x6d2b79f5;
  return function random() {
    state += 0x6d2b79f5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (var i = 0; i < material.length; i++) disposeMaterial(material[i]);
    return;
  }
  if (material.map) material.map.dispose();
  material.dispose();
}

function disposeObject3D(root) {
  if (!root) return;
  root.traverse(function (node) {
    if (node.geometry) node.geometry.dispose();
    if (node.material) disposeMaterial(node.material);
  });
  if (root.parent) root.parent.remove(root);
}

function canvasTexture(width, height, paint, repeatX, repeatY) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx, width, height);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (repeatX || repeatY) texture.repeat.set(repeatX || 1, repeatY || 1);
  return texture;
}

export function readTormentState() {
  try {
    var raw = sessionStorage.getItem(TORMENT_SESSION_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    return {
      encountered: !!(parsed && parsed.encountered),
      statueSeen: !!(parsed && parsed.statueSeen),
    };
  } catch (err) {
    return { encountered: false, statueSeen: false };
  }
}

export function writeTormentState(state) {
  try {
    sessionStorage.setItem(
      TORMENT_SESSION_KEY,
      JSON.stringify({
        encountered: !!(state && state.encountered),
        statueSeen: !!(state && state.statueSeen),
      })
    );
  } catch (err2) {
    /* ignore */
  }
}

export function resetTormentSession() {
  try {
    sessionStorage.removeItem(TORMENT_SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
}

function createLeafGroundTexture(random) {
  return canvasTexture(
    256,
    256,
    function paint(ctx, width, height) {
      ctx.fillStyle = "#4a4f54";
      ctx.fillRect(0, 0, width, height);
      var i;
      for (i = 0; i < 900; i++) {
        var shade = 58 + Math.floor(random() * 36);
        ctx.fillStyle = "rgb(" + shade + "," + shade + "," + (shade + 4) + ")";
        ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 3);
      }
      for (i = 0; i < 120; i++) {
        var lx = random() * width;
        var ly = random() * height;
        var len = 4 + random() * 8;
        ctx.strokeStyle = "rgba(28,30,32," + (0.25 + random() * 0.35) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + len, ly + random() * 2 - 1);
        ctx.stroke();
      }
    },
    8,
    8
  );
}

function createStoneTexture(random) {
  return canvasTexture(128, 128, function paint(ctx, width, height) {
    ctx.fillStyle = "#8f9398";
    ctx.fillRect(0, 0, width, height);
    var i;
    for (i = 0; i < 420; i++) {
      var alpha = 0.04 + random() * 0.12;
      ctx.fillStyle = "rgba(35,38,42," + alpha + ")";
      ctx.fillRect(random() * width, random() * height, 1, 1 + random() * 2);
    }
  });
}

function pruneBreaches() {
  _activeBreaches = _activeBreaches.filter(function (item) {
    return item && !item.disposed;
  });
}

/**
 * 主 L0 前方短暂黑白裂口。不是永久 POI，靠近后由宿主决定是否切入墓园。
 *
 * opts: { x, z, yaw, width, height, lifetimeMs, seed }
 */
export function buildTormentBreach(parent, opts) {
  opts = opts || {};
  var random = makeRandom(opts.seed || opts.x + ":" + opts.z);
  var width = Math.max(1.2, Number(opts.width) || 2.4);
  var height = Math.max(2.0, Number(opts.height) || 3.2);
  var yaw = Number(opts.yaw) || 0;
  var wx = Number(opts.x) || 0;
  var wz = Number(opts.z) || 0;
  var lifetimeMs = Math.max(4000, Number(opts.lifetimeMs) || 12000);

  var group = new THREE.Group();
  group.name = "TormentBreach";
  group.position.set(wx, height * 0.45, wz);
  group.rotation.y = yaw;

  var frameMat = new THREE.MeshBasicMaterial({
    color: 0xf0f0f0,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  var voidMat = new THREE.MeshBasicMaterial({
    color: 0x050505,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
  });
  var frame = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.18, height + 0.18), frameMat);
  frame.name = "TormentBreachFrame";
  var hole = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.82, height * 0.82), voidMat);
  hole.position.z = 0.01;
  hole.name = "TormentBreachVoid";
  group.add(frame);
  group.add(hole);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.9, height * 0.95, 0.35),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.name = "TormentBreachInteract";
  pick.position.z = 0.08;
  pick.userData.brInteract = { kind: "torment_breach" };
  group.add(pick);

  if (parent) parent.add(group);

  var halfW = width * 0.45;
  var halfD = 0.35;
  var cos = Math.cos(yaw);
  var sin = Math.sin(yaw);
  var trigger = {
    minX: wx + (-halfW * cos - halfD * sin),
    maxX: wx + (halfW * cos + halfD * sin),
    minZ: wz + (-halfW * sin + halfD * cos),
    maxZ: wz + (halfW * sin - halfD * cos),
  };
  if (trigger.minX > trigger.maxX) {
    var tx = trigger.minX;
    trigger.minX = trigger.maxX;
    trigger.maxX = tx;
  }
  if (trigger.minZ > trigger.maxZ) {
    var tz = trigger.minZ;
    trigger.minZ = trigger.maxZ;
    trigger.maxZ = tz;
  }

  var bornAt =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  var controller = {
    group: group,
    interactMesh: pick,
    trigger: trigger,
    collider: {
      minX: trigger.minX,
      maxX: trigger.maxX,
      minZ: trigger.minZ,
      maxZ: trigger.maxZ,
      ghost: true,
    },
    amount: 0,
    disposed: false,
    update: function updateBreach(amount, nowMs) {
      if (controller.disposed) return 0;
      var now =
        typeof nowMs === "number"
          ? nowMs
          : typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
      var life = clamp01(1 - (now - bornAt) / lifetimeMs);
      controller.amount = clamp01(amount) * life;
      var pulse = 0.55 + Math.sin(now * 0.008) * 0.18;
      frameMat.opacity = 0.18 + controller.amount * 0.74 * pulse;
      voidMat.opacity = 0.55 + controller.amount * 0.42;
      group.visible = controller.amount > 0.015 && life > 0.02;
      group.scale.setScalar(0.92 + controller.amount * 0.08);
      if (life <= 0.02) controller.dispose();
      return controller.amount;
    },
    dispose: function disposeBreach() {
      if (controller.disposed) return;
      controller.disposed = true;
      disposeObject3D(group);
      pruneBreaches();
    },
  };

  _activeBreaches.push(controller);
  return controller;
}

export function getTormentBreaches() {
  pruneBreaches();
  return _activeBreaches.slice();
}

function pointInTrigger(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

function createProceduralScream() {
  if (typeof window === "undefined") return null;
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    var context = new AudioCtx();
    var gain = context.createGain();
    gain.gain.value = 0.0001;
    gain.connect(context.destination);
    var osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 180 + Math.random() * 90;
    osc.connect(gain);
    var noiseBuffer = context.createBuffer(1, context.sampleRate * 0.18, context.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    var noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = context.createGain();
    noiseGain.gain.value = 0.08;
    noise.connect(noiseGain);
    noiseGain.connect(gain);
    osc.start();
    noise.start();
    noise.stop(context.currentTime + 0.22);
    osc.stop(context.currentTime + 0.28);
    return { context: context, gain: gain, osc: osc, noise: noise, noiseGain: noiseGain };
  } catch (err) {
    return null;
  }
}

function stopScreamAudio(node) {
  if (!node) return;
  try {
    if (node.osc) node.osc.stop();
    if (node.noise) node.noise.stop();
    node.context.close();
  } catch (err2) {
    /* ignore */
  }
}

/**
 * 黑白墓园内部场景。
 *
 * opts: { seed, radius, gridSize }
 */
export function buildTormentGraveyard(scene, opts) {
  opts = opts || {};
  var random = makeRandom(opts.seed || Date.now());
  var radius = Math.max(16, Number(opts.radius) || 28);
  var group = new THREE.Group();
  group.name = "TormentGraveyard";

  var leafTexture = createLeafGroundTexture(random);
  var stoneTexture = createStoneTexture(random);
  var groundMat = new THREE.MeshStandardMaterial({
    map: leafTexture || undefined,
    color: 0x7a8086,
    roughness: 0.98,
    metalness: 0,
  });
  var ground = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.15, 48), groundMat);
  ground.rotation.x = -Math.PI * 0.5;
  ground.receiveShadow = true;
  group.add(ground);

  var stoneGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.72, 10, 1, false, 0, Math.PI);
  stoneGeo.rotateX(Math.PI * 0.5);
  var stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTexture || undefined,
    color: 0x959aa0,
    roughness: 0.94,
    metalness: 0.02,
  });
  var stoneCount = 42;
  var stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  stones.name = "TormentGravestones";
  var matrix = new THREE.Matrix4();
  var pos = new THREE.Vector3();
  var quat = new THREE.Quaternion();
  var scale = new THREE.Vector3(1, 1, 1);
  var i;
  for (i = 0; i < stoneCount; i++) {
    var angle = (i / stoneCount) * Math.PI * 2 + random() * 0.18;
    var ring = radius * (0.42 + random() * 0.48);
    pos.set(Math.cos(angle) * ring, 0.02, Math.sin(angle) * ring);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + Math.PI * 0.5 + (random() - 0.5) * 0.4);
    scale.setScalar(0.75 + random() * 0.55);
    matrix.compose(pos, quat, scale);
    stones.setMatrixAt(i, matrix);
  }
  stones.instanceMatrix.needsUpdate = true;
  group.add(stones);

  var treeHeight = 2.13;
  var trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, treeHeight, 6);
  var branchGeo = new THREE.CylinderGeometry(0.03, 0.05, treeHeight * 0.42, 5);
  var treeMat = new THREE.MeshStandardMaterial({
    color: 0x4d5156,
    roughness: 1,
    metalness: 0,
  });
  var treeCount = 16;
  var trees = new THREE.InstancedMesh(trunkGeo, treeMat, treeCount);
  trees.name = "TormentTrees";
  for (i = 0; i < treeCount; i++) {
    var tAngle = random() * Math.PI * 2;
    var tRing = radius * (0.55 + random() * 0.35);
    pos.set(Math.cos(tAngle) * tRing, treeHeight * 0.5, Math.sin(tAngle) * tRing);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tAngle);
    scale.setScalar(0.85 + random() * 0.35);
    matrix.compose(pos, quat, scale);
    trees.setMatrixAt(i, matrix);
  }
  trees.instanceMatrix.needsUpdate = true;
  group.add(trees);

  for (i = 0; i < 8; i++) {
    var branch = new THREE.Mesh(branchGeo, treeMat);
    var bAngle = random() * Math.PI * 2;
    var bRing = radius * (0.58 + random() * 0.28);
    branch.position.set(Math.cos(bAngle) * bRing, treeHeight * 0.72, Math.sin(bAngle) * bRing);
    branch.rotation.z = (random() - 0.5) * 1.1;
    branch.rotation.y = random() * Math.PI * 2;
    group.add(branch);
  }

  var statueGroup = new THREE.Group();
  statueGroup.name = "TormentStatue";
  var pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.35, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x868b90, roughness: 0.96 })
  );
  pedestal.position.y = 0.175;
  var body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.36, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x777c82, roughness: 0.95 })
  );
  body.position.y = 0.95;
  var head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x6f747a, roughness: 0.98 })
  );
  head.position.y = 1.72;
  head.scale.set(1, 0.82, 0.9);
  var hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.52, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.92 })
  );
  hatBrim.position.y = 1.92;
  var hatTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: 0x4f5358, roughness: 0.92 })
  );
  hatTop.position.y = 2.08;
  var crack = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.7, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 1 })
  );
  crack.position.set(0.08, 1.05, 0.16);
  crack.rotation.z = 0.22;
  statueGroup.add(pedestal, body, head, hatBrim, hatTop, crack);
  group.add(statueGroup);

  var statuePick = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.4, 1.6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  statuePick.position.set(0, 1.2, 0);
  statuePick.name = "TormentStatueInteract";
  statuePick.userData.brInteract = { kind: "torment_statue" };
  statueGroup.add(statuePick);

  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xd9dde3 })
  );
  moon.position.set(-radius * 0.55, radius * 0.72, -radius * 0.85);
  group.add(moon);

  var rim = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.98, radius * 1.08, 48),
    new THREE.MeshBasicMaterial({
      color: 0x2a2d31,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
  );
  rim.rotation.x = -Math.PI * 0.5;
  rim.position.y = 0.03;
  group.add(rim);

  var hemi = new THREE.HemisphereLight(0xbfc4cb, 0x2a2d31, 0.42);
  var moonLight = new THREE.DirectionalLight(0xd8dde4, 0.28);
  moonLight.position.copy(moon.position);
  group.add(hemi, moonLight);

  if (scene) scene.add(group);

  var interactMeshes = [statuePick];
  var colliders = [
    {
      minX: -1.0,
      maxX: 1.0,
      minZ: -1.0,
      maxZ: 1.0,
      local: true,
    },
  ];

  var disposed = false;
  var enteredAt =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  var expiresAt =
    enteredAt +
    TORMENT_MIN_DURATION_MS +
    Math.floor(random() * (TORMENT_MAX_DURATION_MS - TORMENT_MIN_DURATION_MS));
  var elapsed = 0;
  var leafStepTimer = 0;
  var screamCooldown = 0;
  var screamAudio = null;
  var statueSeen = readTormentState().statueSeen;
  var stats = {
    leafSteps: 0,
    screams: 0,
    statueSeen: statueSeen,
    enteredAt: enteredAt,
    expiresAt: expiresAt,
  };
  var fxCanvas = null;
  var fxCtx = null;

  function resolveWorldColliders() {
    return colliders.map(function (box) {
      if (box.local) {
        return {
          minX: box.minX,
          maxX: box.maxX,
          minZ: box.minZ,
          maxZ: box.maxZ,
        };
      }
      return box;
    });
  }

  function getInteractionHint(target) {
    var object = target && target.object ? target.object : target;
    var data =
      object && object.userData
        ? object.userData.brInteract
        : object && object.kind
          ? object
          : null;
    if (!data || data.kind !== "torment_statue") return "";
    if (statueSeen) return "";
    return "破损石像 · 按 Q 观察";
  }

  function interact(target, callbacks) {
    if (disposed) return false;
    var object = target && (target.object || target);
    var data =
      object && object.userData
        ? object.userData.brInteract
        : object && object.kind
          ? object
          : null;
    if (!data || data.kind !== "torment_statue" || statueSeen) return false;
    statueSeen = true;
    stats.statueSeen = true;
    writeTormentState({ encountered: true, statueSeen: true });
    callbacks = callbacks || {};
    if (typeof callbacks.showToast === "function") {
      callbacks.showToast(STATUE_TEXT, 6200);
    }
    return true;
  }

  function triggerLeafScream(callbacks) {
    if (screamCooldown > 0) return;
    screamCooldown = 0.85 + Math.random() * 0.55;
    stats.screams += 1;
    stopScreamAudio(screamAudio);
    screamAudio = createProceduralScream();
    if (screamAudio) {
      try {
        screamAudio.gain.gain.setTargetAtTime(
          0.012 + Math.random() * 0.01,
          screamAudio.context.currentTime,
          0.02
        );
        window.setTimeout(function () {
          stopScreamAudio(screamAudio);
          screamAudio = null;
        }, 320);
      } catch (err) {
        stopScreamAudio(screamAudio);
        screamAudio = null;
      }
    }
    if (callbacks && typeof callbacks.onSanityPulse === "function") {
      callbacks.onSanityPulse(0.9 + Math.random() * 0.8);
    }
  }

  return {
    group: group,
    colliders: resolveWorldColliders(),
    interactMeshes: interactMeshes,
    spawn: { x: 0, z: radius * 0.62, yaw: Math.PI },
    fogPreset: TORMENT_FOG_PRESET,
    update: function updateGraveyard(dt, player, survival, callbacks) {
      if (disposed) return;
      callbacks = callbacks || {};
      var delta = Math.max(0, Math.min(Number(dt) || 0, 0.08));
      elapsed += delta;
      screamCooldown = Math.max(0, screamCooldown - delta);

      var px = player && Number.isFinite(player.x) ? player.x : 0;
      var pz = player && Number.isFinite(player.z) ? player.z : 0;
      var moving =
        typeof callbacks.moving === "boolean"
          ? callbacks.moving
          : !!(player && (Math.abs(player.vx || 0) > 0.04 || Math.abs(player.vz || 0) > 0.04));
      var grounded =
        typeof callbacks.grounded === "boolean"
          ? callbacks.grounded
          : !!(player && player.onGround !== false);

      if (moving && grounded) {
        leafStepTimer += delta;
        if (leafStepTimer >= 0.34) {
          leafStepTimer = 0;
          stats.leafSteps += 1;
          triggerLeafScream(callbacks);
        }
      } else {
        leafStepTimer = Math.min(leafStepTimer, 0.2);
      }

      var dist = Math.sqrt(px * px + pz * pz);
      if (dist > radius * 0.98) {
        var scale = (radius * 0.98) / Math.max(0.001, dist);
        if (player) {
          player.x = px * scale;
          player.z = pz * scale;
        }
      }

      moonLight.intensity = 0.24 + Math.sin(elapsed * 0.7) * 0.03;
      hatTop.rotation.y = Math.sin(elapsed * 0.15) * 0.015;
      return stats;
    },
    drawFx: function drawFx(canvas, now) {
      if (disposed || !canvas) return;
      if (fxCanvas !== canvas) {
        fxCanvas = canvas;
        fxCtx = canvas.getContext("2d");
      }
      if (!fxCtx) return;
      var width = canvas.width;
      var height = canvas.height;
      fxCtx.clearRect(0, 0, width, height);
      var t = (Number(now) || 0) * 0.001;
      var fogAlpha = 0.16 + Math.sin(t * 1.4) * 0.03;
      var grad = fxCtx.createRadialGradient(
        width * 0.5,
        height * 0.58,
        Math.min(width, height) * 0.08,
        width * 0.5,
        height * 0.58,
        Math.max(width, height) * 0.72
      );
      grad.addColorStop(0, "rgba(120,126,134,0)");
      grad.addColorStop(0.55, "rgba(95,100,108," + fogAlpha + ")");
      grad.addColorStop(1, "rgba(55,58,62," + (fogAlpha + 0.18) + ")");
      fxCtx.fillStyle = grad;
      fxCtx.fillRect(0, 0, width, height);
      fxCtx.fillStyle = "rgba(220,224,230,0.04)";
      for (var i = 0; i < 28; i++) {
        var seed = i * 0.173 + t * 0.08;
        var x = ((seed * 997) % 1) * width;
        var y = ((seed * 613) % 1) * height;
        fxCtx.fillRect(x, y, 1, 1);
      }
    },
    getSurvivalEnv: function getSurvivalEnv() {
      return {
        sanityDrainPerSec: TORMENT_SANITY_DRAIN_PER_SEC,
        skipPassiveSanity: false,
      };
    },
    getStats: function getStats() {
      return {
        leafSteps: stats.leafSteps,
        screams: stats.screams,
        statueSeen: stats.statueSeen,
        enteredAt: stats.enteredAt,
        expiresAt: stats.expiresAt,
        remainingMs: Math.max(0, stats.expiresAt - (performance.now ? performance.now() : Date.now())),
      };
    },
    getInteractionHint: getInteractionHint,
    interact: interact,
    isExpired: function isExpired(nowMs) {
      var now =
        typeof nowMs === "number"
          ? nowMs
          : typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
      return now >= stats.expiresAt;
    },
    dispose: function disposeGraveyard() {
      if (disposed) return;
      disposed = true;
      stopScreamAudio(screamAudio);
      screamAudio = null;
      disposeObject3D(group);
      fxCanvas = null;
      fxCtx = null;
    },
  };
}

export function pointInTormentTrigger(px, pz, trigger) {
  return !!trigger && pointInTrigger(px, pz, trigger);
}

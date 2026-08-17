/**
 * Backrooms Level C-1292 — 项目：衰退瘾（死区）
 * 少年 Jones 正在崩坏的意识具象：研究所稳定期 → 空间崩坏期 → 终末重置期。
 * 本层没有出口、据点或传统实体，全部威胁来自记忆侵蚀与环境崩塌。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { getLuck } from "./backrooms-luck.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
const LAB_HALF = 38;
const CENTER_RADIUS = 34;
const STABLE_MIN_SECONDS = 60;
const TERMINAL_FORCE_SECONDS = 240;
const FALL_DAMAGE = 72;
const CRACK_WARNING_SECONDS = 1.65;
const FALL_WARNING_SECONDS = 1.3;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 30, radius: 0.34, speed: 3.65 },
});
const colliders = [];
const props = [];
const destructibleWalls = [];
const hazards = [];
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 4.6, floorY: 0 };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const memoryFillEl = document.getElementById("backroomsMemoryFill");
const memoryValueEl = document.getElementById("backroomsMemoryValue");
const phaseEl = document.getElementById("backroomsC1292Phase");
const pixelCanvas = document.getElementById("backroomsPixelNoise");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let labRoot = null;
let stableLights = [];
let memory = 0;
let elapsed = 0;
let phase = 1;
let nextHazardAt = 0;
let nextAmnesiaAt = 18;
let nextPixelDrawAt = 0;
let audio = null;
let deathResetQueued = false;

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xa6aaab, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.98 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x6f7578, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x596166, roughness: 0.58, metalness: 0.72 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x899398, roughness: 0.45, metalness: 0.78 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xaec4ca,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    roughness: 0.25,
  }),
  paper: new THREE.MeshStandardMaterial({ color: 0xd5d1c5, roughness: 1 }),
  dark: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  warning: new THREE.MeshBasicMaterial({
    color: 0xffc15a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
  crack: new THREE.MeshBasicMaterial({
    color: 0x020203,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  }),
  toxic: new THREE.MeshBasicMaterial({
    color: 0x9a9e98,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  }),
};

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, mat, x, y, z, sx, sy, sz, collide) {
  var mesh = new THREE.Mesh(boxGeo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - sx * 0.5, x + sx * 0.5, z - sz * 0.5, z + sz * 0.5));
  }
  return mesh;
}

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1292 无法启动</strong></p><p>" + String(text) + "</p>";
}

function makeArchiveTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#dedbd0";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#242729";
  ctx.font = "bold 19px monospace";
  ctx.fillText("U.E.C // PROJECT", 14, 28);
  ctx.fillStyle = "#9f2929";
  ctx.font = "bold 25px sans-serif";
  ctx.fillText("衰退瘾", 14, 61);
  ctx.fillStyle = "#4a4d4f";
  ctx.font = "14px monospace";
  ctx.fillText("SUBJECT: JONES", 14, 89);
  ctx.fillText("MEMORY COHESION: FAIL", 14, 110);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLab(root) {
  labRoot = root;
  addBox(root, mats.floor, 0, -0.12, 0, LAB_HALF * 2, 0.22, LAB_HALF * 2, false);
  addBox(root, mats.concreteDark, 0, 4.7, 0, LAB_HALF * 2, 0.22, LAB_HALF * 2, false);

  // 外墙与空气墙。
  addBox(root, mats.concrete, 0, 2.3, -LAB_HALF, LAB_HALF * 2, 4.6, 0.6, true);
  addBox(root, mats.concrete, 0, 2.3, LAB_HALF, LAB_HALF * 2, 4.6, 0.6, true);
  addBox(root, mats.concrete, -LAB_HALF, 2.3, 0, 0.6, 4.6, LAB_HALF * 2, true);
  addBox(root, mats.concrete, LAB_HALF, 2.3, 0, 0.6, 4.6, LAB_HALF * 2, true);

  // 地下研究所：十字主廊，两侧实验室/观测室。门洞留在墙段之间。
  var z;
  for (z = -30; z <= 30; z += 12) {
    addBox(root, mats.concrete, -10, 2.2, z, 14, 4.4, 0.38, true);
    addBox(root, mats.concrete, 10, 2.2, z, 14, 4.4, 0.38, true);
  }
  var x;
  for (x = -30; x <= 30; x += 12) {
    addBox(root, mats.concrete, x, 2.2, -10, 0.38, 4.4, 14, true);
    addBox(root, mats.concrete, x, 2.2, 10, 0.38, 4.4, 14, true);
  }

  // 房间隔墙：部分只作视觉结构，崩坏时可融化消失。
  var i;
  for (i = 0; i < 22; i++) {
    var horizontal = i % 2 === 0;
    var px = -30 + ((i * 13) % 60);
    var pz = -30 + ((i * 19) % 60);
    if (Math.abs(px) < 8 || Math.abs(pz) < 8) continue;
    var wall = addBox(
      root,
      i % 3 ? mats.concrete : mats.concreteDark,
      px,
      2.15,
      pz,
      horizontal ? 7 : 0.32,
      4.3,
      horizontal ? 0.32 : 7,
      false
    );
    destructibleWalls.push(wall);
  }

  // 观测室玻璃。
  for (i = 0; i < 8; i++) {
    var gx = i < 4 ? -18 + i * 12 : i % 2 ? -20 : 20;
    var gz = i < 4 ? (i % 2 ? -13 : 13) : -24 + (i - 4) * 12;
    var glass = addBox(root, mats.glass, gx, 2.05, gz, i < 4 ? 8 : 0.12, 2.7, i < 4 ? 0.12 : 8, false);
    props.push(glass);
  }

  // 翻倒的金属桌椅、实验设备与纸质档案。
  for (i = 0; i < 30; i++) {
    var ax = -31 + ((i * 17) % 62);
    var az = -31 + ((i * 29) % 62);
    if (Math.abs(ax) < 4 || Math.abs(az) < 4) continue;
    var table = addBox(root, mats.metal, ax, 0.48, az, 2.2, 0.12, 1.15, false);
    table.rotation.y = (i % 7) * 0.41;
    if (i % 4 === 0) table.rotation.z = 0.55;
    props.push(table);
    if (i % 2 === 0) {
      var paper = addBox(root, mats.paper, ax + 0.7, 0.08, az - 0.5, 0.6, 0.025, 0.42, false);
      paper.rotation.y = i * 0.77;
      props.push(paper);
    }
    if (i % 3 === 0) {
      var device = addBox(root, mats.steel, ax - 0.4, 0.85, az + 0.25, 0.8, 0.7, 0.55, false);
      device.rotation.y = i * 0.31;
      props.push(device);
    }
  }

  // U.E.C / Jones 档案牌。
  var archive = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.3),
    new THREE.MeshBasicMaterial({ map: makeArchiveTexture() })
  );
  archive.position.set(0, 2.45, -37.62);
  root.add(archive);

  // 裸露管线。
  for (i = -3; i <= 3; i++) {
    var pipe = new THREE.Mesh(cylinderGeo, mats.metal);
    pipe.scale.set(0.09, 35, 0.09);
    pipe.rotation.z = Math.PI * 0.5;
    pipe.position.set(0, 4.34, i * 0.75);
    root.add(pipe);
  }

  // 频闪荧光灯。
  for (z = -32; z <= 32; z += 8) {
    var light = new THREE.PointLight(0xe7f2f3, 0.75, 13, 2);
    light.position.set(0, 4.15, z);
    light.userData.baseIntensity = light.intensity;
    root.add(light);
    stableLights.push(light);
    addBox(root, mats.steel, 0, 4.25, z, 0.25, 0.08, 3.2, false);
  }
  for (x = -32; x <= 32; x += 8) {
    var crossLight = new THREE.PointLight(0xdde9ea, 0.58, 11, 2);
    crossLight.position.set(x, 4.1, 0);
    crossLight.userData.baseIntensity = crossLight.intensity;
    root.add(crossLight);
    stableLights.push(crossLight);
  }

  root.add(new THREE.HemisphereLight(0xaeb8ba, 0x303437, 0.38));
  root.add(new THREE.AmbientLight(0xa5adae, 0.23));
}

function centerInfluence() {
  return Math.max(0, Math.min(1, 1 - Math.hypot(fps.player.x, fps.player.z) / CENTER_RADIUS));
}

function luckErosionMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.55;
  if (luck >= 30) return 0.82;
  return 1;
}

function luckHazardIntervalMul() {
  var luck = getLuck();
  if (luck <= -30) return 0.48;
  if (luck >= 30) return 1.22;
  return 1;
}

function resolvePhase() {
  if (elapsed < STABLE_MIN_SECONDS && memory < 0.3) return 1;
  if (elapsed < TERMINAL_FORCE_SECONDS && memory < 0.78) return 2;
  return 3;
}

function applyPhase(next) {
  if (phase === next) return;
  phase = next;
  if (phase === 2) {
    showToast("研究所的结构开始瓦解——裂隙和坠落物会先出现明显预警！", 4200);
    scene.fog = new THREE.FogExp2(0x6b7072, 0.026);
  } else if (phase === 3) {
    showToast("终末重置阶段：有毒灰雾正在灌满研究所！", 4200);
    scene.fog = new THREE.FogExp2(0x777b77, 0.075);
  }
  updatePhaseUi();
}

function updatePhaseUi() {
  if (!phaseEl) return;
  phaseEl.textContent =
    phase === 1
      ? "第一阶段 · 研究所稳定期"
      : phase === 2
        ? "第二阶段 · 空间崩坏期"
        : "第三阶段 · 终末重置";
}

function updateMemory(dt) {
  if (!survival || survival.dead) return;
  var infl = centerInfluence();
  // 边缘约 8 分钟耗尽，中心约 2.7 分钟；幸运只能小幅减缓，无法免疫。
  var rate = (1 / 480 + infl / 240) * luckErosionMul();
  memory = Math.min(1, memory + rate * dt);
  survival.sanity = Math.max(1, survival.sanity - (0.18 + infl * 0.62) * luckErosionMul() * dt);

  if (memoryFillEl) memoryFillEl.style.width = Math.round(memory * 100) + "%";
  if (memoryValueEl) memoryValueEl.textContent = Math.round(memory * 100) + "%";
  applyPhase(resolvePhase());

  if (memory >= 1) {
    showToast("最后一段记忆被吞噬。", 2400);
    survival.triggerDeath("memory_erosion");
  }
}

function updateAmnesia() {
  if (!survival || survival.dead || elapsed < nextAmnesiaAt) return;
  var infl = centerInfluence();
  nextAmnesiaAt =
    elapsed + Math.max(4, 19 - memory * 11 - infl * 7) + Math.random() * 7;
  var messages = [
    "你忽然忘记自己为什么会来到这里。",
    "手中的道具看起来十分陌生……它原本有什么用途？",
    "前方的走廊短暂融化成一片灰白像素。",
    "一个名字从记忆里消失了，只剩下空白。",
    "你确信刚才这里有一扇门——现在却什么都没有。",
  ];
  showToast(messages[Math.floor(Math.random() * messages.length)]);
  if (hintEl) {
    var old = hintEl.innerHTML;
    hintEl.textContent = "？？？ · 你暂时忘记了操作方式";
    window.setTimeout(function () {
      if (hintEl) hintEl.innerHTML = old;
    }, 900 + memory * 1500);
  }
}

function createCrackHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 3.5 + Math.random() * 11;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.025, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var crack = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.25), mats.crack.clone());
  crack.rotation.x = -Math.PI * 0.5;
  crack.rotation.z = Math.random() * Math.PI;
  crack.visible = false;
  group.add(crack);
  labRoot.add(group);
  hazards.push({
    kind: "crack",
    group: group,
    warning: warning,
    danger: crack,
    x: x,
    z: z,
    radius: 1.35,
    timer: 0,
    warningSeconds: CRACK_WARNING_SECONDS,
    duration: 7.5,
  });
}

function createFallingHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 3 + Math.random() * 12;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.02, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var isManhole = Math.random() < 0.58;
  var falling = isManhole
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.16, 24), mats.metal)
    : new THREE.Mesh(boxGeo, mats.steel);
  if (!isManhole) falling.scale.set(2.4, 0.18, 1.5);
  falling.position.y = 13;
  falling.visible = false;
  group.add(falling);
  labRoot.add(group);
  hazards.push({
    kind: "fall",
    group: group,
    warning: warning,
    danger: falling,
    x: x,
    z: z,
    radius: 1.85,
    timer: 0,
    warningSeconds: FALL_WARNING_SECONDS,
    duration: 3.2,
    landed: false,
    startY: 13,
  });
}

function createBlastHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 4 + Math.random() * 10;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.03, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mats.toxic.clone());
  smoke.position.y = 1.4;
  smoke.visible = false;
  group.add(smoke);
  labRoot.add(group);
  hazards.push({
    kind: "blast",
    group: group,
    warning: warning,
    danger: smoke,
    x: x,
    z: z,
    radius: 3,
    timer: 0,
    warningSeconds: 1.8,
    duration: 3.6,
    landed: false,
  });
}

function scheduleHazard(now) {
  if (phase === 1) return;
  var roll = Math.random();
  if (phase === 3 && roll < 0.25) createBlastHazard();
  else if (roll < 0.57) createFallingHazard();
  else createCrackHazard();
  var base =
    phase === 2 ? 2600 + Math.random() * 3200 : 1050 + Math.random() * 1800;
  nextHazardAt = now + base * luckHazardIntervalMul();
}

function removeHazard(index) {
  var h = hazards[index];
  if (h && h.group && h.group.parent) h.group.parent.remove(h.group);
  if (h && h.warning && h.warning.material && h.warning.material.dispose) {
    h.warning.material.dispose();
  }
  if (h && h.danger && h.danger.material && h.danger.material !== mats.metal && h.danger.material !== mats.steel) {
    h.danger.material.dispose();
  }
  hazards.splice(index, 1);
}

function updateHazards(dt) {
  if (!survival || survival.dead) return;
  for (var i = hazards.length - 1; i >= 0; i--) {
    var h = hazards[i];
    h.timer += dt;
    var warned = h.timer < h.warningSeconds;
    h.warning.visible = warned;
    h.warning.material.opacity = 0.16 + Math.abs(Math.sin(h.timer * 8)) * 0.36;
    if (!warned) h.danger.visible = true;

    var d = Math.hypot(fps.player.x - h.x, fps.player.z - h.z);
    if (h.kind === "crack" && !warned && d < h.radius) {
      showToast("地面裂开前已有像素化裂纹警告——你仍踩进了虚空！");
      survival.triggerDeath("c1292_void_crack");
      return;
    }
    if (h.kind === "fall" && !warned) {
      var fallT = Math.min(1, (h.timer - h.warningSeconds) / 0.48);
      h.danger.position.y = h.startY * (1 - fallT);
      h.danger.rotation.x += dt * 7;
      h.danger.rotation.z += dt * 5;
      if (fallT >= 1 && !h.landed) {
        h.landed = true;
        playImpact();
        if (d < h.radius) {
          survival.takeDamage(FALL_DAMAGE);
          showToast("坠落的井盖与设备碎片重重砸中你！");
        }
      }
    }
    if (h.kind === "blast" && !warned) {
      var blastT = Math.min(1, (h.timer - h.warningSeconds) / 0.45);
      h.danger.scale.setScalar(0.4 + blastT * 3.3);
      h.danger.material.opacity = 0.3 * (1 - blastT * 0.55);
      if (!h.landed) {
        h.landed = true;
        playExplosion();
        if (d < h.radius) survival.takeDamage(58);
      }
    }
    if (h.timer >= h.duration) removeHazard(i);
  }
}

function updateWorldDecay(dt) {
  var i;
  var flickerChance = phase === 1 ? 0.015 : phase === 2 ? 0.05 : 0.12;
  for (i = 0; i < stableLights.length; i++) {
    var light = stableLights[i];
    var base = light.userData.baseIntensity || 0.5;
    var dim = phase === 1 ? 1 : phase === 2 ? 0.58 : 0.18;
    light.intensity = Math.random() < flickerChance ? 0.02 : base * dim;
  }
  for (i = 0; i < destructibleWalls.length; i++) {
    destructibleWalls[i].visible = memory < 0.28 + (i / destructibleWalls.length) * 0.68;
  }
  for (i = 0; i < props.length; i++) {
    var threshold = 0.42 + (i / Math.max(1, props.length)) * 0.5;
    props[i].visible = memory < threshold || Math.sin(elapsed * 4 + i) > 0.8;
  }
  if (phase === 3 && survival && !survival.dead) {
    survival.takeDamage(2.1 * dt);
  }
}

function updatePixelNoise(now) {
  if (!pixelCanvas || now < nextPixelDrawAt) return;
  nextPixelDrawAt = now + Math.max(55, 150 - memory * 90);
  var ctx = pixelCanvas.getContext("2d");
  var w = pixelCanvas.width;
  var h = pixelCanvas.height;
  ctx.clearRect(0, 0, w, h);
  var infl = centerInfluence();
  var count = Math.floor(45 + memory * 330 + infl * 150);
  for (var i = 0; i < count; i++) {
    var edge = Math.random() < 0.72;
    var x;
    var y;
    if (edge) {
      var side = Math.floor(Math.random() * 4);
      x = side < 2 ? Math.random() * w : side === 2 ? Math.random() * w * 0.18 : w * (0.82 + Math.random() * 0.18);
      y = side >= 2 ? Math.random() * h : side === 0 ? Math.random() * h * 0.2 : h * (0.8 + Math.random() * 0.2);
    } else {
      x = Math.random() * w;
      y = Math.random() * h;
    }
    var size = Math.random() < memory ? 2 + Math.floor(Math.random() * 6) : 1;
    var alpha = 0.12 + Math.random() * (0.25 + memory * 0.45);
    var shade = 155 + Math.floor(Math.random() * 90);
    ctx.fillStyle = "rgba(" + shade + "," + shade + "," + shade + "," + alpha + ")";
    ctx.fillRect(x | 0, y | 0, size, size);
  }
  // 局部马赛克扭曲块；侵蚀越深越频繁。
  if (Math.random() < memory * 0.75) {
    for (i = 0; i < 2 + memory * 8; i++) {
      ctx.fillStyle = "rgba(180,184,184," + (0.05 + memory * 0.13) + ")";
      ctx.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 35, 2 + Math.random() * 10);
    }
  }
}

function startAudio() {
  if (audio) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 54;
    var humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    var humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 180;
    hum.connect(humFilter).connect(humGain).connect(ctx.destination);
    hum.start();
    audio = { ctx: ctx, hum: hum, humGain: humGain };
  } catch (err) {
    audio = null;
  }
}

function playImpact() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(34, now + 0.62);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.78);
}

function playExplosion() {
  if (!audio || !audio.ctx) return;
  playImpact();
  var ctx = audio.ctx;
  var length = Math.floor(ctx.sampleRate * 0.65);
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  var src = ctx.createBufferSource();
  src.buffer = buffer;
  var gain = ctx.createGain();
  gain.gain.value = 0.13;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 6.1);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
  window.addEventListener("click", startAudio, { once: true });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) startAudio();
  });
}

function resetAfterExtinction() {
  // 单人关卡中玩家就是最后一个生命。死亡后先让世界在死亡界面后方完整复原，
  // 下次进入页面时也会从稳定期重新开始。
  memory = 0;
  elapsed = 0;
  phase = 1;
  for (var i = hazards.length - 1; i >= 0; i--) removeHazard(i);
  for (i = 0; i < destructibleWalls.length; i++) destructibleWalls[i].visible = true;
  for (i = 0; i < props.length; i++) props[i].visible = true;
  scene.fog = new THREE.FogExp2(0x848b8e, 0.018);
  updatePhaseUi();
  if (memoryFillEl) memoryFillEl.style.width = "0%";
  if (memoryValueEl) memoryValueEl.textContent = "0%";
}

function init() {
  if (!enforceLevelEntry("c1292", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1292", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7d8487);
  scene.fog = new THREE.FogExp2(0x848b8e, 0.018);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 110);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  labRoot = new THREE.Group();
  labRoot.name = "BackroomsLevelC1292";
  scene.add(labRoot);
  buildLab(labRoot);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1292" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水恢复了身体，却无法阻止衰退瘾吞噬记忆。");
    },
  });
  initBackroomsTemperature("c1292", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1292 · 项目：衰退瘾 · 生存难度 死区 · 无出口 · " +
      "<kbd>WASD</kbd> 移动 · 留意橙色灾害预警";
  }
  updatePhaseUi();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      elapsed += dt;
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
      updateMemory(dt);
      updateAmnesia();
      if (phase >= 2 && now >= nextHazardAt) scheduleHazard(now);
      updateHazards(dt);
      updateWorldDecay(dt);
    } else if (survival && survival.dead && !deathResetQueued) {
      deathResetQueued = true;
      window.setTimeout(resetAfterExtinction, 1400);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      // 侵蚀后期反应迟钝，但不会突然锁死移动。
      mul *= Math.max(0.62, 1 - memory * 0.38);
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 10);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updatePixelNoise(now);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1292]", err);
  showError(err.message || String(err));
}

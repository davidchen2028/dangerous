/**
 * Backrooms Level C-1299 — 浓汤煮沸（死区）
 * 一口无限翻滚的高汤大锅：白茫茫灼热汤雾填满四面八方。
 * 玩家悬浮其中不受控漂移；核心致死：由内到外的熬煮消融。
 * 唯一外勤撤离：雾中黑色浮石平台 → C-1299.1。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler, addItem, removeFirstItem, countItem } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  damageCarriedTaskItems,
  isTaskAccepted,
  isTaskDelivered,
  isTaskCompleted,
  recordReconSighting,
  getReconProgress,
  deliverDeferredReconTask,
} from "./backrooms-tasks.js";
import { getLuck } from "./backrooms-luck.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  createBackroomsFpsState,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
const DEBRIS_COUNT = 90;
/** 熬煮消融从 0→1 基础秒数（约 2 分钟） */
const BOIL_SECONDS = 120;
const BLEED_HEAVY_DPS = 3.2;
const PLATFORM = { x: 14, y: 2, z: -11, r: 2.4 };
const EXIT_REACH = 3.2;
const SAMPLE_TASK = "sample_c1299_fog";
const BEACON_TASK = "beacon_c1299";
const PAGES_TASK = "pages_c1299";
const SAMPLE_REACH = 3.8;
const BEACON_REACH = 4.2;
const PAGE_REACH = 3.5;

/** 三处不同方位的信标投放锚点（相对出生漩涡） */
const BEACON_ZONES = [
  { id: "east", x: 22, y: 1, z: 4 },
  { id: "west", x: -20, y: -2, z: -6 },
  { id: "south", x: 3, y: 3, z: 24 },
];

/** 浓密采样雾团锚点 */
const SAMPLE_ZONES = [
  { id: "fog_a", x: -12, y: 2, z: 10 },
  { id: "fog_b", x: 8, y: -3, z: -16 },
  { id: "fog_c", x: 18, y: 4, z: 12 },
];

const FROZEN_USE_KEYS = [
  "__backroomsUseAlmondWater",
  "__backroomsUseStrawberrySoyMilk",
  "__backroomsUseBananaSoyMilk",
  "__backroomsUseLuckySoyMilk",
  "__backroomsUseVaultSoyMilk",
];

const MEG_RECORD =
  "外勤记录 C-1299-05\n\n" +
  "千万不要被香味欺骗。你悬浮在空中不受控制地打转，很难瞄准那块唯一的黑石。" +
  "在这里每多待一秒，身体都在被慢慢熬煮。设备很容易损坏，外勤行动必须争分夺秒。";

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 0 },
});
fps.feetY = 0;
fps.grounded = false;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const boilFillEl = document.getElementById("backroomsBoilFill");
const boilValueEl = document.getElementById("backroomsBoilValue");
const bleedStatusEl = document.getElementById("backroomsBleedStatus");
const fxCanvas = document.getElementById("backroomsBrothFx");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let brothRoot = null;
let debris = [];
let platformMesh = null;
let noteMesh = null;
/** @type {{ id: string, mesh: THREE.Object3D, x: number, y: number, z: number }[]} */
let sampleZones = [];
/** @type {{ id: string, mesh: THREE.Object3D, x: number, y: number, z: number }[]} */
let beaconZones = [];
/** @type {{ id: string, mesh: THREE.Object3D, x: number, y: number, z: number, taken?: boolean }[]} */
let scrapPages = [];
let elapsed = 0;
/** 熬煮消融 0..1 */
let boil = 0;
let stage30 = false;
let stage60 = false;
let bleed = 0;
let nextItemCheckAt = 6;
let nextWhisperAt = 10;
let nextBubbleAt = 2;
let transitionLock = false;
let readNote = false;
let aimKind = "";
let audioCtx = null;
let bubbleOsc = null;
let bubbleGain = null;

const materials = {
  fog: new THREE.MeshBasicMaterial({
    color: 0xf2ebe0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  debris: new THREE.MeshStandardMaterial({
    color: 0xb8a078,
    roughness: 0.95,
    transparent: true,
    opacity: 0.7,
  }),
  bone: new THREE.MeshStandardMaterial({
    color: 0xd8cfc0,
    roughness: 0.85,
    transparent: true,
    opacity: 0.65,
  }),
  platform: new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.55,
    metalness: 0.15,
  }),
  note: new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }),
  denseFog: new THREE.MeshBasicMaterial({
    color: 0xfff8ee,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
  beacon: new THREE.MeshStandardMaterial({
    color: 0x3a8fd0,
    emissive: 0x1a4a80,
    emissiveIntensity: 0.8,
    roughness: 0.5,
  }),
  page: new THREE.MeshStandardMaterial({ color: 0xd9c8a0, roughness: 0.75 }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1299 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(i, s) {
  var n = Math.sin(i * 91.3 + s * 277.1) * 43758.5453;
  return n - Math.floor(n);
}

function makeFogSprite() {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,248,236,0.75)");
  g.addColorStop(0.45, "rgba(240,220,190,0.28)");
  g.addColorStop(1, "rgba(220,200,170,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDebris(index) {
  var bone = seeded(index, 1) > 0.62;
  var geo = bone
    ? new THREE.CapsuleGeometry(0.08, 0.45 + seeded(index, 2) * 0.5, 3, 5)
    : new THREE.BoxGeometry(
        0.15 + seeded(index, 3) * 0.4,
        0.08 + seeded(index, 4) * 0.2,
        0.12 + seeded(index, 5) * 0.35
      );
  var mesh = new THREE.Mesh(geo, bone ? materials.bone : materials.debris);
  mesh.userData.p = {
    x: -28 + seeded(index, 6) * 56,
    y: -18 + seeded(index, 7) * 36,
    z: -28 + seeded(index, 8) * 56,
    speed: 1.4 + seeded(index, 9) * 2.8,
    spin: (seeded(index, 10) - 0.5) * 2.5,
    phase: seeded(index, 11) * Math.PI * 2,
  };
  mesh.position.set(mesh.userData.p.x, mesh.userData.p.y, mesh.userData.p.z);
  brothRoot.add(mesh);
  debris.push(mesh);
}

function buildBrothWorld() {
  brothRoot = new THREE.Group();
  brothRoot.name = "BackroomsC1299Broth";
  scene.add(brothRoot);
  sampleZones = [];
  beaconZones = [];
  scrapPages = [];
  debris = [];

  materials.fog.map = makeFogSprite();
  materials.fog.needsUpdate = true;
  var fogGeo = new THREE.PlaneGeometry(6, 6);
  var i;
  for (i = 0; i < 48; i++) {
    var sprite = new THREE.Mesh(fogGeo, materials.fog);
    sprite.position.set(
      -24 + seeded(i, 20) * 48,
      -14 + seeded(i, 21) * 28,
      -24 + seeded(i, 22) * 48
    );
    sprite.scale.setScalar(1.2 + seeded(i, 23) * 2.4);
    sprite.userData.billboard = true;
    sprite.userData.bob = seeded(i, 24) * Math.PI * 2;
    brothRoot.add(sprite);
  }

  for (i = 0; i < DEBRIS_COUNT; i++) createDebris(i);

  // 黑色浮石撤离平台
  platformMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM.r, PLATFORM.r * 1.08, 0.7, 8),
    materials.platform
  );
  platformMesh.position.set(PLATFORM.x, PLATFORM.y, PLATFORM.z);
  brothRoot.add(platformMesh);
  var rim = new THREE.Mesh(
    new THREE.TorusGeometry(PLATFORM.r * 0.92, 0.08, 6, 16),
    materials.platform
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(PLATFORM.x, PLATFORM.y + 0.38, PLATFORM.z);
  brothRoot.add(rim);

  noteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.04), materials.note);
  noteMesh.position.set(PLATFORM.x + 0.9, PLATFORM.y + 0.85, PLATFORM.z + 0.4);
  brothRoot.add(noteMesh);

  // 浓密采样雾团
  for (i = 0; i < SAMPLE_ZONES.length; i++) {
    var sz = SAMPLE_ZONES[i];
    var cloud = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), materials.denseFog);
    cloud.position.set(sz.x, sz.y, sz.z);
    brothRoot.add(cloud);
    sampleZones.push({ id: sz.id, mesh: cloud, x: sz.x, y: sz.y, z: sz.z });
  }

  // 信标投放锚点（发光浮标）
  for (i = 0; i < BEACON_ZONES.length; i++) {
    var bz = BEACON_ZONES[i];
    var mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), materials.beacon);
    mark.position.set(bz.x, bz.y, bz.z);
    brothRoot.add(mark);
    beaconZones.push({ id: bz.id, mesh: mark, x: bz.x, y: bz.y, z: bz.z });
  }

  // 飘流残页
  for (i = 0; i < 4; i++) {
    var px = -18 + seeded(i, 40) * 36;
    var py = -8 + seeded(i, 41) * 16;
    var pz = -18 + seeded(i, 42) * 36;
    var page = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), materials.page);
    page.position.set(px, py, pz);
    brothRoot.add(page);
    scrapPages.push({
      id: "page_" + i,
      mesh: page,
      x: px,
      y: py,
      z: pz,
      phase: seeded(i, 43) * Math.PI * 2,
    });
  }

  brothRoot.add(new THREE.HemisphereLight(0xfff0d8, 0x6a5040, 0.7));
  brothRoot.add(new THREE.AmbientLight(0xe8d8c0, 0.55));
  var glow = new THREE.PointLight(0xffd9a0, 1.1, 40, 2);
  glow.position.set(0, 4, 0);
  brothRoot.add(glow);
}

/* ------------------------------ 豆奶联动 ------------------------------ */

function luckBoilMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.28;
  if (luck >= 30) return 0.84;
  return 1;
}

function luckBreakChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.5;
  if (luck >= 30) return 0.22;
  return 0.35;
}

function luckCraveIntervalMul() {
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 1.25;
  return 1;
}

/* ------------------------------ 漂移 / 残渣 ------------------------------ */

function updateDebris(dt) {
  for (var i = 0; i < debris.length; i++) {
    var mesh = debris[i];
    var p = mesh.userData.p;
    p.x += Math.sin(elapsed * 0.35 + p.phase) * p.speed * dt * 0.55;
    p.z += Math.cos(elapsed * 0.28 + p.phase) * p.speed * dt * 0.55;
    p.y += Math.sin(elapsed * 0.7 + p.phase) * dt * 1.2;
    // 相对玩家循环
    if (p.x - fps.player.x > 30) p.x -= 58;
    else if (p.x - fps.player.x < -30) p.x += 58;
    if (p.z - fps.player.z > 30) p.z -= 58;
    else if (p.z - fps.player.z < -30) p.z += 58;
    if (p.y - fps.feetY > 20) p.y -= 36;
    else if (p.y - fps.feetY < -20) p.y += 36;
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.x += p.spin * dt;
    mesh.rotation.y += p.spin * 0.7 * dt;
  }
  for (i = 0; i < scrapPages.length; i++) {
    var sp = scrapPages[i];
    if (sp.taken) continue;
    sp.x += Math.sin(elapsed * 0.3 + sp.phase) * dt * 1.1;
    sp.z += Math.cos(elapsed * 0.26 + sp.phase) * dt * 1.1;
    sp.y += Math.sin(elapsed * 0.9 + sp.phase) * dt * 0.8;
    sp.mesh.position.set(sp.x, sp.y, sp.z);
    if (camera) sp.mesh.quaternion.copy(camera.quaternion);
  }
  brothRoot.traverse(function (obj) {
    if (!obj.userData || !obj.userData.billboard || !camera) return;
    obj.quaternion.copy(camera.quaternion);
    obj.position.y += Math.sin(elapsed * 0.8 + (obj.userData.bob || 0)) * 0.008;
  });
}

/** 玩家被汤雾裹挟：持续旋转漂移，无法定向移动。 */
function updatePlayerDrift(dt) {
  var swirl = 1.8 + Math.sin(elapsed * 0.45) * 0.5;
  fps.player.x += Math.cos(elapsed * 0.55) * swirl * dt;
  fps.player.z += Math.sin(elapsed * 0.48) * swirl * dt;
  fps.player.x += Math.sin(elapsed * 1.7) * dt * 0.9;
  fps.player.z += Math.cos(elapsed * 1.4) * dt * 0.9;
  fps.feetY += Math.sin(elapsed * 0.9) * dt * 1.15;
  // 缓慢靠近平台时给一点「被气流推近」的微弱拉力，否则几乎不可能抵达
  var dx = PLATFORM.x - fps.player.x;
  var dy = PLATFORM.y - fps.feetY;
  var dz = PLATFORM.z - fps.player.z;
  var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  if (dist < 18) {
    var pull = (1 - dist / 18) * 1.35 * dt;
    fps.player.x += (dx / dist) * pull;
    fps.feetY += (dy / dist) * pull;
    fps.player.z += (dz / dist) * pull;
  }
  fps.velY = 0;
  fps.grounded = false;
  fps.yaw += Math.sin(elapsed * 0.35) * dt * 0.25;
}

/* ------------------------------ 熬煮 / 流血 ------------------------------ */

function refreshBoilUi() {
  var pct = Math.round(boil * 100);
  if (boilFillEl) boilFillEl.style.width = pct + "%";
  if (boilValueEl) boilValueEl.textContent = pct + "%";
}

function refreshBleedUi() {
  if (!bleedStatusEl) return;
  if (bleed <= 0) {
    bleedStatusEl.hidden = true;
    return;
  }
  bleedStatusEl.hidden = false;
  bleedStatusEl.textContent = "重度流血中 · 高温水汽正在从内部侵蚀你";
}

function updateBoil(dt) {
  if (!survival || survival.dead || transitionLock) return;
  boil = Math.min(1, boil + (dt / BOIL_SECONDS) * luckBoilMul());
  refreshBoilUi();

  // 持续高温侵蚀（非直接火焰灼烧）
  survival.takeDamage((0.4 + boil * boil * 2.8) * dt);
  survival.sanity = Math.max(1, survival.sanity - (0.12 + boil * 0.4) * dt);

  if (!stage30 && boil >= 0.3) {
    stage30 = true;
    showToast("热浪侵入身体，一股诱人的香气充斥四周", 3600);
  }
  if (!stage60 && boil >= 0.6) {
    stage60 = true;
    bleed = 2;
    refreshBleedUi();
    showToast("身体正在被熬煮，尽快到达撤离点！不要吸入雾气！", 4000);
  }
  if (bleed >= 2) {
    survival.takeDamage(BLEED_HEAVY_DPS * dt);
  }
  if (boil >= 1) {
    showToast("躯体彻底软化消融——你融入了这锅浓汤。", 3400);
    survival.triggerDeath("c1299_boiled");
  }
}

function updateItemHazard() {
  if (!survival || survival.dead || elapsed < nextItemCheckAt) return;
  nextItemCheckAt = elapsed + 5 + Math.random() * 5;
  if (boil < 0.25) return;
  var failed = damageCarriedTaskItems(
    Math.min(0.95, luckBreakChance() * (0.45 + boil * 0.9)),
    showToast
  );
  if (failed.length) {
    showToast("任务道具被灼热水汽侵蚀损毁，相关任务失败！", 4000);
  }
}

function updateWhispers() {
  if (!survival || survival.dead || elapsed < nextWhisperAt) return;
  nextWhisperAt = elapsed + (8 + Math.random() * 8) * luckCraveIntervalMul();
  var msgs = [
    "咕嘟……咕噜……汤雾在耳边翻滚。",
    "浓郁的鲜香让你忍不住想大口吸入雾气。",
    "细碎残渣撞上脸颊，带着令人作呕的温热。",
    "你隐约看见雾中漂过一截像是肢体的轮廓……",
  ];
  if (getLuck() <= -30 && Math.random() < 0.45) {
    msgs.push("就喝一口吧……就一口……");
  }
  showToast(msgs[Math.floor(Math.random() * msgs.length)], 2800);
}

/* ------------------------------ 沸腾音效（程序化轻量循环） ------------------------------ */

function ensureBubbleAudio() {
  if (audioCtx) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    bubbleOsc = audioCtx.createOscillator();
    bubbleGain = audioCtx.createGain();
    bubbleOsc.type = "sine";
    bubbleOsc.frequency.value = 48;
    bubbleGain.gain.value = 0;
    bubbleOsc.connect(bubbleGain);
    bubbleGain.connect(audioCtx.destination);
    bubbleOsc.start();
  } catch (err) {
    audioCtx = null;
  }
}

function updateBubbleAudio(now) {
  if (!audioCtx || !bubbleGain) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(function () {});
  }
  if (now / 1000 < nextBubbleAt) {
    bubbleGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
    return;
  }
  nextBubbleAt = now / 1000 + 0.35 + Math.random() * 0.55;
  var freq = 36 + Math.random() * 40;
  bubbleOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.02);
  bubbleGain.gain.cancelScheduledValues(audioCtx.currentTime);
  bubbleGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  bubbleGain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 0.04);
  bubbleGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
}

/* ------------------------------ 屏幕特效 ------------------------------ */

function drawOverlay() {
  if (!fxCanvas) return;
  var ctx = fxCanvas.getContext("2d");
  var w = fxCanvas.width;
  var h = fxCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // 白茫茫汤雾基底
  ctx.fillStyle = "rgba(245,236,220," + (0.18 + boil * 0.28) + ")";
  ctx.fillRect(0, 0, w, h);

  // 30%：泛红发热
  if (boil >= 0.3) {
    var red = 0.08 + (boil - 0.3) * 0.35;
    var g = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.1, w * 0.5, h * 0.5, h * 0.8);
    g.addColorStop(0, "rgba(255,120,40,0)");
    g.addColorStop(1, "rgba(180,40,10," + Math.min(0.55, red) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 60%：白雾进一步遮挡
  if (boil >= 0.6) {
    for (var i = 0; i < 18; i++) {
      ctx.fillStyle = "rgba(255,248,236," + (0.08 + (boil - 0.6) * 0.25) + ")";
      ctx.beginPath();
      ctx.arc(
        seeded(i, 30) * w,
        seeded(i, 31) * h,
        12 + seeded(i, 32) * 28,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

/* ------------------------------ 交互 / 撤离 ------------------------------ */

function dist3(ax, ay, az, bx, by, bz) {
  var dx = ax - bx;
  var dy = ay - by;
  var dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distToPlatform() {
  return dist3(PLATFORM.x, PLATFORM.y, PLATFORM.z, fps.player.x, fps.feetY, fps.player.z);
}

function taskActive(id) {
  return isTaskAccepted(id) && !isTaskCompleted(id) && !isTaskDelivered(id);
}

function findNearSampleZone() {
  for (var i = 0; i < sampleZones.length; i++) {
    var z = sampleZones[i];
    if (dist3(z.x, z.y, z.z, fps.player.x, fps.feetY, fps.player.z) <= SAMPLE_REACH) {
      return z;
    }
  }
  return null;
}

function findNearBeaconZone() {
  for (var i = 0; i < beaconZones.length; i++) {
    var z = beaconZones[i];
    if (dist3(z.x, z.y, z.z, fps.player.x, fps.feetY, fps.player.z) <= BEACON_REACH) {
      return z;
    }
  }
  return null;
}

function findNearScrapPage() {
  for (var i = 0; i < scrapPages.length; i++) {
    var p = scrapPages[i];
    if (p.taken) continue;
    if (dist3(p.x, p.y, p.z, fps.player.x, fps.feetY, fps.player.z) <= PAGE_REACH) {
      return p;
    }
  }
  return null;
}

function refreshAim() {
  aimKind = "";
  if (!survival || survival.dead || transitionLock) return;
  if (distToPlatform() <= EXIT_REACH) {
    aimKind = "platform";
    return;
  }
  if (taskActive(SAMPLE_TASK) && findNearSampleZone()) {
    aimKind = "sample";
    return;
  }
  if (taskActive(BEACON_TASK) && findNearBeaconZone()) {
    aimKind = "beacon";
    return;
  }
  if (taskActive(PAGES_TASK) && findNearScrapPage()) {
    aimKind = "page";
    return;
  }
  if (!readNote && noteMesh) {
    var nd = dist3(
      noteMesh.position.x,
      noteMesh.position.y,
      noteMesh.position.z,
      fps.player.x,
      fps.feetY,
      fps.player.z
    );
    if (nd <= EXIT_REACH) aimKind = "note";
  }
}

function updateInteractUi() {
  if (!interactHintEl) return;
  if (!aimKind || transitionLock) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.hidden = false;
  if (aimKind === "platform") {
    interactHintEl.innerHTML = "黑色浮石 · 按 <kbd>Q</kbd> 撤离至 C-1299.1";
  } else if (aimKind === "note") {
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 阅读 M.E.G. 外勤记录";
  } else if (aimKind === "sample") {
    var sp = getReconProgress(SAMPLE_TASK);
    interactHintEl.innerHTML =
      "浓密汤雾 · 按 <kbd>Q</kbd> 采样（" + sp.count + "/" + sp.target + "）";
  } else if (aimKind === "beacon") {
    var bp = getReconProgress(BEACON_TASK);
    interactHintEl.innerHTML =
      "定位锚点 · 按 <kbd>Q</kbd> 投放信标（" + bp.count + "/" + bp.target + "）";
  } else if (aimKind === "page") {
    var pp = getReconProgress(PAGES_TASK);
    interactHintEl.innerHTML =
      "飘流残页 · 按 <kbd>Q</kbd> 拾取（" + pp.count + "/" + pp.target + "）";
  }
}

function trySampleFog() {
  var zone = findNearSampleZone();
  if (!zone) return;
  var result = recordReconSighting(SAMPLE_TASK, zone.id);
  if (!result.ok) {
    // 允许任意浓密雾团采样，但同一雾团只记一次；若已采过换一团
    if (result.reason && result.reason.indexOf("已经记录") >= 0) {
      showToast("这团雾已经采过了，去另一处浓雾。");
      return;
    }
    showToast(result.reason || "无法采样");
    return;
  }
  if (result.done) showToast("汤雾样本已封入采样罐 · 带着罐子撤向黑石！", 3600);
  else showToast("采样成功（" + result.count + "/" + result.target + "）");
}

function tryDeployBeacon() {
  var zone = findNearBeaconZone();
  if (!zone) return;
  if (countItem("beacon_c1299") < 1) {
    showToast("没有剩余的微型定位信标。");
    return;
  }
  var result = recordReconSighting(BEACON_TASK, zone.id);
  if (!result.ok) {
    showToast(result.reason || "无法投放");
    return;
  }
  removeFirstItem("beacon_c1299");
  zone.mesh.material = materials.platform;
  if (result.done) {
    showToast("三枚信标全部部署 · 立刻撤向黑石浮石！", 3600);
    bleed = Math.max(bleed, 1);
    refreshBleedUi();
    showToast("投放过程让伤口恶化，开始流血……");
  } else {
    showToast("信标已部署（" + result.count + "/" + result.target + "）");
    if (Math.random() < 0.55) {
      bleed = Math.max(bleed, 1);
      refreshBleedUi();
      survival.takeDamage(6);
      showToast("漂浮投放时擦伤加重，叠上流血。");
    }
  }
}

function tryPickupPage() {
  var page = findNearScrapPage();
  if (!page) return;
  if (!addItem({ id: "scrap_page_c1299", name: "飘流残页" })) {
    showToast("背包已满，无法拾取残页");
    return;
  }
  var result = recordReconSighting(PAGES_TASK, page.id);
  if (!result.ok) {
    removeFirstItem("scrap_page_c1299");
    showToast(result.reason || "无法记录残页");
    return;
  }
  page.taken = true;
  page.mesh.visible = false;
  if (result.done) showToast("四份残页已齐 · 不要中途阅读，撤向黑石！", 3600);
  else showToast("拾取残页（" + result.count + "/" + result.target + "）· 带回 L4 再读");
}

function settleDeferredTasksOnExit() {
  var msgs = [];
  if (taskActive(SAMPLE_TASK) || (isTaskAccepted(SAMPLE_TASK) && !isTaskDelivered(SAMPLE_TASK))) {
    var s = deliverDeferredReconTask(SAMPLE_TASK, { requireDevice: true });
    if (s.ok && !s.already) msgs.push("汤雾样本采集 · 已可回 L4 领赏");
  }
  if (taskActive(BEACON_TASK) || (isTaskAccepted(BEACON_TASK) && !isTaskDelivered(BEACON_TASK))) {
    var b = deliverDeferredReconTask(BEACON_TASK, {});
    if (b.ok && !b.already) msgs.push("空间坐标标记 · 已可回 L4 领赏");
  }
  if (taskActive(PAGES_TASK) || (isTaskAccepted(PAGES_TASK) && !isTaskDelivered(PAGES_TASK))) {
    var p = deliverDeferredReconTask(PAGES_TASK, { requireFragileCount: 4 });
    if (p.ok && !p.already) msgs.push("飘流残页调查 · 已可回 L4 领赏");
  }
  if (msgs.length) showToast(msgs.join(" / "), 4200);
}

function leaveToC12991() {
  if (transitionLock) return;
  transitionLock = true;
  settleDeferredTasksOnExit();
  boil = 0;
  bleed = 0;
  showToast("你抓住黑石——汤雾撕裂，空间将你抛向浓汤食堂。", 2800);
  saveBackroomsSurvival(survival);
  grantLevelPass("c1299_1", fps.yaw);
  queueEnterLevelBanner("Level C-1299.1");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c1299-1.html";
  }, 700);
}

function tryInteract() {
  if (transitionLock || !survival || survival.dead) return;
  if (aimKind === "platform") {
    leaveToC12991();
    return;
  }
  if (aimKind === "note") {
    readNote = true;
    showToast(MEG_RECORD, 8000);
    return;
  }
  if (aimKind === "sample") {
    trySampleFog();
    return;
  }
  if (aimKind === "beacon") {
    tryDeployBeacon();
    return;
  }
  if (aimKind === "page") {
    tryPickupPage();
  }
}

function sealLiquidItems() {
  for (var i = 0; i < FROZEN_USE_KEYS.length; i++) {
    window[FROZEN_USE_KEYS[i]] = function () {
      showToast("背包里的液体被灼热汤雾瞬间煮沸凝固，完全无法使用。");
    };
  }
}

/** 在本层阅读残页会加快熬煮；离开本层后可安全查阅。 */
function useScrapPageInBroth() {
  if (!survival || survival.dead) return;
  if (countItem("scrap_page_c1299") < 1) return;
  boil = Math.min(1, boil + 0.08);
  refreshBoilUi();
  showToast("你在汤雾中展开残页——字迹灼进眼睛，熬煮骤然加快！", 3400);
  var texts = [
    "……十连死区共享同一套切出拓扑……",
    "……C-1289 是阀门，吞咽与切出只是不同旋钮……",
    "……黑石不是出口，是另一口锅的锅沿……",
    "……不要相信香味，那是消融的邀请函……",
  ];
  showToast(texts[Math.floor(Math.random() * texts.length)], 5000);
}

/* ------------------------------ 控制 / 主循环 ------------------------------ */

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {},
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
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryInteract();
        return true;
      }
      return false;
    },
    onPointerLockChange: function (locked) {
      if (locked) ensureBubbleAudio();
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1299", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1299", showToast);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8dcc8);
  scene.fog = new THREE.FogExp2(0xe8dcc8, 0.085);
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildBrothWorld();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1299" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {});
  sealLiquidItems();
  window.__backroomsUseScrapPage = useScrapPageInBroth;

  initBackroomsTemperature("c1299", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  refreshBoilUi();
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1299 · 浓汤煮沸 · 生存难度 死区 · " +
      "不受控漂浮 · 寻找黑色浮石撤离 · 不要吸入汤雾";
  }
  bindControls();

  window.setTimeout(function () {
    showToast(
      "⚠️ Level C-1299「浓汤煮沸」死区。诱人香气是致命陷阱。" +
        "灼热汤雾会由内到外熬煮你——尽快抵达悬浮黑石平台撤离。",
      7000
    );
    var failed = damageCarriedTaskItems(luckBreakChance() * 0.7, showToast);
    if (failed.length) {
      showToast("刚坠入汤雾，任务道具就被水汽腐蚀损毁！", 4000);
    }
  }, 600);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (survival && !survival.dead && !transitionLock) {
      elapsed += dt;
      survival.update(dt, { sprinting: false, skipPassiveSanity: true });
      updatePlayerDrift(dt);
      updateDebris(dt);
      updateBoil(dt);
      updateItemHazard();
      updateWhispers();
      updateBubbleAudio(now);
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    // 镜头轻微摇晃（汤雾裹挟感）
    camera.rotation.z += Math.sin(elapsed * 1.3) * (0.02 + boil * 0.04);
    camera.position.y += Math.sin(elapsed * 2.1) * 0.01;
    refreshAim();
    updateInteractUi();
    drawOverlay();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1299]", err);
  showError(err.message || String(err));
}

/**
 * Backrooms Level C-1293 — 故此悬置（死区）
 * 没有地面与天空的三维飓风；玩家无法定向移动，只能被风暴卷动。
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
import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  damageCarriedTaskItems,
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
const FRAGMENT_COUNT = 190;
const TASK_ITEM_BREAK_CHANCE = 0.78;
const BASE_MIND_SECONDS = 150;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 0 },
});
fps.feetY = 8;
fps.grounded = false;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const mindFillEl = document.getElementById("backroomsMindFill");
const mindValueEl = document.getElementById("backroomsMindValue");
const tearCanvas = document.getElementById("backroomsStormTear");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let stormRoot = null;
let fragments = [];
let elapsed = 0;
let mindLoss = 0;
let shapeMode = 0;
let nextShapeAt = 8;
let nextImpactAt = 4;
let nextThoughtAt = 13;
let nextTearAt = 0;
let ambientLight = null;
let audio = null;

const geometries = {
  paper: new THREE.PlaneGeometry(1.4, 0.9, 2, 2),
  stone: new THREE.DodecahedronGeometry(0.72, 0),
  beam: new THREE.BoxGeometry(3.2, 0.34, 0.42),
  slab: new THREE.BoxGeometry(1.8, 1.05, 0.32),
  column: new THREE.CylinderGeometry(0.34, 0.46, 3.4, 8),
};
const materials = {
  paper: new THREE.MeshStandardMaterial({
    color: 0xd0c6a6,
    side: THREE.DoubleSide,
    roughness: 0.92,
  }),
  manuscript: new THREE.MeshStandardMaterial({
    color: 0xb1aa94,
    side: THREE.DoubleSide,
    roughness: 1,
  }),
  stone: new THREE.MeshStandardMaterial({ color: 0x898b87, roughness: 0.96 }),
  metal: new THREE.MeshStandardMaterial({
    color: 0x626b70,
    roughness: 0.48,
    metalness: 0.76,
  }),
  paleStone: new THREE.MeshStandardMaterial({ color: 0xb0ada4, roughness: 0.9 }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1293 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(index, salt) {
  var n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeManuscriptTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#c9bea0";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#544f43";
  ctx.lineWidth = 3;
  for (var i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(18, 18 + i * 15);
    ctx.lineTo(230 - (i % 3) * 28, 18 + i * 15);
    ctx.stroke();
  }
  ctx.fillStyle = "#6e2724";
  ctx.font = "bold 19px serif";
  ctx.fillText("故此悬置", 76, 151);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFragment(index) {
  var typeRoll = seeded(index, 1);
  var geometry;
  var material;
  if (typeRoll < 0.42) {
    geometry = geometries.paper;
    material = index % 4 === 0 ? materials.manuscript : materials.paper;
  } else if (typeRoll < 0.65) {
    geometry = geometries.stone;
    material = materials.stone;
  } else if (typeRoll < 0.82) {
    geometry = geometries.beam;
    material = materials.metal;
  } else if (typeRoll < 0.94) {
    geometry = geometries.slab;
    material = materials.paleStone;
  } else {
    geometry = geometries.column;
    material = materials.paleStone;
  }
  var mesh = new THREE.Mesh(geometry, material);
  var scale = 0.45 + seeded(index, 2) * 1.7;
  mesh.scale.setScalar(scale);
  mesh.userData.fragment = {
    index: index,
    radius: 7 + seeded(index, 3) * 32,
    height: -20 + seeded(index, 4) * 46,
    angle: seeded(index, 5) * Math.PI * 2,
    speed: 0.38 + seeded(index, 6) * 1.55,
    wobble: 0.5 + seeded(index, 7) * 2.8,
    spinX: (seeded(index, 8) - 0.5) * 4.5,
    spinY: (seeded(index, 9) - 0.5) * 4.5,
    spinZ: (seeded(index, 10) - 0.5) * 4.5,
  };
  stormRoot.add(mesh);
  fragments.push(mesh);
}

function buildStorm() {
  stormRoot = new THREE.Group();
  stormRoot.name = "C1293InfiniteHurricane";
  scene.add(stormRoot);
  materials.manuscript.map = makeManuscriptTexture();
  materials.manuscript.needsUpdate = true;
  for (var i = 0; i < FRAGMENT_COUNT; i++) createFragment(i);

  scene.add(new THREE.HemisphereLight(0xcbd0d0, 0x303336, 0.58));
  ambientLight = new THREE.AmbientLight(0xd8dcdb, 0.48);
  scene.add(ambientLight);
  var diffuse = new THREE.DirectionalLight(0xdfe2df, 0.72);
  diffuse.position.set(-8, 16, 11);
  scene.add(diffuse);

  // 灰白微光没有固定来源：三个点光源也随风暴缓慢盘旋。
  for (i = 0; i < 3; i++) {
    var light = new THREE.PointLight(0xe4e6e2, 1.1, 58, 2);
    light.userData.stormAngle = (i / 3) * Math.PI * 2;
    light.userData.stormRadius = 18 + i * 7;
    stormRoot.add(light);
  }
}

function luckWindMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.45;
  if (luck >= 30) return 0.88;
  return 1;
}

function luckMindMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.55;
  if (luck >= 30) return 0.84;
  return 1;
}

function updateFragments(dt) {
  var wind = luckWindMul();
  for (var i = 0; i < fragments.length; i++) {
    var mesh = fragments[i];
    var data = mesh.userData.fragment;
    var t = elapsed * data.speed * wind + data.angle;
    var radius = data.radius;
    var x;
    var y;
    var z;
    if (shapeMode === 0) {
      // 巨型滚筒状螺旋。
      x = Math.cos(t) * radius;
      z = Math.sin(t) * radius;
      y = data.height + Math.sin(t * 1.7 + i) * 5;
    } else if (shapeMode === 1) {
      // 碎片瞬间重组为倾斜的双环，随后再次被撕散。
      var ring = radius * (0.62 + Math.sin(i * 2.1) * 0.12);
      x = Math.cos(t * 1.35) * ring;
      z = Math.sin(t * 1.35) * ring;
      y = Math.sin(t + i * 0.4) * 13 + data.height * 0.25;
    } else {
      // 无规则三维漩涡云。
      x = Math.cos(t + Math.sin(t * 0.4)) * radius;
      z = Math.sin(t * 0.8) * radius;
      y = data.height + Math.cos(t * 1.3 + i) * 9;
    }
    mesh.position.x += (x - mesh.position.x) * Math.min(1, dt * 3.4);
    mesh.position.y += (y - mesh.position.y) * Math.min(1, dt * 3.4);
    mesh.position.z += (z - mesh.position.z) * Math.min(1, dt * 3.4);
    mesh.rotation.x += data.spinX * dt * wind;
    mesh.rotation.y += data.spinY * dt * wind;
    mesh.rotation.z += data.spinZ * dt * wind;
  }
  for (i = 0; i < stormRoot.children.length; i++) {
    var child = stormRoot.children[i];
    if (!child.isLight) continue;
    var a = elapsed * (0.18 + i * 0.03) + child.userData.stormAngle;
    child.position.set(
      Math.cos(a) * child.userData.stormRadius,
      Math.sin(a * 1.7) * 14,
      Math.sin(a) * child.userData.stormRadius
    );
    child.intensity = 0.18 + Math.abs(Math.sin(a * 2.3)) * 1.15;
  }
}

function updatePlayerInStorm(dt) {
  var wind = luckWindMul();
  // 无定向移动：玩家被卷在不规则三维螺旋上，只有视角仍可自由转动。
  var orbit = elapsed * 0.72 * wind;
  var targetRadius = 5.5 + Math.sin(elapsed * 0.33) * 3.2;
  var tx = Math.cos(orbit) * targetRadius + Math.sin(elapsed * 1.8) * 1.8;
  var tz = Math.sin(orbit) * targetRadius + Math.cos(elapsed * 1.35) * 1.6;
  var ty = 7 + Math.sin(elapsed * 0.91) * 5 + Math.sin(elapsed * 2.2) * 1.2;
  fps.player.x += (tx - fps.player.x) * Math.min(1, dt * 1.8 * wind);
  fps.player.z += (tz - fps.player.z) * Math.min(1, dt * 1.8 * wind);
  fps.feetY += (ty - fps.feetY) * Math.min(1, dt * 1.6 * wind);
  fps.velY = 0;
  fps.grounded = false;
}

function triggerImpact() {
  if (!survival || survival.dead) return;
  var wind = luckWindMul();
  var damage = (5 + Math.random() * 9) * Math.min(1.35, wind);
  survival.takeDamage(damage);
  playImpact();
  showToast(
    Math.random() < 0.5
      ? "高速飞行的石碑残片擦过身体，留下深长伤口！"
      : "金属与梁柱碎片从侧面撞来！"
  );
  nextImpactAt = elapsed + (4 + Math.random() * 7) / wind;
}

function updateMind(dt) {
  if (!survival || survival.dead) return;
  mindLoss = Math.min(1, mindLoss + (dt / BASE_MIND_SECONDS) * luckMindMul());
  survival.sanity = Math.max(1, survival.sanity - 0.7 * luckMindMul() * dt);
  // 狂风持续切割身体，不会单次无预兆秒杀。
  survival.takeDamage((0.22 + mindLoss * 0.25) * luckWindMul() * dt);
  if (mindFillEl) mindFillEl.style.width = Math.round((1 - mindLoss) * 100) + "%";
  if (mindValueEl) mindValueEl.textContent = Math.round((1 - mindLoss) * 100) + "%";
  if (mindLoss >= 1) {
    showToast("你的名字、目的与自我全部被狂风撕碎。", 2800);
    survival.triggerDeath("mind_shredded");
  }
}

function updateThoughts() {
  if (!survival || survival.dead || elapsed < nextThoughtAt) return;
  nextThoughtAt = elapsed + Math.max(3.5, 16 - mindLoss * 11) + Math.random() * 6;
  var messages = [
    "一段记忆从脑海中剥离，像纸片一样飞进风暴。",
    "你想不起自己的名字了。",
    "念头刚刚出现，就被狂风扯成互不相干的碎片。",
    "你看见一段往事在远处重组，下一秒又完全粉碎。",
    "四面八方都在旋转，你已经无法分辨任何方向。",
  ];
  showToast(messages[Math.floor(Math.random() * messages.length)]);
}

function updateScreenTear(now) {
  if (!tearCanvas || now < nextTearAt) return;
  nextTearAt = now + Math.max(35, 115 - mindLoss * 75);
  var ctx = tearCanvas.getContext("2d");
  var w = tearCanvas.width;
  var h = tearCanvas.height;
  ctx.clearRect(0, 0, w, h);
  var strips = 5 + Math.floor(mindLoss * 22);
  for (var i = 0; i < strips; i++) {
    var y = Math.random() * h;
    var height = 1 + Math.random() * (2 + mindLoss * 9);
    var offset = (Math.random() - 0.5) * (12 + mindLoss * 60);
    ctx.fillStyle =
      Math.random() < 0.55
        ? "rgba(225,228,225," + (0.08 + mindLoss * 0.22) + ")"
        : "rgba(35,39,42," + (0.08 + mindLoss * 0.24) + ")";
    ctx.fillRect(offset, y, w, height);
  }
  // 竖直碎片块表现认知被切割。
  for (i = 0; i < 3 + mindLoss * 10; i++) {
    ctx.fillStyle = "rgba(190,194,192," + (0.03 + mindLoss * 0.12) + ")";
    ctx.fillRect(
      Math.random() * w,
      Math.random() * h,
      3 + Math.random() * 22,
      4 + Math.random() * 34
    );
  }
}

function startAudio() {
  if (audio) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var length = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    var wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    var band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 520;
    band.Q.value = 0.65;
    var windGain = ctx.createGain();
    windGain.gain.value = 0.15;
    wind.connect(band).connect(windGain).connect(ctx.destination);
    wind.start();
    var howl = ctx.createOscillator();
    howl.type = "sine";
    howl.frequency.value = 82;
    var howlGain = ctx.createGain();
    howlGain.gain.value = 0.027;
    howl.connect(howlGain).connect(ctx.destination);
    howl.start();
    audio = { ctx: ctx, wind: wind, windGain: windGain, howl: howl, howlGain: howlGain };
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
  osc.frequency.setValueAtTime(240, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.48);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.6);
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
    // 飓风中无法跳跃或定向移动；控制器仅保留自由观察。
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
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
  window.addEventListener("click", startAudio, { once: true });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) startAudio();
  });
}

function init() {
  if (!enforceLevelEntry("c1293", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1293", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x74797b);
  scene.fog = new THREE.FogExp2(0x74797b, 0.018);
  camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 120);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildStorm();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1293" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水无法让被撕碎的认知重新拼合。");
    },
  });
  initBackroomsTemperature("c1293", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1293 · 故此悬置 · 生存难度 死区 · 无出口 · " +
      "无法定向移动，只能在飓风中观察";
  }
  bindControls();

  // 入层瞬间，任务设备/包裹有很高概率被风暴撕毁；具体任务按自身失败规则扣分。
  window.setTimeout(function () {
    var failed = damageCarriedTaskItems(TASK_ITEM_BREAK_CHANCE, showToast);
    if (failed.length) {
      showToast("狂风撕毁了携带的任务道具，相关任务已失败！", 4200);
    }
  }, 700);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (survival && !survival.dead) {
      elapsed += dt;
      _updateSurvival(dt);
      updatePlayerInStorm(dt);
      updateFragments(dt);
      updateMind(dt);
      updateThoughts();
      if (elapsed >= nextImpactAt) triggerImpact();
      if (elapsed >= nextShapeAt) {
        shapeMode = (shapeMode + 1) % 3;
        nextShapeAt = elapsed + 7 + Math.random() * 7;
        showToast("漫天残骸突然解构，又在另一处重组成陌生形态。");
      }
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    // 翻滚与碎片化抖动；强度逐渐提高但不破坏玩家自由观察。
    camera.rotation.z +=
      Math.sin(elapsed * 1.7) * (0.04 + mindLoss * 0.11) +
      Math.sin(elapsed * 11) * 0.008;
    camera.position.x += Math.sin(elapsed * 17) * (0.015 + mindLoss * 0.035);
    camera.position.y += Math.cos(elapsed * 13) * (0.012 + mindLoss * 0.03);
    updateScreenTear(now);
    if (ambientLight) {
      ambientLight.intensity = 0.14 + Math.abs(Math.sin(elapsed * 0.7)) * 0.48;
    }
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

function _updateSurvival(dt) {
  survival.update(dt, { sprinting: false, skipPassiveSanity: true });
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1293]", err);
  showError(err.message || String(err));
}

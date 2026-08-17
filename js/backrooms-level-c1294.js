/**
 * Backrooms Level C-1294 — 流萤死地（死区）
 * 巨大空旷的蛹腔：没有地面与天空，漫天漂浮致命的锡厘贡物质（液滴 / 纤维 / 熔融雾）。
 * 玩家被定向物质洪流裹挟，无法定向移动；全部危险来自环境与锡厘贡附着。
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
const DROPLET_COUNT = 120;
const FIBER_COUNT = 70;
const FOG_COUNT = 26;
/** 锡厘贡附着从 0 单靠时间涨满所需的基础秒数（约 3 分钟） */
const BASE_ATTACH_SECONDS = 175;
/** 靠近漂浮物触发的附着加速半径 */
const CONTACT_RADIUS = 2.6;
/** 定向物质洪流的方向（单位向量，XZ 平面） */
const CURRENT_DIR = { x: 0.82, z: 0.57 };

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 0 },
});
fps.feetY = 6;
fps.grounded = false;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const attachFillEl = document.getElementById("backroomsSelygonFill");
const attachValueEl = document.getElementById("backroomsSelygonValue");
const glowCanvas = document.getElementById("backroomsSelygon");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let selygonRoot = null;
let particles = [];
let elapsed = 0;
let attach = 0;
let nextItemCheckAt = 8;
let nextGlareAt = 6;
let nextWhisperAt = 12;
/** 强光致盲：blindUntil 之前视野泛白模糊 */
let blindUntil = 0;
let blindStrength = 0;
let flowLights = [];

const geometries = {
  droplet: new THREE.SphereGeometry(0.16, 8, 8),
  fiber: new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5),
  fog: new THREE.PlaneGeometry(2.6, 2.6),
};

function makeFogTexture() {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(190,244,255,0.85)");
  g.addColorStop(0.5, "rgba(120,210,240,0.3)");
  g.addColorStop(1, "rgba(80,170,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const materials = {
  droplet: new THREE.MeshBasicMaterial({
    color: 0xbdf2ff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fiber: new THREE.MeshBasicMaterial({
    color: 0x9fe6ff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  fog: new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1294 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(index, salt) {
  var n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function createParticle(index, kind) {
  var geometry;
  var material;
  if (kind === "droplet") {
    geometry = geometries.droplet;
    material = materials.droplet;
  } else if (kind === "fiber") {
    geometry = geometries.fiber;
    material = materials.fiber;
  } else {
    geometry = geometries.fog;
    material = materials.fog;
  }
  var mesh = new THREE.Mesh(geometry, material);
  var scale =
    kind === "fog"
      ? 1.4 + seeded(index, 2) * 3.2
      : kind === "fiber"
        ? 0.6 + seeded(index, 2) * 1.9
        : 0.5 + seeded(index, 2) * 2.1;
  mesh.scale.setScalar(scale);
  if (kind === "fog") mesh.userData.billboard = true;
  mesh.userData.p = {
    kind: kind,
    // 分布在玩家四周的一个大区域，沿洪流方向循环
    x: -30 + seeded(index, 3) * 60,
    y: -22 + seeded(index, 4) * 44,
    z: -30 + seeded(index, 5) * 60,
    speed: 2.2 + seeded(index, 6) * 4.4,
    bob: seeded(index, 7) * Math.PI * 2,
    bobSpeed: 0.4 + seeded(index, 8) * 1.4,
    spin: (seeded(index, 9) - 0.5) * 3.4,
  };
  mesh.position.set(mesh.userData.p.x, mesh.userData.p.y, mesh.userData.p.z);
  selygonRoot.add(mesh);
  particles.push(mesh);
}

function buildCocoon() {
  selygonRoot = new THREE.Group();
  selygonRoot.name = "C1294SelygonCloud";
  scene.add(selygonRoot);
  materials.fog.map = makeFogTexture();
  materials.fog.needsUpdate = true;

  var i;
  for (i = 0; i < DROPLET_COUNT; i++) createParticle(i, "droplet");
  for (i = 0; i < FIBER_COUNT; i++) createParticle(1000 + i, "fiber");
  for (i = 0; i < FOG_COUNT; i++) createParticle(2000 + i, "fog");

  scene.add(new THREE.HemisphereLight(0x9fdcf2, 0x0a1822, 0.5));
  scene.add(new THREE.AmbientLight(0x8fd0ea, 0.35));

  // 光线全部来自锡厘贡自身：几盏冷蓝点光随洪流缓慢盘旋、忽明忽暗。
  for (i = 0; i < 4; i++) {
    var light = new THREE.PointLight(0xace9ff, 1.1, 46, 2);
    light.userData.a = (i / 4) * Math.PI * 2;
    light.userData.r = 12 + i * 5;
    selygonRoot.add(light);
    flowLights.push(light);
  }
}

/* ------------------------------ 豆奶联动 ------------------------------ */

function luckAttachMul() {
  // 倒霉：附着加快；幸运：小幅降低，但无法免疫。
  var luck = getLuck();
  if (luck <= -30) return 1.5;
  if (luck >= 30) return 0.82;
  return 1;
}

function luckBreakChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.5;
  if (luck >= 30) return 0.22;
  return 0.33;
}

function luckGlareIntervalMul() {
  // 倒霉时失明触发更频繁（间隔更短）。
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 1.25;
  return 1;
}

/* ------------------------------ 漂浮物运动 ------------------------------ */

function updateParticles(dt) {
  var dirX = CURRENT_DIR.x;
  var dirZ = CURRENT_DIR.z;
  for (var i = 0; i < particles.length; i++) {
    var mesh = particles[i];
    var p = mesh.userData.p;
    // 沿洪流方向持续漂移，越界后从另一侧回流。
    p.x += dirX * p.speed * dt;
    p.z += dirZ * p.speed * dt;
    p.y += Math.sin(elapsed * p.bobSpeed + p.bob) * dt * 1.6;
    var rel = p.x - fps.player.x;
    if (rel > 34) p.x -= 62;
    else if (rel < -34) p.x += 62;
    var relZ = p.z - fps.player.z;
    if (relZ > 34) p.z -= 62;
    else if (relZ < -34) p.z += 62;
    var relY = p.y - fps.feetY;
    if (relY > 26) p.y -= 46;
    else if (relY < -26) p.y += 46;
    mesh.position.set(p.x, p.y, p.z);
    if (p.kind === "fiber") {
      mesh.rotation.z += p.spin * dt;
      mesh.rotation.x += p.spin * 0.6 * dt;
    } else if (mesh.userData.billboard && camera) {
      mesh.quaternion.copy(camera.quaternion);
    }
  }
  for (i = 0; i < flowLights.length; i++) {
    var light = flowLights[i];
    var a = elapsed * (0.22 + i * 0.04) + light.userData.a;
    light.position.set(
      fps.player.x + Math.cos(a) * light.userData.r,
      fps.feetY + Math.sin(a * 1.6) * 10,
      fps.player.z + Math.sin(a) * light.userData.r
    );
    light.intensity = 0.35 + Math.abs(Math.sin(a * 2.1)) * 1.25;
  }
}

/** 玩家被洪流裹挟：不受控地定向漂移 + 细丝抽打的抖动，仅保留自由观察。 */
function updatePlayerDrift(dt) {
  var mul = luckAttachMul();
  fps.player.x += CURRENT_DIR.x * (1.6 + Math.sin(elapsed * 0.7) * 0.6) * dt * mul;
  fps.player.z += CURRENT_DIR.z * (1.6 + Math.sin(elapsed * 0.7) * 0.6) * dt * mul;
  fps.player.x += Math.sin(elapsed * 2.3) * dt * 0.9;
  fps.player.z += Math.cos(elapsed * 1.9) * dt * 0.9;
  fps.feetY += Math.sin(elapsed * 0.85) * dt * 1.1;
  fps.velY = 0;
  fps.grounded = false;
}

/** 数出玩家附近的漂浮锡厘贡数量，用于加速附着。 */
function countNearbyContacts() {
  var n = 0;
  for (var i = 0; i < particles.length; i++) {
    var pos = particles[i].position;
    var dx = pos.x - fps.player.x;
    var dy = pos.y - fps.feetY;
    var dz = pos.z - fps.player.z;
    if (dx * dx + dy * dy + dz * dz <= CONTACT_RADIUS * CONTACT_RADIUS) {
      n++;
      if (n >= 6) break;
    }
  }
  return n;
}

/* ------------------------------ 附着 / 窒息 ------------------------------ */

function updateAttach(dt) {
  if (!survival || survival.dead) return;
  var mul = luckAttachMul();
  var contacts = countNearbyContacts();
  // 基础随时间上涨；接触漂浮物大幅加速。
  var rate = (1 / BASE_ATTACH_SECONDS) * mul * (1 + contacts * 0.9);
  attach = Math.min(1, attach + rate * dt);

  // 无空气 + 强碱：持续缺氧腐蚀；附着越高窒息越快。
  survival.takeDamage((0.35 + attach * attach * 3.4) * dt);
  survival.sanity = Math.max(1, survival.sanity - (0.2 + attach * 0.5) * dt);

  if (attachFillEl) attachFillEl.style.width = Math.round(attach * 100) + "%";
  if (attachValueEl) attachValueEl.textContent = Math.round(attach * 100) + "%";

  if (contacts >= 3 && Math.random() < dt * 0.8) {
    showToast("发光细丝缠上身体，正在快速固化……");
  }

  if (attach >= 1) {
    showToast("锡厘贡彻底包裹口鼻——你窒息了。", 2800);
    survival.triggerDeath("selygon_encased");
  }
}

/** 高附着阶段：任务道具（采样罐 / 记录仪）碰到锡厘贡会被粘住损毁。 */
function updateItemHazard() {
  if (!survival || survival.dead || elapsed < nextItemCheckAt) return;
  nextItemCheckAt = elapsed + 6 + Math.random() * 6;
  if (attach < 0.35) return;
  var chance = luckBreakChance() * (0.4 + attach * 0.9);
  var failed = damageCarriedTaskItems(Math.min(0.95, chance), showToast);
  if (failed.length) {
    showToast("任务道具被锡厘贡粘住损毁，相关任务失败！", 4200);
  }
}

/* ------------------------------ 强光致盲 ------------------------------ */

function triggerGlare() {
  if (!survival || survival.dead || elapsed < nextGlareAt) return;
  nextGlareAt = elapsed + (5 + Math.random() * 8) * luckGlareIntervalMul();
  blindStrength = 0.55 + Math.random() * 0.4 + attach * 0.2;
  blindUntil = performance.now() + 700 + Math.random() * 1400 + attach * 1200;
  showToast(
    Math.random() < 0.5
      ? "锡厘贡的辉光骤然爆亮，视野被灼成一片惨白！"
      : "刺目的青白强光扫过——你短暂失明了。"
  );
}

function updateWhispers() {
  if (!survival || survival.dead || elapsed < nextWhisperAt) return;
  nextWhisperAt = elapsed + 10 + Math.random() * 8;
  var msgs = [
    "四周静得可怕，连自己的呼吸都被吸走。",
    "漫天流萤般的光丝朝同一个方向缓缓漂去。",
    "熔融的雾状物贴着脸颊掠过，带来刺鼻的碱味。",
    "你想稳住身体，却被无形的洪流一点点推着走。",
  ];
  showToast(msgs[Math.floor(Math.random() * msgs.length)]);
}

/* ------------------------------ 屏幕特效 ------------------------------ */

function drawOverlay(now) {
  if (!glowCanvas) return;
  var ctx = glowCanvas.getContext("2d");
  var w = glowCanvas.width;
  var h = glowCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // 蓝色糊边：随附着进度加厚。
  if (attach > 0.02) {
    var edge = 0.12 + attach * 0.5;
    var grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      h * (0.24 - attach * 0.12),
      w * 0.5,
      h * 0.5,
      h * 0.72
    );
    grad.addColorStop(0, "rgba(150,225,255,0)");
    grad.addColorStop(1, "rgba(70,170,220," + edge + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // 高附着阶段：屏幕大量蓝色粘液斑块遮挡视野。
  if (attach > 0.45) {
    var blobs = Math.floor((attach - 0.45) * 46);
    for (var i = 0; i < blobs; i++) {
      var bx = seeded(i, 11) * w;
      var by = seeded(i, 12) * h;
      var br = 6 + seeded(i, 13) * (14 + attach * 26);
      ctx.fillStyle = "rgba(120,205,240," + (0.12 + attach * 0.3) + ")";
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 强光致盲：大面积泛白蓝 + 随机模糊亮斑。
  if (now < blindUntil) {
    var remain = (blindUntil - now) / 1600;
    var a = Math.min(0.92, blindStrength * Math.min(1, remain + 0.25));
    ctx.fillStyle = "rgba(226,246,255," + a + ")";
    ctx.fillRect(0, 0, w, h);
    for (var j = 0; j < 10; j++) {
      ctx.fillStyle = "rgba(255,255,255," + (0.1 + Math.random() * 0.25) + ")";
      ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 8 + Math.random() * 40);
    }
  }
}

/* ------------------------------ 控制 ------------------------------ */

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
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1294", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1294", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081a24);
  scene.fog = new THREE.FogExp2(0x0d2a38, 0.03);
  camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.08, 130);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildCocoon();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1294" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水暂时压住了灼痛，却洗不掉粘连的锡厘贡。");
    },
  });
  initBackroomsTemperature("c1294", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1294 · 流萤死地 · 生存难度 死区 · 无出口 · " +
      "被洪流裹挟无法定向移动 · 留意锡厘贡附着进度";
  }
  bindControls();

  // 入层瞬间：随身任务道具可能立刻被漂浮的锡厘贡粘住损毁。
  window.setTimeout(function () {
    var failed = damageCarriedTaskItems(luckBreakChance(), showToast);
    if (failed.length) {
      showToast("刚落入蛹腔，锡厘贡就缠上了任务道具，相关任务失败！", 4200);
    }
  }, 800);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (survival && !survival.dead) {
      elapsed += dt;
      survival.update(dt, { sprinting: false, skipPassiveSanity: true });
      updatePlayerDrift(dt);
      updateParticles(dt);
      updateAttach(dt);
      updateItemHazard();
      triggerGlare();
      updateWhispers();
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    // 被细丝抽打的持续抖动；附着越高越剧烈。
    camera.rotation.z += Math.sin(elapsed * 2.1) * (0.02 + attach * 0.06);
    camera.position.x += Math.sin(elapsed * 15) * (0.01 + attach * 0.03);
    camera.position.y += Math.cos(elapsed * 12) * (0.008 + attach * 0.025);
    drawOverlay(now);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1294]", err);
  showError(err.message || String(err));
}

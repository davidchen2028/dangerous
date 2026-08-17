/**
 * Backrooms Level C-1290 — 夕前石茧。
 * 永恒黄昏的石灰岩丘陵：大理石人像、扭曲碑林、坍塌的哥特教堂、渗出的黑色腐蚀液。
 * 无实体怪物；致命来源是「石化效应」与腐蚀黑液。
 *
 * 本文件只负责环境 / 视觉 / 听觉 / 石化现象；不含入口、出口、基地。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
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
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  setPetrify,
  ensurePetrifyOverlay as ensureSharedPetrifyOverlay,
  updatePetrifyOverlay as updateSharedPetrifyOverlay,
} from "./backrooms-petrify.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
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
const AREA_HALF = 60;
/** 教堂影响半径：越靠近中央，石化与精神麻木越强 */
const CHURCH_RADIUS = 30;
/** 边缘处石化到 100% 约需的秒数（基础速率）：约 2 分钟 */
const PETRIFY_BASE_SECONDS = 120;
/** 教堂中心额外叠加的石化速率（1/秒）：中心合计约 0.5 分钟满 */
const PETRIFY_NEAR_RATE = 1 / 40;
/** 腐蚀黑液每秒伤害 */
const BLACK_LIQUID_DPS = 4;
/** 精神麻木的理智下限（麻木但本身不致死，真正的死因是石化） */
const SANITY_FLOOR = 18;

/** 希腊拱门 → Level 11（石化状态延续） */
const ARCH_X = -34;
const ARCH_Z = 18;
const ARCH_USE_DIST = 2.6;

const colliders = [];
const blackPools = [];
const glyphMaterials = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: AREA_HALF - 8, radius: 0.34, speed: 3.6 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null, floorY: 0 };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let petrify = 0;
let audio = null;
let transitionLock = false;
let nearArch = false;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1290 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(n) {
  var x = Math.sin(n * 53.17 + 19.71) * 51237.331;
  return x - Math.floor(x);
}

/* -------------------------- 建材与共享几何 -------------------------- */

const MARBLE = new THREE.MeshStandardMaterial({ color: 0xd6d1c6, roughness: 0.82, metalness: 0.04 });
const MARBLE_DARK = new THREE.MeshStandardMaterial({ color: 0xb7b0a1, roughness: 0.9 });
const CRACK = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 1 });
const STONE = new THREE.MeshStandardMaterial({ color: 0x8f8676, roughness: 0.96 });
const STONE_DARK = new THREE.MeshStandardMaterial({ color: 0x6f6759, roughness: 0.98 });
const BLACK_LIQUID = new THREE.MeshStandardMaterial({
  color: 0x0a0906,
  roughness: 0.18,
  metalness: 0.35,
  transparent: true,
  opacity: 0.94,
});

const _boxGeo = new THREE.BoxGeometry(1, 1, 1);
const _sphereGeo = new THREE.SphereGeometry(0.5, 10, 8);
const _cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

function box(root, w, h, d, x, y, z, mat, collide) {
  var m = new THREE.Mesh(_boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  root.add(m);
  if (collide) colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  return m;
}

function makeGlyphTexture(seed) {
  var c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 256);
  ctx.strokeStyle = "#2a241a";
  ctx.lineWidth = 3;
  var rows = 7;
  var r;
  for (r = 0; r < rows; r++) {
    var y = 26 + r * 30;
    var glyphs = 2 + Math.floor(seeded(seed + r * 2.3) * 3);
    var g;
    for (g = 0; g < glyphs; g++) {
      var x = 20 + g * 34 + seeded(seed + r + g) * 8;
      ctx.beginPath();
      var strokes = 2 + Math.floor(seeded(seed + r * 3 + g) * 3);
      var s;
      var px = x;
      var py = y;
      ctx.moveTo(px, py);
      for (s = 0; s < strokes; s++) {
        px += (seeded(seed + r + g + s * 1.7) - 0.5) * 22;
        py += (seeded(seed + r + g + s * 2.9) - 0.5) * 20;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------- 人形雕塑 -------------------------- */

function addStatue(root, x, z, seed) {
  var pose = Math.floor(seeded(seed) * 3); // 0 站立 1 跪坐 2 倒地
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = seeded(seed + 1) * Math.PI * 2;
  var scale = 0.85 + seeded(seed + 2) * 0.4;
  var mat = seeded(seed + 3) > 0.5 ? MARBLE : MARBLE_DARK;

  // 躯干
  box(g, 0.5, 1.0, 0.32, 0, 1.15, 0, mat, false);
  // 头（风化磨损：略缩小、无五官）
  var head = new THREE.Mesh(_sphereGeo, mat);
  head.scale.set(0.42, 0.5, 0.42);
  head.position.set(0, 1.85, 0);
  g.add(head);
  // 腿
  box(g, 0.2, 1.0, 0.22, -0.14, 0.5, 0, mat, false);
  box(g, 0.2, 1.0, 0.22, 0.14, 0.5, 0, mat, false);
  // 手臂（部分崩缺：随机缺一只）
  if (seeded(seed + 4) > 0.25) box(g, 0.16, 0.85, 0.16, -0.36, 1.2, 0, mat, false);
  if (seeded(seed + 5) > 0.25) box(g, 0.16, 0.85, 0.16, 0.36, 1.2, 0, mat, false);
  // 裂缝
  var cracks = Math.floor(seeded(seed + 6) * 3);
  var i;
  for (i = 0; i < cracks; i++) {
    var cr = new THREE.Mesh(_boxGeo, CRACK);
    cr.scale.set(0.03, 0.3 + seeded(seed + i) * 0.4, 0.02);
    cr.position.set((seeded(seed + i * 2) - 0.5) * 0.4, 1 + seeded(seed + i) * 0.8, 0.17);
    cr.rotation.z = (seeded(seed + i * 3) - 0.5) * 1.2;
    g.add(cr);
  }

  if (pose === 1) {
    // 跪坐：整体下沉并前倾
    g.position.y = -0.35;
    g.rotation.x = 0.18;
    g.scale.setScalar(scale * 0.92);
  } else if (pose === 2) {
    // 倒地：侧翻躺在斜坡上，半埋进土石
    g.rotation.z = Math.PI * 0.5;
    g.position.y = 0.28;
    g.scale.setScalar(scale);
  } else {
    g.scale.setScalar(scale);
    // 站立雕塑给一个碰撞体
    colliders.push(wallCollider(x - 0.35, x + 0.35, z - 0.35, z + 0.35));
  }
  root.add(g);
}

/* -------------------------- 碑林 -------------------------- */

function addStele(root, x, z, seed) {
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = seeded(seed) * Math.PI * 2;
  var h = 1.6 + seeded(seed + 1) * 1.2;
  box(g, 0.7, h, 0.16, 0, h * 0.5, 0, STONE, false);
  // 扭曲文字（随时间缓慢磨损淡化）
  var glyphMat = new THREE.MeshStandardMaterial({
    map: makeGlyphTexture(seed * 7 + 3),
    transparent: true,
    opacity: 0.85,
    roughness: 1,
  });
  glyphMaterials.push(glyphMat);
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(0.56, h - 0.3), glyphMat);
  plane.position.set(0, h * 0.5, 0.09);
  g.add(plane);
  root.add(g);
  colliders.push(wallCollider(x - 0.35, x + 0.35, z - 0.12, z + 0.12));
}

/* -------------------------- 黑色腐蚀液 -------------------------- */

function addBlackPool(root, x, z, r) {
  var pool = new THREE.Mesh(new THREE.CircleGeometry(r, 20), BLACK_LIQUID);
  pool.rotation.x = -Math.PI * 0.5;
  pool.position.set(x, 0.04, z);
  root.add(pool);
  // 腐蚀污渍环
  var stain = new THREE.Mesh(
    new THREE.RingGeometry(r, r + 0.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x1c160f, roughness: 1, transparent: true, opacity: 0.7 })
  );
  stain.rotation.x = -Math.PI * 0.5;
  stain.position.set(x, 0.03, z);
  root.add(stain);
  blackPools.push({ x: x, z: z, r: r });
}

/** 从石壁往下淌的黑液痕迹（纯视觉） */
function addDripStreak(root, x, y, z, h) {
  var streak = new THREE.Mesh(_boxGeo, BLACK_LIQUID);
  streak.scale.set(0.06, h, 0.02);
  streak.position.set(x, y - h * 0.5, z);
  root.add(streak);
}

/* -------------------------- 坍塌哥特教堂 -------------------------- */

function buildChurch(root) {
  // 残破外墙（部分坍塌，留出缺口）
  box(root, 0.6, 7, 14, -6, 3.5, 0, STONE, true);
  box(root, 0.6, 4.2, 14, 6, 2.1, 0, STONE_DARK, true); // 右墙半塌
  box(root, 12, 6, 0.6, 0, 3, -7, STONE, true);
  box(root, 5.2, 3.4, 0.6, -3.4, 1.7, 7, STONE_DARK, true); // 前墙残段
  // 断柱
  var i;
  for (i = 0; i < 5; i++) {
    var cx = -4 + i * 2;
    var ch = 2 + seeded(i * 3.1) * 3.5;
    var col = new THREE.Mesh(_cylGeo, STONE);
    col.scale.set(0.5, ch, 0.5);
    col.position.set(cx, ch * 0.5, 2 + (i % 2) * 1.5);
    col.rotation.z = (seeded(i) - 0.5) * 0.12;
    root.add(col);
  }
  // 坍塌大半的穹顶（半球残片）
  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 16, 10, 0, Math.PI * 1.2, 0, Math.PI * 0.5),
    STONE
  );
  dome.position.set(0, 6, -1);
  dome.rotation.z = 0.5;
  root.add(dome);
  // 破碎花窗框架
  var frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.16, 8, 20),
    STONE_DARK
  );
  frame.position.set(-6, 4.4, 0);
  frame.rotation.y = Math.PI * 0.5;
  root.add(frame);
  // 散落瓦砾
  for (i = 0; i < 16; i++) {
    var rub = new THREE.Mesh(_boxGeo, seeded(i) > 0.5 ? STONE : STONE_DARK);
    var rs = 0.4 + seeded(i * 2.2) * 0.9;
    rub.scale.set(rs, rs * 0.6, rs);
    rub.position.set((seeded(i * 1.3) - 0.5) * 12, rs * 0.3, (seeded(i * 3.7) - 0.5) * 12);
    rub.rotation.y = seeded(i) * Math.PI;
    root.add(rub);
  }
  // 教堂内外渗出的黑液
  addBlackPool(root, 0, -1, 3.2);
  addBlackPool(root, -4.5, 3, 1.4);
  addDripStreak(root, -5.7, 5.6, 0, 4.2);
  addDripStreak(root, 5.7, 3.4, 2, 2.6);
}

/* -------------------------- 希腊拱门（通往 L11） -------------------------- */

function buildGreekArch(root) {
  var marble = new THREE.MeshStandardMaterial({ color: 0xe6e1d4, roughness: 0.7, metalness: 0.04 });
  var g = new THREE.Group();
  g.position.set(ARCH_X, 0, ARCH_Z);
  g.rotation.y = Math.PI * 0.5;
  // 两根多立克式立柱（带凹槽感的分段柱身 + 柱头 + 柱础）
  var side;
  for (side = -1; side <= 1; side += 2) {
    var base = new THREE.Mesh(_boxGeo, marble);
    base.scale.set(1.1, 0.4, 1.1);
    base.position.set(side * 1.9, 0.2, 0);
    g.add(base);
    var shaft = new THREE.Mesh(_cylGeo, marble);
    shaft.scale.set(0.42, 4.2, 0.42);
    shaft.position.set(side * 1.9, 2.5, 0);
    g.add(shaft);
    var cap = new THREE.Mesh(_boxGeo, marble);
    cap.scale.set(1.0, 0.34, 1.0);
    cap.position.set(side * 1.9, 4.75, 0);
    g.add(cap);
    colliders.push(wallCollider(ARCH_X - 0.5, ARCH_X + 0.5, ARCH_Z + side * 1.9 - 0.5, ARCH_Z + side * 1.9 + 0.5));
  }
  // 三角楣（山花）+ 楣梁
  var lintel = new THREE.Mesh(_boxGeo, marble);
  lintel.scale.set(1.0, 0.55, 5.4);
  lintel.position.set(0, 5.2, 0);
  g.add(lintel);
  var pedimentGeo = new THREE.CylinderGeometry(1.7, 1.7, 1.0, 3);
  var pediment = new THREE.Mesh(pedimentGeo, marble);
  pediment.scale.set(1, 1, 2.7 / 1.7);
  pediment.rotation.z = Math.PI * 0.5;
  pediment.rotation.y = Math.PI * 0.5;
  pediment.position.set(0, 5.9, 0);
  g.add(pediment);
  // 拱门内发光的门帘，暗示可穿过
  var portal = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 4.4),
    new THREE.MeshBasicMaterial({
      color: 0xe7d9b0,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  portal.position.set(0, 2.5, 0);
  g.add(portal);
  root.add(g);

  var glow = new THREE.PointLight(0xf0e0b0, 0.8, 14, 2);
  glow.position.set(ARCH_X, 3.2, ARCH_Z);
  root.add(glow);
}

function isNearArch() {
  return Math.hypot(fps.player.x - ARCH_X, fps.player.z - ARCH_Z) <= ARCH_USE_DIST;
}

function updateArchUi() {
  if (transitionLock) return;
  var near = isNearArch();
  if (near === nearArch) return;
  nearArch = near;
  if (crosshairEl) crosshairEl.classList.toggle("backrooms-crosshair--interact", near);
  if (interactHintEl) {
    if (near) {
      interactHintEl.textContent = "按 Q 穿过希腊拱门（前往 Level 11）";
      interactHintEl.hidden = false;
    } else {
      interactHintEl.hidden = true;
    }
  }
}

function exitThroughArchToL11() {
  if (transitionLock) return;
  transitionLock = true;
  // 石化状态延续到 Level 11。
  setPetrify(petrify);
  showToast("你穿过希腊拱门——但石化仍在身上蔓延…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l11", fps.yaw);
  queueEnterLevelNumber(11);
  window.setTimeout(function () {
    window.location.href = "backrooms-level11.html";
  }, 700);
}

/* -------------------------- 巨大落日 -------------------------- */

/** 落日位置：与黄昏主光同方向、贴近地平线，距离控制在相机远裁剪面内 */
const SUN_POS = { x: -144, y: 20, z: -94 };

function makeSunDiscTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 246, 219, 1)");
  g.addColorStop(0.4, "rgba(255, 199, 110, 1)");
  g.addColorStop(0.68, "rgba(233, 128, 46, 0.95)");
  g.addColorStop(0.86, "rgba(158, 66, 21, 0.42)");
  g.addColorStop(1, "rgba(96, 38, 12, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunGlowTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 176, 82, 0.55)");
  g.addColorStop(0.35, "rgba(214, 116, 44, 0.3)");
  g.addColorStop(0.7, "rgba(140, 62, 22, 0.12)");
  g.addColorStop(1, "rgba(80, 34, 12, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 用 Sprite 实现：自动朝向相机，且不受雾影响 */
function addSunLayer(root, map, size, opacity, additive, order) {
  var sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: map,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
  );
  sprite.position.set(SUN_POS.x, SUN_POS.y, SUN_POS.z);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = order;
  root.add(sprite);
  return sprite;
}

function addGiantSun(root) {
  var glowTex = makeSunGlowTexture();
  // 外层大气霞光 → 内层光晕 → 日面本体
  addSunLayer(root, glowTex, 340, 0.5, true, -3);
  addSunLayer(root, glowTex, 190, 0.62, true, -2);
  addSunLayer(root, makeSunDiscTexture(), 96, 1, false, -1);
}

/* -------------------------- 世界构建 -------------------------- */

function buildWorld(root) {
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(AREA_HALF * 2, AREA_HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x6a5f4c, roughness: 1 })
  );
  ground.rotation.x = -Math.PI * 0.5;
  root.add(ground);

  // 起伏丘陵：低矮扁平的石灰岩土丘（装饰，不阻挡）
  var moundMat = new THREE.MeshStandardMaterial({ color: 0x7c7159, roughness: 1 });
  var i;
  for (i = 0; i < 22; i++) {
    var mound = new THREE.Mesh(_sphereGeo, moundMat);
    var mr = 6 + seeded(i * 2.1) * 12;
    mound.scale.set(mr, 1.6 + seeded(i * 4.3) * 2.4, mr);
    mound.position.set((seeded(i * 1.7) - 0.5) * AREA_HALF * 1.8, -0.6, (seeded(i * 3.3 + 5) - 0.5) * AREA_HALF * 1.8);
    root.add(mound);
  }

  // 散落岩屑
  var chipMat = new THREE.MeshStandardMaterial({ color: 0x847a64, roughness: 1 });
  for (i = 0; i < 60; i++) {
    var chip = new THREE.Mesh(_boxGeo, chipMat);
    var cs = 0.2 + seeded(i * 5.1) * 0.5;
    chip.scale.set(cs, cs * 0.4, cs);
    chip.position.set((seeded(i * 2.9) - 0.5) * AREA_HALF * 1.9, cs * 0.2, (seeded(i * 6.7 + 3) - 0.5) * AREA_HALF * 1.9);
    chip.rotation.y = seeded(i) * Math.PI;
    root.add(chip);
  }

  // 大量人形雕塑（避开正中央教堂占地）
  var placed = 0;
  for (i = 0; placed < 46 && i < 200; i++) {
    var sx = (seeded(i * 1.31) - 0.5) * AREA_HALF * 1.86;
    var sz = (seeded(i * 2.77 + 9) - 0.5) * AREA_HALF * 1.86;
    if (Math.hypot(sx, sz) < 10) continue; // 让出教堂遗址
    if (Math.hypot(sx - fps.player.x, sz - fps.player.z) < 3) continue;
    addStatue(root, sx, sz, i * 3.7 + 1.1);
    placed++;
  }

  // 成片碑林
  var s;
  for (s = 0; s < 5; s++) {
    var gx = (seeded(s * 4.2) - 0.5) * AREA_HALF * 1.4;
    var gz = (seeded(s * 6.6 + 2) - 0.5) * AREA_HALF * 1.4;
    if (Math.hypot(gx, gz) < 14) continue;
    var k;
    for (k = 0; k < 6; k++) {
      addStele(root, gx + (k % 3) * 1.6 - 1.6, gz + Math.floor(k / 3) * 1.8, s * 10 + k + 1);
    }
  }

  // 洼地积液
  addBlackPool(root, 18, -16, 2.4);
  addBlackPool(root, -22, 12, 2.0);
  addBlackPool(root, 8, 26, 1.8);

  buildChurch(root);
  buildGreekArch(root);

  // 边界空气墙
  colliders.push(wallCollider(-AREA_HALF - 3, -AREA_HALF, -AREA_HALF - 3, AREA_HALF + 3));
  colliders.push(wallCollider(AREA_HALF, AREA_HALF + 3, -AREA_HALF - 3, AREA_HALF + 3));
  colliders.push(wallCollider(-AREA_HALF - 3, AREA_HALF + 3, -AREA_HALF - 3, -AREA_HALF));
  colliders.push(wallCollider(-AREA_HALF - 3, AREA_HALF + 3, AREA_HALF, AREA_HALF + 3));

  addGiantSun(root);

  // 永恒黄昏光照：低角度暗橘色主光 + 冷暗补光
  var dusk = new THREE.DirectionalLight(0xd07a34, 1.15);
  dusk.position.set(-46, 12, -30); // 低角度 → 长阴影观感
  root.add(dusk);
  root.add(new THREE.HemisphereLight(0x6b5236, 0x241d17, 0.5));
  root.add(new THREE.AmbientLight(0x3a2c1e, 0.5));
  var churchGlow = new THREE.PointLight(0x7a3d1a, 0.7, 40, 2);
  churchGlow.position.set(0, 4, 0);
  root.add(churchGlow);
}

/* -------------------------- 石化覆盖层 -------------------------- */

function ensurePetrifyOverlay() {
  return ensureSharedPetrifyOverlay();
}

/* -------------------------- 环境音（程序化） -------------------------- */

function startAmbientAudio() {
  if (audio) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    // 风声：白噪声过低通 + 缓慢起伏
    var bufSize = 2 * ctx.sampleRate;
    var buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var i;
    for (i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    var wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    var windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    wind.connect(lp).connect(windGain).connect(ctx.destination);
    wind.start();
    // 缓慢起伏的风势
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(windGain.gain);
    lfo.start();

    audio = { ctx: ctx, dripTimer: null };
    scheduleDrip();
  } catch (err) {
    audio = null;
  }
}

function scheduleDrip() {
  if (!audio || !audio.ctx) return;
  var delay = 900 + Math.random() * 3600;
  audio.dripTimer = window.setTimeout(function () {
    playDrip();
    scheduleDrip();
  }, delay);
}

function playDrip() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(820 + Math.random() * 260, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

/* -------------------------- 石化 / 腐蚀更新 -------------------------- */

function churchInfluence() {
  var d = Math.hypot(fps.player.x, fps.player.z);
  return Math.max(0, Math.min(1, (CHURCH_RADIUS - d) / CHURCH_RADIUS));
}

function inBlackLiquid() {
  var i;
  for (i = 0; i < blackPools.length; i++) {
    var p = blackPools[i];
    if (Math.hypot(fps.player.x - p.x, fps.player.z - p.z) <= p.r) return true;
  }
  return false;
}

function updatePetrify(dt) {
  if (!survival || survival.dead || transitionLock) return;
  var infl = churchInfluence();
  var rate = 1 / PETRIFY_BASE_SECONDS + PETRIFY_NEAR_RATE * infl;
  var before = petrify;
  petrify = Math.min(1, petrify + rate * dt);

  // 精神麻木：理智缓慢下滑到下限（麻木但不作为死因）
  if (survival.sanity > SANITY_FLOOR) {
    survival.sanity = Math.max(SANITY_FLOOR, survival.sanity - (0.6 + 2.2 * infl) * dt);
  }

  // 腐蚀黑液灼伤
  if (inBlackLiquid()) survival.takeDamage(BLACK_LIQUID_DPS * dt);

  updateSharedPetrifyOverlay(petrify);

  // 阶段提示
  if (before < 0.25 && petrify >= 0.25) {
    showToast("一种宁静的倦怠涌上来……你不太想再挣扎了。");
  } else if (before < 0.55 && petrify >= 0.55) {
    showToast("皮肤下透出大理石般的纹理，正从手脚向躯干蔓延。");
  } else if (before < 0.8 && petrify >= 0.8) {
    showToast("身体越来越沉重，几乎抬不动脚。");
  }

  if (petrify >= 1) {
    survival.triggerDeath("petrify");
  }
}

function petrifySpeedMul() {
  // 石化越深越难移动
  return Math.max(0.15, 1 - petrify * 0.85);
}

/* -------------------------- 控制 / 主循环 -------------------------- */

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
      tryBackroomsJump(fps, 6);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        if (isNearArch()) exitThroughArchToL11();
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
  // 首次交互（指针锁定/点击）后开启环境音，规避自动播放限制
  window.addEventListener("click", startAmbientAudio, { once: true });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) startAmbientAudio();
  });
}

function init() {
  if (!enforceLevelEntry("c1290", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1290", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2e1d10);
  scene.fog = new THREE.Fog(0x35220f, 12, 78);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 220);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC1290";
  scene.add(root);
  buildWorld(root);
  ensurePetrifyOverlay();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1290" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("c1290", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1290 · 夕前石茧 · 别在此处久留 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
  }
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen() && !transitionLock) {
      var base = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      var mul = base * petrifySpeedMul();
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 10);
      });
    }
    updatePetrify(dt);
    updateArchUi();

    // 碑文随时间缓慢磨损淡化
    if (glyphMaterials.length) {
      var i;
      for (i = 0; i < glyphMaterials.length; i++) {
        var m = glyphMaterials[i];
        if (m.opacity > 0.16) m.opacity = Math.max(0.16, m.opacity - dt * 0.004);
      }
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1290]", err);
  showError(err.message || String(err));
}

/**
 * Backrooms Level C-1298 — 人景（死区）
 * 无限郊外田园：黄昏、草地、树林、朦胧山丘。景物轮廓隐隐透出人形——
 * 花草树木皆是被同化的流浪者。非欧几里得：盯着树再回头会移位，往前走会绕回原地。
 * 唯一致死机制：景观同化（精神）。物理不受伤。石凳撤离 → Level 4。
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
/** 同化从 0→1 基础秒数（在出生点附近） */
const ASSIMILATE_SECONDS = 180;
/** 距出生点超过此距离时同化加速明显 */
const FAR_DIST = 28;
const WRAP_DIST = 52;
const SPAWN = { x: 0, z: 0 };

const MEG_RECORD =
  "外勤记录 C-1298-04\n\n" +
  "这里美得令人放松，这正是最大的陷阱。很多外勤被风景吸引，越走越远，再也没有回来。" +
  "远处那些看着像树木的轮廓，那不是树。不要驻足欣赏，完成任务立刻撤离。";

const colliders = [];
/** @type {{ group: THREE.Group, x: number, z: number, stared: number, humanoid: boolean }[]} */
const trees = [];
/** @type {{ mesh: THREE.Object3D, kind: string, x: number, z: number, taken?: boolean }[]} */
const interactables = [];

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.5 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 40 };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const assimFillEl = document.getElementById("backroomsAssimilateFill");
const assimValueEl = document.getElementById("backroomsAssimilateValue");
const fxCanvas = document.getElementById("backroomsScenicFx");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let transitionLock = false;
let elapsed = 0;
/** 景观同化 0..1 */
let assim = 0;
let stage30 = false;
let stage60 = false;
let nextWhisperAt = 14;
let nextHallucAt = 10;
let hallUntil = 0;
let nextItemCheckAt = 12;
let nextWrapToastAt = 0;
let readNote = false;
let aimKind = "";
let lookDir = new THREE.Vector3();

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x6a7a3e, roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x7a6a48, roughness: 1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 }),
  canopy: new THREE.MeshStandardMaterial({ color: 0x4a6234, roughness: 0.92 }),
  bush: new THREE.MeshStandardMaterial({ color: 0x556838, roughness: 0.95 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.9 }),
  hill: new THREE.MeshStandardMaterial({ color: 0x5e6a40, roughness: 1 }),
  humanoid: new THREE.MeshStandardMaterial({
    color: 0x6a6048,
    roughness: 0.88,
    transparent: true,
    opacity: 0.55,
  }),
  bench: new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.85 }),
  note: new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1298 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(i, s) {
  var n = Math.sin(i * 113.7 + s * 271.3) * 43758.5453;
  return n - Math.floor(n);
}

function distFromSpawn(x, z) {
  var dx = x - SPAWN.x;
  var dz = z - SPAWN.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function addTree(root, x, z, scale, humanoid) {
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  var trunkH = 2.2 * scale;
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, trunkH, 6),
    materials.trunk
  );
  trunk.position.y = trunkH * 0.5;
  g.add(trunk);
  var canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.1 * scale, 7, 6),
    materials.canopy
  );
  canopy.position.y = trunkH + 0.5 * scale;
  canopy.scale.y = 0.75;
  g.add(canopy);
  if (humanoid) {
    // 树干旁隐隐透出人形轮廓
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * scale, 0.22 * scale, 1.4 * scale, 5),
      materials.humanoid
    );
    body.position.set(0.35 * scale, 0.9 * scale, 0.1);
    g.add(body);
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22 * scale, 6, 5),
      materials.humanoid
    );
    head.position.set(0.35 * scale, 1.75 * scale, 0.1);
    g.add(head);
  }
  root.add(g);
  trees.push({ group: g, x: x, z: z, stared: 0, humanoid: !!humanoid });
  return g;
}

function addBush(root, x, z, s) {
  var mesh = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), materials.bush);
  mesh.position.set(x, s * 0.55, z);
  mesh.scale.y = 0.7;
  root.add(mesh);
}

function addRock(root, x, z, s, humanoid) {
  var mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), materials.rock);
  mesh.position.set(x, s * 0.55, z);
  mesh.rotation.y = seeded(x * 10, z) * Math.PI;
  root.add(mesh);
  if (humanoid) {
    var sil = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 0.7, 3, 5),
      materials.humanoid
    );
    sil.position.set(x + 0.15, 0.7, z);
    root.add(sil);
  }
}

function buildPastoral() {
  var root = new THREE.Group();
  root.name = "BackroomsC1298";
  scene.add(root);

  // 广阔草地
  var ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // 远处朦胧山丘环
  var i;
  for (i = 0; i < 16; i++) {
    var a = (i / 16) * Math.PI * 2;
    var hr = 58 + seeded(i, 1) * 12;
    var hill = new THREE.Mesh(
      new THREE.SphereGeometry(10 + seeded(i, 2) * 8, 10, 8),
      materials.hill
    );
    hill.position.set(Math.cos(a) * hr, -2, Math.sin(a) * hr);
    hill.scale.y = 0.35 + seeded(i, 3) * 0.25;
    root.add(hill);
  }

  // 树林与灌木：越远人形轮廓越明显
  for (i = 0; i < 55; i++) {
    var tx = (seeded(i, 4) - 0.5) * 100;
    var tz = (seeded(i, 5) - 0.5) * 100;
    if (Math.abs(tx) < 3 && Math.abs(tz) < 3) continue;
    var d = distFromSpawn(tx, tz);
    var human = d > 12 && seeded(i, 6) > (d > 30 ? 0.25 : 0.55);
    addTree(root, tx, tz, 0.7 + seeded(i, 7) * 1.1, human);
  }
  for (i = 0; i < 40; i++) {
    addBush(
      root,
      (seeded(i, 8) - 0.5) * 80,
      (seeded(i, 9) - 0.5) * 80,
      0.4 + seeded(i, 10) * 0.7
    );
  }
  for (i = 0; i < 22; i++) {
    var rx = (seeded(i, 11) - 0.5) * 70;
    var rz = (seeded(i, 12) - 0.5) * 70;
    addRock(root, rx, rz, 0.35 + seeded(i, 13) * 0.8, distFromSpawn(rx, rz) > 20 && seeded(i, 14) > 0.5);
  }

  // 出生点旁：一处破败石凳（已被同化，仅作景物，不再是撤离点）
  var bench = new THREE.Group();
  bench.position.set(1.6, 0, -1.2);
  var seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), materials.bench);
  seat.position.y = 0.45;
  bench.add(seat);
  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.45), materials.bench);
  legL.position.set(-0.5, 0.22, 0);
  bench.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.5;
  bench.add(legR);
  // 裂痕感：略微倾斜
  bench.rotation.z = -0.04;
  bench.rotation.y = 0.35;
  root.add(bench);

  // MEG 外勤记录贴在石凳旁
  var note = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.03), materials.note);
  note.position.set(2.3, 0.9, -1.0);
  note.rotation.y = -0.5;
  root.add(note);
  interactables.push({ mesh: note, kind: "note", x: 2.3, z: -1.0 });

  // 柔和黄昏光
  root.add(new THREE.HemisphereLight(0xffd9a0, 0x3a4a28, 0.75));
  root.add(new THREE.AmbientLight(0xc9a878, 0.45));
  var sun = new THREE.DirectionalLight(0xffc878, 0.85);
  sun.position.set(-20, 28, 12);
  root.add(sun);
}

/* ------------------------------ 豆奶联动 ------------------------------ */

function luckAssimMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.3;
  if (luck >= 30) return 0.84;
  return 1;
}

function luckHallucIntervalMul() {
  // 倒霉：幻觉更频繁（间隔更短）
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 1.3;
  return 1;
}

function luckBreakChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.4;
  if (luck >= 30) return 0.18;
  return 0.28;
}

/* ------------------------------ 同化 ------------------------------ */

function refreshAssimUi() {
  var pct = Math.round(assim * 100);
  if (assimFillEl) assimFillEl.style.width = pct + "%";
  if (assimValueEl) assimValueEl.textContent = pct + "%";
}

function updateAssimilation(dt) {
  if (!survival || survival.dead || transitionLock) return;
  var d = distFromSpawn(fps.player.x, fps.player.z);
  // 原地也涨；越往山丘（远处）越快
  var distMul = 1 + Math.min(2.4, (d / FAR_DIST) * 1.6);
  assim = Math.min(1, assim + (dt / ASSIMILATE_SECONDS) * luckAssimMul() * distMul);
  refreshAssimUi();

  // 精神层面伤害：掉理智，不掉血
  survival.sanity = Math.max(1, survival.sanity - (0.25 + assim * 0.9) * dt);

  if (!stage30 && assim >= 0.3) {
    stage30 = true;
    showToast("内心变得麻木，只想在此处停留", 3600);
  }
  if (!stage60 && assim >= 0.6) {
    stage60 = true;
    showToast("不要被这片风景迷惑，逃离的念头正在消散", 4000);
  }
  if (assim >= 1) {
    showToast("你的意识消散——躯体化为这片田园风景的一部分。", 3600);
    survival.triggerDeath("c1298_assimilated");
  }
}

/* ------------------------------ 非欧：绕回 / 树移位 ------------------------------ */

function updateNonEuclidean(dt) {
  var d = distFromSpawn(fps.player.x, fps.player.z);
  if (d > WRAP_DIST) {
    // 往前走却被折回——非欧几里得
    var pull = (d - WRAP_DIST + 8) / d;
    fps.player.x -= (fps.player.x - SPAWN.x) * pull * 0.55;
    fps.player.z -= (fps.player.z - SPAWN.z) * pull * 0.55;
    if (elapsed > nextWrapToastAt) {
      nextWrapToastAt = elapsed + 10;
      showToast("你以为自己在往前走，却又绕回了原地……", 2800);
    }
  } else if (d > FAR_DIST * 0.85 && Math.random() < dt * 0.08) {
    // 中远距离偶尔轻微折返
    fps.player.x -= (fps.player.x - SPAWN.x) * 0.04;
    fps.player.z -= (fps.player.z - SPAWN.z) * 0.04;
  }

  // 盯着某棵树几秒后转头：它的位置发生变化
  if (!camera) return;
  camera.getWorldDirection(lookDir);
  for (var i = 0; i < trees.length; i++) {
    var t = trees[i];
    var dx = t.x - fps.player.x;
    var dz = t.z - fps.player.z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var dot = (dx / len) * lookDir.x + (dz / len) * lookDir.z;
    var inView = dot > 0.88 && len < 22;
    if (inView) {
      t.stared += dt;
    } else if (t.stared > 2.5) {
      // 转头再回头：树木挪位
      var ang = Math.random() * Math.PI * 2;
      var dist = 4 + Math.random() * 10;
      t.x = fps.player.x + Math.cos(ang) * dist;
      t.z = fps.player.z + Math.sin(ang) * dist;
      t.group.position.set(t.x, 0, t.z);
      t.stared = 0;
      if (Math.random() < 0.35) {
        showToast("那棵树……好像不在原来的位置了。", 2200);
      }
    } else {
      t.stared = Math.max(0, t.stared - dt * 0.5);
    }
  }
}

/* ------------------------------ 幻觉 / 任务道具 ------------------------------ */

function updateHallucinations() {
  if (!survival || survival.dead || assim < 0.35) return;
  if (elapsed > nextWhisperAt) {
    nextWhisperAt = elapsed + (9 + Math.random() * 10) * luckHallucIntervalMul();
    var msgs = [
      "耳边响起模糊的熟人声音……",
      "微风穿过树林，沙沙声里夹着低语。",
      "你忽然觉得自己本就属于这片田园。",
      "远处树林闪过一个人影——走近却空无一物。",
    ];
    showToast(msgs[Math.floor(Math.random() * msgs.length)], 3000);
  }
  if (assim >= 0.55 && elapsed > nextHallucAt) {
    nextHallucAt = elapsed + (4 + Math.random() * 6) * luckHallucIntervalMul();
    hallUntil = performance.now() + 280 + Math.random() * 420;
  }
}

function updateItemHazard() {
  if (!survival || survival.dead || elapsed < nextItemCheckAt) return;
  nextItemCheckAt = elapsed + 10 + Math.random() * 8;
  if (assim < 0.35) return;
  var failed = damageCarriedTaskItems(
    Math.min(0.9, luckBreakChance() * (0.5 + assim)),
    showToast
  );
  if (failed.length) {
    showToast("任务设备被风景同化损毁，相关任务失败！", 4000);
  }
}

function drawOverlay(now) {
  if (!fxCanvas) return;
  var ctx = fxCanvas.getContext("2d");
  var w = fxCanvas.width;
  var h = fxCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // 黄昏柔化暗角
  if (assim > 0.05) {
    var edge = 0.08 + assim * 0.5;
    var g = ctx.createRadialGradient(
      w * 0.5, h * 0.5, h * 0.22,
      w * 0.5, h * 0.5, h * 0.8
    );
    g.addColorStop(0, "rgba(255,200,120,0)");
    g.addColorStop(1, "rgba(60,40,20," + Math.min(0.65, edge) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 30%：边缘朦胧柔化
  if (assim >= 0.3) {
    ctx.fillStyle = "rgba(230,200,140," + (0.06 + (assim - 0.3) * 0.15) + ")";
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);
  }

  // 60%：一闪而过的人形幻影
  if (now < hallUntil) {
    ctx.fillStyle = "rgba(40,35,28,0.45)";
    var sx = w * (0.15 + Math.random() * 0.6);
    ctx.fillRect(sx, h * 0.28, 14 + Math.random() * 10, h * 0.45);
    ctx.beginPath();
    ctx.arc(sx + 10, h * 0.26, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------ 交互 ------------------------------ */

function refreshAim() {
  aimKind = "";
  if (!survival || survival.dead || transitionLock) return;
  var best = 2.4 * 2.4;
  for (var i = 0; i < interactables.length; i++) {
    var it = interactables[i];
    if (it.kind === "note" && readNote) continue;
    var dx = it.x - fps.player.x;
    var dz = it.z - fps.player.z;
    var d2 = dx * dx + dz * dz;
    if (d2 <= best) {
      best = d2;
      aimKind = it.kind;
    }
  }
}

function updateInteractUi() {
  if (!interactHintEl) return;
  if (!aimKind || transitionLock) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.hidden = false;
  if (aimKind === "note") {
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 阅读 M.E.G. 外勤记录";
  }
}

function tryInteract() {
  if (!aimKind || transitionLock || !survival || survival.dead) return;
  if (aimKind === "note") {
    readNote = true;
    showToast(MEG_RECORD, 8000);
  }
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
    onJump: function () {
      tryBackroomsJump(fps, 6);
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
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryInteract();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1298", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1298", showToast);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc4a878);
  scene.fog = new THREE.Fog(0xc4a878, 22, 75);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 160);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildPastoral();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1298" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水润了润喉咙，却冲不淡这片风景带来的麻木。");
    },
    onStrawberrySoyMilkUsed: function () {
      showToast("草莓豆奶让理智回暖片刻——风景仍在低语。");
    },
  });

  initBackroomsTemperature("c1298", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  refreshAssimUi();
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1298 · 人景 · 生存难度 死区 · 无出口 · " +
      "景观同化不可逆，你终将化为这片田园的一部分";
  }
  bindControls();

  window.setTimeout(function () {
    showToast(
      "⚠️ Level C-1298「人景」死区。美丽田园之下藏着致命的精神同化。" +
        "一草一木皆是曾经的流浪者。同化一旦完成，没有任何解救手段。",
      7000
    );
  }, 600);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead && !transitionLock) {
      elapsed += dt;
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
      updateAssimilation(dt);
      updateNonEuclidean(dt);
      updateHallucinations();
      updateItemHazard();
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      survival &&
      !survival.dead &&
      !transitionLock &&
      !isInventoryOpen() &&
      !isTaskUiOpen()
    ) {
      // 后期身体逐渐僵硬：移动变慢（精神同化的体感表现，非骨折）
      var stiff = assim < 0.6 ? 1 : Math.max(0.35, 1 - (assim - 0.6) * 1.4);
      var sprintMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, stiff * sprintMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 8);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (assim > 0.45) {
      camera.rotation.z += Math.sin(elapsed * 0.6) * (assim - 0.45) * 0.03;
    }
    refreshAim();
    updateInteractUi();
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
  console.error("[Backrooms C-1298]", err);
  showError(err.message || String(err));
}

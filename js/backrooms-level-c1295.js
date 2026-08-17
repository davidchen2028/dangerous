/**
 * Backrooms Level C-1295 — 凝固（死区）
 * 一座未完工的毛坯建筑：光秃的混凝土承重柱、水泥墙、厚厚的尘土地面。
 * 世界完全褪成黑白灰度，布局无限循环；墙上窗口透出惨白虚空的光，有无形屏障挡回。
 * 核心效应：体内全部体液逐步凝固，平均存活约 90 秒；无原生出口、无敌对实体。
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
const TILE = 12;              // 每个循环房间的中心间距
const DOOR = 3.6;             // 房间之间的门洞宽度
const WALL_H = 4.4;           // 层高
const GRID = 3;              // 可见网格半径（tile 数）——±3 共 7×7
/** 体液从 0 凝固到彻底固化（死亡）所需的基础秒数 */
const SOLIDIFY_SECONDS = 90;
/** 被凝固效应封印、无法使用的液体道具用途键 */
const FROZEN_USE_KEYS = [
  "__backroomsUseAlmondWater",
  "__backroomsUseStrawberrySoyMilk",
  "__backroomsUseBananaSoyMilk",
  "__backroomsUseLuckySoyMilk",
  "__backroomsUseVaultSoyMilk",
];

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.4 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const solidFillEl = document.getElementById("backroomsSolidFill");
const solidValueEl = document.getElementById("backroomsSolidValue");
const fxCanvas = document.getElementById("backroomsGrayFx");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let elapsed = 0;
/** 体液凝固进度 0..1（=1 时彻底固化死亡） */
let solidify = 0;
let stage30Toasted = false;
let stage60Toasted = false;
let stage90Toasted = false;
let nextItemCheckAt = 7;
/** 可拾取的 M.E.G. 外勤记录 */
let notes = [];
let readNote = false;
let aimNote = null;

const MEG_RECORD =
  "外勤记录 C-1295-02\n\n" +
  "这里一片灰白，安静得可怕。不要寄希望杏仁水，进来之后它就直接凝固废掉。" +
  "身体僵硬的速度比想象更快，一旦感觉手脚发麻，就代表留给你的时间已经不多。";

const geometries = {
  pillar: new THREE.BoxGeometry(0.9, WALL_H, 0.9),
  note: new THREE.BoxGeometry(0.5, 0.66, 0.04),
};

const materials = {
  // 全屏灰度滤镜会抹掉颜色，这里只需控制明度层次。
  wall: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.96 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.98 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x7d7a74, roughness: 1 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0xa6a6a6, roughness: 0.94 }),
  window: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  note: new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.7 }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1295 无法启动</strong></p><p>" + String(text) + "</p>";
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat, collide) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

/** 一段中央留门洞的墙（沿 X 或 Z 铺开），并在门洞上方留窗透白光。 */
function addWallWithDoor(root, axis, lineCoord, tileCenter, addWindow) {
  var half = TILE * 0.5;
  var segLen = (TILE - DOOR) * 0.5;
  var segOffset = DOOR * 0.5 + segLen * 0.5;
  var yMid = WALL_H * 0.5;
  var s;
  for (s = -1; s <= 1; s += 2) {
    var along = tileCenter + s * segOffset;
    if (axis === "x") {
      // 墙面法线朝 X：沿 Z 铺开，固定在 x = lineCoord
      addBox(root, 0.28, WALL_H, segLen, lineCoord, yMid, along, materials.wall, true);
    } else {
      addBox(root, segLen, WALL_H, 0.28, along, yMid, lineCoord, materials.wall, true);
    }
  }
  // 门洞上方的横梁
  if (axis === "x") {
    addBox(root, 0.28, WALL_H - 2.6, DOOR, lineCoord, WALL_H - (WALL_H - 2.6) * 0.5, tileCenter, materials.wall, false);
  } else {
    addBox(root, DOOR, WALL_H - 2.6, 0.28, tileCenter, WALL_H - (WALL_H - 2.6) * 0.5, lineCoord, materials.wall, false);
  }
  // 惨白窗口：镶在其中一段墙的上部
  if (addWindow) {
    var wx, wz, ww, wd;
    var wy = WALL_H * 0.62;
    if (axis === "x") {
      wx = lineCoord;
      wz = tileCenter - segOffset;
      ww = 0.06;
      wd = segLen * 0.72;
    } else {
      wx = tileCenter - segOffset;
      wz = lineCoord;
      ww = segLen * 0.72;
      wd = 0.06;
    }
    var win = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.5, wd), materials.window);
    win.position.set(wx, wy, wz);
    root.add(win);
  }
}

function addNote(root, x, z) {
  var mesh = new THREE.Mesh(geometries.note, materials.note);
  // 贴在承重柱内侧，约齐胸高度
  mesh.position.set(x, 1.35, z);
  root.add(mesh);
  notes.push({ mesh: mesh, x: x, z: z });
}

function buildRawBuilding() {
  var root = new THREE.Group();
  root.name = "BackroomsC1295";
  scene.add(root);

  var span = (GRID + 1) * TILE * 2;
  addBox(root, span, 0.2, span, 0, -0.1, 0, materials.floor, false);
  addBox(root, span, 0.2, span, 0, WALL_H + 0.1, 0, materials.ceil, false);

  var g, h;
  // 承重柱：铺在每条网格线交点上（与门墙的网格线对齐）
  for (g = -GRID - 1; g <= GRID; g++) {
    for (h = -GRID - 1; h <= GRID; h++) {
      var pillar = new THREE.Mesh(geometries.pillar, materials.pillar);
      pillar.position.set((g + 0.5) * TILE, WALL_H * 0.5, (h + 0.5) * TILE);
      root.add(pillar);
    }
  }

  // 竖墙（法线朝 X）：位于 x = (k+0.5)*TILE 的网格线上，逐 tile 铺段留门
  for (g = -GRID - 1; g <= GRID; g++) {
    var lineX = (g + 0.5) * TILE;
    for (h = -GRID; h <= GRID; h++) {
      var cz = h * TILE;
      addWallWithDoor(root, "x", lineX, cz, (g + h) % 2 === 0);
    }
  }
  // 横墙（法线朝 Z）
  for (h = -GRID - 1; h <= GRID; h++) {
    var lineZ = (h + 0.5) * TILE;
    for (g = -GRID; g <= GRID; g++) {
      var cx = g * TILE;
      addWallWithDoor(root, "z", lineZ, cx, (g + h) % 2 !== 0);
    }
  }

  // 可拾取的外勤记录：贴在中央 tile 附近的几根柱子上（世界循环，始终就在身边）
  addNote(root, -TILE * 0.5 + 0.55, -TILE * 0.5 + 0.55);
  addNote(root, TILE * 0.5 - 0.55, -TILE * 0.5 + 0.55);
  addNote(root, -TILE * 0.5 + 0.55, TILE * 0.5 - 0.55);

  // 灯光：冷白、压抑；主要亮源是窗外惨白虚空。
  root.add(new THREE.HemisphereLight(0xf2f2f2, 0x2a2a2a, 0.55));
  root.add(new THREE.AmbientLight(0xdddddd, 0.5));
  var glow = new THREE.PointLight(0xffffff, 0.7, 30, 2);
  glow.position.set(0, WALL_H * 0.7, 0);
  root.add(glow);
}

/* ------------------------------ 无限循环 ------------------------------ */

/** 把玩家坐标折回中央 tile，制造一模一样房间无限延伸的错觉。 */
function wrapPlayer() {
  var half = TILE * 0.5;
  if (fps.player.x > half) fps.player.x -= TILE;
  else if (fps.player.x < -half) fps.player.x += TILE;
  if (fps.player.z > half) fps.player.z -= TILE;
  else if (fps.player.z < -half) fps.player.z += TILE;
}

/* ------------------------------ 豆奶联动 ------------------------------ */

function luckSolidifyMul() {
  // 倒霉：凝固加快 20%；幸运：小幅降低，但依旧倒计时死亡。
  var luck = getLuck();
  if (luck <= -30) return 1.2;
  if (luck >= 30) return 0.86;
  return 1;
}

function luckBreakChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 0.28;
  return 0.4;
}

/* ------------------------------ 凝固效应 ------------------------------ */

function refreshSolidifyUi() {
  var pct = Math.round(solidify * 100);
  if (solidFillEl) solidFillEl.style.width = pct + "%";
  if (solidValueEl) solidValueEl.textContent = pct + "%";
}

function updateSolidify(dt) {
  if (!survival || survival.dead) return;
  solidify = Math.min(1, solidify + (dt / SOLIDIFY_SECONDS) * luckSolidifyMul());
  refreshSolidifyUi();

  // 阶段提示
  if (!stage30Toasted && solidify >= 0.3) {
    stage30Toasted = true;
    showToast("身体开始发麻，体液正在变粘稠……", 3400);
  }
  if (!stage60Toasted && solidify >= 0.6) {
    stage60Toasted = true;
    showToast("四肢僵硬，尽快赶往撤离点！", 3600);
  }
  if (!stage90Toasted && solidify >= 0.9) {
    stage90Toasted = true;
    showToast("体液即将彻底凝固……", 3000);
  }

  // 缺氧/僵化带来的持续损伤：越接近固化，掉血越快。
  survival.takeDamage((0.25 + solidify * solidify * 2.6) * dt);

  if (solidify >= 1) {
    showToast("体液彻底凝固——你在一片灰白中僵成了雕像。", 3200);
    survival.triggerDeath("c1295_solidified");
  }
}

/** 凝固导致的移动速度倍率：60% 后大幅降低。 */
function solidifySpeedMul() {
  if (solidify < 0.3) return 1;
  if (solidify < 0.6) return 1 - (solidify - 0.3) * 0.6;   // 1 → 0.82
  return Math.max(0.18, 0.82 - (solidify - 0.6) * 1.7);    // 0.82 → 0.14(clamp .18)
}

/** 液态部件的任务道具（采样罐 / 记录仪）碰上凝固效应会损毁。 */
function updateItemHazard() {
  if (!survival || survival.dead || elapsed < nextItemCheckAt) return;
  nextItemCheckAt = elapsed + 6 + Math.random() * 5;
  if (solidify < 0.25) return;
  var chance = luckBreakChance() * (0.4 + solidify * 0.8);
  var failed = damageCarriedTaskItems(Math.min(0.95, chance), showToast);
  if (failed.length) {
    showToast("采样罐/记录仪内的液体凝固胀裂，任务失败！", 4200);
  }
}

/* ------------------------------ 交互（外勤记录） ------------------------------ */

function refreshNoteAim() {
  aimNote = null;
  if (!notes.length) return;
  var best = 2.4 * 2.4;
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    var dx = n.x - fps.player.x;
    var dz = n.z - fps.player.z;
    var d2 = dx * dx + dz * dz;
    if (d2 <= best) {
      best = d2;
      aimNote = n;
    }
  }
}

function updateInteractUi() {
  if (!interactHintEl) return;
  if (aimNote && !readNote && (!survival || !survival.dead)) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 阅读墙上的 M.E.G. 外勤记录";
  } else {
    interactHintEl.hidden = true;
  }
}

function tryReadNote() {
  if (!aimNote) return;
  readNote = true;
  showToast(MEG_RECORD, 8000);
}

/* ------------------------------ 屏幕特效 ------------------------------ */

function drawOverlay() {
  if (!fxCanvas) return;
  var ctx = fxCanvas.getContext("2d");
  var w = fxCanvas.width;
  var h = fxCanvas.height;
  ctx.clearRect(0, 0, w, h);
  if (solidify <= 0.15) return;
  // 灰白压抑的暗角，随凝固加深
  var edge = (solidify - 0.15) * 0.85;
  var grad = ctx.createRadialGradient(
    w * 0.5, h * 0.5, h * (0.34 - solidify * 0.18),
    w * 0.5, h * 0.5, h * 0.8
  );
  grad.addColorStop(0, "rgba(200,200,200,0)");
  grad.addColorStop(1, "rgba(30,30,30," + Math.min(0.72, edge) + ")");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function updateCanvasBlur() {
  if (!canvas) return;
  // 30% 起轻微模糊；越接近固化越糊。仅作用在 3D 画面，不糊 HUD。
  var px = solidify < 0.3 ? 0 : (solidify - 0.3) * 7.5;
  canvas.style.filter = px > 0.05 ? "blur(" + px.toFixed(2) + "px)" : "";
}

/* ------------------------------ 液体道具封印 ------------------------------ */

function sealLiquidItems() {
  for (var i = 0; i < FROZEN_USE_KEYS.length; i++) {
    window[FROZEN_USE_KEYS[i]] = function () {
      showToast("背包里的液体已经凝固成块，完全无法使用。");
    };
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
        tryReadNote();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1295", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1295", showToast);

  // 全屏黑白灰度：玩家、道具、背包物品进入后同样褪成灰度。
  document.body.style.filter = "grayscale(1) contrast(1.05)";

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f4f4);
  scene.fog = new THREE.Fog(0xf0f0f0, 10, 30);
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 120);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildRawBuilding();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1295" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {});
  // 凝固效应封印一切液体补给（覆盖默认的使用逻辑）。
  sealLiquidItems();

  initBackroomsTemperature("c1295", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  refreshSolidifyUi();
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1295 · 凝固 · 生存难度 死区 · 无出口 · " +
      "体液正在凝固，平均存活约 90 秒 · 液态补给全部失效";
  }
  bindControls();

  // 入层警告 + 随身液态任务道具可能立刻凝固损毁。
  window.setTimeout(function () {
    showToast(
      "⚠️ 所有液体会在此空间逐步固化，杏仁水无法自救。争分夺秒，不要长时间停留。",
      6000
    );
    var failed = damageCarriedTaskItems(luckBreakChance(), showToast);
    if (failed.length) {
      showToast("采样罐/记录仪里的液体瞬间凝固胀裂，相关任务失败！", 4200);
    }
  }, 700);

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
      updateSolidify(dt);
      updateItemHazard();
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var speedMul = solidifySpeedMul();
      var sprintMul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, speedMul * sprintMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 24);
      });
      wrapPlayer();
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    // 20%~60%：扭曲幻觉的轻微晃动；60% 之后转为明显的僵硬抖动。
    if (solidify > 0.18) {
      var wob = solidify < 0.6 ? (solidify - 0.18) * 0.06 : 0.025 + (solidify - 0.6) * 0.16;
      camera.rotation.z += Math.sin(elapsed * 1.7) * wob;
      if (solidify >= 0.6) {
        camera.position.x += Math.sin(elapsed * 17) * (solidify - 0.6) * 0.06;
        camera.position.y += Math.cos(elapsed * 14) * (solidify - 0.6) * 0.05;
      }
    }
    refreshNoteAim();
    updateInteractUi();
    updateCanvasBlur();
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
  console.error("[Backrooms C-1295]", err);
  showError(err.message || String(err));
}

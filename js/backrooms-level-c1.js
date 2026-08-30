/**
 * Backrooms Level C-1 — 交点（I 层群与 C 层群的第一个交点）
 *
 * 黄墙纸、地毯、荧光灯，和 Level 0 像到分不出来——原文说很多人以为自己切出到的是
 * Level 0，其实到的是这里。区别在于这里有门、有楼梯，也有别的东西。
 *
 * 玩法的核心是一条循环：安全出口标志由绿变红（唯一的预警）→ 荧光灯烧断爆裂、全境
 * 陷入黑暗 → 弱化的钝人、成年无面灵与猎犬出现 → 用火盐反击或者熬过去 → 灯重新亮起。
 * 平时则在墙角搜刮杏仁水、火盐和工具，并寻找通往 Level 1 的灰白色消防通道。
 */
import * as THREE from "three";
import {
  BackroomsSurvival,
  registerBackroomsInventoryUseHandlers,
} from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  addItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { buildLevelC1World } from "./backrooms-level-c1-world.js";
import { createC1BlackoutSystem } from "./backrooms-c1-blackout.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { createPointLightPool } from "./backrooms-point-light-pool.js";
import {
  pickCrosshairInteract,
  getCameraAimRay,
} from "./backrooms-interact-aim.js";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
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

const WALL_HEIGHT = 2.6;
const GRID_SIZE = 2;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;
const JUMP_SPEED = 8;

/** 与 Level 0 同一套暖黄雾：交点就是要让人误以为自己还在 Level 0 */
const FOG_COLOR = 0xc9bc88;
const FOG_NEAR = 4;
const FOG_FAR = 28;

const AIM_INTERACT_MAX = 3.6;

/** 已拾取补给的存档键：同一局里不重复刷出 */
const C1_STATE_KEY = "backrooms_c1_state_v1";

/**
 * 理智压力：交点是生存难度 1 的层级，压力必须明显低于 Level 2（0.035 常态 / 0.14 断电）。
 * 这些值是叠加在 survival 自身 0.1/秒 被动衰减之上的额外部分。
 */
const SANITY_DRAIN_CALM = 0.02;
const SANITY_DRAIN_BLACKOUT = 0.12;
/** 一次性惊吓的理智扣除速率（点/秒） */
const SANITY_SHOCK_RATE = 2;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.1 },
});

/** 流式世界原地增删的碰撞体数组，引用本身始终有效 */
let wallColliders = [];
const _survCtx = { sprinting: false, blackout: false, sanityDrainPerSec: 0 };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: WALL_HEIGHT,
};
const _fixtures = [];

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let world = null;
let blackout = null;
let firesalt = null;
let lightPool = null;
let sceneAmbient = null;
let sceneHemi = null;
let currentAimPick = null;
let elapsed = 0;
let leaving = false;
/** 皮鞋脚步声：由远及近后骤然消失，声源处空无一物 */
let footstepAt = 0;
let footstepPhase = 0;
/** 一次性惊吓造成的理智损失，摊进接下来一秒的持续掉落里 */
let sanityShock = 0;

function queueSanityShock(amount) {
  sanityShock += amount;
}

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs != null ? durationMs : 2400 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1 无法启动</strong></p><p>" + String(text) + "</p>";
}

/* --------------------------------- 存档 --------------------------------- */

function readState() {
  try {
    var raw = sessionStorage.getItem(C1_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(C1_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function rememberTakenLoot(id) {
  var state = readState();
  if (!Array.isArray(state.loot)) state.loot = [];
  if (state.loot.indexOf(id) < 0) state.loot.push(id);
  writeState(state);
}

/* --------------------------------- 灯光 --------------------------------- */

function addLighting(root) {
  sceneHemi = new THREE.HemisphereLight(0xfff8e0, 0x8a8563, 0.38);
  root.add(sceneHemi);
  sceneAmbient = new THREE.AmbientLight(0xfff4d0, 0.22);
  root.add(sceneAmbient);

  var gfx = resolveBackroomsGfxProfile();
  var budget = gfx.pointLightBudget != null ? gfx.pointLightBudget : 6;
  if (!gfx.fluorescentPointLights) budget = Math.min(budget, 3);
  lightPool = createPointLightPool(root, {
    count: Math.max(1, budget),
    color: 0xfff6e8,
    distance: 10,
    decay: 1.4,
    y: WALL_HEIGHT - 0.25,
    name: "C1PooledLight",
  });
}

/**
 * 荧光灯：工频微颤 + 偶发瞬断，断电时整体压到极暗。
 * @param {number} envMul 断电系统给出的全局亮度系数
 */
function updateLighting(dt, envMul) {
  if (sceneHemi) sceneHemi.intensity = 0.38 * envMul;
  if (sceneAmbient) sceneAmbient.intensity = 0.22 * envMul;
  // 雾和天空盒也要跟着压暗，否则断电时远处仍是一片亮黄，黑暗完全读不出来
  if (scene && scene.fog) {
    scene.fog.color.setHex(FOG_COLOR).multiplyScalar(envMul);
    if (scene.background && scene.background.isColor) {
      scene.background.copy(scene.fog.color);
    }
  }
  if (!world) return;

  var streamed = world.getLightCandidates(fps.player.x, fps.player.z, 20);
  _fixtures.length = 0;
  var i;
  for (i = 0; i < streamed.length; i++) {
    var source = streamed[i];
    if (source.baseIntensity == null) source.baseIntensity = source.intensity;
    if (source.dimUntil == null) source.dimUntil = 0;
    if (source.buzzPhase == null) source.buzzPhase = source.phase || 0;
    _fixtures.push(source);
  }

  for (i = 0; i < _fixtures.length; i++) {
    var f = _fixtures[i];
    var buzz =
      1 +
      Math.sin(elapsed * 118 + f.buzzPhase) * 0.022 +
      Math.sin(elapsed * 367 + f.buzzPhase * 1.7) * 0.012;
    if (Math.random() < 0.006) f.dimUntil = elapsed + 0.025 + Math.random() * 0.055;
    if (Math.random() < 0.00035) f.dimUntil = elapsed + 0.12 + Math.random() * 0.28;
    var dimMul = elapsed < f.dimUntil ? 0.28 + Math.random() * 0.35 : 1;
    var mul = Math.max(0.45, Math.min(1.08, buzz * dimMul));
    f.intensity = f.baseIntensity * mul * envMul;
  }

  if (lightPool) lightPool.update(fps.player.x, fps.player.z, _fixtures);
}

/* -------------------------------- 氛围事件 -------------------------------- */

/**
 * 原文：「在流浪者附近的某一处会突然出现类似皮鞋踩地的声音，随着流浪者的接近其将
 * 愈发急促，直到某一刻为止声音会瞬间消失，而声源处空无一物。」
 */
function updateFootsteps(now) {
  if (!survival || survival.dead) return;
  if (footstepAt === 0) {
    footstepAt = now + 30000 + Math.random() * 45000;
    return;
  }
  if (now < footstepAt) return;
  footstepPhase++;
  if (footstepPhase === 1) {
    showToast("附近传来皮鞋踩在地毯上的声音。", 2600);
    footstepAt = now + 4200;
  } else if (footstepPhase === 2) {
    showToast("脚步声越来越急促，像是正朝你走来。", 2600);
    footstepAt = now + 3400;
  } else {
    showToast("脚步声戛然而止——那个方向什么也没有。", 3200);
    queueSanityShock(1.5);
    footstepPhase = 0;
    footstepAt = now + 45000 + Math.random() * 60000;
  }
}

/* -------------------------------- 交互 -------------------------------- */

function updateAimPick() {
  if (!camera || !world) {
    currentAimPick = null;
    return;
  }
  var roots = world.getInteractMeshes();
  if (!roots.length) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    wallColliders,
    0,
    WALL_HEIGHT
  );
  currentAimPick = pickCrosshairInteract(camera, roots, AIM_INTERACT_MAX, wallBlock);
}

function aimKind() {
  return currentAimPick && currentAimPick.data ? currentAimPick.data.kind : null;
}

function updateDoorHint() {
  if (!doorHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    doorHintEl.hidden = true;
    return;
  }
  var kind = aimKind();
  var text = "";
  if (kind === "c1_loot") {
    text = (currentAimPick.data.name || "补给") + " · 按 <kbd>Q</kbd> 拾取";
  } else if (kind === "c1_peephole") {
    text = "墙上的小洞 · 按 <kbd>Q</kbd> 凑近查看";
  } else if (kind === "c1_fire_exit") {
    text = "灰白色消防通道 · 按 <kbd>Q</kbd> 前往 Level 1";
  }
  if (!text) {
    doorHintEl.hidden = true;
    return;
  }
  doorHintEl.innerHTML = text;
  doorHintEl.hidden = false;
}

function takeLoot(data) {
  var itemId = data.itemId;
  var granted = false;
  if (itemId === "almond_water") {
    granted = survival.addAlmondWater(1) > 0;
  } else {
    granted = addItem({ id: itemId, name: data.name || "补给" });
  }
  if (!granted) {
    showToast("背包已满，腾不出手来。");
    return;
  }
  world.consumeLoot(data.id);
  rememberTakenLoot(data.id);
  showToast("拾取 " + (data.name || "补给"));
}

function peepThroughHole() {
  // 原文：凑近墙洞能看到 Level C-2 的景象，此时尝试切出即可过去。
  // C-2 在本作尚未实现，所以这里只做观察，不开放通行。
  showToast(
    "洞后是另一片走廊的轮廓——那是 Level C-2。这个距离切不过去。",
    4200
  );
  queueSanityShock(0.8);
}

function leaveToLevel1() {
  if (leaving || !survival || survival.dead) return;
  leaving = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("clip", fps.yaw);
  try {
    sessionStorage.setItem("backrooms_clip_yaw", String(fps.yaw));
  } catch (err) {
    /* ignore */
  }
  queueEnterLevelNumber(1);
  showToast("推开消防门，灰白色的楼梯向下延伸……");
  window.setTimeout(function () {
    window.location.href = "backrooms-level1.html";
  }, 480);
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var kind = aimKind();
  if (kind === "c1_loot") {
    takeLoot(currentAimPick.data);
    return;
  }
  if (kind === "c1_peephole") {
    peepThroughHole();
    return;
  }
  if (kind === "c1_fire_exit") {
    leaveToLevel1();
  }
}

/* -------------------------------- 启动 -------------------------------- */

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
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryQAction();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function initSurvivalHud() {
  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1" };
  });
}

function init() {
  if (!enforceLevelEntry("c1", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1", showToast);
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.08,
    220
  );
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevelC1";
  scene.add(root);

  world = buildLevelC1World(root, {
    gridSize: GRID_SIZE,
    wallHeight: WALL_HEIGHT,
    gfxProfile: gfx,
  });
  world.restoreTakenLoot(readState().loot);
  addLighting(root);

  var spawn = world.getSpawnPoint();
  fps.player.x = spawn.x;
  fps.player.z = spawn.z;
  fps.feetY = 0;
  fps.grounded = true;
  world.update(fps.player.x, fps.player.z, performance.now());
  wallColliders = world.getColliders();

  blackout = createC1BlackoutSystem({
    root: root,
    colliders: wallColliders,
    world: world,
    showToast: showToast,
    getPlayer: function () {
      return fps.player;
    },
  });

  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showToast,
  });

  initSurvivalHud();
  initBackroomsTemperature("c1", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1 · 交点 · 生存难度 1 · " +
      "WASD 移动 · <kbd>Q</kbd> 交互 · <kbd>B</kbd> 背包 · " +
      "留意安全出口标志：它变红就说明灯要灭了";
  }
  bindControls();

  window.setTimeout(function () {
    showToast("黄墙纸、地毯、荧光灯——像 Level 0，但这里有门，也有楼梯。", 5200);
  }, 800);

  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    if (world) world.update(fps.player.x, fps.player.z, now);

    var env = blackout
      ? blackout.update(dt, now, survival)
      : { blackout: false, warning: false, lightMul: 1 };

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.blackout = env.blackout;
      // 被注视感：断电时理智掉得更快；一次性惊吓按固定速率摊完
      var shockRate = 0;
      if (sanityShock > 0) {
        shockRate = SANITY_SHOCK_RATE;
        sanityShock = Math.max(0, sanityShock - shockRate * dt);
      }
      _survCtx.sanityDrainPerSec =
        (env.blackout ? SANITY_DRAIN_BLACKOUT : SANITY_DRAIN_CALM) + shockRate;
      survival.update(dt, _survCtx);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders, 8);
      });
    }

    // 非欧几里得：走过的地标之间会悄悄把人绕回去
    if (world && !isInventoryOpen()) {
      var loop = world.consumeLoopSuggestion(fps.player.x, fps.player.z, fps.yaw, now);
      if (loop) {
        fps.player.x = loop.x;
        fps.player.z = loop.z;
        if (Number.isFinite(loop.yaw)) fps.yaw = loop.yaw;
      }
    }

    updateAimPick();
    updateDoorHint();
    updateFootsteps(now);
    updateLighting(dt, env.lightMul);
    if (firesalt) firesalt.update(dt);

    if (crosshairEl) {
      var hide = isInventoryOpen() || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
      crosshairEl.classList.toggle(
        "backrooms-crosshair--interact",
        !hide && !!currentAimPick
      );
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
  console.error("[Backrooms C-1]", err);
  showError(err.message || String(err));
}

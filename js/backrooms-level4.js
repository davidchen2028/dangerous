/**
 * Backrooms Level 4 — 无限现代办公层（由 L3 电梯进入）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import { buildLevel4World, L4_WALL_H } from "./backrooms-level4-world.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { refreshLevel1_1OutpostChestsOnFirstL4Visit } from "./backrooms-level1-1-chests.js";
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
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
  DEFAULT_BODY_HEIGHT,
} from "./backrooms-fps-controller.js";

const FOG_COLOR = 0xe8ebf0;
const FOG_NEAR = 6;
const FOG_FAR = 52;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const waterHintEl = document.getElementById("backroomsWaterHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");

const LOOK_SENS = 0.0022;
const AIM_INTERACT_MAX = 3.2;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: L4_WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildLevel4World> | null} */
let level4World = null;
let colliders = [];
let survival = null;
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.15 },
});
let spawnX = 0;
let spawnZ = 2;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let lootToastUntil = 0;
let transitionLock = false;
let dialogueOpen = false;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 4 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l4", function (y) {
        fps.yaw = y;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return false;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 4 办公层 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包" + nv;
}

function updateAimPick() {
  if (
    !camera ||
    !interactRoots.length ||
    isInventoryOpen() ||
    dialogueOpen ||
    !survival ||
    survival.dead
  ) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    colliders,
    0,
    L4_WALL_H
  );
  currentAimPick = pickCrosshairInteract(
    camera,
    interactRoots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function isAimWaterCooler() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_water_cooler") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimStairsDown() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_stairs_down") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimVendingL61() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_vending_l61") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimBntgLiaison() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_bntg_liaison") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function updateWaterHint() {
  if (!waterHintEl) return;
  if (isInventoryOpen() || dialogueOpen || !survival || survival.dead || transitionLock) {
    waterHintEl.hidden = true;
    return;
  }
  waterHintEl.hidden = !isAimWaterCooler();
}

function updateInteractHint() {
  if (!interactHintEl) return;
  if (isInventoryOpen() || dialogueOpen || !survival || survival.dead || transitionLock) {
    interactHintEl.hidden = true;
    return;
  }
  if (isAimStairsDown()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 沿楼梯下行";
    return;
  }
  if (isAimVendingL61()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 切入自动售货机";
    return;
  }
  if (isAimBntgLiaison()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与 B.N.T.G. 联络员交谈";
    return;
  }
  interactHintEl.hidden = true;
}

function closeBntgDialogue() {
  dialogueOpen = false;
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
}

function openBntgDialogue() {
  if (!dialogueEl || !dialogueTextEl || !dialogueChoicesEl) return;
  dialogueOpen = true;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  dialogueTextEl.textContent =
    "M.E.G. 的任务人员还没到岗。你要不要先去 Level 1 的 B.N.T.G. 基地？那里与 Level 1 主区域不相通。";
  dialogueChoicesEl.innerHTML =
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="a"><kbd>A</kbd> 前往基地</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="b"><kbd>B</kbd> 暂时不去</button>';
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function exitToL1BntgBase() {
  if (transitionLock) return;
  transitionLock = true;
  closeBntgDialogue();
  showLootToast("B.N.T.G. 联络员带你前往独立基地…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l1_bntg", fps.yaw);
  queueEnterLevelBanner("Level 1 · B.N.T.G. 基地");
  window.setTimeout(function () {
    window.location.href = "backrooms-level1-bntg-base.html";
  }, 500);
}

function handleBntgChoice(choice) {
  if (!dialogueOpen) return;
  if (choice === "a") exitToL1BntgBase();
  else closeBntgDialogue();
}

function tryWaterCoolerQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimWaterCooler()) return;
  if (!survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showLootToast("背包已满");
    return;
  }
  saveBackroomsSurvival(survival);
  showLootToast("接了一瓶杏仁水");
}

function exitToLevel6() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("你走下楼梯——黑暗吞没了灯光…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l6", fps.yaw);
  queueEnterLevelNumber(6);
  window.setTimeout(function () {
    window.location.href = "backrooms-level6.html";
  }, 550);
}

function exitToLevel61() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("你挤进了自动售货机…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l6_1", fps.yaw);
  queueEnterLevelNumber("6.1");
  window.setTimeout(function () {
    window.location.href = "backrooms-level6-1.html";
  }, 550);
}

function tryStairsQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimStairsDown()) return;
  exitToLevel6();
}

function tryVendingQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimVendingL61()) return;
  exitToLevel61();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || dialogueOpen;
    },
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (dialogueOpen) {
        if (e.code === "KeyA" && !e.repeat) {
          e.preventDefault();
          handleBntgChoice("a");
          return true;
        }
        if ((e.code === "KeyB" || e.code === "Escape") && !e.repeat) {
          e.preventDefault();
          handleBntgChoice("b");
          return true;
        }
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        if (isAimStairsDown()) tryStairsQ();
        else if (isAimVendingL61()) tryVendingQ();
        else if (isAimBntgLiaison()) openBntgDialogue();
        else tryWaterCoolerQ();
        return true;
      }
      return false;
    },
    onPointerLockChange: function () {
      syncLookUi();
    },
  });
  if (dialogueChoicesEl) {
    dialogueChoicesEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-bntg-choice]");
      if (!btn) return;
      handleBntgChoice(btn.getAttribute("data-bntg-choice"));
    });
  }
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  refreshLevel1_1OutpostChestsOnFirstL4Visit();
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  // L4 是唯一有平行光阴影的关卡；low 档关闭，high 档使用 PCFSoft
  renderer.shadowMap.enabled = gfx.shadows;
  if (gfx.shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var root = new THREE.Group();
  root.name = "BackroomsLevel4";
  scene.add(root);

  level4World = buildLevel4World(root, gfx);
  colliders = level4World.colliders;
  interactRoots = level4World.interactRoots;
  spawnX = level4World.spawnX;
  spawnZ = level4World.spawnZ;
  fps.player.x = spawnX;
  fps.player.z = spawnZ;

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
      showLootToast("杏仁水 · +15 血量 · +25 理智");
    },
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 4 };
  });

  initBackroomsTemperature(4, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.bodyHeight = BODY_HEIGHT;
    _physOpts.ceilingY = L4_WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !dialogueOpen) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 16);
      });
    }
    if (level4World) level4World.update(fps.player.x, fps.player.z);
    updateAimPick();
    updateWaterHint();
    updateInteractHint();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (crosshairEl) {
      var hideXh = isInventoryOpen() || dialogueOpen || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hideXh);
      crosshairEl.classList.toggle(
        "backrooms-crosshair--interact",
        !hideXh &&
          (isAimWaterCooler() ||
            isAimStairsDown() ||
            isAimVendingL61() ||
            isAimBntgLiaison())
      );
    }
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L4]", err);
  showError(err.message || String(err));
}

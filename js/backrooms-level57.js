/**
 * Backrooms Level 57 — 7×7 黄色房间 · 画作 · 画家
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
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { buildLevel57World, L57_WALL_H } from "./backrooms-level57-world.js";
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

const FOG_COLOR = 0xf0e4c0;
const FOG_NEAR = 3;
const FOG_FAR = 28;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.2;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildLevel57World> | null} */
let world = null;
const wallColliders = [];
let survival = null;
let lootToastUntil = 0;
let transitionLock = false;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let painterDialogueOpen = false;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: L57_WALL_H,
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 57 无法启动</strong></p><p>" + msg + "</p>";
}

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
  lootToastUntil = performance.now() + 2600;
  if (lootToastEl) lootToastEl.hidden = false;
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l57", function (y) {
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

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 57 · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包" +
    nv;
}

function updateLootToast(now) {
  if (!lootToastEl || lootToastEl.hidden) return;
  if (now >= lootToastUntil) lootToastEl.hidden = true;
}

function renderDialogueChoice(letter, label) {
  return (
    '<button type="button" class="backrooms-dialogue__choice" data-choice="' +
    letter +
    '"><kbd>' +
    letter.toUpperCase() +
    "</kbd> " +
    label +
    "</button>"
  );
}

function isDialogueChoiceKey(e, letter) {
  if (e.repeat) return false;
  var upper = letter.toUpperCase();
  if (e.code === "Key" + upper) return true;
  var key = e.key;
  return !!(key && key.length === 1 && key.toLowerCase() === letter);
}

function openPainterDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  painterDialogueOpen = true;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "画家";
  dialogueTextEl.textContent = "你想去 Level 21 吗？";
  if (dialogueChoicesEl) {
    dialogueChoicesEl.hidden = false;
    dialogueChoicesEl.innerHTML =
      renderDialogueChoice("a", "是") + renderDialogueChoice("b", "不是");
  }
  if (interactHintEl) interactHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  dialogueEl.setAttribute("tabindex", "-1");
  try {
    dialogueEl.focus({ preventScroll: true });
  } catch (err) {
    dialogueEl.focus();
  }
}

function closePainterDialogue() {
  painterDialogueOpen = false;
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function handlePainterChoice(choice) {
  if (!painterDialogueOpen) return;
  if (choice === "a") {
    closePainterDialogue();
    exitToLevel21();
    return;
  }
  if (choice === "b") {
    closePainterDialogue();
  }
}

function refreshAimPick() {
  if (!camera || painterDialogueOpen) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_MAX);
  var block = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_MAX,
    wallColliders,
    0,
    L57_WALL_H
  );
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX, block);
}

function resolveInteract() {
  if (currentAimPick && currentAimPick.distance <= AIM_MAX) {
    return currentAimPick.data;
  }
  return null;
}

function interactLabel(data) {
  if (!data) return "";
  if (data.kind === "l57_painting") return "黄色房间画作 · 按 <kbd>Q</kbd> 切出";
  if (data.kind === "l57_cave_painting") return "洞穴画作 · 按 <kbd>Q</kbd> 穿过";
  if (data.kind === "l57_painter") return "画家 · 按 <kbd>Q</kbd> 对话";
  return "";
}

function updateInteractHint() {
  if (!interactHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead || painterDialogueOpen) {
    interactHintEl.hidden = true;
    return;
  }
  var data = resolveInteract();
  var label = interactLabel(data);
  if (!label) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.innerHTML = label;
  interactHintEl.hidden = false;
}

function updateCrosshair() {
  if (!crosshairEl) return;
  var hide = isInventoryOpen() || !survival || survival.dead || painterDialogueOpen;
  crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
  crosshairEl.classList.toggle("backrooms-crosshair--interact", !hide && !!resolveInteract());
}

function exitToLevel0() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("l0", fps.yaw);
  grantLevelPass("clip", fps.yaw);
  queueEnterLevelNumber(0);
  window.location.href = "backrooms-level0.html";
}

function exitToLevel21() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("画家侧身让开，露出一扇门…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l21", fps.yaw);
  queueEnterLevelNumber(21);
  window.location.href = "backrooms-level21.html";
}

function exitToLevel8() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("穿过洞穴画作…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l8", fps.yaw);
  queueEnterLevelNumber(8);
  window.location.href = "backrooms-level8.html";
}

function tryQAction() {
  if (isInventoryOpen() || !survival || survival.dead || painterDialogueOpen) return;

  var data = resolveInteract();
  if (!data) return;
  var k = data.kind;

  if (k === "l57_painting") {
    showLootToast("穿过画作…");
    window.setTimeout(exitToLevel0, 450);
    return;
  }
  if (k === "l57_cave_painting") {
    window.setTimeout(exitToLevel8, 450);
    return;
  }
  if (k === "l57_painter") {
    openPainterDialogue();
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || painterDialogueOpen;
    },
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (painterDialogueOpen) {
        if (isDialogueChoiceKey(e, "a")) {
          e.preventDefault();
          handlePainterChoice("a");
          return true;
        }
        if (isDialogueChoiceKey(e, "b")) {
          e.preventDefault();
          handlePainterChoice("b");
          return true;
        }
        if (e.code === "Escape" && !e.repeat) {
          e.preventDefault();
          closePainterDialogue();
          return true;
        }
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyQ" || e.key === "q" || e.key === "Q") {
        if (!e.repeat) {
          e.preventDefault();
          tryQAction();
        }
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
      var btn = e.target.closest("[data-choice]");
      if (!btn || !painterDialogueOpen) return;
      var choice = btn.getAttribute("data-choice");
      if (!choice) return;
      e.preventDefault();
      handlePainterChoice(choice);
    });
  }

  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 60);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildLevel57World(root);
  wallColliders.length = 0;
  var i;
  for (i = 0; i < world.colliders.length; i++) {
    wallColliders.push(world.colliders[i]);
  }
  interactRoots = world.interactRoots.slice();

  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.yaw = world.spawnYaw;

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
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 57 };
  });

  initBackroomsTemperature(57, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    updateLootToast(now);

    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }

    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = L57_WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !painterDialogueOpen) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders);
      });
    }

    refreshAimPick();
    updateInteractHint();
    updateCrosshair();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    syncLookUi();
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L57]", err);
  showError(err.message || String(err));
}

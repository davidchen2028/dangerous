/**
 * Backrooms Level 6 —「熄灯」
 * 确定性有限迷宫、声音引路、心理压力与维基出口。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
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
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { clearNightVision, isNightVisionActive } from "./backrooms-night-vision.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";
import { startGuardedRafLoop } from "./backrooms-frame-guard.js";
import {
  L6_STATE_KEY,
  L6_WALL_H,
  generateLevel6Layout,
  getLevel6LayoutSeed,
  getLevel6PathProgress,
  getNearbyLevel6WallColliders,
  isNearLevel6Feature,
  level6CellToWorld,
  resolveCircleAgainstLevel6Maze,
} from "./backrooms-level6-layout.js";
import { buildLevel6World } from "./backrooms-level6-world.js";
import {
  bindLevel6AudioOnGesture,
  playLevel6Hallucination,
  playLevel6Switch,
  stopLevel6Audio,
  updateLevel6Ocean,
} from "./backrooms-level6-audio.js";
import {
  chooseLevel6Interaction,
  getLevel6InteractionLabel,
  shouldTriggerLevel6Wire,
} from "./backrooms-level6-interaction.js";

const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;
const JUMP_SPEED = 7.5;
const AIM_MAX = 3.4;
const HALLUCINATION_MIN = 8;
const HALLUCINATION_SPAN = 13;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.7 },
});
const physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: L6_WALL_H,
};
const survivalEnv = { sprinting: false, sanityDrainPerSec: 0.04 };

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let layout = null;
let world = null;
let gfx = null;
let transitionLock = false;
let aimPick = null;
let switchUsed = false;
let wireTriggered = false;
let activeTime = 0;
let hallucinationTimer = HALLUCINATION_MIN;
let frameNo = 0;
let audioStoppedForDeath = false;
let darkOverlay = null;
let lastHintStage = -1;

function toast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 6 无法启动</strong></p><p>" + String(text) + "</p>";
}

function readState() {
  try {
    var raw = JSON.parse(sessionStorage.getItem(L6_STATE_KEY) || "{}");
    switchUsed = !!raw.switchUsed;
    wireTriggered = !!raw.wireTriggered;
  } catch (err) {
    switchUsed = false;
    wireTriggered = false;
  }
}

function writeState() {
  try {
    sessionStorage.setItem(
      L6_STATE_KEY,
      JSON.stringify({ switchUsed: switchUsed, wireTriggered: wireTriggered })
    );
  } catch (err) {
    /* storage unavailable */
  }
}

function ensureDarkOverlay() {
  if (darkOverlay) return darkOverlay;
  darkOverlay = document.createElement("div");
  darkOverlay.className = "backrooms-level6-darkness";
  darkOverlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(darkOverlay);
  return darkOverlay;
}

function uiBlocked() {
  return isInventoryOpen() || isTaskUiOpen();
}

function updateAim() {
  if (!camera || !world || uiBlocked() || transitionLock || !survival || survival.dead) {
    aimPick = null;
    return;
  }
  var every = Math.max(1, (gfx && gfx.aimPickEveryNFrames) || 2);
  if (frameNo % every !== 0) return;
  var ray = getCameraAimRay(camera, AIM_MAX);
  var nearby = getNearbyLevel6WallColliders(layout, fps.player.x, fps.player.z, 2);
  var wallBlock = raycastWallBlockDistance(
    ray.origin,
    ray.direction,
    AIM_MAX,
    nearby,
    0,
    L6_WALL_H
  );
  aimPick = pickCrosshairInteract(camera, world.interactRoots, AIM_MAX, wallBlock);
}

function aimedKind() {
  return aimPick && aimPick.data ? aimPick.data.kind || null : null;
}

function updateInteractionHint() {
  var kind = aimedKind();
  var hidden = !kind || uiBlocked() || transitionLock || !survival || survival.dead;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML =
        getLevel6InteractionLabel(kind, switchUsed) + " · 按 <kbd>Q</kbd> / 点击";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      uiBlocked() || !survival || survival.dead
    );
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function leaveLevel6(levelId, levelNumber, page, message) {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  stopLevel6Audio();
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelNumber(levelNumber);
  toast(message, 2800);
  window.setTimeout(function () {
    window.location.href = page;
  }, 650);
}

function interact() {
  var action = chooseLevel6Interaction(aimedKind(), {
    survival: survival,
    transitionLock: transitionLock,
    uiBlocked: uiBlocked(),
  });
  if (action === "exit_l5") {
    leaveLevel6("l5", 5, "backrooms-level5.html", "锅炉的震动重新穿过墙壁……");
  } else if (action === "exit_l7") {
    leaveLevel6("l7", 7, "backrooms-level7.html", "海浪声吞没黑暗；你沿楼梯向下走去……");
  } else if (action === "dead_switch") {
    playLevel6Switch();
    if (!switchUsed) {
      switchUsed = true;
      writeState();
      toast("咔哒。没有灯亮起。远处却有人模仿了这个声音。");
      window.setTimeout(function () {
        if (!transitionLock && survival && !survival.dead) playLevel6Switch();
      }, 1250);
    } else {
      toast("开关已经按下；黑暗没有改变。");
    }
  } else if (action === "iron_door") {
    toast("铁门冷得刺骨。通往 Level 129 的路径尚未稳定。");
  }
}

function updateTripWire() {
  if (
    !shouldTriggerLevel6Wire(
      layout,
      { wireTriggered: wireTriggered },
      fps.player.x,
      fps.player.z,
      isNearLevel6Feature
    )
  ) {
    return;
  }
  wireTriggered = true;
  writeState();
  leaveLevel6(
    "l6_1",
    "6.1",
    "backrooms-level6-1.html",
    "脚踝被电线绊住；地面骤然消失……"
  );
}

function updateAtmosphere(dt) {
  activeTime += dt;
  var progress = getLevel6PathProgress(layout, fps.player.x, fps.player.z);
  survivalEnv.sanityDrainPerSec =
    0.04 + Math.min(0.18, activeTime / 1500) + progress * 0.07;
  var stair = world.featurePositions.l7Stair;
  var dx = stair.x - fps.player.x;
  var dz = stair.z - fps.player.z;
  var targetAngle = Math.atan2(-dx, -dz);
  updateLevel6Ocean(progress, targetAngle, fps.yaw);

  hallucinationTimer -= dt * (1 + progress * 0.65);
  if (hallucinationTimer <= 0) {
    var r = Math.random();
    playLevel6Hallucination(
      r < 0.34 ? "breath" : r < 0.68 ? "whisper" : "steps",
      Math.random() * 2 - 1
    );
    hallucinationTimer = HALLUCINATION_MIN + Math.random() * HALLUCINATION_SPAN;
  }

  var pulse = Math.max(0, Math.sin(activeTime * 0.19) - 0.82) * (0.16 + progress * 0.22);
  ensureDarkOverlay().style.opacity = String(Math.min(0.72, 0.42 + pulse));

  var stage = progress > 0.72 ? 3 : progress > 0.4 ? 2 : activeTime > 35 ? 1 : 0;
  if (stage !== lastHintStage && hintEl) {
    lastHintStage = stage;
    if (stage === 0) {
      hintEl.textContent = "Level 6 · 熄灯 · 摸索狭窄走廊 · 所有光源均会失效";
    } else if (stage === 1) {
      hintEl.textContent = "黑暗中偶尔传来呼吸与碎步；不要相信模仿你声音的东西";
    } else if (stage === 2) {
      hintEl.textContent = "远处似乎有极微弱的海浪声；转动方向辨认它";
    } else {
      hintEl.textContent = "海浪声正在变近；楼梯井应该就在迷宫深处";
    }
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return uiBlocked();
    },
    onTapInteract: interact,
    onJump: function () {
      if (!transitionLock) tryBackroomsJump(fps, JUMP_SPEED);
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
        interact();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (
    !enforceLevelEntry("l6", function (yaw) {
      fps.yaw = yaw;
    })
  ) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l6", toast);
  readState();
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.26);
  camera = new THREE.PerspectiveCamera(
    76,
    window.innerWidth / window.innerHeight,
    0.05,
    16
  );
  gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  layout = generateLevel6Layout(getLevel6LayoutSeed());
  world = buildLevel6World(layout);
  scene.add(world.root);
  var spawn = level6CellToWorld(layout, layout.spawnCell.x, layout.spawnCell.z);
  fps.player.x = spawn.x;
  fps.player.z = spawn.z;
  fps.feetY = 0;
  fps.grounded = true;

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
      toast("杏仁水 · +15 血量 · +25 理智");
    },
    onNightVisionPotion: function () {
      toast("这里的黑暗吞没了夜视；药水没有被消耗。");
    },
  });
  if (isNightVisionActive()) {
    clearNightVision();
    toast("已有的夜视药效在进入 Level 6 时熄灭了。");
  }
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 6 };
  });
  initBackroomsTemperature(6, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  ensureDarkOverlay();
  bindLevel6AudioOnGesture();
  bindControls();
  window.addEventListener("pagehide", stopLevel6Audio, { once: true });
  toast("黑暗吞没了一切。所有光源在这里都会失效。", 4200);

  var clock = new THREE.Clock();
  startGuardedRafLoop({
    label: "Backrooms L6",
    showError: showError,
    tick: function () {
      frameNo += 1;
      var dt = Math.min(clock.getDelta(), 0.05);
      var now = performance.now();
      var moving = isBackroomsPlayerMoving(fps);
      var sprinting = isBackroomsSprintHeld(fps) && moving;
      var active = survival && !survival.dead && !transitionLock && !uiBlocked();

      if (active) {
        survivalEnv.sprinting = sprinting;
        survival.update(dt, survivalEnv);
        updateAtmosphere(dt);
      }
      updateBackroomsPlayerPhysics(fps, dt, physOpts);
      if (active) {
        var mul = sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
        moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
          return resolveCircleAgainstLevel6Maze(nx, nz, fps.player.radius, layout);
        });
        updateTripWire();
      }
      if (survival && survival.dead && !audioStoppedForDeath) {
        audioStoppedForDeath = true;
        stopLevel6Audio();
      }
      applyBackroomsCamera(fps, camera, EYE_HEIGHT);
      updateAim();
      updateInteractionHint();
      updateBackroomsTemperature(dt, now);
      updateBackroomsHeatDamage(survival, now);
      renderer.render(scene, camera);
    },
  });
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L6]", err);
  showError(err.message || String(err));
}

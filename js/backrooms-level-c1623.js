/**
 * Backrooms Level C-1623 — 二十里面有过量的三十。
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
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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
import {
  C1623_CEILING,
  C1623_ROAD_HALF,
  C1623_SPAWN,
  C1623_VOID_Z,
  getC1623Segment,
  isC1623LookUp,
  isC1623Void,
  stepC1623Segment,
  voidDirection,
} from "./backrooms-level-c1623-layout.js";
import { buildC1623World, updateC1623World } from "./backrooms-level-c1623-world.js?v=2";
import {
  bindC1623AudioOnGesture,
  stopC1623Audio,
  updateC1623Audio,
} from "./backrooms-level-c1623-audio.js?v=1";

const EYE_HEIGHT = 1.62;
const AIM_MAX = 5;
const FOG = 0x6a7a88;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const titleEl = document.querySelector(".backrooms-hud__title");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");

const _survCtx = { sprinting: false, sanityDrainPerSec: 0.03 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: C1623_CEILING, floorY: 0.08 };
const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: C1623_SPAWN.x, z: C1623_SPAWN.z, radius: 0.32, speed: 3.7 },
});

let renderer = null;
let camera = null;
let scene = null;
let world = null;
let survival = null;
let currentAimPick = null;
let transitionLock = false;
let segment = 0;
let shiftLock = 0;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level C-1623 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2800 });
}

function currentSegment() {
  return getC1623Segment(segment);
}

function syncHint() {
  var seg = currentSegment();
  if (titleEl) {
    titleEl.textContent = "Backrooms · Level C-1623 · " + seg.id + " · 生存难度 Σ";
  }
  if (!hintEl) return;
  hintEl.innerHTML =
    seg.id +
    " · 走进虚空换区段 · 向上突破是蓝色通道 · <kbd>WASD</kbd> · <kbd>Q</kbd> · <kbd>B</kbd>";
}

function applySegmentLook() {
  var seg = world.applySegment(segment);
  if (!scene) return;
  if (seg.flavor === "fire") {
    scene.background = new THREE.Color(0x3a1810);
    scene.fog.color.setHex(0x3a1810);
  } else if (seg.flavor === "plants") {
    scene.background = new THREE.Color(0x4a6a40);
    scene.fog.color.setHex(0x4a6a40);
  } else {
    var dusk = 0.42 + Math.abs(segment) * 0.007;
    var c = new THREE.Color().setHSL(0.58 - dusk * 0.08, 0.18, 0.48 - dusk * 0.12);
    scene.background = c;
    scene.fog.color.copy(c);
  }
  syncHint();
}

function leaveTo(pass, page, banner) {
  if (transitionLock) return;
  transitionLock = true;
  stopC1623Audio();
  saveBackroomsSurvival(survival);
  grantLevelPass(pass, fps.yaw);
  queueEnterLevelBanner(banner);
  window.setTimeout(function () {
    window.location.href = page;
  }, 520);
}

function exitUp() {
  showToast("路面从下面抽走。上面是蓝色。");
  leaveTo("blue_channel", "backrooms-blue-channel.html", "蓝色通道");
}

function tryDoor(door) {
  if (!door) return;
  if (!door.open) {
    showToast((door.note ? door.note + " · " : "") + door.label + " 出不去。");
    return;
  }
  showToast("二十把你送出这一段。");
  leaveTo(door.pass, door.page, door.label);
}

function inspect(data) {
  if (data.kind === "c1623_exit") {
    tryDoor(data.door);
    return;
  }
  if (data.kind === "c1623_base") {
    showToast("M.E.G. Prismriver。数据库里还没有这座基地。请随身带牌。");
    return;
  }
  if (data.kind === "c1623_twin") {
    showToast("那不是窃皮者。那是另一个二十上的你。");
  }
}

function interact() {
  if (transitionLock || !survival || survival.dead || isInventoryOpen() || isTaskUiOpen()) return;
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (data && data.kind === "c1623_exit") {
    tryDoor(data.door);
    return;
  }
  if (isC1623LookUp(fps.pitch)) {
    exitUp();
    return;
  }
  if (!data) return;
  inspect(data);
}

function refreshAim() {
  if (!camera || isInventoryOpen() || !interactRoots.length) {
    currentAimPick = null;
    return;
  }
  camera.updateMatrixWorld();
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function hintFor(data) {
  if (data.kind === "c1623_base") return "Prismriver 基地 · 按 <kbd>Q</kbd>";
  if (data.kind === "c1623_twin") return "另一个自己 · 按 <kbd>Q</kbd>";
  if (data.kind === "c1623_exit" && data.door) {
    return (
      data.door.label +
      (data.door.open ? " · 按 <kbd>Q</kbd> 离开" : " · 出不去 · 按 <kbd>Q</kbd>")
    );
  }
  return "";
}

function updateInteractUi() {
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  var lookUp = isC1623LookUp(fps.pitch) && !(data && data.kind === "c1623_exit");
  var hidden = isInventoryOpen() || !survival || survival.dead || (!data && !lookUp);
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML = lookUp ? "向上突破 · 按 <kbd>Q</kbd>" : hintFor(data);
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!(data || lookUp));
  }
}

function maybeShiftSegment() {
  if (transitionLock || shiftLock > 0 || !survival || survival.dead) return;
  var dir = voidDirection(fps.player.z);
  if (!dir) return;
  var next = stepC1623Segment(segment, dir);
  if (next.blocked) {
    fps.player.z = dir > 0 ? C1623_VOID_Z - 1.4 : -C1623_VOID_Z + 1.4;
    showToast("三十把这一侧切断了。");
    shiftLock = 0.45;
    return;
  }
  segment = next.index;
  fps.player.z = dir > 0 ? -C1623_VOID_Z + 2.1 : C1623_VOID_Z - 2.1;
  fps.player.x = Math.max(-2.4, Math.min(2.4, fps.player.x));
  applySegmentLook();
  var seg = currentSegment();
  showToast("你走进虚空，来到 " + seg.id + (seg.note ? " · " + seg.note : "") + "。");
  shiftLock = 0.7;
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
    onTapInteract: interact,
    onJump: function () {
      if (transitionLock) return;
      tryBackroomsJump(fps, 7.2);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        interact();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  try {
    if (
      !enforceLevelEntry("c1623", function (yaw) {
        if (Number.isFinite(yaw)) fps.yaw = yaw;
      })
    ) {
      window.location.replace("backrooms-level-sqrt2.html");
      return;
    }
  } catch (err) {
    window.location.replace("backrooms-level-sqrt2.html");
    return;
  }

  showEnterLevelBannerIfQueued();
  markLevelEntered("c1623", showToast);
  fps.feetY = 0.08;
  fps.grounded = true;
  if (!Number.isFinite(fps.yaw)) fps.yaw = 0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 12, 42);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 70);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevelC1623";
  scene.add(root);
  world = buildC1623World(root, {
    gfxLow: gfx.tier === "low",
    colliders: colliders,
    interactRoots: interactRoots,
  });

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
      showToast("杏仁水压不住二十的趋同。");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1623" };
  });
  initBackroomsTemperature("c1623", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  applySegmentLook();
  bindC1623AudioOnGesture();
  bindControls();
  window.addEventListener("pagehide", stopC1623Audio);
  showToast("沥青很硬。两端的蓝不是通道，是三十。");

  try {
    var debugFlag = new URLSearchParams(window.location.search).get("debug") || "";
    if (
      debugFlag === "1" ||
      debugFlag === "void" ||
      debugFlag === "exit" ||
      debugFlag === "up" ||
      debugFlag === "empty"
    ) {
      window.__c1623Debug = {
        setSegment: function (n) {
          segment = n;
          fps.player.x = C1623_SPAWN.x;
          fps.player.z = C1623_SPAWN.z;
          applySegmentLook();
          return window.__c1623Debug.state();
        },
        lookAtDoor: function () {
          fps.player.x = 2.2;
          fps.player.z = 3.15;
          fps.yaw = -Math.PI / 2;
          fps.pitch = 0.05;
          applyBackroomsCamera(fps, camera, EYE_HEIGHT);
          refreshAim();
          updateInteractUi();
          return window.__c1623Debug.state();
        },
        lookUp: function () {
          fps.pitch = 1.05;
          applyBackroomsCamera(fps, camera, EYE_HEIGHT);
          refreshAim();
          updateInteractUi();
          return window.__c1623Debug.state();
        },
        state: function () {
          var data = currentAimPick && currentAimPick.data ? currentAimPick.data : null;
          var seg = currentSegment();
          return {
            segment: segment,
            id: seg.id,
            doors: seg.doors.map(function (d) {
              return { label: d.label, open: d.open, pass: d.pass || "" };
            }),
            x: fps.player.x,
            z: fps.player.z,
            pitch: fps.pitch,
            lookUp: isC1623LookUp(fps.pitch),
            aim: data ? data.kind : null,
            errorHidden: !errorEl || errorEl.hidden,
          };
        },
      };
      window.setTimeout(function () {
        if (debugFlag === "exit") window.__c1623Debug.lookAtDoor();
        if (debugFlag === "void") fps.player.z = C1623_VOID_Z + 0.2;
        if (debugFlag === "up") window.__c1623Debug.lookUp();
        if (debugFlag === "empty") {
          window.__c1623Debug.setSegment(2);
          window.__c1623Debug.lookAtDoor();
        }
        document.body.dataset.c1623 = JSON.stringify(window.__c1623Debug.state());
      }, 600);
    }
  } catch (_dbg) {}

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var time = now * 0.001;
    var dt = Math.min(clock.getDelta(), 0.05);
    if (shiftLock > 0) shiftLock -= dt;
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    var inVoid = isC1623Void(fps.player.z);

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = inVoid ? 0.055 : 0.028;
      survival.update(dt, _survCtx);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        var z = Math.max(-C1623_ROAD_HALF + 0.2, Math.min(C1623_ROAD_HALF - 0.2, nz));
        return resolveBackroomsMoveCollisions(nx, z, fps.player.radius, colliders, 40);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAim();
    updateInteractUi();
    maybeShiftSegment();
    updateC1623World(world, time);
    updateC1623Audio(inVoid);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1623]", err);
  showError(err.message || String(err));
}

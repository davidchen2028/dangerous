/**
 * Backrooms Level 81 — 赋闲结局。办公室的喧嚣在旧毛毯上褪去。
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
import { L81_IMAGINARY, L81_IMAGINARY_STAND, L81_REST_SEC, L81_SPAWN, L81_WALL_H, isLevel81SitZone } from "./backrooms-level81-layout.js";
import { buildLevel81World, updateLevel81World } from "./backrooms-level81-world.js?v=9";
import {
  bindLevel81AudioOnGesture,
  startLevel81Audio,
  stopLevel81Audio,
  updateLevel81Audio,
} from "./backrooms-level81-audio.js?v=3";

const EYE_HEIGHT = 1.62;
const SIT_EYE = 1.02;
const AIM_MAX = 3.6;
const FOG = 0x2c241c;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");
const endingEl = document.getElementById("backroomsHomeEnding");
const rainEl = document.getElementById("backroomsL81Rain");

const _survCtx = { sprinting: false, sanityDrainPerSec: 0 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: L81_WALL_H, floorY: 0.12 };
const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: L81_SPAWN.x, z: L81_SPAWN.z, radius: 0.32, speed: 2.55 },
});

let renderer = null;
let camera = null;
let scene = null;
let world = null;
let survival = null;
let currentAimPick = null;
let sitting = false;
let restTimer = 0;
let ended = false;
let transitionLock = false;

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 81 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 3200 });
}

function hintForKind(kind, painting) {
  if (kind === "l81_sit") return "走到中间，找个毯子坐下 · 按 <kbd>Q</kbd>";
  if (kind === "l81_painting") {
    if (painting === "willow") return "低垂的柳叶，在溪水上悬挂 · 按 <kbd>Q</kbd>";
    if (painting === "sheep") return "羊群点缀的草原，像在做梦 · 按 <kbd>Q</kbd>";
    if (painting === "fireflies") return "色彩像萤火虫，在画布上跳舞 · 按 <kbd>Q</kbd>";
    return "褪色的蕾丝人偶，会不会梦到手织的绵羊 · 按 <kbd>Q</kbd>";
  }
  if (kind === "l81_doll") return "褪色的蕾丝人偶 · 按 <kbd>Q</kbd>";
  if (kind === "l81_lamp") return "台灯一下一下，点着疲惫的头 · 按 <kbd>Q</kbd>";
  if (kind === "l81_window") return "雨滴啪嗒啪嗒，落在窗上 · 按 <kbd>Q</kbd>";
  if (kind === "l81_imaginary") return "玻璃上凝着一个 <em>i</em> · 按 <kbd>Q</kbd>";
  if (kind === "l81_office") return "办公室的喧嚣已经褪尽";
  return "";
}

function syncHint() {
  if (!hintEl) return;
  hintEl.innerHTML = sitting
    ? "嘘。安心歇息吧 · 直到月亮为你报晓"
    : "压低脚步。循着花纹的针脚，走到中间坐下 · <kbd>WASD</kbd> · <kbd>Q</kbd> · <kbd>B</kbd>";
}

function triggerEnding() {
  if (ended) return;
  ended = true;
  stopLevel81Audio();
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  if (endingEl) endingEl.hidden = false;
  document.body.classList.add("backrooms-home-ending-open");
}

function sitDown() {
  if (sitting || ended) return;
  if (!isLevel81SitZone(fps.player.x, fps.player.z)) {
    showToast("再近一点，走到花纹正中间。");
    return;
  }
  sitting = true;
  fps.player.x = 0;
  fps.player.z = 0;
  fps.yaw = 0;
  fps.pitch = 0.08;
  startLevel81Audio();
  showToast("来吧——找个毯子坐下，靠近一点。");
  syncHint();
}

function inspect(data) {
  if (data.kind === "l81_sit") {
    sitDown();
    return;
  }
  if (data.kind === "l81_painting") {
    if (data.painting === "willow") showToast("柳叶低垂，溪水几乎不响。");
    else if (data.painting === "sheep") showToast("草原上的羊，像是睡进了画框。");
    else if (data.painting === "fireflies") showToast("颜色融化在一起，像萤火虫。");
    else showToast("人偶闭着眼。也许它在梦绵羊。");
    return;
  }
  if (data.kind === "l81_doll") {
    showToast("猜一猜，它会不会梦到手织的绵羊？");
    return;
  }
  if (data.kind === "l81_lamp") {
    showToast("台灯昏沉了，一下、一下，点着头。");
    return;
  }
  if (data.kind === "l81_window") {
    showToast("城市悄悄安静下来。雨还在玻璃上写字。");
    return;
  }
  if (data.kind === "l81_office") {
    showToast("办公室的喧嚣，已经留在门的另一边。");
  }
}

function enterSqrt2() {
  if (transitionLock || sitting || ended) return;
  transitionLock = true;
  stopLevel81Audio();
  showToast("虚数把房间撕开一条缝…");
  saveBackroomsSurvival(survival);
  grantLevelPass("sqrt2", fps.yaw);
  queueEnterLevelBanner("Level √2");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-sqrt2.html";
  }, 550);
}

function canSitNow() {
  return !sitting && !ended && isLevel81SitZone(fps.player.x, fps.player.z);
}

function interact() {
  if (ended || sitting || transitionLock || !survival || survival.dead || isInventoryOpen() || isTaskUiOpen()) return;
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (data && data.kind === "l81_imaginary") {
    enterSqrt2();
    return;
  }
  if (canSitNow()) {
    sitDown();
    return;
  }
  if (!data) return;
  inspect(data);
}

function aimImaginaryFallback() {
  if (!camera) return null;
  var origin = camera.position;
  var dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  var dx = L81_IMAGINARY.x - origin.x;
  var dy = L81_IMAGINARY.y - origin.y;
  var dz = L81_IMAGINARY.z - origin.z;
  var dist = Math.hypot(dx, dy, dz);
  if (dist > AIM_MAX || dist < 0.08) return null;
  var align = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
  if (align < 0.85) return null;
  return { data: { kind: "l81_imaginary" }, distance: dist };
}

function refreshAim() {
  if (!camera || isInventoryOpen() || sitting || ended || !interactRoots.length) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
  if (
    !currentAimPick ||
    currentAimPick.data.kind === "l81_window" ||
    currentAimPick.data.kind === "l81_sit"
  ) {
    var imag = aimImaginaryFallback();
    if (imag) currentAimPick = imag;
  }
}

function updateInteractUi() {
  var data = currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (!(data && data.kind === "l81_imaginary") && canSitNow()) data = { kind: "l81_sit" };
  var hidden = sitting || ended || isInventoryOpen() || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) interactHintEl.innerHTML = hintForKind(data.kind, data.painting);
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen() || sitting || ended);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen() || ended;
    },
    onTapInteract: interact,
    onJump: function () {
      if (sitting || ended) return;
      tryBackroomsJump(fps, 7.2);
    },
    onKeyDown: function (e) {
      if (ended) return true;
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
        if (sitting) return true;
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
      !enforceLevelEntry("l81", function () {})
    ) {
      window.location.replace("backrooms-level0.html");
      return;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return;
  }

  showEnterLevelBannerIfQueued();
  markLevelEntered("l81", showToast);
  fps.feetY = 0.12;
  fps.grounded = true;
  fps.yaw = 0;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 9, 26);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 40);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel81";
  scene.add(root);
  world = buildLevel81World(root, {
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
      showToast("杏仁水的甜味，很快被柠檬清香盖过。");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 81 };
  });
  initBackroomsTemperature(81, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  syncHint();
  bindLevel81AudioOnGesture();
  bindControls();
  window.addEventListener("pagehide", stopLevel81Audio);
  showToast("办公室的喧嚣，在柔软的旧毛毯上褪去。");

  try {
    var debugFlag = new URLSearchParams(window.location.search).get("debug") || "";
    if (debugFlag === "1" || debugFlag === "end" || debugFlag === "i") {
      window.__l81Debug = {
        sitAtCenter: function () {
          fps.player.x = 0;
          fps.player.z = 0;
          sitDown();
          return { sitting: sitting, x: fps.player.x, z: fps.player.z };
        },
        finishRest: function () {
          if (!sitting) {
            fps.player.x = 0;
            fps.player.z = 0;
            sitDown();
          }
          restTimer = L81_REST_SEC;
          triggerEnding();
          return { ended: ended };
        },
        lookAtImaginary: function () {
          fps.player.x = L81_IMAGINARY_STAND.x;
          fps.player.z = L81_IMAGINARY_STAND.z;
          fps.yaw = 0;
          var camY = fps.feetY + EYE_HEIGHT;
          var hz = Math.hypot(L81_IMAGINARY.x - fps.player.x, L81_IMAGINARY.z - fps.player.z) || 1;
          fps.pitch = -Math.atan2(camY - L81_IMAGINARY.y, hz);
          applyBackroomsCamera(fps, camera, EYE_HEIGHT);
          refreshAim();
          updateInteractUi();
          var hits = [];
          var dir = null;
          var imagPick = null;
          if (camera && interactRoots.length) {
            var worldDir = new THREE.Vector3();
            camera.getWorldDirection(worldDir);
            dir = [worldDir.x, worldDir.y, worldDir.z];
            var rc = new THREE.Raycaster();
            rc.setFromCamera(new THREE.Vector2(0, 0), camera);
            rc.near = 0.02;
            rc.far = AIM_MAX;
            var hs = rc.intersectObjects(interactRoots, true);
            var hi;
            for (hi = 0; hi < hs.length && hi < 6; hi++) {
              var kind = hs[hi].object.userData && hs[hi].object.userData.brInteract
                ? hs[hi].object.userData.brInteract.kind
                : "?";
              hits.push(kind + ":" + hs[hi].distance.toFixed(3));
            }
            for (hi = 0; hi < interactRoots.length; hi++) {
              if (interactRoots[hi].userData && interactRoots[hi].userData.brInteract &&
                  interactRoots[hi].userData.brInteract.kind === "l81_imaginary") {
                var p = interactRoots[hi].position;
                imagPick = [p.x, p.y, p.z];
              }
            }
          }
          var data = currentAimPick && currentAimPick.data ? currentAimPick.data : null;
          return {
            x: fps.player.x,
            z: fps.player.z,
            sitting: sitting,
            aim: data ? data.kind : null,
            dist: currentAimPick ? currentAimPick.distance : null,
            inSit: isLevel81SitZone(fps.player.x, fps.player.z),
            pitch: fps.pitch,
            camY: camera ? camera.position.y : null,
            hits: hits,
            picks: interactRoots.length,
            dir: dir,
            imagPick: imagPick,
          };
        },
        state: function () {
          var data = currentAimPick && currentAimPick.data ? currentAimPick.data : null;
          return {
            sitting: sitting,
            ended: ended,
            restTimer: restTimer,
            x: fps.player.x,
            z: fps.player.z,
            hint: hintEl ? hintEl.textContent : "",
            errorHidden: !errorEl || errorEl.hidden,
            error: errorEl ? errorEl.textContent : "",
            endingHidden: !endingEl || endingEl.hidden,
            aim: data ? data.kind : null,
            dist: currentAimPick ? currentAimPick.distance : null,
          };
        },
      };
      window.setTimeout(function () {
        var snap;
        if (debugFlag === "end") snap = window.__l81Debug.finishRest();
        else if (debugFlag === "i") snap = window.__l81Debug.lookAtImaginary();
        else snap = window.__l81Debug.sitAtCenter();
        var base = window.__l81Debug.state();
        document.body.dataset.l81 = JSON.stringify(Object.assign(base, snap || {}));
      }, 700);
    }
  } catch (_dbg) {}

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var time = now * 0.001;
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = !sitting && isBackroomsPlayerMoving(fps);
    var sprinting = !sitting && isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = 0;
      survival.update(dt, _survCtx);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if (
      !sitting &&
      !ended &&
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isTaskUiOpen() &&
      !transitionLock
    ) {
      var mul =
        survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, mul * 0.72, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 50);
      });
    }

    if (sitting && !ended) {
      restTimer += dt;
      fps.player.x = 0;
      fps.player.z = 0;
      if (rainEl) rainEl.style.opacity = String(0.22 + Math.min(0.35, restTimer / L81_REST_SEC) * 0.28);
      if (restTimer >= L81_REST_SEC) triggerEnding();
    } else if (rainEl) {
      rainEl.style.opacity = "0.08";
    }

    applyBackroomsCamera(fps, camera, sitting ? SIT_EYE : EYE_HEIGHT);
    refreshAim();
    updateInteractUi();
    updateLevel81World(world, time, sitting ? restTimer / L81_REST_SEC : 0, dt);
    updateLevel81Audio(now, sitting);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L81]", err);
  showError(err.message || String(err));
}

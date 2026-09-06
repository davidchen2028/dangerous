/**
 * Entity 81 — 电梯轿厢。按钮为等于层号的三角 / 对数算式。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
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
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";
import { startGuardedRafLoop } from "./backrooms-frame-guard.js";
import {
  E81_BUTTON_KIND,
  chooseEntity81CabinAction,
  getEntity81ButtonHint,
  getEntity81Host,
  getOrCreateEntity81Seed,
  pickEntity81Buttons,
  readEntity81Origin,
} from "./backrooms-entity81-catalog.js";
import { buildEntity81Interior, resolveEntity81CabinCircle } from "./backrooms-entity81-interior.js";

const EYE_HEIGHT = 1.62;
const BODY_HEIGHT = 1.82;
const JUMP_SPEED = 5.5;
const AIM_MAX = 2.4;
const LINES = [
  "……你看起来很平静。要去哪里？",
  "按钮上的式子都等于一个层号。算错也没关系，我会走对的。",
  "我可以用很多种语言说话。你现在这一种就很好。",
  "有些层会毁掉电梯。那些按钮我不会点亮。",
];

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
  player: { x: 0, z: 0.15, radius: 0.28, speed: 2.4 },
});
const physOpts = { gravity: DEFAULT_GRAVITY, bodyHeight: BODY_HEIGHT, ceilingY: 2.4 };
const survivalEnv = { sprinting: false, skipPassiveSanity: true, sanityDrainPerSec: 0 };

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let interior = null;
let buttons = [];
let originPass = "";
let host = null;
let transitionLock = false;
let aimPick = null;
let lineAt = 0;
let audioCtx = null;

function toast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>电梯无法启动</strong></p><p>" + String(text) + "</p>";
}

function uiBlocked() {
  return isInventoryOpen() || isTaskUiOpen();
}

function aimedData() {
  return aimPick && aimPick.data ? aimPick.data : null;
}

function buttonFromAim() {
  var data = aimedData();
  if (!data || data.kind !== E81_BUTTON_KIND) return null;
  return buttons[data.index] || null;
}

function ding() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch (err) {
    /* ignore */
  }
}

function leaveTo(pass, number, page, message) {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  ding();
  saveBackroomsSurvival(survival);
  grantLevelPass(pass, fps.yaw);
  if (number != null) queueEnterLevelNumber(number);
  toast(message, 2600);
  window.setTimeout(function () {
    window.location.href = page;
  }, 700);
}

function interact() {
  if (uiBlocked() || !survival || survival.dead) return;
  var data = aimedData();
  var button = buttonFromAim();
  var action = chooseEntity81CabinAction(data ? data.kind : null, button, {
    dead: !!(survival && survival.dead),
    transitionLock: transitionLock,
    uiBlocked: uiBlocked(),
  });
  if (action === "stay") {
    ding();
    toast("已经在这一层。门没有打开。");
  } else if (action === "travel" && button) {
    leaveTo(
      button.pass,
      button.number,
      button.page,
      "轿厢开始运行。式子 " + button.expr + " 指向 Level " + button.number + "。"
    );
  } else if (action === "return_origin" && host) {
    leaveTo(host.pass, host.number, host.page, "电梯门开向你来时的层级。");
  } else if (action === "talk") {
    toast(LINES[lineAt % LINES.length], 4200);
    lineAt += 1;
  }
}

function updateHint() {
  var data = aimedData();
  var hidden = !data || uiBlocked() || transitionLock || !survival || survival.dead;
  var text = "";
  if (!hidden) {
    if (data.kind === E81_BUTTON_KIND) text = getEntity81ButtonHint(buttonFromAim());
    else if (data.kind === "e81_door") text = "轿厢门 · 按 <kbd>Q</kbd> 返回来处";
    else if (data.kind === "e81_screen") text = "电梯 · 按 <kbd>Q</kbd> 交谈";
  }
  if (interactHintEl) {
    interactHintEl.hidden = !text;
    if (text) interactHintEl.innerHTML = text;
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", uiBlocked());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !!text);
  }
}

function init() {
  if (
    !enforceLevelEntry("e81", function (yaw) {
      fps.yaw = yaw;
    })
  ) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  originPass = readEntity81Origin();
  host = getEntity81Host(originPass);
  if (!host) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  buttons = pickEntity81Buttons(originPass, getOrCreateEntity81Seed());
  if (hintEl) {
    hintEl.textContent = "Entity 81 · 按钮是层号的三角或对数式 · 不要相信四则运算";
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(host.theme === "luxury" ? 0x0c0b09 : 0x050607);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 12);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  interior = buildEntity81Interior(buttons, host.theme);
  scene.add(interior.root);
  fps.yaw = Math.PI;
  fps.pitch = 0;
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
  });
  initBackroomsTemperature(host.number, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  toast("电梯门在身后合上。面板上没有层号，只有式子。", 3800);

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
  window.addEventListener(
    "pagehide",
    function () {
      if (audioCtx && audioCtx.close) audioCtx.close();
    },
    { once: true }
  );

  var clock = new THREE.Clock();
  startGuardedRafLoop({
    label: "Entity 81",
    showError: showError,
    tick: function () {
      var dt = Math.min(clock.getDelta(), 0.05);
      var now = performance.now();
      var moving = isBackroomsPlayerMoving(fps);
      var sprinting = isBackroomsSprintHeld(fps) && moving;
      var active = survival && !survival.dead && !transitionLock && !uiBlocked();
      if (active) {
        survivalEnv.sprinting = sprinting;
        survival.update(dt, survivalEnv);
      }
      updateBackroomsPlayerPhysics(fps, dt, physOpts);
      if (active) {
        moveBackroomsPlayer(fps, dt, 1, function (nx, nz) {
          return resolveEntity81CabinCircle(nx, nz, fps.player.radius);
        });
      }
      applyBackroomsCamera(fps, camera, EYE_HEIGHT);
      if (!uiBlocked() && !transitionLock && survival && !survival.dead) {
        aimPick = pickCrosshairInteract(camera, interior.interactRoots, AIM_MAX);
      } else {
        aimPick = null;
      }
      updateHint();
      updateBackroomsTemperature(dt, now);
      updateBackroomsHeatDamage(survival, now);
      renderer.render(scene, camera);
    },
  });
}

try {
  init();
} catch (err) {
  console.error("[Entity 81]", err);
  showError(err.message || String(err));
}

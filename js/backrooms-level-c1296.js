/**
 * Backrooms Level C-1296 — 0.1296%（死区）
 * 时间不流动，四处是超出仪器量程的白光，因此什么都观测不到。
 * 流浪者被定在原地，只能转动视线，视线里也只有白。无出口、无实体。
 * 致死的是这片真空本身：每秒 -2 血。笔记本不在层内。
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
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  createBackroomsFpsState,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
/** 时间真空抽走生命的速率：每秒 -2 血 */
const HP_DRAIN_PER_SEC = 2;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 0 },
});
fps.feetY = 0;
fps.grounded = true;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1296 无法启动</strong></p><p>" + String(text) + "</p>";
}

/** 没有任何可辨认的场景。白是清屏色，不是一座城。 */
function buildWhiteout() {
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0xffffff, 0.02, 0.4);
  scene.add(new THREE.AmbientLight(0xffffff, 4));
  var flood = new THREE.DirectionalLight(0xffffff, 6);
  flood.position.set(0, 1, 0);
  scene.add(flood);
}

/** 强光超出量程：温度计不能给出读数。 */
function blindInstruments() {
  if (tempRootEl) tempRootEl.classList.add("backrooms-temp--blind");
  if (tempValueEl) tempValueEl.textContent = "超出量程";
  if (tempFillEl) tempFillEl.style.width = "100%";
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
    // 时间真空：无法移动、无法跳跃。转动视线也看不到别的东西。
    onJump: function () {},
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
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1296", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1296", showToast);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 20);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  renderer.setClearColor(0xffffff, 1);
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer, 1);
  buildWhiteout();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1296" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {});
  // 强光下补给的效果无法被确认：喝下去，血量和理智保持原样。
  var useAlmondWater = window.__backroomsUseAlmondWater;
  window.__backroomsUseAlmondWater = function () {
    if (!survival) return;
    var hp = survival.hp;
    var sanity = survival.sanity;
    useAlmondWater();
    if (survival.hp === hp && survival.sanity === sanity) return;
    survival.hp = hp;
    survival.sanity = sanity;
    survival.refreshHud();
    showToast("没有变化。这里测不到喝下去之后发生了什么。");
  };
  initBackroomsTemperature("c1296", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  blindInstruments();
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1296 · 0.1296% · 生存难度 死区 · 无出口 · " +
      "时间真空 · 强光覆盖 · 无有效观测手段 · 无法动弹 · 每秒 -2 血";
  }
  bindControls();

  window.setTimeout(function () {
    showToast("时间停住了。白光盖过一切，什么都测不出来。", 5200);
  }, 700);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (survival && !survival.dead) {
      survival.update(dt, { sprinting: false, skipPassiveSanity: true });
      survival.takeDamage(HP_DRAIN_PER_SEC * dt);
    }

    // 时间真空：不推进位置。视角可以转，但场景不提供任何信息。
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    blindInstruments();
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1296]", err);
  showError(err.message || String(err));
}

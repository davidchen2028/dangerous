/**
 * Backrooms Level C-1296 — 0.1296%（死区）
 * 进入即坠入「时间真空」：整座城市彻底静止，流浪者也被冻结，无法动弹，
 * 只能眼睁睁看着凝滞的街景，体温与生命被真空一点点抽走——每秒 -2 血。
 * 无原生出口、无敌对实体：致死原因就是这片停摆的时间本身。
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
  player: { x: 0, z: 6, radius: 0.34, speed: 0 },
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
let elapsed = 0;

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1296 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(index, salt) {
  var n = Math.sin(index * 91.7 + salt * 233.3) * 43758.5453;
  return n - Math.floor(n);
}

/** 一栋带发光窗格的楼——时间真空里所有灯都凝在原地。 */
function makeBuilding(width, height, depth) {
  var group = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: 0x39404d, roughness: 0.9 })
  );
  body.position.y = height * 0.5;
  group.add(body);

  var winMat = new THREE.MeshBasicMaterial({ color: 0xffe6a6 });
  var winDark = new THREE.MeshStandardMaterial({ color: 0x1c2029, roughness: 0.7 });
  var cols = Math.max(2, Math.floor(width / 2));
  var rows = Math.max(3, Math.floor(height / 2.4));
  var geo = new THREE.PlaneGeometry(0.9, 1.1);
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var lit = seeded(r * 13 + c, width + height) > 0.45;
      var wx = -width * 0.5 + 1 + c * ((width - 2) / Math.max(1, cols - 1));
      var wy = 1.4 + r * ((height - 2) / Math.max(1, rows - 1));
      var win = new THREE.Mesh(geo, lit ? winMat : winDark);
      win.position.set(wx, wy, depth * 0.5 + 0.02);
      group.add(win);
    }
  }
  return group;
}

function buildFrozenCity() {
  var root = new THREE.Group();
  root.name = "BackroomsC1296City";
  scene.add(root);

  // 沥青路面 + 两侧人行道
  var road = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 120),
    new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  root.add(road);
  var sideMat = new THREE.MeshStandardMaterial({ color: 0x4a4d54, roughness: 0.98 });
  var sl = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 120), sideMat);
  sl.position.set(-10, 0.12, 0);
  root.add(sl);
  var sr = sl.clone();
  sr.position.x = 10;
  root.add(sr);

  // 道路中央的黄色分道线（静止）
  var lineMat = new THREE.MeshBasicMaterial({ color: 0xd9c04a });
  for (var m = -55; m <= 55; m += 8) {
    var dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.2), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, m);
    root.add(dash);
  }

  // 两排高矮不一的楼房
  var i;
  for (i = 0; i < 14; i++) {
    var z = -52 + i * 8;
    var hL = 10 + seeded(i, 1) * 22;
    var bL = makeBuilding(7 + seeded(i, 2) * 3, hL, 7);
    bL.position.set(-16 - seeded(i, 3) * 2, 0, z);
    root.add(bL);
    var hR = 10 + seeded(i, 4) * 22;
    var bR = makeBuilding(7 + seeded(i, 5) * 3, hR, 7);
    bR.position.set(16 + seeded(i, 6) * 2, 0, z);
    root.add(bR);
  }

  // 几盏凝固的路灯
  var poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2d32, roughness: 0.8 });
  var bulbMat = new THREE.MeshBasicMaterial({ color: 0xffdca0 });
  for (i = -40; i <= 40; i += 16) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6, 6), poleMat);
    pole.position.set(-7, 3, i);
    root.add(pole);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bulbMat);
    bulb.position.set(-7, 6, i);
    root.add(bulb);
    var lamp = new THREE.PointLight(0xffd79a, 0.6, 22, 2);
    lamp.position.set(-7, 6, i);
    root.add(lamp);
  }

  // 一辆停在路中的车（时间真空里彻底静止）
  var carBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.1, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x7a2f30, roughness: 0.6 })
  );
  carBody.position.set(2.4, 0.75, -4);
  root.add(carBody);
  var cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.8, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1d2129, roughness: 0.4 })
  );
  cabin.position.set(2.4, 1.5, -4);
  root.add(cabin);

  // 静滞、偏冷的城市天光
  root.add(new THREE.HemisphereLight(0x9fb2c8, 0x1a1c22, 0.7));
  var amb = new THREE.AmbientLight(0x6f7d92, 0.55);
  root.add(amb);
  var moon = new THREE.DirectionalLight(0xbcd0e6, 0.5);
  moon.position.set(-18, 40, 20);
  root.add(moon);
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
    // 时间真空：无法移动、无法跳跃，只能自由观察四周。
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
  scene.background = new THREE.Color(0x141821);
  scene.fog = new THREE.Fog(0x141821, 18, 90);
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildFrozenCity();

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
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水入喉的瞬间就被真空抽干，起不了作用。");
    },
  });
  initBackroomsTemperature("c1296", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1296 · 0.1296% · 生存难度 死区 · 无出口 · " +
      "时间真空：整座城市凝固，你无法动弹 · 每秒 -2 血";
  }
  bindControls();

  window.setTimeout(function () {
    showToast("时间在这里彻底停摆——你被冻在原地，动弹不得。", 5000);
  }, 700);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    if (survival && !survival.dead) {
      elapsed += dt;
      // 静止的死区不额外消耗理智，只由时间真空持续抽血。
      survival.update(dt, { sprinting: false, skipPassiveSanity: true });
      survival.takeDamage(HP_DRAIN_PER_SEC * dt);
    }

    // 时间真空：完全不推进玩家位置，仅保留自由视角。
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
  console.error("[Backrooms C-1296]", err);
  showError(err.message || String(err));
}

/**
 * Backrooms Level 5 — 恐怖旅馆。
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
  addItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  setBackroomsTemperatureZone,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { buildLevel5World } from "./backrooms-level5-world.js";
import { createLevel5EntityManager } from "./backrooms-level5-entities.js";
import { createLevel5Atmosphere } from "./backrooms-level5-atmosphere.js";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { enterEntity81Cabin } from "./backrooms-entity81-spawn.js";
import { E81_CALL_KIND, getEntity81CallHint } from "./backrooms-entity81-catalog.js";
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
import { L5_WALL_HEIGHT } from "./backrooms-level5-layout.js";
import { startGuardedRafLoop } from "./backrooms-frame-guard.js";

const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;
const JUMP_SPEED = 8;
const AIM_MAX = 3.8;
const LOBBY_FOG = 0x4a3026;
const BOILER_FOG = 0x171718;

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
  player: { x: 0, z: 3, radius: 0.33, speed: 4.05 },
});
const physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: L5_WALL_HEIGHT,
};
const survivalEnv = { sprinting: false, sanityDrainPerSec: 0 };

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let world = null;
let entities = null;
let atmosphere = null;
let firesalt = null;
let aimPick = null;
let environment = {
  zone: "lobby",
  spawnSafe: true,
  inSteam: false,
  sanityDrainPerSec: 0,
  movementMultiplier: 1,
};
let transitionLock = false;
let temperatureZone = 5;

function toast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2400 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 5 无法启动</strong></p><p>" + String(text) + "</p>";
}

function updateAim() {
  if (!camera || !world || !world.interactRoots.length) {
    aimPick = null;
    return;
  }
  var ray = getCameraAimRay(camera, AIM_MAX);
  var block = raycastWallBlockDistance(
    ray.origin,
    ray.direction,
    AIM_MAX,
    world.colliders,
    0,
    L5_WALL_HEIGHT
  );
  aimPick = pickCrosshairInteract(camera, world.interactRoots, AIM_MAX, block);
}

function aimData() {
  return aimPick && aimPick.data ? aimPick.data : null;
}

function updateInteractionHint() {
  if (!interactHintEl) return;
  var data = aimData();
  var text = "";
  if (data && data.kind === "l5_loot") {
    text = (data.name || "补给") + " · 按 <kbd>Q</kbd> 拾取";
  } else if (data && data.kind === "l5_record") {
    text = "褪色的旅馆记录 · 按 <kbd>Q</kbd> 阅读";
  } else if (data && data.kind === "l5_guest_door") {
    text = "客房 " + data.room + " · 按 <kbd>Q</kbd> 推门";
  } else if (data && data.kind === "l5_exit_l4") {
    text = "老式电梯 · 按 <kbd>Q</kbd> 返回 Level 4";
  } else if (data && data.kind === E81_CALL_KIND) {
    text = getEntity81CallHint();
  } else if (data && data.kind === "l5_exit_l6") {
    text = "没有灯的锅炉通道 · 按 <kbd>Q</kbd> 进入 Level 6";
  }
  interactHintEl.innerHTML = text;
  interactHintEl.hidden = !text || isInventoryOpen() || !survival || survival.dead;
}

function takeLoot(data) {
  var ok;
  if (data.itemId === "almond_water") {
    ok = survival.addAlmondWater(1) > 0;
  } else {
    ok = addItem({ id: data.itemId, name: data.name || "旅馆补给" });
  }
  if (!ok) {
    toast("背包已满。");
    return;
  }
  world.consumeLoot(data.id);
  toast("拾取 " + data.name);
}

function leaveTo(levelId, number, page, message) {
  if (transitionLock || !survival || survival.dead) return;
  transitionLock = true;
  if (entities) {
    if (entities.flushState) entities.flushState();
    entities.dispose();
    entities = null;
  }
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  queueEnterLevelNumber(number);
  toast(message, 2800);
  window.setTimeout(function () {
    window.location.href = page;
  }, 500);
}

function interact() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var data = aimData();
  if (!data) return;
  if (data.kind === "l5_loot") {
    takeLoot(data);
  } else if (data.kind === "l5_record") {
    toast(data.text, 6200);
  } else if (data.kind === "l5_guest_door") {
    var first = world.openGuestDoor(data.id);
    toast(
      first
        ? "门后仍是同一条走廊。房间里的床铺像刚有人睡过。"
        : "门又回到了关闭的位置，里面的摆设却换了方向。",
      4300
    );
  } else if (data.kind === "l5_exit_l4") {
    leaveTo("l4", 4, "backrooms-level4.html", "电梯缓慢上升，数字停在 4。");
  } else if (data.kind === E81_CALL_KIND) {
    enterEntity81Cabin("l5", fps.yaw);
  } else if (data.kind === "l5_exit_l6") {
    leaveTo("l6", 6, "backrooms-level6.html", "锅炉声消失了；前方只剩绝对的黑暗。");
  }
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
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
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

function initSurvival() {
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
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 5 };
  });
}

function updateZoneLook() {
  var boiler = environment.zone === "boiler";
  var nextTemperatureZone = boiler ? "5_boiler" : 5;
  if (nextTemperatureZone !== temperatureZone) {
    temperatureZone = nextTemperatureZone;
    setBackroomsTemperatureZone(temperatureZone);
  }
  var target = new THREE.Color(boiler ? BOILER_FOG : LOBBY_FOG);
  scene.fog.color.lerp(target, 0.04);
  if (scene.background && scene.background.isColor) {
    scene.background.copy(scene.fog.color);
  }
  if (hintEl) {
    var zoneName =
      environment.zone === "lobby"
        ? "豪华大厅（安全区）"
        : environment.zone === "boiler"
          ? "锅炉房"
          : "主厅与客房翼";
    hintEl.innerHTML =
      "Level 5 · 恐怖旅馆 · " + zoneName +
      " · <kbd>WASD</kbd> 移动 · <kbd>Q</kbd> 交互 · <kbd>B</kbd> 背包";
  }
}

function init() {
  if (!enforceLevelEntry("l5", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l5", toast);
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(LOBBY_FOG);
  scene.fog = new THREE.Fog(LOBBY_FOG, 9, 48);
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
  root.name = "BackroomsLevel5";
  scene.add(root);
  world = buildLevel5World(root, { gfxProfile: gfx });
  world.update(world.spawnX, world.spawnZ, performance.now());
  fps.player.x = world.spawnX;
  fps.player.z = world.spawnZ;
  fps.feetY = 0;
  fps.grounded = true;

  entities = createLevel5EntityManager(root, world.colliders);
  atmosphere = createLevel5Atmosphere(toast);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: toast,
  });
  initSurvival();
  initBackroomsTemperature(5, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  toast("猩红地毯向旅馆深处延伸。前台的登记簿上没有日期。", 5200);
  startLoop();
}

function startLoop() {
  var clock = new THREE.Clock();
  startGuardedRafLoop({
    label: "Backrooms L5",
    showError: showError,
    tick: function () {
      var dt = Math.min(clock.getDelta(), 0.05);
      var now = performance.now();
      environment = world.update(fps.player.x, fps.player.z, now);
      var mood = atmosphere.update(dt, now, environment, survival);
      var moving = isBackroomsPlayerMoving(fps);
      var sprinting = isBackroomsSprintHeld(fps) && moving;

      if (survival && !survival.dead) {
        survivalEnv.sprinting = sprinting;
        survivalEnv.sanityDrainPerSec = mood.sanityDrainPerSec;
        survival.update(dt, survivalEnv);
      }
      updateBackroomsPlayerPhysics(fps, dt, physOpts);
      if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen()) {
        var speedMul =
          survival && sprinting
            ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
            : 1;
        speedMul *= mood.movementMultiplier;
        moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
          return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, world.colliders, 10);
        });
      }
      if (entities && survival && !survival.dead) {
        entities.update(
          dt,
          fps.player.x,
          fps.player.z,
          survival,
          toast,
          world.getEntitySpawns(),
          environment,
          world.getSteamHazards()
        );
      }
      if (firesalt) firesalt.update(dt);
      updateAim();
      updateInteractionHint();
      updateZoneLook();
      if (crosshairEl) {
        var hidden = isInventoryOpen() || !survival || survival.dead;
        crosshairEl.classList.toggle("backrooms-crosshair--hidden", hidden);
        crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!aimPick);
      }
      applyBackroomsCamera(fps, camera, EYE_HEIGHT);
      updateBackroomsTemperature(dt, now);
      updateBackroomsHeatDamage(survival, now);
      renderer.render(scene, camera);
    },
  });
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L5]", err);
  showError(err.message || String(err));
}

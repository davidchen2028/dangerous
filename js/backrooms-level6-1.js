/**
 * Backrooms Level 6.1 — 零食室（可走完的一小圈商场餐厅）
 * 玻璃门走出去 → Level 11；铁门 → Level 6；通风管 → Level 3；弯曲墙 → 蓝色通道
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
  showEnterLevelBannerIfQueued,
  queueEnterLevelBanner,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  L61_GLASS,
  L61_RESTOCK_MS,
  L61_SPAWN,
  L61_STAFF_GIFT_ID,
  L61_STOCK_KEY,
  L61_WALL_H,
  isInsideGlassExit,
  isL61StockEmpty,
  readL61StockMap,
} from "./backrooms-level6-1-layout.js";
import { buildLevel61World } from "./backrooms-level6-1-world.js";

const AIM_MAX = 5;
const EYE_HEIGHT = 1.65;
const FOG_COLOR = 0xe4d4bc;

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
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");

const _survCtx = { sprinting: false, skipPassiveSanity: true, sanityDrainPerSec: 0 };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: L61_WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let transitionLock = false;
let glassDoorOpen = false;
let glassDoorPivot = null;
let glassDoorCollider = null;
let doorOpenT = 0;
let dialogueOpen = false;
let dialogueKind = "";
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
/** @type {Record<string, number>} */
let stock = {};
const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: L61_SPAWN.x, z: L61_SPAWN.z, radius: 0.32, speed: 4.05 },
});

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 6.1 无法启动</strong></p><p>" + msg + "</p>";
}

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function loadStock() {
  var raw = null;
  try {
    raw = JSON.parse(sessionStorage.getItem(L61_STOCK_KEY) || "{}");
  } catch (err) {
    raw = {};
  }
  stock = readL61StockMap(raw, Date.now(), L61_RESTOCK_MS);
}

function persistStock() {
  try {
    sessionStorage.setItem(L61_STOCK_KEY, JSON.stringify(stock));
  } catch (err) {
    /* ignore */
  }
}

function closeDialogue() {
  dialogueOpen = false;
  dialogueKind = "";
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function openDialogue(kind, speaker, text, choicesHtml) {
  if (!dialogueEl || !dialogueTextEl) return;
  dialogueOpen = true;
  dialogueKind = kind;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = speaker;
  dialogueTextEl.textContent = text;
  if (dialogueChoicesEl) {
    dialogueChoicesEl.hidden = false;
    dialogueChoicesEl.innerHTML = choicesHtml;
  }
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function choiceButtons(aLabel, bLabel) {
  return (
    '<button type="button" class="backrooms-dialogue__choice" data-l61-choice="a"><kbd>A</kbd> ' +
    aLabel +
    "</button>" +
    '<button type="button" class="backrooms-dialogue__choice" data-l61-choice="b"><kbd>B</kbd> ' +
    bLabel +
    "</button>"
  );
}

function tryStaffGift() {
  if (isL61StockEmpty(stock, L61_STAFF_GIFT_ID, Date.now(), L61_RESTOCK_MS)) {
    showToast("本周补货中");
    return;
  }
  if (!survival || !survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showToast("背包已满");
    return;
  }
  stock[L61_STAFF_GIFT_ID] = Date.now();
  persistStock();
  saveBackroomsSurvival(survival);
  showToast("不用付钱 · 杏仁水");
}

function handleDialogueChoice(choice) {
  var kind = dialogueKind;
  closeDialogue();
  if (kind === "staff" && choice === "a") {
    tryStaffGift();
    return;
  }
  if (kind === "meg" && choice === "a") {
    exitTo("l6", 6, "backrooms-level6.html", "你推开铁门。后面很黑，尖叫声更近了…");
  }
}

function openStaffTalk() {
  openDialogue(
    "staff",
    "零食室工作人员",
    "不用付钱。售货机和冰箱都是免费的，每周会补货。拿去吧。",
    choiceButtons("再要一瓶水", "谢谢")
  );
}

function openMegTalk() {
  openDialogue(
    "meg",
    "M.E.G. 看守",
    "未经准许不准过。铁门后面是 Level 6，很危险，门缝里还能听见尖叫。",
    choiceButtons("强行进入", "留下")
  );
}

function syncHint() {
  if (!hintEl) return;
  hintEl.innerHTML =
    "Level 6.1 零食室 · 玻璃门→11 · 铁门→6 · 通风管→3 · 弯曲墙→蓝 · <kbd>Q</kbd> <kbd>WASD</kbd> <kbd>B</kbd>";
}

function refreshAimPick() {
  if (!camera || isInventoryOpen() || dialogueOpen || !survival || survival.dead || transitionLock) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_MAX);
  var wallBlock = raycastWallBlockDistance(aim.origin, aim.direction, AIM_MAX, colliders, 0, L61_WALL_H);
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX, wallBlock);
}

function aimedData() {
  if (!currentAimPick || !currentAimPick.data) return null;
  if (currentAimPick.distance > AIM_MAX) return null;
  return currentAimPick.data;
}

function aimedKind() {
  var data = aimedData();
  return data ? data.kind || null : null;
}

function vendorEmpty(data) {
  return !!(data && data.id && isL61StockEmpty(stock, data.id, Date.now(), L61_RESTOCK_MS));
}

function updateInteractUi() {
  var data = aimedData();
  var kind = data ? data.kind : null;
  var hidden = isInventoryOpen() || dialogueOpen || !survival || survival.dead || transitionLock || !kind;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      if (kind === "l61_glass_door") {
        interactHintEl.innerHTML = glassDoorOpen ? "玻璃门已开 · 穿过门口" : "按 <kbd>Q</kbd> 打开玻璃门";
      } else if (kind === "l61_vent") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 爬进通风管";
      } else if (kind === "l61_c144_painting") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 切入画作";
      } else if (kind === "l61_iron_door" || kind === "l61_meg") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与 M.E.G. 看守说话";
      } else if (kind === "l61_blue_wall") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 走进弯曲的墙";
      } else if (kind === "l61_staff") {
        interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与柜台说话";
      } else if (kind === "l61_shutter") {
        interactHintEl.innerHTML = "卷帘落下 · 本周补货中";
      } else if (kind === "l61_jammed") {
        interactHintEl.innerHTML = "售货机堵死了过道";
      } else if (kind === "l61_vending" || kind === "l61_fridge" || kind === "l61_shelf") {
        interactHintEl.innerHTML = vendorEmpty(data)
          ? "本周补货中"
          : "按 <kbd>Q</kbd> 免费取走" + (data.itemName ? " · " + data.itemName : "");
      }
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      isInventoryOpen() || dialogueOpen || !survival || survival.dead
    );
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function exitTo(levelId, levelNumber, page, toast) {
  if (transitionLock) return;
  transitionLock = true;
  showToast(toast);
  saveBackroomsSurvival(survival);
  grantLevelPass(levelId, fps.yaw);
  if (levelId === "blue_channel") queueEnterLevelBanner("蓝色通道");
  else if (levelId === "c144") queueEnterLevelBanner("Level C-144");
  else queueEnterLevelNumber(levelNumber);
  window.setTimeout(function () {
    window.location.href = page;
  }, 650);
}

function openGlassDoor() {
  if (glassDoorOpen || transitionLock) return;
  glassDoorOpen = true;
  doorOpenT = 0;
  showToast("玻璃门滑开……");
  if (glassDoorCollider) {
    var idx = colliders.indexOf(glassDoorCollider);
    if (idx >= 0) colliders.splice(idx, 1);
    glassDoorCollider = null;
  }
}

function maybeWalkOutGlass() {
  if (!glassDoorOpen || transitionLock) return;
  if (isInsideGlassExit(fps.player.x, fps.player.z)) {
    exitTo("l11", 11, "backrooms-level11.html", "你穿过了玻璃门…");
  }
}

function tryFreeLoot(data) {
  if (!data || !data.id) return;
  if (isL61StockEmpty(stock, data.id, Date.now(), L61_RESTOCK_MS)) {
    showToast("本周补货中");
    return;
  }
  if (!survival || !survival.addItem({ id: data.item, name: data.itemName || data.item })) {
    showToast("背包已满");
    return;
  }
  stock[data.id] = Date.now();
  persistStock();
  saveBackroomsSurvival(survival);
  showToast("免费 · " + (data.itemName || data.item));
}

function tryQAction() {
  if (dialogueOpen) {
    handleDialogueChoice("b");
    return;
  }
  if (transitionLock || isInventoryOpen() || isTaskUiOpen() || !survival || survival.dead) return;
  var data = aimedData();
  if (!data) return;
  var kind = data.kind;
  if (kind === "l61_glass_door") {
    openGlassDoor();
    return;
  }
  if (kind === "l61_vent") {
    exitTo("l3", 3, "backrooms-level3.html", "你爬进通风管，身体不断下坠…");
    return;
  }
  if (kind === "l61_c144_painting") {
    exitTo("c144", "C-144", "backrooms-level-c144.html", "画布变得柔软，你从画中切了出去…");
    return;
  }
  if (kind === "l61_iron_door" || kind === "l61_meg") {
    openMegTalk();
    return;
  }
  if (kind === "l61_blue_wall") {
    exitTo("blue_channel", "蓝色通道", "backrooms-blue-channel.html", "墙面弯了过去，你踏进蓝色通道…");
    return;
  }
  if (kind === "l61_staff") {
    openStaffTalk();
    return;
  }
  if (kind === "l61_shutter" || kind === "l61_jammed") {
    showToast(kind === "l61_jammed" ? "售货机堵死了这条过道" : "本周补货中");
    return;
  }
  if (kind === "l61_vending" || kind === "l61_fridge" || kind === "l61_shelf") {
    tryFreeLoot(data);
  }
}

function bindDialogueClicks() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.addEventListener("click", function (event) {
    var btn = event.target && event.target.closest ? event.target.closest("[data-l61-choice]") : null;
    if (!btn) return;
    handleDialogueChoice(btn.getAttribute("data-l61-choice"));
  });
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || dialogueOpen || isTaskUiOpen();
    },
    onTapInteract: tryQAction,
    onJump: function () {
      tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (e) {
      if (dialogueOpen) {
        if (e.code === "KeyA" && !e.repeat) {
          e.preventDefault();
          handleDialogueChoice("a");
          return true;
        }
        if ((e.code === "KeyB" || e.code === "KeyQ" || e.code === "Escape") && !e.repeat) {
          e.preventDefault();
          handleDialogueChoice("b");
          return true;
        }
        return true;
      }
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

function init() {
  try {
    if (
      !enforceLevelEntry("l6_1", function (yaw) {
        fps.yaw = yaw;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return;
  }

  showEnterLevelBannerIfQueued();
  markLevelEntered("l6_1", showToast);
  loadStock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 12, 34);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 64);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel61";
  scene.add(root);
  var built = buildLevel61World(root, { colliders: colliders, interactRoots: interactRoots });
  glassDoorPivot = built.glassDoorPivot;
  glassDoorCollider = built.glassDoorCollider;

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
    return { level: 6.1 };
  });
  initBackroomsTemperature("6.1", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  syncHint();
  bindDialogueClicks();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = L61_WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);

    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !dialogueOpen &&
      !transitionLock &&
      !isTaskUiOpen()
    ) {
      var mul =
        survival && sprinting ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }

    if (glassDoorOpen && glassDoorPivot && doorOpenT < 1) {
      doorOpenT = Math.min(1, doorOpenT + dt * 1.5);
      glassDoorPivot.position.x = -L61_GLASS.halfW - doorOpenT * L61_GLASS.slide;
    }

    maybeWalkOutGlass();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAimPick();
    updateInteractUi();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L6.1]", err);
  showError(err.message || String(err));
}

/**
 * Backrooms Level 1 — 工业仓库 + 量子海盗宝箱 + 暴盲恐怖机制
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { createBackroomsHorrorSystem } from "./backrooms-horror.js";
import { rollAlmondWaterFromChest } from "./backrooms-chest-loot.js";
import {
  toggleBackpack,
  openBackpack,
  closeBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  addItem,
  setInventorySellMode,
  clearInventorySellPick,
  removeItemAt,
  removeFirstItem,
  countItem,
} from "./backrooms-inventory.js";
import {
  openBaseStorage,
  isBaseStorageOpen,
  wrapInventoryOpenHandler,
} from "./backrooms-base-storage.js?v=2";
import { getSellPrice } from "./backrooms-shop-prices.js";
import {
  tryBeginMerchantTrade,
  shouldGiveLuckyMerchantGift,
  getMerchantLockRemainingMs,
  getLuck,
} from "./backrooms-luck.js";
import {
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import {
  addMegPoints,
  getMegPoints,
  updateMegPointsDisplay,
} from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  buildBackroomsLevel1World,
  resolveClipEntrySpawn,
  WAREHOUSE_HEIGHT,
} from "./backrooms-level1-world.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevel1Entry, grantLevelPass } from "./backrooms-level-pass.js";
import { createHubRoute } from "./backrooms-hub-route.js";
import { getHpMax } from "./backrooms-royal-rations.js";
import { activateCanteenMealBuff } from "./backrooms-soy-milk.js";
import {
  resolveCircleAgainstColliders,
  raycastWallBlockDistance,
} from "./backrooms-collide.js";
import {
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
} from "./backrooms-fps-controller.js";
import {
  pickCrosshairInteract,
  getCameraAimRay,
} from "./backrooms-interact-aim.js";
import {
  defaultMegBaseSpawn,
  saveMegBaseCheckpoint,
  getMegSpawnFromCheckpoint,
  installMegCheckpointDeathHooks,
  mountMegSaveStatus,
  flashMegSaving,
  updateMegBaseAutoSave,
  consumeMegRespawnRedirectFlag,
  consumeL283MegExitFlag,
  applyMegDeathState,
  MEG_RESPAWN_FLAG,
} from "./backrooms-meg-checkpoint.js";
import { createLevel1_1ZoneManager } from "./backrooms-level1-1-zones.js";
import {
  handleTaskUiKey,
  isTaskUiOpen,
  markLevelEntered,
  isTaskAccepted,
  isTaskDelivered,
  isTaskCompleted,
  deliverPackageTask,
} from "./backrooms-tasks.js";
import {
  markLevel1_1ChestOpened,
  refreshLevel1_1_3OutpostChestsOnFirstL11Visit,
} from "./backrooms-level1-1-chests.js";
import { LEVEL1_1_WALL_H } from "./backrooms-level1-1-world.js";

const CHEST_LOOT_DISTANCE = 2.6;
const AIM_INTERACT_MAX = 4.5;
const AIM_NPC_MAX = 3.8;
const AIM_DOOR_MAX = 3.6;
const CHEST_AIM_RADIUS = CHEST_LOOT_DISTANCE + 0.35;

/** @type {THREE.Object3D[]} */
let aimInteractScratch = [];

const FOG_COLOR = 0x3a4a58;
const FOG_NEAR = 8;
const FOG_FAR = 42;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const searchHintEl = document.getElementById("backroomsSearchHint");
const blackoutHintEl = document.getElementById("backroomsBlackoutHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const talkHintEl = document.getElementById("backroomsTalkHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const interiorTalkHintEl = document.getElementById("backroomsInteriorTalkHint");
const level11HintEl = document.getElementById("backroomsLevel11Hint");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueImageEl = document.getElementById("backroomsDialogueImage");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");
const homeEndingEl = document.getElementById("backroomsHomeEnding");

let lootToastUntil = 0;
let spawnPoint = { x: 0, z: 0 };
/** @type {BackroomsSurvival | null} */
let survival = null;
/** @type {ReturnType<createBackroomsHorrorSystem> | null} */
let horror = null;

const LOOK_SENS = 0.0022;
const MOBILE_LOOK_SENS_MULT = 1.35;
const GRAVITY = 32;
const JUMP_SPEED = 9;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = {
  blackout: false,
  nearLandmark: false,
  sprinting: false,
  sanityDrainPerSec: 0,
};
const _physOpts = {
  gravity: GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: WAREHOUSE_HEIGHT,
};
const _physStub = { feetY: 0, velY: 0, grounded: true };

let renderer = null;
let camera = null;
let scene = null;
let firesalt = null;
/** @type {ReturnType<buildBackroomsLevel1World> | null} */
let level1World = null;
/** @type {ReturnType<createLevel1_1ZoneManager> | null} */
let level1_1Zones = null;
/** @type {THREE.Group | null} */
let level1Root = null;
/** @type {ReturnType<createHubRoute> | null} */
let hubRoute = null;
let hubEntering = false;
const wallColliders = [];
/** @type {Array<{ light: THREE.PointLight, panelMat: THREE.Material, baseIntensity: number, baseEmissive: number }>} */
let industrialLights = [];
let nextFlickerAt = 0;
let flickerUntil = 0;

const keys = Object.create(null);
const move = { forward: false, back: false, left: false, right: false };
let yaw = 0;
let pitch = 0;
let roll = 0;
let pointerLocked = false;
let useDragLook = false;
let lookDragId = null;
let lookLastX = 0;
let lookLastY = 0;
const player = { x: 0, z: 0, radius: 0.34, speed: 4.6 };
let feetY = 0;
let velY = 0;
let grounded = true;
/** @type {{ x: number, z: number, talkRadius: number } | null} */
let megGuideNpc = null;
let megDialogueOpen = false;
/** @type {"guide" | "trade" | "backdoor" | "level11" | "level11_tour" | null} */
let megDialogueKind = null;
let level11TourStep = 0;

const LEVEL1_1_SD_IMAGES = {
  variable: "img/backrooms/level1-1/sd-variable.png",
  class0: "img/backrooms/level1-1/sd-class0.png",
  class2: "img/backrooms/level1-1/sd-class2.png",
  class4: "img/backrooms/level1-1/sd-class4.png",
  deadzone: "img/backrooms/level1-1/sd-deadzone.png",
  na: "img/backrooms/level1-1/sd-na.png",
};
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;

/** 白色后门通道 → Level 2（过 1/4 自动转圈并卡入地板） */
let corridorL2FallState = "idle";
let corridorSpinAccum = 0;
let corridorSinkStartFeetY = 0;
const CORRIDOR_L2_PROGRESS = 0.25;
const CORRIDOR_L2_SPIN_YAW = Math.PI * 2;
const CORRIDOR_L2_SPIN_RATE = 3.4;
const CORRIDOR_L2_SINK_DEPTH = -1.08;
const CORRIDOR_L2_SINK_SPEED = 0.52;
const CORRIDOR_L2_PITCH_AMP = 0.85;
const CORRIDOR_L2_ROLL_AMP = 0.95;

/** 工业灯日常微闪烁（暴盲期间由 horror 系统暂停） */
function setPanelVisual(panelMat, on, intensityMul) {
  if (!panelMat) return;
  intensityMul = intensityMul == null ? 1 : intensityMul;
  if (panelMat.emissiveIntensity != null) {
    panelMat.emissiveIntensity = (on ? 0.85 : 0.08) * intensityMul;
    return;
  }
  if (panelMat.color) {
    panelMat.color.setHex(on ? 0xdff9fb : 0x2a3540);
  }
}

function runIndustrialMicroFlicker(now) {
  if (now >= nextFlickerAt) {
    flickerUntil = now + 200;
    nextFlickerAt = now + 10000 + Math.random() * 20000;
  }
  var flickering = now < flickerUntil;
  var i;
  for (i = 0; i < industrialLights.length; i++) {
    var f = industrialLights[i];
    var mul = flickering ? 0.08 + Math.random() * 0.35 : 1;
    if (f.light) f.light.intensity = f.baseIntensity * mul;
    setPanelVisual(f.panelMat, !flickering || mul > 0.35, mul);
  }
}

function showLootToast(text) {
  if (!lootToastEl) return;
  lootToastEl.textContent = text;
  lootToastEl.hidden = false;
  lootToastUntil = performance.now() + 2200;
}

function updateLootToast(now) {
  if (!lootToastEl || lootToastEl.hidden) return;
  if (now >= lootToastUntil) lootToastEl.hidden = true;
}

function isPlayerMoving() {
  return isBackroomsPlayerMoving({ move: move, keys: keys });
}

function isSprintHeld() {
  return isBackroomsSprintHeld({ move: move, keys: keys });
}

function respawnAtMegBase() {
  if (level1_1Zones && level1_1Zones.isActive()) {
    level1_1Zones.forceExitL1_1();
  }
  var sp = getMegSpawnFromCheckpoint();
  if (!sp && level1World && level1World.ensureMegBase) {
    sp = defaultMegBaseSpawn(level1World.ensureMegBase());
  }
  if (!sp) {
    player.x = spawnPoint.x;
    player.z = spawnPoint.z;
    yaw = 0;
  } else {
    player.x = sp.x;
    player.z = sp.z;
    yaw = sp.yaw != null ? sp.yaw : -Math.PI * 0.5;
  }
  feetY = 0;
  velY = 0;
  pitch = 0;
  roll = 0;
  depenetratePlayer(16);
  if (level1World) level1World.update(player.x, player.z);
}

function initSurvivalHud() {
  var megDeathReturn = false;
  try {
    megDeathReturn = sessionStorage.getItem(MEG_RESPAWN_FLAG) === "1";
  } catch (err) {
    megDeathReturn = false;
  }

  survival = new BackroomsSurvival();
  var hudHost = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(hudHost);
  mountMegSaveStatus(survival);
  if (!megDeathReturn) {
    loadBackroomsSurvival(survival);
  }
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(
    survival,
    function () {
      return {
        level: 1,
        isInMegBase: function () {
          return (
            !!level1World &&
            !!level1World.isInsideMegBaseInterior &&
            level1World.isInsideMegBaseInterior(player.x, player.z)
          );
        },
        getMegSpawn: function () {
          if (!level1World || !level1World.ensureMegBase) return null;
          return defaultMegBaseSpawn(level1World.ensureMegBase());
        },
      };
    },
    { onMegRespawn: respawnAtMegBase, refreshLevelPass: "clip", getLevelPassYaw: function () { return yaw; } }
  );
  setInventoryOpenHandler(
    wrapInventoryOpenHandler(function (open) {
      if (open && document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
    })
  );
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showLootToast("杏仁水 · +15 血量 · +25 理智");
    },
    onNightVisionPotion: function () {
      if (useNightVisionPotionFromBackpack()) {
        showLootToast("夜视药水 · 5 分钟夜视");
      }
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化 · 150 血 / 200 体");
    },
  });
}

function collectAimInteractRoots() {
  aimInteractScratch.length = 0;
  if (hubRoute && hubRoute.isActive()) {
    var hubRoots = hubRoute.getAimInteractRoots();
    for (var h = 0; h < hubRoots.length; h++) aimInteractScratch.push(hubRoots[h]);
  } else if (level1_1Zones && level1_1Zones.isActive()) {
    var level1_1Roots = level1_1Zones.getAimInteractRoots();
    var k;
    for (k = 0; k < level1_1Roots.length; k++) aimInteractScratch.push(level1_1Roots[k]);
  } else if (level1World && level1World.getAimInteractRoots) {
    var base = level1World.getAimInteractRoots();
    var j;
    for (j = 0; j < base.length; j++) aimInteractScratch.push(base[j]);
  }
  if (horror) {
    var chests = horror.getQuantumChests();
    var px = player.x;
    var pz = player.z;
    var r = CHEST_AIM_RADIUS;
    var r2 = r * r;
    var i;
    for (i = 0; i < chests.length; i++) {
      var c = chests[i];
      if (c.opened || !c.pickMesh) continue;
      var dx = c.x - px;
      var dz = c.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      aimInteractScratch.push(c.pickMesh);
    }
  }
  return aimInteractScratch;
}

function isHomeEndingActive() {
  return !!(level1_1Zones && level1_1Zones.isHomeEndingTriggered());
}

function triggerHomeEnding() {
  if (isHomeEndingActive()) return;
  if (homeEndingEl) homeEndingEl.hidden = false;
  document.body.classList.add("backrooms-home-ending-open");
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function refreshAimPick() {
  currentAimPick = null;
  if (!camera || isInventoryOpen() || megDialogueOpen || isHomeEndingActive()) return;
  if (!level1World && !(level1_1Zones && level1_1Zones.isActive())) return;
  if (!survival || survival.dead) return;

  var roots = collectAimInteractRoots();
  if (!roots.length) return;

  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    wallColliders,
    0,
    WAREHOUSE_HEIGHT
  );

  currentAimPick = pickCrosshairInteract(
    camera,
    roots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function getAimInteractData() {
  return currentAimPick ? currentAimPick.data : null;
}

function isAimKind(kind, role) {
  if (!currentAimPick || !currentAimPick.data) return false;
  var d = currentAimPick.data;
  if (d.kind !== kind) return false;
  if (role != null && d.role !== role) return false;
  if (kind === "chest" && currentAimPick.distance > CHEST_LOOT_DISTANCE) return false;
  if (kind === "meg_npc" && currentAimPick.distance > AIM_NPC_MAX) return false;
  if (kind === "meg_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_2_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_12_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_23_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_3_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  if (kind === "level1_1_34_door" && currentAimPick.distance > AIM_DOOR_MAX) return false;
  return true;
}

function findTargetChest() {
  if (!isAimKind("chest")) return null;
  var d = getAimInteractData();
  return d && d.chestEntry ? d.chestEntry : null;
}

function updateBlackoutHint(active) {
  if (!blackoutHintEl) return;
  blackoutHintEl.hidden = !active;
}

function updateChestSearchHint() {
  if (!searchHintEl) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    searchHintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    searchHintEl.hidden = true;
    return;
  }
  searchHintEl.hidden = !findTargetChest();
}

function updateCrosshair() {
  if (!crosshairEl) return;
  var hide =
    isInventoryOpen() ||
    megDialogueOpen ||
    isHomeEndingActive() ||
    !survival ||
    survival.dead ||
    (blackoutHintEl && !blackoutHintEl.hidden);
  crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
  crosshairEl.classList.toggle(
    "backrooms-crosshair--interact",
    !hide && (!!getAimInteractData() || isCorridorL2SequenceActive())
  );
}

function isNearMegGuide() {
  return isAimKind("meg_npc", "guide");
}

function isNearMegInteriorStaff() {
  return isAimKind("meg_npc", "trade");
}

function isNearMegBackDoorStaff() {
  return isAimKind("meg_npc", "backdoor");
}

function isNearMegLevel11Staff() {
  return isAimKind("meg_npc", "level11");
}

function isNearMegPackageReceiver() {
  return isAimKind("meg_npc", "package_receiver");
}

function isNearMegStorageClerk() {
  return isAimKind("meg_npc", "storage");
}

function syncPackageReceiverNpc() {
  if (!level1World || !level1World.setPackageReceiverVisible) return;
  level1World.setPackageReceiverVisible(
    isTaskAccepted("package_l1") &&
      !isTaskDelivered("package_l1") &&
      !isTaskCompleted("package_l1")
  );
}

function setDialogueImage(src) {
  if (!dialogueImageEl) return;
  if (!src) {
    dialogueImageEl.hidden = true;
    dialogueImageEl.removeAttribute("src");
    return;
  }
  dialogueImageEl.src = src;
  dialogueImageEl.hidden = false;
}

function setDialogueContinueQ() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = "按 <kbd>Q</kbd> 继续";
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

function focusMegDialogue() {
  if (!dialogueEl) return;
  dialogueEl.setAttribute("tabindex", "-1");
  try {
    dialogueEl.focus({ preventScroll: true });
  } catch (err) {
    dialogueEl.focus();
  }
}

function setDialogueChoicesLevel11() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    renderDialogueChoice("a", "想") +
    renderDialogueChoice("b", "不想") +
    renderDialogueChoice("c", "请介绍一下");
}

function openLevel11Dialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  if (refreshLevel1_1_3OutpostChestsOnFirstL11Visit() && level1_1Zones) {
    level1_1Zones.refreshChestVisuals();
  }
  megDialogueOpen = true;
  megDialogueKind = "level11";
  level11TourStep = 0;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 人员";
  dialogueTextEl.textContent = "你想去 Level 1.1 吗？";
  setDialogueImage(null);
  setDialogueChoicesLevel11();
  if (level11HintEl) level11HintEl.hidden = true;
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  focusMegDialogue();
}

function startLevel11IntroTour() {
  megDialogueKind = "level11_tour";
  level11TourStep = 0;
  applyLevel11TourStep();
}

/** Level 1.1 介绍分步（按 Q 推进：文案 → 图 → 文案 → 图 …） */
function applyLevel11TourStep() {
  if (!dialogueTextEl) return;
  var step = level11TourStep;
  if (step === 0) {
    dialogueTextEl.textContent =
      "Level 1.1（腐败的走廊）有五个区域，总体生存难度为「变化」。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 1) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.variable);
    setDialogueContinueQ();
    return;
  }
  if (step === 2) {
    dialogueTextEl.textContent = "第一个区域（洁白走廊）生存难度为等级 0。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 3) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.class0);
    setDialogueContinueQ();
    return;
  }
  if (step === 4) {
    dialogueTextEl.textContent = "第二个区域（错乱走廊）生存难度为等级 2。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 5) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.class2);
    setDialogueContinueQ();
    return;
  }
  if (step === 6) {
    dialogueTextEl.textContent = "第三个区域（蒙黑走廊）生存难度为等级 4。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 7) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.class4);
    setDialogueContinueQ();
    return;
  }
  if (step === 8) {
    dialogueTextEl.textContent = "第四个区域（扭曲走廊）生存难度为「死区」。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 9) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.deadzone);
    setDialogueContinueQ();
    return;
  }
  if (step === 10) {
    dialogueTextEl.textContent = "第五个区域（虚无走廊）生存难度为「不适用」。";
    setDialogueImage(null);
    setDialogueContinueQ();
    return;
  }
  if (step === 11) {
    dialogueTextEl.textContent = "";
    setDialogueImage(LEVEL1_1_SD_IMAGES.na);
    setDialogueContinueQ();
    return;
  }
  closeMegDialogue();
}

function advanceLevel11Tour() {
  if (megDialogueKind !== "level11_tour") return;
  level11TourStep += 1;
  applyLevel11TourStep();
}

function megDialogueChooseLevel11(choice) {
  if (choice === "a") {
    var entered = false;
    var enterError = false;
    try {
      entered = !!(level1_1Zones && level1_1Zones.enterFromMeg());
    } catch (err) {
      enterError = true;
      console.error("enterFromMeg failed", err);
    } finally {
      closeMegDialogue();
    }
    if (entered) {
      for (var i = 0; i < 16; i++) depenetratePlayer(20);
      return;
    }
    showLootToast(enterError ? "进入 1.1 失败，请重试" : "无法进入 1.1");
    return;
  }
  if (choice === "b") {
    closeMegDialogue();
    return;
  }
  if (choice === "c") {
    startLevel11IntroTour();
  }
}

function handleMegDialogueChoice(choice) {
  if (!megDialogueOpen || !choice) return;
  if (megDialogueKind === "level11" || megDialogueKind === "level11_tour") {
    megDialogueChooseLevel11(choice);
    return;
  }
  if (choice === "a") megDialogueChoose(true);
  else if (choice === "b") megDialogueChoose(false);
}

function setDialogueChoicesGuide() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    renderDialogueChoice("a", "想") + renderDialogueChoice("b", "算了");
}

function setDialogueChoicesDismiss() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = renderDialogueChoice("b", "知道了");
}

function openMegGuideDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  megDialogueOpen = true;
  megDialogueKind = "guide";
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 人员";
  dialogueTextEl.textContent = "你好，想去meg基地吗？";
  setDialogueChoicesGuide();
  if (talkHintEl) talkHintEl.hidden = true;
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  focusMegDialogue();
}

function openPackageReceiverDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  var result = deliverPackageTask("package_l1");
  if (!result.ok) {
    showLootToast(result.reason || "无法交付包裹");
    return;
  }
  syncPackageReceiverNpc();
  megDialogueOpen = true;
  megDialogueKind = "package_receiver";
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 收件员";
  dialogueTextEl.textContent = "把包裹给我吧。";
  setDialogueChoicesDismiss();
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  focusMegDialogue();
}

/** @type {null | { source: "backpack" | "hotbar", index: number, id: string, name: string, price: number }} */
let pendingSale = null;
let bulkSellPromptEl = null;
let bulkSellPromptTimer = null;

function clearBulkSellPrompt() {
  if (bulkSellPromptTimer) {
    clearTimeout(bulkSellPromptTimer);
    bulkSellPromptTimer = null;
  }
  if (bulkSellPromptEl) {
    bulkSellPromptEl.remove();
    bulkSellPromptEl = null;
  }
}

function showBulkSellPrompt(itemId, itemName, unitPrice) {
  clearBulkSellPrompt();
  var remaining = countItem(itemId);
  if (remaining < 2) return;
  var prompt = document.createElement("div");
  prompt.setAttribute("role", "button");
  prompt.setAttribute("tabindex", "0");
  prompt.style.cssText =
    "position:fixed;left:16px;top:16px;z-index:160;max-width:min(360px,82vw);" +
    "padding:12px 15px;border:1px solid rgba(255,212,121,.75);border-radius:9px;" +
    "background:rgba(15,18,22,.94);color:#ffe6ad;font:14px/1.55 system-ui,sans-serif;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.45);cursor:pointer;user-select:none;";
  prompt.textContent =
    "是否出售所有「" +
    itemName +
    "」？背包和快捷栏还剩 " +
    remaining +
    " 个，鼠标双击此处全部售出。";
  prompt.addEventListener("dblclick", function () {
    if (megDialogueKind !== "trade") return;
    var sold = 0;
    while (countItem(itemId) > 0 && removeFirstItem(itemId)) sold++;
    if (sold < 1) {
      clearBulkSellPrompt();
      return;
    }
    var total = sold * unitPrice;
    addMegPoints(total);
    updateMegPointsDisplay(megPointsEl);
    if (survival) survival.refreshHud();
    showLootToast("全部售出 " + itemName + " ×" + sold + " · +" + total + " 积分点");
    showSellPrompt("已售出所有「" + itemName + "」。");
    clearBulkSellPrompt();
  });
  document.body.appendChild(prompt);
  bulkSellPromptEl = prompt;
  bulkSellPromptTimer = window.setTimeout(clearBulkSellPrompt, 8000);
}

function setDialogueChoicesSellIdle() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = renderDialogueChoice("b", "离开");
}

function setDialogueChoicesSellConfirm() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    renderDialogueChoice("a", "确认出售") + renderDialogueChoice("b", "离开");
}

function sellPromptText(note) {
  return (
    (note ? note + " " : "") +
    "在背包或快捷栏里点一下要出手的东西，我给你报价。（当前积分点：" +
    getMegPoints() +
    "）"
  );
}

function showSellPrompt(note) {
  pendingSale = null;
  clearInventorySellPick();
  if (dialogueTextEl) dialogueTextEl.textContent = sellPromptText(note);
  setDialogueChoicesSellIdle();
}

function onSellItemPicked(item, source, index) {
  if (megDialogueKind !== "trade") return;
  clearBulkSellPrompt();
  var price = getSellPrice(item.id);
  if (price == null) {
    pendingSale = null;
    clearInventorySellPick();
    if (dialogueTextEl) {
      dialogueTextEl.textContent = "「" + item.name + "」这东西我们不收，换别的吧。";
    }
    setDialogueChoicesSellIdle();
    return;
  }
  pendingSale = {
    source: source,
    index: index,
    id: item.id,
    name: item.name,
    price: price,
  };
  if (dialogueTextEl) {
    dialogueTextEl.textContent =
      "「" + item.name + "」我出 " + price + " 积分点。按 A 确认成交。";
  }
  setDialogueChoicesSellConfirm();
}

function confirmSellPendingItem() {
  if (!pendingSale) {
    showSellPrompt("先挑一件东西。");
    return;
  }
  var deal = pendingSale;
  var removed = removeItemAt(deal.source, deal.index);
  if (!removed || removed.id !== deal.id) {
    showSellPrompt("这件东西不在原来的位置了。");
    return;
  }
  addMegPoints(deal.price);
  updateMegPointsDisplay(megPointsEl);
  if (survival) survival.refreshHud();
  showLootToast("售出 " + deal.name + " · +" + deal.price + " 积分点");
  var giftNote = "";
  if (shouldGiveLuckyMerchantGift()) {
    var gift =
      Math.random() < 0.5
        ? { id: "almond_water", name: "杏仁水" }
        : { id: "fire_salt", name: "小块可爆炸火盐" };
    if (addItem(gift)) giftNote = " 看你今天运气不错，再送你一份" + gift.name + "。";
  }
  showSellPrompt("成交。" + giftNote);
  showBulkSellPrompt(deal.id, deal.name, deal.price);
}

function openMegTradeDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  if (!tryBeginMerchantTrade()) {
    var seconds = Math.ceil(getMerchantLockRemainingMs() / 1000);
    showLootToast(
      "商人厌恶地避开了你，拒绝进行任何买卖 · " + seconds + " 秒后再试"
    );
    return;
  }
  megDialogueOpen = true;
  megDialogueKind = "trade";
  pendingSale = null;
  document.body.classList.add("backrooms-dialogue-open");
  document.body.classList.add("backrooms-shop-sell");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 工作人员";
  setInventorySellMode(onSellItemPicked);
  openBackpack();
  showSellPrompt("你好，物资我都收。");
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function openMegBackDoorStaffDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  megDialogueOpen = true;
  megDialogueKind = "backdoor";
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 工作人员";
  var gavePotion = tryGiveMegBackDoorNightVisionPotion();
  var alreadyGave = false;
  try {
    alreadyGave = sessionStorage.getItem(MEG_NV_POTION_GIVEN_KEY) === "1";
  } catch (err) {
    alreadyGave = false;
  }
  if (gavePotion) {
    tryGiveMegBackDoorAlmondWater();
    dialogueTextEl.textContent =
      "可以打开后门然后进去。这瓶夜视药水你拿着，在背包里双击使用，大约 5 分钟内能看清暗处。";
  } else if (alreadyGave) {
    tryGiveMegBackDoorAlmondWater();
    dialogueTextEl.textContent =
      "可以打开后门然后进去。夜视药水在背包里，双击即可使用。";
  } else {
    dialogueTextEl.textContent = "可以打开后门然后进去。";
  }
  setDialogueChoicesDismiss();
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (doorHintEl) doorHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  focusMegDialogue();
}

function tryGiveMegBackDoorNightVisionPotion() {
  try {
    if (sessionStorage.getItem(MEG_NV_POTION_GIVEN_KEY) === "1") return false;
  } catch (err) {
    /* ignore */
  }
  if (
    !addItem({
      id: "night_vision_potion",
      name: "夜视药水",
    })
  ) {
    showLootToast("背包已满，无法领取夜视药水");
    return false;
  }
  try {
    sessionStorage.setItem(MEG_NV_POTION_GIVEN_KEY, "1");
  } catch (err) {
    /* ignore */
  }
  showLootToast("获得夜视药水 ×1");
  return true;
}

function tryGiveMegBackDoorAlmondWater() {
  try {
    if (sessionStorage.getItem(MEG_NV_ALMOND_GIVEN_KEY) === "1") return false;
  } catch (err) {
    /* ignore */
  }
  if (!survival) return false;
  var added = survival.addAlmondWater(2);
  if (added <= 0) {
    showLootToast("背包已满，无法领取杏仁水");
    return false;
  }
  try {
    sessionStorage.setItem(MEG_NV_ALMOND_GIVEN_KEY, "1");
  } catch (err2) {
    /* ignore */
  }
  showLootToast("获得杏仁水 ×" + added);
  return true;
}

function closeMegDialogue() {
  var wasSelling = megDialogueKind === "trade";
  megDialogueOpen = false;
  megDialogueKind = null;
  level11TourStep = 0;
  pendingSale = null;
  clearBulkSellPrompt();
  setDialogueImage(null);
  document.body.classList.remove("backrooms-dialogue-open");
  if (wasSelling) {
    document.body.classList.remove("backrooms-shop-sell");
    setInventorySellMode(null);
    closeBackpack();
  }
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function teleportToMegBase() {
  if (!level1World || !level1World.ensureMegBase) return;
  var center = level1World.ensureMegBase();
  player.x = center.x - 9;
  player.z = center.z;
  yaw = -Math.PI * 0.5;
  pitch = 0.1;
  feetY = 0;
  velY = 0;
  saveMegBaseCheckpoint(defaultMegBaseSpawn(center));
  flashMegSaving(survival);
  depenetratePlayer(20);
  if (level1World) level1World.update(player.x, player.z);
}

function megDialogueChoose(wantYes) {
  if (megDialogueKind === "level11" || megDialogueKind === "level11_tour") {
    return;
  }
  if (megDialogueKind === "guide") {
    closeMegDialogue();
    if (wantYes) teleportToMegBase();
    return;
  }
  if (megDialogueKind === "trade") {
    if (wantYes) confirmSellPendingItem();
    else closeMegDialogue();
    return;
  }
  if (megDialogueKind === "backdoor") {
    closeMegDialogue();
    return;
  }
  if (megDialogueKind === "package_receiver") {
    closeMegDialogue();
    return;
  }
  closeMegDialogue();
}

function isAimingLevel1_1WallForCut() {
  if (!level1_1Zones || !level1_1Zones.isActive() || !level1_1Zones.isWallCutSubZone()) {
    return false;
  }
  if (megDialogueOpen || isInventoryOpen() || !camera || !survival || survival.dead) {
    return false;
  }
  if (currentAimPick) return false;
  var aim = getCameraAimRay(camera, 5.5);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    5.5,
    wallColliders,
    0,
    LEVEL1_1_WALL_H
  );
  return wallBlock != null && wallBlock <= 5.2;
}

function tryMegQAction() {
  if (megDialogueOpen || isInventoryOpen() || isBaseStorageOpen() || isHomeEndingActive()) return;
  if (!survival || survival.dead) return;
  if (hubRoute && hubRoute.isActive()) {
    if (hubRoute.handleDoor(getAimInteractData())) return;
  }
  if (level1_1Zones && level1_1Zones.isActive()) {
    if (isAimingLevel1_1WallForCut()) {
      if (level1_1Zones.tryWallCutExit()) return;
    }
    if (
      level1_1Zones.getSubZone() === "outpost" &&
      level1_1Zones.tryReturnToCorridor(player.x, player.z)
    ) {
      return;
    }
    if (
      level1_1Zones.getSubZone() === "outpost2" &&
      level1_1Zones.tryReturnToCorridor2(player.x, player.z)
    ) {
      return;
    }
    if (
      level1_1Zones.getSubZone() === "outpost3" &&
      level1_1Zones.tryReturnToCorridor3(player.x, player.z)
    ) {
      return;
    }
    if (
      level1_1Zones.getSubZone() === "corridor" &&
      level1_1Zones.tryEnterOutpost(player.x, player.z)
    ) {
      return;
    }
    if (
      level1_1Zones.getSubZone() === "corridor2" &&
      level1_1Zones.tryEnterOutpost2(player.x, player.z)
    ) {
      return;
    }
    if (
      level1_1Zones.getSubZone() === "corridor3" &&
      level1_1Zones.tryEnterOutpost3(player.x, player.z)
    ) {
      return;
    }
    if (isAimKind("level1_1_door")) {
      if (level1_1Zones.tryOpenOutpostDoor(player.x, player.z, true)) return;
    } else if (level1_1Zones.isNearOutpostDoor(player.x, player.z)) {
      if (level1_1Zones.tryOpenOutpostDoor(player.x, player.z, false)) return;
    }
    if (isAimKind("level1_1_12_door")) {
      if (level1_1Zones.tryOpenCorridor12Door(player.x, player.z, true)) return;
    } else if (level1_1Zones.isNearCorridor12Door(player.x, player.z)) {
      if (level1_1Zones.tryOpenCorridor12Door(player.x, player.z, false)) return;
    }
    if (isAimKind("level1_1_2_door")) {
      if (level1_1Zones.tryOpenOutpost2Door(player.x, player.z, true)) return;
    } else if (level1_1Zones.isNearOutpost2Door(player.x, player.z)) {
      if (level1_1Zones.tryOpenOutpost2Door(player.x, player.z, false)) return;
    }
    if (isAimKind("level1_1_23_door")) {
      if (level1_1Zones.tryOpenCorridor23Door(player.x, player.z, true)) return;
      if (level1_1Zones.tryEnterCorridor3AtDoor()) return;
    } else if (level1_1Zones.isNearCorridor23Door(player.x, player.z)) {
      if (level1_1Zones.tryOpenCorridor23Door(player.x, player.z, false)) return;
      if (level1_1Zones.tryEnterCorridor3AtDoor()) return;
    }
    if (isAimKind("level1_1_3_door")) {
      if (level1_1Zones.tryOpenOutpost3Door(player.x, player.z, true)) return;
    } else if (level1_1Zones.isNearOutpost3Door(player.x, player.z)) {
      if (level1_1Zones.tryOpenOutpost3Door(player.x, player.z, false)) return;
    }
    if (isAimKind("level1_1_34_door")) {
      if (level1_1Zones.tryOpenCorridor14Door(player.x, player.z, true)) return;
    } else if (level1_1Zones.isNearCorridor14Door(player.x, player.z)) {
      if (level1_1Zones.tryOpenCorridor14Door(player.x, player.z, false)) return;
    }
    return;
  }
  if (isNearMegPackageReceiver()) {
    openPackageReceiverDialogue();
    return;
  }
  if (isNearMegStorageClerk()) {
    openBaseStorage({ toast: true });
    return;
  }
  if (isNearMegGuide()) {
    openMegGuideDialogue();
    return;
  }
  if (isNearMegBackDoorStaff()) {
    openMegBackDoorStaffDialogue();
    return;
  }
  if (isNearMegInteriorStaff()) {
    openMegTradeDialogue();
    return;
  }
  if (isNearMegLevel11Staff()) {
    openLevel11Dialogue();
    return;
  }
  if (level1World) {
    if (
      isAimKind("meg_door", undefined) &&
      getAimInteractData().which === "front" &&
      level1World.tryOpenMegFrontDoorAim
    ) {
      if (level1World.tryOpenMegFrontDoorAim()) return;
    }
    if (
      isAimKind("meg_door", undefined) &&
      getAimInteractData().which === "back" &&
      level1World.openMegBackDoorByAim
    ) {
      if (level1World.openMegBackDoorByAim()) return;
    }
  }
}

function tryMegTalk() {
  tryMegQAction();
}

function updateMegTalkHint() {
  if (!talkHintEl || megDialogueOpen) return;
  if (level1_1Zones && level1_1Zones.isActive()) {
    talkHintEl.hidden = true;
    return;
  }
  if (isInventoryOpen() || !survival || survival.dead) {
    talkHintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    talkHintEl.hidden = true;
    return;
  }
  talkHintEl.hidden = !isNearMegGuide();
}

function updateMegDoorHint() {
  if (!doorHintEl || megDialogueOpen || isHomeEndingActive()) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    doorHintEl.hidden = true;
    return;
  }
  if (hubRoute && hubRoute.isActive()) {
    var hubData = getAimInteractData();
    if (hubData && hubData.kind === "hub_route_door") {
      doorHintEl.hidden = false;
      doorHintEl.innerHTML =
        "写着 " + hubData.letter + " 的门 · 按 <kbd>Q</kbd> 打开";
    } else if (hubData && hubData.kind === "hub_canteen_food") {
      doorHintEl.hidden = false;
      doorHintEl.innerHTML = "热汤 · 按 <kbd>Q</kbd> 取食";
    } else if (hubData && hubData.kind === "hub_canteen_exit") {
      doorHintEl.hidden = false;
      doorHintEl.innerHTML = "食堂角落的门 · 按 <kbd>Q</kbd> 打开";
    } else {
      doorHintEl.hidden = true;
    }
    return;
  }
  if (level1_1Zones && level1_1Zones.isActive()) {
    if (level1_1Zones.getSubZone() === "outpost") {
      if (level1_1Zones.isNearOutpostExit(player.x, player.z)) {
        doorHintEl.innerHTML = "按 <kbd>Q</kbd> 离开 · 或走进黑色门洞";
        doorHintEl.hidden = false;
        return;
      }
      doorHintEl.hidden = true;
      return;
    }
    if (level1_1Zones.getSubZone() === "outpost2") {
      if (level1_1Zones.isNearOutpost2Exit(player.x, player.z)) {
        doorHintEl.innerHTML = "按 <kbd>Q</kbd> 离开 · 或走进黑色门洞";
        doorHintEl.hidden = false;
        return;
      }
      doorHintEl.hidden = true;
      return;
    }
    if (level1_1Zones.getSubZone() === "outpost3") {
      if (level1_1Zones.isNearOutpost3Exit(player.x, player.z)) {
        doorHintEl.innerHTML = "按 <kbd>Q</kbd> 离开 · 或走进黑色门洞";
        doorHintEl.hidden = false;
        return;
      }
      doorHintEl.hidden = true;
      return;
    }
    if (isAimingLevel1_1WallForCut()) {
      doorHintEl.innerHTML = "按 <kbd>Q</kbd> 切出";
      doorHintEl.hidden = false;
      return;
    }
    if (level1_1Zones.getSubZone() === "corridor") {
      var level1_1World = level1_1Zones.getWorld();
      var atEntrance =
        level1_1Zones.isNearOutpostEntrance(player.x, player.z) ||
        isAimKind("level1_1_door");
      if (atEntrance) {
        if (level1_1World && level1_1World.isOutpostDoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入前哨 · 或走进门洞";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开前哨门';
        }
        doorHintEl.hidden = false;
        return;
      }
      var atCorridor12 =
        level1_1Zones.isNearCorridor12Entrance(player.x, player.z) ||
        isAimKind("level1_1_12_door");
      if (atCorridor12) {
        if (level1_1World && level1_1World.isCorridor12DoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入 · 或走进门洞";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开门';
        }
        doorHintEl.hidden = false;
        return;
      }
    }
    if (level1_1Zones.getSubZone() === "corridor2") {
      var level1_1World2 = level1_1Zones.getWorld2();
      var atEntrance2 =
        level1_1Zones.isNearOutpost2Entrance(player.x, player.z) ||
        isAimKind("level1_1_2_door");
      if (atEntrance2) {
        if (level1_1World2 && level1_1World2.isOutpostDoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入前哨 2 · 或走进门洞";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开前哨 2 门';
        }
        doorHintEl.hidden = false;
        return;
      }
      var atCorridor23 =
        level1_1Zones.isNearCorridor23Entrance(player.x, player.z) ||
        isAimKind("level1_1_23_door");
      if (atCorridor23) {
        if (level1_1World2 && level1_1World2.isCorridor23DoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入 · 门开后会自动传送";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开门';
        }
        doorHintEl.hidden = false;
        return;
      }
    }
    if (level1_1Zones.getSubZone() === "corridor3") {
      var level1_1World3 = level1_1Zones.getWorld3();
      var atEntrance3 =
        level1_1Zones.isNearOutpost3Entrance(player.x, player.z) ||
        isAimKind("level1_1_3_door");
      if (atEntrance3) {
        if (level1_1World3 && level1_1World3.isOutpostDoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入前哨 3 · 或走进门洞";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开前哨 3 门';
        }
        doorHintEl.hidden = false;
        return;
      }
      var atCorridor14 =
        level1_1Zones.isNearCorridor14Entrance(player.x, player.z) ||
        isAimKind("level1_1_34_door");
      if (atCorridor14) {
        if (level1_1World3 && level1_1World3.isCorridor14DoorOpen()) {
          doorHintEl.innerHTML = "按 <kbd>Q</kbd> 进入 · 或走进门洞";
        } else {
          doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开门';
        }
        doorHintEl.hidden = false;
        return;
      }
    }
    if (level1_1Zones.getSubZone() === "corridor4") {
      if (level1_1Zones.isNearCorridor33Return(player.x, player.z)) {
        doorHintEl.innerHTML = "走进门洞 · 返回";
        doorHintEl.hidden = false;
        return;
      }
      var world4 = level1_1Zones.getWorld4();
      if (world4 && world4.isAtLighthouse(player.x, player.z)) {
        doorHintEl.innerHTML = "灯塔在前方 · 继续靠近";
        doorHintEl.hidden = false;
        return;
      }
      if (world4 && player.z > 150) {
        doorHintEl.innerHTML = "远处可见灯塔 · 坚持向前";
        doorHintEl.hidden = false;
        return;
      }
    }
    doorHintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    doorHintEl.hidden = true;
    return;
  }
  if (
    isNearMegGuide() ||
    isNearMegInteriorStaff() ||
    isNearMegBackDoorStaff() ||
    isNearMegLevel11Staff() ||
    isNearMegPackageReceiver() ||
    isNearMegStorageClerk()
  ) {
    doorHintEl.hidden = true;
    return;
  }
  if (
    isAimKind("meg_door", undefined) &&
    getAimInteractData().which === "back"
  ) {
    doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开后门';
    doorHintEl.hidden = false;
    return;
  }
  if (
    isAimKind("meg_door", undefined) &&
    getAimInteractData().which === "front"
  ) {
    doorHintEl.innerHTML = '按 <kbd>Q</kbd> 打开基地门';
    doorHintEl.hidden = false;
    return;
  }
  doorHintEl.hidden = true;
}

function updateMegInteriorTalkHint() {
  if (!interiorTalkHintEl || megDialogueOpen) return;
  if (level1_1Zones && level1_1Zones.isActive()) {
    interiorTalkHintEl.hidden = true;
    return;
  }
  if (isInventoryOpen() || !survival || survival.dead) {
    interiorTalkHintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    interiorTalkHintEl.hidden = true;
    return;
  }
  if (isNearMegGuide()) {
    interiorTalkHintEl.hidden = true;
    return;
  }
  if (isNearMegStorageClerk()) {
    interiorTalkHintEl.hidden = false;
    interiorTalkHintEl.innerHTML = "寄存柜管理员 · 按 <kbd>Q</kbd> 存取物品";
    return;
  }
  interiorTalkHintEl.hidden = !(
    isNearMegInteriorStaff() ||
    isNearMegBackDoorStaff() ||
    isNearMegPackageReceiver()
  );
  if (!interiorTalkHintEl.hidden) {
    interiorTalkHintEl.innerHTML = "按 <kbd>Q</kbd> 与 M.E.G 工作人员对话";
  }
}

function updateLevel11TalkHint() {
  if (!level11HintEl || megDialogueOpen) return;
  if (level1_1Zones && level1_1Zones.isActive()) {
    level11HintEl.hidden = true;
    return;
  }
  if (isInventoryOpen() || !survival || survival.dead) {
    level11HintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    level11HintEl.hidden = true;
    return;
  }
  if (!level1World || !level1World.isMegDoorOpen || !level1World.isMegDoorOpen()) {
    level11HintEl.hidden = true;
    return;
  }
  level11HintEl.hidden = !isNearMegLevel11Staff();
}

function updatePointsHud() {
  updateMegPointsDisplay(megPointsEl);
}

function tryLootFixedChest(chest) {
  if (!survival || chest.opened) return;
  if (chest.lootKind === "almond_x2") {
    var added2 = survival.addAlmondWater(2);
    if (added2 <= 0) {
      showLootToast("背包已满");
      return;
    }
    chest.opened = true;
    if (chest.chestId) markLevel1_1ChestOpened(chest.chestId);
    showLootToast("搜索宝箱 · 杏仁水 ×" + added2);
    return;
  }
  if (chest.lootKind === "almond_x1") {
    var added1 = survival.addAlmondWater(1);
    if (added1 <= 0) {
      showLootToast("背包已满");
      return;
    }
    chest.opened = true;
    if (chest.chestId) markLevel1_1ChestOpened(chest.chestId);
    showLootToast("搜索宝箱 · 杏仁水 ×" + added1);
    return;
  }
  if (chest.lootKind === "royal_rations") {
    if (!addItem({ id: "royal_rations", name: "最小有效分量皇家口粮" })) {
      showLootToast("背包已满");
      return;
    }
    chest.opened = true;
    if (chest.chestId) markLevel1_1ChestOpened(chest.chestId);
    showLootToast("搜索宝箱 · 最小有效分量皇家口粮 ×1");
    return;
  }
  if (chest.lootKind === "royal_rations_trap") {
    if (!addItem({ id: "royal_rations", name: "最小有效分量皇家口粮" })) {
      showLootToast("背包已满");
      return;
    }
    chest.opened = true;
    if (chest.chestId) markLevel1_1ChestOpened(chest.chestId);
    survival.takeDamage(99);
    showLootToast("最小有效分量皇家口粮 ×1 · 陷阱！−99 血量");
  }
}

function markChestEmpty(chest, text) {
  chest.opened = true;
  if (chest.chestId) markLevel1_1ChestOpened(chest.chestId);
  if (chest.glowLight) chest.glowLight.intensity = 0.08;
  showLootToast(text || "搜索宝箱 · 空箱子");
}

function tryLootChest() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var chest = findTargetChest();
  if (!chest || chest.opened) return;
  var luck = getLuck();
  if (luck <= -30 && Math.random() < 0.35) {
    markChestEmpty(chest, "搜索宝箱 · 里面什么都没有");
    return;
  }
  if (
    luck <= -30 &&
    chest.lootKind &&
    (chest.lootKind === "royal_rations" ||
      chest.lootKind === "royal_rations_trap") &&
    Math.random() < 0.5
  ) {
    markChestEmpty(chest, "搜索宝箱 · 高级物资不翼而飞");
    return;
  }
  if (chest.lootKind) {
    tryLootFixedChest(chest);
    return;
  }
  var roll = rollAlmondWaterFromChest();
  var added = survival.addAlmondWater(roll);
  if (added <= 0) {
    showLootToast("背包已满");
    return;
  }
  chest.opened = true;
  if (chest.glowLight) {
    chest.glowLight.intensity = 0.08;
  }
  showLootToast("搜索宝箱 · 杏仁水 ×" + added);
}

function getMovementColliders() {
  if (level1_1Zones && level1_1Zones.isActive()) {
    return wallColliders;
  }
  if (level1World && level1World.colliders && level1World.colliders.length) {
    return level1World.colliders;
  }
  return wallColliders;
}

function movementNearPad() {
  if (
    level1World &&
    level1World.isInsideMegBaseInterior &&
    level1World.isInsideMegBaseInterior(player.x, player.z)
  ) {
    return 14;
  }
  return 10;
}

function resolvePlayerCollisions(px, pz) {
  return resolveBackroomsMoveCollisions(
    px,
    pz,
    player.radius,
    getMovementColliders(),
    movementNearPad()
  );
}

function depenetratePlayer(maxIter) {
  var resolved = resolveCircleAgainstColliders(
    player.x,
    player.z,
    player.radius,
    getMovementColliders(),
    64,
    maxIter || 12
  );
  player.x = resolved.x;
  player.z = resolved.z;
}

function placePlayerAtSpawn() {
  var colliders = level1World ? level1World.colliders : wallColliders;
  var spawnPos = resolveClipEntrySpawn(colliders, player.radius);
  spawnPoint.x = spawnPos.x;
  spawnPoint.z = spawnPos.z;
  player.x = spawnPos.x;
  player.z = spawnPos.z;
  feetY = 0;
  velY = 0;
  yaw = Number.isFinite(spawnPos.yaw) ? spawnPos.yaw : 0;
  pitch = 0.12;
  var i;
  for (i = 0; i < 24; i++) {
    depenetratePlayer(20);
  }
  if (level1World) level1World.update(player.x, player.z);
}

function applyHubRouteTeleport(pos) {
  if (!pos) return;
  player.x = pos.x;
  player.z = pos.z;
  feetY = 0;
  velY = 0;
  grounded = true;
  if (Number.isFinite(pos.yaw)) yaw = pos.yaw;
  pitch = 0;
  roll = 0;
  depenetratePlayer(20);
}

function enterHubFromSecretRoute() {
  if (hubEntering || !survival || survival.dead) return;
  hubEntering = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("hub", yaw);
  queueEnterLevelBanner("枢纽 · The Hub");
  showLootToast("写着 A 的门后没有房间，只有一条昏黄的地下公路隧道。");
  window.setTimeout(function () {
    window.location.href = "backrooms-hub.html";
  }, 700);
}

/** MEG 食堂：按 Q 取食 → 理智上限 +30（10 分钟）并回满血量 */
function eatMessHallFood() {
  if (!survival || survival.dead) return;
  activateCanteenMealBuff();
  survival.hp = getHpMax();
  if (survival.refreshHud) survival.refreshHud();
  saveBackroomsSurvival(survival);
  showLootToast("热汤下肚 · 理智上限 +30（10 分钟）· 血量已回满");
}

/** MEG 食堂角落的门 → Level C-1299.1 浓汤美味 */
function enterCanteenFromMessHall() {
  if (hubEntering || !survival || survival.dead) return;
  hubEntering = true;
  saveBackroomsSurvival(survival);
  // 不传 yaw：让玩家进场时正对后厨长廊尽头的出口
  grantLevelPass("c1299_1");
  queueEnterLevelBanner("Level C-1299.1 · 浓汤美味");
  showLootToast("你推开食堂角落的门，一股浓汤的香气扑面而来…");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c1299-1.html";
  }, 700);
}

function movePlayer(dt, speedMul) {
  moveBackroomsPlayer(
    { move: move, yaw: yaw, player: player },
    dt,
    speedMul,
    resolvePlayerCollisions
  );
}

function tryJump() {
  var stub = { grounded: grounded, velY: velY };
  if (!tryBackroomsJump(stub, JUMP_SPEED)) return;
  velY = stub.velY;
  grounded = stub.grounded;
}

function isCorridorL2SequenceActive() {
  return corridorL2FallState === "spin" || corridorL2FallState === "sink";
}

function updateCorridorFallToL2(dt) {
  if (corridorL2FallState === "done") return;
  if (!level1World) return;
  // 岔路口一旦出现，走廊归枢纽路线所有，不再把玩家吸去 Level 2
  if (corridorL2FallState === "idle" && hubRoute && hubRoute.isForkOpen()) return;
  if (!level1World.isMegBackCorridorOpen()) {
    if (corridorL2FallState === "idle") return;
  }
  if (!level1World.isPlayerInMegCorridor(player.x, player.z)) {
    if (corridorL2FallState === "idle") return;
  }

  var progress = level1World.getMegCorridorProgress(player.x);

  if (corridorL2FallState === "idle") {
    if (progress < CORRIDOR_L2_PROGRESS) return;
    corridorL2FallState = "spin";
    corridorSpinAccum = 0;
  }

  if (corridorL2FallState === "spin") {
    var spinStep = CORRIDOR_L2_SPIN_RATE * dt;
    yaw += spinStep;
    corridorSpinAccum += spinStep;
    pitch = Math.sin(corridorSpinAccum * 1.85) * CORRIDOR_L2_PITCH_AMP;
    roll = Math.cos(corridorSpinAccum * 2.12) * CORRIDOR_L2_ROLL_AMP;
    if (corridorSpinAccum >= CORRIDOR_L2_SPIN_YAW) {
      corridorL2FallState = "sink";
      grounded = false;
      velY = 0;
      corridorSinkStartFeetY = feetY;
    }
    return;
  }

  if (corridorL2FallState === "sink") {
    feetY -= CORRIDOR_L2_SINK_SPEED * dt;
    var sinkSpan = corridorSinkStartFeetY - CORRIDOR_L2_SINK_DEPTH;
    var sinkProg =
      sinkSpan > 0.01
        ? Math.min(1, Math.max(0, (corridorSinkStartFeetY - feetY) / sinkSpan))
        : 1;
    yaw += 2.1 * dt;
    pitch =
      0.42 +
      sinkProg * 1.12 +
      Math.sin(sinkProg * Math.PI * 4) * 0.38;
    roll = Math.sin(sinkProg * Math.PI * 3.2) * 1.05;
    if (feetY <= CORRIDOR_L2_SINK_DEPTH) {
      corridorL2FallState = "done";
      saveBackroomsSurvival(survival);
      try {
        grantLevelPass("l2", yaw);
      } catch (err) {
        /* ignore */
      }
      queueEnterLevelNumber(2);
      window.location.href = "backrooms-level2.html";
    }
  }
}

function updatePlayerPhysics(dt) {
  if (corridorL2FallState !== "done") {
    updateCorridorFallToL2(dt);
  }
  if (isCorridorL2SequenceActive()) return;
  _physStub.feetY = feetY;
  _physStub.velY = velY;
  _physStub.grounded = grounded;
  _physOpts.gravity = GRAVITY;
  _physOpts.bodyHeight = BODY_HEIGHT;
  _physOpts.ceilingY =
    level1_1Zones && level1_1Zones.isActive()
      ? level1_1Zones.getCeilingY()
      : WAREHOUSE_HEIGHT;
  updateBackroomsPlayerPhysics(_physStub, dt, _physOpts);
  feetY = _physStub.feetY;
  velY = _physStub.velY;
  grounded = _physStub.grounded;
}

function isTouchPrimaryDevice() {
  var ua = navigator.userAgent || "";
  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return true;
  }
  if (/iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  return false;
}

function shouldUseDragLook() {
  return !pointerLocked && useDragLook;
}

function syncLookUi() {
  document.body.classList.toggle("backrooms-pointer-locked", pointerLocked);
  if (inputEl) inputEl.classList.toggle("backrooms-input--drag", shouldUseDragLook());
  if (!hintEl) return;
  if (pointerLocked) {
    hintEl.innerHTML =
      "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>F</kbd> 开箱 · <kbd>B</kbd> 背包";
  } else if (shouldUseDragLook()) {
    hintEl.innerHTML =
      "拖动视角 · <kbd>WASD</kbd> 移动 · <kbd>F</kbd> 开箱 · <kbd>B</kbd> 背包";
  } else {
    hintEl.innerHTML =
      "点击画面锁定鼠标 · <kbd>WASD</kbd> 移动 · <kbd>F</kbd> 开箱 · <kbd>B</kbd> 背包";
  }
}

function requestLock(fromEl) {
  if (shouldUseDragLook() || isTaskUiOpen()) return;
  var target = fromEl || inputEl || canvas;
  if (!target || !target.requestPointerLock) {
    useDragLook = true;
    syncLookUi();
    return;
  }
  var req = target.requestPointerLock();
  if (req && req.catch) req.catch(function () { useDragLook = true; syncLookUi(); });
}

function bindControls() {
  useDragLook = isTouchPrimaryDevice();
  if (dialogueChoicesEl) {
    dialogueChoicesEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-choice]");
      if (!btn || !megDialogueOpen) return;
      var choice = btn.getAttribute("data-choice");
      if (!choice) return;
      e.preventDefault();
      handleMegDialogueChoice(choice);
    });
  }
  window.addEventListener("keydown", function (e) {
    if (!megDialogueOpen && !isInventoryOpen() && handleTaskUiKey(e)) {
      e.preventDefault();
      return;
    }
    if (megDialogueOpen) {
      if (megDialogueKind === "level11_tour") {
        if ((e.code === "KeyQ" || e.key === "q" || e.key === "Q") && !e.repeat) {
          e.preventDefault();
          advanceLevel11Tour();
          return;
        }
        if (isDialogueChoiceKey(e, "a")) {
          e.preventDefault();
          megDialogueChooseLevel11("a");
          return;
        }
      }
      if (megDialogueKind === "level11") {
        if (isDialogueChoiceKey(e, "a")) {
          e.preventDefault();
          megDialogueChooseLevel11("a");
          return;
        }
        if (isDialogueChoiceKey(e, "b")) {
          e.preventDefault();
          megDialogueChooseLevel11("b");
          return;
        }
        if (isDialogueChoiceKey(e, "c")) {
          e.preventDefault();
          megDialogueChooseLevel11("c");
          return;
        }
      }
      if (megDialogueKind !== "level11" && megDialogueKind !== "level11_tour") {
        if (isDialogueChoiceKey(e, "a")) {
          e.preventDefault();
          megDialogueChoose(true);
          return;
        }
        if (isDialogueChoiceKey(e, "b")) {
          e.preventDefault();
          megDialogueChoose(false);
          return;
        }
      }
      if (e.code === "Escape" && !e.repeat) {
        e.preventDefault();
        closeMegDialogue();
        return;
      }
      return;
    }

    keys[e.code] = true;
    if (e.code === "KeyW") move.forward = true;
    if (e.code === "KeyS") move.back = true;
    if (e.code === "KeyA") move.left = true;
    if (e.code === "KeyD") move.right = true;
    if (e.code === "Space" && !e.repeat) { e.preventDefault(); tryJump(); }
    if (e.code === "KeyF" && !e.repeat) {
      e.preventDefault();
      tryLootChest();
    }
    if (e.code === "KeyB" && !e.repeat) {
      e.preventDefault();
      toggleBackpack();
    }
    if (e.code === "KeyQ" && !e.repeat) {
      e.preventDefault();
      tryMegQAction();
    }
  });
  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
    if (e.code === "KeyW") move.forward = false;
    if (e.code === "KeyS") move.back = false;
    if (e.code === "KeyA") move.left = false;
    if (e.code === "KeyD") move.right = false;
  });
  document.addEventListener("mousemove", function (e) {
    if (!pointerLocked || isCorridorL2SequenceActive()) return;
    yaw -= e.movementX * LOOK_SENS;
    pitch -= e.movementY * LOOK_SENS;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
  });
  document.addEventListener("pointerlockchange", function () {
    pointerLocked = document.pointerLockElement === inputEl || document.pointerLockElement === canvas;
    syncLookUi();
  });
  document.addEventListener("pointerlockerror", function () {
    useDragLook = true;
    syncLookUi();
  });
  var cap = inputEl || canvas;
  if (cap) {
    cap.addEventListener("pointerdown", function (e) {
      if (shouldUseDragLook()) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        lookDragId = e.pointerId;
        lookLastX = e.clientX;
        lookLastY = e.clientY;
        cap.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (isInventoryOpen() || isBaseStorageOpen()) return;
      if (e.pointerType === "mouse" && e.button === 0 && !pointerLocked) {
        requestLock(e.currentTarget);
      }
    });
    cap.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  window.addEventListener("pointermove", function (e) {
    if (lookDragId !== e.pointerId || isCorridorL2SequenceActive()) return;
    yaw -= (e.clientX - lookLastX) * LOOK_SENS * MOBILE_LOOK_SENS_MULT;
    pitch -= (e.clientY - lookLastY) * LOOK_SENS * MOBILE_LOOK_SENS_MULT;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
    lookLastX = e.clientX;
    lookLastY = e.clientY;
  });
  window.addEventListener("pointerup", function (e) {
    if (lookDragId !== e.pointerId) return;
    try { cap.releasePointerCapture(lookDragId); } catch (err) { /* ignore */ }
    lookDragId = null;
  });
  window.addEventListener("resize", onResize);
  syncLookUi();
}

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>alpha 无法启动</strong></p><p>" + msg + "</p>";
}

/** 刷新 → 重置回 L0；否则须 clip 或 M.E.G 回城标记 */
function enforceLevel1EntryOrRedirect() {
  try {
    var megReturn = sessionStorage.getItem(MEG_RESPAWN_FLAG) === "1";
    if (!enforceLevel1Entry({ megRespawn: megReturn })) {
      window.location.replace("backrooms-level0.html");
      return false;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function init() {
  if (!enforceLevel1EntryOrRedirect()) return;
  showEnterLevelBannerIfQueued();
  markLevelEntered("l1", showLootToast);
  validateMatrix();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  renderer.shadowMap.enabled = false;
  applyBackroomsToneMapping(renderer);

  horror = createBackroomsHorrorSystem({
    blackoutChance: 0,
  });
  horror.setFlickerHandler(runIndustrialMicroFlicker);

  var root = new THREE.Group();
  root.name = "BackroomsLevel1";
  scene.add(root);
  level1Root = root;

  wallColliders.length = 0;
  level1World = buildBackroomsLevel1World(root, {
    horror: horror,
    onWallCollider: function (c) {
      if (wallColliders.indexOf(c) < 0) wallColliders.push(c);
    },
    onWallColliderRemove: function (c) {
      var idx = wallColliders.indexOf(c);
      if (idx >= 0) wallColliders.splice(idx, 1);
    },
  });
  if (level1World.ensureMegBase) level1World.ensureMegBase();
  hubRoute = createHubRoute({
    root: root,
    colliders: level1World.colliders,
    mirrorColliders: wallColliders,
    showToast: showLootToast,
    onEnterHub: enterHubFromSecretRoute,
    onEatFood: eatMessHallFood,
    onEnterCanteen: enterCanteenFromMessHall,
    getCorridorInfo: function () {
      return level1World && level1World.getMegCorridorInfo
        ? level1World.getMegCorridorInfo()
        : null;
    },
    carveNorthGap: function (minX, maxX) {
      return !!(
        level1World &&
        level1World.carveMegCorridorNorthGap &&
        level1World.carveMegCorridorNorthGap(minX, maxX)
      );
    },
  });
  syncPackageReceiverNpc();
  industrialLights = level1World.industrialLights;
  megGuideNpc = level1World.megGuideNpc || null;
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showLootToast,
  });

  level1_1Zones = createLevel1_1ZoneManager({
    scene: scene,
    level1Root: root,
    wallColliders: wallColliders,
    fps: {
      get x() {
        return player.x;
      },
      set x(v) {
        player.x = v;
      },
      get z() {
        return player.z;
      },
      set z(v) {
        player.z = v;
      },
      get yaw() {
        return yaw;
      },
      set yaw(v) {
        yaw = v;
      },
      get pitch() {
        return pitch;
      },
      set pitch(v) {
        pitch = v;
      },
      get roll() {
        return roll;
      },
      set roll(v) {
        roll = v;
      },
      get feetY() {
        return feetY;
      },
      set feetY(v) {
        feetY = v;
      },
    },
    getSurvival: function () {
      return survival;
    },
    horror: horror,
    onHudTitleChange: function (title) {
      if (hintEl) hintEl.textContent = title;
    },
    showToast: showLootToast,
    camera: camera,
    onHomeEnding: triggerHomeEnding,
    ensureMegBase: function () {
      if (level1World && level1World.ensureMegBase) level1World.ensureMegBase();
    },
  });

  placePlayerAtSpawn();

  horror.resetSchedule(performance.now());
  nextFlickerAt = performance.now() + 8000;

  initSurvivalHud();
  if (consumeL283MegExitFlag()) {
    if (level1World && level1World.ensureMegBase) level1World.ensureMegBase();
    respawnAtMegBase();
  } else if (consumeMegRespawnRedirectFlag()) {
    applyMegDeathState(survival);
    if (level1World && level1World.ensureMegBase) level1World.ensureMegBase();
    respawnAtMegBase();
  }
  initBackroomsTemperature(1, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updatePointsHud();
  bindControls();
  onResize();
  startLoop();
}

function validateMatrix() {
  /* 矩阵校验由 world 模块负责 */
}

function startLoop() {
  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var now = performance.now();
    var moving = isPlayerMoving();
    var sprinting = isSprintHeld() && moving;
    if (hubRoute && level1World && !hubRoute.isActive()) {
      hubRoute.updateObservation(
        player.x,
        player.z,
        yaw,
        level1World.isPlayerInMegCorridor(player.x, player.z)
      );
      hubRoute.updateBranchGate(player.x, player.z);
    } else if (hubRoute && hubRoute.isActive()) {
      hubRoute.updateRoute(player.x, player.z);
    }
    if (hubRoute) applyHubRouteTeleport(hubRoute.consumeTeleport());
    var inHubRoute = !!(hubRoute && hubRoute.isActive());

    var horrorResult = { blackout: false };
    if (horror && !inHubRoute) {
      horrorResult = horror.update(now, player.x, player.z);
    }

    if (survival && !survival.dead && !isHomeEndingActive()) {
      var sanityDrain =
        level1_1Zones && level1_1Zones.isActive()
          ? level1_1Zones.getSanityDrainPerSec()
          : 0;
      _survCtx.blackout = horrorResult.blackout;
      _survCtx.nearLandmark = false;
      _survCtx.sprinting = sprinting;
      _survCtx.sanityDrainPerSec = sanityDrain;
      survival.update(dt, _survCtx);
    }

    updatePlayerPhysics(dt);
    depenetratePlayer();
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isBaseStorageOpen() &&
      !megDialogueOpen &&
      !isTaskUiOpen() &&
      !isHomeEndingActive()
    ) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(player.speed, sprinting, moving)
          : 1;
      if (!isCorridorL2SequenceActive()) {
        movePlayer(dt, speedMul);
      }
    }
    updateLootToast(now);
    if (level1_1Zones && level1_1Zones.isActive()) {
      level1_1Zones.update(dt);
    } else if (level1World && !inHubRoute) {
      level1World.update(player.x, player.z);
      level1World.updateMegDoor(dt);
      level1World.updateMegCorridorVisibility(player.x, player.z);
    }
    if (
      survival &&
      level1World &&
      !inHubRoute &&
      !(level1_1Zones && level1_1Zones.isActive())
    ) {
      updateMegBaseAutoSave(survival, level1World, player.x, player.z);
    }
    camera.position.set(player.x, feetY + EYE_HEIGHT, player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = roll;
    refreshAimPick();
    updateBlackoutHint(horrorResult.blackout);
    updateChestSearchHint();
    updateMegTalkHint();
    updateMegDoorHint();
    updateMegInteriorTalkHint();
    updateLevel11TalkHint();
    updateCrosshair();
    updatePointsHud();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    syncLookUi();
    if (firesalt) firesalt.update(dt);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L1]", err);
  showError(err.message || String(err));
}

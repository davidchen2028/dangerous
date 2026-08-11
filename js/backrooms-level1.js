/**
 * Backrooms Level 1 — 工业仓库 + 量子海盗宝箱 + 暴盲恐怖机制
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { createBackroomsHorrorSystem } from "./backrooms-horror.js";
import { rollAlmondWaterFromChest } from "./backrooms-chest-loot.js";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  countItem,
  removeFirstItem,
  addItem,
} from "./backrooms-inventory.js";
import {
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
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
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevel1Entry, grantLevelPass } from "./backrooms-level-pass.js";
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
  applyMegDeathState,
  MEG_RESPAWN_FLAG,
} from "./backrooms-meg-checkpoint.js";

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

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildBackroomsLevel1World> | null} */
let level1World = null;
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
/** @type {"guide" | "trade" | "backdoor" | "rations" | "level11" | "level11_tour" | null} */
let megDialogueKind = null;
let level11TourStep = 0;

const LEVEL11_SD_IMAGES = {
  variable: "img/backrooms/level11/sd-variable.png",
  class0: "img/backrooms/level11/sd-class0.png",
  class2: "img/backrooms/level11/sd-class2.png",
  class4: "img/backrooms/level11/sd-class4.png",
  deadzone: "img/backrooms/level11/sd-deadzone.png",
  na: "img/backrooms/level11/sd-na.png",
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
  if (level1World && level1World.getAimInteractRoots) {
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

function refreshAimPick() {
  currentAimPick = null;
  if (!camera || !level1World || isInventoryOpen() || megDialogueOpen) return;
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

function isNearMegRationsVendor() {
  return isAimKind("meg_npc", "rations");
}

function isNearMegLevel11Staff() {
  return isAimKind("meg_npc", "level11");
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

function setDialogueChoicesLevel11() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    "<kbd>A</kbd> 想 · <kbd>B</kbd> 不想 · <kbd>C</kbd> 请介绍一下";
}

function openLevel11Dialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  megDialogueOpen = true;
  megDialogueKind = "level11";
  level11TourStep = 0;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 人员";
  dialogueTextEl.textContent = "你想去 1.1 吗？";
  setDialogueImage(null);
  setDialogueChoicesLevel11();
  if (level11HintEl) level11HintEl.hidden = true;
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
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
    setDialogueImage(LEVEL11_SD_IMAGES.variable);
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
    setDialogueImage(LEVEL11_SD_IMAGES.class0);
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
    setDialogueImage(LEVEL11_SD_IMAGES.class2);
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
    setDialogueImage(LEVEL11_SD_IMAGES.class4);
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
    setDialogueImage(LEVEL11_SD_IMAGES.deadzone);
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
    setDialogueImage(LEVEL11_SD_IMAGES.na);
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
    closeMegDialogue();
    showLootToast("作者未制作");
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

function setDialogueChoicesGuide() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = "<kbd>A</kbd> 想 · <kbd>B</kbd> 算了";
}

function setDialogueChoicesTrade() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = "<kbd>A</kbd> 兑换 · <kbd>B</kbd> 算了";
}

function setDialogueChoicesDismiss() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML = "<kbd>B</kbd> 知道了";
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
}

function openMegTradeDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  megDialogueOpen = true;
  megDialogueKind = "trade";
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 工作人员";
  dialogueTextEl.textContent =
    "你好。可以用 1 瓶杏仁水兑换 5 积分点，要换吗？";
  setDialogueChoicesTrade();
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function openMegRationsDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  megDialogueOpen = true;
  megDialogueKind = "rations";
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 补给员";
  dialogueTextEl.textContent =
    "最小剂量皇家口粮，10 积分点。使用后 10 分钟内血量上限 150、体力上限 200，并回满血量。要购买吗？";
  setDialogueChoicesTrade();
  if (interiorTalkHintEl) interiorTalkHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function tryBuyRoyalRations() {
  if (getMegPoints() < 10) {
    if (dialogueTextEl) {
      dialogueTextEl.textContent = "积分不足，需要 10 积分点。";
    }
    if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
    window.setTimeout(closeMegDialogue, 1600);
    return;
  }
  if (
    !addItem({
      id: "royal_rations",
      name: "皇家口粮",
    })
  ) {
    if (dialogueTextEl) {
      dialogueTextEl.textContent = "背包已满，无法购买。";
    }
    if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
    window.setTimeout(closeMegDialogue, 1600);
    return;
  }
  addMegPoints(-10);
  updateMegPointsDisplay(megPointsEl);
  if (survival) survival.refreshHud();
  closeMegDialogue();
  showLootToast("购入皇家口粮 · −10 积分");
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
  megDialogueOpen = false;
  megDialogueKind = null;
  level11TourStep = 0;
  setDialogueImage(null);
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function tryAlmondWaterTrade() {
  if (countItem("almond_water") < 1) {
    if (dialogueTextEl) {
      dialogueTextEl.textContent = "背包里没有杏仁水，无法兑换。";
    }
    if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
    window.setTimeout(closeMegDialogue, 1400);
    return;
  }
  removeFirstItem("almond_water");
  addMegPoints(5);
  updateMegPointsDisplay(megPointsEl);
  if (survival) survival.refreshHud();
  closeMegDialogue();
  showLootToast("兑换成功 · +5 积分点");
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
    if (wantYes) tryAlmondWaterTrade();
    else closeMegDialogue();
    return;
  }
  if (megDialogueKind === "rations") {
    if (wantYes) tryBuyRoyalRations();
    else closeMegDialogue();
    return;
  }
  if (megDialogueKind === "backdoor") {
    closeMegDialogue();
    return;
  }
  closeMegDialogue();
}

function tryMegQAction() {
  if (megDialogueOpen || isInventoryOpen()) return;
  if (!survival || survival.dead) return;
  if (isNearMegGuide()) {
    openMegGuideDialogue();
    return;
  }
  if (isNearMegBackDoorStaff()) {
    openMegBackDoorStaffDialogue();
    return;
  }
  if (isNearMegRationsVendor()) {
    openMegRationsDialogue();
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
  if (!doorHintEl || megDialogueOpen) return;
  if (isInventoryOpen() || !survival || survival.dead) {
    doorHintEl.hidden = true;
    return;
  }
  if (blackoutHintEl && !blackoutHintEl.hidden) {
    doorHintEl.hidden = true;
    return;
  }
  if (isNearMegGuide() || isNearMegInteriorStaff() || isNearMegBackDoorStaff() || isNearMegRationsVendor() || isNearMegLevel11Staff()) {
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
  interiorTalkHintEl.hidden =
    !(isNearMegInteriorStaff() || isNearMegBackDoorStaff() || isNearMegRationsVendor());
}

function updateLevel11TalkHint() {
  if (!level11HintEl || megDialogueOpen) return;
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

function tryLootChest() {
  if (isInventoryOpen() || !survival || survival.dead) return;
  var chest = findTargetChest();
  if (!chest) return;
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

function resolvePlayerCollisions(px, pz) {
  return resolveBackroomsMoveCollisions(px, pz, player.radius, wallColliders);
}

function depenetratePlayer(maxIter) {
  var resolved = resolveCircleAgainstColliders(
    player.x,
    player.z,
    player.radius,
    wallColliders,
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
  var stub = { feetY: feetY, velY: velY, grounded: grounded };
  updateBackroomsPlayerPhysics(stub, dt, {
    gravity: GRAVITY,
    bodyHeight: BODY_HEIGHT,
    ceilingY: WAREHOUSE_HEIGHT,
  });
  feetY = stub.feetY;
  velY = stub.velY;
  grounded = stub.grounded;
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
  if (shouldUseDragLook()) return;
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
  window.addEventListener("keydown", function (e) {
    if (megDialogueOpen) {
      if (megDialogueKind === "level11_tour" && e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        advanceLevel11Tour();
        return;
      }
      if (megDialogueKind === "level11") {
        if (e.code === "KeyA" && !e.repeat) {
          e.preventDefault();
          megDialogueChooseLevel11("a");
          return;
        }
        if (e.code === "KeyB" && !e.repeat) {
          e.preventDefault();
          megDialogueChooseLevel11("b");
          return;
        }
        if (e.code === "KeyC" && !e.repeat) {
          e.preventDefault();
          megDialogueChooseLevel11("c");
          return;
        }
      }
      if (megDialogueKind !== "level11" && megDialogueKind !== "level11_tour") {
        if (e.code === "KeyA" && !e.repeat) {
          e.preventDefault();
          megDialogueChoose(true);
          return;
        }
        if (e.code === "KeyB" && !e.repeat) {
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
      if (isInventoryOpen()) return;
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
  validateMatrix();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = false;

  horror = createBackroomsHorrorSystem({
    blackoutChance: 0,
  });
  horror.setFlickerHandler(runIndustrialMicroFlicker);

  var root = new THREE.Group();
  root.name = "BackroomsLevel1";
  scene.add(root);

  wallColliders.length = 0;
  level1World = buildBackroomsLevel1World(root, {
    horror: horror,
    onWallCollider: function (c) {
      wallColliders.push(c);
    },
    onWallColliderRemove: function (c) {
      var idx = wallColliders.indexOf(c);
      if (idx >= 0) wallColliders.splice(idx, 1);
    },
  });
  industrialLights = level1World.industrialLights;
  megGuideNpc = level1World.megGuideNpc || null;
  placePlayerAtSpawn();

  horror.resetSchedule(performance.now());
  nextFlickerAt = performance.now() + 8000;

  initSurvivalHud();
  if (consumeMegRespawnRedirectFlag()) {
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

    var horrorResult = { blackout: false };
    if (horror) {
      horrorResult = horror.update(now, player.x, player.z);
    }

    if (survival && !survival.dead) {
      survival.update(dt, {
        blackout: horrorResult.blackout,
        nearLandmark: false,
        sprinting: sprinting,
      });
    }

    updatePlayerPhysics(dt);
    depenetratePlayer();
    if ((!survival || !survival.dead) && !isInventoryOpen() && !megDialogueOpen) {
      var speedMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(player.speed, sprinting, moving)
          : 1;
      if (!isCorridorL2SequenceActive()) {
        movePlayer(dt, speedMul);
      }
    }
    updateLootToast(now);
    if (level1World) {
      level1World.update(player.x, player.z);
      level1World.updateMegDoor(dt);
      level1World.updateMegCorridorVisibility(player.x, player.z);
    }
    if (survival && level1World) {
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

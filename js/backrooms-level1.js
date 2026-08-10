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
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import {
  addMegPoints,
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
  resolveCircleAgainstColliders,
  raycastWallBlockDistance,
} from "./backrooms-collide.js";
import {
  pickCrosshairInteract,
  getCameraAimRay,
} from "./backrooms-interact-aim.js";

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
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
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
/** @type {"guide" | "trade" | "backdoor" | null} */
let megDialogueKind = null;
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
  return move.forward || move.back || move.left || move.right;
}

function isSprintHeld() {
  return !!(keys.ShiftLeft || keys.ShiftRight);
}

function respawnAtSafePoint() {
  player.x = spawnPoint.x;
  player.z = spawnPoint.z;
  feetY = 0;
  velY = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  depenetratePlayer(16);
}

function initSurvivalHud() {
  survival = new BackroomsSurvival({
    onRespawn: respawnAtSafePoint,
  });
  var hudHost = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(hudHost);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
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
    dialogueTextEl.textContent =
      "可以打开后门然后进去。这瓶夜视药水你拿着，在背包里双击使用，大约 5 分钟内能看清暗处。";
  } else if (alreadyGave) {
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

function closeMegDialogue() {
  megDialogueOpen = false;
  megDialogueKind = null;
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
  depenetratePlayer(20);
  if (level1World) level1World.update(player.x, player.z);
}

function megDialogueChoose(wantYes) {
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
  if (isNearMegInteriorStaff()) {
    openMegTradeDialogue();
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
  if (isNearMegGuide() || isNearMegInteriorStaff() || isNearMegBackDoorStaff()) {
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
    !(isNearMegInteriorStaff() || isNearMegBackDoorStaff());
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
  return resolveCircleAgainstColliders(px, pz, player.radius, wallColliders);
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
  var dx = 0;
  var dz = 0;
  if (move.forward) dz -= 1;
  if (move.back) dz += 1;
  if (move.left) dx -= 1;
  if (move.right) dx += 1;
  if (dx === 0 && dz === 0) return;

  var len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  var sinY = Math.sin(yaw);
  var cosY = Math.cos(yaw);
  var worldX = dx * cosY + dz * sinY;
  var worldZ = -dx * sinY + dz * cosY;
  var speed = player.speed * (speedMul || 1);
  var nextX = player.x + worldX * speed * dt;
  var nextZ = player.z + worldZ * speed * dt;
  var resolved = resolvePlayerCollisions(nextX, nextZ);
  player.x = resolved.x;
  player.z = resolved.z;
}

function tryJump() {
  if (grounded) {
    velY = JUMP_SPEED;
    grounded = false;
  }
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
        sessionStorage.setItem("backrooms_l2_pass", "1");
        sessionStorage.setItem("backrooms_l2_yaw", String(yaw));
      } catch (err) {
        /* ignore */
      }
      window.location.href = "backrooms-level2.html";
    }
  }
}

function updatePlayerPhysics(dt) {
  if (corridorL2FallState !== "done") {
    updateCorridorFallToL2(dt);
  }
  if (isCorridorL2SequenceActive()) return;
  velY -= GRAVITY * dt;
  feetY += velY * dt;
  if (feetY <= 0) {
    feetY = 0;
    velY = 0;
    grounded = true;
  } else {
    grounded = false;
  }
  if (feetY + BODY_HEIGHT > WAREHOUSE_HEIGHT) {
    feetY = WAREHOUSE_HEIGHT - BODY_HEIGHT;
    if (velY > 0) velY = 0;
  }
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
  errorEl.innerHTML = "<p><strong>Level 1 无法启动</strong></p><p>" + msg + "</p>";
}

/** 无存档：刷新或直接打开 Level 1 一律回到 Level 0 */
function enforceLevel1EntryOrRedirect() {
  var nav =
    typeof performance !== "undefined" &&
    performance.getEntriesByType &&
    performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "reload") {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  try {
    if (sessionStorage.getItem("backrooms_clip_pass") !== "1") {
      window.location.replace("backrooms-level0.html");
      return false;
    }
    sessionStorage.removeItem("backrooms_clip_pass");
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function init() {
  if (!enforceLevel1EntryOrRedirect()) return;
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

/**
 * Backrooms Level 4 — 无限现代办公层（由 L3 电梯进入）
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
import {
  openBaseStorage,
  isBaseStorageOpen,
  wrapInventoryOpenHandler,
} from "./backrooms-base-storage.js?v=4";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import {
  isNightVisionActive,
  formatNightVisionRemaining,
  useNightVisionPotionFromBackpack,
} from "./backrooms-night-vision.js";
import { buildLevel4World, L4_WALL_H } from "./backrooms-level4-world.js?v=2";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { aiChoiceHtml, isAiChatOpen, closeAiChat } from "./backrooms-ai-chat.js?v=2";
import { startGuardedRafLoop } from "./backrooms-frame-guard.js";
import { refreshLevel1_1OutpostChestsOnFirstL4Visit } from "./backrooms-level1-1-chests.js";
import {
  bindLevel4Music,
  startLevel4Music,
  fadeOutLevel4Music,
  LEVEL4_MUSIC_FADE_OUT_MS as MUSIC_FADE_OUT_MS,
} from "./backrooms-level4-music.js";
import {
  openTaskBoard,
  isTaskBoardUnlocked,
  unlockTaskBoard,
  isTaskUiOpen,
  handleTaskUiKey,
  markLevelEntered,
  getFirstDeliveredUnclaimedTask,
  claimTaskReward,
  isTaskAccepted,
  recordCoolerInspect,
  isCoolerInspected,
  getCoolerInspectedRemainingMs,
  getInspectProgress,
} from "./backrooms-tasks.js";
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
  DEFAULT_EYE_HEIGHT,
  DEFAULT_GRAVITY,
  DEFAULT_BODY_HEIGHT,
} from "./backrooms-fps-controller.js";
import {
  applyForNextMegRank,
  describeMegCareer,
  getMegCareerProfile,
  getNextMegRank,
  hasMegPermission,
  initMegCareer,
  submitMegReport,
} from "./backrooms-meg-career.js";

const FOG_COLOR = 0xe8ebf0;
const FOG_NEAR = 6;
const FOG_FAR = 52;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const waterHintEl = document.getElementById("backroomsWaterHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const lootToastEl = document.getElementById("backroomsLootToast");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");

const LOOK_SENS = 0.0022;
const AIM_INTERACT_MAX = 3.2;
const GRAVITY = 32;
const JUMP_SPEED = 8;
const EYE_HEIGHT = 1.65;
const BODY_HEIGHT = 1.85;

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: BODY_HEIGHT,
  ceilingY: L4_WALL_H,
};

let renderer = null;
let camera = null;
let scene = null;
/** @type {ReturnType<buildLevel4World> | null} */
let level4World = null;
let colliders = [];
let survival = null;
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 4.15 },
});
let spawnX = 0;
let spawnZ = 2;
/** @type {THREE.Object3D[]} */
let interactRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimPick = null;
let lootToastUntil = 0;
let transitionLock = false;
let dialogueOpen = false;
/** "bntg" | "meg" */
let dialogueKind = "";
/** 已接过水的饮水机 id；每台只出一瓶 */
const DRAINED_COOLERS_KEY = "backrooms_l4_drained_coolers_v1";
/** @type {Set<string>} */
let drainedCoolers = new Set();

function loadDrainedCoolers() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(DRAINED_COOLERS_KEY) || "[]");
    if (Array.isArray(parsed)) drainedCoolers = new Set(parsed);
  } catch (err) {
    /* ignore */
  }
}

function markCoolerDrained(id) {
  if (!id) return;
  drainedCoolers.add(id);
  try {
    sessionStorage.setItem(
      DRAINED_COOLERS_KEY,
      JSON.stringify(Array.from(drainedCoolers))
    );
  } catch (err) {
    /* ignore */
  }
}

function aimedCoolerId() {
  if (!currentAimPick || !currentAimPick.data) return "";
  return currentAimPick.data.id || "";
}

function isAimedCoolerDrained() {
  return drainedCoolers.has(aimedCoolerId());
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level 4 无法启动</strong></p><p>" + msg + "</p>";
}

function enforceEntryOrRedirect() {
  try {
    if (
      !enforceLevelEntry("l4", function (y) {
        fps.yaw = y;
      })
    ) {
      window.location.replace("backrooms-level0.html");
      return false;
    }
  } catch (err) {
    window.location.replace("backrooms-level0.html");
    return false;
  }
  return true;
}

function showLootToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2600 });
}

function syncLookUi() {
  if (!hintEl) return;
  var nv = isNightVisionActive() ? " · 夜视 <strong>" + formatNightVisionRemaining() + "</strong>" : "";
  hintEl.innerHTML =
    "Level 4 办公层 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包" + nv;
}

function updateAimPick() {
  if (
    !camera ||
    !interactRoots.length ||
    isInventoryOpen() ||
    dialogueOpen ||
    !survival ||
    survival.dead
  ) {
    currentAimPick = null;
    return;
  }
  var aim = getCameraAimRay(camera, AIM_INTERACT_MAX);
  var wallBlock = raycastWallBlockDistance(
    aim.origin,
    aim.direction,
    AIM_INTERACT_MAX,
    colliders,
    0,
    L4_WALL_H
  );
  currentAimPick = pickCrosshairInteract(
    camera,
    interactRoots,
    AIM_INTERACT_MAX,
    wallBlock
  );
}

function isAimWaterCooler() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_water_cooler") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimStairsDown() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_stairs_down") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimVendingL61() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_vending_l61") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimBntgLiaison() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_bntg_liaison") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimMegMember() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_meg_member") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimTaskBoard() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_task_board") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function isAimStorageClerk() {
  if (!currentAimPick || !currentAimPick.data) return false;
  if (currentAimPick.data.kind !== "l4_storage_clerk") return false;
  return currentAimPick.distance <= AIM_INTERACT_MAX;
}

function hudBlocked() {
  return (
    isInventoryOpen() ||
    isBaseStorageOpen() ||
    dialogueOpen ||
    isTaskUiOpen() ||
    !survival ||
    survival.dead ||
    transitionLock
  );
}

function updateWaterHint() {
  if (!waterHintEl) return;
  if (hudBlocked() || !isAimWaterCooler()) {
    waterHintEl.hidden = true;
    return;
  }
  waterHintEl.hidden = false;
  var coolerId = aimedCoolerId();
  var inspected = isCoolerInspected(coolerId);
  var drained = isAimedCoolerDrained();
  var taskOn = isTaskAccepted("inspect_coolers");
  var canInspect = taskOn && !inspected;
  var progress = taskOn ? getInspectProgress("inspect_coolers") : null;
  var progressText = progress ? "（" + progress.count + "/" + progress.target + "）" : "";
  var html;
  if (inspected) {
    var left = getCoolerInspectedRemainingMs(coolerId);
    html =
      "已检修" +
      (left != null ? " · 约 " + Math.ceil(left / 60000) + " 分钟后清除" : "");
    if (taskOn) html += " · 巡检" + progressText + "，换 Level 4 其它饮水机继续";
    if (!drained) html += " · 按 <kbd>Q</kbd> 接水";
  } else if (canInspect && drained) {
    html = "按 <kbd>E</kbd> 巡检" + progressText + "（已无水）";
  } else if (canInspect) {
    html = "按 <kbd>E</kbd> 巡检" + progressText + " · 按 <kbd>Q</kbd> 接水";
  } else {
    html = drained ? "这台饮水机已经空了" : "按 <kbd>Q</kbd> 接水";
  }
  if (html !== waterHintEl.innerHTML) waterHintEl.innerHTML = html;
}

function tryCoolerInspectE() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimWaterCooler()) return;
  if (!isTaskAccepted("inspect_coolers")) {
    showLootToast("尚未接取饮水机巡检任务");
    return;
  }
  var result = recordCoolerInspect(aimedCoolerId());
  if (!result.ok) {
    showLootToast(result.reason || "无法巡检");
    return;
  }
  updateMegPointsDisplay(megPointsEl);
  if (result.done) {
    if (result.claimFailed) {
      showLootToast(result.reason || "巡检已完成，请找 M.E.G 成员领赏");
    } else {
      var msg = "巡检完成 · +" + (result.reward != null ? result.reward : 5) + " 积分";
      if (result.cooldownNote) msg += " · " + result.cooldownNote;
      showLootToast(msg);
    }
  } else {
    showLootToast(
      "已检修（" + result.count + "/" + result.target + "）· 标签将保留 10 分钟"
    );
  }
  updateWaterHint();
}

function updateInteractHint() {
  if (!interactHintEl) return;
  if (hudBlocked()) {
    interactHintEl.hidden = true;
    return;
  }
  if (isAimStairsDown()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 沿楼梯下行";
    return;
  }
  if (isAimVendingL61()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 切入自动售货机";
    return;
  }
  if (isAimBntgLiaison()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与 B.N.T.G. 联络员交谈";
    return;
  }
  if (isAimMegMember()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与 M.E.G. 成员交谈";
    return;
  }
  if (isAimStorageClerk()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "寄存柜管理员 · 按 <kbd>Q</kbd> 存取物品";
    return;
  }
  if (isAimTaskBoard()) {
    interactHintEl.hidden = false;
    interactHintEl.innerHTML = "按 <kbd>E</kbd> 查看任务板";
    return;
  }
  interactHintEl.hidden = true;
}

function closeBntgDialogue() {
  dialogueOpen = false;
  dialogueKind = "";
  closeAiChat();
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
}

function openDialogue(kind, text, choicesHtml) {
  if (!dialogueEl || !dialogueTextEl || !dialogueChoicesEl) return;
  dialogueOpen = true;
  dialogueKind = kind;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) {
    dialogueSpeakerEl.textContent =
      kind.indexOf("meg") === 0 ? "M.E.G 成员" : "B.N.T.G. 联络员";
  }
  dialogueTextEl.textContent = text;
  dialogueChoicesEl.innerHTML = choicesHtml;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function openBntgDialogue() {
  openDialogue(
    "bntg",
    "你要不要去 Level 1 的 B.N.T.G. 基地？那里与 Level 1 主区域不相通。",
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="a"><kbd>A</kbd> 前往基地</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="b"><kbd>B</kbd> 暂时不去</button>' +
      aiChoiceHtml("l4_bntg")
  );
}

function openMegDialogue() {
  var deliveredTask = getFirstDeliveredUnclaimedTask();
  if (deliveredTask) {
    openDialogue(
      "meg_reward",
      "你完成任务了。",
      '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="a"><kbd>A</kbd> 领取 ' +
        deliveredTask.reward +
        ' 积分</button>'
    );
    return;
  }
  if (isTaskBoardUnlocked()) {
    openDialogue(
      "meg",
      "任务板就在墙上，自己挑吧。",
      '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="c"><kbd>C</kbd> 办理 M.E.G 人事业务</button>' +
        '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="b"><kbd>B</kbd> 知道了</button>' +
        aiChoiceHtml("l4_meg")
    );
    return;
  }
  openDialogue(
    "meg",
    "你想做任务吗？",
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="a"><kbd>A</kbd> 想</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="b"><kbd>B</kbd> 不想</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="c"><kbd>C</kbd> 办理 M.E.G 人事业务</button>' +
      aiChoiceHtml("l4_meg")
  );
}

function openL4CareerDialogue(text) {
  var choices =
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="a"><kbd>A</kbd> 申请加入 / 晋升</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="b"><kbd>B</kbd> 查询进度</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="c"><kbd>C</kbd> 提交纪律举报</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-bntg-choice="d"><kbd>D</kbd> 离开</button>';
  openDialogue("meg_career", text || describeMegCareer(), choices);
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G Level 4 人事联络员";
}

function applyL4Promotion() {
  var profile = getMegCareerProfile();
  var next = getNextMegRank(profile.rank);
  if (next !== "volunteer" && next !== "senior") {
    openL4CareerDialogue("本前哨只能办理志愿者登记和资深队员确认；其余认证须前往 Level 1 Alpha。");
    return;
  }
  applyForNextMegRank("", {
    hp: survival ? survival.hp : 0,
    sanity: survival ? survival.sanity : 0,
    dead: !survival || survival.dead,
  })
    .then(function (result) {
      openL4CareerDialogue(result.message || "编制手续已提交：" + describeMegCareer());
    })
    .catch(function (err) {
      openL4CareerDialogue("申请未通过：" + (err.message || "条件不足"));
    });
}

function submitL4Report() {
  var target = window.prompt("被举报者的后室玩家 ID");
  if (!target) return openL4CareerDialogue("已取消举报。");
  var reason = window.prompt(
    "举报原因：base_assault / task_sabotage / c101_abuse / rank_forgery / harassment"
  );
  if (!reason) return openL4CareerDialogue("已取消举报。");
  var statement = window.prompt("补充说明（玩家陈述不会标为已证实）") || "";
  submitMegReport(target.trim(), reason.trim(), statement, [])
    .then(function (result) {
      openL4CareerDialogue(result.message || "举报已立案。");
    })
    .catch(function (err) {
      openL4CareerDialogue("无法立案：" + (err.message || "单机档案拒绝请求"));
    });
}

function openL4MegStorage() {
  if (!hasMegPermission("storage")) {
    showLootToast("寄存柜仅向通过资质认证的 M.E.G 正式队员开放");
    return;
  }
  openBaseStorage({ toast: true });
}

/** 同意做任务：墙上挂出任务白板 */
function acceptMegTaskBoard() {
  closeBntgDialogue();
  if (isTaskBoardUnlocked()) return;
  unlockTaskBoard();
  // colliders / interactRoots 是同一数组引用，区块重建后无需重新取。
  if (level4World && level4World.rebuildOutpost) level4World.rebuildOutpost();
  showLootToast("M.E.G 成员在墙上挂出了任务白板 · 按 E 查看");
}

function tryTaskBoardE() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimTaskBoard()) return;
  openTaskBoard({
    onToast: function (msg) {
      showLootToast(msg);
    },
  });
}

function leaveLevel4(href) {
  var navigated = false;
  function go() {
    if (navigated) return;
    navigated = true;
    window.location.href = href;
  }
  // 音乐淡出由 requestAnimationFrame 驱动，页面被后台节流或音频异常时可能永不结束。
  // transitionLock 此时已锁住移动，所以必须有兜底计时器保证一定离开本层。
  window.setTimeout(go, MUSIC_FADE_OUT_MS + 400);
  fadeOutLevel4Music(MUSIC_FADE_OUT_MS).then(go, go);
}

function exitToL1BntgBase() {
  if (transitionLock) return;
  transitionLock = true;
  closeBntgDialogue();
  showLootToast("B.N.T.G. 联络员带你前往独立基地…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l1_bntg", fps.yaw);
  queueEnterLevelBanner("Level 1 · B.N.T.G. 基地");
  leaveLevel4("backrooms-level1-bntg-base.html");
}

function handleBntgChoice(choice) {
  if (!dialogueOpen || isAiChatOpen()) return;
  var kind = dialogueKind;
  // 先关闭对话再执行后续逻辑：任何一步抛错都不会把玩家永久锁在
  // dialogueOpen 状态里（那会同时吞掉所有按键并冻结移动）。
  closeBntgDialogue();
  if (kind === "meg_career") {
    if (choice === "a") applyL4Promotion();
    else if (choice === "b") openL4CareerDialogue(describeMegCareer());
    else if (choice === "c") submitL4Report();
    return;
  }
  if (kind === "meg" && choice === "c") {
    openL4CareerDialogue();
    return;
  }
  if (choice !== "a") return;

  if (kind === "meg_reward") {
    var task = getFirstDeliveredUnclaimedTask();
    if (!task) return;
    var result = claimTaskReward(task.id);
    if (!result.ok) {
      showLootToast(result.reason || "无法领取奖励");
      return;
    }
    updateMegPointsDisplay(megPointsEl);
    var msg = "任务完成：" + task.title + " · +" + result.reward + " 积分";
    if (result.cooldownNote) msg += " · " + result.cooldownNote;
    showLootToast(msg);
  } else if (kind === "meg") {
    acceptMegTaskBoard();
  } else {
    exitToL1BntgBase();
  }
}

function tryWaterCoolerQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimWaterCooler()) return;
  var coolerId = aimedCoolerId();
  // 每台饮水机只出一瓶，避免对着同一台无限接水。
  if (drainedCoolers.has(coolerId)) {
    showLootToast("这台饮水机已经空了");
    return;
  }
  if (!survival.addItem({ id: "almond_water", name: "杏仁水" })) {
    showLootToast("背包已满");
    return;
  }
  markCoolerDrained(coolerId);
  saveBackroomsSurvival(survival);
  showLootToast("接了一瓶杏仁水 · 这台饮水机空了");
}

function exitToLevel6() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("你走下楼梯——黑暗吞没了灯光…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l6", fps.yaw);
  queueEnterLevelNumber(6);
  leaveLevel4("backrooms-level6.html");
}

function exitToLevel61() {
  if (transitionLock) return;
  transitionLock = true;
  showLootToast("你挤进了自动售货机…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l6_1", fps.yaw);
  queueEnterLevelNumber("6.1");
  leaveLevel4("backrooms-level6-1.html");
}

function tryStairsQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimStairsDown()) return;
  exitToLevel6();
}

function tryVendingQ() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  if (!isAimVendingL61()) return;
  exitToLevel61();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isBaseStorageOpen() || dialogueOpen || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      // 任务板 / 成就面板优先吃掉按键（也负责 Y 开关面板）
      if (!dialogueOpen && !isInventoryOpen() && !isBaseStorageOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (dialogueOpen) {
        if (e.code === "KeyA" && !e.repeat) {
          e.preventDefault();
          handleBntgChoice("a");
          return true;
        }
        if ((e.code === "KeyB" || e.code === "Escape") && !e.repeat) {
          e.preventDefault();
          handleBntgChoice("b");
          return true;
        }
        if (e.code === "KeyC" && !e.repeat) {
          e.preventDefault();
          handleBntgChoice("c");
          return true;
        }
        if (e.code === "KeyD" && !e.repeat && dialogueKind === "meg_career") {
          e.preventDefault();
          handleBntgChoice("d");
          return true;
        }
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        if (isAimTaskBoard()) tryTaskBoardE();
        else tryCoolerInspectE();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        if (isAimStairsDown()) tryStairsQ();
        else if (isAimVendingL61()) tryVendingQ();
        else if (isAimBntgLiaison()) openBntgDialogue();
        else if (isAimMegMember()) openMegDialogue();
        else if (isAimStorageClerk()) openL4MegStorage();
        else tryWaterCoolerQ();
        return true;
      }
      return false;
    },
    onPointerLockChange: function (locked) {
      if (locked) startLevel4Music();
      syncLookUi();
    },
  });
  if (dialogueChoicesEl) {
    dialogueChoicesEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-bntg-choice]");
      if (!btn) return;
      handleBntgChoice(btn.getAttribute("data-bntg-choice"));
    });
  }
  bindBackroomsWindowResize(renderer, camera);
  bindLevel4Music();
}

function init() {
  if (!enforceEntryOrRedirect()) return;
  refreshLevel1_1OutpostChestsOnFirstL4Visit();
  loadDrainedCoolers();
  showEnterLevelBannerIfQueued();
  markLevelEntered("l4", showLootToast);
  initMegCareer({
    levelId: "l4",
    hudAnchor: megPointsEl ? megPointsEl.closest(".backrooms-points") : null,
    onError: function () {
      showLootToast("M.E.G 单机编制档案读取失败");
    },
  });
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  // L4 是唯一有平行光阴影的关卡；low 档关闭，high 档使用 PCFSoft
  renderer.shadowMap.enabled = gfx.shadows;
  if (gfx.shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var root = new THREE.Group();
  root.name = "BackroomsLevel4";
  scene.add(root);

  level4World = buildLevel4World(root, gfx);
  colliders = level4World.colliders;
  interactRoots = level4World.interactRoots;
  spawnX = level4World.spawnX;
  spawnZ = level4World.spawnZ;
  fps.player.x = spawnX;
  fps.player.z = spawnZ;

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
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
      if (useNightVisionPotionFromBackpack()) syncLookUi();
    },
    onRoyalRationsUsed: function () {
      showLootToast("皇家口粮 · 10 分钟强化");
    },
  });
  installMegCheckpointDeathHooks(
    survival,
    function () {
      return { level: 4 };
    },
    {
      beforeNavigate: function () {
        return fadeOutLevel4Music(MUSIC_FADE_OUT_MS);
      },
    }
  );

  initBackroomsTemperature(4, { rootEl: tempRootEl, fillEl: tempFillEl, valueEl: tempValueEl });
  updateMegPointsDisplay(megPointsEl);
  bindControls();
  syncLookUi();

  var clock = new THREE.Clock();
  startGuardedRafLoop({
    label: "Backrooms L4",
    showError: showError,
    tick: function () {
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.bodyHeight = BODY_HEIGHT;
    _physOpts.ceilingY = L4_WALL_H;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isBaseStorageOpen() &&
      !transitionLock &&
      !dialogueOpen &&
      !isTaskUiOpen()
    ) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 16);
      });
    }
    if (level4World) level4World.update(fps.player.x, fps.player.z);
    updateAimPick();
    updateWaterHint();
    updateInteractHint();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (crosshairEl) {
      var hideXh =
        isInventoryOpen() ||
        isBaseStorageOpen() ||
        dialogueOpen ||
        isTaskUiOpen() ||
        !survival ||
        survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hideXh);
      crosshairEl.classList.toggle(
        "backrooms-crosshair--interact",
        !hideXh &&
          ((isAimWaterCooler() && !isAimedCoolerDrained()) ||
            isAimStairsDown() ||
            isAimVendingL61() ||
            isAimBntgLiaison() ||
            isAimMegMember() ||
            isAimTaskBoard())
      );
    }
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    renderer.render(scene, camera);
    },
  });
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L4]", err);
  showError(err.message || String(err));
}

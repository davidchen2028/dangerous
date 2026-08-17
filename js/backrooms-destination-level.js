/**
 * Level 10 / 11 / 75 基础目的地场景（后续可独立扩展）
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import {
  toggleBackpack,
  openBackpack,
  closeBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  setInventorySellMode,
  clearInventorySellPick,
  removeItemAt,
  removeFirstItem,
  countItem,
  addItem,
  addAlmondWater,
  addFireSalt,
  countUsedSlots,
  BACKPACK_CAPACITY,
} from "./backrooms-inventory.js";
import {
  updateMegPointsDisplay,
  getMegPoints,
  addMegPoints,
} from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  isPetrifyActive,
  getPetrify,
  setPetrify,
  clearPetrify,
  ensurePetrifyOverlay,
  updatePetrifyOverlay,
  petrifySpeedMul,
} from "./backrooms-petrify.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { getBuyPrice, getSellPrice } from "./backrooms-shop-prices.js";
import {
  tryBeginMerchantTrade,
  shouldGiveLuckyMerchantGift,
  getMerchantLockRemainingMs,
} from "./backrooms-luck.js";
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
import { buildLevel11World } from "./backrooms-level11-world.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

const levelRaw = document.body.dataset.level || "9";
const level = Number(levelRaw);
const passId =
  level === 75
    ? "l75"
    : level === 11
      ? "l11"
      : level === 10
        ? "l10"
        : "l9";
const wallH = level === 75 ? 5 : 4;
const levelLabel = String(level);
const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");
const interactHintEl = document.getElementById("backroomsInteractHint");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");
let renderer;
let camera;
let scene;
let survival;
let lootToastUntil = 0;
let colliders = [];
let levelWorld = null;
let transitionLock = false;
let interactRoots = [];
let currentAimPick = null;
let dialogueOpen = false;
let vendorMode = false;
let buyerMode = false;
/** @type {null | { id: string, label: string, cost: number }} */
let pendingVendorPurchase = null;
/** @type {null | { source: "backpack" | "hotbar", index: number, id: string, name: string, price: number }} */
let pendingSale = null;
let bulkSellPromptEl = null;
let bulkSellPromptTimer = null;
let sandFaintTimer = 0;
let sandFaintOverlay = null;
/** 来自 C-1290 希腊拱门的石化状态，在 L11 继续蔓延 */
let petrifyActive = false;
let petrifyValue = 0;
let petrifyStage = -1;

/** L10 岔路：主路 z≈22 向右拐的小道尽头 → L11 */
const L10_FORK_Z = 22;
const L10_FORK_EXIT_X = 24;
/** L75 管道深处的橙色地面 → L16 冰层 */
const L75_ORANGE_X = 8.5;
const L75_ORANGE_Z = 14.5;
const L75_ORANGE_HALF = 1.6;
const AIM_MAX = 4.2;
const SAND_FAINT_DURATION = 4.5;
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});

/** 每帧复用，避免 update 循环字面量分配 */
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  ceilingY: wallH,
};

function showToast(msg) {
  showBackroomsLootToast(msg, { durationMs: 2500 });
  lootToastUntil = performance.now() + 2500;
}

/** L11 中继续的石化进程（来自 C-1290 希腊拱门）：约 1 分钟满 */
const PETRIFY_L11_SECONDS = 60;

function updatePetrifyContinuation(dt) {
  if (!survival || survival.dead || transitionLock) return;
  petrifyValue = Math.min(1, petrifyValue + dt / PETRIFY_L11_SECONDS);
  setPetrify(petrifyValue);
  updatePetrifyOverlay(petrifyValue);
  if (survival.sanity > 18) {
    survival.sanity = Math.max(18, survival.sanity - 0.5 * dt);
  }
  var stage = petrifyValue >= 0.8 ? 3 : petrifyValue >= 0.55 ? 2 : petrifyValue >= 0.25 ? 1 : 0;
  if (stage > petrifyStage) {
    petrifyStage = stage;
    if (stage === 1) showToast("一种宁静的倦怠涌上来……你不太想再挣扎了。");
    else if (stage === 2) showToast("皮肤下透出大理石般的纹理，正从手脚向躯干蔓延。");
    else if (stage === 3) showToast("身体越来越沉重，几乎抬不动脚。");
  }
  if (petrifyValue >= 1) {
    // 完全石化：清理状态后死亡
    petrifyActive = false;
    clearPetrify();
    survival.triggerDeath("petrify");
  }
}

/** 离开 L11 前主动结束石化（避免状态无限蔓延到无关层级） */
function endPetrifyOnExit() {
  if (!petrifyActive) return;
  petrifyActive = false;
  clearPetrify();
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
}

function buildLevel9(root) {
  var groundMat = new THREE.MeshStandardMaterial({ color: 0x121518, roughness: 1 });
  var houseMat = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.95 });
  addBox(root, 50, 0.15, 50, 0, 0.02, 0, groundMat);
  var i;
  for (i = 0; i < 18; i++) {
    var side = i % 2 ? 1 : -1;
    var z = -20 + Math.floor(i / 2) * 5;
    addBox(root, 7, 3.8, 4, side * 10, 1.9, z, houseMat);
  }
  colliders.push(wallCollider(-25, -23.5, -25, 25));
  colliders.push(wallCollider(23.5, 25, -25, 25));
  colliders.push(wallCollider(-25, 25, -25, -23.5));
  colliders.push(wallCollider(-25, 25, 23.5, 25));
  var moon = new THREE.DirectionalLight(0x9db4d0, 1.1);
  moon.position.set(-10, 20, -8);
  root.add(moon);
  root.add(new THREE.AmbientLight(0x27313d, 0.5));
}

function buildLevel75(root) {
  var metal = new THREE.MeshStandardMaterial({
    color: 0x747d86,
    metalness: 0.82,
    roughness: 0.32,
  });
  var floor = new THREE.MeshStandardMaterial({
    color: 0x343a40,
    metalness: 0.6,
    roughness: 0.45,
  });
  addBox(root, 26, 0.15, 36, 0, 0.02, 0, floor);
  addBox(root, 0.25, wallH, 36, -13, wallH * 0.5, 0, metal);
  addBox(root, 0.25, wallH, 36, 13, wallH * 0.5, 0, metal);
  addBox(root, 26, wallH, 0.25, 0, wallH * 0.5, -18, metal);
  addBox(root, 26, wallH, 0.25, 0, wallH * 0.5, 18, metal);
  addBox(root, 26, 0.18, 36, 0, wallH, 0, metal);
  colliders.push(wallCollider(-13.2, -12.7, -18, 18));
  colliders.push(wallCollider(12.7, 13.2, -18, 18));
  colliders.push(wallCollider(-13, 13, -18.2, -17.7));
  colliders.push(wallCollider(-13, 13, 17.7, 18.2));
  var i;
  for (i = -14; i <= 14; i += 4) {
    var light = new THREE.PointLight(0xc8e2ff, 0.75, 10, 2);
    light.position.set(0, 4.2, i);
    root.add(light);
  }
  // 管道深处地面上的一块橙色区域：踩上去会被带到 Level 16。
  var orange = new THREE.MeshStandardMaterial({
    color: 0xd4762a,
    emissive: 0x3a1a06,
    emissiveIntensity: 0.5,
    roughness: 0.7,
    metalness: 0.15,
  });
  addBox(
    root,
    L75_ORANGE_HALF * 2,
    0.06,
    L75_ORANGE_HALF * 2,
    L75_ORANGE_X,
    0.12,
    L75_ORANGE_Z,
    orange
  );
  var glow = new THREE.PointLight(0xff9a48, 0.7, 9, 2);
  glow.position.set(L75_ORANGE_X, 1.4, L75_ORANGE_Z);
  root.add(glow);
  root.add(new THREE.AmbientLight(0x64707c, 0.55));
}

function isLevel75OrangePatch(px, pz) {
  return (
    Math.abs(px - L75_ORANGE_X) <= L75_ORANGE_HALF &&
    Math.abs(pz - L75_ORANGE_Z) <= L75_ORANGE_HALF
  );
}

function exitLevel75ToL16() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("橙色的地面下传来风声，寒气涌上来…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l16", fps.yaw);
  queueEnterLevelNumber(16);
  window.setTimeout(function () {
    window.location.href = "backrooms-level16.html";
  }, 550);
}

function buildLevel10(root) {
  var field = new THREE.MeshStandardMaterial({ color: 0xb6a85b, roughness: 1 });
  var path = new THREE.MeshStandardMaterial({ color: 0xb9ad92, roughness: 0.96 });
  var trail = new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 0.94 });
  var trailEnd = new THREE.MeshStandardMaterial({
    color: 0x8a9aa8,
    emissive: 0x2a4050,
    emissiveIntensity: 0.18,
    roughness: 0.9,
  });
  var barn = new THREE.MeshStandardMaterial({ color: 0x9c5541, roughness: 0.9 });

  addBox(root, 90, 0.16, 90, 0, 0, 0, field);
  // 主土路（沿 +Z）
  addBox(root, 4, 0.08, 90, 0, 0.1, 0, path);
  // 岔路：在 z=22 向 +X 拐出的窄小道
  addBox(root, 28, 0.09, 2.2, 14, 0.11, L10_FORK_Z, trail);
  // 岔口衔接（主路与小道交汇处略宽）
  addBox(root, 5.2, 0.095, 5.2, 0, 0.105, L10_FORK_Z, trail);
  // 小道尽头：色调偏城市灰蓝，暗示出口
  addBox(root, 4.5, 0.1, 3.2, L10_FORK_EXIT_X + 1.2, 0.12, L10_FORK_Z, trailEnd);

  // 谷仓放左侧，避开右侧岔路
  addBox(root, 11, 5, 8, -15, 2.5, 8, barn);
  colliders.push(wallCollider(-20.5, -9.5, 4, 12));

  // 田野边界，避免走出场景
  colliders.push(wallCollider(-45.5, -44.5, -45, 45));
  colliders.push(wallCollider(44.5, 45.5, -45, 45));
  colliders.push(wallCollider(-45, 45, -45.5, -44.5));
  colliders.push(wallCollider(-45, 45, 44.5, 45.5));

  root.add(new THREE.HemisphereLight(0xeef8ff, 0x8b7b43, 1.45));
  var sun = new THREE.DirectionalLight(0xfff1c6, 1.5);
  sun.position.set(-18, 28, -12);
  root.add(sun);
}

function isLevel10ForkToL11(px, pz) {
  return px >= L10_FORK_EXIT_X && Math.abs(pz - L10_FORK_Z) <= 1.7;
}

function exitLevel10ToL11() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("小道尽头，空气变得像城市…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l11", fps.yaw);
  queueEnterLevelNumber(11);
  window.setTimeout(function () {
    window.location.href = "backrooms-level11.html";
  }, 450);
}

function exitLevel11ToL13() {
  if (transitionLock) return;
  transitionLock = true;
  endPetrifyOnExit();
  showToast("你走进了黄色高楼…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l13", fps.yaw);
  queueEnterLevelNumber(13);
  window.setTimeout(function () {
    window.location.href = "backrooms-level13.html";
  }, 450);
}

function exitLevel11ToL119() {
  if (transitionLock) return;
  transitionLock = true;
  endPetrifyOnExit();
  showToast("你推开 Alom Wotor 的门——一股氯水味扑面而来…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l119", fps.yaw);
  queueEnterLevelNumber(119);
  window.setTimeout(function () {
    window.location.href = "backrooms-level119.html";
  }, 450);
}

/**
 * L11 左侧街的三栋异常建筑 → C-129x 死区。
 * @param {"c1291"} pass
 */
function exitLevel11ToCLevel(pass, page, toast) {
  if (transitionLock) return;
  transitionLock = true;
  endPetrifyOnExit();
  showToast(toast);
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass(pass, fps.yaw);
  queueEnterLevelBanner(C_LEVEL_BANNERS[pass] || "Level " + pass);
  window.setTimeout(function () {
    window.location.href = page;
  }, 600);
}

const C_LEVEL_BANNERS = {
  c1291: "Level C-1291 · 井盖迷阵",
};

function ensureSandFaintOverlay() {
  if (sandFaintOverlay) return sandFaintOverlay;
  sandFaintOverlay = document.createElement("div");
  sandFaintOverlay.id = "backroomsL11SandFaint";
  sandFaintOverlay.setAttribute("aria-hidden", "true");
  sandFaintOverlay.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:95;" +
    "background:#000;opacity:0;transition:opacity 0.55s linear;";
  document.body.appendChild(sandFaintOverlay);
  return sandFaintOverlay;
}

function exitLevel11ToL48() {
  if (transitionLock) return;
  transitionLock = true;
  ensureSandFaintOverlay().style.opacity = "1";
  endPetrifyOnExit();
  showToast("沙子灌进喉咙——你晕了过去…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l48", fps.yaw);
  queueEnterLevelNumber(48);
  window.setTimeout(function () {
    window.location.href = "backrooms-level48.html";
  }, 900);
}

function restoreDefaultHint() {
  if (!hintEl) return;
  if (level === 10) {
    hintEl.innerHTML =
      "Level 10 · 沿土路前进 · 留意岔路小道 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  } else if (level === 75) {
    hintEl.innerHTML =
      "Level 75 · 管道深处有一块橙色的地面 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  } else {
    hintEl.innerHTML =
      "Level " +
      levelLabel +
      " · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  }
}

function updateSandRoomFaint(dt) {
  if (level !== 11 || transitionLock || !levelWorld || !levelWorld.isLevel48SandRoom) {
    if (sandFaintTimer > 0) restoreDefaultHint();
    sandFaintTimer = 0;
    if (sandFaintOverlay) sandFaintOverlay.style.opacity = "0";
    return;
  }
  if (!survival || survival.dead || dialogueOpen) return;
  if (levelWorld.isLevel48SandRoom(fps.player.x, fps.player.z)) {
    sandFaintTimer += dt;
    var progress = Math.min(1, sandFaintTimer / SAND_FAINT_DURATION);
    ensureSandFaintOverlay().style.opacity = String(progress * 0.95);
    if (hintEl && sandFaintTimer > 0.4) {
      hintEl.innerHTML =
        "沙子房间……意识逐渐模糊（" +
        Math.max(0, Math.ceil(SAND_FAINT_DURATION - sandFaintTimer)) +
        "）";
    }
    if (sandFaintTimer >= SAND_FAINT_DURATION) exitLevel11ToL48();
  } else {
    // 离开沙子房间：立刻清掉底部提示，暗化继续淡出
    if (sandFaintTimer > 0) restoreDefaultHint();
    if (sandFaintTimer > 0) sandFaintTimer = Math.max(0, sandFaintTimer - dt * 1.6);
    if (sandFaintOverlay) {
      sandFaintOverlay.style.opacity = String(
        Math.min(0.95, (sandFaintTimer / SAND_FAINT_DURATION) * 0.95)
      );
    }
  }
}

function refreshAimPick() {
  if (!camera || dialogueOpen || isInventoryOpen() || !interactRoots.length) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function resolveInteract() {
  return currentAimPick && currentAimPick.distance <= AIM_MAX
    ? currentAimPick.data
    : null;
}

function updateInteractUi() {
  var data = resolveInteract();
  var hidden = isInventoryOpen() || dialogueOpen || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML =
        data.kind === "l11_bntg_buyer"
          ? "B.N.T.G 收购员 · 按 <kbd>Q</kbd> 出售物资"
          : "B.N.T.G 员工 · 按 <kbd>Q</kbd> 交易";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen() || dialogueOpen);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function closeDialogue() {
  var wasBuying = buyerMode;
  dialogueOpen = false;
  vendorMode = false;
  buyerMode = false;
  pendingVendorPurchase = null;
  pendingSale = null;
  clearBulkSellPrompt();
  document.body.classList.remove("backrooms-dialogue-open");
  if (wasBuying) {
    document.body.classList.remove("backrooms-shop-sell");
    setInventorySellMode(null);
    closeBackpack();
  }
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

/* ----------------------------- B.N.T.G 商店 ----------------------------- */

const BNTG_ITEMS = [
  { id: "almond", label: "杏仁水", cost: getBuyPrice("almond_water") },
  { id: "firesalt", label: "小块可爆炸火盐", cost: getBuyPrice("fire_salt") },
  {
    id: "royal_min",
    label: "最小有效分量皇家口粮",
    cost: getBuyPrice("royal_rations"),
  },
  {
    id: "royal_medium",
    label: "中等大小皇家口粮",
    cost: getBuyPrice("royal_rations_medium"),
  },
  {
    id: "viewer",
    label: "一次性查看工具（Level C-11 档案）",
    cost: getBuyPrice("archive_c11"),
  },
  {
    id: "escort_l0",
    label: "护送服务 · 前往 Level 0",
    cost: getBuyPrice("escort_l0"),
  },
  {
    id: "escort_l4",
    label: "护送服务 · 前往 Level 4",
    cost: getBuyPrice("escort_l4"),
  },
  {
    id: "escort_l61",
    label: "护送服务 · 前往 Level 6.1",
    cost: getBuyPrice("escort_l61"),
  },
];

function renderVendorMenu(note) {
  if (!dialogueEl || !dialogueTextEl) return;
  pendingVendorPurchase = null;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "B.N.T.G 员工";
  var points = getMegPoints();
  dialogueTextEl.textContent =
    (note ? note + "　" : "欢迎光临。") + "（当前积分点：" + points + "）";
  if (dialogueChoicesEl) {
    dialogueChoicesEl.hidden = false;
    var html = "";
    var i;
    for (i = 0; i < BNTG_ITEMS.length; i++) {
      var it = BNTG_ITEMS[i];
      var afford = points >= it.cost;
      html +=
        '<button type="button" class="backrooms-dialogue__choice" data-vendor="' +
        it.id +
        '"' +
        (afford ? "" : ' style="opacity:0.5"') +
        "><kbd>" +
        (i + 1) +
        "</kbd> " +
        it.label +
        " · " +
        it.cost +
        " 积分点</button>";
    }
    html +=
      '<button type="button" class="backrooms-dialogue__choice" data-vendor="close"><kbd>Esc</kbd> 离开</button>';
    dialogueChoicesEl.innerHTML = html;
  }
}

function renderVendorConfirm(def) {
  if (!dialogueTextEl || !dialogueChoicesEl) return;
  pendingVendorPurchase = def;
  dialogueTextEl.textContent =
    def.label + "，价格 " + def.cost + " 积分点。按 A 确认购买。";
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    '<button type="button" class="backrooms-dialogue__choice" data-vendor-confirm="yes"><kbd>A</kbd> 确认购买</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-vendor-confirm="back"><kbd>B</kbd> 返回商品列表</button>';
}

function openBntgVendor() {
  if (!dialogueEl || !dialogueTextEl) return;
  if (!tryBeginMerchantTrade()) {
    var seconds = Math.ceil(getMerchantLockRemainingMs() / 1000);
    showToast(
      "商人厌恶地避开了你，拒绝进行任何买卖 · " + seconds + " 秒后再试"
    );
    return;
  }
  dialogueOpen = true;
  vendorMode = true;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  renderVendorMenu(null);
  if (interactHintEl) interactHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function escortTo(pass, page, banner) {
  if (transitionLock) return;
  transitionLock = true;
  endPetrifyOnExit();
  closeDialogue();
  showToast("B.N.T.G 员工护送你前往 " + banner + "…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass(pass, fps.yaw);
  queueEnterLevelBanner(banner);
  window.setTimeout(function () {
    window.location.href = page;
  }, 500);
}

function selectVendorPurchase(id) {
  if (!vendorMode) return;
  if (id === "close") {
    closeDialogue();
    return;
  }
  var def = null;
  var i;
  for (i = 0; i < BNTG_ITEMS.length; i++) {
    if (BNTG_ITEMS[i].id === id) {
      def = BNTG_ITEMS[i];
      break;
    }
  }
  if (!def) return;
  renderVendorConfirm(def);
}

function confirmVendorPurchase() {
  if (!vendorMode || !pendingVendorPurchase) return;
  var def = pendingVendorPurchase;
  var id = def.id;
  if (getMegPoints() < def.cost) {
    renderVendorMenu("积分点不足。");
    return;
  }

  // 需要背包空间的物品：先确认能放下再扣分。
  if (
    id === "almond" ||
    id === "firesalt" ||
    id === "viewer" ||
    id === "royal_min" ||
    id === "royal_medium" ||
    id === "roulette"
  ) {
    var packFull = countUsedSlots() >= BACKPACK_CAPACITY;
    var ok = false;
    if (id === "almond") ok = addAlmondWater(1) > 0;
    else if (id === "firesalt") ok = addFireSalt(1) > 0;
    else if (id === "royal_min") {
      ok = addItem({ id: "royal_rations", name: "最小有效分量皇家口粮" });
    }
    else if (id === "royal_medium") {
      ok = addItem({ id: "royal_rations_medium", name: "中等大小皇家口粮" });
    } else if (id === "roulette") {
      ok = addItem({ id: "roulette", name: "后室轮盘赌" });
    } else ok = addItem({ id: "archive_c11", name: "C-11 档案查看器" });
    if (!ok) {
      renderVendorMenu(packFull ? "背包已满，无法购买。" : "无法放入物品。");
      return;
    }
    addMegPoints(-def.cost);
    updateMegPointsDisplay(megPointsEl);
    if (survival) survival.refreshHud();
    var giftNote = "";
    if (shouldGiveLuckyMerchantGift()) {
      var gift =
        Math.random() < 0.5
          ? { id: "almond_water", name: "杏仁水" }
          : { id: "fire_salt", name: "小块可爆炸火盐" };
      if (addItem(gift)) giftNote = " 商人额外赠送了" + gift.name + "。";
    }
    renderVendorMenu(
      "已购买：" + def.label + "。双击背包内物品即可使用。" + giftNote
    );
    return;
  }

  if (id === "escort_l0" || id === "escort_l4" || id === "escort_l61") {
    addMegPoints(-def.cost);
    updateMegPointsDisplay(megPointsEl);
    if (id === "escort_l0") escortTo("l0", "backrooms-level0.html", "Level 0");
    else if (id === "escort_l4") escortTo("l4", "backrooms-level4.html", "Level 4");
    else escortTo("l6_1", "backrooms-level6-1.html", "Level 6.1");
    return;
  }
}

/* --------------------------- B.N.T.G 收购员 --------------------------- */

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
    if (!buyerMode) return;
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
    showToast("全部售出 " + itemName + " ×" + sold + " · +" + total + " 积分点");
    showSellPrompt("已售出所有「" + itemName + "」。");
    clearBulkSellPrompt();
  });
  document.body.appendChild(prompt);
  bulkSellPromptEl = prompt;
  bulkSellPromptTimer = window.setTimeout(clearBulkSellPrompt, 8000);
}

function setSellChoicesIdle() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    '<button type="button" class="backrooms-dialogue__choice" data-sell="close"><kbd>Esc</kbd> 离开</button>';
}

function setSellChoicesConfirm() {
  if (!dialogueChoicesEl) return;
  dialogueChoicesEl.hidden = false;
  dialogueChoicesEl.innerHTML =
    '<button type="button" class="backrooms-dialogue__choice" data-sell="confirm"><kbd>A</kbd> 确认出售</button>' +
    '<button type="button" class="backrooms-dialogue__choice" data-sell="close"><kbd>B</kbd> 离开</button>';
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
  setSellChoicesIdle();
}

function onSellItemPicked(item, source, index) {
  if (!buyerMode) return;
  clearBulkSellPrompt();
  var price = getSellPrice(item.id);
  if (price == null) {
    pendingSale = null;
    clearInventorySellPick();
    if (dialogueTextEl) {
      dialogueTextEl.textContent = "「" + item.name + "」这东西我们不收，换别的吧。";
    }
    setSellChoicesIdle();
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
  setSellChoicesConfirm();
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
  showToast("售出 " + deal.name + " · +" + deal.price + " 积分点");
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

function openBntgBuyer() {
  if (!dialogueEl || !dialogueTextEl) return;
  if (!tryBeginMerchantTrade()) {
    var seconds = Math.ceil(getMerchantLockRemainingMs() / 1000);
    showToast(
      "收购员厌恶地避开了你，拒绝进行任何买卖 · " + seconds + " 秒后再试"
    );
    return;
  }
  dialogueOpen = true;
  buyerMode = true;
  pendingSale = null;
  document.body.classList.add("backrooms-dialogue-open");
  document.body.classList.add("backrooms-shop-sell");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "B.N.T.G 收购员";
  setInventorySellMode(onSellItemPicked);
  openBackpack();
  showSellPrompt("你好，物资我都收。");
  if (interactHintEl) interactHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function tryQAction() {
  if (dialogueOpen) return;
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "l11_bntg_vendor") openBntgVendor();
  else if (data && data.kind === "l11_bntg_buyer") openBntgBuyer();
}

function isChoiceKey(e, letter) {
  if (e.repeat) return false;
  if (e.code === "Key" + letter.toUpperCase()) return true;
  var key = e.key;
  return !!(key && key.length === 1 && key.toLowerCase() === letter);
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () { return isInventoryOpen() || dialogueOpen || isTaskUiOpen(); },
    onJump: function () { tryBackroomsJump(fps, 8); },
    onKeyDown: function (e) {
      if (!dialogueOpen && !isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (dialogueOpen) {
        if (buyerMode) {
          if (e.code === "Escape" && !e.repeat) {
            e.preventDefault();
            closeDialogue();
            return true;
          }
          if (pendingSale && isChoiceKey(e, "a")) {
            e.preventDefault();
            confirmSellPendingItem();
            return true;
          }
          if (isChoiceKey(e, "b")) {
            e.preventDefault();
            closeDialogue();
            return true;
          }
          return true;
        }
        if (vendorMode) {
          if (e.code === "Escape" && !e.repeat) {
            e.preventDefault();
            closeDialogue();
            return true;
          }
          if (pendingVendorPurchase) {
            if (isChoiceKey(e, "a")) {
              e.preventDefault();
              confirmVendorPurchase();
              return true;
            }
            if (isChoiceKey(e, "b")) {
              e.preventDefault();
              renderVendorMenu(null);
              return true;
            }
            return true;
          }
          if (!e.repeat && /^Digit[1-9]$/.test(e.code)) {
            e.preventDefault();
            var idx = parseInt(e.code.slice(5), 10) - 1;
            if (BNTG_ITEMS[idx]) selectVendorPurchase(BNTG_ITEMS[idx].id);
            return true;
          }
          return true;
        }
        if (isChoiceKey(e, "b") || (e.code === "Escape" && !e.repeat)) {
          e.preventDefault();
          closeDialogue();
          return true;
        }
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryQAction();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  if (dialogueChoicesEl) {
    dialogueChoicesEl.addEventListener("click", function (e) {
      var confirmBtn = e.target.closest("[data-vendor-confirm]");
      if (confirmBtn) {
        if (confirmBtn.getAttribute("data-vendor-confirm") === "yes") {
          confirmVendorPurchase();
        } else {
          renderVendorMenu(null);
        }
        return;
      }
      var vendorBtn = e.target.closest("[data-vendor]");
      if (vendorBtn) {
        selectVendorPurchase(vendorBtn.getAttribute("data-vendor"));
        return;
      }
      var sellBtn = e.target.closest("[data-sell]");
      if (sellBtn) {
        if (sellBtn.getAttribute("data-sell") === "confirm") confirmSellPendingItem();
        else closeDialogue();
      }
    });
  }
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry(passId, function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  if (level === 10) markLevelEntered("l10", showToast);
  else if (level === 11) markLevelEntered("l11", showToast);
  scene = new THREE.Scene();
  var outdoor = level === 10 || level === 11;
  var bg = level === 75 ? 0x303840 : outdoor ? 0xa7d9ed : 0x030509;
  scene.background = new THREE.Color(bg);
  scene.fog =
    level === 75
      ? new THREE.Fog(bg, 8, 42)
      : outdoor
        ? new THREE.Fog(bg, 55, 130)
        : new THREE.FogExp2(bg, 0.04);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  scene.add(root);
  if (level === 75) buildLevel75(root);
  else if (level === 11) {
    levelWorld = buildLevel11World(root);
    colliders = levelWorld.colliders;
    interactRoots = levelWorld.interactRoots || [];
    if (isPetrifyActive()) {
      petrifyActive = true;
      petrifyValue = getPetrify() || 0;
      ensurePetrifyOverlay();
      updatePetrifyOverlay(petrifyValue);
      showToast("石化仍在你身上蔓延……");
    }
  }
  else if (level === 10) buildLevel10(root);
  else buildLevel9(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () { showToast("杏仁水 · +15 血量 · +25 理智"); },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: level };
  });
  initBackroomsTemperature(level, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  restoreDefaultHint();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (levelWorld && levelWorld.update) {
      levelWorld.update(fps.player.x, fps.player.z);
    }
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    _physOpts.gravity = DEFAULT_GRAVITY;
    _physOpts.ceilingY = wallH;
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !dialogueOpen && !isTaskUiOpen()) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      if (petrifyActive) mul *= petrifySpeedMul(petrifyValue);
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders);
      });
    }
    if (petrifyActive) updatePetrifyContinuation(dt);
    if (
      level === 10 &&
      !transitionLock &&
      survival &&
      !survival.dead &&
      isLevel10ForkToL11(fps.player.x, fps.player.z)
    ) {
      exitLevel10ToL11();
    }
    if (
      level === 75 &&
      !transitionLock &&
      survival &&
      !survival.dead &&
      isLevel75OrangePatch(fps.player.x, fps.player.z)
    ) {
      exitLevel75ToL16();
    }
    if (
      level === 11 &&
      !transitionLock &&
      survival &&
      !survival.dead &&
      levelWorld &&
      levelWorld.isLevel13Entrance &&
      levelWorld.isLevel13Entrance(fps.player.x, fps.player.z)
    ) {
      exitLevel11ToL13();
    }
    if (
      level === 11 &&
      !transitionLock &&
      survival &&
      !survival.dead &&
      levelWorld &&
      levelWorld.isLevel119Entrance &&
      levelWorld.isLevel119Entrance(fps.player.x, fps.player.z)
    ) {
      exitLevel11ToL119();
    }
    if (level === 11 && !transitionLock && survival && !survival.dead && levelWorld) {
      if (
        levelWorld.isLevelC1291Entrance &&
        levelWorld.isLevelC1291Entrance(fps.player.x, fps.player.z)
      ) {
        exitLevel11ToCLevel(
          "c1291",
          "backrooms-level-c1291.html",
          "你走进漆黑的居民楼——脚下传来金属哐当的巨响…"
        );
      }
    }
    updateSandRoomFaint(dt);
    applyBackroomsCamera(fps, camera, 1.65);
    if (interactRoots.length) {
      refreshAimPick();
      updateInteractUi();
    }
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms destination]", err);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = "Level " + levelLabel + " 无法启动：" + (err.message || String(err));
  }
}

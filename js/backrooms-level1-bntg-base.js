/**
 * Level 1 · B.N.T.G. 独立基地
 * 该区域不与 Level 1 主地图物理连通，目前只开放银行大厅外观。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { aiChoiceHtml, isAiChatOpen, closeAiChat } from "./backrooms-ai-chat.js?v=2";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  addItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  rollTradeVault,
  claimTradeVault,
  formatTradeVaultResults,
  getTradeVaultPity,
  VAULT_SINGLE_COST,
  VAULT_TEN_COST,
} from "./backrooms-trade-vault.js";
import {
  tryBeginMerchantTrade,
  getMerchantLockRemainingMs,
  shouldGiveLuckyMerchantGift,
} from "./backrooms-luck.js";
import { handleTaskUiKey, isTaskUiOpen, noteVaultTenPull } from "./backrooms-tasks.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
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
  DEFAULT_BODY_HEIGHT,
} from "./backrooms-fps-controller.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";

const ROOM_W = 30;
const ROOM_D = 24;
const WALL_H = 3.4;
const EYE_HEIGHT = 1.65;
const JUMP_SPEED = 8;

/** 保险库领取间：与银行大厅同一场景，但放在远处互不干扰。 */
const VAULT_ROOM_X = 0;
const VAULT_ROOM_Z = 60;
const VAULT_ROOM_W = 9;
const VAULT_ROOM_D = 9;
const VAULT_TABLE_Z = VAULT_ROOM_Z - 1.5;
const VAULT_SPAWN_Z = VAULT_ROOM_Z + 1.8;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const promptEl = document.getElementById("backroomsInteractPrompt");
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");

let renderer;
let camera;
let scene;
let survival;
let colliders = [];
const interactRoots = [];
let aimKind = "";
let transitionLock = false;
let dialogueOpen = false;
let dialogueMode = "";
/** @type {null | { ok: boolean, pulls: number, rolls: object[] }} */
let pendingVaultDraw = null;
/** @type {null | { x: number, z: number, yaw: number }} */
let vaultReturnSpot = null;
/** 抽取结果落盘，刷新页面不会白扣积分。 */
const VAULT_PENDING_KEY = "backrooms_trade_vault_pending_v1";

function saveVaultPending() {
  try {
    if (!pendingVaultDraw) {
      sessionStorage.removeItem(VAULT_PENDING_KEY);
      return;
    }
    sessionStorage.setItem(
      VAULT_PENDING_KEY,
      JSON.stringify({ draw: pendingVaultDraw, back: vaultReturnSpot })
    );
  } catch (err) {
    /* ignore */
  }
}

function loadVaultPending() {
  try {
    var raw = sessionStorage.getItem(VAULT_PENDING_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || !data.draw || !Array.isArray(data.draw.rolls)) return false;
    pendingVaultDraw = data.draw;
    vaultReturnSpot = data.back || null;
    return true;
  } catch (err) {
    return false;
  }
}
const fps = createBackroomsFpsState({
  player: { x: 0, z: 8, radius: 0.32, speed: 4.1 },
});
const _survCtx = { sprinting: false };
const _physOpts = {
  gravity: DEFAULT_GRAVITY,
  bodyHeight: DEFAULT_BODY_HEIGHT,
  ceilingY: WALL_H,
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>B.N.T.G. 基地无法启动</strong></p><p>" + msg + "</p>";
}

function addBox(root, w, h, d, x, y, z, material) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addCollider(minX, maxX, minZ, maxZ) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  });
}

function makeLabelTexture(text, bg, fg) {
  var c = document.createElement("canvas");
  c.width = 768;
  c.height = 160;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = fg;
  ctx.font = "bold 62px Arial, PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addBntgEmployee(root, x, z) {
  var uniform = new THREE.MeshStandardMaterial({ color: 0x234f78, roughness: 0.72 });
  var dark = new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.78 });
  var skin = new THREE.MeshStandardMaterial({ color: 0xc99772, roughness: 0.82 });
  var white = new THREE.MeshStandardMaterial({ color: 0xeaf2f8, roughness: 0.65 });
  var npc = new THREE.Group();
  npc.name = "BntgBankEmployee";
  npc.position.set(x, 0, z);
  npc.userData.brInteract = { kind: "vault_employee" };
  addBox(npc, 0.42, 0.92, 0.34, 0, 0.46, 0, dark);
  addBox(npc, 0.7, 0.75, 0.4, 0, 1.22, 0, uniform);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), skin);
  head.position.y = 1.84;
  npc.add(head);
  addBox(npc, 0.17, 0.11, 0.03, 0.22, 1.3, 0.22, white);
  root.add(npc);
  interactRoots.push(npc);
}

/** 保险库领取间：四面封死的小房间，中央一张桌子用来领取抽奖结果。 */
function buildVaultRoom(root) {
  var x = VAULT_ROOM_X;
  var z = VAULT_ROOM_Z;
  var W = VAULT_ROOM_W;
  var D = VAULT_ROOM_D;
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x3d444d, roughness: 0.92 });
  var wallMat = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.88 });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0xd8e0e6,
    emissive: 0xc4d2da,
    emissiveIntensity: 0.16,
    roughness: 0.8,
  });
  var tableMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2b, roughness: 0.7 });
  var legMat = new THREE.MeshStandardMaterial({ color: 0x2d2118, roughness: 0.8 });

  addBox(root, W, 0.16, D, x, 0, z, floorMat);
  addBox(root, W, 0.12, D, x, WALL_H, z, ceilMat);
  addBox(root, W, WALL_H, 0.25, x, WALL_H / 2, z - D / 2, wallMat);
  addBox(root, W, WALL_H, 0.25, x, WALL_H / 2, z + D / 2, wallMat);
  addBox(root, 0.25, WALL_H, D, x - W / 2, WALL_H / 2, z, wallMat);
  addBox(root, 0.25, WALL_H, D, x + W / 2, WALL_H / 2, z, wallMat);
  addCollider(x - W / 2, x + W / 2, z - D / 2 - 0.2, z - D / 2 + 0.3);
  addCollider(x - W / 2, x + W / 2, z + D / 2 - 0.3, z + D / 2 + 0.2);
  addCollider(x - W / 2 - 0.2, x - W / 2 + 0.3, z - D / 2, z + D / 2);
  addCollider(x + W / 2 - 0.3, x + W / 2 + 0.2, z - D / 2, z + D / 2);

  var signMat = new THREE.MeshStandardMaterial({
    map: makeLabelTexture("交易保险库 · 领取间", "#22303d", "#ffe0a8"),
    roughness: 0.55,
  });
  addBox(root, 5, 0.8, 0.08, x, 2.5, z - D / 2 + 0.2, signMat);

  addBox(root, 2.2, 0.12, 1.2, x, 0.92, VAULT_TABLE_Z, tableMat);
  addBox(root, 0.14, 0.86, 0.14, x - 0.95, 0.47, VAULT_TABLE_Z - 0.45, legMat);
  addBox(root, 0.14, 0.86, 0.14, x + 0.95, 0.47, VAULT_TABLE_Z - 0.45, legMat);
  addBox(root, 0.14, 0.86, 0.14, x - 0.95, 0.47, VAULT_TABLE_Z + 0.45, legMat);
  addBox(root, 0.14, 0.86, 0.14, x + 0.95, 0.47, VAULT_TABLE_Z + 0.45, legMat);
  addCollider(x - 1.15, x + 1.15, VAULT_TABLE_Z - 0.65, VAULT_TABLE_Z + 0.65);

  // 桌上的保险箱：给玩家一个明显的取货目标。
  var crateMat = new THREE.MeshStandardMaterial({
    color: 0x2f4a63,
    emissive: 0x14283c,
    emissiveIntensity: 0.35,
    roughness: 0.6,
    metalness: 0.25,
  });
  addBox(root, 0.9, 0.52, 0.62, x, 1.24, VAULT_TABLE_Z, crateMat);

  // 视线高度的不可见拾取盒，平视即可对准，不必低头找桌面。
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.6, 1.3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, 1.4, VAULT_TABLE_Z);
  pick.userData.brInteract = { kind: "vault_table" };
  root.add(pick);
  interactRoots.push(pick);

  var lamp = new THREE.PointLight(0xffe9c4, 1.15, 14, 1.6);
  lamp.position.set(x, 2.9, z);
  root.add(lamp);
}

function buildWorld(root) {
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x66717b, roughness: 0.9 });
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xc9d0d5, roughness: 0.86 });
  var ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xe8edf0,
    emissive: 0xdde7ec,
    emissiveIntensity: 0.12,
    roughness: 0.82,
  });
  var blueMat = new THREE.MeshStandardMaterial({ color: 0x173f63, roughness: 0.68 });
  var counterMat = new THREE.MeshStandardMaterial({ color: 0x4b3426, roughness: 0.75 });
  var glassMat = new THREE.MeshStandardMaterial({
    color: 0x9ed8ed,
    transparent: true,
    opacity: 0.36,
    roughness: 0.16,
    metalness: 0.18,
    depthWrite: false,
  });

  addBox(root, ROOM_W, 0.16, ROOM_D, 0, 0, 0, floorMat);
  addBox(root, ROOM_W, 0.12, ROOM_D, 0, WALL_H, 0, ceilingMat);
  addBox(root, ROOM_W, WALL_H, 0.25, 0, WALL_H / 2, -ROOM_D / 2, wallMat);
  addBox(root, ROOM_W, WALL_H, 0.25, 0, WALL_H / 2, ROOM_D / 2, wallMat);
  addBox(root, 0.25, WALL_H, ROOM_D, -ROOM_W / 2, WALL_H / 2, 0, wallMat);
  addBox(root, 0.25, WALL_H, ROOM_D, ROOM_W / 2, WALL_H / 2, 0, wallMat);
  addCollider(-ROOM_W / 2, ROOM_W / 2, -ROOM_D / 2 - 0.2, -ROOM_D / 2 + 0.3);
  addCollider(-ROOM_W / 2, ROOM_W / 2, ROOM_D / 2 - 0.3, ROOM_D / 2 + 0.2);
  addCollider(-ROOM_W / 2 - 0.2, -ROOM_W / 2 + 0.3, -ROOM_D / 2, ROOM_D / 2);
  addCollider(ROOM_W / 2 - 0.3, ROOM_W / 2 + 0.2, -ROOM_D / 2, ROOM_D / 2);

  // 基地入口标识。
  var baseSignMat = new THREE.MeshStandardMaterial({
    map: makeLabelTexture("B.N.T.G. · LEVEL 1 独立基地", "#173f63", "#effaff"),
    roughness: 0.55,
  });
  addBox(root, 8.8, 1.15, 0.1, 0, 2.25, 11.78, baseSignMat);

  // 银行柜台与防护玻璃。切出到 Level 4 的交互面。
  var counter = addBox(root, 14, 1.1, 1.1, 0, 0.55, -5.7, counterMat);
  counter.userData.brInteract = { kind: "l4_clip" };
  interactRoots.push(counter);
  addCollider(-7.1, 7.1, -6.3, -5.1);
  // 柜台两端延伸至墙面的无形阻挡，玩家无法绕进员工工作区。
  addCollider(-ROOM_W / 2, -7, -6.3, -5.1);
  addCollider(7, ROOM_W / 2, -6.3, -5.1);
  addBox(root, 0.12, 1.25, 14, -7, 1.72, -5.7, glassMat);
  addBox(root, 0.12, 1.25, 14, 7, 1.72, -5.7, glassMat);
  var bankSignMat = new THREE.MeshStandardMaterial({
    map: makeLabelTexture("B.N.T.G. 银行", "#102b44", "#f1d38a"),
    roughness: 0.5,
  });
  addBox(root, 8, 0.95, 0.12, 0, 2.55, -11.75, bankSignMat);

  // 柜台窗口与员工；银行业务后续再实现。
  addBox(root, 3.6, 1.3, 0.06, -4.6, 1.7, -5.1, glassMat);
  addBox(root, 3.6, 1.3, 0.06, 0, 1.7, -5.1, glassMat);
  addBox(root, 3.6, 1.3, 0.06, 4.6, 1.7, -5.1, glassMat);
  addBntgEmployee(root, 0, -7.7);

  // 两侧机构门，暂未开放。
  addBox(root, 3.2, 2.7, 0.18, -11.2, 1.35, -11.7, blueMat);
  addBox(root, 3.2, 2.7, 0.18, 11.2, 1.35, -11.7, blueMat);

  buildVaultRoom(root);

  root.add(new THREE.AmbientLight(0xdce7ef, 0.58));
  root.add(new THREE.HemisphereLight(0xf5fbff, 0x65717b, 0.6));
  var light;
  var xs = [-9, -3, 3, 9];
  for (var i = 0; i < xs.length; i++) {
    light = new THREE.PointLight(0xe9f4ff, 0.72, 13, 1.5);
    light.position.set(xs[i], 2.9, i % 2 ? -3 : 4);
    root.add(light);
  }
}

function updateInteractionAim() {
  if (
    transitionLock ||
    dialogueOpen ||
    !camera ||
    isInventoryOpen() ||
    (survival && survival.dead)
  ) {
    aimKind = "";
  } else {
    var hit = pickCrosshairInteract(camera, interactRoots, 4.6);
    aimKind = hit && hit.data ? hit.data.kind || "" : "";
    if (aimKind === "vault_table" && !pendingVaultDraw) aimKind = "";
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !!aimKind);
  }
  if (promptEl) {
    if (aimKind === "l4_clip") {
      promptEl.hidden = false;
      promptEl.innerHTML = "按 <kbd>Q</kbd> 从柜台切出至 Level 4";
    } else if (aimKind === "vault_employee") {
      promptEl.hidden = false;
      promptEl.innerHTML = "按 <kbd>Q</kbd> 与银行人员交谈";
    } else if (aimKind === "vault_table") {
      promptEl.hidden = false;
      promptEl.innerHTML =
        "按 <kbd>Q</kbd> 领取本次抽取的 " + pendingVaultDraw.pulls + " 抽结果";
    } else {
      promptEl.hidden = true;
    }
  }
  if (!hintEl) return;
  hintEl.innerHTML =
    "B.N.T.G. 独立基地 · <kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>B</kbd> 背包";
}

function setDialogue(text, choices) {
  if (!dialogueEl || !dialogueTextEl || !dialogueChoicesEl) return;
  dialogueTextEl.textContent = text;
  dialogueTextEl.style.whiteSpace = "pre-line";
  dialogueChoicesEl.innerHTML = choices;
  dialogueEl.hidden = false;
  document.body.classList.add("backrooms-dialogue-open");
}

function openVaultPrompt() {
  if (dialogueOpen || transitionLock) return;
  if (!tryBeginMerchantTrade()) {
    var seconds = Math.ceil(getMerchantLockRemainingMs() / 1000);
    showBackroomsLootToast(
      "银行人员厌恶地避开了你，拒绝交易 · " + seconds + " 秒后再试",
      { durationMs: 3200 }
    );
    return;
  }
  dialogueOpen = true;
  dialogueMode = "prompt";
  setDialogue(
    "要体验交易保险库吗？",
    '<button type="button" class="backrooms-dialogue__choice" data-vault-choice="a"><kbd>A</kbd> 确认</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-vault-choice="b"><kbd>B</kbd> 不行</button>' +
      aiChoiceHtml("bntg_bank")
  );
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function showVaultMenu(message) {
  dialogueMode = "vault";
  var prefix = message ? message + "\n\n" : "";
  setDialogue(
    prefix +
      "交易保险库\n单抽 " +
      VAULT_SINGLE_COST +
      " 积分 / 十连 " +
      VAULT_TEN_COST +
      " 积分\n25 抽保底：" +
      getTradeVaultPity() +
      "/25",
    '<button type="button" class="backrooms-dialogue__choice" data-vault-choice="a"><kbd>A</kbd> 单抽</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-vault-choice="b"><kbd>B</kbd> 十连</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-vault-choice="c"><kbd>C</kbd> 离开</button>' +
      aiChoiceHtml("bntg_bank")
  );
}

function closeVaultDialogue() {
  closeAiChat();
  dialogueOpen = false;
  dialogueMode = "";
  if (dialogueEl) dialogueEl.hidden = true;
  document.body.classList.remove("backrooms-dialogue-open");
}

function handleVaultChoice(choice) {
  if (!dialogueOpen || isAiChatOpen()) return;
  if (dialogueMode === "prompt") {
    if (choice === "a") showVaultMenu("");
    else if (choice === "b") closeVaultDialogue();
    return;
  }
  if (dialogueMode !== "vault") return;
  if (choice === "c") {
    closeVaultDialogue();
    return;
  }
  if (choice !== "a" && choice !== "b") return;
  var roll = rollTradeVault(choice === "b" ? 10 : 1);
  updateMegPointsDisplay(megPointsEl);
  if (!roll.ok) {
    showVaultMenu(roll.reason || "抽取失败");
    return;
  }
  pendingVaultDraw = roll;
  closeVaultDialogue();
  // 十连抽在幸运豆奶幸运状态下完成 → 幸运眷顾
  if (choice === "b") noteVaultTenPull();
  enterVaultRoom();
}

/** 抽取后把玩家送进领取间，记下柜台前的站位以便原路送回。 */
function enterVaultRoom() {
  vaultReturnSpot = { x: fps.player.x, z: fps.player.z, yaw: fps.yaw };
  saveVaultPending();
  placeInVaultRoom();
  showBackroomsLootToast("保险库把你送进了一间小房间 · 桌上有你的东西", {
    durationMs: 3200,
  });
}

function placeInVaultRoom() {
  fps.player.x = VAULT_ROOM_X;
  fps.player.z = VAULT_SPAWN_Z;
  fps.yaw = 0; // 面向 -Z，正对桌子
  fps.pitch = 0;
}

function returnFromVaultRoom() {
  var spot = vaultReturnSpot;
  vaultReturnSpot = null;
  fps.player.x = spot ? spot.x : 0;
  fps.player.z = spot ? spot.z : -4.2;
  fps.yaw = spot ? spot.yaw : 0;
  fps.pitch = 0;
}

/** 在领取间的桌子上取货，随后传送回柜台前并汇报结果。 */
function claimVaultReward() {
  if (!pendingVaultDraw) return;
  var pending = pendingVaultDraw;
  pendingVaultDraw = null;
  saveVaultPending();
  var result = claimTradeVault(pending);
  if (result.ok && shouldGiveLuckyMerchantGift()) {
    var gift =
      Math.random() < 0.5
        ? { id: "almond_water", name: "杏仁水" }
        : { id: "fire_salt", name: "小块可爆炸火盐" };
    if (addItem(gift)) result.giftName = gift.name;
  }
  updateMegPointsDisplay(megPointsEl);
  if (survival) survival.refreshHud();
  var message = formatTradeVaultResults(result);
  if (result.giftName) {
    message += "\n银行人员额外赠送了" + result.giftName;
  }
  returnFromVaultRoom();
  dialogueOpen = true;
  showVaultMenu(message);
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function clipOutToLevel4() {
  if (transitionLock || aimKind !== "l4_clip") return;
  if (survival && survival.dead) return;
  transitionLock = true;
  try {
    saveBackroomsSurvival(survival);
    grantLevelPass("l4", fps.yaw);
  } catch (err) {
    /* ignore */
  }
  queueEnterLevelNumber(4);
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
  window.location.href = "backrooms-level4.html";
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
    onJump: function () {
      tryBackroomsJump(fps, JUMP_SPEED);
    },
    onKeyDown: function (e) {
      if (!dialogueOpen && !isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (dialogueOpen && !e.repeat) {
        if (e.code === "KeyA") handleVaultChoice("a");
        else if (e.code === "KeyB") handleVaultChoice("b");
        else if (e.code === "KeyC" || e.code === "Escape") handleVaultChoice("c");
        else return false;
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
        if (aimKind === "vault_employee") openVaultPrompt();
        else if (aimKind === "vault_table") claimVaultReward();
        else clipOutToLevel4();
        return true;
      }
      return false;
    },
  });
  if (dialogueChoicesEl) {
    dialogueChoicesEl.addEventListener("click", function (e) {
      var button = e.target.closest("[data-vault-choice]");
      if (!button) return;
      handleVaultChoice(button.getAttribute("data-vault-choice"));
    });
  }
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l1_bntg", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x73808a);
  scene.fog = new THREE.Fog(0x73808a, 12, 42);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  renderer.shadowMap.enabled = gfx.shadows;

  var root = new THREE.Group();
  root.name = "BackroomsL1BntgBase";
  scene.add(root);
  buildWorld(root);

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
      showBackroomsLootToast("杏仁水 · +15 血量 · +25 理智", { durationMs: 2200 });
    },
    onRoyalRationsUsed: function () {
      showBackroomsLootToast("皇家口粮 · 10 分钟强化", { durationMs: 2200 });
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "l1_bntg" };
  });
  initBackroomsTemperature(1, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  // 上次抽取还没领货（例如中途刷新），直接送回领取间，避免积分白扣。
  if (loadVaultPending()) placeInVaultRoom();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !dialogueOpen &&
      !isTaskUiOpen() &&
      !transitionLock
    ) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateInteractionAim();
    if (crosshairEl) {
      crosshairEl.classList.toggle(
        "backrooms-crosshair--hidden",
        isInventoryOpen() || dialogueOpen || !survival || survival.dead
      );
    }
    updateBackroomsTemperature(dt, performance.now());
    updateBackroomsHeatDamage(survival, performance.now());
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L1 BNTG Base]", err);
  showError(err.message || String(err));
}

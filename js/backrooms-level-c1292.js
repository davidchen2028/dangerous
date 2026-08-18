/**
 * Backrooms Level C-1292 — 项目：衰退瘾（死区）
 * 少年 Jones 正在崩坏的意识具象：研究所稳定期 → 空间崩坏期 → 终末重置期。
 * 本层没有出口、据点或传统实体，全部威胁来自记忆侵蚀与环境崩塌。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
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
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen, isTaskAccepted, recordReconSighting, getReconProgress, getReconRecordedKeys } from "./backrooms-tasks.js";
import { getLuck } from "./backrooms-luck.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
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

const EYE_HEIGHT = 1.65;
const LAB_HALF = 38;
const CENTER_RADIUS = 34;
const STABLE_MIN_SECONDS = 60;
const TERMINAL_FORCE_SECONDS = 240;
const FALL_DAMAGE = 72;
const CRACK_WARNING_SECONDS = 1.65;
const FALL_WARNING_SECONDS = 1.3;
/** 阅读任意一份 UEC 实验文档时的基础侵蚀加成 */
const DOC_EROSION_BONUS = 0.12;
const DOCS_TASK_ID = "docs_c1292";

/** 三份 UEC 官方实验文档：档案室 / 观测室 / 主控机房 */
const UEC_DOCS = [
  {
    id: "decay",
    room: "档案室",
    title: "实验项目【衰退】——记忆剥离实验报告",
    code: "UEC-M-1292-01",
    x: -22,
    z: 18,
    text: [
      "档案归属：UEC深层异常研究所 · 精神空间实验组",
      "适用层级：C-1292「项目：衰退瘾」",
      "档案状态：全部实验永久终止、实验失控、空间固化为死区",
      "",
      "实验编号：UEC-M-1292-01",
      "实验目的：精准剥离生命体负面创伤记忆，保留基础认知与自我意识，用于精神创伤修复、异常心理矫正，旨在研发可控的精神干预技术，治愈极端心理崩坏个体。",
      "",
      "实验对象：受试者Jones（12岁），重度精神解离、认知崩坏，无有效干预手段，自愿参与深层实验。",
      "",
      "实验过程：团队研发记忆干涉波段，定向扫描、剥离受试者大脑内的痛苦记忆片段。初期实验效果可控，受试者情绪趋于稳定，负面认知大幅消退。但持续干预后出现不可逆异常：设备无法区分记忆属性，开始无差别吞噬所有记忆，包括基础认知、行为逻辑、自我身份认知。",
      "",
      "实验失控现象：记忆侵蚀不再局限于受试者本身，衍生出空间传染性认知病变，命名为「衰退瘾」。该异常无需物理接触，近距离空气传播即可感染所有碳基生命体。被感染者会依次遗忘行为目标、道具用途、自我身份，视野出现像素噪点畸变，逐步丧失现实感知能力。",
      "",
      "实验结论：彻底失败。记忆无法被精准筛选剥离，认知侵蚀具备无限传染性。所有实验设备封存停用，该精神病变永久无法根治，会持续存在于实验具象化空间内。",
      "",
      "遗留环境表现：对应层级第一阶段，研究所环境稳定，仅存在轻度记忆衰退、视觉噪点侵蚀，无物理空间灾害。",
    ].join("\n"),
  },
  {
    id: "collapse",
    room: "观测室",
    title: "实验项目【崩塌】——意识现实具象化实验报告",
    code: "UEC-S-1292-02",
    x: 22,
    z: -14,
    text: [
      "档案归属：UEC深层异常研究所 · 精神空间实验组",
      "适用层级：C-1292「项目：衰退瘾」",
      "档案状态：全部实验永久终止、实验失控、空间固化为死区",
      "",
      "实验编号：UEC-S-1292-02",
      "实验目的：将受试者的精神世界、意识投影具象化为物理空间，搭建可控的意识模拟场景，用于观测、修复崩坏的精神认知，实现精神创伤的可视化修复。",
      "",
      "实验对象：持续处于认知崩坏状态的Jones，依托【衰退】实验的基础数据，开展空间具象化二次实验。",
      "",
      "实验过程：成功将受试者的精神废墟具象化为废弃研究所空间，也就是C-1292初始地貌。初期空间结构稳定，可正常观测、记录受试者精神状态。但随着受试者记忆持续衰退、精神彻底瓦解，意识崩坏信号同步反馈至物理空间，引发连锁空间坍塌反应。",
      "",
      "实验失控现象：受试者的精神崩溃完全映射现实空间，引发多重物理灾害：地面开裂无底虚空裂隙、高空凭空生成金属井盖与建筑残片持续坠落、墙体与房间结构消融消散、空间震动与爆破轰鸣持续生成。精神崩坏越剧烈，空间崩塌频率、灾害强度越高，无任何规律可循，无安全规避区域。",
      "",
      "实验结论：彻底失败。崩坏的意识会持续摧毁具象化空间，物理灾害与精神侵蚀双向叠加，空间完全失去可控性，无法开展任何修复工作。",
      "",
      "遗留环境表现：对应层级第二阶段，空间全面崩坏，坠落灾害、虚空裂隙、听觉幻觉全面激活，层级正式进入致命死区状态。",
    ].join("\n"),
  },
  {
    id: "reset",
    room: "主控机房",
    title: "实验项目【重置】——空间回滚修复程序报告",
    code: "UEC-R-1292-03",
    x: 0,
    z: -28,
    text: [
      "档案归属：UEC深层异常研究所 · 精神空间实验组",
      "适用层级：C-1292「项目：衰退瘾」",
      "档案状态：全部实验永久终止、实验失控、空间固化为死区",
      "",
      "实验编号：UEC-R-1292-03",
      "实验目的：研发空间强制重置程序，在意识空间彻底崩坏、实验完全失控后，一键回滚空间至初始稳定状态，清除灾害、终止侵蚀，实现实验场景的循环复用。",
      "",
      "实验过程：程序成功适配意识空间规则，可识别空间崩塌阈值、生命体存活状态。设定核心规则：当层级内所有生命体彻底消亡后，自动触发全局重置机制，修复所有破损建筑、清理灾害残骸、重置空间状态。",
      "",
      "程序缺陷与失控：程序仅能修复物理空间结构，无法修复受试者崩坏的精神内核、无法清除固化的「衰退瘾」认知病毒。重置后的空间看似恢复初始稳定状态，但精神侵蚀、空间崩塌的底层隐患永久保留，等待下一批闯入者触发新一轮崩坏。",
      "",
      "实验结论：半成功、半彻底失效。空间可以无限循环重置，但核心异常永久固化，形成「崩塌-消亡-重置-再崩塌」的无限死循环，层级彻底沦为不可逆的死亡循环空间。",
      "",
      "遗留环境表现：对应层级第三阶段，全域灰雾笼罩、灾害最大化爆发，清空所有生命后瞬间全局重置，永久循环往复。",
    ].join("\n"),
  },
];

const fps = createBackroomsFpsState({
  player: { x: 0, z: 30, radius: 0.34, speed: 3.65 },
});
const colliders = [];
const props = [];
const destructibleWalls = [];
const hazards = [];
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 4.6, floorY: 0 };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const memoryFillEl = document.getElementById("backroomsMemoryFill");
const memoryValueEl = document.getElementById("backroomsMemoryValue");
const phaseEl = document.getElementById("backroomsC1292Phase");
const pixelCanvas = document.getElementById("backroomsPixelNoise");
const interactHintEl = document.getElementById("backroomsInteractHint");
const crosshairEl = document.getElementById("backroomsCrosshair");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let labRoot = null;
let stableLights = [];
let memory = 0;
let elapsed = 0;
let phase = 1;
let nextHazardAt = 0;
let nextAmnesiaAt = 18;
let nextPixelDrawAt = 0;
let audio = null;
let deathResetQueued = false;
/** @type {Set<string>} 本局已阅读过的文档 id（重复阅读不再加侵蚀） */
const readDocIds = new Set();
/** @type {THREE.Object3D[]} */
const docInteractRoots = [];
/** @type {{ data: object, distance: number } | null} */
let currentAimDoc = null;
/** @type {HTMLElement | null} */
let docOverlayEl = null;
/** @type {THREE.Object3D | null} */
let exitPick = null;
let exitUnlocked = false;
let transitionLock = false;

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xa6aaab, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.98 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x6f7578, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x596166, roughness: 0.58, metalness: 0.72 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x899398, roughness: 0.45, metalness: 0.78 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xaec4ca,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    roughness: 0.25,
  }),
  paper: new THREE.MeshStandardMaterial({ color: 0xd5d1c5, roughness: 1 }),
  docPaper: new THREE.MeshStandardMaterial({
    color: 0xf2efe4,
    emissive: 0x6a5a28,
    emissiveIntensity: 0.28,
    roughness: 0.92,
  }),
  dark: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  pick: new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }),
  warning: new THREE.MeshBasicMaterial({
    color: 0xffc15a,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
  crack: new THREE.MeshBasicMaterial({
    color: 0x020203,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  }),
  toxic: new THREE.MeshBasicMaterial({
    color: 0x9a9e98,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  }),
};

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, mat, x, y, z, sx, sy, sz, collide) {
  var mesh = new THREE.Mesh(boxGeo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - sx * 0.5, x + sx * 0.5, z - sz * 0.5, z + sz * 0.5));
  }
  return mesh;
}

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 3000 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1292 无法启动</strong></p><p>" + String(text) + "</p>";
}

function makeArchiveTexture() {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#dedbd0";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#242729";
  ctx.font = "bold 19px monospace";
  ctx.fillText("U.E.C // PROJECT", 14, 28);
  ctx.fillStyle = "#9f2929";
  ctx.font = "bold 25px sans-serif";
  ctx.fillText("衰退瘾", 14, 61);
  ctx.fillStyle = "#4a4d4f";
  ctx.font = "14px monospace";
  ctx.fillText("SUBJECT: JONES", 14, 89);
  ctx.fillText("MEMORY COHESION: FAIL", 14, 110);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoomSignTexture(label) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#2a2f32";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#c9b56a";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = "#efe8d2";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, c.width * 0.5, c.height * 0.52);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addRoomSign(root, label, x, y, z, rotY) {
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.05),
    new THREE.MeshBasicMaterial({ map: makeRoomSignTexture(label) })
  );
  sign.position.set(x, y, z);
  sign.rotation.y = rotY || 0;
  root.add(sign);
  return sign;
}

function addDocStation(root, doc) {
  // 工作台 + 封存文件夹，准星对准即可阅读。
  addBox(root, mats.metal, doc.x, 0.48, doc.z, 2.4, 0.12, 1.3, false);
  addBox(root, mats.steel, doc.x, 0.24, doc.z, 2.2, 0.48, 1.1, false);
  var folder = addBox(root, mats.docPaper, doc.x, 0.62, doc.z, 0.72, 0.05, 0.95, false);
  folder.rotation.y = 0.18;
  folder.name = "UecDoc_" + doc.id;

  var pick = new THREE.Mesh(boxGeo, mats.pick);
  pick.scale.set(2.6, 2.2, 2.2);
  pick.position.set(doc.x, 1.1, doc.z);
  pick.userData.brInteract = { kind: "uec_doc", docId: doc.id };
  root.add(pick);
  docInteractRoots.push(pick);

  // 房间门牌朝向走廊。
  var towardCorridor = Math.abs(doc.x) > Math.abs(doc.z);
  if (towardCorridor) {
    addRoomSign(
      root,
      doc.room,
      doc.x + (doc.x > 0 ? -3.2 : 3.2),
      2.55,
      doc.z,
      doc.x > 0 ? -Math.PI * 0.5 : Math.PI * 0.5
    );
  } else {
    addRoomSign(
      root,
      doc.room,
      doc.x,
      2.55,
      doc.z + (doc.z > 0 ? -3.2 : 3.2),
      doc.z > 0 ? Math.PI : 0
    );
  }
}

function getDocById(id) {
  for (var i = 0; i < UEC_DOCS.length; i++) {
    if (UEC_DOCS[i].id === id) return UEC_DOCS[i];
  }
  return null;
}

function luckDocErosionMul() {
  // 倒霉翻倍、幸运减半，无法完全规避阅读侵蚀。
  var luck = getLuck();
  if (luck <= -30) return 2;
  if (luck >= 30) return 0.5;
  return 1;
}

function refreshMemoryUi() {
  if (memoryFillEl) memoryFillEl.style.width = Math.round(memory * 100) + "%";
  if (memoryValueEl) memoryValueEl.textContent = Math.round(memory * 100) + "%";
}

function applyDocErosion(doc) {
  if (readDocIds.has(doc.id)) return 0;
  readDocIds.add(doc.id);
  var bonus = DOC_EROSION_BONUS * luckDocErosionMul();
  memory = Math.min(1, memory + bonus);
  refreshMemoryUi();
  applyPhase(resolvePhase());
  if (memory >= 1 && survival && !survival.dead) {
    showToast("最后一段记忆被吞噬。", 2400);
    survival.triggerDeath("memory_erosion");
  }
  return bonus;
}

function isDocOverlayOpen() {
  return !!docOverlayEl;
}

function closeDocOverlay() {
  if (!docOverlayEl) return;
  docOverlayEl.remove();
  docOverlayEl = null;
  document.removeEventListener("keydown", onDocOverlayKeydown, true);
}

function onDocOverlayKeydown(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (e.code === "Escape" || e.code === "KeyQ" || e.code === "Enter") {
    closeDocOverlay();
  }
}

function openDocOverlay(doc) {
  if (docOverlayEl || !doc) return;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  var overlay = document.createElement("div");
  overlay.id = "backroomsUecDocOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:130;display:grid;place-items:center;" +
    "background:rgba(8,10,12,0.88);backdrop-filter:blur(2px);";
  var panel = document.createElement("div");
  panel.style.cssText =
    "max-width:min(720px,90vw);max-height:82vh;overflow:auto;padding:26px 30px 18px;" +
    "background:#14181b;border:1px solid #6d6140;border-radius:10px;color:#e8ebe8;" +
    "font:14px/1.75 system-ui,sans-serif;box-shadow:0 18px 60px #000;";
  var head = document.createElement("div");
  head.style.cssText = "margin:0 0 14px;border-bottom:1px solid #3d4346;padding-bottom:12px;";
  head.innerHTML =
    '<p style="margin:0 0 4px;color:#c9b56a;font:12px monospace;letter-spacing:.04em;">' +
    doc.code +
    " · " +
    doc.room +
    "</p>" +
    '<h2 style="margin:0;font:700 20px/1.35 system-ui,sans-serif;color:#f3f0e6;">' +
    doc.title +
    "</h2>";
  var body = document.createElement("pre");
  body.style.cssText =
    "margin:0;white-space:pre-wrap;font:13.5px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d7dbd8;";
  body.textContent = doc.text;
  var tip = document.createElement("p");
  tip.style.cssText = "margin:16px 0 0;text-align:center;color:#8b9498;font:13px system-ui;";
  tip.innerHTML = "按 <kbd>Q</kbd> / <kbd>Esc</kbd> 合上档案";
  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(tip);
  overlay.appendChild(panel);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDocOverlay();
  });
  document.body.appendChild(overlay);
  docOverlayEl = overlay;
  document.addEventListener("keydown", onDocOverlayKeydown, true);
}

function unlockEmergencyExit() {
  if (exitUnlocked || !exitPick) return;
  exitUnlocked = true;
  exitPick.visible = true;
  if (exitPick.userData.hatch) exitPick.userData.hatch.visible = true;
  if (exitPick.userData.hatchGlow) exitPick.userData.hatchGlow.visible = true;
  showToast("重置程序的漏洞撕开了一道应急撤离缝隙——北侧主廊尽头。", 4500);
}

function maybeUnlockExitAfterDocs() {
  if (readDocIds.size >= UEC_DOCS.length) unlockEmergencyExit();
}

function leaveToL11() {
  if (transitionLock) return;
  transitionLock = true;
  closeDocOverlay();
  showToast("你挤进撤离缝隙——衰退瘾的压迫感在身后戛然而止。", 3600);
  if (survival) saveBackroomsSurvival(survival);
  // 离开本层即清除侵蚀 debuff（memory 不跨层持久化）。
  grantLevelPass("l11", fps.yaw);
  queueEnterLevelBanner("Level 11");
  window.setTimeout(function () {
    window.location.href = "backrooms-level11.html";
  }, 750);
}

function tryReadAimedDoc() {
  if (isDocOverlayOpen() || !currentAimDoc || !survival || survival.dead || transitionLock) return;
  var data = currentAimDoc.data;
  if (!data) return;
  if (data.kind === "uec_exit") return; // 撤离仍用 Q
  if (data.kind !== "uec_doc") return;
  var doc = getDocById(data.docId);
  if (!doc) return;

  var firstRead = !readDocIds.has(doc.id);
  var bonus = applyDocErosion(doc);
  openDocOverlay(doc);

  if (firstRead) {
    var pct = Math.round(bonus * 100);
    showToast(
      "你读完了「" + doc.title.split("——")[0] + "」· 衰退瘾侵蚀 +" + pct + "%",
      4200
    );
    maybeUnlockExitAfterDocs();
  }

  if (isTaskAccepted(DOCS_TASK_ID)) {
    var res = recordReconSighting(DOCS_TASK_ID, doc.id);
    if (res.ok) {
      if (res.done) {
        showToast("三份实验档案已齐 · 从北侧撤离缝隙前往 Level 11，再回 Level 4 领赏！", 4200);
      } else {
        showToast("档案回收进度 " + res.count + " / " + res.target, 2800);
      }
    }
  }
}

function refreshDocAim() {
  if (!camera || isDocOverlayOpen() || isInventoryOpen() || isTaskUiOpen() || transitionLock) {
    currentAimDoc = null;
    return;
  }
  currentAimDoc = pickCrosshairInteract(camera, docInteractRoots, 3.6);
}

function updateDocInteractUi() {
  var active =
    !!currentAimDoc &&
    !isDocOverlayOpen() &&
    !isInventoryOpen() &&
    !transitionLock &&
    survival &&
    !survival.dead;
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen() || isDocOverlayOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", active);
  }
  if (!interactHintEl) return;
  if (!active) {
    interactHintEl.hidden = true;
    return;
  }
  var data = currentAimDoc.data || null;
  if (data && data.kind === "uec_exit") {
    interactHintEl.innerHTML = 'UEC 应急撤离缝隙 · 按 <kbd>Q</kbd> 离开（前往 Level 11）';
    interactHintEl.hidden = false;
    return;
  }
  var doc = getDocById(data && data.docId);
  if (!doc) {
    interactHintEl.hidden = true;
    return;
  }
  var already = readDocIds.has(doc.id);
  var taskBit = "";
  if (isTaskAccepted(DOCS_TASK_ID)) {
    var p = getReconProgress(DOCS_TASK_ID);
    var got = getReconRecordedKeys(DOCS_TASK_ID).indexOf(doc.id) >= 0;
    taskBit = got
      ? " · 任务已收录"
      : " · 任务 " + p.count + "/" + p.target;
  }
  interactHintEl.innerHTML =
    doc.room +
    " · " +
    (already ? "已读过的" : "封存的") +
    "实验文档 · 按 <kbd>E</kbd> 阅读" +
    taskBit;
  interactHintEl.hidden = false;
}

function buildLab(root) {
  labRoot = root;
  addBox(root, mats.floor, 0, -0.12, 0, LAB_HALF * 2, 0.22, LAB_HALF * 2, false);
  addBox(root, mats.concreteDark, 0, 4.7, 0, LAB_HALF * 2, 0.22, LAB_HALF * 2, false);

  // 外墙与空气墙。
  addBox(root, mats.concrete, 0, 2.3, -LAB_HALF, LAB_HALF * 2, 4.6, 0.6, true);
  addBox(root, mats.concrete, 0, 2.3, LAB_HALF, LAB_HALF * 2, 4.6, 0.6, true);
  addBox(root, mats.concrete, -LAB_HALF, 2.3, 0, 0.6, 4.6, LAB_HALF * 2, true);
  addBox(root, mats.concrete, LAB_HALF, 2.3, 0, 0.6, 4.6, LAB_HALF * 2, true);

  // 地下研究所：十字主廊，两侧实验室/观测室。门洞留在墙段之间。
  var z;
  for (z = -30; z <= 30; z += 12) {
    addBox(root, mats.concrete, -10, 2.2, z, 14, 4.4, 0.38, true);
    addBox(root, mats.concrete, 10, 2.2, z, 14, 4.4, 0.38, true);
  }
  var x;
  for (x = -30; x <= 30; x += 12) {
    addBox(root, mats.concrete, x, 2.2, -10, 0.38, 4.4, 14, true);
    addBox(root, mats.concrete, x, 2.2, 10, 0.38, 4.4, 14, true);
  }

  // 房间隔墙：部分只作视觉结构，崩坏时可融化消失。
  var i;
  for (i = 0; i < 22; i++) {
    var horizontal = i % 2 === 0;
    var px = -30 + ((i * 13) % 60);
    var pz = -30 + ((i * 19) % 60);
    if (Math.abs(px) < 8 || Math.abs(pz) < 8) continue;
    var wall = addBox(
      root,
      i % 3 ? mats.concrete : mats.concreteDark,
      px,
      2.15,
      pz,
      horizontal ? 7 : 0.32,
      4.3,
      horizontal ? 0.32 : 7,
      false
    );
    destructibleWalls.push(wall);
  }

  // 观测室玻璃。
  for (i = 0; i < 8; i++) {
    var gx = i < 4 ? -18 + i * 12 : i % 2 ? -20 : 20;
    var gz = i < 4 ? (i % 2 ? -13 : 13) : -24 + (i - 4) * 12;
    var glass = addBox(root, mats.glass, gx, 2.05, gz, i < 4 ? 8 : 0.12, 2.7, i < 4 ? 0.12 : 8, false);
    props.push(glass);
  }

  // 翻倒的金属桌椅、实验设备与纸质档案。
  for (i = 0; i < 30; i++) {
    var ax = -31 + ((i * 17) % 62);
    var az = -31 + ((i * 29) % 62);
    if (Math.abs(ax) < 4 || Math.abs(az) < 4) continue;
    var table = addBox(root, mats.metal, ax, 0.48, az, 2.2, 0.12, 1.15, false);
    table.rotation.y = (i % 7) * 0.41;
    if (i % 4 === 0) table.rotation.z = 0.55;
    props.push(table);
    if (i % 2 === 0) {
      var paper = addBox(root, mats.paper, ax + 0.7, 0.08, az - 0.5, 0.6, 0.025, 0.42, false);
      paper.rotation.y = i * 0.77;
      props.push(paper);
    }
    if (i % 3 === 0) {
      var device = addBox(root, mats.steel, ax - 0.4, 0.85, az + 0.25, 0.8, 0.7, 0.55, false);
      device.rotation.y = i * 0.31;
      props.push(device);
    }
  }

  // U.E.C / Jones 档案牌。
  var archive = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 2.3),
    new THREE.MeshBasicMaterial({ map: makeArchiveTexture() })
  );
  archive.position.set(0, 2.45, -37.62);
  root.add(archive);

  // 三份封存实验文档：档案室 / 观测室 / 主控机房。
  for (i = 0; i < UEC_DOCS.length; i++) {
    addDocStation(root, UEC_DOCS[i]);
  }

  // 应急撤离缝隙：读完三份文档后才会显现，否则保持隐藏。
  var hatch = addBox(root, mats.steel, 0, 1.2, 34.2, 2.4, 2.4, 0.22, false);
  hatch.name = "UecEmergencyHatch";
  hatch.visible = false;
  var hatchGlow = addBox(root, mats.docPaper, 0, 1.2, 34.05, 1.8, 1.8, 0.08, false);
  hatchGlow.visible = false;
  exitPick = new THREE.Mesh(boxGeo, mats.pick);
  exitPick.scale.set(2.8, 2.8, 1.4);
  exitPick.position.set(0, 1.2, 33.6);
  exitPick.visible = false;
  exitPick.userData.brInteract = { kind: "uec_exit" };
  exitPick.userData.hatch = hatch;
  exitPick.userData.hatchGlow = hatchGlow;
  root.add(exitPick);
  docInteractRoots.push(exitPick);

  // 裸露管线。
  for (i = -3; i <= 3; i++) {
    var pipe = new THREE.Mesh(cylinderGeo, mats.metal);
    pipe.scale.set(0.09, 35, 0.09);
    pipe.rotation.z = Math.PI * 0.5;
    pipe.position.set(0, 4.34, i * 0.75);
    root.add(pipe);
  }

  // 频闪荧光灯。
  for (z = -32; z <= 32; z += 8) {
    var light = new THREE.PointLight(0xe7f2f3, 0.75, 13, 2);
    light.position.set(0, 4.15, z);
    light.userData.baseIntensity = light.intensity;
    root.add(light);
    stableLights.push(light);
    addBox(root, mats.steel, 0, 4.25, z, 0.25, 0.08, 3.2, false);
  }
  for (x = -32; x <= 32; x += 8) {
    var crossLight = new THREE.PointLight(0xdde9ea, 0.58, 11, 2);
    crossLight.position.set(x, 4.1, 0);
    crossLight.userData.baseIntensity = crossLight.intensity;
    root.add(crossLight);
    stableLights.push(crossLight);
  }

  root.add(new THREE.HemisphereLight(0xaeb8ba, 0x303437, 0.38));
  root.add(new THREE.AmbientLight(0xa5adae, 0.23));
}

function centerInfluence() {
  return Math.max(0, Math.min(1, 1 - Math.hypot(fps.player.x, fps.player.z) / CENTER_RADIUS));
}

function luckErosionMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.55;
  if (luck >= 30) return 0.82;
  return 1;
}

function luckHazardIntervalMul() {
  var luck = getLuck();
  if (luck <= -30) return 0.48;
  if (luck >= 30) return 1.22;
  return 1;
}

function resolvePhase() {
  if (elapsed < STABLE_MIN_SECONDS && memory < 0.3) return 1;
  if (elapsed < TERMINAL_FORCE_SECONDS && memory < 0.78) return 2;
  return 3;
}

function applyPhase(next) {
  if (phase === next) return;
  phase = next;
  if (phase === 2) {
    showToast("研究所的结构开始瓦解——裂隙和坠落物会先出现明显预警！", 4200);
    scene.fog = new THREE.FogExp2(0x6b7072, 0.026);
  } else if (phase === 3) {
    showToast("终末重置阶段：有毒灰雾正在灌满研究所！", 4200);
    scene.fog = new THREE.FogExp2(0x777b77, 0.075);
  }
  updatePhaseUi();
}

function updatePhaseUi() {
  if (!phaseEl) return;
  phaseEl.textContent =
    phase === 1
      ? "第一阶段 · 研究所稳定期"
      : phase === 2
        ? "第二阶段 · 空间崩坏期"
        : "第三阶段 · 终末重置";
}

function updateMemory(dt) {
  if (!survival || survival.dead) return;
  var infl = centerInfluence();
  // 边缘约 8 分钟耗尽，中心约 2.7 分钟；幸运只能小幅减缓，无法免疫。
  var rate = (1 / 480 + infl / 240) * luckErosionMul();
  memory = Math.min(1, memory + rate * dt);
  survival.sanity = Math.max(1, survival.sanity - (0.18 + infl * 0.62) * luckErosionMul() * dt);

  refreshMemoryUi();
  applyPhase(resolvePhase());

  if (memory >= 1) {
    showToast("最后一段记忆被吞噬。", 2400);
    survival.triggerDeath("memory_erosion");
  }
}

function updateAmnesia() {
  if (!survival || survival.dead || elapsed < nextAmnesiaAt) return;
  var infl = centerInfluence();
  nextAmnesiaAt =
    elapsed + Math.max(4, 19 - memory * 11 - infl * 7) + Math.random() * 7;
  var messages = [
    "你忽然忘记自己为什么会来到这里。",
    "手中的道具看起来十分陌生……它原本有什么用途？",
    "前方的走廊短暂融化成一片灰白像素。",
    "一个名字从记忆里消失了，只剩下空白。",
    "你确信刚才这里有一扇门——现在却什么都没有。",
  ];
  showToast(messages[Math.floor(Math.random() * messages.length)]);
  if (hintEl) {
    var old = hintEl.innerHTML;
    hintEl.textContent = "？？？ · 你暂时忘记了操作方式";
    window.setTimeout(function () {
      if (hintEl) hintEl.innerHTML = old;
    }, 900 + memory * 1500);
  }
}

function createCrackHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 3.5 + Math.random() * 11;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.025, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var crack = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 1.25), mats.crack.clone());
  crack.rotation.x = -Math.PI * 0.5;
  crack.rotation.z = Math.random() * Math.PI;
  crack.visible = false;
  group.add(crack);
  labRoot.add(group);
  hazards.push({
    kind: "crack",
    group: group,
    warning: warning,
    danger: crack,
    x: x,
    z: z,
    radius: 1.35,
    timer: 0,
    warningSeconds: CRACK_WARNING_SECONDS,
    duration: 7.5,
  });
}

function createFallingHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 3 + Math.random() * 12;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.02, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var isManhole = Math.random() < 0.58;
  var falling = isManhole
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.16, 24), mats.metal)
    : new THREE.Mesh(boxGeo, mats.steel);
  if (!isManhole) falling.scale.set(2.4, 0.18, 1.5);
  falling.position.y = 13;
  falling.visible = false;
  group.add(falling);
  labRoot.add(group);
  hazards.push({
    kind: "fall",
    group: group,
    warning: warning,
    danger: falling,
    x: x,
    z: z,
    radius: 1.85,
    timer: 0,
    warningSeconds: FALL_WARNING_SECONDS,
    duration: 3.2,
    landed: false,
    startY: 13,
  });
}

function createBlastHazard() {
  var angle = Math.random() * Math.PI * 2;
  var distance = 4 + Math.random() * 10;
  var x = Math.max(-34, Math.min(34, fps.player.x + Math.cos(angle) * distance));
  var z = Math.max(-34, Math.min(34, fps.player.z + Math.sin(angle) * distance));
  var group = new THREE.Group();
  group.position.set(x, 0.03, z);
  var warning = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), mats.warning.clone());
  warning.rotation.x = -Math.PI * 0.5;
  group.add(warning);
  var smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mats.toxic.clone());
  smoke.position.y = 1.4;
  smoke.visible = false;
  group.add(smoke);
  labRoot.add(group);
  hazards.push({
    kind: "blast",
    group: group,
    warning: warning,
    danger: smoke,
    x: x,
    z: z,
    radius: 3,
    timer: 0,
    warningSeconds: 1.8,
    duration: 3.6,
    landed: false,
  });
}

function scheduleHazard(now) {
  if (phase === 1) return;
  var roll = Math.random();
  if (phase === 3 && roll < 0.25) createBlastHazard();
  else if (roll < 0.57) createFallingHazard();
  else createCrackHazard();
  var base =
    phase === 2 ? 2600 + Math.random() * 3200 : 1050 + Math.random() * 1800;
  nextHazardAt = now + base * luckHazardIntervalMul();
}

function removeHazard(index) {
  var h = hazards[index];
  if (h && h.group && h.group.parent) h.group.parent.remove(h.group);
  if (h && h.warning && h.warning.material && h.warning.material.dispose) {
    h.warning.material.dispose();
  }
  if (h && h.danger && h.danger.material && h.danger.material !== mats.metal && h.danger.material !== mats.steel) {
    h.danger.material.dispose();
  }
  hazards.splice(index, 1);
}

function updateHazards(dt) {
  if (!survival || survival.dead) return;
  for (var i = hazards.length - 1; i >= 0; i--) {
    var h = hazards[i];
    h.timer += dt;
    var warned = h.timer < h.warningSeconds;
    h.warning.visible = warned;
    h.warning.material.opacity = 0.16 + Math.abs(Math.sin(h.timer * 8)) * 0.36;
    if (!warned) h.danger.visible = true;

    var d = Math.hypot(fps.player.x - h.x, fps.player.z - h.z);
    if (h.kind === "crack" && !warned && d < h.radius) {
      showToast("地面裂开前已有像素化裂纹警告——你仍踩进了虚空！");
      survival.triggerDeath("c1292_void_crack");
      return;
    }
    if (h.kind === "fall" && !warned) {
      var fallT = Math.min(1, (h.timer - h.warningSeconds) / 0.48);
      h.danger.position.y = h.startY * (1 - fallT);
      h.danger.rotation.x += dt * 7;
      h.danger.rotation.z += dt * 5;
      if (fallT >= 1 && !h.landed) {
        h.landed = true;
        playImpact();
        if (d < h.radius) {
          survival.takeDamage(FALL_DAMAGE);
          showToast("坠落的井盖与设备碎片重重砸中你！");
        }
      }
    }
    if (h.kind === "blast" && !warned) {
      var blastT = Math.min(1, (h.timer - h.warningSeconds) / 0.45);
      h.danger.scale.setScalar(0.4 + blastT * 3.3);
      h.danger.material.opacity = 0.3 * (1 - blastT * 0.55);
      if (!h.landed) {
        h.landed = true;
        playExplosion();
        if (d < h.radius) survival.takeDamage(58);
      }
    }
    if (h.timer >= h.duration) removeHazard(i);
  }
}

function updateWorldDecay(dt) {
  var i;
  var flickerChance = phase === 1 ? 0.015 : phase === 2 ? 0.05 : 0.12;
  for (i = 0; i < stableLights.length; i++) {
    var light = stableLights[i];
    var base = light.userData.baseIntensity || 0.5;
    var dim = phase === 1 ? 1 : phase === 2 ? 0.58 : 0.18;
    light.intensity = Math.random() < flickerChance ? 0.02 : base * dim;
  }
  for (i = 0; i < destructibleWalls.length; i++) {
    destructibleWalls[i].visible = memory < 0.28 + (i / destructibleWalls.length) * 0.68;
  }
  for (i = 0; i < props.length; i++) {
    var threshold = 0.42 + (i / Math.max(1, props.length)) * 0.5;
    props[i].visible = memory < threshold || Math.sin(elapsed * 4 + i) > 0.8;
  }
  if (phase === 3 && survival && !survival.dead) {
    survival.takeDamage(2.1 * dt);
  }
}

function updatePixelNoise(now) {
  if (!pixelCanvas || now < nextPixelDrawAt) return;
  nextPixelDrawAt = now + Math.max(55, 150 - memory * 90);
  var ctx = pixelCanvas.getContext("2d");
  var w = pixelCanvas.width;
  var h = pixelCanvas.height;
  ctx.clearRect(0, 0, w, h);
  var infl = centerInfluence();
  var count = Math.floor(45 + memory * 330 + infl * 150);
  for (var i = 0; i < count; i++) {
    var edge = Math.random() < 0.72;
    var x;
    var y;
    if (edge) {
      var side = Math.floor(Math.random() * 4);
      x = side < 2 ? Math.random() * w : side === 2 ? Math.random() * w * 0.18 : w * (0.82 + Math.random() * 0.18);
      y = side >= 2 ? Math.random() * h : side === 0 ? Math.random() * h * 0.2 : h * (0.8 + Math.random() * 0.2);
    } else {
      x = Math.random() * w;
      y = Math.random() * h;
    }
    var size = Math.random() < memory ? 2 + Math.floor(Math.random() * 6) : 1;
    var alpha = 0.12 + Math.random() * (0.25 + memory * 0.45);
    var shade = 155 + Math.floor(Math.random() * 90);
    ctx.fillStyle = "rgba(" + shade + "," + shade + "," + shade + "," + alpha + ")";
    ctx.fillRect(x | 0, y | 0, size, size);
  }
  // 局部马赛克扭曲块；侵蚀越深越频繁。
  if (Math.random() < memory * 0.75) {
    for (i = 0; i < 2 + memory * 8; i++) {
      ctx.fillStyle = "rgba(180,184,184," + (0.05 + memory * 0.13) + ")";
      ctx.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 35, 2 + Math.random() * 10);
    }
  }
}

function startAudio() {
  if (audio) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 54;
    var humGain = ctx.createGain();
    humGain.gain.value = 0.012;
    var humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 180;
    hum.connect(humFilter).connect(humGain).connect(ctx.destination);
    hum.start();
    audio = { ctx: ctx, hum: hum, humGain: humGain };
  } catch (err) {
    audio = null;
  }
}

function playImpact() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(34, now + 0.62);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.78);
}

function playExplosion() {
  if (!audio || !audio.ctx) return;
  playImpact();
  var ctx = audio.ctx;
  var length = Math.floor(ctx.sampleRate * 0.65);
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  var src = ctx.createBufferSource();
  src.buffer = buffer;
  var gain = ctx.createGain();
  gain.gain.value = 0.13;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen() || isDocOverlayOpen();
    },
    onJump: function () {
      if (isDocOverlayOpen()) return;
      tryBackroomsJump(fps, 6.1);
    },
    onKeyDown: function (event) {
      if (isDocOverlayOpen()) return true;
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        tryReadAimedDoc();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        if (
          currentAimDoc &&
          currentAimDoc.data &&
          currentAimDoc.data.kind === "uec_exit" &&
          exitUnlocked
        ) {
          leaveToL11();
        }
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
  window.addEventListener("click", startAudio, { once: true });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) startAudio();
  });
}

function resetAfterExtinction() {
  // 单人关卡中玩家就是最后一个生命。死亡后先让世界在死亡界面后方完整复原，
  // 下次进入页面时也会从稳定期重新开始。
  memory = 0;
  elapsed = 0;
  phase = 1;
  readDocIds.clear();
  exitUnlocked = false;
  transitionLock = false;
  closeDocOverlay();
  if (exitPick) {
    exitPick.visible = false;
    if (exitPick.userData.hatch) exitPick.userData.hatch.visible = false;
    if (exitPick.userData.hatchGlow) exitPick.userData.hatchGlow.visible = false;
  }
  for (var i = hazards.length - 1; i >= 0; i--) removeHazard(i);
  for (i = 0; i < destructibleWalls.length; i++) destructibleWalls[i].visible = true;
  for (i = 0; i < props.length; i++) props[i].visible = true;
  scene.fog = new THREE.FogExp2(0x848b8e, 0.018);
  updatePhaseUi();
  refreshMemoryUi();
}

function init() {
  if (!enforceLevelEntry("c1292", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1292", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7d8487);
  scene.fog = new THREE.FogExp2(0x848b8e, 0.018);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 110);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  labRoot = new THREE.Group();
  labRoot.name = "BackroomsLevelC1292";
  scene.add(labRoot);
  buildLab(labRoot);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1292" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水恢复了身体，却无法阻止衰退瘾吞噬记忆。");
    },
  });
  initBackroomsTemperature("c1292", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1292 · 项目：衰退瘾 · 生存难度 死区 · 无出口 · " +
      "寻找档案室 / 观测室 / 主控机房 · <kbd>Q</kbd> 阅读实验文档 · 读完三份可从北侧撤离 · 留意橙色灾害预警";
  }
  updatePhaseUi();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    if (survival && !survival.dead) {
      elapsed += dt;
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
      updateMemory(dt);
      updateAmnesia();
      if (phase >= 2 && now >= nextHazardAt) scheduleHazard(now);
      updateHazards(dt);
      updateWorldDecay(dt);
    } else if (survival && survival.dead && !deathResetQueued) {
      deathResetQueued = true;
      window.setTimeout(resetAfterExtinction, 1400);
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isTaskUiOpen() &&
      !isDocOverlayOpen()
    ) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      // 侵蚀后期反应迟钝，但不会突然锁死移动。
      mul *= Math.max(0.62, 1 - memory * 0.38);
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 10);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshDocAim();
    updateDocInteractUi();
    updatePixelNoise(now);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1292]", err);
  showError(err.message || String(err));
}

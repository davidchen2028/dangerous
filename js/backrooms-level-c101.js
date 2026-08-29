import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import {
  addFireSalt,
  isInventoryOpen,
  setInventoryOpenHandler,
  toggleBackpack,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  queueEnterLevelBanner,
  showEnterLevelBannerIfQueued,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import {
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
  resolveBackroomsGfxProfile,
} from "./backrooms-gfx-profile.js";
import {
  DEFAULT_C101_SOURCE,
  validateC101Config,
  writeC101Result,
} from "./backrooms-c101-state.js";
import { buildLevelC101World } from "./backrooms-level-c101-world.js?v=1";
import {
  applyBackroomsCamera,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  createBackroomsFpsState,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  moveBackroomsPlayer,
  resolveBackroomsMoveCollisions,
  syncBackroomsPointerLockBodyClass,
  tryBackroomsJump,
  updateBackroomsPlayerPhysics,
} from "./backrooms-fps-controller.js";
import {
  formatMegCareer,
  getMegCareerProfile,
  hasMegPermission,
  initMegCareer,
} from "./backrooms-meg-career.js";
import { recordMegCareerEvent } from "./backrooms-online-profile.js";

const ARCHIVES = {
  A: {
    title: "文件 C-101-A · 第一次探索记录",
    text:
      "2017-07-08，Omega-癸亥第一分队从中央白炽灯向东探索。他们在约 150 米处发现向下楼梯；继续行进数小时后，除服务器外一无所获。全队最终走下楼梯，并在五分钟后抵达 Level C-102。",
  },
  B: {
    title: "文件 C-101-B · 数据节选",
    text:
      "从标记为 Level C-96 的服务器中提取出无法辨识的代码。记录包含区域、通道、门与办公室之间的连接参数。M.E.G. 已禁止未经授权的复制、执行或修改。",
  },
  E: {
    title: "文件 C-101-E · C-96 修改实验",
    text:
      "删除一段数据后，Level C-96 的一条非欧几里得通道消失；加入出口指令后，墙体、地板与物件发生大面积错位；写入随机字符最终导致层级崩坏，内部人员全部死亡。实验随即被终止。",
  },
  F: {
    title: "文件 C-101-F · 监督者 Z 事件",
    text:
      "监督者 Z 被质询时使用笔记本改变了外部层级：灯光熄灭，大量敌对实体出现。其逃离后，实体消失，Level C-96 也恢复如初。此后 C-101 被重新定级为终结等级，全部真实资料转为受保护信息。",
  },
};

const RANDOM_C_DESTINATIONS = [
  { pass: "c144", page: "backrooms-level-c144.html", banner: "Level C-144" },
  { pass: "c192", page: "backrooms-level-c192.html", banner: "Level C-192" },
  { pass: "c370", page: "backrooms-level-c370.html", banner: "Level C-370" },
  { pass: "c1290", page: "backrooms-level-c1290.html", banner: "Level C-1290" },
  { pass: "c1291", page: "backrooms-level-c1291.html", banner: "Level C-1291" },
];

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsInteractHint");
const toastEl = document.getElementById("backroomsLootToast");
const errorEl = document.getElementById("backroomsError");
const editorEl = document.getElementById("c101Editor");
const sourceEl = document.getElementById("c101Source");
const okEl = document.getElementById("c101Ok");
const statusEl = document.getElementById("c101Status");
const archiveEl = document.getElementById("c101Archive");
const archiveTitleEl = document.getElementById("c101ArchiveTitle");
const archiveTextEl = document.getElementById("c101ArchiveText");
const archiveCloseEl = document.getElementById("c101ArchiveClose");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.35 },
});
fps.yaw = Math.PI * 0.5;
const raycaster = new THREE.Raycaster();
const _survCtx = { sprinting: false, sanityDrainPerSec: 0.04 };

let scene = null;
let camera = null;
let renderer = null;
let world = null;
let survival = null;
let aimedData = null;
let editorOpen = false;
let archiveOpen = false;
let runResult = null;
let transitionLock = false;
let lockdownWarnings = 0;
let toastTimer = 0;

function showToast(text, duration) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    toastEl.hidden = true;
  }, duration || 2800);
}

function hasSupervisorAccess() {
  return hasMegPermission("c101_submit");
}

function hasDatabaseAccess() {
  return hasMegPermission("c101_read");
}

function closePointerLock() {
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function openArchive(id) {
  var entry = ARCHIVES[id];
  if (!entry || !archiveEl) return;
  if (!hasDatabaseAccess()) {
    showToast("权限不足：受保护档案仅向数据库授权员和监督者开放。");
    return;
  }
  archiveOpen = true;
  archiveEl.hidden = false;
  archiveTitleEl.textContent = entry.title;
  archiveTextEl.textContent = entry.text;
  recordMegCareerEvent("c101_archive", { archiveId: id }, "c101_archive:" + id).catch(
    function () {}
  );
  closePointerLock();
}

function closeArchive() {
  archiveOpen = false;
  if (archiveEl) archiveEl.hidden = true;
}

function workerProgram() {
  return `
self.onmessage = function(event) {
  var config = {
    fog: { color: "#3a4a58", near: 8, far: 42 },
    lights: { color: "#dcecff", intensity: 1 },
    pillars: { color: "#a8a39a", scale: 1, height: 1 },
    entities: []
  };
  var level1 = Object.freeze({
    setFog: function(color, near, far) { config.fog = { color: color, near: near, far: far }; },
    setLights: function(color, intensity) { config.lights = { color: color, intensity: intensity }; },
    setPillars: function(value) { config.pillars = value; },
    create: function(name, count) {
      var n = count == null ? 1 : Number(count);
      if (!Number.isFinite(n) || n < 1 || n > 8 || Math.floor(n) !== n) throw new Error("实体数量必须为 1 到 8");
      while (n-- > 0) config.entities.push(String(name));
    }
  });
  try {
    var run = new Function("level1", "create", "window", "document", "fetch",
      "\\"use strict\\";\\n" + String(event.data.source));
    run(level1, level1.create, undefined, undefined, undefined);
    self.postMessage({ ok: true, config: config });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error && error.message || error) });
  }
};`;
}

function executeSource(source) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(new Blob([workerProgram()], { type: "text/javascript" }));
    var worker = new Worker(url);
    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    }
    worker.onmessage = function (event) { finish(event.data); };
    worker.onerror = function (event) { finish({ ok: false, error: event.message || "运行异常" }); };
    worker.postMessage({ source: source });
    window.setTimeout(function () {
      finish({ ok: false, error: "运行超时" });
    }, 700);
  });
}

function openEditor() {
  if (!hasDatabaseAccess()) {
    showToast("权限不足：仅数据库授权员及监督者可访问该终端。");
    return;
  }
  editorOpen = true;
  editorEl.hidden = false;
  var canSubmit = hasSupervisorAccess();
  var profile = getMegCareerProfile();
  sourceEl.readOnly = !canSubmit;
  okEl.hidden = !canSubmit;
  statusEl.textContent = canSubmit
    ? formatMegCareer(profile) + "授权会话 · 修改后点击 OK。"
    : "数据库授权员只读会话 · 只有经管理员批准的监督者可以提交层级指令。";
  closePointerLock();
  if (canSubmit) sourceEl.focus();
}

function closeEditor() {
  editorOpen = false;
  if (editorEl) editorEl.hidden = true;
  if (sourceEl) sourceEl.blur();
}

async function runCode() {
  if (!hasSupervisorAccess() || !sourceEl || !okEl) return;
  okEl.disabled = true;
  statusEl.textContent = "正在隔离运行…";
  var result = await executeSource(sourceEl.value);
  if (result.ok) {
    try {
      result = { ok: true, config: validateC101Config(result.config) };
    } catch (error) {
      result = { ok: false, error: error.message || String(error) };
    }
  }
  runResult = result;
  writeC101Result(result);
  recordMegCareerEvent("c101_submit", {
    accepted: !!result.ok,
    supervisorCode: getMegCareerProfile().supervisorCode || "",
  }).catch(function () {});
  okEl.disabled = false;
  closeEditor();
  showToast(result.ok ? "监督者指令已提交；再次访问终端可返回 Level 1。" : "指令被拒绝：" + result.error, 4200);
}

function returnToModifiedLevel1() {
  if (!runResult || !runResult.ok || transitionLock) return false;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("clip", -Math.PI * 0.5, { noEscape: true });
  queueEnterLevelBanner("Level 1 · 已加载监督者指令");
  window.location.href = "backrooms-level1.html";
  return true;
}

function useStairs() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  if (Math.random() < 0.05) {
    var dest = RANDOM_C_DESTINATIONS[Math.floor(Math.random() * RANDOM_C_DESTINATIONS.length)];
    grantLevelPass(dest.pass, fps.yaw);
    queueEnterLevelBanner(dest.banner);
    showToast("楼梯结构突然偏移——这不是 Level C-102。");
    window.setTimeout(function () {
      window.location.href = dest.page;
    }, 650);
    return;
  }
  grantLevelPass("c102", fps.yaw);
  queueEnterLevelBanner("Level C-102 · 组合、连接");
  showToast("你沿楼梯向下走了约五分钟……");
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c102.html";
  }, 650);
}

function handleGuard(data) {
  if (data.role === "supply") {
    var supply = world.takeGuideSupply(survival, addFireSalt);
    if (!supply) {
      showToast("引路人：补给只发放一次。沿照明通道向东 150 米。");
      return;
    }
    showToast("引路人发放补给 · 杏仁水 ×" + supply.water + " · 火盐 ×" + supply.salt);
    return;
  }
  var lines = {
    guide: "引路人：不要离开通道。一直向东，楼梯会带你去 C-102。",
    warning: "Omega-癸亥：两侧区域属于终结级机密。触碰封板将被视为入侵。",
    archive: "引路人：墙上的档案经过删改，只用于解释为什么这里不能探索。",
    watch: "Omega-癸亥：我们是保险。通道外的部队才是防线。",
  };
  showToast(lines[data.role] || "士兵保持沉默。", 3800);
}

function handleLockdown() {
  lockdownWarnings += 1;
  if (lockdownWarnings === 1) {
    showToast("警告：退回引导通道。该区域受 Omega-癸亥保护。", 4000);
  } else if (lockdownWarnings === 2) {
    showToast("最后警告：继续破坏封锁将被击毙。", 4000);
  } else if (survival && !survival.dead) {
    showToast("封锁部队开火。");
    survival.takeDamage(200);
  }
}

function interact() {
  if (!aimedData || transitionLock || editorOpen || archiveOpen || !survival || survival.dead) return;
  if (aimedData.kind === "c101_guard") handleGuard(aimedData);
  else if (aimedData.kind === "c101_archive") openArchive(aimedData.archiveId);
  else if (aimedData.kind === "c101_lockdown") handleLockdown();
  else if (aimedData.kind === "c101_stairs") useStairs();
  else if (aimedData.kind === "c101_authorized_terminal") {
    if (!returnToModifiedLevel1()) openEditor();
  }
}

function updateAim() {
  aimedData = null;
  if (!camera || editorOpen || archiveOpen || isInventoryOpen() || !world) {
    if (hintEl) hintEl.hidden = true;
    return;
  }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 4.8;
  var hit = raycaster.intersectObjects(world.interactRoots, true)[0];
  if (hit) aimedData = hit.object.userData.brInteract || null;
  if (!aimedData) {
    hintEl.hidden = true;
    return;
  }
  var labels = {
    c101_guard: "Omega-癸亥“引路人” · 按 Q 交谈",
    c101_archive: "受限档案 · 按 Q 阅读",
    c101_lockdown: "M.E.G. 封锁板 · 按 Q 触碰",
    c101_stairs: "通往 Level C-102 的楼梯 · 按 Q 下行",
    c101_authorized_terminal: runResult
      ? "监督者终端 · 按 Q 返回已修改的 Level 1"
      : "监督者终端 · 按 Q 访问",
  };
  hintEl.textContent = labels[aimedData.kind] || "按 Q 交互";
  hintEl.hidden = false;
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    shouldBlockPointerLock: function () {
      return editorOpen || archiveOpen || isInventoryOpen() || isTaskUiOpen();
    },
    shouldBlockLook: function () {
      return editorOpen || archiveOpen;
    },
    onJump: function () {
      if (!editorOpen && !archiveOpen) tryBackroomsJump(fps);
    },
    onKeyDown: function (event) {
      if (!editorOpen && !archiveOpen && !isInventoryOpen() && handleTaskUiKey(event)) return true;
      if (event.code === "Escape" && editorOpen) {
        closeEditor();
        return true;
      }
      if (event.code === "Escape" && archiveOpen) {
        closeArchive();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat && !editorOpen && !archiveOpen) {
        toggleBackpack();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        interact();
        return true;
      }
      return editorOpen || archiveOpen;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function initSurvival() {
  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c101" };
  });
  setInventoryOpenHandler(function (open) {
    if (open) closePointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
}

async function init() {
  if (!enforceLevelEntry("c101", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c101", showToast);
  await initMegCareer({
    levelId: "c101",
    hudAnchor: megPointsEl ? megPointsEl.closest(".backrooms-points") : null,
    onError: function () {
      showToast("M.E.G 单机编制档案读取失败：受保护权限暂不可用");
    },
  });
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020405);
  scene.fog = new THREE.Fog(0x020405, 8, 32);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 85);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, innerWidth, innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  scene.add(root);
  world = buildLevelC101World(root, { authorized: hasDatabaseAccess() });
  fps.player.x = world.spawn.x;
  fps.player.z = world.spawn.z;
  fps.yaw = world.spawn.yaw;

  initSurvival();
  initBackroomsTemperature("c101", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  sourceEl.value = DEFAULT_C101_SOURCE;
  okEl.addEventListener("click", runCode);
  archiveCloseEl.addEventListener("click", closeArchive);
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
    updateBackroomsPlayerPhysics(fps, dt, { floorY: 0, ceilingY: world.ceilingY });
    if (
      (!survival || !survival.dead) &&
      !transitionLock &&
      !editorOpen &&
      !archiveOpen &&
      !isInventoryOpen() &&
      !isTaskUiOpen()
    ) {
      var speedMul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(
          nx,
          nz,
          fps.player.radius,
          world.colliders,
          8
        );
      });
    }
    world.update(fps.player.x, now);
    applyBackroomsCamera(fps, camera);
    updateAim();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    syncBackroomsPointerLockBodyClass(fps);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (error) {
  console.error("[Backrooms C-101]", error);
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = "Level C-101 无法启动：" + (error.message || error);
  }
}

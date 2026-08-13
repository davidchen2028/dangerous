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
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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
import { buildLevel11World } from "./backrooms-level11-world.js";

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
let sandFaintTimer = 0;
let sandFaintOverlay = null;

/** L10 岔路：主路 z≈22 向右拐的小道尽头 → L11 */
const L10_FORK_Z = 22;
const L10_FORK_EXIT_X = 24;
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
  root.add(new THREE.AmbientLight(0x64707c, 0.55));
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
  showToast("你推开 Alom Wotor 的门——一股氯水味扑面而来…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l119", fps.yaw);
  queueEnterLevelNumber(119);
  window.setTimeout(function () {
    window.location.href = "backrooms-level119.html";
  }, 450);
}

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
  showToast("沙子灌进喉咙——你晕了过去…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l48", fps.yaw);
  queueEnterLevelNumber(48);
  window.setTimeout(function () {
    window.location.href = "backrooms-level48.html";
  }, 900);
}

function updateSandRoomFaint(dt) {
  if (level !== 11 || transitionLock || !levelWorld || !levelWorld.isLevel48SandRoom) {
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
      interactHintEl.innerHTML = "M.E.G 工作人员 · 按 <kbd>Q</kbd> 对话";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen() || dialogueOpen);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function openStaffDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  dialogueOpen = true;
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "M.E.G 工作人员";
  dialogueTextEl.textContent = "要我送你回 Level 1 的出生点吗？";
  if (dialogueChoicesEl) {
    dialogueChoicesEl.hidden = false;
    dialogueChoicesEl.innerHTML =
      '<button type="button" class="backrooms-dialogue__choice" data-choice="a"><kbd>A</kbd> 好</button>' +
      '<button type="button" class="backrooms-dialogue__choice" data-choice="b"><kbd>B</kbd> 算了</button>';
  }
  if (interactHintEl) interactHintEl.hidden = true;
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function closeDialogue() {
  dialogueOpen = false;
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function exitLevel11ToL1() {
  if (transitionLock) return;
  transitionLock = true;
  closeDialogue();
  showToast("工作人员领你回到了 Level 1 的出生点…");
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("clip");
  try {
    sessionStorage.setItem("backrooms_clip_yaw", "0");
  } catch (err) {
    /* ignore */
  }
  queueEnterLevelNumber(1);
  window.setTimeout(function () {
    window.location.href = "backrooms-level1.html";
  }, 450);
}

function handleStaffChoice(choice) {
  if (!dialogueOpen) return;
  if (choice === "a") exitLevel11ToL1();
  else closeDialogue();
}

function tryQAction() {
  if (dialogueOpen) return;
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "l11_meg_staff") openStaffDialogue();
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
    shouldBlockPointerLock: function () { return isInventoryOpen() || dialogueOpen; },
    onJump: function () { tryBackroomsJump(fps, 8); },
    onKeyDown: function (e) {
      if (dialogueOpen) {
        if (isChoiceKey(e, "a")) {
          e.preventDefault();
          handleStaffChoice("a");
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
      var btn = e.target.closest("[data-choice]");
      if (!btn) return;
      handleStaffChoice(btn.getAttribute("data-choice"));
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
  if (hintEl) {
    if (level === 10) {
      hintEl.innerHTML =
        "Level 10 · 沿土路前进 · 留意岔路小道 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
    } else {
      hintEl.innerHTML =
        "Level " +
        levelLabel +
        " · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
    }
  }
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
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !dialogueOpen) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders);
      });
    }
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

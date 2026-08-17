/**
 * Backrooms Level C-1289 — 7×7 房间 + 走廊。
 * 死亡时 90% 概率进入本层（见 backrooms-c1289-death.js）。
 *
 * 出口：
 * - 切出有字样的房间墙 → C-1290
 * - 走廊停留 1 分钟 → C-1291 居民楼
 * - 走廊内切出 → C-1292
 * - 手持轮盘对准墙壁强制切出 → C-1293
 * - 打破走廊窗户 → C-1294
 * - 走廊尽头向上楼梯 → C-1295
 * - 背包有火盐：禁止所有切出，等待 10 秒 → C-1297
 * - 走廊切出时极低概率 → C-1297（鼓包渗脓的卡墙切入）
 * - 打开写着 0.1296% 的房门后切出 → C-1296
 * - 切出无字样房间墙 → C-1298
 * - 吃/喝物品 → C-1299
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
  isInventoryOpen,
  setInventoryOpenHandler,
  countItem,
  addItem,
  getSelectedHotbarItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
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
const WALL_H = 3.2;
/** 7×7 房间（内壁净空） */
const ROOM = 7;
const CORRIDOR_W = 2.6;
const CORRIDOR_LEN = 18;
const CORRIDOR_START_Z = ROOM * 0.5;
const CORRIDOR_END_Z = CORRIDOR_START_Z + CORRIDOR_LEN;
const CORRIDOR_DWELL_MS = 60000;
const FIRE_SALT_WAIT_MS = 10000;

const FORCE_ITEM_IDS = {
  roulette: 1,
};

const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.32, speed: 3.7 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let transitionLock = false;
let currentAim = null;
let corridorTimer = 0;
let fireSaltTimer = 0;
let door1296Open = false;
let doorPanelMesh = null;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1289 无法启动</strong></p><p>" + String(text) + "</p>";
}

function hasFireSalt() {
  return countItem("fire_salt") > 0;
}

function isInCorridor(px, pz) {
  return (
    pz >= CORRIDOR_START_Z - 0.2 &&
    pz <= CORRIDOR_END_Z + 0.6 &&
    Math.abs(px) <= CORRIDOR_W * 0.5 + 0.4
  );
}

function isOnStairs(px, pz) {
  return pz >= CORRIDOR_END_Z - 0.4 && Math.abs(px) <= CORRIDOR_W * 0.5 + 0.2;
}

function makeLabelTexture(text, bg, fg) {
  var c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = bg || "#cfc7b0";
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#6a5a3e";
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = fg || "#2a2418";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 128);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addBox(root, w, h, d, x, y, z, mat, collide) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

function addClipProxy(root, w, h, d, x, y, z, kind, extra) {
  var proxy = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(x, y, z);
  proxy.userData.brInteract = Object.assign({ kind: kind }, extra || {});
  root.add(proxy);
  interactRoots.push(proxy);
  return proxy;
}

function buildWorld(root) {
  var floorMat = new THREE.MeshStandardMaterial({ color: 0xb7ae95, roughness: 0.95 });
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d0bb, roughness: 0.9 });
  var ceilMat = new THREE.MeshStandardMaterial({ color: 0xcfc8b4, roughness: 0.92 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 });
  var glassMat = new THREE.MeshStandardMaterial({
    color: 0xa8c8d8,
    transparent: true,
    opacity: 0.45,
    roughness: 0.2,
    metalness: 0.1,
  });
  var stairMat = new THREE.MeshStandardMaterial({ color: 0x9a8c72, roughness: 0.85 });
  var markedMat = new THREE.MeshStandardMaterial({
    map: makeLabelTexture("有字", "#d2c4a0", "#3a2c14"),
    roughness: 0.85,
  });
  var doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4e32, roughness: 0.78 });
  var doorSignMat = new THREE.MeshStandardMaterial({
    map: makeLabelTexture("0.1296%", "#efe7d2", "#5a1e1e"),
    roughness: 0.7,
  });

  var half = ROOM * 0.5;
  addBox(root, ROOM, 0.16, ROOM, 0, -0.08, 0, floorMat, false);
  addBox(root, ROOM, 0.12, ROOM, 0, WALL_H, 0, ceilMat, false);

  // 南 / 东 / 西：无字样墙（可切出 → C-1298）
  addBox(root, ROOM, WALL_H, 0.28, 0, WALL_H * 0.5, -half, wallMat, true);
  addClipProxy(root, ROOM - 0.6, 2.4, 0.35, 0, 1.4, -half + 0.05, "room_unmarked");

  addBox(root, 0.28, WALL_H, ROOM, -half, WALL_H * 0.5, 0, wallMat, true);
  addClipProxy(root, 0.35, 2.4, ROOM - 0.6, -half + 0.05, 1.4, 0, "room_unmarked");

  addBox(root, 0.28, WALL_H, ROOM, half, WALL_H * 0.5, 0, wallMat, true);
  // 东墙偏北一段贴有字样（→ C-1290），偏南仍无字样
  addBox(root, 0.06, 1.4, 2.2, half - 0.16, 1.7, -1.4, markedMat, false);
  addClipProxy(root, 0.4, 2.4, 2.4, half - 0.05, 1.4, -1.4, "room_marked");
  addClipProxy(root, 0.4, 2.4, 3.2, half - 0.05, 1.4, 1.6, "room_unmarked");

  // 北墙：中央开口进走廊，两侧有字样墙
  var opening = CORRIDOR_W;
  var sideW = (ROOM - opening) * 0.5;
  addBox(root, sideW, WALL_H, 0.28, -half + sideW * 0.5, WALL_H * 0.5, half, wallMat, true);
  addBox(root, sideW, WALL_H, 0.28, half - sideW * 0.5, WALL_H * 0.5, half, wallMat, true);
  addBox(root, 1.8, 1.2, 0.06, -half + sideW * 0.5, 1.8, half - 0.16, markedMat, false);
  addBox(root, 1.8, 1.2, 0.06, half - sideW * 0.5, 1.8, half - 0.16, markedMat, false);
  addClipProxy(root, sideW - 0.3, 2.4, 0.4, -half + sideW * 0.5, 1.4, half - 0.05, "room_marked");
  addClipProxy(root, sideW - 0.3, 2.4, 0.4, half - sideW * 0.5, 1.4, half - 0.05, "room_marked");

  // 走廊地板天花板
  var midZ = CORRIDOR_START_Z + CORRIDOR_LEN * 0.5;
  addBox(root, CORRIDOR_W, 0.16, CORRIDOR_LEN, 0, -0.08, midZ, floorMat, false);
  addBox(root, CORRIDOR_W, 0.12, CORRIDOR_LEN, 0, WALL_H, midZ, ceilMat, false);

  // 走廊侧墙 + 切出代理 + 窗户
  addBox(root, 0.24, WALL_H, CORRIDOR_LEN, -CORRIDOR_W * 0.5, WALL_H * 0.5, midZ, wallMat, true);
  addBox(root, 0.24, WALL_H, CORRIDOR_LEN, CORRIDOR_W * 0.5, WALL_H * 0.5, midZ, wallMat, true);
  addClipProxy(root, 0.35, 2.3, CORRIDOR_LEN - 2, -CORRIDOR_W * 0.5 + 0.05, 1.35, midZ, "corridor_wall");
  addClipProxy(root, 0.35, 2.3, CORRIDOR_LEN - 2, CORRIDOR_W * 0.5 - 0.05, 1.35, midZ, "corridor_wall");

  var wi;
  for (wi = 0; wi < 4; wi++) {
    var wz = CORRIDOR_START_Z + 3.5 + wi * 3.5;
    var glass = addBox(root, 0.08, 1.35, 1.5, CORRIDOR_W * 0.5 - 0.1, 1.55, wz, glassMat, false);
    glass.userData.windowIndex = wi;
    addClipProxy(root, 0.4, 1.5, 1.6, CORRIDOR_W * 0.5 - 0.05, 1.55, wz, "window", {
      windowIndex: wi,
    });
    addBox(root, 0.08, 1.35, 0.08, CORRIDOR_W * 0.5 - 0.1, 1.55, wz - 0.75, trimMat, false);
    addBox(root, 0.08, 1.35, 0.08, CORRIDOR_W * 0.5 - 0.1, 1.55, wz + 0.75, trimMat, false);
  }

  // 写着 0.1296% 的房门（走廊左侧）
  var doorZ = CORRIDOR_START_Z + 8;
  doorPanelMesh = addBox(root, 0.12, 2.4, 1.2, -CORRIDOR_W * 0.5 + 0.14, 1.2, doorZ, doorMat, false);
  addBox(root, 0.04, 0.55, 0.95, -CORRIDOR_W * 0.5 + 0.2, 2.2, doorZ, doorSignMat, false);
  addClipProxy(root, 0.5, 2.5, 1.4, -CORRIDOR_W * 0.5 + 0.2, 1.25, doorZ, "door_1296");

  // 尽头向上的楼梯
  var si;
  for (si = 0; si < 8; si++) {
    addBox(
      root,
      CORRIDOR_W - 0.3,
      0.22,
      0.55,
      0,
      0.12 + si * 0.22,
      CORRIDOR_END_Z - 0.1 + si * 0.45,
      stairMat,
      false
    );
  }
  addBox(root, CORRIDOR_W + 0.4, WALL_H + 2, 0.28, 0, (WALL_H + 2) * 0.5, CORRIDOR_END_Z + 3.4, wallMat, true);

  root.add(new THREE.AmbientLight(0xcfc6b0, 0.55));
  root.add(new THREE.HemisphereLight(0xf0e8d4, 0x6a6558, 0.7));
  var lamp = new THREE.PointLight(0xfff2d4, 1.1, 18, 2);
  lamp.position.set(0, 2.8, 0);
  root.add(lamp);
  var lamp2 = new THREE.PointLight(0xffe8c0, 0.9, 16, 2);
  lamp2.position.set(0, 2.8, midZ);
  root.add(lamp2);
}

function goToCLevel(num, toast) {
  if (transitionLock) return;
  transitionLock = true;
  if (toast) showToast(toast);
  saveBackroomsSurvival(survival);
  var passId = "c" + num;
  grantLevelPass(passId, fps.yaw);
  queueEnterLevelBanner("Level C-" + num);
  window.setTimeout(function () {
    window.location.href = "backrooms-level-c" + num + ".html";
  }, 700);
}

function clipsBlocked() {
  if (!hasFireSalt()) return false;
  showToast("背包里的火盐让切出失效了…");
  return true;
}

function tryForceClip() {
  if (clipsBlocked()) return true;
  var item = getSelectedHotbarItem();
  if (!item || !FORCE_ITEM_IDS[item.id]) return false;
  if (!currentAim) return false;
  var kind = currentAim.kind;
  if (
    kind !== "room_marked" &&
    kind !== "room_unmarked" &&
    kind !== "corridor_wall"
  ) {
    return false;
  }
  goToCLevel(1293, "你举起轮盘强行切出了墙面——狂风瞬间将你卷走…");
  return true;
}

function tryNormalClip() {
  if (!currentAim) return;
  if (tryForceClip()) return;
  if (clipsBlocked()) return;
  var kind = currentAim.kind;
  if (kind === "room_marked") {
    goToCLevel(1290, "你切出了有字样的房间墙壁…");
  } else if (kind === "room_unmarked") {
    goToCLevel(1298, "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！");
  } else if (kind === "corridor_wall") {
    // 极低概率：卡进鼓包渗粘液的墙壁 → C-1297
    if (Math.random() < 0.03) {
      goToCLevel(1297, "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！");
    } else {
      goToCLevel(1292, "你在走廊里切出了墙壁…");
    }
  } else if (kind === "window") {
    goToCLevel(1294, "警告：玻璃碎裂，你被抛入漫天锡厘贡的流萤死地！");
  } else if (kind === "door_1296") {
    if (!door1296Open) {
      door1296Open = true;
      if (doorPanelMesh) doorPanelMesh.rotation.y = -1.2;
      showToast("写着 0.1296% 的门开了。再按 Q 切出。");
      return;
    }
    goToCLevel(1296, "你从 0.1296% 的门后切出…");
  }
}

function onConsumeItem() {
  if (transitionLock) return;
  goToCLevel(1299, "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！");
}

function refreshAim() {
  currentAim = null;
  if (!camera || transitionLock || isInventoryOpen() || isTaskUiOpen()) return;
  if (!survival || survival.dead) return;
  var hit = pickCrosshairInteract(camera, interactRoots, 3.6);
  if (hit && hit.data) currentAim = hit.data;
}

function updateInteractUi() {
  var hidden = !currentAim || transitionLock;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      var kind = currentAim.kind;
      var force = getSelectedHotbarItem() && FORCE_ITEM_IDS[getSelectedHotbarItem().id];
      if (hasFireSalt()) {
        interactHintEl.innerHTML = "火盐抑制了切出（等待约 10 秒）";
      } else if (force) {
        interactHintEl.innerHTML = "手持轮盘 · 按 <kbd>Q</kbd> 强制切出";
      } else if (kind === "room_marked") {
        interactHintEl.innerHTML = "有字样的墙 · 按 <kbd>Q</kbd> 切出";
      } else if (kind === "room_unmarked") {
        interactHintEl.innerHTML = "没有字样的墙 · 按 <kbd>Q</kbd> 切出";
      } else if (kind === "corridor_wall") {
        interactHintEl.innerHTML = "走廊墙壁 · 按 <kbd>Q</kbd> 切出";
      } else if (kind === "window") {
        interactHintEl.innerHTML = "走廊窗户 · 按 <kbd>Q</kbd> 打破";
      } else if (kind === "door_1296") {
        interactHintEl.innerHTML = door1296Open
          ? "0.1296% 的门 · 按 <kbd>Q</kbd> 切出"
          : "写着 0.1296% 的房门 · 按 <kbd>Q</kbd> 打开";
      }
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen() || transitionLock;
    },
    onJump: function () {
      tryBackroomsJump(fps, 6.4);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        refreshAim();
        tryNormalClip();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1289", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1289", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1a16);
  scene.fog = new THREE.Fog(0x1c1a16, 8, 36);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC1289";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  // 进入 C-1289 时背包放入一瓶草莓豆奶（仅当还没有时补发，避免重复刷）
  if (countItem("strawberry_soy_milk") < 1) {
    if (addItem({ id: "strawberry_soy_milk", name: "草莓豆奶" })) {
      showToast("背包里多了一瓶草莓豆奶");
    }
  }
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1289" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: onConsumeItem,
    onStrawberrySoyMilkUsed: onConsumeItem,
    onBananaSoyMilkUsed: onConsumeItem,
    onLuckySoyMilkUsed: onConsumeItem,
    onVaultSoyMilkUsed: onConsumeItem,
    onRoyalRationsUsed: onConsumeItem,
  });
  initBackroomsTemperature("c1289", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1289 · 7×7 房间与走廊 · <kbd>Q</kbd> 切出/互动 · <kbd>R</kbd> 使用物品 · <kbd>B</kbd> 背包";
  }
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
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen() && !transitionLock) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 8);
      });
    }

    if (!transitionLock && survival && !survival.dead) {
      if (isInCorridor(fps.player.x, fps.player.z)) {
        corridorTimer += dt * 1000;
        if (corridorTimer >= CORRIDOR_DWELL_MS) {
          goToCLevel(1291, "在走廊里待得太久，楼道声响了起来…");
        }
      } else {
        corridorTimer = Math.max(0, corridorTimer - dt * 2000);
      }

      if (hasFireSalt()) {
        fireSaltTimer += dt * 1000;
        if (hintEl && fireSaltTimer > 200) {
          hintEl.innerHTML =
            "火盐抑制切出 · " + Math.max(0, Math.ceil((FIRE_SALT_WAIT_MS - fireSaltTimer) / 1000)) + " 秒后…";
        }
        if (fireSaltTimer >= FIRE_SALT_WAIT_MS) {
          goToCLevel(1297, "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！");
        }
      } else {
        fireSaltTimer = 0;
      }

      if (isOnStairs(fps.player.x, fps.player.z)) {
        goToCLevel(1295, "空间紊乱加剧！你触发了危险切出，即将被抛入死区序列！");
      }
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAim();
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
  console.error("[Backrooms C-1289]", err);
  showError(err.message || String(err));
}

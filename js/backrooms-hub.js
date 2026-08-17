/**
 * 枢纽（The Hub）— 安全、稳定、无实体的无限地下公路隧道。
 * 大门没有可见编号；第 2 扇原生解锁门通往 L1，第 11 扇通往 L11。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler, countItem } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  getVisitedLevelIds,
} from "./backrooms-tasks.js";
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
const CHUNK_LEN = 48;
const STREAM_BEHIND = 2;
const STREAM_AHEAD = 4;
const TUNNEL_HALF_W = 9;
const TUNNEL_H = 7;
const DOORS_PER_CHUNK = 4;
const VANISHED_KEY = "backrooms_hub_vanished_doors_v1";

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: true, sanityDrainPerSec: 0 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: TUNNEL_H, floorY: 0 };

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
let chunksRoot = null;
let transitionLock = false;
let currentAim = null;
let activeColliders = [];
let activeInteractRoots = [];
let chunks = new Map();
let vanishedDoors = readVanishedDoors();
let discovered = getVisitedLevelIds();
const symbolMaterials = new Map();
const destinationMarkMaterials = new Map();

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const symbolGeo = new THREE.PlaneGeometry(2.3, 2.3);
const destinationMarkGeo = new THREE.PlaneGeometry(2.7, 2.7);
const mats = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x373a3b, roughness: 0.96 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x858480, roughness: 0.92 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x676762, roughness: 0.96 }),
  stripe: new THREE.MeshStandardMaterial({
    color: 0xd8ae36,
    emissive: 0x5b3d08,
    emissiveIntensity: 0.22,
    roughness: 0.72,
  }),
  door: new THREE.MeshStandardMaterial({ color: 0x656661, roughness: 0.98 }),
  doorLocked: new THREE.MeshStandardMaterial({ color: 0x444541, roughness: 1 }),
  lamp: new THREE.MeshStandardMaterial({
    color: 0xffc447,
    emissive: 0xff8c16,
    emissiveIntensity: 1.5,
    roughness: 0.42,
  }),
  dark: new THREE.MeshBasicMaterial({ color: 0x10100e }),
  pick: new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  }),
};

/** 门的内部顺序被故意打乱，场景中不会显示这些编号。 */
const CORE_DOORS = {
  1: "l8",
  2: "l1",
  3: "l14",
  4: "l3",
  5: "l21",
  6: "l6",
  7: "l10",
  8: "l4",
  9: "l13",
  10: "l2",
  11: "l11",
};

const LEVEL_TARGETS = {
  l0: { pass: "l0", page: "backrooms-level0.html", banner: "Level 0" },
  l1: { pass: "clip", page: "backrooms-level1.html", banner: "Level 1" },
  l2: { pass: "l2", page: "backrooms-level2.html", banner: "Level 2" },
  l3: { pass: "l3", page: "backrooms-level3.html", banner: "Level 3" },
  l4: { pass: "l4", page: "backrooms-level4.html", banner: "Level 4" },
  l6: { pass: "l6", page: "backrooms-level6.html", banner: "Level 6" },
  l6_1: { pass: "l6_1", page: "backrooms-level6-1.html", banner: "Level 6.1" },
  l7: { pass: "l7", page: "backrooms-level7.html", banner: "Level 7" },
  l8: { pass: "l8", page: "backrooms-level8.html", banner: "Level 8" },
  l9: { pass: "l9", page: "backrooms-level9.html", banner: "Level 9" },
  l10: { pass: "l10", page: "backrooms-level10.html", banner: "Level 10" },
  l11: { pass: "l11", page: "backrooms-level11.html", banner: "Level 11" },
  l13: { pass: "l13", page: "backrooms-level13.html", banner: "Level 13" },
  l14: { pass: "l14", page: "backrooms-level14.html", banner: "Level 14" },
  l16: { pass: "l16", page: "backrooms-level16.html", banner: "Level 16" },
  l21: { pass: "l21", page: "backrooms-level21.html", banner: "Level 21" },
  l37: { pass: "l37", page: "backrooms-level37.html", banner: "Level 37" },
  l46: { pass: "l46", page: "backrooms-level46.html", banner: "Level 46" },
  l48: { pass: "l48", page: "backrooms-level48.html", banner: "Level 48" },
  l57: { pass: "l57", page: "backrooms-level57.html", banner: "Level 57" },
  l75: { pass: "l75", page: "backrooms-level75.html", banner: "Level 75" },
  l119: { pass: "l119", page: "backrooms-level119.html", banner: "Level 119" },
  l121: { pass: "l121", page: "backrooms-level121.html", banner: "Level 121" },
  l149: { pass: "l149", page: "backrooms-level149.html", banner: "Level 149" },
  l283: { pass: "l283", page: "backrooms-level283.html", banner: "Level 283" },
  c1289: { pass: "c1289", page: "backrooms-level-c1289.html", banner: "Level C-1289" },
  c1290: { pass: "c1290", page: "backrooms-level-c1290.html", banner: "Level C-1290" },
  c1291: { pass: "c1291", page: "backrooms-level-c1291.html", banner: "Level C-1291" },
  c1292: { pass: "c1292", page: "backrooms-level-c1292.html", banner: "Level C-1292" },
  c1293: { pass: "c1293", page: "backrooms-level-c1293.html", banner: "Level C-1293" },
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>枢纽无法启动</strong></p><p>" + String(text) + "</p>";
}

function readVanishedDoors() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(VANISHED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function markDoorVanished(id) {
  if (vanishedDoors.indexOf(id) < 0) vanishedDoors.push(id);
  try {
    sessionStorage.setItem(VANISHED_KEY, JSON.stringify(vanishedDoors));
  } catch (err) {
    /* ignore */
  }
}

function makeSymbolTexture(seed) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "#d7b04a";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(128, 128, 91, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  var arms = 5 + (Math.abs(seed) % 5);
  for (var i = 0; i < arms; i++) {
    var a = (i / arms) * Math.PI * 2 + seed * 0.37;
    var inner = 22 + ((seed + i * 7) % 31);
    ctx.beginPath();
    ctx.arc(128, 128, inner, a, a + Math.PI * (0.45 + (i % 3) * 0.2));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 28, 128 + Math.sin(a) * 28);
    ctx.lineTo(128 + Math.cos(a) * 82, 128 + Math.sin(a) * 82);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function symbolMaterial(index) {
  if (!symbolMaterials.has(index)) {
    symbolMaterials.set(
      index,
      new THREE.MeshBasicMaterial({
        map: makeSymbolTexture(index),
        transparent: true,
      })
    );
  }
  return symbolMaterials.get(index);
}

function makeDestinationMarkTexture(kind) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "#e6bd54";
  ctx.fillStyle = "rgba(230, 189, 84, 0.16)";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "warehouse") {
    // Level 1：带卷帘门的仓库。
    ctx.beginPath();
    ctx.moveTo(31, 91);
    ctx.lineTo(128, 43);
    ctx.lineTo(225, 91);
    ctx.lineTo(225, 218);
    ctx.lineTo(31, 218);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(70, 116, 116, 102);
    for (var wy = 137; wy < 213; wy += 20) {
      ctx.beginPath();
      ctx.moveTo(70, wy);
      ctx.lineTo(186, wy);
      ctx.stroke();
    }
  } else if (kind === "office") {
    // Level 4：多层办公室。
    ctx.fillRect(50, 38, 156, 185);
    ctx.strokeRect(50, 38, 156, 185);
    ctx.strokeRect(105, 161, 46, 62);
    for (var oy = 66; oy <= 132; oy += 33) {
      for (var ox = 75; ox <= 168; ox += 47) {
        ctx.strokeRect(ox, oy, 22, 18);
      }
    }
    ctx.beginPath();
    ctx.moveTo(35, 223);
    ctx.lineTo(221, 223);
    ctx.stroke();
  } else {
    // Level 11：普通住宅。
    ctx.beginPath();
    ctx.moveTo(31, 116);
    ctx.lineTo(128, 42);
    ctx.lineTo(225, 116);
    ctx.lineTo(202, 116);
    ctx.lineTo(202, 220);
    ctx.lineTo(54, 220);
    ctx.lineTo(54, 116);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(104, 151, 48, 69);
    ctx.strokeRect(68, 129, 28, 28);
    ctx.strokeRect(160, 129, 28, 28);
  }

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function destinationMarkMaterial(kind) {
  if (!destinationMarkMaterials.has(kind)) {
    destinationMarkMaterials.set(
      kind,
      new THREE.MeshBasicMaterial({
        map: makeDestinationMarkTexture(kind),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      })
    );
  }
  return destinationMarkMaterials.get(kind);
}

function addDestinationMark(group, kind, side, x, y, z) {
  var mark = new THREE.Mesh(destinationMarkGeo, destinationMarkMaterial(kind));
  mark.position.set(side === "left" ? x + 0.225 : x - 0.225, y, z);
  mark.rotation.y = side === "left" ? Math.PI * 0.5 : -Math.PI * 0.5;
  mark.renderOrder = 3;
  group.add(mark);
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(group, material, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(boxGeo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function additionalDiscoveredLevels() {
  var used = Object.create(null);
  Object.keys(CORE_DOORS).forEach(function (key) {
    used[CORE_DOORS[key]] = true;
  });
  return discovered.filter(function (id) {
    return LEVEL_TARGETS[id] && !used[id];
  });
}

function targetForDoor(index) {
  if (CORE_DOORS[index]) return CORE_DOORS[index];
  var extras = additionalDiscoveredLevels();
  return extras[index - 12] || null;
}

function nativeUnlocked(index) {
  return index === 2 || index === 11;
}

function buildDoor(group, record, index, side, z) {
  var targetId = targetForDoor(index);
  var doorId = "door_" + index;
  if (vanishedDoors.indexOf(doorId) >= 0) return;
  // 前 11 扇始终存在；后续只有发现对应层级时才生成。
  if (index > 11 && !targetId) return;
  var x = side === "left" ? -TUNNEL_HALF_W + 0.24 : TUNNEL_HALF_W - 0.24;
  var door = addBox(
    group,
    nativeUnlocked(index) ? mats.door : mats.doorLocked,
    x,
    2.35,
    z,
    0.42,
    4.7,
    5.4
  );
  var symbol = new THREE.Mesh(
    symbolGeo,
    symbolMaterial(index)
  );
  symbol.position.set(side === "left" ? x + 0.23 : x - 0.23, 5.5, z);
  symbol.rotation.y = side === "left" ? Math.PI * 0.5 : -Math.PI * 0.5;
  group.add(symbol);
  if (targetId === "l1") {
    addDestinationMark(group, "warehouse", side, x, 2.45, z);
  } else if (targetId === "l11") {
    addDestinationMark(group, "house", side, x, 2.45, z);
  }
  var pick = new THREE.Mesh(boxGeo, mats.pick);
  pick.scale.set(0.9, 5.2, 5.8);
  pick.position.copy(door.position);
  pick.userData.brInteract = {
    kind: "hub_door",
    doorId: doorId,
    index: index,
    targetId: targetId,
    native: nativeUnlocked(index),
  };
  group.add(pick);
  record.interactRoots.push(pick);
}

function buildChunk(index) {
  var group = new THREE.Group();
  group.name = "HubTunnelChunk_" + index;
  var z0 = index * CHUNK_LEN;
  var zc = z0 + CHUNK_LEN * 0.5;
  var record = { group: group, colliders: [], interactRoots: [] };
  addBox(group, mats.asphalt, 0, -0.08, zc, TUNNEL_HALF_W * 2, 0.16, CHUNK_LEN + 0.2);
  addBox(group, mats.concreteDark, 0, TUNNEL_H, zc, TUNNEL_HALF_W * 2, 0.25, CHUNK_LEN + 0.2);
  addBox(group, mats.concrete, -TUNNEL_HALF_W, TUNNEL_H * 0.5, zc, 0.48, TUNNEL_H, CHUNK_LEN + 0.2);
  addBox(group, mats.concrete, TUNNEL_HALF_W, TUNNEL_H * 0.5, zc, 0.48, TUNNEL_H, CHUNK_LEN + 0.2);
  record.colliders.push(
    wallCollider(-TUNNEL_HALF_W - 0.3, -TUNNEL_HALF_W + 0.25, z0, z0 + CHUNK_LEN),
    wallCollider(TUNNEL_HALF_W - 0.25, TUNNEL_HALF_W + 0.3, z0, z0 + CHUNK_LEN)
  );

  // 黄色车道虚线。
  for (var lz = z0 + 3; lz < z0 + CHUNK_LEN; lz += 8) {
    addBox(group, mats.stripe, 0, 0.025, lz, 0.18, 0.025, 4);
  }
  // 混凝土板接缝与无规律倾斜的空间肋架。
  for (lz = z0; lz <= z0 + CHUNK_LEN; lz += 8) {
    addBox(group, mats.concreteDark, -TUNNEL_HALF_W + 0.3, 3.5, lz, 0.08, 7, 0.1);
    addBox(group, mats.concreteDark, TUNNEL_HALF_W - 0.3, 3.5, lz, 0.08, 7, 0.1);
    var rib = addBox(group, mats.concreteDark, 0, 6.75, lz, TUNNEL_HALF_W * 2 - 0.7, 0.18, 0.3);
    rib.rotation.z = index % 3 === 0 && lz % 16 === 0 ? 0.035 : 0;
  }
  // 两侧黄色工业灯，不播放任何环境声。
  for (lz = z0 + 4; lz < z0 + CHUNK_LEN; lz += 8) {
    addBox(group, mats.lamp, -TUNNEL_HALF_W + 0.5, 4.8, lz, 0.16, 0.36, 3.6);
    addBox(group, mats.lamp, TUNNEL_HALF_W - 0.5, 4.8, lz, 0.16, 0.36, 3.6);
    if ((lz / 8) % 2 === 0) {
      var light = new THREE.PointLight(0xffaa31, 0.62, 13, 2);
      light.position.set(0, 4.8, lz);
      group.add(light);
    }
  }

  if (index >= 0) {
    var first = index * DOORS_PER_CHUNK + 1;
    buildDoor(group, record, first, "left", z0 + 8);
    buildDoor(group, record, first + 1, "left", z0 + 20);
    buildDoor(group, record, first + 2, "right", z0 + 8);
    buildDoor(group, record, first + 3, "right", z0 + 20);
    // 第一和第二扇门之间的墙壁可切出至 Level 4。
    if (index === 0) {
      addDestinationMark(
        group,
        "office",
        "left",
        -TUNNEL_HALF_W,
        2.25,
        z0 + 14
      );
      var clipPick = new THREE.Mesh(boxGeo, mats.pick);
      clipPick.scale.set(0.8, 4.2, 4.3);
      clipPick.position.set(-TUNNEL_HALF_W + 0.3, 2.1, z0 + 14);
      clipPick.userData.brInteract = { kind: "hub_clip_wall" };
      group.add(clipPick);
      record.interactRoots.push(clipPick);
    }
  }

  // 远处的分叉只作结构与纵深提示，主路始终保持可通行。
  if (index % 3 === 1) {
    addBox(group, mats.dark, TUNNEL_HALF_W - 0.12, 2.4, z0 + 35, 0.15, 4.8, 5.6);
    addBox(group, mats.asphalt, TUNNEL_HALF_W + 5, -0.07, z0 + 35, 10, 0.14, 5.4);
  }
  chunksRoot.add(group);
  return record;
}

function rebuildActiveLists() {
  activeColliders.length = 0;
  activeInteractRoots.length = 0;
  chunks.forEach(function (chunk) {
    Array.prototype.push.apply(activeColliders, chunk.colliders);
    Array.prototype.push.apply(activeInteractRoots, chunk.interactRoots);
  });
}

function updateStreaming() {
  var center = Math.floor(fps.player.z / CHUNK_LEN);
  var wanted = Object.create(null);
  var changed = false;
  var i;
  for (i = center - STREAM_BEHIND; i <= center + STREAM_AHEAD; i++) {
    wanted[i] = true;
    if (!chunks.has(i)) {
      chunks.set(i, buildChunk(i));
      changed = true;
    }
  }
  var remove = [];
  chunks.forEach(function (_chunk, key) {
    if (!wanted[key]) remove.push(key);
  });
  for (i = 0; i < remove.length; i++) {
    var old = chunks.get(remove[i]);
    if (old && old.group.parent) old.group.parent.remove(old.group);
    chunks.delete(remove[i]);
    changed = true;
  }
  if (changed) rebuildActiveLists();
}

function refreshAim() {
  currentAim = pickCrosshairInteract(camera, activeInteractRoots, 4.5);
}

function updateInteractUi() {
  var active =
    !!currentAim &&
    !transitionLock &&
    !isInventoryOpen() &&
    survival &&
    !survival.dead;
  if (interactHintEl) {
    interactHintEl.hidden = !active;
    if (active) {
      var data = currentAim.data || null;
      interactHintEl.innerHTML =
        data && data.kind === "hub_clip_wall"
          ? "混凝土板接缝异常 · 按 <kbd>Q</kbd> 切出"
          : "刻有环形符号的厚重大门 · 按 <kbd>Q</kbd> 检查";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", active);
  }
}

function leaveHub(target, doorId) {
  if (transitionLock || !target) return;
  transitionLock = true;
  if (doorId) markDoorVanished(doorId);
  showToast("厚重的大门开启。穿过之后，门在身后直接消失。", 3600);
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass(target.pass, fps.yaw);
  queueEnterLevelBanner(target.banner);
  window.setTimeout(function () {
    window.location.href = target.page;
  }, 750);
}

function tryInteract() {
  if (!currentAim || transitionLock) return;
  var data = currentAim.data || null;
  if (!data) return;
  if (data.kind === "hub_clip_wall") {
    leaveHub(LEVEL_TARGETS.l4, null);
    return;
  }
  if (data.kind !== "hub_door") return;
  var target = data.targetId ? LEVEL_TARGETS[data.targetId] : null;
  if (!target) {
    showToast("门后的环形符号尚未与任何已发现层级对应。");
    return;
  }
  if (!data.native && countItem("level_key_" + data.targetId) < 1) {
    showToast("大门完全锁死。你缺少与这个环形符号对应的层级密钥。");
    return;
  }
  leaveHub(target, data.doorId);
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
      tryBackroomsJump(fps, 6);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        refreshAim();
        tryInteract();
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
  if (!enforceLevelEntry("hub", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("hub", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x211b13);
  scene.fog = new THREE.Fog(0x211b13, 34, 105);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 120);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  chunksRoot = new THREE.Group();
  chunksRoot.name = "HubInfiniteTunnel";
  scene.add(chunksRoot);
  scene.add(new THREE.HemisphereLight(0xffc66b, 0x2c2925, 0.42));
  scene.add(new THREE.AmbientLight(0xffb34f, 0.18));
  updateStreaming();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("hub", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "枢纽 · 安全、稳定、无实体 · 大门没有编号 · <kbd>Q</kbd> 检查大门 · " +
      "<kbd>WASD</kbd> 移动";
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
      // 枢纽没有环境伤害；项目当前没有独立饥饿/口渴值，因此不产生对应消耗。
      survival.update(dt, _survCtx);
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen() && !transitionLock) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, activeColliders, 12);
      });
    }
    updateStreaming();
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
  console.error("[Backrooms Hub]", err);
  showError(err.message || String(err));
}

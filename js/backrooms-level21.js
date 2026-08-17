/**
 * Backrooms Level 21 — 中央花园 + 十字四走廊。
 * 每条走廊各 1 只死亡飞蛾、1 只肢团（不会进入花园，也不攻击花园里的人）。
 * 每条走廊至少 10 扇门；无字之门打不开。部分门被替换为写着编号的门，
 * 打开后前往对应 Level（该层级未制作则不会出现此门；同一编号不会重复）。
 * 每次进入另有 5% 概率出现一扇通往 Level 46 的生锈门。
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
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { createDeathMothsAt } from "./backrooms-death-moth.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";
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

const WALL_H = 3.2;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.2;

const GARDEN_HALF = 7; // 花园半边长（14×14）
const OPENING_HALF = 2; // 各面走廊开口半宽（宽 4）
const CORRIDOR_HALF_W = 2; // 走廊半宽
const CORRIDOR_LEN = 44; // 走廊长度
const WALL_T = 0.24;
const DOOR_W = 1.9;
const DOOR_H = 2.35;
/** 每侧墙门的前向距离（相对花园中心），共 6×2=12 扇/走廊 */
const DOOR_FORWARD = [12, 18, 24, 30, 36, 42];

/**
 * 门编号 → 目标层级映射。made=false 表示该层级尚未制作，门不会出现。
 * @type {{ num: number, level: number, page: string, pass: string|null, prob: number, made: boolean }[]}
 */
const DOOR_TABLE = [
  { num: 105, level: 0, page: "backrooms-level0.html", pass: "l0", prob: 0.05, made: true },
  { num: 356, level: 356, page: "backrooms-level356.html", pass: null, prob: 0.01, made: false },
  { num: 8, level: 8, page: "backrooms-level8.html", pass: "l8", prob: 0.02, made: true },
  { num: 9, level: 9, page: "backrooms-level9.html", pass: "l9", prob: 0.03, made: true },
  { num: 10, level: 10, page: "backrooms-level10.html", pass: "l10", prob: 0.05, made: true },
  { num: 11, level: 11, page: "backrooms-level11.html", pass: "l11", prob: 0.09, made: true },
  { num: 12, level: 12, page: "backrooms-level12.html", pass: "l12", prob: 0.06, made: false },
  { num: 13, level: 13, page: "backrooms-level13.html", pass: "l13", prob: 0.06, made: true },
  { num: 14, level: 14, page: "backrooms-level14.html", pass: "l14", prob: 0.06, made: true },
  { num: 15, level: 15, page: "backrooms-level15.html", pass: "l15", prob: 0.06, made: false },
  { num: 16, level: 16, page: "backrooms-level16.html", pass: "l16", prob: 0.06, made: false },
  { num: 17, level: 17, page: "backrooms-level17.html", pass: "l17", prob: 0.06, made: false },
  { num: 18, level: 18, page: "backrooms-level18.html", pass: "l18", prob: 0.06, made: false },
  { num: 19, level: 19, page: "backrooms-level19.html", pass: "l19", prob: 0.06, made: false },
  { num: 20, level: 20, page: "backrooms-level20.html", pass: "l20", prob: 0.06, made: false },
];
const RUST_DOOR = {
  rust: true,
  level: 46,
  page: "backrooms-level46.html",
  pass: "l46",
  prob: 0.05,
};

const ARMS = [
  { id: "pz", fx: 0, fz: 1, rx: 1, rz: 0 },
  { id: "nz", fx: 0, fz: -1, rx: 1, rz: 0 },
  { id: "px", fx: 1, fz: 0, rx: 0, rz: 1 },
  { id: "nx", fx: -1, fz: 0, rx: 0, rz: 1 },
];

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

const colliders = [];
const interactRoots = [];
const doorSlots = [];
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };
const fps = createBackroomsFpsState({
  player: { x: 0, z: 3, radius: 0.32, speed: 4.05 },
});

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let currentAimPick = null;
let transitionLock = false;
let moths = null;
let clumps = null;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, material) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

/** 添加一段带碰撞的墙（中心 x,z，尺寸 w×d） */
function addWall(root, material, x, z, w, d) {
  addBox(root, w, WALL_H, d, x, WALL_H * 0.5, z, material);
  colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
}

import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  isTaskAccepted,
  isTaskDelivered,
  isTaskCompleted,
  deliverMapTask,
} from "./backrooms-tasks.js";

function showToast(message) {
  showBackroomsLootToast(message, { durationMs: 2600 });
}

function showError(message) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 21 无法启动</strong></p><p>" + message + "</p>";
}

var _doorNumberTexCache = Object.create(null);
var _doorFrameGeo = null;
var _doorPanelGeo = null;
var _doorPickGeo = null;
var _doorSignGeo = null;
var _doorSignMatCache = Object.create(null);

function makeDoorNumberTexture(text) {
  var key = String(text);
  if (_doorNumberTexCache[key]) return _doorNumberTexCache[key];
  var canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 128;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#efe7d2";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#9c7a3c";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = "#3a2a12";
  ctx.font = "bold 74px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(key, 128, 68);
  var texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  _doorNumberTexCache[key] = texture;
  return texture;
}

function doorSignMaterial(num) {
  var key = String(num);
  if (_doorSignMatCache[key]) return _doorSignMatCache[key];
  var mat = new THREE.MeshBasicMaterial({ map: makeDoorNumberTexture(num) });
  _doorSignMatCache[key] = mat;
  return mat;
}

/** 掷骰决定哪些编号门出现，并随机分配到空闲门位（编号唯一） */
function assignSpecialDoors() {
  var freeIdx = [];
  var i;
  for (i = 0; i < doorSlots.length; i++) freeIdx.push(i);
  // 洗牌门位顺序
  for (i = freeIdx.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = freeIdx[i];
    freeIdx[i] = freeIdx[j];
    freeIdx[j] = t;
  }
  var cursor = 0;
  // 生锈门独立进行一次 5% 判定，不参与编号门的概率表。
  if (freeIdx.length > 0 && Math.random() < RUST_DOOR.prob) {
    doorSlots[freeIdx[cursor]].door = RUST_DOOR;
    cursor += 1;
  }
  var e;
  for (e = 0; e < DOOR_TABLE.length; e++) {
    var entry = DOOR_TABLE[e];
    if (!entry.made) continue;
    if (Math.random() >= entry.prob) continue;
    if (cursor >= freeIdx.length) break;
    doorSlots[freeIdx[cursor]].door = entry;
    cursor += 1;
  }
  // 若本次所有概率都未命中，从已制作层级中随机选一扇作为保底。
  if (cursor === 0 && freeIdx.length > 0) {
    var available = DOOR_TABLE.filter(function (entry) {
      return entry.made;
    });
    if (available.length > 0) {
      doorSlots[freeIdx[0]].door =
        available[Math.floor(Math.random() * available.length)];
    }
  }
}

function makeDoorMaterials() {
  return {
    blank: new THREE.MeshStandardMaterial({ color: 0x6f4a2c, roughness: 0.82 }),
    numbered: new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.7 }),
    rust: new THREE.MeshStandardMaterial({
      color: 0x7a3d24,
      roughness: 0.96,
      metalness: 0.42,
    }),
    knob: new THREE.MeshStandardMaterial({ color: 0xd8c48a, metalness: 0.6, roughness: 0.4 }),
  };
}

/** 在门位处放置门板、门框、把手，编号门额外挂号牌与交互体 */
function buildDoorMeshes(root) {
  var mats = makeDoorMaterials();
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x402a18, roughness: 0.8 });
  var s;
  for (s = 0; s < doorSlots.length; s++) {
    var slot = doorSlots[s];
    var numbered = !!slot.door && !slot.door.rust;
    var rusty = !!slot.door && !!slot.door.rust;
    var group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    group.rotation.y = slot.rotY;
    root.add(group);

    // 门框
    if (!_doorFrameGeo) _doorFrameGeo = new THREE.BoxGeometry(DOOR_W + 0.28, DOOR_H + 0.24, 0.1);
    if (!_doorPanelGeo) _doorPanelGeo = new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.08);
    if (!_doorPickGeo) _doorPickGeo = new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.4);
    if (!_doorSignGeo) _doorSignGeo = new THREE.PlaneGeometry(0.86, 0.43);
    var frame = new THREE.Mesh(_doorFrameGeo, frameMat);
    frame.position.set(0, DOOR_H * 0.5, 0.02);
    group.add(frame);
    // 门板
    var panel = new THREE.Mesh(
      _doorPanelGeo,
      rusty ? mats.rust : numbered ? mats.numbered : mats.blank
    );
    panel.position.set(0, DOOR_H * 0.5, 0.07);
    group.add(panel);
    // 把手
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.knob);
    knob.position.set(DOOR_W * 0.36, DOOR_H * 0.5, 0.13);
    group.add(knob);

    if (numbered) {
      var sign = new THREE.Mesh(_doorSignGeo, doorSignMaterial(slot.door.num));
      sign.position.set(0, DOOR_H * 0.5 + 0.18, 0.12);
      group.add(sign);
    }

    var pick = new THREE.Mesh(
      _doorPickGeo,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.set(0, DOOR_H * 0.5, 0.22);
    pick.userData.brInteract = { kind: "l21_door", slot: s };
    group.add(pick);
    interactRoots.push(pick);
  }
}

/** 收集所有门位（世界坐标 + 朝向），供分配与建模 */
function collectDoorSlots() {
  var a;
  for (a = 0; a < ARMS.length; a++) {
    var arm = ARMS[a];
    var d;
    for (d = 0; d < DOOR_FORWARD.length; d++) {
      var fwd = DOOR_FORWARD[d];
      // 内壁面略微内移，门朝向走廊中心（-side*right）
      var side;
      for (side = -1; side <= 1; side += 2) {
        var offset = CORRIDOR_HALF_W - 0.06;
        var x = arm.fx * fwd + arm.rx * side * offset;
        var z = arm.fz * fwd + arm.rz * side * offset;
        // 门朝向 = -side * right 方向
        var nx = -arm.rx * side;
        var nz = -arm.rz * side;
        var rotY = Math.atan2(nx, nz);
        doorSlots.push({ x: x, z: z, rotY: rotY, arm: arm.id, door: null });
      }
    }
  }
}

function buildGarden(root, grassMat, wallMat) {
  // 草地与泥土边
  addBox(root, GARDEN_HALF * 2, 0.16, GARDEN_HALF * 2, 0, 0, 0, grassMat);
  // 天花（明亮天窗观感）
  var skyMat = new THREE.MeshStandardMaterial({
    color: 0xf3f7ff,
    emissive: 0xdfe9ff,
    emissiveIntensity: 0.55,
    roughness: 1,
  });
  addBox(root, GARDEN_HALF * 2, 0.12, GARDEN_HALF * 2, 0, WALL_H, 0, skyMat);

  // 四面墙，各中间留出 2*OPENING_HALF 的走廊开口
  var seg = (GARDEN_HALF - OPENING_HALF) * 0.5;
  var far = OPENING_HALF + seg; // 两段墙的中心偏移
  // 北墙 (+z) 与南墙 (-z)：沿 x 分两段
  var sz;
  for (sz = -1; sz <= 1; sz += 2) {
    addWall(root, wallMat, -far, sz * GARDEN_HALF, seg * 2, WALL_T);
    addWall(root, wallMat, far, sz * GARDEN_HALF, seg * 2, WALL_T);
  }
  // 东墙 (+x) 与西墙 (-x)：沿 z 分两段
  var sx;
  for (sx = -1; sx <= 1; sx += 2) {
    addWall(root, wallMat, sx * GARDEN_HALF, -far, WALL_T, seg * 2);
    addWall(root, wallMat, sx * GARDEN_HALF, far, WALL_T, seg * 2);
  }

  // 花园装饰：中央花坛 + 四角灌木
  var hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f6b31, roughness: 0.9 });
  var soilMat = new THREE.MeshStandardMaterial({ color: 0x5b3d24, roughness: 0.95 });
  var planter = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.55, 0.5, 20), soilMat);
  planter.position.set(0, 0.33, 0);
  root.add(planter);
  colliders.push(wallCollider(-1.55, 1.55, -1.55, 1.55));
  var bush = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), hedgeMat);
  bush.scale.set(1, 0.85, 1);
  bush.position.set(0, 1.15, 0);
  root.add(bush);
  var flowerMat = new THREE.MeshStandardMaterial({
    color: 0xe86a9a,
    emissive: 0x35101f,
    emissiveIntensity: 0.2,
    roughness: 0.8,
  });
  var f;
  for (f = 0; f < 10; f++) {
    var ang = (f / 10) * Math.PI * 2;
    var flower = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flowerMat);
    flower.position.set(Math.cos(ang) * 1.0, 1.75, Math.sin(ang) * 1.0);
    root.add(flower);
  }
  var c;
  var corners = [
    [-GARDEN_HALF + 1.5, -GARDEN_HALF + 1.5],
    [GARDEN_HALF - 1.5, -GARDEN_HALF + 1.5],
    [-GARDEN_HALF + 1.5, GARDEN_HALF - 1.5],
    [GARDEN_HALF - 1.5, GARDEN_HALF - 1.5],
  ];
  for (c = 0; c < corners.length; c++) {
    var hedge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), hedgeMat);
    hedge.position.set(corners[c][0], 0.55, corners[c][1]);
    root.add(hedge);
    colliders.push(
      wallCollider(
        corners[c][0] - 0.8,
        corners[c][0] + 0.8,
        corners[c][1] - 0.8,
        corners[c][1] + 0.8
      )
    );
  }
}

function buildCorridor(root, arm, wallMat, floorMat) {
  var startD = GARDEN_HALF;
  var endD = GARDEN_HALF + CORRIDOR_LEN;
  var midD = (startD + endD) * 0.5;
  var lenD = endD - startD;

  // 地板与天花（沿走廊铺设）
  var floorW = arm.fx !== 0 ? lenD : CORRIDOR_HALF_W * 2;
  var floorD = arm.fx !== 0 ? CORRIDOR_HALF_W * 2 : lenD;
  var cx = arm.fx * midD;
  var cz = arm.fz * midD;
  addBox(root, floorW, 0.14, floorD, cx, 0, cz, floorMat);
  addBox(root, floorW, 0.12, floorD, cx, WALL_H, cz, wallMat);

  // 两侧墙（沿走廊全长）
  var side;
  for (side = -1; side <= 1; side += 2) {
    var wx = arm.fx * midD + arm.rx * side * CORRIDOR_HALF_W;
    var wz = arm.fz * midD + arm.rz * side * CORRIDOR_HALF_W;
    var ww = arm.fx !== 0 ? lenD : WALL_T;
    var wd = arm.fx !== 0 ? WALL_T : lenD;
    addWall(root, wallMat, wx, wz, ww, wd);
  }
  // 尽头封墙
  var ex = arm.fx * endD;
  var ez = arm.fz * endD;
  var ew = arm.fx !== 0 ? WALL_T : CORRIDOR_HALF_W * 2 + WALL_T;
  var ed = arm.fx !== 0 ? CORRIDOR_HALF_W * 2 + WALL_T : WALL_T;
  addWall(root, wallMat, ex, ez, ew, ed);
}

function spawnEntities(root) {
  var mothSpawns = [];
  var clumpSpawns = [];
  var a;
  for (a = 0; a < ARMS.length; a++) {
    var arm = ARMS[a];
    var mothD = GARDEN_HALF + 16;
    var clumpD = GARDEN_HALF + 26;
    var backYaw = Math.atan2(-arm.fx, -arm.fz);
    mothSpawns.push({
      x: arm.fx * mothD,
      z: arm.fz * mothD,
      y: 1.55,
      rotY: backYaw,
    });
    clumpSpawns.push({
      x: arm.fx * clumpD + arm.rx * 0.9,
      z: arm.fz * clumpD + arm.rz * 0.9,
      rotY: backYaw,
      seed: a * 17 + 3,
    });
  }
  moths = createDeathMothsAt(root, mothSpawns, colliders);
  clumps = createClumpsAt(root, clumpSpawns, colliders);
}

function buildWorld(root) {
  var grassMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.95 });
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xcbb98d, roughness: 0.9 });
  var hallFloor = new THREE.MeshStandardMaterial({ color: 0x8d7a5c, roughness: 0.9 });

  buildGarden(root, grassMat, wallMat);

  var a;
  for (a = 0; a < ARMS.length; a++) {
    buildCorridor(root, ARMS[a], wallMat, hallFloor);
  }

  collectDoorSlots();
  assignSpecialDoors();
  buildDoorMeshes(root);

  // 灯光：花园明亮，走廊偏暗且沿途点灯
  root.add(new THREE.HemisphereLight(0xfdfbf0, 0x40402f, 1.05));
  var gardenLight = new THREE.PointLight(0xfff3d0, 0.9, 20, 2);
  gardenLight.position.set(0, WALL_H - 0.4, 0);
  root.add(gardenLight);
  for (a = 0; a < ARMS.length; a++) {
    var arm = ARMS[a];
    var d;
    for (d = 14; d <= GARDEN_HALF + CORRIDOR_LEN - 4; d += 12) {
      var light = new THREE.PointLight(0xffe4b0, 0.55, 11, 2);
      light.position.set(arm.fx * d, WALL_H - 0.5, arm.fz * d);
      root.add(light);
    }
  }
  root.add(new THREE.AmbientLight(0xfff2da, 0.3));

  spawnEntities(root);
}

function isInGarden() {
  return (
    Math.abs(fps.player.x) <= GARDEN_HALF - 0.1 &&
    Math.abs(fps.player.z) <= GARDEN_HALF - 0.1
  );
}

function refreshAimPick() {
  if (!camera || isInventoryOpen()) {
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
  // 未对准门、且地图任务待绘制时，提示按 Q 绘制地图。
  if (!data && !isInventoryOpen() && survival && !survival.dead && mapTaskPending()) {
    if (interactHintEl) {
      interactHintEl.hidden = false;
      interactHintEl.innerHTML = "按 <kbd>Q</kbd> 绘制 Level 21 地图";
    }
    if (crosshairEl) {
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", false);
      crosshairEl.classList.toggle("backrooms-crosshair--interact", true);
    }
    return;
  }
  var hidden = isInventoryOpen() || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      var slot = doorSlots[data.slot];
      if (slot && slot.door) {
        interactHintEl.innerHTML = slot.door.rust
          ? "一扇锈蚀严重的门 · 按 <kbd>Q</kbd> 打开"
          : "写着 " + slot.door.num + " 的门 · 按 <kbd>Q</kbd> 打开";
      } else {
        interactHintEl.innerHTML = "一扇无字的门 · 无法打开";
      }
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function exitThroughDoor(entry) {
  if (transitionLock) return;
  transitionLock = true;
  showToast("门后透出光——你走了进去…");
  saveBackroomsSurvival(survival);
  if (entry.pass) grantLevelPass(entry.pass, fps.yaw);
  queueEnterLevelNumber(entry.level);
  window.setTimeout(function () {
    window.location.href = entry.page;
  }, 500);
}

function mapTaskPending() {
  return (
    isTaskAccepted("map_l21") &&
    !isTaskDelivered("map_l21") &&
    !isTaskCompleted("map_l21")
  );
}

function tryDrawMap() {
  if (isTaskCompleted("map_l21")) {
    showToast("地图任务已经完成了。");
    return;
  }
  if (!isTaskAccepted("map_l21")) return;
  if (isTaskDelivered("map_l21")) {
    showToast("地图已经绘制好了，回 Level 4 交付。");
    return;
  }
  var r = deliverMapTask("map_l21");
  if (r.ok) {
    showToast("你绘制好了 Level 21 的地图 · 回 Level 4 交付领取 30 积分");
  } else {
    showToast(r.reason || "无法绘制地图");
  }
}

function tryQAction() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "l21_door") {
    var slot = doorSlots[data.slot];
    if (!slot) return;
    if (slot.door) {
      exitThroughDoor(slot.door);
    } else {
      showToast("这扇门打不开。");
    }
    return;
  }
  // 不在门前：若已接取「绘制 Level 21 地图」任务，则绘制地图。
  tryDrawMap();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
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
  if (!enforceLevelEntry("l21", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l21", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfc8b0);
  scene.fog = new THREE.Fog(0xbfc8b0, 14, 46);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel21";
  scene.add(root);
  buildWorld(root);

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
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 21 };
  });
  initBackroomsTemperature(21, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 21 · <kbd>Q</kbd> 开门 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
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
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock && !isTaskUiOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 14);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);

    // 实体不进花园、不攻击花园里的人
    var safe = isInGarden() || transitionLock;
    if (moths) moths.update(dt, fps.player.x, fps.player.z, survival, showToast, { playerSafe: safe });
    if (clumps) clumps.update(dt, fps.player.x, fps.player.z, survival, showToast, { playerSafe: safe });

    refreshAimPick();
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
  console.error("[Backrooms L21]", err);
  showError(err.message || String(err));
}

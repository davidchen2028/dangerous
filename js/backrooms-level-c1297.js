/**
 * Backrooms Level C-1297 — 无界之痿（死区）
 * 无限延伸的老旧多层公寓：墙体发霉鼓包、缓慢「呼吸」，黄褐色腐蚀脓液渗流。
 * 布局持续改动，极易迷路。致命来自腐蚀脓液与腐败精神侵蚀；无原生实体。
 * 唯一出路：公寓深处一间干燥封闭小房间 → 交互回 Level 4。
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
  addItem,
  removeFirstItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  damageCarriedTaskItems,
} from "./backrooms-tasks.js";
import { getLuck } from "./backrooms-luck.js";
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
const CORRIDOR_W = 3.4;
const ROOM_D = 5.2;
const SEG_LEN = 8;
const SEG_COUNT = 9;
/** 腐败侵蚀从 0→1 的基础秒数（约 2.5 分钟） */
const ROT_SECONDS = 150;
/** 轻度 / 重度流血每秒掉血 */
const BLEED_LIGHT_DPS = 1.1;
const BLEED_HEAVY_DPS = 3.4;
/** 踩进脓液的瞬时灼伤 */
const PUS_BURN = 8;

const MEG_RECORD =
  "外勤记录 C-1297-03\n\n" +
  "整栋楼在缓慢蠕动变形，房间随时会消失。黄褐色粘液有强腐蚀性，一旦沾上立刻会造成严重灼伤。" +
  "耳边的低语全是幻觉，不要停下来寻找声音来源，停留越久，精神受到的损伤就越重。";

const colliders = [];
/** @type {{ x: number, z: number, r: number, mesh: THREE.Mesh }[]} */
const pusPools = [];
/** @type {THREE.Mesh[]} */
const breathMeshes = [];
/** @type {THREE.PointLight[]} */
const flickerLights = [];
/** @type {{ mesh: THREE.Object3D, kind: string, x: number, z: number }[]} */
const interactables = [];

const fps = createBackroomsFpsState({
  player: { x: 0, z: 2, radius: 0.34, speed: 3.2 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const rotFillEl = document.getElementById("backroomsRotFill");
const rotValueEl = document.getElementById("backroomsRotValue");
const bleedStatusEl = document.getElementById("backroomsBleedStatus");
const fxCanvas = document.getElementById("backroomsRotFx");

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let worldRoot = null;
let transitionLock = false;
let elapsed = 0;
/** 腐败侵蚀 0..1 */
let rot = 0;
let stage30 = false;
let stage60 = false;
/** 0 无 / 1 轻度 / 2 重度 */
let bleed = 0;
let inPus = false;
let slipUntil = 0;
let nextLayoutAt = 18;
let nextBlackoutAt = 8;
let blackoutUntil = 0;
let nextWhisperAt = 12;
let nextHallucAt = 0;
let hallUntil = 0;
let nextItemCheckAt = 5;
let readNote = false;
let aimKind = "";
/** 可开关的侧房门洞墙段（布局畸变用） */
let shiftWalls = [];

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0x6e5a42, roughness: 0.96 }),
  mold: new THREE.MeshStandardMaterial({ color: 0x4a5a38, roughness: 1 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x3d3428, roughness: 1 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0x5a4e3c, roughness: 0.95 }),
  pus: new THREE.MeshStandardMaterial({
    color: 0xb8892a,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  }),
  furniture: new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 0.98 }),
  exitWall: new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.82 }),
  exitFloor: new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.9 }),
  note: new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }),
  bandage: new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.65 }),
  door: new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.85 }),
};

function showToast(text, durationMs) {
  showBackroomsLootToast(text, { durationMs: durationMs || 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1297 无法启动</strong></p><p>" + String(text) + "</p>";
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
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

function seeded(i, s) {
  var n = Math.sin(i * 97.1 + s * 211.7) * 43758.5453;
  return n - Math.floor(n);
}

function addPusPool(root, x, z, r) {
  var mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 14), materials.pus);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.04, z);
  root.add(mesh);
  pusPools.push({ x: x, z: z, r: r, mesh: mesh });
}

function addBreathBulge(root, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materials.mold);
  mesh.position.set(x, y, z);
  mesh.userData.baseScale = { x: 1, y: 1, z: 1 };
  mesh.userData.phase = Math.random() * Math.PI * 2;
  root.add(mesh);
  breathMeshes.push(mesh);
  return mesh;
}

function addFlickerLamp(root, x, z) {
  var fixture = addBox(root, 1.4, 0.08, 0.28, x, WALL_H - 0.15, z, materials.furniture, false);
  var light = new THREE.PointLight(0xffd080, 0.85, 14, 2);
  light.position.set(x, WALL_H - 0.35, z);
  root.add(light);
  flickerLights.push(light);
  fixture.userData.lamp = light;
}

function addSideRoom(root, side, segIndex, openDoor) {
  var z0 = segIndex * SEG_LEN;
  var zMid = z0 + SEG_LEN * 0.5;
  var xSign = side;
  var roomX = xSign * (CORRIDOR_W * 0.5 + ROOM_D * 0.5);
  var floorW = ROOM_D;
  var floorD = SEG_LEN - 0.4;

  addBox(root, floorW, 0.12, floorD, roomX, -0.06, zMid, materials.floor, false);
  addBox(root, floorW, 0.1, floorD, roomX, WALL_H + 0.05, zMid, materials.ceil, false);
  // 外侧 / 前后墙
  addBox(root, 0.28, WALL_H, floorD, roomX + xSign * (ROOM_D * 0.5), WALL_H * 0.5, zMid, materials.wall, true);
  addBox(root, floorW, WALL_H, 0.28, roomX, WALL_H * 0.5, z0 + 0.2, materials.wall, true);
  addBox(root, floorW, WALL_H, 0.28, roomX, WALL_H * 0.5, z0 + SEG_LEN - 0.2, materials.wall, true);

  // 走廊侧墙：门洞或封死（可被布局畸变切换）
  var doorW = 1.5;
  var wallX = xSign * (CORRIDOR_W * 0.5);
  var half = (SEG_LEN - doorW) * 0.5;
  var leftZ = zMid - doorW * 0.5 - half * 0.5;
  var rightZ = zMid + doorW * 0.5 + half * 0.5;
  addBox(root, 0.28, WALL_H, half, wallX, WALL_H * 0.5, leftZ, materials.wall, true);
  addBox(root, 0.28, WALL_H, half, wallX, WALL_H * 0.5, rightZ, materials.wall, true);
  // 门楣
  addBox(root, 0.28, WALL_H - 2.2, doorW, wallX, WALL_H - (WALL_H - 2.2) * 0.5, zMid, materials.wall, false);

  var plug = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, doorW), materials.door);
  plug.position.set(wallX, 1.1, zMid);
  plug.visible = !openDoor;
  root.add(plug);
  var plugCollider = null;
  if (!openDoor) {
    plugCollider = wallCollider(
      wallX - 0.16,
      wallX + 0.16,
      zMid - doorW * 0.5,
      zMid + doorW * 0.5
    );
    colliders.push(plugCollider);
  }
  shiftWalls.push({
    mesh: plug,
    collider: plugCollider,
    open: openDoor,
    wallX: wallX,
    zMid: zMid,
    doorW: doorW,
  });

  // 鼓包与家具
  addBreathBulge(root, roomX + xSign * 1.2, 1.4, zMid - 1.2, 0.7, 1.1, 0.5);
  if (seeded(segIndex, side + 3) > 0.4) {
    addBox(root, 1.4, 0.7, 0.7, roomX - xSign * 0.8, 0.35, zMid + 1.3, materials.furniture, true);
  }
  if (seeded(segIndex, side + 7) > 0.55) {
    addPusPool(root, roomX, zMid + (seeded(segIndex, 9) - 0.5) * 2, 0.7 + seeded(segIndex, 10) * 0.5);
  }
}

function buildApartment() {
  worldRoot = new THREE.Group();
  worldRoot.name = "BackroomsC1297";
  scene.add(worldRoot);

  var totalZ = SEG_COUNT * SEG_LEN;
  // 走廊地面 / 天花
  addBox(worldRoot, CORRIDOR_W, 0.14, totalZ + 2, 0, -0.07, totalZ * 0.5, materials.floor, false);
  addBox(worldRoot, CORRIDOR_W, 0.1, totalZ + 2, 0, WALL_H + 0.05, totalZ * 0.5, materials.ceil, false);
  // 起点封墙
  addBox(worldRoot, CORRIDOR_W + 0.4, WALL_H, 0.3, 0, WALL_H * 0.5, -0.2, materials.wall, true);

  var i;
  for (i = 0; i < SEG_COUNT; i++) {
    var z0 = i * SEG_LEN;
    var zMid = z0 + SEG_LEN * 0.5;
    // 走廊两侧墙由侧房门洞组成；走廊缝隙补墙
    addSideRoom(worldRoot, -1, i, seeded(i, 1) > 0.35);
    addSideRoom(worldRoot, 1, i, seeded(i, 2) > 0.4);
    addFlickerLamp(worldRoot, 0, zMid);
    addBreathBulge(worldRoot, -CORRIDOR_W * 0.45, 1.6, zMid - 2, 0.35, 0.9, 0.55);
    addBreathBulge(worldRoot, CORRIDOR_W * 0.45, 1.9, zMid + 1.5, 0.4, 1.0, 0.5);
    // 走廊地面脓液
    if (i > 0 && seeded(i, 4) > 0.35) {
      addPusPool(
        worldRoot,
        (seeded(i, 5) - 0.5) * 1.6,
        zMid + (seeded(i, 6) - 0.5) * 2.5,
        0.55 + seeded(i, 7) * 0.55
      );
    }
  }

  // —— 撤离房间（走廊尽头，干净干燥）——
  var exitZ = totalZ + 3;
  var exitW = 5.2;
  var exitD = 5.5;
  addBox(worldRoot, exitW, 0.14, exitD, 0, -0.07, exitZ, materials.exitFloor, false);
  addBox(worldRoot, exitW, 0.1, exitD, 0, WALL_H + 0.05, exitZ, materials.exitWall, false);
  addBox(worldRoot, 0.28, WALL_H, exitD, -exitW * 0.5, WALL_H * 0.5, exitZ, materials.exitWall, true);
  addBox(worldRoot, 0.28, WALL_H, exitD, exitW * 0.5, WALL_H * 0.5, exitZ, materials.exitWall, true);
  addBox(worldRoot, exitW, WALL_H, 0.28, 0, WALL_H * 0.5, exitZ + exitD * 0.5, materials.exitWall, true);
  // 入口门洞两侧
  var gap = 1.6;
  var wing = (exitW - gap) * 0.5;
  addBox(worldRoot, wing, WALL_H, 0.28, -exitW * 0.5 + wing * 0.5, WALL_H * 0.5, exitZ - exitD * 0.5, materials.exitWall, true);
  addBox(worldRoot, wing, WALL_H, 0.28, exitW * 0.5 - wing * 0.5, WALL_H * 0.5, exitZ - exitD * 0.5, materials.exitWall, true);
  // 走廊→撤离房连接段墙
  addBox(worldRoot, 0.28, WALL_H, 2.2, -CORRIDOR_W * 0.5, WALL_H * 0.5, totalZ + 0.8, materials.wall, true);
  addBox(worldRoot, 0.28, WALL_H, 2.2, CORRIDOR_W * 0.5, WALL_H * 0.5, totalZ + 0.8, materials.wall, true);

  var exitLight = new THREE.PointLight(0xfff2d8, 1.1, 12, 2);
  exitLight.position.set(0, WALL_H - 0.4, exitZ);
  worldRoot.add(exitLight);

  // 撤离交互体
  var exitPad = addBox(worldRoot, 1.4, 0.08, 1.4, 0, 0.05, exitZ + 0.6, materials.exitFloor, false);
  interactables.push({ mesh: exitPad, kind: "exit", x: 0, z: exitZ + 0.6 });

  // MEG 外勤记录 + 绷带（中段房间附近）
  var note = addBox(worldRoot, 0.45, 0.6, 0.04, -1.1, 1.35, SEG_LEN * 2.3, materials.note, false);
  interactables.push({ mesh: note, kind: "note", x: -1.1, z: SEG_LEN * 2.3 });
  var bandageA = addBox(worldRoot, 0.35, 0.12, 0.25, 1.0, 0.12, SEG_LEN * 3.5, materials.bandage, false);
  interactables.push({ mesh: bandageA, kind: "bandage", x: 1.0, z: SEG_LEN * 3.5 });
  var bandageB = addBox(worldRoot, 0.35, 0.12, 0.25, -0.8, 0.12, SEG_LEN * 6.2, materials.bandage, false);
  interactables.push({ mesh: bandageB, kind: "bandage", x: -0.8, z: SEG_LEN * 6.2 });

  worldRoot.add(new THREE.HemisphereLight(0xc9a878, 0x2a2018, 0.45));
  worldRoot.add(new THREE.AmbientLight(0x6a5538, 0.35));
}

/* ------------------------------ 豆奶联动 ------------------------------ */

function luckRotMul() {
  var luck = getLuck();
  if (luck <= -30) return 1.28;
  if (luck >= 30) return 0.84;
  return 1;
}

function luckSlipChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 0.22;
  return 0.35;
}

function luckHeavyBleedChance() {
  // 灼伤升级为重度流血的概率
  var luck = getLuck();
  if (luck <= -30) return 0.92;
  if (luck >= 30) return 0.55;
  return 0.75;
}

function luckBreakChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.55;
  if (luck >= 30) return 0.25;
  return 0.38;
}

/* ------------------------------ 腐败 / 流血 / 脓液 ------------------------------ */

function refreshRotUi() {
  var pct = Math.round(rot * 100);
  if (rotFillEl) rotFillEl.style.width = pct + "%";
  if (rotValueEl) rotValueEl.textContent = pct + "%";
}

function refreshBleedUi() {
  if (!bleedStatusEl) return;
  if (bleed <= 0) {
    bleedStatusEl.hidden = true;
    return;
  }
  bleedStatusEl.hidden = false;
  bleedStatusEl.textContent =
    bleed >= 2
      ? "重度流血中 · 使用绷带止血（腐败侵蚀不会因此清除）"
      : "轻度流血中 · 使用绷带止血";
}

function setBleed(level) {
  if (level > bleed) bleed = level;
  refreshBleedUi();
}

function stopBleed() {
  if (bleed <= 0) {
    showToast("伤口已经止住了。");
    return false;
  }
  bleed = 0;
  refreshBleedUi();
  showToast("绷带包扎完毕，出血止住了。腐败侵蚀仍在继续。", 3600);
  return true;
}

function useBandageFromInventory() {
  if (!survival || survival.dead) return;
  if (bleed <= 0) {
    showToast("现在没有需要包扎的伤口。");
    return;
  }
  if (!removeFirstItem("bandage")) {
    showToast("没有绷带。");
    return;
  }
  stopBleed();
  survival.refreshHud();
}

function puddleAt(x, z) {
  for (var i = 0; i < pusPools.length; i++) {
    var p = pusPools[i];
    var dx = x - p.x;
    var dz = z - p.z;
    if (dx * dx + dz * dz <= p.r * p.r) return p;
  }
  return null;
}

function updatePusContact(dt, moving) {
  if (!survival || survival.dead) return;
  var hit = puddleAt(fps.player.x, fps.player.z);
  if (!hit) {
    inPus = false;
    return;
  }
  // 初次踩入：灼伤 + 可能重度流血 + 任务道具损毁
  if (!inPus) {
    inPus = true;
    survival.takeDamage(PUS_BURN);
    showToast("黄褐色脓液灼伤皮肤！", 2600);
    if (Math.random() < luckHeavyBleedChance()) {
      setBleed(2);
      showToast("灼伤恶化为重度流血！", 2800);
    } else {
      setBleed(1);
    }
    var failed = damageCarriedTaskItems(luckBreakChance(), showToast);
    if (failed.length) {
      showToast("采样设备泡进脓液，任务失败！", 4000);
    }
  } else {
    // 持续浸泡：额外腐蚀
    survival.takeDamage(2.2 * dt);
  }

  // 打滑：移动时有概率摔倒 → 轻度流血
  if (moving && performance.now() > slipUntil && Math.random() < luckSlipChance() * dt * 1.8) {
    slipUntil = performance.now() + 900;
    showToast("粘液打滑，你摔倒了！", 2200);
    survival.takeDamage(4);
    setBleed(1);
  }
}

function updateBleed(dt) {
  if (!survival || survival.dead || bleed <= 0) return;
  var dps = bleed >= 2 ? BLEED_HEAVY_DPS : BLEED_LIGHT_DPS;
  survival.takeDamage(dps * dt);
}

function updateRot(dt) {
  if (!survival || survival.dead) return;
  rot = Math.min(1, rot + (dt / ROT_SECONDS) * luckRotMul());
  refreshRotUi();
  survival.sanity = Math.max(1, survival.sanity - (0.15 + rot * 0.55) * dt);

  if (!stage30 && rot >= 0.3) {
    stage30 = true;
    showToast("建筑的腐败正在影响你的感官", 3400);
  }
  if (!stage60 && rot >= 0.6) {
    stage60 = true;
    showToast("短暂幻觉闪过——耳边响起模糊杂音", 3600);
  }
  if (rot >= 1) {
    showToast("精神被这座腐烂公寓彻底瓦解。", 3200);
    survival.triggerDeath("c1297_corruption");
  }
}

/* ------------------------------ 布局畸变 / 灯光 / 幻觉 ------------------------------ */

function shiftLayout() {
  if (!shiftWalls.length) return;
  var picks = 1 + Math.floor(Math.random() * 2);
  for (var n = 0; n < picks; n++) {
    var w = shiftWalls[Math.floor(Math.random() * shiftWalls.length)];
    w.open = !w.open;
    w.mesh.visible = !w.open;
    // 同步碰撞：开门去掉 collider，关门加回
    var idx = colliders.indexOf(w.collider);
    if (w.open) {
      if (idx >= 0) colliders.splice(idx, 1);
      w.collider = null;
    } else {
      if (!w.collider) {
        w.collider = wallCollider(
          w.wallX - 0.16,
          w.wallX + 0.16,
          w.zMid - w.doorW * 0.5,
          w.zMid + w.doorW * 0.5
        );
      }
      if (colliders.indexOf(w.collider) < 0) colliders.push(w.collider);
    }
  }
  var msgs = [
    "走廊忽然拉长了一截……",
    "刚刚走过的房门消失了。",
    "新的门洞凭空裂开。",
    "墙壁缓慢地挪了位置。",
  ];
  showToast(msgs[Math.floor(Math.random() * msgs.length)], 2600);
}

function updateBreath(dt) {
  for (var i = 0; i < breathMeshes.length; i++) {
    var m = breathMeshes[i];
    var s = 1 + Math.sin(elapsed * 0.7 + m.userData.phase) * 0.08;
    m.scale.set(s, 1 + Math.sin(elapsed * 0.55 + m.userData.phase) * 0.06, s);
  }
  // 脓液缓慢「流淌」感：轻微位移
  for (i = 0; i < pusPools.length; i++) {
    var p = pusPools[i];
    p.mesh.position.x = p.x + Math.sin(elapsed * 0.4 + i) * 0.04;
    p.mesh.position.z = p.z + Math.cos(elapsed * 0.35 + i) * 0.04;
  }
}

function updateLights(now) {
  var black = now < blackoutUntil;
  for (var i = 0; i < flickerLights.length; i++) {
    var L = flickerLights[i];
    if (black) {
      L.intensity = 0;
      continue;
    }
    var flicker = 0.55 + Math.sin(elapsed * 11 + i * 1.7) * 0.2 + (Math.random() - 0.5) * 0.25;
    L.intensity = Math.max(0.15, flicker);
  }
  if (!black && elapsed > nextBlackoutAt) {
    nextBlackoutAt = elapsed + 6 + Math.random() * 10;
    blackoutUntil = now + 400 + Math.random() * 900;
  }
}

function updateHallucinations() {
  if (!survival || survival.dead || rot < 0.55) return;
  if (elapsed > nextWhisperAt) {
    nextWhisperAt = elapsed + 8 + Math.random() * 10;
    var whispers = [
      "……远处有人在呻吟……",
      "模糊的低语从墙后传来，却找不到声源。",
      "你感觉自己的皮肤也在跟着墙体一起鼓胀。",
      "墙角似乎闪过一个人影——再看却什么都没有。",
    ];
    showToast(whispers[Math.floor(Math.random() * whispers.length)], 3000);
  }
  if (elapsed > nextHallucAt) {
    nextHallucAt = elapsed + 5 + Math.random() * 7;
    hallUntil = performance.now() + 350 + Math.random() * 500;
  }
}

function drawOverlay(now) {
  if (!fxCanvas) return;
  var ctx = fxCanvas.getContext("2d");
  var w = fxCanvas.width;
  var h = fxCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // 黄昏暗色 + 边缘泛黄（30%+）
  if (rot > 0.08) {
    var edge = 0.1 + rot * 0.55;
    var g = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.2, w * 0.5, h * 0.5, h * 0.78);
    g.addColorStop(0, "rgba(180,120,40,0)");
    g.addColorStop(1, "rgba(90,50,10," + Math.min(0.7, edge) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 30%：屏幕边缘轻微模糊感（用半透明条模拟）
  if (rot >= 0.3) {
    ctx.fillStyle = "rgba(160,120,40," + (0.08 + (rot - 0.3) * 0.2) + ")";
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
  }

  // 60%+：短暂幻觉闪影
  if (now < hallUntil) {
    ctx.fillStyle = "rgba(20,12,8,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(40,30,20,0.7)";
    var sx = w * (0.2 + Math.random() * 0.5);
    ctx.fillRect(sx, h * 0.25, 18, h * 0.55);
  }

  // 黑屏瞬间
  if (now < blackoutUntil) {
    ctx.fillStyle = "rgba(0,0,0,0.92)";
    ctx.fillRect(0, 0, w, h);
  }
}

/* ------------------------------ 交互 ------------------------------ */

function refreshAim() {
  aimKind = "";
  if (!survival || survival.dead || transitionLock) return;
  var best = 2.2 * 2.2;
  for (var i = 0; i < interactables.length; i++) {
    var it = interactables[i];
    if (it.kind === "bandage" && it.taken) continue;
    if (it.kind === "note" && readNote) continue;
    var dx = it.x - fps.player.x;
    var dz = it.z - fps.player.z;
    var d2 = dx * dx + dz * dz;
    if (d2 <= best) {
      best = d2;
      aimKind = it.kind;
    }
  }
}

function updateInteractUi() {
  if (!interactHintEl) return;
  if (!aimKind || transitionLock) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.hidden = false;
  if (aimKind === "exit") {
    interactHintEl.innerHTML = "干燥的封闭小房间 · 按 <kbd>Q</kbd> 撤离至 Level 4";
  } else if (aimKind === "note") {
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 阅读 M.E.G. 外勤记录";
  } else if (aimKind === "bandage") {
    interactHintEl.innerHTML = "按 <kbd>Q</kbd> 拾取绷带";
  }
}

function tryInteract() {
  if (!aimKind || transitionLock || !survival || survival.dead) return;
  if (aimKind === "exit") {
    leaveToL4();
    return;
  }
  if (aimKind === "note") {
    readNote = true;
    showToast(MEG_RECORD, 8000);
    return;
  }
  if (aimKind === "bandage") {
    for (var i = 0; i < interactables.length; i++) {
      var it = interactables[i];
      if (it.kind !== "bandage" || it.taken) continue;
      var dx = it.x - fps.player.x;
      var dz = it.z - fps.player.z;
      if (dx * dx + dz * dz > 2.2 * 2.2) continue;
      if (!addItem({ id: "bandage", name: "绷带" })) {
        showToast("背包已满");
        return;
      }
      it.taken = true;
      it.mesh.visible = false;
      showToast("拾取了绷带 · 可用于止血");
      return;
    }
  }
}

function leaveToL4() {
  if (transitionLock) return;
  transitionLock = true;
  // 撤离清零腐败侵蚀（本层内存状态，离开即丢弃）
  rot = 0;
  showToast("你踏入干燥的小房间——空间撕裂，将你送回 Level 4。", 2800);
  saveBackroomsSurvival(survival);
  grantLevelPass("l4", fps.yaw);
  queueEnterLevelNumber(4);
  window.setTimeout(function () {
    window.location.href = "backrooms-level4.html";
  }, 700);
}

/* ------------------------------ 控制 / 主循环 ------------------------------ */

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
      tryBackroomsJump(fps, 5.8);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryInteract();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("c1297", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1297", showToast);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a140e);
  scene.fog = new THREE.Fog(0x1a140e, 6, 28);
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  buildApartment();

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1297" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水压住了灼痛，却清不掉渗进骨头的腐败。");
    },
  });
  window.__backroomsUseBandage = useBandageFromInventory;

  initBackroomsTemperature("c1297", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  refreshRotUi();
  refreshBleedUi();
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1297 · 无界之痿 · 生存难度 死区 · " +
      "避开黄褐色脓液 · 赶在腐败侵蚀拉满前抵达干燥撤离房";
  }
  bindControls();

  window.setTimeout(function () {
    showToast(
      "⚠️ Level C-1297「无界之痿」死区。整座建筑持续腐烂畸变，渗出腐蚀性黄褐色脓液。" +
        "幻觉会扰乱判断——避开粘液，尽快抵达撤离房间。",
      7000
    );
  }, 600);

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && now > slipUntil;

    if (survival && !survival.dead && !transitionLock) {
      elapsed += dt;
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
      updateRot(dt);
      updatePusContact(dt, moving);
      updateBleed(dt);
      updateBreath(dt);
      updateLights(now);
      updateHallucinations();

      if (elapsed > nextLayoutAt) {
        nextLayoutAt = elapsed + 16 + Math.random() * 14;
        shiftLayout();
      }
      if (elapsed > nextItemCheckAt) {
        nextItemCheckAt = elapsed + 9 + Math.random() * 6;
        if (inPus) {
          damageCarriedTaskItems(luckBreakChance() * 0.6, showToast);
        }
      }
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      survival &&
      !survival.dead &&
      !transitionLock &&
      !isInventoryOpen() &&
      !isTaskUiOpen()
    ) {
      var slipMul = now < slipUntil ? 0.25 : 1;
      var sprintMul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, slipMul * sprintMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 24);
      });
    }

    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    // 镜头轻微扭曲抖动（腐败越高越明显）
    if (rot > 0.15) {
      camera.rotation.z += Math.sin(elapsed * 1.4) * (0.01 + rot * 0.04);
      if (rot >= 0.6) {
        camera.position.x += Math.sin(elapsed * 9) * 0.015;
      }
    }
    refreshAim();
    updateInteractUi();
    drawOverlay(now);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-1297]", err);
  showError(err.message || String(err));
}

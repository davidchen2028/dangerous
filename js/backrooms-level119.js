/**
 * Backrooms Level 119 — 20×20 水滑梯房
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
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
  queueEnterLevelBanner,
} from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered } from "./backrooms-tasks.js";
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
import { createPartygoersAt } from "./backrooms-partygoer.js";

const ROOM = 20;
const HALF = ROOM * 0.5;
const WALL_H = 5.2;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.5;
const SLIDE_DURATION = 20;
/** 滑行管道另建在房间正下方远处，靠远裁剪面天然遮住房间 */
const RIDE_ORIGIN_Y = -300;
const RIDE_RADIUS = 1.7;

const SLIDE_DEFS = [
  {
    id: "blue",
    label: "蓝色滑梯",
    color: 0x2f7fd6,
    side: "n",
    slot: -1,
    outcome: "goto",
    pass: "blue_channel",
    page: "backrooms-blue-channel.html",
    banner: "蓝色通道",
  },
  {
    id: "yellow",
    label: "黄色滑梯",
    color: 0xe0b832,
    side: "n",
    slot: 1,
    outcome: "goto",
    pass: "l0",
    page: "backrooms-level0.html",
    level: 0,
  },
  {
    id: "red",
    label: "红色滑梯",
    color: 0xd63a3a,
    side: "e",
    slot: 0,
    outcome: "red",
  },
  {
    id: "bw",
    label: "黑白相间滑梯",
    color: 0x222222,
    stripe: true,
    side: "s",
    slot: -1,
    outcome: "death",
  },
  {
    id: "white",
    label: "褪色白滑梯",
    color: 0xe8e4d8,
    side: "s",
    slot: 1,
    outcome: "goto",
    pass: "l14",
    page: "backrooms-level14.html",
    level: 14,
  },
  {
    id: "purple",
    label: "紫色滑梯",
    color: 0x7a3db8,
    side: "w",
    slot: 0,
    outcome: "goto",
    pass: "l11",
    page: "backrooms-level11.html",
    level: 11,
  },
];

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");
const slideOverlayEl = document.getElementById("backroomsL119Slide");
const slideTextEl = document.getElementById("backroomsL119SlideText");

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.1 },
});
const colliders = [];
const interactRoots = [];
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let worldRoot = null;
let partygoers = null;
let currentAimPick = null;
let transitionLock = false;
let sliding = false;
let slideTimer = 0;
let activeSlide = null;
let lastSlideHint = -1;
/** 第一视角滑行管道 */
let rideRoot = null;
let rideCurve = null;
let rideTubeGeo = null;
let rideTubeMat = null;
let rideWaterGeo = null;
let rideWaterMat = null;
let rideScrollTex = null;
let rideLight = null;
let rideBank = 0;
let baseFov = 72;

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

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 119 无法启动</strong></p><p>" + String(text) + "</p>";
}

function makeStripeMaterial(base) {
  var canvas2d = document.createElement("canvas");
  canvas2d.width = 64;
  canvas2d.height = 64;
  var ctx = canvas2d.getContext("2d");
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#efefef";
  var i;
  for (i = 0; i < 8; i++) {
    ctx.fillRect(i * 8, 0, 4, 64);
  }
  var tex = new THREE.CanvasTexture(canvas2d);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: base || 0xffffff,
    roughness: 0.55,
  });
}

function sidePosition(side, slot) {
  var offset = slot * 4.2;
  if (side === "n") return { x: offset, z: -HALF + 0.35, rotY: 0 };
  if (side === "s") return { x: offset, z: HALF - 0.35, rotY: Math.PI };
  if (side === "e") return { x: HALF - 0.35, z: offset, rotY: -Math.PI * 0.5 };
  return { x: -HALF + 0.35, z: offset, rotY: Math.PI * 0.5 };
}

function addSlide(root, def) {
  var pos = sidePosition(def.side, def.slot);
  var mat = def.stripe
    ? makeStripeMaterial()
    : new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.35,
        metalness: 0.08,
        emissive: def.color,
        emissiveIntensity: 0.08,
      });
  var group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = pos.rotY;
  root.add(group);

  // 滑道：从墙高处斜向房间内
  var rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 5.2), mat);
  rail.position.set(0, 2.4, 1.8);
  rail.rotation.x = -0.55;
  group.add(rail);
  var mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.55, 16), mat);
  mouth.rotation.x = Math.PI * 0.5;
  mouth.position.set(0, 3.55, 0.15);
  group.add(mouth);
  var splash = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 18),
    new THREE.MeshStandardMaterial({
      color: 0x7ec8ef,
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      depthWrite: false,
    })
  );
  splash.rotation.x = -Math.PI * 0.5;
  splash.position.set(0, 0.21, 4.1);
  splash.renderOrder = 3;
  group.add(splash);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 3.4, 2.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 2.2, 1.2);
  pick.userData.brInteract = { kind: "l119_slide", slideId: def.id };
  group.add(pick);
  interactRoots.push(pick);
}

function buildWorld(root) {
  var floor = new THREE.MeshStandardMaterial({ color: 0xc8d7e2, roughness: 0.85 });
  var wall = new THREE.MeshStandardMaterial({ color: 0xe7eef5, roughness: 0.9 });
  var ceil = new THREE.MeshStandardMaterial({
    color: 0xf4f8fb,
    emissive: 0xd8e6f2,
    emissiveIntensity: 0.2,
  });
  var pool = new THREE.MeshStandardMaterial({
    color: 0x3d90c4,
    roughness: 0.25,
    metalness: 0.12,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  addBox(root, ROOM, 0.16, ROOM, 0, 0.08, 0, floor, false);
  addBox(root, ROOM, 0.12, ROOM, 0, WALL_H, 0, ceil, false);
  addBox(root, ROOM, WALL_H, 0.35, 0, WALL_H * 0.5, -HALF, wall, true);
  addBox(root, ROOM, WALL_H, 0.35, 0, WALL_H * 0.5, HALF, wall, true);
  addBox(root, 0.35, WALL_H, ROOM, -HALF, WALL_H * 0.5, 0, wall, true);
  addBox(root, 0.35, WALL_H, ROOM, HALF, WALL_H * 0.5, 0, wall, true);
  // 水面单独抬高一层，避免与地板顶面共面导致闪烁
  var water = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), pool);
  water.rotation.x = -Math.PI * 0.5;
  water.position.set(0, 0.2, 0);
  water.renderOrder = 2;
  root.add(water);

  var i;
  for (i = 0; i < SLIDE_DEFS.length; i++) addSlide(root, SLIDE_DEFS[i]);

  root.add(new THREE.HemisphereLight(0xe8f4ff, 0x6a7a88, 1.05));
  var lamp = new THREE.PointLight(0xffffff, 1.1, 28, 2);
  lamp.position.set(0, WALL_H - 0.5, 0);
  root.add(lamp);
}

function findSlide(id) {
  var i;
  for (i = 0; i < SLIDE_DEFS.length; i++) {
    if (SLIDE_DEFS[i].id === id) return SLIDE_DEFS[i];
  }
  return null;
}

function clearPartygoer() {
  if (!partygoers) return;
  partygoers.clear();
  partygoers = null;
}

function spawnRedPartygoer() {
  clearPartygoer();
  if (!worldRoot) return;
  partygoers = createPartygoersAt(
    worldRoot,
    [{ x: 0, z: 2.5, rotY: Math.PI, seed: 119 }],
    { damage: 60, cooldown: 20 }
  );
  showToast("一只派对客跟着你从红色滑梯里出来了…");
}

function exitGoto(slide) {
  if (slide.pass === "l0") {
    grantLevelPass("l0", fps.yaw);
  } else if (slide.pass) {
    grantLevelPass(slide.pass, fps.yaw);
  }
  if (slide.banner) queueEnterLevelBanner(slide.banner);
  else if (slide.level != null) queueEnterLevelNumber(slide.level);
  window.location.href = slide.page;
}

/* ---------------------- 第一视角滑行管道 ---------------------- */

function slideSeed(id) {
  var seed = 0;
  for (var i = 0; i < id.length; i++) seed += id.charCodeAt(i) * (i + 3);
  return seed;
}

function rideRand(seed) {
  var s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 每条滑梯按 id 生成一条固定的螺旋下降管道，形状各不相同 */
function buildRideCurve(def) {
  var seed = slideSeed(def.id);
  var turns = 3 + rideRand(seed) * 1.8;
  var baseR = 11 + rideRand(seed + 5) * 6;
  var drop = 54 + rideRand(seed + 9) * 28;
  var wobble = 2.2 + rideRand(seed + 13) * 2.8;
  var dir = rideRand(seed + 17) > 0.5 ? 1 : -1;
  var pts = [];
  for (var i = 0; i <= 96; i++) {
    var t = i / 96;
    var ang = dir * (t * Math.PI * 2 * turns) + Math.sin(t * 5.3 + seed) * 0.55;
    var r = baseR + Math.sin(t * 7.1 + seed * 0.7) * wobble;
    pts.push(
      new THREE.Vector3(
        Math.cos(ang) * r,
        RIDE_ORIGIN_Y - t * drop + Math.sin(t * 9.4 + seed) * 1.2,
        Math.sin(ang) * r
      )
    );
  }
  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}

/**
 * 沿管道滚动的水纹环带，是速度感的主要来源。
 * TubeGeometry 的 uv.x 沿管道长度、uv.y 绕圆周，所以环带必须画成竖条（沿 u 变化），
 * 再滚动 offset.x 才会呈现向前冲的效果，而不是绕着管壁打转。
 */
function makeRideStreakTexture(seed) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 64);
  for (var i = 0; i < 38; i++) {
    var x = rideRand(seed + i * 3.7) * 256;
    var w = 1 + rideRand(seed + i * 5.1) * 5;
    var a = 0.1 + rideRand(seed + i * 7.3) * 0.32;
    ctx.fillStyle = "rgba(126, 184, 226, " + a.toFixed(3) + ")";
    ctx.fillRect(x, 0, w, 64);
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeRide() {
  if (rideRoot && scene) scene.remove(rideRoot);
  if (rideTubeGeo) rideTubeGeo.dispose();
  if (rideWaterGeo) rideWaterGeo.dispose();
  if (rideTubeMat) rideTubeMat.dispose();
  if (rideWaterMat) rideWaterMat.dispose();
  if (rideScrollTex) rideScrollTex.dispose();
  rideRoot = null;
  rideCurve = null;
  rideTubeGeo = null;
  rideTubeMat = null;
  rideWaterGeo = null;
  rideWaterMat = null;
  rideScrollTex = null;
  rideLight = null;
  rideBank = 0;
}

function buildRide(def) {
  disposeRide();
  if (!scene) return;
  var seed = slideSeed(def.id);
  rideCurve = buildRideCurve(def);
  rideRoot = new THREE.Group();
  rideRoot.name = "L119SlideRide";
  rideScrollTex = makeRideStreakTexture(seed);

  // 管壁：从内侧观察，所以用 BackSide
  rideTubeGeo = new THREE.TubeGeometry(rideCurve, 320, RIDE_RADIUS, 20, false);
  rideTubeMat = new THREE.MeshStandardMaterial({
    color: def.color,
    map: rideScrollTex,
    roughness: 0.3,
    metalness: 0.06,
    emissive: def.color,
    emissiveIntensity: 0.24,
    side: THREE.BackSide,
  });
  rideRoot.add(new THREE.Mesh(rideTubeGeo, rideTubeMat));

  // 贴着管壁的一层水膜，制造湿滑反光
  rideWaterGeo = new THREE.TubeGeometry(rideCurve, 200, RIDE_RADIUS * 0.86, 16, false);
  rideWaterMat = new THREE.MeshStandardMaterial({
    color: 0x8ed2f2,
    map: rideScrollTex,
    transparent: true,
    opacity: 0.3,
    roughness: 0.1,
    metalness: 0.22,
    side: THREE.BackSide,
    depthWrite: false,
  });
  var water = new THREE.Mesh(rideWaterGeo, rideWaterMat);
  water.renderOrder = 2;
  rideRoot.add(water);

  rideLight = new THREE.PointLight(0xffffff, 1.6, 26, 2);
  rideRoot.add(rideLight);
  rideRoot.add(new THREE.AmbientLight(0xdceefb, 0.55));
  scene.add(rideRoot);
}

function clampBank(v) {
  if (v > 0.78) return 0.78;
  if (v < -0.78) return -0.78;
  return v;
}

function updateRideCamera(dt) {
  if (!rideCurve || !camera) return;
  var t = Math.min(1, slideTimer / SLIDE_DURATION);
  var ahead = Math.min(1, t + 0.014);
  var pos = rideCurve.getPointAt(t);
  var look = rideCurve.getPointAt(ahead);
  // 视点压在管道下半部，像是真的坐在水流上
  var seatDrop = RIDE_RADIUS * 0.45;
  var bobY = Math.sin(slideTimer * 9.1) * 0.06;
  var bobX = Math.sin(slideTimer * 5.7) * 0.09;

  camera.position.set(pos.x + bobX, pos.y - seatDrop + bobY, pos.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(look.x, look.y - seatDrop, look.z);

  // 用相邻切线的水平叉积估算转弯方向，转弯时向内侧倾斜
  var tanA = rideCurve.getTangentAt(t);
  var tanB = rideCurve.getTangentAt(Math.min(1, t + 0.02));
  var cross = tanA.x * tanB.z - tanA.z * tanB.x;
  var targetBank = clampBank(-cross * 30);
  rideBank += (targetBank - rideBank) * Math.min(1, dt * 6);
  camera.rotateZ(rideBank + Math.sin(slideTimer * 7.3) * 0.035);

  // 中段加速时视野拉宽，强化俯冲感
  var rush = 0.55 + 0.45 * Math.sin(t * Math.PI);
  camera.fov = baseFov + 11 * rush;
  camera.updateProjectionMatrix();

  if (rideLight) rideLight.position.set(look.x, look.y, look.z);
  if (rideScrollTex) {
    // offset.x 递增 → 环带向管道起点（身后）掠去，才是前进的方向
    rideScrollTex.offset.x = (rideScrollTex.offset.x + dt * (1.2 + rush * 0.9)) % 1;
  }
}

function finishSlide() {
  if (!activeSlide) return;
  var slide = activeSlide;
  activeSlide = null;
  sliding = false;
  slideTimer = 0;
  if (slideOverlayEl) slideOverlayEl.classList.remove("is-on");
  disposeRide();
  if (camera) {
    // 归还被滑行接管的相机状态：视野、侧倾与欧拉顺序
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    camera.rotation.order = "YXZ";
    camera.rotation.z = 0;
    camera.up.set(0, 1, 0);
  }

  if (slide.outcome === "death") {
    showToast("黑白滑梯尽头只有黑暗…");
    if (survival) survival.triggerDeath("slide");
    transitionLock = false;
    return;
  }
  if (slide.outcome === "red") {
    transitionLock = false;
    fps.player.x = 0;
    fps.player.z = 0;
    fps.feetY = 0;
    spawnRedPartygoer();
    syncHint();
    return;
  }
  if (slide.outcome === "goto") {
    exitGoto(slide);
  }
}

function beginSlide(slide) {
  if (sliding || transitionLock || !survival || survival.dead) return;
  clearPartygoer();
  sliding = true;
  transitionLock = true;
  activeSlide = slide;
  slideTimer = 0;
  lastSlideHint = -1;
  buildRide(slide);
  updateRideCamera(0);
  // 滑行期间主循环不跑 updateInteractUi，交互提示与准星必须在这里主动收掉
  currentAimPick = null;
  if (interactHintEl) interactHintEl.hidden = true;
  if (crosshairEl) {
    crosshairEl.classList.add("backrooms-crosshair--hidden");
    crosshairEl.classList.remove("backrooms-crosshair--interact");
  }
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  if (slideOverlayEl) slideOverlayEl.classList.add("is-on");
  if (slideTextEl) {
    slideTextEl.textContent = "你钻进了" + slide.label + "…";
  }
  showToast("滑梯吞没了你——还要滑行一段时间…");
}

function updateSlide(dt) {
  if (!sliding) return;
  slideTimer += dt;
  var left = Math.max(0, Math.ceil(SLIDE_DURATION - slideTimer));
  if (left !== lastSlideHint) {
    lastSlideHint = left;
    if (slideTextEl) {
      slideTextEl.textContent =
        (activeSlide ? activeSlide.label : "滑梯") + " · 还剩 " + left + " 秒";
    }
    if (hintEl) {
      hintEl.innerHTML =
        "滑行中……还剩 <strong>" + left + "</strong> 秒";
    }
  }
  updateRideCamera(dt);
  if (slideTimer >= SLIDE_DURATION) {
    saveBackroomsSurvival(survival);
    finishSlide();
  }
}

function refreshAimPick() {
  if (!camera || sliding || transitionLock || isInventoryOpen() || !survival || survival.dead) {
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
  var slide = data && data.kind === "l119_slide" ? findSlide(data.slideId) : null;
  var hidden =
    sliding || transitionLock || isInventoryOpen() || !survival || survival.dead || !slide;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML = slide.label + " · 按 <kbd>Q</kbd> 滑下去";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      sliding || isInventoryOpen() || !survival || survival.dead
    );
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function tryQAction() {
  if (sliding || transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (!data || data.kind !== "l119_slide") return;
  var slide = findSlide(data.slideId);
  if (slide) beginSlide(slide);
}

function syncHint() {
  if (!hintEl || sliding) return;
  hintEl.innerHTML =
    "Level 119 · 对准水滑梯按 <kbd>Q</kbd> · <kbd>WASD</kbd> · <kbd>B</kbd>";
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || sliding || transitionLock;
    },
    onJump: function () {
      if (!sliding && !transitionLock) tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat && !sliding) {
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
  if (!enforceLevelEntry("l119", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l119", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9d4e8);
  scene.fog = new THREE.Fog(0xb9d4e8, 10, 36);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 60);
  baseFov = camera.fov;
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  worldRoot = new THREE.Group();
  worldRoot.name = "BackroomsLevel119";
  scene.add(worldRoot);
  buildWorld(worldRoot);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 119 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(119, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  syncHint();
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving && !sliding;

    updateSlide(dt);

    if (survival && !survival.dead && !sliding) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    if (!sliding) {
      updateBackroomsPlayerPhysics(fps, dt, _physOpts);
      if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock) {
        var mul =
          survival && sprinting
            ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
            : 1;
        moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
          return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 14);
        });
      }
      applyBackroomsCamera(fps, camera, EYE_HEIGHT);
      if (partygoers) {
        partygoers.update(dt, fps.player.x, fps.player.z, survival, showToast, {
          playerSafe: false,
        });
      }
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
  console.error("[Backrooms L119]", err);
  showError(err.message || String(err));
}

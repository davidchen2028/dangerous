/**
 * Backrooms Level C-1291 — 井盖迷阵（死区）。
 * 无边界柏油路、随机井盖弹射、虚空井口、蒸汽喷发与心理压迫。
 * 本层没有传统怪物实体。
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
import {
  markLevelEntered,
  handleTaskUiKey,
  isTaskUiOpen,
  isTaskAccepted,
  isTaskDelivered,
  isTaskCompleted,
  recordReconSighting,
  getReconProgress,
  getTaskDeadlineRemainingMs,
} from "./backrooms-tasks.js";
import { getLuck } from "./backrooms-luck.js";
import { playHugeExplosion } from "./backrooms-explosion-sfx.js";
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
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";

const EYE_HEIGHT = 1.65;
const GRID_RADIUS = 6;
const CELL_SIZE = 4.4;
const COVER_RADIUS = 0.78;
const EXIT_USE_DIST = 2.15;
/** 拍摄井盖的距离比跳井更宽松一点，方便远距离记录正在发动的井盖 */
const RECORD_DIST = 3.4;
const LAUNCH_DAMAGE = 70;
const STEAM_DPS = 18;
const VOID_FALL_SECONDS = 0.42;
const RECON_TASK_ID = "recon_c1291";

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.75 },
});
const _survCtx = { sprinting: false, skipPassiveSanity: true };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null, floorY: 0 };

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const taskStatusEl = document.getElementById("backroomsTaskStatus");
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
let asphalt = null;
let transitionLock = false;
let manholes = [];
let nearestCover = null;
let nextHazardAt = 0;
let elapsedLevel = 0;
let voidFallTimer = 0;
let vibration = 0;
let vibrationPhase = 0;
let nextRumbleAt = 0;
let nextHallucinationAt = 40;
let audio = null;

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-1291 无法启动</strong></p><p>" + String(text) + "</p>";
}

/**
 * 幸运联动：倒霉大幅提高井盖弹射 / 蒸汽喷发频率，幸运略微降低。
 * 返回井盖发动间隔的倍率（越小越频繁）。
 */
function hazardIntervalMul() {
  var luck = getLuck();
  if (luck <= -30) return 0.45;
  if (luck >= 30) return 1.3;
  return 1;
}

/** 跳进井盖后前往 Level 6 的概率：倒霉 15%、幸运 60%、常态 30% */
function manholeEscapeChance() {
  var luck = getLuck();
  if (luck <= -30) return 0.15;
  if (luck >= 30) return 0.6;
  return 0.3;
}

function hash2(x, z, salt) {
  var n = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function gridWorld(cellX, cellZ) {
  var jitterX = (hash2(cellX, cellZ, 1) - 0.5) * CELL_SIZE * 0.68;
  var jitterZ = (hash2(cellX, cellZ, 2) - 0.5) * CELL_SIZE * 0.68;
  return {
    x: cellX * CELL_SIZE + jitterX,
    z: cellZ * CELL_SIZE + jitterZ,
  };
}

/* ------------------------------ 井盖 ------------------------------ */

function makeCoverTexture(seed) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#554941";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#241f1c";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  var i;
  for (i = 0; i < 12; i++) {
    var a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 35, 128 + Math.sin(a) * 35);
    ctx.lineTo(128 + Math.cos(a) * 95, 128 + Math.sin(a) * 95);
    ctx.stroke();
  }
  ctx.strokeStyle = "#9b552f";
  ctx.lineWidth = 8;
  ctx.globalAlpha = 0.7;
  for (i = 0; i < 14; i++) {
    var px = 35 + hash2(seed, i, 4) * 186;
    var py = 35 + hash2(seed, i, 5) * 186;
    ctx.beginPath();
    ctx.arc(px, py, 4 + hash2(seed, i, 6) * 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createManhole(root, index) {
  var group = new THREE.Group();
  var rim = new THREE.Mesh(
    new THREE.CylinderGeometry(COVER_RADIUS + 0.12, COVER_RADIUS + 0.12, 0.08, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3e3732,
      roughness: 0.82,
      metalness: 0.72,
    })
  );
  rim.position.y = 0.02;
  group.add(rim);

  var voidDisk = new THREE.Mesh(
    new THREE.CircleGeometry(COVER_RADIUS, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  voidDisk.rotation.x = -Math.PI * 0.5;
  voidDisk.position.y = 0.065;
  voidDisk.visible = false;
  group.add(voidDisk);

  var coverPivot = new THREE.Group();
  coverPivot.position.set(0, 0.08, -COVER_RADIUS);
  group.add(coverPivot);
  var cover = new THREE.Mesh(
    new THREE.CylinderGeometry(COVER_RADIUS, COVER_RADIUS, 0.12, 24),
    new THREE.MeshStandardMaterial({
      map: makeCoverTexture(index + 11),
      color: 0x8a6048,
      roughness: 0.68,
      metalness: 0.78,
    })
  );
  cover.position.z = COVER_RADIUS;
  coverPivot.add(cover);

  var steamMat = new THREE.MeshBasicMaterial({
    color: 0xf2f4f5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  var steam = new THREE.Mesh(new THREE.ConeGeometry(1.45, 4.8, 12, 1, true), steamMat);
  steam.position.y = 2.4;
  steam.visible = false;
  group.add(steam);

  root.add(group);
  return {
    group: group,
    rim: rim,
    coverPivot: coverPivot,
    cover: cover,
    voidDisk: voidDisk,
    steam: steam,
    steamMat: steamMat,
    cellX: 0,
    cellZ: 0,
    state: "idle",
    timer: 0,
    yVelocity: 0,
    slideX: 0,
    slideZ: 0,
    landingHit: false,
    baseX: 0,
    baseZ: 0,
  };
}

function resetManhole(m, cellX, cellZ) {
  var pos = gridWorld(cellX, cellZ);
  m.cellX = cellX;
  m.cellZ = cellZ;
  m.baseX = pos.x;
  m.baseZ = pos.z;
  m.group.position.set(pos.x, 0, pos.z);
  m.group.rotation.y = hash2(cellX, cellZ, 9) * Math.PI * 2;
  m.state = "idle";
  m.timer = 0;
  m.yVelocity = 0;
  m.slideX = 0;
  m.slideZ = 0;
  m.landingHit = false;
  m.coverPivot.position.y = 0.08;
  m.coverPivot.rotation.x = 0;
  m.cover.rotation.set(0, 0, 0);
  m.cover.position.set(0, 0, COVER_RADIUS);
  m.cover.visible = true;
  m.rim.visible = true;
  m.voidDisk.visible = false;
  m.steam.visible = false;
  m.steamMat.opacity = 0;
}

function refreshManholeGrid() {
  var centerX = Math.round(fps.player.x / CELL_SIZE);
  var centerZ = Math.round(fps.player.z / CELL_SIZE);
  var wanted = [];
  var dx;
  var dz;
  for (dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
    for (dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
      wanted.push({ x: centerX + dx, z: centerZ + dz });
    }
  }
  for (var i = 0; i < manholes.length; i++) {
    var target = wanted[i];
    var m = manholes[i];
    if (m.cellX === target.x && m.cellZ === target.z) continue;
    // 正在发动的井盖不瞬移；目标由其他空闲井盖在下一帧补齐。
    if (m.state !== "idle") continue;
    resetManhole(m, target.x, target.z);
  }
}

function distanceToManhole(m) {
  return Math.hypot(fps.player.x - m.group.position.x, fps.player.z - m.group.position.z);
}

function chooseHazardManhole() {
  var candidates = [];
  for (var i = 0; i < manholes.length; i++) {
    var m = manholes[i];
    var d = distanceToManhole(m);
    if (m.state === "idle" && d > 2.3 && d < 34) candidates.push(m);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function triggerLaunch(m) {
  m.state = "launch";
  m.timer = 0;
  m.yVelocity = 17 + Math.random() * 4;
  m.landingHit = false;
  if (Math.random() < 0.38) {
    var a = Math.random() * Math.PI * 2;
    m.slideX = Math.cos(a) * (3 + Math.random() * 4);
    m.slideZ = Math.sin(a) * (3 + Math.random() * 4);
  }
  playMetalImpact(0.55);
}

function triggerVoid(m) {
  m.state = "void";
  m.timer = 0;
  m.voidDisk.visible = true;
}

function triggerSteam(m) {
  m.state = "steam";
  m.timer = 0;
  m.steam.visible = true;
  playSteam();
}

function triggerRandomHazard() {
  var m = chooseHazardManhole();
  if (!m) return;
  var roll = Math.random();
  if (roll < 0.56) triggerLaunch(m);
  else if (roll < 0.78) triggerVoid(m);
  else triggerSteam(m);
}

function updateLaunch(m, dt) {
  m.timer += dt;
  m.yVelocity -= 25 * dt;
  m.coverPivot.position.y += m.yVelocity * dt;
  m.cover.rotation.x += dt * 7;
  m.cover.rotation.z += dt * 5;
  if (m.coverPivot.position.y <= 0.08 && m.yVelocity < 0) {
    m.coverPivot.position.y = 0.08;
    if (!m.landingHit) {
      m.landingHit = true;
      playMetalImpact(1);
      vibration = Math.max(vibration, 0.38);
      if (distanceToManhole(m) < 2.2 && survival && !survival.dead) {
        survival.takeDamage(LAUNCH_DAMAGE);
        showToast("井盖从高空砸落——重击！");
      }
    }
    if (Math.abs(m.slideX) + Math.abs(m.slideZ) > 0.25) {
      m.state = "slide";
      m.timer = 0;
    } else {
      m.state = "settle";
      m.timer = 0;
    }
  }
}

function updateSlide(m, dt) {
  m.timer += dt;
  m.group.position.x += m.slideX * dt;
  m.group.position.z += m.slideZ * dt;
  var drag = Math.max(0, 1 - dt * 1.25);
  m.slideX *= drag;
  m.slideZ *= drag;
  m.cover.rotation.z += dt * 8;
  if (m.timer > 2.8 || Math.abs(m.slideX) + Math.abs(m.slideZ) < 0.18) {
    m.state = "settle";
    m.timer = 0;
  }
}

function updateVoid(m, dt) {
  m.timer += dt;
  var open = m.timer < 4.5;
  var target = open ? -Math.PI * 0.62 : 0;
  m.coverPivot.rotation.x += (target - m.coverPivot.rotation.x) * Math.min(1, dt * 7);
  m.voidDisk.visible = true;
  if (open && distanceToManhole(m) < COVER_RADIUS * 0.82) {
    voidFallTimer += dt;
    if (hintEl) hintEl.textContent = "脚下是没有尽头的漆黑虚空……";
    if (voidFallTimer >= VOID_FALL_SECONDS && survival && !survival.dead) {
      survival.triggerDeath("void");
    }
  }
  if (m.timer >= 5.3) {
    m.state = "settle";
    m.timer = 0;
    m.voidDisk.visible = false;
    m.coverPivot.rotation.x = 0;
  }
}

function updateSteam(m, dt) {
  m.timer += dt;
  var fade = m.timer < 0.35 ? m.timer / 0.35 : Math.max(0, 1 - (m.timer - 2.5) / 0.8);
  m.steamMat.opacity = 0.5 * Math.min(1, fade);
  m.steam.scale.y = 0.75 + Math.sin(m.timer * 18) * 0.12;
  if (m.timer < 3.1 && distanceToManhole(m) < 2.7 && survival && !survival.dead) {
    survival.takeDamage(STEAM_DPS * dt);
  }
  if (m.timer >= 3.3) {
    m.state = "settle";
    m.timer = 0;
    m.steam.visible = false;
    m.steamMat.opacity = 0;
  }
}

function updateManholes(dt) {
  voidFallTimer = Math.max(0, voidFallTimer - dt * 0.45);
  for (var i = 0; i < manholes.length; i++) {
    var m = manholes[i];
    if (m.state === "launch") updateLaunch(m, dt);
    else if (m.state === "slide") updateSlide(m, dt);
    else if (m.state === "void") updateVoid(m, dt);
    else if (m.state === "steam") updateSteam(m, dt);
    else if (m.state === "settle") {
      m.timer += dt;
      if (m.timer > 1.4) resetManhole(m, m.cellX, m.cellZ);
    }
  }
}

/* ------------------------------ 无限世界 ------------------------------ */

function buildWorld(root) {
  asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({
      color: 0x4a4e51,
      roughness: 1,
      metalness: 0,
    })
  );
  asphalt.rotation.x = -Math.PI * 0.5;
  asphalt.position.y = -0.08;
  root.add(asphalt);

  // 沥青斑驳与裂纹会随地面平面一起跟随玩家，仅作远近参照。
  var stainMat = new THREE.MeshBasicMaterial({
    color: 0x323639,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  for (var s = 0; s < 34; s++) {
    var stain = new THREE.Mesh(new THREE.CircleGeometry(1 + hash2(s, 2, 1) * 3, 12), stainMat);
    stain.rotation.x = -Math.PI * 0.5;
    stain.position.set((hash2(s, 3, 2) - 0.5) * 150, -0.06, (hash2(s, 5, 3) - 0.5) * 150);
    asphalt.add(stain);
  }

  for (var i = 0; i < (GRID_RADIUS * 2 + 1) ** 2; i++) {
    manholes.push(createManhole(root, i));
  }
  refreshManholeGrid();

  root.add(new THREE.HemisphereLight(0x818a91, 0x303437, 0.92));
  root.add(new THREE.AmbientLight(0x667078, 0.52));
  var diffuse = new THREE.DirectionalLight(0xaeb6bc, 0.55);
  diffuse.position.set(-20, 34, 12);
  root.add(diffuse);
}

function updateInfiniteGround() {
  if (!asphalt) return;
  asphalt.position.x = Math.round(fps.player.x / 40) * 40;
  asphalt.position.z = Math.round(fps.player.z / 40) * 40;
}

/* ------------------------------ 听觉 ------------------------------ */

function startAudio() {
  if (audio) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.value = 31;
    var gain = ctx.createGain();
    gain.gain.value = 0.018;
    rumble.connect(gain).connect(ctx.destination);
    rumble.start();
    audio = { ctx: ctx, rumble: rumble, rumbleGain: gain };
  } catch (err) {
    audio = null;
  }
}

function playMetalImpact(volume) {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(210 + Math.random() * 90, now);
  osc.frequency.exponentialRampToValueAtTime(48, now + 0.7);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, volume * 0.22), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.92);
}

/** 跳井触发爆炸时的巨响：压过底噪，并把环境轰鸣一起顶上去 */
function playManholeExplosion() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  playHugeExplosion(ctx, { volume: 1.35 });
  vibration = Math.max(vibration, 1.2);
  if (audio.rumbleGain) {
    audio.rumbleGain.gain.cancelScheduledValues(now);
    audio.rumbleGain.gain.setValueAtTime(0.018, now);
    audio.rumbleGain.gain.linearRampToValueAtTime(0.16, now + 0.05);
    audio.rumbleGain.gain.linearRampToValueAtTime(0.018, now + 3);
  }
}

function playSteam() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var length = Math.floor(ctx.sampleRate * 2.5);
  var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  var src = ctx.createBufferSource();
  src.buffer = buffer;
  var hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1400;
  var gain = ctx.createGain();
  var now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
  src.connect(hp).connect(gain).connect(ctx.destination);
  src.start();
}

function updateRumble(dt) {
  nextRumbleAt -= dt;
  if (nextRumbleAt <= 0) {
    nextRumbleAt = 5 + Math.random() * 12;
    vibration = 0.18 + Math.random() * 0.35;
    if (audio && audio.rumbleGain) {
      var now = audio.ctx.currentTime;
      audio.rumbleGain.gain.cancelScheduledValues(now);
      audio.rumbleGain.gain.setValueAtTime(0.018, now);
      audio.rumbleGain.gain.linearRampToValueAtTime(0.07, now + 0.25);
      audio.rumbleGain.gain.linearRampToValueAtTime(0.018, now + 1.6);
    }
  }
  if (vibration > 0) {
    vibration = Math.max(0, vibration - dt * 0.28);
    vibrationPhase += dt * 55;
  }
}

/* ------------------------------ 心理效应 ------------------------------ */

function updateParanoia(dt) {
  if (!survival || survival.dead) return;
  elapsedLevel += dt;
  var distance = Math.hypot(fps.player.x, fps.player.z);
  var pressure = Math.min(3.2, 1 + elapsedLevel / 180 + distance / 260);
  survival.sanity = Math.max(1, survival.sanity - 0.16 * pressure * dt);

  if (elapsedLevel >= nextHallucinationAt) {
    nextHallucinationAt = elapsedLevel + Math.max(5, 18 - pressure * 3) + Math.random() * 10;
    // 幻听：没有井盖发动，也会听到近在耳边的砸落声。
    playMetalImpact(0.5 + pressure * 0.08);
    if (Math.random() < 0.35) showToast("耳边响起井盖砸落的巨响……但周围什么也没有。");
  }
}

/* ------------------------------ Q 井盖结局 ------------------------------ */

function findNearestIdleCover() {
  var best = null;
  var bestD = Infinity;
  for (var i = 0; i < manholes.length; i++) {
    var m = manholes[i];
    if (m.state !== "idle") continue;
    var d = distanceToManhole(m);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return bestD <= EXIT_USE_DIST ? best : null;
}

function updateInteractUi() {
  nearestCover = findNearestIdleCover();
  var active =
    !!nearestCover &&
    !transitionLock &&
    !isInventoryOpen() &&
    survival &&
    !survival.dead;
  var recordable =
    isReconActive() &&
    !transitionLock &&
    !isInventoryOpen() &&
    survival &&
    !survival.dead &&
    !!findRecordTarget();
  if (interactHintEl) {
    interactHintEl.hidden = !active && !recordable;
    if (active && recordable) {
      interactHintEl.innerHTML =
        "生锈井盖 · 按 <kbd>Q</kbd> 打开并跳下 · 按 <kbd>E</kbd> 拍摄记录";
    } else if (active) {
      interactHintEl.innerHTML = "生锈井盖 · 按 <kbd>Q</kbd> 打开并跳下";
    } else if (recordable) {
      interactHintEl.innerHTML = "井盖现象 · 按 <kbd>E</kbd> 拍摄记录";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", active || recordable);
  }
}

/* --------------------------- 侦查记录（E 拍摄） --------------------------- */

/** 任务状态每帧要读多次，这里按 250ms 缓存一次，避免反复解析 sessionStorage */
let reconCache = null;
let reconCacheAt = 0;

function readReconState(force) {
  var now = performance.now();
  if (!force && reconCache && now - reconCacheAt < 250) return reconCache;
  reconCacheAt = now;
  var accepted = isTaskAccepted(RECON_TASK_ID);
  var completed = isTaskCompleted(RECON_TASK_ID);
  var delivered = isTaskDelivered(RECON_TASK_ID);
  reconCache = {
    accepted: accepted,
    completed: completed,
    delivered: delivered,
    active: accepted && !delivered && !completed,
    progress: accepted && !completed ? getReconProgress(RECON_TASK_ID) : null,
    remainingMs: accepted && !completed ? getTaskDeadlineRemainingMs(RECON_TASK_ID) : null,
  };
  return reconCache;
}

function isReconActive() {
  return readReconState(false).active;
}

/** 找最近的可拍摄井盖（正在发动的优先，因为那才是要记录的现象） */
function findRecordTarget() {
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < manholes.length; i++) {
    var m = manholes[i];
    var d = distanceToManhole(m);
    if (d > RECORD_DIST) continue;
    // 正在弹射 / 虚空敞开 / 喷蒸汽的井盖优先入镜
    var score = m.state === "idle" || m.state === "settle" ? d + 4 : d;
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

function phenomenonLabel(state) {
  if (state === "launch" || state === "slide") return "井盖弹射";
  if (state === "void") return "虚空井口";
  if (state === "steam") return "高温蒸汽";
  return "锈蚀井盖";
}

function tryRecordManhole() {
  if (transitionLock || !survival || survival.dead) return;
  if (isInventoryOpen() || isTaskUiOpen()) return;
  var state = readReconState(true);
  if (!state.active) {
    if (state.delivered && !state.completed) {
      showToast("数据已经采集齐了——立刻撤离，回 Level 4 交付。");
    }
    return;
  }
  var m = findRecordTarget();
  if (!m) {
    showToast("附近没有可以入镜的井盖。");
    return;
  }
  var key = m.cellX + "," + m.cellZ;
  var result = recordReconSighting(RECON_TASK_ID, key);
  if (!result.ok) {
    showToast(result.reason || "记录失败");
    return;
  }
  playShutter();
  if (result.done) {
    showToast(
      "记录完成 " +
        result.count +
        " / " +
        result.target +
        "（" +
        phenomenonLabel(m.state) +
        "）· 数据采集齐了，立刻撤离并回 Level 4 交付！"
    );
  } else {
    showToast(
      "已记录 " +
        result.count +
        " / " +
        result.target +
        "（" +
        phenomenonLabel(m.state) +
        "）"
    );
  }
  readReconState(true);
  updateTaskStatusUi();
}

function playShutter() {
  if (!audio || !audio.ctx) return;
  var ctx = audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1600, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.09);
  var gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

function updateTaskStatusUi() {
  if (!taskStatusEl) return;
  var state = readReconState(false);
  if (!state.accepted || state.completed) {
    taskStatusEl.hidden = true;
    return;
  }
  taskStatusEl.hidden = false;
  if (state.delivered) {
    taskStatusEl.textContent = "侦查记录：数据已采集齐 · 立刻撤离，回 Level 4 交付";
    return;
  }
  var p = state.progress || { count: 0, target: 0 };
  var text = "侦查记录：" + p.count + " / " + p.target + " 处井盖";
  if (state.remainingMs != null) {
    var total = Math.ceil(state.remainingMs / 1000);
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    text += " · 剩余 " + mm + ":" + (ss < 10 ? "0" + ss : String(ss));
  }
  taskStatusEl.textContent = text;
}

function openExitManhole() {
  if (transitionLock || !nearestCover || !survival || survival.dead) return;
  transitionLock = true;
  nearestCover.state = "void";
  nearestCover.timer = 0;
  nearestCover.voidDisk.visible = true;
  nearestCover.coverPivot.rotation.x = -Math.PI * 0.62;
  if (Math.random() < manholeEscapeChance()) {
    showToast("井盖下吹来冰冷的风——你跳了进去。");
    saveBackroomsSurvival(survival);
    grantLevelPass("l6", fps.yaw);
    queueEnterLevelNumber(6);
    window.setTimeout(function () {
      window.location.href = "backrooms-level6.html";
    }, 750);
  } else {
    showToast("井盖下方骤然爆炸！");
    playManholeExplosion();
    // 留出时间让爆轰的冲击波先砸下来，再结算死亡
    window.setTimeout(function () {
      transitionLock = false;
      survival.triggerDeath("manhole_explosion");
    }, 900);
  }
}

/* ------------------------------ 控制与循环 ------------------------------ */

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
      tryBackroomsJump(fps, 6.3);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        updateInteractUi();
        openExitManhole();
        return true;
      }
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        tryRecordManhole();
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
  window.addEventListener("click", startAudio, { once: true });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) startAudio();
  });
}

function init() {
  if (!enforceLevelEntry("c1291", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1291", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x555d63);
  scene.fog = new THREE.FogExp2(0x555d63, 0.018);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 150);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC1291";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1291" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("c1291", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level C-1291 · 井盖迷阵 · 生存难度 死区 · <kbd>Q</kbd> 打开附近井盖 · " +
      "<kbd>E</kbd> 拍摄记录 · <kbd>WASD</kbd> 移动";
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

    var distance = Math.hypot(fps.player.x, fps.player.z);
    // 越深入，井盖发动越频繁：约从 2.8 秒压到 0.5 秒一次。
    if (now >= nextHazardAt && !transitionLock) {
      triggerRandomHazard();
      var depthMul = Math.min(0.82, distance / 420);
      nextHazardAt =
        now +
        Math.max(
          320,
          (1800 + Math.random() * 1800) * (1 - depthMul) * hazardIntervalMul()
        );
    }

    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if ((!survival || !survival.dead) && !isInventoryOpen() && !isTaskUiOpen() && !transitionLock) {
      var mul = survival && sprinting
        ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
        : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return { x: nx, z: nz };
      });
    }

    updateInfiniteGround();
    refreshManholeGrid();
    updateManholes(dt);
    updateRumble(dt);
    updateParanoia(dt);
    updateInteractUi();
    updateTaskStatusUi();
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (camera && vibration > 0) {
      var shake = vibration * 0.035;
      camera.position.x += Math.sin(vibrationPhase) * shake;
      camera.position.y += Math.cos(vibrationPhase * 0.73) * shake * 0.6;
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
  console.error("[Backrooms C-1291]", err);
  showError(err.message || String(err));
}

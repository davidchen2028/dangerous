/**
 * Backrooms Level 46 — 变换的旷野。
 * 黎明、白天、夜晚各持续 5 分钟。黎明温和；白天约 70°C；夜晚约 -30°C。
 * 从出生点任选方向行进约 50 米后重力逐渐降低，并切入 Level 149。
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
  setBackroomsTemperatureZone,
  updateBackroomsTemperature,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
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
const FIELD_HALF = 52;
/** 黎明 → 白天 → 夜晚，每阶段 5 分钟 */
const PHASE_DURATION_MS = 5 * 60 * 1000;
const PHASES = ["dawn", "day", "night"];
const EXTREME_DAMAGE_PER_SEC = 2;
const LOW_GRAVITY_START_DISTANCE = 47;
const L149_TRIGGER_DISTANCE = 50;

const FOREST_SKY = 0x9fc7a6;
const DESERT_SKY = 0xe8cf95;
const NIGHT_SKY = 0x07101c;

/** 通往 Level 4 的办公室门位置（固定，两种形态都在），靠近出生点 */
const OFFICE_DOOR_X = 0;
const OFFICE_DOOR_Z = -16;
const OFFICE_DOOR_USE_DIST = 3;

const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 3.8 },
});
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null, floorY: 0 };

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
let forestGroup = null;
let desertGroup = null;
/** 两套 collider 用独立数组，切换时天然让碰撞空间索引失效重建 */
let forestColliders = [];
let desertColliders = [];
let activeColliders = forestColliders;
let phase = "dawn";
let phaseIndex = 0;
let phaseTimer = 0;
let transitionLock = false;
let lowGravityTimer = 0;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2600 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 46 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seeded(n) {
  var x = Math.sin(n * 91.3 + 47.11) * 24634.6345;
  return x - Math.floor(x);
}

function pushBoundary(list) {
  list.push(wallCollider(-FIELD_HALF - 3, -FIELD_HALF, -FIELD_HALF - 3, FIELD_HALF + 3));
  list.push(wallCollider(FIELD_HALF, FIELD_HALF + 3, -FIELD_HALF - 3, FIELD_HALF + 3));
  list.push(wallCollider(-FIELD_HALF - 3, FIELD_HALF + 3, -FIELD_HALF - 3, -FIELD_HALF));
  list.push(wallCollider(-FIELD_HALF - 3, FIELD_HALF + 3, FIELD_HALF, FIELD_HALF + 3));
}

function buildForest(root) {
  var group = new THREE.Group();
  group.name = "L46Forest";
  var grass = new THREE.MeshStandardMaterial({ color: 0x4b6b39, roughness: 1 });
  var trunk = new THREE.MeshStandardMaterial({ color: 0x5a4130, roughness: 0.95 });
  var leaf = new THREE.MeshStandardMaterial({ color: 0x2f5c30, roughness: 0.9 });
  var bush = new THREE.MeshStandardMaterial({ color: 0x3c6b3a, roughness: 0.95 });

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF * 2, FIELD_HALF * 2), grass);
  floor.rotation.x = -Math.PI * 0.5;
  group.add(floor);

  var trunkGeo = new THREE.CylinderGeometry(0.26, 0.34, 1, 7);
  var leafGeo = new THREE.ConeGeometry(1, 1, 8);
  var bushGeo = new THREE.SphereGeometry(1, 8, 6);
  var i;
  for (i = 0; i < 84; i++) {
    var tx = (seeded(i * 1.9) - 0.5) * FIELD_HALF * 1.86;
    var tz = (seeded(i * 3.1 + 7) - 0.5) * FIELD_HALF * 1.86;
    // 出生点周围留空，避免刚进来就卡在树里。
    if (Math.abs(tx) < 5 && Math.abs(tz) < 5) continue;
    var h = 4.2 + seeded(i * 5.3) * 3.6;
    var t = new THREE.Mesh(trunkGeo, trunk);
    t.scale.y = h;
    t.position.set(tx, h * 0.5, tz);
    group.add(t);
    var crown = new THREE.Mesh(leafGeo, leaf);
    var cr = 1.7 + seeded(i * 7.7) * 1.1;
    crown.scale.set(cr, h * 0.8, cr);
    crown.position.set(tx, h + h * 0.32, tz);
    group.add(crown);
    forestColliders.push(wallCollider(tx - 0.45, tx + 0.45, tz - 0.45, tz + 0.45));
  }
  for (i = 0; i < 40; i++) {
    var b = new THREE.Mesh(bushGeo, bush);
    var bs = 0.7 + seeded(i * 4.3) * 0.7;
    b.scale.set(bs, bs * 0.7, bs);
    b.position.set(
      (seeded(i * 2.7 + 31) - 0.5) * FIELD_HALF * 1.9,
      bs * 0.5,
      (seeded(i * 6.1 + 13) - 0.5) * FIELD_HALF * 1.9
    );
    group.add(b);
  }
  group.add(new THREE.HemisphereLight(0xcfe7c8, 0x2a3a22, 1.1));
  var sun = new THREE.DirectionalLight(0xf3f6d8, 0.95);
  sun.position.set(18, 30, -14);
  group.add(sun);
  pushBoundary(forestColliders);
  root.add(group);
  return group;
}

function buildDesert(root) {
  var group = new THREE.Group();
  group.name = "L46Desert";
  var sand = new THREE.MeshStandardMaterial({ color: 0xd6b473, roughness: 1 });
  var duneMat = new THREE.MeshStandardMaterial({ color: 0xc7a35f, roughness: 1 });
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x9a7f52, roughness: 0.95 });
  var cactusMat = new THREE.MeshStandardMaterial({ color: 0x5c7a3f, roughness: 0.9 });

  var floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_HALF * 2, FIELD_HALF * 2), sand);
  floor.rotation.x = -Math.PI * 0.5;
  group.add(floor);

  var duneGeo = new THREE.SphereGeometry(1, 12, 8);
  var rockGeo = new THREE.DodecahedronGeometry(1, 0);
  var cactusGeo = new THREE.CylinderGeometry(0.45, 0.5, 1, 8);
  var i;
  for (i = 0; i < 30; i++) {
    var dune = new THREE.Mesh(duneGeo, duneMat);
    var dr = 6 + seeded(i * 3.7 + 2) * 9;
    dune.scale.set(dr, 1.4 + seeded(i * 5.9) * 2.2, dr * 0.8);
    dune.position.set(
      (seeded(i * 2.3) - 0.5) * FIELD_HALF * 1.8,
      0,
      (seeded(i * 4.1 + 9) - 0.5) * FIELD_HALF * 1.8
    );
    group.add(dune);
  }
  for (i = 0; i < 26; i++) {
    var rx = (seeded(i * 6.7 + 21) - 0.5) * FIELD_HALF * 1.86;
    var rz = (seeded(i * 8.9 + 5) - 0.5) * FIELD_HALF * 1.86;
    if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
    var rock = new THREE.Mesh(rockGeo, rockMat);
    var rs = 1 + seeded(i * 1.3) * 1.8;
    rock.scale.set(rs, rs * 0.7, rs);
    rock.position.set(rx, rs * 0.35, rz);
    rock.rotation.y = seeded(i * 9.1) * Math.PI;
    group.add(rock);
    desertColliders.push(wallCollider(rx - rs * 0.8, rx + rs * 0.8, rz - rs * 0.8, rz + rs * 0.8));
  }
  for (i = 0; i < 18; i++) {
    var cx = (seeded(i * 5.1 + 41) - 0.5) * FIELD_HALF * 1.8;
    var cz = (seeded(i * 7.3 + 17) - 0.5) * FIELD_HALF * 1.8;
    if (Math.abs(cx) < 5 && Math.abs(cz) < 5) continue;
    var ch = 2.4 + seeded(i * 2.9) * 1.8;
    var cactus = new THREE.Mesh(cactusGeo, cactusMat);
    cactus.scale.y = ch;
    cactus.position.set(cx, ch * 0.5, cz);
    group.add(cactus);
    desertColliders.push(wallCollider(cx - 0.6, cx + 0.6, cz - 0.6, cz + 0.6));
  }
  group.add(new THREE.HemisphereLight(0xfff0cc, 0x8a6a3a, 1.35));
  var sun = new THREE.DirectionalLight(0xfff2c8, 1.5);
  sun.position.set(-12, 36, 16);
  group.add(sun);
  pushBoundary(desertColliders);
  root.add(group);
  return group;
}

function phaseLabel(next) {
  if (next === "day") return "白天";
  if (next === "night") return "夜晚";
  return "黎明";
}

function applyPhase(next, announce) {
  phase = next;
  var isDay = next === "day";
  var isNight = next === "night";
  if (forestGroup) forestGroup.visible = !isDay;
  if (desertGroup) desertGroup.visible = isDay;
  if (forestGroup) {
    forestGroup.traverse(function (child) {
      if (!child.isLight) return;
      if (child.userData.l46BaseIntensity == null) {
        child.userData.l46BaseIntensity = child.intensity;
      }
      child.intensity = child.userData.l46BaseIntensity * (isNight ? 0.12 : 1);
    });
  }
  activeColliders = isDay ? desertColliders : forestColliders;
  var sky = isNight ? NIGHT_SKY : isDay ? DESERT_SKY : FOREST_SKY;
  if (scene) {
    scene.background = new THREE.Color(sky);
    scene.fog = isNight
      ? new THREE.Fog(sky, 10, 62)
      : isDay
        ? new THREE.Fog(sky, 40, 150)
        : new THREE.Fog(sky, 24, 96);
  }
  setBackroomsTemperatureZone("46_" + next);
  if (announce) {
    showToast(
      next === "day"
        ? "白天到来，森林化作沙漠，温度迅速升向 70°C！"
        : next === "night"
          ? "夜幕落下，温度骤降至 -30°C！"
          : "黎明到来，温度恢复到二三十度。"
    );
  }
}

function updatePhaseDamage(dt) {
  if (!survival || survival.dead || (phase !== "day" && phase !== "night")) return;
  survival.takeDamage(EXTREME_DAMAGE_PER_SEC * dt);
}

function exitToLevel149() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("重力几乎消失，你飘向椰树成荫的岛屿…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l149", fps.yaw);
  queueEnterLevelNumber(149);
  window.setTimeout(function () {
    window.location.href = "backrooms-level149.html";
  }, 1200);
}

/** 旷野里一扇突兀的办公室门，两种形态都在，按 Q 前往 Level 4 */
function buildOfficeDoor(root) {
  var frameMat = new THREE.MeshStandardMaterial({ color: 0x3b4a55, roughness: 0.7 });
  var doorMat = new THREE.MeshStandardMaterial({ color: 0x536a7c, roughness: 0.6 });
  var glowMat = new THREE.MeshStandardMaterial({
    color: 0xd4e8f4,
    emissive: 0x6f9ab4,
    emissiveIntensity: 0.6,
    roughness: 0.5,
  });
  var group = new THREE.Group();
  group.position.set(OFFICE_DOOR_X, 0, OFFICE_DOOR_Z);
  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.7, 0.35), frameMat);
  frame.position.y = 1.85;
  group.add(frame);
  var panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 3.15, 0.16), doorMat);
  panel.position.set(0, 1.6, 0.14);
  group.add(panel);
  var lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 0.4), glowMat);
  lintel.position.y = 3.85;
  group.add(lintel);
  var knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8c48a, metalness: 0.6, roughness: 0.4 })
  );
  knob.position.set(0.85, 1.6, 0.24);
  group.add(knob);
  var light = new THREE.PointLight(0xa9d9ff, 1, 8, 2);
  light.position.set(0, 2.6, 1.2);
  group.add(light);
  root.add(group);
  // 门框实体，两种形态共用。
  var doorCol = wallCollider(
    OFFICE_DOOR_X - 1.45,
    OFFICE_DOOR_X + 1.45,
    OFFICE_DOOR_Z - 0.25,
    OFFICE_DOOR_Z + 0.25
  );
  forestColliders.push(doorCol);
  desertColliders.push(doorCol);
}

function isNearOfficeDoor() {
  var dx = fps.player.x - OFFICE_DOOR_X;
  var dz = fps.player.z - OFFICE_DOOR_Z;
  return dx * dx + dz * dz <= OFFICE_DOOR_USE_DIST * OFFICE_DOOR_USE_DIST;
}

function updateDoorUi() {
  var near = isNearOfficeDoor() && !transitionLock && survival && !survival.dead;
  if (interactHintEl) {
    interactHintEl.hidden = !near;
    if (near) interactHintEl.innerHTML = "办公室的门 · 按 <kbd>Q</kbd> 前往 Level 4";
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !!near);
  }
}

function exitToLevel4() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("门后透出日光灯的白光——你走进了 Level 4。");
  saveBackroomsSurvival(survival);
  grantLevelPass("l4", fps.yaw);
  queueEnterLevelNumber(4);
  window.setTimeout(function () {
    window.location.href = "backrooms-level4.html";
  }, 650);
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
      tryBackroomsJump(fps, 6.6);
    },
    onKeyDown: function (event) {
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat && isNearOfficeDoor()) {
        event.preventDefault();
        exitToLevel4();
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
  if (!enforceLevelEntry("l46", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l46", showToast);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 200);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevel46";
  scene.add(root);
  forestGroup = buildForest(root);
  desertGroup = buildDesert(root);
  buildOfficeDoor(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 46 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("46_dawn", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  // 每次进入 Level 46 都从黎明开始。
  applyPhase("dawn", false);
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 46 · 黎明（5分钟后进入白天）· 沿任意方向行进约 50 米 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
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
    phaseTimer += dt * 1000;
    if (phaseTimer >= PHASE_DURATION_MS) {
      phaseTimer -= PHASE_DURATION_MS;
      phaseIndex = (phaseIndex + 1) % PHASES.length;
      applyPhase(PHASES[phaseIndex], true);
      if (hintEl) {
        hintEl.innerHTML =
          "Level 46 · " + phaseLabel(phase) + " · 沿任意方向行进约 50 米 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
      }
    }
    updatePhaseDamage(dt);
    var distanceFromEntry = Math.hypot(fps.player.x, fps.player.z);
    if (distanceFromEntry >= LOW_GRAVITY_START_DISTANCE) {
      var lowProgress = Math.min(
        1,
        (distanceFromEntry - LOW_GRAVITY_START_DISTANCE) /
          (L149_TRIGGER_DISTANCE - LOW_GRAVITY_START_DISTANCE)
      );
      _physOpts.gravity = DEFAULT_GRAVITY * (1 - lowProgress * 0.88);
      if (lowProgress > 0.1 && hintEl) {
        hintEl.innerHTML = "重力正在减弱……继续向前。";
      }
    } else {
      _physOpts.gravity = DEFAULT_GRAVITY;
    }
    if (distanceFromEntry >= L149_TRIGGER_DISTANCE) {
      lowGravityTimer += dt;
      if (lowGravityTimer >= 0.6) exitToLevel149();
    } else {
      lowGravityTimer = 0;
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
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    updateDoorUi();
    updateBackroomsTemperature(dt, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms L46]", err);
  showError(err.message || String(err));
}

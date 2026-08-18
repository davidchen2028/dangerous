/**
 * Backrooms Level 363 — 7×7 淡黄色房间
 * 唯一的一扇门；开门后门外一片漆黑，没有出口。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
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
import { showEnterLevelBannerIfQueued } from "./backrooms-level-enter.js";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
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

const EYE_HEIGHT = 1.65;
const ROOM = 7;
const HALF = ROOM / 2;
const WALL_H = 3.2;
const WALL_T = 0.3;
const DOOR_W = 1.15;
const DOOR_H = 2.25;
const DOOR_Z = -HALF; // 北墙
const DOOR_REACH = 2.2;

const colliders = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: HALF - 1.4, radius: 0.34, speed: 3.4 },
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

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let ceilingLight = null;
let doorMesh = null;
let doorCollider = null;
let doorOpen = false;
let voidGroup = null;

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
    "<p><strong>Level 363 无法启动</strong></p><p>" + String(text) + "</p>";
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

function buildWorld(root) {
  var paleYellow = new THREE.MeshStandardMaterial({
    color: 0xe9dd9c,
    emissive: 0x2a2610,
    emissiveIntensity: 0.14,
    roughness: 0.94,
  });
  var floorMat = new THREE.MeshStandardMaterial({ color: 0xb6a86a, roughness: 0.96 });
  var ceilMat = new THREE.MeshStandardMaterial({ color: 0xdcd08f, roughness: 0.95 });
  var doorMat = new THREE.MeshStandardMaterial({ color: 0x6b5836, roughness: 0.8 });

  addBox(root, ROOM, 0.16, ROOM, 0, -0.08, 0, floorMat, false);
  addBox(root, ROOM, 0.14, ROOM, 0, WALL_H, 0, ceilMat, false);

  // 南墙 / 东墙 / 西墙（实心）
  addBox(root, ROOM + WALL_T * 2, WALL_H, WALL_T, 0, WALL_H * 0.5, HALF, paleYellow, true);
  addBox(root, WALL_T, WALL_H, ROOM, -HALF, WALL_H * 0.5, 0, paleYellow, true);
  addBox(root, WALL_T, WALL_H, ROOM, HALF, WALL_H * 0.5, 0, paleYellow, true);

  // 北墙：中间留门洞，两侧 + 门楣
  var sideW = (ROOM - DOOR_W) * 0.5;
  var sideOff = DOOR_W * 0.5 + sideW * 0.5;
  addBox(root, sideW, WALL_H, WALL_T, -sideOff, WALL_H * 0.5, DOOR_Z, paleYellow, true);
  addBox(root, sideW, WALL_H, WALL_T, sideOff, WALL_H * 0.5, DOOR_Z, paleYellow, true);
  addBox(root, DOOR_W, WALL_H - DOOR_H, WALL_T, 0, DOOR_H + (WALL_H - DOOR_H) * 0.5, DOOR_Z, paleYellow, true);

  // 门扇（关闭时挡住门洞，可开）
  doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.1), doorMat);
  doorMesh.position.set(0, DOOR_H * 0.5, DOOR_Z);
  root.add(doorMesh);
  doorCollider = wallCollider(-DOOR_W * 0.5, DOOR_W * 0.5, DOOR_Z - 0.1, DOOR_Z + 0.1);
  colliders.push(doorCollider);

  // 门外：漆黑的虚空（可走进去，但没有出口）
  voidGroup = new THREE.Group();
  voidGroup.visible = false;
  var voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  var vDepth = 16;
  var vHalf = 6;
  // 黑色地板 + 三面黑墙，包住门外区域
  var vFloor = new THREE.Mesh(new THREE.PlaneGeometry(vHalf * 2, vDepth), voidMat);
  vFloor.rotation.x = -Math.PI * 0.5;
  vFloor.position.set(0, 0.001, DOOR_Z - vDepth * 0.5);
  voidGroup.add(vFloor);
  var vBack = new THREE.Mesh(new THREE.PlaneGeometry(vHalf * 2, WALL_H * 2), voidMat);
  vBack.position.set(0, WALL_H, DOOR_Z - vDepth);
  voidGroup.add(vBack);
  var vLeft = new THREE.Mesh(new THREE.PlaneGeometry(vDepth, WALL_H * 2), voidMat);
  vLeft.rotation.y = Math.PI * 0.5;
  vLeft.position.set(-vHalf, WALL_H, DOOR_Z - vDepth * 0.5);
  voidGroup.add(vLeft);
  var vRight = new THREE.Mesh(new THREE.PlaneGeometry(vDepth, WALL_H * 2), voidMat);
  vRight.rotation.y = -Math.PI * 0.5;
  vRight.position.set(vHalf, WALL_H, DOOR_Z - vDepth * 0.5);
  voidGroup.add(vRight);
  var vCeil = new THREE.Mesh(new THREE.PlaneGeometry(vHalf * 2, vDepth), voidMat);
  vCeil.rotation.x = Math.PI * 0.5;
  vCeil.position.set(0, WALL_H * 2, DOOR_Z - vDepth * 0.5);
  voidGroup.add(vCeil);
  root.add(voidGroup);
  // 虚空外围碰撞（无出口：三面封死）
  colliders.push(wallCollider(-vHalf - 0.3, vHalf + 0.3, DOOR_Z - vDepth - 0.3, DOOR_Z - vDepth));
  colliders.push(wallCollider(-vHalf - 0.3, -vHalf, DOOR_Z - vDepth, DOOR_Z));
  colliders.push(wallCollider(vHalf, vHalf + 0.3, DOOR_Z - vDepth, DOOR_Z));

  root.add(new THREE.HemisphereLight(0xfff3c4, 0x4a4530, 0.5));
  ceilingLight = new THREE.PointLight(0xffe8a8, 1.15, 18, 1.6);
  ceilingLight.position.set(0, WALL_H - 0.5, 0);
  root.add(ceilingLight);
}

function isNearDoor() {
  var dx = fps.player.x - 0;
  var dz = fps.player.z - DOOR_Z;
  return dx * dx + dz * dz <= DOOR_REACH * DOOR_REACH;
}

function openDoor() {
  if (doorOpen) return;
  doorOpen = true;
  if (doorMesh) doorMesh.visible = false;
  var idx = colliders.indexOf(doorCollider);
  if (idx >= 0) colliders.splice(idx, 1);
  doorCollider = null;
  if (voidGroup) voidGroup.visible = true;
  // 门后不再有照明，室内灯也随之压暗
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.16);
  if (ceilingLight) ceilingLight.intensity = 0.35;
  showToast("门开了——门外是一片彻底的漆黑，什么都没有。");
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 7);
    },
    onKeyDown: function (event) {
      if (event.code === "KeyB" && !event.repeat) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat && !doorOpen && isNearDoor()) {
        event.preventDefault();
        openDoor();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l363", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l363", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2818);
  scene.fog = new THREE.FogExp2(0x2a2818, 0.05);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevel363";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: 363 };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature(363, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  hintEl.innerHTML =
    "Level 363 · 淡黄色的小房间 · <kbd>WASD</kbd> · <kbd>Q</kbd> 开门 · <kbd>B</kbd> 背包";
  bindControls();
  showToast("一间 7×7 的淡黄色房间。只有一扇门。");

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
    if ((!survival || !survival.dead) && !isInventoryOpen()) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    if (interactHintEl) {
      var showHint = !doorOpen && isNearDoor() && !isInventoryOpen();
      interactHintEl.hidden = !showHint;
      if (showHint) interactHintEl.innerHTML = '门 · 按 <kbd>Q</kbd> 打开';
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
  console.error("[Backrooms L363]", err);
  showError(err.message || String(err));
}

/**
 * Backrooms Level C-192 — 10×10 的封闭森林。
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
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
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
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

const ROOM_SIZE = 10;
const HALF = ROOM_SIZE * 0.5;
const WALL_H = 8;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.5;
const TREE_MODEL_URL = "./models/tree-by-zsky.glb";
const TREE_POSITIONS = [
  [-3.4, -3.3],
  [0, -2.1],
  [3.35, -3.25],
  [-3.45, 0],
  [3.45, 0.15],
  [-3.2, 3.25],
  [3.15, 3.2],
];

const colliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 3.8, radius: 0.34, speed: 3.7 },
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
let currentAimPick = null;
let transitionLock = false;

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
    "<p><strong>Level C-192 无法启动</strong></p><p>" + String(text) + "</p>";
}

function addAirWalls() {
  var thickness = 1;
  colliders.push(wallCollider(-HALF - thickness, HALF + thickness, -HALF - thickness, -HALF));
  colliders.push(wallCollider(-HALF - thickness, HALF + thickness, HALF, HALF + thickness));
  colliders.push(wallCollider(-HALF - thickness, -HALF, -HALF, HALF));
  colliders.push(wallCollider(HALF, HALF + thickness, -HALF, HALF));
}

function addTreeInteraction(group, index) {
  var pick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 4.8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 2.35;
  pick.userData.brInteract = { kind: "c192_tree", index: index };
  group.add(pick);
  interactRoots.push(pick);
}

function addFallbackTree(root, x, z, index) {
  var group = new THREE.Group();
  group.position.set(x, 0, z);
  root.add(group);
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x493629, roughness: 1 })
  );
  trunk.position.y = 1.7;
  group.add(trunk);
  var crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.65, 4.2, 9),
    new THREE.MeshStandardMaterial({ color: 0x264a2b, roughness: 1 })
  );
  crown.position.y = 4.5;
  group.add(crown);
  addTreeInteraction(group, index);
}

function populateTrees(root) {
  new GLTFLoader().load(
    TREE_MODEL_URL,
    function (gltf) {
      var source = gltf.scene;
      var bounds = new THREE.Box3().setFromObject(source);
      var size = new THREE.Vector3();
      bounds.getSize(size);
      var scale = size.y > 0 ? 5.7 / size.y : 1;
      var i;
      for (i = 0; i < TREE_POSITIONS.length; i++) {
        var group = new THREE.Group();
        group.position.set(TREE_POSITIONS[i][0], 0, TREE_POSITIONS[i][1]);
        group.rotation.y = i * 1.37;
        root.add(group);
        var visual = source.clone(true);
        visual.scale.setScalar(scale);
        visual.position.y = -bounds.min.y * scale;
        group.add(visual);
        addTreeInteraction(group, i);
      }
    },
    undefined,
    function (err) {
      console.warn("[Backrooms C-192] 树模型加载失败，使用程序化树", err);
      var i;
      for (i = 0; i < TREE_POSITIONS.length; i++) {
        addFallbackTree(root, TREE_POSITIONS[i][0], TREE_POSITIONS[i][1], i);
      }
      showToast("树木的轮廓有些模糊，但仍能切入。");
    }
  );
}

function buildWorld(root) {
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x31452d, roughness: 1 })
  );
  ground.rotation.x = -Math.PI * 0.5;
  root.add(ground);

  // 空气墙不可见，只限制 10×10 森林边界。
  addAirWalls();
  populateTrees(root);

  root.add(new THREE.HemisphereLight(0xaac59b, 0x172116, 0.9));
  var moon = new THREE.DirectionalLight(0xd8e6cf, 0.8);
  moon.position.set(-4, 11, 5);
  root.add(moon);
}

function exitToLevel48() {
  if (transitionLock) return;
  transitionLock = true;
  if (survival) saveBackroomsSurvival(survival);
  grantLevelPass("l48", fps.yaw);
  queueEnterLevelNumber(48);
  showToast("你切入了树干，潮湿的森林气味变成了海风…");
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  window.setTimeout(function () {
    window.location.href = "backrooms-level48.html";
  }, 650);
}

function refreshAimPick() {
  if (
    !camera ||
    transitionLock ||
    isInventoryOpen() ||
    !survival ||
    survival.dead ||
    !interactRoots.length
  ) {
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
  var treeReady = data && data.kind === "c192_tree";
  var hidden =
    transitionLock || isInventoryOpen() || !survival || survival.dead || !treeReady;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) interactHintEl.innerHTML = "树干 · 按 <kbd>Q</kbd> 切入";
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function tryQAction() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "c192_tree") exitToLevel48();
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || transitionLock;
    },
    onJump: function () {
      if (!transitionLock) tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
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
  if (!enforceLevelEntry("c192", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18251a);
  scene.fog = new THREE.Fog(0x18251a, 5, 15);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 40);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC192Forest";
  scene.add(root);
  buildWorld(root);

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c192" };
  });
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("c192", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  hintEl.innerHTML =
    "Level C-192 · 10×10 森林 · 对准树按 <kbd>Q</kbd> 切入 · <kbd>B</kbd> 背包";
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
    if ((!survival || !survival.dead) && !isInventoryOpen() && !transitionLock) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 12);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
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
  console.error("[Backrooms C-192]", err);
  showError(err.message || String(err));
}

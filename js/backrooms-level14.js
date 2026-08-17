/**
 * Backrooms Level 14 — 「天堂」红叶紫雾树林；进入 40 秒后理智急速崩解。
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  saveBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler, countItem } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { updatePastoralStareClip } from "./backrooms-c1298-stare.js";
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

const TREE_GLB_URL = "models/backrooms-dead-tree.glb";
const LEAF_GLB_URL = "models/backrooms-leaf.glb";
const HEAVEN_IMAGE_URL = "img/backrooms/level14/sd-heaven.png";

const FOREST_HALF = 62;
const EYE_HEIGHT = 1.65;
const FOG_COLOR = 0x4a2450;
const TREE_HEIGHT = 12.5;
const TREE_TRUNK_RADIUS = 0.55;

/** 跨次进入复用已解析的 GLB 模板，避免重复解析与材质重建 */
var _cachedTreeTemplate = null;
var _cachedLeafTemplate = null;
var _treeLoadWaiters = null;
var _leafLoadWaiters = null;

/** 每段提示停留 8 秒 */
const INTRO_STEP_MS = 8000;
/** 进入 40 秒后开始每秒扣 50 理智 */
const SANITY_DRAIN_DELAY_MS = 40000;
const SANITY_DRAIN_PER_SEC = 50;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const introRootEl = document.getElementById("backroomsL14Intro");
const introTextEl = document.getElementById("backroomsL14IntroText");
const introImageEl = document.getElementById("backroomsL14IntroImage");

const colliders = [];
const interactRoots = [];
const AIM_MAX = 3.8;
let currentAimPick = null;
let transitionLock = false;
const _survCtx = { sprinting: false, sanityDrainPerSec: 0 };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: null };
const fps = createBackroomsFpsState({
  player: { x: 0, z: 0, radius: 0.34, speed: 4.05 },
});

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let enteredAt = 0;
let introStep = 0;
let introNextAt = 0;

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(message) {
  showBackroomsLootToast(message, { durationMs: 2600 });
}

function showError(message) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 14 无法启动</strong></p><p>" + message + "</p>";
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

/** 伪随机：同一 seed 每次进入布局一致 */
function seededRandom(seed) {
  var value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function leafLitterTexture() {
  var size = 512;
  var canvasEl = document.createElement("canvas");
  canvasEl.width = size;
  canvasEl.height = size;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#5c0d24";
  ctx.fillRect(0, 0, size, size);
  var i;
  for (i = 0; i < 4200; i++) {
    var x = Math.random() * size;
    var y = Math.random() * size;
    var w = 4 + Math.random() * 9;
    var h = 2 + Math.random() * 5;
    var shade = [
      "#8e0f2a",
      "#b31531",
      "#d1213c",
      "#7a0c26",
      "#e8355a",
      "#a3122e",
    ][Math.floor(Math.random() * 6)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.55 + Math.random() * 0.45;
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    ctx.restore();
  }
  var texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(34, 34);
  return texture;
}

function buildProceduralTree(seed) {
  var group = new THREE.Group();
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x241726, roughness: 0.95 });
  var height = TREE_HEIGHT * (0.82 + seededRandom(seed) * 0.4);
  var trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TREE_TRUNK_RADIUS * 0.62, TREE_TRUNK_RADIUS, height, 9),
    trunkMat
  );
  trunk.position.y = height * 0.5;
  group.add(trunk);

  var branchCount = 3;
  var i;
  for (i = 0; i < branchCount; i++) {
    var branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.13, height * 0.32, 6),
      trunkMat
    );
    var angle = seededRandom(seed + i * 3.3) * Math.PI * 2;
    branch.position.set(
      Math.cos(angle) * 0.5,
      height * (0.62 + i * 0.11),
      Math.sin(angle) * 0.5
    );
    branch.rotation.z = 0.75 + seededRandom(seed + i) * 0.4;
    branch.rotation.y = angle;
    group.add(branch);
  }
  return group;
}

/** 统一缩放到目标高度并落到地面 */
function normalizeToHeight(model, targetHeight) {
  model.traverse(function (child) {
    if (child.isMesh || child.isSkinnedMesh) child.frustumCulled = true;
  });
  model.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 0.02) return false;
  model.scale.multiplyScalar(targetHeight / size.y);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  return true;
}

function tintLeafRed(model) {
  model.traverse(function (child) {
    if (!child.isMesh) return;
    child.material = new THREE.MeshStandardMaterial({
      color: 0xb01530,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
  });
}

/**
 * 把叶片摆平：最薄的轴转到竖直方向，再按最长边缩放并贴到地面。
 * @param {THREE.Object3D} model
 * @param {number} spanTarget 叶片最长边的目标长度（米）
 */
function flattenLeafToGround(model, spanTarget) {
  var holder = new THREE.Group();
  holder.add(model);
  holder.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  var maxSpan = Math.max(size.x, size.y, size.z);
  if (maxSpan < 0.0001) return null;

  if (size.x <= size.y && size.x <= size.z) model.rotation.z = Math.PI * 0.5;
  else if (size.z <= size.y) model.rotation.x = Math.PI * 0.5;

  holder.scale.setScalar(spanTarget / maxSpan);
  holder.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y -= box.min.y / holder.scale.y;
  return holder;
}

/** 树的散布点；返回每棵树的坐标与碰撞体 */
function treeSpots() {
  var spots = [];
  var i;
  for (i = 0; i < 190; i++) {
    var x = (seededRandom(i * 1.37) - 0.5) * FOREST_HALF * 1.92;
    var z = (seededRandom(i * 2.71 + 17) - 0.5) * FOREST_HALF * 1.92;
    // 出生点周围留出空地
    if (x * x + z * z < 30) continue;
    spots.push({ x: x, z: z, seed: i });
  }
  return spots;
}

function scatterTrees(root) {
  var spots = treeSpots();
  var host = new THREE.Group();
  host.name = "L14DeadTrees";
  root.add(host);

  var placeholders = [];
  var i;
  for (i = 0; i < spots.length; i++) {
    var spot = spots[i];
    var holder = new THREE.Group();
    holder.position.set(spot.x, 0, spot.z);
    holder.rotation.y = seededRandom(spot.seed * 5.1) * Math.PI * 2;
    var fallback = buildProceduralTree(spot.seed);
    holder.add(fallback);
    host.add(holder);
    placeholders.push({ holder: holder, fallback: fallback, seed: spot.seed });

    var pad = TREE_TRUNK_RADIUS + 0.12;
    colliders.push(wallCollider(spot.x - pad, spot.x + pad, spot.z - pad, spot.z + pad));
  }

  function applyTreeTemplate(template) {
    if (!template) return;
    var j;
    for (j = 0; j < placeholders.length; j++) {
      var entry = placeholders[j];
      var model = template.clone(true);
      model.scale.multiplyScalar(0.85 + seededRandom(entry.seed * 7.7) * 0.45);
      entry.holder.remove(entry.fallback);
      entry.holder.add(model);
    }
  }

  if (_cachedTreeTemplate) {
    applyTreeTemplate(_cachedTreeTemplate);
    return;
  }
  if (!_treeLoadWaiters) {
    _treeLoadWaiters = [];
    new GLTFLoader().load(
      TREE_GLB_URL,
      function (gltf) {
        var template = gltf.scene;
        // 图片里的树干近乎剪影，统一压成暗紫褐色。
        template.traverse(function (child) {
          if (!child.isMesh) return;
          child.material = new THREE.MeshStandardMaterial({
            color: 0x2a1a2e,
            roughness: 0.96,
          });
        });
        if (!normalizeToHeight(template, TREE_HEIGHT)) {
          _treeLoadWaiters = null;
          return;
        }
        _cachedTreeTemplate = template;
        var waiters = _treeLoadWaiters || [];
        _treeLoadWaiters = null;
        for (var w = 0; w < waiters.length; w++) waiters[w](template);
      },
      undefined,
      function () {
        _treeLoadWaiters = null;
      }
    );
  }
  _treeLoadWaiters.push(applyTreeTemplate);
}

function scatterLeaves(root) {
  var host = new THREE.Group();
  host.name = "L14FallenLeaves";
  root.add(host);

  function placeLeaves(template) {
    if (!template) return;
    var i;
    for (i = 0; i < 420; i++) {
      var leaf = template.clone(true);
      var x = (seededRandom(i * 3.11 + 91) - 0.5) * FOREST_HALF * 1.9;
      var z = (seededRandom(i * 4.53 + 37) - 0.5) * FOREST_HALF * 1.9;
      leaf.position.set(x, 0.012, z);
      leaf.rotation.y = seededRandom(i * 8.9) * Math.PI * 2;
      leaf.scale.multiplyScalar(0.7 + seededRandom(i * 1.9) * 0.9);
      host.add(leaf);
    }
  }

  if (_cachedLeafTemplate) {
    placeLeaves(_cachedLeafTemplate);
    return;
  }
  if (!_leafLoadWaiters) {
    _leafLoadWaiters = [];
    new GLTFLoader().load(
      LEAF_GLB_URL,
      function (gltf) {
        tintLeafRed(gltf.scene);
        var template = flattenLeafToGround(gltf.scene, 0.34);
        if (!template) {
          _leafLoadWaiters = null;
          return;
        }
        _cachedLeafTemplate = template;
        var waiters = _leafLoadWaiters || [];
        _leafLoadWaiters = null;
        for (var w = 0; w < waiters.length; w++) waiters[w](template);
      },
      undefined,
      function () {
        _leafLoadWaiters = null;
      }
    );
  }
  _leafLoadWaiters.push(placeLeaves);
}

function buildWorld(root) {
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(FOREST_HALF * 2.2, FOREST_HALF * 2.2),
    new THREE.MeshStandardMaterial({
      map: leafLitterTexture(),
      roughness: 0.95,
    })
  );
  ground.rotation.x = -Math.PI * 0.5;
  root.add(ground);

  scatterTrees(root);
  scatterLeaves(root);

  // 林地边界空气墙。
  colliders.push(wallCollider(-FOREST_HALF - 1, -FOREST_HALF, -FOREST_HALF, FOREST_HALF));
  colliders.push(wallCollider(FOREST_HALF, FOREST_HALF + 1, -FOREST_HALF, FOREST_HALF));
  colliders.push(wallCollider(-FOREST_HALF, FOREST_HALF, -FOREST_HALF - 1, -FOREST_HALF));
  colliders.push(wallCollider(-FOREST_HALF, FOREST_HALF, FOREST_HALF, FOREST_HALF + 1));

  // 紫色薄暮光照。
  root.add(new THREE.HemisphereLight(0x9d6ac0, 0x3b0f24, 1.05));
  var dusk = new THREE.DirectionalLight(0xc79ae8, 0.85);
  dusk.position.set(-24, 26, 18);
  root.add(dusk);
  var glow = new THREE.PointLight(0xd8408a, 0.55, 34, 2);
  glow.position.set(0, 2.2, 0);
  root.add(glow);
  root.add(new THREE.AmbientLight(0x7a4a92, 0.35));

  // 层级密钥对应的回枢纽门（出生点附近）
  var doorX = 5.2;
  var doorZ = -4.4;
  var doorMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a32,
    emissive: 0x4a2068,
    emissiveIntensity: 0.35,
    roughness: 0.7,
  });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.35), doorMat);
  frame.position.set(doorX, 1.6, doorZ);
  root.add(frame);
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.08, 10, 24),
    new THREE.MeshStandardMaterial({
      color: 0xd8b060,
      emissive: 0xa07020,
      emissiveIntensity: 0.55,
      metalness: 0.4,
      roughness: 0.35,
    })
  );
  ring.position.set(doorX, 1.7, doorZ + 0.22);
  root.add(ring);
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 3.4, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(doorX, 1.6, doorZ);
  pick.userData.brInteract = { kind: "l14_hub_door" };
  root.add(pick);
  interactRoots.push(pick);
  colliders.push(wallCollider(doorX - 1.1, doorX + 1.1, doorZ - 0.25, doorZ + 0.25));
}

function refreshAim() {
  currentAimPick = null;
  if (!camera || isInventoryOpen() || transitionLock || !interactRoots.length) return;
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function updateInteractUi() {
  if (!interactHintEl) return;
  var data =
    currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (!data || data.kind !== "l14_hub_door" || isInventoryOpen() || transitionLock) {
    interactHintEl.hidden = true;
    return;
  }
  interactHintEl.hidden = false;
  interactHintEl.innerHTML =
    countItem("level_key_l14") >= 1
      ? "环形符号之门 · 按 <kbd>Q</kbd> 返回枢纽"
      : "环形符号之门 · 需要层级密钥（Level 14）";
}

function leaveToHub() {
  if (transitionLock) return;
  if (countItem("level_key_l14") < 1) {
    showToast("大门锁死。你需要对应的层级密钥。");
    return;
  }
  transitionLock = true;
  showToast("密钥嵌入环形符号——门后是枢纽的回廊。", 2800);
  saveBackroomsSurvival(survival);
  grantLevelPass("hub", fps.yaw);
  queueEnterLevelBanner("枢纽");
  window.setTimeout(function () {
    window.location.href = "backrooms-hub.html";
  }, 650);
}

function tryInteract() {
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data =
    currentAimPick && currentAimPick.distance <= AIM_MAX ? currentAimPick.data : null;
  if (data && data.kind === "l14_hub_door") leaveToHub();
}

function setIntroText(text) {
  if (introImageEl) {
    introImageEl.hidden = true;
    introImageEl.removeAttribute("src");
  }
  if (!introTextEl) return;
  introTextEl.textContent = text;
  introTextEl.hidden = false;
}

function setIntroImage() {
  if (introTextEl) introTextEl.hidden = true;
  if (!introImageEl) return;
  introImageEl.src = HEAVEN_IMAGE_URL;
  introImageEl.hidden = false;
}

function hideIntro() {
  if (introTextEl) introTextEl.hidden = true;
  if (introImageEl) {
    introImageEl.hidden = true;
    introImageEl.removeAttribute("src");
  }
  if (introRootEl) introRootEl.hidden = true;
}

/** 顶部提示：欢迎语 → 难度图 → 土里的客人 */
function updateIntroSequence(now) {
  if (introStep > 3 || now < introNextAt) return;
  introStep += 1;
  introNextAt = now + INTRO_STEP_MS;
  if (introStep === 1) {
    setIntroText("欢迎来到天堂");
    return;
  }
  if (introStep === 2) {
    setIntroImage();
    return;
  }
  if (introStep === 3) {
    setIntroText("看看那些在土里的其他客人吧。");
    return;
  }
  hideIntro();
}

function updateSanityDrain(now) {
  var draining = now - enteredAt >= SANITY_DRAIN_DELAY_MS;
  _survCtx.sanityDrainPerSec = draining ? SANITY_DRAIN_PER_SEC : 0;
  if (draining && !document.body.classList.contains("backrooms-l14-draining")) {
    document.body.classList.add("backrooms-l14-draining");
    showToast("树林开始向你低语…");
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
      tryBackroomsJump(fps, 8);
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
        refreshAim();
        tryInteract();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function init() {
  if (!enforceLevelEntry("l14", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l14", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.038);
  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 130);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel14";
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
    return { level: 14 };
  });
  initBackroomsTemperature(14, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 14 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
  }
  bindControls();

  enteredAt = performance.now();
  introNextAt = enteredAt;

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;

    updateIntroSequence(now);
    updateSanityDrain(now);

    if (survival && !survival.dead) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
      updatePastoralStareClip(dt, {
        moving: moving,
        survival: survival,
        yaw: fps.yaw,
      });
    }
    updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !isTaskUiOpen() &&
      !transitionLock
    ) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 14);
      });
    }
    applyBackroomsCamera(fps, camera, EYE_HEIGHT);
    refreshAim();
    updateInteractUi();
    if (crosshairEl) {
      var aimDoor =
        currentAimPick &&
        currentAimPick.distance <= AIM_MAX &&
        currentAimPick.data &&
        currentAimPick.data.kind === "l14_hub_door";
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", isInventoryOpen());
      crosshairEl.classList.toggle("backrooms-crosshair--interact", !!aimDoor && !isInventoryOpen());
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
  console.error("[Backrooms L14]", err);
  showError(err.message || String(err));
}

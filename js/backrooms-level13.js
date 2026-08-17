/**
 * Backrooms Level 13 — 7×7 公寓大厅、无面灵前台、303 房间。
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
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
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

const FACELESS_MODEL_URL = "models/backrooms-faceling.glb";
/** 跨次进入复用已解析的 Faceling 模板 */
var _cachedFacelingTemplate = null;
var _facelingLoadWaiters = null;
const ROOM_ASSIGNED_KEY = "backrooms_l13_room303_assigned_v1";
const WALL_H = 3.2;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.2;

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
const dialogueEl = document.getElementById("backroomsDialogue");
const dialogueSpeakerEl = document.getElementById("backroomsDialogueSpeaker");
const dialogueTextEl = document.getElementById("backroomsDialogueText");
const dialogueChoicesEl = document.getElementById("backroomsDialogueChoices");

const colliders = [];
const interactRoots = [];
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: WALL_H };
const fps = createBackroomsFpsState({
  player: { x: 0, z: 2.25, radius: 0.32, speed: 4.05 },
});

let renderer = null;
let camera = null;
let scene = null;
let survival = null;
let currentAimPick = null;
let dialogueOpen = false;
let transitionLock = false;
let roomAssigned = false;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, material) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";

function showToast(message) {
  showBackroomsLootToast(message, { durationMs: 2600 });
}

function showError(message) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level 13 无法启动</strong></p><p>" + message + "</p>";
}

function addWall(root, material, x, z, w, d) {
  addBox(root, w, WALL_H, d, x, WALL_H * 0.5, z, material);
  colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
}

function makeRoomNumberTexture() {
  var canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 128;
  var ctx = canvasEl.getContext("2d");
  ctx.fillStyle = "#4b3020";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#d9b36b";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.fillStyle = "#f5deb0";
  ctx.font = "bold 72px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("303", 128, 66);
  var texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFallbackFaceling() {
  var group = new THREE.Group();
  group.name = "FacelingFallback";
  var suit = new THREE.MeshLambertMaterial({ color: 0x3b3d42 });
  var shirt = new THREE.MeshLambertMaterial({ color: 0xd8d3c8 });
  var skin = new THREE.MeshLambertMaterial({ color: 0xc9a27f });
  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.82, 0.25), suit);
  legL.position.set(-0.14, 0.41, 0);
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.76, 0.34), shirt);
  torso.position.y = 1.18;
  group.add(torso);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
  head.scale.set(0.86, 1.12, 0.82);
  head.position.y = 1.73;
  group.add(head);
  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.17), shirt);
  armL.position.set(-0.39, 1.14, 0);
  group.add(armL);
  var armR = armL.clone();
  armR.position.x = 0.39;
  group.add(armR);
  return group;
}

function normalizeModel(model) {
  model.traverse(function (child) {
    if (child.isMesh || child.isSkinnedMesh) {
      child.frustumCulled = false;
      if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
    }
  });
  model.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 0.05) return false;
  model.scale.multiplyScalar(1.76 / size.y);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  return true;
}

function spawnFaceling(root) {
  var host = new THREE.Group();
  host.name = "Level13Faceling";
  host.position.set(0, 0, -2.45);
  host.rotation.y = 0;
  root.add(host);

  var fallback = buildFallbackFaceling();
  host.add(fallback);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.95;
  pick.userData.brInteract = { kind: "l13_faceling" };
  host.add(pick);
  interactRoots.push(pick);

  function applyFaceling(template) {
    if (!template || !host.parent) return;
    var model = template.clone(true);
    host.remove(fallback);
    host.add(model);
  }

  if (_cachedFacelingTemplate) {
    applyFaceling(_cachedFacelingTemplate);
    return;
  }
  if (!_facelingLoadWaiters) {
    _facelingLoadWaiters = [];
    new GLTFLoader().load(
      FACELESS_MODEL_URL,
      function (gltf) {
        var model = gltf.scene;
        if (!normalizeModel(model)) {
          _facelingLoadWaiters = null;
          return;
        }
        _cachedFacelingTemplate = model;
        var waiters = _facelingLoadWaiters || [];
        _facelingLoadWaiters = null;
        for (var w = 0; w < waiters.length; w++) waiters[w](model);
      },
      undefined,
      function () {
        _facelingLoadWaiters = null;
      }
    );
  }
  _facelingLoadWaiters.push(applyFaceling);
}

function buildWorld(root) {
  var wallMat = new THREE.MeshStandardMaterial({ color: 0xd9cba8, roughness: 0.88 });
  var trimMat = new THREE.MeshStandardMaterial({ color: 0x6d4c32, roughness: 0.76 });
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x9d856a, roughness: 0.84 });
  var hallFloor = new THREE.MeshStandardMaterial({ color: 0xb9a88e, roughness: 0.86 });
  var counterMat = new THREE.MeshStandardMaterial({ color: 0x5b3522, roughness: 0.7 });
  var roomFloorMat = new THREE.MeshStandardMaterial({
    color: 0x7c6b5d,
    emissive: 0x1b120c,
    emissiveIntensity: 0.08,
    roughness: 0.9,
  });
  var pipeMat = new THREE.MeshStandardMaterial({
    color: 0x778185,
    metalness: 0.72,
    roughness: 0.38,
  });
  var pipeRust = new THREE.MeshStandardMaterial({ color: 0x714932, roughness: 0.88 });
  var pipeDark = new THREE.MeshBasicMaterial({
    color: 0x050607,
    side: THREE.DoubleSide,
  });

  // 7×7 大厅。
  addBox(root, 7, 0.14, 7, 0, 0, 0, hallFloor);
  addBox(root, 7, 0.12, 18, 0, 0, -12.5, floorMat);
  addBox(root, 7, 0.14, 7, 0, 0.01, -18, roomFloorMat);
  addBox(root, 7, 0.14, 28.5, 0, WALL_H, -9.25, wallMat);

  // 大厅外墙；北侧留 2m 走廊入口。
  addWall(root, wallMat, -3.5, 0, 0.22, 7);
  addWall(root, wallMat, 3.5, 0, 0.22, 7);
  addWall(root, wallMat, 0, 3.5, 7, 0.22);
  addWall(root, wallMat, -2.25, -3.5, 2.5, 0.22);
  addWall(root, wallMat, 2.25, -3.5, 2.5, 0.22);

  // 柜台与后方通道。
  addBox(root, 4.8, 1.15, 0.62, 0, 0.575, -1.45, counterMat);
  addBox(root, 5.1, 0.12, 0.82, 0, 1.2, -1.45, trimMat);
  colliders.push(wallCollider(-2.45, 2.45, -1.8, -1.1));

  // 柜台后走廊，尽头连接 303。
  addWall(root, wallMat, -1.2, -9, 0.2, 11);
  addWall(root, wallMat, 1.2, -9, 0.2, 11);
  // 303 房间侧墙、后墙和入口两侧墙。
  addWall(root, wallMat, -3.5, -18, 0.22, 7);
  addWall(root, wallMat, 3.5, -18, 0.22, 7);
  addWall(root, wallMat, 0, -21.5, 7, 0.22);
  addWall(root, wallMat, -2.25, -14.5, 2.5, 0.22);
  addWall(root, wallMat, 2.25, -14.5, 2.5, 0.22);

  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 0.62),
    new THREE.MeshBasicMaterial({ map: makeRoomNumberTexture() })
  );
  sign.position.set(0, 2.35, -14.37);
  root.add(sign);

  var floorPick = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 5.2),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  floorPick.rotation.x = -Math.PI * 0.5;
  floorPick.position.set(0, 0.09, -18);
  floorPick.userData.brInteract = { kind: "l13_room303_floor" };
  root.add(floorPick);
  interactRoots.push(floorPick);

  // 303 后墙的管道：准心对准后按 Q 切入。
  var pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.82, 2.1, 22, 1, true),
    pipeMat
  );
  pipe.rotation.x = Math.PI * 0.5;
  pipe.position.set(0, 1.12, -20.3);
  root.add(pipe);
  var pipeRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.12, 10, 22),
    pipeRust
  );
  pipeRim.position.set(0, 1.12, -19.22);
  root.add(pipeRim);
  var pipeMouth = new THREE.Mesh(new THREE.CircleGeometry(0.72, 22), pipeDark);
  pipeMouth.position.set(0, 1.12, -19.27);
  root.add(pipeMouth);
  var pipePick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.78, 0.28, 18),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pipePick.rotation.x = Math.PI * 0.5;
  pipePick.position.set(0, 1.12, -19.12);
  pipePick.userData.brInteract = { kind: "l13_pipe" };
  root.add(pipePick);
  interactRoots.push(pipePick);

  // 暖色大厅灯与走廊灯。
  root.add(new THREE.HemisphereLight(0xfff0cf, 0x463b35, 1.15));
  var lightZ;
  for (lightZ = 1.5; lightZ >= -20; lightZ -= 4) {
    var light = new THREE.PointLight(0xffdba3, 0.78, 8, 2);
    light.position.set(0, 2.75, lightZ);
    root.add(light);
  }
  root.add(new THREE.AmbientLight(0xffead0, 0.28));
  spawnFaceling(root);
}

function openFacelingDialogue() {
  if (!dialogueEl || !dialogueTextEl) return;
  dialogueOpen = true;
  roomAssigned = true;
  try {
    sessionStorage.setItem(ROOM_ASSIGNED_KEY, "1");
  } catch (err) {
    /* ignore */
  }
  document.body.classList.add("backrooms-dialogue-open");
  dialogueEl.hidden = false;
  if (dialogueSpeakerEl) dialogueSpeakerEl.textContent = "无面灵";
  dialogueTextEl.textContent = "你的房间是 303。绕过柜台，沿后面的走廊走到尽头。";
  if (dialogueChoicesEl) {
    dialogueChoicesEl.hidden = false;
    dialogueChoicesEl.innerHTML = "按 <kbd>Q</kbd> 知道了";
  }
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function closeDialogue() {
  dialogueOpen = false;
  document.body.classList.remove("backrooms-dialogue-open");
  if (dialogueEl) dialogueEl.hidden = true;
  if (dialogueChoicesEl) dialogueChoicesEl.hidden = true;
}

function refreshAimPick() {
  if (!camera || dialogueOpen || isInventoryOpen()) {
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
  var hidden = isInventoryOpen() || dialogueOpen || !survival || survival.dead || !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      if (data.kind === "l13_faceling") {
        interactHintEl.innerHTML = "无面灵前台 · 按 <kbd>Q</kbd> 对话";
      } else if (data.kind === "l13_pipe") {
        interactHintEl.innerHTML = "管道口 · 按 <kbd>Q</kbd> 切入";
      } else if (roomAssigned) {
        interactHintEl.innerHTML = "303 房间地板 · 按 <kbd>Q</kbd> 切出";
      } else {
        interactHintEl.innerHTML = "303 房间地板 · 先去前台办理入住";
      }
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle("backrooms-crosshair--hidden", hidden && !data);
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden && !!data);
  }
}

function exitToLevel14() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("地板失去实体感，你切了出去…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l14", fps.yaw);
  queueEnterLevelNumber(14);
  window.setTimeout(function () {
    window.location.href = "backrooms-level14.html";
  }, 500);
}

function exitPipeToLevel3() {
  if (transitionLock) return;
  transitionLock = true;
  showToast("你切进了冰冷的管道…");
  saveBackroomsSurvival(survival);
  grantLevelPass("l3", fps.yaw);
  queueEnterLevelNumber(3);
  window.setTimeout(function () {
    window.location.href = "backrooms-level3.html";
  }, 500);
}

function tryQAction() {
  if (dialogueOpen) {
    closeDialogue();
    return;
  }
  if (transitionLock || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (!data) return;
  if (data.kind === "l13_faceling") {
    openFacelingDialogue();
    return;
  }
  if (data.kind === "l13_pipe") {
    exitPipeToLevel3();
    return;
  }
  if (data.kind === "l13_room303_floor") {
    if (!roomAssigned) {
      showToast("你还没有被分配房间。");
      return;
    }
    exitToLevel14();
  }
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || dialogueOpen || isTaskUiOpen();
    },
    onJump: function () {
      tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      if (dialogueOpen) {
        if (event.code === "Escape" && !event.repeat) closeDialogue();
        return true;
      }
      if (!isInventoryOpen() && handleTaskUiKey(event)) {
        event.preventDefault();
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
  if (!enforceLevelEntry("l13", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  try {
    roomAssigned = sessionStorage.getItem(ROOM_ASSIGNED_KEY) === "1";
  } catch (err) {
    roomAssigned = false;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("l13", showToast);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5e5145);
  scene.fog = new THREE.Fog(0x5e5145, 12, 34);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 55);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  var root = new THREE.Group();
  root.name = "BackroomsLevel13";
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
    return { level: 13 };
  });
  initBackroomsTemperature(13, {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  if (hintEl) {
    hintEl.innerHTML =
      "Level 13 · <kbd>Q</kbd> 交互 · <kbd>WASD</kbd> 移动 · <kbd>Space</kbd> 跳跃 · <kbd>B</kbd> 背包";
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
    if (
      (!survival || !survival.dead) &&
      !isInventoryOpen() &&
      !dialogueOpen &&
      !transitionLock &&
      !isTaskUiOpen()
    ) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 16);
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
  console.error("[Backrooms L13]", err);
  showError(err.message || String(err));
}

import * as THREE from "three";
import {
  enforceLevelEntry,
  grantLevelPass,
} from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";
import {
  DEFAULT_C101_SOURCE,
  validateC101Config,
  writeC101Result,
} from "./backrooms-c101-state.js";
import {
  applyBackroomsCamera,
  bindBackroomsFpsControls,
  createBackroomsFpsState,
  moveBackroomsPlayer,
  syncBackroomsPointerLockBodyClass,
  tryBackroomsJump,
  updateBackroomsPlayerPhysics,
} from "./backrooms-fps-controller.js";

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsInteractHint");
const toastEl = document.getElementById("backroomsLootToast");
const errorEl = document.getElementById("backroomsError");
const editorEl = document.getElementById("c101Editor");
const sourceEl = document.getElementById("c101Source");
const okEl = document.getElementById("c101Ok");
const statusEl = document.getElementById("c101Status");

let scene;
let camera;
let renderer;
let editorOpen = false;
let runResult = null;
let entering = false;
let toastTimer = 0;
const fps = createBackroomsFpsState({ player: { x: 0, z: 9, speed: 4.5 } });
fps.yaw = 0;
const raycaster = new THREE.Raycaster();
const pickTargets = [];
let aimedKind = null;

function showToast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toastEl.hidden = true;
  }, 2400);
}

function addBox(size, position, material, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  (parent || scene).add(mesh);
  return mesh;
}

function addPick(kind, size, position) {
  const mesh = addBox(
    size,
    position,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  mesh.userData.kind = kind;
  pickTargets.push(mesh);
  return mesh;
}

function buildRoom() {
  const concrete = new THREE.MeshLambertMaterial({ color: 0x313a3e });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x151b1d });
  const wood = new THREE.MeshLambertMaterial({ color: 0x714522 });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x22292d,
    metalness: 0.75,
    roughness: 0.36,
  });
  const screen = new THREE.MeshBasicMaterial({ color: 0x20d879 });

  addBox([18, 0.3, 28], [0, -0.15, 0], floorMat);
  addBox([18, 0.3, 28], [0, 6.15, 0], concrete);
  addBox([0.35, 6, 28], [-9, 3, 0], concrete);
  addBox([0.35, 6, 28], [9, 3, 0], concrete);
  addBox([18, 6, 0.35], [0, 3, 14], concrete);
  addBox([18, 6, 0.35], [0, 3, -14], concrete);

  const server = new THREE.Group();
  addBox([5.2, 2.2, 1.8], [0, 1.1, 0], metal, server);
  addBox([3.8, 1.25, 0.08], [0, 1.35, 0.94], screen, server);
  for (let i = -2; i <= 2; i++) {
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb629 : 0x62ff8e })
    );
    led.position.set(i * 0.46, 0.45, 0.96);
    server.add(led);
  }
  scene.add(server);
  addPick("server", [5.4, 2.5, 2.1], [0, 1.2, 0]);

  addBox([3.1, 3.8, 0.28], [0, 1.9, -13.75], wood);
  addBox([3.55, 0.25, 0.4], [0, 3.9, -13.62], metal);
  addBox([0.25, 4.05, 0.4], [-1.65, 1.9, -13.62], metal);
  addBox([0.25, 4.05, 0.4], [1.65, 1.9, -13.62], metal);
  addPick("exit", [3.4, 4, 0.6], [0, 2, -13.45]);

  for (let z = -10; z <= 10; z += 5) {
    const panel = addBox(
      [2.8, 0.08, 0.65],
      [z === 0 ? 4 : -4, 6, z],
      new THREE.MeshBasicMaterial({ color: 0xbdeeff })
    );
    const light = new THREE.PointLight(0x9edfff, 0.55, 13);
    light.position.copy(panel.position);
    light.position.y = 5.7;
    scene.add(light);
  }
  scene.add(new THREE.AmbientLight(0x84a9b5, 0.62));
}

function resolveRoom(nextX, nextZ) {
  const r = fps.player.radius;
  let x = Math.max(-8.6 + r, Math.min(8.6 - r, nextX));
  let z = Math.max(-13.6 + r, Math.min(13.6 - r, nextZ));
  if (Math.abs(x) < 3.0 && Math.abs(z) < 1.35) {
    const dx = Math.min(Math.abs(x + 3), Math.abs(x - 3));
    const dz = Math.min(Math.abs(z + 1.35), Math.abs(z - 1.35));
    if (dx < dz) x = x < 0 ? -3 - r : 3 + r;
    else z = z < 0 ? -1.35 - r : 1.35 + r;
  }
  return { x, z };
}

function openEditor() {
  editorOpen = true;
  editorEl.hidden = false;
  statusEl.textContent = "修改代码后点击 OK。Esc 可关闭终端。";
  statusEl.classList.remove("c101-editor__status--error");
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  requestAnimationFrame(function () {
    sourceEl.focus();
  });
}

function closeEditor() {
  editorOpen = false;
  editorEl.hidden = true;
  sourceEl.blur();
  try {
    const locked = inputEl.requestPointerLock && inputEl.requestPointerLock();
    if (locked && locked.catch) locked.catch(function () {});
  } catch (_err) {
    /* 浏览器拒绝自动锁定时，玩家点一下画面即可 */
  }
}

function workerProgram() {
  return `
self.onmessage = function(event) {
  var config = {
    fog: { color: "#3a4a58", near: 8, far: 42 },
    lights: { color: "#dcecff", intensity: 1 },
    pillars: { color: "#a8a39a", scale: 1, height: 1 }
  };
  var level1 = Object.freeze({
    setFog: function(color, near, far) {
      config.fog = { color: color, near: near, far: far };
    },
    setLights: function(color, intensity) {
      config.lights = { color: color, intensity: intensity };
    },
    setPillars: function(value) {
      if (!value || typeof value !== "object") throw new Error("setPillars 需要对象");
      config.pillars = {
        color: value.color,
        scale: value.scale,
        height: value.height
      };
    }
  });
  try {
    var run = new Function(
      "level1", "self", "globalThis", "window", "document", "fetch",
      "XMLHttpRequest", "WebSocket", "indexedDB", "caches", "importScripts",
      "\\"use strict\\";\\n" + String(event.data.source)
    );
    run(level1, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined);
    self.postMessage({ ok: true, config: config });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error && error.message || error) });
  }
};`;
}

function executeSource(source) {
  return new Promise(function (resolve) {
    const url = URL.createObjectURL(
      new Blob([workerProgram()], { type: "text/javascript" })
    );
    const worker = new Worker(url);
    let settled = false;
    const finish = function (result) {
      if (settled) return;
      settled = true;
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    worker.onmessage = function (event) {
      finish(event.data);
    };
    worker.onerror = function (event) {
      finish({ ok: false, error: event.message || "Worker 运行异常" });
    };
    worker.postMessage({ source });
    setTimeout(function () {
      finish({ ok: false, error: "运行超时：脚本可能包含死循环" });
    }, 700);
  });
}

async function runCode() {
  okEl.disabled = true;
  statusEl.textContent = "正在隔离运行…";
  statusEl.classList.remove("c101-editor__status--error");
  let result = await executeSource(sourceEl.value);
  if (result.ok) {
    try {
      result = { ok: true, config: validateC101Config(result.config) };
    } catch (error) {
      result = { ok: false, error: error.message || String(error) };
    }
  }
  runResult = result;
  writeC101Result(result);
  okEl.disabled = false;
  // 提交后服务器落锁：退出终端继续走动，不能再改这一次的代码
  closeEditor();
  showToast(
    result.ok
      ? "代码已提交 · 服务器落锁 · 后方木门解锁"
      : "BUG: " + result.error + " · 后方木门正在重写目的地"
  );
}

function useExit() {
  if (!runResult) {
    showToast("木门没有反应。先在服务器运行代码。");
    return;
  }
  if (entering) return;
  entering = true;
  if (runResult.ok) {
    grantLevelPass("clip", -Math.PI * 0.5, { noEscape: true });
    queueEnterLevelBanner("Level 1 · 已加载临时代码");
    window.location.href = "backrooms-level1.html";
  } else {
    window.location.href = "backrooms-level-c101-glitch.html";
  }
}

function interact() {
  if (editorOpen) return;
  if (aimedKind === "server") {
    if (runResult) {
      showToast("服务器已落锁 · 走向后方木门");
      return;
    }
    openEditor();
  } else if (aimedKind === "exit") {
    useExit();
  }
}

function updateAim() {
  aimedKind = null;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 4.6;
  const hit = raycaster.intersectObjects(pickTargets, false)[0];
  if (hit) aimedKind = hit.object.userData.kind || null;
  if (aimedKind === "server") {
    hintEl.innerHTML = runResult
      ? "服务器已落锁 · 代码已提交"
      : '服务器 · 按 <kbd>Q</kbd> 打开 L1 代码';
    hintEl.hidden = false;
  } else if (aimedKind === "exit") {
    hintEl.innerHTML = runResult
      ? '服务器后的木门 · 按 <kbd>Q</kbd> 打开'
      : '服务器后的木门 · 需要先运行代码';
    hintEl.hidden = false;
  } else {
    hintEl.hidden = true;
  }
}

function init() {
  if (!enforceLevelEntry("c101")) {
    window.location.replace("backrooms-level1.html");
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071015);
  scene.fog = new THREE.Fog(0x071015, 10, 34);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 70);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight, false);
  buildRoom();

  bindBackroomsFpsControls({
    canvas,
    inputEl,
    state: fps,
    shouldBlockPointerLock: function () {
      return editorOpen;
    },
    shouldBlockLook: function () {
      return editorOpen;
    },
    onJump: function () {
      if (!editorOpen) tryBackroomsJump(fps);
    },
    onKeyDown: function (event) {
      if (event.code === "Escape" && editorOpen) {
        closeEditor();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        interact();
        return true;
      }
      return editorOpen;
    },
  });
  inputEl.addEventListener("click", function () {
    if (!editorOpen && inputEl.requestPointerLock) inputEl.requestPointerLock();
  });
  okEl.addEventListener("click", runCode);
  sourceEl.value = DEFAULT_C101_SOURCE;
  window.addEventListener("resize", function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!editorOpen) {
      moveBackroomsPlayer(fps, dt, 1, resolveRoom);
      updateBackroomsPlayerPhysics(fps, dt, { floorY: 0, ceilingY: 6 });
      applyBackroomsCamera(fps, camera);
      updateAim();
    }
    syncBackroomsPointerLockBodyClass(fps);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (error) {
  errorEl.hidden = false;
  errorEl.textContent = "Level C-101 无法启动：" + (error.message || error);
}

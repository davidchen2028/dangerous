import * as THREE from "three";
import {
  AUTHOR_MODEL_CATEGORIES,
  getAuthorModels,
  disposeAuthorModel,
} from "./author-showcase-models.js";
import {
  isAuthorPasswordValid,
  hasAuthorShowcaseAccess,
  grantAuthorShowcaseAccess,
} from "./author-showcase-auth.js";

const lock = document.getElementById("authorLock");
const shell = document.getElementById("authorShell");
const login = document.getElementById("authorLogin");
const password = document.getElementById("authorPassword");
const error = document.getElementById("authorError");
const canvas = document.getElementById("authorCanvas");
const modelList = document.getElementById("modelList");
const modelGallery = document.getElementById("modelGallery");
const audioGallery = document.getElementById("audioGallery");
const titleEl = document.getElementById("modelTitle");
const typeEl = document.getElementById("modelType");
const sourceEl = document.getElementById("modelSource");
const descriptionEl = document.getElementById("modelDescription");
const rotateButton = document.getElementById("toggleRotate");
const resetButton = document.getElementById("resetCamera");
const audio = document.getElementById("showcaseAudio");
const audioPlayer = document.getElementById("audioPlayer");
const audioNow = document.getElementById("audioNow");

let renderer = null;
let scene = null;
let camera = null;
let modelRoot = null;
let currentModel = null;
let currentCategory = "doors";
let autoRotate = true;
let yaw = -0.35;
let pitch = 0.18;
let distance = 5.2;
let targetY = 1.2;
let dragging = false;
let lastX = 0;
let lastY = 0;
const activePointers = new Map();
let pinchDistance = 0;
let audioCtx = null;
const activeAudioNodes = new Set();

function isAuthorized() {
  return hasAuthorShowcaseAccess(sessionStorage);
}

function rememberAuthorization() {
  grantAuthorShowcaseAccess(sessionStorage);
}

function unlock() {
  lock.hidden = true;
  shell.hidden = false;
  if (!renderer) initViewer();
}

login.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isAuthorPasswordValid(password.value)) {
    error.textContent = "密码错误";
    password.select();
    return;
  }
  error.textContent = "";
  rememberAuthorization();
  unlock();
});

if (isAuthorized()) unlock();

function initViewer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1017);
  camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  modelRoot = new THREE.Group();
  scene.add(modelRoot);

  scene.add(new THREE.HemisphereLight(0xb9d9eb, 0x18202a, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-4, 7, -5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5fb9e5, 1.5);
  rim.position.set(5, 3, 4);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 48),
    new THREE.MeshStandardMaterial({
      color: 0x121c25,
      roughness: 0.94,
      metalness: 0.08,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.035;
  scene.add(floor);
  const grid = new THREE.GridHelper(9, 18, 0x35566b, 0x1c303e);
  grid.position.y = -0.02;
  scene.add(grid);

  bindViewerControls();
  resize();
  window.addEventListener("resize", resize);
  showCategory(currentCategory);
  requestAnimationFrame(frame);
}

function resize() {
  if (!renderer || !camera) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function showCategory(category) {
  currentCategory = category;
  document.querySelectorAll(".author-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.category === category);
  });
  const audioMode = category === "audio";
  modelGallery.hidden = audioMode;
  audioGallery.hidden = !audioMode;
  if (audioMode) return;

  const models = getAuthorModels(category);
  modelList.replaceChildren();
  models.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "author-model";
    button.dataset.modelId = entry.id;
    button.innerHTML = `<strong>${entry.title}</strong><small>${entry.source}</small>`;
    button.addEventListener("click", () => selectModel(entry, button));
    modelList.appendChild(button);
    if (index === 0) selectModel(entry, button);
  });
}

function selectModel(entry, button) {
  if (currentModel) disposeAuthorModel(currentModel);
  modelRoot.clear();
  currentModel = entry.build();
  modelRoot.add(currentModel.group);
  centerAndFit(currentModel.group);
  modelList.querySelectorAll(".author-model").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  typeEl.textContent = AUTHOR_MODEL_CATEGORIES[entry.category] || "模型";
  titleEl.textContent = entry.title;
  sourceEl.textContent = `来源：${entry.source}`;
  descriptionEl.textContent = entry.description;
}

function centerAndFit(group) {
  group.rotation.set(0, 0, 0);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= bounds.min.y;
  targetY = Math.max(0.5, size.y * 0.47);
  distance = THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) * 1.65, 3.2, 10);
  yaw = -0.35;
  pitch = 0.18;
}

function bindViewerControls() {
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    autoRotate = false;
    rotateButton.textContent = "继续旋转";
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size >= 2) {
      const points = Array.from(activePointers.values());
      const nextPinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchDistance > 0) {
        distance = THREE.MathUtils.clamp(distance + (pinchDistance - nextPinch) * 0.018, 2.2, 13);
      }
      pinchDistance = nextPinch;
      return;
    }
    yaw += (event.clientX - lastX) * 0.009;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastY) * 0.006, -0.55, 0.75);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const release = (event) => {
    activePointers.delete(event.pointerId);
    pinchDistance = 0;
    dragging = activePointers.size > 0;
    const remaining = activePointers.values().next().value;
    if (remaining) {
      lastX = remaining.x;
      lastY = remaining.y;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.006, 2.2, 13);
  }, { passive: false });

  rotateButton.addEventListener("click", () => {
    autoRotate = !autoRotate;
    rotateButton.textContent = autoRotate ? "暂停旋转" : "继续旋转";
  });
  resetButton.addEventListener("click", () => {
    yaw = -0.35;
    pitch = 0.18;
    autoRotate = true;
    rotateButton.textContent = "暂停旋转";
    if (currentModel) centerAndFit(currentModel.group);
  });
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  if (!renderer || !scene || !camera) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  if (autoRotate) yaw += dt * 0.32;
  if (currentModel && typeof currentModel.update === "function") {
    currentModel.update(dt, performance.now() * 0.001);
  }
  const cp = Math.cos(pitch);
  camera.position.set(
    Math.sin(yaw) * cp * distance,
    targetY + Math.sin(pitch) * distance,
    Math.cos(yaw) * cp * distance
  );
  camera.lookAt(0, targetY, 0);
  renderer.render(scene, camera);
}

document.querySelectorAll(".author-tab").forEach((tab) => {
  tab.addEventListener("click", () => showCategory(tab.dataset.category));
});

function getAudioContext() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function trackNode(node) {
  activeAudioNodes.add(node);
  node.addEventListener?.("ended", () => activeAudioNodes.delete(node), { once: true });
  return node;
}

function noiseBuffer(ctx, duration) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playSfx(kind) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.connect(ctx.destination);

  if (kind === "explosion" || kind === "gunshot") {
    const duration = kind === "explosion" ? 1.8 : 0.28;
    const source = trackNode(ctx.createBufferSource());
    source.buffer = noiseBuffer(ctx, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(kind === "explosion" ? 1800 : 3200, now);
    filter.frequency.exponentialRampToValueAtTime(kind === "explosion" ? 70 : 420, now + duration);
    source.connect(filter).connect(master);
    master.gain.exponentialRampToValueAtTime(kind === "explosion" ? 0.72 : 0.45, now + 0.008);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.start(now);
    source.stop(now + duration);
    return;
  }

  if (kind === "unlock") {
    [440, 660, 880].forEach((freq, index) => {
      const osc = trackNode(ctx.createOscillator());
      const gain = ctx.createGain();
      const start = now + index * 0.1;
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    return;
  }

  const hum = trackNode(ctx.createOscillator());
  const hum2 = trackNode(ctx.createOscillator());
  hum.type = "sawtooth";
  hum2.type = "sine";
  hum.frequency.value = 58;
  hum2.frequency.value = 116;
  hum.connect(master);
  hum2.connect(master);
  master.gain.exponentialRampToValueAtTime(0.07, now + 0.08);
  master.gain.setValueAtTime(0.07, now + 2.7);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 3);
  hum.start(now);
  hum2.start(now);
  hum.stop(now + 3);
  hum2.stop(now + 3);
}

document.querySelectorAll("[data-track]").forEach((button) => {
  button.addEventListener("click", async () => {
    const same = audio.src.endsWith(button.dataset.track) && !audio.paused;
    if (same) {
      audio.pause();
      button.textContent = "继续";
      return;
    }
    document.querySelectorAll("[data-track]").forEach((item) => { item.textContent = "试听"; });
    audio.src = button.dataset.track;
    audioNow.textContent = button.parentElement.querySelector("strong").textContent;
    audioPlayer.hidden = false;
    try {
      await audio.play();
      button.textContent = "暂停";
    } catch (err) {
      audioNow.textContent = "浏览器阻止了播放，请再次点击试听";
    }
  });
});

document.querySelectorAll("[data-sfx]").forEach((button) => {
  button.addEventListener("click", () => playSfx(button.dataset.sfx));
});

audio.addEventListener("ended", () => {
  document.querySelectorAll("[data-track]").forEach((item) => { item.textContent = "试听"; });
});

document.getElementById("stopAudio").addEventListener("click", () => {
  audio.pause();
  audio.currentTime = 0;
  document.querySelectorAll("[data-track]").forEach((item) => { item.textContent = "试听"; });
});

function stopAllAudio() {
  audio.pause();
  activeAudioNodes.forEach((node) => {
    try { node.stop(); } catch (err) { /* 已停止 */ }
  });
  activeAudioNodes.clear();
  if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
}

window.addEventListener("pagehide", stopAllAudio);

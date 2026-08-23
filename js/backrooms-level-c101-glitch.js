import * as THREE from "three";
import { enforceLevelEntry } from "./backrooms-level-pass.js";
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
const errorEl = document.getElementById("backroomsError");
const fps = createBackroomsFpsState({ player: { x: 0, z: 4, speed: 4.8 } });
const shapes = [];
const roomParts = [];
let scene;
let camera;
let renderer;
let roomHalf = 9;

function randomGeometry() {
  const type = Math.floor(Math.random() * 4);
  if (type === 0) return new THREE.BoxGeometry(1, 1, 1);
  if (type === 1) return new THREE.SphereGeometry(0.68, 10, 7);
  if (type === 2) return new THREE.ConeGeometry(0.72, 1.45, 7);
  return new THREE.TorusGeometry(0.62, 0.22, 7, 12);
}

function glitchMaterial(seed) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(seed % 1, 0.86, 0.48),
    emissive: new THREE.Color().setHSL((seed + 0.18) % 1, 0.74, 0.14),
    roughness: 0.42,
    metalness: 0.18,
  });
}

function addRoomPart(size, position) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    glitchMaterial(Math.random())
  );
  mesh.position.set(position[0], position[1], position[2]);
  scene.add(mesh);
  roomParts.push(mesh);
  return mesh;
}

function buildGlitchRoom() {
  addRoomPart([18, 0.3, 18], [0, -0.15, 0]);
  addRoomPart([18, 0.3, 18], [0, 6.15, 0]);
  addRoomPart([0.3, 6, 18], [-9, 3, 0]);
  addRoomPart([0.3, 6, 18], [9, 3, 0]);
  addRoomPart([18, 6, 0.3], [0, 3, -9]);
  addRoomPart([18, 6, 0.3], [0, 3, 9]);

  for (let i = 0; i < 28; i++) {
    const mesh = new THREE.Mesh(randomGeometry(), glitchMaterial(Math.random()));
    mesh.position.set(
      (Math.random() - 0.5) * 14,
      0.7 + Math.random() * 4.4,
      (Math.random() - 0.5) * 14
    );
    mesh.scale.setScalar(0.4 + Math.random() * 1.6);
    scene.add(mesh);
    shapes.push(mesh);
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const lightA = new THREE.PointLight(0xff0066, 2.1, 22);
  lightA.position.set(-4, 4.8, 0);
  scene.add(lightA);
  const lightB = new THREE.PointLight(0x00ccff, 2.1, 22);
  lightB.position.set(4, 2.2, 0);
  scene.add(lightB);
}

function mutateShapes(now) {
  const seconds = now * 0.001;
  roomHalf = 7.2 + (Math.sin(seconds * 0.71) + 1) * 2.1;
  for (let i = 0; i < roomParts.length; i++) {
    const part = roomParts[i];
    part.material.color.setHSL((seconds * 0.11 + i * 0.13) % 1, 0.82, 0.36);
    const pulse = 0.88 + Math.sin(seconds * (0.8 + i * 0.07)) * 0.14;
    if (i < 2) part.scale.set(roomHalf / 9, 1, roomHalf / 9);
    else if (i < 4) part.scale.set(1, pulse, roomHalf / 9);
    else part.scale.set(roomHalf / 9, pulse, 1);
  }
  for (let i = 0; i < shapes.length; i++) {
    const mesh = shapes[i];
    mesh.rotation.x += 0.006 + (i % 5) * 0.001;
    mesh.rotation.y -= 0.008 + (i % 7) * 0.001;
    const wave = 0.45 + (Math.sin(seconds * (1.2 + i * 0.03) + i) + 1) * 0.72;
    mesh.scale.set(
      wave,
      0.35 + ((Math.cos(seconds * 1.7 + i) + 1) * 0.85),
      0.45 + ((Math.sin(seconds * 0.9 + i * 2) + 1) * 0.7)
    );
    mesh.material.color.setHSL((seconds * 0.17 + i / shapes.length) % 1, 0.9, 0.5);
  }
}

function replaceRandomShape() {
  const mesh = shapes[Math.floor(Math.random() * shapes.length)];
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.geometry = randomGeometry();
  mesh.position.set(
    (Math.random() - 0.5) * (roomHalf * 1.45),
    0.5 + Math.random() * 5,
    (Math.random() - 0.5) * (roomHalf * 1.45)
  );
}

function resolveRoom(nextX, nextZ) {
  const edge = Math.max(5.8, roomHalf - fps.player.radius - 0.35);
  return {
    x: Math.max(-edge, Math.min(edge, nextX)),
    z: Math.max(-edge, Math.min(edge, nextZ)),
  };
}

function init() {
  if (!enforceLevelEntry("c101")) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060006);
  scene.fog = new THREE.FogExp2(0x160018, 0.045);
  camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.06, 80);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight, false);
  buildGlitchRoom();

  bindBackroomsFpsControls({
    canvas,
    inputEl,
    state: fps,
    onJump: function () {
      tryBackroomsJump(fps);
    },
  });
  inputEl.addEventListener("click", function () {
    if (inputEl.requestPointerLock) inputEl.requestPointerLock();
  });
  window.addEventListener("resize", function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  let nextShapeAt = 0;
  const clock = new THREE.Clock();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    moveBackroomsPlayer(fps, dt, 1, resolveRoom);
    updateBackroomsPlayerPhysics(fps, dt, { floorY: 0, ceilingY: 6 });
    mutateShapes(now);
    if (now >= nextShapeAt) {
      nextShapeAt = now + 260;
      replaceRandomShape();
    }
    applyBackroomsCamera(fps, camera);
    camera.rotation.z = Math.sin(now * 0.0013) * 0.045;
    camera.fov = 74 + Math.sin(now * 0.0021) * 7;
    camera.updateProjectionMatrix();
    syncBackroomsPointerLockBodyClass(fps);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

try {
  init();
} catch (error) {
  errorEl.hidden = false;
  errorEl.textContent = "空间重写失败：" + (error.message || error);
}

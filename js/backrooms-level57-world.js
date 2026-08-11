/**
 * Level 57 — 7×7 黄色房间 · 画作切出 · 画家 NPC
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

export const L57_ROOM_SIZE = 7;
export const L57_WALL_H = 3.2;
export const L57_SPAWN_YAW = Math.PI;

const PAINTER_GLB_URL = "models/painter-man.glb";
const WALL_T = 0.14;
const PAINTING_VARIANT_KEY = "backrooms_l57_painting_v1";

var _painterTemplate = null;
var _painterLoadStarted = false;
/** @type {((scene: THREE.Object3D | null) => void)[]} */
var _painterLoadPending = [];

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function pickMat(color, emissive) {
  return new THREE.MeshStandardMaterial({
    color: color,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.18 : 0,
    roughness: 0.9,
  });
}

function yellowWallpaperTexture() {
  var w = 128;
  var h = 128;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#c8b060";
  ctx.fillRect(0, 0, w, h);
  var y;
  for (y = 0; y < h; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "#b8a050" : "#d0bc68";
    ctx.fillRect(0, y, w, 4);
  }
  var x;
  for (x = 0; x < w; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? "#b0a048" : "transparent";
    ctx.fillRect(x, 0, 2, h);
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** 画框内的「黄色房间」场景 */
function yellowRoomPaintingTexture() {
  var w = 256;
  var h = 192;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#3a2818";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c9b058";
  ctx.fillRect(12, 12, w - 24, h - 24);
  var i;
  for (i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#b8a048" : "#d4c070";
    ctx.fillRect(12, 12 + i * 12, w - 24, 6);
  }
  ctx.fillStyle = "#8a7850";
  ctx.fillRect(w * 0.5 - 18, h * 0.62, 36, 4);
  ctx.fillStyle = "#6a5840";
  ctx.fillRect(w * 0.5 - 14, h * 0.66, 28, 22);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cavePaintingTexture() {
  var w = 256;
  var h = 192;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  var sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#111722");
  sky.addColorStop(1, "#050608");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#30343a";
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(48, 18);
  ctx.lineTo(82, 52);
  ctx.lineTo(128, 12);
  ctx.lineTo(178, 50);
  ctx.lineTo(220, 20);
  ctx.lineTo(w, 46);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.fill();
  ctx.fillStyle = "#22262b";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, 132);
  ctx.lineTo(44, 108);
  ctx.lineTo(86, 126);
  ctx.lineTo(126, 92);
  ctx.lineTo(172, 125);
  ctx.lineTo(220, 104);
  ctx.lineTo(w, 128);
  ctx.lineTo(w, h);
  ctx.fill();
  ctx.fillStyle = "#8292a0";
  ctx.fillRect(120, 82, 16, 54);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function isCavePaintingThisRun() {
  try {
    var saved = sessionStorage.getItem(PAINTING_VARIANT_KEY);
    if (saved === "cave") return true;
    if (saved === "yellow") return false;
    var cave = Math.random() < 0.4;
    sessionStorage.setItem(PAINTING_VARIANT_KEY, cave ? "cave" : "yellow");
    return cave;
  } catch (err) {
    return Math.random() < 0.4;
  }
}

function lambertMat(color, emissive) {
  return new THREE.MeshLambertMaterial({
    color: color,
    emissive: emissive || 0x000000,
  });
}

function buildProceduralPainter() {
  var group = new THREE.Group();
  group.name = "PainterFallback";

  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), lambertMat(0x3a3840));
  legL.position.set(-0.14, 0.425, 0);
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);

  var smock = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.78, 0.34), lambertMat(0xe8ece8));
  smock.position.y = 1.18;
  group.add(smock);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lambertMat(0xc89a6a, 0x100804));
  head.position.y = 1.72;
  group.add(head);

  var beret = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), lambertMat(0x8b2020, 0x200808));
  beret.position.y = 1.9;
  group.add(beret);

  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.16), lambertMat(0xe8ece8));
  armL.position.set(-0.38, 1.14, 0);
  group.add(armL);
  var armR = armL.clone();
  armR.position.x = 0.38;
  group.add(armR);

  var palette = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.06), lambertMat(0x6a5038, 0x100804));
  palette.position.set(0.42, 1.02, 0.18);
  palette.rotation.y = -0.35;
  group.add(palette);

  return group;
}

function preparePainterGlb(model) {
  model.traverse(function (child) {
    if (child.isSkinnedMesh || child.isMesh) {
      child.frustumCulled = false;
      if (child.isSkinnedMesh && child.skeleton) {
        child.skeleton.update();
      }
    }
  });
}

/** 将 Quaternius 模型缩放到 ~1.72m 并落足地面 */
function normalizePainterGlb(model) {
  preparePainterGlb(model);
  model.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 0.05) return false;
  model.scale.multiplyScalar(1.72 / size.y);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  return true;
}

function ensurePainterTemplate(onReady) {
  if (_painterTemplate) {
    onReady(_painterTemplate);
    return;
  }
  _painterLoadPending.push(onReady);
  if (_painterLoadStarted) return;
  _painterLoadStarted = true;
  var loader = new GLTFLoader();
  loader.load(
    PAINTER_GLB_URL,
    function (gltf) {
      _painterTemplate = gltf.scene;
      var pending = _painterLoadPending.slice();
      _painterLoadPending.length = 0;
      var i;
      for (i = 0; i < pending.length; i++) pending[i](_painterTemplate);
    },
    undefined,
    function () {
      var pending = _painterLoadPending.slice();
      _painterLoadPending.length = 0;
      var i;
      for (i = 0; i < pending.length; i++) pending[i](null);
    }
  );
}

function spawnPainter(parent, interactRoots, x, z, rotY) {
  var root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotY || 0;
  parent.add(root);

  var fallback = buildProceduralPainter();
  root.add(fallback);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.85, 0.9),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.92;
  pick.userData.brInteract = { kind: "l57_painter" };
  root.add(pick);
  interactRoots.push(pick);

  ensurePainterTemplate(function (template) {
    if (!template) return;
    if (template.parent) template.parent.remove(template);
    if (!normalizePainterGlb(template)) return;
    root.remove(fallback);
    root.add(template);
  });

  return root;
}

/**
 * @param {THREE.Group} root
 */
export function buildLevel57World(root) {
  var colliders = [];
  var interactRoots = [];
  var half = L57_ROOM_SIZE * 0.5;
  var roomMinZ = -half;
  var roomMaxZ = half;
  var cavePainting = isCavePaintingThisRun();

  var group = new THREE.Group();
  group.name = "Level57World";
  root.add(group);

  var wallTex = yellowWallpaperTexture();
  var wallMat = new THREE.MeshStandardMaterial({
    map: wallTex || undefined,
    color: 0xffffff,
    emissive: 0x332208,
    emissiveIntensity: 0.15,
    roughness: 0.88,
  });
  var floorMat = pickMat(0xc8b878, 0x181008);
  var ceilMat = pickMat(0xf0e8c8, 0x201810);
  var frameMat = pickMat(0x5a4030, 0x100804);

  function addBox(w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  addBox(L57_ROOM_SIZE, 0.12, L57_ROOM_SIZE, 0, 0.06, 0, floorMat);
  addBox(L57_ROOM_SIZE, 0.1, L57_ROOM_SIZE, 0, L57_WALL_H, 0, ceilMat);

  addBox(WALL_T, L57_WALL_H, L57_ROOM_SIZE, -half, L57_WALL_H * 0.5, 0, wallMat);
  colliders.push(wallCollider(-half - WALL_T, -half, roomMinZ, roomMaxZ));
  addBox(WALL_T, L57_WALL_H, L57_ROOM_SIZE, half, L57_WALL_H * 0.5, 0, wallMat);
  colliders.push(wallCollider(half, half + WALL_T, roomMinZ, roomMaxZ));
  addBox(L57_ROOM_SIZE, L57_WALL_H, WALL_T, 0, L57_WALL_H * 0.5, roomMinZ, wallMat);
  colliders.push(wallCollider(-half, half, roomMinZ - WALL_T, roomMinZ));
  addBox(L57_ROOM_SIZE, L57_WALL_H, WALL_T, 0, L57_WALL_H * 0.5, roomMaxZ, wallMat);
  colliders.push(wallCollider(-half, half, roomMaxZ, roomMaxZ + WALL_T));

  var paintingZ = roomMinZ + 0.08;
  var paintingY = 1.55;
  var paintTex = cavePainting ? cavePaintingTexture() : yellowRoomPaintingTexture();
  var frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.08), frameMat);
  frame.position.set(0, paintingY, paintingZ + 0.04);
  group.add(frame);
  var painting = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.95),
    new THREE.MeshStandardMaterial({
      map: paintTex || undefined,
      color: 0xffffff,
      roughness: 0.92,
      emissive: 0x221808,
      emissiveIntensity: 0.2,
    })
  );
  painting.position.set(0, paintingY, paintingZ + 0.09);
  group.add(painting);
  var paintPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.25, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  paintPick.position.set(0, paintingY, paintingZ + 0.35);
  paintPick.userData.brInteract = {
    kind: cavePainting ? "l57_cave_painting" : "l57_painting",
  };
  group.add(paintPick);
  interactRoots.push(paintPick);

  var paintLight = new THREE.PointLight(0xffddaa, 0.55, 4.5, 2);
  paintLight.position.set(0, 2.0, roomMinZ + 1.2);
  group.add(paintLight);

  var painterX = 0.6;
  var painterZ = -0.7;
  spawnPainter(group, interactRoots, painterX, painterZ, Math.PI);

  var amb = new THREE.AmbientLight(0xffeed8, 0.78);
  group.add(amb);
  var pl = new THREE.PointLight(0xffeecc, 0.95, 12, 1.5);
  pl.position.set(0, 2.5, 1.5);
  group.add(pl);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    spawnX: 0,
    spawnZ: 1.8,
    spawnYaw: L57_SPAWN_YAW,
    cavePainting: cavePainting,
  };
}

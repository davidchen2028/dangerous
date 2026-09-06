/**
 * Entity 81 轿厢内部：工业不锈钢 / 豪华金铜。
 */
import * as THREE from "three";
import {
  E81_BUTTON_KIND,
  E81_DOOR_KIND,
  E81_SCREEN_KIND,
} from "./backrooms-entity81-catalog.js";

const CABIN_W = 2.15;
const CABIN_D = 2.25;
const CABIN_H = 2.45;

function makeLabelTexture(text, luxury) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = luxury ? "#1c1810" : "#101214";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = luxury ? "#f0d48a" : "#9fd7a4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  var fontSize = text.length > 16 ? 18 : text.length > 10 ? 22 : 28;
  ctx.font = "bold " + fontSize + "px ui-monospace, monospace";
  ctx.fillText(text, 128, 64, 240);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function beansPoster() {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#241c14";
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#f4eee4";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("I ♥ BEANS", 128, 78);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getEntity81CabinBounds() {
  return {
    minX: -CABIN_W * 0.5 + 0.28,
    maxX: CABIN_W * 0.5 - 0.28,
    minZ: -CABIN_D * 0.5 + 0.28,
    maxZ: CABIN_D * 0.5 - 0.28,
    height: CABIN_H,
  };
}

export function resolveEntity81CabinCircle(x, z, radius) {
  var b = getEntity81CabinBounds();
  var nx = Math.max(b.minX + radius, Math.min(b.maxX - radius, x));
  var nz = Math.max(b.minZ + radius, Math.min(b.maxZ - radius, z));
  return { x: nx, z: nz };
}

export function buildEntity81Interior(buttons, theme) {
  var luxury = theme === "luxury";
  var root = new THREE.Group();
  root.name = "Entity81Cabin";
  var interactRoots = [];
  var wallMat = new THREE.MeshStandardMaterial({
    color: luxury ? 0xc9cfd8 : 0x8d959e,
    metalness: luxury ? 0.62 : 0.74,
    roughness: luxury ? 0.22 : 0.34,
  });
  var trimMat = new THREE.MeshStandardMaterial({
    color: luxury ? 0xb08a4a : 0x6a727a,
    metalness: 0.85,
    roughness: 0.2,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    color: luxury ? 0x2a2d33 : 0x151518,
    roughness: 0.9,
  });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: luxury ? 0xe8e4d8 : 0xc9ced3,
    roughness: 0.45,
  });

  var floor = new THREE.Mesh(new THREE.BoxGeometry(CABIN_W, 0.08, CABIN_D), floorMat);
  floor.position.y = 0.04;
  root.add(floor);
  var ceil = new THREE.Mesh(new THREE.BoxGeometry(CABIN_W, 0.06, CABIN_D), ceilMat);
  ceil.position.y = CABIN_H;
  root.add(ceil);

  var back = new THREE.Mesh(new THREE.BoxGeometry(CABIN_W, CABIN_H, 0.08), wallMat);
  back.position.set(0, CABIN_H * 0.5, -CABIN_D * 0.5);
  root.add(back);
  var left = new THREE.Mesh(new THREE.BoxGeometry(0.08, CABIN_H, CABIN_D), wallMat);
  left.position.set(-CABIN_W * 0.5, CABIN_H * 0.5, 0);
  root.add(left);
  var right = new THREE.Mesh(new THREE.BoxGeometry(0.08, CABIN_H, CABIN_D), wallMat);
  right.position.set(CABIN_W * 0.5, CABIN_H * 0.5, 0);
  root.add(right);

  var doorL = new THREE.Mesh(new THREE.BoxGeometry(CABIN_W * 0.48, CABIN_H - 0.2, 0.06), wallMat);
  doorL.position.set(-CABIN_W * 0.24, CABIN_H * 0.5 - 0.04, CABIN_D * 0.5 - 0.04);
  root.add(doorL);
  var doorR = new THREE.Mesh(new THREE.BoxGeometry(CABIN_W * 0.48, CABIN_H - 0.2, 0.06), wallMat);
  doorR.position.set(CABIN_W * 0.24, CABIN_H * 0.5 - 0.04, CABIN_D * 0.5 - 0.04);
  root.add(doorR);
  var doorPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.1, 0.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  doorPick.position.set(0, 1.2, CABIN_D * 0.5 - 0.12);
  doorPick.userData.brInteract = { kind: E81_DOOR_KIND };
  root.add(doorPick);
  interactRoots.push(doorPick);

  var railGeo = new THREE.CylinderGeometry(0.035, 0.035, CABIN_D - 0.4, 10);
  var railL = new THREE.Mesh(railGeo, trimMat);
  railL.rotation.x = Math.PI * 0.5;
  railL.position.set(-CABIN_W * 0.5 + 0.08, 0.98, 0);
  root.add(railL);
  var railR = railL.clone();
  railR.position.x = CABIN_W * 0.5 - 0.08;
  root.add(railR);

  var lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.05, 0.85),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: luxury ? 0xfff1d0 : 0xf4f7fb,
      emissiveIntensity: luxury ? 0.9 : 1.15,
    })
  );
  lamp.position.set(-0.38, CABIN_H - 0.08, 0);
  root.add(lamp);
  var lamp2 = lamp.clone();
  lamp2.position.x = 0.38;
  root.add(lamp2);

  if (!luxury) {
    var poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.34),
      new THREE.MeshBasicMaterial(beansPoster() ? { map: beansPoster() } : { color: 0x241c14 })
    );
    poster.position.set(-CABIN_W * 0.5 + 0.05, 1.95, -0.35);
    poster.rotation.y = Math.PI * 0.5;
    root.add(poster);
  }

  var screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.28, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x111318,
      emissive: luxury ? 0x3a2a10 : 0x102018,
      emissiveIntensity: 0.45,
    })
  );
  screen.position.set(-CABIN_W * 0.5 + 0.08, 1.72, 0.55);
  root.add(screen);
  var screenPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.36, 0.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  screenPick.position.copy(screen.position);
  screenPick.userData.brInteract = { kind: E81_SCREEN_KIND };
  root.add(screenPick);
  interactRoots.push(screenPick);

  var count = Math.max(4, Math.min(20, (buttons && buttons.length) || 0));
  var cols = count > 12 ? 4 : count > 8 ? 3 : 2;
  var rows = Math.ceil(count / cols);
  var i;
  for (i = 0; i < count; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    var labelMap = makeLabelTexture(buttons[i].expr, luxury);
    var btnMat = {
      color: 0x15180f,
      emissive: luxury ? 0x5a4318 : 0x1c3a22,
      emissiveIntensity: 0.7,
    };
    if (labelMap) btnMat.map = labelMap;
    var btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.16, 0.04),
      new THREE.MeshStandardMaterial(btnMat)
    );
    var py = 1.42 - row * 0.22;
    var pz = -0.15 + (col - (cols - 1) * 0.5) * 0.34;
    btn.position.set(-CABIN_W * 0.5 + 0.06, py, pz);
    btn.rotation.y = Math.PI * 0.5;
    root.add(btn);
    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.2, 0.32),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.set(-CABIN_W * 0.5 + 0.12, py, pz);
    pick.userData.brInteract = {
      kind: E81_BUTTON_KIND,
      index: i,
      number: buttons[i].number,
      expr: buttons[i].expr,
    };
    root.add(pick);
    interactRoots.push(pick);
  }

  var fill = new THREE.PointLight(luxury ? 0xffe4b5 : 0xe8eef4, luxury ? 4.2 : 5.4, 6, 2);
  fill.position.set(0, 2.05, 0);
  root.add(fill);
  root.add(new THREE.AmbientLight(luxury ? 0xfff1d6 : 0xdde4ea, 0.35));

  return {
    root: root,
    interactRoots: interactRoots,
    bounds: getEntity81CabinBounds(),
  };
}

/**
 * 宿主层门口：工业 / 豪华电梯召唤门。
 */
import * as THREE from "three";
import { E81_CALL_KIND, writeEntity81Origin } from "./backrooms-entity81-catalog.js";
import { grantLevelPass } from "./backrooms-level-pass.js";

var _poster = null;

function beansPosterTexture() {
  if (_poster) return _poster;
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a1510";
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = "#f3efe6";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("I ♥ BEANS", 128, 72);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#c9b89a";
  ctx.fillText("toast optional", 128, 108);
  _poster = new THREE.CanvasTexture(canvas);
  _poster.colorSpace = THREE.SRGBColorSpace;
  return _poster;
}

function themeMats(theme) {
  if (theme === "luxury") {
    return {
      frame: new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.82, roughness: 0.28 }),
      panel: new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.55, roughness: 0.22 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xd4b36a, metalness: 0.88, roughness: 0.18 }),
    };
  }
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x8b939c, metalness: 0.78, roughness: 0.32 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x6f777f, metalness: 0.7, roughness: 0.38 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xa8b0b8, metalness: 0.85, roughness: 0.22 }),
  };
}

/**
 * @param {{ theme?: string, x: number, z: number, y?: number, yaw?: number }} opts
 */
export function buildEntity81CallDoor(opts) {
  opts = opts || {};
  var mats = themeMats(opts.theme || "industrial");
  var group = new THREE.Group();
  group.name = "Entity81CallDoor";
  group.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
  group.rotation.y = opts.yaw || 0;

  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.85, 0.22), mats.frame);
  frame.position.y = 1.45;
  group.add(frame);
  var left = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.45, 0.08), mats.panel);
  left.position.set(-0.46, 1.35, 0.08);
  group.add(left);
  var right = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.45, 0.08), mats.panel);
  right.position.set(0.46, 1.35, 0.08);
  group.add(right);
  var rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 10), mats.rail);
  rail.rotation.z = Math.PI * 0.5;
  rail.position.set(0, 1.05, 0.16);
  group.add(rail);

  if (opts.theme !== "luxury") {
    var posterMap = beansPosterTexture();
    var poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.44),
      new THREE.MeshBasicMaterial(posterMap ? { map: posterMap } : { color: 0x1a1510 })
    );
    poster.position.set(-1.22, 2.15, 0.14);
    group.add(poster);
  }

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.7, 0.7),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 1.35, 0.28);
  pick.userData.brInteract = { kind: E81_CALL_KIND, originPass: opts.originPass };
  group.add(pick);

  var halfW = 1.08;
  var halfD = 0.28;
  var yaw = opts.yaw || 0;
  var ox = Math.sin(yaw) * 0.12;
  var oz = Math.cos(yaw) * 0.12;
  var collider = {
    minX: (opts.x || 0) + ox - halfW,
    maxX: (opts.x || 0) + ox + halfW,
    minZ: (opts.z || 0) + oz - halfD,
    maxZ: (opts.z || 0) + oz + halfD,
  };
  return { group: group, pick: pick, collider: collider };
}

export function enterEntity81Cabin(originPass, yaw) {
  writeEntity81Origin(originPass);
  grantLevelPass("e81", yaw);
  window.location.href = "backrooms-entity81.html";
}

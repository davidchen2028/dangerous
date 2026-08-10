/**
 * Level 3 — 迷宫中央通天电梯井（Canvas 工业纹理）
 */
import * as THREE from "three";
import { CELL, MAZE_W, MAZE_H } from "./backrooms-level3-world.js";

export const ELEVATOR_INTERACT_DIST = 2.55;
const SHAFT_W = 2.55;
const SHAFT_D = 2.55;
const SHAFT_H = 96;
const SHAFT_VISIBLE_H = 8.5;

function createElevatorShaftWallTexture() {
  var cw = 64;
  var ch = 256;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#4a525c";
  ctx.fillRect(0, 0, cw, ch);

  var y;
  for (y = 0; y < ch; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(0, y, cw, 2);
  }

  var n;
  for (n = 0; n < 900; n++) {
    var g = 70 + Math.floor(Math.random() * 35);
    ctx.fillStyle = "rgb(" + g + "," + (g + 2) + "," + (g + 6) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }

  for (y = 0; y < ch; y += 48) {
    ctx.fillStyle = "#2a3038";
    ctx.fillRect(0, y, cw, 3);
    var rx;
    for (rx = 6; rx < cw; rx += 14) {
      ctx.fillStyle = "#6a7078";
      ctx.beginPath();
      ctx.arc(rx, y + 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  var stripeY = ch - 56;
  while (stripeY > 0) {
    ctx.fillStyle = "#c8a020";
    ctx.fillRect(0, stripeY, cw, 10);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, stripeY + 10, cw, 10);
    stripeY -= 56;
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, SHAFT_VISIBLE_H / 2.2);
  tex.anisotropy = 4;
  return tex;
}

function createElevatorDoorTexture() {
  var cw = 128;
  var ch = 256;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#5c646e";
  ctx.fillRect(0, 0, cw, ch);

  var y;
  for (y = 0; y < ch; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(0, y, cw, 1);
  }

  ctx.fillStyle = "#3a4048";
  ctx.fillRect(cw * 0.5 - 2, 0, 4, ch);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(8, ch * 0.38, cw - 16, ch * 0.08);

  ctx.fillStyle = "#dde8f0";
  ctx.font = "bold 22px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("▲", cw * 0.5, ch * 0.44);

  ctx.fillStyle = "#8ab4d8";
  ctx.font = "600 14px Arial, Helvetica, sans-serif";
  ctx.fillText("LEVEL 4", cw * 0.5, ch * 0.52);

  ctx.fillStyle = "#2a3038";
  ctx.fillRect(cw * 0.5 - 14, ch * 0.58, 28, 36);
  ctx.fillStyle = "#88cc44";
  ctx.fillRect(cw * 0.5 - 10, ch * 0.62, 8, 8);
  ctx.fillStyle = "#cc4444";
  ctx.fillRect(cw * 0.5 + 2, ch * 0.62, 8, 8);

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createElevatorFloorTexture() {
  var size = 128;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#3d4650";
  ctx.fillRect(0, 0, size, size);

  var step = 16;
  var x;
  var y;
  for (y = 0; y < size; y += step) {
    for (x = 0; x < size; x += step) {
      ctx.strokeStyle = (x + y) % (step * 2) === 0 ? "#556070" : "#4a5560";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + step * 0.5, y);
      ctx.lineTo(x + step, y + step * 0.5);
      ctx.lineTo(x + step * 0.5, y + step);
      ctx.lineTo(x, y + step * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

export function getLevel3ElevatorWorldCenter() {
  var cx = Math.floor(MAZE_W * 0.5);
  var cz = Math.floor(MAZE_H * 0.5);
  return {
    x: (cx - MAZE_W * 0.5) * CELL,
    z: (cz - MAZE_H * 0.5) * CELL,
  };
}

/**
 * @param {THREE.Group} parent
 */
export function buildLevel3ElevatorShaft(parent) {
  var center = getLevel3ElevatorWorldCenter();
  var group = new THREE.Group();
  group.name = "L3ElevatorShaft";
  group.position.set(center.x, 0, center.z);

  var wallMap = createElevatorShaftWallTexture();
  var wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallMap || undefined,
    metalness: 0.62,
    roughness: 0.48,
    emissive: 0x1a2838,
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  if (!wallMap) wallMat.color.setHex(0x4a525c);

  var hw = SHAFT_W * 0.5;
  var hd = SHAFT_D * 0.5;
  var wallH = SHAFT_VISIBLE_H;

  function addShaftWall(w, h, x, y, z, rotY) {
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
  }

  addShaftWall(SHAFT_W, wallH, 0, wallH * 0.5, hd, Math.PI);
  addShaftWall(SHAFT_W, wallH, 0, wallH * 0.5, -hd, 0);
  addShaftWall(SHAFT_D, wallH, hw, wallH * 0.5, 0, -Math.PI * 0.5);
  addShaftWall(SHAFT_D, wallH, -hw, wallH * 0.5, 0, Math.PI * 0.5);

  var doorMap = createElevatorDoorTexture();
  var doorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: doorMap || undefined,
    metalness: 0.55,
    roughness: 0.42,
    emissive: 0x223344,
    emissiveIntensity: 0.18,
  });
  if (!doorMap) doorMat.color.setHex(0x5c646e);

  var doorH = 2.65;
  var doorW = SHAFT_W * 0.42;
  var doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
  doorMesh.position.set(-doorW * 0.5 - 0.02, doorH * 0.5 + 0.02, hd + 0.03);
  group.add(doorMesh);
  var doorMeshR = doorMesh.clone();
  doorMeshR.position.set(doorW * 0.5 + 0.02, doorH * 0.5 + 0.02, hd + 0.03);
  group.add(doorMeshR);

  var frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    metalness: 0.5,
    roughness: 0.55,
  });
  var frameTop = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W + 0.12, 0.1, 0.08), frameMat);
  frameTop.position.set(0, doorH + 0.06, hd + 0.04);
  group.add(frameTop);
  var frameL = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorH + 0.12, 0.08), frameMat);
  frameL.position.set(-SHAFT_W * 0.5 - 0.02, doorH * 0.5, hd + 0.04);
  group.add(frameL);
  var frameR = frameL.clone();
  frameR.position.x = SHAFT_W * 0.5 + 0.02;
  group.add(frameR);

  var floorMap = createElevatorFloorTexture();
  var pad = new THREE.Mesh(
    new THREE.BoxGeometry(SHAFT_W * 0.92, 0.1, SHAFT_D * 0.92),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorMap || undefined,
      metalness: 0.45,
      roughness: 0.55,
      emissive: 0x1a3040,
      emissiveIntensity: 0.35,
    })
  );
  if (!floorMap) pad.material.color.setHex(0x556070);
  pad.position.y = 0.05;
  group.add(pad);

  var ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.95, 32),
    new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.12;
  group.add(ring);

  var shaftGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(SHAFT_W * 0.35, SHAFT_W * 0.35, SHAFT_H, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  shaftGlow.position.y = SHAFT_H * 0.5;
  group.add(shaftGlow);

  var pl = new THREE.PointLight(0xc8e8ff, 1.05, 16, 1.5);
  pl.position.set(0, 2.6, 0);
  group.add(pl);
  var plDoor = new THREE.PointLight(0xaaccff, 0.65, 8, 1.8);
  plDoor.position.set(0, 2.2, hd - 0.2);
  group.add(plDoor);

  parent.add(group);

  return {
    group: group,
    x: center.x,
    z: center.z,
    interactDist: ELEVATOR_INTERACT_DIST,
  };
}

export function isNearLevel3Elevator(px, pz, shaft) {
  if (!shaft) return false;
  var dx = px - shaft.x;
  var dz = pz - shaft.z;
  return dx * dx + dz * dz <= shaft.interactDist * shaft.interactDist;
}

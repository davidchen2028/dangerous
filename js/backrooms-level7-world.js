/**
 * Level 7 — 无尽海面上的破木屋与栈道。
 */
import * as THREE from "three";
import {
  PLATFORM_SIZE,
  PLATFORM_HALF,
  PLATFORM_TOP_Y,
  WATER_SURFACE_Y,
} from "./backrooms-level7-layout.js";

export {
  PLATFORM_SIZE,
  PLATFORM_HALF,
  PLATFORM_TOP_Y,
  WATER_SURFACE_Y,
  L7_SPAWN,
  isOnLevel7Platform,
} from "./backrooms-level7-layout.js";

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}

function addWall(colliders, minX, maxX, minZ, maxZ) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  });
}

function makeMats() {
  return {
    water: new THREE.MeshStandardMaterial({
      color: 0x0c2c3c,
      roughness: 0.16,
      metalness: 0.28,
      transparent: true,
      opacity: 0.86,
      emissive: new THREE.Color(0x041820),
      emissiveIntensity: 0.08,
      depthWrite: false,
    }),
    deck: new THREE.MeshStandardMaterial({
      color: 0x6a5340,
      roughness: 0.92,
      metalness: 0.04,
    }),
    plank: new THREE.MeshStandardMaterial({
      color: 0x8a6d4f,
      roughness: 0.86,
      metalness: 0.03,
    }),
    wet: new THREE.MeshStandardMaterial({
      color: 0x4c3d32,
      roughness: 0.78,
      metalness: 0.08,
    }),
    rail: new THREE.MeshStandardMaterial({
      color: 0x5a4636,
      roughness: 0.9,
      metalness: 0.05,
    }),
    piling: new THREE.MeshStandardMaterial({
      color: 0x3a332c,
      roughness: 0.94,
      metalness: 0.06,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0x7a6550,
      roughness: 0.9,
      metalness: 0.02,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: 0x3f3730,
      roughness: 0.88,
      metalness: 0.08,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xffd27a,
      emissive: new THREE.Color(0xffc45a),
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0.1,
    }),
  };
}

function buildDeck(root, mats, colliders) {
  addBox(root, PLATFORM_SIZE, 0.5, PLATFORM_SIZE, 0, PLATFORM_TOP_Y - 0.29, 0, mats.deck);

  var i;
  var plankW = 0.92;
  for (i = -3; i <= 3; i++) {
    addBox(
      root,
      PLATFORM_SIZE - 0.12,
      0.05,
      plankW - 0.06,
      0,
      PLATFORM_TOP_Y + 0.01,
      i * plankW,
      i % 2 === 0 ? mats.plank : mats.wet
    );
  }

  var railH = 0.82;
  var railY = PLATFORM_TOP_Y + railH * 0.5;
  var edge = PLATFORM_HALF - 0.08;
  // 左右栏杆
  addBox(root, 0.1, railH, PLATFORM_SIZE - 0.2, -edge, railY, 0, mats.rail);
  addBox(root, 0.1, railH, PLATFORM_SIZE - 0.2, edge, railY, 0, mats.rail);
  addWall(colliders, -PLATFORM_HALF - 0.12, -PLATFORM_HALF + 0.16, -PLATFORM_HALF, PLATFORM_HALF);
  addWall(colliders, PLATFORM_HALF - 0.16, PLATFORM_HALF + 0.12, -PLATFORM_HALF, PLATFORM_HALF);
  // 靠屋一侧封死，楼梯只作来路标记
  addBox(root, 2.15, railH, 0.1, -2.28, railY, edge, mats.rail);
  addBox(root, 2.15, railH, 0.1, 2.28, railY, edge, mats.rail);
  addWall(colliders, -PLATFORM_HALF, PLATFORM_HALF, PLATFORM_HALF - 0.16, PLATFORM_HALF + 0.12);
  // 临海一侧：中间缺口可跳下
  addBox(root, 1.85, railH, 0.1, -2.42, railY, -edge, mats.rail);
  addBox(root, 1.85, railH, 0.1, 2.42, railY, -edge, mats.rail);
  addWall(colliders, -PLATFORM_HALF, -1.35, -PLATFORM_HALF - 0.12, -PLATFORM_HALF + 0.16);
  addWall(colliders, 1.35, PLATFORM_HALF, -PLATFORM_HALF - 0.12, -PLATFORM_HALF + 0.16);
}

function buildShack(root, mats, colliders) {
  var wallY = PLATFORM_TOP_Y + 1.15;
  addBox(root, 4.4, 2.3, 0.14, 0, wallY, 2.95, mats.wall);
  addBox(root, 0.14, 2.3, 2.35, -2.14, wallY, 1.85, mats.wall);
  addBox(root, 0.14, 2.3, 2.35, 2.14, wallY, 1.85, mats.wall);
  addWall(colliders, -2.28, 2.28, 2.82, 3.12);
  addWall(colliders, -2.28, -2.0, 0.68, 3.12);
  addWall(colliders, 2.0, 2.28, 0.68, 3.12);
  addBox(root, 4.5, 0.1, 2.5, 0, PLATFORM_TOP_Y + 2.36, 1.9, mats.roof);
  addBox(root, 1.15, 0.08, 0.42, 0, PLATFORM_TOP_Y + 2.55, 2.55, mats.wet);
  addBox(root, 1.15, 0.08, 0.42, 0, PLATFORM_TOP_Y + 2.68, 2.9, mats.wet);
  addBox(root, 1.15, 0.08, 0.42, 0, PLATFORM_TOP_Y + 2.82, 3.25, mats.wet);

  var s;
  for (s = 0; s < 5; s++) {
    addBox(
      root,
      1.05,
      0.09,
      0.34,
      0,
      PLATFORM_TOP_Y + 2.95 + s * 0.16,
      3.55 + s * 0.18,
      mats.deck
    );
  }
}

function buildPilings(root, mats) {
  var spots = [
    [-3.15, -3.15],
    [3.15, -3.15],
    [-3.15, 3.15],
    [3.15, 3.15],
    [0, -3.2],
  ];
  var i;
  var geo = new THREE.CylinderGeometry(0.16, 0.2, 4.4, 8);
  for (i = 0; i < spots.length; i++) {
    var piling = new THREE.Mesh(geo, mats.piling);
    piling.position.set(spots[i][0], -1.55, spots[i][1]);
    root.add(piling);
  }
}

function buildWater(root, mats, gfxLow) {
  var segs = gfxLow ? 10 : 28;
  var water = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, segs, segs), mats.water);
  water.rotation.x = -Math.PI * 0.5;
  water.position.y = WATER_SURFACE_Y;
  water.renderOrder = 2;
  water.name = "L7Water";
  root.add(water);
  return water;
}

function buildLights(root, mats, gfxLow) {
  root.add(new THREE.HemisphereLight(0x6a8294, 0x081018, 0.42));
  var moon = new THREE.DirectionalLight(0x9bb4c8, 0.28);
  moon.position.set(-16, 22, -10);
  root.add(moon);
  root.add(new THREE.AmbientLight(0x1a2834, 0.22));

  var lamp = addBox(root, 0.12, 0.16, 0.12, 0, PLATFORM_TOP_Y + 2.18, 1.85, mats.lamp);
  var bulb = new THREE.PointLight(0xffc878, gfxLow ? 0.55 : 0.95, 16, 2);
  bulb.position.set(0, PLATFORM_TOP_Y + 2.05, 1.85);
  root.add(bulb);
  return { lamp: lamp, bulb: bulb };
}

export function buildLevel7World(root, opts) {
  opts = opts || {};
  var gfxLow = !!opts.gfxLow;
  var colliders = opts.colliders || [];
  var mats = makeMats();

  buildDeck(root, mats, colliders);
  buildShack(root, mats, colliders);
  buildPilings(root, mats);
  var water = buildWater(root, mats, gfxLow);
  var lights = buildLights(root, mats, gfxLow);

  var bound = 46;
  addWall(colliders, -bound - 2, -bound, -bound, bound);
  addWall(colliders, bound, bound + 2, -bound, bound);
  addWall(colliders, -bound, bound, -bound - 2, -bound);
  addWall(colliders, -bound, bound, bound, bound + 2);

  return {
    water: water,
    waterMat: mats.water,
    lamp: lights.lamp,
    bulb: lights.bulb,
    gfxLow: gfxLow,
  };
}

export function updateLevel7Water(world, time) {
  if (!world || !world.water) return;
  var wave = Math.sin(time * 0.7) * 0.025;
  world.water.position.y = WATER_SURFACE_Y + wave;
  if (world.waterMat) {
    world.waterMat.emissiveIntensity = 0.05 + Math.sin(time * 0.55) * 0.03;
  }
  if (world.gfxLow) return;
  var pos = world.water.geometry.attributes.position;
  if (!pos) return;
  var i;
  var x;
  var y;
  for (i = 0; i < pos.count; i++) {
    x = pos.getX(i);
    y = pos.getY(i);
    pos.setZ(
      i,
      Math.sin(x * 0.11 + time * 1.05) * 0.1 + Math.sin(y * 0.08 + time * 0.82) * 0.07
    );
  }
  pos.needsUpdate = true;
  world.water.geometry.computeVertexNormals();
}

export function updateLevel7Lamp(world, time, sinkProgress) {
  if (!world || !world.bulb) return;
  var flicker =
    0.72 +
    Math.sin(time * 7.3) * 0.08 +
    Math.sin(time * 19.1) * 0.05 +
    (Math.sin(time * 2.1) > 0.92 ? -0.45 : 0);
  var dim = 1 - Math.min(1, Number(sinkProgress) || 0);
  var intensity = Math.max(0.04, flicker * dim);
  world.bulb.intensity = intensity;
  if (world.lamp && world.lamp.material) {
    world.lamp.material.emissiveIntensity = 0.35 + intensity * 1.2;
  }
}

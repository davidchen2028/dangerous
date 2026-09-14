/**
 * Level 81 — 赋闲结局：旧毛毯、画框、雨窗与疲倦台灯。
 */
import * as THREE from "three";
import { L81_WALL_H } from "./backrooms-level81-layout.js";

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function addWall(root, colliders, mat, x, z, w, d) {
  addBox(root, w, L81_WALL_H, d, x, L81_WALL_H * 0.5, z, mat);
  colliders.push({
    kind: "wall",
    minX: x - w * 0.5,
    maxX: x + w * 0.5,
    minZ: z - d * 0.5,
    maxZ: z + d * 0.5,
  });
}

function addPick(root, interactRoots, w, h, d, x, y, z, kind, extra) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = Object.assign({ kind: kind }, extra || {});
  root.add(pick);
  interactRoots.push(pick);
  return pick;
}

function paintingTexture(draw) {
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  var g = canvas.getContext("2d");
  draw(g, canvas.width, canvas.height);
  var tex = new THREE.CanvasTexture(canvas);
  if ("colorSpace" in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function drawWillow(g, w, h) {
  g.fillStyle = "#8aa08c";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#6b8a9a";
  g.fillRect(0, h * 0.72, w, h * 0.28);
  var i;
  for (i = 0; i < 14; i++) {
    g.strokeStyle = "rgba(40,70,48," + (0.35 + (i % 4) * 0.08) + ")";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(20 + i * 16, 8);
    g.quadraticCurveTo(28 + i * 16, h * 0.45, 12 + i * 14, h * 0.7);
    g.stroke();
  }
}

function drawSheep(g, w, h) {
  g.fillStyle = "#7d9460";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#c9d6a8";
  g.fillRect(0, 0, w, h * 0.38);
  var spots = [
    [40, 110],
    [90, 128],
    [150, 104],
    [200, 132],
    [118, 150],
  ];
  var i;
  for (i = 0; i < spots.length; i++) {
    g.fillStyle = "#efe6d4";
    g.beginPath();
    g.ellipse(spots[i][0], spots[i][1], 16, 11, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawFireflies(g, w, h) {
  g.fillStyle = "#1c2433";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#2d3a2f";
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(40, 90);
  g.lineTo(110, 118);
  g.lineTo(180, 70);
  g.lineTo(w, h);
  g.fill();
  var i;
  for (i = 0; i < 22; i++) {
    g.fillStyle = "rgba(255,220,120," + (0.35 + (i % 5) * 0.12) + ")";
    g.beginPath();
    g.arc(18 + ((i * 37) % (w - 24)), 40 + ((i * 19) % 90), 1.6 + (i % 3), 0, Math.PI * 2);
    g.fill();
  }
}

function drawLace(g, w, h) {
  g.fillStyle = "#e8d8c8";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(180,150,150,0.45)";
  g.lineWidth = 1;
  var x;
  var y;
  for (y = 10; y < h; y += 18) {
    for (x = 8; x < w; x += 18) {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.fillStyle = "#d7c2b4";
  g.beginPath();
  g.ellipse(w * 0.5, h * 0.58, 28, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#efe4da";
  g.beginPath();
  g.arc(w * 0.5, h * 0.32, 16, 0, Math.PI * 2);
  g.fill();
}

function makeMats() {
  return {
    floor: new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.94 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xeadcc8, roughness: 0.88 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf2e8d8, roughness: 0.9 }),
    carpetA: new THREE.MeshStandardMaterial({ color: 0xc49668, roughness: 0.96 }),
    carpetB: new THREE.MeshStandardMaterial({ color: 0xd8b488, roughness: 0.94 }),
    flower: new THREE.MeshStandardMaterial({
      color: 0xd8a0a8,
      emissive: new THREE.Color(0x4a2028),
      emissiveIntensity: 0.08,
      roughness: 0.86,
    }),
    blanket: new THREE.MeshStandardMaterial({ color: 0xe2c89a, roughness: 0.84 }),
    blanket2: new THREE.MeshStandardMaterial({ color: 0xa07255, roughness: 0.88 }),
    blanket3: new THREE.MeshStandardMaterial({ color: 0xf0e2bc, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4e36, roughness: 0.82 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x1a2430,
      emissive: new THREE.Color(0x0c1824),
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.55,
      roughness: 0.08,
      metalness: 0.18,
    }),
    night: new THREE.MeshStandardMaterial({
      color: 0x141c2c,
      emissive: new THREE.Color(0x243044),
      emissiveIntensity: 0.55,
      roughness: 1,
    }),
    city: new THREE.MeshStandardMaterial({
      color: 0x3a4250,
      emissive: new THREE.Color(0x6a4a22),
      emissiveIntensity: 0.42,
      roughness: 0.82,
    }),
    frameWood: new THREE.MeshStandardMaterial({ color: 0x6e5038, roughness: 0.78 }),
    moon: new THREE.MeshStandardMaterial({
      color: 0xf4ecd4,
      emissive: new THREE.Color(0xfff1c8),
      emissiveIntensity: 0.85,
      roughness: 0.4,
    }),
    rain: new THREE.MeshBasicMaterial({
      color: 0xc8d8e8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    lamp: new THREE.MeshStandardMaterial({
      color: 0xe8d2a0,
      emissive: new THREE.Color(0xffd89a),
      emissiveIntensity: 0.45,
      roughness: 0.55,
    }),
    brass: new THREE.MeshStandardMaterial({ color: 0x8a7040, roughness: 0.45, metalness: 0.35 }),
    lace: new THREE.MeshStandardMaterial({ color: 0xe6d4c8, roughness: 0.78 }),
    lemon: new THREE.MeshStandardMaterial({
      color: 0xd6c878,
      emissive: new THREE.Color(0x6a6020),
      emissiveIntensity: 0.12,
      roughness: 0.7,
    }),
  };
}

function hangPainting(root, interactRoots, mats, tex, x, y, z, rotY, kind) {
  var art = new THREE.Mesh(
    new THREE.PlaneGeometry(1.28, 0.92),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  art.position.set(x, y, z);
  art.rotation.y = rotY;
  root.add(art);
  addBox(
    root,
    1.42,
    1.06,
    0.05,
    x - Math.sin(rotY) * 0.04,
    y,
    z - Math.cos(rotY) * 0.04,
    mats.frame
  );
  addPick(root, interactRoots, 1.4, 1.05, 0.35, x, y, z, "l81_painting", { painting: kind });
}

function buildRoom(root, colliders, interactRoots, mats) {
  addBox(root, 12.4, 0.12, 13.4, 0, 0, 0, mats.floor);
  addBox(root, 12.4, 0.1, 13.4, 0, L81_WALL_H, 0, mats.ceiling);
  addWall(root, colliders, mats.wall, -6.2, 0, 0.22, 13.4);
  addWall(root, colliders, mats.wall, 6.2, 0, 0.22, 13.4);
  addWall(root, colliders, mats.wall, 0, 6.6, 12.4, 0.22);
  addWall(root, colliders, mats.wall, -3.7, -6.6, 5.0, 0.22);
  addWall(root, colliders, mats.wall, 3.7, -6.6, 5.0, 0.22);

  addBox(root, 5.8, 0.04, 5.8, 0, 0.08, 0, mats.carpetA);
  addBox(root, 3.8, 0.05, 3.8, 0, 0.1, 0, mats.carpetB);
  addBox(root, 2.2, 0.06, 2.2, 0, 0.12, 0, mats.carpetA);
  var fi;
  for (fi = 0; fi < 12; fi++) {
    var ang = (fi / 12) * Math.PI * 2;
    addBox(root, 0.18, 0.03, 0.18, Math.sin(ang) * 1.55, 0.145, Math.cos(ang) * 1.55, mats.flower);
  }

  addBox(root, 1.85, 0.18, 1.28, 0.06, 0.24, 0.1, mats.blanket);
  addBox(root, 1.48, 0.16, 1.05, -0.16, 0.38, -0.08, mats.blanket2);
  addBox(root, 1.18, 0.14, 0.9, 0.2, 0.5, 0.14, mats.blanket3);
  addBox(root, 0.72, 0.1, 0.55, -0.08, 0.6, 0.02, mats.blanket);
  addPick(root, interactRoots, 2.2, 1.7, 2.2, 0, 0.9, 0, "l81_sit");

  hangPainting(root, interactRoots, mats, paintingTexture(drawWillow), -6.02, 1.72, -1.6, Math.PI / 2, "willow");
  hangPainting(root, interactRoots, mats, paintingTexture(drawSheep), 6.02, 1.72, 0.4, -Math.PI / 2, "sheep");
  hangPainting(root, interactRoots, mats, paintingTexture(drawFireflies), -2.4, 1.78, 6.46, Math.PI, "fireflies");
  hangPainting(root, interactRoots, mats, paintingTexture(drawLace), 2.6, 1.7, 6.46, Math.PI, "lace");

  colliders.push({ kind: "wall", minX: -1.25, maxX: 1.25, minZ: -6.72, maxZ: -6.38 });
  addBox(root, 2.7, 2.15, 0.1, 0, 1.62, -6.52, mats.frameWood);
  addBox(root, 2.35, 1.85, 0.06, 0, 1.62, -6.48, mats.glass);
  addBox(root, 8.4, 3.2, 0.2, 0, 1.6, -7.4, mats.night);
  addBox(root, 1.4, 1.1, 0.4, -1.6, 0.7, -7.15, mats.city);
  addBox(root, 1.1, 1.6, 0.4, 0.2, 0.9, -7.2, mats.city);
  addBox(root, 1.3, 0.9, 0.4, 1.7, 0.55, -7.1, mats.city);
  addPick(root, interactRoots, 2.5, 2.0, 0.45, 0, 1.55, -6.25, "l81_window");

  addBox(root, 0.08, 1.15, 0.08, -2.15, 0.7, -5.55, mats.brass);
  addBox(root, 0.42, 0.18, 0.42, -2.15, 1.32, -5.55, mats.lamp);
  addPick(root, interactRoots, 0.55, 1.4, 0.55, -2.15, 0.85, -5.55, "l81_lamp");

  addBox(root, 0.55, 0.08, 0.55, 2.35, 0.46, 2.4, mats.wood);
  addBox(root, 0.08, 0.46, 0.08, 2.14, 0.23, 2.2, mats.wood);
  addBox(root, 0.08, 0.46, 0.08, 2.56, 0.23, 2.2, mats.wood);
  addBox(root, 0.08, 0.46, 0.08, 2.14, 0.23, 2.6, mats.wood);
  addBox(root, 0.08, 0.46, 0.08, 2.56, 0.23, 2.6, mats.wood);
  addBox(root, 0.18, 0.34, 0.12, 2.35, 0.64, 2.4, mats.lace);
  addBox(root, 0.12, 0.12, 0.1, 2.35, 0.86, 2.4, mats.lace);
  addPick(root, interactRoots, 0.7, 0.9, 0.7, 2.35, 0.5, 2.4, "l81_doll");

  addBox(root, 0.22, 0.08, 0.22, -1.7, 0.18, 2.15, mats.lemon);

  addBox(root, 1.05, 2.15, 0.08, 0, 1.1, 6.48, mats.wood);
  addPick(root, interactRoots, 1.2, 2.2, 0.35, 0, 1.1, 6.28, "l81_office");
}

function makeRain(root, mats) {
  var group = new THREE.Group();
  var streaks = [];
  var i;
  for (i = 0; i < 16; i++) {
    var drop = addBox(group, 0.012, 0.28 + Math.random() * 0.18, 0.012, -1 + Math.random() * 2, 0.4 + Math.random() * 2.4, -6.42, mats.rain);
    drop.userData.fall = 1.6 + Math.random() * 1.4;
    streaks.push(drop);
  }
  root.add(group);
  return streaks;
}

export function buildLevel81World(root, opts) {
  opts = opts || {};
  var gfxLow = !!opts.gfxLow;
  var colliders = opts.colliders || [];
  var interactRoots = opts.interactRoots || [];
  var mats = makeMats();

  buildRoom(root, colliders, interactRoots, mats);

  root.add(new THREE.HemisphereLight(0xfff1d4, 0x4a3828, 0.72));
  var moon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mats.moon);
  moon.position.set(-1.15, 2.85, -7.05);
  root.add(moon);
  var moonLight = new THREE.PointLight(0xd8e6ff, gfxLow ? 0.22 : 0.38, 10, 2);
  moon.add(moonLight);

  var lamp = new THREE.PointLight(0xffd9a0, gfxLow ? 0.95 : 1.35, 10, 1.6);
  lamp.position.set(-2.15, 1.42, -5.4);
  root.add(lamp);
  var warm = new THREE.PointLight(0xf6e6b8, gfxLow ? 0.45 : 0.7, 12, 1.8);
  warm.position.set(0, 2.35, 1.1);
  root.add(warm);

  return {
    lampLight: lamp,
    moon: moon,
    rain: makeRain(root, mats),
  };
}

export function updateLevel81World(world, time, restT, dt) {
  if (!world) return;
  var nod = 0.82 + Math.sin(time * 1.15) * 0.1;
  if (world.lampLight) world.lampLight.intensity = Math.max(0.28, nod);
  var u = Math.max(0, Math.min(1, Number(restT) || 0));
  if (world.moon) {
    world.moon.position.set(-1.15 + u * 2.55, 2.85 - u * 1.55, -7.05);
    world.moon.material.emissiveIntensity = 0.85 - u * 0.35;
  }
  var step = Number(dt);
  if (!Number.isFinite(step) || step <= 0) step = 0.016;
  var rain = world.rain;
  if (rain) {
    var i;
    for (i = 0; i < rain.length; i++) {
      rain[i].position.y -= rain[i].userData.fall * step;
      if (rain[i].position.y < 0.2) rain[i].position.y = 2.7;
    }
  }
}

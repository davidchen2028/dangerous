/**
 * Level C-1623 — 沥青路、虚空两端、路边出口与 Prismriver。
 */
import * as THREE from "three";
import { C1623_ROAD_HALF, C1623_ROAD_HALF_W, getC1623Segment } from "./backrooms-level-c1623-layout.js";

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
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

function signTexture(title, sub) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  var g = canvas.getContext("2d");
  g.fillStyle = "#1c1812";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#c9a25a";
  g.lineWidth = 10;
  g.strokeRect(12, 12, 488, 232);
  g.fillStyle = "#f3e2b0";
  g.font = "bold 42px sans-serif";
  g.textAlign = "center";
  g.fillText(title || "无出口", 256, 118);
  g.font = "28px sans-serif";
  g.fillStyle = "#b8a57a";
  g.fillText(sub || "", 256, 178);
  var tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function buildC1623World(root, opts) {
  opts = opts || {};
  var gfxLow = !!opts.gfxLow;
  var colliders = opts.colliders || [];
  var interactRoots = opts.interactRoots || [];
  var hw = C1623_ROAD_HALF_W;
  var hz = C1623_ROAD_HALF;

  var mats = {
    asphalt: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.96 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 1 }),
    voidMat: new THREE.MeshBasicMaterial({
      color: 0x173a7a,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 0.88 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.7 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x6a4036, roughness: 0.92 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x2f6a32, roughness: 0.85 }),
    fire: new THREE.MeshStandardMaterial({
      color: 0xff6a22,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 0.8,
    }),
    door: new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.8 }),
    doorShut: new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.9 }),
  };

  addBox(root, hw * 2, 0.14, hz * 2, 0, 0, 0, mats.asphalt);
  addBox(root, 18, 0.08, hz * 2, hw + 11, -0.02, 0, mats.grass);
  addBox(root, 18, 0.08, hz * 2, -hw - 11, -0.02, 0, mats.grass);

  colliders.push({ kind: "wall", minX: -hw - 0.35, maxX: -hw + 0.05, minZ: -hz, maxZ: hz });
  colliders.push({ kind: "wall", minX: hw - 0.05, maxX: hw + 0.35, minZ: -hz, maxZ: hz });

  var buildings = new THREE.Group();
  root.add(buildings);
  var b;
  for (b = 0; b < (gfxLow ? 6 : 10); b++) {
    var side = b % 2 === 0 ? 1 : -1;
    var z = -hz + 4.2 + b * 4.6;
    addBox(buildings, 3.2, 2.4 + (b % 3) * 0.55, 2.6, side * (hw + 3.4), 1.2, z, mats.brick);
  }

  var plants = new THREE.Group();
  plants.visible = false;
  root.add(plants);
  for (b = 0; b < 8; b++) {
    addBox(plants, 0.7, 1.8, 0.7, (b % 2 ? -1 : 1) * (hw + 1.6), 0.95, -10 + b * 2.8, mats.plant);
  }

  var fire = new THREE.Group();
  fire.visible = false;
  root.add(fire);
  for (b = 0; b < 5; b++) {
    addBox(fire, 1.1, 0.9 + b * 0.15, 1.1, -2 + b * 1.1, 0.55, -6 + b * 2.4, mats.fire);
  }

  var voidA = addBox(root, 22, 7.2, 0.08, 0, 3.2, hz, mats.voidMat);
  var voidB = addBox(root, 22, 7.2, 0.08, 0, 3.2, -hz, mats.voidMat);

  var doorA = addBox(root, 0.14, 2.25, 1.15, hw - 0.28, 1.2, 3.15, mats.door);
  var doorB = addBox(root, 0.14, 2.25, 1.15, hw - 0.28, 1.2, 5.35, mats.door);
  var signA = addBox(root, 0.04, 0.72, 1.28, hw - 0.42, 2.55, 3.15, mats.canvas);
  var signB = addBox(root, 0.04, 0.72, 1.28, hw - 0.42, 2.55, 5.35, mats.canvas);
  var pickA = addPick(root, interactRoots, 0.5, 2.4, 1.4, hw - 0.55, 1.2, 3.15, "c1623_exit", { slot: 0 });
  var pickB = addPick(root, interactRoots, 0.5, 2.4, 1.4, hw - 0.55, 1.2, 5.35, "c1623_exit", { slot: 1 });

  var base = new THREE.Group();
  root.add(base);
  addBox(base, 3.4, 2.05, 2.8, -1.1, 1.08, -4.2, mats.wood);
  addBox(base, 3.6, 0.08, 3.0, -1.1, 2.14, -4.2, mats.canvas);
  addPick(base, interactRoots, 3.6, 2.2, 3.0, -1.1, 1.1, -4.2, "c1623_base");
  var twin = addBox(base, 0.42, 1.62, 0.28, 1.15, 0.88, 6.4, mats.doorShut);
  addPick(base, interactRoots, 0.7, 1.8, 0.55, 1.15, 0.9, 6.4, "c1623_twin");
  var baseCollider = { kind: "wall", minX: -2.9, maxX: 0.75, minZ: -5.7, maxZ: -2.7 };

  function setBaseCollider(on) {
    var idx = colliders.indexOf(baseCollider);
    if (on && idx < 0) colliders.push(baseCollider);
    if (!on && idx >= 0) colliders.splice(idx, 1);
  }

  root.add(new THREE.HemisphereLight(0xc8d6e8, 0x2a2418, 0.62));
  var sun = new THREE.DirectionalLight(0xfff1d0, 0.85);
  sun.position.set(-8, 18, 6);
  root.add(sun);
  var voidGlow = new THREE.PointLight(0x3a78c8, 0.55, 28, 2);
  voidGlow.position.set(0, 3.4, 0);
  root.add(voidGlow);

  function setPickLive(mesh, live, data) {
    mesh.visible = !!live;
    if (live && data) mesh.userData.brInteract = data;
    else mesh.userData.brInteract = null;
  }

  function paintSign(mesh, door) {
    if (mesh.material && mesh.material.map) {
      mesh.material.map.dispose();
    }
    mesh.material = new THREE.MeshStandardMaterial({
      map: signTexture(door ? door.label : "无出口", door ? door.note || (door.open ? "按 Q 离开" : "出不去") : "三十切断了出口"),
      roughness: 0.7,
    });
  }

  function applySegment(index) {
    var seg = getC1623Segment(index);
    var d0 = seg.doors[0] || null;
    var d1 = seg.doors[1] || null;
    doorA.visible = !!d0;
    signA.visible = !!d0;
    doorB.visible = !!d1;
    signB.visible = !!d1;
    if (d0) {
      doorA.material = d0.open ? mats.door : mats.doorShut;
      paintSign(signA, d0);
    }
    if (d1) {
      doorB.material = d1.open ? mats.door : mats.doorShut;
      paintSign(signB, d1);
    }
    setPickLive(pickA, !!d0, d0 ? { kind: "c1623_exit", slot: 0, door: d0 } : null);
    setPickLive(pickB, !!d1, d1 ? { kind: "c1623_exit", slot: 1, door: d1 } : null);
    base.visible = seg.flavor === "prismriver";
    setBaseCollider(base.visible);
    plants.visible = seg.flavor === "plants";
    fire.visible = seg.flavor === "fire";
    voidA.material.color.setHex(seg.flavor === "fire" ? 0x6a2010 : 0x173a7a);
    voidB.material.color.setHex(seg.flavor === "fire" ? 0x6a2010 : 0x173a7a);
    return seg;
  }

  applySegment(0);

  return {
    applySegment: applySegment,
    buildings: buildings,
    voidGlow: voidGlow,
    twin: twin,
  };
}

export function updateC1623World(world, time) {
  if (!world || !world.voidGlow) return;
  world.voidGlow.intensity = 0.42 + Math.sin(time * 1.7) * 0.12;
  if (world.twin && world.twin.parent && world.twin.parent.visible) {
    world.twin.position.y = 0.88 + Math.sin(time * 2.2) * 0.03;
  }
}

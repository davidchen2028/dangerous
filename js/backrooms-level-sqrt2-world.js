/**
 * Level √2 — 青色纤维网、黄节点、随孪生素数节奏改写的坐标。
 */
import * as THREE from "three";
import {
  SQRT2_NODE_COUNT,
  SQRT2_RADIUS,
  sqrt2DoorPosFromNode,
  sqrt2NodeHome,
} from "./backrooms-level-sqrt2-layout.js";

function addPick(root, interactRoots, w, h, d, x, y, z, kind) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = { kind: kind };
  root.add(pick);
  interactRoots.push(pick);
  return pick;
}

function makeNodeMat(on) {
  return new THREE.MeshStandardMaterial({
    color: on ? 0xffe08a : 0x6a5a30,
    emissive: new THREE.Color(on ? 0xffcc55 : 0x221800),
    emissiveIntensity: on ? 1.15 : 0.18,
    roughness: 0.35,
  });
}

function makeFiberMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x3ad8d0,
    emissive: new THREE.Color(0x1aa8a4),
    emissiveIntensity: 0.55,
    roughness: 0.4,
    transparent: true,
    opacity: 0.82,
  });
}

function placeBetween(mesh, a, b) {
  var mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  var dist = a.distanceTo(b);
  mesh.position.copy(mid);
  mesh.scale.set(1, dist, 1);
  mesh.lookAt(b);
  mesh.rotateX(Math.PI / 2);
}

export function buildSqrt2World(root, opts) {
  opts = opts || {};
  var gfxLow = !!opts.gfxLow;
  var colliders = opts.colliders || [];
  var interactRoots = opts.interactRoots || [];

  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(SQRT2_RADIUS + 1.2, gfxLow ? 24 : 48),
    new THREE.MeshStandardMaterial({
      color: 0x071018,
      roughness: 1,
      metalness: 0.08,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  root.add(floor);

  colliders.push({
    kind: "wall",
    minX: -SQRT2_RADIUS - 0.6,
    maxX: SQRT2_RADIUS + 0.6,
    minZ: SQRT2_RADIUS - 0.2,
    maxZ: SQRT2_RADIUS + 0.8,
  });
  colliders.push({
    kind: "wall",
    minX: -SQRT2_RADIUS - 0.6,
    maxX: SQRT2_RADIUS + 0.6,
    minZ: -SQRT2_RADIUS - 0.8,
    maxZ: -SQRT2_RADIUS + 0.2,
  });
  colliders.push({
    kind: "wall",
    minX: SQRT2_RADIUS - 0.2,
    maxX: SQRT2_RADIUS + 0.8,
    minZ: -SQRT2_RADIUS - 0.6,
    maxZ: SQRT2_RADIUS + 0.6,
  });
  colliders.push({
    kind: "wall",
    minX: -SQRT2_RADIUS - 0.8,
    maxX: -SQRT2_RADIUS + 0.2,
    minZ: -SQRT2_RADIUS - 0.6,
    maxZ: SQRT2_RADIUS + 0.6,
  });

  var nodeGeo = new THREE.SphereGeometry(0.22, gfxLow ? 8 : 14, gfxLow ? 6 : 10);
  var fiberGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, gfxLow ? 5 : 8);
  var fiberMat = makeFiberMat();
  var nodes = [];
  var i;
  for (i = 0; i < SQRT2_NODE_COUNT; i++) {
    var on = i % 2 === 0;
    var mesh = new THREE.Mesh(nodeGeo, makeNodeMat(on));
    var home = sqrt2NodeHome(i);
    mesh.position.set(home.x, home.y, home.z);
    mesh.userData.on = on;
    mesh.userData.home = home;
    mesh.userData.target = { x: home.x, y: home.y, z: home.z };
    root.add(mesh);
    nodes.push(mesh);
  }

  var pairs = [];
  for (i = 1; i < SQRT2_NODE_COUNT; i++) pairs.push([0, i]);
  for (i = 1; i < SQRT2_NODE_COUNT - 1; i++) pairs.push([i, i + 1]);
  pairs.push([SQRT2_NODE_COUNT - 1, 1]);

  var fibers = [];
  for (i = 0; i < pairs.length; i++) {
    var fiber = new THREE.Mesh(fiberGeo, fiberMat);
    root.add(fiber);
    fibers.push({ mesh: fiber, a: pairs[i][0], b: pairs[i][1] });
  }

  var phi = new THREE.Group();
  var gold = new THREE.MeshStandardMaterial({
    color: 0xd4a84a,
    emissive: new THREE.Color(0xaa7a20),
    emissiveIntensity: 0.55,
    roughness: 0.32,
  });
  var arm;
  for (arm = 0; arm < 8; arm++) {
    var slab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.9 + arm * 0.12), gold);
    slab.position.set(Math.cos(arm * 0.7) * (0.3 + arm * 0.08), 0, Math.sin(arm * 0.7) * (0.3 + arm * 0.08));
    slab.rotation.y = arm * 0.7;
    phi.add(slab);
  }
  phi.position.set(4.2, 1.4, -2.1);
  root.add(phi);

  var door = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.2, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      emissive: new THREE.Color(0x102028),
      emissiveIntensity: 0.25,
      roughness: 0.85,
    })
  );
  root.add(door);
  var doorPick = addPick(root, interactRoots, 1.3, 2.3, 0.55, 0, 1.2, 0, "sqrt2_exit");

  function placeExitDoor(nodePos) {
    var pos = sqrt2DoorPosFromNode(nodePos);
    door.position.set(pos.x, 1.15, pos.z);
    door.lookAt(0, 1.15, 0);
    doorPick.position.copy(door.position);
    doorPick.rotation.copy(door.rotation);
  }
  placeExitDoor(nodes[nodes.length - 1].position);

  root.add(new THREE.HemisphereLight(0x4aa8b0, 0x04080c, 0.42));
  var core = new THREE.PointLight(0xffe08a, gfxLow ? 0.7 : 1.15, 16, 2);
  core.position.set(0, 1.4, 0);
  root.add(core);
  var wash = new THREE.PointLight(0x3ad8d0, gfxLow ? 0.25 : 0.4, 22, 2);
  wash.position.set(0, 3.2, 0);
  root.add(wash);

  function layoutFibers() {
    var f;
    for (f = 0; f < fibers.length; f++) {
      placeBetween(fibers[f].mesh, nodes[fibers[f].a].position, nodes[fibers[f].b].position);
    }
  }
  layoutFibers();

  return {
    nodes: nodes,
    fibers: fibers,
    layoutFibers: layoutFibers,
    phi: phi,
    door: door,
    doorPick: doorPick,
    placeExitDoor: placeExitDoor,
    core: core,
  };
}

export function retargetSqrt2Nodes(world, scale) {
  if (!world || !world.nodes) return;
  var i;
  for (i = 0; i < world.nodes.length; i++) {
    var home = sqrt2NodeHome(i, scale);
    world.nodes[i].userData.target = home;
  }
}

export function updateSqrt2World(world, dt, time, shifting) {
  if (!world) return;
  var i;
  var nodes = world.nodes;
  var lerp = shifting ? Math.min(1, dt * 1.8) : Math.min(1, dt * 3.2);
  for (i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var t = node.userData.target;
    node.position.x += (t.x - node.position.x) * lerp;
    node.position.y += (t.y - node.position.y) * lerp;
    node.position.z += (t.z - node.position.z) * lerp;
    var pulse = Math.sin(time * 8 + i) > 0;
    if (pulse !== node.userData.on) {
      node.userData.on = pulse;
      node.material.emissiveIntensity = pulse ? 1.15 : 0.18;
      node.material.color.setHex(pulse ? 0xffe08a : 0x6a5a30);
    }
  }
  world.layoutFibers();
  if (world.phi) {
    world.phi.rotation.y = time * 0.35;
    world.phi.position.x = Math.cos(time * 0.22) * 5.4;
    world.phi.position.z = Math.sin(time * 0.22) * 5.4;
    world.phi.position.y = 1.2 + Math.sin(time * 0.9) * 0.25;
  }
  if (world.door && nodes.length && world.placeExitDoor) {
    world.placeExitDoor(nodes[nodes.length - 1].position);
  }
  if (world.core) {
    world.core.intensity = 0.85 + Math.sin(time * 2.2) * 0.2;
  }
}

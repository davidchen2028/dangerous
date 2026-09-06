/**
 * Level 6「熄灯」——InstancedMesh 有限迷宫世界。
 */
import * as THREE from "three";
import {
  L6_CELL,
  L6_MAZE_H,
  L6_MAZE_W,
  L6_WALL_H,
  level6CellToWorld,
} from "./backrooms-level6-layout.js";

function makeBatch(geometry, material, transforms, name) {
  var mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, transforms.length));
  var dummy = new THREE.Object3D();
  for (var i = 0; i < transforms.length; i++) {
    var t = transforms[i];
    dummy.position.set(t.x, t.y, t.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = transforms.length;
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}

function invisiblePick(w, h, d, kind, position) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.copy(position);
  pick.userData.brInteract = { kind: kind };
  return pick;
}

function addFeatureModels(root, layout, mats, interactRoots) {
  var positions = {};
  var names = Object.keys(layout.features);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var cell = layout.features[name];
    var p = level6CellToWorld(layout, cell.x, cell.z);
    positions[name] = new THREE.Vector3(p.x, 0, p.z);
  }

  var l5 = positions.l5Door;
  var frame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.45, 0.14), mats.metal);
  frame.position.set(l5.x - L6_CELL * 0.42, 1.23, l5.z);
  frame.rotation.y = Math.PI * 0.5;
  frame.name = "L6ReturnDoorL5";
  root.add(frame);
  var l5Pick = invisiblePick(0.45, 2.5, 1.8, "l6_exit_l5", frame.position.clone());
  root.add(l5Pick);
  interactRoots.push(l5Pick);

  var stair = positions.l7Stair;
  for (var s = 0; s < 6; s++) {
    var step = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.42), mats.concrete);
    step.position.set(stair.x, 0.08 - s * 0.12, stair.z + 0.7 - s * 0.32);
    root.add(step);
  }
  var stairPick = invisiblePick(
    2.2,
    2,
    2.3,
    "l6_exit_l7",
    new THREE.Vector3(stair.x, 0.9, stair.z)
  );
  root.add(stairPick);
  interactRoots.push(stairPick);

  var wire = positions.wire;
  var cable = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.025, 5, 24, Math.PI),
    mats.wire
  );
  cable.rotation.x = -Math.PI * 0.5;
  cable.rotation.z = Math.PI * 0.5;
  cable.position.set(wire.x, 0.035, wire.z);
  cable.name = "L6TripWire";
  root.add(cable);

  var sw = positions.switchRoom;
  var switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.58, 0.08), mats.metal);
  switchPlate.position.set(sw.x + L6_CELL * 0.42, 1.35, sw.z);
  switchPlate.name = "L6DeadSwitch";
  root.add(switchPlate);
  var switchPick = invisiblePick(
    0.55,
    0.85,
    0.55,
    "l6_dead_switch",
    switchPlate.position.clone()
  );
  root.add(switchPick);
  interactRoots.push(switchPick);

  var iron = positions.ironDoor;
  var ironDoor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.72, 1.85), mats.iron);
  ironDoor.position.set(iron.x + L6_CELL * 0.42, 1.36, iron.z);
  ironDoor.name = "L6IronDoor129";
  root.add(ironDoor);
  var ironPick = invisiblePick(
    0.55,
    2.8,
    2,
    "l6_iron_door_129",
    ironDoor.position.clone()
  );
  root.add(ironPick);
  interactRoots.push(ironPick);

  return positions;
}

export function buildLevel6World(layout) {
  var root = new THREE.Group();
  root.name = "BackroomsLevel6";
  var mats = {
    concrete: new THREE.MeshStandardMaterial({
      color: 0x090a0c,
      roughness: 0.98,
      metalness: 0,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0x060709,
      roughness: 1,
      metalness: 0,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x111419,
      roughness: 0.72,
      metalness: 0.38,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: 0x151a20,
      roughness: 0.82,
      metalness: 0.52,
    }),
    wire: new THREE.MeshBasicMaterial({ color: 0x070707 }),
  };

  var walls = [];
  var floors = [];
  var ceilings = [];
  for (var z = 0; z < L6_MAZE_H; z++) {
    for (var x = 0; x < L6_MAZE_W; x++) {
      var p = level6CellToWorld(layout, x, z);
      if (layout.grid[z][x] === 1) {
        walls.push({ x: p.x, y: L6_WALL_H * 0.5, z: p.z });
      } else {
        floors.push({ x: p.x, y: -0.07, z: p.z });
        ceilings.push({ x: p.x, y: L6_WALL_H + 0.06, z: p.z });
      }
    }
  }

  root.add(
    makeBatch(
      new THREE.BoxGeometry(L6_CELL, L6_WALL_H, L6_CELL),
      mats.concrete,
      walls,
      "L6WallInstances"
    )
  );
  root.add(
    makeBatch(
      new THREE.BoxGeometry(L6_CELL, 0.14, L6_CELL),
      mats.floor,
      floors,
      "L6FloorInstances"
    )
  );
  root.add(
    makeBatch(
      new THREE.BoxGeometry(L6_CELL, 0.12, L6_CELL),
      mats.concrete,
      ceilings,
      "L6CeilingInstances"
    )
  );

  var interactRoots = [];
  var featurePositions = addFeatureModels(root, layout, mats, interactRoots);
  root.add(new THREE.AmbientLight(0x8090a0, 0.013));

  return {
    root: root,
    interactRoots: interactRoots,
    featurePositions: featurePositions,
    batchCounts: {
      walls: walls.length,
      floors: floors.length,
      ceilings: ceilings.length,
    },
    dispose: function () {
      root.traverse(function (obj) {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
      });
      Object.keys(mats).forEach(function (key) {
        mats[key].dispose();
      });
    },
  };
}

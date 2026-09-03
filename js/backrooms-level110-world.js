/**
 * Level 110 / C-24 — 环黑洞环形太空城（有限可玩弧段）。
 */
import * as THREE from "three";

export const L110_TUBE_HALF_W = 4.2;
export const L110_TUBE_LEN = 180;
export const L110_SPAWN = { x: 0, z: 10, yaw: 0 };

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(group, w, h, d, x, y, z, mat, colliders) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  group.add(mesh);
  if (colliders) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

function addInteract(group, list, kind, label, x, y, z, w, h, d, extra) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = Object.assign({ kind: kind, label: label }, extra || {});
  group.add(pick);
  list.push(pick);
  return pick;
}

function makeRupture(x, z, radius) {
  return {
    x: x,
    z: z,
    warnR: radius * 2.4,
    pullR: radius * 1.45,
    killR: radius * 0.7,
    radius: radius,
  };
}

/**
 * @param {THREE.Object3D} root
 */
export function buildLevel110World(root) {
  var group = new THREE.Group();
  group.name = "Level110World";
  root.add(group);

  var colliders = [];
  var interactRoots = [];
  var ruptures = [];
  var plasmaVents = [];

  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e28,
    roughness: 0.92,
    metalness: 0.25,
    emissive: 0x070a12,
    emissiveIntensity: 0.35,
  });
  var wallMat = new THREE.MeshStandardMaterial({
    color: 0x0c1018,
    roughness: 0.88,
    metalness: 0.4,
    emissive: 0x031018,
    emissiveIntensity: 0.22,
  });
  var accentMat = new THREE.MeshStandardMaterial({
    color: 0x1c3a55,
    emissive: 0x0a2840,
    emissiveIntensity: 0.55,
    roughness: 0.55,
    metalness: 0.6,
  });
  var frostMat = new THREE.MeshStandardMaterial({
    color: 0x6a90b8,
    emissive: 0x1a4060,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.55,
    roughness: 0.3,
  });

  addBox(group, L110_TUBE_HALF_W * 2, 0.18, L110_TUBE_LEN, 0, 0, L110_TUBE_LEN * 0.5, floorMat, null);
  addBox(group, L110_TUBE_HALF_W * 2, 0.12, L110_TUBE_LEN, 0, 4.6, L110_TUBE_LEN * 0.5, wallMat, null);

  var seg;
  for (seg = 0; seg < 9; seg++) {
    var z0 = seg * 20 + 10;
    var gap = seg === 2 || seg === 5 || seg === 7;
    if (!gap) {
      addBox(group, 0.28, 4.4, 18, -L110_TUBE_HALF_W, 2.2, z0, wallMat, colliders);
      addBox(group, 0.28, 4.4, 18, L110_TUBE_HALF_W, 2.2, z0, wallMat, colliders);
    } else {
      addBox(group, 0.28, 4.4, 6, -L110_TUBE_HALF_W, 2.2, z0 - 6, wallMat, colliders);
      addBox(group, 0.28, 4.4, 6, -L110_TUBE_HALF_W, 2.2, z0 + 6, wallMat, colliders);
      addBox(group, 0.28, 4.4, 6, L110_TUBE_HALF_W, 2.2, z0 - 6, wallMat, colliders);
      addBox(group, 0.28, 4.4, 6, L110_TUBE_HALF_W, 2.2, z0 + 6, wallMat, colliders);
      var frost = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), frostMat);
      frost.position.set(L110_TUBE_HALF_W - 0.02, 2, z0);
      frost.rotation.y = -Math.PI * 0.5;
      group.add(frost);
      ruptures.push(makeRupture(L110_TUBE_HALF_W - 0.4, z0, 1.35));
    }
  }

  addBox(group, L110_TUBE_HALF_W * 2 + 0.4, 4.6, 0.35, 0, 2.2, -0.2, wallMat, colliders);
  addBox(group, L110_TUBE_HALF_W * 2 + 0.4, 4.6, 0.35, 0, 2.2, L110_TUBE_LEN + 0.2, wallMat, colliders);

  // 区 1：气闸
  addBox(group, 3.2, 2.8, 0.4, 0, 1.5, 6, accentMat, colliders);
  var porthole = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a66aa })
  );
  porthole.position.set(0, 1.7, 6.22);
  group.add(porthole);
  addInteract(group, interactRoots, "l110_o2", "气闸补氧装置", -2.2, 1.2, 14, 1.2, 1.6, 1.0, {
    action: "refill_o2",
  });
  addBox(group, 1.0, 1.4, 0.8, -2.2, 0.7, 14, accentMat, colliders);

  // 区 2：废墟
  for (var r = 0; r < 5; r++) {
    var rx = ((r % 2) * 2 - 1) * 2.2;
    var rz = 48 + r * 10;
    addBox(group, 1.4 + (r % 3) * 0.3, 1.1 + (r % 2) * 0.8, 1.6, rx, 0.7, rz, wallMat, colliders);
  }
  addInteract(group, interactRoots, "l110_plasma", "失控等离子体喷口", 2.0, 1.3, 72, 1.4, 1.8, 1.4, {
    action: "plasma_vent",
  });
  plasmaVents.push({ x: 2.0, z: 72, charge: 0, firing: false, cool: 0 });
  addBox(group, 1.2, 1.6, 1.2, 2.0, 0.85, 72, frostMat, colliders);

  // 区 3：观测 / 返航
  var obsFloor = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.2, 28), floorMat);
  obsFloor.position.set(0, 0.12, 155);
  group.add(obsFloor);

  var blackHole = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  blackHole.position.set(0, 8, 195);
  blackHole.name = "L110BlackHole";
  group.add(blackHole);

  var disk = new THREE.Mesh(
    new THREE.TorusGeometry(12, 1.4, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0x2a7dff, transparent: true, opacity: 0.72 })
  );
  disk.position.set(0, 8, 195);
  disk.rotation.x = Math.PI * 0.55;
  disk.name = "L110AccretionDisk";
  group.add(disk);

  var disk2 = new THREE.Mesh(
    new THREE.TorusGeometry(16, 0.55, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.35 })
  );
  disk2.position.copy(disk.position);
  disk2.rotation.copy(disk.rotation);
  group.add(disk2);

  addInteract(group, interactRoots, "l110_return", "粒子对返航装置", 0, 1.4, 152, 2.2, 2.2, 2.2, {
    action: "particle_return",
  });
  var returnCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.85, 1),
    new THREE.MeshBasicMaterial({ color: 0xaad8ff, wireframe: true })
  );
  returnCore.position.set(0, 1.5, 152);
  returnCore.name = "L110ReturnDevice";
  group.add(returnCore);

  addBox(group, 8.2, 4.2, 0.35, 0, 2.1, 40, accentMat, null);
  addBox(group, 8.2, 4.2, 0.35, 0, 2.1, 110, accentMat, null);

  group.add(new THREE.AmbientLight(0x203048, 0.55));
  group.add(new THREE.HemisphereLight(0x3a6a9a, 0x05070c, 0.45));
  var diskLight = new THREE.PointLight(0x3a88ff, 1.6, 80, 2);
  diskLight.position.set(0, 6, 170);
  group.add(diskLight);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    ruptures: ruptures,
    plasmaVents: plasmaVents,
    zoneMarkers: {
      airlock: { minZ: 0, maxZ: 40 },
      ruins: { minZ: 40, maxZ: 110 },
      observatory: { minZ: 110, maxZ: L110_TUBE_LEN },
    },
    blackHole: blackHole,
    accretionDisk: disk,
    returnDevice: returnCore,
    spawnX: L110_SPAWN.x,
    spawnZ: L110_SPAWN.z,
    spawnYaw: L110_SPAWN.yaw,
    update: function (elapsed) {
      disk.rotation.z = elapsed * 0.15;
      disk2.rotation.z = -elapsed * 0.08;
      returnCore.rotation.y = elapsed * 0.7;
      returnCore.rotation.x = elapsed * 0.35;
      if (ruptures.length < 8 && elapsed > 25 + ruptures.length * 18) {
        var nz = 30 + Math.random() * 130;
        var nx = (Math.random() < 0.5 ? -1 : 1) * (L110_TUBE_HALF_W - 0.5);
        ruptures.push(makeRupture(nx, nz, 1.1 + Math.random() * 0.4));
      }
    },
  };
}

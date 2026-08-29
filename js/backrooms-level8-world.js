/**
 * Level 8 — 巨型洞穴 · 木板坠落点 · 银色管道
 */
import * as THREE from "three";

export const L8_WALL_H = 14;
export const L8_SPAWN_YAW = 0;

const CAVE_W = 54;
const CAVE_D = 72;
const PIPE_ROLL_KEY = "backrooms_l8_pipe_v1";

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function rockMat(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.98,
    metalness: 0.02,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function pipeAppearsThisRun() {
  try {
    var saved = sessionStorage.getItem(PIPE_ROLL_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
    var appears = Math.random() < 0.3;
    sessionStorage.setItem(PIPE_ROLL_KEY, appears ? "1" : "0");
    return appears;
  } catch (err) {
    return Math.random() < 0.3;
  }
}

function sharedDodecaGeo() {
  if (!_dodecaGeo) _dodecaGeo = new THREE.DodecahedronGeometry(1, 0);
  return _dodecaGeo;
}
var _dodecaGeo = null;
/** @type {Record<number, THREE.ConeGeometry>} */
var _coneGeos = Object.create(null);
var _plankBoxGeo = null;

function sharedConeGeo(radiusKey, height) {
  var key = radiusKey + ":" + height.toFixed(2);
  if (!_coneGeos[key]) {
    _coneGeos[key] = new THREE.ConeGeometry(0.45 + radiusKey * 0.13, height, 7);
  }
  return _coneGeos[key];
}

function addRock(parent, x, y, z, sx, sy, sz, mat, seed) {
  var rock = new THREE.Mesh(sharedDodecaGeo(), mat);
  rock.position.set(x, y, z);
  rock.scale.set(sx, sy, sz);
  rock.rotation.set(seed * 0.31, seed * 0.53, seed * 0.17);
  parent.add(rock);
  return rock;
}

function addStalactites(parent, mat) {
  var i;
  for (i = 0; i < 46; i++) {
    var x = -24 + ((i * 17) % 49);
    var z = -33 + ((i * 29) % 67);
    var h = 1.4 + ((i * 13) % 32) * 0.11;
    var cone = new THREE.Mesh(sharedConeGeo(i % 5, h), mat);
    cone.position.set(x, L8_WALL_H - h * 0.5 - 0.2, z);
    cone.rotation.z = Math.PI;
    parent.add(cone);
  }
}

function addBoundaryRocks(parent, colliders, mat) {
  var halfW = CAVE_W * 0.5;
  var halfD = CAVE_D * 0.5;
  var i;
  for (i = 0; i < 24; i++) {
    var z = -halfD + 1.5 + i * 3;
    addRock(parent, -halfW, 4.5, z, 4.2, 6 + (i % 3), 3.2, mat, i);
    addRock(parent, halfW, 4.8, z, 4.1, 6.5 + (i % 4), 3.4, mat, i + 31);
  }
  for (i = 0; i < 18; i++) {
    var x = -halfW + 1.5 + i * 3;
    addRock(parent, x, 4.5, -halfD, 3.4, 6 + (i % 4), 4.2, mat, i + 61);
    addRock(parent, x, 4.6, halfD, 3.5, 6.2 + (i % 3), 4.2, mat, i + 91);
  }
  colliders.push(wallCollider(-halfW - 3, -halfW + 0.5, -halfD, halfD));
  colliders.push(wallCollider(halfW - 0.5, halfW + 3, -halfD, halfD));
  colliders.push(wallCollider(-halfW, halfW, -halfD - 3, -halfD + 0.5));
  colliders.push(wallCollider(-halfW, halfW, halfD - 0.5, halfD + 3));
}

function addWoodenFallPlank(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8FallPlank";
  group.position.set(7, 0, 22);

  var pit = new THREE.Mesh(
    new THREE.CylinderGeometry(4.8, 3.4, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: 0x020204, roughness: 1 })
  );
  pit.position.y = 0.08;
  group.add(pit);

  var wood = new THREE.MeshStandardMaterial({
    color: 0x76522e,
    roughness: 0.92,
    emissive: 0x120904,
    emissiveIntensity: 0.12,
  });
  if (!_plankBoxGeo) _plankBoxGeo = new THREE.BoxGeometry(1.05, 0.16, 6.8);
  var i;
  for (i = -2; i <= 2; i++) {
    var plank = new THREE.Mesh(_plankBoxGeo, wood);
    plank.position.set(i * 1.03, 0.24 + Math.abs(i) * 0.015, 0);
    plank.rotation.y = i * 0.012;
    group.add(plank);
  }
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(5.7, 0.8, 7.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.5;
  pick.userData.brInteract = { kind: "l8_plank" };
  group.add(pick);
  interactRoots.push(pick);
  parent.add(group);
}

function addSilverPipe(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8SilverPipe";
  group.position.set(-15, 1.15, -14);
  group.rotation.y = Math.PI * 0.5;
  var silver = new THREE.MeshStandardMaterial({
    color: 0xc4ccd4,
    metalness: 0.88,
    roughness: 0.22,
    emissive: 0x17202a,
    emissiveIntensity: 0.18,
  });
  var pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 5.5, 18, 1, true),
    silver
  );
  pipe.rotation.x = Math.PI * 0.5;
  group.add(pipe);
  var rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.16, 8, 18), silver);
  rim.position.z = -2.72;
  group.add(rim);
  var darkness = new THREE.Mesh(
    new THREE.CircleGeometry(0.98, 18),
    new THREE.MeshBasicMaterial({ color: 0x020407 })
  );
  darkness.position.z = -2.75;
  group.add(darkness);
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 2.8, 2.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.z = -2.2;
  pick.userData.brInteract = { kind: "l8_silver_pipe" };
  group.add(pick);
  interactRoots.push(pick);
  parent.add(group);

  var glow = new THREE.PointLight(0xb8d8ff, 1.1, 9, 2);
  glow.position.set(-17.3, 1.5, -14);
  parent.add(glow);
}

function addLevel2Vent(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8Level2Vent";
  group.position.set(25.65, 1.35, 7);
  group.rotation.y = -Math.PI * 0.5;
  var frameMat = new THREE.MeshStandardMaterial({
    color: 0x52585e,
    metalness: 0.78,
    roughness: 0.48,
  });
  var darkMat = new THREE.MeshBasicMaterial({ color: 0x020305 });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.15, 0.22), frameMat);
  group.add(frame);
  var opening = new THREE.Mesh(new THREE.BoxGeometry(2.22, 1.68, 0.3), darkMat);
  opening.position.z = 0.08;
  opening.userData.brInteract = { kind: "l8_level2_vent" };
  group.add(opening);
  for (var i = -3; i <= 3; i++) {
    var bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.62, 0.12), frameMat);
    bar.position.set(i * 0.31, 0, 0.23);
    group.add(bar);
  }
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(2.55, 2.05, 0.7),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.z = 0.2;
  pick.userData.brInteract = { kind: "l8_level2_vent" };
  group.add(pick);
  interactRoots.push(pick);
  parent.add(group);
}

/** @param {THREE.Group} root */
export function buildLevel8World(root) {
  var colliders = [];
  var interactRoots = [];
  var group = new THREE.Group();
  group.name = "Level8World";
  root.add(group);

  var darkRock = rockMat(0x25272a);
  var midRock = rockMat(0x35383c);
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x191b1e,
    roughness: 1,
    flatShading: true,
  });
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(CAVE_W, CAVE_D, 18, 24), floorMat);
  floor.rotation.x = -Math.PI * 0.5;
  group.add(floor);
  var ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CAVE_W, CAVE_D), darkRock);
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = L8_WALL_H;
  group.add(ceiling);

  addBoundaryRocks(group, colliders, darkRock);
  addStalactites(group, midRock);

  var i;
  for (i = 0; i < 22; i++) {
    var x = -21 + ((i * 19) % 43);
    var z = -28 + ((i * 23) % 58);
    if (Math.hypot(x, z + 24) < 7 || Math.hypot(x - 7, z - 22) < 7) continue;
    addRock(group, x, 0.55, z, 0.7 + (i % 3) * 0.35, 0.6 + (i % 4) * 0.28, 0.8, midRock, i + 120);
  }

  addWoodenFallPlank(group, interactRoots);
  addLevel2Vent(group, interactRoots);
  var pipeVisible = pipeAppearsThisRun();
  if (pipeVisible) addSilverPipe(group, interactRoots);

  var ambient = new THREE.AmbientLight(0x59616c, 0.32);
  group.add(ambient);
  var hemi = new THREE.HemisphereLight(0x6a7480, 0x1a1410, 0.22);
  group.add(hemi);
  var entranceLight = new THREE.PointLight(0x9fb5ca, 1.5, 30, 2);
  entranceLight.position.set(0, 7, -27);
  group.add(entranceLight);
  var pitLight = new THREE.PointLight(0x604438, 0.75, 13, 2);
  pitLight.position.set(7, 2, 22);
  group.add(pitLight);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    spawnX: 0,
    spawnZ: -27,
    spawnYaw: L8_SPAWN_YAW,
    pipeVisible: pipeVisible,
    plankZone: { minX: 4.1, maxX: 9.9, minZ: 18.4, maxZ: 25.6 },
    lighting: {
      ambient: ambient,
      hemi: hemi,
      entranceLight: entranceLight,
      pitLight: pitLight,
      materials: {
        darkRock: darkRock,
        midRock: midRock,
        floor: floorMat,
      },
    },
  };
}

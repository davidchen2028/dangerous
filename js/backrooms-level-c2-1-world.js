/**
 * Ray Complex-2.1：失效验光机分出的五条衍射光路。
 */
import * as THREE from "three";

export const C21_PATH_CENTERS = [-10, -5, 0, 5, 10];
export const C21_PATH_HALF_WIDTH = 1.45;
export const C21_PATH_MIN_Z = -25;
export const C21_PATH_MAX_Z = 18;

const PATH_DEFS = [
  { kind: "c2_1_path_1", label: "2.1.1 · 悬空群山", color: 0xb86cff, action: "annihilate" },
  { kind: "c2_1_path_2", label: "2.1.2 · PPT", color: 0xff596f, action: "future", dest: "c666" },
  { kind: "c2_1_path_3", label: "2.1.3 · 缤纷色彩", color: 0xffd84d, action: "future", dest: "c5" },
  { kind: "c2_1_path_4", label: "2.1.4 · Merged-33.2", color: 0x45d9ff, action: "future", dest: "c33" },
  { kind: "c2_1_path_5", label: "2.1.5 · 逆向验光机", color: 0x8affbc, action: "return", dest: "c2" },
];

function addMountainSilhouette(group, x, color) {
  for (var i = 0; i < 5; i++) {
    var mountain = new THREE.Mesh(
      new THREE.ConeGeometry(1.4 + (i % 2) * 0.5, 2.8 + i * 0.35, 4),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.58 })
    );
    mountain.position.set(x + (i - 2) * 0.7, 1.2 + i * 0.12, C21_PATH_MIN_Z + 1.5);
    mountain.rotation.y = Math.PI / 4;
    group.add(mountain);
  }
}

function addEndpointSymbol(group, x, def) {
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.1, 8, 28),
    new THREE.MeshBasicMaterial({ color: def.color })
  );
  ring.position.set(x, 1.5, C21_PATH_MIN_Z + 1);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  var beam = new THREE.PointLight(def.color, 1.4, 9, 2);
  beam.position.set(x, 1.2, C21_PATH_MIN_Z + 2.5);
  group.add(beam);
}

/**
 * @param {THREE.Object3D} root
 */
export function buildLevelC21World(root) {
  var group = new THREE.Group();
  group.name = "RayComplex21World";
  root.add(group);
  var interactRoots = [];
  var pathMeshes = [];

  var voidFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 52),
    new THREE.MeshBasicMaterial({ color: 0x010208, side: THREE.DoubleSide })
  );
  voidFloor.rotation.x = -Math.PI / 2;
  voidFloor.position.set(0, -0.12, -3.5);
  group.add(voidFloor);

  // 偏振片前的横向选择台允许玩家先选择五条明纹；离开平台后才算踏入虚空。
  var selector = new THREE.Mesh(
    new THREE.PlaneGeometry(27, 6),
    new THREE.MeshBasicMaterial({ color: 0x18253c, side: THREE.DoubleSide })
  );
  selector.rotation.x = -Math.PI / 2;
  selector.position.set(0, -0.02, 15);
  group.add(selector);

  for (var i = 0; i < PATH_DEFS.length; i++) {
    var def = PATH_DEFS[i];
    var x = C21_PATH_CENTERS[i];
    var mat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    var path = new THREE.Mesh(
      new THREE.PlaneGeometry(C21_PATH_HALF_WIDTH * 2, C21_PATH_MAX_Z - C21_PATH_MIN_Z),
      mat
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(x, 0, (C21_PATH_MIN_Z + C21_PATH_MAX_Z) / 2);
    path.userData.rayPath = { phase: i * 1.7, material: mat };
    group.add(path);
    pathMeshes.push(path);

    var railMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.34 });
    for (var side = -1; side <= 1; side += 2) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 43), railMat);
      rail.position.set(x + side * C21_PATH_HALF_WIDTH, 0.05, -3.5);
      group.add(rail);
    }

    addEndpointSymbol(group, x, def);
    if (i === 0) addMountainSilhouette(group, x, def.color);

    var pick = new THREE.Mesh(
      new THREE.BoxGeometry(C21_PATH_HALF_WIDTH * 1.8, 3, 2.4),
      // DoubleSide 让玩家走进触发体后仍能从内部射中它；默认 FrontSide
      // 会在相机越过前表面后丢失 Q 交互。
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    pick.position.set(x, 1.5, C21_PATH_MIN_Z + 1.2);
    pick.userData.brInteract = {
      kind: def.kind,
      label: def.label,
      action: def.action,
      dest: def.dest || null,
    };
    group.add(pick);
    interactRoots.push(pick);
  }

  // 不可进入的天然光理论标记；不作为第六条可交互路径。
  var ci = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 })
  );
  ci.position.set(0, 4.5, -18);
  ci.name = "C21_CI_Theory_###";
  group.add(ci);

  // 出发端的失效偏振片。
  var polarizer = new THREE.Mesh(
    new THREE.BoxGeometry(27, 3.5, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x1b2530, metalness: 0.75, roughness: 0.28 })
  );
  polarizer.position.set(0, 1.75, C21_PATH_MAX_Z + 0.8);
  group.add(polarizer);
  group.add(new THREE.AmbientLight(0x273a55, 0.45));

  return {
    group: group,
    interactRoots: interactRoots,
    pathMeshes: pathMeshes,
    pathDefs: PATH_DEFS.map(function (def) { return Object.assign({}, def); }),
    spawnX: C21_PATH_CENTERS[4],
    spawnZ: C21_PATH_MAX_Z - 2,
    spawnYaw: 0,
    update: function (elapsed) {
      for (var p = 0; p < pathMeshes.length; p++) {
        var data = pathMeshes[p].userData.rayPath;
        data.material.opacity = 0.58 + Math.sin(elapsed * 2.1 + data.phase) * 0.13;
      }
      ci.rotation.x = elapsed * 0.13;
      ci.rotation.y = elapsed * 0.19;
    },
  };
}

export function isOnRayComplexPath(x) {
  for (var i = 0; i < C21_PATH_CENTERS.length; i++) {
    if (Math.abs(x - C21_PATH_CENTERS[i]) <= C21_PATH_HALF_WIDTH) return true;
  }
  return false;
}

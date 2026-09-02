/**
 * Level C-2「视 · 界」世界：灰白诊室、二维远景与失效验光机。
 */
import * as THREE from "three";

export const C2_WALL_HEIGHT = 3.2;

function collider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function material(color, emissive) {
  return new THREE.MeshStandardMaterial({
    color: color,
    emissive: emissive || 0,
    emissiveIntensity: emissive ? 0.28 : 0,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
}

function addBox(group, colliders, w, h, d, x, y, z, mat, solid) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  group.add(mesh);
  if (solid) colliders.push(collider(x - w / 2, x + w / 2, z - d / 2, z + d / 2));
  return mesh;
}

function addInteract(group, roots, kind, label, x, y, z, w, h, d) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = { kind: kind, label: label };
  group.add(pick);
  roots.push(pick);
  return pick;
}

function addHospital(group, colliders, roots, mats) {
  addBox(group, colliders, 10, 3.1, 0.35, -13, 1.55, -15, mats.white, true);
  addBox(group, colliders, 0.35, 3.1, 7, -18, 1.55, -11.7, mats.white, true);
  addBox(group, colliders, 0.35, 3.1, 7, -8, 1.55, -11.7, mats.white, true);
  addBox(group, colliders, 10, 0.15, 7, -13, 3.1, -11.7, mats.white, false);
  var machine = new THREE.Group();
  machine.position.set(-13, 0, -11.2);
  var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.45, 12), mats.metal);
  stand.position.y = 0.72;
  machine.add(stand);
  var lens = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 10, 24), mats.dark);
  lens.position.y = 1.75;
  lens.rotation.y = Math.PI / 2;
  machine.add(lens);
  var glow = new THREE.PointLight(0x77aaff, 1.1, 7, 2);
  glow.position.set(0, 1.75, 0);
  machine.add(glow);
  group.add(machine);
  addInteract(group, roots, "c2_phoropter", "失效的验光机", -13, 1.4, -11.2, 1.5, 2.5, 1.5);
}

function addFactory(group, colliders, mats) {
  addBox(group, colliders, 9, 2.8, 0.4, 14, 1.4, -11, mats.metal, true);
  addBox(group, colliders, 0.4, 2.8, 7, 9.7, 1.4, -7.7, mats.metal, true);
  for (var i = 0; i < 4; i++) {
    var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 10), mats.rust);
    pipe.position.set(11 + i * 2, 2.1, -9.8);
    group.add(pipe);
  }
}

function addFakeScenery(group, fakeMeshes, mats) {
  var sky = new THREE.Mesh(new THREE.PlaneGeometry(36, 13), mats.sky);
  sky.position.set(0, 5.5, -28);
  group.add(sky);
  fakeMeshes.push(sky);
  var field = new THREE.Mesh(new THREE.PlaneGeometry(36, 8), mats.corn);
  field.position.set(0, 1.8, -27.8);
  group.add(field);
  fakeMeshes.push(field);
  var colors = [0xff5566, 0xffcc55, 0x66aaff];
  for (var i = 0; i < 5; i++) {
    var balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.55 + (i % 2) * 0.2, 12, 8),
      material(colors[i % colors.length], colors[i % colors.length])
    );
    balloon.scale.y = 1.25;
    balloon.position.set(-12 + i * 6, 6 + (i % 2) * 1.1, -27.5);
    group.add(balloon);
    fakeMeshes.push(balloon);
  }
}

function addRedHouses(group, colliders, roots, mats) {
  // 左侧为无厚度虚影；右侧实体门会把人送回视界。
  var phantom = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), mats.red);
  phantom.position.set(-8, 1.7, 20);
  phantom.rotation.x = -Math.PI * 0.04;
  group.add(phantom);
  var house = new THREE.Group();
  house.position.set(8, 0, 20);
  var wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 0.35), mats.white);
  wall.position.y = 1.6;
  house.add(wall);
  colliders.push(collider(5.5, 10.5, 19.82, 20.18));
  var roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.4, 4), mats.red);
  roof.position.y = 3.7;
  roof.rotation.y = Math.PI / 4;
  house.add(roof);
  var door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.25, 0.18), mats.dark);
  door.position.set(0, 1.12, -0.28);
  house.add(door);
  group.add(house);
  addInteract(group, roots, "c2_red_house", "有厚度的红瓦房", 8, 1.2, 19.2, 2, 2.6, 2);
}

/**
 * @param {THREE.Object3D} root
 */
export function buildLevelC2World(root) {
  var group = new THREE.Group();
  group.name = "LevelC2World";
  root.add(group);
  var colliders = [];
  var interactRoots = [];
  var fakeMeshes = [];
  var mats = {
    floor: material(0xb9b9b3),
    white: material(0xd5d8d5),
    metal: material(0x687078, 0x101820),
    rust: material(0x8c5538),
    dark: material(0x181b20, 0x06080c),
    red: material(0xa83a32, 0x35100d),
    sky: material(0x78bde8, 0x18384c),
    corn: material(0xc8b949, 0x242008),
  };

  addBox(group, colliders, 48, 0.18, 54, 0, -0.09, 0, mats.floor, false);
  addBox(group, colliders, 0.4, C2_WALL_HEIGHT, 54, -24, C2_WALL_HEIGHT / 2, 0, mats.white, true);
  addBox(group, colliders, 0.4, C2_WALL_HEIGHT, 54, 24, C2_WALL_HEIGHT / 2, 0, mats.white, true);
  addBox(group, colliders, 48, C2_WALL_HEIGHT, 0.4, 0, C2_WALL_HEIGHT / 2, 27, mats.white, true);
  // 假景本身充当北侧“墙面”，只加隐形碰撞，防止玩家穿出地板。
  colliders.push(collider(-24, 24, -27.4, -26.7));
  // 路中路：两条窄墙让路径在中央交叠。
  addBox(group, colliders, 0.25, 2.1, 17, -3.2, 1.05, 4, mats.white, true);
  addBox(group, colliders, 0.25, 2.1, 17, 3.2, 1.05, -2, mats.white, true);

  addHospital(group, colliders, interactRoots, mats);
  addFactory(group, colliders, mats);
  addFakeScenery(group, fakeMeshes, mats);
  addRedHouses(group, colliders, interactRoots, mats);

  var hole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), mats.dark);
  hole.position.set(-23.76, 1.45, 7);
  hole.rotation.y = Math.PI / 2;
  group.add(hole);
  addInteract(group, interactRoots, "c2_peephole", "通往 C-1 的墙洞", -23.35, 1.45, 7, 1, 1.3, 1.3);

  group.add(new THREE.HemisphereLight(0xeaf5ff, 0x65645f, 0.9));
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(8, 15, 5);
  group.add(sun);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    fakeSceneryMeshes: fakeMeshes,
    spawnX: 0,
    spawnZ: 13,
    spawnYaw: 0,
  };
}

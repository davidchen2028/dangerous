import * as THREE from "three";

/** 轻量 M.E.G 人员模型，供不共享 Level 1 world 的前哨使用。 */
export function buildMegOutpostRecruiter(parent, x, z, label) {
  var group = new THREE.Group();
  group.name = label || "MegOutpostRecruiter";
  group.position.set(x, 0, z);
  group.userData.brInteract = { kind: "meg_npc", role: "recruiter_outpost" };

  var uniform = new THREE.MeshLambertMaterial({ color: 0x674a87, emissive: 0x120a20 });
  var skin = new THREE.MeshLambertMaterial({ color: 0xc89a6a, emissive: 0x100804 });
  var dark = new THREE.MeshLambertMaterial({ color: 0x18243a, emissive: 0x040610 });
  var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.82, 0.24), dark);
  legL.position.set(-0.14, 0.41, 0);
  group.add(legL);
  var legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.32), uniform);
  torso.position.y = 1.18;
  group.add(torso);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.31, 0.31), skin);
  head.position.y = 1.7;
  group.add(head);
  var armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), uniform);
  armL.position.set(-0.36, 1.17, 0);
  group.add(armL);
  var armR = armL.clone();
  armR.position.x = 0.36;
  group.add(armR);

  parent.add(group);
  return group;
}

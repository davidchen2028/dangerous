/**
 * Level 1.1-4 — 黑白死区（7×200）· 未证实的区域 5 光标
 */
import * as THREE from "three";
import {
  addWallSegment,
  createBlackDoorTexture,
} from "./backrooms-level1-1-world.js?v=2";
import { createFixedXiaoye } from "./backrooms-level2-xiaoye.js";

export const LEVEL1_1_4_CORRIDOR_LEN = 200;
export const LEVEL1_1_4_CORRIDOR_W = 7;
export const LEVEL1_1_4_WALL_H = 3.15;
export const LEVEL1_1_4_SPAWN_Z = 2.2;
export const LEVEL1_1_4_SPAWN_YAW = 0;
export const LEVEL1_1_4_SANITY_DRAIN = 5;

const DOOR_GAP_Z = 1.05;
const LIGHTHOUSE_Z = 196;
const XIAOYE_ZS = [40, 80, 120, 160, 185];

function createDarkWhiteMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xb8b8bc,
    emissive: 0x020204,
    emissiveIntensity: 0.06,
    roughness: 0.94,
  });
}

function buildLighthouse(parent, z) {
  var group = new THREE.Group();
  group.name = "Level1_1_5UnverifiedLight";
  group.position.set(0, 0, z);

  var stoneMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8dc,
    roughness: 0.88,
    emissive: 0x080808,
    emissiveIntensity: 0.12,
  });
  var railMat = new THREE.MeshStandardMaterial({
    color: 0x888890,
    metalness: 0.35,
    roughness: 0.55,
  });
  var lensMat = new THREE.MeshStandardMaterial({
    color: 0xffffee,
    emissive: 0xffcc66,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  var platform = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 0.18, 16), stoneMat);
  platform.position.y = 0.09;
  group.add(platform);

  var lens = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 12), lensMat);
  lens.position.y = 1.85;
  group.add(lens);

  for (var ri = 0; ri < 3; ri++) {
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.2 + ri * 0.48, 0.035, 5, 24),
      railMat
    );
    ring.position.y = 1.85;
    ring.rotation.x = ri === 1 ? Math.PI * 0.5 : ri === 2 ? Math.PI * 0.25 : 0;
    group.add(ring);
  }

  var beamPivot = new THREE.Group();
  beamPivot.position.y = 1.85;
  group.add(beamPivot);

  var beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 2.2, 14, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  beam.rotation.x = Math.PI * 0.5;
  beam.position.z = -7;
  beamPivot.add(beam);

  var glow = new THREE.PointLight(0xffdd88, 2.8, 48, 1.6);
  glow.position.set(0, 1.85, 0);
  group.add(glow);

  var halo = new THREE.PointLight(0xfff0cc, 0.55, 90, 1.8);
  halo.position.set(0, 2.1, 0);
  group.add(halo);

  parent.add(group);

  return {
    group: group,
    beamPivot: beamPivot,
    glow: glow,
    lensMat: lensMat,
    update: function (t) {
      beamPivot.rotation.y = t * 0.65;
      glow.intensity = 2.4 + Math.sin(t * 3.2) * 0.45;
      lensMat.emissiveIntensity = 1.1 + Math.sin(t * 4.1) * 0.35;
    },
  };
}

/** @param {THREE.Group} parent */
export function buildLevel1_1_4World(parent) {
  var halfW = LEVEL1_1_4_CORRIDOR_W * 0.5;
  var len = LEVEL1_1_4_CORRIDOR_LEN;
  var bh = LEVEL1_1_4_WALL_H;
  var wallT = 0.14;

  var group = new THREE.Group();
  group.name = "Level1_1_4World";
  group.visible = false;
  parent.add(group);

  var corridor = new THREE.Group();
  corridor.name = "Level1_1_4Corridor";
  group.add(corridor);

  var wallMat = createDarkWhiteMat();
  var floor = new THREE.Mesh(new THREE.BoxGeometry(LEVEL1_1_4_CORRIDOR_W, 0.12, len), wallMat);
  floor.position.set(0, 0.06, len * 0.5);
  corridor.add(floor);

  var ceil = new THREE.Mesh(new THREE.BoxGeometry(LEVEL1_1_4_CORRIDOR_W, 0.1, len), wallMat.clone());
  ceil.position.set(0, bh, len * 0.5);
  corridor.add(ceil);

  var colliders = [];
  addWallSegment(colliders, -halfW - wallT, -halfW + 0.06, 0, len, bh);
  addWallSegment(colliders, halfW - 0.06, halfW + wallT, 0, len, bh);

  var westWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, len), wallMat.clone());
  westWall.position.set(-halfW - wallT * 0.5, bh * 0.5, len * 0.5);
  corridor.add(westWall);
  var eastWall = westWall.clone();
  eastWall.position.x = halfW + wallT * 0.5;
  corridor.add(eastWall);

  var returnHalfGapZ = DOOR_GAP_Z * 0.5;
  var returnDoorTex = createBlackDoorTexture();
  var returnDoorMat = new THREE.MeshStandardMaterial({
    map: returnDoorTex || undefined,
    color: 0xffffff,
    emissive: 0x050505,
    emissiveIntensity: 0.1,
    roughness: 0.88,
  });
  var returnSegW = halfW - returnHalfGapZ;
  if (returnSegW > 0.2) {
    var returnWallL = new THREE.Mesh(new THREE.BoxGeometry(returnSegW, bh, wallT), wallMat.clone());
    returnWallL.position.set(-halfW + returnSegW * 0.5, bh * 0.5, -wallT * 0.5);
    corridor.add(returnWallL);
    var returnWallR = returnWallL.clone();
    returnWallR.position.x = halfW - returnSegW * 0.5;
    corridor.add(returnWallR);
  }
  var returnDoorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z, bh, wallT),
    [wallMat, wallMat, wallMat, wallMat, returnDoorMat, wallMat]
  );
  returnDoorFrame.position.set(0, bh * 0.5, -wallT * 0.5);
  corridor.add(returnDoorFrame);
  addWallSegment(colliders, -halfW, -returnHalfGapZ, -wallT, 0.02, bh);
  addWallSegment(colliders, returnHalfGapZ, halfW, -wallT, 0.02, bh);

  var amb = new THREE.HemisphereLight(0x888890, 0x101014, 0.38);
  corridor.add(amb);

  var lz;
  for (lz = 18; lz < len - 8; lz += 36) {
    var pl = new THREE.PointLight(0xb0b0b8, 0.16, 16, 2);
    pl.position.set(0, bh - 0.35, lz);
    corridor.add(pl);
  }

  var lighthouse = buildLighthouse(corridor, LIGHTHOUSE_Z);

  var endPad = new THREE.Mesh(new THREE.BoxGeometry(LEVEL1_1_4_CORRIDOR_W, 0.12, 6), wallMat.clone());
  endPad.position.set(0, 0.06, len - 3);
  corridor.add(endPad);

  addWallSegment(colliders, -halfW, halfW, len - 0.02, len + wallT, bh);

  var xiaoyes = [];
  var xiaoyeX = -halfW + 0.18;
  var i;
  for (i = 0; i < XIAOYE_ZS.length; i++) {
    xiaoyes.push(
      createFixedXiaoye(corridor, {
        x: xiaoyeX,
        z: XIAOYE_ZS[i],
        rotY: Math.PI * 0.5,
        faceW: 4,
        faceH: 5,
      })
    );
  }

  var corridor33ReturnTrigger = {
    minX: -returnHalfGapZ,
    maxX: returnHalfGapZ,
    minZ: -0.85,
    maxZ: 0.35,
  };

  var lighthouseReachTrigger = {
    minX: -2.8,
    maxX: 2.8,
    minZ: LIGHTHOUSE_Z - 2.5,
    maxZ: len + 0.5,
  };

  var animT = 0;

  return {
    group: group,
    corridor: corridor,
    colliders: colliders,
    xiaoyes: xiaoyes,
    lighthouse: lighthouse,
    corridor33ReturnTrigger: corridor33ReturnTrigger,
    lighthouseReachTrigger: lighthouseReachTrigger,
    lighthouseZ: LIGHTHOUSE_Z,
    corridorSpawn: { x: 0, z: LEVEL1_1_4_SPAWN_Z, yaw: LEVEL1_1_4_SPAWN_YAW },
    halfW: halfW,
    update: function (dt) {
      animT += dt;
      lighthouse.update(animT);
    },
    isAtLighthouse: function (px, pz) {
      return (
        px >= lighthouseReachTrigger.minX &&
        px <= lighthouseReachTrigger.maxX &&
        pz >= lighthouseReachTrigger.minZ &&
        pz <= lighthouseReachTrigger.maxZ
      );
    },
  };
}

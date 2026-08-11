/**
 * Level 1.1-2 — 纯白走廊（7×50，错误色差）· M.E.G 前哨 2
 */
import * as THREE from "three";
import { syncLevel1_1ChestEntryOpened } from "./backrooms-level1-1-chests.js";
import {
  addWallSegment,
  createBlackDoorTexture,
  ensureChestTemplate,
  spawnFixedChest,
  sharedWhiteCeilMat,
  sharedWhiteFloorMat,
  sharedWhiteWallMat,
} from "./backrooms-level1-1-world.js";

export const LEVEL1_1_2_CORRIDOR_LEN = 50;
export const LEVEL1_1_2_CORRIDOR_W = 7;
export const LEVEL1_1_2_WALL_H = 3.15;
export const LEVEL1_1_2_SPAWN_Z = 2.2;
export const LEVEL1_1_2_SPAWN_YAW = 0;

const DOOR_GAP_Z = 1.05;
const CHEST_Z = 35;
const OUTPOST_DOOR_Z = 45;

function createGlitchTintMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x000000,
    emissiveIntensity: 0.45,
    roughness: 0.88,
  });
}

function createChromaGhostMat(hex, opacity) {
  return new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * @param {THREE.Group} parent
 * @param {{ horror?: object, onChest?: (e: object) => void }} opts
 */
export function buildLevel1_1_2World(parent, opts) {
  opts = opts || {};
  var halfW = LEVEL1_1_2_CORRIDOR_W * 0.5;
  var len = LEVEL1_1_2_CORRIDOR_LEN;
  var bh = LEVEL1_1_2_WALL_H;
  var wallT = 0.14;

  var group = new THREE.Group();
  group.name = "Level1_1_2World";
  group.visible = false;
  parent.add(group);

  var corridor = new THREE.Group();
  corridor.name = "Level1_1_2Corridor";
  group.add(corridor);

  var glitchMats = [];
  var chromaMeshes = [];
  var glitchT = 0;

  function trackGlitchMat(mat) {
    glitchMats.push(mat);
    return mat;
  }

  function addChromaGhost(w, h, x, y, z, rotY, hex, opacity) {
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createChromaGhostMat(hex, opacity));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.renderOrder = 1;
    corridor.add(mesh);
    chromaMeshes.push({ mesh: mesh, baseX: x, baseZ: z, rotY: rotY, hex: hex });
    return mesh;
  }

  var floorMat = trackGlitchMat(sharedWhiteFloorMat().clone());
  var floor = new THREE.Mesh(new THREE.BoxGeometry(LEVEL1_1_2_CORRIDOR_W, 0.12, len), floorMat);
  floor.position.set(0, 0.06, len * 0.5);
  corridor.add(floor);

  var ceilMat = trackGlitchMat(sharedWhiteCeilMat().clone());
  var ceil = new THREE.Mesh(new THREE.BoxGeometry(LEVEL1_1_2_CORRIDOR_W, 0.1, len), ceilMat);
  ceil.position.set(0, bh, len * 0.5);
  corridor.add(ceil);

  var colliders = [];
  var wallMat = trackGlitchMat(createGlitchTintMat());

  addWallSegment(colliders, -halfW - wallT, -halfW + 0.06, 0, len, bh);
  addChromaGhost(0.08, bh, -halfW - 0.02, bh * 0.5, len * 0.5, Math.PI * 0.5, 0xff00aa, 0.22);
  addChromaGhost(0.08, bh, -halfW + 0.04, bh * 0.5, len * 0.5, Math.PI * 0.5, 0x00ff66, 0.18);

  var outpostDoorZ = OUTPOST_DOOR_Z;
  var doorHalfGapZ = DOOR_GAP_Z * 0.5;
  var doorSegLenN = outpostDoorZ - doorHalfGapZ;
  var doorSegLenS = len - (outpostDoorZ + doorHalfGapZ);

  if (doorSegLenN > 0.2) {
    addWallSegment(colliders, halfW - 0.06, halfW + wallT, 0, doorSegLenN, bh);
  }
  if (doorSegLenS > 0.2) {
    addWallSegment(colliders, halfW - 0.06, halfW + wallT, outpostDoorZ + doorHalfGapZ, len, bh);
  }
  addChromaGhost(0.08, bh, halfW + 0.02, bh * 0.5, len * 0.42, -Math.PI * 0.5, 0xff00aa, 0.24);
  addChromaGhost(0.08, bh, halfW - 0.04, bh * 0.5, len * 0.58, -Math.PI * 0.5, 0x00ff66, 0.2);

  var westWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, len), wallMat);
  westWall.position.set(-halfW - wallT * 0.5, bh * 0.5, len * 0.5);
  corridor.add(westWall);

  if (doorSegLenN > 0.2) {
    var segN = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, doorSegLenN), wallMat.clone());
    trackGlitchMat(segN.material);
    segN.position.set(halfW + wallT * 0.5, bh * 0.5, doorSegLenN * 0.5);
    corridor.add(segN);
  }
  if (doorSegLenS > 0.2) {
    var segS = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, doorSegLenS), wallMat.clone());
    trackGlitchMat(segS.material);
    segS.position.set(halfW + wallT * 0.5, bh * 0.5, outpostDoorZ + doorHalfGapZ + doorSegLenS * 0.5);
    corridor.add(segS);
  }

  var doorTex = createBlackDoorTexture();
  var returnHalfGapZ = DOOR_GAP_Z * 0.5;
  var returnDoorMat = new THREE.MeshStandardMaterial({
    map: doorTex || undefined,
    color: 0xffffff,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
    roughness: 0.88,
  });

  var returnSegW = halfW - returnHalfGapZ;
  if (returnSegW > 0.2) {
    var returnWallL = new THREE.Mesh(
      new THREE.BoxGeometry(returnSegW, bh, wallT),
      trackGlitchMat(wallMat.clone())
    );
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

  var corridor23HalfGapZ = DOOR_GAP_Z * 0.5;
  var corridor23DoorZ = len;
  addWallSegment(colliders, -halfW, -corridor23HalfGapZ, len - 0.02, len + wallT, bh);
  addWallSegment(colliders, corridor23HalfGapZ, halfW, len - 0.02, len + wallT, bh);

  var corridor23DoorTex = createBlackDoorTexture();
  var corridor23DoorMat = new THREE.MeshStandardMaterial({
    map: corridor23DoorTex || undefined,
    color: 0xffffff,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
    roughness: 0.88,
  });
  var corridor23SegW = halfW - corridor23HalfGapZ;
  if (corridor23SegW > 0.2) {
    var corridor23WallL = new THREE.Mesh(
      new THREE.BoxGeometry(corridor23SegW, bh, wallT),
      trackGlitchMat(wallMat.clone())
    );
    corridor23WallL.position.set(-halfW + corridor23SegW * 0.5, bh * 0.5, corridor23DoorZ + wallT * 0.5);
    corridor.add(corridor23WallL);
    var corridor23WallR = corridor23WallL.clone();
    corridor23WallR.position.x = halfW - corridor23SegW * 0.5;
    corridor.add(corridor23WallR);
  }
  var corridor23DoorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z, bh, wallT),
    [wallMat, wallMat, wallMat, wallMat, wallMat, corridor23DoorMat]
  );
  corridor23DoorFrame.position.set(0, bh * 0.5, corridor23DoorZ + wallT * 0.5);
  corridor.add(corridor23DoorFrame);

  var corridor23DoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.2, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  corridor23DoorPick.userData.brInteract = { kind: "level1_1_23_door" };
  corridor23DoorPick.position.set(0, 1.1, corridor23DoorZ - 0.35);
  corridor.add(corridor23DoorPick);

  var corridor23DoorState = {
    open: false,
    opening: false,
    t: 0,
    openDur: 0.85,
    pickMesh: corridor23DoorPick,
    interactX: 0,
    interactZ: corridor23DoorZ - 0.55,
    interactDist: 2.8,
    doorGapCollider: {
      kind: "wall",
      minX: -corridor23HalfGapZ,
      maxX: corridor23HalfGapZ,
      minZ: corridor23DoorZ - 0.02,
      maxZ: corridor23DoorZ + wallT,
      minY: 0,
      maxY: bh,
      level1_1_23DoorBlock: true,
    },
    doorPanel: null,
    endCapCollider: null,
  };
  var corridor23DoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z * 0.92, bh * 0.82, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 })
  );
  corridor23DoorPanel.position.set(0, bh * 0.41, corridor23DoorZ - 0.04);
  corridor.add(corridor23DoorPanel);
  corridor23DoorState.doorPanel = corridor23DoorPanel;
  colliders.push(corridor23DoorState.doorGapCollider);

  var corridor23EndCap = {
    kind: "wall",
    minX: -halfW,
    maxX: halfW,
    minZ: corridor23DoorZ - 0.02,
    maxZ: corridor23DoorZ + wallT,
    minY: 0,
    maxY: bh,
    level1_1_23EndCap: true,
  };
  corridor23DoorState.endCapCollider = corridor23EndCap;
  colliders.push(corridor23EndCap);

  var corridor23SignCanvas = document.createElement("canvas");
  corridor23SignCanvas.width = 256;
  corridor23SignCanvas.height = 64;
  var corridor23SignCtx = corridor23SignCanvas.getContext("2d");
  if (corridor23SignCtx) {
    corridor23SignCtx.fillStyle = "#eef2ff";
    corridor23SignCtx.fillRect(0, 0, 256, 64);
    corridor23SignCtx.fillStyle = "#2244aa";
    corridor23SignCtx.font = "bold 28px sans-serif";
    corridor23SignCtx.textAlign = "center";
    corridor23SignCtx.textBaseline = "middle";
    corridor23SignCtx.fillText("→ L1.1-3", 128, 32);
    var corridor23SignTex = new THREE.CanvasTexture(corridor23SignCanvas);
    corridor23SignTex.colorSpace = THREE.SRGBColorSpace;
    var corridor23Sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.42),
      new THREE.MeshBasicMaterial({ map: corridor23SignTex, transparent: true })
    );
    corridor23Sign.position.set(0, bh * 0.78, corridor23DoorZ - 0.55);
    corridor23Sign.rotation.y = Math.PI;
    corridor.add(corridor23Sign);
  }

  var outpostDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2.2, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  outpostDoorPick.userData.brInteract = { kind: "level1_1_2_door" };
  outpostDoorPick.position.set(halfW - 0.35, 1.1, outpostDoorZ);
  corridor.add(outpostDoorPick);

  var outpostDoorState = {
    open: false,
    opening: false,
    t: 0,
    openDur: 0.85,
    pickMesh: outpostDoorPick,
    interactX: halfW - 0.55,
    interactZ: outpostDoorZ,
    interactDist: 2.8,
    doorGapCollider: {
      kind: "wall",
      minX: halfW - 0.02,
      maxX: halfW + wallT,
      minZ: outpostDoorZ - doorHalfGapZ,
      maxZ: outpostDoorZ + doorHalfGapZ,
      minY: 0,
      maxY: bh,
      level1_1_2DoorBlock: true,
    },
    doorPanel: null,
  };

  var doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, bh * 0.82, DOOR_GAP_Z),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 })
  );
  doorPanel.position.set(halfW - 0.04, bh * 0.41, outpostDoorZ);
  corridor.add(doorPanel);
  outpostDoorState.doorPanel = doorPanel;
  colliders.push(outpostDoorState.doorGapCollider);

  var magLight = new THREE.PointLight(0xff44cc, 0.22, 28, 1.8);
  magLight.position.set(-halfW + 0.5, bh - 0.15, 14);
  corridor.add(magLight);
  var grnLight = new THREE.PointLight(0x44ff88, 0.2, 28, 1.8);
  grnLight.position.set(halfW - 0.5, bh - 0.15, 36);
  corridor.add(grnLight);
  var amb = new THREE.HemisphereLight(0xffffff, 0x999999, 0.92);
  corridor.add(amb);
  var pl1 = new THREE.PointLight(0xffffff, 0.5, 24, 1.6);
  pl1.position.set(0, bh - 0.2, 12);
  corridor.add(pl1);
  var pl2 = pl1.clone();
  pl2.position.z = 38;
  corridor.add(pl2);

  var chests = [];
  var chestLeftX = -halfW + 0.95;

  function registerChest(entry) {
    chests.push(entry);
    colliders.push(entry.collider);
    if (opts.horror && opts.horror.registerQuantumChest) {
      opts.horror.registerQuantumChest(entry);
    }
    if (opts.onChest) opts.onChest(entry);
  }

  ensureChestTemplate(function (template) {
    registerChest(
      spawnFixedChest(corridor, chestLeftX, CHEST_Z, template, {
        chestId: "level1_1_2_corridor_left_35",
        lootKind: "almond_x2",
      })
    );
  });

  var outpostHalfW = 5;
  var outpostHalfD = 5;
  var outpostCenterX = halfW + wallT + outpostHalfW + 0.5;
  var outpostCenterZ = outpostDoorZ;

  var outpost = new THREE.Group();
  outpost.name = "Level1_1_2Outpost2";
  outpost.visible = false;
  group.add(outpost);

  var opFloor = new THREE.Mesh(
    new THREE.BoxGeometry(outpostHalfW * 2, 0.12, outpostHalfD * 2),
    sharedWhiteFloorMat()
  );
  opFloor.position.set(outpostCenterX, 0.06, outpostCenterZ);
  outpost.add(opFloor);

  var opCeil = new THREE.Mesh(
    new THREE.BoxGeometry(outpostHalfW * 2, 0.1, outpostHalfD * 2),
    sharedWhiteCeilMat()
  );
  opCeil.position.set(outpostCenterX, bh, outpostCenterZ);
  outpost.add(opCeil);

  var outpostColliders = [];
  addWallSegment(
    outpostColliders,
    outpostCenterX + outpostHalfW - 0.06,
    outpostCenterX + outpostHalfW + wallT,
    outpostCenterZ - outpostHalfD,
    outpostCenterZ + outpostHalfD,
    bh
  );
  addWallSegment(
    outpostColliders,
    outpostCenterX - outpostHalfW,
    outpostCenterX + outpostHalfW,
    outpostCenterZ + outpostHalfD - 0.06,
    outpostCenterZ + outpostHalfD + wallT,
    bh
  );
  addWallSegment(
    outpostColliders,
    outpostCenterX - outpostHalfW,
    outpostCenterX + outpostHalfW,
    outpostCenterZ - outpostHalfD - wallT,
    outpostCenterZ - outpostHalfD + 0.06,
    bh
  );

  var opReturnHalfGapZ = 0.55;
  var opWestWallX = outpostCenterX - outpostHalfW - wallT * 0.5;
  var opSegLen = outpostHalfD - opReturnHalfGapZ;

  if (opSegLen > 0.2) {
    var opWallWN = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, bh, opSegLen),
      sharedWhiteWallMat()
    );
    opWallWN.position.set(
      opWestWallX,
      bh * 0.5,
      outpostCenterZ - outpostHalfD + opSegLen * 0.5
    );
    outpost.add(opWallWN);
    var opWallWS = opWallWN.clone();
    opWallWS.position.z = outpostCenterZ + outpostHalfD - opSegLen * 0.5;
    outpost.add(opWallWS);
  }

  var opExitDoorTex = createBlackDoorTexture();
  var opExitDoorMat = new THREE.MeshStandardMaterial({
    map: opExitDoorTex || undefined,
    color: 0xffffff,
    emissive: 0x111111,
    emissiveIntensity: 0.25,
    roughness: 0.88,
  });
  var opExitFrame = new THREE.Mesh(
    new THREE.BoxGeometry(wallT, bh, DOOR_GAP_Z),
    [
      opExitDoorMat,
      sharedWhiteWallMat(),
      sharedWhiteWallMat(),
      sharedWhiteWallMat(),
      sharedWhiteWallMat(),
      sharedWhiteWallMat(),
    ]
  );
  opExitFrame.position.set(opWestWallX, bh * 0.5, outpostCenterZ);
  outpost.add(opExitFrame);

  var opWallE = new THREE.Mesh(
    new THREE.BoxGeometry(wallT, bh, outpostHalfD * 2),
    sharedWhiteWallMat()
  );
  opWallE.position.set(outpostCenterX + outpostHalfW + wallT * 0.5, bh * 0.5, outpostCenterZ);
  outpost.add(opWallE);

  var opWallN = new THREE.Mesh(
    new THREE.BoxGeometry(outpostHalfW * 2, bh, wallT),
    sharedWhiteWallMat()
  );
  opWallN.position.set(outpostCenterX, bh * 0.5, outpostCenterZ - outpostHalfD - wallT * 0.5);
  outpost.add(opWallN);

  var opWallS = new THREE.Mesh(
    new THREE.BoxGeometry(outpostHalfW * 2, bh, wallT),
    sharedWhiteWallMat()
  );
  opWallS.position.set(outpostCenterX, bh * 0.5, outpostCenterZ + outpostHalfD + wallT * 0.5);
  outpost.add(opWallS);

  addWallSegment(
    outpostColliders,
    outpostCenterX - outpostHalfW - wallT,
    outpostCenterX - outpostHalfW + 0.06,
    outpostCenterZ - outpostHalfD,
    outpostCenterZ - opReturnHalfGapZ,
    bh
  );
  addWallSegment(
    outpostColliders,
    outpostCenterX - outpostHalfW - wallT,
    outpostCenterX - outpostHalfW + 0.06,
    outpostCenterZ + opReturnHalfGapZ,
    outpostCenterZ + outpostHalfD,
    bh
  );

  var opSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.55),
    new THREE.MeshBasicMaterial({ color: 0x6622aa })
  );
  opSign.position.set(outpostCenterX, bh - 0.55, outpostCenterZ - outpostHalfD + 0.12);
  opSign.rotation.x = -Math.PI * 0.5;
  outpost.add(opSign);

  ensureChestTemplate(function (template) {
    registerChest(
      spawnFixedChest(outpost, outpostCenterX, outpostCenterZ + 1.6, template, {
        chestId: "level1_1_2_outpost_0",
        lootKind: "almond_x1",
        refreshable: "l4_first_visit",
      })
    );
  });

  var corridor23EnterTrigger = {
    minX: -corridor23HalfGapZ,
    maxX: corridor23HalfGapZ,
    minZ: corridor23DoorZ - 0.15,
    maxZ: corridor23DoorZ + 1.35,
  };

  var corridor11ReturnTrigger = {
    minX: -returnHalfGapZ,
    maxX: returnHalfGapZ,
    minZ: -0.85,
    maxZ: 0.35,
  };

  var outpostEnterTrigger = {
    minX: halfW - 0.6,
    maxX: halfW + 3,
    minZ: outpostDoorZ - 0.85,
    maxZ: outpostDoorZ + 0.85,
  };

  var outpostReturnTrigger = {
    minX: outpostCenterX - outpostHalfW - 0.65,
    maxX: outpostCenterX - outpostHalfW + 1.35,
    minZ: outpostCenterZ - opReturnHalfGapZ - 0.25,
    maxZ: outpostCenterZ + opReturnHalfGapZ + 0.25,
  };

  function setDoorBlockerGhost(blockFlag, ghost) {
    var i;
    for (i = 0; i < colliders.length; i++) {
      if (colliders[i][blockFlag]) {
        colliders[i].ghost = ghost;
      }
    }
  }

  function setCorridor23Passable(passable) {
    setDoorBlockerGhost("level1_1_23DoorBlock", passable);
    setDoorBlockerGhost("level1_1_23EndCap", passable);
  }

  function updateGlitch(dt) {
    glitchT += dt;
    var t = glitchT;
    var i;
    for (i = 0; i < glitchMats.length; i++) {
      var mat = glitchMats[i];
      var r = 0.86 + Math.abs(Math.sin(t * 3.7 + i)) * 0.22;
      var g = 0.82 + Math.abs(Math.sin(t * 4.3 + i * 0.7 + 1.2)) * 0.26;
      var b = 0.88 + Math.sin(t * 2.1 + i * 0.4) * 0.08;
      mat.color.setRGB(r, g, b);
      mat.emissive.setRGB(
        0.08 + Math.abs(Math.sin(t * 5.1 + i)) * 0.35,
        0.04 + Math.abs(Math.sin(t * 4.8 + i * 1.1)) * 0.42,
        0.02 + Math.sin(t * 3.2) * 0.06
      );
    }
    magLight.intensity = 0.16 + Math.abs(Math.sin(t * 6.2)) * 0.14;
    grnLight.intensity = 0.14 + Math.abs(Math.sin(t * 5.6 + 0.8)) * 0.16;
    for (i = 0; i < chromaMeshes.length; i++) {
      var c = chromaMeshes[i];
      var shift = Math.sin(t * 7.5 + i * 1.7) * 0.06;
      c.mesh.position.x = c.baseX + (c.hex === 0xff00aa ? shift : -shift);
      c.mesh.position.z = c.baseZ + Math.sin(t * 4.9 + i) * 0.04;
      c.mesh.material.opacity =
        (c.hex === 0xff00aa ? 0.16 : 0.13) + Math.abs(Math.sin(t * 8.1 + i)) * 0.12;
    }
  }

  return {
    group: group,
    corridor: corridor,
    outpost: outpost,
    colliders: colliders,
    outpostColliders: outpostColliders,
    chests: chests,
    outpostDoor: outpostDoorState,
    outpostEnterTrigger: outpostEnterTrigger,
    outpostReturnTrigger: outpostReturnTrigger,
    outpostExitInteract: {
      x: outpostCenterX - outpostHalfW + 0.55,
      z: outpostCenterZ,
      dist: 3.2,
    },
    corridor11ReturnTrigger: corridor11ReturnTrigger,
    corridor23EnterTrigger: corridor23EnterTrigger,
    corridor23Door: corridor23DoorState,
    corridor23DoorZ: corridor23DoorZ,
    corridorReturnFrom23: {
      x: 0,
      z: len - 2.4,
      yaw: Math.PI,
      pitch: 0,
      roll: 0,
      feetY: 0,
    },
    outpostSpawn: { x: outpostCenterX - 1.5, z: outpostCenterZ, yaw: -Math.PI * 0.5 },
    corridorReturnFromOutpost: {
      x: halfW - 1.85,
      z: outpostDoorZ,
      yaw: 0,
      pitch: 0,
      roll: 0,
      feetY: 0,
    },
    corridorSpawn: { x: 0, z: LEVEL1_1_2_SPAWN_Z, yaw: LEVEL1_1_2_SPAWN_YAW },
    halfW: halfW,
    syncChestStates: function () {
      var i;
      for (i = 0; i < chests.length; i++) syncLevel1_1ChestEntryOpened(chests[i]);
    },
    getAimInteractRoots: function () {
      var roots = [];
      if (outpostDoorState.pickMesh) roots.push(outpostDoorState.pickMesh);
      if (corridor23DoorState.pickMesh) roots.push(corridor23DoorState.pickMesh);
      return roots;
    },
    updateGlitch: updateGlitch,
    updateCorridor23Door: function (dt) {
      var d = corridor23DoorState;
      if (!d.opening || d.open) return false;
      d.t += dt;
      var p = Math.min(1, d.t / d.openDur);
      if (d.doorPanel) d.doorPanel.position.z = corridor23DoorZ - 0.04 + p * 0.95;
      if (p >= 1) {
        d.opening = false;
        d.open = true;
        setCorridor23Passable(true);
        return true;
      }
      return false;
    },
    tryOpenCorridor23Door: function (px, pz, fromAim) {
      var d = corridor23DoorState;
      if (!d || d.open || d.opening) return false;
      if (!fromAim) {
        var dx = px - d.interactX;
        var dz = pz - d.interactZ;
        if (Math.hypot(dx, dz) > d.interactDist) return false;
      }
      d.opening = true;
      d.t = 0;
      return true;
    },
    isCorridor23DoorOpen: function () {
      return corridor23DoorState.open || corridor23DoorState.opening;
    },
    isCorridor23DoorPassable: function () {
      return corridor23DoorState.open;
    },
    updateOutpostDoor: function (dt) {
      var d = outpostDoorState;
      if (!d.opening || d.open) return false;
      d.t += dt;
      var p = Math.min(1, d.t / d.openDur);
      if (d.doorPanel) d.doorPanel.position.x = halfW - 0.04 + p * 0.95;
      if (p >= 1) {
        d.opening = false;
        d.open = true;
        setDoorBlockerGhost("level1_1_2DoorBlock", true);
        return true;
      }
      return false;
    },
    tryOpenOutpostDoor: function (px, pz, fromAim) {
      var d = outpostDoorState;
      if (!d || d.open || d.opening) return false;
      if (!fromAim) {
        var dx = px - d.interactX;
        var dz = pz - d.interactZ;
        if (Math.hypot(dx, dz) > d.interactDist) return false;
      }
      d.opening = true;
      d.t = 0;
      return true;
    },
    isOutpostDoorOpen: function () {
      return outpostDoorState.open || outpostDoorState.opening;
    },
  };
}

/**
 * Level 1.1-3 — 略暗纯白走廊（7×50）· 笑靥 · M.E.G 前哨 3
 */
import * as THREE from "three";
import { syncLevel1_1ChestEntryOpened } from "./backrooms-level1-1-chests.js";
import {
  addWallSegment,
  createBlackDoorTexture,
  ensureChestTemplate,
  spawnFixedChest,
  sharedBlueTileFloorMat,
  sharedWhiteCeilMat,
  sharedWhiteWallMat,
} from "./backrooms-level1-1-world.js?v=2";
import { createFixedXiaoye } from "./backrooms-level2-xiaoye.js";
import { buildMegOutpostRecruiter } from "./backrooms-meg-npc-model.js";

export const LEVEL1_1_3_CORRIDOR_LEN = 50;
export const LEVEL1_1_3_CORRIDOR_W = 6;
export const LEVEL1_1_3_WALL_H = 6;
export const LEVEL1_1_3_SPAWN_Z = 2.2;
export const LEVEL1_1_3_SPAWN_YAW = 0;
export const LEVEL1_1_3_SANITY_DRAIN = 2;

const DOOR_GAP_Z = 1.05;
const OUTPOST_DOOR_Z = 30;
const XIAOYE_Z = 20;
const TRAP_DAMAGE = 22;
const TRAP_COOLDOWN_MS = 900;

function createDimWhiteMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xe8e8ea,
    emissive: 0x0a0a0c,
    emissiveIntensity: 0.08,
    roughness: 0.92,
  });
}

function createWarningSignTexture() {
  var w = 512;
  var h = 128;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#cc2200";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = "#cc1100";
  ctx.font = "bold 42px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 31px sans-serif";
  ctx.fillText("警告！请勿越过此界 · 进入者将面临迫近死亡", w * 0.5, h * 0.5);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {THREE.Group} parent
 * @param {{ horror?: object, onChest?: (e: object) => void }} opts
 */
export function buildLevel1_1_3World(parent, opts) {
  opts = opts || {};
  var halfW = LEVEL1_1_3_CORRIDOR_W * 0.5;
  var len = LEVEL1_1_3_CORRIDOR_LEN;
  var bh = LEVEL1_1_3_WALL_H;
  var wallT = 0.14;

  var group = new THREE.Group();
  group.name = "Level1_1_3World";
  group.visible = false;
  parent.add(group);

  var corridor = new THREE.Group();
  corridor.name = "Level1_1_3Corridor";
  group.add(corridor);

  var dimMat = createDimWhiteMat();
  var floorMat = sharedBlueTileFloorMat().clone();
  floorMat.color.setHex(0x52616b);
  if (floorMat.map) {
    floorMat.map = floorMat.map.clone();
    floorMat.map.wrapT = THREE.RepeatWrapping;
    floorMat.map.repeat.y = len / 30;
  }
  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL1_1_3_CORRIDOR_W, 0.12, len),
    floorMat
  );
  floor.position.set(0, 0.06, len * 0.5);
  corridor.add(floor);

  var ceil = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL1_1_3_CORRIDOR_W, 0.1, len),
    sharedWhiteCeilMat()
  );
  ceil.material = dimMat.clone();
  ceil.position.set(0, bh, len * 0.5);
  corridor.add(ceil);

  var colliders = [];
  var wallMat = dimMat.clone();

  addWallSegment(colliders, -halfW - wallT, -halfW + 0.06, 0, len, bh);

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

  var westWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, len), wallMat);
  westWall.position.set(-halfW - wallT * 0.5, bh * 0.5, len * 0.5);
  corridor.add(westWall);

  if (doorSegLenN > 0.2) {
    var segN = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, doorSegLenN), wallMat.clone());
    segN.position.set(halfW + wallT * 0.5, bh * 0.5, doorSegLenN * 0.5);
    corridor.add(segN);
  }
  if (doorSegLenS > 0.2) {
    var segS = new THREE.Mesh(new THREE.BoxGeometry(wallT, bh, doorSegLenS), wallMat.clone());
    segS.position.set(halfW + wallT * 0.5, bh * 0.5, outpostDoorZ + doorHalfGapZ + doorSegLenS * 0.5);
    corridor.add(segS);
  }

  var returnHalfGapZ = DOOR_GAP_Z * 0.5;
  var returnDoorTex = createBlackDoorTexture();
  var returnDoorMat = new THREE.MeshStandardMaterial({
    map: returnDoorTex || undefined,
    color: 0xffffff,
    emissive: 0x0a0a0a,
    emissiveIntensity: 0.15,
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

  var corridor14DoorZ = len;
  var corridor14HalfGapZ = DOOR_GAP_Z * 0.5;
  addWallSegment(colliders, -halfW, -corridor14HalfGapZ, len - 0.02, len + wallT, bh);
  addWallSegment(colliders, corridor14HalfGapZ, halfW, len - 0.02, len + wallT, bh);

  var corridor14SegW = halfW - corridor14HalfGapZ;
  if (corridor14SegW > 0.2) {
    var c14WallL = new THREE.Mesh(new THREE.BoxGeometry(corridor14SegW, bh, wallT), wallMat.clone());
    c14WallL.position.set(-halfW + corridor14SegW * 0.5, bh * 0.5, corridor14DoorZ + wallT * 0.5);
    corridor.add(c14WallL);
    var c14WallR = c14WallL.clone();
    c14WallR.position.x = halfW - corridor14SegW * 0.5;
    corridor.add(c14WallR);
  }

  var corridor14DoorTex = createBlackDoorTexture();
  var corridor14DoorMat = new THREE.MeshStandardMaterial({
    map: corridor14DoorTex || undefined,
    color: 0xffffff,
    emissive: 0x0a0a0a,
    emissiveIntensity: 0.15,
    roughness: 0.88,
  });
  var corridor14DoorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z, bh, wallT),
    [wallMat, wallMat, wallMat, wallMat, wallMat, corridor14DoorMat]
  );
  corridor14DoorFrame.position.set(0, bh * 0.5, corridor14DoorZ + wallT * 0.5);
  corridor.add(corridor14DoorFrame);

  var corridor14DoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z * 0.92, bh * 0.82, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 })
  );
  corridor14DoorPanel.position.set(0, bh * 0.41, corridor14DoorZ - 0.04);
  corridor.add(corridor14DoorPanel);

  var corridor14DoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.2, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  corridor14DoorPick.userData.brInteract = { kind: "level1_1_34_door" };
  corridor14DoorPick.position.set(0, 1.1, corridor14DoorZ - 0.35);
  corridor.add(corridor14DoorPick);

  var corridor14DoorState = {
    open: false,
    opening: false,
    t: 0,
    openDur: 0.85,
    pickMesh: corridor14DoorPick,
    interactX: 0,
    interactZ: corridor14DoorZ - 0.55,
    interactDist: 2.8,
    doorGapCollider: {
      kind: "wall",
      minX: -corridor14HalfGapZ,
      maxX: corridor14HalfGapZ,
      minZ: corridor14DoorZ - 0.02,
      maxZ: corridor14DoorZ + wallT,
      minY: 0,
      maxY: bh,
      level1_1_14DoorBlock: true,
    },
    doorPanel: corridor14DoorPanel,
  };
  colliders.push(corridor14DoorState.doorGapCollider);

  var corridor14EnterTrigger = {
    minX: -corridor14HalfGapZ,
    maxX: corridor14HalfGapZ,
    minZ: corridor14DoorZ - 0.15,
    maxZ: corridor14DoorZ + 1.35,
  };
  var warnTex = createWarningSignTexture();
  var warnSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.72),
    new THREE.MeshBasicMaterial({
      map: warnTex || undefined,
      color: warnTex ? 0xffffff : 0xf0f0f0,
      transparent: true,
    })
  );
  warnSign.position.set(halfW - 0.18, bh * 0.62, corridor14DoorZ - 1.35);
  warnSign.rotation.y = -Math.PI * 0.5;
  corridor.add(warnSign);

  var outpostDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2.2, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  outpostDoorPick.userData.brInteract = { kind: "level1_1_3_door" };
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
      level1_1_3DoorBlock: true,
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

  var amb = new THREE.HemisphereLight(0xe8e8ec, 0x888890, 0.72);
  corridor.add(amb);
  var pl1 = new THREE.PointLight(0xf0f0f4, 0.38, 22, 1.7);
  pl1.position.set(0, bh - 0.25, 12);
  corridor.add(pl1);
  var pl2 = pl1.clone();
  pl2.position.z = 38;
  corridor.add(pl2);

  var chests = [];
  function registerChest(entry) {
    chests.push(entry);
    colliders.push(entry.collider);
    if (opts.horror && opts.horror.registerQuantumChest) {
      opts.horror.registerQuantumChest(entry);
    }
    if (opts.onChest) opts.onChest(entry);
  }

  var xiaoyeX = -halfW + 0.18;
  var xiaoye = createFixedXiaoye(corridor, {
    x: xiaoyeX,
    z: XIAOYE_Z,
    rotY: Math.PI * 0.5,
    faceW: 4.2,
    faceH: 5.2,
  });

  var outpostHalfW = 5;
  var outpostHalfD = 5;
  var outpostCenterX = halfW + wallT + outpostHalfW + 0.5;
  var outpostCenterZ = outpostDoorZ;

  var outpost = new THREE.Group();
  outpost.name = "Level1_1_3Outpost3";
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
    opWallWN.position.set(opWestWallX, bh * 0.5, outpostCenterZ - outpostHalfD + opSegLen * 0.5);
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

  var trapGroup = new THREE.Group();
  trapGroup.name = "Outpost3Trap";
  var trapX = outpostCenterX - 0.8;
  var trapZ = outpostCenterZ + 0.35;
  var spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.55, roughness: 0.45 });
  var i;
  for (i = 0; i < 9; i++) {
    var spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), spikeMat);
    spike.position.set((i % 3 - 1) * 0.22, 0.11, (Math.floor(i / 3) - 1) * 0.22);
    trapGroup.add(spike);
  }
  trapGroup.position.set(trapX, 0, trapZ);
  outpost.add(trapGroup);

  var trapZone = {
    minX: trapX - 0.45,
    maxX: trapX + 0.45,
    minZ: trapZ - 0.45,
    maxZ: trapZ + 0.45,
  };
  var trapLastHit = 0;

  var opSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xaa2222 })
  );
  opSign.position.set(outpostCenterX, bh - 0.55, outpostCenterZ - outpostHalfD + 0.12);
  opSign.rotation.x = -Math.PI * 0.5;
  outpost.add(opSign);

  ensureChestTemplate(function (template) {
    registerChest(
      spawnFixedChest(outpost, outpostCenterX + 1.5, outpostCenterZ - 1.2, template, {
        chestId: "level1_1_3_outpost_0",
        lootKind: "royal_rations_trap",
        refreshable: "l11_first_visit",
      })
    );
  });
  var recruiter = buildMegOutpostRecruiter(
    outpost,
    outpostCenterX + 1.65,
    outpostCenterZ + 0.75,
    "MegOutpost3Recruiter"
  );

  var corridor22ReturnTrigger = {
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
    var j;
    for (j = 0; j < colliders.length; j++) {
      if (colliders[j][blockFlag]) {
        colliders[j].ghost = ghost;
        return;
      }
    }
  }

  function updateTrap(px, pz, survival, toastFn, now) {
    if (!survival || survival.dead) return;
    if (px < trapZone.minX || px > trapZone.maxX || pz < trapZone.minZ || pz > trapZone.maxZ) {
      return;
    }
    if (now - trapLastHit < TRAP_COOLDOWN_MS) return;
    trapLastHit = now;
    survival.takeDamage(TRAP_DAMAGE);
    if (toastFn) toastFn("陷阱！−" + TRAP_DAMAGE + " 血量");
  }

  return {
    group: group,
    corridor: corridor,
    outpost: outpost,
    colliders: colliders,
    outpostColliders: outpostColliders,
    chests: chests,
    xiaoye: xiaoye,
    outpostDoor: outpostDoorState,
    outpostEnterTrigger: outpostEnterTrigger,
    outpostReturnTrigger: outpostReturnTrigger,
    outpostExitInteract: {
      x: outpostCenterX - outpostHalfW + 0.55,
      z: outpostCenterZ,
      dist: 3.2,
    },
    corridor22ReturnTrigger: corridor22ReturnTrigger,
    corridor14Door: corridor14DoorState,
    corridor14DoorZ: corridor14DoorZ,
    corridor14EnterTrigger: corridor14EnterTrigger,
    corridorReturnFrom14: {
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
    corridorSpawn: { x: 0, z: LEVEL1_1_3_SPAWN_Z, yaw: LEVEL1_1_3_SPAWN_YAW },
    halfW: halfW,
    syncChestStates: function () {
      var j;
      for (j = 0; j < chests.length; j++) syncLevel1_1ChestEntryOpened(chests[j]);
    },
    getAimInteractRoots: function () {
      var roots = [];
      if (outpostDoorState.pickMesh) roots.push(outpostDoorState.pickMesh);
      if (corridor14DoorState.pickMesh) roots.push(corridor14DoorState.pickMesh);
      if (recruiter && recruiter.visible) roots.push(recruiter);
      return roots;
    },
    updateCorridor14Door: function (dt) {
      var d = corridor14DoorState;
      if (!d.opening || d.open) return false;
      d.t += dt;
      var p = Math.min(1, d.t / d.openDur);
      if (d.doorPanel) d.doorPanel.position.z = corridor14DoorZ - 0.04 + p * 0.95;
      if (p >= 1) {
        d.opening = false;
        d.open = true;
        setDoorBlockerGhost("level1_1_14DoorBlock", true);
        return true;
      }
      return false;
    },
    tryOpenCorridor14Door: function (px, pz, fromAim) {
      var d = corridor14DoorState;
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
    isCorridor14DoorOpen: function () {
      return corridor14DoorState.open || corridor14DoorState.opening;
    },
    isCorridor14DoorPassable: function () {
      return corridor14DoorState.open;
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
        setDoorBlockerGhost("level1_1_3DoorBlock", true);
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
    updateTrap: updateTrap,
  };
}

export function pointInLevel1_1_3Aabb(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

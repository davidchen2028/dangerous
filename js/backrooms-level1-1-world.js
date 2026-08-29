/**
 * Level 1.1 — L1.1-1 白色走廊（7×30）与 M.E.G 前哨 1
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { isLevel1_1ChestOpened, syncLevel1_1ChestEntryOpened } from "./backrooms-level1-1-chests.js";
import { buildMegOutpostRecruiter } from "./backrooms-meg-npc-model.js";

export const LEVEL1_1_CORRIDOR_LEN = 30;
export const LEVEL1_1_CORRIDOR_W = 7;
export const LEVEL1_1_WALL_H = 3.15;
export const LEVEL1_1_SPAWN_Z = 2.2;
export const LEVEL1_1_SPAWN_YAW = 0;

const CHEST_GLB_URL = "models/pirate-chest.glb";
const CHEST_COLLIDE_HALF = 0.42;
const DOOR_GAP_Z = 1.05;

var _chestTemplate = null;
var _chestLoadStarted = false;
/** @type {((scene: THREE.Object3D | null) => void)[]} */
var _chestLoadPending = [];

var _whiteFloorMat = null;
var _blueTileFloorMat = null;
var _whiteWallMat = null;
var _whiteCeilMat = null;
var _chestPickGeo = null;
var _chestPickMat = null;
var _chestFallbackGeo = null;
var _chestFallbackMat = null;

function sharedWhiteFloorMat() {
  if (!_whiteFloorMat) {
    _whiteFloorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x333333,
      roughness: 0.92,
    });
  }
  return _whiteFloorMat;
}

function sharedBlueTileFloorMat() {
  if (!_blueTileFloorMat) {
    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1024;
    var ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#3f7ea2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#bdd3dc";
      ctx.lineWidth = 3;
      for (var p = 0; p <= 256; p += 32) {
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, canvas.height);
        ctx.stroke();
      }
      for (var py = 0; py <= canvas.height; py += 32) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
        ctx.stroke();
      }
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    _blueTileFloorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      roughness: 0.72,
      metalness: 0.04,
    });
  }
  return _blueTileFloorMat;
}

function sharedWhiteWallMat() {
  if (!_whiteWallMat) {
    _whiteWallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x2a2a2a,
      roughness: 0.9,
    });
  }
  return _whiteWallMat;
}

function sharedWhiteCeilMat() {
  if (!_whiteCeilMat) {
    _whiteCeilMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      emissive: 0x222222,
      roughness: 0.94,
    });
  }
  return _whiteCeilMat;
}

function sharedChestPickGeo() {
  if (!_chestPickGeo) _chestPickGeo = new THREE.BoxGeometry(0.92, 0.78, 0.72);
  return _chestPickGeo;
}

function sharedChestPickMat() {
  if (!_chestPickMat) {
    _chestPickMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
  }
  return _chestPickMat;
}

function sharedChestFallbackGeo() {
  if (!_chestFallbackGeo) _chestFallbackGeo = new THREE.BoxGeometry(0.75, 0.75, 0.55);
  return _chestFallbackGeo;
}

function sharedChestFallbackMat() {
  if (!_chestFallbackMat) {
    _chestFallbackMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      metalness: 0.35,
      roughness: 0.55,
    });
  }
  return _chestFallbackMat;
}

function createBlackDoorTexture() {
  var cw = 128;
  var ch = 192;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  var doorW = cw * 0.42;
  var doorH = ch * 0.72;
  var doorX = (cw - doorW) * 0.5;
  var doorY = ch * 0.12;
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = "#020204";
  ctx.fillRect(doorX + doorW * 0.08, doorY + doorH * 0.06, doorW * 0.84, doorH * 0.88);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function fitChestModel(model) {
  var box = new THREE.Box3().setFromObject(model);
  var size = new THREE.Vector3();
  box.getSize(size);
  var maxDim = Math.max(size.x, size.y, size.z, 0.001);
  var scale = 1.05 / maxDim;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  var center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);
  model.position.y -= box.min.y;
}

function ensureChestTemplate(onReady) {
  if (_chestTemplate) {
    onReady(_chestTemplate);
    return;
  }
  _chestLoadPending.push(onReady);
  if (_chestLoadStarted) return;
  _chestLoadStarted = true;
  var loader = new GLTFLoader();
  loader.load(
    CHEST_GLB_URL,
    function (gltf) {
      _chestTemplate = gltf.scene;
      var pending = _chestLoadPending.slice();
      _chestLoadPending.length = 0;
      var i;
      for (i = 0; i < pending.length; i++) pending[i](_chestTemplate);
    },
    undefined,
    function () {
      var pending = _chestLoadPending.slice();
      _chestLoadPending.length = 0;
      var i;
      for (i = 0; i < pending.length; i++) pending[i](null);
    }
  );
}

function createChestCollider(cx, cz) {
  return {
    kind: "chest",
    minX: cx - CHEST_COLLIDE_HALF,
    maxX: cx + CHEST_COLLIDE_HALF,
    minZ: cz - CHEST_COLLIDE_HALF,
    maxZ: cz + CHEST_COLLIDE_HALF,
  };
}

/**
 * @param {THREE.Group} parent
 * @param {number} cx
 * @param {number} cz
 * @param {THREE.Object3D | null} template
 * @param {object} spec
 */
function spawnFixedChest(parent, cx, cz, template, spec) {
  var root = new THREE.Group();
  root.name = "Level1_1Chest_" + spec.chestId;
  root.position.set(cx, 0, cz);

  if (template) {
    var model = template.clone(true);
    fitChestModel(model);
    root.add(model);
  } else {
    var box = new THREE.Mesh(sharedChestFallbackGeo(), sharedChestFallbackMat());
    box.position.y = 0.375;
    root.add(box);
  }

  var entry = {
    root: root,
    pickMesh: null,
    glowLight: null,
    collider: createChestCollider(cx, cz),
    x: cx,
    z: cz,
    opened: false,
    chestId: spec.chestId,
    lootKind: spec.lootKind,
    refreshable: spec.refreshable || false,
  };
  syncLevel1_1ChestEntryOpened(entry);

  var pickMesh = new THREE.Mesh(sharedChestPickGeo(), sharedChestPickMat());
  pickMesh.position.y = 0.38;
  pickMesh.userData.brInteract = { kind: "chest", chestEntry: entry };
  root.add(pickMesh);
  entry.pickMesh = pickMesh;

  parent.add(root);
  return entry;
}

function addWallSegment(colliders, minX, maxX, minZ, maxZ, wallH) {
  colliders.push({
    kind: "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
    minY: 0,
    maxY: wallH,
  });
}

/**
 * @param {THREE.Group} parent
 * @param {{ horror?: { registerQuantumChest: (e: object) => void } | null, onChest?: (e: object) => void }} opts
 */
export function buildLevel1_1World(parent, opts) {
  opts = opts || {};
  var halfW = LEVEL1_1_CORRIDOR_W * 0.5;
  var len = LEVEL1_1_CORRIDOR_LEN;
  var bh = LEVEL1_1_WALL_H;
  var wallT = 0.14;

  var group = new THREE.Group();
  group.name = "Level1_1World";
  group.visible = false;
  parent.add(group);

  var corridor = new THREE.Group();
  corridor.name = "Level1_1Corridor";
  group.add(corridor);

  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL1_1_CORRIDOR_W, 0.12, len),
    sharedBlueTileFloorMat()
  );
  floor.position.set(0, 0.06, len * 0.5);
  corridor.add(floor);

  var ceil = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL1_1_CORRIDOR_W, 0.1, len),
    sharedWhiteCeilMat()
  );
  ceil.position.set(0, bh, len * 0.5);
  corridor.add(ceil);

  var colliders = [];
  addWallSegment(colliders, -halfW - wallT, -halfW + 0.06, 0, len, bh);

  var outpostDoorZ = 23;
  var doorHalfGapZ = DOOR_GAP_Z * 0.5;
  var doorSegLenN = outpostDoorZ - doorHalfGapZ;
  var doorSegLenS = len - (outpostDoorZ + doorHalfGapZ);

  if (doorSegLenN > 0.2) {
    addWallSegment(colliders, halfW - 0.06, halfW + wallT, 0, doorSegLenN, bh);
  }
  if (doorSegLenS > 0.2) {
    addWallSegment(
      colliders,
      halfW - 0.06,
      halfW + wallT,
      outpostDoorZ + doorHalfGapZ,
      len,
      bh
    );
  }

  var doorTex = createBlackDoorTexture();
  var solidMat = sharedWhiteWallMat();
  var doorMat = new THREE.MeshStandardMaterial({
    map: doorTex || undefined,
    color: doorTex ? 0xffffff : 0xffffff,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
    roughness: 0.88,
  });

  var spawnWall = new THREE.Mesh(
    new THREE.BoxGeometry(LEVEL1_1_CORRIDOR_W, bh, wallT),
    [solidMat, solidMat, solidMat, solidMat, doorMat, solidMat]
  );
  spawnWall.position.set(0, bh * 0.5, -wallT * 0.5);
  corridor.add(spawnWall);

  var halfGapZ = DOOR_GAP_Z * 0.5;
  addWallSegment(colliders, -halfW, -halfGapZ, -wallT, 0.02, bh);
  addWallSegment(colliders, halfGapZ, halfW, -wallT, 0.02, bh);

  var corridor12HalfGapZ = DOOR_GAP_Z * 0.5;
  var corridor12DoorZ = len;
  addWallSegment(colliders, -halfW, -corridor12HalfGapZ, len - 0.02, len + wallT, bh);
  addWallSegment(colliders, corridor12HalfGapZ, halfW, len - 0.02, len + wallT, bh);

  var corridor12DoorTex = createBlackDoorTexture();
  var corridor12DoorMat = new THREE.MeshStandardMaterial({
    map: corridor12DoorTex || undefined,
    color: 0xffffff,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
    roughness: 0.88,
  });

  var corridor12SegW = halfW - corridor12HalfGapZ;
  if (corridor12SegW > 0.2) {
    var corridor12WallL = new THREE.Mesh(
      new THREE.BoxGeometry(corridor12SegW, bh, wallT),
      sharedWhiteWallMat()
    );
    corridor12WallL.position.set(-halfW + corridor12SegW * 0.5, bh * 0.5, corridor12DoorZ + wallT * 0.5);
    corridor.add(corridor12WallL);
    var corridor12WallR = corridor12WallL.clone();
    corridor12WallR.position.x = halfW - corridor12SegW * 0.5;
    corridor.add(corridor12WallR);
  }

  var corridor12DoorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z, bh, wallT),
    [
      solidMat,
      solidMat,
      solidMat,
      solidMat,
      solidMat,
      corridor12DoorMat,
    ]
  );
  corridor12DoorFrame.position.set(0, bh * 0.5, corridor12DoorZ + wallT * 0.5);
  corridor.add(corridor12DoorFrame);

  var corridor12DoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.2, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  corridor12DoorPick.userData.brInteract = { kind: "level1_1_12_door" };
  corridor12DoorPick.position.set(0, 1.1, corridor12DoorZ - 0.35);
  corridor.add(corridor12DoorPick);

  var corridor12DoorState = {
    open: false,
    opening: false,
    t: 0,
    openDur: 0.85,
    pickMesh: corridor12DoorPick,
    interactX: 0,
    interactZ: corridor12DoorZ - 0.55,
    interactDist: 2.8,
    doorGapCollider: {
      kind: "wall",
      minX: -corridor12HalfGapZ,
      maxX: corridor12HalfGapZ,
      minZ: corridor12DoorZ - 0.02,
      maxZ: corridor12DoorZ + wallT,
      minY: 0,
      maxY: bh,
      level1_1_12DoorBlock: true,
    },
    doorPanel: null,
  };

  var corridor12DoorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_GAP_Z * 0.92, bh * 0.82, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 })
  );
  corridor12DoorPanel.position.set(0, bh * 0.41, corridor12DoorZ - 0.04);
  corridor.add(corridor12DoorPanel);
  corridor12DoorState.doorPanel = corridor12DoorPanel;
  colliders.push(corridor12DoorState.doorGapCollider);

  var eastWallX = halfW + wallT * 0.5;

  if (doorSegLenN > 0.2) {
    var segN = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, bh, doorSegLenN),
      sharedWhiteWallMat()
    );
    segN.position.set(eastWallX, bh * 0.5, doorSegLenN * 0.5);
    corridor.add(segN);
  }
  if (doorSegLenS > 0.2) {
    var segS = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, bh, doorSegLenS),
      sharedWhiteWallMat()
    );
    segS.position.set(eastWallX, bh * 0.5, outpostDoorZ + doorHalfGapZ + doorSegLenS * 0.5);
    corridor.add(segS);
  }

  var outpostDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2.2, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  outpostDoorPick.userData.brInteract = { kind: "level1_1_door" };
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
      level1_1DoorBlock: true,
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

  var amb = new THREE.HemisphereLight(0xffffff, 0x888888, 0.95);
  corridor.add(amb);
  var pl1 = new THREE.PointLight(0xffffff, 0.55, 22, 1.6);
  pl1.position.set(0, bh - 0.2, 8);
  corridor.add(pl1);
  var pl2 = pl1.clone();
  pl2.position.z = 22;
  corridor.add(pl2);

  var chests = [];
  var chestLeftX = -halfW + 0.95;
  var chestRightX = halfW - 0.95;

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
      spawnFixedChest(corridor, chestLeftX, 5, template, {
        chestId: "level1_1_corridor_left_5",
        lootKind: "almond_x2",
      })
    );
    registerChest(
      spawnFixedChest(corridor, chestLeftX, 15, template, {
        chestId: "level1_1_corridor_left_15",
        lootKind: "almond_x2",
      })
    );
    registerChest(
      spawnFixedChest(corridor, chestRightX, 13, template, {
        chestId: "level1_1_corridor_right_13",
        lootKind: "royal_rations",
      })
    );
  });

  var outpostHalfW = 5;
  var outpostHalfD = 5;
  var outpostCenterX = halfW + wallT + outpostHalfW + 0.5;
  var outpostCenterZ = outpostDoorZ;

  var outpost = new THREE.Group();
  outpost.name = "Level1_1Outpost1";
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
  var opSegLenN = outpostHalfD - opReturnHalfGapZ;
  var opSegLenS = opSegLenN;

  if (opSegLenN > 0.2) {
    var opWallWN = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, bh, opSegLenN),
      sharedWhiteWallMat()
    );
    opWallWN.position.set(
      opWestWallX,
      bh * 0.5,
      outpostCenterZ - outpostHalfD + opSegLenN * 0.5
    );
    outpost.add(opWallWN);
  }
  if (opSegLenS > 0.2) {
    var opWallWS = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, bh, opSegLenS),
      sharedWhiteWallMat()
    );
    opWallWS.position.set(
      opWestWallX,
      bh * 0.5,
      outpostCenterZ + outpostHalfD - opSegLenS * 0.5
    );
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

  var opExitLight = new THREE.PointLight(0xffffff, 0.45, 8, 1.5);
  opExitLight.position.set(outpostCenterX - outpostHalfW + 0.6, bh - 0.35, outpostCenterZ);
  outpost.add(opExitLight);

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
    new THREE.MeshBasicMaterial({ color: 0x2244aa })
  );
  opSign.position.set(outpostCenterX, bh - 0.55, outpostCenterZ - outpostHalfD + 0.12);
  opSign.rotation.x = -Math.PI * 0.5;
  outpost.add(opSign);

  var outpostChestSpecs = [
    { id: "level1_1_outpost_0", x: outpostCenterX - 2.2, z: outpostCenterZ - 2 },
    { id: "level1_1_outpost_1", x: outpostCenterX + 2.2, z: outpostCenterZ - 2 },
    { id: "level1_1_outpost_2", x: outpostCenterX, z: outpostCenterZ + 2.2 },
  ];
  var recruiter = buildMegOutpostRecruiter(
    outpost,
    outpostCenterX + 1.45,
    outpostCenterZ + 0.25,
    "MegOutpost1Recruiter"
  );

  ensureChestTemplate(function (template) {
    var i;
    for (i = 0; i < outpostChestSpecs.length; i++) {
      var spec = outpostChestSpecs[i];
      var entry = spawnFixedChest(outpost, spec.x, spec.z, template, {
        chestId: spec.id,
        lootKind: "almond_x1",
        refreshable: "l4_first_visit",
      });
      registerChest(entry);
    }
  });

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

  var megReturnTrigger = {
    minX: -halfGapZ,
    maxX: halfGapZ,
    minZ: -0.85,
    maxZ: 0.35,
  };

  var corridor12EnterTrigger = {
    minX: -corridor12HalfGapZ,
    maxX: corridor12HalfGapZ,
    minZ: corridor12DoorZ - 0.15,
    maxZ: corridor12DoorZ + 1.35,
  };

  return {
    group: group,
    corridor: corridor,
    outpost: outpost,
    colliders: colliders,
    outpostColliders: outpostColliders,
    chests: chests,
    outpostDoor: outpostDoorState,
    corridor12Door: corridor12DoorState,
    corridor12DoorZ: corridor12DoorZ,
    outpostEnterTrigger: outpostEnterTrigger,
    outpostReturnTrigger: outpostReturnTrigger,
    outpostExitInteract: {
      x: outpostCenterX - outpostHalfW + 0.55,
      z: outpostCenterZ,
      dist: 3.2,
    },
    megReturnTrigger: megReturnTrigger,
    corridor12EnterTrigger: corridor12EnterTrigger,
    corridorReturnFrom12: {
      x: 0,
      z: len - 2.4,
      yaw: Math.PI,
      pitch: 0,
      roll: 0,
      feetY: 0,
    },
    outpostSpawn: { x: outpostCenterX - 1.5, z: outpostCenterZ, yaw: -Math.PI * 0.5 },
    /** 离开前哨后落在走廊内，朝 -Z（远离东侧前哨门） */
    corridorReturnFromOutpost: {
      x: halfW - 1.85,
      z: outpostDoorZ,
      yaw: 0,
      pitch: 0,
      roll: 0,
      feetY: 0,
    },
    corridorSpawn: { x: 0, z: LEVEL1_1_SPAWN_Z, yaw: LEVEL1_1_SPAWN_YAW },
    halfW: halfW,
    syncChestStates: function () {
      var i;
      for (i = 0; i < chests.length; i++) syncLevel1_1ChestEntryOpened(chests[i]);
    },
    getAimInteractRoots: function () {
      var roots = [];
      if (outpostDoorState.pickMesh) roots.push(outpostDoorState.pickMesh);
      if (corridor12DoorState.pickMesh) roots.push(corridor12DoorState.pickMesh);
      if (recruiter && recruiter.visible) roots.push(recruiter);
      return roots;
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
        setDoorBlockerGhost("level1_1DoorBlock", true);
        return true;
      }
      return false;
    },
    updateCorridor12Door: function (dt) {
      var d = corridor12DoorState;
      if (!d.opening || d.open) return false;
      d.t += dt;
      var p = Math.min(1, d.t / d.openDur);
      if (d.doorPanel) d.doorPanel.position.z = corridor12DoorZ - 0.04 + p * 0.95;
      if (p >= 1) {
        d.opening = false;
        d.open = true;
        setDoorBlockerGhost("level1_1_12DoorBlock", true);
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
    tryOpenCorridor12Door: function (px, pz, fromAim) {
      var d = corridor12DoorState;
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
    isCorridor12DoorOpen: function () {
      return corridor12DoorState.open || corridor12DoorState.opening;
    },
    isCorridor12DoorPassable: function () {
      return corridor12DoorState.open;
    },
  };

  function setDoorBlockerGhost(blockFlag, ghost) {
    var i;
    for (i = colliders.length - 1; i >= 0; i--) {
      if (colliders[i][blockFlag]) {
        colliders[i].ghost = ghost;
        return;
      }
    }
  }
}

export function pointInLevel1_1Aabb(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

export {
  ensureChestTemplate,
  spawnFixedChest,
  addWallSegment,
  sharedWhiteFloorMat,
  sharedBlueTileFloorMat,
  sharedWhiteWallMat,
  sharedWhiteCeilMat,
  createBlackDoorTexture,
};

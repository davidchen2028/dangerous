/**
 * Level 2 — 随机门（L3 普通门 / L283 彩色门）
 */
import * as THREE from "three";
import { getLevel2EntityCorridorArm } from "./backrooms-level2-xiaoye.js";
import { isFastingRunActive } from "./backrooms-tasks.js";

var _doorBoxScratch = new THREE.Box3();

const STORAGE_KEY = "backrooms_l2_doors_v3";
export const LEVEL2_STREAM_DOOR_STATE_KEY = "backrooms_l2_doors_v4";
const DOOR_W = 1.05;
const DOOR_H = 2.45;
const DOOR_THICK = 0.12;
const FRAME_W = 0.1;
const WALL_THICK = 0.14;
const CORRIDOR_HEIGHT = 3.4;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinctArms(rng, halfLen) {
  var blocked = getLevel2EntityCorridorArm(halfLen);
  var arms = ["pz", "nz", "px", "nx"].filter(function (a) {
    return a !== blocked;
  });
  if (arms.length < 3) {
    arms = ["nz", "px", "nx"];
  }
  for (var i = arms.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var swap = arms[i];
    arms[i] = arms[j];
    arms[j] = swap;
  }
  return { a: arms[0], b: arms[1], c: arms[2] };
}

function layoutConflictsWithEntities(layout, halfLen) {
  if (!layout || !layout.l1 || !layout.l3 || !layout.l283) return true;
  var entityArm = getLevel2EntityCorridorArm(halfLen);
  return (
    layout.l1.arm === entityArm ||
    layout.l3.arm === entityArm ||
    layout.l283.arm === entityArm
  );
}

function armPosition(rng, halfLen, hubEdge) {
  var minP = hubEdge + 6;
  var maxP = halfLen - 8;
  if (maxP <= minP) return (minP + maxP) * 0.5;
  return minP + rng() * (maxP - minP);
}

export function getOrCreateLevel2DoorLayout(halfLen, hubEdge) {
  try {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.l1 && parsed.l3 && parsed.l283) {
        if (!parsed.l3Dest) {
          parsed.l3Dest = mulberry32((parsed.seed | 0) + 7919)() < 0.3 ? "l4" : "l3";
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          } catch (err0) {
            /* ignore */
          }
        }
        if (!layoutConflictsWithEntities(parsed, halfLen)) {
          return parsed;
        }
      }
    }
  } catch (err) {
    /* ignore */
  }

  var seed = (Date.now() ^ (Math.random() * 1e9)) | 0;
  var rng = mulberry32(seed);
  var pair = pickDistinctArms(rng, halfLen);
  var layout = {
    seed: seed,
    l3Dest: rng() < 0.3 ? "l4" : "l3",
    l1: { arm: pair.a, pos: armPosition(rng, halfLen, hubEdge) },
    l3: { arm: pair.b, pos: armPosition(rng, halfLen, hubEdge) },
    l283: { arm: pair.c, pos: armPosition(rng, halfLen, hubEdge) },
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch (err2) {
    /* ignore */
  }
  return layout;
}

function createRainbowDoorTexture() {
  var w = 64;
  var h = 128;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var colors = ["#ff3366", "#ff9933", "#ffee33", "#33dd66", "#3399ff", "#aa44ff"];
  var stripe = h / colors.length;
  var i;
  for (i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, i * stripe, w, stripe + 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function splitWallColliderOnZ(colliders, halfW, z0, z1, doorMinZ, doorMaxZ) {
  var i;
  for (i = colliders.length - 1; i >= 0; i--) {
    var c = colliders[i];
    if (c.kind !== "wall") continue;
    if (Math.abs(c.minX + WALL_THICK + halfW) > 0.08 && Math.abs(c.maxX - halfW) > 0.08) continue;
    if (c.minZ > z1 - 0.05 || c.maxZ < z0 + 0.05) continue;
    if (c.minZ >= z0 - 0.05 && c.maxZ <= z1 + 0.05) {
      colliders.splice(i, 1);
      if (doorMinZ - c.minZ > 0.35) {
        colliders.push({
          kind: "wall",
          minX: c.minX,
          maxX: c.maxX,
          minZ: c.minZ,
          maxZ: doorMinZ,
        });
      }
      if (c.maxZ - doorMaxZ > 0.35) {
        colliders.push({
          kind: "wall",
          minX: c.minX,
          maxX: c.maxX,
          minZ: doorMaxZ,
          maxZ: c.maxZ,
        });
      }
      return;
    }
  }
}

function splitWallColliderOnX(colliders, halfW, x0, x1, doorMinX, doorMaxX) {
  var i;
  for (i = colliders.length - 1; i >= 0; i--) {
    var c = colliders[i];
    if (c.kind !== "wall") continue;
    if (Math.abs(c.minZ + WALL_THICK + halfW) > 0.08 && Math.abs(c.maxZ - halfW) > 0.08) continue;
    if (c.minX > x1 - 0.05 || c.maxX < x0 + 0.05) continue;
    if (c.minX >= x0 - 0.05 && c.maxX <= x1 + 0.05) {
      colliders.splice(i, 1);
      if (doorMinX - c.minX > 0.35) {
        colliders.push({
          kind: "wall",
          minX: c.minX,
          maxX: doorMinX,
          minZ: c.minZ,
          maxZ: c.maxZ,
        });
      }
      if (c.maxX - doorMaxX > 0.35) {
        colliders.push({
          kind: "wall",
          minX: doorMaxX,
          maxX: c.maxX,
          minZ: c.minZ,
          maxZ: c.maxZ,
        });
      }
      return;
    }
  }
}

/**
 * @param {"l1"|"l3"|"l283"} doorId
 */
function buildWallDoor(group, colliders, spec, halfW, halfLen, hubEdge, doorId, plainMat, rainbowMat) {
  var arm = spec.arm;
  var pos = spec.pos;
  var isRainbow = doorId === "l283";
  var panelMat = isRainbow ? rainbowMat : plainMat;
  var doorRoot = new THREE.Group();
  doorRoot.name = "L2Door_" + doorId;

  var cx = 0;
  var cz = 0;
  var rotY = 0;
  var gapMin;
  var gapMax;

  if (arm === "pz") {
    cz = pos;
    cx = -halfW + WALL_THICK * 0.5;
    rotY = Math.PI * 0.5;
    gapMin = cz - DOOR_W * 0.5;
    gapMax = cz + DOOR_W * 0.5;
    splitWallColliderOnZ(colliders, halfW, hubEdge, halfLen, gapMin, gapMax);
  } else if (arm === "nz") {
    cz = -pos;
    cx = -halfW + WALL_THICK * 0.5;
    rotY = Math.PI * 0.5;
    gapMin = cz - DOOR_W * 0.5;
    gapMax = cz + DOOR_W * 0.5;
    splitWallColliderOnZ(colliders, halfW, -halfLen, -hubEdge, gapMin, gapMax);
  } else if (arm === "px") {
    cx = pos;
    cz = -halfW + WALL_THICK * 0.5;
    rotY = 0;
    gapMin = cx - DOOR_W * 0.5;
    gapMax = cx + DOOR_W * 0.5;
    splitWallColliderOnX(colliders, halfW, hubEdge, halfLen, gapMin, gapMax);
  } else {
    cx = -pos;
    cz = -halfW + WALL_THICK * 0.5;
    rotY = 0;
    gapMin = cx - DOOR_W * 0.5;
    gapMax = cx + DOOR_W * 0.5;
    splitWallColliderOnX(colliders, halfW, -halfLen, -hubEdge, gapMin, gapMax);
  }

  doorRoot.position.set(cx, 0, cz);
  doorRoot.rotation.y = rotY;
  group.add(doorRoot);

  var frameMat = new THREE.MeshStandardMaterial({
    color: isRainbow ? 0x888899 : 0x3a3a42,
    emissive: isRainbow ? 0x442266 : 0x101014,
    emissiveIntensity: isRainbow ? 0.45 : 0.2,
    roughness: 0.85,
    metalness: isRainbow ? 0.15 : 0.05,
  });

  var y0 = DOOR_H * 0.5;
  var lintelH = CORRIDOR_HEIGHT - DOOR_H;
  var sideW = (DOOR_W - 0.08) * 0.5;

  var leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_W, DOOR_H, sideW),
    frameMat
  );
  leftFrame.position.set(-DOOR_W * 0.5 + sideW * 0.5 + FRAME_W * 0.5, y0, 0);
  doorRoot.add(leftFrame);

  var rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_W, DOOR_H, sideW),
    frameMat
  );
  rightFrame.position.set(DOOR_W * 0.5 - sideW * 0.5 - FRAME_W * 0.5, y0, 0);
  doorRoot.add(rightFrame);

  var lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W + FRAME_W * 2, lintelH, FRAME_W),
    frameMat
  );
  lintel.position.set(0, DOOR_H + lintelH * 0.5, 0);
  doorRoot.add(lintel);

  var panelPivot = new THREE.Group();
  panelPivot.position.set(-DOOR_W * 0.5 + 0.06, y0, 0);
  doorRoot.add(panelPivot);

  var panel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.14, DOOR_H - 0.06, DOOR_THICK),
    panelMat
  );
  panel.position.set((DOOR_W - 0.14) * 0.5, 0, DOOR_THICK * 0.5);
  panelPivot.add(panel);

  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W + 0.2, DOOR_H + 0.15, 0.55),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, y0, 0);
  pick.userData.brInteract = { kind: "l2_door", doorId: doorId };
  doorRoot.add(pick);

  var labelMat = new THREE.MeshStandardMaterial({
    color: isRainbow ? 0xffffff : 0xc8c8d0,
    emissive: isRainbow ? 0x6644aa : 0x222228,
    emissiveIntensity: isRainbow ? 0.6 : 0.25,
  });
  var label = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.04), labelMat);
  label.position.set(0, DOOR_H + 0.22, DOOR_THICK + 0.02);
  doorRoot.add(label);

  doorRoot.updateMatrixWorld(true);

  var collider = {
    kind: "wall",
    minX: -999,
    maxX: -998,
    minZ: -999,
    maxZ: -998,
  };
  refreshDoorWorldCollider(doorRoot, collider, panelPivot, false);

  var passage = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  refreshDoorPassage(doorRoot, passage);

  return {
    id: doorId,
    root: doorRoot,
    panelPivot: panelPivot,
    pick: pick,
    collider: collider,
    passage: passage,
    open: false,
    openAmount: 0,
    targetOpen: 0,
  };
}

function refreshDoorWorldCollider(doorRoot, collider, panelPivot, ghost) {
  if (ghost) {
    collider.ghost = true;
    return;
  }
  panelPivot.updateMatrixWorld(true);
  _doorBoxScratch.setFromObject(panelPivot);
  collider.minX = _doorBoxScratch.min.x - 0.04;
  collider.maxX = _doorBoxScratch.max.x + 0.04;
  collider.minZ = _doorBoxScratch.min.z - 0.06;
  collider.maxZ = _doorBoxScratch.max.z + 0.06;
  collider.ghost = false;
}

function refreshDoorPassage(doorRoot, passage) {
  doorRoot.updateMatrixWorld(true);
  _doorBoxScratch.setFromObject(doorRoot);
  passage.minX = _doorBoxScratch.min.x + 0.08;
  passage.maxX = _doorBoxScratch.max.x - 0.08;
  passage.minZ = _doorBoxScratch.min.z + 0.05;
  passage.maxZ = _doorBoxScratch.max.z + 0.55;
}

export function buildLevel2Doors(group, colliders, halfW, halfLen, hubEdge) {
  var layout = getOrCreateLevel2DoorLayout(halfLen, hubEdge);
  var plainMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a52,
    emissive: 0x181820,
    emissiveIntensity: 0.3,
    roughness: 0.88,
    metalness: 0.08,
  });
  var rainbowTex = createRainbowDoorTexture();
  var rainbowMat = new THREE.MeshStandardMaterial({
    map: rainbowTex || undefined,
    color: 0xffffff,
    emissive: 0x553366,
    emissiveIntensity: 0.35,
    roughness: 0.55,
    metalness: 0.1,
  });

  var l1 = buildWallDoor(group, colliders, layout.l1, halfW, halfLen, hubEdge, "l1", plainMat, rainbowMat);
  var l3 = buildWallDoor(group, colliders, layout.l3, halfW, halfLen, hubEdge, "l3", plainMat, rainbowMat);
  l3.l3Dest = layout.l3Dest === "l4" ? "l4" : "l3";
  var l283 = buildWallDoor(
    group,
    colliders,
    layout.l283,
    halfW,
    halfLen,
    hubEdge,
    "l283",
    plainMat,
    rainbowMat
  );

  colliders.push(l1.collider);
  colliders.push(l3.collider);
  colliders.push(l283.collider);

  return {
    layout: layout,
    doors: { l1: l1, l3: l3, l283: l283 },
    interactRoots: [l1.root, l3.root, l283.root],
  };
}

function readStreamingDoorState() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(LEVEL2_STREAM_DOOR_STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeStreamingDoorState(state) {
  try {
    sessionStorage.setItem(LEVEL2_STREAM_DOOR_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* storage may be unavailable */
  }
}

function createStreamingDoorRecord(parent, spec, colliders, interactRoots, state) {
  var root = new THREE.Group();
  root.name = "L2StreamDoor_" + spec.key;
  root.position.set(spec.x, 0, spec.z);
  root.rotation.y = spec.rotation || 0;
  parent.add(root);

  var colors = {
    plain: [0x494b50, 0x191a1e],
    wood: [0x5b3c27, 0x241207],
    rainbow: [0x9a64b4, 0x45215c],
  };
  var palette = colors[spec.style] || colors.plain;
  var frameMat = new THREE.MeshStandardMaterial({
    color: spec.style === "rainbow" ? 0x72727d : 0x34363a,
    roughness: 0.82,
    metalness: 0.22,
  });
  var panelMat = new THREE.MeshStandardMaterial({
    color: palette[0],
    emissive: palette[1],
    emissiveIntensity: spec.style === "rainbow" ? 0.55 : 0.18,
    roughness: spec.style === "wood" ? 0.96 : 0.74,
  });
  var sideL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.18), frameMat);
  sideL.position.set(-0.68, 1.35, 0);
  root.add(sideL);
  var sideR = sideL.clone();
  sideR.position.x = 0.68;
  root.add(sideR);
  var lintel = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 0.18), frameMat);
  lintel.position.set(0, 2.63, 0);
  root.add(lintel);

  // 走廊侧墙已按门洞挖空，这里把门框以外的洞口补回去。
  var extras = [];
  var cutHalf = 0.95;
  var ceiling = Math.max(2.9, Number(spec.height) || CORRIDOR_HEIGHT);
  var headerH = ceiling - 2.7;
  if (headerH > 0.05) {
    var header = new THREE.Mesh(
      new THREE.BoxGeometry(cutHalf * 2, headerH, 0.16),
      frameMat
    );
    header.position.set(0, 2.7 + headerH * 0.5, 0);
    root.add(header);
    extras.push(header);
  }
  var jambW = cutHalf - 0.74;
  if (jambW > 0.02) {
    for (var jamb = -1; jamb <= 1; jamb += 2) {
      var filler = new THREE.Mesh(
        new THREE.BoxGeometry(jambW, 2.7, 0.16),
        frameMat
      );
      filler.position.set(jamb * (0.74 + jambW * 0.5), 1.35, 0);
      root.add(filler);
      extras.push(filler);
    }
  }

  var pivot = new THREE.Group();
  pivot.position.set(-0.6, 1.32, 0);
  root.add(pivot);
  var panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 0.11), panelMat);
  panel.position.x = 0.6;
  pivot.add(panel);
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 2.85, 0.75),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 1.35, 0);
  pick.userData.brInteract = {
    kind: "l2_door",
    doorId: spec.key,
    destination: spec.destination,
  };
  root.add(pick);
  interactRoots.push(root);

  root.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(panel);
  var collider = {
    kind: "wall",
    minX: box.min.x - 0.04,
    maxX: box.max.x + 0.04,
    minZ: box.min.z - 0.04,
    maxZ: box.max.z + 0.04,
    ghost: !!state[spec.key],
  };
  colliders.push(collider);

  var extraColliders = [];
  var extraGeometries = [];
  for (var e = 0; e < extras.length; e++) {
    extraGeometries.push(extras[e].geometry);
    if (extras[e].position.y < 2.7) {
      var jambBox = new THREE.Box3().setFromObject(extras[e]);
      var jambCollider = {
        kind: "wall",
        minX: jambBox.min.x - 0.02,
        maxX: jambBox.max.x + 0.02,
        minZ: jambBox.min.z - 0.02,
        maxZ: jambBox.max.z + 0.02,
      };
      extraColliders.push(jambCollider);
      colliders.push(jambCollider);
    }
  }

  try {
    delete colliders.__brSpatial;
  } catch (err) {
    /* ignore */
  }
  return {
    key: spec.key,
    chunkKey: spec.chunkKey,
    destination: spec.destination,
    style: spec.style,
    root: root,
    pivot: pivot,
    pick: pick,
    collider: collider,
    extraColliders: extraColliders,
    open: !!state[spec.key],
    openAmount: state[spec.key] ? 1 : 0,
    materials: [frameMat, panelMat, pick.material],
    geometries: [sideL.geometry, lintel.geometry, panel.geometry, pick.geometry].concat(
      extraGeometries
    ),
  };
}

/**
 * Dynamic door registry used by the infinite Level 2 world.
 * Door specs are owned by chunks and may be repeatedly loaded/unloaded.
 */
export function createStreamingLevel2Doors(parent, colliders, interactRoots) {
  var active = new Map();
  var state = readStreamingDoorState();

  function loadChunk(chunkKey, specs) {
    for (var i = 0; i < specs.length; i++) {
      var spec = Object.assign({}, specs[i], { chunkKey: chunkKey });
      if (active.has(spec.key)) continue;
      active.set(
        spec.key,
        createStreamingDoorRecord(parent, spec, colliders, interactRoots, state)
      );
    }
  }

  function unloadChunk(chunkKey) {
    var remove = [];
    active.forEach(function (door, key) {
      if (door.chunkKey === chunkKey) remove.push(key);
    });
    for (var i = 0; i < remove.length; i++) {
      var door = active.get(remove[i]);
      active.delete(remove[i]);
      var ci = colliders.indexOf(door.collider);
      if (ci >= 0) colliders.splice(ci, 1);
      (door.extraColliders || []).forEach(function (extra) {
        var xi = colliders.indexOf(extra);
        if (xi >= 0) colliders.splice(xi, 1);
      });
      try {
        delete colliders.__brSpatial;
      } catch (err) {
        /* ignore */
      }
      var ri = interactRoots.indexOf(door.root);
      if (ri >= 0) interactRoots.splice(ri, 1);
      if (door.root.parent) door.root.parent.remove(door.root);
      door.materials.forEach(function (material) { material.dispose(); });
      door.geometries.forEach(function (geometry) { geometry.dispose(); });
    }
  }

  var api = {
    dynamic: true,
    active: active,
    loadChunk: loadChunk,
    unloadChunk: unloadChunk,
    openDoor: function (key) {
      var door = active.get(key);
      if (!door) return false;
      door.open = true;
      door.collider.ghost = true;
      state[key] = true;
      writeStreamingDoorState(state);
      return true;
    },
    update: function (dt) {
      active.forEach(function (door) {
        var target = door.open ? 1 : 0;
        door.openAmount += (target - door.openAmount) * Math.min(1, dt * 6);
        door.pivot.rotation.y = -door.openAmount * Math.PI * 0.56;
      });
    },
    getTransition: function (px, pz) {
      var result = null;
      active.forEach(function (door) {
        if (result || !door.open) return;
        var dx = px - door.root.position.x;
        var dz = pz - door.root.position.z;
        if (dx * dx + dz * dz > 1.5 * 1.5) return;
        result =
          door.destination === "l3_or_l4"
            ? isFastingRunActive()
              ? "l3"
              : ((hashDoorKey(door.key) % 10) < 3 ? "l4" : "l3")
            : door.destination;
      });
      return result;
    },
    dispose: function () {
      var chunks = [];
      active.forEach(function (door) {
        if (chunks.indexOf(door.chunkKey) < 0) chunks.push(door.chunkKey);
      });
      chunks.forEach(unloadChunk);
    },
  };
  return api;
}

function hashDoorKey(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tryOpenLevel2Door(doors, doorId) {
  if (doors && doors.dynamic) return doors.openDoor(doorId);
  if (!doors || !doors[doorId]) return false;
  var d = doors[doorId];
  if (d.open) return true;
  d.open = true;
  d.targetOpen = 1;
  d.collider.ghost = true;
  return true;
}

export function updateLevel2Doors(doors, dt) {
  if (doors && doors.dynamic) {
    doors.update(dt);
    return;
  }
  if (!doors) return;
  var ids = ["l1", "l3", "l283"];
  var i;
  for (i = 0; i < ids.length; i++) {
    var d = doors[ids[i]];
    if (!d) continue;
    var target = d.targetOpen;
    if (Math.abs(d.openAmount - target) > 0.01) {
      d.openAmount += (target - d.openAmount) * Math.min(1, dt * 6);
      d.panelPivot.rotation.y = -d.openAmount * Math.PI * 0.55;
      if (d.openAmount > 0.4) refreshDoorPassage(d.root, d.passage);
    } else {
      d.openAmount = target;
      d.panelPivot.rotation.y = -target * Math.PI * 0.55;
    }
  }
}

export function getLevel2DoorTransition(doors, px, pz) {
  if (doors && doors.dynamic) return doors.getTransition(px, pz);
  if (!doors) return null;
  if (doors.l1 && doors.l1.open && pointInPassage(doors.l1.passage, px, pz)) {
    return "l1";
  }
  if (doors.l3 && doors.l3.open && pointInPassage(doors.l3.passage, px, pz)) {
    // 「断粮巡航」挑战进行中：普通门必定通往 Level 3。
    if (isFastingRunActive()) return "l3";
    return doors.l3.l3Dest === "l4" ? "l4" : "l3";
  }
  if (doors.l283 && doors.l283.open && pointInPassage(doors.l283.passage, px, pz)) {
    return "l283";
  }
  return null;
}

function pointInPassage(box, px, pz) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

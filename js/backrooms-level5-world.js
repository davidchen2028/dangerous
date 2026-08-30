/**
 * Level 5「恐怖旅馆」流式世界。
 * 固定出生大厅连接无限客房翼与东侧锅炉房；区块只在玩家附近装配。
 */
import * as THREE from "three";
import { createPointLightPool } from "./backrooms-point-light-pool.js";
import {
  L5_CHUNK_SIZE,
  L5_WALL_HEIGHT,
  L5_STREAM_RADIUS,
  L5_UNLOAD_RADIUS,
  L5_SPAWN_X,
  L5_SPAWN_Z,
  getLevel5ChunkLayout,
  level5WorldToChunk,
  level5ChunkCenter,
} from "./backrooms-level5-layout.js";

const HALF = L5_CHUNK_SIZE * 0.5;
const DOOR_HALF = 1.45;
const WALL_THICK = 0.32;
const STATE_KEY = "backrooms_l5_state_v1";

function readState() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function pushCollider(list, minX, maxX, minZ, maxZ) {
  var c = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, ghost: false };
  list.push(c);
  return c;
}

function disposeObject(root) {
  root.traverse(function (node) {
    if (node.geometry) node.geometry.dispose();
    if (node.userData && node.userData.l5OwnMaterial && node.material) {
      var mats = Array.isArray(node.material) ? node.material : [node.material];
      for (var i = 0; i < mats.length; i++) {
        if (mats[i].map) mats[i].map.dispose();
        mats[i].dispose();
      }
    }
  });
}

function makeSignTexture(text, fg, bg) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = bg || "#271a13";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#b99a65";
  ctx.lineWidth = 12;
  ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  ctx.fillStyle = fg || "#e8d7ac";
  ctx.font = "bold 54px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.52);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addWallSegment(chunk, x, z, sx, sz, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, L5_WALL_HEIGHT, sz), mat);
  mesh.position.set(x, L5_WALL_HEIGHT * 0.5, z);
  chunk.group.add(mesh);
  pushCollider(
    chunk.colliders,
    x - sx * 0.5,
    x + sx * 0.5,
    z - sz * 0.5,
    z + sz * 0.5
  );
}

function addPerimeter(chunk, center, mats) {
  var sideLen = HALF - DOOR_HALF;
  // 北、南墙，各在中央留门。
  addWallSegment(
    chunk,
    center.x - (HALF + DOOR_HALF) * 0.5,
    center.z - HALF,
    sideLen,
    WALL_THICK,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x + (HALF + DOOR_HALF) * 0.5,
    center.z - HALF,
    sideLen,
    WALL_THICK,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x - (HALF + DOOR_HALF) * 0.5,
    center.z + HALF,
    sideLen,
    WALL_THICK,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x + (HALF + DOOR_HALF) * 0.5,
    center.z + HALF,
    sideLen,
    WALL_THICK,
    mats.wall
  );
  // 东、西墙。
  addWallSegment(
    chunk,
    center.x - HALF,
    center.z - (HALF + DOOR_HALF) * 0.5,
    WALL_THICK,
    sideLen,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x - HALF,
    center.z + (HALF + DOOR_HALF) * 0.5,
    WALL_THICK,
    sideLen,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x + HALF,
    center.z - (HALF + DOOR_HALF) * 0.5,
    WALL_THICK,
    sideLen,
    mats.wall
  );
  addWallSegment(
    chunk,
    center.x + HALF,
    center.z + (HALF + DOOR_HALF) * 0.5,
    WALL_THICK,
    sideLen,
    mats.wall
  );
}

function addFloorAndCeiling(chunk, center, mats) {
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(L5_CHUNK_SIZE, L5_CHUNK_SIZE),
    mats.floor
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.set(center.x, 0, center.z);
  chunk.group.add(floor);
  var ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(L5_CHUNK_SIZE, L5_CHUNK_SIZE),
    mats.ceiling
  );
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.set(center.x, L5_WALL_HEIGHT, center.z);
  chunk.group.add(ceiling);
}

function addLamp(chunk, x, z, zone, mats) {
  var fixture = new THREE.Mesh(
    zone === "boiler"
      ? new THREE.BoxGeometry(0.8, 0.08, 0.22)
      : new THREE.CylinderGeometry(0.28, 0.42, 0.26, 12),
    zone === "boiler" ? mats.emergency : mats.brass
  );
  fixture.position.set(x, L5_WALL_HEIGHT - 0.18, z);
  chunk.group.add(fixture);
  chunk.lights.push({
    x: x,
    y: L5_WALL_HEIGHT - 0.35,
    z: z,
    intensity: zone === "boiler" ? 0.52 : 0.76,
    distance: zone === "boiler" ? 11 : 13,
    zone: zone,
    phase: Math.random() * Math.PI * 2,
  });
}

function addGuestDoor(chunk, x, z, rot, index, mats) {
  var group = new THREE.Group();
  var frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.45, 0.18), mats.trim);
  frame.position.y = 1.23;
  group.add(frame);
  var door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.2, 0.1), mats.door);
  door.position.set(0, 1.12, 0.1);
  group.add(door);
  var knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.brass);
  knob.position.set(0.43, 1.08, 0.18);
  group.add(knob);
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 2.25, 0.8),
    mats.pick
  );
  pick.position.set(0, 1.12, 0.35);
  pick.userData.brInteract = {
    kind: "l5_guest_door",
    id: "room-" + chunk.key + "-" + index,
    room: 100 + Math.abs(chunk.cx * 31 + chunk.cz * 7 + index),
  };
  group.add(pick);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  chunk.group.add(group);
  chunk.interacts.push(pick);
}

function addLobby(chunk, center, mats) {
  var carpet = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), mats.carpet);
  carpet.rotation.x = -Math.PI * 0.5;
  carpet.position.set(center.x, 0.012, center.z + 1);
  chunk.group.add(carpet);

  var desk = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 1.25), mats.wood);
  desk.position.set(center.x, 0.6, center.z - 6.4);
  chunk.group.add(desk);
  pushCollider(
    chunk.colliders,
    center.x - 3.5,
    center.x + 3.5,
    center.z - 7.05,
    center.z - 5.75
  );

  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.1, 1.6),
    new THREE.MeshBasicMaterial({ map: makeSignTexture("THE TERROR HOTEL") })
  );
  sign.userData.l5OwnMaterial = true;
  sign.position.set(center.x, 2.4, center.z - 5.72);
  chunk.group.add(sign);

  var elevator = new THREE.Group();
  var frame = new THREE.Mesh(new THREE.BoxGeometry(3, 2.9, 0.18), mats.trim);
  frame.position.y = 1.45;
  elevator.add(frame);
  var panels = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.55, 0.1), mats.metal);
  panels.position.set(0, 1.3, 0.1);
  elevator.add(panels);
  var pick = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.7, 0.8), mats.pick);
  pick.position.set(0, 1.35, 0.35);
  pick.userData.brInteract = { kind: "l5_exit_l4" };
  elevator.add(pick);
  elevator.position.set(center.x + 7.5, 0, center.z - 5.5);
  chunk.group.add(elevator);
  chunk.interacts.push(pick);
}

function addGrandHallFurniture(chunk, center, layout, mats) {
  if (layout.variant % 2 === 0) {
    var table = new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 2.4), mats.wood);
    table.position.set(center.x, 0.85, center.z);
    chunk.group.add(table);
    for (var i = -2; i <= 2; i++) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.16), mats.wood);
      leg.position.set(center.x + i * 1.35, 0.43, center.z);
      chunk.group.add(leg);
    }
    pushCollider(
      chunk.colliders,
      center.x - 3.5,
      center.x + 3.5,
      center.z - 1.2,
      center.z + 1.2
    );
  } else {
    addWallSegment(chunk, center.x, center.z, 0.34, 9, mats.wall);
  }
  addGuestDoor(chunk, center.x - 7, center.z - 4.5, Math.PI * 0.5, 0, mats);
  addGuestDoor(chunk, center.x - 7, center.z + 4.5, Math.PI * 0.5, 1, mats);
}

function addBoilerFurniture(chunk, center, layout, mats) {
  for (var i = -1; i <= 1; i++) {
    var tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 2.5, 12),
      mats.metal
    );
    tank.position.set(center.x + i * 4.2, 1.25, center.z + 2.5);
    chunk.group.add(tank);
    pushCollider(
      chunk.colliders,
      tank.position.x - 1.05,
      tank.position.x + 1.05,
      tank.position.z - 1.05,
      tank.position.z + 1.05
    );
  }
  var pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 12, 8),
    mats.pipe
  );
  pipe.rotation.z = Math.PI * 0.5;
  pipe.position.set(center.x, 2.65, center.z - 4.2);
  chunk.group.add(pipe);

  if (layout.exit === "l6") {
    var tunnel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 0.2), mats.void);
    tunnel.position.set(center.x + HALF - 0.24, 1.4, center.z);
    chunk.group.add(tunnel);
    var pick = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 1), mats.pick);
    pick.position.set(center.x + HALF - 0.7, 1.3, center.z);
    pick.userData.brInteract = { kind: "l5_exit_l6" };
    chunk.group.add(pick);
    chunk.interacts.push(pick);
  }
}

function addLoot(chunk, center, spec, mats, taken) {
  if (taken[spec.id]) return;
  var group = new THREE.Group();
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), mats.loot);
  box.position.y = 0.18;
  group.add(box);
  var pick = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), mats.pick);
  pick.position.y = 0.55;
  pick.userData.brInteract = {
    kind: "l5_loot",
    id: spec.id,
    itemId: spec.itemId,
    name: spec.itemId === "almond_water" ? "杏仁水" : "小块可爆炸火盐",
  };
  group.add(pick);
  group.position.set(center.x + spec.x, 0, center.z + spec.z);
  chunk.group.add(group);
  chunk.interacts.push(pick);
  chunk.loot.push({ id: spec.id, group: group, pick: pick });
}

function addRecord(chunk, center, spec, mats) {
  var paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.58), mats.paper);
  paper.position.set(center.x + spec.x, 0.04, center.z + spec.z);
  paper.userData.brInteract = {
    kind: "l5_record",
    id: spec.id,
    text:
      chunk.zone === "boiler"
        ? "锅炉员日志：不要回应管道里的敲击声。它并不是从管道里传来的。"
        : "褪色的入住登记：同一个房号被重复写了几十次，却没有退房日期。",
  };
  chunk.group.add(paper);
  chunk.interacts.push(paper);
}

function addSteam(chunk, center, spec, mats) {
  var vent = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 8), mats.pipe);
  vent.rotation.x = Math.PI * 0.5;
  vent.position.set(center.x + spec.x, 0.45, center.z + spec.z);
  chunk.group.add(vent);
  var plume = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.72, 2.6, 8, 1, true),
    mats.steam
  );
  plume.position.set(vent.position.x, 1.55, vent.position.z);
  chunk.group.add(plume);
  chunk.steam.push({
    x: vent.position.x,
    z: vent.position.z,
    phase: Math.random() * Math.PI * 2,
    kind: "steam",
    activeUntil: Infinity,
    plume: plume,
  });
}

export function buildLevel5World(root, opts) {
  opts = opts || {};
  var seed = opts.seed || "terror-hotel";
  var gfx = opts.gfxProfile || {};
  var chunks = new Map();
  var colliders = [];
  var interacts = [];
  var lightCandidates = [];
  var entitySpecs = [];
  var steamHazards = [];
  var state = readState();
  var taken = state.taken || Object.create(null);

  var mats = {
    lobbyWall: new THREE.MeshStandardMaterial({ color: 0x6e3f31, roughness: 0.85 }),
    hallWall: new THREE.MeshStandardMaterial({ color: 0x695142, roughness: 0.9 }),
    boilerWall: new THREE.MeshStandardMaterial({ color: 0x343536, roughness: 0.95 }),
    lobbyFloor: new THREE.MeshStandardMaterial({ color: 0x2d1917, roughness: 0.9 }),
    hallFloor: new THREE.MeshStandardMaterial({ color: 0x3b2520, roughness: 0.92 }),
    boilerFloor: new THREE.MeshStandardMaterial({ color: 0x242526, roughness: 1 }),
    lobbyCeiling: new THREE.MeshStandardMaterial({ color: 0x8a755d, roughness: 0.9 }),
    hallCeiling: new THREE.MeshStandardMaterial({ color: 0x6f6255, roughness: 0.95 }),
    boilerCeiling: new THREE.MeshStandardMaterial({ color: 0x292a2b, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x3c2118, roughness: 0.72 }),
    door: new THREE.MeshStandardMaterial({ color: 0x4b281c, roughness: 0.76 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x21140f, roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb18b4e, metalness: 0.65, roughness: 0.34 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55595b, metalness: 0.5, roughness: 0.72 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x725c49, metalness: 0.6, roughness: 0.65 }),
    emergency: new THREE.MeshBasicMaterial({ color: 0xa33a26 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x6b1717, roughness: 0.95 }),
    loot: new THREE.MeshStandardMaterial({ color: 0xc3b68a, roughness: 0.82 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd2c9a8, roughness: 1 }),
    steam: new THREE.MeshBasicMaterial({
      color: 0xd7dde0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    void: new THREE.MeshBasicMaterial({ color: 0x010101 }),
    pick: new THREE.MeshBasicMaterial({ visible: false }),
  };

  var pool = createPointLightPool(root, {
    count: Math.max(2, Math.min(7, gfx.pointLightBudget || 6)),
    color: 0xffd79a,
    distance: 13,
    decay: 1.6,
    y: L5_WALL_HEIGHT - 0.35,
    name: "L5PooledLight",
  });
  var ambient = new THREE.AmbientLight(0x6f5545, 0.42);
  var hemi = new THREE.HemisphereLight(0x9b795c, 0x17100d, 0.32);
  root.add(ambient, hemi);

  function removeRefs(all, owned) {
    for (var i = 0; i < owned.length; i++) {
      var at = all.indexOf(owned[i]);
      if (at >= 0) all.splice(at, 1);
    }
  }

  function buildChunk(cx, cz) {
    var key = cx + ":" + cz;
    if (chunks.has(key)) return;
    var layout = getLevel5ChunkLayout(seed, cx, cz);
    var center = level5ChunkCenter(cx, cz);
    var group = new THREE.Group();
    group.name = "L5Chunk_" + key;
    root.add(group);
    var chunk = {
      key: key,
      cx: cx,
      cz: cz,
      zone: layout.zone,
      group: group,
      colliders: [],
      interacts: [],
      lights: [],
      entities: [],
      steam: [],
      loot: [],
    };
    var zoneMats =
      layout.zone === "lobby"
        ? { wall: mats.lobbyWall, floor: mats.lobbyFloor, ceiling: mats.lobbyCeiling }
        : layout.zone === "boiler"
          ? { wall: mats.boilerWall, floor: mats.boilerFloor, ceiling: mats.boilerCeiling }
          : { wall: mats.hallWall, floor: mats.hallFloor, ceiling: mats.hallCeiling };
    addFloorAndCeiling(chunk, center, zoneMats);
    addPerimeter(chunk, center, zoneMats);
    addLamp(chunk, center.x, center.z, layout.zone, mats);
    addLamp(chunk, center.x - 7, center.z + 7, layout.zone, mats);
    addLamp(chunk, center.x + 7, center.z - 7, layout.zone, mats);

    if (layout.zone === "lobby") addLobby(chunk, center, mats);
    else if (layout.zone === "grand_hall") addGrandHallFurniture(chunk, center, layout, mats);
    else addBoilerFurniture(chunk, center, layout, mats);

    for (var li = 0; li < layout.loot.length; li++) {
      addLoot(chunk, center, layout.loot[li], mats, taken);
    }
    for (var ri = 0; ri < layout.records.length; ri++) {
      addRecord(chunk, center, layout.records[ri], mats);
    }
    for (var si = 0; si < layout.steam.length; si++) {
      addSteam(chunk, center, layout.steam[si], mats);
    }
    for (var ei = 0; ei < layout.entities.length; ei++) {
      var es = layout.entities[ei];
      chunk.entities.push({
        id: "l5-entity-" + key + "-" + ei,
        kind: es.kind,
        zone: layout.zone,
        x: center.x + (ei % 2 ? 5.5 : -5.5),
        z: center.z + (ei % 3 - 1) * 4.2,
        rotation: ei * 1.7,
        seed: Math.abs(cx * 997 + cz * 313 + ei * 71),
        waypoints: [
          { x: center.x - 6, z: center.z },
          { x: center.x + 6, z: center.z },
        ],
      });
    }

    chunks.set(key, chunk);
    colliders.push.apply(colliders, chunk.colliders);
    delete colliders.__brSpatial;
    interacts.push.apply(interacts, chunk.interacts);
    lightCandidates.push.apply(lightCandidates, chunk.lights);
    entitySpecs.push.apply(entitySpecs, chunk.entities);
    steamHazards.push.apply(steamHazards, chunk.steam);
  }

  function unloadChunk(chunk) {
    if (!chunk || (chunk.cx === 0 && chunk.cz === 0)) return;
    removeRefs(colliders, chunk.colliders);
    delete colliders.__brSpatial;
    removeRefs(interacts, chunk.interacts);
    removeRefs(lightCandidates, chunk.lights);
    removeRefs(entitySpecs, chunk.entities);
    removeRefs(steamHazards, chunk.steam);
    if (chunk.group.parent) chunk.group.parent.remove(chunk.group);
    disposeObject(chunk.group);
    chunks.delete(chunk.key);
  }

  function update(px, pz, now) {
    var here = level5WorldToChunk(px, pz);
    for (var dz = -L5_STREAM_RADIUS; dz <= L5_STREAM_RADIUS; dz++) {
      for (var dx = -L5_STREAM_RADIUS; dx <= L5_STREAM_RADIUS; dx++) {
        buildChunk(here.cx + dx, here.cz + dz);
      }
    }
    var loaded = Array.from(chunks.values());
    for (var i = 0; i < loaded.length; i++) {
      if (
        Math.max(Math.abs(loaded[i].cx - here.cx), Math.abs(loaded[i].cz - here.cz)) >
        L5_UNLOAD_RADIUS
      ) {
        unloadChunk(loaded[i]);
      }
    }
    for (var lc = 0; lc < lightCandidates.length; lc++) {
      var light = lightCandidates[lc];
      var flicker = 0.92 + Math.sin((now || 0) * 0.006 + light.phase) * 0.08;
      light.intensity =
        (light.zone === "boiler" ? 0.52 : 0.76) *
        flicker;
    }
    for (var sv = 0; sv < steamHazards.length; sv++) {
      var steam = steamHazards[sv];
      if (!steam.plume) continue;
      var pulse = 0.88 + Math.sin((now || 0) * 0.004 + steam.phase) * 0.16;
      steam.plume.scale.set(pulse, 0.9 + pulse * 0.16, pulse);
      steam.plume.rotation.y += 0.006;
    }
    pool.update(px, pz, lightCandidates);
    var zone = getLevel5ChunkLayout(seed, here.cx, here.cz).zone;
    var inSteam = false;
    for (var sh = 0; sh < steamHazards.length; sh++) {
      if (Math.hypot(px - steamHazards[sh].x, pz - steamHazards[sh].z) < 2.1) {
        inSteam = true;
        break;
      }
    }
    ambient.intensity = zone === "boiler" ? 0.2 : 0.42;
    hemi.intensity = zone === "boiler" ? 0.18 : 0.32;
    return {
      zone: zone,
      spawnSafe: zone === "lobby",
      inSteam: inSteam,
      sanityDrainPerSec: zone === "lobby" ? 0.01 : zone === "boiler" ? 0.12 : 0.05,
      movementMultiplier: inSteam ? 0.78 : 1,
    };
  }

  function consumeLoot(id) {
    taken[id] = true;
    state.taken = taken;
    writeState(state);
    chunks.forEach(function (chunk) {
      for (var i = chunk.loot.length - 1; i >= 0; i--) {
        var item = chunk.loot[i];
        if (item.id !== id) continue;
        var at = interacts.indexOf(item.pick);
        if (at >= 0) interacts.splice(at, 1);
        delete item.pick.userData.brInteract;
        if (item.group.parent) item.group.parent.remove(item.group);
        chunk.loot.splice(i, 1);
      }
    });
  }

  function openGuestDoor(id) {
    if (!state.openedDoors) state.openedDoors = Object.create(null);
    var first = !state.openedDoors[id];
    state.openedDoors[id] = true;
    writeState(state);
    return first;
  }

  return {
    update: update,
    colliders: colliders,
    interactRoots: interacts,
    spawnX: L5_SPAWN_X,
    spawnZ: L5_SPAWN_Z,
    getEntitySpawns: function () { return entitySpecs; },
    getSteamHazards: function () { return steamHazards; },
    getLoadedChunkCount: function () { return chunks.size; },
    consumeLoot: consumeLoot,
    openGuestDoor: openGuestDoor,
    getState: function () { return state; },
    dispose: function () {
      Array.from(chunks.values()).forEach(function (chunk) {
        if (chunk.group.parent) chunk.group.parent.remove(chunk.group);
        disposeObject(chunk.group);
      });
      chunks.clear();
      colliders.length = 0;
      interacts.length = 0;
      lightCandidates.length = 0;
      entitySpecs.length = 0;
      steamHazards.length = 0;
      pool.dispose();
      if (ambient.parent) ambient.parent.remove(ambient);
      if (hemi.parent) hemi.parent.remove(hemi);
      Object.keys(mats).forEach(function (key) { mats[key].dispose(); });
    },
  };
}

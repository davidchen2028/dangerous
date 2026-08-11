/**
 * Level 283 — 7×7 入场房 · 休息区 · 管道 · 海洋球池
 */
import * as THREE from "three";

export const L283_ROOM_SIZE = 7;
export const L283_WALL_H = 3.2;
export const L283_SPAWN_YAW = 0;

const REST_W = 11;
const REST_LEN = 13;
const BALL_ZONE_LEN = 10;
const PIPE_LEN = 28;
const PIPE_R = 0.55;
const WALL_T = 0.14;
const DOOR_H = 2.45;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function pickMat(color, emissive) {
  return new THREE.MeshStandardMaterial({
    color: color,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.2 : 0,
    roughness: 0.88,
  });
}

function rainbowStripeTexture() {
  var w = 64;
  var h = 64;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  var colors = ["#ff5588", "#ffaa33", "#ffee55", "#55dd88", "#55bbff", "#8855ff"];
  var i;
  for (i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, (h / colors.length) * i, w, h / colors.length + 1);
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function clownPaintingTexture() {
  var w = 256;
  var h = 320;
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  var ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#6a5040";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#2a1810";
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = "#e8c040";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.42, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(w * 0.38, h * 0.38, w * 0.05, 0, Math.PI * 2);
  ctx.arc(w * 0.62, h * 0.38, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cc2222";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.48, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a0808";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.55, w * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function furnitureCollider(colliders, minX, maxX, minZ, maxZ) {
  colliders.push({ kind: "prop", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ });
}

function addWallZ(group, x0, x1, z, mat, h) {
  var w = x1 - x0;
  if (w < 0.2) return;
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, WALL_T), mat);
  m.position.set((x0 + x1) * 0.5, h * 0.5, z);
  group.add(m);
}

function addDoorLintelZ(group, x0, x1, z, mat, wallH) {
  var lintelH = wallH - DOOR_H;
  if (lintelH < 0.15) return;
  var m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, lintelH, WALL_T), mat);
  m.position.set((x0 + x1) * 0.5, DOOR_H + lintelH * 0.5, z);
  group.add(m);
}

function addWallX(group, z0, z1, x, mat, h) {
  var d = z1 - z0;
  if (d < 0.2) return;
  var m = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, h, d), mat);
  m.position.set(x, h * 0.5, (z0 + z1) * 0.5);
  group.add(m);
}

function addTable(parent, colliders, x, z, idx) {
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  var top = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.06, 0.85),
    pickMat(0xf0ece4)
  );
  top.position.y = 0.72;
  g.add(top);
  var legMat = pickMat(0xc8b898);
  var lx;
  var lz;
  for (lx = -1; lx <= 1; lx += 2) {
    for (lz = -1; lz <= 1; lz += 2) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), legMat);
      leg.position.set(lx * 0.32, 0.36, lz * 0.32);
      g.add(leg);
    }
  }
  furnitureCollider(colliders, x - 0.46, x + 0.46, z - 0.46, z + 0.46);
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.9, 0.95),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(0, 0.45, 0);
  pick.userData.brInteract = { kind: "l283_table", tableId: idx };
  g.add(pick);
  parent.add(g);
  return pick;
}

function addSofa(parent, colliders, x, z, rotY) {
  var g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY || 0;
  var mat = pickMat(0xd85858);
  var seat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.32, 0.72), mat);
  seat.position.y = 0.38;
  g.add(seat);
  var back = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.16), mat);
  back.position.set(0, 0.62, -0.28);
  g.add(back);
  var hw = 0.58;
  var hd = 0.42;
  var c = Math.abs(Math.cos(rotY || 0));
  var s = Math.abs(Math.sin(rotY || 0));
  var ex = hw * c + hd * s;
  var ez = hw * s + hd * c;
  furnitureCollider(colliders, x - ex, x + ex, z - ez, z + ez);
  parent.add(g);
}

function addDoorFrame(parent, x, y, z, rotY, mat) {
  var g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY || 0;
  var postL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), mat);
  postL.position.set(-1.05, 1.25, 0);
  g.add(postL);
  var postR = postL.clone();
  postR.position.x = 1.05;
  g.add(postR);
  var lintel = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.12, 0.14), mat);
  lintel.position.set(0, 2.48, 0);
  g.add(lintel);
  parent.add(g);
}

function addBallPit(parent, cx, cz, w, d) {
  var g = new THREE.Group();
  g.name = "L283BallPit";
  g.position.set(cx, 0, cz);
  var floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.35, d),
    pickMat(0x2a4068)
  );
  floor.position.y = -0.12;
  g.add(floor);
  var ballColors = [0xff4466, 0xffcc33, 0x44dd88, 0x5599ff, 0xff88cc, 0x88ffee];
  var i;
  for (i = 0; i < 120; i++) {
    var bx = (Math.random() - 0.5) * (w - 0.6);
    var bz = (Math.random() - 0.5) * (d - 0.6);
    var by = 0.08 + Math.random() * 0.55;
    var ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 + Math.random() * 0.06, 6, 6),
      pickMat(ballColors[i % ballColors.length], 0x111111)
    );
    ball.position.set(bx, by, bz);
    g.add(ball);
  }
  parent.add(g);
}

/**
 * @param {THREE.Group} root
 */
export function buildLevel283World(root) {
  var colliders = [];
  var interactRoots = [];
  var halfRoom = L283_ROOM_SIZE * 0.5;
  var roomMinZ = -L283_ROOM_SIZE - 1;
  var roomMaxZ = -1;
  var restMinZ = -1;
  var restMaxZ = restMinZ + REST_LEN;
  var ballMinZ = restMaxZ;
  var ballMaxZ = ballMinZ + BALL_ZONE_LEN;

  var group = new THREE.Group();
  group.name = "Level283World";
  root.add(group);

  var partyTex = rainbowStripeTexture();
  var wallMat = new THREE.MeshStandardMaterial({
    map: partyTex || undefined,
    color: 0xffffff,
    emissive: 0x334466,
    emissiveIntensity: 0.22,
    roughness: 0.82,
  });
  var ceilMat = pickMat(0xfff8ee, 0x221810);
  var floorMat = pickMat(0xe8dcc8);
  var restFloorMat = pickMat(0xc9b898);
  var woodMat = pickMat(0x8a6848, 0x201008);

  function addBox(w, h, d, x, y, z, mat) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  var halfShell = REST_W * 0.5;

  // —— 7×7 入场房（地板/天花；外墙与休息区统一 11m 宽）——
  addBox(L283_ROOM_SIZE, 0.12, L283_ROOM_SIZE, 0, 0.06, (roomMinZ + roomMaxZ) * 0.5, floorMat);
  addBox(L283_ROOM_SIZE, 0.1, L283_ROOM_SIZE, 0, L283_WALL_H, (roomMinZ + roomMaxZ) * 0.5, ceilMat);
  addBox(REST_W, L283_WALL_H, WALL_T, 0, L283_WALL_H * 0.5, roomMinZ, wallMat);
  colliders.push(wallCollider(-halfShell, halfShell, roomMinZ - WALL_T, roomMinZ));

  var doorHalf = 1.12;
  addWallZ(group, -halfShell, -doorHalf, roomMaxZ, wallMat, L283_WALL_H);
  addWallZ(group, doorHalf, halfShell, roomMaxZ, wallMat, L283_WALL_H);
  addDoorLintelZ(group, -doorHalf, doorHalf, roomMaxZ, wallMat, L283_WALL_H);
  colliders.push(wallCollider(-halfShell, -doorHalf, roomMaxZ, roomMaxZ + WALL_T));
  colliders.push(wallCollider(doorHalf, halfShell, roomMaxZ, roomMaxZ + WALL_T));
  addDoorFrame(group, 0, 0, roomMaxZ + 0.02, 0, woodMat);

  var tablePicks = [];
  var tableSpots = [
    [-2, -5.5],
    [0, -5.5],
    [2, -5.5],
    [-2, -3.5],
    [0, -3.5],
    [2, -3.5],
    [0, -4.5],
  ];
  var ti;
  for (ti = 0; ti < 7; ti++) {
    tablePicks.push(addTable(group, colliders, tableSpots[ti][0], tableSpots[ti][1], ti));
  }

  var sofaSpots = [
    [-2.8, -2.3, Math.PI * 0.5],
    [2.8, -2.3, -Math.PI * 0.5],
    [-2.8, -6.2, Math.PI * 0.5],
    [2.8, -6.2, -Math.PI * 0.5],
    [-1.2, -7.2, 0],
    [1.2, -7.2, 0],
    [0, -2.0, Math.PI],
  ];
  var si;
  for (si = 0; si < 7; si++) {
    addSofa(group, colliders, sofaSpots[si][0], sofaSpots[si][1], sofaSpots[si][2]);
  }

  // —— 休息区 ——
  var restMidZ = (restMinZ + restMaxZ) * 0.5;
  addBox(REST_W, 0.12, REST_LEN, 0, 0.06, restMidZ, restFloorMat);
  addBox(REST_W, 0.1, REST_LEN, 0, L283_WALL_H, restMidZ, ceilMat);

  addWallZ(group, -halfShell, -doorHalf, restMaxZ, wallMat, L283_WALL_H);
  addWallZ(group, doorHalf, halfShell, restMaxZ, wallMat, L283_WALL_H);
  addDoorLintelZ(group, -doorHalf, doorHalf, restMaxZ, wallMat, L283_WALL_H);
  colliders.push(wallCollider(-halfShell, -doorHalf, restMaxZ, restMaxZ + WALL_T));
  colliders.push(wallCollider(doorHalf, halfShell, restMaxZ, restMaxZ + WALL_T));
  addDoorFrame(group, 0, 0, restMaxZ + 0.02, 0, woodMat);

  var paintingX = REST_W * 0.5 - 0.1;
  var paintingZ = restMinZ + 4.5;
  var clownTex = clownPaintingTexture();
  var painting = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.75),
    new THREE.MeshStandardMaterial({
      map: clownTex || undefined,
      color: 0xffffff,
      roughness: 0.9,
      emissive: 0x332208,
      emissiveIntensity: 0.22,
    })
  );
  painting.position.set(paintingX, 1.55, paintingZ);
  painting.rotation.y = -Math.PI * 0.5;
  group.add(painting);
  var paintPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.2, 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  paintPick.position.set(paintingX - 0.75, 1.55, paintingZ);
  paintPick.userData.brInteract = { kind: "l283_painting" };
  group.add(paintPick);
  interactRoots.push(paintPick);
  var paintLight = new THREE.PointLight(0xffddaa, 0.65, 5, 2);
  paintLight.position.set(paintingX - 1.2, 1.8, paintingZ);
  group.add(paintLight);

  var floorExitX = -2.2;
  var floorExitZ = restMinZ + 2.2;
  var floorExit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0x88aa66,
      emissive: 0x223311,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  );
  floorExit.rotation.x = -Math.PI * 0.5;
  floorExit.position.set(floorExitX, 0.02, floorExitZ);
  group.add(floorExit);
  addBox(1.6, 0.04, 1.6, floorExitX, 0.04, floorExitZ, pickMat(0x668844, 0x112208));
  var floorPick = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  floorPick.rotation.x = -Math.PI * 0.5;
  floorPick.position.set(floorExitX, 0.02, floorExitZ);
  floorPick.userData.brInteract = { kind: "l283_floor_exit" };
  group.add(floorPick);
  interactRoots.push(floorPick);

  addSofa(group, colliders, 2.5, restMinZ + 3, Math.PI * 0.5);
  addSofa(group, colliders, -2.5, restMinZ + 8, -Math.PI * 0.5);

  // —— 球池区 ——
  var ballMidZ = (ballMinZ + ballMaxZ) * 0.5;
  addBox(REST_W, 0.12, BALL_ZONE_LEN, 0, 0.06, ballMidZ, pickMat(0x5a88cc));
  addBox(REST_W, 0.1, BALL_ZONE_LEN, 0, L283_WALL_H, ballMidZ, ceilMat);
  addBox(REST_W, L283_WALL_H, WALL_T, 0, L283_WALL_H * 0.5, ballMaxZ, wallMat);
  colliders.push(wallCollider(-halfShell, halfShell, ballMaxZ, ballMaxZ + WALL_T));

  addBallPit(group, 1.2, ballMidZ + 1.5, 5.5, 5.5);

  // 统一外墙（11m 宽，从入场房北墙到球池南墙）
  addWallX(group, roomMinZ, ballMaxZ, -halfShell, wallMat, L283_WALL_H);
  colliders.push(wallCollider(-halfShell - WALL_T, -halfShell, roomMinZ, ballMaxZ));
  addWallX(group, roomMinZ, ballMaxZ, halfShell, wallMat, L283_WALL_H);
  colliders.push(wallCollider(halfShell, halfShell + WALL_T, roomMinZ, ballMaxZ));

  // 管道 + 木门（休息区东墙 · 小丑画作旁）
  var pipeStartX = paintingX - 1.35;
  var pipeStartZ = paintingZ - 0.85;
  var pipeMouth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.35, 12, 1, true),
    pickMat(0x5a6068, 0x101418)
  );
  pipeMouth.rotation.x = Math.PI * 0.5;
  pipeMouth.rotation.z = Math.PI * 0.5;
  pipeMouth.position.set(pipeStartX, 0.55, pipeStartZ);
  group.add(pipeMouth);
  var pipeEnterPick = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pipeEnterPick.position.set(pipeStartX, 0.55, pipeStartZ);
  pipeEnterPick.userData.brInteract = { kind: "l283_pipe_enter" };
  group.add(pipeEnterPick);
  interactRoots.push(pipeEnterPick);

  var woodDoorX = pipeStartX - 0.95;
  var woodDoorZ = paintingZ + 0.55;
  var woodDoor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.85), woodMat);
  woodDoor.position.set(woodDoorX, 0.55, woodDoorZ);
  group.add(woodDoor);
  var pipeDoorPick = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.2, 1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pipeDoorPick.position.copy(woodDoor.position);
  pipeDoorPick.userData.brInteract = { kind: "l283_pipe_door" };
  group.add(pipeDoorPick);
  interactRoots.push(pipeDoorPick);

  var pipeGroup = new THREE.Group();
  pipeGroup.name = "L283PipeInterior";
  pipeGroup.visible = false;
  var pz;
  for (pz = 0; pz < PIPE_LEN; pz += 2.5) {
    var seg = new THREE.Mesh(
      new THREE.CylinderGeometry(PIPE_R, PIPE_R, 2.6, 10, 1, true),
      pickMat(0x4a5058, 0x080810)
    );
    seg.rotation.x = Math.PI * 0.5;
    seg.position.set(pipeStartX, 0.55, pipeStartZ + 1.5 + pz);
    pipeGroup.add(seg);
  }
  group.add(pipeGroup);

  var pickIdx;
  for (pickIdx = 0; pickIdx < tablePicks.length; pickIdx++) {
    interactRoots.push(tablePicks[pickIdx]);
  }

  var amb = new THREE.AmbientLight(0xffeedd, 0.72);
  group.add(amb);
  var pl = new THREE.PointLight(0xffeecc, 1.1, 16, 1.4);
  pl.position.set(0, 2.4, roomMinZ + 2);
  group.add(pl);
  var pl2 = new THREE.PointLight(0xaaccff, 0.85, 14, 1.5);
  pl2.position.set(0, 2.2, ballMidZ);
  group.add(pl2);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    pipeGroup: pipeGroup,
    spawnX: 0,
    spawnZ: roomMinZ + 2.2,
    spawnYaw: L283_SPAWN_YAW,
    zones: {
      entryRoom: { minX: -halfRoom, maxX: halfRoom, minZ: roomMinZ, maxZ: roomMaxZ },
      restArea: { minX: -REST_W * 0.5, maxX: REST_W * 0.5, minZ: restMinZ, maxZ: restMaxZ },
      ballPit: { minX: -2.5, maxX: 5.5, minZ: ballMinZ + 0.5, maxZ: ballMaxZ - 0.5 },
    },
    pipe: {
      startX: pipeStartX,
      startZ: pipeStartZ + 1.5,
      length: PIPE_LEN,
      radius: PIPE_R,
      crawlSpeed: 2.1,
      l8Seconds: 15,
      doorX: woodDoorX,
      doorZ: woodDoorZ,
    },
    floorExit: { x: floorExitX, z: floorExitZ },
    painting: {
      minX: REST_W * 0.5 - 2.6,
      maxX: REST_W * 0.5 + 0.2,
      minZ: paintingZ - 1.6,
      maxZ: paintingZ + 1.6,
    },
  };
}

export function pointInZone(zone, px, pz) {
  return px >= zone.minX && px <= zone.maxX && pz >= zone.minZ && pz <= zone.maxZ;
}

/**
 * Level 0.2 — 灰色镜像迷宫、进门灾害、出生点回归门
 */
import * as THREE from "three";
import { isRedChannelCell } from "./backrooms-level0-red-room.js";

/** 须为 BACKROOMS_MATRIX 中的 1；邻接可走格在西侧 (col 1) */
export const GRAY_DOOR_CELL = { row: 8, col: 2 };
/** 与 L0 切出墙同格 — 此处为回出生点的灰门 */
export const LEVEL02_EXIT_CELL = { row: 9, col: 11 };

export const LEVEL02_FOG = 0x9a9a98;
export const LEVEL02_DAMAGE = 50;
export const LEVEL02_BIG_DAMAGE = 75;
export const LEVEL02_DEBRIS_DELAY_SEC = 2;
export const LEVEL02_DEBRIS_INTERVAL_SEC = 1;
export const LEVEL02_WALL_INTERVAL_SEC = 1;
/** 同时播放的倒墙动画上限，避免堆太多卡顿 */
export const LEVEL02_MAX_ACTIVE_WALL_FALLS = 5;
export const LEVEL02_MAX_DEBRIS = 18;

var _grayDoorPickMesh = null;
var _level02ExitPickMesh = null;

export function isGrayDoorCell(row, col) {
  return row === GRAY_DOOR_CELL.row && col === GRAY_DOOR_CELL.col;
}

export function isLevel02ExitCell(row, col) {
  return row === LEVEL02_EXIT_CELL.row && col === LEVEL02_EXIT_CELL.col;
}

export function getGrayDoorPickMesh() {
  return _grayDoorPickMesh;
}

export function getLevel02ExitPickMesh() {
  return _level02ExitPickMesh;
}

function createSolidGrayWallTexture() {
  var cw = 128;
  var ch = 192;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#8a8a86";
  ctx.fillRect(0, 0, cw, ch);
  var n;
  for (n = 0; n < 220; n++) {
    ctx.fillStyle = "rgba(0,0,0," + (0.012 + Math.random() * 0.028) + ")";
    ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGrayDoorWallTexture() {
  var cw = 128;
  var ch = 192;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#8a8a86";
  ctx.fillRect(0, 0, cw, ch);
  var doorW = cw * 0.42;
  var doorH = ch * 0.72;
  var doorX = (cw - doorW) * 0.5;
  var doorY = ch * 0.12;
  ctx.fillStyle = "#4a4a48";
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = "#323230";
  ctx.fillRect(doorX + doorW * 0.08, doorY + doorH * 0.06, doorW * 0.84, doorH * 0.88);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGrayWallMaterial(tex, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({
    map: tex || undefined,
    color: tex ? 0xffffff : 0x8a8a86,
    emissive: 0x555553,
    emissiveIntensity: emissiveIntensity == null ? 0.12 : emissiveIntensity,
    roughness: 0.86,
    metalness: 0.02,
  });
}

/** L0 中的灰门墙（西侧为门，Q 打开进入 0.2） */
export function buildGrayDoorWall(parent, wx, wz, gridSize, wallH, wallColliders) {
  var group = new THREE.Group();
  group.name = "GrayDoorChannel";
  group.position.set(wx, 0, wz);

  var solidTex = createSolidGrayWallTexture();
  var doorTex = createGrayDoorWallTexture();
  var solidMat = makeGrayWallMaterial(solidTex, 0.08);
  var doorMat = makeGrayWallMaterial(doorTex, 0.18);

  var mesh = new THREE.Mesh(new THREE.BoxGeometry(gridSize, wallH, gridSize), [
    solidMat,
    doorMat,
    solidMat,
    solidMat,
    solidMat,
    solidMat,
  ]);
  mesh.name = "GrayDoorWall";
  mesh.position.y = wallH * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.brInteract = { kind: "gray_door" };
  group.add(mesh);
  _grayDoorPickMesh = mesh;

  parent.add(group);

  var half = gridSize * 0.5;
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz + half,
    grayDoor: true,
    ghost: false,
  });
}

function createLevel02WallPaperTexture(gridSize, wallH) {
  var colW = 38;
  var rowH = 41;
  var cw = colW * 2;
  var ch = rowH * 2;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#9a9a96";
  ctx.fillRect(0, 0, cw, ch);
  var ink = "#3a3a38";

  function verticalDashesAlong(x0, y0, x1, y1, dashLen, step) {
    var len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.001) return;
    var count = Math.max(1, Math.floor(len / step));
    var i;
    for (i = 0; i <= count; i++) {
      var t = i / count;
      var px = x0 + (x1 - x0) * t;
      var py = y0 + (y1 - y0) * t;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.floor(px), Math.floor(py - dashLen * 0.5), 1, dashLen);
    }
  }

  function drawDiamond(cx, cy, rx, ry) {
    var top = [cx, cy - ry];
    var right = [cx + rx, cy];
    var bottom = [cx, cy + ry];
    var left = [cx - rx, cy];
    var dash = 3.2;
    var step = 3.4;
    verticalDashesAlong(top[0], top[1], right[0], right[1], dash, step);
    verticalDashesAlong(right[0], right[1], bottom[0], bottom[1], dash, step);
    verticalDashesAlong(bottom[0], bottom[1], left[0], left[1], dash, step);
    verticalDashesAlong(left[0], left[1], top[0], top[1], dash, step);
  }

  var col;
  var row;
  for (col = 0; col < 2; col++) {
    var xBase = col * colW + colW * 0.5;
    var yShift = col & 1 ? rowH * 0.5 : 0;
    for (row = -1; row < 3; row++) {
      drawDiamond(xBase, row * rowH + yShift, 7.5, 9.5);
    }
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(gridSize / 1.0, wallH / 1.0);
  return tex;
}

function buildLevel02ExitDoor(parent, wx, wz, gridSize, wallH, wallColliders) {
  var solidTex = createSolidGrayWallTexture();
  var doorTex = createGrayDoorWallTexture();
  var solidMat = makeGrayWallMaterial(solidTex, 0.08);
  var doorMat = makeGrayWallMaterial(doorTex, 0.22);

  var mesh = new THREE.Mesh(new THREE.BoxGeometry(gridSize, wallH, gridSize), [
    solidMat,
    doorMat,
    solidMat,
    solidMat,
    solidMat,
    solidMat,
  ]);
  mesh.name = "Level02ExitDoor";
  mesh.position.set(wx, wallH * 0.5, wz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.brInteract = { kind: "level02_exit" };
  parent.add(mesh);
  _level02ExitPickMesh = mesh;

  var half = gridSize * 0.5;
  wallColliders.push({
    minX: wx - half,
    maxX: wx + half,
    minZ: wz - half,
    maxZ: wz + half,
    level02Exit: true,
    ghost: false,
  });
}

/**
 * @param {object} opts
 * @param {number[][]} opts.matrix
 * @param {number} opts.mapRows
 * @param {number} opts.mapCols
 */
export function buildLevel02World(parent, opts) {
  _level02ExitPickMesh = null;

  var gridSize = opts.gridSize;
  var wallH = opts.wallHeight;
  var matrix = opts.matrix;
  var mapRows = opts.mapRows;
  var mapCols = opts.mapCols;
  var cellCenterX = opts.cellCenterX;
  var cellCenterZ = opts.cellCenterZ;
  var mapWidth = opts.mapWidth;
  var mapDepth = opts.mapDepth;

  var group = new THREE.Group();
  group.name = "BackroomsLevel02";
  group.visible = false;

  var wallGeo = new THREE.BoxGeometry(gridSize, wallH, gridSize);
  var wallTex = createLevel02WallPaperTexture(gridSize, wallH);
  var wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallTex || undefined,
    roughness: 0.88,
    metalness: 0,
  });
  if (!wallTex) wallMat.color.setHex(0x90908c);

  var colliders = [];
  /** @type {Array<{ mesh: THREE.Mesh, row: number, col: number, colliderIndex: number }>} */
  var wallAnimTargets = [];

  var row;
  var col;
  for (row = 0; row < mapRows; row++) {
    for (col = 0; col < mapCols; col++) {
      if (matrix[row][col] !== 1) continue;
      if (isRedChannelCell(row, col)) continue;
      if (isGrayDoorCell(row, col)) continue;

      var wx = cellCenterX(col);
      var wz = cellCenterZ(row);

      if (isLevel02ExitCell(row, col)) {
        buildLevel02ExitDoor(group, wx, wz, gridSize, wallH, colliders);
        continue;
      }

      var mesh = new THREE.Mesh(wallGeo, wallMat);
      mesh.name = "L02_Wall_" + row + "_" + col;
      mesh.position.set(wx, wallH * 0.5, wz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      var half = gridSize * 0.5;
      colliders.push({
        minX: wx - half,
        maxX: wx + half,
        minZ: wz - half,
        maxZ: wz + half,
        ghost: false,
        fallen: false,
        row: row,
        col: col,
      });
      wallAnimTargets.push({
        mesh: mesh,
        row: row,
        col: col,
        collider: colliders[colliders.length - 1],
        colliderIndex: colliders.length - 1,
      });
    }
  }

  var shellMat = makeGrayWallMaterial(createSolidGrayWallTexture(), 0.06);
  var half = gridSize * 0.5;
  function addOuterShellWall(shellRow, shellCol) {
    var wx = cellCenterX(shellCol);
    var wz = cellCenterZ(shellRow);
    var shellMesh = new THREE.Mesh(wallGeo, shellMat);
    shellMesh.name = "L02_Shell_" + shellRow + "_" + shellCol;
    shellMesh.position.set(wx, wallH * 0.5, wz);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    group.add(shellMesh);
    colliders.push({
      minX: wx - half,
      maxX: wx + half,
      minZ: wz - half,
      maxZ: wz + half,
      ghost: false,
      fallen: false,
      shell: true,
    });
  }
  for (col = -1; col <= mapCols; col++) {
    addOuterShellWall(-1, col);
    addOuterShellWall(mapRows, col);
  }
  for (row = 0; row < mapRows; row++) {
    addOuterShellWall(row, -1);
    addOuterShellWall(row, mapCols);
  }

  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x6e6e6a,
    roughness: 0.96,
    metalness: 0,
  });
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0xa8a8a4,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  var pad = gridSize * 2;
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth + pad, mapDepth + pad),
    floorMat
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  group.add(floor);

  var ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(mapWidth + pad, mapDepth + pad),
    ceilMat
  );
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = wallH;
  group.add(ceiling);

  var hemi = new THREE.HemisphereLight(0xd8d8d4, 0x5a5a58, 0.42);
  group.add(hemi);
  var amb = new THREE.AmbientLight(0xc8c8c4, 0.2);
  group.add(amb);

  for (row = 0; row < mapRows; row++) {
    for (col = 0; col < mapCols; col++) {
      if (matrix[row][col] !== 0) continue;
      if ((row + col) % 2 !== 0) continue;
      var pl = new THREE.PointLight(0xe8e8e4, 0.38, 9, 1.5);
      pl.position.set(cellCenterX(col), wallH - 0.25, cellCenterZ(row));
      group.add(pl);
    }
  }

  var hazardGroup = new THREE.Group();
  hazardGroup.name = "Level02Hazards";
  group.add(hazardGroup);

  parent.add(group);

  return {
    group: group,
    hazardGroup: hazardGroup,
    colliders: colliders,
    wallAnimTargets: wallAnimTargets,
  };
}

/**
 * Level 0.2 内持续灾害：玩家头顶大块落顶 + 附近墙体朝玩家倒塌
 * @param {THREE.Scene} scene
 * @param {object} ctx
 */
export function createLevel02EnterHazards(scene, ctx) {
  ctx = ctx || {};
  var wallH = ctx.wallHeight != null ? ctx.wallHeight : 2.4;
  var debrisMeshes = [];
  var debrisState = [];
  var wallFalls = [];
  var active = false;
  /** @type {THREE.Object3D | null} */
  var hazardParent = null;
  /** @type {THREE.Object3D | null} */
  var debrisVisualRoot = null;
  /** @type {Array<{ mesh: THREE.Mesh, row: number, col: number, colliderIndex: number }> | null} */
  var wallTargetsRef = null;
  /** @type {object[] | null} */
  var collidersRef = null;
  var fallenWallKeys = Object.create(null);
  var debrisTimeSinceEnter = 0;
  var debrisSpawnCooldown = 0;
  var wallSpawnAcc = 0.4;
  var debrisMat = new THREE.MeshBasicMaterial({
    color: 0x8a8a86,
  });
  var bigDebrisMat = new THREE.MeshBasicMaterial({
    color: 0x6e6e6a,
  });
  var sharedDebrisGeo = new THREE.BoxGeometry(1, 1, 1);

  function addToHazardRoot(obj) {
    if (hazardParent) hazardParent.add(obj);
    else scene.add(obj);
  }

  function removeFromHazardRoot(obj) {
    if (obj.parent) obj.parent.remove(obj);
    else scene.remove(obj);
  }

  function addDebrisMesh(obj) {
    if (debrisVisualRoot) debrisVisualRoot.add(obj);
    else addToHazardRoot(obj);
  }

  /** 整块在天花板下方，避免顶面穿进天花板看起来“卡天” */
  function debrisSpawnY(chunkH) {
    var h = chunkH != null ? chunkH : 0.3;
    return wallH - 0.2 - h * 0.52 - Math.random() * 0.12;
  }

  function spawnDebrisChunk(px, pz, big, overHead) {
    if (!scene && !debrisVisualRoot) return;
    var mat = big ? bigDebrisMat : debrisMat;
    var w = big ? 0.65 + Math.random() * 1.05 : 0.32 + Math.random() * 0.42;
    var h = big ? 0.28 + Math.random() * 0.42 : 0.14 + Math.random() * 0.22;
    var d = big ? 0.55 + Math.random() * 0.95 : 0.28 + Math.random() * 0.45;
    var mesh = new THREE.Mesh(sharedDebrisGeo, mat);
    mesh.scale.set(w, h, d);
    var spread = overHead ? 0.28 + Math.random() * 0.22 : big ? 0.65 : 1.4;
    mesh.position.set(
      px + (Math.random() - 0.5) * spread,
      debrisSpawnY(h),
      pz + (Math.random() - 0.5) * spread
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    addDebrisMesh(mesh);
    debrisMeshes.push(mesh);
    debrisState.push({
      vy: -(4.5 + Math.random() * 3.5),
      hitPlayer: false,
      hx: w * 0.52,
      hz: d * 0.52,
      hy: h * 0.55,
      damage: big ? LEVEL02_BIG_DAMAGE : LEVEL02_DAMAGE,
      big: big,
    });
  }

  function spawnDebrisAtWorld(wx, wz, y, big) {
    if (!scene && !debrisVisualRoot) return;
    var mat = big ? bigDebrisMat : debrisMat;
    var w = big ? 0.55 + Math.random() * 0.85 : 0.28 + Math.random() * 0.38;
    var h = big ? 0.22 + Math.random() * 0.35 : 0.12 + Math.random() * 0.2;
    var d = big ? 0.45 + Math.random() * 0.75 : 0.25 + Math.random() * 0.4;
    var mesh = new THREE.Mesh(sharedDebrisGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(
      wx + (Math.random() - 0.5) * 0.9,
      y,
      wz + (Math.random() - 0.5) * 0.9
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    addDebrisMesh(mesh);
    debrisMeshes.push(mesh);
    debrisState.push({
      vy: -(3 + Math.random() * 4),
      hitPlayer: false,
      hx: w * 0.52,
      hz: d * 0.52,
      hy: h * 0.55,
      damage: big ? LEVEL02_BIG_DAMAGE : LEVEL02_DAMAGE,
      big: big,
    });
  }

  function spawnDebrisBurst(px, pz, count, mostlyBig) {
    var i;
    for (i = 0; i < count; i++) {
      spawnDebrisChunk(px, pz, mostlyBig || Math.random() < 0.72);
    }
  }

  function disableFallenWallCollider(col, mover, wx, wz) {
    if (!col || col.fallen) return;
    col.ghost = true;
    col.fallen = true;
    col.minX = 1e9;
    col.maxX = -1e9;
    col.minZ = 1e9;
    col.maxZ = -1e9;
    if (!mover || wx == null || wz == null) return;
    var pr = mover.radius != null ? mover.radius : 0.32;
    var dx = mover.x - wx;
    var dz = mover.z - wz;
    var len = Math.hypot(dx, dz);
    if (len < pr + 0.5) {
      if (len < 0.05) {
        dx = 1;
        dz = 0;
        len = 1;
      }
      var push = pr + 0.65;
      mover.x = wx + (dx / len) * push;
      mover.z = wz + (dz / len) * push;
    }
  }

  function beginWallFall(w, px, pz, player, survival, onToast) {
    var key = w.row + "_" + w.col;
    if (fallenWallKeys[key]) return false;
    if (!w.collider || w.collider.fallen) return false;

    var worldPos = new THREE.Vector3();
    w.mesh.getWorldPosition(worldPos);
    var wx = worldPos.x;
    var wz = worldPos.z;

    disableFallenWallCollider(w.collider, player, wx, wz);
    fallenWallKeys[key] = true;

    if (w.mesh.parent) w.mesh.parent.remove(w.mesh);
    w.mesh.visible = false;

    if (survival && !survival.dead) {
      var dist = Math.hypot(px - wx, pz - wz);
      if (dist < 2.1) {
        survival.takeDamage(LEVEL02_DAMAGE);
        if (onToast) onToast("你被墙压到了");
      }
    }

    var j;
    for (j = 0; j < 3; j++) {
      spawnDebrisAtWorld(
        wx,
        wz,
        wallH * (0.25 + Math.random() * 0.65),
        true
      );
    }
    return true;
  }

  function trySpawnWallFalls(px, pz, maxCount, player, survival, onToast) {
    if (!wallTargetsRef || !maxCount) return;
    var candidates = [];
    var i;
    var worldPos = new THREE.Vector3();
    for (i = 0; i < wallTargetsRef.length; i++) {
      var w = wallTargetsRef[i];
      var key = w.row + "_" + w.col;
      if (fallenWallKeys[key]) continue;
      w.mesh.getWorldPosition(worldPos);
      var dx = worldPos.x - px;
      var dz = worldPos.z - pz;
      var dist = Math.hypot(dx, dz);
      if (dist > 0.5 && dist < 11) {
        candidates.push({ w: w, dist: dist });
      }
    }
    candidates.sort(function (a, b) {
      return a.dist - b.dist;
    });
    var n = Math.min(maxCount, candidates.length);
    for (i = 0; i < n; i++) {
      beginWallFall(candidates[i].w, px, pz, player, survival, onToast);
    }
  }

  function start(px, pz, wallTargets, colliders, hazardGroup, debrisRoot) {
    active = true;
    hazardParent = hazardGroup || null;
    debrisVisualRoot = debrisRoot || hazardGroup || null;
    wallTargetsRef = wallTargets;
    collidersRef = colliders;
    fallenWallKeys = Object.create(null);
    debrisTimeSinceEnter = 0;
    debrisSpawnCooldown = 0;
    wallSpawnAcc = 0;
    debrisMeshes.length = 0;
    debrisState.length = 0;
    wallFalls.length = 0;
  }

  function updateDebrisHit(st, mesh, player, feetY, bodyH, pr, survival, onToast) {
    if (st.hitPlayer || !survival || survival.dead) return;
    if (mesh.position.y > feetY + bodyH + 0.25) return;
    if (mesh.position.y < feetY - 0.35) return;

    var dx = Math.abs(mesh.position.x - player.x);
    var dz = Math.abs(mesh.position.z - player.z);
    if (dx > pr + st.hx || dz > pr + st.hz) return;

    st.hitPlayer = true;
    survival.takeDamage(st.damage);
    if (onToast) {
      onToast(st.big ? "你被大块碎片砸到了" : "你被碎片砸到了");
    }
  }

  function update(dt, player, survival, onToast) {
    if (!active) return;

    var px = player.x;
    var pz = player.z;
    var mover = player.nudge || player;
    var feetY = player.feetY != null ? player.feetY : 0;
    var bodyH = player.bodyHeight != null ? player.bodyHeight : 1.78;
    var pr = player.radius != null ? player.radius : 0.32;

    debrisTimeSinceEnter += dt;
    if (debrisTimeSinceEnter >= LEVEL02_DEBRIS_DELAY_SEC) {
      debrisSpawnCooldown += dt;
      if (debrisSpawnCooldown >= LEVEL02_DEBRIS_INTERVAL_SEC) {
        debrisSpawnCooldown = 0;
        spawnDebrisChunk(px, pz, true, true);
      }
    }

    wallSpawnAcc += dt;
    if (wallSpawnAcc >= LEVEL02_WALL_INTERVAL_SEC) {
      wallSpawnAcc = 0;
      trySpawnWallFalls(px, pz, 1, mover, survival, onToast);
    }

    var i;
    for (i = debrisMeshes.length - 1; i >= 0; i--) {
      var mesh = debrisMeshes[i];
      var st = debrisState[i];
      st.vy -= 42 * dt;
      mesh.position.y += st.vy * dt;
      mesh.rotation.x += dt * (st.big ? 2.2 : 4.5);
      mesh.rotation.z += dt * 1.8;

      updateDebrisHit(st, mesh, player, feetY, bodyH, pr, survival, onToast);

      if (mesh.position.y < -1.2) {
        if (mesh.parent) mesh.parent.remove(mesh);
        else scene.remove(mesh);
        debrisMeshes.splice(i, 1);
        debrisState.splice(i, 1);
      }
    }

    if (debrisMeshes.length > LEVEL02_MAX_DEBRIS) {
      var drop = debrisMeshes.shift();
      debrisState.shift();
      if (drop.parent) drop.parent.remove(drop);
      else scene.remove(drop);
    }
  }

  function isActive() {
    return active;
  }

  function dispose() {
    var i;
    for (i = 0; i < debrisMeshes.length; i++) {
      removeFromHazardRoot(debrisMeshes[i]);
    }
    for (i = 0; i < wallFalls.length; i++) {
      removeFromHazardRoot(wallFalls[i].pivot);
    }
    debrisMeshes.length = 0;
    debrisState.length = 0;
    wallFalls.length = 0;
    wallTargetsRef = null;
    collidersRef = null;
    hazardParent = null;
    debrisVisualRoot = null;
    fallenWallKeys = Object.create(null);
    active = false;
  }

  return { start: start, update: update, isActive: isActive, dispose: dispose };
}

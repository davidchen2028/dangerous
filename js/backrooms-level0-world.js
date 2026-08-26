/**
 * Level 0 流式世界。
 *
 * 每个 chunk 是 12×12 个网格；普通 chunk 在卸载后提升 epoch，因而下次载入时
 * 会得到不同的内部迷宫。边界开口不含 epoch，只由 session seed 与共享边坐标
 * 决定，所以相邻 chunk 始终可以互通。
 */
import * as THREE from "three";
import { buildRedChannelWall } from "./backrooms-level0-red-room.js";
import { buildGrayDoorWall } from "./backrooms-level0-02.js?v=16";
import { buildBlueHole } from "./backrooms-level0-03.js?v=2";
import { buildZenithEntryWall } from "./backrooms-level0-01.js";

const CELLS_PER_CHUNK = 12;
const DEFAULT_GRID_SIZE = 2;
const DEFAULT_WALL_HEIGHT = 2.4;
const DEFAULT_STREAM_RADIUS = 2;
const DEFAULT_UNLOAD_RADIUS = 3;
const MAZE_NODE_COORDS = [1, 3, 5, 7, 9];
const LOOP_COOLDOWN_MS = 45000;
const LOOP_PROBE_MS = 4000;

const POI_SPECS = [
  { kind: "clip", chance: 0.012, minDistance: 96, spacing: 144, wall: true },
  { kind: "red", chance: 0.0008, minDistance: 240, spacing: 312, wall: true },
  { kind: "02", chance: 0.0035, minDistance: 168, spacing: 216, wall: true },
  { kind: "03", chance: 0.004, minDistance: 144, spacing: 192, wall: false },
  { kind: "manila", chance: 0.0025, minDistance: 168, spacing: 216, wall: false },
  { kind: "01", chance: 0.003, minDistance: 180, spacing: 228, wall: true },
];

function hashString(value) {
  var text = String(value);
  var h = 2166136261 >>> 0;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed) {
  var state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSessionSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    var words = new Uint32Array(2);
    crypto.getRandomValues(words);
    return words[0].toString(36) + words[1].toString(36);
  }
  return (
    Date.now().toString(36) +
    Math.floor(Math.random() * 0xffffffff).toString(36)
  );
}

function keyOf(cx, cz) {
  return cx + "," + cz;
}

function chebyshev(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

function removeReferences(target, refs) {
  if (!refs || !refs.length) return;
  var doomed = new Set(refs);
  var write = 0;
  for (var i = 0; i < target.length; i++) {
    if (!doomed.has(target[i])) target[write++] = target[i];
  }
  target.length = write;
}

function materialFromOption(value, fallback, context) {
  if (value && value.isMaterial) return { material: value, owned: false };
  if (typeof value === "function") {
    var made = value(context);
    if (made && made.isMaterial) return { material: made, owned: true };
  }
  return { material: fallback(), owned: true };
}

function disposeObjectMaterialsAndGeometry(object) {
  object.traverse(function (child) {
    if (child.geometry && child.geometry.dispose) child.geometry.dispose();
    var materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];
    for (var i = 0; i < materials.length; i++) {
      var mat = materials[i];
      if (!mat) continue;
      if (mat.map && mat.map.dispose) mat.map.dispose();
      if (mat.dispose) mat.dispose();
    }
  });
}

function cloneMatrix(matrix) {
  var result = new Array(matrix.length);
  for (var i = 0; i < matrix.length; i++) result[i] = matrix[i].slice();
  return result;
}

/**
 * @param {THREE.Object3D} root
 * @param {object=} opts
 */
export function createLevel0WorldManager(root, opts) {
  opts = opts || {};
  if (!root || typeof root.add !== "function") {
    throw new Error("createLevel0WorldManager 需要有效的 THREE.Object3D root");
  }

  var gridSize =
    opts.gridSize != null && opts.gridSize > 0
      ? Number(opts.gridSize)
      : DEFAULT_GRID_SIZE;
  var chunkSize = CELLS_PER_CHUNK * gridSize;
  var wallHeight =
    opts.wallHeight != null ? Number(opts.wallHeight) : DEFAULT_WALL_HEIGHT;
  var streamRadius =
    opts.streamRadius != null
      ? Math.max(0, opts.streamRadius | 0)
      : DEFAULT_STREAM_RADIUS;
  var unloadRadius =
    opts.unloadRadius != null
      ? Math.max(streamRadius, opts.unloadRadius | 0)
      : DEFAULT_UNLOAD_RADIUS;
  var suppliedSeed =
    opts.sessionSeed != null ? opts.sessionSeed : opts.seed;
  var seed =
    suppliedSeed != null ? String(suppliedSeed) : randomSessionSeed();
  var gfx = opts.gfxProfile || {};
  var shadows = !!gfx.shadows;
  var onPoiChanged =
    typeof opts.onPoiChanged === "function" ? opts.onPoiChanged : null;

  var materialContext = {
    seed: seed,
    gridSize: gridSize,
    chunkSize: chunkSize,
    wallHeight: wallHeight,
    gfxProfile: gfx,
  };
  var wallMaterialInfo = materialFromOption(
    opts.wallMaterialFactory || opts.wallMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0xb8b56a,
        roughness: 0.86,
        metalness: 0,
      });
    },
    materialContext
  );
  var floorMaterialInfo = materialFromOption(
    opts.floorMaterialFactory || opts.floorMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0x817c5c,
        roughness: 0.96,
        metalness: 0,
      });
    },
    materialContext
  );
  var ceilingMaterialInfo = materialFromOption(
    opts.ceilingMaterialFactory || opts.ceilingMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0xd2c792,
        roughness: 0.88,
        metalness: 0,
        side: THREE.FrontSide,
      });
    },
    materialContext
  );
  var specialMaterialInfo = materialFromOption(
    opts.specialMaterialFactory || opts.specialMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0x17100a,
        emissive: 0x281408,
        emissiveIntensity: 0.3,
        roughness: 0.82,
        metalness: 0,
      });
    },
    materialContext
  );
  var lightBodyMaterialInfo = materialFromOption(
    opts.lightMaterialFactory || opts.lightMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0xf2edc5,
        emissive: 0xe9df9b,
        emissiveIntensity: 1.15,
        roughness: 0.35,
      });
    },
    materialContext
  );
  var lightShadeMaterialInfo = materialFromOption(
    opts.lightShadeMaterialFactory || opts.lightShadeMaterial,
    function () {
      return new THREE.MeshStandardMaterial({
        color: 0x77745f,
        roughness: 0.72,
        metalness: 0.16,
      });
    },
    materialContext
  );

  var wallGeometry = new THREE.BoxGeometry(gridSize, wallHeight, gridSize);
  var lightBodyGeometry = new THREE.BoxGeometry(
    gridSize * 0.72,
    0.07,
    gridSize * 0.12
  );
  var lightShadeGeometry = new THREE.BoxGeometry(
    gridSize * 0.86,
    0.045,
    gridSize * 0.2
  );
  var floorGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
  var ceilingGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
  var specialWallGeometry = new THREE.BoxGeometry(
    gridSize,
    wallHeight,
    gridSize
  );

  /** @type {Map<string, object>} */
  var chunks = new Map();
  /** @type {Map<string, number>} */
  var epochs = new Map();
  /** 已生成特殊地点的 chunk 保持同一类型与内部代次。 */
  var stablePoiSpecs = new Map();
  var colliders = [];
  var interactMeshes = [];
  var poiTriggers = [];
  var lightCandidates = [];
  var landmarkMemory = new Map();
  var specialClipWall = null;
  var specialClipCenter = null;
  var specialClipCollider = null;
  var specialClipVortex = null;
  var clipGuarantee = false;
  var clipPoiKey = null;
  var failedClipCount = 0;
  var disposed = false;
  var lastChunkX = 0;
  var lastChunkZ = 0;
  var loopCooldownUntil = 0;
  var lastLoopProbe = -1;
  var loadCount = 0;
  var unloadCount = 0;

  var spawnPoint = cellWorldCenter(0, 0, 5, 5);

  function cellWorldCenter(cx, cz, row, col) {
    return {
      x: cx * chunkSize - chunkSize * 0.5 + (col + 0.5) * gridSize,
      z: cz * chunkSize - chunkSize * 0.5 + (row + 0.5) * gridSize,
    };
  }

  function edgeSlot(axis, edgeX, edgeZ) {
    var hash = hashString(seed + "|edge|" + axis + "|" + edgeX + "|" + edgeZ);
    return MAZE_NODE_COORDS[hash % MAZE_NODE_COORDS.length];
  }

  function carveChunkMatrix(cx, cz, epoch) {
    var matrix = [];
    var row;
    var col;
    for (row = 0; row < CELLS_PER_CHUNK; row++) {
      matrix[row] = [];
      for (col = 0; col < CELLS_PER_CHUNK; col++) matrix[row][col] = 1;
    }

    var random = mulberry32(
      hashString(seed + "|maze|" + cx + "|" + cz + "|" + epoch)
    );
    var visited = [];
    for (row = 0; row < 5; row++) visited[row] = [false, false, false, false, false];
    var startR = Math.floor(random() * 5);
    var startC = Math.floor(random() * 5);
    var stack = [[startR, startC]];
    visited[startR][startC] = true;
    matrix[MAZE_NODE_COORDS[startR]][MAZE_NODE_COORDS[startC]] = 0;
    var dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    while (stack.length) {
      var current = stack[stack.length - 1];
      var choices = [];
      for (var d = 0; d < dirs.length; d++) {
        var nr = current[0] + dirs[d][0];
        var nc = current[1] + dirs[d][1];
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !visited[nr][nc]) {
          choices.push([nr, nc]);
        }
      }
      if (!choices.length) {
        stack.pop();
        continue;
      }
      var next = choices[Math.floor(random() * choices.length)];
      var fromRow = MAZE_NODE_COORDS[current[0]];
      var fromCol = MAZE_NODE_COORDS[current[1]];
      var toRow = MAZE_NODE_COORDS[next[0]];
      var toCol = MAZE_NODE_COORDS[next[1]];
      matrix[toRow][toCol] = 0;
      matrix[(fromRow + toRow) >> 1][(fromCol + toCol) >> 1] = 0;
      visited[next[0]][next[1]] = true;
      stack.push(next);
    }

    var westRow = edgeSlot("x", cx, cz);
    var eastRow = edgeSlot("x", cx + 1, cz);
    var northCol = edgeSlot("z", cx, cz);
    var southCol = edgeSlot("z", cx, cz + 1);
    matrix[westRow][0] = 0;
    matrix[eastRow][11] = 0;
    matrix[eastRow][10] = 0;
    matrix[0][northCol] = 0;
    matrix[11][southCol] = 0;
    matrix[10][southCol] = 0;

    // 出生 chunk 永久固定，并明确保证出生格可走。
    if (cx === 0 && cz === 0) matrix[5][5] = 0;
    return matrix;
  }

  function pickCell(matrix, cx, cz, epoch, wantWall, kind) {
    var candidates = [];
    for (var row = 1; row < CELLS_PER_CHUNK - 1; row++) {
      for (var col = 1; col < CELLS_PER_CHUNK - 1; col++) {
        if (wantWall) {
          if (matrix[row][col] !== 1) continue;
          if (
            (kind === "red" || kind === "02" || kind === "01") &&
            matrix[row][col - 1] !== 0
          ) {
            continue;
          }
          var neighbors = [];
          if (matrix[row - 1][col] === 0) neighbors.push([row - 1, col]);
          if (matrix[row + 1][col] === 0) neighbors.push([row + 1, col]);
          if (matrix[row][col - 1] === 0) neighbors.push([row, col - 1]);
          if (matrix[row][col + 1] === 0) neighbors.push([row, col + 1]);
          if (neighbors.length) {
            candidates.push({ row: row, col: col, neighbors: neighbors });
          }
        } else if (matrix[row][col] === 0) {
          candidates.push({ row: row, col: col, neighbors: null });
        }
      }
    }
    if (!candidates.length) return null;
    var random = mulberry32(
      hashString(seed + "|poi-cell|" + cx + "|" + cz + "|" + epoch + "|" + wantWall)
    );
    var picked = candidates[Math.floor(random() * candidates.length)];
    if (picked.neighbors) {
      picked.neighbor =
        picked.neighbors[Math.floor(random() * picked.neighbors.length)];
    }
    return picked;
  }

  function hasPoiSpacing(kind, wx, wz, spacing, cx, cz) {
    var values = landmarkMemory.values();
    for (var next = values.next(); !next.done; next = values.next()) {
      var landmark = next.value;
      if (landmark.kind !== kind) continue;
      if (landmark.chunkX === cx && landmark.chunkZ === cz) continue;
      if (Math.hypot(landmark.x - wx, landmark.z - wz) < spacing) return false;
    }
    return true;
  }

  function eligibleForSpec(spec, cx, cz) {
    var centerX = cx * chunkSize;
    var centerZ = cz * chunkSize;
    if (
      Math.hypot(centerX - spawnPoint.x, centerZ - spawnPoint.z) <
      spec.minDistance
    ) {
      return false;
    }
    if (spec.kind === "clip" && clipPoiKey) return false;
    return hasPoiSpacing(spec.kind, centerX, centerZ, spec.spacing, cx, cz);
  }

  function choosePoi(cx, cz, epoch) {
    var stableKind = stablePoiSpecs.get(keyOf(cx, cz));
    if (stableKind) {
      for (var si = 0; si < POI_SPECS.length; si++) {
        if (POI_SPECS[si].kind === stableKind) return POI_SPECS[si];
      }
    }
    var clipSpec = POI_SPECS[0];
    if (clipGuarantee && eligibleForSpec(clipSpec, cx, cz)) return clipSpec;
    for (var i = 0; i < POI_SPECS.length; i++) {
      var spec = POI_SPECS[i];
      var roll =
        hashString(
          seed + "|poi|" + spec.kind + "|" + cx + "|" + cz + "|" + epoch
        ) / 4294967296;
      if (roll <= spec.chance && eligibleForSpec(spec, cx, cz)) return spec;
    }
    return null;
  }

  function addCollider(chunk, collider) {
    chunk.colliders.push(collider);
    colliders.push(collider);
  }

  function addInteract(chunk, mesh) {
    if (!mesh) return;
    chunk.interacts.push(mesh);
    interactMeshes.push(mesh);
  }

  function addTrigger(chunk, trigger) {
    chunk.triggers.push(trigger);
    poiTriggers.push(trigger);
  }

  function addLandmark(chunk, spec, position, safePosition) {
    var id =
      spec.kind +
      ":" +
      chunk.cx +
      ":" +
      chunk.cz +
      ":" +
      chunk.epoch;
    var previous = landmarkMemory.get(id);
    var landmark = {
      id: id,
      kind: spec.kind,
      x: position.x,
      z: position.z,
      safeX: safePosition.x,
      safeZ: safePosition.z,
      chunkX: chunk.cx,
      chunkZ: chunk.cz,
      epoch: chunk.epoch,
      seen: !!(previous && previous.seen),
      active: true,
    };
    chunk.landmark = landmark;
    landmarkMemory.set(id, landmark);
    return landmark;
  }

  function notifyPoiChanged() {
    if (!onPoiChanged) return;
    onPoiChanged(
      poiTriggers.map(function (trigger) {
        return {
          id: trigger.id,
          kind: trigger.kind,
          x: trigger.x,
          z: trigger.z,
          chunkX: trigger.chunkX,
          chunkZ: trigger.chunkZ,
        };
      })
    );
  }

  function makeVortex(chunk, wx, wz, safeX, safeZ) {
    var vortexGroup = new THREE.Group();
    vortexGroup.name = "L0StreamClipVortex";
    var ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x86e8ff,
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    var coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x1c052d,
      transparent: true,
      opacity: 0.86,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    var ringGeometry = new THREE.TorusGeometry(
      gridSize * 0.3,
      gridSize * 0.045,
      8,
      32
    );
    var coreGeometry = new THREE.CircleGeometry(gridSize * 0.27, 28);
    var core = new THREE.Mesh(coreGeometry, coreMaterial);
    var ring = new THREE.Mesh(ringGeometry, ringMaterial);
    vortexGroup.add(core);
    vortexGroup.add(ring);
    var dx = safeX - wx;
    var dz = safeZ - wz;
    var len = Math.hypot(dx, dz) || 1;
    vortexGroup.position.set(
      wx + (dx / len) * (gridSize * 0.5 + 0.025),
      wallHeight * 0.52,
      wz + (dz / len) * (gridSize * 0.5 + 0.025)
    );
    vortexGroup.lookAt(safeX, wallHeight * 0.52, safeZ);
    chunk.group.add(vortexGroup);
    chunk.vortex = {
      group: vortexGroup,
      ring: ring,
      core: core,
      geometries: [ringGeometry, coreGeometry],
      materials: [ringMaterial, coreMaterial],
    };
    specialClipVortex = chunk.vortex;
  }

  function buildPoi(chunk, spec, matrix) {
    var cell = pickCell(
      matrix,
      chunk.cx,
      chunk.cz,
      chunk.epoch,
      spec.wall,
      spec.kind
    );
    if (!cell) return null;
    var position = cellWorldCenter(
      chunk.cx,
      chunk.cz,
      cell.row,
      cell.col
    );
    var safePosition = position;
    if (cell.neighbor) {
      safePosition = cellWorldCenter(
        chunk.cx,
        chunk.cz,
        cell.neighbor[0],
        cell.neighbor[1]
      );
    }
    var half = gridSize * 0.5;
    var trigger = {
      id:
        spec.kind +
        ":" +
        chunk.cx +
        ":" +
        chunk.cz +
        ":" +
        chunk.epoch,
      kind: spec.kind,
      poiKind: spec.kind,
      x: position.x,
      z: position.z,
      chunkX: chunk.cx,
      chunkZ: chunk.cz,
      minX: safePosition.x - half * 0.65,
      maxX: safePosition.x + half * 0.65,
      minZ: safePosition.z - half * 0.65,
      maxZ: safePosition.z + half * 0.65,
    };
    var localColliders = [];
    var beforeChildren = chunk.group.children.length;
    var pick = null;

    if (spec.kind === "red") {
      buildRedChannelWall(
        chunk.group,
        position.x,
        position.z,
        gridSize,
        wallHeight,
        localColliders
      );
      var redRoot = chunk.group.children[beforeChildren];
      if (redRoot) {
        redRoot.traverse(function (child) {
          if (!pick && child.isMesh) pick = child;
        });
        chunk.disposableSpecials.push(redRoot);
      }
      if (pick) pick.userData.brInteract = { kind: "red_door", poi: trigger };
    } else if (spec.kind === "02") {
      var grayController = buildGrayDoorWall(
        chunk.group,
        position.x,
        position.z,
        gridSize,
        wallHeight,
        localColliders
      );
      var grayRoot = chunk.group.children[beforeChildren];
      if (grayRoot) {
        grayRoot.traverse(function (child) {
          if (!pick && child.isMesh) pick = child;
        });
        chunk.disposableSpecials.push(grayRoot);
      }
      if (pick) {
        pick.userData.brInteract = pick.userData.brInteract || { kind: "gray_door" };
        pick.userData.brInteract.poi = trigger;
      }
      if (grayController && grayController.door) {
        grayController.door.userData.brInteract =
          grayController.door.userData.brInteract || { kind: "white_door" };
        grayController.door.userData.brInteract.poi = trigger;
        addInteract(chunk, grayController.door);
      }
    } else if (spec.kind === "01") {
      var zenithRoot = buildZenithEntryWall(
        chunk.group,
        position.x,
        position.z,
        gridSize,
        wallHeight,
        localColliders
      );
      if (!zenithRoot) zenithRoot = chunk.group.children[beforeChildren];
      if (zenithRoot) {
        var zenithFallback = null;
        zenithRoot.traverse(function (child) {
          if (!child.isMesh) return;
          if (!zenithFallback) zenithFallback = child;
          if (child.name === "Level01EntranceInteract") pick = child;
        });
        if (!pick) pick = zenithFallback;
        chunk.disposableSpecials.push(zenithRoot);
      }
      if (pick) {
        pick.userData.brInteract =
          pick.userData.brInteract || { kind: "level01_entrance" };
        pick.userData.brInteract.poi = trigger;
      }
    } else if (spec.kind === "03") {
      var blueRoot = buildBlueHole(
        chunk.group,
        position.x,
        position.z,
        gridSize
      );
      blueRoot.traverse(function (child) {
        if (!pick && child.isMesh) pick = child;
      });
      if (pick) pick.userData.brInteract = { kind: "blue_hole", poi: trigger };
      chunk.disposableSpecials.push(blueRoot);
    } else if (spec.kind === "manila") {
      var manilaMaterial = new THREE.MeshBasicMaterial({
        color: 0xd8c58e,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      });
      var manilaGeometry = new THREE.BoxGeometry(
        gridSize * 0.75,
        wallHeight * 0.85,
        gridSize * 0.18
      );
      pick = new THREE.Mesh(manilaGeometry, manilaMaterial);
      pick.name = "L0ManilaPlaceholder";
      pick.position.set(position.x, wallHeight * 0.43, position.z);
      pick.userData.brInteract = { kind: "manila_room", poi: trigger };
      chunk.group.add(pick);
      chunk.ownedGeometries.push(manilaGeometry);
      chunk.ownedMaterials.push(manilaMaterial);
    } else if (spec.kind === "clip") {
      pick = new THREE.Mesh(
        specialWallGeometry,
        specialMaterialInfo.material
      );
      pick.name = "L0StreamClipWall";
      pick.position.set(position.x, wallHeight * 0.5, position.z);
      pick.castShadow = shadows;
      pick.receiveShadow = shadows;
      pick.userData.brInteract = { kind: "clip_wall", poi: trigger };
      chunk.group.add(pick);
      var specialCollider = {
        minX: position.x - half,
        maxX: position.x + half,
        minZ: position.z - half,
        maxZ: position.z + half,
        special: true,
        ghost: false,
        chunkX: chunk.cx,
        chunkZ: chunk.cz,
      };
      addCollider(chunk, specialCollider);
      specialClipWall = pick;
      specialClipCenter = {
        x: position.x,
        y: wallHeight * 0.5,
        z: position.z,
      };
      specialClipCollider = specialCollider;
      makeVortex(
        chunk,
        position.x,
        position.z,
        safePosition.x,
        safePosition.z
      );
      clipGuarantee = false;
    }

    for (var i = 0; i < localColliders.length; i++) {
      localColliders[i].chunkX = chunk.cx;
      localColliders[i].chunkZ = chunk.cz;
      localColliders[i].poiKind = spec.kind;
      addCollider(chunk, localColliders[i]);
    }
    if (pick) addInteract(chunk, pick);
    addTrigger(chunk, trigger);
    addLandmark(chunk, spec, position, safePosition);
    return cell;
  }

  function buildChunk(cx, cz) {
    var key = keyOf(cx, cz);
    if (chunks.has(key)) return chunks.get(key);
    var pinned = cx === 0 && cz === 0;
    var epoch = pinned ? 0 : epochs.get(key) || 0;
    var matrix = carveChunkMatrix(cx, cz, epoch);
    var group = new THREE.Group();
    group.name = "L0Chunk_" + cx + "_" + cz + "_e" + epoch;
    root.add(group);
    var chunk = {
      key: key,
      cx: cx,
      cz: cz,
      epoch: epoch,
      pinned: pinned,
      group: group,
      matrix: matrix,
      colliders: [],
      interacts: [],
      triggers: [],
      lights: [],
      landmark: null,
      vortex: null,
      ownedGeometries: [],
      ownedMaterials: [],
      disposableSpecials: [],
    };

    var spec = choosePoi(cx, cz, epoch);
    if (spec) {
      chunk.pinned = true;
      stablePoiSpecs.set(key, spec.kind);
      if (spec.kind === "clip") clipPoiKey = key;
    }
    var poiCell = spec ? buildPoi(chunk, spec, matrix) : null;
    var wallPositions = [];
    var walkableLights = [];
    var half = gridSize * 0.5;
    for (var row = 0; row < CELLS_PER_CHUNK; row++) {
      for (var col = 0; col < CELLS_PER_CHUNK; col++) {
        var center = cellWorldCenter(cx, cz, row, col);
        if (matrix[row][col] === 1) {
          if (
            poiCell &&
            spec &&
            spec.wall &&
            poiCell.row === row &&
            poiCell.col === col
          ) {
            continue;
          }
          wallPositions.push(center);
          addCollider(chunk, {
            minX: center.x - half,
            maxX: center.x + half,
            minZ: center.z - half,
            maxZ: center.z + half,
            ghost: false,
            special: false,
            chunkX: cx,
            chunkZ: cz,
          });
        } else if (
          row > 0 &&
          row < CELLS_PER_CHUNK - 1 &&
          col > 0 &&
          col < CELLS_PER_CHUNK - 1 &&
          ((row + col + cx + cz) & 3) === 2
        ) {
          walkableLights.push(center);
        }
      }
    }

    var dummy = new THREE.Object3D();
    var wallInstances = new THREE.InstancedMesh(
      wallGeometry,
      wallMaterialInfo.material,
      Math.max(1, wallPositions.length)
    );
    wallInstances.name = "L0ChunkWalls_" + key;
    wallInstances.count = wallPositions.length;
    wallInstances.castShadow = shadows;
    wallInstances.receiveShadow = shadows;
    for (var wi = 0; wi < wallPositions.length; wi++) {
      dummy.position.set(
        wallPositions[wi].x,
        wallHeight * 0.5,
        wallPositions[wi].z
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wallInstances.setMatrixAt(wi, dummy.matrix);
    }
    wallInstances.instanceMatrix.needsUpdate = true;
    group.add(wallInstances);

    var bodyInstances = new THREE.InstancedMesh(
      lightBodyGeometry,
      lightBodyMaterialInfo.material,
      Math.max(1, walkableLights.length)
    );
    var shadeInstances = new THREE.InstancedMesh(
      lightShadeGeometry,
      lightShadeMaterialInfo.material,
      Math.max(1, walkableLights.length)
    );
    bodyInstances.name = "L0ChunkLightBodies_" + key;
    shadeInstances.name = "L0ChunkLightShades_" + key;
    bodyInstances.count = walkableLights.length;
    shadeInstances.count = walkableLights.length;
    for (var li = 0; li < walkableLights.length; li++) {
      var light = walkableLights[li];
      var phaseHash = hashString(
        seed + "|light|" + cx + "|" + cz + "|" + epoch + "|" + li
      );
      dummy.position.set(light.x, wallHeight - 0.09, light.z);
      dummy.rotation.set(0, phaseHash & 1 ? Math.PI * 0.5 : 0, 0);
      dummy.updateMatrix();
      bodyInstances.setMatrixAt(li, dummy.matrix);
      dummy.position.y = wallHeight - 0.025;
      dummy.updateMatrix();
      shadeInstances.setMatrixAt(li, dummy.matrix);
      var candidate = {
        x: light.x,
        y: wallHeight - 0.18,
        z: light.z,
        intensity: 0.42 + ((phaseHash >>> 8) % 20) / 100,
        chunkX: cx,
        chunkZ: cz,
        phase: (phaseHash % 628) / 100,
      };
      chunk.lights.push(candidate);
      lightCandidates.push(candidate);
    }
    bodyInstances.instanceMatrix.needsUpdate = true;
    shadeInstances.instanceMatrix.needsUpdate = true;
    group.add(shadeInstances);
    group.add(bodyInstances);

    var floor = new THREE.Mesh(floorGeometry, floorMaterialInfo.material);
    floor.name = "L0ChunkFloor_" + key;
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.set(cx * chunkSize, 0, cz * chunkSize);
    floor.receiveShadow = shadows;
    group.add(floor);
    var ceiling = new THREE.Mesh(
      ceilingGeometry,
      ceilingMaterialInfo.material
    );
    ceiling.name = "L0ChunkCeiling_" + key;
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.set(cx * chunkSize, wallHeight, cz * chunkSize);
    ceiling.receiveShadow = shadows;
    group.add(ceiling);

    chunks.set(key, chunk);
    loadCount++;
    if (chunk.triggers.length) notifyPoiChanged();
    return chunk;
  }

  function disposeVortex(vortex) {
    if (!vortex) return;
    if (vortex.group.parent) vortex.group.parent.remove(vortex.group);
    for (var i = 0; i < vortex.geometries.length; i++) {
      vortex.geometries[i].dispose();
    }
    for (var j = 0; j < vortex.materials.length; j++) {
      vortex.materials[j].dispose();
    }
  }

  function unloadChunk(chunk, finalDispose) {
    if (!chunk || (chunk.cx === 0 && chunk.cz === 0 && !finalDispose)) return;
    removeReferences(colliders, chunk.colliders);
    removeReferences(interactMeshes, chunk.interacts);
    removeReferences(poiTriggers, chunk.triggers);
    removeReferences(lightCandidates, chunk.lights);
    if (chunk.landmark) chunk.landmark.active = false;

    if (specialClipWall && chunk.interacts.indexOf(specialClipWall) !== -1) {
      specialClipWall = null;
      specialClipCenter = null;
      specialClipCollider = null;
      specialClipVortex = null;
    }
    disposeVortex(chunk.vortex);
    for (var i = 0; i < chunk.disposableSpecials.length; i++) {
      var special = chunk.disposableSpecials[i];
      if (special.parent) special.parent.remove(special);
      disposeObjectMaterialsAndGeometry(special);
    }
    for (var g = 0; g < chunk.ownedGeometries.length; g++) {
      chunk.ownedGeometries[g].dispose();
    }
    for (var m = 0; m < chunk.ownedMaterials.length; m++) {
      chunk.ownedMaterials[m].dispose();
    }
    chunk.group.traverse(function (child) {
      if (child.isInstancedMesh && child.dispose) child.dispose();
    });
    if (chunk.group.parent) chunk.group.parent.remove(chunk.group);
    chunks.delete(chunk.key);
    if (!chunk.pinned && !finalDispose) {
      epochs.set(chunk.key, chunk.epoch + 1);
      unloadCount++;
    } else if (!finalDispose) {
      epochs.set(chunk.key, chunk.epoch);
      unloadCount++;
    }
    if (chunk.triggers.length) notifyPoiChanged();
  }

  function markSeenLandmarks(px, pz) {
    var values = landmarkMemory.values();
    for (var next = values.next(); !next.done; next = values.next()) {
      var landmark = next.value;
      if (
        landmark.active &&
        !landmark.seen &&
        Math.hypot(px - landmark.x, pz - landmark.z) <= gridSize * 5
      ) {
        landmark.seen = true;
      }
    }
  }

  function updateVortex(now) {
    if (!specialClipVortex) return;
    var seconds = (Number(now) || 0) * 0.001;
    specialClipVortex.ring.rotation.z = seconds * 1.9;
    specialClipVortex.core.rotation.z = -seconds * 0.72;
    var pulse = 0.62 + Math.sin(seconds * 5.2) * 0.2;
    specialClipVortex.ring.material.opacity = pulse;
    specialClipVortex.group.scale.setScalar(
      0.96 + Math.sin(seconds * 3.7) * 0.04
    );
  }

  function update(px, pz, now) {
    if (disposed) return;
    var cx = Math.floor((px + chunkSize * 0.5) / chunkSize);
    var cz = Math.floor((pz + chunkSize * 0.5) / chunkSize);
    lastChunkX = cx;
    lastChunkZ = cz;

    for (var dz = -streamRadius; dz <= streamRadius; dz++) {
      for (var dx = -streamRadius; dx <= streamRadius; dx++) {
        buildChunk(cx + dx, cz + dz);
      }
    }

    var loaded = Array.from(chunks.values());
    for (var i = 0; i < loaded.length; i++) {
      var chunk = loaded[i];
      if (
        !(chunk.cx === 0 && chunk.cz === 0) &&
        chebyshev(chunk.cx, chunk.cz, cx, cz) > unloadRadius
      ) {
        unloadChunk(chunk, false);
      }
    }
    markSeenLandmarks(px, pz);
    updateVortex(now);
  }

  function getColliders() {
    return colliders;
  }

  function getLightCandidates(px, pz, radius) {
    if (px == null || pz == null || radius == null) return lightCandidates;
    var radiusSq = radius * radius;
    return lightCandidates.filter(function (light) {
      var dx = light.x - px;
      var dz = light.z - pz;
      return dx * dx + dz * dz <= radiusSq;
    });
  }

  function getInteractMeshes() {
    return interactMeshes;
  }

  function getPoiTriggers() {
    return poiTriggers;
  }

  function getSpecialClipWall() {
    return specialClipWall;
  }

  function getSpecialClipCenter() {
    return specialClipCenter;
  }

  function setSpecialClipGhost(ghost) {
    if (!specialClipCollider) return false;
    specialClipCollider.ghost = !!ghost;
    return true;
  }

  function getSpawnPoint() {
    return { x: spawnPoint.x, z: spawnPoint.z };
  }

  function getSnapshotMatrix() {
    var current = chunks.get(keyOf(lastChunkX, lastChunkZ));
    if (!current) current = chunks.get("0,0");
    return current ? cloneMatrix(current.matrix) : [];
  }

  function getLandmarks() {
    var seen = [];
    var values = landmarkMemory.values();
    for (var next = values.next(); !next.done; next = values.next()) {
      var landmark = next.value;
      if (!landmark.seen) continue;
      seen.push({
        id: landmark.id,
        kind: landmark.kind,
        x: landmark.x,
        z: landmark.z,
        chunkX: landmark.chunkX,
        chunkZ: landmark.chunkZ,
        active: landmark.active,
      });
    }
    return seen;
  }

  function noteFailedClip() {
    failedClipCount++;
    if (failedClipCount >= 3) clipGuarantee = true;
  }

  function consumeLoopSuggestion(px, pz, yaw, now) {
    now = Number(now) || 0;
    if (now < loopCooldownUntil) return null;
    var probe = Math.floor(now / LOOP_PROBE_MS);
    if (probe === lastLoopProbe) return null;
    lastLoopProbe = probe;

    var nearby = null;
    var seen = [];
    var values = landmarkMemory.values();
    for (var next = values.next(); !next.done; next = values.next()) {
      var landmark = next.value;
      if (!landmark.seen) continue;
      seen.push(landmark);
      if (
        landmark.active &&
        Math.hypot(px - landmark.x, pz - landmark.z) < gridSize * 2.2
      ) {
        nearby = landmark;
      }
    }
    if (!nearby || seen.length < 2) return null;
    var chance =
      hashString(seed + "|loop|" + nearby.id + "|" + probe) / 4294967296;
    if (chance > 0.055) return null;
    var targets = seen.filter(function (landmark) {
      return landmark.id !== nearby.id;
    });
    if (!targets.length) return null;
    var target =
      targets[
        hashString(seed + "|loop-target|" + nearby.id + "|" + probe) %
          targets.length
      ];
    loopCooldownUntil = now + LOOP_COOLDOWN_MS;
    return {
      x: target.safeX,
      z: target.safeZ,
      yaw: yaw,
      preserveYaw: true,
      reason: "level0_non_euclidean_loop",
      fromLandmarkId: nearby.id,
      toLandmarkId: target.id,
      cooldownUntil: loopCooldownUntil,
    };
  }

  function getStats() {
    return {
      seed: seed,
      cellsPerChunk: CELLS_PER_CHUNK,
      gridSize: gridSize,
      chunkSize: chunkSize,
      streamRadius: streamRadius,
      unloadRadius: unloadRadius,
      loadedChunks: chunks.size,
      colliders: colliders.length,
      lightCandidates: lightCandidates.length,
      interactMeshes: interactMeshes.length,
      poiTriggers: poiTriggers.length,
      seenLandmarks: getLandmarks().length,
      failedClipCount: failedClipCount,
      clipGuaranteePending: clipGuarantee,
      totalLoads: loadCount,
      totalUnloads: unloadCount,
      currentChunkX: lastChunkX,
      currentChunkZ: lastChunkZ,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    var loaded = Array.from(chunks.values());
    for (var i = 0; i < loaded.length; i++) unloadChunk(loaded[i], true);
    colliders.length = 0;
    interactMeshes.length = 0;
    poiTriggers.length = 0;
    lightCandidates.length = 0;
    landmarkMemory.clear();
    stablePoiSpecs.clear();
    wallGeometry.dispose();
    lightBodyGeometry.dispose();
    lightShadeGeometry.dispose();
    floorGeometry.dispose();
    ceilingGeometry.dispose();
    specialWallGeometry.dispose();
    var infos = [
      wallMaterialInfo,
      floorMaterialInfo,
      ceilingMaterialInfo,
      specialMaterialInfo,
      lightBodyMaterialInfo,
      lightShadeMaterialInfo,
    ];
    for (var j = 0; j < infos.length; j++) {
      if (infos[j].owned) infos[j].material.dispose();
    }
  }

  // 出生区域立即可碰撞；spawn chunk 永不因流送距离而卸载。
  update(spawnPoint.x, spawnPoint.z, 0);

  return {
    update: update,
    dispose: dispose,
    getColliders: getColliders,
    getLightCandidates: getLightCandidates,
    getInteractMeshes: getInteractMeshes,
    getPoiTriggers: getPoiTriggers,
    getSpecialClipWall: getSpecialClipWall,
    getSpecialClipCenter: getSpecialClipCenter,
    setSpecialClipGhost: setSpecialClipGhost,
    getSpawnPoint: getSpawnPoint,
    getSnapshotMatrix: getSnapshotMatrix,
    getLandmarks: getLandmarks,
    noteFailedClip: noteFailedClip,
    consumeLoopSuggestion: consumeLoopSuggestion,
    getStats: getStats,
  };
}

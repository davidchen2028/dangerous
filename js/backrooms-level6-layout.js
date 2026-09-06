/**
 * Level 6「熄灯」——确定性有限迷宫布局与网格碰撞。
 */
import { pushOutCircleAABB } from "./backrooms-collide.js";

export const L6_MAZE_W = 31;
export const L6_MAZE_H = 31;
export const L6_CELL = 3.4;
export const L6_WALL_H = 3.15;
export const L6_LAYOUT_KEY = "backrooms_l6_layout_seed_v1";
export const L6_STATE_KEY = "backrooms_l6_state_v1";

function hashText(text) {
  var h = 2166136261;
  text = String(text);
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  for (var i = items.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export function getLevel6LayoutSeed(storage) {
  storage = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!storage) return 0x6e170006;
  var saved = Number(storage.getItem(L6_LAYOUT_KEY));
  if (Number.isFinite(saved) && saved > 0) return saved >>> 0;
  var seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
  storage.setItem(L6_LAYOUT_KEY, String(seed));
  return seed;
}

function cellKey(x, z) {
  return x + ":" + z;
}

function bfs(grid, start) {
  var distances = Array.from({ length: L6_MAZE_H }, function () {
    return Array(L6_MAZE_W).fill(-1);
  });
  var cells = [];
  var queue = [{ x: start.x, z: start.z }];
  distances[start.z][start.x] = 0;
  for (var qi = 0; qi < queue.length; qi++) {
    var cur = queue[qi];
    cells.push(cur);
    var next = [
      { x: cur.x + 1, z: cur.z },
      { x: cur.x - 1, z: cur.z },
      { x: cur.x, z: cur.z + 1 },
      { x: cur.x, z: cur.z - 1 },
    ];
    for (var ni = 0; ni < next.length; ni++) {
      var n = next[ni];
      if (
        n.x < 0 ||
        n.z < 0 ||
        n.x >= L6_MAZE_W ||
        n.z >= L6_MAZE_H ||
        grid[n.z][n.x] !== 0 ||
        distances[n.z][n.x] >= 0
      ) {
        continue;
      }
      distances[n.z][n.x] = distances[cur.z][cur.x] + 1;
      queue.push(n);
    }
  }
  return { distances: distances, cells: cells };
}

function pickByDistance(cells, distances, target, used, rng) {
  var candidates = cells.filter(function (cell) {
    return !used[cellKey(cell.x, cell.z)] && distances[cell.z][cell.x] >= target;
  });
  if (!candidates.length) candidates = cells.slice();
  candidates.sort(function (a, b) {
    return Math.abs(distances[a.z][a.x] - target) - Math.abs(distances[b.z][b.x] - target);
  });
  var pool = candidates.slice(0, Math.min(12, candidates.length));
  var picked = pool[Math.floor(rng() * pool.length)] || cells[0];
  used[cellKey(picked.x, picked.z)] = true;
  return { x: picked.x, z: picked.z };
}

export function generateLevel6Layout(seed) {
  var rng = mulberry32(hashText(seed));
  var grid = Array.from({ length: L6_MAZE_H }, function () {
    return Array(L6_MAZE_W).fill(1);
  });
  var spawnCell = { x: 1, z: 1 };
  var stack = [spawnCell];
  grid[1][1] = 0;
  var dirs = [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ];
  while (stack.length) {
    var cur = stack[stack.length - 1];
    var choices = shuffle(dirs.slice(), rng).filter(function (dir) {
      var nx = cur.x + dir[0];
      var nz = cur.z + dir[1];
      return (
        nx > 0 &&
        nz > 0 &&
        nx < L6_MAZE_W - 1 &&
        nz < L6_MAZE_H - 1 &&
        grid[nz][nx] === 1
      );
    });
    if (!choices.length) {
      stack.pop();
      continue;
    }
    var dir = choices[0];
    var nx = cur.x + dir[0];
    var nz = cur.z + dir[1];
    grid[cur.z + dir[1] / 2][cur.x + dir[0] / 2] = 0;
    grid[nz][nx] = 0;
    stack.push({ x: nx, z: nz });
  }

  var loopBudget = 22;
  for (var t = 0; t < 300 && loopBudget > 0; t++) {
    var x = 1 + Math.floor(rng() * (L6_MAZE_W - 2));
    var z = 1 + Math.floor(rng() * (L6_MAZE_H - 2));
    if (grid[z][x] !== 1) continue;
    var horizontal = grid[z][x - 1] === 0 && grid[z][x + 1] === 0;
    var vertical = grid[z - 1][x] === 0 && grid[z + 1][x] === 0;
    if (horizontal !== vertical) {
      grid[z][x] = 0;
      loopBudget--;
    }
  }

  var reach = bfs(grid, spawnCell);
  var farthest = reach.cells.reduce(function (best, cell) {
    return reach.distances[cell.z][cell.x] > reach.distances[best.z][best.x] ? cell : best;
  }, spawnCell);
  var maxDistance = reach.distances[farthest.z][farthest.x];
  var used = {};
  used[cellKey(spawnCell.x, spawnCell.z)] = true;
  used[cellKey(farthest.x, farthest.z)] = true;
  var features = {
    l5Door: { x: spawnCell.x, z: spawnCell.z },
    l7Stair: { x: farthest.x, z: farthest.z },
    wire: pickByDistance(reach.cells, reach.distances, Math.floor(maxDistance * 0.48), used, rng),
    switchRoom: pickByDistance(
      reach.cells,
      reach.distances,
      Math.floor(maxDistance * 0.3),
      used,
      rng
    ),
    ironDoor: pickByDistance(
      reach.cells,
      reach.distances,
      Math.floor(maxDistance * 0.72),
      used,
      rng
    ),
  };
  return {
    seed: seed >>> 0,
    grid: grid,
    spawnCell: spawnCell,
    distances: reach.distances,
    openCells: reach.cells,
    maxDistance: maxDistance,
    features: features,
  };
}

export function level6CellToWorld(layout, x, z) {
  return {
    x: (x - layout.spawnCell.x) * L6_CELL,
    z: (z - layout.spawnCell.z) * L6_CELL,
  };
}

export function level6WorldToCell(layout, x, z) {
  return {
    x: Math.round(x / L6_CELL + layout.spawnCell.x),
    z: Math.round(z / L6_CELL + layout.spawnCell.z),
  };
}

function writeCellAabb(layout, x, z) {
  var p = level6CellToWorld(layout, x, z);
  var h = L6_CELL * 0.5;
  return { kind: "wall", minX: p.x - h, maxX: p.x + h, minZ: p.z - h, maxZ: p.z + h };
}

var _resolveOut = { x: 0, z: 0 };
export function resolveCircleAgainstLevel6Maze(px, pz, radius, layout) {
  for (var iter = 0; iter < 6; iter++) {
    var moved = false;
    var center = level6WorldToCell(layout, px, pz);
    for (var z = center.z - 1; z <= center.z + 1; z++) {
      for (var x = center.x - 1; x <= center.x + 1; x++) {
        if (z < 0 || x < 0 || z >= L6_MAZE_H || x >= L6_MAZE_W || layout.grid[z][x] !== 0) {
          var out = pushOutCircleAABB(px, pz, radius, writeCellAabb(layout, x, z));
          if (out.x !== px || out.z !== pz) {
            px = out.x;
            pz = out.z;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
  _resolveOut.x = px;
  _resolveOut.z = pz;
  return _resolveOut;
}

export function getNearbyLevel6WallColliders(layout, px, pz, range) {
  range = range == null ? 2 : range;
  var center = level6WorldToCell(layout, px, pz);
  var out = [];
  for (var z = center.z - range; z <= center.z + range; z++) {
    for (var x = center.x - range; x <= center.x + range; x++) {
      if (z < 0 || x < 0 || z >= L6_MAZE_H || x >= L6_MAZE_W || layout.grid[z][x] !== 0) {
        out.push(writeCellAabb(layout, x, z));
      }
    }
  }
  return out;
}

export function getLevel6PathProgress(layout, px, pz) {
  var cell = level6WorldToCell(layout, px, pz);
  var d = layout.distances[cell.z] && layout.distances[cell.z][cell.x];
  return d >= 0 ? Math.min(1, d / Math.max(1, layout.maxDistance)) : 0;
}

export function isNearLevel6Feature(layout, name, px, pz, radius) {
  var feature = layout.features[name];
  if (!feature) return false;
  var pos = level6CellToWorld(layout, feature.x, feature.z);
  return Math.hypot(px - pos.x, pz - pos.z) <= radius;
}

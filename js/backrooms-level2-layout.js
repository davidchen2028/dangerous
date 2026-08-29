/**
 * Level 2 — 确定性无限隧道拓扑（纯数据，无 Three.js / DOM）
 *
 * 以 session seed + 区块坐标生成欧几里得路网：
 * - 相邻区块四边端口位置一致
 * - 道路方向为 45° 倍数
 * - segment.length 为 5 的倍数且等于端点欧氏距离
 * - 全图通过端口无限连通；出生区块安全
 */

import {
  L2_BRANCH_WIDTH_MAX,
  L2_BRANCH_WIDTH_MIN,
  L2_CHUNK_SIZE,
  L2_DIR_ANGLES_DEG,
  L2_HEIGHT_MAX,
  L2_HEIGHT_MIN,
  L2_MAIN_WIDTH_MAX,
  L2_MAIN_WIDTH_MIN,
  L2_MIN_CLEAR_WIDTH,
  L2_PORT_SLOTS,
  L2_SEGMENT_LEN_STEP,
  L2_SPAWN_CX,
  L2_SPAWN_CZ,
  L2_SPAWN_SAFE_RADIUS,
  L2_SPAWN_X,
  L2_SPAWN_Z,
  L2_STREAM_RADIUS,
  L2_UNLOAD_RADIUS,
} from "./backrooms-level2-constants.js";

export {
  L2_BRANCH_WIDTH_MAX,
  L2_BRANCH_WIDTH_MIN,
  L2_CHUNK_SIZE,
  L2_DIR_ANGLES_DEG,
  L2_HEIGHT_MAX,
  L2_HEIGHT_MIN,
  L2_MAIN_WIDTH_MAX,
  L2_MAIN_WIDTH_MIN,
  L2_MIN_CLEAR_WIDTH,
  L2_PORT_SLOTS,
  L2_SEGMENT_LEN_STEP,
  L2_SPAWN_CX,
  L2_SPAWN_CZ,
  L2_SPAWN_SAFE_RADIUS,
  L2_SPAWN_X,
  L2_SPAWN_Z,
  L2_STREAM_RADIUS,
  L2_UNLOAD_RADIUS,
} from "./backrooms-level2-constants.js";

var EPS = 1e-6;
var DEG45 = Math.PI / 4;
var SQRT2 = Math.SQRT2;
var layoutCache = new Map();

function hashString(value) {
  var text = String(value == null ? "" : value);
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

function mixSeed(seed, a, b, c, d) {
  var h = hashString(seed);
  h = Math.imul(h ^ ((a | 0) + 0x9e3779b9), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ ((b | 0) + 0xc2b2ae35), 0xc2b2ae35) >>> 0;
  if (c != null) h = Math.imul(h ^ ((c | 0) + 0x27d4eb2d), 0x165667b1) >>> 0;
  if (d != null) h = Math.imul(h ^ ((d | 0) + 0x85ebca6b), 0x27d4eb2d) >>> 0;
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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function almostEq(a, b) {
  return Math.abs(a - b) <= EPS;
}

function isMultipleOfStep(value, step) {
  if (!(value > 0)) return false;
  var q = value / step;
  return Math.abs(q - Math.round(q)) <= 1e-9;
}

function quantizeWidth(rng, lo, hi) {
  var t = rng();
  var w = lo + t * (hi - lo);
  return Math.round(w * 10) / 10;
}

function quantizeHeight(rng) {
  var h = L2_HEIGHT_MIN + rng() * (L2_HEIGHT_MAX - L2_HEIGHT_MIN);
  return Math.round(h * 10) / 10;
}

function angleDegFromDelta(dx, dz) {
  var deg = (Math.atan2(dx, dz) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return ((Math.round(deg / 45) * 45) % 360 + 360) % 360;
}

function isValidDirectionDeg(deg) {
  var n = ((Math.round(deg) % 360) + 360) % 360;
  return L2_DIR_ANGLES_DEG.indexOf(n) >= 0;
}

/**
 * @param {number|string} seed
 * @param {number} cx
 * @param {number} cz
 * @returns {string}
 */
export function level2ChunkKey(cx, cz) {
  return (cx | 0) + "," + (cz | 0);
}

/**
 * @param {number} px
 * @param {number} pz
 * @returns {{ cx: number, cz: number }}
 */
export function level2WorldToChunk(px, pz) {
  return {
    cx: Math.floor(px / L2_CHUNK_SIZE),
    cz: Math.floor(pz / L2_CHUNK_SIZE),
  };
}

/** @deprecated 使用 level2WorldToChunk */
export function worldToChunk(px, pz) {
  return level2WorldToChunk(px, pz);
}

/**
 * @param {number} cx
 * @param {number} cz
 * @returns {{ x: number, z: number }}
 */
export function level2ChunkOrigin(cx, cz) {
  return {
    x: (cx | 0) * L2_CHUNK_SIZE,
    z: (cz | 0) * L2_CHUNK_SIZE,
  };
}

/**
 * @param {number} cx
 * @param {number} cz
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number, cx: number, cz: number }}
 */
export function getLevel2ChunkBounds(cx, cz) {
  var o = level2ChunkOrigin(cx, cz);
  return {
    cx: cx | 0,
    cz: cz | 0,
    minX: o.x,
    maxX: o.x + L2_CHUNK_SIZE,
    minZ: o.z,
    maxZ: o.z + L2_CHUNK_SIZE,
  };
}

/**
 * @param {number} cx
 * @param {number} cz
 * @returns {boolean}
 */
export function isLevel2SpawnSafeChunk(cx, cz) {
  return (
    Math.max(Math.abs((cx | 0) - L2_SPAWN_CX), Math.abs((cz | 0) - L2_SPAWN_CZ)) <=
    L2_SPAWN_SAFE_RADIUS
  );
}

/**
 * 共享边端口沿边局部偏移（相邻区块对同一条边得到相同值）。
 * 水平边（南北）：key = h:cx:boundaryZ；竖直边（东西）：key = v:boundaryX:cz
 */
export function getLevel2EdgePortLocal(seed, axis, a, b) {
  var h =
    axis === "h"
      ? mixSeed(seed, 0x4831, a | 0, b | 0, 0x11)
      : mixSeed(seed, 0x5723, a | 0, b | 0, 0x22);
  var rng = mulberry32(h);
  var slots = L2_PORT_SLOTS;
  return slots[Math.floor(rng() * slots.length) % slots.length];
}

function buildPorts(seed, cx, cz) {
  var o = level2ChunkOrigin(cx, cz);
  var southLocal = getLevel2EdgePortLocal(seed, "h", cx, cz);
  var northLocal = getLevel2EdgePortLocal(seed, "h", cx, cz + 1);
  var westLocal = getLevel2EdgePortLocal(seed, "v", cx, cz);
  var eastLocal = getLevel2EdgePortLocal(seed, "v", cx + 1, cz);
  return {
    n: {
      id: "port-n",
      edge: "n",
      localX: northLocal,
      localZ: L2_CHUNK_SIZE,
      x: o.x + northLocal,
      z: o.z + L2_CHUNK_SIZE,
    },
    s: {
      id: "port-s",
      edge: "s",
      localX: southLocal,
      localZ: 0,
      x: o.x + southLocal,
      z: o.z,
    },
    e: {
      id: "port-e",
      edge: "e",
      localX: L2_CHUNK_SIZE,
      localZ: eastLocal,
      x: o.x + L2_CHUNK_SIZE,
      z: o.z + eastLocal,
    },
    w: {
      id: "port-w",
      edge: "w",
      localX: 0,
      localZ: westLocal,
      x: o.x,
      z: o.z + westLocal,
    },
  };
}

function makeNode(id, x, z, kind, extra) {
  var node = {
    id: id,
    x: x,
    z: z,
    kind: kind,
    usable: true,
  };
  if (extra) {
    var k;
    for (k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) node[k] = extra[k];
    }
  }
  return node;
}

function makeSegment(id, ax, az, bx, bz, width, height, kind, feature) {
  var dx = bx - ax;
  var dz = bz - az;
  var length = Math.hypot(dx, dz);
  if (!isMultipleOfStep(length, L2_SEGMENT_LEN_STEP)) {
    throw new Error(
      "Level2 segment length must be multiple of " +
        L2_SEGMENT_LEN_STEP +
        ": " +
        length
    );
  }
  var angleDeg = angleDegFromDelta(dx, dz);
  if (!isValidDirectionDeg(angleDeg)) {
    throw new Error("Level2 segment angle invalid: " + angleDeg);
  }
  if (width + EPS < L2_MIN_CLEAR_WIDTH) {
    throw new Error("Level2 segment width below minimum clear: " + width);
  }
  return {
    id: id,
    from: { x: ax, z: az },
    to: { x: bx, z: bz },
    ax: ax,
    az: az,
    bx: bx,
    bz: bz,
    length: length,
    angleDeg: angleDeg,
    width: width,
    height: height,
    kind: kind,
    feature: feature || null,
  };
}

/**
 * 正交折线路由（两端点须使每段投影为 5 的倍数）。
 * preferDiagFirst：先走对角投影再正交收尾的变体用对角线支路单独处理。
 */
function routeOrthoPath(ax, az, bx, bz, rng, width, height, kindPrefix, idBase) {
  var segments = [];
  var nodes = [];
  var dx = bx - ax;
  var dz = bz - az;
  if (almostEq(dx, 0) && almostEq(dz, 0)) return { segments: segments, nodes: nodes };

  if (almostEq(dx, 0) || almostEq(dz, 0)) {
    segments.push(
      makeSegment(idBase + "-0", ax, az, bx, bz, width, height, kindPrefix)
    );
    return { segments: segments, nodes: nodes };
  }

  // L 形：随机选拐角，保证两段均为 5 的倍数（端口/中心均在 5 网格上）
  var viaX;
  var viaZ;
  if (rng() < 0.5) {
    viaX = bx;
    viaZ = az;
  } else {
    viaX = ax;
    viaZ = bz;
  }
  var midId = idBase + "-via";
  nodes.push(makeNode(midId, viaX, viaZ, "waypoint"));
  segments.push(
    makeSegment(idBase + "-a", ax, az, viaX, viaZ, width, height, kindPrefix)
  );
  segments.push(
    makeSegment(idBase + "-b", viaX, viaZ, bx, bz, width, height, kindPrefix)
  );
  return { segments: segments, nodes: nodes };
}

function pickTemplate(rng, safe) {
  if (safe) return "spawn_safe";
  var roll = rng();
  if (roll < 0.18) return "straight_ns";
  if (roll < 0.36) return "straight_ew";
  if (roll < 0.52) return "cross";
  if (roll < 0.66) return "fork_t";
  if (roll < 0.78) return "diagonal_branch";
  if (roll < 0.86) return "equipment_hall";
  if (roll < 0.93) return "storage";
  return "office";
}

function featureRoomOffset(dir, length) {
  // dir: 0..7 for 45° steps; length multiple of 5
  var rad = dir * DEG45;
  // 约定 0° = +Z，与 angleDegFromDelta(atan2(dx,dz)) 一致
  return {
    dx: Math.sin(rad) * length,
    dz: Math.cos(rad) * length,
  };
}

function addDiagonalBranch(state, rng, fromX, fromZ, featureType) {
  var dirs = [1, 3, 5, 7]; // 仅斜向
  var dir = dirs[Math.floor(rng() * dirs.length) % dirs.length];
  var lenSteps = 1 + Math.floor(rng() * 2); // 5 or 10
  var length = lenSteps * L2_SEGMENT_LEN_STEP;
  var off = featureRoomOffset(dir, length);
  var tx = fromX + off.dx;
  var tz = fromZ + off.dz;

  var width = quantizeWidth(rng, L2_BRANCH_WIDTH_MIN, L2_BRANCH_WIDTH_MAX);
  var height = quantizeHeight(rng);
  var fid = "feat-" + featureType + "-" + state.segCount;
  var nid = "node-" + featureType + "-" + state.nodeCount;
  state.nodes.push(
    makeNode(nid, tx, tz, "feature", { feature: featureType })
  );
  state.nodeCount += 1;
  state.segments.push(
    makeSegment(
      fid,
      fromX,
      fromZ,
      tx,
      tz,
      width,
      height,
      "diagonal_branch",
      featureType
    )
  );
  state.segCount += 1;
  state.features.push({
    id: "feature-" + featureType + "-" + state.features.length,
    type: featureType,
    nodeId: nid,
    x: tx,
    z: tz,
    approachFrom: { x: fromX, z: fromZ },
  });
}

function pushRoute(state, route, kind) {
  var i;
  for (i = 0; i < route.nodes.length; i++) {
    route.nodes[i].id = "wp-" + state.nodeCount;
    state.nodeCount += 1;
    state.nodes.push(route.nodes[i]);
  }
  for (i = 0; i < route.segments.length; i++) {
    var seg = route.segments[i];
    seg.id = "seg-" + kind + "-" + state.segCount;
    seg.kind = kind;
    state.segCount += 1;
    state.segments.push(seg);
  }
}

function connectPortToHub(state, rng, port, hub, mainWidth, mainHeight, kind) {
  var route = routeOrthoPath(
    port.x,
    port.z,
    hub.x,
    hub.z,
    rng,
    mainWidth,
    mainHeight,
    kind,
    "tmp"
  );
  pushRoute(state, route, kind);
}

function buildChunkLayout(seed, cx, cz) {
  var safe = isLevel2SpawnSafeChunk(cx, cz);
  var chunkSeed = mixSeed(seed, cx, cz, 0x10f2, 0);
  var rng = mulberry32(chunkSeed);
  var origin = level2ChunkOrigin(cx, cz);
  var ports = buildPorts(seed, cx, cz);
  var template = pickTemplate(rng, safe);

  var hubLocalX = 20;
  var hubLocalZ = 20;
  // 出生区 hub 略偏北，给出生点更长的南向直道
  if (safe) {
    hubLocalX = 20;
    hubLocalZ = 20;
  }

  var hub = makeNode(
    "hub",
    origin.x + hubLocalX,
    origin.z + hubLocalZ,
    safe ? "spawn_hub" : "hub"
  );

  var mainWidth = safe
    ? 6.5
    : quantizeWidth(rng, L2_MAIN_WIDTH_MIN, L2_MAIN_WIDTH_MAX);
  mainWidth = clamp(mainWidth, L2_MAIN_WIDTH_MIN, L2_MAIN_WIDTH_MAX);
  if (mainWidth + EPS < L2_MIN_CLEAR_WIDTH) mainWidth = L2_MIN_CLEAR_WIDTH;

  var mainHeight = safe ? 4.2 : quantizeHeight(rng);
  var branchWidth = quantizeWidth(rng, L2_BRANCH_WIDTH_MIN, L2_BRANCH_WIDTH_MAX);

  var state = {
    origin: origin,
    nodes: [hub],
    segments: [],
    features: [],
    nodeCount: 1,
    segCount: 0,
  };

  // 端口节点
  var edge;
  for (edge in ports) {
    if (!Object.prototype.hasOwnProperty.call(ports, edge)) continue;
    var p = ports[edge];
    state.nodes.push(
      makeNode(p.id, p.x, p.z, "port", { edge: edge, usable: true })
    );
  }

  var kindMain = "main";
  if (template === "straight_ns" || template === "straight_ew") {
    kindMain = "straight";
  } else if (template === "cross" || template === "spawn_safe") {
    kindMain = "cross";
  } else if (template === "fork_t") {
    kindMain = "fork";
  }

  // 始终连接四边端口 → hub，保证无限连通
  if (template === "straight_ns") {
    connectPortToHub(state, rng, ports.n, hub, mainWidth, mainHeight, "straight");
    connectPortToHub(state, rng, ports.s, hub, mainWidth, mainHeight, "straight");
    connectPortToHub(state, rng, ports.e, hub, branchWidth, mainHeight, "branch");
    connectPortToHub(state, rng, ports.w, hub, branchWidth, mainHeight, "branch");
  } else if (template === "straight_ew") {
    connectPortToHub(state, rng, ports.e, hub, mainWidth, mainHeight, "straight");
    connectPortToHub(state, rng, ports.w, hub, mainWidth, mainHeight, "straight");
    connectPortToHub(state, rng, ports.n, hub, branchWidth, mainHeight, "branch");
    connectPortToHub(state, rng, ports.s, hub, branchWidth, mainHeight, "branch");
  } else if (template === "fork_t") {
    // T：三向主通道 + 一侧支路
    var arms = ["n", "s", "e", "w"];
    var stub = arms[Math.floor(rng() * 4) % 4];
    for (var ai = 0; ai < arms.length; ai++) {
      var a = arms[ai];
      var w = a === stub ? branchWidth : mainWidth;
      var k = a === stub ? "branch" : "fork";
      connectPortToHub(state, rng, ports[a], hub, w, mainHeight, k);
    }
  } else {
    // cross / spawn / feature templates：四向主通道
    connectPortToHub(state, rng, ports.n, hub, mainWidth, mainHeight, kindMain);
    connectPortToHub(state, rng, ports.s, hub, mainWidth, mainHeight, kindMain);
    connectPortToHub(state, rng, ports.e, hub, mainWidth, mainHeight, kindMain);
    connectPortToHub(state, rng, ports.w, hub, mainWidth, mainHeight, kindMain);
  }

  // 特征：斜向支路 / 设备厅 / 储藏 / 办公（出生区不放危险特征厅，仅可选轻量储藏）
  if (template === "diagonal_branch" || template === "cross") {
    addDiagonalBranch(state, rng, hub.x, hub.z, "spur");
  }
  if (template === "equipment_hall") {
    addDiagonalBranch(state, rng, hub.x, hub.z, "equipment");
  } else if (template === "storage") {
    addDiagonalBranch(state, rng, hub.x, hub.z, "storage");
  } else if (template === "office") {
    addDiagonalBranch(state, rng, hub.x, hub.z, "office");
  } else if (template === "fork_t" && rng() < 0.55) {
    addDiagonalBranch(state, rng, hub.x, hub.z, "spur");
  } else if (safe && rng() < 0.35) {
    // 出生区偶发储藏 alcove（仍安全，无敌对标记）
    addDiagonalBranch(state, rng, hub.x, hub.z, "storage");
  }

  // 额外岔路：从某条主段中点拉出短斜向支路（非出生）
  if (!safe && (template === "cross" || template === "fork_t") && rng() < 0.45) {
    var candidates = state.segments.filter(function (s) {
      return s.kind === "cross" || s.kind === "fork" || s.kind === "main" || s.kind === "straight";
    });
    if (candidates.length) {
      var base = candidates[Math.floor(rng() * candidates.length) % candidates.length];
      var mx = (base.ax + base.bx) * 0.5;
      var mz = (base.az + base.bz) * 0.5;
      // 中点可能不在整数坐标；斜向支路仍用固定长度 5，几何自洽
      addDiagonalBranch(state, rng, mx, mz, rng() < 0.5 ? "spur" : "storage");
    }
  }

  return {
    seed: String(seed),
    cx: cx | 0,
    cz: cz | 0,
    key: level2ChunkKey(cx, cz),
    chunkSeed: chunkSeed,
    origin: origin,
    bounds: getLevel2ChunkBounds(cx, cz),
    ports: ports,
    hub: hub,
    template: template,
    safe: safe,
    mainWidth: mainWidth,
    mainHeight: mainHeight,
    nodes: state.nodes,
    segments: state.segments,
    features: state.features,
  };
}

/**
 * 确定性生成区块拓扑。同 seed+坐标恒等。
 * @param {number|string} seed
 * @param {number} cx
 * @param {number} cz
 */
export function getLevel2ChunkLayout(seed, cx, cz) {
  var key = String(seed) + "|" + level2ChunkKey(cx, cz);
  if (layoutCache.has(key)) return layoutCache.get(key);
  var layout = buildChunkLayout(seed, cx | 0, cz | 0);
  layoutCache.set(key, layout);
  return layout;
}

/** 测试用：清空布局缓存 */
export function clearLevel2LayoutCache() {
  layoutCache.clear();
}

/**
 * 出生区：位置、朝向、安全包围盒、所在区块布局摘要。
 * @param {number|string=} seed
 */
export function getLevel2SpawnZone(seed) {
  var s = seed == null ? "0" : seed;
  var layout = getLevel2ChunkLayout(s, L2_SPAWN_CX, L2_SPAWN_CZ);
  var bounds = getLevel2ChunkBounds(L2_SPAWN_CX, L2_SPAWN_CZ);
  return {
    seed: String(s),
    cx: L2_SPAWN_CX,
    cz: L2_SPAWN_CZ,
    x: L2_SPAWN_X,
    z: L2_SPAWN_Z,
    yaw: 0,
    safe: true,
    bounds: bounds,
    /** 救援/积分用：整个出生区块 */
    rescueBounds: {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
    },
    layout: layout,
  };
}

/**
 * 可用节点（寻路 / 流浪者 / 实体挂点）。
 * @param {number|string} seed
 * @param {number} cx
 * @param {number} cz
 * @param {{ includePorts?: boolean, includeFeatures?: boolean, kinds?: string[] }=} opts
 * @returns {Array<object>}
 */
export function getLevel2AvailableNodes(seed, cx, cz, opts) {
  opts = opts || {};
  var layout = getLevel2ChunkLayout(seed, cx, cz);
  var includePorts = opts.includePorts !== false;
  var includeFeatures = opts.includeFeatures !== false;
  var kindFilter = opts.kinds || null;
  var out = [];
  for (var i = 0; i < layout.nodes.length; i++) {
    var n = layout.nodes[i];
    if (n.usable === false) continue;
    if (!includePorts && n.kind === "port") continue;
    if (!includeFeatures && n.kind === "feature") continue;
    if (kindFilter && kindFilter.indexOf(n.kind) < 0) continue;
    out.push(n);
  }
  return out;
}

/**
 * 列出区块内全部路网节点（含端口）。
 */
export function listLevel2ChunkNodes(seed, cx, cz) {
  return getLevel2ChunkLayout(seed, cx, cz).nodes.slice();
}

/**
 * 列出区块路段。
 */
export function listLevel2ChunkSegments(seed, cx, cz) {
  return getLevel2ChunkLayout(seed, cx, cz).segments.slice();
}

/**
 * 校验单段是否满足拓扑不变量（测试与调试）。
 */
export function validateLevel2Segment(seg) {
  var dx = seg.bx - seg.ax;
  var dz = seg.bz - seg.az;
  var geo = Math.hypot(dx, dz);
  if (!almostEq(geo, seg.length)) {
    return { ok: false, reason: "length_mismatch", geo: geo, length: seg.length };
  }
  if (!isMultipleOfStep(seg.length, L2_SEGMENT_LEN_STEP)) {
    return { ok: false, reason: "length_not_step", length: seg.length };
  }
  if (!isValidDirectionDeg(seg.angleDeg)) {
    return { ok: false, reason: "bad_angle", angleDeg: seg.angleDeg };
  }
  var expected = angleDegFromDelta(dx, dz);
  if (!almostEq(expected, seg.angleDeg) && !(expected === 0 && seg.angleDeg === 360)) {
    // 0 与 360 等价已在 angleDegFromDelta 归一
    if (expected !== seg.angleDeg) {
      return {
        ok: false,
        reason: "angle_mismatch",
        expected: expected,
        angleDeg: seg.angleDeg,
      };
    }
  }
  if (seg.width + EPS < L2_MIN_CLEAR_WIDTH) {
    return { ok: false, reason: "width_low", width: seg.width };
  }
  return { ok: true };
}

/**
 * 校验相邻区块共享边端口一致。
 */
export function level2PortsMatch(seed, cx, cz, neighbor) {
  var a = getLevel2ChunkLayout(seed, cx, cz);
  var b;
  if (neighbor === "n") {
    b = getLevel2ChunkLayout(seed, cx, cz + 1);
    return almostEq(a.ports.n.x, b.ports.s.x) && almostEq(a.ports.n.z, b.ports.s.z);
  }
  if (neighbor === "s") {
    b = getLevel2ChunkLayout(seed, cx, cz - 1);
    return almostEq(a.ports.s.x, b.ports.n.x) && almostEq(a.ports.s.z, b.ports.n.z);
  }
  if (neighbor === "e") {
    b = getLevel2ChunkLayout(seed, cx + 1, cz);
    return almostEq(a.ports.e.x, b.ports.w.x) && almostEq(a.ports.e.z, b.ports.w.z);
  }
  if (neighbor === "w") {
    b = getLevel2ChunkLayout(seed, cx - 1, cz);
    return almostEq(a.ports.w.x, b.ports.e.x) && almostEq(a.ports.w.z, b.ports.e.z);
  }
  return false;
}

/**
 * BFS：从出生端口图走到目标区块（仅检查端口连通的抽象网格）。
 * 因每块四端口均接入 hub，任意有限区块对均可连通。
 */
export function level2ChunksReachable(seed, fromCx, fromCz, toCx, toCz, maxSteps) {
  maxSteps = maxSteps == null ? 64 : maxSteps;
  var start = level2ChunkKey(fromCx, fromCz);
  var goal = level2ChunkKey(toCx, toCz);
  if (start === goal) return true;
  var q = [{ cx: fromCx | 0, cz: fromCz | 0, d: 0 }];
  var seen = Object.create(null);
  seen[start] = true;
  var dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  while (q.length) {
    var cur = q.shift();
    if (cur.d >= maxSteps) continue;
    // 触发生成以确认布局存在且端口齐全
    var layout = getLevel2ChunkLayout(seed, cur.cx, cur.cz);
    if (!layout.ports.n || !layout.ports.s || !layout.ports.e || !layout.ports.w) {
      return false;
    }
    for (var i = 0; i < dirs.length; i++) {
      var nx = cur.cx + dirs[i][0];
      var nz = cur.cz + dirs[i][1];
      var k = level2ChunkKey(nx, nz);
      if (seen[k]) continue;
      seen[k] = true;
      if (k === goal) return true;
      q.push({ cx: nx, cz: nz, d: cur.d + 1 });
    }
  }
  return false;
}

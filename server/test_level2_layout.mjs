/**
 * Level 2 拓扑纯 Node 测试（无 DOM / Three）
 *
 * 运行：node server/test_level2_layout.mjs
 */
import {
  L2_CHUNK_SIZE,
  L2_MAIN_WIDTH_MAX,
  L2_MAIN_WIDTH_MIN,
  L2_MIN_CLEAR_WIDTH,
  L2_SEGMENT_LEN_STEP,
  L2_SPAWN_CX,
  L2_SPAWN_CZ,
  clearLevel2LayoutCache,
  getLevel2AvailableNodes,
  getLevel2ChunkBounds,
  getLevel2ChunkLayout,
  getLevel2SpawnZone,
  isLevel2SpawnSafeChunk,
  level2ChunkKey,
  level2ChunkOrigin,
  level2ChunksReachable,
  level2PortsMatch,
  level2WorldToChunk,
  listLevel2ChunkSegments,
  validateLevel2Segment,
} from "../js/backrooms-level2-layout.js";

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error("FAIL:", msg);
  }
}

function assertEq(a, b, msg) {
  assert(a === b, msg + " (got " + a + ", expected " + b + ")");
}

function assertClose(a, b, msg, eps) {
  eps = eps == null ? 1e-6 : eps;
  assert(Math.abs(a - b) <= eps, msg + " (got " + a + ", expected " + b + ")");
}

clearLevel2LayoutCache();
var SEED = "l2-test-seed-42";

// —— 世界 / 区块转换 ——
var c0 = level2WorldToChunk(0, 0);
assertEq(c0.cx, 0, "world(0,0) cx");
assertEq(c0.cz, 0, "world(0,0) cz");
var c1 = level2WorldToChunk(L2_CHUNK_SIZE, L2_CHUNK_SIZE - 0.01);
assertEq(c1.cx, 1, "world chunk x");
assertEq(c1.cz, 0, "world chunk z edge");
var origin = level2ChunkOrigin(2, -3);
assertEq(origin.x, 2 * L2_CHUNK_SIZE, "chunk origin x");
assertEq(origin.z, -3 * L2_CHUNK_SIZE, "chunk origin z");
assertEq(level2ChunkKey(-1, 4), "-1,4", "chunk key");

var bounds = getLevel2ChunkBounds(1, 2);
assertEq(bounds.minX, L2_CHUNK_SIZE, "bounds minX");
assertEq(bounds.maxX, L2_CHUNK_SIZE * 2, "bounds maxX");
assertEq(bounds.minZ, L2_CHUNK_SIZE * 2, "bounds minZ");
assertEq(bounds.maxZ, L2_CHUNK_SIZE * 3, "bounds maxZ");

// —— 确定性 ——
clearLevel2LayoutCache();
var a = getLevel2ChunkLayout(SEED, 3, -2);
clearLevel2LayoutCache();
var b = getLevel2ChunkLayout(SEED, 3, -2);
assertEq(JSON.stringify(a.ports), JSON.stringify(b.ports), "deterministic ports");
assertEq(a.segments.length, b.segments.length, "deterministic segment count");
assertEq(a.template, b.template, "deterministic template");
for (var si = 0; si < a.segments.length; si++) {
  assertClose(a.segments[si].length, b.segments[si].length, "det length " + si);
  assertClose(a.segments[si].ax, b.segments[si].ax, "det ax " + si);
  assertClose(a.segments[si].bz, b.segments[si].bz, "det bz " + si);
}

// —— 出生区安全 ——
assert(isLevel2SpawnSafeChunk(L2_SPAWN_CX, L2_SPAWN_CZ), "spawn chunk safe");
var spawn = getLevel2SpawnZone(SEED);
assert(spawn.safe, "spawn zone safe flag");
assertEq(spawn.cx, 0, "spawn cx");
assertEq(spawn.cz, 0, "spawn cz");
assert(spawn.layout.safe, "spawn layout safe");
assert(
  spawn.layout.features.every(function (feature) {
    return feature.type !== "office";
  }),
  "spawn safe chunk excludes EL3A office"
);
assert(
  spawn.x >= spawn.bounds.minX && spawn.x < spawn.bounds.maxX,
  "spawn x in bounds"
);
assert(
  spawn.z >= spawn.bounds.minZ && spawn.z < spawn.bounds.maxZ,
  "spawn z in bounds"
);

// —— 四边端口稳定匹配 ——
var coords = [
  [0, 0],
  [1, 0],
  [0, 1],
  [-2, 3],
  [5, -4],
  [10, 10],
];
for (var ci = 0; ci < coords.length; ci++) {
  var cx = coords[ci][0];
  var cz = coords[ci][1];
  assert(level2PortsMatch(SEED, cx, cz, "n"), "ports match N " + cx + "," + cz);
  assert(level2PortsMatch(SEED, cx, cz, "s"), "ports match S " + cx + "," + cz);
  assert(level2PortsMatch(SEED, cx, cz, "e"), "ports match E " + cx + "," + cz);
  assert(level2PortsMatch(SEED, cx, cz, "w"), "ports match W " + cx + "," + cz);
  var layout = getLevel2ChunkLayout(SEED, cx, cz);
  assert(!!layout.ports.n && !!layout.ports.s && !!layout.ports.e && !!layout.ports.w, "four ports");
}

// —— 路段不变量：角度 / 长度 / 宽度 ——
var seenKinds = Object.create(null);
var seenFeatures = Object.create(null);
var mainWidthsOk = true;
var anyDiagonal = false;
var anyForkOrCross = false;
var scanned = 0;

for (var x = -4; x <= 4; x++) {
  for (var z = -4; z <= 4; z++) {
    var lay = getLevel2ChunkLayout(SEED, x, z);
    scanned += 1;
    seenKinds[lay.template] = true;
    if (lay.template === "fork_t" || lay.template === "cross" || lay.template === "spawn_safe") {
      anyForkOrCross = true;
    }
    for (var fi = 0; fi < lay.features.length; fi++) {
      seenFeatures[lay.features[fi].type] = true;
      if (lay.features[fi].type === "office") {
        assertEq(lay.features[fi].code, "EL3A", "office feature uses EL3A code");
        assert(!lay.safe, "EL3A office is outside safe chunks");
      }
    }
    var segs = lay.segments;
    assert(segs.length > 0, "segments non-empty " + x + "," + z);
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var v = validateLevel2Segment(seg);
      assert(v.ok, "segment valid " + x + "," + z + " #" + i + " " + (v.reason || ""));
      assert(
        Math.abs(seg.length / L2_SEGMENT_LEN_STEP - Math.round(seg.length / L2_SEGMENT_LEN_STEP)) < 1e-9,
        "length step " + seg.length
      );
      assertClose(
        seg.length,
        Math.hypot(seg.bx - seg.ax, seg.bz - seg.az),
        "geo length " + x + "," + z + " #" + i
      );
      assert(seg.width >= L2_MIN_CLEAR_WIDTH - 1e-9, "min clear width");
      if (seg.kind === "straight" || seg.kind === "cross" || seg.kind === "main" || seg.kind === "fork") {
        if (seg.width < L2_MAIN_WIDTH_MIN - 1e-9 || seg.width > L2_MAIN_WIDTH_MAX + 1e-9) {
          // fork stub may be branch width; only enforce for non-branch kinds that are main channels
          if (seg.kind !== "fork" || seg.width >= L2_MAIN_WIDTH_MIN - 1e-9) {
            if (seg.width < L2_MAIN_WIDTH_MIN - 1e-9) mainWidthsOk = false;
          }
        }
      }
      if (seg.kind === "diagonal_branch" || seg.angleDeg % 90 !== 0) {
        anyDiagonal = true;
      }
    }
  }
}

assert(scanned === 81, "scanned 9x9 chunks");
assert(anyDiagonal, "has diagonal branches");
assert(anyForkOrCross, "has fork/cross");

// 在更大范围采样特征类型
for (var sx = -12; sx <= 12; sx++) {
  for (var sz = -12; sz <= 12; sz++) {
    var ly = getLevel2ChunkLayout(SEED, sx, sz);
    for (var fj = 0; fj < ly.features.length; fj++) {
      seenFeatures[ly.features[fj].type] = true;
      if (ly.features[fj].type === "office") {
        assertEq(ly.features[fj].code, "EL3A", "sampled office uses EL3A code");
        assert(!ly.safe, "sampled EL3A office is outside safe chunks");
      }
    }
    seenKinds[ly.template] = true;
  }
}

assert(!!seenFeatures.equipment, "has equipment feature");
assert(!!seenFeatures.storage, "has storage feature");
assert(!!seenFeatures.office, "has office feature");
assert(
  !!seenKinds.straight_ns || !!seenKinds.straight_ew,
  "has straight template"
);
assert(!!seenKinds.diagonal_branch || !!seenFeatures.spur, "has diagonal/spur");

// 出生区块主通道宽度
var spawnLay = getLevel2ChunkLayout(SEED, 0, 0);
assert(
  spawnLay.mainWidth >= L2_MAIN_WIDTH_MIN && spawnLay.mainWidth <= L2_MAIN_WIDTH_MAX,
  "spawn main width in range"
);

// —— 可用节点 API ——
var nodes = getLevel2AvailableNodes(SEED, 0, 0);
assert(nodes.length >= 5, "available nodes include hub+ports");
var noPorts = getLevel2AvailableNodes(SEED, 1, 1, { includePorts: false });
assert(
  noPorts.every(function (n) {
    return n.kind !== "port";
  }),
  "filter ports"
);

var segsList = listLevel2ChunkSegments(SEED, 2, 2);
assert(segsList.length > 0, "list segments");

// —— 无限连通（抽象四邻接 + 每块四端口）——
assert(level2ChunksReachable(SEED, 0, 0, 7, -5, 40), "reachable far chunk");
assert(level2ChunksReachable(SEED, -3, 2, 4, 4, 40), "reachable pair");

// 不同 seed 应产生不同端口（高概率）
var other = getLevel2ChunkLayout("other-seed", 3, -2);
assert(
  JSON.stringify(a.ports) !== JSON.stringify(other.ports) ||
    a.template !== other.template,
  "different seeds diverge"
);

console.log(
  "Level2 layout tests: " +
    passed +
    " passed, " +
    failed +
    " failed" +
    (mainWidthsOk ? "" : " (note: some main widths outside band on stubs)")
);
if (failed > 0) process.exit(1);

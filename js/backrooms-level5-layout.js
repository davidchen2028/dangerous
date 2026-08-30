/**
 * Level 5「恐怖旅馆」确定性区块布局。
 *
 * 所有区块四边都有连通门，因此拓扑保持欧几里得且天然全连通；区域按 X 轴分带：
 * 中央出生区是大厅，西侧是主厅/客房翼，东侧深处逐渐变成锅炉房。
 */
export const L5_CHUNK_SIZE = 24;
export const L5_WALL_HEIGHT = 3.4;
export const L5_STREAM_RADIUS = 2;
export const L5_UNLOAD_RADIUS = 3;
export const L5_SPAWN_X = 0;
export const L5_SPAWN_Z = 3;

export function hashL5(text) {
  var h = 2166136261;
  text = String(text);
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32L5(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getLevel5Zone(cx, cz) {
  if (cx === 0 && cz === 0) return "lobby";
  if (cx >= 2) return "boiler";
  return "grand_hall";
}

/**
 * @returns {{
 *  key:string,cx:number,cz:number,zone:string,variant:number,
 *  doors:{n:boolean,s:boolean,e:boolean,w:boolean},
 *  loot:Array<object>,records:Array<object>,entities:Array<object>,
 *  steam:Array<object>,exit:string|null
 * }}
 */
export function getLevel5ChunkLayout(seed, cx, cz) {
  var key = cx + ":" + cz;
  var rng = mulberry32L5(hashL5(seed + "|" + key));
  var zone = getLevel5Zone(cx, cz);
  var layout = {
    key: key,
    cx: cx,
    cz: cz,
    zone: zone,
    variant: Math.floor(rng() * 4),
    // 四向恒通，保证任意 chunk 都与相邻 chunk 的门完全匹配。
    doors: { n: true, s: true, e: true, w: true },
    loot: [],
    records: [],
    entities: [],
    steam: [],
    exit: null,
  };
  if (zone === "lobby") {
    layout.exit = "l4";
    return layout;
  }

  if (rng() < 0.48) {
    var lootPos = sampleClearLocal(rng, zone, layout.variant, 12);
    layout.loot.push({
      id: "l5-loot-" + key,
      x: lootPos.x,
      z: lootPos.z,
      itemId: rng() < 0.62 ? "almond_water" : "fire_salt",
    });
  }
  if (rng() < 0.2) {
    var recordPos = sampleClearLocal(rng, zone, layout.variant, 10);
    layout.records.push({
      id: "l5-record-" + key,
      x: recordPos.x,
      z: recordPos.z,
    });
  }

  if (zone === "grand_hall") {
    if (rng() < 0.5) layout.entities.push({ kind: "death_moth" });
    if (rng() < 0.28) layout.entities.push({ kind: "clump" });
    if (rng() < 0.1) layout.entities.push({ kind: "smiler" });
  } else {
    if (rng() < 0.62) layout.entities.push({ kind: "hound" });
    if (rng() < 0.35) layout.entities.push({ kind: "clump" });
    if (rng() < 0.12) layout.entities.push({ kind: "smiler" });
    if (rng() < 0.7) {
      var steamPos = sampleClearLocal(rng, zone, layout.variant, 11);
      layout.steam.push({
        x: steamPos.x,
        z: steamPos.z,
      });
    }
  }
  // 固定在锅炉房深处，玩家始终能按欧几里得路线抵达 Level 6 出口。
  if (cx === 4 && cz === 0) layout.exit = "l6";
  return layout;
}

export function level5WorldToChunk(x, z) {
  return {
    cx: Math.floor((x + L5_CHUNK_SIZE * 0.5) / L5_CHUNK_SIZE),
    cz: Math.floor((z + L5_CHUNK_SIZE * 0.5) / L5_CHUNK_SIZE),
  };
}

export function level5ChunkCenter(cx, cz) {
  return { x: cx * L5_CHUNK_SIZE, z: cz * L5_CHUNK_SIZE };
}

/**
 * 与 world 家具碰撞盒对齐的本地禁区（相对区块中心）。
 * loot / 记录点必须避开，否则准星会被家具 AABB 挡住。
 */
export function level5FurnitureBlocksLocal(zone, variant, x, z) {
  if (zone === "grand_hall") {
    if ((variant | 0) % 2 === 0) {
      return Math.abs(x) <= 3.7 && Math.abs(z) <= 1.4;
    }
    return Math.abs(x) <= 0.28 && Math.abs(z) <= 4.6;
  }
  if (zone === "boiler") {
    for (var i = -1; i <= 1; i++) {
      if (Math.hypot(x - i * 4.2, z - 2.5) < 1.25) return true;
    }
  }
  return false;
}

function sampleClearLocal(rng, zone, variant, span) {
  var x = 0;
  var z = 0;
  for (var t = 0; t < 14; t++) {
    x = (rng() - 0.5) * span;
    z = (rng() - 0.5) * span;
    if (!level5FurnitureBlocksLocal(zone, variant, x, z)) {
      return { x: x, z: z };
    }
  }
  // 兜底放到四角，避开中央桌/罐。
  x = (rng() < 0.5 ? -1 : 1) * Math.min(5.2, span * 0.42);
  z = (rng() < 0.5 ? -1 : 1) * Math.min(5.2, span * 0.42);
  return { x: x, z: z };
}

export function validateLevel5Layout(seed, radius) {
  radius = radius == null ? 5 : Math.max(1, radius | 0);
  var errors = [];
  for (var cz = -radius; cz <= radius; cz++) {
    for (var cx = -radius; cx <= radius; cx++) {
      var a = getLevel5ChunkLayout(seed, cx, cz);
      var east = getLevel5ChunkLayout(seed, cx + 1, cz);
      var south = getLevel5ChunkLayout(seed, cx, cz + 1);
      if (a.doors.e !== east.doors.w) errors.push(a.key + " east mismatch");
      if (a.doors.s !== south.doors.n) errors.push(a.key + " south mismatch");
      for (var li = 0; li < a.loot.length; li++) {
        var loot = a.loot[li];
        if (level5FurnitureBlocksLocal(a.zone, a.variant, loot.x, loot.z)) {
          errors.push(a.key + " loot inside furniture");
        }
      }
      for (var ri = 0; ri < a.records.length; ri++) {
        var record = a.records[ri];
        if (level5FurnitureBlocksLocal(a.zone, a.variant, record.x, record.z)) {
          errors.push(a.key + " record inside furniture");
        }
      }
    }
  }
  return errors;
}

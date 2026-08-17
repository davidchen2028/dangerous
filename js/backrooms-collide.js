/**
 * 后室 — 圆形玩家 vs AABB 碰撞（含体内弹出）
 *
 * 热路径一律回填模块级复用对象，避免每帧数千次 {x,z} 分配触发 GC。
 * 调用方必须立即拷贝 .x/.z，不可长期持有返回引用。
 */

/** @type {{ x: number, z: number }} */
const _pushOut = { x: 0, z: 0 };
/** @type {{ x: number, z: number }} */
const _resolveOut = { x: 0, z: 0 };

export function pushOutCircleAABB(px, pz, radius, box) {
  var closestX = Math.max(box.minX, Math.min(px, box.maxX));
  var closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
  var dx = px - closestX;
  var dz = pz - closestZ;
  var distSq = dx * dx + dz * dz;
  var r2 = radius * radius;

  if (distSq > r2) {
    _pushOut.x = px;
    _pushOut.z = pz;
    return _pushOut;
  }

  if (distSq > 1e-8) {
    var dist = Math.sqrt(distSq);
    var push = radius - dist;
    _pushOut.x = px + (dx / dist) * push;
    _pushOut.z = pz + (dz / dist) * push;
    return _pushOut;
  }

  var penL = px + radius - box.minX;
  var penR = box.maxX - (px - radius);
  var penB = pz + radius - box.minZ;
  var penF = box.maxZ - (pz - radius);
  var minPen = Math.min(penL, penR, penB, penF);

  if (minPen === penL) px -= penL;
  else if (minPen === penR) px += penR;
  else if (minPen === penB) pz -= penB;
  else pz += penF;

  _pushOut.x = px;
  _pushOut.z = pz;
  return _pushOut;
}

export function circleOverlapsAabb(px, pz, radius, box) {
  return distancePointToAabb(px, pz, box) < radius - 1e-4;
}

export function circleOverlapsAny(px, pz, radius, colliders) {
  var i;
  for (i = 0; i < colliders.length; i++) {
    if (circleOverlapsAabb(px, pz, radius, colliders[i])) return true;
  }
  return false;
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {number} radius
 * @param {object[]} colliders
 * @param {number} [nearPad=8]
 * @param {number} [maxIter=8]
 * @returns {{ x: number, z: number }} 模块级复用对象，立即拷贝字段
 */
export function resolveCircleAgainstColliders(px, pz, radius, colliders, nearPad, maxIter) {
  nearPad = nearPad == null ? 8 : nearPad;
  maxIter = maxIter == null ? 8 : maxIter;
  var iter;
  var i;
  var c;
  var out;
  var moved;
  var list = colliders;
  // 大量 collider 时用空间分桶，避免每帧全量遍历。
  if (colliders && colliders.length > 48) {
    list = queryColliderBucket(colliders, px, pz, radius + nearPad);
  }

  for (iter = 0; iter < maxIter; iter++) {
    moved = false;
    if (iter > 0 && list !== colliders && colliders.length > 48) {
      list = queryColliderBucket(colliders, px, pz, radius + nearPad);
    }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c.ghost) continue;
      if (
        px + radius < c.minX - nearPad ||
        px - radius > c.maxX + nearPad ||
        pz + radius < c.minZ - nearPad ||
        pz - radius > c.maxZ + nearPad
      ) {
        continue;
      }
      out = pushOutCircleAABB(px, pz, radius, c);
      if (out.x !== px || out.z !== pz) {
        px = out.x;
        pz = out.z;
        moved = true;
      }
    }
    if (!moved) break;
  }

  _resolveOut.x = px;
  _resolveOut.z = pz;
  return _resolveOut;
}

const SPATIAL_CELL = 16;
/** @type {object[]} */
const _bucketQuery = [];
var _queryMark = 1;

function ensureColliderSpatial(colliders) {
  var cache = colliders.__brSpatial;
  if (cache && cache.len === colliders.length) return cache;
  var map = Object.create(null);
  var i;
  for (i = 0; i < colliders.length; i++) {
    var box = colliders[i];
    if (!box || box.ghost) continue;
    var x0 = Math.floor(box.minX / SPATIAL_CELL);
    var x1 = Math.floor(box.maxX / SPATIAL_CELL);
    var z0 = Math.floor(box.minZ / SPATIAL_CELL);
    var z1 = Math.floor(box.maxZ / SPATIAL_CELL);
    var x;
    var z;
    for (x = x0; x <= x1; x++) {
      for (z = z0; z <= z1; z++) {
        var key = x + "," + z;
        if (!map[key]) map[key] = [];
        map[key].push(box);
      }
    }
  }
  cache = { map: map, len: colliders.length };
  try {
    colliders.__brSpatial = cache;
  } catch (err) {
    /* 只读数组时忽略缓存 */
  }
  return cache;
}

function queryColliderBucket(colliders, px, pz, pad) {
  var spatial = ensureColliderSpatial(colliders);
  var map = spatial.map;
  var x0 = Math.floor((px - pad) / SPATIAL_CELL);
  var x1 = Math.floor((px + pad) / SPATIAL_CELL);
  var z0 = Math.floor((pz - pad) / SPATIAL_CELL);
  var z1 = Math.floor((pz + pad) / SPATIAL_CELL);
  _bucketQuery.length = 0;
  _queryMark++;
  if (_queryMark > 1e9) _queryMark = 1;
  var mark = _queryMark;
  var x;
  var z;
  var i;
  for (x = x0; x <= x1; x++) {
    for (z = z0; z <= z1; z++) {
      var bucket = map[x + "," + z];
      if (!bucket) continue;
      for (i = 0; i < bucket.length; i++) {
        var box = bucket[i];
        if (box.__brQMark === mark) continue;
        box.__brQMark = mark;
        _bucketQuery.push(box);
      }
    }
  }
  return _bucketQuery;
}

/** 玩家到 AABB 最近距离（用于交互判定） */
export function distancePointToAabb(px, pz, box) {
  var cx = Math.max(box.minX, Math.min(px, box.maxX));
  var cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  return Math.hypot(px - cx, pz - cz);
}

export function aabbCenter(box) {
  return {
    x: (box.minX + box.maxX) * 0.5,
    z: (box.minZ + box.maxZ) * 0.5,
  };
}

/**
 * 射线与轴对齐盒相交，返回沿射线方向最近命中距离（无命中返回 null）
 */
export function raycastAabbDistance(
  ox,
  oy,
  oz,
  dx,
  dy,
  dz,
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
  maxDist
) {
  var tmin = 0;
  var tmax = maxDist;
  var eps = 1e-8;

  if (Math.abs(dx) < eps) {
    if (ox < minX || ox > maxX) return null;
  } else {
    var invX = 1 / dx;
    var tx1 = (minX - ox) * invX;
    var tx2 = (maxX - ox) * invX;
    var tlo = Math.min(tx1, tx2);
    var thi = Math.max(tx1, tx2);
    tmin = Math.max(tmin, tlo);
    tmax = Math.min(tmax, thi);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < eps) {
    if (oy < minY || oy > maxY) return null;
  } else {
    var invY = 1 / dy;
    var ty1 = (minY - oy) * invY;
    var ty2 = (maxY - oy) * invY;
    var tloY = Math.min(ty1, ty2);
    var thiY = Math.max(ty1, ty2);
    tmin = Math.max(tmin, tloY);
    tmax = Math.min(tmax, thiY);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < eps) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    var invZ = 1 / dz;
    var tz1 = (minZ - oz) * invZ;
    var tz2 = (maxZ - oz) * invZ;
    var tloZ = Math.min(tz1, tz2);
    var thiZ = Math.max(tz1, tz2);
    tmin = Math.max(tmin, tloZ);
    tmax = Math.min(tmax, thiZ);
    if (tmin > tmax) return null;
  }

  if (tmax < 0) return null;
  var hit = tmin >= 0 ? tmin : tmax;
  return hit <= maxDist ? hit : null;
}

/**
 * 准星射线被墙体 AABB 遮挡的最近距离（无墙则 > maxDist）
 */
export function raycastWallBlockDistance(
  origin,
  direction,
  maxDist,
  colliders,
  minY,
  maxY
) {
  var block = maxDist + 1;
  if (!colliders || !colliders.length) return block;

  var ox = origin.x;
  var oy = origin.y;
  var oz = origin.z;
  var dx = direction.x;
  var dy = direction.y;
  var dz = direction.z;
  var pad = maxDist + 1.5;
  var i;
  var c;

  for (i = 0; i < colliders.length; i++) {
    c = colliders[i];
    if (c.ghost) continue;
    if (c.kind && c.kind !== "wall") continue;
    if (
      ox + pad < c.minX ||
      ox - pad > c.maxX ||
      oz + pad < c.minZ ||
      oz - pad > c.maxZ
    ) {
      continue;
    }
    var t = raycastAabbDistance(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      c.minX,
      minY,
      c.minZ,
      c.maxX,
      maxY,
      c.maxZ,
      maxDist
    );
    if (t != null && t < block) block = t;
  }
  return block;
}

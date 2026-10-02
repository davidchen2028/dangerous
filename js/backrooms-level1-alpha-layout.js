/**
 * Level 1 M.E.G. Base Alpha — 3×3 原尺寸房间。
 * 四边：前门 / 左门 / 右门 / 后门。四角各伸一条白走廊（东南条接 L2 / 枢纽）。
 * 不改职业表；办公室门仍用 officer / clearance / supervisor。
 */

export const ALPHA_SIGN = "M.E.G. Base Alpha";
export const ALPHA_LOCKED_NOTE = "须联络 Omega / 未对你的职级开放";
export const ALPHA_OFFICE_LOCK_NOTE = "权限不足。晋升后回行政署报到。";
export const ALPHA_ZEPHYR_NOTE = "西风区扩建中";
export const ALPHA_AQUILA_NOTE =
  "收集者与失物招领由门厅人事登记。天鹰币仅 Alpha 内部记账，不对外兑换。";
export const ALPHA_BRIEFING_TOAST =
  "探险署简报：先走标注路线。西风区扩建中，勿自行开路。收集者与失物招领走门厅人事。";

export const ALPHA_OFFICE_RANKS = Object.freeze([
  "officer",
  "clearance",
  "supervisor",
]);

export const ALPHA_DEPT_NOTICES = Object.freeze({
  explore: "探险署：标注路线优先。西风区未开放。",
  research: "研究署：样本须封存后送 Omega 对照。",
  logistics: "后勤署：寄存柜周转，勿私藏任务物资。",
  security: "安保署：门厅秩序与后门警戒由当值小队负责。",
});

/** 单间原尺寸；3×3 拼成九倍占地。 */
export const ALPHA_PLAN_SCALE = 3;
export const ALPHA_CELL = Object.freeze({ w: 14, d: 10, h: 6 });
export const ALPHA_LOBBY = Object.freeze({
  w: ALPHA_CELL.w * ALPHA_PLAN_SCALE,
  d: ALPHA_CELL.d * ALPHA_PLAN_SCALE,
  h: ALPHA_CELL.h,
});
export const ALPHA_WING_DOOR_W = 1.42;
export const ALPHA_WING_DOOR_H = 2.55;
export const ALPHA_CELLAR_Y = -3.6;
export const ALPHA_CELLAR_H = 3.2;
export const ALPHA_ROOM_H = 3.4;
export const ALPHA_CORRIDOR_LEN = 52;
export const ALPHA_SIT_SANITY = 8;
export const ALPHA_SIDE_DOOR_W = 2.8;
export const ALPHA_WALK_GAP = 2.8;

export const ALPHA_WINGS = Object.freeze([
  { id: "explore", label: "探险署", locked: false },
  { id: "research", label: "研究署", locked: true },
  { id: "archive", label: "档案署", locked: true },
  { id: "admin", label: "行政署", locked: true },
]);

const HX = ALPHA_LOBBY.w * 0.5;
const HZ = ALPHA_LOBBY.d * 0.5;
const WALL_T = 0.4;
const CELL_W = ALPHA_CELL.w;
const CELL_D = ALPHA_CELL.d;

export function canEnterMegOffice(profile) {
  if (!profile) return false;
  if (profile.locked || profile.online !== true) return false;
  if (profile.authorityActive === false) return false;
  return ALPHA_OFFICE_RANKS.indexOf(profile.rank) >= 0;
}

export function officeNoticeText(profile) {
  var dept = profile && profile.department;
  if (dept && ALPHA_DEPT_NOTICES[dept]) return ALPHA_DEPT_NOTICES[dept];
  return "本职告示：回门厅人事更新编制后再读对应署令。";
}

export function supervisorPlateText(profile) {
  if (profile && profile.rank === "supervisor" && profile.supervisorCode) {
    return "监督者办公室 · " + profile.supervisorCode;
  }
  return "高级办公室 · 前哨主管及以上";
}

export function isInsideAabb(px, pz, b, pad) {
  if (!b) return false;
  var p = pad || 0;
  return (
    px >= b.minX + p &&
    px <= b.maxX - p &&
    pz >= b.minZ + p &&
    pz <= b.maxZ - p
  );
}

function cellBox(cx, cz, col, row) {
  var mx = cx + (col - 1) * CELL_W;
  var mz = cz + (row - 1) * CELL_D;
  return {
    id: col + "," + row,
    col: col,
    row: row,
    mx: mx,
    mz: mz,
    minX: mx - CELL_W * 0.5,
    maxX: mx + CELL_W * 0.5,
    minZ: mz - CELL_D * 0.5,
    maxZ: mz + CELL_D * 0.5,
  };
}

function slotAlong(mid, width) {
  var half = width * 0.5;
  return { min: mid - half, max: mid + half };
}

function corridorFrom(face, axis, sign, midA, midB) {
  var start = face;
  var end = face + sign * ALPHA_CORRIDOR_LEN;
  var halfW = (ALPHA_SIDE_DOOR_W - 0.2) * 0.5;
  if (axis === "x") {
    return {
      axis: "x",
      sign: sign,
      startX: start,
      endX: end,
      minX: Math.min(start, end),
      maxX: Math.max(start, end),
      minZ: midB - halfW,
      maxZ: midB + halfW,
      midZ: midB,
      midX: (start + end) * 0.5,
      walkX: start + sign * 8,
      walkZ: midB,
      halfW: halfW,
    };
  }
  return {
    axis: "z",
    sign: sign,
    startZ: start,
    endZ: end,
    minZ: Math.min(start, end),
    maxZ: Math.max(start, end),
    minX: midA - halfW,
    maxX: midA + halfW,
    midX: midA,
    midZ: (start + end) * 0.5,
    walkX: midA,
    walkZ: start + sign * 8,
    halfW: halfW,
  };
}

export function getAlphaLayout(center) {
  var cx = center.x;
  var cz = center.z;
  var sw = cellBox(cx, cz, 0, 0);
  var s = cellBox(cx, cz, 1, 0);
  var se = cellBox(cx, cz, 2, 0);
  var w = cellBox(cx, cz, 0, 1);
  var c = cellBox(cx, cz, 1, 1);
  var e = cellBox(cx, cz, 2, 1);
  var nw = cellBox(cx, cz, 0, 2);
  var n = cellBox(cx, cz, 1, 2);
  var ne = cellBox(cx, cz, 2, 2);
  var westX = cx - HX;
  var eastX = cx + HX;
  var southZ = cz - HZ;
  var northZ = cz + HZ;
  var front = slotAlong(w.mz, ALPHA_SIDE_DOOR_W);
  var back = slotAlong(e.mz, ALPHA_SIDE_DOOR_W);
  var left = slotAlong(n.mx, ALPHA_SIDE_DOOR_W);
  var right = slotAlong(s.mx, ALPHA_SIDE_DOOR_W);
  var officeDoorZ = slotAlong(n.mz, ALPHA_WING_DOOR_W);
  var officeWallX = (n.maxX + ne.minX) * 0.5;
  var stairs = {
    minX: ne.maxX - 1.4,
    maxX: ne.maxX,
    minZ: ne.maxZ,
    maxZ: ne.maxZ + 4,
  };
  var cellar = {
    minX: ne.maxX - 5,
    maxX: ne.maxX,
    minZ: stairs.maxZ,
    maxZ: stairs.maxZ + 4,
    floorY: ALPHA_CELLAR_Y,
  };
  var corridors = {
    sw: corridorFrom(sw.minZ, "z", -1, sw.mx, sw.mz),
    se: corridorFrom(se.maxX, "x", 1, se.mx, se.mz),
    nw: corridorFrom(nw.minX, "x", -1, nw.mx, nw.mz),
    ne: corridorFrom(ne.maxZ, "z", 1, ne.mx, ne.mz),
  };
  var lockedWings = [
    { id: "research", label: "研究署", x: n.mx - 3.2, z: n.maxZ - 0.22 },
    { id: "archive", label: "档案署", x: n.mx + 3.2, z: n.maxZ - 0.22 },
    { id: "admin", label: "行政署", x: n.mx + 4.2, z: n.minZ + 0.22 },
  ];
  return {
    center: { x: cx, z: cz },
    hx: HX,
    hz: HZ,
    wallT: WALL_T,
    cellW: CELL_W,
    cellD: CELL_D,
    northZ: northZ,
    westX: westX,
    eastX: eastX,
    southZ: southZ,
    cells: { sw: sw, s: s, se: se, w: w, c: c, e: e, nw: nw, n: n, ne: ne },
    lobby: {
      minX: westX,
      maxX: eastX,
      minZ: southZ,
      maxZ: northZ,
    },
    doors: {
      front: { which: "front", x: westX, z: w.mz, minZ: front.min, maxZ: front.max },
      back: { which: "back", x: eastX, z: e.mz, minZ: back.min, maxZ: back.max },
      left: { which: "left", x: n.mx, z: northZ, minX: left.min, maxX: left.max },
      right: { which: "right", x: s.mx, z: southZ, minX: right.min, maxX: right.max },
    },
    corridors: corridors,
    explore: nw,
    office: ne,
    officeDoor: {
      x: officeWallX,
      z: n.mz,
      minZ: officeDoorZ.min,
      maxZ: officeDoorZ.max,
    },
    officeNorthDoor: {
      x: ne.mx,
      z: northZ,
      minX: ne.mx - ALPHA_WING_DOOR_W * 0.5,
      maxX: ne.mx + ALPHA_WING_DOOR_W * 0.5,
    },
    stairs: stairs,
    cellar: cellar,
    lockedWings: lockedWings,
    wings: [
      { id: "explore", label: "探险署", locked: false, x: nw.mx - 3.2, z: n.minZ + 0.22 },
      {
        id: "research",
        label: "研究署",
        locked: true,
        x: lockedWings[0].x,
        z: lockedWings[0].z,
        minX: lockedWings[0].x - ALPHA_WING_DOOR_W * 0.5,
        maxX: lockedWings[0].x + ALPHA_WING_DOOR_W * 0.5,
      },
      {
        id: "archive",
        label: "档案署",
        locked: true,
        x: lockedWings[1].x,
        z: lockedWings[1].z,
        minX: lockedWings[1].x - ALPHA_WING_DOOR_W * 0.5,
        maxX: lockedWings[1].x + ALPHA_WING_DOOR_W * 0.5,
      },
      {
        id: "admin",
        label: "行政署",
        locked: true,
        x: lockedWings[2].x,
        z: lockedWings[2].z,
        minX: lockedWings[2].x - ALPHA_WING_DOOR_W * 0.5,
        maxX: lockedWings[2].x + ALPHA_WING_DOOR_W * 0.5,
      },
    ],
  };
}

export function isInsideAlphaLobby(px, pz, center) {
  return (
    Math.abs(px - center.x) <= HX - 1.2 &&
    Math.abs(pz - center.z) <= HZ - 1.2
  );
}

export function isInsideAlphaExplore(px, pz, center) {
  return isInsideAabb(px, pz, getAlphaLayout(center).explore, 0.08);
}

export function isInsideAlphaOffice(px, pz, center) {
  return isInsideAabb(px, pz, getAlphaLayout(center).office, 0.08);
}

export function isOnAlphaStairs(px, pz, center) {
  return isInsideAabb(px, pz, getAlphaLayout(center).stairs, 0.04);
}

export function isInsideAlphaCellar(px, pz, center) {
  return isInsideAabb(px, pz, getAlphaLayout(center).cellar, 0.08);
}

export function isInsideAlphaCorridor(px, pz, center) {
  var L = getAlphaLayout(center);
  var keys = ["sw", "se", "nw", "ne"];
  for (var i = 0; i < keys.length; i++) {
    if (isInsideAabb(px, pz, L.corridors[keys[i]], 0)) return keys[i];
  }
  return null;
}

export function isInsideAlphaComplex(px, pz, center) {
  var L = getAlphaLayout(center);
  if (
    px >= L.lobby.minX + 0.08 &&
    px <= L.lobby.maxX - 0.08 &&
    pz >= L.lobby.minZ + 0.08 &&
    pz <= L.lobby.maxZ - 0.08
  ) {
    return true;
  }
  if (isInsideAlphaCorridor(px, pz, center)) return true;
  return (
    isInsideAabb(px, pz, L.stairs, 0) || isInsideAabb(px, pz, L.cellar, 0)
  );
}

export function getAlphaFloorY(px, pz, center) {
  var L = getAlphaLayout(center);
  if (isInsideAabb(px, pz, L.cellar, 0)) return ALPHA_CELLAR_Y;
  if (isInsideAabb(px, pz, L.stairs, 0)) {
    var span = L.stairs.maxZ - L.stairs.minZ;
    var t = span > 0.01 ? (pz - L.stairs.minZ) / span : 1;
    t = Math.max(0, Math.min(1, t));
    return t <= 0 ? 0 : ALPHA_CELLAR_Y * t;
  }
  return 0;
}

/** 下楼梯时地面每帧下降，不贴坡就会离地再砸回去。起跳中不吸。 */
export function stickAlphaRampY(feetY, velY, px, pz, center) {
  if (velY > 0.05) return feetY;
  var floorY = getAlphaFloorY(px, pz, center);
  if (floorY >= 0) return feetY;
  if (feetY > floorY && feetY <= floorY + 0.65) return floorY;
  return feetY;
}

export function getAlphaCeilingY(px, pz, center, fallback) {
  var L = getAlphaLayout(center);
  if (isInsideAabb(px, pz, L.cellar, 0)) return ALPHA_CELLAR_Y + ALPHA_CELLAR_H;
  if (isInsideAabb(px, pz, L.stairs, 0)) {
    return getAlphaFloorY(px, pz, center) + ALPHA_CELLAR_H;
  }
  if (isInsideAlphaComplex(px, pz, center)) return ALPHA_LOBBY.h;
  return fallback != null ? fallback : 4.5;
}

export function listAlphaClearBounds(center) {
  var L = getAlphaLayout(center);
  var pad = 2.2;
  function grow(b) {
    return {
      minX: b.minX - pad,
      maxX: b.maxX + pad,
      minZ: b.minZ - pad,
      maxZ: b.maxZ + pad,
    };
  }
  return [
    grow(L.lobby),
    grow(L.stairs),
    grow(L.cellar),
    grow(L.corridors.sw),
    grow(L.corridors.se),
    grow(L.corridors.nw),
    grow(L.corridors.ne),
  ];
}

function wall(minX, maxX, minZ, maxZ, kind) {
  return {
    kind: kind || "wall",
    minX: minX,
    maxX: maxX,
    minZ: minZ,
    maxZ: maxZ,
  };
}

function subtractOpenings(minX, maxX, openings) {
  var cuts = openings
    .slice()
    .sort(function (a, b) {
      return a.minX - b.minX;
    });
  var segs = [];
  var cursor = minX;
  for (var i = 0; i < cuts.length; i++) {
    var o = cuts[i];
    if (o.maxX <= cursor || o.minX >= maxX) continue;
    var a = Math.max(o.minX, minX);
    var b = Math.min(o.maxX, maxX);
    if (a > cursor + 0.04) segs.push({ minX: cursor, maxX: a });
    cursor = Math.max(cursor, b);
  }
  if (cursor < maxX - 0.04) segs.push({ minX: cursor, maxX: maxX });
  return segs;
}

function wallRunX(walls, minX, maxX, z0, z1, gaps) {
  var segs = subtractOpenings(minX, maxX, gaps || []);
  for (var i = 0; i < segs.length; i++) {
    walls.push(wall(segs[i].minX, segs[i].maxX, z0, z1));
  }
}

function wallRunZ(walls, minZ, maxZ, x0, x1, gaps) {
  var mapped = (gaps || []).map(function (g) {
    return { minX: g.minZ, maxX: g.maxZ };
  });
  var segs = subtractOpenings(minZ, maxZ, mapped);
  for (var i = 0; i < segs.length; i++) {
    walls.push(wall(x0, x1, segs[i].minX, segs[i].maxX));
  }
}

function gapX(mid, width) {
  var h = width * 0.5;
  return { minX: mid - h, maxX: mid + h };
}

function gapZ(mid, width) {
  var h = width * 0.5;
  return { minZ: mid - h, maxZ: mid + h };
}

export function listAlphaNorthOpenings(center) {
  var L = getAlphaLayout(center);
  return [
    { minX: L.doors.left.minX, maxX: L.doors.left.maxX, id: "left" },
    {
      minX: L.officeNorthDoor.minX,
      maxX: L.officeNorthDoor.maxX,
      id: "ne_corridor",
    },
    { minX: L.stairs.minX, maxX: L.stairs.maxX, id: "stairs" },
  ];
}

export function listAlphaSolidColliders(center, opts) {
  opts = opts || {};
  var officeOpen = !!opts.officeOpen;
  var L = getAlphaLayout(center);
  var walls = [];
  var t = WALL_T * 0.5;
  var walk = ALPHA_WALK_GAP;

  wallRunX(walls, L.lobby.minX, L.lobby.maxX, L.northZ - t, L.northZ + t, [
    gapX(L.doors.left.x, ALPHA_SIDE_DOOR_W),
    gapX(L.corridors.ne.midX, ALPHA_WING_DOOR_W),
    gapX((L.stairs.minX + L.stairs.maxX) * 0.5, L.stairs.maxX - L.stairs.minX + 0.16),
  ]);
  wallRunX(walls, L.lobby.minX, L.lobby.maxX, L.southZ - t, L.southZ + t, [
    gapX(L.doors.right.x, ALPHA_SIDE_DOOR_W),
    gapX(L.corridors.sw.midX, ALPHA_SIDE_DOOR_W),
  ]);
  wallRunZ(walls, L.lobby.minZ, L.lobby.maxZ, L.westX - t, L.westX + t, [
    gapZ(L.doors.front.z, ALPHA_SIDE_DOOR_W),
    gapZ(L.corridors.nw.midZ, ALPHA_SIDE_DOOR_W),
  ]);
  wallRunZ(walls, L.lobby.minZ, L.lobby.maxZ, L.eastX - t, L.eastX + t, [
    gapZ(L.doors.back.z, ALPHA_SIDE_DOOR_W),
    gapZ(L.corridors.se.midZ, ALPHA_SIDE_DOOR_W),
  ]);

  var xSplitW = L.cells.w.maxX;
  var xSplitE = L.cells.c.maxX;
  var zSplitS = L.cells.s.maxZ;
  var zSplitN = L.cells.c.maxZ;

  wallRunZ(walls, L.lobby.minZ, L.lobby.maxZ, xSplitW - t, xSplitW + t, [
    gapZ(L.cells.sw.mz, walk),
    gapZ(L.cells.w.mz, walk),
    gapZ(L.cells.nw.mz, walk),
  ]);
  wallRunZ(walls, L.lobby.minZ, L.lobby.maxZ, xSplitE - t, xSplitE + t, [
    gapZ(L.cells.se.mz, walk),
    gapZ(L.cells.e.mz, walk),
    gapZ(L.officeDoor.z, ALPHA_WING_DOOR_W),
  ]);
  wallRunX(walls, L.lobby.minX, L.lobby.maxX, zSplitS - t, zSplitS + t, [
    gapX(L.cells.sw.mx, walk),
    gapX(L.cells.s.mx, walk),
    gapX(L.cells.se.mx, walk),
  ]);
  wallRunX(walls, L.lobby.minX, L.lobby.maxX, zSplitN - t, zSplitN + t, [
    gapX(L.cells.nw.mx, walk),
    gapX(L.cells.n.mx, walk),
  ]);

  var i;
  for (i = 0; i < L.lockedWings.length; i++) {
    var lw = L.lockedWings[i];
    walls.push(
      wall(
        lw.x - ALPHA_WING_DOOR_W * 0.5 + 0.02,
        lw.x + ALPHA_WING_DOOR_W * 0.5 - 0.02,
        lw.z - 0.12,
        lw.z + 0.12,
        "meg_wing_door"
      )
    );
  }
  if (!officeOpen) {
    walls.push(
      wall(
        L.officeDoor.x - 0.16,
        L.officeDoor.x + 0.16,
        L.officeDoor.minZ + 0.02,
        L.officeDoor.maxZ - 0.02,
        "meg_office_door"
      )
    );
    walls.push(
      wall(
        L.officeNorthDoor.minX + 0.02,
        L.officeNorthDoor.maxX - 0.02,
        L.officeNorthDoor.z - 0.16,
        L.officeNorthDoor.z + 0.16,
        "meg_office_door"
      )
    );
  }

  walls.push(wall(L.stairs.minX - 0.22, L.stairs.minX, L.stairs.minZ, L.stairs.maxZ));
  walls.push(wall(L.stairs.maxX, L.stairs.maxX + 0.22, L.stairs.minZ, L.stairs.maxZ));
  walls.push(wall(L.cellar.minX - 0.2, L.cellar.minX, L.cellar.minZ, L.cellar.maxZ));
  walls.push(wall(L.cellar.maxX, L.cellar.maxX + 0.2, L.cellar.minZ, L.cellar.maxZ));
  walls.push(wall(L.cellar.minX, L.stairs.minX - 0.02, L.cellar.minZ - 0.2, L.cellar.minZ));
  walls.push(wall(L.cellar.minX, L.cellar.maxX, L.cellar.maxZ, L.cellar.maxZ + 0.2));
  return walls;
}

export function hitsAlphaSolid(px, pz, center, opts) {
  var walls = listAlphaSolidColliders(center, opts);
  for (var i = 0; i < walls.length; i++) {
    var c = walls[i];
    if (px >= c.minX && px <= c.maxX && pz >= c.minZ && pz <= c.maxZ) return true;
  }
  return false;
}

export function listAlphaWalkPath(center) {
  var L = getAlphaLayout(center);
  var exploreIn = { x: L.explore.mx, z: L.explore.mz };
  var officeIn = { x: L.office.mx, z: L.office.mz };
  var stairPts = [];
  var sx = (L.stairs.minX + L.stairs.maxX) * 0.5;
  for (var i = 0; i <= 4; i++) {
    stairPts.push({
      x: sx,
      z: L.stairs.minZ + 0.08 + ((L.stairs.maxZ - L.stairs.minZ - 0.16) * i) / 4,
    });
  }
  return {
    exploreDoor: { x: L.cells.w.maxX, z: L.cells.nw.mz },
    exploreIn: exploreIn,
    officeIn: officeIn,
    stairs: stairPts,
    cellarIn: {
      x: (L.cellar.minX + L.cellar.maxX) * 0.5,
      z: (L.cellar.minZ + L.cellar.maxZ) * 0.5,
    },
    lockedDoor: { x: L.wings[1].x, z: L.wings[1].z },
    officeDoor: { x: L.officeDoor.x, z: L.officeDoor.z },
    stairOff: {
      x: L.stairs.maxX + 0.1,
      z: (L.stairs.minZ + L.stairs.maxZ) * 0.5,
    },
  };
}

function zephyrOnCorridor(co) {
  if (co.axis === "x") {
    var endX = co.endX;
    return {
      minX: endX - co.sign * 1.25,
      maxX: endX + co.sign * 0.22,
      minZ: co.midZ - co.halfW - 0.08,
      maxZ: co.midZ + co.halfW + 0.08,
      signX: endX - co.sign * 0.72,
      signZ: co.midZ,
      startX: co.startX,
      endX: endX,
      walkX: co.walkX,
      walkZ: co.walkZ,
      voidX: endX + co.sign * 0.6,
      axis: "x",
    };
  }
  var endZ = co.endZ;
  return {
    minX: co.midX - co.halfW - 0.08,
    maxX: co.midX + co.halfW + 0.08,
    minZ: endZ - co.sign * 1.25,
    maxZ: endZ + co.sign * 0.22,
    signX: co.midX,
    signZ: endZ - co.sign * 0.72,
    startZ: co.startZ,
    endZ: endZ,
    walkX: co.walkX,
    walkZ: co.walkZ,
    voidX: endZ + co.sign * 0.6,
    axis: "z",
  };
}

/** 枢纽 / L2 仍走东南角 +X 走廊。 */
export function getZephyrBarricade(center) {
  return zephyrOnCorridor(getAlphaLayout(center).corridors.se);
}

export function getHubCorridor(center) {
  return getAlphaLayout(center).corridors.se;
}

export function hitsZephyrBarricade(px, pz, center) {
  var b = getZephyrBarricade(center);
  return px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ;
}

export function corridorProgress(px, pz, co) {
  if (co.axis === "x") {
    var spanX = co.endX - co.startX;
    if (Math.abs(spanX) < 0.01) return 0;
    return Math.max(0, Math.min(1, (px - co.startX) / spanX));
  }
  var spanZ = co.endZ - co.startZ;
  if (Math.abs(spanZ) < 0.01) return 0;
  return Math.max(0, Math.min(1, (pz - co.startZ) / spanZ));
}

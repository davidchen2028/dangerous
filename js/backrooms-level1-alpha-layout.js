/**
 * Level 1 M.E.G. Base Alpha — 门厅四署 + 高级办公室 / 地下室 AABB。
 * 不改职业表；办公室门禁用现成 officer / clearance / supervisor。
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

export const ALPHA_LOBBY = Object.freeze({ w: 14, d: 10, h: 6 });
export const ALPHA_WING_DOOR_W = 1.42;
export const ALPHA_WING_DOOR_H = 2.55;
export const ALPHA_CELLAR_Y = -3.6;
export const ALPHA_CELLAR_H = 3.2;
export const ALPHA_ROOM_H = 3.4;
export const ALPHA_CORRIDOR_LEN = 52;
export const ALPHA_SIT_SANITY = 8;

export const ALPHA_WINGS = Object.freeze([
  { id: "explore", label: "探险署", dx: -5.4, locked: false },
  { id: "research", label: "研究署", dx: -2.7, locked: true },
  { id: "archive", label: "档案署", dx: 0, locked: true },
  { id: "admin", label: "行政署", dx: 2.65, locked: true },
]);

export const ALPHA_OFFICE_DOOR_DX = 5.32;

const HX = ALPHA_LOBBY.w * 0.5;
const HZ = ALPHA_LOBBY.d * 0.5;
const WALL_T = 0.4;
const FRONT_DOOR_W = 2.8;

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
  if (
    profile &&
    profile.rank === "supervisor" &&
    profile.supervisorCode
  ) {
    return "监督者办公室 · " + profile.supervisorCode;
  }
  return "高级办公室 · 前哨主管及以上";
}

function doorSlot(x) {
  var half = ALPHA_WING_DOOR_W * 0.5;
  return { minX: x - half, maxX: x + half };
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

export function getAlphaLayout(center) {
  var cx = center.x;
  var cz = center.z;
  var northZ = cz + HZ;
  var wings = ALPHA_WINGS.map(function (wing) {
    var x = cx + wing.dx;
    var slot = doorSlot(x);
    return {
      id: wing.id,
      label: wing.label,
      locked: wing.locked,
      x: x,
      minX: slot.minX,
      maxX: slot.maxX,
    };
  });
  var officeDoorX = cx + ALPHA_OFFICE_DOOR_DX;
  var officeSlot = doorSlot(officeDoorX);
  var explore = {
    minX: cx - 7.45,
    maxX: cx - 3.25,
    minZ: northZ + 0.22,
    maxZ: northZ + 4.02,
  };
  var office = {
    minX: cx + 2.15,
    maxX: cx + 8.15,
    minZ: northZ + 0.22,
    maxZ: northZ + 5.22,
  };
  var stairs = {
    minX: office.maxX - 1.4,
    maxX: office.maxX,
    minZ: office.maxZ,
    maxZ: office.maxZ + 4,
  };
  var cellar = {
    minX: office.maxX - 5,
    maxX: office.maxX,
    minZ: stairs.maxZ,
    maxZ: stairs.maxZ + 4,
    floorY: ALPHA_CELLAR_Y,
  };
  return {
    center: { x: cx, z: cz },
    hx: HX,
    hz: HZ,
    northZ: northZ,
    lobby: {
      minX: cx - HX,
      maxX: cx + HX,
      minZ: cz - HZ,
      maxZ: cz + HZ,
    },
    wings: wings,
    officeDoor: {
      x: officeDoorX,
      minX: officeSlot.minX,
      maxX: officeSlot.maxX,
    },
    explore: explore,
    office: office,
    stairs: stairs,
    cellar: cellar,
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

export function isInsideAlphaComplex(px, pz, center) {
  var L = getAlphaLayout(center);
  if (
    px >= L.lobby.minX + 0.1 &&
    px <= L.lobby.maxX - 0.1 &&
    pz >= L.lobby.minZ + 0.1 &&
    pz <= L.lobby.maxZ - 0.05
  ) {
    return true;
  }
  if (pz >= L.northZ - 0.12 && pz <= L.explore.minZ + 0.06) {
    if (px >= L.wings[0].minX && px <= L.wings[0].maxX) return true;
    if (px >= L.officeDoor.minX && px <= L.officeDoor.maxX) return true;
  }
  return (
    isInsideAabb(px, pz, L.explore, 0) ||
    isInsideAabb(px, pz, L.office, 0) ||
    isInsideAabb(px, pz, L.stairs, 0) ||
    isInsideAabb(px, pz, L.cellar, 0)
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
  if (isInsideAabb(px, pz, L.office, 0) || isInsideAabb(px, pz, L.explore, 0)) {
    return ALPHA_ROOM_H;
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
  return [grow(L.explore), grow(L.office), grow(L.stairs), grow(L.cellar)];
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

export function listAlphaNorthOpenings(center) {
  var L = getAlphaLayout(center);
  var openings = L.wings.map(function (w) {
    return { minX: w.minX, maxX: w.maxX, id: w.id, locked: w.locked };
  });
  openings.push({
    minX: L.officeDoor.minX,
    maxX: L.officeDoor.maxX,
    id: "office",
    locked: "rank",
  });
  return openings;
}

export function listAlphaSolidColliders(center, opts) {
  opts = opts || {};
  var officeOpen = !!opts.officeOpen;
  var L = getAlphaLayout(center);
  var walls = [];
  var northZ = L.northZ;
  var halfT = WALL_T * 0.5;
  var openings = listAlphaNorthOpenings(center);
  var segs = subtractOpenings(L.lobby.minX, L.lobby.maxX, openings);
  var i;
  for (i = 0; i < segs.length; i++) {
    walls.push(
      wall(segs[i].minX, segs[i].maxX, northZ - halfT, northZ + halfT)
    );
  }
  for (i = 0; i < L.wings.length; i++) {
    var wing = L.wings[i];
    if (!wing.locked) continue;
    walls.push(
      wall(wing.minX + 0.02, wing.maxX - 0.02, northZ - 0.22, northZ + 0.22, "meg_wing_door")
    );
  }
  if (!officeOpen) {
    walls.push(
      wall(
        L.officeDoor.minX + 0.02,
        L.officeDoor.maxX - 0.02,
        northZ - 0.22,
        northZ + 0.22,
        "meg_office_door"
      )
    );
  }

  function roomShell(b, southGaps, northGaps) {
    var t = 0.2;
    var northSegs = subtractOpenings(b.minX, b.maxX, northGaps || []);
    var ns;
    for (ns = 0; ns < northSegs.length; ns++) {
      walls.push(
        wall(northSegs[ns].minX, northSegs[ns].maxX, b.maxZ, b.maxZ + t)
      );
    }
    walls.push(wall(b.minX - t, b.minX, b.minZ, b.maxZ));
    walls.push(wall(b.maxX, b.maxX + t, b.minZ, b.maxZ));
    var southSegs = subtractOpenings(b.minX, b.maxX, southGaps || []);
    for (var s = 0; s < southSegs.length; s++) {
      walls.push(
        wall(southSegs[s].minX, southSegs[s].maxX, b.minZ - t, b.minZ)
      );
    }
  }

  roomShell(L.explore, [{ minX: L.wings[0].minX, maxX: L.wings[0].maxX }], []);
  roomShell(
    L.office,
    [{ minX: L.officeDoor.minX, maxX: L.officeDoor.maxX }],
    [{ minX: L.stairs.minX, maxX: L.stairs.maxX }]
  );

  walls.push(wall(L.stairs.minX - 0.22, L.stairs.minX, L.stairs.minZ, L.stairs.maxZ));
  walls.push(wall(L.stairs.maxX, L.stairs.maxX + 0.22, L.stairs.minZ, L.stairs.maxZ));

  roomShell(L.cellar, [{ minX: L.stairs.minX, maxX: L.stairs.maxX }], []);
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
  var exploreDoor = {
    x: L.wings[0].x,
    z: L.northZ - 0.35,
  };
  var exploreIn = {
    x: (L.explore.minX + L.explore.maxX) * 0.5,
    z: (L.explore.minZ + L.explore.maxZ) * 0.5,
  };
  var officeIn = {
    x: (L.office.minX + L.stairs.minX) * 0.5,
    z: (L.office.minZ + L.office.maxZ) * 0.5,
  };
  var stairPts = [];
  var sx = (L.stairs.minX + L.stairs.maxX) * 0.5;
  for (var i = 0; i <= 4; i++) {
    stairPts.push({
      x: sx,
      z: L.stairs.minZ + 0.08 + ((L.stairs.maxZ - L.stairs.minZ - 0.16) * i) / 4,
    });
  }
  var cellarIn = {
    x: (L.cellar.minX + L.cellar.maxX) * 0.5,
    z: (L.cellar.minZ + L.cellar.maxZ) * 0.5,
  };
  return {
    exploreDoor: exploreDoor,
    exploreIn: exploreIn,
    officeIn: officeIn,
    stairs: stairPts,
    cellarIn: cellarIn,
    lockedDoor: { x: L.wings[1].x, z: L.northZ },
    officeDoor: { x: L.officeDoor.x, z: L.northZ },
    stairOff: { x: L.stairs.maxX + 0.1, z: (L.stairs.minZ + L.stairs.maxZ) * 0.5 },
  };
}

export function getZephyrBarricade(center) {
  var startX = center.x + HX + WALL_T + 0.14;
  var endX = startX + ALPHA_CORRIDOR_LEN;
  var halfW = (FRONT_DOOR_W - 0.2) * 0.5;
  return {
    minX: endX - 1.25,
    maxX: endX + 0.22,
    minZ: center.z - halfW - 0.08,
    maxZ: center.z + halfW + 0.08,
    signX: endX - 0.72,
    signZ: center.z,
    startX: startX,
    endX: endX,
    walkX: startX + 8,
    walkZ: center.z,
    voidX: endX + 0.6,
  };
}

export function hitsZephyrBarricade(px, pz, center) {
  var b = getZephyrBarricade(center);
  return px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ;
}

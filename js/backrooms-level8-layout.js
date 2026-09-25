/**
 * Level 8 岩洞系统 — 可走完的一段第九大道 AABB。
 * 约 12×80，不是无限洞穴。
 */

export const L8_WALL_H = 9.2;
export const L8_SPAWN = Object.freeze({ x: 0, z: 34 });
export const L8_SPAWN_YAW = 0;
export const L8_PIPE_ROLL_KEY = "backrooms_l8_pipe_v1";

export const L8_AVENUE = Object.freeze({
  minX: -6,
  maxX: 6,
  minZ: -40,
  maxZ: 40,
});

export const L8_L9_ROAD = Object.freeze({
  minX: -3.6,
  maxX: 3.6,
  minZ: -42.4,
  maxZ: -36,
  /** 先走上碎石、走进光里，再切 L9 */
  exitZ: -39.4,
});

export const L8_MEG_CAMP = Object.freeze({ x: -11.2, z: 2 });
export const L8_EYE_HEIGHT = 1.65;
/** 贴在东壁内侧。local +Z 朝 −X（大道）。 */
export const L8_VENT = Object.freeze({ x: 5.68, y: 1.45, z: -8 });
export const L8_VENT_YAW = -Math.PI * 0.5;
export const L8_VENT_PICK = Object.freeze({
  x: 5.62,
  y: 1.65,
  z: -8,
  w: 0.2,
  h: 1.75,
  d: 1.6,
});
export const L8_PIPE = Object.freeze({ x: -12.4, z: 16.6 });
/** 管口 local −Z 朝 +X（大道入口）。 */
export const L8_PIPE_YAW = -Math.PI * 0.5;
/** 告示 local +Z 朝 +X（歇脚入口）。 */
export const L8_MEG_NOTICE_YAW = Math.PI * 0.5;
export const L8_PLANK = Object.freeze({ x: 11.1, z: 16 });
/** 堵住水洼两侧走到大道外的虚空廊。 */
export const L8_POOL_SHOULDERS = Object.freeze([
  { minX: -8.35, maxX: -6.0, minZ: 27.75, maxZ: 28.25 },
  { minX: 6.0, maxX: 8.35, minZ: 27.75, maxZ: 28.25 },
]);

export const L8_PLANK_ZONE = Object.freeze({
  minX: 9.2,
  maxX: 13.0,
  minZ: 13.6,
  maxZ: 18.4,
});

export const L8_MARKERS = Object.freeze([
  { id: 1, x: 3.35, z: 30.2, title: "欢迎来到第九大道", sub: "1 号道标 · M.E.G." },
  { id: 2, x: -3.45, z: 16.1, title: "第九大道", sub: "2 号道标 · 跟着走" },
  { id: 3, x: 3.4, z: 2.1, title: "第九大道", sub: "3 号道标" },
  { id: 4, x: -3.35, z: -12.2, title: "第九大道", sub: "4 号道标" },
  { id: 5, x: 3.25, z: -28.1, title: "第九大道", sub: "5 号道标 · 前方 Level 9" },
]);

/** 岔路出生，不挡大道。 */
export const L8_CHICKEN_HOMES = Object.freeze([
  { x: -12.2, z: 18.4, rotY: 0.4 },
  { x: 12.1, z: 18.2, rotY: -1.2 },
  { x: 9.4, z: -22.1, rotY: 2.4 },
]);

export function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

export function isInsideL9Road(x, z) {
  return Number(z) < L8_L9_ROAD.exitZ && Math.abs(Number(x)) < L8_L9_ROAD.maxX;
}

export function isOnNinthAvenue(x, z) {
  return (
    Number(x) > L8_AVENUE.minX &&
    Number(x) < L8_AVENUE.maxX &&
    Number(z) > L8_AVENUE.minZ &&
    Number(z) < L8_AVENUE.maxZ
  );
}

export function circleHitsAabb(x, z, radius, box) {
  if (!box) return false;
  var r = Number(radius) > 0 ? Number(radius) : 0;
  var nx = Math.max(box.minX, Math.min(Number(x), box.maxX));
  var nz = Math.max(box.minZ, Math.min(Number(z), box.maxZ));
  var dx = Number(x) - nx;
  var dz = Number(z) - nz;
  return dx * dx + dz * dz < r * r;
}

export function hitsLevel8Wall(x, z, radius) {
  var walls = listLevel8WallColliders();
  var i;
  for (i = 0; i < walls.length; i++) {
    if (circleHitsAabb(x, z, radius, walls[i])) return true;
  }
  return false;
}

export function ventPickCoversEye(eyeY) {
  var y = Number(eyeY);
  if (!Number.isFinite(y)) y = L8_EYE_HEIGHT;
  var half = L8_VENT_PICK.h * 0.5;
  return y >= L8_VENT_PICK.y - half && y <= L8_VENT_PICK.y + half;
}

/** 准星盒必须整块在东壁西侧，否则墙挡住 Q，贴墙时人还站进盒子。 */
export function ventPickIsOnAvenueSide() {
  return L8_VENT_PICK.x < 5.75 && L8_VENT_PICK.x > 0;
}

export function ventPickClearsEastWall() {
  return L8_VENT_PICK.x + L8_VENT_PICK.w * 0.5 <= 5.75;
}

/** 贴东壁站定时，准星盒须在 Raycaster.near（0.06）之外。 */
export function ventPickClearsStandNear(nearDist) {
  var near = Number(nearDist);
  if (!Number.isFinite(near)) near = 0.06;
  var standX = 5.75 - 0.34;
  return L8_VENT_PICK.x - L8_VENT_PICK.w * 0.5 >= standX + near;
}

export function eastNookIsOpen() {
  return !hitsLevel8Wall(6.8, -22, 0.34);
}

/** 外墙分段：大道 12 宽，西 MEG/银管、东木板、北 L9 缺口。 */
export function listLevel8WallColliders() {
  var walls = [];
  walls.push(wallCollider(-16.4, 16.4, 40.0, 42.6));
  walls.push(wallCollider(-16.4, L8_L9_ROAD.minX, -43.2, -40.0));
  walls.push(wallCollider(L8_L9_ROAD.maxX, 16.4, -43.2, -40.0));

  walls.push(wallCollider(-8.35, -7.75, 28.0, 40.0));
  walls.push(wallCollider(7.75, 8.35, 28.0, 40.0));
  var s;
  for (s = 0; s < L8_POOL_SHOULDERS.length; s++) {
    walls.push(wallCollider(
      L8_POOL_SHOULDERS[s].minX,
      L8_POOL_SHOULDERS[s].maxX,
      L8_POOL_SHOULDERS[s].minZ,
      L8_POOL_SHOULDERS[s].maxZ
    ));
  }

  walls.push(wallCollider(-6.25, -5.75, 22.0, 28.0));
  walls.push(wallCollider(5.75, 6.25, 22.0, 28.0));

  walls.push(wallCollider(-6.25, -5.75, 8.0, 12.0));
  walls.push(wallCollider(5.75, 6.25, -40.0, -26.0));
  walls.push(wallCollider(5.75, 6.25, -18.0, 10.0));

  walls.push(wallCollider(-6.25, -5.75, -40.0, -4.0));

  walls.push(wallCollider(-16.3, -6.0, -4.25, -3.75));
  walls.push(wallCollider(-16.3, -6.0, 7.75, 8.25));
  walls.push(wallCollider(-16.45, -15.85, -4.0, 8.0));

  walls.push(wallCollider(-16.3, -6.0, 11.75, 12.25));
  walls.push(wallCollider(-16.3, -6.0, 21.75, 22.25));
  walls.push(wallCollider(-16.45, -15.85, 12.0, 22.0));

  walls.push(wallCollider(6.0, 16.3, 9.75, 10.25));
  walls.push(wallCollider(6.0, 16.3, 21.75, 22.25));
  walls.push(wallCollider(15.85, 16.45, 10.0, 22.0));

  walls.push(wallCollider(6.0, 12.3, -26.25, -25.75));
  walls.push(wallCollider(6.0, 12.3, -18.25, -17.75));
  walls.push(wallCollider(11.85, 12.45, -26.0, -18.0));

  return walls;
}

/**
 * Level 2 走廊尺寸 — 无依赖常量，避免 world/doors/xiaoye 循环 import TDZ
 */
export const CORRIDOR_LENGTH = 144;
export const CORRIDOR_WIDTH = 2.9;
export const CORRIDOR_HEIGHT = 3.4;
/** 出生在 +Z 端，朝十字中心 */
export const SPAWN_Z = CORRIDOR_LENGTH * 0.5 - 2;

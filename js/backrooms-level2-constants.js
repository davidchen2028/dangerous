/**
 * Level 2 — 隧道规格与流式区块常量（无依赖，避免循环 import）
 *
 * 新无限隧道拓扑使用 L2_*；下方 CORRIDOR_* / SPAWN_Z 为旧十字走廊兼容导出。
 */

/** 区块边长（米），须为 5 的倍数以便端口与路段对齐 */
export const L2_CHUNK_SIZE = 40;

/** 玩家周围保持加载的切比雪夫半径（区块） */
export const L2_STREAM_RADIUS = 2;

/** 超出后卸载的切比雪夫半径（区块） */
export const L2_UNLOAD_RADIUS = 3;

/** 路段长度步长（米）：每个 segment.length 必须是该值的正整数倍 */
export const L2_SEGMENT_LEN_STEP = 5;

/**
 * 主通道宽度范围（米）
 * 隧道宽度必须远小于路段长度，否则路口开口会吃掉大半侧墙，走廊看起来像空场。
 */
export const L2_MAIN_WIDTH_MIN = 3.2;
export const L2_MAIN_WIDTH_MAX = 4.4;

/** 任意可通行段最低净宽（米） */
export const L2_MIN_CLEAR_WIDTH = 2.4;

/** 支路 / 特征入口宽度范围（米） */
export const L2_BRANCH_WIDTH_MIN = 2.6;
export const L2_BRANCH_WIDTH_MAX = 3.4;

/** 层高范围（米） */
export const L2_HEIGHT_MIN = 3.4;
export const L2_HEIGHT_MAX = 5;

/** 出生区块坐标 */
export const L2_SPAWN_CX = 0;
export const L2_SPAWN_CZ = 0;

/** 出生点世界坐标（出生安全区块中心的固定枢纽） */
export const L2_SPAWN_X = L2_CHUNK_SIZE * 0.5;
export const L2_SPAWN_Z = L2_CHUNK_SIZE * 0.5;

/** 出生安全区额外切比雪夫半径（含出生区块本身为 0） */
export const L2_SPAWN_SAFE_RADIUS = 0;

/** 端口沿边可选局部偏移（相对区块原点，均为 5 的倍数） */
export const L2_PORT_SLOTS = [10, 15, 20, 25, 30];

/** 八方向角度（度），道路方向须落在此集合 */
export const L2_DIR_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

/* —— 旧十字走廊兼容（现有 world/doors/实体仍引用） —— */
export const CORRIDOR_LENGTH = 144;
export const CORRIDOR_WIDTH = 2.9;
export const CORRIDOR_HEIGHT = 3.4;
/** 出生在 +Z 端，朝十字中心 */
export const SPAWN_Z = CORRIDOR_LENGTH * 0.5 - 2;

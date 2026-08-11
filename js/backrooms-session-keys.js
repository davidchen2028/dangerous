/**
 * 后室 sessionStorage 键集中管理 — resetBackroomsRun 统一清理
 */
import { SURVIVAL_STORAGE_KEY } from "./backrooms-survival-persist.js";
import {
  MEG_CHECKPOINT_KEY,
  MEG_DEATH_KEY,
  MEG_RESPAWN_FLAG,
} from "./backrooms-meg-checkpoint.js";
import {
  XIAOYE_STORAGE_KEY,
  XIAOYE_FULL_HEAL_KEY,
} from "./backrooms-level2-xiaoye.js";
import { ROYAL_RATIONS_BUFF_KEY } from "./backrooms-royal-rations.js";
import {
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
} from "./backrooms-night-vision.js";

/** @type {readonly string[]} */
export const BACKROOMS_SESSION_KEYS = [
  SURVIVAL_STORAGE_KEY,
  "backrooms_clip_pass",
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
  "backrooms_night_vision_until",
  "backrooms_backpack_v1",
  "backrooms_l2_doors_v1",
  "backrooms_l2_doors_v2",
  "backrooms_l2_pass",
  "backrooms_l2_yaw",
  "backrooms_l3_pass",
  "backrooms_l4_pass",
  "backrooms_l4_yaw",
  "backrooms_l283_pass",
  "backrooms_l283_almond_v1",
  "backrooms_l283_tables_v1",
  "backrooms_l57_pass",
  "backrooms_l57_yaw",
  "backrooms_l3_maze_seed",
  "backrooms_l3_maze_v2",
  "backrooms_level1_1_chests_v1",
  "backrooms_level1_1_outpost_l4_refreshed",
  "backrooms_level1_1_2_outpost_l4_refreshed",
  "backrooms_level1_1_3_outpost_l11_refreshed",
  "backrooms_meg_points",
  MEG_CHECKPOINT_KEY,
  MEG_DEATH_KEY,
  MEG_RESPAWN_FLAG,
  XIAOYE_STORAGE_KEY,
  "backrooms_l2_xiaoye_triggered",
  XIAOYE_FULL_HEAL_KEY,
  ROYAL_RATIONS_BUFF_KEY,
];

export function clearAllBackroomsSessionKeys() {
  var i;
  for (i = 0; i < BACKROOMS_SESSION_KEYS.length; i++) {
    try {
      sessionStorage.removeItem(BACKROOMS_SESSION_KEYS[i]);
    } catch (err) {
      /* ignore */
    }
  }
}

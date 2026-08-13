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
import {
  ROYAL_RATIONS_BUFF_KEY,
  ROYAL_RATIONS_MEDIUM_KEY,
} from "./backrooms-royal-rations.js";
import {
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
} from "./backrooms-night-vision.js";
import {
  DEATH_COUNT_KEY,
  DEATH_P1_KEY,
  DEATH_P2_KEY,
} from "./backrooms-death-penalty.js";
import { ENTER_BANNER_KEY } from "./backrooms-level-enter.js";

/** @type {readonly string[]} */
export const BACKROOMS_SESSION_KEYS = [
  SURVIVAL_STORAGE_KEY,
  "backrooms_clip_pass",
  "backrooms_clip_yaw",
  "backrooms_l0_pass",
  "backrooms_l0_yaw",
  MEG_NV_POTION_GIVEN_KEY,
  MEG_NV_ALMOND_GIVEN_KEY,
  "backrooms_night_vision_until",
  "backrooms_backpack_v1",
  "backrooms_hotbar_v1",
  "backrooms_hotbar_selected_v1",
  "backrooms_firesalt_autofill_v1",
  "backrooms_l2_doors_v1",
  "backrooms_l2_doors_v2",
  "backrooms_l2_pass",
  "backrooms_l2_yaw",
  "backrooms_l3_pass",
  "backrooms_l4_pass",
  "backrooms_l4_yaw",
  "backrooms_l6_pass",
  "backrooms_l6_yaw",
  "backrooms_l6_1_pass",
  "backrooms_l6_1_yaw",
  "backrooms_l7_pass",
  "backrooms_l7_yaw",
  "backrooms_l283_pass",
  "backrooms_l283_almond_v1",
  "backrooms_l283_tables_v1",
  "backrooms_l57_pass",
  "backrooms_l57_yaw",
  "backrooms_l57_painting_v1",
  "backrooms_l8_pass",
  "backrooms_l8_yaw",
  "backrooms_l8_pipe_v1",
  "backrooms_l8_fire_salt_reward_v1",
  // 旧版 L1 火盐补给员留下的键，仅用于新开局时清理
  "backrooms_l8_visited_v1",
  "backrooms_l9_pass",
  "backrooms_l9_yaw",
  "backrooms_l10_pass",
  "backrooms_l10_yaw",
  "backrooms_l11_pass",
  "backrooms_l11_yaw",
  "backrooms_l13_pass",
  "backrooms_l13_yaw",
  "backrooms_l13_room303_assigned_v1",
  "backrooms_l14_pass",
  "backrooms_l14_yaw",
  "backrooms_l21_pass",
  "backrooms_l21_yaw",
  "backrooms_l37_pass",
  "backrooms_l37_yaw",
  "backrooms_l48_pass",
  "backrooms_l48_yaw",
  "backrooms_l75_pass",
  "backrooms_l75_yaw",
  "backrooms_l119_pass",
  "backrooms_l119_yaw",
  "backrooms_l121_pass",
  "backrooms_l121_yaw",
  "backrooms_blue_channel_pass",
  "backrooms_blue_channel_yaw",
  "backrooms_c144_pass",
  "backrooms_c144_yaw",
  "backrooms_c144_night_done_v1",
  "backrooms_c192_pass",
  "backrooms_c192_yaw",
  "backrooms_c370_pass",
  "backrooms_c370_yaw",
  "backrooms_l3_maze_seed",
  "backrooms_l3_maze_v2",
  "backrooms_level1_1_chests_v1",
  "backrooms_level1_1_outpost_l4_refreshed",
  "backrooms_level1_1_2_outpost_l4_refreshed",
  "backrooms_level1_1_3_outpost_l11_refreshed",
  "backrooms_meg_points",
  "backrooms_meg_firesalt_gift_v1",
  MEG_CHECKPOINT_KEY,
  MEG_DEATH_KEY,
  MEG_RESPAWN_FLAG,
  XIAOYE_STORAGE_KEY,
  "backrooms_l2_xiaoye_triggered",
  XIAOYE_FULL_HEAL_KEY,
  ROYAL_RATIONS_BUFF_KEY,
  ROYAL_RATIONS_MEDIUM_KEY,
  DEATH_COUNT_KEY,
  DEATH_P1_KEY,
  DEATH_P2_KEY,
  ENTER_BANNER_KEY,
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

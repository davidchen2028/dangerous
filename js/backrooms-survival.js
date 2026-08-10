/**
 * 后室 — 核心生存状态（血量 / 理智 / 体力）
 * 背包见 backrooms-inventory.js（4×5，按 B 打开）
 */
import {
  countItem,
  countUsedSlots,
  removeFirstItem,
  addItem,
  resetBackpack,
  mountBackpackPanel,
  BACKPACK_CAPACITY,
} from "./backrooms-inventory.js";
import { clearBackroomsSurvivalPersist } from "./backrooms-survival-persist.js";

/** 兼容旧引用 — 后室不再使用主游戏 playerInventory 数组 */
export const playerInventory = [];

/** 杏仁水：+15 血量、+25 理智（上限 100） */
export const ALMOND_WATER_HP = 15;
export const ALMOND_WATER_SANITY = 25;

/** 被动理智流失：每 10 秒 -1 */
const SANITY_PASSIVE_DRAIN_PER_SEC = 1 / 10;

export function getInventoryMax() {
  return BACKPACK_CAPACITY;
}

export function resetBackroomsRun() {
  playerInventory.length = 0;
  resetBackpack();
  try {
    sessionStorage.removeItem("backrooms_clip_pass");
    sessionStorage.removeItem("backrooms_meg_nv_potion_given");
    sessionStorage.removeItem("backrooms_night_vision_until");
    sessionStorage.removeItem("backrooms_backpack_v1");
    sessionStorage.removeItem("backrooms_l2_doors_v1");
    sessionStorage.removeItem("backrooms_l2_doors_v2");
    sessionStorage.removeItem("backrooms_l3_pass");
    sessionStorage.removeItem("backrooms_l283_pass");
    sessionStorage.removeItem("backrooms_l3_maze_seed");
    sessionStorage.removeItem("backrooms_l3_maze_v2");
    clearBackroomsSurvivalPersist();
  } catch (err) {
    /* ignore */
  }
}

/**
 * 各 Level 统一：杏仁水 / 药水仅背包双击，无 R 快捷键
 * @param {BackroomsSurvival | null} survival
 * @param {{ onAlmondWaterUsed?: () => void, onNightVisionPotion?: () => void }} [options]
 */
export function registerBackroomsInventoryUseHandlers(survival, options) {
  options = options || {};
  window.__backroomsUseAlmondWater = function () {
    if (!survival || !survival.useAlmondWater()) return;
    if (options.onAlmondWaterUsed) options.onAlmondWaterUsed();
  };
  if (options.onNightVisionPotion) {
    window.__backroomsUseNightVisionPotion = options.onNightVisionPotion;
  }
}

export class BackroomsSurvival {
  constructor(options) {
    options = options || {};
    this.hp = 100;
    this.sanity = 100;
    this.stamina = 100;
    this.dead = false;
    this.sanityBreaking = false;
    this.onDeath = options.onDeath || null;
    this.onRespawn = options.onRespawn || null;
    this.rootEl = null;
    this.deathEl = null;
    this._fillHp = null;
    this._fillSanity = null;
    this._fillStamina = null;
    this._valHp = null;
    this._valSanity = null;
    this._valStamina = null;
    this._invEl = null;
    this._deathTimer = null;
  }

  mountHud(parent) {
    if (this.rootEl) return this.rootEl;
    var host = parent || document.body;
    mountBackpackPanel(host);

    var root = document.createElement("div");
    root.id = "backroomsSurvivalHud";
    root.className = "br-survival";
    root.innerHTML =
      '<div class="br-survival__row">' +
      '<p class="br-survival__label">血量 <span class="br-survival__value" data-stat="hp">100</span></p>' +
      '<div class="br-survival__track"><div class="br-survival__fill br-survival__fill--hp" data-bar="hp"></div></div>' +
      "</div>" +
      '<div class="br-survival__row">' +
      '<p class="br-survival__label">理智 <span class="br-survival__value" data-stat="sanity">100</span></p>' +
      '<div class="br-survival__track"><div class="br-survival__fill br-survival__fill--sanity" data-bar="sanity"></div></div>' +
      "</div>" +
      '<div class="br-survival__row br-survival__row--stamina">' +
      '<p class="br-survival__label">体力 <span class="br-survival__value" data-stat="stamina">100</span></p>' +
      '<div class="br-survival__track br-survival__track--stamina"><div class="br-survival__fill br-survival__fill--stamina" data-bar="stamina"></div></div>' +
      "</div>" +
      '<p class="br-survival__inv">背包 <strong data-stat="inv">0/' +
      BACKPACK_CAPACITY +
      "</strong> · <kbd>B</kbd> 打开</p>";

    var death = document.createElement("div");
    death.className = "br-survival__death";
    death.innerHTML =
      '<p class="br-survival__death-inner" data-death-msg>你已死亡</p>';

    host.appendChild(root);
    host.appendChild(death);

    this.rootEl = root;
    this.deathEl = death;
    this._fillHp = root.querySelector('[data-bar="hp"]');
    this._fillSanity = root.querySelector('[data-bar="sanity"]');
    this._fillStamina = root.querySelector('[data-bar="stamina"]');
    this._valHp = root.querySelector('[data-stat="hp"]');
    this._valSanity = root.querySelector('[data-stat="sanity"]');
    this._valStamina = root.querySelector('[data-stat="stamina"]');
    this._invEl = root.querySelector('[data-stat="inv"]');
    this.refreshHud();
    return root;
  }

  refreshHud() {
    if (!this.rootEl) return;
    var hpPct = Math.max(0, Math.min(100, this.hp));
    var sanPct = Math.max(0, Math.min(100, this.sanity));
    var staPct = Math.max(0, Math.min(100, this.stamina));

    if (this._fillHp) this._fillHp.style.width = hpPct + "%";
    if (this._fillSanity) this._fillSanity.style.width = sanPct + "%";
    if (this._fillStamina) this._fillStamina.style.width = staPct + "%";
    if (this._valHp) this._valHp.textContent = String(Math.round(hpPct));
    if (this._valSanity) this._valSanity.textContent = String(Math.round(sanPct));
    if (this._valStamina) this._valStamina.textContent = String(Math.round(staPct));
    if (this._invEl) {
      this._invEl.textContent =
        countUsedSlots() + "/" + BACKPACK_CAPACITY;
    }
  }

  update(dt, env) {
    if (this.dead) return;
    env = env || {};

    if (env.sprinting && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 15 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 10 * dt);
    }

    this.sanity = Math.max(0, this.sanity - SANITY_PASSIVE_DRAIN_PER_SEC * dt);

    if (this.sanity <= 0 && !this.sanityBreaking) {
      this.triggerSanityBreak();
    }

    if (this.hp <= 0 && !this.dead) {
      this.triggerDeath("hp");
    }

    this.refreshHud();
  }

  canSprint() {
    return !this.dead && this.stamina > 0;
  }

  getSprintSpeedMul(baseSpeed, sprinting, moving) {
    if (!moving || !sprinting || !this.canSprint()) return 1;
    return 1.65;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - (amount || 0));
    this.refreshHud();
  }

  useAlmondWater() {
    if (this.dead) return false;
    if (!removeFirstItem("almond_water")) return false;
    this.sanity = Math.min(100, this.sanity + ALMOND_WATER_SANITY);
    this.hp = Math.min(100, this.hp + ALMOND_WATER_HP);
    this.refreshHud();
    return true;
  }

  addItem(item) {
    var ok = addItem(item);
    if (ok) this.refreshHud();
    return ok;
  }

  addAlmondWater(count) {
    var i;
    var added = 0;
    for (i = 0; i < count; i++) {
      if (!addItem({ id: "almond_water", name: "杏仁水" })) break;
      added++;
    }
    if (added > 0) this.refreshHud();
    return added;
  }

  resetStats() {
    this.hp = 100;
    this.sanity = 100;
    this.stamina = 100;
    this.dead = false;
    this.sanityBreaking = false;
    if (this._deathTimer) {
      clearTimeout(this._deathTimer);
      this._deathTimer = null;
    }
    document.body.classList.remove("backrooms-sanity-break", "backrooms-dead");
    if (this.deathEl) this.deathEl.classList.remove("br-survival__death--show");
    this.refreshHud();
  }

  triggerSanityBreak() {
    this.sanityBreaking = true;
    this.sanity = 0;
    document.body.classList.add("backrooms-sanity-break");
    var self = this;
    this._deathTimer = setTimeout(function () {
      self.triggerDeath("sanity");
    }, 450);
  }

  triggerDeath(reason) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    document.body.classList.add("backrooms-dead");
    if (this.deathEl) {
      var msg = this.deathEl.querySelector("[data-death-msg]");
      if (msg) {
        msg.textContent =
          reason === "sanity"
            ? "精神崩溃 — 意识消散…"
            : "你已死亡 — 正在重置…";
      }
      this.deathEl.classList.add("br-survival__death--show");
    }
    this.refreshHud();
    var self = this;
    this._deathTimer = setTimeout(function () {
      self.respawn(reason);
    }, 1400);
  }

  respawn(reason) {
    this.resetStats();
    if (this.onRespawn) this.onRespawn(reason);
    if (this.onDeath) this.onDeath(reason);
  }
}

if (typeof window !== "undefined") {
  window.BackroomsSurvival = {
    resetBackroomsRun: resetBackroomsRun,
    registerBackroomsInventoryUseHandlers: registerBackroomsInventoryUseHandlers,
    getInventoryMax: getInventoryMax,
    BackroomsSurvival: BackroomsSurvival,
  };
}

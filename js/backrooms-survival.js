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
import { clearAllBackroomsSessionKeys } from "./backrooms-session-keys.js";
import {
  clearRoyalRationsBuff,
  getHpMax,
  getStaminaMax,
  getRoyalSprintMul,
  syncRoyalRationsExpiry,
  activateRoyalRationsBuff,
  activateRoyalRationsMediumBuff,
} from "./backrooms-royal-rations.js";
import {
  getSanityMax,
  getSanityDrainMul,
  offerDeathPenaltyChoice,
  updateDeathHallucinations,
  clearDeathPenalties,
} from "./backrooms-death-penalty.js";

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
    clearAllBackroomsSessionKeys();
    clearBackroomsSurvivalPersist();
    clearRoyalRationsBuff();
    clearDeathPenalties();
  } catch (err) {
    /* ignore */
  }
}

/**
 * 各 Level 统一：杏仁水 / 药水可通过背包双击或快捷栏 R 使用
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
  window.__backroomsUseRoyalRations = function () {
    if (!survival || !survival.useRoyalRations()) return;
    if (options.onRoyalRationsUsed) options.onRoyalRationsUsed();
  };
  window.__backroomsUseRoyalRationsMedium = function () {
    if (!survival || !survival.useRoyalRationsMedium()) return;
    if (options.onRoyalRationsUsed) options.onRoyalRationsUsed();
  };
}

export class BackroomsSurvival {
  constructor(options) {
    options = options || {};
    this.hp = 100;
    this.sanity = 100;
    this.stamina = 100;
    this.dead = false;
    this.sanityBreaking = false;
    /** @type {{ hp?: number, sanity?: number, stamina?: number } | null} */
    this._deathSnapshot = null;
    this.onPrepareDeath = options.onPrepareDeath || null;
    this.onDeath = options.onDeath || null;
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
    var hpMax = getHpMax();
    var staMax = getStaminaMax();
    var sanMax = getSanityMax();
    var hpPct = hpMax > 0 ? Math.max(0, Math.min(100, (this.hp / hpMax) * 100)) : 0;
    var sanPct = sanMax > 0 ? Math.max(0, Math.min(100, (this.sanity / sanMax) * 100)) : 0;
    var staPct = staMax > 0 ? Math.max(0, Math.min(100, (this.stamina / staMax) * 100)) : 0;

    if (this._fillHp) this._fillHp.style.width = hpPct + "%";
    if (this._fillSanity) this._fillSanity.style.width = sanPct + "%";
    if (this._fillStamina) this._fillStamina.style.width = staPct + "%";
    if (this._valHp) {
      this._valHp.textContent = String(Math.round(this.hp)) + "/" + String(hpMax);
    }
    if (this._valSanity) {
      this._valSanity.textContent =
        String(Math.round(this.sanity)) + "/" + String(sanMax);
    }
    if (this._valStamina) {
      this._valStamina.textContent =
        String(Math.round(this.stamina)) + "/" + String(staMax);
    }
    if (this._invEl) {
      this._invEl.textContent =
        countUsedSlots() + "/" + BACKPACK_CAPACITY;
    }
  }

  update(dt, env) {
    if (this.dead) return;
    env = env || {};
    var now = performance.now();
    syncRoyalRationsExpiry(this);
    var hpCap = getHpMax();
    var staCap = getStaminaMax();

    if (env.sprinting && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 15 * dt);
    } else {
      this.stamina = Math.min(staCap, this.stamina + 10 * dt);
    }

    if (!env.skipPassiveSanity) {
      this.sanity = Math.max(
        0,
        this.sanity - SANITY_PASSIVE_DRAIN_PER_SEC * getSanityDrainMul() * dt
      );
    }
    if ((env.sanityDrainPerSec || 0) > 0) {
      this.sanity = Math.max(
        0,
        this.sanity - env.sanityDrainPerSec * getSanityDrainMul() * dt
      );
    }
    this.hp = Math.min(hpCap, this.hp);
    this.stamina = Math.min(staCap, this.stamina);
    this.sanity = Math.min(getSanityMax(), this.sanity);

    if (this.sanity <= 0 && !this.sanityBreaking) {
      this.triggerSanityBreak();
    }

    if (this.hp <= 0 && !this.dead) {
      this.triggerDeath("hp");
    }

    updateDeathHallucinations(this, dt);
    this.refreshHud();
  }

  canSprint() {
    return !this.dead && this.stamina > 0;
  }

  getSprintSpeedMul(baseSpeed, sprinting, moving) {
    if (!moving || !sprinting || !this.canSprint()) return 1;
    return getRoyalSprintMul();
  }

  takeDamage(amount) {
    if (this.dead) return;
    var dmg = amount || 0;
    var was = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    if (was > 0 && this.hp <= 0) {
      this._deathSnapshot = {
        hp: Math.max(1, was - dmg),
        sanity: this.sanity,
        stamina: this.stamina,
      };
    }
    this.refreshHud();
  }

  useAlmondWater() {
    if (this.dead) return false;
    if (!removeFirstItem("almond_water")) return false;
    var hpCap = getHpMax();
    var sanCap = getSanityMax();
    this.sanity = Math.min(sanCap, this.sanity + ALMOND_WATER_SANITY);
    this.hp = Math.min(hpCap, this.hp + ALMOND_WATER_HP);
    this.refreshHud();
    return true;
  }

  useRoyalRations() {
    if (this.dead) return false;
    if (!removeFirstItem("royal_rations")) return false;
    if (!activateRoyalRationsBuff()) return false;
    this.hp = getHpMax();
    this.stamina = getStaminaMax();
    this.refreshHud();
    return true;
  }

  /** 中等大小皇家口粮：从背包消耗一份后生效 */
  useRoyalRationsMedium() {
    if (this.dead) return false;
    if (!removeFirstItem("royal_rations_medium")) return false;
    if (!activateRoyalRationsMediumBuff()) return false;
    this.hp = getHpMax();
    this.stamina = getStaminaMax();
    this.refreshHud();
    return true;
  }

  /** 中等皇家口粮：直接生效（血量上限 400、体力上限 300、奔跑 2 倍） */
  activateMediumRoyalRations() {
    if (this.dead) return false;
    if (!activateRoyalRationsMediumBuff()) return false;
    this.hp = getHpMax();
    this.stamina = getStaminaMax();
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
    this.hp = getHpMax();
    this.sanity = getSanityMax();
    this.stamina = getStaminaMax();
    clearRoyalRationsBuff();
    this.dead = false;
    this.sanityBreaking = false;
    this._deathSnapshot = null;
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
    this._deathSnapshot = {
      hp: this.hp,
      sanity: Math.max(1, this.sanity),
      stamina: this.stamina,
    };
    this.sanity = 0;
    document.body.classList.add("backrooms-sanity-break");
    var self = this;
    this._deathTimer = setTimeout(function () {
      self.triggerDeath("sanity");
    }, 450);
  }

  triggerDeath(reason) {
    if (this.dead) return;
    if (this.onPrepareDeath) {
      this.onPrepareDeath(reason);
    }
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
    if (this._deathTimer) {
      clearTimeout(this._deathTimer);
      this._deathTimer = null;
    }
    // 等死亡遮罩出现后弹出负面选择
    this._deathTimer = setTimeout(function () {
      offerDeathPenaltyChoice(self, reason, function (outcome) {
        if (outcome === "wipe") {
          resetBackroomsRun();
          window.location.replace("backrooms-level0.html");
          return;
        }
        self.respawn(reason);
      });
    }, 700);
  }

  respawn(reason) {
    if (this.onDeath) {
      this.onDeath(reason);
      return;
    }
    resetBackroomsRun();
    window.location.replace("backrooms-level0.html");
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

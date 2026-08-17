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
import {
  clearBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
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
  clearSoyMilkBuffs,
  syncSoyMilkExpiry,
  activateStrawberrySoyMilkBuff,
  activateStrawberryLuckySoyMilkBuff,
  STRAWBERRY_SOY_MILK_SANITY_MUL,
  BANANA_SOY_MILK_HEAL,
  LUCKY_SOY_MILK_COLD_ID,
  LUCKY_SOY_MILK_HOT_ID,
  LUCKY_SOY_MILK_COLD_LUCK,
  LUCKY_SOY_MILK_HOT_LUCK,
} from "./backrooms-soy-milk.js";
import {
  applyLuckySoyMilkLuck,
  clearLuck,
  getLuck,
  LUCKY_VAULT_SOY_MILK_DURATION_MS,
  syncLuckExpiry,
} from "./backrooms-luck.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";
import { queueEnterLevelNumber } from "./backrooms-level-enter.js";
import { playBackroomsRoulette } from "./backrooms-roulette.js";
import {
  getSanityMax,
  getSanityDrainMul,
  offerDeathPenaltyChoice,
  updateDeathHallucinations,
  clearDeathPenalties,
} from "./backrooms-death-penalty.js";
import {
  noteCriticalVitals,
  noteSoyMilkDrunk,
  noteLuckySoyMilkOutcome,
  noteFastingBroken,
  checkTaskDeadlines,
} from "./backrooms-tasks.js";

/** 兼容旧引用 — 后室不再使用主游戏 playerInventory 数组 */
export const playerInventory = [];

/** 杏仁水：+15 血量、+25 理智（上限 100） */
export const ALMOND_WATER_HP = 15;
export const ALMOND_WATER_SANITY = 25;

/** 被动理智流失：每 10 秒 -1 */
const SANITY_PASSIVE_DRAIN_PER_SEC = 1 / 10;
let badLuckTransitionPending = false;

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
    clearSoyMilkBuffs();
    clearLuck();
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
    noteFastingBroken();
    if (options.onAlmondWaterUsed) options.onAlmondWaterUsed();
  };
  window.__backroomsUseStrawberrySoyMilk = function () {
    if (!survival || !survival.useStrawberrySoyMilk()) return;
    noteFastingBroken();
    if (options.onStrawberrySoyMilkUsed) options.onStrawberrySoyMilkUsed();
  };
  window.__backroomsUseBananaSoyMilk = function () {
    if (!survival || !survival.useBananaSoyMilk()) return;
    noteFastingBroken();
    if (options.onBananaSoyMilkUsed) options.onBananaSoyMilkUsed();
  };
  window.__backroomsUseLuckySoyMilk = function (itemId) {
    if (!survival || !survival.useLuckySoyMilk(itemId)) return;
    noteFastingBroken();
    if (options.onLuckySoyMilkUsed) options.onLuckySoyMilkUsed(itemId);
  };
  window.__backroomsUseVaultSoyMilk = function (itemId) {
    if (!survival || !survival.useVaultSoyMilk(itemId)) return;
    noteFastingBroken();
    if (options.onVaultSoyMilkUsed) options.onVaultSoyMilkUsed(itemId);
  };
  window.__backroomsOnLuckySoyMilkHeated = function () {
    if (options.onLuckySoyMilkHeated) options.onLuckySoyMilkHeated();
  };
  if (options.onNightVisionPotion) {
    window.__backroomsUseNightVisionPotion = options.onNightVisionPotion;
  }
  window.__backroomsUseRoyalRations = function () {
    if (!survival || !survival.useRoyalRations()) return;
    noteFastingBroken();
    if (options.onRoyalRationsUsed) options.onRoyalRationsUsed();
  };
  window.__backroomsUseRoyalRationsMedium = function () {
    if (!survival || !survival.useRoyalRationsMedium()) return;
    noteFastingBroken();
    if (options.onRoyalRationsUsed) options.onRoyalRationsUsed();
  };
  window.__backroomsUseRoulette = function () {
    if (!survival || survival.dead) return;
    playBackroomsRoulette(survival, function () {
      removeFirstItem("roulette");
      survival.refreshHud();
    });
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
    this.onInterceptDeath = options.onInterceptDeath || null;
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
    this._nextBadLuckEventAt = 0;
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
    var soyExpired = syncSoyMilkExpiry(this);
    if (soyExpired) {
      this.hp = Math.min(getHpMax(), this.hp);
      this.sanity = Math.min(getSanityMax(), this.sanity);
      this.refreshHud();
      if (soyExpired === "strawberry_lucky") {
        showBackroomsLootToast("草莓带来的精神增益缓缓褪去", {
          durationMs: 3000,
        });
      }
    }
    if (syncLuckExpiry()) {
      showBackroomsLootToast(
        "豆奶带来的奇异感觉缓缓消散，周遭回归平常",
        { durationMs: 3200 }
      );
    }
    var hpCap = getHpMax();
    var staCap = getStaminaMax();

    if (env.sprinting && this.stamina > 0) {
      this.stamina = Math.max(0, this.stamina - 15 * dt);
    } else {
      this.stamina = Math.min(staCap, this.stamina + 10 * dt);
    }

    var luck = getLuck();
    this.updateBadLuckEvents(now, luck);
    var luckSanityMul = luck <= -30 ? 1.6 : luck >= 30 ? 0.7 : 1;
    if (!env.skipPassiveSanity) {
      this.sanity = Math.max(
        0,
        this.sanity -
          SANITY_PASSIVE_DRAIN_PER_SEC *
            getSanityDrainMul() *
            luckSanityMul *
            dt
      );
    }
    if ((env.sanityDrainPerSec || 0) > 0) {
      this.sanity = Math.max(
        0,
        this.sanity -
          env.sanityDrainPerSec * getSanityDrainMul() * luckSanityMul * dt
      );
    }
    this.hp = Math.min(hpCap, this.hp);
    this.stamina = Math.min(staCap, this.stamina);
    this.sanity = Math.min(getSanityMax(), this.sanity);

    if (!this.dead) {
      noteCriticalVitals(this.hp, this.sanity);
      // 限时任务超时结算（内部按秒节流）
      checkTaskDeadlines();
    }

    if (this.sanity <= 0 && !this.sanityBreaking) {
      this.triggerSanityBreak();
    }

    if (this.hp <= 0 && !this.dead) {
      this.triggerDeath("hp");
    }

    updateDeathHallucinations(this, dt);
    this.refreshHud();
  }

  updateBadLuckEvents(now, luck) {
    if (luck > -30) {
      this._nextBadLuckEventAt = 0;
      return;
    }
    if (!this._nextBadLuckEventAt) {
      this._nextBadLuckEventAt = now + 35000 + Math.random() * 30000;
      return;
    }
    if (now < this._nextBadLuckEventAt) return;
    this._nextBadLuckEventAt = now + 40000 + Math.random() * 45000;

    var roll = Math.random();
    if (roll < 0.42) {
      var consumables = ["almond_water", "royal_rations", "fire_salt"];
      var available = consumables.filter(function (id) {
        return countItem(id) > 0;
      });
      if (!available.length) return;
      var lost = available[Math.floor(Math.random() * available.length)];
      if (!removeFirstItem(lost)) return;
      var lostName =
        lost === "almond_water"
          ? "杏仁水"
          : lost === "royal_rations"
            ? "最小有效分量皇家口粮"
            : "小块可爆炸火盐";
      showBackroomsLootToast("一阵错位后，背包里的" + lostName + "消失了一份", {
        durationMs: 3200,
      });
      return;
    }
    if (roll < 0.67 && countItem("fire_salt") > 0) {
      removeFirstItem("fire_salt");
      this.takeDamage(30);
      showBackroomsLootToast("携带的火盐突然自爆并损毁 · -30 血量", {
        durationMs: 3200,
      });
      return;
    }
    document.body.classList.add("backrooms-luck-glitch");
    window.setTimeout(function () {
      document.body.classList.remove("backrooms-luck-glitch");
    }, 900);
    showBackroomsLootToast("空间短暂抖动，你的脚步发生了错位", {
      durationMs: 2600,
    });
    if (!badLuckTransitionPending && Math.random() < 0.12) {
      badLuckTransitionPending = true;
      var destinations = [
        {
          number: 0,
          passKey: "backrooms_l0_pass",
          page: "backrooms-level0.html",
        },
        {
          number: 1,
          passKey: "backrooms_clip_pass",
          page: "backrooms-level1.html",
        },
        {
          number: 2,
          passKey: "backrooms_l2_pass",
          page: "backrooms-level2.html",
        },
        {
          number: 3,
          passKey: "backrooms_l3_pass",
          page: "backrooms-level3.html",
        },
      ];
      var destination =
        destinations[Math.floor(Math.random() * destinations.length)];
      showBackroomsLootToast(
        "空间正在把你甩向 Level " + destination.number + "…",
        { durationMs: 1400 }
      );
      saveBackroomsSurvival(this);
      try {
        sessionStorage.setItem(destination.passKey, "1");
      } catch (err) {
        /* ignore */
      }
      queueEnterLevelNumber(destination.number);
      window.setTimeout(function () {
        window.location.href = destination.page;
      }, 800);
    }
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

  useStrawberrySoyMilk() {
    if (this.dead) return false;
    if (countItem("strawberry_soy_milk") < 1) return false;
    if (!activateStrawberrySoyMilkBuff()) return false;
    if (!removeFirstItem("strawberry_soy_milk")) return false;
    var sanCap = getSanityMax();
    var restore = Math.max(
      1,
      Math.round(sanCap * (STRAWBERRY_SOY_MILK_SANITY_MUL - 1))
    );
    this.sanity = Math.min(sanCap, this.sanity + restore);
    this.refreshHud();
    noteSoyMilkDrunk("strawberry");
    return true;
  }

  useBananaSoyMilk() {
    if (this.dead) return false;
    if (!removeFirstItem("banana_soy_milk")) return false;
    var hpCap = getHpMax();
    this.hp = Math.min(hpCap, this.hp + BANANA_SOY_MILK_HEAL);
    this.refreshHud();
    noteSoyMilkDrunk("banana");
    return true;
  }

  /**
   * @param {string} [itemId]
   */
  useLuckySoyMilk(itemId) {
    if (this.dead) return false;
    var id = itemId || LUCKY_SOY_MILK_COLD_ID;
    if (id !== LUCKY_SOY_MILK_COLD_ID && id !== LUCKY_SOY_MILK_HOT_ID) {
      return false;
    }
    if (countItem(id) < 1) return false;
    var delta =
      id === LUCKY_SOY_MILK_HOT_ID
        ? LUCKY_SOY_MILK_HOT_LUCK
        : LUCKY_SOY_MILK_COLD_LUCK;
    if (!applyLuckySoyMilkLuck(delta)) return false;
    if (!removeFirstItem(id)) return false;
    this.refreshHud();
    noteSoyMilkDrunk("lucky");
    noteLuckySoyMilkOutcome(delta >= 0 ? "lucky" : "unlucky");
    return true;
  }

  useVaultSoyMilk(itemId) {
    if (this.dead) return false;
    if (
      itemId !== "lucky_soy_milk" &&
      itemId !== "strawberry_lucky_soy_milk" &&
      itemId !== "banana_lucky_soy_milk"
    ) {
      return false;
    }
    if (countItem(itemId) < 1) return false;

    if (itemId === "banana_lucky_soy_milk") {
      if (!removeFirstItem(itemId)) return false;
      this.hp = Math.min(getHpMax(), this.hp + BANANA_SOY_MILK_HEAL);
      showBackroomsLootToast(
        "香蕉温润的力量抚平了你身上一部分伤痛",
        { durationMs: 3000 }
      );
      noteSoyMilkDrunk("banana");
    } else if (itemId === "strawberry_lucky_soy_milk") {
      if (!activateStrawberryLuckySoyMilkBuff()) return false;
      if (!removeFirstItem(itemId)) return false;
      // 只提高上限，不改变当前理智。
      showBackroomsLootToast(
        "草莓香甜漫开，你的精神承受能力短暂变强",
        { durationMs: 3000 }
      );
      noteSoyMilkDrunk("strawberry");
    } else {
      if (!removeFirstItem(itemId)) return false;
      noteSoyMilkDrunk("lucky");
      var roll = Math.random();
      if (roll < 0.45) {
        applyLuckySoyMilkLuck(100, LUCKY_VAULT_SOY_MILK_DURATION_MS);
        showBackroomsLootToast(
          "喝下豆奶，心里莫名感觉安稳，周遭似乎变得顺遂起来",
          { durationMs: 3600 }
        );
        noteLuckySoyMilkOutcome("lucky");
      } else if (roll < 0.9) {
        applyLuckySoyMilkLuck(-100, LUCKY_VAULT_SOY_MILK_DURATION_MS);
        showBackroomsLootToast(
          "喝下豆奶，一阵不安涌上心头，预感坏事将要发生",
          { durationMs: 3600 }
        );
        noteLuckySoyMilkOutcome("unlucky");
      } else {
        clearLuck();
        showBackroomsLootToast(
          "豆奶下肚，身体没有产生任何奇异感受",
          { durationMs: 3000 }
        );
        noteLuckySoyMilkOutcome("none");
      }
    }
    this.refreshHud();
    return true;
  }

  useRoyalRations() {
    if (this.dead) return false;
    if (countItem("royal_rations") < 1) return false;
    if (!activateRoyalRationsBuff()) return false;
    if (!removeFirstItem("royal_rations")) return false;
    this.hp = getHpMax();
    this.stamina = getStaminaMax();
    this.refreshHud();
    return true;
  }

  /** 中等大小皇家口粮：先激活 buff，成功后再从背包消耗 */
  useRoyalRationsMedium() {
    if (this.dead) return false;
    if (countItem("royal_rations_medium") < 1) return false;
    if (!activateRoyalRationsMediumBuff()) return false;
    if (!removeFirstItem("royal_rations_medium")) return false;
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
    clearSoyMilkBuffs();
    clearLuck();
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
    // 死亡拦截：返回 true 表示本次「不真正死亡」（如被带往 C-1289），中止死亡流程。
    if (this.onInterceptDeath && this.onInterceptDeath(reason)) {
      return;
    }
    if (this.onPrepareDeath) {
      this.onPrepareDeath(reason);
    }
    this.dead = true;
    this.hp = 0;
    document.body.classList.add("backrooms-dead");
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
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

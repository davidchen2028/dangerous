/**
 * M.E.G 基地存档点：进入基地保存位置；在基地或已存档后于 L1/L2/L3 等死亡 → 在基地复活
 * 复活：清空背包 · 血量/理智/体力回满 · 清除皇家口粮与夜视药水效果
 */
import {
  backpackSlots,
  BACKPACK_CAPACITY,
  renderGridPublic,
  resetBackpack,
} from "./backrooms-inventory.js";
import { consumeXiaoyeFullHealFlag } from "./backrooms-level2-xiaoye.js";
import {
  clearRoyalRationsBuff,
  HP_MAX_DEFAULT,
  STAMINA_MAX_DEFAULT,
} from "./backrooms-royal-rations.js";
import { clearNightVision } from "./backrooms-night-vision.js";
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { resetBackroomsRun } from "./backrooms-survival.js";
import { refreshLevelPass, grantLevelPass } from "./backrooms-level-pass.js";

export const MEG_CHECKPOINT_KEY = "backrooms_meg_checkpoint_v1";
export const MEG_DEATH_KEY = "backrooms_meg_death_v1";
export const MEG_RESPAWN_FLAG = "backrooms_meg_respawn";
/** M.E.G 基地所在关卡页面（由 checkpoint 模块持有，survival 不感知关卡） */
export const MEG_HUB_PAGE = "backrooms-level1.html";
export const LEVEL0_PAGE = "backrooms-level0.html";

/** @type {WeakMap<object, { el: HTMLElement, hideTimer: ReturnType<typeof setTimeout> | null }>} */
const megSaveUiBySurvival = new WeakMap();

function getMegSaveUi(survival) {
  if (!survival) return null;
  return megSaveUiBySurvival.get(survival) || null;
}

export function resetMegSaveStatus(survival) {
  if (!survival) return;
  var ui = megSaveUiBySurvival.get(survival);
  if (!ui) return;
  if (ui.hideTimer) {
    clearTimeout(ui.hideTimer);
    ui.hideTimer = null;
  }
  if (ui.el && ui.el.parentNode) ui.el.parentNode.removeChild(ui.el);
  megSaveUiBySurvival.delete(survival);
}

export function mountMegSaveStatus(survival) {
  if (!survival || !survival.rootEl) return;
  var ui = getMegSaveUi(survival);
  if (ui && ui.el && ui.el.isConnected && survival.rootEl.contains(ui.el)) return;

  resetMegSaveStatus(survival);

  var el = document.createElement("p");
  el.className = "br-survival__save";
  el.id = "backroomsMegSave";
  el.hidden = true;
  el.textContent = "正在保存…";
  survival.rootEl.appendChild(el);
  megSaveUiBySurvival.set(survival, { el: el, hideTimer: null });
}

export function flashMegSaving(survival) {
  var ui = getMegSaveUi(survival);
  if (!ui || !ui.el) return;
  ui.el.hidden = false;
  if (ui.hideTimer) clearTimeout(ui.hideTimer);
  ui.hideTimer = setTimeout(function () {
    if (ui.el) ui.el.hidden = true;
    ui.hideTimer = null;
  }, 2200);
}

function persistBackpackFromSlots() {
  try {
    sessionStorage.setItem("backrooms_backpack_v1", JSON.stringify(backpackSlots));
  } catch (err) {
    /* ignore */
  }
}

export function snapshotBackpackSlots() {
  var i;
  var out = new Array(BACKPACK_CAPACITY);
  for (i = 0; i < BACKPACK_CAPACITY; i++) {
    var s = backpackSlots[i];
    if (!s) {
      out[i] = null;
    } else {
      out[i] = { id: s.id, name: s.name || s.id };
    }
  }
  return out;
}

export function restoreBackpackSnapshot(slots) {
  if (!Array.isArray(slots) || slots.length !== BACKPACK_CAPACITY) return;
  var i;
  for (i = 0; i < BACKPACK_CAPACITY; i++) {
    var slot = slots[i];
    if (slot == null) {
      backpackSlots[i] = null;
    } else if (slot && typeof slot.id === "string") {
      backpackSlots[i] = { id: slot.id, name: slot.name || slot.id };
    } else {
      backpackSlots[i] = null;
    }
  }
  persistBackpackFromSlots();
  if (typeof renderGridPublic === "function") renderGridPublic();
}

export function hasMegBaseCheckpoint() {
  try {
    return !!sessionStorage.getItem(MEG_CHECKPOINT_KEY);
  } catch (err) {
    return false;
  }
}

export function getMegSpawnFromCheckpoint() {
  try {
    var raw = sessionStorage.getItem(MEG_CHECKPOINT_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    return data && data.spawn ? data.spawn : null;
  } catch (err2) {
    return null;
  }
}

export function defaultMegBaseSpawn(center) {
  if (!center) return { x: 0, z: 0, yaw: -Math.PI * 0.5 };
  return {
    x: center.x - 9,
    z: center.z,
    yaw: -Math.PI * 0.5,
  };
}

export function saveMegBaseCheckpoint(spawn) {
  if (!spawn || !Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) return;
  try {
    sessionStorage.setItem(
      MEG_CHECKPOINT_KEY,
      JSON.stringify({
        spawn: {
          x: spawn.x,
          z: spawn.z,
          yaw: Number.isFinite(spawn.yaw) ? spawn.yaw : -Math.PI * 0.5,
        },
        savedAt: Date.now(),
      })
    );
  } catch (err) {
    /* ignore */
  }
}

function captureMegDeathPayload(_survival, _reason) {
  consumeXiaoyeFullHealFlag();
  try {
    sessionStorage.setItem(MEG_DEATH_KEY, JSON.stringify({ v: 2, at: Date.now() }));
  } catch (err) {
    /* ignore */
  }
}

export function applyMegDeathState(survival) {
  if (!survival) return false;
  try {
    var raw = sessionStorage.getItem(MEG_DEATH_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(MEG_DEATH_KEY);

    clearRoyalRationsBuff();
    clearNightVision();
    resetBackpack();

    survival.hp = HP_MAX_DEFAULT;
    survival.sanity = 100;
    survival.stamina = STAMINA_MAX_DEFAULT;
    survival.dead = false;
    survival.sanityBreaking = false;
    if (survival._deathTimer) {
      clearTimeout(survival._deathTimer);
      survival._deathTimer = null;
    }
    document.body.classList.remove("backrooms-sanity-break", "backrooms-dead");
    if (survival.deathEl) survival.deathEl.classList.remove("br-survival__death--show");
    survival.refreshHud();
    saveBackroomsSurvival(survival);
    return true;
  } catch (err2) {
    return false;
  }
}

export function clearMegCheckpointStorage() {
  try {
    sessionStorage.removeItem(MEG_CHECKPOINT_KEY);
    sessionStorage.removeItem(MEG_DEATH_KEY);
    sessionStorage.removeItem(MEG_RESPAWN_FLAG);
  } catch (err) {
    /* ignore */
  }
}

function setMegDeathOverlayMessage(survival, reason, text) {
  if (!survival || !survival.deathEl) return;
  var msg = survival.deathEl.querySelector("[data-death-msg]");
  if (msg) msg.textContent = text;
}

/**
 * 注入 M.E.G 死亡/重生策略：survival 只负责判定死亡并回调，具体跳转由本模块 closure 决定。
 * @param {import('./backrooms-survival.js').BackroomsSurvival} survival
 * @param {() => { level: number, isInMegBase?: () => boolean, getMegSpawn?: () => { x: number, z: number, yaw?: number } | null }} getCtx
 * @param {{ onMegRespawn?: (reason: string) => void, refreshLevelPass?: import('./backrooms-level-pass.js').BackroomsLevelPassId, getLevelPassYaw?: () => number, megHubPage?: string, level0Page?: string }} [options]
 */
export function installMegCheckpointDeathHooks(survival, getCtx, options) {
  if (!survival) return;
  options = options || {};
  var megHubPage = options.megHubPage || MEG_HUB_PAGE;
  var level0Page = options.level0Page || LEVEL0_PAGE;
  /** @type {"l0_reset" | "meg_hub_redirect" | "meg_local" | null} */
  var deathPlan = null;

  survival.onPrepareDeath = function (reason) {
    var ctx = getCtx() || {};
    var inBase = ctx.level === 1 && ctx.isInMegBase && ctx.isInMegBase();
    if (!hasMegBaseCheckpoint() && !inBase) {
      deathPlan = "l0_reset";
      setMegDeathOverlayMessage(
        survival,
        reason,
        reason === "sanity"
          ? "精神崩溃 — 即将返回 Level 0…"
          : "你已死亡 — 即将返回 Level 0…"
      );
      return;
    }

    if (inBase && ctx.getMegSpawn) {
      var sp = ctx.getMegSpawn();
      if (sp) saveMegBaseCheckpoint(sp);
    }

    captureMegDeathPayload(survival, reason);
    deathPlan = ctx.level !== 1 ? "meg_hub_redirect" : "meg_local";
    setMegDeathOverlayMessage(
      survival,
      reason,
      ctx.level !== 1
        ? "你已死亡 — 正在传送至 M.E.G 基地…"
        : "你已死亡 — 正在 M.E.G 基地复活…"
    );
  };

  survival.onDeath = function (reason) {
    var plan = deathPlan;
    deathPlan = null;
    survival._deathSnapshot = null;

    if (plan === "l0_reset") {
      resetBackroomsRun();
      window.location.replace(level0Page);
      return;
    }
    if (plan === "meg_hub_redirect") {
      prepareMegRespawnL1Entry();
      window.location.href = megHubPage;
      return;
    }
    if (plan === "meg_local") {
      applyMegDeathState(survival);
      if (options.refreshLevelPass) {
        var passYaw = options.getLevelPassYaw ? options.getLevelPassYaw() : null;
        refreshLevelPass(options.refreshLevelPass, passYaw);
      }
      if (options.onMegRespawn) options.onMegRespawn(reason);
      return;
    }

    resetBackroomsRun();
    window.location.replace(level0Page);
  };
}

let wasInsideMegInterior = false;

export function resetMegInteriorSaveLatch() {
  wasInsideMegInterior = false;
}

/**
 * 首次进入 M.E.G 基地室内时自动存档并显示「正在保存」
 */
export function updateMegBaseAutoSave(survival, level1World, px, pz) {
  if (!survival || survival.dead || !level1World) return;
  if (!level1World.isInsideMegBaseInterior) return;
  var inside = level1World.isInsideMegBaseInterior(px, pz);
  if (!inside) {
    wasInsideMegInterior = false;
    return;
  }
  if (wasInsideMegInterior) return;
  wasInsideMegInterior = true;

  var center = level1World.ensureMegBase ? level1World.ensureMegBase() : null;
  var spawn = defaultMegBaseSpawn(center);
  saveMegBaseCheckpoint(spawn);
  flashMegSaving(survival);
}

export function consumeMegRespawnRedirectFlag() {
  try {
    if (sessionStorage.getItem(MEG_RESPAWN_FLAG) !== "1") return false;
    sessionStorage.removeItem(MEG_RESPAWN_FLAG);
    return true;
  } catch (err) {
    return false;
  }
}

export const L283_MEG_EXIT_FLAG = "backrooms_l283_meg_exit_v1";

export function setL283MegExitFlag() {
  try {
    sessionStorage.setItem(L283_MEG_EXIT_FLAG, "1");
  } catch (err) {
    /* ignore */
  }
}

export function consumeL283MegExitFlag() {
  try {
    if (sessionStorage.getItem(L283_MEG_EXIT_FLAG) !== "1") return false;
    sessionStorage.removeItem(L283_MEG_EXIT_FLAG);
    return true;
  } catch (err) {
    return false;
  }
}

export function prepareMegRespawnL1Entry() {
  try {
    sessionStorage.setItem(MEG_RESPAWN_FLAG, "1");
    grantLevelPass("clip");
  } catch (err) {
    /* ignore */
  }
}

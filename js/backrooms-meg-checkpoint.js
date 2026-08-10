/**
 * M.E.G 基地存档点：进入基地保存；在基地或已存档后于任意 L1/L2/L3 死亡 → 保留物品与状态并在基地复活
 */
import {
  backpackSlots,
  BACKPACK_CAPACITY,
  renderGridPublic,
} from "./backrooms-inventory.js";
import { consumeXiaoyeFullHealFlag } from "./backrooms-level2-xiaoye.js";
import { getHpMax, getStaminaMax } from "./backrooms-royal-rations.js";

export const MEG_CHECKPOINT_KEY = "backrooms_meg_checkpoint_v1";
export const MEG_DEATH_KEY = "backrooms_meg_death_v1";
export const MEG_RESPAWN_FLAG = "backrooms_meg_respawn";

let megSaveEl = null;
let megSaveHideTimer = null;

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

function captureMegDeathPayload(survival, reason) {
  var now = performance.now();
  var hpCap = getHpMax(now);
  var staCap = getStaminaMax(now);
  var hp =
    survival._megDeathHp != null
      ? survival._megDeathHp
      : Math.max(1, Math.min(100, survival.hp || 1));
  var sanity =
    survival._megDeathSanity != null
      ? survival._megDeathSanity
      : Math.max(1, Math.min(100, survival.sanity || 1));
  var stamina =
    survival._megDeathStamina != null
      ? survival._megDeathStamina
      : Math.max(0, Math.min(100, survival.stamina || 0));
  if (reason === "sanity") {
    sanity = Math.max(1, sanity);
  }
  hp = Math.max(1, Math.min(hpCap, hp));
  sanity = Math.max(1, Math.min(100, sanity));
  stamina = Math.max(0, Math.min(staCap, stamina));
  if (consumeXiaoyeFullHealFlag()) {
    hp = 100;
    sanity = 100;
    stamina = 100;
  }
  try {
    sessionStorage.setItem(
      MEG_DEATH_KEY,
      JSON.stringify({
        hp: hp,
        sanity: sanity,
        stamina: stamina,
        backpack: snapshotBackpackSlots(),
      })
    );
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
    var data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;
    var now = performance.now();
    var hpCap = getHpMax(now);
    var staCap = getStaminaMax(now);
    if (Number.isFinite(data.hp)) survival.hp = Math.max(1, Math.min(hpCap, data.hp));
    if (Number.isFinite(data.sanity)) {
      survival.sanity = Math.max(1, Math.min(100, data.sanity));
    }
    if (Number.isFinite(data.stamina)) {
      survival.stamina = Math.max(0, Math.min(staCap, data.stamina));
    }
    restoreBackpackSnapshot(data.backpack);
    survival.dead = false;
    survival.sanityBreaking = false;
    if (survival._deathTimer) {
      clearTimeout(survival._deathTimer);
      survival._deathTimer = null;
    }
    document.body.classList.remove("backrooms-sanity-break", "backrooms-dead");
    if (survival.deathEl) survival.deathEl.classList.remove("br-survival__death--show");
    survival.refreshHud();
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

export function mountMegSaveStatus(survival) {
  if (megSaveEl || !survival || !survival.rootEl) return;
  megSaveEl = document.createElement("p");
  megSaveEl.className = "br-survival__save";
  megSaveEl.id = "backroomsMegSave";
  megSaveEl.hidden = true;
  megSaveEl.textContent = "正在保存…";
  survival.rootEl.appendChild(megSaveEl);
}

export function flashMegSaving() {
  if (!megSaveEl) return;
  megSaveEl.hidden = false;
  if (megSaveHideTimer) clearTimeout(megSaveHideTimer);
  megSaveHideTimer = setTimeout(function () {
    if (megSaveEl) megSaveEl.hidden = true;
    megSaveHideTimer = null;
  }, 2200);
}

/**
 * @param {import('./backrooms-survival.js').BackroomsSurvival} survival
 * @param {() => { level: number, isInMegBase?: () => boolean, getMegSpawn?: () => { x: number, z: number, yaw?: number } | null }} getCtx
 */
export function installMegCheckpointDeathHooks(survival, getCtx) {
  if (!survival) return;
  survival._megDeathPrepare = function (reason) {
    var ctx = getCtx() || {};
    var inBase = ctx.level === 1 && ctx.isInMegBase && ctx.isInMegBase();
    if (!hasMegBaseCheckpoint() && !inBase) {
      survival._pendingL0Reset = true;
      if (survival.deathEl) {
        var failMsg = survival.deathEl.querySelector("[data-death-msg]");
        if (failMsg) {
          failMsg.textContent =
            reason === "sanity"
              ? "精神崩溃 — 即将返回 Level 0…"
              : "你已死亡 — 即将返回 Level 0…";
        }
      }
      return;
    }

    if (inBase && ctx.getMegSpawn) {
      var sp = ctx.getMegSpawn();
      if (sp) saveMegBaseCheckpoint(sp);
    }

    captureMegDeathPayload(survival, reason);
    survival._pendingMegRespawn = true;
    if (ctx.level !== 1) survival._megRedirectL1 = true;

    if (survival.deathEl) {
      var msg = survival.deathEl.querySelector("[data-death-msg]");
      if (msg) {
        msg.textContent =
          ctx.level !== 1
            ? "你已死亡 — 正在传送至 M.E.G 基地…"
            : "你已死亡 — 正在 M.E.G 基地复活…";
      }
    }
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
  flashMegSaving();
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

export function prepareMegRespawnL1Entry() {
  try {
    sessionStorage.setItem(MEG_RESPAWN_FLAG, "1");
    sessionStorage.setItem("backrooms_clip_pass", "1");
  } catch (err) {
    /* ignore */
  }
}

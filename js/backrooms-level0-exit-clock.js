/**
 * Level 0 出口钟：首次快出、重访加压、子层级暂停保底。
 * 不含 Three；切出仍由 L0 主循环在到期后结算。
 */

export const L0_LEFT_KEY = "backrooms_l0_left_v1";

export const FIRST_VISIT_AUTO_MIN_MS = 30000;
export const FIRST_VISIT_AUTO_MAX_MS = 60000;
export const REVISIT_BOOST_MIN_MS = 120000;
export const REVISIT_BOOST_MAX_MS = 180000;
export const REVISIT_AUTO_MIN_MS = 240000;
export const REVISIT_AUTO_MAX_MS = 300000;
export const SUBZONE_GRACE_MIN_MS = 60000;
export const SUBZONE_GRACE_MAX_MS = 90000;

function rand() {
  return Math.random();
}

function pickBetween(min, max, random) {
  var roll = typeof random === "function" ? random() : rand();
  return min + Math.max(0, Math.min(1, roll)) * (max - min);
}

function storageGet(storage, key) {
  try {
    return storage && storage.getItem ? storage.getItem(key) : null;
  } catch (err) {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    if (storage && storage.setItem) storage.setItem(key, value);
  } catch (err) {
    /* ignore */
  }
}

export function hasLeftLevel0Before(storage) {
  var store = storage;
  if (!store && typeof localStorage !== "undefined") store = localStorage;
  return storageGet(store, L0_LEFT_KEY) === "1";
}

export function markLeftLevel0(storage) {
  var store = storage;
  if (!store && typeof localStorage !== "undefined") store = localStorage;
  storageSet(store, L0_LEFT_KEY, "1");
}

export function rollFirstVisitAutoMs(random) {
  return pickBetween(FIRST_VISIT_AUTO_MIN_MS, FIRST_VISIT_AUTO_MAX_MS, random);
}

export function rollRevisitBoostMs(random) {
  return pickBetween(REVISIT_BOOST_MIN_MS, REVISIT_BOOST_MAX_MS, random);
}

export function rollRevisitAutoMs(random) {
  return pickBetween(REVISIT_AUTO_MIN_MS, REVISIT_AUTO_MAX_MS, random);
}

export function rollSubzoneGraceMs(random) {
  return pickBetween(SUBZONE_GRACE_MIN_MS, SUBZONE_GRACE_MAX_MS, random);
}

/**
 * @param {{ storage?: Storage, random?: () => number, firstVisit?: boolean }} [opts]
 */
export function createLevel0ExitClock(opts) {
  opts = opts || {};
  var random = opts.random;
  var firstVisit =
    opts.firstVisit != null ? !!opts.firstVisit : !hasLeftLevel0Before(opts.storage);
  var boostAtMs = firstVisit ? 0 : rollRevisitBoostMs(random);
  var autoAtMs = firstVisit ? rollFirstVisitAutoMs(random) : rollRevisitAutoMs(random);
  var activeMs = 0;
  var paused = false;
  var boosted = firstVisit;
  var fired = false;
  var boostAnnounced = firstVisit;

  function isBoosted() {
    return boosted || activeMs >= boostAtMs;
  }

  function hintLevel() {
    if (fired) return 0;
    if (firstVisit) {
      return Math.max(0.35, Math.min(1, activeMs / Math.max(8000, autoAtMs * 0.55)));
    }
    if (activeMs < boostAtMs) {
      return Math.min(0.32, (activeMs / Math.max(1, boostAtMs)) * 0.32);
    }
    var span = Math.max(1, autoAtMs - boostAtMs);
    return Math.min(1, 0.42 + ((activeMs - boostAtMs) / span) * 0.58);
  }

  return {
    firstVisit: firstVisit,
    getActiveMs: function () {
      return activeMs;
    },
    getAutoAtMs: function () {
      return autoAtMs;
    },
    getBoostAtMs: function () {
      return boostAtMs;
    },
    isPaused: function () {
      return paused;
    },
    isBoosted: isBoosted,
    isFired: function () {
      return fired;
    },
    hintLevel: hintLevel,
    setPaused: function (next, pauseOpts) {
      var want = !!next;
      var grantGrace = !pauseOpts || pauseOpts.grace !== false;
      if (!want && paused && grantGrace) {
        autoAtMs = Math.max(autoAtMs, activeMs + rollSubzoneGraceMs(random));
      }
      paused = want;
    },
    tick: function (dtMs) {
      var dt = Number(dtMs);
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      var justBoosted = false;
      if (!paused && !fired) {
        activeMs += dt;
        if (!boosted && activeMs >= boostAtMs) {
          boosted = true;
          justBoosted = !boostAnnounced;
          boostAnnounced = true;
        }
      }
      var shouldAutoClip = !fired && !paused && activeMs >= autoAtMs;
      return {
        boosted: isBoosted(),
        justBoosted: justBoosted,
        shouldAutoClip: shouldAutoClip,
        hintLevel: hintLevel(),
      };
    },
    markFired: function () {
      fired = true;
    },
    nudgeAuto: function (extraMs) {
      var extra = Number(extraMs);
      if (!Number.isFinite(extra) || extra <= 0) return;
      autoAtMs = Math.max(autoAtMs, activeMs + extra);
    },
  };
}

export function firstVisitPoiProfile() {
  return {
    rareEnabled: false,
    clipChance: 0.11,
    clipMinDistance: 28,
    clipGuarantee: true,
    manilaChance: 0.08,
    manilaMinDistance: 32,
  };
}

export function revisitPoiProfile() {
  return {
    rareEnabled: true,
    clipChance: 0.012,
    clipMinDistance: 96,
    clipGuarantee: false,
    manilaChance: 0.025,
    manilaMinDistance: 72,
  };
}

export function boostedPoiProfile() {
  return {
    rareEnabled: true,
    clipChance: 0.09,
    clipMinDistance: 48,
    clipGuarantee: true,
  };
}

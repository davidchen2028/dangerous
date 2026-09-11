/**
 * 后室全服同一世界客户端：hello / 快照 / 倒地救援 / 火盐对人。
 */
import { getBackroomsPresenceSocket } from "./backrooms-presence.js";
import { currentBackroomsLevelKey } from "./backrooms-world-level.js";
import {
  createRemotePlayerPool,
  watchRenderedScene,
} from "./backrooms-remote-players.js";
import { emitFireSaltExplosion } from "./backrooms-net-combat.js";
import {
  addItemUnchecked,
  removeFirstItem,
  applyServerInventory,
} from "./backrooms-inventory.js";
import { showBackroomsLootToast } from "./backrooms-fps-controller.js";
import { queueEnterLevelNumber } from "./backrooms-level-enter.js";

const IDENTITY_TOKEN_KEY = "backrooms_meg_identity_token_v1";
const INPUT_HZ = 12;

let boundFps = null;
let boundPose = null;
let boundSurvival = null;
let boundCamera = null;
let remotes = createRemotePlayerPool();
let lastHelloKey = "";
let lastYou = null;
let holdingRevive = false;
let reviveTargetId = null;
let inputAcc = 0;
let promptEl = null;
let listenersBound = false;
let rafBound = false;
let teleportFn = null;
let reviveSentAt = 0;
let seenHpVersion = -1;
let seenForcePosVersion = 0;
let detentionRedirecting = false;

function goToDetention(det) {
  if (detentionRedirecting) return;
  if (currentBackroomsLevelKey() === "l363") return;
  detentionRedirecting = true;
  var label = (det && det.label) || "异常行为";
  var left = det && det.leftSec ? Math.ceil(det.leftSec) : 0;
  toast("隔离：Level 363 · " + label + (left ? " · " + left + "s" : ""));
  try {
    sessionStorage.setItem("backrooms_l363_pass", "1");
  } catch (err) {
    /* ignore */
  }
  queueEnterLevelNumber(363);
  window.location.replace("backrooms-level363.html");
}

function goToRelease(page) {
  if (detentionRedirecting) return;
  detentionRedirecting = true;
  toast("隔离结束");
  try {
    sessionStorage.setItem("backrooms_clip_pass", "1");
  } catch (err) {
    /* ignore */
  }
  window.location.replace(page || "backrooms-level1.html");
}

function applyDetention(you, extra) {
  var det = (you && you.detention) || extra || null;
  if (det && det.active) {
    goToDetention(det);
    return;
  }
  var redirect = you && you.redirect;
  if (redirect === "backrooms-level363.html") {
    goToDetention(det || { label: "异常行为" });
    return;
  }
  if (
    redirect === "backrooms-level1.html" &&
    currentBackroomsLevelKey() === "l363"
  ) {
    goToRelease(redirect);
  }
}

function socket() {
  if (typeof window !== "undefined" && window.BackroomsPresence) {
    return window.BackroomsPresence.getSocket() || getBackroomsPresenceSocket();
  }
  return getBackroomsPresenceSocket();
}

function readMegToken() {
  try {
    return localStorage.getItem(IDENTITY_TOKEN_KEY) || "";
  } catch (err) {
    return "";
  }
}

function toast(text) {
  try {
    showBackroomsLootToast(text, { durationMs: 2400 });
  } catch (err) {
    /* ignore */
  }
}

function ensurePrompt() {
  if (promptEl || typeof document === "undefined") return promptEl;
  promptEl = document.getElementById("backroomsMpPrompt");
  if (promptEl) return promptEl;
  promptEl = document.createElement("div");
  promptEl.id = "backroomsMpPrompt";
  promptEl.className = "br-mp-prompt";
  promptEl.hidden = true;
  document.body.appendChild(promptEl);
  return promptEl;
}

function setPrompt(text) {
  ensurePrompt();
  if (!promptEl) return;
  if (!text) {
    promptEl.hidden = true;
    promptEl.textContent = "";
    return;
  }
  promptEl.hidden = false;
  promptEl.textContent = text;
}

function readPose() {
  if (boundPose) return boundPose();
  if (boundFps && boundFps.player) {
    return {
      x: boundFps.player.x,
      z: boundFps.player.z,
      y: boundFps.feetY || 0,
      yaw: boundFps.yaw || 0,
      pitch: boundFps.pitch || 0,
    };
  }
  return { x: 0, z: 0, y: 0, yaw: 0, pitch: 0 };
}

function applyAuthoritativeYou(you) {
  lastYou = you;
  if (!you) return;
  applyDetention(you);
  if (you.forcePos && you.forcePos.version > seenForcePosVersion) {
    seenForcePosVersion = you.forcePos.version;
    if (teleportFn) teleportFn(you.forcePos.x, you.forcePos.z);
  }
  if (!boundSurvival) return;
  // 只在服务端做出新判定（PvP 伤害、救起、流血复活）时覆盖本地血量，
  // 否则会每秒十次把本地 PvE 掉血刷回去。
  if (typeof you.hp === "number" && you.hpVersion !== seenHpVersion) {
    seenHpVersion = you.hpVersion;
    boundSurvival.hp = you.hp;
  }
  boundSurvival.downed = !!you.downed;
  boundSurvival.refreshHud && boundSurvival.refreshHud();
  if (boundFps) boundFps.incapacitated = !!you.downed;
  document.body.classList.toggle("backrooms-downed", !!you.downed);
  if (you.downed && boundSurvival.deathEl) {
    var msg = boundSurvival.deathEl.querySelector("[data-death-msg]");
    if (msg) {
      msg.textContent =
        "倒地 — 等待救援（" + Math.ceil(you.downedLeft || 0) + "s）";
    }
    boundSurvival.deathEl.classList.add("br-survival__death--show");
  } else if (boundSurvival.deathEl && !boundSurvival.dead) {
    boundSurvival.deathEl.classList.remove("br-survival__death--show");
  }
}

function hello() {
  var sock = socket();
  if (!sock || !sock.connected) return;
  var pose = readPose();
  var levelKey = currentBackroomsLevelKey();
  lastHelloKey = levelKey;
  sock.emit("game_hello", {
    levelKey: levelKey,
    x: pose.x,
    z: pose.z,
    y: pose.y,
    yaw: pose.yaw,
    pitch: pose.pitch,
    megToken: readMegToken(),
  });
}

function bindSocketHandlers(sock) {
  if (!sock || sock.__brWorldBound) return;
  sock.__brWorldBound = true;
  sock.on("game_hello_ok", function (data) {
    if (data && Array.isArray(data.inventory)) {
      applyServerInventory(data.inventory);
    }
    if (data && data.you) applyAuthoritativeYou(data.you);
    if (data && data.detention) applyDetention(data.you, data.detention);
  });
  sock.on("world_detention", function (det) {
    applyDetention(lastYou, det);
  });
  sock.on("world_snapshot", function (data) {
    if (!data) return;
    if (data.you) applyAuthoritativeYou(data.you);
    remotes.syncPeers(data.peers || [], performance.now());
  });
  sock.on("combat_event", function (ev) {
    if (!ev) return;
    if (ev.type === "hit") {
      if (ev.reason === "protect") toast("新人保护：本次伤害无效");
      else if (ev.reason === "base") toast("M.E.G. 基地内禁止伤害流浪者");
      else if (ev.reason === "iframe") toast("刚复活，伤害被免疫");
      else if (ev.applied > 0) {
        toast("被击中 −" + Math.round(ev.applied));
        if (boundSurvival && typeof ev.hp === "number") {
          boundSurvival.hp = ev.hp;
          boundSurvival.refreshHud && boundSurvival.refreshHud();
        }
      }
    }
    if (ev.type === "fire" && ev.hits) {
      var i;
      for (i = 0; i < ev.hits.length; i++) {
        if (ev.hits[i].applied > 0) {
          toast("火盐命中流浪者");
          break;
        }
      }
    }
    if (ev.you) applyAuthoritativeYou(ev.you);
    if (ev.type === "revived") toast("已被救起");
    if (ev.type === "bled_out") {
      toast("倒地超时，正在复活");
      if (boundSurvival && boundSurvival.respawn) {
        boundSurvival.iframeUntil = performance.now() + 10000;
      }
    }
  });
  sock.on("item_pickup_result", function (res) {
    if (res && res.ok === false) {
      if (res.item && res.item.id) removeFirstItem(res.item.id);
      else if (res.itemId) removeFirstItem(res.itemId);
      if (res.reason === "taken") toast("物资已被他人拿走");
      else if (res.reason === "rate") toast("拾取过快，请稍后再试");
      else if (res.reason === "full") toast("服务端判定：背包已满");
      else toast("物资拾取未通过服务端校验");
    }
    if (res && res.detention) applyDetention(lastYou, res.detention);
  });
  sock.on("weapon_fire_result", function (res) {
    if (res && res.ok === false && res.reason === "no_ammo") {
      toast("服务端判定：火盐不足");
    }
  });
}

function sendInput(dt) {
  var sock = socket();
  if (!sock || !sock.connected) return;
  inputAcc += dt;
  if (inputAcc < 1 / INPUT_HZ) return;
  inputAcc = 0;
  if (lastYou && lastYou.downed) return;
  var pose = readPose();
  if (boundSurvival && typeof boundSurvival.hp === "number") {
    pose.hp = boundSurvival.hp;
    pose.hpVersion = seenHpVersion;
  }
  sock.emit("game_input", pose);
  var key = currentBackroomsLevelKey();
  if (key !== lastHelloKey) hello();
}

function tickRevive() {
  var sock = socket();
  var pose = readPose();
  var yaw = pose.yaw || 0;
  var target = remotes.pickReviveTarget(pose, yaw, 2.2);
  var holding =
    typeof boundFps !== "undefined" &&
    boundFps &&
    boundFps.keys &&
    (boundFps.keys.KeyE || boundFps.keys.KeyF);
  if (target) {
    setPrompt("按住 E 救援 " + (target.nickname || "流浪者"));
  } else if (lastYou && lastYou.downed) {
    setPrompt("倒地中 — 任何人可以救援");
  } else if (lastYou && lastYou.protectLeft > 0) {
    var kind = lastYou.protectKind === "return" ? "回层保护 " : "新人保护 ";
    setPrompt(kind + Math.ceil(lastYou.protectLeft) + "s");
  } else if (lastYou && lastYou.iframeLeft > 0) {
    setPrompt("复活无敌 " + Math.ceil(lastYou.iframeLeft) + "s");
  } else if (lastYou && lastYou.detention && lastYou.detention.leftSec > 0) {
    setPrompt(
      "Level 363 隔离 " +
        Math.ceil(lastYou.detention.leftSec) +
        "s · " +
        (lastYou.detention.label || "")
    );
  } else {
    setPrompt("");
  }
  if (!sock || !sock.connected) return;
  if (holding && target) {
    // 服务端 tick 自己推进救援进度，这里只在换目标时发一次，外加低频心跳补丢包。
    var now = performance.now();
    if (!holdingRevive || reviveTargetId !== target.userId) {
      holdingRevive = true;
      reviveTargetId = target.userId;
      reviveSentAt = 0;
    }
    if (now - reviveSentAt > 500) {
      reviveSentAt = now;
      sock.emit("revive_hold", { userId: target.userId });
    }
  } else if (holdingRevive) {
    holdingRevive = false;
    reviveTargetId = null;
    sock.emit("revive_cancel", {});
  }
}

function startRaf() {
  if (rafBound || typeof window === "undefined") return;
  rafBound = true;
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    remotes.update(now);
    sendInput(dt);
    tickRevive();
  }
  requestAnimationFrame(frame);
}

function onReady() {
  var sock = socket();
  if (!sock) return;
  bindSocketHandlers(sock);
  hello();
  startRaf();
}

export function noteFpsState(state) {
  if (state) boundFps = state;
}

export function noteScene(scene) {
  remotes.setScene(scene);
}

export function noteCamera(camera) {
  boundCamera = camera;
}

export function noteSurvival(survival) {
  boundSurvival = survival;
  if (survival && !survival.__brMpDeathHook) {
    survival.__brMpDeathHook = true;
    var prev = survival.onInterceptDeath;
    survival.onInterceptDeath = function (reason) {
      if (prev && prev(reason)) return true;
      var sock = socket();
      if (!sock || !sock.connected) return false;
      sock.emit("status_down", { reason: reason || "pve" });
      survival.downed = true;
      survival.dead = false;
      if (boundFps) boundFps.incapacitated = true;
      return true;
    };
  }
}

export function bindPoseReader(fn) {
  boundPose = fn;
}

export function bindTeleport(fn) {
  teleportFn = fn;
}

export function reportFireSaltExplosion(position) {
  emitFireSaltExplosion(socket(), position);
}

export function claimPickup(item) {
  if (!item || !item.id) return false;
  var sock = socket();
  if (!sock || !sock.connected) {
    return addItemUnchecked(item);
  }
  if (!item.worldKey) {
    toast("联机物资必须有世界登记键");
    return false;
  }
  if (!addItemUnchecked(item)) return false;
  sock.emit("item_pickup", {
    key: String(item.worldKey),
    itemId: item.id,
    name: item.name || item.id,
  });
  return true;
}

export function isOnline() {
  var sock = socket();
  return !!(sock && sock.connected);
}

export function shouldBlockMove() {
  return !!(lastYou && lastYou.downed);
}

export function handleLocalZeroHp(survival, reason) {
  noteSurvival(survival);
  var sock = socket();
  if (!sock || !sock.connected) return false;
  sock.emit("status_down", { reason: reason || "pve" });
  survival.downed = true;
  if (boundFps) boundFps.incapacitated = true;
  return true;
}

// 必须在关卡自己搭场景之前装钩子，否则会错过唯一一次“根变成 Scene”的时刻。
watchRenderedScene(noteScene);

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.BackroomsMultiplayer = {
    noteFpsState: noteFpsState,
    noteScene: noteScene,
    noteCamera: noteCamera,
    noteSurvival: noteSurvival,
    bindPoseReader: bindPoseReader,
    bindTeleport: bindTeleport,
    reportFireSaltExplosion: reportFireSaltExplosion,
    claimPickup: claimPickup,
    isOnline: isOnline,
    shouldBlockMove: shouldBlockMove,
    handleLocalZeroHp: handleLocalZeroHp,
    hello: hello,
  };
  if (!listenersBound) {
    listenersBound = true;
    window.addEventListener("backrooms-presence-ready", onReady);
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(onReady, 80);
    });
    if (document.readyState !== "loading") setTimeout(onReady, 80);
  }
}

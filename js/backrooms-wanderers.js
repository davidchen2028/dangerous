import * as THREE from "three";
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";
import {
  addItem,
  countItem,
  removeFirstItem,
} from "./backrooms-inventory.js";
import { addMegPoints, getMegPoints } from "./backrooms-meg-points.js";
import { recordMegCareerEvent } from "./backrooms-online-profile.js";
import { deliverPackageTask } from "./backrooms-tasks.js";
import {
  registerBackroomsEntityTarget,
  unregisterBackroomsEntityTarget,
} from "./backrooms-entity-health.js";
import { getWandererDialogue } from "./backrooms-wanderer-dialogue.js";
import {
  getOrCreateWandererPlayerAppearance,
  loadWandererLevelState,
  saveWandererState,
} from "./backrooms-wanderer-store.js";

export const WANDERER_ROLES = Object.freeze([
  "ordinary",
  "injured",
  "lost",
  "scavenger",
  "merchant",
  "mission",
  "suspicious",
]);

const SKINS = [0xf0c7a5, 0xd9a174, 0xb97850, 0x815034, 0x4e3024];
const SHIRTS = [
  0x6f665a, 0x425466, 0x6b4d45, 0x536148, 0x705d72, 0x3f5d5b, 0x766b46,
];
const TROUSERS = [0x20252b, 0x30343a, 0x3d342f, 0x26343c, 0x34312b];
const HAIR = [0x17120e, 0x3a2a1d, 0x6a4a2e, 0x8b8175, 0x251a16];
const NAMES = [
  "林", "周", "米娅", "伊森", "陈", "诺拉", "阿列克", "萨米尔",
  "乔", "露西", "韩", "马库斯", "余", "艾琳",
];

var _boxGeo = null;
var _headGeo = null;
var _pickMat = null;

function boxGeo() {
  if (!_boxGeo) _boxGeo = new THREE.BoxGeometry(1, 1, 1);
  return _boxGeo;
}

function headGeo() {
  if (!_headGeo) _headGeo = new THREE.BoxGeometry(1, 1, 1);
  return _headGeo;
}

function pickMat() {
  if (!_pickMat) {
    _pickMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  }
  return _pickMat;
}

function hashText(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addPart(group, geo, mat, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function buildFigure(id, seed) {
  var rng = mulberry32(seed);
  var group = new THREE.Group();
  group.name = "Wanderer_" + id;

  var skin = new THREE.MeshLambertMaterial({
    color: SKINS[Math.floor(rng() * SKINS.length)],
    emissive: 0x080504,
  });
  var shirt = new THREE.MeshLambertMaterial({
    color: SHIRTS[Math.floor(rng() * SHIRTS.length)],
    emissive: 0x050607,
  });
  var trousers = new THREE.MeshLambertMaterial({
    color: TROUSERS[Math.floor(rng() * TROUSERS.length)],
    emissive: 0x030405,
  });
  var hair = new THREE.MeshLambertMaterial({
    color: HAIR[Math.floor(rng() * HAIR.length)],
    emissive: 0x020101,
  });
  var bodyWidth = 0.48 + rng() * 0.1;
  var bodyHeight = 0.66 + rng() * 0.1;
  var totalScale = 0.94 + rng() * 0.1;

  var legL = addPart(group, boxGeo(), trousers, -0.14, 0.42, 0, 0.22, 0.84, 0.24);
  var legR = addPart(group, boxGeo(), trousers, 0.14, 0.42, 0, 0.22, 0.84, 0.24);
  var torso = addPart(group, boxGeo(), shirt, 0, 1.18, 0, bodyWidth, bodyHeight, 0.32);
  var head = addPart(group, headGeo(), skin, 0, 1.69, 0, 0.31, 0.31, 0.31);
  addPart(group, boxGeo(), hair, 0, 1.86, -0.01, 0.33, 0.08 + rng() * 0.05, 0.33);
  var armL = addPart(group, boxGeo(), shirt, -0.35, 1.17, 0, 0.16, 0.56, 0.16);
  var armR = addPart(group, boxGeo(), shirt, 0.35, 1.17, 0, 0.16, 0.56, 0.16);
  group.scale.setScalar(totalScale);

  var pick = new THREE.Mesh(boxGeo(), pickMat());
  pick.position.set(0, 1.03, 0);
  pick.scale.set(0.85, 2.08, 0.8);
  group.add(pick);

  return {
    group: group,
    pick: pick,
    limbs: { legL: legL, legR: legR, armL: armL, armR: armR },
    materials: [skin, shirt, trousers, hair],
    head: head,
    torso: torso,
  };
}

function createDialogueUi(onChoice) {
  var root = document.createElement("div");
  root.className = "backrooms-dialogue";
  root.id = "backroomsWandererDialogue";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "流浪者对话");
  root.innerHTML =
    '<p class="backrooms-dialogue__speaker"></p>' +
    '<p class="backrooms-dialogue__text"></p>' +
    '<p class="backrooms-dialogue__choices"></p>';
  document.body.appendChild(root);
  var speaker = root.querySelector(".backrooms-dialogue__speaker");
  var text = root.querySelector(".backrooms-dialogue__text");
  var choices = root.querySelector(".backrooms-dialogue__choices");
  choices.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-wanderer-choice]");
    if (btn) onChoice(btn.getAttribute("data-wanderer-choice"));
  });
  return { root: root, speaker: speaker, text: text, choices: choices };
}

function buttonHtml(choice) {
  return (
    '<button type="button" class="backrooms-dialogue__choice" data-wanderer-choice="' +
    choice.key +
    '"><kbd>' +
    choice.key.toUpperCase() +
    "</kbd> " +
    choice.label +
    "</button>"
  );
}

function safeRecord(type, levelId, npc, suffix) {
  var payload = {
    levelId: levelId,
    wandererId: npc.id,
    source: "wanderer_ecosystem",
  };
  recordMegCareerEvent(
    type,
    payload,
    type + ":" + levelId + ":" + npc.id + (suffix ? ":" + suffix : "")
  ).catch(function () {
    /* career profile may not have initialized yet */
  });
}

function defaultState(spec) {
  return {
    x: spec.x,
    z: spec.z,
    heading: spec.heading || 0,
    completed: false,
    following: false,
    hostile: false,
    dead: false,
    hp: 60,
    stockWater: 1,
    stockSalt: 1,
  };
}

/**
 * @param {{
 * root: THREE.Object3D,
 * levelId: string,
 * colliders: object[],
 * spawns: Array<{id:string, role:string, x:number, z:number, heading?:number}>,
 * rescueZone: {minX:number,maxX:number,minZ:number,maxZ:number},
 * showToast?: (message:string)=>void,
 * getSurvival?: ()=>object,
 * onDialogueOpenChange?: (open:boolean)=>void,
 * }} opts
 */
export function createWandererManager(opts) {
  opts = opts || {};
  var root = new THREE.Group();
  root.name = "BackroomsWandererEcosystem_" + opts.levelId;
  opts.root.add(root);
  var levelId = String(opts.levelId || "");
  var saved = loadWandererLevelState(levelId);
  var colliders = opts.colliders || [];
  var rescueZone = opts.rescueZone || { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  var showToast = typeof opts.showToast === "function" ? opts.showToast : function () {};
  var npcs = [];
  var byId = Object.create(null);
  var activeNpc = null;
  var activeDialogue = null;
  var open = false;
  var active = true;
  var saveClock = 0;
  var ui = createDialogueUi(handleChoice);

  // Establish a stable player appearance from the same generator, even though
  // first-person pages do not render the local body yet.
  getOrCreateWandererPlayerAppearance();

  function persist(npc) {
    saveWandererState(levelId, npc.id, npc.state);
  }

  function setHostile(npc) {
    if (!npc || npc.state.dead) return;
    npc.state.hostile = true;
    npc.state.following = false;
    persist(npc);
  }

  function onNpcDamage(npc, target) {
    npc.state.hp = target.hp;
    persist(npc);
    if (!npc.state.hostile) {
      safeRecord("civilian_assault", levelId, npc, "first_hit");
      showToast("你袭击了一名尚未攻击你的流浪者 · 职业贡献受罚");
      setHostile(npc);
    }
  }

  function onNpcDeath(npc) {
    npc.state.dead = true;
    npc.state.hp = 0;
    npc.state.following = false;
    npc.figure.group.visible = false;
    persist(npc);
    closeDialogue();
  }

  var spawns = Array.isArray(opts.spawns) ? opts.spawns : [];
  for (var i = 0; i < spawns.length; i++) {
    var spec = spawns[i];
    if (WANDERER_ROLES.indexOf(spec.role) < 0) continue;
    var seed = hashText(levelId + ":" + spec.id);
    var figure = buildFigure(spec.id, seed);
    var state = Object.assign(defaultState(spec), saved[spec.id] || {});
    var resolved = resolveCircleAgainstColliders(state.x, state.z, 0.34, colliders, 1.5, 12);
    state.x = resolved.x;
    state.z = resolved.z;
    figure.group.position.set(state.x, 0, state.z);
    figure.group.rotation.y = state.heading || 0;
    figure.group.visible = !state.dead;
    var npc = {
      id: spec.id,
      role: spec.role,
      seed: seed,
      name: NAMES[seed % NAMES.length],
      state: state,
      figure: figure,
      homeX: spec.x,
      homeZ: spec.z,
      rng: mulberry32(seed),
      walkSpeed: spec.role === "injured" ? 0.62 : 0.85 + ((seed >>> 8) % 30) / 100,
      roamRadius:
        spec.role === "injured" ? 1.5 : spec.role === "merchant" || spec.role === "mission" ? 2.2 : 4.5,
      destX: null,
      destZ: null,
      pauseTimer: (seed % 400) / 100,
      blockedFor: 0,
      gaitPhase: (seed % 628) / 100,
      gaitBlend: 0,
      attackCooldown: 0,
      entityTarget: null,
    };
    var interactData = { kind: "wanderer", wandererId: npc.id };
    figure.group.userData.brInteract = interactData;
    figure.pick.userData.brInteract = interactData;
    npc.entityTarget = registerBackroomsEntityTarget(figure.group, {
      kind: "wanderer",
      name: "流浪者",
      maxHp: 60,
      aimHeight: 0.95,
      onDamage: onNpcDamage.bind(null, npc),
      onDeath: onNpcDeath.bind(null, npc),
    });
    var storedHp = Number(state.hp);
    npc.entityTarget.hp = state.dead
      ? 0
      : Math.max(1, Math.min(60, Number.isFinite(storedHp) ? storedHp : 60));
    npc.entityTarget.alive = !state.dead;
    root.add(figure.group);
    npcs.push(npc);
    byId[npc.id] = npc;
  }

  function renderDialogue(npc) {
    activeDialogue = getWandererDialogue(npc, levelId);
    ui.speaker.textContent = "流浪者 · " + npc.name;
    ui.text.textContent = activeDialogue.text;
    ui.choices.innerHTML = activeDialogue.choices.map(buttonHtml).join("");
  }

  function openDialogue(npc) {
    if (!npc || npc.state.dead || !active) return false;
    activeNpc = npc;
    open = true;
    renderDialogue(npc);
    ui.root.hidden = false;
    document.body.classList.add("backrooms-dialogue-open");
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    if (opts.onDialogueOpenChange) opts.onDialogueOpenChange(true);
    return true;
  }

  function closeDialogue() {
    if (!open) return;
    open = false;
    activeNpc = null;
    activeDialogue = null;
    ui.root.hidden = true;
    document.body.classList.remove("backrooms-dialogue-open");
    if (opts.onDialogueOpenChange) opts.onDialogueOpenChange(false);
  }

  function finishSupply(npc) {
    npc.state.completed = true;
    npc.state.following = false;
    persist(npc);
    addMegPoints(15);
    showToast("已把杏仁水交给流浪者 · +15 积分");
  }

  function giveWater(npc, credit) {
    if (countItem("almond_water") < 1 || !removeFirstItem("almond_water")) {
      showToast("你没有杏仁水");
      return false;
    }
    if (credit !== false) {
      finishSupply(npc);
    } else {
      npc.state.completed = true;
      npc.state.following = false;
      persist(npc);
    }
    return true;
  }

  function buy(npc, itemId, name, price, stockKey) {
    if (!(npc.state[stockKey] > 0)) {
      showToast("这件货已经卖完了");
      return false;
    }
    if (getMegPoints() < price) {
      showToast("积分不足");
      return false;
    }
    if (!addItem({ id: itemId, name: name })) {
      showToast("背包已满");
      return false;
    }
    addMegPoints(-price);
    npc.state[stockKey] -= 1;
    persist(npc);
    showToast("买到" + name + " · -" + price + " 积分");
    return true;
  }

  function handleAction(action) {
    var npc = activeNpc;
    if (!npc) return;
    if (action === "close") {
      closeDialogue();
      return;
    }
    if (action === "give_supply") {
      if (giveWater(npc)) closeDialogue();
      return;
    }
    if (action === "follow") {
      npc.state.following = true;
      persist(npc);
      if (inRescueZone(npc.state.x, npc.state.z)) {
        completeRescue(npc);
      } else {
        showToast("流浪者开始跟随你 · 带回出生点区块即可");
      }
      closeDialogue();
      return;
    }
    if (action === "barter") {
      if (countItem("almond_water") < 1) {
        showToast("你没有杏仁水");
        return;
      }
      if (!removeFirstItem("almond_water")) return;
      if (!addItem({ id: "fire_salt", name: "火盐" })) {
        addItem({ id: "almond_water", name: "杏仁水" });
        showToast("背包已满");
        return;
      }
      npc.state.completed = true;
      persist(npc);
      showToast("交换完成 · 获得火盐");
      closeDialogue();
      return;
    }
    if (action === "buy_water") {
      buy(npc, "almond_water", "杏仁水", 10, "stockWater");
      renderDialogue(npc);
      return;
    }
    if (action === "buy_salt") {
      buy(npc, "fire_salt", "火盐", 20, "stockSalt");
      renderDialogue(npc);
      return;
    }
    if (action === "deliver_task") {
      var result = deliverPackageTask("package_l1");
      showToast(result.ok ? "任务包裹已经交付 · 回 Level 4 领赏" : result.reason);
      if (result.ok) {
        npc.state.completed = true;
        persist(npc);
        closeDialogue();
      }
      return;
    }
    if (action === "appease") {
      if (giveWater(npc, false)) {
        showToast("对方拿着水离开了，没有再找你的麻烦");
        closeDialogue();
      }
      return;
    }
    if (action === "refuse") {
      setHostile(npc);
      showToast("对方抽出藏着的武器，向你逼近");
      closeDialogue();
    }
  }

  function handleChoice(key) {
    if (!activeDialogue) return;
    for (var i = 0; i < activeDialogue.choices.length; i++) {
      if (activeDialogue.choices[i].key === key) {
        handleAction(activeDialogue.choices[i].action);
        return;
      }
    }
  }

  function interact(data) {
    if (!data || data.kind !== "wanderer") return false;
    return openDialogue(byId[data.wandererId]);
  }

  function handleKey(event) {
    if (!open || event.repeat) return false;
    var key = event.code === "Escape" ? "b" : String(event.key || "").toLowerCase();
    if (key === "a" || key === "b" || key === "c") {
      handleChoice(key);
      return true;
    }
    return true;
  }

  /**
   * 身体只按转向速度慢慢摆过去，避免瞬间转头看起来像原地打转。
   * 返回转完之后仍未对准的角度，供移动时减速用。
   */
  function turnToward(npc, targetHeading, dt, rate) {
    var diff = targetHeading - npc.state.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    var maxTurn = (rate || 2.4) * dt;
    var applied = Math.max(-maxTurn, Math.min(maxTurn, diff));
    npc.state.heading += applied;
    npc.figure.group.rotation.y = npc.state.heading;
    return diff - applied;
  }

  function moveNpc(npc, dt, targetX, targetZ, speed) {
    var dx = targetX - npc.state.x;
    var dz = targetZ - npc.state.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 0.05) return false;
    var offAngle = turnToward(npc, Math.atan2(dx, dz), dt, 2.2 + speed);
    // 没转正之前先放慢，走出来是转身起步而不是横着平移。
    var facing = Math.max(0, Math.cos(offAngle));
    var step = Math.min(dist, speed * dt * (0.35 + 0.65 * facing));
    var nx = npc.state.x + (dx / dist) * step;
    var nz = npc.state.z + (dz / dist) * step;
    var resolved = resolveCircleAgainstColliders(nx, nz, 0.34, colliders, 2, 8);
    var advanced = Math.hypot(resolved.x - npc.state.x, resolved.z - npc.state.z);
    npc.state.x = resolved.x;
    npc.state.z = resolved.z;
    npc.figure.group.position.set(npc.state.x, 0, npc.state.z);
    return advanced > step * 0.25;
  }

  /** 在原始站位附近挑一个能站住的落脚点，走过去而不是绕圈。 */
  function pickDestination(npc) {
    for (var attempt = 0; attempt < 6; attempt++) {
      var angle = npc.rng() * Math.PI * 2;
      var radius = 1.4 + npc.rng() * npc.roamRadius;
      var tx = npc.homeX + Math.sin(angle) * radius;
      var tz = npc.homeZ + Math.cos(angle) * radius;
      var resolved = resolveCircleAgainstColliders(tx, tz, 0.42, colliders, 2, 8);
      if (Math.hypot(resolved.x - tx, resolved.z - tz) < 0.1) {
        npc.destX = tx;
        npc.destZ = tz;
        npc.blockedFor = 0;
        return;
      }
    }
    npc.destX = npc.homeX;
    npc.destZ = npc.homeZ;
    npc.blockedFor = 0;
  }

  function strollTo(npc, dt) {
    if (npc.pauseTimer > 0) {
      npc.pauseTimer -= dt;
      return false;
    }
    if (npc.destX == null) pickDestination(npc);
    var arrived =
      Math.hypot(npc.destX - npc.state.x, npc.destZ - npc.state.z) < 0.3;
    if (arrived) {
      npc.destX = null;
      npc.pauseTimer = 1.6 + npc.rng() * 3.4;
      return false;
    }
    var moved = moveNpc(npc, dt, npc.destX, npc.destZ, npc.walkSpeed);
    // 撞上货架或墙时换一个落脚点，而不是贴着障碍原地磨。
    npc.blockedFor = moved ? 0 : npc.blockedFor + dt;
    if (npc.blockedFor > 0.6) {
      npc.destX = null;
      npc.blockedFor = 0;
      npc.pauseTimer = 0.4 + npc.rng() * 0.8;
    }
    return moved;
  }

  function animateNpc(npc, moving, dt) {
    var target = moving ? 1 : 0;
    npc.gaitBlend += (target - npc.gaitBlend) * Math.min(1, dt * 6);
    if (moving) npc.gaitPhase += dt * npc.walkSpeed * 5.2;
    var swing = Math.sin(npc.gaitPhase) * 0.55 * npc.gaitBlend;
    npc.figure.limbs.legL.rotation.x = swing;
    npc.figure.limbs.legR.rotation.x = -swing;
    npc.figure.limbs.armL.rotation.x = -swing * 0.7;
    npc.figure.limbs.armR.rotation.x = swing * 0.7;
    npc.figure.group.position.y = Math.abs(Math.sin(npc.gaitPhase)) * 0.035 * npc.gaitBlend;
  }

  function inRescueZone(x, z) {
    return (
      x >= rescueZone.minX &&
      x < rescueZone.maxX &&
      z >= rescueZone.minZ &&
      z < rescueZone.maxZ
    );
  }

  function completeRescue(npc) {
    if (!npc || npc.state.completed) return;
    npc.state.following = false;
    npc.state.completed = true;
    persist(npc);
    addMegPoints(35);
    showToast("流浪者已抵达出生点区块 · +35 积分");
  }

  function update(dt, playerX, playerZ) {
    if (!active) return;
    if (open) return;
    saveClock += dt;
    for (var i = 0; i < npcs.length; i++) {
      var npc = npcs[i];
      if (npc.state.dead || !npc.figure.group.visible) continue;
      var depenetrated = resolveCircleAgainstColliders(
        npc.state.x,
        npc.state.z,
        0.34,
        colliders,
        1.5,
        8
      );
      if (depenetrated.x !== npc.state.x || depenetrated.z !== npc.state.z) {
        npc.state.x = depenetrated.x;
        npc.state.z = depenetrated.z;
        npc.figure.group.position.set(npc.state.x, 0, npc.state.z);
      }
      var moving = false;
      var pd = Math.hypot(playerX - npc.state.x, playerZ - npc.state.z);
      npc.attackCooldown = Math.max(0, npc.attackCooldown - dt);

      if (npc.state.hostile) {
        if (pd < 18 && pd > 1.05) {
          moving = moveNpc(npc, dt, playerX, playerZ, 2.65);
        } else if (pd <= 1.05) {
          turnToward(npc, Math.atan2(playerX - npc.state.x, playerZ - npc.state.z), dt);
        }
        if (pd <= 1.05 && npc.attackCooldown <= 0) {
          npc.attackCooldown = 1.15;
          var survival = opts.getSurvival ? opts.getSurvival() : null;
          if (survival && !survival.dead && survival.takeDamage) {
            survival.takeDamage(8);
            showToast("流浪者用藏着的武器袭击了你 · -8 HP");
          }
        }
      } else if (npc.state.following) {
        if (pd > 1.8) moving = moveNpc(npc, dt, playerX, playerZ, npc.role === "injured" ? 1.25 : 2);
        else turnToward(npc, Math.atan2(playerX - npc.state.x, playerZ - npc.state.z), dt);
        // 一走进出生点区块就立刻结算，不必走到某个点。
        if (inRescueZone(npc.state.x, npc.state.z)) {
          completeRescue(npc);
        }
      } else {
        // 交谈范围内停下来看着玩家，其余时间在原地附近走动。
        if (pd < 3.2) {
          turnToward(npc, Math.atan2(playerX - npc.state.x, playerZ - npc.state.z), dt);
          npc.destX = null;
        } else {
          moving = strollTo(npc, dt);
        }
      }
      animateNpc(npc, moving, dt);
    }
    if (saveClock > 5) {
      saveClock = 0;
      for (var j = 0; j < npcs.length; j++) {
        if (npcs[j].state.following || npcs[j].state.hostile) persist(npcs[j]);
      }
    }
  }

  function setActive(value) {
    active = !!value;
    root.visible = active;
    if (!active) closeDialogue();
  }

  function dispose() {
    closeDialogue();
    for (var i = 0; i < npcs.length; i++) {
      unregisterBackroomsEntityTarget(npcs[i].entityTarget);
      for (var m = 0; m < npcs[i].figure.materials.length; m++) {
        npcs[i].figure.materials[m].dispose();
      }
    }
    if (root.parent) root.parent.remove(root);
    if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
  }

  return {
    interact: interact,
    handleKey: handleKey,
    isDialogueOpen: function () { return open; },
    getInteractRoots: function () { return active ? npcs.map(function (n) { return n.figure.group; }) : []; },
    update: update,
    setActive: setActive,
    dispose: dispose,
  };
}

/**
 * Level C-1166 兜率天
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
} from "./backrooms-survival-persist.js";
import { installMegCheckpointDeathHooks } from "./backrooms-meg-checkpoint.js";
import {
  toggleBackpack,
  isInventoryOpen,
  setInventoryOpenHandler,
  addItem,
  removeFirstItem,
  countItem,
} from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  setBackroomsTemperatureZone,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { buildC1166Palace, disposeC1166Group } from "./backrooms-level-c1166-world.js?v=1";
import { createC1166Entities } from "./backrooms-level-c1166-entities.js?v=1";
import { createC1166Run } from "./backrooms-level-c1166-palaces.js?v=1";
import {
  C1166_PILL_BLACK,
  C1166_PILL_CENTER,
  C1166_PILL_WHITE,
  C1166_SHELL_ID,
  applyPill,
  c1166ItemName,
  stripBoundItems,
} from "./backrooms-level-c1166-pills.js";
import { takeDaomenBonus } from "./backrooms-daomen-outpost.js?v=1";
import { raycastWallBlockDistance } from "./backrooms-collide.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import { pickCrosshairInteract, getCameraAimRay } from "./backrooms-interact-aim.js";
import { showEnterLevelBannerIfQueued, queueEnterLevelBanner } from "./backrooms-level-enter.js";
import { createBackroomsFiresaltController } from "./backrooms-firesalt.js";
import { enforceLevelEntry, grantLevelPass } from "./backrooms-level-pass.js";
import { markLevelEntered, handleTaskUiKey, isTaskUiOpen } from "./backrooms-tasks.js";
import { getHpMax, getStaminaMax } from "./backrooms-royal-rations.js";
import { getSanityMax } from "./backrooms-death-penalty.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_EYE_HEIGHT,
  syncBackroomsPointerLockBodyClass,
} from "./backrooms-fps-controller.js";

const FOG = 0x2a120c;
const FAST = /(?:^|[?&])refine=fast(?:&|$)/.test(location.search);
const SCALE = FAST ? 8 / 70 : 1;

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const errorEl = document.getElementById("backroomsError");
const hintEl = document.getElementById("backroomsHint");
const doorHintEl = document.getElementById("backroomsDoorHint");
const crosshairEl = document.getElementById("backroomsCrosshair");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const refineEl = document.getElementById("backroomsRefine");

const wallColliders = [];
const interactRoots = [];
const fps = createBackroomsFpsState({
  player: { x: 0, z: 8, radius: 0.34, speed: 4.15 },
});

var renderer = null;
var camera = null;
var scene = null;
var survival = null;
var levelRoot = null;
var palaceGroup = null;
var layout = null;
var entities = null;
var currentAim = null;
var stickLeft = 0;
var wasMoving = false;
var puddleAcc = 0;
var ashAcc = 0;
var killed = false;
var firesalt = null;
var run = createC1166Run({
  rng: Math.random,
  stageSec: FAST ? 8 : 70,
  liSec: 90 * SCALE,
  qianStep: 5 * SCALE,
  gongGap: 10 * SCALE,
  xunLimit: 49 * SCALE,
});

var TEMP_ZONE = {
  kan: "c1166",
  kun: "c1166",
  zhen: "c1166",
  xun: "c1166_xun",
  qian: "c1166",
  dui: "c1166_dui",
  gen: "c1166_gen",
  li: "c1166_li",
  zhong: "c1166_zhong",
};

function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = "<p><strong>Level C-1166 无法启动</strong></p><p>" + msg + "</p>";
}

function showLootToast(text) {
  showBackroomsLootToast(text, { durationMs: 2400 });
}

function vitals() {
  return {
    hp: survival ? survival.hp : 0,
    sanity: survival ? survival.sanity : 0,
    stamina: survival ? survival.stamina : 0,
  };
}

function inKunRing() {
  if (!layout || !layout.kunRing || run.palaceId() !== "kun") return false;
  return Math.hypot(fps.player.x - layout.kunRing.x, fps.player.z - layout.kunRing.z) <= layout.kunRing.radius;
}

function nearList(list, radius) {
  if (!list) return null;
  var i;
  for (i = 0; i < list.length; i++) {
    if (Math.hypot(fps.player.x - list[i].x, fps.player.z - list[i].z) <= radius) return list[i];
  }
  return null;
}

function stripItems() {
  stripBoundItems(removeFirstItem);
}

function killPlayer(text) {
  if (killed || !survival || survival.dead) return;
  killed = true;
  showLootToast(text);
  survival.takeDamage(99999);
}

function giveItem(id) {
  return addItem({ id: id, name: c1166ItemName(id) });
}

function loadPalace(id, skipEnter) {
  if (!skipEnter) run.enter(id, vitals());
  entities.clear();
  interactRoots.length = 0;
  wallColliders.length = 0;
  if (palaceGroup) disposeC1166Group(palaceGroup);
  palaceGroup = new THREE.Group();
  palaceGroup.name = "c1166-" + run.palaceId();
  levelRoot.add(palaceGroup);
  entities.setParent(palaceGroup);
  layout = buildC1166Palace(run.palaceId(), palaceGroup, wallColliders, interactRoots);
  entities.spawnPalace(run.palaceId());
  fps.player.x = layout.spawnX;
  fps.player.z = layout.spawnZ;
  fps.yaw = layout.spawnYaw;
  fps.feetY = 0;
  fps.velY = 0;
  fps.pitch = 0;
  puddleAcc = 0;
  ashAcc = 0;
  setBackroomsTemperatureZone(TEMP_ZONE[run.palaceId()] || "c1166");
  applyFog();
  if (run.palaceId() === "zhong") {
    if (!giveItem(C1166_PILL_CENTER)) {
      entities.dropLoot(0.6, -2, C1166_PILL_CENTER);
      showLootToast("手里拿不下，黑丸落在地上");
    }
  }
  if (run.palaceId() === "xun") offerMegPills();
}

function offerMegPills() {
  if (run.megGiven()) return;
  if (!giveItem(C1166_PILL_WHITE)) {
    showLootToast("手里拿不下白色丸药");
    return;
  }
  run.markMegGiven();
  showLootToast("M.E.G. 炼丹坊给了你一颗白色丸药");
  if (!takeDaomenBonus()) return;
  if (giveItem(C1166_PILL_WHITE)) showLootToast("丹宗认得你，又给了一颗白色丸药");
  else entities.dropLoot(-0.6, -2, C1166_PILL_WHITE);
}

function applyFog() {
  if (!scene || !scene.fog) return;
  var id = run.palaceId();
  if (id === "dui") {
    var near = !!nearList(layout && layout.torches, 6);
    scene.fog.near = 1;
    scene.fog.far = near ? 22 : 7;
    return;
  }
  if (id === "li") {
    scene.fog.near = 3;
    scene.fog.far = 28;
    return;
  }
  scene.fog.near = 8;
  scene.fog.far = 32;
}

function takeLoot(data) {
  if (!data || !data.itemId) return;
  if (!giveItem(data.itemId)) {
    showLootToast("手里拿不下");
    return;
  }
  showLootToast(data.name || c1166ItemName(data.itemId));
  if (data.mesh && data.mesh.parent) data.mesh.parent.remove(data.mesh);
  if (data.pick && data.pick.parent) data.pick.parent.remove(data.pick);
  var at = interactRoots.indexOf(data.pick || currentAim && currentAim.object);
  if (at >= 0) interactRoots.splice(at, 1);
}

function useBound(id) {
  if (id === C1166_SHELL_ID) {
    if (!removeFirstItem(C1166_SHELL_ID)) return;
    entities.throwShell(camera);
    showLootToast("扔出丹灵壳");
    return;
  }
  var fx = applyPill(id, Math.random);
  if (!fx || !removeFirstItem(id)) return;
  if (fx.pause) run.addHold(fx.pause * SCALE);
  if (fx.rewind) run.rewind(fx.rewind * SCALE);
  if (fx.heal) survival.hp = Math.min(getHpMax(), survival.hp + fx.heal);
  if (fx.sanity) survival.sanity = Math.min(getSanityMax(), survival.sanity + fx.sanity);
  if (fx.fullHeal) survival.hp = getHpMax();
  if (fx.damage) survival.takeDamage(fx.damage);
  survival.refreshHud();
  showLootToast(fx.toast);
  if (fx.kill) killPlayer(fx.toast);
}

function tradeDan(rations) {
  if (rations) {
    if (!removeFirstItem("royal_rations")) return;
    var n = 0;
    if (giveItem(C1166_PILL_WHITE)) n += 1;
    if (giveItem(C1166_PILL_WHITE)) n += 1;
    showLootToast(
      n
        ? "丹宗收了口粮，给了两颗白色丸药。暖光下白色和橙色很像，橙色会把人变成丹魔。"
        : "手里拿不下"
    );
    return;
  }
  if (!removeFirstItem("almond_water")) return;
  if (giveItem(C1166_PILL_WHITE)) showLootToast("丹宗用一瓶杏仁水换了一颗白色丸药");
  else showLootToast("手里拿不下");
}

function tryInteract() {
  if (!survival || survival.dead || isInventoryOpen()) return;
  if (entities.trySmash(camera, fps.player.x, fps.player.z)) return;
  var data = currentAim && currentAim.data;
  if (!data) return;
  if (data.kind === "c1166_loot" || data.kind === "c1166_ground") {
    takeLoot(data);
    return;
  }
  if (data.kind === "c1166_door") {
    if (!run.kanCleared()) showLootToast("炉门未开");
    else loadPalace("kun");
    return;
  }
  if (data.kind === "c1166_floor") {
    var floor = run.tryKunFloor(inKunRing());
    if (!floor.ok) showLootToast(floor.toast);
    else loadPalace(floor.palace);
    return;
  }
  if (data.kind === "c1166_gong") {
    var gong = layout && layout.gong;
    var dist = gong ? Math.hypot(fps.player.x - gong.x, fps.player.z - gong.z) : 99;
    var hit = run.strikeGong(dist);
    if (hit.aggro) entities.wakeDemons();
    showLootToast(hit.counted ? "铜锣响了" : "锣还没歇过来");
    if (hit.teleport) loadPalace("xun");
    return;
  }
  if (data.kind === "c1166_to_qian") {
    loadPalace("qian");
    return;
  }
  if (data.kind === "c1166_to_xun") {
    loadPalace("xun");
    return;
  }
  if (data.kind === "c1166_arch" && data.to) {
    loadPalace(data.to);
    return;
  }
  if (data.kind === "c1166_meg") {
    if (!run.megGiven()) offerMegPills();
    else showLootToast("编制回 Level 1 办。我可以把你送到乾宫，再交一瓶杏仁水。");
    if (data.armed && countItem("almond_water") > 0) {
      removeFirstItem("almond_water");
      data.armed = false;
      loadPalace("qian");
      return;
    }
    data.armed = true;
    return;
  }
  if (data.kind === "c1166_dan") {
    if (countItem("royal_rations") > 0) tradeDan(true);
    else if (countItem("almond_water") > 0) tradeDan(false);
    else showLootToast("人已经够了。有吃的再来换丸药。");
    return;
  }
  if (data.kind === "c1166_pillar") {
    stripItems();
    grantLevelPass("l11", fps.yaw);
    queueEnterLevelBanner("Level 11");
    window.location.href = "backrooms-level11.html";
  }
}

function hintFor(aim) {
  var data = aim && aim.data;
  if (!data) return "";
  if (data.kind === "c1166_ground" || data.kind === "c1166_loot") {
    if (aim.distance > 1.4 && data.itemId && data.itemId.indexOf("pill") >= 0) return "按 <kbd>Q</kbd> 捡起丸药";
    return "按 <kbd>Q</kbd> 捡起" + (data.name || "东西");
  }
  if (data.kind === "c1166_door") return run.kanCleared() ? "按 <kbd>Q</kbd> 进入坤宫" : "炉门未开";
  if (data.kind === "c1166_floor") return "按 <kbd>Q</kbd> 对着地面切入";
  if (data.kind === "c1166_gong") return "按 <kbd>Q</kbd> 敲锣";
  if (data.kind === "c1166_to_qian") return "按 <kbd>Q</kbd> 前往乾宫";
  if (data.kind === "c1166_to_xun") return "按 <kbd>Q</kbd> 回到巽宫";
  if (data.kind === "c1166_arch") return "按 <kbd>Q</kbd> 进入下一宫";
  if (data.kind === "c1166_meg") return "按 <kbd>Q</kbd> 与炼丹坊交谈";
  if (data.kind === "c1166_dan") return "按 <kbd>Q</kbd> 与丹宗交谈";
  if (data.kind === "c1166_pillar") return "按 <kbd>Q</kbd> 走进光柱";
  return "";
}

function updateAim() {
  if (!camera) {
    currentAim = null;
    return;
  }
  var aim = getCameraAimRay(camera, 3.6);
  var block = raycastWallBlockDistance(aim.origin, aim.direction, 3.6, wallColliders, 0, 4.5);
  currentAim = pickCrosshairInteract(camera, interactRoots, 3.6, block);
}

function initSurvival() {
  survival = new BackroomsSurvival();
  var host = document.querySelector(".backrooms-hud") || document.body;
  survival.mountHud(host);
  loadBackroomsSurvival(survival);
  window.addEventListener("pagehide", stripItems);
  window.addEventListener("beforeunload", stripItems);
  registerBackroomsSurvivalPersist(survival);
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showLootToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  installMegCheckpointDeathHooks(survival, function () {
    return { level: "c1166" };
  });
  var prev = survival.onInterceptDeath;
  survival.onInterceptDeath = function (reason) {
    stripItems();
    if (prev) return prev(reason);
    return false;
  };
  window.__backroomsUseC1166Bound = useBound;
}

function init() {
  if (!enforceLevelEntry("c1166", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  markLevelEntered("c1166", showLootToast);
  if (!canvas) throw new Error("找不到 canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 8, 32);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);

  levelRoot = new THREE.Group();
  scene.add(levelRoot);
  scene.add(new THREE.AmbientLight(0x3a2218, 0.35));
  entities = createC1166Entities({
    parent: levelRoot,
    colliders: wallColliders,
    interactRoots: interactRoots,
    showToast: showLootToast,
    onKanClear: function () { run.markKanCleared(); },
  });
  loadPalace("kan", true);
  firesalt = createBackroomsFiresaltController({
    scene: scene,
    camera: camera,
    showToast: showLootToast,
  });

  initSurvival();
  initBackroomsTemperature("c1166", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || isTaskUiOpen();
    },
    onJump: function () {
      var mul = run.jumpMul();
      if (mul <= 0) return;
      tryBackroomsJump(fps, 7.5 * mul);
    },
    onKeyDown: function (e) {
      if (!isInventoryOpen() && handleTaskUiKey(e)) {
        e.preventDefault();
        return true;
      }
      if (e.code === "KeyQ" && !e.repeat) {
        e.preventDefault();
        tryInteract();
        return true;
      }
      if (e.code === "KeyB" && !e.repeat) {
        e.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
    onPointerLockChange: function () {
      syncBackroomsPointerLockBodyClass(fps);
    },
  });
  window.addEventListener("resize", function () {
    if (!renderer || !camera) return;
    applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  if (hintEl) {
    hintEl.innerHTML = "<kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>Space</kbd> 跳 · <kbd>Q</kbd> 互动 · <kbd>R</kbd> 使用 · <kbd>B</kbd> 背包";
  }
  if (FAST) {
    window.__c1166 = {
      run: run,
      load: loadPalace,
      fps: fps,
      entities: entities,
      survival: function () { return survival; },
      layout: function () { return layout; },
      colliders: wallColliders,
    };
  }

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var blocked = isInventoryOpen() || isTaskUiOpen() || !survival || survival.dead;
    var events = run.tick(dt, { blocked: blocked });
    var i;
    for (i = 0; i < events.length; i++) {
      if (events[i].type === "death") {
        killPlayer(events[i].reason === "li" ? "吊桥上的时间烧完了" : events[i].reason === "xun" ? "巽宫人数过线，炼化烧完了" : "身体收成一颗丹灵");
        break;
      } else if (events[i].type === "goto") loadPalace(events[i].palace);
      else if (events[i].type === "stage") showLootToast("炼化 · " + events[i].label);
    }

    var floorY = layout ? layout.sampleFloor(fps.player.x, fps.player.z) : 0;
    if (survival && !survival.dead) {
      survival.update(dt, { sprinting: isBackroomsSprintHeld(fps) && isBackroomsPlayerMoving(fps) });
    }
    updateBackroomsPlayerPhysics(fps, dt, {
      gravity: run.gravity(inKunRing()),
      bodyHeight: 1.85,
      ceilingY: run.palaceId() === "li" ? 6 : 4.3,
      floorY: floorY,
    });
    if (run.palaceId() === "li" && floorY < 0 && fps.feetY < -1) killPlayer("坠入火坑");
    if (run.palaceId() === "li" && fps.player.z < -40 && fps.player.z > -48 && Math.abs(fps.player.x) < 2.5 && !run.isDead()) {
      var snap = run.finishLi();
      if (snap && survival && !survival.dead) {
        survival.hp = Math.min(getHpMax(), snap.hp);
        survival.sanity = Math.min(getSanityMax(), snap.sanity);
        survival.stamina = Math.min(getStaminaMax(), snap.stamina);
        survival.refreshHud();
        showLootToast("过了吊桥，伤回到进离宫之前");
        loadPalace("zhong", true);
      }
    }

    var moving = isBackroomsPlayerMoving(fps);
    if (moving && !wasMoving) stickLeft = run.stickSec();
    wasMoving = moving;
    if (stickLeft > 0) stickLeft -= dt;
    if ((!survival || !survival.dead) && !blocked) {
      var sprinting = run.allowsSprint() && isBackroomsSprintHeld(fps) && moving;
      var speedMul = (survival ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving) : 1) * run.speedMul(inKunRing());
      if (stickLeft > 0) speedMul = 0;
      moveBackroomsPlayer(fps, dt, speedMul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, wallColliders, 8);
      });
      var wind = run.wind();
      if (wind) {
        var blown = resolveBackroomsMoveCollisions(fps.player.x + wind * dt, fps.player.z, fps.player.radius, wallColliders, 8);
        fps.player.x = blown.x;
        fps.player.z = blown.z;
      }
    }

    if (run.palaceId() === "dui" && survival && !survival.dead) {
      var wet = nearList(layout.puddles, 1.6);
      if (wet) {
        puddleAcc += dt;
        if (run.stageIndex() >= 4) survival.takeDamage(12 * dt);
        if (puddleAcc >= 1) {
          puddleAcc = 0;
          var ids = [C1166_SHELL_ID, C1166_PILL_WHITE, "c1166_pill_orange", "c1166_pill_blue", C1166_PILL_BLACK, C1166_PILL_CENTER];
          var p;
          for (p = 0; p < ids.length; p++) {
            if (countItem(ids[p]) > 0 && removeFirstItem(ids[p])) {
              showLootToast("东西融进水泽");
              break;
            }
          }
        }
      }
    }
    if (run.palaceId() === "gen" && layout && survival && !survival.dead) {
      var ash;
      var ashes = layout.ashes || [];
      for (ash = 0; ash < ashes.length; ash++) {
        var mound = ashes[ash];
        var ad = Math.hypot(fps.player.x - mound.x, fps.player.z - mound.z);
        if (mound.buried && ad < 2.5 && run.wakeAsh(mound.index)) {
          entities.spawnDemonAt(mound.x, mound.z);
          showLootToast("灰里钻出丹魔");
        }
        if (mound.burning && ad < 0.9 && countItem(C1166_SHELL_ID) > 0) {
          ashAcc += dt;
          if (ashAcc >= 0.6 && removeFirstItem(C1166_SHELL_ID)) {
            ashAcc = 0;
            showLootToast("壳被引燃");
          }
        }
      }
    }

    if (entities && survival) entities.update(dt, fps.player.x, fps.player.z, survival);
    if (firesalt) firesalt.update(dt);
    updateAim();
    applyFog();
    if (doorHintEl) {
      var text = hintFor(currentAim);
      doorHintEl.hidden = !text;
      if (text) doorHintEl.innerHTML = text;
    }
    if (refineEl) refineEl.textContent = run.hudText();
    if (crosshairEl) {
      var hide = isInventoryOpen() || !survival || survival.dead;
      crosshairEl.classList.toggle("backrooms-crosshair--hidden", hide);
      crosshairEl.classList.toggle("backrooms-crosshair--interact", !hide && !!(currentAim && currentAim.data));
    }
    applyBackroomsCamera(fps, camera, DEFAULT_EYE_HEIGHT);
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  showError(err && err.message ? err.message : String(err));
}

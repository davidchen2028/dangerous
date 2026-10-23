/**
 * 异途道门守炉据点。大地图只有一扇门，房间单独装卸。
 */
import * as THREE from "three";
import { addFireSalt, countItem, removeFirstItem } from "./backrooms-inventory.js";
import { saveBackroomsSurvival } from "./backrooms-survival-persist.js";
import { grantLevelPass } from "./backrooms-level-pass.js";
import { queueEnterLevelBanner } from "./backrooms-level-enter.js";

export const DAOMEN_DOOR_KIND = "daomen_outpost_door";
export const DAOMEN_FED_KEY = "backrooms_c1166_fed_v1";

var LINES = {
  l5: {
    empty: "炉是热的，手别伸进去。",
    fed: "先去巽宫。暖光底下别把橙色当水喝。",
  },
  l2: {
    empty: "身后没东西吧？没有吃的就别挡着炉。",
    fed: "要么进炉，要么回廊道，别把东西引到门上。",
    short: "就这一瓶？不够吃。炉在那儿。",
  },
  l13: {
    empty: "金丹要吃的来换。炉可以切。",
    fed: "坎宫先敲丹灵，壳留着砸丹魔，白色丸药到巽宫才有。",
  },
};

function readFed() {
  try {
    var parsed = JSON.parse(sessionStorage.getItem(DAOMEN_FED_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeFed(data) {
  try {
    sessionStorage.setItem(DAOMEN_FED_KEY, JSON.stringify(data));
  } catch (err) {
    /* ignore */
  }
}

export function markDaomenFed(place) {
  var data = readFed();
  data[place] = 1;
  writeFed(data);
}

export function daomenFed(place) {
  return !!readFed()[place];
}

export function takeDaomenBonus() {
  var data = readFed();
  if (!(data.l2 || data.l5 || data.l13) || data.bonus) return false;
  data.bonus = 1;
  writeFed(data);
  return true;
}

export function daomenHint(data) {
  if (!data) return "";
  if (data.kind === DAOMEN_DOOR_KIND) return "铜炉房 · 按 <kbd>Q</kbd> 进入";
  if (data.kind === "daomen_furnace") return "烧热的铜炉 · 按 <kbd>Q</kbd> 切入兜率天";
  if (data.kind === "daomen_keeper") return "守炉人 · 按 <kbd>Q</kbd> 交谈";
  if (data.kind === "daomen_exit") return "按 <kbd>Q</kbd> 离开炉房";
  return "";
}

function consumeFood() {
  if (countItem("almond_water") > 0 && removeFirstItem("almond_water")) return "almond_water";
  if (countItem("royal_rations") > 0 && removeFirstItem("royal_rations")) return "royal_rations";
  return "";
}

function trade(place, toast) {
  var lines = LINES[place] || LINES.l5;
  if (daomenFed(place)) {
    toast(lines.fed);
    return;
  }
  var food = "";
  if (place === "l2" && countItem("royal_rations") > 0 && removeFirstItem("royal_rations")) food = "royal_rations";
  else food = consumeFood();
  if (!food) {
    toast(lines.empty);
    return;
  }
  markDaomenFed(place);
  if (place === "l5") {
    addFireSalt(1);
    toast(lines.fed);
    return;
  }
  if (place === "l2") {
    addFireSalt(food === "royal_rations" ? 2 : 1);
    toast(food === "royal_rations" ? lines.fed : lines.short);
    return;
  }
  toast(lines.fed);
}

export function createDaomenOutpost(opts) {
  var active = false;
  var saved = null;
  var group = null;
  var place = opts.place;

  function buildRoom() {
    group = new THREE.Group();
    group.name = "daomen-outpost";
    var wall = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.8, metalness: 0.2 });
    var copper = new THREE.MeshStandardMaterial({
      color: 0x8a4a28,
      roughness: 0.4,
      metalness: 0.75,
      emissive: 0xff5a18,
      emissiveIntensity: 0.35,
    });
    function box(w, h, d, x, y, z, mat, collide) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      group.add(mesh);
      if (collide) {
        opts.colliders.push({
          minX: x - w * 0.5,
          maxX: x + w * 0.5,
          minZ: z - d * 0.5,
          maxZ: z + d * 0.5,
        });
      }
      return mesh;
    }
    function pick(x, y, z, kind) {
      var mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.4, 0.8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      mesh.position.set(x, y, z);
      mesh.userData.brInteract = { kind: kind };
      group.add(mesh);
      opts.interactRoots.push(mesh);
    }
    box(6, 0.12, 6, 0, 0.06, 0, wall, false);
    box(0.2, 3, 6, -3, 1.5, 0, wall, true);
    box(0.2, 3, 6, 3, 1.5, 0, wall, true);
    box(6, 0.2, 0.2, 0, 1.5, -3, wall, true);
    box(6, 3, 0.2, 0, 1.5, 3, wall, true);
    box(0.9, 1.1, 0.9, 0, 0.55, -1.2, copper, false);
    var light = new THREE.PointLight(0xff6a2a, 2.2, 8, 2);
    light.position.set(0, 1.6, -1.2);
    group.add(light);
    var keeper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1.35, 8),
      new THREE.MeshStandardMaterial({ color: place === "l13" ? 0x8d2e16 : 0x5c4030, roughness: 0.7 })
    );
    keeper.position.set(1.6, 0.7, 0.2);
    group.add(keeper);
    pick(0, 1, -1.2, "daomen_furnace");
    pick(1.6, 1, 0.2, "daomen_keeper");
    pick(0, 1.2, 2.4, "daomen_exit");
    opts.scene.add(group);
  }

  function enter() {
    if (active) return;
    var host = opts.getHostRoot();
    saved = {
      x: opts.fps.player.x,
      z: opts.fps.player.z,
      yaw: opts.fps.yaw,
      feetY: opts.fps.feetY,
      colliders: opts.colliders.slice(),
      interacts: opts.interactRoots.slice(),
      host: host,
    };
    opts.colliders.length = 0;
    opts.interactRoots.length = 0;
    if (host && host.parent) host.parent.remove(host);
    buildRoom();
    opts.fps.player.x = 0;
    opts.fps.player.z = 1.5;
    opts.fps.feetY = 0;
    opts.fps.velY = 0;
    opts.fps.yaw = 0;
    active = true;
  }

  function leaveRoom() {
    if (!active || !saved) return;
    if (group) {
      group.traverse(function (node) {
        if (node.geometry) node.geometry.dispose();
        if (node.material && node.material.dispose) node.material.dispose();
      });
      if (group.parent) group.parent.remove(group);
    }
    group = null;
    opts.colliders.length = 0;
    var i;
    for (i = 0; i < saved.colliders.length; i++) opts.colliders.push(saved.colliders[i]);
    opts.interactRoots.length = 0;
    for (i = 0; i < saved.interacts.length; i++) opts.interactRoots.push(saved.interacts[i]);
    if (saved.host) opts.scene.add(saved.host);
    opts.fps.player.x = saved.x;
    opts.fps.player.z = saved.z;
    opts.fps.yaw = saved.yaw;
    opts.fps.feetY = saved.feetY || 0;
    opts.fps.velY = 0;
    active = false;
    saved = null;
  }

  function enterLevel() {
    var survival = opts.getSurvival ? opts.getSurvival() : null;
    if (survival) saveBackroomsSurvival(survival);
    grantLevelPass("c1166", opts.fps.yaw);
    queueEnterLevelBanner("Level C-1166 · 兜率天");
    window.location.href = "backrooms-level-c1166.html";
  }

  function interact(data) {
    if (!data) return false;
    if (data.kind === DAOMEN_DOOR_KIND) {
      enter();
      return true;
    }
    if (!active) return false;
    if (data.kind === "daomen_exit") {
      leaveRoom();
      return true;
    }
    if (data.kind === "daomen_furnace") {
      enterLevel();
      return true;
    }
    if (data.kind === "daomen_keeper") {
      trade(place, opts.showToast || function () {});
      return true;
    }
    return false;
  }

  return {
    interact: interact,
    isActive: function () {
      return active;
    },
    hint: daomenHint,
  };
}

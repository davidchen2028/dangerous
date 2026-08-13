/**
 * Backrooms Level C-144 — 和爱社区
 * 400×400 城区、外围郊区、友善肢团与北侧巨型山洞。
 */
import * as THREE from "three";
import { BackroomsSurvival, registerBackroomsInventoryUseHandlers } from "./backrooms-survival.js";
import {
  loadBackroomsSurvival,
  registerBackroomsSurvivalPersist,
  saveBackroomsSurvival,
} from "./backrooms-survival-persist.js";
import { toggleBackpack, isInventoryOpen, setInventoryOpenHandler } from "./backrooms-inventory.js";
import { updateMegPointsDisplay } from "./backrooms-meg-points.js";
import {
  initBackroomsTemperature,
  updateBackroomsTemperature,
  updateBackroomsHeatDamage,
} from "./backrooms-temperature.js";
import { pickCrosshairInteract } from "./backrooms-interact-aim.js";
import {
  showEnterLevelBannerIfQueued,
  queueEnterLevelNumber,
} from "./backrooms-level-enter.js";
import {
  enforceLevelEntry,
  refreshLevelPass,
  grantLevelPass,
} from "./backrooms-level-pass.js";
import {
  resolveBackroomsGfxProfile,
  applyBackroomsRendererSize,
  applyBackroomsToneMapping,
} from "./backrooms-gfx-profile.js";
import {
  createBackroomsFpsState,
  moveBackroomsPlayer,
  updateBackroomsPlayerPhysics,
  tryBackroomsJump,
  isBackroomsPlayerMoving,
  isBackroomsSprintHeld,
  resolveBackroomsMoveCollisions,
  bindBackroomsFpsControls,
  bindBackroomsWindowResize,
  applyBackroomsCamera,
  showBackroomsLootToast,
  DEFAULT_LOOK_SENS,
  DEFAULT_GRAVITY,
} from "./backrooms-fps-controller.js";
import { buildClumpFigure } from "./backrooms-clump.js";
import { createClumpsAt } from "./backrooms-clump-ai.js";

const CITY_HALF = 200;
const WORLD_HALF = 360;
const SPAWN_X = 0;
const SPAWN_Z = 245;
const EYE_HEIGHT = 1.65;
const AIM_MAX = 4.6;
const NIGHT_DONE_KEY = "backrooms_c144_night_done_v1";
const BUILDING_COLLAPSE_INTERVAL_MS = 20000;
const MUTANT_ACTIVE_MS = 120000;
const MUTANT_REST_MS = 30000;
const FRIENDLY_LINES = [
  "这里真好。风很轻，街道也很安静。",
  "大家都在这里生活。Level 11 的效应让我们不再想伤害任何人。",
  "和爱社区欢迎你。这里比外面的走廊舒服多了。",
  "今晚的天空会很好看。你应该留下来。",
  "我们已经很久没有见到新的客人了。",
];

const canvas = document.getElementById("backroomsCanvas");
const inputEl = document.getElementById("backroomsInput");
const hintEl = document.getElementById("backroomsHint");
const interactHintEl = document.getElementById("backroomsInteractHint");
const errorEl = document.getElementById("backroomsError");
const megPointsEl = document.getElementById("backroomsMegPoints");
const tempRootEl = document.getElementById("backroomsTemp");
const tempFillEl = document.getElementById("backroomsTempFill");
const tempValueEl = document.getElementById("backroomsTempValue");
const crosshairEl = document.getElementById("backroomsCrosshair");
const dialogueEl = document.getElementById("backroomsC144Dialogue");
const dialogueTextEl = document.getElementById("backroomsC144DialogueText");
const dialogueChoicesEl = document.getElementById("backroomsC144DialogueChoices");
const nightEl = document.getElementById("backroomsC144Night");
const nightTextEl = document.getElementById("backroomsC144NightText");

const fps = createBackroomsFpsState({
  player: { x: SPAWN_X, z: SPAWN_Z, radius: 0.34, speed: 4.2 },
});
const colliders = [];
const interactRoots = [];
const friendlyClumps = [];
const cityBuildings = [];
const _survCtx = { sprinting: false };
const _physOpts = { gravity: DEFAULT_GRAVITY, ceilingY: 120 };

let renderer = null;
let scene = null;
let camera = null;
let survival = null;
let hostileClumps = null;
let currentAimPick = null;
let dialogueOpen = false;
let cutsceneActive = false;
let cutsceneStage = 0;
let cutsceneStageAt = 0;
let cutsceneCamera = false;
let explosionRoot = null;
let explosionCloud = null;
let explosionCore = null;
let explosionRing = null;
let explosionT = 0;
let gateBarrier = null;
let gateCollider = null;
let collapseNextAt = Infinity;
let mutantCycleStartedAt = 0;
let mutantsResting = false;
let transitionLock = false;

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function addBox(root, w, h, d, x, y, z, mat, collide) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  if (collide) {
    colliders.push(wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5));
  }
  return mesh;
}

function showToast(text) {
  showBackroomsLootToast(text, { durationMs: 2800 });
}

function showError(text) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML =
    "<p><strong>Level C-144 无法启动</strong></p><p>" + String(text) + "</p>";
}

function seededRandom(seed) {
  var n = seed | 0;
  return function () {
    n = (n + 0x6d2b79f5) | 0;
    var t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTerrain(root) {
  var suburbMat = new THREE.MeshStandardMaterial({ color: 0x6f8057, roughness: 1 });
  var cityMat = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.95 });
  addBox(root, WORLD_HALF * 2, 0.2, WORLD_HALF * 2, 0, -0.1, 0, suburbMat, false);
  addBox(root, CITY_HALF * 2, 0.06, CITY_HALF * 2, 0, 0.03, 0, cityMat, false);
  var roadMat = new THREE.MeshStandardMaterial({ color: 0x25292d, roughness: 0.88 });
  var stripeMat = new THREE.MeshBasicMaterial({ color: 0xdacb8c });
  var p;
  for (p = -180; p <= 180; p += 40) {
    addBox(root, 10, 0.035, 400, p, 0.08, 0, roadMat, false);
    addBox(root, 400, 0.035, 10, 0, 0.085, p, roadMat, false);
    addBox(root, 0.14, 0.01, 400, p, 0.105, 0, stripeMat, false);
    addBox(root, 400, 0.01, 0.14, 0, 0.11, p, stripeMat, false);
  }
}

function buildCity(root) {
  var rng = seededRandom(14411);
  var colors = [0xa9a59c, 0x8e969c, 0xb1a38f, 0x929c8d, 0x9a8e91];
  var gx;
  var gz;
  for (gx = -180; gx <= 180; gx += 40) {
    for (gz = -180; gz <= 180; gz += 40) {
      if (Math.abs(gx) < 22 && Math.abs(gz) < 22) continue;
      var w = 21 + rng() * 7;
      var d = 21 + rng() * 7;
      var h = 13 + rng() * 34;
      var x = gx + 20 + (rng() - 0.5) * 3;
      var z = gz + 20 + (rng() - 0.5) * 3;
      var mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(rng() * colors.length)],
        roughness: 0.86,
      });
      var building = new THREE.Group();
      building.name = "C144Building";
      building.position.set(x, 0, z);
      root.add(building);
      addBox(building, w, h, d, 0, h * 0.5, 0, mat, false);
      var roof = new THREE.MeshStandardMaterial({ color: 0x44484c, roughness: 0.9 });
      addBox(building, w * 0.92, 0.5, d * 0.92, 0, h + 0.25, 0, roof, false);
      var windowMat = new THREE.MeshBasicMaterial({
        color: rng() > 0.35 ? 0xc8d7b0 : 0x44505c,
      });
      var wy;
      for (wy = 3; wy < h - 1; wy += 3.2) {
        addBox(building, w * 0.62, 0.75, 0.06, 0, wy, d * 0.5 + 0.035, windowMat, false);
      }
      var collider = wallCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5);
      colliders.push(collider);
      cityBuildings.push({
        group: building,
        collider: collider,
        height: h,
        collapsing: false,
        collapsed: false,
        progress: 0,
        fallX: rng() > 0.5 ? 1 : -1,
        fallZ: rng() > 0.5 ? 1 : -1,
      });
    }
  }
  var plazaMat = new THREE.MeshStandardMaterial({ color: 0xb6b1a5, roughness: 0.9 });
  addBox(root, 34, 0.07, 34, 0, 0.08, 0, plazaMat, false);
}

function buildSuburbs(root) {
  var rng = seededRandom(9144);
  var houseMats = [
    new THREE.MeshStandardMaterial({ color: 0xc7b69d, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0xaeb8aa, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0xbda6a2, roughness: 0.92 }),
  ];
  var roofMat = new THREE.MeshStandardMaterial({ color: 0x53473f, roughness: 0.95 });
  var i;
  for (i = 0; i < 72; i++) {
    var side = i % 4;
    var x;
    var z;
    if (side < 2) {
      x = (side === 0 ? -1 : 1) * (225 + rng() * 105);
      z = -310 + rng() * 620;
    } else {
      x = -310 + rng() * 620;
      z = (side === 2 ? -1 : 1) * (225 + rng() * 105);
    }
    if (z < -245 && Math.abs(x) < 92) continue;
    var h = 5 + rng() * 3;
    addBox(root, 10, h, 8, x, h * 0.5, z, houseMats[i % houseMats.length], true);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 3.3, 4), roofMat);
    roof.position.set(x, h + 1.65, z);
    roof.rotation.y = Math.PI * 0.25;
    root.add(roof);
  }
  var treeMat = new THREE.MeshStandardMaterial({ color: 0x42563d, roughness: 1 });
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x554536, roughness: 1 });
  for (i = 0; i < 110; i++) {
    var tx = -340 + rng() * 680;
    var tz = -340 + rng() * 680;
    if (Math.abs(tx) < 210 && Math.abs(tz) < 210) continue;
    if (tz < -250 && Math.abs(tx) < 95) continue;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 5, 7), trunkMat);
    trunk.position.set(tx, 2.5, tz);
    root.add(trunk);
    var crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 8, 8), treeMat);
    crown.position.set(tx, 8, tz);
    root.add(crown);
  }
}

function buildCave(root) {
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x343333, roughness: 1 });
  var darkMat = new THREE.MeshBasicMaterial({ color: 0x030304 });
  var caveZ = -307;
  var i;
  for (i = -8; i <= 8; i++) {
    var a = (i / 8) * Math.PI;
    var x = Math.cos(a) * 74;
    var y = 8 + Math.sin(a) * 64;
    var rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(15 + (i % 3 + 2) * 2, 0),
      rockMat
    );
    rock.position.set(x, y, caveZ);
    rock.scale.set(1.4, 1.2, 2.2);
    root.add(rock);
  }
  addBox(root, 112, 72, 30, -82, 36, caveZ + 4, rockMat, true);
  addBox(root, 112, 72, 30, 82, 36, caveZ + 4, rockMat, true);
  var mouth = new THREE.Mesh(new THREE.PlaneGeometry(125, 78), darkMat);
  mouth.position.set(0, 35, caveZ + 18.5);
  root.add(mouth);
  gateBarrier = addBox(
    root,
    122,
    22,
    3,
    0,
    11,
    caveZ + 20,
    new THREE.MeshStandardMaterial({
      color: 0x18191a,
      transparent: true,
      opacity: 0.7,
      roughness: 1,
    }),
    false
  );
  gateBarrier.name = "C144NightGate";
  gateCollider = wallCollider(-61, 61, caveZ + 18.5, caveZ + 21.5);
  colliders.push(gateCollider);
}

function spawnFriendlyClumps(root) {
  var positions = [
    [-5.2, 238],
    [5.4, 239],
    [-8.5, 247],
    [8.4, 248],
    [0, 241],
  ];
  var i;
  for (i = 0; i < positions.length; i++) {
    var figure = buildClumpFigure({ scale: 0.92, seed: 200 + i * 19 });
    var group = figure.group;
    group.position.set(positions[i][0], 0, positions[i][1]);
    group.rotation.y = Math.atan2(SPAWN_X - positions[i][0], SPAWN_Z - positions[i][1]);
    group.name = "FriendlyC144Clump" + i;
    root.add(group);
    var pick = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 10, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.y = 0.8;
    pick.userData.brInteract = { kind: "c144_friendly_clump", index: i };
    group.add(pick);
    interactRoots.push(pick);
    friendlyClumps.push({ figure: figure, group: group, pick: pick, t: i * 0.7 });
  }
}

function spawnHostileClumps(root) {
  var spawns = [];
  var i;
  for (i = 0; i < 30; i++) {
    var row = Math.floor(i / 10);
    var col = i % 10;
    spawns.push({
      x: -54 + col * 12 + (row % 2) * 4,
      z: -262 - row * 10,
      rotY: Math.PI,
      seed: 700 + i * 23,
    });
  }
  hostileClumps = createClumpsAt(root, spawns, colliders, {
    maxHp: 300,
    damage: 90,
    cooldown: 10,
    scale: 1.25,
    kind: "mutant_clump",
    name: "变异肢团",
  });
}

function makeSmokeTexture() {
  var c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  var ctx = c.getContext("2d");
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

function buildExplosion(root) {
  explosionRoot = new THREE.Group();
  explosionRoot.visible = false;
  root.add(explosionRoot);

  var tex = makeSmokeTexture();
  var TOP_Y = 150; // 颜色渐变参考高度
  // 颜色按高度：底部橙红 #ff5a1a → 中部暖黄 #ffb04a → 顶部灰白 #d2d2d2
  function pushColor(positions, colors, x, y, z) {
    var t = Math.min(1, Math.max(0, y / TOP_Y));
    var r, g, b;
    if (t < 0.5) {
      var k = t / 0.5;
      r = 255;
      g = 90 + k * 86;
      b = 26 + k * 48;
    } else {
      var k = (t - 0.5) / 0.5;
      r = 255 - k * 43;
      g = 176 + k * 34;
      b = 74 + k * 138;
    }
    positions.push(x, y, z);
    colors.push(r / 255, g / 255, b / 255);
  }

  var positions = [];
  var colors = [];

  // 蘑菇头：扁椭球内随机分布粒子，形成蓬松云头
  var headR = 44;
  var headY = 116;
  var headCount = 2600;
  var i, x, y, z, len;
  for (i = 0; i < headCount; i++) {
    do {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      len = Math.sqrt(x * x + y * y + z * z);
    } while (len > 1);
    pushColor(positions, colors, x * headR, headY + y * headR * 0.78, z * headR);
  }

  // 翻卷裙边：头部下沿外缘粒子向外、向下垂，形成蘑菇伞下卷
  var skirtCount = 1000;
  for (i = 0; i < skirtCount; i++) {
    var a = Math.random() * Math.PI * 2;
    var rr = headR * (0.7 + Math.random() * 0.45);
    var drop = Math.random() * headR * 0.75;
    pushColor(positions, colors, Math.cos(a) * rr, headY - drop, Math.sin(a) * rr);
  }

  // 茎：圆柱内粒子，由地面向头部收拢
  var stemR = 7;
  var stemTop = 100;
  var stemCount = 1700;
  for (i = 0; i < stemCount; i++) {
    var aa = Math.random() * Math.PI * 2;
    var rad = Math.sqrt(Math.random()) * stemR;
    var yy = Math.random() * stemTop;
    pushColor(positions, colors, Math.cos(aa) * rad, yy, Math.sin(aa) * rad);
  }

  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  explosionCloud = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 13,
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  explosionRoot.add(explosionCloud);

  // 爆心火球：茎底短促亮闪
  explosionCore = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xff6b22,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  explosionCore.position.y = 8;
  explosionRoot.add(explosionCore);

  // 地面冲击波环
  explosionRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.09, 10, 54),
    new THREE.MeshBasicMaterial({
      color: 0xff6b22,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  explosionRing.rotation.x = Math.PI * 0.5;
  explosionRing.position.y = 2;
  explosionRoot.add(explosionRing);
}

function buildWorld(root) {
  buildTerrain(root);
  buildCity(root);
  buildSuburbs(root);
  buildCave(root);
  spawnFriendlyClumps(root);
  spawnHostileClumps(root);
  buildExplosion(root);
  var boundary = 8;
  colliders.push(wallCollider(-WORLD_HALF - boundary, WORLD_HALF + boundary, -WORLD_HALF - boundary, -WORLD_HALF));
  colliders.push(wallCollider(-WORLD_HALF - boundary, WORLD_HALF + boundary, WORLD_HALF, WORLD_HALF + boundary));
  colliders.push(wallCollider(-WORLD_HALF - boundary, -WORLD_HALF, -WORLD_HALF, WORLD_HALF));
  colliders.push(wallCollider(WORLD_HALF, WORLD_HALF + boundary, -WORLD_HALF, WORLD_HALF));
  root.add(new THREE.HemisphereLight(0xd8e7ff, 0x556047, 1.15));
  var sun = new THREE.DirectionalLight(0xffe7c2, 1.2);
  sun.position.set(110, 190, 80);
  root.add(sun);
}

function hasSpentNight() {
  try {
    return sessionStorage.getItem(NIGHT_DONE_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function openNightGate() {
  if (!gateBarrier) return;
  var index = colliders.indexOf(gateCollider);
  if (index >= 0) colliders.splice(index, 1);
  gateBarrier.visible = false;
  gateBarrier = null;
  gateCollider = null;
}

function removeFriendlyClumps() {
  var i;
  for (i = 0; i < friendlyClumps.length; i++) {
    var friendly = friendlyClumps[i];
    friendly.group.visible = false;
    var pickIndex = interactRoots.indexOf(friendly.pick);
    if (pickIndex >= 0) interactRoots.splice(pickIndex, 1);
  }
  currentAimPick = null;
}

function collapseRandomBuilding(now) {
  var available = [];
  var i;
  for (i = 0; i < cityBuildings.length; i++) {
    if (!cityBuildings[i].collapsing && !cityBuildings[i].collapsed) {
      available.push(cityBuildings[i]);
    }
  }
  if (!available.length) {
    collapseNextAt = Infinity;
    return;
  }
  var building = available[Math.floor(Math.random() * available.length)];
  building.collapsing = true;
  building.progress = 0;
  var colliderIndex = colliders.indexOf(building.collider);
  if (colliderIndex >= 0) colliders.splice(colliderIndex, 1);
  collapseNextAt = now + BUILDING_COLLAPSE_INTERVAL_MS;
  showToast("远处传来巨响——又有一栋房子塌了。");
}

function updateBuildingCollapse(now, dt) {
  if (!hasSpentNight()) return;
  if (now >= collapseNextAt) collapseRandomBuilding(now);
  var i;
  for (i = 0; i < cityBuildings.length; i++) {
    var building = cityBuildings[i];
    if (!building.collapsing || building.collapsed) continue;
    building.progress = Math.min(1, building.progress + dt * 0.16);
    var eased = building.progress * building.progress * (3 - 2 * building.progress);
    building.group.rotation.x = building.fallX * eased * 0.38;
    building.group.rotation.z = building.fallZ * eased * 0.5;
    building.group.position.y = -eased * building.height * 0.82;
    if (building.progress >= 1) {
      building.collapsing = false;
      building.collapsed = true;
    }
  }
}

function setMutantsResting(resting) {
  if (mutantsResting === resting || !hostileClumps) return;
  mutantsResting = resting;
  var i;
  if (!resting) {
    for (i = 0; i < hostileClumps.clumps.length; i++) {
      var clump = hostileClumps.clumps[i];
      if (clump.dead) continue;
      clump.x = clump.homeX;
      clump.z = clump.homeZ;
      clump.group.position.set(clump.homeX, 0, clump.homeZ);
      clump.mode = "idle";
      clump.lungeLeft = 0;
      clump.cooldown = 0;
      clump.group.scale.setScalar(1);
    }
    showToast("山洞深处传来爬行声——变异肢团结束了休息。");
  } else {
    showToast("变异肢团正在退回山洞休息，持续 30 秒。");
  }
}

function updateMutantRest(now, dt) {
  if (!hasSpentNight() || !hostileClumps) return;
  if (!mutantCycleStartedAt) mutantCycleStartedAt = now;
  var cycle = MUTANT_ACTIVE_MS + MUTANT_REST_MS;
  var elapsed = (now - mutantCycleStartedAt) % cycle;
  setMutantsResting(elapsed >= MUTANT_ACTIVE_MS);
  var i;
  if (mutantsResting) {
    for (i = 0; i < hostileClumps.clumps.length; i++) {
      var clump = hostileClumps.clumps[i];
      if (clump.dead) continue;
      var row = Math.floor(i / 10);
      var col = i % 10;
      var targetX = -27 + col * 6;
      var targetZ = -324 - row * 7;
      var move = Math.min(1, dt * 1.15);
      clump.x += (targetX - clump.x) * move;
      clump.z += (targetZ - clump.z) * move;
      clump.group.position.x = clump.x;
      clump.group.position.z = clump.z;
      clump.animT += dt;
      clump.figure.update(clump.animT);
    }
  }
}

function isInsideCaveExit() {
  // 山洞口前沿；玩家一碰到洞口便立即切入 C-192。
  return Math.abs(fps.player.x) < 61 && fps.player.z < -285;
}

function exitToLevelC192() {
  if (transitionLock) return;
  transitionLock = true;
  saveBackroomsSurvival(survival);
  grantLevelPass("c192", fps.yaw);
  queueEnterLevelNumber("C-192");
  showToast("你碰到了山洞——四周的景象瞬间改变…");
  window.location.href = "backrooms-level-c192.html";
}

function refreshAimPick() {
  if (
    !camera ||
    dialogueOpen ||
    cutsceneActive ||
    transitionLock ||
    isInventoryOpen() ||
    !survival ||
    survival.dead
  ) {
    currentAimPick = null;
    return;
  }
  currentAimPick = pickCrosshairInteract(camera, interactRoots, AIM_MAX);
}

function resolveInteract() {
  return currentAimPick && currentAimPick.distance <= AIM_MAX
    ? currentAimPick.data
    : null;
}

function updateInteractUi() {
  var data = resolveInteract();
  var hidden =
    dialogueOpen ||
    cutsceneActive ||
    isInventoryOpen() ||
    !survival ||
    survival.dead ||
    !data;
  if (interactHintEl) {
    interactHintEl.hidden = hidden;
    if (!hidden) {
      interactHintEl.innerHTML = "按 <kbd>Q</kbd> 与肢团交流";
    }
  }
  if (crosshairEl) {
    crosshairEl.classList.toggle(
      "backrooms-crosshair--hidden",
      dialogueOpen || cutsceneActive || isInventoryOpen() || !survival || survival.dead
    );
    crosshairEl.classList.toggle("backrooms-crosshair--interact", !hidden);
  }
}

function openFriendlyDialogue(index) {
  dialogueOpen = true;
  dialogueEl.hidden = false;
  dialogueTextEl.textContent =
    FRIENDLY_LINES[index % FRIENDLY_LINES.length] + " 要不要在这里住一晚？";
  dialogueChoicesEl.innerHTML =
    "<kbd>A</kbd> 要　　<kbd>B</kbd> 不要";
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function closeDialogue() {
  dialogueOpen = false;
  dialogueEl.hidden = true;
  currentAimPick = null;
}

function refuseNight() {
  dialogueTextEl.textContent = "必须得度过一晚，出口才会开放。";
  dialogueChoicesEl.textContent = "";
  window.setTimeout(closeDialogue, 1800);
}

function beginNightSequence() {
  closeDialogue();
  cutsceneActive = true;
  cutsceneStage = 0;
  cutsceneStageAt = performance.now();
  nightTextEl.textContent = "美好时光啊······";
  nightEl.hidden = false;
  document.body.classList.add("backrooms-c144-cutscene");
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}

function finishNightSequence() {
  cutsceneActive = false;
  cutsceneCamera = false;
  nightEl.hidden = true;
  document.body.classList.remove("backrooms-c144-cutscene");
  if (explosionRoot) explosionRoot.visible = false;
  try {
    sessionStorage.setItem(NIGHT_DONE_KEY, "1");
  } catch (err) {
    /* ignore */
  }
  openNightGate();
  removeFriendlyClumps();
  collapseNextAt = performance.now() + BUILDING_COLLAPSE_INTERVAL_MS;
  mutantCycleStartedAt = performance.now();
  showToast("天亮了。山洞的出口已经开放。");
  saveBackroomsSurvival(survival);
}

function updateNightSequence(now, dt) {
  if (!cutsceneActive) return;
  var elapsed = now - cutsceneStageAt;
  if (cutsceneStage === 0 && elapsed >= 5000) {
    cutsceneStage = 1;
    cutsceneStageAt = now;
    nightTextEl.textContent = "只在昨日。";
    return;
  }
  if (cutsceneStage === 1 && elapsed >= 5000) {
    cutsceneStage = 2;
    cutsceneStageAt = now;
    nightEl.hidden = true;
    cutsceneCamera = true;
    explosionT = 0;
    explosionRoot.visible = true;
    return;
  }
  if (cutsceneStage === 2) {
    explosionT += dt;
    var progress = Math.min(1, explosionT / 4.2);
    var ease = progress * progress * (3 - 2 * progress);
    // 蘑菇云烟团：从地面冒出，整体放大并略上浮，后期渐淡
    var cloudScale = 0.25 + ease * 0.95;
    explosionCloud.scale.setScalar(cloudScale);
    explosionCloud.position.y = ease * 8;
    explosionCloud.material.opacity = 0.85 * (1 - progress * 0.5);
    // 爆心火球：前 1.2s 快速膨胀并消散（引燃瞬间）
    var coreP = Math.min(1, explosionT / 1.2);
    explosionCore.scale.setScalar(6 + coreP * 34);
    explosionCore.material.opacity = 0.95 * (1 - coreP);
    // 地面冲击波环
    var ringR = 3 + progress * 197;
    explosionRing.scale.setScalar(ringR);
    explosionRing.material.opacity = 0.92 * (1 - progress);
    if (elapsed >= 6000) finishNightSequence();
  }
}

function tryQAction() {
  if (dialogueOpen || cutsceneActive || isInventoryOpen() || !survival || survival.dead) return;
  var data = resolveInteract();
  if (data && data.kind === "c144_friendly_clump") {
    openFriendlyDialogue(data.index || 0);
  }
}

function handleDialogueChoice(code) {
  if (!dialogueOpen) return false;
  if (code === "KeyA") {
    beginNightSequence();
    return true;
  }
  if (code === "KeyB") {
    refuseNight();
    return true;
  }
  return false;
}

function respawnAtCommunitySpawn(reason) {
  survival.resetStats();
  fps.player.x = SPAWN_X;
  fps.player.z = SPAWN_Z;
  fps.feetY = 0;
  fps.velY = 0;
  fps.grounded = true;
  fps.yaw = Math.PI;
  fps.pitch = 0;
  refreshLevelPass("c144", fps.yaw);
  saveBackroomsSurvival(survival);
  showToast(reason === "sanity" ? "你在社区出生点恢复了意识。" : "你在社区出生点重生了。");
}

function installLocalRespawn() {
  survival.onPrepareDeath = function (reason) {
    if (!survival.deathEl) return;
    var msg = survival.deathEl.querySelector("[data-death-msg]");
    if (msg) {
      msg.textContent =
        reason === "sanity"
          ? "精神崩溃 — 即将在社区出生点醒来…"
          : "你已死亡 — 即将在社区出生点重生…";
    }
  };
  survival.onDeath = respawnAtCommunitySpawn;
}

function bindControls() {
  bindBackroomsFpsControls({
    canvas: canvas,
    inputEl: inputEl,
    state: fps,
    lookSens: DEFAULT_LOOK_SENS,
    shouldBlockPointerLock: function () {
      return isInventoryOpen() || dialogueOpen || cutsceneActive;
    },
    onJump: function () {
      if (!cutsceneActive && !dialogueOpen) tryBackroomsJump(fps, 8);
    },
    onKeyDown: function (event) {
      if (!event.repeat && handleDialogueChoice(event.code)) {
        event.preventDefault();
        return true;
      }
      if (event.code === "KeyQ" && !event.repeat) {
        event.preventDefault();
        tryQAction();
        return true;
      }
      if (event.code === "KeyB" && !event.repeat && !dialogueOpen && !cutsceneActive) {
        event.preventDefault();
        toggleBackpack();
        return true;
      }
      return false;
    },
  });
  bindBackroomsWindowResize(renderer, camera);
}

function applyCamera() {
  if (cutsceneCamera) {
    // 正面远距离视角：从城区外侧仰视蘑菇云升起
    camera.position.set(0, 85, 460);
    camera.rotation.order = "YXZ";
    camera.lookAt(0, 65, 0);
    return;
  }
  applyBackroomsCamera(fps, camera, EYE_HEIGHT);
}

function init() {
  if (!enforceLevelEntry("c144", function (yaw) { fps.yaw = yaw; })) {
    window.location.replace("backrooms-level0.html");
    return;
  }
  showEnterLevelBannerIfQueued();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9aa7ae);
  scene.fog = new THREE.Fog(0x9aa7ae, 150, 610);
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 900);
  var gfx = resolveBackroomsGfxProfile();
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: gfx.antialias });
  applyBackroomsRendererSize(renderer, window.innerWidth, window.innerHeight, gfx);
  applyBackroomsToneMapping(renderer);
  var root = new THREE.Group();
  root.name = "BackroomsLevelC144";
  scene.add(root);
  buildWorld(root);
  if (hasSpentNight()) {
    openNightGate();
    removeFriendlyClumps();
    collapseNextAt = performance.now() + BUILDING_COLLAPSE_INTERVAL_MS;
    mutantCycleStartedAt = performance.now();
  }

  survival = new BackroomsSurvival();
  survival.mountHud(document.querySelector(".backrooms-hud") || document.body);
  loadBackroomsSurvival(survival);
  registerBackroomsSurvivalPersist(survival);
  installLocalRespawn();
  setInventoryOpenHandler(function (open) {
    if (open && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  });
  registerBackroomsInventoryUseHandlers(survival, {
    onAlmondWaterUsed: function () {
      showToast("杏仁水 · +15 血量 · +25 理智");
    },
  });
  initBackroomsTemperature("c144", {
    rootEl: tempRootEl,
    fillEl: tempFillEl,
    valueEl: tempValueEl,
  });
  updateMegPointsDisplay(megPointsEl);
  hintEl.innerHTML =
    "Level C-144 · 和爱社区 · <kbd>Q</kbd> 交流 · <kbd>WASD</kbd> 移动 · <kbd>B</kbd> 背包";
  bindControls();

  var clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    var dt = Math.min(clock.getDelta(), 0.05);
    var moving = isBackroomsPlayerMoving(fps);
    var sprinting = isBackroomsSprintHeld(fps) && moving;
    updateNightSequence(now, dt);
    if (survival && !survival.dead && !cutsceneActive) {
      _survCtx.sprinting = sprinting;
      survival.update(dt, _survCtx);
    }
    if (!cutsceneActive) updateBackroomsPlayerPhysics(fps, dt, _physOpts);
    if (
      !cutsceneActive &&
      !dialogueOpen &&
      !transitionLock &&
      (!survival || !survival.dead) &&
      !isInventoryOpen()
    ) {
      var mul =
        survival && sprinting
          ? survival.getSprintSpeedMul(fps.player.speed, sprinting, moving)
          : 1;
      moveBackroomsPlayer(fps, dt, mul, function (nx, nz) {
        return resolveBackroomsMoveCollisions(nx, nz, fps.player.radius, colliders, 18);
      });
    }
    var i;
    for (i = 0; i < friendlyClumps.length; i++) {
      if (!friendlyClumps[i].group.visible) continue;
      friendlyClumps[i].t += dt;
      friendlyClumps[i].figure.update(friendlyClumps[i].t);
    }
    updateBuildingCollapse(now, dt);
    updateMutantRest(now, dt);
    if (hostileClumps && !cutsceneActive && !mutantsResting) {
      hostileClumps.update(
        dt,
        fps.player.x,
        fps.player.z,
        survival,
        showToast,
        { playerSafe: dialogueOpen }
      );
    }
    if (isInsideCaveExit()) exitToLevelC192();
    applyCamera();
    refreshAimPick();
    updateInteractUi();
    updateBackroomsTemperature(dt, now);
    updateBackroomsHeatDamage(survival, now);
    renderer.render(scene, camera);
  }
  frame();
}

try {
  init();
} catch (err) {
  console.error("[Backrooms C-144]", err);
  showError(err.message || String(err));
}

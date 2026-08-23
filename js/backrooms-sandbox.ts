// @ts-nocheck
/**
 * Backrooms - 沙盒
 * Three.js + TypeScript 单页开放世界原型。
 *
 * 构建后 Three.js 与本文件会全部内联进 backrooms-sandbox.html，不依赖网络或外部资源。
 * 仅保留游玩模式：出生于洞穴，Q 开门后沿山坡离开。
 */
import * as THREE from "./vendor/three.module.min.js";
import {
  addItemToBackpack,
  countItem,
  isInventoryOpen,
  mountBackpackPanel,
  resetBackpack,
  setInventoryOpenHandler,
  toggleBackpack,
} from "./backrooms-inventory.js";

type Tool = "raise" | "lower" | "flatten" | "place" | "delete";
type ObjectKind = "tree" | "rock" | "crate" | "ruin";
type MapObject = {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
};
type ChunkRecord = { heights: number[] };
type SandboxMap = {
  version: 1;
  seed: number;
  chunks: Record<string, ChunkRecord>;
  objects: MapObject[];
};

/**
 * 内置地图。地形未修改的区块由 seed 确定性生成；编辑过的区块会完整写入 chunks。
 * “复制地图到代码”会生成可直接替换此常量的 TypeScript/JavaScript 对象字符串。
 */
const BUILTIN_MAP: SandboxMap = {
  version: 1,
  seed: 7319,
  chunks: {},
  objects: [
    { id: 1, kind: "tree", x: 12, y: 0, z: 25, rotation: 0.4, scale: 1.15 },
    { id: 2, kind: "tree", x: 18, y: 0, z: -18, rotation: 1.5, scale: 0.9 },
    { id: 3, kind: "tree", x: -14, y: 0, z: -12, rotation: 2.4, scale: 1.3 },
    { id: 4, kind: "rock", x: -12, y: 0, z: 25, rotation: 0.2, scale: 1.4 },
    { id: 5, kind: "rock", x: 23, y: 0, z: 11, rotation: 2.1, scale: 0.8 },
    { id: 6, kind: "crate", x: 10, y: 0, z: 28, rotation: 0.1, scale: 1 },
    { id: 7, kind: "crate", x: 12, y: 0, z: 29.7, rotation: 0.25, scale: 1 },
    { id: 8, kind: "ruin", x: -25, y: 0, z: 19, rotation: 0.7, scale: 1.1 },
    { id: 9, kind: "tree", x: 36, y: 0, z: -2, rotation: 0.7, scale: 1.2 },
    { id: 10, kind: "rock", x: -35, y: 0, z: -28, rotation: 1.2, scale: 1.7 },
  ],
};

const CHUNK_SIZE = 32;
const CELLS = 16;
const VERTS = CELLS + 1;
const STREAM_RADIUS = 2;
const PLAYER_RADIUS = 0.55;
/** 出生洞穴：架在山丘顶部的高顶矩形洞室，正面（+Z）设升降门 */
const CAVE = {
  halfWidth: 8,
  backZ: -9,
  frontZ: 19,
  height: 10,
  doorHalfWidth: 2.2,
  doorHeight: 6.4,
  /** 洞室地面抬升到的高度，下方由山坡撑起 */
  floorY: 15,
};
/** 洞室外围的平台（山顶）；门前略伸出，只有出口走廊接斜坡 */
const PLATEAU = {
  minX: -CAVE.halfWidth - 2,
  maxX: CAVE.halfWidth + 2,
  minZ: CAVE.backZ - 2,
  maxZ: CAVE.frontZ + 4,
};
/** 仅出口走廊（+Z）的下山斜坡长度 */
const EXIT_SLOPE_LEN = 36;
/** 出口斜坡左右半宽（对齐门洞附近） */
const EXIT_SLOPE_HALF_W = CAVE.doorHalfWidth + 2.8;
/** 其余边缘的悬崖过渡长度（越短越陡） */
const CLIFF_LEN = 2.2;
/** 血量：三颗心 */
const MAX_HP = 3;
/** 绿色升降房屋在斜坡尽头；橙色房屋沿出口方向再远离 60 米。 */
const LIFT_HOUSE = {
  x: 0,
  z: PLATEAU.maxZ + EXIT_SLOPE_LEN + 15,
  halfSize: 5,
  height: 5,
  orangeZOffset: 60,
};
const CHAMBER = {
  x: 500,
  z: 500,
  halfWidth: 25,
  halfDepth: 35,
  height: 14,
  floorY: 0,
  gateZ: 518,
  gateHalfWidth: 3,
};
const BLUE_HOUSE = {
  x: 14,
  z: LIFT_HOUSE.z,
  halfSize: 5,
};
const STASIS_ROOM = {
  x: 800,
  z: 500,
  floorY: 0,
  pitY: -20,
  halfWidth: 25,
  halfDepth: 38,
};
/** 旋转桥全长；平台中心到房间中心的距离（桥端与平台对接）。 */
const STASIS_BRIDGE_LEN = 24;
const STASIS_BRIDGE_HALF = STASIS_BRIDGE_LEN * 0.5;
const STASIS_BRIDGE_HALF_H = 0.25;
const STASIS_PLATFORM_Z = STASIS_BRIDGE_HALF + 7;
/** 地图编辑器已从发布玩法中移除，URL 参数也不能重新开启。 */
const AUTHOR_MODE = false;

const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8e8);
scene.fog = new THREE.Fog(0x8fc8e8, 80, 245);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xdff4ff, 0x55713f, 1.8));
const sun = new THREE.DirectionalLight(0xfff1c7, 2.2);
sun.position.set(-45, 75, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
sun.shadow.camera.right = sun.shadow.camera.top = 70;
scene.add(sun);

const terrainMat = new THREE.MeshStandardMaterial({
  color: 0x75a956,
  roughness: 0.92,
  flatShading: true,
});
const chunksRoot = new THREE.Group();
const objectsRoot = new THREE.Group();
const caveRoot = new THREE.Group();
const mechanismRoot = new THREE.Group();
const chamberRoot = new THREE.Group();
chamberRoot.visible = false;
const stasisRoot = new THREE.Group();
stasisRoot.visible = false;
scene.add(chunksRoot, objectsRoot, caveRoot, mechanismRoot, chamberRoot, stasisRoot);

let worldMap: SandboxMap = structuredClone(BUILTIN_MAP);
let nextObjectId = Math.max(0, ...worldMap.objects.map((o) => o.id)) + 1;
const chunkMeshes = new Map<string, THREE.Mesh>();
const objectMeshes = new Map<number, THREE.Object3D>();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const player = {
  x: 0,
  z: 4,
  y: CAVE.floorY,
  vy: 0,
  yaw: Math.PI,
  pitch: -0.28,
  grounded: true,
  hp: MAX_HP,
  fallFromY: CAVE.floorY,
  dead: false,
};
const keys = new Set<string>();
let mode: "game" | "editor" = "game";
let tool: Tool = "raise";
let objectKind: ObjectKind = "tree";
let brushSize = 5;
let brushStrength = 1.4;
let painting = false;
let flattenHeight = 0;
let editorYaw = 0.72;
let editorPitch = 0.78;
let editorDistance = 45;
const editorTarget = new THREE.Vector3(0, CAVE.floorY, 0);
let caveDoorOpen = false;
let caveDoorOpening = false;
let caveDoorMesh: THREE.Mesh | null = null;
let caveDoorY = CAVE.floorY + CAVE.doorHeight * 0.5;
type LiftHouseState = "grounded" | "raising" | "raised" | "lowering" | "spent";
let liftHouseState: LiftHouseState = "grounded";
let liftHouseBaseY = 0;
let liftHouseGroup: THREE.Group | null = null;
let orangeHouseGroup: THREE.Group | null = null;
let investigationPillar: THREE.Mesh | null = null;
let playerRidingLift = false;
let zone: "overworld" | "chamber" | "stasis" = "overworld";
let hasMagnetSkill = false;
let ironBox: THREE.Mesh | null = null;
let magnetHolding = false;
let chamberButton: THREE.Mesh | null = null;
let chamberDoor: THREE.Mesh | null = null;
let chamberDoorY = 3;
let chamberPedestal: THREE.Mesh | null = null;
let buttonPressed = false;
let passTaken = false;
const chamberRayTargets: THREE.Object3D[] = [];
let blueHouseGroup: THREE.Group | null = null;
let blueHouseFloorY = 0;
let hasStasisSkill = false;
let rotatingBridge: THREE.Mesh | null = null;
let stasisTimer = 0;
let stasisPedestal: THREE.Mesh | null = null;
let secondPassTaken = false;
const enclosureRoot = new THREE.Group();
enclosureRoot.visible = true;
scene.add(enclosureRoot);
let enclosureActive = true;
let oldMan: THREE.Group | null = null;
let cutsceneLock = false;
let oldManCutsceneDone = false;
type OldManCutscene = "idle" | "walking" | "talk1" | "talk2" | "done";
let oldManCutscene: OldManCutscene = "idle";
let oldManTalkTimer = 0;

type FlatCollider = { minX: number; maxX: number; minZ: number; maxZ: number };
const caveColliders: FlatCollider[] = [];
const enclosureColliders: FlatCollider[] = [];
const enclosureWalls: THREE.Mesh[] = [];
let enclosureCollapseState: "idle" | "collapsing" | "done" = "idle";
let enclosureCollapseTimer = 0;
type Debris = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; spin: number };
const enclosureDebris: Debris[] = [];

const ui = {
  panel: document.querySelector<HTMLElement>("#editorPanel")!,
  modeButton: document.querySelector<HTMLButtonElement>("#modeButton")!,
  modeText: document.querySelector<HTMLElement>("#modeText")!,
  tool: document.querySelector<HTMLSelectElement>("#tool")!,
  kind: document.querySelector<HTMLSelectElement>("#objectKind")!,
  size: document.querySelector<HTMLInputElement>("#brushSize")!,
  strength: document.querySelector<HTMLInputElement>("#brushStrength")!,
  sizeValue: document.querySelector<HTMLElement>("#sizeValue")!,
  strengthValue: document.querySelector<HTMLElement>("#strengthValue")!,
  toast: document.querySelector<HTMLElement>("#toast")!,
  importFile: document.querySelector<HTMLInputElement>("#importFile")!,
  crosshair: document.querySelector<HTMLElement>("#crosshair")!,
  help: document.querySelector<HTMLElement>("#helpText")!,
  hearts: Array.from(document.querySelectorAll<HTMLElement>("#hearts .heart")),
  deathScreen: document.querySelector<HTMLElement>("#deathScreen")!,
  respawnButton: document.querySelector<HTMLButtonElement>("#respawnButton")!,
};

function toast(text: string): void {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  clearTimeout((toast as any)._timer);
  (toast as any)._timer = setTimeout(() => ui.toast.classList.remove("show"), 2200);
}

function hash2(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.013) * 43758.5453123;
  return n - Math.floor(n);
}

/** 不含出生山丘的基础地貌 */
function baseLandscapeHeight(wx: number, wz: number): number {
  const broad = Math.sin(wx * 0.025 + worldMap.seed) * 2.8 +
    Math.cos(wz * 0.031 - worldMap.seed * 0.2) * 2.2;
  const detail = (hash2(Math.floor(wx / 8), Math.floor(wz / 8), worldMap.seed) - 0.5) * 1.8;
  return broad + detail;
}

function generatedHeight(wx: number, wz: number): number {
  const base = baseLandscapeHeight(wx, wz);
  // 平台内部完全水平，托住洞室墙体与门槛。
  const outX = Math.max(PLATEAU.minX - wx, 0, wx - PLATEAU.maxX);
  const outZBack = Math.max(PLATEAU.minZ - wz, 0);
  const outZFront = Math.max(wz - PLATEAU.maxZ, 0);
  if (outX <= 0 && outZBack <= 0 && outZFront <= 0) return CAVE.floorY;

  // 仅出口走廊（门前 +Z）是缓坡；左右与后方直接落成悬崖。
  const onExitSlope =
    outZFront > 0 &&
    outX <= 0 &&
    Math.abs(wx) <= EXIT_SLOPE_HALF_W;
  if (onExitSlope) {
    const t = Math.min(1, outZFront / EXIT_SLOPE_LEN);
    const ease = t * t * (3 - 2 * t);
    return CAVE.floorY + (base - CAVE.floorY) * ease;
  }

  // 悬崖：很短距离内掉到谷底高度。
  const outside = Math.max(outX, outZBack, outZFront);
  const t = Math.min(1, outside / CLIFF_LEN);
  const ease = t * t * (3 - 2 * t);
  return CAVE.floorY + (base - CAVE.floorY) * ease;
}

function refreshHearts(): void {
  for (let i = 0; i < ui.hearts.length; i++) {
    ui.hearts[i].classList.toggle("heart--empty", i >= player.hp);
  }
}

function showDeathScreen(): void {
  if (player.dead) return;
  player.dead = true;
  player.vy = 0;
  player.hp = 0;
  refreshHearts();
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.deathScreen.hidden = false;
  // 下一帧再加 show，保证淡入动画生效
  requestAnimationFrame(() => ui.deathScreen.classList.add("show"));
  ui.crosshair.style.opacity = "0";
  ui.help.style.opacity = "0";
}

function hideDeathScreen(): void {
  ui.deathScreen.classList.remove("show");
  ui.deathScreen.hidden = true;
  ui.crosshair.style.opacity = "";
  ui.help.style.opacity = "";
}

function respawnPlayer(): void {
  if (zone === "chamber") leaveChamber();
  if (zone === "stasis") leaveStasisRoom();
  player.x = 0;
  player.z = 4;
  player.y = CAVE.floorY;
  player.vy = 0;
  player.yaw = Math.PI;
  player.pitch = -0.28;
  player.grounded = true;
  player.fallFromY = CAVE.floorY;
  player.hp = MAX_HP;
  player.dead = false;
  refreshHearts();
  hideDeathScreen();
  toast("已在洞内重生");
}

function applyFallDamage(fallDistance: number): void {
  if (player.dead || fallDistance < 10) return;
  let lost = 1;
  if (fallDistance >= 14.5) lost = 2;
  if (fallDistance >= 20) lost = 3;
  player.hp = Math.max(0, player.hp - lost);
  refreshHearts();
  if (player.hp <= 0) {
    showDeathScreen();
    return;
  }
  toast("坠落受伤 · 失去 " + lost + " 颗心");
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function ensureChunkRecord(cx: number, cz: number): ChunkRecord {
  const key = chunkKey(cx, cz);
  if (!worldMap.chunks[key]) {
    const heights: number[] = [];
    for (let z = 0; z < VERTS; z++) {
      for (let x = 0; x < VERTS; x++) {
        heights.push(generatedHeight(cx * CHUNK_SIZE + x * 2, cz * CHUNK_SIZE + z * 2));
      }
    }
    worldMap.chunks[key] = { heights };
  }
  return worldMap.chunks[key];
}

function buildChunk(cx: number, cz: number): THREE.Mesh {
  const record = ensureChunkRecord(cx, cz);
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let z = 0; z < VERTS; z++) {
    for (let x = 0; x < VERTS; x++) {
      const h = record.heights[z * VERTS + x];
      positions.push(x * 2, h, z * 2);
      color.setHSL(0.27 - Math.min(0.07, h * 0.006), 0.35, 0.43 + h * 0.012);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let z = 0; z < CELLS; z++) {
    for (let x = 0; x < CELLS; x++) {
      const a = z * VERTS + x;
      const b = a + 1;
      const c = a + VERTS;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = terrainMat.clone();
  material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  mesh.receiveShadow = true;
  mesh.userData.chunk = { cx, cz };
  return mesh;
}

function rebuildChunk(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  const old = chunkMeshes.get(key);
  if (old) {
    chunksRoot.remove(old);
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
  }
  const mesh = buildChunk(cx, cz);
  chunksRoot.add(mesh);
  chunkMeshes.set(key, mesh);
}

function streamChunks(x: number, z: number): void {
  const ccx = Math.floor(x / CHUNK_SIZE);
  const ccz = Math.floor(z / CHUNK_SIZE);
  const wanted = new Set<string>();
  for (let dz = -STREAM_RADIUS; dz <= STREAM_RADIUS; dz++) {
    for (let dx = -STREAM_RADIUS; dx <= STREAM_RADIUS; dx++) {
      const cx = ccx + dx;
      const cz = ccz + dz;
      const key = chunkKey(cx, cz);
      wanted.add(key);
      if (!chunkMeshes.has(key)) {
        const mesh = buildChunk(cx, cz);
        chunksRoot.add(mesh);
        chunkMeshes.set(key, mesh);
      }
    }
  }
  for (const [key, mesh] of chunkMeshes) {
    if (!wanted.has(key)) {
      chunksRoot.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      chunkMeshes.delete(key);
    }
  }
}

function terrainHeight(x: number, z: number): number {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const record = ensureChunkRecord(cx, cz);
  const lx = THREE.MathUtils.clamp((x - cx * CHUNK_SIZE) / 2, 0, CELLS - 0.001);
  const lz = THREE.MathUtils.clamp((z - cz * CHUNK_SIZE) / 2, 0, CELLS - 0.001);
  const ix = Math.floor(lx);
  const iz = Math.floor(lz);
  const fx = lx - ix;
  const fz = lz - iz;
  const a = record.heights[iz * VERTS + ix];
  const b = record.heights[iz * VERTS + ix + 1];
  const c = record.heights[(iz + 1) * VERTS + ix];
  const d = record.heights[(iz + 1) * VERTS + ix + 1];
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, fx), THREE.MathUtils.lerp(c, d, fx), fz);
}

function addCaveBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  caveRoot.add(mesh);
  return mesh;
}

function addCaveCollider(minX: number, maxX: number, minZ: number, maxZ: number): void {
  caveColliders.push({ minX, maxX, minZ, maxZ });
}

/** 高顶长方体洞室；仅使用基础长方体，没有滴水石锥。 */
function buildSpawnCave(): void {
  const rock = new THREE.MeshStandardMaterial({
    color: 0x4f514d,
    roughness: 1,
    flatShading: true,
  });
  const rockDark = new THREE.MeshStandardMaterial({
    color: 0x333633,
    roughness: 1,
    flatShading: true,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x252a2c,
    roughness: 0.82,
    metalness: 0.18,
    flatShading: true,
  });
  const wallThickness = 1;
  const fullDepth = CAVE.frontZ - CAVE.backZ;
  const midZ = (CAVE.frontZ + CAVE.backZ) * 0.5;
  // 整间洞室坐在山顶平台上，所有竖直坐标都从平台地面起算。
  const floor = CAVE.floorY;

  // 左右墙、后墙和高顶；洞内净高 10 米。
  addCaveBox(
    wallThickness,
    CAVE.height,
    fullDepth + wallThickness,
    -CAVE.halfWidth - wallThickness * 0.5,
    floor + CAVE.height * 0.5,
    midZ,
    rock
  );
  addCaveBox(
    wallThickness,
    CAVE.height,
    fullDepth + wallThickness,
    CAVE.halfWidth + wallThickness * 0.5,
    floor + CAVE.height * 0.5,
    midZ,
    rock
  );
  addCaveBox(
    CAVE.halfWidth * 2 + wallThickness * 2,
    CAVE.height,
    wallThickness,
    0,
    floor + CAVE.height * 0.5,
    CAVE.backZ - wallThickness * 0.5,
    rockDark
  );
  addCaveBox(
    CAVE.halfWidth * 2 + wallThickness * 2,
    0.9,
    fullDepth + wallThickness,
    0,
    floor + CAVE.height + 0.45,
    midZ,
    rockDark
  );

  // 正面墙分成左右两段，中间留下升降门洞。
  const sideWidth = CAVE.halfWidth - CAVE.doorHalfWidth;
  addCaveBox(
    sideWidth,
    CAVE.height,
    wallThickness,
    -(CAVE.doorHalfWidth + sideWidth * 0.5),
    floor + CAVE.height * 0.5,
    CAVE.frontZ,
    rock
  );
  addCaveBox(
    sideWidth,
    CAVE.height,
    wallThickness,
    CAVE.doorHalfWidth + sideWidth * 0.5,
    floor + CAVE.height * 0.5,
    CAVE.frontZ,
    rock
  );
  // 门洞上方仍有一段岩石门楣。
  addCaveBox(
    CAVE.doorHalfWidth * 2,
    CAVE.height - CAVE.doorHeight,
    wallThickness,
    0,
    floor + CAVE.doorHeight + (CAVE.height - CAVE.doorHeight) * 0.5,
    CAVE.frontZ,
    rockDark
  );

  caveDoorMesh = addCaveBox(
    CAVE.doorHalfWidth * 2 - 0.18,
    CAVE.doorHeight - 0.15,
    0.42,
    0,
    caveDoorY,
    CAVE.frontZ - 0.18,
    doorMat
  );
  caveDoorMesh.name = "CaveDoor";

  addCaveCollider(
    -CAVE.halfWidth - wallThickness,
    -CAVE.halfWidth,
    CAVE.backZ - wallThickness,
    CAVE.frontZ + wallThickness
  );
  addCaveCollider(
    CAVE.halfWidth,
    CAVE.halfWidth + wallThickness,
    CAVE.backZ - wallThickness,
    CAVE.frontZ + wallThickness
  );
  addCaveCollider(
    -CAVE.halfWidth - wallThickness,
    CAVE.halfWidth + wallThickness,
    CAVE.backZ - wallThickness,
    CAVE.backZ
  );
  addCaveCollider(
    -CAVE.halfWidth - wallThickness,
    -CAVE.doorHalfWidth,
    CAVE.frontZ - wallThickness * 0.5,
    CAVE.frontZ + wallThickness * 0.5
  );
  addCaveCollider(
    CAVE.doorHalfWidth,
    CAVE.halfWidth + wallThickness,
    CAVE.frontZ - wallThickness * 0.5,
    CAVE.frontZ + wallThickness * 0.5
  );

  const warmLight = new THREE.PointLight(0xffd79b, 1.6, 25, 2);
  warmLight.position.set(0, floor + CAVE.height - 1.4, 5);
  caveRoot.add(warmLight);
  const doorLight = new THREE.PointLight(0x9bc9e8, 1.2, 14, 2);
  doorLight.position.set(0, floor + 4.5, CAVE.frontZ - 2);
  caveRoot.add(doorLight);
}

const doorRay = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const playerEye = new THREE.Vector3();

/** 准星对准石门、且离门足够近时才能开门。 */
function isAimingCaveDoor(): boolean {
  if (caveDoorOpen || caveDoorOpening || !caveDoorMesh) return false;
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(caveDoorMesh, false)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) <= 7;
}

function tryOpenCaveDoor(): void {
  if (!isAimingCaveDoor()) return;
  caveDoorOpening = true;
  toast("石门正在向上升起");
}

function updateCaveDoor(dt: number): void {
  if (!caveDoorOpening || !caveDoorMesh) return;
  const targetY = CAVE.floorY + CAVE.height + CAVE.doorHeight * 0.5;
  caveDoorY = Math.min(targetY, caveDoorY + dt * 5.5);
  caveDoorMesh.position.y = caveDoorY;
  if (caveDoorY >= targetY) {
    caveDoorOpening = false;
    caveDoorOpen = true;
    toast("洞穴大门已经打开");
  }
}

function makeHouse(
  wallColor: number,
  x: number,
  floorY: number,
  z: number,
  includePillar: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, floorY, z);
  const walls = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.88,
    flatShading: true,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(wallColor).multiplyScalar(0.62),
    roughness: 0.95,
    flatShading: true,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xb8aa86,
    roughness: 1,
    flatShading: true,
  });
  const addPart = (
    width: number,
    height: number,
    depth: number,
    px: number,
    py: number,
    pz: number,
    material: THREE.Material
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const h = LIFT_HOUSE.height;
  const half = LIFT_HOUSE.halfSize;
  const thickness = 0.45;
  const doorwayHalf = 1.35;

  addPart(half * 2, 0.3, half * 2, 0, -0.15, 0, floorMat);
  addPart(half * 2 + 0.4, 0.35, half * 2 + 0.4, 0, h + 0.175, 0, trim);
  addPart(thickness, h, half * 2, -half, h * 0.5, 0, walls);
  addPart(thickness, h, half * 2, half, h * 0.5, 0, walls);
  addPart(half * 2, h, thickness, 0, h * 0.5, half, walls);
  const frontWidth = half - doorwayHalf;
  addPart(frontWidth, h, thickness, -(doorwayHalf + frontWidth * 0.5), h * 0.5, -half, walls);
  addPart(frontWidth, h, thickness, doorwayHalf + frontWidth * 0.5, h * 0.5, -half, walls);
  addPart(doorwayHalf * 2, 1.05, thickness, 0, h - 0.525, -half, trim);

  if (includePillar) {
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xd9e8c2,
      emissive: 0x28481f,
      emissiveIntensity: 0.35,
      roughness: 0.72,
    });
    investigationPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.72, 2.7, 8),
      pillarMat
    );
    investigationPillar.position.set(0, 1.35, 0.8);
    investigationPillar.name = "LiftHouseInvestigationPillar";
    investigationPillar.castShadow = true;
    investigationPillar.receiveShadow = true;
    group.add(investigationPillar);
  }

  const light = new THREE.PointLight(
    includePillar ? 0xb8ff9d : 0xffb45e,
    1.35,
    15,
    2
  );
  light.position.set(0, h - 0.8, 0);
  group.add(light);
  mechanismRoot.add(group);
  return group;
}

function buildLiftHouseMechanism(): void {
  liftHouseBaseY = terrainHeight(LIFT_HOUSE.x, LIFT_HOUSE.z);
  const orangeZ = LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset;
  const orangeTerrainY = terrainHeight(LIFT_HOUSE.x, orangeZ);
  liftHouseGroup = makeHouse(
    0x4f9a58,
    LIFT_HOUSE.x,
    liftHouseBaseY,
    LIFT_HOUSE.z,
    true
  );
  // 橙色房落在远处地面上（贴合地形），不是世界坐标硬编码 Y=0。
  orangeHouseGroup = makeHouse(
    0xd8792c,
    LIFT_HOUSE.x,
    orangeTerrainY,
    orangeZ,
    false
  );
  orangeHouseGroup.visible = false;
  blueHouseFloorY = terrainHeight(BLUE_HOUSE.x, BLUE_HOUSE.z);
  blueHouseGroup = makeHouse(
    0x356fb4,
    BLUE_HOUSE.x,
    blueHouseFloorY,
    BLUE_HOUSE.z,
    false
  );
}

function addChamberBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  rayTarget = false
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  chamberRoot.add(mesh);
  if (rayTarget) chamberRayTargets.push(mesh);
  return mesh;
}

function buildMechanismChamber(): void {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3b4147, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x727981, roughness: 0.82 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x252a30, roughness: 0.76 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x53616d,
    roughness: 0.42,
    metalness: 0.72,
  });
  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0xc44737,
    emissive: 0x3d0804,
    emissiveIntensity: 0.35,
  });
  const halfW = CHAMBER.halfWidth;
  const halfD = CHAMBER.halfDepth;
  const h = CHAMBER.height;

  addChamberBox(halfW * 2, 0.5, halfD * 2, CHAMBER.x, -0.25, CHAMBER.z, floorMat, true);
  addChamberBox(halfW * 2, 0.5, halfD * 2, CHAMBER.x, h + 0.25, CHAMBER.z, darkMat);
  addChamberBox(0.7, h, halfD * 2, CHAMBER.x - halfW, h * 0.5, CHAMBER.z, wallMat, true);
  addChamberBox(0.7, h, halfD * 2, CHAMBER.x + halfW, h * 0.5, CHAMBER.z, wallMat, true);
  addChamberBox(halfW * 2, h, 0.7, CHAMBER.x, h * 0.5, CHAMBER.z - halfD, wallMat, true);
  addChamberBox(halfW * 2, h, 0.7, CHAMBER.x, h * 0.5, CHAMBER.z + halfD, wallMat, true);

  const sideWidth = halfW - CHAMBER.gateHalfWidth;
  addChamberBox(
    sideWidth,
    h,
    0.8,
    CHAMBER.x - CHAMBER.gateHalfWidth - sideWidth * 0.5,
    h * 0.5,
    CHAMBER.gateZ,
    darkMat,
    true
  );
  addChamberBox(
    sideWidth,
    h,
    0.8,
    CHAMBER.x + CHAMBER.gateHalfWidth + sideWidth * 0.5,
    h * 0.5,
    CHAMBER.gateZ,
    darkMat,
    true
  );
  chamberDoorY = 3;
  chamberDoor = addChamberBox(
    CHAMBER.gateHalfWidth * 2 - 0.15,
    6,
    0.55,
    CHAMBER.x,
    chamberDoorY,
    CHAMBER.gateZ,
    metalMat
  );
  chamberDoor.name = "MechanismGate";
  chamberRayTargets.push(chamberDoor);

  ironBox = addChamberBox(2.4, 2.4, 2.4, CHAMBER.x - 10, 1.2, CHAMBER.z - 8, metalMat);
  ironBox.name = "MagneticIronBox";
  chamberButton = addChamberBox(4.2, 0.35, 4.2, CHAMBER.x + 9, 0.175, CHAMBER.z + 5, buttonMat);
  chamberButton.name = "WeightButton";

  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xb39a68, roughness: 0.7 });
  chamberPedestal = addChamberBox(2.4, 2.2, 2.4, CHAMBER.x, 1.1, CHAMBER.z + 28, pedestalMat);
  chamberPedestal.name = "PassPedestal";
  const passMesh = addChamberBox(
    1.35,
    0.12,
    0.85,
    CHAMBER.x,
    2.28,
    CHAMBER.z + 28,
    new THREE.MeshStandardMaterial({
      color: 0xe8c563,
      emissive: 0x5b4511,
      emissiveIntensity: 0.55,
      metalness: 0.3,
    })
  );
  passMesh.name = "MechanismPass";
  chamberPedestal.add(passMesh);
  passMesh.position.set(0, 1.18, 0);

  const roomLight = new THREE.PointLight(0xffdca5, 2.4, 60, 1.4);
  roomLight.position.set(CHAMBER.x, 11, CHAMBER.z);
  chamberRoot.add(roomLight);
  const gateLight = new THREE.PointLight(0xff6a45, 1.5, 18, 2);
  gateLight.position.set(CHAMBER.x, 6, CHAMBER.gateZ - 2);
  chamberRoot.add(gateLight);

  // 刷新页面会重置进度：机关室通行证与台座状态不从存档恢复。
  passTaken = false;
}

function addStasisBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  stasisRoot.add(mesh);
  return mesh;
}

function buildStasisRoom(): void {
  const metal = new THREE.MeshStandardMaterial({
    color: 0x4d6475,
    roughness: 0.58,
    metalness: 0.45,
  });
  const platform = new THREE.MeshStandardMaterial({ color: 0x68747e, roughness: 0.78 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x28313a, roughness: 0.9 });
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x58a8d8,
    emissive: 0x123b58,
    emissiveIntensity: 0.45,
    roughness: 0.48,
    metalness: 0.4,
  });
  const x = STASIS_ROOM.x;
  const z = STASIS_ROOM.z;
  const w = STASIS_ROOM.halfWidth;
  const d = STASIS_ROOM.halfDepth;

  addStasisBox(w * 2, 0.6, d * 2, x, STASIS_ROOM.pitY - 0.3, z, wall);
  addStasisBox(18, 0.6, 14, x, -0.3, z - STASIS_PLATFORM_Z, platform);
  addStasisBox(18, 0.6, 14, x, -0.3, z + STASIS_PLATFORM_Z, platform);
  addStasisBox(0.8, 16, d * 2, x - w, 5, z, wall);
  addStasisBox(0.8, 16, d * 2, x + w, 5, z, wall);
  addStasisBox(w * 2, 16, 0.8, x, 5, z - d, wall);
  addStasisBox(w * 2, 16, 0.8, x, 5, z + d, wall);

  rotatingBridge = addStasisBox(
    4.2,
    0.5,
    STASIS_BRIDGE_LEN,
    x,
    -STASIS_BRIDGE_HALF_H,
    z,
    bridgeMat
  );
  rotatingBridge.name = "StasisRotatingBridge";
  rotatingBridge.rotation.set(0, 0, 0);

  stasisPedestal = addStasisBox(2.4, 2.2, 2.4, x, 1.1, z + STASIS_PLATFORM_Z, metal);
  stasisPedestal.name = "StasisPassPedestal";
  const pass = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 0.85),
    new THREE.MeshStandardMaterial({
      color: 0x7ae8ff,
      emissive: 0x174d63,
      emissiveIntensity: 0.65,
      metalness: 0.35,
    })
  );
  pass.position.set(0, 1.18, 0);
  pass.name = "StasisRoomPass";
  stasisPedestal.add(pass);

  const centerLight = new THREE.PointLight(0x8fdcff, 2.3, 70, 1.5);
  centerLight.position.set(x, 10, z);
  stasisRoot.add(centerLight);
  const farLight = new THREE.PointLight(0xffdf9c, 1.5, 20, 2);
  farLight.position.set(x, 5, z + STASIS_PLATFORM_Z);
  stasisRoot.add(farLight);
  secondPassTaken = false;
}

function enterStasisRoom(): void {
  if (zone === "stasis") return;
  zone = "stasis";
  chunksRoot.visible = false;
  objectsRoot.visible = false;
  caveRoot.visible = false;
  mechanismRoot.visible = false;
  chamberRoot.visible = false;
  stasisRoot.visible = true;
  scene.background = new THREE.Color(0x101b24);
  scene.fog = new THREE.Fog(0x101b24, 45, 105);
  player.x = STASIS_ROOM.x;
  player.z = STASIS_ROOM.z - STASIS_PLATFORM_Z;
  player.y = STASIS_ROOM.floorY;
  player.vy = 0;
  player.yaw = Math.PI;
  player.pitch = -0.18;
  player.grounded = true;
  player.fallFromY = STASIS_ROOM.floorY;
  hasStasisSkill = true;
  ui.modeText.textContent = "静止器机关室 · 已获得静止器";
  toast("进入第二机关室 · 获得技能「静止器」");
}

function leaveStasisRoom(): void {
  zone = "overworld";
  stasisRoot.visible = false;
  chunksRoot.visible = true;
  objectsRoot.visible = true;
  caveRoot.visible = true;
  mechanismRoot.visible = true;
  scene.background = new THREE.Color(0x8fc8e8);
  scene.fog = new THREE.Fog(0x8fc8e8, 80, 245);
  ui.modeText.textContent = "游戏模式";
  player.x = BLUE_HOUSE.x;
  player.z = BLUE_HOUSE.z - BLUE_HOUSE.halfSize - 3.2;
  player.y = terrainHeight(player.x, player.z);
  player.vy = 0;
  player.yaw = 0;
  player.pitch = -0.2;
  player.grounded = true;
  player.fallFromY = player.y;
  avatar.position.set(player.x, player.y, player.z);
  maybeStartOldManCutscene();
}

function updateBlueHouseEntry(): void {
  if (cutsceneLock || zone !== "overworld" || !blueHouseGroup) return;
  if (
    Math.abs(player.x - BLUE_HOUSE.x) < 1.4 &&
    player.z > BLUE_HOUSE.z - BLUE_HOUSE.halfSize + 0.8 &&
    player.z < BLUE_HOUSE.z + 1.5
  ) enterStasisRoom();
}

function enterChamber(): void {
  if (zone === "chamber") return;
  zone = "chamber";
  chunksRoot.visible = false;
  objectsRoot.visible = false;
  caveRoot.visible = false;
  mechanismRoot.visible = false;
  stasisRoot.visible = false;
  chamberRoot.visible = true;
  scene.background = new THREE.Color(0x15191e);
  scene.fog = new THREE.Fog(0x15191e, 45, 100);
  player.x = CHAMBER.x;
  player.z = CHAMBER.z - CHAMBER.halfDepth + 6;
  player.y = CHAMBER.floorY;
  player.vy = 0;
  player.yaw = Math.PI;
  player.pitch = -0.2;
  player.grounded = true;
  player.fallFromY = CHAMBER.floorY;
  hasMagnetSkill = true;
  ui.modeText.textContent = "机关室 · 已获得磁铁";
  toast("进入机关室 · 获得技能「磁铁」");
}

function leaveChamber(): void {
  zone = "overworld";
  magnetHolding = false;
  chunksRoot.visible = true;
  objectsRoot.visible = true;
  caveRoot.visible = true;
  mechanismRoot.visible = true;
  chamberRoot.visible = false;
  scene.background = new THREE.Color(0x8fc8e8);
  scene.fog = new THREE.Fog(0x8fc8e8, 80, 245);
  ui.modeText.textContent = "游戏模式";
  // 送回橙色房子门外，避开进门触发区，避免立刻又被传进机关室。
  const orangeZ = LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset;
  const ground = orangeHouseGroup
    ? orangeHouseGroup.position.y
    : terrainHeight(LIFT_HOUSE.x, orangeZ - LIFT_HOUSE.halfSize - 3);
  player.x = LIFT_HOUSE.x;
  player.z = orangeZ - LIFT_HOUSE.halfSize - 3.2;
  player.y = ground;
  player.vy = 0;
  player.yaw = 0;
  player.pitch = -0.2;
  player.grounded = true;
  player.fallFromY = ground;
  avatar.position.set(player.x, player.y, player.z);
  maybeStartOldManCutscene();
}

function updateOrangeHouseEntry(): void {
  if (cutsceneLock || zone !== "overworld" || !orangeHouseGroup?.visible) return;
  const orangeZ = LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset;
  if (
    Math.abs(player.x - LIFT_HOUSE.x) < 1.4 &&
    player.z > orangeZ - LIFT_HOUSE.halfSize + 0.8 &&
    player.z < orangeZ + 1.5
  ) {
    enterChamber();
  }
}

/** 已拿到通行证后，走到机关门后方会再次送出橙房外。 */
function updateChamberExitAfterPass(): void {
  if (zone !== "chamber" || !passTaken) return;
  if (player.z > CHAMBER.gateZ + 0.6) {
    leaveChamber();
    if (!cutsceneLock) toast("已送回橙色房子外");
  }
}

function enclosureLayout(): { minX: number; maxX: number; minZ: number; maxZ: number; half: number } {
  const centerZ = (CAVE.backZ + CAVE.frontZ) * 0.5;
  const orangeBackZ = LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset + LIFT_HOUSE.halfSize;
  const half = orangeBackZ - centerZ;
  return { minX: -half, maxX: half, minZ: centerZ - half, maxZ: orangeBackZ, half };
}

function buildEnclosureWalls(): void {
  const { minX, maxX, minZ, maxZ } = enclosureLayout();
  const thickness = 2.4;
  const height = 28;
  const midY = 8;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x5a5348,
    roughness: 0.92,
    flatShading: true,
  });
  const addWall = (w: number, d: number, x: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallMat);
    mesh.position.set(x, midY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    enclosureRoot.add(mesh);
    enclosureWalls.push(mesh);
  };
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  addWall(spanX + thickness, thickness, 0, minZ);
  addWall(spanX + thickness, thickness, 0, maxZ);
  addWall(thickness, spanZ + thickness, minX, (minZ + maxZ) * 0.5);
  addWall(thickness, spanZ + thickness, maxX, (minZ + maxZ) * 0.5);
  enclosureColliders.length = 0;
  enclosureColliders.push(
    { minX: minX - thickness * 0.5, maxX: maxX + thickness * 0.5, minZ: minZ - thickness * 0.5, maxZ: minZ + thickness * 0.5 },
    { minX: minX - thickness * 0.5, maxX: maxX + thickness * 0.5, minZ: maxZ - thickness * 0.5, maxZ: maxZ + thickness * 0.5 },
    { minX: minX - thickness * 0.5, maxX: minX + thickness * 0.5, minZ: minZ - thickness * 0.5, maxZ: maxZ + thickness * 0.5 },
    { minX: maxX - thickness * 0.5, maxX: maxX + thickness * 0.5, minZ: minZ - thickness * 0.5, maxZ: maxZ + thickness * 0.5 }
  );
}

function tryTriggerEnclosureCollapse(): void {
  if (
    enclosureCollapseState !== "idle" ||
    countItem("mechanism_room_pass") < 1 ||
    countItem("stasis_room_pass") < 1
  ) return;
  enclosureCollapseState = "collapsing";
  enclosureCollapseTimer = 0;
  enclosureActive = false;
  enclosureRoot.visible = true;
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x655c4f,
    roughness: 0.95,
    flatShading: true,
  });
  const { minX, maxX, minZ, maxZ } = enclosureLayout();
  for (let i = 0; i < 28; i++) {
    const onVertical = i % 2 === 0;
    const x = onVertical
      ? (i % 4 === 0 ? minX : maxX)
      : THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = onVertical
      ? THREE.MathUtils.lerp(minZ, maxZ, Math.random())
      : (i % 4 === 1 ? minZ : maxZ);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2 + Math.random() * 2, 1 + Math.random() * 2.5, 1.2 + Math.random() * 2),
      debrisMat
    );
    mesh.position.set(x, 7 + Math.random() * 12, z);
    mesh.castShadow = true;
    enclosureRoot.add(mesh);
    const outwardX = x === minX ? -1 : x === maxX ? 1 : (x < 0 ? -0.35 : 0.35);
    const outwardZ = z === minZ ? -1 : z === maxZ ? 1 : (z < 0 ? -0.35 : 0.35);
    enclosureDebris.push({
      mesh,
      vx: outwardX * (5 + Math.random() * 7),
      vy: 5 + Math.random() * 8,
      vz: outwardZ * (5 + Math.random() * 7),
      spin: (Math.random() - 0.5) * 5,
    });
  }
  const flash = new THREE.PointLight(0xffb24c, 8, 180, 1.2);
  flash.position.set(0, 18, (minZ + maxZ) * 0.5);
  flash.name = "EnclosureExplosionFlash";
  enclosureRoot.add(flash);
  toast("两张通行证产生共鸣 · 围墙正在爆破！");
}

function updateEnclosureCollapse(dt: number): void {
  if (enclosureCollapseState !== "collapsing") return;
  enclosureCollapseTimer += dt;
  const angle = Math.min(1.3, enclosureCollapseTimer * 0.42);
  for (let i = 0; i < enclosureWalls.length; i++) {
    const wall = enclosureWalls[i];
    wall.position.y -= dt * (2.8 + enclosureCollapseTimer * 1.2);
    if (i === 0) {
      wall.rotation.x = -angle;
      wall.position.z -= dt * 3;
    } else if (i === 1) {
      wall.rotation.x = angle;
      wall.position.z += dt * 3;
    } else if (i === 2) {
      wall.rotation.z = angle;
      wall.position.x -= dt * 3;
    } else {
      wall.rotation.z = -angle;
      wall.position.x += dt * 3;
    }
  }
  for (const piece of enclosureDebris) {
    piece.vy -= 18 * dt;
    piece.mesh.position.x += piece.vx * dt;
    piece.mesh.position.y += piece.vy * dt;
    piece.mesh.position.z += piece.vz * dt;
    piece.mesh.rotation.x += piece.spin * dt;
    piece.mesh.rotation.z += piece.spin * 0.7 * dt;
  }
  const flash = enclosureRoot.getObjectByName("EnclosureExplosionFlash") as THREE.PointLight | null;
  if (flash) flash.intensity = Math.max(0, 8 - enclosureCollapseTimer * 5);
  if (enclosureCollapseTimer >= 4.2) {
    enclosureCollapseState = "done";
    enclosureRoot.visible = false;
    toast("围墙已经倒塌 · 可以离开这片区域了");
  }
}

function blockedByEnclosure(x: number, z: number): boolean {
  if (!enclosureActive) return false;
  for (const wall of enclosureColliders) {
    if (
      x >= wall.minX - PLAYER_RADIUS &&
      x <= wall.maxX + PLAYER_RADIUS &&
      z >= wall.minZ - PLAYER_RADIUS &&
      z <= wall.maxZ + PLAYER_RADIUS
    ) return true;
  }
  return false;
}

function makeOldMan(): THREE.Group {
  const group = new THREE.Group();
  const robe = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.05, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.86 })
  );
  robe.position.y = 1.2;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9a07a, flatShading: true })
  );
  head.position.y = 2.22;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 10, 7),
    new THREE.MeshStandardMaterial({ color: 0xc8c4b8, flatShading: true })
  );
  hair.position.y = 2.38;
  hair.scale.set(1, 0.55, 1);
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a })
  );
  stick.position.set(0.55, 0.85, 0.1);
  group.add(robe, head, hair, stick);
  group.traverse((n: any) => { if (n.isMesh) n.castShadow = true; });
  scene.add(group);
  return group;
}

/** 解锁任一机关室并回到室外后触发一次老人过场。 */
function maybeStartOldManCutscene(): void {
  if (oldManCutsceneDone || cutsceneLock) return;
  if (!passTaken && !secondPassTaken) return;
  startOldManCutscene();
}

function startOldManCutscene(): void {
  oldManCutsceneDone = true;
  cutsceneLock = true;
  keys.clear();
  if (!oldMan) oldMan = makeOldMan();
  oldMan.visible = true;
  const startX = player.x + 9;
  const startZ = player.z + 2;
  oldMan.position.set(startX, gameplayGroundHeight(startX, startZ), startZ);
  oldMan.lookAt(player.x, oldMan.position.y, player.z);
  oldManCutscene = "walking";
  oldManTalkTimer = 0;
  ui.help.textContent = "一位老人正在走过来…";
}

function updateOldManCutscene(dt: number): void {
  if (!cutsceneLock || !oldMan) return;
  const stopX = player.x + 2.2;
  const stopZ = player.z + 0.4;
  if (oldManCutscene === "walking") {
    const dx = stopX - oldMan.position.x;
    const dz = stopZ - oldMan.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      oldMan.position.x = stopX;
      oldMan.position.z = stopZ;
      oldMan.position.y = gameplayGroundHeight(stopX, stopZ);
      oldMan.lookAt(player.x, oldMan.position.y, player.z);
      oldManCutscene = "talk1";
      oldManTalkTimer = 2.4;
      toast("周围被用墙封住了");
      ui.help.textContent = "周围被用墙封住了";
    } else {
      const step = Math.min(dist, 3.2 * dt);
      oldMan.position.x += (dx / dist) * step;
      oldMan.position.z += (dz / dist) * step;
      oldMan.position.y = gameplayGroundHeight(oldMan.position.x, oldMan.position.z);
      oldMan.lookAt(player.x, oldMan.position.y, player.z);
    }
    return;
  }
  oldManTalkTimer -= dt;
  if (oldManCutscene === "talk1" && oldManTalkTimer <= 0) {
    oldManCutscene = "talk2";
    oldManTalkTimer = 2.6;
    toast("得解锁 2 个机关室才可以离开");
    ui.help.textContent = "得解锁 2 个机关室才可以离开";
    return;
  }
  if (oldManCutscene === "talk2" && oldManTalkTimer <= 0) {
    oldManCutscene = "done";
    cutsceneLock = false;
    ui.help.textContent = "四周已有围墙 · 还需解开第二个机关室";
  }
}

function pointInsideHouse(x: number, z: number, centerZ: number, margin = 0): boolean {
  return (
    Math.abs(x - LIFT_HOUSE.x) <= LIFT_HOUSE.halfSize - margin &&
    Math.abs(z - centerZ) <= LIFT_HOUSE.halfSize - margin
  );
}

function houseGroundHeight(x: number, z: number): number | null {
  if (liftHouseGroup && pointInsideHouse(x, z, LIFT_HOUSE.z, 0.45)) {
    return liftHouseGroup.position.y;
  }
  const orangeZ = LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset;
  if (
    orangeHouseGroup?.visible &&
    pointInsideHouse(x, z, orangeZ, 0.45)
  ) {
    return orangeHouseGroup.position.y;
  }
  if (
    blueHouseGroup &&
    Math.abs(x - BLUE_HOUSE.x) <= BLUE_HOUSE.halfSize - 0.45 &&
    Math.abs(z - BLUE_HOUSE.z) <= BLUE_HOUSE.halfSize - 0.45
  ) return blueHouseGroup.position.y;
  return null;
}

/**
 * 绕 X 翻转的薄桥：用局部坐标算桥面高度（竖直射线在倾斜时会打不中）。
 */
function bridgeWalkHeight(x: number, z: number, margin = 0): number | null {
  if (!rotatingBridge?.visible) return null;
  const theta = rotatingBridge.rotation.x;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // 板身太接近竖直就没有可站的面；翻到背面时背面朝上，同样可以站。
  if (Math.abs(c) < 0.45) return null;
  // 朝上的那一面：局部 y 取与 c 同号，世界高度才最大。
  const hy = STASIS_BRIDGE_HALF_H * Math.sign(c);
  const dx = x - rotatingBridge.position.x;
  const dz = z - rotatingBridge.position.z;
  const lz = (dz - hy * s) / c;
  const lx = dx;
  if (Math.abs(lx) > 2.1 + margin || Math.abs(lz) > STASIS_BRIDGE_HALF + margin) {
    return null;
  }
  return rotatingBridge.position.y + hy * c - lz * s;
}

/**
 * 桥板在任何角度都是实体：沿人体轴线找插入最深的采样点，再沿板面法线推出。
 * 只有板面朝上且不陡时才算落地，其余角度只解除重叠、保持下落。
 */
function ejectFromBridgeVolume(): void {
  if (!rotatingBridge || zone !== "stasis") return;
  const theta = rotatingBridge.rotation.x;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const cx = rotatingBridge.position.x;
  const cy = rotatingBridge.position.y;
  const cz = rotatingBridge.position.z;
  const hx = 2.1;
  const hy = STASIS_BRIDGE_HALF_H;
  const hz = STASIS_BRIDGE_HALF;

  let best: { h: number; lx: number; ly: number; lz: number; depth: number } | null = null;
  for (let h = 0; h <= 2.6; h += 0.325) {
    const dx = player.x - cx;
    const dy = player.y + h - cy;
    const dz = player.z - cz;
    const lx = dx;
    const ly = dy * c + dz * s;
    const lz = -dy * s + dz * c;
    if (Math.abs(lx) > hx || Math.abs(ly) > hy || Math.abs(lz) > hz) continue;
    // 恰好贴在板面上时不要反复推，避免和站立逻辑打架。
    const depth = hy - Math.abs(ly);
    if (depth <= 0.03) continue;
    if (!best || depth > best.depth) best = { h, lx, ly, lz, depth };
  }
  if (!best) return;

  // 落地由地面钳制统一处理，这里只负责把人挤出板外。
  const sign = best.ly >= 0 ? 1 : -1;
  const targetLocalY = sign * (hy + 0.02);
  player.x = cx + best.lx;
  player.y = cy + targetLocalY * c - best.lz * s - best.h;
  player.z = cz + targetLocalY * s + best.lz * c;
  avatar.position.set(player.x, player.y, player.z);
}

function gameplayGroundHeight(x: number, z: number): number {
  if (zone === "chamber") return CHAMBER.floorY;
  if (zone === "stasis") {
    const lx = Math.abs(x - STASIS_ROOM.x);
    const lz = z - STASIS_ROOM.z;
    // 只认两端真实平台占地，不要把整条 |lz|>=half 都当成地板
    const onNearPlatform =
      lx <= 9 && Math.abs(lz + STASIS_PLATFORM_Z) <= 7;
    const onFarPlatform =
      lx <= 9 && Math.abs(lz - STASIS_PLATFORM_Z) <= 7;
    if (onNearPlatform || onFarPlatform) return STASIS_ROOM.floorY;
    const bridgeY = bridgeWalkHeight(x, z, 0.35);
    if (bridgeY !== null && player.y >= bridgeY - 3.2) return bridgeY;
    return STASIS_ROOM.pitY;
  }
  const terrain = terrainHeight(x, z);
  const houseFloor = houseGroundHeight(x, z);
  return houseFloor === null ? terrain : Math.max(terrain, houseFloor);
}

function blockedByHouseAt(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  floorY: number,
  hasPillar = false
): boolean {
  // 房屋升高后，地面上的玩家可以从其下方通过。
  if (player.y + 2.55 < floorY || player.y > floorY + LIFT_HOUSE.height + 0.5) return false;
  const lx = x - centerX;
  const lz = z - centerZ;
  const half = LIFT_HOUSE.halfSize;
  const wall = 0.45 + PLAYER_RADIUS;
  const withinX = Math.abs(lx) <= half + wall;
  const withinZ = Math.abs(lz) <= half + wall;
  if (!withinX || !withinZ) return false;
  if (Math.abs(Math.abs(lx) - half) <= wall) return true;
  if (Math.abs(lz - half) <= wall) return true;
  if (Math.abs(lz + half) <= wall && Math.abs(lx) > 1.35 - PLAYER_RADIUS) return true;
  // 调查柱自身也不可穿过。
  return hasPillar && Math.hypot(lx, lz - 0.8) < 0.72 + PLAYER_RADIUS;
}

function blockedByHouses(x: number, z: number): boolean {
  if (
    liftHouseGroup &&
    blockedByHouseAt(x, z, LIFT_HOUSE.x, LIFT_HOUSE.z, liftHouseGroup.position.y, true)
  ) return true;
  if (
    orangeHouseGroup?.visible &&
    blockedByHouseAt(
      x,
      z,
      LIFT_HOUSE.x,
      LIFT_HOUSE.z + LIFT_HOUSE.orangeZOffset,
      orangeHouseGroup.position.y
    )
  ) return true;
  if (
    blueHouseGroup &&
    blockedByHouseAt(x, z, BLUE_HOUSE.x, BLUE_HOUSE.z, blueHouseGroup.position.y)
  ) return true;
  return false;
}

function blockedByStasisRoom(x: number, z: number): boolean {
  const margin = PLAYER_RADIUS + 0.35;
  if (
    x < STASIS_ROOM.x - STASIS_ROOM.halfWidth + margin ||
    x > STASIS_ROOM.x + STASIS_ROOM.halfWidth - margin ||
    z < STASIS_ROOM.z - STASIS_ROOM.halfDepth + margin ||
    z > STASIS_ROOM.z + STASIS_ROOM.halfDepth - margin
  ) {
    return true;
  }
  if (
    stasisPedestal?.visible &&
    Math.hypot(x - stasisPedestal.position.x, z - stasisPedestal.position.z) <
      1.3 + PLAYER_RADIUS
  ) {
    return true;
  }
  return false;
}

function blockedByChamber(x: number, z: number): boolean {
  const margin = PLAYER_RADIUS + 0.35;
  if (
    x < CHAMBER.x - CHAMBER.halfWidth + margin ||
    x > CHAMBER.x + CHAMBER.halfWidth - margin ||
    z < CHAMBER.z - CHAMBER.halfDepth + margin ||
    z > CHAMBER.z + CHAMBER.halfDepth - margin
  ) return true;
  const atGate = Math.abs(z - CHAMBER.gateZ) < 0.4 + PLAYER_RADIUS;
  if (atGate) {
    if (Math.abs(x - CHAMBER.x) > CHAMBER.gateHalfWidth - PLAYER_RADIUS) return true;
    if (chamberDoorY < 7.5) return true;
  }
  if (
    ironBox &&
    !magnetHolding &&
    Math.hypot(x - ironBox.position.x, z - ironBox.position.z) < 1.2 + PLAYER_RADIUS
  ) return true;
  if (
    chamberPedestal?.visible &&
    Math.hypot(x - chamberPedestal.position.x, z - chamberPedestal.position.z) < 1.3 + PLAYER_RADIUS
  ) return true;
  return false;
}

function blockedForPlayer(x: number, z: number): boolean {
  if (zone === "chamber") return blockedByChamber(x, z);
  if (zone === "stasis") return blockedByStasisRoom(x, z);
  return objectCollision(x, z) || blockedByCave(x, z) || blockedByHouses(x, z) || blockedByEnclosure(x, z);
}

function isAimingIronBox(): boolean {
  if (zone !== "chamber" || !hasMagnetSkill || !ironBox || magnetHolding) return false;
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(ironBox, false)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) < 10;
}

function findMagnetPlacement(): THREE.Vector3 | null {
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObjects(chamberRayTargets, false)[0];
  playerEye.set(player.x, player.y + 1.45, player.z);
  const point = hit ? hit.point.clone() : null;
  if (!point || point.distanceTo(playerEye) > 10) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const fallback = playerEye.clone().addScaledVector(direction, 6);
    fallback.y = CHAMBER.floorY;
    if (fallback.distanceTo(playerEye) > 10) return null;
    fallback.x = THREE.MathUtils.clamp(
      fallback.x,
      CHAMBER.x - CHAMBER.halfWidth + 1.5,
      CHAMBER.x + CHAMBER.halfWidth - 1.5
    );
    fallback.z = THREE.MathUtils.clamp(
      fallback.z,
      CHAMBER.z - CHAMBER.halfDepth + 1.5,
      CHAMBER.z + CHAMBER.halfDepth - 1.5
    );
    fallback.y = 1.2;
    return fallback;
  }
  point.x = THREE.MathUtils.clamp(
    point.x,
    CHAMBER.x - CHAMBER.halfWidth + 1.5,
    CHAMBER.x + CHAMBER.halfWidth - 1.5
  );
  point.z = THREE.MathUtils.clamp(
    point.z,
    CHAMBER.z - CHAMBER.halfDepth + 1.5,
    CHAMBER.z + CHAMBER.halfDepth - 1.5
  );
  point.y = 1.2;
  return point;
}

function tryMagnetInteraction(): boolean {
  if (zone !== "chamber" || !hasMagnetSkill || !ironBox) return false;
  if (!magnetHolding) {
    if (!isAimingIronBox()) return false;
    magnetHolding = true;
    toast("磁铁已吸住铁箱 · 瞄准 10 米内位置再按 Q 放置");
    return true;
  }
  const placement = findMagnetPlacement();
  if (!placement) {
    toast("目标位置超过磁铁的 10 米范围");
    return true;
  }
  ironBox.position.copy(placement);
  magnetHolding = false;
  toast("铁箱已放下");
  return true;
}

function updateHeldIronBox(): void {
  if (!magnetHolding || !ironBox) return;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const target = new THREE.Vector3(player.x, player.y + 1.65, player.z)
    .addScaledVector(direction, 4.2);
  target.x = THREE.MathUtils.clamp(
    target.x,
    CHAMBER.x - CHAMBER.halfWidth + 1.5,
    CHAMBER.x + CHAMBER.halfWidth - 1.5
  );
  target.z = THREE.MathUtils.clamp(
    target.z,
    CHAMBER.z - CHAMBER.halfDepth + 1.5,
    CHAMBER.z + CHAMBER.halfDepth - 1.5
  );
  target.y = THREE.MathUtils.clamp(target.y, 1.4, 6);
  ironBox.position.lerp(target, 0.28);
}

function updateChamberPuzzle(dt: number): void {
  if (zone !== "chamber" || !ironBox || !chamberButton || !chamberDoor) return;
  buttonPressed =
    !magnetHolding &&
    ironBox.position.y <= 1.5 &&
    Math.abs(ironBox.position.x - chamberButton.position.x) <= 2 &&
    Math.abs(ironBox.position.z - chamberButton.position.z) <= 2;
  chamberButton.position.y = buttonPressed ? 0.06 : 0.175;
  const shouldOpen = buttonPressed || passTaken;
  const targetY = shouldOpen ? 10.5 : 3;
  chamberDoorY = THREE.MathUtils.lerp(chamberDoorY, targetY, Math.min(1, dt * 3.5));
  if (Math.abs(chamberDoorY - targetY) < 0.01) chamberDoorY = targetY;
  chamberDoor.position.y = chamberDoorY;
}

function isAimingPassPedestal(): boolean {
  if (
    zone !== "chamber" ||
    passTaken ||
    !chamberPedestal?.visible ||
    chamberDoorY < 8
  ) return false;
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(chamberPedestal, true)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) <= 6;
}

function tryTakeMechanismPass(): boolean {
  if (!isAimingPassPedestal() || !chamberPedestal) return false;
  if (!addItemToBackpack({ id: "mechanism_room_pass", name: "机关室通行证" })) {
    toast("背包已满 · 清理空间后可再次领取");
    return true;
  }
  passTaken = true;
  chamberPedestal.visible = false;
  leaveChamber();
  toast("获得「机关室通行证」 · 已送回橙色房子外");
  tryTriggerEnclosureCollapse();
  return true;
}

function isAimingRotatingBridge(): boolean {
  if (zone !== "stasis" || !hasStasisSkill || !rotatingBridge) return false;
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(rotatingBridge, false)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) <= 10;
}

function tryUseStasisSkill(): boolean {
  if (!isAimingRotatingBridge()) return false;
  stasisTimer = 6;
  toast("静止器启动 · 旋转桥暂停 6 秒");
  return true;
}

function updateStasisRoom(dt: number): void {
  if (zone !== "stasis" || !rotatingBridge) return;
  const prevRot = rotatingBridge.rotation.x;
  if (stasisTimer > 0) {
    stasisTimer = Math.max(0, stasisTimer - dt);
  } else {
    // 竖着转：绕 X，桥两端沿 Y 上下翻转。
    rotatingBridge.rotation.x += dt * 0.7;
    rotatingBridge.rotation.y = 0;
  }
  rotatingBridge.updateMatrixWorld(true);

  let bridgeY = bridgeWalkHeight(player.x, player.z);
  const onBridge =
    bridgeY !== null &&
    player.y >= bridgeY - 0.85 &&
    player.y <= bridgeY + 1.2;
  const wantJump = keys.has("Space");
  // 起跳中 / 按着跳跃键时绝不吸回桥面，也不做体积弹出
  const stickToBridge = onBridge && player.vy <= 0.05 && !wantJump;

  // 站在桥上且未起跳时，贴着桥面一起翻转并校准高度。
  if (stickToBridge) {
    const theta1 = rotatingBridge.rotation.x;
    const dRot = theta1 - prevRot;
    if (Math.abs(dRot) > 1e-8) {
      const cx = rotatingBridge.position.x;
      const cz = rotatingBridge.position.z;
      const c0 = Math.cos(prevRot);
      const s0 = Math.sin(prevRot);
      const c1 = Math.cos(theta1);
      const s1 = Math.sin(theta1);
      // 站的是哪一面，前后帧都按各自朝上的那一面换算。
      const hy0 = STASIS_BRIDGE_HALF_H * Math.sign(c0);
      const hy1 = STASIS_BRIDGE_HALF_H * Math.sign(c1);
      const dx = player.x - cx;
      const dz = player.z - cz;
      const lz = Math.abs(c0) > 0.2 ? (dz - hy0 * s0) / c0 : 0;
      const lx = dx;
      player.x = cx + lx;
      player.z = cz + hy1 * s1 + lz * c1;
    }
    bridgeY = bridgeWalkHeight(player.x, player.z);
    if (bridgeY !== null) {
      player.y = bridgeY;
      player.vy = 0;
      player.grounded = true;
      player.fallFromY = bridgeY;
      avatar.position.set(player.x, player.y, player.z);
    }
  } else if (!(wantJump || player.vy > 0.05)) {
    ejectFromBridgeVolume();
  }
  // 避免旋转角无限累积导致 cos 抖动
  rotatingBridge.rotation.x =
    ((rotatingBridge.rotation.x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (player.y < -8) {
    player.x = STASIS_ROOM.x;
    player.z = STASIS_ROOM.z - STASIS_PLATFORM_Z;
    player.y = STASIS_ROOM.floorY;
    player.vy = 0;
    player.grounded = true;
    player.fallFromY = STASIS_ROOM.floorY;
    avatar.position.set(player.x, player.y, player.z);
    toast("跌入深坑 · 已返回机关室入口");
  }
}

function isAimingStasisPedestal(): boolean {
  if (zone !== "stasis" || secondPassTaken || !stasisPedestal?.visible) return false;
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(stasisPedestal, true)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) <= 6;
}

function tryTakeStasisPass(): boolean {
  if (!isAimingStasisPedestal() || !stasisPedestal) return false;
  if (!addItemToBackpack({ id: "stasis_room_pass", name: "静止器机关室通行证" })) {
    toast("背包已满 · 清理空间后可再次领取");
    return true;
  }
  secondPassTaken = true;
  stasisPedestal.visible = false;
  leaveStasisRoom();
  tryTriggerEnclosureCollapse();
  if (enclosureCollapseState !== "collapsing") {
    toast("获得「静止器机关室通行证」 · 已送回蓝色房子外");
  }
  return true;
}

function isAimingInvestigationPillar(): boolean {
  if (!investigationPillar || liftHouseState === "raising" || liftHouseState === "lowering") {
    return false;
  }
  doorRay.setFromCamera(screenCenter, camera);
  const hit = doorRay.intersectObject(investigationPillar, false)[0];
  if (!hit) return false;
  playerEye.set(player.x, player.y + 1.45, player.z);
  return hit.point.distanceTo(playerEye) <= 6;
}

function tryInvestigatePillar(): boolean {
  if (!isAimingInvestigationPillar() || liftHouseState === "spent") return false;
  if (liftHouseState === "grounded") {
    liftHouseState = "raising";
    playerRidingLift = pointInsideHouse(player.x, player.z, LIFT_HOUSE.z);
    if (orangeHouseGroup) orangeHouseGroup.visible = true;
    toast("机关启动 · 房屋正在升高");
    return true;
  }
  if (liftHouseState === "raised") {
    liftHouseState = "lowering";
    playerRidingLift = pointInsideHouse(player.x, player.z, LIFT_HOUSE.z);
    toast("机关再次启动 · 房屋正在下降");
    return true;
  }
  return false;
}

function updateLiftHouse(dt: number): void {
  if (!liftHouseGroup || (liftHouseState !== "raising" && liftHouseState !== "lowering")) return;
  const oldY = liftHouseGroup.position.y;
  const targetY = liftHouseState === "raising" ? CAVE.floorY : liftHouseBaseY;
  const direction = Math.sign(targetY - oldY);
  const nextY = oldY + direction * dt * 4.2;
  liftHouseGroup.position.y =
    direction > 0 ? Math.min(targetY, nextY) : Math.max(targetY, nextY);
  const deltaY = liftHouseGroup.position.y - oldY;
  if (playerRidingLift && pointInsideHouse(player.x, player.z, LIFT_HOUSE.z)) {
    // 贴着电梯地板一起升降；不要每帧重置 grounded 去触发连跳。
    player.y = liftHouseGroup.position.y;
    player.fallFromY = player.y;
    player.vy = 0;
    player.grounded = true;
  } else {
    playerRidingLift = false;
  }
  if (liftHouseGroup.position.y !== targetY) return;
  playerRidingLift = false;
  if (liftHouseState === "raising") {
    liftHouseState = "raised";
    toast("房屋已升至洞穴高度 · 可再次调查柱子");
  } else {
    liftHouseState = "spent";
    toast("房屋已恢复高度 · 柱子不再响应");
  }
}

function blockedByCave(x: number, z: number): boolean {
  for (const wall of caveColliders) {
    if (
      x >= wall.minX - PLAYER_RADIUS &&
      x <= wall.maxX + PLAYER_RADIUS &&
      z >= wall.minZ - PLAYER_RADIUS &&
      z <= wall.maxZ + PLAYER_RADIUS
    ) {
      return true;
    }
  }
  if (!caveDoorOpen) {
    return (
      x >= -CAVE.doorHalfWidth - PLAYER_RADIUS &&
      x <= CAVE.doorHalfWidth + PLAYER_RADIUS &&
      z >= CAVE.frontZ - 0.45 - PLAYER_RADIUS &&
      z <= CAVE.frontZ + 0.15 + PLAYER_RADIUS
    );
  }
  return false;
}

function makeObject(data: MapObject): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.mapObjectId = data.id;
  const flat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  if (data.kind === "tree") {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 7), flat(0x765038));
    trunk.position.y = 1.6;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2, 4.8, 8), flat(0x3f7f45));
    crown.position.y = 4.6;
    group.add(trunk, crown);
  } else if (data.kind === "rock") {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), flat(0x747a78));
    rock.scale.set(1.3, 0.85, 1);
    rock.position.y = 1;
    group.add(rock);
  } else if (data.kind === "crate") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), flat(0x9a6939));
    crate.position.y = 0.9;
    group.add(crate);
  } else {
    const stone = flat(0x989485);
    const left = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.4, 1.3), stone);
    const right = left.clone();
    left.position.set(-2, 2.2, 0);
    right.position.set(2, 2.2, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1.1, 1.3), stone);
    top.position.y = 4.2;
    group.add(left, right, top);
  }
  group.position.set(data.x, terrainHeight(data.x, data.z), data.z);
  group.rotation.y = data.rotation;
  group.scale.setScalar(data.scale);
  group.traverse((node: any) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.userData.mapObjectId = data.id;
    }
  });
  return group;
}

function rebuildObjects(): void {
  while (objectsRoot.children.length) objectsRoot.remove(objectsRoot.children[0]);
  objectMeshes.clear();
  for (const data of worldMap.objects) {
    const object = makeObject(data);
    objectsRoot.add(object);
    objectMeshes.set(data.id, object);
  }
}

function objectCollision(nx: number, nz: number): boolean {
  for (const object of worldMap.objects) {
    const radius = (object.kind === "tree" ? 0.75 : object.kind === "ruin" ? 2.7 : 1.3) * object.scale;
    if (Math.hypot(nx - object.x, nz - object.z) < radius + PLAYER_RADIUS) return true;
  }
  return false;
}

const avatar = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b76b6, roughness: 0.82 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.15, 4, 8), bodyMat);
body.position.y = 1.25;
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 12, 8),
  new THREE.MeshStandardMaterial({ color: 0xe5b58d, flatShading: true })
);
head.position.y = 2.35;
// 胶囊体和球体都是旋转对称的，加一小块朝向标记（局部 +Z 为正面）才看得出前后
const facing = new THREE.Mesh(
  new THREE.BoxGeometry(0.26, 0.12, 0.2),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, flatShading: true })
);
facing.position.set(0, 2.34, 0.38);
avatar.add(body, head, facing);
avatar.traverse((n: any) => { if (n.isMesh) n.castShadow = true; });
scene.add(avatar);

function updatePlayer(dt: number): void {
  if (player.dead || isInventoryOpen() || cutsceneLock) {
    keys.clear();
    avatar.position.set(player.x, player.y, player.z);
    return;
  }
  let forward = 0;
  let side = 0;
  if (keys.has("KeyW")) forward += 1;
  if (keys.has("KeyS")) forward -= 1;
  if (keys.has("KeyA")) side -= 1;
  if (keys.has("KeyD")) side += 1;
  const len = Math.hypot(forward, side) || 1;
  forward /= len;
  side /= len;
  const speed = keys.has("ShiftLeft") ? 10 : 6;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  // 摄像机位于 player + (sin, cos) * d 并看向角色，故镜头朝向为 (-sin, -cos)，
  // 对应的右向量是 朝向 × up = (cos, -sin)。两者的 Z 分量都是负号。
  const dx = (side * cos - forward * sin) * speed * dt;
  const dz = (-side * sin - forward * cos) * speed * dt;
  const nx = player.x + dx;
  const nz = player.z + dz;
  const oldH = gameplayGroundHeight(player.x, player.z);
  // 只能小幅上台阶；下悬崖允许任意落差，靠坠落扣血。
  const blockedX = blockedForPlayer(nx, player.z);
  const newHX = gameplayGroundHeight(nx, player.z);
  // 基准取脚下地面与身体高度的较大值：悬空或站在高处时不该被当成上台阶。
  if (!blockedX && newHX - Math.max(oldH, player.y) < 1.5) {
    player.x = nx;
  }
  const oldHZ = gameplayGroundHeight(player.x, player.z);
  const blockedZ = blockedForPlayer(player.x, nz);
  const newHZ = gameplayGroundHeight(player.x, nz);
  if (!blockedZ && newHZ - Math.max(oldHZ, player.y) < 1.5) {
    player.z = nz;
  }
  if (keys.has("Space") && player.grounded && !playerRidingLift) {
    player.vy = 7.5;
    player.grounded = false;
    player.fallFromY = player.y;
  }
  const wasGrounded = player.grounded;
  player.vy -= 18 * dt;
  player.y += player.vy * dt;
  const ground = gameplayGroundHeight(player.x, player.z);
  if (player.y <= ground) {
    if (!wasGrounded) {
      applyFallDamage(player.fallFromY - ground);
    }
    player.y = ground;
    player.vy = 0;
    player.grounded = true;
    player.fallFromY = ground;
  } else {
    if (wasGrounded) player.fallFromY = player.y;
    player.grounded = false;
  }
  avatar.position.set(player.x, player.y, player.z);
  if (Math.abs(dx) + Math.abs(dz) > 0.001) avatar.rotation.y = Math.atan2(dx, dz);
}

/** 玩家是否处在洞室内部（含门口一小段），用来决定镜头要不要被关在洞里 */
function isPlayerInsideCave(): boolean {
  if (zone === "chamber") return false;
  return (
    Math.abs(player.x) <= CAVE.halfWidth &&
    player.z >= CAVE.backZ &&
    player.z <= CAVE.frontZ + 0.5
  );
}

/** 镜头所在点是否穿进了墙体 / 地形 / 洞外 */
function cameraPointBlocked(x: number, y: number, z: number, insideCave: boolean): boolean {
  if (zone === "chamber") {
    const m = 0.45;
    return (
      y <= CHAMBER.floorY + 0.35 ||
      y >= CHAMBER.height - m ||
      x <= CHAMBER.x - CHAMBER.halfWidth + m ||
      x >= CHAMBER.x + CHAMBER.halfWidth - m ||
      z <= CHAMBER.z - CHAMBER.halfDepth + m ||
      z >= CHAMBER.z + CHAMBER.halfDepth - m
    );
  }
  if (zone === "stasis") {
    const m = 0.45;
    return (
      y <= STASIS_ROOM.pitY + 0.35 ||
      y >= 15 - m ||
      x <= STASIS_ROOM.x - STASIS_ROOM.halfWidth + m ||
      x >= STASIS_ROOM.x + STASIS_ROOM.halfWidth - m ||
      z <= STASIS_ROOM.z - STASIS_ROOM.halfDepth + m ||
      z >= STASIS_ROOM.z + STASIS_ROOM.halfDepth - m
    );
  }
  if (y <= terrainHeight(x, z) + 0.35) return true;
  if (insideCave) {
    // 关在洞室净空之内，避免镜头退到墙外去看内部。
    const m = 0.45;
    if (
      x < -CAVE.halfWidth + m ||
      x > CAVE.halfWidth - m ||
      z < CAVE.backZ + m ||
      z > CAVE.frontZ - m ||
      y > CAVE.floorY + CAVE.height - m
    ) {
      return true;
    }
    return false;
  }
  // 洞外：只要别插进洞壁厚度里即可。
  for (const wall of caveColliders) {
    if (
      y <= CAVE.floorY + CAVE.height &&
      x >= wall.minX - 0.3 &&
      x <= wall.maxX + 0.3 &&
      z >= wall.minZ - 0.3 &&
      z <= wall.maxZ + 0.3
    ) {
      return true;
    }
  }
  return false;
}

function updateGameCamera(): void {
  if (cutsceneLock && oldMan) {
    const focusY = player.y + 1.45;
    const ox = oldMan.position.x - player.x;
    const oz = oldMan.position.z - player.z;
    const len = Math.hypot(ox, oz) || 1;
    camera.position.set(
      player.x - (ox / len) * 5.5,
      focusY + 1.8,
      player.z - (oz / len) * 5.5
    );
    camera.lookAt(oldMan.position.x, oldMan.position.y + 1.7, oldMan.position.z);
    return;
  }
  const maxDistance = 7.8;
  const insideCave = isPlayerInsideCave();
  const focusY = player.y + 1.45;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const horizontal = Math.cos(player.pitch);
  // 单位方向：由角色指向理想镜头位置。
  const dirX = sin * horizontal;
  const dirY = 0.28 + Math.sin(-player.pitch);
  const dirZ = cos * horizontal;

  // 从角色向外步进，遇到墙体/地形/洞口边界就停在上一格，镜头因此始终留在室内。
  let distance = 1.2;
  const step = 0.3;
  while (distance + step <= maxDistance) {
    const next = distance + step;
    if (
      cameraPointBlocked(
        player.x + dirX * next,
        focusY + dirY * next,
        player.z + dirZ * next,
        insideCave
      )
    ) {
      break;
    }
    distance = next;
  }

  camera.position.set(
    player.x + dirX * distance,
    focusY + dirY * distance,
    player.z + dirZ * distance
  );
  camera.lookAt(player.x, focusY, player.z);
}

function updateEditorCamera(): void {
  const cp = Math.cos(editorPitch);
  camera.position.set(
    editorTarget.x + Math.sin(editorYaw) * cp * editorDistance,
    editorTarget.y + Math.sin(editorPitch) * editorDistance,
    editorTarget.z + Math.cos(editorYaw) * cp * editorDistance
  );
  camera.lookAt(editorTarget);
}

function terrainPick(event: PointerEvent): THREE.Intersection | null {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(Array.from(chunkMeshes.values()), false)[0] || null;
}

function applyBrush(point: THREE.Vector3): void {
  const minCx = Math.floor((point.x - brushSize) / CHUNK_SIZE);
  const maxCx = Math.floor((point.x + brushSize) / CHUNK_SIZE);
  const minCz = Math.floor((point.z - brushSize) / CHUNK_SIZE);
  const maxCz = Math.floor((point.z + brushSize) / CHUNK_SIZE);
  const touched: Array<[number, number]> = [];
  for (let cz = minCz; cz <= maxCz; cz++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const record = ensureChunkRecord(cx, cz);
      let changed = false;
      for (let vz = 0; vz < VERTS; vz++) {
        for (let vx = 0; vx < VERTS; vx++) {
          const wx = cx * CHUNK_SIZE + vx * 2;
          const wz = cz * CHUNK_SIZE + vz * 2;
          const dist = Math.hypot(wx - point.x, wz - point.z);
          if (dist > brushSize) continue;
          const falloff = Math.pow(1 - dist / brushSize, 1.6);
          const index = vz * VERTS + vx;
          if (tool === "raise") record.heights[index] += brushStrength * 0.12 * falloff;
          else if (tool === "lower") record.heights[index] -= brushStrength * 0.12 * falloff;
          else record.heights[index] += (flattenHeight - record.heights[index]) * Math.min(1, brushStrength * 0.08 * falloff);
          changed = true;
        }
      }
      if (changed) touched.push([cx, cz]);
    }
  }
  for (const [cx, cz] of touched) rebuildChunk(cx, cz);
  for (const object of worldMap.objects) {
    if (Math.hypot(object.x - point.x, object.z - point.z) <= brushSize + 3) {
      const mesh = objectMeshes.get(object.id);
      if (mesh) mesh.position.y = terrainHeight(object.x, object.z);
    }
  }
}

function placeObject(point: THREE.Vector3): void {
  const data: MapObject = {
    id: nextObjectId++,
    kind: objectKind,
    x: Math.round(point.x * 10) / 10,
    y: 0,
    z: Math.round(point.z * 10) / 10,
    rotation: Math.random() * Math.PI * 2,
    scale: 0.85 + Math.random() * 0.45,
  };
  worldMap.objects.push(data);
  const object = makeObject(data);
  objectsRoot.add(object);
  objectMeshes.set(data.id, object);
}

function deleteObject(event: PointerEvent): void {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(objectsRoot.children, true)[0];
  if (!hit) return;
  const id = hit.object.userData.mapObjectId;
  worldMap.objects = worldMap.objects.filter((o) => o.id !== id);
  const mesh = objectMeshes.get(id);
  if (mesh) objectsRoot.remove(mesh);
  objectMeshes.delete(id);
}

function setMode(next: "game" | "editor"): void {
  if (next === "editor" && !AUTHOR_MODE) return;
  mode = next;
  ui.panel.hidden = mode !== "editor";
  ui.modeButton.textContent = mode === "editor" ? "进入游戏" : "进入编辑器";
  ui.modeText.textContent = mode === "editor" ? "编辑器模式" : "游戏模式";
  ui.crosshair.hidden = mode !== "game";
  avatar.visible = mode === "game";
  if (document.pointerLockElement) document.exitPointerLock();
  if (mode === "editor") {
    editorTarget.set(player.x, terrainHeight(player.x, player.z), player.z);
    ui.help.textContent = "左键使用笔刷 · 右键拖动旋转 · 滚轮缩放";
    toast("左键使用笔刷 · 右键拖动旋转 · 滚轮缩放");
  } else {
    ui.help.textContent = "WASD 移动 · Shift 奔跑 · Space 跳跃 · 点击锁定鼠标 · Esc 释放";
  }
}

function updateInteractionHint(): void {
  if (mode !== "game" || player.dead || isInventoryOpen() || cutsceneLock) return;
  if (zone === "stasis") {
    if (isAimingStasisPedestal()) {
      ui.help.innerHTML = '调查台座 · 按 <b>Q</b> 获取第二张通行证';
    } else if (isAimingRotatingBridge()) {
      ui.help.innerHTML = stasisTimer > 0
        ? `静止器生效中 · 剩余 ${stasisTimer.toFixed(1)} 秒`
        : '瞄准旋转桥 · 按 <b>Q</b> 静止 6 秒';
    } else if (stasisTimer > 0) {
      ui.help.textContent = `旋转桥已静止 · ${stasisTimer.toFixed(1)} 秒后恢复`;
    } else {
      ui.help.textContent = "静止器机关室 · 瞄准旋转桥按 Q 暂停 · B 背包";
    }
  } else if (zone === "chamber") {
    if (isAimingPassPedestal()) {
      ui.help.innerHTML = '调查台座 · 按 <b>Q</b> 获取机关室通行证';
    } else if (magnetHolding) {
      ui.help.innerHTML = '磁铁吸附中 · 瞄准 10 米内位置按 <b>Q</b> 放下铁箱';
    } else if (isAimingIronBox()) {
      ui.help.innerHTML = '磁铁 · 按 <b>Q</b> 吸住 10 米内的铁箱';
    } else if (buttonPressed && !passTaken) {
      ui.help.textContent = "承重按钮已压下 · 机关门已经打开";
    } else if (passTaken) {
      ui.help.textContent = "已获得机关室通行证 · 按 B 打开 7×5 背包";
    } else {
      ui.help.textContent = "机关室 · Q 使用磁铁 · 用铁箱压住承重按钮 · B 背包";
    }
  } else if (isAimingInvestigationPillar()) {
    if (liftHouseState === "spent") {
      ui.help.textContent = "柱子已经失去反应，无法再次调查";
    } else if (liftHouseState === "raised") {
      ui.help.innerHTML = '调查柱子 · 按 <b>Q</b> 让房屋恢复高度';
    } else {
      ui.help.innerHTML = '调查柱子 · 按 <b>Q</b> 启动升降机关';
    }
  } else if (liftHouseState === "raising") {
    ui.help.textContent = "绿色房屋正在升高…";
  } else if (liftHouseState === "lowering") {
    ui.help.textContent = "绿色房屋正在恢复高度…";
  } else if (isAimingCaveDoor()) {
    ui.help.innerHTML = '看向石门 · 按 <b>Q</b> 让它向上升起';
  } else if (caveDoorOpening) {
    ui.help.textContent = "石门正在向上升起…";
  } else {
    ui.help.textContent =
      "WASD 移动 · 看向石门按 Q 开门 · 仅出口有斜坡，其余是悬崖";
  }
}

function loadMap(data: SandboxMap): void {
  if (!data || data.version !== 1 || !data.chunks || !Array.isArray(data.objects)) {
    throw new Error("不是有效的沙盒地图");
  }
  worldMap = structuredClone(data);
  nextObjectId = Math.max(0, ...worldMap.objects.map((o) => o.id)) + 1;
  for (const mesh of chunkMeshes.values()) {
    chunksRoot.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  chunkMeshes.clear();
  streamChunks(player.x, player.z);
  rebuildObjects();
}

function exportJson(): void {
  const blob = new Blob([JSON.stringify(worldMap, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "backrooms-sandbox-map.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyMapToCode(): Promise<void> {
  const code = "const BUILTIN_MAP = " + JSON.stringify(worldMap, null, 2) + " as const;";
  try {
    await navigator.clipboard.writeText(code);
    toast("BUILTIN_MAP 已复制到剪贴板");
  } catch {
    const area = document.createElement("textarea");
    area.value = code;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast("BUILTIN_MAP 已复制");
  }
}

ui.modeButton.hidden = !AUTHOR_MODE;
ui.modeButton.addEventListener("click", () => setMode(mode === "game" ? "editor" : "game"));
ui.tool.addEventListener("change", () => { tool = ui.tool.value as Tool; });
ui.kind.addEventListener("change", () => { objectKind = ui.kind.value as ObjectKind; });
ui.size.addEventListener("input", () => {
  brushSize = Number(ui.size.value);
  ui.sizeValue.textContent = brushSize.toFixed(1);
});
ui.strength.addEventListener("input", () => {
  brushStrength = Number(ui.strength.value);
  ui.strengthValue.textContent = brushStrength.toFixed(1);
});
document.querySelector("#exportJson")!.addEventListener("click", exportJson);
document.querySelector("#copyCode")!.addEventListener("click", copyMapToCode);
document.querySelector("#importJson")!.addEventListener("click", () => ui.importFile.click());
ui.importFile.addEventListener("change", async () => {
  try {
    const file = ui.importFile.files?.[0];
    if (file) loadMap(JSON.parse(await file.text()));
    toast("地图导入成功");
  } catch (error: any) {
    toast(error.message || "导入失败");
  }
  ui.importFile.value = "";
});

ui.respawnButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!player.dead) return;
  respawnPlayer();
});

addEventListener("keydown", (event) => {
  if (player.dead) return;
  if (cutsceneLock) {
    keys.clear();
    return;
  }
  if (event.code === "KeyB" && !event.repeat && mode === "game") {
    toggleBackpack();
    keys.clear();
    return;
  }
  if (isInventoryOpen()) return;
  keys.add(event.code);
  if (event.code === "KeyQ" && !event.repeat && mode === "game") {
    if (zone === "stasis") {
      if (!tryTakeStasisPass()) tryUseStasisSkill();
    } else if (zone === "chamber") {
      if (!tryTakeMechanismPass()) tryMagnetInteraction();
    } else if (!tryInvestigatePillar()) {
      tryOpenCaveDoor();
    }
  }
  if (event.code === "Escape" && document.pointerLockElement) document.exitPointerLock();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("click", () => {
  if (player.dead || isInventoryOpen() || cutsceneLock) return;
  if (mode === "game" && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
addEventListener("mousemove", (event) => {
  if (player.dead || isInventoryOpen() || cutsceneLock) return;
  if (mode === "game" && document.pointerLockElement === canvas) {
    player.yaw -= event.movementX * 0.0025;
    player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.002, -0.65, 0.2);
  } else if (mode === "editor" && (event.buttons & 2)) {
    editorYaw -= event.movementX * 0.006;
    editorPitch = THREE.MathUtils.clamp(editorPitch + event.movementY * 0.005, 0.18, 1.45);
  }
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("wheel", (event) => {
  if (mode === "editor") {
    editorDistance = THREE.MathUtils.clamp(editorDistance + event.deltaY * 0.035, 8, 120);
    event.preventDefault();
  }
}, { passive: false });
canvas.addEventListener("pointerdown", (event) => {
  if (mode !== "editor" || event.button !== 0) return;
  if (tool === "delete") {
    deleteObject(event);
    return;
  }
  const hit = terrainPick(event);
  if (!hit) return;
  if (tool === "place") {
    placeObject(hit.point);
    return;
  }
  painting = true;
  flattenHeight = hit.point.y;
  applyBrush(hit.point);
});
canvas.addEventListener("pointermove", (event) => {
  if (!painting || mode !== "editor") return;
  const hit = terrainPick(event);
  if (hit) applyBrush(hit.point);
});
addEventListener("pointerup", () => { painting = false; });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 刷新（F5）不保留沙盒进度：清空本局背包/通行证，机关室状态本身已是内存态。
(() => {
  const nav =
    typeof performance !== "undefined" &&
    performance.getEntriesByType &&
    performance.getEntriesByType("navigation")[0];
  if (nav && nav.type === "reload") resetBackpack();
})();

buildSpawnCave();
loadMap(BUILTIN_MAP);
buildLiftHouseMechanism();
buildMechanismChamber();
buildStasisRoom();
buildEnclosureWalls();
mountBackpackPanel(document.body);
setInventoryOpenHandler((open) => {
  keys.clear();
  if (open && document.pointerLockElement) document.exitPointerLock();
  ui.crosshair.style.opacity = open ? "0" : "";
  ui.help.style.opacity = open ? "0" : "";
});
setMode("game");
refreshHearts();
toast("新的旅途开始了 · 看向石门按 Q 开启");

const clock = new THREE.Clock();
let streamTimer = 0;
function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  streamTimer -= dt;
  if (streamTimer <= 0 && zone === "overworld") {
    const center = mode === "game" ? player : editorTarget;
    streamChunks(center.x, center.z);
    streamTimer = 0.35;
  }
  if (mode === "game") {
    updateLiftHouse(dt);
    // 先转桥再算落地，避免空气墙比模型慢一帧导致穿模
    updateStasisRoom(dt);
    updatePlayer(dt);
    updateOldManCutscene(dt);
    updateOrangeHouseEntry();
    updateBlueHouseEntry();
    updateChamberExitAfterPass();
    updateHeldIronBox();
    updateChamberPuzzle(dt);
    updateEnclosureCollapse(dt);
    updateCaveDoor(dt);
    updateInteractionHint();
    updateGameCamera();
  } else {
    updateEditorCamera();
  }
  renderer.render(scene, camera);
}
frame();

// @ts-nocheck
/**
 * Backrooms - 沙盒
 * Three.js + TypeScript 单页开放世界原型。
 *
 * 构建后 Three.js 与本文件会全部内联进 backrooms-sandbox.html，不依赖网络或外部资源。
 * 普通打开：发布/游玩模式；加 ?edit=1：作者模式，可使用地图编辑器。
 */
import * as THREE from "./vendor/three.module.min.js";

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
/** 洞室外围的平台（山顶），门前多留一段平台当出口露台 */
const PLATEAU = {
  minX: -CAVE.halfWidth - 2,
  maxX: CAVE.halfWidth + 2,
  minZ: CAVE.backZ - 2,
  maxZ: CAVE.frontZ + 4,
};
/** 平台边缘到山脚的水平距离，越大坡越缓 */
const HILL_SLOPE_LEN = 32;
/**
 * 编辑器开关。作者自己用的构建保持 true；
 * 要把单个 HTML 发给其他人、只允许游玩时改成 false 再重新打包。
 * 也可以用 ?edit=1 / ?edit=0 临时覆盖，便于快速验证两种模式。
 */
const EDITOR_ENABLED = true;
const editParam = new URLSearchParams(location.search).get("edit");
const AUTHOR_MODE =
  editParam === "1" ? true : editParam === "0" ? false : EDITOR_ENABLED;

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
scene.add(chunksRoot, objectsRoot, caveRoot);

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

type FlatCollider = { minX: number; maxX: number; minZ: number; maxZ: number };
const caveColliders: FlatCollider[] = [];

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
  // 平台内部完全水平，托住洞室的墙体与门槛。
  const outX = Math.max(PLATEAU.minX - wx, 0, wx - PLATEAU.maxX);
  const outZ = Math.max(PLATEAU.minZ - wz, 0, wz - PLATEAU.maxZ);
  const outside = Math.hypot(outX, outZ);
  if (outside <= 0) return CAVE.floorY;
  // 平台外用 smoothstep 过渡到基础地貌，形成四面下坡的山丘。
  const t = Math.min(1, outside / HILL_SLOPE_LEN);
  const ease = t * t * (3 - 2 * t);
  return CAVE.floorY + (baseLandscapeHeight(wx, wz) - CAVE.floorY) * ease;
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
  const oldH = terrainHeight(player.x, player.z);
  const newH = terrainHeight(nx, nz);
  if (
    !objectCollision(nx, player.z) &&
    !blockedByCave(nx, player.z) &&
    Math.abs(terrainHeight(nx, player.z) - oldH) < 1.5
  ) {
    player.x = nx;
  }
  if (
    !objectCollision(player.x, nz) &&
    !blockedByCave(player.x, nz) &&
    Math.abs(newH - terrainHeight(player.x, player.z)) < 1.5
  ) {
    player.z = nz;
  }
  if (keys.has("Space") && player.grounded) {
    player.vy = 7.5;
    player.grounded = false;
  }
  player.vy -= 18 * dt;
  player.y += player.vy * dt;
  const ground = terrainHeight(player.x, player.z);
  if (player.y <= ground) {
    player.y = ground;
    player.vy = 0;
    player.grounded = true;
  }
  avatar.position.set(player.x, player.y, player.z);
  if (Math.abs(dx) + Math.abs(dz) > 0.001) avatar.rotation.y = Math.atan2(dx, dz);
}

/** 玩家是否处在洞室内部（含门口一小段），用来决定镜头要不要被关在洞里 */
function isPlayerInsideCave(): boolean {
  return (
    Math.abs(player.x) <= CAVE.halfWidth &&
    player.z >= CAVE.backZ &&
    player.z <= CAVE.frontZ + 0.5
  );
}

/** 镜头所在点是否穿进了墙体 / 地形 / 洞外 */
function cameraPointBlocked(x: number, y: number, z: number, insideCave: boolean): boolean {
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
  if (mode !== "game") return;
  if (isAimingCaveDoor()) {
    ui.help.innerHTML = '看向石门 · 按 <b>Q</b> 让它向上升起';
  } else if (caveDoorOpening) {
    ui.help.textContent = "石门正在向上升起…";
  } else {
    ui.help.textContent = "WASD 移动 · Shift 奔跑 · Space 跳跃 · 点击锁定鼠标 · Esc 释放";
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

addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyQ" && !event.repeat && mode === "game") tryOpenCaveDoor();
  if (event.code === "Escape" && document.pointerLockElement) document.exitPointerLock();
});
addEventListener("keyup", (event) => keys.delete(event.code));
canvas.addEventListener("click", () => {
  if (mode === "game" && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
addEventListener("mousemove", (event) => {
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

buildSpawnCave();
loadMap(BUILTIN_MAP);
setMode("game");
toast(AUTHOR_MODE ? "作者模式 · 可切换地图编辑器" : "新的旅途开始了");

const clock = new THREE.Clock();
let streamTimer = 0;
function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  streamTimer -= dt;
  if (streamTimer <= 0) {
    const center = mode === "game" ? player : editorTarget;
    streamChunks(center.x, center.z);
    streamTimer = 0.35;
  }
  if (mode === "game") {
    updatePlayer(dt);
    updateCaveDoor(dt);
    updateInteractionHint();
    updateGameCamera();
  } else {
    updateEditorCamera();
  }
  renderer.render(scene, camera);
}
frame();

/**
 * Level 1.5 — “颠倒”
 *
 * 自包含的黑白破碎现实。+Z 是误入层级的假窗，向 -Z 逐渐深入。
 * 除隐藏的切出裂隙外，所有门窗都只会把玩家留在这里。
 */
import * as THREE from "three";

const WIDTH = 24;
const LENGTH = 112;
const HALF_LENGTH = LENGTH * 0.5;
const WALL_HEIGHT = 4.6;
const WALL_THICKNESS = 0.22;

function seededRandom(seed) {
  let state = (seed >>> 0) || 0x15c0ffee;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function invoke(callbacks, name, ...args) {
  if (callbacks && typeof callbacks[name] === "function") {
    return callbacks[name](...args);
  }
  return undefined;
}

function resolveInteraction(target) {
  if (!target) return null;
  if (target.kind) return target;
  let object = target.object || target;
  while (object) {
    if (object.userData && object.userData.brInteract) return object.userData.brInteract;
    object = object.parent;
  }
  return null;
}

function readPlayer(player, originX, originZ) {
  let source = player && player.player ? player.player : player;
  source = source || {};
  if (source.position && Number.isFinite(source.position.x)) source = source.position;
  return {
    x: (Number.isFinite(source.x) ? source.x : originX) - originX,
    y: Number.isFinite(source.y) ? source.y : 0,
    z: (Number.isFinite(source.z) ? source.z : originZ) - originZ,
  };
}

function makeTextTexture(lines, resources, inverted) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = inverted ? "#090909" : "#e8e8e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = inverted ? "#eeeeee" : "#111111";
  ctx.lineWidth = 18;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  ctx.fillStyle = inverted ? "#f4f4f4" : "#090909";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.font = index === 0 ? "bold 58px sans-serif" : "34px sans-serif";
    ctx.fillText(line, canvas.width / 2, 92 + index * 72, canvas.width - 70);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  resources.textures.add(texture);
  return texture;
}

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {{x?:number,z?:number,seed?:number,visible?:boolean}} opts
 */
export function buildLevel1_5World(scene, opts = {}) {
  const originX = Number.isFinite(opts.x) ? opts.x : 0;
  const originZ = Number.isFinite(opts.z) ? opts.z : 0;
  const random = seededRandom(Number.isFinite(opts.seed) ? opts.seed : 150015);
  const group = new THREE.Group();
  group.name = "BackroomsLevel1_5Inverted";
  group.position.set(originX, 0, originZ);
  group.visible = opts.visible !== false;
  if (scene && typeof scene.add === "function") scene.add(group);

  const resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const colliders = [];
  const interactMeshes = [];
  const animatedFragments = [];
  const blackLamps = [];
  const investigated = Object.create(null);
  let disposed = false;
  let elapsed = 0;
  let exitRequest = null;
  let latestCallbacks = {};
  let threatX = 8.5;
  let threatZ = 33;
  let threatAwake = false;
  let threatFury = 0;
  let whisper = 0.78;
  let breath = 0;
  let damageClock = 0;
  let pressure = 0;
  let lastBand = -1;
  let windowCooldown = 0;
  let coreTouched = false;
  let fxGlitch = 0;

  function rememberGeometry(value) {
    resources.geometries.add(value);
    return value;
  }

  function rememberMaterial(value) {
    resources.materials.add(value);
    return value;
  }

  const unitBox = rememberGeometry(new THREE.BoxGeometry(1, 1, 1));
  const planeGeo = rememberGeometry(new THREE.PlaneGeometry(1, 1));
  const frameGeo = rememberGeometry(new THREE.BoxGeometry(1, 1, 1));
  const shardGeo = rememberGeometry(new THREE.TetrahedronGeometry(0.62, 0));

  const materials = {
    white: rememberMaterial(new THREE.MeshStandardMaterial({
      color: 0xf1f1ef,
      emissive: 0xdadada,
      emissiveIntensity: 0.58,
      roughness: 0.9,
    })),
    pale: rememberMaterial(new THREE.MeshStandardMaterial({
      color: 0xc9c9c7,
      emissive: 0x8c8c89,
      emissiveIntensity: 0.42,
      roughness: 0.96,
    })),
    black: rememberMaterial(new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x000000,
      roughness: 1,
    })),
    void: rememberMaterial(new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.91,
      side: THREE.DoubleSide,
      depthWrite: false,
    })),
    glass: rememberMaterial(new THREE.MeshPhysicalMaterial({
      color: 0xeeeeee,
      emissive: 0xffffff,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.18,
      side: THREE.DoubleSide,
    })),
    paper: rememberMaterial(new THREE.MeshStandardMaterial({
      color: 0xe2e2dd,
      emissive: 0x777772,
      emissiveIntensity: 0.22,
      roughness: 1,
      side: THREE.DoubleSide,
    })),
    crack: rememberMaterial(new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    })),
  };

  function addBox(w, h, d, x, y, z, material, parent = group) {
    const result = new THREE.Mesh(unitBox, material);
    result.scale.set(w, h, d);
    result.position.set(x, y, z);
    result.castShadow = false;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }

  function addCollider(minX, maxX, minZ, maxZ, height = WALL_HEIGHT, extra) {
    const collider = {
      kind: "wall",
      minX: minX + originX,
      maxX: maxX + originX,
      minZ: minZ + originZ,
      maxZ: maxZ + originZ,
      minY: 0,
      maxY: height,
      ghost: false,
    };
    if (extra) Object.assign(collider, extra);
    colliders.push(collider);
    return collider;
  }

  function addSolidBox(w, h, d, x, y, z, material, extra) {
    const result = addBox(w, h, d, x, y, z, material);
    addCollider(x - w * 0.5, x + w * 0.5, z - d * 0.5, z + d * 0.5, y + h * 0.5, extra);
    return result;
  }

  function tag(mesh, data) {
    mesh.userData.brInteract = data;
    mesh.userData.level15Interaction = data;
    interactMeshes.push(mesh);
    return mesh;
  }

  // 会自然发出白光的外壳。
  addBox(WIDTH, 0.18, LENGTH, 0, -0.09, 0, materials.white);
  addBox(WIDTH, 0.16, LENGTH, 0, WALL_HEIGHT + 0.08, 0, materials.white);
  addSolidBox(WALL_THICKNESS, WALL_HEIGHT, LENGTH, -WIDTH * 0.5, WALL_HEIGHT * 0.5, 0, materials.black);
  addSolidBox(WALL_THICKNESS, WALL_HEIGHT, LENGTH, WIDTH * 0.5, WALL_HEIGHT * 0.5, 0, materials.white);
  addSolidBox(WIDTH, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT * 0.5, -HALF_LENGTH, materials.black);
  addSolidBox(WIDTH, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT * 0.5, HALF_LENGTH, materials.white);

  // 交错隔墙让 112 米空间形成可探索路线，所有墙体均带 AABB。
  const barriers = [
    [-7.2, 8.7, 36, "white"],
    [6.8, 9.7, 23, "black"],
    [-6.9, 10.2, 10, "black"],
    [7.1, 8.8, -3, "white"],
    [-6.6, 10.8, -16, "white"],
    [6.4, 10.9, -29, "black"],
    [-7.3, 8.5, -42, "black"],
  ];
  barriers.forEach(([x, w, z, materialName], index) => {
    addSolidBox(w, WALL_HEIGHT, WALL_THICKNESS, x, WALL_HEIGHT * 0.5, z, materials[materialName]);
    const lintelX = x + (x < 0 ? w * 0.5 + 2.2 : -w * 0.5 - 2.2);
    const lintel = addBox(3.3, 0.32, 0.5, lintelX, index % 2 ? 0.55 : 4.05, z, materials[index % 2 ? "white" : "black"]);
    lintel.rotation.z = index % 2 ? 0.12 : -0.1;
    if (lintel.position.y < 1) {
      addCollider(lintelX - 1.75, lintelX + 1.75, z - 0.3, z + 0.3, 0.75);
    }
  });

  // 黑暗从荧光灯向下投射，而不是亮光。
  for (let z = 48; z >= -48; z -= 12) {
    const x = ((Math.round((z + 48) / 12) % 3) - 1) * 4.6;
    const fixture = addBox(2.8, 0.09, 0.32, x, WALL_HEIGHT - 0.12, z, materials.black);
    fixture.name = "DarkFluorescentFixture";
    const darkness = addBox(3.4, 3.9, 2.1, x, 2.5, z, materials.void);
    darkness.scale.x = 0.82 + random() * 0.28;
    blackLamps.push({ fixture, darkness, phase: random() * Math.PI * 2 });
  }
  group.add(new THREE.HemisphereLight(0xffffff, 0xbcbcbc, 1.32));
  const ambientWhite = new THREE.AmbientLight(0xffffff, 0.82);
  group.add(ambientWhite);

  // 破碎观：倒置的房间残片悬在“天花板地面”上。
  for (let i = 0; i < 30; i += 1) {
    const fragment = new THREE.Mesh(shardGeo, i % 2 ? materials.black : materials.white);
    fragment.position.set((random() - 0.5) * 20, 2.8 + random() * 1.55, 49 - random() * 99);
    fragment.scale.set(0.35 + random() * 1.2, 0.15 + random() * 0.8, 0.4 + random());
    fragment.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    group.add(fragment);
    animatedFragments.push({
      mesh: fragment,
      baseY: fragment.position.y,
      phase: random() * Math.PI * 2,
      speed: 0.08 + random() * 0.16,
    });
  }
  // 地面上的显著碎片是实体障碍。
  [
    [-8.3, 29, 2.4, 1.1],
    [8.4, 15, 2.1, 1.5],
    [-8.8, 1, 2.6, 1.2],
    [8.1, -23, 2.4, 1.4],
    [-8.2, -36, 2.2, 1.1],
  ].forEach(([x, z, w, d], index) => {
    const debris = addSolidBox(w, 0.72, d, x, 0.36, z, index % 2 ? materials.white : materials.black);
    debris.rotation.z = index % 2 ? 0.08 : -0.1;
  });

  function addWindow(id, x, z, side, destinationZ, entry) {
    const windowGroup = new THREE.Group();
    windowGroup.position.set(x, 0, z);
    windowGroup.name = entry ? "FalseEntryWindow" : `FalseWindow_${id}`;
    group.add(windowGroup);
    const facingX = side !== 0;
    const glass = new THREE.Mesh(planeGeo, materials.glass);
    glass.scale.set(2.65, 2.85, 1);
    glass.position.y = 2.25;
    glass.rotation.y = facingX ? Math.PI * 0.5 : 0;
    windowGroup.add(glass);
    tag(glass, { kind: "level15_window", id, destinationZ, entry });
    const left = new THREE.Mesh(frameGeo, materials.black);
    left.scale.set(0.22, 3.7, 0.22);
    left.position.set(facingX ? 0 : -1.55, 2.25, facingX ? -1.55 : 0);
    windowGroup.add(left);
    const right = left.clone();
    right.position.set(facingX ? 0 : 1.55, 2.25, facingX ? 1.55 : 0);
    windowGroup.add(right);
    const top = new THREE.Mesh(frameGeo, materials.black);
    top.scale.set(facingX ? 0.22 : 3.3, 0.22, facingX ? 3.3 : 0.22);
    top.position.y = 4.05;
    windowGroup.add(top);
    const bottom = top.clone();
    bottom.position.y = 0.45;
    windowGroup.add(bottom);
    // 窗框靠墙摆放，整面墙本身已有碰撞；交互代表主动跨入。
    return glass;
  }

  addWindow("entry", 0, HALF_LENGTH - 0.13, 0, 39, true);
  addWindow("mirror-a", -WIDTH * 0.5 + 0.14, 17, 1, -8, false);
  addWindow("mirror-b", WIDTH * 0.5 - 0.14, -10, 1, -34, false);
  addWindow("mirror-c", -WIDTH * 0.5 + 0.14, -33, 1, -47, false);

  function addLog(id, x, z, title, text, inverted) {
    const texture = makeTextTexture([title, "u/Chaosraider98", "信号残缺", `日志 ${id}`], resources, inverted);
    const material = rememberMaterial(new THREE.MeshBasicMaterial({
      map: texture || undefined,
      color: texture ? 0xffffff : (inverted ? 0x111111 : 0xe3e3df),
      side: THREE.DoubleSide,
    }));
    const page = new THREE.Mesh(rememberGeometry(new THREE.PlaneGeometry(1.45, 1.0)), material);
    page.position.set(x, 0.035, z);
    page.rotation.x = -Math.PI * 0.5;
    page.rotation.z = (random() - 0.5) * 0.7;
    page.name = `Level1_5Log${id}`;
    group.add(page);
    tag(page, { kind: "level15_log", id, title, text });
  }

  addLog(
    1,
    -8.3,
    41,
    "日志 1：假的窗户",
    "不要进入假的窗户，那是陷阱。这里只有寂静；一切支离破碎，像现实被切碎后打上马赛克。",
    false
  );
  addLog(
    3,
    8.6,
    4.5,
    "日志 3：低语者",
    "这里的一切都是颠倒的。环境发亮，灯管释放黑暗。低语越轻，他们就离你越近。",
    true
  );
  addLog(
    5,
    -8.5,
    -30,
    "日志 5：那扇门",
    "低语没有变响。我一直在逃。深处出现一扇门，但那股牵引感正要把我带去不该去的地方。",
    false
  );

  // 唯一出口：侧墙阴影后的细小切出裂隙，没有灯光或指示。
  const crack = new THREE.Mesh(rememberGeometry(new THREE.PlaneGeometry(0.34, 1.35)), materials.crack);
  crack.position.set(-WIDTH * 0.5 + 0.105, 1.15, -19.4);
  crack.rotation.y = Math.PI * 0.5;
  crack.name = "HiddenNoclipSeam";
  group.add(crack);
  tag(crack, { kind: "level15_noclip" });

  // 深处核心门只有诱骗作用，后面仍是封死的墙。
  const doorTexture = makeTextTexture(["核心", "进 来", "母亲爱你"], resources, true);
  const doorMaterial = rememberMaterial(new THREE.MeshBasicMaterial({
    map: doorTexture || undefined,
    color: doorTexture ? 0xffffff : 0x020202,
  }));
  const coreDoor = addBox(3.2, 4.15, 0.09, 0, 2.08, -HALF_LENGTH + 0.13, doorMaterial);
  coreDoor.name = "FalseCoreDoor";
  tag(coreDoor, { kind: "level15_core" });
  const coreFrameLeft = addSolidBox(0.3, 4.5, 0.38, -1.75, 2.25, -HALF_LENGTH + 0.2, materials.white);
  const coreFrameRight = addSolidBox(0.3, 4.5, 0.38, 1.75, 2.25, -HALF_LENGTH + 0.2, materials.black);
  coreFrameLeft.name = "CoreFrameLeft";
  coreFrameRight.name = "CoreFrameRight";

  function teleportDeeper(data, callbacks) {
    if (windowCooldown > 0) return false;
    windowCooldown = 1.2;
    const destination = {
      x: originX + (data.id === "mirror-b" ? -7.2 : 6.8),
      y: 0.36,
      z: originZ + data.destinationZ,
      yaw: Math.PI,
      roll: Math.PI,
    };
    invoke(callbacks, "onTeleport", {
      source: "level1.5_false_window",
      destination,
      trap: true,
      windowId: data.id,
    });
    invoke(callbacks, "showToast", data.entry
      ? "窗户在身后无声消失。你已落入 Level 1.5。"
      : "玻璃翻到现实的另一面；你被送往了更深处。");
    threatAwake = true;
    threatZ = Math.min(threatZ, data.destinationZ + 10);
    fxGlitch = 1;
    return true;
  }

  function update(dt, player, callbacks = {}) {
    if (disposed) return getSurvivalEnv();
    latestCallbacks = callbacks;
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.12));
    elapsed += step;
    windowCooldown = Math.max(0, windowCooldown - step);
    fxGlitch = Math.max(0, fxGlitch - step * 0.45);
    const position = readPlayer(player, originX, originZ);
    const depth = THREE.MathUtils.clamp((HALF_LENGTH - position.z) / LENGTH, 0, 1);

    blackLamps.forEach((lamp, index) => {
      const flicker = Math.sin(elapsed * (4.1 + index * 0.17) + lamp.phase);
      lamp.darkness.material.opacity = 0.84 + Math.max(0, flicker) * 0.1;
      lamp.darkness.scale.y = 0.88 + Math.max(0, flicker) * 0.16;
    });
    animatedFragments.forEach((fragment) => {
      fragment.mesh.position.y = fragment.baseY + Math.sin(elapsed * fragment.speed + fragment.phase) * 0.14;
      fragment.mesh.rotation.y += step * fragment.speed;
    });

    if (depth > 0.16) threatAwake = true;
    if (threatAwake) {
      const dx = position.x - threatX;
      const dz = position.z - threatZ;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
      const chaseSpeed = (0.72 + depth * 1.12 + threatFury * 0.78) * step;
      threatX += (dx / distance) * Math.min(chaseSpeed, Math.max(0, distance - 0.35));
      threatZ += (dz / distance) * Math.min(chaseSpeed, Math.max(0, distance - 0.35));
      const currentDistance = Math.hypot(position.x - threatX, position.z - threatZ);
      // Wiki 的反常规律：离原住民越近，低语越小。
      whisper = THREE.MathUtils.clamp((currentDistance - 1.3) / 19, 0, 1);
      breath = THREE.MathUtils.clamp(1 - (currentDistance - 0.6) / 7.4, 0, 1);
      pressure = 0.08 + depth * 0.15 + breath * 0.72;
      if (currentDistance < 7.5) fxGlitch = Math.max(fxGlitch, (7.5 - currentDistance) / 7.5 * 0.48);
      invoke(callbacks, "onSanityPressure", pressure, {
        source: "level1.5_whisperer",
        depth,
        whisperVolume: whisper,
        breathIntensity: breath,
        threatVisible: false,
        rule: "quieter_means_closer",
      });
      if (currentDistance < 2.15) {
        damageClock += step;
        if (damageClock >= 1.15) {
          damageClock %= 1.15;
          invoke(callbacks, "onDamage", coreTouched ? 9 : 6, {
            source: "level1.5_invisible_native",
            type: "chase",
            invisible: true,
            breathIntensity: breath,
          });
          invoke(callbacks, "showToast", "冰冷坚硬的东西贴在你背后呼吸。你仍然什么都看不见。");
        }
      } else {
        damageClock = 0;
      }
    } else {
      whisper = 0.82;
      breath = 0;
      pressure = 0.06;
      invoke(callbacks, "onSanityPressure", pressure, {
        source: "level1.5_silence",
        depth,
        whisperVolume: whisper,
      });
    }

    const band = Math.min(3, Math.floor(depth * 4));
    if (band !== lastBand) {
      lastBand = band;
      if (band === 1) invoke(callbacks, "showToast", "嗡鸣并不存在。远处低语反而清晰得令人安心。");
      if (band === 2) invoke(callbacks, "showToast", "低语正在减小。不要把安静误认为安全。");
      if (band === 3) invoke(callbacks, "showToast", "某种呼吸跟上了你，但走廊里空无一物。");
    }
    return getSurvivalEnv();
  }

  function drawFx(canvas, now = 0) {
    if (disposed || !canvas || typeof canvas.getContext !== "function") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width || 1;
    const height = canvas.height || 1;
    const time = (Number(now) || elapsed * 1000) * 0.001;
    ctx.save();
    // 发白的环境侵蚀边缘，灯下则出现反相黑块。
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      height * 0.14,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    glow.addColorStop(0, "rgba(255,255,255,0)");
    glow.addColorStop(1, `rgba(255,255,255,${(0.035 + pressure * 0.08).toFixed(3)})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    if (breath > 0.03) {
      ctx.globalAlpha = breath * 0.28;
      ctx.fillStyle = "#050505";
      const pulse = 0.9 + Math.sin(time * 5.2) * 0.1;
      ctx.fillRect(0, 0, width * 0.08 * pulse, height);
      ctx.fillRect(width * (1 - 0.08 * pulse), 0, width * 0.08 * pulse, height);
    }
    if (fxGlitch > 0.01) {
      ctx.globalAlpha = fxGlitch * 0.24;
      for (let i = 0; i < 8; i += 1) {
        const y = ((i * 0.137 + time * 0.19) % 1) * height;
        ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
        ctx.fillRect(0, y, width, 2 + (i % 3) * 3);
      }
    }
    ctx.restore();
  }

  function getSurvivalEnv() {
    return {
      id: "level1.5",
      name: "Level 1.5 — 颠倒",
      classification: "unknown",
      temperature: 15,
      humidity: 0.46,
      sanityDrainPerSec: pressure,
      skipPassiveSanity: false,
      hasEntities: true,
      entitiesVisible: false,
      whisperVolume: whisper,
      whisperRule: "quieter_means_closer",
      breathIntensity: breath,
      inverted: true,
      naturalWhiteEmission: true,
      fluorescentDarkness: true,
      knownBases: 0,
      onlyExit: "noclip",
    };
  }

  function getInteractionHint(target) {
    const data = resolveInteraction(target);
    if (!data) return "";
    if (data.kind === "level15_log") {
      return investigated[`log:${data.id}`]
        ? `${data.title} · 已读`
        : `${data.title} · 按 Q 调查`;
    }
    if (data.kind === "level15_window") {
      return data.entry ? "触碰假窗户（陷阱）" : "跨入发白的假窗户";
    }
    if (data.kind === "level15_noclip") return "极细的接缝似乎不属于这面墙 · 尝试切出";
    if (data.kind === "level15_core") return coreTouched
      ? "门后只剩下更近的呼吸"
      : "打开通往“核心”的门（强烈牵引感）";
    return "";
  }

  function interact(target, callbacks = latestCallbacks) {
    if (disposed) return false;
    callbacks = callbacks || {};
    const data = resolveInteraction(target);
    if (!data) return false;
    if (data.kind === "level15_log") {
      investigated[`log:${data.id}`] = true;
      invoke(callbacks, "showToast", `${data.title}：${data.text}`);
      invoke(callbacks, "onInvestigate", {
        source: "level1.5",
        kind: "log",
        id: data.id,
        title: data.title,
        text: data.text,
      });
      return true;
    }
    if (data.kind === "level15_window") return teleportDeeper(data, callbacks);
    if (data.kind === "level15_noclip") {
      exitRequest = {
        level: "level1",
        target: "level1",
        destination: "level1",
        reason: "noclip_from_level1.5",
        method: "noclip",
      };
      invoke(callbacks, "showToast", "你侧身挤入不存在的接缝，从破碎现实中切回了 Level 1。");
      return true;
    }
    if (data.kind === "level15_core") {
      coreTouched = true;
      threatAwake = true;
      threatFury = 1;
      threatX = 0.8;
      threatZ = -HALF_LENGTH + 3.1;
      fxGlitch = 1;
      invoke(callbacks, "onDamage", 14, {
        source: "level1.5_false_core",
        type: "lure",
        isExit: false,
      });
      invoke(callbacks, "onSanityPressure", 1, {
        source: "level1.5_mother",
        message: "过来，孩子。妈妈爱你。",
      });
      invoke(callbacks, "showToast", "门没有打开。低语彻底停止——某种东西已经站在你身后。");
      return true;
    }
    return false;
  }

  function getExitRequest(clear = false) {
    const request = exitRequest ? { ...exitRequest } : null;
    if (clear) exitRequest = null;
    return request;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    interactMeshes.length = 0;
    colliders.length = 0;
    animatedFragments.length = 0;
    blackLamps.length = 0;
    resources.geometries.forEach((value) => value.dispose());
    resources.materials.forEach((value) => value.dispose());
    resources.textures.forEach((value) => value.dispose());
    resources.geometries.clear();
    resources.materials.clear();
    resources.textures.clear();
    latestCallbacks = {};
    group.clear();
  }

  return {
    group,
    colliders,
    interactMeshes,
    spawn: {
      x: originX,
      y: 0.36,
      z: originZ + HALF_LENGTH - 3.3,
      yaw: Math.PI,
      roll: Math.PI,
    },
    update,
    drawFx,
    getSurvivalEnv,
    getInteractionHint,
    interact,
    getExitRequest,
    dispose,
  };
}

export default buildLevel1_5World;

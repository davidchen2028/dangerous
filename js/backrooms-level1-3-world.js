/**
 * Level 1.3 — “恶性肿瘤”
 *
 * A self-contained, decayed medical sublevel. The only runtime dependency is
 * Three.js; consumers may attach the returned group to any scene-like parent.
 */
import * as THREE from "three";

const HALL_HALF_LENGTH = 54;
const HALL_HALF_WIDTH = 4;
const WALL_HEIGHT = 4.4;
const WALL_THICKNESS = 0.18;
const ROOM_DEPTH = 7;
const ROOM_WIDTH = 8;
const DOOR_WIDTH = 2.25;
const EXIT_MARGIN = 1.25;
const DETOX_TICK_SECONDS = 1.35;

const ROOM_XS = [-45, -33, -21, -9, 9, 21, 33, 45];
const MALIGNANT_DETOX = new Set([1, 4, 5, 7]);

function invoke(callbacks, name, ...args) {
  if (callbacks && typeof callbacks[name] === "function") {
    return callbacks[name](...args);
  }
  return undefined;
}

function playerPosition(player) {
  if (!player) return null;
  if (player.position && Number.isFinite(player.position.x)) return player.position;
  if (Number.isFinite(player.x) && Number.isFinite(player.z)) return player;
  return null;
}

function addCollider(list, minX, maxX, minZ, maxZ, height = WALL_HEIGHT) {
  const collider = {
    kind: "wall",
    minX,
    maxX,
    minZ,
    maxZ,
    minY: 0,
    maxY: height,
  };
  list.push(collider);
  return collider;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function makeLabelTexture(lines, style, resources) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const background = style.background || "#ecece8";
  const foreground = style.foreground || "#151515";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (style.border) {
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 24;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
  }
  ctx.fillStyle = foreground;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.font = `${index === 0 ? "bold 62px" : "38px"} sans-serif`;
    ctx.fillText(line, canvas.width / 2, 106 + index * 86);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  resources.textures.add(texture);
  return texture;
}

function tagInteract(mesh, data, interactMeshes) {
  mesh.userData.brInteract = data;
  mesh.userData.level13Interaction = data;
  interactMeshes.push(mesh);
  return mesh;
}

function resolveInteraction(target) {
  let current = target;
  while (current) {
    if (current.userData) {
      if (current.userData.level13Interaction) return current.userData.level13Interaction;
      if (current.userData.brInteract && current.userData.brInteract.level === "1.3") {
        return current.userData.brInteract;
      }
    }
    current = current.parent;
  }
  return null;
}

/**
 * @param {THREE.Object3D} scene
 * @param {{seed?: number, visible?: boolean}} opts
 */
export function buildLevel1_3World(scene, opts = {}) {
  const resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const colliders = [];
  const interactMeshes = [];
  const detoxZones = [];
  const group = new THREE.Group();
  group.name = "Level1_3_MalignantTumor";
  group.visible = opts.visible !== false;
  if (scene && typeof scene.add === "function") scene.add(group);

  let disposed = false;
  let elapsed = 0;
  let exitRequest = null;
  let activeDetox = null;
  let detoxAccumulator = 0;
  let fxIntensity = 0;
  let supplyTaken = false;
  let documentRead = false;

  function geometry(value) {
    resources.geometries.add(value);
    return value;
  }

  function material(value) {
    resources.materials.add(value);
    return value;
  }

  function mesh(geo, mat, parent = group) {
    const result = new THREE.Mesh(geo, mat);
    parent.add(result);
    return result;
  }

  const whiteMat = material(new THREE.MeshStandardMaterial({
    color: 0xdededa,
    roughness: 0.82,
    metalness: 0.02,
  }));
  const wallMat = material(new THREE.MeshStandardMaterial({
    color: 0xe9e9e5,
    roughness: 0.74,
    emissive: 0x171714,
    emissiveIntensity: 0.12,
  }));
  const darkMat = material(new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 1,
  }));
  const bloodMat = material(new THREE.MeshStandardMaterial({
    color: 0x4f0906,
    roughness: 0.96,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  }));
  const greenMat = material(new THREE.MeshStandardMaterial({
    color: 0x3b7855,
    emissive: 0x123622,
    emissiveIntensity: 0.42,
    roughness: 0.7,
  }));
  const sickGreenMat = material(new THREE.MeshStandardMaterial({
    color: 0x52663b,
    emissive: 0x27300e,
    emissiveIntensity: 0.48,
    roughness: 0.82,
  }));
  const metalMat = material(new THREE.MeshStandardMaterial({
    color: 0x737b7c,
    metalness: 0.68,
    roughness: 0.38,
  }));
  const redLightMat = material(new THREE.MeshStandardMaterial({
    color: 0x55110d,
    emissive: 0x9a130b,
    emissiveIntensity: 1.8,
    roughness: 0.45,
  }));

  const floorGeo = geometry(new THREE.BoxGeometry(HALL_HALF_LENGTH * 2, 0.16, HALL_HALF_WIDTH * 2));
  const hallFloor = mesh(floorGeo, whiteMat);
  hallFloor.position.y = -0.08;
  const ceiling = mesh(
    geometry(new THREE.BoxGeometry(HALL_HALF_LENGTH * 2, 0.12, HALL_HALF_WIDTH * 2)),
    wallMat
  );
  ceiling.position.y = WALL_HEIGHT;

  // The central line makes the "left/right" origin of the level immediately legible.
  const centerStripe = mesh(
    geometry(new THREE.BoxGeometry(HALL_HALF_LENGTH * 2 - 5, 0.012, 0.055)),
    metalMat
  );
  centerStripe.position.set(0, 0.012, 0);

  function addWall(x, y, z, width, height, depth, rotationZ = 0, mat = wallMat) {
    const wall = mesh(geometry(new THREE.BoxGeometry(width, height, depth)), mat);
    wall.position.set(x, y, z);
    wall.rotation.z = rotationZ;
    return wall;
  }

  // End walls frame two unstable noclip planes; only their central gaps are open.
  [-1, 1].forEach((direction) => {
    const x = direction * HALL_HALF_LENGTH;
    addWall(x, WALL_HEIGHT / 2, -2.75, WALL_THICKNESS, WALL_HEIGHT, 2.5);
    addWall(x, WALL_HEIGHT / 2, 2.75, WALL_THICKNESS, WALL_HEIGHT, 2.5);
    addCollider(colliders, x - WALL_THICKNESS, x + WALL_THICKNESS, -HALL_HALF_WIDTH, -1.5);
    addCollider(colliders, x - WALL_THICKNESS, x + WALL_THICKNESS, 1.5, HALL_HALF_WIDTH);
    const exitPlane = mesh(
      geometry(new THREE.PlaneGeometry(3, 3.7)),
      darkMat
    );
    exitPlane.position.set(x - direction * 0.03, 1.85, 0);
    exitPlane.rotation.y = direction > 0 ? -Math.PI / 2 : Math.PI / 2;
  });

  // Corridor side walls are segmented around all sixteen room openings.
  [-1, 1].forEach((side) => {
    let start = -HALL_HALF_LENGTH;
    ROOM_XS.forEach((x) => {
      const end = x - DOOR_WIDTH / 2;
      const length = end - start;
      if (length > 0.05) {
        addWall((start + end) / 2, WALL_HEIGHT / 2, side * HALL_HALF_WIDTH, length, WALL_HEIGHT, WALL_THICKNESS);
        addCollider(
          colliders,
          start,
          end,
          side > 0 ? HALL_HALF_WIDTH - 0.08 : -HALL_HALF_WIDTH - WALL_THICKNESS,
          side > 0 ? HALL_HALF_WIDTH + WALL_THICKNESS : -HALL_HALF_WIDTH + 0.08
        );
      }
      start = x + DOOR_WIDTH / 2;
    });
    if (start < HALL_HALF_LENGTH) {
      addWall((start + HALL_HALF_LENGTH) / 2, WALL_HEIGHT / 2, side * HALL_HALF_WIDTH, HALL_HALF_LENGTH - start, WALL_HEIGHT, WALL_THICKNESS);
      addCollider(
        colliders,
        start,
        HALL_HALF_LENGTH,
        side > 0 ? HALL_HALF_WIDTH - 0.08 : -HALL_HALF_WIDTH - WALL_THICKNESS,
        side > 0 ? HALL_HALF_WIDTH + WALL_THICKNESS : -HALL_HALF_WIDTH + 0.08
      );
    }
  });

  const roomFloorGeo = geometry(new THREE.BoxGeometry(ROOM_WIDTH, 0.14, ROOM_DEPTH));
  const roomCeilGeo = geometry(new THREE.BoxGeometry(ROOM_WIDTH, 0.1, ROOM_DEPTH));
  const sideWallGeo = geometry(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH));
  const outerWallGeo = geometry(new THREE.BoxGeometry(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS));
  const detoxRingGeo = geometry(new THREE.RingGeometry(1.25, 1.45, 32));
  const bedGeo = geometry(new THREE.BoxGeometry(2.75, 0.28, 1.05));
  const legGeo = geometry(new THREE.BoxGeometry(0.1, 0.7, 0.1));
  const cabinetGeo = geometry(new THREE.BoxGeometry(1.3, 1.6, 0.55));

  function addRoom(x, side, index) {
    const roomIndex = index * 2 + (side > 0 ? 1 : 0);
    const isDetox = (roomIndex % 2) === 0;
    const centerZ = side * (HALL_HALF_WIDTH + ROOM_DEPTH / 2);
    const outerZ = side * (HALL_HALF_WIDTH + ROOM_DEPTH);
    const roomGroup = new THREE.Group();
    roomGroup.name = `${isDetox ? "Detox" : "Ward"}_${roomIndex + 1}`;
    group.add(roomGroup);

    const floor = mesh(roomFloorGeo, whiteMat, roomGroup);
    floor.position.set(x, -0.07, centerZ);
    const ceil = mesh(roomCeilGeo, wallMat, roomGroup);
    ceil.position.set(x, WALL_HEIGHT, centerZ);
    const leftWall = mesh(sideWallGeo, wallMat, roomGroup);
    leftWall.position.set(x - ROOM_WIDTH / 2, WALL_HEIGHT / 2, centerZ);
    const rightWall = mesh(sideWallGeo, wallMat, roomGroup);
    rightWall.position.set(x + ROOM_WIDTH / 2, WALL_HEIGHT / 2, centerZ);
    const outerWall = mesh(outerWallGeo, wallMat, roomGroup);
    outerWall.position.set(x, WALL_HEIGHT / 2, outerZ);

    addCollider(colliders, x - ROOM_WIDTH / 2 - 0.08, x - ROOM_WIDTH / 2 + 0.08, centerZ - ROOM_DEPTH / 2, centerZ + ROOM_DEPTH / 2);
    addCollider(colliders, x + ROOM_WIDTH / 2 - 0.08, x + ROOM_WIDTH / 2 + 0.08, centerZ - ROOM_DEPTH / 2, centerZ + ROOM_DEPTH / 2);
    addCollider(
      colliders,
      x - ROOM_WIDTH / 2,
      x + ROOM_WIDTH / 2,
      outerZ - WALL_THICKNESS,
      outerZ + WALL_THICKNESS
    );

    // Bent panels imply that the formerly indestructible shell is collapsing.
    if (roomIndex % 3 !== 0) {
      const bent = addWall(
        x + (roomIndex % 2 ? 1.45 : -1.35),
        2.15,
        outerZ - side * 0.22,
        2.7,
        3.65,
        0.12,
        (roomIndex % 2 ? 1 : -1) * 0.11,
        wallMat
      );
      bent.rotation.x = side * 0.08;
    }

    if (isDetox) {
      const detoxIndex = detoxZones.length;
      const malignant = MALIGNANT_DETOX.has(detoxIndex);
      const zoneZ = centerZ + side * 0.25;
      const ring = mesh(detoxRingGeo, malignant ? sickGreenMat : greenMat, roomGroup);
      ring.position.set(x, 0.012, zoneZ);
      ring.rotation.x = -Math.PI / 2;
      const pick = tagInteract(
        mesh(
          geometry(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24)),
          material(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })),
          roomGroup
        ),
        { level: "1.3", kind: "detox", index: detoxIndex, malignant },
        interactMeshes
      );
      pick.position.set(x, 0.06, zoneZ);
      detoxZones.push({
        index: detoxIndex,
        x,
        z: zoneZ,
        radius: 1.72,
        malignant,
        ring,
      });

      const labelTexture = makeLabelTexture(
        ["排毒区", `区域 ${detoxIndex + 1} · ${malignant ? "状态未知" : "低功率"}`],
        { background: "#e9eee8", foreground: malignant ? "#5b170f" : "#17482c", border: malignant ? "#6b1a12" : "#378557" },
        resources
      );
      const signMat = material(new THREE.MeshBasicMaterial({
        map: labelTexture || undefined,
        color: labelTexture ? 0xffffff : (malignant ? 0x6b1a12 : 0x378557),
      }));
      const sign = mesh(geometry(new THREE.PlaneGeometry(2.8, 1.4)), signMat, roomGroup);
      sign.position.set(x, 2.65, outerZ - side * 0.12);
      sign.rotation.y = side > 0 ? Math.PI : 0;
    } else {
      const bed = mesh(bedGeo, whiteMat, roomGroup);
      bed.position.set(x, 0.75, centerZ + side * 0.55);
      for (let legIndex = 0; legIndex < 4; legIndex += 1) {
        const leg = mesh(legGeo, metalMat, roomGroup);
        leg.position.set(
          x + (legIndex % 2 ? 1.1 : -1.1),
          0.35,
          centerZ + side * 0.55 + (legIndex > 1 ? 0.36 : -0.36)
        );
      }
      const cabinet = mesh(cabinetGeo, metalMat, roomGroup);
      cabinet.position.set(x + (roomIndex % 4 ? 2.6 : -2.6), 0.8, centerZ + side * 1.35);
      addCollider(colliders, x - 1.45, x + 1.45, bed.position.z - 0.62, bed.position.z + 0.62, 1);
      addCollider(
        colliders,
        cabinet.position.x - 0.72,
        cabinet.position.x + 0.72,
        cabinet.position.z - 0.36,
        cabinet.position.z + 0.36,
        1.7
      );
    }
  }

  ROOM_XS.forEach((x, index) => {
    addRoom(x, -1, index);
    addRoom(x, 1, index);
  });

  // Black voids and dried blood puncture the otherwise sterile palette.
  const holeGeo = geometry(new THREE.CircleGeometry(1, 22));
  [
    [-37, -3.94, 1.0, 0.68],
    [-15, 3.94, 0.82, 1.22],
    [3, -3.94, 1.25, 0.6],
    [27, 3.94, 1.05, 0.9],
    [41, -3.94, 0.72, 1.35],
  ].forEach(([x, z, sx, sy], index) => {
    const hole = mesh(holeGeo, darkMat);
    hole.position.set(x, 2.05 + (index % 2) * 0.5, z - Math.sign(z) * 0.015);
    hole.scale.set(sx, sy, 1);
    hole.rotation.y = z > 0 ? Math.PI : 0;
    // “衰退”黑洞不是可穿越入口；为其所在墙面补一段明确碰撞。
    addCollider(
      colliders,
      x - sx - 0.18,
      x + sx + 0.18,
      z - 0.24,
      z + 0.24
    );
  });

  const bloodGeo = geometry(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < 13; i += 1) {
    const stain = mesh(bloodGeo, bloodMat);
    stain.position.set(-43 + i * 7.2, 0.008, Math.sin(i * 2.1) * 2.2);
    stain.rotation.x = -Math.PI / 2;
    stain.rotation.z = i * 0.91;
    stain.scale.set(1.5 + (i % 3) * 0.55, 0.18 + (i % 4) * 0.11, 1);
  }

  // Safe supply station: unlike the detox fields, this remains mechanically safe.
  const supplyGroup = new THREE.Group();
  supplyGroup.name = "EmergencyMedicalCache";
  supplyGroup.position.set(0, 0, -2.85);
  group.add(supplyGroup);
  const supplyCabinet = tagInteract(
    mesh(geometry(new THREE.BoxGeometry(1.55, 1.65, 0.58)), whiteMat, supplyGroup),
    { level: "1.3", kind: "supply" },
    interactMeshes
  );
  supplyCabinet.position.y = 0.83;
  const crossV = mesh(geometry(new THREE.BoxGeometry(0.18, 0.72, 0.04)), redLightMat, supplyGroup);
  crossV.position.set(0, 1.08, 0.315);
  const crossH = mesh(geometry(new THREE.BoxGeometry(0.7, 0.18, 0.04)), redLightMat, supplyGroup);
  crossH.position.set(0, 1.08, 0.315);
  addCollider(colliders, -0.82, 0.82, -3.2, -2.52, 1.7);

  // M.E.G. blockade document and warning lamp.
  const docTexture = makeLabelTexture(
    ["M.E.G. 紧急封锁令", "Level 1.3 已重分级为死区", "入口封禁 · 排毒区可致过度增生"],
    { background: "#e5dfd1", foreground: "#17140f", border: "#851a13" },
    resources
  );
  const doc = tagInteract(
    mesh(
      geometry(new THREE.PlaneGeometry(3.9, 1.95)),
      material(new THREE.MeshBasicMaterial({
        map: docTexture || undefined,
        color: docTexture ? 0xffffff : 0xe5dfd1,
        side: THREE.DoubleSide,
      }))
    ),
    { level: "1.3", kind: "document" },
    interactMeshes
  );
  doc.position.set(-1.9, 2.05, 3.87);
  doc.rotation.y = Math.PI;
  const warningLight = mesh(geometry(new THREE.SphereGeometry(0.18, 12, 8)), redLightMat);
  warningLight.position.set(0.55, 3.55, 3.7);
  const redLight = new THREE.PointLight(0xaa160e, 1.15, 11, 2);
  redLight.position.copy(warningLight.position);
  group.add(redLight);

  const ambient = new THREE.HemisphereLight(0xf1f1eb, 0x30302d, 1.05);
  group.add(ambient);
  [-40, -20, 0, 20, 40].forEach((x, index) => {
    const light = new THREE.PointLight(index % 2 ? 0xecece5 : 0xffe9df, 0.66, 22, 1.8);
    light.position.set(x, WALL_HEIGHT - 0.28, index % 2 ? 1.5 : -1.5);
    group.add(light);
  });

  function applyDetox(zone, callbacks, fromInteraction) {
    if (zone.malignant) {
      invoke(callbacks, "heal", 2, { source: "level1.3_detox_overgrowth" });
      invoke(callbacks, "onDamage", 12, {
        source: "level1.3_malignant_detox",
        type: "biological",
      });
      invoke(callbacks, "showToast", fromInteraction
        ? "伤口瞬间闭合——随后新生组织开始撕裂。"
        : "排毒区正在强迫身体过度增生：−12");
      fxIntensity = Math.max(fxIntensity, 0.9);
    } else {
      invoke(callbacks, "heal", 8, { source: "level1.3_detox" });
      invoke(callbacks, "showToast", fromInteraction
        ? "低功率排毒场仍在运作，灼痛后伤势开始恢复。"
        : "排毒场净化：+8");
      fxIntensity = Math.max(fxIntensity, 0.22);
    }
  }

  function update(dt, player, callbacks = {}) {
    if (disposed) return;
    const step = Math.max(0, Number(dt) || 0);
    elapsed += step;
    fxIntensity = Math.max(0, fxIntensity - step * 0.23);
    redLight.intensity = 0.85 + Math.sin(elapsed * 5.8) * 0.3;
    redLightMat.emissiveIntensity = 1.45 + Math.sin(elapsed * 5.8) * 0.45;

    detoxZones.forEach((zone, index) => {
      zone.ring.rotation.z = elapsed * (zone.malignant ? -0.28 : 0.16) + index;
      zone.ring.material.emissiveIntensity = zone.malignant
        ? 0.4 + Math.max(0, Math.sin(elapsed * 4.5 + index)) * 0.38
        : 0.32 + Math.max(0, Math.sin(elapsed * 1.7 + index)) * 0.18;
    });

    const pos = playerPosition(player);
    if (!pos) return;
    if (pos.x < -HALL_HALF_LENGTH - EXIT_MARGIN) {
      exitRequest = { level: "level1", target: "level1", side: "left", reason: "noclip" };
    } else if (pos.x > HALL_HALF_LENGTH + EXIT_MARGIN) {
      exitRequest = { level: "level1", target: "level1", side: "right", reason: "noclip" };
    }

    let inside = null;
    for (let i = 0; i < detoxZones.length; i += 1) {
      const zone = detoxZones[i];
      const dx = pos.x - zone.x;
      const dz = pos.z - zone.z;
      if (dx * dx + dz * dz <= zone.radius * zone.radius) {
        inside = zone;
        break;
      }
    }
    if (inside !== activeDetox) {
      activeDetox = inside;
      detoxAccumulator = 0;
      if (inside) {
        invoke(callbacks, "showToast", inside.malignant
          ? "排毒区嗡鸣失真。你的皮肤下有什么正在生长。"
          : "你踏入一处仍然稳定的低功率排毒区。");
      }
    }
    if (activeDetox) {
      detoxAccumulator += step;
      fxIntensity = Math.max(fxIntensity, activeDetox.malignant ? 0.56 : 0.12);
      while (detoxAccumulator >= DETOX_TICK_SECONDS) {
        detoxAccumulator -= DETOX_TICK_SECONDS;
        applyDetox(activeDetox, callbacks, false);
      }
    }
  }

  function drawFx(canvas, now = 0) {
    if (!canvas || fxIntensity <= 0.005) return;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width || canvas.clientWidth || 1;
    const height = canvas.height || canvas.clientHeight || 1;
    ctx.save();
    const pulse = 0.82 + Math.sin((Number(now) || 0) * 0.009) * 0.18;
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.17,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.68
    );
    gradient.addColorStop(0, "rgba(70,0,0,0)");
    gradient.addColorStop(0.67, `rgba(72,0,0,${fxIntensity * 0.08 * pulse})`);
    gradient.addColorStop(1, `rgba(30,0,0,${fxIntensity * 0.48 * pulse})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = fxIntensity * 0.14;
    ctx.fillStyle = "#8b140c";
    for (let i = 0; i < 7; i += 1) {
      const x = ((i * 0.173 + (Number(now) || 0) * 0.00003) % 1) * width;
      roundedRectPath(ctx, x, height * (0.1 + (i % 4) * 0.21), 2 + (i % 3), height * 0.13, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function getSurvivalEnv() {
    return {
      id: "level1.3",
      name: "Level 1.3 — 恶性肿瘤",
      classification: "deadzone",
      temperature: 24,
      humidity: 0.82,
      sanityDrainPerMinute: 3,
      hazards: ["衰退", "不稳定排毒区", "生物性过度增生"],
      safeMedicalSupply: true,
    };
  }

  function getInteractionHint(target) {
    const data = resolveInteraction(target);
    if (!data) return "";
    if (data.kind === "supply") {
      return supplyTaken ? "医疗柜已经空了" : "取用密封医疗补给";
    }
    if (data.kind === "document") {
      return documentRead ? "重读 M.E.G. 封锁文档" : "阅读 M.E.G. 封锁文档";
    }
    if (data.kind === "detox") {
      return data.malignant ? "检查失控的排毒区（危险）" : "启动低功率排毒治疗";
    }
    return "";
  }

  function interact(target, callbacks = {}) {
    if (disposed) return false;
    const data = resolveInteraction(target);
    if (!data) return false;
    if (data.kind === "supply") {
      if (supplyTaken) {
        invoke(callbacks, "showToast", "医疗柜已经被取空。");
        return false;
      }
      supplyTaken = true;
      invoke(callbacks, "heal", 18, { source: "level1.3_medical_cache" });
      invoke(callbacks, "grantItem", "medical_supplies", {
        id: "level1.3_sealed_medical_supplies",
        name: "密封医疗补给",
        quantity: 1,
      });
      invoke(callbacks, "showToast", "取得密封医疗补给；这里没有排毒场的异常反应。");
      supplyCabinet.material = metalMat;
      return true;
    }
    if (data.kind === "document") {
      documentRead = true;
      invoke(
        callbacks,
        "showToast",
        "M.E.G.：Level 1.3 已封禁。排毒区会以百倍强度命令组织再生，切勿进入。"
      );
      return true;
    }
    if (data.kind === "detox") {
      const zone = detoxZones[data.index];
      if (!zone) return false;
      applyDetox(zone, callbacks, true);
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
    detoxZones.length = 0;
    resources.geometries.forEach((value) => value.dispose());
    resources.materials.forEach((value) => value.dispose());
    resources.textures.forEach((value) => value.dispose());
    resources.geometries.clear();
    resources.materials.clear();
    resources.textures.clear();
    group.clear();
  }

  return {
    group,
    colliders,
    interactMeshes,
    spawn: { x: 0, y: 0, z: 0, yaw: Math.PI / 2 },
    update,
    drawFx,
    getSurvivalEnv,
    getInteractionHint,
    interact,
    getExitRequest,
    dispose,
  };
}

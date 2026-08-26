/**
 * Level 0 — 马尼拉死路房。
 *
 * 这是一个不依赖 Level 0 主场景交互实现的独立构建器。房间坐标以入口朝向
 * +Z 为约定；exitTrigger 是入口内侧的一块 AABB，宿主应在玩家进入它时返回
 * 原先的 Level 0 位置。
 */
import * as THREE from "three";

export const MANILA_SESSION_KEY = "backrooms_level0_manila_room_v1";

var DOCUMENT_TEXT =
  "M.E.G. 前哨观察记录：这间办公室没有登记在 Level 0 的测绘图上。" +
  "北侧墙纸的接缝会逆着光线移动，触摸时却仍是实体。" +
  "若遇到类似异常墙面，请将准心对准它并按 Q 尝试切出；" +
  "本房间的样本已被加固，仅供训练，不会通往其他层级。";

function readState() {
  try {
    var raw = sessionStorage.getItem(MANILA_SESSION_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    return {
      documentRead: !!(parsed && parsed.documentRead),
      almondTaken: !!(parsed && parsed.almondTaken),
      wallInspected: !!(parsed && parsed.wallInspected),
    };
  } catch (err) {
    return { documentRead: false, almondTaken: false, wallInspected: false };
  }
}

function writeState(state) {
  try {
    sessionStorage.setItem(
      MANILA_SESSION_KEY,
      JSON.stringify({
        documentRead: !!state.documentRead,
        almondTaken: !!state.almondTaken,
        wallInspected: !!state.wallInspected,
      })
    );
  } catch (err) {
    /* sessionStorage 被禁用时，本次实例内状态仍然有效。 */
  }
}

function canvasTexture(width, height, paint) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx, width, height);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createWallpaperTexture() {
  return canvasTexture(256, 256, function (ctx, width, height) {
    ctx.fillStyle = "#b8a665";
    ctx.fillRect(0, 0, width, height);
    var x;
    for (x = 8; x < width; x += 24) {
      ctx.fillStyle = "rgba(91,72,28,0.12)";
      ctx.fillRect(x, 0, 2, height);
      ctx.fillStyle = "rgba(255,239,166,0.08)";
      ctx.fillRect(x + 3, 0, 1, height);
    }
    var i;
    for (i = 0; i < 480; i++) {
      var alpha = 0.015 + Math.random() * 0.045;
      ctx.fillStyle = "rgba(52,39,13," + alpha + ")";
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
    }
  });
}

function createCarpetTexture() {
  var texture = canvasTexture(128, 128, function (ctx, width, height) {
    ctx.fillStyle = "#655f43";
    ctx.fillRect(0, 0, width, height);
    var i;
    for (i = 0; i < 900; i++) {
      var shade = 65 + Math.floor(Math.random() * 42);
      ctx.fillStyle = "rgb(" + shade + "," + (shade - 3) + "," + (shade - 18) + ")";
      ctx.fillRect(Math.random() * width, Math.random() * height, 1, 2);
    }
  });
  if (texture) texture.repeat.set(4, 5);
  return texture;
}

function createDocumentTexture() {
  return canvasTexture(512, 512, function (ctx, width, height) {
    ctx.fillStyle = "#d8cca5";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#49442f";
    ctx.lineWidth = 12;
    ctx.strokeRect(18, 18, width - 36, height - 36);
    ctx.fillStyle = "#2d3128";
    ctx.font = "bold 62px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("M.E.G.", width * 0.5, 100);
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText("异常空间观察记录", width * 0.5, 160);
    ctx.textAlign = "left";
    ctx.font = "25px system-ui, sans-serif";
    var lines = [
      "区域：Level 0 / 未登记房间",
      "状态：死路，入口稳定",
      "样本：北墙接缝异常",
      "指引：对准墙面按 Q",
      "警告：样本已加固，不可切出",
    ];
    var i;
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], 58, 235 + i * 48);
  });
}

function createAnomalyTexture() {
  return canvasTexture(256, 256, function (ctx, width, height) {
    ctx.fillStyle = "#aa9858";
    ctx.fillRect(0, 0, width, height);
    var x;
    for (x = 10; x < width; x += 24) {
      ctx.strokeStyle = x % 48 ? "rgba(45,34,12,0.28)" : "rgba(245,220,130,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      var y;
      for (y = 0; y <= height; y += 16) {
        ctx.lineTo(x + Math.sin(y * 0.17 + x) * 5, y);
      }
      ctx.stroke();
    }
    var gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 118);
    gradient.addColorStop(0, "rgba(40,28,8,0.22)");
    gradient.addColorStop(0.55, "rgba(185,160,77,0.05)");
    gradient.addColorStop(1, "rgba(30,20,4,0.3)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function wallCollider(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function resolveInteractData(target) {
  if (!target) return null;
  if (target.kind) return target;
  if (target.userData && target.userData.brInteract) return target.userData.brInteract;
  if (target.object && target.object.userData) return target.object.userData.brInteract || null;
  return null;
}

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {object} [opts]
 * @param {number} [opts.x=0] 房间中心世界 X
 * @param {number} [opts.z=0] 房间中心世界 Z
 * @param {number} [opts.width=6.8]
 * @param {number} [opts.depth=8.4]
 * @param {number} [opts.wallHeight=3.25]
 * @param {(message:string, durationMs?:number)=>void} [opts.showToast]
 * @param {()=>boolean|void} [opts.grantAlmondWater] 返回 false 表示背包无法接收
 */
export function buildManilaRoom(scene, opts) {
  opts = opts || {};
  var centerX = Number.isFinite(opts.x) ? opts.x : 0;
  var centerZ = Number.isFinite(opts.z) ? opts.z : 0;
  var width = Math.max(4.8, Number.isFinite(opts.width) ? opts.width : 6.8);
  var depth = Math.max(5.6, Number.isFinite(opts.depth) ? opts.depth : 8.4);
  var wallHeight = Math.max(2.6, Number.isFinite(opts.wallHeight) ? opts.wallHeight : 3.25);
  var showToast = typeof opts.showToast === "function" ? opts.showToast : function () {};
  var grantAlmondWater =
    typeof opts.grantAlmondWater === "function" ? opts.grantAlmondWater : function () { return false; };

  var state = readState();
  var colliders = [];
  var interactMeshes = [];
  var disposed = false;
  var group = new THREE.Group();
  group.name = "Level0ManilaRoom";
  group.position.set(centerX, 0, centerZ);
  if (scene && scene.add) scene.add(group);

  var wallpaperTex = createWallpaperTexture();
  var carpetTex = createCarpetTexture();
  var documentTex = createDocumentTexture();
  var anomalyTex = createAnomalyTexture();
  var wallMat = new THREE.MeshStandardMaterial({
    map: wallpaperTex || undefined,
    color: wallpaperTex ? 0xffffff : 0xb8a665,
    emissive: 0x392a0b,
    emissiveIntensity: 0.17,
    roughness: 0.94,
  });
  var floorMat = new THREE.MeshStandardMaterial({
    map: carpetTex || undefined,
    color: carpetTex ? 0xffffff : 0x655f43,
    roughness: 1,
  });
  var ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xc9bd8b,
    emissive: 0x554418,
    emissiveIntensity: 0.13,
    roughness: 0.96,
  });
  var woodMat = new THREE.MeshStandardMaterial({ color: 0x5b4329, roughness: 0.82 });
  var metalMat = new THREE.MeshStandardMaterial({
    color: 0x5d5b4d,
    roughness: 0.55,
    metalness: 0.48,
  });
  var paperMat = new THREE.MeshStandardMaterial({
    map: documentTex || undefined,
    color: documentTex ? 0xffffff : 0xd8cca5,
    roughness: 0.9,
  });
  var anomalyMat = new THREE.MeshStandardMaterial({
    map: anomalyTex || undefined,
    color: anomalyTex ? 0xffffff : 0xaa9858,
    emissive: 0x4b370b,
    emissiveIntensity: 0.32,
    roughness: 0.86,
  });
  var bottleMat = new THREE.MeshPhysicalMaterial({
    color: 0xc6e6cf,
    transparent: true,
    opacity: 0.78,
    roughness: 0.18,
    transmission: 0.15,
  });
  var capMat = new THREE.MeshStandardMaterial({ color: 0x2e5842, roughness: 0.65 });
  var invisibleMat = new THREE.MeshBasicMaterial({ visible: false });

  function addBox(w, h, d, x, y, z, material) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addInteractProxy(kind, w, h, d, x, y, z) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisibleMat);
    mesh.position.set(x, y, z);
    mesh.userData.brInteract = { kind: kind };
    group.add(mesh);
    interactMeshes.push(mesh);
    return mesh;
  }

  var halfW = width * 0.5;
  var halfD = depth * 0.5;
  var wallT = 0.22;
  var entranceW = 1.45;
  var entranceSide = (width - entranceW) * 0.5;

  addBox(width, 0.12, depth, 0, 0.02, 0, floorMat);
  addBox(width, 0.1, depth, 0, wallHeight, 0, ceilingMat);
  addBox(width, wallHeight, wallT, 0, wallHeight * 0.5, -halfD, wallMat);
  addBox(wallT, wallHeight, depth, -halfW, wallHeight * 0.5, 0, wallMat);
  addBox(wallT, wallHeight, depth, halfW, wallHeight * 0.5, 0, wallMat);
  addBox(entranceSide, wallHeight, wallT, -halfW + entranceSide * 0.5, wallHeight * 0.5, halfD, wallMat);
  addBox(entranceSide, wallHeight, wallT, halfW - entranceSide * 0.5, wallHeight * 0.5, halfD, wallMat);

  colliders.push(wallCollider(centerX - halfW, centerX + halfW, centerZ - halfD - wallT, centerZ - halfD));
  colliders.push(wallCollider(centerX - halfW - wallT, centerX - halfW, centerZ - halfD, centerZ + halfD));
  colliders.push(wallCollider(centerX + halfW, centerX + halfW + wallT, centerZ - halfD, centerZ + halfD));
  colliders.push(
    wallCollider(centerX - halfW, centerX - entranceW * 0.5, centerZ + halfD, centerZ + halfD + wallT)
  );
  colliders.push(
    wallCollider(centerX + entranceW * 0.5, centerX + halfW, centerZ + halfD, centerZ + halfD + wallT)
  );

  // 简陋办公桌、抽屉柜和废弃椅子，让北端明确成为死路。
  var deskZ = -halfD + 1.25;
  addBox(3.15, 0.14, 1.12, -0.15, 0.82, deskZ, woodMat);
  addBox(0.13, 0.78, 0.95, -1.52, 0.39, deskZ, metalMat);
  addBox(0.13, 0.78, 0.95, 1.22, 0.39, deskZ, metalMat);
  addBox(0.72, 0.72, 0.92, halfW - 0.58, 0.36, -0.55, metalMat);
  addBox(0.62, 0.08, 0.62, -0.25, 0.48, 0.25, woodMat);
  addBox(0.09, 0.9, 0.09, -0.25, 0.45, 0.52, metalMat);
  colliders.push(
    wallCollider(centerX - 1.75, centerX + 1.45, centerZ + deskZ - 0.62, centerZ + deskZ + 0.62)
  );
  colliders.push(
    wallCollider(centerX + halfW - 0.98, centerX + halfW - 0.18, centerZ - 1.05, centerZ - 0.05)
  );

  var document = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.025, 0.72), paperMat);
  document.name = "ManilaMEGDocument";
  document.position.set(-0.62, 0.91, deskZ);
  document.rotation.y = -0.08;
  document.userData.brInteract = { kind: "manila_document" };
  group.add(document);
  interactMeshes.push(document);
  addInteractProxy("manila_document", 1.15, 0.3, 0.85, -0.62, 1.0, deskZ);

  // 北墙中央的示范异常墙只是教学目标，永远不触发场景切换。
  var anomalyWall = addBox(2.25, 2.48, 0.045, 0.35, 1.4, -halfD + 0.135, anomalyMat);
  anomalyWall.name = "ManilaTutorialWall";
  anomalyWall.userData.brInteract = { kind: "manila_tutorial_wall" };
  interactMeshes.push(anomalyWall);
  addInteractProxy("manila_tutorial_wall", 2.35, 2.55, 0.35, 0.35, 1.4, -halfD + 0.28);

  var bottle = new THREE.Group();
  bottle.name = "ManilaAlmondWater";
  bottle.position.set(0.76, 0.92, deskZ + 0.06);
  var bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.36, 12), bottleMat);
  bottleBody.position.y = 0.18;
  bottle.add(bottleBody);
  var bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.078, 0.1, 12), bottleMat);
  bottleNeck.position.y = 0.41;
  bottle.add(bottleNeck);
  var bottleCap = new THREE.Mesh(new THREE.CylinderGeometry(0.071, 0.071, 0.055, 12), capMat);
  bottleCap.position.y = 0.49;
  bottle.add(bottleCap);
  group.add(bottle);
  var almondPick = addInteractProxy("manila_almond", 0.42, 0.68, 0.42, 0.76, 1.18, deskZ + 0.06);

  function syncAlmondVisibility() {
    bottle.visible = !state.almondTaken;
    almondPick.visible = !state.almondTaken;
  }
  syncAlmondVisibility();

  var ambient = new THREE.HemisphereLight(0xd9c778, 0x292313, 0.5);
  group.add(ambient);
  var lamp = new THREE.PointLight(0xffd86a, 1.05, Math.max(width, depth) * 1.35, 1.9);
  lamp.position.set(-0.8, wallHeight - 0.3, -0.4);
  group.add(lamp);
  var lampPanel = addBox(1.35, 0.055, 0.38, -0.8, wallHeight - 0.08, -0.4, ceilingMat);
  lampPanel.material = new THREE.MeshStandardMaterial({
    color: 0xffe7a0,
    emissive: 0xffc94a,
    emissiveIntensity: 1.15,
    roughness: 0.55,
  });

  var exitTrigger = {
    kind: "manila_exit",
    minX: centerX - entranceW * 0.48,
    maxX: centerX + entranceW * 0.48,
    minZ: centerZ + halfD - 0.72,
    maxZ: centerZ + halfD + 0.38,
  };

  function readDocument() {
    if (disposed) return false;
    state.documentRead = true;
    writeState(state);
    showToast(DOCUMENT_TEXT, 8500);
    return true;
  }

  function pickupAlmondWater() {
    if (disposed || state.almondTaken) {
      if (!disposed) showToast("桌上只剩下一圈瓶底留下的水渍。");
      return false;
    }
    var granted;
    try {
      granted = grantAlmondWater();
    } catch (err) {
      showToast("无法将杏仁水放入背包。");
      return false;
    }
    if (granted === false) {
      showToast("背包没有空位，杏仁水仍留在桌上。");
      return false;
    }
    state.almondTaken = true;
    writeState(state);
    syncAlmondVisibility();
    showToast("获得基础杏仁水 ×1");
    return true;
  }

  function inspectTutorialWall() {
    if (disposed) return false;
    state.wallInspected = true;
    writeState(state);
    if (!state.documentRead) {
      showToast("墙纸的接缝似乎在移动。桌上的 M.E.G. 文件也许有说明。", 4200);
    } else {
      showToast("示范异常墙 · 将准心对准异常墙并按 Q 可尝试切出；此样本已加固，不会跳层。", 5600);
    }
    return true;
  }

  function getInteractionHint(target) {
    var data = resolveInteractData(target);
    if (!data) return "";
    if (data.kind === "manila_document") {
      return state.documentRead ? "M.E.G. 文件 · 按 Q 重读" : "M.E.G. 文件 · 按 Q 阅读";
    }
    if (data.kind === "manila_almond") {
      return state.almondTaken ? "" : "基础杏仁水 · 按 Q 拾取";
    }
    if (data.kind === "manila_tutorial_wall") {
      return state.documentRead
        ? "示范异常墙 · 按 Q 尝试切出"
        : "接缝异常的墙 · 按 Q 检查";
    }
    return "";
  }

  function interact(target) {
    var data = resolveInteractData(target);
    if (!data) return false;
    if (data.kind === "manila_document") return readDocument();
    if (data.kind === "manila_almond") return pickupAlmondWater();
    if (data.kind === "manila_tutorial_wall") return inspectTutorialWall();
    return false;
  }

  /**
   * 从屏幕中心更新瞄准目标；返回 null 或 { mesh, data, hint, distance }。
   * @param {THREE.Camera} camera
   * @param {THREE.Raycaster} [raycaster]
   * @param {number} [maxDistance=2.6]
   */
  function updateInteraction(camera, raycaster, maxDistance) {
    if (disposed || !camera) return null;
    var caster = raycaster || new THREE.Raycaster();
    var distance = Number.isFinite(maxDistance) ? maxDistance : 2.6;
    caster.setFromCamera({ x: 0, y: 0 }, camera);
    caster.far = distance;
    var hits = caster.intersectObjects(interactMeshes, false);
    var i;
    for (i = 0; i < hits.length; i++) {
      var hint = getInteractionHint(hits[i].object);
      if (!hint) continue;
      return {
        mesh: hits[i].object,
        data: hits[i].object.userData.brInteract,
        hint: hint,
        distance: hits[i].distance,
      };
    }
    return null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    var geometries = new Set();
    var materials = new Set();
    var textures = new Set();
    group.traverse(function (object) {
      if (object.geometry) geometries.add(object.geometry);
      var objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      var i;
      for (i = 0; i < objectMaterials.length; i++) {
        var material = objectMaterials[i];
        if (!material) continue;
        materials.add(material);
        var key;
        for (key in material) {
          if (material[key] && material[key].isTexture) textures.add(material[key]);
        }
      }
    });
    textures.forEach(function (texture) { texture.dispose(); });
    materials.forEach(function (material) { material.dispose(); });
    geometries.forEach(function (geometry) { geometry.dispose(); });
    interactMeshes.length = 0;
    colliders.length = 0;
    group.clear();
  }

  return {
    group: group,
    colliders: colliders,
    exitTrigger: exitTrigger,
    interactMeshes: interactMeshes,
    updateInteraction: updateInteraction,
    getInteractionHint: getInteractionHint,
    interact: interact,
    readDocument: readDocument,
    pickupAlmondWater: pickupAlmondWater,
    inspectTutorialWall: inspectTutorialWall,
    getState: function () {
      return {
        documentRead: state.documentRead,
        almondTaken: state.almondTaken,
        wallInspected: state.wallInspected,
      };
    },
    dispose: dispose,
  };
}

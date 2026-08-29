import * as THREE from "three";

const CEILING_Y = 4;
const ROUTE_LENGTH = 150;
const ROUTE_HALF_W = 2.15;
const CHUNK_LENGTH = 28;
const STREAM_RADIUS = 2;
const RACK_PITCH = 7;
const RACK_SIZE = 5;
const SUPPLY_KEY = "backrooms_c101_guide_supply_v1";

function wall(minX, maxX, minZ, maxZ) {
  return { kind: "wall", minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
}

function makeTextTexture(text, opts) {
  opts = opts || {};
  var canvas = document.createElement("canvas");
  canvas.width = opts.width || 512;
  canvas.height = opts.height || 128;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = opts.background || "#11171b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = opts.border || "#65727a";
  ctx.lineWidth = 8;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = opts.color || "#d7e0e4";
  ctx.font = (opts.font || "bold 40px system-ui, sans-serif");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.52);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBox(parent, material, x, y, z, sx, sy, sz) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addPick(parent, interactRoots, kind, x, y, z, sx, sy, sz, data) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = Object.assign({ kind: kind }, data || {});
  parent.add(pick);
  interactRoots.push(pick);
  return pick;
}

function addSoldier(parent, interactRoots, index, x, z, role) {
  var group = new THREE.Group();
  group.name = "C101OmegaGuide_" + index;
  group.position.set(x, 0, z);
  group.rotation.y = index % 2 ? -Math.PI * 0.5 : Math.PI * 0.5;
  var uniform = new THREE.MeshLambertMaterial({ color: 0x182c3d, emissive: 0x050b10 });
  var armor = new THREE.MeshStandardMaterial({
    color: 0x283944,
    metalness: 0.42,
    roughness: 0.64,
  });
  var skin = new THREE.MeshLambertMaterial({ color: 0xb88a62, emissive: 0x0c0603 });
  var black = new THREE.MeshLambertMaterial({ color: 0x070a0d });
  addBox(group, black, -0.15, 0.43, 0, 0.24, 0.86, 0.28);
  addBox(group, black, 0.15, 0.43, 0, 0.24, 0.86, 0.28);
  addBox(group, uniform, 0, 1.25, 0, 0.68, 0.82, 0.38);
  addBox(group, armor, 0, 1.3, -0.22, 0.62, 0.56, 0.14);
  addBox(group, skin, 0, 1.84, 0, 0.34, 0.34, 0.34);
  addBox(group, armor, 0, 2.04, 0, 0.46, 0.15, 0.44);
  addBox(group, black, 0.48, 1.08, -0.08, 0.13, 1.15, 0.13).rotation.z = -0.12;
  parent.add(group);
  addPick(group, interactRoots, "c101_guard", 0, 1.15, 0, 1.15, 2.4, 1.15, {
    index: index,
    role: role,
  });
}

function addArchive(parent, interactRoots, x, z, archiveId, title) {
  var metal = new THREE.MeshStandardMaterial({
    color: 0x30383c,
    metalness: 0.65,
    roughness: 0.42,
  });
  var paper = new THREE.MeshBasicMaterial({ map: makeTextTexture(title, { font: "bold 30px monospace" }) });
  addBox(parent, metal, x, 1.15, z, 0.18, 2.3, 1.8);
  var panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.62), paper);
  panel.position.set(x - 0.11, 1.45, z);
  panel.rotation.y = -Math.PI * 0.5;
  parent.add(panel);
  addPick(parent, interactRoots, "c101_archive", x - 0.3, 1.2, z, 0.7, 2.4, 2, {
    archiveId: archiveId,
  });
}

function addRoute(parent, colliders, interactRoots, authorized) {
  var alloy = new THREE.MeshStandardMaterial({
    color: 0x59646a,
    metalness: 0.78,
    roughness: 0.35,
  });
  var disguise = new THREE.MeshLambertMaterial({ color: 0x758087, emissive: 0x080b0d });
  var floorMat = new THREE.MeshStandardMaterial({ color: 0x1d2529, roughness: 0.93 });
  var stripeMat = new THREE.MeshBasicMaterial({ color: 0xf1c84f });
  var dark = new THREE.MeshBasicMaterial({ color: 0x020304 });
  var route = new THREE.Group();
  route.name = "C101SealedRoute";
  parent.add(route);

  addBox(route, floorMat, ROUTE_LENGTH * 0.5, 0.04, 0, ROUTE_LENGTH + 8, 0.08, ROUTE_HALF_W * 2);
  addBox(route, disguise, ROUTE_LENGTH * 0.5, CEILING_Y - 0.06, 0, ROUTE_LENGTH + 8, 0.12, ROUTE_HALF_W * 2);
  addBox(route, alloy, ROUTE_LENGTH * 0.5, CEILING_Y * 0.5, -ROUTE_HALF_W, ROUTE_LENGTH + 8, CEILING_Y, 0.12);
  addBox(route, alloy, ROUTE_LENGTH * 0.5, CEILING_Y * 0.5, ROUTE_HALF_W, ROUTE_LENGTH + 8, CEILING_Y, 0.12);
  colliders.push(wall(-4, ROUTE_LENGTH + 4, -ROUTE_HALF_W - 0.12, -ROUTE_HALF_W + 0.12));
  colliders.push(wall(-4, ROUTE_LENGTH + 4, ROUTE_HALF_W - 0.12, ROUTE_HALF_W + 0.12));
  colliders.push(wall(-4.2, -3.8, -ROUTE_HALF_W, ROUTE_HALF_W));

  for (var x = 6; x < ROUTE_LENGTH; x += 12) {
    addBox(route, stripeMat, x, 0.095, 0, 2.8, 0.025, 0.06);
    var lampPanel = addBox(
      route,
      new THREE.MeshBasicMaterial({ color: 0xffe3a1 }),
      x,
      CEILING_Y - 0.14,
      0,
      1.5,
      0.035,
      0.28
    );
    lampPanel.rotation.z = 0;
    if (x % 24 === 6) {
      var light = new THREE.PointLight(0xffdca0, 0.72, 15, 2);
      light.position.set(x, CEILING_Y - 0.35, 0);
      route.add(light);
    }
  }

  for (var sx = 18; sx < ROUTE_LENGTH; sx += 28) {
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 0.72),
      new THREE.MeshBasicMaterial({
        map: makeTextTexture("C-102  →  " + Math.max(0, ROUTE_LENGTH - sx) + "m", {
          font: "bold 34px system-ui, sans-serif",
        }),
      })
    );
    sign.position.set(sx, CEILING_Y - 0.62, -ROUTE_HALF_W + 0.08);
    sign.rotation.y = Math.PI * 0.5;
    route.add(sign);
  }

  var bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe5a8 })
  );
  bulb.position.set(0, CEILING_Y - 0.55, 0);
  route.add(bulb);
  var bulbLight = new THREE.PointLight(0xffd89b, 2.1, 18, 2);
  bulbLight.position.copy(bulb.position);
  route.add(bulbLight);
  addBox(route, dark, 0, CEILING_Y - 0.28, 0, 0.025, 0.55, 0.025);

  var stair = new THREE.Group();
  stair.position.set(ROUTE_LENGTH + 1.2, 0, 0);
  route.add(stair);
  for (var step = 0; step < 10; step++) {
    addBox(stair, floorMat, step * 0.42, -step * 0.18, 0, 0.44, 0.18, 3.5);
  }
  var stairDark = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.2), dark);
  stairDark.position.set(4.25, -0.7, 0);
  stairDark.rotation.y = -Math.PI * 0.5;
  stair.add(stairDark);
  addPick(route, interactRoots, "c101_stairs", ROUTE_LENGTH, 1.2, 0, 2.5, 2.8, 3.5);

  addArchive(route, interactRoots, 27, -1.98, "A", "C-101-A · 首次探索");
  addArchive(route, interactRoots, 55, -1.98, "B", "C-101-B · 数据节选");
  addArchive(route, interactRoots, 84, -1.98, "E", "C-101-E · C-96 实验");
  addArchive(route, interactRoots, 112, -1.98, "F", "C-101-F · 监督者 Z");

  var breachSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.9),
    new THREE.MeshBasicMaterial({
      map: makeTextTexture("禁止越过封锁", {
        background: "#260909",
        border: "#db342d",
        color: "#ffbbb5",
        font: "bold 36px system-ui, sans-serif",
      }),
    })
  );
  breachSign.position.set(43, 1.65, ROUTE_HALF_W - 0.075);
  breachSign.rotation.x = 0;
  route.add(breachSign);
  addPick(route, interactRoots, "c101_lockdown", 43, 1.4, ROUTE_HALF_W - 0.18, 2.8, 2.8, 0.55);

  if (authorized) {
    var terminalMat = new THREE.MeshBasicMaterial({ color: 0x38e685 });
    addBox(route, terminalMat, 74, 1.35, -ROUTE_HALF_W + 0.09, 1.2, 0.72, 0.08);
    addPick(route, interactRoots, "c101_authorized_terminal", 74, 1.35, -ROUTE_HALF_W + 0.18, 1.5, 1.5, 0.5);
  }

  addSoldier(route, interactRoots, 0, 2.8, -1.25, "supply");
  addSoldier(route, interactRoots, 1, 3.2, 1.25, "guide");
  addSoldier(route, interactRoots, 2, 7.1, -1.25, "warning");
  addSoldier(route, interactRoots, 3, 7.6, 1.25, "archive");
  addSoldier(route, interactRoots, 4, 11.6, -1.2, "watch");
}

function createServerChunk(parent, index, materials) {
  var group = new THREE.Group();
  group.name = "C101ServerChunk_" + index;
  var minX = index * CHUNK_LENGTH;
  var maxX = minX + CHUNK_LENGTH;
  addBox(
    group,
    materials.floor,
    minX + CHUNK_LENGTH * 0.5,
    -0.045,
    0,
    CHUNK_LENGTH + 0.1,
    0.08,
    64
  );
  addBox(
    group,
    materials.ceiling,
    minX + CHUNK_LENGTH * 0.5,
    CEILING_Y + 0.045,
    0,
    CHUNK_LENGTH + 0.1,
    0.08,
    64
  );
  var rackPositions = [];
  var row;
  var x;
  for (x = Math.floor(minX / RACK_PITCH) * RACK_PITCH; x <= maxX + RACK_PITCH; x += RACK_PITCH) {
    for (row = -4; row <= 4; row++) {
      if (Math.abs(row) < 1) continue;
      var z = row * RACK_PITCH;
      if (Math.abs(z) < ROUTE_HALF_W + RACK_SIZE * 0.5 + 0.5) continue;
      rackPositions.push({ x: x + 0.5, z: z });
    }
  }
  var rackGeo = new THREE.BoxGeometry(RACK_SIZE, CEILING_Y - 0.12, RACK_SIZE);
  var racks = new THREE.InstancedMesh(rackGeo, materials.rack, rackPositions.length);
  var matrix = new THREE.Matrix4();
  for (var i = 0; i < rackPositions.length; i++) {
    matrix.makeTranslation(rackPositions[i].x, (CEILING_Y - 0.12) * 0.5, rackPositions[i].z);
    racks.setMatrixAt(i, matrix);
  }
  group.add(racks);

  var cableGeo = new THREE.BoxGeometry(0.07, 2.7, 0.09);
  var colors = [materials.red, materials.yellow, materials.green];
  for (var c = 0; c < colors.length; c++) {
    var cables = new THREE.InstancedMesh(cableGeo, colors[c], rackPositions.length);
    for (i = 0; i < rackPositions.length; i++) {
      var side = rackPositions[i].z < 0 ? 1 : -1;
      matrix.makeTranslation(
        rackPositions[i].x - 1.1 + c * 0.38,
        1.65,
        rackPositions[i].z + side * (RACK_SIZE * 0.5 + 0.03)
      );
      cables.setMatrixAt(i, matrix);
    }
    group.add(cables);
  }
  parent.add(group);
  return group;
}

export function buildLevelC101World(root, opts) {
  opts = opts || {};
  var colliders = [];
  var interactRoots = [];
  var authorized = !!opts.authorized;
  var group = new THREE.Group();
  group.name = "LevelC101InfiniteServerRoom";
  root.add(group);

  var materials = {
    rack: new THREE.MeshStandardMaterial({
      color: 0x090d10,
      emissive: 0x010203,
      metalness: 0.72,
      roughness: 0.44,
    }),
    red: new THREE.MeshBasicMaterial({ color: 0xe93832 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xf2bd38 }),
    green: new THREE.MeshBasicMaterial({ color: 0x42e778 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x111619, roughness: 0.96 }),
    ceiling: new THREE.MeshLambertMaterial({ color: 0x191e21, emissive: 0x010202 }),
  };
  addRoute(group, colliders, interactRoots, authorized);
  group.add(new THREE.AmbientLight(0x263038, 0.2));

  var chunks = new Map();
  function updateStreaming(px) {
    var center = Math.floor(px / CHUNK_LENGTH);
    var wanted = Object.create(null);
    for (var i = center - STREAM_RADIUS; i <= center + STREAM_RADIUS; i++) {
      wanted[i] = true;
      if (!chunks.has(i)) chunks.set(i, createServerChunk(group, i, materials));
    }
    var remove = [];
    chunks.forEach(function (_chunk, key) {
      if (!wanted[key]) remove.push(key);
    });
    for (i = 0; i < remove.length; i++) {
      var old = chunks.get(remove[i]);
      if (old && old.parent) old.parent.remove(old);
      chunks.delete(remove[i]);
    }
  }
  updateStreaming(0);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    spawn: { x: 0, z: 0, yaw: Math.PI * 0.5 },
    ceilingY: CEILING_Y,
    update: function (px, now) {
      updateStreaming(px);
      var pulse = 0.35 + (Math.sin((now || 0) * 0.004) + 1) * 0.25;
      materials.red.opacity = pulse;
      materials.yellow.opacity = 0.45 + pulse * 0.5;
      materials.green.opacity = 0.75;
      materials.red.transparent = true;
      materials.yellow.transparent = true;
    },
    takeGuideSupply: function (survival, addFireSalt) {
      try {
        if (sessionStorage.getItem(SUPPLY_KEY) === "1") return false;
      } catch (_err) {
        /* continue without persistence */
      }
      var water = survival && survival.addAlmondWater ? survival.addAlmondWater(2) : 0;
      var salt = addFireSalt ? addFireSalt(1) : 0;
      if (water <= 0 && salt <= 0) return false;
      try {
        sessionStorage.setItem(SUPPLY_KEY, "1");
      } catch (_err2) {
        /* ignore */
      }
      return { water: water, salt: salt };
    },
    dispose: function () {
      chunks.clear();
      group.traverse(function (obj) {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        var mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach(function (mat) {
          if (mat.map && mat.map.dispose) mat.map.dispose();
          if (mat.dispose) mat.dispose();
        });
      });
      if (group.parent) group.parent.remove(group);
    },
  };
}

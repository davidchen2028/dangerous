/**
 * 测试地图 · 收藏室最里侧 — 地面藏品刷新，按 E 拾取
 * 紫 40% · 蓝 50% · 空手 10%
 */
(function () {
  "use strict";

  var SPAWN_WEIGHT_EMPTY = 10;
  var SPAWN_WEIGHT_EPIC = 40;
  var SPAWN_WEIGHT_RARE = 50;
  var SPAWN_WEIGHT_TOTAL =
    SPAWN_WEIGHT_EMPTY + SPAWN_WEIGHT_EPIC + SPAWN_WEIGHT_RARE;
  var PICKUP_DIST = 2.4;
  var FLOOR_Y = 0.08;
  var STORAGE_KEY = "dangerous_collection_room_floor_loot";

  /** 史诗（紫） */
  var EPIC_FLOOR_POOL = [
    {
      catalogId: "collectible_3003",
      model3d: "models/interactive-map-table.glb",
    },
    {
      catalogId: "collectible_3004",
      model3d: "models/vintage-optical-sight.glb",
    },
  ];

  /** 稀有（蓝） */
  var RARE_FLOOR_POOL = [
    {
      catalogId: "collectible_3005",
      model3d: "models/dangerous-badge.glb",
      fitScale: 3,
    },
  ];

  function getPoolEntry(id) {
    var i;
    for (i = 0; i < EPIC_FLOOR_POOL.length; i++) {
      if (EPIC_FLOOR_POOL[i].catalogId === id) return EPIC_FLOOR_POOL[i];
    }
    for (i = 0; i < RARE_FLOOR_POOL.length; i++) {
      if (RARE_FLOOR_POOL[i].catalogId === id) return RARE_FLOOR_POOL[i];
    }
    return null;
  }

  var hallLayout = null;
  var sceneParent = null;
  var sceneHelpers = null;
  var lootRoot = null;
  var spawnX = 0;
  var spawnZ = 0;
  var active = false;
  var picked = false;
  var catalogId = null;
  var modelUrl = null;

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function writeState(obj) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      /* ignore */
    }
  }

  function pickRandomPoolEntry(pool) {
    if (!pool || !pool.length) return null;
    var i = Math.floor(Math.random() * pool.length);
    return pool[i];
  }

  function rollSpawnEntry() {
    var roll = Math.random() * SPAWN_WEIGHT_TOTAL;
    if (roll < SPAWN_WEIGHT_EMPTY) return null;
    if (roll < SPAWN_WEIGHT_EMPTY + SPAWN_WEIGHT_EPIC) {
      return pickRandomPoolEntry(EPIC_FLOOR_POOL);
    }
    return pickRandomPoolEntry(RARE_FLOOR_POOL);
  }

  function rollSpawnState() {
    active = false;
    picked = false;
    catalogId = null;
    modelUrl = null;

    var entry = rollSpawnEntry();
    if (entry) {
      active = true;
      catalogId = entry.catalogId;
      modelUrl = entry.model3d;
    }

    writeState({
      active: active,
      picked: false,
      catalogId: catalogId,
      modelUrl: modelUrl,
    });
  }

  function applyState(state) {
    if (!state) {
      rollSpawnState();
      return;
    }
    active = !!state.active && !state.picked;
    picked = !!state.picked;
    catalogId = state.catalogId || null;
    modelUrl = state.modelUrl || null;
    if (state.picked) active = false;
  }

  function removeLootRoot() {
    if (lootRoot && lootRoot.parent) {
      lootRoot.parent.remove(lootRoot);
    }
    lootRoot = null;
  }

  function getSpawnPosition(hall) {
    return {
      x: hall.centerX,
      z: hall.innerZ1 - 0.45,
    };
  }

  function catalogFitSize(cat) {
    var cols = cat.w || 1;
    var rows = cat.h || 1;
    var s = 0.2 * Math.max(cols, rows);
    var entry = getPoolEntry(cat.id);
    var mul = entry && entry.fitScale ? entry.fitScale : 1;
    return {
      x: s * cols * mul,
      y: s * rows * 0.85 * mul,
      z: s * Math.max(cols, rows) * mul,
    };
  }

  function resetGltfScenePose(model) {
    if (!model) return;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
  }

  var _snapVec = null;

  function snapRootToFloor(root) {
    if (!window.THREE || !root) return;
    var THREE = window.THREE;
    if (!_snapVec) _snapVec = new THREE.Vector3();
    root.updateMatrixWorld(true);

    var minY = Infinity;
    root.traverse(function (child) {
      if (!child.isMesh || !child.geometry) return;
      var posAttr = child.geometry.attributes.position;
      if (!posAttr) return;
      var i;
      for (i = 0; i < posAttr.count; i++) {
        _snapVec.fromBufferAttribute(posAttr, i);
        _snapVec.applyMatrix4(child.matrixWorld);
        if (_snapVec.y < minY) minY = _snapVec.y;
      }
    });

    if (minY === Infinity) {
      var box = new THREE.Box3().setFromObject(root);
      minY = box.min.y;
    }
    root.position.y += FLOOR_Y - minY;
    root.updateMatrixWorld(true);
  }

  function mountLootModel(gltf, cat, targetSize) {
    if (!window.THREE || !gltf || !gltf.scene || !sceneParent) return;

    var THREE = window.THREE;
    removeLootRoot();

    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "CollectionRoomFloorLoot";
    resetGltfScenePose(model);
    root.add(model);
    root.position.set(spawnX, 0, spawnZ);

    var fitSize = targetSize;
    if (sceneHelpers && sceneHelpers.fitModelUniformToBox) {
      sceneHelpers.fitModelUniformToBox(root, fitSize);
    } else if (sceneHelpers && sceneHelpers.fitModelToBox) {
      sceneHelpers.fitModelToBox(root, fitSize);
    }

    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);
    snapRootToFloor(root);
    model.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      child.castShadow = false;
      child.receiveShadow = false;
    });

    sceneParent.add(root);
    lootRoot = root;
  }

  function buildLootModel() {
    if (!active || picked || !modelUrl || !sceneParent) return;

    var cat =
      window.ItemCatalog && catalogId
        ? window.ItemCatalog.getItem(catalogId)
        : null;
    if (!cat) return;

    var targetSize = catalogFitSize(cat);

    if (!sceneHelpers || !sceneHelpers.loadGltfCached) {
      return;
    }

    sceneHelpers.loadGltfCached(
      modelUrl,
      function (gltf) {
        if (!active || picked) return;
        mountLootModel(gltf, cat, targetSize);
      },
      function () {
        console.warn("[CollectionRoomFloorLoot] GLB 加载失败:", modelUrl);
      }
    );
  }

  function build(parent, helpers, placement) {
    sceneParent = parent || null;
    sceneHelpers = helpers || null;
    hallLayout = placement && placement.hall ? placement.hall : null;
    if (!sceneParent || !hallLayout) return;

    var pos = getSpawnPosition(hallLayout);
    spawnX = pos.x;
    spawnZ = pos.z;

    var saved = readState();
    if (saved) {
      applyState(saved);
    } else {
      rollSpawnState();
    }

    buildLootModel();
  }

  function playerNear(px, pz) {
    if (!active || picked) return false;
    var dx = px - spawnX;
    var dz = pz - spawnZ;
    return dx * dx + dz * dz <= PICKUP_DIST * PICKUP_DIST;
  }

  function canSeeLoot(px, pz) {
    if (!active || picked) return false;
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(px, pz, spawnX, 0.45, spawnZ);
    }
    if (sceneHelpers && sceneHelpers.hasLineOfSight) {
      return sceneHelpers.hasLineOfSight(px, pz, spawnX, 0.45, spawnZ);
    }
    return true;
  }

  function shouldShowPickupHint(px, pz) {
    return playerNear(px, pz) && canSeeLoot(px, pz);
  }

  function showPickupBanner(name) {
    if (window.ActionScene && window.ActionScene.showDurabilityBanner) {
      window.ActionScene.showDurabilityBanner("已拾取「" + name + "」");
    }
  }

  function tryPickup(px, pz) {
    if (!active || picked || !playerNear(px, pz) || !canSeeLoot(px, pz)) {
      return false;
    }

    var cat =
      window.ItemCatalog && catalogId
        ? window.ItemCatalog.getItem(catalogId)
        : null;
    if (!cat) return false;

    if (
      !window.PlayerLoadout ||
      !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack
    ) {
      return false;
    }

    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      if (window.ActionScene && window.ActionScene.showDurabilityBanner) {
        window.ActionScene.showDurabilityBanner("安全箱与背包均无空位");
      }
      return false;
    }

    picked = true;
    active = false;
    writeState({
      active: false,
      picked: true,
      catalogId: catalogId,
      modelUrl: modelUrl,
    });
    removeLootRoot();

    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }

    showPickupBanner(cat.name);
    return true;
  }

  function resetForNewRun() {
    removeLootRoot();
    active = false;
    picked = false;
    catalogId = null;
    modelUrl = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    rollSpawnState();
    buildLootModel();
  }

  function getPreloadUrls() {
    var urls = [];
    var i;
    for (i = 0; i < EPIC_FLOOR_POOL.length; i++) {
      if (EPIC_FLOOR_POOL[i].model3d) urls.push(EPIC_FLOOR_POOL[i].model3d);
    }
    for (i = 0; i < RARE_FLOOR_POOL.length; i++) {
      if (RARE_FLOOR_POOL[i].model3d) urls.push(RARE_FLOOR_POOL[i].model3d);
    }
    return urls;
  }

  window.CollectionRoomFloorLoot = {
    SPAWN_WEIGHT_EMPTY: SPAWN_WEIGHT_EMPTY,
    SPAWN_WEIGHT_EPIC: SPAWN_WEIGHT_EPIC,
    SPAWN_WEIGHT_RARE: SPAWN_WEIGHT_RARE,
    EPIC_FLOOR_POOL: EPIC_FLOOR_POOL,
    RARE_FLOOR_POOL: RARE_FLOOR_POOL,
    build: build,
    playerNear: playerNear,
    shouldShowPickupHint: shouldShowPickupHint,
    tryPickup: tryPickup,
    resetForNewRun: resetForNewRun,
    getPreloadUrls: getPreloadUrls,
    isActive: function () {
      return active && !picked;
    },
  };
})();

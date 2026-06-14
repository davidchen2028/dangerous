/**
 * 行动场景 · 丢下物品（战术背包/安全箱 → 脚前地面，按 E 拾取）
 * 有 model3d 用 GLB，否则用占位方块
 */
(function () {
  "use strict";

  var FLOOR_Y = 0;
  var PICKUP_DIST = 2.4;
  var DROP_FORWARD = 0.9;
  var STORAGE_KEY = "dangerous_action_dropped_loot";
  var PICK_MESH_SCALE = 0.78;

  var MODEL_OVERRIDES = {
    collectible_3005: { fitScale: 3 },
    collectible_3007: { fitScale: 0.85 },
    brass_bullet: { fitScale: 0.55 },
    uzi_smg: { fitScale: 0.85 },
    medkit: { fitScale: 0.75 },
    bolt: { fitScale: 0.35 },
    truck_part: { fitScale: 1.8 },
    circuit: { fitScale: 0.65 },
    sealed_motor_oil: { fitScale: 0.55 },
    heavy_industrial_drill: { fitScale: 1.6 },
    helm_basic: { fitScale: 0.75 },
    armr_basic: { fitScale: 1 },
    rig_light: { fitScale: 0.85 },
    bp_sport: { fitScale: 1.15 },
    bp_light: { fitScale: 1.35 },
    bp_small: { fitScale: 1.45 },
    bp_test: { fitScale: 1.6 },
    pirate_1001: { fitScale: 0.65 },
    pirate_1002: { fitScale: 1.1 },
    pirate_1003: { fitScale: 0.7 },
    pirate_1004: { fitScale: 0.9 },
    pirate_1005: { fitScale: 0.6 },
    pirate_1006: { fitScale: 0.8 },
    pirate_1007: { fitScale: 0.85 },
  };

  var sceneParent = null;
  var sceneHelpers = null;
  var drops = [];
  var dropSeq = 0;
  var _snapVec = null;

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return data && data.drops ? data.drops : [];
    } catch (e) {
      return [];
    }
  }

  function writeState() {
    try {
      var list = [];
      var i;
      for (i = 0; i < drops.length; i++) {
        var d = drops[i];
        list.push({
          id: d.id,
          catalogId: d.catalogId,
          x: d.x,
          z: d.z,
          stackSize: d.stackSize,
          durability: d.durability,
          maxDurability: d.maxDurability,
        });
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ drops: list }));
    } catch (e) {
      /* ignore */
    }
  }

  var FALLBACK_DROP_COLORS = {
    common: 0x5a7a5a,
    rare: 0x4a6aaa,
    epic: 0x7a4aaa,
    legendary: 0xaa8a2a,
    mythic: 0xaa3a3a,
    ultimate: 0x2a2a2a,
  };

  function canDropItemData(itemData) {
    if (!itemData || !window.ItemCatalog) return false;
    return !!window.ItemCatalog.getItem(itemData.id);
  }

  function isActionDropBoard(boardId) {
    return boardId === "actionBp" || boardId === "actionSecure";
  }

  function catalogFitSize(cat, entry) {
    var cols = cat.w || 1;
    var rows = cat.h || 1;
    var s = 0.2 * Math.max(cols, rows);
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

  function alignModelBottomToRoot(model, root) {
    if (!window.THREE || !model || !root) return;
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    model.position.y -= box.min.y - root.position.y;
    model.updateMatrixWorld(true);
  }

  function snapRootToFloor(root, floorY) {
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
    root.position.y += (floorY != null ? floorY : FLOOR_Y) - minY;
    root.updateMatrixWorld(true);
  }

  function removeDropRecord(dropId) {
    var i;
    for (i = drops.length - 1; i >= 0; i--) {
      if (drops[i].id === dropId) {
        if (drops[i].root && drops[i].root.parent) {
          drops[i].root.parent.remove(drops[i].root);
        }
        drops.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  function mountDropModel(gltf, cat, placement, record) {
    if (!window.THREE || !gltf || !gltf.scene || !sceneParent) return;

    var THREE = window.THREE;
    var entry = MODEL_OVERRIDES[cat.id] || null;
    var targetSize = catalogFitSize(cat, entry);
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "DroppedLoot_" + record.id;

    resetGltfScenePose(model);

    root.add(model);
    root.position.set(placement.x, 0, placement.z);

    if (sceneHelpers && sceneHelpers.fitModelUniformToBox) {
      sceneHelpers.fitModelUniformToBox(root, targetSize);
    } else if (sceneHelpers && sceneHelpers.fitModelToBox) {
      sceneHelpers.fitModelToBox(root, targetSize);
    }

    alignModelBottomToRoot(model, root);
    snapRootToFloor(root, placement.floorY);

    model.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    sceneParent.add(root);
    record.root = root;
    record.x = placement.x;
    record.z = placement.z;
  }

  function mountFallbackDropModel(cat, placement, record) {
    if (!window.THREE || !sceneParent || !cat) return;

    var THREE = window.THREE;
    var entry = MODEL_OVERRIDES[cat.id] || null;
    var targetSize = catalogFitSize(cat, entry);
    var root = new THREE.Group();
    var color = FALLBACK_DROP_COLORS[cat.rarity] || 0x6a6a72;
    var mesh = new THREE.Mesh(
      new THREE.BoxGeometry(targetSize.x, targetSize.y, targetSize.z),
      new THREE.MeshLambertMaterial({ color: color })
    );
    mesh.position.y = targetSize.y * 0.5;
    root.name = "DroppedLoot_Fallback_" + record.id;
    root.add(mesh);
    root.position.set(placement.x, 0, placement.z);
    snapRootToFloor(root, placement.floorY);
    sceneParent.add(root);
    record.root = root;
    record.x = placement.x;
    record.z = placement.z;
  }

  function spawnDropModel(record) {
    var cat =
      window.ItemCatalog && record.catalogId
        ? window.ItemCatalog.getItem(record.catalogId)
        : null;
    if (!cat || !sceneParent) return;

    var modelUrl =
      window.ItemCatalog.getModel3d &&
      window.ItemCatalog.getModel3d(record.catalogId);

    if (!modelUrl || !sceneHelpers || !sceneHelpers.loadGltfCached) {
      mountFallbackDropModel(cat, { x: record.x, z: record.z, floorY: FLOOR_Y }, record);
      return;
    }

    sceneHelpers.loadGltfCached(
      modelUrl,
      function (gltf) {
        var still = false;
        var i;
        for (i = 0; i < drops.length; i++) {
          if (drops[i].id === record.id) {
            still = true;
            break;
          }
        }
        if (!still) return;
        mountDropModel(gltf, cat, { x: record.x, z: record.z, floorY: FLOOR_Y }, record);
      },
      function () {
        console.warn("[ActionDropLoot] GLB 加载失败，使用占位:", modelUrl);
        mountFallbackDropModel(cat, { x: record.x, z: record.z, floorY: FLOOR_Y }, record);
      }
    );
  }

  function nextDropId() {
    dropSeq += 1;
    return "drop_" + Date.now() + "_" + dropSeq;
  }

  function getPlacement() {
    if (window.ActionScene && window.ActionScene.getDropPlacement) {
      return window.ActionScene.getDropPlacement();
    }
    return { x: 0, z: 0, floorY: FLOOR_Y, yaw: 0 };
  }

  function showBanner(text) {
    if (window.ActionScene && window.ActionScene.showDurabilityBanner) {
      window.ActionScene.showDurabilityBanner(text);
    }
  }

  function addDropFromItemData(itemData, placement) {
    if (!canDropItemData(itemData)) return false;

    var record = {
      id: nextDropId(),
      catalogId: itemData.id,
      x: placement.x,
      z: placement.z,
      stackSize: itemData.stackSize,
      durability: itemData.durability,
      maxDurability: itemData.maxDurability,
      root: null,
    };

    drops.push(record);
    writeState();
    spawnDropModel(record);

    var cat = window.ItemCatalog.getItem(itemData.id);
    showBanner("已丢下「" + (cat ? cat.name : itemData.name) + "」");
    return true;
  }

  function dropFromBoard(board, inst) {
    if (!board || !inst || !inst.itemData) return false;
    if (!isActionDropBoard(board.id)) return false;
    if (!canDropItemData(inst.itemData)) return false;
    if (!window.ActionScene || !window.ActionScene.isRunning || !window.ActionScene.isRunning()) {
      return false;
    }

    var placement = getPlacement();
    var extras = {
      id: inst.itemData.id,
      name: inst.itemData.name,
      stackSize: inst.itemData.stackSize,
      durability: inst.itemData.durability,
      maxDurability: inst.itemData.maxDurability,
    };

    board.manager.removeItem(inst);
    return addDropFromItemData(extras, placement);
  }

  function playerNearDrop(drop, px, pz) {
    var dx = px - drop.x;
    var dz = pz - drop.z;
    return dx * dx + dz * dz <= PICKUP_DIST * PICKUP_DIST;
  }

  function canSeeDrop(drop, px, pz) {
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(px, pz, drop.x, 0.45, drop.z);
    }
    if (sceneHelpers && sceneHelpers.hasLineOfSight) {
      return sceneHelpers.hasLineOfSight(px, pz, drop.x, 0.45, drop.z);
    }
    return true;
  }

  function findNearestPickup(px, pz) {
    var best = null;
    var bestDist = PICKUP_DIST * PICKUP_DIST;
    var i;
    for (i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (!playerNearDrop(d, px, pz) || !canSeeDrop(d, px, pz)) continue;
      var dx = px - d.x;
      var dz = pz - d.z;
      var dist2 = dx * dx + dz * dz;
      if (dist2 < bestDist) {
        bestDist = dist2;
        best = d;
      }
    }
    return best;
  }

  function shouldShowPickupHint(px, pz) {
    return !!findNearestPickup(px, pz);
  }

  function catalogItemForPickup(drop) {
    if (!drop || !window.ItemCatalog) return null;
    var cat = window.ItemCatalog.getItem(drop.catalogId);
    if (!cat) return null;
    var item = Object.assign({}, cat);
    if (drop.stackSize != null) item.stackSize = drop.stackSize;
    if (drop.durability != null) item.durability = drop.durability;
    if (drop.maxDurability != null) item.maxDurability = drop.maxDurability;
    return item;
  }

  function tryPickup(px, pz) {
    var drop = findNearestPickup(px, pz);
    if (!drop) return false;

    var item = catalogItemForPickup(drop);
    if (!item) return false;

    if (
      !window.PlayerLoadout ||
      !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack
    ) {
      return false;
    }

    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(item);
    if (!dest) {
      showBanner("安全箱与背包均无空位");
      return false;
    }

    removeDropRecord(drop.id);
    writeState();

    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }

    showBanner("已拾取「" + item.name + "」");
    return true;
  }

  function clearAllDrops() {
    var i;
    for (i = drops.length - 1; i >= 0; i--) {
      if (drops[i].root && drops[i].root.parent) {
        drops[i].root.parent.remove(drops[i].root);
      }
    }
    drops = [];
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function restoreDrops() {
    var saved = readState();
    var i;
    for (i = 0; i < saved.length; i++) {
      var s = saved[i];
      if (!s || !s.catalogId) continue;
      if (!window.ItemCatalog || !window.ItemCatalog.getItem(s.catalogId)) {
        continue;
      }
      var record = {
        id: s.id || nextDropId(),
        catalogId: s.catalogId,
        x: s.x,
        z: s.z,
        stackSize: s.stackSize,
        durability: s.durability,
        maxDurability: s.maxDurability,
        root: null,
      };
      drops.push(record);
      spawnDropModel(record);
    }
  }

  function bindWorld(parent, helpers) {
    sceneParent = parent || null;
    sceneHelpers = helpers || null;
    drops = [];
    if (!sceneParent) return;
    restoreDrops();
  }

  function resetForNewRun() {
    clearAllDrops();
  }

  function getPreloadUrls() {
    if (!window.ItemCatalog || !window.ItemCatalog.getAllModel3dUrls) return [];
    return window.ItemCatalog.getAllModel3dUrls();
  }

  window.ActionDropLoot = {
    bindWorld: bindWorld,
    resetForNewRun: resetForNewRun,
    canDropItemData: canDropItemData,
    isActionDropBoard: isActionDropBoard,
    dropFromBoard: dropFromBoard,
    tryPickup: tryPickup,
    shouldShowPickupHint: shouldShowPickupHint,
    getPreloadUrls: getPreloadUrls,
  };
})();

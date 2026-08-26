/**
 * 测试地图 · 地下储藏间地面产品刷新（6 个独立点，各必定一件）
 * 品级：稀有 40% · 史诗 40% · 传奇 20%
 * 同品级从 ItemCatalog.ITEMS 动态筛选（rarity + model3d + reclaimMin）均匀随机
 */
(function () {
  "use strict";

  var STORAGE_KEY = "dangerous_basement_storage_loot_v1";
  var PICKUP_DIST = 2.4;
  var SNAP_LIFT = 0.08;
  var RARITY_RARE_CHANCE = 0.4;
  var RARITY_EPIC_CHANCE = 0.4;
  var RARITY_ORDER = ["rare", "epic", "legendary"];

  var sceneParent = null;
  var sceneHelpers = null;
  var lootFloorY = 0;
  var spots = [];
  var _snapVec = null;
  var generation = 0;

  function readState() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeState() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          spots.map(function (spot) {
            return {
              id: spot.id,
              catalogId: spot.catalogId,
              rarity: spot.rarity || null,
              picked: !!spot.picked,
            };
          })
        )
      );
    } catch (e) {
      /* ignore */
    }
  }

  function poolForRarity(rarity) {
    var catalog = window.ItemCatalog;
    var out = [];
    var key;
    if (!catalog || !catalog.ITEMS) return out;
    for (key in catalog.ITEMS) {
      if (!Object.prototype.hasOwnProperty.call(catalog.ITEMS, key)) continue;
      var item = catalog.ITEMS[key];
      if (
        item &&
        item.rarity === rarity &&
        item.model3d &&
        item.reclaimMin != null
      ) {
        out.push(item.id || key);
      }
    }
    return out;
  }

  function pickFromPool(pool) {
    if (!pool || !pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function rollRarity() {
    var roll = Math.random();
    if (roll < RARITY_RARE_CHANCE) return "rare";
    if (roll < RARITY_RARE_CHANCE + RARITY_EPIC_CHANCE) return "epic";
    return "legendary";
  }

  function rollCatalogForRarity(rarity) {
    var id = pickFromPool(poolForRarity(rarity));
    if (id) return { catalogId: id, rarity: rarity };
    var i;
    for (i = 0; i < RARITY_ORDER.length; i++) {
      if (RARITY_ORDER[i] === rarity) continue;
      id = pickFromPool(poolForRarity(RARITY_ORDER[i]));
      if (id) return { catalogId: id, rarity: RARITY_ORDER[i] };
    }
    return { catalogId: null, rarity: rarity };
  }

  function rollSpotLoot() {
    return rollCatalogForRarity(rollRarity());
  }

  function applySavedOrRoll(specs, saved) {
    var savedById = Object.create(null);
    var i;
    if (saved) {
      for (i = 0; i < saved.length; i++) {
        if (saved[i] && saved[i].id) savedById[saved[i].id] = saved[i];
      }
    }
    spots = specs.map(function (spec) {
      var prior = savedById[spec.id];
      var rolled = null;
      var catalogId = prior ? prior.catalogId || null : null;
      var rarity = prior && prior.rarity ? prior.rarity : null;
      if (!catalogId) {
        rolled = rollSpotLoot();
        catalogId = rolled.catalogId;
        rarity = rolled.rarity;
      }
      return {
        id: spec.id,
        x: spec.x,
        z: spec.z,
        catalogId: catalogId,
        rarity: rarity,
        picked: prior ? !!prior.picked : false,
        root: null,
      };
    });
    writeState();
  }

  function removeSpotRoot(spot) {
    if (spot && spot.root && spot.root.parent) spot.root.parent.remove(spot.root);
    if (spot) spot.root = null;
  }

  function resetGltfScenePose(model) {
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
  }

  function targetSize(cat) {
    var cols = cat.w || 1;
    var rows = cat.h || 1;
    var longest = Math.max(cols, rows);
    return {
      x: Math.min(1.1, 0.24 * cols),
      y: Math.min(0.8, 0.2 * rows),
      z: Math.min(0.9, 0.22 * longest),
    };
  }

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
      for (var i = 0; i < posAttr.count; i++) {
        _snapVec.fromBufferAttribute(posAttr, i);
        _snapVec.applyMatrix4(child.matrixWorld);
        if (_snapVec.y < minY) minY = _snapVec.y;
      }
    });
    if (minY === Infinity) minY = new THREE.Box3().setFromObject(root).min.y;
    root.position.y += lootFloorY + SNAP_LIFT - minY;
    root.updateMatrixWorld(true);
  }

  function mountModel(spot, cat, gltf) {
    if (!sceneParent || spot.picked || !gltf || !gltf.scene || !window.THREE) return;
    var THREE = window.THREE;
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "BasementStorageLoot_" + spot.id;
    resetGltfScenePose(model);
    root.add(model);
    root.position.set(spot.x, lootFloorY, spot.z);
    var size = targetSize(cat);
    if (sceneHelpers && sceneHelpers.fitModelUniformToBox) {
      sceneHelpers.fitModelUniformToBox(root, size);
    } else if (sceneHelpers && sceneHelpers.fitModelToBox) {
      sceneHelpers.fitModelToBox(root, size);
    }
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);
    snapRootToFloor(root);
    model.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    sceneParent.add(root);
    spot.root = root;
  }

  function buildSpotModel(spot) {
    if (!spot.catalogId || spot.picked || !sceneHelpers || !sceneHelpers.loadGltfCached) {
      return;
    }
    var cat = window.ItemCatalog && window.ItemCatalog.getItem(spot.catalogId);
    if (!cat || !cat.model3d) return;
    sceneHelpers.loadGltfCached(
      cat.model3d,
      function (gltf) {
        if (
          spot.generation === generation &&
          !spot.picked &&
          spot.catalogId === cat.id
        ) {
          mountModel(spot, cat, gltf);
        }
      },
      function () {
        console.warn("[BasementStorageLoot] GLB 加载失败:", cat.model3d);
      }
    );
  }

  function build(parent, helpers, placement) {
    generation += 1;
    sceneParent = parent || null;
    sceneHelpers = helpers || null;
    lootFloorY =
      placement && typeof placement.floorY === "number" ? placement.floorY : 0;
    var specs =
      placement && Array.isArray(placement.spots) ? placement.spots : [];
    if (!sceneParent || !specs.length) return;
    applySavedOrRoll(specs, readState());
    for (var i = 0; i < spots.length; i++) spots[i].generation = generation;
    for (i = 0; i < spots.length; i++) buildSpotModel(spots[i]);
  }

  function canSee(spot, px, pz) {
    var ty = lootFloorY + 0.4;
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(px, pz, spot.x, ty, spot.z);
    }
    return (
      !sceneHelpers ||
      !sceneHelpers.hasLineOfSight ||
      sceneHelpers.hasLineOfSight(px, pz, spot.x, ty, spot.z)
    );
  }

  function nearestPickup(px, pz) {
    var best = null;
    var bestD = PICKUP_DIST * PICKUP_DIST;
    for (var i = 0; i < spots.length; i++) {
      var spot = spots[i];
      if (!spot.catalogId || spot.picked || !spot.root) continue;
      var dx = px - spot.x;
      var dz = pz - spot.z;
      var d = dx * dx + dz * dz;
      if (d <= bestD && canSee(spot, px, pz)) {
        best = spot;
        bestD = d;
      }
    }
    return best;
  }

  function shouldShowPickupHint(px, pz) {
    return !!nearestPickup(px, pz);
  }

  function tryPickup(px, pz) {
    var spot = nearestPickup(px, pz);
    if (!spot || !window.ItemCatalog || !window.PlayerLoadout) return false;
    var cat = window.ItemCatalog.getItem(spot.catalogId);
    if (!cat || !window.PlayerLoadout.tryPlaceLootInSecureThenBackpack) return false;
    var dest = window.PlayerLoadout.tryPlaceLootInSecureThenBackpack(cat);
    if (!dest) {
      if (window.ActionScene && window.ActionScene.showDurabilityBanner) {
        window.ActionScene.showDurabilityBanner("安全箱与背包均无空位");
      }
      return false;
    }
    spot.picked = true;
    removeSpotRoot(spot);
    writeState();
    if (window.GridStashUI) window.GridStashUI.render();
    if (window.ActionInventory && window.ActionInventory.refresh) {
      window.ActionInventory.refresh();
    }
    if (window.ActionScene && window.ActionScene.showDurabilityBanner) {
      window.ActionScene.showDurabilityBanner("已拾取「" + cat.name + "」");
    }
    return true;
  }

  function resetForNewRun() {
    generation += 1;
    for (var i = 0; i < spots.length; i++) removeSpotRoot(spots[i]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    spots = [];
  }

  function getPreloadUrls() {
    var urls = [];
    var seen = Object.create(null);
    var i;
    var j;
    for (i = 0; i < RARITY_ORDER.length; i++) {
      var ids = poolForRarity(RARITY_ORDER[i]);
      for (j = 0; j < ids.length; j++) {
        var cat = window.ItemCatalog && window.ItemCatalog.getItem(ids[j]);
        if (!cat || !cat.model3d || seen[cat.model3d]) continue;
        seen[cat.model3d] = true;
        urls.push(cat.model3d);
      }
    }
    return urls;
  }

  window.BasementStorageLoot = {
    build: build,
    shouldShowPickupHint: shouldShowPickupHint,
    tryPickup: tryPickup,
    resetForNewRun: resetForNewRun,
    getPreloadUrls: getPreloadUrls,
    rollRarity: rollRarity,
  };
})();

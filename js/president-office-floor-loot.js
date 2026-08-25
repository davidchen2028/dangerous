/**
 * 测试地图 · 总统府地面产品刷新（5 个独立点）
 * 红点：史诗 30% · 荣誉章 50% · 八音盒 2% · 空 18%
 * 绿点：史诗 60% · 荣誉章 30% · 八音盒 5% · 空 5%
 */
(function () {
  "use strict";

  var STORAGE_KEY = "dangerous_president_office_floor_loot_v1";
  var PICKUP_DIST = 2.4;
  var FLOOR_Y = 0.08;
  var HONOR_MEDAL_ID = "collectible_3005";
  var MUSIC_BOX_ID = "collectible_3002";

  var sceneParent = null;
  var sceneHelpers = null;
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
              picked: !!spot.picked,
            };
          })
        )
      );
    } catch (e) {
      /* ignore */
    }
  }

  function epicPool() {
    var catalog = window.ItemCatalog;
    var out = [];
    var key;
    if (!catalog || !catalog.ITEMS) return out;
    for (key in catalog.ITEMS) {
      if (!Object.prototype.hasOwnProperty.call(catalog.ITEMS, key)) continue;
      var item = catalog.ITEMS[key];
      if (item && item.rarity === "epic" && item.model3d) out.push(item.id);
    }
    return out;
  }

  function randomEpicId() {
    var pool = epicPool();
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function rollCatalogId(kind) {
    var roll = Math.random() * 100;
    if (kind === "green") {
      if (roll < 60) return randomEpicId();
      if (roll < 90) return HONOR_MEDAL_ID;
      if (roll < 95) return MUSIC_BOX_ID;
      return null;
    }
    if (roll < 30) return randomEpicId();
    if (roll < 80) return HONOR_MEDAL_ID;
    if (roll < 82) return MUSIC_BOX_ID;
    return null;
  }

  function createSpotSpecs(house) {
    var wallInset = 1.05;
    var officeX = house.centerX - house.stemHalfW - 1.1;
    return [
      {
        id: "red_northeast",
        kind: "red",
        x: house.centerX + house.topHalfW - wallInset,
        z: house.northZ - wallInset,
      },
      {
        id: "red_stem_southwest",
        kind: "red",
        x: house.centerX - house.stemHalfW + wallInset,
        z: house.southZ + wallInset,
      },
      {
        id: "red_stem_southeast",
        kind: "red",
        x: house.centerX + house.stemHalfW - wallInset,
        z: house.southZ + wallInset,
      },
      {
        id: "green_office_north",
        kind: "green",
        x: officeX,
        z: house.northZ - wallInset,
      },
      {
        id: "green_office_south",
        kind: "green",
        x: officeX,
        z: house.splitZ + wallInset,
      },
    ];
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
      return {
        id: spec.id,
        kind: spec.kind,
        x: spec.x,
        z: spec.z,
        catalogId: prior ? prior.catalogId || null : rollCatalogId(spec.kind),
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
    var scale = cat.id === HONOR_MEDAL_ID ? 2.4 : 1;
    return {
      x: Math.min(1.1, 0.24 * cols * scale),
      y: Math.min(0.8, 0.2 * rows * scale),
      z: Math.min(0.9, 0.22 * longest * scale),
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
    root.position.y += FLOOR_Y - minY;
    root.updateMatrixWorld(true);
  }

  function mountModel(spot, cat, gltf) {
    if (!sceneParent || spot.picked || !gltf || !gltf.scene || !window.THREE) return;
    var THREE = window.THREE;
    var model = gltf.scene.clone(true);
    var root = new THREE.Group();
    root.name = "PresidentOfficeFloorLoot_" + spot.id;
    resetGltfScenePose(model);
    root.add(model);
    root.position.set(spot.x, 0, spot.z);
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
        console.warn("[PresidentOfficeFloorLoot] GLB 加载失败:", cat.model3d);
      }
    );
  }

  function build(parent, helpers, house) {
    generation += 1;
    sceneParent = parent || null;
    sceneHelpers = helpers || null;
    if (!sceneParent || !house) return;
    applySavedOrRoll(createSpotSpecs(house), readState());
    for (var i = 0; i < spots.length; i++) spots[i].generation = generation;
    for (i = 0; i < spots.length; i++) buildSpotModel(spots[i]);
  }

  function canSee(spot, px, pz) {
    if (window.ActionScene && window.ActionScene.hasLineOfSight) {
      return window.ActionScene.hasLineOfSight(px, pz, spot.x, 0.4, spot.z);
    }
    return (
      !sceneHelpers ||
      !sceneHelpers.hasLineOfSight ||
      sceneHelpers.hasLineOfSight(px, pz, spot.x, 0.4, spot.z)
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
    var ids = epicPool().concat([HONOR_MEDAL_ID, MUSIC_BOX_ID]);
    for (var i = 0; i < ids.length; i++) {
      var cat = window.ItemCatalog && window.ItemCatalog.getItem(ids[i]);
      if (!cat || !cat.model3d || seen[cat.model3d]) continue;
      seen[cat.model3d] = true;
      urls.push(cat.model3d);
    }
    return urls;
  }

  window.PresidentOfficeFloorLoot = {
    build: build,
    shouldShowPickupHint: shouldShowPickupHint,
    tryPickup: tryPickup,
    resetForNewRun: resetForNewRun,
    getPreloadUrls: getPreloadUrls,
  };
})();

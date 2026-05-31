/**
 * 教程场景 — 卡车后方巡逻小兵（持 UZI）
 * Tripo GLB 无骨骼，无法持枪/走路，故用程序化造型。
 */
(function () {
  "use strict";

  var SOLDIER_GLB_URL = "models/military-soldier.glb";
  var SOLDIER_HEIGHT = 1.8;
  var BODY_RADIUS = 0.38;
  var BODY_COLOR = 0x4a5c48;
  var VEST_COLOR = 0x3d4a38;
  var HELMET_COLOR = 0x2e3a2c;
  var FRONT_STRIPE_COLOR = 0xd4a840;
  var VISOR_COLOR = 0x1e2838;
  var BACKPACK_COLOR = 0x2a3328;

  var PATROL = {
    xMin: -2.4,
    xMax: 2.4,
    zMin: 34,
    zMax: 41.5,
  };
  var WALK_SPEED = 1.15;
  var WAIT_MIN = 0.8;
  var WAIT_MAX = 2.4;
  var ARRIVE_EPS = 0.35;

  var NPC_WEAPON_LENGTH = 0.42;
  var WEAPON_POS = { x: 0.14, y: 1.02, z: 0.22 };
  var WEAPON_ROT_DEG = { x: -12, y: 0, z: 0 };

  var sectorParent = null;
  var helpers = null;
  var soldierRoot = null;
  var bodyPivot = null;
  var weaponPivot = null;
  var ready = false;

  var pos = { x: 0, z: 36 };
  var yaw = Math.PI;
  var target = { x: 0, z: 39 };
  var waitT = 0;
  var walkPhase = 0;

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickPatrolTarget() {
    return {
      x: randRange(PATROL.xMin, PATROL.xMax),
      z: randRange(PATROL.zMin, PATROL.zMax),
    };
  }

  function fitWeaponUniform(root, targetLength) {
    root.scale.set(1, 1, 1);
    root.traverse(function (child) {
      if (child.isMesh) child.scale.set(1, 1, 1);
    });
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    if (!isFinite(maxDim) || maxDim < 1e-5) maxDim = 1;
    var s = targetLength / maxDim;
    root.scale.set(s, s, s);
    root.updateMatrixWorld(true);
  }

  function orientWeaponForNpc(model) {
    var THREE = window.THREE;
    if (!THREE) return;
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: -Math.PI / 2, y: 0, z: 0 },
      { x: Math.PI / 2, y: 0, z: 0 },
    ];
    var best = presets[0];
    var bestScore = -1e9;
    var i;

    for (i = 0; i < presets.length; i++) {
      var p = presets[i];
      model.rotation.order = "YXZ";
      model.rotation.set(p.x, p.y, p.z);
      model.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(model);
      var size = new THREE.Vector3();
      box.getSize(size);
      var score = 0;
      if (size.z >= size.x && size.z >= size.y) score += 80;
      if (size.y <= size.x) score += 20;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    var deg = Math.PI / 180;
    model.rotation.order = "YXZ";
    model.rotation.set(best.x, best.y, best.z);
    model.rotation.x += WEAPON_ROT_DEG.x * deg;
    model.rotation.y += WEAPON_ROT_DEG.y * deg;
    model.rotation.z += WEAPON_ROT_DEG.z * deg;
    model.updateMatrixWorld(true);
  }

  function brightenWeaponMaterials(root) {
    root.traverse(function (child) {
      if (!child.isMesh || !child.material) return;
      var mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      var i;
      for (i = 0; i < mats.length; i++) {
        var m = mats[i];
        m.fog = true;
        if (m.emissive) {
          m.emissive.setHex(0x181818);
          if (m.emissiveIntensity != null) m.emissiveIntensity = 0.2;
        }
        m.needsUpdate = true;
      }
    });
  }

  function attachUzi() {
    if (!weaponPivot || !helpers || !helpers.loadGltfCached) return;
    var uziUrl =
      window.ActionWeapon && window.ActionWeapon.UZI_GLB_URL
        ? window.ActionWeapon.UZI_GLB_URL
        : "models/uzi.glb";

    helpers.loadGltfCached(
      uziUrl,
      function (gltf) {
        if (!weaponPivot) return;
        var model = gltf.scene.clone(true);
        orientWeaponForNpc(model);
        fitWeaponUniform(model, NPC_WEAPON_LENGTH);
        brightenWeaponMaterials(model);
        model.traverse(function (child) {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.frustumCulled = false;
        });
        weaponPivot.add(model);
      },
      function (err) {
        console.warn("[ActionNpcSoldier] UZI 挂载失败", err);
      }
    );
  }

  function buildPatrolSoldier() {
    var THREE = window.THREE;
    if (!THREE || !sectorParent) return;

    var bodyH = SOLDIER_HEIGHT - BODY_RADIUS * 2;
    var cylLen = Math.max(0.2, bodyH);

    soldierRoot = new THREE.Group();
    soldierRoot.name = "PatrolSoldier";

    bodyPivot = new THREE.Group();
    bodyPivot.name = "PatrolSoldier_Body";

    var bodyMat = new THREE.MeshStandardMaterial({
      color: BODY_COLOR,
      roughness: 0.82,
      metalness: 0.06,
    });
    var vestMat = new THREE.MeshStandardMaterial({
      color: VEST_COLOR,
      roughness: 0.78,
      metalness: 0.04,
    });
    var helmetMat = new THREE.MeshStandardMaterial({
      color: HELMET_COLOR,
      roughness: 0.7,
      metalness: 0.12,
    });

    var torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_RADIUS, cylLen, 6, 12),
      bodyMat
    );
    torso.position.y = BODY_RADIUS + cylLen * 0.5;
    torso.castShadow = true;
    torso.receiveShadow = true;
    bodyPivot.add(torso);

    var vest = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_RADIUS * 1.55, cylLen * 0.55, BODY_RADIUS * 1.05),
      vestMat
    );
    vest.position.y = BODY_RADIUS + cylLen * 0.42;
    vest.castShadow = true;
    bodyPivot.add(vest);

    var helmetY = BODY_RADIUS + cylLen + BODY_RADIUS * 0.42;
    var helmet = new THREE.Mesh(
      new THREE.SphereGeometry(BODY_RADIUS * 0.62, 12, 10),
      helmetMat
    );
    helmet.position.y = helmetY;
    helmet.scale.y = 0.82;
    helmet.castShadow = true;
    bodyPivot.add(helmet);

    var accentMat = new THREE.MeshStandardMaterial({
      color: FRONT_STRIPE_COLOR,
      roughness: 0.62,
      metalness: 0.12,
      emissive: 0x4a3810,
      emissiveIntensity: 0.18,
    });
    var visorMat = new THREE.MeshStandardMaterial({
      color: VISOR_COLOR,
      roughness: 0.35,
      metalness: 0.35,
    });
    var packMat = new THREE.MeshStandardMaterial({
      color: BACKPACK_COLOR,
      roughness: 0.88,
      metalness: 0.04,
    });

    // 正面：面罩 + 胸章（+Z）
    var visor = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_RADIUS * 0.88, BODY_RADIUS * 0.3, 0.05),
      visorMat
    );
    visor.position.set(0, helmetY - 0.02, BODY_RADIUS * 0.5);
    visor.castShadow = true;
    bodyPivot.add(visor);

    var chestStripe = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_RADIUS * 0.42, cylLen * 0.38, 0.045),
      accentMat
    );
    chestStripe.position.set(0, BODY_RADIUS + cylLen * 0.44, BODY_RADIUS * 0.56);
    chestStripe.castShadow = true;
    bodyPivot.add(chestStripe);

    // 背面：背包 + 天线（-Z）
    var backpack = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_RADIUS * 1.15, cylLen * 0.48, BODY_RADIUS * 0.5),
      packMat
    );
    backpack.position.set(0, BODY_RADIUS + cylLen * 0.44, -BODY_RADIUS * 0.58);
    backpack.castShadow = true;
    bodyPivot.add(backpack);

    var antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.24, 6),
      packMat
    );
    antenna.position.set(-0.14, BODY_RADIUS + cylLen * 0.78, -BODY_RADIUS * 0.52);
    antenna.castShadow = true;
    bodyPivot.add(antenna);

    var armMat = vestMat.clone();
    var leftArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.38, 4, 8),
      armMat
    );
    leftArm.position.set(-0.34, 1.18, 0.08);
    leftArm.rotation.set(-0.55, 0.12, 0.35);
    leftArm.castShadow = true;
    bodyPivot.add(leftArm);

    var rightArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.38, 4, 8),
      armMat
    );
    rightArm.position.set(0.28, 1.12, 0.12);
    rightArm.rotation.set(-0.75, -0.08, -0.25);
    rightArm.castShadow = true;
    bodyPivot.add(rightArm);

    weaponPivot = new THREE.Group();
    weaponPivot.name = "PatrolSoldier_WeaponPivot";
    weaponPivot.position.set(WEAPON_POS.x, WEAPON_POS.y, WEAPON_POS.z);
    bodyPivot.add(weaponPivot);

    soldierRoot.add(bodyPivot);
    soldierRoot.position.set(pos.x, 0, pos.z);
    sectorParent.add(soldierRoot);

    attachUzi();
    target = pickPatrolTarget();
    ready = true;
  }

  function build(parent, sceneHelpers) {
    sectorParent = parent;
    helpers = sceneHelpers || null;
    ready = false;
    pos.x = randRange(PATROL.xMin, PATROL.xMax);
    pos.z = randRange(PATROL.zMin + 0.5, PATROL.zMax - 0.5);
    target = pickPatrolTarget();
    waitT = randRange(0.2, 1);
    buildPatrolSoldier();
  }

  function updateTransform(moving) {
    if (!soldierRoot || !bodyPivot) return;
    soldierRoot.position.set(pos.x, 0, pos.z);
    bodyPivot.rotation.y = yaw;
    if (moving) {
      walkPhase += 0.14;
      bodyPivot.position.y = Math.sin(walkPhase) * 0.035;
    } else {
      bodyPivot.position.y = 0;
    }
  }

  function update(dt) {
    if (!ready || !soldierRoot) return;

    if (waitT > 0) {
      waitT -= dt;
      updateTransform(false);
      return;
    }

    var dx = target.x - pos.x;
    var dz = target.z - pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < ARRIVE_EPS) {
      waitT = randRange(WAIT_MIN, WAIT_MAX);
      target = pickPatrolTarget();
      updateTransform(false);
      return;
    }

    var step = WALK_SPEED * dt;
    if (step > dist) step = dist;
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    yaw = Math.atan2(-dx, -dz);
    updateTransform(true);
  }

  function dispose() {
    if (soldierRoot && soldierRoot.parent) {
      soldierRoot.parent.remove(soldierRoot);
    }
    soldierRoot = null;
    bodyPivot = null;
    weaponPivot = null;
    ready = false;
  }

  window.ActionNpcSoldier = {
    SOLDIER_GLB_URL: SOLDIER_GLB_URL,
    build: build,
    update: update,
    dispose: dispose,
  };
})();

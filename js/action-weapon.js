/**
 * 教程 — 第一人称 UZI（持枪、右键开镜、左键连发、消耗背包子弹）
 */
(function () {
  "use strict";

  var UZI_GLB_URL = "models/uzi.glb";
  /**
   * 第一人称里枪的最大边长（米），等比缩放，不会拉变形
   * 觉得大 → 改小（如 0.28）；觉得小 → 改大（如 0.42）
   */
  var WEAPON_LENGTH = 0.34;
  /** 在 WEAPON_LENGTH 基础上再乘一次（1 = 100%） */
  var WEAPON_SCALE = 1;
  /** 在自动朝向基础上的微调（度） */
  var WEAPON_ROT_DEG = { x: 0, y: 0, z: 0 };
  var HIP_POS = { x: 0.12, y: -0.26, z: -0.42 };
  /**
   * 开镜相对腰射的偏移（在 hipWeaponPos 基础上加减）
   * x 变小 → 更靠屏幕中心；y 变大 → 抬高；z 变大 → 更靠近相机（负值变小）
   */
  var ADS_OFFSET = { x: -0.1, y: 0.05, z: 0.1 };
  var HIP_FOV = 72;
  var ADS_FOV = 50;
  /** 射速（发/分），改小则更慢，例如 400 */
  var ROUNDS_PER_MINUTE = 500;
  var FIRE_INTERVAL = 60 / ROUNDS_PER_MINUTE;
  /** 后坐力只抬视角（枪挂相机上，随视角一起动，不再单独抖枪模） */
  var RECOIL_IMPULSE = 6.8;
  var RECOIL_PER_SHOT = 0.0085;
  var RECOIL_VEL_DAMP = 9;
  var RECOIL_PITCH_SCALE = 0.0058;
  var RECOIL_MAX_VEL = 12;
  var GUN_VOLUME = 0.3;

  var camera = null;
  var canvas = null;
  var crosshairEl = null;
  var ammoHudEl = null;
  var helpers = null;

  var fpsWeaponRoot = null;
  var weaponRest = { x: 0, y: 0, z: 0 };
  var hipWeaponPos = { x: 0, y: 0, z: 0 };
  var adsWeaponPos = { x: 0, y: 0, z: 0 };
  var weaponAlignX = 0;
  var aimBlend = 0;
  var fovBlend = 0;
  var recoilVel = 0;
  var recoilKickPending = 0;
  var pitchRecoilFrame = 0;
  var fireCooldown = 0;
  var audioCtx = null;
  var muzzleFlashT = 0;
  var muzzleLight = null;

  var mouseFire = false;
  var mouseAim = false;
  var weaponLoading = false;
  var lastDryFireAt = 0;

  function hasUziEquipped() {
    if (!window.PlayerLoadout) return false;
    var loadout = window.PlayerLoadout.getLoadout();
    return !!(loadout.primary && loadout.primary.id === "uzi_smg");
  }

  function getTargetWeaponLength() {
    return WEAPON_LENGTH * WEAPON_SCALE;
  }

  /** 重置 GLB 自带 scale，再按最长边等比缩放到 target 米 */
  function fitWeaponUniform(root, targetLength) {
    var THREE = window.THREE;
    root.scale.set(1, 1, 1);
    root.traverse(function (child) {
      if (child.isMesh) {
        child.scale.set(1, 1, 1);
      }
    });
    root.updateMatrixWorld(true);

    var box = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxDim = Math.max(size.x, size.y, size.z);
    if (!isFinite(maxDim) || maxDim < 1e-5) {
      console.warn("[ActionWeapon] 武器包围盒异常，使用默认缩放");
      maxDim = 1;
    }
    var s = targetLength / maxDim;
    root.scale.set(s, s, s);
    root.updateMatrixWorld(true);
  }

  function getHandAnchor() {
    if (helpers && helpers.getHandAnchor) return helpers.getHandAnchor();
    return { x: 0, y: -0.26, z: -0.4 };
  }

  /**
   * 自动摆正：枪身朝屏幕外（相机 -Z），避免模型导入轴向反了
   * 仍不对时在 WEAPON_ROT_DEG 上微调（度）
   */
  function orientWeaponForFps(model) {
    if (!window.THREE) return;
    var THREE = window.THREE;
    var presets = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: Math.PI, z: 0 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 0, y: -Math.PI / 2, z: 0 },
      { x: Math.PI, y: 0, z: 0 },
      { x: Math.PI, y: Math.PI, z: 0 },
      { x: -Math.PI / 2, y: Math.PI, z: 0 },
      { x: Math.PI / 2, y: Math.PI, z: 0 },
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
      var dims = [size.x, size.y, size.z].sort(function (a, b) {
        return a - b;
      });

      var score = 0;
      if (Math.abs(size.z - dims[2]) < dims[2] * 0.25) score += 80;
      if (Math.abs(size.y - dims[1]) < dims[1] * 0.25) score += 30;
      var forward = -box.min.z;
      var backward = box.max.z;
      if (forward > backward * 1.05) score += 120;
      else if (backward > forward * 1.05) score -= 120;

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
        m.fog = false;
        m.side = window.THREE.DoubleSide;
        if (m.emissive) {
          m.emissive.setHex(0x222222);
          if (m.emissiveIntensity != null) m.emissiveIntensity = 0.35;
        }
        if (m.metalness != null) m.metalness = Math.min(m.metalness, 0.85);
        if (m.roughness != null) m.roughness = Math.max(m.roughness, 0.35);
        m.needsUpdate = true;
      }
    });
  }

  function alignWeaponPivot(pivot) {
    if (!window.THREE) return;
    pivot.updateMatrixWorld(true);
    var box = new window.THREE.Box3().setFromObject(pivot);
    var anchor = getHandAnchor();
    var cx = (box.min.x + box.max.x) * 0.5;
    weaponAlignX = -cx;
    weaponRest.x = HIP_POS.x + weaponAlignX;
    weaponRest.y = anchor.y - box.min.y;
    weaponRest.z = anchor.z - box.min.z;
    pivot.position.set(weaponRest.x, weaponRest.y, weaponRest.z);

    hipWeaponPos.x = weaponRest.x;
    hipWeaponPos.y = weaponRest.y;
    hipWeaponPos.z = weaponRest.z;

    adsWeaponPos.x = hipWeaponPos.x + ADS_OFFSET.x;
    adsWeaponPos.y = hipWeaponPos.y + ADS_OFFSET.y;
    adsWeaponPos.z = hipWeaponPos.z + ADS_OFFSET.z;
  }

  function setArmsVisible(show) {
    if (!helpers || !helpers.getArmsRoot) return;
    var arms = helpers.getArmsRoot();
    if (arms) arms.visible = !!show;
  }

  function detachWeapon() {
    if (fpsWeaponRoot && camera) {
      camera.remove(fpsWeaponRoot);
    }
    fpsWeaponRoot = null;
    if (muzzleLight && camera) {
      camera.remove(muzzleLight);
      muzzleLight = null;
    }
    setArmsVisible(true);
  }

  function ensureMuzzleLight() {
    if (!camera || !window.THREE || muzzleLight) return;
    muzzleLight = new window.THREE.PointLight(0xffcc88, 0, 2.5);
    muzzleLight.position.set(0.05, -0.18, -0.55);
    camera.add(muzzleLight);
  }

  function loadWeaponModel() {
    if (!camera || !helpers || fpsWeaponRoot || weaponLoading) return;
    if (!hasUziEquipped()) return;

    weaponLoading = true;
    helpers.loadGltfCached(
      UZI_GLB_URL,
      function (gltf) {
        weaponLoading = false;
        if (!camera || !hasUziEquipped()) return;

        var model = gltf.scene.clone(true);
        orientWeaponForFps(model);

        var pivot = new window.THREE.Group();
        pivot.name = "UziFPS_Pivot";
        pivot.add(model);

        helpers.prepareFpsViewModel(pivot, false);
        brightenWeaponMaterials(pivot);
        fitWeaponUniform(pivot, getTargetWeaponLength());
        alignWeaponPivot(pivot);

        pivot.renderOrder = 20;
        pivot.visible = true;
        pivot.traverse(function (o) {
          o.visible = true;
          o.frustumCulled = false;
        });
        fpsWeaponRoot = pivot;
        setArmsVisible(false);
        camera.add(fpsWeaponRoot);
        fpsWeaponRoot.updateMatrixWorld(true);
        ensureMuzzleLight();
        updateAmmoHud();
      },
      function (err) {
        weaponLoading = false;
        console.error("[ActionWeapon] UZI 模型加载失败:", UZI_GLB_URL, err);
      }
    );
  }

  function updateAmmoHud() {
    if (!ammoHudEl) return;
    if (!hasUziEquipped()) {
      ammoHudEl.hidden = true;
      return;
    }
    var n =
      window.PlayerLoadout && window.PlayerLoadout.getBrassAmmoCount
        ? window.PlayerLoadout.getBrassAmmoCount()
        : 0;
    ammoHudEl.hidden = false;
    ammoHudEl.textContent = "子弹 " + n;
    ammoHudEl.classList.toggle("action-ammo-hud--empty", n <= 0);
  }

  function updateCrosshairStyle() {
    if (!crosshairEl) return;
    crosshairEl.classList.toggle("action-crosshair--ads", aimBlend > 0.35);
    crosshairEl.classList.toggle(
      "action-crosshair--weapon",
      hasUziEquipped()
    );
  }

  function flashMuzzle() {
    muzzleFlashT = 0.045;
    if (muzzleLight) muzzleLight.intensity = 2.2;
  }

  function ensureAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  /** 程序化短促枪声（无需音频文件） */
  function playGunshotSound() {
    var ctx = ensureAudioContext();
    if (!ctx) return;

    var t = ctx.currentTime;
    var vol = GUN_VOLUME * (aimBlend > 0.4 ? 0.72 : 1);
    var len = Math.floor(ctx.sampleRate * 0.07);
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var i;
    for (i = 0; i < len; i++) {
      var env = Math.exp(-i / (len * 0.22));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    var noise = ctx.createBufferSource();
    noise.buffer = buffer;

    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700 + Math.random() * 500;

    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400 + Math.random() * 600;
    bp.Q.value = 0.7;

    var ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(ng);
    ng.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.08);

    var osc = ctx.createOscillator();
    osc.type = "square";
    var f0 = 95 + Math.random() * 35;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.035);

    var og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.42, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  function playDryFireSound() {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(GUN_VOLUME * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  function addRecoilImpulse() {
    recoilVel = Math.min(recoilVel + RECOIL_IMPULSE, RECOIL_MAX_VEL);
    recoilKickPending += RECOIL_PER_SHOT;
  }

  function updateRecoil(dt) {
    pitchRecoilFrame = recoilVel * dt * RECOIL_PITCH_SCALE + recoilKickPending;
    recoilKickPending = 0;
    recoilVel *= Math.exp(-RECOIL_VEL_DAMP * dt);
  }

  function tryFireShot(addRecoil) {
    if (!window.PlayerLoadout || !window.PlayerLoadout.consumeBrassAmmo) {
      return false;
    }
    var result = window.PlayerLoadout.consumeBrassAmmo(1);
    if (!result || !result.ok) {
      var now = Date.now();
      if (now - lastDryFireAt > 700) {
        lastDryFireAt = now;
        playDryFireSound();
      }
      return false;
    }
    flashMuzzle();
    playGunshotSound();
    if (addRecoil) addRecoilImpulse();
    updateAmmoHud();
    if (
      window.ActionInventory &&
      window.ActionInventory.isOpen &&
      window.ActionInventory.refresh
    ) {
      window.ActionInventory.refresh();
    }
    return true;
  }

  function updateFiring(dt, canUse) {
    if (!canUse || !mouseFire || !hasUziEquipped()) return;

    fireCooldown -= Math.min(dt, 0.05);
    if (fireCooldown > 0) return;

    if (tryFireShot(true)) {
      fireCooldown = FIRE_INTERVAL;
    } else {
      fireCooldown = FIRE_INTERVAL * 0.45;
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function updateWeaponTransform(dt, anim) {
    if (!fpsWeaponRoot) return;

    var targetAim = mouseAim ? 1 : 0;
    aimBlend += (targetAim - aimBlend) * Math.min(1, dt * 14);

    var bob = anim.bob || 0;
    var sway = anim.sway || 0;
    var jumpTuck = anim.jumpTuck || 0;

    var ox = lerp(hipWeaponPos.x, adsWeaponPos.x, aimBlend) + sway * 0.08;
    var oy =
      lerp(hipWeaponPos.y, adsWeaponPos.y, aimBlend) -
      bob * (aimBlend > 0.4 ? 0.25 : 0.65) +
      jumpTuck;
    var oz =
      lerp(hipWeaponPos.z, adsWeaponPos.z, aimBlend) +
      (anim.grounded === false ? jumpTuck * 0.9 : 0);

    var swayMul = 1 - aimBlend * 0.92;
    fpsWeaponRoot.rotation.x = bob * 0.22 * swayMul;
    fpsWeaponRoot.rotation.z = sway * 0.18 * swayMul;
    fpsWeaponRoot.position.set(ox, oy, oz);
    fpsWeaponRoot.visible = true;

    if (camera) {
      var targetFov = lerp(HIP_FOV, ADS_FOV, aimBlend);
      fovBlend += (targetFov - fovBlend) * Math.min(1, dt * 12);
      camera.fov = fovBlend;
      camera.updateProjectionMatrix();
    }

    if (muzzleFlashT > 0) {
      muzzleFlashT -= dt;
      if (muzzleFlashT <= 0 && muzzleLight) muzzleLight.intensity = 0;
    }
  }

  function mount(cam, cvs, h) {
    camera = cam;
    canvas = cvs;
    helpers = h;
    crosshairEl = document.getElementById("actionCrosshair");
    ammoHudEl = document.getElementById("actionAmmoHud");
    if (camera) fovBlend = camera.fov;
    sync();
  }

  function sync() {
    if (!hasUziEquipped()) {
      detachWeapon();
      updateAmmoHud();
      updateCrosshairStyle();
      if (camera) {
        camera.fov = HIP_FOV;
        fovBlend = HIP_FOV;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (!fpsWeaponRoot) loadWeaponModel();
    else setArmsVisible(false);
    updateAmmoHud();
    updateCrosshairStyle();
  }

  function consumeRecoilPitch() {
    var d = pitchRecoilFrame;
    pitchRecoilFrame = 0;
    return d;
  }

  function update(dt, anim, opts) {
    opts = opts || {};

    if (!hasUziEquipped()) {
      if (fpsWeaponRoot) detachWeapon();
      aimBlend = 0;
      mouseFire = false;
      mouseAim = false;
      return;
    }

    if (!fpsWeaponRoot && !weaponLoading) loadWeaponModel();

    var canUse =
      opts.pointerLocked &&
      !opts.uiBlocking &&
      opts.running;

    updateFiring(dt, canUse);
    updateRecoil(dt);
    updateWeaponTransform(dt, anim || {});
    updateCrosshairStyle();
  }

  function clearInput() {
    mouseFire = false;
    mouseAim = false;
    fireCooldown = 0;
    recoilVel = 0;
    recoilKickPending = 0;
    pitchRecoilFrame = 0;
  }

  function onPointerDown(e) {
    ensureAudioContext();
    if (!e || e.button === 0) mouseFire = true;
    if (e && e.button === 2) {
      mouseAim = true;
      e.preventDefault();
    }
  }

  function onPointerUp(e) {
    if (!e || e.button === 0) mouseFire = false;
    if (!e || e.button === 2) mouseAim = false;
  }

  function dispose() {
    detachWeapon();
    clearInput();
    camera = null;
    canvas = null;
    helpers = null;
  }

  window.ActionWeapon = {
    UZI_GLB_URL: UZI_GLB_URL,
    mount: mount,
    sync: sync,
    update: update,
    clearInput: clearInput,
    onPointerDown: onPointerDown,
    onPointerUp: onPointerUp,
    dispose: dispose,
    consumeRecoilPitch: consumeRecoilPitch,
    hasUziEquipped: hasUziEquipped,
    isAiming: function () {
      return mouseAim;
    },
  };
})();

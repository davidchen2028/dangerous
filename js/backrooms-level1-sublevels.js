import * as THREE from "three";
import { buildLevel1_2World } from "./backrooms-level1-2-world.js?v=2";
import { buildLevel1_3World } from "./backrooms-level1-3-world.js?v=2";
import { buildLevel1_5World } from "./backrooms-level1-5-world.js?v=1";
import { markLevelEntered } from "./backrooms-tasks.js";

export function createLevel1SublevelManager(deps) {
  var activeId = null;
  var state = null;
  var returnSnapshot = null;
  var colliderBackup = null;
  var atmosphereBackup = null;
  var fxCanvas = document.createElement("canvas");
  fxCanvas.setAttribute("aria-hidden", "true");
  Object.assign(fxCanvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "5",
    display: "none",
  });
  document.body.appendChild(fxCanvas);

  function resizeFx() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(window.innerWidth * dpr));
    var height = Math.max(1, Math.round(window.innerHeight * dpr));
    if (fxCanvas.width !== width) fxCanvas.width = width;
    if (fxCanvas.height !== height) fxCanvas.height = height;
  }

  function saveAtmosphere() {
    atmosphereBackup = {
      background: deps.scene.background,
      fog: deps.scene.fog,
      cameraFar: deps.camera ? deps.camera.far : 90,
    };
  }

  function applyAtmosphere(id) {
    var color = id === "1.2" ? 0x243f29 : id === "1.5" ? 0xf0f0ed : 0xd7d9d9;
    deps.scene.background = new THREE.Color(color);
    deps.scene.fog = new THREE.Fog(
      color,
      id === "1.2" ? 5 : id === "1.5" ? 7 : 10,
      id === "1.2" ? 58 : id === "1.5" ? 66 : 72
    );
    if (deps.camera) {
      deps.camera.far = id === "1.2" ? 120 : id === "1.5" ? 135 : 150;
      deps.camera.updateProjectionMatrix();
    }
  }

  function restoreAtmosphere() {
    if (!atmosphereBackup) return;
    deps.scene.background = atmosphereBackup.background;
    deps.scene.fog = atmosphereBackup.fog;
    if (deps.camera) {
      deps.camera.far = atmosphereBackup.cameraFar;
      deps.camera.updateProjectionMatrix();
    }
    atmosphereBackup = null;
  }

  function setPlayer(spawn) {
    deps.fps.x = spawn.x;
    deps.fps.z = spawn.z;
    deps.fps.yaw = Number.isFinite(spawn.yaw) ? spawn.yaw : 0;
    deps.fps.pitch = Number.isFinite(spawn.pitch) ? spawn.pitch : 0;
    deps.fps.roll = Number.isFinite(spawn.roll) ? spawn.roll : 0;
    deps.fps.feetY = Number.isFinite(spawn.y) ? spawn.y : 0;
  }

  function swapColliders(next) {
    colliderBackup = deps.wallColliders.slice();
    deps.wallColliders.length = 0;
    for (var i = 0; i < next.length; i++) deps.wallColliders.push(next[i]);
  }

  function restoreColliders() {
    deps.wallColliders.length = 0;
    if (colliderBackup) {
      for (var i = 0; i < colliderBackup.length; i++) {
        deps.wallColliders.push(colliderBackup[i]);
      }
    }
    colliderBackup = null;
  }

  function enter(id) {
    if (activeId || (id !== "1.2" && id !== "1.3" && id !== "1.5")) return false;
    returnSnapshot = {
      x: deps.fps.x,
      z: deps.fps.z,
      yaw: deps.fps.yaw,
      pitch: deps.fps.pitch,
      roll: deps.fps.roll,
      feetY: deps.fps.feetY,
    };
    saveAtmosphere();
    if (id === "1.2") {
      state = buildLevel1_2World(deps.scene, { seed: Date.now() });
    } else if (id === "1.3") {
      state = buildLevel1_3World(deps.scene, { seed: Date.now() });
    } else {
      state = buildLevel1_5World(deps.scene, { seed: Date.now() });
    }
    if (!state) {
      restoreAtmosphere();
      returnSnapshot = null;
      return false;
    }
    activeId = id;
    deps.level1Root.visible = false;
    swapColliders(state.colliders || []);
    applyAtmosphere(id);
    setPlayer(state.spawn);
    fxCanvas.style.display = "block";
    resizeFx();
    var title =
      id === "1.2"
        ? "Backrooms · Level 1.2 · 砼苑 · 环境危害"
        : id === "1.3"
          ? "Backrooms · Level 1.3 · 恶性肿瘤 · 死区"
          : "Backrooms · Level 1.5 · 颠倒 · 生存难度未知";
    var entryToast =
      id === "1.2"
        ? "繁花与藤蔓覆盖了仓库。这里没有实体，但花园本身正在侵蚀你。"
        : id === "1.3"
          ? "封禁白墙在身后闭合。排毒区已发生“衰退”，切勿相信治疗标识。"
          : "假窗户无声消失。光与暗、上下、前后和低语的远近都已颠倒。";
    deps.onHudTitleChange(title);
    deps.showToast(entryToast);
    markLevelEntered("l" + id, deps.showToast);
    if (deps.setTemperatureZone) deps.setTemperatureZone(id);
    return true;
  }

  function exit() {
    if (!activeId) return false;
    var id = activeId;
    if (state && state.dispose) state.dispose();
    state = null;
    activeId = null;
    restoreColliders();
    restoreAtmosphere();
    deps.level1Root.visible = true;
    if (returnSnapshot) setPlayer(returnSnapshot);
    returnSnapshot = null;
    fxCanvas.style.display = "none";
    var ctx = fxCanvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    deps.onHudTitleChange("Backrooms · Level 1 · 生存难度 1");
    if (deps.setTemperatureZone) deps.setTemperatureZone(1);
    deps.showToast(
      id === "1.2"
        ? "你找回入口，逃离了砼苑。"
        : id === "1.3"
          ? "你从主廊末端切回了 Level 1。"
          : "颠倒的走廊在身后碎裂。你成功切回了 Level 1。"
    );
    return true;
  }

  function callbacks() {
    return {
      showToast: deps.showToast,
      onDamage: deps.onDamage,
      heal: deps.heal,
      grantItem: deps.grantItem,
      onMutation: deps.onMutation,
      onInvestigate: deps.onInvestigate,
      onTeleport: function (event) {
        if (event && event.destination) setPlayer(event.destination);
      },
    };
  }

  function update(dt, now) {
    if (!activeId || !state) return;
    state.update(dt, { x: deps.fps.x, y: deps.fps.feetY, z: deps.fps.z }, callbacks());
    var request = state.getExitRequest && state.getExitRequest(true);
    if (request) {
      exit();
      return;
    }
    resizeFx();
    var ctx = fxCanvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    if (state.drawFx) state.drawFx(fxCanvas, now);
  }

  function interact(target) {
    if (!activeId || !state || !state.interact) return false;
    var handled = state.interact(target, callbacks());
    var request = state.getExitRequest && state.getExitRequest(true);
    if (request) exit();
    return handled;
  }

  function dispose() {
    if (activeId) exit();
    if (fxCanvas.parentNode) fxCanvas.parentNode.removeChild(fxCanvas);
  }

  return {
    enter: enter,
    exit: exit,
    update: update,
    dispose: dispose,
    interact: interact,
    isActive: function () {
      return activeId != null;
    },
    getActiveId: function () {
      return activeId;
    },
    isForwardAxisInverted: function () {
      return activeId === "1.5";
    },
    getAimInteractRoots: function () {
      return state && state.interactMeshes ? state.interactMeshes : [];
    },
    getInteractionHint: function (target) {
      return state && state.getInteractionHint ? state.getInteractionHint(target) : "";
    },
    getMovementSpeedMul: function () {
      if (!state || !state.getSurvivalEnv) return 1;
      var env = state.getSurvivalEnv() || {};
      return Number.isFinite(env.movementMultiplier) ? env.movementMultiplier : 1;
    },
    getSanityDrainPerSec: function () {
      if (!state || !state.getSurvivalEnv) return 0;
      var env = state.getSurvivalEnv() || {};
      if (Number.isFinite(env.sanityDrainPerSec)) return env.sanityDrainPerSec;
      if (Number.isFinite(env.sanityDrainPerMinute)) return env.sanityDrainPerMinute / 60;
      return 0;
    },
  };
}

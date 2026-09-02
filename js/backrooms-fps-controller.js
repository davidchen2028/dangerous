/**
 * 后室独立关卡 — 共享第一人称移动 / 物理 / 输入
 */
import { resolveCircleAgainstColliders } from "./backrooms-collide.js";
import { attachMobileDragLook, isTouchPrimaryDevice } from "./backrooms-fps-look.js";
import { getLuckMovementMul } from "./backrooms-luck.js";

export { isTouchPrimaryDevice } from "./backrooms-fps-look.js";

export const DEFAULT_LOOK_SENS = 0.0022;
export const DEFAULT_GRAVITY = 32;
export const DEFAULT_JUMP_SPEED = 9;
export const DEFAULT_EYE_HEIGHT = 1.6;
export const DEFAULT_BODY_HEIGHT = 1.78;
export const DEFAULT_PLAYER_RADIUS = 0.32;
export const DEFAULT_PLAYER_SPEED = 4.2;
export const DEFAULT_PITCH_MIN = -1.35;
export const DEFAULT_PITCH_MAX = 1.35;

/**
 * @param {{ player?: Partial<{ x: number, z: number, radius: number, speed: number }> }} [opts]
 */
export function createBackroomsFpsState(opts) {
  var po = (opts && opts.player) || {};
  return {
    keys: Object.create(null),
    move: { forward: false, back: false, left: false, right: false },
    yaw: 0,
    pitch: 0,
    pointerLocked: false,
    player: {
      x: po.x != null ? po.x : 0,
      z: po.z != null ? po.z : 0,
      radius: po.radius != null ? po.radius : DEFAULT_PLAYER_RADIUS,
      speed: po.speed != null ? po.speed : DEFAULT_PLAYER_SPEED,
    },
    feetY: 0,
    velY: 0,
    grounded: true,
  };
}

/**
 * @param {{ forward: boolean, back: boolean, left: boolean, right: boolean }} move
 * @param {number} yaw
 */
export function readMoveInputWorldDir(move, yaw) {
  var dx = 0;
  var dz = 0;
  if (move.forward) dz -= 1;
  if (move.back) dz += 1;
  if (move.left) dx -= 1;
  if (move.right) dx += 1;
  if (dx === 0 && dz === 0) return null;

  var len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  var sinY = Math.sin(yaw);
  var cosY = Math.cos(yaw);
  return {
    worldX: dx * cosY + dz * sinY,
    worldZ: -dx * sinY + dz * cosY,
  };
}

/**
 * @param {ReturnType<createBackroomsFpsState>} state
 * @param {number} dt
 * @param {number} [speedMul=1]
 * @param {(nextX: number, nextZ: number) => { x: number, z: number }} resolvePosition
 */
export function moveBackroomsPlayer(state, dt, speedMul, resolvePosition) {
  var dir = readMoveInputWorldDir(state.move, state.yaw);
  if (!dir) return;

  var speed = state.player.speed * (speedMul || 1) * getLuckMovementMul();
  var nextX = state.player.x + dir.worldX * speed * dt;
  var nextZ = state.player.z + dir.worldZ * speed * dt;
  var out = resolvePosition(nextX, nextZ);
  state.player.x = out.x;
  state.player.z = out.z;
}

/**
 * @param {ReturnType<createBackroomsFpsState>} state
 * @param {number} dt
 * @param {{
 *   gravity?: number,
 *   bodyHeight?: number,
 *   ceilingY?: number | null,
 *   floorY?: number,
 * }} [opts]
 */
export function updateBackroomsPlayerPhysics(state, dt, opts) {
  var gravity = opts && opts.gravity != null ? opts.gravity : DEFAULT_GRAVITY;
  var bodyHeight =
    opts && opts.bodyHeight != null ? opts.bodyHeight : DEFAULT_BODY_HEIGHT;
  var floorY = opts && opts.floorY != null ? opts.floorY : 0;
  var ceilingY = opts && opts.ceilingY != null ? opts.ceilingY : null;

  state.velY -= gravity * dt;
  state.feetY += state.velY * dt;
  if (state.feetY <= floorY) {
    state.feetY = floorY;
    state.velY = 0;
    state.grounded = true;
  } else {
    state.grounded = false;
  }
  if (ceilingY != null && state.feetY + bodyHeight > ceilingY) {
    state.feetY = ceilingY - bodyHeight;
    if (state.velY > 0) state.velY = 0;
  }
}

/**
 * @param {ReturnType<createBackroomsFpsState>} state
 * @param {number} [jumpSpeed]
 */
export function tryBackroomsJump(state, jumpSpeed) {
  if (!state.grounded) return false;
  state.velY = jumpSpeed != null ? jumpSpeed : DEFAULT_JUMP_SPEED;
  state.grounded = false;
  return true;
}

/** @param {ReturnType<createBackroomsFpsState>} state */
export function isBackroomsPlayerMoving(state) {
  return (
    state.move.forward ||
    state.move.back ||
    state.move.left ||
    state.move.right
  );
}

/** @param {ReturnType<createBackroomsFpsState>} state */
export function isBackroomsSprintHeld(state) {
  return !!(state.keys.ShiftLeft || state.keys.ShiftRight);
}

/**
 * @param {number} nextX
 * @param {number} nextZ
 * @param {number} radius
 * @param {object[]} colliders
 * @param {number} [nearPad]
 */
export function resolveBackroomsMoveCollisions(nextX, nextZ, radius, colliders, nearPad) {
  return resolveCircleAgainstColliders(
    nextX,
    nextZ,
    radius,
    colliders,
    nearPad != null ? nearPad : 8
  );
}

/**
 * @param {string} text
 * @param {{ host?: HTMLElement, durationMs?: number }} [opts]
 */
export function showBackroomsLootToast(text, opts) {
  var el = document.getElementById("backroomsLootToast");
  if (!el) {
    el = document.createElement("p");
    el.id = "backroomsLootToast";
    el.className = "backrooms-hud__loot";
    el.hidden = true;
    el.setAttribute("role", "status");
    var host =
      (opts && opts.host) ||
      document.querySelector(".backrooms-hud") ||
      document.body;
    host.appendChild(el);
  }
  el.textContent = text;
  el.hidden = false;
  if (el._lootTimer) clearTimeout(el._lootTimer);
  var dur = opts && opts.durationMs != null ? opts.durationMs : 2200;
  if (opts && opts.untilRef) {
    opts.untilRef.current = performance.now() + dur;
    return;
  }
  el._lootTimer = setTimeout(function () {
    el.hidden = true;
  }, dur);
}

/**
 * @param {THREE.WebGLRenderer | null} renderer
 * @param {THREE.PerspectiveCamera | null} camera
 * @param {(w: number, h: number) => void} [applySize]
 */
export function bindBackroomsWindowResize(renderer, camera, applySize) {
  function onResize() {
    if (!renderer || !camera) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (applySize) applySize(w, h);
    else {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  window.addEventListener("resize", onResize);
  return onResize;
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement | null,
 *   inputEl?: HTMLElement | null,
 *   state: ReturnType<createBackroomsFpsState>,
 *   lookSens?: number,
 *   mobileLookRef?: { current: ReturnType<attachMobileDragLook> | null },
 *   onKeyDown?: (e: KeyboardEvent) => boolean | void,
 *   onTapInteract?: () => void,
 *   onJump?: () => void,
 *   shouldBlockPointerLock?: () => boolean,
 *   shouldBlockLook?: () => boolean,
 *   onPointerLockChange?: (locked: boolean) => void,
 *   onResize?: () => void,
 * }} opts
 */
export function bindBackroomsFpsControls(opts) {
  var state = opts.state;
  var canvas = opts.canvas;
  var inputEl = opts.inputEl || null;
  var lookSens = opts.lookSens != null ? opts.lookSens : DEFAULT_LOOK_SENS;
  var cap = inputEl || canvas;
  var mobileLook = null;

  if (cap) {
    mobileLook = attachMobileDragLook({
      captureEl: cap,
      inputEl: inputEl,
      lookSens: lookSens,
      getPointerLocked: function () {
        return state.pointerLocked;
      },
      getYaw: function () {
        return state.yaw;
      },
      setYaw: function (v) {
        state.yaw = v;
      },
      getPitch: function () {
        return state.pitch;
      },
      setPitch: function (v) {
        state.pitch = v;
      },
      shouldBlockPointerLock: opts.shouldBlockPointerLock,
    });
    if (opts.mobileLookRef) opts.mobileLookRef.current = mobileLook;

    // 触屏没有 KeyQ：短按准星区域等同交互，拖动仍只负责转动视角。
    if (opts.onTapInteract) {
      var tapId = null;
      var tapX = 0;
      var tapY = 0;
      var tapMoved = false;
      cap.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        tapId = e.pointerId;
        tapX = e.clientX;
        tapY = e.clientY;
        tapMoved = false;
      });
      window.addEventListener("pointermove", function (e) {
        if (e.pointerId !== tapId) return;
        if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > 12) tapMoved = true;
      });
      window.addEventListener("pointerup", function (e) {
        if (e.pointerId !== tapId) return;
        var shouldInteract = !tapMoved;
        tapId = null;
        if (shouldInteract) opts.onTapInteract();
      });
      window.addEventListener("pointercancel", function (e) {
        if (e.pointerId === tapId) tapId = null;
      });
    }
  }

  function applyWASDKey(e, down) {
    state.keys[e.code] = down;
    if (e.code === "KeyW") state.move.forward = down;
    if (e.code === "KeyS") state.move.back = down;
    if (e.code === "KeyA") state.move.left = down;
    if (e.code === "KeyD") state.move.right = down;
  }

  window.addEventListener("keydown", function (e) {
    if (opts.onKeyDown && opts.onKeyDown(e)) return;

    applyWASDKey(e, true);
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault();
      if (opts.onJump) opts.onJump();
    }
  });

  window.addEventListener("keyup", function (e) {
    applyWASDKey(e, false);
  });

  document.addEventListener("mousemove", function (e) {
    if (!state.pointerLocked) return;
    if (opts.shouldBlockLook && opts.shouldBlockLook()) return;
    state.yaw -= e.movementX * lookSens;
    state.pitch -= e.movementY * lookSens;
    state.pitch = Math.max(
      DEFAULT_PITCH_MIN,
      Math.min(DEFAULT_PITCH_MAX, state.pitch)
    );
  });

  document.addEventListener("pointerlockchange", function () {
    state.pointerLocked =
      document.pointerLockElement === inputEl ||
      document.pointerLockElement === canvas;
    if (mobileLook) mobileLook.syncInputDragClass(state.pointerLocked);
    if (opts.onPointerLockChange) opts.onPointerLockChange(state.pointerLocked);
  });

  if (opts.onResize) {
    window.addEventListener("resize", opts.onResize);
  }

  return { mobileLook: mobileLook };
}

/** @param {ReturnType<createBackroomsFpsState>} state */
export function syncBackroomsPointerLockBodyClass(state) {
  document.body.classList.toggle("backrooms-pointer-locked", state.pointerLocked);
}

/**
 * @param {ReturnType<createBackroomsFpsState>} state
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} [eyeHeight]
 */
export function applyBackroomsCamera(state, camera, eyeHeight) {
  var eye = eyeHeight != null ? eyeHeight : DEFAULT_EYE_HEIGHT;
  camera.position.set(state.player.x, state.feetY + eye, state.player.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

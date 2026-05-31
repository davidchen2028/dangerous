/**
 * 行动场景 — 左下虚拟摇杆（移动）+ 体力条
 * 摇杆向上推过横线 = 疾跑；体力 10 格，疾跑每 2 秒耗 1 格（由 action-scene 驱动）。
 */
(function () {
  "use strict";

  /** 电脑端测试：true = 强制显示摇杆（正式环境保持 false，仅手机端显示） */
  var FORCE_VISIBLE = false;

  var DEADZONE = 0.12;
  /** 归一化向前分量超过此值视为推过疾跑线 */
  var SPRINT_THRESHOLD = 0.55;
  var STAMINA_MAX = 10;

  var wrapEl = null;
  var jumpWrapEl = null;
  var jumpBtnEl = null;
  var bagWrapEl = null;
  var bagBtnEl = null;
  var staminaWrapEl = null;
  var root = null;
  var baseEl = null;
  var stickEl = null;
  var staminaTrackEl = null;
  var mounted = false;
  var sceneActive = false;
  var joystickVisible = false;
  var blocked = false;
  var dragging = false;
  var pointerId = null;
  var radius = 48;
  var vector = { x: 0, y: 0 };
  var staminaSegments = STAMINA_MAX;

  function isTouchDevice() {
    if (window.LobbyNet && window.LobbyNet.isMobileDevice) {
      return window.LobbyNet.isMobileDevice();
    }
    var ua = navigator.userAgent || "";
    if (
      /iPad/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return true;
    }
    if (/iPhone|iPod|Android|HarmonyOS|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return true;
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    ) {
      return true;
    }
    return (
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
      "ontouchstart" in window
    );
  }

  function shouldShowJoystick() {
    return FORCE_VISIBLE || isTouchDevice();
  }

  function syncBagVisibility() {
    var show = sceneActive && shouldShowJoystick();
    if (bagWrapEl) bagWrapEl.hidden = !show;
    if (wrapEl) {
      wrapEl.classList.toggle("action-joystick-wrap--with-bag", show);
    }
    if (window.ActionHealth && window.ActionHealth.isActive && window.ActionHealth.isActive()) {
      var statsEl = document.getElementById("actionLeftStats");
      if (statsEl) {
        statsEl.classList.toggle("action-left-stats--with-bag", show);
      }
    }
  }

  function onBagPointerDown(e) {
    if (!sceneActive) return;
    var invOpen =
      window.ActionInventory &&
      window.ActionInventory.isOpen &&
      window.ActionInventory.isOpen();
    if (blocked && !invOpen) return;
    e.preventDefault();
    e.stopPropagation();
    if (window.ActionScene && window.ActionScene.toggleInventory) {
      window.ActionScene.toggleInventory();
      return;
    }
    if (window.ActionInventory && window.ActionInventory.toggle) {
      window.ActionInventory.toggle();
    }
  }

  function mountBagButton() {
    if (bagWrapEl) return;
    var host = document.getElementById("actionScene");
    if (!host) return;

    bagWrapEl = document.createElement("div");
    bagWrapEl.className = "action-bag-wrap";
    bagWrapEl.id = "actionBagWrap";
    bagWrapEl.hidden = true;
    bagWrapEl.innerHTML =
      '<button type="button" class="action-bag-btn" id="actionBagBtn" aria-label="打开背包">包</button>';
    host.appendChild(bagWrapEl);
    bagBtnEl = bagWrapEl.querySelector(".action-bag-btn");
    if (bagBtnEl) {
      bagBtnEl.addEventListener("pointerdown", onBagPointerDown);
    }
  }

  function syncJumpVisibility() {
    var show = sceneActive && shouldShowJoystick();
    if (jumpWrapEl) jumpWrapEl.hidden = !show;
  }

  function onJumpPointerDown(e) {
    if (blocked || !sceneActive) return;
    e.preventDefault();
    e.stopPropagation();
    if (window.ActionScene && window.ActionScene.tryJump) {
      window.ActionScene.tryJump();
    }
  }

  function mountJumpButton() {
    if (jumpWrapEl) return;
    var host = document.getElementById("actionScene");
    if (!host) return;

    jumpWrapEl = document.createElement("div");
    jumpWrapEl.className = "action-jump-wrap";
    jumpWrapEl.id = "actionJumpWrap";
    jumpWrapEl.hidden = true;
    jumpWrapEl.innerHTML =
      '<button type="button" class="action-jump-btn" id="actionJumpBtn" aria-label="跳跃">跳</button>';
    host.appendChild(jumpWrapEl);
    jumpBtnEl = jumpWrapEl.querySelector(".action-jump-btn");
    if (jumpBtnEl) {
      jumpBtnEl.addEventListener("pointerdown", onJumpPointerDown);
    }
  }

  function syncJoystickVisibility() {
    joystickVisible = sceneActive && shouldShowJoystick();
    if (wrapEl) {
      wrapEl.classList.toggle(
        "action-joystick-wrap--no-stick",
        sceneActive && !shouldShowJoystick()
      );
    }
    if (root) {
      root.hidden = !joystickVisible;
      root.setAttribute("aria-hidden", joystickVisible ? "false" : "true");
    }
    syncJumpVisibility();
    syncBagVisibility();
  }

  function buildStaminaSegments() {
    var html = "";
    var i;
    for (i = 0; i < STAMINA_MAX; i++) {
      html += '<span class="action-stamina__seg"></span>';
    }
    return html;
  }

  function mountStaminaBar() {
    if (staminaTrackEl) return;
    var host = document.getElementById("actionScene");
    if (!host) return;

    staminaWrapEl = document.createElement("div");
    staminaWrapEl.className = "action-stamina-hud";
    staminaWrapEl.id = "actionStaminaHud";
    staminaWrapEl.hidden = true;
    staminaWrapEl.innerHTML =
      '<div class="action-stamina" id="actionStamina" aria-label="体力">' +
      '<div class="action-stamina__track">' +
      buildStaminaSegments() +
      "</div></div>";
    host.appendChild(staminaWrapEl);
    staminaTrackEl = staminaWrapEl.querySelector(".action-stamina__track");
    renderStamina();
  }

  function mount() {
    if (mounted) return;
    var host = document.getElementById("actionScene");
    if (!host) return;

    mountStaminaBar();

    wrapEl = document.createElement("div");
    wrapEl.className = "action-joystick-wrap";
    wrapEl.id = "actionJoystickWrap";
    wrapEl.hidden = true;
    wrapEl.innerHTML =
      '<div class="action-joystick" id="actionJoystick">' +
      '<div class="action-joystick__base">' +
      '<div class="action-joystick__sprint-line" aria-hidden="true"></div>' +
      '<div class="action-joystick__stick"></div>' +
      "</div></div>";

    host.appendChild(wrapEl);
    mountJumpButton();
    mountBagButton();
    root = wrapEl.querySelector(".action-joystick");
    baseEl = wrapEl.querySelector(".action-joystick__base");
    stickEl = wrapEl.querySelector(".action-joystick__stick");

    baseEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", measureRadius);

    mounted = true;
  }

  function measureRadius() {
    if (!baseEl) return;
    radius = Math.max(28, baseEl.clientWidth * 0.36);
  }

  function updateStickVisual(dx, dy) {
    if (!stickEl) return;
    stickEl.style.transform = "translate(" + dx + "px, " + dy + "px)";
    updateSprintVisual();
  }

  function updateSprintVisual() {
    if (!root) return;
    root.classList.toggle(
      "action-joystick--sprinting",
      isSprintRequested()
    );
  }

  function setVector(nx, ny, visualDx, visualDy) {
    vector.x = nx;
    vector.y = ny;
    updateStickVisual(visualDx, visualDy);
  }

  function clear() {
    dragging = false;
    pointerId = null;
    setVector(0, 0, 0, 0);
    if (root) root.classList.remove("action-joystick--sprinting");
  }

  function applyPointer(clientX, clientY) {
    if (!baseEl) return;
    var rect = baseEl.getBoundingClientRect();
    var cx = rect.left + rect.width * 0.5;
    var cy = rect.top + rect.height * 0.5;
    var dx = clientX - cx;
    var dy = clientY - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var clamped = dist > radius ? radius / dist : 1;
    var cdx = dx * clamped;
    var cdy = dy * clamped;
    var nx = cdx / radius;
    var ny = -cdy / radius;
    var len = Math.sqrt(nx * nx + ny * ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    setVector(nx, ny, cdx, cdy);
  }

  function onPointerDown(e) {
    if (!joystickVisible || blocked || !baseEl) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    pointerId = e.pointerId;
    if (baseEl.setPointerCapture) {
      baseEl.setPointerCapture(e.pointerId);
    }
    measureRadius();
    applyPointer(e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    applyPointer(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    if (baseEl && baseEl.releasePointerCapture) {
      try {
        baseEl.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
    }
    clear();
  }

  function renderStamina() {
    if (!staminaTrackEl) return;
    var segs = staminaTrackEl.querySelectorAll(".action-stamina__seg");
    var i;
    for (i = 0; i < segs.length; i++) {
      segs[i].classList.toggle("action-stamina__seg--on", i < staminaSegments);
    }
    if (staminaWrapEl) {
      staminaWrapEl.classList.toggle(
        "action-stamina-hud--empty",
        staminaSegments <= 0
      );
    }
  }

  function show() {
    mount();
    mountStaminaBar();
    if (!wrapEl) return;
    measureRadius();
    sceneActive = true;
    wrapEl.hidden = false;
    if (staminaWrapEl) staminaWrapEl.hidden = false;
    syncJoystickVisibility();
    renderStamina();
  }

  function hide() {
    if (!wrapEl) return;
    wrapEl.hidden = true;
    if (staminaWrapEl) staminaWrapEl.hidden = true;
    sceneActive = false;
    joystickVisible = false;
    blocked = false;
    clear();
    syncJumpVisibility();
    syncBagVisibility();
  }

  function setBlocked(next) {
    blocked = !!next;
    if (root) {
      root.classList.toggle("action-joystick--blocked", blocked);
    }
    if (jumpBtnEl) {
      jumpBtnEl.classList.toggle("action-jump-btn--blocked", blocked);
    }
    if (bagBtnEl) {
      var invOpen =
        window.ActionInventory &&
        window.ActionInventory.isOpen &&
        window.ActionInventory.isOpen();
      bagBtnEl.classList.toggle("action-bag-btn--blocked", blocked && !invOpen);
    }
    if (blocked) clear();
  }

  function getVector() {
    if (!joystickVisible || blocked) return { x: 0, y: 0 };
    if (
      Math.abs(vector.x) < DEADZONE &&
      Math.abs(vector.y) < DEADZONE
    ) {
      return { x: 0, y: 0 };
    }
    return { x: vector.x, y: vector.y };
  }

  function isActive() {
    var v = getVector();
    return !!(v.x || v.y);
  }

  function isSprintRequested() {
    if (!joystickVisible || blocked) return false;
    var v = getVector();
    if (!v.y) return false;
    return v.y >= SPRINT_THRESHOLD;
  }

  function getStamina() {
    return staminaSegments;
  }

  function setStamina(n) {
    staminaSegments = Math.max(0, Math.min(STAMINA_MAX, Math.floor(n)));
    renderStamina();
  }

  function resetStamina() {
    staminaSegments = STAMINA_MAX;
    renderStamina();
  }

  window.ActionJoystick = {
    show: show,
    hide: hide,
    clear: clear,
    setBlocked: setBlocked,
    getVector: getVector,
    isActive: isActive,
    isSprintRequested: isSprintRequested,
    getStamina: getStamina,
    setStamina: setStamina,
    resetStamina: resetStamina,
    STAMINA_MAX: STAMINA_MAX,
    SPRINT_THRESHOLD: SPRINT_THRESHOLD,
    isForceVisible: function () {
      return FORCE_VISIBLE;
    },
    isJoystickVisible: function () {
      return joystickVisible;
    },
    shouldShowJoystick: shouldShowJoystick,
    setForceVisible: function (on) {
      FORCE_VISIBLE = !!on;
    },
  };
})();

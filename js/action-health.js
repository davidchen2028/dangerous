/**
 * 行动场景 — 血量条（100 点，每 1 点 = 1% 条宽）
 */
(function () {
  "use strict";

  var MAX_HEALTH = 100;
  var currentHealth = MAX_HEALTH;
  var wrapEl = null;
  var fillEl = null;
  var labelEl = null;
  var sceneActive = false;
  var mounted = false;

  function mount() {
    if (mounted) return;
    var host = document.getElementById("actionScene");
    if (!host) return;

    wrapEl = document.createElement("div");
    wrapEl.className = "action-left-stats";
    wrapEl.id = "actionLeftStats";
    wrapEl.hidden = true;
    wrapEl.innerHTML =
      '<div class="action-health" id="actionHealth" aria-label="血量">' +
      '<div class="action-health__track">' +
      '<div class="action-health__fill" id="actionHealthFill"></div>' +
      "</div>" +
      '<p class="action-health__label" id="actionHealthLabel">100/100</p>' +
      "</div>";

    host.appendChild(wrapEl);
    fillEl = document.getElementById("actionHealthFill");
    labelEl = document.getElementById("actionHealthLabel");
    mounted = true;
    render();
  }

  function render() {
    if (!fillEl || !labelEl) return;
    var n = Math.max(0, Math.min(MAX_HEALTH, Math.floor(currentHealth)));
    fillEl.style.width = n + "%";
    labelEl.textContent = n + "/100";
  }

  function show() {
    mount();
    if (!wrapEl) return;
    sceneActive = true;
    wrapEl.hidden = false;
    render();
  }

  function hide() {
    if (!wrapEl) return;
    sceneActive = false;
    wrapEl.hidden = true;
  }

  function reset() {
    currentHealth = MAX_HEALTH;
    render();
  }

  function getHealth() {
    return currentHealth;
  }

  function setHealth(n) {
    currentHealth = Math.max(0, Math.min(MAX_HEALTH, Math.floor(n)));
    render();
  }

  function damage(amount) {
    if (!amount) return currentHealth;
    setHealth(currentHealth - amount);
    return currentHealth;
  }

  function isActive() {
    return sceneActive;
  }

  window.ActionHealth = {
    show: show,
    hide: hide,
    reset: reset,
    getHealth: getHealth,
    setHealth: setHealth,
    damage: damage,
    isActive: isActive,
    MAX_HEALTH: MAX_HEALTH,
  };
})();

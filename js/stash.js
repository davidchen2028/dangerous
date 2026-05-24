/**
 * 仓库面板 — 6 列 × 10 行（60 格）+ 左侧装备栏
 */
(function () {
  const COLS = 6;
  const ROWS = 10;
  const TOTAL = COLS * ROWS;

  const STASH_ITEMS = {
    med: { label: "♥", title: "急救包", equip: false },
    ammo: { label: "▣", title: "弹药", equip: false },
    gun: { label: "🔫", title: "武器", equip: false },
    chip: { label: "◈", title: "情报", equip: false },
    circuit: { label: "板", title: "废弃的军用电路板", equip: false },
    keycard: { label: "卡", title: "侧门仓库", equip: true },
    helm1: { label: "盔", title: "战术头盔", equip: true },
    armr1: { label: "甲", title: "轻型护甲", equip: true },
    riglt: { label: "挂", title: "轻型弹挂", equip: true },
    bpspt: { label: "包", title: "运动背包", equip: true },
    bplgt: { label: "包", title: "轻型背包", equip: true },
  };

  const DEMO_ITEMS = [
    { id: "med", label: "♥", title: "急救包" },
    { id: "ammo", label: "▣", title: "弹药" },
    { id: "gun", label: "🔫", title: "武器" },
    { id: "chip", label: "◈", title: "情报" },
  ];

  const stashHint = document.getElementById("stashHint");
  const grid = document.getElementById("stashGrid");
  const cells = [];
  var localStash = [];

  function itemDef(itemId) {
    if (!itemId) return null;
    return STASH_ITEMS[itemId] || { label: "?", title: itemId };
  }

  function renderCell(cell, itemId) {
    if (!itemId) {
      cell.textContent = "";
      cell.classList.remove("stash-cell--filled");
      cell.dataset.item = "";
      cell.setAttribute("aria-label", "空");
      return;
    }
    const def = itemDef(itemId);
    cell.textContent = def.label;
    cell.classList.add("stash-cell--filled");
    cell.dataset.item = itemId;
    cell.setAttribute("aria-label", def.title);
  }

  function cycleItem(current) {
    if (!current) return DEMO_ITEMS[0].id;
    const idx = DEMO_ITEMS.findIndex(function (d) {
      return d.id === current;
    });
    if (idx < 0 || idx >= DEMO_ITEMS.length - 1) return null;
    return DEMO_ITEMS[idx + 1].id;
  }

  function setCell(index, itemId, syncRemote) {
    if (index < 0 || index >= TOTAL) return;
    localStash[index] = itemId || null;
    const cell = cells[index];
    renderCell(cell, itemId);
    if (syncRemote !== false && window.LobbyNet && window.LobbyNet.isReady()) {
      window.LobbyNet.sendStashUpdate(index, itemId);
    }
  }

  function applyFullStash(arr) {
    localStash = [];
    for (let i = 0; i < TOTAL; i++) {
      const id = arr && arr[i] ? arr[i] : null;
      localStash[i] = id;
      renderCell(cells[i], id);
    }
  }

  function findFirstEmptyIndex() {
    let i;
    for (i = 0; i < TOTAL; i++) {
      if (!localStash[i]) return i;
    }
    return -1;
  }

  function tryAddMarketItem(stashId) {
    if (!stashId || !STASH_ITEMS[stashId]) return false;
    const idx = findFirstEmptyIndex();
    if (idx < 0) return false;
    setCell(idx, stashId, true);
    return true;
  }

  function updateStashHint() {
    const online = window.LobbyNet && window.LobbyNet.isReady();
    stashHint.classList.toggle("ui-hidden", !!online);
    grid.style.pointerEvents = online ? "" : "none";
    grid.style.opacity = online ? "1" : "0.45";
  }

  for (let i = 0; i < TOTAL; i++) {
    localStash[i] = null;
    const cell = document.createElement("div");
    cell.className = "stash-cell";
    cell.dataset.index = String(i);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", "空");
    cell.addEventListener("click", function () {
      if (!window.LobbyNet || !window.LobbyNet.isReady()) return;
      const next = cycleItem(cell.dataset.item || null);
      setCell(i, next, true);
    });
    cell.addEventListener("dblclick", function () {
      const stashId = cell.dataset.item;
      if (!stashId) return;
      const def = STASH_ITEMS[stashId];
      if (!def || !def.equip) return;
      if (
        window.PlayerLoadout &&
        window.PlayerLoadout.equipFromStashId(stashId)
      ) {
        setCell(i, null, true);
        window.PlayerLoadout.renderLobby();
        alert("已装备「" + def.title + "」到左侧栏位。");
      }
    });
    grid.appendChild(cell);
    cells.push(cell);
  }

  window.LobbyStash = {
    applyFullStash: applyFullStash,
    setCell: function (index, itemId) {
      setCell(index, itemId, false);
    },
    tryAddMarketItem: tryAddMarketItem,
    onPanelOpen: function () {
      updateStashHint();
      if (window.PlayerLoadout) window.PlayerLoadout.renderLobby();
    },
    close: function () {
      /* 由 LobbyUI 统一管理面板 */
    },
  };

  updateStashHint();
})();

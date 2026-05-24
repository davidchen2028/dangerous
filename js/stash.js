/**
 * 仓库面板 — 6 列 × 10 行（60 格）
 */
(function () {
  const COLS = 6;
  const ROWS = 10;
  const TOTAL = COLS * ROWS;

  const DEMO_ITEMS = [
    { id: "med", label: "♥", title: "急救包" },
    { id: "ammo", label: "▣", title: "弹药" },
    { id: "gun", label: "🔫", title: "武器" },
    { id: "chip", label: "◈", title: "情报" },
  ];

  const stashHint = document.getElementById("stashHint");
  const grid = document.getElementById("stashGrid");
  const cells = [];

  function renderCell(cell, itemId) {
    if (!itemId) {
      cell.textContent = "";
      cell.classList.remove("stash-cell--filled");
      cell.dataset.item = "";
      cell.setAttribute("aria-label", "空");
      return;
    }
    const demo = DEMO_ITEMS.find(function (d) { return d.id === itemId; });
    cell.textContent = demo ? demo.label : "?";
    cell.classList.add("stash-cell--filled");
    cell.dataset.item = itemId;
    cell.setAttribute("aria-label", demo ? demo.title : itemId);
  }

  function cycleItem(current) {
    if (!current) return DEMO_ITEMS[0].id;
    const idx = DEMO_ITEMS.findIndex(function (d) { return d.id === current; });
    if (idx < 0 || idx >= DEMO_ITEMS.length - 1) return null;
    return DEMO_ITEMS[idx + 1].id;
  }

  function setCell(index, itemId, syncRemote) {
    if (index < 0 || index >= TOTAL) return;
    const cell = cells[index];
    renderCell(cell, itemId);
    if (syncRemote !== false && window.LobbyNet && window.LobbyNet.isReady()) {
      window.LobbyNet.sendStashUpdate(index, itemId);
    }
  }

  function applyFullStash(arr) {
    for (let i = 0; i < TOTAL; i++) {
      renderCell(cells[i], arr && arr[i] ? arr[i] : null);
    }
  }

  function updateStashHint() {
    const online = window.LobbyNet && window.LobbyNet.isReady();
    stashHint.classList.toggle("ui-hidden", !!online);
    grid.style.pointerEvents = online ? "" : "none";
    grid.style.opacity = online ? "1" : "0.45";
  }

  for (let i = 0; i < TOTAL; i++) {
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
    grid.appendChild(cell);
    cells.push(cell);
  }

  window.LobbyStash = {
    applyFullStash: applyFullStash,
    setCell: function (index, itemId) {
      setCell(index, itemId, false);
    },
    onPanelOpen: updateStashHint,
    close: function () {
      /* 由 LobbyUI 统一管理面板 */
    },
  };

  updateStashHint();
})();

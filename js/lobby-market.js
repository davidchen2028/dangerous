/**
 * 黑市交易所 — 全屏独立页（分类栏 + 商品图）
 */
(function () {
  "use strict";

  var catsEl = document.getElementById("marketCats");
  var subcatsEl = document.getElementById("marketSubcats");
  var listEl = document.getElementById("hubMarketList");
  var creditsEl = document.getElementById("hubMarketCredits");
  var breadcrumbEl = document.getElementById("marketBreadcrumb");

  var perilCredits = 50000;

  var activeCat = "rig";
  var activeSub = "electronic";

  var CATEGORIES = [
    { id: "weapon", label: "武器", empty: true },
    { id: "attachment", label: "配件", empty: true },
    { id: "helmet", label: "头盔", empty: true },
    { id: "armor", label: "护甲", empty: true },
    { id: "rig", label: "胸挂", empty: false },
    { id: "backpack", label: "背包", empty: false },
    { id: "ammo", label: "子弹", empty: true },
    {
      id: "collectible",
      label: "收集品",
      subcats: [
        { id: "electronic", label: "电子物品", empty: false },
        { id: "intel", label: "军用情报", empty: true },
        { id: "industrial", label: "工业与医疗物资", empty: true },
      ],
    },
    { id: "medical", label: "医疗消耗品", empty: true },
    { id: "keycard", label: "钥匙卡", empty: false },
  ];

  var PRODUCTS = [
    {
      id: "rig_light",
      stashId: "riglt",
      cat: "rig",
      name: "轻型弹挂",
      desc: "1×1 · 共 6 格快取",
      rigSlots: 6,
      price: 600,
      image: "img/market/rig-light.svg",
    },
    {
      id: "bp_sport",
      stashId: "bpspt",
      cat: "backpack",
      name: "运动背包",
      desc: "储物 2×4",
      cols: 2,
      rows: 4,
      price: 500,
      image: "img/market/backpack-sport.svg",
    },
    {
      id: "bp_light",
      stashId: "bplgt",
      cat: "backpack",
      name: "轻型背包",
      desc: "储物 3×4",
      cols: 3,
      rows: 4,
      price: 1000,
      image: "img/market/backpack-light.svg",
    },
    {
      id: "circuit_scrap",
      stashId: "circuit",
      cat: "collectible",
      sub: "electronic",
      name: "废弃的军用电路板",
      desc: "电子物品 · 可拆解回收",
      w: 1,
      h: 1,
      price: 1000,
      image: "img/market/circuit-board.svg",
    },
    {
      id: "keycard_side_door",
      stashId: "keycard",
      cat: "keycard",
      name: "侧门仓库",
      desc: "一张卡，银色的",
      w: 1,
      h: 1,
      price: 50000,
      image: "img/market/keycard-silver.svg",
    },
  ];

  function findCategory(id) {
    var i;
    for (i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  function productMeta(product) {
    if (product.rigSlots) return product.rigSlots + " 格 · 1×1";
    if (product.cols && product.rows) {
      return product.cols + "×" + product.rows + " 储物格";
    }
    if (product.w && product.h) return product.w + "×" + product.h;
    return "";
  }

  function updateCreditsDisplay() {
    if (creditsEl) {
      creditsEl.textContent = "极危币：" + perilCredits.toLocaleString();
    }
  }

  function getVisibleProducts() {
    var cat = findCategory(activeCat);
    if (!cat) return [];
    if (cat.subcats) {
      return PRODUCTS.filter(function (p) {
        return p.cat === activeCat && p.sub === activeSub;
      });
    }
    return PRODUCTS.filter(function (p) {
      return p.cat === activeCat;
    });
  }

  function setBreadcrumb() {
    if (!breadcrumbEl) return;
    var cat = findCategory(activeCat);
    if (!cat) {
      breadcrumbEl.textContent = "选择左侧分类浏览商品";
      return;
    }
    if (cat.subcats) {
      var sub = null;
      var i;
      for (i = 0; i < cat.subcats.length; i++) {
        if (cat.subcats[i].id === activeSub) {
          sub = cat.subcats[i];
          break;
        }
      }
      breadcrumbEl.textContent =
        cat.label + " › " + (sub ? sub.label : "") + " · 官方现货";
      return;
    }
    breadcrumbEl.textContent = cat.label + " · 官方现货";
  }

  function renderProducts() {
    if (!listEl) return;
    listEl.innerHTML = "";
    updateCreditsDisplay();
    setBreadcrumb();

    var items = getVisibleProducts();
    var cat = findCategory(activeCat);

    if (items.length === 0) {
      var label = cat ? cat.label : "该分类";
      if (cat && cat.subcats) {
        var j;
        for (j = 0; j < cat.subcats.length; j++) {
          if (cat.subcats[j].id === activeSub) label = cat.subcats[j].label;
        }
      }
      listEl.innerHTML =
        '<p class="market-main__empty">「' + label + "」暂无商品</p>";
      return;
    }

    items.forEach(function (product) {
      var meta = productMeta(product);
      var card = document.createElement("article");
      card.className = "market-card";
      card.innerHTML =
        '<div class="market-card__visual">' +
        '<img src="' +
        product.image +
        '" alt="" width="128" height="128" loading="lazy">' +
        "</div>" +
        '<div class="market-card__body">' +
        '<h3 class="market-card__name">' +
        product.name +
        "</h3>" +
        (product.desc
          ? '<p class="market-card__desc">' + product.desc + "</p>"
          : "") +
        (meta ? '<span class="market-card__meta">' + meta + "</span>" : "") +
        '<div class="market-card__foot">' +
        '<span class="market-card__price">' +
        product.price.toLocaleString() +
        " ₱</span>" +
        '<button type="button" class="market-card__buy">购买</button>' +
        "</div></div>";

      card.querySelector(".market-card__buy").addEventListener("click", function () {
        buyProduct(product);
      });
      listEl.appendChild(card);
    });
  }

  function renderSubcats() {
    if (!subcatsEl) return;
    var cat = findCategory(activeCat);
    if (!cat || !cat.subcats) {
      subcatsEl.hidden = true;
      subcatsEl.innerHTML = "";
      return;
    }

    subcatsEl.hidden = false;
    subcatsEl.innerHTML = "";

    cat.subcats.forEach(function (sub) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "market-subcats__btn";
      if (sub.id === activeSub) btn.className += " market-subcats__btn--active";
      if (sub.empty) btn.className += " market-subcats__btn--empty";
      btn.textContent = sub.label;
      btn.addEventListener("click", function () {
        activeSub = sub.id;
        renderSubcats();
        renderProducts();
      });
      subcatsEl.appendChild(btn);
    });
  }

  function renderCategories() {
    if (!catsEl) return;
    catsEl.innerHTML = "";

    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "market-cats__btn";
      if (cat.id === activeCat) btn.className += " market-cats__btn--active";
      var hasProducts = PRODUCTS.some(function (p) {
        return p.cat === cat.id;
      });
      if (cat.empty && !cat.subcats && !hasProducts) {
        btn.className += " market-cats__btn--empty";
      }
      btn.textContent = cat.label;
      btn.addEventListener("click", function () {
        activeCat = cat.id;
        if (cat.subcats && cat.subcats.length) {
          var hasActive = false;
          var i;
          for (i = 0; i < cat.subcats.length; i++) {
            if (cat.subcats[i].id === activeSub) {
              hasActive = true;
              break;
            }
          }
          if (!hasActive) activeSub = cat.subcats[0].id;
        }
        renderCategories();
        renderSubcats();
        renderProducts();
      });
      catsEl.appendChild(btn);
    });
  }

  function deliverToStash(stashId) {
    if (!window.LobbyStash || !window.LobbyStash.tryAddMarketItem) {
      return false;
    }
    return window.LobbyStash.tryAddMarketItem(stashId);
  }

  function buyProduct(product) {
    if (perilCredits < product.price) {
      alert("极危币不足，需要 " + product.price.toLocaleString() + " ₱");
      return;
    }

    var stashId = product.stashId || product.id;
    if (!deliverToStash(stashId)) {
      alert("仓库已满，请先整理左下角「仓库」再购买。");
      return;
    }

    perilCredits -= product.price;
    updateCreditsDisplay();
    alert("已购买「" + product.name + "」，已放入仓库。");
  }

  function onPanelOpen() {
    renderCategories();
    renderSubcats();
    renderProducts();
  }

  window.LobbyMarket = {
    onPanelOpen: onPanelOpen,
    getCredits: function () {
      return perilCredits;
    },
  };
})();

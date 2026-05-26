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
    { id: "weapon", label: "武器", empty: false },
    { id: "attachment", label: "配件", empty: true },
    { id: "helmet", label: "头盔", empty: true },
    { id: "armor", label: "护甲", empty: true },
    { id: "rig", label: "胸挂", empty: false },
    { id: "backpack", label: "背包", empty: false },
    { id: "ammo", label: "子弹", empty: false },
    {
      id: "collectible",
      label: "收集品",
      subcats: [
        { id: "electronic", label: "电子物品", empty: false },
        { id: "intel", label: "军用情报", empty: true },
        { id: "industrial", label: "工业与医疗物资", empty: false },
      ],
    },
    { id: "medical", label: "医疗消耗品", empty: true },
    { id: "keycard", label: "钥匙卡", empty: true },
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
      id: "sealed_motor_oil",
      stashId: "spoil",
      cat: "collectible",
      sub: "industrial",
      name: "密封的特种机油",
      desc: "工业与医疗物资 · 重型工业垃圾",
      w: 1,
      h: 2,
      rarity: "common",
      rarityLabel: "普通",
      rarityIcon: "🟢",
      reclaimMin: 1200,
      minMarketPrice: 1000,
      maxMarketPrice: 3200,
      price: 2100,
      image: "img/market/sealed-motor-oil.png",
    },
    {
      id: "heavy_industrial_drill",
      stashId: "hidrl",
      cat: "collectible",
      sub: "industrial",
      name: "重型工业钻头",
      desc: "工业与医疗物资 · 高价值但占满 6 格",
      w: 3,
      h: 2,
      rarity: "epic",
      rarityLabel: "史诗",
      rarityIcon: "🟣",
      reclaimMin: 38000,
      minMarketPrice: 35000,
      maxMarketPrice: 80000,
      price: 57500,
      image: "img/market/heavy-industrial-drill.svg",
    },
    {
      id: "uzi_smg",
      stashId: "uzism",
      cat: "weapon",
      name: "UZI 冲锋枪",
      desc: "主武器 · 占 6 格（3×2）",
      w: 3,
      h: 2,
      rarity: "rare",
      rarityLabel: "稀有",
      rarityIcon: "🔵",
      reclaimMin: 2900,
      price: 5800,
      image: "img/market/uzi-smg.svg",
    },
    {
      id: "brass_bullet",
      stashId: "brslv",
      cat: "ammo",
      name: "黄铜子弹",
      desc: "60 发/组 · 1×1 · 黄铜制式",
      w: 1,
      h: 1,
      stackSize: 60,
      rarity: "common",
      rarityLabel: "普通",
      rarityIcon: "🟢",
      reclaimMin: 12000,
      price: 30000,
      image: "img/market/brass-bullet.svg",
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
    if (product.stackSize) {
      return product.stackSize + " 发/组 · " + (product.w || 1) + "×" + (product.h || 1);
    }
    if (product.w && product.h) {
      var cells = product.w * product.h;
      return product.w + "×" + product.h + (cells > 1 ? " · " + cells + " 格" : "");
    }
    return "";
  }

  function productEconomyLine(product) {
    var parts = [];
    if (product.rarityIcon && product.rarityLabel) {
      parts.push(product.rarityIcon + " " + product.rarityLabel);
    }
    if (product.reclaimMin != null) {
      parts.push("回收保底 " + product.reclaimMin.toLocaleString());
    }
    if (product.minMarketPrice != null && product.maxMarketPrice != null) {
      parts.push(
        "限价 " +
          product.minMarketPrice.toLocaleString() +
          "–" +
          product.maxMarketPrice.toLocaleString()
      );
    }
    return parts.join(" · ");
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
      var economy = productEconomyLine(product);
      var card = document.createElement("article");
      card.className = "market-card";
      if (product.rarity) {
        card.classList.add("market-card--" + product.rarity);
      }
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
        (economy
          ? '<span class="market-card__economy">' + economy + "</span>"
          : "") +
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

  /**
   * 按物品目录 id 查黑市定价；未上架则返回 null
   * @param {string} catalogItemId
   * @returns {number|null}
   */
  function findProductByCatalogId(catalogItemId) {
    if (!catalogItemId) return null;
    var i;
    for (i = 0; i < PRODUCTS.length; i++) {
      var p = PRODUCTS[i];
      if (p.id === catalogItemId) return p;
      if (p.stashId && window.ItemCatalog) {
        var mapped = window.ItemCatalog.fromStashId(p.stashId);
        if (mapped && mapped.id === catalogItemId) return p;
      }
    }
    return null;
  }

  function getPriceByCatalogId(catalogItemId) {
    var p = findProductByCatalogId(catalogItemId);
    return p ? p.price : null;
  }

  /**
   * 仓库单击物价：现货价 + 回收保底 + 限价区间
   * @param {string} catalogItemId
   * @returns {string|null}
   */
  function getPriceHintByCatalogId(catalogItemId) {
    var p = findProductByCatalogId(catalogItemId);
    if (!p) {
      if (!window.ItemCatalog) return null;
      var item = window.ItemCatalog.getItem(catalogItemId);
      if (!item || item.reclaimMin == null) return null;
      var line = item.name;
      if (item.rarityIcon && item.rarityLabel) {
        line += " · " + item.rarityIcon + " " + item.rarityLabel;
      }
      line +=
        " · 回收保底 " +
        item.reclaimMin.toLocaleString() +
        " · 限价 " +
        item.minMarketPrice.toLocaleString() +
        "–" +
        item.maxMarketPrice.toLocaleString();
      return line;
    }
    var hint = p.name;
    var economy = productEconomyLine(p);
    if (economy) hint += " · " + economy;
    hint += " · 现货 " + p.price.toLocaleString() + " 极危币";
    return hint;
  }

  function getReclaimPrice(catalogItemId) {
    if (!catalogItemId) return null;
    var p = findProductByCatalogId(catalogItemId);
    if (p && p.reclaimMin != null) return p.reclaimMin;
    if (window.ItemCatalog) {
      var item = window.ItemCatalog.getItem(catalogItemId);
      if (item && item.reclaimMin != null) return item.reclaimMin;
    }
    if (p && p.price != null) return Math.floor(p.price * 0.5);
    return null;
  }

  function sellCatalogItem(catalogItemId) {
    var price = getReclaimPrice(catalogItemId);
    if (price == null) return null;
    perilCredits += price;
    updateCreditsDisplay();
    return price;
  }

  window.LobbyMarket = {
    onPanelOpen: onPanelOpen,
    getCredits: function () {
      return perilCredits;
    },
    getPriceByCatalogId: getPriceByCatalogId,
    getPriceHintByCatalogId: getPriceHintByCatalogId,
    getReclaimPrice: getReclaimPrice,
    sellCatalogItem: sellCatalogItem,
  };
})();

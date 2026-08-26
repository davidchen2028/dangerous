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

  var perilCredits = 30000;

  var DEFAULT_STOCK = 5;
  var STOCK_KEY = "dangerous_market_stock_v1";
  var productStock = {};
  var marketPanelOpen = false;
  var stockSyncPending = false;

  function initDefaultStock() {
    PRODUCTS.forEach(function (p) {
      if (productStock[p.id] == null) {
        productStock[p.id] = DEFAULT_STOCK;
      }
    });
  }

  function loadLocalStock() {
    try {
      var raw = localStorage.getItem(STOCK_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          productStock = parsed;
        }
      }
    } catch (e) {
      /* ignore */
    }
    initDefaultStock();
  }

  function saveLocalStock() {
    try {
      localStorage.setItem(STOCK_KEY, JSON.stringify(productStock));
    } catch (e) {
      /* ignore */
    }
  }

  function getStock(productId) {
    var n = productStock[productId];
    if (typeof n !== "number" || !isFinite(n)) {
      return DEFAULT_STOCK;
    }
    return Math.max(0, Math.floor(n));
  }

  function applyStockMap(map) {
    if (!map || typeof map !== "object") return;
    productStock = map;
    initDefaultStock();
    saveLocalStock();
    if (marketPanelOpen) {
      renderProducts();
    }
  }

  function syncStockFromServer(done) {
    if (stockSyncPending) {
      if (done) done(null);
      return;
    }
    stockSyncPending = true;
    fetch("/api/market/stock")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.stock) {
          applyStockMap(data.stock);
        }
        if (done) done(data && data.stock ? data.stock : null);
      })
      .catch(function () {
        if (done) done(null);
      })
      .finally(function () {
        stockSyncPending = false;
      });
  }

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
        { id: "treasure", label: "藏品类", empty: false },
        { id: "electronic", label: "电子物品", empty: false },
        { id: "bio", label: "医疗实验", empty: false },
        { id: "intel", label: "军用情报", empty: false },
        { id: "industrial", label: "工业与医疗物资", empty: false },
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
      name: "蝰蛇轻型包",
      desc: "2×4 · 贴身入门 · 弹匣与止痛药首选",
      cols: 2,
      rows: 4,
      minMarketPrice: 4500,
      maxMarketPrice: 6000,
      price: 5250,
      image: "img/market/backpack-sport.svg",
    },
    {
      id: "bp_light",
      stashId: "bplgt",
      cat: "backpack",
      name: "铁骑巡逻包",
      desc: "3×4 · 军规面料 · 高价值武器与中型护甲",
      cols: 3,
      rows: 4,
      minMarketPrice: 18000,
      maxMarketPrice: 22000,
      price: 20000,
      image: "img/market/backpack-light.svg",
    },
    {
      id: "bp_small",
      stashId: "bpsm4",
      cat: "backpack",
      name: "克里姆林包",
      desc: "4×4 · 终极方格 · 整枪与六角密匣 · 禁快速撤离",
      cols: 4,
      rows: 4,
      minMarketPrice: 65000,
      maxMarketPrice: 78000,
      price: 71500,
      image: "img/market/backpack-light.svg",
    },
    {
      id: "bp_test",
      stashId: "bptst",
      cat: "backpack",
      name: "测试",
      desc: "8×8 · 调试专用",
      cols: 8,
      rows: 8,
      minMarketPrice: 0,
      maxMarketPrice: 0,
      price: 0,
      image: "img/market/backpack-light.svg",
    },
    {
      id: "collectible_3008",
      stashId: "c3008",
      cat: "collectible",
      sub: "treasure",
      name: "微缩新星",
      desc: "MINIATURE NOVA · 1×1 终极孤品 · 仅黑市 · 12000000",
      w: 1,
      h: 1,
      rarity: "ultimate",
      rarityLabel: "终极",
      rarityIcon: "⬛",
      reclaimMin: 11000000,
      minMarketPrice: 12000000,
      maxMarketPrice: 12000000,
      price: 12000000,
      image: "img/market/mini-nova-singularity-crystal.png?v=1",
    },
    {
      id: "collectible_3007",
      stashId: "c3007",
      cat: "collectible",
      sub: "treasure",
      name: "永夜星象仪",
      desc: "EVERNIGHT AURORA · 4×4 终极 · 占满宝箱 · 0.05% · 黑市 7000000",
      w: 4,
      h: 4,
      rarity: "ultimate",
      rarityLabel: "终极",
      rarityIcon: "⬛",
      reclaimMin: 6300000,
      minMarketPrice: 7000000,
      maxMarketPrice: 7000000,
      price: 7000000,
      image: "img/market/evernight-aurora-star-chart.png?v=1",
    },
    {
      id: "collectible_3006",
      stashId: "c3006",
      cat: "collectible",
      sub: "treasure",
      name: "红莲指挥仪",
      desc: "CRIMSON LOTUS · 3×3 神话 · 宝箱 0.5% · 黑市 1500000",
      w: 3,
      h: 3,
      rarity: "mythic",
      rarityLabel: "神话",
      rarityIcon: "🔴",
      reclaimMin: 1300000,
      minMarketPrice: 1500000,
      maxMarketPrice: 1500000,
      price: 1500000,
      image: "img/market/crimson-lotus-director.png?v=1",
    },
    {
      id: "pirate_1004",
      stashId: "p1004",
      cat: "collectible",
      sub: "treasure",
      name: "战术指挥鹰",
      desc: "AQUILA TACTICA · 2×2 传奇藏品 · 宝箱 2% · 黑市 500000",
      w: 2,
      h: 2,
      rarity: "legendary",
      rarityLabel: "传奇",
      rarityIcon: "🟡",
      reclaimMin: 300000,
      minMarketPrice: 500000,
      maxMarketPrice: 500000,
      price: 500000,
      image: "img/market/aquila-tactica-eagle.png?v=2",
    },
    {
      id: "collectible_3001",
      stashId: "c3001",
      cat: "collectible",
      sub: "treasure",
      name: "合金打火机",
      desc: "FRONT-LINE COMMANDER'S · 1×1 传奇 · 宝箱 3.5% · 黑市 350000",
      w: 1,
      h: 1,
      rarity: "legendary",
      rarityLabel: "传奇",
      rarityIcon: "🟡",
      reclaimMin: 210000,
      minMarketPrice: 350000,
      maxMarketPrice: 350000,
      price: 350000,
      image: "img/market/commander-alloy-lighter.png?v=2",
    },
    {
      id: "collectible_3002",
      stashId: "c3002",
      cat: "collectible",
      sub: "treasure",
      name: "废土八音盒",
      desc: "OLD WORLD MELODIES · 1×1 传奇 · 宝箱 4% · 黑市 260000",
      w: 1,
      h: 1,
      rarity: "legendary",
      rarityLabel: "传奇",
      rarityIcon: "🟡",
      reclaimMin: 160000,
      minMarketPrice: 260000,
      maxMarketPrice: 260000,
      price: 260000,
      image: "img/market/wasteland-music-box.png",
    },
    {
      id: "collectible_3003",
      stashId: "c3003",
      cat: "collectible",
      sub: "treasure",
      name: "全息推演沙盘",
      desc: "HOLOGRAPHIC TACTICAL SANDBOX · 2×2 史诗 · 黑市 95000",
      w: 2,
      h: 2,
      rarity: "epic",
      rarityLabel: "史诗",
      rarityIcon: "🟣",
      reclaimMin: 60000,
      minMarketPrice: 95000,
      maxMarketPrice: 95000,
      price: 95000,
      image: "img/market/holographic-sand-table.png?v=1",
    },
    {
      id: "collectible_3004",
      stashId: "c3004",
      cat: "collectible",
      sub: "treasure",
      name: "微光观测镜",
      desc: "MODEL-1 NIGHTSIGHT · 1×2 史诗 · 黑市 75000",
      w: 1,
      h: 2,
      rarity: "epic",
      rarityLabel: "史诗",
      rarityIcon: "🟣",
      reclaimMin: 48000,
      minMarketPrice: 75000,
      maxMarketPrice: 75000,
      price: 75000,
      image: "img/market/micro-light-scope.png?v=1",
    },
    {
      id: "collectible_3005",
      stashId: "c3005",
      cat: "collectible",
      sub: "treasure",
      name: "极危荣誉章",
      desc: "DANGEROUS · 1×1 稀有 · 黑市 38000",
      w: 1,
      h: 1,
      rarity: "rare",
      rarityLabel: "稀有",
      rarityIcon: "🔵",
      reclaimMin: 24000,
      minMarketPrice: 38000,
      maxMarketPrice: 38000,
      price: 38000,
      image: "img/market/honor-medal-gen1.png?v=1",
    },
    {
      id: "pirate_1005",
      stashId: "p1005",
      cat: "collectible",
      sub: "bio",
      name: "未知血清",
      desc: "医疗实验 · 高危样本（勿摔）",
      w: 1,
      h: 1,
      rarity: "legendary",
      rarityLabel: "传奇",
      rarityIcon: "🟡",
      reclaimMin: 250000,
      minMarketPrice: 450000,
      maxMarketPrice: 450000,
      price: 450000,
      image: "img/market/heavy-industrial-drill.svg",
    },
    {
      id: "pirate_1002",
      stashId: "p1002",
      cat: "collectible",
      sub: "electronic",
      name: "无人机镜头",
      desc: "电子物品 · 精密光学组件",
      w: 2,
      h: 2,
      rarity: "epic",
      rarityLabel: "史诗",
      rarityIcon: "🟣",
      reclaimMin: 60000,
      minMarketPrice: 100000,
      maxMarketPrice: 100000,
      price: 100000,
      image: "img/market/heavy-industrial-drill.svg",
    },
    {
      id: "pirate_1006",
      stashId: "p1006",
      cat: "collectible",
      sub: "electronic",
      name: "军用对讲机",
      desc: "通讯电子 · 野战加密链路",
      w: 1,
      h: 1,
      rarity: "rare",
      rarityLabel: "稀有",
      rarityIcon: "🔵",
      reclaimMin: 3000,
      minMarketPrice: 10000,
      maxMarketPrice: 10000,
      price: 10000,
      image: "img/market/uzi-smg.svg",
    },
    {
      id: "pirate_1001",
      stashId: "p1001",
      cat: "collectible",
      sub: "electronic",
      name: "军用电路板",
      desc: "电子垃圾 · 可拆解回收",
      w: 1,
      h: 1,
      rarity: "common",
      rarityLabel: "普通",
      rarityIcon: "🟢",
      reclaimMin: 500,
      minMarketPrice: 1000,
      maxMarketPrice: 1000,
      price: 1000,
      image: "img/market/brass-bullet.svg",
    },
    {
      id: "pirate_1003",
      stashId: "p1003",
      cat: "collectible",
      sub: "intel",
      name: "绝密航线硬盘",
      desc: "核心情报 · 高密级航线数据",
      w: 1,
      h: 2,
      rarity: "epic",
      rarityLabel: "史诗",
      rarityIcon: "🟣",
      reclaimMin: 34000,
      minMarketPrice: 87000,
      maxMarketPrice: 87000,
      price: 87000,
      image: "img/market/heavy-industrial-drill.svg",
    },
    {
      id: "sealed_motor_oil",
      stashId: "spoil",
      cat: "collectible",
      sub: "industrial",
      name: "特种机油",
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
      image: "img/market/sealed-motor-oil.png?v=3",
    },
    {
      id: "alloy_plate",
      stashId: "alplt",
      cat: "collectible",
      sub: "industrial",
      name: "空间站合金板",
      desc: "天顶站舱壁材料 · 轻质耐热合金",
      w: 2,
      h: 1,
      rarity: "rare",
      rarityLabel: "稀有",
      rarityIcon: "🔵",
      reclaimMin: 4200,
      minMarketPrice: 6500,
      maxMarketPrice: 12000,
      price: 8500,
      image: "img/market/heavy-industrial-drill.svg",
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
      name: "UZI冲锋枪",
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
    {
      id: "keycard_president_office",
      stashId: "kpoff",
      cat: "keycard",
      name: "总统办公室",
      desc: "总统主楼办公室门禁卡 · 1×1 · 黑市 4000000",
      w: 1,
      h: 1,
      maxDurability: 10,
      minMarketPrice: 4000000,
      maxMarketPrice: 4000000,
      reclaimMin: 3600000,
      price: 4000000,
      image: "img/market/keycard-side-entrance.png",
    },
    {
      id: "keycard_basement_storage",
      stashId: "kbstor",
      cat: "keycard",
      name: "地下储藏间",
      desc: "总统府地下储藏间门禁卡 · 1×1 · 黑市 3500000",
      w: 1,
      h: 1,
      maxDurability: 10,
      minMarketPrice: 3500000,
      maxMarketPrice: 3500000,
      reclaimMin: 3150000,
      price: 3500000,
      image: "img/market/keycard-side-entrance.png",
    },
  ];

  loadLocalStock();

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
      var stock = getStock(product.id);
      var soldOut = stock <= 0;
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
        "</div>" +
        '<div class="market-card__foot">' +
        '<div class="market-card__foot-left">' +
        '<span class="market-card__price">' +
        product.price.toLocaleString() +
        " ₱</span>" +
        '<span class="market-card__stock' +
        (soldOut ? " market-card__stock--sold" : "") +
        '">' +
        (soldOut ? "已售罄" : "现货 " + stock) +
        "</span>" +
        "</div>" +
        '<button type="button" class="market-card__buy"' +
        (soldOut ? " disabled" : "") +
        ">" +
        (soldOut ? "已售罄" : "购买") +
        "</button>" +
        "</div>";

      var buyBtn = card.querySelector(".market-card__buy");
      if (!soldOut) {
        buyBtn.addEventListener("click", function () {
          buyProduct(product);
        });
      }
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
    if (getStock(product.id) <= 0) {
      alert("该商品已售罄，请等待管理员补货。");
      return;
    }

    if (perilCredits < product.price) {
      alert("极危币不足，需要 " + product.price.toLocaleString() + " ₱");
      return;
    }

    var stashId = product.stashId || product.id;
    var canStash =
      window.GridStashUI && window.GridStashUI.canAddMarketItem
        ? window.GridStashUI.canAddMarketItem(stashId)
        : deliverToStash(stashId);
    if (!canStash) {
      alert("仓库已满，请先整理左下角「仓库」再购买。");
      return;
    }

    function finishPurchase() {
      if (!deliverToStash(stashId)) {
        alert("仓库已满，请先整理左下角「仓库」再购买。");
        return;
      }
      perilCredits -= product.price;
      if (window.PlayerStatePersist && window.PlayerStatePersist.scheduleSave) {
        window.PlayerStatePersist.scheduleSave();
      }
      updateCreditsDisplay();
      renderProducts();
      alert("已购买「" + product.name + "」，已放入仓库。");
    }

    if (
      window.LobbyNet &&
      window.LobbyNet.canUseMarket &&
      window.LobbyNet.canUseMarket() &&
      window.LobbyNet.consumeMarketStock
    ) {
      window.LobbyNet.consumeMarketStock(product.id, function (ok, msg, stockMap) {
        if (stockMap) {
          applyStockMap(stockMap);
        }
        if (!ok) {
          alert(msg || "购买失败");
          renderProducts();
          return;
        }
        finishPurchase();
      });
      return;
    }

    productStock[product.id] = getStock(product.id) - 1;
    saveLocalStock();
    finishPurchase();
  }

  function onPanelOpen() {
    marketPanelOpen = true;
    syncStockFromServer(function () {
      renderCategories();
      renderSubcats();
      renderProducts();
    });
  }

  function onPanelClose() {
    marketPanelOpen = false;
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
    if (window.PlayerStatePersist && window.PlayerStatePersist.scheduleSave) {
      window.PlayerStatePersist.scheduleSave();
    }
    return price;
  }

  function setCredits(amount) {
    var n = Number(amount);
    if (!isFinite(n) || n < 0) return;
    perilCredits = Math.floor(n);
    updateCreditsDisplay();
  }

  window.LobbyMarket = {
    onPanelOpen: onPanelOpen,
    onPanelClose: onPanelClose,
    applyStock: applyStockMap,
    getStock: getStock,
    syncStockFromServer: syncStockFromServer,
    getCredits: function () {
      return perilCredits;
    },
    setCredits: setCredits,
    getPriceByCatalogId: getPriceByCatalogId,
    getPriceHintByCatalogId: getPriceHintByCatalogId,
    getReclaimPrice: getReclaimPrice,
    sellCatalogItem: sellCatalogItem,
  };
})();

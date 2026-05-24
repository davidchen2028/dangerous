/**
 * 大厅 — 黑市交易所（极危币）
 */
(function () {
  "use strict";

  var listEl = document.getElementById("hubMarketList");
  var creditsEl = document.getElementById("hubMarketCredits");
  var perilCredits = 5000;
  var pendingForMission = [];

  var ITEM_DEFS = {
    medkit: {
      id: "medkit",
      name: "野战医疗缝合包",
      w: 1,
      h: 1,
      base: 1000,
      min: 900,
      max: 1500,
    },
    circuit: {
      id: "circuit",
      name: "废弃的军用电路板",
      w: 1,
      h: 1,
      base: 700,
      min: 600,
      max: 1000,
    },
  };

  var listings = [];
  var refreshTimer = 60;

  function uid() {
    return "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function refreshOfficial() {
    listings = listings.filter(function (l) {
      return !l.official;
    });
    var i;
    for (i = 0; i < 4; i++) {
      listings.push({
        id: uid(),
        item: ITEM_DEFS.medkit,
        price: 1200,
        official: true,
      });
    }
    for (i = 0; i < 2; i++) {
      listings.push({
        id: uid(),
        item: ITEM_DEFS.circuit,
        price: 800,
        official: true,
      });
    }
    render();
  }

  function updateCreditsDisplay() {
    if (creditsEl) {
      creditsEl.textContent = "极危币：" + perilCredits.toLocaleString();
    }
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";
    updateCreditsDisplay();

    if (listings.length === 0) {
      listEl.innerHTML = "<p class=\"hub-market__empty\">暂无在售商品</p>";
      return;
    }

    listings.forEach(function (listing) {
      var row = document.createElement("div");
      row.className = "hub-market__row";
      var tag = listing.official ? "官方" : "玩家";
      row.innerHTML =
        "<div class=\"hub-market__info\">" +
        "<span class=\"hub-market__tag hub-market__tag--" +
        (listing.official ? "official" : "player") +
        "\">" +
        tag +
        "</span>" +
        "<strong>" +
        listing.item.name +
        "</strong>" +
        "<span class=\"hub-market__size\">" +
        listing.item.w +
        "×" +
        listing.item.h +
        "</span>" +
        "</div>" +
        "<div class=\"hub-market__price\">" +
        listing.price.toLocaleString() +
        " ₱</div>" +
        "<button type=\"button\" class=\"hub-market__buy\">购买</button>";

      row.querySelector(".hub-market__buy").addEventListener("click", function () {
        buy(listing.id);
      });
      listEl.appendChild(row);
    });
  }

  function deliverItem(item) {
    if (
      document.body.classList.contains("action-open") &&
      window.ActionInventory &&
      window.ActionInventory.tryAddItem(item)
    ) {
      return true;
    }
    pendingForMission.push(item);
    return false;
  }

  function flushPendingToInventory() {
    if (!window.ActionInventory) return;
    while (pendingForMission.length > 0) {
      var item = pendingForMission[0];
      if (!window.ActionInventory.tryAddItem(item)) break;
      pendingForMission.shift();
    }
  }

  function buy(listingId) {
    var listing = null;
    var i;
    for (i = 0; i < listings.length; i++) {
      if (listings[i].id === listingId) {
        listing = listings[i];
        break;
      }
    }
    if (!listing) return;

    if (perilCredits < listing.price) {
      alert("极危币不足，需要 " + listing.price);
      return;
    }

    perilCredits -= listing.price;
    listings = listings.filter(function (l) {
      return l.id !== listingId;
    });

    var inMission = deliverItem(listing.item);
    render();
    if (!inMission) {
      alert(
        "已购买「" +
          listing.item.name +
          "」。进入「新手教程」后将自动放入战术背包。"
      );
    }
  }

  function tickRefresh(dt) {
    refreshTimer -= dt;
    if (refreshTimer <= 0) {
      refreshTimer = 60;
      refreshOfficial();
    }
  }

  setInterval(function () {
    tickRefresh(1);
  }, 1000);

  refreshOfficial();

  window.LobbyMarket = {
    onPanelOpen: function () {
      render();
    },
    getCredits: function () {
      return perilCredits;
    },
    flushPendingToInventory: flushPendingToInventory,
    refreshOfficial: refreshOfficial,
  };
})();

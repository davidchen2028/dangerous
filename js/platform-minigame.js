/**
 * 大厅小游戏 2 — Level Devil 风格平台：天空 + 灰地板。
 * 1 空关 → 2 三刺挤一起 → 3 前中后三刺 → 4 中间裂开 → 5 裂开 + 木箱 → 6 门搬家 + 绿箱。
 * 死亡只重开当前关。
 */
(function () {
  var STAGE_COUNT = 6;
  var viewEl = document.getElementById("platformGameView");
  var canvas = document.getElementById("platformGameCanvas");
  var dotsEl = document.getElementById("platformGameDots");
  var restartBtn = document.getElementById("platformGameRestart");
  var padEl = document.getElementById("platformGamePad");
  if (!viewEl || !canvas) return;

  var ctx = canvas.getContext("2d");
  var running = false;
  var rafId = 0;
  var lastTs = 0;
  var stage = 1;
  var keys = { left: false, right: false, jump: false };
  var jumpQueued = false;
  var player = { x: 0, y: 0, w: 22, h: 34, vx: 0, vy: 0, onGround: false };
  var spike = { armed: false, maxH: 18 };
  var spikeStates = [];
  var crack = { armed: false, open: false };
  var crate = { active: false, cancelled: false, dir: -1, x: 0, y: 0, w: 28, h: 26, vx: 0, vy: 0 };
  var green = { active: false, started: false, landed: false, x: 0, y: 0, w: 28, h: 26, vy: 0 };
  var portalSide = "right";
  var waitAtGap = 0;
  var woodArmed = false;
  var fade = 0;
  var fadeDir = 0;
  var pendingStage = 0;
  var dead = false;
  var deadT = 0;
  var entering = false;
  var shake = 0;
  var dpr = 1;
  var W = 800;
  var H = 480;

  function layout() {
    var pathH = Math.round(H * 0.26);
    var pathW = Math.round(W * 0.86);
    var pathX = Math.round((W - pathW) / 2);
    var pathY = Math.round(H * 0.5);
    return { pathX: pathX, pathY: pathY, pathW: pathW, pathH: pathH };
  }

  function portalBox(L) {
    var w = Math.max(28, Math.round(L.pathH * 0.22));
    var h = Math.round(L.pathH * 0.72);
    var inset = Math.round(L.pathW * 0.035);
    var x =
      portalSide === "left"
        ? L.pathX + inset
        : L.pathX + L.pathW - w - inset;
    return { x: x, y: L.pathY - h, w: w, h: h };
  }

  function gapBox(L) {
    var gw = Math.max(28, Math.round(player.w * 1.5));
    var cx = L.pathX + L.pathW * 0.5;
    return { x: cx - gw * 0.5, w: gw };
  }

  function spikeGroups() {
    if (stage === 2) return [{ t: 0.5, count: 3 }];
    if (stage === 3) {
      return [{ t: 0.24, count: 1 }, { t: 0.5, count: 1 }, { t: 0.76, count: 1 }];
    }
    return [];
  }

  function placePlayer(L) {
    player.w = Math.max(16, Math.round(H * 0.045));
    player.h = Math.max(26, Math.round(H * 0.07));
    player.x = L.pathX + Math.round(L.pathW * 0.045);
    player.y = L.pathY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
  }

  function resetHazards(L) {
    spike.maxH = Math.max(14, Math.round(H * 0.028));
    spike.armed = stage === 2 || stage === 3;
    spikeStates = spikeGroups().map(function () {
      return { shown: false, h: 0 };
    });
    crack.armed = stage === 4 || stage === 5 || stage === 6;
    crack.open = false;
    portalSide = "right";
    crate.w = player.h;
    crate.h = player.h;
    crate.active = false;
    crate.cancelled = false;
    crate.dir = -1;
    crate.vx = 0;
    crate.vy = 0;
    crate.x = portalBox(L).x - crate.w - 4;
    crate.y = L.pathY - crate.h;
    green.active = false;
    green.started = false;
    green.landed = false;
    green.w = player.h;
    green.h = player.h;
    green.vy = 0;
    waitAtGap = 0;
    woodArmed = false;
  }

  function spawnCrate(L, dir) {
    var door = portalBox(L);
    crate.active = true;
    crate.dir = dir < 0 ? -1 : 1;
    crate.vy = 0;
    crate.y = L.pathY - crate.h;
    if (crate.dir < 0) {
      crate.vx = -W * 0.55;
      crate.x = door.x - crate.w * 0.1;
    } else {
      crate.vx = W * 0.55;
      crate.x = door.x + door.w * 0.1;
    }
  }

  function spawnGreen(L) {
    var g = gapBox(L);
    green.active = true;
    green.started = true;
    green.landed = false;
    green.w = player.h;
    green.h = player.h;
    green.x = g.x + g.w * 0.5 - green.w * 0.5;
    green.y = 6;
    green.vy = H * 0.85;
  }

  function setStage(next) {
    stage = next;
    dead = false;
    deadT = 0;
    jumpQueued = false;
    var L = layout();
    placePlayer(L);
    resetHazards(L);
    renderDots();
  }

  function renderDots() {
    if (!dotsEl) return;
    var html = "";
    var i;
    for (i = 1; i <= STAGE_COUNT; i++) {
      html +=
        '<span class="platform-game__dot' +
        (stage === i ? " is-on" : "") +
        '"></span>';
    }
    dotsEl.innerHTML = html;
  }

  function resize() {
    var rect = viewEl.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, Math.round(rect.width));
    H = Math.max(240, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function gapOverlap(x, w, L) {
    if (!crack.open) return 0;
    var g = gapBox(L);
    return Math.max(0, Math.min(x + w, g.x + g.w) - Math.max(x, g.x));
  }

  function overGap(x, w, L) {
    return gapOverlap(x, w, L) > 0;
  }

  /** 脚大部分还在实地上才算站得住；缝边很滑，踩到就掉，不会弹回台面。 */
  function isSupported(x, w, L) {
    if (!crack.open) return true;
    var solid = w - gapOverlap(x, w, L);
    return solid >= w * 0.72;
  }

  function resolvePitWalls(L) {
    if (!crack.open) return;
    var g = gapBox(L);
    if (player.y + player.h <= L.pathY + 2) return;
    if (player.x < g.x) player.x = g.x;
    if (player.x + player.w > g.x + g.w) player.x = g.x + g.w - player.w;
  }

  function spikeBoxes(L) {
    var groups = spikeGroups();
    var oneW = Math.max(8, Math.round(H * 0.016));
    var gap = Math.max(1, Math.round(oneW * 0.15));
    var boxes = [];
    var i;
    var g;
    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      var st = spikeStates[i];
      var h = st ? st.h : 0;
      if (!st || !st.shown || h <= 1) continue;
      var totalW = g.count * oneW + (g.count - 1) * gap;
      var cx = L.pathX + L.pathW * g.t;
      var startX = cx - totalW * 0.5;
      var n;
      for (n = 0; n < g.count; n++) {
        boxes.push({
          x: startX + n * (oneW + gap),
          y: L.pathY - h,
          w: oneW,
          h: h,
        });
      }
    }
    return boxes;
  }

  function die() {
    if (dead || entering) return;
    dead = true;
    deadT = 0;
    shake = 10;
    keys.jump = false;
    jumpQueued = false;
  }

  function atGapFront(L, side) {
    var g = gapBox(L);
    if (!player.onGround || player.y + player.h > L.pathY + 2) return false;
    if (side === "left") {
      var leftDist = g.x - (player.x + player.w);
      return leftDist >= -10 && leftDist <= player.w * 3.8;
    }
    var rightDist = player.x - (g.x + g.w);
    return rightDist >= -10 && rightDist <= player.w * 3.8;
  }

  function enterPortal() {
    if (entering || dead || fadeDir) return;
    if (stage === 6 && portalSide === "right") {
      portalSide = "left";
      crate.active = false;
      crate.cancelled = false;
      crate.vx = 0;
      waitAtGap = 0;
      woodArmed = false;
      shake = 12;
      return;
    }
    if (stage < STAGE_COUNT) {
      fade = 0;
      fadeDir = 1;
      pendingStage = stage + 1;
      return;
    }
    entering = true;
    fade = 0;
    fadeDir = 1;
    pendingStage = 0;
    window.setTimeout(function () {
      if (window.LobbyUI && window.LobbyUI.goHome) {
        window.LobbyUI.goHome();
      }
      if (window.ActionScene && typeof window.ActionScene.enter === "function") {
        window.ActionScene.enter();
      }
      entering = false;
    }, 520);
  }

  function updateGreen(dt, L, justJumped) {
    if (!green.active) return;
    if (justJumped && !green.landed) {
      green.x = player.x + player.w * 0.5 - green.w * 0.5;
      if (green.vy < H * 2.1) green.vy = H * 2.1;
    }
    green.vy += Math.round(H * 3.8) * dt;
    green.y += green.vy * dt;
    if (
      overlaps(player, { x: green.x, y: green.y, w: green.w, h: green.h })
    ) {
      die();
      return;
    }
    if (green.y + green.h >= L.pathY) {
      green.landed = true;
      green.active = false;
      waitAtGap = 0;
    }
  }

  function updateWaitAndCrate(dt, L, justJumped) {
    if ((stage !== 5 && stage !== 6) || !crack.open) return;
    var g = gapBox(L);
    var fromLeft = stage === 6 && portalSide === "left";
    var atFront = atGapFront(L, fromLeft ? "right" : "left");

    if (fromLeft) {
      if (atFront && !green.started) spawnGreen(L);
      updateGreen(dt, L, justJumped);
      if (dead) return;
      if (justJumped && green.landed) woodArmed = true;
      if (
        woodArmed &&
        player.x + player.w * 0.45 <= g.x &&
        !crate.cancelled &&
        !crate.active
      ) {
        spawnCrate(L, 1);
      }
    } else if (!crate.cancelled && !crate.active) {
      spawnCrate(L, -1);
    }

    var waitReady = !fromLeft || green.landed;
    if (!crate.cancelled && atFront && waitReady) {
      waitAtGap += dt;
      if (waitAtGap >= 1) {
        crate.cancelled = true;
        crate.active = false;
      }
    } else if (!crate.cancelled && !atFront) {
      waitAtGap = 0;
    }
    if (crate.cancelled || !crate.active) return;

    crate.vx += crate.dir * W * 2.6 * dt;
    if (crate.dir < 0 && crate.vx < -W * 1.15) crate.vx = -W * 1.15;
    if (crate.dir > 0 && crate.vx > W * 1.15) crate.vx = W * 1.15;
    crate.x += crate.vx * dt;
    if (crate.dir < 0 && crate.x < g.x + g.w) {
      crate.x = g.x + g.w;
      crate.vx = 0;
    }
    if (crate.dir > 0 && crate.x + crate.w > g.x) {
      crate.x = g.x - crate.w;
      crate.vx = 0;
    }
    crate.y = L.pathY - crate.h;
    crate.vy = 0;

    if (overlaps(player, { x: crate.x, y: crate.y, w: crate.w, h: crate.h })) {
      player.x = crate.dir < 0 ? crate.x - player.w : crate.x + crate.w;
      player.onGround = false;
      if (player.vy < H * 0.12) player.vy = H * 0.12;
    }
  }

  function update(dt) {
    var L = layout();
    if (shake > 0) shake = Math.max(0, shake - dt * 28);

    if (dead) {
      deadT += dt;
      if (deadT >= 0.55) setStage(stage);
      return;
    }

    if (fadeDir) {
      fade += fadeDir * dt * 3.2;
      if (fade >= 1) {
        fade = 1;
        if (pendingStage >= 2) {
          setStage(pendingStage);
          fadeDir = -1;
        }
      } else if (fade <= 0) {
        fade = 0;
        fadeDir = 0;
      }
      if (fadeDir > 0) return;
    }

    var speed = Math.round(W * 0.38);
    var want = 0;
    if (keys.left) want -= 1;
    if (keys.right) want += 1;
    player.vx = want * speed;
    var prevFeet = player.y + player.h;
    player.x += player.vx * dt;

    var minX = L.pathX + 2;
    var maxX = L.pathX + L.pathW - player.w - 2;
    if (player.x < minX) player.x = minX;
    if (player.x > maxX && prevFeet <= L.pathY + 2) {
      player.x = maxX;
    }
    resolvePitWalls(L);

    var justJumped = false;
    if ((jumpQueued || keys.jump) && player.onGround) {
      player.vy = -Math.round(H * 0.68);
      player.onGround = false;
      jumpQueued = false;
      justJumped = true;
    }

    player.vy += Math.round(H * 3.8) * dt;
    player.y += player.vy * dt;
    var feet = player.y + player.h;
    var fromAbove = prevFeet <= L.pathY + 1;
    var supported = isSupported(player.x, player.w, L);
    if (fromAbove && supported && player.vy >= 0 && feet >= L.pathY) {
      player.y = L.pathY - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    if (player.y > L.pathY + L.pathH * 0.35) {
      die();
      return;
    }

    var groups = spikeGroups();
    var px = player.x + player.w * 0.5;
    var gi;
    for (gi = 0; gi < groups.length; gi++) {
      var st = spikeStates[gi];
      if (!st) continue;
      var sx = L.pathX + L.pathW * groups[gi].t;
      if (!st.shown && px >= sx - player.w * 0.25) {
        st.shown = true;
        shake = 6;
      }
      if (st.shown && st.h < spike.maxH) {
        st.h = Math.min(spike.maxH, st.h + spike.maxH * dt * 9);
      }
    }
    if (crack.armed && !crack.open && player.x + player.w >= gapBox(L).x - 8) {
      crack.open = true;
      shake = 8;
      if (!isSupported(player.x, player.w, L)) {
        player.onGround = false;
        if (player.vy < H * 0.2) player.vy = H * 0.2;
      }
    }

    var boxes = spikeBoxes(L);
    var i;
    for (i = 0; i < boxes.length; i++) {
      if (boxes[i].h > 6 && overlaps(player, boxes[i])) {
        die();
        return;
      }
    }

    updateWaitAndCrate(dt, L, justJumped);
    if (dead) return;
    if (overlaps(player, portalBox(L)) && !overGap(player.x, player.w, L)) enterPortal();
  }

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#9ad4f5");
    g.addColorStop(0.55, "#7ec8ea");
    g.addColorStop(1, "#6bb3d6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.ellipse(W * 0.18, H * 0.16, W * 0.09, H * 0.035, 0, 0, Math.PI * 2);
    ctx.ellipse(W * 0.24, H * 0.15, W * 0.07, H * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W * 0.72, H * 0.12, W * 0.11, H * 0.032, 0, 0, Math.PI * 2);
    ctx.ellipse(W * 0.8, H * 0.13, W * 0.06, H * 0.024, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpike(L) {
    var boxes = spikeBoxes(L);
    var i;
    for (i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.h <= 1) continue;
      ctx.fillStyle = "#2c2c30";
      ctx.beginPath();
      ctx.moveTo(box.x, L.pathY);
      ctx.lineTo(box.x + box.w * 0.5, L.pathY - box.h);
      ctx.lineTo(box.x + box.w, L.pathY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4a4a50";
      ctx.beginPath();
      ctx.moveTo(box.x + box.w * 0.5, L.pathY - box.h);
      ctx.lineTo(box.x + box.w * 0.72, L.pathY);
      ctx.lineTo(box.x + box.w, L.pathY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawWoodBox(x, y, w, h, fill, slat, edge) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = slat;
    ctx.fillRect(x + 3, y + 3, w - 6, 3);
    ctx.fillRect(x + 3, y + h * 0.5 - 1, w - 6, 3);
    ctx.fillRect(x + 3, y + h - 6, w - 6, 3);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawCrate() {
    if (!crate.active) return;
    drawWoodBox(
      Math.round(crate.x),
      Math.round(crate.y),
      crate.w,
      crate.h,
      "#8a5a2b",
      "#6d441e",
      "#4a2e12"
    );
  }

  function drawGreen() {
    if (!green.active) return;
    drawWoodBox(
      Math.round(green.x),
      Math.round(green.y),
      green.w,
      green.h,
      "#3d9a4a",
      "#2d7336",
      "#1d4f24"
    );
  }

  function drawFloor(L) {
    ctx.fillStyle = "#4a525a";
    ctx.fillRect(0, L.pathY, W, H - L.pathY);

    if (crack.open) {
      var g = gapBox(L);
      ctx.fillStyle = "#8d9196";
      ctx.fillRect(L.pathX, L.pathY, g.x - L.pathX, L.pathH);
      ctx.fillRect(g.x + g.w, L.pathY, L.pathX + L.pathW - (g.x + g.w), L.pathH);
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(L.pathX, L.pathY, g.x - L.pathX, 6);
      ctx.fillRect(g.x + g.w, L.pathY, L.pathX + L.pathW - (g.x + g.w), 6);
      ctx.fillStyle = "#1c2228";
      ctx.fillRect(g.x, L.pathY, g.w, L.pathH + 8);
      ctx.fillStyle = "#14181c";
      ctx.beginPath();
      ctx.moveTo(g.x, L.pathY);
      ctx.lineTo(g.x + 4, L.pathY + L.pathH);
      ctx.lineTo(g.x, L.pathY + L.pathH);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(g.x + g.w, L.pathY);
      ctx.lineTo(g.x + g.w - 4, L.pathY + L.pathH);
      ctx.lineTo(g.x + g.w, L.pathY + L.pathH);
      ctx.closePath();
      ctx.fill();
      return;
    }

    ctx.fillStyle = "#8d9196";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
  }

  function draw() {
    var L = layout();
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawSky();
    drawFloor(L);

    var door = portalBox(L);
    ctx.fillStyle = "#6b6f74";
    ctx.fillRect(door.x, door.y, door.w, door.h);
    ctx.fillStyle = "#5a5e62";
    ctx.fillRect(door.x + 5, door.y + 8, door.w - 10, door.h - 8);

    drawSpike(L);
    drawCrate();
    drawGreen();

    ctx.fillStyle = "#111214";
    ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);

    ctx.restore();

    if (dead) {
      ctx.fillStyle = "rgba(120, 8, 8, " + Math.min(0.45, deadT * 1.2) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (fade > 0) {
      ctx.fillStyle = "rgba(8, 12, 16, " + fade + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(ts) {
    if (!running) return;
    var dt = lastTs ? Math.min(0.033, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    update(dt);
    draw();
    rafId = window.requestAnimationFrame(frame);
  }

  function setKey(code, down) {
    if (code === "KeyA" || code === "ArrowLeft") keys.left = down;
    else if (code === "KeyD" || code === "ArrowRight") keys.right = down;
    else if (code === "Space") {
      keys.jump = down;
      if (down) jumpQueued = true;
    } else {
      return false;
    }
    return true;
  }

  function onKeyDown(e) {
    if (!running) return;
    if (setKey(e.code, true)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKeyUp(e) {
    if (!running) return;
    if (setKey(e.code, false)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function bindPad() {
    if (!padEl) return;
    var buttons = padEl.querySelectorAll("button");
    var i;
    for (i = 0; i < buttons.length; i++) {
      (function (btn) {
        var dir = btn.getAttribute("data-dir");
        function press(e) {
          e.preventDefault();
          if (dir === "left") keys.left = true;
          else if (dir === "right") keys.right = true;
          else if (dir === "jump") {
            keys.jump = true;
            jumpQueued = true;
          }
        }
        function release(e) {
          e.preventDefault();
          if (dir === "left") keys.left = false;
          else if (dir === "right") keys.right = false;
          else if (dir === "jump") keys.jump = false;
        }
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointerleave", release);
        btn.addEventListener("pointercancel", release);
      })(buttons[i]);
    }
  }

  function showViews() {
    if (window.PasswordMinigame && window.PasswordMinigame.hide) {
      window.PasswordMinigame.hide();
    }
    viewEl.hidden = false;
  }

  function hideViews() {
    viewEl.hidden = true;
  }

  function start() {
    showViews();
    resize();
    entering = false;
    fade = 0;
    fadeDir = 0;
    pendingStage = 0;
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    setStage(1);
    if (!running) {
      running = true;
      lastTs = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    keys.left = keys.right = keys.jump = false;
    hideViews();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("resize", function () {
    if (running) resize();
  });
  if (restartBtn) {
    restartBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (running && !entering) setStage(stage);
    });
  }
  bindPad();

  window.PlatformMinigame = {
    start: start,
    stop: stop,
    hide: hideViews,
  };
})();

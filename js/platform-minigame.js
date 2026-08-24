/**
 * 大厅小游戏 2 — Level Devil 风格平台：天空 + 灰地板。
 * 1 空关 → 2 三刺挤一起 → 3 前中后三刺 → 4 中间裂开 → 5 裂开 + 木箱
 * → 6 门搬家 + 绿箱 → 7 前中后三缝 → 8 三缝（可见）+ 绿箱/木箱/按钮
 * → 9 中刺变三刺 → 过刺即出灰箱回城 → 单缝双向绿/木/红箱陷阱
 * → 10 巨大缝，鼠标拖到门边再走进去。
 * 死亡只重开当前关。刷新保留关卡进度，左上角可回第一关。
 */
(function () {
  var STAGE_COUNT = 10;
  var STAGE_KEY = "jiwei_minigame2_stage";
  var DOUBLE_JUMP_KEY = "jiwei_minigame2_double_jump";
  var viewEl = document.getElementById("platformGameView");
  var canvas = document.getElementById("platformGameCanvas");
  var dotsEl = document.getElementById("platformGameDots");
  var restartBtn = document.getElementById("platformGameRestart");
  var firstBtn = document.getElementById("platformGameFirst");
  var selectEl = document.getElementById("platformSelect");
  var selectPassEl = document.getElementById("platformSelectPass");
  var selectMenuEl = document.getElementById("platformSelectMenu");
  var selectInputEl = document.getElementById("platformSelectInput");
  var selectChoicesEl = document.getElementById("platformSelectChoices");
  var settingsEl = document.getElementById("platformSettings");
  var doubleJumpBtn = document.getElementById("platformDoubleJump");
  var doubleJumpPassEl = document.getElementById("platformDoubleJumpPass");
  var doubleJumpInputEl = document.getElementById("platformDoubleJumpInput");
  var padEl = document.getElementById("platformGamePad");
  if (!viewEl || !canvas) return;

  var ctx = canvas.getContext("2d");
  var running = false;
  var rafId = 0;
  var lastTs = 0;
  var stage = 1;
  var keys = { left: false, right: false, jump: false };
  var jumpQueued = false;
  var airJumps = 0;
  var doubleJumpEnabled = false;
  var settingsOpen = false;
  var player = { x: 0, y: 0, w: 22, h: 34, vx: 0, vy: 0, onGround: false };
  var spike = { armed: false, maxH: 18 };
  var spikeStates = [];
  var crack = { armed: false, open: false };
  var gapStates = [];
  var crate = { active: false, cancelled: false, dir: -1, x: 0, y: 0, w: 28, h: 26, vx: 0, vy: 0 };
  var green = { active: false, started: false, landed: false, x: 0, y: 0, w: 28, h: 26, vy: 0 };
  var portalSide = "right";
  var waitAtGap = 0;
  var woodArmed = false;
  var greenFlags = [false, false, false];
  var floorGone = false;
  var s9SideOn = false;
  var s9SpikesCleared = false;
  var s9BecameGap = false;
  var s9GapTimer = -1;
  var s9Round = 0;
  var s9WoodFired = false;
  var s9WoodAtGap = 0;
  var s9RoundUnlocked = false;
  var s9WaitLastRed = false;
  var s9WoodWave = 0;
  var s9WaveQueue = [];
  var s9WaveTimer = -1;
  var s9WaveDirection = 1;
  var grey = { active: false, spawned: false, x: 0, y: 0, w: 28, h: 26, vx: 0 };
  var redCrates = [];
  var airGreenCrates = [];
  var selectOpen = false;
  var STAGE_LABELS = [
    "第 1 关 · 空关",
    "第 2 关 · 三刺挤一起",
    "第 3 关 · 前中后刺",
    "第 4 关 · 中间裂开",
    "第 5 关 · 木箱",
    "第 6 关 · 门搬家",
    "第 7 关 · 三缝",
    "第 8 关 · 三缝陷阱",
    "第 9 关 · 中刺变缝",
    "第 10 关 · 大缝",
  ];
  var drag = { on: false, ox: 0, oy: 0 };
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

  function gapSlots() {
    if (stage === 7) return [0.24, 0.5, 0.76];
    if (stage === 8) return [0.2, 0.42, 0.62];
    if (stage === 9 && s9BecameGap) return [0.5];
    if (stage === 10) return [0.5];
    if (stage === 4 || stage === 5 || stage === 6) return [0.5];
    return [];
  }

  function gapBoxAt(L, t) {
    var gw =
      stage === 10
        ? Math.round(L.pathW * 0.66)
        : Math.max(28, Math.round(player.w * 1.5));
    var cx = L.pathX + L.pathW * t;
    return { x: cx - gw * 0.5, w: gw };
  }

  function listGaps(L) {
    var slots = gapSlots();
    return slots.map(function (t, i) {
      var box = gapBoxAt(L, t);
      box.open = !!(gapStates[i] && gapStates[i].open);
      return box;
    });
  }

  function gapBox(L) {
    var gaps = listGaps(L);
    if (gaps.length) return gaps[Math.min(1, gaps.length - 1)] || gaps[0];
    var gw = Math.max(28, Math.round(player.w * 1.5));
    var cx = L.pathX + L.pathW * 0.5;
    return { x: cx - gw * 0.5, w: gw };
  }

  function spikeGroups() {
    if (stage === 2) return [{ t: 0.5, count: 3 }];
    if (stage === 3) {
      return [{ t: 0.24, count: 1 }, { t: 0.5, count: 1 }, { t: 0.76, count: 1 }];
    }
    if (stage === 9 && !s9BecameGap) {
      if (s9SpikesCleared) return [];
      if (s9SideOn) {
        return [{ t: 0.48, count: 1 }, { t: 0.5, count: 1 }, { t: 0.52, count: 1 }];
      }
      return [{ t: 0.5, count: 1 }];
    }
    return [];
  }

  function persistStage(n) {
    try {
      window.localStorage.setItem(STAGE_KEY, String(n));
    } catch (err) {
      /* ignore */
    }
  }

  function readStage() {
    try {
      var n = parseInt(window.localStorage.getItem(STAGE_KEY), 10);
      if (n >= 1 && n <= STAGE_COUNT) return n;
    } catch (err) {
      /* ignore */
    }
    return 1;
  }

  function readDoubleJump() {
    try {
      return window.localStorage.getItem(DOUBLE_JUMP_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function saveDoubleJump() {
    try {
      window.localStorage.setItem(DOUBLE_JUMP_KEY, doubleJumpEnabled ? "1" : "0");
    } catch (err) {
      /* ignore */
    }
  }

  function placePlayer(L) {
    player.w = Math.max(16, Math.round(H * 0.045));
    player.h = Math.max(26, Math.round(H * 0.07));
    player.x = L.pathX + Math.round(L.pathW * 0.045);
    player.y = L.pathY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    airJumps = 0;
  }

  function resetHazards(L) {
    spike.maxH = Math.max(14, Math.round(H * 0.028));
    spike.armed = stage === 2 || stage === 3;
    spikeStates = spikeGroups().map(function () {
      return { shown: false, h: 0 };
    });
    s9SideOn = false;
    s9SpikesCleared = false;
    s9BecameGap = false;
    s9GapTimer = -1;
    s9Round = 0;
    s9WoodFired = false;
    s9WoodAtGap = 0;
    s9RoundUnlocked = false;
    s9WaitLastRed = false;
    s9WoodWave = 0;
    s9WaveQueue = [];
    s9WaveTimer = -1;
    s9WaveDirection = 1;
    grey.active = false;
    grey.spawned = false;
    grey.vx = 0;
    drag.on = false;
    crack.armed = (stage >= 4 && stage <= 8) || stage === 9 || stage === 10;
    crack.open = stage === 8 || stage === 10;
    gapStates = gapSlots().map(function () {
      return { open: stage === 8 || stage === 10 };
    });
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
    greenFlags = [false, false, false];
    floorGone = false;
    redCrates = [];
    airGreenCrates = [];
    if (stage === 9) {
      spike.armed = true;
      spikeStates = [{ shown: true, h: spike.maxH }];
    }
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

  function spawnGreen(L, gap) {
    var g = gap || gapBox(L);
    green.active = true;
    green.started = true;
    green.landed = false;
    green.w = player.h;
    green.h = player.h;
    green.x = g.x + g.w * 0.5 - green.w * 0.5;
    green.y = 6;
    green.vy = H * 0.85;
  }

  function buttonBox(L) {
    if (stage !== 8 || floorGone) return null;
    var gaps = listGaps(L);
    if (!gaps[2]) return null;
    var bw = Math.max(22, Math.round(player.w * 1.2));
    var bh = Math.max(8, Math.round(player.h * 0.2));
    return {
      x: gaps[2].x + gaps[2].w + Math.round(player.w * 1.7),
      y: L.pathY - bh,
      w: bw,
      h: bh,
    };
  }

  function spawnGrey(L) {
    var door = portalBox(L);
    grey.active = true;
    grey.spawned = true;
    grey.w = player.h;
    grey.h = player.h;
    grey.x = door.x - grey.w * 0.1;
    grey.y = L.pathY - grey.h;
    grey.vx = -W * 0.68;
  }

  function spawnRed(L, dir) {
    var red = {
      w: Math.max(18, Math.round(player.h * 0.62)),
      h: Math.max(10, Math.round(player.h * 0.36)),
      x: 0,
      y: 0,
      vx: 0,
    };
    var direction = dir < 0 ? -1 : 1;
    red.x =
      direction < 0
        ? L.pathX + L.pathW - red.w
        : L.pathX;
    red.y = L.pathY - red.h;
    red.vx = direction * W * 0.5;
    redCrates.push(red);
  }

  /** 第 9 关后两波会从门的另一边回来，因此木箱按飞行方向从场地边缘出现。 */
  function spawnStage9Crate(L, dir) {
    spawnCrate(L, dir);
    crate.x =
      crate.dir < 0
        ? L.pathX + L.pathW - crate.w
        : L.pathX;
  }

  /** 记录生成瞬间的玩家横坐标，之后只直线下落，不再追踪或拐弯。 */
  function spawnAirGreen(L) {
    var size = player.h;
    airGreenCrates.push({
      x: player.x + player.w * 0.5 - size * 0.5,
      y: 6,
      w: size,
      h: size,
      vy: H * 0.72,
    });
  }

  function stage9WaveSpec(wave) {
    var specs = [
      { red: 2, green: 1, interval: 0.75 },
      { red: 4, green: 2, interval: 1.0 },
      { red: 8, green: 6, interval: 1.25 },
    ];
    return specs[Math.max(0, Math.min(specs.length - 1, wave - 1))];
  }

  function makeStage9Wave(wave) {
    var spec = stage9WaveSpec(wave);
    var queue = [];
    var redCount = spec.red;
    var greenCount = spec.green;
    while (redCount > 0 || greenCount > 0) {
      if (redCount > 0) {
        queue.push("red");
        redCount -= 1;
      }
      if (greenCount > 0) {
        queue.push("green");
        greenCount -= 1;
      }
    }
    return queue;
  }

  function setStage(next) {
    stage = next;
    persistStage(next);
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

  function vanishedOverlap(x, w, L) {
    if (stage !== 8 || !floorGone) return 0;
    var gaps = listGaps(L);
    if (!gaps[2]) return 0;
    var left = gaps[2].x + gaps[2].w;
    var right = L.pathX + L.pathW + 24;
    return Math.max(0, Math.min(x + w, right) - Math.max(x, left));
  }

  function gapOverlap(x, w, L) {
    var gaps = listGaps(L);
    var total = vanishedOverlap(x, w, L);
    var i;
    for (i = 0; i < gaps.length; i++) {
      if (!gaps[i].open) continue;
      total += Math.max(
        0,
        Math.min(x + w, gaps[i].x + gaps[i].w) - Math.max(x, gaps[i].x)
      );
    }
    return total;
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
    if (player.y + player.h <= L.pathY + 2) return;
    var gaps = listGaps(L);
    var mid = player.x + player.w * 0.5;
    var i;
    for (i = 0; i < gaps.length; i++) {
      if (!gaps[i].open) continue;
      var g = gaps[i];
      if (mid < g.x || mid > g.x + g.w) continue;
      if (player.x < g.x) player.x = g.x;
      if (player.x + player.w > g.x + g.w) player.x = g.x + g.w - player.w;
      return;
    }
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

  function atGapFrontOf(L, g, side) {
    if (!g || !player.onGround || player.y + player.h > L.pathY + 2) return false;
    if (side === "left") {
      var leftDist = g.x - (player.x + player.w);
      return leftDist >= -10 && leftDist <= player.w * 3.8;
    }
    var rightDist = player.x - (g.x + g.w);
    return rightDist >= -10 && rightDist <= player.w * 3.8;
  }

  function atGapFront(L, side) {
    return atGapFrontOf(L, gapBox(L), side);
  }

  function enterPortal() {
    if (entering || dead || fadeDir) return;
    if (stage === 9) {
      if (!s9RoundUnlocked) return;
      if (s9Round === 1 && portalSide === "right") {
        portalSide = "left";
        s9Round = 2;
        s9RoundUnlocked = false;
        s9WaitLastRed = false;
        green.active = false;
        green.started = false;
        green.landed = false;
        green.vy = 0;
        crate.active = false;
        crate.cancelled = false;
        crate.vx = 0;
        woodArmed = false;
        waitAtGap = 0;
        s9WoodFired = false;
        s9WoodAtGap = 0;
        redCrates = [];
        airGreenCrates = [];
        s9WoodWave = 0;
        s9WaveQueue = [];
        s9WaveTimer = -1;
        s9WaveDirection = 1;
        shake = 12;
        return;
      }
    }
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

  function moveCrate(dt, L, g) {
    if (!crate.active || crate.cancelled) return;
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

  function updateStage8(dt, L, justJumped) {
    var gaps = listGaps(L);
    if (gaps.length < 3) return;
    if (!greenFlags[0] && atGapFrontOf(L, gaps[0], "left")) {
      greenFlags[0] = true;
      spawnGreen(L, gaps[0]);
    }
    if (!greenFlags[2] && atGapFrontOf(L, gaps[2], "left")) {
      greenFlags[2] = true;
      spawnGreen(L, gaps[2]);
    }
    updateGreen(dt, L, justJumped);
    if (dead) return;

    var mid = gaps[1];
    var atMid = atGapFrontOf(L, mid, "left");
    if (justJumped && atMid) woodArmed = true;
    if (
      woodArmed &&
      player.x >= mid.x + mid.w * 0.55 &&
      !crate.cancelled &&
      !crate.active
    ) {
      spawnCrate(L, -1);
    }
    if (!crate.cancelled && atMid) {
      waitAtGap += dt;
      if (waitAtGap >= 1) {
        crate.cancelled = true;
        crate.active = false;
      }
    } else if (!crate.cancelled && !atMid) {
      waitAtGap = 0;
    }
    moveCrate(dt, L, mid);

    var btn = buttonBox(L);
    if (btn && player.onGround && overlaps(player, btn)) {
      floorGone = true;
      shake = 10;
      player.onGround = false;
      if (player.vy < H * 0.25) player.vy = H * 0.25;
    }
  }

  function becomeStage9Gap(L) {
    s9BecameGap = true;
    s9SideOn = false;
    s9SpikesCleared = true;
    s9GapTimer = -1;
    s9Round = 1;
    s9WoodFired = false;
    s9WoodAtGap = 0;
    s9RoundUnlocked = false;
    s9WaitLastRed = false;
    s9WoodWave = 0;
    s9WaveQueue = [];
    s9WaveTimer = -1;
    airGreenCrates = [];
    grey.active = false;
    spike.armed = false;
    spikeStates = [];
    crack.armed = true;
    crack.open = true;
    gapStates = [{ open: true }];
    shake = 8;
  }

  function updateRed(dt, L) {
    var kept = [];
    for (var i = 0; i < redCrates.length; i++) {
      var red = redCrates[i];
      red.x += red.vx * dt;
      if (
        overlaps(player, { x: red.x, y: red.y, w: red.w, h: red.h }) &&
        player.y + player.h > red.y + 2
      ) {
        die();
        return;
      }
      var outsideLeft = red.x + red.w < L.pathX - 40;
      var outsideRight = red.x > L.pathX + L.pathW + 40;
      if (!outsideLeft && !outsideRight) kept.push(red);
    }
    redCrates = kept;
    // 门搬到左边后一直半透明，直到最后一个红箱飞出场地才恢复可用
    if (
      stage === 9 &&
      s9WaitLastRed &&
      redCrates.length === 0 &&
      s9WaveQueue.length === 0
    ) {
      s9WaitLastRed = false;
      s9RoundUnlocked = true;
    }
  }

  function updateAirGreen(dt, L) {
    var kept = [];
    for (var i = 0; i < airGreenCrates.length; i++) {
      var box = airGreenCrates[i];
      box.vy += Math.round(H * 3.2) * dt;
      box.y += box.vy * dt;
      if (overlaps(player, box)) {
        die();
        return;
      }
      if (box.y + box.h < L.pathY) kept.push(box);
    }
    airGreenCrates = kept;
  }

  function updateGrey(dt, L) {
    if (s9GapTimer >= 0) {
      s9GapTimer -= dt;
      if (s9GapTimer <= 0) {
        s9GapTimer = -1;
        becomeStage9Gap(L);
      }
    }
    if (!grey.active) return;
    grey.x += grey.vx * dt;
    if (overlaps(player, { x: grey.x, y: grey.y, w: grey.w, h: grey.h })) {
      placePlayer(L);
      grey.active = false;
      s9GapTimer = 0.3;
      shake = 8;
      return;
    }
    if (grey.x + grey.w < L.pathX - 40) grey.active = false;
  }

  function updateStage9(dt, L, justJumped) {
    if (!s9BecameGap) {
      var midX = L.pathX + L.pathW * 0.5;
      var playerMid = player.x + player.w * 0.5;
      var overSpike =
        !player.onGround &&
        player.x + player.w > midX - player.w &&
        player.x < midX + player.w &&
        player.y + player.h < L.pathY - 6;
      if (overSpike && !s9SideOn) {
        s9SideOn = true;
        spikeStates = [
          { shown: true, h: spike.maxH },
          { shown: true, h: spike.maxH },
          { shown: true, h: spike.maxH },
        ];
        shake = 7;
      }
      if (
        s9SideOn &&
        !s9SpikesCleared &&
        player.onGround &&
        playerMid < midX - player.w * 1.5
      ) {
        s9SpikesCleared = true;
        spikeStates = [];
        shake = 6;
      }
      // 跳过刺群和后退消刺后再走过去，都算「经过那三根刺」
      if (!grey.spawned && playerMid > midX + player.w) {
        spawnGrey(L);
      }
      updateGrey(dt, L);
      return;
    }

    var g = gapBox(L);
    // 第二轮每跨一次缝换一边：右→左、左→右、右→左，共三次。
    var side =
      s9Round === 2
        ? s9WoodWave % 2 === 0
          ? "right"
          : "left"
        : "left";
    var woodDir = side === "right" ? 1 : -1;
    if (!green.started && atGapFrontOf(L, g, side)) {
      spawnGreen(L, g);
    }
    updateGreen(dt, L, justJumped);
    if (dead) return;

    var frontDist =
      side === "left"
        ? g.x - (player.x + player.w)
        : player.x - (g.x + g.w);
    var jumpedFromFront =
      justJumped && frontDist >= -10 && frontDist <= player.w * 3.8;
    var canStartWood =
      s9Round === 1
        ? !s9WoodFired
        : s9WoodWave < 3 &&
          s9WaveQueue.length === 0 &&
          s9WaveTimer < 0 &&
          !crate.active;
    if (green.landed && canStartWood && jumpedFromFront) {
      woodArmed = true;
    }
    var crossedGap =
      side === "right"
        ? player.x + player.w <= g.x + g.w * 0.45
        : player.x >= g.x + g.w * 0.55;
    if (canStartWood && woodArmed && crossedGap) {
      spawnStage9Crate(L, woodDir);
      woodArmed = false;
      s9WoodAtGap = 0;
      if (s9Round === 1) {
        s9WoodFired = true;
      } else {
        s9WoodWave += 1;
        s9WaveDirection = woodDir;
        s9WaveQueue = makeStage9Wave(s9WoodWave);
        s9WaveTimer = 0;
      }
    }

    moveCrate(dt, L, g);

    if (crate.active && crate.vx === 0) {
      s9WoodAtGap += dt;
      if (s9WoodAtGap >= 1) {
        crate.active = false;
        s9WoodAtGap = 0;
        if (s9Round === 1) {
          spawnRed(L, -1);
          s9RoundUnlocked = true;
        }
      }
    }

    if (s9Round === 2 && s9WaveQueue.length > 0) {
      s9WaveTimer -= dt;
      if (s9WaveTimer <= 0) {
        var hazard = s9WaveQueue.shift();
        if (hazard === "red") spawnRed(L, s9WaveDirection);
        else spawnAirGreen(L);
        s9WaveTimer = s9WaveQueue.length
          ? stage9WaveSpec(s9WoodWave).interval
          : -1;
        if (s9WoodWave === 3 && s9WaveQueue.length === 0) {
          s9WaitLastRed = true;
        }
      }
    }
    updateRed(dt, L);
    if (dead) return;
    updateAirGreen(dt, L);
  }

  function updateWaitAndCrate(dt, L, justJumped) {
    if (stage === 8) {
      updateStage8(dt, L, justJumped);
      return;
    }
    if (stage === 9) {
      updateStage9(dt, L, justJumped);
      return;
    }
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
    moveCrate(dt, L, g);
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

    if (selectOpen || settingsOpen) return;
    if (drag.on) {
      player.vx = 0;
      player.vy = 0;
      return;
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
      airJumps = 0;
      jumpQueued = false;
      justJumped = true;
    } else if (jumpQueued) {
      if (doubleJumpEnabled && airJumps < 1) {
        player.vy = -Math.round(H * 0.68);
        airJumps += 1;
        justJumped = true;
      }
      jumpQueued = false;
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
      airJumps = 0;
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
    if (crack.armed) {
      var slots = gapSlots();
      var si;
      for (si = 0; si < slots.length; si++) {
        if (gapStates[si] && gapStates[si].open) continue;
        var nextGap = gapBoxAt(L, slots[si]);
        if (player.x + player.w >= nextGap.x - 8) {
          if (!gapStates[si]) gapStates[si] = { open: false };
          gapStates[si].open = true;
          crack.open = true;
          shake = 8;
          if (!isSupported(player.x, player.w, L)) {
            player.onGround = false;
            if (player.vy < H * 0.2) player.vy = H * 0.2;
          }
        }
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
    if (
      overlaps(player, portalBox(L)) &&
      !overGap(player.x, player.w, L) &&
      (stage !== 10 || keys.left || keys.right)
    ) {
      enterPortal();
    }
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

  function drawAirGreens() {
    for (var i = 0; i < airGreenCrates.length; i++) {
      var box = airGreenCrates[i];
      drawWoodBox(
        Math.round(box.x),
        Math.round(box.y),
        box.w,
        box.h,
        "#3d9a4a",
        "#2d7336",
        "#1d4f24"
      );
    }
  }

  function drawRed() {
    for (var i = 0; i < redCrates.length; i++) {
      var red = redCrates[i];
      drawWoodBox(
        Math.round(red.x),
        Math.round(red.y),
        red.w,
        red.h,
        "#c43b32",
        "#9a2a24",
        "#6a1814"
      );
    }
  }

  function drawGrey() {
    if (!grey.active) return;
    drawWoodBox(
      Math.round(grey.x),
      Math.round(grey.y),
      grey.w,
      grey.h,
      "#8a8e94",
      "#6d7176",
      "#4a4e54"
    );
  }

  function drawFloor(L) {
    ctx.fillStyle = "#4a525a";
    ctx.fillRect(0, L.pathY, W, H - L.pathY);

    ctx.fillStyle = "#8d9196";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);

    var holes = listGaps(L);
    var hi;
    for (hi = 0; hi < holes.length; hi++) {
      if (!holes[hi].open) continue;
      var g = holes[hi];
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
    }
    if (stage === 8 && floorGone && holes[2]) {
      var goneX = holes[2].x + holes[2].w;
      ctx.fillStyle = "#1c2228";
      ctx.fillRect(goneX, L.pathY, L.pathX + L.pathW - goneX, L.pathH + 8);
    }
  }

  function drawButton(L) {
    var btn = buttonBox(L);
    if (!btn) return;
    ctx.fillStyle = "#c43b32";
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = "#e25a4f";
    ctx.fillRect(btn.x + 2, btn.y + 2, btn.w - 4, Math.max(2, btn.h * 0.4));
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
    ctx.save();
    if (stage === 9 && portalSide === "left" && !s9RoundUnlocked) {
      ctx.globalAlpha = 0.18;
    }
    ctx.fillStyle = "#6b6f74";
    ctx.fillRect(door.x, door.y, door.w, door.h);
    ctx.fillStyle = "#5a5e62";
    ctx.fillRect(door.x + 5, door.y + 8, door.w - 10, door.h - 8);
    ctx.restore();

    drawSpike(L);
    drawCrate();
    drawGreen();
    drawAirGreens();
    drawGrey();
    drawRed();
    drawButton(L);

    ctx.fillStyle = "#111214";
    ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);
    canvas.style.cursor = stage === 10 ? (drag.on ? "grabbing" : "grab") : "";

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

  function updateDoubleJumpSetting() {
    if (!doubleJumpBtn) return;
    doubleJumpBtn.textContent = doubleJumpEnabled ? "已开启" : "未解锁";
    doubleJumpBtn.classList.toggle("is-on", doubleJumpEnabled);
  }

  function closeSettings() {
    settingsOpen = false;
    if (settingsEl) settingsEl.hidden = true;
    if (doubleJumpPassEl) doubleJumpPassEl.hidden = true;
    if (doubleJumpInputEl) doubleJumpInputEl.blur();
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
  }

  function openSettings() {
    if (!settingsEl) return;
    if (selectOpen) closeSelect();
    settingsOpen = true;
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    settingsEl.hidden = false;
    if (doubleJumpPassEl) doubleJumpPassEl.hidden = true;
    updateDoubleJumpSetting();
  }

  function openDoubleJumpPassword() {
    if (!settingsOpen || !doubleJumpPassEl || !doubleJumpInputEl) return;
    if (doubleJumpEnabled) {
      doubleJumpEnabled = false;
      saveDoubleJump();
      updateDoubleJumpSetting();
      return;
    }
    doubleJumpPassEl.hidden = false;
    doubleJumpInputEl.value = "";
    doubleJumpInputEl.placeholder = "墙上的字…";
    doubleJumpInputEl.focus();
  }

  function tryUnlockDoubleJump() {
    var typed = doubleJumpInputEl
      ? String(doubleJumpInputEl.value || "").trim().toLowerCase()
      : "";
    if (typed === "davidchen") {
      doubleJumpEnabled = true;
      saveDoubleJump();
      updateDoubleJumpSetting();
      if (doubleJumpPassEl) doubleJumpPassEl.hidden = true;
      if (doubleJumpInputEl) doubleJumpInputEl.blur();
      return;
    }
    if (doubleJumpInputEl) {
      doubleJumpInputEl.value = "";
      doubleJumpInputEl.placeholder = "密码不对，再看看 Level 4 的墙…";
    }
  }

  function closeSelect() {
    selectOpen = false;
    if (selectEl) selectEl.hidden = true;
    if (selectInputEl) selectInputEl.blur();
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
  }

  function fillSelectChoices() {
    if (!selectChoicesEl || selectChoicesEl.childNodes.length) return;
    var html = "";
    var i;
    for (i = 0; i < STAGE_COUNT; i++) {
      html +=
        '<button type="button" class="platform-select__choice" data-stage="' +
        (i + 1) +
        '"><kbd>' +
        (i + 1) +
        "</kbd> " +
        STAGE_LABELS[i] +
        "</button>";
    }
    selectChoicesEl.innerHTML = html;
  }

  function showSelectMenu() {
    fillSelectChoices();
    if (selectPassEl) selectPassEl.hidden = true;
    if (selectMenuEl) selectMenuEl.hidden = false;
    if (selectInputEl) selectInputEl.blur();
  }

  function tryUnlockSelect() {
    var typed = selectInputEl ? String(selectInputEl.value || "").trim() : "";
    if (typed.toLowerCase() === "davidchen") {
      showSelectMenu();
      return;
    }
    if (selectInputEl) {
      selectInputEl.value = "";
      selectInputEl.placeholder = "不对，再看看墙上…";
    }
  }

  function openSelect() {
    if (!selectEl) return;
    if (settingsOpen) closeSettings();
    selectOpen = true;
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    selectEl.hidden = false;
    if (selectPassEl) selectPassEl.hidden = false;
    if (selectMenuEl) selectMenuEl.hidden = true;
    if (selectInputEl) {
      selectInputEl.value = "";
      selectInputEl.placeholder = "墙上的字…";
      window.setTimeout(function () {
        if (selectOpen && selectInputEl) selectInputEl.focus();
      }, 0);
    }
  }

  function onKeyDown(e) {
    if (!running) return;
    if (settingsOpen) {
      if (e.code === "KeyP") {
        closeSettings();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.code === "Escape") {
        if (doubleJumpPassEl && !doubleJumpPassEl.hidden) {
          doubleJumpPassEl.hidden = true;
          if (doubleJumpInputEl) doubleJumpInputEl.blur();
        } else {
          closeSettings();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (
        e.code === "Enter" &&
        doubleJumpPassEl &&
        !doubleJumpPassEl.hidden
      ) {
        tryUnlockDoubleJump();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (selectOpen) {
      if (e.code === "Escape") {
        closeSelect();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.code === "Enter" && selectPassEl && !selectPassEl.hidden) {
        tryUnlockSelect();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.code === "KeyP") {
      openSettings();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.code === "KeyY") {
      openSelect();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.code === "Space" && e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (setKey(e.code, true)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKeyUp(e) {
    if (!running) return;
    if (selectOpen || settingsOpen) return;
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
    doubleJumpEnabled = readDoubleJump();
    updateDoubleJumpSetting();
    setStage(readStage());
    if (!running) {
      running = true;
      lastTs = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function canvasPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  function hitPlayer(p) {
    var pad = 10;
    return (
      p.x >= player.x - pad &&
      p.x <= player.x + player.w + pad &&
      p.y >= player.y - pad &&
      p.y <= player.y + player.h + pad
    );
  }

  function onCanvasPointerDown(e) {
    if (
      !running ||
      stage !== 10 ||
      dead ||
      entering ||
      selectOpen ||
      settingsOpen
    ) return;
    var p = canvasPoint(e);
    if (!hitPlayer(p)) return;
    drag.on = true;
    drag.ox = p.x - player.x;
    drag.oy = p.y - player.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onCanvasPointerMove(e) {
    if (!drag.on) return;
    var p = canvasPoint(e);
    player.x = Math.max(-player.w * 0.4, Math.min(W - player.w * 0.6, p.x - drag.ox));
    player.y = Math.max(0, Math.min(H - player.h * 0.25, p.y - drag.oy));
    player.vx = 0;
    player.vy = 0;
    e.preventDefault();
  }

  function endDrag() {
    drag.on = false;
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    keys.left = keys.right = keys.jump = false;
    endDrag();
    closeSelect();
    closeSettings();
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
  if (firstBtn) {
    firstBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (running && !entering) setStage(1);
    });
  }
  if (selectChoicesEl) {
    selectChoicesEl.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-stage]");
      if (!btn) return;
      var n = parseInt(btn.getAttribute("data-stage"), 10);
      if (n >= 1 && n <= STAGE_COUNT) {
        closeSelect();
        setStage(n);
      }
    });
  }
  if (doubleJumpBtn) {
    doubleJumpBtn.addEventListener("dblclick", function (e) {
      e.preventDefault();
      openDoubleJumpPassword();
    });
  }
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  bindPad();

  window.PlatformMinigame = {
    start: start,
    stop: stop,
    hide: hideViews,
  };
})();

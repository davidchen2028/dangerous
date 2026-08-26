/**
 * 大厅小游戏 2 — Level Devil 风格平台：天空 + 灰地板。
 * 1 蓝箱演示 → 2 三刺挤一起 → 3 前中后三刺 → 4 中间裂开 → 5 裂开 + 木箱
 * → 6 门搬家 + 绿箱 → 7 前中后三缝 → 8 原三缝陷阱 → 9 原中刺变缝
 * → 10 双向升级版中刺变缝 → 11 三缝四波陷阱
 * → 12 巨大缝，鼠标拖到门边再走进去。
 * 死亡只重开当前关。刷新保留关卡进度，左上角可回第一关。
 */
(function () {
  var STAGE_COUNT = 12;
  var STAGE_KEY = "jiwei_minigame2_stage";
  var STAGE_LAYOUT_KEY = "jiwei_minigame2_stage_layout_v2";
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
  var trapBuilderEl = document.getElementById("trapBuilder");
  var trapBuilderPaletteEl = document.getElementById("trapBuilderPalette");
  var trapBuilderTimelineEl = document.getElementById("trapBuilderTimeline");
  var trapBuilderEmptyEl = document.getElementById("trapBuilderEmpty");
  var trapBuilderStartEl = document.getElementById("trapBuilderStart");
  var trapBuilderClearEl = document.getElementById("trapBuilderClear");
  var trapPlaybackControlsEl = document.getElementById("trapPlaybackControls");
  var trapPlaybackReplayEl = document.getElementById("trapPlaybackReplay");
  var trapPlaybackEditEl = document.getElementById("trapPlaybackEdit");
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
  var player = {
    x: 0, y: 0, w: 22, h: 34, vx: 0, vy: 0, onGround: false,
    facing: 1, anim: "idle", animT: 0, walkPhase: 0
  };
  var playerSprites = {
    idle: new Image(),
    walkA: new Image(),
    walkB: new Image(),
    jump: new Image(),
    loaded: 0,
    allLoaded: false
  };
  function markSpriteLoaded() {
    playerSprites.loaded += 1;
    if (playerSprites.loaded >= 4) playerSprites.allLoaded = true;
  }
  playerSprites.idle.onload = markSpriteLoaded;
  playerSprites.walkA.onload = markSpriteLoaded;
  playerSprites.walkB.onload = markSpriteLoaded;
  playerSprites.jump.onload = markSpriteLoaded;
  function markSpriteError() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[platform-minigame] player sprite failed to load");
    }
  }
  playerSprites.idle.onerror = markSpriteError;
  playerSprites.walkA.onerror = markSpriteError;
  playerSprites.walkB.onerror = markSpriteError;
  playerSprites.jump.onerror = markSpriteError;
  playerSprites.idle.src = "img/platform-player/character_beige_idle.png";
  playerSprites.walkA.src = "img/platform-player/character_beige_walk_a.png";
  playerSprites.walkB.src = "img/platform-player/character_beige_walk_b.png";
  playerSprites.jump.src = "img/platform-player/character_beige_jump.png";
  var sceneSprites = {
    sky: new Image(),
    brick: new Image(),
    brickBrown: new Image(),
    surface: new Image(),
    spikes: new Image(),
    plank: new Image(),
    green: new Image(),
    red: new Image(),
    blue: new Image(),
    plant124: new Image(),
    plant125: new Image(),
    plant128: new Image(),
    loaded: 0,
    allLoaded: false
  };
  function markSceneLoaded() {
    sceneSprites.loaded += 1;
    if (sceneSprites.loaded >= 12) sceneSprites.allLoaded = true;
  }
  function markSceneError() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[platform-minigame] scene sprite failed to load");
    }
  }
  [sceneSprites.sky, sceneSprites.brick, sceneSprites.brickBrown,
   sceneSprites.surface, sceneSprites.spikes, sceneSprites.plank,
   sceneSprites.green, sceneSprites.red, sceneSprites.blue,
   sceneSprites.plant124, sceneSprites.plant125, sceneSprites.plant128
  ].forEach(function (img) {
    img.onload = markSceneLoaded;
    img.onerror = markSceneError;
  });
  sceneSprites.sky.src = "img/platform-scene/background_clouds.png";
  sceneSprites.brick.src = "img/platform-scene/brick_grey.png";
  sceneSprites.brickBrown.src = "img/platform-scene/tile_dirt.png";
  sceneSprites.surface.src = "img/platform-scene/tile_surface.png";
  sceneSprites.spikes.src = "img/platform-scene/block_spikes.png";
  sceneSprites.plank.src = "img/platform-scene/block_plank.png";
  sceneSprites.green.src = "img/platform-scene/block_green.png";
  sceneSprites.red.src = "img/platform-scene/block_red.png";
  sceneSprites.blue.src = "img/platform-scene/block_blue.png";
  sceneSprites.plant124.src = "img/platform-scene/tile_0124.png";
  sceneSprites.plant125.src = "img/platform-scene/tile_0125.png";
  sceneSprites.plant128.src = "img/platform-scene/tile_0128.png";
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
  var old8FloorGone = false;
  var old9SideOn = false;
  var old9BecameGap = false;
  var old9GapTimer = -1;
  var old9Red = {
    active: false,
    spawned: false,
    x: 0,
    y: 0,
    w: 28,
    h: 22,
    vx: 0,
  };
  var s8Wave = 0;
  var s8Phase = 0;
  var s8WaveQueue = [];
  var s8WaveTimer = -1;
  var s8VanishedPlatforms = [false, false, false, false];
  var s8ButtonContacts = [false, false, false, false];
  var s8SpikeRain = {
    active: false,
    done: false,
    y: 0,
    vy: 0,
    h: 20,
    gapX: 0,
    gapW: 24,
    landedFor: 0,
  };
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
  var blueCrates = [];
  var selectOpen = false;
  var trapChordIndex = 0;
  var trapMode = "off";
  var trapTimeline = [];
  var trapPlaybackIndex = -1;
  var trapPlaybackTimer = -1;
  var trapPlaybackComplete = false;
  var trapDead = false;
  var trapDeadT = 0;
  var trapShake = 0;
  var trapPlayer = {
    x: 0,
    y: 0,
    w: 22,
    h: 34,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    anim: "idle",
    animT: 0,
    walkPhase: 0,
  };
  var trapAirJumps = 0;
  var trapWoods = [];
  var trapGreens = [];
  var trapReds = [];
  var trapBlues = [];
  var trapSpikeRows = [];
  var TRAP_LABELS = {
    wood: "木箱",
    green: "绿箱",
    red: "红箱",
    blue: "蓝箱",
    spikes: "刺雨",
  };
  var STAGE_LABELS = [
    "第 1 关 · 蓝箱演示",
    "第 2 关 · 三刺挤一起",
    "第 3 关 · 前中后刺",
    "第 4 关 · 中间裂开",
    "第 5 关 · 木箱",
    "第 6 关 · 门搬家",
    "第 7 关 · 三缝",
    "第 8 关 · 三缝陷阱",
    "第 9 关 · 原中刺变缝",
    "第 10 关 · 双向中刺变缝",
    "第 11 关 · 三缝四波陷阱",
    "第 12 关 · 大缝",
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
  var RUN_SPEED_THRESHOLD = 8;
  var RUN_FRAME_DURATION = 0.1;

  function layout() {
    var pathH = Math.round(H * 0.26);
    // Keep the visual floor and the playable bounds aligned across the full viewport.
    var pathX = 0;
    var pathW = W;
    var pathY = Math.round(H * 0.62);
    return { pathX: pathX, pathY: pathY, pathW: pathW, pathH: pathH };
  }

  // Fixed decorative groups keep the route readable and avoid each stage's hazards.
  var SURFACE_PLANTS = {
    1: [[0.16, "124"], [0.21, "125"], [0.42, "128"], [0.68, "124"], [0.73, "125"]],
    2: [[0.11, "124"], [0.16, "125"], [0.35, "128"], [0.68, "124"], [0.73, "128"]],
    3: [[0.11, "125"], [0.16, "124"], [0.38, "128"], [0.63, "124"], [0.84, "125"]],
    4: [[0.11, "124"], [0.17, "125"], [0.38, "128"], [0.68, "124"], [0.84, "128"]],
    5: [[0.11, "125"], [0.17, "124"], [0.38, "128"], [0.68, "125"], [0.84, "124"]],
    6: [[0.11, "124"], [0.17, "128"], [0.38, "125"], [0.64, "124"], [0.82, "128"]],
    7: [[0.10, "124"], [0.16, "125"], [0.37, "128"], [0.63, "124"], [0.85, "125"]],
    8: [[0.10, "125"], [0.34, "124"], [0.73, "128"], [0.84, "124"]],
    9: [[0.11, "124"], [0.19, "125"], [0.38, "128"], [0.68, "124"], [0.84, "125"]],
    10: [[0.11, "125"], [0.19, "124"], [0.38, "128"], [0.68, "125"], [0.84, "128"]],
    11: [[0.10, "124"], [0.34, "125"], [0.73, "128"], [0.84, "124"]],
    12: [[0.09, "124"], [0.17, "125"], [0.83, "128"], [0.91, "124"]],
  };

  function surfacePlants() {
    return SURFACE_PLANTS[stage] || [];
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
    if (stage === 8 || stage === 11) return [0.2, 0.42, 0.62];
    if (stage === 9 && old9BecameGap) return [0.5];
    if (stage === 10 && s9BecameGap) return [0.5];
    if (stage === 12) return [0.5];
    if (stage === 4 || stage === 5 || stage === 6) return [0.5];
    return [];
  }

  function gapBoxAt(L, t) {
    var gw =
      stage === 12
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
    if (stage === 9 && !old9BecameGap) {
      if (old9SideOn) {
        return [{ t: 0.48, count: 1 }, { t: 0.5, count: 1 }, { t: 0.52, count: 1 }];
      }
      return [{ t: 0.5, count: 1 }];
    }
    if (stage === 10 && !s9BecameGap) {
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
      if (window.localStorage.getItem(STAGE_LAYOUT_KEY) !== "1") {
        if (n === 8) n = 11;
        else if (n === 9) n = 10;
        else if (n === 10) n = 12;
        window.localStorage.setItem(STAGE_LAYOUT_KEY, "1");
        if (n >= 1 && n <= STAGE_COUNT) {
          window.localStorage.setItem(STAGE_KEY, String(n));
        }
      }
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
    old8FloorGone = false;
    old9SideOn = false;
    old9BecameGap = false;
    old9GapTimer = -1;
    old9Red.active = false;
    old9Red.spawned = false;
    old9Red.vx = 0;
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
    crack.armed = stage >= 4 && stage <= 12;
    crack.open = stage === 8 || stage === 11 || stage === 12;
    gapStates = gapSlots().map(function () {
      return { open: stage === 8 || stage === 11 || stage === 12 };
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
    s8Wave = 0;
    s8Phase = 0;
    s8WaveQueue = [];
    s8WaveTimer = -1;
    s8VanishedPlatforms = [false, false, false, false];
    s8ButtonContacts = [false, false, false, false];
    s8SpikeRain.active = false;
    s8SpikeRain.done = false;
    s8SpikeRain.landedFor = 0;
    redCrates = [];
    airGreenCrates = [];
    blueCrates = [];
    if (stage === 1) spawnBlue(L, -1);
    if (stage === 11) {
      startStage8Wave(1);
      s8ButtonContacts = stage8RedButtons(L).map(function (button) {
        return overlaps(player, stage8ButtonHitBox(button));
      });
    }
    if (stage === 9 || stage === 10) {
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

  function stage8Platforms(L) {
    var gaps = listGaps(L);
    if (gaps.length < 3) return [];
    var right = L.pathX + L.pathW;
    return [
      { x: L.pathX, w: gaps[0].x - L.pathX },
      {
        x: gaps[0].x + gaps[0].w,
        w: gaps[1].x - (gaps[0].x + gaps[0].w),
      },
      {
        x: gaps[1].x + gaps[1].w,
        w: gaps[2].x - (gaps[1].x + gaps[1].w),
      },
      {
        x: gaps[2].x + gaps[2].w,
        w: right - (gaps[2].x + gaps[2].w),
      },
    ];
  }

  function stage8RedButtons(L) {
    if (stage !== 11) return [];
    var platforms = stage8Platforms(L);
    var bw = Math.max(22, Math.round(player.w * 1.2));
    var bh = Math.max(8, Math.round(player.h * 0.2));
    return platforms.map(function (platform, index) {
      return {
        index: index,
        x: platform.x + platform.w * 0.5 - bw * 0.5,
        y: L.pathY - bh,
        w: bw,
        h: bh,
      };
    });
  }

  function stage8ButtonHitBox(button) {
    var scale = 0.7;
    var w = button.w * scale;
    var h = button.h * scale;
    return {
      x: button.x + (button.w - w) * 0.5,
      y: button.y + (button.h - h) * 0.5,
      w: w,
      h: h,
    };
  }

  function originalStage8Button(L) {
    if (stage !== 8 || old8FloorGone) return null;
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

  function stage8ProgressBox(L, kind) {
    var platforms = stage8Platforms(L);
    var index = kind === "fake1" ? 1 : kind === "green" ? 2 : 3;
    var platform = platforms[index];
    if (!platform) return null;
    if (kind === "green") {
      var bw = Math.max(24, Math.round(player.w * 1.25));
      var bh = Math.max(8, Math.round(player.h * 0.22));
      return {
        x: platform.x + platform.w * 0.7 - bw * 0.5,
        y: L.pathY - bh,
        w: bw,
        h: bh,
      };
    }
    var door = portalBox(L);
    return {
      x: platform.x + platform.w * (kind === "fake1" ? 0.72 : 0.28) - door.w * 0.5,
      y: L.pathY - door.h,
      w: door.w,
      h: door.h,
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

  /** 第 10 关后两波会从门的另一边回来，因此木箱按飞行方向从场地边缘出现。 */
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

  function spawnBlue(L, dir) {
    var direction = dir < 0 ? -1 : 1;
    var w = Math.max(22, Math.round(player.h * 0.78));
    var h = Math.max(12, Math.round(player.h * 0.4));
    blueCrates.push({
      x: direction < 0 ? L.pathX + L.pathW - w : L.pathX,
      y: L.pathY - player.h - Math.round(H * 0.035),
      w: w,
      h: h,
      vx: direction * W * 0.52,
    });
  }

  function stage8WaveSpec(wave) {
    var specs = [
      { red: 2, green: 1, blue: 0 },
      { red: 4, green: 2, blue: 0 },
      { red: 8, green: 6, blue: 5 },
      { red: 7, green: 15, blue: 15 },
    ];
    return specs[Math.max(0, Math.min(specs.length - 1, wave - 1))];
  }

  function makeStage8Wave(wave) {
    var spec = stage8WaveSpec(wave);
    var queue = [];
    var redCount = spec.red;
    var greenCount = spec.green;
    var blueCount = spec.blue;
    while (redCount > 0 || greenCount > 0 || blueCount > 0) {
      if (redCount > 0) {
        queue.push("red");
        redCount -= 1;
      }
      if (greenCount > 0) {
        queue.push("green");
        greenCount -= 1;
      }
      if (blueCount > 0) {
        queue.push("blue");
        blueCount -= 1;
      }
    }
    return queue;
  }

  function startStage8Wave(wave) {
    s8Wave = wave;
    s8Phase = wave * 2 - 1;
    s8WaveQueue = makeStage8Wave(wave);
    s8WaveTimer = 0;
    redCrates = [];
    airGreenCrates = [];
    blueCrates = [];
    s8SpikeRain.active = false;
    s8SpikeRain.done = false;
    s8SpikeRain.landedFor = 0;
  }

  function startStage8SpikeRain(L) {
    s8SpikeRain.active = true;
    s8SpikeRain.done = false;
    s8SpikeRain.h = Math.max(18, Math.round(H * 0.045));
    s8SpikeRain.y = -s8SpikeRain.h;
    s8SpikeRain.vy = H * 0.82;
    s8SpikeRain.gapW = Math.max(player.w * 1.12, 20);
    s8SpikeRain.gapX = Math.max(
      L.pathX,
      Math.min(
        L.pathX + L.pathW - s8SpikeRain.gapW,
        player.x + player.w * 0.5 - s8SpikeRain.gapW * 0.5
      )
    );
    s8SpikeRain.landedFor = 0;
    shake = 6;
  }

  function updateStage8SpikeRain(dt, L) {
    if (!s8SpikeRain.active) return;
    var floorY = L.pathY - s8SpikeRain.h;
    if (s8SpikeRain.y < floorY) {
      s8SpikeRain.vy += H * 1.25 * dt;
      s8SpikeRain.y = Math.min(
        floorY,
        s8SpikeRain.y + s8SpikeRain.vy * dt
      );
    } else {
      s8SpikeRain.landedFor += dt;
    }

    var left = {
      x: L.pathX,
      y: s8SpikeRain.y,
      w: Math.max(0, s8SpikeRain.gapX - L.pathX),
      h: s8SpikeRain.h,
    };
    var rightX = s8SpikeRain.gapX + s8SpikeRain.gapW;
    var right = {
      x: rightX,
      y: s8SpikeRain.y,
      w: Math.max(0, L.pathX + L.pathW - rightX),
      h: s8SpikeRain.h,
    };
    if ((left.w > 0 && overlaps(player, left)) || (right.w > 0 && overlaps(player, right))) {
      die();
      return;
    }
    if (s8SpikeRain.y >= floorY && s8SpikeRain.landedFor >= 0.18) {
      s8SpikeRain.active = false;
      s8SpikeRain.done = true;
      shake = 7;
    }
  }

  function stage9WaveSpec(wave) {
    var specs = [
      { red: 2, green: 1, interval: 0.75 },
      { red: 4, green: 2, interval: 1.0 },
      { red: 8, green: 6, interval: 1.25 },
    ];
    return specs[Math.max(0, Math.min(specs.length - 1, wave - 1))];
  }

  /** 红箱间隔随机，约 22% 会和下一个红箱叠在同一帧。 */
  function stage9RedDelay() {
    var base = stage9WaveSpec(s9WoodWave).interval;
    if (Math.random() < 0.22) return 0;
    return 0.08 + Math.random() * (base + 0.28);
  }

  function spawnStage9Hazard(L, hazard) {
    if (hazard === "red") spawnRed(L, s9WaveDirection);
    else spawnAirGreen(L);
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

  function trapDelayText(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) n = 0.75;
    return String(Math.round(n * 100) / 100);
  }

  function trapDelayValue(value) {
    if (String(value == null ? "" : value).trim() === "") return 0.75;
    var n = Number(value);
    return isFinite(n) && n >= 0 ? n : 0.75;
  }

  function renderTrapTimeline() {
    if (!trapBuilderTimelineEl) return;
    var html = "";
    for (var i = 0; i < trapTimeline.length; i++) {
      var item = trapTimeline[i];
      html +=
        '<div class="trap-timeline-card trap-card--' +
        item.kind +
        '"><span>' +
        TRAP_LABELS[item.kind] +
        "</span></div>";
      if (i < trapTimeline.length - 1) {
        html +=
          '<button type="button" class="trap-timeline-arrow" data-trap-arrow="' +
          i +
          '" aria-label="设置出场间隔"><span>' +
          trapDelayText(item.delay) +
          "s</span></button>";
      }
    }
    trapBuilderTimelineEl.innerHTML = html;
    if (trapBuilderEmptyEl) trapBuilderEmptyEl.hidden = trapTimeline.length > 0;
    if (trapBuilderStartEl) trapBuilderStartEl.disabled = trapTimeline.length === 0;
  }

  function addTrapTimelineItem(kind) {
    if (!TRAP_LABELS[kind]) return;
    trapTimeline.push({ kind: kind, delay: 0.75 });
    renderTrapTimeline();
    if (trapBuilderTimelineEl) {
      trapBuilderTimelineEl.scrollLeft = trapBuilderTimelineEl.scrollWidth;
    }
  }

  function editTrapTimelineDelay(button, index) {
    if (!button || !trapTimeline[index]) return;
    button.innerHTML =
      '<input class="trap-timeline-interval" type="number" min="0" step="0.05" ' +
      'inputmode="decimal" aria-label="间隔秒数" value="' +
      trapDelayText(trapTimeline[index].delay) +
      '">';
    var input = button.querySelector("input");
    if (!input) return;
    input.focus();
    input.select();
  }

  function commitTrapTimelineDelay(input) {
    if (!input) return;
    var button = input.closest("[data-trap-arrow]");
    if (!button) return;
    var index = parseInt(button.getAttribute("data-trap-arrow"), 10);
    if (!trapTimeline[index]) return;
    trapTimeline[index].delay = trapDelayValue(input.value);
    renderTrapTimeline();
  }

  function openTrapBuilder() {
    if (!trapBuilderEl || !running) return;
    closeSelect();
    closeSettings();
    trapMode = "editor";
    trapChordIndex = 0;
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    trapBuilderEl.hidden = false;
    if (trapPlaybackControlsEl) trapPlaybackControlsEl.hidden = true;
    renderTrapTimeline();
  }

  function clearTrapPlayback() {
    trapWoods = [];
    trapGreens = [];
    trapReds = [];
    trapBlues = [];
    trapSpikeRows = [];
    trapPlaybackIndex = -1;
    trapPlaybackTimer = -1;
    trapPlaybackComplete = false;
    trapDead = false;
    trapDeadT = 0;
    trapShake = 0;
  }

  function closeTrapBuilder() {
    trapMode = "off";
    trapChordIndex = 0;
    clearTrapPlayback();
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    if (trapBuilderEl) trapBuilderEl.hidden = true;
    if (trapPlaybackControlsEl) trapPlaybackControlsEl.hidden = true;
  }

  function showTrapEditor() {
    clearTrapPlayback();
    trapMode = "editor";
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    if (trapBuilderEl) trapBuilderEl.hidden = false;
    if (trapPlaybackControlsEl) trapPlaybackControlsEl.hidden = true;
    renderTrapTimeline();
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function vanishedOverlap(x, w, L) {
    if (stage === 8 && old8FloorGone) {
      var oldGaps = listGaps(L);
      if (!oldGaps[2]) return 0;
      var oldLeft = oldGaps[2].x + oldGaps[2].w;
      var oldRight = L.pathX + L.pathW + 24;
      return Math.max(
        0,
        Math.min(x + w, oldRight) - Math.max(x, oldLeft)
      );
    }
    if (stage !== 11) return 0;
    var platforms = stage8Platforms(L);
    var total = 0;
    for (var i = 0; i < platforms.length; i++) {
      if (!s8VanishedPlatforms[i]) continue;
      total += Math.max(
        0,
        Math.min(x + w, platforms[i].x + platforms[i].w) -
          Math.max(x, platforms[i].x)
      );
    }
    return total;
  }

  function listOpenHoles(L) {
    var holes = [];
    var gaps = listGaps(L);
    var i;
    for (i = 0; i < gaps.length; i++) {
      if (gaps[i].open) holes.push({ x: gaps[i].x, w: gaps[i].w });
    }
    if (stage === 8 && old8FloorGone && gaps[2]) {
      holes.push({
        x: gaps[2].x + gaps[2].w,
        w: L.pathX + L.pathW - (gaps[2].x + gaps[2].w),
      });
    }
    if (stage === 11) {
      var platforms = stage8Platforms(L);
      for (i = 0; i < platforms.length; i++) {
        if (s8VanishedPlatforms[i]) {
          holes.push({ x: platforms[i].x, w: platforms[i].w });
        }
      }
    }
    return holes;
  }

  function nearestOpenHole(L) {
    var holes = listOpenHoles(L);
    if (!holes.length) return null;
    var mid = player.x + player.w * 0.5;
    var best = holes[0];
    var bestDist = Infinity;
    var i;
    for (i = 0; i < holes.length; i++) {
      var hole = holes[i];
      var dist;
      if (mid >= hole.x && mid <= hole.x + hole.w) dist = 0;
      else {
        dist = Math.min(
          Math.abs(mid - hole.x),
          Math.abs(mid - (hole.x + hole.w))
        );
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = hole;
      }
    }
    return best;
  }

  function pushPlayerIntoHole(L, hole) {
    if (!hole) return;
    if (hole.w >= player.w) {
      player.x = hole.x + (hole.w - player.w) * 0.5;
    } else {
      player.x = hole.x + hole.w * 0.5 - player.w * 0.5;
    }
    player.onGround = false;
    if (player.vy < H * 0.35) player.vy = H * 0.35;
  }

  /** 脚已低于台面且身体叠在实心地板上：立刻推进最近的缝，避免卡在地板里。 */
  function ejectIfEmbeddedInFloor(L) {
    var feet = player.y + player.h;
    if (feet <= L.pathY + 2) return;
    if (player.y >= L.pathY + L.pathH) return;
    var solid = player.w - gapOverlap(player.x, player.w, L);
    if (solid <= player.w * 0.28) return;
    pushPlayerIntoHole(L, nearestOpenHole(L));
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
    if (player.y + player.h <= L.pathY + 2) return;
    var holes = listOpenHoles(L);
    var mid = player.x + player.w * 0.5;
    var i;
    for (i = 0; i < holes.length; i++) {
      var g = holes[i];
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
    if (stage === 11 && s8Phase !== 8) return;
    if (stage === 10) {
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

  function updateOriginalStage8(dt, L, justJumped) {
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

    var btn = originalStage8Button(L);
    if (btn && player.onGround && overlaps(player, btn)) {
      old8FloorGone = true;
      shake = 10;
      player.onGround = false;
      if (player.vy < H * 0.25) player.vy = H * 0.25;
    }
  }

  function becomeOriginalStage9Gap(L) {
    old9BecameGap = true;
    old9SideOn = false;
    old9GapTimer = -1;
    grey.active = false;
    spike.armed = false;
    spikeStates = [];
    crack.armed = true;
    crack.open = true;
    gapStates = [{ open: true }];
    shake = 8;
  }

  function spawnOriginalStage9Red(L) {
    var door = portalBox(L);
    old9Red.active = true;
    old9Red.spawned = true;
    old9Red.w = Math.max(18, Math.round(player.h * 0.62));
    old9Red.h = Math.max(10, Math.round(player.h * 0.36));
    old9Red.x = door.x - old9Red.w * 0.1;
    old9Red.y = L.pathY - old9Red.h;
    old9Red.vx = -W * 0.5;
  }

  function updateOriginalStage9Red(dt, L) {
    if (!old9Red.active) return;
    old9Red.x += old9Red.vx * dt;
    if (
      overlaps(player, old9Red) &&
      player.y + player.h > old9Red.y + 2
    ) {
      die();
      return;
    }
    if (old9Red.x + old9Red.w < L.pathX - 40) old9Red.active = false;
  }

  function updateOriginalStage9Grey(dt, L) {
    if (old9GapTimer >= 0) {
      old9GapTimer -= dt;
      if (old9GapTimer <= 0) becomeOriginalStage9Gap(L);
    }
    if (!grey.active) return;
    grey.x += grey.vx * dt;
    if (overlaps(player, grey)) {
      placePlayer(L);
      grey.active = false;
      old9GapTimer = 0.3;
      shake = 8;
      return;
    }
    if (grey.x + grey.w < L.pathX - 40) grey.active = false;
  }

  function updateOriginalStage9(dt, L, justJumped) {
    if (!old9BecameGap) {
      var midX = L.pathX + L.pathW * 0.5;
      var overSpike =
        !player.onGround &&
        player.x + player.w > midX - player.w &&
        player.x < midX + player.w &&
        player.y + player.h < L.pathY - 6;
      if (overSpike && !old9SideOn) {
        old9SideOn = true;
        spikeStates = [
          { shown: true, h: spike.maxH },
          { shown: true, h: spike.maxH },
          { shown: true, h: spike.maxH },
        ];
        shake = 7;
      }
      var rightX = L.pathX + L.pathW * 0.52;
      if (old9SideOn && !grey.spawned && player.x >= rightX + 4) {
        spawnGrey(L);
      }
      updateOriginalStage9Grey(dt, L);
      return;
    }

    var g = gapBox(L);
    if (!green.started && atGapFrontOf(L, g, "left")) spawnGreen(L, g);
    updateGreen(dt, L, justJumped);
    if (dead) return;
    if (green.landed && !old9Red.spawned) spawnOriginalStage9Red(L);
    if (justJumped && green.landed && atGapFrontOf(L, g, "left")) {
      woodArmed = true;
    }
    if (
      woodArmed &&
      player.x >= g.x + g.w * 0.55 &&
      !crate.cancelled &&
      !crate.active
    ) {
      spawnCrate(L, -1);
    }
    var atFront = atGapFrontOf(L, g, "left");
    if (!crate.cancelled && atFront && green.landed) {
      waitAtGap += dt;
      if (waitAtGap >= 1) {
        crate.cancelled = true;
        crate.active = false;
      }
    } else if (!crate.cancelled && !atFront) {
      waitAtGap = 0;
    }
    moveCrate(dt, L, g);
    updateOriginalStage9Red(dt, L);
  }

  function updateStage8(dt, L, justJumped) {
    var buttons = stage8RedButtons(L);
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var hitBox = stage8ButtonHitBox(button);
      var touching = overlaps(player, hitBox);
      if (
        !s8VanishedPlatforms[button.index] &&
        !s8ButtonContacts[button.index] &&
        touching &&
        player.onGround &&
        player.y + player.h <= L.pathY + 2
      ) {
        s8VanishedPlatforms[button.index] = true;
        shake = 10;
        player.onGround = false;
        if (player.vy < H * 0.25) player.vy = H * 0.25;
      }
      s8ButtonContacts[button.index] = touching;
    }

    if (s8WaveQueue.length > 0) {
      s8WaveTimer -= dt;
      if (s8WaveTimer <= 0) {
        var hazard = s8WaveQueue.shift();
        if (hazard === "red") spawnRed(L, -1);
        else if (hazard === "green") spawnAirGreen(L);
        else spawnBlue(L, -1);
        s8WaveTimer = s8WaveQueue.length ? 0.75 : -1;
      }
    }

    updateRed(dt, L);
    if (dead) return;
    updateAirGreen(dt, L);
    if (dead) return;
    updateBlue(dt, L);
    if (dead) return;

    var waveDone =
      s8WaveQueue.length === 0 &&
      redCrates.length === 0 &&
      airGreenCrates.length === 0 &&
      blueCrates.length === 0;
    if (s8Phase % 2 === 1 && waveDone) {
      if (!s8SpikeRain.active && !s8SpikeRain.done) {
        startStage8SpikeRain(L);
      }
      updateStage8SpikeRain(dt, L);
      if (dead || s8SpikeRain.active) return;
      if (s8SpikeRain.done) {
        s8Phase += 1;
        shake = 5;
      }
    }

    var trigger = null;
    if (s8Phase === 2) trigger = stage8ProgressBox(L, "fake1");
    else if (s8Phase === 4) trigger = stage8ProgressBox(L, "green");
    else if (s8Phase === 6) trigger = stage8ProgressBox(L, "fake2");
    if (!trigger) return;

    var pad = player.w * 1.75;
    var nearTrigger = overlaps(player, {
      x: trigger.x - pad,
      y: trigger.y,
      w: trigger.w + pad * 2,
      h: trigger.h,
    });
    if (s8Phase === 4) nearTrigger = player.onGround && overlaps(player, trigger);
    if (nearTrigger) {
      startStage8Wave(s8Phase === 2 ? 2 : s8Phase === 4 ? 3 : 4);
      shake = 8;
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
      stage === 10 &&
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

  function updateBlue(dt, L) {
    var kept = [];
    for (var i = 0; i < blueCrates.length; i++) {
      var box = blueCrates[i];
      box.x += box.vx * dt;
      if (overlaps(player, box)) {
        die();
        return;
      }
      var outsideLeft = box.x + box.w < L.pathX - 40;
      var outsideRight = box.x > L.pathX + L.pathW + 40;
      if (!outsideLeft && !outsideRight) kept.push(box);
    }
    blueCrates = kept;
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
        spawnStage9Hazard(L, hazard);
        if (
          hazard === "red" &&
          s9WaveQueue[0] === "red" &&
          Math.random() < 0.38
        ) {
          spawnStage9Hazard(L, s9WaveQueue.shift());
        }
        if (!s9WaveQueue.length) {
          s9WaveTimer = -1;
          if (s9WoodWave === 3) s9WaitLastRed = true;
        } else if (s9WaveQueue[0] === "red") {
          s9WaveTimer = stage9RedDelay();
        } else {
          s9WaveTimer = stage9WaveSpec(s9WoodWave).interval;
        }
      }
    }
    updateRed(dt, L);
    if (dead) return;
    updateAirGreen(dt, L);
  }

  function updateWaitAndCrate(dt, L, justJumped) {
    if (stage === 1) {
      updateBlue(dt, L);
      return;
    }
    if (stage === 8) {
      updateOriginalStage8(dt, L, justJumped);
      return;
    }
    if (stage === 9) {
      updateOriginalStage9(dt, L, justJumped);
      return;
    }
    if (stage === 11) {
      updateStage8(dt, L, justJumped);
      return;
    }
    if (stage === 10) {
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

  function placeTrapPlayer(L) {
    trapPlayer.w = Math.max(16, Math.round(H * 0.045));
    trapPlayer.h = Math.max(26, Math.round(H * 0.07));
    trapPlayer.x = L.pathX + Math.round(L.pathW * 0.045);
    trapPlayer.y = L.pathY - trapPlayer.h;
    trapPlayer.vx = 0;
    trapPlayer.vy = 0;
    trapPlayer.onGround = true;
    trapAirJumps = 0;
  }

  function spawnTrapHazard(kind, L) {
    var size = trapPlayer.h;
    if (kind === "wood") {
      trapWoods.push({
        x: L.pathX + L.pathW - size,
        y: L.pathY - size,
        w: size,
        h: size,
        vx: -W * 0.55,
      });
    } else if (kind === "green") {
      trapGreens.push({
        x: trapPlayer.x + trapPlayer.w * 0.5 - size * 0.5,
        y: 6,
        w: size,
        h: size,
        vy: H * 0.72,
      });
    } else if (kind === "red") {
      var redW = Math.max(18, Math.round(trapPlayer.h * 0.62));
      var redH = Math.max(10, Math.round(trapPlayer.h * 0.36));
      trapReds.push({
        x: L.pathX + L.pathW - redW,
        y: L.pathY - redH,
        w: redW,
        h: redH,
        vx: -W * 0.5,
      });
    } else if (kind === "blue") {
      var blueW = Math.max(22, Math.round(trapPlayer.h * 0.78));
      var blueH = Math.max(12, Math.round(trapPlayer.h * 0.4));
      trapBlues.push({
        x: L.pathX + L.pathW - blueW,
        y: L.pathY - trapPlayer.h - Math.round(H * 0.035),
        w: blueW,
        h: blueH,
        vx: -W * 0.52,
      });
    } else if (kind === "spikes") {
      var spikeH = Math.max(18, Math.round(H * 0.045));
      var gapW = Math.max(trapPlayer.w * 1.12, 20);
      trapSpikeRows.push({
        y: -spikeH,
        vy: H * 0.82,
        h: spikeH,
        gapW: gapW,
        gapX: Math.max(
          L.pathX,
          Math.min(
            L.pathX + L.pathW - gapW,
            trapPlayer.x + trapPlayer.w * 0.5 - gapW * 0.5
          )
        ),
        landedFor: 0,
      });
    }
  }

  function dispatchTrapTimelineItem(index, L) {
    if (!trapTimeline[index]) return;
    trapPlaybackIndex = index;
    spawnTrapHazard(trapTimeline[index].kind, L);
    trapPlaybackTimer =
      index < trapTimeline.length - 1
        ? trapDelayValue(trapTimeline[index].delay)
        : -1;
  }

  function startTrapPlayback() {
    if (!trapTimeline.length) return;
    clearTrapPlayback();
    trapMode = "play";
    keys.left = keys.right = keys.jump = false;
    jumpQueued = false;
    if (trapBuilderEl) trapBuilderEl.hidden = true;
    if (trapPlaybackControlsEl) trapPlaybackControlsEl.hidden = true;
    var L = layout();
    placeTrapPlayer(L);
    dispatchTrapTimelineItem(0, L);
  }

  function killTrapPlayer() {
    if (trapDead) return;
    trapDead = true;
    trapDeadT = 0;
    trapShake = 10;
    keys.jump = false;
    jumpQueued = false;
  }

  function updateTrapSpikeRows(dt, L) {
    var kept = [];
    for (var i = 0; i < trapSpikeRows.length; i++) {
      var row = trapSpikeRows[i];
      var floorY = L.pathY - row.h;
      if (row.y < floorY) {
        row.vy += H * 1.25 * dt;
        row.y = Math.min(floorY, row.y + row.vy * dt);
      } else {
        row.landedFor += dt;
      }
      var left = {
        x: L.pathX,
        y: row.y,
        w: Math.max(0, row.gapX - L.pathX),
        h: row.h,
      };
      var rightX = row.gapX + row.gapW;
      var right = {
        x: rightX,
        y: row.y,
        w: Math.max(0, L.pathX + L.pathW - rightX),
        h: row.h,
      };
      if (
        (left.w > 0 && overlaps(trapPlayer, left)) ||
        (right.w > 0 && overlaps(trapPlayer, right))
      ) {
        killTrapPlayer();
        return;
      }
      if (!(row.y >= floorY && row.landedFor >= 0.18)) kept.push(row);
    }
    trapSpikeRows = kept;
  }

  function updateTrapHazards(dt, L) {
    var kept = [];
    var i;
    for (i = 0; i < trapWoods.length; i++) {
      var wood = trapWoods[i];
      wood.x += wood.vx * dt;
      if (overlaps(trapPlayer, wood)) {
        trapPlayer.x = wood.x - trapPlayer.w;
        trapPlayer.onGround = false;
        if (trapPlayer.vy < H * 0.12) trapPlayer.vy = H * 0.12;
      }
      if (wood.x + wood.w >= L.pathX - 40) kept.push(wood);
    }
    trapWoods = kept;

    kept = [];
    for (i = 0; i < trapGreens.length; i++) {
      var greenBox = trapGreens[i];
      greenBox.vy += Math.round(H * 3.2) * dt;
      greenBox.y += greenBox.vy * dt;
      if (overlaps(trapPlayer, greenBox)) {
        killTrapPlayer();
        return;
      }
      if (greenBox.y + greenBox.h < L.pathY) kept.push(greenBox);
    }
    trapGreens = kept;

    kept = [];
    for (i = 0; i < trapReds.length; i++) {
      var redBox = trapReds[i];
      redBox.x += redBox.vx * dt;
      if (
        overlaps(trapPlayer, redBox) &&
        trapPlayer.y + trapPlayer.h > redBox.y + 2
      ) {
        killTrapPlayer();
        return;
      }
      if (redBox.x + redBox.w >= L.pathX - 40) kept.push(redBox);
    }
    trapReds = kept;

    kept = [];
    for (i = 0; i < trapBlues.length; i++) {
      var blueBox = trapBlues[i];
      blueBox.x += blueBox.vx * dt;
      if (overlaps(trapPlayer, blueBox)) {
        killTrapPlayer();
        return;
      }
      if (blueBox.x + blueBox.w >= L.pathX - 40) kept.push(blueBox);
    }
    trapBlues = kept;
    updateTrapSpikeRows(dt, L);
  }

  function trapHazardsRemain() {
    return (
      trapWoods.length > 0 ||
      trapGreens.length > 0 ||
      trapReds.length > 0 ||
      trapBlues.length > 0 ||
      trapSpikeRows.length > 0
    );
  }

  function updateTrapPlayback(dt) {
    var L = layout();
    if (trapShake > 0) trapShake = Math.max(0, trapShake - dt * 28);
    if (trapDead) {
      trapDeadT += dt;
      if (trapDeadT >= 0.55) startTrapPlayback();
      return;
    }
    if (trapPlaybackTimer >= 0 && trapPlaybackIndex < trapTimeline.length - 1) {
      trapPlaybackTimer -= dt;
      while (
        trapPlaybackTimer <= 0 &&
        trapPlaybackIndex < trapTimeline.length - 1
      ) {
        var overshoot = -trapPlaybackTimer;
        dispatchTrapTimelineItem(trapPlaybackIndex + 1, L);
        if (trapPlaybackTimer >= 0) trapPlaybackTimer -= overshoot;
      }
    }

    var speed = Math.round(W * 0.38);
    var want = 0;
    if (keys.left) want -= 1;
    if (keys.right) want += 1;
    trapPlayer.vx = want * speed;
    if (want < 0) trapPlayer.facing = -1;
    else if (want > 0) trapPlayer.facing = 1;
    var prevFeet = trapPlayer.y + trapPlayer.h;
    trapPlayer.x += trapPlayer.vx * dt;
    trapPlayer.x = Math.max(
      L.pathX + 2,
      Math.min(L.pathX + L.pathW - trapPlayer.w - 2, trapPlayer.x)
    );

    if ((jumpQueued || keys.jump) && trapPlayer.onGround) {
      trapPlayer.vy = -Math.round(H * 0.68);
      trapPlayer.onGround = false;
      trapAirJumps = 0;
      jumpQueued = false;
    } else if (jumpQueued) {
      if (doubleJumpEnabled) {
        trapPlayer.vy = -Math.round(H * 0.68);
        trapAirJumps += 1;
      }
      jumpQueued = false;
    }
    trapPlayer.vy += Math.round(H * 3.8) * dt;
    trapPlayer.y += trapPlayer.vy * dt;
    var feet = trapPlayer.y + trapPlayer.h;
    if (
      prevFeet <= L.pathY + 1 &&
      trapPlayer.vy >= 0 &&
      feet >= L.pathY
    ) {
      trapPlayer.y = L.pathY - trapPlayer.h;
      trapPlayer.vy = 0;
      trapPlayer.onGround = true;
      trapAirJumps = 0;
    } else {
      trapPlayer.onGround = false;
    }

    updateTrapHazards(dt, L);
    if (
      !trapDead &&
      trapPlaybackIndex === trapTimeline.length - 1 &&
      !trapHazardsRemain()
    ) {
      trapPlaybackComplete = true;
      if (trapPlaybackControlsEl) trapPlaybackControlsEl.hidden = false;
    }
    deriveCharacterAnim(trapPlayer, dt);
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
      if (doubleJumpEnabled) {
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
    ejectIfEmbeddedInFloor(L);

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
      (stage !== 12 || keys.left || keys.right)
    ) {
      enterPortal();
    }
    deriveCharacterAnim(player, dt);
  }

  function drawSky() {
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.sky, 0, 0, W, H);
      return;
    }
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
      if (sceneSprites.allLoaded) {
        drawTile(sceneSprites.spikes, box.x, L.pathY - box.h, box.w, box.h);
        continue;
      }
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

  function drawWoodBox(tileImg, x, y, w, h, fill, slat, edge) {
    if (sceneSprites.allLoaded && tileImg) {
      drawTile(tileImg, x, y, w, h);
      return;
    }
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
      sceneSprites.plank,
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
      sceneSprites.green,
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
        sceneSprites.green,
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
        sceneSprites.red,
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

  function drawOriginalStage9Red() {
    if (!old9Red.active) return;
    drawWoodBox(
      sceneSprites.red,
      Math.round(old9Red.x),
      Math.round(old9Red.y),
      old9Red.w,
      old9Red.h,
      "#c43b32",
      "#9a2a24",
      "#6a1814"
    );
  }

  function drawBlue() {
    for (var i = 0; i < blueCrates.length; i++) {
      var box = blueCrates[i];
      drawWoodBox(
        sceneSprites.blue,
        Math.round(box.x),
        Math.round(box.y),
        box.w,
        box.h,
        "#287cc4",
        "#1d5f99",
        "#123f6b"
      );
    }
  }

  function drawGrey() {
    if (!grey.active) return;
    drawWoodBox(
      sceneSprites.brick,
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
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.brickBrown, 0, L.pathY, W, H - L.pathY, { fit: "tile", step: 36 });
      drawSurfaceStrip(L.pathX, L.pathY, L.pathW, 36);
    } else {
      ctx.fillStyle = "#4a525a";
      ctx.fillRect(0, L.pathY, W, H - L.pathY);
      ctx.fillStyle = "#8d9196";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
    }

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
    if (stage === 8 && old8FloorGone && holes[2]) {
      var goneX = holes[2].x + holes[2].w;
      ctx.fillStyle = "#1c2228";
      ctx.fillRect(
        goneX,
        L.pathY,
        L.pathX + L.pathW - goneX,
        L.pathH + 8
      );
    }
    if (stage === 11) {
      var platforms = stage8Platforms(L);
      for (var pi = 0; pi < platforms.length; pi++) {
        if (!s8VanishedPlatforms[pi]) continue;
        ctx.fillStyle = "#1c2228";
        ctx.fillRect(
          platforms[pi].x,
          L.pathY,
          platforms[pi].w,
          L.pathH + 8
        );
      }
    }
    drawSurfacePlants(L);
  }

  function drawSurfacePlants(L) {
    var plants = surfacePlants();
    var images = {
      "124": sceneSprites.plant124,
      "125": sceneSprites.plant125,
      "128": sceneSprites.plant128,
    };
    for (var i = 0; i < plants.length; i++) {
      var item = plants[i];
      var img = images[item[1]];
      if (!img || !img.complete || !img.naturalWidth) continue;
      var size = Math.max(28, Math.round(H * 0.075));
      var x = Math.round(L.pathX + L.pathW * item[0] - size * 0.5);
      var y = Math.round(L.pathY - size * 0.34);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
    }
  }

  function drawButton(L) {
    function drawOne(b) {
      if (sceneSprites.allLoaded) {
        drawTile(sceneSprites.red, b.x, b.y, b.w, b.h);
        return;
      }
      ctx.fillStyle = "#c43b32";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "#e25a4f";
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, Math.max(2, b.h * 0.4));
    }
    var oldButton = originalStage8Button(L);
    if (oldButton) drawOne(oldButton);
    var buttons = stage8RedButtons(L);
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (s8VanishedPlatforms[btn.index]) continue;
      drawOne(btn);
    }
  }

  function drawStage8SpikeRain(L) {
    if (stage !== 11 || !s8SpikeRain.active) return;
    var pitch = Math.max(11, Math.round(H * 0.026));
    var spikeW = Math.max(9, Math.round(pitch * 0.78));
    var right = L.pathX + L.pathW;
    for (var x = L.pathX; x < right; x += pitch) {
      var cx = x + spikeW * 0.5;
      if (
        cx >= s8SpikeRain.gapX &&
        cx <= s8SpikeRain.gapX + s8SpikeRain.gapW
      ) {
        continue;
      }
      ctx.fillStyle = "#30343a";
      ctx.beginPath();
      ctx.moveTo(x, s8SpikeRain.y);
      ctx.lineTo(x + spikeW, s8SpikeRain.y);
      ctx.lineTo(x + spikeW * 0.5, s8SpikeRain.y + s8SpikeRain.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#555b63";
      ctx.beginPath();
      ctx.moveTo(x + spikeW * 0.5, s8SpikeRain.y);
      ctx.lineTo(x + spikeW, s8SpikeRain.y);
      ctx.lineTo(x + spikeW * 0.5, s8SpikeRain.y + s8SpikeRain.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawStage8Progress(L) {
    var kind = s8Phase === 2 ? "fake1" : s8Phase === 4 ? "green" : s8Phase === 6 ? "fake2" : "";
    if (!kind) return;
    var box = stage8ProgressBox(L, kind);
    if (!box) return;
    if (kind === "green") {
      ctx.fillStyle = "#3d9a4a";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = "#65c872";
      ctx.fillRect(box.x + 2, box.y + 2, box.w - 4, Math.max(2, box.h * 0.4));
      return;
    }
    ctx.fillStyle = "rgba(107, 111, 116, 0.55)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = "rgba(90, 94, 98, 0.45)";
    ctx.fillRect(box.x + 5, box.y + 8, box.w - 10, box.h - 8);
  }

  function drawTrapSpikeRows(L) {
    var pitch = Math.max(11, Math.round(H * 0.026));
    var spikeW = Math.max(9, Math.round(pitch * 0.78));
    for (var i = 0; i < trapSpikeRows.length; i++) {
      var row = trapSpikeRows[i];
      for (var x = L.pathX; x < L.pathX + L.pathW; x += pitch) {
        var cx = x + spikeW * 0.5;
        if (cx >= row.gapX && cx <= row.gapX + row.gapW) continue;
        ctx.fillStyle = "#30343a";
        ctx.beginPath();
        ctx.moveTo(x, row.y);
        ctx.lineTo(x + spikeW, row.y);
        ctx.lineTo(x + spikeW * 0.5, row.y + row.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#555b63";
        ctx.beginPath();
        ctx.moveTo(x + spikeW * 0.5, row.y);
        ctx.lineTo(x + spikeW, row.y);
        ctx.lineTo(x + spikeW * 0.5, row.y + row.h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawTrapPlayback() {
    var L = layout();
    ctx.save();
    if (trapShake > 0) {
      ctx.translate(
        Math.round((Math.random() - 0.5) * trapShake),
        Math.round((Math.random() - 0.5) * trapShake)
      );
    }
    drawSky();
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.brickBrown, 0, L.pathY, W, H - L.pathY, { fit: "tile", step: 36 });
    } else {
      ctx.fillStyle = "#4a525a";
      ctx.fillRect(0, L.pathY, W, H - L.pathY);
    }
    if (sceneSprites.allLoaded) {
      drawSurfaceStrip(L.pathX, L.pathY, L.pathW, 36);
    } else {
      ctx.fillStyle = "#8d9196";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    }
    drawSurfacePlants(L);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);

    var i;
    for (i = 0; i < trapWoods.length; i++) {
      var wood = trapWoods[i];
      drawWoodBox(
        sceneSprites.plank,
        wood.x,
        wood.y,
        wood.w,
        wood.h,
        "#8a5a2b",
        "#6d441e",
        "#4a2e12"
      );
    }
    for (i = 0; i < trapGreens.length; i++) {
      var greenBox = trapGreens[i];
      drawWoodBox(
        sceneSprites.green,
        greenBox.x,
        greenBox.y,
        greenBox.w,
        greenBox.h,
        "#3d9a4a",
        "#2d7336",
        "#1d4f24"
      );
    }
    for (i = 0; i < trapReds.length; i++) {
      var redBox = trapReds[i];
      drawWoodBox(
        sceneSprites.red,
        redBox.x,
        redBox.y,
        redBox.w,
        redBox.h,
        "#c43b32",
        "#9a2a24",
        "#6a1814"
      );
    }
    for (i = 0; i < trapBlues.length; i++) {
      var blueBox = trapBlues[i];
      drawWoodBox(
        sceneSprites.blue,
        blueBox.x,
        blueBox.y,
        blueBox.w,
        blueBox.h,
        "#287cc4",
        "#1d5f99",
        "#123f6b"
      );
    }
    drawTrapSpikeRows(L);
    drawCharacter(trapPlayer);
    ctx.restore();
    if (trapDead) {
      ctx.fillStyle =
        "rgba(120, 8, 8, " + Math.min(0.45, trapDeadT * 1.2) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function deriveCharacterAnim(p, dt) {
    if (!p.onGround) {
      p.anim = p.vy < 0 ? "jump" : "fall";
      return;
    }
    if (Math.abs(p.vx) > RUN_SPEED_THRESHOLD) {
      p.anim = "run";
      p.animT += dt;
      if (p.animT >= RUN_FRAME_DURATION) {
        p.animT = 0;
        p.walkPhase = p.walkPhase ? 0 : 1;
      }
    } else {
      p.anim = "idle";
      p.animT = 0;
      p.walkPhase = 0;
    }
  }

  function drawCharacter(p) {
    if (!playerSprites.allLoaded) {
      ctx.fillStyle = "#111214";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, p.h);
      return;
    }
    var dh = Math.round(p.h * 1.45);
    var dw = dh;
    var dx = Math.round(p.x + p.w / 2 - dw / 2);
    var dy = Math.round(p.y + p.h - dh);
    var img;
    if (p.anim === "jump" || p.anim === "fall") {
      img = playerSprites.jump;
    } else if (p.anim === "run") {
      img = p.walkPhase ? playerSprites.walkB : playerSprites.walkA;
    } else {
      img = playerSprites.idle;
    }
    ctx.save();
    if (p.facing < 0) {
      ctx.translate(dx + dw, 0);
      ctx.scale(-1, 1);
      ctx.translate(-dx, 0);
    }
    var sw = img.naturalWidth || 128;
    var sh = img.naturalHeight || 128;
    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawTile(img, x, y, w, h, opts) {
    opts = opts || {};
    var fit = opts.fit || "stretch";
    var step = opts.step || 64;
    var sw = img.naturalWidth || step;
    var sh = img.naturalHeight || step;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (fit === "tile") {
      var smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      for (var ty = y; ty < y + h; ty += step) {
        for (var tx = x; tx < x + w; tx += step) {
          var rw = Math.min(step, x + w - tx);
          var rh = Math.min(step, y + h - ty);
          var cw = Math.min(sw, rw);
          var ch = Math.min(sh, rh);
          ctx.drawImage(img, 0, 0, cw, ch, tx, ty, rw, rh);
        }
      }
      ctx.imageSmoothingEnabled = smoothing;
      return;
    }
    ctx.drawImage(img, 0, 0, sw, sh, x, y, w, h);
  }

  // The surface sprite has a 2px framing border on its sides and bottom.
  // Crop those edges while keeping the top edge, so grass and dirt meet cleanly.
  function drawSurfaceStrip(x, y, w, h) {
    var img = sceneSprites.surface;
    var sw = img.naturalWidth || 18;
    var sh = img.naturalHeight || 18;
    var sourceX = Math.min(2, Math.max(0, sw - 1));
    var sourceW = Math.max(1, sw - sourceX * 2);
    var sourceH = Math.max(1, sh - 2);
    var step = 36;
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    var smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (var tx = x; tx < x + w; tx += step) {
      var rw = Math.min(step, x + w - tx);
      ctx.drawImage(img, sourceX, 0, sourceW, sourceH, tx, y, rw, h);
    }
    ctx.imageSmoothingEnabled = smoothing;
  }

  function draw() {
    var L = layout();
    ctx.save();
    if (shake > 0) {
      ctx.translate(
        Math.round((Math.random() - 0.5) * shake),
        Math.round((Math.random() - 0.5) * shake)
      );
    }
    drawSky();
    drawFloor(L);

    var door = portalBox(L);
    if (stage !== 11 || s8Phase === 8) {
      ctx.save();
      if (stage === 10 && portalSide === "left" && !s9RoundUnlocked) {
        ctx.globalAlpha = 0.18;
      }
      ctx.fillStyle = "#6b6f74";
      ctx.fillRect(door.x, door.y, door.w, door.h);
      ctx.fillStyle = "#5a5e62";
      ctx.fillRect(door.x + 5, door.y + 8, door.w - 10, door.h - 8);
      ctx.restore();
    }

    drawSpike(L);
    drawCrate();
    drawGreen();
    drawAirGreens();
    drawGrey();
    drawRed();
    drawOriginalStage9Red();
    drawBlue();
    drawButton(L);
    drawStage8SpikeRain(L);
    if (stage === 11) drawStage8Progress(L);

    drawCharacter(player);
    canvas.style.cursor = stage === 12 ? (drag.on ? "grabbing" : "grab") : "";

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
    if (trapMode === "play") {
      updateTrapPlayback(dt);
      drawTrapPlayback();
    } else {
      if (trapMode === "off") update(dt);
      draw();
    }
    rafId = window.requestAnimationFrame(frame);
  }

  function setKey(code, down) {
    if (code === "KeyA" || code === "ArrowLeft") {
      keys.left = down;
      if (down) player.facing = -1;
    } else if (code === "KeyD" || code === "ArrowRight") {
      keys.right = down;
      if (down) player.facing = 1;
    }
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

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || !!target.isContentEditable;
  }

  function updateTrapChord(e) {
    if (e.repeat || isTypingTarget(e.target)) return false;
    var expected = ["KeyF", "KeyC", "KeyF"];
    if (e.code === expected[trapChordIndex]) {
      trapChordIndex += 1;
    } else {
      trapChordIndex = e.code === "KeyF" ? 1 : 0;
    }
    if (trapChordIndex === expected.length) {
      openTrapBuilder();
      return true;
    }
    return e.code === "KeyF" || e.code === "KeyC";
  }

  function onKeyDown(e) {
    if (!running) return;
    if (trapMode === "editor") {
      if (e.code === "Escape") {
        closeTrapBuilder();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (trapMode === "play") {
      if (e.code === "Escape") {
        closeTrapBuilder();
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
      return;
    }
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
    if (updateTrapChord(e)) {
      e.preventDefault();
      e.stopPropagation();
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
    if (trapMode === "editor") return;
    if (trapMode === "play") {
      if (setKey(e.code, false)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
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
          if (dir === "left") {
            keys.left = true;
            player.facing = -1;
          } else if (dir === "right") {
            keys.right = true;
            player.facing = 1;
          } else if (dir === "jump") {
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
    closeTrapBuilder();
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
      trapMode !== "off" ||
      stage !== 12 ||
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
    closeTrapBuilder();
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
      if (running && !entering && trapMode === "off") setStage(stage);
    });
  }
  if (firstBtn) {
    firstBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (running && !entering && trapMode === "off") setStage(1);
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
  if (trapBuilderPaletteEl) {
    trapBuilderPaletteEl.addEventListener("click", function (e) {
      var card = e.target.closest("[data-trap-kind]");
      if (!card || trapMode !== "editor") return;
      addTrapTimelineItem(card.getAttribute("data-trap-kind"));
    });
  }
  if (trapBuilderTimelineEl) {
    trapBuilderTimelineEl.addEventListener("click", function (e) {
      if (e.target.closest(".trap-timeline-interval")) return;
      var arrow = e.target.closest("[data-trap-arrow]");
      if (!arrow || trapMode !== "editor") return;
      editTrapTimelineDelay(
        arrow,
        parseInt(arrow.getAttribute("data-trap-arrow"), 10)
      );
    });
    trapBuilderTimelineEl.addEventListener("keydown", function (e) {
      if (!e.target.classList.contains("trap-timeline-interval")) return;
      if (e.code === "Enter") {
        commitTrapTimelineDelay(e.target);
        e.preventDefault();
      } else if (e.code === "Escape") {
        renderTrapTimeline();
        e.preventDefault();
      }
    });
    trapBuilderTimelineEl.addEventListener("focusout", function (e) {
      if (e.target.classList.contains("trap-timeline-interval")) {
        commitTrapTimelineDelay(e.target);
      }
    });
  }
  if (trapBuilderClearEl) {
    trapBuilderClearEl.addEventListener("click", function () {
      if (trapMode !== "editor") return;
      trapTimeline = [];
      renderTrapTimeline();
    });
  }
  if (trapBuilderStartEl) {
    trapBuilderStartEl.addEventListener("click", startTrapPlayback);
  }
  if (trapPlaybackReplayEl) {
    trapPlaybackReplayEl.addEventListener("click", startTrapPlayback);
  }
  if (trapPlaybackEditEl) {
    trapPlaybackEditEl.addEventListener("click", showTrapEditor);
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

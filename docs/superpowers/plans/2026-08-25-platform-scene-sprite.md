# 平台小游戏场景素材替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `js/platform-minigame.js` 中场景矢量绘制（天空/地板/刺/各色木箱/红按钮）替换为 Kenney 64×64 瓦片与背景贴图，玩家精灵与碰撞物理不变。

**Architecture:** 新增 `sceneSprites` 加载器（7 张图，模式同已有 `playerSprites`）与通用 `drawTile(img,x,y,w,h,opts)` helper（stretch/tile 两种）；改造 `drawWoodBox` 签名为按颜色传 Image + fallback 三色；各 draw 函数在 `sceneSprites.allLoaded` 时用贴图，否则退回原矢量。门与缝隙黑坑不改，spike rain 保留矢量。

**Tech Stack:** 原生 JS（IIFE）、Canvas 2D、`new Image()` + `drawImage`。无构建、无测试框架——`node --check` 语法校验 + 浏览器手动验证。

**Spec amendment（计划期决定）：** spec §"drawStage8SpikeRain" 写"下落刺用 sceneSprites.spikes 贴图"。实际 `drawStage8SpikeRain`（`:2340-2367`）画的是**向下指向的细刺**（moveTo 在顶、.lineTo 到 y+h），而 `block_spikes.png` 是 64×64 多根**向上**刺，拉伸到 ~9px 宽细刺会严重失真且朝向相反。故 spike rain **保留矢量三角**，不换贴图。属 YAGNI（不为单一特效给 drawTile 加 flip 支持）。

**参考 spec：** `docs/superpowers/specs/2026-08-25-platform-scene-sprite-design.md`

---

## 文件结构

- 新增：`img/platform-scene/background_clouds.png`、`brick_grey.png`、`block_spikes.png`、`block_plank.png`、`block_green.png`、`block_red.png`、`block_blue.png`（共 7 张，从素材包复制）
- 修改：`js/platform-minigame.js`
  - `:82` 之后插入 `sceneSprites` 加载器
  - `:2509` `drawCharacter` 之后插入 `drawTile` helper
  - `:2152` `drawWoodBox` 签名改造
  - `:2164-2259` `drawCrate`/`drawGreen`/`drawAirGreens`/`drawRed`/`drawOriginalStage9Red`/`drawBlue`/`drawGrey` 调用方更新
  - `:2110` `drawSky`、`:2261` `drawFloor`、`:2129` `drawSpike`、`:2316` `drawButton` 换贴图
  - `:2414` `drawTrapPlayback` 地板与木箱换贴图
  - `:2340` `drawStage8SpikeRain` 不改（保留矢量）

---

### Task 1: 复制 7 张场景 PNG 到项目资源目录

**Files:**
- Create: `img/platform-scene/background_clouds.png`
- Create: `img/platform-scene/brick_grey.png`
- Create: `img/platform-scene/block_spikes.png`
- Create: `img/platform-scene/block_plank.png`
- Create: `img/platform-scene/block_green.png`
- Create: `img/platform-scene/block_red.png`
- Create: `img/platform-scene/block_blue.png`

- [ ] **Step 1: 创建目录并复制 7 张图**

Run:
```bash
mkdir -p img/platform-scene
SRC="/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites"
cp "$SRC/Backgrounds/Default/background_clouds.png" img/platform-scene/
cp "$SRC/Tiles/Default/brick_grey.png" img/platform-scene/
cp "$SRC/Tiles/Default/block_spikes.png" img/platform-scene/
cp "$SRC/Tiles/Default/block_plank.png" img/platform-scene/
cp "$SRC/Tiles/Default/block_green.png" img/platform-scene/
cp "$SRC/Tiles/Default/block_red.png" img/platform-scene/
cp "$SRC/Tiles/Default/block_blue.png" img/platform-scene/
```
Expected: 无输出，退出码 0。

- [ ] **Step 2: 验证文件就位**

Run:
```bash
ls -1 img/platform-scene/
```
Expected:
```
background_clouds.png
block_blue.png
block_green.png
block_plank.png
block_red.png
block_spikes.png
brick_grey.png
```

- [ ] **Step 3: 提交**

```bash
git add img/platform-scene/
git commit -m "Add Kenney scene sprites to platform minigame"
```

---

### Task 2: 新增 sceneSprites 加载器与 drawTile helper

**Files:**
- Modify: `js/platform-minigame.js:82`（`playerSprites.jump.src = ...` 之后插入加载器）
- Modify: `js/platform-minigame.js:2509`（`drawCharacter` 函数之后插入 drawTile）

- [ ] **Step 1: 在 `playerSprites.jump.src` 赋值之后插入 `sceneSprites` 加载器**

定位 `js/platform-minigame.js` 中：
```js
  playerSprites.jump.src = "img/platform-player/character_beige_jump.png";
```
在其后插入：
```js
  var sceneSprites = {
    sky: new Image(),
    brick: new Image(),
    spikes: new Image(),
    plank: new Image(),
    green: new Image(),
    red: new Image(),
    blue: new Image(),
    loaded: 0,
    allLoaded: false
  };
  function markSceneLoaded() {
    sceneSprites.loaded += 1;
    if (sceneSprites.loaded >= 7) sceneSprites.allLoaded = true;
  }
  function markSceneError() {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[platform-minigame] scene sprite failed to load");
    }
  }
  [sceneSprites.sky, sceneSprites.brick, sceneSprites.spikes,
   sceneSprites.plank, sceneSprites.green, sceneSprites.red, sceneSprites.blue
  ].forEach(function (img) {
    img.onload = markSceneLoaded;
    img.onerror = markSceneError;
  });
  sceneSprites.sky.src = "img/platform-scene/background_clouds.png";
  sceneSprites.brick.src = "img/platform-scene/brick_grey.png";
  sceneSprites.spikes.src = "img/platform-scene/block_spikes.png";
  sceneSprites.plank.src = "img/platform-scene/block_plank.png";
  sceneSprites.green.src = "img/platform-scene/block_green.png";
  sceneSprites.red.src = "img/platform-scene/block_red.png";
  sceneSprites.blue.src = "img/platform-scene/block_blue.png";
```

- [ ] **Step 2: 在 `drawCharacter` 函数闭合 `}` 之后插入 `drawTile` helper**

定位 `drawCharacter(p)` 函数（约 `:2509-2535`），在其闭合 `}` 之后插入：
```js
  function drawTile(img, x, y, w, h, opts) {
    opts = opts || {};
    var fit = opts.fit || "stretch";
    var sw = img.naturalWidth || 64;
    var sh = img.naturalHeight || 64;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (fit === "tile") {
      for (var ty = y; ty < y + h; ty += 64) {
        for (var tx = x; tx < x + w; tx += 64) {
          var rw = Math.min(64, x + w - tx);
          var rh = Math.min(64, y + h - ty);
          ctx.drawImage(img, 0, 0, sw, sh, tx, ty, rw, rh);
        }
      }
      return;
    }
    ctx.drawImage(img, 0, 0, sw, sh, x, y, w, h);
  }
```

- [ ] **Step 3: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出（SYNTAX OK）。

- [ ] **Step 4: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Add sceneSprites loader and drawTile helper"
```

---

### Task 3: 改造 drawWoodBox 签名并更新各色木箱调用方

**Files:**
- Modify: `js/platform-minigame.js:2152`（`drawWoodBox`）
- Modify: `js/platform-minigame.js:2164-2259`（`drawCrate`/`drawGreen`/`drawAirGreens`/`drawRed`/`drawOriginalStage9Red`/`drawBlue`/`drawGrey`）

- [ ] **Step 1: 改造 `drawWoodBox` 函数体**

定位 `js/platform-minigame.js:2152`：
```js
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
```
改为：
```js
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
```

- [ ] **Step 2: 更新 `drawCrate`（棕色箱 → plank）**

定位 `:2164`：
```js
    drawWoodBox(
      Math.round(crate.x),
      Math.round(crate.y),
      crate.w,
      crate.h,
      "#8a5a2b",
      "#6d441e",
      "#4a2e12"
    );
```
改为（首位加 `sceneSprites.plank`）：
```js
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
```

- [ ] **Step 3: 更新 `drawGreen`（绿色箱 → green）**

定位 `:2177`，把 `drawWoodBox(` 后首位加 `sceneSprites.green,`，其余不变：
```js
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
```

- [ ] **Step 4: 更新 `drawAirGreens`（绿色 → green）**

定位 `:2190` 的循环体：
```js
      drawWoodBox(
        Math.round(box.x),
        Math.round(box.y),
        box.w,
        box.h,
        "#3d9a4a",
        "#2d7336",
        "#1d4f24"
      );
```
改为：
```js
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
```

- [ ] **Step 5: 更新 `drawRed`（红色箱 → red）**

定位 `:2205`，首位加 `sceneSprites.red,`：
```js
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
```

- [ ] **Step 6: 更新 `drawOriginalStage9Red`（红色 → red）**

定位 `:2220`，首位加 `sceneSprites.red,`：
```js
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
```

- [ ] **Step 7: 更新 `drawBlue`（蓝色箱 → blue）**

定位 `:2233`，首位加 `sceneSprites.blue,`：
```js
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
```

- [ ] **Step 8: 更新 `drawGrey`（灰色箱 → brick）**

定位 `:2248`，首位加 `sceneSprites.brick,`：
```js
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
```

- [ ] **Step 9: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出。

- [ ] **Step 10: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Rework drawWoodBox to take a tile image and update crate callers"
```

---

### Task 4: drawSky 与 drawFloor 换贴图

**Files:**
- Modify: `js/platform-minigame.js:2110`（`drawSky`）
- Modify: `js/platform-minigame.js:2261-2314`（`drawFloor`）

- [ ] **Step 1: 改造 `drawSky`**

定位 `:2110`：
```js
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
```
改为（加载完成用云背景拉伸铺满，否则原渐变+云）：
```js
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
```

- [ ] **Step 2: 改造 `drawFloor` 地板主体与下方填充**

定位 `:2261-2268`：
```js
  function drawFloor(L) {
    ctx.fillStyle = "#4a525a";
    ctx.fillRect(0, L.pathY, W, H - L.pathY);

    ctx.fillStyle = "#8d9196";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
```
改为（下方用 brick 拉伸填充，路径用 brick 平铺；路径顶 6px 高亮线保留）：
```js
  function drawFloor(L) {
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.brick, 0, L.pathY, W, H - L.pathY);
      drawTile(sceneSprites.brick, L.pathX, L.pathY, L.pathW, L.pathH, { fit: "tile" });
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
    } else {
      ctx.fillStyle = "#4a525a";
      ctx.fillRect(0, L.pathY, W, H - L.pathY);
      ctx.fillStyle = "#8d9196";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
    }
```
其余 `drawFloor` 函数体（缝隙 gap 黑坑 `#1c2228`/`#14181c`、stage 8 `old8FloorGone`、stage 11 平台消失）**保持不变**——在新增 if/else 之后原样接续。

- [ ] **Step 3: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出。

- [ ] **Step 4: 浏览器验证**

打开 `index.html` 进平台小游戏。
Expected:
- 天空显示为云背景图（非纯渐变）。
- 地板显示灰砖纹理，路径顶有浅色高亮线。
- 缝隙仍是暗色黑坑。

- [ ] **Step 5: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Render sky and floor with scene sprites"
```

---

### Task 5: drawSpike 与 drawButton 换贴图（spike rain 保留矢量）

**Files:**
- Modify: `js/platform-minigame.js:2129-2150`（`drawSpike`）
- Modify: `js/platform-minigame.js:2316-2338`（`drawButton`）

- [ ] **Step 1: 改造 `drawSpike`**

定位 `:2129`：
```js
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
```
改为（每条刺用 block_spikes 贴图，刺底贴 pathY、向上 box.h；未加载退回三角）：
```js
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
```

- [ ] **Step 2: 改造 `drawButton` 红按钮为贴图**

定位 `:2316-2338`：
```js
  function drawButton(L) {
    var oldButton = originalStage8Button(L);
    if (oldButton) {
      ctx.fillStyle = "#c43b32";
      ctx.fillRect(oldButton.x, oldButton.y, oldButton.w, oldButton.h);
      ctx.fillStyle = "#e25a4f";
      ctx.fillRect(
        oldButton.x + 2,
        oldButton.y + 2,
        oldButton.w - 4,
        Math.max(2, oldButton.h * 0.4)
      );
    }
    var buttons = stage8RedButtons(L);
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (s8VanishedPlatforms[btn.index]) continue;
      ctx.fillStyle = "#c43b32";
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = "#e25a4f";
      ctx.fillRect(btn.x + 2, btn.y + 2, btn.w - 4, Math.max(2, btn.h * 0.4));
    }
  }
```
改为（加载完成用 block_red 贴图，否则原红色矩形+高亮）：
```js
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
```

- [ ] **Step 3: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出。

- [ ] **Step 4: 浏览器验证**

打开 `index.html` 进平台小游戏（含刺与按钮的关卡，如 stage 2/3、stage 8 按钮）。
Expected:
- 地面刺显示为 block_spikes 图。
- 红按钮显示为 block_red 贴图。
- stage 11 spike rain 仍为暗色三角（保留矢量，未换）。

- [ ] **Step 5: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Render spikes and red buttons with scene sprites"
```

---

### Task 6: drawTrapPlayback 地板与木箱换贴图

**Files:**
- Modify: `js/platform-minigame.js:2414-2452`（`drawTrapPlayback`）

- [ ] **Step 1: 改造 `drawTrapPlayback` 地板**

定位 `:2423-2425`：
```js
    drawSky();
    ctx.fillStyle = "#4a525a";
    ctx.fillRect(0, L.pathY, W, H - L.pathY);
```
改为（sky 已是 drawSky 共享；下方与路径用 brick 贴图，与 drawFloor 一致）：
```js
    drawSky();
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.brick, 0, L.pathY, W, H - L.pathY);
    } else {
      ctx.fillStyle = "#4a525a";
      ctx.fillRect(0, L.pathY, W, H - L.pathY);
    }
```

- [ ] **Step 2: 改造 `drawTrapPlayback` 路径主体**

定位紧接其后的：
```js
    ctx.fillStyle = "#8d9196";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
```
改为：
```js
    if (sceneSprites.allLoaded) {
      drawTile(sceneSprites.brick, L.pathX, L.pathY, L.pathW, L.pathH, { fit: "tile" });
    } else {
      ctx.fillStyle = "#8d9196";
      ctx.fillRect(L.pathX, L.pathY, L.pathW, L.pathH);
    }
    ctx.fillStyle = "#9aa0a6";
    ctx.fillRect(L.pathX, L.pathY, L.pathW, 6);
```

- [ ] **Step 3: 更新 trap 木箱调用为带 Image 参数**

`drawTrapPlayback` 中有 4 处 `drawWoodBox(...)` 调用（trapWoods/greens/reds/blues），当前首位是坐标、未传 Image。逐处把对应 `sceneSprites.*` 作为首位插入：
- trapWoods（棕色，约 `:2392`）：首位插 `sceneSprites.plank,`
- trapGreens（绿色，约 `:2404`）：首位插 `sceneSprites.green,`
- trapReds（红色，约 `:2415`）：首位插 `sceneSprites.red,`
- trapBlues（蓝色，约 `:2427`）：首位插 `sceneSprites.blue,`

每处形如：
```js
      drawWoodBox(
        wood.x, wood.y, wood.w, wood.h,
        "#8a5a2b", "#6d441e", "#4a2e12"
      );
```
改为：
```js
      drawWoodBox(
        sceneSprites.plank,
        wood.x, wood.y, wood.w, wood.h,
        "#8a5a2b", "#6d441e", "#4a2e12"
      );
```
（绿/红/蓝同理，分别用 `sceneSprites.green`/`sceneSprites.red`/`sceneSprites.blue`，fallback 三色保持原值。）

由于 4 处结构相同、仅颜色不同，逐处用 Read 确认上下文后 Edit，避免 `replace_all` 误伤。

- [ ] **Step 4: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出。

- [ ] **Step 5: 浏览器验证（陷阱回放）**

打开 `index.html`，进 stage 12 陷阱编辑器，构建一个含木箱的陷阱并运行回放。
Expected:
- 回放地板显示灰砖纹理。
- 回放中的棕/绿/红/蓝木箱显示对应贴图。
- 玩家精灵显示正常。

- [ ] **Step 6: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Render trap playback floor and crates with scene sprites"
```

---

### Task 7: 回归与降级验证

**Files:** 无修改，仅验证。

- [ ] **Step 1: 不变性确认**

Run:
```bash
grep -n "w: 22, h: 34\|w: 22,\|h: 34," js/platform-minigame.js | head
node --check js/platform-minigame.js && echo "SYNTAX OK"
```
Expected: 玩家/trapPlayer 碰撞盒仍 22×34；语法 OK。

- [ ] **Step 2: 端到端通关验证**

打开 `index.html` 进平台小游戏，依次验证：
- 第 1 关：云背景、灰砖地板、刺贴图、玩家精灵。
- 第 4 关（中间裂开）：缝隙黑坑清晰、坠落死亡→重开行为不变。
- 第 6 关（绿箱+门搬家）：绿箱显示 green 贴图，箱子推动/跳跃。
- 第 8 关（四波木箱）：各色木箱贴图、按钮贴图、刺贴图。
- 第 11 关（spike rain）：下落刺仍为暗色三角（保留矢量）。
- 第 12 关（鼠标拖拽 + 陷阱回放）：玩家 idle，回放地板/木箱贴图正常。
Expected: 所有碰撞、死亡、过关逻辑与改前一致；场景为 Kenney 贴图风格。

- [ ] **Step 3: 降级验证**

在 DevTools Network 面板 Block `brick_grey.png`，刷新。
Expected: 地板退回灰色矩形，游戏不崩、可玩。验证后取消 block。

- [ ] **Step 4: 最终提交（若有未提交改动）**

```bash
git status
```
干净则跳过；否则：
```bash
git add -A
git commit -m "Finalize platform scene sprite integration"
```

---

## 自审

**1. Spec coverage：**
- 资源放置 7 PNG → Task 1 ✓
- sceneSprites 加载器 + onerror + allLoaded → Task 2 ✓
- drawTile helper（stretch/tile）→ Task 2 ✓
- drawWoodBox 签名改造 + 7 调用方 → Task 3 ✓
- drawSky 换贴图 → Task 4 ✓
- drawFloor（路径平铺 + 下方拉伸 + 缝坑保留矢量）→ Task 4 ✓
- drawSpike 换贴图 → Task 5 ✓
- drawButton 换贴图（oldButton + stage8RedButtons）→ Task 5 ✓
- drawStage8SpikeRain → spec amendment，保留矢量 → Task 5 Step 3 验证记录 ✓
- drawTrapPlayback 地板 + 木箱 → Task 6 ✓
- 门不改 → 计划未触及 ✓
- 玩家精灵/碰撞物理不变 → Task 7 Step 1 验证 ✓
- 降级（onerror/退回矢量）→ Task 7 Step 3 + 各 Task 的 else 分支 ✓
- YAGNI（无敌人/金币/灌木/门/进度条）→ 计划未涉及 ✓

**2. Placeholder scan：** 无 TBD/TODO。Task 6 Step 3 对 4 处 trap 木箱给出具体插入值与"逐处 Read 后 Edit"明确指引，含完整代码块。所有代码步骤均含完整代码。

**3. 命名一致性：** `sceneSprites`（sky/brick/spikes/plank/green/red/blue/loaded/allLoaded）、`markSceneLoaded`/`markSceneError`、`drawTile(img,x,y,w,h,opts)`（fit）在定义与所有调用处一致；`drawWoodBox(tileImg,x,y,w,h,fill,slat,edge)` 新签名在 Task 3 定义、Task 3/6 调用处首位均为 `sceneSprites.*` ✓

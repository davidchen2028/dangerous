# 平台小游戏场景素材替换设计

日期：2026-08-25
范围：`js/platform-minigame.js` 与新增静态资源 `img/platform-scene/`

## 背景与目标

平台小游戏当前场景全部用 Canvas 矢量绘制：蓝渐变天+白云、灰色矩形地板带缝隙、深色三角刺、各色木箱（`drawWoodBox` 三色填充）、红按钮、灰门。视觉效果简陋。目标是把场景元素替换为 Kenney New Platformer Pack 的 64×64 瓦片/背景贴图，玩家精灵图（已实现，见 `docs/superpowers/specs/2026-08-25-platform-player-sprite-design.md`）与碰撞物理不变。

## 现状

- 场景绘制函数集中在 `js/platform-minigame.js` 约 `:2110-2370`：`drawSky` / `drawSpike` / `drawWoodBox` / `drawCrate` / `drawGreen` / `drawAirGreens` / `drawRed` / `drawOriginalStage9Red` / `drawBlue` / `drawGrey` / `drawFloor` / `drawButton` / `drawStage8SpikeRain` / `drawStage8Progress`。
- 陷阱回放 `drawTrapPlayback`（约 `:2372-2452`）独立绘制地板与木箱。
- `draw()`（约 `:2454`）中绘制门（`#6b6f74`/`#5a5e62` 矩形）。
- 已有玩家精灵加载器 `playerSprites`（`:54-78`）、helper `drawCharacter`（约 `:2500`）与 `deriveCharacterAnim`。
- 项目无统一资源加载器，沿用 `new Image()` + `.src` + `onload` 计数 + `allLoaded` 标志模式。
- 注：行号均为本次设计起始时参考值，编辑后会变化，实施时按符号名/上下文定位。

## 素材来源

`/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/`

Tiles/Backgrounds 均为 64×64 透明 PNG（背景图尺寸见下）。

## 设计决策

### 渲染方式：单帧 PNG + 裸 Image（沿用玩家精灵模式）

复制所需 PNG 到项目，用 `new Image()` 预加载，`drawImage` 缩放/平铺绘制。理由：与已实现的 `playerSprites` 模式一致，代码风格统一，无新依赖。

### 资源放置

从素材包复制到项目 `img/platform-scene/`（共 7 个文件）：

| 用途 | 源 | 落地路径 |
|---|---|---|
| 天空背景 | `Backgrounds/Default/background_clouds.png` | `img/platform-scene/background_clouds.png` |
| 地板砖 | `Tiles/Default/brick_grey.png` | `img/platform-scene/brick_grey.png` |
| 刺 | `Tiles/Default/block_spikes.png` | `img/platform-scene/block_spikes.png` |
| 棕木箱 | `Tiles/Default/block_plank.png` | `img/platform-scene/block_plank.png` |
| 绿箱 | `Tiles/Default/block_green.png` | `img/platform-scene/block_green.png` |
| 红箱/红按钮 | `Tiles/Default/block_red.png` | `img/platform-scene/block_red.png` |
| 蓝箱 | `Tiles/Default/block_blue.png` | `img/platform-scene/block_blue.png` |

灰箱复用 `brick_grey.png`，红按钮复用 `block_red.png`——不额外复制文件。

### 精灵加载器 `sceneSprites`

模块级对象，紧随 `playerSprites` 块之后。结构与 `playerSprites` 完全一致：

```js
var sceneSprites = {
  sky: new Image(), brick: new Image(), spikes: new Image(),
  plank: new Image(), green: new Image(), red: new Image(), blue: new Image(),
  loaded: 0, allLoaded: false
};
function markSceneLoaded() {
  sceneSprites.loaded += 1;
  if (sceneSprites.loaded >= 7) sceneSprites.allLoaded = true;
}
function markSceneError() {
  if (typeof console !== "undefined" && console.warn)
    console.warn("[platform-minigame] scene sprite failed to load");
}
[sceneSprites.sky, sceneSprites.brick, sceneSprites.spikes,
 sceneSprites.plank, sceneSprites.green, sceneSprites.red, sceneSprites.blue
].forEach(function (img) { img.onload = markSceneLoaded; img.onerror = markSceneError; });
sceneSprites.sky.src     = "img/platform-scene/background_clouds.png";
sceneSprites.brick.src   = "img/platform-scene/brick_grey.png";
sceneSprites.spikes.src  = "img/platform-scene/block_spikes.png";
sceneSprites.plank.src   = "img/platform-scene/block_plank.png";
sceneSprites.green.src   = "img/platform-scene/block_green.png";
sceneSprites.red.src     = "img/platform-scene/block_red.png";
sceneSprites.blue.src    = "img/platform-scene/block_blue.png";
```

IIFE 执行时即开始加载，不依赖 `start()`。

### 通用贴图 helper `drawTile`

在 `drawCharacter` helper 之后新增：

```js
function drawTile(img, x, y, w, h, opts) {
  opts = opts || {};
  var fit = opts.fit || "stretch";      // "stretch" | "tile"
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

所有元素均整框填充：刺的目标框坐标 `(box.x, L.pathY - box.h, box.w, box.h)` 已使刺底贴 `pathY`、向上 `box.h`，stretch 即满足，无需额外对齐参数。

### 各元素改造

**drawSky**：`sceneSprites.allLoaded` 时 `drawTile(sceneSprites.sky, 0, 0, W, H)` 整张拉伸铺满；否则原渐变+白云矢量绘制。

**drawFloor**：
- 路径主体 `L.pathX, L.pathY, L.pathW, L.pathH` 用 `drawTile(sceneSprites.brick, ..., {fit:"tile"})` 64×64 平铺。
- 路径下方 `0, L.pathY+L.pathH, W, H-(L.pathY+L.pathH)` 用 `drawTile(sceneSprites.brick, ..., {fit:"stretch"})` 拉伸填充（或纯色 `#4a525a` fallback）。
- 缝隙 gap（`listGaps` 开口）保留原 `#1c2228`/`#14181c` 矢量黑坑绘制，不贴砖——缺口更清晰。
- `allLoaded` false 时退回原灰色矩形。
- stage 8 `old8FloorGone` 与 stage 11 平台消失处仍用黑坑矩形。

**drawSpike**：每条刺用 `drawTile(sceneSprites.spikes, box.x, L.pathY - box.h, box.w, box.h)`（stretch，刺底贴 pathY）。未加载退回三角矢量。

**drawWoodBox**：签名改为 `drawWoodBox(tileImg, x, y, w, h, fallbackFill, fallbackSlat, fallbackEdge)`：
- `sceneSprites.allLoaded` 时 `drawTile(tileImg, x, y, w, h)` 拉伸铺满。
- 否则退回原三色矢量（用 fallback 三参数，保持原视觉）。
- 各调用方按颜色传 Image + 原 fallback 三色：
  - `drawCrate`(棕) → `sceneSprites.plank`，fallback `#8a5a2b/#6d441e/#4a2e12`
  - `drawGreen`/`drawAirGreens`(绿) → `sceneSprites.green`，fallback `#3d9a4a/#2d7336/#1d4f24`
  - `drawRed`/`drawOriginalStage9Red`(红) → `sceneSprites.red`，fallback `#c43b32/#9a2a24/#6a1814`
  - `drawBlue`(蓝) → `sceneSprites.blue`，fallback `#287cc4/#1d5f99/#123f6b`
  - `drawGrey`(灰) → `sceneSprites.brick`，fallback `#8a8e94/#6d7176/#4a4e54`

**drawButton**：红按钮用 `drawTile(sceneSprites.red, oldButton.x, oldButton.y, oldButton.w, oldButton.h)`；未加载退回原红矩形。`stage8RedButtons` 同样处理。

**drawStage8SpikeRain**：下落刺用 `sceneSprites.spikes` 贴图（每条刺复用 drawSpike 的贴图路径，或直接 drawTile）。

**门（portal，draw() 中 `:2469-2472`）**：不改，保留灰门矩形绘制。

**陷阱回放 drawTrapPlayback**：
- 地板 `:2382-2387` 同步用 `sceneSprites.brick` 平铺/拉伸。
- 木箱 `:2390-2437`（trapWoods/greens/reds/blues）按颜色传对应 `sceneSprites.*` Image + fallback 三色，走新 `drawWoodBox`。

### 与玩家精灵图的兼容

`playerSprites` 与 `sceneSprites` 相互独立，各自 `allLoaded`，互不阻塞。`drawCharacter` 不变。

### 错误处理与降级

- 任一场景图 `onerror` → `console.warn`，`sceneSprites.allLoaded` 保持 false → 所有场景绘制退回原矢量，游戏不崩、可玩。
- 资源路径错误本地可见 warn。

## 不在范围内（YAGNI）

- 不引入敌人（游戏当前无敌人实体）。
- 不做金币/灌木/仙人掌等装饰（仅替换现有元素）。
- 不改门、不改 `drawStage8Progress`（进度条 UI）。
- 不改物理/碰撞/关卡布局/玩家精灵。
- 不做二段跳相关视觉。

## 测试方式

浏览器打开 `index.html` 进平台小游戏，验证：

1. 天空显示云背景；地板灰砖纹理（64×64 平铺，边缘可裁切）；刺为 block_spikes 图。
2. 棕/绿/红/蓝/灰箱分别显示对应贴图；红按钮贴图。
3. 缝隙黑坑仍清晰为暗色矢量；门仍为灰门；玩家精灵不受影响。
4. stage 8 下落刺（spike rain）显示贴图。
5. 陷阱回放（stage 12 编辑器运行）同步显示贴图。
6. 删除/重命名任一场景 PNG → 退回矢量绘制，游戏不崩、可玩。
7. 碰撞/死亡/过关逻辑与改前一致。

## 影响文件

- 新增：`img/platform-scene/background_clouds.png`
- 新增：`img/platform-scene/brick_grey.png`
- 新增：`img/platform-scene/block_spikes.png`
- 新增：`img/platform-scene/block_plank.png`
- 新增：`img/platform-scene/block_green.png`
- 新增：`img/platform-scene/block_red.png`
- 新增：`img/platform-scene/block_blue.png`
- 修改：`js/platform-minigame.js`（新增 `sceneSprites` 加载器、`drawTile` helper、`drawWoodBox` 签名改造、各 draw 函数换贴图、`drawTrapPlayback` 同步）

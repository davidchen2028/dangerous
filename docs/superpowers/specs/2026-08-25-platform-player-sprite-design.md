# 平台小游戏玩家精灵图替换设计

日期：2026-08-25
范围：`js/platform-minigame.js` 与新增静态资源 `img/platform-player/`

## 背景与目标

大厅小游戏 2（Level Devil 风格平台跳跃）当前玩家在 `platform-minigame.js:2488-2489` 处用一块 22×34 的纯色矩形 `#111214` 绘制，建模过于粗糙。目标是把玩家渲染替换为人物精灵图序列帧（Kenney New Platformer Pack, beige 角色），支持 idle / run / jump / fall 四种动画状态，其余逻辑不变。

## 现状

- `js/platform-minigame.js` 是一个 IIFE，由 `index.html:541` 以 `<script>` 加载。
- Canvas 逻辑尺寸 `W=800, H=480`（`:162-163`）。
- 玩家逻辑碰撞体定义在 `:50`：`{ x, y, w: 22, h: 34, vx, vy, onGround }`。
- 当前渲染（`:2488-2489`）：
  ```js
  ctx.fillStyle = "#111214";
  ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);
  ```
- 项目无统一图片加载器；既有惯例为裸 `new Image()` + `img.src`（如 `js/backrooms-inventory.js:495`）。
- 启动入口为 `start()`（`:2828`），主循环 `frame()`（`:2504`），`update` 与 `draw` 在其中调用。

## 素材来源

`/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/Characters/Default/`

Kenney beige 角色每帧 128×128 px，包含：idle / jump / walk_a / walk_b / climb_a / climb_b / duck / front / hit。本设计只用其中 4 帧。角色默认面朝右。

## 设计决策

### 渲染方式：单帧 PNG + 裸 Image（方案 A）

复制 beige 的 4 张单帧 PNG 到项目，用 `new Image()` 预加载，`drawImage` 缩放绘制。理由：代码最少、匹配项目既有惯例、4 帧恰好覆盖 4 状态，无需解析 spritesheet XML。

### 资源放置

从素材包 `Sprites/Characters/Default/` 复制到项目 `img/platform-player/`：

- `character_beige_idle.png`
- `character_beige_walk_a.png`
- `character_beige_walk_b.png`
- `character_beige_jump.png`（起跳与下落共用）

`img/` 已是项目静态资源目录（含 `backrooms/`、`maps/`、`market/` 等子目录），项目根即静态服务根，URL 形如 `img/platform-player/character_beige_idle.png`。

### 动画状态机

给 `player` 对象新增两个字段：

- `facing`：1 = 朝右，-1 = 朝左。按左键置 -1，按右键置 1，无输入保持上一值。
- `anim`：当前动画状态，取值 `idle` / `run` / `jump` / `fall`。

每帧 `update` 末尾根据物理状态推导 `anim`：

| 条件 | anim | 帧 |
|---|---|---|
| `!player.onGround && player.vy < 0` | jump | jump 单帧 |
| `!player.onGround && player.vy >= 0` | fall | jump 单帧（复用） |
| `player.onGround && Math.abs(player.vx) > runThreshold` | run | walk_a ↔ walk_b 交替 |
| `player.onGround && Math.abs(player.vx) <= runThreshold` | idle | idle 单帧 |

`runThreshold` 取一个小正数（如 `8`，单位 px/s；`player.vx` 为 px/s 量级，静止为 0、移动约 ±`W*0.38` ≈ ±304，故阈值只用于过滤抖动，数值非临界）。

run 动画的帧切换节奏：约 10 fps，用一个累加计时器 `player.animT` 在 `update` 里按 `dt` 累加，达到 `0.1s` 切换 `walk_a`/`walk_b`。

### 资源加载

新增模块级 `playerSprites` 对象：

```js
var playerSprites = {
  idle: new Image(),
  walkA: new Image(),
  walkB: new Image(),
  jump: new Image(),
  loaded: 0,
  allLoaded: false
};
playerSprites.idle.src = "img/platform-player/character_beige_idle.png";
playerSprites.walkA.src = "img/platform-player/character_beige_walk_a.png";
playerSprites.walkB.src = "img/platform-player/character_beige_walk_b.png";
playerSprites.jump.src = "img/platform-player/character_beige_jump.png";
```

每张图 `onload` 递增 `loaded`，达到 4 置 `allLoaded = true`；`onerror` 标记该图失败（不抛异常）。加载在脚本 IIFE 执行时即开始（与 DOM 探测并行），不依赖 `start()` 触发。

### 绘制（替换 `:2488-2489`）

碰撞盒 `player.w=22, player.h=34` **保持不变**，仅替换视觉绘制：

- 显示高度 `dh = player.h * 1.45`（约 49 px），显示宽度 `dw = dh`（保持精灵方形比例，不压扁）。
- 绘制基准点：脚对齐碰撞盒底，水平居中：
  - `dx = player.x + player.w/2 - dw/2`
  - `dy = player.y + player.h - dh`
- 朝左时水平翻转：`ctx.save(); ctx.translate(dx + dw/2, 0); ctx.scale(-1, 1); ctx.translate(-dx - dw/2, 0);` 后 `drawImage`，再 `ctx.restore()`。等价写法：用负宽度 `drawImage(img, 0,0,128,128, dx+dw, dy, -dw, dh)` 配合 `ctx.save/restore` 边界裁剪——实现时任选一种稳定的写法。
- `drawImage` 完整 128×128 源，缩放到 `dw × dh`。

当 `!playerSprites.allLoaded` 时，退回原 `#111214` 矩形绘制（`fillRect(player.x, player.y, player.w, player.h)`），保证加载期间游戏可玩、不崩。

### run 帧选择

`player.anim === "run"` 时，按 `walkA` / `walkB` 布尔交替（`player.walkPhase`），在 `animT` 达阈值时翻转。

### 与陷阱编辑器（stage 12）的兼容

stage 12 为鼠标拖拽关，玩家在门边静止 → `anim = idle`，无影响。stage 12 不读取 `facing`/`anim`，绘制路径统一走新绘制函数。

### 陷阱回放（trapMode）

`platform-minigame.js` 有 `trapMode === "play"` 回放分支（`:2508`），玩家绘制统一在 `draw` 末尾，回放与正常游玩共用同一绘制函数，无需特判。

## 错误处理与降级

- 任一精灵 `onerror` → 该帧缺失，`allLoaded` 保持 false → 持续退回矩形绘制，不抛异常、不阻断主循环。
- 资源路径错误 → 同上，可见矩形 fallback，便于本地发现。

## 不在范围内（YAGNI）

- 不实现 climb / duck / hit / front 动画（仅 4 状态）。
- 不引入 spritesheet XML 解析或统一资源加载器。
- 不改碰撞盒尺寸、不改物理常数、不改关卡布局。
- 不做二段跳专用帧（二段跳沿用 jump 帧）。
- 不改其它关卡元素（箱子、刺、门）的渲染。

## 测试方式

浏览器打开 `index.html` 进入平台小游戏，验证：

1. 待机显示 idle 帧；左右移动时 walk_a / walk_b 交替（约 10 fps）。
2. 起跳显示 jump；下落也显示 jump（复用），落地回 idle/run。
3. 朝左移动时精灵水平翻转；脚始终与平台顶面对齐。
4. 碰撞判定不变：箱子推动、刺致死、缝隙坠落、门触发行为与改前一致。
5. stage 12 鼠标拖拽关：玩家 idle，无异常。
6. 陷阱回放正常显示玩家。
7. 删除/重命名任一精灵 PNG → 退回 `#111214` 矩形，游戏仍可玩。

## 影响文件

- 新增：`img/platform-player/character_beige_idle.png`
- 新增：`img/platform-player/character_beige_walk_a.png`
- 新增：`img/platform-player/character_beige_walk_b.png`
- 新增：`img/platform-player/character_beige_jump.png`
- 修改：`js/platform-minigame.js`（新增 `playerSprites`、`player.facing`/`anim`/`animT`/`walkPhase` 字段、`update` 中状态推导、替换 `:2488-2489` 绘制为精灵绘制函数）

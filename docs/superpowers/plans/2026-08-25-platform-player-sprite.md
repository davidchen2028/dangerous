# 平台小游戏玩家精灵图替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `js/platform-minigame.js` 中玩家与陷阱回放玩家的纯色矩形渲染替换为 Kenney beige 角色精灵图序列帧（idle / run / jump / fall 四态），碰撞与物理不变。

**Architecture:** 加载 4 张 128×128 PNG 到内存 `Image`；给 `player` 与 `trapPlayer` 各加 `facing`/`anim`/`animT`/`walkPhase` 字段；新增两个模块级 helper——`deriveCharacterAnim(p, dt)` 按物理状态推导动画状态、`drawCharacter(p)` 用 `drawImage` 缩放绘制（含朝向翻转）；在两处原矩形绘制点（`draw()` 与 `drawTrapPlayback()`）调用 helper。未加载完成时退回原 `#111214` 矩形。

**Tech Stack:** 原生 JS（IIFE）、Canvas 2D `getContext("2d")`、`new Image()`、`drawImage`。无构建步骤、无测试框架——以浏览器手动验证为准。

**Spec amendment（计划期发现）：** spec 原只提及替换 `:2488`（`draw()` 中的 `player`）。实际 `:2439` 的 `drawTrapPlayback()` 中 `trapPlayer` 也用同一 `#111214` 矩形绘制。为保持一致，本计划同时覆盖 `trapPlayer`，共用 `drawCharacter` helper。`trapPlayer` 与 `player` 物理结构一致（均有 `vx`/`vy`/`onGround`），可直接复用 `deriveCharacterAnim`。

**参考 spec：** `docs/superpowers/specs/2026-08-25-platform-player-sprite-design.md`

---

## 文件结构

- 新增：`img/platform-player/character_beige_idle.png`（从素材包复制）
- 新增：`img/platform-player/character_beige_walk_a.png`（从素材包复制）
- 新增：`img/platform-player/character_beige_walk_b.png`（从素材包复制）
- 新增：`img/platform-player/character_beige_jump.png`（从素材包复制）
- 修改：`js/platform-minigame.js`
  - `:50` `player` 对象：加 `facing`/`anim`/`animT`/`walkPhase`
  - `:117-125` `trapPlayer` 对象：加 `facing`/`anim`/`animT`/`walkPhase`
  - 新增模块级 `playerSprites` 加载器（紧随 `player` 声明之后）
  - 新增模块级 helper `deriveCharacterAnim(p, dt)` 与 `drawCharacter(p)`
  - `:2519-2520` `setKey`：左右键时更新 `player.facing`
  - `:2796-2806` 触屏方向回调：同步 `player.facing`
  - `:1880-1885` `updateTrapPlayback`：trapPlayer 移动处更新 `trapPlayer.facing`
  - `:1962-1968` `update`：player 移动后调 `deriveCharacterAnim(player, dt)`
  - `:1903` 之后 `updateTrapPlayback`：调 `deriveCharacterAnim(trapPlayer, dt)`
  - `:2488-2489` `draw()`：替换为 `drawCharacter(player)`
  - `:2439-2445` `drawTrapPlayback()`：替换为 `drawCharacter(trapPlayer)`

---

### Task 1: 复制 4 帧 PNG 到项目资源目录

**Files:**
- Create: `img/platform-player/character_beige_idle.png`
- Create: `img/platform-player/character_beige_walk_a.png`
- Create: `img/platform-player/character_beige_walk_b.png`
- Create: `img/platform-player/character_beige_jump.png`

- [ ] **Step 1: 创建目录并复制 4 张图**

Run:
```bash
mkdir -p img/platform-player
cp "/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/Characters/Default/character_beige_idle.png" img/platform-player/
cp "/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/Characters/Default/character_beige_walk_a.png" img/platform-player/
cp "/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/Characters/Default/character_beige_walk_b.png" img/platform-player/
cp "/Users/admin/Downloads/kenney_new-platformer-pack-1.1/Sprites/Characters/Default/character_beige_jump.png" img/platform-player/
```
Expected: 无输出，退出码 0。

- [ ] **Step 2: 验证文件就位**

Run:
```bash
ls -1 img/platform-player/
```
Expected:
```
character_beige_idle.png
character_beige_jump.png
character_beige_walk_a.png
character_beige_walk_b.png
```

- [ ] **Step 3: 提交**

```bash
git add img/platform-player/
git commit -m "Add Kenney beige player sprites to platform minigame"
```

---

### Task 2: 给 player 与 trapPlayer 加动画字段，新增精灵加载器

**Files:**
- Modify: `js/platform-minigame.js:50`（`player` 声明）
- Modify: `js/platform-minigame.js:117-125`（`trapPlayer` 声明）

- [ ] **Step 1: 扩展 `player` 对象**

把 `js/platform-minigame.js:50`：
```js
  var player = { x: 0, y: 0, w: 22, h: 34, vx: 0, vy: 0, onGround: false };
```
改为：
```js
  var player = {
    x: 0, y: 0, w: 22, h: 34, vx: 0, vy: 0, onGround: false,
    facing: 1, anim: "idle", animT: 0, walkPhase: 0
  };
```

- [ ] **Step 2: 扩展 `trapPlayer` 对象**

把 `js/platform-minigame.js:117-125`：
```js
  var trapPlayer = {
    x: 0,
    y: 0,
    w: 22,
    h: 34,
    vx: 0,
    vy: 0,
    onGround: false,
  };
```
改为：
```js
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
```

- [ ] **Step 3: 新增模块级 `playerSprites` 加载器**

在 `player` 对象声明之后（原 `:50` 行所在的语句之后、`var spike = ...` 之前）插入：
```js
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
  playerSprites.idle.src = "img/platform-player/character_beige_idle.png";
  playerSprites.walkA.src = "img/platform-player/character_beige_walk_a.png";
  playerSprites.walkB.src = "img/platform-player/character_beige_walk_b.png";
  playerSprites.jump.src = "img/platform-player/character_beige_jump.png";
```
注：`onerror` 不挂回调即可——任一图加载失败 `loaded` 达不到 4，`allLoaded` 保持 false，`drawCharacter` 会退回矩形（见 Task 4）。

- [ ] **Step 4: 浏览器加载验证**

打开 `index.html` 进入平台小游戏（任意方式启动静态服务后），打开 DevTools Console，输入：
```js
playerSprites
```
（该变量在 IIFE 闭包内，Console 直接访问不到——改用 Network 面板验证）
Expected: Network 面板能看到 4 个 `character_beige_*.png` 请求，状态 200。Console 无 `Uncaught ReferenceError`。游戏仍能正常显示原矩形玩家（此时绘制点尚未替换）。

- [ ] **Step 5: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Add sprite loader and animation fields to platform player"
```

---

### Task 3: 新增 deriveCharacterAnim 与 drawCharacter helper

**Files:**
- Modify: `js/platform-minigame.js`（在 `draw()` 函数定义之前插入两个新函数，例如 `:2454` `function draw() {` 之前）

- [ ] **Step 1: 插入 `deriveCharacterAnim` 函数**

在 `function draw() {`（约 `:2454`）之前插入：
```js
  var RUN_SPEED_THRESHOLD = 8;
  var RUN_FRAME_DURATION = 0.1;

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
```

- [ ] **Step 2: 插入 `drawCharacter` 函数**

紧接 `deriveCharacterAnim` 之后插入：
```js
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
    ctx.drawImage(img, 0, 0, 128, 128, dx, dy, dw, dh);
    ctx.restore();
  }
```
说明：
- `dh = h * 1.45`（约 49px），`dw = dh`（精灵方形，不压扁）。
- 脚对齐碰撞盒底：`dy = p.y + p.h - dh`；水平居中：`dx = p.x + p.w/2 - dw/2`。
- 朝左翻转用 `translate`+`scale(-1,1)`，绘制源为完整 128×128，目标 `dw×dh`。
- `jump` 与 `fall` 共用 jump 帧。

- [ ] **Step 3: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出，退出码 0（该文件是纯 JS，`node --check` 仅做语法校验）。

- [ ] **Step 4: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Add deriveCharacterAnim and drawCharacter helpers"
```

---

### Task 4: 替换两处矩形绘制点为 drawCharacter

**Files:**
- Modify: `js/platform-minigame.js:2488-2489`（`draw()` 中 `player` 绘制）
- Modify: `js/platform-minigame.js:2439-2445`（`drawTrapPlayback()` 中 `trapPlayer` 绘制）

- [ ] **Step 1: 替换 `draw()` 中的 player 绘制**

把 `js/platform-minigame.js:2488-2489`：
```js
    ctx.fillStyle = "#111214";
    ctx.fillRect(Math.round(player.x), Math.round(player.y), player.w, player.h);
```
改为：
```js
    drawCharacter(player);
```

- [ ] **Step 2: 替换 `drawTrapPlayback()` 中的 trapPlayer 绘制**

把 `js/platform-minigame.js:2439-2445`：
```js
    ctx.fillStyle = "#111214";
    ctx.fillRect(
      Math.round(trapPlayer.x),
      Math.round(trapPlayer.y),
      trapPlayer.w,
      trapPlayer.h
    );
```
改为：
```js
    drawCharacter(trapPlayer);
```

- [ ] **Step 3: 浏览器验证（精灵加载完成时显示人物）**

打开 `index.html` 进平台小游戏第 1 关。
Expected:
- 玩家显示为 beige 人物（不再是深色矩形）。
- 待机显示 idle 帧。
- 左右走显示 walk_a/walk_b 交替。
- 起跳与下落显示 jump 帧。
- 脚与平台顶面对齐，不悬空不沉入。

- [ ] **Step 4: 浏览器验证（降级）**

在 DevTools Network 面板把 `character_beige_idle.png` 设为 Block request domain（或临时把该文件重命名），刷新。
Expected: 玩家退回 `#111214` 深色矩形，游戏不崩、可正常玩。验证后恢复文件。

- [ ] **Step 5: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Render platform player and trap player via drawCharacter"
```

---

### Task 5: 在 update 与 updateTrapPlayback 中调用 deriveCharacterAnim

**Files:**
- Modify: `js/platform-minigame.js:1962-1968`（`update` 中 player 移动段）
- Modify: `js/platform-minigame.js:1903` 之后（`updateTrapPlayback` 中 trapPlayer 重力段之后）

- [ ] **Step 1: 在 `update` 末尾调用 deriveCharacterAnim**

定位 `update` 函数中 player 的水平移动与重力更新完成之后。最稳妥的插入点是 `update` 函数 return 之前最后一处——但为避免遗漏，选择在 `player.x += player.vx * dt;`（`:1968`）所在逻辑块之后、关卡碰撞判定之前不合适（会被后续 `return` 跳过）。

实际做法：在 `update` 函数体的最末尾（`function update(dt)` 的最后一个语句之后、闭合 `}` 之前）加：
```js
    deriveCharacterAnim(player, dt);
```

先读 `update` 函数末尾确认插入点：
```bash
grep -n "^  function update" js/platform-minigame.js
```
找到 `function update(dt)` 起始行后，用编辑器定位其闭合 `}`，在闭合前插入上面那行。

- [ ] **Step 2: 在 `updateTrapPlayback` 中调用 deriveCharacterAnim**

定位 `updateTrapPlayback`。在 `trapPlayer.vy += Math.round(H * 3.8) * dt;` 与 `trapPlayer.y += trapPlayer.vy * dt;`（约 `:1903-1904`）之后、该函数闭合 `}` 之前加：
```js
    deriveCharacterAnim(trapPlayer, dt);
```

- [ ] **Step 3: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出，退出码 0。

- [ ] **Step 4: 浏览器验证（动画状态切换）**

打开 `index.html` 进平台小游戏。
Expected:
- 静止：idle 帧。
- 按住左/右：walk_a/walk_b 交替（约 10 fps）。
- 起跳：jump 帧；下落：jump 帧（复用）；落地立即切回 idle 或 run。
- 进 stage 12 陷阱回放编辑器，运行回放：trapPlayer 显示人物并按状态切换动画。

- [ ] **Step 5: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Drive player and trap player animation state from physics"
```

---

### Task 6: 接入 facing 朝向（键盘 + 触屏）

**Files:**
- Modify: `js/platform-minigame.js:2519-2520`（`setKey`）
- Modify: `js/platform-minigame.js:2796-2806`（触屏方向回调）

- [ ] **Step 1: 在 `setKey` 中更新 facing**

把 `js/platform-minigame.js:2518-2520`：
```js
  function setKey(code, down) {
    if (code === "KeyA" || code === "ArrowLeft") keys.left = down;
    else if (code === "KeyD" || code === "ArrowRight") keys.right = down;
```
改为：
```js
  function setKey(code, down) {
    if (code === "KeyA" || code === "ArrowLeft") {
      keys.left = down;
      if (down) player.facing = -1;
    } else if (code === "KeyD" || code === "ArrowRight") {
      keys.right = down;
      if (down) player.facing = 1;
    }
```

- [ ] **Step 2: 在触屏方向回调中更新 facing**

读 `:2796-2806` 附近的触屏回调：
```bash
sed -n '2790,2810p' js/platform-minigame.js
```
找到形如 `if (dir === "left") keys.left = true;` 与 `if (dir === "left") keys.left = false;` 的两处，分别改为：
```js
          if (dir === "left") { keys.left = true; player.facing = -1; }
          else if (dir === "right") { keys.right = true; player.facing = 1; }
```
与：
```js
          if (dir === "left") keys.left = false;
          else if (dir === "right") keys.right = false;
```
（松开时不改 facing，保持上一朝向——符合设计。）

- [ ] **Step 3: 在 updateTrapPlayback 中更新 trapPlayer.facing**

在 `updateTrapPlayback` 中 `trapPlayer.vx = want * speed;`（`:1883`）之后插入：
```js
    if (want < 0) trapPlayer.facing = -1;
    else if (want > 0) trapPlayer.facing = 1;
```

- [ ] **Step 4: 语法检查**

Run:
```bash
node --check js/platform-minigame.js
```
Expected: 无输出，退出码 0。

- [ ] **Step 5: 浏览器验证（朝向翻转）**

打开 `index.html` 进平台小游戏。
Expected:
- 按右走：人物面朝右。
- 按左走：人物水平翻转，面朝左。
- 松开后保持当前朝向不动。
- 陷阱回放中 trapPlayer 朝移动方向翻转。

- [ ] **Step 6: 提交**

```bash
git add js/platform-minigame.js
git commit -m "Drive player facing from keyboard, touch, and trap playback"
```

---

### Task 7: 回归与碰撞不变性验证

**Files:** 无修改，仅验证。

- [ ] **Step 1: 碰撞盒不变性确认**

打开 `js/platform-minigame.js`，确认 `player.w`/`player.h` 仍为 22/34，`trapPlayer` 同。Run:
```bash
grep -n "w: 22, h: 34" js/platform-minigame.js
```
Expected: 仍能在 `player` 与 `trapPlayer` 声明处看到 22/34。

- [ ] **Step 2: 端到端通关验证**

打开 `index.html` 进平台小游戏，依次手动验证：
- 第 1 关：走、跳、进门。
- 第 4 关（中间裂开）：坠落死亡 → 重开，行为与改前一致。
- 第 6 关（绿箱+门搬家）：箱子推动、跳跃过箱。
- 第 8 关（四波木箱）：箱子碰撞、刺致死。
- 第 12 关（鼠标拖拽）：玩家 idle，拖门走进去。
Expected: 所有碰撞、死亡、过关逻辑与改前一致；玩家视觉为 beige 人物。

- [ ] **Step 3: 提交最终状态（若前面有未提交改动）**

```bash
git status
```
若干净则跳过；否则：
```bash
git add -A
git commit -m "Finalize platform player sprite integration"
```

---

## 自审

**1. Spec coverage：**
- 资源放置 4 PNG → Task 1 ✓
- player/trapPlayer 加 facing/anim 字段 → Task 2 ✓
- playerSprites 加载器 + 降级 → Task 2/3/4 ✓
- deriveCharacterAnim 状态机（idle/run/jump/fall，fall 复用 jump）→ Task 3 ✓
- drawCharacter（缩放 1.45、脚对齐、朝左翻转、未加载退回矩形）→ Task 3 ✓
- 替换 `:2488` → Task 4 Step 1 ✓
- 替换 `:2439` trapPlayer（spec amendment）→ Task 4 Step 2 ✓
- update 中调用 derive → Task 5 ✓
- 陷阱回放共用绘制 → Task 4/5/6 ✓
- facing 接入（键盘+触屏+trap）→ Task 6 ✓
- 测试方式（浏览器手动 7 项）→ Task 4/5/6/7 ✓
- YAGNI（不做 climb/duck 等）→ 计划未涉及，符合 ✓

**2. Placeholder scan：** 无 TBD/TODO。Task 5 Step 1 的"用编辑器定位闭合 `}`"给出 `grep` 命令而非模糊描述；Task 6 Step 2 给出 `sed` 命令定位具体行。代码块均完整。

**3. Type/命名一致性：** `facing`/`anim`/`animT`/`walkPhase` 在 player、trapPlayer、helper 中一致；`playerSprites.idle/walkA/walkB/jump/loaded/allLoaded` 在加载器、`drawCharacter`、`markSpriteLoaded` 中一致；`deriveCharacterAnim`/`drawCharacter`/`RUN_SPEED_THRESHOLD`/`RUN_FRAME_DURATION` 在定义与调用处一致。✓

**4. Spec amendment 已标注**：trapPlayer 覆盖在计划顶部与 Task 4/5/6 中明确，未与原 spec 冲突，仅扩大一致性范围。

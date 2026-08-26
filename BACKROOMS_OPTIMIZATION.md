# Backrooms 代码优化清单

> 审查范围：Backrooms 后室生存游戏（`backrooms-level*.html` + `js/backrooms-*.js` + `css/backrooms-*.css`）
> 技术栈：Three.js 第一人称，多页面架构（非 SPA），5 个关卡用 sessionStorage 传参 + `window.location.href` 跳转
> 严重程度图例：🔴 高 / 🟡 中 / ⚪ 低（仅整理清单，未修改任何代码）

## 代码总览

- **5 个关卡**：`backrooms-level0.html` → `level1` → `level2` → `level3` → `level283`，每关一个独立 HTML + JS 入口
- **共享模块**：survival / collide / inventory / temperature / horror / interact-aim / night-vision / meg-points 等
- **关卡世界生成**：`backrooms-level1-world.js`(1595 行) / `level2-world.js` / `level3-world.js` / `level2-doors.js`

---

## 一、架构：跨关卡大规模代码重复（最值得做）

### 🔴 1. 五个关卡各写一份 FPS 控制器，约 1500 行重复
**位置**：`backrooms-level0.js` / `level1.js` / `level2.js` / `level3.js` / `level283.js` 中各自定义 `movePlayer` / `updatePlayerPhysics` / `bindControls` / `syncLookUi` / `onResize` / `isTouchPrimaryDevice` / `showLootToast` / `enforceEntryOrRedirect`

**问题**：`movePlayer` 的输入归一化与 yaw→世界坐标变换在 5 个文件里几乎逐字相同；`bindControls` 的 keydown/keyup 映射、mousemove、pointerlockchange、resize 监听在 5 处重复。L0 还自带一份本地 `resolveCircleAabbXZ`，与共享模块 `backrooms-collide.js` 的 `resolveCircleAgainstColliders` 功能重叠。

**建议**：抽取 `backrooms-fps-controller.js` 共享模块，各关卡只传配置（速度、重力、colliders 来源、hint 文案、交互键）。预计可削减约 1500 行重复代码，且修一个 bug 五关同步生效。

### 🔴 2. Level 3 / Level 283 完全缺失移动端拖动视角
**位置**：`backrooms-level3.js:276-325`、`backrooms-level283.js:185-232`（均无 `useDragLook` / `lookDragId` / `isTouchPrimaryDevice` / `pointermove` 拖动逻辑）

**问题**：L0/L1/L2 都实现了触屏拖动转视角（`useDragLook` + `pointermove` + `MOBILE_LOOK_SENS_MULT`），但 L3 和 L283 完全没有。手机上进入这两关**无法转动视角**，只能靠 pointerLock（触屏不支持）→ 卡死。这是功能性 bug，被 `isTouchPrimaryDevice` 在这两关缺失掩盖。

**建议**：随 1 号共享 FPS 控制器一起统一，让五关移动端行为一致。

### 🟡 3. `enforceEntryOrRedirect` 在 L3 / L283 / L2 / L1 各写一份
**位置**：`level3.js:200`、`level283.js:82`、`level2.js:112`、`level1.js:931`

**问题**：令牌校验 + yaw 传递 + reload 检测 + 失败回跳逻辑复制 4 份，仅 sessionStorage key 前缀不同。

**建议**：抽成 `enforceLevelEntry(passKey, yawKey, fallbackUrl)` 工厂。

### ⚪ 4. sessionStorage key 散落 14 处，无集中管理
**位置**：`backrooms-survival.js:34-44` 的 `resetBackroomsRun` 手动列了 13 个 key（`backrooms_clip_pass` / `backrooms_l2_pass` / `backrooms_l3_pass` …），各关卡又各自读写。

**问题**：新增关卡/状态时极易漏改 `resetBackroomsRun`，导致跨局状态泄漏（上一局背包/夜视/积分带进新局）。已存在风险点：`resetBackroomsRun` 没清 `backrooms_meg_points`（靠 L0 init 主动调 `resetMegPoints`），也没清某些 yaw key。

**建议**：用一个常量对象 `SESSION_KEYS` 集中声明，`resetBackroomsRun` 遍历该对象统一清理。

---

## 二、性能：Three.js 资源与渲染

### 🔴 5. Level 2 / Level 3 约 48 个 PointLight，拖慢移动端渲染
**位置**：`backrooms-level2-world.js:322-330, 382-390`（每 lampStep 一盏 PointLight，4 条臂 × 约 12 盏 ≈ 48 盏）；`backrooms-level3-world.js:272-274`（限流 ≤48，见 `:257`）

**问题**：Three.js 标准 WebGL 渲染对动态 PointLight 数量极敏感，每光源增加逐片元着色开销，48 个点光在中低端 GPU/手机上会显著掉帧。

**建议**：大幅削减 PointLight（1-2 个跟随玩家的光 + emissive 灯体 mesh 模拟发光），或改用 InstancedMesh + LightProbe/烘焙。

### 🔴 6. Level 1 流式区块加载显存泄漏
**位置**：`backrooms-level1-world.js:1149-1163`（每区块 new 2 个 PlaneGeometry）、`1277-1283`（`unloadChunk` traverse 回调为空，不 dispose）、`1376-1386`（`dispose()` 只移除 group，不释放 geometry/material/texture）

**问题**：Level 1 是"无限"流式世界，玩家移动时不断加载/卸载区块，但卸载时不调用 `geometry.dispose()`/`material.dispose()`/`texture.dispose()`。CanvasTexture（wallMap/floorMap/signTex/rainbowTex/badgeTex）也从不释放 → 长时间游玩显存持续增长。

**建议**：`unloadChunk` 对非共享 geometry 调 dispose；区块的 floor/ceiling PlaneGeometry 共享一个模块级实例（尺寸固定 36×36）。

### 🔴 7. Level 1 碰撞检测全量线性遍历，无空间分区
**位置**：`backrooms-collide.js:60-93` 的 `resolveCircleAgainstColliders`（配合 `level1-world.js` 的 `ctx.colliders` 全局数组）

**问题**：对 colliders 数组做 `for i=0..length` 全量遍历 × maxIter 次，虽有 `nearPad` 预筛选仍是 O(n)。Level 1 流式世界随游玩 colliders 增长到数百~上千，每帧碰撞成本随之上升。`unloadChunk` 用 `indexOf`+`splice` 移除碰撞器是 O(n) 每个，O(n²) 每次卸载。

**建议**：引入网格哈希（按 `BLOCK_SIZE` 分桶）或 BVH；collider 对象挂 `_idx` 字段实现交换删除。Level 3 已用网格局部遍历（`level3-world.js:172-197`）可作为参考模式。

### 🟡 8. Level 0 帧循环每帧读 sessionStorage + 写 DOM
**位置**：`backrooms-level0.js:1037`（frame 内）→ `backrooms-meg-points.js:16-26,43-46`

**问题**：`updateMegPointsDisplay(megPointsEl)` 每帧调用，内部 `getMegPoints()` 每次执行 `sessionStorage.getItem` + `parseInt` + 校验，再 `el.textContent = String(n)`。60fps 下每秒 60 次无谓 storage 读取 + DOM 写入（积分绝大多数帧不变）。L1/L2/L3 只在事件触发时更新，无此问题。

**建议**：改为推模式（`addMegPoints`/`setMegPoints` 时更新 DOM），或帧内缓存上次值做脏检查。

### 🟡 9. Level 0 像素比上限 2，移动端最耗性能
**位置**：`backrooms-level0.js:954`（`setPixelRatio(min(dpr, 2))`），且 L0 是唯一开 `antialias: true` 的关卡（`:952`）

**问题**：5 关像素比设置不一致（L0=2、L1=1、L2/L3/L283=1.5），L0 在高 DPI 手机（dpr=3）上按 2 渲染 + 开抗锯齿，负载最重。

**建议**：统一策略，移动端（`isTouchPrimaryDevice`）一律 clamp 到 1.5 或更低，L0 关掉 antialias 或按设备分级。

### 🟡 10. Level 2 每个墙块/灯/管道都新建 Geometry，未实例化
**位置**：`backrooms-level2-world.js:97,322-330,343-345,382-390,403-405,467-479`

**问题**：`addWallSegment` 每次新建 BoxGeometry（墙厚/高度固定，仅长度变）；每盏灯新建 SphereGeometry + PointLight；每根管道新建 CylinderGeometry。约 48 灯 + 12 管道 + 8 墙段全是独立 geometry，无法 InstancedMesh。L1/L3 墙体已用 InstancedMesh，L2 落后。

**建议**：同规格 geometry 缓存；灯球/管道用 InstancedMesh。

### 🟡 11. Level 2 门动画每帧 `new THREE.Box3()`
**位置**：`backrooms-level2-doors.js:295,305`（`refreshDoorWorldCollider`/`refreshDoorPassage` 在 `openAmount>0.4` 时每帧调用，内部 `new THREE.Box3().setFromObject(...)`)

**问题**：开门动画期间每帧分配 Box3 + 内部 Vector3，产生 GC 压力。

**建议**：复用一个模块级 Box3 scratch。

### 🟡 12. Level 1 M.E.G 基地同步构建造成单帧卡顿
**位置**：`backrooms-level1-world.js:1365-1368`（`update` 同步调 `buildMegAlphaBase`）、`445`（`buildMegHiddenCorridor` 后门打开时同步构建）

**问题**：玩家走到第 5 个区块时，`update` 同步新建大量 Mesh（墙/屋顶/NPC×2/标牌 canvas 纹理/灯条），可能造成单帧数百 ms 卡顿。

**建议**：大型建筑分帧生成或预构建隐藏。

### ⚪ 13. Level 1 NPC 每个都新建材质 + canvas 纹理
**位置**：`backrooms-level1-world.js:497-549`（3 个 NPC 各建 3 套 MeshLambertMaterial + badge CanvasTexture）

**建议**：NPC 材质/几何体模块级缓存，badge 纹理只生成一次。

### ⚪ 14. Level 3 hazards 用 `Math.hypot` 做距离判定
**位置**：`backrooms-level3-hazards.js:69-93`（每帧对每个 hazard 调 `Math.hypot(px-h.x, pz-h.z)`）

**建议**：改平方距离 `(dx*dx+dz*dz > R*R)` 避免 sqrt。

---

## 三、正确性 Bug 与隐患

### 🔴 15. Level 1 模块级 MEG 状态 dispose 时不重置，二次进关逻辑错乱
**位置**：`backrooms-level1-world.js:40-51,482-485,1376-1386`

**问题**：`_megBaseCenter` / `_megBaseOccluderGroup` / `_megDoorState` / `_megBackDoorState` / `_megCorridorState` / `_megCorridorFootprint` / `_megInteriorNpc` / `_megBackDoorStaffNpc` 都是模块级 var，`dispose()` 没置回 null。玩家离开 L1 再回来重新调 `buildBackroomsLevel1World` 时，`buildMegAlphaBase` 里 `if (_megCorridorState) return _megCorridorState` 会返回旧状态，导致第二次进入 L1 时 M.E.G 基地/门/走廊逻辑全部错乱。

**建议**：dispose 时把所有模块级状态置 null。

### 🟡 16. Level 1 宝箱异步回调可能写入已卸载的旧 group
**位置**：`backrooms-level1-world.js:1055-1098,1205-1219`

**问题**：`ensureChestTemplate` 的 GLB 加载回调检查了 `ctx.chunks.has(key)`，但闭包捕获的 `group`/`record` 是旧 chunk 的。若加载期间玩家移远又折返，新 chunk 复用同 key 时回调可能把宝箱加到已脱离场景树的旧 group 上（宝箱不可见）。

**建议**：回调内额外校验 `record.group.parent` 仍在场景树。

### 🟡 17. Level 2 门布局 sessionStorage 缓存缺范围校验
**位置**：`backrooms-level2-doors.js:39-64`

**问题**：`getOrCreateLevel2DoorLayout` 用固定 key `backrooms_l2_doors_v2` 缓存门 `arm`/`pos`，但只校验 `parsed.l3 && parsed.l283` 存在，不校验 `arm` 合法性、`pos` 是否在 `[hubEdge+6, halfLen-8]` 范围内。若代码改了 `CORRIDOR_LENGTH` 等参数而忘升版本号，旧缓存的 `pos` 可能让门卡在墙外或十字中心。版本号 `v2` 靠手动维护易漏。

**建议**：校验 pos 范围；或把 `halfLen`/`hubEdge` 写入缓存一起校验。

### 🟡 18. Level 2 `splitWallCollider` 找不到目标时静默失败
**位置**：`backrooms-level2-doors.js:86-148`

**问题**：门洞"挖洞"逻辑若找不到匹配墙段（容差判断失败），函数静默返回 → 门洞处保留整面墙碰撞器，视觉门开了但玩家穿不过去。容差依赖墙段 minX 精确等于 `-halfW-WALL_THICK`，参数一调就会悄悄断。

**建议**：找不到时打 `console.warn` 便于排查。

### 🟡 19. Level 3 audio 模块 Oscillator 永不停止，无 stop/close
**位置**：`backrooms-level3-audio.js:17-51`（无 `stopLevel3Hum` 导出），`level3.js` 无 `pagehide`/`visibilitychange` 清理

**问题**：3 个 Oscillator + 3 个 Gain + AudioContext 全部 `start()` 后无 `stop()`。多页面跳转时页面卸载可回收，但浏览器后台挂起/SPA 场景下嗡鸣持续；AudioContext 被 suspend 后再 resume，oscillator 已 started 无法重启音频图。

**建议**：加 `stopLevel3Hum()`（osc.stop + disconnect + ctx.close），转场/`pagehide` 时调用。

### ⚪ 20. Level 1 出生点搜索半径过小
**位置**：`backrooms-level1-world.js:1572`（`SPAWN_SAFE_CELL_RADIUS=0`，`for ring<=2`）

**问题**：出生格附近若被墙/宝箱占满，可能找不到 clear cell，落到 `resolveCircleAgainstColliders` 兜底，可能把玩家弹进墙里。

**建议**：扩大搜索半径或保证出生格周围有空地。

### ⚪ 21. survival-persist 的 `refreshHud` 失败被静默吞掉
**位置**：`backrooms-survival-persist.js:35`

**问题**：`loadBackroomsSurvival` 调 `survival.refreshHud()`，若该方法异常会被 catch 吞掉返回 false，玩家以满血开始而非读档，无任何提示。

**建议**：调用前显式校验 `typeof survival.refreshHud === "function"`，或区分 parse 错与 refreshHud 错。

### ⚪ 22. Level 3 迷宫 `carve` 用递归 DFS
**位置**：`backrooms-level3-world.js:48-71`

**问题**：36×36 当前安全，但若未来调大迷宫尺寸会爆栈。

**建议**：改显式栈迭代，防扩展踩坑。

### ⚪ 23. Level 3 audio：osc2 旁路 humGain，LFO 只调制 osc1
**位置**：`backrooms-level3-audio.js:32-39`（osc2 → g2 → destination，绕过 humGain）

**问题**：LFO 颤音只作用于 osc1，osc2 音量恒定。可能是设计意图但无注释，易被误读为 bug。

**建议**：加注释说明意图。

---

## 四、死代码与可维护性

### 🟡 24. `backrooms-compass.js` 是完全死代码
**位置**：`js/backrooms-compass.js`（10 行）+ `css/backrooms-level0.css:386-454`（70 行 `.backrooms-compass*` 样式）

**问题**：`updateBackroomsCompass` 从未被任何 JS/HTML 引用（grep 全仓零命中），配套 CSS 70 行也是死的。疑似曾计划做指南针但未接入。

**建议**：确认是否要接入；否则删除文件 + CSS。

### ⚪ 25. Level 2/3 墙体地板纹理生成函数几乎完全重复
**位置**：`backrooms-level2-world.js:17-84` vs `backrooms-level3-world.js:98-147`（L3 函数名甚至叫 `createLevel2Style...`）

**建议**：抽 `backrooms-textures.js`，参数化 repeat/noiseCount。

### ⚪ 26. `mulberry32` PRNG 在 L2-doors 和 L3 各复制一份
**位置**：`backrooms-level2-doors.js:14-22` vs `backrooms-level3-world.js:14-22`

**建议**：抽 `backrooms-rng.js`。

### ⚪ 27. L2/3 墙体/地板/管道/灯 Material 配置重复
**位置**：`backrooms-level2-world.js:436-493` vs `backrooms-level3-world.js:298-333`（wallMat 0x3a3a44、floorMat 0x2a2a32、lampMat 等几乎一字不差）

**建议**：抽共享材质工厂。

### ⚪ 28. Level 2 `decorateZArm` 与 `decorateXArm` 轴对称重复
**位置**：`backrooms-level2-world.js:303-361` vs `363-421`（约 60 行 ×2，仅 X/Z 轴互换）

**建议**：参数化轴向合并成一个函数。

---

## 五、CSS

### 🟡 29. `backrooms-level0.css` 无 CSS 变量，63 处硬编码颜色
**位置**：`css/backrooms-level0.css` 全文（`rgba(0,0,0,0.72)` 多处、`#c8e6ff`、`#ffe8a8` 等主题色反复硬编码，无 `:root` 变量）

**建议**：在 `:root` 定义 `--br-bg-overlay`/`--br-accent-blue`/`--br-accent-amber` 等，HUD 各组件引用，便于统一改主题。

### ⚪ 30. `backrooms-survival.css:139` 滥用 `!important`
**位置**：`.br-pack[hidden] { display: none !important; }`（因 `.br-pack` 用 `display:flex` 覆盖了 `hidden` 默认行为而被迫加）

**建议**：全局 `[hidden] { display: none !important; }` 一次解决，或改用 class 切换显示。

### ⚪ 31. 两个 pulse keyframes 几乎相同
**位置**：`backrooms-level0.css:195-198`（`backrooms-clip-pulse`）vs `228-231`（`backrooms-overheat-pulse`），opacity 仅差 0.03

**建议**：合并为单一 `backrooms-pulse`，duration 不同即可。

### ⚪ 32. 移动端 `@media (max-width:720px)` 重复父规则声明
**位置**：`backrooms-level0.css:85-93`（媒体查询里重复了父规则的 `left/right/transform`）

**建议**：媒体查询只保留真正需覆盖的 `bottom`/`max-width`。

### ⚪ 33. 疑似死选择器 `.backrooms-level1 .backrooms-hud__title--l1` 在 L0 CSS 中
**位置**：`backrooms-level0.css:145-147`

**建议**：确认是否生效，否则移至 L1 专属 CSS。

---

## 优先级建议

### 第一梯队（性能 + 功能 bug，建议优先）
- ① 抽取共享 FPS 控制器，顺带修复 L3/L283 移动端无法转视角（#1、#2）
- ② Level 1 流式区块显存泄漏 + 碰撞全量遍历 + MEG 状态不重置（#6、#7、#15）
- ③ 削减 L2/L3 约 48 个 PointLight（#5）
- ④ Level 0 帧循环每帧读 storage 写 DOM（#8）

### 第二梯队（隐患 + 可维护性）
- L1 宝箱异步回调（#16）、L2 门缓存校验（#17）、L2 静默失败（#18）、L3 audio 泄漏（#19）
- 删除 compass 死代码（#24）、sessionStorage key 集中管理（#4）

### 第三梯队（清理 + 微优化）
- 纹理/RNG/材质函数去重（#25-28）、CSS 变量化（#29）、各种 ⚪ 项

---

## 质量亮点（可作其他关卡参考）

- **Level 3 碰撞**用网格局部遍历（`level3-world.js:172-197`），只查玩家周围格子，是 4 个 world 文件里碰撞设计最好的
- **Level 1 墙体**用 InstancedMesh（`level1-world.js:1226`），渲染开销低
- **Level 3 限流** PointLight ≤48（`level3-world.js:257`），有上限意识
- **hazards 的 VFX** geo/material 用模块级单例复用（`level3-hazards.js:10-33`）
- **survival-persist** 容错完整：parse 失败返回 false，每字段 `Number.isFinite` 校验 + 钳制到 0-100

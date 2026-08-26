# Backrooms 代码 V4 复审报告（新增内容）

> 本报告聚焦最近 2 个提交（`ca415c9` Add Level 283 party level, Clump AI, and Backrooms collision fixes + `831573a` Add Level 57 yellow room and fix L283 table search state）的**新增内容**，从 Bug / 性能 / 可玩性 / 丰富度 四个维度复审。
>
> 新增内容：Level 57 黄色房间（枢纽房 + 画家 NPC）、Level 283 派对层重写（多区域复合关 + 球池轮盘 + 管道爬行）、Clump 肢团敌人（跨 4 关卡投放）、Partygoer 派对人（建模未接入）、碰撞修复、painter-man.glb 模型。
>
> 严重程度图例：🔴 高 / 🟡 中 / ⚪ 低。仅整理清单，未修改任何代码。

---

## 〇、V3 建议采纳情况

先说明上一轮 V3 报告指出的高优先级问题在这 2 个提交里的采纳情况——**整体未修旧债，专注新增内容**：

- ❌ **L4 流式 `unloadChunk` 不 dispose（V3 Bug#1，最严重显存泄漏）**——`level4-world.js:464` 仍只 `parent.remove(group)` 不 dispose。
- ❌ **移动端触控移动 UI（V3 Bug#2）**——仍只有 `attachMobileDragLook` 拖动视角，无虚拟摇杆/移动/跳跃/交互按钮。手机端能转头但不能走动，仍不可玩。可玩性 agent 所称"移动端补齐"实为**拖动视角**，非触控移动。
- ❌ **L3 玩家碰撞改 grid（V3 性能#4）**——`level3.js:484` 仍用全量 `wallColliders` + `nearPad=14`，玩家未改用 `resolveCircleAgainstLevel3Maze`（飞蛾/Clump 已用 grid，唯独玩家仍全量）。
- ❌ **`pushOutCircleAABB` 每帧对象分配（V3 性能#5）**——`collide.js:14` 仍返回 `{x,z}` 字面量。
- ❌ **gfx-profile 仅 L0 接入（V3 性能#10）**——L57/L283 新关卡也硬编码 `antialias:false` 未接入 profile。
- ⚠️ **session-keys 部分改善**——补了 `backrooms_l57_pass`/`backrooms_l57_yaw`（`session-keys.js:38-39`），但 V3 指出的 `l3_yaw`/`l283_yaw`/`enter_banner`/`clip_yaw` 仍遗漏，且新增的 `backrooms_l283_meg_exit_v1` 也未注册（见 Bug#4）。
- ✅ **LEVEL02_BIG_DAMAGE 已修**（V3 之前已确认）。

---

## 一、Bug 维度（新增内容引入）

### 🟡 1. L283 桌子搜索标记在获取杏仁水之前——背包满时永久丢失杏仁水（已核实）
- 位置：`js/backrooms-level283.js:296`
- 现状：`tryTableAlmond(tableId)` 在第 296 行调用 `markTableSearched(tableId)`，发生在第 302 行 `survival.addItem(...)` 成功判定之前。如果背包已满（`addItem` 返回 false），桌子已被标记为"已搜过"，但 `markAlmondTaken()`（第 306 行）未被调用，杏仁水未被取走。
- 触发：玩家背包装满时逐个搜索 7 张桌子 → 每张都返回"背包已满"但被标记为已搜 → 清出空间再回来 → 所有桌子显示"已搜过" → 本层唯一的杏仁水被永久丢失。
- 建议：将 `markTableSearched(tableId)` 移到 `addItem` 成功之后。

### 🟡 2. Clump 在 L2 生成于走廊墙体外侧——潜行被墙永久阻挡（已核实）
- 位置：`js/backrooms-clump-ai.js:321`（`offsetBesideCorridor(mothPos, 2.4)`）
- 现状：L2 走廊宽 `CORRIDOR_WIDTH=2.9`（`level2-world.js:8`，halfW=1.45），外墙在 x=1.59（halfW + WALL_THICK=0.14）。肢团侧向偏移 2.4m 生成在 x≈2.4，在墙外 0.81m 处。潜行（creep）阶段向玩家移动时被墙碰撞体阻挡在墙外表面，永远无法通过正常移动接近玩家。
- 触发：玩家进入 L2 实体所在走廊臂，肢团发现玩家但潜行无效，只能在 9m 内触发突刺（lunge）穿墙攻击。
- 建议：偏移量从 2.4m 改为 ≤1.0m（走廊半宽减去肢团半径），使肢团在走廊内生成。

### 🟡 3. Clump 突刺（lunge）绕过碰撞检测——穿墙攻击玩家
- 位置：`js/backrooms-clump-ai.js:182-185`（突刺期间直接设位置，未调用 `moveClump`）；`:216-218`（触发判定无视线检测）
- 现状：突刺分支（`lungeLeft > 0`）直接设置 `clump.x/z` 和 `clump.group.position`，不经过 `moveClump()` 的碰撞解算。同时触发判定仅检查距离 `toPlayerSq <= seeSq`，无视线/墙壁遮挡检查。肢团可以隔着墙壁发现玩家并穿过墙壁突刺攻击。
- 触发：L3 迷宫中，肢团与玩家之间有迷宫墙时，肢团仍能发现玩家（14m 内）并突刺穿墙攻击（9m 内）；L2 配合 Bug#2 从墙体外侧穿墙突入走廊。
- 建议：突刺位移也经过 `moveClump` 碰撞解算，或触发突刺前增加视线检测（raycast 检查墙遮挡）。

### 🟡 4. Partygoer 整套建模 + 预览页零实战接入（死代码）（已核实）
- 位置：`js/backrooms-partygoer.js`（229 行建模 + `buildPartygoerFigure`/`spawnPartygoer`）；`partygoer-preview.html`
- 现状：全仓 grep 确认除自身定义文件外**无任何文件 import 或 spawn 它**。`backrooms-level283*.js` 及其他关卡均未引用。Partygoer 不是派对层特有——根本未在游戏中出现，威胁等级 = 0。
- 影响：229 行建模代码 + 227KB 参考图 + 预览页是"半成品"资产，占用维护成本却无产出。
- 建议：要么在 L283 派对层接入 Partygoer（spawn 若干只，作为派对层氛围/威胁），要么删除避免误导。

### ⚪ 5. `backrooms_l283_meg_exit_v1` 未注册到 session-keys 清理列表
- 位置：`js/backrooms-session-keys.js:21-54`（列表缺少）；`js/backrooms-meg-checkpoint.js:328`（`L283_MEG_EXIT_FLAG = "backrooms_l283_meg_exit_v1"`）
- 现状：`ca415c9` 在 meg-checkpoint 新增了 `L283_MEG_EXIT_FLAG`，但未加入 `BACKROOMS_SESSION_KEYS`。`clearAllBackroomsSessionKeys()` 不会清除该 flag。若玩家从 L283 切出至 M.E.G 基地（设置 flag）后未正常抵达 L1（如标签页关闭后重开、中途导航到其他关卡），flag 残留 → 下次进 L1 时 `consumeL283MegExitFlag()` 返回 true，玩家被意外传送到 M.E.G 基地。
- 建议：`BACKROOMS_SESSION_KEYS` 补 `"backrooms_l283_meg_exit_v1"`。

### ⚪ 6. L1.1 子区域 dispose 未调用 Clump figure.dispose()——材质泄漏
- 位置：`js/backrooms-level1-1-zones.js:1128-1129`
- 现状：`dispose()` 中 `corridor3Clump = null; corridor4Clumps = null;` 直接置空，未调用 `.dispose()`。`createClumpSystem` 返回的对象有 `dispose()` 方法（`clump-ai.js:286-290`），会释放每个肢团的 `coreMat`/`limbMat`/`darkMat`（3 个 MeshStandardMaterial）。走廊世界组被移除但材质驻留 GPU。
- 触发：玩家反复进出 L1.1 子区域（走廊 3/4），每次进出泄漏 5 个肢团 × 3 材质 = 15 个材质对象。
- 建议：置空前 `if (corridor3Clump) corridor3Clump.dispose(); if (corridor4Clumps) corridor4Clumps.dispose();`。

### ⚪ 7. L57 画家 GLB 加载后 fallback 网格未释放
- 位置：`js/backrooms-level57-world.js:207`（`root.remove(fallback)` 未 dispose）
- 现状：`spawnPainter` 先添加 `buildProceduralPainter()` 的 fallback 网格（6 个 MeshLambertMaterial + 7 个 BoxGeometry）。GLB 异步加载成功后回调执行 `root.remove(fallback)` 移除 fallback，但未 dispose 其 material/geometry，GPU 资源泄漏。单页生命周期内仅一次，影响较小。
- 建议：`root.remove(fallback)` 后遍历 fallback 子级 dispose。

### 已验证正常的区域（无新 Bug）
- L57 `ceilingY: L57_WALL_H(3.2)` + 默认 `bodyHeight:1.78` 配置正确，眼高度上限 3.07m < 天花板底面 3.15m，无穿模。
- L57 入场令牌 `l57_pass`/`l57_yaw` 在 session-keys 和 level-pass 均已注册。
- L283 管道模式（pipe mode）状态机与切换逻辑无死循环或不可达状态。
- Clump AI 在玩家死亡后正确停止更新（各关卡调用处均检查 `!survival.dead`）。
- L2 门布局冲突检测（`layoutConflictsWithEntities`）逻辑正确，存储布局与实体走廊臂冲突时正确重新生成。
- `setTimeout` 闭包未持有过期引用（`exitToLevel4`/`exitToLevel0` 均检查 `transitionLock`）。

---

## 二、性能维度（新增内容）

### ✅ 正面：新关卡 PointLight 大幅改进，吸取了 V3 教训
- **Level 57**（`level57-world.js`）：仅 2 个 PointLight（`:286` paintLight、`:296` 房间主灯）+ 1 个 AmbientLight。
- **Level 283**（`level283-world.js`）：仅 3 个 PointLight（`:329` 小丑画作、`:434` 入场房、`:437` 球池区）+ 1 个 AmbientLight。
- 对比 V3 指出的旧关卡 PointLight 泛滥（L0.2 ~32 个无守卫、L4 ~27 个随 chunk 增长），新关卡 2-3 个远低于 8 个阈值，**彻底解决了 PointLight 泛滥问题**。

### 🔴 1. L283 球池 120 个独立 geometry + 120 个独立 material（最严重）
- 位置：`js/backrooms-level283-world.js:196-206`
- 现状：球池 120 个球，循环内 `new THREE.SphereGeometry(0.11 + Math.random()*0.06, 6, 6)` + `pickMat(ballColors[i % ballColors.length], 0x111111)`，生成 **120 个独立 geometry + 120 个独立 material**（仅 6 种颜色，114 个 material 完全浪费）。120 draw call。
- 建议：改 InstancedMesh（1 geometry + 1 material + 120 矩阵），或至少共享 6 个 material + 用 scale 替代随机半径。120 draw call 可压缩为 1。

### 🟡 2. L283 桌子/沙发 geometry + material 重复创建
- 位置：`js/backrooms-level283-world.js:116-145`（`addTable` 7 张桌子）、`:147-166`（`addSofa` 9 组沙发）
- 现状：每张桌子 `new BoxGeometry(0.85,0.06,0.85)`（桌面）+ 4× `new BoxGeometry(0.07,0.72,0.07)`（桌腿），尺寸完全相同却各自创建。`pickMat(0xf0ece4)` 和 `pickMat(0xc8b898)` 每次调用都 `new MeshStandardMaterial`（`:23-29`），7 张桌子创建 7 个相同桌面 material + 7 个相同桌腿 material。沙发同理。
- 建议：共享 geometry + material（提为模块级 `_tableTopGeo`/`_tableLegGeo`/`_tableTopMat` 等）。

### ✅ 3. AI/实体 update 循环干净，无每帧 GC
- `clump-ai.js` `updateSingleClump`（`:170-259`）：全部标量运算（`distSq`/`faceToward`/`moveClump`），无 `new THREE.Vector3`/`Color`/`getWorldPosition`。
- `clump.js` `update(t)`（`:178-190`）：纯 `Math.sin` 标量赋值到 `rotation.z`/`position.y`。
- `partygoer.js` `update(t)`（`:187-196`）：同样纯标量。
- 对比 V3 指出的 `pushOutCircleAABB` 每帧分配大量临时对象，新敌人 update 干净。

### ✅ 4. 碰撞遍历合理
- **L3 Clump**（`clump-ai.js:141`）：调用 `resolveCircleAgainstLevel3Maze`（`level3-world.js:176`），只遍历玩家半径覆盖的格子，正确的空间网格查询，每 clump 每帧仅查 ~4-9 个格子。
- **L1.1/L2 Clump**（`clump-ai.js:145`）：调用 `resolveBackroomsMoveCollisions`（`collide.js:60`）遍历全量 colliders，但有 `nearPad=8` 距离早剔除。最大 4 只 clump，可接受。
- Partygoer 死代码无碰撞开销。

### ✅ 5. 纹理缓存正确 + GLTF 缓存正确
- `level57-world.js:228,261`：`yellowWallpaperTexture()`/`yellowRoomPaintingTexture()` 各调用一次缓存。
- `level283-world.js:228,307`：`rainbowStripeTexture()`/`clownPaintingTexture()` 各调用一次缓存。
- `level57-world.js:157-183` `ensurePainterTemplate`：模块级 `_painterTemplate` + `_painterLoadStarted` + `_painterLoadPending` 队列实现单次加载、多回调复用，正确。
- `clump.js:16-39` / `partygoer.js:16-49`：geometry 用懒加载单例全局共享。

### 🟡 6. 新关卡仍未接入 gfx-profile（延续 V3 问题）
- `level57.js:353` 和 `level283.js:526`：`new WebGLRenderer({canvas, antialias:false})`，未设 `toneMapping`（默认 NoToneMapping）、未设 `shadowMap`、未导入 gfx-profile。
- 因 L57/L283 是小静态房间且 PointLight 仅 2-3 个，影响远小于 L0/L4 大场景，但仍未统一画质档位。

### ⚪ 7. L57 画家模型 frustumCulled=false
- 位置：`level57-world.js:131-139` `preparePainterGlb`
- 现状：对所有 mesh 设 `child.frustumCulled = false`，画家模型始终渲染（视锥外也渲染）。单 NPC 在 7×7 小房间中几乎总可见，影响可忽略。

---

## 三、可玩性维度（新增内容）

### ✅ 正面：Clump 是首个"非致死"敌人，改善容错
- 位置：`js/backrooms-clump-ai.js`
- 行为：`idle` → 见玩家（`CLUMP_SEE_DIST=14`，`:21`）→ `creep` 靠近（`CLUMP_CREEP_SPEED=1.85`，`:23`）→ 进 9m 触发 `lunge`（`CLUMP_TRIGGER_DIST=9`，`:22`；`CLUMP_LUNGE_DURATION=0.42`，`:24`）→ 命中后 `cooldown` 50s 回 home 点（`:192-200`）。
- 伤害：`CLUMP_POUNCE_DAMAGE=45`（`:19`），仅在 lunge 进度 `p∈[0.12,0.55]` 窗口施加一次，靠 `lungeApplied` 标志防重复（`:162,189-191`）。
- 差异化：vs 笑靥（100 秒杀型 ambush）、vs 死亡飞蛾（35 远程喷毒）。三者形成"近战秒杀/近战中伤/远程"三档，Clump 填补"可存活的中伤近战"档位。长冷却 + 扑完回家，玩家可"骗扑击→绕过推进"。
- 投放：跨 4 关卡（L1.1-3/L1.1-4/L2/L3），复用度高。

### 🟡 1. i-frame 仍未补，多 Clump 同触发叠加致死（V3 弱项被放大）
- 位置：`js/backrooms-survival.js:211-224`（`takeDamage` 无冷却/无敌帧）
- 现状：Clump 45 + 死亡飞蛾 35 可同帧叠加。**最严重**：L1.1-4 投放 3 只 Clump（`createLevel1_1_4Clumps`，`clump-ai.js:304-314`，z=58/118/172），若三只同触发 = 135 伤害即死（默认 HP 100，皇家口粮 150 也不够）。V3 指出的 i-frame 缺失**未修复，反而因多 Clump 投放而放大**。
- 建议：`takeDamage` 加 0.3-0.5 秒无敌帧，或同源伤害合并。

### 🟡 2. Level 57 是纯空房，无任何 hazard/敌人/挑战
- 位置：`js/backrooms-level57.js` + `level57-world.js`
- 现状：7×7 单房（`L57_ROOM_SIZE=7`），黄色壁纸 + 单幅画作 + 画家 NPC。无导航信标（grep `beacon/nav/arrow` 零命中，但单房 7m 不需要）。无任何 hazard、无敌人、无难度曲线。本质是 L283↔L1 的中转枢纽房。
- 影响：作为安全屋/转折点可接受，但作为"新关卡"内容单薄。
- 建议：若定位为中转房可保留；若期望是新挑战关，需补 hazard 或敌人。

### 🟡 3. L283 管道 L8 出口是占位 stub（留尾未完成）
- 位置：`js/backrooms-level283.js:478-481`
- 现状：管道爬行模式（`moveMode="pipe"`，`:352-386`），W/S 前进，爬满 15s 提示"L8 尚未制作·出口不可用"。**L8 出口是占位 stub**，玩家爬完管道发现是死路。
- 建议：要么补 L8 关卡，要么移除管道或改为通向已有关卡。

### 🟡 4. L283 球池俄罗斯轮盘过于 punishing
- 位置：`js/backrooms-level283.js:421-460`
- 现状：踩入球池持续下沉，到阈值后 15% 抛入 L4（`BALL_L4_CHANCE=0.15`，`:71`）/ 85% `takeDamage(9999)` 即死。
- 影响：85% 即死的 hazard 配合无 i-frame（玩家无法反应）过于 harsh，玩家踩入即大概率死亡。
- 建议：提高逃生概率（如 30-40%），或给玩家反应窗口（下沉过程中可挣扎爬出）。

### ✅ 5. 新关卡正确接 MEG 存档点
- L57/L283 均调 `installMegCheckpointDeathHooks(survival, () => ({ level: 57/283 }))`（`level57.js:388-390`；`level283.js:561-563`）。
- `meg-checkpoint.js:252`：`level !== 1 → "meg_hub_redirect"`，死于 L57/L283 重定向至 MEG hub（L1），已正确接 MEG 存档点。
- L283 还通过 `setL283MegExitFlag` + `consumeL283MegExitFlag`（`meg-checkpoint.js:328-341`）实现"从 L283 切出回 MEG 基地"的定向入口。

### ⚪ 6. 音效仍仅 L3 一层（V3 弱项未动）
- 全仓仅 `backrooms-level3-audio.js` 一个音频文件，且仅 `level3.js` 引用。**L57、L283、Clump、Partygoer 均无任何音效**。新敌人无扑击/低吼声，球池无吞没声，管道无爬行声。
- 建议：至少给 Clump lunge 加扑击声、球池加吞没声。

### ⚪ 7. head bob 仍无、指南针仍死代码（V3 弱项未动）
- `backrooms-fps-controller.js` grep `bob/Bob` 零命中，L57/L283 未补 head bob。
- `js/backrooms-compass.js` 模块存在但全仓零 import（死代码），L57/L283 未用。

### 可玩性亮点
- **Clump 行为完整**（idle/creep/lunge/cooldown 四态），长冷却可策略规避，跨 4 关卡复用度高，是首个"非致死"敌人，改善了原本见敌即死的容错。
- **L283 球池俄罗斯轮盘 + 管道爬行**是系列首个非走廊机制，机制创新（虽过于 harsh）。
- **L57 画家 NPC**：GLB 异步加载 + 程序化回退 + 对话系统（"是/否去 L1"），工程鲁棒。
- **L283 多区域复合关**：7×7 入场房 + 11×13 休息区（7 桌 7 沙发）+ 球池区 + 28m 管道爬行，约 1100 行，远超此前"7.9KB 单文件简陋彩色走廊"。

---

## 四、丰富度维度（新增内容）

### 关卡总数更新
- 新增 Level 57（从 L283 小丑画作进入，`exitToLevel57`，`level283.js:342-350`）。
- L283 从 L2 彩色门进入（`level2.js:272-275`），重写为多区域复合关。
- 生成方式覆盖：程序化迷宫（L3/L1.1）+ 手工房间（L57/L283）+ 走廊型（L2/L4）+ 流式区块（L1/L4）。L57 是纯手工单房。

### 敌人种类更新
- 文件级新增 Clump + Partygoer，但**实战敌人仅 3 种**：笑靥、死亡飞蛾、Clump。Partygoer 未接入（死代码）。
- 行为档位：近战秒杀（笑靥 100）/ 近战中伤（Clump 45）/ 远程喷毒（飞蛾 35）。**仍无群体型、巡逻型、真正远程风筝型**（V3 缺失项仅部分补齐——补了"中伤近战"档，群体/巡逻仍空）。

### 预览页用途
- `clump-preview.html` / `moth-preview.html` / `partygoer-preview.html`：独立建模三视图预览（参考图对照）。全仓 grep 确认**无任何关卡/HTML 链接它们**，纯开发调试与资产校对用，玩家不可见。

### painter-man.glb 用途
- L57 画家 NPC 的 GLB 模型（`PAINTER_GLB_URL="models/painter-man.glb"`，`level57-world.js:11`）。`ensurePainterTemplate` 异步加载，`normalizePainterGlb` 缩放至 1.72m 并落地，加载失败回退 `buildProceduralPainter` 方块人体。工程稳健。

### 整体内容密度评价
**补齐短板**：
- L283 从单走廊升级为多区域复合关 + 球池/管道两种新机制；
- Clump 跨 4 关卡投放，填补"中伤近战"档位；
- L57 枢纽房 + NPC 对话 + 异步 GLB 带回退；
- 新关卡 PointLight 控制在 2-3 个，吸取了 V3 教训。

**仍单薄面**：
- **Partygoer 全套建模 + 预览页却零实战接入**，是最大的"半成品"；
- **音效仍仅 L3 一层**，新敌人/新关卡全哑剧，V3 弱项未动；
- **i-frame 仍未补**，`takeDamage` 无冷却，L1.1-4 三 Clump 同触发即 135 伤害秒杀，风险被放大；
- **head bob 缺失，指南针为死代码模块**，沉浸感与导航两项 V3 弱项未补；
- **L57 为纯空房**，无 hazard/敌人/可玩挑战，仅作中转；
- **L283 管道 L8 出口为占位 stub**（"尚未制作·不可用"），留尾未完成。

---

## 五、优先级建议

### 立即修（影响流程/体验）
- ① **L283 桌子标记时序**（Bug#1）——`markTableSearched` 移到 `addItem` 成功之后，避免背包满时永久丢失杏仁水。
- ② **Clump L2 墙外生成**（Bug#2）——偏移量 2.4m 改 ≤1.0m，使肢团在走廊内生成。
- ③ **Clump 突刺穿墙**（Bug#3）——突刺位移经过 `moveClump` 碰撞解算，或加视线检测。
- ④ **`takeDamage` 加 i-frame**（可玩性#1）——0.3-0.5 秒无敌帧，避免 L1.1-4 三 Clump 同触发 135 伤害秒杀。

### 本轮应修（中）
- ⑤ **Partygoer 接入或删除**（Bug#4）——229 行死代码，要么在 L283 spawn 要么删除。
- ⑥ **L283 球池改 InstancedMesh**（性能#1）——120 个独立 geometry+material 压缩为 1。
- ⑦ **L283 桌子/沙发共享 geometry+material**（性能#2）。
- ⑧ **session-keys 补 `l283_meg_exit_v1`**（Bug#5）+ 旧遗漏 `l3_yaw`/`l283_yaw`/`enter_banner`/`clip_yaw`。
- ⑨ **L1.1 dispose 调用 Clump.dispose()**（Bug#6）+ **L57 fallback 网格 dispose**（Bug#7）。
- ⑩ **L283 球池逃生概率提高**（可玩性#4）——85% 即死过于 harsh。
- ⑪ **L283 管道 L8 占位 stub**（可玩性#3）——补 L8 或改通向已有关卡。

### 架构债（中期，承接 V3 未修项）
- ⑫ **L4 流式 `unloadChunk` 补 dispose**（V3 Bug#1，最严重显存泄漏，仍未修）。
- ⑬ **移动端触控移动 UI**（V3 Bug#2，手机端仍不可玩，仍未修）。
- ⑭ **L3 玩家碰撞改 grid**（V3 性能#4，玩家仍全量 ~600 collider，飞蛾/Clump 已用 grid 唯独玩家没用）。
- ⑮ **`pushOutCircleAABB` 消除每帧对象分配**（V3 性能#5）。
- ⑯ **gfx-profile 全关卡接入**（V3 性能#10，L1-L4/L283/L57 均未接入）。
- ⑰ **补音效**（Clump lunge/球池吞没/管道爬行 + 各关 BGM）。
- ⑱ **补 head bob + 启用指南针**。

---

## 附：新增代码的质量亮点

- **新关卡 PointLight 控制 2-3 个**，吸取了 V3 指出的 L0.2/L4 PointLight 泛滥教训，是本次新增最大的性能进步。
- **Clump AI 行为完整**（idle/creep/lunge/cooldown 四态），跨 4 关卡复用度高，是首个"非致死"敌人，改善了原本见敌即死的容错。
- **Clump update 循环干净**，全部标量运算无每帧 GC，对比 V3 指出的 `pushOutCircleAABB` 每帧分配是新代码的正面范例。
- **L3 Clump 用 grid 查询**（`resolveCircleAgainstLevel3Maze`），正确的空间分区，每帧仅查 4-9 个格子（讽刺的是玩家自身仍用全量遍历，见 V3 性能#4）。
- **L283 多区域复合关 + 球池轮盘 + 管道爬行**是系列首个非走廊机制，机制创新。
- **L57 画家 NPC**：GLB 异步加载 + 程序化回退 + 对话系统，工程鲁棒。
- **L283 正确接 MEG 存档点** + 定向入口 flag 机制。
- **纹理缓存正确 + GLTF 单例缓存**，新世界文件吸取了 V3 指出的纹理重复生成教训。
- **session-keys 为 L57 补了令牌注册**（虽旧遗漏仍在）。

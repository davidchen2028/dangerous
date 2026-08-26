# Backrooms 代码复查报告（更新后）

> 距上次审查新增 2 个提交，代码从 ~8000 行增长到 **~12650 行**，新增 13 个文件：Level 4 办公层、Level 0 子区域（0.2/0.3/红房间）、Level 2 笑靥、Level 3 电梯、M.E.G 检查点存档系统、皇家口粮 buff，以及 3 个共享模块（fps-look / level-enter / session-keys）。
>
> 严重程度图例：🔴 高 / 🟡 中 / ⚪ 低（仅整理清单，未修改任何代码）

---

## 一、上次清单的采纳情况

| 上次建议 | 状态 | 说明 |
|---------|------|------|
| #1 FPS 控制器五关重复 | ⚠️ 部分采纳 | 新增 `backrooms-fps-look.js`，但**只抽了"移动端拖动视角"**（`attachMobileDragLook`），`movePlayer`/`bindControls`/`syncLookUi`/`updatePlayerPhysics` 仍是 **6 份拷贝**，约 1200+ 行重复未消除 |
| #2 L3/L283 缺移动端拖动视角 | ✅ 已修复 | L3/L283/L4 都接入了 `attachMobileDragLook`。但 **L0/L1/L2 三个老关卡没接**，仍各自内联一份 |
| #3 `enforceEntryOrRedirect` 重复 | ❌ 未采纳 | 新增 `level-enter.js` 只做了进入横幅提示，6 关的入场校验仍各写一份 |
| #4 sessionStorage key 集中管理 | ✅ 已采纳 | 新增 `session-keys.js`，`resetBackroomsRun` 改用 `clearAllBackroomsSessionKeys()` 统一清理 |
| 视觉清单（tone mapping/bloom/fog/head bob 等） | ❌ 未推进 | 见第三节，几乎全部未动 |

**结论**：开发者开始做共享化，但只走了一小步。新关卡（L4）复用做得最好，老关卡（L0/L1/L2）基本没动。

---

## 二、🔴 本次新增的最高优先级问题

### 🔴 1. `LEVEL02_BIG_DAMAGE` 未定义——运行时必崩（已亲自核实）

**位置**：`js/backrooms-level0-02.js:475, 505`

**核实**：`grep -rn` 全仓**仅 2 处引用，零定义、零 import**。对比 `LEVEL02_DAMAGE = 50`（第 13 行有定义）。

**后果**：当玩家在 Level 0.2 被大块碎片（`big=true`）砸到时，`st.damage = LEVEL02_BIG_DAMAGE` 抛 `ReferenceError`，`updateDebrisHit` 里的 `survival.takeDamage(st.damage)` 中断整个 update 循环 → 画面卡死。

**修复**：补 `export const LEVEL02_BIG_DAMAGE = 75;`（或其他约定值），或直接写字面量。**这是唯一会直接崩溃的问题，必须立即修。**

---

## 三、🟡 架构与正确性（新引入的复杂度风险）

### 🟡 2. `BackroomsSurvival.respawn()` 被改成了脆弱的死亡状态机

**位置**：`backrooms-survival.js:317-338` + `backrooms-meg-checkpoint.js:215-253`

**问题**：死亡流程现在靠 survival 实例上一堆下划线私有字段跨模块通信：`_megDeathPrepare` / `_pendingMegRespawn` / `_megRedirectL1` / `_pendingL0Reset` / `_megDeathHp/Sanity/Stamina` / `_respawnAtMegBase`。`respawn()` 里**硬编码了 `backrooms-level1.html` 跳转**——生存模块不该知道 L1 的存在，关卡无关性被破坏。

**风险**：任一字段设置时机错乱（如重生途中再死亡、跨关卡状态残留）都会导致玩家被传送到错误关卡或状态错乱，且极难调试。

**建议**：把死亡/重生策略从 survival 里抽出来，由各关卡注入 `onDeath` 回调决定行为，survival 只负责"判定死亡 + 通知"。

### 🟡 3. meg-checkpoint 的模块级单例会在多关卡间错挂

**位置**：`backrooms-meg-checkpoint.js:16-17, 191-199`

**问题**：`megSaveEl` / `megSaveHideTimer` 是模块级单例。L1 和 L4 都 import 了该模块，若先后调用 `mountMegSaveStatus`，第二次因 `megSaveEl` 非空直接 return，HUD 可能挂到错误的 survival 容器上。多页面架构下每页重新加载模块，实际触发概率低，但属于隐患。

**建议**：按 survival 实例保存，或导出 reset 函数。

### 🟡 4. Level 0 变成 1648 行的"超级关卡"

**位置**：`backrooms-level0.js`

**问题**：L0 现在把 0.2 / 0.3 / 红房间三个子区域 + 切层传送 + banner + temperature zone 全塞进一个文件，用 `inLevel02`/`inLevel03` 标志位区分。单文件复杂度急剧上升，子区域 hazard 闭包（`createLevel02EnterHazards`）的 `dispose` 若在任何离开路径上漏调，会操作已移除场景树的"野"mesh。

**建议**：子区域拆成独立状态对象，统一 dispose 契约；L0 主文件回归"调度器"角色。

### 🟡 5. L4 入场令牌"消费即删"，与复活流程不一致

**位置**：`backrooms-level4.js:84-110`（`removeItem("backrooms_l4_pass")` 在校验后立即执行）

**问题**：L4 死亡复活若不跳页，token 已被删，再次 reload 会被踢回 L0。而 L3 的 `clip_pass` 会被 meg-checkpoint 重新 set（`:294`）。两套关卡令牌生命周期不一致，复活流程易状态混乱。

**建议**：统一令牌生命周期策略，复活回调里按需重发。

---

## 四、🟡 Three.js 资源管理（新增关卡的同类问题）

### 🟡 6. Level 4 流式区块显存泄漏（同 L1 老问题）

**位置**：`backrooms-level4-world.js:439-457`（`unloadChunk` 只 `group.parent.remove`，不 dispose）

**问题**：L4 是流式区块（`L4_STREAM_RADIUS=2`），玩家走动反复 load/unload。每个 chunk 有大量 `BoxGeometry`（椅子 4 腿 + 椅背、monitor 框/屏、window 6 个 PlaneGeometry），卸载时不 dispose → GPU 内存持续增长。

**建议**：unloadChunk 遍历 `group.traverse` 调 `geo/mat.dispose()`；固定尺寸 geometry（椅腿/monitor 框）提为模块级共享（目前只有 `_deskGeo`/`_chairSeatGeo` 缓存了）。

### 🟡 7. Level 4 碰撞全量遍历，maxIter=16

**位置**：`level4.js:128`（`resolveCircleAgainstColliders(..., 16)`）+ `level4-world.js:434`

**问题**：所有 chunk 的 colliders push 进同一数组，每帧对全量做最多 16 次迭代。流式下 colliders 随探索增长到数百。虽有 `nearPad` 粗筛仍是无空间分区 O(N×iter)。

**建议**：按 chunk 维护 colliders，只对玩家所在 chunk±1 范围做碰撞（L3 已用网格局部遍历，可参考）。

### 🟡 8. Level 0.2 放了约 30 个 PointLight

**位置**：`backrooms-level0-02.js:372-380`（每个 `(row+col)%2===0` 可走格一个 `PointLight`）

**问题**：L0 矩阵 12×12，可走格约 60，一半 ≈ 30 个 PointLight，逐像素光照开销大。讽刺的是 L4 办公层正确地用 emissive 面板避开了 PointLight 泛滥（好做法），L0.2 却重蹈了 L2/L3 旧覆辙。

**建议**：减到 4-6 个 PointLight + emissive 天花板补光。

### ⚪ 9. L0.2 / 红房间纹理无缓存重复生成

**位置**：`level0-02.js:40,60,134,195`、`level0-red-room.js:22,42`

**问题**：`createSolidGrayWallTexture` 等每次调用 `new THREE.CanvasTexture` 无缓存，`buildGrayDoorWall`/`buildLevel02ExitDoor` 重复生成相同纹理。

**建议**：提为模块级 `_tex` 缓存（参考 L4 的 `voidWindowTexture` 模式）。

### ⚪ 10. L0.2 碎片每秒 `new Vector3` + `getWorldPosition`

**位置**：`level0-02.js:547,582,587`（`trySpawnWallFalls` 每秒遍历上百 wallTargets）

**建议**：缓存模块级 `_tmpVec`，或墙不旋转时直接读 `mesh.position`。

---

## 五、🟡 视觉表现复查（上次清单几乎未推进）

实测现状（`grep` 核实）：

| 项 | 现状 | 状态 |
|----|------|------|
| tone mapping | 仅 L3 开 ACES；**L4 新关卡也没开** | ❌ 未推进 |
| Bloom 后处理 | 全仓仍无 `EffectComposer`/`UnrealBloomPass` | ❌ 未推进 |
| shadowMap | L0 开（但 PointLight 不投影，老问题）；L4 完全没开，家具无阴影显"飘" | ❌ |
| Fog 类型 | 6 关全线性 `THREE.Fog`，无 `FogExp2` | ❌ 未推进 |
| head bob | 仍无走路镜头抖动 | ❌ 未推进 |
| normalMap/envMap | 仍无法线贴图、无 PMREM 环境反射 | ❌ 未推进 |
| 移动端拖动视角 | L3/L283/L4 已修；**L0/L1/L2 仍缺** | ⚠️ 部分 |

### 🟡 11. Level 4 视觉配置低于 L0/L3 标准

- **无 tone mapping**（`level4.js:295`）：办公层大量 emissive 灯板（`emissiveIntensity:1.05`）+ 白天花板会过曝发白
- **无 shadowMap**：桌椅/柜子/饮水机无阴影，地面无接触阴影，空间感弱
- **照明偏平**：0 个 PointLight，全靠 `AmbientLight(0.92)`+`HemisphereLight(0.48)`+emissive 面板。性能友好但缺乏灯下亮斑层次

**建议**：L4 至少加 ACES tone mapping + 关键家具 castShadow/地面 receiveShadow（或假接触阴影）。

### ✅ 视觉亮点

- **Level 3 电梯井**（`level3-elevator.js`）：AdditiveBlending 4 层光柱 + 10 个 skyRings + 3 个呼吸式 PointLight，是本次新增视觉最好的
- **Level 4 用 emissive 代替 PointLight**：避免了 PointLight 泛滥，性能决策正确
- **L4 流式区块用确定性种子**（`mulberry32(cx^cz)`）：reload 后同区块布局一致，设计正确

---

## 六、优先级建议

### 立即修（会崩溃）

- ① `LEVEL02_BIG_DAMAGE` 未定义（#1）——一行 `export const` 即可

### 本轮应修（中）

- ② L4 流式区块 dispose 缺失 + geometry 不共享（#6、#9）
- ③ L4 缺 tone mapping + shadowMap，视觉标准低于 L0/L3（#11）
- ④ survival 死亡状态机脆弱 + 硬编码 L1 跳转（#2）

### 架构债（中期）

- ⑤ 抽 `createFpsController` 真正消除 6 关 FPS 重复（上次 #1 未完成的部分）
- ⑥ L0/L1/L2 接入 `attachMobileDragLook`，6 关移动端统一
- ⑦ `enforceEntryOrRedirect` 抽共享（上次 #3 未完成）
- ⑧ 推进视觉清单：全关 ACES tone mapping、bloom、FogExp2、head bob

---

## 附：质量亮点（新增代码中做得好的部分）

- **Level 4 是新增关卡里共享模块复用最好的**：正确接入了 fps-look / level-enter / collide / interact-aim 四个共享模块
- **L4 办公层用 emissive 面板代替 PointLight**，避免光照泛滥
- **L4 流式区块用确定性种子**保证 reload 一致性
- **Level 3 电梯井**的光柱/skyRings/呼吸光视觉表现优秀
- **session-keys 集中管理**解决了跨局状态泄漏隐患

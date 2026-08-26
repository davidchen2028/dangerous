# Backrooms 代码 V3 复审报告

> 本次复审面向最新代码（截至 2026-08-11）。自上次 V2 审查以来，代码从 ~12650 行增长到 ~37000 行，新增 Level 1.1 四段子区域（含灯塔回家结局）、飞蛾 / 死亡飞蛾实体、M.E.G 存档点、皇家口粮与夜视药水 buff、温度系统、gfx 画质档位、共享 FPS 控制器等。
>
> 上次报告里唯一的崩溃级 bug（`LEVEL02_BIG_DAMAGE` 未定义）**已修复**（`backrooms-level0-02.js:14` 现有定义）。
>
> 本报告从 **Bug / 性能 / 可玩性 / 丰富度** 四个维度整理可优化点。严重程度图例：🔴 高 / 🟡 中 / ⚪ 低。仅整理清单，未修改任何代码。

---

## 〇、上次清单采纳情况

- ✅ **`LEVEL02_BIG_DAMAGE` 已修复**——补了 `export const LEVEL02_BIG_DAMAGE = 75;`。
- ✅ **真正抽出共享 FPS 控制器**——新增 `backrooms-fps-controller.js`，L0/L1/L2/L3/L4/L283 全部接入（上次只抽了移动端拖动视角，这次 `movePlayer`/`bindControls`/`updatePlayerPhysics` 都收口了，6 份拷贝大幅消除）。
- ✅ **session 键集中管理**——`backrooms-session-keys.js` 注册 29 个键，`resetBackroomsRun` 统一清理。
- ✅ **新增 gfx 画质档位**——`backrooms-gfx-profile.js` 支持 `?gfx=low/high`，Retina/Safari 默认走轻量路径。
- ⚠️ **gfx-profile 仅 L0 接入**——L1/L2/L3/L4/L283 仍硬编码 renderer 配置，`?gfx` 在这些关卡无效（见性能 #5）。
- ⚠️ **session-keys 仍有遗漏**——`l3_yaw`/`l283_yaw`/`enter_banner`/`clip_yaw` 未收录，跨局残留（见 Bug #7-9）。
- ❌ **视觉清单仍几乎未推进**——Bloom 全仓 0 处，ACES 仅 L3/L4 两关，head bob 仍无。

---

## 一、Bug 维度

### 🔴 1. Level 4 流式区块 `unloadChunk` 完全不 dispose（最严重显存泄漏）
- 位置：`js/backrooms-level4-world.js:464-482`
- 现状：`unloadChunk` 只做 `record.group.parent.remove(record.group)`，未遍历子 Mesh 调 `geometry.dispose()`/`material.dispose()`。每个 chunk 含椅腿/椅背、窗框、voidPane、文件柜、饮水机、白板等十几个独立 geometry。对比 L1 的 `disposeChunkMeshResources`（`backrooms-level1-world.js:1413`）是正确实现。
- 触发：玩家在 L4 移动时流式卸载区块（`L4_STREAM_RADIUS=2`，同时存活 ~25 chunk），每次卸载泄漏约 10-25 个 geometry。长时间探索 GPU 显存持续增长，移动端可能 WebGL OOM。
- 建议：unloadChunk 中 `record.group.traverse` 释放非共享 geometry/material；共享资源（`_deskGeo`/`_chairSeatGeo`/`sharedMaterials()`）打 `_shared` 标记跳过。

### 🔴 2. 移动端完全不可玩（无触控移动 UI）
- 位置：各 `backrooms-level*.js` 的 `bindControls` + 各关卡 HTML
- 现状：所有后室关卡通过 `bindBackroomsFpsControls` → `attachMobileDragLook` 接入了拖动视角，但**无任何 `touchstart`/`touchend` 监听**，HTML 无虚拟摇杆/按钮。`keydown` 在触屏设备永不触发。玩家可拖视角但无法移动（WASD）、跳跃（Space）、交互（Q 开门/拾取）、开背包（B）。主游戏 `action-joystick.js` 有完整虚拟摇杆但后室未引用。
- 触发：任何手机/平板打开任意后室关卡。灰门无法开 → 进不了 0.2；切出墙无法触发 → 进不了 L1。移动端彻底卡死。
- 建议：复用 `action-joystick.js` 的摇杆/按钮，在 `bindControls` 中绑定 touch 事件映射到 `movePlayer`/`tryJump`/交互/`toggleBackpack`。

### 🟡 3. Level 1 走廊坠落状态死亡复活后未重置，被强制传送到 L2（已核实）
- 位置：`js/backrooms-level1.js:175-176`（`corridorL2FallState`/`corridorSpinAccum` 定义）、`:232-256`（`respawnAtMegBase`）、`:1410-1471`（`updateCorridorFallToL2`）
- 现状：`respawnAtMegBase` 重置了 `feetY/velY/pitch/roll`，但 grep 确认**未重置 `corridorL2FallState` 和 `corridorSpinAccum`**。若玩家在白色后门走廊坠落序列中（"spin"/"sink"）死亡，走 `meg_local` 同页复活后，下一帧 `updateCorridorFallToL2` 发现状态非 "idle" 直接继续推进，最终在 M.E.G 基地内执行 `window.location.href = "backrooms-level2.html"` 跳关。
- 建议：`respawnAtMegBase` 开头加 `corridorL2FallState = "idle"; corridorSpinAccum = 0;`。

### 🟡 4. Level 3 电梯上升期间死亡/hazard 竞态，死亡后仍传送到 L4
- 位置：`js/backrooms-level3.js:306-325`（`updateElevatorRise`）、`:461-492`（帧循环）
- 现状：电梯上升 3.6 秒期间，`survival.update`（理智流失）和 `updateLevel3PipeHazards`（蒸汽/酸液伤害）仍被无条件调用。若玩家在上升最后 ~1.4 秒内死亡（`triggerDeath` 排定 1400ms 后 onDeath），死亡定时器未触发前 `updateElevatorRise` 在 `p>=1` 执行 `grantLevelPass("l4")` + 跳转 L4，覆盖死亡重生。`MEG_DEATH_KEY` 被设置但 L4 不消费，死亡状态泄漏；玩家以非预期状态到达 L4。
- 建议：`if (elevatorRising)` 块开头加 `if (survival && survival.dead) { elevatorRising = false; return; }`，或上升期间跳过 survival.update 与 hazard。

### 🟡 5. Level 1 宝箱异步回调向已删除 record 注入孤立碰撞体
- 位置：`js/backrooms-level1-world.js:1342-1356`
- 现状：`ensureChestTemplate` 是异步的（GLTF 加载）。回调中仅检查 `if (!ctx.chunks.has(key)) return;`，但闭包捕获的 `group`/`record` 来自旧加载周期。若区块在模板加载前被 unload 再 reload（相同 key），`ctx.chunks.has(key)` 返回 true（新 record2），但回调仍用旧 `group`（已从场景移除）和旧 `record1`。`registerChunkCollider` 把 collider 推入全局 `ctx.colliders`，但新 record2 的列表不含它 → unload record2 时不移除 → **永久不可见碰撞阻挡**。
- 建议：回调改为 `if (ctx.chunks.get(key) !== record) return;` 校验 record 身份一致性。

### 🟡 6. Level 1 `disposeChunkMeshResources` 错误 dispose GLTF 模板共享 geometry
- 位置：`js/backrooms-level1-world.js:1049-1067`、`:1248`（`sourceModel.clone(true)`）
- 现状：`spawnChestInstance` 通过 `clone(true)` 克隆 GLTF 模板，Three.js `clone(true)` 共享 geometry/material 引用。dispose 跳过列表仅含 `chunkPlane/wallGeo/chestGeo/pickGeo`，GLTF 模型自身的 geometry 不在列表会被错误 dispose。dispose 后 `_chestTemplate` 的 GPU 缓冲被释放，后续克隆首次渲染需重新上传，造成性能抖动。
- 建议：dispose 中把 GLTF 模板的 geometry 加入跳过列表（如按 parent name `QuantumPirateChest` 检测后跳过其子 mesh）。

### 🟡 7. `l3_yaw` / `l283_yaw` 漏列于 `BACKROOMS_SESSION_KEYS`（已核实）
- 位置：`js/backrooms-session-keys.js:21-50`；对照 `js/backrooms-level-pass.js:13,15`
- 现状：`LEVEL_PASS_KEYS` 为 l3、l283 定义了 yaw key，`grantLevelPass` 会 `setItem` 写入它们。但 `BACKROOMS_SESSION_KEYS` 只收录了 `l2_yaw`、`l4_yaw`，漏掉 l3、l283。`resetBackroomsRun` 无法清理。
- 触发：玩家获得 L3/L283 通行证+朝向后 F5 刷新 → pass 被清除但 yaw 残留 → 下一局 `consumeEntryYaw` 读到过期朝向，出生朝向错误。
- 建议：补上 `"backrooms_l3_yaw"`、`"backrooms_l283_yaw"`；更稳妥用 `Object.values(LEVEL_PASS_KEYS).flatMap(k => [k.pass, k.yaw]).filter(Boolean)` 动态生成。

### 🟡 8. `backrooms_clip_yaw` 完全脱离键管理体系
- 位置：`js/backrooms-level0.js:908`（`setItem("backrooms_clip_yaw", ...)`）、`js/backrooms-level1-world.js:1648,1650`（`getItem`/`removeItem`）
- 现状：`LEVEL_PASS_KEYS.clip.yaw` 为 `null`，所以 `consumeEntryYaw("clip")` 返回 null。clip 朝向走硬编码字符串旁路，既不在 `LEVEL_PASS_KEYS` 也不在 `BACKROOMS_SESSION_KEYS` 里，`resetBackroomsRun` 无法清理。
- 建议：`LEVEL_PASS_KEYS.clip.yaw` 改为 `"backrooms_clip_yaw"`，level0/level1-world 改用 `grantLevelPass("clip", yaw)` / `consumeEntryYaw("clip")`，纳入统一键管理。

### 🟡 9. `backrooms_enter_banner` 漏列于 `BACKROOMS_SESSION_KEYS`
- 位置：`js/backrooms-level-enter.js:4`（`ENTER_BANNER_KEY`）；`session-keys.js` 未收录
- 现状：banner 入队后若玩家在显示前重置/跳转，`resetBackroomsRun` 不会清理该 key，下一局任意关卡调用 `showEnterLevelBannerIfQueued` 时弹出过期提示。
- 建议：`BACKROOMS_SESSION_KEYS` 补上 `ENTER_BANNER_KEY`。

### 🟡 10. `wasInsideMegInterior` 模块级单例，死亡复活后不复位
- 位置：`js/backrooms-meg-checkpoint.js:292`（`let wasInsideMegInterior = false;`）；`resetMegInteriorSaveLatch` 定义于 `:294` 但全仓库无调用方
- 现状：`megSaveUiBySurvival` 用 WeakMap 正确隔离，但 `wasInsideMegInterior` 是模块级单例。`applyMegDeathState` 和 `clearMegCheckpointStorage` 都未调用 `resetMegInteriorSaveLatch`。玩家在 M.E.G 基地室内死亡 → `meg_local` 重生 → `wasInsideMegInterior` 仍为 `true` → 重生后再走进基地室内时 `updateMegBaseAutoSave` 直接 return，不再触发"正在保存"提示，也不刷新 checkpoint 时间戳。
- 建议：`applyMegDeathState` 内调用 `resetMegInteriorSaveLatch()`；或改为 WeakMap 按 survival 实例隔离。

### 🟡 11. `rebuildLevel02World` 不 dispose 旧 geometry/material/texture
- 位置：`js/backrooms-level0-zones.js:149-170`
- 现状：`exitLevel02({rebuild:true})` → `rebuildLevel02World()` 执行 `deps.scene.remove(level02State.group)` 移除旧 Group，但旧 Group 内的 `BoxGeometry`、`MeshStandardMaterial`、`CanvasTexture` 均未 `.dispose()`。每次退出泄漏一整套资源。
- 建议：`deps.scene.remove` 之前 traverse 旧 Group 释放非共享资源，CanvasTexture 调 `.dispose()`。

### 🟡 12. ES 模块因 import 路径 query string 不一致导致重复加载
- 位置：`js/backrooms-level0.js:56-57`（`"./backrooms-level0-02.js?v=12"`、`"./backrooms-level0-03.js?v=1"`）vs `js/backrooms-level0-zones.js:17,22`（无 query）
- 现状：浏览器把 `?v=12` 和无 query 视为两个不同模块标识符，同一文件被加载为两个独立实例，模块级变量各自独立。目前功能未崩是因为两条调用路径不交叉，但若开发者更新文件忘 bump `?v=`，两个实例加载不同版本代码，常量可能不一致。
- 建议：移除 `level0.js:56-57` 的 `?v=12`/`?v=1`，统一用无 query 的 import 路径。

### ⚪ 13. `tryClipOut` 初始位移 X 分量符号反了（已核实）
- 位置：`js/backrooms-level0.js:889`
- 现状：`fps.player.x += Math.sin(fps.yaw)` 应为 `-=`（forward 方向 X 分量是 `-sin(yaw)`）。nudge 起点偏 1 米，但 dash 用 `fps.move.forward=true` 方向正确，仍能完成跳转。影响有限。
- 建议：改为 `fps.player.x -= Math.sin(fps.yaw);`。

### ⚪ 14. `consumeXiaoyeFullHealFlag` 提前消费且返回值丢弃（死代码链路）
- 位置：`js/backrooms-meg-checkpoint.js:163`
- 现状：`captureMegDeathPayload` 在 `onPrepareDeath`（死亡前 1400ms）就消费笑靥满血标记，但返回值被忽略。`applyMegDeathState` 对所有死因都做同样的满血+清背包处理，笑靥死无差异化。整条 `XIAOYE_FULL_HEAL_KEY` 链路是死代码。
- 建议：若设计意图是笑靥致死保留背包，应在 `applyMegDeathState` 内按返回值分支；否则删除该链路。

### ⚪ 15. `_deathSnapshot` 只写不读
- 位置：`js/backrooms-survival.js:217`、`:282`、`:270`
- 现状：全仓库无任何读取 `_deathSnapshot` 的逻辑，属死字段。
- 建议：删除该字段及其赋值。

### ⚪ 16. sanity 450ms 定时器被覆盖时未 clearTimeout
- 位置：`js/backrooms-survival.js:290`（450ms）与 `:315`（1400ms 覆盖 `this._deathTimer`）
- 现状：理智崩溃先排 450ms 定时器调 `triggerDeath("sanity")`。若 450ms 内血量归零，`triggerDeath("hp")` 把 `this._deathTimer` 覆盖为 1400ms，未先 clearTimeout 旧的 450ms。旧定时器仍触发但因 `this.dead` 已 true 而 early-return，无双重重生。属悬空定时器引用。
- 建议：`triggerDeath` 开头加 `if (this._deathTimer) { clearTimeout(this._deathTimer); this._deathTimer = null; }`。

### ⚪ 17. L2 `tryLevelTransition` 未处理 "l283" dest，`transitionLock` 死锁风险
- 位置：`js/backrooms-level2.js:252-271`
- 现状：`dest` 可能返回 `"l283"`，但 try 块内只有 `if(dest==="l4")` 和 `else if(dest==="l3")`，无 `else`。若 `dest==="l283"`，`transitionLock` 被设 true 后永不重置。当前被 `tryDoorQAction` 拦截 l283 门打开所掩盖，但未来开放 l283 门时会死锁。
- 建议：try 块末尾加 `else { transitionLock = false; }`，或改用 `finally`。

### ⚪ 18. L1.1 各世界 dispose 不释放 geometry/material
- 位置：`js/backrooms-level1-1-zones.js:1083-1098`
- 现状：`dispose` 仅将 group 从父节点 remove，不调 `geometry.dispose()`/`material.dispose()`。death-moth 系统的 `.dispose()` 也未被调用。页面级游戏影响有限（页面跳转时浏览器回收 WebGL context），但 dispose 契约是死代码。
- 建议：dispose 中 traverse group 并 dispose 非共享资源；调用各 death-moth 系统的 `.dispose()`。

### ⚪ 19. L3/4/283 `syncLookUi` 缺少 `syncBackroomsPointerLockBodyClass`
- 位置：`js/backrooms-level3.js:274-280`、`backrooms-level4.js:116-121`、`backrooms-level283.js:149-154`
- 现状：只有 L0/L1/L2 的 `syncLookUi` 调用了 `syncBackroomsPointerLockBodyClass(fps)` 同步 body 的 `backrooms-pointer-locked` CSS class，L3/4/283 未导入也未调用。若 CSS 依赖此 class 控制光标/UI 显隐，行为不一致。
- 建议：各关卡导入并在 `syncLookUi` 中调用。

### ⚪ 20. L283 缺少 `ceilingY`/`bodyHeight` 物理参数
- 位置：`js/backrooms-level283.js:233`
- 现状：`updateBackroomsPlayerPhysics(fps, dt, { gravity: DEFAULT_GRAVITY })` 未传 `bodyHeight` 和 `ceilingY`。`WALL_H=3.2` 已定义并用于构建天花板，但未作为 `ceilingY` 传入，与其他关卡配置不一致。
- 建议：改为 `{ gravity: DEFAULT_GRAVITY, bodyHeight: BODY_HEIGHT, ceilingY: WALL_H }`。

### ⚪ 21. 0.2 碎片穿过地板后才移除（视觉穿模）
- 位置：`js/backrooms-level0-02.js:672`
- 现状：碎片在 `mesh.position.y < -1.2` 时才移除，但 0.2 地板在 y=0。碎片从 y≈2.0 坠落到 y=0 后继续穿过地板 1.2 米才消失。
- 建议：阈值改为 `mesh.position.y < 0`。

### ⚪ 22. 死代码 / 未使用导入（多文件）
- `js/backrooms-level0.js:45`：`DEFAULT_GRAVITY` 导入未使用（用局部 `GRAVITY=32`）
- `js/backrooms-level0.js:128-129`：`LOOK_SENS`/`MOBILE_LOOK_SENS_MULT` 定义未使用
- `js/backrooms-level0-red-room.js:9`：`RED_CHANNEL_OPEN="east"` 导出但无人 import，且值与注释矛盾（应为 `"west"`）
- `js/backrooms-level2.js:91`：`MOBILE_LOOK_SENS_MULT` 本地定义未使用
- `js/backrooms-level1-1-zones.js:9,1102`：`LEVEL1_1_SPAWN_YAW` 导入并重导出但从未使用
- `js/backrooms-session-keys.js:36,47`：stale key `backrooms_l3_maze_seed`、`backrooms_l2_xiaoye_triggered`（实际代码用 v2 版本）

---

## 二、性能维度

### 🔴 1. PointLight 泛滥（逐片元光照开销）
Three.js 前向渲染器默认把场景所有点光送进每个片元，无自动逐片元光源剔除，超过 8 个即显著拖累 MeshStandardMaterial。
- 🔴 **L0 主区 high 档约 32 个荧光灯点光**（`backrooms-level0.js:542-546,582-592`，`createFluorescentFixture`）。已有 `fluorescentPointLights` 守卫但 high 档仍全开，集成显卡掉到个位数帧率。建议减密度或改 emissive + 少量补光点光。
- 🔴 **L0.2 区约 32 个 PointLight，无任何 gfx 守卫**（`backrooms-level0-02.js:373-381`，双层 for 循环每偶数空格 new 一个）。low 档 Retina/Safari 也全生成，正好命中 gfx-profile 想保护的掉帧场景。建议加 `fluorescentPointLights` 守卫，或改 emissive 面板补光。
- 🔴 **L4 流式办公每 chunk 一个点光**（`backrooms-level4-world.js:227,404,543-544`），`L4_STREAM_RADIUS=2` → 同时存活 25 chunk = **25 chunk 灯 + 2 跟随灯 = 27 个**，无守卫。建议仅玩家所在 chunk + 相邻 1-2 个有点光，其余用 emissive。
- 🟡 L1.1-4 灯塔 glow/halo 强度 2.8/距离 48（`backrooms-level1-1-4-world.js:92,96,182-186`），片元影响半径极大。建议强度 ≤1.5、距离 ≤24。

### 🔴 2. Level 4 流式区块显存泄漏（与 Bug #1 同一问题，性能视角）
- 位置：`js/backrooms-level4-world.js:464-482`
- 详见 Bug #1。这是本仓库最严重泄漏，长时间探索显存爆炸。

### 🔴 3. Level 4 流式家具完全未用 InstancedMesh + geometry 不共享
- 位置：`js/backrooms-level4-world.js`（全文件）
- 现状：椅子/桌站/柜子/显示器/窗墙/荧光板全 `new Mesh` 逐个创建，每 chunk 数十 drawcall。叠加不 dispose + 不共享 geometry，drawcall 与显存双膨胀。
- 🔴 椅腿 `BoxGeometry(0.07,legH,0.07)` 在 for 循环内 new，每椅 4 个（`:180`）
- 🔴 窗框/voidPane 在 for 循环内 new（`:255,259`）
- 🟡 显示器 frame/screen、椅背、panel、柜子、饮水机、白板、电梯井等多处固定尺寸 per-chunk geometry 未共享（`:157,161,197,233,318,333,347,364,440`）
- 建议：对重复家具按类型建 InstancedMesh；固定尺寸 geometry 提为模块级 `_xxxGeo`（与已有的 `_deskGeo:289`/`_chairSeatGeo:290` 同管理）。

### 🔴 4. 碰撞全量遍历无空间分区，L3 每帧最坏 ~4800 次
- 位置：`js/backrooms-collide.js:60-93`（`resolveCircleAgainstColliders` maxIter=8，每轮全量 `for(i<colliders.length)`，唯一剔除是 `nearPad` 的 AABB 预检，无网格哈希/AABB 树/chunk 分组）
- 🔴 **L3 玩家用全量 `wallColliders`（~600+，nearPad=14 极宽松）**（`backrooms-level3.js:480`），而飞蛾却用 `resolveCircleAgainstLevel3Maze` 只查 3×3 邻近 cell（O(1)）（`backrooms-death-moth.js:184`）。迷宫 36×36，建图每墙格 push 一个 collider。nearPad=14 让预检几乎不过滤，玩家碰撞是 L3 最大单帧 CPU 开销之一。
- 建议：让玩家也走 `resolveCircleAgainstLevel3Maze`（grid 已是天然空间分区）。
- 🟡 `raycastWallBlockDistance` 准星射线每帧全量遍历（`collide.js:178-229`），被 L0/L1/L2/L4 每帧调用。建议 grid 查询沿射线 cell。

### 🔴 5. `pushOutCircleAABB` 每帧分配大量临时对象（最大 GC 源）
- 位置：`js/backrooms-collide.js:14,20-23,37`
- 现状：`pushOutCircleAABB` 每次返回 `{x,z}` 字面量，在 `resolveCircleAgainstColliders` 内层循环 `maxIter(8) × N(colliders)` 次调用。L3 玩家 N≈600 → 每帧 ~4800 个临时对象，碰撞子系统最大 GC 源。
- 🟡 `cellAabb`/`cellToWorld`（`backrooms-level3-world.js:164-173,153-156`）在飞蛾碰撞循环内每格每迭代分配新对象，每帧约 486 个临时对象。
- 建议：改写入模块级复用对象回填（参考 `backrooms-interact-aim.js` 的 `_ndc`/`_worldDir`/`_raycaster` 缓存范例）。

### 🟡 6. 各关卡 update 循环每帧 new opts 字面量
- 位置：`backrooms-level0.js:1134-1140`、`level1.js:1845-1850`、`level2.js:470`、`level3.js:462`、`level4.js:267`、`level283.js:231`（`survival.update(dt,{...})`）；各关卡 `updateBackroomsPlayerPhysics` 每帧 new `{gravity,bodyHeight,ceilingY}`
- 现状：每帧 2+ 个对象字面量分配。
- 建议：模块级 `_survCtx`/`_physOpts` 复用，逐字段覆写。

### 🟡 7. L0.2 `getZoneColliders` 每帧重建数组
- 位置：`js/backrooms-level0-zones.js:413-419`
- 现状：每次调用 `var out=[]` 并循环 push 过滤 collider，每帧经 movePlayer + 准星射线至少 2 次重建。
- 建议：脏标记缓存数组，仅在 collider 状态变化时重建。

### 🟡 8. shadowMap 死配置
- 位置：`js/backrooms-gfx-profile.js:55`
- 现状：`shadows` 字段两档恒为 `false`，使 `backrooms-level0.js:1042-1044` 的 `shadowMap.enabled = level0GfxProfile.shadows` + PCFSoftShadowMap 永远不触发（死配置）。维护者误以为 L0 开了阴影。
- 🟡 L4 是唯一真正开阴影的关卡：shadow map 1024×1024（`level4-world.js:530`），正交相机 far=42 与 ±16 不匹配。建议 high 档 2048 / low 档 512；far 收窄到 ~20。
- ✅ 正面：全仓库没有任何 PointLight 设 `castShadow=true`，避免了最灾难性的逐点光立方体阴影开销。

### 🟡 9. tone mapping 仅 L3/L4 开，跨关 HDR 不一致
- 位置：`backrooms-level3.js:383-384`、`level4.js:215-216` 开 `ACESFilmicToneMapping`；L0/1/2/283 用默认 `NoToneMapping`
- 现状：跨关卡切换时 HDR 表现不一致，emissive 自发光面在 NoToneMapping 关卡过曝（如 `level0.js:505-512` emissiveIntensity:1.55）。
- 建议：统一所有关卡 toneMapping。
- ✅ 正面：全仓无 `EffectComposer`/`UnrealBloomPass`，无后处理 = 无额外 draw pass，性能上是好事（"bloom" 是 L0 用 MeshBasicMaterial+AdditiveBlending+depthWrite:false 的假实现）。

### 🟡 10. gfx-profile 仅 L0 接入，5 个关卡硬编码 renderer 配置
- 位置：`backrooms-level1.js:1713-1714`、`level2.js:420-421`、`level3.js:380-381`、`level4.js:212-213`、`level283.js:191-192`
- 现状：只有 L0 接入 `resolveBackroomsGfxProfile()`，L1/2/3/4/283 全部硬编码 `antialias:false` + 各自写死 pixelRatio 上限（L1 cap 1.0，其余 1.5）。`?gfx=low/high` 在这些关卡无效；low 档 Retina 设备在 L2/3/4/283 仍 1.5x 渲染；L1 cap 1.0 与其他 1.5 不一致导致跨关清晰度跳变。
- 🔴 L4 还强制开 PCFSoft 阴影，完全无视 profile——low 档 Retina/Safari 进 L4 严重掉帧，正是 profile 设计初衷要避免的场景。
- 建议：统一改用 `resolveBackroomsGfxProfile()` + `applyBackroomsRendererSize()`。
- ✅ 正面：所有关卡都做了 `Math.min(devicePixelRatio, 上限)`，未无限跟随 Retina 2x/3x。

### ✅ 正面：colliders 不随 chunk 加载无限增长
- L1 流式 unloadChunk 会移除 collider（`level1-world.js:1389-1416`），`STREAM_RADIUS=2` 即 5×5 邻域有上界；L1-1 子区域进出平衡；L0/L2/L3/L4/L283 静态建图一次。真正问题是"即使数量有界，仍每帧全量遍历无分区"。

---

## 三、可玩性维度

### 🔴 1. 移动端完全不可玩（与 Bug #2 同一问题）
- 详见 Bug #2。手机/平板只能拖视角不能移动/跳跃/交互/开背包，游戏在移动端彻底卡死。这是最严重的可用性问题。

### 🔴 2. F5 刷新 = 全进度清空，误操作代价极其严重
- 位置：`js/backrooms-level-pass.js:22-28`（`isBackroomsPageReload`）、`:31-44`（`redirectReloadToLevel0Reset`）；`backrooms-survival.js:40-50`（`resetBackroomsRun` 清空 25 个 session key）
- 现状：任何关卡检测到 `navigation.type === "reload"`（F5/Ctrl+R/Cmd+R），立即清空全部进度（背包、存档点、关卡通行证、积分、宝箱状态）并跳转 Level 0。
- 影响：玩家在 L3 探索到一半不小心按 F5（或浏览器崩溃后刷新），所有进度归零，且没有"继续游戏"机制。
- 建议：(1) 核心进度改用 localStorage 持久化（至少保留关卡通行证和 MEG 存档点）；(2) F5 刷新时弹确认对话框；(3) 或将刷新行为改为"回到当前关卡入口"而非"回 L0 重置"。

### 🔴 3. 仅 sessionStorage 持久化，关闭浏览器全丢
- 位置：`js/backrooms-session-keys.js:21-50`（全部使用 `sessionStorage`）
- 现状：所有后室进度（生存状态、背包、存档点、通行证、积分）均存 sessionStorage。
- 影响：玩家关闭浏览器标签页或浏览器崩溃后，所有进度丢失，无法"继续游戏"。
- 建议：核心进度（关卡通行证、MEG 存档点、积分）改用 `localStorage`，至少支持跨会话恢复。

### 🟡 4. 死亡后背包被完全清空，惩罚过重
- 位置：`js/backrooms-meg-checkpoint.js:180`
- 现状：`applyMegDeathState` 在死亡复活时调用 `resetBackpack()`，清空背包全部物品。虽然血量恢复满值 100，但玩家辛苦收集的杏仁水、夜视药水等全部丢失。
- 影响：玩家在 L2/L3 探索时死亡，即使有 MEG 存档点回城，也会失去所有补给品，需要重新从 L1 搜刮，形成"死亡→回城→重新搜刮→再出发"的重复循环，容易劝退。
- 建议：死亡时保留背包物品（或保留部分），仅清空非消耗性进度道具；或死亡后背包物品掉落在死亡位置可返回拾取。

### 🟡 5. 无存档点死亡 = 全进度清空回 Level 0
- 位置：`js/backrooms-meg-checkpoint.js:234-244, 267-269`
- 现状：若玩家从未进入 MEG 基地（无存档点），死亡走 `l0_reset` 路径，调用 `resetBackroomsRun()` 清空全部 25 个 session key，并 `location.replace("backrooms-level0.html")`。
- 影响：新玩家如果还没找到 MEG 基地就死了，所有进度归零。L1 是无限仓库，基地在出生点向东 5 个区块处，新玩家可能很久找不到。
- 建议：给新玩家一个"首次死亡保护"机制，或让 L0 本身作为最低兜底复活点（不清空 L1 通行证）。

### 🟡 6. 指南针是完全死代码，从未启用
- 位置：`js/backrooms-compass.js:1-10`（定义）；CSS 样式 `css/backrooms-level0.css:487-580`
- 现状：`updateBackroomsCompass(roseEl, yaw)` 已实现，配套 CSS 完整，但全仓库无任何 JS 或 HTML 调用此函数，也无任何 HTML 创建 `.backrooms-compass` 元素。
- 影响：L1（无限仓库）和 L4（无限办公层）是无限流式区块世界，视野因雾极短（近 4m 远 28m），玩家完全没有方向感。指南针本可解决此问题却被闲置。
- 建议：在各关卡 HUD 的 `.backrooms-nav` 容器中添加指南针 DOM 元素，并在主循环中调用 `updateBackroomsCompass`。至少在 L1/L4 无限关卡启用。

### 🟡 7. 无限关卡完全缺乏导航辅助
- 位置：`js/backrooms-level1-world.js:2`、`backrooms-level4-world.js:2`
- 现状：L1 和 L4 都是无限流式区块世界。无小地图、无坐标显示（`.backrooms-nav__chunk` CSS 存在但无 JS 写入）、无面包屑/足迹系统、无指南针。L4 甚至没有任何固定地标（L1 至少有 MEG 基地）。
- 影响：玩家在 L4 一旦偏离已知区域，没有任何机制能帮助确定方位或返回，只能凭记忆。长时间探索极易彻底迷路。
- 建议：(1) 启用指南针；(2) 在 HUD 显示当前区块坐标（CSS 已就绪）；(3) L4 添加固定地标。

### 🟡 8. 笑靥 100 伤害 = 一击必杀，无躲避机制
- 位置：`js/backrooms-level2-xiaoye.js:13-14`（`XIAOYE_DAMAGE = 100; TRIGGER_DIST = 11`）
- 现状：笑靥在玩家距离 11 米时触发攻击，造成 100 伤害（等于默认 HP 上限），同步进入 0.38 秒扑击动画。伤害在动画开始瞬间就结算。笑靥静止不动不会追击，但触发距离 11 米很远。
- 影响：默认 100 HP 的玩家被笑靥触发即死，唯一生存方式是激活皇家口粮（HP 上限 150，剩 50）。
- 建议：(1) 降低笑靥伤害至 50-70；(2) 添加闪避机制（如蹲下可躲避）；(3) L1.1-4 减少笑靥数量或拉开间距。

### 🟡 9. L1.1-4 是全游戏最大难度断崖
- 位置：`js/backrooms-level1-1-4-world.js:11-12,20`（200m 走廊，5 只笑靥 z=[40,80,120,160,185]）；`backrooms-death-moth.js:340-354`（10 只死亡飞蛾）；`backrooms-level1-1-zones.js:751`（5/秒理智流失）
- 现状：L1.1-4 是 7m×200m 线性走廊，塞了 5 只笑靥（各 100 伤害）+ 10 只死亡飞蛾（各 35 伤害，10 秒冷却）+ 5/秒理智流失（20 秒崩溃）。走廊宽 7m，笑靥触发距离 11m，几乎无法绕过。
- 影响：从 L1.1-3（困难但可通过）到 L1.1-4（几乎不可能）之间无过渡，是设计上的难度断崖。
- 建议：(1) 减少笑靥至 2-3 只，飞蛾至 3-4 只；(2) 理智流失降至 2/秒；(3) 走廊中添加可躲避笑靥的凹室/侧室。

### 🟡 10. `takeDamage` 无 i-frame，多源伤害同帧叠加
- 位置：`js/backrooms-survival.js:211-224`
- 现状：`takeDamage(amount)` 无冷却、无最小 HP 地板、无无敌帧。多个 hazard 同帧命中会叠加扣血。
- 影响：L1.1-4 多只飞蛾同时喷射（各 35 HP），同帧可叠加至 350 HP 瞬死。L0.2 多块碎片同帧命中也可叠加致死。
- 建议：添加 0.3-0.5 秒的无敌帧，或同源伤害合并机制。

### 🟡 11. 新玩家零保护机制
- 位置：`js/backrooms-survival.js:72-94`（构造函数无 shield/grace 字段）
- 现状：无护盾、无无敌时间、无新手减免、无最低 HP 地板。从进入关卡第一帧就开始被动理智流失。
- 影响：新玩家没有任何缓冲期，一进门就可能遭遇致命 hazard。
- 建议：添加 5-10 秒的进关无敌时间，或首次进入新关卡时 HP 不低于 30 的地板。

### 🟡 12. L0.2 碎片进门即满强度，无 ramp-up
- 位置：`js/backrooms-level0-02.js:13-19`
- 现状：`LEVEL02_DAMAGE=50, BIG_DAMAGE=75`，进门 2 秒后开始每秒掉一块碎片/倒一面墙，无递增曲线。
- 影响：玩家进入 L0.2 后 2 秒就面临最大强度，来不及观察环境。两块大碎片（75×2=150）即死。
- 建议：前 5 秒使用较小碎片（25 伤害），之后逐步升级到大碎片。

### 🟡 13. 完全没有 head bob 实现
- 位置：相机应用点 `js/backrooms-fps-controller.js:317-323` `applyBackroomsCamera` 完全刚性
- 现状：没有任何走路时的镜头上下浮动、左右摆动、或脚步节奏反馈。镜头在行走时绝对静止，唯一镜头反馈是 L1 的脚本化 roll（仅在 L2 走廊过场和下沉序列触发）。
- 影响：沉浸感严重不足。玩家在无限走廊中行走时镜头完全静止，感觉像在"滑行"而非"走路"。
- 建议：在 `applyBackroomsCamera` 中添加基于移动速度和时间的 sin 波镜头浮动（振幅 0.02-0.03m，频率随移动速度变化），冲刺时振幅增大。

### 🟡 14. horror 暴盲系统不造成实质威胁
- 位置：`js/backrooms-horror.js:1-3`；`backrooms-survival.js:168-200`（`env.blackout` 被忽略）
- 现状：horror 的暴盲效果（灯熄 2-5 秒 + 滴水音效）不造成任何伤害或理智影响。`survival.update` 中 `env.blackout` 字段被完全忽略。
- 影响：暴盲"看起来吓人但无实质威胁"，玩家很快会发现暴盲无害，恐怖感消退。
- 建议：暴盲期间添加少量理智流失（如 2/秒），增强紧张感。

### ⚪ 15. 移动端 hint 文本仍显示 WASD 提示
- 位置：`js/backrooms-level0.js:931`、`backrooms-level1.js:1519`
- 现状：拖动视角模式下 hint 仍写"WASD 移动 · Shift 冲刺 · B 背包"，而手机端没有 WASD 键。
- 建议：移动端检测后隐藏键盘提示，改为触控提示。

### ⚪ 16. 夜视药水全游戏仅 1 瓶，无法补充
- 位置：`js/backrooms-night-vision.js:8`；`backrooms-level1.js:808-830`
- 现状：夜视药水只能从 MEG 后门工作人员处一次性赠送 1 瓶，无法购买、无法从宝箱获取。持续 5 分钟。
- 影响：玩家用掉后就没有了，在 L2（暗黑蒸汽管道）等暗关中失去夜视能力。
- 建议：在 L2/L3 宝箱中添加夜视药水掉落，或允许用 MEG 积分购买。

### ⚪ 17. lootToast 无图标无动画，陷阱警告与普通拾取样式相同
- 位置：`js/backrooms-level1.js:214-224`；`css/backrooms-level0.css:264-277`
- 现状：lootToast 是纯文本，无图标、无稀有度颜色、无 fade-in/scale 动画（直接 `hidden=false` 硬切）。陷阱宝箱的"-99 血量"警告与普通拾取用完全相同的样式。
- 建议：(1) 添加物品图标和稀有度颜色；(2) 陷阱警告使用红色背景 + 抖动动画；(3) 添加 fade-in 过渡。

### 可玩性亮点
- **进入横幅系统覆盖全面**（`backrooms-level-enter.js`）：每个关卡入口和子区域切换都有"你进入了 [地名]"横幅，4.2s 显示后淡出，跨页面跳转用 sessionStorage 队列消费，无遗漏。
- **MEG 存档点系统设计合理**（`backrooms-meg-checkpoint.js`）：首次进入基地室内自动存档，死亡后根据存档点状态三级路由（l0_reset / meg_hub_redirect / meg_local），跨关死亡统一 redirect 到 L1 基地复活。复活恒定满血 100，杜绝无限死亡循环。
- **Level 3 中央通天光柱是优秀的导航信标**（`backrooms-level3-elevator.js:9` `BEAM_H = 72`）：72m 高光柱，`depthWrite` 不受雾遮挡，在 36×36 迷宫中作为强可见信标。
- **L1.1-4 灯塔终点信标设计出色**（`backrooms-level1-1-4-world.js:31-113`）：200m 走廊尽头发光灯塔，在极暗走廊中提供强烈终点目标感。
- **温度系统各关差异化**（`backrooms-temperature.js:17-39`）：L2 蒸汽管道 44°C 高温、L0.3 极寒 -20°C、L4 办公层 22°C 舒适、L3 发电站 13°C 微凉，温度变化增强关卡辨识度。
- **horror 暴盲系统氛围营造到位**：每 40-60 秒掷骰触发 2-5 秒暴盲，环境光降至 0.14，配合管道滴水音效。
- **生存 HUD 设计清晰**：HP/理智/体力三栏进度条 + MEG 存档提示，理智崩溃时画面变灰度，死亡时画面变暗，视觉反馈层次分明。
- **L0.2 回归门设计**：灰镜迷宫子关卡设有"回归门"回到出生点，给被困玩家一个逃生出口。

---

## 四、丰富度维度

### 内容盘点

**关卡（7 主关 + 17 可玩空间）**：
- Level 0 经典黄色壁纸房间（固定网格 `BACKROOMS_MATRIX`）+ 3 子区域：红室（纯红 10×10，掉理智 5/s）、L0.2（灰色镜像迷宫 + 墙体塌落灾害）、L0.3（极寒蓝洞 -22~-18°C，掉血 3/s）
- Level 1 无限工业仓库（流式区块 9×9 循环铺砖，`BLOCK_SIZE=4.0`，含 M.E.G 基地）
- Level 1.1 四段白色走廊 + 3 个前哨（7 个子区域）：L1.1-1 白色走廊 7×30 + M.E.G 前哨 1；L1.1-2 纯白走廊 7×50；L1.1-3 略暗纯白走廊 7×50 + 笑靥；L1.1-4 极暗纯白走廊 7×200 + 灯塔结局
- Level 2 蒸汽管道十字走廊（固定十字 `CORRIDOR_LENGTH=144`，含随机门）
- Level 3 暗沉砖墙迷宫（**迷宫算法** `MAZE_W=36, MAZE_H=36`，seed + mulberry32，中央电梯井）
- Level 4 无限现代办公层（流式区块 `L4_CHUNK_SIZE=24, L4_STREAM_RADIUS=2`）
- Level 283 彩色走廊（固定）
- 生成方式三种齐全：固定网格（L0/L2/L283/L1.1）、流式区块（L1/L4）、迷宫算法（L3）

**实体/敌人（3 类 + 1 环境灾害）**：
- 普通飞蛾（`backrooms-moth.js:103`）：纯视觉装饰，canvas 翅膀纹理 + flutter 翅膀拍打动画，无 AI
- 死亡飞蛾（`backrooms-death-moth.js:1`）：完整 AI（`SEE_DIST=18`/`SPRAY_RANGE=4.5`/`SPRAY_DAMAGE=35`/`COOLDOWN=10s`/`FLY_SPEED=3.1`），L2 同走廊 1 只，L3 随机 3 只，**可被管道蒸汽/强酸反杀**（唯一可被环境击杀的敌人）
- 笑靥（`backrooms-level2-xiaoye.js:171`）：扑击 AI（`TRIGGER_DIST=11`/`XIAOYE_DAMAGE=100` 秒杀/`LUNGE_DURATION=0.38s`/`COOLDOWN=30s`），三条非出生走廊末端随机一只，sessionStorage 持久化击杀状态
- 暴盲系统（`backrooms-horror.js:13`）：环境灾害，`blackoutChance` 概率触发 2-5s 全灯熄灭 + 水滴音循环

**物品系统（3 种消耗品 + meta 层）**：
- 杏仁水（`backrooms-survival.js:24`）：+15 HP / +25 理智，即时无 buff
- 皇家口粮（`backrooms-royal-rations.js:1`）：10 分钟血上限 100→150、体力上限 100→200，使用即回满，sessionStorage 持久化到期自动压回
- 夜视药水（`backrooms-night-vision.js:1`）：5 分钟提亮，sessionStorage 跨关卡持久
- 入场令牌（`backrooms-level-pass.js:14`）：5 类（clip/l2/l3/l4/l283），sessionStorage 通行证 + 朝向 yaw
- M.E.G 积分（`backrooms-meg-points.js:1`）：L0/L1 共用点数
- 背包（`backrooms-inventory.js:2`）：4×5=20 格，三种物品图标，双击使用，按 B 打开

**生存机制**：三轴状态（HP/理智/体力，被动理智流失 1/10s）、存档持久（`pagehide` 自动存）、温度系统（7 档区间 + 双 swing + volatile 波动）、M.E.G 存档点（进基地存位置，死亡在基地复活清空背包回满清 buff）、session 键集中管理（29 个键统一注册）。

### 丰富度评价

**扎实面**：
1. **关卡规模与多样性**——7 主关 + 17 可玩空间，三种生成方式齐全，L1.1 四段走廊 + 3 前哨 + 灯塔结局是完整的子关卡叙事链。
2. **生存核心循环**——三轴状态 + 温度 + 存档点 + 死亡回城 + session 持久化，闭环完整。
3. **buff 机制**——皇家口粮/夜视药水的时限 + 上限变更 + 到期回收 + 跨关卡持久，设计精细。
4. **L3 视听**——迷宫 + 光柱 + 管道危害 + 电网嗡鸣 + 死亡飞蛾，是全游戏内容密度最高的关卡。
5. **碰撞/令牌/横幅中台**——复用规范，F5 防刷新回 L0 的设计有产品意识。

**单薄可扩展面**：
1. **音效极弱**——仅 L3 环境音（`backrooms-level3-audio.js` 58Hz sine 主嗡鸣 + 116Hz 旁路底噪 + 0.35Hz LFO 调制）+ L1 暴盲水滴（`backrooms-horror.js:38`），L0/L2/L4/L283/L1.1 全程静音。无 BGM/脚步/开门/拾取/受伤音。**最该补的短板**。
2. **后处理缺失**——0 处 UnrealBloomPass，ACES 仅 2 关卡；L2/L283 视觉简陋。
3. **物品品种少**——仅 3 种消耗品，无武器/防具/钥匙/收集品；背包无堆叠（`item-catalog.js:23` 的 `stackSize:4` 在后室背包被忽略）。
4. **敌人类型少**——仅 3 类（飞蛾装饰 + 死亡飞蛾 + 笑靥），缺巡逻/群体/远程型。
5. **gfx-profile 接入不彻底**——5 个关卡未走统一画质档位，跨设备体验不一致。
6. **shadowMap 全局关闭**——`shadows: false` 默认，全游戏无动态阴影（L4 除外）。
7. **L283 / L0.3 体量小**——单文件 <8KB，可做深。
8. **MEG 经济闭环过小**——积分仅一个获取途径（杏仁水换点）和一个消费途径（换皇家口粮），而皇家口粮也可从 L1.1 固定宝箱免费获取，点数价值有限。

---

## 五、优先级建议

### 立即修（崩溃 / 不可玩）
- ① **L4 流式区块 `unloadChunk` 补 dispose**（Bug #1 / 性能 #2）——修复最严重显存泄漏，仿 L1 的 `disposeChunkMeshResources`。
- ② **移动端接入触控移动 UI**（Bug #2 / 可玩性 #1）——复用 `action-joystick.js`，否则手机端彻底不可玩。
- ③ **L1 走廊坠落状态死亡复活后重置**（Bug #3）——`respawnAtMegBase` 加 `corridorL2FallState = "idle"`。
- ④ **L3 电梯上升期间死亡竞态**（Bug #4）——`elevatorRising` 块开头判 `survival.dead`。

### 本轮应修（中）
- ⑤ **session 键补全**（Bug #7/8/9）——补 `l3_yaw`/`l283_yaw`/`enter_banner`/`clip_yaw`，动态生成更稳妥。
- ⑥ **L4 流式家具改 InstancedMesh + 提共享 geometry**（性能 #3）——削减 drawcall 与显存双膨胀。
- ⑦ **L3 玩家碰撞改 grid 查询替代全量 600 collider 遍历**（性能 #4）+ **`pushOutCircleAABB` 消除每帧对象分配**（性能 #5）。
- ⑧ **PointLight 泛滥加 gfx 守卫**（性能 #1）——L0.2/L4 加守卫或改 emissive。
- ⑨ **F5 全清空 + 仅 sessionStorage 持久化**（可玩性 #2/3）——核心进度改 localStorage，F5 弹确认。
- ⑩ **死亡清空背包惩罚过重**（可玩性 #4）——保留部分物品或掉落死亡位置。
- ⑪ **L1 宝箱异步回调校验 record 身份**（Bug #5）+ **GLTF 模板 dispose 跳过**（Bug #6）。
- ⑫ **`wasInsideMegInterior` 死亡后复位**（Bug #10）。

### 架构债（中期）
- ⑬ **gfx-profile 全关卡接入**（性能 #10）——L1-L4/L283 统一改用 `resolveBackroomsGfxProfile()`，让 `?gfx=low` 在最重的 L4 生效。
- ⑭ **统一 tone mapping**（性能 #9）——全关 ACES。
- ⑮ **启用指南针 + 无限关卡导航辅助**（可玩性 #6/7）——L1/L4 加指南针和坐标显示。
- ⑯ **笑靥一击必杀 + L1.1-4 难度断崖**（可玩性 #8/9）——降伤害、减数量、加躲避凹室。
- ⑰ **`takeDamage` 加 i-frame + 新手保护**（可玩性 #10/11）。
- ⑱ **补 head bob**（可玩性 #13）——`applyBackroomsCamera` 加 sin 波镜头浮动。
- ⑲ **补音效**（丰富度）——脚步/开门/拾取/受伤音 + 各关 BGM。
- ⑳ **清理死代码**（Bug #14/15/22）——`_deathSnapshot`、`consumeXiaoyeFullHealFlag` 链路、未使用导入。

---

## 附：本次新增代码的质量亮点

- **真正抽出共享 FPS 控制器**（`backrooms-fps-controller.js`）：L0-L4/L283 全部接入，消除了上次报告里 6 份 `movePlayer`/`bindControls`/`updatePlayerPhysics` 拷贝，是本次最大的架构进步。
- **Level 4 是新增关卡里共享模块复用最好的**：正确接入了 fps-controller / level-enter / collide / interact-aim 四个共享模块。
- **L4 办公层用 emissive 面板代替 PointLight**（设计意图正确，但因每 chunk 仍点光 + 不 dispose + 无 InstancedMesh，实际性能仍不达标）。
- **L4 流式区块用确定性种子**（`mulberry32(cx^cz)`）保证 reload 一致性。
- **Level 3 电梯井**的光柱/skyRings/呼吸光视觉表现优秀，是全游戏内容密度最高的关卡。
- **session-keys 集中管理**解决了跨局状态泄漏隐患（虽仍有 4 个键遗漏）。
- **死亡复活给满血而非存档时血量**，杜绝了无限死亡循环。
- **Level 3 中央光柱 + L1.1-4 灯塔**是优秀的导航信标设计。
- **温度系统 7 档差异化**增强了关卡辨识度。

# Backrooms 代码 V5 复审报告

> 本报告聚焦 V4 复审（提交 `831573a`，2026-08-11）之后到 HEAD（`ffe6f67`，2026-08-16）的 **9 个提交** 的新增/修改内容，共 **121 文件 / +16429 行 / -709 行**。涵盖 v1.1 → v2.0 → v3.0 三次版本发布，新增 L6/L6.1/L7/L8/L9/L13/L14/L21/L37/L48/L119/L121、C-144/C-192/C-370、蓝通道、B.N.T.G 基地，以及运气/豆奶/交易库/轮盘/死亡惩罚/快捷栏/火盐/L4 背景音乐等机制。
>
> 四维并行审查：**Bug / 性能 / 可玩性 / 平衡性**。严重程度图例：🔴 高 / 🟡 中 / ⚪ 低。仅整理清单，未修改任何代码。

---

## 〇、V4 报告建议采纳情况

V4 报告基准在 `831573a`，之后这批提交对 V4 指出问题的处理——**旧债继续未还，但补了几个 session 键**：

- ❌ **L4 流式 `unloadChunk` 不 dispose（V3#1 最严重显存泄漏）** — 主体已修：共享几何 + InstancedMesh 批处理 + 点光源池。**残余**：chunk 内 per-call 材质（Meg 前哨/售货机零食）仍不随 unload dispose（见性能#1）。
- ❌ **移动端触控移动 UI（V3/V4）** — 仍未补。仅 FPS controller 乘了 luck 倍率，`state.move` 仍只由键盘写入，移动端全关卡只能拖视角不能走/跳/交互（见可玩性#1）。
- ❌ **L3 玩家碰撞改 grid（V3#4）** — 未修。L3 玩家仍全量遍历；且**新关卡 L6/L9/L14/L37/L48/L119 全部复制了同样的全量遍历**（见性能#2）。
- ❌ **`pushOutCircleAABB` 每帧对象分配（V3#5）** — 已改善：`resolveCircleAgainstColliders` 返回模块级 `_resolveOut` 复用，各关 `frame()` 均用复用对象。
- ⚠️ **gfx-profile 仅 L0 接入（V3#10）** — 部分扩展：L4 已接入 `resolveBackroomsGfxProfile`，其余新关卡未核实全面接入。
- ⚠️ **session-keys 遗漏** — 补了 `clip_yaw`、`enter_banner`、`l57_*`；**仍漏** `l3_yaw`、`l283_yaw`（见可玩性#3）；新增的 `l283_meg_exit_v1` 也未注册（见可玩性#4）。

---

## 一、Bug 维度

### 🔴 1. 交易库领取时部分溢出物品静默丢失、无退款（已核实）
- **位置**：`js/backrooms-trade-vault.js:178-196`（`claimTradeVault`）
- **现状**：每抽 `roll.wanted` 为 1~3（`variableCount` 物品如 almond_water、fire_salt）。领取时逐个 `addItem`，放不下就 `break`。只有整抽一个都没放下（`added < 1`）才计入 `skipped` 并退款；部分放下（如 wanted=3 只放进 2）时，第 3 个物品既不发货也不退款。
- **触发**：背包/快捷栏接近满时做十连抽，在领取桌领取。某抽 wanted=3 但只剩 1~2 格，溢出的物品直接消失，积分不退。
- **建议**：`skipped` 改为按未发放数量退款；或当 `added < roll.wanted` 时整抽跳过（不部分发货）按完整单价退款该抽。

### 🟡 2. MEG 基地本地复活清空背包，无检查点的 L0 软回却保留背包——惩罚倒挂（已核实）
- **位置**：`js/backrooms-meg-checkpoint.js:205`（`applyMegDeathState` 调 `resetBackpack()`）vs `306-333`（`l0_reset` 不调 `resetBackpack`）
- **现状**：`meg_local`（在有检查点的 Level 1 死亡）走 `applyMegDeathState` → `resetBackpack()` 清空背包+快捷栏；`l0_reset`（无检查点死亡）走软回 L0，注释写明"保留背包/负面/积分"。两条路径都保留死亡负面，唯独背包处理相反。
- **触发**：在 MEG 基地内死亡选"接受负面"→ 复活背包全清；无检查点死在野外 → 软回 L0 时背包保留。更安全的死亡点反而惩罚更重。
- **建议**：统一两条路径的背包策略。若软回 L0 是新设计的"保留背包"，`applyMegDeathState` 也应保留（移除 `resetBackpack()`）；或在注释中明确差异化设计意图。

### 🟡 3. 轮盘赌/档案查看器模态遮罩未拦截快捷栏按键，弹窗内可误用道具（已核实）
- **位置**：`js/backrooms-roulette.js:210-222`（`keyHandler` 仅处理 Space/Enter/Escape）；`js/backrooms-inventory.js` `bindHotbarKeys`（window 级 bubble 监听，无遮罩守卫）
- **现状**：轮盘 `keyHandler` 以 capture 挂 `document`，只对 Space/Enter/Escape 调 `stopPropagation`；其他键（R、1-6、方向键）继续冒泡到 window 级 `bindHotbarKeys`，后者也无模态状态检查。档案查看器同理。
- **触发**：打开轮盘赌遮罩后按 R → `useSelectedHotbarItem()` 消耗选中快捷栏消耗品；按 1-6 切换选中格。
- **建议**：`bindHotbarKeys` 回调开头加 `if (isInventoryOpen() || isAnyModalOverlayOpen()) return;`；或让轮盘/档案 keyHandler 对所有键调 `e.stopImmediatePropagation()`。

### ⚪ 4. 运气系统每帧重复 `sessionStorage.getItem` + `JSON.parse`（已核实）
- **位置**：`js/backrooms-luck.js:115`（`getLuck` → `readMod`）；调用方 `js/backrooms-fps-controller.js:77`（每帧移动）、`survival.js update` 中 `syncLuckExpiry`/`getLuck`/`updateBadLuckEvents`
- **现状**：`getLuck()` 每次都 `getItem` + `JSON.parse`，每帧被移动循环调用 1 次 + `update` 调 2~3 次，合计每帧约 3~4 次 JSON 解析。
- **建议**：模块级缓存运气值和过期时间，仅过期时回读 sessionStorage；或由 `survival.update` 每帧刷新一次缓存供移动循环复用。

### ⚪ 5. 豆奶/皇家口粮：先消耗物品再激活 buff，激活失败时物品丢失（已核实）
- **位置**：`js/backrooms-survival.js:432-433`（`useStrawberrySoyMilk`）、`462-467`（`useLuckySoyMilk`）、`524-525`（`useRoyalRations`）、`535-536`（`useRoyalRationsMedium`）
- **现状**：模式为 `removeFirstItem(id)` → `activateBuff()`。`removeFirstItem` 已持久化移除，若随后 `activateBuff` 返回 false（sessionStorage 配额异常），方法直接 `return false`，物品已消失但 buff 未生效。
- **触发**：sessionStorage 写入失败（极罕见，隐私模式/配额满）。
- **建议**：先 `activateBuff()` 成功后再 `removeFirstItem`；或失败时回滚（把物品加回去）。

---

## 二、性能与资源维度

### 🔴 1. L4 chunk 内 per-call 材质未 dispose——流式探索显存逐次累积（新增债务）
- **位置**：`js/backrooms-level4-world.js` `addMegL4Outpost`（约 L689-705）、`addVendingMachineToL61`（约 L605-630）、`disposeChunkMeshResources`（约 L918-922）
- **现状**：`addMegL4Outpost` 每次新建 5 个 `MeshStandardMaterial`；`addVendingMachineToL61` 在零食循环里每块新建材质（9 个）。部分走 InstancedMesh，部分挂普通 Mesh。但 `disposeChunkMeshResources` 只处理 `child.isInstancedMesh && child.dispose()`，既不 dispose 普通 Mesh 的材质，`InstancedMesh.dispose()` 本身也不释放其 material/geometry。
- **影响**：Meg 前哨区块（chunk 1,0）和出生区块（chunk 0,0）随玩家走开/返回 unload→reload。`L4_STREAM_RADIUS=2`，每次往返泄漏约 14 个材质，在单次 L4 探索会话内持续累积——V3/V4 标记的"最严重显存泄漏"在 chunk 粒度的残余形态。
- **建议**：材质提升为模块级共享（像 `sharedMaterials()`），或在 `disposeChunkMeshResources` 里对非共享材质 `mat.dispose()`。零食色块可用 InstancedMesh + `setColorAt`。

### 🟡 2. 碰撞检测仍全量遍历 wallColliders，无空间网格（旧债未还，新关卡延续）
- **位置**：`js/backrooms-collide.js:81-100`（`resolveCircleAgainstColliders`），调用点 `level4.js:466`(nearPad=16)、`level6.js:256`(nearPad=40)、`level14.js:505`、`level37.js:359`、`level48.js:438`、`level119.js:554`、`level9.js:244` 等
- **现状**：碰撞解析是 `for iter<maxIter { for i<colliders.length {...} }`，仅有 `nearPad` 的宽松 AABB 预剔除，无 grid/四叉树。L4 流式关卡 `ctx.colliders` 随加载块增长，25 chunk × 每块 10~20 collider ≈ 250~500 个，每帧最多 `maxIter`×全量遍历。L6 用 nearPad=40 说明已感受到遍历压力。
- **建议**：给 `resolveCircleAgainstColliders` 增加按 `minX/minZ` 分桶的网格索引（chunk 级或 8m 格），或对 L4 用 per-chunk collider 子集 + 邻接表。

### 🟡 3. L8-world 岩石/钟乳石每件新建 Geometry，未共享（新增债务）
- **位置**：`js/backrooms-level8-world.js:42`（`addRock` `new THREE.DodecahedronGeometry(1,0)`）、`56-57`（`addStalactites` `new THREE.ConeGeometry(...)`）
- **现状**：边界 84 块岩石 + 散落 22 块 + 46 根钟乳石 ≈ 152 个独立几何体全部 `new`。所有 `DodecahedronGeometry(1,0)` 参数一致靠 scale 区分却各建一份；`ConeGeometry` 半径随 `i%5` 变化可归并到 5 个共享实例。
- **影响**：单次加载多出 ~150 个 GPU geometry + ~150 个 draw call。不跨帧累积，但拉高 L8 显存与渲染批次。对照 `level9-world.js:22-29` 的 `sharedGeometry()` + scale 是更优写法。
- **建议**：岩石统一 `sharedDodecaGeo()` + scale；钟乳石按 5 种半径缓存 5 个 ConeGeometry；木板 `BoxGeometry` 同样可共享。

### ⚪ 4. L21 门牌每门新建 CanvasTexture + Material（新增债务）
- **位置**：`js/backrooms-level21.js:245`（`new MeshBasicMaterial({ map: makeDoorNumberTexture(...) })`）、`148`（`makeDoorNumberTexture` 内 `new CanvasTexture`）、`225/232`（每门 `new BoxGeometry` 尺寸固定却不共享）
- **建议**：门牌合并为一张 atlas 纹理 + UV 偏移；门几何提升为共享。

### ⚪ 5. GLB 模型未跨关缓存，L14 每次进入重新解析（新增债务）
- **位置**：`js/backrooms-level14.js:265,299`（`new GLTFLoader().load(...)` 两处）、`level13.js:195`
- **现状**：L14 进入时加载树+叶两个 GLB；L13 加载 faceling。文件走 HTTP 缓存，但 GLTF 解析、`normalizeToHeight`/`traverse` 改材质每关重来。L14 还在回调里对树模板每个 mesh 新建 `MeshStandardMaterial` 覆盖；叶片 420 个节点拉高每帧可见性遍历。
- **建议**：缓存 `gltf.scene` 模板到模块变量，重入时直接复用已解析模板。

### ✅ 6. L4 背景音乐实现正确，无显著泄漏（正面确认）
- **位置**：`js/backrooms-level4-music.js` 全文
- **现状**：用 `HTMLAudioElement`（非 Web Audio source node，无泄漏风险）。`stopLevel4Music` 取消 `fadeFrame` + `pause()+currentTime=0`；`fadeOutLevel4Music` 先取消旧 frame 再起新循环。`pagehide` 绑定保证跳转前停音。
- **小瑕疵**：`bindLevel4Music`（L97-99）每次调用都 `addEventListener("pagehide",…)`，重复进入会叠加监听；加 `_pagehideBound` 守卫即可。

### ✅ 7. 点光源池实现质量好（正面确认）
- **位置**：`js/backrooms-point-light-pool.js` 全文
- **现状**：固定 `count` 盏 `PointLight`，每帧把离玩家最近的候选灯位赋过去；空槽用 `intensity=0` 而非 `visible=false`（注释正确指出后者会触发 shader 重编译）。`dispose()` 从父节点移除所有灯并清空数组。
- **小瑕疵**：`update` 是 O(n×count) 插入排序，但 count 通常 ≤6 可接受。

### ✅ 8. 动画循环无每帧对象分配（正面确认，相对 V3 改进）
- **位置**：各关 `frame()` 函数
- **现状**：所有新关卡帧循环均用模块级 `_physOpts`/`_survCtx` 等复用对象，无 `new THREE.Vector3`、无 `{x,z}` 字面量 per-frame。`resolveCircleAgainstColliders` 返回模块级 `_resolveOut` 复用。

---

## 三、可玩性与平衡性维度

### 🔴 1. 四个死路关卡：有入口、无出口、无存档（C-370 / 蓝通道 / L121 / L14）（已核实）
- **位置**：`js/backrooms-level-c370.js`（全文）、`js/backrooms-blue-channel.js`（全文）、`js/backrooms-level121.js:127`、`js/backrooms-level14.js:434`
- **现状**：这四关都只有 `enforceLevelEntry` 入口校验，**没有任何 `grantLevelPass` / `saveBackroomsSurvival` / `location.href` 出口**，也无 portal/teleport 逻辑：
- **C-370**：文件头自标「stub」——由 `level37.js:224,227 exitToC370()` 进入，进后无死因无出口，玩家彻底卡死，只能关标签页。
- **蓝通道**：文件头自标「L119 蓝色滑梯终点 stub」——由 `level119.js:63-64` 进入，同样无死因无出口。
- **L121**（湖底）：由 `level48.js:257` 沉底和轮盘进入，无出口。
- **L14**（天堂）：`level13.js:386,389` 进入，40 秒后理智 50/s 崩解，靠死亡→MEG 重生脱身，但进入时无 `saveBackroomsSurvival`，存活进度不落盘，且会叠增死亡惩罚。
- **触发**：玩家从 L37 走白色楼梯进 C-370、或从 L119 蓝色滑梯进蓝通道后，无任何游戏内出口也无法回头。`installMegCheckpointDeathHooks` 只在本关内复活，不提供出路。唯一脱困是 F5 → `resetBackroomsRun` 整局清空。即一次正常探索强制结束整局。
- **建议**：为 stub 关卡补出口（至少一条回 L0 的传送/重生路径）+ 进出时 `saveBackroomsSurvival`；L14 若定位为结局，应显式触发 `resetBackroomsRun` 回 L0 而非靠死亡。**P0 上线前必修。**

### 🔴 2. 移动端触控走动/跳跃/交互仍未补（V3/V4 点名，仍存在）
- **位置**：`js/backrooms-fps-controller.js:77,259-270`、`backrooms-fps-look.js:59`、`css/backrooms-survival.css`
- **现状**：`state.move.forward/back/left/right` 仅由键盘 `KeyW/S/A/D` 写入，无触控/虚拟摇杆路径；跳跃仅 `Space`，交互仅 `e` 键。CSS diff 新增的全是 `.br-hotbar*` 快捷栏样式，无 `joystick/touch-btn/mobile-controls`。仓库里有完整的 `js/action-joystick.js`，但只被 `index.html` 加载，backrooms 关卡 HTML 不引用。
- **影响**：移动端玩家在所有关卡（含全部新关卡）只能拖视角不能走动/跳/交互，整个移动端体验瘫痪。
- **建议**：backrooms 关卡接入虚拟摇杆（驱动 `state.move`）+ 跳跃/交互按钮，或复用 `action-joystick.js` 那套控件。

### 🟡 3. session-keys 仍遗漏 `backrooms_l3_yaw` / `backrooms_l283_yaw`（已核实）
- **位置**：`js/backrooms-level-pass.js:19,37`（定义）、`js/backrooms-session-keys.js:55,64`（列表只有 `l3_pass`/`l283_pass`，缺 yaw）
- **现状**：`grantLevelPass("l3", fps.yaw)`（`level2.js:284`、`level13.js:398`）和 `grantLevelPass("l283", fps.yaw)`（`level2.js:288`）经 `level-pass.js:89` 写入 `backrooms_l3_yaw` / `backrooms_l283_yaw`，但这两个 yaw 键不在 `BACKROOMS_SESSION_KEYS` 里。其余 25 个 yaw 键均已注册，唯独这两个漏。
- **影响**：reset 不彻底，yaw 残留破坏"新开局=干净状态"不变量。stale yaw 被 `grantLevelPass` 覆盖不会被误用，但注册缺口是 V3/V4 已知类问题且未修。
- **建议**：在 `BACKROOMS_SESSION_KEYS` 加入 `"backrooms_l3_yaw"`、`"backrooms_l283_yaw"`。

### 🟡 4. 新增键 `backrooms_l283_meg_exit_v1` 未注册（已核实）
- **位置**：`js/backrooms-meg-checkpoint.js:412,416`（`L283_MEG_EXIT_FLAG` 定义并 setItem）
- **现状**：常量在 `:416` setItem、`:424` getItem、`:425` 自行 removeItem（一次性消费键），但未出现在 `BACKROOMS_SESSION_KEYS`。
- **影响**：若 reset 发生在 consume 之前，该标志残留并可能在下一局被误读为 L283 meg-exit 分支。
- **建议**：从 `backrooms-meg-checkpoint.js` import `L283_MEG_EXIT_FLAG` 并加入列表。

### 🟡 5. 死亡惩罚死亡螺旋：P1+P2 叠加持久，第 3 次硬删档（已核实）
- **位置**：`js/backrooms-death-penalty.js:22-25,155-159,161-176`
- **现状**：P1（理智上限 100→80、消耗×2、幻觉层激活）与 P2（HP×0.75=75、体力×0.75）叠加且持久存于 sessionStorage 直到删档或花 80 积分清空。单次免除（30 积分）只跳过"效果"不重置"次数"，3 次死亡必然到删档阈值，完全规避需累计 30+30+80=140 积分。而惩罚本身降低刷积分能力。P2 后玩家 HP 75，肢团扑击 45 + 飞蛾喷雾 35 合计 80 即可击杀，第 3 次死亡极易触发。
- **影响**：陷入"惩罚→更易死→更重惩罚"正反馈，第 3 次死亡若 <80 积分别无选择只能删档，无渐进缓冲。
- **建议**：P1/P2 效果加随时间衰减，或单次免除也清当前档效果，给玩家缓冲。

### 🟡 6. 幸运豆奶效应过强：单瓶 ±100 碾压 ±30 阈值 6 分钟（已核实）
- **位置**：`js/backrooms-soy-milk.js:19-20,76-81`、`js/backrooms-luck.js:96-132`
- **现状**：幸运豆奶冷 luck −100 / 热 +100，持续 6 分钟，而运气判定阈值仅 ±30。倒霉档会触发：商人拒交易锁 2 分钟（20% 概率）、移速 0.58 踉跄 1.4s、肢团复制 +65% / 飞蛾删 45%。
- **影响**：6 分钟内若处于 L3 迷宫等高危关，倒霉叠加实体翻倍+踉跄+商人锁+死亡惩罚，致死风险显著放大。
- **建议**：调低 ±100 幅度，或提高触发阈值与豆奶幅度的差距。

### 🟡 7. 核爆动画在标签页后台化 / 低帧率时被跳过（已核实）
- **位置**：`js/backrooms-level-c144.js:748-765`（`updateNightSequence` stage 2）
- **现状**：阶段 2 用两个不同时间源——`elapsed = now - cutsceneStageAt`（`performance.now()` 真实墙钟，判定 `>= 6000` 退出），而 `explosionT += dt`（`dt` 来自 `clock.getDelta()` 且被 `Math.min(..., 0.05)` 钳制）驱动蘑菇云/火球/冲击环动画进度（`progress = explosionT / 4.2`）。
- **触发**：标签页切后台时 rAF 暂停，恢复首帧 `elapsed` 直接越过 6000ms 立即 `finishNightSequence()`，而 `explosionT` 当帧只 +0.05，爆炸几乎没播就跳到天亮。低帧率（<14fps，省电模式）下同理。
- **建议**：动画进度改用 `elapsed`（真实时间）而非累积 `dt`，如 `var progress = Math.min(1, elapsed / 4.2);`，让视觉与退出判定同源。

### 🟡 8. `exitToLevelC192` 立即跳转，无过渡延迟，toast 永远看不到（已核实）
- **位置**：`js/backrooms-level-c144.js:622-630`
- **现状**：`exitToLevelC192()` 同步执行 `grantLevelPass` + `queueEnterLevelNumber` + `showToast("你碰到了山洞…")` 后紧接着 `window.location.href = "backrooms-level-c192.html"` 立即跳转。
- **触发**：玩家走到山洞口（`z < -285`）即瞬切，toast 因页面立即卸载根本不显示。对比 `level-c192.js:194-205 exitToLevel48` 与 `level37.js:226-228 exitToC370` 都用 `setTimeout(…, 650)` 留出过渡窗口。数据写入同步不丢，但体验不一致。
- **建议**：与 C-192/L37 对齐，包一层 650ms `setTimeout` 再跳转。

### ⚪ 9. 变异体休息→激活切换时位置瞬移（已核实）
- **位置**：`js/backrooms-level-c144.js:569-589`（`setMutantsResting(false)` 把 `clump.x/z` 重置为 `homeX/homeZ`）
- **现状**：休息期变异体被 `updateMutantRest:598-614` 平滑移到洞深处（`z≈-324~-338`），激活瞬间直接把位置写回出生格（`z≈-262~-282`），形成一次瞬移。玩家若正望向山洞方向会看到 30 个肢团集体"跳"回前沿。
- **建议**：激活时不强制重置坐标，改为让 `hostileClumps.update` 自然从洞深处追出来，或加淡入。

### ⚪ 10. `removeFriendlyClumps` 只隐藏不销毁，帧循环每帧遍历跳过（已核实）
- **位置**：`js/backrooms-level-c144.js:518-527`、帧循环 `939-943`
- **现状**：`removeFriendlyClumps` 仅设 `group.visible = false` 并从 `interactRoots` 移除，但 `friendlyClumps` 数组不清空、figure 不 dispose、group 不从场景移除。帧循环每帧仍 `for` 遍历 5 个元素再 `continue`。
- **建议**：改为 `friendlyClumps.length = 0` 并从 root 移除 group。

### ⚪ 11. 火盐群伤偏强但未失衡（已核实）
- **位置**：`js/backrooms-firesalt.js:16-20`（伤害 60、半径 5m、无冷却靠消耗限流）、`trade-vault.js`（普通池火盐权重 21%）
- **现状**：60 伤害一发秒杀飞蛾(60)/鸡(40)，clump(100) 两发、smiler(150) 三发；半径 5m 群伤。供给充足。
- **建议**：群怪场景收益偏高，可酌情降半径或加冷却，当前可接受。

### ⚪ 12. 爆炸系统 geometry/material/texture 无 dispose 路径（已核实，当前无害）
- **位置**：`js/backrooms-level-c144.js:711-728`（`finishNightSequence` 仅 `explosionRoot.visible = false`）；`buildExplosion:437-479`
- **现状**：`finishNightSequence` 只把 `explosionRoot.visible = false`，从不 dispose。`makeSmokeTexture()` 的 `CanvasTexture`、cloud 的 `BufferGeometry`/`PointsMaterial`、core/ring 的 geometry/material 全留显存。好在 `buildExplosion` 只调一次、`explosionRoot` 复用而非重建，夜间过场不可重触发，不构成运行期泄漏。
- **建议**：补 `pagehide` 清理对齐 `level0-02.js`/`level2-xiaoye.js` 风格，以防 SPA 化。

---

## 四、统计与优先级建议

### 本轮发现统计
- 🔴 高：4 项（交易库部分发货退款遗漏、L4 chunk 材质未 dispose、四个死路关卡、移动端触控缺失）
- 🟡 中：8 项
- ⚪ 低：8 项
- ✅ 正面确认：4 项（L4 音乐、点光源池、无每帧对象分配、L4 主体显存债已还）

### P0 上线前必修
1. **四个死路关卡补出口**（C-370/蓝通道/L121/L14）——玩家进入即整局报废。
2. **交易库部分发货退款遗漏**——抽卡丢物品不退积分。
3. **移动端触控走动/跳跃/交互**——移动端全关卡不可玩。

### P1 尽快修
4. **核爆双时间源**——后台/低帧率下核爆被跳过（一行改动：`progress = elapsed/4.2`）。
5. **`exitToLevelC192` 加 650ms 延迟**——toast 不可见。
6. **session-keys 补 `l3_yaw`/`l283_yaw`/`l283_meg_exit_v1`**——reset 不彻底。
7. **MEG 复活 vs L0 软回背包策略倒挂**——统一。
8. **轮盘/档案遮罩拦截快捷栏按键**——误用道具。

### P2 平衡性
9. 死亡惩罚死亡螺旋缓冲、幸运豆奶 ±100 幅度、变异体瞬移。

### 下周计划建议
- 修复上述 P0/P1。
- C-370/蓝通道/L121 补内容或明确标注为结局并补出口。
- L8 岩石/钟乳石、L21 门牌几何/纹理共享化。
- 碰撞检测引入空间网格（覆盖 L3/L4/L6/L9/L14/L37/L48/L119 全部全量遍历关卡）。

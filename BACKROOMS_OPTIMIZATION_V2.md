# 后室项目代码结构优化建议（健壮性 / 可维护性）

> 基于当前代码（50 个 HTML 入口、111 个 backrooms JS 模块、约 7.7 万行）四维并行结构审查汇总。

## 一、现状速览

- HTML 关卡入口：50 个
- backrooms-*.js 模块：111 个
- 总 JS 行数：约 7.7 万
- sessionStorage key：130+（散落 39 个文件）
- 自动化测试：0
- 构建工具 / package.json：无
- 敌人 AI 套数：5（无公共基类）
- 碰撞脚手架复制处：11
- 监听器 add/remove 比：188 / 29

架构基本面是好的：backrooms-fps-controller.js 被 49 个模块复用、survival.takeDamage / meg-checkpoint / level-enter 都有共享实现、点光池和画质降级真正生效。问题集中在三块：共享核心存在但装配脚手架在几十个关卡里逐字复制；几个致命的运行时健壮性缺口；零测试基础设施。

## 二、健壮性问题（按严重度）

### H1 健壮性·高：渲染循环无 try/catch，单帧异常导致静默卡死

frame() 把 requestAnimationFrame(frame) 放函数体第一行，之后整段物理/碰撞/渲染裸跑：

- js/backrooms-level4.js:714-771
- js/backrooms-level0.js:1335-1401
- js/action-scene.js:6084-6093

某个 mesh 被异步卸载后仍被引用，会每帧抛异常，renderer.render 永远执行不到，画面冻结在最后一帧、控制台被同一错误刷屏。showError 只覆盖 init()，用户得不到提示。

修复建议：frame 体包 try/catch，catch 内 console.error + 限频 showError，连续 N 帧异常触发降级或重载。

### H2 健壮性·高：死亡路由半完成状态，关标签页会状态错乱

onPrepareDeath 在死亡遮罩出现的瞬间就清空背包 + 写 MEG_DEATH_KEY + 定 deathPlan（meg-checkpoint.js:288-324），但 onDeath 要等玩家 700ms 后选择才执行（survival.js:642-684）。玩家在 700ms 窗口内关标签页，flag 残留，下次进 L1 时 consumeMegRespawnRedirectFlag + applyMegDeathState 意外全量回血。

修复建议：把副作用延迟到 onDeath，或注册 pagehide 清理 MEG_DEATH_KEY。

### H3 健壮性·高：L283_MEG_EXIT_FLAG 未注册到清理表，跨局泄漏

session-keys.js 从 meg-checkpoint 只 import 了 3 个常量，漏了 L283_MEG_EXIT_FLAG（meg-checkpoint.js:437）。死亡/刷新时 clearAllBackroomsSessionKeys 清不掉它，下一局进 L1 误触发 L283 出口入场逻辑。

修复建议：import 并加入数组。一行改动。

### M1 健壮性·中：c144 死亡模型偏离

level-c144.js:980-993 的 onPrepareDeath 不清背包、不捕获死亡载荷，但 survival.triggerDeath 700ms 后仍 offerDeathPenaltyChoice，死亡计数仍 +1、P1/P2 仍累加。文档声明真正死亡一律清空背包，玩家却以为 c144 安全区，实际在攒永久删档进度。

修复建议：明确 c144 是否计入死亡惩罚，二选一对齐。

### M2 健壮性·中：GLB / 音频加载失败静默吞错

- level14.js:321-323（dead-tree/leaf）、level13.js:227-229（faceling）：onError 只清 waiter，不 warn、不 toast、不通知 waiter。
- level0-music.js:16 / level4-music.js：new Audio 未挂 error 事件，play reject 后 bindGestureOnce 重新绑监听，形成无限静默重试循环。

修复建议：统一 onError 至少 console.warn(url, err) + callbacks[i](null) 通知 waiter + 可选 toast，参照 c192.js:180 / level8-chickens.js:94 的好做法。

### M3 健壮性·中：监听器净泄漏 6.5 倍

全库 addEventListener 188 次 vs removeEventListener 29 次。level1.js 12 add / 0 remove；lobby-ui.js 13/0；action-joystick.js 11/0。轮盘/档案遮罩各写一份捕获阶段吞按键逻辑（roulette.js:210、inventory.js:624）互相不知道对方。切关后旧关卡按键处理仍触发（回大厅后 W 键还在驱动已销毁对象），难复现。

修复建议：建统一输入管理器 + 关卡 dispose 契约强制摘除 window/document 监听。

### M4 健壮性·中：Partygoer / Xiaoye 不做墙体碰撞，会穿墙

partygoer.js:328-329 直接写位置，全文件无 resolveCircle；level2-xiaoye.js:289-290 沿固定臂 lerp。玩法/作弊漏洞。

### M5 健壮性·中：缓存策略自相矛盾

server/app.py:567 对所有 html/js/css 套 no-store，使 50 个 HTML 里的 ?v=N 全成死代码、重复访问零缓存。同时嵌套 ES import 基本是裸 URL（仅 3 处带 ?v=），一旦部署到带缓存的反代，会出现 HTML 新、依赖 JS 旧 的部分更新故障。

修复建议：二选一——保留 no-store 并删所有 ?v= 死代码；或改长期缓存 + 给嵌套 import 统一注入版本号（需 import map 改造）。

### M6 健壮性·中：存档格式无版本字段/迁移

survival-persist.js:16 的 backrooms_survival_v1 存 hp/sanity/stamina 无 v；meg-checkpoint.js:170 checkpoint 同样无 v；MEG_DEATH_KEY 有 v:2 但 applyMegDeathState 不检查。格式变更时旧档静默误读成 NaN。对照 player-state-persist.js:152 大厅存档正确做了版本检查。

修复建议：给 checkpoint/survival JSON 加 v 字段 + 迁移函数。

### L1 健壮性·低：移动端关卡无走动/跳跃/交互触控

fps-controller.js:227 只接 attachMobileDragLook，移动仍绑 keydown WASD。手机进 L0/L4 能拖视角但走不动。action-joystick.js 的 isTouchDevice 判定稳健但只服务 hub。

### L2 健壮性·低：幸运值无 ±100 clamp

luck.js:76 delta | 0 只截断不 clamp，调用方可传任意值放大后续随机判定。

## 三、可维护性问题

### S1 可维护性·高：wallCollider/addBox 在 11 个关卡逐字复制，从未 export

level119.js:168、level48.js:83、level14.js:113、level37.js:83、c1295/c144/blue-channel/c129x-stub/c1289/c1299-1/c1297/c370。改一个字段要同步改 11 处。

修复建议：抽 backrooms-world-shell.js 共享 wallCollider/addBox/HUD 宿主查找。收益最大、风险最低（纯提取，行为不变）。

### S2 可维护性·高：死代码 c129x-stub.js（260 行）零引用 + C 系 10 份复制粘贴

grep c129x-stub 全库零命中。本该做 C-1290~C-1299 共享基座，实际却存在 10 个独立模块（共 7936 行）各自复制整套装配样板。

修复建议：让 stub 真正承担共享 init/survival/checkpoint/temperature 装配，各 C 关卡只提供差异化几何。

### S3 可维护性·高：生存装配 7 行块在约 20 关卡逐字重复

new BackroomsSurvival → mountHud → loadBackroomsSurvival → registerBackroomsSurvivalPersist → installMegCheckpointDeathHooks → registerBackroomsInventoryUseHandlers → initBackroomsTemperature，见 c1290.js:887、c1292.js:1154、c1295.js:459 等。

修复建议：抽 createSurvivalContext(levelId, opts) 工厂。

### S4 可维护性·中：5 套敌人 AI 零公共基类

mulberry32 在 clump-ai.js:41 和 death-moth.js:90 逐字相同；distSq 复制 3 份；create*System 接口签名一致却无基类。更糟的是 AI 被焊死在特定关卡几何上：clump-ai.js:6-13 直接 import level2-world 的 CORRIDOR_LENGTH 和 level3-world 的 CELL/MAZE_H，无法跨关卡复用。

修复建议：抽 backrooms-enemy-base.js（状态机 + 寻路 + 伤害管道 + 碰撞解析），AI 接受抽象 NavigationWorld 接口而非具体关卡常量。

### S5 可维护性·中：三个超大文件职责混杂

- tasks.js 2395 行：任务数据 + 20 个 localStorage key + KV 存储层 + 任务/成就逻辑 + 禁食路线子系统 + 两套 UI。应拆 4-5 个文件。
- level1.js 2289 行 / 92 函数：MEG 对话约 30 函数 + Level 11 导览（边界泄漏）+ 宝箱 + L1.1 墙体切割 + Hub 路由/餐厅 + 移动物理输入。L11 逻辑出现在 level1.js 是明显的边界错误。
- level1-1-zones.js 1147 行：只 export 2 个符号，createLevel1_1ZoneManager 跨越 1100 行单函数，40 个内部函数全闭包无法测试。

### S6 可维护性·中：难度档位是纯展示标签

survival-difficulty.js 的 SURVIVAL_DIFFICULTY 表在全库除自身外零 import。敌人伤害/速度全在各 AI 模块硬编码（clump-ai.js:25 CLUMP_POUNCE_DAMAGE=45、death-moth.js:26、partygoer.js:251）。难度 5 和难度 1 的 Clump 伤害完全相同，对玩家误导、对平衡无杠杆。

修复建议：抽 backrooms-balance-config.js，难度档位驱动敌人伤害/速度/冷却乘数。

### S7 可维护性·低：HTML 骨架重复 + 生成物入库

47 个 HTML 的 importmap + HUD DOM 骨架字节级重复；backrooms-sandbox.html 537KB 生成物应移出版本控制。

## 四、优化路线图

### P0 立即（堵致命缺口，风险极低）

- H1：渲染循环加 try/catch + 限频 showError + 连续异常降级
- H3：补 L283_MEG_EXIT_FLAG 到清理表（一行）
- H2：死亡半完成状态 pagehide 清理或延迟副作用
- M2：统一 GLB/音频 onError，参照 c192/chickens 模式
- M3：统一输入管理器 + 关卡 dispose 契约摘除监听器

### P1 短期（消除复制，低风险纯提取）

- S1：抽 backrooms-world-shell.js，一次消除 11 处碰撞 + 20 处 HUD 宿主复制
- S3：抽 createSurvivalContext 工厂，消除约 20 处装配样板
- S2：激活 c129x-stub 承担 C 系共享基座
- M1：c144 死亡模型对齐
- M4：Partygoer/Xiaoye 补墙体碰撞
- M6：存档格式版本化

### P2 中期（架构收敛，需回归验证）

- S4：敌人 AI 基类，5 套收敛到一份骨架
- S5：拆 tasks.js / level1.js / level1-1-zones.js
- S6：平衡配置层，难度档位驱动数值
- M5：缓存策略二选一
- L1：移动端关卡触控

### P3 前提（安全网）

- 至少冒烟级关卡启动测试：headless 跑每个 HTML 入口，断言无 console error + renderer 至少 render 一帧
- godMode/noclip 调试入口

## 五、最关键的一点

P3 测试基础设施是 P1/P2 能安全落地的前提。140 个文件、11 套复制碰撞、5 套平行 AI，没有至少关卡能无异常启动并 render 一帧的冒烟测试，任何重构都会引入不可见回归。建议先建最小无头启动测试，再开始 S1/S3 这类提取。

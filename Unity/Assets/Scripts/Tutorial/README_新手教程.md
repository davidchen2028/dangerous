# 【新手教程】0 号模拟围区 — 挂载与运行指南

## 一、脚本说明

| 脚本 | 作用 |
|------|------|
| `SimulationSectorZeroGenerator` | 用 Cube 自动生成走廊地图 + `SpawnPoint_Alpha` |
| `NetworkSpawnManager` | NGO 联机：第 1 名玩家出生在 Alpha 点 |

## 二、场景搭建步骤

### 1. 新建教学场景

1. Unity 菜单 **File → New Scene**（或复制现有联机场景）。
2. 保存为例如：`Assets/Scenes/Tutorial_新手教程.unity`。

### 2. 挂载地图生成器

1. 在 Hierarchy 创建空物体：`LevelGenerator`。
2. **Add Component** → `SimulationSectorZeroGenerator`。
3. 在 Inspector 中：
   - 勾选 **Generate On Awake**（进入 Play 自动生成）。
   - 材质可留空（脚本会用灰/蓝/木色默认材质）。
4. 也可在组件右上角 **⋮ → 生成 0 号模拟围区** 提前在编辑器里生成，便于查看布局。

生成后 Hierarchy 会出现：

```text
LevelGenerator
└── SectorZero_新手教程
    ├── Road_虚拟马路
    ├── Wall_Left_左墙 / Wall_Right_右墙
    ├── Cover_Truck_全息卡车
    ├── Cover_Left_Barrier_01 ~ 04
    ├── Cover_Right_Crate_01 ~ 04
    └── SpawnPoint_Alpha
```

### 3. 配置 Netcode for GameObjects

1. 确保场景里已有 **NetworkManager**（NGO 安装后可通过菜单创建）。
2. **NetworkManager → Network Config**：
   - 将 **Player Prefab** 设为你的角色预制体（含 `NetworkObject` + `NetworkTransform` 等）。
   - **取消勾选** `Create Player Prefab` / **Connection Approval** 相关里的自动创建玩家（不同 NGO 版本文案略有差异）。
   - 核心原则：**不要**让 NetworkManager 自动 Spawn 玩家，交给 `NetworkSpawnManager`。
3. 把角色预制体加入 **Network Prefabs List**。

### 4. 挂载联机出生管理器

1. 在场景中创建空物体：`NetworkSystems`（或挂在 NetworkManager 同一物体上）。
2. **Add Component** → `NetworkSpawnManager`。
3. Inspector 赋值：
   - **Player Prefab**：与 NetworkManager 使用的玩家预制体相同。
   - **Spawn Point Alpha**：将生成的 `SpawnPoint_Alpha` 拖入（或留空，运行时自动查找）。
4. `NetworkSpawnManager` 为普通 `MonoBehaviour`，**无需** NetworkObject，挂在场景任意空物体即可（建议与 NetworkManager 同级）。

### 5. 玩家预制体要求

- `NetworkObject`
- `CharacterController` + `PlayerController`（或其它移动脚本）
- 子物体 Main Camera（仅 Owner 启用，标准 NGO 做法）

## 三、运行与联机测试

### 本机 Host 测试

1. 打开 `Tutorial_新手教程` 场景。
2. Play → NetworkManager 以 **Host** 启动。
3. 地图自动生成，Host 玩家应出现在马路 A 端（Z≈2）`SpawnPoint_Alpha`。

### 客户端连入（手机 / 另一台 PC）

1. 构建或第二编辑器实例 **Client** 连接服务器 IP + 房间端口。
2. **第 1 个**连入的客户端玩家 → `SpawnPoint_Alpha`。
3. 第 2 名及以后会沿走廊方向间隔 2m 排队（可在 `NetworkSpawnManager` 调整 `Extra Player Spacing Z`）。

## 四、地图尺寸核对（制作人标准）

| 元素 | 尺寸 (X × Y × Z) | 中心位置 |
|------|------------------|----------|
| 虚拟马路 | 12 × 0.1 × 60 | (0, 0.05, 30) |
| 左右墙 | 0.5 × 3.5 × 60 | X=±6.25, Y=1.75, Z=30 |
| 全息卡车 | 2.5 × 2.5 × 6 | (0, 1.25, 30) |
| 左路矮掩体 ×4 | 1.5 × 1.3 × 0.8 | X=-5.25, Z=10/20/30/40 |
| 右路木箱 ×4 | 2 × 2 × 2 | Z 字形 22/28/34/38 |
| Alpha 出生点 | — | (0, 0, 2) |

## 五、常见问题

**Q：玩家没有出生在 Alpha？**  
检查 NetworkManager 是否仍在自动创建玩家；应仅由 `NetworkSpawnManager` 调用 `SpawnAsPlayerObject`。

**Q：找不到 SpawnPoint_Alpha？**  
先运行一次生成器，或确认 `SectorZero_新手教程/SpawnPoint_Alpha` 存在于场景中。

**Q：地图在客户端不一致？**  
所有端在连接前执行相同生成（`Generate On Awake`），或将本场景加入 Build Settings 作为固定教学关。

**Q：手机端如何输入房间号？**  
房间 UI 由大厅网页 / 独立 Lobby 场景负责；本脚本只处理进入 NGO 会话后的 **世界内出生点**。

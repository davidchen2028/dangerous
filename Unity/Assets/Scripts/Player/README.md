# PlayerController 使用说明

## 挂载步骤

1. 在 Unity 中创建 **3D Object → Capsule**（或空物体 + CharacterController）。
2. 添加 **CharacterController** 组件（脚本会自动要求）。
3. 将 `PlayerController.cs` 挂到同一物体上。
4. 将相机作为子物体，放在约 `y = 1.65`（眼睛高度，可按项目微调）。

## CharacterController 初始值（与脚本一致）

| 属性   | 值   |
|--------|------|
| Height | 1.8  |
| Radius | 0.4  |
| Center | (0, 0.9, 0) |

运行后蹲伏高度会由脚本平滑改为 1.2。

## 操作

| 按键 | 功能     |
|------|----------|
| WASD | 移动     |
| Shift | 奔跑（蹲下时无效） |
| C    | 蹲下（按住） |
| Space | 跳跃（需着地且未蹲） |

## 输入系统

- **新版**：Project Settings → Player → Active Input Handling → `Input System Package` 或 `Both`，并安装 Input System 包。
- **旧版**：选 `Input Manager (Old)` 或 `Both`，需保留 Horizontal / Vertical 轴。

## 物理说明

跳跃初速度：`v₀ = √(2 × |g| × jumpHeight)`，其中 `jumpHeight = 0.8`。  
重力默认 `-22`，比 `-9.81` 更沉，更接近战术射击手感；可在 Inspector 中调整 `Gravity`。

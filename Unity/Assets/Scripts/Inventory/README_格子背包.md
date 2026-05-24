# 格子背包系统（Grid Inventory）

## 脚本一览

| 脚本 | 类型 | 作用 |
|------|------|------|
| `LootItemData` | ScriptableObject | 物品 ID、名称、格子尺寸、极危币收购价 |
| `BagData` | ScriptableObject | 背包名称与格子长宽 |
| `PlacedItem` | 可序列化类 | 已放置物品 + 左上角坐标 |
| `PlayerGridInventory` | MonoBehaviour | 占用矩阵、放入检测、撤离变卖 |
| `PlayerWallet` | MonoBehaviour | 极危币单例钱包 |

## 快速搭建（0 号模拟围区 / 新手教程）

1. **创建资产**
   - 右键 → `极危行动/战利品物品`：例 `Item_CircuitBoard`（1×1）、`Item_TruckPart`（2×3）
   - 右键 → `极危行动/背包配置`：例 `Bag_Light_4x4`、`Bag_Heavy_6x8`

2. **场景物体**
   - 空物体 `PlayerSystems`，挂：
     - `PlayerWallet`
     - `PlayerGridInventory`（Inspector 指定 `Equipped Bag`）
     - `PlayerInventoryInput`（**B** / **Tab** 开关背包 UI，拖入 `inventoryPanel`）

3. **测试放入（临时脚本或 Inspector 按钮）**
   ```csharp
   public PlayerGridInventory inv;
   public LootItemData testItem;
   void Test() { inv.TryAddItem(testItem); }
   ```

4. **撤离结算**
   ```csharp
   long earned = playerGridInventory.SellAllItemsAndClear();
   ```

## 算法说明

- `CanAddItem`：对背包每个可作为左上角的 `(col,row)`，检测 `gridSize` 矩形内 `_inventoryGrid` 是否全为 `false`。
- `TryAddItem`：成功后将矩形标为 `true`，并 `List<PlacedItem>` 记录。
- `SellAllItemsAndClear`：累加 `baseSellPrice` → `PlayerWallet.AddPerilCredits` → 清空矩阵与列表。

## 后续可扩展

- 物品旋转 90°（交换 gridSize.x/y 再检测）
- 堆叠、耐久、稀有度倍率
- UI：`InventoryGridUI` 读取 `PlacedItems` 与 `IsCellOccupied` 绘制

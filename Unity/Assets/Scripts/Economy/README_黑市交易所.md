# 黑市交易所（单机 · 极危币）

## 脚本

| 文件 | 说明 |
|------|------|
| `LootItemData` | + `minMarketPrice` / `maxMarketPrice` |
| `MarketListing` | 订单：ID、物品、价格、是否官方 |
| `MarketManager` | 单例：挂牌、购买、官方 60 秒补货 |

## 场景挂载

1. 空物体 `EconomySystems` → `MarketManager`
2. Inspector 拖入：
   - `officialMedKit`（野战医疗缝合包 SO）
   - `officialCircuitBoard`（废弃军用电路板 SO）
   - `playerInventory` / `playerWallet`（可自动查找）
3. 与 `PlayerSystems`（背包、钱包）同场景

## API（UI 绑定）

```csharp
// 挂牌（价格须在限价内）
MarketManager.Instance.PlayerListData(item, targetPrice);

// 购买
MarketManager.Instance.PlayerBuyItem(listing);

// 列表刷新
MarketManager.Instance.OnMarketChanged += RefreshUI;
var list = MarketManager.Instance.activeListings;
var credits = MarketManager.Instance.GetPlayerCredits();
```

## 官方补货默认

- 野战医疗缝合包 ×4 @ 1200
- 废弃的军用电路板 ×2 @ 800
- 每 60 秒 `RefreshOfficialShops()` 替换全部官方单

## ItemDatabase 分类（`Inventory/ItemDatabase.cs`）

| 枚举 | 说明 |
|------|------|
| `Collectible` | 藏品类（原 Valuables 已废弃） |
| `Electronics` | 军用电子与情报 |
| `Gear` | 战术装备 |
| `Industrial` | 工业物资 |

### 宝箱藏品类（海盗箱可 roll）

| ID | 名称 | 稀有度 | 现货 | 回收 |
|----|------|--------|------|------|
| 1004 | 纯金战术指挥鹰雕像 | 传奇 | 500000 | 300000 |
| 3001 | 前线指挥官的合金火机 | 传奇 | 350000 | 210000 |
| 3002 | 复古废土手摇八音盒 | 传奇 | 260000 | 160000 |
| 3003 | 全息推演沙盘 | 史诗 | 95000 | 60000 |
| 3004 | 已停产的初代微光观测镜 | 史诗 | 75000 | 48000 |
| 3005 | 极危行动初代荣誉勋章 | 稀有 | 38000 | 24000 |

Web 黑市「收集品 › 藏品类」已上架上述 5 件（`stashId`：`c3001`–`c3005`）。

### 宝箱掉落（`PirateLootManager`）

**件数（先 roll）**：1 件 **20%** · 2 件 **40%** · 3 件 **30%** · 4 件 **10%**

**单件 ID 权重（分母 777，无空手）**：1004 **2%** · 3001 **3.5%** · 3002 **4%** · 史诗各 **14.2%** · 稀有 **39.8%**

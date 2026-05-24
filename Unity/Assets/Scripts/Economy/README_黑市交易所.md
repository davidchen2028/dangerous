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

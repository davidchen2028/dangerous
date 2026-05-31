using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 黑市交易所管理器（单机测试版）。
/// 结算货币：极危币（perilCredits）。
/// 官方货源由管理端手动补货，无自动刷新。
/// </summary>
public class MarketManager : MonoBehaviour
{
    public static MarketManager Instance { get; private set; }

    [Header("官方初始货源")]
    [Tooltip("野战医疗缝合包 ×4，单价 1200")]
    [SerializeField] LootItemData officialMedKit;

    [SerializeField] int officialMedKitCount = 4;

    [SerializeField] long officialMedKitPrice = 1200;

    [Tooltip("废弃的军用电路板 ×2，单价 800")]
    [SerializeField] LootItemData officialCircuitBoard;

    [SerializeField] int officialCircuitBoardCount = 2;

    [SerializeField] long officialCircuitBoardPrice = 800;

    [Header("引用（可留空则运行时 FindObjectOfType）")]
    [SerializeField] PlayerGridInventory playerInventory;

    [SerializeField] PlayerWallet playerWallet;

    /// <summary>当前市场上所有订单（UI 直接绑定此列表）</summary>
    public List<MarketListing> activeListings = new List<MarketListing>();

    public event Action OnMarketChanged;

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;

        if (playerInventory == null)
            playerInventory = FindObjectOfType<PlayerGridInventory>();

        if (playerWallet == null)
            playerWallet = FindObjectOfType<PlayerWallet>();
    }

    void OnDestroy()
    {
        if (Instance == this)
            Instance = null;
    }

    void Start()
    {
        RefreshOfficialShops();
    }

    /// <summary>
    /// 玩家将背包中的一件物品挂牌出售（需求文档中的 PlayerListData）。
    /// 价格须在 [minMarketPrice, maxMarketPrice] 内。
    /// </summary>
    public bool PlayerListItem(LootItemData item, long targetPrice)
    {
        return PlayerListData(item, targetPrice);
    }

    public bool PlayerListData(LootItemData item, long targetPrice)
    {
        if (item == null)
        {
            Debug.LogWarning("[MarketManager] 挂牌失败：物品为空。");
            return false;
        }

        if (!IsPriceValid(item, targetPrice))
        {
            Debug.LogWarning(
                $"[MarketManager] 挂牌价 {targetPrice} 超出限价 [{item.MinMarketPrice}, {item.MaxMarketPrice}]");
            return false;
        }

        if (playerInventory == null)
        {
            Debug.LogError("[MarketManager] 未找到 PlayerGridInventory。");
            return false;
        }

        if (!playerInventory.TryRemoveItem(item))
        {
            Debug.LogWarning($"[MarketManager] 背包中没有可挂牌的：{item.ItemName}");
            return false;
        }

        var listing = new MarketListing(
            Guid.NewGuid().ToString("N"),
            item,
            targetPrice,
            isOfficial: false);

        activeListings.Add(listing);
        NotifyChanged();

        Debug.Log($"[MarketManager] 已挂牌 {item.ItemName}，售价 {targetPrice} 极危币");
        return true;
    }

    /// <summary>玩家购买市场上的订单</summary>
    public bool PlayerBuyItem(MarketListing listing)
    {
        if (listing == null || listing.itemData == null)
            return false;

        if (!activeListings.Contains(listing))
        {
            Debug.LogWarning("[MarketManager] 订单已不存在。");
            return false;
        }

        if (playerWallet == null || playerInventory == null)
        {
            Debug.LogError("[MarketManager] 钱包或背包未配置。");
            return false;
        }

        if (!playerWallet.TrySpendPerilCredits(listing.price))
        {
            Debug.LogWarning($"[MarketManager] 极危币不足，需要 {listing.price}。");
            return false;
        }

        if (!playerInventory.TryAddItem(listing.itemData))
        {
            playerWallet.AddPerilCredits(listing.price);
            Debug.LogWarning("[MarketManager] 背包已满，购买已退款。");
            return false;
        }

        // 单机测试：玩家订单的货款暂不打给卖家
        activeListings.Remove(listing);
        NotifyChanged();

        Debug.Log(
            $"[MarketManager] 已购买 {listing.itemData.ItemName}（{listing.SourceTag}），花费 {listing.price} 极危币");
        return true;
    }

    /// <summary>清空旧官方单并上架基础物资（启动时初始化，后续由管理端补货）</summary>
    public void RefreshOfficialShops()
    {
        activeListings.RemoveAll(l => l.isOfficial);

        AddOfficialStock(officialMedKit, officialMedKitCount, officialMedKitPrice);
        AddOfficialStock(officialCircuitBoard, officialCircuitBoardCount, officialCircuitBoardPrice);

        NotifyChanged();
        Debug.Log($"[MarketManager] 官方补货完成，当前在售 {activeListings.Count} 条");
    }

    void AddOfficialStock(LootItemData item, int count, long unitPrice)
    {
        if (item == null || count <= 0)
            return;

        for (int i = 0; i < count; i++)
        {
            activeListings.Add(
                new MarketListing(
                    Guid.NewGuid().ToString("N"),
                    item,
                    unitPrice > 0 ? unitPrice : item.BaseSellPrice,
                    isOfficial: true));
        }
    }

    static bool IsPriceValid(LootItemData item, long price)
    {
        return price >= item.MinMarketPrice && price <= item.MaxMarketPrice;
    }

    void NotifyChanged()
    {
        OnMarketChanged?.Invoke();
    }

    public long GetPlayerCredits()
    {
        return playerWallet != null ? playerWallet.PerilCredits : 0;
    }
}

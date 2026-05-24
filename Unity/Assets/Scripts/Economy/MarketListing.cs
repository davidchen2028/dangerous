using System;

/// <summary>
/// 黑市交易所中的一条在售订单（玩家挂牌或官方补货）。
/// UI 层绑定此数据绘制商品行。
/// </summary>
[Serializable]
public class MarketListing
{
    public string listingID;
    public LootItemData itemData;
    public long price;
    public bool isOfficial;

    public MarketListing(string listingID, LootItemData itemData, long price, bool isOfficial)
    {
        this.listingID = listingID;
        this.itemData = itemData;
        this.price = price;
        this.isOfficial = isOfficial;
    }

    public string DisplayName => itemData != null ? itemData.ItemName : "未知物品";

    public string SourceTag => isOfficial ? "官方" : "玩家";
}

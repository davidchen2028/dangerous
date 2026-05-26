using System;
using UnityEngine;

/// <summary>
/// 海盗宝箱权重表用条目（可序列化）。
/// 注意：项目中 Inventory/LootItemData 为 ScriptableObject 资产，与此类用途不同。
/// </summary>
[Serializable]
public class PirateLootItemData
{
    [Tooltip("显示名称")]
    public string itemName;

    [Tooltip("物品 ID；0 表示空手而归")]
    public int itemID;

    [Tooltip("黑市参考市场价（极危币）")]
    public long marketPrice;

    [Tooltip("商人回收价（极危币）")]
    public long recyclePrice;

    [Tooltip("权重随机用权重值，越大越容易命中")]
    public int weight;

    /// <summary>是否为“空手而归”占位条目</summary>
    public bool IsEmpty => itemID == 0;

    public PirateLootItemData Clone()
    {
        return new PirateLootItemData
        {
            itemName = itemName,
            itemID = itemID,
            marketPrice = marketPrice,
            recyclePrice = recyclePrice,
            weight = weight,
        };
    }
}

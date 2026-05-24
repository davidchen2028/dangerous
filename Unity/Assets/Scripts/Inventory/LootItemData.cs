using UnityEngine;

/// <summary>
/// 战利品物品数据（ScriptableObject 资产）。
/// 在 Project 窗口右键 Create → 极危行动 → 战利品物品 创建实例。
/// 用于格子背包：每个物品占用 gridSize 大小的连续矩形区域。
/// </summary>
[CreateAssetMenu(
    fileName = "NewLootItem",
    menuName = "极危行动/战利品物品 (Loot Item)",
    order = 0)]
public class LootItemData : ScriptableObject
{
    [Header("基础信息")]
    [Tooltip("全局唯一 ID，存档与联机同步时使用")]
    [SerializeField] string itemID;

    [Tooltip("显示名称，如：军用电路板、全息卡车部件")]
    [SerializeField] string itemName;

    [Header("格子占用（宽 × 高）")]
    [Tooltip("在背包中占用的格子：x = 列数，y = 行数。例：1×1 电路板，2×3 卡车部件")]
    [SerializeField] Vector2Int gridSize = Vector2Int.one;

    [Header("经济（极危币）")]
    [Tooltip("官方收购价 / 撤离保底价")]
    [SerializeField] long baseSellPrice;

    [Tooltip("玩家在交易所挂牌允许的最低价")]
    [SerializeField] long minMarketPrice;

    [Tooltip("玩家在交易所挂牌允许的最高价")]
    [SerializeField] long maxMarketPrice;

    public string ItemID => itemID;
    public string ItemName => itemName;
    public Vector2Int GridSize => gridSize;
    public long BaseSellPrice => baseSellPrice;
    public long MinMarketPrice => minMarketPrice;
    public long MaxMarketPrice => maxMarketPrice;

    /// <summary>物品占用的总格子数（便于 UI 显示）</summary>
    public int CellCount => Mathf.Max(1, gridSize.x * gridSize.y);

#if UNITY_EDITOR
    void OnValidate()
    {
        gridSize.x = Mathf.Max(1, gridSize.x);
        gridSize.y = Mathf.Max(1, gridSize.y);
        baseSellPrice = Mathf.Max(0, baseSellPrice);

        if (minMarketPrice <= 0 && baseSellPrice > 0)
            minMarketPrice = (long)(baseSellPrice * 0.75f);

        if (maxMarketPrice <= 0 && baseSellPrice > 0)
            maxMarketPrice = (long)(baseSellPrice * 1.5f);

        if (maxMarketPrice < minMarketPrice)
            maxMarketPrice = minMarketPrice;

        if (string.IsNullOrWhiteSpace(itemID))
            itemID = name;
    }
#endif
}

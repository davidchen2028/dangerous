using System;
using System.Collections.Generic;

/// <summary>
/// 全局物资字典（硬编码 ID → 名称 / 分类 / 稀有度 / 双价）。
/// 黑市、回收、宝箱权重等系统统一查表，避免多处重复维护。
/// </summary>
public static class ItemDatabase
{
    /// <summary>物品大类（原 Valuables 高价值珍品类已废弃，统一为 Collectible 藏品类）。</summary>
    public enum ItemCategory
    {
        /// <summary>藏品类 — 宝箱专属高价值掉落池</summary>
        Collectible = 0,

        /// <summary>军用电子与情报</summary>
        Electronics = 1,

        /// <summary>战术装备</summary>
        Gear = 2,

        /// <summary>工业物资</summary>
        Industrial = 3,
    }

    /// <summary>稀有度（仅藏品类宝箱 roll 使用；等级越高基础权重越低）。</summary>
    public enum ItemRarity
    {
        None = 0,
        Rare = 1,
        Epic = 2,
        Legendary = 3,
        Mythic = 4,
        Ultimate = 5,
    }

    /// <summary>单条物资记录（ID 为字典 Key，不在结构体内重复存储）。</summary>
    public readonly struct ItemRecord
    {
        public readonly string ItemName;
        public readonly ItemCategory Category;
        public readonly ItemRarity Rarity;
        public readonly int MarketPrice;
        public readonly int RecyclePrice;

        public ItemRecord(
            string itemName,
            ItemCategory category,
            ItemRarity rarity,
            int marketPrice,
            int recyclePrice)
        {
            ItemName = itemName;
            Category = category;
            Rarity = rarity;
            MarketPrice = marketPrice;
            RecyclePrice = recyclePrice;
        }

        /// <summary>是否可进入海盗宝箱藏品类权重池。</summary>
        public bool IsChestCollectible =>
            Category == ItemCategory.Collectible && Rarity != ItemRarity.None;
    }

    /// <summary>单槽权重分母 10000（数值 = 百分比×100，0.05% = 5）。</summary>
    public const int ChestWeightTotal = 10000;

    public const int ChestWeightEmpty = 2175;
    public const int ChestWeight1004 = 200;
    public const int ChestWeight3001 = 350;
    public const int ChestWeight3002 = 400;
    public const int ChestWeight3006 = 50;
    public const int ChestWeight3007 = 5;
    public const int ChestWeightEpic = 1420;
    public const int ChestWeightRare = 3980;

    static readonly Dictionary<string, ItemRecord> Table;

    /// <summary>宝箱可 roll 的藏品 ID 列表（构建时填充，顺序稳定）。</summary>
    static readonly string[] ChestCollectibleIds;

    static ItemDatabase()
    {
        Table = new Dictionary<string, ItemRecord>(StringComparer.Ordinal)
        {
            // —— 藏品类（宝箱核心池 · ID 3001–3005）——
            ["3001"] = new ItemRecord(
                "前线指挥官的合金火机",
                ItemCategory.Collectible,
                ItemRarity.Legendary,
                350_000,
                210_000),
            ["3002"] = new ItemRecord(
                "复古废土手摇八音盒",
                ItemCategory.Collectible,
                ItemRarity.Legendary,
                260_000,
                160_000),
            ["3003"] = new ItemRecord(
                "全息推演沙盘",
                ItemCategory.Collectible,
                ItemRarity.Epic,
                95_000,
                60_000),
            ["3004"] = new ItemRecord(
                "已停产的初代微光观测镜",
                ItemCategory.Collectible,
                ItemRarity.Epic,
                75_000,
                48_000),
            ["3005"] = new ItemRecord(
                "极危行动初代荣誉勋章",
                ItemCategory.Collectible,
                ItemRarity.Rare,
                38_000,
                24_000),
            ["3006"] = new ItemRecord(
                "「红莲审判」时间晶体指挥仪",
                ItemCategory.Collectible,
                ItemRarity.Mythic,
                1_500_000,
                1_300_000),
            ["3007"] = new ItemRecord(
                "「永夜极光」黑曜石星象仪",
                ItemCategory.Collectible,
                ItemRarity.Ultimate,
                7_000_000,
                6_300_000),
            ["3008"] = new ItemRecord(
                "「微缩新星」坍缩黑金单晶",
                ItemCategory.Collectible,
                ItemRarity.Ultimate,
                12_000_000,
                11_000_000),
            ["1004"] = new ItemRecord(
                "纯金战术指挥鹰雕像",
                ItemCategory.Collectible,
                ItemRarity.Legendary,
                500_000,
                300_000),

            // —— 藏品类（仅黑市，不进宝箱池）——
            ["1005"] = new ItemRecord(
                "未知生物血清样本",
                ItemCategory.Collectible,
                ItemRarity.None,
                500_000,
                320_000),

            // —— 军用电子与情报 ——
            ["1001"] = new ItemRecord(
                "废弃的军用电路板",
                ItemCategory.Electronics,
                ItemRarity.None,
                500,
                300),
            ["1002"] = new ItemRecord(
                "完整的无人机镜头",
                ItemCategory.Electronics,
                ItemRarity.None,
                45_000,
                28_500),
            ["1003"] = new ItemRecord(
                "绝密航线硬盘",
                ItemCategory.Electronics,
                ItemRarity.None,
                60_000,
                38_000),
            ["1006"] = new ItemRecord(
                "军用加密对讲机",
                ItemCategory.Electronics,
                ItemRarity.None,
                8_500,
                5_200),
            ["1007"] = new ItemRecord(
                "高清特工夜视仪(损坏)",
                ItemCategory.Electronics,
                ItemRarity.None,
                15_000,
                9_000),

            // —— 工业物资 ——
            ["1008"] = new ItemRecord(
                "密封的特种机油",
                ItemCategory.Industrial,
                ItemRarity.None,
                1_200,
                700),
        };

        ChestCollectibleIds = BuildChestCollectibleIdList();
    }

    static string[] BuildChestCollectibleIdList()
    {
        var list = new List<string>();
        foreach (var kv in Table)
        {
            if (kv.Value.IsChestCollectible)
                list.Add(kv.Key);
        }

        list.Sort(StringComparer.Ordinal);
        return list.ToArray();
    }

    /// <summary>藏品类宝箱：按物品 ID 返回单槽权重（分母 <see cref="ChestWeightTotal"/>）。</summary>
    public static int GetChestWeightForItemId(string id, ItemRarity rarity)
    {
        switch (id)
        {
            case "1004":
                return ChestWeight1004;
            case "3001":
                return ChestWeight3001;
            case "3002":
                return ChestWeight3002;
            case "3006":
                return ChestWeight3006;
            case "3007":
                return ChestWeight3007;
            case "3008":
                return 0;
            case "3003":
            case "3004":
                return ChestWeightEpic;
            case "3005":
                return ChestWeightRare;
            default:
                return GetChestWeightForRarity(rarity);
        }
    }

    /// <summary>藏品类宝箱：按稀有度返回单件基础权重（未单独配置的传奇回退 0）。</summary>
    public static int GetChestWeightForRarity(ItemRarity rarity)
    {
        switch (rarity)
        {
            case ItemRarity.Epic:
                return ChestWeightEpic;
            case ItemRarity.Rare:
                return ChestWeightRare;
            case ItemRarity.Mythic:
                return ChestWeight3006;
            case ItemRarity.Ultimate:
                return ChestWeight3007;
            default:
                return 0;
        }
    }

    /// <summary>构建单槽权重池：空手 + 各藏品按 ID 权重（合计 1000）。</summary>
    public static void BuildChestSlotPool(List<(int itemId, int weight)> pool)
    {
        pool.Clear();
        pool.Add((0, ChestWeightEmpty));

        for (int i = 0; i < ChestCollectibleIds.Length; i++)
        {
            string id = ChestCollectibleIds[i];
            if (!TryGetRecord(id, out var rec))
                continue;

            if (!int.TryParse(id, out int numericId))
                continue;

            int w = GetChestWeightForItemId(id, rec.Rarity);
            if (w > 0)
                pool.Add((numericId, w));
        }
    }

    /// <summary>仅藏品（无空手），用于件数 roll 后的逐件抽取。</summary>
    public static void BuildChestItemPool(List<(int itemId, int weight)> pool)
    {
        pool.Clear();

        for (int i = 0; i < ChestCollectibleIds.Length; i++)
        {
            string id = ChestCollectibleIds[i];
            if (!TryGetRecord(id, out var rec))
                continue;

            if (!int.TryParse(id, out int numericId))
                continue;

            int w = GetChestWeightForItemId(id, rec.Rarity);
            if (w > 0)
                pool.Add((numericId, w));
        }
    }

    public static int GetMarketPrice(string id)
    {
        if (string.IsNullOrEmpty(id)) return 0;
        return Table.TryGetValue(id, out var rec) ? rec.MarketPrice : 0;
    }

    public static int GetRecyclePrice(string id)
    {
        if (string.IsNullOrEmpty(id)) return 0;
        return Table.TryGetValue(id, out var rec) ? rec.RecyclePrice : 0;
    }

    public static bool Contains(string id) =>
        !string.IsNullOrEmpty(id) && Table.ContainsKey(id);

    public static bool TryGetRecord(string id, out ItemRecord record) =>
        Table.TryGetValue(id ?? "", out record);

    public static ItemCategory GetCategory(string id)
    {
        return TryGetRecord(id, out var rec) ? rec.Category : ItemCategory.Industrial;
    }

    public static IReadOnlyDictionary<string, ItemRecord> All => Table;

    public static IReadOnlyList<string> ChestCollectibleIdList => ChestCollectibleIds;
}

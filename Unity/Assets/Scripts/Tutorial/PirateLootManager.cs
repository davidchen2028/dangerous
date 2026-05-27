using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

/// <summary>
/// 海盗宝箱 — 仅掉落 <see cref="ItemDatabase.ItemCategory.Collectible"/> 藏品类；
/// 稀有度越高权重越低（传奇 3 / 史诗 10 / 稀有 30，同档等权）。
/// QTE 成功后由 <see cref="WorldLootBox"/> 调用 <see cref="RollPirateChest"/>。
/// </summary>
public class PirateLootManager : MonoBehaviour
{
    public static PirateLootManager Instance { get; private set; }

    const int EmptyItemId = 0;
    const string EmptyItemName = "空手而归";

    /// <summary>每槽独立 roll 藏品类（共 3 槽，无极危币）。</summary>
    const int CollectibleSlotCount = 3;

    /// <summary>开箱结果：有效物品列表（仅藏品类 3001–3005 或空手）。</summary>
    [Serializable]
    public class PirateChestRollResult
    {
        public List<PirateLootItemData> items = new List<PirateLootItemData>();
    }

    readonly Dictionary<int, PirateLootItemData> _catalog = new Dictionary<int, PirateLootItemData>();
    readonly List<(int itemId, int weight)> _chestPool = new List<(int, int)>();

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);
        BuildItemCatalog();
    }

    void OnDestroy()
    {
        if (Instance == this)
            Instance = null;
    }

    /// <summary>从 <see cref="ItemDatabase"/> 同步全表；物价以数据库为准。</summary>
    void BuildItemCatalog()
    {
        _catalog.Clear();

        RegisterEmpty();

        foreach (var kv in ItemDatabase.All)
        {
            if (!int.TryParse(kv.Key, out int id))
                continue;

            var rec = kv.Value;
            Register(id, rec.ItemName, rec.MarketPrice, rec.RecyclePrice);
        }

        ItemDatabase.BuildChestSlotPool(_chestPool);
    }

    void RegisterEmpty()
    {
        _catalog[EmptyItemId] = new PirateLootItemData
        {
            itemID = EmptyItemId,
            itemName = EmptyItemName,
            marketPrice = 0,
            recyclePrice = 0,
            weight = ItemDatabase.ChestWeightEmpty,
        };
    }

    void Register(int id, string name, int market, int recycle)
    {
        _catalog[id] = new PirateLootItemData
        {
            itemID = id,
            itemName = name,
            marketPrice = market,
            recyclePrice = recycle,
            weight = 0,
        };
    }

    /// <summary>
    /// 三槽独立权重：仅藏品类 3001–3005；
    /// 空手 30 · 传奇各 6 · 史诗各 19 · 稀有 57（相对原 57/3/10/30 等比 ×19/10）。
    /// </summary>
    public PirateChestRollResult RollPirateChest()
    {
        if (_chestPool.Count == 0)
            ItemDatabase.BuildChestSlotPool(_chestPool);

        var result = new PirateChestRollResult();

        for (int slot = 0; slot < CollectibleSlotCount; slot++)
        {
            var rolled = RollWeightedSlot(
                $"槽位{slot + 1}·藏品类",
                _chestPool);
            TryAddItem(result, rolled);
        }

        LogRollResult(result);
        return result;
    }

    PirateLootItemData RollWeightedSlot(string slotLabel, List<(int itemId, int weight)> pool)
    {
        if (pool == null || pool.Count == 0)
        {
            Debug.LogWarning($"[PirateLoot] {slotLabel} 池为空");
            return GetCatalogCopy(EmptyItemId);
        }

        int totalWeight = 0;
        for (int i = 0; i < pool.Count; i++)
            totalWeight += Mathf.Max(0, pool[i].weight);

        if (totalWeight <= 0)
        {
            Debug.LogWarning($"[PirateLoot] {slotLabel} 总权重为 0");
            return GetCatalogCopy(EmptyItemId);
        }

        int roll = UnityEngine.Random.Range(0, totalWeight);
        int cumulative = 0;

        for (int i = 0; i < pool.Count; i++)
        {
            cumulative += Mathf.Max(0, pool[i].weight);
            if (roll < cumulative)
            {
                int pickedId = pool[i].itemId;
                var item = GetCatalogCopy(pickedId);
                item.weight = pool[i].weight;
                return item;
            }
        }

        var last = pool[pool.Count - 1];
        var fallback = GetCatalogCopy(last.itemId);
        fallback.weight = last.weight;
        return fallback;
    }

    PirateLootItemData GetCatalogCopy(int itemId)
    {
        if (_catalog.TryGetValue(itemId, out var data))
            return data.Clone();

        Debug.LogWarning($"[PirateLoot] 未注册物品 ID={itemId}，视为空手");
        return GetCatalogCopy(EmptyItemId);
    }

    static void TryAddItem(PirateChestRollResult result, PirateLootItemData rolled)
    {
        if (rolled == null || rolled.IsEmpty)
            return;
        result.items.Add(rolled);
    }

    void LogRollResult(PirateChestRollResult result)
    {
        var sb = new StringBuilder();
        sb.AppendLine("========== [海盗宝箱] 本次开箱结果（仅藏品类）==========");

        if (result.items.Count == 0)
            sb.AppendLine("· 物品：无（三槽均为空手）");
        else
        {
            sb.AppendLine($"· 物品（共 {result.items.Count} 件）：");
            for (int i = 0; i < result.items.Count; i++)
            {
                var it = result.items[i];
                string idKey = it.itemID.ToString();
                string rarityTag = "";
                if (ItemDatabase.TryGetRecord(idKey, out var rec) && rec.Rarity != ItemDatabase.ItemRarity.None)
                    rarityTag = $" [{rec.Rarity}]";

                sb.AppendLine(
                    $"    [{i + 1}] {it.itemName} (ID:{it.itemID}){rarityTag} " +
                    $"市价:{it.marketPrice:N0} 回收:{it.recyclePrice:N0}");
            }
        }

        sb.Append("============================================");
        Debug.Log(sb.ToString());
    }

#if UNITY_EDITOR
    [ContextMenu("测试/模拟开箱一次")]
    void EditorTestRollOnce()
    {
        if (_catalog.Count == 0)
            BuildItemCatalog();
        RollPirateChest();
    }

    [ContextMenu("测试/模拟开箱100次统计")]
    void EditorTestRoll100()
    {
        if (_catalog.Count == 0)
            BuildItemCatalog();

        var counts = new Dictionary<int, int>();
        int emptySlots = 0;

        for (int n = 0; n < 100; n++)
        {
            var r = RollPirateChest();
            emptySlots += CollectibleSlotCount - r.items.Count;
            foreach (var it in r.items)
            {
                if (!counts.ContainsKey(it.itemID))
                    counts[it.itemID] = 0;
                counts[it.itemID]++;
            }
        }

        Debug.Log(
            $"[PirateLoot] 100次×3槽：空手槽次={emptySlots} 出物统计见 Console 字典 itemID→次数");
    }
#endif
}

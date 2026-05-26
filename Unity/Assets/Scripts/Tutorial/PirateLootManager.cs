using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

/// <summary>
/// 海盗宝箱 — 硬核低爆率、四槽位独立权重滚动（本地单机）。
/// QTE 开锁成功后由 WorldLootBox 调用 <see cref="RollPirateChest"/>。
/// </summary>
public class PirateLootManager : MonoBehaviour
{
    public static PirateLootManager Instance { get; private set; }

    const int EmptyItemId = 0;
    const string EmptyItemName = "空手而归";

    const float Slot4CashChance = 0.3f;
    const int Slot4CashMin = 2000;
    const int Slot4CashMax = 8000;

    /// <summary>开箱结果：有效物品列表 + 槽位4极危币（可能为 0）</summary>
    [Serializable]
    public class PirateChestRollResult
    {
        public List<PirateLootItemData> items = new List<PirateLootItemData>();
        public int cashCredits;
    }

    /// <summary>ID → 全量物价字典（Roll 时复制条目，避免污染表内权重）</summary>
    readonly Dictionary<int, PirateLootItemData> _catalog = new Dictionary<int, PirateLootItemData>();

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

    /// <summary>初始化 8 种物资 + 空手条目</summary>
    void BuildItemCatalog()
    {
        _catalog.Clear();

        Register(0, EmptyItemName, 0, 0);
        Register(1001, "废弃的军用电路板", 500, 300);
        Register(1002, "完整的无人机镜头", 45000, 28500);
        Register(1003, "绝密航线硬盘", 60000, 38000);
        Register(1004, "纯金战术指挥鹰雕像", 200000, 130000);
        Register(1005, "未知生物血清样本", 500000, 320000);
        Register(1006, "军用加密对讲机", 8500, 5200);
        Register(1007, "高清特工夜视仪(损坏)", 15000, 9000);
        Register(1008, "密封的特种机油", 1200, 700);
    }

    void Register(int id, string name, long market, long recycle)
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
    /// 核心：四槽位独立权重抽取。
    /// 槽位 1~3 必 roll；槽位 4 为 30% 概率极危币。
    /// </summary>
    public PirateChestRollResult RollPirateChest()
    {
        var result = new PirateChestRollResult();

        // —— 槽位 1：核心财富（100%）——
        var slot1 = RollWeightedSlot(
            "槽位1·核心财富",
            new (int id, int w)[]
            {
                (0, 40),
                (1001, 30),
                (1002, 18),
                (1003, 7),
                (1004, 3),
                (1005, 2),
            });
        TryAddItem(result, slot1);

        // —— 槽位 2：电子与情报（100%）——
        var slot2 = RollWeightedSlot(
            "槽位2·电子情报",
            new (int id, int w)[]
            {
                (1001, 50),
                (1006, 35),
                (1007, 12),
                (1003, 3),
            });
        TryAddItem(result, slot2);

        // —— 槽位 3：装备与工业（100%）——
        var slot3 = RollWeightedSlot(
            "槽位3·装备工业",
            new (int id, int w)[]
            {
                (0, 68),
                (1008, 32),
            });
        TryAddItem(result, slot3);

        // —— 槽位 4：无主极危币（30% 概率）——
        if (UnityEngine.Random.value < Slot4CashChance)
        {
            result.cashCredits = UnityEngine.Random.Range(Slot4CashMin, Slot4CashMax + 1);
        }

        LogRollResult(result);
        return result;
    }

    /// <summary>权重随机：在池子中按 weight 累加抽取一项</summary>
    PirateLootItemData RollWeightedSlot(string slotLabel, (int itemId, int weight)[] pool)
    {
        if (pool == null || pool.Length == 0)
        {
            Debug.LogWarning($"[PirateLoot] {slotLabel} 池为空");
            return GetCatalogCopy(EmptyItemId);
        }

        int totalWeight = 0;
        for (int i = 0; i < pool.Length; i++)
            totalWeight += Mathf.Max(0, pool[i].weight);

        if (totalWeight <= 0)
        {
            Debug.LogWarning($"[PirateLoot] {slotLabel} 总权重为 0");
            return GetCatalogCopy(EmptyItemId);
        }

        // [0, totalWeight) 半开区间，与常见 Weight Random 一致
        int roll = UnityEngine.Random.Range(0, totalWeight);
        int cumulative = 0;

        for (int i = 0; i < pool.Length; i++)
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

        // 浮点边界兜底：取最后一项
        var last = pool[pool.Length - 1];
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

    /// <summary>控制台爆率测试日志</summary>
    void LogRollResult(PirateChestRollResult result)
    {
        var sb = new StringBuilder();
        sb.AppendLine("========== [海盗宝箱] 本次开箱结果 ==========");

        if (result.items.Count == 0)
            sb.AppendLine("· 物品：无（全部槽位为空手或未命中有效物）");
        else
        {
            sb.AppendLine($"· 物品（共 {result.items.Count} 件）：");
            for (int i = 0; i < result.items.Count; i++)
            {
                var it = result.items[i];
                sb.AppendLine(
                    $"    [{i + 1}] {it.itemName} (ID:{it.itemID}) " +
                    $"市价:{it.marketPrice:N0} 回收:{it.recyclePrice:N0}");
            }
        }

        if (result.cashCredits > 0)
            sb.AppendLine($"· 无主极危币：+{result.cashCredits:N0}");
        else
            sb.AppendLine("· 无主极危币：未触发（槽位4 30% 未命中）");

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
        int cashHits = 0;
        long cashTotal = 0;

        for (int n = 0; n < 100; n++)
        {
            var r = RollPirateChest();
            foreach (var it in r.items)
            {
                if (!counts.ContainsKey(it.itemID))
                    counts[it.itemID] = 0;
                counts[it.itemID]++;
            }
            if (r.cashCredits > 0)
            {
                cashHits++;
                cashTotal += r.cashCredits;
            }
        }

        Debug.Log(
            $"[PirateLoot] 100次统计：出物次数合计={counts.Values} 出现现金次数={cashHits} 现金均值={(cashHits > 0 ? cashTotal / cashHits : 0)}");
    }
#endif
}

using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 玩家格子背包管理器（塔科夫 / 三角洲式 Grid Inventory）。
/// - 根据 BagData 初始化 bool[,] 占用矩阵
/// - 放置前检测连续空位，支持不规则尺寸物品
/// - 撤离时一键变卖并清空
/// </summary>
public class PlayerGridInventory : MonoBehaviour
{
    [Header("当前装备背包")]
    [Tooltip("轻型 4×4、重型 6×8 等，可在 Inspector 或运行时更换")]
    [SerializeField] BagData equippedBag;

    [Header("调试")]
    [SerializeField] bool logPlacement = true;

    /// <summary>列数（X）</summary>
    int _gridWidth;

    /// <summary>行数（Y）</summary>
    int _gridHeight;

    /// <summary>true = 已被占用，false = 空格</summary>
    bool[,] _inventoryGrid;

    readonly List<PlacedItem> _placedItems = new List<PlacedItem>();

    public BagData EquippedBag => equippedBag;
    public int GridWidth => _gridWidth;
    public int GridHeight => _gridHeight;
    public IReadOnlyList<PlacedItem> PlacedItems => _placedItems;

    void Start()
    {
        InitializeGridFromBag(equippedBag);
    }

    /// <summary>根据背包数据重建空网格（换装或关卡重置时调用）</summary>
    public void InitializeGridFromBag(BagData bag)
    {
        equippedBag = bag;

        if (bag == null)
        {
            Debug.LogError("[PlayerGridInventory] BagData 为空，无法初始化背包。");
            _gridWidth = _gridHeight = 0;
            _inventoryGrid = null;
            _placedItems.Clear();
            return;
        }

        _gridWidth = bag.BagDimensions.x;
        _gridHeight = bag.BagDimensions.y;
        _inventoryGrid = new bool[_gridWidth, _gridHeight];
        ClearGridOccupancy();
        _placedItems.Clear();

        if (logPlacement)
            Debug.Log($"[PlayerGridInventory] 初始化背包「{bag.BagName}」{_gridWidth}×{_gridHeight} = {bag.TotalCells} 格");
    }

    void ClearGridOccupancy()
    {
        if (_inventoryGrid == null)
            return;

        for (int x = 0; x < _gridWidth; x++)
        {
            for (int y = 0; y < _gridHeight; y++)
                _inventoryGrid[x, y] = false;
        }
    }

    /// <summary>
    /// 检测是否能在背包中放入物品（不修改网格）。
    /// 从左上到右下遍历每个候选左上角，检查 item.gridSize 矩形是否全为空。
    /// </summary>
    public bool CanAddItem(LootItemData item, out Vector2Int foundPosition)
    {
        foundPosition = Vector2Int.zero;

        if (item == null)
        {
            Debug.LogWarning("[PlayerGridInventory] CanAddItem：物品为空。");
            return false;
        }

        if (_inventoryGrid == null || equippedBag == null)
        {
            Debug.LogWarning("[PlayerGridInventory] 背包未初始化。");
            return false;
        }

        Vector2Int size = item.GridSize;

        // 物品比背包还大，直接失败
        if (size.x > _gridWidth || size.y > _gridHeight)
            return false;

        // 候选左上角 (col, row) = (x, y)
        for (int row = 0; row <= _gridHeight - size.y; row++)
        {
            for (int col = 0; col <= _gridWidth - size.x; col++)
            {
                if (IsRectFree(col, row, size.x, size.y))
                {
                    foundPosition = new Vector2Int(col, row);
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>矩形区域 [col, col+width) × [row, row+height) 是否全部为空</summary>
    bool IsRectFree(int col, int row, int width, int height)
    {
        for (int y = row; y < row + height; y++)
        {
            for (int x = col; x < col + width; x++)
            {
                if (_inventoryGrid[x, y])
                    return false;
            }
        }

        return true;
    }

    /// <summary>背包中是否含有该物品（至少一件）</summary>
    public bool ContainsItem(LootItemData item)
    {
        if (item == null) return false;
        foreach (PlacedItem placed in _placedItems)
        {
            if (placed?.data == item)
                return true;
        }
        return false;
    }

    /// <summary>移除背包中第一件匹配的物品（挂牌上架用）</summary>
    public bool TryRemoveItem(LootItemData item)
    {
        if (item == null || _inventoryGrid == null)
            return false;

        for (int i = 0; i < _placedItems.Count; i++)
        {
            PlacedItem placed = _placedItems[i];
            if (placed?.data != item)
                continue;

            Vector2Int size = item.GridSize;
            OccupyRect(placed.position.x, placed.position.y, size.x, size.y, false);
            _placedItems.RemoveAt(i);

            if (logPlacement)
                Debug.Log($"[PlayerGridInventory] 已移除 {item.ItemName} @ ({placed.position.x},{placed.position.y})");

            return true;
        }

        return false;
    }

    /// <summary>尝试放入物品；成功则占用格子并加入列表</summary>
    public bool TryAddItem(LootItemData item)
    {
        if (!CanAddItem(item, out Vector2Int pos))
        {
            if (logPlacement && item != null)
                Debug.Log($"[PlayerGridInventory] 放不下：{item.ItemName} ({item.GridSize.x}×{item.GridSize.y})");
            return false;
        }

        OccupyRect(pos.x, pos.y, item.GridSize.x, item.GridSize.y, true);
        _placedItems.Add(new PlacedItem(item, pos));

        if (logPlacement)
            Debug.Log($"[PlayerGridInventory] 已放入 {item.ItemName} @ ({pos.x},{pos.y})");

        return true;
    }

    /// <summary>标记或清除矩形占用</summary>
    void OccupyRect(int col, int row, int width, int height, bool occupied)
    {
        for (int y = row; y < row + height; y++)
        {
            for (int x = col; x < col + width; x++)
                _inventoryGrid[x, y] = occupied;
        }
    }

    /// <summary>
    /// 撤离结算：变卖背包内全部物品，极危币入账，清空网格与列表。
    /// </summary>
    /// <returns>本次卖出获得的总极危币</returns>
    public long SellAllItemsAndClear()
    {
        long total = 0;

        foreach (PlacedItem placed in _placedItems)
        {
            if (placed?.data != null)
                total += placed.data.BaseSellPrice;
        }

        if (PlayerWallet.Instance != null)
            PlayerWallet.Instance.AddPerilCredits(total);
        else
            Debug.LogWarning("[PlayerGridInventory] 场景中没有 PlayerWallet，极危币未入账（仅本地统计）。");

        ClearGridOccupancy();
        _placedItems.Clear();

        if (logPlacement)
            Debug.Log($"[PlayerGridInventory] 撤离变卖完成，共 {total} 极危币");

        return total;
    }

    /// <summary>查询某格是否被占用（UI 高亮用）</summary>
    public bool IsCellOccupied(int col, int row)
    {
        if (_inventoryGrid == null)
            return false;

        if (col < 0 || row < 0 || col >= _gridWidth || row >= _gridHeight)
            return true;

        return _inventoryGrid[col, row];
    }

#if UNITY_EDITOR
    [ContextMenu("调试：打印背包占用")]
    void DebugPrintGrid()
    {
        if (_inventoryGrid == null)
        {
            Debug.Log("网格未初始化");
            return;
        }

        var sb = new System.Text.StringBuilder();
        for (int row = _gridHeight - 1; row >= 0; row--)
        {
            for (int col = 0; col < _gridWidth; col++)
                sb.Append(_inventoryGrid[col, row] ? '#' : '.');
            sb.AppendLine();
        }

        Debug.Log(sb.ToString());
    }
#endif
}

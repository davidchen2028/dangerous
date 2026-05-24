using System;
using UnityEngine;

/// <summary>
/// 已放入背包网格中的一件物品实例（左上角锚点 + 数据引用）。
/// </summary>
[Serializable]
public class PlacedItem
{
    [Tooltip("物品 ScriptableObject 数据")]
    public LootItemData data;

    [Tooltip("物品左上角在背包网格中的坐标（列 x，行 y）")]
    public Vector2Int position;

    public PlacedItem(LootItemData data, Vector2Int position)
    {
        this.data = data;
        this.position = position;
    }

    /// <summary>该物品占用的所有格子坐标（只读遍历用）</summary>
    public void ForEachCell(Action<int, int> visitCell)
    {
        if (data == null || visitCell == null)
            return;

        var size = data.GridSize;
        for (int row = 0; row < size.y; row++)
        {
            for (int col = 0; col < size.x; col++)
            {
                visitCell(position.x + col, position.y + row);
            }
        }
    }
}

using UnityEngine;

/// <summary>
/// 背包配置数据（ScriptableObject 资产）。
/// 定义不同级别背包的格子长宽，与《塔科夫》式格子背包容量对应。
/// </summary>
[CreateAssetMenu(
    fileName = "NewBag",
    menuName = "极危行动/背包配置 (Bag Data)",
    order = 1)]
public class BagData : ScriptableObject
{
    [Header("背包信息")]
    [Tooltip("显示名称，如：轻型战术包、重型扩容包")]
    [SerializeField] string bagName = "轻型战术包";

    [Header("格子尺寸（列 × 行）")]
    [Tooltip("背包网格列数（X）与行数（Y）。例：4×4=16 格，6×8=48 格")]
    [SerializeField] Vector2Int bagDimensions = new Vector2Int(4, 4);

    public string BagName => bagName;
    public Vector2Int BagDimensions => bagDimensions;

    /// <summary>背包总格子数</summary>
    public int TotalCells => bagDimensions.x * bagDimensions.y;

#if UNITY_EDITOR
    void OnValidate()
    {
        bagDimensions.x = Mathf.Max(1, bagDimensions.x);
        bagDimensions.y = Mathf.Max(1, bagDimensions.y);
    }
#endif
}

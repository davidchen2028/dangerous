using UnityEngine;

/// <summary>
/// 【新手教程】— 0 号模拟围区 (Simulation Sector Zero)
/// 全息舱虚拟战术走廊：运行时 / 编辑器一键用 Cube 拼出标准测试地图。
/// 官方关卡名：新手教程
/// </summary>
[DisallowMultipleComponent]
public class SimulationSectorZeroGenerator : MonoBehaviour
{
    const string RootName = "SectorZero_新手教程";
    const string SpawnPointAlphaName = "SpawnPoint_Alpha";

    [Header("生成选项")]
    [Tooltip("进入 Play 或场景加载时自动生成")]
    [SerializeField] bool generateOnAwake = true;

    [Tooltip("重新生成前删除旧地图根节点")]
    [SerializeField] bool clearBeforeGenerate = true;

    [Header("材质（可留空，将使用默认颜色）")]
    [SerializeField] Material roadMaterial;
    [SerializeField] Material wallMaterial;
    [SerializeField] Material truckMaterial;
    [SerializeField] Material lowCoverMaterial;
    [SerializeField] Material highCoverMaterial;

    [Header("调试")]
    [SerializeField] bool drawGizmos = true;

    Transform _root;
    Transform _spawnPointAlpha;

    /// <summary>Alpha 队伍出生点（供 NetworkSpawnManager 读取）</summary>
    public Transform SpawnPointAlpha => _spawnPointAlpha;

    void Awake()
    {
        if (generateOnAwake)
            Generate();
    }

    [ContextMenu("生成 0 号模拟围区")]
    public void Generate()
    {
        if (clearBeforeGenerate)
            ClearExisting();

        _root = new GameObject(RootName).transform;
        _root.SetParent(transform, false);
        _root.localPosition = Vector3.zero;
        _root.localRotation = Quaternion.identity;

        BuildRoad();
        BuildWalls();
        BuildCenterTruck();
        BuildLeftLowCovers();
        BuildRightHighCoversZigzag();
        BuildSpawnPointAlpha();

        Debug.Log("[SimulationSectorZero] 【新手教程】0 号模拟围区生成完成。");
    }

    [ContextMenu("清除 0 号模拟围区")]
    public void ClearExisting()
    {
        var existing = GameObject.Find(RootName);
        if (existing != null)
        {
            if (Application.isPlaying)
                Destroy(existing);
            else
                DestroyImmediate(existing);
        }

        _root = null;
        _spawnPointAlpha = null;
    }

    // ─── 1. 虚拟马路：长 60 (Z) × 宽 12 (X) × 厚 0.1 (Y)，中心 (0,0,30) ───
    void BuildRoad()
    {
        // Unity Cube 默认 1×1×1，用 localScale 表示实际尺寸
        var road = CreateCube(
            "Road_虚拟马路",
            new Vector3(12f, 0.1f, 60f),
            new Vector3(0f, 0.05f, 30f), // 中心 Y = 厚度一半，贴地
            roadMaterial,
            new Color(0.35f, 0.38f, 0.42f)
        );
        road.transform.SetParent(_root, true);
    }

    // ─── 2. 左右高墙：长 60 (Z) × 厚 0.5 (X) × 高 3.5 (Y) ───
    void BuildWalls()
    {
        const float roadHalfWidth = 6f;   // 马路宽 12 → 半宽 6
        const float wallThickness = 0.5f;
        const float wallHeight = 3.5f;
        float wallCenterX = roadHalfWidth + wallThickness * 0.5f; // 紧贴马路外缘
        float wallCenterY = wallHeight * 0.5f;

        var left = CreateCube(
            "Wall_Left_左墙",
            new Vector3(wallThickness, wallHeight, 60f),
            new Vector3(-wallCenterX, wallCenterY, 30f),
            wallMaterial,
            new Color(0.22f, 0.25f, 0.3f)
        );
        left.transform.SetParent(_root, true);

        var right = CreateCube(
            "Wall_Right_右墙",
            new Vector3(wallThickness, wallHeight, 60f),
            new Vector3(wallCenterX, wallCenterY, 30f),
            wallMaterial,
            new Color(0.22f, 0.25f, 0.3f)
        );
        right.transform.SetParent(_root, true);
    }

    // ─── 3. 中路重型掩体（全息卡车）：6 × 2.5 × 2.5，Z=30 正中 ───
    void BuildCenterTruck()
    {
        // 长 6 沿 Z（马路方向），宽 2.5 沿 X，高 2.5 沿 Y
        var truck = CreateCube(
            "Cover_Truck_全息卡车",
            new Vector3(2.5f, 2.5f, 6f),
            new Vector3(0f, 1.25f, 30f),
            truckMaterial,
            new Color(0.2f, 0.55f, 0.85f, 0.85f) // 全息感偏蓝
        );
        truck.transform.SetParent(_root, true);
    }

    // ─── 4. 左路矮掩体：Z=10,20,30,40；高 1.3 / 宽 1.5 / 厚 0.8（蹲伏高度）───
    void BuildLeftLowCovers()
    {
        const float height = 1.3f;
        const float widthX = 1.5f;
        const float depthZ = 0.8f;
        // 靠近左墙内侧（马路左缘 X=-6，掩体中心略向内）
        const float centerX = -5.25f;
        float centerY = height * 0.5f;

        float[] zPositions = { 10f, 20f, 30f, 40f };
        for (int i = 0; i < zPositions.Length; i++)
        {
            var cover = CreateCube(
                $"Cover_Left_Barrier_{i + 1:D2}",
                new Vector3(widthX, height, depthZ),
                new Vector3(centerX, centerY, zPositions[i]),
                lowCoverMaterial,
                new Color(0.55f, 0.56f, 0.58f)
            );
            cover.transform.SetParent(_root, true);
        }
    }

    // ─── 5. 右路高掩体：Z=20~40 之字形 4 个 2×2×2 木箱 ───
    void BuildRightHighCoversZigzag()
    {
        const float size = 2f;
        float centerY = size * 0.5f;

        // 靠近右墙，X 交替内收形成“之”字摸排走廊
        float[] zPositions = { 22f, 28f, 34f, 38f };
        float[] xPositions = { 4.2f, 5.0f, 4.2f, 5.0f };

        for (int i = 0; i < zPositions.Length; i++)
        {
            var box = CreateCube(
                $"Cover_Right_Crate_{i + 1:D2}",
                new Vector3(size, size, size),
                new Vector3(xPositions[i], centerY, zPositions[i]),
                highCoverMaterial,
                new Color(0.45f, 0.32f, 0.18f)
            );
            box.transform.SetParent(_root, true);
        }
    }

    // ─── 6. 出生点：马路 A 端 Z=2 ───
    void BuildSpawnPointAlpha()
    {
        var spawnGo = new GameObject(SpawnPointAlphaName);
        spawnGo.transform.SetParent(_root, true);
        spawnGo.transform.position = new Vector3(0f, 0f, 2f);
        spawnGo.transform.rotation = Quaternion.identity; // 默认朝向 +Z（沿走廊前进）

        _spawnPointAlpha = spawnGo.transform;

        // 可视化小 Gizmo 球体（仅编辑器场景视图）
        var helper = spawnGo.AddComponent<SpawnPointGizmoHelper>();
        helper.label = "Alpha 出生点";
        helper.gizmoColor = new Color(0.2f, 0.9f, 0.4f);
    }

    GameObject CreateCube(string objectName, Vector3 size, Vector3 worldCenter, Material mat, Color fallbackColor)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = objectName;
        go.transform.position = worldCenter;
        go.transform.localScale = size;

        var renderer = go.GetComponent<MeshRenderer>();
        if (mat != null)
            renderer.sharedMaterial = mat;
        else
            renderer.sharedMaterial = CreateFallbackMaterial(fallbackColor);

        // 静态走廊，不参与刚体物理
        var col = go.GetComponent<Collider>();
        if (col != null)
            col.isTrigger = false;

        return go;
    }

    static Material CreateFallbackMaterial(Color color)
    {
        var shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null)
            shader = Shader.Find("Standard");
        var m = new Material(shader);
        if (m.HasProperty("_BaseColor"))
            m.SetColor("_BaseColor", color);
        else
            m.color = color;
        return m;
    }

    void OnDrawGizmosSelected()
    {
        if (!drawGizmos) return;

        Gizmos.color = new Color(0.2f, 1f, 0.4f, 0.35f);
        Gizmos.DrawCube(new Vector3(0f, 0.05f, 30f), new Vector3(12f, 0.1f, 60f));

        Gizmos.color = new Color(1f, 0.85f, 0.2f, 0.25f);
        Gizmos.DrawSphere(new Vector3(0f, 0f, 2f), 0.6f);
    }
}

/// <summary>出生点场景视图标记（不影响联机逻辑）</summary>
public class SpawnPointGizmoHelper : MonoBehaviour
{
    public string label = "Spawn";
    public Color gizmoColor = Color.green;

    void OnDrawGizmos()
    {
        Gizmos.color = gizmoColor;
        Gizmos.DrawWireSphere(transform.position, 0.5f);
        Gizmos.DrawLine(transform.position, transform.position + transform.forward * 1.5f);
    }
}

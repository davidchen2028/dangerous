using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// 世界尺度平铺校正器：根据物体在世界空间中的实际物理尺寸动态修正材质 Tiling，
/// 避免拉伸墙体时大理石砖块被压扁成「春联 / 油条」。
/// 挂载到墙体、门柱或立方体建筑上即可；编辑器内缩放也会实时更新。
/// </summary>
[ExecuteAlways]
[DisallowMultipleComponent]
public class WorldScaleTilingEnforcer : MonoBehaviour
{
    /// <summary>纹理 U 轴（水平）取自哪条世界缩放轴。</summary>
    public enum TilingAxis
    {
        [Tooltip("世界缩放 X → U")]
        LossyX = 0,
        [Tooltip("世界缩放 Y → U")]
        LossyY = 1,
        [Tooltip("世界缩放 Z → U")]
        LossyZ = 2,
    }

    [Header("渲染目标")]
    [Tooltip("留空则使用本物体上的 Renderer；也可指定子级 Renderer。")]
    [SerializeField] Renderer targetRenderer;

    [Tooltip("同时校正所有子级 Renderer（适用于墙体父节点统一挂载）。")]
    [SerializeField] bool includeChildRenderers;

    [Header("平铺计算")]
    [Tooltip("全局纹理缩放因子：数值越大，单块砖在墙上显得越小（砖块更密）。")]
    [SerializeField] float textureScaleFactor = 1f;

    [Tooltip("水平方向（U）对应的世界缩放轴。")]
    [SerializeField] TilingAxis tilingUAxis = TilingAxis.LossyX;

    [Tooltip("垂直方向（V）对应的世界缩放轴。")]
    [SerializeField] TilingAxis tilingVAxis = TilingAxis.LossyY;

    [Tooltip("使用绝对值计算，避免负缩放导致贴图翻转异常。")]
    [SerializeField] bool useAbsoluteScale = true;

    [Header("材质写入")]
    [Tooltip("true：写入 material 实例，不污染工程共享材质；false：直接改 sharedMaterial。")]
    [SerializeField] bool useMaterialInstances = true;

    Vector3 _lastLossyScale;
    bool _initialized;

    /// <summary>
    /// 需要同步 Tiling 的常见 PBR 贴图属性名（URP Lit + Built-in Standard）。
    /// 仅对材质中「已赋值贴图」的槽位写入，避免无意义脏数据。
    /// </summary>
    static readonly string[] SyncTilingPropertyNames =
    {
        "_BaseMap",           // URP Albedo
        "_MainTex",           // Standard Albedo
        "_BumpMap",           // 法线
        "_DetailAlbedoMap",
        "_DetailNormalMap",
        "_MetallicGlossMap",  // 金属度 / 平滑度（粗糙度常在此图 Alpha）
        "_SpecGlossMap",
        "_OcclusionMap",      // AO
        "_ParallaxMap",
        "_EmissionMap",
    };

    void OnEnable()
    {
        CacheLossyScale();
        ApplyWorldScaleTiling();
    }

    void OnValidate()
    {
        ApplyWorldScaleTiling();
    }

    void LateUpdate()
    {
        if (!NeedsRetiling())
            return;

        ApplyWorldScaleTiling();
        transform.hasChanged = false;
        CacheLossyScale();
    }

    /// <summary>手动强制刷新（可供外部工具或 MarbleWallPbrApplicator 调用）。</summary>
    [ContextMenu("立即刷新世界尺度平铺")]
    public void ApplyWorldScaleTiling()
    {
        var tiling = ComputeTilingVector();
        var renderers = CollectRenderers();
        if (renderers.Count == 0)
            return;

        foreach (var renderer in renderers)
        {
            if (renderer == null) continue;
            ApplyTilingToRenderer(renderer, tiling);
        }
    }

    bool NeedsRetiling()
    {
        // transform.hasChanged：本节点被移动 / 旋转 / 缩放
        // lossyScale 比较：父节点缩放变化时子节点 hasChanged 不一定为 true
        var current = transform.lossyScale;
        if (!_initialized)
            return true;

        if (transform.hasChanged)
            return true;

        return (current - _lastLossyScale).sqrMagnitude > 1e-8f;
    }

    void CacheLossyScale()
    {
        _lastLossyScale = transform.lossyScale;
        _initialized = true;
    }

    Vector2 ComputeTilingVector()
    {
        var lossy = transform.lossyScale;
        var u = GetAxisComponent(lossy, tilingUAxis);
        var v = GetAxisComponent(lossy, tilingVAxis);
        var factor = Mathf.Max(0.0001f, textureScaleFactor);
        return new Vector2(u * factor, v * factor);
    }

    float GetAxisComponent(Vector3 lossy, TilingAxis axis)
    {
        float value;
        switch (axis)
        {
            case TilingAxis.LossyY:
                value = lossy.y;
                break;
            case TilingAxis.LossyZ:
                value = lossy.z;
                break;
            default:
                value = lossy.x;
                break;
        }

        return useAbsoluteScale ? Mathf.Abs(value) : value;
    }

    System.Collections.Generic.List<Renderer> CollectRenderers()
    {
        var list = new System.Collections.Generic.List<Renderer>(8);

        if (includeChildRenderers)
        {
            GetComponentsInChildren(true, list);
            return list;
        }

        if (targetRenderer != null)
        {
            list.Add(targetRenderer);
            return list;
        }

        var self = GetComponent<Renderer>();
        if (self != null)
            list.Add(self);

        return list;
    }

    void ApplyTilingToRenderer(Renderer renderer, Vector2 tiling)
    {
        var count = renderer.sharedMaterials.Length;
        if (count == 0)
            return;

        // 访问 .materials 会为每个子材质创建实例，避免污染共享资源
        var materials = useMaterialInstances ? renderer.materials : renderer.sharedMaterials;

        for (var i = 0; i < count; i++)
        {
            var mat = materials[i];
            if (mat == null) continue;
            ApplyTilingToMaterial(mat, tiling);
        }
    }

    static void ApplyTilingToMaterial(Material mat, Vector2 tiling)
    {
        // 兼容旧接口：主贴图
        mat.mainTextureScale = tiling;

        for (var i = 0; i < SyncTilingPropertyNames.Length; i++)
        {
            var prop = SyncTilingPropertyNames[i];
            if (!mat.HasProperty(prop))
                continue;

            // 仅同步「已开启贴图槽位」，保持各通道绝对一致
            if (mat.GetTexture(prop) == null)
                continue;

            mat.SetTextureScale(prop, tiling);
            mat.SetTextureOffset(prop, Vector2.zero);
        }
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(WorldScaleTilingEnforcer))]
public class WorldScaleTilingEnforcerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        EditorGUILayout.Space(6f);

        var enforcer = (WorldScaleTilingEnforcer)target;
        if (GUILayout.Button("立即刷新世界尺度平铺", GUILayout.Height(26f)))
            enforcer.ApplyWorldScaleTiling();

        EditorGUILayout.HelpBox(
            "根据 transform.lossyScale 自动修正全部 PBR 贴图通道的 Tiling。\n" +
            "竖墙默认 U=LossyX、V=LossyY；侧墙可改为 U=LossyZ、V=LossyY。\n" +
            "仅在缩放 / 移动变化时重算，不会每帧无脑刷新。",
            MessageType.Info);
    }
}
#endif

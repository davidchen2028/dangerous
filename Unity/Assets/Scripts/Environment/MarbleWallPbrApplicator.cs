using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// 等候厅 / 房间外墙 PBR 大理石无缝贴图动态应用器。
/// 挂载到墙体父物体上，在 Inspector 中指定贴图与平铺参数后一键应用到所有子级 MeshRenderer。
/// 兼容 URP Lit（优先）与 Built-in Standard 着色器。
/// </summary>
[ExecuteAlways]
[DisallowMultipleComponent]
public class MarbleWallPbrApplicator : MonoBehaviour
{
    [Header("目标墙体")]
    [Tooltip("留空则使用当前挂载物体作为根节点，遍历其下所有 MeshRenderer。")]
    [SerializeField] Transform wallRoot;

    [Tooltip("是否包含未激活的子物体。")]
    [SerializeField] bool includeInactiveChildren = true;

    [Header("PBR 贴图通道")]
    [Tooltip("基础色 / Albedo（干净大理石砖块图）。")]
    [SerializeField] Texture2D albedoMap;

    [Tooltip("法线贴图，用于砖缝凹凸。")]
    [SerializeField] Texture2D normalMap;

    [Tooltip("粗糙度贴图。URP/Standard 会写入 Metallic Gloss Map 的 Alpha（平滑度通道）。")]
    [SerializeField] Texture2D roughnessMap;

    [Tooltip("环境光遮蔽 AO 贴图。")]
    [SerializeField] Texture2D aoMap;

    [Header("平铺与法线")]
    [SerializeField] float tilingX = 4f;
    [SerializeField] float tilingY = 1f;

    [Tooltip("法线强度（Bump Scale），越大砖缝阴影越深。")]
    [SerializeField] float bumpScale = 1f;

    [Header("PBR 标量")]
    [Range(0f, 1f)]
    [SerializeField] float metallic = 0f;

    [Range(0f, 1f)]
    [SerializeField] float smoothness = 0.35f;

    [Range(0f, 1f)]
    [SerializeField] float aoStrength = 1f;

    [Tooltip("粗糙度图是否为「平滑度」图。若为 false，脚本会在运行时反转 Alpha 生成临时平滑度图。")]
    [SerializeField] bool roughnessMapIsSmoothness = false;

    [Header("材质与运行时")]
    [SerializeField] string materialName = "Mat_MarbleWall_PBR_Runtime";

    [Tooltip("true：每个 Renderer 使用 material 实例；false：写入 sharedMaterial（便于编辑器保存）。")]
    [SerializeField] bool useRendererMaterialInstances = false;

    [Tooltip("进入 Play 模式时自动应用一次。")]
    [SerializeField] bool applyOnStart = true;

    Material _generatedMaterial;
    Texture2D _invertedSmoothnessCache;

    static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");
    static readonly int MainTexId = Shader.PropertyToID("_MainTex");
    static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
    static readonly int ColorId = Shader.PropertyToID("_Color");
    static readonly int BumpMapId = Shader.PropertyToID("_BumpMap");
    static readonly int BumpScaleId = Shader.PropertyToID("_BumpScale");
    static readonly int MetallicGlossMapId = Shader.PropertyToID("_MetallicGlossMap");
    static readonly int MetallicId = Shader.PropertyToID("_Metallic");
    static readonly int SmoothnessId = Shader.PropertyToID("_Smoothness");
    static readonly int GlossinessId = Shader.PropertyToID("_Glossiness");
    static readonly int GlossMapScaleId = Shader.PropertyToID("_GlossMapScale");
    static readonly int OcclusionMapId = Shader.PropertyToID("_OcclusionMap");
    static readonly int OcclusionStrengthId = Shader.PropertyToID("_OcclusionStrength");

    void Start()
    {
        if (applyOnStart && Application.isPlaying)
            ApplyToWalls();
    }

    void OnDestroy()
    {
        ReleaseGeneratedAssets();
    }

    /// <summary>一键应用：遍历墙体上所有 MeshRenderer 并替换为新生成的 PBR 材质。</summary>
    [ContextMenu("一键应用大理石 PBR 到墙体")]
    public void ApplyToWalls()
    {
        var root = wallRoot != null ? wallRoot : transform;
        var renderers = root.GetComponentsInChildren<MeshRenderer>(includeInactiveChildren);

        if (renderers == null || renderers.Length == 0)
        {
            Debug.LogWarning($"[MarbleWallPbrApplicator] 在「{root.name}」下未找到 MeshRenderer。", this);
            return;
        }

        if (albedoMap == null)
        {
            Debug.LogWarning("[MarbleWallPbrApplicator] 未指定基础色贴图（Albedo），已取消应用。", this);
            return;
        }

        ReleaseGeneratedMaterialOnly();
        _generatedMaterial = BuildMarbleMaterial();

        var applied = 0;
        foreach (var renderer in renderers)
        {
            if (renderer == null) continue;
            AssignMaterial(renderer, _generatedMaterial);
            applied++;
        }

        Debug.Log($"[MarbleWallPbrApplicator] 已将材质「{_generatedMaterial.name}」应用到 {applied} 个 MeshRenderer（根：{root.name}）。", this);
    }

    /// <summary>仅重建材质球，不写入 Renderer（可用于预览或外部手动赋值）。</summary>
    public Material BuildMarbleMaterial()
    {
        var shader = ResolvePbrShader();
        if (shader == null)
        {
            Debug.LogError("[MarbleWallPbrApplicator] 找不到 URP Lit 或 Standard 着色器。", this);
            return null;
        }

        var mat = new Material(shader) { name = materialName };
        var tiling = new Vector2(Mathf.Max(0.001f, tilingX), Mathf.Max(0.001f, tilingY));

        // —— 基础色 ——
        SetMainTexture(mat, albedoMap, tiling);
        SetColorWhite(mat);

        // —— 法线（必须开启 _NORMALMAP 关键字，否则凹凸不生效）——
        if (normalMap != null && mat.HasProperty(BumpMapId))
        {
            mat.SetTexture(BumpMapId, normalMap);
            mat.EnableKeyword("_NORMALMAP");
            if (mat.HasProperty(BumpScaleId))
                mat.SetFloat(BumpScaleId, bumpScale);
        }
        else
        {
            mat.DisableKeyword("_NORMALMAP");
        }

        // —— 粗糙度 / 平滑度 ——
        ApplyRoughnessOrSmoothness(mat);

        // —— AO ——
        if (aoMap != null && mat.HasProperty(OcclusionMapId))
        {
            mat.SetTexture(OcclusionMapId, aoMap);
            mat.EnableKeyword("_OCCLUSIONMAP");
            if (mat.HasProperty(OcclusionStrengthId))
                mat.SetFloat(OcclusionStrengthId, aoStrength);
        }
        else
        {
            mat.DisableKeyword("_OCCLUSIONMAP");
        }

        return mat;
    }

    void ApplyRoughnessOrSmoothness(Material mat)
    {
        if (roughnessMap == null)
        {
            SetMetallicSmoothnessScalars(mat, metallic, smoothness);
            return;
        }

        var glossMap = ResolveSmoothnessTexture(roughnessMap);
        if (mat.HasProperty(MetallicGlossMapId))
        {
            mat.SetTexture(MetallicGlossMapId, glossMap);
            mat.EnableKeyword("_METALLICGLOSSMAP");
        }

        SetMetallicSmoothnessScalars(mat, metallic, smoothness);
    }

    Texture2D ResolveSmoothnessTexture(Texture2D source)
    {
        if (roughnessMapIsSmoothness || source == null)
            return source;

        // 粗糙度 → 平滑度：Smoothness = 1 - Roughness（取源图灰度）
        if (_invertedSmoothnessCache != null)
            DestroyImmediateSafe(_invertedSmoothnessCache);

        var w = source.width;
        var h = source.height;
        _invertedSmoothnessCache = new Texture2D(w, h, TextureFormat.RGBA32, false, true)
        {
            name = source.name + "_SmoothnessInverted",
            wrapMode = source.wrapMode,
            filterMode = source.filterMode,
        };

        var srcPixels = source.GetPixels();
        var dstPixels = new Color[srcPixels.Length];
        for (var i = 0; i < srcPixels.Length; i++)
        {
            var r = srcPixels[i].r;
            var smooth = 1f - r;
            dstPixels[i] = new Color(smooth, smooth, smooth, smooth);
        }

        _invertedSmoothnessCache.SetPixels(dstPixels);
        _invertedSmoothnessCache.Apply(false, true);
        return _invertedSmoothnessCache;
    }

    static void SetMainTexture(Material mat, Texture2D tex, Vector2 tiling)
    {
        if (tex == null) return;

        if (mat.HasProperty(BaseMapId))
        {
            mat.SetTexture(BaseMapId, tex);
            mat.SetTextureScale(BaseMapId, tiling);
            mat.SetTextureOffset(BaseMapId, Vector2.zero);
        }

        if (mat.HasProperty(MainTexId))
        {
            mat.SetTexture(MainTexId, tex);
            mat.SetTextureScale(MainTexId, tiling);
            mat.SetTextureOffset(MainTexId, Vector2.zero);
        }

        mat.mainTexture = tex;
        mat.mainTextureScale = tiling;
    }

    static void SetColorWhite(Material mat)
    {
        if (mat.HasProperty(BaseColorId))
            mat.SetColor(BaseColorId, Color.white);
        if (mat.HasProperty(ColorId))
            mat.SetColor(ColorId, Color.white);
    }

    static void SetMetallicSmoothnessScalars(Material mat, float metallicValue, float smoothnessValue)
    {
        if (mat.HasProperty(MetallicId))
            mat.SetFloat(MetallicId, metallicValue);
        if (mat.HasProperty(SmoothnessId))
            mat.SetFloat(SmoothnessId, smoothnessValue);
        if (mat.HasProperty(GlossinessId))
            mat.SetFloat(GlossinessId, smoothnessValue);
        if (mat.HasProperty(GlossMapScaleId))
            mat.SetFloat(GlossMapScaleId, smoothnessValue);
    }

    static void AssignMaterial(MeshRenderer renderer, Material mat)
    {
        if (renderer == null || mat == null) return;

        if (useRendererMaterialInstances)
            renderer.material = mat;
        else
            renderer.sharedMaterial = mat;
    }

    static Shader ResolvePbrShader()
    {
        var urp = Shader.Find("Universal Render Pipeline/Lit");
        if (urp != null) return urp;
        return Shader.Find("Standard");
    }

    void ReleaseGeneratedMaterialOnly()
    {
        if (_generatedMaterial == null) return;
        DestroyImmediateSafe(_generatedMaterial);
        _generatedMaterial = null;
    }

    void ReleaseGeneratedAssets()
    {
        ReleaseGeneratedMaterialOnly();
        if (_invertedSmoothnessCache != null)
        {
            DestroyImmediateSafe(_invertedSmoothnessCache);
            _invertedSmoothnessCache = null;
        }
    }

    static void DestroyImmediateSafe(Object obj)
    {
        if (obj == null) return;
#if UNITY_EDITOR
        if (!Application.isPlaying)
            DestroyImmediate(obj);
        else
            Destroy(obj);
#else
        Destroy(obj);
#endif
    }

#if UNITY_EDITOR
    [ContextMenu("收集子级 MeshRenderer 数量（调试）")]
    void DebugCountRenderers()
    {
        var root = wallRoot != null ? wallRoot : transform;
        var renderers = root.GetComponentsInChildren<MeshRenderer>(includeInactiveChildren);
        Debug.Log($"[MarbleWallPbrApplicator] 「{root.name}」下共有 {renderers.Length} 个 MeshRenderer。", this);
    }
#endif
}

#if UNITY_EDITOR
/// <summary>Inspector 自定义面板：提供一键应用按钮。</summary>
[CustomEditor(typeof(MarbleWallPbrApplicator))]
public class MarbleWallPbrApplicatorEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        EditorGUILayout.Space(8f);

        var applicator = (MarbleWallPbrApplicator)target;
        using (new EditorGUILayout.HorizontalScope())
        {
            if (GUILayout.Button("一键应用大理石 PBR 到墙体", GUILayout.Height(28f)))
                applicator.ApplyToWalls();
        }

        EditorGUILayout.HelpBox(
            "将本脚本挂在等候厅外墙父物体上，拖入 Albedo / Normal / Roughness / AO 贴图，" +
            "调节 Tiling 与 Bump Scale 后点击上方按钮即可。法线贴图会自动启用 _NORMALMAP 关键字。",
            MessageType.Info);
    }
}
#endif

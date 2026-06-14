using System;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// 两面垂直墙体转角裁切器：消除「一面墙末端穿入另一面墙」形成的断头墙角。
/// 仅调整被裁切墙体的长度轴（Scale + Position），不改动高度与厚度。
/// </summary>
[ExecuteAlways]
[DisallowMultipleComponent]
public class WallCornerTrimmer : MonoBehaviour
{
    public enum AlignFace
    {
        [Tooltip("贴合参考墙朝向裁切墙一侧的外表面")]
        Outer = 0,
        [Tooltip("贴合参考墙朝向裁切墙一侧的内表面（陷进房间一侧）")]
        Inner = 1,
    }

    [Header("墙体引用")]
    [Tooltip("正面墙 A（与 B 垂直相交）")]
    public Transform wallA;

    [Tooltip("侧面墙 B（与 A 垂直相交）")]
    public Transform wallB;

    [Tooltip("留空则自动判断哪面墙穿模并裁切它")]
    public Transform referenceWall;

    [Tooltip("留空则自动判断穿模墙")]
    public Transform trimWall;

    [Header("裁切选项")]
    public AlignFace alignFace = AlignFace.Outer;

    [Tooltip("长度轴判定时忽略过小的尺度（米）")]
    public float axisEpsilon = 0.05f;

    [Tooltip("对齐容差（米），小于该值视为已对齐")]
    public float alignTolerance = 0.005f;

    struct WallAxes
    {
        public Transform transform;
        public Vector3 localLengthAxis;
        public Vector3 localHeightAxis;
        public Vector3 localThicknessAxis;
        public float meshLength;
        public float meshHeight;
        public float meshThickness;
        public Bounds localMeshBounds;
    }

    struct CutPlane
    {
        public Vector3 point;
        public Vector3 normal;
    }

    /// <summary>一键对齐转角：缩短/平移穿模墙，使其末端贴合参考墙裁切面。</summary>
    [ContextMenu("一键对齐转角")]
    public void TrimCorner()
    {
        if (wallA == null || wallB == null)
        {
            Debug.LogWarning("[WallCornerTrimmer] 请指定 wallA 与 wallB。", this);
            return;
        }

        if (!TryAnalyze(wallA, out var axesA) || !TryAnalyze(wallB, out var axesB))
        {
            Debug.LogWarning("[WallCornerTrimmer] 无法分析墙体网格，请确认物体含 MeshFilter。", this);
            return;
        }

        if (!TryResolveRoles(axesA, axesB, out var refAxes, out var cutAxes, out var protrudeSign))
        {
            Debug.LogWarning("[WallCornerTrimmer] 未检测到明显穿模，或两面墙不垂直。", this);
            return;
        }

        if (!TryBuildCutPlane(refAxes, cutAxes, protrudeSign, out var plane))
        {
            Debug.LogWarning("[WallCornerTrimmer] 无法构建裁切面。", this);
            return;
        }

        if (!TryComputeTrim(cutAxes, plane, out var newScale, out var newPosition))
        {
            Debug.LogWarning("[WallCornerTrimmer] 裁切计算失败。", this);
            return;
        }

#if UNITY_EDITOR
        Undo.RecordObject(cutAxes.transform, "Wall Corner Trim");
#endif
        cutAxes.transform.localScale = newScale;
        cutAxes.transform.position = newPosition;

#if UNITY_EDITOR
        EditorUtility.SetDirty(cutAxes.transform);
        if (!Application.isPlaying)
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(
                cutAxes.transform.gameObject.scene);
#endif

        Debug.Log(
            $"[WallCornerTrimmer] 已裁切「{cutAxes.transform.name}」贴合「{refAxes.transform.name}」的{(alignFace == AlignFace.Outer ? "外" : "内")}侧面。",
            this);
    }

    bool TryAnalyze(Transform wall, out WallAxes axes)
    {
        axes = default;
        if (wall == null) return false;

        var mf = wall.GetComponent<MeshFilter>();
        if (mf == null || mf.sharedMesh == null) return false;

        var bounds = mf.sharedMesh.bounds;
        var size = bounds.size;
        if (size.sqrMagnitude < 1e-8f) return false;

        // 在局部空间判定：最大轴 = 长度，次大且竖直倾向 = 高度，最小 = 厚度
        int lenIdx = 0, hIdx = 1, tIdx = 2;
        var dims = new[] { size.x, size.y, size.z };
        Array.Sort(dims, (a, b) => b.CompareTo(a));
        float len = dims[0], mid = dims[1], thick = dims[2];

        int maxI = size.x >= size.y && size.x >= size.z ? 0 : (size.y >= size.z ? 1 : 2);
        int minI = size.x <= size.y && size.x <= size.z ? 0 : (size.y <= size.z ? 1 : 2);
        int midI = 3 - maxI - minI;

        // 高度优先取世界竖直轴（局部 Y）若其不是最小轴
        if (minI != 1 && size.y > thick + axisEpsilon)
        {
            hIdx = 1;
            if (maxI == 1)
            {
                lenIdx = midI;
                tIdx = minI;
            }
            else
            {
                lenIdx = maxI;
                tIdx = minI == 1 ? midI : minI;
            }
        }
        else
        {
            lenIdx = maxI;
            hIdx = midI;
            tIdx = minI;
        }

        Vector3 Axis(int i) => i == 0 ? Vector3.right : (i == 1 ? Vector3.up : Vector3.forward);

        axes = new WallAxes
        {
            transform = wall,
            localLengthAxis = Axis(lenIdx),
            localHeightAxis = Axis(hIdx),
            localThicknessAxis = Axis(tIdx),
            meshLength = GetComponentSize(size, lenIdx),
            meshHeight = GetComponentSize(size, hIdx),
            meshThickness = GetComponentSize(size, tIdx),
            localMeshBounds = bounds,
        };
        return axes.meshLength > axisEpsilon && axes.meshHeight > axisEpsilon;
    }

    static float GetComponentSize(Vector3 size, int idx)
    {
        return idx == 0 ? size.x : (idx == 1 ? size.y : size.z);
    }

    /// <summary>
    /// 决定参考墙与裁切墙：穿模墙末端超出参考墙外表面的那一侧将被裁掉。
    /// </summary>
    bool TryResolveRoles(
        WallAxes a,
        WallAxes b,
        out WallAxes refAxes,
        out WallAxes cutAxes,
        out float protrudeSign)
    {
        refAxes = default;
        cutAxes = default;
        protrudeSign = 0f;

        if (referenceWall != null && trimWall != null)
        {
            refAxes = a.transform == referenceWall ? a : b;
            cutAxes = a.transform == trimWall ? a : b;
            if (refAxes.transform == cutAxes.transform)
            {
                Debug.LogWarning("[WallCornerTrimmer] referenceWall 与 trimWall 不能是同一物体。", this);
                return false;
            }
            TryMeasureProtrusion(refAxes, cutAxes, out protrudeSign);
            return true;
        }

        // 自动：两面互试，取穿模量更大的一组
        float penAasCut, penBasCut;
        var okA = TryMeasureProtrusion(b, a, out penAasCut);
        var okB = TryMeasureProtrusion(a, b, out penBasCut);
        if (!okA && !okB) return false;

        if (penAasCut >= penBasCut)
        {
            refAxes = b;
            cutAxes = a;
            protrudeSign = penAasCut;
        }
        else
        {
            refAxes = a;
            cutAxes = b;
            protrudeSign = penBasCut;
        }

        return protrudeSign > alignTolerance;
    }

    /// <summary>
    /// 计算裁切墙沿长度轴末端超出参考墙外表面的距离（米）。
    /// </summary>
    bool TryMeasureProtrusion(WallAxes reference, WallAxes cutter, out float protrusion)
    {
        protrusion = 0f;
        if (!TryBuildCutPlane(reference, cutter, 1f, out var outerPlane))
            return false;

        if (!GetLengthExtents(cutter, out var center, out var halfLen, out var lengthDir))
            return false;

        var endA = center + lengthDir * halfLen;
        var endB = center - lengthDir * halfLen;
        var distA = Vector3.Dot(endA - outerPlane.point, outerPlane.normal);
        var distB = Vector3.Dot(endB - outerPlane.point, outerPlane.normal);
        protrusion = Mathf.Max(distA, distB);
        return protrusion > alignTolerance;
    }

    /// <summary>
    /// 以参考墙为基准构建裁切面：法线指向裁切墙，位置在参考墙外/内表面。
    /// </summary>
    bool TryBuildCutPlane(WallAxes reference, WallAxes cutter, float signHint, out CutPlane plane)
    {
        plane = default;

        var refBounds = GetWorldBounds(reference);

        if (!GetLengthExtents(cutter, out var cutCenter, out _, out var cutLenDir))
            return false;

        // 参考墙厚度轴世界方向
        var thickDir = reference.transform.TransformDirection(reference.localThicknessAxis).normalized;
        if (thickDir.sqrMagnitude < 1e-6f) return false;

        // 裁切墙中心相对参考墙，判断应取哪一侧表面
        var toCutter = cutCenter - refBounds.center;
        var side = Mathf.Sign(Vector3.Dot(toCutter, thickDir));
        if (Mathf.Abs(side) < 0.1f)
            side = signHint >= 0f ? 1f : -1f;

        // 参考墙在厚度方向上的半宽
        // 外表面：参考墙包围盒在厚度方向上的外缘
        var refHalfThick = ProjectExtentsOnAxis(refBounds, thickDir) * 0.5f;
        var faceOffset = thickDir * side * refHalfThick;

        // 内表面：从外表面再向内缩一整面墙厚（局部厚度 × 缩放）
        if (alignFace == AlignFace.Inner)
        {
            var thickWorld = reference.transform
                .TransformVector(reference.localThicknessAxis * reference.meshThickness).magnitude;
            faceOffset -= thickDir * side * thickWorld;
        }

        plane.point = refBounds.center + faceOffset;
        plane.normal = thickDir * side;
        return true;
    }

    /// <summary>
    /// 根据裁切面计算裁切墙新的 localScale 与 world position（仅动长度轴）。
    /// </summary>
    bool TryComputeTrim(WallAxes cutter, CutPlane plane, out Vector3 newLocalScale, out Vector3 newWorldPos)
    {
        newLocalScale = cutter.transform.localScale;
        newWorldPos = cutter.transform.position;

        if (!GetLengthExtents(cutter, out var center, out var halfLen, out var lenDir))
            return false;

        var endA = center + lenDir * halfLen;
        var endB = center - lenDir * halfLen;
        var distA = Vector3.Dot(endA - plane.point, plane.normal);
        var distB = Vector3.Dot(endB - plane.point, plane.normal);

        // 穿出裁切面的端为待裁端，另一端保持不动
        var trimEnd = distA >= distB ? endA : endB;
        var fixedEnd = distA >= distB ? endB : endA;
        var trimDir = (trimEnd - fixedEnd).normalized;
        if (trimDir.sqrMagnitude < 1e-6f) trimDir = lenDir;

        // 新末端落在裁切面上
        var denom = Vector3.Dot(trimDir, plane.normal);
        if (Mathf.Abs(denom) < 1e-5f) return false;

        var tAlong = Vector3.Dot(plane.point - fixedEnd, trimDir);
        if (tAlong < alignTolerance) return false;

        if (Vector3.Distance(trimEnd, plane.point) <= alignTolerance)
            return true;

        // 仅缩放长度轴（世界长度 = 2 × 半长）
        var scale = cutter.transform.localScale;
        var parentScale = cutter.transform.parent != null ? cutter.transform.parent.lossyScale : Vector3.one;
        var lenLocal = cutter.localLengthAxis;
        var parentLen = Mathf.Abs(lenLocal.x > 0.5f ? parentScale.x : (lenLocal.y > 0.5f ? parentScale.y : parentScale.z));
        var newWorldLen = tAlong;
        if (newWorldLen < alignTolerance) return false;

        var newLenScale = newWorldLen / Mathf.Max(1e-5f, cutter.meshLength * parentLen);

        if (lenLocal.x > 0.5f) scale.x = Mathf.Sign(scale.x) * newLenScale;
        else if (lenLocal.y > 0.5f) scale.y = Mathf.Sign(scale.y) * newLenScale;
        else scale.z = Mathf.Sign(scale.z) * newLenScale;

        newLocalScale = scale;
        newWorldPos = fixedEnd + trimDir * (newWorldLen * 0.5f);
        return true;
    }

    static Bounds GetWorldBounds(WallAxes axes)
    {
        var renderers = axes.transform.GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0)
        {
            var mf = axes.transform.GetComponent<MeshFilter>();
            if (mf != null && mf.sharedMesh != null)
            {
                var b = mf.sharedMesh.bounds;
                return TransformBounds(axes.transform.localToWorldMatrix, b);
            }
            return new Bounds(axes.transform.position, Vector3.zero);
        }

        var bounds = renderers[0].bounds;
        for (var i = 1; i < renderers.Length; i++)
            bounds.Encapsulate(renderers[i].bounds);
        return bounds;
    }

    static Bounds TransformBounds(Matrix4x4 matrix, Bounds localBounds)
    {
        var center = matrix.MultiplyPoint3x4(localBounds.center);
        var ext = localBounds.extents;
        var axisX = matrix.MultiplyVector(new Vector3(ext.x, 0, 0));
        var axisY = matrix.MultiplyVector(new Vector3(0, ext.y, 0));
        var axisZ = matrix.MultiplyVector(new Vector3(0, 0, ext.z));
        var worldExt = new Vector3(
            Mathf.Abs(axisX.x) + Mathf.Abs(axisY.x) + Mathf.Abs(axisZ.x),
            Mathf.Abs(axisX.y) + Mathf.Abs(axisY.y) + Mathf.Abs(axisZ.y),
            Mathf.Abs(axisX.z) + Mathf.Abs(axisY.z) + Mathf.Abs(axisZ.z));
        return new Bounds(center, worldExt * 2f);
    }

    /// <summary>世界空间长度轴中心、半长、单位方向（指向「正端」）。</summary>
    static bool GetLengthExtents(WallAxes axes, out Vector3 center, out float halfLen, out Vector3 lengthDir)
    {
        center = axes.transform.position;
        lengthDir = axes.transform.TransformDirection(axes.localLengthAxis).normalized;
        if (lengthDir.sqrMagnitude < 1e-6f) return false;

        var bounds = GetWorldBounds(axes);
        halfLen = ProjectExtentsOnAxis(bounds, lengthDir);
        center = bounds.center;
        return halfLen > 0.01f;
    }

    static float ProjectExtentsOnAxis(Bounds bounds, Vector3 axis)
    {
        axis = axis.normalized;
        var ext = bounds.extents;
        return Mathf.Abs(axis.x) * ext.x + Mathf.Abs(axis.y) * ext.y + Mathf.Abs(axis.z) * ext.z;
    }
}

#if UNITY_EDITOR
[CustomEditor(typeof(WallCornerTrimmer))]
public class WallCornerTrimmerEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        EditorGUILayout.Space(6f);

        var trimmer = (WallCornerTrimmer)target;
        if (GUILayout.Button("一键对齐转角", GUILayout.Height(28f)))
            trimmer.TrimCorner();

        EditorGUILayout.HelpBox(
            "将两面相互垂直的墙体拖入 wallA / wallB，点击按钮后仅缩短穿模墙的长度轴，" +
            "使其末端贴合参考墙外（或内）表面，消除断头墙角。支持 Undo。",
            MessageType.Info);
    }
}
#endif

using System;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 战术射击 — QTE 开锁/校准小游戏（uGUI，本地单机）
/// 指针在滑动条内来回运动，玩家在绿区按空格累计 3 次成功。
/// </summary>
public class LockpickingQTEManager : MonoBehaviour
{
    [Header("UI 引用")]
    [Tooltip("整个 QTE 面板根节点，胜利/取消时 SetActive(false)")]
    public GameObject qtePanelRoot;

    [Tooltip("滑动条轨道 RectTransform（用于换算指针位置）")]
    public RectTransform trackRect;

    [Tooltip("竖条指针 RectTransform")]
    public RectTransform pointerRect;

    [Tooltip("绿色成功区 RectTransform（宽度由 greenMin/greenMax 驱动）")]
    public RectTransform greenZoneRect;

    [Tooltip("下方 3 个计数方格 Image，按顺序亮起")]
    public Image[] counterLights;

    [Header("区域判定（归一化 0~1，沿轨道横向）")]
    [Range(0f, 1f)] public float greenMin = 0.4f;
    [Range(0f, 1f)] public float greenMax = 0.7f;

    [Header("运动与难度")]
    [Tooltip("指针在轨道内折返的速度（归一化坐标/秒）")]
    public float speed = 0.75f;

    [Tooltip("失败时速度乘数上限")]
    public float maxSpeed = 1.8f;

    [Tooltip("需要连续成功次数")]
    public int requiredSuccesses = 3;

    [Header("音效（可选）")]
    public AudioSource audioSource;
    public AudioClip successClip;
    public AudioClip failClip;
    public AudioClip winClip;

    [Header("胜利回调")]
    [Tooltip("关联的海盗宝箱，成功后调用 OnQTESuccess")]
    public WorldLootBox linkedLootBox;

    /// <summary>指针当前归一化位置 [0,1]</summary>
    float _pointerT = 0.5f;
    int _direction = 1;
    int _successCount;
    float _currentSpeed;
    bool _active;
    float _trackWidth;

    public bool IsActive => _active;

    void Awake()
    {
        if (qtePanelRoot != null)
            qtePanelRoot.SetActive(false);
        ApplyGreenZoneVisual();
    }

    void Update()
    {
        if (!_active)
            return;

        // 1. 指针来回折返（用归一化 t，再映射到轨道像素）
        float dt = Time.deltaTime;
        _pointerT += _direction * _currentSpeed * dt;
        if (_pointerT >= 1f)
        {
            _pointerT = 1f;
            _direction = -1;
        }
        else if (_pointerT <= 0f)
        {
            _pointerT = 0f;
            _direction = 1;
        }

        UpdatePointerVisual();

        // 2. 空格判定
        if (Input.GetKeyDown(KeyCode.Space))
            TryRegisterHit();
    }

    /// <summary>打开 QTE（由 WorldLootBox 或交互脚本调用）</summary>
    public void OpenQTE(WorldLootBox lootBox = null)
    {
        if (lootBox != null)
            linkedLootBox = lootBox;

        _active = true;
        _successCount = 0;
        _currentSpeed = speed;
        _pointerT = 0.5f;
        _direction = 1;

        CacheTrackWidth();
        ApplyGreenZoneVisual();
        RefreshCounterUI();

        if (qtePanelRoot != null)
            qtePanelRoot.SetActive(true);

        UpdatePointerVisual();
    }

    /// <summary>关闭 QTE 界面</summary>
    public void CloseQTE()
    {
        _active = false;
        if (qtePanelRoot != null)
            qtePanelRoot.SetActive(false);
    }

    void CacheTrackWidth()
    {
        _trackWidth = trackRect != null ? trackRect.rect.width : 300f;
        if (_trackWidth < 1f)
            _trackWidth = 300f;
    }

    void ApplyGreenZoneVisual()
    {
        if (greenZoneRect == null || trackRect == null)
            return;

        float w = trackRect.rect.width;
        float zoneW = Mathf.Max(0f, greenMax - greenMin) * w;
        greenZoneRect.anchorMin = new Vector2(greenMin, 0f);
        greenZoneRect.anchorMax = new Vector2(greenMax, 1f);
        greenZoneRect.offsetMin = Vector2.zero;
        greenZoneRect.offsetMax = Vector2.zero;
        greenZoneRect.sizeDelta = new Vector2(zoneW, 0f);
    }

    void UpdatePointerVisual()
    {
        if (pointerRect == null || trackRect == null)
            return;

        // 指针 anchoredPosition.x：以轨道左缘为基准
        float halfTrack = trackRect.rect.width * 0.5f;
        float x = Mathf.Lerp(-halfTrack, halfTrack, _pointerT);
        pointerRect.anchoredPosition = new Vector2(x, pointerRect.anchoredPosition.y);
    }

    void TryRegisterHit()
    {
        if (!_active)
            return;

        if (_pointerT >= greenMin && _pointerT <= greenMax)
        {
            OnHitSuccess();
        }
        else
        {
            OnHitFail();
        }
    }

    void OnHitSuccess()
    {
        _successCount++;
        PlayClip(successClip);
        RefreshCounterUI();
        ResetPointer();

        if (_successCount >= requiredSuccesses)
        {
            PlayClip(winClip);
            CloseQTE();
            if (linkedLootBox != null)
                linkedLootBox.OnQTESuccess();
        }
    }

    void OnHitFail()
    {
        _successCount = 0;
        _currentSpeed = Mathf.Min(_currentSpeed * 1.12f, maxSpeed);
        PlayClip(failClip);
        RefreshCounterUI(flashFail: true);
        ResetPointer();
    }

    void ResetPointer()
    {
        _pointerT = 0.5f;
        _direction = 1;
        UpdatePointerVisual();
    }

    void RefreshCounterUI(bool flashFail = false)
    {
        if (counterLights == null)
            return;

        for (int i = 0; i < counterLights.Length; i++)
        {
            if (counterLights[i] == null)
                continue;

            bool on = i < _successCount;
            counterLights[i].color = flashFail
                ? new Color(0.85f, 0.25f, 0.25f, 1f)
                : on
                    ? new Color(0.35f, 0.9f, 0.45f, 1f)
                    : new Color(0.15f, 0.2f, 0.18f, 1f);
        }
    }

    void PlayClip(AudioClip clip)
    {
        if (audioSource == null || clip == null)
            return;
        audioSource.PlayOneShot(clip);
    }
}

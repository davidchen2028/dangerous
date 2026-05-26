using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 海盗宝箱 — QTE 成功后吐出奖励物资（本地单机）
/// 与 LockpickingQTEManager 配合使用。
/// </summary>
public class WorldLootBox : MonoBehaviour
{
    [Header("交互")]
    [Tooltip("玩家进入此距离可尝试开锁")]
    public float interactDistance = 4f;

    [Tooltip("是否已开启（可在 Inspector 勾选测试）")]
    public bool opened;

    [Header("QTE")]
    public LockpickingQTEManager qteManager;

    [Header("奖励物资 ID（对应 ItemCatalog / LootItemData）")]
    public string[] rewardItemIds = { "brass_bullet", "circuit", "sealed_motor_oil" };

    [Header("开箱反馈")]
    public Transform lidTransform;
    public float lidOpenAngle = -110f;
    public ParticleSystem openVfx;

    Transform _player;
    bool _playerInRange;

    void Start()
    {
        var player = GameObject.FindGameObjectWithTag("Player");
        if (player != null)
            _player = player.transform;

        if (opened)
            ApplyOpenedVisual();
    }

    void Update()
    {
        if (opened || _player == null)
            return;

        float dist = Vector3.Distance(_player.position, transform.position);
        _playerInRange = dist <= interactDistance;

        if (_playerInRange && Input.GetKeyDown(KeyCode.E))
            TryStartLockpick();
    }

    /// <summary>由交互系统或 UI 按钮调用：开始 QTE</summary>
    public void TryStartLockpick()
    {
        if (opened)
            return;

        if (qteManager == null)
        {
            Debug.LogWarning("[WorldLootBox] 未绑定 LockpickingQTEManager");
            return;
        }

        qteManager.linkedLootBox = this;
        qteManager.OpenQTE(this);
    }

    /// <summary>
    /// QTE 三连成功 — 关闭 UI、开箱、发放奖励
    /// （LockpickingQTEManager 在胜利时调用）
    /// </summary>
    public void OnQTESuccess()
    {
        if (opened)
            return;

        opened = true;
        ApplyOpenedVisual();
        SpawnRewards();
    }

    void ApplyOpenedVisual()
    {
        if (lidTransform != null)
            lidTransform.localRotation = Quaternion.Euler(lidOpenAngle, 0f, 0f);
        if (openVfx != null)
            openVfx.Play();
    }

    /// <summary>将奖励写入玩家背包（由 PirateLootManager 权重表产出）</summary>
    void SpawnRewards()
    {
        if (PirateLootManager.Instance == null)
        {
            Debug.LogWarning(
                "[WorldLootBox] 场景中缺少 PirateLootManager，无法 Roll 海盗宝箱掉落。");
            return;
        }

        PirateLootManager.PirateChestRollResult roll =
            PirateLootManager.Instance.RollPirateChest();

        // TODO: 对接 PlayerGridInventory / PlayerWallet
        // foreach (var item in roll.items)
        //     PlayerGridInventory.Instance.TryAddByItemId(item.itemID);
        // if (roll.cashCredits > 0)
        //     PlayerWallet.Instance.AddCredits(roll.cashCredits);
    }
}

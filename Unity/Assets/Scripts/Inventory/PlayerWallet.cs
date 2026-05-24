using UnityEngine;

/// <summary>
/// 玩家极危币钱包（单机教学关本地单例）。
/// 撤离时由 PlayerGridInventory.SellAllItemsAndClear 调用。
/// </summary>
public class PlayerWallet : MonoBehaviour
{
    public static PlayerWallet Instance { get; private set; }

    [SerializeField] long perilCredits;

    public long PerilCredits => perilCredits;

    /// <summary>余额变化时通知 UI（黑市、HUD）</summary>
    public event System.Action<long> OnCreditsChanged;

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
    }

    void OnDestroy()
    {
        if (Instance == this)
            Instance = null;
    }

    /// <summary>增加极危币（黑市收购、任务奖励等）</summary>
    public void AddPerilCredits(long amount)
    {
        if (amount <= 0)
            return;

        perilCredits += amount;
        Debug.Log($"[PlayerWallet] +{amount} 极危币，当前余额：{perilCredits}");
        OnCreditsChanged?.Invoke(perilCredits);
    }

    /// <summary>扣除极危币，余额不足返回 false</summary>
    public bool TrySpendPerilCredits(long amount)
    {
        if (amount <= 0)
            return true;

        if (perilCredits < amount)
            return false;

        perilCredits -= amount;
        OnCreditsChanged?.Invoke(perilCredits);
        return true;
    }
}

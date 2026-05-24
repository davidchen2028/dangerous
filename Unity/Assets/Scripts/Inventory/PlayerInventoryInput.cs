using UnityEngine;

#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// 打开 / 关闭背包 UI 的快捷键（默认 B，备用 Tab）。
/// 将 inventoryPanel 拖入 Inspector；留空则仅触发事件供 UI 订阅。
/// </summary>
public class PlayerInventoryInput : MonoBehaviour
{
    [Header("快捷键")]
    [SerializeField] KeyCode toggleKey = KeyCode.B;

    [SerializeField] KeyCode alternateKey = KeyCode.Tab;

    [Header("背包 UI（可选）")]
    [SerializeField] GameObject inventoryPanel;

    [SerializeField] PlayerGridInventory gridInventory;

    public bool IsInventoryOpen { get; private set; }

    void Awake()
    {
        if (gridInventory == null)
            gridInventory = FindObjectOfType<PlayerGridInventory>();
    }

    void Update()
    {
        if (!WasTogglePressed())
            return;

        SetInventoryOpen(!IsInventoryOpen);
    }

    bool WasTogglePressed()
    {
#if ENABLE_INPUT_SYSTEM
        var kb = Keyboard.current;
        if (kb == null)
            return false;

        return kb.bKey.wasPressedThisFrame || kb.tabKey.wasPressedThisFrame;
#else
        return Input.GetKeyDown(toggleKey) || Input.GetKeyDown(alternateKey);
#endif
    }

    public void SetInventoryOpen(bool open)
    {
        IsInventoryOpen = open;

        if (inventoryPanel != null)
            inventoryPanel.SetActive(open);

        Cursor.lockState = open ? CursorLockMode.None : CursorLockMode.Locked;
        Cursor.visible = open;

        if (open)
            Debug.Log("[PlayerInventoryInput] 背包已打开（B / Tab 关闭）");
    }
}

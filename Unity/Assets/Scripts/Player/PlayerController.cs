using UnityEngine;

// ─────────────────────────────────────────────────────────────────────────────
// 输入方式（二选一，在项目设置中启用对应后端）：
//
// 【新版 Input System】
//   Edit → Project Settings → Player → Active Input Handling
//   选 "Input System Package" 或 "Both"
//   并在 Package Manager 安装 Input System
//   本脚本顶部会自动定义 ENABLE_INPUT_SYSTEM
//
// 【旧版 Input Manager】
//   Active Input Handling 选 "Input Manager (Old)" 或 "Both"
//   使用 Input.GetAxisRaw / Input.GetKey
// ─────────────────────────────────────────────────────────────────────────────

#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// 战术射击 — 第一人称角色移动（CharacterController）
/// 制作人数据：站立高 1.8 / 半径 0.4，蹲 1.2，走路 2.5，跑 5.5，蹲走 1.2，跳 0.8
/// </summary>
[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour
{
    [Header("基础尺寸（CharacterController）")]
    [Tooltip("站立高度")]
    [SerializeField] float standHeight = 1.8f;

    [Tooltip("蹲下高度")]
    [SerializeField] float crouchHeight = 1.2f;

    [Tooltip("胶囊体半径")]
    [SerializeField] float controllerRadius = 0.4f;

    [Tooltip("蹲/站高度平滑速度")]
    [SerializeField] float heightLerpSpeed = 12f;

    [Header("第一人称视角")]
    [Tooltip("站立时眼睛高度（相对脚底），蹲下时按身高比例同步降低")]
    [SerializeField] float standEyeHeight = 1.65f;

    [Tooltip("留空则自动查找子物体上的 Camera")]
    [SerializeField] Transform cameraTransform;

    [Header("移动速度")]
    [SerializeField] float walkSpeed = 2.5f;
    [SerializeField] float sprintSpeed = 5.5f;
    [SerializeField] float crouchSpeed = 1.2f;

    [Header("跳跃与重力")]
    [SerializeField] float jumpHeight = 0.8f;

    [Tooltip("重力加速度，负值向下。绝对值越大下落越沉（建议 -18 ~ -25）")]
    [SerializeField] float gravity = -22f;

    [Header("地面检测")]
    [SerializeField] LayerMask groundMask = ~0;

    [Tooltip("贴地时向下保持的小速度，防止浮空")]
    [SerializeField] float groundedStickVelocity = -2f;

    CharacterController _controller;
    float _currentHeight;
    bool _wantsCrouch;
    bool _isCrouching;
    Vector3 _velocity;
    float _skinWidth;

    void Awake()
    {
        _controller = GetComponent<CharacterController>();
        _skinWidth = _controller.skinWidth;

        _controller.radius = controllerRadius;
        _currentHeight = standHeight;
        ApplyControllerDimensions(_currentHeight);

        if (cameraTransform == null)
        {
            var cam = GetComponentInChildren<Camera>();
            if (cam != null)
                cameraTransform = cam.transform;
        }

        ApplyEyeHeight(_currentHeight);
    }

    void Update()
    {
        ReadInput(out Vector2 moveInput, out bool sprintHeld, out bool jumpPressed);

        bool grounded = IsGrounded();
        UpdateCrouch(grounded);
        float moveSpeed = GetMoveSpeed(sprintHeld);

        // 水平移动（相对角色朝向，仅 XZ）
        Vector3 moveDir = transform.right * moveInput.x + transform.forward * moveInput.y;
        if (moveDir.sqrMagnitude > 1f)
            moveDir.Normalize();

        _controller.Move(moveDir * moveSpeed * Time.deltaTime);

        // 跳跃：v₀ = √(2 · |g| · h)
        if (jumpPressed && grounded && !_isCrouching)
            _velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);

        // 重力与垂直位移
        if (grounded && _velocity.y < 0f)
            _velocity.y = groundedStickVelocity;

        _velocity.y += gravity * Time.deltaTime;
        _controller.Move(_velocity * Time.deltaTime);
    }

    // ─── 输入 ───────────────────────────────────────────────────────────────

    void ReadInput(out Vector2 moveInput, out bool sprintHeld, out bool jumpPressed)
    {
        moveInput = Vector2.zero;
        sprintHeld = false;
        jumpPressed = false;
        _wantsCrouch = false;

#if ENABLE_INPUT_SYSTEM
        // 新版 Input System
        var keyboard = Keyboard.current;
        if (keyboard == null)
            return;

        if (keyboard.wKey.isPressed) moveInput.y += 1f;
        if (keyboard.sKey.isPressed) moveInput.y -= 1f;
        if (keyboard.aKey.isPressed) moveInput.x -= 1f;
        if (keyboard.dKey.isPressed) moveInput.x += 1f;

        sprintHeld = keyboard.leftShiftKey.isPressed;
        _wantsCrouch = keyboard.cKey.isPressed;
        jumpPressed = keyboard.spaceKey.wasPressedThisFrame;
#else
        // 旧版 Input Manager（需在 Input Manager 中配置 Horizontal / Vertical 轴）
        moveInput = new Vector2(
            Input.GetAxisRaw("Horizontal"),
            Input.GetAxisRaw("Vertical")
        );

        sprintHeld = Input.GetKey(KeyCode.LeftShift);
        _wantsCrouch = Input.GetKey(KeyCode.C);
        jumpPressed = Input.GetKeyDown(KeyCode.Space);
#endif
    }

    // ─── 蹲伏 ───────────────────────────────────────────────────────────────

    void UpdateCrouch(bool grounded)
    {
        if (_wantsCrouch)
            _isCrouching = true;
        else if (_isCrouching && CanStandUp())
            _isCrouching = false;

        float targetHeight = _isCrouching ? crouchHeight : standHeight;
        _currentHeight = Mathf.Lerp(
            _currentHeight,
            targetHeight,
            heightLerpSpeed * Time.deltaTime
        );

        // 高度接近目标时吸附，避免永远差一点点
        if (Mathf.Abs(_currentHeight - targetHeight) < 0.01f)
            _currentHeight = targetHeight;

        ApplyControllerDimensions(_currentHeight);
        ApplyEyeHeight(_currentHeight);
    }

    /// <summary>视角高度随胶囊身高等比变化（1.8→1.65，1.2→1.1）</summary>
    void ApplyEyeHeight(float bodyHeight)
    {
        if (cameraTransform == null)
            return;

        float ratio = standEyeHeight / standHeight;
        var local = cameraTransform.localPosition;
        cameraTransform.localPosition = new Vector3(local.x, bodyHeight * ratio, local.z);
    }

    /// <summary>头顶是否有足够空间恢复到站立高度</summary>
    bool CanStandUp()
    {
        float shrink = standHeight - _currentHeight;
        if (shrink <= 0.01f)
            return true;

        float r = controllerRadius - _skinWidth;
        Vector3 worldCenter = transform.position + _controller.center;

        Vector3 bottom = worldCenter - Vector3.up * (_currentHeight * 0.5f - r);
        Vector3 top = bottom + Vector3.up * (standHeight - r * 2f);

        return !Physics.CheckCapsule(
            bottom,
            top,
            r,
            groundMask,
            QueryTriggerInteraction.Ignore
        );
    }

    void ApplyControllerDimensions(float height)
    {
        _controller.height = height;
        _controller.center = new Vector3(0f, height * 0.5f, 0f);
        _controller.radius = controllerRadius;
    }

    // ─── 移动速度 ───────────────────────────────────────────────────────────

    float GetMoveSpeed(bool sprintHeld)
    {
        if (_isCrouching)
            return crouchSpeed;

        if (sprintHeld)
            return sprintSpeed;

        return walkSpeed;
    }

    bool IsGrounded()
    {
        if (_controller.isGrounded)
            return true;

        // CharacterController.isGrounded 在台阶/斜坡边缘偶尔不可靠，补一层射线
        float r = controllerRadius - _skinWidth;
        Vector3 origin = transform.position + Vector3.up * (r + 0.05f);
        return Physics.SphereCast(
            origin,
            r * 0.9f,
            Vector3.down,
            out _,
            0.15f + _skinWidth,
            groundMask,
            QueryTriggerInteraction.Ignore
        );
    }

#if UNITY_EDITOR
    void OnValidate()
    {
        standHeight = 1.8f;
        crouchHeight = 1.2f;
        controllerRadius = 0.4f;
        walkSpeed = 2.5f;
        sprintSpeed = 5.5f;
        crouchSpeed = 1.2f;
        jumpHeight = 0.8f;
    }
#endif
}

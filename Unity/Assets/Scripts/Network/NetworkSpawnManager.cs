using System.Collections.Generic;
using Unity.Netcode;
using UnityEngine;

/// <summary>
/// 【新手教程】联机出生管理（Netcode for GameObjects）
/// - 第 1 个连入的玩家 → SpawnPoint_Alpha
/// - 关闭 NetworkManager 的「自动创建玩家」，由本脚本 SpawnAsPlayerObject
/// </summary>
[DisallowMultipleComponent]
public class NetworkSpawnManager : MonoBehaviour
{
    [Header("玩家预制体")]
    [Tooltip("须含 NetworkObject，且已登记到 NetworkManager → Network Prefabs")]
    [SerializeField] GameObject playerPrefab;

    [Header("出生点")]
    [Tooltip("留空则自动查找 SpawnPoint_Alpha")]
    [SerializeField] Transform spawnPointAlpha;

    [Header("多名玩家时（联机测试）")]
    [Tooltip("第 2 名及以后沿出生点 forward 方向间隔（米）")]
    [SerializeField] float extraPlayerSpacingZ = 2f;

    readonly HashSet<ulong> _spawnedClients = new HashSet<ulong>();
    int _spawnOrder;

    void OnEnable()
    {
        if (NetworkManager.Singleton != null)
            RegisterCallbacks();
    }

    void Start()
    {
        // 晚于 NetworkManager 初始化时补注册
        RegisterCallbacks();

        if (NetworkManager.Singleton != null && NetworkManager.Singleton.IsServer)
            TrySpawnPlayerForClient(NetworkManager.ServerClientId);
    }

    void OnDisable()
    {
        UnregisterCallbacks();
    }

    void RegisterCallbacks()
    {
        var nm = NetworkManager.Singleton;
        if (nm == null) return;

        nm.OnClientConnectedCallback -= OnClientConnected;
        nm.OnClientConnectedCallback += OnClientConnected;
        nm.OnClientDisconnectCallback -= OnClientDisconnected;
        nm.OnClientDisconnectCallback += OnClientDisconnected;
    }

    void UnregisterCallbacks()
    {
        if (NetworkManager.Singleton == null) return;
        NetworkManager.Singleton.OnClientConnectedCallback -= OnClientConnected;
        NetworkManager.Singleton.OnClientDisconnectCallback -= OnClientDisconnected;
    }

    void OnClientConnected(ulong clientId)
    {
        if (NetworkManager.Singleton == null || !NetworkManager.Singleton.IsServer)
            return;

        TrySpawnPlayerForClient(clientId);
    }

    void OnClientDisconnected(ulong clientId)
    {
        _spawnedClients.Remove(clientId);
    }

    void TrySpawnPlayerForClient(ulong clientId)
    {
        if (playerPrefab == null)
        {
            Debug.LogError("[NetworkSpawnManager] 未指定 playerPrefab。");
            return;
        }

        var nm = NetworkManager.Singleton;
        if (nm == null || !nm.IsServer)
            return;

        if (_spawnedClients.Contains(clientId))
            return;

        if (nm.ConnectedClients.TryGetValue(clientId, out var client) && client.PlayerObject != null)
        {
            _spawnedClients.Add(clientId);
            return;
        }

        ResolveSpawnPoint();
        if (spawnPointAlpha == null)
        {
            Debug.LogError("[NetworkSpawnManager] 找不到 SpawnPoint_Alpha，请先运行 SimulationSectorZeroGenerator。");
            return;
        }

        GetSpawnPoseForOrder(_spawnOrder, out Vector3 pos, out Quaternion rot);

        var instance = Instantiate(playerPrefab, pos, rot);
        var netObj = instance.GetComponent<NetworkObject>();
        if (netObj == null)
        {
            Debug.LogError("[NetworkSpawnManager] playerPrefab 缺少 NetworkObject。");
            Destroy(instance);
            return;
        }

        netObj.SpawnAsPlayerObject(clientId, true);
        _spawnedClients.Add(clientId);
        _spawnOrder++;

        Debug.Log($"[NetworkSpawnManager] 客户端 {clientId} 已出生（顺序 #{_spawnOrder}）@ {pos}");
    }

    void GetSpawnPoseForOrder(int orderIndex, out Vector3 position, out Quaternion rotation)
    {
        position = spawnPointAlpha.position;
        rotation = spawnPointAlpha.rotation;

        if (orderIndex > 0)
            position += spawnPointAlpha.forward * (extraPlayerSpacingZ * orderIndex);
    }

    void ResolveSpawnPoint()
    {
        if (spawnPointAlpha != null)
            return;

        var alphaGo = GameObject.Find("SpawnPoint_Alpha");
        if (alphaGo != null)
            spawnPointAlpha = alphaGo.transform;

        if (spawnPointAlpha == null)
        {
            var gen = FindObjectOfType<SimulationSectorZeroGenerator>();
            if (gen != null)
                spawnPointAlpha = gen.SpawnPointAlpha;
        }
    }
}

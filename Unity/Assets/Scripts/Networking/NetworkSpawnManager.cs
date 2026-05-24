using System.Collections.Generic;
using Unity.Netcode;
using UnityEngine;

/// <summary>
/// 【新手教程】联机出生管理 — Netcode for GameObjects (NGO)
/// 服务器权威：客户端连入后，由服务器在指定出生点生成玩家 NetworkObject。
/// 当前规则：第 1 名玩家 → SpawnPoint_Alpha。
/// </summary>
[DisallowMultipleComponent]
public class NetworkSpawnManager : MonoBehaviour
{
    const string SpawnAlphaName = "SpawnPoint_Alpha";

    [Header("玩家预制体（必须含 NetworkObject）")]
    [SerializeField] GameObject playerPrefab;

    [Header("出生点（可拖入；留空则自动查找）")]
    [SerializeField] Transform spawnPointAlpha;

    [Header("多名玩家测试：非首个玩家是否在 Alpha 旁错开")]
    [SerializeField] bool offsetExtraPlayers = true;

    [SerializeField] float extraPlayerSpacing = 1.5f;

    readonly HashSet<ulong> _spawnedClients = new HashSet<ulong>();
    int _spawnOrder;

    void OnEnable()
    {
        if (NetworkManager.Singleton == null)
        {
            Debug.LogWarning("[NetworkSpawnManager] 场景中未找到 NetworkManager，出生逻辑未注册。");
            return;
        }

        NetworkManager.Singleton.OnServerStarted += OnServerStarted;
        NetworkManager.Singleton.OnClientConnectedCallback += OnClientConnected;
        NetworkManager.Singleton.OnClientDisconnectCallback += OnClientDisconnected;
    }

    void OnDisable()
    {
        if (NetworkManager.Singleton == null)
            return;

        NetworkManager.Singleton.OnServerStarted -= OnServerStarted;
        NetworkManager.Singleton.OnClientConnectedCallback -= OnClientConnected;
        NetworkManager.Singleton.OnClientDisconnectCallback -= OnClientDisconnected;
    }

    void OnServerStarted()
    {
        _spawnOrder = 0;
        _spawnedClients.Clear();
        ResolveSpawnPoints();
    }

    void OnClientConnected(ulong clientId)
    {
        if (!NetworkManager.Singleton.IsServer)
            return;

        if (playerPrefab == null)
        {
            Debug.LogError("[NetworkSpawnManager] 未指定 playerPrefab，无法生成玩家。");
            return;
        }

        if (_spawnedClients.Contains(clientId))
            return;

        if (!playerPrefab.TryGetComponent<NetworkObject>(out _))
        {
            Debug.LogError("[NetworkSpawnManager] playerPrefab 根节点缺少 NetworkObject 组件。");
            return;
        }

        Transform spawn = GetSpawnTransformForOrder(_spawnOrder);
        if (spawn == null)
        {
            Debug.LogError($"[NetworkSpawnManager] 未找到 {SpawnAlphaName}，请先生成地图或手动指定出生点。");
            return;
        }

        Vector3 pos = spawn.position;
        Quaternion rot = spawn.rotation;

        if (_spawnOrder > 0 && offsetExtraPlayers)
        {
            pos += spawn.right * (extraPlayerSpacing * _spawnOrder);
        }

        GameObject playerInstance = Instantiate(playerPrefab, pos, rot);
        NetworkObject netObj = playerInstance.GetComponent<NetworkObject>();
        netObj.SpawnAsPlayerObject(clientId, true);

        _spawnedClients.Add(clientId);
        _spawnOrder++;

        Debug.Log(
            $"[NetworkSpawnManager] 客户端 {clientId} 已生成（序号 {_spawnOrder}） @ {SpawnAlphaName} {pos}"
        );
    }

    void OnClientDisconnected(ulong clientId)
    {
        _spawnedClients.Remove(clientId);
    }

    /// <summary>按连入顺序分配出生点；目前仅 Alpha，后续可扩展 Bravo</summary>
    Transform GetSpawnTransformForOrder(int order)
    {
        if (order == 0)
            return spawnPointAlpha;

        return spawnPointAlpha;
    }

    void ResolveSpawnPoints()
    {
        if (spawnPointAlpha != null)
            return;

        var alphaGo = GameObject.Find(SpawnAlphaName);
        if (alphaGo != null)
        {
            spawnPointAlpha = alphaGo.transform;
            Debug.Log($"[NetworkSpawnManager] 已自动绑定 {SpawnAlphaName}");
        }
    }

#if UNITY_EDITOR
    void OnValidate()
    {
        if (spawnPointAlpha == null)
        {
            var alphaGo = GameObject.Find(SpawnAlphaName);
            if (alphaGo != null)
                spawnPointAlpha = alphaGo.transform;
        }
    }
#endif
}

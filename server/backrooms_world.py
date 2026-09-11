"""后室全服同一世界：位姿、火盐对人、倒地救援、L1 保护。"""

from __future__ import annotations

import math
import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import db

BACKROOMS_WORLD_ROOM = "backrooms_world"

L1_PROTECT_FIRST_SEC = 120.0
L1_PROTECT_RETURN_SEC = 15.0
L1_PROTECT_SEC = L1_PROTECT_FIRST_SEC  # 兼容旧测试名
REVIVE_IFRAME_SEC = 10.0
DOWNED_SEC = 28.0
REVIVE_HOLD_SEC = 4.0
REVIVE_RANGE = 2.2
DISCONNECT_HOLD_SEC = 15.0
MAX_SPEED = 14.0
INTEREST_DIST = 90.0
HP_DEFAULT = 100.0
# 客户端上限受皇家口粮等升级影响，服务端只做防溢出的宽松夹取。
HP_MAX = 500.0
DOWNED_REVIVE_HP = 25.0
FIRESALT_DAMAGE = 60.0
FIRESALT_RADIUS = 5.0
FIRESALT_MAX_DIST = 42.0
FIRESALT_COOLDOWN = 0.4
ASSAULT_COOLDOWN_SEC = 8.0
PERSIST_EVERY_SEC = 5.0
INPUT_MIN_INTERVAL = 1.0 / 30.0
REVIVE_PACKET_MIN_INTERVAL = 0.15
PICKUP_BURST_LIMIT = 12
PICKUP_BURST_WINDOW = 1.0
HELLO_MAX_JUMP = 48.0
DETENTION_LEVEL = "l363"
DETENTION_PAGE = "backrooms-level363.html"
DETENTION_SPAWN = (0.0, 2.1)
CHEAT_BASE_SEC = 10 * 60
CHEAT_MAX_SEC = 10 * 365 * 24 * 60 * 60
CHEAT_STRIKE_COOLDOWN = 8.0
SUSPICION_WINDOW_SEC = 30.0
SUSPICION_DISTINCT_LIMIT = 3
CHEAT_WEIGHT = {
    "inventory": 2.0,
    "pickup": 1.5,
    "teleport": 1.25,
}
CHEAT_REASON_LABEL = {
    "inventory": "篡改背包",
    "pickup": "伪造拾取",
    "teleport": "异常传送",
}

L1_LEVEL_KEYS = frozenset({"clip", "l1"})
_ITEM_ID_RE = re.compile(r"^[a-z0-9_]{1,48}$")
_PICKUP_KEY_RE = re.compile(r"^[a-z0-9_.:-]{3,96}$")
_LEVEL_KEY_RE = re.compile(r"^[a-z0-9_]{1,32}$")
RETIRED_ITEM_IDS = frozenset(
    {
        "bandage",
        "industrial_supplies",
        "circuit",
        "alloy_plate",
        "roulette_revolver",
        "package_l159",
        "mechanism_room_pass",
        "stasis_room_pass",
    }
)

# 与 js/backrooms-level1-world.js megBaseWorldCenter 一致：
# spawn (10,10) → chunk (0,0) + offset (5,0) → 格中心 (45.5, 4.5)*4
MEG_BASE_X = 198.0
MEG_BASE_Z = 18.0
MEG_BASE_HALF_W = 7.0
MEG_BASE_HALF_D = 5.0
MEG_INTERIOR_INSET = 1.2

EmitFn = Callable[..., None]

_actors: Dict[int, dict] = {}
_sid_to_uid: Dict[str, int] = {}
_last_persist_at = 0.0


def reset_world() -> None:
    _actors.clear()
    _sid_to_uid.clear()


def now() -> float:
    return time.monotonic()


def wall_now() -> float:
    return time.time()


def is_in_meg_base(x: float, z: float) -> bool:
    return (
        abs(x - MEG_BASE_X) <= MEG_BASE_HALF_W - MEG_INTERIOR_INSET
        and abs(z - MEG_BASE_Z) <= MEG_BASE_HALF_D - MEG_INTERIOR_INSET
    )


def _clip(n: float, lo: float, hi: float) -> float:
    return lo if n < lo else hi if n > hi else n


def _finite_number(value: Any, fallback: Optional[float] = None) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return fallback
    return number if math.isfinite(number) else fallback


def _rate_limited(actor: dict, key: str, interval: float) -> bool:
    t = now()
    previous = float(actor.get(key) or 0.0)
    if t - previous < interval:
        return True
    actor[key] = t
    return False


def _burst_rate_limited(
    actor: dict, key: str, limit: int, window: float
) -> bool:
    t = now()
    started = float(actor.get(key + "_started") or 0.0)
    if t - started >= window:
        actor[key + "_started"] = t
        actor[key + "_count"] = 0
    count = int(actor.get(key + "_count") or 0)
    if count >= limit:
        return True
    actor[key + "_count"] = count + 1
    return False


def _meg_spawn_for(user_id: int) -> Tuple[float, float]:
    """账号稳定映射到基地内 9×5 个出生位，避免大量模型完全重叠。"""
    slot = abs(int(user_id)) % 45
    return (
        MEG_BASE_X + (slot % 9 - 4) * 1.1,
        MEG_BASE_Z + (slot // 9 - 2) * 1.1,
    )


def _dist(a: dict, b: dict) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["z"]) - float(b["z"]))


def _public_peer(actor: dict) -> dict:
    t = now()
    return {
        "userId": actor["user_id"],
        "nickname": actor["nickname"],
        "x": round(actor["x"], 3),
        "z": round(actor["z"], 3),
        "y": round(actor.get("y") or 0.0, 3),
        "yaw": round(actor["yaw"], 4),
        "pitch": round(actor["pitch"], 4),
        "hp": int(actor["hp"]),
        "downed": bool(actor["downed"]),
        "protected": actor["protect_until"] > t,
        "iframe": actor["iframe_until"] > t,
    }


def _set_hp(actor: dict, hp: float) -> None:
    """服务端改血必须走这里：版本号让客户端区分「服务端新判定」和「自己回传的旧值」。"""
    actor["hp"] = max(0.0, min(HP_MAX, float(hp)))
    actor["hp_version"] = int(actor.get("hp_version") or 0) + 1


def _self_view(actor: dict) -> dict:
    t = now()
    return {
        **_public_peer(actor),
        "levelKey": actor["level_key"],
        "hpVersion": int(actor.get("hp_version") or 0),
        "forcePos": {
            "version": int(actor.get("force_pos_version") or 0),
            "x": actor["x"],
            "z": actor["z"],
        },
        "protectLeft": max(0.0, actor["protect_until"] - t),
        "protectKind": actor.get("protect_kind") or "",
        "iframeLeft": max(0.0, actor["iframe_until"] - t),
        "downedLeft": max(0.0, actor["downed_until"] - t) if actor["downed"] else 0.0,
        "reviveProgress": round(actor.get("revive_progress") or 0.0, 3),
        "detention": _detention_public(actor),
        "redirect": _redirect_for(actor),
    }


def persist_actor(actor: dict) -> None:
    db.save_backrooms_world_actor(
        int(actor["user_id"]),
        {
            "levelKey": actor["level_key"],
            "x": actor["x"],
            "z": actor["z"],
            "y": actor.get("y") or 0.0,
            "yaw": actor["yaw"],
            "hp": actor["hp"],
            "inventory": actor.get("inventory") or [],
            "l1ProtectUsed": bool(actor.get("l1_protect_used")),
            "detained": bool(actor.get("detained")),
        },
    )


def _load_saved(user_id: int) -> dict:
    return db.load_backrooms_world_actor(user_id) or {}


def detention_seconds(weight: float, strike_count: int) -> int:
    strike = max(1, int(strike_count))
    return min(
        CHEAT_MAX_SEC,
        max(60, int(CHEAT_BASE_SEC * float(weight) * (3 ** (strike + 3)))),
    )


def _actor_ip(actor: Optional[dict], sess: Optional[dict] = None) -> str:
    if sess:
        ip = db.normalize_ip(str(sess.get("ip") or ""))
        if ip:
            return ip
    if actor:
        return db.normalize_ip(str(actor.get("ip") or ""))
    return ""


def _detention_public(actor: dict) -> Optional[dict]:
    rec = db.get_active_backrooms_detention(_actor_ip(actor))
    if not rec:
        return None
    reason = str(rec.get("last_reason") or "")
    return {
        "active": True,
        "leftSec": int(rec.get("left_sec") or 0),
        "until": rec.get("until"),
        "strikeCount": int(rec.get("strike_count") or 0),
        "reason": reason,
        "label": CHEAT_REASON_LABEL.get(reason, "异常行为"),
        "levelKey": DETENTION_LEVEL,
        "page": DETENTION_PAGE,
    }


def _redirect_for(actor: dict) -> Optional[str]:
    rec = db.get_active_backrooms_detention(_actor_ip(actor))
    if rec:
        return DETENTION_PAGE
    return None


def _send_to_363(user_id: int) -> None:
    spawn_x, spawn_z = DETENTION_SPAWN
    actor = _actors.get(int(user_id))
    if actor:
        actor["detained"] = True
        actor["level_key"] = DETENTION_LEVEL
        actor["downed"] = False
        actor["downed_until"] = 0.0
        _force_position(actor, spawn_x, spawn_z)
        persist_actor(actor)
        return
    saved = _load_saved(int(user_id))
    saved["levelKey"] = DETENTION_LEVEL
    saved["x"] = spawn_x
    saved["z"] = spawn_z
    saved["detained"] = True
    if "inventory" not in saved:
        saved["inventory"] = []
    db.save_backrooms_world_actor(int(user_id), saved)


def flag_cheat(actor: dict, kind: str, sess: Optional[dict] = None) -> dict:
    """记一次作弊：该 IP 下账号进 363。返回需广播的隔离信息。"""
    if kind not in CHEAT_WEIGHT:
        kind = "pickup"
    ip = _actor_ip(actor, sess)
    if not ip:
        ip = "uid:%s" % int(actor["user_id"])
    actor["ip"] = ip
    rec = db.record_backrooms_detention(
        ip,
        weight=CHEAT_WEIGHT[kind],
        reason=kind,
        base_sec=CHEAT_BASE_SEC,
        max_sec=CHEAT_MAX_SEC,
        strike_cooldown_sec=CHEAT_STRIKE_COOLDOWN,
    )
    uids = set(db.get_user_ids_by_last_ip(ip)) if ip else set()
    uids.add(int(actor["user_id"]))
    for uid in uids:
        _send_to_363(uid)
    payload = {
        "active": True,
        "leftSec": int(rec.get("left_sec") or 0),
        "until": rec.get("until"),
        "strikeCount": int(rec.get("strike_count") or 0),
        "reason": kind,
        "label": CHEAT_REASON_LABEL.get(kind, "异常行为"),
        "levelKey": DETENTION_LEVEL,
        "page": DETENTION_PAGE,
        "extended": bool(rec.get("extended")),
    }
    return {"detention": payload, "notifyUserIds": sorted(uids)}


def _pickup_key_allowed(level_key: str, key: str) -> bool:
    lowered = key.lower()
    if lowered.startswith("shop:") or lowered.startswith("task:"):
        return True
    prefixes = [level_key + ":"]
    if level_key in L1_LEVEL_KEYS:
        prefixes.extend(["clip:", "l1:"])
    return any(lowered.startswith(prefix) for prefix in prefixes)


def _note_suspicion(actor: dict, kind: str, evidence: str) -> bool:
    """只有短时间内多个不同证据才升级处罚，避免坏缓存/重发包误判。"""
    t = now()
    state = actor.setdefault("suspicion", {})
    bucket = state.get(kind)
    if not bucket or t - float(bucket.get("started") or 0.0) > SUSPICION_WINDOW_SEC:
        bucket = {"started": t, "evidence": set()}
        state[kind] = bucket
    seen = bucket.setdefault("evidence", set())
    seen.add(str(evidence)[:96])
    return len(seen) >= SUSPICION_DISTINCT_LIMIT


def _release_detention_if_expired(actor: dict) -> Optional[str]:
    if not actor.get("detained"):
        return None
    rec = db.get_active_backrooms_detention(_actor_ip(actor))
    if rec:
        return None
    actor["detained"] = False
    if actor.get("level_key") == DETENTION_LEVEL:
        actor["level_key"] = "clip"
        spawn_x, spawn_z = _meg_spawn_for(int(actor["user_id"]))
        _force_position(actor, spawn_x, spawn_z)
        return "backrooms-level1.html"
    return None


def _enforce_active_detention(actor: dict) -> bool:
    rec = db.get_active_backrooms_detention(_actor_ip(actor))
    if not rec:
        return False
    actor["detained"] = True
    if actor.get("level_key") != DETENTION_LEVEL:
        actor["level_key"] = DETENTION_LEVEL
        _force_position(actor, DETENTION_SPAWN[0], DETENTION_SPAWN[1])
    return True


def _inventory_count(actor: dict, item_id: str) -> int:
    n = 0
    for item in actor.get("inventory") or []:
        if item and item.get("id") == item_id:
            n += 1
    return n


def _inventory_remove(actor: dict, item_id: str) -> bool:
    items = actor.get("inventory") or []
    for i, item in enumerate(items):
        if item and item.get("id") == item_id:
            items.pop(i)
            actor["inventory"] = items
            return True
    return False


def bind_sid(sid: str, user_id: int, nickname: str) -> None:
    old = _sid_to_uid.get(sid)
    if old and old != user_id:
        mark_disconnect(old, sid)
    _sid_to_uid[sid] = user_id
    actor = _actors.get(user_id)
    if actor:
        actor["sid"] = sid
        actor["nickname"] = nickname
        actor["disconnected_at"] = None


def mark_disconnect(user_id: int, sid: Optional[str] = None) -> None:
    actor = _actors.get(user_id)
    mapped = _sid_to_uid.get(sid or "")
    if sid and mapped == user_id:
        _sid_to_uid.pop(sid, None)
    if not actor:
        return
    if sid and actor.get("sid") not in (None, sid):
        return
    actor["sid"] = None
    actor["disconnected_at"] = now()
    persist_actor(actor)


def drop_actor(user_id: int) -> None:
    actor = _actors.pop(user_id, None)
    if not actor:
        return
    sid = actor.get("sid")
    if sid and _sid_to_uid.get(sid) == user_id:
        _sid_to_uid.pop(sid, None)
    persist_actor(actor)


def get_actor(user_id: int) -> Optional[dict]:
    return _actors.get(user_id)


def actor_for_sid(sid: str) -> Optional[dict]:
    uid = _sid_to_uid.get(sid)
    if uid is None:
        return None
    return _actors.get(uid)


def _new_actor(user_id: int, sid: str, nickname: str, level_key: str, pose: dict) -> dict:
    saved = _load_saved(user_id)
    t = now()
    hp = _finite_number(saved.get("hp"), HP_DEFAULT)
    hp = _clip(hp, 1.0, HP_MAX)
    saved_x = _finite_number(saved.get("x"))
    saved_z = _finite_number(saved.get("z"))
    pose_x = _finite_number(pose.get("x"), 0.0) or 0.0
    pose_z = _finite_number(pose.get("z"), 0.0) or 0.0
    saved_level = str(saved.get("levelKey") or "")
    x, z = pose_x, pose_z
    teleport_cheat = False
    if saved_level == level_key and saved_x is not None and saved_z is not None:
        jump = math.hypot(pose_x - saved_x, pose_z - saved_z)
        l1_entry = level_key in L1_LEVEL_KEYS and (abs(pose_x) < 40 and abs(pose_z) < 40)
        if jump > HELLO_MAX_JUMP and not l1_entry:
            x, z = saved_x, saved_z
            teleport_cheat = True
        else:
            x, z = pose_x, pose_z
    actor = {
        "user_id": user_id,
        "sid": sid,
        "nickname": nickname,
        "level_key": level_key,
        "x": x,
        "z": z,
        "y": _finite_number(pose.get("y"), 0.0),
        "yaw": _finite_number(pose.get("yaw"), 0.0),
        "pitch": _finite_number(pose.get("pitch"), 0.0),
        "hp": hp,
        "hp_version": 0,
        "force_pos_version": 0,
        "downed": False,
        "downed_until": 0.0,
        "protect_until": 0.0,
        "iframe_until": 0.0,
        "last_input_at": t,
        "last_fire_at": 0.0,
        "revive_target": None,
        "revive_progress": 0.0,
        "disconnected_at": None,
        "meg_identity_id": None,
        "inventory": _sanitize_inventory(saved.get("inventory") or []),
        "last_assault_at": 0.0,
        "entered_l1_at": 0.0,
        "l1_protect_used": bool(saved.get("l1ProtectUsed")),
        "protect_kind": "",
        "last_input_packet_at": 0.0,
        "last_revive_packet_at": 0.0,
        "pickup_rate_started": 0.0,
        "pickup_rate_count": 0,
        "detained": bool(saved.get("detained")),
        "ip": "",
        "pending_cheat": "teleport" if teleport_cheat else "",
    }
    if level_key in L1_LEVEL_KEYS and saved_level not in L1_LEVEL_KEYS:
        _apply_l1_protect(actor)
        if is_in_meg_base(x, z) or (abs(x) < 40 and abs(z) < 40):
            spawn_x, spawn_z = _meg_spawn_for(user_id)
            _force_position(actor, spawn_x, spawn_z)
            actor["pending_cheat"] = ""
    return actor


def _apply_l1_protect(actor: dict) -> None:
    t = now()
    if actor.get("l1_protect_used"):
        actor["protect_until"] = t + L1_PROTECT_RETURN_SEC
        actor["protect_kind"] = "return"
    else:
        actor["protect_until"] = t + L1_PROTECT_FIRST_SEC
        actor["protect_kind"] = "first"
        actor["l1_protect_used"] = True
    actor["entered_l1_at"] = t


def hello(sid: str, sess: dict, data: Optional[dict]) -> dict:
    data = data if isinstance(data, dict) else {}
    user_id = int(sess["user_id"])
    nickname = str(sess.get("nickname") or "")
    bind_sid(sid, user_id, nickname)
    level_key = str(data.get("levelKey") or "unknown")[:32]
    if not _LEVEL_KEY_RE.match(level_key):
        level_key = "unknown"
    actor = _actors.get(user_id)
    created = False
    if actor is None:
        actor = _new_actor(user_id, sid, nickname, level_key, data)
        _actors[user_id] = actor
        created = True
    else:
        actor["sid"] = sid
        actor["nickname"] = nickname
        actor["disconnected_at"] = None
    sess_ip = db.normalize_ip(str(sess.get("ip") or ""))
    if sess_ip:
        actor["ip"] = sess_ip
    # 旧资源包曾在 hello 中附带本地背包。无论内容如何都只忽略，
    # 不能据此重罚，避免 Service Worker 缓存旧版造成误判。
    cheat_notice = None
    pending = actor.pop("pending_cheat", "") if created else ""
    prev_level = actor.get("level_key")
    if not actor.get("detained"):
        actor["level_key"] = level_key
    meg_token = str(data.get("megToken") or "").strip()
    if meg_token:
        identity = db.get_backrooms_identity(meg_token)
        if identity:
            actor["meg_identity_id"] = int(identity["id"])
    if (
        not actor.get("detained")
        and level_key in L1_LEVEL_KEYS
        and prev_level not in L1_LEVEL_KEYS
    ):
        _apply_l1_protect(actor)
        nx = _finite_number(data.get("x"), actor["x"])
        nz = _finite_number(data.get("z"), actor["z"])
        if nx is not None and nz is not None and abs(nx) < 40 and abs(nz) < 40:
            spawn_x, spawn_z = _meg_spawn_for(user_id)
            _force_position(actor, spawn_x, spawn_z)
            pending = ""
        elif nx is not None and nz is not None:
            actor["x"] = nx
            actor["z"] = nz
    elif not created and not actor.get("detained"):
        nx = _finite_number(data.get("x"))
        nz = _finite_number(data.get("z"))
        if nx is not None and nz is not None:
            if prev_level == level_key:
                jump = math.hypot(nx - actor["x"], nz - actor["z"])
                l1_entry = level_key in L1_LEVEL_KEYS and abs(nx) < 40 and abs(nz) < 40
                if jump > HELLO_MAX_JUMP and not l1_entry:
                    pending = "teleport"
                else:
                    actor["x"] = nx
                    actor["z"] = nz
            else:
                actor["x"] = nx
                actor["z"] = nz
        for field in ("y", "yaw", "pitch"):
            value = _finite_number(data.get(field))
            if value is not None:
                actor[field] = value
    # hello 大跳可能是断线重连或层级脚本传送：服务端已恢复到存档位置，
    # 但不据此送 363。移动作弊应由连续 game_input 证据另行判定。
    if pending == "teleport":
        actor["last_corrected_hello_at"] = now()
    _enforce_active_detention(actor)
    release_page = _release_detention_if_expired(actor)
    persist_actor(actor)
    you = _self_view(actor)
    if release_page:
        you["redirect"] = release_page
        you["detention"] = None
    payload = {"ok": True, "you": you, "inventory": you.get("inventory") or []}
    if cheat_notice:
        payload["notifyUserIds"] = cheat_notice["notifyUserIds"]
        payload["detention"] = cheat_notice["detention"]
        you["detention"] = cheat_notice["detention"]
        you["redirect"] = DETENTION_PAGE
        you["levelKey"] = DETENTION_LEVEL
    return payload


def _sanitize_inventory(raw: List[Any]) -> List[dict]:
    out: List[dict] = []
    for item in raw[:41]:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "")
        if not _ITEM_ID_RE.match(item_id) or item_id in RETIRED_ITEM_IDS:
            continue
        name = str(item.get("name") or item_id)[:48]
        out.append({"id": item_id, "name": name})
    return out


def apply_input(sid: str, data: Optional[dict]) -> None:
    actor = actor_for_sid(sid)
    if not actor or actor["downed"]:
        return
    if actor.get("detained") and actor.get("level_key") == DETENTION_LEVEL:
        data = data if isinstance(data, dict) else {}
        nx = _finite_number(data.get("x"), actor["x"])
        nz = _finite_number(data.get("z"), actor["z"])
        if nx is not None and nz is not None:
            actor["x"] = _clip(nx, -3.2, 3.2)
            actor["z"] = _clip(nz, -3.4, 3.4)
        return
    data = data if isinstance(data, dict) else {}
    if _rate_limited(actor, "last_input_packet_at", INPUT_MIN_INTERVAL):
        return
    t = now()
    dt = t - float(actor.get("last_input_at") or t)
    if dt <= 0:
        dt = 0.05
    if dt > 0.35:
        dt = 0.35
    actor["last_input_at"] = t
    nx = _finite_number(data.get("x"))
    nz = _finite_number(data.get("z"))
    if nx is None or nz is None:
        return
    step = math.hypot(nx - actor["x"], nz - actor["z"])
    max_step = MAX_SPEED * dt + 0.35
    if step > max_step and step > 0:
        scale = max_step / step
        nx = actor["x"] + (nx - actor["x"]) * scale
        nz = actor["z"] + (nz - actor["z"]) * scale
    actor["x"] = nx
    actor["z"] = nz
    for field in ("y", "yaw", "pitch"):
        value = _finite_number(data.get(field))
        if value is not None:
            actor[field] = value
    # 单机 PvE 掉血仍由客户端结算，只有客户端已经确认过最新一次服务端判定才采信。
    client_hp = data.get("hp")
    client_version = data.get("hpVersion")
    try:
        version_matches = int(client_version) == int(actor.get("hp_version") or 0)
    except (TypeError, ValueError, OverflowError):
        version_matches = False
    if client_hp is not None and version_matches:
        hp = _finite_number(client_hp)
        if hp is None:
            return
        hp = max(0.0, min(HP_MAX, hp))
        actor["hp"] = hp
        if hp <= 0:
            _enter_downed(actor)


def _record_discipline(actor: dict, event_type: str, victim: dict) -> None:
    t = now()
    if t - float(actor.get("last_assault_at") or 0) < ASSAULT_COOLDOWN_SEC:
        return
    actor["last_assault_at"] = t
    identity_id = actor.get("meg_identity_id")
    if not identity_id:
        return
    bucket = int(wall_now() // ASSAULT_COOLDOWN_SEC)
    event_id = f"pvp:{event_type}:{actor['user_id']}:{victim['user_id']}:{bucket}"
    db.record_backrooms_event(
        int(identity_id),
        event_id,
        event_type,
        actor.get("level_key"),
        {"victim": victim["user_id"], "source": "world"},
    )


def _enter_downed(actor: dict) -> None:
    actor["downed"] = True
    _set_hp(actor, 0.0)
    actor["downed_until"] = now() + DOWNED_SEC
    actor["revive_target"] = None
    actor["revive_progress"] = 0.0


def _grant_iframe(actor: dict) -> None:
    actor["iframe_until"] = now() + REVIVE_IFRAME_SEC


def apply_player_damage(
    attacker: dict, victim: dict, damage: float, weapon: str
) -> Tuple[float, str]:
    """Return (applied, reason). reason is ok/base/protect/iframe/downed."""
    if attacker["user_id"] == victim["user_id"]:
        return 0.0, "self"
    if attacker["level_key"] != victim["level_key"]:
        return 0.0, "level"
    if victim["downed"]:
        return 0.0, "downed"
    t = now()
    # “打中玩家”即取消进层保护；即使对方正受保护或位于基地，命中仍成立。
    if attacker["protect_until"] > t:
        attacker["protect_until"] = 0.0
    same_l1 = attacker["level_key"] in L1_LEVEL_KEYS
    if same_l1 and is_in_meg_base(attacker["x"], attacker["z"]) and is_in_meg_base(
        victim["x"], victim["z"]
    ):
        _record_discipline(attacker, "base_assault", victim)
        return 0.0, "base"
    if victim["protect_until"] > t:
        return 0.0, "protect"
    if victim["iframe_until"] > t:
        return 0.0, "iframe"
    applied = max(0.0, float(damage))
    if applied <= 0:
        return 0.0, "ok"
    _set_hp(victim, float(victim["hp"]) - applied)
    _record_discipline(attacker, "civilian_assault", victim)
    if victim["hp"] <= 0:
        _enter_downed(victim)
    return applied, "ok"


def weapon_fire(sid: str, data: Optional[dict]) -> dict:
    actor = actor_for_sid(sid)
    if not actor or actor["downed"]:
        return {"ok": False, "reason": "downed"}
    if actor.get("detained"):
        return {"ok": False, "reason": "detained"}
    data = data if isinstance(data, dict) else {}
    weapon = str(data.get("weapon") or "fire_salt")
    t = now()
    if t - float(actor.get("last_fire_at") or 0) < FIRESALT_COOLDOWN:
        return {"ok": False, "reason": "cooldown"}
    actor["last_fire_at"] = t
    if weapon == "fire_salt":
        ex = _finite_number(data.get("explodeX"))
        ey = _finite_number(data.get("explodeY"), 1.2)
        ez = _finite_number(data.get("explodeZ"))
        if ex is None or ey is None or ez is None:
            return {"ok": False, "reason": "aim"}
        if math.hypot(ex - actor["x"], ez - actor["z"]) > FIRESALT_MAX_DIST:
            return {"ok": False, "reason": "range"}
        if _inventory_count(actor, "fire_salt") <= 0:
            return {"ok": False, "reason": "no_ammo"}
        _inventory_remove(actor, "fire_salt")
        hits = []
        # 断线未掉线的玩家仍可被打中，避免用拔网线躲伤害。
        for other in _actors.values():
            if other["level_key"] != actor["level_key"]:
                continue
            if other["user_id"] == actor["user_id"]:
                continue
            dist = math.hypot(other["x"] - ex, other["z"] - ez)
            dy = abs(float(other.get("y") or 0.0) - ey)
            if dist > FIRESALT_RADIUS or dy > FIRESALT_RADIUS:
                continue
            applied, reason = apply_player_damage(actor, other, FIRESALT_DAMAGE, weapon)
            hits.append(
                {
                    "userId": other["user_id"],
                    "applied": applied,
                    "reason": reason,
                    "hp": int(other["hp"]),
                    "downed": bool(other["downed"]),
                }
            )
        return {"ok": True, "weapon": weapon, "hits": hits}
    return {"ok": False, "reason": "weapon"}


def request_downed(sid: str, _reason: str = "pve") -> dict:
    actor = actor_for_sid(sid)
    if not actor:
        return {"ok": False}
    if not actor["downed"]:
        _enter_downed(actor)
    return {"ok": True, "you": _self_view(actor)}


def revive_hold(sid: str, data: Optional[dict]) -> dict:
    actor = actor_for_sid(sid)
    if not actor or actor["downed"]:
        return {"ok": False}
    if _rate_limited(actor, "last_revive_packet_at", REVIVE_PACKET_MIN_INTERVAL):
        return {
            "ok": True,
            "progress": float(actor.get("revive_progress") or 0.0),
            "limited": True,
        }
    data = data if isinstance(data, dict) else {}
    try:
        target_id = int(data.get("userId") or 0)
    except (TypeError, ValueError):
        return {"ok": False}
    target = _actors.get(target_id)
    if not target or not target["downed"]:
        actor["revive_target"] = None
        actor["revive_progress"] = 0.0
        return {"ok": False, "reason": "target"}
    if target["level_key"] != actor["level_key"]:
        return {"ok": False, "reason": "level"}
    if _dist(actor, target) > REVIVE_RANGE:
        actor["revive_progress"] = 0.0
        return {"ok": False, "reason": "range"}
    if actor.get("revive_target") != target_id:
        actor["revive_target"] = target_id
        actor["revive_progress"] = 0.0
    return {"ok": True, "progress": actor["revive_progress"]}


def revive_cancel(sid: str) -> None:
    actor = actor_for_sid(sid)
    if actor:
        actor["revive_target"] = None
        actor["revive_progress"] = 0.0


def _finish_revive(rescuer: dict, target: dict) -> None:
    target["downed"] = False
    target["downed_until"] = 0.0
    _set_hp(target, DOWNED_REVIVE_HP)
    _grant_iframe(target)
    rescuer["revive_target"] = None
    rescuer["revive_progress"] = 0.0


def _force_position(actor: dict, x: float, z: float) -> None:
    """服务端搬人。版本号让客户端只在新的一次传送时覆盖本地坐标。"""
    actor["x"] = float(x)
    actor["z"] = float(z)
    actor["force_pos_version"] = int(actor.get("force_pos_version") or 0) + 1


def finish_bleedout(actor: dict) -> None:
    actor["downed"] = False
    actor["downed_until"] = 0.0
    _set_hp(actor, HP_DEFAULT)
    _grant_iframe(actor)
    if actor["level_key"] in L1_LEVEL_KEYS:
        spawn_x, spawn_z = _meg_spawn_for(int(actor["user_id"]))
        _force_position(actor, spawn_x, spawn_z)


def _reject_suspicious_pickup(actor: dict, key: str, item_id: str) -> dict:
    evidence = f"{key}:{item_id}"
    should_detain = _note_suspicion(actor, "pickup", evidence)
    result = {
        "ok": False,
        "reason": "invalid",
        "itemId": item_id,
        "suspicious": True,
    }
    if not should_detain:
        bucket = actor.get("suspicion", {}).get("pickup", {})
        result["warningCount"] = len(bucket.get("evidence") or ())
        return result
    notice = flag_cheat(actor, "pickup")
    result["notifyUserIds"] = notice["notifyUserIds"]
    result["detention"] = notice["detention"]
    return result


def claim_pickup(sid: str, data: Optional[dict]) -> dict:
    actor = actor_for_sid(sid)
    if not actor:
        return {"ok": False, "reason": "auth"}
    if actor.get("detained"):
        return {"ok": False, "reason": "detained"}
    data = data if isinstance(data, dict) else {}
    key = str(data.get("key") or "")
    item_id = str(data.get("itemId") or "")
    name = str(data.get("name") or item_id)[:48]
    if _burst_rate_limited(
        actor, "pickup_rate", PICKUP_BURST_LIMIT, PICKUP_BURST_WINDOW
    ):
        return {"ok": False, "reason": "rate", "itemId": item_id}
    if item_id in RETIRED_ITEM_IDS:
        return {"ok": False, "reason": "invalid", "itemId": item_id}
    if not _PICKUP_KEY_RE.match(key) or not _ITEM_ID_RE.match(item_id):
        return _reject_suspicious_pickup(actor, key, item_id)
    if not _pickup_key_allowed(str(actor.get("level_key") or ""), key):
        return _reject_suspicious_pickup(actor, key, item_id)
    if len(actor.get("inventory") or []) >= 41:
        return {"ok": False, "reason": "full", "itemId": item_id}
    claimed, duplicate = db.claim_backrooms_world_pickup(
        key, int(actor["user_id"]), item_id
    )
    if not claimed:
        return {"ok": False, "reason": "taken", "duplicate": duplicate, "itemId": item_id}
    actor.setdefault("inventory", []).append({"id": item_id, "name": name})
    persist_actor(actor)
    return {"ok": True, "item": {"id": item_id, "name": name}}


def tick(dt: float) -> List[dict]:
    events: List[dict] = []
    t = now()
    gone = []
    for uid, actor in list(_actors.items()):
        disc = actor.get("disconnected_at")
        if disc and t - disc >= DISCONNECT_HOLD_SEC:
            gone.append(uid)
            continue
        if actor["downed"] and t >= actor["downed_until"]:
            finish_bleedout(actor)
            events.append({"type": "bled_out", "userId": uid, "you": _self_view(actor)})
        target_id = actor.get("revive_target")
        if target_id:
            target = _actors.get(int(target_id))
            if (
                not target
                or not target["downed"]
                or target["level_key"] != actor["level_key"]
                or _dist(actor, target) > REVIVE_RANGE
                or actor["downed"]
            ):
                actor["revive_target"] = None
                actor["revive_progress"] = 0.0
            else:
                actor["revive_progress"] = min(
                    1.0, float(actor["revive_progress"]) + dt / REVIVE_HOLD_SEC
                )
                if actor["revive_progress"] >= 1.0:
                    _finish_revive(actor, target)
                    events.append(
                        {
                            "type": "revived",
                            "userId": target["user_id"],
                            "by": actor["user_id"],
                            "you": _self_view(target),
                        }
                    )
    for uid in gone:
        drop_actor(uid)
    global _last_persist_at
    if t - _last_persist_at >= PERSIST_EVERY_SEC:
        _last_persist_at = t
        for actor in _actors.values():
            if actor.get("sid"):
                persist_actor(actor)
    return events


def snapshots_for_broadcast() -> List[Tuple[str, dict]]:
    out: List[Tuple[str, dict]] = []
    living = [a for a in _actors.values() if a.get("sid")]
    for actor in living:
        peers = []
        for other in living:
            if other["user_id"] == actor["user_id"]:
                continue
            if other["level_key"] != actor["level_key"]:
                continue
            if _dist(actor, other) > INTEREST_DIST:
                continue
            peers.append(_public_peer(other))
        out.append(
            (
                actor["sid"],
                {"t": wall_now(), "you": _self_view(actor), "peers": peers},
            )
        )
    return out


def emit_snapshots(emit: EmitFn) -> None:
    for sid, payload in snapshots_for_broadcast():
        emit("world_snapshot", payload, to=sid)


def emit_events(emit: EmitFn, events: List[dict]) -> None:
    for ev in events:
        uid = int(ev.get("userId") or 0)
        actor = _actors.get(uid)
        if actor and actor.get("sid"):
            emit("combat_event", ev, to=actor["sid"])
        by = ev.get("by")
        if by:
            rescuer = _actors.get(int(by))
            if rescuer and rescuer.get("sid"):
                emit("combat_event", ev, to=rescuer["sid"])

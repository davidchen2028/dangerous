"""SQLite 持久化：用户、会话、好友、仓库。"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DB_PATH = Path(__file__).resolve().parent / "lobby.db"
STASH_CELL_COUNT = 60
DEFAULT_CREDITS = 50000
PLAYER_STATE_VERSION = 1
MAX_PLAYER_STATE_BYTES = 512_000


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def _session_seconds(started_at: str, ended_at: Optional[str]) -> int:
    start = _parse_iso(started_at)
    if not start:
        return 0
    end = _parse_iso(ended_at) if ended_at else datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return max(0, int((end - start).total_seconds()))


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                stash_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friend_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user_id INTEGER NOT NULL,
                to_user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                UNIQUE(from_user_id, to_user_id),
                FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS friendships (
                user_id INTEGER NOT NULL,
                friend_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, friend_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_friend_req_to ON friend_requests(to_user_id, status);

            CREATE TABLE IF NOT EXISTS online_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_online_sessions_user
                ON online_sessions(user_id, started_at);
            """
        )
    close_orphan_online_sessions()
    _migrate_users_banned_until()
    _migrate_users_kick_requested_at()
    _migrate_users_kick_message()
    _migrate_users_last_ip()
    _migrate_users_last_client_device()
    _migrate_banned_ips_table()
    _migrate_users_player_state_json()


def _migrate_users_banned_until() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "banned_until" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN banned_until TEXT")


def _migrate_users_kick_requested_at() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "kick_requested_at" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN kick_requested_at TEXT")


def _migrate_users_kick_message() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "kick_message" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN kick_message TEXT")


def _migrate_users_last_ip() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "last_ip" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_ip TEXT")


def _migrate_users_last_client_device() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "last_client_device" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_client_device TEXT")


def _migrate_banned_ips_table() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS banned_ips (
                ip TEXT PRIMARY KEY,
                banned_until TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def _migrate_users_player_state_json() -> None:
    with connect() as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "player_state_json" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN player_state_json TEXT")
        if "player_state_updated_at" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN player_state_updated_at TEXT")


def normalize_ip(ip: Optional[str]) -> str:
    if not ip:
        return ""
    value = ip.strip()
    if "," in value:
        value = value.split(",")[0].strip()
    if value.startswith("[") and "]" in value:
        value = value[1 : value.index("]")]
    return value[:64]


def is_protected_ip(ip: str) -> bool:
    return ip in ("127.0.0.1", "::1", "localhost")


def update_user_last_ip(user_id: int, ip: str) -> None:
    ip = normalize_ip(ip)
    if not ip:
        return
    with connect() as conn:
        conn.execute("UPDATE users SET last_ip = ? WHERE id = ?", (ip, user_id))


def update_user_last_client_device(user_id: int, device: str) -> None:
    value = (device or "").strip().lower()
    if value not in ("mobile", "tablet", "desktop"):
        value = "desktop"
    with connect() as conn:
        conn.execute(
            "UPDATE users SET last_client_device = ? WHERE id = ?",
            (value, user_id),
        )


def get_user_ids_by_last_ip(ip: str) -> List[int]:
    ip = normalize_ip(ip)
    if not ip:
        return []
    with connect() as conn:
        rows = conn.execute(
            "SELECT id FROM users WHERE last_ip = ?",
            (ip,),
        ).fetchall()
    return [int(r["id"]) for r in rows]


def ban_ip_days(ip: str, days: int = 1) -> Optional[str]:
    ip = normalize_ip(ip)
    if not ip or is_protected_ip(ip):
        return None
    if days < 1:
        days = 1
    until = datetime.now(timezone.utc) + timedelta(days=days)
    banned_until = until.replace(microsecond=0).isoformat()
    now = _utc_now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO banned_ips (ip, banned_until, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(ip) DO UPDATE SET
                banned_until = excluded.banned_until,
                created_at = excluded.created_at
            """,
            (ip, banned_until, now),
        )
    return banned_until


def clear_ip_ban(ip: str) -> bool:
    ip = normalize_ip(ip)
    if not ip:
        return False
    with connect() as conn:
        cur = conn.execute("DELETE FROM banned_ips WHERE ip = ?", (ip,))
        return cur.rowcount > 0


def _ip_ban_active(banned_until: Optional[str], ip: str) -> bool:
    if not banned_until or not ip:
        return False
    end = _parse_iso(banned_until)
    if not end:
        clear_ip_ban(ip)
        return False
    now = datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if now >= end:
        clear_ip_ban(ip)
        return False
    return True


def get_active_ip_ban_message(ip: str) -> Optional[str]:
    ip = normalize_ip(ip)
    if not ip:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT banned_until FROM banned_ips WHERE ip = ?",
            (ip,),
        ).fetchone()
    if not row:
        return None
    banned_until = row["banned_until"]
    if not _ip_ban_active(banned_until, ip):
        return None
    hint = banned_until.replace("T", " ")[:16] + " (UTC)"
    return f"该 IP 已封禁，至 {hint} 前无法连接"


def list_active_banned_ips() -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT ip, banned_until, created_at FROM banned_ips ORDER BY banned_until DESC"
        ).fetchall()
    result = []
    for r in rows:
        ip = r["ip"]
        until = r["banned_until"]
        if _ip_ban_active(until, ip):
            result.append(
                {
                    "ip": ip,
                    "bannedUntil": until,
                    "createdAt": r["created_at"],
                }
            )
    return result


def default_player_state() -> Dict[str, Any]:
    return {
        "v": PLAYER_STATE_VERSION,
        "credits": DEFAULT_CREDITS,
        "grids": None,
        "loadout": None,
        "tutorialComplete": False,
    }


def _clamp_credits(value: Any) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return DEFAULT_CREDITS
    return max(0, min(n, 999_999_999))


def normalize_player_state(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return default_player_state()
    state = default_player_state()
    if raw.get("v") == PLAYER_STATE_VERSION:
        state["credits"] = _clamp_credits(raw.get("credits"))
        grids = raw.get("grids")
        loadout = raw.get("loadout")
        if grids is not None:
            state["grids"] = grids
        if loadout is not None:
            state["loadout"] = loadout
        tc = raw.get("tutorialComplete")
        if isinstance(tc, bool):
            state["tutorialComplete"] = tc
        elif tc in (1, "1", "true", "True"):
            state["tutorialComplete"] = True
    return state


def get_player_state(user_id: int) -> Dict[str, Any]:
    with connect() as conn:
        row = conn.execute(
            "SELECT player_state_json FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row or not row["player_state_json"]:
        return default_player_state()
    try:
        data = json.loads(row["player_state_json"])
        return normalize_player_state(data)
    except (json.JSONDecodeError, TypeError):
        return default_player_state()


def save_player_state(user_id: int, state: Dict[str, Any]) -> Tuple[bool, str]:
    normalized = normalize_player_state(state)
    payload = json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode("utf-8")) > MAX_PLAYER_STATE_BYTES:
        return False, "存档过大"
    now = _utc_now()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE users
            SET player_state_json = ?, player_state_updated_at = ?
            WHERE id = ?
            """,
            (payload, now, user_id),
        )
        if cur.rowcount == 0:
            return False, "用户不存在"
    return True, now


def empty_stash() -> List[Optional[str]]:
    return [None] * STASH_CELL_COUNT


def create_user(nickname: str, password_hash: str) -> int:
    stash = json.dumps(empty_stash())
    player_state = json.dumps(default_player_state(), ensure_ascii=False)
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO users (nickname, password_hash, stash_json, player_state_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (nickname, password_hash, stash, player_state, _utc_now()),
        )
        return int(cur.lastrowid)


def get_user_by_nickname(nickname: str) -> Optional[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE nickname = ? COLLATE NOCASE",
            (nickname.strip(),),
        ).fetchone()


def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    with connect() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def create_session(user_id: int, token: str, days: int = 30) -> None:
    expires = datetime.now(timezone.utc) + timedelta(days=days)
    expires_at = expires.replace(microsecond=0).isoformat()
    with connect() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires_at),
        )


def delete_session(token: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def delete_all_user_sessions(user_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def delete_user(user_id: int) -> Tuple[bool, str]:
    user = get_user_by_id(user_id)
    if not user:
        return False, "用户不存在"
    nickname = user["nickname"]
    with connect() as conn:
        conn.execute("DELETE FROM online_sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute(
            "DELETE FROM friend_requests WHERE from_user_id = ? OR to_user_id = ?",
            (user_id, user_id),
        )
        conn.execute(
            "DELETE FROM friendships WHERE user_id = ? OR friend_id = ?",
            (user_id, user_id),
        )
        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        if cur.rowcount == 0:
            return False, "删除失败"
    return True, nickname


def ban_user_days(user_id: int, days: int = 1) -> Optional[str]:
    """封禁账号至 UTC 时间，返回 banned_until ISO。"""
    if days < 1:
        days = 1
    until = datetime.now(timezone.utc) + timedelta(days=days)
    banned_until = until.replace(microsecond=0).isoformat()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE users SET banned_until = ? WHERE id = ?",
            (banned_until, user_id),
        )
        if cur.rowcount == 0:
            return None
    return banned_until


def clear_user_ban(user_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "UPDATE users SET banned_until = NULL WHERE id = ?",
            (user_id,),
        )
        return cur.rowcount > 0


def _ban_active(banned_until: Optional[str], user_id: Optional[int] = None) -> bool:
    if not banned_until:
        return False
    end = _parse_iso(banned_until)
    if not end:
        if user_id is not None:
            clear_user_ban(user_id)
        return False
    now = datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if now >= end:
        if user_id is not None:
            clear_user_ban(user_id)
        return False
    return True


def get_active_ban_message(user_id: int) -> Optional[str]:
    user = get_user_by_id(user_id)
    if not user:
        return None
    banned_until = user["banned_until"] if "banned_until" in user.keys() else None
    if not _ban_active(banned_until, user_id):
        return None
    local_hint = banned_until.replace("T", " ")[:16] + " (UTC)"
    return f"账号已封禁，至 {local_hint} 前无法登录"


def get_user_by_token(token: str) -> Optional[sqlite3.Row]:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, _utc_now()),
        ).fetchone()
        return row


def get_stash(user_id: int) -> List[Optional[str]]:
    with connect() as conn:
        row = conn.execute(
            "SELECT stash_json FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row or not row["stash_json"]:
        return empty_stash()
    try:
        data = json.loads(row["stash_json"])
        if isinstance(data, list) and len(data) == STASH_CELL_COUNT:
            return data
    except (json.JSONDecodeError, TypeError):
        pass
    return empty_stash()


def save_stash(user_id: int, stash: List[Optional[str]]) -> None:
    payload = json.dumps(stash[:STASH_CELL_COUNT])
    with connect() as conn:
        conn.execute(
            "UPDATE users SET stash_json = ? WHERE id = ?",
            (payload, user_id),
        )


def list_friends(user_id: int) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.nickname
            FROM friendships f
            JOIN users u ON u.id = f.friend_id
            WHERE f.user_id = ?
            ORDER BY u.nickname COLLATE NOCASE
            """,
            (user_id,),
        ).fetchall()
    return [{"id": r["id"], "nickname": r["nickname"]} for r in rows]


def are_friends(user_id: int, other_id: int) -> bool:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM friendships
            WHERE user_id = ? AND friend_id = ?
            """,
            (user_id, other_id),
        ).fetchone()
    return row is not None


def create_friend_request(from_id: int, to_id: int) -> Tuple[bool, str]:
    if from_id == to_id:
        return False, "不能添加自己为好友"
    if are_friends(from_id, to_id):
        return False, "已经是好友了"

    with connect() as conn:
        pending = conn.execute(
            """
            SELECT id, status FROM friend_requests
            WHERE from_user_id = ? AND to_user_id = ?
            """,
            (from_id, to_id),
        ).fetchone()
        if pending:
            if pending["status"] == "pending":
                return False, "已发送过申请，请等待对方处理"
            return False, "无法重复发送"

        reverse = conn.execute(
            """
            SELECT id, status FROM friend_requests
            WHERE from_user_id = ? AND to_user_id = ?
            """,
            (to_id, from_id),
        ).fetchone()
        if reverse and reverse["status"] == "pending":
            return False, "对方已向你发过申请，请在下方同意"

        conn.execute(
            """
            INSERT INTO friend_requests (from_user_id, to_user_id, status, created_at)
            VALUES (?, ?, 'pending', ?)
            """,
            (from_id, to_id, _utc_now()),
        )
    return True, "好友申请已发送"


def list_incoming_requests(user_id: int) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT fr.id, fr.from_user_id, u.nickname, fr.created_at
            FROM friend_requests fr
            JOIN users u ON u.id = fr.from_user_id
            WHERE fr.to_user_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "fromUserId": r["from_user_id"],
            "nickname": r["nickname"],
            "createdAt": r["created_at"],
        }
        for r in rows
    ]


def accept_friend_request(
    request_id: int, user_id: int
) -> Tuple[bool, str, Optional[int]]:
    with connect() as conn:
        req = conn.execute(
            """
            SELECT * FROM friend_requests
            WHERE id = ? AND to_user_id = ? AND status = 'pending'
            """,
            (request_id, user_id),
        ).fetchone()
        if not req:
            return False, "申请不存在或已处理", None

        other_id = int(req["from_user_id"])
        now = _utc_now()
        conn.execute(
            "UPDATE friend_requests SET status = 'accepted' WHERE id = ?",
            (request_id,),
        )
        conn.execute(
            "INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)",
            (user_id, other_id, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)",
            (other_id, user_id, now),
        )
    return True, "已添加好友", other_id


def close_orphan_online_sessions() -> int:
    """服务重启时结束未正常关闭的在线记录。"""
    now = _utc_now()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE online_sessions
            SET ended_at = ?
            WHERE ended_at IS NULL
            """,
            (now,),
        )
        return cur.rowcount


def start_online_session(user_id: int) -> int:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO online_sessions (user_id, started_at, ended_at)
            VALUES (?, ?, NULL)
            """,
            (user_id, _utc_now()),
        )
        return int(cur.lastrowid)


def end_online_session(session_id: int) -> None:
    with connect() as conn:
        conn.execute(
            """
            UPDATE online_sessions
            SET ended_at = ?
            WHERE id = ? AND ended_at IS NULL
            """,
            (_utc_now(), session_id),
        )


def get_online_user_ids_from_db() -> set:
    """根据未结束的 online_sessions 判断在线（供 8082 管理端读取）。"""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT user_id FROM online_sessions
            WHERE ended_at IS NULL
            """
        ).fetchall()
    return {int(r["user_id"]) for r in rows}


def request_kick(user_id: int, message: str = "你已被管理员踢下线") -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE users SET kick_requested_at = ?, kick_message = ? WHERE id = ?",
            (_utc_now(), message, user_id),
        )


def consume_kick_request(user_id: int) -> Optional[str]:
    with connect() as conn:
        row = conn.execute(
            "SELECT kick_requested_at, kick_message FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row or not row["kick_requested_at"]:
            return None
        msg = row["kick_message"] or "你已被管理员踢下线"
        conn.execute(
            "UPDATE users SET kick_requested_at = NULL, kick_message = NULL WHERE id = ?",
            (user_id,),
        )
        return msg


def end_open_sessions_for_user(user_id: int) -> None:
    now = _utc_now()
    with connect() as conn:
        conn.execute(
            """
            UPDATE online_sessions
            SET ended_at = ?
            WHERE user_id = ? AND ended_at IS NULL
            """,
            (now, user_id),
        )


def list_users_online_stats(online_user_ids: Optional[set] = None) -> List[Dict[str, Any]]:
    online_ids = online_user_ids or set()
    with connect() as conn:
        users = conn.execute(
            """
            SELECT id, nickname, created_at, banned_until, last_ip, last_client_device
            FROM users
            ORDER BY nickname COLLATE NOCASE
            """
        ).fetchall()
        sessions = conn.execute(
            """
            SELECT user_id, started_at, ended_at
            FROM online_sessions
            ORDER BY user_id, started_at
            """
        ).fetchall()
        ip_ban_rows = conn.execute(
            "SELECT ip, banned_until FROM banned_ips"
        ).fetchall()

    ip_bans = {r["ip"]: r["banned_until"] for r in ip_ban_rows}

    by_user: Dict[int, Dict[str, Any]] = {}
    for u in users:
        uid = int(u["id"])
        banned_until = u["banned_until"] if "banned_until" in u.keys() else None
        is_banned = _ban_active(banned_until, uid)
        last_ip = u["last_ip"] if "last_ip" in u.keys() else None
        last_client_device = (
            u["last_client_device"] if "last_client_device" in u.keys() else None
        )
        ip_banned = False
        ip_banned_until = None
        if last_ip and last_ip in ip_bans:
            until = ip_bans[last_ip]
            if _ip_ban_active(until, last_ip):
                ip_banned = True
                ip_banned_until = until
        by_user[uid] = {
            "userId": uid,
            "nickname": u["nickname"],
            "registeredAt": u["created_at"],
            "lastIp": last_ip or None,
            "lastClientDevice": last_client_device or "desktop",
            "totalOnlineSeconds": 0,
            "sessionCount": 0,
            "lastSeenAt": None,
            "online": uid in online_ids,
            "currentSessionStartedAt": None,
            "banned": is_banned,
            "bannedUntil": banned_until if is_banned else None,
            "ipBanned": ip_banned,
            "ipBannedUntil": ip_banned_until,
        }

    for s in sessions:
        uid = int(s["user_id"])
        if uid not in by_user:
            continue
        row = by_user[uid]
        secs = _session_seconds(s["started_at"], s["ended_at"])
        row["totalOnlineSeconds"] += secs
        row["sessionCount"] += 1
        end_ts = s["ended_at"] or _utc_now()
        if not row["lastSeenAt"] or end_ts > row["lastSeenAt"]:
            row["lastSeenAt"] = end_ts
        if s["ended_at"] is None:
            row["currentSessionStartedAt"] = s["started_at"]

    result = list(by_user.values())
    result.sort(key=lambda r: (-r["totalOnlineSeconds"], r["nickname"].lower()))
    return result


def decline_friend_request(request_id: int, user_id: int) -> Tuple[bool, str]:
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE friend_requests SET status = 'declined'
            WHERE id = ? AND to_user_id = ? AND status = 'pending'
            """,
            (request_id, user_id),
        )
        if cur.rowcount == 0:
            return False, "申请不存在或已处理"
    return True, "已拒绝申请"

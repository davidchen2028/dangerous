"""SQLite 持久化：用户、会话、好友、仓库。"""

from __future__ import annotations

import json
import hashlib
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DB_PATH = Path(__file__).resolve().parent / "lobby.db"
STASH_CELL_COUNT = 60
DEFAULT_CREDITS = 30000
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
    _migrate_market_stock_table()
    _migrate_backrooms_governance()


def _migrate_backrooms_governance() -> None:
    """Create the independent M.E.G. governance store idempotently."""
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS backrooms_identities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meg_profiles (
                identity_id INTEGER PRIMARY KEY,
                rank TEXT NOT NULL DEFAULT 'none',
                department TEXT,
                contribution INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                supervisor_code TEXT,
                promotion_frozen INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(identity_id) REFERENCES backrooms_identities(id)
            );
            CREATE TABLE IF NOT EXISTS backrooms_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL UNIQUE,
                identity_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                level_id TEXT,
                contribution_delta INTEGER NOT NULL DEFAULT 0,
                server_validated INTEGER NOT NULL DEFAULT 1,
                payload_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(identity_id) REFERENCES backrooms_identities(id)
            );
            CREATE INDEX IF NOT EXISTS idx_backrooms_events_identity
                ON backrooms_events(identity_id, event_type);
            CREATE TABLE IF NOT EXISTS meg_promotion_applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identity_id INTEGER NOT NULL,
                from_rank TEXT NOT NULL,
                to_rank TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reasons_json TEXT,
                reviewed_by TEXT,
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(identity_id) REFERENCES backrooms_identities(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_meg_one_pending_promotion
                ON meg_promotion_applications(identity_id, to_rank)
                WHERE status = 'pending';
            CREATE TABLE IF NOT EXISTS meg_supervisor_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                identity_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                assigned_at TEXT NOT NULL,
                archived_at TEXT,
                FOREIGN KEY(identity_id) REFERENCES backrooms_identities(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_meg_active_supervisor_identity
                ON meg_supervisor_slots(identity_id) WHERE status = 'active';
            CREATE TABLE IF NOT EXISTS meg_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_identity_id INTEGER NOT NULL,
                target_identity_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                details TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                requires_admin INTEGER NOT NULL DEFAULT 0,
                resolution TEXT,
                reviewed_by TEXT,
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(reporter_identity_id) REFERENCES backrooms_identities(id),
                FOREIGN KEY(target_identity_id) REFERENCES backrooms_identities(id)
            );
            CREATE TABLE IF NOT EXISTS meg_evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                evidence_type TEXT NOT NULL,
                content TEXT NOT NULL,
                event_id TEXT,
                server_validated INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(report_id) REFERENCES meg_reports(id)
            );
            CREATE TABLE IF NOT EXISTS meg_sanctions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identity_id INTEGER NOT NULL,
                report_id INTEGER,
                action TEXT NOT NULL,
                reason TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                lifted_at TEXT,
                FOREIGN KEY(identity_id) REFERENCES backrooms_identities(id),
                FOREIGN KEY(report_id) REFERENCES meg_reports(id)
            );
            CREATE TABLE IF NOT EXISTS meg_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                details_json TEXT,
                created_at TEXT NOT NULL
            );
            """
        )


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
        "selectedMapId": "test",
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
        sid = raw.get("selectedMapId")
        if sid == "test":
            state["selectedMapId"] = sid
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


def end_online_session(session_id: int, ended_at: Optional[str] = None) -> None:
    with connect() as conn:
        conn.execute(
            """
            UPDATE online_sessions
            SET ended_at = ?
            WHERE id = ? AND ended_at IS NULL
            """,
            (ended_at or _utc_now(), session_id),
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


def _migrate_market_stock_table() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS market_stock (
                product_id TEXT PRIMARY KEY,
                quantity INTEGER NOT NULL DEFAULT 5
            )
            """
        )


def _market_catalog():
    """每次读取最新商品表，避免新增商品后必须重启进程。"""
    import importlib
    import market_catalog

    importlib.reload(market_catalog)
    return market_catalog


def ensure_market_stock() -> None:
    mc = _market_catalog()

    with connect() as conn:
        for pid in mc.MARKET_PRODUCT_IDS:
            conn.execute(
                """
                INSERT OR IGNORE INTO market_stock (product_id, quantity)
                VALUES (?, ?)
                """,
                (pid, mc.MARKET_DEFAULT_STOCK),
            )


def get_market_stock() -> Dict[str, int]:
    ensure_market_stock()
    with connect() as conn:
        rows = conn.execute(
            "SELECT product_id, quantity FROM market_stock ORDER BY product_id"
        ).fetchall()
    return {str(r["product_id"]): max(0, int(r["quantity"])) for r in rows}


def get_market_stock_summary() -> Dict[str, Any]:
    stock = get_market_stock()
    total_units = sum(stock.values())
    sold_out_count = sum(1 for qty in stock.values() if qty <= 0)
    return {
        "productCount": len(stock),
        "totalUnits": total_units,
        "soldOutCount": sold_out_count,
        "stock": stock,
    }


def try_consume_market_stock(product_id: str) -> Tuple[bool, str]:
    mc = _market_catalog()

    pid = (product_id or "").strip()
    if pid not in mc.MARKET_PRODUCT_IDS:
        return False, "商品不存在"
    ensure_market_stock()
    with connect() as conn:
        row = conn.execute(
            "SELECT quantity FROM market_stock WHERE product_id = ?",
            (pid,),
        ).fetchone()
        if not row or int(row["quantity"]) <= 0:
            return False, "已售罄"
        cur = conn.execute(
            """
            UPDATE market_stock
            SET quantity = quantity - 1
            WHERE product_id = ? AND quantity > 0
            """,
            (pid,),
        )
        if cur.rowcount == 0:
            return False, "已售罄"
    return True, ""


def restock_market(amount: int) -> Dict[str, int]:
    mc = _market_catalog()

    if amount <= 0:
        return get_market_stock()
    ensure_market_stock()
    with connect() as conn:
        for pid in mc.MARKET_PRODUCT_IDS:
            conn.execute(
                """
                UPDATE market_stock
                SET quantity = quantity + ?
                WHERE product_id = ?
                """,
                (amount, pid),
            )
    return get_market_stock()


def reset_market_stock() -> Dict[str, int]:
    mc = _market_catalog()

    ensure_market_stock()
    with connect() as conn:
        for pid in mc.MARKET_PRODUCT_IDS:
            conn.execute(
                """
                UPDATE market_stock
                SET quantity = ?
                WHERE product_id = ?
                """,
                (mc.MARKET_DEFAULT_STOCK, pid),
            )
    return get_market_stock()


# --------------------------- Backrooms M.E.G. governance ---------------------------

MEG_RANKS = (
    "none", "volunteer", "trainee", "member", "senior",
    "lead", "officer", "clearance", "supervisor",
)
MEG_DEPARTMENTS = ("explore", "security", "logistics", "research")
MEG_EVENT_CONTRIBUTION = {
    "task_complete": 25,
    "task_failed": -5,
    "death": -10,
    "level_enter": 2,
    "c101_archive": 40,
    "c101_submit": 0,
    "high_risk_complete": 50,
    "base_assault": -250,
    "civilian_assault": -40,
    "entity_neutralized": 20,
    "rescue_complete": 35,
    "supply_delivered": 15,
}
MEG_HIGH_RISK_EVENTS = ("high_risk_complete", "entity_neutralized", "rescue_complete")
MEG_TASK_IDS = {
    "package_l1", "map_l21", "recon_c1291", "inspect_coolers", "map_l13",
    "rubbing_c1290", "docs_c1292", "sample_c144_collapse",
    "recon_c144_mutant", "loop_c192", "sample_c1299_fog",
    "beacon_c1299", "pages_c1299", "fasting_cruise",
}
MEG_HIGH_RISK_TASK_IDS = {
    "recon_c1291", "rubbing_c1290", "docs_c1292", "sample_c144_collapse",
    "recon_c144_mutant", "loop_c192", "sample_c1299_fog",
    "beacon_c1299", "pages_c1299",
}


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_backrooms_identity(display_name: str) -> Tuple[str, int]:
    token = secrets.token_urlsafe(32)
    now = _utc_now()
    with connect() as conn:
        cur = conn.execute(
            """INSERT INTO backrooms_identities
               (token_hash, display_name, created_at, last_seen_at)
               VALUES (?, ?, ?, ?)""",
            (_token_hash(token), display_name.strip(), now, now),
        )
        identity_id = int(cur.lastrowid)
        conn.execute(
            """INSERT INTO meg_profiles
               (identity_id, rank, contribution, status, updated_at)
               VALUES (?, 'none', 0, 'active', ?)""",
            (identity_id, now),
        )
    return token, identity_id


def get_backrooms_identity(token: str) -> Optional[sqlite3.Row]:
    if not token:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM backrooms_identities WHERE token_hash = ?",
            (_token_hash(token),),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE backrooms_identities SET last_seen_at = ? WHERE id = ?",
                (_utc_now(), int(row["id"])),
            )
        return row


def update_backrooms_display_name(identity_id: int, display_name: str) -> bool:
    value = (display_name or "").strip()
    if len(value) < 2 or len(value) > 24:
        return False
    with connect() as conn:
        cur = conn.execute(
            "UPDATE backrooms_identities SET display_name=?,last_seen_at=? WHERE id=?",
            (value, _utc_now(), identity_id),
        )
        return cur.rowcount > 0


def set_meg_department(identity_id: int, department: str) -> bool:
    if department not in MEG_DEPARTMENTS:
        return False
    with connect() as conn:
        cur = conn.execute(
            "UPDATE meg_profiles SET department = ?, updated_at = ? WHERE identity_id = ?",
            (department, _utc_now(), identity_id),
        )
        return cur.rowcount > 0


def record_backrooms_event(
    identity_id: int,
    event_id: str,
    event_type: str,
    level_id: Optional[str],
    payload: Dict[str, Any],
) -> Tuple[bool, bool]:
    """Return (accepted, duplicate); event values are fixed server-side."""
    if event_type not in MEG_EVENT_CONTRIBUTION:
        return False, False
    delta = MEG_EVENT_CONTRIBUTION[event_type]
    stored_event_id = f"{identity_id}:{event_id}"
    now = _utc_now()
    try:
        with connect() as conn:
            profile = conn.execute(
                "SELECT rank,status FROM meg_profiles WHERE identity_id=?", (identity_id,)
            ).fetchone()
            if not profile:
                return False, False
            task_id = str(payload.get("taskId") or "")
            if event_type in ("task_complete", "task_failed") and task_id not in MEG_TASK_IDS:
                return False, False
            if event_type == "high_risk_complete" and task_id not in MEG_HIGH_RISK_TASK_IDS:
                return False, False
            if event_type == "level_enter" and not level_id:
                return False, False
            if event_type == "c101_archive":
                if profile["rank"] not in ("clearance", "supervisor"):
                    return False, False
                if str(payload.get("archiveId") or "") not in ("A", "B", "E", "F"):
                    return False, False
            if event_type == "c101_submit":
                if profile["rank"] != "supervisor" or profile["status"] != "active":
                    return False, False
                open_case = conn.execute(
                    """SELECT 1 FROM meg_reports WHERE target_identity_id=?
                       AND status IN ('pending','investigating') LIMIT 1""",
                    (identity_id,),
                ).fetchone()
                if open_case:
                    return False, False
            conn.execute(
                """INSERT INTO backrooms_events
                   (event_id, identity_id, event_type, level_id,
                    contribution_delta, server_validated, payload_json, created_at)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (
                    stored_event_id,
                    identity_id,
                    event_type,
                    (level_id or "")[:64] or None,
                    delta,
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":"))[:4000],
                    now,
                ),
            )
            conn.execute(
                """UPDATE meg_profiles
                   SET contribution = MAX(0, contribution + ?), updated_at = ?
                   WHERE identity_id = ?""",
                (delta, now, identity_id),
            )
        return True, False
    except sqlite3.IntegrityError:
        with connect() as conn:
            row = conn.execute(
                "SELECT identity_id FROM backrooms_events WHERE event_id = ?",
                (stored_event_id,),
            ).fetchone()
        return bool(row and int(row["identity_id"]) == identity_id), True


def _meg_stats(conn: sqlite3.Connection, identity_id: int) -> Dict[str, int]:
    row = conn.execute(
        """SELECT
             SUM(CASE WHEN event_type='task_complete' THEN 1 ELSE 0 END) tasks,
             SUM(CASE WHEN event_type='task_failed' THEN 1 ELSE 0 END) failures,
             SUM(CASE WHEN event_type='death' THEN 1 ELSE 0 END) deaths,
             SUM(CASE WHEN event_type IN ('high_risk_complete',
                 'entity_neutralized','rescue_complete') THEN 1 ELSE 0 END) high_risk,
             SUM(CASE WHEN event_type='c101_archive' THEN 1 ELSE 0 END) c101_archives,
             COUNT(DISTINCT CASE WHEN event_type='level_enter' THEN level_id END) footprints
           FROM backrooms_events WHERE identity_id = ?""",
        (identity_id,),
    ).fetchone()
    return {key: int(row[key] or 0) for key in row.keys()}


_MEG_REQUIREMENTS = {
    "volunteer": {"contribution": 25, "tasks": 1, "footprints": 1},
    "trainee": {"contribution": 75, "tasks": 3, "footprints": 2},
    "member": {"contribution": 180, "tasks": 6, "footprints": 3, "department": True},
    "senior": {"contribution": 350, "tasks": 10, "high_risk": 1, "footprints": 4},
    "lead": {"contribution": 600, "tasks": 14, "high_risk": 2, "footprints": 6},
    "officer": {"contribution": 900, "tasks": 18, "high_risk": 2, "footprints": 7,
                "failures_max": 4},
    "clearance": {"contribution": 1200, "tasks": 22, "high_risk": 3, "footprints": 9,
                  "failures_max": 3, "deaths_max": 5, "clean_record": True},
    "supervisor": {"contribution": 1500, "tasks": 25, "high_risk": 3, "footprints": 10,
                   "failures_max": 2, "deaths_max": 3, "c101_archives": 4,
                   "clean_record": True},
}


def _eligibility(
    profile: sqlite3.Row, stats: Dict[str, int], target_rank: str, active_sanctions: int,
    open_cases: int,
) -> Tuple[Dict[str, Any], List[str]]:
    req = dict(_MEG_REQUIREMENTS.get(target_rank, {}))
    reasons: List[str] = []
    contribution = int(profile["contribution"])
    labels = {
        "contribution": "职业贡献",
        "tasks": "完成任务",
        "high_risk": "高危行动",
        "footprints": "层级足迹",
        "c101_archives": "C-101 档案阅读",
        "failures": "任务失败",
        "deaths": "死亡次数",
    }
    for name in ("contribution", "tasks", "high_risk", "footprints", "c101_archives"):
        minimum = req.get(name)
        actual = contribution if name == "contribution" else stats.get(name, 0)
        if minimum is not None and actual < minimum:
            label = labels.get(name, name)
            reasons.append(f"{label}需要至少 {minimum}（当前 {actual}）")
    for name in ("failures", "deaths"):
        maximum = req.get(name + "_max")
        actual = stats.get(name, 0)
        if maximum is not None and actual > maximum:
            label = labels.get(name, name)
            reasons.append(f"{label}不得超过 {maximum} 次（当前 {actual}）")
    if req.get("department") and not profile["department"]:
        reasons.append("正式队员晋升前必须选择职务")
    if req.get("clean_record") and active_sanctions:
        reasons.append("存在有效处分")
    if req.get("clean_record") and open_cases:
        reasons.append("存在调查中的案件")
    if int(profile["promotion_frozen"]):
        reasons.append("晋升已被冻结")
    if profile["status"] != "active":
        status_labels = {"active": "正常", "suspended": "停权", "archived": "封存"}
        status = status_labels.get(profile["status"], profile["status"])
        reasons.append(f"档案状态为{status}")
    return req, reasons


def get_meg_profile(identity_id: int) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        row = conn.execute(
            """SELECT p.*, i.display_name FROM meg_profiles p
               JOIN backrooms_identities i ON i.id=p.identity_id
               WHERE p.identity_id=?""",
            (identity_id,),
        ).fetchone()
        if not row:
            return None
        stats = _meg_stats(conn, identity_id)
        sanctions = int(conn.execute(
            "SELECT COUNT(*) n FROM meg_sanctions WHERE identity_id=? AND active=1",
            (identity_id,),
        ).fetchone()["n"])
        cases = int(conn.execute(
            "SELECT COUNT(*) n FROM meg_reports WHERE target_identity_id=? AND status IN ('pending','investigating')",
            (identity_id,),
        ).fetchone()["n"])
        rank = str(row["rank"])
        next_rank = MEG_RANKS[min(MEG_RANKS.index(rank) + 1, len(MEG_RANKS) - 1)]
        requirements, reasons = _eligibility(row, stats, next_rank, sanctions, cases)
        high_risk_effective = rank in ("clearance", "supervisor") and not cases and row["status"] == "active"
        pending = conn.execute(
            """SELECT id, to_rank, status, created_at FROM meg_promotion_applications
               WHERE identity_id=? AND status='pending' ORDER BY id DESC LIMIT 1""",
            (identity_id,),
        ).fetchone()
        return {
            "identityId": identity_id,
            "displayName": row["display_name"],
            "rank": rank,
            "department": row["department"],
            "contribution": int(row["contribution"]),
            "status": row["status"],
            "supervisorCode": row["supervisor_code"],
            "stats": stats,
            "nextRank": next_rank if rank != "supervisor" else None,
            "requirements": requirements if rank != "supervisor" else {},
            "reasons": reasons if rank != "supervisor" else [],
            "eligible": rank != "supervisor" and not reasons,
            "highRiskAuthorityEffective": high_risk_effective,
            "pendingPromotion": dict(pending) if pending else None,
            "activeSanctions": sanctions,
            "openInvestigations": cases,
        }


def apply_meg_promotion(identity_id: int) -> Tuple[bool, str, Optional[int]]:
    profile = get_meg_profile(identity_id)
    if not profile or profile["rank"] == "supervisor":
        return False, "已达到最高职级或档案不存在", None
    target = profile["nextRank"]
    if target == "supervisor":
        with connect() as conn:
            rejected = conn.execute(
                """SELECT reviewed_at FROM meg_promotion_applications
                   WHERE identity_id=? AND to_rank='supervisor' AND status='rejected'
                   ORDER BY id DESC LIMIT 1""",
                (identity_id,),
            ).fetchone()
        rejected_at = _parse_iso(rejected["reviewed_at"]) if rejected else None
        if rejected_at:
            retry_at = rejected_at + timedelta(days=7)
            if datetime.now(timezone.utc) < retry_at:
                return False, f"监督者申请冷却至 {retry_at.replace(microsecond=0).isoformat()}", None
    if profile["reasons"]:
        return False, "；".join(profile["reasons"]), None
    if profile["pendingPromotion"]:
        return False, "已有待处理晋升申请", int(profile["pendingPromotion"]["id"])
    now = _utc_now()
    with connect() as conn:
        if target == "supervisor":
            cur = conn.execute(
                """INSERT INTO meg_promotion_applications
                   (identity_id, from_rank, to_rank, status, reasons_json, created_at)
                   VALUES (?, 'clearance', 'supervisor', 'pending', '[]', ?)""",
                (identity_id, now),
            )
            return True, "监督者申请已进入管理员审批队列", int(cur.lastrowid)
        conn.execute(
            "UPDATE meg_profiles SET rank=?, updated_at=? WHERE identity_id=? AND rank=?",
            (target, now, identity_id, profile["rank"]),
        )
        cur = conn.execute(
            """INSERT INTO meg_promotion_applications
               (identity_id, from_rank, to_rank, status, reasons_json,
                reviewed_by, reviewed_at, created_at)
               VALUES (?, ?, ?, 'approved', '[]', 'system', ?, ?)""",
            (identity_id, profile["rank"], target, now, now),
        )
        return True, f"已晋升为 {target}", int(cur.lastrowid)


def _audit(
    conn: sqlite3.Connection, actor: str, action: str, target_type: str,
    target_id: Any, details: Optional[Dict[str, Any]] = None,
) -> None:
    conn.execute(
        """INSERT INTO meg_audit_log
           (actor, action, target_type, target_id, details_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (actor, action, target_type, str(target_id),
         json.dumps(details or {}, ensure_ascii=False), _utc_now()),
    )


def review_supervisor_application(
    application_id: int, approve: bool, cap: int, actor: str = "admin",
    note: str = "",
) -> Tuple[bool, str]:
    """Allocate E..Y under BEGIN IMMEDIATE; archived codes are never reused."""
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        app_row = conn.execute(
            """SELECT * FROM meg_promotion_applications
               WHERE id=? AND to_rank='supervisor' AND status='pending'""",
            (application_id,),
        ).fetchone()
        if not app_row:
            return False, "申请不存在或已处理"
        identity_id = int(app_row["identity_id"])
        if not approve:
            conn.execute(
                """UPDATE meg_promotion_applications
                   SET status='rejected', reasons_json=?, reviewed_by=?, reviewed_at=? WHERE id=?""",
                (json.dumps([note], ensure_ascii=False) if note else "[]",
                 actor, _utc_now(), application_id),
            )
            _audit(conn, actor, "reject_supervisor", "promotion", application_id, {"note": note})
            return True, "已拒绝监督者申请"
        profile = get_meg_profile(identity_id)
        if not profile or profile["rank"] != "clearance" or profile["reasons"]:
            return False, "申请人当前已不满足监督者资格"
        active_count = int(conn.execute(
            "SELECT COUNT(*) n FROM meg_supervisor_slots WHERE status='active'"
        ).fetchone()["n"])
        if active_count >= cap:
            return False, f"监督者席位已满（{active_count}/{cap}）"
        used = {r["code"] for r in conn.execute("SELECT code FROM meg_supervisor_slots")}
        code = next((chr(n) for n in range(ord("E"), ord("Z")) if chr(n) not in used), None)
        if not code:
            return False, "可分配监督者编号已耗尽"
        now = _utc_now()
        conn.execute(
            "INSERT INTO meg_supervisor_slots(code, identity_id, status, assigned_at) VALUES (?,?,'active',?)",
            (code, identity_id, now),
        )
        conn.execute(
            """UPDATE meg_profiles SET rank='supervisor', supervisor_code=?, updated_at=?
               WHERE identity_id=?""",
            (code, now, identity_id),
        )
        conn.execute(
            """UPDATE meg_promotion_applications SET status='approved',
               reviewed_by=?, reviewed_at=? WHERE id=?""",
            (actor, now, application_id),
        )
        _audit(
            conn, actor, "approve_supervisor", "promotion", application_id,
            {"code": code, "note": note},
        )
        return True, f"已批准并分配监督者席位 {code}"


def recommendation_for_report(reason: str) -> str:
    text = reason.lower()
    rules = (
        (("叛变", "泄密", "滥权", "腐败", "c101_abuse"), "revoke_supervisor"),
        (("伪造", "清除权限", "密级", "rank_forgery"), "revoke_clearance"),
        (("重大失职", "危害基地"), "suspend_supervisor"),
        (("暴力", "袭击", "蓄意伤害", "base_assault"), "demote"),
        (("拒绝命令", "失职", "task_sabotage"), "suspend_role"),
        (("作弊", "虚报", "刷贡献"), "freeze_promotion"),
    )
    for needles, action in rules:
        if any(word in text for word in needles):
            return action
    return "warning"


def create_meg_report(
    reporter_id: int, target_id: int, reason: str, details: str,
    evidence: List[Dict[str, Any]],
) -> Tuple[int, str, bool]:
    with connect() as conn:
        reporter = conn.execute(
            "SELECT rank,status FROM meg_profiles WHERE identity_id=?", (reporter_id,)
        ).fetchone()
        if not reporter or reporter["rank"] == "none" or reporter["status"] != "active":
            raise ValueError("只有在编且未停权的 M.E.G 人员可以提交纪律举报")
        target = conn.execute(
            "SELECT rank FROM meg_profiles WHERE identity_id=?", (target_id,)
        ).fetchone()
        if not target:
            raise ValueError("被举报档案不存在")
        recommendation = recommendation_for_report(reason + " " + details)
        if recommendation in ("revoke_supervisor", "suspend_supervisor") and target["rank"] != "supervisor":
            recommendation = "revoke_clearance" if target["rank"] == "clearance" else "demote"
        if recommendation == "revoke_clearance" and target["rank"] not in ("clearance", "supervisor"):
            recommendation = "demote"
        requires_admin = target["rank"] in ("clearance", "supervisor")
        cur = conn.execute(
            """INSERT INTO meg_reports
               (reporter_identity_id,target_identity_id,reason,details,recommendation,
                status,requires_admin,created_at)
               VALUES (?,?,?,?,?,'pending',?,?)""",
            (reporter_id, target_id, reason, details, recommendation,
             1 if requires_admin else 0, _utc_now()),
        )
        report_id = int(cur.lastrowid)
        for item in evidence[:10]:
            event_id = str(item.get("eventId") or "")[:128] or None
            validated = False
            if event_id:
                event_row = conn.execute(
                    """SELECT event_id FROM backrooms_events
                       WHERE event_id IN (?,?) AND identity_id=? LIMIT 1""",
                    (event_id, f"{target_id}:{event_id}", target_id),
                ).fetchone()
                validated = event_row is not None
                if event_row:
                    event_id = str(event_row["event_id"])
            conn.execute(
                """INSERT INTO meg_evidence
                   (report_id,evidence_type,content,event_id,server_validated,created_at)
                   VALUES (?,?,?,?,?,?)""",
                (report_id, "event" if event_id else "text",
                 str(item.get("content") or "")[:2000], event_id,
                 1 if validated else 0, _utc_now()),
            )
        # 自动关联服务端已有记录。客户端不能把自己的文字陈述伪装成“已证实”。
        reason_key = (reason + " " + details).lower()
        wanted: Tuple[str, ...] = ()
        if any(k in reason_key for k in ("c101", "层级", "终端", "越权")):
            wanted = ("c101_submit",)
        elif any(k in reason_key for k in ("袭击", "暴力", "基地", "伤害")):
            wanted = ("base_assault",)
        elif any(k in reason_key for k in ("任务", "破坏", "失职")):
            wanted = ("task_failed",)
        if wanted:
            marks = ",".join("?" for _ in wanted)
            rows = conn.execute(
                f"""SELECT event_id,event_type,level_id,created_at
                    FROM backrooms_events
                    WHERE identity_id=? AND event_type IN ({marks})
                    ORDER BY id DESC LIMIT 10""",
                (target_id, *wanted),
            ).fetchall()
            existing = {
                str(r["event_id"])
                for r in conn.execute(
                    "SELECT event_id FROM meg_evidence WHERE report_id=? AND event_id IS NOT NULL",
                    (report_id,),
                ).fetchall()
            }
            for row in rows:
                if row["event_id"] in existing:
                    continue
                content = (
                    f"{row['event_type']} · {row['level_id'] or '未知层级'} · "
                    f"{row['created_at']}"
                )
                conn.execute(
                    """INSERT INTO meg_evidence
                       (report_id,evidence_type,content,event_id,server_validated,created_at)
                       VALUES (?,'event',?,?,1,?)""",
                    (report_id, content, row["event_id"], _utc_now()),
                )
        return report_id, recommendation, requires_admin


def _case_dict(conn: sqlite3.Connection, row: sqlite3.Row) -> Dict[str, Any]:
    evidence = conn.execute(
        """SELECT id,evidence_type,content,event_id,server_validated,created_at
           FROM meg_evidence WHERE report_id=? ORDER BY id""", (row["id"],)
    ).fetchall()
    result = dict(row)
    result["requiresAdmin"] = bool(result.pop("requires_admin"))
    result["evidence"] = [
        {
            "id": int(e["id"]), "type": e["evidence_type"], "content": e["content"],
            "eventId": e["event_id"], "serverValidated": bool(e["server_validated"]),
            "createdAt": e["created_at"],
        } for e in evidence
    ]
    return result


def list_meg_cases(identity_id: Optional[int] = None) -> List[Dict[str, Any]]:
    with connect() as conn:
        sql = """SELECT r.*, reporter.display_name reporter_name,
                        target.display_name target_name, p.rank target_rank,
                        p.supervisor_code
                 FROM meg_reports r
                 JOIN backrooms_identities reporter ON reporter.id=r.reporter_identity_id
                 JOIN backrooms_identities target ON target.id=r.target_identity_id
                 JOIN meg_profiles p ON p.identity_id=r.target_identity_id"""
        args: Tuple[Any, ...] = ()
        if identity_id is not None:
            sql += " WHERE r.reporter_identity_id=? OR r.target_identity_id=?"
            args = (identity_id, identity_id)
        sql += " ORDER BY r.id DESC"
        return [_case_dict(conn, row) for row in conn.execute(sql, args).fetchall()]


def list_reviewable_meg_cases(reviewer_id: int) -> List[Dict[str, Any]]:
    profile = get_meg_profile(reviewer_id)
    if (
        not profile
        or profile["rank"] not in ("clearance", "supervisor")
        or not profile["highRiskAuthorityEffective"]
    ):
        return []
    with connect() as conn:
        rows = conn.execute(
            """SELECT r.*, reporter.display_name reporter_name,
                      target.display_name target_name, p.rank target_rank,
                      p.supervisor_code
               FROM meg_reports r
               JOIN backrooms_identities reporter ON reporter.id=r.reporter_identity_id
               JOIN backrooms_identities target ON target.id=r.target_identity_id
               JOIN meg_profiles p ON p.identity_id=r.target_identity_id
               WHERE r.status='pending' AND r.requires_admin=0
                 AND r.reporter_identity_id<>? AND r.target_identity_id<>?
               ORDER BY r.id""",
            (reviewer_id, reviewer_id),
        ).fetchall()
        return [_case_dict(conn, row) for row in rows]


def review_meg_case_as_player(
    reviewer_id: int, report_id: int, decision: str, action: Optional[str], note: str,
) -> Tuple[bool, str]:
    profile = get_meg_profile(reviewer_id)
    if (
        not profile
        or profile["rank"] not in ("clearance", "supervisor")
        or not profile["highRiskAuthorityEffective"]
    ):
        return False, "数据库审批权限不足或已被暂停"
    with connect() as conn:
        report = conn.execute(
            """SELECT reporter_identity_id,target_identity_id,requires_admin,status
               FROM meg_reports WHERE id=?""",
            (report_id,),
        ).fetchone()
    if not report or report["status"] != "pending":
        return False, "案件不存在或已处理"
    if int(report["requires_admin"]):
        return False, "数据库授权员或监督者案件必须由管理员审批"
    if reviewer_id in (int(report["reporter_identity_id"]), int(report["target_identity_id"])):
        return False, "举报者或被举报者不能审批本案"
    if action not in (None, "warning", "freeze_promotion", "suspend_role", "demote"):
        return False, "普通案件不允许执行该处分"
    return review_meg_case(
        report_id, decision, action, note, actor=f"meg:{reviewer_id}"
    )


def get_meg_overview(cap: int) -> Dict[str, Any]:
    with connect() as conn:
        promotions = [
            dict(r) for r in conn.execute(
                """SELECT a.*, i.display_name, p.contribution, p.department
                   FROM meg_promotion_applications a
                   JOIN backrooms_identities i ON i.id=a.identity_id
                   JOIN meg_profiles p ON p.identity_id=a.identity_id
                   WHERE a.to_rank='supervisor' AND a.status='pending'
                   ORDER BY a.id"""
            ).fetchall()
        ]
        slots = [dict(r) for r in conn.execute(
            """SELECT s.*, i.display_name FROM meg_supervisor_slots s
               JOIN backrooms_identities i ON i.id=s.identity_id ORDER BY s.id"""
        ).fetchall()]
        audits = [dict(r) for r in conn.execute(
            "SELECT * FROM meg_audit_log ORDER BY id DESC LIMIT 100"
        ).fetchall()]
        sanctions = [
            dict(r)
            for r in conn.execute(
                """SELECT s.*,i.display_name,p.rank,p.supervisor_code
                   FROM meg_sanctions s
                   JOIN backrooms_identities i ON i.id=s.identity_id
                   JOIN meg_profiles p ON p.identity_id=s.identity_id
                   WHERE s.active=1 ORDER BY s.id DESC"""
            ).fetchall()
        ]
    for item in promotions:
        item["profile"] = get_meg_profile(int(item["identity_id"]))
    return {
        "supervisorCap": cap,
        "activeSupervisorCount": sum(1 for s in slots if s["status"] == "active"),
        "supervisorApplications": promotions,
        "slots": slots,
        "cases": list_meg_cases(),
        "activeSanctions": sanctions,
        "audit": audits,
    }


def lift_meg_sanction(sanction_id: int, actor: str = "admin") -> Tuple[bool, str]:
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM meg_sanctions WHERE id=? AND active=1", (sanction_id,)
        ).fetchone()
        if not row:
            return False, "处分不存在或已经解除"
        identity_id = int(row["identity_id"])
        now = _utc_now()
        conn.execute(
            "UPDATE meg_sanctions SET active=0,lifted_at=? WHERE id=?",
            (now, sanction_id),
        )
        remaining = int(
            conn.execute(
                "SELECT COUNT(*) n FROM meg_sanctions WHERE identity_id=? AND active=1",
                (identity_id,),
            ).fetchone()["n"]
        )
        if remaining == 0:
            conn.execute(
                """UPDATE meg_profiles SET status='active',promotion_frozen=0,updated_at=?
                   WHERE identity_id=?""",
                (now, identity_id),
            )
        _audit(conn, actor, "lift_sanction", "sanction", sanction_id)
        return True, "处分已解除；被降职或被撤销的监督者编号不会自动恢复"


def review_meg_case(
    report_id: int, decision: str, action: Optional[str], note: str,
    actor: str = "admin",
) -> Tuple[bool, str]:
    allowed = {
        "warning", "freeze_promotion", "suspend_role", "demote",
        "revoke_clearance", "suspend_supervisor", "revoke_supervisor",
    }
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        report = conn.execute(
            "SELECT * FROM meg_reports WHERE id=? AND status IN ('pending','investigating')",
            (report_id,),
        ).fetchone()
        if not report:
            return False, "案件不存在或已结案"
        if decision == "dismiss":
            conn.execute(
                """UPDATE meg_reports SET status='dismissed',resolution=?,
                   reviewed_by=?,reviewed_at=? WHERE id=?""",
                (note, actor, _utc_now(), report_id),
            )
            _audit(conn, actor, "dismiss_case", "report", report_id, {"note": note})
            return True, "案件已驳回"
        if decision == "investigate":
            conn.execute(
                """UPDATE meg_reports SET status='investigating',resolution=?,
                   reviewed_by=?,reviewed_at=? WHERE id=?""",
                (note, actor, _utc_now(), report_id),
            )
            _audit(conn, actor, "request_case_evidence", "report", report_id, {"note": note})
            return True, "案件已转为补充调查"
        chosen = action or report["recommendation"]
        if decision != "sanction" or chosen not in allowed:
            return False, "无效裁决或处分"
        target_id = int(report["target_identity_id"])
        target_rank = str(
            conn.execute(
                "SELECT rank FROM meg_profiles WHERE identity_id=?", (target_id,)
            ).fetchone()["rank"]
        )
        if chosen == "revoke_clearance" and target_rank not in ("clearance", "supervisor"):
            return False, "被举报者没有可撤销的数据库权限"
        if chosen in ("suspend_supervisor", "revoke_supervisor") and target_rank != "supervisor":
            return False, "该处分只适用于监督者"
        if chosen == "demote" and target_rank == "none":
            return False, "流浪者没有可降低的 M.E.G 职级"
        now = _utc_now()
        conn.execute(
            """INSERT INTO meg_sanctions(identity_id,report_id,action,reason,created_at)
               VALUES (?,?,?,?,?)""",
            (target_id, report_id, chosen, note or report["reason"], now),
        )
        if chosen == "freeze_promotion":
            conn.execute(
                "UPDATE meg_profiles SET promotion_frozen=1,updated_at=? WHERE identity_id=?",
                (now, target_id),
            )
        elif chosen == "suspend_role":
            conn.execute(
                "UPDATE meg_profiles SET status='suspended',updated_at=? WHERE identity_id=?",
                (now, target_id),
            )
        elif chosen == "demote":
            rank = conn.execute(
                "SELECT rank FROM meg_profiles WHERE identity_id=?", (target_id,)
            ).fetchone()["rank"]
            new_rank = MEG_RANKS[max(0, MEG_RANKS.index(rank) - 1)]
            if rank == "supervisor":
                conn.execute(
                    """UPDATE meg_supervisor_slots SET status='archived',archived_at=?
                       WHERE identity_id=? AND status='active'""",
                    (now, target_id),
                )
            conn.execute(
                """UPDATE meg_profiles SET rank=?,supervisor_code=
                   CASE WHEN ?='supervisor' THEN NULL ELSE supervisor_code END,
                   updated_at=? WHERE identity_id=?""",
                (new_rank, rank, now, target_id),
            )
        elif chosen == "revoke_clearance":
            conn.execute(
                """UPDATE meg_supervisor_slots SET status='archived',archived_at=?
                   WHERE identity_id=? AND status='active'""",
                (now, target_id),
            )
            conn.execute(
                """UPDATE meg_profiles SET rank='officer',status='active',
                   supervisor_code=NULL,updated_at=? WHERE identity_id=?""",
                (now, target_id),
            )
        elif chosen == "suspend_supervisor":
            conn.execute(
                "UPDATE meg_profiles SET status='suspended',updated_at=? WHERE identity_id=?",
                (now, target_id),
            )
        elif chosen == "revoke_supervisor":
            conn.execute(
                """UPDATE meg_supervisor_slots SET status='archived',archived_at=?
                   WHERE identity_id=? AND status='active'""", (now, target_id)
            )
            conn.execute(
                """UPDATE meg_profiles SET rank='clearance',status='active',
                   supervisor_code=NULL,updated_at=? WHERE identity_id=?""",
                (now, target_id),
            )
        conn.execute(
            """UPDATE meg_reports SET status='sanctioned',resolution=?,
               reviewed_by=?,reviewed_at=? WHERE id=?""",
            (chosen + (": " + note if note else ""), actor, now, report_id),
        )
        _audit(conn, actor, "sanction_case", "report", report_id,
               {"action": chosen, "note": note})
        return True, f"已执行处分：{chosen}"

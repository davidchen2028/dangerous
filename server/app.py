#!/usr/bin/env python3
"""
极危行动 — 联机大厅服务器
- 昵称 + 密码注册/登录（会话 token）
- 好友：搜索、申请、同意；在线状态
- 各自 6×10 仓库云端同步（SQLite）
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from datetime import datetime, timezone

from flask import Flask, jsonify, make_response, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import check_password_hash, generate_password_hash

import db
import client_pack

ROOT = Path(__file__).resolve().parent.parent
LOBBY_ROOM = "lobby"
NICKNAME_RE = re.compile(r"^[\w\u4e00-\u9fff\-]{2,16}$", re.UNICODE)
MIN_PASSWORD_LEN = 6
ADMIN_KEY = os.environ.get("JIWEI_ADMIN_KEY", "").strip()
ADMIN_LOCAL_ONLY = os.environ.get("JIWEI_ADMIN_LOCAL_ONLY", "").strip().lower() in (
    "1",
    "true",
    "yes",
)


def _supervisor_cap() -> int:
    try:
        value = int(os.environ.get("BACKROOMS_SUPERVISOR_CAP", "3"))
    except ValueError:
        value = 3
    return max(2, min(5, value))

# NPC 自由对话：密钥只存在服务端环境变量里，绝不下发给浏览器。
AI_API_BASE = os.environ.get("JIWEI_AI_BASE", "https://api.silra.cn/v1").strip().rstrip("/")
AI_API_KEY = os.environ.get("JIWEI_AI_KEY", "").strip()
AI_MODEL = os.environ.get("JIWEI_AI_MODEL", "deepseek-v3").strip()
# 默认允许未登录聊天（后室可单机玩）；要强制登录时设 JIWEI_AI_REQUIRE_LOGIN=1
AI_REQUIRE_LOGIN = os.environ.get("JIWEI_AI_REQUIRE_LOGIN", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
try:
    AI_RATE_PER_MIN = max(1, int(os.environ.get("JIWEI_AI_RATE_PER_MIN", "20")))
except ValueError:
    AI_RATE_PER_MIN = 20

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "jiwei-lobby-dev")
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_interval=25,
    ping_timeout=60,
)

# sid -> { user_id, nickname, token }
sessions_by_sid: Dict[str, dict] = {}
# user_id -> sid（单设备在线，新登录顶掉旧连接）
sid_by_user_id: Dict[int, str] = {}


def _no_cache(resp: Any) -> Any:
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


def _immutable_cache(resp: Any) -> Any:
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


def _short_cache(resp: Any) -> Any:
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


def _validate_nickname(nickname: str) -> Optional[str]:
    n = (nickname or "").strip()
    if not n:
        return "请输入昵称"
    if len(n) < 2 or len(n) > 16:
        return "昵称须 2～16 个字符"
    if not NICKNAME_RE.match(n):
        return "昵称仅支持中文、字母、数字、下划线、连字符"
    return None


def _validate_password(password: str) -> Optional[str]:
    if not password or len(password) < MIN_PASSWORD_LEN:
        return f"密码至少 {MIN_PASSWORD_LEN} 位"
    if len(password) > 64:
        return "密码过长"
    return None


def _public_user(user_row: Any, online: bool = False) -> dict:
    return {
        "id": user_row["id"],
        "nickname": user_row["nickname"],
        "online": online,
    }


def _friends_payload(user_id: int) -> dict:
    friends = []
    for f in db.list_friends(user_id):
        fid = int(f["id"])
        friends.append(
            {
                "id": fid,
                "nickname": f["nickname"],
                "online": fid in sid_by_user_id,
            }
        )
    incoming = db.list_incoming_requests(user_id)
    return {"friends": friends, "incomingRequests": incoming}


def _emit_auth_ok(sid: str, user_row: Any, token: str, message: str = "") -> None:
    uid = int(user_row["id"])
    payload = {
        "token": token,
        "user": _public_user(user_row, online=True),
        "playerState": db.get_player_state(uid),
        "message": message,
        **_friends_payload(uid),
    }
    emit("auth_ok", payload, room=sid)


def _notify_friends_presence(user_id: int, online: bool) -> None:
    user = db.get_user_by_id(user_id)
    if not user:
        return
    for f in db.list_friends(user_id):
        fid = int(f["id"])
        fsid = sid_by_user_id.get(fid)
        if not fsid:
            continue
        socketio.emit(
            "friend_presence",
            {
                "userId": user_id,
                "nickname": user["nickname"],
                "online": online,
            },
            room=fsid,
        )


def _push_friends_update(user_id: int) -> None:
    sid = sid_by_user_id.get(user_id)
    if sid:
        socketio.emit("friends_updated", _friends_payload(user_id), room=sid)


def _secret_equal(candidate: str, expected: str) -> bool:
    """按字节做等时比较：compare_digest 遇到非 ASCII 字符串会抛 TypeError。"""
    return secrets.compare_digest(
        (candidate or "").encode("utf-8"), (expected or "").encode("utf-8")
    )


def _admin_key_ok(key: str) -> bool:
    if not ADMIN_KEY:
        return False
    if ADMIN_LOCAL_ONLY and request.remote_addr not in ("127.0.0.1", "::1"):
        return False
    return _secret_equal(key, ADMIN_KEY)


def _admin_password_ok(password: str) -> bool:
    if not ADMIN_KEY:
        return False
    return _secret_equal(password, ADMIN_KEY)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return db.normalize_ip(forwarded)
    return db.normalize_ip(request.remote_addr or "")


def _ip_ban_error() -> Optional[str]:
    return db.get_active_ip_ban_message(_client_ip())


def _touch_user_ip(user_id: int) -> None:
    db.update_user_last_ip(user_id, _client_ip())


def _parse_client_device(data: Optional[dict]) -> str:
    raw = ""
    if data:
        raw = (data.get("clientDevice") or "").strip().lower()
    if raw in ("mobile", "tablet", "desktop"):
        return raw

    ua = request.headers.get("User-Agent", "")
    if "iPad" in ua or ("Macintosh" in ua and "Mobile" in ua):
        return "tablet"
    if any(token in ua for token in ("iPhone", "iPod", "Android")):
        return "mobile"
    return "desktop"


def _touch_user_session_meta(user_id: int, data: Optional[dict]) -> str:
    _touch_user_ip(user_id)
    device = _parse_client_device(data)
    db.update_user_last_client_device(user_id, device)
    return device


def _enrich_user_stats_with_client_device(stats: list) -> None:
    for row in stats:
        uid = int(row["userId"])
        fallback = row.get("lastClientDevice") or "desktop"
        sid = sid_by_user_id.get(uid)
        if sid:
            sess = sessions_by_sid.get(sid) or {}
            row["clientDevice"] = sess.get("client_device") or fallback
        else:
            row["clientDevice"] = fallback


def _kick_all_on_ip(ip: str, message: str) -> int:
    uids = db.get_user_ids_by_last_ip(ip)
    for uid in uids:
        _disconnect_user(uid, message)
    return len(uids)


def _bind_session(
    sid: str,
    user_id: int,
    nickname: str,
    token: str,
    client_device: str = "desktop",
) -> None:
    old_sid = sid_by_user_id.get(user_id)
    if old_sid and old_sid != sid:
        old_sess = sessions_by_sid.pop(old_sid, None)
        leave_room(old_sid)
        if old_sess and old_sess.get("online_session_id"):
            db.end_online_session(old_sess["online_session_id"])
        socketio.emit("auth_kicked", {"message": "账号在其他窗口登录"}, room=old_sid)

    db.end_open_sessions_for_user(user_id)
    online_session_id = db.start_online_session(user_id)

    sessions_by_sid[sid] = {
        "user_id": user_id,
        "nickname": nickname,
        "token": token,
        "online_session_id": online_session_id,
        "client_device": client_device,
    }
    sid_by_user_id[user_id] = sid
    join_room(LOBBY_ROOM, sid=sid)


def _unbind_session(sid: str) -> Optional[dict]:
    sess = sessions_by_sid.pop(sid, None)
    if not sess:
        return None
    if sess.get("online_session_id"):
        db.end_online_session(sess["online_session_id"])
    uid = sess["user_id"]
    if sid_by_user_id.get(uid) == sid:
        sid_by_user_id.pop(uid, None)
    leave_room(LOBBY_ROOM, sid=sid)
    return sess


def _disconnect_user(
    user_id: int, message: str, *, notify_game_server: bool = True
) -> bool:
    """踢下线：清会话 token、断开 Socket，按账号不按 IP。"""
    db.delete_all_user_sessions(user_id)
    if notify_game_server:
        db.request_kick(user_id, message)
    was_online = False
    sid = sid_by_user_id.get(user_id)
    if sid:
        was_online = True
        socketio.emit("auth_kicked", {"message": message}, to=sid)
        try:
            socketio.server.disconnect(sid)
        except Exception:
            pass
        _unbind_session(sid)
    else:
        db.end_open_sessions_for_user(user_id)
    return was_online


def _poll_admin_kick_requests() -> None:
    """游戏服（8080）轮询：执行 8082 管理端发起的踢下线。"""
    while True:
        socketio.sleep(1)
        for user_id in list(sid_by_user_id.keys()):
            kick_msg = db.consume_kick_request(user_id)
            if kick_msg:
                _disconnect_user(
                    user_id,
                    kick_msg,
                    notify_game_server=False,
                )


@app.route("/")
def index() -> Any:
    if app.config.get("ADMIN_ONLY"):
        return make_response(
            "极危行动 — 在线统计管理端（8082）\n"
            "请打开 /admin/online-stats?key=你的管理密钥\n",
            200,
            {"Content-Type": "text/plain; charset=utf-8"},
        )
    return _no_cache(make_response(send_from_directory(ROOT, "index.html")))


@app.route("/admin/online-stats")
def admin_online_stats_page() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return make_response("403 Forbidden — 未配置或密钥错误", 403)
    return _no_cache(
        make_response(send_from_directory(ROOT / "admin", "online-stats.html"))
    )


@app.route("/admin/meg-governance")
def admin_meg_governance_page() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return make_response("403 Forbidden — 未配置或密钥错误", 403)
    return _no_cache(
        make_response(send_from_directory(ROOT / "admin", "meg-governance.html"))
    )


@app.route("/api/admin/user-online-stats")
def api_admin_user_online_stats() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    try:
        online_ids = db.get_online_user_ids_from_db() | set(sid_by_user_id.keys())
        stats = db.list_users_online_stats(online_ids)
        _enrich_user_stats_with_client_device(stats)
        return jsonify(
            {
                "generatedAt": datetime.now(timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "onlineCount": len(sid_by_user_id),
                "userCount": len(stats),
                "users": stats,
                "bannedIps": db.list_active_banned_ips(),
                "marketStock": db.get_market_stock_summary(),
            }
        )
    except Exception as exc:
        return jsonify({"error": "stats_failed", "message": str(exc)}), 500


@app.route("/api/admin/kick", methods=["POST"])
def api_admin_kick() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("userId", 0))
    if user_id <= 0:
        return jsonify({"ok": False, "message": "无效用户"}), 400
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"ok": False, "message": "用户不存在"}), 404
    online = _disconnect_user(user_id, "你已被管理员踢下线")
    return jsonify(
        {
            "ok": True,
            "message": f"已踢下线：{user['nickname']}",
            "wasOnline": online,
        }
    )


@app.route("/api/admin/ban", methods=["POST"])
def api_admin_ban() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("userId", 0))
    days = int(data.get("days", 1))
    if user_id <= 0:
        return jsonify({"ok": False, "message": "无效用户"}), 400
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"ok": False, "message": "用户不存在"}), 404
    banned_until = db.ban_user_days(user_id, days=days)
    if not banned_until:
        return jsonify({"ok": False, "message": "封禁失败"}), 500
    hint = banned_until.replace("T", " ")[:16] + " (UTC)"
    msg = f"账号已封禁 {days} 天，至 {hint} 前无法登录"
    online = _disconnect_user(user_id, msg)
    return jsonify(
        {
            "ok": True,
            "message": f"已封禁 {user['nickname']} {days} 天",
            "bannedUntil": banned_until,
            "wasOnline": online,
        }
    )


@app.route("/api/admin/unban", methods=["POST"])
def api_admin_unban() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("userId", 0))
    if user_id <= 0:
        return jsonify({"ok": False, "message": "无效用户"}), 400
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"ok": False, "message": "用户不存在"}), 404
    if not db.clear_user_ban(user_id):
        return jsonify({"ok": False, "message": "用户未被封禁"}), 400
    return jsonify({"ok": True, "message": f"已解封：{user['nickname']}"})


@app.route("/api/admin/ban-ip", methods=["POST"])
def api_admin_ban_ip() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("userId", 0))
    days = int(data.get("days", 1))
    ip = db.normalize_ip(data.get("ip", ""))
    if user_id > 0:
        user = db.get_user_by_id(user_id)
        if not user:
            return jsonify({"ok": False, "message": "用户不存在"}), 404
        ip = db.normalize_ip(user["last_ip"] if "last_ip" in user.keys() else "")
        nickname = user["nickname"]
    else:
        nickname = None
    if not ip:
        return jsonify({"ok": False, "message": "无可用 IP（用户尚未登录过）"}), 400
    if db.is_protected_ip(ip):
        return jsonify({"ok": False, "message": "不能封禁本机地址 127.0.0.1"}), 400
    banned_until = db.ban_ip_days(ip, days=days)
    if not banned_until:
        return jsonify({"ok": False, "message": "封禁 IP 失败"}), 500
    hint = banned_until.replace("T", " ")[:16] + " (UTC)"
    msg = f"IP {ip} 已封禁 {days} 天，至 {hint} 前无法连接"
    kicked = _kick_all_on_ip(ip, msg)
    label = nickname or ip
    return jsonify(
        {
            "ok": True,
            "message": f"已封禁 IP（{label}）{days} 天，影响 {kicked} 个在线连接",
            "ip": ip,
            "bannedUntil": banned_until,
            "kickedCount": kicked,
        }
    )


@app.route("/api/admin/unban-ip", methods=["POST"])
def api_admin_unban_ip() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    ip = db.normalize_ip(data.get("ip", ""))
    user_id = int(data.get("userId", 0))
    if not ip and user_id > 0:
        user = db.get_user_by_id(user_id)
        if user:
            ip = db.normalize_ip(user["last_ip"] if "last_ip" in user.keys() else "")
    if not ip:
        return jsonify({"ok": False, "message": "缺少 IP"}), 400
    if not db.clear_ip_ban(ip):
        return jsonify({"ok": False, "message": "该 IP 未在封禁列表"}), 400
    return jsonify({"ok": True, "message": f"已解封 IP：{ip}"})


@app.route("/api/admin/delete-user", methods=["POST"])
def api_admin_delete_user() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("userId", 0))
    admin_password = (data.get("adminPassword") or "").strip()
    if user_id <= 0:
        return jsonify({"ok": False, "message": "无效用户"}), 400
    if not admin_password:
        return jsonify({"ok": False, "message": "请输入管理员密码"}), 400
    if not _admin_password_ok(admin_password):
        return jsonify({"ok": False, "message": "管理员密码错误"}), 403
    user = db.get_user_by_id(user_id)
    if not user:
        return jsonify({"ok": False, "message": "用户不存在"}), 404
    nickname = user["nickname"]
    _disconnect_user(user_id, "账号已被管理员注销")
    ok, msg = db.delete_user(user_id)
    if not ok:
        return jsonify({"ok": False, "message": msg}), 500
    return jsonify({"ok": True, "message": f"已注销账号：{nickname}"})


# --------------------------- Client pack (Service Worker) ---------------------------

@app.route("/api/client-pack")
def api_client_pack() -> Any:
    if app.config.get("ADMIN_ONLY"):
        return make_response("Not Found", 404)
    files = client_pack.list_client_pack_files(ROOT)
    return jsonify(
        {
            "ok": True,
            "version": client_pack.CLIENT_PACK_VERSION,
            "files": files,
            "count": len(files),
        }
    )


@app.route("/api/backrooms/auth", methods=["POST"])
def api_backrooms_auth() -> Any:
    """后室入口的轻量注册/登录；与大厅共用用户、密码和会话 token。"""
    data = request.get_json(silent=True) or {}
    mode = str(data.get("mode") or "login").strip().lower()
    nickname = str(data.get("nickname") or "").strip()
    password = str(data.get("password") or "")

    ip_err = _ip_ban_error()
    if ip_err:
        return jsonify({"ok": False, "message": ip_err}), 403
    if mode not in {"login", "register"}:
        return jsonify({"ok": False, "message": "无效的登录方式"}), 400

    if mode == "register":
        err = _validate_nickname(nickname)
        if err:
            return jsonify({"ok": False, "message": err}), 400
        err = _validate_password(password)
        if err:
            return jsonify({"ok": False, "message": err}), 400
        if db.get_user_by_nickname(nickname):
            return jsonify({"ok": False, "message": "昵称已被注册"}), 409
        user_id = db.create_user(nickname, generate_password_hash(password))
        user = db.get_user_by_id(user_id)
        message = "注册成功"
    else:
        if _validate_nickname(nickname) or not password:
            return jsonify({"ok": False, "message": "昵称或密码错误"}), 401
        user = db.get_user_by_nickname(nickname)
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"ok": False, "message": "昵称或密码错误"}), 401
        ban_msg = db.get_active_ban_message(int(user["id"]))
        if ban_msg:
            return jsonify({"ok": False, "message": ban_msg}), 403
        user_id = int(user["id"])
        message = "登录成功"

    token = secrets.token_urlsafe(32)
    db.create_session(int(user_id), token)
    return jsonify(
        {
            "ok": True,
            "message": message,
            "token": token,
            "user": {
                "id": int(user["id"]),
                "nickname": user["nickname"],
            },
        }
    )


# --------------------------- Backrooms M.E.G. governance ---------------------------

@app.route("/api/backrooms/status")
def api_backrooms_status() -> Any:
    return jsonify(
        {
            "ok": True,
            "megOnline": True,
            "localCareerAvailable": False,
            "locked": False,
            "message": "M.E.G. 职务档案已连接服务器",
        }
    )


def _backrooms_token(data: Optional[dict] = None) -> str:
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if data is None:
        data = request.get_json(silent=True) or {}
    return str(data.get("token") or request.args.get("token", "")).strip()


def _backrooms_identity(data: Optional[dict] = None) -> Any:
    return db.get_backrooms_identity(_backrooms_token(data))


def _identity_error() -> Any:
    return jsonify({"ok": False, "error": "unauthorized", "message": "设备凭证无效"}), 401


@app.route("/api/backrooms/identity", methods=["POST"])
def api_backrooms_identity() -> Any:
    data = request.get_json(silent=True) or {}
    token = _backrooms_token(data)
    if token:
        identity = db.get_backrooms_identity(token)
        if not identity:
            return _identity_error()
        return jsonify(
            {"ok": True, "restored": True, "profile": db.get_meg_profile(int(identity["id"]))}
        )
    display_name = str(data.get("displayName") or "").strip()
    if len(display_name) < 2 or len(display_name) > 24:
        return jsonify({"ok": False, "message": "显示名须为 2～24 个字符"}), 400
    token, identity_id = db.create_backrooms_identity(display_name)
    return jsonify(
        {
            "ok": True,
            "restored": False,
            "token": token,
            "profile": db.get_meg_profile(identity_id),
        }
    ), 201


@app.route("/api/backrooms/profile", methods=["GET", "PATCH"])
def api_backrooms_profile() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    if request.method == "PATCH":
        display_name = str(data.get("displayName") or "").strip()
        if len(display_name) < 2 or len(display_name) > 24:
            return jsonify({"ok": False, "message": "显示名须为 2～24 个字符"}), 400
        db.update_backrooms_display_name(int(identity["id"]), display_name)
    return jsonify({"ok": True, "profile": db.get_meg_profile(int(identity["id"]))})


@app.route("/api/backrooms/event", methods=["POST"])
def api_backrooms_event() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    event_id = str(data.get("eventId") or "").strip()
    event_type = str(data.get("type") or data.get("eventType") or "").strip()
    if not event_id or len(event_id) > 128:
        return jsonify({"ok": False, "message": "eventId 必填且不得超过 128 字符"}), 400
    if event_type not in db.MEG_EVENT_CONTRIBUTION:
        return jsonify(
            {"ok": False, "message": "事件类型不在服务端白名单", "allowed": sorted(db.MEG_EVENT_CONTRIBUTION)}
        ), 400
    accepted, duplicate = db.record_backrooms_event(
        int(identity["id"]),
        event_id,
        event_type,
        str(data.get("levelId") or "") or None,
        data.get("payload") if isinstance(data.get("payload"), dict) else {},
    )
    if not accepted:
        return jsonify({"ok": False, "message": "事件记录失败"}), 400
    return jsonify(
        {
            "ok": True,
            "duplicate": duplicate,
            "serverValidated": True,
            "profile": db.get_meg_profile(int(identity["id"])),
        }
    )


@app.route("/api/backrooms/promotion/apply", methods=["POST"])
def api_backrooms_promotion_apply() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    current_profile = db.get_meg_profile(int(identity["id"]))
    if current_profile and current_profile.get("nextRank") == "volunteer":
        vitals = data.get("vitals") if isinstance(data.get("vitals"), dict) else {}
        try:
            hp = float(vitals.get("hp", 0))
            sanity = float(vitals.get("sanity", 0))
        except (TypeError, ValueError):
            hp = sanity = 0
        if vitals.get("dead") or hp < 70 or sanity < 65:
            return jsonify(
                {
                    "ok": False,
                    "message": "入职体检未通过：生命须至少 70、理智须至少 65，且申请人必须存活",
                    "profile": current_profile,
                }
            ), 409
    department = str(data.get("department") or "").strip().lower()
    if department and not db.set_meg_department(int(identity["id"]), department):
        return jsonify({"ok": False, "message": "无效部门"}), 400
    ok, message, application_id = db.apply_meg_promotion(int(identity["id"]))
    updated_profile = db.get_meg_profile(int(identity["id"]))
    payload = {
        "ok": ok,
        "message": message,
        "applicationId": application_id,
        "pending": bool(updated_profile and updated_profile.get("pendingPromotion")),
        "profile": updated_profile,
    }
    return jsonify(payload), 200 if ok else 409


@app.route("/api/backrooms/department", methods=["GET", "POST"])
def api_backrooms_department() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    if request.method == "GET":
        return jsonify(
            {
                "ok": True,
                "departments": list(db.MEG_DEPARTMENTS),
                "profile": db.get_meg_profile(int(identity["id"])),
            }
        )
    department = str(data.get("department") or "").strip().lower()
    if not db.set_meg_department(int(identity["id"]), department):
        return jsonify(
            {"ok": False, "message": "无效部门", "departments": list(db.MEG_DEPARTMENTS)}
        ), 400
    return jsonify({"ok": True, "profile": db.get_meg_profile(int(identity["id"]))})


@app.route("/api/backrooms/report", methods=["POST"])
def api_backrooms_report() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    try:
        target_id = int(data.get("targetIdentityId", 0))
    except (TypeError, ValueError):
        target_id = 0
    if not target_id and data.get("supervisorCode"):
        code = str(data["supervisorCode"]).strip().upper()
        with db.connect() as conn:
            row = conn.execute(
                "SELECT identity_id FROM meg_supervisor_slots WHERE code=? AND status='active'",
                (code,),
            ).fetchone()
            target_id = int(row["identity_id"]) if row else 0
    reason = str(data.get("reason") or "").strip()
    details = str(data.get("details") or "").strip()
    if target_id <= 0 or target_id == int(identity["id"]):
        return jsonify({"ok": False, "message": "被举报对象无效"}), 400
    if not reason or len(reason) > 200 or len(details) > 4000:
        return jsonify({"ok": False, "message": "举报原因必填，且内容过长"}), 400
    evidence = data.get("evidence") if isinstance(data.get("evidence"), list) else []
    try:
        report_id, recommendation, requires_admin = db.create_meg_report(
            int(identity["id"]), target_id, reason, details, evidence
        )
    except ValueError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 404
    return jsonify(
        {
            "ok": True,
            "caseId": report_id,
            "recommendation": recommendation,
            "requiresAdmin": requires_admin,
            "evidenceStatus": "unverified",
            "profile": db.get_meg_profile(int(identity["id"])),
        }
    ), 201


@app.route("/api/backrooms/cases/mine")
def api_backrooms_cases_mine() -> Any:
    identity = _backrooms_identity()
    if not identity:
        return _identity_error()
    identity_id = int(identity["id"])
    return jsonify(
        {
            "ok": True,
            "cases": db.list_meg_cases(identity_id),
            "profile": db.get_meg_profile(identity_id),
        }
    )


@app.route("/api/backrooms/cases/reviewable")
def api_backrooms_cases_reviewable() -> Any:
    identity = _backrooms_identity()
    if not identity:
        return _identity_error()
    identity_id = int(identity["id"])
    return jsonify(
        {
            "ok": True,
            "cases": db.list_reviewable_meg_cases(identity_id),
            "profile": db.get_meg_profile(identity_id),
        }
    )


@app.route("/api/backrooms/cases/review", methods=["POST"])
def api_backrooms_case_review() -> Any:
    data = request.get_json(silent=True) or {}
    identity = _backrooms_identity(data)
    if not identity:
        return _identity_error()
    try:
        case_id = int(data.get("caseId", 0))
    except (TypeError, ValueError):
        case_id = 0
    decision = str(data.get("decision") or "").strip().lower()
    action = str(data.get("action") or "").strip() or None
    note = str(data.get("note") or "").strip()[:2000]
    ok, message = db.review_meg_case_as_player(
        int(identity["id"]), case_id, decision, action, note
    )
    return jsonify(
        {
            "ok": ok,
            "message": message,
            "profile": db.get_meg_profile(int(identity["id"])),
        }
    ), 200 if ok else 403


@app.route("/api/admin/backrooms/overview")
def api_admin_backrooms_overview() -> Any:
    if not _admin_key_ok(request.args.get("key", "")):
        return jsonify({"error": "forbidden"}), 403
    return jsonify({"ok": True, **db.get_meg_overview(_supervisor_cap())})


@app.route("/api/admin/backrooms/supervisor-review", methods=["POST"])
def api_admin_backrooms_supervisor_review() -> Any:
    if not _admin_key_ok(request.args.get("key", "")):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    try:
        application_id = int(data.get("applicationId", 0))
    except (TypeError, ValueError):
        application_id = 0
    decision = str(data.get("decision") or "").lower()
    note = str(data.get("note") or "").strip()[:2000]
    if application_id <= 0 or decision not in ("approve", "reject"):
        return jsonify({"ok": False, "message": "申请编号或决定无效"}), 400
    ok, message = db.review_supervisor_application(
        application_id, decision == "approve", _supervisor_cap(), note=note
    )
    return jsonify({"ok": ok, "message": message}), 200 if ok else 409


@app.route("/api/admin/backrooms/case-review", methods=["POST"])
def api_admin_backrooms_case_review() -> Any:
    if not _admin_key_ok(request.args.get("key", "")):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    try:
        case_id = int(data.get("caseId", 0))
    except (TypeError, ValueError):
        case_id = 0
    decision = str(data.get("decision") or "").lower()
    action = str(data.get("action") or "").strip() or None
    note = str(data.get("note") or "").strip()[:2000]
    if case_id <= 0:
        return jsonify({"ok": False, "message": "案件编号无效"}), 400
    ok, message = db.review_meg_case(case_id, decision, action, note)
    return jsonify({"ok": ok, "message": message}), 200 if ok else 409


@app.route("/api/admin/backrooms/sanction-lift", methods=["POST"])
def api_admin_backrooms_sanction_lift() -> Any:
    if not _admin_key_ok(request.args.get("key", "")):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    try:
        sanction_id = int(data.get("sanctionId", 0))
    except (TypeError, ValueError):
        sanction_id = 0
    ok, message = db.lift_meg_sanction(sanction_id)
    return jsonify({"ok": ok, "message": message}), 200 if ok else 409


def _broadcast_market_stock() -> None:
    stock = db.get_market_stock()
    socketio.emit("market_stock_updated", {"stock": stock}, room=LOBBY_ROOM)


@app.route("/api/market/stock")
def api_market_stock() -> Any:
    from market_catalog import MARKET_DEFAULT_STOCK

    return jsonify(
        {
            "stock": db.get_market_stock(),
            "defaultStock": MARKET_DEFAULT_STOCK,
        }
    )


@app.route("/api/market/buy", methods=["POST"])
def api_market_buy() -> Any:
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    product_id = (data.get("productId") or "").strip()
    user = db.get_user_by_token(token)
    stock = db.get_market_stock()
    if not user:
        return jsonify({"ok": False, "message": "请先登录", "stock": stock}), 401
    ok, msg = db.try_consume_market_stock(product_id)
    stock = db.get_market_stock()
    if not ok:
        return jsonify({"ok": False, "message": msg, "stock": stock}), 400
    _broadcast_market_stock()
    return jsonify({"ok": True, "productId": product_id, "stock": stock})


# --------------------------- NPC 自由对话代理 ---------------------------
# 浏览器只发「找谁说话 + 说了什么」，密钥留在服务端。
# 人设也放服务端，避免这个接口被当成通用大模型中转来白嫖。

AI_WORLD = (
    "这是《后室》(Backrooms) 世界观的游戏。玩家是误入后室的幸存者。"
    "M.E.G.（探索者组织）负责建立基地、发布任务、收购物资；B.N.T.G. 是做买卖的商人组织。"
    "回答必须很短，最多两三句，用口语化中文，保持角色语气。"
    "不要提到自己是 AI、模型或程序，不要输出括号动作描写，不要使用 Markdown。"
    "谈层级时必须以本游戏已知层级表为准，不要套用外站维基的别的设定。"
    "表里没有的层级就说没确认过，不要编。"
    "【绝对不能兑现的事，聊天里禁止说】"
    "这次「聊聊」只是闲聊，不能真正给东西、收东西、改积分、开门、传送、发任务或成交。"
    "禁止承诺交换、赠送、赊账、折扣、保价、拿某件具体物品来换；禁止编造气球、派对气球等不存在的交易物。"
    "禁止在聊天里报出「XX积分换一瓶/一件」这类假价格；本局聊天改不了积分，也发不出杏仁水。"
    "买卖、出售、收购只通过游戏界面的购买/出售按钮完成；聊天里若被问买卖，只说让玩家用旁边的选项或点背包里的物品，不要自己开条件。"
    "不要假装已经成交、已经给过、已经开门；做不到就明说「聊天给不了，用界面操作」。"
)

# 本游戏已实现层级的简表（名称 + 生存难度 + 一句特征）。
AI_LEVELS = (
    "【已知层级】"
    "枢纽 The Hub：隐秘层级，生存难度 0，无实体的地下公路隧道，门可反复出入。"
    "Level 0：黄色迷宫走廊，生存难度 1。"
    "Level 0.2：灰色镜像迷宫，进门会落顶、墙塌。"
    "Level 1：工业仓库，生存难度 1，有 M.E.G 基地；B.N.T.G. 另有独立基地，与主区域不相通。"
    "Level 1.1 腐败的走廊：五个区域，总体生存难度「变化」（洁白走廊 0 / 其后升高到死区）。"
    "Level 2：蒸汽管道，生存难度 2，很暗，夜视药水有用。"
    "Level 3：发电站砖墙迷宫，生存难度 4，中央电梯可去 Level 4。"
    "Level 4：无限办公层，生存难度 1，有 M.E.G 前哨和 B.N.T.G 联络员。"
    "Level 6：伸手不见五指的黑暗，生存难度等待分级。"
    "Level 6.1：零食间。"
    "Level 7：水上小平台，生存难度 4；跳进周围的水会沉没，约 10 秒后去 Level 8。会淹的是这里，不是 21。"
    "Level 8：巨型洞穴，生存难度 5，有洞穴鸡。"
    "Level 9：明亮无限郊区道路，生存难度 5。"
    "Level 10：生存难度 1。"
    "Level 11：无限城市街道，生存难度 1，有 B.N.T.G 商店；这里的效应会让部分实体变得友好。"
    "Level 13：公寓旅馆，生存难度 2，无面灵前台会给 303 房间。"
    "Level 14：红叶紫雾树林，生存难度「天堂」，待久了理智会崩。"
    "Level 16：大片冰层，很滑很冷，生存难度等待分级；沙地冰面可去 Level 46。"
    "Level 21：编号门。中央花园加十字走廊，生存难度 4。走廊有死亡飞蛾和肢团；有编号的门通向对应层级。不是水层。"
    "Level 37：平静的水池，生存难度 0。"
    "Level 46：变换的旷野，生存难度 2；走远重力降低可去 Level 149。"
    "Level 48：日落沙滩，生存难度宜居。"
    "Level 57：黄色小房间，生存难度 0，有画家，可去 Level 21。"
    "Level 75：生存难度 5。"
    "Level 119：水滑梯房，生存难度 4。"
    "Level 121：湖底，生存难度 2。"
    "Level 149：椰树岛屿，生存难度宜居，四面环海没有出口。"
    "Level 283：派对房（休息区、管道、海洋球池），生存难度 3。"
    "Level 363：淡黄色小房间。"
    "C 层级多为死区或特殊区：C-144 和爱社区（友好肢团，受 Level 11 效应影响）；"
    "C-192 森林；C-370「倾向」生存难度 0，是水池深处的沉静柱林空间；C-1289 生存难度 2；"
    "C-1290 夕前石茧、C-1291 井盖迷阵、C-1292 衰退瘾、C-1293 故此悬置、C-1294 流萤死地、"
    "C-1295 凝固、C-1296、C-1297 无界之痿、C-1298 人景、C-1299 浓汤煮沸均为死区；"
    "C-1299.1 浓汤美味是食堂，生存难度「食堂」。"
)

AI_PERSONAS: Dict[str, str] = {
    "l1_guide": "你是 Level 1 出生区的 M.E.G 引导员。聊天只闲聊；真正去 M.E.G 基地走界面选项，聊天不能传送。",
    "l1_trade": "你是 M.E.G 基地里的收购员。聊天只闲聊，不要报任何积分数字或假价格；真正收购让玩家点背包物品用界面报价。",
    "l1_backdoor": "你是守 Level 1 M.E.G 基地后门的工作人员。玩家进后门不需要任何证件。你警惕、话少。聊天给不了钥匙或物资，也不要谈买卖。",
    "l1_level11": "你是 M.E.G 里负责 Level 1.1 向导的人员。讲解生存难度即可；去 1.1 让玩家点对话选项，聊天不能传送。",
    "l1_package": "你是 M.E.G 基地的包裹收件员。聊天只闲聊；真正交包裹走界面选项。",
    "l4_meg": (
        "你是 Level 4 M.E.G 前哨成员，只负责任务板，不卖任何补给。"
        "若被问买水、买瓶、换积分、多少钱：只回答「我不卖东西，看任务板」或「聊天给不了」。"
        "绝对不要说出任何「XX积分一瓶」或类似价格数字。"
    ),
    "l4_bntg": "你是 B.N.T.G. 派驻 Level 4 的联络员。聊天只闲聊；去基地走界面选项，不要假装已送人过去。",
    "l11_vendor": "你是 Level 11 的 B.N.T.G 售货员。聊天只闲聊，不要在聊天里报价格数字；真正购买点商店列表按钮。",
    "l11_buyer": "你是 Level 11 的 B.N.T.G 收购员。聊天只闲聊，不要报收购价数字；出售让玩家点背包物品用界面报价。禁止编造气球换物。",
    "l13_faceling": "你是 Level 13 旅馆前台的无面灵。说话平静简短。房间号已由界面安排，聊天不要改房间号。",
    "l57_painter": "你是 Level 57 的画家。真正去 Level 21 走界面选项，聊天不能传送。",
    "bntg_bank": "你是 B.N.T.G. 银行人员。聊天只闲聊；抽保险库用界面选项，不要承诺开箱结果。",
    "c144_clump": "你是 C-144 友好肢团。住一晚走界面 A/B，聊天不能强制留下。",
}

# 聊天改不了游戏状态：回复里若再编价格/换物，直接换成安全台词。
AI_SAFE_FALLBACK: Dict[str, str] = {
    "l4_meg": "我不卖补给。要做事看墙上的任务板。",
    "l1_trade": "收购价看界面。点背包里的东西，我再报价。",
    "l11_vendor": "价格在商品列表里。想买就点那边的按钮。",
    "l11_buyer": "收购价看界面。点背包里的东西，我再报价。",
    "l1_guide": "聊天送不了你过去。用旁边的选项。",
    "l4_bntg": "聊天送不了你过去。用旁边的选项。",
    "bntg_bank": "抽奖用界面选项。聊天开不了箱。",
}

_AI_FAKE_DEAL_RE = re.compile(
    r"("
    r"\d+\s*积分|"
    r"积分\s*(换|一瓶|一件|买|卖)|"
    r"(换|卖|买).{0,6}(瓶|水|气球)|"
    r"派对气球|"
    r"送你一|"
    r"给你一瓶|"
    r"成交了|"
    r"赊账|"
    r"保价"
    r")"
)


def _ai_sanitize_reply(npc: str, reply: str) -> str:
    text = (reply or "").strip()
    if not text:
        return text
    if _AI_FAKE_DEAL_RE.search(text):
        return AI_SAFE_FALLBACK.get(npc, "聊天办不了买卖。用旁边的选项。")
    return text


def _ai_scrub_history(history: Any) -> List[dict]:
    """丢掉会诱导模型继续报假价的旧助手回复。"""
    cleaned: List[dict] = []
    if not isinstance(history, list):
        return cleaned
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = str(item.get("content") or "")[:500]
        if role not in ("user", "assistant") or not content:
            continue
        if role == "assistant" and _AI_FAKE_DEAL_RE.search(content):
            continue
        cleaned.append({"role": role, "content": content})
    return cleaned


# 限流键 -> 最近一分钟内的请求时间戳
_ai_hits: Dict[str, List[float]] = {}


def _ai_rate_ok(limit_key: str) -> bool:
    now = time.monotonic()
    hits = [t for t in _ai_hits.get(limit_key, []) if now - t < 60.0]
    if len(hits) >= AI_RATE_PER_MIN:
        _ai_hits[limit_key] = hits
        return False
    hits.append(now)
    _ai_hits[limit_key] = hits
    return True


def _ai_call(messages: List[dict]) -> str:
    payload = json.dumps(
        {
            "model": AI_MODEL,
            "messages": messages,
            "max_tokens": 220,
            "temperature": 0.85,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        AI_API_BASE + "/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + AI_API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    choices = body.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    return str(message.get("content") or "").strip()


@app.route("/api/ai/chat", methods=["POST"])
def api_ai_chat() -> Any:
    if not AI_API_KEY:
        return (
            jsonify({"ok": False, "message": "服务器没配 AI 密钥，NPC 只会说固定台词"}),
            503,
        )
    data = request.get_json(silent=True) or {}
    npc = (data.get("npc") or "").strip()
    persona = AI_PERSONAS.get(npc)
    if not persona:
        return jsonify({"ok": False, "message": "不知道你在跟谁说话"}), 400
    text = (data.get("text") or "").strip()[:500]
    if not text:
        return jsonify({"ok": False, "message": "说点什么吧"}), 400

    token = (data.get("token") or "").strip()
    user = db.get_user_by_token(token) if token else None
    if AI_REQUIRE_LOGIN and not user:
        return jsonify({"ok": False, "message": "登录后才能和这里的人聊天"}), 401

    limit_key = f"u{int(user['id'])}" if user else f"ip{_client_ip()}"
    if not _ai_rate_ok(limit_key):
        return jsonify({"ok": False, "message": "说得太快了，缓一缓"}), 429

    messages: List[dict] = [{"role": "system", "content": AI_WORLD + AI_LEVELS + persona}]
    for item in _ai_scrub_history(data.get("history")):
        messages.append(item)
    messages.append({"role": "user", "content": text})

    try:
        reply = _ai_call(messages)
    except urllib.error.HTTPError as exc:
        status = 502 if exc.code >= 500 else 400
        note = "上游拒绝了请求（密钥或额度问题）" if exc.code in (401, 402, 403) else "对方没有回应"
        return jsonify({"ok": False, "message": note}), status
    except Exception:
        return jsonify({"ok": False, "message": "连不上对话服务"}), 502

    if not reply:
        return jsonify({"ok": False, "message": "对方沉默了"}), 502
    reply = _ai_sanitize_reply(npc, reply)
    return jsonify({"ok": True, "reply": reply})


@app.route("/api/admin/market-restock", methods=["POST"])
def api_admin_market_restock() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    amount = int(data.get("amount", 0))
    if amount not in (5, 10, 20):
        return jsonify({"ok": False, "message": "补货数量须为 5、10 或 20"}), 400
    stock = db.restock_market(amount)
    _broadcast_market_stock()
    return jsonify(
        {
            "ok": True,
            "message": f"已为全品类补货 +{amount}",
            "amount": amount,
            "stock": stock,
            "marketStock": db.get_market_stock_summary(),
        }
    )


@app.route("/api/admin/market-reset-stock", methods=["POST"])
def api_admin_market_reset_stock() -> Any:
    key = request.args.get("key", "")
    if not _admin_key_ok(key):
        return jsonify({"error": "forbidden"}), 403
    from market_catalog import MARKET_DEFAULT_STOCK

    stock = db.reset_market_stock()
    _broadcast_market_stock()
    return jsonify(
        {
            "ok": True,
            "message": f"已将全品类货源重置为 {MARKET_DEFAULT_STOCK}",
            "stock": stock,
            "marketStock": db.get_market_stock_summary(),
        }
    )


_MIME_OVERRIDES = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
}


@app.route("/<path:path>")
def static_files(path: str) -> Any:
    if app.config.get("ADMIN_ONLY"):
        return make_response("Not Found", 404)
    if path.startswith("admin/") or path.startswith("api/admin"):
        return make_response("Not Found", 404)
    suffix = Path(path).suffix.lower()
    mimetype = _MIME_OVERRIDES.get(suffix)
    resp = make_response(
        send_from_directory(ROOT, path, mimetype=mimetype)
    )
    if path == "sw.js":
        return _no_cache(resp)
    if path.endswith(".html"):
        return _no_cache(resp)
    if path.endswith((".js", ".css")):
        if request.query_string:
            return _immutable_cache(resp)
        return _no_cache(resp)
    if suffix in {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg",
        ".glb",
        ".gltf",
        ".mp4",
        ".mp3",
        ".woff2",
    }:
        return _short_cache(resp)
    return resp


@socketio.on("connect")
def on_connect() -> None:
    from flask import request

    if app.config.get("ADMIN_ONLY"):
        emit("connected", {"message": "管理端已连接"})
        return
    ip_err = db.get_active_ip_ban_message(_client_ip())
    if ip_err:
        emit("ip_banned", {"message": ip_err})
        return
    emit("connected", {"message": "已连接服务器"})


@socketio.on("auth_register")
def on_auth_register(data: dict) -> None:
    from flask import request

    sid = request.sid
    nickname = (data or {}).get("nickname", "").strip()
    password = (data or {}).get("password", "")

    ip_err = _ip_ban_error()
    if ip_err:
        emit("auth_error", {"message": ip_err})
        return

    err = _validate_nickname(nickname)
    if err:
        emit("auth_error", {"message": err})
        return
    err = _validate_password(password)
    if err:
        emit("auth_error", {"message": err})
        return

    if db.get_user_by_nickname(nickname):
        emit("auth_error", {"message": "昵称已被注册"})
        return

    pw_hash = generate_password_hash(password)
    user_id = db.create_user(nickname, pw_hash)
    token = secrets.token_urlsafe(32)
    db.create_session(user_id, token)

    user = db.get_user_by_id(user_id)
    device = _touch_user_session_meta(user_id, data)
    _bind_session(sid, user_id, nickname, token, device)
    _emit_auth_ok(sid, user, token, message="注册成功")
    _notify_friends_presence(user_id, True)


@socketio.on("auth_login")
def on_auth_login(data: dict) -> None:
    from flask import request

    sid = request.sid
    nickname = (data or {}).get("nickname", "").strip()
    password = (data or {}).get("password", "")

    ip_err = _ip_ban_error()
    if ip_err:
        emit("auth_error", {"message": ip_err})
        return

    err = _validate_nickname(nickname)
    if err:
        emit("auth_error", {"message": "昵称或密码错误"})
        return
    if not password:
        emit("auth_error", {"message": "昵称或密码错误"})
        return

    user = db.get_user_by_nickname(nickname)
    if not user or not check_password_hash(user["password_hash"], password):
        emit("auth_error", {"message": "昵称或密码错误"})
        return

    ban_msg = db.get_active_ban_message(int(user["id"]))
    if ban_msg:
        emit("auth_error", {"message": ban_msg})
        return

    token = secrets.token_urlsafe(32)
    db.create_session(int(user["id"]), token)
    device = _touch_user_session_meta(int(user["id"]), data)
    _bind_session(sid, int(user["id"]), user["nickname"], token, device)
    _emit_auth_ok(sid, user, token, message="登录成功")
    _notify_friends_presence(int(user["id"]), True)


@socketio.on("auth_resume")
def on_auth_resume(data: dict) -> None:
    from flask import request

    sid = request.sid
    token = (data or {}).get("token", "").strip()
    if not token:
        emit("auth_error", {"message": "请登录"})
        return

    ip_err = _ip_ban_error()
    if ip_err:
        emit("auth_error", {"message": ip_err})
        return

    user = db.get_user_by_token(token)
    if not user:
        emit("auth_error", {"message": "登录已过期，请重新登录"})
        return

    ban_msg = db.get_active_ban_message(int(user["id"]))
    if ban_msg:
        db.delete_session(token)
        emit("auth_error", {"message": ban_msg})
        return

    _touch_user_session_meta(int(user["id"]), data)
    _bind_session(sid, int(user["id"]), user["nickname"], token, _parse_client_device(data))
    _emit_auth_ok(sid, user, token, message="")
    _notify_friends_presence(int(user["id"]), True)


def _verify_session_token(token: str) -> tuple[bool, str]:
    if not token:
        return False, "请登录"
    ip_err = _ip_ban_error()
    if ip_err:
        return False, ip_err
    user = db.get_user_by_token(token)
    if not user:
        return False, "登录已过期，请重新登录"
    ban_msg = db.get_active_ban_message(int(user["id"]))
    if ban_msg:
        return False, ban_msg
    return True, ""


@app.route("/api/session/verify")
def api_session_verify() -> Any:
    """HTTP 心跳：教程/大厅校验 token（不依赖 WebSocket）。"""
    token = request.args.get("token", "").strip()
    ok, msg = _verify_session_token(token)
    if ok:
        return jsonify({"ok": True})
    return jsonify({"ok": False, "message": msg}), 403


@socketio.on("session_check")
def on_session_check(data: dict) -> None:
    """教程内心跳：只校验 token/封禁，不重新绑定会话。"""
    token = (data or {}).get("token", "").strip()
    ok, msg = _verify_session_token(token)
    if not ok:
        emit("session_invalid", {"message": msg})
        return
    emit("session_ok", {})


@socketio.on("auth_logout")
def on_auth_logout() -> None:
    from flask import request

    sid = request.sid
    sess = _unbind_session(sid)
    if sess and sess.get("token"):
        db.delete_session(sess["token"])
        _notify_friends_presence(sess["user_id"], False)


@socketio.on("friend_search")
def on_friend_search(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    query = (data or {}).get("query", "").strip()
    if not query:
        emit("friend_search_result", {"found": None})
        return

    target = db.get_user_by_nickname(query)
    if not target:
        emit("friend_search_result", {"found": None})
        return

    tid = int(target["id"])
    emit(
        "friend_search_result",
        {
            "found": {
                "id": tid,
                "nickname": target["nickname"],
                "online": tid in sid_by_user_id,
                "isSelf": tid == sess["user_id"],
                "isFriend": db.are_friends(sess["user_id"], tid),
            }
        },
    )


@socketio.on("friend_request_send")
def on_friend_request_send(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    nickname = (data or {}).get("nickname", "").strip()
    target = db.get_user_by_nickname(nickname)
    if not target:
        emit("friend_error", {"message": "未找到该昵称"})
        return

    ok, msg = db.create_friend_request(sess["user_id"], int(target["id"]))
    if not ok:
        emit("friend_error", {"message": msg})
        return

    emit("friend_notice", {"message": msg})
    to_sid = sid_by_user_id.get(int(target["id"]))
    if to_sid:
        socketio.emit(
            "friends_updated",
            _friends_payload(int(target["id"])),
            room=to_sid,
        )


@socketio.on("friend_request_accept")
def on_friend_request_accept(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    request_id = int((data or {}).get("requestId", 0))
    ok, msg, other_id = db.accept_friend_request(request_id, sess["user_id"])
    if not ok:
        emit("friend_error", {"message": msg})
        return

    emit("friend_notice", {"message": msg})
    _push_friends_update(sess["user_id"])
    if other_id is not None:
        _push_friends_update(other_id)
        _notify_friends_presence(sess["user_id"], True)
        _notify_friends_presence(other_id, other_id in sid_by_user_id)


@socketio.on("friend_request_decline")
def on_friend_request_decline(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    request_id = int((data or {}).get("requestId", 0))
    ok, msg = db.decline_friend_request(request_id, sess["user_id"])
    if not ok:
        emit("friend_error", {"message": msg})
        return
    emit("friend_notice", {"message": msg})
    _push_friends_update(sess["user_id"])


@socketio.on("player_state_save")
def on_player_state_save(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    state = (data or {}).get("state")
    if not isinstance(state, dict):
        emit("player_state_error", {"message": "存档格式错误"})
        return

    ok, result = db.save_player_state(sess["user_id"], state)
    if not ok:
        emit("player_state_error", {"message": result})
        return

    emit(
        "player_state_saved",
        {"savedAt": result, "credits": db.get_player_state(sess["user_id"]).get("credits")},
    )


@socketio.on("stash_update")
def on_stash_update(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    index = int((data or {}).get("index", -1))
    item = (data or {}).get("item")
    if item is not None:
        item = str(item)[:32]

    if 0 <= index < db.STASH_CELL_COUNT:
        stash = db.get_stash(sess["user_id"])
        stash[index] = item
        db.save_stash(sess["user_id"], stash)
        emit("stash_ack", {"index": index, "item": item})


@socketio.on("chat")
def on_chat(data: dict) -> None:
    from flask import request

    sess = sessions_by_sid.get(request.sid)
    if not sess:
        return

    text = (data or {}).get("text", "").strip()[:200]
    if not text:
        return

    emit(
        "chat_message",
        {"from": sess["nickname"], "text": text, "playerId": str(sess["user_id"])},
        room=LOBBY_ROOM,
    )


@socketio.on("disconnect")
def on_disconnect() -> None:
    from flask import request

    sid = request.sid
    sess = _unbind_session(sid)
    if not sess:
        return
    _notify_friends_presence(sess["user_id"], False)


def main() -> None:
    db.init_db()
    db.ensure_market_stock()

    parser = argparse.ArgumentParser(description="极危行动联机大厅")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，0.0.0.0 可局域网联机")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--admin-only",
        action="store_true",
        help="仅启动在线统计管理端（默认端口 8082）",
    )
    args = parser.parse_args()

    admin_only = args.admin_only or os.environ.get(
        "JIWEI_ADMIN_ONLY", ""
    ).strip().lower() in ("1", "true", "yes")
    app.config["ADMIN_ONLY"] = admin_only

    print(f"  数据库: {db.DB_PATH}")

    if admin_only:
        print("极危行动 — 在线统计管理端（账号踢封 / 时长）")
        print(f"  管理页: http://127.0.0.1:{args.port}/admin/online-stats?key=<密钥>")
        print("  游戏大厅请另开 ./run.sh（8080）")
        print("  按 Ctrl+C 停止\n")
        app.run(
            host=args.host,
            port=args.port,
            debug=False,
            threaded=True,
        )
        return

    print("极危行动 — 联机大厅服务器（账号 + 好友）")
    print(f"  本机访问: http://127.0.0.1:{args.port}")
    print(f"  局域网:   http://<你的IP>:{args.port}")
    if ADMIN_KEY:
        print("  在线统计: http://127.0.0.1:8082/admin/online-stats?key=<密钥> （./run-admin.sh）")
    print("  按 Ctrl+C 停止\n")
    socketio.start_background_task(_poll_admin_kick_requests)
    socketio.run(
        app,
        host=args.host,
        port=args.port,
        debug=False,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()

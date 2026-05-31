#!/usr/bin/env python3
"""
极危行动 — 联机大厅服务器
- 昵称 + 密码注册/登录（会话 token）
- 好友：搜索、申请、同意；在线状态
- 各自 6×10 仓库云端同步（SQLite）
"""

from __future__ import annotations

import argparse
import os
import re
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

from datetime import datetime, timezone

from flask import Flask, jsonify, make_response, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import check_password_hash, generate_password_hash

import db

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

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "jiwei-lobby-dev")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# sid -> { user_id, nickname, token }
sessions_by_sid: Dict[str, dict] = {}
# user_id -> sid（单设备在线，新登录顶掉旧连接）
sid_by_user_id: Dict[int, str] = {}


def _no_cache(resp: Any) -> Any:
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
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


def _admin_key_ok(key: str) -> bool:
    if not ADMIN_KEY:
        return False
    if ADMIN_LOCAL_ONLY and request.remote_addr not in ("127.0.0.1", "::1"):
        return False
    return secrets.compare_digest(key or "", ADMIN_KEY)


def _admin_password_ok(password: str) -> bool:
    if not ADMIN_KEY:
        return False
    return secrets.compare_digest(password or "", ADMIN_KEY)


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
    if path.endswith((".html", ".js", ".css")):
        return _no_cache(resp)
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

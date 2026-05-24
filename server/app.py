#!/usr/bin/env python3
"""
极危行动 — 联机大厅服务器
- 静态网页 + WebSocket（Socket.IO）
- 同一房间玩家互相可见
- 各自 6×10 仓库云端同步
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Flask, make_response, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

ROOT = Path(__file__).resolve().parent.parent
STASH_SIZE = 60
DEFAULT_ROOM = "main"
MAX_PLAYERS_PER_ROOM = 3

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "jiwei-lobby-dev")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# room_id -> { sid -> player dict }
rooms: Dict[str, Dict[str, dict]] = {}
# nickname -> stash cells (持久到进程结束)
stash_by_name: Dict[str, List[Optional[str]]] = {}


def empty_stash() -> List[Optional[str]]:
    return [None] * STASH_SIZE


def get_stash(nickname: str) -> List[Optional[str]]:
    if nickname not in stash_by_name:
        stash_by_name[nickname] = empty_stash()
    return stash_by_name[nickname]


def players_in_room(room_id: str) -> List[dict]:
    return list(rooms.get(room_id, {}).values())


def public_player(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": p["name"],
        "room": p["room"],
    }


def _no_cache(resp: Any) -> Any:
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route("/")
def index() -> Any:
    return _no_cache(make_response(send_from_directory(ROOT, "index.html")))


@app.route("/<path:path>")
def static_files(path: str) -> Any:
    resp = make_response(send_from_directory(ROOT, path))
    if path.endswith((".html", ".js", ".css")):
        return _no_cache(resp)
    return resp


@socketio.on("connect")
def on_connect() -> None:
    emit("connected", {"message": "已连接服务器"})


@socketio.on("join")
def on_join(data: dict) -> None:
    from flask import request

    sid = request.sid
    nickname = (data or {}).get("nickname", "").strip()[:16]
    room_id = (data or {}).get("room", DEFAULT_ROOM).strip()[:32] or DEFAULT_ROOM

    if not nickname:
        emit("join_error", {"message": "请输入昵称"})
        return

    # 昵称占用（同房间）
    for p in rooms.get(room_id, {}).values():
        if p["name"].lower() == nickname.lower() and p["id"] != sid:
            emit("join_error", {"message": "昵称已被使用"})
            return

    # 离开旧房间
    for rid, members in list(rooms.items()):
        if sid in members:
            members.pop(sid)
            leave_room(rid)
            socketio.emit(
                "players_updated",
                _room_payload(members, rid),
                room=rid,
            )

    rooms.setdefault(room_id, {})
    members = rooms[room_id]

    # 房间人数上限（最多 3 人）
    if sid not in members and len(members) >= MAX_PLAYERS_PER_ROOM:
        emit(
            "join_error",
            {"message": f"房间已满（最多 {MAX_PLAYERS_PER_ROOM} 人）"},
        )
        return

    join_room(room_id)

    player = {
        "id": sid,
        "name": nickname,
        "room": room_id,
    }
    rooms[room_id][sid] = player
    stash = get_stash(nickname)

    payload = _room_payload(rooms[room_id], room_id)
    emit(
        "lobby_joined",
        {
            "player": public_player(player),
            "stash": stash,
            **payload,
        },
    )
    emit("players_updated", payload, room=room_id, include_self=False)
    emit(
        "friend_joined",
        {"name": nickname, **payload},
        room=room_id,
        include_self=False,
    )


@socketio.on("stash_update")
def on_stash_update(data: dict) -> None:
    from flask import request

    sid = request.sid
    player = _find_player(sid)
    if not player:
        return

    index = int((data or {}).get("index", -1))
    item = (data or {}).get("item")
    if item is not None:
        item = str(item)[:8]

    if 0 <= index < STASH_SIZE:
        stash = get_stash(player["name"])
        stash[index] = item
        # 仅保存该玩家自己的仓库，不同步到他人格子（各玩各的 6×10）
        emit("stash_ack", {"index": index, "item": item})


@socketio.on("chat")
def on_chat(data: dict) -> None:
    from flask import request

    sid = request.sid
    player = _find_player(sid)
    if not player:
        return

    text = (data or {}).get("text", "").strip()[:200]
    if not text:
        return

    emit(
        "chat_message",
        {"from": player["name"], "text": text, "playerId": sid},
        room=player["room"],
    )


@socketio.on("disconnect")
def on_disconnect() -> None:
    from flask import request

    sid = request.sid
    for room_id, members in list(rooms.items()):
        if sid not in members:
            continue
        left_name = members[sid]["name"]
        members.pop(sid)
        payload = _room_payload(members, room_id)
        emit("players_updated", payload, room=room_id)
        emit(
            "friend_left",
            {"name": left_name, **payload},
            room=room_id,
        )
        break


def _room_payload(members: Dict[str, dict], room_id: str) -> dict:
    return {
        "players": [public_player(p) for p in members.values()],
        "maxPlayers": MAX_PLAYERS_PER_ROOM,
        "room": room_id,
    }


def _find_player(sid: str) -> Optional[dict]:
    for members in rooms.values():
        if sid in members:
            return members[sid]
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="极危行动联机大厅")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，0.0.0.0 可局域网联机")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    print("极危行动 — 联机大厅服务器")
    print(f"  本机访问: http://127.0.0.1:{args.port}")
    print(f"  局域网:   http://<你的IP>:{args.port}")
    print("  按 Ctrl+C 停止\n")
    socketio.run(
        app,
        host=args.host,
        port=args.port,
        debug=False,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()

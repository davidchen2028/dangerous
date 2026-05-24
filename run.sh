#!/bin/bash
# 极危行动 — 联机大厅服务器

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"

get_lan_ip() {
  local iface ip
  iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  if [ -n "$iface" ]; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
    [ -n "$ip" ] && echo "$ip" && return
    ip=$(ifconfig "$iface" 2>/dev/null | awk '/inet / {print $2; exit}')
    [ -n "$ip" ] && echo "$ip" && return
  fi
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect(('8.8.8.8', 80))
print(s.getsockname()[0])
s.close()
" 2>/dev/null
}

# 检查 8080 是否已被占用
if lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠ 端口 ${PORT} 已被占用（可能服务器已在运行，或别的程序占用了）"
  echo ""
  echo "你可以："
  echo "  1. 直接在浏览器打开 http://localhost:${PORT} 试试是否已经能玩"
  echo "  2. 或关掉占用端口的程序后重新运行 ./run.sh"
  echo "  3. 或换端口: PORT=8081 ./run.sh"
  echo ""
  lsof -i :"$PORT" -sTCP:LISTEN 2>/dev/null | head -5
  exit 1
fi

if [ ! -d "server/.venv" ]; then
  echo "首次运行：正在安装依赖（约 1～2 分钟）…"
  python3 -m venv server/.venv || { echo "❌ 创建虚拟环境失败"; exit 1; }
  server/.venv/bin/pip install -r server/requirements.txt || { echo "❌ 安装依赖失败"; exit 1; }
  echo "✓ 安装完成"
  echo ""
fi

LAN_IP=$(get_lan_ip)

echo "======================================"
echo "  极危行动 — 联机大厅"
echo "======================================"
echo "  本机:   http://127.0.0.1:${PORT}"
if [ -n "$LAN_IP" ]; then
  echo "  局域网: http://${LAN_IP}:${PORT}"
else
  echo "  局域网: （未查到 IP，可运行 ./get-ip.sh）"
fi
echo ""
echo "  电脑：用浏览器打开上面「本机」地址"
echo "  手机：同一 WiFi，打开「局域网」地址（不要用 localhost）"
echo "  不要双击 index.html"
echo "  按 Ctrl+C 停止服务器"
echo "======================================"
echo ""

server/.venv/bin/python server/app.py --host 0.0.0.0 --port "$PORT"
EXIT=$?
if [ "$EXIT" -ne 0 ]; then
  echo ""
  echo "❌ 服务器启动失败（退出码 $EXIT）"
  echo "   把上面红色报错截图发给别人排查"
fi
exit "$EXIT"

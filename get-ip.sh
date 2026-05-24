#!/bin/bash
# 查询本机局域网 IP（比单独 en0 更可靠）

cd "$(dirname "$0")"

get_lan_ip() {
  local iface ip
  iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  if [ -n "$iface" ]; then
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
    ip=$(ifconfig "$iface" 2>/dev/null | awk '/inet / {print $2; exit}')
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
  fi
  python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.connect(('8.8.8.8', 80))
print(s.getsockname()[0])
s.close()
" 2>/dev/null
}

IP=$(get_lan_ip)

echo "极危行动 — 本机局域网 IP"
echo ""

if [ -z "$IP" ]; then
  echo "  未查到 IP。请确认："
  echo "  1. 已连接 Wi‑Fi 或网线"
  echo "  2. 系统设置 → 网络 → Wi‑Fi → 详细信息 → 里看 IP 地址"
  echo ""
  echo "  或手动执行："
  echo "    ifconfig | grep \"inet \" | grep -v 127.0.0.1"
  exit 1
fi

echo "  你的 IP:  $IP"
echo ""
echo "  自己打开:   http://localhost:8080"
echo "  好友打开:   http://${IP}:8080"
echo "  （需先运行 ./run.sh 启动服务器）"
echo ""

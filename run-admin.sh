#!/bin/bash
# 极危行动 — 在线统计管理端（8082，与游戏 8080 分离）

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8082}"

if lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  OCC_PID=$(lsof -t -i :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
  echo "⚠ 端口 ${PORT} 已被占用（PID ${OCC_PID}）"
  echo "  管理页: http://127.0.0.1:${PORT}/admin/online-stats?key=<密钥>"
  echo "  若要重启: kill ${OCC_PID} && ./run-admin.sh"
  exit 1
fi

if [ ! -d "server/.venv" ]; then
  echo "请先运行 ./run.sh 安装依赖，或："
  python3 -m venv server/.venv
  server/.venv/bin/pip install -r server/requirements.txt
fi

if [ -z "$JIWEI_ADMIN_KEY" ]; then
  echo "⚠ 未设置 JIWEI_ADMIN_KEY，管理页将无法访问"
  echo "  示例: export JIWEI_ADMIN_KEY='你的长随机密码'"
  echo ""
fi

echo "======================================"
echo "  极危行动 — 在线统计（管理端）"
echo "======================================"
echo "  管理页: http://127.0.0.1:${PORT}/admin/online-stats?key=<你的密钥>"
echo "  游戏大厅: http://127.0.0.1:8080 （需另开 ./run.sh）"
echo "  按 Ctrl+C 停止"
echo "======================================"
echo ""

export JIWEI_ADMIN_ONLY=1
exec server/.venv/bin/python server/app.py --host 0.0.0.0 --port "$PORT" --admin-only

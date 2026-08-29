# 极危行动 — Railway 部署（Flask + Socket.IO，监听 PORT，默认 8080）
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

# 先装依赖，利用 Docker 层缓存
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# 静态页 + 后端（逐项 COPY 容易漏掉新增页面，改为整体拷贝，排除项见 .dockerignore）
COPY . .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/' % os.environ.get('PORT', '8080'))" || exit 1

# Railway 会注入 PORT；本地 docker run 未设置时用 8080
CMD ["sh", "-c", "python server/app.py --host 0.0.0.0 --port ${PORT:-8080}"]

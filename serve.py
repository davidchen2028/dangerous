#!/usr/bin/env python3
"""本地静态调试服务器。

`python3 -m http.server` 不发送缓存头，浏览器会按启发式规则缓存 ES module 子模块，
导致新入口文件与旧依赖混用，出现"整页停在加载中、控制台只有一条 SyntaxError"的假死。
调试期一律 no-store，避免这种版本错配。正式服务由 server/app.py 提供。

用法：python3 serve.py [端口]
"""

import functools
import http.server
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        # 丢弃条件请求头，避免 304 让浏览器继续使用旧模块副本
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()


class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with ReusableServer(("127.0.0.1", port), handler) as httpd:
        print(f"调试服务器（no-store）: http://127.0.0.1:{port}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()

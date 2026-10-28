#!/usr/bin/env python3
"""B5 验收用：把真实历史产物（evidence 里的 PNG/MP4）以 CORS 开放的静态服务暴露给浏览器。

这些文件是上一轮真实 provider 调用的产物，服务只读本地磁盘、不改内容；
浏览器侧把它们当作真实结果 URL 使用（不是 mock，也不是新造数据）。
"""
import functools
import http.server
import os
import sys

ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance")
)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 23298


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    if not os.path.isdir(ROOT):
        raise SystemExit(f"evidence dir not found: {ROOT}")
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"serving {ROOT} on http://127.0.0.1:{PORT}", flush=True)
        httpd.serve_forever()

#!/usr/bin/env python3
"""验收用协议转换 shim：把 OpenAI Responses API 请求转成 SiliconFlow /chat/completions。

用途：infinite-canvas 前端文本/视觉通道只实现了 /v1/responses（CCAI 该端点 502/503、
SiliconFlow 无该端点）。此 shim 只做协议转换，模型调用仍打到真实 SiliconFlow
（Qwen/Qwen3-VL-8B-Instruct），不伪造任何模型输出。

启动：python3 responses-shim.py 8899
"""
import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SF_BASE = os.environ.get("SF_BASE", "https://api.siliconflow.cn/v1")
SF_KEY = os.environ.get("SF_KEY", "").strip()
if not SF_KEY and os.environ.get("SF_KEY_FILE"):
    SF_KEY = open(os.environ["SF_KEY_FILE"]).read().strip()
MODEL = os.environ.get("SF_MODEL", "Qwen/Qwen3-VL-8B-Instruct")
USE_PROXY = os.environ.get("SF_PROXY", "")


def to_chat_messages(payload):
    msgs = []
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        msgs.append({"role": "system", "content": instructions})
    raw = payload.get("input")
    if isinstance(raw, str):
        msgs.append({"role": "user", "content": raw})
        return msgs
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        role = item.get("role") or "user"
        content = item.get("content")
        if isinstance(content, str):
            msgs.append({"role": role, "content": content})
            continue
        parts = []
        for part in content or []:
            ptype = part.get("type")
            if ptype in ("input_text", "output_text", "text"):
                parts.append({"type": "text", "text": part.get("text", "")})
            elif ptype in ("input_image", "image_url"):
                url = part.get("image_url") or part.get("url") or ""
                if isinstance(url, dict):
                    url = url.get("url", "")
                if url:
                    parts.append({"type": "image_url", "image_url": {"url": url}})
        if parts:
            msgs.append({"role": role, "content": parts})
    return msgs


def call_siliconflow(messages):
    body = json.dumps({"model": MODEL, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(
        SF_BASE.rstrip("/") + "/chat/completions",
        data=body,
        headers={"Authorization": "Bearer " + SF_KEY, "Content-Type": "application/json"},
    )
    if USE_PROXY:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    else:
        opener = urllib.request.build_opener()
    with opener.open(req, timeout=300) as resp:
        data = json.loads(resp.read().decode())
    return data["choices"][0]["message"]["content"] or ""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        payload = json.loads(self.rfile.read(length) or b"{}")
        try:
            text = call_siliconflow(to_chat_messages(payload))
        except Exception as error:  # 真实上游错误原样回传，便于定位
            body = json.dumps({"error": {"message": f"shim upstream error: {error}"}}).encode()
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        lines = [
            "data: " + json.dumps({"type": "response.output_text.delta", "delta": text}),
            "",
            "data: " + json.dumps({
                "type": "response.completed",
                "response": {
                    "id": "shim-resp",
                    "object": "response",
                    "status": "completed",
                    "output": [{
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": text}],
                    }],
                },
            }),
            "",
            "data: [DONE]",
            "",
            "",
        ]
        body = "\n".join(lines).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[shim] " + (fmt % args) + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()

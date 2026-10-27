#!/usr/bin/env python3
"""LinkFox ai-api 请求/响应加解密工具（2026-10-27 实测有效）

LinkFox 前端(utils chunk)对 ai-api 的 POST body 做了一次包装：
    e.data = Ir(JSON.stringify(e.data))
其中 Ir = CryptoJS.AES.encrypt(plain, Utf8.parse('AR7x7zfje4nkim4t'), {mode: ECB, padding: ZeroPadding}).toString()
toString() 默认输出 base64。响应体里的 data 字段用同样的 key 解（Rr 函数）。

用法:
    python decrypt_linkfox.py "{\"data\":\"<base64>\"}"
    python decrypt_linkfox.py --file body.json
"""
import sys, json, base64
from Crypto.Cipher import AES

KEY = b'AR7x7zfje4nkim4t'
BLOCK = 16

def dec(b64: str) -> str:
    ct = base64.b64decode(b64)
    pt = AES.new(KEY, AES.MODE_ECB).decrypt(ct).rstrip(b'\x00')
    return pt.decode('utf-8', 'replace')

def enc(text: str) -> str:
    raw = text.encode('utf-8')
    pad = BLOCK - len(raw) % BLOCK
    if pad != BLOCK:
        raw += b'\x00' * pad
    return base64.b64encode(AES.new(KEY, AES.MODE_ECB).encrypt(raw)).decode()

if __name__ == '__main__':
    arg = sys.argv[1]
    if arg == '--file':
        payload = json.load(open(sys.argv[2], encoding='utf-8'))
    else:
        payload = json.loads(arg)
    plain = dec(payload['data'] if isinstance(payload, dict) else payload)
    try:
        print(json.dumps(json.loads(plain), ensure_ascii=False, indent=2))
    except Exception:
        print(plain)

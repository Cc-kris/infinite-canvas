import json, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = 'https://ai-api.linkfox.com'
ST = {'hdr': {}}

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    def _send(self, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.send_header('Content-Length','0'); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b'{}'
        u = urllib.parse.urlparse(self.path)
        if u.path == '/hdr':
            try:
                d = json.loads(body)
                ST['hdr'] = {str(k).lower(): str(v) for k, v in (d.get('headers') or {}).items()}
            except Exception as e:
                return self._send({'err': str(e)})
            return self._send({'ok': True, 'keys': sorted(ST['hdr'].keys())})
        if u.path == '/relay':
            try: req = json.loads(body or b'{}')
            except Exception: return self._send({'err':'bad json'})
            path = req.get('path') or ''
            if not ST['hdr']:
                return self._send({'err':'no headers'})
            hdr = dict(ST['hdr'])
            hdr.pop('content-length', None); hdr.pop('content-type', None)
            hdr.setdefault('accept', 'application/json')
            try:
                r = urllib.request.Request(BASE + path, headers=hdr, method='GET')
                with urllib.request.urlopen(r, timeout=40) as resp:
                    return self._send({'ok': True, 'status': 200, 'body': resp.read().decode('utf-8','replace')})
            except urllib.error.HTTPError as e:
                return self._send({'ok': False, 'status': e.code, 'body': e.read().decode('utf-8','replace')[:600]})
            except Exception as e:
                return self._send({'ok': False, 'err': str(e)[:200]})
        return self._send({'err':'unknown'})

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8899), H).serve_forever()

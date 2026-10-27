import json, urllib.request, urllib.parse, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = 'https://ai-api.linkfox.com'
TOK = {'v': ''}

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    def log_message(self, *a): pass
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.send_header('Content-Length','0'); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        u = urllib.parse.urlparse(self.path)
        if u.path == '/token':
            try: TOK['v'] = json.loads(body or b'{}').get('token','')
            except Exception: pass
            out = {'ok': bool(TOK['v'])}
        elif u.path == '/relay':
            out = self.relay(body)
        else:
            out = {'err': 'unknown'}
        b = json.dumps(out, ensure_ascii=False).encode()
        self.send_response(200); self._cors()
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b))); self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        out = self.relay(json.dumps({'path': q.get('path',[''])[0]}).encode())
        b = json.dumps(out, ensure_ascii=False).encode()
        self.send_response(200); self._cors()
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b))); self.end_headers()
        self.wfile.write(b)
    def relay(self, body):
        try:
            req = json.loads(body or b'{}')
        except Exception:
            return {'err': 'bad json'}
        path = req.get('path') or ''
        if not TOK['v']:
            return {'err': 'no token'}
        hdr = {'authorization': TOK['v'], 'source': 'ai-linkfox-web',
               'Accept': 'application/json'}
        if req.get('uid'): hdr['uid'] = req['uid']
        url = BASE + path
        try:
            r = urllib.request.Request(url, headers=hdr, method='GET')
            with urllib.request.urlopen(r, timeout=30) as resp:
                raw = resp.read().decode('utf-8', 'replace')
            return {'ok': True, 'status': 200, 'body': raw}
        except urllib.error.HTTPError as e:
            return {'ok': False, 'status': e.code, 'body': e.read().decode('utf-8','replace')[:800]}
        except Exception as e:
            return {'ok': False, 'err': str(e)[:200]}

if __name__ == '__main__':
    srv = ThreadingHTTPServer(('127.0.0.1', 8899), H)
    srv.serve_forever()

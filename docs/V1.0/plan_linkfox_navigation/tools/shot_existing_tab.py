#!/usr/bin/env python3
"""对已存在标签（URL 包含 --match）直接 CDP 截图，不新建/不关闭标签。"""
import argparse, base64, json, os, sys
ENGINE = '/Applications/Galley.app/Contents/Resources/managed-ga/code'
if ENGINE not in sys.path: sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver

def cdp(d, tid, method, params=None, timeout=60):
    r = d.execute_js(json.dumps({"cmd":"cdp","method":method,"tabId":int(tid),"params":params or {}}), timeout=timeout)
    if isinstance(r,str): r=json.loads(r)
    while isinstance(r,dict) and set(r.keys())=={'data'} and isinstance(r['data'],dict): r=r['data']
    return r

ap=argparse.ArgumentParser()
ap.add_argument('--match', required=True)
ap.add_argument('--out', required=True)
a=ap.parse_args()
d=TMWebDriver()
tabs=d.execute_js(json.dumps({"cmd":"tabs"}), timeout=30)
if isinstance(tabs,str): tabs=json.loads(tabs)
lst=tabs.get('data') or tabs.get('tabs') or []
tid=None; url=None
for t in lst:
    u=t.get('url') or ''
    if a.match in u: tid=t.get('id'); url=u; break
print('tab', tid, url)
if tid is None: sys.exit(2)
r=cdp(d,tid,'Page.captureScreenshot',{'format':'jpeg','quality':92,'captureBeyondViewport':False})
data=r.get('data')
if not data:
    print('FAIL', json.dumps(r)[:300]); sys.exit(3)
open(a.out,'wb').write(base64.b64decode(data))
print('OK', a.out, os.path.getsize(a.out))

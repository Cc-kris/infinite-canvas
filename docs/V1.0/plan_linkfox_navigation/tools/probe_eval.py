#!/usr/bin/env python3
"""通用 CDP eval 探针：在指定 URL 上执行一段 JS（returnByValue），落盘 JSON。

用法:
  python3 probe_eval.py --url http://127.0.0.1:3000/tools/... --js-file /tmp/x.js --out /tmp/out.json
"""
import argparse
import json
import os
import sys
import time

ENGINE = '/Applications/Galley.app/Contents/Resources/managed-ga/code'
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402


def cdp(driver, tab_id, method, params=None, timeout=60):
    payload = json.dumps({"cmd": "cdp", "method": method, "tabId": int(tab_id), "params": params or {}})
    r = driver.execute_js(payload, timeout=timeout)
    if isinstance(r, str):
        r = json.loads(r)
    while isinstance(r, dict) and set(r.keys()) == {'data'} and isinstance(r['data'], dict):
        r = r['data']
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--js-file', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--viewport', default='1908x781')
    ap.add_argument('--wait', type=float, default=2.5)
    args = ap.parse_args()
    vw, vh = (int(x) for x in args.viewport.lower().split('x'))
    js = open(args.js_file).read()
    driver = TMWebDriver()
    tid = None
    try:
        r = driver.execute_js(json.dumps({"cmd": "tabs", "method": "create", "url": "about:blank", "active": False}), timeout=30)
        if isinstance(r, str):
            r = json.loads(r)
        tid = r['data']['id']
        cdp(driver, tid, 'Emulation.setDeviceMetricsOverride', {'width': vw, 'height': vh, 'deviceScaleFactor': 1, 'mobile': False})
        cdp(driver, tid, 'Page.enable')
        cdp(driver, tid, 'Page.navigate', {'url': args.url})
        for _ in range(20):
            time.sleep(1)
            st = cdp(driver, tid, 'Runtime.evaluate', {'expression': "document.readyState+'|'+(document.body?document.body.innerText.length:0)", 'returnByValue': True})
            v = (st or {}).get('result', {}).get('value') or ''
            if v.startswith('complete|') and int(v.split('|')[1] or 0) > 60:
                break
        time.sleep(args.wait)
        res = cdp(driver, tid, 'Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True})
        val = (res or {}).get('result', {}).get('value')
        with open(args.out, 'w') as f:
            json.dump(val, f, ensure_ascii=False, indent=1)
        print('OK', args.out, len(json.dumps(val)))
    finally:
        if tid:
            try:
                cdp(driver, tid, 'Page.close', {})
            except Exception:
                pass


if __name__ == '__main__':
    main()

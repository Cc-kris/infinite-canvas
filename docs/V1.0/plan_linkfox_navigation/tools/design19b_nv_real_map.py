#!/usr/bin/env python3
"""design19b-nv：在已登录原站枚举 /draw/* 入口（图片工具目录）。

产物: evidence/design19b-nv-final/real-map/draw_links.json
用法: python3 design19b_nv_real_map.py [--tab ID] [--url URL]
"""
import argparse
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final', 'real-map')
ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

SNAP = r"""
(() => {
  const t = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const anchors = [...document.querySelectorAll('a[href]')].map((a) => ({ text: t(a), href: a.getAttribute('href') }))
    .filter((x) => x.href && x.href.includes('/draw/'));
  const path = location.pathname + location.search;
  const h1 = [...document.querySelectorAll('h1,h2,[class*="title"]')].map(t).filter((s) => s && s.length > 1 && s.length < 30).slice(0, 12);
  return {
    url: location.href, path, title: document.title, h1,
    login: /个人账号|用户\d+|退出登录/.test(document.body.innerText || ''),
    wall: /登录\s*\/\s*注册|请先登录|扫码登录/.test(document.body.innerText || ''),
    anchors,
  };
})()
"""


def cdp(driver, tab_id, method, params=None, timeout=40):
    payload = json.dumps({"cmd": "cdp", "method": method, "tabId": int(tab_id), "params": params or {}})
    r = driver.execute_js(payload, timeout=timeout)
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:
            return r
    while isinstance(r, dict) and set(r.keys()) == {'data'} and isinstance(r['data'], (dict, list)):
        r = r['data']
    return r


def eval_in(driver, tab_id, expr, timeout=40):
    r = cdp(driver, tab_id, "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
    if isinstance(r, dict) and 'result' in r:
        return r['result'].get('value')
    return r


def new_tab(driver, url):
    r = driver.execute_js(json.dumps({"cmd": "tabs", "method": "create", "url": url, "active": False}), timeout=30)
    if isinstance(r, str):
        r = json.loads(r)
    return r['data']['id']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tab', type=int, default=0)
    ap.add_argument('--url', default='https://www.linkfox.com/draw/designer-home')
    a = ap.parse_args()
    os.makedirs(EVID, exist_ok=True)
    d = TMWebDriver()
    tid = a.tab
    created = False
    if not tid:
        tid = new_tab(d, a.url)
        created = True
    time.sleep(4)
    snap = eval_in(d, tid, SNAP)
    # 展开顶部「更多」类菜单后再扫描一次
    eval_in(d, tid, "(() => {document.querySelectorAll('*').forEach(el=>{const t=(el.textContent||'').trim(); if((t==='更多'||t==='商品图设计'||t==='素材和灵感')&&el.children.length===0){try{el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));}catch(e){}}})})()")
    time.sleep(2)
    snap2 = eval_in(d, tid, SNAP)
    merged = {}
    for s in (snap, snap2):
        if isinstance(s, dict):
            for x in s.get('anchors') or []:
                merged[x['href']] = x['text']
    out = {'tab': tid, 'created': created, 'snap': snap, 'snapAfterHover': snap2,
           'routes': sorted([{'href': k, 'text': v} for k, v in merged.items()], key=lambda x: x['href'])}
    with open(os.path.join(EVID, 'draw_links.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps({'tab': tid, 'login': (snap or {}).get('login'), 'wall': (snap or {}).get('wall'),
                      'title': (snap or {}).get('title'), 'n': len(out['routes'])}, ensure_ascii=False))
    for r in out['routes']:
        print(f"{r['text']} => {r['href']}")


if __name__ == '__main__':
    main()

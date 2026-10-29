#!/usr/bin/env python3
"""design19b-nv：原站（已登录）逐页枚举子工具 tab / 链接，用于确认 9 个 ID 的真实映射。

产物: evidence/design19b-nv-final/real-map/pages/<slug>.json
用完关闭自己创建的标签页。
"""
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final', 'real-map', 'pages')
ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

URLS = [
    ("batch", "https://www.linkfox.com/draw/batch-generate-images"),
    ("designer", "https://www.linkfox.com/draw/designer-home"),
    ("product-scene", "https://www.linkfox.com/draw/product-scene"),
    ("smart-repair", "https://www.linkfox.com/draw/smart-repair"),
    ("product-image-suite", "https://www.linkfox.com/draw/product-image-suite"),
    ("clothing-suite", "https://www.linkfox.com/draw/clothing-image-suite"),
]

SNAP = r"""
(() => {
  const t = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  const vis = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && c.display !== 'none' && c.visibility !== 'hidden'; };
  const links = [...document.querySelectorAll('a[href]')].filter(vis).map((a) => ({ text: t(a).slice(0, 40), href: a.getAttribute('href') }));
  const chips = [...document.querySelectorAll('div,span,li,button')].filter(vis)
    .filter((el) => el.children.length === 0)
    .map((el) => ({ text: t(el).slice(0, 30), cls: (el.className || '').toString().slice(0, 80) }))
    .filter((x) => x.text && x.text.length <= 20);
  return {
    url: location.href, title: document.title,
    loginName: (document.body.innerText.match(/用户\d+/g) || [])[0] || null,
    bodyText: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 4000),
    links, chips: chips.slice(0, 200),
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


def main():
    os.makedirs(OUT, exist_ok=True)
    d = TMWebDriver()
    tid = d.execute_js(json.dumps({"cmd": "tabs", "method": "create",
                                   "url": "https://www.linkfox.com/draw/batch-generate-images",
                                   "active": False}), timeout=30)
    if isinstance(tid, str):
        tid = json.loads(tid)
    tid = tid['data']['id']
    print("tab", tid)
    try:
        for slug, url in URLS:
            eval_in(d, tid, f"location.href={json.dumps(url)}")
            time.sleep(5)
            for _ in range(10):
                st = eval_in(d, tid, "document.readyState + '|' + ((document.body&&document.body.innerText)||'').length")
                if isinstance(st, str) and st.startswith('complete') and int(st.split('|')[1] or 0) > 400:
                    break
                time.sleep(1)
            snap = eval_in(d, tid, SNAP)
            if isinstance(snap, dict):
                with open(os.path.join(OUT, f"{slug}.json"), 'w') as f:
                    json.dump(snap, f, ensure_ascii=False, indent=1)
                print(f"{slug}: {snap.get('url')} | {snap.get('title')} | login={snap.get('loginName')} | links={len(snap.get('links') or [])}")
            else:
                print(slug, "SNAP FAIL", str(snap)[:120])
    finally:
        cdp(d, tid, "Page.close")


if __name__ == '__main__':
    main()

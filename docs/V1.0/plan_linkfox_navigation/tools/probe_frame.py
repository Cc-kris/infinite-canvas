#!/usr/bin/env python3
"""B11 共享框架（tool page frame）证据探针：原站 / 本地同 viewport 骨架 + computed CSS。

用法:
  python3 probe_frame.py --side real --url "https://www.linkfox.com/draw/ai-outpainting" --id real_AI_OUTPAINTING
  python3 probe_frame.py --side local --url "http://127.0.0.1:3000/tools/smart-edit/ai-outpainting" --id local_AI_OUTPAINTING

产物: evidence/b11-frame-parity-20261029/<id>/{frame.json,shot.jpg,text.txt}
"""
import argparse
import base64
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/b11-frame-parity-20261029')
ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

FRAME_JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  const vis = el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return r.width > 40 && r.height > 8 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity !== 0; };
  const css = el => { const c = getComputedStyle(el);
    return {bg:c.backgroundColor, color:c.color, border:c.borderTopWidth+' '+c.borderTopColor,
            borderRight:c.borderRightWidth+' '+c.borderRightColor, br:c.borderRadius, pad:c.padding,
            pos:c.position, disp:c.display, overflow:c.overflow, shadow:c.boxShadow === 'none' ? '' : c.boxShadow,
            fs:c.fontSize, ff:c.fontFamily.split(',')[0], z:c.zIndex};
  };
  const nodes = [];
  const walk = (el, depth, path) => {
    if (nodes.length > 260 || depth > 7) return;
    if (!vis(el)) return;
    const r = R(el);
    // 只保留「框架级」盒子：整行/整列/大卡片，过滤纯文字
    const big = r.w > 120 || r.h > 60;
    if (!big) return;
    const idOrCls = ((el.id ? '#' + el.id : '') + '.' + (el.className || '').toString().trim().split(/\s+/).slice(0, 4).join('.'))
      .replace(/\.$/, '');
    nodes.push({d: depth, p: path, tag: el.tagName.toLowerCase(), sel: idOrCls.slice(0, 130), r, css: css(el),
      text: (el.getAttribute('data-testid') || el.getAttribute('aria-label') || (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48))});
    [...el.children].forEach((ch, i) => walk(ch, depth + 1, path + '/' + i));
  };
  if (document.body) walk(document.body, 0, '');
  const pick = (sel) => { const el = document.querySelector(sel); return el ? {r: R(el), css: css(el)} : null; };
  return {
    url: location.href, title: document.title, ready: document.readyState,
    viewport: {w: innerWidth, h: innerHeight, scrollH: document.documentElement.scrollHeight, dpr: devicePixelRatio},
    theme: {htmlCls: document.documentElement.className, bodyBg: getComputedStyle(document.body).backgroundColor,
            htmlBg: getComputedStyle(document.documentElement).backgroundColor,
            colorScheme: getComputedStyle(document.documentElement).colorScheme},
    landmarks: {header: pick('header'), nav: pick('nav'), aside: pick('aside'), main: pick('main')},
    nodes,
    bodyText: document.body ? document.body.innerText : ''
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
    while isinstance(r, dict) and set(r.keys()) == {'data'} and isinstance(r['data'], dict):
        r = r['data']
    return r


def new_tab(driver, url):
    r = driver.execute_js(json.dumps({"cmd": "tabs", "method": "create", "url": url, "active": False}), timeout=30)
    if isinstance(r, str):
        r = json.loads(r)
    return r['data']['id']


def close_tab(driver, tid):
    try:
        cdp(driver, tid, 'Page.close')
    except Exception:
        pass


def eval_in(driver, tab_id, expr, timeout=60):
    r = cdp(driver, tab_id, "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
    if isinstance(r, dict) and 'result' in r:
        return r['result'].get('value')
    return r


def wait_ready(driver, tid, timeout=45):
    end = time.time() + timeout
    while time.time() < end:
        v = eval_in(driver, tid, "document.readyState + '|' + (document.body ? document.body.innerText.length : 0)")
        if isinstance(v, str) and v.startswith('complete') and int(v.split('|')[1] or 0) > 200:
            time.sleep(1.0)
            return True
        time.sleep(0.8)
    return False


def capture(driver, tid, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    snap = eval_in(driver, tid, FRAME_JS, timeout=90)
    if isinstance(snap, dict):
        snap.pop('bodyText', None)
        json.dump(snap, open(os.path.join(out_dir, 'frame.json'), 'w'), ensure_ascii=False, indent=1)
        txt = eval_in(driver, tid, "document.body ? document.body.innerText : ''") or ''
        open(os.path.join(out_dir, 'text.txt'), 'w').write(txt)
    r = cdp(driver, tid, 'Page.captureScreenshot', {'format': 'jpeg', 'quality': 80})
    data = None
    if isinstance(r, dict):
        data = r.get('data') or (r.get('result') or {}).get('data')
    if data:
        open(os.path.join(out_dir, 'shot.jpg'), 'wb').write(base64.b64decode(data))
    return isinstance(snap, dict), bool(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', required=True)
    ap.add_argument('--url', required=True)
    ap.add_argument('--id', required=True)
    ap.add_argument('--viewport', default='1908x781')
    ap.add_argument('--wait', type=float, default=2.0)
    args = ap.parse_args()
    vw, vh = (int(x) for x in args.viewport.lower().split('x'))

    driver = TMWebDriver()
    tid = new_tab(driver, args.url)
    try:
        cdp(driver, tid, 'Emulation.setDeviceMetricsOverride',
            {'width': vw, 'height': vh, 'deviceScaleFactor': 1, 'mobile': False}, timeout=15)
        time.sleep(args.wait)
        ok = wait_ready(driver, tid)
        snap_ok, shot_ok = capture(driver, tid, os.path.join(EVID, args.side, args.id))
        print(json.dumps({'id': args.id, 'ready': ok, 'snapshot': snap_ok, 'shot': shot_ok}))
    finally:
        close_tab(driver, tid)


if __name__ == '__main__':
    main()

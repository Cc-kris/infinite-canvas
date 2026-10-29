#!/usr/bin/env python3
"""B9 视觉/表单一致性采集器（真实 LinkFox 页面 + 本地页面）。

用法:
  python3 capture_parity.py --side real --ids PRODUCT_IMAGE_SUITE,IMAGE_CROP
  python3 capture_parity.py --side local --all

产物: evidence/b9-visual-parity-20261029/<side>/<ID>/{shot.jpg,shot-full.jpg,form.json,text.txt}
"""
import argparse
import base64
import json
import os
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
EVID = os.path.join(REPO, 'docs/V1.0/plan_linkfox_navigation/evidence/b9-visual-parity-20261029')
ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

SNAP_JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  const vs = el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && r.top < 4200 && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0'; };
  const tx = (el, n) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, n || 40);
  const ctlSel = 'input,textarea,select,button,[role="switch"],[role="tab"],[role="slider"],[contenteditable="true"]';
  const controls = [...document.querySelectorAll(ctlSel)].filter(vs).map(el => {
    const c = getComputedStyle(el), r = R(el);
    return {tag: el.tagName.toLowerCase(), type: el.type || '', role: el.getAttribute('role'),
      text: tx(el), value: (el.value === undefined ? null : el.value), checked: el.checked === undefined ? null : el.checked,
      ariaChecked: el.getAttribute('aria-checked'), ariaSelected: el.getAttribute('aria-selected'),
      ariaLabel: el.getAttribute('aria-label'), ph: el.getAttribute('placeholder'), title: el.getAttribute('title'),
      disabled: !!el.disabled, r,
      css: {bg:c.backgroundColor, color:c.color, fs:c.fontSize, fw:c.fontWeight, bw:c.borderWidth, br:c.borderRadius,
            bc:c.borderColor, pad:c.padding, ff:c.fontFamily.split(',')[0], lh:c.lineHeight},
      cls: (el.className || '').toString().slice(0, 120)};
  });
  const chips = [...document.querySelectorAll('div,span,li,label')].filter(vs).filter(el => {
    const t = tx(el, 16); if (!t || t.length > 16) return false;
    if (el.querySelector('input,textarea,button')) return false;
    const c = getComputedStyle(el);
    if (c.cursor !== 'pointer') return false;
    const r = el.getBoundingClientRect();
    return r.width <= 260 && r.height <= 60;
  }).map(el => { const c = getComputedStyle(el), r = R(el);
    return {text: tx(el,16), r,
      css:{bg:c.backgroundColor, color:c.color, fs:c.fontSize, fw:c.fontWeight, bw:c.borderWidth, bc:c.borderColor,
           br:c.borderRadius, pad:c.padding},
      cls: (el.className || '').toString().slice(0, 120),
      active: /(active|selected|checked|current)/i.test((el.className||'').toString())};
  });
  const labels = [...document.querySelectorAll('div,span,p,label,legend')].filter(vs).filter(el => {
    if (el.children.length > 1) return false; const t = tx(el, 30); return t && t.length <= 30;
  }).map(el => { const c = getComputedStyle(el); return {text: tx(el,30), r: R(el),
      css:{fs:c.fontSize, fw:c.fontWeight, color:c.color, ff:c.fontFamily.split(',')[0]}}; });
  return {url: location.href, title: document.title, ready: document.readyState,
    viewport: {w: innerWidth, h: innerHeight, scrollH: document.documentElement.scrollHeight},
    bodyText: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 8000),
    controls, chips, labels};
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


def close_tab(driver, tab_id):
    try:
        cdp(driver, tab_id, "Page.close", timeout=10)
    except Exception:
        pass


def wait_ready(driver, tab_id, min_chars=300, tries=14):
    for _ in range(tries):
        time.sleep(1)
        try:
            st = eval_in(driver, tab_id, "({s:document.readyState, n:(document.body&&document.body.innerText||'').length})")
            if isinstance(st, dict) and st.get('s') == 'complete' and st.get('n', 0) > min_chars:
                time.sleep(1.2)
                return True
        except Exception:
            pass
    return False


def save_shot(driver, tab_id, path, params):
    r = cdp(driver, tab_id, "Page.captureScreenshot", params)
    data = None
    if isinstance(r, dict):
        data = r.get('data') or (r.get('result') or {}).get('data')
    if data:
        with open(path, 'wb') as f:
            f.write(base64.b64decode(data))
        return True
    return False


def capture(driver, tab_id, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    snap = eval_in(driver, tab_id, SNAP_JS, timeout=60)
    ok = isinstance(snap, dict) and 'bodyText' in snap
    if ok:
        json.dump(snap, open(os.path.join(out_dir, 'form.json'), 'w'), ensure_ascii=False, indent=1)
        open(os.path.join(out_dir, 'text.txt'), 'w').write(snap['bodyText'])
    s1 = save_shot(driver, tab_id, os.path.join(out_dir, 'shot.jpg'), {"format": "jpeg", "quality": 80})
    s2 = save_shot(driver, tab_id, os.path.join(out_dir, 'shot-full.jpg'),
                   {"format": "jpeg", "quality": 70, "captureBeyondViewport": True})
    return ok, s1, s2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', choices=['real', 'local', 'both'], required=True)
    ap.add_argument('--ids', default='')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--url', default='')
    ap.add_argument('--id', default='')
    ap.add_argument('--viewport', default='1908x781', help='强制视口宽x高，与原站采集保持一致')
    args = ap.parse_args()
    vw, vh = (int(x) for x in args.viewport.lower().split('x'))

    manifest = json.load(open(os.path.join(os.path.dirname(__file__), 'b9_manifest.json')))
    if args.id and args.url:
        manifest = [{'id': args.id, 'real': args.url, 'local': ''}]
        ids = [args.id]
    else:
        ids = [t['id'] for t in manifest] if args.all else [s for s in args.ids.split(',') if s]
        manifest = [m for m in manifest if m['id'] in ids]

    driver = TMWebDriver()
    results = {}
    sides = ['real', 'local'] if args.side == 'both' else [args.side]
    for side in sides:
        for item in manifest:
            url = item.get(side) or ''
            if not url:
                results[f"{side}:{item['id']}"] = {'status': 'NO_URL', 'reason': 'real url unknown'}
                print(item['id'], side, 'NO_URL', flush=True)
                continue
            tid = new_tab(driver, url)
            try:
                time.sleep(1.2)
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width": vw, "height": vh, "deviceScaleFactor": 1, "mobile": False}, timeout=15)
                ok = wait_ready(driver, tid)
                snap_ok, s1, s2 = capture(driver, tid, os.path.join(EVID, side, item['id']))
                results[f"{side}:{item['id']}"] = {'url': url, 'ready': ok, 'snapshot': snap_ok,
                                                   'shot': s1, 'shot_full': s2}
                print(item['id'], side, 'ready' if ok else 'TIMEOUT', snap_ok, s1, s2, flush=True)
            finally:
                close_tab(driver, tid)
                time.sleep(0.3)
    # 合并写入
    meta_path = os.path.join(EVID, '_capture.json')
    os.makedirs(EVID, exist_ok=True)
    meta = {}
    if os.path.exists(meta_path):
        meta = json.load(open(meta_path))
    meta.update(results)
    json.dump(meta, open(meta_path, 'w'), ensure_ascii=False, indent=1)
    print('DONE', len(results))


if __name__ == '__main__':
    main()

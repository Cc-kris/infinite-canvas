#!/usr/bin/env python3
"""共享框架响应式探针：每个视口宽度单独开一个标签只做一次 Emulation override。

背景：同一标签连续 setDeviceMetricsOverride 时，Chrome 会把窗口尺寸夹在最小宽度
（实测 1908→1440 生效，1440→1280 起被夹住，innerWidth 恒 1440），因此每个宽度用新标签。

用法:
  python3 probe_responsive.py --side real --url "https://www.linkfox.com/draw/ai-outpainting" --id AI_OUTPAINTING
  python3 probe_responsive.py --side local --url "http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting" --id AI_OUTPAINTING
"""
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from probe_frame import TMWebDriver, cdp, new_tab, close_tab, eval_in, wait_ready  # noqa: E402

EVID = os.path.abspath(os.path.join(HERE, '..', 'evidence', 'b12-frame-parity-20261029'))
WIDTHS = [1908, 1440, 1280, 1024, 900, 768, 480]

METRICS_JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}; };
  const vis = el => { if (!el) return false; const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0; };
  const q = s => document.querySelector(s);
  const aside = q('aside') || q('[data-testid=tool-sidebar]');
  const promo = q('._wrap_scegn_1') || q('[data-testid=promo-bar]');
  const navHead = q('header') || q('._head_139v7_55');
  const main = q('main') || q('.ant-layout._bodyLayout_1sq7k_81');
  const navMenu = q('._menuBox_139v7_125') || q('[data-testid=tools-nav-primary]');
  const burgers = [...document.querySelectorAll('button,[role=button]')].filter(b => {
    const label = (b.getAttribute('aria-label') || '') + (b.dataset.testid || '');
    return /menu|drawer|打开|导航|nav/i.test(label) && vis(b);
  }).map(b => ({label:(b.getAttribute('aria-label')||b.dataset.testid||''), r:R(b)}));
  const rows = aside ? [...aside.querySelectorAll('li, a[data-tool-id]')].slice(0, 3).map(el => ({t:(el.innerText||'').trim().slice(0,10), r:R(el)})) : [];
  return JSON.stringify({
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    scrollW: document.documentElement.scrollWidth,
    aside: aside ? {r:R(aside), display:getComputedStyle(aside).display, visible:vis(aside), width:getComputedStyle(aside).width, position:getComputedStyle(aside).position} : null,
    promo: promo ? {r:R(promo), h:getComputedStyle(promo).height, visible:vis(promo)} : null,
    nav: navHead ? {r:R(navHead), h:getComputedStyle(navHead).height} : null,
    navMenu: navMenu ? {r:R(navMenu), visible:vis(navMenu)} : null,
    main: main ? {r:R(main), pad:getComputedStyle(main).padding} : null,
    burgers, rows,
    bodyBg: getComputedStyle(document.body).backgroundColor
  }, null, 1);
})()
"""


def safe_eval(driver, tid, expr, timeout=60, tries=4):
    last = None
    for _ in range(tries):
        try:
            return eval_in(driver, tid, expr, timeout=timeout)
        except Exception as exc:  # 标签刚建好时 driver 会话可能还没连上
            last = exc
            time.sleep(1.5)
    raise last


def measure_at(driver, width, url, wait, shot=None, label=''):
    tid = new_tab(driver, url)
    try:
        time.sleep(1.2)
        cdp(driver, tid, 'Emulation.setDeviceMetricsOverride',
            {'width': width, 'height': 781, 'deviceScaleFactor': 1, 'mobile': False}, timeout=15)
        time.sleep(wait)
        for _ in range(4):
            state = safe_eval(driver, tid, "document.readyState + '|' + (document.body ? document.body.innerText.length : 0)")
            if isinstance(state, str) and state.startswith('complete') and int(state.split('|')[1] or 0) > 200:
                break
            time.sleep(1.2)
        time.sleep(0.6)
        v = safe_eval(driver, tid, METRICS_JS, timeout=60)
        data = json.loads(v) if isinstance(v, str) else v
        if shot:
            r = cdp(driver, tid, 'Page.captureScreenshot', {'format': 'jpeg', 'quality': 70})
            d = r.get('data') if isinstance(r, dict) else None
            if d:
                os.makedirs(shot, exist_ok=True)
                open(os.path.join(shot, f'{label}-{width}.jpg'), 'wb').write(base64.b64decode(d))
        return data
    finally:
        close_tab(driver, tid)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--side', required=True)
    ap.add_argument('--url', required=True)
    ap.add_argument('--id', required=True)
    ap.add_argument('--wait', type=float, default=1.8)
    ap.add_argument('--shot', action='store_true')
    args = ap.parse_args()

    driver = TMWebDriver()
    out = {'side': args.side, 'url': args.url, 'id': args.id, 'widths': {}}
    shot_dir = os.path.join(EVID, 'responsive') if args.shot else None
    for w in WIDTHS:
        out['widths'][str(w)] = measure_at(driver, w, args.url, args.wait, shot_dir,
                                           f'{args.side}-{args.id}')

    d = os.path.join(EVID, 'responsive')
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f'{args.side}-{args.id}.json')
    json.dump(out, open(p, 'w'), ensure_ascii=False, indent=1)
    print(p)
    for w, m in out['widths'].items():
        if isinstance(m, dict):
            print(w, 'vw', m.get('vw'), 'scrollW', m.get('scrollW'),
                  'aside', (m.get('aside') or {}).get('width'), 'visible', (m.get('aside') or {}).get('visible'),
                  'main', (m.get('main') or {}).get('r', {}).get('w'),
                  'promo', (m.get('promo') or {}).get('h'), 'burgers', len(m.get('burgers') or []))


if __name__ == '__main__':
    main()

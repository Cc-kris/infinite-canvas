#!/usr/bin/env python3
"""B12 共享框架终验：6 视口 × 双端同状态 + 本地暗色主题。

用法:
  python3 probe_shell_responsive.py --side real  --url https://www.linkfox.com/draw/ai-outpainting
  python3 probe_shell_responsive.py --side local --url http://127.0.0.1:3000/tools/ecommerce-suite/ai-outpainting --dark

产物: evidence/b12-shell-responsive-20261029/<side>/<width>/{measure.json,shot.jpg}
"""
import argparse
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from probe_frame import TMWebDriver, cdp, new_tab, close_tab, eval_in, wait_ready  # noqa: E402

EVID = os.path.join(HERE, "..", "evidence", "b12-shell-responsive-20261029")

MEASURE_JS = r"""
(() => {
  const R = (el) => { const r = el.getBoundingClientRect();
    return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; };
  const Q = (sel) => document.querySelector(sel);
  const M = (sel) => { const el = Q(sel); if (!el) return null;
    const c = getComputedStyle(el); const r = R(el);
    const visible = r.w > 0 && r.h > 0 && c.display !== 'none' && c.visibility !== 'hidden';
    return {...r, visible, bg: c.backgroundColor, color: c.color, fs: c.fontSize, lh: c.lineHeight,
            pos: c.position, z: c.zIndex, pad: c.padding, border: c.borderTopWidth + ' ' + c.borderTopColor}; };
  const navItems = [...document.querySelectorAll('[data-testid^="tools-nav-trigger"]')].map((el) => {
    const c = getComputedStyle(el);
    return {label: (el.innerText || '').trim().replace(/\s+/g, ' '), ...R(el),
            color: c.color, fs: c.fontSize, active: el.getAttribute('data-active') === 'true'};
  });
  const aside = Q('[data-testid="tool-sidebar"]');
  const rows = aside ? [...aside.querySelectorAll('a')].map((el) => {
    const c = getComputedStyle(el);
    return {label: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 14), ...R(el),
            color: c.color, bg: c.backgroundColor, active: el.getAttribute('data-active') === 'true'};
  }) : [];
  const navEl = Q('[data-testid="tools-nav-primary"] nav');
  return {
    url: location.href, vw: innerWidth, vh: innerHeight,
    scrollW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    theme: {htmlCls: document.documentElement.className,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            colorScheme: getComputedStyle(document.documentElement).colorScheme},
    promo: M('[data-testid="shell-promo-bar"]'),
    promoClose: M('[data-testid="shell-promo-close"]'),
    header: M('[data-testid="shell-top-nav"]'),
    brand: M('[data-testid="shell-top-nav"] a'),
    hamburger: M('[data-testid="tools-nav-mobile-trigger"]'),
    nav: M('[data-testid="tools-nav-primary"]'),
    navScroll: navEl ? {clientW: navEl.clientWidth, scrollW: navEl.scrollWidth} : null,
    navItems,
    userArea: M('[data-testid="shell-user-area"]'),
    learn: M('a[data-testid="shell-user-learning-center"][data-visible], [data-testid="shell-user-learning-center"]'),
    free: M('[data-testid="shell-user-free-quota"]'),
    points: M('[data-testid="shell-user-points"]'),
    userTrigger: M('[data-testid="shell-user-menu-trigger"]'),
    avatar: M('[data-testid="shell-user-avatar"]'),
    userName: M('[data-testid="shell-user-name"]'),
    aside: M('[data-testid="tool-sidebar"]'),
    shellNavTrigger: M('[data-testid="tool-shell-nav-trigger"]'),
    main: M('main'),
    asideRows: rows,
    asideRowsCount: rows.length
  };
})()
"""


def capture(driver, tid, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    data = eval_in(driver, tid, MEASURE_JS, timeout=90)
    if isinstance(data, dict):
        json.dump(data, open(os.path.join(out_dir, "measure.json"), "w"), ensure_ascii=False, indent=1)
    r = cdp(driver, tid, "Page.captureScreenshot", {"format": "jpeg", "quality": 82})
    shot = None
    if isinstance(r, dict):
        shot = r.get("data") or (r.get("result") or {}).get("data")
    if shot:
        open(os.path.join(out_dir, "shot.jpg"), "wb").write(base64.b64decode(shot))
    return data, bool(shot)


def set_theme(driver, tid, theme):
    eval_in(driver, tid, "localStorage.setItem('infinite-canvas:theme_store', JSON.stringify({state:{theme:'%s'},version:0}))" % theme)
    eval_in(driver, tid, "location.reload()")
    time.sleep(2.0)
    wait_ready(driver, tid, timeout=40)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", required=True, choices=["real", "local"])
    ap.add_argument("--url", required=True)
    ap.add_argument("--widths", default="1908,1440,1280,1024,768,390")
    ap.add_argument("--dark", action="store_true", help="(local) 每个视口额外采集暗色")
    args = ap.parse_args()
    widths = [int(w) for w in args.widths.split(",")]
    driver = TMWebDriver()
    summary = []
    for w in widths:
        tid = new_tab(driver, args.url)
        try:
            cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": False}, timeout=20)
            time.sleep(1.2)
            wait_ready(driver, tid, timeout=40)
            time.sleep(0.8)
            if args.dark:
                set_theme(driver, tid, "light")
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": False}, timeout=20)
                time.sleep(1.0)
            data, shot = capture(driver, tid, os.path.join(EVID, args.side, str(w)))
            row = {"side": args.side, "width": w, "shot": shot, "theme": "light",
                   "vw": (data or {}).get("vw"), "scrollW": (data or {}).get("scrollW"),
                   "overflowX": (data or {}).get("overflowX"),
                   "bodyBg": ((data or {}).get("theme") or {}).get("bodyBg")}
            summary.append(row)
            if args.dark:
                set_theme(driver, tid, "dark")
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": False}, timeout=20)
                time.sleep(1.0)
                ddata, dshot = capture(driver, tid, os.path.join(EVID, args.side + "-dark", str(w)))
                summary.append({"side": args.side + "-dark", "width": w, "shot": dshot, "theme": "dark",
                                "vw": (ddata or {}).get("vw"), "scrollW": (ddata or {}).get("scrollW"),
                                "overflowX": (ddata or {}).get("overflowX"),
                                "bodyBg": ((ddata or {}).get("theme") or {}).get("bodyBg")})
                set_theme(driver, tid, "light")
            print(json.dumps(summary[-1], ensure_ascii=False))
        finally:
            close_tab(driver, tid)
    json.dump(summary, open(os.path.join(EVID, "summary-%s.json" % args.side), "w"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

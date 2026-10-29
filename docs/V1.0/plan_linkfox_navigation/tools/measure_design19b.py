#!/usr/bin/env python3
"""design19b 后 9 工具双端 DOM 结构测量（布局/页签/CTA/品牌残留）。

用法: python3 measure_design19b.py --side local|real|both [--ids A,B] [--out path]
产物: 默认写 evidence/design19b-visual-parity-20261029/measure-<side>.json
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "/Applications/Galley.app/Contents/Resources/managed-ga/code")
from capture_parity import REPO, cdp, eval_in, new_tab, close_tab, wait_ready  # noqa: E402
from TMWebDriver import TMWebDriver  # noqa: E402

EVID = os.path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/design19b-visual-parity-20261029")
MAN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "design19b_manifest.json")

MEASURE_JS = r"""
(() => {
  const R = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  const vis = el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0'; };
  const all = [...document.querySelectorAll('body *')].filter(vis);
  const rail = all.filter(e => { const r = e.getBoundingClientRect();
      return r.width >= 280 && r.width <= 320 && r.height >= 200 && r.left >= 170 && r.left <= 230; })
    .map(e => { const c = getComputedStyle(e); return {r: R(e), bg: c.backgroundColor, br: c.borderRadius,
      cls: (e.className || '').toString().slice(0, 90)}; }).slice(0, 5);
  const panel = all.map(e => ({ e, c: getComputedStyle(e) }))
    .filter(o => o.c.backgroundColor === 'rgb(237, 239, 245)')
    .map(o => ({ r: R(o.e), cls: (o.e.className || '').toString().slice(0, 60) })).slice(0, 5);
  const whiteHeaders = all.map(e => ({ e, c: getComputedStyle(e) }))
    .filter(o => o.c.backgroundColor === 'rgb(255, 255, 255)' && o.e.getBoundingClientRect().height >= 38
      && o.e.getBoundingClientRect().height <= 48 && o.e.getBoundingClientRect().width > 500)
    .map(o => ({ r: R(o.e), cls: (o.e.className || '').toString().slice(0, 60) })).slice(0, 5);
  const btns = [...document.querySelectorAll('button,[role="button"],[role="tab"]')].filter(vis)
    .map(e => ({ t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34), r: R(e),
      sel: e.getAttribute('aria-selected') })).slice(0, 60);
  const txt = document.body.innerText || '';
  const card = all.filter(e => { const r = e.getBoundingClientRect();
      return r.width > 1200 && r.height > 500 && r.left >= 180 && r.left <= 210; })
    .map(e => { const c = getComputedStyle(e); return {r: R(e), bg: c.backgroundColor, br: c.borderRadius,
      bc: c.borderColor, bw: c.borderWidth}; }).slice(0, 3);
  return {
    url: location.href, viewport: {w: innerWidth, h: innerHeight},
    bodyBg: getComputedStyle(document.body).backgroundColor,
    card, rail, panel, whiteHeaders, btns,
    tabs: ['生成结果', '优秀案例', '历史记录'].filter(t => txt.includes(t)),
    cta: btns.filter(b => /生成|算力/.test(b.t)).map(b => b.t).slice(0, 8),
    linkfox: /linkfox/i.test(txt),
    headerFixture: /\/tools\/[a-z-]+\/[a-z-]+/.test(txt),
    brandHits: (txt.match(/linkfox/gi) || []).length,
  };
})()
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--side", choices=["local", "real", "both"], required=True)
    ap.add_argument("--ids", default="")
    ap.add_argument("--out", default="")
    ap.add_argument("--viewport", default="1908x781")
    a = ap.parse_args()
    vw, vh = (int(x) for x in a.viewport.lower().split("x"))
    man = json.load(open(MAN))
    if a.ids:
        keep = [s for s in a.ids.split(",") if s]
        man = [m for m in man if m["id"] in keep]
    driver = TMWebDriver()
    res = {}
    for side in (["real", "local"] if a.side == "both" else [a.side]):
        for m in man:
            t0 = time.time()
            tid = None
            try:
                tid = new_tab(driver, m[side])
                time.sleep(1.0)
                cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                    {"width": vw, "height": vh, "deviceScaleFactor": 1, "mobile": False}, timeout=15)
                wait_ready(driver, tid, min_chars=100, tries=18)
                data = eval_in(driver, tid, MEASURE_JS, timeout=60)
                if isinstance(data, str):
                    data = json.loads(data)
                data["sec"] = round(time.time() - t0, 1)
                res[f"{side}:{m['id']}"] = data
                print(f"{side} {m['id']} tabs={data.get('tabs')} cta={data.get('cta')} "
                      f"rail={[r['r']['w'] for r in data.get('rail', [])]} panel={len(data.get('panel', []))} "
                      f"lf={data.get('brandHits')}", flush=True)
            except Exception as e:
                res[f"{side}:{m['id']}"] = {"error": repr(e)[:300]}
                print(f"{side} {m['id']} ERROR {e!r}", flush=True)
            finally:
                if tid is not None:
                    close_tab(driver, tid)
                time.sleep(0.3)
    out = a.out or os.path.join(EVID, f"measure-{a.side}.json")
    old = {}
    if os.path.exists(out):
        try:
            old = json.load(open(out))
        except Exception:
            old = {}
    old.update(res)
    json.dump(old, open(out, "w"), ensure_ascii=False, indent=1)
    print("DONE", len(res), "->", out)


if __name__ == "__main__":
    main()

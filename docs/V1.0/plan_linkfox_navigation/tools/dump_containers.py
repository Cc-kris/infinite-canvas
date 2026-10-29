#!/usr/bin/env python3
"""原站/本地容器级 DOM 取证：depth 限制的容器树（rect/bg/border/radius/padding/font）。

用法: python3 dump_containers.py --url <url> --out <json路径> [--depth 7] [--minarea 400]
自开自闭标签，不触碰用户原有标签。
"""
import argparse, json, os, sys, time

ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

DUMP_JS = r"""
(args) => {
  const maxDepth = args.depth, minArea = args.minarea, clipW = args.w, clipH = args.h;
  const R = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
  const px = v => Math.round(parseFloat(v) || 0);
  const out = [];
  const walk = (el, depth, path) => {
    if (depth > maxDepth) return;
    const rect = R(el);
    if (rect.w * rect.h < minArea) return;
    if (rect.y > 1400 || rect.x > clipW + 40) return;
    const c = getComputedStyle(el);
    if (c.display === 'none' || c.visibility === 'hidden') return;
    const kids = [...el.children];
    const bg = c.backgroundColor;
    const bw = px(c.borderTopWidth);
    const interesting = bg !== 'rgba(0, 0, 0, 0)' || bw > 0 || c.boxShadow !== 'none'
      || c.display === 'flex' || c.display === 'grid' || c.position === 'fixed' || c.position === 'absolute';
    if (interesting) {
      out.push({
        p: path, d: depth, tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 90),
        rect, bg, bd: bw > 0 ? `${c.borderTopWidth} ${c.borderStyle} ${c.borderTopColor}` : null,
        br: c.borderRadius, pad: c.padding, gap: c.gap, disp: c.display, pos: c.position,
        fs: c.fontSize, fw: c.fontWeight, color: c.color, lh: c.lineHeight,
        txt: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70),
        n: kids.length
      });
    }
    kids.forEach((k, i) => walk(k, depth + 1, path + '/' + i));
  };
  walk(document.body, 0, '');
  return {url: location.href, viewport: {w: innerWidth, h: innerHeight}, nodes: out};
}
"""


def cdp(driver, tab_id, method, params=None, timeout=40):
    payload = json.dumps({"cmd": "cdp", "method": method, "tabId": int(tab_id), "params": params or {}})
    r = driver.execute_js(payload, timeout=timeout)
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:
            return r
    while isinstance(r, dict) and set(r.keys()) == {"data"} and isinstance(r["data"], dict):
        r = r["data"]
    return r


def eval_in(driver, tab_id, expr, timeout=60):
    r = cdp(driver, tab_id, "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
    if isinstance(r, dict) and "result" in r:
        return r["result"].get("value")
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--depth", type=int, default=7)
    ap.add_argument("--minarea", type=int, default=400)
    ap.add_argument("--w", type=int, default=1908)
    ap.add_argument("--h", type=int, default=781)
    a = ap.parse_args()
    d = TMWebDriver()
    r = d.execute_js(json.dumps({"cmd": "tabs", "method": "create", "url": a.url, "active": False}), timeout=30)
    if isinstance(r, str):
        r = json.loads(r)
    tid = r["data"]["id"]
    try:
        time.sleep(1.0)
        cdp(d, tid, "Emulation.setDeviceMetricsOverride",
            {"width": a.w, "height": a.h, "deviceScaleFactor": 1, "mobile": False}, timeout=15)
        for _ in range(20):
            time.sleep(1.0)
            st = eval_in(d, tid, "({s:document.readyState,n:(document.body&&document.body.innerText||'').length})")
            if isinstance(st, dict) and st.get("s") == "complete" and st.get("n", 0) > 250:
                break
        time.sleep(1.5)
        res = eval_in(d, tid, f"({DUMP_JS})({json.dumps({'depth': a.depth, 'minarea': a.minarea, 'w': a.w, 'h': a.h})})")
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=1)
        print("OK", a.out, len((res or {}).get("nodes", [])), (res or {}).get("url"))
    finally:
        try:
            cdp(d, tid, "Page.close", timeout=10)
        except Exception:
            pass


if __name__ == "__main__":
    main()

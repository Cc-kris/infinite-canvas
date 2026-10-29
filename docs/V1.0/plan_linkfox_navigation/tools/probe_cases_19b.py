#!/usr/bin/env python3
"""design19 后 9 工具 · 优秀案例模块核对（原站真实 Chrome）。

只读探测：为每个工具开一个自己的后台标签，点开「优秀案例」页签，
落 case DOM 事实（页签文案/位置、案例数、封面、参数标签、按钮、容器）
与截图到 evidence/design19b-cases-20261029/real/<ID>/。

用法: python3 probe_cases_19b.py [--ids A,B]
"""
import argparse
import base64
import json
import os
import sys
import time

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS_DIR)
from capture_parity import cdp, eval_in, new_tab, close_tab, wait_ready  # noqa: E402

ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

REPO = os.path.abspath(os.path.join(TOOLS_DIR, "..", "..", "..", ".."))
EVID = os.path.join(REPO, "docs/V1.0/plan_linkfox_navigation/evidence/design19b-cases-20261029")

MANIFEST = [
    {"id": "PRINT_EXTRACT", "url": "https://www.linkfox.com/draw/print-extract"},
    {"id": "AI_POSE_GENERATOR", "url": "https://www.linkfox.com/draw/ai-posture"},
    {"id": "AI_DRESSING_XSY", "url": "https://www.linkfox.com/draw/ai-dressing"},
    {"id": "FISSION_LINK", "url": "https://www.linkfox.com/draw/product-scene?type=2"},
    {"id": "IMAGE_TEXT_EDIT", "url": "https://www.linkfox.com/draw/designer-home"},
    {"id": "MATERIAL_UPPER_BODY", "url": "https://www.linkfox.com/draw/clothing-image-suite"},
    {"id": "NEW_DESIGNER", "url": "https://www.linkfox.com/draw/designer-home"},
    {"id": "PRODUCT_MARKET_MATERIAL", "url": "https://www.linkfox.com/draw/product-image-suite?batchType=PRODUCT_MATERIAL"},
    {"id": "SCENE_TRANSFER", "url": "https://www.linkfox.com/draw/product-scene?type=2"},
]

PROBE_JS = r"""
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tx = e => (e ? (e.innerText || e.textContent || '') : '').trim().replace(/\s+/g, ' ');
  const R = e => { const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; };
  await sleep(1500);
  const tabBtns = [...document.querySelectorAll('.ant-tabs-tab-btn')];
  const labels = tabBtns.map(e => ({t: tx(e), r: R(e), active: !!e.closest('.ant-tabs-tab-active')}));
  const caseTab = tabBtns.find(e => tx(e) === '优秀案例');
  let caseInfo = null;
  if (caseTab) {
    caseTab.click();
    await sleep(2500);
    const group = caseTab.closest('.ant-tabs');
    const pane = [...group.querySelectorAll('.ant-tabs-tabpane')].find(x => x.offsetParent !== null);
    if (pane) {
      let last = -1;
      for (let i = 0; i < 8; i++) {
        pane.scrollTop = pane.scrollHeight;
        await sleep(700);
        if (pane.scrollHeight === last) break;
        last = pane.scrollHeight;
      }
      pane.scrollTop = 0;
      await sleep(500);
      const boxes = [...pane.querySelectorAll('[class*="_imageBox_"]')];
      const recs = boxes.map(b => {
        const im = [...b.querySelectorAll('img')];
        const paramLabels = [...b.querySelectorAll('[class*="_paramInfo_"] span')].map(tx).filter(Boolean);
        const btns = [...b.querySelectorAll('button')].map(tx).filter(Boolean);
        const mask = b.querySelector('[class*="_mask_"]');
        return {
          result: im[0] ? im[0].getAttribute('src') : '',
          alt: im[0] ? im[0].getAttribute('alt') : '',
          params: im.slice(1).map(i => ({src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight})),
          paramLabels: paramLabels,
          btns: btns,
          maskText: mask ? tx(mask) : '',
          r: R(b),
        };
      });
      const content = pane.querySelector('[class*="_content_"]');
      const cs = content ? getComputedStyle(content) : null;
      caseInfo = {
        count: boxes.length,
        pane: R(pane),
        contentCls: content ? content.className : '',
        padding: cs ? cs.padding : '',
        txt: pane.innerText.slice(0, 240).replace(/\n/g, '|'),
        recs: recs,
      };
    }
  }
  return {
    url: location.href, title: document.title, ready: document.readyState,
    viewport: {w: innerWidth, h: innerHeight},
    labels, caseInfo,
    bodyText: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 4000),
  };
})()
"""


def shot(driver, tab_id, path, clip=None):
    params = {"format": "jpeg", "quality": 82}
    if clip:
        params["clip"] = {**clip, "scale": 1}
    r = cdp(driver, tab_id, "Page.captureScreenshot", params)
    data = None
    if isinstance(r, dict):
        data = r.get("data") or (r.get("result") or {}).get("data")
    if data:
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    args = ap.parse_args()
    want = [s for s in args.ids.split(",") if s]
    items = [m for m in MANIFEST if not want or m["id"] in want]

    driver = TMWebDriver()
    summary = {}
    for item in items:
        tid = new_tab(driver, item["url"])
        out_dir = os.path.join(EVID, "real", item["id"])
        os.makedirs(out_dir, exist_ok=True)
        try:
            time.sleep(1.2)
            cdp(driver, tid, "Emulation.setDeviceMetricsOverride",
                {"width": 1908, "height": 781, "deviceScaleFactor": 1, "mobile": False}, timeout=15)
            wait_ready(driver, tid)
            info = eval_in(driver, tid, PROBE_JS, timeout=90)
            if not isinstance(info, dict):
                info = {"error": str(info)[:300], "url": item["url"]}
            info["id"] = item["id"]
            info["probeUrl"] = item["url"]
            json.dump(info, open(os.path.join(out_dir, "cases.json"), "w"), ensure_ascii=False, indent=1)
            ok1 = shot(driver, tid, os.path.join(out_dir, "shot.jpg"))
            ci = info.get("caseInfo")
            ok2 = False
            if ci and ci.get("pane"):
                p = ci["pane"]
                # 视口内裁剪
                h = min(p["h"], 781 - p["y"] - 4)
                if h > 40:
                    ok2 = shot(driver, tid, os.path.join(out_dir, "cases.jpg"),
                               {"x": p["x"], "y": p["y"], "width": min(p["w"], 1908 - p["x"] - 2), "height": h})
            cnt = ci["count"] if ci else None
            summary[item["id"]] = {"caseTab": bool(ci), "count": cnt, "shots": [ok1, ok2]}
            print(item["id"], "caseTab=", bool(ci), "count=", cnt, "shots=", ok1, ok2, flush=True)
        except Exception as e:  # noqa: BLE001
            summary[item["id"]] = {"error": str(e)[:200]}
            print(item["id"], "ERROR", e, flush=True)
        finally:
            close_tab(driver, tid)
            time.sleep(0.4)

    json.dump(summary, open(os.path.join(EVID, "real", "_summary.json"), "w"), ensure_ascii=False, indent=1)
    print("DONE")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""R7 design19 历史取证驱动（只读真实任务，不注入、不重跑）。

对每个工具路由做 hard navigation（等价 fresh reload），等待 hydrate，
再展开历史坞每一行，抓 DOM 证据 + localStorage 任务记录，落盘 JSON。
"""
import json
import os
import sys
import time
from pathlib import Path

# 本机 18765 master 不能被系统代理（127.0.0.1:7890）劫持
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
    os.environ.pop(_k, None)
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

TAB_ID = "1709629220"
ORIGIN = "http://127.0.0.1:3000"
OUT = Path("/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r7-d19-history-20261029")

TOOLS = [
    ("NEW_REPLACE_BG_V2", "new-replace-bg-v2"),
    ("REPLACE_GOODS", "replace-goods"),
    ("PRODUCT_SCENE", "product-scene"),
    ("HANDHELD_GOODS", "handheld-goods"),
    ("AI_DRESSING_V2", "ai-dressing-v2"),
    ("AI_POSTURE", "ai-posture"),
    ("AI_WEARABLE", "ai-wearable"),
    ("PRINT_EXTRACT", "print-extract"),
    ("AI_POSE_GENERATOR", "ai-pose-generator"),
    ("IMAGE_TEXT_EDIT", "image-text-edit"),
    ("MATERIAL_UPPER_BODY", "material-upper-body"),
    ("NEW_DESIGNER", "new-designer"),
    ("PRODUCT_MARKET_MATERIAL", "product-market-material"),
]

CAPTURE_JS = r"""
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
  const dock = document.querySelector('[data-testid="tool-history-dock"]');
  const out = {
    path: location.pathname,
    href: location.href,
    readyState: document.readyState,
    dockToolId: dock ? dock.dataset.toolId : null,
    hasDock: !!dock,
    count: txt(document.querySelector('[data-testid="tool-history-dock-count"]')),
    empty: txt(document.querySelector('[data-testid="tool-history-dock-empty"]')),
    rows: [],
    ownHistorySurfaces: [],
  };
  // 自带历史面板（WORKSPACE_OWN_HISTORY 豁免板，如 PRODUCT_SCENE）
  for (const el of document.querySelectorAll('[data-testid]')) {
    const tid = el.getAttribute('data-testid') || '';
    if (tid !== 'tool-history-dock' && /histor|task-recovery|recent/i.test(tid)) {
      out.ownHistorySurfaces.push({ testid: tid, text: txt(el)?.slice(0, 200) });
    }
  }
  const lis = [...document.querySelectorAll('[data-testid="tool-history-dock-item"]')];
  for (const li of lis) {
    const rec = {
      taskId: li.getAttribute('data-task-id'),
      status: li.getAttribute('data-task-status'),
      time: txt(li.querySelector('[data-testid="tool-history-dock-time"]')),
      summary: txt(li.querySelector('[data-testid="tool-history-dock-summary"]')),
      headline: txt(li.querySelector('[data-testid="tool-history-dock-toggle"]')),
      thumbs: [...li.querySelectorAll('img')].map(img => ({ src: (img.getAttribute('src') || '').slice(0, 120), complete: img.complete, w: img.naturalWidth, h: img.naturalHeight })),
      videoBadge: txt(li.querySelector('[data-testid="tool-history-dock-video-badge"]')),
      payloadDropped: txt(li.querySelector('[data-testid="tool-history-dock-payload-dropped"]')),
      error: txt(li.querySelector('[data-testid="tool-history-dock-error"]')),
      actions: [],
      detail: null,
    };
    const toggle = li.querySelector('[data-testid="tool-history-dock-toggle"]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') { toggle.click(); await sleep(320); }
    for (const b of li.querySelectorAll('button, [role="button"]')) {
      if (b === toggle) continue;
      const label = txt(b) || b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('data-testid');
      const testid = b.getAttribute('data-testid');
      if (!label && !testid) continue;
      const download = b.querySelector('a[download], [data-testid="tool-history-dock-canvas"]');
      rec.actions.push({ label: (label || '').slice(0, 60), testid, disabled: !!b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), href: download ? (download.getAttribute('href') || '').slice(0, 100) : null });
    }
    const panel = li.querySelector('[data-testid="tool-history-config"], [data-testid="tool-history-dock-config"]');
    rec.detail = txt(panel || li).slice(0, 1500);
    const imgs2 = [...li.querySelectorAll('img')];
    if (imgs2.length) { await sleep(200); rec.thumbs = imgs2.map(img => ({ src: (img.getAttribute('src') || '').slice(0, 120), complete: img.complete, w: img.naturalWidth, h: img.naturalHeight })); }
    out.rows.push(rec);
  }
  // localStorage 里该工具的真实任务（含未进索引的孤儿）
  try {
    const toolId = out.dockToolId || null;
    const all = [];
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('tool-task:v1:task-')) continue;
      try { all.push({ key: k, rec: JSON.parse(localStorage[k]) }); } catch {}
    }
    const mine = toolId ? all.filter(x => x.rec.toolId === toolId) : [];
    out.storedTasks = mine.map(({ key, rec }) => ({
      key,
      id: rec.id, status: rec.status, capability: rec.capability,
      createdAt: rec.createdAt, updatedAt: rec.updatedAt, finishedAt: rec.finishedAt,
      model: rec.configSnapshot && rec.configSnapshot.model,
      items: ((rec.result && rec.result.items) || []).map(it => ({ id: it.id, kind: it.kind, mimeType: it.mimeType, bytes: it.bytes, storageKey: it.storageKey || null, payloadDropped: !!it.payloadDropped, url: (it.url || '').slice(0, 120) })),
      itemCount: ((rec.result && rec.result.items) || []).length,
      errorMessage: rec.result && rec.result.error ? String(rec.result.error).slice(0, 200) : null,
    }));
    out.indexIds = (() => { try { return JSON.parse(localStorage['tool-task:v1:index'] || '[]'); } catch { return []; } })();
    out.indexHasMine = out.storedTasks.map(t => ({ id: t.id, inIndex: out.indexIds.includes(t.id) }));
  } catch (e) {
    out.storageError = String(e);
  }
  return JSON.stringify(out);
})()
"""


def call(driver, js, tab_id=TAB_ID, timeout=40):
    res = driver.execute_js(js, timeout=timeout, session_id=str(tab_id))
    if isinstance(res, dict):
        data = res.get("data", res)
    else:
        data = res
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            return {"raw": data}
    return data


def navigate(driver, url):
    payload = json.dumps({"cmd": "cdp", "method": "Page.navigate", "tabId": int(TAB_ID), "params": {"url": url}})
    try:
        driver.execute_js(payload, timeout=20)
    except Exception as e:
        print(f"  nav warn: {e}", file=sys.stderr)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    driver = TMWebDriver()
    summary = []
    only = sys.argv[1:]
    for tool_id, slug in TOOLS:
        if only and tool_id not in only:
            continue
        url = f"{ORIGIN}/tools/product-design/{slug}"
        print(f"[{tool_id}] -> {url}")
        navigate(driver, url)
        data = None
        for attempt in range(14):
            time.sleep(1.2)
            try:
                data = call(driver, "JSON.stringify({readyState:document.readyState, path:location.pathname, hasDock:!!document.querySelector('[data-testid=\"tool-history-dock\"]')})")
            except Exception as e:
                print(f"  poll err: {e}", file=sys.stderr)
                continue
            if data.get("path") == f"/tools/product-design/{slug}" and data.get("readyState") == "complete":
                break
        # 等 hydrate + 首帧渲染；PRODUCT_SCENE 等工具坞挂载较晚，最多再等 8s
        for _ in range(20):
            time.sleep(0.4)
            try:
                if call(driver, "!!document.querySelector('[data-testid=\"tool-history-dock\"]')"):
                    break
            except Exception:
                pass
        time.sleep(1.2)
        try:
            cap = call(driver, CAPTURE_JS, timeout=90)
        except Exception as e:
            cap = {"error": f"{type(e).__name__}: {e}"}
        cap["toolIdExpected"] = tool_id
        cap["urlExpected"] = url
        (OUT / f"tool-{slug}.json").write_text(json.dumps(cap, ensure_ascii=False, indent=1), encoding="utf-8")
        row_info = {
            "toolId": tool_id,
            "slug": slug,
            "count": cap.get("count"),
            "empty": (cap.get("empty") or "")[:40] or None,
            "rows": len(cap.get("rows") or []),
            "stored": len(cap.get("storedTasks") or []),
            "payloadDropped": sum(1 for r in (cap.get("rows") or []) if r.get("payloadDropped")),
            "thumbsOk": sum(1 for r in (cap.get("rows") or []) for t in (r.get("thumbs") or []) if t.get("w", 0) > 0),
            "ownSurfaces": len(cap.get("ownHistorySurfaces") or []),
            "error": cap.get("error"),
        }
        summary.append(row_info)
        print("   ", json.dumps(row_info, ensure_ascii=False))
    (OUT / "capture-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    print("summary ->", OUT / "capture-summary.json")


if __name__ == "__main__":
    main()

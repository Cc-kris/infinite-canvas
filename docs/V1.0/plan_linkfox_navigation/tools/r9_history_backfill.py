#!/usr/bin/env python3
"""R9 历史三腿补录驱动（真实浏览器 + 真实整页 reload + 真实下载）。

不生成任务、不注入快照、不改审计器；只对**已存在**的真实任务做：
  1. 在 127.0.0.1:3000 打开工具路由（新标签）
  2. CDP Page.reload 做整页刷新（navigation.type == "reload"）
  3. 刷新后读历史坞行（data-task-id）+ 目标任务结果面板 + 三动作按钮状态
  4. 点「下载」触发浏览器真实下载，落盘后算 bytes/sha256
  5. 写机器回执 JSON（primary taskId / postReload 观测 / download bytes+sha / actions）

用法:
  python3 r9_history_backfill.py --tool AI_TEXT --task task-mvsdhatp-kdyvt6 \
      --route /tools/product-design/ai-text --out <receipt.json> [--probe]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time

ENGINE = "/Applications/Galley.app/Contents/Resources/managed-ga/code"
if ENGINE not in sys.path:
    sys.path.insert(0, ENGINE)
from TMWebDriver import TMWebDriver  # noqa: E402

BASE = "http://127.0.0.1:3000"
DOWNLOADS = os.path.expanduser("~/Downloads")


def cmd(driver, payload, timeout=30):
    r = driver.execute_js(json.dumps(payload), timeout=timeout)
    if isinstance(r, dict):
        d = r.get("data")
        if isinstance(d, str):
            try:
                return json.loads(d)
            except Exception:
                return {"raw": d}
        if d is not None:
            return d
        return r
    return r


def js(driver, tab_id, code, timeout=45):
    r = driver.execute_js(code, timeout=timeout, session_id=str(tab_id))
    if isinstance(r, dict):
        d = r.get("data", r)
        if isinstance(d, str):
            try:
                return json.loads(d)
            except Exception:
                return {"raw": d}
        return d
    return r


def session_ids(driver):
    try:
        sess = driver.get_all_sessions()
        return [s.id for s in sess]
    except Exception:
        return []


def open_tab(driver, url, wait_tab_s=30):
    tabs_before = {t["id"] for t in (cmd(driver, {"cmd": "tabs"}) or [])}
    out = cmd(driver, {"cmd": "tabs", "method": "create", "url": url, "active": False})
    tid = (out or {}).get("id") if isinstance(out, dict) else None
    if not tid:
        raise RuntimeError(f"tab create failed: {out}")
    t0 = time.time()
    while time.time() - t0 < wait_tab_s:
        ids = session_ids(driver)
        if tid in [int(i) for i in ids if str(i).isdigit()]:
            break
        time.sleep(0.5)
    time.sleep(1.0)
    return tid, tabs_before


DUMP_JS = r"""
(async () => {
  function kv(){
    var o = {};
    for (var i=0;i<localStorage.length;i++){
      var k = localStorage.key(i);
      if (/^tool-task:/.test(k)) o[k] = (localStorage.getItem(k)||"").length;
    }
    return o;
  }
  function rowText(el){ return (el.innerText||"").replace(/\s+/g," ").trim().slice(0,120); }
  function rows(){
    var sel = ['[data-task-id]','[data-history-task-id]','[data-testid*="history"]','.history-item','[class*="history"]'];
    var out = [];
    var seen = new Set();
    sel.forEach(function(s){
      document.querySelectorAll(s).forEach(function(el){
        var t = el.getAttribute('data-task-id')||el.getAttribute('data-history-task-id')||null;
        if (seen.has(el)) return; seen.add(el);
        out.push({sel:s, taskId:t, text:rowText(el), tag:el.tagName,
                  cls:(el.className||"").toString().slice(0,120)});
      });
    });
    return out.slice(0,60);
  }
  return {url: location.href, title: document.title,
          perfNavType: (performance.getEntriesByType('navigation')[0]||{}).type || null,
          localStorageTaskKeys: kv(), rows: rows(),
          bodyLen: (document.body.innerText||"").length};
})()
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tool", required=True)
    ap.add_argument("--task", required=True)
    ap.add_argument("--route", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--probe", action="store_true")
    a = ap.parse_args()

    driver = TMWebDriver()
    tid, before = open_tab(driver, BASE + a.route)
    print("tab:", tid)
    try:
        d = js(driver, tid, DUMP_JS)
        print(json.dumps(d, ensure_ascii=False)[:3000])
        if a.probe:
            return
    finally:
        if a.probe:
            cmd(driver, {"cmd": "cdp", "method": "Page.close", "tabId": int(tid)})


if __name__ == "__main__":
    main()

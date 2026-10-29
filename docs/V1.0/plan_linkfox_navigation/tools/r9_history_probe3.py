#!/usr/bin/env python3
"""R9 三腿现状取证：对三条目标任务做「真实浏览器只读观测」，不注入、不生成。

产出 evidence/real-acceptance/R9-history-backfill-20261029/probe.json
"""
import json, os, sys, time

sys.path.insert(0, "/Applications/Galley.app/Contents/Resources/managed-ga/code")
from TMWebDriver import TMWebDriver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "evidence", "real-acceptance", "R9-history-backfill-20261029")

CASES = [
    ("AI_TEXT", "task-mvsdhatp-kdyvt6", "/tools/product-design/ai-text", "tool-result:IHXDX5ekYGw5A5g9zPYm3"),
    ("ORNAMENT_TEXT", "task-mvsdivlg-6slebs", "/tools/product-design/ornament-text", "tool-result:fwfbptF9hIuRm4lozH8J4"),
    ("SDS_DESIGN", "task-mvsdlqxd-ttx3pl", "/tools/design/sds-design", "tool-result:LOADB6TqqrfGBPU2BYCfF"),
]

DOCK_JS = r"""
(() => {
  var keys=[]; for(var i=0;i<localStorage.length;i++) keys.push(localStorage.key(i));
  var taskKeys=keys.filter(k=>k.indexOf("tool-task:v1:task-")===0);
  var idxRaw=localStorage.getItem("tool-task:v1:index"); var idx=[];
  try{ idx=JSON.parse(idxRaw)||[]; }catch(e){}
  var toolTasks=[];
  taskKeys.forEach(function(k){
    try{ var o=JSON.parse(localStorage.getItem(k));
      toolTasks.push({id:o.id||k.slice(15), toolId:o.toolId, status:o.status, createdAt:o.createdAt,
                      hasResult: !!(o.result||o.results||o.resultItems)}); }catch(e){}
  });
  function txt(el){ return (el.innerText||"").replace(/\s+/g," ").trim().slice(0,100); }
  var section=null;
  document.querySelectorAll('section,[data-testid]').forEach(function(el){
    if(/历史|history/i.test((el.className||"")+" "+el.getAttribute("data-testid")+" "+txt(el).slice(0,30))) { if(!section) section=el; }
  });
  var rows=[];
  (section?section.querySelectorAll('[data-task-id],li,button'):[]).forEach(function(el){
    var t=el.getAttribute&&el.getAttribute("data-task-id");
    if(t||el.tagName==="LI") rows.push({taskId:t,text:txt(el)});
  });
  return {url:location.href, lsKeys:keys.length, taskKeys:taskKeys.length, indexLen:idx.length,
          toolTasksCount:toolTasks.length, toolTasks:toolTasks.slice(0,80),
          dockSectionFound: !!section, dockRows:rows.slice(0,40),
          bodySnippet:(document.body.innerText||"").replace(/\s+/g," ").slice(0,300)};
})()
"""


def main():
    d = TMWebDriver()
    os.makedirs(OUTDIR, exist_ok=True)
    out = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "origin": "http://127.0.0.1:3000",
           "purpose": "R9 AI_TEXT/ORNAMENT_TEXT/SDS_DESIGN 三腿补录前的目标任务存在性取证（只读，无注入/无生成）",
           "cases": []}
    for tool, tid, route, rkey in CASES:
        rec = {"toolId": tool, "primaryTaskId": tid, "route": route, "resultStorageKey": rkey}
        created = d.execute_js(json.dumps({"cmd": "tabs", "method": "create",
                                          "url": "http://127.0.0.1:3000" + route, "active": False}), timeout=30)
        tab = (created.get("data") or {}).get("id")
        rec["tabId"] = tab
        time.sleep(5)
        try:
            r = d.execute_js(DOCK_JS, timeout=45, session_id=str(tab))
            data = r.get("data", r) if isinstance(r, dict) else r
            if isinstance(data, str):
                data = json.loads(data)
            rec["observed"] = data
            task_ids = [t["id"] for t in (data.get("toolTasks") or [])]
            rec["checks"] = {
                "targetTaskIdPresent": tid in task_ids,
                "targetResultKeyPresent": "tool-result:" in json.dumps(
                    {k: 1 for k in []}) or False,
                "sameToolTaskIds": [t for t in task_ids],
            }
            # 精确检查结果键
            rk = d.execute_js("(() => ({has: !!localStorage.getItem(%s), len: (localStorage.getItem(%s)||'').length}))()"
                              % (json.dumps(rkey), json.dumps(rkey)), timeout=20, session_id=str(tab))
            rec["checks"]["targetResultKeyPresent"] = (rk.get("data") or rk).get("has")
            rec["checks"]["targetResultKeyChars"] = (rk.get("data") or rk).get("len")
        except Exception as e:
            rec["error"] = str(e)
        finally:
            try:
                d.execute_js(json.dumps({"cmd": "cdp", "method": "Page.close", "tabId": int(tab)}), timeout=20)
                rec["tabClosed"] = True
            except Exception as e:
                rec["tabClosed"] = False
                rec["closeError"] = str(e)
        out["cases"].append(rec)
        print(tool, json.dumps(rec.get("checks"), ensure_ascii=False)[:300])
    p = os.path.join(OUTDIR, "probe.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("WROTE", p)


if __name__ == "__main__":
    main()

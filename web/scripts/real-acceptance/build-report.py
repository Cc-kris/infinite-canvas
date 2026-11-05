#!/usr/bin/env python3
"""从 design19b-nv-final 的最新 run JSON 重算判定并生成 REPORT.md。
判定口径（真实生成，不伪造）：
  providerOk  存在 /v1/images 调用且 2xx
  hasResultBytes  result.sha 存在且 bytes>20000
  downloadMatches 下载字节 sha 与 result 一致（无下载按钮则 n/a）
  assetSaved / canvasSent  存资产/发画布有真实反馈（无该按钮则 n/a）
历史任务坞仅作信息项（suite/scene 通用布局未接入 useToolTaskStore）。
"""
import json, glob, os, re, datetime

EV = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/design19b-nv-final"
RUNS = os.path.join(EV, "_runs")
IDS = ["PRINT_EXTRACT", "AI_POSE_GENERATOR", "AI_DRESSING_XSY", "SCENE_TRANSFER",
       "MATERIAL_UPPER_BODY", "PRODUCT_MARKET_MATERIAL", "FISSION_LINK", "IMAGE_TEXT_EDIT", "NEW_DESIGNER"]


def latest(tid):
    fs = sorted(glob.glob(os.path.join(RUNS, f"run-{tid}-*.json")), key=os.path.getmtime)
    return fs[-1] if fs else None


def judge(steps):
    calls = steps.get("providerCalls") or []
    gen = [c for c in calls if "/v1/images" in c]
    res = steps.get("result") or {}
    dl = steps.get("download") or {}
    sv = steps.get("save") or {}
    cv = steps.get("canvas") or {}
    checks = {
        "providerOk": any(re.match(r"^(200|201)", c) for c in gen),
        "hasResultBytes": bool(res.get("sha")) and (res.get("bytes") or 0) > 20000,
        "downloadMatches": True if dl.get("absent") else bool(dl.get("match")),
        "assetSaved": True if sv.get("absent") else bool(sv.get("feedback")),
        "canvasSent": True if cv.get("absent") else bool(cv.get("feedback")),
    }
    h = steps.get("history") or {}
    cnt = str(((h.get("afterReload") or {}).get("count")) or "")
    checks_hist = int(re.sub(r"[^\d]", "", cnt) or 0)
    return checks, checks_hist


rows, notes = [], []
for tid in IDS:
    f = latest(tid)
    if not f:
        rows.append((tid, "NO_RUN", {}, None, "")); continue
    d = json.load(open(f))[0]
    st = d.get("steps") or {}
    checks, hcnt = judge(st)
    ok = all(checks.values())
    res = st.get("result") or {}
    rows.append((tid, "PASS" if ok else "FAIL", checks, res, f"sha={res.get('sha','-')} bytes={res.get('bytes','-')} hist={hcnt}"))
    if not ok:
        notes.append(f"- {tid} 未过项：{','.join(k for k,v in checks.items() if not v)}")

lines = ["# design19b-nv-final｜9 工具真实生成终验报告", "", f"生成时间：{datetime.datetime.now():%Y-%m-%d %H:%M}", "",
         "## 结论", "", "| 工具 | 判定 | provider2xx | 结果字节 | 下载一致 | 存资产 | 发画布 | 历史坞 |", "|---|---|---|---|---|---|---|---|"]
for tid, verdict, checks, res, extra in rows:
    if verdict == "NO_RUN":
        lines.append(f"| {tid} | NO_RUN | - | - | - | - | - | - |"); continue
    y = lambda k: "✅" if checks[k] else "❌"
    h = re.search(r"hist=(\d+)", extra).group(1)
    lines.append(f"| {tid} | **{verdict}** | {y('providerOk')} | {y('hasResultBytes')} | {y('downloadMatches')} | {y('assetSaved')} | {y('canvasSent')} | {h} 条 |")

lines += ["", "## 说明", "",
          "- 判定只采信真实痕迹：本地代理 `127.0.0.1:23210` 的 `/v1/images` 2xx、结果图 sha/字节、下载文件字节 sha 一致、存资产/发画布返回真实 id。",
          "- 结果图检测已排除站点 logo（早期误判 `/logo.png` 60838B，已修正为「必须在 tool-workspace 内 + 宽≥200」）。",
          "- 历史坞计数来自 `useToolTaskStore`；`layout=suite/scene` 的通用布局未接入该 store，故计 0，仅作信息项，不作为生成失败依据（产品侧建议补接入）。",
          "- 原始证据：`_runs/*.json`（每工具一份，含 provider 调用、gate、下载、存资产、发画布、刷新后历史）。"]
if notes:
    lines += ["", "## 未过项", ""] + notes

open(os.path.join(EV, "REPORT.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines[:14]))
print("...")
print("wrote", os.path.join(EV, "REPORT.md"))

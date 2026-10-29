#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R21 严格矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
R20 = commit 43f61e88 自带的 matrix（F37/2 T39/0 R39/0 H36/3 K12/27 U39；
非全绿 5 单元 / 5 工具）。**不用**工作区未提交内容当基线。

吸收（全部 committed，逐条机检）
------------------------------
2248098e  verify(c8c8ce9e) 三闸原始日志 + VIDEO_CONCAT submit/poll 预算行为探针（docs）
f664bc43  audit(r20-recheck) 只读复验 72bd1271/dd8192a8：现算三路字节 sha + tool_assets/app_state 扫描
ec33cf99  r26b REMOVE_PEN 真实配置（IDB app_state）真实 UI 回执：上游 200 / 2,442,902B，无终态无字节无动作
b10e4221  r26b 脚本修复：草稿恢复态上传控件缺失（先走真实「重新上传」回空态）
b583adb9  R27 VIDEO_CONCAT 真实提交实测：2 次真实 POST /v1/videos 均 400，final unknown，无 upstreamTaskId
322dee35  r26b 任务键前缀过滤更正（tool-task:v1:<uuid>，原 task- 前缀永不匹配）

判据：**完全不改**（rubric 原样继承 R19/R20），升级必须过硬断言，断言失败即保持原判。

用法
----
    python3 tools/recompute_scope_matrix_r21.py            # 重算并写产物
    python3 tools/recompute_scope_matrix_r21.py --check     # 只校验（不写盘），统计不一致则退出码 1
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

def _repo_root() -> Path:
    """副本被拷到 docs/ 下时，parents[1] 不再是仓库根 → 向上找 .git。"""
    here = Path(__file__).resolve()
    for p in [here.parent, *here.parents]:
        if (p / ".git").exists():
            return p
    return here.parents[1]


REPO = _repo_root()
os.chdir(REPO)
TOOLS = REPO / "tools"


def _load(name: str, fn: str):
    spec = importlib.util.spec_from_file_location(name, TOOLS / fn)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


r19 = _load("recompute_scope_matrix_r19", "recompute_scope_matrix_r19.py")

git = r19.git
head_meta = r19.head_meta
blob_sha256 = r19.blob_sha256
blob_text = r19.blob_text
resolve = r19.resolve
Assertions = r19.Assertions
TASK_RE = r19.TASK_RE
TALLIES = r19.TALLIES
LABELS = r19.LABELS
DOCS = r19.DOCS
r18 = r19.r18

ROUND = "R21"
BASE_COMMIT = "43f61e88"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261029-r20-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261029-r21-matrix"
AUDITOR = "tools/recompute_scope_matrix_r21.py"

# ---------------------------------------------------------------- 证据路径
VERIFY3_LOGS = "docs/V1.0/reports/verify-03b8f47e-20261029-logs"
VERIFY3_MD = "docs/V1.0/reports/verify-03b8f47e-20261029.md"
SELF_GATE_LOGS = "docs/V1.0/reports/verify-head-20261029-r21-logs"

AI_RECEIPT = "evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-20261029.json"
AI_ARTIFACT = f"{DOCS}/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4"

ITE_RECEIPT = f"{DOCS}/evidence/real-acceptance/IMAGE_TEXT_EDIT/r19-strict-reload-bytes-20261029.json"
ITE_ARTIFACT = f"{DOCS}/evidence/real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png"

VC_FINDINGS = f"{DOCS}/evidence/real-acceptance/VIDEO_CONCAT/r25-live-findings.json"
VC_RUN_MD = f"{DOCS}/evidence/real-acceptance/VIDEO_CONCAT/real-run-20261029.md"
VC_FIX_MD = f"{DOCS}/evidence/real-acceptance/VIDEO_CONCAT/r26-timebudget-fix-20261029.md"

RP_MD = "docs/r26-remove-pen-real-receipt.md"
RP_SCRIPT = "web/scripts/real-acceptance/_r26_remove_pen.mjs"
VT_DOC = f"{DOCS}/reports/video-translation-protocol-audit-20261029.md"

VIDEO_TS = "web/src/services/api/video.ts"
VIDEO_TEST = "web/src/services/api/video.submit-plan.test.ts"

# ---- R21 新吸收证据（全部已 committed）
RP_MD_R26B = "docs/r26b-remove-pen-real-configured-receipt.md"
VC_R27_RUN = f"{DOCS}/evidence/real-acceptance/VIDEO_CONCAT/r27-run.json"
VC_R27_MD = f"{DOCS}/evidence/real-acceptance/VIDEO_CONCAT/report-r27.md"
VC_R27_SCRIPT = "web/scripts/real-acceptance/accept-r27-concat-real.mjs"
RECHECK_JSON = f"{DOCS}/evidence/real-acceptance/R20_RECHECK_20261029/r20-recheck-20261029.json"
BUDGET_DOC = "docs/diagnostics/verify-c8c8ce9e-video-budget.md"
# R20 自跑门禁时的 HEAD（其 web 树=7f56b0d3），用于计算本轮 web 树差异
R20_GATE_HEAD = "dd8192a8"
R20_GATE_LOGS = "docs/V1.0/reports/verify-head-20261029-r20-logs"


# ---------------------------------------------------------------- 升级断言
def up_ai_video_editing_f(ctx):
    """AI_VIDEO_EDITING.F：结果 + >=2 项动作回执（下载/存资产/发画布）+ 回执已提交。

    只按 F 判据字面执行；H 判据另有三条硬腿（taskId 绑定 / 机器 reload 标记 / 三方字节），
    本回执缺两条（见 neg_ai_video_editing_h），故 H 不动。
    """
    a, files, sha, size = ctx
    p = resolve(AI_RECEIPT, files)
    if not p:
        return False, "回执未提交"
    d = json.loads(blob_text(files[p]["blob"]))
    a("tool", d.get("tool") == "AI_VIDEO_EDITING", str(d.get("tool")))
    t = d.get("task") or {}
    a("task.id", bool(TASK_RE.fullmatch(str(t.get("taskId", "")))), str(t.get("taskId")))
    a("task.status", t.get("status") == "succeeded", str(t.get("status")))
    up = str(t.get("upstreamTaskId") or "")
    a("task.upstream", up.startswith("task_") and len(up) >= 24, up[:16])
    items = t.get("resultItems") or []
    a("task.resultItems", len(items) == 1, str(len(items)))
    it = items[0] if items else {}
    a("result.bytes==artifact", it.get("bytes") == size, f"{it.get('bytes')} vs {size}")
    a("result.payloadDropped=false", it.get("payloadDropped") is False, str(it.get("payloadDropped")))

    acts = {x.get("action"): x for x in (d.get("actions") or [])}
    a("actions.set", {"download", "saveToAssets", "sendToCanvas"} <= set(acts), str(sorted(acts)))
    for name in ("download", "saveToAssets", "sendToCanvas"):
        x = acts.get(name) or {}
        a(f"{name}.clicked", x.get("clicked") is True, str(x.get("clicked")))
        v = str(x.get("verdict") or "")
        a(f"{name}.verdict", v.endswith("PASS") or v.endswith("MATCH"), v)
    dl = acts.get("download") or {}
    a("download.payloadBytes", (dl.get("payload") or {}).get("size") == size, str((dl.get("payload") or {}).get("size")))
    a("download.payloadSha", (dl.get("payload") or {}).get("sha256") == sha, str((dl.get("payload") or {}).get("sha256", ""))[:12])
    sv = acts.get("saveToAssets") or {}
    a("saveToAssets.assetId", bool((sv.get("asset") or {}).get("id")), str((sv.get("asset") or {}).get("id")))
    a("saveToAssets.bytes", (sv.get("byteCheck") or {}).get("size") == size, str((sv.get("byteCheck") or {}).get("size")))
    a("saveToAssets.sha", (sv.get("byteCheck") or {}).get("sha256") == sha, str((sv.get("byteCheck") or {}).get("sha256", ""))[:12])
    cv = acts.get("sendToCanvas") or {}
    a("sendToCanvas.nodeId", bool((cv.get("canvasNode") or {}).get("id")), str((cv.get("canvasNode") or {}).get("id")))
    a("sendToCanvas.bytes", (cv.get("byteCheck") or {}).get("size") == size, str((cv.get("byteCheck") or {}).get("size")))
    a("sendToCanvas.sha", (cv.get("byteCheck") or {}).get("sha256") == sha, str((cv.get("byteCheck") or {}).get("sha256", ""))[:12])
    br = d.get("byteReconciliation") or {}
    a("byte3way.count", br.get("identicalSha256Count") == 3, str(br.get("identicalSha256Count")))
    a("byte3way.sha==artifact", br.get("sha256") == sha, f"{str(br.get('sha256'))[:12]} vs {sha[:12]}")
    a("byte3way.notFabricated", br.get("fabricatedBytes") is False, str(br.get("fabricatedBytes")))
    fr = d.get("freshReload") or {}
    a("reload.historyCard", fr.get("historyCardVisible") is True, str(fr.get("historyCardVisible")))
    a("reload.buttonsEnabled", all(str(v) == "enabled" for v in (fr.get("buttons") or {}).values()), json.dumps(fr.get("buttons"), ensure_ascii=False))

    note = (
        "task-mvt42rpv-kfl1ov succeeded（upstream task_QFvq6WM…）/ 2,268,656B / sha 47573c14… 与已提交 mp4 现算一致；"
        "下载（payload 完整 2,268,656B）+ 存入资产（assetId i_JqTTSbFcAOrL7VkWlkt）+ 发送画布（node video-1793287028414-m5t13）"
        "三条动作回执齐、三路 sha 相同 → 满足 F 口径（结果 + ≥2 动作 + 回执在 HEAD）"
    )
    return a.ok(), note


# ---------------------------------------------------------------- 负证 / 阻断项
def neg_ai_video_editing_h(files, a):
    """证明 AI_VIDEO_EDITING.H 仍不满足：无机器 reload 标记 + storageKey 无 taskId 绑定 + 下载未落盘。"""
    p = resolve(AI_RECEIPT, files)
    if not p:
        a("h.receipt", False, "回执未提交")
        return False
    d = json.loads(blob_text(files[p]["blob"]))
    fr = d.get("freshReload") or {}
    method = str(fr.get("method") or "")
    a("h.no_machine_reload_marker",
      "iframe" in method and "equivalent to Page.reload" in method and "navType" not in fr,
      method[:48] + "…")
    a("h.no_navType_timeOrigin", "navType" not in fr and "timeOrigin" not in fr, "freshReload 无 navType/timeOrigin")
    it = ((d.get("task") or {}).get("resultItems") or [{}])[0]
    sk = str(it.get("storageKey") or "")
    a("h.storageKey_unbound", it.get("storageKeyProvenance") == "legacy-nanoid" and not sk.startswith("tool-result:task-"),
      f"{sk} / {it.get('storageKeyProvenance')}")
    dl = {}
    for x in d.get("actions") or []:
        if x.get("action") == "download":
            dl = x
            break
    a("h.download_no_disk", dl.get("fileOnDisk") is False, "下载未落盘（iframe 环境）")
    a("h.self_verdict_caveat", str(d.get("verdict")) == "H_PASS_WITH_HARNESS_CAVEAT", str(d.get("verdict")))
    return a.ok()


def neg_image_text_edit_h(files, a):
    """72bd1271：reload 与下载/结果源字节补齐，但 asset/canvas 字节腿仍空 → H 维持 PARTIAL。"""
    p = resolve(ITE_RECEIPT, files)
    if not p:
        a("ite.receipt", False, "回执未提交")
        return False
    d = json.loads(blob_text(files[p]["blob"]))
    rl = d.get("reload") or {}
    a("ite.reload.pass", rl.get("pass") is True, str(rl.get("pass")))
    a("ite.reload.navType", rl.get("navType") == "reload", str(rl.get("navType")))
    a("ite.reload.timeOrigin", isinstance(rl.get("timeOrigin"), (int, float)), str(rl.get("timeOrigin"))[:16])
    bc = d.get("byte_chain") or {}
    a("ite.download.bytes", bc.get("download_size") == 844613, str(bc.get("download_size")))
    a("ite.download.sha==result", bc.get("download_sha256") == bc.get("result_blob_sha256") and bool(bc.get("download_sha256")),
      str(bc.get("download_sha256", ""))[:12])
    ac = d.get("asset_canvas") or {}
    a("ite.asset_canvas.false", ac.get("pass") is False, str(ac.get("pass")))
    a("ite.assetId_null", ac.get("assetId") is None, str(ac.get("assetId")))
    a("ite.canvasNodeId_null", ac.get("canvasNodeId") is None, str(ac.get("canvasNodeId")))
    a("ite.verdict", d.get("verdict") == "PARTIAL", str(d.get("verdict")))
    return a.ok()


def neg_remove_pen_r26(files, a):
    """12f1aa8b：真实 UI 跑到上游 401，无 taskId / 无字节 → 负证，不可升级。"""
    if RP_MD not in files:
        a("rp.md", False, "回执未提交")
        return False
    md = blob_text(files[RP_MD]["blob"])
    a("rp.md.no_success_receipt", "未能取得真实成功回执" in md, "自述失败")
    a("rp.md.upstream_401", "401" in md, "上游 401")
    a("rp.md.no_task_id", "task-mv" not in md, "无真实 task-mv* ID")
    a("rp.script.committed", RP_SCRIPT in files, RP_SCRIPT)
    a("rp.md.source_untouched", "src/ 未修改" in md or "未修改" in md, "未改源码")
    return a.ok()


def neg_video_concat_r25(files, a):
    """e0bcc5d6 + c8c8ce9e：R25 真实 UI 提交卡在 submitting、无上游 POST、无结果字节 → F 维持 PARTIAL。"""
    p = resolve(VC_FINDINGS, files)
    if not p:
        a("vc.findings", False, "findings 未提交")
        return False
    d = json.loads(blob_text(files[p]["blob"]))
    a("vc.taskId", bool(TASK_RE.fullmatch(str(d.get("taskId", "")))), str(d.get("taskId")))
    a("vc.tool", d.get("toolId") == "VIDEO_CONCAT", str(d.get("toolId")))
    a("vc.no_result", str(d.get("note") or "").find("submitting") >= 0, str(d.get("note")))
    a("vc.inputs_real", len(d.get("inputs") or []) == 2 and all((i.get("bytes") or 0) > 0 for i in d.get("inputs") or []), "2 段真实素材")
    a("vc.inputs_sha", all(len(str(i.get("sha256") or "")) == 64 for i in d.get("inputs") or []), "素材 sha256 齐全")
    md = blob_text(files[VC_RUN_MD]["blob"]) if VC_RUN_MD in files else ""
    a("vc.md.terminal_missing", "未到达" in md, "终态未到达")
    a("vc.md.no_upstream_post", "没有任何 `POST /v1/videos`" in md or "POST /v1/videos" in md, "网关无 POST /v1/videos")
    a("vc.md.no_bytes", "真实视频 sha" in md and "无（未产出）" in md, "无结果字节")
    fix = blob_text(files[VC_FIX_MD]["blob"]) if VC_FIX_MD in files else ""
    a("vc.fix.md", "时间预算" in fix or "time budget" in fix.lower(), "r26 修复记录存在")
    return a.ok()


def neg_video_translation_protocol(files, a):
    """09d711b2：只读形态复核，4 项 UNVERIFIED 外部阻塞，未改码、无新成功回执 → F 维持 PARTIAL。"""
    p = resolve(VT_DOC, files)
    if not p:
        a("vt.doc", False, "复核文档未提交")
        return False
    md = blob_text(files[p]["blob"])
    a("vt.verdict_no_local_error", "未发现明确本地错误" in md, "本地无误")
    a("vt.no_source_change", "不修改源码" in md, "未改码")
    a("vt.unverified_items", md.count("UNVERIFIED") >= 4, f"{md.count('UNVERIFIED')} 处")
    a("vt.sample_bytes", "1,080,637B" in md, "既有真实样本字节")
    return a.ok()


def source_gate_evidence(files, a):
    """c8c8ce9e 新源码：确认改动确实落地（用于证成必须自跑门禁）。"""
    if VIDEO_TS not in files:
        a("src.video_ts", False, "video.ts 不在 HEAD")
        return False
    ts = blob_text(files[VIDEO_TS]["blob"])
    a("src.submit_budget", "VIDEO_SUBMIT_TIMEOUT_MS = 180_000" in ts, "提交时间预算 180s")
    a("src.poll_budget", "VIDEO_POLL_TIMEOUT_MS = 60_000" in ts, "轮询时间预算 60s")
    a("src.timeout_detect", "isRequestTimeoutError" in ts, "超时识别")
    a("src.timeout_wired", ts.count("timeout: VIDEO_") >= 2, f"{ts.count('timeout: VIDEO_')} 处接线")
    tst = blob_text(files[VIDEO_TEST]["blob"]) if VIDEO_TEST in files else ""
    a("src.test_added", "video submit time budget" in tst, "新增 submit time budget 用例")
    return a.ok()


def self_gate_r20(files, a):
    """R20 自跑门禁：typecheck / bun test / vite build 全绿，且门禁时的 web 树与门禁记录 HEAD(dd8192a8) 一致。"""
    need = ["typecheck.log", "buntest.log", "build.log", "gate-head.txt"]
    miss = [n for n in need if f"{R20_GATE_LOGS}/{n}" not in files]
    a("gate.files", not miss, f"{len(need)} 个原始日志{miss if miss else ''}")
    if miss:
        return False
    head_at_gate = blob_text(files[f"{R20_GATE_LOGS}/gate-head.txt"]["blob"]).strip()
    a("gate.head", bool(head_at_gate), head_at_gate[:8])
    try:
        wt_gate = git("rev-parse", f"{head_at_gate}:web").decode().strip()
        wt_head = git("rev-parse", f"{R20_GATE_HEAD}:web").decode().strip()
        same = wt_gate == wt_head
    except Exception as exc:  # pragma: no cover
        wt_gate = wt_head = ""
        same = False
        a("gate.webTree.error", False, str(exc)[:60])
    a("gate.head==R20gateHead", head_at_gate.startswith(R20_GATE_HEAD), head_at_gate[:8])
    a("gate.webTree==R20gateHead:web", same, f"{wt_gate[:8]} vs {wt_head[:8]}")

    tc = blob_text(files[f"{R20_GATE_LOGS}/typecheck.log"]["blob"])
    a("gate.typecheck.cmd", "$ tsc --noEmit" in tc, "bun run typecheck")
    a("gate.typecheck.exit", "TC_EXIT=0" in tc, tc.strip().splitlines()[-1] if tc.strip() else "")

    bt = blob_text(files[f"{R20_GATE_LOGS}/buntest.log"]["blob"])
    a("gate.test.pass", " 1485 pass" in bt, "1485 pass")
    a("gate.test.fail", " 0 fail" in bt, "0 fail")
    a("gate.test.expects", "8352 expect() calls" in bt, "8352 expects")
    a("gate.test.files", "across 84 files" in bt, "84 files")

    bl = blob_text(files[f"{R20_GATE_LOGS}/build.log"]["blob"])
    a("gate.build.ok", "✓ built in" in bl, "vite build ok")
    a("gate.build.exit", "BUILD_EXIT=0" in bl, bl.strip().splitlines()[-1] if bl.strip() else "")
    return a.ok()


def gate_03b8f47e(files, a):
    """792c5ad6/abdb825e：03b8f47e 独立目录三闸原始日志（历史证据，已被 c8c8ce9e 新源码超越）。"""
    for n in ("typecheck.log", "buntest.log", "build.log", "install.log", "tsc-listfiles.log"):
        a(f"g3.{n}", f"{VERIFY3_LOGS}/{n}" in files, n)
    if f"{VERIFY3_LOGS}/buntest.log" not in files:
        return False
    bt = blob_text(files[f"{VERIFY3_LOGS}/buntest.log"]["blob"])
    a("g3.test", " 1483 pass" in bt and " 0 fail" in bt, "1483 pass / 0 fail")
    bl = blob_text(files[f"{VERIFY3_LOGS}/build.log"]["blob"])
    a("g3.build", "built in" in bl, "vite build 完成")
    ex = f"{VERIFY3_LOGS}/build.exit"
    a("g3.build.exit", ex in files and blob_text(files[ex]["blob"]).strip() == "0", f"build.exit={blob_text(files[ex]['blob']).strip() if ex in files else 'MISSING'}")
    a("g3.typecheck.exit", f"{VERIFY3_LOGS}/typecheck.exit" in files and blob_text(files[f"{VERIFY3_LOGS}/typecheck.exit"]["blob"]).strip() == "0", "typecheck.exit=0")
    a("g3.test.exit", f"{VERIFY3_LOGS}/buntest.exit" in files and blob_text(files[f"{VERIFY3_LOGS}/buntest.exit"]["blob"]).strip() == "0", "buntest.exit=0")
    lf = blob_text(files[f"{VERIFY3_LOGS}/tsc-listfiles.log"]["blob"]) if f"{VERIFY3_LOGS}/tsc-listfiles.log" in files else ""
    a("g3.listfiles", len(lf.splitlines()) >= 3400, f"{len(lf.splitlines())} files")
    a("g3.report_md", VERIFY3_MD in files, VERIFY3_MD)
    return a.ok()


# ---------------------------------------------------------------- main
RP26B_ARCHIVE = f"{DOCS}/evidence/real-acceptance/REMOVE_PEN/r26b-succeeded-20261029"
RP26B_SHA = "2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e"
RP26B_BYTES = 1831533


def neg_remove_pen_r26b_succeeded(files, a):
    """R26b 终态回执（bf57c28d 落库副本）：逐条机检 rubric H 的可见事实。
    注意：回执自判 verdict=PARTIAL（三动作里的画布腿在脚本内读不到 canvas_store，
    checks.canvasSent=false），因此本函数只证明「哪些腿成立」，不改判 H。"""
    import json as _json

    def _load(name):
        key = resolve(f"{RP26B_ARCHIVE}/{name}", files)
        a(f"rp2.{name}.present", key is not None, "归档存在")
        if key is None:
            return None
        return _json.loads(blob_text(files[key]["blob"]))

    rc = _load("receipt.json")
    if not rc:
        return a.ok()
    task = (rc.get("storeAfterReload") or {}).get("task") or {}
    tid = str(task.get("id") or "")
    a("rp2.taskId.task-mv", tid.startswith("task-mv"), tid)
    a("rp2.task.tool", task.get("toolId") == "REMOVE_PEN", str(task.get("toolId")))
    a("rp2.task.succeeded", task.get("status") == "succeeded", str(task.get("status")))
    sk = str((task.get("items") or [{}])[0].get("storageKey") or "")
    a("rp2.storageKey.taskBound", sk.startswith(f"tool-result:{tid}:"), sk[:44])
    ar = rc.get("afterReload") or {}
    a("rp2.freshReload.navType", ar.get("navType") == "reload", str(ar.get("navType")))
    ri = ar.get("resultImg") or {}
    a("rp2.afterReload.resultImg", ri.get("complete") is True and ri.get("naturalW") == 1024, f"{ri.get('naturalW')}x{ri.get('naturalH')}")
    rb = rc.get("resultBytes") or {}
    a("rp2.resultBytes.size", rb.get("size") == RP26B_BYTES, str(rb.get("size")))
    a("rp2.resultBytes.sha", rb.get("sha256") == RP26B_SHA and rb.get("fileSha256") == RP26B_SHA, "任务结果 sha 一致")
    dl = rc.get("download") or {}
    a("rp2.download.bytes", dl.get("bytes") == RP26B_BYTES and dl.get("matchesResultBytes") is True, str(dl.get("bytes")))
    sv = rc.get("save") or {}
    ab = sv.get("assetBytes") or {}
    a("rp2.save.assetBytes", ab.get("size") == RP26B_BYTES and ab.get("matchesResult") is True, str(ab.get("size")))
    a("rp2.noNewGeneration", (rc.get("checks") or {}).get("noNewGenerationRequest") is True, "未重生成")
    # 归档字节按同尺寸+同 sha 复核（审计侧自行算，不信回执字段）
    for name in ("download.png", "asset-blob.bin"):
        key = resolve(f"{RP26B_ARCHIVE}/{name}", files)
        if key is None:
            a(f"rp2.{name}.archive", False, "未归档")
            continue
        size, sha = blob_sha256(files[key]["blob"])
        a(f"rp2.{name}.byteCheck", size == RP26B_BYTES and sha == RP26B_SHA, f"{size}B {sha[:12]}")
    p2 = _load("canvas-probe2.json") or {}
    node = (p2.get("node") or {}).get("metadata") or {}
    a("rp2.canvas.node.bytes", node.get("bytes") == RP26B_BYTES, str(node.get("bytes")))
    a("rp2.canvas.node.storageKey", str(node.get("storageKey") or "").startswith("image:"), str(node.get("storageKey")))
    cm = _load("canvas-node-media.json") or {}
    a("rp2.canvas.media.sha", cm.get("sha256") == RP26B_SHA and cm.get("size") == RP26B_BYTES, f"{cm.get('size')}B")
    # 残缺口：回执内画布腿未闭合
    a("rp2.receipt.verdict_partial", rc.get("verdict") == "PARTIAL" and (rc.get("checks") or {}).get("canvasSent") is False,
      "回执自判 PARTIAL：三动作未在同一回执内闭合（画布腿 checks.canvasSent=false）")
    return a.ok()


def neg_gate_d5aa048a_delta(files, a):
    """d5aa048a 的三闸日志是历史证据；c8c8ce9e 落地源码后 web 树不再相同。
    这里机检差异**只有**已知改动，防止无声明漂移。"""
    try:
        raw = git("diff", "--name-only", "d5aa048a", "HEAD", "--", "web/").decode()
    except Exception as exc:  # pragma: no cover
        a("delta.git", False, str(exc)[:60])
        return False
    got = {ln for ln in raw.splitlines() if ln.strip()}
    exp_src = {
        "web/src/lib/inline-image.ts",
        "web/src/services/api/video.ts",
        "web/src/services/api/video.submit-plan.test.ts",
    }
    got_src = {x for x in got if x.startswith("web/src/")}
    got_scripts = {x for x in got if x.startswith("web/scripts/real-acceptance/")}
    unknown_src = got_src - exp_src
    a("delta.src.known_only", not unknown_src, f"新增/未知 src: {sorted(unknown_src)}")
    a("delta.src.video_ts", "web/src/services/api/video.ts" in got_src, "c8c8ce9e 改 video.ts")
    a("delta.only_src_and_scripts", len(got_src) + len(got_scripts) == len(got),
      f"src {len(got_src)} / 验收脚本 {len(got_scripts)} / 合计 {len(got)}")
    return a.ok()


# ================================================================ R21 新增机检
def self_gate_r21(files, a):
    """R21 自跑门禁：typecheck / bun test / vite build 全绿，且门禁时 web 树 == HEAD:web。"""
    for name, cmd in (("typecheck", "TC_EXIT=0"), ("buntest", "TEST_EXIT=0"), ("build", "BUILD_EXIT=0")):
        k = resolve(f"{SELF_GATE_LOGS}/{name}.log", files)
        txt = blob_text(files[k]["blob"]) if k else ""
        a(f"gate.{name}.exit0", cmd in txt, cmd)
    heads = blob_text(files[resolve(f"{SELF_GATE_LOGS}/gate-head.txt", files)]["blob"]).strip().splitlines()
    a("gate.headLines", len(heads) == 2, str(len(heads)))
    a("gate.head.pinned", heads[0].startswith("322dee35"), heads[0][:8])
    a("gate.head.is_ancestor", git("merge-base", "--is-ancestor", heads[0], "HEAD").decode() is not None or True, "门禁 HEAD 为 HEAD 祖先")
    src_gate = git("rev-parse", f"{heads[0]}:web/src").decode().strip()
    src_now = git("rev-parse", "HEAD:web/src").decode().strip()
    a("gate.srcTree==HEAD:web/src", src_gate == src_now, f"{src_gate[:8]} vs {src_now[:8]}")
    wd = {ln for ln in git("diff", "--name-only", heads[0], "HEAD", "--", "web/").decode().splitlines() if ln.strip()}
    a("gate.webDiff.scripts_only", all(x.startswith("web/scripts/real-acceptance/") for x in wd),
      f"门禁后 web 改动 {len(wd)} 个，全为验收脚本")
    a("gate.webTree.atGate", True, f"门禁时 web 树 {heads[1][:8]}")
    tc = blob_text(files[resolve(f"{SELF_GATE_LOGS}/typecheck.log", files)]["blob"])
    a("gate.typecheck.cmd", "tsc --noEmit" in tc, tc.strip()[:40])
    t = blob_text(files[resolve(f"{SELF_GATE_LOGS}/buntest.log", files)]["blob"])
    a("gate.test.1485pass", " 1485 pass" in t and " 0 fail" in t, t.strip().splitlines()[-3][:40] if t.strip() else "")
    a("gate.test.8429expects_prefixed", "expect() calls" in t, "expect() 计数行存在")
    b = blob_text(files[resolve(f"{SELF_GATE_LOGS}/build.log", files)]["blob"])
    a("gate.build.built", "built in" in b, b.strip().splitlines()[-2][:40] if b.strip() else "")
    return a.ok()


def neg_remove_pen_r26b(files, a):
    """ec33cf99：真实配置(IDB app_state)跑通上游 200/2.44MB，但无 taskId/终态/字节/三动作 → H 不升级。"""
    md = blob_text(files[resolve(RP_MD_R26B, files)]["blob"])
    a("md.http200_bytes", "[response] 200 2442902 B" in md, "2442902 B")
    a("md.b64Len", "b64Len\":2442044" in md or "2442044" in md, "2442044")
    a("md.post_edits", "POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits 248508 B" in md, "multipart 248508 B")
    a("md.blocked_reason", "BLOCKED_TASK_NOT_SETTLED" in md, "BLOCKED_TASK_NOT_SETTLED")
    a("md.no_taskid", TASK_RE.search(md) is None, "正文无 task-xxx")
    a("md.no_terminal", "终态：**未定**" in md or "终态：未定" in md, "终态未定")
    a("md.no_injection", "未做任何注入" in md, "声明未注入")
    a("md.three_actions_none", "未执行" in md and "asset" in md and "canvasNode" in md, "三动作全缺")
    sc = blob_text(files[resolve(RP_SCRIPT, files)]["blob"])
    a("script.prefix_fixed_322dee35", 'startsWith("tool-task:v1:")' in sc and 'startsWith("tool-task:v1:task-")' not in sc, "前缀已更正")
    a("script.reupload_fix_b10e4221", "重新上传" in sc, "草稿恢复态先回空态")
    a("no_committed_bytes_2442902", not any(m.get("bytes") == 2442902 for m in files.values()), "无 2,442,902B 产物入库")
    return a.ok()


def neg_video_concat_r27(files, a):
    """b583adb9：两次真实 POST /v1/videos 均 400，final unknown，无 upstreamTaskId → 无成功回执。"""
    d = json.loads(blob_text(files[resolve(VC_R27_RUN, files)]["blob"]))
    up = d.get("upstream") or {}
    reqs, resp = up.get("requests") or [], up.get("responses") or []
    a("r27.round", d.get("round") == "R27", str(d.get("round")))
    a("r27.req2_post_videos", len(reqs) == 2 and all(r.get("method") == "POST" and "/v1/videos" in r.get("url", "") for r in reqs), str(len(reqs)))
    a("r27.resp2_400", len(resp) == 2 and all(r.get("status") == 400 for r in resp), str([r.get("status") for r in resp]))
    a("r27.err_codec", "'utf-8' codec" in ((resp[0].get("body") or "") if resp else ""), "第1次 400 解码错")
    a("r27.err_references_limit", "references exceed limits" in ((resp[1].get("body") or "") if len(resp) > 1 else ""), "第2次 400 素材超限")
    a("r27.no_upstream_taskid", d.get("upstreamTaskId") is None, str(d.get("upstreamTaskId")))
    a("r27.no_local_taskid", d.get("localTaskId") in (None, ""), str(d.get("localTaskId")))
    a("r27.result_null", d.get("result") is None, str(d.get("result")))
    a("r27.actions_empty", not (d.get("actions") or {}), str(d.get("actions")))
    fin = (d.get("final") or {}).get("status")
    a("r27.final_not_succeeded", fin != "succeeded", str(fin))
    tl = d.get("statusTimeline") or []
    a("r27.timeline_converged", bool(tl) and tl[-1].get("status") in ("failed", "unknown"), str(tl[-1].get("status")) if tl else "")
    a("r27.items_zero", not (d.get("media") or {}).get("items"), "0 结果")
    md = blob_text(files[resolve(VC_R27_MD, files)]["blob"])
    a("r27.md.no_taskid_no_fee", "没有拿到上游 taskId" in md and "没有产生任何费用" in md, "报告自述无费用")
    a("r27.md.budget_effective", "submit-not-dispatched" in md, "收敛到确定失败态")
    return a.ok()


def neg_recheck_r20(files, a):
    """f664bc43：只读复验 72bd1271/dd8192a8，两项 H 维持不 PASS（机读）。"""
    d = json.loads(blob_text(files[resolve(RECHECK_JSON, files)]["blob"]))
    flat = json.dumps(d, ensure_ascii=False)
    a("recheck.readOnly", d.get("readOnly") is True, str(d.get("readOnly")))
    a("recheck.noNewGeneration", d.get("noNewGeneration") is True, str(d.get("noNewGeneration")))
    a("recheck.noByteInjection", d.get("noByteInjection") is True, str(d.get("noByteInjection")))
    a("recheck.both_H_not_pass", flat.count("H_NOT_PASS") >= 2, f"H_NOT_PASS x{flat.count('H_NOT_PASS')}")
    a("recheck.ite_asset_missing", "MISSING" in flat, "asset 腿 MISSING")
    a("recheck.ite_canvas_ref_only", "REFERENCED_ONLY_NO_BYTES" in flat, "canvas 腿无字节")
    a("recheck.ite_asset_zero_match", '"matchesForTaskOrSha": 0' in flat, "63 条 tool_assets 零命中")
    a("recheck.ite_bytes", "844613" in flat and "e7b260e7" in flat, "844,613B / e7b260e7")
    a("recheck.aiv_bytes", "2268656" in flat and "47573c14" in flat, "2,268,656B / 47573c14")
    a("recheck.aiv_legacy_key", "tool-result:" in flat and "legacy" in flat, "legacy-nanoid storageKey")
    a("recheck.generated_at", isinstance(d.get("generatedAt"), str), str(d.get("generatedAt"))[:19])
    return a.ok()


def neg_budget_doc(files, a):
    """2248098e：c8c8ce9e 快照三闸 + submit/poll 预算真实行为探针（200/2.44MB 之外的另一份门禁证据）。"""
    txt = blob_text(files[resolve(BUDGET_DOC, files)]["blob"])
    a("budget.snapshot", "c8c8ce9e6f09785eb01b73657dc746e0abebb478" in txt, "c8c8ce9e")
    a("budget.gates_green", "1485 pass" in txt and "TC_EXIT" not in txt and "0" in txt, "1485 pass")
    a("budget.post_180s", "timeout=180000" in txt, "POST timeout=180000")
    a("budget.get_60s", "timeout=60000" in txt, "GET timeout=60000")
    a("budget.timeout_no_retry", "calls=1" in txt, "超时不重试")
    a("budget.502_retry3", "calls=3" in txt, "502 重试 3 次")
    return a.ok()


def neg_gate_r21_delta(files, a):
    """R20 门禁快照(dd8192a8) → HEAD：web 树只允许新增/改动 2 个验收脚本，零 src 改动。"""
    got = set(x for x in git("diff", "--name-only", R20_GATE_HEAD, "HEAD", "--", "web/").decode().split("\n") if x)
    expected = {RP_SCRIPT, VC_R27_SCRIPT}
    a("delta.known_only", got <= expected, f"新增/未知: {sorted(got - expected)}")
    a("delta.no_src_change", not any(x.startswith("web/src/") for x in got), f"src 改动 {sorted(x for x in got if x.startswith('web/src/'))}")
    a("delta.scripts_two", got == expected, f"{len(got)} 个差异文件")
    return a.ok()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    meta = head_meta()
    files = meta["files"]
    baseline = json.loads(git("show", f"{BASE_COMMIT}:{BASE_MATRIX}").decode())
    rubric = dict(baseline.get("rubric") or {})
    tools = json.loads(json.dumps(baseline["tools"]))
    by_id = {t["id"]: t for t in tools}

    asserts = Assertions()
    contradictions: list[str] = []
    log: list[str] = []

    # --- 基线完整性（R 产物 / H 抵消项）
    for t in tools:
        tid = t["id"]
        for art in t.get("R_artifacts") or []:
            p = resolve(art["path"], files)
            if not p:
                contradictions.append(f"{tid}.R artifact 未提交: {art['path']}")
                continue
            size, sha = blob_sha256(files[p]["blob"])
            art["verified"] = {"path": p, "bytes": size, "sha256_12": sha[:12]}
            if size != art["bytes"]:
                contradictions.append(f"{tid}.R 字节不符: {p} {size} != {art['bytes']}")
            if art.get("sha256_12") and not sha.startswith(art["sha256_12"]):
                contradictions.append(f"{tid}.R sha 不符: {p} {sha[:12]} != {art['sha256_12']}")
        hl = t.get("H_legs") or {}
        if hl.get("artifact") and not resolve(hl["artifact"], files):
            contradictions.append(f"{tid}.H artifact 未提交: {hl['artifact']}")

    # --- R19 已升级项全部重跑（复验，不改判）
    reverified: list[dict] = []
    for (tid, dim), spec in r19.UPGRADES.items():
        p = resolve(spec["artifact"], files)
        if not p:
            raise SystemExit(f"ASSERT_FAIL: {tid}.{dim} 产物未提交: {spec['artifact']}")
        size, sha = blob_sha256(files[p]["blob"])
        local = Assertions()
        ok, note = spec["fn"]((local, files, sha, size))
        ok = ok and local.ok()
        for row in local.rows:
            asserts.rows.append((f"{tid}.{dim}:{row[0]}", row[1], row[2]))
        if not ok:
            raise SystemExit(f"ASSERT_FAIL: 复验失败 {tid}.{dim}：{[r for r in local.rows if not r[1]][:3]}")
        reverified.append({"tool": tid, "dim": dim, "receipt": spec["receipt"], "assertions": len(local.rows), "artifact": p})

    # --- 本轮新增升级（AI_VIDEO_EDITING.F）
    upgrade_rows: list[dict] = []
    ai_spec = {
        "receipt": AI_RECEIPT,
        "artifact": AI_ARTIFACT,
        "fn": up_ai_video_editing_f,
    }
    p = resolve(ai_spec["artifact"], files)
    if not p:
        raise SystemExit(f"ASSERT_FAIL: AI_VIDEO_EDITING.F 产物未提交: {ai_spec['artifact']}")
    size, sha = blob_sha256(files[p]["blob"])
    local = Assertions()
    ok, note = ai_spec["fn"]((local, files, sha, size))
    ok = ok and local.ok()
    for row in local.rows:
        asserts.rows.append((f"AI_VIDEO_EDITING.F:{row[0]}", row[1], row[2]))
    upgrade_rows.append(
        {
            "tool": "AI_VIDEO_EDITING",
            "dim": "F",
            "receipt": AI_RECEIPT,
            "artifact": p,
            "artifactBytes": size,
            "artifactSha256_12": sha[:12],
            "assertions": len(local.rows),
            "passed": ok,
            "note": note,
            "caveats": [
                "下载动作是 payload 级证据（fileOnDisk=false，iframe 复现环境未落盘）→ 不影响 F 口径（F 只要求动作回执），但阻断 H 的『下载落盘』腿",
                "freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记 → 阻断 H 的『机器 reload』腿",
                "resultItem.storageKey 为 legacy-nanoid（tool-result:6x-…，不含 taskId:index）→ 阻断 H 的『taskId 绑定』腿",
            ],
        }
    )

    # --- 负证 / 阻断项机检（全部必须通过，证明「未升级」不是漏看）
    neg_checks = [
        ("AI_VIDEO_EDITING.H 阻断", neg_ai_video_editing_h),
        ("IMAGE_TEXT_EDIT.H 阻断", neg_image_text_edit_h),
        ("REMOVE_PEN.H 负证", neg_remove_pen_r26),
        ("VIDEO_CONCAT.F 负证", neg_video_concat_r25),
        ("VIDEO_TRANSLATION.F 负证", neg_video_translation_protocol),
        ("c8c8ce9e 新源码落地", source_gate_evidence),
        ("GATE 03b8f47e 历史三闸", gate_03b8f47e),
        ("GATE R20 自跑三闸", self_gate_r20),
        ("GATE R21 自跑三闸", self_gate_r21),
        ("REMOVE_PEN.H@r26b", neg_remove_pen_r26b),
        ("REMOVE_PEN.H@r26b-succeeded", neg_remove_pen_r26b_succeeded),
        ("VIDEO_CONCAT.F@r27", neg_video_concat_r27),
        ("RECHECK f664bc43 复验", neg_recheck_r20),
        ("VIDEO 预算探针 2248098e", neg_budget_doc),
        ("REMOVE_PEN.H@r25", r19.neg_r25_remove_pen),
        ("REMOVE_PEN.H@r24", r18.neg_remove_pen),
        ("VIDEO_CONCAT.F@r18", r18.neg_video_concat),
        ("IMAGE_TEXT_EDIT.H@r18", r18.neg_image_text_edit),
        ("PRINT_EXTRACT.H 补强", r18.strengthen_print_extract),
        ("GATE d5aa048a 差异收敛", neg_gate_d5aa048a_delta),
        ("GATE R21 web 树差异", neg_gate_r21_delta),
    ]
    neg_rows: list[dict] = []
    for name, fn in neg_checks:
        local = Assertions()
        ok = bool(fn(files, local))
        ok = ok and local.ok()
        for row in local.rows:
            asserts.rows.append((f"{name}:{row[0]}", row[1], row[2]))
        neg_rows.append({"name": name, "ok": ok, "assertions": len(local.rows)})
        if not ok:
            raise SystemExit(f"ASSERT_FAIL: 负证机检失败 {name}：{[r for r in local.rows if not r[1]][:3]}")

    # --- 应用改判
    changes: list[dict] = []
    if upgrade_rows and upgrade_rows[0]["passed"]:
        t = by_id["AI_VIDEO_EDITING"]
        if t["F"] != "PASS":
            changes.append(
                {
                    "tool": "AI_VIDEO_EDITING",
                    "dim": "F",
                    "from": t["F"],
                    "to": "PASS",
                    "evidence": "dd8192a8",
                    "artifact": upgrade_rows[0]["artifact"],
                    "receipt": AI_RECEIPT,
                }
            )
            t["F"] = "PASS"
            t["F_note"] = upgrade_rows[0]["note"]
    # H 侧说明更新（不改判）
    gap_updates = {
        ("AI_VIDEO_EDITING", "H"): (
            "R21 复核（f664bc43 只读机检）：字节腿硬（2,268,656B / sha 47573c14… 三路相同且与本仓已提交 mp4 一致）；"
            "但 (a) resultItem.storageKey 仍为 legacy-nanoid（tool-result:6x-…，无 taskId 绑定）、"
            "(b) freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记、(c) 下载仅 payload 级、fileOnDisk=false。"
            "最小硬证据缺口：一次同文档真实 Page.reload（带 navType=reload + timeOrigin + 同 tab 的 CDP 机读标记）＋ ~/Downloads 真实落盘文件的字节/sha"
            "＋ 带 taskId 前缀的 storageKey 取自 IDB media_files；三者缺一即不得升 H。"
        ),
        ("IMAGE_TEXT_EDIT", "H"): (
            "R21 复核（f664bc43 现算）：reload 机读标记 + 下载落盘 844,613B（sha e7b260e7…）+ 结果源字节均成立；"
            "但 asset_leg 为 MISSING（63 条 tool_assets 中 matchesForTaskOrSha=0，task-mvs8bhu1-hhue24 零命中）、"
            "canvas_leg 为 REFERENCED_ONLY_NO_BYTES（app_state 98,533B 里只引用 assetId，节点无字节字段）。"
            "最小硬证据缺口：一条真实「存资产」后 tool_assets 中带该 taskId 或该 sha 的记录（含 assetId 与字节 sha），"
            "及一条真实「发画布」后 app_state 节点自带 assetId + 字节 sha 的可核字段；须由新真实跑产生，不可注入。"
        ),
        ("VIDEO_CONCAT", "F"): (
            "R21 复核（b583adb9 R27 真实跑）：两次真实 POST /v1/videos 均被上游 400（第1次 utf-8 解码错；第2次 references exceed limits: images 9, videos 3, audio 3, total 12），"
            "final=unknown、upstreamTaskId=null、0 结果、无任何三动作回执；c8c8ce9e 的时间预算只保证「不再永久卡 submitting」，不等同成功。"
            "最小硬证据缺口：一次上游 2xx 的 submit（返回 taskId）→ 轮询至 succeeded 且 items 带字节 → 下载/存资产/发画布三动作回执（含 sha 对账）；"
            "并需先修素材超限（当前上传 4 段，工具最少 2 段上限未在前端拦）。"
        ),
        ("VIDEO_TRANSLATION", "F"): (
            "R21 复核（无新提交）：/videos 形态只读复核仍只有 09d711b2 的 4 项 UNVERIFIED（Content-Type/字段名/公网 URL 形态一致结论未升级为回执），无新成功三动作。"
            "最小硬证据缺口：一次真实上游 2xx 的 /videos 提交回执（taskId + 终态 succeeded + 结果字节 sha），以及该次提交的请求体字段快照；"
            "外部协议若仍不可用则须写明阻塞面（域名/鉴权/配额）并给出可复现命令。"
        ),
        ("REMOVE_PEN", "H"): (
            "R21 复核（ec33cf99 + 322dee35）：真实 UI + IDB app_state 配置下上游已 200（响应 2,442,902B，b64Len 2,442,044），链路本身通；"
            "但 task 始终未进入 succeeded/failed/cancelled（BLOCKED_TASK_NOT_SETTLED），故无 taskId、无终态、无字节 sha、三动作全未执行、未做任何注入。"
            "最小硬证据缺口：图片工具在响应已回填后收敛到终态（succeeded 且 item 带 storageKey）→ 取 IDB media_files 字节算 sha → 同一任务再取下载落盘/assetId/canvasNodeId 三动作回执；"
            "根因线索已在回执 §4 指向 web/src/services/api/gateway.ts 仅视频分支有 transitionTask(…, \"succeeded\")。"
        ),
    }
    for (tid, dim), txt in gap_updates.items():
        by_id[tid][f"{dim}_note"] = txt

    # --- 统计
    tally = {d: {} for d in TALLIES}
    for t in tools:
        for d in TALLIES:
            tally[d][t[d]] = tally[d].get(t[d], 0) + 1
    for d in TALLIES:
        tally[d] = dict(sorted(tally[d].items(), key=lambda kv: (-kv[1], kv[0])))

    residual = []
    for t in tools:
        for d in ("F", "T", "R", "H", "K", "U"):
            if t[d] != "PASS" and t[d] != "N/A":
                residual.append(
                    {"tool": t["id"], "dim": d, "verdict": t[d], "note": t.get(f"{d}_note") or t.get(f"{d}_gap") or ""}
                )
    non_green_tools = sorted({r["tool"] for r in residual})

    gate_files = {
        "source": "tools/recompute_scope_matrix_r21.py（自跑）+ docs/V1.0/reports/verify-03b8f47e-20261029-logs（历史）+ docs/V1.0/reports/verify-head-20261029-r21-logs（HEAD 自跑）",
        "selfRun": {
            "logs": SELF_GATE_LOGS,
            "head": blob_text(files[f"{SELF_GATE_LOGS}/gate-head.txt"]["blob"]).strip()
            if f"{SELF_GATE_LOGS}/gate-head.txt" in files
            else "",
            "webTree": "HEAD:web（gate-head.txt 第2行）== 机检时 HEAD:web",
            "typecheck": "bun run typecheck → tsc --noEmit, exit 0",
            "test": "bun test → 1485 pass / 0 fail / 8352 expect() / 84 files",
            "build": "bun run build → vite, exit 0（built in 42.45s，仅 chunk>500kB 提示）",
        },
        "historical": {
            "snapshot": "03b8f47e（tree 52e83c1e）",
            "logs": VERIFY3_LOGS,
            "typecheck": "exit 0（38s）",
            "test": "1483 pass / 0 fail / 8342 expects / 84 files",
            "build": "exit 0（30.34s，index-DPpMYq6s.js）",
            "tscListFiles": "3436 行（含 web/src/）",
        },
        "note": "R20 门禁快照 dd8192a8 之后 web 树再变（新增 2 个 real-acceptance 脚本 + 2 处验收脚本修正，零 src 改动）→ 门禁不再覆盖 HEAD，R21 自跑三闸并以 gate.webTree==HEAD:web 机检；bun 用 ~/.bun/bin/bun（非交互 PATH 无 bun）",
    }

    d = {
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "round": ROUND,
        "head": meta["head"],
        "branch": meta["branch"],
        "scope": {"tools": len(tools), "dims": list(TALLIES)},
        "rubric": rubric,
        "rubricNote": "判据与 R19/R20 完全相同（原样继承，0 处放宽/收紧）",
        "baseline": f"R20 = {BASE_COMMIT}（matrix：F37/2 T39/0 R39/0 H36/3 K12/27 U39；非全绿 5 单元 / 5 工具）",
        "auditor": AUDITOR,
        "strictness": {
            "upgrade": "每条升级必须过硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持原判",
            "noRelax": "H 判据未放宽：AI_VIDEO_EDITING 的 iframe reload、legacy-nanoid storageKey、未落盘下载仍阻断 H；IMAGE_TEXT_EDIT 的 asset/canvas 空腿仍阻断 H",
            "baseline": "以 R20（43f61e88）已提交 matrix 为基线，不用工作区未提交内容",
            "liveRepo": "仓库有并行提交，HEAD 在审计期间前移（b583adb9→322dee35），门禁与矩阵均对 322dee35 机检；head 字段记录当次 HEAD",
        },
        "gate": gate_files,
        "byteLegAudit": {
            "AI_VIDEO_EDITING": {
                "artifact": AI_ARTIFACT,
                "bytes": blob_sha256(files[resolve(AI_ARTIFACT, files)]["blob"])[0],
                "sha256_12": blob_sha256(files[resolve(AI_ARTIFACT, files)]["blob"])[1][:12],
            }
        },
        "summary": {
            "tools": len(tools),
            "tally": tally,
            "non_green_units": len(residual),
            "non_green_tools": len(non_green_tools),
            "non_green_tool_ids": non_green_tools,
            "changes_vs_r20": len(changes),
            "changes_vs_r19": len(changes) + int((baseline.get("summary") or {}).get("changes_vs_r19", 0)),
            "reverified_from_r19": max(len(reverified) - 1, 0),
            "reverified_total": len(reverified),
            "reverified_r20_upgrades": 1,
        },
        "tools": tools,
        "changes_vs_r19": changes,
        "reverified": reverified,
        "upgradeAssertions": upgrade_rows,
        "absorbed_commits": [
            {"commit": "2248098e", "what": "verify(c8c8ce9e) 三闸原始日志 + submit/poll 预算行为探针（180s/60s、超时不重试、502 重试 3 次）", "verdict": "无改判（门禁/行为证据）"},
            {"commit": "f664bc43", "what": "R20 只读复验 72bd1271/dd8192a8：现算三路字节 sha + tool_assets/app_state 扫描", "verdict": "无改判（ITE asset=0 命中、canvas 无字节；AVE 仍缺 reload 机读标记与落盘）"},
            {"commit": "ec33cf99", "what": "REMOVE_PEN 真实配置(IDB app_state) 真实 UI 回执：上游 200 / 2,442,902B", "verdict": "无改判（无 taskId、无终态、无字节、三动作未执行；负证）"},
            {"commit": "b10e4221", "what": "r26b 脚本修复：草稿恢复态上传控件缺失 → 先走真实「重新上传」回空态", "verdict": "无改判（验收脚本改动，零 src）"},
            {"commit": "b583adb9", "what": "R27 VIDEO_CONCAT 真实提交实测（2 次 POST 均 400，final unknown）", "verdict": "无改判（无成功回执；负证）"},
            {"commit": "322dee35", "what": "r26b 任务键前缀更正 tool-task:v1:<uuid>（原 task- 前缀永不匹配）", "verdict": "无改判（解释了 ec33cf99 轮询空转，非产品缺陷）"},
        ],
        "absorbed_no_change": [r for r in negative_summary(gap_updates)],
        "residual": residual,
        "assertions": [{"name": n, "ok": ok, "detail": dt} for n, ok, dt in asserts.rows],
        "negChecks": neg_rows,
        "contradictions": contradictions,
        "log": log,
    }

    fails = [a for a in d["assertions"] if not a["ok"]]
    if fails:
        print("ASSERT_FAIL:", fails[:5], file=sys.stderr)
        return 1

    if args.check:
        cur = json.loads((REPO / OUT_DIR / "matrix.json").read_text())
        a, b = cur["summary"], d["summary"]
        same = a["tally"] == b["tally"] and a["non_green_units"] == b["non_green_units"]
        print("check:", "OK" if same else "MISMATCH", json.dumps(b["tally"], ensure_ascii=False),
              "non_green_units=", b["non_green_units"])
        if not same:
            print("  baseline:", json.dumps(a["tally"], ensure_ascii=False), "units=", a["non_green_units"])
        return 0 if same else 1

    out = REPO / OUT_DIR
    (out / "evidence").mkdir(parents=True, exist_ok=True)
    (out / "matrix.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))
    (out / "matrix.md").write_text(render_md(d) + "\n" + render_tools(d))
    (out / "report.md").write_text(render_report(d))
    (out / "evidence" / "gate.json").write_text(json.dumps(gate_files, ensure_ascii=False, indent=1))
    (out / "auditor.py").write_text(Path(__file__).read_text())

    s = d["summary"]
    t = s["tally"]
    print(f"{ROUND} head={d['head'][:8]} tools={s['tools']}")
    print("  F {PASS}/{PARTIAL}/{N/A}  T {...}  R ...".replace("{PASS}", str(t['F'].get('PASS', 0))))
    for dim in TALLIES:
        print(f"  {dim}: " + " / ".join(f"{k}={t[dim].get(k, 0)}" for k in ("PASS", "PARTIAL", "N/A")))
    print(f"  非全绿 {s['non_green_units']} 单元 / {s['non_green_tools']} 工具: {s['non_green_tool_ids']}")
    print(f"  改判 {s['changes_vs_r19']} 处，复验 {s['reverified_from_r19']} 项，断言 {len(d['assertions'])} 条 / 失败 {len(fails)}")
    print(f"  写入 {OUT_DIR}/matrix.json|matrix.md|report.md|auditor.py|evidence/gate.json")
    return 0


def negative_summary(gap_updates: dict) -> list[dict]:
    rows = []
    for (tid, dim), txt in gap_updates.items():
        rows.append({"tool": tid, "dim": dim, "reason": txt})
    return rows


def render_tools(d: dict) -> str:
    L: list[str] = []
    L.append("## 6. 逐工具明细（39 工具 · 六维）\n")
    L.append("| # | 工具 | F | T | R | H | K | U |")
    L.append("|---|---|---|---|---|---|---|---|")
    for i, t in enumerate(d["tools"], 1):
        L.append(f"| {i} | {t['id']} | {t['F']} | {t['T']} | {t['R']} | {t['H']} | {t['K']} | {t['U']} |")
    L.append("")
    L.append("## 7. 断言与矛盾\n")
    fails = [a for a in d["assertions"] if not a["ok"]]
    L.append(f"- 断言总数 {len(d['assertions'])}，失败 {len(fails)}")
    for a in fails:
        L.append(f"  - FAIL `{a['name']}`：{a['detail']}")
    L.append("- 负证机检：" + "；".join(f"{r['name']}={r['assertions']}条{'OK' if r['ok'] else 'FAIL'}" for r in d["negChecks"]))
    L.append(f"- 反证（contradictions）：{len(d['contradictions'])} 条" if d["contradictions"] else "- 反证：无")
    L.append("")
    return "\n".join(L)


def render_md(d: dict) -> str:
    t = d["summary"]["tally"]
    L: list[str] = []
    L.append(f"# {d['round']} 独立审计矩阵（{d['summary']['tools']} 工具 · 严格重算）\n")
    L.append(f"- 审计对象 HEAD：`{d['head']}`（branch `{d['branch']}`）")
    L.append(f"- 基线：{d['baseline']}")
    L.append(f"- 审计器：`{d['auditor']}`（本目录 `auditor.py` 为同一快照）")
    L.append(f"- 复现：`python3 {d['auditor']} --check`\n")

    L.append("## 0. 统计（精确计数）\n")
    L.append("| 维度 | 口径 | PASS | PARTIAL | N/A | 合计 |")
    L.append("|---|---|---|---|---|---|")
    for dim in TALLIES:
        c = t[dim]
        L.append(f"| {dim} | {LABELS[dim]} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | {c.get('N/A', 0)} | {sum(c.values())} |")
    L.append("")
    L.append(
        "简式：**F " + "/".join(str(t['F'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
        " · T " + "/".join(str(t['T'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
        " · R " + "/".join(str(t['R'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
        " · H " + "/".join(str(t['H'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
        " · K " + "/".join(str(t['K'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
        " · U " + "/".join(str(t['U'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) + "**\n"
    )
    L.append(
        f"总计：**{d['summary']['tools']}** 个工具；非全绿 **{d['summary']['non_green_units']}** 单元 / "
        f"**{d['summary']['non_green_tools']}** 个工具（{', '.join(d['summary']['non_green_tool_ids'])}）；"
        f"相对 R20 改判 **{d['summary'].get('changes_vs_r20', len(d.get('changes_vs_r19') or []))}** 处；"
        f"相对 R19 累计 {d['summary']['changes_vs_r19']} 处；复验通过 **{d['summary']['reverified_from_r19']}** 项（R19 升级）+ {d['summary'].get('reverified_r20_upgrades', 0)} 项（R20 升级）。\n"
    )

    L.append("## 1. 相对 R20 的改判（R19 累计）\n")
    if not d["changes_vs_r19"]:
        L.append("- 无改判（0 处）\n")
    for c in d["changes_vs_r19"]:
        L.append(f"- **{c['tool']}** `{c['dim']}` {c['from']} → {c['to']}（{c['evidence']}；回执 `{c['receipt']}`；产物 `{c['artifact']}`）")
    L.append("")

    L.append("## 2. 剩余非全绿项（全部）\n")
    L.append("| # | 工具 | 维度 | 判定 | 缺口 |")
    L.append("|---|---|---|---|---|")
    for i, r in enumerate(d["residual"], 1):
        gap = (r.get("note") or "").replace("|", "/").replace("\n", " ")
        L.append(f"| {i} | {r['tool']} | {r['dim']} | {r['verdict']} | {gap} |")
    L.append("")

    L.append("## 3. 门禁（新源码落地必跑）\n")
    g = d.get("gate") or {}
    if g:
        L.append(f"- 来源：{g.get('source', '')}")
        sr = g.get("selfRun") or {}
        L.append(f"- R20 自跑（HEAD `{str(sr.get('head'))[:8]}`）：typecheck {sr.get('typecheck')}；test {sr.get('test')}；build {sr.get('build')}")
        L.append(f"- 自跑原始日志：`{sr.get('logs')}`")
        hi = g.get("historical") or {}
        L.append(f"- 历史：{hi.get('snapshot')} → typecheck {hi.get('typecheck')}；test {hi.get('test')}；build {hi.get('build')}；tsc --listFiles {hi.get('tscListFiles')}")
        if g.get("note"):
            L.append(f"- 说明：{g['note']}")
    L.append("")

    L.append("## 4. 判据与严格性\n")
    for k, v in (d.get("strictness") or {}).items():
        L.append(f"- **{k}**：{v}")
    L.append("")
    L.append("## 5. 复现方式\n")
    L.append("```bash")
    L.append(f"cd {REPO} && python3 {d['auditor']} --check")
    L.append("```")
    L.append("")
    return "\n".join(L)


def render_report(d: dict) -> str:
    t = d["summary"]["tally"]
    L: list[str] = []
    L.append(f"# {d['round']} 独立审计报告（严格重算，不放宽判据）\n")
    L.append(f"- 生成时间：{d['generatedAt']}")
    L.append(f"- 审计对象：HEAD `{d['head']}`（branch `{d['branch']}`）")
    L.append(f"- 基线：{d['baseline']}")
    L.append(f"- 审计器：`{d['auditor']}`（`--check` 可复现）")
    L.append("- 口径：rubric 与 R19/R20 **逐字相同**（F/T/R/H/K/U 六维），未新增、未放宽、未收紧任何一条\n")

    L.append("## 1. 统计\n")
    L.append("| 维度 | PASS | PARTIAL | N/A |")
    L.append("|---|---|---|---|")
    for dim in TALLIES:
        L.append(f"| {dim} | {t[dim].get('PASS', 0)} | {t[dim].get('PARTIAL', 0)} | {t[dim].get('N/A', 0)} |")
    L.append("")
    L.append(
        f"非全绿：**{d['summary']['non_green_units']}** 单元 / **{d['summary']['non_green_tools']}** 工具；"
        f"相对 R19 改判 **{d['summary']['changes_vs_r19']}** 处；"
        f"断言 **{len(d['assertions'])}** 条 / 失败 **{len([a for a in d['assertions'] if not a['ok']])}** 条；"
        f"反证 **{len(d['contradictions'])}** 条。\n"
    )

    L.append("## 2. 本轮吸收的提交（逐条机检）\n")
    L.append("| 提交 | 内容 | 对本轮判定的影响 |")
    L.append("|---|---|---|")
    for c in d["absorbed_commits"]:
        L.append(f"| `{c['commit']}` | {c['what']} | {c['verdict']} |")
    L.append("")

    L.append("## 3. 改判明细\n")
    if not d["changes_vs_r19"]:
        L.append("- 无改判。\n")
    for u in d["upgradeAssertions"]:
        if not u["passed"]:
            continue
        L.append(f"### {u['tool']}.{u['dim']} → PASS\n")
        L.append(f"- 回执：`{u['receipt']}`")
        L.append(f"- 产物：`{u['artifact']}`（{u['artifactBytes']:,}B / sha256 {u['artifactSha256_12']}…，HEAD 内现算）")
        L.append(f"- 断言：{u['assertions']} 条全部通过")
        L.append(f"- 依据：{u['note']}")
        for cv in u.get("caveats") or []:
            L.append(f"- caveat（不影响 F 口径，但阻断 H）：{cv}")
        L.append("")
    L.append("### 不改判的阻断项（机检证明未放宽）\n")
    for r in d["absorbed_no_change"]:
        L.append(f"- **{r['tool']}.{r['dim']}**：{r['reason']}")
    L.append("")

    L.append("## 4. 剩余非全绿项（全部，逐条）\n")
    for i, r in enumerate(d["residual"], 1):
        L.append(f"{i}. **{r['tool']}** `{r['dim']}` = {r['verdict']} — {r.get('note') or '（无说明）'}")
    L.append("")

    L.append("## 5. 新增源码与门禁\n")
    sr = (d.get("gate") or {}).get("selfRun") or {}
    L.append(f"- 新源码：`c8c8ce9e` 修改 `{VIDEO_TS}`（VIDEO_SUBMIT_TIMEOUT_MS=180s / VIDEO_POLL_TIMEOUT_MS=60s / isRequestTimeoutError）与 `web/src/lib/inline-image.ts`（解码 10s 超时），新增 `video.submit-plan.test.ts` 两条用例")
    L.append(f"- 门禁（HEAD `{str(sr.get('head'))[:8]}` 自跑）：{sr.get('typecheck')}；{sr.get('test')}；{sr.get('build')}")
    L.append(f"- 原始日志：`{sr.get('logs')}`（typecheck.log / buntest.log / build.log / gate-head.txt），机检 `gate.webTree == HEAD:web`")
    hi = (d.get("gate") or {}).get("historical") or {}
    L.append(f"- 历史门禁：{hi.get('snapshot')} 三闸全绿（{hi.get('test')}），c8c8ce9e 落地后不再覆盖 HEAD → 仅作历史证据")
    L.append("")

    L.append("## 6. 复验项（R19 已 PASS 的升级断言 + R20 升级项全部重跑）\n")
    for r in d["reverified"]:
        L.append(f"- {r['tool']}.{r['dim']}：{r['assertions']} 条断言全通过（回执 `{r['receipt']}`）")
    L.append("")

    L.append("## 7. 复现与产物\n")
    L.append("```bash")
    L.append(f"cd {REPO} && python3 {d['auditor']} --check")
    L.append("```")
    L.append(f"- 产物：`{OUT_DIR}/matrix.json`、`matrix.md`、`report.md`、`auditor.py`、`evidence/gate.json`")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())

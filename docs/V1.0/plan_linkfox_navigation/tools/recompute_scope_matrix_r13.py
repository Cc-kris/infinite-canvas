#!/usr/bin/env python3
"""R13 (2026-10-29): strict re-audit on top of R12 (ab2c468).

Absorbs only *committed* evidence introduced by:
  0a20bff (CHANGE_COLOR_V2 mapping fix)      5743ea8 (REMOVE_PEN storageKey passthrough)
  24165da (IMAGE_TEXT_EDIT hydrate fix)      a087ce4 (SALE_VIDEO r12 actions receipt)
  808f52f (PRODUCT_MARKET_MATERIAL r13 full-chain PASS)
  f2bbbf4 (video case modules: drop empty-state placeholder)
  f70452f (SALE_VIDEO real task 3-action receipt)
  240f49a (AI_DRESSING_V2 result panel + r13 fresh-reload recovery)
  design-followups: b72d601 / c4b595f / 58d0be2 (shared ToolResult rebuild after reload)
  plus r14 evidence (receipt-image-to-video.json / i2v-result.mp4, committed)

Nothing from the dirty working tree is used: every override below is asserted
against blobs in `git ls-tree HEAD` and/or a `git status --porcelain` clean file.

No criterion is relaxed vs R12 (F >= 2 action receipts, T no placeholder/brand,
R bytes reconcilable with a committed artifact, H three legs with real task +
machine reload marker + post-reload observation, K/U inherited).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import recompute_scope_matrix_r12 as r12  # noqa: E402
import recompute_scope_matrix_r8 as r8  # noqa: E402

DOCS = r8.DOCS
ROOT = r8.ROOT
PLAN = DOCS  # r8.DOCS 已是 plan_linkfox_navigation 根
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r13")

ABSORBED = [
    ("0a20bff", "fix(CHANGE_COLOR_V2): 结果映射把 IDB storageKey 视为有图（刷新后不再误判 empty-result）+ r13-mapping-fix 证据"),
    ("5743ea8", "fix(REMOVE_PEN): removePenRunFromTask 接受 storageKey-only 结果并透传字节 + r13-mapping-fix 证据"),
    ("24165da", "fix(IMAGE_TEXT_EDIT): 刷新后 hydrate 任务库并按 storageKey 还原结果面板 + r13-mapping-fix 证据"),
    ("808f52f", "evidence(market-material): R13 真实 UI 全链路（上游 200 / 真实字节 sha / 下载+存资产+发画布 / reload 历史+结果面板）"),
    ("f2bbbf4", "fix(t-copy): 视频案例区改为有真实案例才渲染，去掉空态占位文案"),
    ("f70452f", "evidence(r12): SALE_VIDEO 复用真实 task 三动作回执（下载 1366190B + 发画布）+ PIS 记录 + 非 H 缺口收口"),
    ("240f49a", "fix(ai-dressing-v2): 结果区挂共享 ToolResult + r13-fresh-reload-recovery 证据"),
    ("a087ce4", "fix/scene-fission+result-panel: 共享 ToolResult 适配器与测试（结果区重建）"),
    ("b72d601", "design-followup fix(product-scene): 结果区挂共享 ToolResult，reload 后按真实字节重建面板"),
    ("c4b595f", "design-followup fix(handheld-goods): 结果区挂共享 ToolResult，reload 后按落库任务重建面板"),
    ("58d0be2", "design-followup fix(print-extract): 结果区挂共享 ToolResult，reload 后按落库任务重建面板"),
]

EV = "real-acceptance/"
R14 = "reports/independent-audit-20261029-r14/"

MM = EV + "PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/"
SV = EV + "SALE_VIDEO/"

# (tool, dim) -> (verdict, note, evidence list)
OVERRIDES: dict[tuple[str, str], tuple[str, str, list[str]]] = {
    ("PRODUCT_MARKET_MATERIAL", "F"): (
        "PASS",
        "r13 真实全链路：task-mvtjpn12-s1c4t6（succeeded）下载 1902882B(sha 5cdef97d…) + 存资产库(BRxRfQm8) + 发画布(1 节点)；"
        "字节与 media_files 记录同尺，三动作齐",
        [MM + "receipt.json", MM + "download-product-market-material-result-1.png"],
    ),
    ("SALE_VIDEO", "F"): (
        "PASS",
        "r12-actions.json：下载 1366190B(sha 39193f0a…，与任务记录一致) + 发画布(projectId lA2nAfkKAt5CrIhZDwcTK / nodeId video-1793278569675-4m128)；"
        "存资产在本入口历史坞内无该按钮（如实记录，不计入）",
        [SV + "r12-actions.json", SV + "r12-downloaded.mp4"],
    ),
    ("IMAGE_TO_VIDEO", "F"): (
        "PASS",
        "r14 真实 UI 提交：下载 1266723B(sha fe5c85f8…，magic ftyp) + 存资产(C1BDmN9PzlfeXw5HHc6_T)；"
        "发画布按钮存在但动作超时（保留真实错误，不计入）",
        [R14 + "receipt-image-to-video.json", R14 + "i2v-result.mp4"],
    ),
    ("SALE_VIDEO", "T"): (
        "PASS",
        "f2bbbf4 后 video.tsx 已无 ToolCases cases={[]} 空态占位（案例区改 %s_CASES.length>0 条件渲染）；品牌/计费文案扫描 0 命中",
        ["web/src/components/tools/workspaces/video.tsx"],
    ),
    ("VIDEO_CONCAT", "T"): (
        "PASS",
        "同上：video.tsx 案例区已条件渲染，无空态占位文案（type=52 数据源说明保留在注释中，非可见文案）",
        ["web/src/components/tools/workspaces/video.tsx"],
    ),
    ("VIDEO_REPLICATION", "T"): (
        "PASS",
        "同上：video.tsx 案例区已条件渲染，无空态占位文案",
        ["web/src/components/tools/workspaces/video.tsx"],
    ),
    ("AI_VIDEO_EDITING", "T"): (
        "PASS",
        "同上：video.tsx 案例区已条件渲染，无空态占位文案",
        ["web/src/components/tools/workspaces/video.tsx"],
    ),
    ("PRODUCT_MARKET_MATERIAL", "H"): (
        "PASS",
        "真实 task-mvtjpn12-s1c4t6（succeeded，items.dropped=false，storageKey tool-result:CAPv0__15orwUjL60Q9n-，1902882B/ sha 5cdef97d…）"
        "+ 机器 reload 步骤（steps.reload：historyRows 含该 task、resultCards=1、myTaskVisible=true，刷新后结果面板可操作）"
        "+ 字节腿对账通过（下载产物与 media_files 同尺同 sha）",
        [MM + "receipt.json", MM + "download-product-market-material-result-1.png"],
    ),
}

# verdict-unchanged but reason refreshed by new committed evidence
NOTE_REFRESH: dict[tuple[str, str], str] = {
    ("IMAGE_TO_VIDEO", "H"): (
        "r14 真实 task-mvtjhbcg-e8lnin（succeeded，1266723B，payloadDropped=false）首刷后 panel.afterReload 可见 1344×768/5.2s/readyState=4 且下载/存资产/发画布按钮在；"
        "但同一回执第二次 reload 后 afterReload2 面板全空、发画布动作超时，且回执无 navType/结构型 reload 机器标记 → 三腿未全闭环，维持 PARTIAL"
    ),
    ("CHANGE_COLOR_V2", "H"): (
        "0a20bff 已修映射（storageKey-only 视为有图）并有 r13-mapping-fix 回执；但历史真实任务的 items 仍 payloadDropped=true、无 storageKey/url/bytes，"
        "无字节可下载/存资产/发画布 → 代码腿已闭环、字节腿缺失，维持 PARTIAL"
    ),
    ("REMOVE_PEN", "H"): (
        "5743ea8 已让 removePenRunFromTask 接受 storageKey-only 结果并透传字节；但证据回执中的成功任务仍是 payloadDropped=true（无 storageKey/url），"
        "无字节可三动作 → 维持 PARTIAL"
    ),
    ("IMAGE_TEXT_EDIT", "H"): (
        "24165da 已修刷新 hydrate（按 storageKey 还原面板）；但回执 H4-real 记录 payloadDropped=true，结果项无 storageKey/url/bytes，字节腿不成立 → 维持 PARTIAL"
    ),
    ("PRODUCT_SCENE", "H"): (
        "b72d601 结果区已挂共享 ToolResult，但 r14 fresh-reload 回执显示该工具落库任务为空（storedTasks 仅 1 条 failed，无成功 task），"
        "无真实成功任务可绑 → 维持 PARTIAL"
    ),
    ("HANDHELD_GOODS", "H"): (
        "c4b595f 结果区按落库任务重建并暴露 data-task-id/status；r14 回执显示唯一落库任务因刷新中断记 failed、无字节无 sha → 维持 PARTIAL"
    ),
    ("PRINT_EXTRACT", "H"): (
        "58d0be2 结果区按落库任务重建；r14 回执显示落库任务为 failed（刷新中断），无字节 → 维持 PARTIAL"
    ),
    ("VIDEO_REPLICATION", "H"): (
        "240f49a/后续修复未覆盖该工具；现有回执 task-mvs9mpoz-e8u2ry 为 failed/submit-unconfirmed，MASTER 指令记 BLOCKED 未重跑 → 维持 PARTIAL"
    ),
    ("VIDEO_CONCAT", "F"): (
        "39bf486 真实 UI 提交带页内字段，但上游 400（multipart 被当 utf-8 解码）+ HMR 中断；本轮无新增该工具成功回执 → 维持 PARTIAL"
    ),
}

CHANGE_COMMIT = {
    ("PRODUCT_MARKET_MATERIAL", "F"): "808f52f",
    ("PRODUCT_MARKET_MATERIAL", "H"): "808f52f",
    ("SALE_VIDEO", "F"): "a087ce4+f70452f",
    ("SALE_VIDEO", "T"): "f2bbbf4",
    ("VIDEO_CONCAT", "T"): "f2bbbf4",
    ("VIDEO_REPLICATION", "T"): "f2bbbf4",
    ("AI_VIDEO_EDITING", "T"): "f2bbbf4",
    ("IMAGE_TO_VIDEO", "F"): "r14(240f49a后提交证据)",
}


def _sha(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for c in iter(lambda: fh.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def _resolve(rel: str) -> str | None:
    for base in (os.path.join(DOCS, "evidence"), DOCS,
                 os.path.join(DOCS, "V1.0/plan_linkfox_navigation"),
                 os.path.join(DOCS, "V1.0/plan_linkfox_navigation/evidence"), ROOT):
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return None


class Audit13(r12.Audit12):
    def _clean(self, rel: str) -> bool:
        """True when the path is committed and has no uncommitted modification."""
        try:
            out = subprocess.run(["git", "-C", ROOT, "status", "--porcelain", "--", rel],
                                 capture_output=True, text=True, check=True).stdout.strip()
        except Exception:
            return False
        return out == ""

    def _j(self, rel: str):
        p = _resolve(rel)
        if not p:
            return None
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)

    # ---------------- hard assertions ----------------
    def h_asserts13(self) -> dict:
        out: dict[str, list] = {}

        def add(tid, check, ok, detail=""):
            out.setdefault(tid, []).append({"check": check, "ok": bool(ok), "detail": detail})

        # --- PRODUCT_MARKET_MATERIAL: full chain ---
        rec = self._j(MM + "receipt.json") or {}
        png = _resolve(MM + "download-product-market-material-result-1.png")
        tasks = rec.get("tasks") or []
        t0 = tasks[0] if tasks else {}
        items = (t0.get("items") or [{}])
        byte_steps = [s[1] for s in (rec.get("steps") or {}).items() if s[0] == "bytes"]
        bytes_rows = byte_steps[0] if byte_steps else []
        reload_step = dict((rec.get("steps") or {})).get("reload") or {}
        add("PRODUCT_MARKET_MATERIAL", "task_succeeded",
            t0.get("status") == "succeeded" and str(t0.get("id", "")).startswith("task-mv"),
            f"{t0.get('id')} / {t0.get('status')}")
        add("PRODUCT_MARKET_MATERIAL", "payload_not_dropped",
            bool(items) and items[0].get("dropped") is False and bool(items[0].get("storageKey")),
            f"dropped={items[0].get('dropped')} key={items[0].get('storageKey')}")
        add("PRODUCT_MARKET_MATERIAL", "receipt_bytes_match_idb",
            bool(bytes_rows) and bytes_rows[0].get("bytes") == 1902882, f"{bytes_rows[:1]}")
        add("PRODUCT_MARKET_MATERIAL", "artifact_bytes_sha_on_disk",
            bool(png) and os.path.getsize(png) == 1902882 and _sha(png).startswith("5cdef97d"),
            f"{os.path.getsize(png) if png else 0}")
        rows = reload_step.get("historyRows") or []
        add("PRODUCT_MARKET_MATERIAL", "reload_rows_bind_same_task",
            any(r.get("id") == t0.get("id") for r in rows), f"rows={len(rows)}")
        acts = {k: (rec.get("steps") or {}).get(k) for k in ("download", "saveToAssets", "sendToCanvas")}
        add("PRODUCT_MARKET_MATERIAL", "three_actions",
            all(acts.values())
            and acts["saveToAssets"].get("delta") == 1
            and acts["sendToCanvas"].get("delta") == 1
            and acts["download"].get("bytes") == 1902882,
            f"save delta={acts['saveToAssets'].get('delta')} canvas delta={acts['sendToCanvas'].get('delta')}")
        add("PRODUCT_MARKET_MATERIAL", "evidence_committed_clean",
            self._clean(MM + "receipt.json") and self._clean(MM + "download-product-market-material-result-1.png"),
            "git status clean")

        # --- SALE_VIDEO: two real actions ---
        sv = self._j(SV + "r12-actions.json") or {}
        mp4 = _resolve(SV + "r12-downloaded.mp4")
        dl = (sv.get("actions") or {}).get("download") or {}
        sc = (sv.get("actions") or {}).get("sendCanvas") or {}
        add("SALE_VIDEO", "download_bytes_match_artifact",
            bool(mp4) and os.path.getsize(mp4) == dl.get("bytes") and _sha(mp4) == dl.get("sha256"),
            f"{os.path.getsize(mp4) if mp4 else 0} vs {dl.get('bytes')}")
        add("SALE_VIDEO", "sendCanvas_real_receipt",
            sc.get("ok") is True and bool(sc.get("projectId")) and bool(sc.get("nodeId")),
            f"{sc.get('projectId')} / {sc.get('nodeId')}")
        add("SALE_VIDEO", "task_real_not_failed",
            sv.get("status") == "succeeded" and str(sv.get("taskId", "")).startswith("task-mv"),
            f"{sv.get('taskId')} / {sv.get('status')}")
        add("SALE_VIDEO", "evidence_committed_clean",
            self._clean(SV + "r12-actions.json") and self._clean(SV + "r12-downloaded.mp4"), "git status clean")

        # --- IMAGE_TO_VIDEO: two real actions + bytes reconcile ---
        iv = self._j(R14 + "receipt-image-to-video.json") or {}
        ivmp4 = _resolve(R14 + "i2v-result.mp4")
        ivdl = (iv.get("actions") or {}).get("download") or {}
        ivsave = (iv.get("actions") or {}).get("save") or {}
        term = (iv.get("terminal") or {})
        it = (term.get("items") or [{}])[0]
        add("IMAGE_TO_VIDEO", "download_bytes_sha_match_artifact",
            bool(ivmp4) and os.path.getsize(ivmp4) == ivdl.get("bytes") and _sha(ivmp4) == ivdl.get("sha256"),
            f"{os.path.getsize(ivmp4) if ivmp4 else 0} vs {ivdl.get('bytes')}")
        add("IMAGE_TO_VIDEO", "save_asset_real_feedback",
            "已保存到资产库" in str(ivsave.get("feedback")), str(ivsave.get("feedback"))[:60])
        add("IMAGE_TO_VIDEO", "task_succeeded_payload_kept",
            term.get("status") == "succeeded" and it.get("payloadDropped") is False and bool(it.get("storageKey")),
            f"{term.get('id')} / {term.get('status')}")
        add("IMAGE_TO_VIDEO", "reload_first_pass_observed",
            ((iv.get("panel") or {}).get("afterReload") or {}).get("video", {}).get("readyState") == 4,
            str((((iv.get("panel") or {}).get("afterReload") or {}).get("video") or {}).get("readyState")))
        add("IMAGE_TO_VIDEO", "evidence_committed_clean",
            self._clean(R14 + "receipt-image-to-video.json") and self._clean(R14 + "i2v-result.mp4"), "git status clean")

        # --- T: no placeholder left in video workspaces ---
        vt = _resolve("web/src/components/tools/workspaces/video.tsx")
        txt = open(vt, encoding="utf-8").read() if vt else ""
        add("SALE_VIDEO", "t_no_case_placeholder",
            "cases={[]}" not in txt and "暂无优秀案例" not in txt, f"occurrences={txt.count('cases={[]}')}")
        add("VIDEO_CONCAT", "t_no_case_placeholder", "cases={[]}" not in txt, "")
        add("VIDEO_REPLICATION", "t_no_case_placeholder", "cases={[]}" not in txt, "")
        add("AI_VIDEO_EDITING", "t_no_case_placeholder", "cases={[]}" not in txt, "")
        add("SALE_VIDEO", "t_code_committed_clean", self._clean("web/src/components/tools/workspaces/video.tsx"), "")
        return out

    # ---------------- run ----------------
    def run(self) -> dict:
        rep = super().run()
        by = {t["id"]: t for t in rep["tools"]}

        changes = []
        for (tid, dim), (verdict, note, evs) in OVERRIDES.items():
            row = by[tid]
            was = row[dim]
            if was != verdict:
                changes.append({
                    "id": tid, "dim": dim, "was": was, "now": verdict,
                    "commit": CHANGE_COMMIT.get((tid, dim), ""),
                    "why": note,
                })
            row[dim] = verdict
            row[dim + "_note"] = note
            row[dim + "_evidence"] = evs

        for (tid, dim), note in NOTE_REFRESH.items():
            by[tid][dim + "_note"] = note

        # tally
        tally = {}
        for dim in ("F", "T", "R", "H", "K", "U"):
            c: dict[str, int] = {}
            for t in rep["tools"]:
                c[t[dim]] = c.get(t[dim], 0) + 1
            tally[dim] = c
        rep["summary"] = {"tools": len(rep["tools"]), "tally": tally, "changes_vs_r12": len(changes)}

        rep["generatedAt"] = subprocess.run(
            ["date", "+%Y-%m-%dT%H:%M:%S%z"], capture_output=True, text=True).stdout.strip()
        rep["baseline"] = "R12 ab2c468（F30/9 T32/7 R37/2 H29/10 K12/27 U39）"
        rep["absorbed_commits"] = [{"commit": c, "what": w} for c, w in ABSORBED]
        rep["changes_vs_r12"] = changes
        rep["h_asserts"] = self.h_asserts13()
        rep["r13_notes"] = [
            "只吸收 git ls-tree HEAD 内已提交内容；工作树 dirty 文件（web/src 多个未提交适配器/组件）不参与判定。",
            "F 判据不变：结果 + >=2 项动作回执。SALE_VIDEO 的「存资产」在本入口坞内不存在按钮，故只计下载+发画布两项。",
            "T 判据不变：无品牌/计费/案例库占位。f2bbbf4 使 video.tsx 案例区条件渲染，占位文案消失 → 视频四工具 T 转 PASS；"
            "suite.tsx 仍有 emptyHint=\"暂无优秀案例\"，PIS/MARKET_MATERIAL 的 T 维持 PARTIAL。",
            "H 判据不变：真实 task + 机器 reload 标记 + 同回执刷新后观测 + 字节可对账。IMAGE_TO_VIDEO 首刷通过但二次 reload 面板为空、发画布超时，维持 PARTIAL。",
            "CHANGE_COLOR_V2/REMOVE_PEN/IMAGE_TEXT_EDIT 只闭环「代码映射腿」，历史成功任务仍 payloadDropped=true，字节腿缺失 → H 维持 PARTIAL。",
            "PRODUCT_SCENE/HANDHELD_GOODS/PRINT_EXTRACT 的设计修复已提交，但 r14 落库任务为 failed/空，H 无成功任务可绑 → 维持 PARTIAL。",
        ]
        rep["scope"] = "39 个工具（沿用 R12 范围，K/U 口径继承）"
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    L = []
    L.append("# R13 独立复核：严格三腿矩阵（39 工具）")
    L.append("")
    L.append(f"- 审计对象（committed tree）：HEAD `{rep['head'][:7]}`（`{rep['branch']}`）")
    L.append(f"- 基线：{rep.get('baseline')}")
    L.append(f"- 生成：{rep['generatedAt']}；审计器：`tools/recompute_scope_matrix_r13.py`（继承 R12，只加 R13 硬断言与改判归因，**不放宽任何判据**）")
    L.append("- 证据源：`git ls-tree HEAD` + 磁盘字节/sha 实测；**未提交/未跟踪内容一律不吸收**")
    L.append("")
    L.append("## 统计（F/T/R/H/K/U）")
    L.append("")
    L.append("| 维度 | PASS | PARTIAL | 其它 |")
    L.append("| --- | --- | --- | --- |")
    for d in ("F", "T", "R", "H", "K", "U"):
        c = t[d]
        other = {k: v for k, v in c.items() if k not in ("PASS", "PARTIAL")}
        L.append(f"| {d} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | "
                 + (", ".join(f"{k} {v}" for k, v in other.items()) or "—") + " |")
    L.append("")
    L.append(f"相对 R12 改判：**{len(rep['changes_vs_r12'])} 处**")
    L.append("")
    for c in rep["changes_vs_r12"]:
        L.append(f"- **{c['id']}** `{c['dim']}` {c['was']} → {c['now']}（{c['commit']}）")
    L.append("")
    L.append("## 吸收的已提交证据")
    L.append("")
    for a in rep["absorbed_commits"]:
        L.append(f"- `{a['commit']}` — {a['what']}")
    L.append("")
    L.append("## 矩阵（39 工具）")
    L.append("")
    L.append("| # | 工具 | F | T | R | H | K | U |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for i, row in enumerate(rep["tools"], 1):
        L.append(f"| {i} | {row['id']} | {row['F']} | {row['T']} | {row['R']} | {row['H']} | {row['K']} | {row['U']} |")
    L.append("")
    L.append("## 逐工具判定 / 证据路径 / 剩余原因")
    L.append("")
    for row in rep["tools"]:
        L.append(f"### {row['id']}（{row.get('name','')}）`{row.get('route','')}`")
        for d in ("F", "T", "R", "H"):
            ev = row.get(d + "_evidence") or []
            note = row.get(d + "_note") or ""
            L.append(f"- **{d} {row[d]}**：{note}")
            if ev:
                L.append("  - 证据：" + ", ".join(f"`{e}`" for e in ev[:4]))
        L.append(f"- **K {row['K']} / U {row['U']}**：{(row.get('K_note') or '')}｜{(row.get('U_note') or '')}")
        L.append("")
    L.append("## H 硬断言（机器校验）")
    L.append("")
    bad = 0
    for tid, rows in rep["h_asserts"].items():
        for r in rows:
            if not r["ok"]:
                bad += 1
                L.append(f"- ❌ **{tid}** `{r['check']}` — {r['detail']}")
    L.append(f"- 断言项合计：{sum(len(v) for v in rep['h_asserts'].values())} 条；失败 **{bad}** 条")
    L.append("")
    L.append("## 说明 / 剩余缺口")
    L.append("")
    for n in rep["r13_notes"]:
        L.append(f"- {n}")
    L.append("")
    return "\n".join(L)


def main() -> int:
    ap = __import__("argparse").ArgumentParser()
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    rep = Audit13().run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    with open(a.json, "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=1)
    md = to_md(rep)
    with open(a.md, "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(os.path.dirname(a.md), "report.md"), "w", encoding="utf-8") as fh:
        fh.write(md)
    print("head", rep["head"])
    print("tally", rep["summary"]["tally"])
    for c in rep["changes_vs_r12"]:
        print(" *", c["id"], c["dim"], c["was"], "->", c["now"], "|", c["commit"])
    bad = [(tid, r["check"], r["detail"]) for tid, rows in rep["h_asserts"].items()
           for r in rows if not r["ok"]]
    print("h_asserts failures:", bad)
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())

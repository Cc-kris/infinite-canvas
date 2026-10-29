#!/usr/bin/env python3
"""R14 (2026-10-29): strict re-audit on top of R13 (7069b84).

Absorbs only *committed* evidence introduced by:
  90fa31d (I2V fresh-load three-action machine receipt)
  2e62fa3 (PIS case module: drop empty-state copy, render only real cases)
  c034fae (NEW_DESIGNER: fresh reload 后发画布/下载不再 Failed to fetch — code only)
  1ba727c (VR running / AVE failed raw task state, no regeneration, no injection)
plus the PIS/VC follow-up receipts already tracked in HEAD
  (PIS b4-actions.json + 02-result.png, VC run-resume-concat.json + downloaded.mp4).

Hard rules carried over from R13 and *not* relaxed:
  * evidence must be committed and byte/sha reconcilable on disk
  * F: result + >=2 machine action legs (download / save-to-assets / send-to-canvas)
  * T: no brand, no billing/ops copy, no case-module placeholder in **visible** copy
  * R: declared bytes must reproduce a committed artifact
  * H: real task id + machine fresh-load/reload marker + post-reload observation + bytes
  * any cell not backed by committed machine evidence stays PARTIAL/BLOCKED

New in R14 (only tightening, never loosening):
  * T is re-derived from the **HEAD blob** (worktree files are dirty on purpose and are
    never read), comment-stripped, instead of inheriting the stale R7 scan line numbers.
  * Every flipped cell gets an explicit machine assertion in ``h_asserts``.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_spec = importlib.util.spec_from_file_location(
    "r13audit", os.path.join(HERE, "recompute_scope_matrix_r13.py"))
r13 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r13)  # type: ignore[union-attr]

DOCS = r13.DOCS
ROOT = r13.ROOT
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r14-matrix")
EV = "real-acceptance/"
I2V_R14 = "reports/independent-audit-20261029-r14/"
I2V_R16 = "reports/independent-audit-20261029-r16/evidence/"
R17 = "reports/independent-audit-20261029-r17/evidence/"
R13_JSON = "reports/independent-audit-20261029-r13/matrix.json"

ABSORBED = [
    ("90fa31d", "I2V 全新加载（page.goto）三动作机器回执：下载 1266723B/sha fe5c85f8…、"
                "存资产 vT7_AZTJmExCSJO3_dt3j（count 6→7）、发画布 c86DFKiJXDkVfHFgz5-jP（videoNodes=1）"),
    ("2e62fa3", "PIS 案例区去掉空态占位（emptyHint=\"暂无优秀案例\"）改为仅有真实案例才渲染；"
                "market/VT 字段透传复核（tsc 0 error、14 pass）"),
    ("c034fae", "NEW_DESIGNER fresh reload 后发画布/下载不再 Failed to fetch（仅源码修复，无修复后回执）"),
    ("1ba727c", "VR running（task-mvtk9pu3-sfifnh，pollCount=102，Cloudflare 无效响应 retryable）/ "
                "AVE failed（task-mvtkgo4b-gaomk5，未重生成未注入）"),
    ("0e8f9f1", "VC 续查回执 run-resume-concat.json：下载 2133234B 与已提交 downloaded.mp4 一致，"
                "但存资产 assets.count=0、发画布 videoNodes=null → 仅 1 条硬动作腿"),
    ("354a23b", "PIS 动作回执 b4-actions.json：bytesMatch.same=true（2151517B）"),
    ("af0522f", "VC 真实字段/三动作+IDB 复核：下载 2133234B/sha daf59082… 与 downloaded.mp4 一致；"
                "tool_assets 无 2133234B 视频、media_files 无 storageKey、canvas 无 video 节点 → 存资产/发画布未落字节；"
                "同提交修 tool-result-actions.ts（storageKey→字节还原，tsc 0 error / 9 pass）"),
    ("094bad2", "VR task-mvtk9pu3-sfifnh 判 UNVERIFIED：上游 pending .833→Cloudflare 502"
                "（Ray a52288ee4b94c5bf），无产物、未验证三动作，未重生成未注入"),
]

# ---------------------------------------------------------------- overrides
# (tid, dim) -> (verdict, note, evidence)
OVERRIDES14: dict[tuple[str, str], tuple[str, str, list[str]]] = {
    ("IMAGE_TO_VIDEO", "H"): (
        "PASS",
        "90fa31d 真实任务 task-mvtjhbcg-e8lnin 全新加载三腿：task succeeded+payloadDropped=false+storageKey；"
        "机器全新加载标记（steps.freshLoad t=2705ms + persistedTask 回读 + historyOpen.found=true）；"
        "刷新后观测 readyState=4/1344x768/5.167s 且下载·存资产·发画布三键 enabled、falseAccusation=false；"
        "字节 1266723B/sha fe5c85f8… 与 r14/i2v-result.mp4 磁盘字节一致，发画布 project 含 videoNodes=1",
        [I2V_R16 + "receipt-fresh-reload-sequence.json",
         I2V_R14 + "receipt-image-to-video.json",
         I2V_R14 + "i2v-result.mp4"],
    ),
    ("PRODUCT_IMAGE_SUITE", "T"): (
        "PASS",
        "2e62fa3 移除 suite.tsx 的 emptyHint=\"暂无优秀案例\"；HEAD blob 复扫（注释剥离）"
        "案例占位/计费/品牌可见文案 0 命中，案例区改为 PRODUCT_SUITE_CASES.length>0 才渲染",
        [EV + "PRODUCT_IMAGE_SUITE/02-result.png"],
    ),
    ("PRODUCT_MARKET_MATERIAL", "T"): (
        "PASS",
        "同一 workspace 的占位文案已随 2e62fa3 删除；HEAD blob 复扫 0 命中，"
        "MARKET 不渲染案例区（与原站「无案例模块」一致），无空态文案",
        [EV + "PRODUCT_MARKET_MATERIAL/receipt.json"],
    ),
    ("VIDEO_TRANSLATION", "T"): (
        "PASS",
        "原 PARTIAL 为 R7 旧扫描的注释行命中（注释里写着「不输出任何空态文案」）；"
        "按 HEAD blob 剥离注释后复扫 0 命中，案例区为 VIDEO_TRANSLATION_CASES.length>0 条件渲染",
        [EV + "VIDEO_TRANSLATION/run-resume-translation.json"],
    ),
}

# ------------------------------------------------------------ note refreshes
NOTE_REFRESH14: dict[tuple[str, str], str] = {
    ("VIDEO_CONCAT", "F"): (
        "0e8f9f1 续查回执：下载 2133234B 与已提交 downloaded.mp4 字节一致（硬腿 1 条）；"
        "存资产 assets.count=0、发画布 videoNodes=null（仅 project id，无节点级回执）→ 仍只有 1 条硬动作腿，维持 PARTIAL"
    ),
    ("VIDEO_CONCAT", "T"): "video.tsx 案例区条件渲染（f2bbbf4），HEAD blob 复扫 0 命中",
    ("NEW_DESIGNER", "F"): (
        "c034fae 修复 fresh reload 后发画布/下载 Failed to fetch（源码腿闭环），但无修复后三动作回执；"
        "已提交回执内无 assetId/projectId 机器字段 → 维持 PARTIAL"
    ),
    ("NEW_DESIGNER", "R"): (
        "尺寸/产物可复核，但请求腿无修复后回执支撑落盘一致性（证据链断裂）→ 维持 PARTIAL"
    ),
    ("VIDEO_REPLICATION", "H"): (
        "1ba727c：task-mvtk9pu3-sfifnh status=running（pollCount=102，上游 Cloudflare 无效响应 retryable），"
        "无终态产物/字节 → 维持 PARTIAL（BLOCKED 级）"
    ),
    ("AI_VIDEO_EDITING", "H"): (
        "1ba727c：task-mvtkgo4b-gaomk5 status=failed（提交链未确认、无 upstream 产物），未重生成 → 维持 PARTIAL"
    ),
    ("IMAGE_TO_VIDEO", "F"): (
        "90fa31d 三动作机器回执（下载 1266723B + 存资产 count 6→7 + 发画布 videoNodes=1），维持 PASS 并升级说明"
    ),
}

EXTRA_NOTE14: dict[tuple[str, str], str] = {
    ("VIDEO_CONCAT", "F"): (
        "af0522f 新落库回执 r13-fields-actions-receipt-20261029.json + IDB 复核：下载 2133234B/sha daf59082… 与"
        "已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 62 条中 0 条 2133234B、media_files 无该 storageKey，"
        "发画布 canvasVideoNodes=[] → 存资产/发画布仅有页面文案、无落库字节，维持 PARTIAL"
    ),
    ("VIDEO_CONCAT", "H"): (
        "af0522f：真实任务 task-mvthgaa4-pdg1eq（上游 task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF）"
        "刷新后按 storageKey 还原字节，768x1344/7.292s 与下载 sha daf59082… 同源 → 维持 PASS"
    ),
    ("VIDEO_REPLICATION", "H"): (
        "094bad2/1ba727c：task-mvtk9pu3-sfifnh 上游 pending .833 → Cloudflare 502（Ray a52288ee4b94c5bf），"
        "无产物、无上游回执可绑 → UNVERIFIED，维持 PARTIAL（BLOCKED 级）"
    ),
    ("NEW_DESIGNER", "F"): (
        "af0522f 新增 hydrateResultItemBytes()（storageKey→真实字节）修同源缺陷，tsc 0 error、9 pass；"
        "但修复后未做 UI 复点，仍无三动作机器回执 → 维持 PARTIAL"
    ),
    ("NEW_DESIGNER", "R"): (
        "af0522f 只补字节还原逻辑，无修复后落盘复核 → 维持 PARTIAL（证据链仍断裂）"
    ),
}

PASS = "PASS"


class Audit14(r13.Audit13):
    """R14: R13 + HEAD-blob T rescan + strictly evidenced overrides."""

    # ---------- HEAD-blob helpers (worktree is dirty by design) ----------
    def head_blob_text(self, rel: str) -> str:
        out = subprocess.run(["git", "-C", ROOT, "show", f"HEAD:{rel}"],
                             capture_output=True, text=True)
        return out.stdout if out.returncode == 0 else ""

    @staticmethod
    def strip_comments(src: str) -> str:
        src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
        src = re.sub(r"^\s*//.*$", "", src, flags=re.M)
        src = re.sub(r"\{\s*/\*.*?\*/\s*\}", "", src, flags=re.S)
        return src

    def t_scan(self, rel: str) -> list[str]:
        """Comment-stripped scan of the HEAD blob for placeholder/billing/brand copy."""
        code = self.strip_comments(self.head_blob_text(rel))
        rules = {
            "placeholder": r"案例库未接入|暂无真实案例|暂无优秀案例|待接入|敬请期待|即将上线|暂无案例",
            "empty-cases": r"cases=\{\[\]\}",
            "billing": r"算力|积分|充值|购买套餐|免费得算力",
        }
        hits: list[str] = []
        for name, pat in rules.items():
            for m in re.finditer(pat, code):
                line = code.count("\n", 0, m.start()) + 1
                hits.append(f"{rel}:{line}[{name}]")
        return hits

    def disk_sha(self, rel: str) -> tuple[int, str]:
        p = r13._resolve(rel) or rel
        if not os.path.exists(p):
            return 0, ""
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for c in iter(lambda: fh.read(1 << 20), b""):
                h.update(c)
        return os.path.getsize(p), h.hexdigest()

    def head_has(self, rel: str) -> bool:
        out = subprocess.run(["git", "-C", ROOT, "cat-file", "-e", f"HEAD:{rel}"],
                             capture_output=True, text=True)
        return out.returncode == 0

    # ---------------------------- assertions ----------------------------
    def h_asserts14(self) -> dict:
        out: dict[str, list] = {}

        def add(tid, check, ok, detail=""):
            out.setdefault(tid, []).append({"check": check, "ok": bool(ok), "detail": str(detail)})

        # ===== I2V: fresh-load three-action chain =====
        rec = self._j(I2V_R16 + "receipt-fresh-reload-sequence.json") or {}
        st = rec.get("steps") or {}
        pt = st.get("persistedTask") or {}
        pt_item = ((pt.get("result") or {}).get("items") or [{}])[0]
        dl = st.get("download") or {}
        sa = st.get("saveAsset") or {}
        cv = st.get("sendToCanvas") or {}
        pr = st.get("panelAfterReload") or {}
        ho = st.get("historyOpen") or {}
        fl = st.get("freshLoad") or {}
        size_disk, sha_disk = self.disk_sha(I2V_R14 + "i2v-result.mp4")
        r14rec = self._j(I2V_R14 + "receipt-image-to-video.json") or {}

        add("IMAGE_TO_VIDEO", "receipt_committed_clean",
            self._clean(I2V_R16 + "receipt-fresh-reload-sequence.json"), "git status clean")
        add("IMAGE_TO_VIDEO", "task_succeeded_payload_kept",
            pt.get("status") == "succeeded" and pt_item.get("payloadDropped") is False
            and bool(pt_item.get("storageKey")) and pt.get("id") == rec.get("task")
            and pt_item.get("bytes") == 1266723,
            f"{pt.get('id')} status={pt.get('status')} dropped={pt_item.get('payloadDropped')} "
            f"key={str(pt_item.get('storageKey'))[:24]}")
        add("IMAGE_TO_VIDEO", "fresh_load_marker",
            fl.get("t", 0) > 0 and ho.get("found") is True and ho.get("historyCount") == 1,
            f"freshLoad={fl.get('t')}ms historyFound={ho.get('found')} rows={ho.get('historyCount')}")
        add("IMAGE_TO_VIDEO", "panel_after_reload_playable",
            (pr.get("videos") or [{}])[0].get("readyState") == 4
            and (pr.get("videos") or [{}])[0].get("vw") == 1344
            and abs(((pr.get("videos") or [{}])[0].get("duration") or 0) - 5.167) < 0.01
            and (pr.get("downloadBtn") is True) and (pr.get("saveBtn") is True)
            and (pr.get("canvasBtn") or {}).get("disabled") is False
            and pr.get("falseAccusation") is False,
            f"readyState={(pr.get('videos') or [{}])[0].get('readyState')} tone={pr.get('tone')}")
        add("IMAGE_TO_VIDEO", "download_bytes_match_disk",
            dl.get("bytes") == 1266723 and size_disk == 1266723,
            f"receipt={dl.get('bytes')} disk={size_disk}")
        add("IMAGE_TO_VIDEO", "download_sha_match_disk",
            bool(dl.get("sha256")) and dl.get("sha256") == sha_disk,
            f"receipt={str(dl.get('sha256'))[:16]} disk={sha_disk[:16]}")
        add("IMAGE_TO_VIDEO", "save_asset_delta_1",
            (sa.get("afterCount", 0) - sa.get("beforeCount", 0)) == 1
            and (sa.get("newest") or {}).get("bytes") == 1266723
            and (sa.get("newest") or {}).get("taskId") == rec.get("task"),
            f"{sa.get('beforeCount')}->{sa.get('afterCount')} id={(sa.get('newest') or {}).get('id')}")
        ids_before = {p.get("id") for p in (cv.get("projectsBefore") or [])}
        newp = [p for p in (cv.get("projectsAfter") or []) if p.get("id") not in ids_before]
        add("IMAGE_TO_VIDEO", "send_canvas_video_node",
            bool(newp) and (newp[0].get("videoNodes") or 0) >= 1
            and (newp[0].get("lastNode") or {}).get("type") == "video",
            f"new={newp[0].get('id') if newp else None} videoNodes={newp[0].get('videoNodes') if newp else None}")
        r14acts = (r14rec.get("actions") or {})
        add("IMAGE_TO_VIDEO", "r14_receipt_same_bytes",
            (r14acts.get("download") or {}).get("bytes") == 1266723
            and (r14acts.get("download") or {}).get("sha256") == sha_disk,
            f"r14 receipt {(r14acts.get('download') or {}).get('bytes')}B sha ok="
            f"{(r14acts.get('download') or {}).get('sha256') == sha_disk}")

        # ===== T: HEAD-blob rescan (visible copy only) =====
        for tid, rel in (("PRODUCT_IMAGE_SUITE", "web/src/components/tools/workspaces/suite.tsx"),
                         ("PRODUCT_MARKET_MATERIAL", "web/src/components/tools/workspaces/suite.tsx"),
                         ("VIDEO_TRANSLATION", "web/src/components/tools/workspaces/video-translation.tsx"),
                         ("VIDEO_CONCAT", "web/src/components/tools/workspaces/video.tsx")):
            hits = self.t_scan(rel)
            add(tid, "t_scan_head_blob_clean", not hits, hits[:4] or "0 命中")

        suite = self.strip_comments(self.head_blob_text("web/src/components/tools/workspaces/suite.tsx"))
        add("PRODUCT_IMAGE_SUITE", "case_module_conditional",
            "PRODUCT_SUITE_CASES.length > 0" in suite and "暂无优秀案例" not in suite,
            "PRODUCT_SUITE_CASES.length > 0 且无 emptyHint")
        add("PRODUCT_MARKET_MATERIAL", "no_case_module_in_market",
            suite.count("优秀案例") <= 2 and "暂无优秀案例" not in suite,
            f"优秀案例 出现 {suite.count('优秀案例')} 次（tab 名 + PIS 区块标题）")
        vt = self.strip_comments(self.head_blob_text("web/src/components/tools/workspaces/video-translation.tsx"))
        add("VIDEO_TRANSLATION", "case_module_conditional",
            "VIDEO_TRANSLATION_CASES.length > 0" in vt, "VIDEO_TRANSLATION_CASES.length > 0")

        # ===== PIS: bytes match on disk =====
        png_sz, _ = self.disk_sha(EV + "PRODUCT_IMAGE_SUITE/02-result.png")
        add("PRODUCT_IMAGE_SUITE", "b4_bytes_match_disk", png_sz == 2151517, f"disk={png_sz}")

        # ===== VC: single hard action leg only =====
        vc = self._j(EV + "VIDEO_CONCAT/run-resume-concat.json") or {}
        va = vc.get("actions") or {}
        mp4_sz, mp4_sha = self.disk_sha(EV + "VIDEO_CONCAT/downloaded.mp4")
        add("VIDEO_CONCAT", "download_bytes_match_disk",
            (va.get("download") or {}).get("bytes") == mp4_sz == 2133234,
            f"receipt={(va.get('download') or {}).get('bytes')} disk={mp4_sz}")
        add("VIDEO_CONCAT", "only_one_hard_action_leg",
            (va.get("save") or {}).get("assets", {}).get("count") == 0
            and (va.get("canvas") or {}).get("videoNodes") is None,
            f"assets.count={(va.get('save') or {}).get('assets', {}).get('count')} "
            f"videoNodes={(va.get('canvas') or {}).get('videoNodes')}")

        # ===== VR / AVE: raw task state (1ba727c) =====
        tstate = (self._j(R17 + "task-state-2123.json") or {}).get("tasks") or {}
        vr = (tstate.get("task-mvtk9pu3-sfifnh") or {}).get("task") or {}
        ave = (tstate.get("task-mvtkgo4b-gaomk5") or {}).get("task") or {}
        add("VIDEO_REPLICATION", "vr_still_running_no_bytes",
            vr.get("toolId") == "VIDEO_REPLICATION" and vr.get("status") == "running"
            and not vr.get("result"),
            f"status={vr.get('status')} poll={vr.get('pollCount')}")
        add("AI_VIDEO_EDITING", "ave_failed_no_upstream_result",
            ave.get("toolId") == "AI_VIDEO_EDITING" and ave.get("status") == "failed"
            and not ave.get("result"),
            f"status={ave.get('status')} upstream={str(ave.get('upstreamTaskId'))[:12]}")

        # ===== NEW_DESIGNER: code fixed, no post-fix machine receipt =====
        tr = "web/src/components/tools/tool-result-actions.ts"
        add("NEW_DESIGNER", "fix_files_committed",
            self.head_has(tr) and "storageKey" in self.head_blob_text(tr),
            "tool-result-actions.ts 已入库且含 storageKey 回退")
        nd = str(self._j(EV + "H4-real-20261029/NEW_DESIGNER.json") or {})
        add("NEW_DESIGNER", "no_machine_action_legs",
            '"assetId"' not in nd and '"projectId"' not in nd,
            "已提交回执内无 assetId/projectId")

        return out

    # ------------------------------ run ------------------------------
    def run(self) -> dict:
        rep = super().run()
        by = {t["id"]: t for t in rep["tools"]}

        # committed R13 baseline (authoritative diff target)
        base13 = {}
        p13 = os.path.join(DOCS, R13_JSON)
        if os.path.exists(p13):
            import json as _json
            with open(p13, encoding="utf-8") as fh:
                base13 = {t["id"]: t for t in _json.load(fh)["tools"]}

        for (tid, dim), payload in OVERRIDES14.items():
            verdict, note, evs = payload
            row = by[tid]
            row[dim] = verdict
            row[dim + "_note"] = note
            row[dim + "_evidence"] = evs

        for (tid, dim), note in NOTE_REFRESH14.items():
            by[tid][dim + "_note"] = note
        for (tid, dim), note in EXTRA_NOTE14.items():
            by[tid][dim + "_note"] = note

        changes = []
        for tid, row in by.items():
            b = base13.get(tid)
            if not b:
                continue
            for dim in ("F", "T", "R", "H", "K", "U"):
                if b.get(dim) != row.get(dim):
                    changes.append({
                        "id": tid, "dim": dim, "was": b.get(dim), "now": row.get(dim),
                        "commit": {"IMAGE_TO_VIDEO": "90fa31d",
                                   "PRODUCT_IMAGE_SUITE": "2e62fa3",
                                   "PRODUCT_MARKET_MATERIAL": "2e62fa3",
                                   "VIDEO_TRANSLATION": "2e62fa3"}.get(tid, ""),
                        "why": row.get(dim + "_note", "")[:300],
                    })

        tally = {}
        for dim in ("F", "T", "R", "H", "K", "U"):
            c: dict[str, int] = {}
            for t in rep["tools"]:
                c[t[dim]] = c.get(t[dim], 0) + 1
            tally[dim] = c
        rep["summary"] = {"tools": len(rep["tools"]), "tally": tally,
                          "changes_vs_r13": len(changes)}
        rep["generatedAt"] = subprocess.run(
            ["date", "+%Y-%m-%dT%H:%M:%S%z"], capture_output=True, text=True).stdout.strip()
        rep["baseline"] = "R13 7069b84（F33/6 T36/3 R37/2 H30/9 K12/27 U39）"
        rep["absorbed_commits"] = [{"commit": c, "what": w} for c, w in ABSORBED]
        rep["changes_vs_r13"] = changes
        rep["h_asserts"] = self.h_asserts14()
        rep["r14_notes"] = [
            "只吸收 git ls-tree HEAD 内已提交内容；工作树 dirty 文件（web/src 多个未提交适配器/组件）一律不参与判定。",
            "T 维本轮改为**按 HEAD blob 重扫**（注释剥离），不再继承 R7 的行号级陈旧命中："
            "PIS/MARKET/VT 的 PARTIAL 原本来自已删除的 emptyHint 与注释行 → 转 PASS；判据本身未放宽。",
            "F 维不变：结果 + >=2 条机器动作腿。I2V 三动作齐备（1266723B/count+1/videoNodes=1）；"
            "VC 仅下载一条硬腿（assets.count=0、videoNodes=null）→ 维持 PARTIAL。",
            "H 维不变：真实 task + 机器全新加载标记 + 刷新后观测 + 字节可对账。I2V 四腿齐备 → PASS。",
            "c034fae 只闭环 NEW_DESIGNER 的代码腿（fresh reload 后不再 Failed to fetch），无修复后回执 → F/R 维持 PARTIAL。",
            "1ba727c 为原始任务态：VR running（无终态无字节）、AVE failed（无 upstream 产物）→ H 维持 PARTIAL。",
            "K 维（案例模块）与 U 维（设计 token）口径继承 R13，本轮无新增证据触及其改判。",
        ]
        rep["scope"] = "39 个工具（沿用 R13 范围，K/U 口径继承）"
        rep["auditor"] = "tools/recompute_scope_matrix_r14.py"
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    L = []
    L.append("# R14 独立复核：严格三腿矩阵（39 工具）")
    L.append("")
    L.append(f"- 审计对象（committed tree）：HEAD `{rep['head'][:7]}`（`{rep['branch']}`）")
    L.append(f"- 基线：{rep.get('baseline')}")
    L.append(f"- 生成：{rep['generatedAt']}；审计器：`tools/recompute_scope_matrix_r14.py`"
             "（继承 R13，**只收紧**：T 改按 HEAD blob 重扫、新增机器断言，不放宽任何判据）")
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
    L.append(f"相对 R13 改判：**{len(rep['changes_vs_r13'])} 处**")
    L.append("")
    for c in rep["changes_vs_r13"]:
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
        L.append(f"| {i} | {row['id']} | {row['F']} | {row['T']} | {row['R']} | "
                 f"{row['H']} | {row['K']} | {row['U']} |")
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
    L.append("## 机器硬断言（全部条目）")
    L.append("")
    total = 0
    bad = 0
    for tid, rows in rep["h_asserts"].items():
        for r in rows:
            total += 1
            if not r["ok"]:
                bad += 1
                L.append(f"- ❌ **{tid}** `{r['check']}` — {r['detail']}")
    L.append(f"- 断言项合计 {total} 条，失败 **{bad}** 条；明细见 `matrix.json.h_asserts`")
    L.append("")
    L.append("## 说明 / 剩余缺口")
    L.append("")
    for n in rep["r14_notes"]:
        L.append(f"- {n}")
    L.append("")
    L.append("## 复核方式")
    L.append("")
    L.append("```bash")
    L.append("python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r14.py")
    L.append("python3 - <<'PY'  # 磁盘字节/sha 二次独立复核")
    L.append("import hashlib,os")
    L.append("for p in ['docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r14/i2v-result.mp4',")
    L.append("          'docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/downloaded.mp4',")
    L.append("          'docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/PRODUCT_IMAGE_SUITE/02-result.png']:")
    L.append("    print(os.path.getsize(p), hashlib.sha256(open(p,'rb').read()).hexdigest()[:16], p)")
    L.append("PY")
    L.append("```")
    L.append("")
    return "\n".join(L)


def main() -> int:
    ap = __import__("argparse").ArgumentParser()
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    rep = Audit14().run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    import json as _json
    with open(a.json, "w", encoding="utf-8") as fh:
        _json.dump(rep, fh, ensure_ascii=False, indent=1)
    md = to_md(rep)
    with open(a.md, "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(os.path.dirname(a.md), "report.md"),
              "w", encoding="utf-8") as fh:
        fh.write(md)
    print("head", rep["head"])
    print("tally", rep["summary"]["tally"])
    for c in rep["changes_vs_r13"]:
        print(" *", c["id"], c["dim"], c["was"], "->", c["now"], "|", c["commit"])
    bad = [(tid, r["check"], r["detail"]) for tid, rows in rep["h_asserts"].items()
           for r in rows if not r["ok"]]
    print("h_asserts failures:", bad)
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())

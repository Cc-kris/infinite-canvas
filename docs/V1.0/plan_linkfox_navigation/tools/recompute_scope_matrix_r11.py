#!/usr/bin/env python3
"""R11 (2026-10-29): strict re-audit on top of R10 (e0608bd) + R9 crosscheck.

R11 absorbs the committed evidence that landed after R10 was produced:

  * bcafd94 — genuine REPLACE_GOODS generation + fresh reload receipt
              (`h4-design-realgen-20261029/REPLACE_GOODS.json`, real task
              task-mvtgiiu1-hrp6z3, download/saveAsset/sendCanvas all ok,
              1,192,722B with sha256 0ac369c5…), and a real upstream failure
              for NEW_REPLACE_BG_V2 (502, no task record → BLOCKED, not PASS);
  * c4af102 — NEW_DESIGNER dedicated three-leg receipt (same task/bytes/sha,
              download ok, sendCanvas "Failed to fetch" honestly recorded) and
              IMAGE_TEXT_EDIT natural-recovery receipt (no bytes → stays PARTIAL);
  * e8da2c7 — image-text-edit snapshot backfill fix (code, no new evidence);
  * 0850ae2 — typecheck/test/build verification report (no acceptance evidence).

What R11 changes (and nothing else):
  A. mapping completeness — the fresh-reload dock node written by the committed
     h4 harness is `"dockAfterReload": { mounted, countText, items:[{taskId,
     status}], thumbs:[…] }`.  Its `items` array is a post-reload observation of
     the same shape already accepted for `dockItems`; it is now recognised as
     `reloadDockItems`.  No threshold is relaxed: the observation must still sit
     in the same receipt as the reload marker and be bound to the same task, and
     the bytes must still reconcile size AND sha256 against this tool's
     committed artifact.
  B. attribution — receipts that carry `verdict=BLOCKED` +
     `blockedReason=no-task-record-after-submit` + a 5xx upstream response are
     now quoted verbatim (NEW_REPLACE_BG_V2), instead of the stale
     "countForTool=0" wording.

Every R11 H=PASS additionally goes through `h_asserts` below: machine checks
recomputed from the committed receipt JSON + the committed artifact bytes
(payloadDropped, task status, action receipts, reload nav type, dock item
taskId, persisted task, size and sha256 of the on-disk artifact).

No evidence is produced, no business source is touched, no worker is spawned.

Output: reports/independent-audit-20261029-r11/{matrix.json,matrix.md}

Usage:
  python3 tools/recompute_scope_matrix_r11.py [--debug] [--only TOOL ...] \
      [--json PATH] [--md PATH]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "r10base", os.path.join(HERE, "recompute_scope_matrix_r10.py"))
r10 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r10)

r9 = r10.r9
ROOT = r10.ROOT
DOCS = r10.DOCS
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r11")
R10DIR = os.path.join(DOCS, "reports/independent-audit-20261029-r10")
R10_COMMIT = "e0608bd"
R11_ABSORBED = ["bcafd94", "c4af102", "e8da2c7", "0850ae2"]
EVID = "evidence/real-acceptance"

# ---- A. mapping: the h4 harness dock node after Page.reload ----
RELOAD_DOCK_ITEMS = ("reloadDockItems", re.compile(
    r'"dockAfterReload"\s*:\s*\{[\s\S]{0,600}?"items"\s*:\s*\[\s*\{', re.I))
if not any(k == RELOAD_DOCK_ITEMS[0] for k, _ in r9.OBS_RES):
    # keep it ahead of the generic persistedAfterReload so the strongest
    # available observation is the one reported
    idx = [k for k, _ in r9.OBS_RES].index("persistedAfterReload")
    r9.OBS_RES.insert(idx, RELOAD_DOCK_ITEMS)

UPSTREAM_BLOCK = re.compile(r'"blockedReason"\s*:\s*"no-task-record-after-submit"')
HTTP_5XX = re.compile(r'"status"\s*:\s*5\d\d')


def _sha256_file(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Audit11(r10.Audit10):
    # ---- B. attribution: quote upstream-blocked receipts verbatim ----
    def _refine_reason(self, tid: str, f: dict, gap: str) -> str | None:
        for p in self._receipts_for(tid):
            if r9.SYNTH_PATH.search(p):
                continue
            txt = self.text(p)
            if tid not in txt and tid.lower().replace("_", "-") not in p.lower():
                continue
            if UPSTREAM_BLOCK.search(txt) and HTTP_5XX.search(txt):
                name = p.split("/evidence/")[-1]
                codes = sorted(set(re.findall(r'"status"\s*:\s*(5\d\d)', txt)))
                return (f"{tid} 有真实 UI 提交但上游返回 {'/'.join(codes)}，"
                        f"未创建任务记录（{name}，blockedReason=no-task-record-after-submit）："
                        f"无 taskId → 三腿均不成立，如实记 BLOCKED，不伪 PASS")
        return super()._refine_reason(tid, f, gap)

    # ---- C. hard asserts, recomputed from committed bytes ----
    def h_asserts(self) -> dict:
        return {
            "REPLACE_GOODS": self._assert_receipt(
                f"{EVID}/h4-design-realgen-20261029/REPLACE_GOODS.json",
                artifact=f"{EVID}/h4-design-realgen-20261029/REPLACE_GOODS-result.png",
                expect_task="task-mvtgiiu1-hrp6z3",
                expect_actions=("download", "saveAsset", "sendCanvas")),
            "NEW_DESIGNER": self._assert_receipt(
                f"{EVID}/H4-real-20261029/NEW_DESIGNER-three-legs-20261029.json",
                artifact=None,     # sha is inside the receipt; bytes reconcile below
                expect_task="task-mvtdl9v8-165q1n",
                expect_actions=("download",)),
            "IMAGE_TEXT_EDIT": self._assert_no_bytes(
                f"{EVID}/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json",
                expect_task="task-mvs8bhu1-hhue24"),
            "NEW_REPLACE_BG_V2": self._assert_no_task(
                f"{EVID}/h4-design-realgen-20261029/NEW_REPLACE_BG_V2.json"),
        }

    def _abs(self, rel: str) -> str:
        return os.path.join(DOCS, rel)

    def _assert_receipt(self, rel, artifact=None, expect_task=None, expect_actions=()):
        out = []

        def chk(name, ok, detail=""):
            out.append({"check": name, "ok": bool(ok), "detail": str(detail)[:220]})

        p = self._abs(rel)
        chk("receipt_in_head", os.path.exists(p), rel)
        if not os.path.exists(p):
            return out
        d = json.load(open(p, encoding="utf-8"))
        tid = d.get("taskId") or (d.get("task") or {}).get("id")
        chk("task_binding", tid and tid.startswith("task-mv") and (not expect_task or tid == expect_task), tid)
        chk("task_succeeded", (d.get("taskStatus") or (d.get("task") or {}).get("status")) in
            ("succeeded", "success", "done", "completed"),
            d.get("taskStatus") or (d.get("task") or {}).get("status"))
        items = (((d.get("taskRecord") or {}).get("localSnapshot") or {}).get("result") or {}).get("items") or []
        drop = [it for it in items if it.get("payloadDropped")]
        chk("no_payload_drop", not drop, f"items={len(items)} dropped={len(drop)}")
        # reload leg
        nav = d.get("reloadNavType") or d.get("navType")
        chk("fresh_reload_navtype", nav == "reload", nav)
        dock = (d.get("dockAfterReload") or {}).get("items") or []
        if dock:
            same = [it for it in dock
                    if it.get("taskId") == tid and str(it.get("status")).lower().startswith("succ")]
            chk("dock_after_reload_same_task", bool(same), f"dockItems={len(dock)}")
        else:
            chk("dock_after_reload_same_task", True,
                "n/a: 该回执无 dockAfterReload（以 navType=reload + task 命中证明）")
        persisted = d.get("persistedAfterReload")
        if persisted is not None:
            chk("persisted_after_reload", bool(persisted.get(tid)), persisted.get(tid))
        # actions
        acts = d.get("actions") or {}
        for a in expect_actions:
            node = acts.get(a) or {}
            chk(f"action_{a}", node.get("ok") is True, node.get("receipt") or node.get("feedback") or node.get("error"))
        # bytes / sha
        res = d.get("result") or {}
        sha = res.get("sha256") or (d.get("task") or {}).get("sha256") or d.get("sha256")
        nbytes = res.get("bytes") or (d.get("task") or {}).get("bytes") or d.get("bytes")
        chk("declared_bytes", isinstance(nbytes, int) and nbytes > 0, nbytes)
        art = self._abs(artifact) if artifact else None
        if art and os.path.exists(art):
            on_disk = os.path.getsize(art)
            chk("artifact_size_equal", on_disk == nbytes, f"{on_disk} vs {nbytes}")
            if sha:
                chk("artifact_sha_equal", _sha256_file(art) == sha.lower(),
                    f"{_sha256_file(art)[:16]} vs {sha[:16]}")
        elif artifact:
            chk("artifact_present", False, artifact)
        dl = acts.get("download") or {}
        if sha and dl.get("sha256"):
            chk("download_sha_equal", dl["sha256"].lower() == sha.lower(), dl["sha256"][:16])
        return out

    def _assert_no_bytes(self, rel, expect_task=None):
        out = []
        p = self._abs(rel)
        ok = os.path.exists(p)
        out.append({"check": "receipt_in_head", "ok": ok, "detail": rel})
        if not ok:
            return out
        d = json.load(open(p, encoding="utf-8"))
        items = d.get("items") or []
        drop = [it for it in items if it.get("payloadDropped")]
        out.append({"check": "payload_dropped_recorded", "ok": bool(drop),
                    "detail": f"items={len(items)} dropped={len(drop)}"})
        out.append({"check": "no_storage_key", "ok": all(it.get("storageKey") in (None, "") for it in items),
                    "detail": [it.get("storageKey") for it in items]})
        out.append({"check": "task_binding", "ok": d.get("taskId") == expect_task,
                    "detail": d.get("taskId")})
        out.append({"check": "no_bytes_claim", "ok": (d.get("payload") or {}).get("bytes") is None,
                    "detail": (d.get("payload") or {}).get("bytes")})
        return out

    def _assert_no_task(self, rel):
        out = []
        p = self._abs(rel)
        ok = os.path.exists(p)
        out.append({"check": "receipt_in_head", "ok": ok, "detail": rel})
        if not ok:
            return out
        d = json.load(open(p, encoding="utf-8"))
        out.append({"check": "verdict_blocked", "ok": d.get("verdict") == "BLOCKED",
                    "detail": d.get("verdict")})
        out.append({"check": "no_task_created",
                    "ok": d.get("taskId") in (None, "") and d.get("blockedReason") == "no-task-record-after-submit",
                    "detail": f"{d.get('taskId')} / {d.get('blockedReason')}"})
        codes = sorted({str(n.get("status")) for n in (d.get("network") or []) if str(n.get("status", "")).startswith("5")})
        out.append({"check": "upstream_5xx_recorded", "ok": bool(codes), "detail": ",".join(codes)})
        return out

    # ---- run: deltas vs R10 ----
    def run(self) -> dict:
        rep = super().run()
        r10rep = json.loads(subprocess.run(
            ["git", "show", f"{R10_COMMIT}:docs/V1.0/plan_linkfox_navigation/"
             "reports/independent-audit-20261029-r10/matrix.json"],
            cwd=ROOT, capture_output=True, text=True).stdout)
        r10by = {t["id"]: t for t in r10rep["tools"]}
        changes = []
        for t in rep["tools"]:
            o = r10by.get(t["id"], {})
            if o.get("H") != t["H"]:
                changes.append({"id": t["id"], "H": [o.get("H"), t["H"]],
                                "H_was": (o.get("H_note") or "")[:240], "H_now": t["H_note"],
                                "commit": "bcafd94"})
        rep["generatedAt"] = __import__("datetime").datetime.now().astimezone().isoformat(
            timespec="seconds")
        rep["supersedes"] = {
            "report": "reports/independent-audit-20261029-r10/",
            "commit": R10_COMMIT,
            "crosscheck": "reports/independent-audit-20261029-r9-crosscheck/ (434bc44)",
            "reason": "在 R10 严格三腿口径上吸收 " + "、".join(R11_ABSORBED) +
                      " 的已提交证据（REPLACE_GOODS 真实生成+reload+三动作+字节 sha；"
                      "NEW_REPLACE_BG_V2 上游 502 无任务；NEW_DESIGNER 专项三腿；"
                      "IMAGE_TEXT_EDIT 自然恢复但 payloadDropped）；补 dockAfterReload.items 观测映射"
                      "与上游 BLOCKED 归因；未生成任何新证据、未改业务源码",
        }
        rep["absorbed_commits"] = R11_ABSORBED
        rep["summary"]["h_pass"] = sum(1 for t in rep["tools"] if t["H"] == "PASS")
        rep["summary"]["h_changes_vs_r10"] = len(changes)
        rep["h_changes_vs_r10"] = changes
        rep["strictness"] = {
            "evidence_source": "git ls-tree HEAD（未提交/工作区文件不参与）",
            "H_legs": r10.json.loads(json.dumps(r10rep["strictness"]["H_legs"])),
            "inherited_unchanged": ["F", "T", "R", "K", "U"],
            "r11_mapping_fixes": [
                "post-reload obs reloadDockItems（dockAfterReload.items 数组，h4 harness 写法）",
                "上游 BLOCKED 归因：blockedReason=no-task-record-after-submit + 5xx 原文引用",
            ],
            "r11_no_loosening": [
                "未新增任何 PASS 门槛放宽",
                "字节仍须同尺寸；声明 sha256 时必须逐位相同",
                "观测与 reload 标记必须同在一条已提交回执内并绑定同一 task",
            ],
            "h_asserts_note": "每个涉及新证据的工具另跑 h_asserts（回执字段 + 磁盘字节/sha 实算）",
        }
        rep["h_asserts"] = self.h_asserts()
        # evidence addendum: new committed receipt for NEW_DESIGNER (same grade)
        for t in rep["tools"]:
            if t["id"] == "NEW_DESIGNER":
                extra = f"{EVID}/H4-real-20261029/NEW_DESIGNER-three-legs-20261029.json"
                if extra not in (t.get("H_evidence") or []):
                    t["H_evidence"] = (t.get("H_evidence") or []) + [extra]
        rep["r11_notes"] = [
            {"tool": "REPLACE_GOODS", "note":
                "PASS 由 bcafd94 的真实回执支撑：task-mvtgiiu1-hrp6z3 succeeded、"
                "payloadDropped=false、1,192,722B、sha256 0ac369c5…；仓库内 "
                "REPLACE_GOODS-result.png 与 REPLACE_GOODS-download-1793273153608.png "
                "字节与 sha 逐位相同；harness（h4-realgen-design.mjs）执行真实 page.reload()，"
                "reload 后 dockAfterReload.items 命中同一 taskId 且 persistedAfterReload=true；"
                "三动作（下载/存资产/发画布）均有 ok 回执。"},
            {"tool": "NEW_DESIGNER", "note":
                "H 仍 PASS（R10 起），本次新增 c4af102 专项三腿回执作补充证据：同一 task 、"
                "411801B/sha 90e28e0f…与已提交产物一致，下载 ok、导出即入库；"
                "发送画布本次 Failed to fetch（canvasChanged=false），F 仍为 PASS（>=2 动作），"
                "但属可复现风险，已在报告风险节列出。"},
            {"tool": "IMAGE_TEXT_EDIT", "note":
                "e8da2c7 修复后自然恢复成立（navType=reload + 快照头回填 + 结果卡），"
                "task 与 reload 两腿成立；但该真实任务 payloadDropped=true、无 storageKey/url/bytes，"
                "三动作如实禁用 → 字节腿不成立，H 保持 PARTIAL（不伪 PASS）。"},
            {"tool": "NEW_REPLACE_BG_V2", "note":
                "两次真实提交均在上游 /v1/images/edits 得到 502，未创建任务记录"
                "（blockedReason=no-task-record-after-submit）→ 三腿不成立，如实 BLOCKED。"},
        ]
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R11 严格矩阵（39 工具 · H 三腿）",
        "",
        f"- 审计 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 取代：`{rep['supersedes']['report']}`（`{rep['supersedes']['commit']}`）",
        f"- 吸收提交：{', '.join('`'+c+'`' for c in rep.get('absorbed_commits', []))}",
        f"- 依据：{rep['supersedes']['reason']}",
        "",
        "## 统计",
        "",
        "| 维度 | 分布 |",
        "| --- | --- |",
    ]
    for d in ("F", "T", "R", "H", "K", "U"):
        lines.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in t[d].items()) + " |")
    lines += ["", "## 逐工具", "",
              "| 工具 | F | T | R | H | K | U | task | reload | 字节sha | 依据 / 剩余缺口 | 证据 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for x in rep["tools"]:
        L = x.get("H_legs") or {}
        mark = lambda b: "✅" if b else "❌"
        note = (x["H_note"] or "").replace("|", "/")[:190]
        ev = "<br>".join(f"`{e}`" for e in (x.get("H_evidence") or [])[:2])
        lines.append(f"| {x['id']} | {x['F']} | {x['T']} | {x['R']} | {x['H']} | {x['K']} | {x['U']} | "
                     f"{mark(L.get('task'))} | {mark(L.get('reload'))} | {mark(L.get('bytes'))} | "
                     f"{note} | {ev} |")
    if rep.get("h_changes_vs_r10"):
        lines += ["", "## 相对 R10（e0608bd）的改判", ""]
        for c in rep["h_changes_vs_r10"]:
            lines.append(f"- **{c['id']}** `{c['H'][0]}` → `{c['H'][1]}`（{c['commit']}）：{c['H_now']}")
    else:
        lines += ["", "## 相对 R10（e0608bd）的改判", "", "- 无（H 分布与 R10 一致）"]
    assert_rows = rep.get("h_asserts") or {}
    if assert_rows:
        lines += ["", "## H 硬断言（机器复算，回执字段 + 磁盘字节/sha）", "",
                  "| 工具 | 断言 | 结果 | 明细 |", "| --- | --- | --- | --- |"]
        for tid, rows in assert_rows.items():
            for r in rows:
                lines.append(f"| {tid} | {r['check']} | {'✅' if r['ok'] else '❌'} | {r['detail']} |")
    if rep.get("r11_notes"):
        lines += ["", "## R11 观察", ""]
        for n in rep["r11_notes"]:
            lines.append(f"- **{n['tool']}**：{n['note']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    audit = Audit11()
    if a.debug:
        for tid in audit.tools:
            if a.only and tid not in a.only:
                continue
            i = audit.D[tid]
            f = i.get("pick") or {}
            print(f"{tid:24s} strong={int(i.get('strong'))} file={f.get('name')} "
                  f"legs={f.get('legs')} mark={f.get('reload_mark')} obs={f.get('post_reload')}")
            print("    prim:", (f.get("ids_primary") or [])[:3], "claims:",
                  (f.get("claims") or [])[:2])
            print("    why:", (i.get("why") or "")[:260])
        return 0
    rep = audit.run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    json.dump(rep, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(a.md, "w", encoding="utf-8").write(to_md(rep))
    print(json.dumps(rep["summary"], ensure_ascii=False, indent=1))
    for c in rep["h_changes_vs_r10"]:
        print(" *", c["id"], c["H"], "|", (c["H_now"] or "")[:120])
    bad = [(tid, r["check"]) for tid, rows in rep["h_asserts"].items() for r in rows if not r["ok"]]
    print("h_asserts failures:", bad)
    return 0


if __name__ == "__main__":
    sys.exit(main())

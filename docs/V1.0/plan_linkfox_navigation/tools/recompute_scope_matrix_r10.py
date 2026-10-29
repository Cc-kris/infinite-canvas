#!/usr/bin/env python3
"""R10 (2026-10-29): strict re-audit on top of R9 (d596c25) + R9 crosscheck (434bc44).

R10 does **not** loosen the three H legs.  It only fixes two things:

  A. evidence-mapping gaps still left after the R9 crosscheck
     * the fresh-reload node written by the c39ad37 live-UI receipts is
       `"fresh_reload": {...}` (snake_case) and was not in the reload-node list;
     * its post-reload observation is `history_card_status=succeeded` +
       `stored_bytes: [<n>]` + `result_img_in_card`, none of which matched the
       observation regexes (dockItems/rows/items all expect arrays of objects);
     * the byte claim of the AI_WEARABLE receipt carries `sha256_browser` /
       `sha256_on_disk` (not `sha256`) and its node has no `fileName/file/
       storageKey`, so the artifact-node hint rejected it;
     * artifact claims are now also read **path-aware** (`result.*`,
       `actions.download.*`, `persisted.*`) so a result node is recognised even
       without legacy hint fields — the sha/size reconciliation is unchanged.

  B. gap-attribution accuracy (结论不变，只把原因写成证据原文)
     * `verdict=BLOCKED(payload)` / `payloadDropped=true` receipts;
     * `countForTool=0` receipts (`dockToolId` + `count: "0 条"` + `rows: []`);
     * `failed/submit-unconfirmed` task receipts.

Every PASS still requires all three legs against **committed** blobs:
  1. tool-scoped real task-mv* (primary pointer, not failed, not synthetic)
  2. machine fresh-reload marker + post-reload observation bound to the same
     task id / result bytes / sha
  3. the claimed result bytes reproduced by this tool's committed artifact
     with equal size and, when a sha256 is claimed, an equal sha256 prefix.

No evidence is produced, no business source is touched.  Output:
  reports/independent-audit-20261029-r10/{matrix.json,matrix.md}

Usage:
  python3 tools/recompute_scope_matrix_r10.py [--debug] [--only TOOL ...]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "r9base", os.path.join(HERE, "recompute_scope_matrix_r9.py"))
r9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r9)

ROOT = r9.ROOT
DOCS = r9.DOCS
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r10")
R9DIR = os.path.join(DOCS, "reports/independent-audit-20261029-r9")
CCDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r9-crosscheck")
R9_COMMIT = "d596c25"
CC_COMMIT = "434bc44"

# ---------- A. reload node / observation / byte-claim mapping ----------
# snake_case node written by the c39ad37 live-UI receipts
r9.NODE_RE = re.compile(
    r'"(?:reload|freshReload|fresh_reload|afterReload|historyAfterReload|reloadProof|'
    r'historyRecovery|persistedAfterReload|fresh_reload_path|reloadReceipt)"\s*:\s*[\{\[]', re.I)
r9.OBS_RES = r9.OBS_RES + [
    # fresh_reload: { method: "CDP Page.reload …", history_card_status: succeeded,
    #                 stored_status: succeeded, stored_bytes: [2115031], result_img_in_card: 1 }
    ("storedBytes", re.compile(r'"stored_bytes"\s*:\s*\[\s*\d{5,}')),
    ("historyCardStatus", re.compile(
        r'"history_card_status"\s*:\s*"(?:succeeded|success|done|completed)"')),
    ("storedStatus", re.compile(r'"stored_status"\s*:\s*"(?:succeeded|success|done|completed)"')),
    ("resultImgInCard", re.compile(r'"result_img_in_card"\s*:\s*[1-9]')),
]
SHA_KEYS = ("sha256", "sha", "sha256Short", "sha16", "digest",
            "sha256_browser", "sha256_on_disk", "sha256Browser", "sha256OnDisk",
            "fetchedSha256", "fetched_sha256", "blobSha256")
ARTIFACT_PATH_HINT = re.compile(
    r"(?:^|\.)(?:result|results|download|downloads|output|outputs|actions|canvas|asset|assets|"
    r"persisted|stored|restored)(?:\.|$)", re.I)
INPUT_PATH_HINT = re.compile(r"upload|input|mask|source|reference|fixture|prompt|cases", re.I)
SYNTH_DIR = r9.SYNTH_PATH
ID_RE = r9.ID_RE
MEDIA = r9.MEDIA


def _walk_paths(node, path, out, depth=0):
    """yield (dot-path, dict) for every dict node."""
    if depth > 14:
        return
    if isinstance(node, dict):
        out.append((".".join(path), node))
        for k, v in node.items():
            _walk_paths(v, path + [str(k)], out, depth + 1)
    elif isinstance(node, list):
        for v in node:
            _walk_paths(v, path, out, depth + 1)


class Audit10(r9.Audit9):
    # ---- extra artifact claims (path-aware, sha-key complete) ----
    def _claims_extra(self, tid: str, receipt: str, d) -> list[dict]:
        if d is None:
            return []
        nodes: list[tuple[str, dict]] = []
        _walk_paths(d, [], nodes)
        out = []
        for path, nd in nodes:
            b = None
            for k in r9.BYTE_KEYS:
                v = nd.get(k)
                if isinstance(v, int) and v >= 50_000:
                    b = v
                    break
            if b is None:
                continue
            if INPUT_PATH_HINT.search(path):
                continue
            sha = None
            for k in SHA_KEYS:
                v = nd.get(k)
                if isinstance(v, str):
                    m = r9.SHA_STR.search(v.lower())
                    if m:
                        sha = m.group(1)
                        break
            filename = any(isinstance(nd.get(k), str) and nd.get(k)
                           for k in ("fileName", "file", "storageKey", "evidence_file",
                                     "assetId", "nodeId", "nodeStorageKey"))
            if not (sha or filename or ARTIFACT_PATH_HINT.search(path)):
                continue
            hit = self._artifact(tid, receipt, b, sha)
            if hit:
                out.append({"bytes": b, "sha": sha, "where": path or "claim", "artifact": hit})
        return out

    def _analyze(self, tid: str, p: str, t: str, d, nodes: list) -> dict:
        res = super()._analyze(tid, p, t, d, nodes)
        if SYNTH_DIR.search(p):
            return res
        extra = self._claims_extra(tid, p, d)
        if not extra:
            return res
        have = {(c["bytes"], c["sha"]) for c in res.get("claims") or []}
        new = [c for c in extra if (c["bytes"], c["sha"]) not in have]
        if not new:
            return res
        res["claims"] = (res.get("claims") or []) + [
            {"bytes": c["bytes"], "sha": c["sha"], "where": c["where"]} for c in new][:8]
        if not res["legs"].get("bytes"):
            best = new[0]
            res["byte_proof"] = {"bytes": best["bytes"], "sha": best["sha"],
                                 "where": best["where"], "artifact": best["artifact"],
                                 "ok": True}
            res["legs"]["bytes"] = True
        return res

    # ---- B. attribution refinement (never changes PASS/PARTIAL) ----
    def _receipts_for(self, tid: str) -> list[str]:
        paths = [f["path"] for f in (self.scan.get(tid) or [])]
        slug = tid.lower().replace("_", "-")
        for p in self.files:
            if p in paths or self.files[p] == 0 or self.files[p] > r9.MAX_TEXT:
                continue
            if not p.lower().endswith(r9.TEXT_EXT):
                continue
            if slug in p.lower() and any(k in p.lower() for k in ("receipt", "audit", "summary",
                                                                 "reload", "restore", "run")):
                paths.append(p)
        return paths

    def _refine_reason(self, tid: str, f: dict, gap: str) -> str | None:
        tried = 0
        for p in self._receipts_for(tid):
            if tried >= 12:
                break
            if r9.SYNTH_PATH.search(p):
                continue
            txt = self.text(p)
            if tid not in txt and tid.lower().replace("_", "-") not in p.lower():
                continue
            tried += 1
            name = p.split("/evidence/")[-1]
            if re.search(r'"payloadDropped"\s*:\s*true|"resultItemPayloadDropped"\s*:\s*true',
                         txt):
                verdict = "BLOCKED(payload)" if "BLOCKED(payload)" in txt else "payloadDropped=true"
                return (f"{tid} 有成功真实任务，但回执 {name} 记 {verdict}："
                        f"结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布")
            if re.search(r'"count"\s*:\s*"0\s*条"', txt) and re.search(
                    r'"dockToolId"\s*:\s*"' + re.escape(tid) + '"', txt):
                return (f"{tid} 常驻 profile 历史坞 0 条、rows=[]、storedTasks=[]（{name}，"
                        f"countForTool=0）：无该工具任务快照，reload 后无可恢复结果")
        return None

    def _three_legs(self, tid: str, f: dict):
        gap = super()._three_legs(tid, f)
        if gap is None:
            return None
        refined = self._refine_reason(tid, f, gap)
        return refined or gap

    # ---- run: compare against R9 (d596c25) and the R9 crosscheck ----
    def run(self) -> dict:
        rep = super().run()
        r9rep = json.loads(subprocess.run(
            ["git", "show", f"{R9_COMMIT}:docs/V1.0/plan_linkfox_navigation/"
             "reports/independent-audit-20261029-r9/matrix.json"],
            cwd=ROOT, capture_output=True, text=True).stdout)
        r9by = {t["id"]: t for t in r9rep["tools"]}
        cc = json.loads(open(os.path.join(CCDIR, "crosscheck.json"), encoding="utf-8").read())
        ccpass = {r["id"] for r in cc["rows"] if r.get("H") == "PASS"}
        changes = []
        for t in rep["tools"]:
            o = r9by.get(t["id"], {})
            if o.get("H") != t["H"]:
                changes.append({"id": t["id"], "H": [o.get("H"), t["H"]],
                                "H_was": (o.get("H_note") or "")[:240],
                                "H_now": t["H_note"], "source":
                                "r9-crosscheck-mapping" if t["id"] in ccpass else "new-committed-evidence"})
        rep["generatedAt"] = __import__("datetime").datetime.now().astimezone().isoformat(
            timespec="seconds")
        rep["supersedes"] = {
            "report": "reports/independent-audit-20261029-r9/",
            "commit": R9_COMMIT,
            "crosscheck": f"reports/independent-audit-20261029-r9-crosscheck/ ({CC_COMMIT})",
            "reason": "在 R9 严格三腿口径上吸收 R9 crosscheck 的映射修复（dockItems 数组观测/"
                      "declaredBytes/slug 产物名）与 434bc44 之后已提交的真实证据"
                      "（c39ad37+c2246ce AI_DRESSING_V2/AI_WEARABLE 真实 taskId+Page.reload+"
                      "字节+sha256；018a6e1 REMOVE_PEN/CC_V2 payloadDropped 字节缺口）；"
                      "补 fresh_reload/stored_bytes/sha256_browser 映射与归因精修；未生成任何新证据",
        }
        rep["rubric"]["H"] = (
            "真实 task-mv*（primary taskId 绑定、非 failed、非 synthetic）+ 机器 fresh reload 标记"
            "（phase/navType=reload、reload/fresh_reload 对象节点、Page.reload/location.reload() 回执）"
            "且同一回执内有刷新后观测（dockItems 数组/rows/stored_bytes/result_img_in_card）"
            "并指向该 task 或其结果字节/sha + 下载/入库/发画布字节须由该工具已提交产物按同尺寸"
            "（+声明 sha256 时）同 sha 复核；b5-*/task-real-*、recovery|inject 目录、payloadDropped、"
            "快照回填一律不计")
        rep["summary"]["h_pass"] = sum(1 for t in rep["tools"] if t["H"] == "PASS")
        rep["summary"]["h_changes_vs_r9"] = len(changes)
        rep["h_changes_vs_r9"] = changes
        rep["strictness"] = {
            "evidence_source": "git ls-tree HEAD（未提交/工作区文件不参与）",
            "H_legs": ["taskId binding",
                       "fresh reload marker + post-reload observation bound to same task/bytes/sha",
                       "download/asset/canvas bytes: size AND sha256 vs this tool's committed artifact"],
            "inherited_unchanged": ["F", "T", "R", "K", "U"],
            "r10_mapping_fixes": [
                "reload node fresh_reload（snake_case）",
                "post-reload obs stored_bytes / history_card_status / result_img_in_card",
                "byte sha keys sha256_browser / sha256_on_disk",
                "path-aware artifact claims（result.*/actions.download.*），仍做同尺寸+同 sha 对账",
                "归因精修：payloadDropped=true / countForTool=0 / failed-task",
            ],
        }
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R10 严格矩阵（39 工具 · H 三腿）",
        "",
        f"- 审计 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 取代：`{rep['supersedes']['report']}`（`{rep['supersedes']['commit']}`）；"
        f"并入 crosscheck `{R9_COMMIT}`→`{CC_COMMIT}`",
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
    if rep["h_changes_vs_r9"]:
        lines += ["", "## 相对 R9（d596c25）的改判", ""]
        for c in rep["h_changes_vs_r9"]:
            lines.append(f"- **{c['id']}** `{c['H'][0]}` → `{c['H'][1]}`"
                         f"（{c['source']}）：{c['H_now']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    audit = Audit10()
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
    for c in rep["h_changes_vs_r9"]:
        print(" *", c["id"], c["H"], c["source"], "|", (c["H_now"] or "")[:120])
    return 0


if __name__ == "__main__":
    sys.exit(main())

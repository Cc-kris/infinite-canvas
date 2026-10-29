#!/usr/bin/env python3
"""R8-fix (2026-10-29): repair the **evidence matching** of the R8 audit.

R8 (commit 76957dd) judged dimension H only from the `H_evidence` strings that
R7 had stored in its matrix.  Everything R7 did not list there was reported as
"未取证"，even when a committed machine receipt existed.  Concretely:

  * `tracked()` only tried `evidence/<rel>` and `evidence/real-acceptance/<rel>`,
    so a receipt referenced as `real-acceptance/...` resolved to
    `evidence/real-acceptance/real-acceptance/...` and was reported missing;
  * the task-id regex `task-mv[a-z0-9]{4,}-[a-z0-9]{4,}` cannot match a
    wildcard reference (`task-mvt0rvni-*`), so FISSION_LINK's real id was lost;
  * files committed later than R8 (5fc2e69 AI_DRESSING_XSY reload receipt,
    0d1eaaa 5-tool fresh-reload text, fc38b49 FISSION_LINK restore receipt,
    df765ff SALE_VIDEO reload receipt) were never re-scanned.

This script keeps every R8 rule and every non-H dimension **byte-identical**
(F/T/R/K/U are inherited from `recompute_scope_matrix_r8.Audit`), and only
changes *where* H looks for evidence:

  * repo-wide scan of tracked text evidence (json/md/txt/html, <=3 MB);
  * tool binding accepted in four machine-checkable forms:
      (a) JSON node with `toolId`/`dockToolId`/`toolIdExpected` == tool,
      (b) root object keyed by the tool id (e.g. `summary.json` per-tool keys),
      (c) `byTool[tool]` arrays (task inventory),
      (d) single-tool capture file named after the tool with no toolId field;
  * reload proof must be structural (`phase`/`nav`/`navType` == reload,
    `freshReload`/`afterReload`/`verifiedAfterReload`/`survivesReload`), or a
    textual marker whose file also carries a reconciled byte claim.  The UI
    empty-state sentence "提交一次后会在这里留下任务…刷新后仍在" is masked out
    so it can never be mistaken for a reload receipt;
  * byte claim must be reproduced by a committed artifact (same size, or the
    sha256 prefix), exactly like R8's R dimension;
  * negative markers (`resultRestored: false`, `historyUi: false`, dropped
    payload) force PARTIAL even when a reload happened — a reload that does not
    bring the result back is not history recovery;
  * synthetic data is rejected: ids starting with `task-real-`/`b5-` and files
    under `*recovery*`/`*inject*` never count as real history.

No new evidence is produced.  Output: reports/independent-audit-20261029-r8-fix/

Usage:
  python3 tools/recompute_scope_matrix_r8_fix.py [--debug] [--json out] [--md out]
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
    "r8base", os.path.join(HERE, "recompute_scope_matrix_r8.py"))
r8 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r8)

ROOT = r8.ROOT
DOCS = r8.DOCS
EV = r8.EV
ID_RE = r8._ID_RE
MEDIA = r8.MEDIA
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r8-fix")
R8DIR = os.path.join(DOCS, "reports/independent-audit-20261029-r8")

TEXT_EXT = (".json", ".md", ".txt", ".html")
MAX_TEXT = 3_000_000
SYNTH_ID = re.compile(r"^task-(real|seed|fake|b5)", re.I)
SYNTH_PATH = re.compile(r"(recovery|inject|seed)", re.I)
UI_NOISE = (
    "提交一次后会在这里留下任务、配置与结果，刷新后仍在。",
    "刷新后仍在。",
)
RELOAD_STRUCT = re.compile(
    r'"(?:nav|navType|navigationType|phase|loadType|mode|reloadKind)"\s*:\s*'
    r'"(?:reload|fresh[-_ ]?load|freshload|hard[-_ ]?reload|page[-_ ]?reload)"', re.I)
RELOAD_FLAG = re.compile(
    r'"(?:freshReload|afterReload|verifiedAfterReload|survivesReload|pageReload|'
    r'reloadedOnce|afterReloadCropTasks|historyAfterReload)"\s*:\s*(?:true|\{|\[)', re.I)
RELOAD_TEXT = re.compile(
    r"location\.reload\(|page\.reload\(|Page\.navigate|location\.assign|"
    r"fresh[-_ ]?load|fresh reload|整页导航|硬重载|全新加载|重新加载页面|刷新页面后", re.I)
NEG_RE = re.compile(
    r'"resultRestored"\s*:\s*false|"historyUi"\s*:\s*false|'
    r'"historyRestored"\s*:\s*false|"dockRestored"\s*:\s*false|'
    r'"resultsRestored"\s*:\s*false', re.I)
# 任务记录不是页面自然产生、而是审计脚本把真实上游产物 URL 回填成快照 —— 与
# R8 对 upsertTask 注入记录的判定保持一致：可以证明结果渲染/按钮可用，但不能
# 证明"刷新后历史自然恢复"，故不计 H=PASS。注意排除 FISSION 回执里的
# "结果回填"（那是 reload 后结果回到面板的描述，不是快照回填）。
BACKFILL_RE = re.compile(
    r"回填任务快照|任务快照回填|快照回填|upsertTask|注入任务记录|backfill(?:ed)?Task", re.I)
# 结果项只有元数据、payload 已丢：历史列表可复原但字节不可复原
PAYLOAD_DROP_RE = re.compile(r'"resultItemPayloadDropped"\s*:\s*true|"payloadDropped"\s*:\s*true', re.I)
BYTES_RE = re.compile(r'"(?:bytes|size|fetchedBytes|fileBytes|bytesMatch)"\s*:\s*(\d{5,})')
SHA16_RE = re.compile(r"\b([0-9a-f]{16})\b")


def mask_noise(text: str) -> str:
    for s in UI_NOISE:
        text = text.replace(s, " ")
    return text


def ids_in(node) -> set[str]:
    out: set[str] = set()

    def rec(n):
        if isinstance(n, dict):
            for v in n.values():
                rec(v)
        elif isinstance(n, list):
            for v in n:
                rec(v)
        elif isinstance(n, str):
            for m in ID_RE.finditer(n):
                out.add(m.group(0))

    rec(node)
    return out


class AuditFix(r8.Audit):
    def __init__(self) -> None:
        super().__init__()
        self.tools = [t["id"] for t in self.matrix["tools"]]
        self.TOOLS = set(self.tools)
        self._txt: dict[str, str] = {}
        self._doc: dict[str, object | None] = {}
        self._bound: dict[str, dict] = {}
        self._scan()
        self._match()

    # ---------- scan ----------
    def _rank_ids(self, f: dict, ids: list[str]) -> list[str]:
        """Order the ids bound to one receipt by how strongly the receipt ties
        the *verified* bytes/sha to that id (multi-task dumps otherwise let a
        failed row 'own' another task's artifact)."""
        win = f.get("win") or {}

        def score(i: str) -> int:
            w = win.get(i, "")
            n = 0
            # the receipt's own "primary task" pointer beats anything else;
            # "reusedTask/realTaskId" declares the task actually verified after
            # reload, a dock-row "clickedTask" is only a UI interaction target.
            if re.search(r'"(?:realTaskId|reusedTask|restoredTaskId|targetTaskId)"'
                         r'\s*:\s*"' + re.escape(i) + '"', w):
                n += 20
            if re.search(r'"clickedTask"\s*:\s*"' + re.escape(i) + '"', w):
                n += 5
            for c in f.get("bytes") or []:
                if str(c) in w:
                    n += 3
            for s in f.get("sha16") or []:
                if s in w:
                    n += 3
            if re.search(r'"status"\s*:\s*"succeeded"', w):
                n += 1
            return n

        return sorted(ids, key=score, reverse=True)
    def text(self, p: str) -> str:
        if p not in self._txt:
            self._txt[p] = r8.head_text(p)
        return self._txt[p]

    def doc(self, p: str):
        if p not in self._doc:
            d = None
            if p.endswith(".json") and 0 < self.files[p] <= MAX_TEXT:
                try:
                    d = json.loads(self.text(p))
                except Exception:
                    d = None
            self._doc[p] = d
        return self._doc[p]

    def _scan(self) -> None:
        """Per file: which tools are bound and to which real task ids."""
        sizes = {p: s for p, s in self.files.items()
                 if p.lower().endswith(MEDIA) and s >= 50_000}
        self.media_sizes = sizes
        self._sha_cache: dict[str, str] = {}
        for p, size in self.files.items():
            if size == 0 or size > MAX_TEXT or not p.lower().endswith(TEXT_EXT):
                continue
            t = self.text(p)
            if "task-mv" not in t:
                continue
            d = self.doc(p)
            bound: dict[str, set[str]] = {}
            nodes: dict[str, list] = {}
            if d is not None:
                def rec(n):
                    if isinstance(n, dict):
                        for k in ("toolId", "dockToolId", "toolIdExpected", "tool"):
                            v = n.get(k)
                            if isinstance(v, str) and v in self.TOOLS:
                                bound.setdefault(v, set()).update(ids_in(n))
                                nodes.setdefault(v, []).append(n)
                        for k, v in n.items():
                            if isinstance(k, str) and k in self.TOOLS:
                                bound.setdefault(k, set()).update(ids_in(v))
                                nodes.setdefault(k, []).append(v)
                            if k == "byTool" and isinstance(v, dict):
                                for tk, tv in v.items():
                                    if tk in self.TOOLS:
                                        bound.setdefault(tk, set()).update(ids_in(tv))
                                        nodes.setdefault(tk, []).append(tv)
                        for v in n.values():
                            rec(v)
                    elif isinstance(n, list):
                        for v in n:
                            rec(v)
                rec(d)
            if not bound:
                # text/HTML receipt: "toolId": "TOOL" blocks, else single-tool file
                for tid in self.TOOLS:
                    for m in re.finditer(r'"toolId"\s*:\s*"' + re.escape(tid) + '"', t):
                        seg = t[m.start():m.start() + 3000]
                        ids = {x.group(0) for x in ID_RE.finditer(seg)}
                        if ids:
                            bound.setdefault(tid, set()).update(ids)
                if not bound and '"toolId"' not in t:
                    tok = [tid for tid in self.TOOLS
                           if re.search(re.escape(tid), p, re.I)]
                    if len(tok) == 1:
                        bound[tok[0]] = {m.group(0) for m in ID_RE.finditer(t)}
            if not bound:
                continue
            reload_kind = None
            t2 = mask_noise(t)
            if RELOAD_STRUCT.search(t2):
                reload_kind = "结构化 reload 字段 (" + RELOAD_STRUCT.search(t2).group(0)[:48] + ")"
            elif RELOAD_FLAG.search(t2):
                reload_kind = "结构化 reload 标记 (" + RELOAD_FLAG.search(t2).group(0)[:48] + ")"
            elif RELOAD_TEXT.search(t2):
                reload_kind = "文字 reload 声明 (" + RELOAD_TEXT.search(t2).group(0)[:32] + ")"
            for tid, ids in bound.items():
                # claims / negative markers must come from *this tool's* subtree,
                # otherwise a multi-tool file would lend another tool's bytes.
                if nodes.get(tid):
                    try:
                        blob = mask_noise(json.dumps(nodes[tid], ensure_ascii=False))
                    except Exception:
                        blob = t2
                else:
                    blob = t2
                neg = NEG_RE.search(blob)
                backfill = BACKFILL_RE.search(blob)
                drop = PAYLOAD_DROP_RE.search(blob)
                claims = sorted({int(m.group(1)) for m in BYTES_RE.finditer(blob)})
                shas = set(m.group(1) for m in SHA16_RE.finditer(blob))
                slot = self._bound.setdefault(tid, {"files": []})
                slot["files"].append({
                    "path": p, "ids": sorted(ids), "reload": reload_kind,
                    "negative": (neg.group(0) if neg else None),
                    "backfill": (backfill.group(0) if backfill else None),
                    "payload_drop": bool(drop),
                    "bytes": [c for c in claims if c >= 50_000],
                    "sha16": sorted(shas), "synthetic_path": bool(SYNTH_PATH.search(p)),
                    "win": {i: " ".join(blob[max(0, m.start() - 450):m.start() + 550]
                                        for m in re.finditer(re.escape(i), blob))
                            for i in ids},
                })

    def media_sha(self) -> dict[str, str]:
        return r8.Audit.media_sha(self)

    def _sha_of(self, p: str) -> str:
        if p not in self._sha_cache:
            self._sha_cache[p] = hashlib.sha256(r8.head_blob(p)).hexdigest()
        return self._sha_cache[p]

    def reconcile(self, claims: list[int], shas: set[str], tid: str) -> tuple[bool, str]:
        """Can any committed artifact reproduce a claimed size / sha prefix?"""
        for n in claims:
            hit = [p for p, s in self.media_sizes.items() if s == n]
            if hit:
                return True, f"{n}B == {hit[0].split('/evidence/')[-1]}"
        if shas:
            # only hash media that could plausibly be this tool's artifact
            cand = [p for p in self.media_sizes
                    if tid.lower() in p.lower() or os.path.basename(p).startswith("result")]
            cand.sort(key=lambda p: self.media_sizes[p], reverse=True)
            for p in cand[:40]:
                if any(self._sha_of(p).startswith(x) for x in shas):
                    return True, f"sha256 前缀 == {p.split('/evidence/')[-1]}"
        return False, ""

    # ---------- per-tool decision ----------
    def _match(self) -> None:
        self.D: dict[str, dict] = {}
        name = lambda f: f["path"].split("/evidence/")[-1]
        for tid in self.tools:
            slot = self._bound.get(tid)
            info = {"strong": False, "why": "", "ev": [], "id": None}
            best = None
            if slot:
                rows = []
                for f in slot["files"]:
                    real = [i for i in f["ids"] if not SYNTH_ID.match(i)]
                    if not real:
                        continue
                    rows.append((bool(f["reload"]), not f["synthetic_path"],
                                 bool(f["negative"]), bool(f.get("backfill")), f, real))
                rows.sort(key=lambda r: (r[0] and r[1] and not r[2] and not r[3]
                                         and not r[4].get("payload_drop"), r[0], r[1]),
                          reverse=True)
                info["ev"] = [name(r[4]) for r in rows[:4]]
                for has_reload, clean, neg, backfill, f, real in rows:
                    ok, why = self.reconcile(f["bytes"], set(f["sha16"]), tid)
                    rep_id = self._rank_ids(f, real)[0]
                    cand = {"id": rep_id, "file": name(f), "reload": f["reload"],
                            "ok": ok, "why": why, "negative": f["negative"],
                            "backfill": f.get("backfill"), "clean": clean,
                            "payload_drop": bool(f.get("payload_drop")),
                            "bytes": f["bytes"], "ev": name(f)}
                    if has_reload and clean and ok and not neg and not backfill \
                            and not f.get("payload_drop"):
                        best = cand
                        info["all_clear"] = True
                        break
                    if best is None:
                        best = cand
                # a machine-readable negative (result does not come back after reload)
                # anywhere in this tool's committed receipts caps H at PARTIAL
                blockers = [r for r in rows
                            if r[2] or r[3] or (r[4].get("payload_drop") and r[4]["reload"])]
                if best:
                    info.update(best)
                    if blockers and info.get("all_clear"):
                        b = blockers[0]
                        info["all_clear"] = False
                        info["negative"] = info["negative"] or b[4]["negative"]
                        info["backfill"] = info.get("backfill") or b[4].get("backfill")
                        info["payload_drop"] = info.get("payload_drop") or b[4].get("payload_drop")
                        info["blocker_file"] = name(b[4])
                    if info.get("all_clear"):
                        info["strong"] = True
            # curated, evidence-driven refusal reasons
            info["why"] = self._reason(tid, info)
            self.D[tid] = info

    def _reason(self, tid: str, info: dict) -> str:
        if info.get("strong"):
            return ""
        if not info.get("id"):
            hist = self._history_scan(tid)
            if hist is None:
                return "已全仓检索已提交文本证据：无该工具绑定的真实 task-mv 任务（taskId+toolId 同现）"
            n, succ, files = hist
            if n == 0:
                return f"真实浏览器全新加载后历史坞 0 条（{files[0]}），该工具无任务可恢复"
            return (f"全新加载后历史 {n} 条、其中 succeeded {succ} 条（{files[0]}），"
                    f"原始文件未保留/仅元数据，无可复核结果")
        i = info["id"]
        if info.get("negative"):
            return (f"真实 task {i} 有 reload 采集（{info.get('blocker_file') or info['file']}），"
                    f"但回执自述 {info['negative']}：结果不回流，仅恢复草稿与源图")
        if info.get("backfill"):
            return (f"真实 task {i} 有 reload 采集（{info.get('blocker_file') or info['file']}），"
                    f"但任务记录是按真实产物 URL 回填的快照（命中「{info['backfill']}」）后渲染："
                    f"可证结果展示与按钮可用，不可证历史由页面自然恢复")
        if info.get("payload_drop"):
            return (f"真实 task {i} 历史坞在 fresh reload 后复原（{info.get('blocker_file') or info['file']}），"
                    f"但结果项 payloadDropped=true：快照只存元数据，无字节可下载/入库/上画布，"
                    f"字节不可复核")
        if not info.get("reload"):
            return (f"有该工具绑定的真实 task {i}（{info['file']}），"
                    f"但无机器 fresh reload 回执（仅文字描述或普通页面采集）")
        if not info.get("clean"):
            return f"仅注入/合成件（{info['file']}）声明 task {i}，不计为真实历史"
        if not info.get("ok"):
            b = info.get("bytes") or []
            claim = f"声明 {b[0]}B" if b else "未声明结果字节"
            return (f"真实 task {i} + reload 采集（{info['file']}），但{claim}，"
                    f"已提交产物中无同尺寸/sha 可复核文件")
        return ""

    def _history_scan(self, tid: str):
        """Aggregate the dedicated per-tool history captures (design19 / dumps)."""
        n = succ = 0
        files: list[str] = []
        for p in self.files:
            if not p.lower().endswith(".json") or self.files[p] == 0:
                continue
            if tid.lower() not in p.lower():
                continue
            d = self.doc(p)
            if not isinstance(d, dict):
                continue
            rows = d.get("rows")
            if not isinstance(rows, list):
                continue
            n += len(rows)
            succ += sum(1 for r in rows if isinstance(r, dict) and r.get("status") == "succeeded")
            files.append(p.split("/evidence/")[-1])
        if not files:
            return None
        return n, succ, files

    # ---------- override only H ----------
    def dim_h(self, tid: str, row: dict):
        base = r8.Audit.dim_h(self, tid, row)
        info = self.D.get(tid) or {}
        if info.get("strong"):
            return ("PASS",
                    f"真实 task {info['id']} + {info['reload']}，{info['why'] or '字节可复核'}",
                    [info["file"]])
        if base[0] == "PASS":
            return base
        why = info.get("why") or base[1]
        ev = info.get("ev") or base[2]
        return ("PARTIAL", why, ev)

    def run(self) -> dict:
        rep = super().run()
        r8rep = json.load(open(os.path.join(R8DIR, "matrix.json"), encoding="utf-8"))
        old = {t["id"]: t for t in r8rep["tools"]}
        fixes = []
        for t in rep["tools"]:
            o = old.get(t["id"], {})
            if o.get("H") != t["H"] or (o.get("H_note") or "") != (t.get("H_note") or ""):
                fixes.append({
                    "id": t["id"], "H": [o.get("H"), t["H"]],
                    "H_note": [o.get("H_note"), t["H_note"]],
                    "H_evidence": t.get("H_evidence"),
                })
        rep["generatedAt"] = __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds")
        rep["supersedes"] = {"report": "reports/independent-audit-20261029-r8/",
                             "commit": r8rep.get("head", "")[:7],
                             "reason": "修正 H 维度的证据匹配（全仓扫描 + 真实 taskId 绑定 + 机器 reload 标记 + 字节对账）；F/T/R/K/U 与 R8 完全一致；未生成任何新证据"}
        rep["rubric"]["H"] = ("真实 task-mv* + 机器 fresh reload 回执 + 字节可复核；"
                              "toolId 子树/根键/byTool/单工具采集文件四种绑定均认可；"
                              "b5-*/task-real-* 与 recovery/inject 目录一律不算；"
                              "回执自述 resultRestored=false / historyUi=false 强制 PARTIAL")
        rep["summary"]["h_corrections"] = len(fixes)
        rep["h_corrections"] = fixes
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R8-fix 矩阵（39 工具 · 仅修正 H 证据匹配）",
        "",
        f"- 审计 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 取代：`{rep['supersedes']['report']}`（提交 `{rep['supersedes']['commit']}`）",
        f"- 修正理由：{rep['supersedes']['reason']}",
        "",
        "## 统计",
        "",
        "| 维度 | 分布 |",
        "| --- | --- |",
    ]
    for d in ("F", "T", "R", "H", "K", "U"):
        lines.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in t[d].items()) + " |")
    lines += ["", "## 逐工具", "",
              "| 工具 | F | T | R | H | K | U | H 依据 / 未通过原因 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for x in rep["tools"]:
        note = (x["H_note"] or "").replace("|", "/")[:150]
        lines.append(f"| {x['id']} | {x['F']} | {x['T']} | {x['R']} | {x['H']} | {x['K']} | {x['U']} | {note} |")
    if rep["h_corrections"]:
        lines += ["", "## H 维度修正（R8 → R8-fix）", ""]
        for c in rep["h_corrections"]:
            lines.append(f"- **{c['id']}** `{c['H'][0]}` → `{c['H'][1]}`：{c['H_note'][1]}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    audit = AuditFix()
    if a.debug:
        for tid in audit.tools:
            if a.only and tid not in a.only:
                continue
            i = audit.D[tid]
            print(f"{tid:24s} strong={int(i.get('strong'))} id={i.get('id')} "
                  f"reload={bool(i.get('reload'))} ok={i.get('ok')} neg={bool(i.get('negative'))} "
                  f"file={i.get('file')}")
            for f in (audit._bound.get(tid) or {}).get("files", []):
                print(f"      cand {f['path'].split('/evidence/')[-1]} ids={f['ids'][:3]} "
                      f"reload={bool(f['reload'])} neg={f['negative']} bytes={f['bytes'][:3]} "
                      f"sha={f['sha16'][:2]} synthpath={f['synthetic_path']}")
            print("    why:", i.get("why")[:200])
        return 0
    rep = audit.run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    json.dump(rep, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(a.md, "w", encoding="utf-8").write(to_md(rep))
    print(json.dumps(rep["summary"], ensure_ascii=False, indent=1))
    for c in rep["h_corrections"]:
        print(" *", c["id"], c["H"], "|", c["H_note"][1][:120])
    return 0


if __name__ == "__main__":
    sys.exit(main())

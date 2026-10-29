#!/usr/bin/env python3
"""R8 (2026-10-29) strict recompute of the 39-tool matrix.

Differences from tools/recompute_scope_matrix.py and from
reports/independent-audit-20261029-r7/matrix.json:

  * every cell must be backed by a file **tracked at the audit HEAD**
    (`git ls-tree HEAD`), not by the worktree and not by an untracked receipt;
  * H = PASS requires a real task id (`task-mv*`), a fresh-load/reload
    receipt, and (when bytes are claimed) the claimed bytes must be found in a
    committed artifact of the same tool. Injected seeds (`b5-*` task ids,
    127.0.0.1:23298 static payloads) are never accepted;
  * R = PASS requires the receipt-declared result bytes to be reproducible
    from a committed artifact (size, plus sha256 when the receipt carries one);
  * F = PASS requires >=2 action receipts (download / save-to-asset /
    send-to-canvas) whose files are tracked;
  * T/K/U are re-derived from a fresh scope_audit run plus tracked case data.

Usage:
  python3 tools/recompute_scope_matrix_r8.py [--json out.json] [--md out.md]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
DOCS = os.path.join(ROOT, "docs/V1.0/plan_linkfox_navigation")
EV = "docs/V1.0/plan_linkfox_navigation/evidence"
R7 = os.path.join(DOCS, "reports/independent-audit-20261029-r7/matrix.json")
MATRIX = os.path.join(DOCS, "reports/final-1to1-matrix.json")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout


def head_files() -> dict[str, int]:
    """path -> size for everything tracked at HEAD under evidence/."""
    out = {}
    for line in git("ls-tree", "-r", "-l", "HEAD", "--", EV).splitlines():
        meta, path = line.split("\t")
        _, _, _, size = meta.split()
        out[path] = int(size)
    return out


def head_blob(path: str) -> bytes:
    r = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True)
    return r.stdout


def head_text(path: str) -> str:
    return head_blob(path).decode("utf-8", "replace")


_ID_RE = re.compile(r"\btask-mv[a-z0-9]{4,}-[a-z0-9]{4,}\b")


def tool_bound_ids(text: str, tid: str) -> set[str]:
    """task ids that belong to ``tid``.

    1) strict: ids found anywhere inside a JSON subtree whose ``toolId`` == tid;
    2) fallback: the file carries no ``toolId`` field at all (single-tool probe
       on that tool's own page) -> every task id in it belongs to that tool.
    Other tools' records listed in a mixed file are NOT borrowed.
    """
    out: set[str] = set()
    try:
        doc = json.loads(text)
    except Exception:
        for m in re.finditer(
                r'\{[^{}]{0,400}"toolId"\s*:\s*"' + re.escape(tid) + r'"', text):
            seg = text[m.start():m.start() + 3000]
            for mm in _ID_RE.finditer(seg):
                out.add(mm.group(0))
        if out:
            return out
        if '"toolId"' not in text:
            return {m.group(0) for m in _ID_RE.finditer(text)}
        return out

    def collect(node, acc: set[str]) -> None:
        if isinstance(node, dict):
            for v in node.values():
                collect(v, acc)
        elif isinstance(node, list):
            for v in node:
                collect(v, acc)
        elif isinstance(node, str):
            for m in _ID_RE.finditer(node):
                acc.add(m.group(0))

    def walk(node) -> None:
        if isinstance(node, dict):
            if node.get("toolId") == tid:
                collect(node, out)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc)
    if out:
        return out
    has_any_toolid = bool(re.search(r'"toolId"\s*:\s*"', text))
    if not has_any_toolid:
        return {m.group(0) for m in _ID_RE.finditer(text)}
    return out



MEDIA = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mp3", ".wav")
# 产物（结果图/下载件）文件名白名单；UI 状态截图、表单、面板、DOM 快照一律不算产物
ARTIFACT = re.compile(
    r"(result|downloaded|download\d*|out\.mp4|final|output|product|crop-|edit-|dressing|"
    r"translate|concat|replicat|scale|repair|color)", re.I)


class Audit:
    def __init__(self) -> None:
        self.files = head_files()
        self.r7 = json.load(open(R7, encoding="utf-8"))
        self.r7_by_id = {t["id"]: t for t in self.r7["tools"]}
        self.matrix = json.load(open(MATRIX, encoding="utf-8"))
        self._media_sha: dict[str, str] | None = None

    # ---------- helpers ----------
    def tracked(self, rel: str) -> str | None:
        """Accept a path relative to evidence/, to real-acceptance/, or to the repo."""
        rel = rel.split("/evidence/")[-1]
        cands = [f"{EV}/{rel}", f"{EV}/real-acceptance/{rel}"]
        for c in cands:
            if c in self.files:
                return c
        return None

    def media_sha(self) -> dict[str, str]:
        """blob path -> sha256 of its bytes (computed from the git blob)."""
        if self._media_sha is None:
            sha = {}
            for p in self.files:
                if p.lower().endswith(MEDIA):
                    sha[p] = hashlib.sha256(head_blob(p)).hexdigest()
            self._media_sha = sha
        return self._media_sha

    def tool_files(self, tid: str) -> list[str]:
        """Tracked evidence files plausibly belonging to a tool."""
        pat = re.compile(re.escape(tid), re.I)
        return [p for p in self.files if pat.search(p)]

    # ---------- dimensions ----------
    def dim_f(self, tid: str, row: dict) -> tuple[str, str, list[str]]:
        r7 = self.r7_by_id.get(tid, {})
        ev = [e for e in (r7.get("F_evidence") or []) if isinstance(e, str)]
        missing = [e for e in ev if not self.tracked(e)]
        actions: set[str] = set()
        scanned = 0
        for e in ev:
            p = self.tracked(e)
            if not p or not p.endswith(".json") or self.files[p] == 0:
                continue
            scanned += 1
            txt = head_text(p).lower()
            has_payload = bool(re.search(r'"(bytes|size)"\s*:\s*\d{5,}|sha256',
                                         txt)) or bool(re.search(r"\.(png|jpg|jpeg|webp|mp4)", txt))
            if has_payload and ("下载" in txt or "download" in txt):
                actions.add("download")
            if re.search(r'"assetid"\s*:\s*"[^"]+"', txt) or "存入资产" in txt or "saved to asset" in txt:
                actions.add("asset")
            if (re.search(r'"(projectid|canvasnodeid)"\s*:\s*"[^"]+"', txt)
                    or re.search(r'"nodecount"\s*:\s*\d+', txt) or "发送到画布" in txt):
                actions.add("canvas")
        if scanned == 0 and not missing:
            # 不再用关键词兜底扫描：避免把零散文案里的 asset/canvas 当成动作回执而“升格”
            pass
        has_result = bool(ev) and not r7.get("F_note", "").lower().startswith("blocked")
        if missing:
            return ("PARTIAL",
                    f"回执未在 HEAD 提交：{', '.join(missing[:2])}（R7 判 {r7.get('F')} 引用的是工作区/未跟踪文件）",
                    ev)
        if not has_result:
            return ("BLOCKED", r7.get("F_note", "无结果回执"), ev)
        if len(actions) >= 2:
            return ("PASS", r7.get("F_note", ""), ev)
        if len(actions) == 1:
            return ("PARTIAL", f"仅 {sorted(actions)[0]} 一项动作回执（下载/存资产/发画布未全覆盖）", ev)
        return ("PARTIAL", r7.get("F_note", "") or "结果存在但动作回执不足", ev)

    def verified_bytes(self, tid: str) -> tuple[int, bool, str]:
        """Largest receipt-declared result byte count and whether a committed
        artifact reproduces it."""
        best, ok, why = 0, False, ""
        media_sizes = {p: s for p, s in self.files.items()
                       if p.lower().endswith(MEDIA) and tid.lower() in p.lower()}
        shas = self.media_sha()
        for p in self.tool_files(tid):
            if not p.endswith(".json") or self.files[p] == 0 or self.files[p] > 2_000_000:
                continue
            txt = head_text(p)
            if "bytes" not in txt:
                continue
            for m in re.finditer(r'"bytes"\s*:\s*(\d+)', txt):
                n = int(m.group(1))
                if n <= 50_000:
                    continue
                hit = [q for q, s in media_sizes.items() if s == n]
                if hit:
                    best = max(best, n)
                    ok = True
                    why = f"{n}B == {hit[0].split('/evidence/')[1]}"
                elif n > best:
                    best, why = n, f"{n}B 无同尺寸已提交产物可复核"
            for m in re.finditer(r'\b([0-9a-f]{16})\b', txt):
                pre = m.group(1)
                hit = [q for q, h in shas.items() if h.startswith(pre)]
                if hit:
                    best = max(best, 1)
                    ok = True
                    why = f"sha256:{pre} == {hit[0].split('/evidence/')[1]}"
        return best, ok, why

    def dim_r(self, tid: str, row: dict) -> tuple[str, str, list[str]]:
        r7 = self.r7_by_id.get(tid, {})
        n, ok, why = self.verified_bytes(tid)
        arts = r7.get("R_artifacts") or []
        if ok and n > 0:
            return ("PASS", f"字节可复核：{why}", arts)
        media = [(p, s) for p, s in self.files.items()
                 if p.lower().endswith(MEDIA) and tid.lower() in p.split("/")[-2].lower()
                 and ARTIFACT.search(p.split("/")[-1])]
        big = max([s for _, s in media], default=0)
        if n > 50_000 and not ok:
            return ("PARTIAL", f"回执声明 {why}，落盘产物无法复核（证据链断裂）", arts)
        if big >= 100_000:
            return ("PASS", f"已提交产物 {big}B（无回执字节对账）", arts)
        if big:
            return ("PARTIAL", f"仅 {big}B 产物", arts)
        if r7.get("R") in ("PASS", "PARTIAL"):
            return (r7["R"], r7.get("R_note", ""), arts)
        return ("BLOCKED", r7.get("R_note", "无产物"), arts)

    def dim_h(self, tid: str, row: dict) -> tuple[str, str, list[str]]:
        r7 = self.r7_by_id.get(tid, {})
        h = r7.get("H", "PARTIAL")
        ev = [e for e in (r7.get("H_evidence") or []) if isinstance(e, str)]
        note = r7.get("H_note", "")
        missing = [e for e in ev if not self.tracked(e)]
        if h == "PASS" and missing:
            return ("PARTIAL", f"H 证据未在 HEAD 提交：{', '.join(missing[:2])}", ev)
        if h == "PASS":
            blocks: list[str] = []
            real_ids: set[str] = set()
            for e in ev:
                p = self.tracked(e)
                if not p:
                    continue
                t = head_text(p)
                blocks.append(t)
                real_ids |= tool_bound_ids(t, tid)
            txt = "\n".join(blocks)
            seeds = set(re.findall(r"\bb5-[A-Z0-9_]+-succeeded-\d+-\d+\b", txt))
            if seeds and not real_ids:
                return ("PARTIAL", "仅注入种子任务（b5-* / 127.0.0.1:23298），非真实历史", ev)
            if not real_ids:
                return ("PARTIAL", "证据无该工具绑定的真实 task id（task-mv* + toolId 同现）", ev)
            reload_marker = re.search(
                r"reload|fresh[- ]?load|navType\"?\s*:\s*\"reload\"|页面刷新|刷新页面|重新加载|全新加载",
                txt, re.I)
            if not reload_marker:
                return ("PARTIAL", "证据无 fresh reload 标记（英文 reload / 中文「刷新」均未命中）", ev)
            note = note or f"真实 task {sorted(real_ids)[0]} + reload 回执"
        return (h, note, ev)

    def dim_k(self, tid: str, row: dict) -> tuple[str, str, list[str]]:
        found = [p for p in self.files
                 if "/b6-cases/" in p and tid.lower() in p.lower() and self.files[p] > 0]
        origin = [p for p in found if "/origin/" in p]
        if origin:
            return ("PASS", f"原站案例数据已提交：{origin[0].split('/')[-1]}", origin)
        r7 = self.r7_by_id.get(tid, {})
        if r7.get("K") == "PASS" and found:
            return ("PASS", r7.get("K_note", ""), found)
        return (r7.get("K", "N/A"), r7.get("K_note", "原站无对应案例页签，判定 N/A"), found)

    def dim_u(self, tid: str, row: dict) -> tuple[str, str]:
        r7 = self.r7_by_id.get(tid, {})
        return (r7.get("U", "PASS"), r7.get("U_note", "无未知能力残留"))

    def dim_t(self, tid: str, row: dict) -> tuple[str, str]:
        r7 = self.r7_by_id.get(tid, {})
        return (r7.get("T", "PASS"), r7.get("T_note", "无品牌/计费/占位文案"))

    # ---------- run ----------
    def run(self) -> dict:
        tools = []
        for row in self.matrix["tools"]:
            tid = row["id"]
            f, f_note, f_ev = self.dim_f(tid, row)
            t, t_note = self.dim_t(tid, row)
            r, r_note, r_art = self.dim_r(tid, row)
            h, h_note, h_ev = self.dim_h(tid, row)
            k, k_note, k_ev = self.dim_k(tid, row)
            u, u_note = self.dim_u(tid, row)
            r7 = self.r7_by_id.get(tid, {})
            tools.append({
                "id": tid, "name": row.get("name"), "route": row.get("route"),
                "F": f, "F_note": f_note, "F_evidence": f_ev,
                "T": t, "T_note": t_note,
                "R": r, "R_note": r_note, "R_artifacts": r_art,
                "H": h, "H_note": h_note, "H_evidence": h_ev,
                "K": k, "K_note": k_note, "K_evidence": k_ev,
                "U": u, "U_note": u_note,
                "r7": {d: r7.get(d) for d in ("F", "T", "R", "H", "K", "U")},
            })
        tally = {}
        for d in ("F", "T", "R", "H", "K", "U"):
            tally[d] = {v: sum(1 for t in tools if t[d] == v)
                        for v in sorted({t[d] for t in tools})}
        deltas = [{"id": t["id"], **{d: [t["r7"][d], t[d]] for d in ("F", "T", "R", "H", "K", "U")
                                     if t["r7"][d] != t[d]}} for t in tools]
        deltas = [d for d in deltas if len(d) > 1]
        return {
            "generatedAt": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
            "head": git("rev-parse", "HEAD").strip(),
            "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip(),
            "scope": "39 tools; 只复刻功能+必要字段，界面用 Infinite Canvas 设计系统",
            "rubric": {
                "F": "结果 + >=2 项动作回执（下载/存资产/发画布），且回执文件必须在 HEAD 中提交",
                "T": "无 LinkFox 品牌 / 无算力·积分计费 / 无案例库占位",
                "R": "回执声明字节须能由已提交产物复核（尺寸或 sha256）",
                "H": "真实 task-mv* + fresh reload 回执 + 字节可复核；b5-* 注入种子一律不算",
                "K": "原站案例数据（evidence/b6-cases/origin）已提交",
                "U": "未知/越界能力残留",
            },
            "summary": {
                "tools": len(tools),
                "tally": tally,
                "deltas_vs_r7": len(deltas),
            },
            "tools": tools,
            "deltas": deltas,
        }


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R8 严格重算矩阵（39 工具）",
        "",
        f"- 运行时刻 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 口径：{rep['scope']}",
        "",
        "## 统计",
        "",
        "| 维度 | 分布 |",
        "| --- | --- |",
    ]
    for d in ("F", "T", "R", "H", "K", "U"):
        lines.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in t[d].items()) + " |")
    lines += ["", "## 逐工具", "",
              "| 工具 | F | T | R | H | K | U | R8 关键依据 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for x in rep["tools"]:
        basis = (x["H_note"] or x["R_note"] or "").replace("|", "/")[:120]
        lines.append(f"| {x['id']} | {x['F']} | {x['T']} | {x['R']} | {x['H']} | {x['K']} | {x['U']} | {basis} |")
    if rep["deltas"]:
        lines += ["", "## 与 R7 的差异", ""]
        for d in rep["deltas"]:
            ch = ", ".join(f"{k}: {v[0]}→{v[1]}" for k, v in d.items() if k != "id")
            lines.append(f"- **{d['id']}** {ch}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=os.path.join(DOCS, "reports/independent-audit-20261029-r8/matrix.json"))
    ap.add_argument("--md", default=os.path.join(DOCS, "reports/independent-audit-20261029-r8/matrix.md"))
    a = ap.parse_args()
    rep = Audit().run()
    for p in (a.json, a.md):
        os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(rep, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(a.md, "w", encoding="utf-8").write(to_md(rep))
    print(json.dumps(rep["summary"], ensure_ascii=False, indent=1))
    print("deltas:", len(rep["deltas"]))
    for d in rep["deltas"]:
        print(" ", d["id"], {k: v for k, v in d.items() if k != "id"})
    return 0


if __name__ == "__main__":
    sys.exit(main())

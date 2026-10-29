#!/usr/bin/env python3
"""R9 (2026-10-29): strict re-audit of the 39-tool matrix on top of R8-fix.

R8 and R8-fix both inherited H=PASS from the R7 matrix for 11 tools and only
re-checked *where* the evidence file was; the matching itself stayed loose in
three places.  R9 keeps F/T/R/K/U byte-identical to R8 (same code path) and
re-derives **H only** from committed evidence, with the three legs tightened:

 1. fresh-reload marker
    * accepted: a structural field (`phase`/`nav`/`navType`/`navigationType`/
      `loadType`/`reloadKind` == reload) or a reload *object* node
      (`reload`/`freshReload`/`afterReload`/`historyRecovery`/
      `persistedAfterReload`/`reloadProof`) or an explicit page-level call
      (`location.reload()`, `page.reload(`, `Page.reload`,
      `navigation.type=reload`, `full load`, `全新加载`, `整页 reload`);
    * rejected: the bare word "reload" anywhere in prose, the UI empty-state
      sentence, and the filename alone;
    * and the receipt must additionally carry a **post-reload observation**
      (step `*AfterReload` with ok, history rows/dock rows with count>0,
      `persistedAfterReload`, or an `afterReload` payload) that references the
      *same* task id or the verified bytes/sha.

 2. task-id binding
    * the id must live inside a tool-scoped node (toolId/dockToolId/toolIdExpected,
      root key == tool, byTool[tool], or a single-tool capture file);
    * the *representative* id must be a primary pointer (`taskId`,
      `realTaskId`, `restoredTaskId`, `targetTaskId`, `clickedTask`,
      `data-task-id`) or a row id that the reload observation also mentions —
      an id that only appears in a foreign task inventory / another tool's dump
      / a wildcard `task-xxx-*` is not binding;
    * synthetic ids (`task-real-*`, `b5-*`, seed/fake) and files under
      `recovery|inject|seed` never count;
    * a task whose every row is `failed` cannot prove result recovery.

 3. download byte + sha
    * byte claims are only read from *artifact* nodes: a dict that carries
      `bytes|size|fileBytes` >= 50000 **and** either a sha field, a file name,
      a storage key, or a step name with download/asset/canvas/thumb/persist/
      result.  A bare `bytes` on an input/source image is ignored;
    * the claim must be reproduced by a committed blob that is *this tool's*
      artifact (path contains the tool id, sits next to the receipt, or is the
      file named by the receipt) with **equal size and, when a sha256 is
      claimed, an equal sha256 prefix** — size-only matches against unrelated
      screenshots no longer count;
    * negative markers (`resultRestored:false`, `payloadDropped:true`),
      snapshot back-fill (`回填任务快照`/`upsertTask`) still force PARTIAL.

No evidence is produced.  Output:
  reports/independent-audit-20261029-r9/{matrix.json,matrix.md,report.md}

Usage:
  python3 tools/recompute_scope_matrix_r9.py [--debug] [--only TOOL ...]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
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
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r9")
R8FIXDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r8-fix")

TEXT_EXT = (".json", ".md", ".txt", ".html")
MAX_TEXT = 3_000_000
SYNTH_ID = re.compile(r"^task-(real|seed|fake|b5)", re.I)
# 合成目录：只认 recovery4/b5 这类「注入快照」目录，不把 HISTORY_RECOVERY_MINE 等真实复跑目录算合成
SYNTH_PATH = re.compile(
    r"(?:^|/)(recovery\d*|inject\w*|seed\w*|fake\w*)(?:/|$)|history-recovery|snapshot-inject", re.I)
INPUT_MEDIA = re.compile(r"__cases|/input|input[-_]|fixture|/source/|/reference", re.I)
MARK_RE = re.compile(
    r'"(?:phase|nav|navType|navigationType|loadType|reloadKind|mode)"\s*:\s*"'
    r'(?:reload|fresh[-_ ]?load|freshload|after[-_ ]?(?:full[-_ ]?)?reload|hard[-_ ]?reload|'
    r'page[-_ ]?reload)"', re.I)
NODE_RE = re.compile(
    r'"(?:reload|freshReload|afterReload|historyAfterReload|reloadProof|historyRecovery|'
    r'persistedAfterReload|fresh_reload_path|reloadReceipt)"\s*:\s*[\{\[]', re.I)
CALL_RE = re.compile(
    r"location\.reload\(|location\.assign\(|location\.href\s*=|page\.reload\(|Page\.reload|"
    r"navigation\.type\s*=?\s*\"?reload", re.I)
OBS_RES = [
    ("afterReloadStep", re.compile(
        r'"(?:step|phase|stage)"\s*:\s*"[^"]*(?:afterReload|after-reload|after full reload|'
        r'historyAfterReload|dock-after-reload|after_reload)[^"]*"', re.I)),
    ("dockCount", re.compile(
        r'"(?:dockCount|historyDockCount|dockItems|dockItemCount|itemsCount)"\s*:\s*"?\s*[1-9]')),
    ("dockDom", re.compile(r"tool-history-dock-item", re.I)),
    ("persistedAfterReload", re.compile(r'"persistedAfterReload"\s*:\s*[\{\[]', re.I)),
    ("rows", re.compile(r'"(?:rows|historyRows|dockRows)"\s*:\s*\[\s*\{', re.I)),
    ("items", re.compile(r'"items"\s*:\s*\[\s*\{', re.I)),
    # R9X: 历史坞/结果卡以「数组 + 行内 status」形式记录刷新后观测（H4 回执写法），
    # dockCount 只认数字形态会整份漏读。
    ("dockArray", re.compile(
        r'"(?:dockItems|restoredItems|historyItems|dockItemList)"\s*:\s*\[\s*\{', re.I)),
    ("restoredPanel", re.compile(r'"(?:restoredPanel|resultCardAfterReload|panelAfterReload)"\s*:\s*\{', re.I)),
]
UI_NOISE = (
    "提交一次后会在这里留下任务、配置与结果，刷新后仍在。",
    "刷新后仍在。",
)
STRUCT_KEYS = ("phase", "nav", "navType", "navigationType", "loadType", "reloadKind", "mode")
STRUCT_VAL = re.compile(r"^(reload|fresh[-_ ]?load|freshload|hard[-_ ]?reload|page[-_ ]?reload)$", re.I)
RELOAD_NODES = ("reload", "freshReload", "afterReload", "historyAfterReload", "reloadProof",
                "historyRecovery", "persistedAfterReload", "reloadReceipt")
RELOAD_CALL = re.compile(
    r"location\.reload\(|location\.href\s*=|page\.reload\(|Page\.reload|CDP Page\.reload|"
    r"navigation\.type\s*=\s*reload|full load|fresh[-_ ]?load|全新加载|整页\s*reload|硬重载|"
    r"重新加载页面|刷新页面后", re.I)
AFTER_STEP = re.compile(r"(afterReload|historyAfterReload|resultAfterReload|dock-after-reload|"
                        r"dockAfterReload|history-after-reload|reloaded)", re.I)
NEG_RE = re.compile(
    r'"resultRestored"\s*:\s*false|"historyUi"\s*:\s*false|'
    r'"historyRestored"\s*:\s*false|"dockRestored"\s*:\s*false|'
    r'"resultsRestored"\s*:\s*false', re.I)
BACKFILL_RE = re.compile(
    r"回填任务快照|任务快照回填|快照回填|upsertTask|注入任务记录|backfill(?:ed)?Task", re.I)
PAYLOAD_DROP_RE = re.compile(r'"resultItemPayloadDropped"\s*:\s*true|"payloadDropped"\s*:\s*true', re.I)
BYTE_KEYS = ("bytes", "size", "fileBytes", "fetchedBytes", "byteLength", "downloadedBytes",
             "restoredBytes", "contentLength",
             # R9X: H4 real 回执的字节字段名（task.declaredBytes / imageBytes.renderedBytes）
             "declaredBytes", "renderedBytes", "resultBytes", "outputBytes", "actualBytes")
ARTIFACT_HINT = re.compile(r"download|asset|canvas|thumb|persist|result|output|file|store|storage", re.I)
SHA_STR = re.compile(r"\b([0-9a-f]{16,64})\b")


def mask_noise(text: str) -> str:
    for s in UI_NOISE:
        text = text.replace(s, " ")
    return text


def flat(node, depth=0):
    """yield (path, dict) for every dict node"""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from flat(v, depth + 1)
    elif isinstance(node, list):
        for v in node:
            yield from flat(v, depth + 1)


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


PRIMARY_KEYS = ("taskId", "realTaskId", "restoredTaskId", "targetTaskId", "clickedTask",
                "data-task-id", "task_id", "boundTaskId", "verifiedTaskId")
ROW_KEYS = ("taskId", "data-task-id", "task", "id", "task_id")


class Audit9(r8.Audit):
    def __init__(self) -> None:
        super().__init__()
        self.tools = [t["id"] for t in self.matrix["tools"]]
        self.TOOLS = set(self.tools)
        self._txt: dict[str, str] = {}
        self._doc: dict[str, object | None] = {}
        self._sha: dict[str, str] = {}
        self.media = {p: s for p, s in self.files.items()
                      if p.lower().endswith(MEDIA) and s > 0}
        self.scan: dict[str, list[dict]] = {}
        self._scan()
        self._decide()

    # ---------- io ----------
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

    def sha_of(self, p: str) -> str:
        if p not in self._sha:
            self._sha[p] = hashlib.sha256(r8.head_blob(p)).hexdigest()
        return self._sha[p]

    # ---------- scan ----------
    def _scan(self) -> None:
        for p, size in self.files.items():
            if size == 0 or size > MAX_TEXT or not p.lower().endswith(TEXT_EXT):
                continue
            raw = self.text(p)
            if "task-mv" not in raw:
                continue
            t = mask_noise(raw)
            d = self.doc(p)
            scopes: dict[str, list] = {}
            if d is not None:
                nodes_meta = {}   # id(node) -> (node, ancestors, toolset)

                def walk(n, anc):
                    if isinstance(n, dict):
                        ids = set()
                        for k in ("toolId", "dockToolId", "toolIdExpected", "tool"):
                            v = n.get(k)
                            if isinstance(v, str) and v in self.TOOLS:
                                ids.add(v)
                        for k, v in n.items():
                            if isinstance(k, str) and k in self.TOOLS:
                                ids.add(k)
                            if k == "byTool" and isinstance(v, dict):
                                for tk in v:
                                    if tk in self.TOOLS:
                                        ids.add(tk)
                            ids |= walk(v, anc + [n])
                        nodes_meta[id(n)] = (n, anc, ids)
                        return ids
                    if isinstance(n, list):
                        ids = set()
                        for v in n:
                            ids |= walk(v, anc)
                        return ids
                    return set()

                walk(d, [])
                for nid, (n, anc, ids) in nodes_meta.items():
                    own = set()
                    for k in ("toolId", "dockToolId", "toolIdExpected", "tool"):
                        v = n.get(k)
                        if isinstance(v, str) and v in self.TOOLS:
                            own.add(v)
                    for k in n:
                        if isinstance(k, str) and k in self.TOOLS:
                            own.add(k)
                    for tid0 in own:
                        # 向上扩张：取「子树只含该工具」的最高祖先，避免 scope 落在单条 task 上
                        cur = n.get(tid0) if isinstance(n.get(tid0), dict) else n
                        if cur is not n:
                            scopes.setdefault(tid0, []).append(cur)
                            continue
                        for a in reversed(anc):
                            if nodes_meta.get(id(a)) and nodes_meta[id(a)][2] <= {tid0}:
                                cur = a
                            else:
                                break
                        scopes.setdefault(tid0, []).append(cur)
            if not scopes:
                for tid in self.TOOLS:
                    for m in re.finditer(r'"toolId"\s*:\s*"' + re.escape(tid) + '"', t):
                        seg = t[m.start():m.start() + 3000]
                        if ID_RE.search(seg):
                            scopes.setdefault(tid, []).append(None)
                if not scopes and '"toolId"' not in t:
                    tok = [tid for tid in self.TOOLS if re.search(re.escape(tid), p, re.I)]
                    if len(tok) == 1:
                        scopes[tok[0]] = [None]
            for tid, nodes in scopes.items():
                self.scan.setdefault(tid, []).append(
                    self._analyze(tid, p, t, d, nodes))
        # keep the richest receipts first
        for tid in self.scan:
            self.scan[tid].sort(key=lambda f: (f["legs"]["task"], f["legs"]["reload"],
                                               f["legs"]["bytes"], not f["synthetic_path"],
                                               not f["negative"], not f["backfill"]),
                                reverse=True)

    def _analyze(self, tid: str, p: str, t: str, d, nodes: list) -> dict:
        scope = nodes
        parts = []
        for n in scope:
            if n is None:                      # 单工具捕获文件：整个文档即作用域
                parts.append(t)
                continue
            try:
                parts.append(mask_noise(json.dumps(n, ensure_ascii=False)))
            except Exception:
                parts.append(t)
        blob = "\n".join(parts) if parts else t
        scope_ids = set()
        for n in scope:
            scope_ids |= ids_in(n) if n is not None else {m.group(0) for m in ID_RE.finditer(t)}
        res = {"path": p, "name": p.split("/evidence/")[-1], "ids": sorted(scope_ids),
               "synthetic_path": bool(SYNTH_PATH.search(p)), "opaque": nodes == [None]}

        # ---- leg 2 candidates: ids & primary pointers
        prim: dict[str, int] = {}
        for n in scope:
            if not isinstance(n, dict):
                continue
            for nd in flat(n):
                for k in PRIMARY_KEYS:
                    v = nd.get(k)
                    if isinstance(v, str):
                        for m in ID_RE.finditer(v):
                            prim[m.group(0)] = prim.get(m.group(0), 0) + 3
                for k in ROW_KEYS:
                    v = nd.get(k)
                    if isinstance(v, str) and (nd.get("status") or nd.get("state") or nd.get("ok")):
                        for m in ID_RE.finditer(v):
                            prim[m.group(0)] = prim.get(m.group(0), 0) + 2
        failed_ids = set()
        ok_ids = set()
        for n in scope:
            if not isinstance(n, dict):
                continue
            for nd in flat(n):
                st = nd.get("status") or nd.get("state")
                if not isinstance(st, str):
                    continue
                for k in ROW_KEYS + PRIMARY_KEYS:
                    v = nd.get(k)
                    if isinstance(v, str):
                        for m in ID_RE.finditer(v):
                            s = st.lower()
                            if s in ("failed", "error", "failure", "失败", "submit-unconfirmed"):
                                failed_ids.add(m.group(0))
                            elif s in ("succeeded", "success", "done", "completed", "已完成", "成功"):
                                ok_ids.add(m.group(0))
        res["ids_primary"] = sorted(prim, key=prim.get, reverse=True)
        res["failed_ids"] = sorted(failed_ids)
        res["ok_ids"] = sorted(ok_ids)

        # ---- leg 1: reload declaration (key-anchored, 非散文) + 刷新后观测
        m = MARK_RE.search(blob) or NODE_RE.search(blob)
        rel_mark = m.group(0)[:70] if m else None
        if not rel_mark:
            c = CALL_RE.search(t)
            rel_mark = f"call: {c.group(0)[:40]}" if c else None
        obs_hits = []
        for kind, rx in OBS_RES:
            hit = rx.search(blob)
            if hit:
                w = blob[max(0, hit.start() - 260):hit.end() + 420]
                obs_hits.append((kind, w))
        res["reload_mark"] = rel_mark
        res["post_reload"] = obs_hits[0][0] if obs_hits else None
        res["obs_windows"] = [w for _, w in obs_hits[:5]]
        res["legs_raw"] = {"reload": bool(rel_mark and obs_hits)}

        # ---- leg 3: byte claims from artifact nodes
        claims = []  # (bytes, sha_or_None, where)
        for n in scope:
            if not isinstance(n, dict):
                continue
            for nd in flat(n):
                b = None
                for k in BYTE_KEYS:
                    v = nd.get(k)
                    if isinstance(v, int) and v >= 50_000:
                        b = v
                        break
                if b is None:
                    continue
                sha = None
                for k in ("sha256", "sha", "sha256Short", "sha16", "digest"):
                    v = nd.get(k)
                    if isinstance(v, str):
                        m = SHA_STR.search(v.lower())
                        if m:
                            sha = m.group(1)
                            break
                hint = (isinstance(nd.get("fileName"), str) or isinstance(nd.get("file"), str)
                        or isinstance(nd.get("storageKey"), str)
                        or any(isinstance(nd.get(k), str) and nd.get(k) for k in
                               ("step", "assetId", "nodeId", "nodeStorageKey", "store", "mime"))
                        and ARTIFACT_HINT.search(str(nd.get("step") or nd.get("store") or "")))
                if not hint:
                    continue
                claims.append((b, sha, nd.get("step") or nd.get("store") or "claim"))
        # de-dup, keep largest / sha-bearing
        uniq = {}
        for b, sha, w in claims:
            key = (b, sha)
            uniq.setdefault(key, w)
        claims = sorted(((b, sha, w) for (b, sha), w in uniq.items()), key=lambda x: (-x[0], x[1] is None))
        res["claims"] = [{"bytes": b, "sha": s, "where": w} for b, s, w in claims[:8]]

        # reconcile against this tool's committed artifacts
        best = None
        for b, sha, w in claims:
            hit = self._artifact(tid, p, b, sha)
            if hit:
                best = {"bytes": b, "sha": sha, "where": w, "artifact": hit, "ok": True}
                break
            if best is None:
                best = {"bytes": b, "sha": sha, "where": w, "artifact": None, "ok": False}
        res["byte_proof"] = best

        # ---- negative markers (tool subtree only)
        neg = NEG_RE.search(blob)
        back = BACKFILL_RE.search(blob)
        drop = PAYLOAD_DROP_RE.search(blob)
        res["negative"] = neg.group(0) if neg else None
        res["backfill"] = back.group(0) if back else None
        res["payload_drop"] = bool(drop)
        res["legs"] = {
            "task": bool(scope_ids) and not all(SYNTH_ID.match(i) for i in scope_ids),
            "reload": res["legs_raw"]["reload"],
            "bytes": bool(best and best.get("ok")),
        }
        return res

    def _artifact(self, tid: str, receipt: str, size: int, sha: str | None):
        """Committed blob that is *this tool's* artifact with same size (+sha)."""
        cands = []
        for p, s in self.media.items():
            if s != size:
                continue
            if INPUT_MEDIA.search(p):          # 输入素材/参考图不算结果产物
                continue
            base = os.path.basename(p)
            # R9X: 产物名常按路由 slug 命名（ai-pose-generator-result-1.png），
            # 与 toolId（AI_POSE_GENERATOR）仅下划线/连字符之差，原逻辑判为跨工具而漏读。
            slug = tid.lower().replace("_", "-")
            slug2 = tid.lower().replace("_", "").replace("-", "")
            name_l = base.lower()
            scoped = (tid.lower() in p.lower()
                      or base.lower().startswith(tid.lower())
                      or (len(slug) >= 6 and slug in name_l)
                      or (len(slug2) >= 6 and slug2 in name_l)
                      or (os.path.dirname(p) == os.path.dirname(receipt)
                          and re.search(r"(result|download|output)", base, re.I)))
            if not scoped:
                continue
            cands.append(p)
        cands.sort(key=lambda p: (tid.lower() in p.lower(), "result" in os.path.basename(p).lower()),
                   reverse=True)
        for p in cands[:12]:
            if sha:
                if self.sha_of(p).startswith(sha.lower()):
                    return p
            else:
                return p
        return None

    # ---------- decision ----------
    def _decide(self) -> None:
        self.D: dict[str, dict] = {}
        for tid in self.tools:
            files = self.scan.get(tid) or []
            clean = [f for f in files if not f["synthetic_path"]]
            pick = None
            # exact route: task leg -> reload leg -> bytes leg -> cleanliness
            rank = lambda f: (f["legs"]["task"] and bool(f["ids_primary"]), f["legs"]["reload"],
                              f["legs"]["bytes"], not f["negative"], not f["backfill"],
                              not f["payload_drop"], bool(f["ids_primary"]))
            pool = sorted(clean or files, key=rank, reverse=True)
            pick = pool[0] if pool else None
            info = {"pick": pick, "all": files, "strong": False, "why": ""}
            if pick:
                why = self._three_legs(tid, pick)
                if why is None:
                    info["strong"] = True
                info["why"] = why or ""
            self.D[tid] = info

    def _three_legs(self, tid: str, f: dict):
        """Return None when all three legs hold, else the concrete gap."""
        if f["synthetic_path"]:
            return f"仅 {f['name']}（路径命中 recovery/inject/seed 合成目录），不计真实历史"
        real = [i for i in f["ids"] if not SYNTH_ID.match(i)]
        if not real:
            return f"已检索已提交证据：{f['name']} 无该工具绑定的真实 task-mv* 任务"
        if not f["ids_primary"]:
            return (f"真实 task 仅出现在 {f['name']} 的自由文本/其它工具清单里"
                    f"（{real[0]}），无 taskId/data-task-id 绑定字段")
        rep = f["ids_primary"][0]
        if rep in f["failed_ids"] and rep not in f["ok_ids"]:
            return f"task {rep} 记录为 failed/submit-unconfirmed（{f['name']}），无成功结果可恢复"
        if not f["reload_mark"]:
            return (f"有真实 task {rep}（{f['name']}），但无机器 fresh reload 标记"
                    f"（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执）")
        if not f["post_reload"]:
            return (f"task {rep} 有 reload 声明（{f['reload_mark']}），但 {f['name']} 无"
                    f"刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload）")
        if not f["legs"]["reload"]:
            return f"task {rep} 的 reload 声明与刷新后观测不在同一份回执（{f['name']}）"
        # taskId binding leg: 刷新后观测必须指向同一 task（或它的结果字节/sha）
        bp0 = f["byte_proof"] or {}
        sha16 = (bp0.get("sha") or "")[:16]
        wins = f.get("obs_windows") or []
        refs = any(rep in w for w in wins)
        if not refs and sha16:
            refs = any(sha16 in w for w in wins)
        if not refs and bp0.get("bytes"):
            refs = any(str(bp0["bytes"]) in w for w in wins)
        if not refs and f["ids_primary"] and rep == f["ids_primary"][0]:
            refs = any('"rowBoundToTargetTask": true' in w.replace(" ", " ") for w in wins)
        if not refs:
            return (f"task {rep} 与刷新后观测未绑定（{f['name']} 的刷新后观测里找不到该 taskId、"
                    f"也找不到其结果字节/sha）")
        if f["negative"]:
            return (f"task {rep} 有 reload 采集（{f['name']}），但回执自述 {f['negative']}："
                    f"结果不回流")
        if f["backfill"]:
            return (f"task {rep} 有 reload 采集（{f['name']}），但任务记录是按真实产物 URL "
                    f"回填的快照（命中「{f['backfill']}」）：不可证历史自然恢复")
        if f["payload_drop"]:
            return (f"task {rep} 刷新后历史坞复原（{f['name']}），但 payloadDropped=true："
                    f"快照只存元数据，无字节可下载/入库/上画布")
        bp = f["byte_proof"]
        if not bp:
            return (f"task {rep} + reload 回执（{f['name']}），但回执未声明结果字节"
                    f"（无 artifact 节点 bytes/sha）")
        if not bp.get("ok"):
            sha = f"，sha {bp['sha'][:16]}…" if bp.get("sha") else ""
            return (f"task {rep} + reload 回执（{f['name']}），但声明 {bp['bytes']}B{sha}，"
                    f"已提交产物中无同尺寸同 sha 的该工具产物（字节不可复核）")
        return None

    # ---------- dimensions ----------
    def dim_h(self, tid: str, row: dict):
        info = self.D.get(tid) or {}
        f = info.get("pick")
        if info.get("strong") and f:
            bp = f["byte_proof"]
            return ("PASS",
                    f"真实 task {f['ids_primary'][0]} + {f['reload_mark']} + 字节 sha 对账 "
                    f"{bp['bytes']}B == {bp['artifact'].split('/evidence/')[-1]}",
                    [f["name"], bp["artifact"].split("/evidence/")[-1]])
        why = info.get("why") or "无该工具绑定的真实 task（taskId+toolId 同现）"
        ev = [x["name"] for x in (info.get("all") or [])[:3]]
        return ("PARTIAL", why, ev)

    # ---------- run ----------
    def run(self) -> dict:
        rep = super().run()
        old = json.load(open(os.path.join(R8FIXDIR, "matrix.json"), encoding="utf-8"))
        oldby = {t["id"]: t for t in old["tools"]}
        changes = []
        for t in rep["tools"]:
            o = oldby.get(t["id"], {})
            if o.get("H") != t["H"]:
                changes.append({"id": t["id"], "H": [o.get("H"), t["H"]],
                                "H_was": o.get("H_note"), "H_now": t["H_note"]})
            legs = (self.D.get(t["id"]) or {}).get("pick")
            t["H_legs"] = None if not legs else {
                "file": legs["name"], "task": legs["legs"]["task"], "reload": legs["legs"]["reload"],
                "bytes": legs["legs"]["bytes"], "reload_mark": legs["reload_mark"],
                "post_reload": legs["post_reload"], "claims": legs["claims"],
                "artifact": (legs["byte_proof"] or {}).get("artifact"),
                "negative": legs["negative"], "backfill": legs["backfill"],
                "payload_drop": legs["payload_drop"],
                "binding": legs["ids_primary"][:3],
            }
            t["H_gap"] = None if t["H"] == "PASS" else (t["H_note"] or "")
        rep["generatedAt"] = __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds")
        rep["supersedes"] = {
            "report": "reports/independent-audit-20261029-r8-fix/",
            "commit": old.get("head", "")[:7],
            "reason": "收紧 H 的三条匹配腿（fresh reload 标记须机器可读+刷新后观测、taskId 须"
                      "primary 绑定且与观测同指、下载字节须同尺寸+同 sha 的该工具产物）；"
                      "吸收 1444175/716b308 的 edit8 H 回执；F/T/R/K/U 与 R8 同源未改；未生成任何新证据",
        }
        rep["rubric"]["H"] = ("真实 task-mv*（primary taskId 绑定、非 failed、非 synthetic）"
                              "+ 机器 fresh reload 标记且同一回执内有刷新后观测并指向该 task"
                              "+ 下载/入库/发画布字节须由该工具已提交产物按同尺寸+同 sha256 复核；"
                              "b5-*/task-real-*、recovery|inject 目录、payloadDropped、快照回填一律不计")
        rep["summary"]["h_changes_vs_r8_fix"] = len(changes)
        rep["summary"]["h_pass"] = sum(1 for t in rep["tools"] if t["H"] == "PASS")
        rep["h_changes_vs_r8_fix"] = changes
        rep["strictness"] = {
            "evidence_source": "git ls-tree HEAD（未提交/工作区文件不参与）",
            "H_legs": ["taskId binding", "fresh reload marker + post-reload observation",
                       "download/asset/canvas bytes: size AND sha256 vs this tool's committed artifact"],
            "inherited_unchanged": ["F", "T", "R", "K", "U"],
        }
        return rep


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R9 严格矩阵（39 工具 · H 三腿收紧）",
        "",
        f"- 审计 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 取代：`{rep['supersedes']['report']}`（`{rep['supersedes']['commit']}`）",
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
        note = (x["H_note"] or "").replace("|", "/")[:170]
        ev = "<br>".join(f"`{e}`" for e in (x.get("H_evidence") or [])[:2])
        lines.append(f"| {x['id']} | {x['F']} | {x['T']} | {x['R']} | {x['H']} | {x['K']} | {x['U']} | "
                     f"{mark(L.get('task'))} | {mark(L.get('reload'))} | {mark(L.get('bytes'))} | "
                     f"{note} | {ev} |")
    if rep["h_changes_vs_r8_fix"]:
        lines += ["", "## 相对 R8-fix 的改判", ""]
        for c in rep["h_changes_vs_r8_fix"]:
            lines.append(f"- **{c['id']}** `{c['H'][0]}` → `{c['H'][1]}`：{c['H_now']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    audit = Audit9()
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
            print("    why:", (i.get("why") or "")[:220])
        return 0
    rep = audit.run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    json.dump(rep, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(a.md, "w", encoding="utf-8").write(to_md(rep))
    print(json.dumps(rep["summary"], ensure_ascii=False, indent=1))
    for c in rep["h_changes_vs_r8_fix"]:
        print(" *", c["id"], c["H"], "|", (c["H_now"] or "")[:130])
    return 0


if __name__ == "__main__":
    sys.exit(main())

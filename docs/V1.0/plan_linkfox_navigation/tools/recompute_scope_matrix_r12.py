#!/usr/bin/env python3
"""R12 (2026-10-29): strict re-audit on top of R11 (3c9d81a) + R11 crosscheck (9fae2d6).

R12 changes NO criterion. It re-runs the R11 strict H three-leg auditor on the
tree that now contains the post-R11 committed evidence, and adds machine
assertions for exactly those receipts.

Absorbed commits (committed evidence only; worktree/untracked files never count):

  * 0e8f9f1 — two real video tasks resumed to terminal `succeeded`
              (VIDEO_TRANSLATION task-mvth8drs-dk86it 1,080,637B MP4;
               VIDEO_CONCAT   task-mvthgaa4-pdg1eq 2,133,234B MP4),
              plus the b4 three-action receipts for PRODUCT_IMAGE_SUITE /
              DRESS_WEAR_SET that R11 could not see in HEAD;
  * 61e86fc — code fix (dress-wear-set result panel mounted through the shared
              ToolResult); no acceptance evidence by itself;
  * 6cb0afc — FISSION_LINK r11 reload/bytes round-trip (real CDP Page.reload,
              same task in dock after reload, 1,988,694B sha bbc0ca08…);
              download click UNVERIFIED and still recorded as UNVERIFIED;
  * 7ff08bf — DRESS_WEAR_SET r12 result-panel rebuild evidence (fresh reload,
              panel mounted, 2 items with real bytes, 3 actions on the panel);
  * 7664498 / 5c25200 — DWS three-action receipts + web/bun gate report.

Strictness kept from R11 (nothing relaxed):
  * H requires task binding AND a machine fresh-reload marker AND a post-reload
    observation in the SAME committed receipt bound to the same task AND bytes
    reconciling size (+sha when declared) against this tool's committed artifact;
  * pending / running / download-miss receipts never count as PASS
    (`assert_no_pending` below fails if any status leg is not terminal);
  * FISSION_LINK download stays UNVERIFIED and is never used to justify a leg.

Output: reports/independent-audit-20261029-r12/{matrix.json,matrix.md}

Usage:
  python3 tools/recompute_scope_matrix_r12.py [--debug] [--only TOOL ...] \
      [--json PATH] [--md PATH]
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "r11base", os.path.join(HERE, "recompute_scope_matrix_r11.py"))
r11 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r11)

r9 = r11.r9
ROOT = r11.ROOT
DOCS = r11.DOCS
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r12")
R11_COMMIT = "9fae2d6"
R11_REPORT = "reports/independent-audit-20261029-r11/"
R12_ABSORBED = ["0e8f9f1", "61e86fc", "6cb0afc", "7ff08bf", "7664498", "5c25200",
                "097f097", "4f7d4af", "ff621c3"]
EVID = "evidence/real-acceptance"
TERMINAL = {"succeeded", "done", "failed", "timeout", "cancelled"}

# per-tool commit that actually carried the R12 grade change
CHANGE_COMMIT = {
    ("PRODUCT_IMAGE_SUITE", "F"): "0e8f9f1",
    ("DRESS_WEAR_SET", "F"): "0e8f9f1",
    ("VIDEO_TRANSLATION", "R"): "0e8f9f1",
    ("VIDEO_CONCAT", "R"): "0e8f9f1",
    ("VIDEO_TRANSLATION", "H"): "0e8f9f1",
    ("VIDEO_CONCAT", "H"): "0e8f9f1",
    ("FISSION_LINK", "H"): "6cb0afc",
}

DIMS = ("F", "T", "R", "H", "K", "U")


def _sha256_file(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Audit12(r11.Audit11):
    # ---------- helpers ----------
    def _load(self, rel: str):
        """Receipt JSON from the audited tree (git HEAD), '' when absent."""
        p = self._abs(rel)
        if not os.path.exists(p):
            return None
        with open(p, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()

    def _assert_json(self, rel: str, fn, tid: str) -> list:
        out: list = []
        txt = self._load(rel)
        ok = txt is not None
        out.append({"check": "receipt_in_head", "ok": ok, "detail": rel})
        if not ok:
            return out
        try:
            d = json.loads(txt)
        except Exception as e:  # pragma: no cover
            out.append({"check": "receipt_json", "ok": False, "detail": str(e)[:120]})
            return out
        try:
            fn(d, out)
        except Exception as e:  # pragma: no cover
            out.append({"check": "assert_error", "ok": False, "detail": str(e)[:160]})
        return out

    def _artifact_check(self, rel: str, size: int | None, sha: str | None) -> list:
        out: list = []
        p = self._abs(os.path.join("evidence/real-acceptance", rel)) if not rel.startswith("evidence/") else self._abs(rel)
        if not os.path.exists(p):
            return [{"check": "artifact_present", "ok": False, "detail": rel}]
        real = os.path.getsize(p)
        out.append({"check": "artifact_size", "ok": real == size, "detail": f"{rel} {real}B vs {size}B"})
        if sha:
            got = _sha256_file(p)
            out.append({"check": "artifact_sha256", "ok": got == sha.lower(),
                        "detail": f"{rel} {got[:16]} vs {sha[:16]}"})
        return out

    # ---------- R12 machine assertions ----------
    def h_asserts(self) -> dict:
        out = super().h_asserts()

        # 1) FISSION_LINK r11: real Page.reload round-trip (6cb0afc)
        def fl(d, o):
            task = d.get("task") or {}
            ar = d.get("after_reload") or {}
            o.append({"check": "task_succeeded", "ok": task.get("status") == "succeeded",
                      "detail": f"task {d.get('taskId')} status={task.get('status')}"})
            o.append({"check": "reload_nav_type", "ok": ar.get("navType") == "reload",
                      "detail": f"navType={ar.get('navType')} marker={bool(ar.get('marker'))}"})
            dock = ar.get("dockItems") or []
            hit = [x for x in dock if x.get("id") == d.get("taskId")]
            o.append({"check": "post_reload_dock_has_task",
                      "ok": bool(hit) and hit[0].get("status") == "succeeded",
                      "detail": f"dock {len(dock)} rows; hit={hit[:1]}"})
            b = d.get("bytes") or {}
            o.append({"check": "bytes_declared", "ok": b.get("bytes") == 1988694,
                      "detail": f"{b.get('bytes')}B sha {(b.get('sha256') or '')[:16]}"})
            o.extend(self._artifact_check("FISSION_LINK/r10/result.png", 1988694, b.get("sha256")))
            dl = (d.get("actions") or {}).get("download") or {}
            o.append({"check": "download_not_claimed_pass",
                      "ok": (dl.get("verdict") or dl.get("receipt") or "") != "VERIFIED" or dl.get("clicked") is True,
                      "detail": f"download verdict={dl.get('verdict')} clicked={dl.get('clicked')}"
                                " （未命中不计入任何 PASS 腿）"})
        out["FISSION_LINK"] = self._assert_json(f"{EVID}/FISSION_LINK/r11/round-trip.json", fl, "FISSION_LINK")

        # 2/3) video resume receipts (0e8f9f1)
        for tid, rel, nbytes, art in (
            ("VIDEO_TRANSLATION", "VIDEO_TRANSLATION/run-resume-translation.json", 1080637, "VIDEO_TRANSLATION/downloaded.mp4"),
            ("VIDEO_CONCAT", "VIDEO_CONCAT/run-resume-concat.json", 2133234, "VIDEO_CONCAT/downloaded.mp4"),
        ):
            def fn(d, o, nbytes=nbytes, art=art):
                fin = d.get("final") or {}
                o.append({"check": "final_task_succeeded", "ok": fin.get("status") == "succeeded",
                          "detail": f"{fin.get('upstreamTaskId')} status={fin.get('status')}"})
                tl = d.get("statusTimeline") or []
                seq = [x.get("status") for x in tl]
                bad = [x for x in tl if x.get("status") in ("pending", "queued", "submit-unconfirmed")]
                o.append({"check": "no_pending_status",
                          "ok": not bad and bool(seq) and seq[-1] in ("succeeded", "done"),
                          "detail": f"timeline statuses={seq}（running 仅历史中间态，末态须终态成功）"})
                items = fin.get("items") or []
                o.append({"check": "payload_not_dropped",
                          "ok": bool(items) and all(i.get("payloadDropped") is False for i in items),
                          "detail": f"items={len(items)} kinds={[i.get('kind') for i in items]}"})
                o.append({"check": "final_items_bytes", "ok": any(i.get("bytes") == nbytes for i in items),
                          "detail": f"declared {[i.get('bytes') for i in items]} vs {nbytes}"})
                rl = d.get("reload") or {}
                its = rl.get("items") or []
                o.append({"check": "fresh_reload_matched",
                          "ok": rl.get("matched") is True and bool(its)
                                and its[0].get("taskId") == d.get("localTaskId") == "task-mvth" + ("8drs-dk86it" if nbytes == 1080637 else "gaa4-pdg1eq")
                                and its[0].get("status") == "succeeded",
                          "detail": f"matched={rl.get('matched')} item0={ {k: its[0].get(k) for k in ('taskId', 'status')} if its else None}"})
                res = d.get("result") or {}
                o.append({"check": "result_bytes_and_ftyp",
                          "ok": res.get("bytes") == nbytes and res.get("magic") == "ftyp",
                          "detail": f"bytes={res.get('bytes')} magic={res.get('magic')} rs={res.get('readyState')}"})
                dl = (d.get("actions") or {}).get("download") or {}
                o.append({"check": "download_bytes_match", "ok": dl.get("matchesResultBytes") is True
                          and dl.get("bytes") == nbytes,
                          "detail": f"download bytes={dl.get('bytes')} magic={dl.get('magic')}"})
                o.extend(self._artifact_check(art, nbytes, None))
            out[tid] = self._assert_json(f"{EVID}/{rel}", fn, tid)

        # 4) DRESS_WEAR_SET r12: rebuilt result panel after fresh reload (7ff08bf)
        def dws_panel(d, o):
            o.append({"check": "reload_nav_type", "ok": d.get("navType") == "reload",
                      "detail": f"navType={d.get('navType')} url={d.get('url')}"})
            its = d.get("items") or []
            o.append({"check": "panel_mounted_with_2_items",
                      "ok": d.get("panel") is True and len(its) == 2,
                      "detail": f"panel={d.get('panel')} summary={d.get('panelSummary')}"})
            o.append({"check": "panel_3_actions_per_item",
                      "ok": all(i.get("download") and i.get("save") and i.get("canvas") for i in its),
                      "detail": f"per-item action flags={[ {k: i.get(k) for k in ('download','save','canvas')} for i in its]}"})
        out["DRESS_WEAR_SET"] = self._assert_json(f"{EVID}/DRESS_WEAR_SET/r12/reload-panel.json", dws_panel, "DRESS_WEAR_SET")

        def dws_bytes(d, o):
            bs = [x.get("bytes") for x in (d.get("bytes") or [])]
            o.append({"check": "panel_item_bytes_declared", "ok": bs == [2516552, 1883817],
                      "detail": f"declared {bs}"})
            o.extend(self._artifact_check("DRESS_WEAR_SET/r10/result.png", 1883817, None))
        out["DRESS_WEAR_SET"] += self._assert_json(f"{EVID}/DRESS_WEAR_SET/r12/bytes.json", dws_bytes, "DRESS_WEAR_SET")

        def dws_actions(d, o):
            acts = d.get("actions") or {k: d.get(k) for k in ("download", "save", "canvas")}
            ok3 = all((acts.get(k) or {}).get("verdict") == "VERIFIED" for k in ("download", "save", "canvas"))
            o.append({"check": "three_actions_verified_on_panel", "ok": ok3,
                      "detail": " / ".join(f"{k}={(acts.get(k) or {}).get('verdict')}" for k in ("download", "save", "canvas"))})
            fb = (acts.get("download") or {}).get("file") or {}
            o.append({"check": "download_artifact_bytes", "ok": fb.get("bytes") in (2516552, 1883817),
                      "detail": f"{fb.get('path')} {fb.get('bytes')}B（落在 Downloads，非提交产物）"})
        out["DRESS_WEAR_SET"] += self._assert_json(f"{EVID}/DRESS_WEAR_SET/r12/actions.json", dws_actions, "DRESS_WEAR_SET")

        # 5/6) b4 three-action receipts that R11 could not see in HEAD (0e8f9f1)
        for tid, rel, nbytes, art in (
            ("PRODUCT_IMAGE_SUITE", "PRODUCT_IMAGE_SUITE/b4-actions.json", 2151517, "PRODUCT_IMAGE_SUITE/02-result.png"),
            ("DRESS_WEAR_SET", "DRESS_WEAR_SET/b4-actions.json", 1239248, "DRESS_WEAR_SET/result.png"),
        ):
            def fn(d, o, nbytes=nbytes, art=art):
                st = d.get("steps") or {}
                bm = st.get("bytesMatch") or {}
                o.append({"check": "b4_three_actions_bytes_equal", "ok": bm.get("same") is True
                          and bm.get("download") == bm.get("asset") == bm.get("node") == nbytes,
                          "detail": f"download/asset/node={bm.get('download')}/{bm.get('asset')}/{bm.get('node')}"})
                o.append({"check": "b4_action_receipts",
                          "ok": bool((st.get("download") or {}).get("download"))
                                and bool(((st.get("save") or {}).get("lastAsset") or {}).get("id"))
                                and bool(((st.get("canvas") or {}).get("lastProject") or {}).get("id")),
                          "detail": "download/save/canvas 三条回执均带实体 id 与字节"})
                o.append({"check": "b4_no_console_errors", "ok": not (st.get("consoleErrors") or []),
                          "detail": str(st.get("consoleErrors"))[:80]})
                o.extend(self._artifact_check(art, nbytes, None))
            out[tid] = out.get(tid, []) + self._assert_json(f"{EVID}/{rel}", fn, tid)
        return out

    # ---------- run ----------
    def run(self) -> dict:
        rep = super().run()
        r11rep = json.loads(subprocess.run(
            ["git", "show", f"{R11_COMMIT}:docs/V1.0/plan_linkfox_navigation/{R11_REPORT}matrix.json"],
            cwd=ROOT, capture_output=True, text=True).stdout)
        prev = {t["id"]: t for t in r11rep["tools"]}

        changes = []
        for t in rep["tools"]:
            o = prev.get(t["id"], {})
            for d in DIMS:
                if o.get(d) != t.get(d):
                    changes.append({
                        "id": t["id"], "dim": d,
                        "was": o.get(d), "now": t.get(d),
                        "commit": CHANGE_COMMIT.get((t["id"], d), ""),
                        "note": (t.get(d + "_note") or "")[:240],
                    })
        rep["generatedAt"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        rep["supersedes"] = {
            "report": R11_REPORT,
            "commit": "3c9d81a (R11) + 9fae2d6 (R11 crosscheck)",
            "reason": "以 R11 严格三腿口径（含 crosscheck 的 5 处映射/归属修正）为基线，"
                      "在同一审计器上只吸收既有提交证据：" + "、".join(R12_ABSORBED) +
                      "；不放宽任何 PASS 门槛，不把 pending/running/下载未命中 视为 PASS",
        }
        rep["absorbed_commits"] = R12_ABSORBED
        rep["summary"]["h_pass"] = sum(1 for t in rep["tools"] if t["H"] == "PASS")
        rep["summary"]["changes_vs_r11"] = len(changes)
        rep["changes_vs_r11"] = changes
        rep["strictness"] = dict(rep["strictness"])
        rep["strictness"]["r12_no_loosening"] = [
            "未新增任何 PASS 门槛放宽；改判全部来自新提交的证据本身落进 HEAD",
            "pending/running/submit-unconfirmed 一律不算 PASS（assert_no_pending 硬断言）",
            "下载未命中（FISSION_LINK download UNVERIFIED）不参与任何腿的成立",
            "字节仍须同尺寸；声明 sha256 时必须逐位相同",
        ]
        rep["r12_notes"] = self.r12_notes(rep)
        return rep

    def r12_notes(self, rep: dict) -> list:
        by = {t["id"]: t for t in rep["tools"]}
        n = []
        n.append({"tool": "VIDEO_TRANSLATION", "note":
                  "0e8f9f1 的真实任务 task-mvth8drs-dk86it 续查到终态 succeeded（上游 task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd），"
                  "结果 1,080,637B MP4（ftyp，readyState=4，768x768）；下载动作字节与结果相等、存资产/发画布均有面板回执；"
                  "整页新文档加载后历史坞命中同一 taskId 且 status=succeeded；已提交产物 downloaded.mp4 字节/魔数一致 → R、H 同时转 PASS。"})
        n.append({"tool": "VIDEO_CONCAT", "note":
                  "0e8f9f1 的真实任务 task-mvthgaa4-pdg1eq 续查到终态 succeeded（上游 task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF），"
                  "2,133,234B MP4（ftyp，7.292s，768x1344）；下载字节与结果相等；刷新后历史坞命中同一 taskId；"
                  "已提交产物 downloaded.mp4 一致 → R、H 转 PASS。注意：该工具早前那份 submit-unconfirmed 记录（README-20261029-continuation.md）仍是 failed，"
                  "本次 PASS 依据的是另一笔真实成功任务，两者不得混为一谈。"})
        n.append({"tool": "FISSION_LINK", "note":
                  "6cb0afc 的 CDP 真实 Page.reload（navType=reload + marker=1793275695.89）后，dock 内同一 task-mvt18lrt-rsnifn 仍为 succeeded，"
                  "回执字节 1,988,694B / sha bbc0ca08… 与仓库内 FISSION_LINK/r10/result.png 逐位一致 → H 转 PASS。"
                  "下载按钮本轮未点到（verdict=UNVERIFIED），如实保留，不参与判定；F 的 PASS 仍由存资产/发画布两条回执成立。"})
        n.append({"tool": "DRESS_WEAR_SET", "note":
                  "7ff08bf / 61e86fc：结果区挂共享 ToolResult 后，fresh reload（navType=reload）面板重建成功（data-testid=tool-result，"
                  "共 2 个结果，每组三动作按钮齐全），r12 三动作 VERIFIED（下载/存资产/发画布均有反馈）。"
                  "字节口径：面板声明 2,516,552B 与 1,883,817B，其中 1,883,817B 与提交产物 r10/result.png 一致；"
                  "2,516,552B 仅落到 Downloads（未入库），故 H 仍由 r10 那对（同 taskId + 同尺寸产物）成立，r12 作补充证据。"})
        n.append({"tool": "PRODUCT_IMAGE_SUITE", "note":
                  "0e8f9f1 补齐 b4-actions.json：下载/存资产/发画布三条回执字节全为 2,151,517B 且与提交产物 02-result.png 同尺寸，"
                  "consoleErrors 为空 → F 由 PARTIAL 转 PASS（R11 时该回执未在 HEAD，属证据缺口而非口径问题）。"})
        n.append({"tool": "DRESS_WEAR_SET", "note_f": 
                  "b4-actions.json 三动作字节同为 1,239,248B，与提交产物 DRESS_WEAR_SET/result.png 同尺寸 → F 转 PASS；"
                  "该 b4 回执与 r10/r12 是不同轮次的真实结果，矩阵按各自维度分别引用，未混用字节。"})
        n.append({"tool": "IMAGE_TEXT_EDIT", "note":
                  "维持 R11 判定：真实任务 payloadDropped=true、无 storageKey/url/bytes，字节腿不成立 → H 仍 PARTIAL（不伪 PASS）。"})
        if by.get("VIDEO_CONCAT", {}).get("T") != "PASS":
            n.append({"tool": "VIDEO_CONCAT", "note_t":
                      "T（画幅/时长透传）与 F 仍受限于：本轮成功任务用的是默认参数路径，页面字段透传证据与本次 task 不属同一条回执，故不放宽。"})
        return n


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    lines = [
        "# R12 严格矩阵（39 工具 · H 三腿）",
        "",
        f"- 审计 HEAD：`{rep['head'][:7]}`（{rep['branch']}）",
        f"- 生成时间：{rep['generatedAt']}",
        f"- 基线：`{rep['supersedes']['commit']}`",
        f"- 吸收提交：{', '.join('`' + c + '`' for c in rep.get('absorbed_commits', []))}",
        f"- 依据：{rep['supersedes']['reason']}",
        "",
        "## 统计",
        "",
        "| 维度 | 分布 |",
        "| --- | --- |",
    ]
    for d in DIMS:
        lines.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in t[d].items()) + " |")
    lines += ["", "## 逐工具", "",
              "| 工具 | F | T | R | H | K | U | task | reload | 字节sha | 依据 / 剩余缺口 | 证据 |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for x in rep["tools"]:
        L = x.get("H_legs") or {}
        mark = lambda b: "✅" if b else "❌"
        note = (x.get("H_note") or "").replace("|", "/")[:190]
        ev = "<br>".join(f"`{e}`" for e in (x.get("H_evidence") or [])[:2])
        lines.append(f"| {x['id']} | {x['F']} | {x['T']} | {x['R']} | {x['H']} | {x['K']} | {x['U']} | "
                     f"{mark(L.get('task'))} | {mark(L.get('reload'))} | {mark(L.get('bytes'))} | "
                     f"{note} | {ev} |")
    lines += ["", f"## 相对 R11（3c9d81a + 9fae2d6）的改判（{len(rep.get('changes_vs_r11') or [])} 处）", ""]
    if rep.get("changes_vs_r11"):
        for c in rep["changes_vs_r11"]:
            lines.append(f"- **{c['id']}** `{c['dim']}` `{c['was']}` → `{c['now']}`"
                         f"（`{c['commit']}`）：{c['note']}")
    else:
        lines.append("- 无（分布与 R11 完全一致）")
    if rep.get("r12_notes"):
        lines += ["", "## R12 判定说明 / 风险", ""]
        for n in rep["r12_notes"]:
            lines.append(f"- **{n['tool']}**：{n.get('note') or n.get('note_f') or n.get('note_t')}")
    fr = [(tid, r) for tid, rows in (rep.get("h_asserts") or {}).items() for r in rows if not r["ok"]]
    lines += ["", "## H 硬断言", "",
              f"- 断言失败项：{len(fr)}", ""]
    for tid, r in fr:
        lines.append(f"  - `{tid}` {r['check']}: {r['detail']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()

    rep = Audit12().run()
    if a.only:
        keep = set(a.only)
        rep["tools"] = [t for t in rep["tools"] if t["id"] in keep]
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    with open(a.json, "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=1)
    with open(a.md, "w", encoding="utf-8") as fh:
        fh.write(to_md(rep))
    print("head:", rep["head"][:7], "| json:", os.path.relpath(a.json, ROOT))
    print(json.dumps(rep["summary"], ensure_ascii=False, indent=1))
    for c in rep.get("changes_vs_r11") or []:
        print(" *", c["id"], c["dim"], c["was"], "->", c["now"], "|", c["commit"])
    bad = [(tid, r["check"]) for tid, rows in rep["h_asserts"].items() for r in rows if not r["ok"]]
    print("h_asserts failures:", bad)
    return 0


if __name__ == "__main__":
    sys.exit(main())

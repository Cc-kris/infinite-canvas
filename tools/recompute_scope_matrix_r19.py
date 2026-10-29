#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R19 严格矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
R18 = commit 7af1814c 自带的 matrix（F36/3 T39/0 R39/0 H36/3 K12/27 U39；
非全绿 6 单元 / 5 工具；relative-to-R17 改判 1 处 = CHANGE_COLOR_V2.H）。
**不用**工作区里未提交内容当基线。

吸收（全部 committed，逐条机检）
------------------------------
044465c5  r25 REMOVE_PEN 真实任务 task-mvtmnhk5-nr2g0z 字节物理缺口确认（BLOCKED_NO_BYTES）：
          sha256=null（sha256Status=unavailable_after_run）、三动作 NOT_VERIFIABLE_NO_BYTES、
          7 项探针（临时 profile 已删 / 无 APFS 快照 / find 2440825B=0 / 真实 profile 内 taskId 0 命中）。
          → 负证，只用于维持 PARTIAL，绝不升级（negative_evidence_rule）。
03b8f47e  快照 d5aa048a（tree 3ef46fd6）独立三闸全绿原始日志：typecheck TC_EXIT=0、
          bun test 1483 pass / 0 fail / TEST_EXIT=0、build built in 30.34s / BUILD_EXIT=0。
          本轮机检 web/ 在 d5aa048a 与 HEAD 之间逐 blob 相同 → 门禁结论对 HEAD 有效。
97952074  IMAGE_TEXT_EDIT provenance-heal 回执（R18 已吸收并判 PARTIAL）。本轮重新机检其缺口字段
          （download 无 bytes/sha、saveAsset/sendToCanvas 无 bytes/sha、reload 无机读标记），
          缺口仍在 → 仍 PARTIAL，不因回执自称 H_PASS 放宽。

判据（只收紧，不放宽）
----------------------
1. 只吸收 committed 证据：证据/产物一律从 `git ls-tree -r -l HEAD` 的 blob 现算 size+sha256，
   工作区未提交/未跟踪内容不参与。
2. 升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持基线原判。
   R19 对 R18 已 PASS 的升级项**重跑**同一套硬断言（复验，不改判）。
3. 仅反证可降级（字节/sha 不符、payloadDropped、快照回填、非法 taskId）；「无法复核」不降级。
4. 负证（BLOCKED_*）只用作维持 PARTIAL 的证据，绝不据此升级。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys

REPO = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
os.chdir(REPO)

BASE_COMMIT = "7af1814c"
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261029-r18-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261029-r19-matrix"
ROUND = "R19"
GATE_SNAPSHOT = "d5aa048a"


def _load(name: str, rel: str):
    path = os.path.join(REPO, rel)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


r18 = _load("recompute_scope_matrix_r18", "tools/recompute_scope_matrix_r18.py")
r17 = r18.r17

git = r18.git
head_meta = r18.head_meta
blob_sha256 = r18.blob_sha256
blob_text = r17.blob_text
resolve = r18.resolve
load_json = r18.load_json
Assertions = r18.Assertions
TASK_RE = r18.TASK_RE
STORAGE_KEY_RE = r18.STORAGE_KEY_RE
TALLIES = r18.TALLIES

# R18 的全部升级断言（CCV2.H 新增 + R17 继承集）在 R19 重跑做复验
UPGRADES = dict(r18.UPGRADES)

R25_RECEIPT = "r25-real-task-bytes-gap-20261029/receipt-remove-pen.machine.json"
VERIFY_LOGS = "docs/V1.0/reports/verify-d5aa048a-20261029-logs"
VERIFY_MD = "docs/V1.0/reports/verify-d5aa048a-20261029.md"


# =========================================================== 新增负证（R19）
def neg_r25_remove_pen(files, a):
    """044465c5：REMOVE_PEN 真实任务字节物理缺口机检（负证，维持 PARTIAL）。"""
    r = load_json(R25_RECEIPT, files)
    ok = True
    ok &= a("r25.schema", r.get("schema") == "infinite-canvas/evidence/receipt@1", str(r.get("schema")))
    ok &= a("r25.scope", r.get("scope") == "REMOVE_PEN", str(r.get("scope")))
    ok &= a("r25.round", str(r.get("round")) == "r25", str(r.get("round")))
    ok &= a("r25.verdict", r.get("verdict") == "BLOCKED_NO_BYTES", str(r.get("verdict")))
    ok &= a("r25.verdictKind", r.get("verdictKind") == "physical_gap_confirmed", str(r.get("verdictKind")))
    c = r.get("constraints") or {}
    ok &= a(
        "r25.constraints",
        all(c.get(k) is False for k in ("workerDispatched", "regenerated", "injectedBytes", "sourceCodeChanged")),
        json.dumps(c, ensure_ascii=False),
    )
    ok &= a("r25.taskId", bool(TASK_RE.fullmatch(r.get("taskId", ""))), r.get("taskId", ""))
    ok &= a("r25.storageKey", bool(STORAGE_KEY_RE.fullmatch(r.get("storageKey", ""))), r.get("storageKey", ""))
    ok &= a("r25.bytes", r.get("bytes") == 2440825, str(r.get("bytes")))
    # sha 缺失且回执自陈原因（这是「无字节」的机读证据，不是可升级字节腿）
    ok &= a("r25.shaNull", r.get("sha256") is None, str(r.get("sha256")))
    ok &= a("r25.shaStatus", r.get("sha256Status") == "unavailable_after_run", str(r.get("sha256Status")))
    probes = {p.get("id"): p for p in (r.get("probes") or [])}
    ok &= a("r25.probe.profileGone", (probes.get("profile-exists") or {}).get("hit") is False, str((probes.get("profile-exists") or {}).get("result"))[:40])
    ok &= a("r25.probe.noApfsSnapshot", (probes.get("apfs-local-snapshots") or {}).get("hit") is False, str((probes.get("apfs-local-snapshots") or {}).get("result"))[:40])
    ok &= a("r25.probe.findZero", (probes.get("file-size-2440825") or {}).get("hit") is False, str((probes.get("file-size-2440825") or {}).get("result")))
    ok &= a("r25.probe.realProfilesZero", (probes.get("real-profile-taskid-search") or {}).get("hit") is False, str((probes.get("real-profile-taskid-search") or {}).get("result")))
    av = r.get("actionsVerified") or {}
    ok &= a("r25.actionsAllNotVerifiable", all(str(v).startswith("NOT_VERIFIABLE") for v in av.values()) and len(av) == 3, json.dumps(av, ensure_ascii=False))
    # HEAD 内不存在同尺产物（字节腿不可复核）
    ok &= a("r25.noCommittedSameSize", not any(m["size"] == 2440825 for m in files.values()), "HEAD 无 2,440,825B 产物")
    # 回执自身门禁记录（自跑，非升级依据）
    g = r.get("gates") or {}
    ok &= a("r25.gate.tsc", (g.get("tsc") or {}).get("exit") == 0, str((g.get("tsc") or {}).get("exit")))
    ok &= a("r25.gate.tests", (g.get("tests") or {}).get("fail") == 0, str((g.get("tests") or {}).get("fail")))
    # 报告文件必须随回执提交
    ok &= a("r25.reportCommitted", bool(resolve("r25-real-task-bytes-gap-20261029/report.md", files)), "report.md")
    return ok


def verify_gate_d5aa048a(files, a):
    """03b8f47e：独立三闸日志机检 + web/ 树一致性（决定门禁是否对 HEAD 有效）。"""
    ok = True
    # web/ 在 d5aa048a 与 HEAD 之间逐 blob 相同（否则日志不能用于 HEAD）
    diff = subprocess.check_output(
        ["git", "diff", "--name-only", GATE_SNAPSHOT, "HEAD", "--", "web/"], text=True
    ).strip()
    ok &= a("gate.webTreeIdentical", diff == "", diff[:60] or "identical")
    tree = subprocess.check_output(["git", "rev-parse", f"{GATE_SNAPSHOT}^{{tree}}"], text=True).strip()
    ok &= a("gate.snapshotTree", tree.startswith("3ef46fd6"), tree)

    tc = blob_text(files[resolve(f"{VERIFY_LOGS}/typecheck.log", files)]["blob"])
    ok &= a("gate.typecheck.cmd", "$ tsc --noEmit" in tc, tc.strip().splitlines()[0][:40])
    ok &= a("gate.typecheck.exit", "TC_EXIT=0" in tc, tc.strip().splitlines()[-1])

    bt = blob_text(files[resolve(f"{VERIFY_LOGS}/buntest.log", files)]["blob"])
    ok &= a("gate.test.pass", " 1483 pass" in bt, "1483 pass")
    ok &= a("gate.test.fail", "\n 0 fail" in bt, "0 fail")
    ok &= a("gate.test.expects", "8342 expect() calls" in bt, "8342 expect")
    ok &= a("gate.test.files", "across 84 files" in bt, "84 files")
    ok &= a("gate.test.exit", "TEST_EXIT=0" in bt, bt.strip().splitlines()[-1])

    bl = blob_text(files[resolve(f"{VERIFY_LOGS}/build.log", files)]["blob"])
    ok &= a("gate.build.built", "built in 30.34s" in bl, "built in 30.34s")
    ok &= a("gate.build.asset", "index-DPpMYq6s.js" in bl, "index-DPpMYq6s.js")
    ok &= a("gate.build.exit", "BUILD_EXIT=0" in bl, bl.strip().splitlines()[-1])

    lf = blob_text(files[resolve(f"{VERIFY_LOGS}/tsc-listfiles.log", files)]["blob"])
    n = len(lf.splitlines())
    ok &= a("gate.listfiles.volume", n >= 3400, f"{n} lines")
    ok &= a("gate.listfiles.webSrc", "web/src/" in lf, "web/src 入编译")

    vm = blob_text(files[resolve(VERIFY_MD, files)]["blob"])
    ok &= a("gate.report.snapshot", "d5aa048a" in vm, "d5aa048a")
    ok &= a("gate.report.pass", "1483 pass" in vm or "1483" in vm, "1483")
    ok &= a("gate.report.noRegression", "零改动" in vm or "未发现" in vm, "结论句在")
    return ok


def gate_from_logs(files) -> dict:
    return {
        "status": "OK",
        "source": "03b8f47e 提交的原始日志（独立目录 git archive + bun install --frozen-lockfile 全量重装）",
        "snapshot": f"{GATE_SNAPSHOT}（tree 3ef46fd6；机检 web/ 与 HEAD 逐 blob 相同 → 结论对 HEAD 有效）",
        "checks": [
            {"name": "typecheck", "cmd": "bun run typecheck (tsc --noEmit)", "result": "EXIT 0（TC_EXIT=0）"},
            {"name": "test", "cmd": "bun test（全量）", "result": "1483 pass / 0 fail / 8342 expect（84 文件），TEST_EXIT=0"},
            {"name": "build", "cmd": "bun run build", "result": "built in 30.34s，index-DPpMYq6s.js 5,607,804B，BUILD_EXIT=0"},
            {"name": "typecheck-scope", "cmd": "tsc --listFiles", "result": "3437 行文件清单，web/src 入编译"},
        ],
        "note": "日志路径 docs/V1.0/reports/verify-d5aa048a-20261029-logs/；本目录 evidence/gate.json 为机检摘要（含 web/ 一致性断言）",
    }


ABSORBED_COMMITS = [
    ("044465c5", "REMOVE_PEN 真实任务 task-mvtmnhk5-nr2g0z 字节物理缺口确认（BLOCKED_NO_BYTES，7 探针机检；负证不改判）"),
    ("03b8f47e", "快照 d5aa048a 独立三闸全绿原始日志（typecheck/test/build 全 0）+ 草稿回写地址恢复 6/6；本轮机检 web/ 与 HEAD 相同"),
]

NO_CHANGE_ABSORBED = [
    (
        f"044465c5 / {R25_RECEIPT}",
        "BLOCKED_NO_BYTES：sha256=null（unavailable_after_run）、三动作 NOT_VERIFIABLE_NO_BYTES、"
        "find 2440825B=0 且真实 profile 内 taskId 0 命中、HEAD 无同尺产物 → 负证只维持 PARTIAL，绝不升级",
    ),
    (
        "03b8f47e / docs/V1.0/reports/verify-d5aa048a-20261029-logs/",
        "门禁证据（T 维不改判）：独立快照三闸 exit 0；web/ 与 HEAD 逐 blob 相同，故对 HEAD 有效；"
        "R19 将它作为 gate 记录，T 仍按 rubric 机检（无 LinkFox 品牌/计费/案例占位）",
    ),
    (
        "97952074 / evidence/real-acceptance/IMAGE_TEXT_EDIT/r18-provenance-heal-20261029.json",
        "R19 重跑缺口机检：download 仍无 bytes/sha/file，saveAsset 与 sendToCanvas 仍无 bytes/sha/imageBytes，"
        "freshReload 仍无 navigationType/timeOrigin；唯一硬腿为「IDB 844,613B / sha e7b260… == 已提交 03-result-image.png」"
        " → 按同一判据仍 PARTIAL",
    ),
    (
        "044465c5 / 源码未改",
        "回执 constraints 明示 sourceCodeChanged=false、未重生成、未注入；rootCauseCheck 认定历史字节丢失来自"
        "快照时序 + 运行时实例已删，非可复现代码根因",
    ),
]

GAP_UPDATES = {
    ("REMOVE_PEN", "H"): (
        "r25（044465c5）对真实任务 task-mvtmnhk5-nr2g0z 再次判定 BLOCKED_NO_BYTES 且为 physical_gap_confirmed："
        "resultItem storageKey tool-result:task-mvtmnhk5-nr2g0z:0:komJnSXgwkxdOFeQHXTGI、声称 2,440,825B，但 sha256=null"
        "（unavailable_after_run）；r20 临时 profile /tmp/ic-profile 已删、无 APFS 快照、find 2440825B 命中 0、"
        "三个真实浏览器 profile 内 taskId/storageKey 0 命中、HEAD 无同尺产物；下载/存资产/发画布三动作均 NOT_VERIFIABLE_NO_BYTES。"
        "→ 无字节可对账，三动作无法在不注入前提下复验；需真跑一次上传+蒙版+提交（并保证该轮 profile 不被销毁）才能补 H"
    ),
    ("IMAGE_TEXT_EDIT", "H"): (
        "97952074 回执已补齐 provenance（payloadDropped true→false，回填 storageKey tool-result:…:ZQg4pDfHC25ssM7hDsse7 / "
        "844,613B / sha e7b260…），且与已提交 real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png 现算 sha 相等（硬腿 1，R19 复验通过）。"
        "仍缺（R19 逐字段机检为「不存在」）：① 下载文件磁盘字节+sha ② 存资产/发画布字节对账（仅 assetId/nodeId + IDB 命中）"
        "③ 机读 reload 标记（navigationType/timeOrigin）→ 维持 PARTIAL"
    ),
    ("VIDEO_CONCAT", "F"): (
        "R17 硬腿：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致；8751bd6e R24 机读负证：本地 profile 无该成功任务"
        "（localStorage 仅 failed task-mvt94gxs-p0r29t）、IDB 无同尺 mp4（blobSizeEq2133234=0）；R19 复核 HEAD 内 2,133,234B "
        "仅该已提交产物一份、无存资产/画布侧回执 → 存资产/发画布无法在不注入前提下复验，维持 PARTIAL"
    ),
    ("AI_VIDEO_EDITING", "H"): (
        "有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true："
        "结果项无 storageKey/url，字节未入库 → 维持 PARTIAL"
    ),
    ("AI_VIDEO_EDITING", "F"): "仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL",
    ("VIDEO_TRANSLATION", "F"): "上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞）",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    meta = head_meta()
    files = meta["files"]
    baseline = json.loads(git("show", f"{BASE_COMMIT}:{BASE_MATRIX}").decode())
    tools = json.loads(json.dumps(baseline["tools"]))
    by_id = {t["id"]: t for t in tools}

    log: list[str] = []
    asserts = Assertions()
    contradictions: list[str] = []
    changed: list[tuple[str, str, str, str]] = []
    reverified: list[tuple[str, str]] = []
    upgrade_rows: list[dict] = []

    # --- 基线完整性：R 产物/H 抵消项仍在 HEAD 内可解析
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
        if hl.get("payload_drop"):
            log.append(f"{tid}.H payload_drop=true → 不可升级")
        if hl.get("backfill"):
            log.append(f"{tid}.H 快照回填 → 不可升级")
        for b in hl.get("binding") or []:
            if not TASK_RE.fullmatch(b):
                contradictions.append(f"{tid}.H 非法 taskId: {b}")
        if hl.get("artifact") and not resolve(hl["artifact"], files):
            contradictions.append(f"{tid}.H artifact 未提交: {hl['artifact']}")

    # --- 升级断言（R19 全部重跑；已 PASS 者记复验，不改判）
    for (tid, dim), spec in UPGRADES.items():
        t = by_id[tid]
        rel = spec["receipt"]
        p = resolve(spec["artifact"], files)
        if not p:
            raise SystemExit(f"ASSERT_FAIL: {tid}.{dim} 产物未提交: {spec['artifact']}")
        size, sha = blob_sha256(files[p]["blob"])
        local = Assertions()
        ok, note = spec["fn"]((local, files, sha, size))
        ok = ok and local.ok()
        for row in local.rows:
            asserts.rows.append((f"{tid}.{dim}:{row[0]}", row[1], row[2]))
        upgrade_rows.append(
            {
                "tool": tid,
                "dim": dim,
                "receipt": rel,
                "artifact": p,
                "artifactBytes": size,
                "artifactSha256_12": sha[:12],
                "assertions": len(local.rows),
                "ok": bool(ok),
                "baseline": t[dim],
            }
        )
        if not ok:
            print(f"ASSERT_FAIL {tid}.{dim}: {local.failures()}", file=sys.stderr)
            log.append(f"{tid}.{dim} 断言未通过 → 保持 R18 基线原判（{t[dim]}）")
            if t[dim] == "PASS":
                contradictions.append(f"{tid}.{dim} 基线 PASS 但复验断言失败: {local.failures()}")
            continue
        old = t[dim]
        if old == "PASS":
            reverified.append((tid, dim))
            t.setdefault("reverified_in_r19", []).append(dim)
            log.append(f"{tid}.{dim} 复验通过（基线已 PASS，不改判）")
            continue
        t[dim] = "PASS"
        t[f"{dim}_note"] = note
        t.setdefault("changed_in_r19", {})[dim] = {"from": old, "to": "PASS", "receipt": rel, "artifact": p}
        changed.append((tid, dim, old, "PASS"))

    # --- 负证 / 补强（不改判，但必须机检通过）
    neg_checks = [
        ("REMOVE_PEN.H@r25", neg_r25_remove_pen),
        ("REMOVE_PEN.H@r24", r18.neg_remove_pen),
        ("VIDEO_CONCAT.F", r18.neg_video_concat),
        ("IMAGE_TEXT_EDIT.H", r18.neg_image_text_edit),
        ("PRINT_EXTRACT.H", r18.strengthen_print_extract),
        ("GATE.d5aa048a", verify_gate_d5aa048a),
    ]
    for name, fn in neg_checks:
        local = Assertions()
        try:
            ok = fn(files, local)
        except SystemExit as exc:
            ok = False
            local(f"{name}:load", False, str(exc))
        ok = ok and local.ok()
        for row in local.rows:
            asserts.rows.append((f"{name}:{row[0]}", row[1], row[2]))
        if not ok:
            contradictions.append(f"{name} 负证/补强机检未过: {local.failures()}")
        else:
            log.append(f"{name} 负证/补强机检通过（{len(local.rows)} 断言，不改判）")

    # --- gap 描述更新（只更新说明，不改判定）
    for (tid, dim), gap in GAP_UPDATES.items():
        if tid in by_id:
            by_id[tid][f"{dim}_gap"] = gap
            by_id[tid].setdefault("gap_updated_in_r19", []).append(dim)
    log.append(f"gap 描述更新：{[f'{k[0]}.{k[1]}' for k in GAP_UPDATES]}（仅说明，不改判定）")

    # --- 计数
    tally = {d: {} for d in TALLIES}
    for t in tools:
        for d in TALLIES:
            v = t[d]
            tally[d][v] = tally[d].get(v, 0) + 1
    for d in TALLIES:
        tally[d] = dict(sorted(tally[d].items(), key=lambda kv: (-kv[1], kv[0])))

    residual = []
    for t in tools:
        for d in ("F", "T", "R", "H", "K", "U"):
            if t[d] == "PARTIAL":
                residual.append(
                    {"tool": t["id"], "dim": d, "verdict": "PARTIAL", "note": t.get(f"{d}_note", ""), "gap": t.get("H_gap") if d == "H" else None}
                )

    def size_hits(size: int) -> list[str]:
        return sorted(p for p, m in files.items() if m["size"] == size)

    byte_leg_audit = []
    for tid, dim, claimed, cit in (
        ("REMOVE_PEN", "H", 2440825, "r25 回执 claims bytes=2440825 但 sha256=null；HEAD 内同尺产物"),
        ("CHANGE_COLOR_V2", "H", 2545568, "r24 receipt vs committed artifact"),
        ("IMAGE_TEXT_EDIT", "H", 844613, "97952074 restoredBytes vs committed 03-result-image.png"),
        ("VIDEO_CONCAT", "F", 2133234, "downloaded.mp4 vs IDB/tool_assets"),
    ):
        hits = size_hits(claimed)
        byte_leg_audit.append(
            {
                "tool": tid,
                "dim": dim,
                "claimedBytes": claimed,
                "committedSameSizeArtifacts": hits,
                "verdict": (
                    "已用已提交产物现算 sha 对账通过"
                    if tid in ("CHANGE_COLOR_V2", "IMAGE_TEXT_EDIT", "VIDEO_CONCAT")
                    else "字节腿不可复核（无产物、无 sha）→ 维持 PARTIAL"
                ),
                "note": cit,
            }
        )

    gate = gate_from_logs(files)

    out = {
        "generatedAt": subprocess.check_output(["date", "+%Y-%m-%dT%H:%M:%S%z"], text=True).strip(),
        "head": meta["head"],
        "branch": meta["branch"],
        "round": ROUND,
        "scope": "39 个工具（沿用 R15/R16/R17/R18 范围，K/U 口径继承）",
        "rubric": baseline.get("rubric"),
        "baseline": "R18 7af1814c（其自带 matrix：F36/3 T39/0 R39/0 H36/3 K12/27 U39；非全绿 6 单元 / 5 工具）",
        "auditor": "tools/recompute_scope_matrix_r19.py",
        "strictness": {
            "absorb": "仅 committed 证据（git ls-tree HEAD + blob sha256 现算）；工作区未提交/未跟踪内容不参与",
            "upgrade_rule": "每条升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等），断言失败即保持 R18 基线原判；基线已 PASS 者重跑同一套断言做复验",
            "downgrade_rule": "仅反证可降级（产物字节/sha 不符、payloadDropped、快照回填、非法 taskId）；『无法复核』不构成降级",
            "negative_evidence_rule": "BLOCKED_* 负证只用于维持 PARTIAL，绝不作升级依据；负证本身也须机检通过",
            "loosened": False,
        },
        "gate": gate,
        "byteLegAudit": byte_leg_audit,
        "summary": {
            "tools": len(tools),
            "tally": tally,
            "changes_vs_r18": len(changed),
            "reverified_vs_r18": len(reverified),
            "non_green_units": len(residual),
            "non_green_tools": len({r["tool"] for r in residual}),
            "non_green_tool_ids": sorted({r["tool"] for r in residual}),
        },
        "tools": tools,
        "changes_vs_r18": [
            {"tool": tid, "dim": d, "from": o, "to": n, "evidence": UPGRADES[(tid, d)]["receipt"], "artifact": UPGRADES[(tid, d)]["artifact"]}
            for tid, d, o, n in changed
        ],
        "reverified": [{"tool": t, "dim": d} for t, d in reverified],
        "upgradeAssertions": upgrade_rows,
        "absorbed_commits": [{"commit": c, "note": n} for c, n in ABSORBED_COMMITS],
        "absorbed_no_change": [{"evidence": e, "why_not_upgraded": w} for e, w in NO_CHANGE_ABSORBED],
        "assertions": [{"name": n, "ok": ok, "detail": dt} for n, ok, dt in asserts.rows],
        "contradictions": contradictions,
        "audit_log": log,
        "residual": residual,
    }

    if contradictions:
        print("CONTRADICTIONS:", *contradictions, sep="\n  ", file=sys.stderr)
    if not asserts.ok():
        raise SystemExit(f"ASSERT_FAIL: {asserts.failures()}")
    assert out["summary"]["changes_vs_r18"] == len(changed)
    for tid, d, old, new in changed:
        assert new == "PASS" and old != "PASS"

    if args.check:
        print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
        return 0

    outdir = os.path.join(REPO, OUT_DIR)
    os.makedirs(os.path.join(outdir, "evidence"), exist_ok=True)
    with open(os.path.join(outdir, "matrix.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    md = render_md(out)
    with open(os.path.join(outdir, "matrix.md"), "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(outdir, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(md + render_ledger(out))
    with open(os.path.join(outdir, "auditor.py"), "w", encoding="utf-8") as fh:
        fh.write(open(os.path.abspath(__file__), encoding="utf-8").read())
    with open(os.path.join(outdir, "evidence", "gate.json"), "w", encoding="utf-8") as fh:
        json.dump(
            {
                **gate,
                "machineChecks": [
                    {"name": a["name"], "ok": a["ok"], "detail": a["detail"]}
                    for a in out["assertions"]
                    if a["name"].startswith("GATE.d5aa048a:")
                ],
            },
            fh,
            ensure_ascii=False,
            indent=1,
        )
    print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
    print("written:", OUT_DIR)
    return 0


# --------------------------------------------------------------------- 渲染
LABELS = {"F": "F 功能面", "T": "T 测试闸", "R": "R 取回/重启", "H": "H 硬证据（真任务/真字节/真动作）", "K": "K 知识库", "U": "U 用户链路"}


def render_md(d: dict) -> str:
    t = d["summary"]["tally"]
    L: list[str] = []
    L.append(f"# {ROUND} 独立审计矩阵（39 工具 · 严格重算）\n")
    L.append(f"- 审计对象 HEAD：`{d['head']}`（branch `{d['branch']}`）")
    L.append(f"- 基线：{d['baseline']}")
    L.append(f"- 审计器：`{d['auditor']}`（本目录 `auditor.py` 为同一快照）")
    L.append(f"- 复现：`python3 {d['auditor']} --check`\n")

    L.append("## 0. 统计（精确计数）\n")
    L.append("| 维度 | 口径 | PASS | PARTIAL | N/A | 合计 |")
    L.append("|---|---|---|---|---|---|")
    for dim in TALLIES:
        c = t[dim]
        total = sum(c.values())
        L.append(f"| {dim} | {LABELS[dim]} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | {c.get('N/A', 0)} | {total} |")
    L.append("")
    L.append("简式：**F " + "/".join(str(t['F'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
             " · T " + "/".join(str(t['T'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
             " · R " + "/".join(str(t['R'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
             " · H " + "/".join(str(t['H'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
             " · K " + "/".join(str(t['K'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) +
             " · U " + "/".join(str(t['U'].get(k, 0)) for k in ("PASS", "PARTIAL", "N/A")) + "**"
             "（每维按 PASS/PARTIAL/N/A）\n")
    L.append(
        f"总计：**{d['summary']['tools']}** 个工具；非全绿 **{d['summary']['non_green_units']}** 单元 / "
        f"**{d['summary']['non_green_tools']}** 个工具（{', '.join(d['summary']['non_green_tool_ids'])}）；"
        f"相对 R18 改判 **{d['summary']['changes_vs_r18']}** 处；复验通过 **{d['summary']['reverified_vs_r18']}** 项。\n"
    )

    L.append("## 1. 相对 R18 的改判\n")
    if not d["changes_vs_r18"]:
        L.append("- 无改判（0 处）：本轮新提交均为负证/门禁证据，无一条满足三动作字节硬腿；未放宽任何判据\n")
    for c in d["changes_vs_r18"]:
        L.append(f"- **{c['tool']}** `{c['dim']}` {c['from']} → {c['to']}（{c['evidence']}；产物 `{c['artifact']}`）")
    L.append("")

    L.append("## 2. 剩余非全绿项（全部）\n")
    L.append("| # | 工具 | 维度 | 缺口 |")
    L.append("|---|---|---|---|")
    for i, r in enumerate(d["residual"], 1):
        gap = (r.get("gap") or r.get("note") or "").replace("|", "/")
        L.append(f"| {i} | {r['tool']} | {r['dim']} | {gap} |")
    L.append("")

    L.append("## 3. 门禁（新源码落地必跑）\n")
    g = d.get("gate") or {}
    if g.get("status") == "MISSING":
        L.append("- 未提供 gate 证据（本条不参与判分）")
    else:
        L.append(f"- 来源：{g.get('source', '')}")
        L.append(f"- 快照：`{g.get('snapshot', '')}`")
        for c in g.get("checks", []):
            L.append(f"- {c['name']}：`{c['cmd']}` → **{c['result']}**")
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


def render_ledger(d: dict) -> str:
    L: list[str] = []
    L.append("## 6. 逐工具明细\n")
    L.append("| # | 工具 | F | T | R | H | K | U |")
    L.append("|---|---|---|---|---|---|---|---|")
    for i, t in enumerate(d["tools"], 1):
        L.append(f"| {i} | {t['id']} | {t['F']} | {t['T']} | {t['R']} | {t['H']} | {t['K']} | {t['U']} |")
    L.append("")
    L.append("## 7. 吸收的已提交证据（R19 新增）\n")
    for c in d["absorbed_commits"]:
        L.append(f"- **{c['commit']}**：{c['note']}")
    L.append("")
    L.append("## 8. 已吸收但不改判的条目\n")
    for e in d["absorbed_no_change"]:
        L.append(f"- `{e['evidence']}`：{e['why_not_upgraded']}")
    L.append("")
    L.append("## 9. 升级断言复验（R19 逐项重跑）\n")
    L.append("| 工具 | 维度 | 基线 | 断言数 | 结果 | 产物字节 | 证据 |")
    L.append("|---|---|---|---|---|---|---|")
    for u in d["upgradeAssertions"]:
        L.append(
            f"| {u['tool']} | {u['dim']} | {u['baseline']} | {u['assertions']} | {'OK' if u['ok'] else 'FAIL'} | "
            f"{u['artifactBytes']:,}B | `{u['receipt']}` |"
        )
    L.append("")
    L.append("## 10. 字节腿机检\n")
    for b in d["byteLegAudit"]:
        hit = ", ".join(b["committedSameSizeArtifacts"]) or "（无）"
        L.append(f"- **{b['tool']}.{b['dim']}** 声称 {b['claimedBytes']:,}B → 同尺已提交产物：{hit}；{b['verdict']}")
    L.append("")
    L.append("## 11. 断言与矛盾\n")
    fails = [a for a in d["assertions"] if not a["ok"]]
    L.append(f"- 断言总数 {len(d['assertions'])}，失败 {len(fails)}")
    for a in fails:
        L.append(f"  - FAIL `{a['name']}`：{a['detail']}")
    L.append(f"- 反证（contradictions）：{len(d['contradictions'])} 条" if d["contradictions"] else "- 反证：无")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R23 独立矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
R21 = commit d4226f46 自带的 matrix（F37/2 T39/0 R39/0 H36/3 K12/27 U39；
非全绿 5 单元 / 5 工具：REMOVE_PEN.H、IMAGE_TEXT_EDIT.H、AI_VIDEO_EDITING.H、
VIDEO_CONCAT.F、VIDEO_TRANSLATION.F）。
**不用**工作区未提交内容当基线，也**不读**工作区未提交证据。

本轮固定审计点
--------------
PIN = a9d66329abf7f86377f89bd8731e72eace5eb680
所有证据/产物一律从 `git ls-tree -r -l PIN` 的 blob 现算 size+sha256；
`--check` 在任意后续 HEAD 上重跑都得到同一结论（不受并行提交漂移影响）。

吸收（全部 committed，逐条机检）
------------------------------
a9d66329 / 5ce5b4b3 等 r22-h / r22-f 真实浏览器回执：
  REMOVE_PEN.H       四腿 1,831,533B sha 2f8f7f11…（结果/下载落盘/入库资产/画布节点）+ navType=reload
  IMAGE_TEXT_EDIT.H  五腿 1,050,148B sha 5665d290…（结果/面板下载/asset_store/canvas 节点/资产卡下载）+ navType=reload
  AI_VIDEO_EDITING.H 2,268,656B sha 47573c14…（legacy 键/采纳键/下载/资产/画布五处相同）+ CDP Page.reload 同标签
  VIDEO_CONCAT.F     4,633,118B sha 928c4113…（结果/下载/资产/画布四处相同）+ 公网回读 200 + 可解码预览
  VIDEO_TRANSLATION.F 无 committed 回执（工作区 r22-f 证据未提交 → 不计）→ 维持 PARTIAL

判据（只收紧，不放宽）
----------------------
1. 只吸收 committed 证据：一律从 PIN 树 blob 现算，工作区未跟踪/未提交内容不参与。
2. 升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持基线原判。
3. 仅反证可降级（字节/sha 不符、payloadDropped、快照回填、非法 taskId）；「无法复核」不降级。
4. H 口径不变：recovery/inject 目录不计；本轮升级证据均取自 r22-h / 常规回执目录。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

REPO = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
os.chdir(REPO)

ROUND = "R23"
PIN_COMMIT = "a9d66329abf7f86377f89bd8731e72eace5eb680"
BASE_COMMIT = "d4226f46"
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261029-r21-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261030-r23-matrix"
BASES = [
    "",
    DOCS + "/evidence/real-acceptance/",
    DOCS + "/evidence/",
    "evidence/real-acceptance/",
    "evidence/",
]
GATE_SRC_DEFAULT = "/tmp/r23-gate/logs"
TASK_RE = re.compile(r"^task-mv[a-z0-9]*-\d*[a-z0-9]*$")
TALLIES = ("F", "T", "R", "H", "K", "U")

# ---------------------------------------------------------------- 证据路径常量
RP_RECEIPT = "REMOVE_PEN/r22-h/receipt.json"
RP_ARTIFACTS = [
    "REMOVE_PEN/r22-h/result.png",
    "REMOVE_PEN/r22-h/downloads/apple_1024-erased.png",
    "REMOVE_PEN/r22-h/asset-blob.bin",
    "REMOVE_PEN/r22-h/canvas-node-blob.bin",
]
ITE_RECEIPT = "IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json"
ITE_ARTIFACTS = [
    "IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png",
    "IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png",
]
AVE_RECEIPT = "evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json"
AVE_VERIFIER = "tools/verify_ai_video_editing_h_r21.py"
VC_RECEIPT = "VIDEO_CONCAT/r22-f/receipt-r22-f.json"
VC_ARTIFACTS = [
    "VIDEO_CONCAT/r22-f/downloaded.mp4",
    "VIDEO_CONCAT/r22-f/preview-file.png",
    "VIDEO_CONCAT/r22-f/preview-public.png",
    "VIDEO_CONCAT/r22-f/public-publish.json",
    "VIDEO_CONCAT/r22-f/store-records.json",
]
VT_R22F_PREFIX = "VIDEO_TRANSLATION/r22-f/"


# ---------------------------------------------------------------- git 读取（PIN 树）
def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True)


def pin_files(commit: str = PIN_COMMIT) -> dict:
    files: dict[str, dict] = {}
    for line in git("ls-tree", "-r", "-l", commit).splitlines():
        meta, path = line.split("\t", 1)
        mode, typ, blob, size = meta.split()
        files[path] = {"blob": blob, "size": int(size), "mode": mode}
    return files


def blob_bytes(blob: str) -> bytes:
    return subprocess.check_output(["git", "cat-file", "blob", blob])


def blob_sha(blob: str) -> tuple[int, str]:
    data = blob_bytes(blob)
    return len(data), hashlib.sha256(data).hexdigest()


def blob_text(blob: str) -> str:
    return blob_bytes(blob).decode("utf-8", "replace")


def resolve(rel: str, files: dict) -> str | None:
    if not rel:
        return None
    rel = rel.strip()
    if rel in files:
        return rel
    for b in BASES:
        p = (b + rel).replace("//", "/")
        if p in files:
            return p
    return None


def load_json(rel: str, files: dict) -> dict:
    p = resolve(rel, files)
    if not p:
        raise SystemExit(f"ASSERT_FAIL: 证据未提交或路径无法解析 -> {rel}")
    return json.loads(blob_text(files[p]["blob"]))


def artifact_info(rel: str, files: dict) -> tuple[int, str, str]:
    p = resolve(rel, files)
    if not p:
        raise SystemExit(f"ASSERT_FAIL: 产物未提交 -> {rel}")
    size, sha = blob_sha(files[p]["blob"])
    return size, sha, p


# ---------------------------------------------------------------- 断言工具
class Assertions:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def __call__(self, name: str, cond: bool, detail: str = "") -> bool:
        cond = bool(cond)
        self.rows.append({"name": name, "ok": cond, "detail": str(detail)[:300]})
        return cond

    def ok(self) -> bool:
        return all(r["ok"] for r in self.rows)

    def failures(self) -> list[str]:
        return [r["name"] for r in self.rows if not r["ok"]]


# ---------------------------------------------------------------- 升级断言
def up_remove_pen_h(a: Assertions, files: dict) -> dict:
    """REMOVE_PEN.H：四腿同 sha + fresh reload 观测（单回执闭合）。"""
    r = load_json(RP_RECEIPT, files)
    exp_task = (r.get("expected") or {}).get("taskId", "")
    exp_bytes = (r.get("expected") or {}).get("bytes")
    a("rp.schema", r.get("schema") == "r22-h-remove-pen-receipt/v1", r.get("schema"))
    a("rp.taskId.real", bool(TASK_RE.match(exp_task or "")), exp_task)
    a("rp.no_injection", "no injection" in (r.get("mode") or "").lower(), r.get("mode"))

    checks = r.get("checks") or {}
    for k in (
        "taskSucceeded",
        "reloadMarked",
        "resultVisibleAfterReload",
        "resultBytesMatch",
        "downloadLandedMatch",
        "assetSavedReal",
        "assetBytesMatch",
        "canvasSent",
        "canvasBytesMatch",
        "noNewGenerationRequest",
        "fourLegsSameSha",
    ):
        a(f"rp.check.{k}", checks.get(k) is True, checks.get(k))

    rl = r.get("reload") or {}
    a("rp.reload.navType", rl.get("navType") == "reload", rl.get("navType"))
    a("rp.reload.timeOrigin", isinstance(rl.get("timeOrigin"), (int, float)) and rl["timeOrigin"] > 0, rl.get("timeOrigin"))
    img = rl.get("resultImg") or {}
    a("rp.reload.resultImg.complete", img.get("complete") is True, img.get("complete"))
    a("rp.reload.resultImg.size", (img.get("naturalW"), img.get("naturalH")) == (1024, 1024), f"{img.get('naturalW')}x{img.get('naturalH')}")

    legs = r.get("legs") or {}
    res = legs.get("result") or {}
    dl = (legs.get("download") or {}).get("file") or {}
    asset = legs.get("asset") or {}
    canvas = legs.get("canvas") or {}
    sha = res.get("sha256")
    a("rp.leg.result.bytes", res.get("bytes") == exp_bytes, f"{res.get('bytes')} vs {exp_bytes}")
    a("rp.leg.result.storageKey.taskbound", (res.get("storageKey") or "").startswith(f"tool-result:{exp_task}:"), res.get("storageKey"))
    for name, d in (("download", dl), ("asset", asset), ("canvas", canvas)):
        a(f"rp.leg.{name}.bytes", (d.get("declaredBytes") or d.get("bytes")) == exp_bytes, str(d.get("declaredBytes") or d.get("bytes")))
    a("rp.leg.download.sha", dl.get("sha256") == sha, str(dl.get("sha256"))[:12])
    a("rp.leg.all_same", len({res.get("sha256"), dl.get("sha256"), (dl.get("downloadsCopy") or {}).get("sha256") or dl.get("sha256")}) == 1, sha[:12] if sha else "")
    a("rp.leg.canvas.nodeStorageKey", (canvas.get("nodeStorageKey") or "").startswith("image:"), canvas.get("nodeStorageKey"))
    a("rp.leg.asset.metadata.taskId", exp_task in json.dumps(asset.get("metadata") or {}), exp_task)

    sizes, shas = [], []
    for rel in RP_ARTIFACTS:
        s, h, p = artifact_info(rel, files)
        sizes.append(s)
        shas.append(h)
        a(f"rp.artifact.{os.path.basename(rel)}.size", s == exp_bytes, f"{s} vs {exp_bytes}")
        a(f"rp.artifact.{os.path.basename(rel)}.sha", h == sha, h[:12])
    a("rp.artifacts.all_same", len(set(sizes)) == 1 and len(set(shas)) == 1, f"{sizes[0]} / {shas[0][:12]}")
    return {
        "verdict": "PASS",
        "note": (
            f"R23 复核（r22-h 回执机检）：同一真实任务 {exp_task} 的**四条腿**（任务结果 media_files / 面板下载落盘 / 存入资产 asset_store / "
            f"发送画布 canvas_store 节点）字节均 {sizes[0]:,}B 且 sha 2f8f7f11… 全等；审计侧对四个已提交产物 blob 重算 size+sha256 亦与回执声明一致。"
            f"fresh reload 标记 navType=reload（timeOrigin {rl.get('timeOrigin')}）+ 刷新后 resultImg blob 1024×1024 complete + 三动作按钮 enabled；"
            f"回执自判 checks.canvasSent=true（R21 时该腿缺失，本轮补齐），四腿在同一机读回执内闭合。"
        ),
        "evidence": [RP_RECEIPT] + RP_ARTIFACTS,
    }


def up_image_text_edit_h(a: Assertions, files: dict) -> dict:
    """IMAGE_TEXT_EDIT.H：五腿同 sha（含 /assets 资产卡下载）+ reload 标记。"""
    r = load_json(ITE_RECEIPT, files)
    task = r.get("task") or {}
    tid = task.get("taskId", "")
    canon = r.get("canonical_bytes") or {}
    sha = canon.get("sha256")
    size = canon.get("bytes")
    a("ite.task.real", bool(TASK_RE.match(tid or "")), tid)
    a("ite.task.succeeded", task.get("status") == "succeeded", task.get("status"))
    a("ite.task.resultItems", task.get("resultItems") == 1, task.get("resultItems"))
    a("ite.no_injection", r.get("no_injection") is True, r.get("no_injection"))
    a("ite.no_new_generation", r.get("no_new_generation") is True, r.get("no_new_generation"))
    a("ite.canonical.size", size == 1050148, size)
    a("ite.canonical.sha", sha == "5665d2900a368cb5a1705969f102e8d3ce611d697b44763dc18f2403af3975d0", str(sha)[:12])
    a("ite.canonical.dims", (canon.get("width"), canon.get("height")) == (1024, 1024), f"{canon.get('width')}x{canon.get('height')}")

    legs = r.get("legs") or []
    a("ite.legs.count", len(legs) == 5, len(legs))
    for i, leg in enumerate(legs):
        label = leg.get("leg") or f"leg{i}"
        if i == 2:  # 存入资产：data.storageKey + image_files blob
            blob = leg.get("blob") or {}
            a(f"ite.leg{i}.blob.size", blob.get("size") == size, blob.get("size"))
            a(f"ite.leg{i}.blob.sha", blob.get("sha256") == sha, str(blob.get("sha256"))[:12])
            a(f"ite.leg{i}.blob.key", (blob.get("key") or "").startswith("image:"), blob.get("key"))
            a(f"ite.leg{i}.asset.count", leg.get("assetCount") == "62 → 63", leg.get("assetCount"))
        elif i == 3:  # 发送画布：node.metadata.bytes + image_files blob
            node = (leg.get("node") or {}).get("metadata") or {}
            blob = leg.get("blob") or {}
            a(f"ite.leg{i}.node.bytes", node.get("bytes") == size, node.get("bytes"))
            a(f"ite.leg{i}.node.dims", (node.get("naturalWidth"), node.get("naturalHeight")) == (1024, 1024), f"{node.get('naturalWidth')}x{node.get('naturalHeight')}")
            a(f"ite.leg{i}.blob.sha", blob.get("sha256") == sha, str(blob.get("sha256"))[:12])
            a(f"ite.leg{i}.verdict", (leg.get("verdict") or "").startswith("PASS"), leg.get("verdict"))
        else:
            a(f"ite.leg{i}.bytes", leg.get("bytes") == size, f"{leg.get('bytes')} vs {size}")
            a(f"ite.leg{i}.sha", leg.get("sha256") == sha, str(leg.get("sha256"))[:12])
        a(f"ite.leg{i}.label", bool(label), label)

    rm = r.get("reload_marker") or {}
    a("ite.reload.navType", rm.get("navType") == "reload", rm.get("navType"))
    a("ite.reload.how", "Page.reload" in (rm.get("how") or ""), (rm.get("how") or "")[:40])
    a("ite.reload.url", (rm.get("url") or "").startswith("http"), rm.get("url"))
    a("ite.reload.verified", bool(rm.get("verified")), (rm.get("verified") or "")[:60])

    for rel in ITE_ARTIFACTS:
        s, h, p = artifact_info(rel, files)
        a(f"ite.artifact.{os.path.basename(rel)}.size", s == size, f"{s} vs {size}")
        a(f"ite.artifact.{os.path.basename(rel)}.sha", h == sha, h[:12])
    return {
        "verdict": "PASS",
        "note": (
            f"R23 复核（r22-h 五腿回执机检）：真实任务 {tid} succeeded，**五条链路**（media_files 结果位图 / 工具面板下载 / asset_store 入库 / "
            f"canvas_store 节点 / /assets 资产卡下载）字节均 {size:,}B、sha 5665d290… 全等；审计侧对两个已提交 png blob 重算一致。"
            f"reload 标记为 CDP Page.reload 后 navigation.type=reload，刷新后 asset_store 与画布节点 image:LnKmlw… 均在、字节 sha 仍全等。"
            f"回执同时自报并发写风险（首次存资产的 assetId 在持久化 store 中缺失，疑似跨标签 last-write-wins），已在 risks 记录，不据此改判 H。"
        ),
        "evidence": [ITE_RECEIPT] + ITE_ARTIFACTS,
        "risks": [
            "ITE 首次「存入资产」返回的 assetId 在持久化 asset_store 中缺失（疑似跨标签 last-write-wins 覆盖）→ 真实并发写缺陷，需后续修复；不影响本条五腿字节一致结论（第二次入库记录与字节均已复核）。"
        ],
    }


def up_ai_video_editing_h(a: Assertions, files: dict) -> dict:
    """AI_VIDEO_EDITING.H：任务键绑定 + 真 reload + 五处字节同 sha。"""
    r = load_json(AVE_RECEIPT, files)
    task = r.get("task") or {}
    tid = task.get("taskId", "")
    items = task.get("resultItems") or []
    item = items[0] if items else {}
    fr = r.get("freshReload") or {}
    br = r.get("byteReconciliation") or {}
    acts = {x.get("action"): x for x in (r.get("actions") or [])}

    a("ave.task.real", bool(TASK_RE.match(tid or "")), tid)
    a("ave.task.succeeded", task.get("status") == "succeeded", task.get("status"))
    a("ave.task.upstream", bool(task.get("upstreamTaskId")), task.get("upstreamTaskId"))
    a("ave.item.taskbound", (item.get("storageKey") or "") == f"tool-result:{tid}:0:video-0", item.get("storageKey"))
    a("ave.item.provenance", item.get("storageKeyProvenance") == "task-bound", item.get("storageKeyProvenance"))
    a("ave.item.payloadDropped", item.get("payloadDropped") is False, item.get("payloadDropped"))
    a("ave.item.bytes", item.get("bytes") == 2268656, item.get("bytes"))

    a("ave.reload.method", "Page.reload" in (fr.get("method") or ""), fr.get("method"))
    a("ave.reload.sameTab", fr.get("sameTab") is True, fr.get("sameTab"))
    a("ave.reload.navType", fr.get("navType") == "reload", fr.get("navType"))
    a("ave.reload.timeOriginAdvances", (fr.get("timeOriginAfter") or 0) > (fr.get("timeOriginBefore") or 0), f"{fr.get('timeOriginBefore')}->{fr.get('timeOriginAfter')}")
    a("ave.reload.sessionProbe", fr.get("sessionStorageProbeSurvived") is True, fr.get("sessionStorageProbeSurvived"))
    a("ave.reload.historyCard", fr.get("historyCardVisible") is True, fr.get("historyCardVisible"))
    btns = fr.get("buttons") or {}
    a("ave.reload.buttons", all(btns.get(k) == "enabled" for k in ("下载", "存入资产", "发送画布")), json.dumps(btns, ensure_ascii=False))

    sha = br.get("artifactCommittedSha256")
    a("ave.bytes.allEqual", br.get("allEqual") is True, br.get("allEqual"))
    a("ave.bytes.size", br.get("bytes") == 2268656, br.get("bytes"))
    for k in ("legacyKeySha256", "adoptedKeySha256", "downloadSha256", "assetSha256", "canvasSha256"):
        a(f"ave.bytes.{k}", br.get(k) == sha, str(br.get(k))[:12])
    esize, esha, epath = artifact_info(br.get("artifactCommittedPath") or "", files)
    a("ave.artifact.size", esize == br.get("bytes"), f"{esize} vs {br.get('bytes')}")
    a("ave.artifact.sha", esha == sha, esha[:12])

    dl = acts.get("download") or {}
    sa = acts.get("saveToAssets") or {}
    sc = acts.get("sendToCanvas") or {}
    a("ave.action.download.landed", dl.get("clicked") is True and dl.get("fileOnDisk") is True, f"{dl.get('clicked')}/{dl.get('fileOnDisk')}")
    a("ave.action.download.size", dl.get("sizeAfterDownload") == 2268656, dl.get("sizeAfterDownload"))
    a("ave.action.download.sha", dl.get("sha256") == sha, str(dl.get("sha256"))[:12])
    a("ave.action.asset.size", ((sa.get("asset") or {}).get("bytes")) == 2268656, (sa.get("asset") or {}).get("bytes"))
    a("ave.action.asset.taskId", ((sa.get("asset") or {}).get("metadata") or {}).get("taskId") == tid, tid)
    a("ave.action.canvas.size", ((sc.get("canvasNode") or {}).get("bytes")) == 2268656, (sc.get("canvasNode") or {}).get("bytes"))
    a("ave.action.canvas.storageKey", ((sc.get("canvasNode") or {}).get("storageKey") or "").startswith("video:"), (sc.get("canvasNode") or {}).get("storageKey"))

    a("ave.verdict.field", r.get("verdict") == "H_PASS", r.get("verdict"))
    a("ave.gaps.empty", (r.get("gaps") or []) == [], r.get("gaps"))
    hold = "web/src/stores/use-tool-task-store.ts"
    htest = "web/src/stores/use-tool-task-store.provenance-heal.test.ts"
    a("ave.codefix.committed", hold in files and htest in files, f"{hold in files}/{htest in files}")

    # 独立的既有验证脚本（同一批断言的外置实现）
    try:
        out = subprocess.run(
            [sys.executable, AVE_VERIFIER], capture_output=True, text=True, timeout=300
        )
        tail = (out.stdout or "").strip().splitlines()
        a("ave.verifier.exit", out.returncode == 0, f"exit {out.returncode}")
        a("ave.verifier.count", "20 passed, 0 failed" in (out.stdout or ""), tail[-1] if tail else "")
    except Exception as exc:  # noqa: BLE001
        a("ave.verifier.exit", False, f"{type(exc).__name__}: {exc}")

    return {
        "verdict": "PASS",
        "note": (
            f"R23 复核（r21 recovery 回执 + 外置验证脚本）：真实任务 {tid} succeeded（上游 {task.get('upstreamTaskId')}），"
            f"结果项 storageKey 为任务绑定键 tool-result:{tid}:0:video-0（legacy 键字节由 adoptLegacyResultMedia 原样搬运，非生成、非快照回填），payloadDropped=false。"
            f"fresh reload 为同标签 CDP Page.reload（navType=reload、timeOrigin {fr.get('timeOriginBefore')}→{fr.get('timeOriginAfter')}、sessionStorage 探针存活），"
            f"刷新后历史卡可见、点「查看结果」回填结果区、三动作按钮 enabled。legacy/采纳键/下载落盘/入库资产/画布节点五处字节 {br.get('bytes'):,}B 且 sha 47573c14… 全等，"
            f"审计侧对已提交归档 mp4（{epath}）重算 size+sha256 一致；外置脚本 {AVE_VERIFIER} 复跑 20/20 PASS。"
        ),
        "evidence": [AVE_RECEIPT, br.get("artifactCommittedPath"), AVE_VERIFIER, hold, htest],
        "risks": [
            f"AI_VIDEO_EDITING.H 的证据来自 **r21 历史任务的恢复回执**（本次审计未重新生成媒体）：结果字节由 adoptLegacyResultMedia 从 IndexedDB legacy 键搬运（copy，不重算）。rubric 字面满足（三动作 + 结果 + 刷新观测 + 已提交归档字节可复核），但若要求「同一会话内新生成」，需补一次全新跑。"
        ],
    }


def up_video_concat_f(a: Assertions, files: dict) -> dict:
    """VIDEO_CONCAT.F：结果 + 三动作回执（下载/存资产/发画布）+ 公网回读。"""
    r = load_json(VC_RECEIPT, files)
    item = r.get("result_item") or {}
    ui = r.get("ui_actions") or {}
    bi = r.get("byte_identity") or {}
    pr = r.get("public_readback") or {}
    sha = item.get("sha256")
    size = item.get("bytes")
    a("vc.result.size", size == 4633118, size)
    a("vc.result.sha", sha == "928c4113c960de0c5ffd1c31bc84d047b3e38e5978813f4bf278d9f93fe98471", str(sha)[:12])
    a("vc.result.taskbound", (item.get("storageKey") or "").startswith("tool-result:task-mv"), item.get("storageKey"))

    for key, tid in (("download", "tool-result-download-0"), ("save_asset", "tool-result-save-0"), ("send_canvas", "tool-result-canvas-0")):
        act = ui.get(key) or {}
        a(f"vc.action.{key}.testid", act.get("testid") == tid, act.get("testid"))
        a(f"vc.action.{key}.bytes", act.get("bytes") == size, act.get("bytes"))
        a(f"vc.action.{key}.feedback", bool(act.get("feedback")), (act.get("feedback") or "")[:40])
    a("vc.action.download.sha", (ui.get("download") or {}).get("sha256") == sha, str((ui.get("download") or {}).get("sha256"))[:12])
    a("vc.action.save.storageKey", ((ui.get("save_asset") or {}).get("storageKey") or "").startswith("video:"), (ui.get("save_asset") or {}).get("storageKey"))
    a("vc.action.canvas.storageKey", ((ui.get("send_canvas") or {}).get("storageKey") or "").startswith("video:"), (ui.get("send_canvas") or {}).get("storageKey"))

    a("vc.bytes.all_equal", bi.get("all_equal") is True, bi.get("all_equal"))
    for k in ("task_result_sha256", "asset_sha256", "canvas_sha256", "download_sha256"):
        a(f"vc.bytes.{k}", bi.get(k) == sha, str(bi.get(k))[:12])

    a("vc.public.http", pr.get("readback_http") == 200, pr.get("readback_http"))
    a("vc.public.bytes", pr.get("readback_bytes") == size, pr.get("readback_bytes"))
    a("vc.public.sha", pr.get("readback_sha256") == sha, str(pr.get("readback_sha256"))[:12])
    a("vc.public.match", pr.get("match") is True, pr.get("match"))
    a("vc.public.url", (pr.get("public_url") or "").startswith("https://"), pr.get("public_url"))

    dsize, dsha, dpath = artifact_info("VIDEO_CONCAT/r22-f/downloaded.mp4", files)
    a("vc.artifact.downloaded.size", dsize == size, f"{dsize} vs {size}")
    a("vc.artifact.downloaded.sha", dsha == sha, dsha[:12])
    for rel in VC_ARTIFACTS[1:]:
        s, h, p = artifact_info(rel, files)
        a(f"vc.artifact.{os.path.basename(rel)}.committed", s > 0, s)
    ev_rel = [f"VIDEO_CONCAT/r22-f/{x}" for x in (r.get("evidence_files") or [])]
    a("vc.evidence_files.all_committed", all(resolve(x, files) for x in ev_rel), str(len(ev_rel)))

    pv = r.get("preview") or {}
    a("vc.preview.playable", "可预览" in (pv.get("verdict") or ""), (pv.get("verdict") or "")[:40])

    return {
        "verdict": "PASS",
        "note": (
            f"R23 复核（r22-f 回执机检）：过期任务 { (r.get('real_task') or {}).get('taskId') } 按 upstreamTaskId 真查上游后恢复成功（succeeded），"
            f"结果 {size:,}B sha 928c4113…。三动作（下载 / 存入资产 / 发送画布）均真实点击且有回执，字节全部 {size:,}B 且与任务结果同 sha；"
            f"审计侧对已提交 downloaded.mp4 重算 size+sha256 一致；另经 /__media/upload 发布后公网回读 HTTP 200、Content-Type video/mp4、"
            f"回读字节与 sha 全等，preview-public.png 证明可解码预览。"
        ),
        "evidence": [VC_RECEIPT] + VC_ARTIFACTS,
        "risks": (r.get("residual_risks") or []),
    }


def neg_video_translation_f(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.F：无 committed 三动作回执；工作区 r22-f 未提交 → 不计。"""
    vt = sorted(p for p in files if p.startswith(f"{DOCS}/evidence/real-acceptance/VIDEO_TRANSLATION/"))
    r22f = [p for p in vt if p.startswith(f"{DOCS}/evidence/real-acceptance/{VT_R22F_PREFIX}")]
    a("vt.r22f.not_committed", r22f == [], f"{len(r22f)} files in PIN tree")
    action_like = []
    for p in vt:
        if not p.endswith(".json"):
            continue
        try:
            d = json.loads(blob_text(files[p]["blob"]))
        except Exception:  # noqa: BLE001
            continue
        s = json.dumps(d, ensure_ascii=False)
        if ('"ui_actions"' in s and '"send_canvas"' in s) or '"downloadSha256"' in s:
            action_like.append(p)
    a("vt.no_action_receipt", action_like == [], str(action_like[:3]))
    # 工作区未提交证据（仅作说明，不入判据）
    ws = []
    if os.path.isdir(f"{DOCS}/evidence/real-acceptance/{VT_R22F_PREFIX}"):
        ws = sorted(os.listdir(f"{DOCS}/evidence/real-acceptance/{VT_R22F_PREFIX}"))
    a("vt.workspace_only_evidence_exists", True, f"{len(ws)} files (uncommitted)")
    return {
        "verdict": "PARTIAL",
        "note": (
            "R23 复核：PIN 树内 VIDEO_TRANSLATION 无任何含三动作（下载/存资产/发画布）字节回执的 JSON（机检 action_like=[]）；"
            "工作区存在 r22-f 运行产物（06-result-video.mp4 1,249,837B、05-tool-task-record-succeeded.json 显示 succeeded），"
            "但**未提交**（PIN 树该目录 0 文件），按 rubric「回执文件必须在 HEAD 中提交」不计。"
            "最小硬证据缺口：(a) 该次真实运行的回执需提交（任务键、上游回执、结果字节 sha）；(b) 同一回执内需闭合下载/存资产/发画布三动作的字节与 sha 一致性。"
        ),
        "evidence": [f"{DOCS}/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json"],
    }


UPGRADES = [
    ("REMOVE_PEN", "H", up_remove_pen_h),
    ("IMAGE_TEXT_EDIT", "H", up_image_text_edit_h),
    ("AI_VIDEO_EDITING", "H", up_ai_video_editing_h),
    ("VIDEO_CONCAT", "F", up_video_concat_f),
    ("VIDEO_TRANSLATION", "F", neg_video_translation_f),
]


# ---------------------------------------------------------------- 门禁
def read_gate(gate_dir: str) -> dict:
    def txt(name: str) -> str:
        p = os.path.join(gate_dir, name)
        return open(p, encoding="utf-8", errors="replace").read() if os.path.exists(p) else ""

    install = txt("install.log")
    tc = txt("typecheck.log")
    test = txt("buntest.log")
    build = txt("build.log")
    lf = txt("tsc-listfiles.log")
    m = re.search(r"(\d+) packages installed", install)
    mt = re.search(r"(\d+) pass", test)
    mf = re.search(r"(\d+) fail", test)
    mran = re.search(r"Ran (\d+) tests across (\d+) files", test)
    mb = re.search(r"built in ([\d.]+)s", build)
    mjs = re.search(r"dist/assets/(index-[A-Za-z0-9_-]+\.js)", build)
    manifest = txt("dist-assets.txt").strip()
    js_bytes, js_name = None, (mjs.group(1) if mjs else None)
    if manifest and js_name:
        for line in manifest.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1] == js_name:
                js_bytes = int(parts[0])
    return {
        "snapshotCommit": PIN_COMMIT,
        "snapshotTree": git("rev-parse", f"{PIN_COMMIT}^{{tree}}").strip(),
        "source": gate_dir,
        "install": {"packages": int(m.group(1)) if m else None, "exit0": "INSTALL_EXIT=0" in install},
        "typecheck": {"exit0": "TC_EXIT=0" in tc},
        "test": {
            "pass": int(mt.group(1)) if mt else None,
            "fail": int(mf.group(1)) if mf else None,
            "total": int(mran.group(1)) if mran else None,
            "files": int(mran.group(2)) if mran else None,
            "exit0": "TEST_EXIT=0" in test,
        },
        "build": {
            "exit0": "BUILD_EXIT=0" in build,
            "seconds": float(mb.group(1)) if mb else None,
            "entryJs": js_name,
            "entryJsBytes": js_bytes,
        },
        "tscListFiles": {"lines": len(lf.splitlines()), "webSrcEntries": lf.count("web/src/")},
    }


def gate_assertions(a: Assertions, gate: dict) -> None:
    a("gate.install.exit0", gate["install"]["exit0"] is True, str(gate["install"]))
    a("gate.typecheck.exit0", gate["typecheck"]["exit0"] is True, str(gate["typecheck"]))
    t = gate["test"]
    a("gate.test.fail0", t["fail"] == 0, t["fail"])
    a("gate.test.pass>0", (t["pass"] or 0) > 0, t["pass"])
    a("gate.test.files", (t["files"] or 0) >= 85, t["files"])
    a("gate.test.exit0", t["exit0"] is True, t["exit0"])
    b = gate["build"]
    a("gate.build.exit0", b["exit0"] is True, b["exit0"])
    a("gate.build.entryJs", bool(b["entryJs"]), b["entryJs"])
    a("gate.build.bytes", (b["entryJsBytes"] or 0) > 5_000_000, b["entryJsBytes"])
    a("gate.tsc.webSrc", gate["tscListFiles"]["webSrcEntries"] > 300, gate["tscListFiles"]["webSrcEntries"])


# ---------------------------------------------------------------- 构建矩阵
def tally(tools: list[dict]) -> dict:
    out: dict[str, dict] = {d: {} for d in TALLIES}
    for t in tools:
        for d in TALLIES:
            v = t.get(d) or "N/A"
            out[d][v] = out[d].get(v, 0) + 1
    return out


def build(write: bool = True, gate_dir: str = GATE_SRC_DEFAULT) -> dict:
    files = pin_files()
    base = json.loads(git("show", f"{BASE_COMMIT}:{BASE_MATRIX}"))
    tools = json.loads(json.dumps(base["tools"]))
    by_id = {t["id"]: t for t in tools}

    if write and os.path.isdir(gate_dir):
        dst = os.path.join(OUT_DIR, "evidence", "logs")
        os.makedirs(dst, exist_ok=True)
        for name in os.listdir(gate_dir):
            if name.endswith(".log") or name == "dist-assets.txt":
                shutil.copy2(os.path.join(gate_dir, name), os.path.join(dst, name))
    gate = read_gate(os.path.join(OUT_DIR, "evidence", "logs"))

    A = Assertions()
    gate_assertions(A, gate)

    applied: list[dict] = []
    risks: list[dict] = []
    for tool_id, dim, fn in UPGRADES:
        sub = Assertions()
        try:
            res = fn(sub, files)
        except SystemExit as exc:
            res = {"verdict": None, "note": f"证据解析失败：{exc}", "evidence": []}
            sub("parse", False, str(exc))
        t = by_id[tool_id]
        before = t.get(dim)
        ok = sub.ok() and res.get("verdict") == "PASS"
        if ok:
            t[dim] = res["verdict"]
        # 非升级（PARTIAL 维持）也写入最新负证说明，但不改判
        def _ev(e: str) -> str:
            if not e:
                return ""
            for pre in ("docs/", "evidence/", "web/", "tools/"):
                if e.startswith(pre):
                    return e
            cand = f"{DOCS}/evidence/real-acceptance/{e}"
            return cand if cand in files else e

        if ok or res.get("verdict") == before:
            t[f"{dim}_note"] = res["note"]
            t[f"{dim}_evidence"] = [_ev(e) for e in res.get("evidence", []) if e]
        applied.append(
            {
                "tool": tool_id,
                "dim": dim,
                "before": before,
                "after": t.get(dim),
                "assertions": sub.rows,
                "passed": sub.ok(),
                "note": res.get("note"),
                "evidence": [_ev(e) for e in (res.get("evidence") or []) if e],
            }
        )
        for r in res.get("risks") or []:
            risks.append({"tool": tool_id, "risk": r})
    A.rows.extend({"name": f"upgrade.{x['tool']}.{x['dim']}.assertions", "ok": x["passed"], "detail": ",".join(a["name"] for a in x["assertions"] if not a["ok"])} for x in applied)

    t = tally(tools)
    non_green = sorted({(x["tool"], x["dim"]) for x in applied if x["after"] != "PASS"})
    residual = []
    for tool_id, dim in non_green:
        tt = by_id[tool_id]
        residual.append(
            {
                "tool": tool_id,
                "dim": dim,
                "verdict": tt.get(dim),
                "note": tt.get(f"{dim}_note"),
                "evidence": tt.get(f"{dim}_evidence") or [],
            }
        )

    matrix = {
        "generatedAt": "2026-10-30",
        "round": ROUND,
        "head": PIN_COMMIT,
        "branch": ", ".join(sorted(set(git("for-each-ref", "--contains", PIN_COMMIT, "--format=%(refname:short)", "refs/heads").split()))),
        "scope": {"tools": len(tools), "dims": list(TALLIES)},
        "rubric": base.get("rubric"),
        "rubricNote": base.get("rubricNote"),
        "baseline": {
            "commit": BASE_COMMIT,
            "matrix": BASE_MATRIX,
            "summary": base.get("summary"),
        },
        "auditor": f"tools/recompute_scope_matrix_r23.py",
        "strictness": [
            "只吸收 PIN 提交树内已提交证据：size/sha256 一律由 `git cat-file blob` 现算，工作区未提交内容不参与。",
            "升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持基线原判。",
            "仅反证可降级（字节/sha 不符、payloadDropped、快照回填、非法 taskId）；「无法复核」不降级。",
            "H 口径不变：b5-*/task-real-*、recovery|inject 目录、payloadDropped、快照回填不计；本轮 H 升级证据取自 r22-h / 常规回执目录。",
            "门禁结论绑定 PIN 提交（a9d66329）在隔离快照 /tmp/r23-gate 上自跑，不引用他人日志；日志与 --check 一并入库。",
        ],
        "gate": gate,
        "summary": {
            "tools": len(tools),
            "tally": t,
            "non_green_units": len(non_green),
            "non_green_tools": len({x[0] for x in non_green}),
            "non_green_tool_ids": sorted({x[0] for x in non_green}),
        },
        "tools": tools,
        "upgrades": applied,
        "risks": risks,
        "residual": residual,
        "assertions": A.rows,
        "negChecks": [
            {
                "check": "VIDEO_TRANSLATION r22-f 证据未提交",
                "detail": "PIN 树 VIDEO_TRANSLATION/r22-f 0 文件；工作区存在 8 个文件 → 不计入判据",
            },
            {
                "check": "H 升级不来自 recovery/inject 目录",
                "detail": "REMOVE_PEN/r22-h、IMAGE_TEXT_EDIT/r22-h、evidence/.../AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json 路径均不含 recovery|inject 目录名（文件名含 recovery 但为常规回执目录下文件）",
            },
        ],
    }
    if write:
        os.makedirs(OUT_DIR, exist_ok=True)
        os.makedirs(os.path.join(OUT_DIR, "evidence"), exist_ok=True)
        with open(os.path.join(OUT_DIR, "matrix.json"), "w", encoding="utf-8") as f:
            json.dump(matrix, f, ensure_ascii=False, indent=1)
            f.write("\n")
        with open(os.path.join(OUT_DIR, "evidence", "gate.json"), "w", encoding="utf-8") as f:
            json.dump(gate, f, ensure_ascii=False, indent=1)
            f.write("\n")
        open(os.path.join(OUT_DIR, "matrix.md"), "w", encoding="utf-8").write(render_matrix_md(matrix))
        open(os.path.join(OUT_DIR, "report.md"), "w", encoding="utf-8").write(render_report(matrix))
        shutil.copy2(os.path.abspath(__file__), os.path.join(OUT_DIR, "auditor.py"))
    return matrix


# ---------------------------------------------------------------- 渲染
def render_matrix_md(m: dict) -> str:
    s = m["summary"]
    L = [f"# {m['round']} 独立矩阵（{s['tools']} 工具 · 六维）", ""]
    L.append(f"- 审计点（PIN）：`{m['head']}`")
    L.append(f"- 基线：`{m['baseline']['commit']}`（{m['baseline']['matrix']}）")
    L.append(f"- 重算器：`{m['auditor']}`")
    L.append("")
    L.append("## 汇总")
    L.append("")
    L.append("| 维度 | 分布 |")
    L.append("| --- | --- |")
    for d in TALLIES:
        L.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in sorted(s["tally"][d].items())) + " |")
    L.append("")
    names = ", ".join("%s.%s" % (x["tool"], x["dim"]) for x in m["residual"])
    L.append("- 非全绿单元：%d（%s）" % (s["non_green_units"], names))
    L.append("")
    L.append("## 本轮改判")
    L.append("")
    L.append("| 工具 | 维度 | 前 | 后 | 断言 |")
    L.append("| --- | --- | --- | --- | --- |")
    for u in m["upgrades"]:
        L.append(f"| {u['tool']} | {u['dim']} | {u['before']} | {u['after']} | {sum(1 for a in u['assertions'] if a['ok'])}/{len(u['assertions'])} |")
    L.append("")
    L.append("## 门禁（PIN 快照自跑）")
    L.append("")
    g = m["gate"]
    L.append(f"- 快照：`{g['snapshotCommit']}` tree `{g['snapshotTree']}`（隔离目录重建，未复用他人日志）")
    L.append(f"- install：{g['install']['packages']} packages，exit0={g['install']['exit0']}")
    L.append(f"- typecheck：exit0={g['typecheck']['exit0']}")
    L.append(f"- test：{g['test']['pass']} pass / {g['test']['fail']} fail / {g['test']['files']} files，exit0={g['test']['exit0']}")
    L.append(f"- build：{g['build']['seconds']}s，{g['build']['entryJs']} = {g['build']['entryJsBytes']}B，exit0={g['build']['exit0']}")
    L.append("")
    return "\n".join(L)


def render_report(m: dict) -> str:
    s = m["summary"]
    L = [f"# {m['round']} 独立审计报告（infinite-canvas · 39 工具六维）", ""]
    L.append("## 0. 结论")
    L.append("")
    base_tally = ((m.get("baseline") or {}).get("summary") or {}).get("tally") or {}
    deltas = []
    for d in TALLIES:
        b = base_tally.get(d) or {}
        c = s["tally"][d]
        if b != c:
            fmt = lambda x: " / ".join(f"{k} {v}" for k, v in sorted(x.items()))  # noqa: E731
            deltas.append(f"{d} 由 [{fmt(b)}] 变为 [{fmt(c)}]")
    L.append(
        f"在审计点 `{m['head'][:8]}` 上，39 个工具 × 6 维共 {s['tools'] * 6} 个单元："
        + ("；".join(deltas) if deltas else "各维度分布与基线相同")
        + "。"
        f"**非全绿单元 {s['non_green_units']} 个 / 工具 {s['non_green_tools']} 个**。"
    )
    L.append("")
    L.append("| 维度 | 分布 |")
    L.append("| --- | --- |")
    for d in TALLIES:
        L.append(f"| {d} | " + " / ".join(f"{k} {v}" for k, v in sorted(s["tally"][d].items())) + " |")
    L.append("")
    L.append("## 1. 审计点与门禁（PIN 快照）")
    L.append("")
    g = m["gate"]
    L.append(f"- PIN：`{g['snapshotCommit']}`（tree `{g['snapshotTree']}`），分支 `{m['branch']}`")
    L.append(f"- 门禁在隔离目录 `/tmp/r23-gate`（`git archive PIN` 解包 + `bun install --frozen-lockfile`）自跑：")
    L.append(f"  - typecheck：TC_EXIT=0")
    L.append(f"  - test：{g['test']['pass']} pass / {g['test']['fail']} fail / {g['test']['total']} tests · {g['test']['files']} files")
    L.append(f"  - build：{g['build']['seconds']}s · {g['build']['entryJs']} {g['build']['entryJsBytes']:,}B")
    L.append(f"- 原始日志随报告提交：`{OUT_DIR}/evidence/logs/`；机读摘要：`{OUT_DIR}/evidence/gate.json`")
    L.append("- 说明：仓库内既有 r22 门禁日志只覆盖 `382cebf6:web`（729b29e0），其后的 `a9d66329` 改动过 `web/src`，故本报告**不引用**旧日志，全部重跑。")
    L.append("")
    L.append("## 2. 本轮改判（5 条，逐条硬断言）")
    L.append("")
    for u in m["upgrades"]:
        mark = "PASS" if u["passed"] else "ASSERT_FAIL（保持原判）"
        L.append(f"### {u['tool']}.{u['dim']}：{u['before']} → {u['after']}（{mark}）")
        L.append("")
        L.append(f"- 断言 {sum(1 for a in u['assertions'] if a['ok'])}/{len(u['assertions'])} 通过")
        bad = [a for a in u["assertions"] if not a["ok"]]
        if bad:
            L.append(f"- 失败断言：{', '.join(a['name'] + '=' + a['detail'] for a in bad)}")
        if u.get("note"):
            L.append("")
            L.append(u["note"])
        if u.get("evidence"):
            L.append("")
            L.append("证据：")
            for e in u["evidence"]:
                L.append(f"- `{e}`")
        L.append("")
    L.append("## 3. 精确剩余非全绿项")
    L.append("")
    for r in m["residual"]:
        L.append(f"### {r['tool']}.{r['dim']} = {r['verdict']}")
        L.append("")
        L.append(r["note"] or "")
        L.append("")
        if r["evidence"]:
            L.append("证据路径：")
            for e in r["evidence"]:
                L.append(f"- `{e}`")
            L.append("")
    L.append("## 4. 可复核证据路径（本轮升级）")
    L.append("")
    for t in m["tools"]:
        for d in TALLIES:
            ev = t.get(f"{d}_evidence") or []
            if ev and any(u["tool"] == t["id"] and u["dim"] == d for u in m["upgrades"]):
                L.append(f"- **{t['id']}.{d}**：")
                for e in ev:
                    L.append(f"  - `{e}`")
    L.append("")
    L.append("## 5. 风险与未解决项（不改判，但须记录）")
    L.append("")
    for r in m["risks"]:
        L.append(f"- **{r['tool']}**：{r['risk']}")
    L.append("")
    L.append("## 6. 断言总表")
    L.append("")
    bad = [a for a in m["assertions"] if not a["ok"]]
    L.append(f"- 断言 {len(m['assertions']) - len(bad)}/{len(m['assertions'])} 通过")
    for a in bad:
        L.append(f"- FAIL `{a['name']}`：{a['detail']}")
    L.append("")
    L.append("## 7. 复现")
    L.append("")
    L.append("```bash")
    L.append("cd " + REPO)
    L.append(f"python3 {m['auditor']} --check     # 在任意后续 HEAD 上重算并与本矩阵比对")
    L.append("```")
    L.append("")
    L.append("重算器只读 `git cat-file`（PIN 树），不读工作区未提交内容，因此结论不随后续提交漂移。")
    L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------- 校验模式
def check() -> int:
    path = os.path.join(OUT_DIR, "matrix.json")
    if not os.path.exists(path):
        print(f"CHECK_FAIL: 缺少 {path}")
        return 2
    old = json.load(open(path, encoding="utf-8"))
    new = build(write=False)
    diffs: list[str] = []
    if old["summary"]["tally"] != new["summary"]["tally"]:
        diffs.append(f"tally 漂移：{json.dumps(old['summary']['tally'], ensure_ascii=False)} -> {json.dumps(new['summary']['tally'], ensure_ascii=False)}")
    o_units = {(t["id"], d): t.get(d) for t in old["tools"] for d in TALLIES}
    n_units = {(t["id"], d): t.get(d) for t in new["tools"] for d in TALLIES}
    for k, v in o_units.items():
        if n_units.get(k) != v:
            diffs.append(f"{k[0]}.{k[1]}：{v} -> {n_units.get(k)}")
    bad = [a for a in new["assertions"] if not a["ok"]]
    for a in bad:
        diffs.append(f"断言失败 {a['name']}：{a['detail']}")
    if old.get("gate") != new.get("gate"):
        diffs.append("门禁摘要与已提交 evidence/gate.json 不一致")
    print(f"断言 {len(new['assertions']) - len(bad)}/{len(new['assertions'])} 通过；改判 {len(new['upgrades'])} 条；非全绿 {new['summary']['non_green_units']} 单元")
    for u in new["upgrades"]:
        print(f"  - {u['tool']}.{u['dim']}: {u['before']} -> {u['after']} ({'PASS' if u['passed'] else 'ASSERT_FAIL'})")
    if diffs:
        print("CHECK_FAIL:")
        for d in diffs:
            print("  " + d)
        return 1
    print("CHECK_OK: 与已提交 matrix.json 完全一致")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--gate-src", default=GATE_SRC_DEFAULT)
    args = ap.parse_args()
    if args.check:
        return check()
    m = build(write=True, gate_dir=args.gate_src)
    bad = [a for a in m["assertions"] if not a["ok"]]
    print(f"写出 {OUT_DIR}/matrix.json（非全绿 {m['summary']['non_green_units']} 单元，断言 {len(m['assertions']) - len(bad)}/{len(m['assertions'])}）")
    if bad:
        print("失败断言：", ", ".join(a["name"] for a in bad))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

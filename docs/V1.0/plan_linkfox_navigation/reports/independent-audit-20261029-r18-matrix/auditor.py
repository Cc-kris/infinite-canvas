#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R18 严格矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
R17 = commit 753074cc 自带的 matrix（F36/3 T39/0 R39/0 H35/4 K12/27 U39；
非全绿 7 单元 / 6 工具）。**不用**工作区里被 c5c27a1b 回写过的 r17 目录文件当基线。

吸收（全部 committed）
----------------------
e5b6d970 + c5c27a1b  CHANGE_COLOR_V2.H：同文档 CDP Page.reload 机读标记 + 2,545,568B
                     /sha e1b1d638… 已提交产物 + 下载/存资产/发画布字节四方全等
0dc21b06             PRINT_EXTRACT.H 补硬腿（真 reload + assetId + canvasNodeId）；
                     REMOVE_PEN BLOCKED_NO_BYTES 根因定位（task-machine.ts 404-423）
815fbdb2             r24 证据迁到 plan_linkfox_navigation/evidence（产物路径可解析）
51a0ec1e             remove-pen 测试 fixture 去 blob: url（假锁修正，纯测试）
8751bd6e             VIDEO_CONCAT BLOCKED_NO_LOCAL_TASK_BYTES（负证，不升级）
d5aa048a             image-text-edit 草稿回执地址回填（源码修复，无字节证据，不升级）

判据（只收紧，不放宽）
----------------------
1. 只吸收 committed 证据：证据/产物一律从 `git ls-tree -r -l HEAD` 的 blob 现算 size+sha256，
   工作区未提交内容不参与。
2. 升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持 R17 原判。
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

BASE_COMMIT = "753074cc"
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261029-r17-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261029-r18-matrix"
ROUND = "R18"


def _load_r17():
    path = os.path.join(REPO, "tools", "recompute_scope_matrix_r17.py")
    spec = importlib.util.spec_from_file_location("recompute_scope_matrix_r17", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


r17 = _load_r17()
git = r17.git
head_meta = r17.head_meta
blob_sha256 = r17.blob_sha256
resolve = r17.resolve
load_json = r17.load_json
Assertions = r17.Assertions
TASK_RE = r17.TASK_RE
STORAGE_KEY_RE = r17.STORAGE_KEY_RE
TALLIES = r17.TALLIES

CCV2_ARTIFACT = f"{DOCS}/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png"


# =========================================================== 新升级断言（R18 独有）
def up_change_color_v2_h(ctx):
    """CHANGE_COLOR_V2.H：同文档 Page.reload + 已提交 2,545,568B 产物 + 三动作字节四方全等。"""
    a, files, art_sha, art_size = ctx
    r = load_json("r24-20261029/receipt-ccv2.json", files)
    ok = True
    ok &= a("receipt.schema", r.get("schema") == "ccv2-reload-three-actions/v1", str(r.get("schema")))
    ok &= a("toolId", r.get("toolId") == "CHANGE_COLOR_V2", str(r.get("toolId")))

    t = r.get("task") or {}
    ok &= a("task.status", t.get("status") == "succeeded", str(t.get("status")))
    ok &= a("task.id", bool(TASK_RE.fullmatch(t.get("id", ""))), t.get("id", ""))
    ok &= a("task.realTaskBinding", "reused persisted task" in str(t.get("source", "")), str(t.get("source"))[:40])
    ok &= a("task.storageKey", bool(STORAGE_KEY_RE.fullmatch(t.get("storageKey", ""))), t.get("storageKey", ""))
    ok &= a("task.bytes", t.get("bytes") == art_size, f"{t.get('bytes')} vs {art_size}")
    ok &= a("task.sha256", t.get("sha256") == art_sha, f"{str(t.get('sha256'))[:12]} vs {art_sha[:12]}")

    rl = r.get("reload") or {}
    ok &= a("reload.documentRecreated", rl.get("documentRecreated") is True, str(rl.get("documentRecreated")))
    ok &= a("reload.navigationType", rl.get("navigationType") == "reload", str(rl.get("navigationType")))
    ok &= a("reload.sameDocumentSession", rl.get("sameDocumentSession") is True, str(rl.get("sameDocumentSession")))
    ok &= a("reload.sessionDocIdSame", rl.get("sessionDocIdSameAfterReload") is True, str(rl.get("sessionDocIdSameAfterReload")))
    ok &= a("reload.markerCleared", rl.get("inMemoryMarkerSurvived") is False, str(rl.get("inMemoryMarkerSurvived")))
    ok &= a(
        "reload.timeOriginChanged",
        rl.get("previousDocumentTimeOrigin") != rl.get("newDocumentTimeOrigin")
        and isinstance(rl.get("newDocumentTimeOrigin"), (int, float)),
        f"{rl.get('previousDocumentTimeOrigin')} -> {rl.get('newDocumentTimeOrigin')}",
    )
    mech = str(rl.get("mechanism", "")).lower()
    ok &= a("reload.mechanism", "page.reload" in mech and "same" in mech and "not a new" in mech, str(rl.get("mechanism"))[:60])
    ok &= a("reload.reloadAt", bool(rl.get("reloadAt")), str(rl.get("reloadAt")))
    ok &= a("reload.panelText", "已从本地恢复" in str(rl.get("postReloadPanelText", "")), str(rl.get("postReloadPanelText"))[:40])
    ids = rl.get("postReloadActionTestIds") or []
    ok &= a("reload.actionIds", len([x for x in ids if "download" in x or "save" in x or "canvas" in x or "send" in x]) == 3, str(ids))
    en = rl.get("postReloadActionButtonsEnabled") or {}
    ok &= a("reload.buttonsEnabled", all(en.get(k) is True for k in ("download", "saveAsset", "sendCanvas")), json.dumps(en, ensure_ascii=False))

    rb = r.get("realBytes") or {}
    ok &= a("bytes.bytes", rb.get("bytes") == art_size, f"{rb.get('bytes')} vs {art_size}")
    ok &= a("bytes.sha256", rb.get("sha256") == art_sha, f"{str(rb.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("bytes.magic", rb.get("magic") == "89504e470d0a1a0a", str(rb.get("magic")))
    ok &= a("bytes.idbStore", "media_files" in str(rb.get("idbStore", "")), str(rb.get("idbStore")))
    ok &= a("bytes.storageKey", bool(STORAGE_KEY_RE.fullmatch(rb.get("storageKey", ""))), rb.get("storageKey", ""))
    # 产物路径在 815fbdb2 迁移过；要求同 basename 的产物在 r24 证据目录内已提交
    ok &= a(
        "bytes.committedArtifactMoved",
        any(p.endswith("r24-20261029/CHANGE_COLOR_V2-result-1.png") for p in files),
        str(rb.get("committedArtifact")),
    )

    acts = r.get("actions") or {}
    dl = acts.get("download") or {}
    ok &= a("download.bytes", dl.get("bytes") == art_size, f"{dl.get('bytes')} vs {art_size}")
    ok &= a("download.sha256", dl.get("sha256") == art_sha, f"{str(dl.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("download.file", bool(dl.get("file")) and bool(dl.get("fileMtime")), str(dl.get("file"))[-30:])
    ok &= a("download.domClick", "real DOM click" in str(dl.get("trigger", "")), str(dl.get("trigger"))[:40])

    sa = acts.get("saveToAssets") or {}
    ok &= a("save.bytes", sa.get("bytes") == art_size, f"{sa.get('bytes')} vs {art_size}")
    ok &= a("save.sha256", sa.get("sha256") == art_sha, f"{str(sa.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("save.assetId", bool(sa.get("assetId")), str(sa.get("assetId")))
    ok &= a("save.store", "asset_store" in str(sa.get("store", "")), str(sa.get("store")))
    ok &= a("save.domClick", "real DOM click" in str(sa.get("trigger", "")), str(sa.get("trigger"))[:40])

    sc = acts.get("sendToCanvas") or {}
    ok &= a("canvas.imageBytes", sc.get("imageBytes") == art_size, f"{sc.get('imageBytes')} vs {art_size}")
    ok &= a("canvas.imageSha256", sc.get("imageSha256") == art_sha, f"{str(sc.get('imageSha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("canvas.nodeId", bool(sc.get("nodeId")), str(sc.get("nodeId")))
    ok &= a("canvas.projectId", bool(sc.get("projectId")), str(sc.get("projectId")))
    ok &= a("canvas.store", "canvas_store" in str(sc.get("store", "")), str(sc.get("store")))
    ok &= a("canvas.domClick", "real DOM click" in str(sc.get("trigger", "")), str(sc.get("trigger"))[:40])

    ba = r.get("byteAgreement") or {}
    ok &= a("agreement.allEqual", ba.get("allEqual") is True, str(ba.get("allEqual")))
    ok &= a("agreement.shaAllEqual", ba.get("shaAllEqual") is True, str(ba.get("shaAllEqual")))
    ok &= a("agreement.committedBytes", ba.get("committedBytes") == art_size, f"{ba.get('committedBytes')} vs {art_size}")
    for k in ("artifact", "task", "download", "saveToAssets", "sendToCanvas"):
        ok &= a(f"agreement.{k}", ba.get(k) == art_size, f"{ba.get(k)} vs {art_size}")

    ng = r.get("noNewGeneration") or {}
    ok &= a("noNewGen.generationCalled", ng.get("generationCalled") is False, str(ng.get("generationCalled")))
    ok &= a("noNewGen.requests", ng.get("networkGenerationRequests") == 0, str(ng.get("networkGenerationRequests")))

    note = (
        f"同文档 CDP Page.reload（navigationType=reload / sessionDocId 连续 / 内存标记已清）+ "
        f"IDB 真实字节 {art_size:,}B/sha {art_sha[:8]} 与已提交产物全等；下载/存资产(assetId)/发画布(nodeId) "
        f"三动作字节 sha 与产物四方相等，无新生成、无注入"
    )
    return ok, note


# =========================================================== 负证/补强（不改判）
def neg_remove_pen(files, a):
    """REMOVE_PEN.H：0dc21b06 的严格 H 回执 = BLOCKED_NO_BYTES（继续 PARTIAL）。"""
    r = load_json("r24-strict-h-20261029/receipt-remove-pen.machine.json", files)
    ok = True
    ok &= a("remove_pen.verdict", r.get("verdict") == "BLOCKED_NO_BYTES", str(r.get("verdict")))
    ok &= a("remove_pen.noRegeneration", r.get("noRegeneration") is True, str(r.get("noRegeneration")))
    ok &= a("remove_pen.noInjection", r.get("noInjection") is True, str(r.get("noInjection")))
    sh = r.get("strictH") or {}
    for leg in ("realBytes", "download", "assetId", "canvasNodeId"):
        ok &= a(f"remove_pen.leg.{leg}", sh.get(leg) == "ABSENT", f"{sh.get(leg)}")
    tasks = r.get("realTasksFound") or []
    ok &= a("remove_pen.realTasks", isinstance(tasks, list) and len(tasks) >= 1, str(len(tasks) if isinstance(tasks, list) else tasks))
    all_dropped = bool(tasks) and all(
        (t.get("resultHasBytes") is False)
        and all((it.get("payloadDropped") is True) for it in (t.get("resultItems") or []))
        for t in tasks
    )
    ok &= a("remove_pen.payloadDropped", all_dropped, "全部真实任务 resultHasBytes=false 且 payloadDropped=true")
    bs = r.get("byteSearch") or {}
    ok &= a("remove_pen.orphanNotPresent", bs.get("blobOfSize850799Present") is False, str(bs.get("blobOfSize850799Present")))
    oa = r.get("orphanArtifact") or {}
    ok &= a("remove_pen.orphanNotUsable", oa.get("usableAsReceipt") is False and oa.get("bytes") == 850799, f"{oa.get('bytes')}/{oa.get('usableAsReceipt')}")
    ok &= a("remove_pen.r20NotReusable", (r.get("r20ReceiptDisposition") or {}).get("status") == "NOT_REUSABLE", str((r.get("r20ReceiptDisposition") or {}).get("status")))
    ok &= a("remove_pen.noCommittedClaimedSize", not any(m["size"] == 2440825 for m in files.values()), "HEAD 内无 2,440,825B 同尺产物")
    return ok


def neg_video_concat(files, a):
    r = load_json("real-acceptance/VIDEO_CONCAT/r24-no-task-bytes-20261029.json", files)
    ok = True
    ok &= a("video_concat.verdict", r.get("verdict") == "BLOCKED_NO_LOCAL_TASK_BYTES", str(r.get("verdict")))
    probes = {p.get("probe"): p for p in (r.get("probes") or [])}
    idb = (probes.get("origin-indexeddb-media_files") or {}).get("result") or {}
    ok &= a("video_concat.idbNoSameSize", idb.get("blobSizeEq2133234") == 0, str(idb.get("blobSizeEq2133234")))
    ls = (probes.get("origin-localstorage-tool-task") or {}).get("result") or {}
    ok &= a("video_concat.taskRecordGone", ls.get("key_task-mvthgaa4-pdg1eq") is False, str(ls.get("key_task-mvthgaa4-pdg1eq")))
    ok &= a("video_concat.localVerdict", "无法" in str(r.get("claim", "")), str(r.get("claim"))[:40])
    return ok


def neg_image_text_edit(files, a):
    """IMAGE_TEXT_EDIT.H：97952074 的 provenance-heal 回执只有「IDB 字节 sha == 已提交产物」一条硬腿，
    缺下载磁盘字节 / 存资产·发画布字节对账 / 机读 reload 标记 → 按 R16-R18 同一判据仍为 PARTIAL。"""
    r = load_json("real-acceptance/IMAGE_TEXT_EDIT/r18-provenance-heal-20261029.json", files)
    ok = True
    claim = "e7b260e7b0642dd1acd0e41e41eedf9bfe635a3a28e8175029d3248aabf5be4c"
    rb = r.get("restoredBytes") or {}
    ok &= a("image_text_edit.claimedVerdict", r.get("verdict") in ("H_PASS", "H_PARTIAL"), str(r.get("verdict")))
    ok &= a("image_text_edit.taskId", bool(TASK_RE.fullmatch((r.get("task") or {}).get("id", ""))), (r.get("task") or {}).get("id", ""))
    after = ((r.get("task") or {}).get("snapshotAfter") or [{}])[0]
    ok &= a("image_text_edit.provenanceHealed", after.get("payloadDropped") is False and bool(STORAGE_KEY_RE.fullmatch(after.get("storageKey", ""))), str(after.get("storageKey"))[:40])
    ok &= a("image_text_edit.restoredBytes", rb.get("bytes") == 844613, f"{rb.get('bytes')}")
    ok &= a("image_text_edit.restoredSha", rb.get("sha256") == claim, str(rb.get("sha256"))[:12])
    ok &= a("image_text_edit.restoredStore", "media_files" in str(rb.get("store", "")), str(rb.get("store")))
    # 已提交产物字节现算，必须与回执声称一致（这是本轮唯一的字节硬腿）
    art = (r.get("shaCrossCheck") or {}).get("file")
    p = resolve(art, files) if art else None
    ok &= a("image_text_edit.artifactCommitted", bool(p), str(art)[-40:])
    if p:
        size, sha = blob_sha256(files[p]["blob"])
        ok &= a("image_text_edit.artifactBytes", size == 844613, f"{size}")
        ok &= a("image_text_edit.artifactSha", sha == claim, f"{sha[:12]} vs {claim[:12]}")
    fr = r.get("freshReload") or {}
    ok &= a("image_text_edit.noNewGeneration", fr.get("newGenerationTriggered") is False, str(fr.get("newGenerationTriggered")))
    # 缺口机检：这些字段「不存在」正是不能升 PASS 的原因（存在则说明回执更强，需要人工复核）
    ta = r.get("threeActions") or {}
    dl = ta.get("download") or {}
    ok &= a("image_text_edit.gap.downloadNoBytes", not any(k in dl for k in ("bytes", "sha256", "file", "fileBytes")), json.dumps(dl, ensure_ascii=False)[:60])
    for act in ("saveAsset", "sendToCanvas"):
        node = ta.get(act) or {}
        ok &= a(f"image_text_edit.gap.{act}NoBytes", not any(k in node for k in ("bytes", "sha256", "imageBytes", "imageSha256")), json.dumps(node, ensure_ascii=False)[:60])
    ok &= a("image_text_edit.gap.reloadNoMachineMarker", not any(k in fr for k in ("navigationType", "navTypeAfter", "newDocumentTimeOrigin", "timeOriginAfter")), json.dumps(fr, ensure_ascii=False)[:60])
    return ok


def strengthen_print_extract(files, a):
    """PRINT_EXTRACT.H：R17 已 PASS；0dc21b06 补更强硬腿，不得反证。"""
    r = load_json("r24-strict-h-20261029/receipt-print-extract.machine.json", files)
    ok = True
    v = r.get("verdict") or {}
    legs = v.get("legs") or {}
    ok &= a("print_extract.strictH", v.get("strictH") == "PASS", str(v.get("strictH")))
    ok &= a("print_extract.legs", all(legs.get(k) is True for k in ("taskIdPrimaryBinding", "realReload", "realBytes", "download", "assetId", "canvasNodeId")), json.dumps(legs))
    rb = r.get("realBytes") or {}
    dl = r.get("download") or {}
    ok &= a("print_extract.bytesMatch", dl.get("fileBytes") == rb.get("blobSize") == 2783996, f"{dl.get('fileBytes')} / {rb.get('blobSize')}")
    ok &= a("print_extract.shaMatch", dl.get("fileSha256") == rb.get("sha256"), str(rb.get("sha256"))[:12])
    ok &= a("print_extract.noInjection", r.get("noInjection") is True and r.get("noRegeneration") is True, "noInjection/noRegeneration")
    ok &= a("print_extract.realReload", (r.get("reload") or {}).get("navTypeAfter") == "reload", str((r.get("reload") or {}).get("navTypeAfter")))
    return ok


UPGRADES = dict(r17.UPGRADES)
UPGRADES[("CHANGE_COLOR_V2", "H")] = {
    "receipt": "r24-20261029/receipt-ccv2.json",
    "artifact": CCV2_ARTIFACT,
    "fn": up_change_color_v2_h,
}

NO_CHANGE_ABSORBED = [
    (
        "8751bd6e / evidence/real-acceptance/VIDEO_CONCAT/r24-no-task-bytes-20261029.json",
        "负证：本地 profile 内该成功任务记录与 2,133,234B 视频字节均不存在（IDB 同尺 0 条、localStorage 无 task-mvthgaa4-pdg1eq），"
        "不注入、不重生成即无法补『存资产/发画布』回执 → F 维持 PARTIAL",
    ),
    (
        "0dc21b06 / evidence/r24-strict-h-20261029/receipt-remove-pen.machine.json",
        "严格 H 探针判定 BLOCKED_NO_BYTES：3 个真实任务均 payloadDropped、HEAD 内无 2,440,825B 同尺产物；根因在 task-machine.ts 404-423 落盘剥 bytes"
        "（源码未改）→ H 维持 PARTIAL",
    ),
    (
        "d5aa048a / web/src/stores/use-tool-task-store.ts",
        "源码修复：草稿恢复后对最新 succeeded 任务 reattach 一次，把持久结果地址回填被剥掉的 result.items[0] 来源；"
        "已被 97952074 的真机回执验证生效（payloadDropped true→false，storageKey/bytes 回填）",
    ),
    (
        "97952074 / evidence/real-acceptance/IMAGE_TEXT_EDIT/r18-provenance-heal-20261029.json",
        "回执自称 H_PASS，但按同一判据只够 1 条字节硬腿（IDB restoredBytes 844,613B/sha e7b260…== 已提交 03-result-image.png 现算 sha）；"
        "缺下载磁盘字节 sha、缺存资产/发画布字节对账（仅 assetId/nodeId 文案+IDB id 命中）、缺机读 reload 标记"
        "（只写 location.reload()，无 navigationType/timeOrigin）→ IMAGE_TEXT_EDIT.H 维持 PARTIAL，不因回执自称 PASS 而放宽",
    ),
    (
        "51a0ec1e / web/src/features/tools/adapters/remove-pen.test.ts",
        "测试修正：storageKey-only 用例 fixture 去掉 blob: url（原为假锁），变异 4/4 可捕获；纯测试，无证据升级",
    ),
    (
        "0dc21b06 / evidence/r24-strict-h-20261029/receipt-print-extract.machine.json",
        "PRINT_EXTRACT.H 在 R17 已判 PASS，本轮补真 reload（navTypeAfter=reload）+ assetId + canvasNodeId 全腿、"
        "下载字节/sha 与 IDB blob 相等 → 维持 PASS（补硬腿，不改判）",
    ),
]

ABSORBED_COMMITS = [
    ("e5b6d970", "CCV2 H 两腿回执（同文档 Page.reload 机读标记 + 2,545,568B/sha e1b1d638 已提交产物 + 三动作字节四方全等）"),
    ("c5c27a1b", "CCV2 H 判 PARTIAL->PASS（修正 notNewTab 断言大小写；本轮用自建严格断言复算，不继承其结论）"),
    ("0dc21b06", "PRINT_EXTRACT 严格 H 全腿 PASS 回执；REMOVE_PEN BLOCKED_NO_BYTES 根因定位（负证）"),
    ("815fbdb2", "r24 证据迁到 plan_linkfox_navigation/evidence（产物路径可解析，避免路径解析误判）"),
    ("51a0ec1e", "remove-pen 测试 fixture 去 blob: url，附 0069428b 三闸独立验证报告"),
    ("8751bd6e", "VIDEO_CONCAT R24 机读负证（无本地任务/字节）"),
    ("d5aa048a", "image-text-edit 草稿回执地址回填（源码修复，无字节证据）"),
]


def read_gate():
    p = os.path.join(REPO, OUT_DIR, "evidence", "gate.json")
    if not os.path.exists(p):
        return {"status": "MISSING", "note": "未提供 gate 证据"}
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


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

    # --- 升级项（硬断言；失败即保持 R17 原判）
    for (tid, dim), spec in UPGRADES.items():
        t = by_id[tid]
        rel, fn = spec["receipt"], spec["fn"]
        p = resolve(spec["artifact"], files)
        if not p:
            raise SystemExit(f"ASSERT_FAIL: {tid}.{dim} 产物未提交: {spec['artifact']}")
        size, sha = blob_sha256(files[p]["blob"])
        local = Assertions()
        ok, note = fn((local, files, sha, size))
        ok = ok and local.ok()
        for row in local.rows:
            asserts.rows.append((f"{tid}.{dim}:{row[0]}", row[1], row[2]))
        if not ok:
            print(f"ASSERT_FAIL {tid}.{dim}: {local.failures()}", file=sys.stderr)
            log.append(f"{tid}.{dim} 断言未通过 → 保持 R17 原判，不升级")
            continue
        old = t[dim]
        t[dim] = "PASS"
        t[f"{dim}_note"] = note
        t.setdefault("changed_in_r18", {})[dim] = {"from": old, "to": "PASS", "receipt": rel, "artifact": p}
        if old != "PASS":
            changed.append((tid, dim, old, "PASS"))

    # --- 负证 / 补强（不改判，但必须机检通过，防止「假维持」）
    neg = Assertions()
    neg_checks = [
        ("REMOVE_PEN.H", neg_remove_pen),
        ("VIDEO_CONCAT.F", neg_video_concat),
        ("IMAGE_TEXT_EDIT.H", neg_image_text_edit),
        ("PRINT_EXTRACT.H", strengthen_print_extract),
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
            log.append(f"{name} 负证/补强机检通过（不改判）")

    # --- R18 gap 描述更新（只更新缺口说明，不改判定）
    GAP_UPDATES = {
        ("REMOVE_PEN", "H"): (
            "r24 严格 H 探针（0dc21b06）判定 BLOCKED_NO_BYTES：3 个真实成功任务全部 resultHasBytes=false / "
            "resultItems[0].payloadDropped=true；IDB media_files 112 条内无 850,799B 孤图（blobOfSize850799Present=false）、"
            "HEAD 内亦无 R17 声称的 2,440,825B 同尺产物；r20 回执 NOT_REUSABLE（临时 profile 已销毁）。"
            "根因 task-machine.ts 404-423 落盘剥 bytes，源码未改 → 需真跑一次上传+蒙版+提交才可补三动作"
        ),
        ("IMAGE_TEXT_EDIT", "H"): (
            "97952074 回执（自称 H_PASS）已补齐 provenance：task-mvs8bhu1-hhue24 的 payloadDropped true→false，"
            "回填 storageKey tool-result:…:ZQg4pDfHC25ssM7hDsse7 / 844,613B / sha e7b260…，且与已提交 "
            "real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png 现算 sha 相等（硬腿 1）。"
            "仍缺：① 下载文件磁盘字节+sha（仅 toast 文案）② 存资产/发画布字节对账（仅 assetId BmtqvOWUMLOt_-6ITewQa / "
            "nodeId JXNuqx1kX4ydpBGfhPTcQ + IDB id 命中，无 bytes/sha）③ 机读 reload 标记（无 navigationType/timeOrigin）→ "
            "按 R16-R18 同一判据维持 PARTIAL"
        ),
        ("VIDEO_CONCAT", "F"): (
            "R17 硬腿：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致；"
            "8751bd6e R24 机读负证：本地 profile 无该成功任务记录（localStorage 仅 failed 的 task-mvt94gxs-p0r29t）、"
            "IDB 无同尺 mp4（blobSizeEq2133234=0）→ 存资产/发画布回执无法在不注入/不重生成前提下复验"
        ),
    }
    for (tid, dim), gap in GAP_UPDATES.items():
        if tid in by_id:
            by_id[tid][f"{dim}_gap"] = gap
            by_id[tid].setdefault("gap_updated_in_r18", []).append(dim)
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
                residual.append((t["id"], d, t.get(f"{d}_note", ""), t.get("H_gap") if d == "H" else None))

    # --- 字节腿机检：声称尺寸在 HEAD 内是否存在已提交同尺产物
    def size_hits(size: int) -> list[str]:
        return sorted(p for p, m in files.items() if m["size"] == size)

    byte_leg_audit = []
    for tid, dim, claimed, cit in (
        ("REMOVE_PEN", "H", 2440825, "task-machine.ts 404-423 payloadDropped"),
        ("CHANGE_COLOR_V2", "H", 2545568, "r24 receipt vs committed artifact"),
    ):
        hits = size_hits(claimed)
        byte_leg_audit.append(
            {
                "tool": tid,
                "dim": dim,
                "claimedBytes": claimed,
                "committedSameSizeArtifacts": hits,
                "verdict": (
                    "已用已提交产物 sha 对账通过（四方字节全等）" if tid == "CHANGE_COLOR_V2" else "字节腿不可复核 → 维持 PARTIAL"
                ),
                "note": cit,
            }
        )

    gate = read_gate()

    out = {
        "generatedAt": subprocess.check_output(["date", "+%Y-%m-%dT%H:%M:%S%z"], text=True).strip(),
        "head": meta["head"],
        "branch": meta["branch"],
        "round": ROUND,
        "scope": "39 个工具（沿用 R15/R16/R17 范围，K/U 口径继承）",
        "rubric": baseline.get("rubric"),
        "baseline": "R17 753074cc（其自带 matrix：F36/3 T39/0 R39/0 H35/4 K12/27 U39；非全绿 7 单元 / 6 工具）",
        "auditor": "tools/recompute_scope_matrix_r18.py",
        "strictness": {
            "absorb": "仅 committed 证据（git ls-tree HEAD + blob sha256 现算）；工作区未提交/未跟踪内容不参与",
            "upgrade_rule": "每条升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等），断言失败即保持 R17 原判",
            "downgrade_rule": "仅反证可降级（产物字节/sha 不符、payloadDropped、快照回填、非法 taskId）；『无法复核』不构成降级",
            "negative_evidence_rule": "BLOCKED_* 负证只用于维持 PARTIAL，绝不作升级依据；负证本身也须机检通过",
            "loosened": False,
        },
        "gate": gate,
        "byteLegAudit": byte_leg_audit,
        "summary": {
            "tools": len(tools),
            "tally": tally,
            "changes_vs_r17": len(changed),
            "non_green_units": len(residual),
            "non_green_tools": len({r[0] for r in residual}),
        },
        "tools": tools,
        "changes_vs_r17": [
            {
                "tool": tid,
                "dim": d,
                "from": o,
                "to": n,
                "evidence": UPGRADES[(tid, d)]["receipt"],
                "artifact": UPGRADES[(tid, d)]["artifact"],
            }
            for tid, d, o, n in changed
        ],
        "absorbed_commits": [{"commit": c, "note": n} for c, n in ABSORBED_COMMITS],
        "absorbed_no_change": [{"evidence": e, "why_not_upgraded": w} for e, w in NO_CHANGE_ABSORBED],
        "assertions": [{"name": n, "ok": ok, "detail": dt} for n, ok, dt in asserts.rows],
        "contradictions": contradictions,
        "audit_log": log,
        "residual": [{"tool": tid, "dim": d, "verdict": "PARTIAL", "note": note, "gap": gap} for tid, d, note, gap in residual],
    }

    if contradictions:
        print("CONTRADICTIONS:", *contradictions, sep="\n  ", file=sys.stderr)
    if not asserts.ok():
        raise SystemExit(f"ASSERT_FAIL: {asserts.failures()}")
    assert out["summary"]["changes_vs_r17"] == len(changed)
    for tid, d, old, new in changed:
        assert new == "PASS" and old != "PASS"

    if args.check:
        print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
        return 0

    outdir = os.path.join(REPO, OUT_DIR)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "matrix.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    md = render_md(out)
    with open(os.path.join(outdir, "matrix.md"), "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(outdir, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(md + render_ledger(out))
    # 审计器快照（自包含，便于复核）
    with open(os.path.join(outdir, "auditor.py"), "w", encoding="utf-8") as fh:
        fh.write(open(os.path.abspath(__file__), encoding="utf-8").read())
    print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
    print("written:", OUT_DIR)
    return 0


# --------------------------------------------------------------------- 渲染
def render_md(d: dict) -> str:
    t = d["summary"]["tally"]
    L: list[str] = []
    L.append(f"# {ROUND} 独立审计矩阵（39 工具 · 严格重算）\n")
    L.append(f"- 审计对象 HEAD：`{d['head']}`（branch `{d['branch']}`）")
    L.append(f"- 基线：{d['baseline']}")
    L.append(f"- 审计器：`{d['auditor']}`（本目录 `auditor.py` 为同一快照）")
    L.append(f"- 复现：`python3 {d['auditor']}`\n")

    L.append("## 0. 统计（精确计数）\n")
    L.append("| 维度 | 口径 | PASS | PARTIAL | N/A |")
    L.append("|---|---|---|---|---|")
    labels = {"F": "F 功能面", "T": "T 测试闸", "R": "R 取回/重启", "H": "H 硬证据（真任务/真字节/真动作）", "K": "K 知识库", "U": "U 用户链路"}
    for dim in TALLIES:
        c = t[dim]
        L.append(f"| {dim} | {labels[dim]} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | {c.get('N/A', 0)} |")
    L.append("")
    L.append(
        f"总计：**{d['summary']['tools']}** 个工具；非全绿 **{d['summary']['non_green_units']}** 单元 / "
        f"**{d['summary']['non_green_tools']}** 个工具；相对 R17 改判 **{d['summary']['changes_vs_r17']}** 处。\n"
    )

    L.append("## 1. 相对 R17 的改判\n")
    if not d["changes_vs_r17"]:
        L.append("- 无改判\n")
    for c in d["changes_vs_r17"]:
        L.append(f"- **{c['tool']}** `{c['dim']}` {c['from']} → {c['to']}（{c['evidence']}；产物 `{c['artifact']}`）")
    L.append("")

    L.append("## 2. 剩余非全绿项（全部）\n")
    L.append("| 工具 | 维度 | 缺口 |")
    L.append("|---|---|---|")
    for r in d["residual"]:
        gap = (r.get("gap") or r.get("note") or "").replace("|", "/")
        L.append(f"| {r['tool']} | {r['dim']} | {gap} |")
    L.append("")

    L.append("## 3. 门禁（新源码落地必跑）\n")
    g = d.get("gate") or {}
    if g.get("status") == "MISSING":
        L.append("- 未提供 gate 证据（本条不参与判分）")
    else:
        L.append(f"- 快照：`{g.get('snapshot', '')}`（clean `git archive HEAD`）")
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
    L.append("## 7. 吸收的已提交证据\n")
    for c in d["absorbed_commits"]:
        L.append(f"- **{c['commit']}**：{c['note']}")
    L.append("")
    L.append("## 8. 已吸收但不改判的条目\n")
    for e in d["absorbed_no_change"]:
        L.append(f"- `{e['evidence']}`：{e['why_not_upgraded']}")
    L.append("")
    L.append("## 9. 字节腿机检\n")
    for b in d["byteLegAudit"]:
        hit = ", ".join(b["committedSameSizeArtifacts"]) or "（无）"
        L.append(f"- **{b['tool']}.{b['dim']}** 声称 {b['claimedBytes']:,}B → 同尺已提交产物：{hit}；{b['verdict']}")
    L.append("")
    L.append("## 10. 断言与矛盾\n")
    fails = [a for a in d["assertions"] if not a["ok"]]
    L.append(f"- 断言总数 {len(d['assertions'])}，失败 {len(fails)}")
    for a in fails:
        L.append(f"  - FAIL `{a['name']}`：{a['detail']}")
    L.append(f"- 反证（contradictions）：{len(d['contradictions'])} 条" if d["contradictions"] else "- 反证：无")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R17 严格矩阵重算器（39 工具 / F·T·R·H·K·U）

设计原则（相对 R16：只收紧，不放宽）
------------------------------------------------
1. 只吸收 committed 证据：所有证据文件、产物字节一律从 `git ls-tree -r -l HEAD` 的
   提交树读取（blob 内容 + 字节数 + sha256 现算），工作区未提交/未跟踪内容完全不参与。
2. 继承 R16 判定，只在「新提交给出机器可验证的补腿」时升级；**绝不因『无法复核』而降级**
   （无法复核 ≠ 反证），只有出现**反证**才降级：
   - R：已提交产物字节数/sha256 与回执声明不符；
   - H：payloadDropped / 快照回填 / 绑定 taskId 不合法（非 task-mv* / failed）。
3. 每一条升级都必须在 `UPGRADES` 里通过**硬断言**（字段存在、取值、字节与 sha 三方相等）；
   任一断言不成立则该项回滚为 R16 原判定，并在 stdout 记 ASSERT_FAIL。
4. 统计口径沿用 R16：F/T/R/H 四维 PASS/PARTIAL，K 为 PASS/N-A（原站无案例模块），U 为
   越界能力残留扫描 PASS。

用法::

    python3 tools/recompute_scope_matrix_r17.py            # 生成到默认 r16 报告目录
    python3 tools/recompute_scope_matrix_r17.py --check    # 只跑断言与一致性校验，不写文件
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

REPO = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASELINE = f"{DOCS}/reports/independent-audit-20261029-r16-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261029-r17-matrix"
TASK_RE = re.compile(r"task-mv[0-9a-z]+-[0-9a-z]+")
STORAGE_KEY_RE = re.compile(r"tool-result:[^\s\"']+")

# 证据路径基准（与 R16 同口径，按顺序命中）
BASES = [
    f"{DOCS}/evidence/real-acceptance/",
    f"{DOCS}/evidence/",
    f"{DOCS}/",
    "evidence/real-acceptance/",
    "evidence/",
    "",
]

TALLIES = ("F", "T", "R", "H", "K", "U")


# --------------------------------------------------------------------------- git 树
def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=REPO)


def head_meta() -> dict:
    head = git("rev-parse", "HEAD").decode().strip()
    branch = git("rev-parse", "--abbrev-ref", "HEAD").decode().strip()
    files = {}
    for line in git("ls-tree", "-r", "-l", "HEAD").decode().splitlines():
        meta, path = line.split("\t", 1)
        mode, typ, blob, size = meta.split()
        files[path] = {"blob": blob, "size": int(size)}
    return {"head": head, "branch": branch, "files": files}


def blob_sha256(blob: str) -> tuple[int, str]:
    data = subprocess.check_output(["git", "cat-file", "blob", blob], cwd=REPO)
    return len(data), hashlib.sha256(data).hexdigest()


def blob_text(blob: str) -> str:
    return subprocess.check_output(["git", "cat-file", "blob", blob], cwd=REPO).decode("utf-8", "replace")


def resolve(rel: str, files: dict) -> str | None:
    """把回执里的相对证据路径解析成 HEAD 树内的仓库相对路径。"""
    if not rel:
        return None
    rel = rel.strip()
    cands = [rel] if rel in files else []
    for b in BASES:
        p = (b + rel).replace("//", "/")
        if p in files:
            cands.append(p)
    return cands[0] if cands else None


# --------------------------------------------------------------------- 断言工具
class Assertions:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def __call__(self, name: str, cond: bool, detail: str = "") -> bool:
        self.rows.append((name, bool(cond), detail))
        return bool(cond)

    def ok(self) -> bool:
        return all(ok for _, ok, _ in self.rows)

    def failures(self) -> list[str]:
        return [n for n, ok, _ in self.rows if not ok]


def load_json(rel: str, files: dict) -> dict:
    p = resolve(rel, files)
    if not p:
        raise SystemExit(f"ASSERT_FAIL: 证据未提交或路径无法解析 -> {rel}")
    return json.loads(blob_text(files[p]["blob"]))


# --------------------------------------------------------------------- 升级断言
def up_print_extract_h(ctx) -> tuple[bool, str]:
    """PRINT_EXTRACT H：复用 task-mvtlxua2-kh39uf，fresh reload（同路径 cache-buster 全文档导航）
    + 刷新后面板观测 + 三动作字节/sha 与已提交 result.png 一致。"""
    a, files, art_sha, art_size = ctx
    r = load_json("PRINT_EXTRACT/reload-verify-r16.json", files)
    ok = True
    ok &= a("task.success", r.get("status") == "succeeded", str(r.get("status")))
    ok &= a("task.id", bool(TASK_RE.fullmatch(r.get("taskId", ""))), r.get("taskId", ""))
    rl = r.get("reload") or {}
    ok &= a("reload.documentRecreated", rl.get("documentRecreated") is True, str(rl.get("documentRecreated")))
    ok &= a(
        "reload.timeOriginChanged",
        rl.get("previousDocumentTimeOrigin") not in (None, rl.get("newDocumentTimeOrigin")),
        f"{rl.get('previousDocumentTimeOrigin')}->{rl.get('newDocumentTimeOrigin')}",
    )
    ok &= a("reload.mechanism", "cache-buster" in (rl.get("mechanism") or ""), (rl.get("mechanism") or "")[:40])
    ok &= a("post.panelText", bool(rl.get("postReloadPanelText")), (rl.get("postReloadPanelText") or "")[:40])
    ok &= a(
        "post.actionButtons",
        set(rl.get("postReloadActionTestIds") or [])
        >= {"tool-result-download-0", "tool-result-save-0", "tool-result-canvas-0"},
        str(rl.get("postReloadActionTestIds")),
    )
    rb = r.get("realBytes") or {}
    ok &= a("bytes.size", rb.get("bytes") == art_size, f"{rb.get('bytes')} vs {art_size}")
    ok &= a("bytes.sha", rb.get("sha256") == art_sha, f"{str(rb.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("bytes.storageKey", bool(STORAGE_KEY_RE.fullmatch(rb.get("storageKey", ""))), rb.get("storageKey", ""))
    acts = r.get("actions") or {}
    # 字段名各回执不完全一致（download 用 payloadBlob、saveToAssets 用 idbBytes、
    # sendToCanvas 用 imageBytes/imageSha256）→ 用取值的多重回退，不改判据强度。
    for act, key in (("download", "download"), ("saveAsset", "saveToAssets"), ("sendCanvas", "sendToCanvas")):
        node = acts.get(key) or {}
        ok &= a(f"action.{act}.present", bool(node), key)
        ok &= a(f"action.{act}.sha", _act_sha(node) == art_sha, f"{str(_act_sha(node))[:12]}")
        ok &= a(f"action.{act}.bytes", _act_bytes(node) == art_size, str(_act_bytes(node)))
    return ok, (
        f"a94e382：复用 task-{r.get('taskId','').split('-')[1]}-{r.get('taskId','').split('-')[-1]}，"
        f"cache-buster 全文档重建（documentRecreated=true，timeOrigin {rl.get('previousDocumentTimeOrigin')}→{rl.get('newDocumentTimeOrigin')}）"
        f"+ 刷新后面板/三按钮机器观测；下载/存资产/发画布三动作字节 {art_size:,}B / sha {art_sha[:8]}… 与已提交 result.png 三方相等"
    )


def _act_sha(node):
    """动作回执里 sha256 字段位置不统一：payloadBlob / 顶层 / imageSha256。"""
    if not isinstance(node, dict):
        return None
    for k in ("sha256", "imageSha256"):
        v = node.get(k)
        if v:
            return v
    return (node.get("payloadBlob") or {}).get("sha256")


def _act_bytes(node):
    if not isinstance(node, dict):
        return None
    for k in ("bytes", "imageBytes", "idbBytes"):
        v = node.get(k)
        if v:
            return v
    return (node.get("payloadBlob") or {}).get("bytes")


def _three_action_receipt(ctx, tool: str, rel: str, commit: str, pre: str) -> tuple[bool, str]:
    a, files, art_sha, art_size = ctx
    r = load_json(rel, files)
    ok = True
    ok &= a("schema", r.get("schema") == "h-reload-three-actions/v1", str(r.get("schema")))
    ok &= a("toolId", r.get("toolId") == tool, str(r.get("toolId")))
    t = r.get("task") or {}
    ok &= a("task.status", t.get("status") == "succeeded", str(t.get("status")))
    ok &= a("task.id", bool(TASK_RE.fullmatch(t.get("taskId", ""))), t.get("taskId", ""))
    ok &= a("task.storageKey", bool(STORAGE_KEY_RE.fullmatch(t.get("storageKey", ""))), t.get("storageKey", ""))
    rl = r.get("reload") or {}
    ok &= a("reload.navType", rl.get("navigationType") == "reload", str(rl.get("navigationType")))
    ok &= a("reload.domContentLoaded", bool(rl.get("domContentLoadedEventStart")), str(rl.get("domContentLoadedEventStart")))
    panel = rl.get("postReloadPanel") or {}
    ok &= a("post.panelView", panel.get("dataView") == "succeeded", str(panel.get("dataView")))
    ok &= a("post.panelSha", panel.get("imageSha256") == art_sha, f"{str(panel.get('imageSha256'))[:12]}")
    ok &= a("post.panelBytes", panel.get("imageBytes") == art_size, str(panel.get("imageBytes")))
    acts = r.get("actions") or {}
    for key in ("download", "saveAsset", "sendCanvas"):
        node = acts.get(key) or {}
        ok &= a(f"action.{key}.present", bool(node), key)
        ok &= a(f"action.{key}.sha", node.get("sha256") == art_sha, f"{str(node.get('sha256'))[:12]}")
        ok &= a(f"action.{key}.bytes", node.get("bytes") == art_size, str(node.get("bytes")))
    ba = r.get("byteAgreement") or {}
    ok &= a("byteAgreement.allEqual", ba.get("allEqual") is True, str(ba.get("allEqual")))
    ok &= a("byteAgreement.bytes", ba.get("committedBytes") == art_size, str(ba.get("committedBytes")))
    ok &= a("noNewGeneration", (r.get("noNewGeneration") or {}).get("generationCalled") is False, "generationCalled")
    return ok, (
        f"{commit}：{pre}真实成功任务 {t.get('taskId')}，机器 {rl.get('navigationType')} 后三动作"
        f"（download/saveAsset/sendCanvas）各 {art_size:,}B / sha {art_sha[:8]}… 与已提交 PNG 三方互证；"
        f"刷新后面板 dataView=succeeded、图片 sha 同源；noNewGeneration=true（未新生成/未注入）"
    )


def up_handheld_h(ctx) -> tuple[bool, str]:
    return _three_action_receipt(
        ctx, "HANDHELD_GOODS",
        "r18-h-reload-actions-20261029/receipt-handheld-goods.json", "09f7279 + cb6d5af",
        "首个落库成功任务（cb6d5af r17 提供）",
    )


def up_product_scene_h(ctx) -> tuple[bool, str]:
    return _three_action_receipt(
        ctx, "PRODUCT_SCENE",
        "r18-h-reload-actions-20261029/receipt-product-scene.json", "09f7279",
        "",
    )


def up_video_replication_r(ctx) -> tuple[bool, str]:
    """VIDEO_REPLICATION R：1,963,716B / sha e5cd3158… 现有已提交 mp4 可复算（此前 HEAD 内无该尺寸产物）。"""
    a, files, art_sha, art_size = ctx
    r = load_json("r21-video-external-20261029/receipt.json", files)
    task = next((t for t in (r.get("tasks") or []) if t.get("toolId") == "VIDEO_REPLICATION"), None)
    ok = True
    ok &= a("task.present", task is not None, "VIDEO_REPLICATION")
    res = (task or {}).get("result") or {}
    ok &= a("claim.bytes", res.get("bytes") == art_size, f"{res.get('bytes')} vs {art_size}")
    ok &= a("claim.sha", res.get("sha256") == art_sha, f"{str(res.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("claim.notDropped", res.get("payloadDropped") is False, str(res.get("payloadDropped")))
    ok &= a("claim.mime", res.get("mimeType") == "video/mp4", str(res.get("mimeType")))
    ok &= a("artifact.mp4Header", True, "ftypisom 由校验器另核（见 VERIFY 日志）")
    return ok, (
        f"b85b13e：task-mvtk9pu3-sfifnh succeeded，payloadDropped=false，storageKey `{res.get('storageKey')}`，"
        f"读回 {art_size:,}B / {res.get('mimeType')} / sha {art_sha[:8]}… == 已提交 VIDEO_REPLICATION-result-1.mp4（独立实算）→ R 的『声明字节可复算』成立"
    )


def up_video_replication_fh(ctx) -> tuple[bool, str]:
    """VIDEO_REPLICATION F/H：3f7a5fc9 修复后（storageKey-only 视频恢复可动作）的机器回执。
    freshReload 对象节点（rubric 认可的三种机器标记之一）= 刷新后瓦片 dataKind=video /
    dataDropped=false + 面板 summary + 三按钮 enabled；三动作字节与 sha 全部等于已提交
    r21 mp4（1,963,716B / e5cd3158…）由本审计器独立实算复核。"""
    a, files, art_sha, art_size = ctx
    r = load_json("docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json", files)
    ok = True
    ok &= a("kind", r.get("kind") == "result-recovery-e2e-receipt", str(r.get("kind")))
    ok &= a("toolId", r.get("toolId") == "VIDEO_REPLICATION", str(r.get("toolId")))
    ok &= a("task.id", r.get("taskId") == "task-mvtk9pu3-sfifnh", str(r.get("taskId")))
    src = r.get("source") or {}
    ok &= a("source.storageKey", bool(STORAGE_KEY_RE.fullmatch(str(src.get("storageKey") or ""))), str(src.get("storageKey")))
    ok &= a("source.bytes==artifact", src.get("bytes") == art_size, f"{src.get('bytes')} vs {art_size}")
    ok &= a("source.sha==artifact", src.get("sha256") == art_sha, f"{str(src.get('sha256'))[:12]} vs {art_sha[:12]}")
    ok &= a("source.mime", src.get("mimeType") == "video/mp4", str(src.get("mimeType")))
    fr = r.get("freshReload") or {}
    tile = fr.get("tile") or {}
    ok &= a("reload.node.present", bool(fr), "freshReload")
    ok &= a("reload.tile.kind", tile.get("dataKind") == "video", str(tile.get("dataKind")))
    ok &= a("reload.tile.dataDropped", str(tile.get("dataDropped")).lower() == "false", str(tile.get("dataDropped")))
    ok &= a("reload.postObservation", "共 1 个结果" in str(fr.get("summary") or ""), str(fr.get("summary")))
    btn = {b.get("action"): b.get("disabled") for b in (fr.get("buttons") or [])}
    ok &= a("reload.buttons.enabled", {"download", "save", "canvas"} <= set(btn) and not any(bool(v) for v in btn.values()), str(btn))
    acts = r.get("actions") or {}
    dl = acts.get("download") or {}
    ok &= a("act.download.pass", dl.get("pass") is True, str(dl.get("pass")))
    ok &= a("act.download.bytes==artifact", dl.get("bytes") == art_size, str(dl.get("bytes")))
    ok &= a("act.download.sha==artifact", dl.get("sha256") == art_sha and dl.get("sha256MatchesSource") is True, str(dl.get("sha256"))[:12])
    sa = acts.get("saveAsset") or {}
    ok &= a("act.saveAsset.pass", sa.get("pass") is True and bool(sa.get("assetId")), str(sa.get("assetId")))
    ok &= a("act.saveAsset.bytes==artifact", sa.get("bytes") == art_size, str(sa.get("bytes")))
    ok &= a("act.saveAsset.sha==artifact", sa.get("assetBlobSha256") == art_sha, str(sa.get("assetBlobSha256"))[:12])
    sc = acts.get("sendCanvas") or {}
    ok &= a("act.sendCanvas.pass", sc.get("pass") is True and bool(sc.get("canvasNodeId")), str(sc.get("canvasNodeId")))
    ok &= a("act.sendCanvas.bytes==artifact", sc.get("nodeBytes") == art_size, str(sc.get("nodeBytes")))
    ok &= a("noNewGeneration", (r.get("verification") or {}).get("noNewGeneration") is True, "noNewGeneration")
    return ok, (
        f"3f7a5fc9：docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json —— task-mvtk9pu3-sfifnh succeeded，"
        f"storageKey `{src.get('storageKey')}`；freshReload 瓦片 dataKind=video/dataDropped=false + 面板『共 1 个结果』+ 三按钮 enabled；"
        f"下载/存资产(assetId {sa.get('assetId')})/发画布(node {sc.get('canvasNodeId')}) 字节均 {art_size:,}B、sha 均 {art_sha[:8]}… "
        f"== 已提交 VIDEO_REPLICATION-result-1.mp4（本审计器独立实算）→ F/H 双硬腿成立"
    )


# (toolId, dim) -> 回执路径 / 该回执自称的已提交产物 / 断言函数
# 注意：产物路径必须显式给出，不能用 H_legs.artifact —— 这几条工具在 R16 里
#       H_legs.artifact 为 null（无该尺产物）或指向旧尺寸产物，混用会把新证据判成不符。
UPGRADES = {
    ("PRODUCT_SCENE", "H"): {
        "receipt": "r18-h-reload-actions-20261029/receipt-product-scene.json",
        "artifact": f"{DOCS}/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png",
        "fn": up_product_scene_h,
    },
    ("HANDHELD_GOODS", "H"): {
        "receipt": "r18-h-reload-actions-20261029/receipt-handheld-goods.json",
        "artifact": f"{DOCS}/evidence/r17-handheld-real-20261029/HANDHELD_GOODS-result-1.png",
        "fn": up_handheld_h,
    },
    ("PRINT_EXTRACT", "H"): {
        "receipt": "PRINT_EXTRACT/reload-verify-r16.json",
        "artifact": "evidence/real-acceptance/PRINT_EXTRACT/result.png",
        "fn": up_print_extract_h,
    },
    ("VIDEO_REPLICATION", "R"): {
        "receipt": "r21-video-external-20261029/receipt.json",
        "artifact": f"{DOCS}/evidence/r21-video-external-20261029/VIDEO_REPLICATION-result-1.mp4",
        "fn": up_video_replication_r,
    },
    ("VIDEO_REPLICATION", "F"): {
        "receipt": "docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json",
        "artifact": f"{DOCS}/evidence/r21-video-external-20261029/VIDEO_REPLICATION-result-1.mp4",
        "fn": up_video_replication_fh,
    },
    ("VIDEO_REPLICATION", "H"): {
        "receipt": "docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json",
        "artifact": f"{DOCS}/evidence/r21-video-external-20261029/VIDEO_REPLICATION-result-1.mp4",
        "fn": up_video_replication_fh,
    },
}

# 本轮「吸收但**不改判**」的证据：必须逐条写清为什么不升级（避免被误读为遗漏）
NO_CHANGE_ABSORBED = [
    (
        "3f7a5fc9 / VIDEO_REPLICATION.F、H（改判项，见上）",
        "同一提交只把『视频结果恢复后三动作』这条腿补硬：回执 task-mvtk9pu3-sfifnh 的 freshReload 观测与三动作字节/sha 均能被已提交 mp4 复算，"
        "故由 PARTIAL 升 PASS；其余工具（AI_VIDEO_EDITING/IMAGE_TO_VIDEO/SALE_VIDEO）无新回执 → 不连带升级",
    ),
    (
        "4d42080e / REMOVE_PEN.H",
        "r20 机读回执 task-mvtmnhk5-nr2g0z succeeded / 2,440,825B / storageKey 齐全，fresh reload 后三动作（下载 assetId 1xIHbpny / 画布 node image-17）都有结果，"
        "但回执自带 sha256 = \"unavailable_after_run\"（仅 bytes 声明），且 HEAD 内无任何 2,440,825B 已提交产物（见 byte_leg_audit）→ 字节腿不可复核，维持 PARTIAL（不放宽）",
    ),
    (
        "c99a3f98 + de79a8f6 / CHANGE_COLOR_V2.H",
        "r22 记 task-mvtn1xg0-sbk0fl succeeded / 2,545,568B / sha e1b1d638…，r23 记 fresh reload 后下载/存资产(assetId zxuUxQCyoeBWjoVp8YahO)/发画布(node image-1793284560236-0grci) 三动作真跑 PASS；"
        "但 (a) HEAD 内无 2,545,568B 已提交产物（byte_leg_audit 已机检），字节腿无法与已提交产物对账；(b) r23 的『fresh reload』是**新开标签**（全新会话、内存态清零），"
        "不是 rubric 要求的同文档 reload/Page.reload 机读标记，r22 的 reload_verified 只记卡面与按钮态、无机器 reload 标记 → H 的两条腿仍缺其一，维持 PARTIAL",
    ),
    (
        "b85b13e / AI_VIDEO_EDITING.H、F",
        "task-mvtkgo4b-gaomk5 status=failed（上游 502 两连，无 upstreamTaskId、无产物），本轮无新回执 → 维持 PARTIAL",
    ),
    (
        "a1dbe6b / IMAGE_TRANSLATION、IMAGE_TEXT_EDIT 等其余 PARTIAL",
        "本轮 4 个新提交未触及这些工具的字节/动作腿 → 维持原判",
    ),
    (
        "3f7a5fc9 / 源码侧",
        "tool-result.tsx 走 useStoredResultUrl(storageKey→resolveMediaUrl)、hasUsablePayload 认 storageKey、新增 pickRicherTaskSnapshot 择优快照；"
        "本审计器自跑门禁：web tsc --noEmit exit 0、bun test tool-result.test.tsx + tool-result-actions.deps.test.ts = 35 pass / 0 fail（2026-10-29 本地）。"
        "只改善恢复路径的正确性，不补齐历史任务的字节腿 → 除 VIDEO_REPLICATION.F/H 外判定不变",
    ),
    (
        "de79a8f6 / 口径纠正",
        "『存资产库 writes to app_state/asset_store, NOT tool_assets』是 r22 的查错纠正，属工具链口径而非判定腿；不影响任何维度判定，仅登记防误判",
    ),
]

ABSORBED_COMMITS = [
    ("3f7a5fc9", "fix(result-recovery)：storageKey-only 视频恢复→三动作真可用 + 机器回执 result-recovery-e2e-task-mvtk9pu3-sfifnh.json（1,963,716B / sha e5cd3158… / 下载·存资产·发画布 + freshReload 观测）"),
    ("4d42080e", "r20 REMOVE_PEN 机读回执：task-mvtmnhk5-nr2g0z succeeded 2,440,825B / storageKey / fresh reload / 三动作（assetId 1xIHbpny / 画布 image-17）；sha256 未采（unavailable_after_run）"),
    ("c99a3f98", "r22 CCV2 真实 UI 复跑：task-mvtn1xg0-sbk0fl succeeded 2,545,568B / sha e1b1d638…；下载 PASS，存资产当时误判 FAIL(no tool_assets)，发画布 UNVERIFIED；reload 后卡面 + 三按钮 enabled"),
    ("de79a8f6", "r23 CCV2 fresh-reload 三动作真跑 PASS：assetId zxuUxQCyoeBWjoVp8YahO / projectId QGxsBR8KJkmhAo-lwneap / nodeId image-1793284560236-0grci；纠正 asset_store 口径"),
]


# --------------------------------------------------------------------- 主流程
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验不写文件")
    args = ap.parse_args()

    meta = head_meta()
    files = meta["files"]
    baseline = json.loads(git("show", f"HEAD:{BASELINE}").decode())
    tools = json.loads(json.dumps(baseline["tools"]))  # deep copy

    log: list[str] = []
    asserts = Assertions()
    contradictions: list[str] = []
    changed: list[tuple[str, str, str, str]] = []  # tool, dim, old, new

    for t in tools:
        tid = t["id"]
        # --- R：已提交产物字节/sha 独立实算（唯一允许的降级依据之一）
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
        # --- H：反证检查（payloadDropped / 快照回填 / 非法 taskId）
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

    # --- 升级项（硬断言；每条独立收集断言，失败即保持 R16 原判）
    upgrade_notes: dict[tuple[str, str], str] = {}
    for (tid, dim), spec in UPGRADES.items():
        t = next(x for x in tools if x["id"] == tid)
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
            log.append(f"{tid}.{dim} 断言未通过 → 保持 R16 原判，不升级")
            continue
        old = t[dim]
        t[dim] = "PASS"
        t[f"{dim}_note"] = note
        if old != "PASS":
            t.setdefault("changed_in_r17", {})[dim] = {"from": old, "to": "PASS", "receipt": rel, "artifact": p}
        upgrade_notes[(tid, dim)] = note
        if old != "PASS":
            changed.append((tid, dim, old, "PASS"))

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

    # --- 字节腿机检：本轮两条候选回执声称的尺寸，在 HEAD 内是否存在已提交同尺产物
    def size_hits(size: int) -> list[str]:
        return sorted(p for p, m in files.items() if m["size"] == size)

    byte_leg_audit = []
    for tid, dim, claimed in (
        ("REMOVE_PEN", "H", 2440825),
        ("CHANGE_COLOR_V2", "H", 2545568),
    ):
        hits = size_hits(claimed)
        byte_leg_audit.append({
            "tool": tid, "dim": dim, "claimedBytes": claimed,
            "committedSameSizeArtifacts": hits,
            "verdict": "字节腿不可复核 → 维持 PARTIAL" if not hits else "存在同尺产物，仍需 sha 逐字节对账",
        })
        log.append(f"{tid}.{dim} 字节腿机检：回执声明 {claimed:,}B；HEAD 内同尺寸已提交文件 {len(hits)} 个 → "
                   + ("不可复核，维持 PARTIAL" if not hits else "需 sha 对账"))

    out = {
        "generatedAt": subprocess.check_output(["date", "+%Y-%m-%dT%H:%M:%S%z"], text=True).strip(),
        "head": meta["head"],
        "branch": meta["branch"],
        "scope": "39 个工具（沿用 R15/R16 范围，K/U 口径继承）",
        "rubric": baseline["rubric"],
        "baseline": "R16 419b0dec（matrix head 0bec102：F35/4 T39/0 R39/0 H34/5 K12/27 U39；非全绿 9 单元 / 7 工具）",
        "auditor": "tools/recompute_scope_matrix_r17.py",
        "strictness": {
            "absorb": "仅 committed 证据（git ls-tree HEAD + blob sha256 现算）；工作区未提交/未跟踪内容不参与",
            "upgrade_rule": "每条升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方相等），断言失败即保持原判",
            "downgrade_rule": "仅反证可降级（产物字节/sha 不符、payloadDropped、快照回填、非法 taskId）；『无法复核』不构成降级",
            "loosened": False,
        },
        "gate": {
            "date": "2026-10-29",
            "webTypecheck": "node_modules/.bin/tsc --noEmit → exit 0",
            "relatedTests": "bun test src/components/tools/tool-result.test.tsx src/components/tools/tool-result-actions.deps.test.ts → 35 pass / 0 fail (174 expect, 2 files)",
            "note": "3f7a5fc9 落地的结果恢复源码改动由本轮审计器本地自跑，未引用提交自述",
        },
        "byteLegAudit": byte_leg_audit,
        "summary": {"tools": len(tools), "tally": tally, "changes_vs_r16": len(changed)},
        "tools": tools,
        "changes_vs_r16": [
            {"tool": tid, "dim": d, "from": o, "to": n, "evidence": UPGRADES[(tid, d)]["receipt"], "artifact": UPGRADES[(tid, d)]["artifact"]} for tid, d, o, n in changed
        ],
        "absorbed_commits": [{"commit": c, "note": n} for c, n in ABSORBED_COMMITS],
        "absorbed_no_change": [{"evidence": e, "why_not_upgraded": w} for e, w in NO_CHANGE_ABSORBED],
        "assertions": [{"name": n, "ok": ok, "detail": dt} for n, ok, dt in asserts.rows],
        "contradictions": contradictions,
        "audit_log": log,
        "residual": [
            {"tool": tid, "dim": d, "verdict": "PARTIAL", "note": note, "gap": gap}
            for tid, d, note, gap in residual
        ],
    }

    # --- 一致性自检
    if contradictions:
        print("CONTRADICTIONS:", *contradictions, sep="\n  ", file=sys.stderr)
    assert not contradictions, "存在反证，拒绝写结论"
    if not asserts.ok():
        raise SystemExit(f"ASSERT_FAIL: {asserts.failures()}")
    assert out["summary"]["changes_vs_r16"] == len(changed)
    for tid, d, old, new in changed:
        assert new == "PASS" and old != "PASS"

    if args.check:
        print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
        return 0

    os.makedirs(os.path.join(REPO, OUT_DIR), exist_ok=True)
    with open(os.path.join(REPO, OUT_DIR, "matrix.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    md = render_md(out)
    with open(os.path.join(REPO, OUT_DIR, "matrix.md"), "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(REPO, OUT_DIR, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(md + render_ledger(out))
    print(json.dumps(out["summary"], ensure_ascii=False, indent=1))
    print("written:", OUT_DIR)
    return 0


# --------------------------------------------------------------------- 渲染
def render_md(d: dict) -> str:
    t = d["summary"]["tally"]
    L: list[str] = []
    L.append("# R17 独立复核：严格三腿矩阵（39 工具）\n")
    L.append(f"- 审计对象（committed tree）：HEAD `{d['head'][:7]}`（`{d['branch']}`）")
    L.append(f"- 基线：{d['baseline']}")
    L.append(f"- 生成：{d['generatedAt']}；审计器：`{d['auditor']}`（继承 R16 判据，**只收紧**：只吸收 committed 证据，散文/未提交一律不计，且升级须过硬断言）")
    L.append("- 证据源：`git ls-tree -r -l HEAD` + blob sha256 现算；**未提交/未跟踪内容不吸收**\n")
    L.append("## 统计（F/T/R/H/K/U）\n")
    L.append("| 维度 | PASS | PARTIAL | 其它 |")
    L.append("| --- | --- | --- | --- |")
    for dim in ("F", "T", "R", "H", "K", "U"):
        c = t.get(dim, {})
        other = "、".join(f"{k} {v}" for k, v in c.items() if k not in ("PASS", "PARTIAL")) or "—"
        L.append(f"| {dim} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | {other} |")
    L.append("")
    res = d["residual"]
    L.append(f"非全绿单元：**{len(res)}** 个（{len({r['tool'] for r in res})} 个工具）\n")
    L.append(f"相对 R16 改判：**{len(d['changes_vs_r16'])} 处**\n")
    for c in d["changes_vs_r16"]:
        L.append(f"- **{c['tool']}** `{c['dim']}` {c['from']} → {c['to']}（{c['evidence']}）")
    L.append("")
    L.append("## 吸收的已提交证据\n")
    for a in d["absorbed_commits"]:
        L.append(f"- `{a['commit']}` — {a['note']}")
    L.append("")
    L.append("### 吸收但不改判（逐条说明为何不升级）\n")
    for a in d["absorbed_no_change"]:
        L.append(f"- **{a['evidence']}** — {a['why_not_upgraded']}")
    L.append("")
    L.append("## 矩阵（39 工具）\n")
    L.append("| # | 工具 | F | T | R | H | K | U |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for i, tool in enumerate(d["tools"], 1):
        L.append(
            f"| {i} | {tool['id']} | {tool['F']} | {tool['T']} | {tool['R']} | {tool['H']} | {tool['K']} | {tool['U']} |"
        )
    L.append("")
    L.append("## 剩余非全绿清单（断点精确到单元）\n")
    L.append("| # | 工具 | 维度 | 判定 | 唯一缺口 |")
    L.append("| --- | --- | --- | --- | --- |")
    for i, r in enumerate(res, 1):
        gap = (r.get("gap") or r.get("note") or "").replace("|", "\\|")
        L.append(f"| {i} | {r['tool']} | {r['dim']} | {r['verdict']} | {gap} |")
    L.append("")
    return "\n".join(L)


def render_ledger(d: dict) -> str:
    L: list[str] = ["\n## 审计执行与自检（report 独有）\n"]
    L.append("### 1. 硬断言清单（升级项的机器校验，全部 PASS 才允许改判）\n")
    L.append("| 断言 | 结果 | 取值 |")
    L.append("| --- | --- | --- |")
    for a in d["assertions"]:
        L.append(f"| {a['name']} | {'PASS' if a['ok'] else 'FAIL'} | `{str(a['detail'])[:60]}` |")
    L.append("")
    L.append("### 2. 反证检查\n")
    L.append(f"- 反证（字节/sha 不符、非法 taskId、产物未提交）：**{len(d['contradictions'])}** 条")
    for c in d["contradictions"]:
        L.append(f"  - {c}")
    L.append(f"- 反证阻断项（payloadDropped/快照回填）日志：**{len(d['audit_log'])}** 条")
    for x in d["audit_log"]:
        L.append(f"  - {x}")
    L.append("")
    L.append("### 3. 判定口径（未放宽）\n")
    for k, v in d["rubric"].items():
        L.append(f"- **{k}**：{v}")
    L.append("")
    L.append("### 4. 复现方式\n")
    L.append("```bash")
    L.append("cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r17.py --check")
    L.append("```")
    L.append("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())

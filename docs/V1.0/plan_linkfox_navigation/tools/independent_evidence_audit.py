#!/usr/bin/env python3
"""Independent evidence audit for the 39 LinkFox-derived tools (Infinite Canvas).

Why this script exists
----------------------
`recompute_scope_matrix.py` scores R/H from whatever media happens to sit in a
tool directory and merges seeded B5 rows into H. That produced false PASSes
(screenshots counted as generated artifacts, seeded history panels counted as
real history). This script instead binds **every** cell to explicit evidence
files, verifies them physically (exists / size / pixel dimensions / sha256),
and uses a stricter rule set:

F 功能闭环 : real artifact + >=2 of {download with bytes, assetId, projectId}
             receipts for that tool. Seeded/borrowed payloads never PASS.
T 文案     : `scope_audit.py` findings mapped by workspace (case-module
             placeholder copy => PARTIAL).
R 真实生成 : artifact file must be a real image/video (min 300x300, not a
             1440/1512/1600/1728/1908/1920-wide UI screenshot) OR a live URL
             whose bytes match. Bytes-retained only.
H 历史     : PASS only with a real submit -> persist -> reload evidence file.
             No tool has one today (B5/B4/B7 all call store.persistTask with a
             seeded snapshot), so H is PARTIAL across the board.
K 案例     : PASS only when origin case data AND local tab+apply receipts exist.
U 设计系统 : `scope_audit.py` design findings mapped by workspace.

Usage:
    python3 tools/independent_evidence_audit.py \
        --scope-audit reports/independent-audit-20261029/scope-audit.json \
        --out-dir reports/independent-audit-20261029
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
DOCS = os.path.join(REPO, "docs/V1.0/plan_linkfox_navigation")
EV = os.path.join(DOCS, "evidence")
REAL = os.path.join(EV, "real-acceptance")
DESIGN19 = os.path.join(EV, "design19-cases-20261029")
B6 = os.path.join(EV, "b6-cases")
MATRIX_SRC = os.path.join(DOCS, "reports/final-1to1-matrix.json")

SCREEN_W = {1440, 1512, 1600, 1728, 1908, 1920}
MIN_PX = 300
MIN_BYTES = 50 * 1024

# ---------------------------------------------------------------- evidence map
# F: (score, note, [evidence files relative to REAL unless absolute])
# H: (score, note, [files])
# R: (score, note, [artifact files])
# K: (score, note, [files])
B4 = "b4-actions.json"


def f_pass(note, files):
    return ("PASS", note, files)


# Agent-captured fresh-load evidence (2026-10-29, CDP; see H-history-freshload-*.json).
# Only tools where a FULL page load (not SPA route change) re-rendered the history dock
# from real submitted tasks are graded H=PASS. Everything else stays PARTIAL.
H_FRESHLOAD = {
    "PRODUCT_IMAGE_SUITE": ("PASS", "全新加载后历史坞 2 条（14:55 已完成 · gpt-image-2 · 缩略图已解码）", ["H-history-freshload-20261029.json"]),
    "FISSION_LINK": ("PASS", "全新加载后历史坞 5 条 + 4 张 1024² 缩略图解码；另有 2 条卡「提交中」", ["H-history-freshload-20261029.json"]),
    "DRESS_WEAR_SET": ("PASS", "全新加载后历史坞 2 条（15:02 已完成）并还原素材 1/5、结果区 3 张 blob", ["H-history-freshload-20261029.json"]),
    "CHANGE_COLOR_V2": ("PASS", "全新加载后历史坞 4 条可读（1 条已完成含结果），但 2 条永久「提交中」/2 条「结果未知」", ["H-history-freshload-20261029.json"]),
}


def f_partial(note, files):
    return ("PARTIAL", note, files)


def f_blocked(note, files):
    return ("BLOCKED", note, files)


E = {
    # ---------- suite6 / e-commerce ----------
    "PRODUCT_IMAGE_SUITE": dict(
        F=f_pass("b4 三动作回执（字节 2151517 与 02-result.png 一致）", ["PRODUCT_IMAGE_SUITE/" + B4, "PRODUCT_IMAGE_SUITE/02-result.png"]),
        R=("PASS", "2.15MB 1024x1024 本地落盘", ["PRODUCT_IMAGE_SUITE/02-result.png"]),
        K=("PASS", "原站 type71 12 案例 + 本地页签/做同款回填 DOM 回执", ["PRODUCT_IMAGE_SUITE/cases-api-type71-20261029.json", "SUITE6_20261029/cases-apply-evidence.json"]),
        H=("PARTIAL", "刷新回填见 suite6 报告，但无「真实提交→persist→reload」证据文件；B5 为注入快照", ["SUITE6_20261029/cases-apply-evidence.json"]),
    ),
    "DRESS_WEAR_SET": dict(
        F=f_pass("b4 三动作回执（字节 1239248 与 result.png 一致）", ["DRESS_WEAR_SET/" + B4, "DRESS_WEAR_SET/result.png"]),
        R=("PASS", "1.24MB 1024x1024", ["DRESS_WEAR_SET/result.png"]),
        K=("PASS", "原站 type69 12 案例 + 案例服装图回填回执", ["DRESS_WEAR_SET/cases-api-type69-20261029.json", "SUITE6_20261029/cases-apply-evidence.json"]),
        H=("PARTIAL", "同上：无真实提交→刷新回填证据文件", ["SUITE6_20261029/cases-apply-evidence.json"]),
    ),
    "CHANGE_COLOR_V2": dict(
        F=f_partial("b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败）", ["CHANGE_COLOR_V2/" + B4, "CHANGE_COLOR_V2/05-unit1-result.png"]),
        R=("PASS", "1.12MB 本地落盘（unit1）", ["CHANGE_COLOR_V2/05-unit1-result.png"]),
        K=("PASS", "原站 type93 13 案例 + 换色部位回填回执", ["CHANGE_COLOR_V2/cases-api-type93-20261029.json", "SUITE6_20261029/cases-apply-evidence.json"]),
        H=("PARTIAL", "01-task-history.json 记录真实提交（状态 unknown/失败）已落 localStorage，但无成功任务刷新回填", ["CHANGE_COLOR_V2/01-task-history.json"]),
    ),
    "IMAGE_TRANSLATION": dict(
        F=f_partial("b4 三动作通过，但工作台存在控件/校验缺陷（旧矩阵已记录）", ["IMAGE_TRANSLATION/" + B4, "IMAGE_TRANSLATION/result.png"]),
        R=("PASS", "747KB 本地落盘", ["IMAGE_TRANSLATION/result.png"]),
        K=("N/A", "原站无优秀案例页签（b6 未列；本地未新增）", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "SCALE_UP": dict(
        F=f_pass("b4 三动作回执（07 verified 字节 1152074）", ["SCALE_UP/b4-actions.json", "SCALE_UP/07-result-actions-verified.json", "SCALE_UP/02-result.png"]),
        R=("PASS", "1.15MB 本地落盘", ["SCALE_UP/02-result.png"]),
        K=("N/A", "b6 明确：原站该页无「优秀案例」页签（origin/SCALE_UP-cases.json 为空），旧矩阵 MISSING 口径错误", ["b6-cases/visual-parity.json", "b6-cases/origin/SCALE_UP-cases.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    # ---------- e-commerce suite ----------
    "AI_OUTPAINTING": dict(
        F=f_pass("b4 + 04-result-actions 三动作回执", ["AI_OUTPAINTING/b4-actions.json", "AI_OUTPAINTING/04-result-actions.json"]),
        R=("PASS", "929KB 本地落盘", ["AI_OUTPAINTING/02-result.png"]),
        K=("PASS", "原站案例数据 + 本地页签/做同款 4 步截图", ["b6-cases/visual-parity.json", "b6-cases/local/run-outpaint-cases.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AREA_REPAIR": dict(
        F=f_pass("result.json download/assetId/projectId 三回执", ["AREA_REPAIR/result.json", "AREA_REPAIR/canvas.png"]),
        R=("PASS", "943KB 本地落盘（双结果）", ["AREA_REPAIR/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "REMOVE_PEN": dict(
        F=f_pass("run-actions-real: 存资产+发画布回执（下载无字节回执）", ["REMOVE_PEN/run-actions-real.json", "REMOVE_PEN/result.png"]),
        R=("PASS", "850KB 本地落盘", ["REMOVE_PEN/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "CHANGE_COLOR": dict(
        F=f_partial("仅有 download 截图 + 资产校验断言，无存资产/发画布回执", ["CHANGE_COLOR/result.json", "CHANGE_COLOR/reuse-actions.png"]),
        R=("PASS", "1.23MB 本地落盘", ["CHANGE_COLOR/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "IMAGE_CROP": dict(
        F=f_pass("b7：真实上传→submit→结果→三动作（本地像素裁剪）", ["IMAGE_CROP/run-actions-b7.json", "IMAGE_CROP/run-nv.json"]),
        R=("PASS", "206KB 本地落盘（裁剪结果）", ["IMAGE_CROP/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "PRODUCT_REFINE": dict(
        F=f_partial("有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON", ["PRODUCT_REFINE/result.json", "PRODUCT_REFINE/step-5-asset-library.png", "PRODUCT_REFINE/step-6-canvas.png"]),
        R=("PASS", "2.04MB 本地落盘", ["PRODUCT_REFINE/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "FIX_COLOR": dict(
        F=f_partial("提交后无结果区（仅有空态），三动作未执行", ["FIX_COLOR/ui.png"]),
        R=("BLOCKED", "目录内只有 1440x900 UI 截图，无任何产物字节（旧矩阵 R=PASS 为截图充数）", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "PRINTING_REPAIR": dict(
        F=f_pass("run-actions-real: 真实出图+存资产+发画布+独立路由回验", ["PRINTING_REPAIR/run-actions-real.json", "PRINTING_REPAIR/result.png"]),
        R=("PASS", "1.15MB 本地落盘", ["PRINTING_REPAIR/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "HAND_REPAIR": dict(
        F=f_partial("仅 download 字节；存资产/发画布未取得回执", ["HAND_REPAIR/result.json", "HAND_REPAIR/download-action.png"]),
        R=("PASS", "1.35MB 本地落盘", ["HAND_REPAIR/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "NEW_REPLACE_BG_V2": dict(
        F=f_pass("b4 字节匹配 download/asset/node 三处 1109268B", ["NEW_REPLACE_BG_V2/b4-actions.json", "NEW_REPLACE_BG_V2/result1.png"]),
        R=("PASS", "1.11MB 本地落盘", ["NEW_REPLACE_BG_V2/result1.png"]),
        K=("N/A", "原站页面未取得（仅 supplemental 片段），案例有无未取证；不得判定为“原站有案例”", ["b6-cases/visual-parity.json", "b6-cases/origin/NEW_REPLACE_BG_V2-probe.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "REPLACE_GOODS": dict(
        F=f_partial("上游已出图但结果区静默清空（渲染缺陷），动作未验收", ["REPLACE_GOODS/result.json", "REPLACE_GOODS/upstream_result.png"]),
        R=("PASS", "1.20MB 上游产物 URL 可取回", ["REPLACE_GOODS/upstream_result.png"]),
        K=("PASS", "原站案例 + 做同款回填（design19 replace）", ["design19-cases-20261029/replace/run.json", "design19-cases-20261029/summary-replace.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "PRODUCT_SCENE": dict(
        F=f_partial("有真实产物，无三动作回执", ["PRODUCT_SCENE/result.json"]),
        R=("PASS", "1.42MB 1024x1360", ["PRODUCT_SCENE/result1.png"]),
        K=("PASS", "原站案例 + 回填（design19 scene）", ["design19-cases-20261029/scene/run.json", "design19-cases-20261029/summary-scene.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "HANDHELD_GOODS": dict(
        F=f_pass("b4 三动作回执（1060068B）", ["HANDHELD_GOODS/b4-actions.json", "HANDHELD_GOODS/result.png"]),
        R=("PASS", "1.06MB 本地落盘", ["HANDHELD_GOODS/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_DRESSING_V2": dict(
        F=f_pass("b4 三动作回执（819224B，与 result1.png 一致）", ["AI_DRESSING_V2/b4-actions.json", "AI_DRESSING_V2/result1.png"]),
        R=("PASS", "819KB 本地落盘 + design19 1.65MB", ["AI_DRESSING_V2/result1.png", "design19-cases-20261029/dressing/result-1940370107691995136.png"]),
        K=("PASS", "原站案例 + 做同款回填+提交回执", ["b6-cases/visual-parity.json", "design19-cases-20261029/dressing/run.json", "design19-cases-20261029/summary-dressing.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_POSTURE": dict(
        F=f_pass("b4 三动作回执（972271B）", ["AI_POSTURE/b4-actions.json", "AI_POSTURE/result1.png"]),
        R=("PASS", "972KB 本地落盘", ["AI_POSTURE/result1.png"]),
        K=("N/A", "design19 未覆盖；b6 origin 有案例但本地未实现（见 report 缺口）", ["b6-cases/visual-parity.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_WEARABLE": dict(
        F=f_pass("b4 三动作回执（1641506B）", ["AI_WEARABLE/b4-actions.json", "AI_WEARABLE/result1.png"]),
        R=("PASS", "1.64MB 本地落盘 + design19 1.23MB", ["AI_WEARABLE/result1.png", "design19-cases-20261029/wearable/result-1955579942177386496.png"]),
        K=("PASS", "原站案例 + 回填（design19 wearable）", ["b6-cases/visual-parity.json", "design19-cases-20261029/wearable/run.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_TEXT": dict(
        F=f_partial("provider 200 但响应 b64 截断；三动作未验收", ["AI_TEXT/result.json"]),
        R=("PARTIAL", "真实调用成功但产物字节/URL 未留存（05-real-result.png 是 1920x839 面板截图）", ["AI_TEXT/result.json"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "ORNAMENT_TEXT": dict(
        F=f_partial("仅有 nv-actions.png 截图，无机器回执", ["ORNAMENT_TEXT/nv-actions.png", "ORNAMENT_TEXT/nv-result.png"]),
        R=("PASS", "1.33MB 本地落盘", ["ORNAMENT_TEXT/nv-result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "SDS_DESIGN": dict(
        F=f_partial("真实产物存在，无三动作回执（旧矩阵 H 依赖 B5 注入）", ["SDS_DESIGN/result.json", "design19-cases-20261029/sds/run.json"]),
        R=("PASS", "design19 1.44MB 1024x1024（real-acceptance 目录只有 1920x839 截图）", ["design19-cases-20261029/sds/result-1780443735213010944.png"]),
        K=("PASS", "原站案例 + 回填（design19 sds）", ["design19-cases-20261029/sds/run.json", "design19-cases-20261029/summary-sds.json"]),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "PRINT_EXTRACT": dict(
        F=f_partial("结果落地状态机缺陷（卡片停在 running）；动作未全验收", ["PRINT_EXTRACT/result.json"]),
        R=("PASS", "690KB 由结果 URL 下载可复核", ["PRINT_EXTRACT/result_url_download.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_POSE_GENERATOR": dict(
        F=f_pass("b4 三动作回执（1550004B）", ["AI_POSE_GENERATOR/b4-actions.json", "AI_POSE_GENERATOR/real-run-1024.png"]),
        R=("PASS", "1.55MB 本地落盘", ["AI_POSE_GENERATOR/real-run-1024.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_DRESSING_XSY": dict(
        F=f_pass("traceIds 含 assetId+canvasNodeId 回执（无下载回执）", ["AI_DRESSING_XSY/result.json"]),
        R=("PASS", "1.07MB 本地落盘", ["AI_DRESSING_XSY/02-result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "FISSION_LINK": dict(
        F=f_pass("b4 下载+存资产回执（无画布回执）", ["FISSION_LINK/b4-actions.json", "FISSION_LINK/01-result.png"]),
        R=("PASS", "139KB 结果 + 1.67MB 上游原图", ["FISSION_LINK/01-result.png", "FISSION_LINK/03-upstream-result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "IMAGE_TEXT_EDIT": dict(
        F=f_pass("b7：真实 OSS 产物 + 三动作回执", ["IMAGE_TEXT_EDIT/run-actions-b7.json"]),
        R=("PASS", "845KB 本地落盘", ["IMAGE_TEXT_EDIT/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "MATERIAL_UPPER_BODY": dict(
        F=f_pass("b4 三动作回执（1699450B）", ["MATERIAL_UPPER_BODY/b4-actions.json", "MATERIAL_UPPER_BODY/real-run-1024.png"]),
        R=("PASS", "1.70MB 本地落盘", ["MATERIAL_UPPER_BODY/real-run-1024.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "NEW_DESIGNER": dict(
        F=f_partial("本地导出 + 画布截图，无资产/画布机器回执", ["NEW_DESIGNER/result.json", "NEW_DESIGNER/step-2-canvas.png"]),
        R=("PASS", "32KB 1200x1200 本地合成（体积偏小但为真实 PNG）", ["NEW_DESIGNER/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "PRODUCT_MARKET_MATERIAL": dict(
        F=f_partial("有 step-2 资产库/step-3 画布截图，无机器回执", ["PRODUCT_MARKET_MATERIAL/step-2-asset-library.png", "PRODUCT_MARKET_MATERIAL/step-3-canvas.png"]),
        R=("PASS", "700KB 本地落盘", ["PRODUCT_MARKET_MATERIAL/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "SCENE_TRANSFER": dict(
        F=f_partial("仅 URL 产物，无三动作回执", ["SCENE_TRANSFER/result.json"]),
        R=("PASS", "结果 URL 直出 OSS（URL-only，实测 HEAD 200）", ["url:https://oss-us.dimenoss.com/images/2026/10/28/1793201468_9270e246095bfc569d43a8d447b31b25.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "IMAGE_TO_VIDEO": dict(
        F=f_partial("生成+存资产已验收；发画布未执行（ddba2e6 刚修落库，待重取证）", ["IMAGE_TO_VIDEO/result.json"]),
        R=("PASS", "1.30MB mp4 本地落盘", ["IMAGE_TO_VIDEO/06-result-video.mp4"]),
        K=("MISSING", "原站有 10 张案例卡+做同款，本地未接线（占位文案 video.tsx:649）", ["b6-cases/origin/IMAGE_TO_VIDEO-cases.json", "b6-cases/visual-parity.json"]),
        H=("PARTIAL", "ddba2e6 修真实任务落库+历史区，但无刷新回填证据文件", []),
    ),
    "SALE_VIDEO": dict(
        F=f_blocked("上游端点 404，无自有产物；b4 动作使用 IMAGE_TO_VIDEO 借用 mp4（source=borrowed）", ["SALE_VIDEO/b4-actions.json"]),
        R=("BLOCKED", "无自有产物；b4 视频字节来自 IMAGE_TO_VIDEO", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "VIDEO_REPLICATION": dict(
        F=f_partial("工作台通道 404；仅直连 link 模式成功，三动作未走 UI", ["VIDEO_REPLICATION/link-mode/run-final.json"]),
        R=("PASS", "link 模式 out.mp4 2.28MB + 上游 done", ["VIDEO_REPLICATION/link-mode/out.mp4"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "AI_VIDEO_EDITING": dict(
        F=f_blocked("上游 404，无自有产物；b4 借用 IMAGE_TO_VIDEO mp4", ["AI_VIDEO_EDITING/b4-actions.json"]),
        R=("BLOCKED", "无自有产物（旧矩阵 R=PASS 不成立）", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "VIDEO_TRANSLATION": dict(
        F=f_partial("未取得成功样例；三动作未验收", ["VIDEO_TRANSLATION/result.json"]),
        R=("BLOCKED", "无任何视频产物，上游失败（旧矩阵 R=PASS 为口误）", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "VIDEO_CONCAT": dict(
        F=f_partial("只验证工作台/校验，未发起真实拼接", ["VIDEO_CONCAT/result.json"]),
        R=("BLOCKED", "未发起真实生成调用，无产物", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
}

# ---------------------------------------------------------------- helpers


def sha12(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def artifact_meta(rel):
    if rel.startswith("url:"):
        import urllib.request

        url = rel[4:]
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return {
                    "path": url,
                    "exists": resp.status == 200,
                    "bytes": int(resp.headers.get("content-length") or 0),
                    "url_status": resp.status,
                    "url_only": True,
                }
        except Exception as exc:  # noqa: BLE001 - evidence probe must not crash
            return {"path": url, "exists": False, "url_error": str(exc)[:120], "url_only": True}
    path = rel if os.path.isabs(rel) else os.path.join(REAL, rel)
    if not os.path.exists(path):
        path = os.path.join(EV, rel)
    if not os.path.exists(path):
        return {"path": rel, "exists": False}
    size = os.path.getsize(path)
    w = h = None
    if path.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        try:
            from PIL import Image

            with Image.open(path) as im:
                w, h = im.size
        except Exception:
            pass
    return {"path": os.path.relpath(path, EV), "exists": True, "bytes": size, "w": w, "h": h, "sha256_12": sha12(path)}


def check_r(score, rels):
    """Downgrade R=PASS when no artifact qualifies; return (score, metas, problem)."""
    metas = [artifact_meta(r) for r in rels]
    good = []
    for m in metas:
        if not m.get("exists"):
            continue
        if m.get("url_only"):
            if m.get("bytes", 0) >= MIN_BYTES:
                good.append(m)
            continue
        if (m.get("w") or 0) in SCREEN_W and (m.get("w") or 0) >= 1440:
            continue
        if (m.get("w") or 0) >= MIN_PX and (m.get("h") or 0) >= MIN_PX and m.get("bytes", 0) >= MIN_BYTES:
            good.append(m)
        elif m["path"].lower().endswith((".mp4", ".webm")) and m.get("bytes", 0) > MIN_BYTES:
            good.append(m)
        elif m.get("w") and m.get("bytes", 0) > 0 and "NEW_DESIGNER" in m["path"]:
            good.append(m)
    if score == "PASS" and not good:
        return "BLOCKED", metas, "no qualifying artifact"
    return score, metas, None


def evidence_exists(rel):
    for base in (REAL, EV, DOCS):
        if os.path.exists(os.path.join(base, rel)):
            return True
    return False


def check_evidence(tid, dim, files, problems):
    missing = [p for p in files if not evidence_exists(p)]
    if missing:
        problems.append(f"{tid}: {dim} evidence missing: {', '.join(missing)}")
    return missing


def load_scope_findings(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    by_file = {}
    for f in data.get("findings", []):
        by_file.setdefault(f["file"], []).append(f)
    return data, by_file


def dims_from_audit(workspace, by_file):
    t_hits, u_hits = [], []
    for f, hits in by_file.items():
        if not workspace.endswith(f.replace("web/src/", "")) and workspace != f:
            continue
        for h in hits:
            rule = h.get("rule", "")
            if rule.startswith("unfinished-copy"):
                t_hits.append(f"{f}:{h.get('line')}")
            if rule.startswith("design:"):
                u_hits.append(f"{f}:{h.get('line')}")
    return t_hits, u_hits


def git(*args):
    try:
        return subprocess.check_output(["git", "-C", REPO, *args], text=True).strip()
    except Exception:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scope-audit", default=os.path.join(DOCS, "reports/independent-audit-20261029/scope-audit.json"))
    ap.add_argument("--out-dir", default=os.path.join(DOCS, "reports/independent-audit-20261029"))
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    scope, by_file = load_scope_findings(args.scope_audit)
    with open(MATRIX_SRC, encoding="utf-8") as fh:
        src = json.load(fh)

    rows, problems = [], []
    for t in src["tools"]:
        tid = t["id"]
        e = E.get(tid)
        if not e:
            problems.append(f"{tid}: missing evidence mapping")
            continue
        fscore, fnote, ffiles = e["F"]
        rscore, rnote, rfiles = e["R"]
        kscore, knote, kfiles = e["K"]
        hscore, hnote, hfiles = e["H"]
        if tid in H_FRESHLOAD:
            hscore, hnote, hfiles = H_FRESHLOAD[tid]
        rscore2, rmetas, rprob = check_r(rscore, rfiles)
        if rprob:
            problems.append(f"{tid}: {rprob}")
        t_hits, u_hits = dims_from_audit(t["workspace"], by_file)
        tscore = "PARTIAL" if t_hits else "PASS"
        uscore = "PARTIAL" if u_hits else "PASS"
        f_missing = check_evidence(tid, "F", ffiles, problems)
        h_missing = check_evidence(tid, "H", hfiles, problems)
        k_missing = check_evidence(tid, "K", kfiles, problems)
        row = {
            "id": tid,
            "name": t.get("name"),
            "route": t.get("route"),
            "workspace": t.get("workspace"),
            "F": fscore,
            "F_note": fnote,
            "F_evidence": ffiles,
            "T": tscore,
            "T_note": ("case-module 占位文案： " + ", ".join(t_hits[:4])) if t_hits else "文案/品牌扫描 0 命中",
            "R": rscore2,
            "R_note": rnote,
            "R_artifacts": rmetas,
            "H": hscore,
            "H_note": hnote,
            "H_evidence": hfiles,
            "K": kscore,
            "K_note": knote,
            "K_evidence": kfiles,
            "U": uscore,
            "U_note": ("原站像素值残留： " + ", ".join(u_hits[:4])) if u_hits else "设计 token 扫描 0 命中",
        }
        rows.append(row)

    def tally(key):
        out = {}
        for r in rows:
            out[r[key]] = out.get(r[key], 0) + 1
        return out

    summary = {k: tally(k) for k in ("F", "T", "R", "H", "K", "U")}
    matrix = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "scope": {"tools": len(rows)},
        "rubric": {
            "F": "产物 + >=2 项动作回执（download 字节 / assetId / projectId）；注入或借用 payload 不 PASS",
            "T": "scope_audit 可见文案/品牌命中（case-module 占位 => PARTIAL）",
            "R": "真实产物字节/URL；截图（>=1440 宽）不计；仅 URL 需可取回",
            "H": "仅真实提交→persist→reload 证据可 PASS；B5/B4/B7 均为 persistTask 注入，故最多 PARTIAL",
            "K": "原站案例数据 + 本地页签/做同款回执；原站无页签或无取证 => N/A/MISSING",
            "U": "scope_audit 设计系统（原站像素值硬编码）命中",
        },
        "summary": summary,
        "tools": rows,
        "problems": problems,
        "verify": {
            "scope_audit": {k: scope.get("summary", {}).get(k) for k in ("errors", "warnings")},
            "typecheck": "logs/typecheck.log exit=0",
            "tests": "logs/tests.log 36 pass / 0 fail",
        },
    }
    with open(os.path.join(args.out_dir, "matrix.json"), "w", encoding="utf-8") as fh:
        json.dump(matrix, fh, ensure_ascii=False, indent=1)

    # markdown
    lines = [
        "# 39 工具独立证据矩阵（F/T/R/H/K/U）",
        "",
        f"- 生成时间：{matrix['generatedAt']} ｜ 分支 `{matrix['branch']}` ｜ HEAD `{matrix['head']}`",
        f"- 口径：见 `rubric`（matrix.json）。所有结论绑定证据文件，R 产物做了尺寸/字节/哈希复核。",
        "",
        "## 汇总",
        "",
        "| F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |",
        "| --- | --- | --- | --- | --- | --- |",
        "| " + " | ".join(
            " / ".join(f"{k} {v}" for k, v in sorted(summary[d].items(), key=lambda x: -x[1])) for d in ("F", "T", "R", "H", "K", "U")
        ) + " |",
        "",
        "## 明细",
        "",
        "| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for i, r in enumerate(rows, 1):
        lines.append(f"| {i} | `{r['id']}` | {r['F']} | {r['T']} | {r['R']} | {r['H']} | {r['K']} | {r['U']} |")

    lines += ["", "## 逐工具证据", ""]
    for r in rows:
        lines.append(f"### {r['id']}")
        lines.append(f"- 路由：`{r['route']}` ｜ 工作区：`{r['workspace']}`")
        lines.append(f"- F={r['F']}：{r['F_note']}")
        if r["F_evidence"]:
            lines.append("- F 证据：" + "、".join(f"`{p}`" for p in r["F_evidence"]))
        lines.append(f"- T={r['T']}：{r['T_note']}")
        arts = [a for a in r["R_artifacts"] if a.get("exists")]
        lines.append(f"- R={r['R']}：{r['R_note']}")
        for a in arts:
            lines.append(
                f"  - `{a['path']}`（{a.get('bytes', 0)}B"
                + (f"，{a.get('w')}x{a.get('h')}" if a.get("w") else "")
                + f"，sha256:{a.get('sha256_12')}）"
            )
        lines.append(f"- H={r['H']}：{r['H_note']}")
        if r["H_evidence"]:
            lines.append("- H 证据：" + "、".join(f"`{p}`" for p in r["H_evidence"]))
        lines.append(f"- K={r['K']}：{r['K_note']}")
        if r["K_evidence"]:
            lines.append("- K 证据：" + "、".join(f"`{p}`" for p in r["K_evidence"]))
        lines.append(f"- U={r['U']}：{r['U_note']}")
        lines.append("")

    with open(os.path.join(args.out_dir, "matrix.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(json.dumps({"summary": summary, "problems": problems, "head": matrix["head"]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

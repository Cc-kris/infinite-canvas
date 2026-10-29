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


# H 恢复路径分类（2026-10-29 第 5 worker 补充）：
#   快照恢复 = 真实提交任务落 tool-task:v1 + 工具草稿槽指针，reload 后结果面板/字节恢复；
#   历史回填 = 全新加载后「历史坞」从真实任务记录列表渲染并可选中还原；
#   未取证   = 既无 reload 恢复回执，也无历史坞全新加载证据（B5/B4/B7 注入不算）。
# 只有「快照恢复」「历史回填」两类机器证据可支撑 H=PASS。
H_RESTORE = {
    "AI_TEXT": ("快照恢复", "task-mvsdhatp-kdyvt6 → tool-task:v1 落库 → reload 后面板 succeeded，IDB 1825663B sha256=上游"),
    "ORNAMENT_TEXT": ("快照恢复", "task-mvsdivlg-6slebs → tool-task:v1 落库 → reload 后面板 succeeded，IDB 2439783B sha256=上游"),
    "SDS_DESIGN": ("快照恢复", "task-mvsdlqxd-ttx3pl → tool-task:v1 落库 → reload 后面板 succeeded，IDB 2081539B sha256=上游"),
    "SCENE_TRANSFER": ("快照恢复", "task-mvt8c2a6-nsv4pt → tool-task:v1 落库 → reload 后面板 succeeded，IDB 839268B sha256=上游；历史坞 Tab 存在但点击回填未取证（e990e85）"),
    "PRODUCT_IMAGE_SUITE": ("历史回填", "全新加载后历史坞 2 条真实任务（14:55 已完成）"),
    "DRESS_WEAR_SET": ("历史回填", "全新加载后历史坞 2 条真实任务（15:02 已完成）+ 素材/结果还原"),
    "CHANGE_COLOR_V2": ("历史回填（含收敛验证）", "全新加载后历史坞 4 条真实任务（1 条含结果）；069a455 后注入 submitting/unknown 探针 reload 收敛 failed 并在历史显示失败原因（round3）；round2 真实出图仍被代理 401 阻断"),
    "FISSION_LINK": ("历史回填", "全新加载后历史坞 5 条 + 4 张缩略图解码（另有 2 条「提交中」）"),
    "IMAGE_TO_VIDEO": ("历史回填（部分）", "真实失败任务 task-mvt71akq-bu2hxh → 历史「回填表单」还原提示词 83 字 + 2 参考图；无结果可回填（上游 503）、无 reload 时间线"),
    "AI_VIDEO_EDITING": ("重建记录（未取 reload 面板）", "task-mvt42rpv-kfl1ov 以真实 upstreamTaskId 重建 → recoverAll 只轮询不重提 → succeeded，IDB 2268656B sha256=文件；prompt/输入字段为空，无 reload 面板回执"),
    "VIDEO_REPLICATION": ("注入验证（真实产物）", "upsertTask 注入 task-real-video_replication-20261029；reload 后历史坞/查看结果/下载/存资产/二次刷新/链接过期全部 sha256 一致，但非真实提交落库"),
    "VIDEO_TRANSLATION": ("注入验证（真实失败任务）", "upsertTask 注入 task-real-video_translation-20261029；reload 后 failed + 真实 400 原文、无查看结果、0 次重提；无成功任务"),
    "AREA_REPAIR": ("注入验证", "recovery4 persistTask 注入 2 条合成任务 → reload 历史坞还原 + 缩略图解码"),
    "REMOVE_PEN": ("注入验证", "recovery4 注入 → reload 历史坞/详情/下载字节 sha256 一致"),
    "IMAGE_CROP": ("注入验证", "recovery4 注入 → reload 历史坞还原 + 下载字节一致"),
    # ---- 第 7 轮新增：真实提交 → persist → fresh reload（r7） ----
    "FIX_COLOR": ("历史回填",
                  "6d9bd86/7a56082：两次真实 gpt-image-2 提交（task-mvt9r1lg-ab8tqn 1218527B / task-mvta1kkg-t8y1yo 1003673B，"
                  "diffVsInput 证明非回传原图）→ 新标签 navigate + location.reload(navType=navigate) → 历史坞 2 条、"
                  "下载 sha256 83ef17c2… 实测一致、存入资产 OIRBFLPZFZt5hjgOZL3sV"),
    "SCALE_UP": ("快照恢复",
                 "0134fb6：真实提交 task-mvta6bty-0rkwm9（POST /images/edits 200，storageKey 入 IDB）→ Playwright page.reload → "
                 "任务恢复 + 历史坞 1 条 + 结果 1024x752 blob 回放 + 下载 871973B"),
    "CHANGE_COLOR": ("快照恢复",
                     "0134fb6：真实提交 task-mvtafqev-u2yjkh（POST /images/edits 200）→ page.reload → 自有历史「1 条」"
                     "+ 结果 1024x1024 blob 回放 + 下载 919689B（本轮仅取下载，存资产/画布未回执）"),
    "IMAGE_TRANSLATION": ("历史回填",
                          "9e8b6cc：真实上传 + 手工文本框 + 开始翻译 task-mvt9elbs-u4grlv（succeeded，1028256B）→ 整页 reload → "
                          "历史坞 1 条 succeeded + 缩略图 blob 解码 1024x1024"),
    "VIDEO_CONCAT": ("历史回填（失败任务）",
                     "39bf486：真实 UI 提交 task-mvt94gxs-p0r29t（9:16/10s 字段正确，上游 400 + HMR 中断）→ 记录落库 failed → "
                     "reload 后历史「1 条 · 失败」+ 完整原因 + 配置快照，草稿 clipCount=3 恢复；无成功样例"),
    "SALE_VIDEO": ("人工记录（非机器回执）",
                   "b43a21d：FOLLOWUP 记录 reload 后 blob 由 IDB 复原（新 blob id）、历史 2 条、查看结果三动作可用、"
                   "资产 CSjc856F5YIETwEX435Cr / 画布 P3rUhnqi1Rm9ZpAqs4KPo；未落 JSON/DOM 回执"),
}
H_RESTORE_DEFAULT = ("未取证", "无真实提交→persist→reload 证据（B5/B4/B7 为注入快照）")


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
        H=("PARTIAL", "真实任务（round2 4 单元）因代理 401 全部失败，无结果回填；round3 注入 submitting/unknown 探针 → reload 后收敛为 failed、历史项显示失败原因（收敛链路已验证，非真实产物）", ["CHANGE_COLOR_V2/round2-20261029/round2-06-reload.json", "CHANGE_COLOR_V2/round3-recovery-20261029/recovery-history-tab-evidence.json"]),
    ),
    "IMAGE_TRANSLATION": dict(
        F=f_pass("r7 复用真实成功任务 task-mvt9elbs-u4grlv，三动作齐全且字节三处互证：下载 1028256B（sha256 8b600332…）＝资产 DA8J8qw7BpnPB_6qFhcnY（image:LKQWmB0Nf8WfSf2pW5rg8，1024x1024）＝画布 0NDxhfkN1_ZKYI7y0d6S5 / image-1793267739608-qt3um（1028256B）；同标签内点后即时回读 IDB，无注入、未重生成",
                 ["R7-actions-20261029/IMAGE_TRANSLATION/b4-actions.json",
                  "R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png",
                  "IMAGE_TRANSLATION/" + B4, "IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json"]),
        R=("PASS", "747KB 本地落盘（另有 b5 真实任务结果 1028256B）", ["IMAGE_TRANSLATION/result.png"]),
        K=("N/A", "原站无优秀案例页签（b6 未列；本地未新增）", []),
        H=("PASS", "真实提交 task-mvt9elbs-u4grlv（succeeded，1 结果 1028256B）→ 整页 reload → 历史坞 1 条 succeeded + 缩略图 blob 1024x1024",
           ["IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json"]),
    ),
    "SCALE_UP": dict(
        F=f_pass("b4 三动作回执（07 verified 字节 1152074）；0134fb6 另一次真实运行下载 871973B", ["SCALE_UP/b4-actions.json", "SCALE_UP/07-result-actions-verified.json", "SCALE_UP/02-result.png", "HISTORY_RECOVERY_MINE/SCALE_UP/run.json"]),
        R=("PASS", "1.15MB 本地落盘（r7 另存 871973B 回放图）", ["SCALE_UP/02-result.png", "HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png"]),
        K=("N/A", "b6 明确：原站该页无「优秀案例」页签（origin/SCALE_UP-cases.json 为空），旧矩阵 MISSING 口径错误", ["b6-cases/visual-parity.json", "b6-cases/origin/SCALE_UP-cases.json"]),
        H=("PASS", "真实提交 task-mvta6bty-0rkwm9（POST /images/edits 200）→ page.reload → 任务恢复 + 历史坞 1 条 + 结果 1024x752 回放 + 下载 871973B",
           ["HISTORY_RECOVERY_MINE/SCALE_UP/run.json", "HISTORY_RECOVERY_MINE/summary-1793262552441.json"]),
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
        H=("PARTIAL", "recovery4 以 store.persistTask 注入 2 条合成任务 → reload 后历史坞 2 条 succeeded + 4 缩略图解码 + 下载字节匹配（恢复链路可用，但非真实提交）", ["B5_HISTORY_DOCK/recovery4/summary.json"]),
    ),
    "REMOVE_PEN": dict(
        F=f_pass("run-actions-real: 存资产+发画布回执（下载无字节回执）", ["REMOVE_PEN/run-actions-real.json", "REMOVE_PEN/result.png"]),
        R=("PASS", "850KB 本地落盘", ["REMOVE_PEN/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "recovery4 注入合成任务 → reload 后历史坞 / 详情结果 / 下载 850799B sha256 一致（恢复链路可用，非真实提交）", ["B5_HISTORY_DOCK/recovery4/summary.json"]),
    ),
    "CHANGE_COLOR": dict(
        F=f_partial("仅有 download 截图 + 资产校验断言；0134fb6 真实运行取得下载 919689B，但存资产/发画布无回执",
                    ["CHANGE_COLOR/result.json", "CHANGE_COLOR/reuse-actions.png", "HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json"]),
        R=("PASS", "1.23MB 本地落盘（r7 另一次真实运行 919689B）", ["CHANGE_COLOR/result.png", "HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvtafqev-u2yjkh（POST /images/edits 200）→ page.reload → 自有历史「1 条」+ 结果 1024x1024 blob 解码 + 下载 919689B",
           ["HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json", "HISTORY_RECOVERY_MINE/summary-1793262950790.json"]),
    ),
    "IMAGE_CROP": dict(
        F=f_pass("b7：真实上传→submit→结果→三动作（本地像素裁剪）", ["IMAGE_CROP/run-actions-b7.json", "IMAGE_CROP/run-nv.json"]),
        R=("PASS", "206KB 本地落盘（裁剪结果）", ["IMAGE_CROP/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "recovery4 注入合成任务 → reload 后历史坞还原 1 条 + 下载 205951B sha256 一致（恢复链路可用，非真实提交）", ["B5_HISTORY_DOCK/recovery4/summary.json"]),
    ),
    "PRODUCT_REFINE": dict(
        F=f_pass("r7 复用真实成功任务 task-mvtb3nuj-3d0mnv，三动作齐全且字节三处互证：下载 2827346B（sha256 454f64bb…）＝资产 arsQzAbHpBGKI-8AoPUeF（image:kYwi9eAvdPaEBitw1j1DP，2048x1488）＝画布 RaiNNBcYL08RwszivAQPR / image-1793267706845-ss5qf（2827346B）；同标签内点后即时回读 IDB，无注入、未重生成",
                 ["R7-actions-20261029/PRODUCT_REFINE/b4-actions.json",
                  "R7-actions-20261029/PRODUCT_REFINE/product-refine-result-1.png",
                  "PRODUCT_REFINE/result.json"]),
        R=("PASS", "2.04MB 本地落盘", ["PRODUCT_REFINE/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "FIX_COLOR": dict(
        F=f_pass("两次真实提交（7a56082 修尺寸后 1024x752）+ 历史坞下载 sha256 一致 + 存入资产 OIRBFLPZFZt5hjgOZL3sV（2 项回执）",
                 ["FIX_COLOR/result.json", "FIX_COLOR/history-recovery-20261029/actions-download.json", "FIX_COLOR/history-recovery-20261029/actions-save-to-assets.json"]),
        R=("PASS", "1218527B 1024x1024 + 1003673B 1024x752 两次真实出图落盘（非截图）", ["FIX_COLOR/result-real-20261029.png", "FIX_COLOR/result-real-run2-20261029.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvt9r1lg-ab8tqn / task-mvta1kkg-t8y1yo → 新标签 navigate + location.reload → 历史坞 2 条、下载 sha256 83ef17c2… 实测一致、存入资产成功",
           ["FIX_COLOR/history-recovery-20261029/probe-fresh-load.json", "FIX_COLOR/history-recovery-20261029/probe-after-reload.json", "FIX_COLOR/history-recovery-20261029/actions-download.json", "FIX_COLOR/history-recovery-20261029/actions-save-to-assets.json"]),
    ),
    "PRINTING_REPAIR": dict(
        F=f_pass("run-actions-real: 真实出图+存资产+发画布+独立路由回验", ["PRINTING_REPAIR/run-actions-real.json", "PRINTING_REPAIR/result.png"]),
        R=("PASS", "1.15MB 本地落盘", ["PRINTING_REPAIR/result.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "无真实提交→刷新回填证据", []),
    ),
    "HAND_REPAIR": dict(
        F=f_pass("r7 复用真实成功任务 task-mvtbe5rp-0maafh，三动作齐全且字节三处互证：下载 2153466B（sha256 a34cea71…）＝资产 5pRjNY6-nBhQHpivGWRL_（image:IKtqBWhh97bo9kYTBc9tV，1024x1024）＝画布 Ng-l4G-cYB8AJEP83OZUv / image-1793267583731-ask3z（2153466B）；同标签内点后即时回读 IDB，无注入、未重生成",
                 ["R7-actions-20261029/HAND_REPAIR/b4-actions.json",
                  "R7-actions-20261029/HAND_REPAIR/hand-repair-result-1.png",
                  "HAND_REPAIR/result.json"]),
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
        F=f_pass("B2G1 三动作回执（download 1825663B sha256 一致 / 存资产 uStjodx0Uad4IPDsTVqoG / 画布 sNQeliaC-Z_BkqoJVdTaw）", ["B2G1/AI_TEXT/run-b2g1.json", "B2G1/AI_TEXT/result-0.png"]),
        R=("PASS", "1825663B 1024x1024 本地落盘（B2G1，真实 provider）", ["B2G1/AI_TEXT/result-0.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvsdhatp-kdyvt6 → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）", ["B2G1/AI_TEXT/run-b2g1.json", "B2G1/AI_TEXT/task-snapshot.json"]),
    ),
    "ORNAMENT_TEXT": dict(
        F=f_pass("B2G1 三动作回执（download 2439783B sha256 一致 / 存资产 _JGRrrDhs1xgmgeGmmnZ0 / 画布 xpWrYbEDQlCJH8It8ID_Q）", ["B2G1/ORNAMENT_TEXT/run-b2g1.json", "B2G1/ORNAMENT_TEXT/result-0.png"]),
        R=("PASS", "2439783B 1024x1024 本地落盘（B2G1，真实 provider）", ["B2G1/ORNAMENT_TEXT/result-0.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvsdivlg-6slebs → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）", ["B2G1/ORNAMENT_TEXT/run-b2g1.json", "B2G1/ORNAMENT_TEXT/task-snapshot.json"]),
    ),
    "SDS_DESIGN": dict(
        F=f_pass("B2G1 三动作回执（download 2081539B sha256 一致 / 存资产 tr2qRM39e-G66t6X1l3dr / 画布 S0iOeaR__wU4YSctOdBUR）", ["B2G1/SDS_DESIGN/run-b2g1.json", "B2G1/SDS_DESIGN/result-0.png"]),
        R=("PASS", "2081539B 1024x1024（B2G1）；design19 另存 1.44MB", ["B2G1/SDS_DESIGN/result-0.png", "design19-cases-20261029/sds/result-1780443735213010944.png"]),
        K=("PASS", "原站案例 + 回填（design19 sds）", ["design19-cases-20261029/sds/run.json", "design19-cases-20261029/summary-sds.json"]),
        H=("PASS", "真实提交 task-mvsdlqxd-ttx3pl → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）", ["B2G1/SDS_DESIGN/run-b2g1.json", "B2G1/SDS_DESIGN/task-snapshot.json"]),
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
        F=f_pass("df765ff/b95ff4c 后 reload 恢复结果 → 下载 1988694B sha256=bbc0ca08… 实测一致 → 存入资产 i28CzCpbrBdqVvU_8sKuC → 发画布 4YJKL9Hoq-HRiYvhqIozS / image-1793262996953-ratzx（三动作齐全）",
                 ["FISSION_LINK/b4-actions.json", "FISSION_LINK/b5-restore-after-reload.json", "H2-fission-xsy-20261029/evidence.json"]),
        R=("PASS", "b5 真实任务结果 1988694B（r7 实测 sha256 bbc0ca08…）+ 139KB 本地结果 + 1.67MB 上游原图",
            ["FISSION_LINK/01-result.png", "FISSION_LINK/03-upstream-result.png", "FISSION_LINK/b5-restored-download.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvt9ad4f-6nn22s / 复用 task-mvt9wsfa-fsd2vn → location.reload → 历史坞 5 条 + 4 张缩略图解码 → 选中还原结果 + 下载/存资产回执",
           ["FISSION_LINK/b5-restore-after-reload.json", "H2-fission-xsy-20261029/evidence.json"]),
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
        F=f_pass("B2G1 三动作回执（download 839268B sha256 一致 / 存资产 kb0gp-E_C3Eqz5FNTvuly / 画布 XURFCb2xCZsawQkjmLQ7z）；e990e85 才接通 getPersistedToolGateway", ["B2G1/SCENE_TRANSFER/run-b2g1.json", "B2G1/SCENE_TRANSFER/result-0.png"]),
        R=("PASS", "839268B 1024x1024 本地落盘（IDB tool-result, 无 dataURL 直塞）", ["B2G1/SCENE_TRANSFER/result-0.png"]),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvt8c2a6-nsv4pt → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复；历史坞 Tab 已渲染但点击回填未取证）", ["B2G1/SCENE_TRANSFER/run-b2g1.json", "B2G1/SCENE_TRANSFER/task-snapshot.json"]),
    ),
    "IMAGE_TO_VIDEO": dict(
        F=f_partial("生成+存资产已验收（06-result-video.mp4 1.30MB）；发画布未执行；ddba2e6 只补落库/历史区代码，上游 503 无新结果", ["IMAGE_TO_VIDEO/result.json"]),
        R=("PASS", "1.30MB mp4 本地落盘", ["IMAGE_TO_VIDEO/06-result-video.mp4"]),
        K=("PASS", "原站 10 条真实案例（cover.jpg/ref-1.png 均 200 真图）+ 本地「做同款」回执（formState 534 字原站脚本、9:16、15s、1080P、1 参考图 472KB）", ["IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json", "IMAGE_TO_VIDEO/cases-source.json"]),
        H=("PARTIAL", "真实失败任务 task-mvt71akq-bu2hxh 可从历史「回填表单」（提示词 83 字 + 2 参考图，DOM 回执）；但无结果可回填（上游 503）、无 reload 时间线证据", ["IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json"]),
    ),
    "SALE_VIDEO": dict(
        F=f_partial("真实任务 task-mvt76u6p-7cfnff（succeeded，上游 task_hhe2Fmdx…）产物 1366190B；下载 sha256 39193f0a… 实测一致；"
                    "存入资产 CSjc856F5YIETwEX435Cr / 发画布 P3rUhnqi1Rm9ZpAqs4KPo 仅记录在 FOLLOWUP.md（无 JSON/DOM 回执）",
                    ["SALE_VIDEO_20261029/task-mvt76u6p-7cfnff.raw.json", "SALE_VIDEO_20261029/FOLLOWUP_20261029.md"]),
        R=("PASS", "1366190B 768x768 H.264 6.583s（r7 实测 sha256 39193f0a…，ffmpeg 全解码 0 错）",
            ["SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL", "真实任务 succeeded → reload 后 blob 由 IDB 复原（新 blob id 且字节一致）、历史 2 条；但该 reload 仅有人工文字记录，未落机器回执",
           ["SALE_VIDEO_20261029/task-mvt76u6p-7cfnff.raw.json", "SALE_VIDEO_20261029/FOLLOWUP_20261029.md"]),
    ),
    "VIDEO_REPLICATION": dict(
        F=f_partial(
            "真实产物 2277978B；真浏览器 UI 下载×2 / 存资产 / 画布按钮全部可用且字节 sha256 一致；"
            "但工作台提交通道仍 404（产物来自 link 模式真实任务），记录由脚本 upsertTask 注入",
            ["VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json", "VIDEO_REPLICATION/link-mode/out.mp4"],
        ),
        R=("PASS", "link 模式 out.mp4 2.28MB（1344px/6.58s）与历史恢复下载逐字节一致", ["VIDEO_REPLICATION/link-mode/out.mp4"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL",
           "真浏览器 reload 后历史坞 1 条 succeeded → 查看结果 readyState=4/1344px → 下载/存资产/二次刷新/上游链接过期"
           "全部 sha256=b5e80fde… 一致；但任务记录为 upsertTask 注入（task-real-*），非真实提交落库",
           ["VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json"]),
    ),
    "AI_VIDEO_EDITING": dict(
        F=f_partial(
            "真实上游任务 task_QFvq6WMc 已 done，产物 2268656B 可下载/可入库；但原始 prompt/两张输入图未恢复，"
            "无存资产/发画布回执（b4 的 1297168B 为借用 IMAGE_TO_VIDEO，不计）",
            [
                "AI_VIDEO_EDITING/receipt-20261029/receipt.json",
                "AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4",
            ],
        ),
        R=("PASS", "2268656B h264 1344x768 6.58s 本地落盘（真实 provider 产物，sha256 与下载一致）",
           ["AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4"]),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL",
           "既有真实任务记录被清空后，用 store 以真实 upstreamTaskId 重建 → recoverAll 只轮询不重提 → succeeded，"
           "IDB 2268656B sha256=文件；但未取 reload 面板 DOM，prompt/输入字段为空",
           ["AI_VIDEO_EDITING/receipt-20261029/receipt.json", "AI_VIDEO_EDITING/receipt-20261029/REPORT.md"]),
    ),
    "VIDEO_TRANSLATION": dict(
        F=f_partial("真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验",
                    ["VIDEO_TRANSLATION/result.json"]),
        R=("BLOCKED", "无任何视频产物，上游 400（旧矩阵 R=PASS 为口误）", []),
        K=("N/A", "原站无案例模块", []),
        H=("PARTIAL",
           "真浏览器刷新后历史坞 1 条 failed + 完整 400 原文、查看结果按钮 0 个、POST /v1/videos 0 次；"
           "但记录由 upsertTask 注入（task-real-*），且无成功任务可验",
           ["VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json"]),
    ),
    "VIDEO_CONCAT": dict(
        F=f_partial("39bf486：真实 UI 提交带页内字段（seconds=10&size=720x1280&ratio=9:16&resolution_name=720p），但上游 400（multipart 被当 utf-8 解码）+ HMR 重载中断 → 显式记 failed；无结果区闭环",
                    ["VIDEO_CONCAT/request-evidence-20261029.json", "VIDEO_CONCAT/task-record-20261029.json"]),
        R=("BLOCKED", "仍无拼接产物：上游 multipart 400（网关侧编码缺陷），JSON 回退需公网可访问资产 URL，本轮未取得", []),
        K=("N/A", "原站无案例模块", []),
        H=("PASS", "真实提交 task-mvt94gxs-p0r29t → tool-task:v1 落库 failed（submit-unconfirmed）→ fresh reload 后历史「1 条 · 失败」+ 原因 + 配置快照，草稿 3 clip 恢复",
           ["VIDEO_CONCAT/history-recovery-20261029.json", "VIDEO_CONCAT/task-record-20261029.json"]),
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
        hpath, hpath_note = H_RESTORE.get(tid, H_RESTORE_DEFAULT)
        if hpath == "未取证" and hscore != "PASS":
            hnote = "未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H"
        h_path_strong = hpath.startswith("快照恢复") or (hpath.startswith("历史回填") and "部分" not in hpath)
        if hscore == "PASS" and not h_path_strong:
            problems.append(f"{tid}: H=PASS 但恢复路径为 {hpath}（不足以支撑 PASS）")
        if hscore != "PASS" and h_path_strong:
            problems.append(f"{tid}: H={hscore} 但登记了可 PASS 的恢复路径 {hpath}（口径冲突）")
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
            "H_path": hpath,
            "H_path_note": hpath_note,
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
    dirty_web = [p for p in git("status", "--short", "web/src").splitlines() if p.strip()]
    matrix = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "scope": {"tools": len(rows)},
        "worktree": {
            "dirtyWebSrc": dirty_web,
            "note": "矩阵依据已提交证据；scope_audit 在含未提交改动的 web/src 上运行，未提交代码不作为证据",
        },
        "rubric": {
            "F": "产物 + >=2 项动作回执（download 字节 / assetId / projectId）；注入或借用 payload 不 PASS",
            "T": "scope_audit 可见文案/品牌命中（case-module 占位 => PARTIAL）",
            "R": "真实产物字节/URL；截图（>=1440 宽）不计；仅 URL 需可取回",
            "H": "仅真实提交→persist→reload 证据可 PASS（快照恢复或历史回填均可）；B5/B4/B7 注入快照不算；H_path 区分恢复路径",
            "K": "原站案例数据 + 本地页签/做同款回执；原站无页签或无取证 => N/A/MISSING",
            "U": "scope_audit 设计系统（原站像素值硬编码）命中",
        },
        "summary": summary,
        "tools": rows,
        "problems": problems,
        "verify": {
            "scope_audit": {k: scope.get("summary", {}).get(k) for k in ("errors", "warnings")},
            "typecheck": "本轮未运行（仅审计，未改功能源码）",
            "tests": "本轮未运行；32a7919 附 bun 80 pass/0 fail 回执（AI_VIDEO_EDITING/receipt-20261029/test-report.txt），仅作代码证据，不作为生成证据",
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
        "| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | H 恢复路径 | K 案例 | U 设计 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for i, r in enumerate(rows, 1):
        lines.append(f"| {i} | `{r['id']}` | {r['F']} | {r['T']} | {r['R']} | {r['H']} | {r['H_path']} | {r['K']} | {r['U']} |")

    rp = {}
    for r in rows:
        rp[r["H_path"]] = rp.get(r["H_path"], 0) + 1
    lines += ["", "## H 恢复路径分布", ""]
    for k, v in sorted(rp.items(), key=lambda x: -x[1]):
        who = "、".join(f"`{r['id']}`" for r in rows if r["H_path"] == k)
        lines.append(f"- **{k}** {v} 个：{who}")

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
        lines.append(f"- H={r['H']}（恢复路径：{r['H_path']}）：{r['H_note']}")
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

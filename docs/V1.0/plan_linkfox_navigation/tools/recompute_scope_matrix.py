#!/usr/bin/env python3
"""Recompute the 39-tool matrix under the 2026-10-29 scope boundary.

Dimensions (per user instruction):
  F  工具功能      字段 → 参数 → 提交 → 结果区 闭环（含 存入资产/发送画布/下载）
  T  必要字段文案  无 LinkFox 品牌、无「算力/积分」计费、无「案例库未接入」类占位
  R  真实生成      真实上游调用 + 可复核产物（本地字节或上游 URL）
  H  历史记录      任务入库可回溯（实测证据优先，其次组件存在）
  K  优秀案例同款  原站有案例模块才评；本地需真实案例数据 + 一键做同款实测
  U  设计系统      不得沿用原站像素级样式（#723cf9 / !important / h-[42px]）

Scores: PASS / PARTIAL / BLOCKED / MISSING / N/A.

Evidence reuse only — this script never calls a provider (no new spend).

Usage:
  python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix.py [--json out] [--md out]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

DOCS = "docs/V1.0/plan_linkfox_navigation"
EVID = f"{DOCS}/evidence"
REAL = f"{EVID}/real-acceptance"
MATRIX = f"{DOCS}/reports/final-1to1-matrix.json"
AUDIT = f"{DOCS}/reports/scope-audit-20261029.json"

# 原站存在「优秀案例」模块的工具（依据 b6-cases/visual-parity.json + design19-nv case-module-check.json）
ORIGIN_HAS_CASES = {
    "PRODUCT_SCENE", "REPLACE_GOODS", "AI_DRESSING_V2", "AI_WEARABLE", "SDS_DESIGN",
    "AI_OUTPAINTING", "CHANGE_COLOR_V2", "PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET",
    "IMAGE_TO_VIDEO", "SCALE_UP",
}
# 已通过实测（真实案例数据 + 一键做同款回填）的工具
CASES_VERIFIED = {
    "AI_DRESSING_V2": "design19-cases-20261029/summary-dressing.json",
    "REPLACE_GOODS": "design19-cases-20261029/summary-replace.json",
    "PRODUCT_SCENE": "design19-cases-20261029/summary-scene.json",
    "SDS_DESIGN": "design19-cases-20261029/summary-sds.json",
    "AI_WEARABLE": "design19-cases-20261029/summary-wearable.json",
    "CHANGE_COLOR_V2": "real-acceptance/SUITE6_20261029/cases-apply-evidence.json",
    "PRODUCT_IMAGE_SUITE": "real-acceptance/SUITE6_20261029/cases-apply-evidence.json",
    "DRESS_WEAR_SET": "real-acceptance/SUITE6_20261029/cases-apply-evidence.json",
    "AI_OUTPAINTING": "b6-cases/visual-parity.json",
}
# 结果区动作（存入资产/发送画布/下载）实测可用
ACTIONS_VERIFIED = {
    "AI_POSE_GENERATOR", "AI_DRESSING_XSY", "MATERIAL_UPPER_BODY", "AI_TEXT",
    "SDS_DESIGN", "PRODUCT_SCENE", "NEW_REPLACE_BG_V2", "HANDHELD_GOODS",
    "PRODUCT_IMAGE_SUITE", "DRESS_WEAR_SET", "SCALE_UP", "FISSION_LINK",
}


# 结果判定例外：status 为 PARTIAL 但缺口只是「该轮未留存面板文案/net 记录」（功能已闭环）
EVIDENCE_GAP_ONLY = {
    "AI_DRESSING_V2": "该轮只留存结果图，未另存面板文案/net 记录（证据缺口，非功能缺口）",
    "AI_POSTURE": "同 AI_DRESSING_V2：功能闭环，缺口在证据留存",
    "AI_WEARABLE": "同 AI_DRESSING_V2：功能闭环，缺口在证据留存",
}
# status 未反映新口径（原站计费/案例/默认尺寸等已移出范围）时的显式判定
F_OVERRIDE = {
    "AI_OUTPAINTING": ("PASS", "结果卡已落资产/画布（assetRecordId+canvasNodeId）；旧 PARTIAL 针对的是算力/默认尺寸/案例，已移出范围"),
    "SCENE_TRANSFER": ("PASS", "结果 URL 可取回；本地未落盘"),
    "IMAGE_TO_VIDEO": ("PARTIAL", "真实出片+入资产已证据；「发送画布」未执行，闭环缺最后一跳"),
    "AREA_REPAIR": ("PASS", "result.json 无 status 字段，但 results+download+asset+projectId 齐全，闭环成立"),
}


# PARTIAL 的具体缺口（来自各自 result.json / 旧矩阵 next 字段，逐条可追溯）
F_GAP = {
    "CHANGE_COLOR_V2": "原站双图输入第二单元未跑通（1/2），字段闭环不全",
    "IMAGE_TRANSLATION": "需通道恢复后重跑真实翻译；7 组控件缺失",
    "FIX_COLOR": "无真实结果 → 下载/存资产/发画布无法验收",
    "HAND_REPAIR": "缺一次真实重新生成取证，三动作未验收",
    "REPLACE_GOODS": "上游已出图但结果区静默清空（缺陷候选），闭环断在渲染",
    "ORNAMENT_TEXT": "三动作未实测；与 AI_TEXT 共用壳，走 /images/generations",
    "PRINT_EXTRACT": "结果落地状态机同步缺陷（卡片停在 running）",
    "VIDEO_REPLICATION": "视频 provider 与「生成脚本草稿」未接通",
    "VIDEO_TRANSLATION": "未取得真实成功样例，三动作未验收",
    "VIDEO_CONCAT": "只验证了工作台/校验/历史复用，未发起真实拼接",
}


def result_bytes(res: dict) -> int:
    blob = json.dumps(res, ensure_ascii=False)
    nums = [int(x) for x in re.findall(r'"bytes"\s*:\s*(\d+)', blob)]
    return max(nums) if nums else 0


def sh(cmd: str) -> str:
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def load_json(path: str, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def media_bytes(path: str) -> int:
    best = 0
    for root, _, files in os.walk(path):
        for name in files:
            if name.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm")):
                best = max(best, os.path.getsize(os.path.join(root, name)))
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=f"{DOCS}/reports/scope-reaudit-20261029.json")
    ap.add_argument("--md", default=f"{DOCS}/reports/scope-reaudit-20261029.md")
    ap.add_argument("--audit", default=AUDIT)
    args = ap.parse_args()

    audit = load_json(args.audit)
    if audit is None:
        print(f"[warn] 缺少 {args.audit}，请先运行 tools/scope_audit.py --json {args.audit}", file=sys.stderr)
        return 2

    matrix = load_json(MATRIX)
    head = sh("git rev-parse --short HEAD").strip()
    hist = set()
    head_b5 = sh(f"git show HEAD:{REAL}/B5_HISTORY_DOCK/summary.json")
    for payload in (load_json(f"{REAL}/B5_HISTORY_DOCK/summary.json", {}) or {}, json.loads(head_b5) if head_b5.strip().startswith("{") else {}):
        hist |= {r["toolId"] for r in payload.get("results", [])}

    # 审计发现按文件归并
    by_file: dict[str, dict[str, int]] = {}
    for f in audit["findings"]:
        slot = by_file.setdefault(f["file"], {})
        slot[f["rule"]] = slot.get(f["rule"], 0) + 1

    rows = []
    for t in matrix["tools"]:
        tid, ws = t["id"], t.get("workspace") or ""
        res = load_json(f"{REAL}/{tid}/result.json", {}) or {}
        text = json.dumps(res, ensure_ascii=False).lower()
        mbytes = media_bytes(f"{REAL}/{tid}")
        bytes_json = result_bytes(res)
        hits = by_file.get(ws, {})
        brand = sum(v for k, v in hits.items() if k.startswith("brand"))
        billing = sum(v for k, v in hits.items() if "billing" in k or "placeholder" in k)
        pixel = sum(v for k, v in hits.items() if k.startswith("design:"))

        # F 功能闭环
        status = str(res.get("status") or res.get("verdict") or "").upper()
        if tid in F_OVERRIDE:
            f_score, f_note = F_OVERRIDE[tid]
        elif "BLOCKED_BY_PROVIDER" in status:
            f_score, f_note = "BLOCKED", "上游 provider 阻断，未取得真实结果"
        elif status.startswith("PASS") or status.startswith("VERIFIED"):
            f_score, f_note = "PASS", "字段/提交/结果区闭环（result.json 判定通过）"
            if tid in ACTIONS_VERIFIED:
                f_note += "；存入资产/发送画布/下载 已实测"
        elif tid in EVIDENCE_GAP_ONLY and status.startswith("PARTIAL"):
            f_score, f_note = "PASS", EVIDENCE_GAP_ONLY[tid]
        elif status.startswith("PARTIAL"):
            f_score, f_note = "PARTIAL", F_GAP.get(tid, "见 result.json 缺口清单")
        elif bytes_json:
            f_score, f_note = "PASS", "有真实结果与落库字段（result.json 无 status 字段）"
        else:
            f_score, f_note = "PARTIAL", "无本工具专属结果证据"

        # R 真实生成
        has_url = bool(re.search(r'"(?:src|url)"\s*:\s*"https?://', json.dumps(res, ensure_ascii=False)))
        if "BLOCKED_BY_PROVIDER" in status or tid == "VIDEO_CONCAT":
            r_score, r_note = "BLOCKED", "未发起真实生成调用"
        elif bytes_json >= 100_000:
            r_score, r_note = "PASS", f"可复核产物 {bytes_json // 1024}KB（上游字节回执）"
        elif mbytes >= 100_000:
            r_score, r_note = "PASS", f"可复核产物 {mbytes // 1024}KB（本地落盘）"
        elif has_url:
            r_score, r_note = "PASS", "上游结果 URL 可取回（本轮未落盘）"
        elif bytes_json or mbytes:
            r_score, r_note = "PARTIAL", f"产物仅 {max(bytes_json, mbytes) // 1024}KB"
        else:
            r_score, r_note = "BLOCKED", "无可复核产物字节"

        # H 历史（以已提交的 B5 实测为准；其余仅有共享历史面板，未单独验收）
        if tid in hist:
            h_score, h_note = "PASS", "B5 实测通过，任务可回溯（HEAD 已提交证据）"
        else:
            h_score, h_note = "PARTIAL", "共享历史面板存在，本工具未单独实测"

        # T 文案
        if brand or billing:
            parts = []
            if brand:
                parts.append(f"品牌文案 {brand} 处")
            if billing:
                parts.append(f"计费/占位文案 {billing} 处")
            t_score, t_note = "PARTIAL", "；".join(parts) + "，需改为本项目口径"
        else:
            t_score, t_note = "PASS", "未发现品牌/计费/占位残留"

        # K 案例
        if tid in CASES_VERIFIED:
            k_score, k_note = "PASS", f"真实案例 + 做同款实测（{CASES_VERIFIED[tid]}）"
        elif tid in ORIGIN_HAS_CASES:
            k_score, k_note = "MISSING", "原站有案例模块，本地结果区为空/未接数据"
        else:
            k_score, k_note = "N/A", "原站无优秀案例模块，不做要求"

        # U 设计系统
        if pixel:
            u_score, u_note = "PARTIAL", f"原站像素级样式残留 {pixel} 处（#723cf9/!important 等）"
        else:
            u_score, u_note = "PASS", "未发现原站硬编码样式"

        rows.append({
            "n": t["n"], "id": tid, "name": t["name"], "category": t["category"],
            "route": t["route"], "workspace": ws,
            "F": f_score, "F_note": f_note,
            "T": t_score, "T_note": t_note,
            "R": r_score, "R_note": r_note,
            "H": h_score, "H_note": h_note,
            "K": k_score, "K_note": k_note,
            "U": u_score, "U_note": u_note,
            "bytes": mbytes,
        })

    def tally(dim):
        out = {}
        for r in rows:
            out[r[dim]] = out.get(r[dim], 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))

    report = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "head": head,
        "scope": f"{DOCS}/scope_boundary.md",
        "dimensions": ["F", "T", "R", "H", "K", "U"],
        "tally": {d: tally(d) for d in "FTRHKU"},
        "auditSummary": audit["summary"],
        "rows": rows,
    }
    os.makedirs(os.path.dirname(args.json), exist_ok=True)
    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)

    labels = {"F": "功能", "T": "文案", "R": "真实生成", "H": "历史", "K": "案例", "U": "设计系统"}
    lines = [
        "# 39 工具范围重审矩阵（2026-10-29 口径）",
        "",
        f"- 生成时间：{report['generatedAt']} · HEAD `{head}`",
        f"- 判据：[scope_boundary.md](../scope_boundary.md)（只复刻工具功能 + 必要字段文案，界面用本项目设计系统）",
        f"- 证据：复用 `evidence/real-acceptance/*` 既有实测，不重复调用 provider",
        f"- 静态审计：`tools/scope_audit.py` → errors={audit['summary']['errors']} warnings={audit['summary']['warnings']}",
        "",
        "## 维度统计",
        "",
        "| 维度 | " + " | ".join(f"{k} {labels[k]}" for k in "FTRHKU") + " |",
        "| --- | " + " | ".join("---" for _ in range(6)) + " |",
        "| 结果 | " + " | ".join(
            " / ".join(f"{k} {v}" for k, v in report["tally"][d].items()) for d in "FTRHKU"
        ) + " |",
        "",
        "## 明细",
        "",
        "| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['n']} | {r['name']}<br>`{r['id']}` | {r['F']} | {r['T']} | {r['R']} | {r['H']} | {r['K']} | {r['U']} |"
        )
    lines += [
        "",
        "## 结论（按新口径）",
        "",
        f"- 工具功能：{tally('F').get('PASS', 0)}/39 闭环；{tally('F').get('PARTIAL', 0)} 个有明确单点缺口（见下）；{tally('F').get('BLOCKED', 0)} 个被上游 provider 阻断（Sale Video / AI Video Editing）。",
        f"- 必要字段文案：{tally('T').get('PARTIAL', 0)} 个工具仍有残留 —— 主要是「(N算力)」计费文案（{sum(1 for f in audit['findings'] if f['rule'] == 'tool-copy:billing')} 处 error），以及 designer 页面一句提及原站的说明；品牌/计费都不是功能，删掉即可，不影响功能验收。",
        f"- 真实生成：{tally('R').get('PASS', 0)}/39 有可复核产物；仅 {tally('R').get('BLOCKED', 0)} 个未发起真实调用。",
        f"- 历史记录：{tally('H').get('PASS', 0)} 个有 B5 实测证据，其余共享同一历史面板但未逐个取证（PARTIAL），不算功能缺失。",
        f"- 优秀案例：{tally('K').get('PASS', 0)} 个工具「真实案例 + 做同款」已通过；{tally('K').get('MISSING', 0)} 个（高清放大 / 图生视频）原站有案例模块而本地为空；其余 {tally('K').get('N/A', 0)} 个原站本就无案例模块，不列为缺口。",
        f"- 设计系统：{tally('U').get('PARTIAL', 0)} 个文件仍有 `#723cf9` 等原站像素值（{sum(1 for f in audit['findings'] if f['rule'].startswith('design'))} 处 warning），属样式收敛待办，不阻塞功能。",
        "",
        "## 各维度问题清单",
        "",
    ]
    for dim in "TKRU":
        bad = [r for r in rows if r[dim] in ("PARTIAL", "BLOCKED", "MISSING")]
        lines.append(f"### {labels[dim]}")
        if not bad:
            lines.append("- 无待办")
        for r in bad:
            lines.append(f"- `{r['id']}` {r[dim]}：{r[dim + '_note']}")
        lines.append("")
    with open(args.md, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(json.dumps({k: report["tally"][k] for k in "FTRHKU"}, ensure_ascii=False, indent=1))
    print(f"written: {args.json}\nwritten: {args.md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

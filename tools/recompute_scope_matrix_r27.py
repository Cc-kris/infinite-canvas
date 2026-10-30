#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R27 独立矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
R25 = commit 7f656bd5 自带的 matrix（F PARTIAL 1 / PASS 38；T/R/H/U 全 PASS；K N/A 27+PASS 12）。
R25 唯一非全绿单元是 VIDEO_TRANSLATION.F = PARTIAL，缺口为「内容级语种/字幕未验 + 资产尺寸兜底」。
本轮不读工作区未提交内容，所有证据一律从 PIN 树 blob 现算 size+sha256。

本轮固定审计点
--------------
PIN = e2529d422b9f2f4b50209b12f73ec4e7bbd8e492（含 2dd097bb / eacc18f7 / e2529d42 三个待吸收提交）
`--check` 在任意后续 HEAD 上重跑都得到同一结论：读的是固定 PIN 树，不随后续提交漂移。

吸收（全部 committed，逐条机检）
--------------------------------
1) eacc18f7 → 存入资产不再写 1280×720 兜底（r22-g 回执，复用 r22-f 同一真实任务）：
   verify.json 12 条断言全 true；asset 768×768 / durationMs 6583 / bytes 1,249,837 / sha 7c15bdb2…；
   画布节点 natural 768×768、duration 6583、pending=null；asset/node/source 三腿 sha 与本工具
   现算的 06-result-video.mp4 完全一致 → R25 记录的 F1（尺寸兜底）**关闭**。
2) e2529d42 → 内容级复验（vt-content-r24）：
   结果音轨 ASR/LID 为中文（small 0.9967 / base 0.9927 / medium 0.9873；强制 language=en 仍出中文字符）；
   源片 VAD 三档阈值 0 段 / 0.0%（5.184s 纯音乐）→ 「把语音翻译成英语」的**有效输入前提不成立**；
   158 帧底部条带 OCR 在 en-US / zh-Hans 双 locale 下 0 命中（唯一命中 「CAT」 在 y=0.516 画面中部、
   conf 0.5）→ 字幕**未交付**。故 F 只能 PARTIAL，且必须把这三条 FAIL 证据写死。
3) 2dd097bb → 输出画幅默认跟随源片（registry/adapter/workspace + 单测）：
   只证明**请求侧**画幅与提示诚实（报告第 4 节自述「未重跑真实翻译」）→ 真实端到端画幅**仍未验**。
4) 门禁 → eacc18f7 四闸（install 0 / typecheck 0 error / 1514 tests 88 files / build 8830 模块 443 产物）。
   **时序刚需**：2dd097bb（画幅代码）晚于 eacc18f7，故该门禁**不覆盖**画幅改动 → 记为残余并机检。

判据（只收紧，不放宽）
----------------------
1. 只吸收 committed 证据；工作区未提交（use-asset-store 资产竞态、语言/画幅新 E2E、
   reports/vt-language-r26 空目录、.tmp_assetrace）一律不参与判据，只在 unabsorbed 中列明。
2. 升级必须通过硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持基线原判。
3. 仅反证可降级；「无法复核」不降级，但必须写进 nonClaims。
4. VIDEO_TRANSLATION.F **不得**仅因 /videos 成功或任务状态 succeeded 判绿：本轮内容级证据显示
   目标 English 的结果实为中文、源片无语音输入 → 维持 PARTIAL，并在 vtFailEvidence 单列 FAIL 证据。
5. R25 其余 38 工具六维逐格比对必须完全一致（逐工具断言 invariant.*.dims_unchanged）。
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

ROUND = "R27"
PIN_COMMIT = "e2529d422b9f2f4b50209b12f73ec4e7bbd8e492"
BASE_COMMIT = "7f656bd5cf98c953ebdf8f0c0bd843a539c31e71"
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261030-r25-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261030-r27-matrix"
GATE_FIXED_DIR = "docs/V1.0/reports/verify-head-r26-fixed"
GATE_COMMIT = "eacc18f7cb16d15ed40afaed6beeff13da1c39a9"
ASPECT_COMMIT = "2dd097bba50f49751f3b24e5d0527aa40b20e78b"
CONTENT_COMMIT = "e2529d422b9f2f4b50209b12f73ec4e7bbd8e492"
ASSET_COMMIT = "eacc18f7cb16d15ed40afaed6beeff13da1c39a9"
BASES = [
    "",
    DOCS + "/evidence/real-acceptance/",
    DOCS + "/evidence/",
    "evidence/real-acceptance/",
    "evidence/",
]
GATE_SRC_DEFAULT = GATE_FIXED_DIR
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

# ---- R27 新证据（均为 PIN 树已提交内容）
VT_R22G_PREFIX = "VIDEO_TRANSLATION/r22-g/"
VT_R22G = {
    "report": VT_R22G_PREFIX + "REPORT.md",
    "verify": VT_R22G_PREFIX + "verify.json",
    "probe_before": VT_R22G_PREFIX + "probe-before.json",
    "after_reload": VT_R22G_PREFIX + "after-reload-verify.json",
    "node_meta": VT_R22G_PREFIX + "node-meta.json",
    "stores": VT_R22G_PREFIX + "stores2.json",
}
VTC_DIR = f"{DOCS}/reports/vt-content-r24/"
VTC_ART = VTC_DIR + "artifacts/"
VTC_FILES = {
    "report": VTC_DIR + "REPORT.md",
    "summary": VTC_ART + "summary.json",
    "vad": VTC_ART + "vad-speech.json",
    "lid": VTC_ART + "lid-distribution.json",
    "asr_deep": VTC_ART + "asr-deep-result.json",
    "asr_medium": VTC_ART + "asr-medium-crosscheck.json",
    "ocr_res_full_en": VTC_ART + "ocr-result-full-en-US.jsonl",
    "ocr_res_full_zh": VTC_ART + "ocr-result-full-zh-Hans.jsonl",
    "ocr_res_band_en": VTC_ART + "ocr-result-band-en-US.jsonl",
    "ocr_res_band_zh": VTC_ART + "ocr-result-band-zh-Hans.jsonl",
    "ocr_ctl_en": VTC_ART + "ocr-controls-en-US.jsonl",
    "ocr_ctl_zh": VTC_ART + "ocr-controls-zh-Hans.jsonl",
}
VTA_REPORT = f"{DOCS}/reports/vt-aspect-r26/report.md"
VT_REGISTRY = "web/src/features/tools/registry/video-translation.ts"
VT_ADAPTER = "web/src/features/tools/adapters/video-translation.ts"
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")

# 审计时工作区存在但**未提交**的内容：只登记，不参与判据（untracked 项逐条断言 "不在 PIN 树"）
UNCOMMITTED = [
    {
        "id": "U1",
        "path": f"{DOCS}/reports/vt-language-r26/",
        "kind": "untracked-dir",
        "note": "语言/画幅新 E2E 证据目录（审计时仅有空 evidence/），未提交 → 不吸收",
    },
    {
        "id": "U2",
        "path": ".tmp_assetrace/",
        "kind": "untracked-dir",
        "note": "资产竞态复现脚本与 evidence-pristine/fixed-*.json，未提交 → 不吸收",
    },
    {
        "id": "U3",
        "path": "web/src/stores/use-asset-store.ts",
        "kind": "tracked-modified",
        "note": "资产竞态修复（工作区 +81/-16）未提交；PIN 树内仍是旧版本，本轮不据此改判",
    },
    {
        "id": "U4",
        "path": VT_ADAPTER,
        "kind": "tracked-modified",
        "note": "语言/画幅新 E2E 相关 adapter 改动（工作区 +76/-16）未提交",
    },
    {
        "id": "U5",
        "path": "web/src/features/tools/adapters/video-translation.test.ts",
        "kind": "tracked-modified",
        "note": "对应新 E2E 的测试用例（工作区 +36）未提交",
    },
]


def _jsonl_rows(rel: str, files: dict) -> list:
    p = resolve(rel, files)
    if not p:
        return []
    rows = []
    for line in blob_text(files[p]["blob"]).splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def up_video_translation_f27(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.F（R27）：吸收 eacc18f7 资产 sha + e2529d42 内容级 + 2dd097bb 画幅。

    硬口径：/videos 提交成功、任务 succeeded、字节/尺寸/三动作一致，只说明**工程链路**通，
    不说明「把源片语音翻译成目标英语并替换音轨/字幕」这件事成立。本轮内容级证据给出三条 FAIL。
    → 维持 PARTIAL；断言只做正向确证，未闭合项写进 nonClaims，绝不放宽成 PASS。
    """
    up_video_translation_f(a, files)  # 复用 r22-f 已有 55 条链路断言（任务键/字节/sha/画布元数据）

    # ---- 1) eacc18f7：资产/节点/源片三方字节 sha 对账（关闭 R25 的 F1 尺寸兜底）
    for k, rel in VT_R22G.items():
        a(f"vt.asset.committed.{k}", resolve(rel, files) is not None, rel)
    v = load_json(VT_R22G["verify"], files)
    asserts = v.get("assertions") or {}
    a(
        "vt.asset.verify.assertions_all_true",
        len(asserts) == 12 and all(bool(x) for x in asserts.values()),
        f"{sum(1 for x in asserts.values() if x)}/{len(asserts)}",
    )
    a("vt.asset.verify.same_task", v.get("task_id") == "task-mvuflf9e-djxprc", v.get("task_id"))
    a("vt.asset.verify.sha_matches_r22f_record", v.get("sha256_source_file") == VT_SHA, (v.get("sha256_source_file") or "")[:12])
    size, sha, _ = artifact_info(VT_FILES["video"], files)
    a("vt.asset.verify.sha_equals_our_blob_sha", sha == v.get("sha256_source_file") == VT_SHA, sha[:12])
    legs = v.get("stored_bytes") or {}
    for leg in ("asset", "node", "source", "asset_retry"):
        d = legs.get(leg) or {}
        a(f"vt.asset.leg.{leg}.sha", d.get("sha256") == VT_SHA, (d.get("sha256") or "")[:12])
        a(f"vt.asset.leg.{leg}.size", d.get("size") == size == VT_BYTES, d.get("size"))
    af = v.get("after_fix") or {}
    bf = v.get("before_fix") or {}
    mi = mp4_info(blob_bytes(files[resolve(VT_FILES["video"], files)]["blob"]))
    dims = (mi.get("tracks") or [{}])[0].get("dims")
    a("vt.asset.before_fix.was_fallback_1280x720", (bf.get("width"), bf.get("height")) == (1280, 720) and bf.get("durationMs") is None, f"{bf.get('width')}x{bf.get('height')}/{bf.get('durationMs')}")
    a("vt.asset.after_fix.dims_768", (af.get("width"), af.get("height")) == (768, 768), f"{af.get('width')}x{af.get('height')}")
    a("vt.asset.after_fix.dims_match_mp4", dims == [af.get("width"), af.get("height")], f"{dims} vs {af.get('width')}x{af.get('height')}")
    a("vt.asset.after_fix.duration_matches_mp4", abs((af.get("durationMs") or 0) - (mi.get("duration") or 0) * 1000) <= 20, f"{af.get('durationMs')} vs {mi.get('duration')}")
    a("vt.asset.after_fix.bytes", af.get("bytes") == size == VT_BYTES, af.get("bytes"))
    a("vt.asset.no_fallback_value_left", (af.get("width"), af.get("height")) != (1280, 720), f"{af.get('width')}x{af.get('height')}")
    meta = af.get("metadata") or {}
    a("vt.asset.provenance_preserved", meta.get("taskId") == v.get("task_id") and meta.get("toolId") == "VIDEO_TRANSLATION", f"{meta.get('toolId')}/{meta.get('taskId')}")
    node = v.get("canvas_node") or {}
    a("vt.asset.canvas_node.natural_768", (node.get("nw"), node.get("nh")) == (768, 768), f"{node.get('nw')}x{node.get('nh')}")
    a("vt.asset.canvas_node.duration", node.get("dur") == af.get("durationMs"), node.get("dur"))
    a("vt.asset.canvas_node.no_pending", node.get("pending") in (None, "", False), node.get("pending"))

    # ---- 2) e2529d42：内容级（VAD / LID / ASR / OCR），直接读 artifacts
    for k, rel in VTC_FILES.items():
        a(f"vt.content.committed.{k}", resolve(rel, files) is not None, rel)
    vad = load_json(VTC_FILES["vad"], files)
    src_bt = vad["tracks"]["source"]["by_threshold"]
    res_bt = vad["tracks"]["result"]["by_threshold"]
    a(
        "vt.content.source.no_speech_at_all_thresholds",
        all(src_bt[t]["segments"] == 0 and src_bt[t]["speech_ratio"] == 0.0 for t in ("0.3", "0.5", "0.7")),
        str({t: src_bt[t]["speech_ratio"] for t in ("0.3", "0.5", "0.7")}),
    )
    a(
        "vt.content.result.has_speech",
        all(res_bt[t]["speech_ratio"] > 0.9 for t in ("0.3", "0.5", "0.7")),
        str({t: res_bt[t]["speech_ratio"] for t in ("0.3", "0.5", "0.7")}),
    )
    lid = load_json(VTC_FILES["lid"], files)
    a("vt.content.lid.result_zh_small", lid["small/result"]["best"] == "zh" and lid["small/result"]["p"] >= 0.99, lid["small/result"]["p"])
    a("vt.content.lid.result_zh_base", lid["base/result"]["best"] == "zh" and lid["base/result"]["p"] >= 0.99, lid["base/result"]["p"])
    a("vt.content.lid.source_is_low_confidence", max(lid["small/source"]["p"], lid["base/source"]["p"]) < 0.70, f"{lid['small/source']['p']}/{lid['base/source']['p']}")
    med = load_json(VTC_FILES["asr_medium"], files)
    a(
        "vt.content.asr.medium_result_zh",
        med["result"]["lid"]["lang"] == "zh" and med["result"]["lid"]["p"] >= 0.98,
        med["result"]["lid"],
    )
    a(
        "vt.content.asr.medium_source_hallucination",
        "watching" in (med["source"]["segments"][0]["text"] or "").lower(),
        (med["source"]["segments"][0]["text"] or "")[:40],
    )
    deep = load_json(VTC_FILES["asr_deep"], files)
    forced_text = ""
    auto_lang = ""
    for k, val in deep.items():
        try:
            cfg = json.loads(k)
        except Exception:  # noqa: BLE001
            continue
        text = " ".join(seg.get("text") or "" for seg in (val.get("segments") or []))
        if cfg.get("language") == "en":
            forced_text = text
        if cfg.get("language") is None:
            auto_lang = (val.get("info") or {}).get("lang") or ""
    a("vt.content.asr.forced_en_still_cjk", bool(CJK_RE.search(forced_text)), forced_text[:40])
    a("vt.content.asr.auto_lang_zh", auto_lang == "zh", auto_lang)

    # OCR：不信 summary 单独结论，先独立复算 jsonl，再与 summary 对账
    full_en = _jsonl_rows(VTC_FILES["ocr_res_full_en"], files)
    full_zh = _jsonl_rows(VTC_FILES["ocr_res_full_zh"], files)
    band_en = _jsonl_rows(VTC_FILES["ocr_res_band_en"], files)
    band_zh = _jsonl_rows(VTC_FILES["ocr_res_band_zh"], files)
    ctl_en = _jsonl_rows(VTC_FILES["ocr_ctl_en"], files)
    ctl_zh = _jsonl_rows(VTC_FILES["ocr_ctl_zh"], files)

    OCR_CONF = 0.5  # 与 artifacts/summary.json 的统计口径一致：只计 conf>=0.5 的命中

    def hits(rows):
        return sum(1 for r in rows if any((t.get("conf") or 0) >= OCR_CONF for t in (r.get("texts") or [])))

    def hit_texts(rows):
        return [t for r in rows for t in (r.get("texts") or [])]

    def mid(y):
        return 0.25 < (y or 0) < 0.75

    a("vt.content.ocr.jsonl_frames_158", len(full_en) == len(full_zh) == len(band_en) == len(band_zh) == 158, f"{len(full_en)}/{len(full_zh)}/{len(band_en)}/{len(band_zh)}")
    a("vt.content.ocr.result_band_empty_en", hit_texts(band_en) == [], len(hit_texts(band_en)))
    a("vt.content.ocr.result_band_empty_zh", hit_texts(band_zh) == [], len(hit_texts(band_zh)))
    src_band = hit_texts(_jsonl_rows(VTC_ART + "ocr-source-band-en-US.jsonl", files)) + hit_texts(_jsonl_rows(VTC_ART + "ocr-source-band-zh-Hans.jsonl", files))
    a("vt.content.ocr.source_band_empty", src_band == [], len(src_band))
    # 高置信口径下 zh 全帧 0 命中；原始命中只有 4 条 conf=0.3 的画面中部噪声
    zh_texts = hit_texts(full_zh)
    a("vt.content.ocr.result_full_zh_no_confident_hit", hits(full_zh) == 0, f"conf>=0.5:{hits(full_zh)} raw:{len(zh_texts)}")
    a(
        "vt.content.ocr.result_full_zh_lowconf_is_midframe_noise",
        len(zh_texts) == 4
        and all((t.get("conf") or 0) < OCR_CONF for t in zh_texts)
        and all(mid(t.get("y")) for t in zh_texts),
        [(t.get("text"), t.get("conf"), t.get("y")) for t in zh_texts],
    )
    en_texts = hit_texts(full_en)
    a(
        "vt.content.ocr.result_full_en_only_midframe",
        len(en_texts) == 1 and mid(en_texts[0].get("y")),
        f"hits={len(en_texts)} y={[t.get('y') for t in en_texts]}",
    )
    a("vt.content.ocr.controls_positive_en", hits(ctl_en) >= 7, hits(ctl_en))
    a("vt.content.ocr.controls_positive_zh", hits(ctl_zh) >= 14, hits(ctl_zh))
    sumry = load_json(VTC_FILES["summary"], files)
    ocr = sumry.get("ocr") or {}
    a(
        "vt.content.ocr.summary_matches_jsonl",
        ocr["result-full-en-US"]["hits"] == hits(full_en)
        and ocr["result-full-zh-Hans"]["hits"] == hits(full_zh)
        and ocr["result-band-en-US"]["bottom_band_hits"] == 0
        and ocr["result-band-zh-Hans"]["bottom_band_hits"] == 0
        and ocr["result-full-en-US"]["bottom_band_hits"] == 0,
        f"en_full={ocr['result-full-en-US']['hits']} zh_full={ocr['result-full-zh-Hans']['hits']} (jsonl conf>=0.5: en={hits(full_en)} zh={hits(full_zh)})",
    )

    # ---- 3) 报告文本硬校验（不得宣称翻译成功 / 必须写明前提不成立）
    vtc_rep = blob_text(files[resolve(VTC_FILES["report"], files)]["blob"])
    a("vt.content.report.records_fail", "FAIL" in vtc_rep, "REPORT.md 含 FAIL")
    a("vt.content.report.records_premise_invalid", "前提不成立" in vtc_rep, "REPORT.md 含「前提不成立」")
    a("vt.content.report.records_no_subtitle", "没有任何字幕" in vtc_rep or "字幕未提供" in vtc_rep, "REPORT.md 记录字幕未交付")
    a("vt.content.report.no_success_claim", "翻译成功" not in vtc_rep, "REPORT.md 未出现「翻译成功」")

    # ---- 4) 2dd097bb：画幅修复只在请求侧，不得据此宣称真实画幅已验
    a("vt.aspect.committed.report", resolve(VTA_REPORT, files) is not None, VTA_REPORT)
    vta_rep = blob_text(files[resolve(VTA_REPORT, files)]["blob"])
    a("vt.aspect.report.no_real_rerun", "未重跑真实翻译" in vta_rep, "报告自述未重跑真实翻译")
    reg = blob_text(files[resolve(VT_REGISTRY, files)]["blob"])
    a("vt.aspect.code.registry_has_output_ratio", "outputRatio" in reg and "planVideoTranslationOutput" in reg, "registry 含 outputRatio/planVideoTranslationOutput")
    a("vt.aspect.code.registry_has_source_ratio", "VIDEO_TRANSLATION_RATIO_SOURCE" in reg, "含 source 档位常量")
    a("vt.aspect.commit_touches_web_src", bool(git("show", "--name-only", "--format=", ASPECT_COMMIT, "--", "web/src").strip()), ASPECT_COMMIT[:8])
    a("vt.aspect.not_verified_end_to_end", "未重跑真实翻译" in vta_rep and "未经实测" in vta_rep, "真实端到端画幅未验")

    # ---- 5) 结论硬约束：F 不得为 PASS
    a("vt.f.verdict_is_not_pass", True, "PARTIAL（见 note）")

    tid = "task-mvuflf9e-djxprc"
    return {
        "verdict": "PARTIAL",
        "note": (
            f"**R27：维持 PARTIAL（不是 PASS）**。工程链路仍成立：真实任务 `{tid}`（上游 `task_dYZ…`）succeeded，"
            f"四条腿字节同为 **{VT_BYTES:,}B**；eacc18f7 的 r22-g 回执把资产/画布/源片三腿 sha256 全部绑定到 "
            f"`{VT_SHA[:8]}…`，asset data 由兜底的 1280×720 校正为 **768×768 / 6583ms**（与本工具自解析 mp4 一致），"
            f"溯源 taskId=resultItemId 保留 → R25 的 F1 关闭。"
            "**但任务目标未达成，三条 FAIL 证据（内容级，e2529d42）：**"
            "①目标语言英语 → 实测结果音轨为中文（LID small 0.9967 / base 0.9927 / ASR medium 0.9873；强制 language=en 仍转出中文字符）；"
            "②字幕 → 158 帧底部条带 OCR 在 en-US/zh-Hans 双 locale 下均 0 命中；full frame 高置信(conf≥0.5)命中仅 en 1 条「CAT」(y=0.516 画面中部，属背景文字)，zh 侧 4 条均为 conf=0.3 的画面中部噪声；无字幕流、无烧录字幕；"
            "③有效输入前提不成立 → 源片 VAD 在 0.3/0.5/0.7 三档均为 0 段 / 0.0%（5.184s 纯音乐），"
            "而结果片旁白内容是在朗读任务说明，并非对源片语音的翻译。"
            "此外 2dd097bb 的画幅修复只覆盖**请求侧**（注册表 outputRatio 默认 source + 偏差提示 + 单测），"
            "报告自述「未重跑真实翻译」，故真实输出画幅仍未验；且该提交晚于门禁 eacc18f7，未被任何四闸覆盖。"
            "→ 维持 PARTIAL；升 PASS 的最小闭合集：用**有语音**的源片重跑一次真实任务，并交付 目标语言 ASR 断言 + 字幕文件/烧录帧 OCR 命中 + 真实输出画幅 三件证据。"
        ),
        "evidence": [
            VT_R22G["verify"],
            VTC_FILES["report"],
            VTC_FILES["vad"],
            VTC_FILES["lid"],
            VTC_FILES["asr_medium"],
            VTC_FILES["summary"],
            VTA_REPORT,
        ],
        "risks": [
            "结果音轨为中文而任务要求英语（LID/ASR 三模型一致）→ 目标语言未满足，不能表述为「翻译成功」",
            "无字幕流且 158 帧底部条带无烧录字幕 → 「译制语音与字幕统一使用该语言」的字幕一半未交付",
            "源片 0% 语音（纯音乐）→ 本次运行不能作为「语音翻译」能力的证据",
            "画幅修复仅请求侧 + 单测，真实端到端画幅未实测，且未被最新四闸覆盖",
        ],
    }


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


def load_json_lenient(rel: str, files: dict) -> tuple[dict, bool]:
    """先按严格 JSON 解析；失败则按 Python 字面量容错解析（记录 strict=False）。"""
    import ast

    p = resolve(rel, files)
    if not p:
        return {}, False
    s = blob_text(files[p]["blob"])
    try:
        return json.loads(s), True
    except Exception:  # noqa: BLE001
        try:
            fixed = re.sub(r"\btrue\b", "True", re.sub(r"\bfalse\b", "False", re.sub(r"\bnull\b", "None", s)))
            v = ast.literal_eval(fixed)
            return (v if isinstance(v, dict) else {}), False
        except Exception:  # noqa: BLE001
            return {}, False


# ---------------------------------------------------------------- 自研 mp4 剖析
def mp4_info(data: bytes) -> dict:
    """不用 ffprobe：直接解析 moov/mvhd/tkhd/stsz，返回时长+每轨尺寸+样本数。"""
    import struct

    def boxes(buf: bytes, start: int, end: int):
        i = start
        while i + 8 <= end:
            size = struct.unpack(">I", buf[i : i + 4])[0]
            typ = buf[i + 4 : i + 8]
            if size == 1:
                size = struct.unpack(">Q", buf[i + 8 : i + 16])[0]
            if size < 8 or i + size > end:
                break
            yield typ, i, i + size
            i += size

    try:
        moov = [x for x in boxes(data, 0, len(data)) if x[0] == b"moov"][0]
    except IndexError:
        return {}
    mvhd = None
    tracks: list[dict] = []
    for typ, s, e in boxes(data, moov[1] + 8, moov[2]):
        if typ == b"mvhd":
            v = data[s + 8]
            if v == 0:
                ts, dur = struct.unpack(">II", data[s + 20 : s + 28])
            else:
                ts = struct.unpack(">I", data[s + 28 : s + 32])[0]
                dur = struct.unpack(">Q", data[s + 32 : s + 40])[0]
            mvhd = (ts, dur)
        if typ == b"trak":
            w = h = samples = None
            for t2, s2, e2 in boxes(data, s + 8, e):
                if t2 == b"tkhd":
                    w, h = struct.unpack(">II", data[e2 - 8 : e2])
                if t2 == b"mdia":
                    for t3, s3, e3 in boxes(data, s2 + 8, e2):
                        if t3 != b"minf":
                            continue
                        for t4, s4, e4 in boxes(data, s3 + 8, e3):
                            if t4 != b"stbl":
                                continue
                            for t5, s5, e5 in boxes(data, s4 + 8, e4):
                                if t5 == b"stsz":
                                    samples = struct.unpack(">I", data[s5 + 16 : s5 + 20])[0]
            tracks.append(
                {"dims": [w >> 16, h >> 16] if w else None, "samples": samples}
            )
    if not mvhd or not mvhd[0]:
        return {"tracks": tracks}
    return {
        "duration": round(mvhd[1] / mvhd[0], 3),
        "timescale": mvhd[0],
        "tracks": tracks,
    }


# ---------------------------------------------------------------- VIDEO_TRANSLATION.F
VT_R22F = VT_R22F_PREFIX
VT_FILES = {
    "src_sha": VT_R22F + "01-source-sha256.txt",
    "task_running": VT_R22F + "02-tool-task-record.json",
    "net": VT_R22F + "03-mainworld-net-poll.json",
    "proxy": VT_R22F + "04-proxy-log-excerpt.txt",
    "task_ok": VT_R22F + "05-tool-task-record-succeeded.json",
    "sha_txt": VT_R22F + "06-result-sha256.txt",
    "video": VT_R22F + "06-result-video.mp4",
    "idb": VT_R22F + "07-canvas-and-asset-idb.json",
    "envelope": VT_R22F + "08-audio-envelope-compare.json",
    "report": VT_R22F + "REPORT.md",
}
VT_BYTES = 1249837
VT_SHA = "7c15bdb23f0c95630c81a3ed3fb8d244772c17a532394722f41681cad169274c"


def up_video_translation_f(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.F：cd553cc4 已提交 r22-f 回执 → 逐条机检，**维持 PARTIAL**（缺口缩窄）。

    R23 判 PARTIAL 的理由是「PIN 树无三动作回执、证据未提交」，并写明最小硬证据缺口：
      (a) 该次真实运行的回执需提交（任务键、上游回执、结果字节 sha）；
      (b) 同一回执内需闭合下载/存资产/发画布三动作的**字节与 sha 一致性**。
    本轮 (a) 已闭合（05/06/06-sha256/07 均 committed，任务键自洽、sha 现算一致）；
    (b) 仅闭了**字节**（四腿同为 1,249,837B），sha 只有下载腿可算 —— asset/canvas 两腿
    在仓库内既无 blob 也无声明 sha，故「三动作 sha 一致」无从复核 → **不升级**。
    本函数只把已闭合事实写成正向断言，未闭合项写入 nonClaims / residual，不放宽 rubric。
    """
    for k, rel in VT_FILES.items():
        a(f"vt.committed.{k}", resolve(rel, files) is not None, rel)

    t0 = load_json(VT_FILES["task_running"], files)
    t1 = load_json(VT_FILES["task_ok"], files)
    idb = load_json(VT_FILES["idb"], files)
    tid = t1.get("id") or ""
    a("vt.task.id.real", bool(TASK_RE.match(tid)), tid)
    a("vt.task.toolId", t1.get("toolId") == "VIDEO_TRANSLATION", t1.get("toolId"))
    a("vt.task.capability", t1.get("capability") == "video", t1.get("capability"))
    a("vt.task.status", t1.get("status") == "succeeded", t1.get("status"))
    a("vt.task.upstreamId", str(t1.get("upstreamTaskId") or "").startswith("task_"), t1.get("upstreamTaskId"))
    a("vt.task.noTransient", t1.get("transientFailures") == 0, t1.get("transientFailures"))
    a("vt.task.noPayloadDrop", "payloadDropped\": true" not in json.dumps(t1), "checked")
    # 同一次运行：running → succeeded 记录必须是同一任务（clientOperationId+fingerprint+上游键）
    a("vt.task.sameOp", t0.get("clientOperationId") == t1.get("clientOperationId"), t0.get("clientOperationId") == t1.get("clientOperationId"))
    a("vt.task.sameFingerprint", t0.get("fingerprint") == t1.get("fingerprint"), t0.get("fingerprint"))
    a("vt.task.sameUpstream", t0.get("upstreamTaskId") == t1.get("upstreamTaskId"), t0.get("upstreamTaskId"))
    a("vt.task.runningStatus", t0.get("status") == "running", t0.get("status"))
    a("vt.task.ordered", (t1.get("finishedAt") or 0) > (t0.get("submittedAt") or 0), f"{t0.get('submittedAt')}→{t1.get('finishedAt')}")

    items = (t1.get("result") or {}).get("items") or []
    a("vt.result.count", len(items) == 1, len(items))
    item = items[0] if items else {}
    a("vt.result.id", item.get("id") == f"{tid}-0", item.get("id"))
    a("vt.result.kind", item.get("kind") == "video", item.get("kind"))
    a("vt.result.storageKey.taskbound", str(item.get("storageKey") or "").startswith(f"tool-result:{tid}:0:"), item.get("storageKey"))
    a("vt.result.bytes", item.get("bytes") == VT_BYTES, item.get("bytes"))
    a("vt.result.mime", item.get("mimeType") == "video/mp4", item.get("mimeType"))
    a("vt.result.payloadDropped", item.get("payloadDropped") is False, item.get("payloadDropped"))

    # ---- 动作腿 1：下载（落盘产物 + 声明 sha 文本）
    vbytes, vsha = blob_sha(files[resolve(VT_FILES["video"], files)]["blob"])
    a("vt.leg.download.size", vbytes == VT_BYTES, vbytes)
    a("vt.leg.download.sha", vsha == VT_SHA, vsha[:16])
    sha_txt = blob_text(files[resolve(VT_FILES["sha_txt"], files)]["blob"])
    a("vt.leg.download.shaTxt.matches", VT_SHA in sha_txt and "06-result-video.mp4" in sha_txt, sha_txt.strip()[:80])

    # ---- 动作腿 2/3：存资产 + 发画布（同一 IDB 导出）
    canvas = idb.get("canvas") or {}
    node = canvas.get("node") or {}
    nmeta = node.get("metadata") or {}
    asset = idb.get("asset") or {}
    adata = asset.get("data") or {}
    ameta = asset.get("metadata") or {}
    a("vt.leg.canvas.projectCount", canvas.get("projectCount") == 1, canvas.get("projectCount"))
    a("vt.leg.canvas.nodeCount", canvas.get("nodeCount") == 1, canvas.get("nodeCount"))
    a("vt.leg.canvas.type", node.get("type") == "video", node.get("type"))
    a("vt.leg.canvas.bytes", nmeta.get("bytes") == VT_BYTES, nmeta.get("bytes"))
    a("vt.leg.canvas.storageKey", str(nmeta.get("storageKey") or "").startswith("video:"), nmeta.get("storageKey"))
    a("vt.leg.canvas.mime", nmeta.get("mimeType") == "video/mp4", nmeta.get("mimeType"))
    a("vt.leg.canvas.status", nmeta.get("status") == "success", nmeta.get("status"))
    a("vt.leg.asset.count", asset.get("count") == 1, asset.get("count"))
    a("vt.leg.asset.bytes", adata.get("bytes") == VT_BYTES, adata.get("bytes"))
    a("vt.leg.asset.storageKey", str(adata.get("storageKey") or "").startswith("video:"), adata.get("storageKey"))
    a("vt.leg.asset.toolId", ameta.get("toolId") == "VIDEO_TRANSLATION", ameta.get("toolId"))
    a("vt.leg.asset.taskId", ameta.get("taskId") == tid, ameta.get("taskId"))
    a("vt.leg.asset.resultItemId", ameta.get("resultItemId") == item.get("id"), ameta.get("resultItemId"))
    a("vt.leg.asset.resultAssetKey", tid in str(ameta.get("resultAssetKey") or ""), ameta.get("resultAssetKey"))
    a("vt.leg.asset.distinct", (adata.get("storageKey") or "") != (nmeta.get("storageKey") or ""), "asset≠canvas")

    # 四条腿字节集合（结果 / 下载 / 存资产 / 发画布）
    legs = {
        "result": item.get("bytes"),
        "download": vbytes,
        "asset": adata.get("bytes"),
        "canvas": nmeta.get("bytes"),
    }
    a("vt.legs.count", sum(v is not None for v in legs.values()) >= 4, legs)
    a("vt.legs.all_bytes_equal", len({v for v in legs.values() if v is not None}) == 1 and all(v == VT_BYTES for v in legs.values()), str(legs))

    # ---- 独立复核：本工具自己解析 mp4，与画布节点声明的画面参数互证
    mi = mp4_info(blob_bytes(files[resolve(VT_FILES["video"], files)]["blob"]))
    dims = (mi.get("tracks") or [{}])[0].get("dims")
    a("vt.mp4.dims", dims == [768, 768], dims)
    a("vt.mp4.duration", mi.get("duration") == 6.584, mi.get("duration"))
    a("vt.mp4.vs_canvas.dims", dims == [nmeta.get("naturalWidth"), nmeta.get("naturalHeight")], f"{dims} vs {nmeta.get('naturalWidth')}x{nmeta.get('naturalHeight')}")
    a("vt.mp4.vs_canvas.duration", abs((nmeta.get("durationMs") or 0) - (mi.get("duration") or 0) * 1000) <= 20, f"{nmeta.get('durationMs')} vs {mi.get('duration')}")

    # ---- 回执自述的诚实边界（不得把未验项写成通过）
    rep = blob_text(files[resolve(VT_FILES["report"], files)]["blob"])
    a("vt.report.three_actions", all(k in rep for k in ("下载", "存入资产", "发送画布")), "三动作")
    a("vt.report.honest_gap", "未验证项" in rep, "含未验证项小节")
    return {
        "verdict": "PARTIAL",
        "note": (
            f"R25 吸收 cd553cc4（r22-f）后缺口缩窄但**不升级**。已闭合：真实任务 `{tid}`（上游 `{t1.get('upstreamTaskId')}`）"
            f"status=succeeded、running→succeeded 同一 clientOperationId/fingerprint/上游键、无 payloadDropped；"
            f"四条腿字节同为 **{VT_BYTES:,}B** —— 任务结果条 / 面板下载落盘 `06-result-video.mp4`"
            f"（sha `{vsha[:8]}…` 由本工具 `git cat-file blob` 现算，与 `06-result-sha256.txt` 声明一致）"
            f"/ 存入资产 `{adata.get('storageKey')}` / 发送画布节点 `{nmeta.get('storageKey')}`，"
            f"资产 metadata 与画布节点均绑定同一 taskId+resultItemId，两腿 storageKey 互异（非同键复用）；"
            f"本工具另自行解析 mp4：{dims[0]}×{dims[1]} / {mi.get('duration')}s / {(mi.get('tracks') or [{}])[0].get('samples')} 个视频样本，"
            f"与画布节点 naturalWidth/naturalHeight={nmeta.get('naturalWidth')}×{nmeta.get('naturalHeight')}、durationMs={nmeta.get('durationMs')} 互证。"
            "**仍未闭合（R23 已写明的最小缺口 b）**：asset / canvas 两腿在仓库内既无 blob 也无声明 sha256，"
            "故「三动作字节+sha 一致」只做到字节一致，sha 一侧无从复核；另 asset.data.width/height=1280×720 为兜底值与真实画面冲突（F1）。"
            "→ 维持 PARTIAL；补齐方式：在动作回执内记录 asset/canvas 两键的实际 sha256（或各存一份产物 blob）即可直接升 PASS。"
        ),
        "evidence": [VT_FILES[k] for k in ("task_running", "task_ok", "sha_txt", "video", "idb", "report")],
    }


# ---------------------------------------------------------------- AI_VIDEO_EDITING 新证据
AVE_FRESH = "AI_VIDEO_EDITING/r22-h/"
AVE_FRESH_FILES = {
    "reload": AVE_FRESH + "01-reload-restore.json",
    "result": AVE_FRESH + "02-task-result.json",
    "report": AVE_FRESH + "REPORT.md",
    "video": AVE_FRESH + "result-video.mp4",
    "source": AVE_FRESH + "source-input.mp4",
    "ffprobe": AVE_FRESH + "result-video.ffprobe.txt",
    "src_ffprobe": AVE_FRESH + "source-input.ffprobe.txt",
}


def up_ai_video_editing_fresh_h(a: Assertions, files: dict) -> dict:
    """AI_VIDEO_EDITING.H：2ecd958d 新证据（全新真实任务 + reload 分槽恢复 + 结果视频结构对账）。

    H 判据含「下载/入库/发画布字节须由已提交产物同尺寸复核」；本证据目录**没有**三动作回执，
    故本轮**不改判**（保持 R21 的 PASS），仅把「新一次真实 generation 仍成立」作为加强佐证，
    并把「无三动作字节腿」写入 nonClaims，避免被误读成三腿已闭合。
    """
    for k, rel in AVE_FRESH_FILES.items():
        a(f"ave2.committed.{k}", resolve(rel, files) is not None, rel)

    rl, rl_strict = load_json_lenient(AVE_FRESH_FILES["reload"], files)
    rs = load_json(AVE_FRESH_FILES["result"], files)
    tid = ((rs.get("task") or {}).get("id")) or ""
    a("ave2.task.id.real", bool(TASK_RE.match(tid)), tid)
    a("ave2.task.status", (rs.get("task") or {}).get("status") == "succeeded", (rs.get("task") or {}).get("status"))
    a("ave2.reload.navType", rl.get("navType") == "reload", rl.get("navType"))
    slots = rl.get("slots") or []
    a("ave2.reload.slots.2", len(slots) == 2, len(slots))
    a("ave2.reload.slot.src.1", len(slots[0]) == 1 if slots else False, len(slots[0]) if slots else None)
    a("ave2.reload.slot.ref.1", len(slots[1]) == 1 if len(slots) > 1 else False, len(slots[1]) if len(slots) > 1 else None)
    a("ave2.reload.slot.src.video", "video/mp4" in (slots[0][0].get("meta") if slots else ""), (slots[0][0].get("meta") if slots else ""))
    a("ave2.reload.slot.ref.image", "image/png" in (slots[1][0].get("meta") if len(slots) > 1 else ""), (slots[1][0].get("meta") if len(slots) > 1 else ""))
    sv = ((rl.get("draftAfterReload") or {}).get("slotValues")) or {}
    a("ave2.reload.slotValues.src", len(sv.get("assetSlot:source-video") or []) == 1, sv.get("assetSlot:source-video"))
    a("ave2.reload.slotValues.ref", len(sv.get("assetSlot:reference-images") or []) == 1, sv.get("assetSlot:reference-images"))
    a("ave2.reload.notCrossed", (sv.get("assetSlot:source-video") or []) != (sv.get("assetSlot:reference-images") or []), "src≠ref")

    vids = rs.get("resultVideos") or []
    sizes = [v.get("bytes") for v in vids if isinstance(v, dict)]
    a("ave2.result.has_result", 1984977 in sizes, sizes)
    a("ave2.result.has_source", 1297168 in sizes, sizes)
    a("ave2.result.section", "已完成" in (rs.get("resultSectionText") or ""), (rs.get("resultSectionText") or "")[:40])
    a("ave2.result.mime", all(v.get("type") == "video/mp4" for v in vids if isinstance(v, dict)), "video/mp4")

    # 产物 + ffprobe 文本 + 本工具独立解析
    rb = files[resolve(AVE_FRESH_FILES["video"], files)]["blob"]
    rbytes, rsha = blob_sha(rb)
    a("ave2.artifact.result.size", rbytes == 1984977, rbytes)
    sb = files[resolve(AVE_FRESH_FILES["source"], files)]["blob"]
    sbytes, _ = blob_sha(sb)
    a("ave2.artifact.source.size", sbytes == 1297168, sbytes)
    mi = mp4_info(blob_bytes(rb))
    si = mp4_info(blob_bytes(sb))
    rdims = (mi.get("tracks") or [{}])[0].get("dims")
    sdims = (si.get("tracks") or [{}])[0].get("dims")
    a("ave2.mp4.result.dims", rdims == [1344, 768], rdims)
    a("ave2.mp4.result.duration", mi.get("duration") == 6.584, mi.get("duration"))
    a("ave2.mp4.result.frames", (mi.get("tracks") or [{}])[0].get("samples") == 158, (mi.get("tracks") or [{}])[0].get("samples"))
    a("ave2.mp4.source.dims", sdims == [1344, 768], sdims)
    a("ave2.mp4.source.duration", si.get("duration") == 5.167, si.get("duration"))
    a("ave2.mp4.source.frames", (si.get("tracks") or [{}])[0].get("samples") == 124, (si.get("tracks") or [{}])[0].get("samples"))
    a("ave2.mp4.result_differs_from_source", mi.get("duration") != si.get("duration"), f"{mi.get('duration')} vs {si.get('duration')}")
    fpt = blob_text(files[resolve(AVE_FRESH_FILES["ffprobe"], files)]["blob"])
    a("ave2.ffprobe.width", "width=1344" in fpt, "width=1344")
    a("ave2.ffprobe.frames", "nb_frames=158" in fpt, "nb_frames=158")
    a("ave2.ffprobe.size", "size=1984977" in fpt, "size=1984977")

    rep = blob_text(files[resolve(AVE_FRESH_FILES["report"], files)]["blob"])
    a("ave2.report.honest_gap", ("发现与风险" in rep) and ("不完全一致" in rep), "含『发现与风险』小节且自陈时长差异")

    status = "全部断言通过" if a.ok() else "存在失败断言（见矩阵）"
    return {
        "verdict": "PASS",
        "note": (
            f"R25 新增佐证（2ecd958d / r22-h）：**另一次**真实任务 `{tid}`（旧证据是 r21 recovery 回执，本轮不复用）"
            f"—— 刷新后两上传区各回本槽（源 1/1、参考 1/1，修复前源槽会串入 ref.png），任务续跑至 succeeded；"
            f"结果视频 {rbytes:,}B（sha `{rsha[:8]}…`），本工具解析 {rdims[0]}×{rdims[1]} / {mi.get('duration')}s / "
            f"{(mi.get('tracks') or [{}])[0].get('samples')} 帧，与源片 {si.get('duration')}s / {(si.get('tracks') or [{}])[0].get('samples')} 帧可区分。"
            f"（{status}）"
            "**未主张**：该目录无下载/存资产/发画布三动作字节腿（仅结果区三按钮文案），故不构成 F 证据；"
            "上游时长/画幅与请求不完全一致属上游行为，未做前端兜底验证。"
        ),
        "risks": (
            []
            if rl_strict
            else [
                "01-reload-restore.json 是单引号 Python-repr 而非合法 JSON（json.loads 报 line 1 column 2），"
                "本工具用 ast.literal_eval 容错解析；机器可读性不达标，建议重导为 JSON"
            ]
        ),
        "evidence": [AVE_FRESH_FILES[k] for k in ("reload", "result", "video", "ffprobe", "report")],
    }


UPGRADES = [
    ("REMOVE_PEN", "H", up_remove_pen_h),
    ("IMAGE_TEXT_EDIT", "H", up_image_text_edit_h),
    ("AI_VIDEO_EDITING", "H", up_ai_video_editing_h),
    ("AI_VIDEO_EDITING", "H", up_ai_video_editing_fresh_h),
    ("VIDEO_CONCAT", "F", up_video_concat_f),
    ("VIDEO_TRANSLATION", "F", up_video_translation_f27),
]



# ---------------------------------------------------------------- 门禁
GATE_FIXED_COMMIT = GATE_COMMIT


def _strip_ansi(s: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", s)


def read_gate(gate_dir: str, files: dict | None = None) -> dict:
    """从 PIN 树读取 6313501f 提交的固定 HEAD 三闸日志（不读工作区、不复用未提交日志）。"""
    files = files if files is not None else pin_files()

    def raw(rel: str) -> bytes:
        p = resolve(rel, files)
        return blob_bytes(files[p]["blob"]) if p else b""

    def txt(rel: str) -> str:
        return _strip_ansi(raw(rel).decode("utf-8", "replace"))

    summ: dict = {}
    try:
        summ = json.loads(raw(f"{gate_dir}/summary.json").decode("utf-8"))
    except Exception:  # noqa: BLE001
        summ = {}

    exits = {}
    for name in ("typecheck", "buntest", "build", "tsc-listfiles", "install"):
        v = txt(f"{gate_dir}/logs/{name}.exit").strip()
        exits[name] = (v == "0")

    tc = txt(f"{gate_dir}/logs/typecheck.log")
    test = txt(f"{gate_dir}/logs/buntest.log")
    build = txt(f"{gate_dir}/logs/build.log")
    lf = txt(f"{gate_dir}/logs/tsc-listfiles.log")
    dist = [x for x in txt(f"{gate_dir}/logs/dist-files.txt").splitlines() if x.strip()]

    mt = re.search(r"^\s*(\d+) pass\s*$", test, re.M)
    mf = re.search(r"^\s*(\d+) fail\s*$", test, re.M)
    me = re.search(r"(\d+) expect\(\) calls", test)
    mran = re.search(r"Ran (\d+) tests across (\d+) files", test)
    mb = re.search(r"built in (?:(\d+)m )?([\d.]+)s", build)
    mmod = re.search(r"(\d+) modules transformed", build)
    mjs = re.search(r"dist/assets/(index-[A-Za-z0-9_-]+\.js)\s+([\d,]+(?:\.\d+)?) kB", build)

    return {
        "source": f"{gate_dir} (PIN tree blob)",
        "commit": summ.get("head_commit"),
        "commitTree": summ.get("head_commit_tree"),
        "webTree": summ.get("head_web_tree"),
        "commitSubject": summ.get("head_commit_subject"),
        "verdictOfRecord": summ.get("verdict"),
        "isolation": summ.get("isolation") or {},
        "toolchain": summ.get("toolchain") or {},
        "exits": exits,
        "install": {"exit0": exits["install"], "packages": int((re.search(r"(\d+) packages installed", txt(f"{gate_dir}/logs/install.log")) or [None, None])[1] or 0) or None},
        "typecheck": {
            "exit0": exits["typecheck"],
            "errorTs": len(re.findall(r"error TS\d+", tc)),
            "seconds": float((re.search(r"real ([\d.]+)", tc) or [None, None])[1] or 0) or None,
        },
        "test": {
            "exit0": exits["buntest"],
            "pass": int(mt.group(1)) if mt else None,
            "fail": int(mf.group(1)) if mf else None,
            "expect": int(me.group(1)) if me else None,
            "total": int(mran.group(1)) if mran else None,
            "files": int(mran.group(2)) if mran else None,
        },
        "build": {
            "exit0": exits["build"],
            "seconds": (int(mb.group(1) or 0) * 60 + float(mb.group(2))) if mb else None,
            "modules": int(mmod.group(1)) if mmod else None,
            "entryJs": mjs.group(1) if mjs else None,
            "entryJsKb": float(mjs.group(2).replace(",", "")) if mjs else None,
            "distFiles": len(dist),
        },
        "tscListFiles": {"lines": len(lf.splitlines()), "webSrcEntries": lf.count("web/src/")},
    }


def gate_assertions(a: Assertions, gate: dict, files: dict | None = None) -> None:
    """四闸硬断言 + 覆盖范围断言（绑定 eacc18f7；**不覆盖**其后 2dd097bb 的画幅改动）。"""
    a("gate.pin_binding.summary_head", gate.get("commit") == GATE_COMMIT, gate.get("commit"))
    a("gate.pin_binding.subject", "1280x720" in (gate.get("commitSubject") or ""), (gate.get("commitSubject") or "")[:40])
    gate_web = git("rev-parse", f"{GATE_COMMIT}:web").strip()
    pin_web = git("rev-parse", f"{PIN_COMMIT}:web").strip()
    a("gate.pin_binding.web_tree_matches_gate_commit", gate.get("webTree") == gate_web, f"{str(gate.get('webTree'))[:8]}/{gate_web[:8]}")
    a("gate.pin_binding.gate_is_ancestor_of_pin", _is_ancestor(GATE_COMMIT, PIN_COMMIT), GATE_COMMIT[:8])
    a("gate.coverage.pin_web_differs_from_gate", pin_web != gate_web, f"PIN {pin_web[:8]} vs gate {gate_web[:8]}")
    a("gate.coverage.aspect_commit_touches_web_src", bool(git("show", "--name-only", "--format=", ASPECT_COMMIT, "--", "web/src").strip()), ASPECT_COMMIT[:8])
    iso = gate.get("isolation") or {}
    a("gate.pin_binding.isolation_blob_check", (iso.get("whole_tree_blob_check") or {}).get("mismatch") == 0, str(iso.get("whole_tree_blob_check")))
    a("gate.pin_binding.isolation_web_src_blob_check", (iso.get("web_src_blob_check") or {}).get("mismatch") == 0, str(iso.get("web_src_blob_check")))

    a("gate.exit.install", gate["install"]["exit0"] is True, gate["install"]["exit0"])
    a("gate.exit.typecheck", gate["typecheck"]["exit0"] is True, gate["typecheck"]["exit0"])
    a("gate.exit.test", gate["test"]["exit0"] is True, gate["test"]["exit0"])
    a("gate.exit.build", gate["build"]["exit0"] is True, gate["build"]["exit0"])
    a("gate.typecheck.no_error_ts", gate["typecheck"]["errorTs"] == 0, gate["typecheck"]["errorTs"])
    t = gate["test"]
    a("gate.test.pass", t["pass"] == 1514, t["pass"])
    a("gate.test.fail0", t["fail"] == 0, t["fail"])
    a("gate.test.files", t["files"] == 88, t["files"])
    a("gate.test.total", t["total"] == t["pass"], f"{t['total']}/{t['pass']}")
    a("gate.test.expect", t["expect"] == 8458, t["expect"])
    b = gate["build"]
    a("gate.build.modules", b["modules"] == 8830, b["modules"])
    a("gate.build.entryJs", b["entryJs"] == "index-BM1Z8JG7.js", b["entryJs"])
    a("gate.build.entryJsKb", (b["entryJsKb"] or 0) > 5000, b["entryJsKb"])
    a("gate.build.distFiles", b["distFiles"] == 443, b["distFiles"])
    a("gate.build.seconds", (b["seconds"] or 0) > 0, b["seconds"])
    a("gate.tsc.webSrc", gate["tscListFiles"]["webSrcEntries"] > 300, gate["tscListFiles"]["webSrcEntries"])

    # PIN 树内不存在绑定「含 2dd097bb 及之后提交」的门禁目录 → 画幅改动确实未被四闸覆盖
    heads = []
    for p in sorted(files or {}):
        m = re.match(r"docs/V1\.0/reports/(verify-head-[^/]+)/summary\.json$", p)
        if not m:
            continue
        try:
            heads.append((m.group(1), json.loads(blob_text(files[p]["blob"])).get("head_commit")))
        except Exception:  # noqa: BLE001
            heads.append((m.group(1), None))
    covering = [h for h in heads if h[1] and _is_ancestor(ASPECT_COMMIT, h[1])]
    a("gate.coverage.no_gate_covers_aspect_commit", covering == [], f"gates={[h[0] for h in heads]} covering={[h[0] for h in covering]}")

def _is_ancestor(anc: str, desc: str) -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", anc, desc], capture_output=True).returncode == 0



# ---------------------------------------------------------------- 构建矩阵
def tally(tools: list[dict]) -> dict:
    out: dict[str, dict] = {d: {} for d in TALLIES}
    for t in tools:
        for d in TALLIES:
            v = t.get(d) or "N/A"
            out[d][v] = out[d].get(v, 0) + 1
    return out


def build(write: bool = True) -> dict:
    files = pin_files()
    base = json.loads(git("show", f"{BASE_COMMIT}:{BASE_MATRIX}"))
    tools = json.loads(json.dumps(base["tools"]))
    by_id = {t["id"]: t for t in tools}

    # 门禁：只从 PIN 树读取 6313501f 提交的固定 HEAD 三闸日志，并把它原样归档到本轮 evidence/
    gate = read_gate(GATE_FIXED_DIR, files)
    if write:
        dst = os.path.join(OUT_DIR, "evidence", "gate-logs")
        os.makedirs(dst, exist_ok=True)
        for rel in sorted(p for p in files if p.startswith(f"{GATE_FIXED_DIR}/")):
            name = rel[len(GATE_FIXED_DIR) + 1 :].replace("/", "__")
            with open(os.path.join(dst, name), "wb") as f:
                f.write(blob_bytes(files[rel]["blob"]))

    A = Assertions()
    gate_assertions(A, gate, files)

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

    # ---- R27 不变量：R25 的 38 个工具六维逐格不变
    base_by_id = {x["id"]: x for x in base["tools"]}
    for t in tools:
        if t["id"] == "VIDEO_TRANSLATION":
            continue
        bt = base_by_id[t["id"]]
        drift = [d for d in TALLIES if t.get(d) != bt.get(d)]
        A(f"invariant.{t['id']}.dims_unchanged", drift == [], ",".join(f"{d}:{bt.get(d)}->{t.get(d)}" for d in drift))
    A("invariant.tool_count_39", len(tools) == 39, len(tools))
    A("invariant.tool_id_set_unchanged", sorted(base_by_id) == sorted(x["id"] for x in tools), len(base_by_id))
    A("invariant.vt_f_not_pass", by_id["VIDEO_TRANSLATION"].get("F") != "PASS", by_id["VIDEO_TRANSLATION"].get("F"))
    A("invariant.vt_f_baseline_partial", base_by_id["VIDEO_TRANSLATION"].get("F") == "PARTIAL", base_by_id["VIDEO_TRANSLATION"].get("F"))

    # ---- R27 门禁覆盖缺口（时序事实）
    A("coverage.gate_bound_commit", (gate.get("commit") or "") == GATE_COMMIT, (gate.get("commit") or "")[:8])
    A("coverage.aspect_after_gate", _is_ancestor(GATE_COMMIT, ASPECT_COMMIT), f"{GATE_COMMIT[:8]}..{ASPECT_COMMIT[:8]}")
    A("coverage.aspect_web_not_in_gate", git("rev-parse", f"{ASPECT_COMMIT}:web").strip() != git("rev-parse", f"{GATE_COMMIT}:web").strip(), "web trees differ")

    # ---- R27 未吸收（未提交）清单：只登记事实，不参与判据
    unabsorbed: list[dict] = []
    for item in UNCOMMITTED:
        rel = item["path"]
        tracked = rel in files
        if item["kind"] == "untracked-dir":
            A(f"unabsorbed.{item['id']}.absent_from_pin", not tracked, rel)
            unabsorbed.append({**item, "in_pin_tree": tracked})
        else:
            A(f"unabsorbed.{item['id']}.tracked_in_pin", tracked, rel)
            blob = (files.get(rel) or {}).get("blob")
            _, u_sha = blob_sha(blob) if blob else (0, "")
            unabsorbed.append({**item, "in_pin_tree": tracked, "pin_blob_sha256": u_sha})
    A("unabsorbed.count_matches_declared", len(unabsorbed) == len(UNCOMMITTED), len(unabsorbed))

    t = tally(tools)
    non_green = sorted({(x["id"], d) for x in tools for d in TALLIES if x.get(d) not in ("PASS", "N/A")})
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
        "auditor": f"tools/recompute_scope_matrix_r27.py",
        "strictness": [
            "只吸收 PIN 提交树内已提交证据：size/sha256 一律由 `git cat-file blob` 现算，工作区未提交内容不参与。",
            "升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等）；断言失败即保持基线原判。",
            "仅反证可降级（字节/sha 不符、payloadDropped、快照回填、非法 taskId）；「无法复核」不降级，但必须进 nonClaims。",
            "H 口径不变：b5-*/task-real-*、recovery|inject 目录、payloadDropped、快照回填不计；本轮 H 证据取自 r22-h / 常规回执目录。",
            "三动作口径对齐 VIDEO_CONCAT.F 先例：字节一致 + 每条腿都能给出 sha256 才算闭合；只有字节无 sha 者维持原判。",
            "门禁不引用他人工作区日志：四闸日志取自 PIN 树已提交的 docs/V1.0/reports/verify-head-r26-fixed，绑定 commit eacc18f7。",
            "门禁覆盖范围按时序机检：eacc18f7 晚于 2dd097bb？否——2dd097bb 更晚，故四闸**不覆盖**画幅改动；本工具断言「PIN 树内不存在绑定 2dd097bb 及其后继的门禁」。",
            "VIDEO_TRANSLATION.F 不得因 /videos 成功或任务 succeeded 判绿：内容级证据（VAD/LID/ASR/OCR）单列 vtFailEvidence，逐条硬断言。",
            "R25 其余 38 工具六维逐格比对，任何一格漂移即断言失败。",
            "未提交内容（资产竞态/语言画幅新 E2E/vt-language-r26/.tmp_assetrace）只登记到 unabsorbed，物理上不进入任何判据。",
        ],
        "gate": gate,
        "nonClaims": [
            {
                "id": "NC1",
                "dim": "F",
                "not_claimed": "VIDEO_TRANSLATION 三腿 sha256 一致是「审计侧独立测得」",
                "reality": "eacc18f7 的 r22-g 回执给出 asset/node/source 三腿 sha256 均等于 7c15bdb2…274c；但三腿中只有 source（06-result-video.mp4）在仓库内有 blob，可由本工具独立复算，asset/canvas 两腿的 sha 是**产品页内自算并写入回执**，审计侧无法独立复现该计算。",
                "closure": "把 asset/canvas 两腿产物各存一份 blob 入库，审计侧独立复算 sha 后再主张「独立一致」。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json"],
            },
            {
                "id": "NC2",
                "dim": "F",
                "not_claimed": "VIDEO_TRANSLATION 的 ASR/字幕/配音语种正确",
                "reality": "e2529d42 已补齐内容级证据，但结论是**负面**：结果音轨为中文（LID small 0.9967 / base 0.9927 / ASR medium 0.9873，强制 language=en 仍出中文字符）；158 帧底部条带双 locale 0 命中 → 无字幕交付。即「已验，且不合格」，不是「未验」。",
                "closure": "用含清晰人声的源片重跑，回执须含 lang=en 断言 + 字幕文件 sha / 烧录帧 OCR 命中。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md"],
            },
            {
                "id": "NC3",
                "dim": "F",
                "not_claimed": "资产尺寸修复已由审计侧在浏览器内独立复跑验证",
                "reality": "eacc18f7 后 r22-g reload 实测 asset 768×768 / 6583ms / 1,249,837B，与本工具自解析 06-result-video.mp4 的 tkhd 768×768 一致，旧 1280×720 兜底已不再出现（本工具已断言 before_fix=1280×720 且 after_fix≠1280×720）。但该流程结论来自产品自测回执，审计侧未独立重跑「存资产」链路。",
                "closure": "在独立环境重跑一次存资产，导出 IDB 资产记录与媒体元数据比对。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json"],
            },
            {
                "id": "NC4",
                "dim": "F",
                "not_claimed": "AI_VIDEO_EDITING 三动作（下载/存资产/发画布）已由新证据复核",
                "reality": "r22-h 只有任务终态 + reload 分槽 + 结果/源视频 blob（本工具自解析 1344×768/6.584s/158 样本），没有任何动作字节回执；该工具 F 维维持基线判，不由本轮新证据支撑。",
                "closure": "为该次（或新一次）真实任务补三动作回执 + 每条腿字节/sha。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/02-task-result.json"],
            },
            {
                "id": "NC5",
                "dim": "F",
                "not_claimed": "AI_VIDEO_EDITING 结果时长与源片一致（未解释偏差）",
                "reality": "源 5.167s/124 帧 → 结果 6.584s/158 帧（+27%），报告只陈述事实未给解释；属上游模型行为，未验是否合规。",
                "closure": "确认为上游能力边界并写入产品说明，或复测确认可复现。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md"],
            },
            {
                "id": "NC6",
                "dim": "GATE",
                "not_claimed": "PIN（e2529d42）全部源码已通过四闸",
                "reality": "四闸绑定 eacc18f7（install 0 / typecheck 0 error / 1514 tests 88 files / build 8830 模块 443 产物）。2dd097bb（画幅修复，改 web/src 4 个文件 + 1 个报告）提交在其后，故该改动**未被任何四闸覆盖**；本工具断言 PIN 树内不存在绑定 2dd097bb 及其后继的门禁目录。",
                "closure": "在含 2dd097bb 的提交上重跑四闸并在 summary.json 里绑定该 commit。",
                "evidence": ["docs/V1.0/reports/verify-head-r26-fixed/summary.json"],
            },
            {
                "id": "NC7",
                "dim": "ALL",
                "not_claimed": "工作区未提交内容已复核",
                "reality": "审计时工作区存在未提交内容：use-asset-store.ts（资产竞态修复）、video-translation.ts/.test.ts（语言/画幅新 E2E）、reports/vt-language-r26/（空 evidence 目录）、.tmp_assetrace/。这些一律不参与判据，只在 unabsorbed 登记。",
                "closure": "提交后把 PIN 前移到该提交并重跑本工具。",
                "evidence": [],
            },
            {
                "id": "NC8",
                "dim": "F",
                "not_claimed": "VIDEO_TRANSLATION 已把语音翻译成目标英语",
                "reality": "任务 prompt 要求英语；实测结果音轨为中文（LID small 0.9967 / base 0.9927，ASR medium zh 0.9873；强制 language=en 仍输出中文字符）。这是目标语言未满足的**硬失败**，不是「翻译质量差」。",
                "closure": "用真实有语音的源片重跑，并把结果音轨的 ASR/LID 断言写进回执（lang=en 且 p 达标）。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/REPORT.md"],
            },
            {
                "id": "NC9",
                "dim": "F",
                "not_claimed": "VIDEO_TRANSLATION 已交付字幕（烧录或字幕流）",
                "reality": "158 帧底部条带 OCR 在 en-US / zh-Hans 双 locale 下 0 命中；full frame 仅在 y=0.516 画面中部命中一次 「CAT」(conf 0.5，背景文字)；报告亦记录无字幕流。阳性对照 30px 与 14px 灵敏度梯在同 locale 下 conf 1.0，可排除「分辨率导致漏检」。",
                "closure": "在回执中给出字幕文件 sha 与烧录帧底部条带 OCR 命中。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/summary.json"],
            },
            {
                "id": "NC10",
                "dim": "F",
                "not_claimed": "本次运行可作为「语音翻译」能力证据",
                "reality": "源片 5.184s，VAD 三档阈值均为 0 段 / 0.0%（纯音乐）；结果片旁白是在朗读任务说明（「原视频语音识别…翻译成…」），并非对源片台词的翻译。**有效输入前提不成立**。",
                "closure": "换用含清晰人声的源片重跑；并在回执中记录 VAD 语音占比。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/reports/vt-content-r24/artifacts/vad-speech.json"],
            },
            {
                "id": "NC11",
                "dim": "F",
                "not_claimed": "输出画幅已按源片修好（真实端到端）",
                "reality": "2dd097bb 只改请求侧（outputRatio 默认 source、按源像素比选档位、偏差提示、单测 39 例），报告自述「未重跑真实翻译」「上游收到 ratio=16:9 后是否稳定返回 16:9，仍未经实测」。",
                "closure": "用 1344×768 源片重跑一次真实任务，核对结果 tkhd 画幅与请求档位是否一致。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/reports/vt-aspect-r26/report.md"],
            },
        ],
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
                "check": "VIDEO_TRANSLATION r22-f 证据本轮已提交（R23 时的缺口 a 闭合）",
                "detail": "PIN 树 VIDEO_TRANSLATION/r22-f 现有 10 个文件，05/06/07/06-sha256 均在树内，全部由 git cat-file 现算；工作区同名目录不再作为唯一来源。",
            },
            {
                "check": "未提交的 r24 目录不参与判据",
                "detail": "工作区 reports/vt-content-r24/、.tmp_*/、.worker-* 均未进 PIN 树；本工具只遍历 git ls-tree PIN，物理上无法读到它们。",
            },
            {
                "check": "H 升级不来自 recovery/inject 目录",
                "detail": "REMOVE_PEN/r22-h、IMAGE_TEXT_EDIT/r22-h、AI_VIDEO_EDITING/r22-h 路径均不含 recovery|inject 目录名（recovery-receipt 文件名属常规回执目录下文件，已单列说明）。",
            },
            {
                "check": "门禁日志归属正确",
                "detail": "logs 取自 docs/V1.0/reports/verify-head-r24-fixed（commit 6313501f），summary.head_commit=c4b3611a；本工具复核 c4b3611a:web 树 == PIN:web 树 == ede2d0e2，故覆盖 PIN 源码。",
            },
        ],
        "residual_risks": [
            {
                "id": "F1",
                "severity": "fixed",
                "title": "视频资产入库尺寸兜底 1280×720（已由 eacc18f7 关闭）",
                "detail": "R25 记录：asset.data.width/height=1280×720 兜底值与真实 768×768 冲突。eacc18f7 改为「只信未超时的严格测量，测不到写 0×0 + mediaMetaPending 并后台校正」；r22-g 回执 reload 后实测 asset 768×768 / 6583ms / 1,249,837B，三腿 sha 与源文件一致，溯源字段保留。本工具已独立复算 bytes+sha 并与自解析 mp4 尺寸互证。",
                "impact": "该缺陷关闭，不再影响资产列表/插入画布的比例显示；仅剩「后台标签页先落 0×0 待校正」的交互取舍（单测覆盖）。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-g/verify.json"],
            },
            {
                "id": "F2",
                "severity": "low",
                "title": "视频翻译任务上游耗时与并发轮询未量化",
                "detail": "05 记录 submittedAt→finishedAt 完整，但未记录上游轮询次数/间隔；无法据此判断限流或重试策略是否生效。",
                "impact": "不影响判据。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json"],
            },
            {
                "id": "F3",
                "severity": "low",
                "title": "AI_VIDEO_EDITING 结果时长较源片 +27%",
                "detail": "源 5.167s → 结果 6.584s（124→158 帧），报告只陈述未解释；属上游模型行为。",
                "impact": "不影响 F/H 判据，但产品说明需注明能力边界。",
                "evidence": ["docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md"],
            },
        ],
    }

    vad_m = load_json(VTC_FILES["vad"], files)
    lid_m = load_json(VTC_FILES["lid"], files)
    med_m = load_json(VTC_FILES["asr_medium"], files)
    ocr_m = (load_json(VTC_FILES["summary"], files).get("ocr") or {})
    matrix["vtFailEvidence"] = [
        {
            "criterion": "译制语音为目标语言英语（prompt 原文）",
            "measured": f"结果音轨为中文：LID small zh p={lid_m['small/result']['p']} / base zh p={lid_m['base/result']['p']}；ASR medium zh p={med_m['result']['lid']['p']}；强制 language=en 仍转出中文字符",
            "verdict": "FAIL（目标语言未满足）",
            "evidence": VTC_FILES["lid"],
        },
        {
            "criterion": "字幕与译制语音统一使用该语言",
            "measured": f"158 帧底部条带 OCR：en-US {ocr_m['result-band-en-US']['bottom_band_hits']} 命中 / zh-Hans {ocr_m['result-band-zh-Hans']['bottom_band_hits']} 命中；full frame 高置信(conf≥0.5)命中仅 en 1 条「CAT」(y=0.516 画面中部)，zh 侧 4 条均为 conf=0.3 画面中部噪声",
            "verdict": "未交付（N/A，不判 PASS）",
            "evidence": VTC_FILES["summary"],
        },
        {
            "criterion": "把源片语音翻译成目标语言（有效输入前提）",
            "measured": f"源片 VAD 0.3/0.5/0.7 三档均为 0 段 / 0.0%（{vad_m['tracks']['source']['duration_s']}s 纯音乐）；结果片 VAD {vad_m['tracks']['result']['by_threshold']['0.5']['speech_ratio']:.1%} 有语音，内容为朗读任务说明",
            "verdict": "前提不成立（不得宣称翻译成功）",
            "evidence": VTC_FILES["vad"],
        },
        {
            "criterion": "资产/画布/源片字节一致（工程链路）",
            "measured": "三腿 sha256 均为 7c15bdb2…274c、1,249,837B；asset 768×768 / 6583ms（此前兜底 1280×720 已修正）",
            "verdict": "PASS（仅工程链路，不构成任务目标达成）",
            "evidence": f"{DOCS}/evidence/real-acceptance/" + VT_R22G["verify"],
        },
    ]
    matrix["gateCoverage"] = {
        "gateCommit": GATE_COMMIT,
        "gateSubject": gate.get("commitSubject"),
        "aspectCommit": ASPECT_COMMIT,
        "contentCommit": CONTENT_COMMIT,
        "assetCommit": ASSET_COMMIT,
        "gap": "2dd097bb（画幅）晚于四闸绑定提交 eacc18f7，未被覆盖",
    }
    matrix["unabsorbed"] = unabsorbed
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
    L.append("- 未吸收（审计时未提交，不参与判据）：%d 项" % len(m.get("unabsorbed") or []))
    gc = m.get("gateCoverage") or {}
    L.append("- 门禁覆盖缺口：四闸绑定 `%s`，晚于它的 `%s`（画幅）未被覆盖" % ((gc.get("gateCommit") or "")[:8], (gc.get("aspectCommit") or "")[:8]))
    L.append("")
    L.append("## 本轮复核单元（判据前 → 后）")
    L.append("")
    L.append("| 工具 | 维度 | 前 | 后 | 断言 |")
    L.append("| --- | --- | --- | --- | --- |")
    for u in m["upgrades"]:
        L.append(f"| {u['tool']} | {u['dim']} | {u['before']} | {u['after']} | {sum(1 for a in u['assertions'] if a['ok'])}/{len(u['assertions'])} |")
    L.append("")
    L.append("## 门禁（固定 HEAD 四闸，日志随 PIN 提交入库）")
    L.append("")
    g = m["gate"]
    L.append(f"- 来源：`{g['source']}`")
    L.append(f"- 绑定提交：`{g['commit']}`（tree `{g['commitTree']}`，web 树 `{g['webTree']}`）")
    L.append(f"- 提交主题：{g.get('commitSubject')}")
    L.append(f"- 该轮自评：{g.get('verdictOfRecord')}")
    L.append(f"- typecheck：exit0={g['typecheck']['exit0']}，error TS 计数={g['typecheck']['errorTs']}，{g['typecheck']['seconds']}s")
    L.append(f"- test：{g['test']['pass']} pass / {g['test']['fail']} fail / {g['test']['files']} files（{g['test']['expect']} expect）exit0={g['test']['exit0']}")
    L.append(f"- build：{g['build']['seconds']}s，{g['build']['modules']} modules，入口 {g['build']['entryJs']} ≈ {g['build']['entryJsKb']} kB，dist {g['build']['distFiles']} 文件，exit0={g['build']['exit0']}")
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
    L.append(f"- **VIDEO_TRANSLATION.F 维持 PARTIAL（不是 PASS）**：内容级复验显示目标语言英语未满足（结果音轨中文，zh p≥0.987）、字幕未交付（底部条带 0 命中）、源片 0% 语音（纯音乐）→ 有效输入前提不成立。FAIL 证据见 6.5，**不得表述为「翻译成功」**。")
    L.append("")
    L.append("## 1. 审计点与门禁")
    L.append("")
    g = m["gate"]
    L.append(f"- PIN（审计点）：`{m['head']}`，分支 `{m['branch']}`")
    L.append(f"- 门禁绑定提交：`{g['commit']}`（tree `{g['commitTree']}`，web 树 `{g['webTree']}`）")
    L.append(f"- 门禁日志来源：`{g['source']}`（随该提交入库，本工具从 blob 现读，不读工作区、不引用他人临时目录）")
    L.append(f"  - typecheck：exit0={g['typecheck']['exit0']}，error TS 计数 {g['typecheck']['errorTs']}，{g['typecheck']['seconds']}s")
    L.append(f"  - test：{g['test']['pass']} pass / {g['test']['fail']} fail / {g['test']['total']} tests · {g['test']['files']} files，exit0={g['test']['exit0']}")
    L.append(f"  - build：{g['build']['seconds']}s · {g['build']['modules']} modules · {g['build']['entryJs']} ≈ {g['build']['entryJsKb']} kB · dist {g['build']['distFiles']} 文件，exit0={g['build']['exit0']}")
    L.append(f"- 覆盖关系（本工具实测）：门禁 `{g['commit'][:8]}:web` == `{g['webTree'][:8]}`，但与 PIN `{m['head'][:8]}:web` **不同**（PIN 含 2dd097bb 画幅改动）→ 四闸**不覆盖**审计点全部源码，缺口见 6.7。")
    L.append(f"- 原始日志副本：`{OUT_DIR}/evidence/gate-logs/`；机读摘要：`{OUT_DIR}/evidence/gate.json`")
    L.append("- 边界：门禁只断言「该提交的源码 + 单测 + 构建」为绿；真实模型调用、E2E 与浏览器视觉验收不在四闸范围内（见第 4 节 nonClaims）。")
    L.append("")
    L.append(f"## 2. 本轮复核明细（{len(m['upgrades'])} 条，逐条硬断言）")
    L.append("")
    for u in m["upgrades"]:
        mark = ("升级" if u["after"] != u["before"] else "维持原判") + ("，断言全过" if u["passed"] else "，断言失败（不采纳）")
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
    L.append("## 4. 不得写成通过（nonClaims，逐条已备案）")
    L.append("")
    L.append("| # | 维度 | 不主张 | 实测事实 | 闭合方式 |")
    L.append("| --- | --- | --- | --- | --- |")
    for n in m.get("nonClaims") or []:
        L.append(f"| {n['id']} | {n['dim']} | {n['not_claimed']} | {n['reality']} | {n['closure']} |")
    L.append("")
    L.append("## 5. 可复核证据路径（本轮复核单元）")
    L.append("")
    for t in m["tools"]:
        for d in TALLIES:
            ev = t.get(f"{d}_evidence") or []
            if ev and any(u["tool"] == t["id"] and u["dim"] == d for u in m["upgrades"]):
                L.append(f"- **{t['id']}.{d}**：")
                for e in ev:
                    L.append(f"  - `{e}`")
    L.append("")
    L.append("## 6. 缺陷与风险（不改判，但须记录）")
    L.append("")
    L.append("| # | 严重度 | 问题 | 影响 | 证据 |")
    L.append("| --- | --- | --- | --- | --- |")
    for r in m.get("residual_risks") or []:
        evp = "、".join(f"`{e.split('/')[-1]}`" for e in (r.get("evidence") or [])) or "—"
        L.append(f"| {r['id']} | {r['severity']} | {r['title']} | {r['detail']} {r['impact']} | {evp} |")
    L.append("")
    if m.get("risks"):
        for r in m["risks"]:
            L.append(f"- **{r['tool']}**：{r['risk']}")
        L.append("")
    L.append("## 6.5 VIDEO_TRANSLATION.F 内容级 FAIL 证据（R27 新增，禁止写成通过）")
    L.append("")
    L.append("| # | 判据（任务 prompt） | 实测 | 判定 | 证据 |")
    L.append("| --- | --- | --- | --- | --- |")
    for i, e in enumerate(m.get("vtFailEvidence") or [], 1):
        L.append(f"| {i} | {e['criterion']} | {e['measured']} | {e['verdict']} | `{e['evidence']}` |")
    L.append("")
    L.append("> 判读：本次真实运行的**工程链路**（提交 → succeeded → 下载 → 存资产 → 发画布 → 字节/sha）成立；")
    L.append("> 但**任务目标**（把语音翻译成目标英语、替换音轨与字幕）不成立——源片无语音、结果音轨为中文、字幕未交付。")
    L.append("> 因此 F 只能 PARTIAL；/videos 成功或任务 succeeded 都不能作为 F 绿的依据。")
    L.append("")
    L.append("## 6.6 未吸收（审计时未提交，一律不参与判据）")
    L.append("")
    L.append("| # | 路径 | 类型 | 说明 | PIN 树状态 |")
    L.append("| --- | --- | --- | --- | --- |")
    for u in m.get("unabsorbed") or []:
        L.append(f"| {u['id']} | `{u['path']}` | {u['kind']} | {u['note']} | {'在树内（旧版本，工作区改动不读）' if u['in_pin_tree'] else '不在树内'} |")
    L.append("")
    L.append("## 6.7 门禁覆盖缺口（时序事实）")
    L.append("")
    gc = m.get("gateCoverage") or {}
    L.append(f"- 四闸绑定 `{(gc.get('gateCommit') or '')[:8]}`（{gc.get('gateSubject') or ''}）。")
    L.append(f"- `{(gc.get('aspectCommit') or '')[:8]}`（画幅修复，改 web/src 4 文件 + 1 报告）提交晚于该门禁 → **未被任何四闸覆盖**；其自带证据只有单测（39 pass）与局部 `tsc --noEmit`。")
    L.append("- 因此 2dd097bb 的结论只到「源码与报告已提交、请求侧逻辑有单测」，不代表含该改动的整树构建/全量测试为绿。")
    L.append("")
    L.append("## 7. 断言总表")
    L.append("")
    bad = [a for a in m["assertions"] if not a["ok"]]
    L.append(f"- 断言 {len(m['assertions']) - len(bad)}/{len(m['assertions'])} 通过")
    for a in bad:
        L.append(f"- FAIL `{a['name']}`：{a['detail']}")
    L.append("")
    L.append("## 8. 复现")
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
    for k in ("unabsorbed", "vtFailEvidence", "gateCoverage", "nonClaims"):
        if json.dumps(old.get(k), sort_keys=True, ensure_ascii=False) != json.dumps(new.get(k), sort_keys=True, ensure_ascii=False):
            diffs.append(f"{k} 与已提交 matrix.json 不一致")
    print(f"断言 {len(new['assertions']) - len(bad)}/{len(new['assertions'])} 通过；改判 {len(new['upgrades'])} 条；非全绿 {new['summary']['non_green_units']} 单元")
    for u in new["upgrades"]:
        _mk = ("升级" if u["after"] != u["before"] else "维持") + ("/断言全过" if u["passed"] else "/断言失败")
        print(f"  - {u['tool']}.{u['dim']}: {u['before']} -> {u['after']} ({_mk})")
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
    args = ap.parse_args()
    if args.check:
        return check()
    m = build(write=True)
    bad = [a for a in m["assertions"] if not a["ok"]]
    print(f"写出 {OUT_DIR}/matrix.json（非全绿 {m['summary']['non_green_units']} 单元，断言 {len(m['assertions']) - len(bad)}/{len(m['assertions'])}）")
    if bad:
        print("失败断言：", ", ".join(a["name"] for a in bad))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

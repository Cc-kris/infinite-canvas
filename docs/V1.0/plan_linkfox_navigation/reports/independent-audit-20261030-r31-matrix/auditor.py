#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R31 独立矩阵重算器（39 工具 / F·T·R·H·K·U）

基线
----
BASE = c17890c3 自带的 R27 matrix（38 PASS + VIDEO_TRANSLATION.F PARTIAL）。
本轮把 R27 之后落地的 7 个提交逐条过筛：能进判据的只有「已提交 + 可机检」的证据，
能力级失败（翻译没发生）不因 UI 变诚实而转绿，画幅请求侧绿也不当结果绿。

本轮固定审计点
--------------
PIN = e7826acf（含 1ef24fba / 454fa580 / bd71498f / b7970998 / 73075698 / a1f29d0c / e7826acf 七个待吸收提交）
`--check` 在任意后续 HEAD 上重跑都得到同一结论：读的是固定 PIN 树，不随后续提交漂移。

判据（只收紧，不放宽）
----------------------
1. 只吸收 committed 证据；size/sha256 一律 `git cat-file blob` 现算，工作区未提交内容不参与。
2. 升级必须通过硬断言；断言失败即保持基线原判。
3. 仅反证可降级；「无法复核」不降级，但必须进 nonClaims。
4. VIDEO_TRANSLATION.F 不得因 /videos 成功、任务 succeeded、或「UI 已诚实降级」判绿：
   目标语言 zh 的真实任务成片仍是英语（0 个中文字符）→ 维持 PARTIAL。
5. T 的 PASS 只能由**文本内容断言**支撑（无虚假承诺 / 无品牌 / 无计费占位 / 能力缺失被写明），
   不得写成「因为降级了所以绿」；每条 t.* 断言在 matrix.tBasis 里单独列出。
6. H 本轮无新证据 → 沿用基线，不因其他维度变化而改判（hCarryOver 单列理由）。
7. R28 四闸绑定 c17890c3，晚于它的 73075698 / a1f29d0c / e7826acf 均**未被覆盖**，机检断言并单列。
8. 未吸收提交（含 1ef24fba 的 BLOCKED 结论）只作负证，不得当能力证据；逐条写进 unabsorbedCommits。
9. 媒体鉴权（401）在 e7826acf 里只到「纯函数矩阵 + 本地 HTTP + ingest 透传」三组单测，
   没有真机复验、树内无日志 → mediaAuthRisks 单列，不得表述为「已端到端修复」。
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

ROUND = "R31"
PIN_COMMIT = "e7826acfe4620a91c7651dc160112b1dad13bd1e"
BASE_COMMIT = "c17890c37e8241e5c9716fed5dd4c46ceacda1e0"
DOCS = "docs/V1.0/plan_linkfox_navigation"
BASE_MATRIX = f"{DOCS}/reports/independent-audit-20261030-r27-matrix/matrix.json"
OUT_DIR = f"{DOCS}/reports/independent-audit-20261030-r31-matrix"
GATE_FIXED_DIR = "docs/V1.0/reports/verify-head-r28-fixed"
GATE_COMMIT = "c17890c37e8241e5c9716fed5dd4c46ceacda1e0"
GATE_R28_COMMIT = "b7970998f022eb9510d3b3a2aeec4d07dcee1f84"
LANG_COMMIT = "454fa580d8f57aee59340e73a672d78b953a42d4"
PROTOCOL_COMMIT = "1ef24fba484965b1cc62e7bf0ea920d694666c0b"
ASPECT_COMMIT = "bd71498f334126312ac6255b60053d09151801c3"
HONEST_COMMIT = "73075698c9d0f6f76304abdc70b5243061d0da63"
FIXTURE_COMMIT = "a1f29d0c9d7438baaf0f1664f94e22ca4c7149a8"
MEDIA_AUTH_COMMIT = "e7826acfe4620a91c7651dc160112b1dad13bd1e"
ASPECT_CODE_COMMIT = "2dd097bba50f49751f3b24e5d0527aa40b20e78b"
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

# ---- R31 新证据（均为 PIN 树已提交内容）
LANG_DIR = f"{DOCS}/reports/vt-language-r26/"
LANG_FILES = {
    "report": LANG_DIR + "REPORT.md",
    "evidence": LANG_DIR + "EVIDENCE.md",
    "submitted": LANG_DIR + "artifacts/01-submitted.json",
    "source_asr": LANG_DIR + "artifacts/02-source-asr.json",
    "snapshot": LANG_DIR + "artifacts/03-task-snapshot.json",
    "result_mp4": LANG_DIR + "artifacts/04-result.mp4",
    "analysis": LANG_DIR + "artifacts/05-result-analysis.json",
}
LANG_RESULT = {
    "bytes": 1199227,
    "sha256": "a3613615999ab80d38871233c49e5975fadec3be2bb3930f57b0b9089c3a276d",
    "task": "task-mvuilah9-v6u5s1",
    "upstream": "task_fnyYPg9WDzJfWzhWzjI9y80mBKUQNmT9",
}
PROTO_DIR = f"{DOCS}/reports/vt-protocol-r27/"
PROTO_FILES = {
    "report": PROTO_DIR + "REPORT.md",
    "evidence": PROTO_DIR + "evidence/vt-protocol-evidence.json",
}
ASP27_DIR = f"{DOCS}/evidence/real-acceptance/VIDEO_TRANSLATION/r27-aspect/"
ASP27 = {
    "dir": ASP27_DIR,
    "record": ASP27_DIR + "02-tool-task-record.json",
    "derivation": ASP27_DIR + "03-request-derivation.json",
    "proxy_log": ASP27_DIR + "04-proxy-log-excerpt.txt",
    "succeeded": ASP27_DIR + "05-tool-task-record-succeeded.json",
    "content_log": ASP27_DIR + "06-proxy-log-content-401-404.txt",
    "notes": ASP27_DIR + "NOTES-live.md",
    "report": ASP27_DIR + "REPORT.md",
}
ASP27_UPSTREAM = "task_E6QMbFgZ765iJbrmOXnvCpeYe0Hh4wTA"
FIXTURE_DIR = f"{DOCS}/evidence/fixtures/zh-speech-r27/"
FIXTURE = {
    "dir": FIXTURE_DIR,
    "mp4": FIXTURE_DIR + "zh-speech-djibouti-7s.mp4",
    "manifest": FIXTURE_DIR + "manifest.json",
    "evidence": FIXTURE_DIR + "fixture-evidence.json",
    "notice": FIXTURE_DIR + "LANGUAGE_GROUP_NOTICE.md",
    "report": FIXTURE_DIR + "REPORT.md",
    "scan": FIXTURE_DIR + "repo-scan.json",
}
FIXTURE_BYTES = 104361
FIXTURE_SHA = "7e4ab7c205efcf37fca50fdc719a919f2745b7ea7d749811df22ccb96f049ec9"
UI_HONEST = "web/src/components/tools/workspaces/video-translation-honesty.tsx"
UI_HONEST_TEST = "web/src/components/tools/workspaces/video-translation-honesty.test.tsx"
UI_WS = "web/src/components/tools/workspaces/video-translation.tsx"
UI_I18N_ZH = "web/src/i18n/locales/zh-CN.ts"
UI_I18N_EN = "web/src/i18n/locales/en-US.ts"
UI_MEDIA_AUTH = "web/src/services/media-auth.ts"
UI_MEDIA_AUTH_TEST = "web/src/services/media-auth.test.ts"
UI_INGEST_TEST = "web/src/stores/use-tool-task-store.ingest-auth.test.ts"
UI_RESULT_ASSETS = "web/src/services/api/tools/result-assets.ts"
UI_TASK_STORE = "web/src/stores/use-tool-task-store.ts"
UI_VIDEO_SERVICE = "web/src/services/api/video.ts"
UI_FILE_STORAGE = "web/src/services/file-storage.ts"
MEDIA_AUTH_RECEIPT = "docs/r28-video-media-auth-401-receipt.md"
MEDIA_AUTH_LOG_DIR = "docs/V1.0/reports/verify-head-r28-media-auth"
# 只允许出现在注释/文档里的品牌词不能算 UI 品牌；扫描范围限定在 i18n 命名空间 + 两个组件
FALSE_PROMISES = [
    "翻译完成",
    "已完成翻译",
    "口型已对齐",
    "字幕已生成",
    "自动翻译",
    "支持多语言翻译",
    "Translation completed",
    "Lip sync applied",
    "Subtitles generated",
]
BRAND_WORDS = ["LinkFox", "linkfox"]
BILLING_WORDS = ["积分", "算力", "credits", "Credits", "付费次数", "套餐"]

# 审计时工作区存在但**未提交**的内容：只登记，不参与判据
UNCOMMITTED = [
    {
        "id": "U1",
        "path": ".tmp_r31/",
        "kind": "untracked-dir",
        "note": "本审计自身的临时笔记目录（不进 PIN 树，也不参与判据）",
    },
    {
        "id": "U2",
        "path": ".tmp_assetrace/",
        "kind": "untracked-dir",
        "note": "R27 遗留的资产竞态复现脚本，仍未提交 → 不吸收",
    },
    {
        "id": "U3",
        "path": "web/src/features/tools/adapters/video-translation.ts",
        "kind": "tracked-modified",
        "note": "语言组 adapter 仍在改（工作区 blob 与 PIN 不同）；PIN 树内为 e7826acf 版本，本轮只按该版本判",
    },
    {
        "id": "U4",
        "path": "web/src/features/tools/adapters/video-translation.test.ts",
        "kind": "tracked-modified",
        "note": "对应 adapter 改动的测试用例（工作区 blob 与 PIN 不同）→ 不吸收",
    },
    {
        "id": "U5",
        "path": "project_memory.md",
        "kind": "tracked-modified",
        "note": "项目记忆文件的工作区改动，与判据无关",
    },
]

# 审计点之前 7 个提交的归类：absorbed_into=None 即「只作负证/未进判据」
UNABSORBED_COMMITS = [
    {
        "commit": PROTOCOL_COMMIT,
        "subject": "docs(video-translation): r27 上游协议调查结论 BLOCKED",
        "touches": "docs only",
        "absorbed_into": "VT.F（仅负证）",
        "reason": "BLOCKED 是能力缺失的证明，不是能力证据；只加强「不得宣称翻译完成」，不给任何维度加分",
    },
    {
        "commit": LANG_COMMIT,
        "subject": "test(video-translation): r26 真实上游复验——语言契约压住「朗读提示词」，但 zh 未生效",
        "touches": "docs + web/scripts",
        "absorbed_into": "VT.F（负证）/ VT.R（字节）",
        "reason": "目标 zh 的成片仍是英语（0 中文字符），只能作 F 的 FAIL 证据；同批 04-result.mp4 可用于 R 三方对账",
    },
    {
        "commit": ASPECT_COMMIT,
        "subject": "docs(video-translation): r27-aspect 画幅修复真实验收（请求侧通过；输出侧产物丢失阻断）",
        "touches": "docs only",
        "absorbed_into": "未进 F（只到请求侧）",
        "reason": "请求档位 16:9/1280x720 已实测，但结果字节在上游 502 后消失、无 storageKey → 不得当「结果画幅已修」",
    },
    {
        "commit": GATE_R28_COMMIT,
        "subject": "verify(r28): 固定 HEAD c17890c3 独立四闸",
        "touches": "docs only",
        "absorbed_into": "门禁节（gate）",
        "reason": "四闸本身是绿，但绑定 c17890c3；晚于它的三个提交（UI/素材/鉴权）不在覆盖范围内",
    },
    {
        "commit": HONEST_COMMIT,
        "subject": "feat(video-translation): 诚实降级 UI——标明 AI 重生成，非逐句翻译/口型对齐",
        "touches": "web/src（UI + i18n + 测试）",
        "absorbed_into": "VT.T / VT.U",
        "reason": "只改「怎么说」，不改「能不能」；按文本内容断言判 T，绝不用它给 F 加分",
    },
    {
        "commit": FIXTURE_COMMIT,
        "subject": "docs(vt-fixtures-r27): 新增真实中文语音测试素材",
        "touches": "docs only",
        "absorbed_into": "未进 F（尚无真实运行）",
        "reason": "素材就绪但没有任何真实任务引用它 → 是「准备好的输入」，不是「验证过的能力」",
    },
    {
        "commit": MEDIA_AUTH_COMMIT,
        "subject": "fix(media-auth): 视频结果入库按原任务渠道补鉴权，修 401",
        "touches": "web/src + docs",
        "absorbed_into": "mediaAuthRisks（不进五维）",
        "reason": "纯函数矩阵 + 本地 HTTP + ingest 透传三组单测（自述 1560 pass），无真机复验、树内无日志 → 不能当作 401 已端到端修复",
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
    a("vt.aspect.code.inside_gate",
      _is_ancestor(ASPECT_CODE_COMMIT, GATE_COMMIT),
      f"画幅修复代码 {ASPECT_CODE_COMMIT[:8]} 在四闸 c17890c3 之内")
    a("vt.aspect.commit_is_docs_only",
      not git("show", "--name-only", "--format=", ASPECT_COMMIT).strip().split("\n") or
      not any(x.startswith("web/src") for x in git("show", "--name-only", "--format=", ASPECT_COMMIT).split()),
      f"{ASPECT_COMMIT[:8]} 只改文档/证据，不含 web/src")
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

def up_video_translation_f31(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.F（R31）：在 R27 判据上叠加 7 个提交的真实证据。

    链式复用：up_video_translation_f27（含 r22-f 链路 55 条 + r22-g 三方 sha + r24 内容级负证）。
    本轮新增：454fa580 真实语言任务（zh 未生效）、bd71498f 画幅（请求侧绿/输出侧丢）、
    e7826acf 媒体鉴权（只到单测）、a1f29d0c 中文素材（未被消费）、1ef24fba 协议 BLOCKED（负证）。
    """
    up_video_translation_f27(a, files)
    # ============================================================ R31 新增证据
    # ---- 5) 454fa580：真实语言复验（真实英语人声 → 目标 zh，成片仍是英语）
    la = load_json(LANG_FILES["analysis"], files)
    rc = la["receipt"]
    out = la["output"]
    a("vt.lang31.task_id", rc["localTaskId"] == LANG_RESULT["task"], rc["localTaskId"])
    a("vt.lang31.upstream_id", rc["upstreamTaskId"] == LANG_RESULT["upstream"], rc["upstreamTaskId"])
    a("vt.lang31.succeeded_first_attempt", rc["status"] == "succeeded" and rc["attempts"] == 1,
      f"{rc['status']} / {rc['attempts']} attempt / {rc['wallClockSec']}s / poll {rc['pollCount']}")
    a("vt.lang31.channel_is_real", rc["channelId"] == "sub2" and rc["model"] == "sub2::MiniMax-H3", rc["model"])
    a("vt.lang31.result_bytes", out["bytes"] == LANG_RESULT["bytes"], out["bytes"])
    a("vt.lang31.result_sha256", out["sha256"] == LANG_RESULT["sha256"], out["sha256"][:16] + "…")
    a("vt.lang31.target_is_zh", la["verdict"]["targetLanguage"] == "zh", la["verdict"]["targetLanguage"])
    a("vt.lang31.audio_still_en", la["verdict"]["audio_language"] == "en", la["verdict"]["audio_language"])
    a("vt.lang31.translation_not_applied", la["verdict"]["translationApplied"] is False,
      la["verdict"]["translationApplied"])
    a("vt.lang31.zero_cjk_in_output", la["asr"]["zh_chars_in_result"] == 0
      and CJK_RE.search(la["asr"]["result_zh_forced"]) is None,
      f"zh_chars_in_result={la['asr']['zh_chars_in_result']}（强制 -l zh 也没有中文）")

    # 前提：源片是真实英语人声（不是纯音乐），所以「没翻译」不能用「没有语音」解释
    src_asr = load_json(LANG_FILES["source_asr"], files)
    a("vt.lang31.source_is_real_english_speech", src_asr["durationSec"] > 6.5
      and "Meet the watch" in src_asr["text"], f"{src_asr['durationSec']}s: {src_asr['text'][:48]}…")

    # 反证「成片朗读提示词」已消失：结果里不得出现提示词正文
    auto = la["asr"]["result_auto"]
    a("vt.lang31.no_prompt_reading", ("语言硬约束" not in auto) and ("简体中文（简体中文" not in auto),
      f"result_auto={auto[:56]}…")

    # 提交体与协议负证
    sub = load_json(LANG_FILES["submitted"], files)["submitted"]
    a("vt.lang31.first_attempt_channel_missing_key", sub["status"] == "failed"
      and (sub.get("taskError") or {}).get("message") == "请先配置 API Key",
      (sub.get("taskError") or {}).get("message"))
    a("vt.lang31.first_attempt_is_other_task", sub["taskId"] != rc["localTaskId"], sub["taskId"])
    a("vt.lang31.source_via_public_tunnel",
      "trycloudflare.com" in (sub["fields"].get("sourceVideoUrl") or ""),
      "源片经公网隧道 URL 提交（该路径无鉴权）")
    a("vt.lang31.fields_carry_language", sub["fields"].get("targetLanguage") == "zh"
      and sub["fields"].get("sourceLanguage") == "auto", "fields.targetLanguage=zh / sourceLanguage=auto")

    lang_rep = blob_text(files[resolve(LANG_FILES["report"], files)]["blob"])
    lang_evi = blob_text(files[resolve(LANG_FILES["evidence"], files)]["blob"])
    a("vt.lang31.report_records_zh_not_effective", "未生效" in lang_rep, "REPORT 写明目标语言未生效")
    a("vt.lang31.report_no_success_claim", "翻译成功" not in lang_rep.replace("不能表述为「翻译成功」", ""),
      "REPORT 未把结果说成翻译成功")
    a("vt.lang31.evidence_prompt_reading_gone", "不再复现" in lang_evi, "EVIDENCE 记录朗读提示词不再复现")
    a("vt.lang31.evidence_body_has_no_language_field", "不含任何语言字段" in lang_evi,
      "EVIDENCE 记录提交体无语言字段")

    # ---- 6) bd71498f：画幅真实验收——请求侧绿 ≠ 结果绿
    dv = load_json(ASP27["derivation"], files)
    a("vt.aspect31.request_ratio_16_9", dv["plan"]["ratio"] == "16:9", dv["plan"]["ratio"])
    a("vt.aspect31.request_size_1280x720", dv["plan"]["size"] == "1280x720", dv["plan"]["size"])
    a("vt.aspect31.global_1to1_overridden", dv["globalSize"] == "1:1", f"globalSize={dv['globalSize']} → plan 已覆盖")
    a("vt.aspect31.preserves_source_false", dv["plan"]["preservesSource"] is False,
      f"源 {dv['plan']['sourceSize']} / {dv['plan']['sourceRatioLabel']}")
    a("vt.aspect31.built_config_size", dv["builtConfig"]["size"] == "1280x720", dv["builtConfig"]["size"])
    a("vt.aspect31.built_config_model", dv["builtConfig"]["model"] == "sub2::MiniMax-H3", dv["builtConfig"]["model"])

    asp05 = load_json(ASP27["succeeded"], files)
    items = ((asp05.get("result") or {}).get("items") or [])
    a("vt.aspect31.task_succeeded", asp05["status"] == "succeeded"
      and asp05.get("upstreamTaskId") == ASP27_UPSTREAM, asp05["status"])
    a("vt.aspect31.ingest_error_401", any("401" in (i.get("ingestError") or "") for i in items),
      items[0].get("ingestError") if items else "no items")
    a("vt.aspect31.no_storage_key", bool(items) and all(not i.get("storageKey") for i in items),
      "结果条目无 storageKey → 没有落盘字节")
    a("vt.aspect31.result_url_is_channel_api", bool(items)
      and "/v1/videos/" in (items[0].get("url") or "") and "/content" in (items[0].get("url") or ""),
      (items[0].get("url") if items else "n/a"))
    a("vt.aspect31.no_result_mp4_in_dir",
      not any(p.startswith(ASP27["dir"]) and p.lower().endswith(".mp4") for p in files),
      "r27-aspect 目录内无结果 mp4")

    log6 = blob_text(files[resolve(ASP27["content_log"], files)]["blob"])
    a("vt.aspect31.log_has_502_404_401", all(t in log6 for t in ("502", "404", "401")),
      "时间线：502 → 状态查询 404 → 内容 401")
    asp_rep = blob_text(files[resolve(ASP27["report"], files)]["blob"])
    a("vt.aspect31.report_request_side_pass", "请求侧画幅修正：通过" in asp_rep, "A 段：请求侧通过")
    a("vt.aspect31.report_output_side_blocked", "输出侧像素验证" in asp_rep and "阻断" in asp_rep,
      "B 段：输出侧被阻断")
    a("vt.aspect31.report_self_declares_incomplete", "本次未完成" in asp_rep, "REPORT 自述本次未完成")

    # ---- 7) e7826acf：媒体鉴权修复——只到单测/本地 HTTP，无真机复验
    ma = blob_text(files[resolve(UI_MEDIA_AUTH, files)]["blob"])
    for fn in ("isChannelMediaUrl", "channelMediaHeaders", "taskMediaHeaders", "taskMediaHeadersById"):
        a(f"vt.mediaauth31.fn_{fn}", fn in ma, f"media-auth.ts 导出 {fn}")
    a("vt.mediaauth31.no_default_channel_fallback",
      "不回退默认" in blob_text(files[resolve(UI_MEDIA_AUTH_TEST, files)]["blob"]),
      "渠道已删除时不回退默认渠道（有测试）")
    a("vt.mediaauth31.blob_scheme_no_headers", "blob:" in ma and "data:" in ma,
      "blob:/data: 不带头")
    a("vt.mediaauth31.result_assets_uses_task_headers",
      "taskMediaHeadersById" in blob_text(files[resolve(UI_RESULT_ASSETS, files)]["blob"]),
      "result-assets 保存/发画布两条路径补头")
    store = blob_text(files[resolve(UI_TASK_STORE, files)]["blob"])
    a("vt.mediaauth31.ingest_uses_task_headers", "taskMediaHeaders" in store, "ingestResultMedia 补头")
    a("vt.mediaauth31.host_scoped_helper_in_media_auth",
      "export function isChannelMediaUrl" in ma and "function channelApiPrefixes" in ma,
      "同源/渠道前缀判定集中在 media-auth.ts")
    a("vt.mediaauth31.video_service_consumes_auth",
      ("taskMediaHeadersById" in blob_text(files[resolve(UI_VIDEO_SERVICE, files)]["blob"]))
      or ("channelMediaHeaders" in blob_text(files[resolve(UI_VIDEO_SERVICE, files)]["blob"])),
      UI_VIDEO_SERVICE)
    a("vt.mediaauth31.headers_pass_through",
      "headers" in blob_text(files[resolve(UI_FILE_STORAGE, files)]["blob"]),
      "fetchMediaBlob/StoreMediaOptions 支持 headers 透传")
    a("vt.mediaauth31.tests_committed",
      resolve(UI_MEDIA_AUTH_TEST, files) is not None and resolve(UI_INGEST_TEST, files) is not None,
      "两个测试文件都在 PIN 树内")

    rcp = blob_text(files[resolve(MEDIA_AUTH_RECEIPT, files)]["blob"])
    a("vt.mediaauth31.receipt_admits_old_result_unrecoverable", "不复用 r27 旧任务" in rcp,
      "回执自述：旧 401 产物不复活、需新任务复验")
    a("vt.mediaauth31.receipt_self_reported_tests", "1560 pass" in rcp, "自述 1560 pass（树内无日志）")
    a("vt.mediaauth31.no_committed_gate_logs",
      not any(p.startswith(MEDIA_AUTH_LOG_DIR) for p in files),
      "媒体鉴权修复没有提交任何四闸/真机日志")
    a("vt.mediaauth31.no_real_task_evidence",
      not any(p.startswith(ASP27["dir"]) and "401" not in p and p.endswith("-succeeded.json")
              and "post-fix" in p for p in files),
      "没有修复后新任务的真实回执")

    # ---- 8) a1f29d0c：中文语音素材就绪，但还没有真实任务用它
    fx = load_json(FIXTURE["evidence"], files)
    a("vt.fixture31.bytes", fx["fixture_bytes"] == FIXTURE_BYTES, fx["fixture_bytes"])
    a("vt.fixture31.sha256", fx["fixture_sha256"] == FIXTURE_SHA, fx["fixture_sha256"][:16] + "…")
    a("vt.fixture31.duration", abs(fx["duration"] - 7.4) < 0.01, fx["duration"])
    a("vt.fixture31.asr_language_zh", fx["asr_final"]["language"] == "zh"
      and fx["asr_final"]["language_prob"] >= 0.99, f"zh p={fx['asr_final']['language_prob']}")
    a("vt.fixture31.vad_is_speech", fx["vad_final"]["speech_cov"] > 0.9, fx["vad_final"]["speech_cov"])
    a("vt.fixture31.video_track_has_no_text",
      "no text" in fx["video_track"]["kind"] and fx["video_track"]["identical"] is True,
      "纯色静态画面 → 字幕/OCR 干扰为零")
    a("vt.fixture31.license_recorded", fx["source"]["license"] == "CC BY-SA 4.0", fx["source"]["license"])
    a("vt.fixture31.provenance_sha1_matches",
      fx["source"]["local_sha1"] == fx["source"]["commons_sha1"], "本地切片源 sha1 与 Commons 一致")
    fixture_used = [p for p in files
                    if p.startswith(DOCS + "/evidence/real-acceptance/")
                    and resolve(p, files) is not None
                    and "zh-speech" in blob_text(files[p]["blob"])]
    a("vt.fixture31.not_used_by_any_real_task", not fixture_used,
      "真实验收目录无任何文件引用 zh-speech → 素材未被消费")

    # ---- 9) 1ef24fba：协议调查 BLOCKED（只有负证，不能当能力证据）
    pr = blob_text(files[resolve(PROTO_FILES["report"], files)]["blob"])
    a("vt.protocol31.blocked_verdict", "BLOCKED" in pr, "结论 BLOCKED")
    a("vt.protocol31.lists_missing_fields",
      all(t in pr for t in ("sourceLanguage", "targetLanguage", "lipSync")), "缺语言/口型字段")
    a("vt.protocol31.forbids_success_claim", "不能宣称" in pr, "明文禁止宣称翻译完成")
    a("vt.protocol31.no_new_task_side_effect", "没有建新任务" in pr, "未建新任务（无副作用）")

    # ---- 10) 结论硬约束：任何一条 F 积极断言都不足以判 PASS
    a("vt.f31.verdict_must_stay_partial", True,
      "目标语言 zh 未达成（成片英语、0 中文字符）+ 字幕未交付 + 画幅结果字节缺失 → PARTIAL")

    return {
        "verdict": "PARTIAL",
        "expect": "PARTIAL",
        "basis": [
            "真实上游任务（sub2::MiniMax-H3）succeeded，但输出音轨仍是英语：whisper 自动/强制 en 均为英语，强制 zh 也转不出中文（0 个中文字符）",
            "源片是真实英语人声（6.59s，'Meet the watch…'），所以「没翻译」不是「没有语音」导致",
            "画幅请求侧已实测 16:9/1280x720（globalSize 1:1 被 plan 覆盖），但结果 mp4 在 502→404→401 后丢失、无 storageKey → 输出侧画幅仍未验",
            "媒体鉴权修复（e7826acf）只在单测/本地 HTTP 层证明，没有新任务真机复验 → 不能算视频链路已通",
            "中文语音素材（a1f29d0c）已就绪但无真实任务引用 → 是输入，不是结果",
        ],
        "evidence": [
            LANG_FILES["report"], LANG_FILES["evidence"], LANG_FILES["analysis"],
            ASP27["report"], ASP27["succeeded"], ASP27["content_log"],
            MEDIA_AUTH_RECEIPT, FIXTURE["evidence"], PROTO_FILES["report"],
            VT_R22G["report"], VTC_FILES["report"], VTA_REPORT,
        ],
        "risks": [
            "目标语言未满足：可宣告「生成成功」，不能宣告「翻译成功 / 译制完成」",
            "字幕未交付：无字幕流、底部条带 0 命中 → 「译制语音与字幕统一」的字幕一半不存在",
            "画幅只到请求侧：结果画幅（720x720 还是 1280x720）没有像素证据，且不在最新四闸覆盖内",
            "媒体入库 401 只在单测层修复；真机是否仍 401 未知（旧产物已被上游删除，无法回放）",
            "上游产物会蒸发：任务 succeeded 后 502/404 即可让结果永久不可取，验收必须在产物存活窗口内做",
            "素材就绪 ≠ 能力就绪：zh 素材还没有跑过任何真实任务",
        ],
        "note": "R31 维持 PARTIAL。相比 R27：证据更硬（真实失败任务 + 真实丢产物），但没有任何一项把「目标语言未达成」翻转。"
                "UI 变诚实、画幅请求侧变对、鉴权补了单测，都不能替代「成片里出现目标语言语音与字幕」。",
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



# ---------------------------------------------------------------- 门禁（R28 四闸）
def _strip_ansi(s: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", s)


def _is_ancestor(anc: str, desc: str) -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", anc, desc],
                          capture_output=True).returncode == 0

def read_gate_r28(gate_dir: str, files: dict | None = None) -> dict:
    """读取 PIN 树内 b7970998 提交的 R28 四闸证据（summary.json 为准，日志做交叉校验）。

    注意：该目录与 R27 用的 verify-head-r26-fixed 结构不同（gate0-install/gate1-typecheck/
    gate2-bun-test/gate3-build + *.exit 文本 "exit=0 elapsed_s=NNN"），故单独实现读取器。
    """
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
    g = summ.get("gates") or {}

    exits: dict[str, bool] = {}
    elapsed: dict[str, int | None] = {}
    for name in ("gate0-install", "gate1-typecheck", "gate2-bun-test", "gate3-build"):
        line = txt(f"{gate_dir}/logs/{name}.exit").strip()
        m = re.search(r"exit=(\d+)", line)
        mm = re.search(r"elapsed_s=(\d+)", line)
        exits[name] = bool(m and m.group(1) == "0")
        elapsed[name] = int(mm.group(1)) if mm else None

    test_log = txt(f"{gate_dir}/logs/gate2-bun-test.log")
    build_log = txt(f"{gate_dir}/logs/gate3-build.log")
    tc_log = txt(f"{gate_dir}/logs/gate1-typecheck.log")
    dist = [x for x in txt(f"{gate_dir}/logs/dist-files.txt").splitlines() if x.strip()]

    mt = re.search(r"^\s*(\d+) pass\s*$", test_log, re.M)
    mf = re.search(r"^\s*(\d+) fail\s*$", test_log, re.M)
    me = re.search(r"(\d+) expect\(\) calls", test_log)
    mran = re.search(r"Ran (\d+) tests across (\d+) files", test_log)
    mmod = re.search(r"(\d+) modules transformed", build_log)
    mjs = re.search(r"dist/assets/(index-[A-Za-z0-9_-]+\.js)\s+([\d,]+(?:\.\d+)?) kB", build_log)

    return {
        "source": f"{gate_dir} (PIN tree blob)",
        "commit": summ.get("head_commit"),
        "commitSubject": summ.get("head_commit_subject"),
        "tree": summ.get("head_commit_tree"),
        "webTree": summ.get("head_web_tree"),
        "webSrcTree": summ.get("head_web_src_tree"),
        "verdictOfRecord": summ.get("verdict"),
        "verdictScope": summ.get("verdict_scope"),
        "notCovered": summ.get("not_covered") or [],
        "isolation": summ.get("isolation") or {},
        "toolchain": summ.get("toolchain") or {},
        "exits": exits,
        "elapsed": elapsed,
        "install": {"packages": (g.get("install") or {}).get("packages_installed"),
                    "exit_code": (g.get("install") or {}).get("exit_code"),
                    "duration_s": (g.get("install") or {}).get("duration_s"),
                    "logHasDone": "Done" in txt(f"{gate_dir}/logs/gate0-install.log")},
        "typecheck": {"errors": (g.get("typecheck") or {}).get("error_count"),
                      "files": ((g.get("typecheck") or {}).get("non_empty_proof") or {}).get("program_files"),
                      "webSrcFiles": ((g.get("typecheck") or {}).get("non_empty_proof") or {}).get("web_src_files_in_program"),
                      "logErrorTs": len(re.findall(r"error TS\d+", tc_log))},
        "test": {"pass": (g.get("unit_tests") or {}).get("pass"),
                 "fail": (g.get("unit_tests") or {}).get("fail"),
                 "skip": (g.get("unit_tests") or {}).get("skip"),
                 "files": (g.get("unit_tests") or {}).get("files"),
                 "expect": (g.get("unit_tests") or {}).get("expect_calls"),
                 "logPass": int(mt.group(1)) if mt else None,
                 "logFail": int(mf.group(1)) if mf else None,
                 "logExpect": int(me.group(1)) if me else None,
                 "logTotal": int(mran.group(1)) if mran else None,
                 "logFiles": int(mran.group(2)) if mran else None},
        "build": {"modules": (g.get("build") or {}).get("modules_transformed"),
                  "builtIn": (g.get("build") or {}).get("built_in"),
                  "realS": (g.get("build") or {}).get("real_s"),
                  "distFiles": (g.get("build") or {}).get("dist_files"),
                  "jsBundle": (g.get("build") or {}).get("js_bundle"),
                  "logModules": int(mmod.group(1)) if mmod else None,
                  "logEntryJs": mjs.group(1) if mjs else None,
                  "logEntryKb": float(mjs.group(2).replace(",", "")) if mjs else None,
                  "distListed": len(dist)},
        "excluded": txt(f"{gate_dir}/logs/exclusion-uncommitted-adapter.txt").strip(),
        "worktreeStatusLines": len([x for x in txt(f"{gate_dir}/logs/working-tree-status.txt").splitlines() if x.strip()]),
    }


def gate_assertions_r31(a: Assertions, gate: dict, files: dict) -> None:
    """R28 四闸：既断言「当时是绿的」，也断言「覆盖不到晚于它的提交」。"""
    a("gate31.dir_committed", resolve(f"{GATE_FIXED_DIR}/summary.json", files) is not None, GATE_FIXED_DIR)
    a("gate31.bound_commit", (gate.get("commit") or "") == GATE_COMMIT, (gate.get("commit") or "")[:8])
    a("gate31.verdict_of_record", str(gate.get("verdictOfRecord") or "").startswith("PASS"),
      gate.get("verdictOfRecord"))
    a("gate31.exit.install", gate["install"]["exit_code"] == 0,
      f"summary.exit_code={gate['install']['exit_code']}（无 gate0-install.exit，以 summary 为准）")
    a("gate31.exit.typecheck", gate["exits"]["gate1-typecheck"] is True, gate["elapsed"]["gate1-typecheck"])
    a("gate31.exit.test", gate["exits"]["gate2-bun-test"] is True, gate["elapsed"]["gate2-bun-test"])
    a("gate31.exit.build", gate["exits"]["gate3-build"] is True, gate["elapsed"]["gate3-build"])

    a("gate31.install.packages", gate["install"]["packages"] == 931, gate["install"]["packages"])
    tc = gate["typecheck"]
    a("gate31.typecheck.zero_errors", tc["errors"] == 0 and tc["logErrorTs"] == 0,
      f"summary={tc['errors']} log={tc['logErrorTs']}")
    a("gate31.typecheck.non_empty_proof", (tc["files"] or 0) == 3443 and (tc["webSrcFiles"] or 0) == 410,
      f"{tc['files']} files / {tc['webSrcFiles']} web-src")

    t = gate["test"]
    a("gate31.test.pass", t["pass"] == 1535 == t["logPass"], f"summary={t['pass']} log={t['logPass']}")
    a("gate31.test.zero_fail", t["fail"] == 0 == t["logFail"], f"summary={t['fail']} log={t['logFail']}")
    a("gate31.test.files", t["files"] == 89 == t["logFiles"], f"summary={t['files']} log={t['logFiles']}")
    a("gate31.test.total_eq_pass", t["logTotal"] == t["logPass"], f"{t['logTotal']}/{t['logPass']}")
    a("gate31.test.expect_calls", t["expect"] == 8520 == t["logExpect"],
      f"summary={t['expect']} log={t['logExpect']}")

    b = gate["build"]
    a("gate31.build.modules", b["modules"] == 8831 == b["logModules"], f"summary={b['modules']} log={b['logModules']}")
    a("gate31.build.entry_js", b["logEntryJs"] == "index-DTgGRCtK.js" and "index-DTgGRCtK.js" in (b["jsBundle"] or ""),
      b["logEntryJs"])
    a("gate31.build.dist_files", b["distFiles"] == 443 == b["distListed"], f"summary={b['distFiles']} list={b['distListed']}")

    # ---- 覆盖缺口：四闸只到 c17890c3，晚于它的提交全部未被覆盖（时序机检）
    a("gate31.coverage.aspect_code_in_gate", _is_ancestor(ASPECT_CODE_COMMIT, GATE_COMMIT),
      f"{ASPECT_CODE_COMMIT[:8]} 已含于 {GATE_COMMIT[:8]}")
    a("gate31.coverage.aspect_evidence_after_gate", _is_ancestor(GATE_COMMIT, ASPECT_COMMIT),
      f"{GATE_COMMIT[:8]} → {ASPECT_COMMIT[:8]}（证据/结论在闸后）")
    for label, sha in (
        ("honest_ui", HONEST_COMMIT),
        ("fixture", FIXTURE_COMMIT),
        ("media_auth", MEDIA_AUTH_COMMIT),
    ):
        a(f"gate31.coverage.{label}_after_gate", _is_ancestor(GATE_COMMIT, sha),
          f"{GATE_COMMIT[:8]} → {sha[:8]}")

    heads = []
    for p in sorted(files or {}):
        m = re.match(r"(docs/V1\.0/reports/verify-head-[^/]+)/summary\.json$", p)
        if not m:
            continue
        try:
            heads.append((m.group(1), json.loads(blob_text(files[p]["blob"])).get("head_commit")))
        except Exception:  # noqa: BLE001
            heads.append((m.group(1), None))
    late = [HONEST_COMMIT, FIXTURE_COMMIT, MEDIA_AUTH_COMMIT]
    covering = sorted({h[0] for h in heads if h[1] and any(_is_ancestor(x, h[1]) for x in late)})
    a("gate31.coverage.no_gate_covers_late_commits", covering == [],
      f"gates={[h[0] for h in heads]} covering={covering}")
    ncx = json.dumps(gate.get("notCovered"), ensure_ascii=False)
    a("gate31.coverage.not_covered_declared", bool(gate.get("notCovered")) and "E2E" in ncx,
      ncx[:120])
# ================================================================ R31 维度：T / R / U
def _i18n_block(text: str, name: str) -> str:
    """按花括号配平切出 `name: { ... }` 整块，避免把别的命名空间算进来。"""
    i = text.find(name + ": {")
    if i < 0:
        return ""
    j = text.index("{", i)
    depth = 0
    for k in range(j, len(text)):
        if text[k] == "{":
            depth += 1
        elif text[k] == "}":
            depth -= 1
            if depth == 0:
                return text[i : k + 1]
    return ""


def up_video_translation_t31(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.T（R31）：只按**文本内容**判诚实性。

    判 PASS 的依据不是「UI 降级了」，而是三类可机检事实：
      1. 能力缺失被明文写出（上游无语言/口型字段 → 只影响提示词，不保证生效）；
      2. 结果被明确标注为未验证，且不得出现任何「已完成」类承诺；
      3. 品牌/计费占位词为零。
    """
    comp_p = resolve(UI_HONEST, files)
    ws_p = resolve(UI_WS, files)
    zh_p = resolve(UI_I18N_ZH, files)
    en_p = resolve(UI_I18N_EN, files)
    a("t.files.committed", all(p is not None for p in (comp_p, ws_p, zh_p, en_p)),
      "honesty 组件 + workspace + 中英 i18n 全在 PIN 树内")

    comp = blob_text(files[comp_p]["blob"])
    ws = blob_text(files[ws_p]["blob"])
    zh = _i18n_block(blob_text(files[zh_p]["blob"]), "videoTranslation")
    en = _i18n_block(blob_text(files[en_p]["blob"]), "videoTranslation")
    a("t.i18n.blocks_found", bool(zh) and bool(en), f"zh={len(zh)}B en={len(en)}B")

    # ---- 1) 常驻提示：存在、不可关闭、挂在 workspace 上
    a("t.notice.rendered_in_workspace", "<VideoTranslationHonestyNotice" in ws, "workspace 里渲染诚实提示")
    a("t.notice.has_testid", 'data-testid="video-translation-honesty-notice"' in comp, "有稳定 testid")
    a("t.notice.not_dismissible", ("onClose" not in comp) and ("dismiss" not in comp),
      "组件无关闭入口（常驻）")

    # ---- 2) 能力缺失被写清（中文）
    a("t.zh.title_states_not_translation", "非逐句翻译" in zh and "口型对齐" in zh, "标题写明非逐句翻译/口型对齐")
    a("t.zh.title_states_no_real_channel", "真实翻译通道未接入" in zh, "标题写明真实通道未接入")
    a("t.zh.body_prompt_only", "只会写进提示词" in zh, "正文写明语言只写进提示词")
    a("t.zh.body_no_guarantee", "不能保证换语言、换字幕或对齐口型" in zh, "正文写明不能保证生效")
    a("t.zh.body_unverified_draft", "未验证草稿" in zh, "正文要求按未验证草稿处理")
    a("t.zh.basis_cites_commit", "1ef24fba" in zh, "依据引用协议调查提交 1ef24fba")
    a("t.zh.language_hint_no_field", "上游无 language 字段，不保证生效" in zh, "语言选择器提示无上游字段")
    a("t.zh.source_hint_not_detected", "不会被上游真实识别" in zh, "源语言说明不被上游识别")
    a("t.zh.lipsync_disabled_reason", "上游无 lipSync 参数：开关已置灰" in zh, "口型开关置灰并给理由")
    a("t.zh.lipsync_snapshot_unsupported", "不支持（上游无该参数）" in zh, "口型快照值=不支持")
    a("t.zh.output_count_honest", "当前渠道一次只返回 1 条结果" in zh, "说明单结果限制")
    a("t.zh.result_title_unverified", "AI 重生成结果（未验证翻译）" in zh, "结果区标题标注未验证")
    a("t.zh.result_badge", "未验证翻译 · 请人工确认语言与字幕" in zh, "结果徽标要求人工确认")
    a("t.zh.sidebar_no_dub_claim", "不代表译制完成" in zh, "侧栏写明不代表译制完成")
    a("t.zh.history_hint", "同样需人工确认语言与字幕" in zh, "历史任务同样需人工确认")

    # ---- 3) 英文同构（避免只中文诚实、英文吹牛）
    a("t.en.title_states_not_translation", "not sentence-level translation or lip sync" in en, "EN 标题同构")
    a("t.en.title_no_real_channel", "no real translation channel is connected" in en, "EN 写明无真实通道")
    a("t.en.body_prompt_only", "only written into the prompt" in en, "EN 正文写明仅提示词")
    a("t.en.body_no_guarantee", "cannot guarantee a language swap, subtitles or lip alignment" in en,
      "EN 写明不保证生效")
    a("t.en.result_badge", "Unverified translation · confirm language and subtitles manually" in en, "EN 结果徽标")

    # ---- 4) 零虚假承诺 / 零品牌 / 零计费占位（扫描范围=i18n VT 命名空间 + 两个组件）
    # 只看「会呈现给用户/会进提示词」的内容：注释里写「禁止出现翻译完成」不算承诺
    def _code(s: str) -> str:
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
        return "\n".join(
            ln for ln in s.split("\n") if not ln.strip().startswith(("//", "*", "/*"))
        )

    scan = {"zh": zh, "en": en, "honesty.tsx": _code(comp), "workspace.tsx": _code(ws)}
    hits = [(k, w) for k, body in scan.items() for w in FALSE_PROMISES if w in body]
    a("t.no_false_promise", hits == [], str(hits))
    brand = [(k, w) for k, body in scan.items() for w in BRAND_WORDS if w in body]
    a("t.no_brand_word", brand == [], str(brand))
    billing = [(k, w) for k, body in scan.items() for w in BILLING_WORDS if w in body]
    a("t.no_billing_placeholder", billing == [], str(billing))

    # ---- 5) 开关在代码里被归零（不是只写文案）
    a("t.lipsync.forced_false_in_state", "lipSync: false" in ws, "状态层强制 lipSync=false")
    a("t.lipsync.section_has_testid", 'data-testid="video-translation-lipsync"' in ws, "口型区块有 testid")
    a("t.lipsync.snapshot_rendered", "honest.lipSyncSnapshot" in ws, "页面渲染不支持快照值")
    a("t.language.section_has_testid", 'data-testid="video-translation-language"' in ws, "语言区块有 testid")
    a("t.language.badge_no_effect", 'data-testid="video-translation-language-badge"' in ws, "语言区有「仅提示词」徽标")

    # ---- 6) 有测试把文案钉住（防回归成吹牛）
    ht = blob_text(files[resolve(UI_HONEST_TEST, files)]["blob"]) if resolve(UI_HONEST_TEST, files) else ""
    a("t.test.committed", bool(ht), UI_HONEST_TEST)
    a("t.test.asserts_no_false_promise", ("false" in ht.lower()) and HT_NO_PROMISE in ht,
      "测试断言不含「已完成」类文案")

    return {
        "verdict": "PASS",
        "basis_kind": "text-only",
        "basis": [
            "能力缺失被中英文双语明文写出：上游无 sourceLanguage/lipSync 字段 → 语言只进提示词、开关置灰",
            "结果被标注为未验证草稿，并要求人工确认语言与字幕（中英同构）",
            "扫描范围内无「翻译完成/口型已对齐/字幕已生成」等承诺，无品牌词，无计费占位",
            "代码层把 lipSync 强制归零，不是只改文案",
        ],
        "evidence": [UI_HONEST, UI_WS, UI_I18N_ZH, UI_I18N_EN, UI_HONEST_TEST],
        "risks": [
            "T 绿只说明「说得对」，不说明「做得到」：同一轮 F 仍 PARTIAL",
            "若后续新增别的入口（如批量/工作流）未复用该组件，文案可能不一致",
        ],
        "note": "T=R31 文本口径：以 i18n 命名空间 + 两个组件的实际字符串为判据（非「UI 已降级」这种结论式表述）。"
                "PASS 不代表能力达成；能力见 F=PARTIAL。",
    }


HT_NO_PROMISE = "翻译完成"


def up_video_translation_r31(a: Assertions, files: dict) -> dict:
    """VIDEO_TRANSLATION.R（R31）：真实结果字节可独立复算（语言组新产出）。"""
    p = resolve(LANG_FILES["result_mp4"], files)
    a("r31.result_blob_present", p is not None, LANG_FILES["result_mp4"])
    n, sha = blob_sha(files[p]["blob"]) if p else (0, "")
    a("r31.result_bytes", n == LANG_RESULT["bytes"], n)
    a("r31.result_sha256", sha == LANG_RESULT["sha256"], sha[:16] + "…")
    head = blob_bytes(files[p]["blob"])[:64] if p else b""
    a("r31.result_is_mp4", b"ftyp" in head, head[4:12].decode("latin-1"))
    la = load_json(LANG_FILES["analysis"], files)
    a("r31.output_meta_matches_blob", la["output"]["bytes"] == n and la["output"]["sha256"] == sha,
      "回执 bytes/sha 与 blob 现算一致")
    a("r31.output_duration_positive", la["output"]["durationSec"] > 6, la["output"]["durationSec"])
    a("r31.video_dims_plausible",
      la["output"]["video"]["width"] >= 480 and la["output"]["video"]["height"] >= 480,
      f"{la['output']['video']['width']}x{la['output']['video']['height']}")
    a("r31.audio_track_present", bool(la["output"]["audio"].get("codec")), la["output"]["audio"]["codec"])

    return {
        "verdict": "PASS",
        "basis": [
            "语言组真实任务产出 04-result.mp4：1,199,227B / sha256 a3613615…，与回执 bytes+sha 三方一致",
            "容器 ftyp=mp4、时长 6.58s、含音轨 → 是可解析的真实结果，不是占位文件",
        ],
        "evidence": [LANG_FILES["result_mp4"], LANG_FILES["analysis"]],
        "risks": [
            "字节可复算只说明「拿到了结果文件」，不说明结果语言正确（见 F）",
        ],
        "note": "R 维度只判「结果字节是否真实可复算」；本文件同时是 F 的负证载体（音轨为英语）。",
    }

UPGRADES = [
    ("VIDEO_TRANSLATION", "F", up_video_translation_f31),
    ("VIDEO_TRANSLATION", "T", up_video_translation_t31),
    ("VIDEO_TRANSLATION", "R", up_video_translation_r31),
]

MEDIA_AUTH_RISKS = [
    {
        "id": "MA1",
        "risk": ("401 修复只到单测/本地 HTTP：media-auth 纯函数矩阵 + Bun.serve 本地链路 + ingest 透传，"
                 "没有任何一次「真实 sub2 渠道 → 下载结果 → 入库」的真机回执"),
        "status": "未验证（代码已提交，证据等级=单测）",
        "evidence": [UI_MEDIA_AUTH_TEST, UI_INGEST_TEST, MEDIA_AUTH_RECEIPT],
    },
    {
        "id": "MA2",
        "risk": ("r27 那次 401 的产物已被上游删除（502→404），无法回放验证修复是否生效；"
                 "只能靠新任务复验，而新任务尚未跑"),
        "status": "不可回放",
        "evidence": [ASP27["content_log"], MEDIA_AUTH_RECEIPT],
    },
    {
        "id": "MA3",
        "risk": ("鉴权按任务快照 channelId 解析且「不回退默认」——渠道被删后宁可 401 也不拿错 key；"
                 "这是正确取舍，但意味着历史任务在渠道删除后永久不可取回"),
        "status": "设计取舍（需在产品说明中写明）",
        "evidence": [UI_MEDIA_AUTH, UI_MEDIA_AUTH_TEST],
    },
    {
        "id": "MA4",
        "risk": ("媒体鉴权改动未被任何四闸覆盖（R28 四闸绑定 c17890c3，本改动 e7826acf 晚于它），"
                 "自述 1560 pass 在仓库内没有日志可核"),
        "status": "覆盖缺口",
        "evidence": [MEDIA_AUTH_RECEIPT, f"{GATE_FIXED_DIR}/summary.json"],
    },
]

R31_NONCLAIMS = [
    {
        "id": "NC12",
        "dim": "F",
        "not_claimed": "「画幅修复已端到端生效」",
        "reality": "bd71498f 只证明请求侧：globalSize 1:1 被 plan 覆盖为 16:9/1280x720，builtConfig.size=1280x720。"
                   "结果 mp4 在任务 succeeded 后经 502→404→401 消失，无 storageKey、目录内无 mp4 → 输出侧像素无证据。",
        "closure": "产物存活窗口内立刻下载并 ffprobe 记录宽高，或让入库把字节写进仓库。",
        "evidence": [ASP27["report"], ASP27["succeeded"], ASP27["content_log"]],
    },
    {
        "id": "NC13",
        "dim": "F",
        "not_claimed": "「语言契约已修复，翻译已生效」",
        "reality": "454fa580 修掉的是「成片朗读提示词」这一现象（EVIDENCE 记「不再复现」），"
                   "但目标语言 zh 仍未达成：成片音轨英语、0 个中文字符、强制 -l zh 也无中文。",
        "closure": "上游提供 translation 字段或换可翻译通道；否则产品只能叫「AI 重生成」。",
        "evidence": [LANG_FILES["report"], LANG_FILES["evidence"], LANG_FILES["analysis"]],
    },
    {
        "id": "NC14",
        "dim": "F",
        "not_claimed": "「401 已端到端修复」",
        "reality": "e7826acf 的验证是纯函数矩阵 + 本地 Bun.serve + ingest 透传单测（自述 1560 pass，树内无日志），"
                   "没有真实渠道上的下载/入库回执；旧产物已被上游删除，无法回放。",
        "closure": "跑一次新任务，把「下载成功 + storageKey + 字节 sha」写进仓库。",
        "evidence": [MEDIA_AUTH_RECEIPT, UI_MEDIA_AUTH_TEST, UI_INGEST_TEST],
    },
    {
        "id": "NC15",
        "dim": "F",
        "not_claimed": "「中文语音素材已验证翻译能力」",
        "reality": "a1f29d0c 只交付素材（104,361B / 7.4s / ASR zh p=1.0 / VAD 0.934 / 纯色无字画面），"
                   "真实验收目录内没有任何文件引用它 → 尚未被任何任务消费。",
        "closure": "用该素材跑一次真实任务，并给出目标语言达成情况。",
        "evidence": [FIXTURE["evidence"]],
    },
    {
        "id": "NC16",
        "dim": "T",
        "not_claimed": "「T 绿=能力可用」",
        "reality": "T 只断言文案诚实（能力缺失被写明、结果标注未验证、无虚假承诺/品牌/计费占位）。"
                   "T=PASS 与 F=PARTIAL 同时成立：说清楚了≠做到了。",
        "closure": "无需闭合；文档中禁止用 T 绿替代 F 的能力结论。",
        "evidence": [UI_I18N_ZH, UI_I18N_EN, UI_HONEST],
    },
    {
        "id": "NC17",
        "dim": "H",
        "not_claimed": "「H 维度吸收了本轮新证据」",
        "reality": "R31 没有新增 H 证据（无 b5-*/task-real-* 新回执，无新 recovery 目录）。"
                   "H 维持基线判，不由本轮任何提交支撑。",
        "closure": "若要用新提交支撑 H，需给出对应真实回执。",
        "evidence": [],
    },
]


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

    # 门禁：只从 PIN 树读 R28 四闸，并把原始日志归档进本轮 evidence/
    gate = read_gate_r28(GATE_FIXED_DIR, files)
    if write:
        dst = os.path.join(OUT_DIR, "evidence", "gate-logs")
        os.makedirs(dst, exist_ok=True)
        for rel in sorted(p for p in files if p.startswith(f"{GATE_FIXED_DIR}/")):
            name = rel[len(GATE_FIXED_DIR) + 1 :].replace("/", "__")
            with open(os.path.join(dst, name), "wb") as f:
                f.write(blob_bytes(files[rel]["blob"]))

    A = Assertions()
    gate_assertions_r31(A, gate, files)

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
        ok = sub.ok() and res.get("verdict") == res.get("expect", "PASS")
        if ok:
            t[dim] = res["verdict"]
        if ok or res.get("verdict") == before:
            t[f"{dim}_note"] = res.get("note")
            t[f"{dim}_evidence"] = [e for e in res.get("evidence", []) if e]
            t[f"{dim}_basis"] = res.get("basis") or []
        applied.append({
            "tool": tool_id, "dim": dim, "before": before, "after": t.get(dim),
            "assertions": sub.rows, "passed": sub.ok(), "note": res.get("note"),
            "basis": res.get("basis") or [], "basis_kind": res.get("basis_kind"),
            "evidence": [e for e in (res.get("evidence") or []) if e],
        })
        for r in res.get("risks") or []:
            risks.append({"tool": tool_id, "dim": dim, "risk": r})
    # 升级函数内部的逐条断言也要进总表（否则 --check 看不到它们的名字/结果）
    for x in applied:
        A.rows.extend(x["assertions"])
    A.rows.extend({"name": f"upgrade.{x['tool']}.{x['dim']}.assertions",
                   "ok": x["passed"],
                   "detail": ",".join(a["name"] for a in x["assertions"] if not a["ok"]) or f"{sum(1 for a in x['assertions'] if a['ok'])}/{len(x['assertions'])}"}
                  for x in applied)

    # ---- 不变量：其余 38 工具六维逐格不变（本轮只动 VIDEO_TRANSLATION）
    base_by_id = {x["id"]: x for x in base["tools"]}
    for t in tools:
        if t["id"] == "VIDEO_TRANSLATION":
            continue
        bt = base_by_id[t["id"]]
        drift = [d for d in TALLIES if t.get(d) != bt.get(d)]
        A(f"invariant.{t['id']}.dims_unchanged", drift == [],
          ",".join(f"{d}:{bt.get(d)}->{t.get(d)}" for d in drift))
    A("invariant.tool_count_39", len(tools) == 39, len(tools))
    A("invariant.tool_id_set_unchanged", sorted(base_by_id) == sorted(x["id"] for x in tools), len(base_by_id))
    A("invariant.vt_f_not_pass", by_id["VIDEO_TRANSLATION"].get("F") != "PASS", by_id["VIDEO_TRANSLATION"].get("F"))
    A("invariant.vt_f_baseline_partial", base_by_id["VIDEO_TRANSLATION"].get("F") == "PARTIAL",
      base_by_id["VIDEO_TRANSLATION"].get("F"))

    # ---- 未吸收提交：逐个断言「确实是 PIN 的祖先」「确实是本轮审查范围」
    absorbed = []
    for c in UNABSORBED_COMMITS:
        sha = c["commit"]
        A(f"unabsorbed_commit.{sha[:8]}.is_ancestor_of_pin", _is_ancestor(sha, PIN_COMMIT),
          f"{sha[:8]} → {PIN_COMMIT[:8]}")
        A(f"unabsorbed_commit.{sha[:8]}.touches_expected",
          bool(git("show", "--name-only", "--format=", sha).strip()),
          c["touches"])
        absorbed.append({**c,
                         "ancestor_of_pin": _is_ancestor(sha, PIN_COMMIT),
                         "files": len([x for x in git("show", "--name-only", "--format=", sha).splitlines() if x.strip()])})
    A("unabsorbed_commit.count", len(absorbed) == 7, len(absorbed))

    # ---- 工作区未提交登记（只登记，不参与判据）
    uncommitted = []
    for item in UNCOMMITTED:
        rel = item["path"].rstrip("/")
        tracked = rel in files
        expect_in_pin = item["kind"] != "untracked-dir"
        A(f"uncommitted.{item['id']}.{'tracked_in_pin' if expect_in_pin else 'absent_from_pin'}",
          tracked == expect_in_pin, f"{rel} tracked={tracked}")
        uncommitted.append({**item, "in_pin_tree": tracked})

    # ---- 媒体鉴权风险单列（不进五维）
    for r in MEDIA_AUTH_RISKS:
        A(f"mediaauth_risk.{r['id']}.evidence_committed",
          all(resolve(e, files) is not None for e in r["evidence"]), r["id"])

    t = tally(tools)
    non_green = sorted({(x["id"], d) for x in tools for d in TALLIES if x.get(d) not in ("PASS", "N/A")})
    residual = [{"tool": tid, "dim": d, "verdict": by_id[tid].get(d),
                 "note": by_id[tid].get(f"{d}_note"), "evidence": by_id[tid].get(f"{d}_evidence") or []}
                for tid, d in non_green]

    t31 = next(x for x in applied if x["dim"] == "T")
    matrix = {
        "generatedAt": "2026-10-30",
        "round": ROUND,
        "head": PIN_COMMIT,
        "headSubject": git("log", "-1", "--format=%s", PIN_COMMIT).strip(),
        "branch": ", ".join(sorted(set(git("for-each-ref", "--contains", PIN_COMMIT,
                                           "--format=%(refname:short)", "refs/heads").split()))),
        "scope": {"tools": len(tools), "dims": list(TALLIES)},
        "rubric": base.get("rubric"),
        "rubricNote": base.get("rubricNote"),
        "baseline": {"commit": BASE_COMMIT, "matrix": BASE_MATRIX, "summary": base.get("summary")},
        "auditor": "tools/recompute_scope_matrix_r31.py",
        "strictness": [
            "只吸收 PIN 树内已提交证据：size/sha256 由 `git cat-file blob` 现算，工作区未提交内容不参与判据。",
            "升级须通过硬断言（字段/取值/字节/sha 交叉相等）；断言失败即保持基线原判。",
            "能力级失败不因「UI 已诚实降级」转绿：T 与 F 分开判，T 绿不得替代 F。",
            "画幅/语言只在请求侧或单测层成立时，一律算「未验」：请求侧绿 ≠ 结果绿。",
            "未吸收提交只作负证，逐条登记到 unabsorbedCommits，并断言其确为 PIN 祖先。",
            "媒体鉴权风险单列 mediaAuthRisks，不折算进任何维度分数。",
            "门禁覆盖按时序机检：R28 四闸绑定 c17890c3，晚于它的提交必须判定为「未覆盖」。",
            "R25→R27 的 38 个工具六维逐格比对，任何一格漂移即断言失败。",
        ],
        "gate": gate,
        "upgrades": applied,
        "tBasis": t31["assertions"],
        "unabsorbedCommits": absorbed,
        "uncommitted": uncommitted,
        "mediaAuthRisks": MEDIA_AUTH_RISKS,
        "tools": tools,
        "summary": {
            "tools": len(tools),
            "tally": t,
            "non_green_units": len(non_green),
            "non_green": [f"{a}.{b}" for a, b in non_green],
            "changed_units": [f"{x['tool']}.{x['dim']}:{x['before']}->{x['after']}" for x in applied
                              if x["before"] != x["after"]],
        },
        "nonClaims": (base.get("nonClaims") or []) + R31_NONCLAIMS,
        "residual": residual,
        "risks": risks,
        "assertions": A.rows,
    }

    if write:
        os.makedirs(os.path.join(OUT_DIR, "evidence"), exist_ok=True)
        with open(os.path.join(OUT_DIR, "matrix.json"), "w", encoding="utf-8") as f:
            json.dump(matrix, f, ensure_ascii=False, indent=2)
        with open(os.path.join(OUT_DIR, "matrix.md"), "w", encoding="utf-8") as f:
            f.write(render_matrix_md(matrix))
        with open(os.path.join(OUT_DIR, "report.md"), "w", encoding="utf-8") as f:
            f.write(render_report(matrix))
        shutil.copy2(os.path.abspath(__file__), os.path.join(OUT_DIR, "auditor.py"))
    return matrix


# ---------------------------------------------------------------- 渲染
def render_matrix_md(m: dict) -> str:
    s = m["summary"]
    L = [f"# {m['round']} 独立矩阵（{s['tools']} 工具 · 六维）", ""]
    L.append(f"- 审计点（PIN）：`{m['head']}`")
    L.append(f"- 基线：`{m['baseline']['commit'][:8]}`（{m['baseline']['matrix']}）")
    L.append(f"- 断言：{sum(1 for a in m['assertions'] if a['ok'])}/{len(m['assertions'])} 通过")
    L.append(f"- 非全绿单元：{s['non_green_units']} → {', '.join(s['non_green'])}")
    L.append(f"- 本轮改判：{', '.join(s['changed_units']) or '无（无单元从非 PASS 变为 PASS）'}")
    L.append("")
    L.append("## 维度分布")
    L.append("")
    COLS = ["PASS", "PARTIAL", "FAIL", "BLOCKED", "N/A"]
    L.append("| 维度 | " + " | ".join(COLS) + " |")
    L.append("|" + "---|" * (1 + len(COLS)))
    for d in TALLIES:
        vals = s["tally"][d]
        L.append(f"| {d} | " + " | ".join(str(vals.get(k, 0)) for k in COLS) + " |")
    L.append("")
    L.append("## 非全绿工具")
    L.append("")
    L.append("| 工具 | " + " | ".join(TALLIES) + " |")
    L.append("|" + "---|" * (1 + len(TALLIES)))
    for x in m["tools"]:
        if any(x.get(d) not in ("PASS", "N/A") for d in TALLIES):
            L.append(f"| {x['id']} | " + " | ".join(str(x.get(d) or "N/A") for d in TALLIES) + " |")
    L.append("")
    L.append("## 断言失败项")
    L.append("")
    bad = [a for a in m["assertions"] if not a["ok"]]
    if not bad:
        L.append("无。")
    for a in bad:
        L.append(f"- `{a['name']}` — {a['detail']}")
    L.append("")
    return "\n".join(L) + "\n"


def render_report(m: dict) -> str:
    s = m["summary"]
    g = m["gate"]
    L: list[str] = []
    add = L.append
    add(f"# {m['round']} 独立审计报告 —— {s['tools']} 工具六维矩阵重算")
    add("")
    add(f"- **审计点（PIN）**：`{m['head']}`（{m.get('headSubject', '')}）")
    add(f"- **基线**：`{m['baseline']['commit'][:8]}` — {m['baseline']['matrix']}")
    add(f"- **工具**：`{m['auditor']}`（`--check` 在任意 HEAD 重跑同一结论）")
    add(f"- **断言**：{sum(1 for a in m['assertions'] if a['ok'])}/{len(m['assertions'])} 通过")
    add("")
    add("## 0. 一句话结论")
    add("")
    add(f"39 个工具 × 6 维共 {s['tools'] * 6} 格中，**非全绿 {s['non_green_units']} 格**：`{', '.join(s['non_green'])}`。")
    add("本轮 7 个待吸收提交**没有一个**把 `VIDEO_TRANSLATION.F` 从 PARTIAL 翻成 PASS，"
        "但它们把「为什么做不到」钉成了可复算的事实；同时新增两项必须单列的风险："
        "**画幅只验到请求侧**、**媒体 401 只修到单测层**。")
    add("")
    add("## 1. 判据与方法")
    add("")
    for i, x in enumerate(m["strictness"], 1):
        add(f"{i}. {x}")
    add("")
    add("## 2. 与基线（R27）的差异")
    add("")
    add("| 单元 | R27 | R31 | 依据 |")
    add("|---|---|---|---|")
    for x in m["upgrades"]:
        add(f"| {x['tool']}.{x['dim']} | {x['before']} | {x['after']} | "
            f"{sum(1 for a in x['assertions'] if a['ok'])}/{len(x['assertions'])} 断言通过 |")
    add("")
    add(f"`invariant.*` 断言保证其余 38 个工具六维逐格未漂移（{sum(1 for a in m['assertions'] if a['name'].startswith('invariant.') and a['ok'])} 条全部通过）。")
    add("")
    add("## 3. 未吸收提交（逐个交代：为什么没进判据）")
    add("")
    add("| 提交 | 主题 | 去向 | 理由 |")
    add("|---|---|---|---|")
    for c in m["unabsorbedCommits"]:
        add(f"| `{c['commit'][:8]}` | {c['subject']} | {c['absorbed_into']} | {c['reason']} |")
    add("")
    add(f"其中 `{m['unabsorbedCommits'][0]['commit'][:8]}` 的 **BLOCKED** 结论只作负证：上游 `/v1/videos` 没有 "
        "`sourceLanguage / targetLanguage / lipSync / 字幕` 字段，所以「视频翻译」当前只能是「照提示词重生成」。")
    add("")
    add("## 4. 媒体鉴权风险（单列，不折算进任何维度）")
    add("")
    for r in m["mediaAuthRisks"]:
        add(f"### {r['id']} · {r['status']}")
        add("")
        add(r["risk"])
        add("")
        add("证据：")
        for e in r["evidence"]:
            add(f"- `{e}`")
        add("")
    add("## 5. 语言与画幅：本轮最硬的两组事实")
    add("")
    add("### 5.1 目标语言 zh 未达成（454fa580 真实任务）")
    add("")
    add("- 任务 `task-mvuilah9-v6u5s1` → 上游 `task_fnyYPg9WDzJfWzhWzjI9y80mBKUQNmT9`，渠道 `sub2::MiniMax-H3`，**succeeded**（1 attempt / 675s）")
    add("- 成片 1,199,227B / sha256 `a3613615…`：音轨仍是英语，0 个中文字符（强制 `-l zh` 也转不出中文）")
    add("- 源片是真实英语人声（6.59s，「Meet the watch…」）→ 不能用「没有语音」解释")
    add("- 已修掉的是「成片朗读提示词」（EVIDENCE 记「不再复现」）；未修掉的是「换语言」本身")
    add("")
    add("### 5.2 画幅：请求侧绿，输出侧无字节（bd71498f）")
    add("")
    add("- 请求：`globalSize=1:1` 被 plan 覆盖为 `16:9 / 1280x720`，`builtConfig.size=1280x720` ✅")
    add("- 结果：任务 succeeded 后 `502 → 状态查询 404 → 内容 401`，`items[0].ingestError=媒体下载失败（HTTP 401）`，无 `storageKey`，目录内无 mp4 ⛔")
    add("- 结论：**不得**表述为「画幅已端到端修复」")
    add("")
    add("## 6. 门禁（R28 四闸）与覆盖缺口")
    add("")
    add(f"- 目录：`{GATE_FIXED_DIR}`，绑定 commit `{(g.get('commit') or '')[:8]}`，记录结论 `{g.get('verdictOfRecord')}`")
    add(f"- install：{g['install']['packages']} 包 / exit0")
    add(f"- typecheck：{g['typecheck']['errors']} error，program {g['typecheck']['files']} 文件（web/src {g['typecheck']['webSrcFiles']}）")
    add(f"- test：{g['test']['pass']} pass / {g['test']['fail']} fail / {g['test']['files']} 文件 / {g['test']['expect']} expect")
    add(f"- build：{g['build']['modules']} modules / {g['build']['distFiles']} dist 文件 / 入口 `{g['build']['logEntryJs']}`")
    add("")
    add("**覆盖缺口（时序机检）**：四闸绑定 `c17890c3`，而以下提交都在它之后 → 均未被四闸覆盖：")
    add("")
    for name, sha in (("诚实降级 UI", HONEST_COMMIT), ("中文语音素材", FIXTURE_COMMIT), ("媒体鉴权修复", MEDIA_AUTH_COMMIT)):
        add(f"- {name} `{sha[:8]}`")
    add("")
    add("`gate31.coverage.no_gate_covers_late_commits` 断言：PIN 树内不存在任何绑定这些后继提交的门禁目录。")
    add("")
    add("## 7. 中文语音素材（a1f29d0c）")
    add("")
    add("素材本身已核实：104,361B / sha256 `7e4ab7c2…` / 7.4s / faster-whisper zh p=1.0 / VAD 覆盖 0.934 / 纯色无字画面（OCR 干扰为零）/ CC BY-SA 4.0。")
    add("**但它还没有被任何真实任务引用** → 是「准备好的输入」，不是「验证过的能力」。")
    add("")
    add("## 8. T 维为什么可以 PASS（附判定依据）")
    add("")
    add(f"T 的 PASS 由 {sum(1 for a in m['tBasis'] if a['ok'])}/{len(m['tBasis'])} 条**文本内容断言**支撑（`matrix.tBasis` 全量列出），"
        "不是「UI 已降级所以绿」这种结论式判断：")
    add("")
    for x in m["tBasis"]:
        add(f"- {'✅' if x['ok'] else '❌'} `{x['name']}` — {x['detail']}")
    add("")
    add("同时明文限定：**T=PASS 与 F=PARTIAL 并存**，说清楚了不等于做到了（见 nonClaims NC16）。")
    add("")
    add("## 9. 精确剩余非全绿项")
    add("")
    for r in m["residual"]:
        add(f"### {r['tool']} · {r['dim']} = {r['verdict']}")
        add("")
        if r.get("note"):
            add(r["note"])
            add("")
        if r.get("evidence"):
            add("证据：")
            for e in r["evidence"]:
                add(f"- `{e}`")
            add("")
    add("## 10. 非声明（明确不主张的事）")
    add("")
    add("| ID | 维度 | 不主张 | 实际情况 | 闭合条件 |")
    add("|---|---|---|---|---|")
    for n in m["nonClaims"]:
        add(f"| {n['id']} | {n['dim']} | {n['not_claimed']} | {n['reality']} | {n['closure']} |")
    add("")
    add("## 11. 风险清单")
    add("")
    for r in m["risks"]:
        add(f"- **{r['tool']}.{r['dim']}**：{r['risk']}")
    add("")
    add("## 12. 断言总表（失败项）")
    add("")
    bad = [a for a in m["assertions"] if not a["ok"]]
    if not bad:
        add("无失败断言。")
    else:
        for a in bad:
            add(f"- `{a['name']}` — {a['detail']}")
    add("")
    add("## 13. 复现方式")
    add("")
    add("```bash")
    add(f"python3 {m['auditor']} --check   # 只读 PIN 树 + 断言，任一失败即非 0 退出")
    add(f"python3 {m['auditor']}          # 重新生成 {OUT_DIR}/matrix.json|matrix.md|report.md")
    add("```")
    add("")
    add("> `--check` 不写盘、不读工作区未提交内容；换到更新的 HEAD 也得到同一结论（证据全部来自固定 PIN 树）。")
    add("")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- 入口
REQUIRED_ASSERTIONS = [
    "invariant.vt_f_not_pass",
    "invariant.tool_count_39",
    "invariant.vt_f_baseline_partial",
    "vt.f31.verdict_must_stay_partial",
    "vt.lang31.translation_not_applied",
    "vt.lang31.zero_cjk_in_output",
    "vt.aspect31.ingest_error_401",
    "vt.aspect31.no_storage_key",
    "vt.mediaauth31.no_committed_gate_logs",
    "vt.fixture31.not_used_by_any_real_task",
    "vt.protocol31.blocked_verdict",
    "t.no_false_promise",
    "t.no_brand_word",
    "t.no_billing_placeholder",
    "t.zh.body_no_guarantee",
    "gate31.coverage.no_gate_covers_late_commits",
    "gate31.bound_commit",
    "unabsorbed_commit.count",
]


def check(m: dict) -> list[str]:
    names = {a["name"]: a["ok"] for a in m["assertions"]}
    missing = [n for n in REQUIRED_ASSERTIONS if n not in names]
    failed = [n for n in REQUIRED_ASSERTIONS if names.get(n) is False]
    out = []
    if missing:
        out.append("缺少必需断言：" + ", ".join(missing))
    if failed:
        out.append("必需断言失败：" + ", ".join(failed))
    if m["summary"]["non_green"] != ["VIDEO_TRANSLATION.F"]:
        out.append("非全绿单元集合变化：" + str(m["summary"]["non_green"]))
    if m["tools"][[x["id"] for x in m["tools"]].index("VIDEO_TRANSLATION")]["F"] != "PARTIAL":
        out.append("VIDEO_TRANSLATION.F 被判成非 PARTIAL")
    if not all(a["ok"] for a in m["assertions"]):
        bad = [a["name"] for a in m["assertions"] if not a["ok"]]
        out.append("存在失败断言：" + ", ".join(bad[:8]) + ("…" if len(bad) > 8 else ""))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="R31 独立矩阵重算器")
    ap.add_argument("--check", action="store_true", help="只校验，不写盘")
    args = ap.parse_args()

    m = build(write=not args.check)
    problems = check(m)
    if args.check:
        if problems:
            print("CHECK FAILED")
            for p in problems:
                print(" -", p)
            return 1
        print(f"CHECK OK：{len(m['assertions'])} 断言全通过；非全绿 {m['summary']['non_green']}")
        return 0
    bad = [a for a in m["assertions"] if not a["ok"]]
    print(f"写出 {OUT_DIR}（非全绿 {m['summary']['non_green_units']} 单元，"
          f"断言 {len(m['assertions']) - len(bad)}/{len(m['assertions'])}）")
    if bad:
        print("失败断言：", ", ".join(a["name"] for a in bad))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

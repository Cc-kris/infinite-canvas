#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_VIDEO_EDITING.H 硬腿机检（r21b）。

R20/R21 审计器对 AVE.H 的四条阻断项，本脚本按「回执里必须存在的机读字段 + 磁盘真实文件」
逐条硬检，任一不过即退出码 1：

  1) reload 机读标记：cdp Page.reload、navType=reload、timeOrigin 前后不同且递增、同 tab 探针存活；
  2) storageKey taskId 绑定：`tool-result:<taskId>:<index>:<itemId>` 前缀，provenance=task-bound；
  3) 下载真实落盘：fileOnDisk=true 且该路径存在、字节数与 sha256 与回执一致；
  4) 三路字节同一：legacy / adopted / download / asset / canvas sha 全等，且等于 byteReconciliation.bytes；
  5) 结论不得是自证 caveat：verdict == H_PASS。

用法：python3 tools/verify_ai_video_editing_h_r21.py [--receipt PATH]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

DEFAULT_RECEIPT = "evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json"
TASK_RE = re.compile(r"^task-[a-z0-9]{5,}-[a-z0-9]{4,}$")
EXPECT_BYTES = 2268656


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--receipt", default=DEFAULT_RECEIPT)
    args = ap.parse_args()

    rows: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        rows.append((name, bool(ok), detail))

    if not os.path.exists(args.receipt):
        print(f"FAIL receipt missing: {args.receipt}")
        return 1
    d = json.load(open(args.receipt, encoding="utf-8"))

    check("tool", d.get("tool") == "AI_VIDEO_EDITING", str(d.get("tool")))
    task = d.get("task") or {}
    check("task.id", bool(TASK_RE.match(str(task.get("taskId", "")))), str(task.get("taskId")))

    fr = d.get("freshReload") or {}
    check("reload.method_cdp", "Page.reload" in str(fr.get("method", "")), str(fr.get("method"))[:40])
    check("reload.navType", fr.get("navType") == "reload", str(fr.get("navType")))
    t0b, t0a = fr.get("timeOriginBefore"), fr.get("timeOriginAfter")
    check(
        "reload.timeOrigin_advanced",
        isinstance(t0b, (int, float)) and isinstance(t0a, (int, float)) and t0a > t0b,
        f"{t0b} -> {t0a}",
    )
    check("reload.sameTab", fr.get("sameTab") is True, str(fr.get("sameTab")))
    check("reload.session_probe", fr.get("sessionStorageProbeSurvived") is True, str(fr.get("sessionStorageProbeKey")))
    check("reload.historyCard", fr.get("historyCardVisible") is True, "")
    buttons = fr.get("buttons") or {}
    check("reload.buttons_enabled", buttons and all(v == "enabled" for v in buttons.values()), json.dumps(buttons, ensure_ascii=False))

    items = task.get("resultItems") or [{}]
    it = items[0]
    sk = str(it.get("storageKey") or "")
    expect_prefix = f"tool-result:{task.get('taskId')}:"
    check("storageKey.task_bound", sk.startswith(expect_prefix), sk)
    check("storageKey.provenance", it.get("storageKeyProvenance") == "task-bound", str(it.get("storageKeyProvenance")))
    check("storageKey.payload", it.get("payloadDropped") is False, str(it.get("payloadDropped")))
    check("result.bytes", it.get("bytes") == EXPECT_BYTES, str(it.get("bytes")))

    dl = next((x for x in d.get("actions") or [] if x.get("action") == "download"), {})
    path = str(dl.get("filePath") or "")
    check("download.fileOnDisk", dl.get("fileOnDisk") is True, str(dl.get("fileOnDisk")))
    check("download.exists", bool(path) and os.path.exists(path), path)
    if path and os.path.exists(path):
        check("download.bytes", os.path.getsize(path) == EXPECT_BYTES, str(os.path.getsize(path)))
        real = sha256_file(path)
        check("download.sha256", real == str(dl.get("sha256")), real[:12])

    br = d.get("byteReconciliation") or {}
    keys = ["legacyKeySha256", "adoptedKeySha256", "downloadSha256", "assetSha256", "canvasSha256"]
    vals = {k: br.get(k) for k in keys}
    check("bytes.all_equal", len(set(v for v in vals.values() if v)) == 1 and all(vals.values()), json.dumps({k: str(v)[:12] for k, v in vals.items()}))
    check("bytes.size", br.get("bytes") == EXPECT_BYTES, str(br.get("bytes")))

    check("verdict", str(d.get("verdict")) == "H_PASS", str(d.get("verdict")))

    width = max(len(n) for n, _, _ in rows)
    for name, ok, detail in rows:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
    failed = [r for r in rows if not r[1]]
    print(f"\n{len(rows) - len(failed)} passed, {len(failed)} failed")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())

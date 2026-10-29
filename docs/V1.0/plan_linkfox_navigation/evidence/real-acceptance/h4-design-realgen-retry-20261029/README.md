# h4-design-realgen-retry-20261029 — NEW_REPLACE_BG_V2 复测证据

基线 `bcafd94` 的上游 502 在本次真实 UI 复测中**未复现**，结果 PASS。

| 项 | 值 |
| --- | --- |
| taskId | `task-mvthl08d-06efgs` |
| 提交 | 2026-10-29T11:55:15.293Z，30s 内成功 |
| 上游 | `POST 127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → 200 |
| 结果 | 837,987B PNG 1024×1024，`sha256=e3646058…ad98ae`（oss `1793274946_ae244e30…png`） |
| 输入 | goods `product-watch.jpg` (31,860B, `43ede96e…`) + mask `/tmp/h4gen/mask-watch.png` (`2540c6a0…`)，与 bcafd94 完全一致 |
| 三动作 | 下载 837,987B 同名 sha；存资产 `2HGusbdJGgddFxgTAcZml`；发画布 `OUZvYDSInQ8Zfhl_Ay1EO` |
| reload | `navigation.type=reload`，坞 1 条 succeeded，缩略图 decoded 1024×1024，localStorage 键存在 |

## 两次提交的诚实说明

- **Attempt A** 11:53:11Z：脚本增强首跑触发 `ReferenceError: upstreamFailures is not defined`（作用域 bug），点击后 4s 崩溃；network **无 POST /v1/images** → 无效判定。留档 `*-attemptA*` + `NEW_REPLACE_BG_V2-attemptA-harness-error.json`。
- **Attempt B** 11:55:15Z：修复后唯一一次决定性提交 = 上表 PASS。之后未再提交。

## 复现

```bash
cd web
IC_EVIDENCE_DIR=<abs dir> IC_GEN_TIMEOUT_MS=420000 \
  node scripts/real-acceptance/h4-realgen-design.mjs NEW_REPLACE_BG_V2
```

脚本能力：`IC_EVIDENCE_DIR` 自定义证据目录；`request/response` 双日志（`/v1/images`）；4xx/5xx 截取 800 字符响应体 + sha256 作为上游回执；上游失败且 45s 内无任务落盘即提前判 `BLOCKED(upstream-http-<status>)`。

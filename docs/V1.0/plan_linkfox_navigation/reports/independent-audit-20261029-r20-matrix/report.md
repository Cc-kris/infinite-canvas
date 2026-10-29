# R20 独立审计报告（严格重算，不放宽判据）

- 生成时间：2026-10-29T23:26:25+08:00
- 审计对象：HEAD `a8428106a2a0bce9721f3c2e5bc204bd0a1b9072`（branch `feat/linkfox-v1-real`）
- 基线：R19 = d77ea745（matrix：F36/3 T39/0 R39/0 H36/3 K12/27 U39；非全绿 6 单元 / 5 工具）
- 审计器：`tools/recompute_scope_matrix_r20.py`（`--check` 可复现）
- 口径：rubric 与 R19 **逐字相同**（F/T/R/H/K/U 六维），未新增、未放宽、未收紧任何一条

## 1. 统计

| 维度 | PASS | PARTIAL | N/A |
|---|---|---|---|
| F | 37 | 2 | 0 |
| T | 39 | 0 | 0 |
| R | 39 | 0 | 0 |
| H | 36 | 3 | 0 |
| K | 12 | 0 | 27 |
| U | 39 | 0 | 0 |

非全绿：**5** 单元 / **5** 工具；相对 R19 改判 **1** 处；断言 **308** 条 / 失败 **0** 条；反证 **0** 条。

## 2. 本轮吸收的提交（逐条机检）

| 提交 | 内容 | 对本轮判定的影响 |
|---|---|---|
| `792c5ad6` | verify(03b8f47e) 独立目录三闸全绿 + 原始日志 | 无改判（门禁证据，后被 c8c8ce9e 超越） |
| `abdb825e` | 补齐三闸原始日志（typecheck/test/build/install/tsc --listFiles） | 无改判 |
| `12f1aa8b` | REMOVE_PEN 真实 UI 回归脚本 + 回执（上游 401） | 无改判（负证） |
| `e0bcc5d6` | VIDEO_CONCAT R25 真实 UI 跑（卡 submitting） | 无改判（负证） |
| `09d711b2` | video-translation /videos 形态只读复核 | 无改判（无新成功回执） |
| `72bd1271` | IMAGE_TEXT_EDIT 同文档 Page.reload + 下载/结果源字节对账 | 无改判（asset/canvas 腿仍空） |
| `c8c8ce9e` | fix(video) 提交/轮询时间预算 + 2 条新测试 | 无改判（源码改动 → 触发 R20 自跑三闸） |
| `dd8192a8` | AI_VIDEO_EDITING 历史恢复三路字节对账回执 | 改判 1 处：F PARTIAL→PASS；H 仍 PARTIAL |

## 3. 改判明细

### AI_VIDEO_EDITING.F → PASS

- 回执：`evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-20261029.json`
- 产物：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`（2,268,656B / sha256 47573c147325…，HEAD 内现算）
- 断言：27 条全部通过
- 依据：task-mvt42rpv-kfl1ov succeeded（upstream task_QFvq6WM…）/ 2,268,656B / sha 47573c14… 与已提交 mp4 现算一致；下载（payload 完整 2,268,656B）+ 存入资产（assetId i_JqTTSbFcAOrL7VkWlkt）+ 发送画布（node video-1793287028414-m5t13）三条动作回执齐、三路 sha 相同 → 满足 F 口径（结果 + ≥2 动作 + 回执在 HEAD）
- caveat（不影响 F 口径，但阻断 H）：下载动作是 payload 级证据（fileOnDisk=false，iframe 复现环境未落盘）→ 不影响 F 口径（F 只要求动作回执），但阻断 H 的『下载落盘』腿
- caveat（不影响 F 口径，但阻断 H）：freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记 → 阻断 H 的『机器 reload』腿
- caveat（不影响 F 口径，但阻断 H）：resultItem.storageKey 为 legacy-nanoid（tool-result:6x-…，不含 taskId:index）→ 阻断 H 的『taskId 绑定』腿

### 不改判的阻断项（机检证明未放宽）

- **AI_VIDEO_EDITING.H**：R20 复核：字节腿已硬（2,268,656B / sha 47573c14… 三路相同、与已提交 mp4 一致），但 (a) storageKey 为 legacy-nanoid 无 taskId 绑定、(b) freshReload 走 same-origin iframe 无 navType/timeOrigin/Page.reload 机读标记、(c) 下载 payload 未落盘 → 缺两条 rubric 硬腿，维持 PARTIAL
- **IMAGE_TEXT_EDIT.H**：R20 复核（72bd1271）：reload 机读标记（navType=reload / timeOrigin / 同 sid）+ 下载落盘 844,613B sha e7b260… + 结果源字节均已硬；但 asset/canvas 的 assetId / canvasNodeId / 字节仍为 null（localforage 事务读不到）→ 三动作字节腿缺一，维持 PARTIAL
- **VIDEO_CONCAT.F**：R20 复核（e0bcc5d6 + c8c8ce9e）：R25 真实 UI 两个真实素材提交后卡在 submitting（网关无 POST /v1/videos）、无结果字节；c8c8ce9e 只加时间预算使失败可收敛，未产出成功回执 → 维持 PARTIAL
- **VIDEO_TRANSLATION.F**：R20 复核（09d711b2）：/videos 形态只读复核确认 Content-Type/字段名/公网 URL 与已抓真实协议一致，但 4 项 UNVERIFIED 属外部阻塞且无新成功三动作回执 → 维持 PARTIAL
- **REMOVE_PEN.H**：R20 复核（12f1aa8b）：真实 UI 回归脚本已提交，但配置写在 localStorage 而非 IDB app_state → 上游 401，无真实 taskId / 字节 → 维持 PARTIAL

## 4. 剩余非全绿项（全部，逐条）

1. **REMOVE_PEN** `H` = PARTIAL — R20 复核（12f1aa8b）：真实 UI 回归脚本已提交，但配置写在 localStorage 而非 IDB app_state → 上游 401，无真实 taskId / 字节 → 维持 PARTIAL
2. **IMAGE_TEXT_EDIT** `H` = PARTIAL — R20 复核（72bd1271）：reload 机读标记（navType=reload / timeOrigin / 同 sid）+ 下载落盘 844,613B sha e7b260… + 结果源字节均已硬；但 asset/canvas 的 assetId / canvasNodeId / 字节仍为 null（localforage 事务读不到）→ 三动作字节腿缺一，维持 PARTIAL
3. **AI_VIDEO_EDITING** `H` = PARTIAL — R20 复核：字节腿已硬（2,268,656B / sha 47573c14… 三路相同、与已提交 mp4 一致），但 (a) storageKey 为 legacy-nanoid 无 taskId 绑定、(b) freshReload 走 same-origin iframe 无 navType/timeOrigin/Page.reload 机读标记、(c) 下载 payload 未落盘 → 缺两条 rubric 硬腿，维持 PARTIAL
4. **VIDEO_TRANSLATION** `F` = PARTIAL — R20 复核（09d711b2）：/videos 形态只读复核确认 Content-Type/字段名/公网 URL 与已抓真实协议一致，但 4 项 UNVERIFIED 属外部阻塞且无新成功三动作回执 → 维持 PARTIAL
5. **VIDEO_CONCAT** `F` = PARTIAL — R20 复核（e0bcc5d6 + c8c8ce9e）：R25 真实 UI 两个真实素材提交后卡在 submitting（网关无 POST /v1/videos）、无结果字节；c8c8ce9e 只加时间预算使失败可收敛，未产出成功回执 → 维持 PARTIAL

## 5. 新增源码与门禁

- 新源码：`c8c8ce9e` 修改 `web/src/services/api/video.ts`（VIDEO_SUBMIT_TIMEOUT_MS=180s / VIDEO_POLL_TIMEOUT_MS=60s / isRequestTimeoutError）与 `web/src/lib/inline-image.ts`（解码 10s 超时），新增 `video.submit-plan.test.ts` 两条用例
- 门禁（HEAD `dd8192a8` 自跑）：bun run typecheck → tsc --noEmit, exit 0；bun test → 1485 pass / 0 fail / 8352 expects / 84 files；bun run build → vite 7.3.6, exit 0
- 原始日志：`docs/V1.0/reports/verify-head-20261029-r20-logs`（typecheck.log / buntest.log / build.log / gate-head.txt），机检 `gate.webTree == HEAD:web`
- 历史门禁：03b8f47e（tree 52e83c1e） 三闸全绿（1483 pass / 0 fail / 8342 expects / 84 files），c8c8ce9e 落地后不再覆盖 HEAD → 仅作历史证据

## 6. 复验项（R19 已 PASS 的升级断言全部重跑）

- PRODUCT_SCENE.H：22 条断言全通过（回执 `r18-h-reload-actions-20261029/receipt-product-scene.json`）
- HANDHELD_GOODS.H：22 条断言全通过（回执 `r18-h-reload-actions-20261029/receipt-handheld-goods.json`）
- PRINT_EXTRACT.H：19 条断言全通过（回执 `PRINT_EXTRACT/reload-verify-r16.json`）
- VIDEO_REPLICATION.R：6 条断言全通过（回执 `r21-video-external-20261029/receipt.json`）
- VIDEO_REPLICATION.F：21 条断言全通过（回执 `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json`）
- VIDEO_REPLICATION.H：21 条断言全通过（回执 `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json`）
- CHANGE_COLOR_V2.H：50 条断言全通过（回执 `r24-20261029/receipt-ccv2.json`）

## 7. 复现与产物

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r20.py --check
```
- 产物：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r20-matrix/matrix.json`、`matrix.md`、`report.md`、`auditor.py`、`evidence/gate.json`

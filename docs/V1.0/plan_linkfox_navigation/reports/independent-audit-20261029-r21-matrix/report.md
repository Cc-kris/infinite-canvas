# R21 独立审计报告（严格重算，不放宽判据）

- 生成时间：2026-10-29T23:42:46+08:00
- 审计对象：HEAD `b77cbb7dc6e31f1016bd6b7afc35a26d1317da9a`（branch `feat/linkfox-v1-real`）
- 基线：R20 = 43f61e88（matrix：F37/2 T39/0 R39/0 H36/3 K12/27 U39；非全绿 5 单元 / 5 工具）
- 审计器：`tools/recompute_scope_matrix_r21.py`（`--check` 可复现）
- 口径：rubric 与 R19/R20 **逐字相同**（F/T/R/H/K/U 六维），未新增、未放宽、未收紧任何一条

## 1. 统计

| 维度 | PASS | PARTIAL | N/A |
|---|---|---|---|
| F | 37 | 2 | 0 |
| T | 39 | 0 | 0 |
| R | 39 | 0 | 0 |
| H | 36 | 3 | 0 |
| K | 12 | 0 | 27 |
| U | 39 | 0 | 0 |

非全绿：**5** 单元 / **5** 工具；相对 R19 改判 **1** 处；断言 **387** 条 / 失败 **0** 条；反证 **0** 条。

## 2. 本轮吸收的提交（逐条机检）

| 提交 | 内容 | 对本轮判定的影响 |
|---|---|---|
| `2248098e` | verify(c8c8ce9e) 三闸原始日志 + submit/poll 预算行为探针（180s/60s、超时不重试、502 重试 3 次） | 无改判（门禁/行为证据） |
| `f664bc43` | R20 只读复验 72bd1271/dd8192a8：现算三路字节 sha + tool_assets/app_state 扫描 | 无改判（ITE asset=0 命中、canvas 无字节；AVE 仍缺 reload 机读标记与落盘） |
| `ec33cf99` | REMOVE_PEN 真实配置(IDB app_state) 真实 UI 回执：上游 200 / 2,442,902B | 无改判（无 taskId、无终态、无字节、三动作未执行；负证） |
| `b10e4221` | r26b 脚本修复：草稿恢复态上传控件缺失 → 先走真实「重新上传」回空态 | 无改判（验收脚本改动，零 src） |
| `b583adb9` | R27 VIDEO_CONCAT 真实提交实测（2 次 POST 均 400，final unknown） | 无改判（无成功回执；负证） |
| `322dee35` | r26b 任务键前缀更正 tool-task:v1:<uuid>（原 task- 前缀永不匹配） | 无改判（解释了 ec33cf99 轮询空转，非产品缺陷） |
| `bf57c28d` | REMOVE_PEN 真实终态 succeeded + 三路字节对账（1,831,533B，sha 2f8f7f11…） | 无改判（回执自判 PARTIAL：三动作未在同一回执内闭合，canvas 腿 checks.canvasSent=false；缺口收窄至「单回执三动作完整」） |
| `d75bb906` | VIDEO_CONCAT 预算修复后只读回执（提交 200 / task_5EgVjiQ / 上游 pending 26min） | 无改判（无终态、无三动作；证明提交链路可达，仍需上游 completed） |

## 3. 改判与复验明细

**本轮改判：0 处**（相对 R19/R20 累计改判见 §1 摘要）。

### 3.1 复验通过项（历史升级项重跑，非本轮改判）

### AI_VIDEO_EDITING.F → PASS

- 回执：`evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-20261029.json`
- 产物：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`（2,268,656B / sha256 47573c147325…，HEAD 内现算）
- 断言：27 条全部通过
- 依据：task-mvt42rpv-kfl1ov succeeded（upstream task_QFvq6WM…）/ 2,268,656B / sha 47573c14… 与已提交 mp4 现算一致；下载（payload 完整 2,268,656B）+ 存入资产（assetId i_JqTTSbFcAOrL7VkWlkt）+ 发送画布（node video-1793287028414-m5t13）三条动作回执齐、三路 sha 相同 → 满足 F 口径（结果 + ≥2 动作 + 回执在 HEAD）
- caveat（不影响 F 口径，但阻断 H）：下载动作是 payload 级证据（fileOnDisk=false，iframe 复现环境未落盘）→ 不影响 F 口径（F 只要求动作回执），但阻断 H 的『下载落盘』腿
- caveat（不影响 F 口径，但阻断 H）：freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记 → 阻断 H 的『机器 reload』腿
- caveat（不影响 F 口径，但阻断 H）：resultItem.storageKey 为 legacy-nanoid（tool-result:6x-…，不含 taskId:index）→ 阻断 H 的『taskId 绑定』腿

### 不改判的阻断项（机检证明未放宽）

- **AI_VIDEO_EDITING.H**：R21 复核（f664bc43 只读机检）：字节腿硬（2,268,656B / sha 47573c14… 三路相同且与本仓已提交 mp4 一致）；但 (a) resultItem.storageKey 仍为 legacy-nanoid（tool-result:6x-…，无 taskId 绑定）、(b) freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记、(c) 下载仅 payload 级、fileOnDisk=false。最小硬证据缺口：一次同文档真实 Page.reload（带 navType=reload + timeOrigin + 同 tab 的 CDP 机读标记）＋ ~/Downloads 真实落盘文件的字节/sha＋ 带 taskId 前缀的 storageKey 取自 IDB media_files；三者缺一即不得升 H。
- **IMAGE_TEXT_EDIT.H**：R21 复核（f664bc43 现算）：reload 机读标记 + 下载落盘 844,613B（sha e7b260e7…）+ 结果源字节均成立；但 asset_leg 为 MISSING（63 条 tool_assets 中 matchesForTaskOrSha=0，task-mvs8bhu1-hhue24 零命中）、canvas_leg 为 REFERENCED_ONLY_NO_BYTES（app_state 98,533B 里只引用 assetId，节点无字节字段）。最小硬证据缺口：一条真实「存资产」后 tool_assets 中带该 taskId 或该 sha 的记录（含 assetId 与字节 sha），及一条真实「发画布」后 app_state 节点自带 assetId + 字节 sha 的可核字段；须由新真实跑产生，不可注入。
- **VIDEO_CONCAT.F**：R21 复核（b583adb9 R27 + d75bb906 只读追加）：R27 两次真实 POST 均 400（utf-8 解码错 / references exceed limits: images 9, videos 3, audio 3, total 12）；d75bb906 在预算修复后再提交则**成功拿到上游受理**（HTTP 200 · task_5EgVjiQ…），但上游 pending 26min 未终态，final 非 succeeded、items 为空、三动作未验。故 F 仍不成立：提交链路可达 ≠ 产出可用。最小硬证据缺口：该 upstreamTaskId 推进到 completed → 结果字节落 IDB → 下载/存资产/发画布三动作同一回执（含 sha 对账，并需 archiveUrl 可公网取回，R27 已证 upload 侧可受理由此不构成阻塞）。
- **VIDEO_TRANSLATION.F**：R21 复核（无新提交）：/videos 形态只读复核仍只有 09d711b2 的 4 项 UNVERIFIED（Content-Type/字段名/公网 URL 形态一致结论未升级为回执），无新成功三动作。最小硬证据缺口：一次真实上游 2xx 的 /videos 提交回执（taskId + 终态 succeeded + 结果字节 sha），以及该次提交的请求体字段快照；外部协议若仍不可用则须写明阻塞面（域名/鉴权/配额）并给出可复现命令。
- **REMOVE_PEN.H**：R21 复核（bf57c28d 机检 + ec33cf99）：ec33cf99 轮因任务键前缀 bug 轮询空转，322dee35 修正前缀后同一真实任务收敛 succeeded（task-mvtp33dv-57nmbx，storageKey 带 taskId 前缀），归档回执机检通过：fresh reload navType=reload + 刷新后 resultImg 1024×1024 complete；任务结果/下载落盘/入库资产三处字节均 1,831,533B 且 sha 2f8f7f11… 全等（审计侧对归档字节重算，采信回执字段）；画布腿亦有只读探针（节点 metadata.bytes=1,831,533、storageKey=image:…，对应 IDB image_files sha 相同）。但回执自判 verdict=PARTIAL：checks.canvasSent=false（脚本读不到 canvas_store），三动作未在**同一回执**内闭合，rubric 要求「下载/入库/发画布字节须由该工具已提交产物按同尺寸同 sha 复核」未一次性满足 → 不升 H。最小硬证据缺口：一次真实跑内连续完成下载落盘 + 存资产 + 发画布，并在同一机读回执里给出三者字节/sha 与任务结果一致（不得用跨文件拼合替代）。

## 4. 剩余非全绿项（全部，逐条）

1. **REMOVE_PEN** `H` = PARTIAL — R21 复核（bf57c28d 机检 + ec33cf99）：ec33cf99 轮因任务键前缀 bug 轮询空转，322dee35 修正前缀后同一真实任务收敛 succeeded（task-mvtp33dv-57nmbx，storageKey 带 taskId 前缀），归档回执机检通过：fresh reload navType=reload + 刷新后 resultImg 1024×1024 complete；任务结果/下载落盘/入库资产三处字节均 1,831,533B 且 sha 2f8f7f11… 全等（审计侧对归档字节重算，采信回执字段）；画布腿亦有只读探针（节点 metadata.bytes=1,831,533、storageKey=image:…，对应 IDB image_files sha 相同）。但回执自判 verdict=PARTIAL：checks.canvasSent=false（脚本读不到 canvas_store），三动作未在**同一回执**内闭合，rubric 要求「下载/入库/发画布字节须由该工具已提交产物按同尺寸同 sha 复核」未一次性满足 → 不升 H。最小硬证据缺口：一次真实跑内连续完成下载落盘 + 存资产 + 发画布，并在同一机读回执里给出三者字节/sha 与任务结果一致（不得用跨文件拼合替代）。
2. **IMAGE_TEXT_EDIT** `H` = PARTIAL — R21 复核（f664bc43 现算）：reload 机读标记 + 下载落盘 844,613B（sha e7b260e7…）+ 结果源字节均成立；但 asset_leg 为 MISSING（63 条 tool_assets 中 matchesForTaskOrSha=0，task-mvs8bhu1-hhue24 零命中）、canvas_leg 为 REFERENCED_ONLY_NO_BYTES（app_state 98,533B 里只引用 assetId，节点无字节字段）。最小硬证据缺口：一条真实「存资产」后 tool_assets 中带该 taskId 或该 sha 的记录（含 assetId 与字节 sha），及一条真实「发画布」后 app_state 节点自带 assetId + 字节 sha 的可核字段；须由新真实跑产生，不可注入。
3. **AI_VIDEO_EDITING** `H` = PARTIAL — R21 复核（f664bc43 只读机检）：字节腿硬（2,268,656B / sha 47573c14… 三路相同且与本仓已提交 mp4 一致）；但 (a) resultItem.storageKey 仍为 legacy-nanoid（tool-result:6x-…，无 taskId 绑定）、(b) freshReload 走 same-origin iframe，无 navType/timeOrigin/Page.reload 机读标记、(c) 下载仅 payload 级、fileOnDisk=false。最小硬证据缺口：一次同文档真实 Page.reload（带 navType=reload + timeOrigin + 同 tab 的 CDP 机读标记）＋ ~/Downloads 真实落盘文件的字节/sha＋ 带 taskId 前缀的 storageKey 取自 IDB media_files；三者缺一即不得升 H。
4. **VIDEO_TRANSLATION** `F` = PARTIAL — R21 复核（无新提交）：/videos 形态只读复核仍只有 09d711b2 的 4 项 UNVERIFIED（Content-Type/字段名/公网 URL 形态一致结论未升级为回执），无新成功三动作。最小硬证据缺口：一次真实上游 2xx 的 /videos 提交回执（taskId + 终态 succeeded + 结果字节 sha），以及该次提交的请求体字段快照；外部协议若仍不可用则须写明阻塞面（域名/鉴权/配额）并给出可复现命令。
5. **VIDEO_CONCAT** `F` = PARTIAL — R21 复核（b583adb9 R27 + d75bb906 只读追加）：R27 两次真实 POST 均 400（utf-8 解码错 / references exceed limits: images 9, videos 3, audio 3, total 12）；d75bb906 在预算修复后再提交则**成功拿到上游受理**（HTTP 200 · task_5EgVjiQ…），但上游 pending 26min 未终态，final 非 succeeded、items 为空、三动作未验。故 F 仍不成立：提交链路可达 ≠ 产出可用。最小硬证据缺口：该 upstreamTaskId 推进到 completed → 结果字节落 IDB → 下载/存资产/发画布三动作同一回执（含 sha 对账，并需 archiveUrl 可公网取回，R27 已证 upload 侧可受理由此不构成阻塞）。

## 5. 新增源码与门禁

- 新源码：`c8c8ce9e` 修改 `web/src/services/api/video.ts`（VIDEO_SUBMIT_TIMEOUT_MS=180s / VIDEO_POLL_TIMEOUT_MS=60s / isRequestTimeoutError）与 `web/src/lib/inline-image.ts`（解码 10s 超时），新增 `video.submit-plan.test.ts` 两条用例
- 门禁（HEAD `322dee35` 自跑）：bun run typecheck → tsc --noEmit, exit 0；bun test → 1485 pass / 0 fail / 8352 expect() / 84 files；bun run build → vite, exit 0（built in 42.45s，仅 chunk>500kB 提示）
- 原始日志：`docs/V1.0/reports/verify-head-20261029-r21-logs`（typecheck.log / buntest.log / build.log / gate-head.txt），机检 `gate.srcTree == HEAD:web/src` + `gate.webDiff.scripts_only`（门禁后 web 变更全部落在验收脚本，零 src 漂移）
- 历史门禁：03b8f47e（tree 52e83c1e） 三闸全绿（1483 pass / 0 fail / 8342 expects / 84 files），c8c8ce9e 落地后不再覆盖 HEAD → 仅作历史证据

## 6. 复验项（R19 已 PASS 的升级断言 + R20 升级项全部重跑）

- PRODUCT_SCENE.H：22 条断言全通过（回执 `r18-h-reload-actions-20261029/receipt-product-scene.json`）
- HANDHELD_GOODS.H：22 条断言全通过（回执 `r18-h-reload-actions-20261029/receipt-handheld-goods.json`）
- PRINT_EXTRACT.H：19 条断言全通过（回执 `PRINT_EXTRACT/reload-verify-r16.json`）
- VIDEO_REPLICATION.R：6 条断言全通过（回执 `r21-video-external-20261029/receipt.json`）
- VIDEO_REPLICATION.F：21 条断言全通过（回执 `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json`）
- VIDEO_REPLICATION.H：21 条断言全通过（回执 `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json`）
- CHANGE_COLOR_V2.H：50 条断言全通过（回执 `r24-20261029/receipt-ccv2.json`）

## 7. 复现与产物

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r21.py --check
```
- 产物：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r21-matrix/matrix.json`、`matrix.md`、`report.md`、`auditor.py`、`evidence/gate.json`

# R9 严格 39 工具矩阵（独立复核 · 2026-10-29）

- 审计对象：`a8d4767ff728316ce0950d84d4876a8c3692e226`（branch `feat/linkfox-v1-real`）
- 生成时间：2026-10-29T19:16:50+08:00
- 审计器：`docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r9.py`（继承 R8 的 F/T/R/K/U，重写 H）
- 证据池：仅 `git ls-tree HEAD` 中已提交文件；工作区未提交内容一律不计

## 1. 结果总览

| 维度 | PASS | PARTIAL | BLOCKED | N/A |
|---|---|---|---|---|
| F | 28 | 11 | 0 | 0 |
| T | 32 | 7 | 0 | 0 |
| R | 35 | 2 | 2 | 0 |
| H | 13 | 26 | 0 | 0 |
| K | 12 | 0 | 0 | 27 |
| U | 39 | 0 | 0 | 0 |

H（历史恢复：刷新后能否自然回取结果）**13/39 PASS**；相对 R8-fix 共 17 项判定变更（8 项撤下、8 项新增，1 项其它修正）。

## 2. H 判定口径（严格三腿，缺一即 PARTIAL）

1. **fresh reload 标记**：必须是键锚定机器字段，不接受散文 —— `"phase":"reload"`、`"phase":"after-full-reload"`、`"nav":"reload"`、`"navigationType":"reload"`、`location.reload()` 回执、`afterReload` 对象节点。
2. **taskId 绑定**：刷新后的观测窗口内必须命中**同一 taskId**，或它的**结果字节数 / sha 前 16 位**；「历史坞 1 条」这类无主描述不算。
3. **下载字节 + sha 对账**：回执声明的字节数必须对到**已提交**且**工具作用域内**的结果文件，声明 sha 时必须一致。
   - 排除输入素材（`__cases`/`input`/`fixture`/`source`/`reference`），防止把上传图当产物；
   - 排除合成/注入目录（`recovery\d`/`inject`/`seed`/`fake`/`history-recovery`/`snapshot-inject`）；
   - 反向标记（`resultRestored:false`、`payloadDropped:true`、`rowBoundToTargetTask:false`）命中即 PARTIAL；
   - 任务状态 failed / submit-unconfirmed、无成功结果可恢复者判 PARTIAL。

## 3. 13 项 H PASS 的证据链

| # | 工具 | 三腿 | 回执 | 对账产物 |
|---|---|---|---|---|
| 1 | `IMAGE_TRANSLATION` | TRB | `real-acceptance/IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json` | `real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png` |
| 2 | `SCALE_UP` | TRB | `real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/run.json` | `real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png` |
| 3 | `AI_OUTPAINTING` | TRB | `edit8-h-real-20261029/AI_OUTPAINTING.json` | `edit8-h-real-20261029/AI_OUTPAINTING-result-1.png` |
| 4 | `AREA_REPAIR` | TRB | `edit8-h-real-20261029/AREA_REPAIR.json` | `edit8-h-real-20261029/AREA_REPAIR-result-1.png` |
| 5 | `CHANGE_COLOR` | TRB | `real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json` | `real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png` |
| 6 | `IMAGE_CROP` | TRB | `edit8-h-real-20261029/IMAGE_CROP.json` | `edit8-h-real-20261029/IMAGE_CROP-result-1.png` |
| 7 | `PRODUCT_REFINE` | TRB | `edit8-h-real-20261029/PRODUCT_REFINE.json` | `edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png` |
| 8 | `FIX_COLOR` | TRB | `real-acceptance/FIX_COLOR/result.json` | `real-acceptance/FIX_COLOR/result-real-20261029.png` |
| 9 | `PRINTING_REPAIR` | TRB | `edit8-h-real-20261029/PRINTING_REPAIR.json` | `edit8-h-real-20261029/PRINTING_REPAIR-result-1.png` |
| 10 | `HAND_REPAIR` | TRB | `edit8-h-real-20261029/HAND_REPAIR.json` | `edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png` |
| 11 | `AI_POSTURE` | TRB | `r8h-4tools-20261029/AI_POSTURE.json` | `r8h-4tools-20261029/AI_POSTURE.png` |
| 12 | `AI_DRESSING_XSY` | TRB | `real-acceptance/AI_DRESSING_XSY_20261029_persist/reload-summary.json` | `real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png` |
| 13 | `MATERIAL_UPPER_BODY` | TRB | `r8h-4tools-20261029/MATERIAL_UPPER_BODY.json` | `r8h-4tools-20261029/MATERIAL_UPPER_BODY.png` |

- **IMAGE_TRANSLATION** — 真实 task task-mvt9elbs-u4grlv + "phase": "after-full-reload" + 字节 sha 对账 1028256B == real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png
- **SCALE_UP** — 真实 task task-mvta6bty-0rkwm9 + "afterReload": { + 字节 sha 对账 871973B == real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png
- **AI_OUTPAINTING** — 真实 task task-mvtbhylv-bmyjus + "phase": "reload" + 字节 sha 对账 1329760B == edit8-h-real-20261029/AI_OUTPAINTING-result-1.png
- **AREA_REPAIR** — 真实 task task-mvtfevy8-rrr2ye + "phase": "reload" + 字节 sha 对账 2065981B == edit8-h-real-20261029/AREA_REPAIR-result-1.png
- **CHANGE_COLOR** — 真实 task task-mvtafqev-u2yjkh + "afterReload": { + 字节 sha 对账 919689B == real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png
- **IMAGE_CROP** — 真实 task task-mvtbmukl-quasjm + "phase": "reload" + 字节 sha 对账 205951B == edit8-h-real-20261029/IMAGE_CROP-result-1.png
- **PRODUCT_REFINE** — 真实 task task-mvtb3nuj-3d0mnv + "phase": "reload" + 字节 sha 对账 2827346B == edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png
- **FIX_COLOR** — 真实 task task-mvta1kkg-t8y1yo + "historyRecovery": { + 字节 sha 对账 1218527B == real-acceptance/FIX_COLOR/result-real-20261029.png
- **PRINTING_REPAIR** — 真实 task task-mvtbawv4-zxcmpv + "phase": "reload" + 字节 sha 对账 1183770B == edit8-h-real-20261029/PRINTING_REPAIR-result-1.png
- **HAND_REPAIR** — 真实 task task-mvtbe5rp-0maafh + "phase": "reload" + 字节 sha 对账 2153466B == edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png
- **AI_POSTURE** — 真实 task task-mvtczxwo-e1d1w0 + "phase": "reload" + 字节 sha 对账 1557308B == r8h-4tools-20261029/AI_POSTURE.png
- **AI_DRESSING_XSY** — 真实 task task-mvtbf7ue-n28x46 + "phase": "reload" + 字节 sha 对账 1576288B == real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png
- **MATERIAL_UPPER_BODY** — 真实 task task-mvtd45nv-y7cum6 + "phase": "reload" + 字节 sha 对账 1525374B == r8h-4tools-20261029/MATERIAL_UPPER_BODY.png

## 4. 26 项 H PARTIAL 的剩余真实缺口

| 工具 | 已具备 | 缺口 | 证据路径 |
|---|---|---|---|
| `PRODUCT_IMAGE_SUITE` | task+reload | task task-mvt6vpdo-sc1x8w + reload 回执（history-restore-20261029/summary.json），但声明 2840825B，已提交产物中无同尺寸同 sha 的该工具产物（字节不可复核） | `history-restore-20261029/summary.json`, `real-acceptance/H-history-freshload-20261029.json` |
| `DRESS_WEAR_SET` | task+reload | task task-mvt74l6q-1vljau + reload 回执（history-restore-20261029/summary.json），但声明 2516552B，已提交产物中无同尺寸同 sha 的该工具产物（字节不可复核） | `history-restore-20261029/summary.json`, `real-acceptance/DRESS_WEAR_SET/result.json` |
| `CHANGE_COLOR_V2` | task | 有真实 task task-mvsb41o4-obzwag（real-acceptance/CHANGE_COLOR_V2/01-task-history.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） | `edit8-h-real-20261029/CHANGE_COLOR_V2.json`, `real-acceptance/CHANGE_COLOR_V2/01-task-history.json` |
| `REMOVE_PEN` | task+bytes | task task-mvs9xe7s-9jmboc 记录为 failed/submit-unconfirmed（edit8-h-real-20261029/REMOVE_PEN.json），无成功结果可恢复 | `edit8-h-real-20261029/REMOVE_PEN.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json` |
| `NEW_REPLACE_BG_V2` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-new-replace-bg-v2.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-new-replace-bg-v2.json` |
| `REPLACE_GOODS` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-replace-goods.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-replace-goods.json` |
| `PRODUCT_SCENE` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-product-scene.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-product-scene.json`, `history-restore-20261029/summary.json` |
| `HANDHELD_GOODS` | task+reload | task task-mvs5p8g8-or3oim 记录为 failed/submit-unconfirmed（real-acceptance/h4-design-a-20261029/HANDHELD_GOODS.json），无成功结果可恢复 | `real-acceptance/h4-design-a-20261029/HANDHELD_GOODS.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json` |
| `AI_DRESSING_V2` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-ai-dressing-v2.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-ai-dressing-v2.json` |
| `AI_WEARABLE` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-ai-wearable.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-ai-wearable.json` |
| `AI_TEXT` | task+bytes | task task-mvsdhatp-kdyvt6 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/AI_TEXT/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） | `real-acceptance/B2G1/AI_TEXT/run-b2g1.json`, `real-acceptance/B2G1/AI_TEXT/task-snapshot.json` |
| `ORNAMENT_TEXT` | task+bytes | task task-mvsdivlg-6slebs 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/ORNAMENT_TEXT/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） | `real-acceptance/B2G1/ORNAMENT_TEXT/run-b2g1.json`, `real-acceptance/B2G1/ORNAMENT_TEXT/task-snapshot.json` |
| `SDS_DESIGN` | task+bytes | task task-mvsdlqxd-ttx3pl 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/SDS_DESIGN/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） | `real-acceptance/B2G1/SDS_DESIGN/run-b2g1.json`, `real-acceptance/B2G1/SDS_DESIGN/task-snapshot.json` |
| `PRINT_EXTRACT` | task | 有真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） | `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`, `r7-d19-history-20261029/tool-print-extract.json` |
| `AI_POSE_GENERATOR` | task+bytes | 有真实 task task-mvtd89f3-9qpix6（suite-design-realgen-20261029/RESULTS.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） | `suite-design-realgen-20261029/RESULTS.json`, `independent-verification-20261029/VERIFY_DATA.json` |
| `FISSION_LINK` | task+bytes | 有真实 task task-mvt18lrt-rsnifn（real-acceptance/H2-fission-xsy-20261029/evidence.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） | `real-acceptance/H2-fission-xsy-20261029/evidence.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json` |
| `IMAGE_TEXT_EDIT` | task | task task-mvs802af-u9vwye 记录为 failed/submit-unconfirmed（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），无成功结果可恢复 | `r7-d19-history-20261029/tool-image-text-edit.json`, `real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT.json` |
| `NEW_DESIGNER` | task+bytes | 有真实 task task-mvtdl9v8-165q1n（suite-design-realgen-20261029/RESULTS.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） | `suite-design-realgen-20261029/RESULTS.json`, `independent-verification-20261029/VERIFY_DATA.json` |
| `PRODUCT_MARKET_MATERIAL` | task | 真实 task 仅出现在 r7-d19-history-20261029/tool-product-market-material.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-product-market-material.json`, `history-restore-20261029/summary.json` |
| `SCENE_TRANSFER` | task+bytes | task task-mvt8c2a6-nsv4pt 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） | `real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json`, `real-acceptance/B2G1/SCENE_TRANSFER/task-snapshot.json` |
| `IMAGE_TO_VIDEO` | task+reload | task task-mvt71akq-bu2hxh 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json`, `real-acceptance/IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json` |
| `SALE_VIDEO` | task+reload | task task-mvt76u6p-7cfnff + reload 回执（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json），但回执未声明结果字节（无 artifact 节点 bytes/sha） | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`, `real-acceptance/SALE_VIDEO_20261029/task-mvt76u6p-7cfnff.raw.json` |
| `VIDEO_REPLICATION` | task+reload | task task-mvs9mpoz-e8u2ry 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json` |
| `AI_VIDEO_EDITING` | task+bytes | 有真实 task task-mvt42rpv-kfl1ov（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json` |
| `VIDEO_TRANSLATION` | 无 | 无该工具绑定的真实 task（taskId+toolId 同现） |  |
| `VIDEO_CONCAT` | task | task task-mvs802af-u9vwye 记录为 failed/submit-unconfirmed（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），无成功结果可恢复 | `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`, `real-acceptance/VIDEO_CONCAT/README-20261029-continuation.md` |

## 5. 与 R8-fix 的差异

| 工具 | R8-fix | R9 | 依据 |
|---|---|---|---|
| `PRODUCT_IMAGE_SUITE` | PASS | PARTIAL | task task-mvt6vpdo-sc1x8w + reload 回执（history-restore-20261029/summary.json），但声明 2840825B，已提交产物中无同尺寸同 sha 的该工具产物（字节不可复核） |
| `DRESS_WEAR_SET` | PASS | PARTIAL | task task-mvt74l6q-1vljau + reload 回执（history-restore-20261029/summary.json），但声明 2516552B，已提交产物中无同尺寸同 sha 的该工具产物（字节不可复核） |
| `AI_OUTPAINTING` | PARTIAL | PASS | 真实 task task-mvtbhylv-bmyjus + "phase": "reload" + 字节 sha 对账 1329760B == edit8-h-real-20261029/AI_OUTPAINTING-result-1.png |
| `AREA_REPAIR` | PARTIAL | PASS | 真实 task task-mvtfevy8-rrr2ye + "phase": "reload" + 字节 sha 对账 2065981B == edit8-h-real-20261029/AREA_REPAIR-result-1.png |
| `IMAGE_CROP` | PARTIAL | PASS | 真实 task task-mvtbmukl-quasjm + "phase": "reload" + 字节 sha 对账 205951B == edit8-h-real-20261029/IMAGE_CROP-result-1.png |
| `PRODUCT_REFINE` | PARTIAL | PASS | 真实 task task-mvtb3nuj-3d0mnv + "phase": "reload" + 字节 sha 对账 2827346B == edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png |
| `PRINTING_REPAIR` | PARTIAL | PASS | 真实 task task-mvtbawv4-zxcmpv + "phase": "reload" + 字节 sha 对账 1183770B == edit8-h-real-20261029/PRINTING_REPAIR-result-1.png |
| `HAND_REPAIR` | PARTIAL | PASS | 真实 task task-mvtbe5rp-0maafh + "phase": "reload" + 字节 sha 对账 2153466B == edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png |
| `AI_POSTURE` | PARTIAL | PASS | 真实 task task-mvtczxwo-e1d1w0 + "phase": "reload" + 字节 sha 对账 1557308B == r8h-4tools-20261029/AI_POSTURE.png |
| `AI_TEXT` | PASS | PARTIAL | task task-mvsdhatp-kdyvt6 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/AI_TEXT/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） |
| `ORNAMENT_TEXT` | PASS | PARTIAL | task task-mvsdivlg-6slebs 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/ORNAMENT_TEXT/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） |
| `SDS_DESIGN` | PASS | PARTIAL | task task-mvsdlqxd-ttx3pl 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/SDS_DESIGN/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） |
| `FISSION_LINK` | PASS | PARTIAL | 有真实 task task-mvt18lrt-rsnifn（real-acceptance/H2-fission-xsy-20261029/evidence.json），但无机器 fresh reload 标记（无 phase/nav=reload、无 reload 对象节点、无 location.reload() 回执） |
| `MATERIAL_UPPER_BODY` | PARTIAL | PASS | 真实 task task-mvtd45nv-y7cum6 + "phase": "reload" + 字节 sha 对账 1525374B == r8h-4tools-20261029/MATERIAL_UPPER_BODY.png |
| `SCENE_TRANSFER` | PASS | PARTIAL | task task-mvt8c2a6-nsv4pt 有 reload 声明（"afterReload": {），但 real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json 无刷新后观测（无 *AfterReload 步骤/历史坞行/rows/persistedAfterReload） |
| `SALE_VIDEO` | PASS | PARTIAL | task task-mvt76u6p-7cfnff + reload 回执（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json），但回执未声明结果字节（无 artifact 节点 bytes/sha） |
| `VIDEO_CONCAT` | PASS | PARTIAL | task task-mvs802af-u9vwye 记录为 failed/submit-unconfirmed（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），无成功结果可恢复 |

> 撤下（PASS→PARTIAL）：PIS、DRESS_WEAR_SET、AI_TEXT、ORNAMENT_TEXT、SDS_DESIGN、SCENE_TRANSFER、SALE_VIDEO、VIDEO_CONCAT、FISSION_LINK 等 —— 原因是只有散文式 reload 描述、观测未绑定 taskId、或字节无从对账。
> 新增（PARTIAL→PASS）：edit8 的 AI_OUTPAINTING / AREA_REPAIR / IMAGE_CROP / PRODUCT_REFINE / PRINTING_REPAIR / HAND_REPAIR，r8h-4tools 的 AI_POSTURE / MATERIAL_UPPER_BODY，以及 AI_DRESSING_XSY。

## 6. 未解决 / 风险

- **PIS、DRESS_WEAR_SET**：回执有浏览器内 `sha256_16`，但仓库无同尺寸产物，外部无法复算 → PARTIAL。补一张已提交的 result PNG 即可转 PASS。
- **B2G1 四工具**（AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN / SCENE_TRANSFER）：`run-b2g1.json` 有 `afterReload` 声明但无刷新后观测内容，需补「刷新 → 读历史坞 → 点回结果」采集。
- **VIDEO_CONCAT**：唯一相关 task 为 failed，需先有成功任务再做历史恢复。
- **SALE_VIDEO**：dock-after-reload 未声明结果字节，缺 sha 对账。
- K 维度 27 项 N/A 属证据包未覆盖模型/渠道回执，非失败。

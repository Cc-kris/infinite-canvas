# R11 严格矩阵（39 工具 · H 三腿）

- 审计 HEAD：`6636e1f`（feat/linkfox-v1-real）
- 生成时间：2026-10-29T20:15:02+08:00
- 取代：`reports/independent-audit-20261029-r10/`（`e0608bd`）
- 吸收提交：`bcafd94`, `c4af102`, `e8da2c7`, `0850ae2`, `6986988`, `6f7ee1c`, `d107ab0`
- 依据：在 R10 严格三腿口径上吸收 bcafd94、c4af102、e8da2c7、0850ae2、6986988、6f7ee1c、d107ab0 的已提交证据（REPLACE_GOODS 真实生成+reload+三动作+字节 sha；NEW_REPLACE_BG_V2 早期 502 后 d107ab0 复测成功；NEW_DESIGNER 专项三腿；IMAGE_TEXT_EDIT 自然恢复但 payloadDropped）；补 dockAfterReload.items 观测映射与上游 BLOCKED 归因；未生成任何新证据、未改业务源码

## 统计

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 11 / PASS 28 |
| T | PARTIAL 7 / PASS 32 |
| R | BLOCKED 2 / PARTIAL 2 / PASS 35 |
| H | PARTIAL 13 / PASS 26 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 逐工具

| 工具 | F | T | R | H | K | U | task | reload | 字节sha | 依据 / 剩余缺口 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE | PARTIAL | PARTIAL | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt6vpdo-sc1x8w + call: location.assign( + 字节 sha 对账 2840825B == real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png | `history-restore-20261029/summary.json`<br>`real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png` |
| DRESS_WEAR_SET | PARTIAL | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt74l6q-1vljau + call: location.assign( + 字节 sha 对账 1883817B == real-acceptance/DRESS_WEAR_SET/r10/result.png | `history-restore-20261029/summary.json`<br>`real-acceptance/DRESS_WEAR_SET/r10/result.png` |
| CHANGE_COLOR_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | ✅ | ❌ | ✅ | CHANGE_COLOR_V2 有成功真实任务，但回执 edit8-h-real-20261029/CHANGE_COLOR_V2.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/CHANGE_COLOR_V2/result.json`<br>`edit8-h-real-20261029/CHANGE_COLOR_V2.json` |
| IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt9elbs-u4grlv + "phase": "after-full-reload" + 字节 sha 对账 1028256B == real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png | `real-acceptance/IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json`<br>`real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png` |
| SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvta6bty-0rkwm9 + "afterReload": { + 字节 sha 对账 871973B == real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png | `real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/run.json`<br>`real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png` |
| AI_OUTPAINTING | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtbhylv-bmyjus + "phase": "reload" + 字节 sha 对账 1329760B == edit8-h-real-20261029/AI_OUTPAINTING-result-1.png | `edit8-h-real-20261029/AI_OUTPAINTING.json`<br>`edit8-h-real-20261029/AI_OUTPAINTING-result-1.png` |
| AREA_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtfevy8-rrr2ye + "phase": "reload" + 字节 sha 对账 2065981B == edit8-h-real-20261029/AREA_REPAIR-result-1.png | `edit8-h-real-20261029/AREA_REPAIR.json`<br>`edit8-h-real-20261029/AREA_REPAIR-result-1.png` |
| REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ✅ | REMOVE_PEN 有成功真实任务，但回执 edit8-h-real-20261029/REMOVE_PEN.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `edit8-h-real-20261029/REMOVE_PEN.json`<br>`real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json` |
| CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtafqev-u2yjkh + "afterReload": { + 字节 sha 对账 919689B == real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png | `real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json`<br>`real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png` |
| IMAGE_CROP | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtbmukl-quasjm + "phase": "reload" + 字节 sha 对账 205951B == edit8-h-real-20261029/IMAGE_CROP-result-1.png | `edit8-h-real-20261029/IMAGE_CROP.json`<br>`edit8-h-real-20261029/IMAGE_CROP-result-1.png` |
| PRODUCT_REFINE | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtb3nuj-3d0mnv + "phase": "reload" + 字节 sha 对账 2827346B == edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png | `edit8-h-real-20261029/PRODUCT_REFINE.json`<br>`edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png` |
| FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvta1kkg-t8y1yo + "historyRecovery": { + 字节 sha 对账 1218527B == real-acceptance/FIX_COLOR/result-real-20261029.png | `real-acceptance/FIX_COLOR/result.json`<br>`real-acceptance/FIX_COLOR/result-real-20261029.png` |
| PRINTING_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtbawv4-zxcmpv + "phase": "reload" + 字节 sha 对账 1183770B == edit8-h-real-20261029/PRINTING_REPAIR-result-1.png | `edit8-h-real-20261029/PRINTING_REPAIR.json`<br>`edit8-h-real-20261029/PRINTING_REPAIR-result-1.png` |
| HAND_REPAIR | PARTIAL | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtbe5rp-0maafh + "phase": "reload" + 字节 sha 对账 2153466B == edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png | `edit8-h-real-20261029/HAND_REPAIR.json`<br>`edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png` |
| NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvthl08d-06efgs + "persistedAfterReload": { + 字节 sha 对账 837987B == real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-result.png | `real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2.json`<br>`real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-result.png` |
| REPLACE_GOODS | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtgiiu1-hrp6z3 + "persistedAfterReload": { + 字节 sha 对账 1192722B == real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-result.png | `real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS.json`<br>`real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-result.png` |
| PRODUCT_SCENE | PASS | PASS | PASS | PARTIAL | PASS | PASS | ✅ | ❌ | ❌ | 真实 task 仅出现在 r7-d19-history-20261029/tool-product-scene.json 的自由文本/其它工具清单里（task-mvs5dd71-4s35w2），无 taskId/data-task-id 绑定字段 | `r7-d19-history-20261029/tool-product-scene.json`<br>`history-restore-20261029/summary.json` |
| HANDHELD_GOODS | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ✅ | ❌ | HANDHELD_GOODS 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/h4-design-a-20261029/HANDHELD_GOODS.json`<br>`r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json` |
| AI_DRESSING_V2 | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtgeodr-5vx7tw + "fresh_reload": { + 字节 sha 对账 2115031B == real-acceptance/AI_DRESSING_V2/result1_live_20261029.png | `real-acceptance/AI_DRESSING_V2/live-ui-run-20261029.json`<br>`real-acceptance/AI_DRESSING_V2/result1_live_20261029.png` |
| AI_POSTURE | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtczxwo-e1d1w0 + "phase": "reload" + 字节 sha 对账 1557308B == r8h-4tools-20261029/AI_POSTURE.png | `r8h-4tools-20261029/AI_POSTURE.json`<br>`r8h-4tools-20261029/AI_POSTURE.png` |
| AI_WEARABLE | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtglxwi-ys0y85 + "fresh_reload": { + 字节 sha 对账 1247574B == real-acceptance/AI_WEARABLE/result1_live_20261029.png | `real-acceptance/AI_WEARABLE/live-ui-run-20261029.json`<br>`real-acceptance/AI_WEARABLE/result1_live_20261029.png` |
| AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvthk2pn-kdz7i6 + "navType": "reload" + 字节 sha 对账 1445425B == real-acceptance/AI_TEXT/r10-real-20261029/03-result.png | `real-acceptance/AI_TEXT/r10-real-20261029/receipt.json`<br>`real-acceptance/AI_TEXT/r10-real-20261029/03-result.png` |
| ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvsdivlg-6slebs + "afterReload": { + 字节 sha 对账 2439783B == real-acceptance/B2G1/ORNAMENT_TEXT/downloaded-ornament-text-result-1.png | `real-acceptance/B2G1/ORNAMENT_TEXT/run-b2g1.json`<br>`real-acceptance/B2G1/ORNAMENT_TEXT/downloaded-ornament-text-result-1.png` |
| SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvsdlqxd-ttx3pl + "afterReload": { + 字节 sha 对账 2081539B == real-acceptance/B2G1/SDS_DESIGN/downloaded-sds-design-result-1.png | `real-acceptance/B2G1/SDS_DESIGN/run-b2g1.json`<br>`real-acceptance/B2G1/SDS_DESIGN/downloaded-sds-design-result-1.png` |
| PRINT_EXTRACT | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ❌ | PRINT_EXTRACT 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`<br>`r7-d19-history-20261029/tool-print-extract.json` |
| AI_POSE_GENERATOR | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtd89f3-9qpix6 + "navType": "reload" + 字节 sha 对账 1151209B == suite-design-realgen-20261029/ai-pose-generator-result-1.png | `real-acceptance/H4-real-20261029/AI_POSE_GENERATOR.json`<br>`suite-design-realgen-20261029/ai-pose-generator-result-1.png` |
| AI_DRESSING_XSY | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtbf7ue-n28x46 + "phase": "reload" + 字节 sha 对账 1576288B == real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png | `real-acceptance/AI_DRESSING_XSY_20261029_persist/reload-summary.json`<br>`real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png` |
| FISSION_LINK | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ✅ | FISSION_LINK 有成功真实任务，但回执 real-acceptance/PRODUCT_IMAGE_SUITE/r10/reload-restore.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/FISSION_LINK/r10/artifact.json`<br>`real-acceptance/H2-fission-xsy-20261029/evidence.json` |
| IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ✅ | ❌ | IMAGE_TEXT_EDIT 有成功真实任务，但回执 real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json 记 BLOCKED(payload)：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json`<br>`real-acceptance/IMAGE_TEXT_EDIT/result.json` |
| MATERIAL_UPPER_BODY | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtd45nv-y7cum6 + "phase": "reload" + 字节 sha 对账 1525374B == r8h-4tools-20261029/MATERIAL_UPPER_BODY.png | `r8h-4tools-20261029/MATERIAL_UPPER_BODY.json`<br>`r8h-4tools-20261029/MATERIAL_UPPER_BODY.png` |
| NEW_DESIGNER | PARTIAL | PASS | PARTIAL | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtdl9v8-165q1n + "navType": "reload" + 字节 sha 对账 411801B == suite-design-realgen-20261029/new-designer-result-1.png | `real-acceptance/H4-real-20261029/NEW_DESIGNER.json`<br>`suite-design-realgen-20261029/new-designer-result-1.png` |
| PRODUCT_MARKET_MATERIAL | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ❌ | PRODUCT_MARKET_MATERIAL 常驻 profile 历史坞 0 条、rows=[]、storedTasks=[]（r7-d19-history-20261029/tool-product-market-material.json，countForTool=0）：无该工具任务快照，reload 后无可恢复结果 | `r7-d19-history-20261029/tool-product-market-material.json`<br>`history-restore-20261029/summary.json` |
| SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt8c2a6-nsv4pt + "afterReload": { + 字节 sha 对账 839268B == real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png | `real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json`<br>`real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png` |
| IMAGE_TO_VIDEO | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | ✅ | ✅ | ❌ | task task-mvt71akq-bu2hxh 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json`<br>`real-acceptance/IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json` |
| SALE_VIDEO | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt76u6p-7cfnff + "nav": "reload" + 字节 sha 对账 1366190B == real-acceptance/SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`<br>`real-acceptance/SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4` |
| VIDEO_REPLICATION | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PASS | ✅ | ✅ | ❌ | task task-mvs9mpoz-e8u2ry 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json`<br>`real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json` |
| AI_VIDEO_EDITING | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ✅ | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/AI_VIDEO_EDITING/receipt-20261029/receipt.json`<br>`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json` |
| VIDEO_TRANSLATION | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | ❌ | ❌ | ❌ | 无该工具绑定的真实 task（taskId+toolId 同现） |  |
| VIDEO_CONCAT | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | ✅ | ❌ | ❌ | task task-mvs802af-u9vwye 记录为 failed/submit-unconfirmed（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），无成功结果可恢复 | `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`<br>`real-acceptance/R9-history-backfill-20261029/probe.json` |

## 相对 R10（e0608bd）的改判

- **PRODUCT_IMAGE_SUITE** `PARTIAL` → `PASS`（6986988）：真实 task task-mvt6vpdo-sc1x8w + call: location.assign( + 字节 sha 对账 2840825B == real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png
- **DRESS_WEAR_SET** `PARTIAL` → `PASS`（6f7ee1c）：真实 task task-mvt74l6q-1vljau + call: location.assign( + 字节 sha 对账 1883817B == real-acceptance/DRESS_WEAR_SET/r10/result.png
- **NEW_REPLACE_BG_V2** `PARTIAL` → `PASS`（d107ab0）：真实 task task-mvthl08d-06efgs + "persistedAfterReload": { + 字节 sha 对账 837987B == real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-result.png
- **REPLACE_GOODS** `PARTIAL` → `PASS`（bcafd94）：真实 task task-mvtgiiu1-hrp6z3 + "persistedAfterReload": { + 字节 sha 对账 1192722B == real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-result.png

## H 硬断言（机器复算，回执字段 + 磁盘字节/sha）

| 工具 | 断言 | 结果 | 明细 |
| --- | --- | --- | --- |
| REPLACE_GOODS | receipt_in_head | ✅ | evidence/real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS.json |
| REPLACE_GOODS | task_binding | ✅ | task-mvtgiiu1-hrp6z3 |
| REPLACE_GOODS | task_succeeded | ✅ | succeeded |
| REPLACE_GOODS | no_payload_drop | ✅ | items=1 dropped=0 |
| REPLACE_GOODS | fresh_reload_navtype | ✅ | reload |
| REPLACE_GOODS | dock_after_reload_same_task | ✅ | dockItems=1 |
| REPLACE_GOODS | persisted_after_reload | ✅ | True |
| REPLACE_GOODS | action_download | ✅ | None |
| REPLACE_GOODS | action_saveAsset | ✅ | 已保存到资产库（ARMdRqO73OqxRXae4TGBb） |
| REPLACE_GOODS | action_sendCanvas | ✅ | 已发送到画布（DLPBAtx83xm_EQu-rcKeW） |
| REPLACE_GOODS | declared_bytes | ✅ | 1192722 |
| REPLACE_GOODS | artifact_size_equal | ✅ | 1192722 vs 1192722 |
| REPLACE_GOODS | artifact_sha_equal | ✅ | 0ac369c50a99a7f0 vs 0ac369c50a99a7f0 |
| REPLACE_GOODS | download_sha_equal | ✅ | 0ac369c50a99a7f0 |
| NEW_DESIGNER | receipt_in_head | ✅ | evidence/real-acceptance/H4-real-20261029/NEW_DESIGNER-three-legs-20261029.json |
| NEW_DESIGNER | task_binding | ✅ | task-mvtdl9v8-165q1n |
| NEW_DESIGNER | task_succeeded | ✅ | succeeded |
| NEW_DESIGNER | no_payload_drop | ✅ | items=0 dropped=0 |
| NEW_DESIGNER | fresh_reload_navtype | ✅ | reload |
| NEW_DESIGNER | dock_after_reload_same_task | ✅ | n/a: 该回执无 dockAfterReload（以 navType=reload + task 命中证明） |
| NEW_DESIGNER | action_download | ✅ | 已下载 new-designer-res… |
| NEW_DESIGNER | declared_bytes | ✅ | 411801 |
| IMAGE_TEXT_EDIT | receipt_in_head | ✅ | evidence/real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json |
| IMAGE_TEXT_EDIT | payload_dropped_recorded | ✅ | items=1 dropped=1 |
| IMAGE_TEXT_EDIT | no_storage_key | ✅ | [None] |
| IMAGE_TEXT_EDIT | task_binding | ✅ | task-mvs8bhu1-hhue24 |
| IMAGE_TEXT_EDIT | no_bytes_claim | ✅ | None |
| NEW_REPLACE_BG_V2 | receipt_in_head | ✅ | evidence/real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2.json |
| NEW_REPLACE_BG_V2 | task_binding | ✅ | task-mvthl08d-06efgs |
| NEW_REPLACE_BG_V2 | task_succeeded | ✅ | succeeded |
| NEW_REPLACE_BG_V2 | no_payload_drop | ✅ | items=1 dropped=0 |
| NEW_REPLACE_BG_V2 | fresh_reload_navtype | ✅ | reload |
| NEW_REPLACE_BG_V2 | dock_after_reload_same_task | ✅ | dockItems=1 |
| NEW_REPLACE_BG_V2 | persisted_after_reload | ✅ | True |
| NEW_REPLACE_BG_V2 | action_download | ✅ | None |
| NEW_REPLACE_BG_V2 | action_saveAsset | ✅ | 已保存到资产库（2HGusbdJGgddFxgTAcZml） |
| NEW_REPLACE_BG_V2 | action_sendCanvas | ✅ | 已发送到画布（OUZvYDSInQ8Zfhl_Ay1EO） |
| NEW_REPLACE_BG_V2 | declared_bytes | ✅ | 837987 |
| NEW_REPLACE_BG_V2 | artifact_size_equal | ✅ | 837987 vs 837987 |
| NEW_REPLACE_BG_V2 | artifact_sha_equal | ✅ | e3646058d0463b4b vs e3646058d0463b4b |
| NEW_REPLACE_BG_V2 | download_sha_equal | ✅ | e3646058d0463b4b |

## R11 观察

- **REPLACE_GOODS**：PASS 由 bcafd94 的真实回执支撑：task-mvtgiiu1-hrp6z3 succeeded、payloadDropped=false、1,192,722B、sha256 0ac369c5…；仓库内 REPLACE_GOODS-result.png 与 REPLACE_GOODS-download-1793273153608.png 字节与 sha 逐位相同；harness（h4-realgen-design.mjs）执行真实 page.reload()，reload 后 dockAfterReload.items 命中同一 taskId 且 persistedAfterReload=true；三动作（下载/存资产/发画布）均有 ok 回执。
- **NEW_DESIGNER**：H 仍 PASS（R10 起），本次新增 c4af102 专项三腿回执作补充证据：同一 task 、411801B/sha 90e28e0f…与已提交产物一致，下载 ok、导出即入库；发送画布本次 Failed to fetch（canvasChanged=false），F 仍为 PASS（>=2 动作），但属可复现风险，已在报告风险节列出。
- **IMAGE_TEXT_EDIT**：e8da2c7 修复后自然恢复成立（navType=reload + 快照头回填 + 结果卡），task 与 reload 两腿成立；但该真实任务 payloadDropped=true、无 storageKey/url/bytes，三动作如实禁用 → 字节腿不成立，H 保持 PARTIAL（不伪 PASS）。
- **NEW_REPLACE_BG_V2**：bcafd94 早期两次真实提交均在上游 /v1/images/edits 得到 502、未创建任务记录（历史 BLOCKED 归因保留）；d107ab0 复测真实成功 task-mvthl08d-06efgs（edits 200、837987B、整页 reload 后同一 task 在 dock）+ 字节 sha 对账 → H=PASS。

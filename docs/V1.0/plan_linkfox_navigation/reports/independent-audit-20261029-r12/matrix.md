# R12 严格矩阵（39 工具 · H 三腿）

- 审计 HEAD：`32ebf95`（feat/linkfox-v1-real）
- 生成时间：2026-10-29T20:45:47+08:00
- 基线：`3c9d81a (R11) + 9fae2d6 (R11 crosscheck)`
- 吸收提交：`0e8f9f1`, `61e86fc`, `6cb0afc`, `7ff08bf`, `7664498`, `5c25200`, `097f097`, `4f7d4af`, `ff621c3`
- 依据：以 R11 严格三腿口径（含 crosscheck 的 5 处映射/归属修正）为基线，在同一审计器上只吸收既有提交证据：0e8f9f1、61e86fc、6cb0afc、7ff08bf、7664498、5c25200、097f097、4f7d4af、ff621c3；不放宽任何 PASS 门槛，不把 pending/running/下载未命中 视为 PASS

## 统计

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 9 / PASS 30 |
| T | PARTIAL 7 / PASS 32 |
| R | PARTIAL 2 / PASS 37 |
| H | PARTIAL 10 / PASS 29 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 逐工具

| 工具 | F | T | R | H | K | U | task | reload | 字节sha | 依据 / 剩余缺口 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE | PASS | PARTIAL | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt6vpdo-sc1x8w + call: location.assign( + 字节 sha 对账 2840825B == real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png | `history-restore-20261029/summary.json`<br>`real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png` |
| DRESS_WEAR_SET | PASS | PASS | PASS | PASS | PASS | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt74l6q-1vljau + call: location.assign( + 字节 sha 对账 1883817B == real-acceptance/DRESS_WEAR_SET/r10/result.png | `history-restore-20261029/summary.json`<br>`real-acceptance/DRESS_WEAR_SET/r10/result.png` |
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
| FISSION_LINK | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt18lrt-rsnifn + "navType": "reload" + 字节 sha 对账 1988694B == real-acceptance/FISSION_LINK/r10/result.png | `real-acceptance/FISSION_LINK/r11/round-trip.json`<br>`real-acceptance/FISSION_LINK/r10/result.png` |
| IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS | ✅ | ✅ | ❌ | IMAGE_TEXT_EDIT 有成功真实任务，但回执 real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json 记 BLOCKED(payload)：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json`<br>`real-acceptance/IMAGE_TEXT_EDIT/result.json` |
| MATERIAL_UPPER_BODY | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtd45nv-y7cum6 + "phase": "reload" + 字节 sha 对账 1525374B == r8h-4tools-20261029/MATERIAL_UPPER_BODY.png | `r8h-4tools-20261029/MATERIAL_UPPER_BODY.json`<br>`r8h-4tools-20261029/MATERIAL_UPPER_BODY.png` |
| NEW_DESIGNER | PARTIAL | PASS | PARTIAL | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvtdl9v8-165q1n + "navType": "reload" + 字节 sha 对账 411801B == suite-design-realgen-20261029/new-designer-result-1.png | `real-acceptance/H4-real-20261029/NEW_DESIGNER.json`<br>`suite-design-realgen-20261029/new-designer-result-1.png` |
| PRODUCT_MARKET_MATERIAL | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ❌ | PRODUCT_MARKET_MATERIAL 常驻 profile 历史坞 0 条、rows=[]、storedTasks=[]（r7-d19-history-20261029/tool-product-market-material.json，countForTool=0）：无该工具任务快照，reload 后无可恢复结果 | `r7-d19-history-20261029/tool-product-market-material.json`<br>`history-restore-20261029/summary.json` |
| SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt8c2a6-nsv4pt + "afterReload": { + 字节 sha 对账 839268B == real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png | `real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json`<br>`real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png` |
| IMAGE_TO_VIDEO | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | ✅ | ✅ | ❌ | task task-mvt71akq-bu2hxh 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json`<br>`real-acceptance/IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json` |
| SALE_VIDEO | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvt76u6p-7cfnff + "nav": "reload" + 字节 sha 对账 1366190B == real-acceptance/SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`<br>`real-acceptance/SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4` |
| VIDEO_REPLICATION | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PASS | ✅ | ✅ | ❌ | task task-mvs9mpoz-e8u2ry 记录为 failed/submit-unconfirmed（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json），无成功结果可恢复 | `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json`<br>`real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json` |
| AI_VIDEO_EDITING | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | ✅ | ❌ | ✅ | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 | `real-acceptance/AI_VIDEO_EDITING/receipt-20261029/receipt.json`<br>`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json` |
| VIDEO_TRANSLATION | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvth8drs-dk86it + "reload": { + 字节 sha 对账 1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4 | `real-acceptance/VIDEO_TRANSLATION/run-resume-translation.json`<br>`real-acceptance/VIDEO_TRANSLATION/downloaded.mp4` |
| VIDEO_CONCAT | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | ✅ | ✅ | ✅ | 真实 task task-mvthgaa4-pdg1eq + "reload": { + 字节 sha 对账 2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4 | `real-acceptance/VIDEO_CONCAT/run-resume-concat.json`<br>`real-acceptance/VIDEO_CONCAT/downloaded.mp4` |

## 相对 R11（3c9d81a + 9fae2d6）的改判（7 处）

- **PRODUCT_IMAGE_SUITE** `F` `PARTIAL` → `PASS`（`0e8f9f1`）：b4 三动作回执（字节 2151517 与 02-result.png 一致）
- **DRESS_WEAR_SET** `F` `PARTIAL` → `PASS`（`0e8f9f1`）：b4 三动作回执（字节 1239248 与 result.png 一致）
- **FISSION_LINK** `H` `PARTIAL` → `PASS`（`6cb0afc`）：真实 task task-mvt18lrt-rsnifn + "navType": "reload" + 字节 sha 对账 1988694B == real-acceptance/FISSION_LINK/r10/result.png
- **VIDEO_TRANSLATION** `R` `BLOCKED` → `PASS`（`0e8f9f1`）：字节可复核：1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
- **VIDEO_TRANSLATION** `H` `PARTIAL` → `PASS`（`0e8f9f1`）：真实 task task-mvth8drs-dk86it + "reload": { + 字节 sha 对账 1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
- **VIDEO_CONCAT** `R` `BLOCKED` → `PASS`（`0e8f9f1`）：字节可复核：2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4
- **VIDEO_CONCAT** `H` `PARTIAL` → `PASS`（`0e8f9f1`）：真实 task task-mvthgaa4-pdg1eq + "reload": { + 字节 sha 对账 2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4

## R12 判定说明 / 风险

- **VIDEO_TRANSLATION**：0e8f9f1 的真实任务 task-mvth8drs-dk86it 续查到终态 succeeded（上游 task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd），结果 1,080,637B MP4（ftyp，readyState=4，768x768）；下载动作字节与结果相等、存资产/发画布均有面板回执；整页新文档加载后历史坞命中同一 taskId 且 status=succeeded；已提交产物 downloaded.mp4 字节/魔数一致 → R、H 同时转 PASS。
- **VIDEO_CONCAT**：0e8f9f1 的真实任务 task-mvthgaa4-pdg1eq 续查到终态 succeeded（上游 task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF），2,133,234B MP4（ftyp，7.292s，768x1344）；下载字节与结果相等；刷新后历史坞命中同一 taskId；已提交产物 downloaded.mp4 一致 → R、H 转 PASS。注意：该工具早前那份 submit-unconfirmed 记录（README-20261029-continuation.md）仍是 failed，本次 PASS 依据的是另一笔真实成功任务，两者不得混为一谈。
- **FISSION_LINK**：6cb0afc 的 CDP 真实 Page.reload（navType=reload + marker=1793275695.89）后，dock 内同一 task-mvt18lrt-rsnifn 仍为 succeeded，回执字节 1,988,694B / sha bbc0ca08… 与仓库内 FISSION_LINK/r10/result.png 逐位一致 → H 转 PASS。下载按钮本轮未点到（verdict=UNVERIFIED），如实保留，不参与判定；F 的 PASS 仍由存资产/发画布两条回执成立。
- **DRESS_WEAR_SET**：7ff08bf / 61e86fc：结果区挂共享 ToolResult 后，fresh reload（navType=reload）面板重建成功（data-testid=tool-result，共 2 个结果，每组三动作按钮齐全），r12 三动作 VERIFIED（下载/存资产/发画布均有反馈）。字节口径：面板声明 2,516,552B 与 1,883,817B，其中 1,883,817B 与提交产物 r10/result.png 一致；2,516,552B 仅落到 Downloads（未入库），故 H 仍由 r10 那对（同 taskId + 同尺寸产物）成立，r12 作补充证据。
- **PRODUCT_IMAGE_SUITE**：0e8f9f1 补齐 b4-actions.json：下载/存资产/发画布三条回执字节全为 2,151,517B 且与提交产物 02-result.png 同尺寸，consoleErrors 为空 → F 由 PARTIAL 转 PASS（R11 时该回执未在 HEAD，属证据缺口而非口径问题）。
- **DRESS_WEAR_SET**：b4-actions.json 三动作字节同为 1,239,248B，与提交产物 DRESS_WEAR_SET/result.png 同尺寸 → F 转 PASS；该 b4 回执与 r10/r12 是不同轮次的真实结果，矩阵按各自维度分别引用，未混用字节。
- **IMAGE_TEXT_EDIT**：维持 R11 判定：真实任务 payloadDropped=true、无 storageKey/url/bytes，字节腿不成立 → H 仍 PARTIAL（不伪 PASS）。
- **VIDEO_CONCAT**：T（画幅/时长透传）与 F 仍受限于：本轮成功任务用的是默认参数路径，页面字段透传证据与本次 task 不属同一条回执，故不放宽。

## H 硬断言

- 断言失败项：0


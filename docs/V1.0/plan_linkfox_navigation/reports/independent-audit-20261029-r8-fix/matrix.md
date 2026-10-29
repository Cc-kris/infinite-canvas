# R8-fix 矩阵（39 工具 · 仅修正 H 证据匹配）

- 审计 HEAD：`0b86a73`（feat/linkfox-v1-real）
- 生成时间：2026-10-29T18:28:12+08:00
- 取代：`reports/independent-audit-20261029-r8/`（提交 `db02f37`）
- 修正理由：修正 H 维度的证据匹配（全仓扫描 + 真实 taskId 绑定 + 机器 reload 标记 + 字节对账）；F/T/R/K/U 与 R8 完全一致；未生成任何新证据

## 统计

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 11 / PASS 28 |
| T | PARTIAL 7 / PASS 32 |
| R | BLOCKED 2 / PARTIAL 2 / PASS 35 |
| H | PARTIAL 25 / PASS 14 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 逐工具

| 工具 | F | T | R | H | K | U | H 依据 / 未通过原因 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE | PARTIAL | PARTIAL | PASS | PASS | PASS | PASS | 全新加载后历史坞 2 条（14:55 已完成 · gpt-image-2 · 缩略图已解码） |
| DRESS_WEAR_SET | PARTIAL | PASS | PASS | PASS | PASS | PASS | 全新加载后历史坞 2 条（15:02 已完成）并还原素材 1/5、结果区 3 张 blob |
| CHANGE_COLOR_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvsb41o4-obzwag（real-acceptance/CHANGE_COLOR_V2/01-task-history.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvt9elbs-u4grlv（succeeded，1 结果 1028256B）→ 整页 reload → 历史坞 1 条 succeeded + 缩略图 blob 1024x1024 |
| SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS | 真实提交 task-mvta6bty-0rkwm9（POST /images/edits 200）→ page.reload → 任务恢复 + 历史坞 1 条 + 结果 1024x752 回放 + 下载 871973B |
| AI_OUTPAINTING | PASS | PASS | PASS | PARTIAL | PASS | PASS | 真实 task task-mvsbp9c8-y8q5vf 历史坞在 fresh reload 后复原（real-acceptance/AI_OUTPAINTING/01-run.json），但结果项 payloadDropped=true：快照只存元数据，无字节可下载/入库/上画布，字节不可复核 |
| AREA_REPAIR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 已全仓检索已提交文本证据：无该工具绑定的真实 task-mv 任务（taskId+toolId 同现） |
| REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvs9xe7s-9jmboc（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvtafqev-u2yjkh（POST /images/edits 200）→ page.reload → 自有历史「1 条」+ 结果 1024x1024 blob 解码 + 下载 919689B |
| IMAGE_CROP | PASS | PASS | PASS | PARTIAL | N/A | PASS | 真实 task task-mvt0yzj5-nryeif 有 reload 采集（real-acceptance/IMAGE_CROP/result.json），但回执自述 "resultRestored": false：结果不回流，仅恢复草稿与源图 |
| PRODUCT_REFINE | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvtb3nuj-3d0mnv（real-acceptance/R7-actions-20261029/PRODUCT_REFINE/b4-actions.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvt9r1lg-ab8tqn + 文字 reload 声明 (location.reload()，字节可复核 |
| PRINTING_REPAIR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvsamffh-uh79ky（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| HAND_REPAIR | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvtbe5rp-0maafh（real-acceptance/R7-actions-20261029/HAND_REPAIR/b4-actions.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-new-replace-bg-v2.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| REPLACE_GOODS | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-replace-goods.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| PRODUCT_SCENE | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-product-scene.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| HANDHELD_GOODS | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvs5p8g8-or3oim（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| AI_DRESSING_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-ai-dressing-v2.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| AI_POSTURE | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvtczxwo-e1d1w0（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| AI_WEARABLE | PASS | PASS | PASS | PARTIAL | PASS | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-ai-wearable.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvsdhatp-kdyvt6 + 结构化 reload 标记 ("afterReload": {)，字节可复核 |
| ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvsdivlg-6slebs + 结构化 reload 标记 ("afterReload": {)，字节可复核 |
| SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS | 真实 task task-mvsdlqxd-ttx3pl + 结构化 reload 标记 ("afterReload": {)，字节可复核 |
| PRINT_EXTRACT | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| AI_POSE_GENERATOR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 真实 task task-mvs73hbe-ak20fw 历史坞在 fresh reload 后复原（suite-design-history-20261029-b/POSE_UB.AI_POSE_GENERATOR.json），但结果项 payloadDropped=true：快照只存元数据，无字 |
| AI_DRESSING_XSY | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvtbf7ue-n28x46 + 结构化 reload 字段 ("phase": "reload")，字节可复核 |
| FISSION_LINK | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvt18lrt-rsnifn + 结构化 reload 标记 ("freshReload": {)，字节可复核 |
| IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS | 真实 task task-mvs8bhu1-hhue24 有 reload 采集（real-acceptance/IMAGE_TEXT_EDIT/result.json），但任务记录是按真实产物 URL 回填的快照（命中「回填任务快照」）后渲染：可证结果展示与按钮可用，不可证历史由页面自然恢复 |
| MATERIAL_UPPER_BODY | PASS | PASS | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvtd45nv-y7cum6（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| NEW_DESIGNER | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvtdl9v8-165q1n（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| PRODUCT_MARKET_MATERIAL | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-product-market-material.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS | 真实 task task-mvt8c2a6-nsv4pt + 结构化 reload 标记 ("afterReload": {)，字节可复核 |
| IMAGE_TO_VIDEO | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | 真实 task task-mvt71akq-bu2hxh + reload 采集（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json），但未声明结果字节，已提交产物中无同尺寸/s |
| SALE_VIDEO | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | 真实 task task-mvt76u6p-7cfnff + 结构化 reload 字段 ("nav":"reload")，字节可复核 |
| VIDEO_REPLICATION | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PASS | 真实 task task-mvs9mpoz-e8u2ry + reload 采集（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json），但未声明结果字节，已提交产物中无同尺 |
| AI_VIDEO_EDITING | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 有该工具绑定的真实 task task-mvs76zzt-c0f9u5（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集） |
| VIDEO_TRANSLATION | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS | 已全仓检索已提交文本证据：无该工具绑定的真实 task-mv 任务（taskId+toolId 同现） |
| VIDEO_CONCAT | PARTIAL | PARTIAL | BLOCKED | PASS | N/A | PASS | 真实提交 task-mvt94gxs-p0r29t → tool-task:v1 落库 failed（submit-unconfirmed）→ fresh reload 后历史「1 条 · 失败」+ 原因 + 配置快照，草稿 3 clip 恢复 |

## H 维度修正（R8 → R8-fix）

- **CHANGE_COLOR_V2** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvsb41o4-obzwag（real-acceptance/CHANGE_COLOR_V2/01-task-history.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_OUTPAINTING** `PARTIAL` → `PARTIAL`：真实 task task-mvsbp9c8-y8q5vf 历史坞在 fresh reload 后复原（real-acceptance/AI_OUTPAINTING/01-run.json），但结果项 payloadDropped=true：快照只存元数据，无字节可下载/入库/上画布，字节不可复核
- **AREA_REPAIR** `PARTIAL` → `PARTIAL`：已全仓检索已提交文本证据：无该工具绑定的真实 task-mv 任务（taskId+toolId 同现）
- **REMOVE_PEN** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs9xe7s-9jmboc（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **IMAGE_CROP** `PARTIAL` → `PARTIAL`：真实 task task-mvt0yzj5-nryeif 有 reload 采集（real-acceptance/IMAGE_CROP/result.json），但回执自述 "resultRestored": false：结果不回流，仅恢复草稿与源图
- **PRODUCT_REFINE** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvtb3nuj-3d0mnv（real-acceptance/R7-actions-20261029/PRODUCT_REFINE/b4-actions.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **FIX_COLOR** `PASS` → `PASS`：真实 task task-mvt9r1lg-ab8tqn + 文字 reload 声明 (location.reload()，字节可复核
- **PRINTING_REPAIR** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvsamffh-uh79ky（real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **HAND_REPAIR** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvtbe5rp-0maafh（real-acceptance/R7-actions-20261029/HAND_REPAIR/b4-actions.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **NEW_REPLACE_BG_V2** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-new-replace-bg-v2.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **REPLACE_GOODS** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-replace-goods.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **PRODUCT_SCENE** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-product-scene.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **HANDHELD_GOODS** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5p8g8-or3oim（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_DRESSING_V2** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-ai-dressing-v2.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_POSTURE** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvtczxwo-e1d1w0（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_WEARABLE** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-ai-wearable.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_TEXT** `PASS` → `PASS`：真实 task task-mvsdhatp-kdyvt6 + 结构化 reload 标记 ("afterReload": {)，字节可复核
- **ORNAMENT_TEXT** `PASS` → `PASS`：真实 task task-mvsdivlg-6slebs + 结构化 reload 标记 ("afterReload": {)，字节可复核
- **SDS_DESIGN** `PASS` → `PASS`：真实 task task-mvsdlqxd-ttx3pl + 结构化 reload 标记 ("afterReload": {)，字节可复核
- **PRINT_EXTRACT** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **AI_POSE_GENERATOR** `PARTIAL` → `PARTIAL`：真实 task task-mvs73hbe-ak20fw 历史坞在 fresh reload 后复原（suite-design-history-20261029-b/POSE_UB.AI_POSE_GENERATOR.json），但结果项 payloadDropped=true：快照只存元数据，无字节可下载/入库/上画布，字节不可复核
- **AI_DRESSING_XSY** `PARTIAL` → `PASS`：真实 task task-mvtbf7ue-n28x46 + 结构化 reload 字段 ("phase": "reload")，字节可复核
- **FISSION_LINK** `PARTIAL` → `PASS`：真实 task task-mvt18lrt-rsnifn + 结构化 reload 标记 ("freshReload": {)，字节可复核
- **IMAGE_TEXT_EDIT** `PARTIAL` → `PARTIAL`：真实 task task-mvs8bhu1-hhue24 有 reload 采集（real-acceptance/IMAGE_TEXT_EDIT/result.json），但任务记录是按真实产物 URL 回填的快照（命中「回填任务快照」）后渲染：可证结果展示与按钮可用，不可证历史由页面自然恢复
- **MATERIAL_UPPER_BODY** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvtd45nv-y7cum6（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **NEW_DESIGNER** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvtdl9v8-165q1n（independent-verification-20261029/VERIFY_DATA.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **PRODUCT_MARKET_MATERIAL** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs5dd71-4s35w2（r7-d19-history-20261029/tool-product-market-material.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **SCENE_TRANSFER** `PASS` → `PASS`：真实 task task-mvt8c2a6-nsv4pt + 结构化 reload 标记 ("afterReload": {)，字节可复核
- **IMAGE_TO_VIDEO** `PARTIAL` → `PARTIAL`：真实 task task-mvt71akq-bu2hxh + reload 采集（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json），但未声明结果字节，已提交产物中无同尺寸/sha 可复核文件
- **SALE_VIDEO** `PARTIAL` → `PASS`：真实 task task-mvt76u6p-7cfnff + 结构化 reload 字段 ("nav":"reload")，字节可复核
- **VIDEO_REPLICATION** `PARTIAL` → `PARTIAL`：真实 task task-mvs9mpoz-e8u2ry + reload 采集（real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json），但未声明结果字节，已提交产物中无同尺寸/sha 可复核文件
- **AI_VIDEO_EDITING** `PARTIAL` → `PARTIAL`：有该工具绑定的真实 task task-mvs76zzt-c0f9u5（r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json），但无机器 fresh reload 回执（仅文字描述或普通页面采集）
- **VIDEO_TRANSLATION** `PARTIAL` → `PARTIAL`：已全仓检索已提交文本证据：无该工具绑定的真实 task-mv 任务（taskId+toolId 同现）

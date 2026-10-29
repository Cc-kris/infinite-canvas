# R8 严格重算矩阵（39 工具）

- 运行时刻 HEAD：`560a46e`（feat/linkfox-v1-real）
- 生成时间：2026-10-29T21:47:27+08:00
- 口径：39 tools; 只复刻功能+必要字段，界面用 Infinite Canvas 设计系统

## 统计

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 8 / PASS 31 |
| T | PARTIAL 7 / PASS 32 |
| R | PARTIAL 2 / PASS 37 |
| H | PARTIAL 28 / PASS 11 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 逐工具

| 工具 | F | T | R | H | K | U | R8 关键依据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRODUCT_IMAGE_SUITE | PASS | PARTIAL | PASS | PASS | PASS | PASS | 全新加载后历史坞 2 条（14:55 已完成 · gpt-image-2 · 缩略图已解码） |
| DRESS_WEAR_SET | PASS | PASS | PASS | PASS | PASS | PASS | 全新加载后历史坞 2 条（15:02 已完成）并还原素材 1/5、结果区 3 张 blob |
| CHANGE_COLOR_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 证据无该工具绑定的真实 task id（task-mv* + toolId 同现） |
| IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvt9elbs-u4grlv（succeeded，1 结果 1028256B）→ 整页 reload → 历史坞 1 条 succeeded + 缩略图 blob 1024x1024 |
| SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS | 真实提交 task-mvta6bty-0rkwm9（POST /images/edits 200）→ page.reload → 任务恢复 + 历史坞 1 条 + 结果 1024x752 回放 + 下载 871973B |
| AI_OUTPAINTING | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AREA_REPAIR | PASS | PASS | PASS | PARTIAL | N/A | PASS | recovery4 以 store.persistTask 注入 2 条合成任务 → reload 后历史坞 2 条 succeeded + 4 缩略图解码 + 下载字节匹配（恢复链路可用，但非真实提交） |
| REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS | recovery4 注入合成任务 → reload 后历史坞 / 详情结果 / 下载 850799B sha256 一致（恢复链路可用，非真实提交） |
| CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvtafqev-u2yjkh（POST /images/edits 200）→ page.reload → 自有历史「1 条」+ 结果 1024x1024 blob 解码 + 下载 919689B |
| IMAGE_CROP | PASS | PASS | PASS | PARTIAL | N/A | PASS | recovery4 注入合成任务 → reload 后历史坞还原 1 条 + 下载 205951B sha256 一致（恢复链路可用，非真实提交） |
| PRODUCT_REFINE | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvt9r1lg-ab8tqn / task-mvta1kkg-t8y1yo → 新标签 navigate + location.reload → 历史坞 2 条、下载 sha256 83ef17c2… 实测一致、存入资 |
| PRINTING_REPAIR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| HAND_REPAIR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| REPLACE_GOODS | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| PRODUCT_SCENE | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| HANDHELD_GOODS | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_DRESSING_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_POSTURE | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_WEARABLE | PASS | PASS | PASS | PARTIAL | PASS | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvsdhatp-kdyvt6 → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复） |
| ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvsdivlg-6slebs → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复） |
| SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS | 真实提交 task-mvsdlqxd-ttx3pl → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复） |
| PRINT_EXTRACT | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_POSE_GENERATOR | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| AI_DRESSING_XSY | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| FISSION_LINK | PASS | PASS | PASS | PARTIAL | N/A | PASS | 证据无该工具绑定的真实 task id（task-mv* + toolId 同现） |
| IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| MATERIAL_UPPER_BODY | PASS | PASS | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| NEW_DESIGNER | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| PRODUCT_MARKET_MATERIAL | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H |
| SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS | 真实提交 task-mvt8c2a6-nsv4pt → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复；历史坞 Tab 已渲染但点击回填未取证） |
| IMAGE_TO_VIDEO | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS | 真实失败任务 task-mvt71akq-bu2hxh 可从历史「回填表单」（提示词 83 字 + 2 参考图，DOM 回执）；但无结果可回填（上游 503）、无 reload 时间线证据 |
| SALE_VIDEO | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 真实任务 succeeded → reload 后 blob 由 IDB 复原（新 blob id 且字节一致）、历史 2 条；但该 reload 仅有人工文字记录，未落机器回执 |
| VIDEO_REPLICATION | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PASS | 真浏览器 reload 后历史坞 1 条 succeeded → 查看结果 readyState=4/1344px → 下载/存资产/二次刷新/上游链接过期全部 sha256=b5e80fde… 一致；但任务记录为 upsertTask 注 |
| AI_VIDEO_EDITING | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 既有真实任务记录被清空后，用 store 以真实 upstreamTaskId 重建 → recoverAll 只轮询不重提 → succeeded，IDB 2268656B sha256=文件；但未取 reload 面板 DOM，prom |
| VIDEO_TRANSLATION | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS | 真浏览器刷新后历史坞 1 条 failed + 完整 400 原文、查看结果按钮 0 个、POST /v1/videos 0 次；但记录由 upsertTask 注入（task-real-*），且无成功任务可验 |
| VIDEO_CONCAT | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS | 真实提交 task-mvt94gxs-p0r29t → tool-task:v1 落库 failed（submit-unconfirmed）→ fresh reload 后历史「1 条 · 失败」+ 原因 + 配置快照，草稿 3 clip  |

## 与 R7 的差异

- **CHANGE_COLOR_V2** F: PARTIAL→PASS, H: PASS→PARTIAL
- **IMAGE_TRANSLATION** F: PARTIAL→PASS
- **SCALE_UP** K: N/A→PASS
- **CHANGE_COLOR** F: PARTIAL→PASS
- **PRODUCT_REFINE** F: PARTIAL→PASS
- **HAND_REPAIR** F: PARTIAL→PASS
- **NEW_REPLACE_BG_V2** K: N/A→PASS
- **REPLACE_GOODS** F: PARTIAL→PASS
- **PRODUCT_SCENE** F: PARTIAL→PASS
- **PRINT_EXTRACT** F: PARTIAL→PASS
- **FISSION_LINK** H: PASS→PARTIAL
- **NEW_DESIGNER** R: PASS→PARTIAL
- **VIDEO_REPLICATION** R: PASS→PARTIAL
- **VIDEO_TRANSLATION** R: BLOCKED→PASS
- **VIDEO_CONCAT** R: BLOCKED→PASS

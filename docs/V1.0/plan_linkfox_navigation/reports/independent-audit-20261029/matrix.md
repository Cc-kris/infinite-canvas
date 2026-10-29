# 39 工具独立证据矩阵（F/T/R/H/K/U）

- 生成时间：2026-10-29T17:57:07 ｜ 分支 `feat/linkfox-v1-real` ｜ HEAD `6c6785d`
- 口径：见 `rubric`（matrix.json）。所有结论绑定证据文件，R 产物做了尺寸/字节/哈希复核。

## 汇总

| F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |
| --- | --- | --- | --- | --- | --- |
| PASS 26 / PARTIAL 13 | PASS 32 / PARTIAL 7 | PASS 37 / BLOCKED 2 | PARTIAL 26 / PASS 13 | N/A 29 / PASS 10 | PASS 39 |

## 明细

| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | H 恢复路径 | K 案例 | U 设计 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `PRODUCT_IMAGE_SUITE` | PASS | PARTIAL | PASS | PASS | 历史回填 | PASS | PASS |
| 2 | `DRESS_WEAR_SET` | PASS | PASS | PASS | PASS | 历史回填 | PASS | PASS |
| 3 | `CHANGE_COLOR_V2` | PARTIAL | PASS | PASS | PASS | 历史回填（含收敛验证） | PASS | PASS |
| 4 | `IMAGE_TRANSLATION` | PASS | PASS | PASS | PASS | 历史回填 | N/A | PASS |
| 5 | `SCALE_UP` | PASS | PASS | PASS | PASS | 快照恢复 | N/A | PASS |
| 6 | `AI_OUTPAINTING` | PASS | PASS | PASS | PARTIAL | 未取证 | PASS | PASS |
| 7 | `AREA_REPAIR` | PASS | PASS | PASS | PARTIAL | 注入验证 | N/A | PASS |
| 8 | `REMOVE_PEN` | PASS | PASS | PASS | PARTIAL | 注入验证 | N/A | PASS |
| 9 | `CHANGE_COLOR` | PARTIAL | PASS | PASS | PASS | 快照恢复 | N/A | PASS |
| 10 | `IMAGE_CROP` | PASS | PASS | PASS | PARTIAL | 注入验证 | N/A | PASS |
| 11 | `PRODUCT_REFINE` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 12 | `FIX_COLOR` | PASS | PASS | PASS | PASS | 历史回填 | N/A | PASS |
| 13 | `PRINTING_REPAIR` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 14 | `HAND_REPAIR` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 15 | `NEW_REPLACE_BG_V2` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 16 | `REPLACE_GOODS` | PARTIAL | PASS | PASS | PARTIAL | 未取证 | PASS | PASS |
| 17 | `PRODUCT_SCENE` | PARTIAL | PASS | PASS | PARTIAL | 未取证 | PASS | PASS |
| 18 | `HANDHELD_GOODS` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 19 | `AI_DRESSING_V2` | PASS | PASS | PASS | PARTIAL | 未取证 | PASS | PASS |
| 20 | `AI_POSTURE` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 21 | `AI_WEARABLE` | PASS | PASS | PASS | PARTIAL | 未取证 | PASS | PASS |
| 22 | `AI_TEXT` | PASS | PASS | PASS | PASS | 快照恢复 | N/A | PASS |
| 23 | `ORNAMENT_TEXT` | PASS | PASS | PASS | PASS | 快照恢复 | N/A | PASS |
| 24 | `SDS_DESIGN` | PASS | PASS | PASS | PASS | 快照恢复 | PASS | PASS |
| 25 | `PRINT_EXTRACT` | PARTIAL | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 26 | `AI_POSE_GENERATOR` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 27 | `AI_DRESSING_XSY` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 28 | `FISSION_LINK` | PASS | PASS | PASS | PASS | 历史回填 | N/A | PASS |
| 29 | `IMAGE_TEXT_EDIT` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 30 | `MATERIAL_UPPER_BODY` | PASS | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 31 | `NEW_DESIGNER` | PARTIAL | PASS | PASS | PARTIAL | 未取证 | N/A | PASS |
| 32 | `PRODUCT_MARKET_MATERIAL` | PARTIAL | PARTIAL | PASS | PARTIAL | 未取证 | N/A | PASS |
| 33 | `SCENE_TRANSFER` | PASS | PASS | PASS | PASS | 快照恢复 | N/A | PASS |
| 34 | `IMAGE_TO_VIDEO` | PARTIAL | PASS | PASS | PARTIAL | 历史回填（部分） | PASS | PASS |
| 35 | `SALE_VIDEO` | PARTIAL | PARTIAL | PASS | PARTIAL | 人工记录（非机器回执） | N/A | PASS |
| 36 | `VIDEO_REPLICATION` | PARTIAL | PARTIAL | PASS | PARTIAL | 注入验证（真实产物） | N/A | PASS |
| 37 | `AI_VIDEO_EDITING` | PARTIAL | PARTIAL | PASS | PARTIAL | 重建记录（未取 reload 面板） | N/A | PASS |
| 38 | `VIDEO_TRANSLATION` | PARTIAL | PARTIAL | BLOCKED | PARTIAL | 注入验证（真实失败任务） | N/A | PASS |
| 39 | `VIDEO_CONCAT` | PARTIAL | PARTIAL | BLOCKED | PASS | 历史回填（失败任务） | N/A | PASS |

## H 恢复路径分布

- **未取证** 18 个：`AI_OUTPAINTING`、`PRODUCT_REFINE`、`PRINTING_REPAIR`、`HAND_REPAIR`、`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`HANDHELD_GOODS`、`AI_DRESSING_V2`、`AI_POSTURE`、`AI_WEARABLE`、`PRINT_EXTRACT`、`AI_POSE_GENERATOR`、`AI_DRESSING_XSY`、`IMAGE_TEXT_EDIT`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`
- **快照恢复** 6 个：`SCALE_UP`、`CHANGE_COLOR`、`AI_TEXT`、`ORNAMENT_TEXT`、`SDS_DESIGN`、`SCENE_TRANSFER`
- **历史回填** 5 个：`PRODUCT_IMAGE_SUITE`、`DRESS_WEAR_SET`、`IMAGE_TRANSLATION`、`FIX_COLOR`、`FISSION_LINK`
- **注入验证** 3 个：`AREA_REPAIR`、`REMOVE_PEN`、`IMAGE_CROP`
- **历史回填（含收敛验证）** 1 个：`CHANGE_COLOR_V2`
- **历史回填（部分）** 1 个：`IMAGE_TO_VIDEO`
- **人工记录（非机器回执）** 1 个：`SALE_VIDEO`
- **注入验证（真实产物）** 1 个：`VIDEO_REPLICATION`
- **重建记录（未取 reload 面板）** 1 个：`AI_VIDEO_EDITING`
- **注入验证（真实失败任务）** 1 个：`VIDEO_TRANSLATION`
- **历史回填（失败任务）** 1 个：`VIDEO_CONCAT`

## 逐工具证据

### PRODUCT_IMAGE_SUITE
- 路由：`/tools/ecommerce-suite/product-image-suite` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx`
- F=PASS：b4 三动作回执（字节 2151517 与 02-result.png 一致）
- F 证据：`PRODUCT_IMAGE_SUITE/b4-actions.json`、`PRODUCT_IMAGE_SUITE/02-result.png`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- R=PASS：2.15MB 1024x1024 本地落盘
  - `real-acceptance/PRODUCT_IMAGE_SUITE/02-result.png`（2151517B，1024x1024，sha256:a0e17fc0aff0）
- H=PASS（恢复路径：历史回填）：全新加载后历史坞 2 条（14:55 已完成 · gpt-image-2 · 缩略图已解码）
- H 证据：`H-history-freshload-20261029.json`
- K=PASS：原站 type71 12 案例 + 本地页签/做同款回填 DOM 回执
- K 证据：`PRODUCT_IMAGE_SUITE/cases-api-type71-20261029.json`、`SUITE6_20261029/cases-apply-evidence.json`
- U=PASS：设计 token 扫描 0 命中

### DRESS_WEAR_SET
- 路由：`/tools/ecommerce-suite/dress-wear-set` ｜ 工作区：`web/src/components/tools/workspaces/dress-suite.tsx`
- F=PASS：b4 三动作回执（字节 1239248 与 result.png 一致）
- F 证据：`DRESS_WEAR_SET/b4-actions.json`、`DRESS_WEAR_SET/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.24MB 1024x1024
  - `real-acceptance/DRESS_WEAR_SET/result.png`（1239248B，1024x1024，sha256:e33bbeae8862）
- H=PASS（恢复路径：历史回填）：全新加载后历史坞 2 条（15:02 已完成）并还原素材 1/5、结果区 3 张 blob
- H 证据：`H-history-freshload-20261029.json`
- K=PASS：原站 type69 12 案例 + 案例服装图回填回执
- K 证据：`DRESS_WEAR_SET/cases-api-type69-20261029.json`、`SUITE6_20261029/cases-apply-evidence.json`
- U=PASS：设计 token 扫描 0 命中

### CHANGE_COLOR_V2
- 路由：`/tools/ecommerce-suite/change-color-v2` ｜ 工作区：`web/src/components/tools/workspaces/color-v2.tsx`
- F=PARTIAL：b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败）
- F 证据：`CHANGE_COLOR_V2/b4-actions.json`、`CHANGE_COLOR_V2/05-unit1-result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.12MB 本地落盘（unit1）
  - `real-acceptance/CHANGE_COLOR_V2/05-unit1-result.png`（1115668B，1024x1024，sha256:dd56d50404c3）
- H=PASS（恢复路径：历史回填（含收敛验证））：全新加载后历史坞 4 条可读（1 条已完成含结果），但 2 条永久「提交中」/2 条「结果未知」
- H 证据：`H-history-freshload-20261029.json`
- K=PASS：原站 type93 13 案例 + 换色部位回填回执
- K 证据：`CHANGE_COLOR_V2/cases-api-type93-20261029.json`、`SUITE6_20261029/cases-apply-evidence.json`
- U=PASS：设计 token 扫描 0 命中

### IMAGE_TRANSLATION
- 路由：`/tools/ecommerce-suite/image-translation` ｜ 工作区：`web/src/components/tools/workspaces/translate.tsx`
- F=PASS：r7 复用真实成功任务 task-mvt9elbs-u4grlv，三动作齐全且字节三处互证：下载 1028256B（sha256 8b600332…）＝资产 DA8J8qw7BpnPB_6qFhcnY（image:LKQWmB0Nf8WfSf2pW5rg8，1024x1024）＝画布 0NDxhfkN1_ZKYI7y0d6S5 / image-1793267739608-qt3um（1028256B）；同标签内点后即时回读 IDB，无注入、未重生成
- F 证据：`R7-actions-20261029/IMAGE_TRANSLATION/b4-actions.json`、`R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png`、`IMAGE_TRANSLATION/b4-actions.json`、`IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：747KB 本地落盘（另有 b5 真实任务结果 1028256B）
  - `real-acceptance/IMAGE_TRANSLATION/result.png`（747105B，1024x1024，sha256:232f58fa3a25）
- H=PASS（恢复路径：历史回填）：真实提交 task-mvt9elbs-u4grlv（succeeded，1 结果 1028256B）→ 整页 reload → 历史坞 1 条 succeeded + 缩略图 blob 1024x1024
- H 证据：`IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json`
- K=N/A：原站无优秀案例页签（b6 未列；本地未新增）
- U=PASS：设计 token 扫描 0 命中

### SCALE_UP
- 路由：`/tools/ecommerce-suite/scale-up` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx`
- F=PASS：b4 三动作回执（07 verified 字节 1152074）；0134fb6 另一次真实运行下载 871973B
- F 证据：`SCALE_UP/b4-actions.json`、`SCALE_UP/07-result-actions-verified.json`、`SCALE_UP/02-result.png`、`HISTORY_RECOVERY_MINE/SCALE_UP/run.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.15MB 本地落盘（r7 另存 871973B 回放图）
  - `real-acceptance/SCALE_UP/02-result.png`（755743B，1024x752，sha256:9d8d9c2988df）
  - `real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png`（871973B，1024x752，sha256:21f429573480）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvta6bty-0rkwm9（POST /images/edits 200）→ page.reload → 任务恢复 + 历史坞 1 条 + 结果 1024x752 回放 + 下载 871973B
- H 证据：`HISTORY_RECOVERY_MINE/SCALE_UP/run.json`、`HISTORY_RECOVERY_MINE/summary-1793262552441.json`
- K=N/A：b6 明确：原站该页无「优秀案例」页签（origin/SCALE_UP-cases.json 为空），旧矩阵 MISSING 口径错误
- K 证据：`b6-cases/visual-parity.json`、`b6-cases/origin/SCALE_UP-cases.json`
- U=PASS：设计 token 扫描 0 命中

### AI_OUTPAINTING
- 路由：`/tools/ecommerce-suite/ai-outpainting` ｜ 工作区：`web/src/components/tools/workspaces/outpaint.tsx`
- F=PASS：b4 + 04-result-actions 三动作回执
- F 证据：`AI_OUTPAINTING/b4-actions.json`、`AI_OUTPAINTING/04-result-actions.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：929KB 本地落盘
  - `real-acceptance/AI_OUTPAINTING/02-result.png`（929476B，1024x1024，sha256:8680a0476955）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=PASS：原站案例数据 + 本地页签/做同款 4 步截图
- K 证据：`b6-cases/visual-parity.json`、`b6-cases/local/run-outpaint-cases.json`
- U=PASS：设计 token 扫描 0 命中

### AREA_REPAIR
- 路由：`/tools/smart-edit/area-repair` ｜ 工作区：`web/src/components/tools/workspaces/mask.tsx`
- F=PASS：result.json download/assetId/projectId 三回执
- F 证据：`AREA_REPAIR/result.json`、`AREA_REPAIR/canvas.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：943KB 本地落盘（双结果）
  - `real-acceptance/AREA_REPAIR/result.png`（943932B，1024x1024，sha256:3cf14369ab45）
- H=PARTIAL（恢复路径：注入验证）：recovery4 以 store.persistTask 注入 2 条合成任务 → reload 后历史坞 2 条 succeeded + 4 缩略图解码 + 下载字节匹配（恢复链路可用，但非真实提交）
- H 证据：`B5_HISTORY_DOCK/recovery4/summary.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### REMOVE_PEN
- 路由：`/tools/smart-edit/remove-pen` ｜ 工作区：`web/src/components/tools/workspaces/mask.tsx`
- F=PASS：run-actions-real: 存资产+发画布回执（下载无字节回执）
- F 证据：`REMOVE_PEN/run-actions-real.json`、`REMOVE_PEN/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：850KB 本地落盘
  - `real-acceptance/REMOVE_PEN/result.png`（850799B，1024x1024，sha256:67d5d6a63751）
- H=PARTIAL（恢复路径：注入验证）：recovery4 注入合成任务 → reload 后历史坞 / 详情结果 / 下载 850799B sha256 一致（恢复链路可用，非真实提交）
- H 证据：`B5_HISTORY_DOCK/recovery4/summary.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### CHANGE_COLOR
- 路由：`/tools/smart-edit/change-color` ｜ 工作区：`web/src/components/tools/workspaces/color.tsx`
- F=PARTIAL：仅有 download 截图 + 资产校验断言；0134fb6 真实运行取得下载 919689B，但存资产/发画布无回执
- F 证据：`CHANGE_COLOR/result.json`、`CHANGE_COLOR/reuse-actions.png`、`HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.23MB 本地落盘（r7 另一次真实运行 919689B）
  - `real-acceptance/CHANGE_COLOR/result.png`（1231207B，1024x1024，sha256:6f3937c29849）
  - `real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png`（919689B，1024x1024，sha256:c3a272a6ffeb）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvtafqev-u2yjkh（POST /images/edits 200）→ page.reload → 自有历史「1 条」+ 结果 1024x1024 blob 解码 + 下载 919689B
- H 证据：`HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json`、`HISTORY_RECOVERY_MINE/summary-1793262950790.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### IMAGE_CROP
- 路由：`/tools/smart-edit/image-crop` ｜ 工作区：`web/src/components/tools/workspaces/crop.tsx`
- F=PASS：b7：真实上传→submit→结果→三动作（本地像素裁剪）
- F 证据：`IMAGE_CROP/run-actions-b7.json`、`IMAGE_CROP/run-nv.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：206KB 本地落盘（裁剪结果）
  - `real-acceptance/IMAGE_CROP/result.png`（205951B，1024x744，sha256:c046374eac48）
- H=PARTIAL（恢复路径：注入验证）：recovery4 注入合成任务 → reload 后历史坞还原 1 条 + 下载 205951B sha256 一致（恢复链路可用，非真实提交）
- H 证据：`B5_HISTORY_DOCK/recovery4/summary.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRODUCT_REFINE
- 路由：`/tools/smart-edit/product-refine` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx`
- F=PASS：r7 复用真实成功任务 task-mvtb3nuj-3d0mnv，三动作齐全且字节三处互证：下载 2827346B（sha256 454f64bb…）＝资产 arsQzAbHpBGKI-8AoPUeF（image:kYwi9eAvdPaEBitw1j1DP，2048x1488）＝画布 RaiNNBcYL08RwszivAQPR / image-1793267706845-ss5qf（2827346B）；同标签内点后即时回读 IDB，无注入、未重生成
- F 证据：`R7-actions-20261029/PRODUCT_REFINE/b4-actions.json`、`R7-actions-20261029/PRODUCT_REFINE/product-refine-result-1.png`、`PRODUCT_REFINE/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：2.04MB 本地落盘
  - `real-acceptance/PRODUCT_REFINE/result.png`（2044177B，2048x1488，sha256:90ae5ae24727）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### FIX_COLOR
- 路由：`/tools/smart-edit/fix-color` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx`
- F=PASS：两次真实提交（7a56082 修尺寸后 1024x752）+ 历史坞下载 sha256 一致 + 存入资产 OIRBFLPZFZt5hjgOZL3sV（2 项回执）
- F 证据：`FIX_COLOR/result.json`、`FIX_COLOR/history-recovery-20261029/actions-download.json`、`FIX_COLOR/history-recovery-20261029/actions-save-to-assets.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1218527B 1024x1024 + 1003673B 1024x752 两次真实出图落盘（非截图）
  - `real-acceptance/FIX_COLOR/result-real-20261029.png`（1218527B，1024x1024，sha256:83ef17c23f33）
  - `real-acceptance/FIX_COLOR/result-real-run2-20261029.png`（1003673B，1024x752，sha256:a5958a770e8f）
- H=PASS（恢复路径：历史回填）：真实提交 task-mvt9r1lg-ab8tqn / task-mvta1kkg-t8y1yo → 新标签 navigate + location.reload → 历史坞 2 条、下载 sha256 83ef17c2… 实测一致、存入资产成功
- H 证据：`FIX_COLOR/history-recovery-20261029/probe-fresh-load.json`、`FIX_COLOR/history-recovery-20261029/probe-after-reload.json`、`FIX_COLOR/history-recovery-20261029/actions-download.json`、`FIX_COLOR/history-recovery-20261029/actions-save-to-assets.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRINTING_REPAIR
- 路由：`/tools/smart-edit/printing-repair` ｜ 工作区：`web/src/components/tools/workspaces/printing-repair.tsx`
- F=PASS：run-actions-real: 真实出图+存资产+发画布+独立路由回验
- F 证据：`PRINTING_REPAIR/run-actions-real.json`、`PRINTING_REPAIR/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.15MB 本地落盘
  - `real-acceptance/PRINTING_REPAIR/result.png`（1153165B，1024x1024，sha256:6ce8e2aa312b）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### HAND_REPAIR
- 路由：`/tools/smart-edit/hand-repair` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx`
- F=PASS：r7 复用真实成功任务 task-mvtbe5rp-0maafh，三动作齐全且字节三处互证：下载 2153466B（sha256 a34cea71…）＝资产 5pRjNY6-nBhQHpivGWRL_（image:IKtqBWhh97bo9kYTBc9tV，1024x1024）＝画布 Ng-l4G-cYB8AJEP83OZUv / image-1793267583731-ask3z（2153466B）；同标签内点后即时回读 IDB，无注入、未重生成
- F 证据：`R7-actions-20261029/HAND_REPAIR/b4-actions.json`、`R7-actions-20261029/HAND_REPAIR/hand-repair-result-1.png`、`HAND_REPAIR/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.35MB 本地落盘
  - `real-acceptance/HAND_REPAIR/result.png`（1353583B，1024x1024，sha256:3e53cf331d5d）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### NEW_REPLACE_BG_V2
- 路由：`/tools/product-design/new-replace-bg-v2` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PASS：b4 字节匹配 download/asset/node 三处 1109268B
- F 证据：`NEW_REPLACE_BG_V2/b4-actions.json`、`NEW_REPLACE_BG_V2/result1.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.11MB 本地落盘
  - `real-acceptance/NEW_REPLACE_BG_V2/result1.png`（1109268B，1024x1024，sha256:58041a5cf1df）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站页面未取得（仅 supplemental 片段），案例有无未取证；不得判定为“原站有案例”
- K 证据：`b6-cases/visual-parity.json`、`b6-cases/origin/NEW_REPLACE_BG_V2-probe.json`
- U=PASS：设计 token 扫描 0 命中

### REPLACE_GOODS
- 路由：`/tools/product-design/replace-goods` ｜ 工作区：`web/src/components/tools/workspaces/replace.tsx`
- F=PARTIAL：上游已出图但结果区静默清空（渲染缺陷），动作未验收
- F 证据：`REPLACE_GOODS/result.json`、`REPLACE_GOODS/upstream_result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.20MB 上游产物 URL 可取回
  - `real-acceptance/REPLACE_GOODS/upstream_result.png`（1216214B，1254x1254，sha256:6bcfd3101e48）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=PASS：原站案例 + 做同款回填（design19 replace）
- K 证据：`design19-cases-20261029/replace/run.json`、`design19-cases-20261029/summary-replace.json`
- U=PASS：设计 token 扫描 0 命中

### PRODUCT_SCENE
- 路由：`/tools/product-design/product-scene` ｜ 工作区：`web/src/components/tools/workspaces/scene-fission.tsx`
- F=PARTIAL：有真实产物，无三动作回执
- F 证据：`PRODUCT_SCENE/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.42MB 1024x1360
  - `real-acceptance/PRODUCT_SCENE/result1.png`（1421980B，1024x1024，sha256:260071186391）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=PASS：原站案例 + 回填（design19 scene）
- K 证据：`design19-cases-20261029/scene/run.json`、`design19-cases-20261029/summary-scene.json`
- U=PASS：设计 token 扫描 0 命中

### HANDHELD_GOODS
- 路由：`/tools/product-design/handheld-goods` ｜ 工作区：`web/src/components/tools/workspaces/handheld-goods.tsx`
- F=PASS：b4 三动作回执（1060068B）
- F 证据：`HANDHELD_GOODS/b4-actions.json`、`HANDHELD_GOODS/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.06MB 本地落盘
  - `real-acceptance/HANDHELD_GOODS/result.png`（1060068B，720x960，sha256:fbb05871e134）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_DRESSING_V2
- 路由：`/tools/product-design/ai-dressing-v2` ｜ 工作区：`web/src/components/tools/workspaces/dressing.tsx`
- F=PASS：b4 三动作回执（819224B，与 result1.png 一致）
- F 证据：`AI_DRESSING_V2/b4-actions.json`、`AI_DRESSING_V2/result1.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：819KB 本地落盘 + design19 1.65MB
  - `real-acceptance/AI_DRESSING_V2/result1.png`（819224B，720x960，sha256:446d9ffe39f9）
  - `design19-cases-20261029/dressing/result-1940370107691995136.png`（1646968B，1024x1024，sha256:12825db5e0b3）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=PASS：原站案例 + 做同款回填+提交回执
- K 证据：`b6-cases/visual-parity.json`、`design19-cases-20261029/dressing/run.json`、`design19-cases-20261029/summary-dressing.json`
- U=PASS：设计 token 扫描 0 命中

### AI_POSTURE
- 路由：`/tools/product-design/ai-posture` ｜ 工作区：`web/src/components/tools/workspaces/model.tsx`
- F=PASS：b4 三动作回执（972271B）
- F 证据：`AI_POSTURE/b4-actions.json`、`AI_POSTURE/result1.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：972KB 本地落盘
  - `real-acceptance/AI_POSTURE/result1.png`（972271B，720x960，sha256:60e839b98832）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：design19 未覆盖；b6 origin 有案例但本地未实现（见 report 缺口）
- K 证据：`b6-cases/visual-parity.json`
- U=PASS：设计 token 扫描 0 命中

### AI_WEARABLE
- 路由：`/tools/product-design/ai-wearable` ｜ 工作区：`web/src/components/tools/workspaces/dress.tsx`
- F=PASS：b4 三动作回执（1641506B）
- F 证据：`AI_WEARABLE/b4-actions.json`、`AI_WEARABLE/result1.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.64MB 本地落盘 + design19 1.23MB
  - `real-acceptance/AI_WEARABLE/result1.png`（1641506B，720x960，sha256:7615ee04f73c）
  - `design19-cases-20261029/wearable/result-1955579942177386496.png`（1229594B，1024x1024，sha256:0a73ab1e2a63）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=PASS：原站案例 + 回填（design19 wearable）
- K 证据：`b6-cases/visual-parity.json`、`design19-cases-20261029/wearable/run.json`
- U=PASS：设计 token 扫描 0 命中

### AI_TEXT
- 路由：`/tools/product-design/ai-text` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx`
- F=PASS：B2G1 三动作回执（download 1825663B sha256 一致 / 存资产 uStjodx0Uad4IPDsTVqoG / 画布 sNQeliaC-Z_BkqoJVdTaw）
- F 证据：`B2G1/AI_TEXT/run-b2g1.json`、`B2G1/AI_TEXT/result-0.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1825663B 1024x1024 本地落盘（B2G1，真实 provider）
  - `real-acceptance/B2G1/AI_TEXT/result-0.png`（1825663B，1024x1024，sha256:9019ffaf2248）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvsdhatp-kdyvt6 → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）
- H 证据：`B2G1/AI_TEXT/run-b2g1.json`、`B2G1/AI_TEXT/task-snapshot.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### ORNAMENT_TEXT
- 路由：`/tools/product-design/ornament-text` ｜ 工作区：`web/src/components/tools/workspaces/text.tsx`
- F=PASS：B2G1 三动作回执（download 2439783B sha256 一致 / 存资产 _JGRrrDhs1xgmgeGmmnZ0 / 画布 xpWrYbEDQlCJH8It8ID_Q）
- F 证据：`B2G1/ORNAMENT_TEXT/run-b2g1.json`、`B2G1/ORNAMENT_TEXT/result-0.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：2439783B 1024x1024 本地落盘（B2G1，真实 provider）
  - `real-acceptance/B2G1/ORNAMENT_TEXT/result-0.png`（2439783B，1024x1024，sha256:d7a57b9b72c2）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvsdivlg-6slebs → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）
- H 证据：`B2G1/ORNAMENT_TEXT/run-b2g1.json`、`B2G1/ORNAMENT_TEXT/task-snapshot.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### SDS_DESIGN
- 路由：`/tools/product-design/sds-design` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx`
- F=PASS：B2G1 三动作回执（download 2081539B sha256 一致 / 存资产 tr2qRM39e-G66t6X1l3dr / 画布 S0iOeaR__wU4YSctOdBUR）
- F 证据：`B2G1/SDS_DESIGN/run-b2g1.json`、`B2G1/SDS_DESIGN/result-0.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：2081539B 1024x1024（B2G1）；design19 另存 1.44MB
  - `real-acceptance/B2G1/SDS_DESIGN/result-0.png`（2081539B，1024x1024，sha256:a119eb6cf488）
  - `design19-cases-20261029/sds/result-1780443735213010944.png`（1442444B，1024x1024，sha256:c762f8ea5c59）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvsdlqxd-ttx3pl → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复）
- H 证据：`B2G1/SDS_DESIGN/run-b2g1.json`、`B2G1/SDS_DESIGN/task-snapshot.json`
- K=PASS：原站案例 + 回填（design19 sds）
- K 证据：`design19-cases-20261029/sds/run.json`、`design19-cases-20261029/summary-sds.json`
- U=PASS：设计 token 扫描 0 命中

### PRINT_EXTRACT
- 路由：`/tools/product-design/print-extract` ｜ 工作区：`web/src/components/tools/workspaces/extract.tsx`
- F=PARTIAL：结果落地状态机缺陷（卡片停在 running）；动作未全验收
- F 证据：`PRINT_EXTRACT/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：690KB 由结果 URL 下载可复核
  - `real-acceptance/PRINT_EXTRACT/result_url_download.png`（686174B，720x960，sha256:804be5318a8c）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_POSE_GENERATOR
- 路由：`/tools/product-design/ai-pose-generator` ｜ 工作区：`web/src/components/tools/workspaces/model.tsx`
- F=PASS：b4 三动作回执（1550004B）
- F 证据：`AI_POSE_GENERATOR/b4-actions.json`、`AI_POSE_GENERATOR/real-run-1024.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.55MB 本地落盘
  - `real-acceptance/AI_POSE_GENERATOR/real-run-1024.png`（1550004B，1024x1024，sha256:bd34bb6dbeee）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_DRESSING_XSY
- 路由：`/tools/product-design/ai-dressing-xsy` ｜ 工作区：`web/src/components/tools/workspaces/dressing-xsy.tsx`
- F=PASS：traceIds 含 assetId+canvasNodeId 回执（无下载回执）
- F 证据：`AI_DRESSING_XSY/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.07MB 本地落盘
  - `real-acceptance/AI_DRESSING_XSY/02-result.png`（1069621B，720x960，sha256:3fa3873f07ac）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### FISSION_LINK
- 路由：`/tools/product-design/fission-link` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PASS：df765ff/b95ff4c 后 reload 恢复结果 → 下载 1988694B sha256=bbc0ca08… 实测一致 → 存入资产 i28CzCpbrBdqVvU_8sKuC → 发画布 4YJKL9Hoq-HRiYvhqIozS / image-1793262996953-ratzx（三动作齐全）
- F 证据：`FISSION_LINK/b4-actions.json`、`FISSION_LINK/b5-restore-after-reload.json`、`H2-fission-xsy-20261029/evidence.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：b5 真实任务结果 1988694B（r7 实测 sha256 bbc0ca08…）+ 139KB 本地结果 + 1.67MB 上游原图
  - `real-acceptance/FISSION_LINK/01-result.png`（138756B，1908x837，sha256:d5c4ca3205cd）
  - `real-acceptance/FISSION_LINK/03-upstream-result.png`（1672875B，1024x1024，sha256:252b3ed1eb65）
  - `real-acceptance/FISSION_LINK/b5-restored-download.png`（1988694B，1024x1024，sha256:bbc0ca08cfa4）
- H=PASS（恢复路径：历史回填）：全新加载后历史坞 5 条 + 4 张 1024² 缩略图解码；另有 2 条卡「提交中」
- H 证据：`H-history-freshload-20261029.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### IMAGE_TEXT_EDIT
- 路由：`/tools/product-design/image-text-edit` ｜ 工作区：`web/src/components/tools/workspaces/image-text-edit.tsx`
- F=PASS：b7：真实 OSS 产物 + 三动作回执
- F 证据：`IMAGE_TEXT_EDIT/run-actions-b7.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：845KB 本地落盘
  - `real-acceptance/IMAGE_TEXT_EDIT/result.png`（844613B，1024x1024，sha256:e7b260e7b064）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### MATERIAL_UPPER_BODY
- 路由：`/tools/product-design/material-upper-body` ｜ 工作区：`web/src/components/tools/workspaces/dress.tsx`
- F=PASS：b4 三动作回执（1699450B）
- F 证据：`MATERIAL_UPPER_BODY/b4-actions.json`、`MATERIAL_UPPER_BODY/real-run-1024.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.70MB 本地落盘
  - `real-acceptance/MATERIAL_UPPER_BODY/real-run-1024.png`（1699450B，1024x1024，sha256:dede7ba9a582）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### NEW_DESIGNER
- 路由：`/tools/product-design/new-designer` ｜ 工作区：`web/src/components/tools/workspaces/designer.tsx`
- F=PARTIAL：本地导出 + 画布截图，无资产/画布机器回执
- F 证据：`NEW_DESIGNER/result.json`、`NEW_DESIGNER/step-2-canvas.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：32KB 1200x1200 本地合成（体积偏小但为真实 PNG）
  - `real-acceptance/NEW_DESIGNER/result.png`（32854B，1200x1200，sha256:2ee5aa7b300b）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRODUCT_MARKET_MATERIAL
- 路由：`/tools/product-design/product-market-material` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx`
- F=PARTIAL：有 step-2 资产库/step-3 画布截图，无机器回执
- F 证据：`PRODUCT_MARKET_MATERIAL/step-2-asset-library.png`、`PRODUCT_MARKET_MATERIAL/step-3-canvas.png`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- R=PASS：700KB 本地落盘
  - `real-acceptance/PRODUCT_MARKET_MATERIAL/result.png`（703458B，970x600，sha256:d1343fdf6f40）
- H=PARTIAL（恢复路径：未取证）：未取证：无 reload 快照恢复回执，也未采集「全新加载后历史坞」；B5/B4/B7 的注入快照不计入 H
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### SCENE_TRANSFER
- 路由：`/tools/product-design/scene-transfer` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PASS：B2G1 三动作回执（download 839268B sha256 一致 / 存资产 kb0gp-E_C3Eqz5FNTvuly / 画布 XURFCb2xCZsawQkjmLQ7z）；e990e85 才接通 getPersistedToolGateway
- F 证据：`B2G1/SCENE_TRANSFER/run-b2g1.json`、`B2G1/SCENE_TRANSFER/result-0.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：839268B 1024x1024 本地落盘（IDB tool-result, 无 dataURL 直塞）
  - `real-acceptance/B2G1/SCENE_TRANSFER/result-0.png`（839268B，1024x1024，sha256:dfb33c53c727）
- H=PASS（恢复路径：快照恢复）：真实提交 task-mvt8c2a6-nsv4pt → tool-task:v1 落库 → reload 面板 succeeded 且 IDB 字节 sha256=上游（快照恢复；历史坞 Tab 已渲染但点击回填未取证）
- H 证据：`B2G1/SCENE_TRANSFER/run-b2g1.json`、`B2G1/SCENE_TRANSFER/task-snapshot.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### IMAGE_TO_VIDEO
- 路由：`/tools/ai-video/image-to-video` ｜ 工作区：`web/src/components/tools/workspaces/image-to-video.tsx`
- F=PARTIAL：生成+存资产已验收（06-result-video.mp4 1.30MB）；发画布未执行；ddba2e6 只补落库/历史区代码，上游 503 无新结果
- F 证据：`IMAGE_TO_VIDEO/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.30MB mp4 本地落盘
  - `real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4`（1297168B，sha256:56226153eb7e）
- H=PARTIAL（恢复路径：历史回填（部分））：真实失败任务 task-mvt71akq-bu2hxh 可从历史「回填表单」（提示词 83 字 + 2 参考图，DOM 回执）；但无结果可回填（上游 503）、无 reload 时间线证据
- H 证据：`IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json`
- K=PASS：原站 10 条真实案例（cover.jpg/ref-1.png 均 200 真图）+ 本地「做同款」回执（formState 534 字原站脚本、9:16、15s、1080P、1 参考图 472KB）
- K 证据：`IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json`、`IMAGE_TO_VIDEO/cases-source.json`
- U=PASS：设计 token 扫描 0 命中

### SALE_VIDEO
- 路由：`/tools/ai-video/sale-video` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：真实任务 task-mvt76u6p-7cfnff（succeeded，上游 task_hhe2Fmdx…）产物 1366190B；下载 sha256 39193f0a… 实测一致；存入资产 CSjc856F5YIETwEX435Cr / 发画布 P3rUhnqi1Rm9ZpAqs4KPo 仅记录在 FOLLOWUP.md（无 JSON/DOM 回执）
- F 证据：`SALE_VIDEO_20261029/task-mvt76u6p-7cfnff.raw.json`、`SALE_VIDEO_20261029/FOLLOWUP_20261029.md`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=PASS：1366190B 768x768 H.264 6.583s（r7 实测 sha256 39193f0a…，ffmpeg 全解码 0 错）
  - `real-acceptance/SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4`（1366190B，sha256:39193f0a2c97）
- H=PARTIAL（恢复路径：人工记录（非机器回执））：真实任务 succeeded → reload 后 blob 由 IDB 复原（新 blob id 且字节一致）、历史 2 条；但该 reload 仅有人工文字记录，未落机器回执
- H 证据：`SALE_VIDEO_20261029/task-mvt76u6p-7cfnff.raw.json`、`SALE_VIDEO_20261029/FOLLOWUP_20261029.md`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_REPLICATION
- 路由：`/tools/ai-video/video-replication` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：真实产物 2277978B；真浏览器 UI 下载×2 / 存资产 / 画布按钮全部可用且字节 sha256 一致；但工作台提交通道仍 404（产物来自 link 模式真实任务），记录由脚本 upsertTask 注入
- F 证据：`VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json`、`VIDEO_REPLICATION/link-mode/out.mp4`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=PASS：link 模式 out.mp4 2.28MB（1344px/6.58s）与历史恢复下载逐字节一致
  - `real-acceptance/VIDEO_REPLICATION/link-mode/out.mp4`（2277978B，sha256:b5e80fdea652）
- H=PARTIAL（恢复路径：注入验证（真实产物））：真浏览器 reload 后历史坞 1 条 succeeded → 查看结果 readyState=4/1344px → 下载/存资产/二次刷新/上游链接过期全部 sha256=b5e80fde… 一致；但任务记录为 upsertTask 注入（task-real-*），非真实提交落库
- H 证据：`VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_VIDEO_EDITING
- 路由：`/tools/ai-video/ai-video-editing` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：真实上游任务 task_QFvq6WMc 已 done，产物 2268656B 可下载/可入库；但原始 prompt/两张输入图未恢复，无存资产/发画布回执（b4 的 1297168B 为借用 IMAGE_TO_VIDEO，不计）
- F 证据：`AI_VIDEO_EDITING/receipt-20261029/receipt.json`、`AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=PASS：2268656B h264 1344x768 6.58s 本地落盘（真实 provider 产物，sha256 与下载一致）
  - `real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`（2268656B，sha256:47573c147325）
- H=PARTIAL（恢复路径：重建记录（未取 reload 面板））：既有真实任务记录被清空后，用 store 以真实 upstreamTaskId 重建 → recoverAll 只轮询不重提 → succeeded，IDB 2268656B sha256=文件；但未取 reload 面板 DOM，prompt/输入字段为空
- H 证据：`AI_VIDEO_EDITING/receipt-20261029/receipt.json`、`AI_VIDEO_EDITING/receipt-20261029/REPORT.md`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_TRANSLATION
- 路由：`/tools/ai-video/video-translation` ｜ 工作区：`web/src/components/tools/workspaces/video-translation.tsx`
- F=PARTIAL：真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验
- F 证据：`VIDEO_TRANSLATION/result.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:500
- R=BLOCKED：无任何视频产物，上游 400（旧矩阵 R=PASS 为口误）
- H=PARTIAL（恢复路径：注入验证（真实失败任务））：真浏览器刷新后历史坞 1 条 failed + 完整 400 原文、查看结果按钮 0 个、POST /v1/videos 0 次；但记录由 upsertTask 注入（task-real-*），且无成功任务可验
- H 证据：`VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_CONCAT
- 路由：`/tools/ai-video/video-concat` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：39bf486：真实 UI 提交带页内字段（seconds=10&size=720x1280&ratio=9:16&resolution_name=720p），但上游 400（multipart 被当 utf-8 解码）+ HMR 重载中断 → 显式记 failed；无结果区闭环
- F 证据：`VIDEO_CONCAT/request-evidence-20261029.json`、`VIDEO_CONCAT/task-record-20261029.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=BLOCKED：仍无拼接产物：上游 multipart 400（网关侧编码缺陷），JSON 回退需公网可访问资产 URL，本轮未取得
- H=PASS（恢复路径：历史回填（失败任务））：真实提交 task-mvt94gxs-p0r29t → tool-task:v1 落库 failed（submit-unconfirmed）→ fresh reload 后历史「1 条 · 失败」+ 原因 + 配置快照，草稿 3 clip 恢复
- H 证据：`VIDEO_CONCAT/history-recovery-20261029.json`、`VIDEO_CONCAT/task-record-20261029.json`
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

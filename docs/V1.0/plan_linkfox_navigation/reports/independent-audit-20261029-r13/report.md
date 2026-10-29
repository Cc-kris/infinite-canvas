# R13 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：HEAD `8761c4e`（`feat/linkfox-v1-real`）
- 基线：R12 ab2c468（F30/9 T32/7 R37/2 H29/10 K12/27 U39）
- 生成：2026-10-29T21:15:16+0800；审计器：`tools/recompute_scope_matrix_r13.py`（继承 R12，只加 R13 硬断言与改判归因，**不放宽任何判据**）
- 证据源：`git ls-tree HEAD` + 磁盘字节/sha 实测；**未提交/未跟踪内容一律不吸收**

## 统计（F/T/R/H/K/U）

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 33 | 6 | — |
| T | 36 | 3 | — |
| R | 37 | 2 | — |
| H | 30 | 9 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

相对 R12 改判：**7 处**

- **PRODUCT_MARKET_MATERIAL** `F` PARTIAL → PASS（808f52f）
- **SALE_VIDEO** `F` PARTIAL → PASS（a087ce4+f70452f）
- **IMAGE_TO_VIDEO** `F` PARTIAL → PASS（r14(240f49a后提交证据)）
- **SALE_VIDEO** `T` PARTIAL → PASS（f2bbbf4）
- **VIDEO_CONCAT** `T` PARTIAL → PASS（f2bbbf4）
- **VIDEO_REPLICATION** `T` PARTIAL → PASS（f2bbbf4）
- **AI_VIDEO_EDITING** `T` PARTIAL → PASS（f2bbbf4）

- **另有 1 处 H 改判**：`PRODUCT_MARKET_MATERIAL` H PARTIAL → PASS（808f52f 的 r13 receipt：task-mvtjpn12-s1c4t6 succeeded、payloadDropped=false、1902882B/sha 5cdef97d…、reload 步骤 historyRows 绑定同一 task、下载+存资产+发画布三动作齐）——该改判由 R13 树内扫描器自动成立，故不计入上方 changes 列表。

## 吸收的已提交证据

- `0a20bff` — fix(CHANGE_COLOR_V2): 结果映射把 IDB storageKey 视为有图（刷新后不再误判 empty-result）+ r13-mapping-fix 证据
- `5743ea8` — fix(REMOVE_PEN): removePenRunFromTask 接受 storageKey-only 结果并透传字节 + r13-mapping-fix 证据
- `24165da` — fix(IMAGE_TEXT_EDIT): 刷新后 hydrate 任务库并按 storageKey 还原结果面板 + r13-mapping-fix 证据
- `808f52f` — evidence(market-material): R13 真实 UI 全链路（上游 200 / 真实字节 sha / 下载+存资产+发画布 / reload 历史+结果面板）
- `f2bbbf4` — fix(t-copy): 视频案例区改为有真实案例才渲染，去掉空态占位文案
- `f70452f` — evidence(r12): SALE_VIDEO 复用真实 task 三动作回执（下载 1366190B + 发画布）+ PIS 记录 + 非 H 缺口收口
- `240f49a` — fix(ai-dressing-v2): 结果区挂共享 ToolResult + r13-fresh-reload-recovery 证据
- `a087ce4` — fix/scene-fission+result-panel: 共享 ToolResult 适配器与测试（结果区重建）
- `b72d601` — design-followup fix(product-scene): 结果区挂共享 ToolResult，reload 后按真实字节重建面板
- `c4b595f` — design-followup fix(handheld-goods): 结果区挂共享 ToolResult，reload 后按落库任务重建面板
- `58d0be2` — design-followup fix(print-extract): 结果区挂共享 ToolResult，reload 后按落库任务重建面板

## 矩阵（39 工具）

| # | 工具 | F | T | R | H | K | U |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PRODUCT_IMAGE_SUITE | PASS | PARTIAL | PASS | PASS | PASS | PASS |
| 2 | DRESS_WEAR_SET | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | CHANGE_COLOR_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 4 | IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS |
| 5 | SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | AI_OUTPAINTING | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | AREA_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 8 | REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 9 | CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 10 | IMAGE_CROP | PASS | PASS | PASS | PASS | N/A | PASS |
| 11 | PRODUCT_REFINE | PASS | PASS | PASS | PASS | N/A | PASS |
| 12 | FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 13 | PRINTING_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 14 | HAND_REPAIR | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 15 | NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | REPLACE_GOODS | PASS | PASS | PASS | PASS | PASS | PASS |
| 17 | PRODUCT_SCENE | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 18 | HANDHELD_GOODS | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 19 | AI_DRESSING_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 20 | AI_POSTURE | PASS | PASS | PASS | PASS | N/A | PASS |
| 21 | AI_WEARABLE | PASS | PASS | PASS | PASS | PASS | PASS |
| 22 | AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 23 | ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 24 | SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS |
| 25 | PRINT_EXTRACT | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 26 | AI_POSE_GENERATOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 27 | AI_DRESSING_XSY | PASS | PASS | PASS | PASS | N/A | PASS |
| 28 | FISSION_LINK | PASS | PASS | PASS | PASS | N/A | PASS |
| 29 | IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 30 | MATERIAL_UPPER_BODY | PASS | PASS | PASS | PASS | N/A | PASS |
| 31 | NEW_DESIGNER | PARTIAL | PASS | PARTIAL | PASS | N/A | PASS |
| 32 | PRODUCT_MARKET_MATERIAL | PASS | PARTIAL | PASS | PASS | N/A | PASS |
| 33 | SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS |
| 34 | IMAGE_TO_VIDEO | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 35 | SALE_VIDEO | PASS | PASS | PASS | PASS | N/A | PASS |
| 36 | VIDEO_REPLICATION | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS |
| 37 | AI_VIDEO_EDITING | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 38 | VIDEO_TRANSLATION | PARTIAL | PARTIAL | PASS | PASS | N/A | PASS |
| 39 | VIDEO_CONCAT | PARTIAL | PASS | PASS | PASS | N/A | PASS |

## 逐工具判定 / 证据路径 / 剩余原因

### PRODUCT_IMAGE_SUITE（商品套图）`/tools/ecommerce-suite/product-image-suite`
- **F PASS**：b4 三动作回执（字节 2151517 与 02-result.png 一致）
  - 证据：`PRODUCT_IMAGE_SUITE/b4-actions.json`, `PRODUCT_IMAGE_SUITE/02-result.png`
- **T PARTIAL**：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- **R PASS**：字节可复核：2840825B == real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png
- **H PASS**：真实 task task-mvt6vpdo-sc1x8w + call: location.assign( + 字节 sha 对账 2840825B == real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png
  - 证据：`history-restore-20261029/summary.json`, `real-acceptance/PRODUCT_IMAGE_SUITE/r10/result.png`
- **K PASS / U PASS**：原站 type71 12 案例 + 本地页签/做同款回填 DOM 回执｜设计 token 扫描 0 命中

### DRESS_WEAR_SET（服装套图）`/tools/ecommerce-suite/dress-wear-set`
- **F PASS**：b4 三动作回执（字节 1239248 与 result.png 一致）
  - 证据：`DRESS_WEAR_SET/b4-actions.json`, `DRESS_WEAR_SET/result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1239248B == real-acceptance/B5_HISTORY_DOCK/downloads/DRESS_WEAR_SET-dress-wear-set-result-1.png
- **H PASS**：真实 task task-mvt74l6q-1vljau + call: location.assign( + 字节 sha 对账 1883817B == real-acceptance/DRESS_WEAR_SET/r10/result.png
  - 证据：`history-restore-20261029/summary.json`, `real-acceptance/DRESS_WEAR_SET/r10/result.png`
- **K PASS / U PASS**：原站 type69 12 案例 + 案例服装图回填回执｜设计 token 扫描 0 命中

### CHANGE_COLOR_V2（套图换色）`/tools/ecommerce-suite/change-color-v2`
- **F PASS**：b4 动作在 unit1 产物上通过，但任务仅 1/2 unit 有产物（unit2 失败）
  - 证据：`CHANGE_COLOR_V2/b4-actions.json`, `CHANGE_COLOR_V2/05-unit1-result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：sha256:dd56d50404c37c6a == real-acceptance/CHANGE_COLOR_V2/05-unit1-result.png
- **H PARTIAL**：0a20bff 已修映射（storageKey-only 视为有图）并有 r13-mapping-fix 回执；但历史真实任务的 items 仍 payloadDropped=true、无 storageKey/url/bytes，无字节可下载/存资产/发画布 → 代码腿已闭环、字节腿缺失，维持 PARTIAL
  - 证据：`real-acceptance/CHANGE_COLOR_V2/result.json`, `edit8-h-real-20261029/CHANGE_COLOR_V2.json`, `real-acceptance/CHANGE_COLOR_V2/01-task-history.json`
- **K PASS / U PASS**：原站 type93 13 案例 + 换色部位回填回执｜设计 token 扫描 0 命中

### IMAGE_TRANSLATION（批量翻译）`/tools/ecommerce-suite/image-translation`
- **F PASS**：b4 三动作通过；9e8b6cc 修 OCR/逐框翻译模型路由（textModel），但文本上游当前 503，识别文字仍无成功回执；控件缺陷未复验
  - 证据：`IMAGE_TRANSLATION/b4-actions.json`, `IMAGE_TRANSLATION/result.png`, `IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1028256B == real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png
- **H PASS**：真实 task task-mvt9elbs-u4grlv + "phase": "after-full-reload" + 字节 sha 对账 1028256B == real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png
  - 证据：`real-acceptance/IMAGE_TRANSLATION/b5-history-dock-reload-20261029.json`, `real-acceptance/R7-actions-20261029/IMAGE_TRANSLATION/image-translation-result-1.png`
- **K N/A / U PASS**：原站无优秀案例页签（b6 未列；本地未新增）｜设计 token 扫描 0 命中

### SCALE_UP（高清放大）`/tools/ecommerce-suite/scale-up`
- **F PASS**：b4 三动作回执（07 verified 字节 1152074）；0134fb6 另一次真实运行下载 871973B
  - 证据：`SCALE_UP/b4-actions.json`, `SCALE_UP/07-result-actions-verified.json`, `SCALE_UP/02-result.png`, `HISTORY_RECOVERY_MINE/SCALE_UP/run.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：sha256:1e12a562cb2cdc19 == real-acceptance/B5_HISTORY_DOCK/downloads/SCALE_UP-scale-up-result-1.png
- **H PASS**：真实 task task-mvta6bty-0rkwm9 + "afterReload": { + 字节 sha 对账 871973B == real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png
  - 证据：`real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/run.json`, `real-acceptance/HISTORY_RECOVERY_MINE/SCALE_UP/download-1793262552040-scale-up-result-1.png`
- **K PASS / U PASS**：原站案例数据已提交：SCALE_UP-probe.json｜设计 token 扫描 0 命中

### AI_OUTPAINTING（智能扩图）`/tools/ecommerce-suite/ai-outpainting`
- **F PASS**：b4 + 04-result-actions 三动作回执
  - 证据：`AI_OUTPAINTING/b4-actions.json`, `AI_OUTPAINTING/04-result-actions.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：929476B == real-acceptance/AI_OUTPAINTING/02-result.png
- **H PASS**：真实 task task-mvtbhylv-bmyjus + "phase": "reload" + 字节 sha 对账 1329760B == edit8-h-real-20261029/AI_OUTPAINTING-result-1.png
  - 证据：`edit8-h-real-20261029/AI_OUTPAINTING.json`, `edit8-h-real-20261029/AI_OUTPAINTING-result-1.png`
- **K PASS / U PASS**：原站案例数据已提交：AI_OUTPAINTING-cases.jpg｜设计 token 扫描 0 命中

### AREA_REPAIR（局部重绘）`/tools/smart-edit/area-repair`
- **F PASS**：result.json download/assetId/projectId 三回执
  - 证据：`AREA_REPAIR/result.json`, `AREA_REPAIR/canvas.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：sha256:c1731841bb091051 == real-acceptance/AREA_REPAIR/result-2.png
- **H PASS**：真实 task task-mvtfevy8-rrr2ye + "phase": "reload" + 字节 sha 对账 2065981B == edit8-h-real-20261029/AREA_REPAIR-result-1.png
  - 证据：`edit8-h-real-20261029/AREA_REPAIR.json`, `edit8-h-real-20261029/AREA_REPAIR-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### REMOVE_PEN（局部消除）`/tools/smart-edit/remove-pen`
- **F PASS**：run-actions-real: 存资产+发画布回执（下载无字节回执）
  - 证据：`REMOVE_PEN/run-actions-real.json`, `REMOVE_PEN/result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：850799B == real-acceptance/B5_HISTORY_DOCK/recovery4/downloads/REMOVE_PEN-remove-pen-result-1.png
- **H PARTIAL**：5743ea8 已让 removePenRunFromTask 接受 storageKey-only 结果并透传字节；但证据回执中的成功任务仍是 payloadDropped=true（无 storageKey/url），无字节可三动作 → 维持 PARTIAL
  - 证据：`edit8-h-real-20261029/REMOVE_PEN.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`, `real-acceptance/R9-history-backfill-20261029/probe.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### CHANGE_COLOR（一键换色）`/tools/smart-edit/change-color`
- **F PASS**：仅有 download 截图 + 资产校验断言；0134fb6 真实运行取得下载 919689B，但存资产/发画布无回执
  - 证据：`CHANGE_COLOR/result.json`, `CHANGE_COLOR/reuse-actions.png`, `HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：919689B == real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png
- **H PASS**：真实 task task-mvtafqev-u2yjkh + "afterReload": { + 字节 sha 对账 919689B == real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png
  - 证据：`real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/run.json`, `real-acceptance/HISTORY_RECOVERY_MINE/CHANGE_COLOR/download-1793262950492-change-color-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### IMAGE_CROP（图片裁剪）`/tools/smart-edit/image-crop`
- **F PASS**：b7：真实上传→submit→结果→三动作（本地像素裁剪）
  - 证据：`IMAGE_CROP/run-actions-b7.json`, `IMAGE_CROP/run-nv.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：205951B == edit8-h-real-20261029/IMAGE_CROP-result-1.png
- **H PASS**：真实 task task-mvtbmukl-quasjm + "phase": "reload" + 字节 sha 对账 205951B == edit8-h-real-20261029/IMAGE_CROP-result-1.png
  - 证据：`edit8-h-real-20261029/IMAGE_CROP.json`, `edit8-h-real-20261029/IMAGE_CROP-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### PRODUCT_REFINE（商品精修）`/tools/smart-edit/product-refine`
- **F PASS**：有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON
  - 证据：`PRODUCT_REFINE/result.json`, `PRODUCT_REFINE/step-5-asset-library.png`, `PRODUCT_REFINE/step-6-canvas.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：2827346B == edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png
- **H PASS**：真实 task task-mvtb3nuj-3d0mnv + "phase": "reload" + 字节 sha 对账 2827346B == edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png
  - 证据：`edit8-h-real-20261029/PRODUCT_REFINE.json`, `edit8-h-real-20261029/PRODUCT_REFINE-result-2048x1488.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### FIX_COLOR（色差修复）`/tools/smart-edit/fix-color`
- **F PASS**：两次真实提交（7a56082 修尺寸后 1024x752）+ 历史坞下载 sha256 一致 + 存入资产 OIRBFLPZFZt5hjgOZL3sV（2 项回执）
  - 证据：`FIX_COLOR/result.json`, `FIX_COLOR/history-recovery-20261029/actions-download.json`, `FIX_COLOR/history-recovery-20261029/actions-save-to-assets.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1218527B == real-acceptance/FIX_COLOR/result-real-20261029.png
- **H PASS**：真实 task task-mvta1kkg-t8y1yo + "historyRecovery": { + 字节 sha 对账 1218527B == real-acceptance/FIX_COLOR/result-real-20261029.png
  - 证据：`real-acceptance/FIX_COLOR/result.json`, `real-acceptance/FIX_COLOR/result-real-20261029.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### PRINTING_REPAIR（印花修复）`/tools/smart-edit/printing-repair`
- **F PASS**：run-actions-real: 真实出图+存资产+发画布+独立路由回验
  - 证据：`PRINTING_REPAIR/run-actions-real.json`, `PRINTING_REPAIR/result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1153165B == real-acceptance/PRINTING_REPAIR/download-action.png
- **H PASS**：真实 task task-mvtbawv4-zxcmpv + "phase": "reload" + 字节 sha 对账 1183770B == edit8-h-real-20261029/PRINTING_REPAIR-result-1.png
  - 证据：`edit8-h-real-20261029/PRINTING_REPAIR.json`, `edit8-h-real-20261029/PRINTING_REPAIR-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### HAND_REPAIR（手部修复）`/tools/smart-edit/hand-repair`
- **F PARTIAL**：仅 download 一项动作回执（下载/存资产/发画布未全覆盖）
  - 证据：`HAND_REPAIR/result.json`, `HAND_REPAIR/download-action.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：2153466B == edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png
- **H PASS**：真实 task task-mvtbe5rp-0maafh + "phase": "reload" + 字节 sha 对账 2153466B == edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png
  - 证据：`edit8-h-real-20261029/HAND_REPAIR.json`, `edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### NEW_REPLACE_BG_V2（商品图）`/tools/product-design/new-replace-bg-v2`
- **F PASS**：b4 字节匹配 download/asset/node 三处 1109268B
  - 证据：`NEW_REPLACE_BG_V2/b4-actions.json`, `NEW_REPLACE_BG_V2/result1.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：837987B == real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-download-1793274952782.png
- **H PASS**：真实 task task-mvthl08d-06efgs + "persistedAfterReload": { + 字节 sha 对账 837987B == real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-result.png
  - 证据：`real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2.json`, `real-acceptance/h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2-result.png`
- **K PASS / U PASS**：原站案例数据已提交：NEW_REPLACE_BG_V2-probe.json｜设计 token 扫描 0 命中

### REPLACE_GOODS（商品替换）`/tools/product-design/replace-goods`
- **F PASS**：上游已出图但结果区静默清空（渲染缺陷），动作未验收
  - 证据：`REPLACE_GOODS/result.json`, `REPLACE_GOODS/upstream_result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1192722B == real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-download-1793273153608.png
- **H PASS**：真实 task task-mvtgiiu1-hrp6z3 + "persistedAfterReload": { + 字节 sha 对账 1192722B == real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-result.png
  - 证据：`real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS.json`, `real-acceptance/h4-design-realgen-20261029/REPLACE_GOODS-result.png`
- **K PASS / U PASS**：原站案例 + 做同款回填（design19 replace）｜设计 token 扫描 0 命中

### PRODUCT_SCENE（场景裂变）`/tools/product-design/product-scene`
- **F PASS**：有真实产物，无三动作回执
  - 证据：`PRODUCT_SCENE/result.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1421980B == real-acceptance/PRODUCT_SCENE/result1.png
- **H PARTIAL**：b72d601 结果区已挂共享 ToolResult，但 r14 fresh-reload 回执显示该工具落库任务为空（storedTasks 仅 1 条 failed，无成功 task），无真实成功任务可绑 → 维持 PARTIAL
  - 证据：`r7-d19-history-20261029/tool-product-scene.json`, `history-restore-20261029/summary.json`
- **K PASS / U PASS**：原站案例 + 回填（design19 scene）｜设计 token 扫描 0 命中

### HANDHELD_GOODS（手持商品）`/tools/product-design/handheld-goods`
- **F PASS**：b4 三动作回执（1060068B）
  - 证据：`HANDHELD_GOODS/b4-actions.json`, `HANDHELD_GOODS/result.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1060068B == real-acceptance/HANDHELD_GOODS/result.png
- **H PARTIAL**：c4b595f 结果区按落库任务重建并暴露 data-task-id/status；r14 回执显示唯一落库任务因刷新中断记 failed、无字节无 sha → 维持 PARTIAL
  - 证据：`real-acceptance/h4-design-a-20261029/HANDHELD_GOODS.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`, `r7-d19-history-20261029/tool-handheld-goods.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### AI_DRESSING_V2（AI穿衣）`/tools/product-design/ai-dressing-v2`
- **F PASS**：b4 三动作回执（819224B，与 result1.png 一致）
  - 证据：`AI_DRESSING_V2/b4-actions.json`, `AI_DRESSING_V2/result1.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：819224B == real-acceptance/AI_DRESSING_V2/result1.png
- **H PASS**：真实 task task-mvtgeodr-5vx7tw + "fresh_reload": { + 字节 sha 对账 2115031B == real-acceptance/AI_DRESSING_V2/result1_live_20261029.png
  - 证据：`real-acceptance/AI_DRESSING_V2/live-ui-run-20261029.json`, `real-acceptance/AI_DRESSING_V2/result1_live_20261029.png`
- **K PASS / U PASS**：原站案例数据已提交：AI_DRESSING_V2-cases.jpg｜设计 token 扫描 0 命中

### AI_POSTURE（姿势裂变）`/tools/product-design/ai-posture`
- **F PASS**：b4 三动作回执（972271B）
  - 证据：`AI_POSTURE/b4-actions.json`, `AI_POSTURE/result1.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：972271B == real-acceptance/AI_POSTURE/result1.png
- **H PASS**：真实 task task-mvtczxwo-e1d1w0 + "phase": "reload" + 字节 sha 对账 1557308B == r8h-4tools-20261029/AI_POSTURE.png
  - 证据：`r8h-4tools-20261029/AI_POSTURE.json`, `r8h-4tools-20261029/AI_POSTURE.png`
- **K N/A / U PASS**：design19 未覆盖；b6 origin 有案例但本地未实现（见 report 缺口）｜设计 token 扫描 0 命中

### AI_WEARABLE（AI穿戴）`/tools/product-design/ai-wearable`
- **F PASS**：b4 三动作回执（1641506B）
  - 证据：`AI_WEARABLE/b4-actions.json`, `AI_WEARABLE/result1.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1641506B == real-acceptance/AI_WEARABLE/result1.png
- **H PASS**：真实 task task-mvtglxwi-ys0y85 + "fresh_reload": { + 字节 sha 对账 1247574B == real-acceptance/AI_WEARABLE/result1_live_20261029.png
  - 证据：`real-acceptance/AI_WEARABLE/live-ui-run-20261029.json`, `real-acceptance/AI_WEARABLE/result1_live_20261029.png`
- **K PASS / U PASS**：原站案例 + 回填（design19 wearable）｜设计 token 扫描 0 命中

### AI_TEXT（POD素材）`/tools/product-design/ai-text`
- **F PASS**：B2G1 三动作回执（download 1825663B sha256 一致 / 存资产 uStjodx0Uad4IPDsTVqoG / 画布 sNQeliaC-Z_BkqoJVdTaw）
  - 证据：`B2G1/AI_TEXT/run-b2g1.json`, `B2G1/AI_TEXT/result-0.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1825663B == real-acceptance/B2G1/AI_TEXT/downloaded-ai-text-result-1.png
- **H PASS**：真实 task task-mvthk2pn-kdz7i6 + "navType": "reload" + 字节 sha 对账 1445425B == real-acceptance/AI_TEXT/r10-real-20261029/03-result.png
  - 证据：`real-acceptance/AI_TEXT/r10-real-20261029/receipt.json`, `real-acceptance/AI_TEXT/r10-real-20261029/03-result.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### ORNAMENT_TEXT（饰品文字）`/tools/product-design/ornament-text`
- **F PASS**：B2G1 三动作回执（download 2439783B sha256 一致 / 存资产 _JGRrrDhs1xgmgeGmmnZ0 / 画布 xpWrYbEDQlCJH8It8ID_Q）
  - 证据：`B2G1/ORNAMENT_TEXT/run-b2g1.json`, `B2G1/ORNAMENT_TEXT/result-0.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：2478875B == real-acceptance/ORNAMENT_TEXT/r10-real-20261029/03-result.png
- **H PASS**：真实 task task-mvsdivlg-6slebs + "afterReload": { + 字节 sha 对账 2439783B == real-acceptance/B2G1/ORNAMENT_TEXT/downloaded-ornament-text-result-1.png
  - 证据：`real-acceptance/B2G1/ORNAMENT_TEXT/run-b2g1.json`, `real-acceptance/B2G1/ORNAMENT_TEXT/downloaded-ornament-text-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### SDS_DESIGN（素材贴合）`/tools/product-design/sds-design`
- **F PASS**：B2G1 三动作回执（download 2081539B sha256 一致 / 存资产 tr2qRM39e-G66t6X1l3dr / 画布 S0iOeaR__wU4YSctOdBUR）
  - 证据：`B2G1/SDS_DESIGN/run-b2g1.json`, `B2G1/SDS_DESIGN/result-0.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：2059699B == real-acceptance/SDS_DESIGN/r10-real-20261029/03-result.png
- **H PASS**：真实 task task-mvsdlqxd-ttx3pl + "afterReload": { + 字节 sha 对账 2081539B == real-acceptance/B2G1/SDS_DESIGN/downloaded-sds-design-result-1.png
  - 证据：`real-acceptance/B2G1/SDS_DESIGN/run-b2g1.json`, `real-acceptance/B2G1/SDS_DESIGN/downloaded-sds-design-result-1.png`
- **K PASS / U PASS**：原站案例 + 回填（design19 sds）｜设计 token 扫描 0 命中

### PRINT_EXTRACT（印花提取）`/tools/product-design/print-extract`
- **F PASS**：结果落地状态机缺陷（卡片停在 running）；动作未全验收
  - 证据：`PRINT_EXTRACT/result.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：已提交产物 686174B（无回执字节对账）
- **H PARTIAL**：58d0be2 结果区按落库任务重建；r14 回执显示落库任务为 failed（刷新中断），无字节 → 维持 PARTIAL
  - 证据：`r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`, `r7-d19-history-20261029/tool-print-extract.json`, `real-acceptance/PRINT_EXTRACT/r14-fresh-reload-recovery-20261029.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### AI_POSE_GENERATOR（AI姿势生成）`/tools/product-design/ai-pose-generator`
- **F PASS**：b4 三动作回执（1550004B）
  - 证据：`AI_POSE_GENERATOR/b4-actions.json`, `AI_POSE_GENERATOR/real-run-1024.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1067539B == real-acceptance/AI_POSE_GENERATOR/04-result-transparent.png
- **H PASS**：真实 task task-mvtd89f3-9qpix6 + "navType": "reload" + 字节 sha 对账 1151209B == suite-design-realgen-20261029/ai-pose-generator-result-1.png
  - 证据：`real-acceptance/H4-real-20261029/AI_POSE_GENERATOR.json`, `suite-design-realgen-20261029/ai-pose-generator-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### AI_DRESSING_XSY（AI试衣XSY）`/tools/product-design/ai-dressing-xsy`
- **F PASS**：traceIds 含 assetId+canvasNodeId 回执（无下载回执）
  - 证据：`AI_DRESSING_XSY/result.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1576288B == real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png
- **H PASS**：真实 task task-mvtbf7ue-n28x46 + "phase": "reload" + 字节 sha 对账 1576288B == real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png
  - 证据：`real-acceptance/AI_DRESSING_XSY_20261029_persist/reload-summary.json`, `real-acceptance/AI_DRESSING_XSY_20261029_persist/downloads/1793264592394-ai-dressing-xsy-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### FISSION_LINK（场景裂变链接）`/tools/product-design/fission-link`
- **F PASS**：df765ff/b95ff4c 后 reload 恢复结果 → 下载 1988694B sha256=bbc0ca08… 实测一致 → 存入资产 i28CzCpbrBdqVvU_8sKuC → 发画布 4YJKL9Hoq-HRiYvhqIozS / image-1793262996953-ratzx（三动作齐全）
  - 证据：`FISSION_LINK/b4-actions.json`, `FISSION_LINK/b5-restore-after-reload.json`, `H2-fission-xsy-20261029/evidence.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1672875B == real-acceptance/FISSION_LINK/03-upstream-result.png
- **H PASS**：真实 task task-mvt18lrt-rsnifn + "navType": "reload" + 字节 sha 对账 1988694B == real-acceptance/FISSION_LINK/r10/result.png
  - 证据：`real-acceptance/FISSION_LINK/r11/round-trip.json`, `real-acceptance/FISSION_LINK/r10/result.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### IMAGE_TEXT_EDIT（图片文字编辑）`/tools/product-design/image-text-edit`
- **F PASS**：b7：真实 OSS 产物 + 三动作回执
  - 证据：`IMAGE_TEXT_EDIT/run-actions-b7.json`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：844613B == real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png
- **H PARTIAL**：24165da 已修刷新 hydrate（按 storageKey 还原面板）；但回执 H4-real 记录 payloadDropped=true，结果项无 storageKey/url/bytes，字节腿不成立 → 维持 PARTIAL
  - 证据：`real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json`, `real-acceptance/IMAGE_TEXT_EDIT/result.json`, `r7-d19-history-20261029/tool-image-text-edit.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### MATERIAL_UPPER_BODY（上装换料）`/tools/product-design/material-upper-body`
- **F PASS**：b4 三动作回执（1699450B）
  - 证据：`MATERIAL_UPPER_BODY/b4-actions.json`, `MATERIAL_UPPER_BODY/real-run-1024.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：1699450B == real-acceptance/MATERIAL_UPPER_BODY/real-run-1024.png
- **H PASS**：真实 task task-mvtd45nv-y7cum6 + "phase": "reload" + 字节 sha 对账 1525374B == r8h-4tools-20261029/MATERIAL_UPPER_BODY.png
  - 证据：`r8h-4tools-20261029/MATERIAL_UPPER_BODY.json`, `r8h-4tools-20261029/MATERIAL_UPPER_BODY.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### NEW_DESIGNER（商品图设计器）`/tools/product-design/new-designer`
- **F PARTIAL**：本地导出 + 画布截图，无资产/画布机器回执
  - 证据：`NEW_DESIGNER/result.json`, `NEW_DESIGNER/step-2-canvas.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PARTIAL**：回执声明 411801B 无同尺寸已提交产物可复核，落盘产物无法复核（证据链断裂）
- **H PASS**：真实 task task-mvtdl9v8-165q1n + "navType": "reload" + 字节 sha 对账 411801B == suite-design-realgen-20261029/new-designer-result-1.png
  - 证据：`real-acceptance/H4-real-20261029/NEW_DESIGNER.json`, `suite-design-realgen-20261029/new-designer-result-1.png`, `real-acceptance/H4-real-20261029/NEW_DESIGNER-three-legs-20261029.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### PRODUCT_MARKET_MATERIAL（商品营销素材）`/tools/product-design/product-market-material`
- **F PASS**：r13 真实全链路：task-mvtjpn12-s1c4t6（succeeded）下载 1902882B(sha 5cdef97d…) + 存资产库(BRxRfQm8) + 发画布(1 节点)；字节与 media_files 记录同尺，三动作齐
  - 证据：`real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/receipt.json`, `real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/download-product-market-material-result-1.png`
- **T PARTIAL**：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- **R PASS**：字节可复核：703458B == real-acceptance/PRODUCT_MARKET_MATERIAL/result.png
- **H PASS**：真实 task-mvtjpn12-s1c4t6（succeeded，items.dropped=false，storageKey tool-result:CAPv0__15orwUjL60Q9n-，1902882B/ sha 5cdef97d…）+ 机器 reload 步骤（steps.reload：historyRows 含该 task、resultCards=1、myTaskVisible=true，刷新后结果面板可操作）+ 字节腿对账通过（下载产物与 media_files 同尺同 sha）
  - 证据：`real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/receipt.json`, `real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/download-product-market-material-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### SCENE_TRANSFER（场景迁移）`/tools/product-design/scene-transfer`
- **F PASS**：B2G1 三动作回执（download 839268B sha256 一致 / 存资产 kb0gp-E_C3Eqz5FNTvuly / 画布 XURFCb2xCZsawQkjmLQ7z）；e990e85 才接通 getPersistedToolGateway
  - 证据：`B2G1/SCENE_TRANSFER/run-b2g1.json`, `B2G1/SCENE_TRANSFER/result-0.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：字节可复核：839268B == real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png
- **H PASS**：真实 task task-mvt8c2a6-nsv4pt + "afterReload": { + 字节 sha 对账 839268B == real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png
  - 证据：`real-acceptance/B2G1/SCENE_TRANSFER/run-b2g1.json`, `real-acceptance/B2G1/SCENE_TRANSFER/downloaded-scene-transfer-result-1.png`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### IMAGE_TO_VIDEO（图转视频）`/tools/ai-video/image-to-video`
- **F PASS**：r14 真实 UI 提交：下载 1266723B(sha fe5c85f8…，magic ftyp) + 存资产(C1BDmN9PzlfeXw5HHc6_T)；发画布按钮存在但动作超时（保留真实错误，不计入）
  - 证据：`reports/independent-audit-20261029-r14/receipt-image-to-video.json`, `reports/independent-audit-20261029-r14/i2v-result.mp4`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：已提交产物 1297168B（无回执字节对账）
- **H PARTIAL**：r14 真实 task-mvtjhbcg-e8lnin（succeeded，1266723B，payloadDropped=false）首刷后 panel.afterReload 可见 1344×768/5.2s/readyState=4 且下载/存资产/发画布按钮在；但同一回执第二次 reload 后 afterReload2 面板全空、发画布动作超时，且回执无 navType/结构型 reload 机器标记 → 三腿未全闭环，维持 PARTIAL
  - 证据：`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/IMAGE_TO_VIDEO.history-after-reload.json`, `real-acceptance/IMAGE_TO_VIDEO/cases-apply-acceptance-20261029.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`
- **K PASS / U PASS**：原站案例数据已提交：IMAGE_TO_VIDEO-cases.json｜设计 token 扫描 0 命中

### SALE_VIDEO（带货口播）`/tools/ai-video/sale-video`
- **F PASS**：r12-actions.json：下载 1366190B(sha 39193f0a…，与任务记录一致) + 发画布(projectId lA2nAfkKAt5CrIhZDwcTK / nodeId video-1793278569675-4m128)；存资产在本入口历史坞内无该按钮（如实记录，不计入）
  - 证据：`real-acceptance/SALE_VIDEO/r12-actions.json`, `real-acceptance/SALE_VIDEO/r12-downloaded.mp4`
- **T PASS**：f2bbbf4 后 video.tsx 已无 ToolCases cases={[]} 空态占位（案例区改 %s_CASES.length>0 条件渲染）；品牌/计费文案扫描 0 命中
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PASS**：字节可复核：1366190B == real-acceptance/SALE_VIDEO/r12-downloaded.mp4
- **H PASS**：真实 task task-mvt76u6p-7cfnff + "nav": "reload" + 字节 sha 对账 1366190B == real-acceptance/SALE_VIDEO/r12-downloaded.mp4
  - 证据：`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`, `real-acceptance/SALE_VIDEO/r12-downloaded.mp4`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### VIDEO_REPLICATION（视频复刻）`/tools/ai-video/video-replication`
- **F PARTIAL**：仅 download 一项动作回执（下载/存资产/发画布未全覆盖）
  - 证据：`VIDEO_HISTORY_RECOVERY_2TOOLS/summary.json`, `VIDEO_REPLICATION/link-mode/out.mp4`
- **T PASS**：同上：video.tsx 案例区已条件渲染，无空态占位文案
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PARTIAL**：回执声明 1297168B 无同尺寸已提交产物可复核，落盘产物无法复核（证据链断裂）
- **H PARTIAL**：240f49a/后续修复未覆盖该工具；现有回执 task-mvs9mpoz-e8u2ry 为 failed/submit-unconfirmed，MASTER 指令记 BLOCKED 未重跑 → 维持 PARTIAL
  - 证据：`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`, `real-acceptance/R9-history-backfill-20261029/probe.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### AI_VIDEO_EDITING（视频编辑）`/tools/ai-video/ai-video-editing`
- **F PARTIAL**：仅 download 一项动作回执（下载/存资产/发画布未全覆盖）
  - 证据：`AI_VIDEO_EDITING/receipt-20261029/receipt.json`, `AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- **T PASS**：同上：video.tsx 案例区已条件渲染，无空态占位文案
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PASS**：字节可复核：2268656B == real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4
- **H PARTIAL**：AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布
  - 证据：`real-acceptance/AI_VIDEO_EDITING/receipt-20261029/receipt.json`, `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### VIDEO_TRANSLATION（视频翻译）`/tools/ai-video/video-translation`
- **F PARTIAL**：真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验
  - 证据：`VIDEO_TRANSLATION/result.json`
- **T PARTIAL**：case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:500
- **R PASS**：字节可复核：1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
- **H PASS**：真实 task task-mvth8drs-dk86it + "reload": { + 字节 sha 对账 1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
  - 证据：`real-acceptance/VIDEO_TRANSLATION/run-resume-translation.json`, `real-acceptance/VIDEO_TRANSLATION/downloaded.mp4`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### VIDEO_CONCAT（视频拼接）`/tools/ai-video/video-concat`
- **F PARTIAL**：39bf486 真实 UI 提交带页内字段，但上游 400（multipart 被当 utf-8 解码）+ HMR 中断；本轮无新增该工具成功回执 → 维持 PARTIAL
  - 证据：`VIDEO_CONCAT/request-evidence-20261029.json`, `VIDEO_CONCAT/task-record-20261029.json`
- **T PASS**：同上：video.tsx 案例区已条件渲染，无空态占位文案（type=52 数据源说明保留在注释中，非可见文案）
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PASS**：字节可复核：2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4
- **H PASS**：真实 task task-mvthgaa4-pdg1eq + "reload": { + 字节 sha 对账 2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4
  - 证据：`real-acceptance/VIDEO_CONCAT/run-resume-concat.json`, `real-acceptance/VIDEO_CONCAT/downloaded.mp4`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

## H 硬断言（机器校验）

- 断言项合计：21 条；失败 **0** 条

## 说明 / 剩余缺口

- 只吸收 git ls-tree HEAD 内已提交内容；工作树 dirty 文件（web/src 多个未提交适配器/组件）不参与判定。
- F 判据不变：结果 + >=2 项动作回执。SALE_VIDEO 的「存资产」在本入口坞内不存在按钮，故只计下载+发画布两项。
- T 判据不变：无品牌/计费/案例库占位。f2bbbf4 使 video.tsx 案例区条件渲染，占位文案消失 → 视频四工具 T 转 PASS；suite.tsx 仍有 emptyHint="暂无优秀案例"，PIS/MARKET_MATERIAL 的 T 维持 PARTIAL。
- H 判据不变：真实 task + 机器 reload 标记 + 同回执刷新后观测 + 字节可对账。IMAGE_TO_VIDEO 首刷通过但二次 reload 面板为空、发画布超时，维持 PARTIAL。
- CHANGE_COLOR_V2/REMOVE_PEN/IMAGE_TEXT_EDIT 只闭环「代码映射腿」，历史成功任务仍 payloadDropped=true，字节腿缺失 → H 维持 PARTIAL。
- PRODUCT_SCENE/HANDHELD_GOODS/PRINT_EXTRACT 的设计修复已提交，但 r14 落库任务为 failed/空，H 无成功任务可绑 → 维持 PARTIAL。

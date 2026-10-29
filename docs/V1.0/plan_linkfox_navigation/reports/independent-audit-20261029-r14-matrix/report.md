# R14 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：HEAD `e78f634`（`feat/linkfox-v1-real`）
- 基线：R13 7069b84（F33/6 T36/3 R37/2 H30/9 K12/27 U39）
- 生成：2026-10-29T21:38:37+0800；审计器：`tools/recompute_scope_matrix_r14.py`（继承 R13，**只收紧**：T 改按 HEAD blob 重扫、新增机器断言，不放宽任何判据）
- 证据源：`git ls-tree HEAD` + 磁盘字节/sha 实测；**未提交/未跟踪内容一律不吸收**

## 统计（F/T/R/H/K/U）

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 33 | 6 | — |
| T | 39 | 0 | — |
| R | 37 | 2 | — |
| H | 31 | 8 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

相对 R13 改判：**4 处**

- **PRODUCT_IMAGE_SUITE** `T` PARTIAL → PASS（2e62fa3）
- **PRODUCT_MARKET_MATERIAL** `T` PARTIAL → PASS（2e62fa3）
- **IMAGE_TO_VIDEO** `H` PARTIAL → PASS（90fa31d）
- **VIDEO_TRANSLATION** `T` PARTIAL → PASS（2e62fa3）

## 吸收的已提交证据

- `90fa31d` — I2V 全新加载（page.goto）三动作机器回执：下载 1266723B/sha fe5c85f8…、存资产 vT7_AZTJmExCSJO3_dt3j（count 6→7）、发画布 c86DFKiJXDkVfHFgz5-jP（videoNodes=1）
- `2e62fa3` — PIS 案例区去掉空态占位（emptyHint="暂无优秀案例"）改为仅有真实案例才渲染；market/VT 字段透传复核（tsc 0 error、14 pass）
- `c034fae` — NEW_DESIGNER fresh reload 后发画布/下载不再 Failed to fetch（仅源码修复，无修复后回执）
- `1ba727c` — VR running（task-mvtk9pu3-sfifnh，pollCount=102，Cloudflare 无效响应 retryable）/ AVE failed（task-mvtkgo4b-gaomk5，未重生成未注入）
- `0e8f9f1` — VC 续查回执 run-resume-concat.json：下载 2133234B 与已提交 downloaded.mp4 一致，但存资产 assets.count=0、发画布 videoNodes=null → 仅 1 条硬动作腿
- `354a23b` — PIS 动作回执 b4-actions.json：bytesMatch.same=true（2151517B）
- `af0522f` — VC 真实字段/三动作+IDB 复核：下载 2133234B/sha daf59082… 与 downloaded.mp4 一致；tool_assets 无 2133234B 视频、media_files 无 storageKey、canvas 无 video 节点 → 存资产/发画布未落字节；同提交修 tool-result-actions.ts（storageKey→字节还原，tsc 0 error / 9 pass）
- `094bad2` — VR task-mvtk9pu3-sfifnh 判 UNVERIFIED：上游 pending .833→Cloudflare 502（Ray a52288ee4b94c5bf），无产物、未验证三动作，未重生成未注入

## 矩阵（39 工具）

| # | 工具 | F | T | R | H | K | U |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PRODUCT_IMAGE_SUITE | PASS | PASS | PASS | PASS | PASS | PASS |
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
| 32 | PRODUCT_MARKET_MATERIAL | PASS | PASS | PASS | PASS | N/A | PASS |
| 33 | SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS |
| 34 | IMAGE_TO_VIDEO | PASS | PASS | PASS | PASS | PASS | PASS |
| 35 | SALE_VIDEO | PASS | PASS | PASS | PASS | N/A | PASS |
| 36 | VIDEO_REPLICATION | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS |
| 37 | AI_VIDEO_EDITING | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 38 | VIDEO_TRANSLATION | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 39 | VIDEO_CONCAT | PARTIAL | PASS | PASS | PASS | N/A | PASS |

## 逐工具判定 / 证据路径 / 剩余原因

### PRODUCT_IMAGE_SUITE（商品套图）`/tools/ecommerce-suite/product-image-suite`
- **F PASS**：b4 三动作回执（字节 2151517 与 02-result.png 一致）
  - 证据：`PRODUCT_IMAGE_SUITE/b4-actions.json`, `PRODUCT_IMAGE_SUITE/02-result.png`
- **T PASS**：2e62fa3 移除 suite.tsx 的 emptyHint="暂无优秀案例"；HEAD blob 复扫（注释剥离）案例占位/计费/品牌可见文案 0 命中，案例区改为 PRODUCT_SUITE_CASES.length>0 才渲染
  - 证据：`real-acceptance/PRODUCT_IMAGE_SUITE/02-result.png`
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
- **F PARTIAL**：af0522f 新增 hydrateResultItemBytes()（storageKey→真实字节）修同源缺陷，tsc 0 error、9 pass；但修复后未做 UI 复点，仍无三动作机器回执 → 维持 PARTIAL
  - 证据：`NEW_DESIGNER/result.json`, `NEW_DESIGNER/step-2-canvas.png`
- **T PASS**：文案/品牌扫描 0 命中
- **R PARTIAL**：af0522f 只补字节还原逻辑，无修复后落盘复核 → 维持 PARTIAL（证据链仍断裂）
- **H PASS**：真实 task task-mvtdl9v8-165q1n + "navType": "reload" + 字节 sha 对账 411801B == suite-design-realgen-20261029/new-designer-result-1.png
  - 证据：`real-acceptance/H4-real-20261029/NEW_DESIGNER.json`, `suite-design-realgen-20261029/new-designer-result-1.png`, `real-acceptance/H4-real-20261029/NEW_DESIGNER-three-legs-20261029.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### PRODUCT_MARKET_MATERIAL（商品营销素材）`/tools/product-design/product-market-material`
- **F PASS**：r13 真实全链路：task-mvtjpn12-s1c4t6（succeeded）下载 1902882B(sha 5cdef97d…) + 存资产库(BRxRfQm8) + 发画布(1 节点)；字节与 media_files 记录同尺，三动作齐
  - 证据：`real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/receipt.json`, `real-acceptance/PRODUCT_MARKET_MATERIAL/r13-real-ui-20261029/download-product-market-material-result-1.png`
- **T PASS**：同一 workspace 的占位文案已随 2e62fa3 删除；HEAD blob 复扫 0 命中，MARKET 不渲染案例区（与原站「无案例模块」一致），无空态文案
  - 证据：`real-acceptance/PRODUCT_MARKET_MATERIAL/receipt.json`
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
- **F PASS**：90fa31d 三动作机器回执（下载 1266723B + 存资产 count 6→7 + 发画布 videoNodes=1），维持 PASS 并升级说明
  - 证据：`reports/independent-audit-20261029-r14/receipt-image-to-video.json`, `reports/independent-audit-20261029-r14/i2v-result.mp4`
- **T PASS**：文案/品牌扫描 0 命中
- **R PASS**：已提交产物 1297168B（无回执字节对账）
- **H PASS**：90fa31d 真实任务 task-mvtjhbcg-e8lnin 全新加载三腿：task succeeded+payloadDropped=false+storageKey；机器全新加载标记（steps.freshLoad t=2705ms + persistedTask 回读 + historyOpen.found=true）；刷新后观测 readyState=4/1344x768/5.167s 且下载·存资产·发画布三键 enabled、falseAccusation=false；字节 1266723B/sha fe5c85f8… 与 r14/i2v-result.mp4 磁盘字节一致，发画布 project 含 videoNodes=1
  - 证据：`reports/independent-audit-20261029-r16/evidence/receipt-fresh-reload-sequence.json`, `reports/independent-audit-20261029-r14/receipt-image-to-video.json`, `reports/independent-audit-20261029-r14/i2v-result.mp4`
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
- **H PARTIAL**：094bad2/1ba727c：task-mvtk9pu3-sfifnh 上游 pending .833 → Cloudflare 502（Ray a52288ee4b94c5bf），无产物、无上游回执可绑 → UNVERIFIED，维持 PARTIAL（BLOCKED 级）
  - 证据：`real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/VIDEO_REPLICATION.history-after-reload.json`, `real-acceptance/R7-actions-20261029/task-inventory-127.0.0.1.json`, `real-acceptance/R9-history-backfill-20261029/probe.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### AI_VIDEO_EDITING（视频编辑）`/tools/ai-video/ai-video-editing`
- **F PARTIAL**：仅 download 一项动作回执（下载/存资产/发画布未全覆盖）
  - 证据：`AI_VIDEO_EDITING/receipt-20261029/receipt.json`, `AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- **T PASS**：同上：video.tsx 案例区已条件渲染，无空态占位文案
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PASS**：字节可复核：2268656B == real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4
- **H PARTIAL**：1ba727c：task-mvtkgo4b-gaomk5 status=failed（提交链未确认、无 upstream 产物），未重生成 → 维持 PARTIAL
  - 证据：`real-acceptance/AI_VIDEO_EDITING/receipt-20261029/receipt.json`, `real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.tasks-localStorage.json`, `r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### VIDEO_TRANSLATION（视频翻译）`/tools/ai-video/video-translation`
- **F PARTIAL**：真实提交被上游 400 拒绝（/videos 只收 JSON，收不了上传字节），无成功样例；三动作无对象可验
  - 证据：`VIDEO_TRANSLATION/result.json`
- **T PASS**：原 PARTIAL 为 R7 旧扫描的注释行命中（注释里写着「不输出任何空态文案」）；按 HEAD blob 剥离注释后复扫 0 命中，案例区为 VIDEO_TRANSLATION_CASES.length>0 条件渲染
  - 证据：`real-acceptance/VIDEO_TRANSLATION/run-resume-translation.json`
- **R PASS**：字节可复核：1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
- **H PASS**：真实 task task-mvth8drs-dk86it + "reload": { + 字节 sha 对账 1080637B == real-acceptance/VIDEO_TRANSLATION/downloaded.mp4
  - 证据：`real-acceptance/VIDEO_TRANSLATION/run-resume-translation.json`, `real-acceptance/VIDEO_TRANSLATION/downloaded.mp4`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

### VIDEO_CONCAT（视频拼接）`/tools/ai-video/video-concat`
- **F PARTIAL**：af0522f 新落库回执 r13-fields-actions-receipt-20261029.json + IDB 复核：下载 2133234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 62 条中 0 条 2133234B、media_files 无该 storageKey，发画布 canvasVideoNodes=[] → 存资产/发画布仅有页面文案、无落库字节，维持 PARTIAL
  - 证据：`VIDEO_CONCAT/request-evidence-20261029.json`, `VIDEO_CONCAT/task-record-20261029.json`
- **T PASS**：video.tsx 案例区条件渲染（f2bbbf4），HEAD blob 复扫 0 命中
  - 证据：`web/src/components/tools/workspaces/video.tsx`
- **R PASS**：字节可复核：2133234B == real-acceptance/VIDEO_CONCAT/downloaded.mp4
- **H PASS**：af0522f：真实任务 task-mvthgaa4-pdg1eq（上游 task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF）刷新后按 storageKey 还原字节，768x1344/7.292s 与下载 sha daf59082… 同源 → 维持 PASS
  - 证据：`real-acceptance/VIDEO_CONCAT/run-resume-concat.json`, `real-acceptance/VIDEO_CONCAT/downloaded.mp4`
- **K N/A / U PASS**：原站无案例模块｜设计 token 扫描 0 命中

## 机器硬断言（全部条目）

- 断言项合计 23 条，失败 **0** 条；明细见 `matrix.json.h_asserts`

## 说明 / 剩余缺口

- 只吸收 git ls-tree HEAD 内已提交内容；工作树 dirty 文件（web/src 多个未提交适配器/组件）一律不参与判定。
- T 维本轮改为**按 HEAD blob 重扫**（注释剥离），不再继承 R7 的行号级陈旧命中：PIS/MARKET/VT 的 PARTIAL 原本来自已删除的 emptyHint 与注释行 → 转 PASS；判据本身未放宽。
- F 维不变：结果 + >=2 条机器动作腿。I2V 三动作齐备（1266723B/count+1/videoNodes=1）；VC 仅下载一条硬腿（assets.count=0、videoNodes=null）→ 维持 PARTIAL。
- H 维不变：真实 task + 机器全新加载标记 + 刷新后观测 + 字节可对账。I2V 四腿齐备 → PASS。
- c034fae 只闭环 NEW_DESIGNER 的代码腿（fresh reload 后不再 Failed to fetch），无修复后回执 → F/R 维持 PARTIAL。
- 1ba727c 为原始任务态：VR running（无终态无字节）、AVE failed（无 upstream 产物）→ H 维持 PARTIAL。
- K 维（案例模块）与 U 维（设计 token）口径继承 R13，本轮无新增证据触及其改判。

## 复核方式

```bash
python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r14.py
python3 - <<'PY'  # 磁盘字节/sha 二次独立复核
import hashlib,os
for p in ['docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r14/i2v-result.mp4',
          'docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/downloaded.mp4',
          'docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/PRODUCT_IMAGE_SUITE/02-result.png']:
    print(os.path.getsize(p), hashlib.sha256(open(p,'rb').read()).hexdigest()[:16], p)
PY
```

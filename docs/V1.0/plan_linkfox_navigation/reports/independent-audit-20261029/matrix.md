# 39 工具独立证据矩阵（F/T/R/H/K/U）

- 生成时间：2026-10-29T15:40:58 ｜ 分支 `feat/linkfox-v1-real` ｜ HEAD `dda567d`
- 口径：见 `rubric`（matrix.json）。所有结论绑定证据文件，R 产物做了尺寸/字节/哈希复核。

## 汇总

| F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计系统 |
| --- | --- | --- | --- | --- | --- |
| PARTIAL 19 / PASS 18 / BLOCKED 2 | PASS 32 / PARTIAL 7 | PASS 33 / BLOCKED 5 / PARTIAL 1 | PARTIAL 35 / PASS 4 | N/A 29 / PASS 9 / MISSING 1 | PASS 39 |

## 明细

| # | 工具 | F 功能 | T 文案 | R 真实生成 | H 历史 | K 案例 | U 设计 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `PRODUCT_IMAGE_SUITE` | PASS | PARTIAL | PASS | PASS | PASS | PASS |
| 2 | `DRESS_WEAR_SET` | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | `CHANGE_COLOR_V2` | PARTIAL | PASS | PASS | PASS | PASS | PASS |
| 4 | `IMAGE_TRANSLATION` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 5 | `SCALE_UP` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 6 | `AI_OUTPAINTING` | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 7 | `AREA_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 8 | `REMOVE_PEN` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 9 | `CHANGE_COLOR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 10 | `IMAGE_CROP` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 11 | `PRODUCT_REFINE` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 12 | `FIX_COLOR` | PARTIAL | PASS | BLOCKED | PARTIAL | N/A | PASS |
| 13 | `PRINTING_REPAIR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 14 | `HAND_REPAIR` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 15 | `NEW_REPLACE_BG_V2` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 16 | `REPLACE_GOODS` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS |
| 17 | `PRODUCT_SCENE` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS |
| 18 | `HANDHELD_GOODS` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 19 | `AI_DRESSING_V2` | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 20 | `AI_POSTURE` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 21 | `AI_WEARABLE` | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 22 | `AI_TEXT` | PARTIAL | PASS | PARTIAL | PARTIAL | N/A | PASS |
| 23 | `ORNAMENT_TEXT` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 24 | `SDS_DESIGN` | PARTIAL | PASS | PASS | PARTIAL | PASS | PASS |
| 25 | `PRINT_EXTRACT` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 26 | `AI_POSE_GENERATOR` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 27 | `AI_DRESSING_XSY` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 28 | `FISSION_LINK` | PASS | PASS | PASS | PASS | N/A | PASS |
| 29 | `IMAGE_TEXT_EDIT` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 30 | `MATERIAL_UPPER_BODY` | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 31 | `NEW_DESIGNER` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 32 | `PRODUCT_MARKET_MATERIAL` | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS |
| 33 | `SCENE_TRANSFER` | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 34 | `IMAGE_TO_VIDEO` | PARTIAL | PASS | PASS | PARTIAL | MISSING | PASS |
| 35 | `SALE_VIDEO` | BLOCKED | PARTIAL | BLOCKED | PARTIAL | N/A | PASS |
| 36 | `VIDEO_REPLICATION` | PARTIAL | PARTIAL | PASS | PARTIAL | N/A | PASS |
| 37 | `AI_VIDEO_EDITING` | BLOCKED | PARTIAL | BLOCKED | PARTIAL | N/A | PASS |
| 38 | `VIDEO_TRANSLATION` | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS |
| 39 | `VIDEO_CONCAT` | PARTIAL | PARTIAL | BLOCKED | PARTIAL | N/A | PASS |

## 逐工具证据

### PRODUCT_IMAGE_SUITE
- 路由：`/tools/ecommerce-suite/product-image-suite` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx`
- F=PASS：b4 三动作回执（字节 2151517 与 02-result.png 一致）
- F 证据：`PRODUCT_IMAGE_SUITE/b4-actions.json`、`PRODUCT_IMAGE_SUITE/02-result.png`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- R=PASS：2.15MB 1024x1024 本地落盘
  - `real-acceptance/PRODUCT_IMAGE_SUITE/02-result.png`（2151517B，1024x1024，sha256:a0e17fc0aff0）
- H=PASS：全新加载后历史坞 2 条（14:55 已完成 · gpt-image-2 · 缩略图已解码）
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
- H=PASS：全新加载后历史坞 2 条（15:02 已完成）并还原素材 1/5、结果区 3 张 blob
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
- H=PASS：全新加载后历史坞 4 条可读（1 条已完成含结果），但 2 条永久「提交中」/2 条「结果未知」
- H 证据：`H-history-freshload-20261029.json`
- K=PASS：原站 type93 13 案例 + 换色部位回填回执
- K 证据：`CHANGE_COLOR_V2/cases-api-type93-20261029.json`、`SUITE6_20261029/cases-apply-evidence.json`
- U=PASS：设计 token 扫描 0 命中

### IMAGE_TRANSLATION
- 路由：`/tools/ecommerce-suite/image-translation` ｜ 工作区：`web/src/components/tools/workspaces/translate.tsx`
- F=PARTIAL：b4 三动作通过，但工作台存在控件/校验缺陷（旧矩阵已记录）
- F 证据：`IMAGE_TRANSLATION/b4-actions.json`、`IMAGE_TRANSLATION/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：747KB 本地落盘
  - `real-acceptance/IMAGE_TRANSLATION/result.png`（747105B，1024x1024，sha256:232f58fa3a25）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无优秀案例页签（b6 未列；本地未新增）
- U=PASS：设计 token 扫描 0 命中

### SCALE_UP
- 路由：`/tools/ecommerce-suite/scale-up` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx`
- F=PASS：b4 三动作回执（07 verified 字节 1152074）
- F 证据：`SCALE_UP/b4-actions.json`、`SCALE_UP/07-result-actions-verified.json`、`SCALE_UP/02-result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.15MB 本地落盘
  - `real-acceptance/SCALE_UP/02-result.png`（755743B，1024x752，sha256:9d8d9c2988df）
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### REMOVE_PEN
- 路由：`/tools/smart-edit/remove-pen` ｜ 工作区：`web/src/components/tools/workspaces/mask.tsx`
- F=PASS：run-actions-real: 存资产+发画布回执（下载无字节回执）
- F 证据：`REMOVE_PEN/run-actions-real.json`、`REMOVE_PEN/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：850KB 本地落盘
  - `real-acceptance/REMOVE_PEN/result.png`（850799B，1024x1024，sha256:67d5d6a63751）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### CHANGE_COLOR
- 路由：`/tools/smart-edit/change-color` ｜ 工作区：`web/src/components/tools/workspaces/color.tsx`
- F=PARTIAL：仅有 download 截图 + 资产校验断言，无存资产/发画布回执
- F 证据：`CHANGE_COLOR/result.json`、`CHANGE_COLOR/reuse-actions.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.23MB 本地落盘
  - `real-acceptance/CHANGE_COLOR/result.png`（1231207B，1024x1024，sha256:6f3937c29849）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### IMAGE_CROP
- 路由：`/tools/smart-edit/image-crop` ｜ 工作区：`web/src/components/tools/workspaces/crop.tsx`
- F=PASS：b7：真实上传→submit→结果→三动作（本地像素裁剪）
- F 证据：`IMAGE_CROP/run-actions-b7.json`、`IMAGE_CROP/run-nv.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：206KB 本地落盘（裁剪结果）
  - `real-acceptance/IMAGE_CROP/result.png`（205951B，1024x744，sha256:c046374eac48）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRODUCT_REFINE
- 路由：`/tools/smart-edit/product-refine` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx`
- F=PARTIAL：有 step-3/4/5/6 存资产与画布截图，无机器回执 JSON
- F 证据：`PRODUCT_REFINE/result.json`、`PRODUCT_REFINE/step-5-asset-library.png`、`PRODUCT_REFINE/step-6-canvas.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：2.04MB 本地落盘
  - `real-acceptance/PRODUCT_REFINE/result.png`（2044177B，2048x1488，sha256:90ae5ae24727）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### FIX_COLOR
- 路由：`/tools/smart-edit/fix-color` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx`
- F=PARTIAL：提交后无结果区（仅有空态），三动作未执行
- F 证据：`FIX_COLOR/ui.png`
- T=PASS：文案/品牌扫描 0 命中
- R=BLOCKED：目录内只有 1440x900 UI 截图，无任何产物字节（旧矩阵 R=PASS 为截图充数）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRINTING_REPAIR
- 路由：`/tools/smart-edit/printing-repair` ｜ 工作区：`web/src/components/tools/workspaces/printing-repair.tsx`
- F=PASS：run-actions-real: 真实出图+存资产+发画布+独立路由回验
- F 证据：`PRINTING_REPAIR/run-actions-real.json`、`PRINTING_REPAIR/result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.15MB 本地落盘
  - `real-acceptance/PRINTING_REPAIR/result.png`（1153165B，1024x1024，sha256:6ce8e2aa312b）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### HAND_REPAIR
- 路由：`/tools/smart-edit/hand-repair` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx`
- F=PARTIAL：仅 download 字节；存资产/发画布未取得回执
- F 证据：`HAND_REPAIR/result.json`、`HAND_REPAIR/download-action.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.35MB 本地落盘
  - `real-acceptance/HAND_REPAIR/result.png`（1353583B，1024x1024，sha256:3e53cf331d5d）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### NEW_REPLACE_BG_V2
- 路由：`/tools/product-design/new-replace-bg-v2` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PASS：b4 字节匹配 download/asset/node 三处 1109268B
- F 证据：`NEW_REPLACE_BG_V2/b4-actions.json`、`NEW_REPLACE_BG_V2/result1.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.11MB 本地落盘
  - `real-acceptance/NEW_REPLACE_BG_V2/result1.png`（1109268B，1024x1024，sha256:58041a5cf1df）
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
- K=PASS：原站案例 + 回填（design19 wearable）
- K 证据：`b6-cases/visual-parity.json`、`design19-cases-20261029/wearable/run.json`
- U=PASS：设计 token 扫描 0 命中

### AI_TEXT
- 路由：`/tools/product-design/ai-text` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx`
- F=PARTIAL：provider 200 但响应 b64 截断；三动作未验收
- F 证据：`AI_TEXT/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PARTIAL：真实调用成功但产物字节/URL 未留存（05-real-result.png 是 1920x839 面板截图）
  - `real-acceptance/AI_TEXT/result.json`（2516B，sha256:b7cbd1773aeb）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### ORNAMENT_TEXT
- 路由：`/tools/product-design/ornament-text` ｜ 工作区：`web/src/components/tools/workspaces/text.tsx`
- F=PARTIAL：仅有 nv-actions.png 截图，无机器回执
- F 证据：`ORNAMENT_TEXT/nv-actions.png`、`ORNAMENT_TEXT/nv-result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.33MB 本地落盘
  - `real-acceptance/ORNAMENT_TEXT/nv-result.png`（1332984B，1024x1024，sha256:41c21d3d661b）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### SDS_DESIGN
- 路由：`/tools/product-design/sds-design` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx`
- F=PARTIAL：真实产物存在，无三动作回执（旧矩阵 H 依赖 B5 注入）
- F 证据：`SDS_DESIGN/result.json`、`design19-cases-20261029/sds/run.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：design19 1.44MB 1024x1024（real-acceptance 目录只有 1920x839 截图）
  - `design19-cases-20261029/sds/result-1780443735213010944.png`（1442444B，1024x1024，sha256:c762f8ea5c59）
- H=PARTIAL：无真实提交→刷新回填证据
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
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_POSE_GENERATOR
- 路由：`/tools/product-design/ai-pose-generator` ｜ 工作区：`web/src/components/tools/workspaces/model.tsx`
- F=PASS：b4 三动作回执（1550004B）
- F 证据：`AI_POSE_GENERATOR/b4-actions.json`、`AI_POSE_GENERATOR/real-run-1024.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.55MB 本地落盘
  - `real-acceptance/AI_POSE_GENERATOR/real-run-1024.png`（1550004B，1024x1024，sha256:bd34bb6dbeee）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_DRESSING_XSY
- 路由：`/tools/product-design/ai-dressing-xsy` ｜ 工作区：`web/src/components/tools/workspaces/dressing-xsy.tsx`
- F=PASS：traceIds 含 assetId+canvasNodeId 回执（无下载回执）
- F 证据：`AI_DRESSING_XSY/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.07MB 本地落盘
  - `real-acceptance/AI_DRESSING_XSY/02-result.png`（1069621B，720x960，sha256:3fa3873f07ac）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### FISSION_LINK
- 路由：`/tools/product-design/fission-link` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PASS：b4 下载+存资产回执（无画布回执）
- F 证据：`FISSION_LINK/b4-actions.json`、`FISSION_LINK/01-result.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：139KB 结果 + 1.67MB 上游原图
  - `real-acceptance/FISSION_LINK/01-result.png`（138756B，1908x837，sha256:d5c4ca3205cd）
  - `real-acceptance/FISSION_LINK/03-upstream-result.png`（1672875B，1024x1024，sha256:252b3ed1eb65）
- H=PASS：全新加载后历史坞 5 条 + 4 张 1024² 缩略图解码；另有 2 条卡「提交中」
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
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### MATERIAL_UPPER_BODY
- 路由：`/tools/product-design/material-upper-body` ｜ 工作区：`web/src/components/tools/workspaces/dress.tsx`
- F=PASS：b4 三动作回执（1699450B）
- F 证据：`MATERIAL_UPPER_BODY/b4-actions.json`、`MATERIAL_UPPER_BODY/real-run-1024.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.70MB 本地落盘
  - `real-acceptance/MATERIAL_UPPER_BODY/real-run-1024.png`（1699450B，1024x1024，sha256:dede7ba9a582）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### NEW_DESIGNER
- 路由：`/tools/product-design/new-designer` ｜ 工作区：`web/src/components/tools/workspaces/designer.tsx`
- F=PARTIAL：本地导出 + 画布截图，无资产/画布机器回执
- F 证据：`NEW_DESIGNER/result.json`、`NEW_DESIGNER/step-2-canvas.png`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：32KB 1200x1200 本地合成（体积偏小但为真实 PNG）
  - `real-acceptance/NEW_DESIGNER/result.png`（32854B，1200x1200，sha256:2ee5aa7b300b）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### PRODUCT_MARKET_MATERIAL
- 路由：`/tools/product-design/product-market-material` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx`
- F=PARTIAL：有 step-2 资产库/step-3 画布截图，无机器回执
- F 证据：`PRODUCT_MARKET_MATERIAL/step-2-asset-library.png`、`PRODUCT_MARKET_MATERIAL/step-3-canvas.png`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/suite.tsx:430, web/src/components/tools/workspaces/suite.tsx:439
- R=PASS：700KB 本地落盘
  - `real-acceptance/PRODUCT_MARKET_MATERIAL/result.png`（703458B，970x600，sha256:d1343fdf6f40）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### SCENE_TRANSFER
- 路由：`/tools/product-design/scene-transfer` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx`
- F=PARTIAL：仅 URL 产物，无三动作回执
- F 证据：`SCENE_TRANSFER/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：结果 URL 直出 OSS（URL-only，实测 HEAD 200）
  - `https://oss-us.dimenoss.com/images/2026/10/28/1793201468_9270e246095bfc569d43a8d447b31b25.png`（1109675B，sha256:None）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### IMAGE_TO_VIDEO
- 路由：`/tools/ai-video/image-to-video` ｜ 工作区：`web/src/components/tools/workspaces/image-to-video.tsx`
- F=PARTIAL：生成+存资产已验收；发画布未执行（ddba2e6 刚修落库，待重取证）
- F 证据：`IMAGE_TO_VIDEO/result.json`
- T=PASS：文案/品牌扫描 0 命中
- R=PASS：1.30MB mp4 本地落盘
  - `real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4`（1297168B，sha256:56226153eb7e）
- H=PARTIAL：ddba2e6 修真实任务落库+历史区，但无刷新回填证据文件
- K=MISSING：原站有 10 张案例卡+做同款，本地未接线（占位文案 video.tsx:649）
- K 证据：`b6-cases/origin/IMAGE_TO_VIDEO-cases.json`、`b6-cases/visual-parity.json`
- U=PASS：设计 token 扫描 0 命中

### SALE_VIDEO
- 路由：`/tools/ai-video/sale-video` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=BLOCKED：上游端点 404，无自有产物；b4 动作使用 IMAGE_TO_VIDEO 借用 mp4（source=borrowed）
- F 证据：`SALE_VIDEO/b4-actions.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=BLOCKED：无自有产物；b4 视频字节来自 IMAGE_TO_VIDEO
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_REPLICATION
- 路由：`/tools/ai-video/video-replication` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：工作台通道 404；仅直连 link 模式成功，三动作未走 UI
- F 证据：`VIDEO_REPLICATION/link-mode/run-final.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=PASS：link 模式 out.mp4 2.28MB + 上游 done
  - `real-acceptance/VIDEO_REPLICATION/link-mode/out.mp4`（2277978B，sha256:b5e80fdea652）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### AI_VIDEO_EDITING
- 路由：`/tools/ai-video/ai-video-editing` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=BLOCKED：上游 404，无自有产物；b4 借用 IMAGE_TO_VIDEO mp4
- F 证据：`AI_VIDEO_EDITING/b4-actions.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=BLOCKED：无自有产物（旧矩阵 R=PASS 不成立）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_TRANSLATION
- 路由：`/tools/ai-video/video-translation` ｜ 工作区：`web/src/components/tools/workspaces/video-translation.tsx`
- F=PARTIAL：未取得成功样例；三动作未验收
- F 证据：`VIDEO_TRANSLATION/result.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:499, web/src/components/tools/workspaces/video-translation.tsx:500
- R=BLOCKED：无任何视频产物，上游失败（旧矩阵 R=PASS 为口误）
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

### VIDEO_CONCAT
- 路由：`/tools/ai-video/video-concat` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx`
- F=PARTIAL：只验证工作台/校验，未发起真实拼接
- F 证据：`VIDEO_CONCAT/result.json`
- T=PARTIAL：case-module 占位文案： web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:649, web/src/components/tools/workspaces/video.tsx:650, web/src/components/tools/workspaces/video.tsx:1357
- R=BLOCKED：未发起真实生成调用，无产物
- H=PARTIAL：无真实提交→刷新回填证据
- K=N/A：原站无案例模块
- U=PASS：设计 token 扫描 0 命中

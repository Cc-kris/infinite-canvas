# 39 工具 1:1 验收总表（最终版）

- 生成时间：2026-10-29；仓库 `infinite-canvas`；分支 `feat/linkfox-v1-real`（HEAD `5b167b9`）
- 性质：**只读验收汇总**，未改动 `web/src`；所有结论均可回溯到 `evidence/` 下的原始文件
- 数据源：39 份 `evidence/real-acceptance/<ID>/result.json`、14 份 `b4-actions.json`、`B5_HISTORY_DOCK/summary.json`(17/17)、`b6-cases/visual-parity.json`、`b9-visual-parity-20261029/`、`b12-frame-parity-20261029/`、`page-dom-20261028/visual-parity.json`、`B9-edit8-visual-parity.md`、`D19-design10-visual-parity.md`、`B10-suite6-visual-parity.md`

## 判定口径（严格）

- **PASS**：六维全部有可复算证据（真实上游字节 + 三动作真实回执 + 历史/案例/默认值/视觉 1:1）
- **PARTIAL**：至少一维有真实证据但未全绿
- **BLOCKED**：核心功能无法运行 或 缺少原站视觉基线，1:1 无法验收
- 六维 = ①功能(真实上游产物) ②三动作(下载/存入资产/发送画布) ③历史 ④案例 ⑤默认值 ⑥视觉(布局/文案/CSS/交互状态)
- **单元测试通过、组件已渲染、自报 PASS 均不计入 PASS**：必须有点击回执/ID/字节数/DOM 实测。

## 总览

- 39 个工具全部有工作区路由与证据目录（100% 覆盖）
- 按六维全绿口径：**PASS 0 / PARTIAL 32 / BLOCKED 7**
- 功能维度：真实产物已落盘 21 个；半通 13 个；被上游/环境阻塞 5 个
- 三动作维度：三条全通 15 个；部分 7 个；完全未验 17 个
- 历史维度：实测通过 19 个（B5 dock 17 + 自有历史 3）；未验 19 个；按设计无历史 1 个
- 案例维度：**真实案例仅 1 个**（AI_OUTPAINTING）；35 个无案例模块/占位；3 个原站已无基线
- 默认值维度：**0 个通过**；21 个字段已对齐但默认值未声明（B9 `defaults_keys=0`）；18 个从未测量
- 视觉维度：PASS 2 个（AREA_REPAIR / REMOVE_PEN）；PARTIAL 33 个；BLOCKED 4 个

### 一句话结论

> 功能与结果动作链路已大面积打通（20 个工具有真实字节产物、14 个工具三动作有完整回执），但**没有任何工具达到 1:1 交付线**：卡口不在功能，而在①默认值全缺、②案例仅 1 个、③视觉布局/文案全站仍 PARTIAL、④6 个工具受 provider/原站入口阻塞。

## 总表（39 行）

| # | 工具 | 分类 | 功能 | 三动作 | 历史 | 案例 | 默认值 | 视觉 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `PRODUCT_IMAGE_SUITE`<br>商品套图 | 电商套图 | PARTIAL | UNVERIFIED | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 2 | `DRESS_WEAR_SET`<br>服装套图 | 电商套图 | PASS | PARTIAL | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 3 | `CHANGE_COLOR_V2`<br>套图换色 | 电商套图 | PARTIAL | PASS | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 4 | `IMAGE_TRANSLATION`<br>批量翻译 | 电商套图 | BLOCKED | PASS | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 5 | `SCALE_UP`<br>高清放大 | 电商套图 | PASS | PASS | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 6 | `AI_OUTPAINTING`<br>智能扩图 | 电商套图 | PASS | PASS | PARTIAL | PASS | MISSING | PARTIAL | **PARTIAL** |
| 7 | `AREA_REPAIR`<br>局部重绘 | 智能修图 | PASS | PASS | UNVERIFIED | MISSING | MISSING | PASS | **PARTIAL** |
| 8 | `REMOVE_PEN`<br>局部消除 | 智能修图 | PASS | PARTIAL | UNVERIFIED | MISSING | MISSING | PASS | **PARTIAL** |
| 9 | `CHANGE_COLOR`<br>一键换色 | 智能修图 | PASS | UNVERIFIED | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 10 | `IMAGE_CROP`<br>图片裁剪 | 智能修图 | PASS | PASS | N/A | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 11 | `PRODUCT_REFINE`<br>商品精修 | 智能修图 | PASS | PARTIAL | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 12 | `FIX_COLOR`<br>色差修复 | 智能修图 | BLOCKED | UNVERIFIED | UNVERIFIED | MISSING | MISSING | PARTIAL | **BLOCKED** |
| 13 | `PRINTING_REPAIR`<br>印花修复 | 智能修图 | PASS | PASS | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 14 | `HAND_REPAIR`<br>手部修复 | 智能修图 | PASS | PASS | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 15 | `NEW_REPLACE_BG_V2`<br>商品图 | 商品图设计 | PARTIAL | UNVERIFIED | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 16 | `REPLACE_GOODS`<br>商品替换 | 商品图设计 | PARTIAL | UNVERIFIED | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 17 | `PRODUCT_SCENE`<br>场景裂变 | 商品图设计 | PARTIAL | UNVERIFIED | UNVERIFIED | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 18 | `HANDHELD_GOODS`<br>手持商品 | 商品图设计 | PASS | PARTIAL | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 19 | `AI_DRESSING_V2`<br>AI穿衣 | 商品图设计 | PASS | PASS | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 20 | `AI_POSTURE`<br>姿势裂变 | 商品图设计 | PARTIAL | UNVERIFIED | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 21 | `AI_WEARABLE`<br>AI穿戴 | 商品图设计 | PASS | PASS | PASS | MISSING | MISSING | PARTIAL | **PARTIAL** |
| 22 | `AI_TEXT`<br>POD素材 | 商品图设计 | PARTIAL | UNVERIFIED | PASS | BLOCKED | UNVERIFIED | BLOCKED | **BLOCKED** |
| 23 | `ORNAMENT_TEXT`<br>饰品文字 | 商品图设计 | PASS | UNVERIFIED | PASS | BLOCKED | UNVERIFIED | BLOCKED | **BLOCKED** |
| 24 | `SDS_DESIGN`<br>素材贴合 | 商品图设计 | PARTIAL | UNVERIFIED | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 25 | `PRINT_EXTRACT`<br>印花提取 | 商品图设计 | PARTIAL | UNVERIFIED | UNVERIFIED | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 26 | `AI_POSE_GENERATOR`<br>AI姿势生成 | 商品图设计 | PASS | PASS | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 27 | `AI_DRESSING_XSY`<br>AI试衣XSY | 商品图设计 | PASS | PARTIAL | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 28 | `FISSION_LINK`<br>场景裂变链接 | 商品图设计 | PASS | PARTIAL | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 29 | `IMAGE_TEXT_EDIT`<br>图片文字编辑 | 商品图设计 | PASS | PASS | UNVERIFIED | MISSING | UNVERIFIED | BLOCKED | **PARTIAL** |
| 30 | `MATERIAL_UPPER_BODY`<br>上装换料 | 商品图设计 | PASS | PASS | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 31 | `NEW_DESIGNER`<br>商品图设计器 | 商品图设计 | PASS | PASS | UNVERIFIED | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 32 | `PRODUCT_MARKET_MATERIAL`<br>商品营销素材 | 商品图设计 | PARTIAL | UNVERIFIED | UNVERIFIED | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 33 | `SCENE_TRANSFER`<br>场景迁移 | 商品图设计 | PARTIAL | UNVERIFIED | PASS | BLOCKED | UNVERIFIED | BLOCKED | **BLOCKED** |
| 34 | `IMAGE_TO_VIDEO`<br>图转视频 | AI视频 | PASS | PARTIAL | UNVERIFIED | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 35 | `SALE_VIDEO`<br>带货口播 | AI视频 | BLOCKED | UNVERIFIED | PASS | MISSING | UNVERIFIED | PARTIAL | **BLOCKED** |
| 36 | `VIDEO_REPLICATION`<br>视频复刻 | AI视频 | BLOCKED | UNVERIFIED | UNVERIFIED | MISSING | UNVERIFIED | PARTIAL | **BLOCKED** |
| 37 | `AI_VIDEO_EDITING`<br>视频编辑 | AI视频 | BLOCKED | PASS | PASS | MISSING | UNVERIFIED | PARTIAL | **BLOCKED** |
| 38 | `VIDEO_TRANSLATION`<br>视频翻译 | AI视频 | PARTIAL | UNVERIFIED | PARTIAL | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |
| 39 | `VIDEO_CONCAT`<br>视频拼接 | AI视频 | PARTIAL | UNVERIFIED | PASS | MISSING | UNVERIFIED | PARTIAL | **PARTIAL** |

> 三动作列 `PASS` 表示下载/存入资产/发送画布三条均有点击回执（字节数或 assetId/projectId+nodeId）；`PARTIAL` 表示缺其中一条以上；`UNVERIFIED` 表示仅有按钮渲染或测试、无真实点击。

## 逐工具明细

### 1. `PRODUCT_IMAGE_SUITE` 商品套图 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/product-image-suite` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx` ｜ 最近提交：`aee6b6b 2026-10-29`
- 功能（PARTIAL）：上游 200、50s 出 1 张 1024×1024（data:URL 内联，未取字节数）
- 三动作（UNVERIFIED）：result.json steps 无三动作点击记录；b4 未覆盖
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：案例区文案『案例库尚未接入』
- 默认值（MISSING）：B9：原站 7 组控件 / 本地 2 组，defaults_keys=0
- 视觉（PARTIAL）：B10：双栏已复刻但列宽/上传卡/间距仍差（PARTIAL）  → 证据 `evidence/B10-suite6-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/PRODUCT_IMAGE_SUITE/result.json`
- **下一修复动作**：补三动作真实点击+字节；接真实案例；补默认值

### 2. `DRESS_WEAR_SET` 服装套图 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/dress-wear-set` ｜ 工作区：`web/src/components/tools/workspaces/dress-suite.tsx` ｜ 最近提交：`0ef9603 2026-10-28`
- 功能（PASS）：上游 200，1,239,248 B / 1 组 1 张
- 三动作（PARTIAL）：下载 href+文件名、存入资产已点击（assets=1）；发送画布无点击证据
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：无案例模块（原站该页无优秀案例）
- 默认值（MISSING）：B9：原站 7 / 本地 2，defaults_keys=0
- 视觉（PARTIAL）：B10：布局与文案已对齐一轮，仍 PARTIAL  → 证据 `evidence/B10-suite6-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/DRESS_WEAR_SET/result.json`
- **下一修复动作**：补发送画布点击证据；补默认值

### 3. `CHANGE_COLOR_V2` 套图换色 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/change-color-v2` ｜ 工作区：`web/src/components/tools/workspaces/color-v2.tsx` ｜ 最近提交：`c1e88da 2026-10-29`
- 功能（PARTIAL）：2 单元仅 1 单元拿到真实产物，unit1 失败（openRisks）
- 三动作（PASS）：b4：下载+存资产+发画布 全部真实验证
- 历史（PASS）：B5 已验证（17/17）
- 案例（MISSING）：无案例模块
- 默认值（MISSING）：B9：原站 4 / 本地 3，defaults_keys=0
- 视觉（PARTIAL）：B10：视觉对照落证后状态回退 PARTIAL  → 证据 `evidence/B10-suite6-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/CHANGE_COLOR_V2/result.json`、`evidence/real-acceptance/CHANGE_COLOR_V2/b4-actions.json`
- **下一修复动作**：重跑失败单元或接受 1/2；补默认值

### 4. `IMAGE_TRANSLATION` 批量翻译 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/image-translation` ｜ 工作区：`web/src/components/tools/workspaces/translate.tsx` ｜ 最近提交：`ad534fc 2026-10-29`
- 功能（BLOCKED）：本轮未取回结果：提交后 CDP 通道失效（环境阻塞），result=not_verified
- 三动作（PASS）：b4：借真实产物验证下载 674,xxx B + 存资产 + 发画布
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：无案例模块
- 默认值（MISSING）：B9：原站 22 / 本地 15，defaults_keys=0
- 视觉（PARTIAL）：B10：仅证据与判定，未重排  → 证据 `evidence/B10-suite6-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/IMAGE_TRANSLATION/result.json`、`evidence/real-acceptance/IMAGE_TRANSLATION/b4-actions.json`
- **下一修复动作**：通道恢复后重跑一次真实翻译；补 7 组缺失控件

### 5. `SCALE_UP` 高清放大 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/scale-up` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx` ｜ 最近提交：`cee7e65 2026-10-29`
- 功能（PASS）：真实 1024×752 / 1,152,074 B（OSS）
- 三动作（PASS）：b4：下载 1,152,074 B、存资产 AzmBB3…、发画布 aFEdKz…
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0（字段齐、默认值缺）
- 视觉（PARTIAL）：B10：PARTIAL（参数条/结果区仍差）  → 证据 `evidence/B10-suite6-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/SCALE_UP/result.json`、`evidence/real-acceptance/SCALE_UP/b4-actions.json`
- **下一修复动作**：补默认值；视觉收口

### 6. `AI_OUTPAINTING` 智能扩图 — **PARTIAL**

- 路由：`/tools/ecommerce-suite/ai-outpainting` ｜ 工作区：`web/src/components/tools/workspaces/outpaint.tsx` ｜ 最近提交：`af12f5b 2026-10-29`
- 功能（PASS）：真实 929,476 B（oss-us.dimenoss.com）
- 三动作（PASS）：assetRecordId rJEMPir9…、canvasProjectId 5S4iu3U6…、nodeId image-1793204809741-4boac
- 历史（PARTIAL）：代码已渲染 ToolTaskHistory（outpaint.tsx:927），本轮未独立复验；result.json 自述『历史记录未实现』
- 案例（PASS）：B6 PASS：唯一接入真实 AI_OUTPAINTING_CASES + 做同款回填
- 默认值（MISSING）：B9：原站控件缺 37 条文案、defaults_keys=0
- 视觉（PARTIAL）：PARTIAL：主题深色 vs 原站浅色、单列工作区 vs 顶部导航+左栏+底部参数条、37 条文案缺失  → 证据 `evidence/B6 + result.json.visualParity`
- 可复核证据：`evidence/real-acceptance/AI_OUTPAINTING/result.json`
- **下一修复动作**：视觉 1:1 收口（主题/框架/文案）；补默认值

### 7. `AREA_REPAIR` 局部重绘 — **PARTIAL**

- 路由：`/tools/smart-edit/area-repair` ｜ 工作区：`web/src/components/tools/workspaces/mask.tsx` ｜ 最近提交：`998cf6f 2026-10-29`
- 功能（PASS）：上游 200×2，943,932 B / 907,235 B
- 三动作（PASS）：下载（命名 product-watch-repainted.png）+ assetId U_TaBRV2… + projectId bzQ2ePN7…
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PASS）：B9-edit8：组件/尺寸/配色 1:1 已复刻  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/AREA_REPAIR/result.json`
- **下一修复动作**：补历史面板实测；补默认值

### 8. `REMOVE_PEN` 局部消除 — **PARTIAL**

- 路由：`/tools/smart-edit/remove-pen` ｜ 工作区：`web/src/components/tools/workspaces/mask.tsx` ｜ 最近提交：`998cf6f 2026-10-29`
- 功能（PASS）：真实产物（复用字节）
- 三动作（PARTIAL）：存资产 K-a7Ae-u + 发画布 9PtWcnw/image-17；无下载点击记录（knownLimits 资产已被清理）
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PASS）：B9-edit8：单列画布按原站复刻 PASS  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/REMOVE_PEN/result.json`
- **下一修复动作**：补下载动作取证；补默认值

### 9. `CHANGE_COLOR` 一键换色 — **PARTIAL**

- 路由：`/tools/smart-edit/change-color` ｜ 工作区：`web/src/components/tools/workspaces/color.tsx` ｜ 最近提交：`cee7e65 2026-10-29`
- 功能（PASS）：真实 1024×1024 OSS 产物（历史命中 count=1 可查看）
- 三动作（UNVERIFIED）：checks 未覆盖下载/存资产/发画布
- 历史（PASS）：自有『历史记录』tab 实测：刷新后命中 1 条并可回填
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：B9-edit8：PARTIAL（未逐项 diff）  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/CHANGE_COLOR/result.json`
- **下一修复动作**：补三动作；补默认值

### 10. `IMAGE_CROP` 图片裁剪 — **PARTIAL**

- 路由：`/tools/smart-edit/image-crop` ｜ 工作区：`web/src/components/tools/workspaces/crop.tsx` ｜ 最近提交：`142a946 2026-10-28`
- 功能（PASS）：本地 renderer，导出 205,951 B
- 三动作（PASS）：下载 205,951 B + assetId 0UnbEDVA… + 画布 XtI3xAL2…（刷新后仍在）
- 历史（N/A）：按设计不产生 task 记录（非缺陷）
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：B9-edit8：PARTIAL（间距/空态尺寸）  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/IMAGE_CROP/result.json`
- **下一修复动作**：补默认值；视觉收口

### 11. `PRODUCT_REFINE` 商品精修 — **PARTIAL**

- 路由：`/tools/smart-edit/product-refine` ｜ 工作区：`web/src/components/tools/workspaces/enhance.tsx` ｜ 最近提交：`cee7e65 2026-10-29`
- 功能（PASS）：真实 OSS 产物（checks 记录）
- 三动作（PARTIAL）：assets/canvas 有记录，缺完整三动作点击链
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：B9-edit8：PARTIAL  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/PRODUCT_REFINE/result.json`
- **下一修复动作**：补三动作全链证据；补默认值

### 12. `FIX_COLOR` 色差修复 — **BLOCKED**

- 路由：`/tools/smart-edit/fix-color` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx` ｜ 最近提交：`e81d66c 2026-10-28`
- 功能（BLOCKED）：多轮真实提交均无可用结果：上游连接超时 / 502（attempts）
- 三动作（UNVERIFIED）：无真实结果 → 三动作无法验收
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/FIX_COLOR/result.json`
- **下一修复动作**：代理可用时重跑一次真实提交（会消耗算力）

### 13. `PRINTING_REPAIR` 印花修复 — **PARTIAL**

- 路由：`/tools/smart-edit/printing-repair` ｜ 工作区：`web/src/components/tools/workspaces/printing-repair.tsx` ｜ 最近提交：`a735c20 2026-10-28`
- 功能（PASS）：真实 OSS 产物 1024×1024
- 三动作（PASS）：DOM 断言三个 testid 渲染可用；result.json actions+crossChecks 完整
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：B9-edit8：PARTIAL  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/PRINTING_REPAIR/result.json`
- **下一修复动作**：补历史实测；补默认值

### 14. `HAND_REPAIR` 手部修复 — **PARTIAL**

- 路由：`/tools/smart-edit/hand-repair` ｜ 工作区：`web/src/components/tools/workspaces/repair.tsx` ｜ 最近提交：`e81d66c 2026-10-28`
- 功能（PASS）：复用真实产物（noRegenerationDecision 明示零成本）
- 三动作（PASS）：resultActions + crossCheck 三段齐全
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：B9：defaults_keys=0
- 视觉（PARTIAL）：B9-edit8：PARTIAL  → 证据 `evidence/B9-edit8-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/HAND_REPAIR/result.json`
- **下一修复动作**：补一次真实重新生成取证；补默认值

### 15. `NEW_REPLACE_BG_V2` 商品图 — **PARTIAL**

- 路由：`/tools/product-design/new-replace-bg-v2` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（PARTIAL）：结果状态 PASS，但无字节数记录
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布]
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（本地通用三段式 vs 原站上传卡+右栏）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/NEW_REPLACE_BG_V2/result.json`
- **下一修复动作**：补三动作；重构布局；补默认值

### 16. `REPLACE_GOODS` 商品替换 — **PARTIAL**

- 路由：`/tools/product-design/replace-goods` ｜ 工作区：`web/src/components/tools/workspaces/replace.tsx` ｜ 最近提交：`c51dc98 2026-10-28`
- 功能（PARTIAL）：无字节记录（self-claim PASS）
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布]
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（结构不同）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/REPLACE_GOODS/result.json`
- **下一修复动作**：补三动作；布局 1:1；补默认值

### 17. `PRODUCT_SCENE` 场景裂变 — **PARTIAL**

- 路由：`/tools/product-design/product-scene` ｜ 工作区：`web/src/components/tools/workspaces/scene-fission.tsx` ｜ 最近提交：`cee7e65 2026-10-29`
- 功能（PARTIAL）：无字节记录
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布,多张并发,关键词批量]
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（结构不同）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/PRODUCT_SCENE/result.json`
- **下一修复动作**：补三动作+多张；布局 1:1

### 18. `HANDHELD_GOODS` 手持商品 — **PARTIAL**

- 路由：`/tools/product-design/handheld-goods` ｜ 工作区：`web/src/components/tools/workspaces/handheld-goods.tsx` ｜ 最近提交：`ba538e4 2026-10-28`
- 功能（PASS）：真实 720×960 / 1,060,068 B（PNG 头校验）
- 三动作（PARTIAL）：三按钮渲染但端到端点击未执行（验收标签被外部重载）
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（结构不同）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/HANDHELD_GOODS/result.json`
- **下一修复动作**：重跑三动作点击；布局 1:1；补默认值

### 19. `AI_DRESSING_V2` AI穿衣 — **PARTIAL**

- 路由：`/tools/product-design/ai-dressing-v2` ｜ 工作区：`web/src/components/tools/workspaces/dressing.tsx` ｜ 最近提交：`5e97969 2026-10-28`
- 功能（PASS）：真实 819,224 B
- 三动作（PASS）：b4：下载 819,224 B + 存资产 sZdac-DN… + 发画布
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL，26 条文案缺失、通用三段式  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/AI_DRESSING_V2/result.json`、`evidence/real-acceptance/AI_DRESSING_V2/b4-actions.json`
- **下一修复动作**：文案逐条补齐；布局 1:1

### 20. `AI_POSTURE` 姿势裂变 — **PARTIAL**

- 路由：`/tools/product-design/ai-posture` ｜ 工作区：`web/src/components/tools/workspaces/model.tsx` ｜ 最近提交：`9769896 2026-10-28`
- 功能（PARTIAL）：无字节记录
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布,多姿势批量]
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（18 条文案缺）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/AI_POSTURE/result.json`
- **下一修复动作**：补三动作；文案/布局

### 21. `AI_WEARABLE` AI穿戴 — **PARTIAL**

- 路由：`/tools/product-design/ai-wearable` ｜ 工作区：`web/src/components/tools/workspaces/dress.tsx` ｜ 最近提交：`954c2d7 2026-10-28`
- 功能（PASS）：真实 1,641,506 B
- 三动作（PASS）：b4：三动作全通（存资产 GbFI4g24…）
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（MISSING）：未测
- 视觉（PARTIAL）：D19：PARTIAL（22 条文案缺）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/AI_WEARABLE/result.json`、`evidence/real-acceptance/AI_WEARABLE/b4-actions.json`
- **下一修复动作**：文案/布局收口

### 22. `AI_TEXT` POD素材 — **BLOCKED**

- 路由：`/tools/product-design/ai-text` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx` ｜ 最近提交：`1ebb357 2026-10-29`
- 功能（PARTIAL）：上游 200 且真实出图 720×960 / 686,174 B，但 98s 后 UI 仍『待提取1张·成功0』→ 结果未落地
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布]
- 历史（PASS）：B5 已验证
- 案例（BLOCKED）：原站 /draw/ai-text 302 到首页，工具已下架，无基线
- 默认值（UNVERIFIED）：未测
- 视觉（BLOCKED）：BLOCKED：原站入口失效，1:1 无基线（D19）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/AI_TEXT/result.json`
- **下一修复动作**：修复结果落地链路；视觉基线改用历史快照需产品确认

### 23. `ORNAMENT_TEXT` 饰品文字 — **BLOCKED**

- 路由：`/tools/product-design/ornament-text` ｜ 工作区：`web/src/components/tools/workspaces/text.tsx` ｜ 最近提交：`b043e4e 2026-10-28`
- 功能（PASS）：上游 200，OCR 确认 1 张结果（截图 188,583 B）
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布]
- 历史（PASS）：B5 已验证
- 案例（BLOCKED）：原站 /draw/ornament-text 302 到首页
- 默认值（UNVERIFIED）：未测
- 视觉（BLOCKED）：BLOCKED：原站入口失效  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/ORNAMENT_TEXT/result.json`
- **下一修复动作**：补三动作；视觉基线需产品确认

### 24. `SDS_DESIGN` 素材贴合 — **PARTIAL**

- 路由：`/tools/product-design/sds-design` ｜ 工作区：`web/src/components/tools/workspaces/pod.tsx` ｜ 最近提交：`1ebb357 2026-10-29`
- 功能（PARTIAL）：上游 200 / 720×960，但仅截图证据、无字节落盘
- 三动作（UNVERIFIED）：notExercised=[下载,存入资产,发送画布]
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：D19：PARTIAL（本地三段式 vs 原站三区）  → 证据 `evidence/D19-design10-visual-parity.md`
- 可复核证据：`evidence/real-acceptance/SDS_DESIGN/result.json`
- **下一修复动作**：字节化+三动作；三区布局 1:1

### 25. `PRINT_EXTRACT` 印花提取 — **PARTIAL**

- 路由：`/tools/product-design/print-extract` ｜ 工作区：`web/src/components/tools/workspaces/extract.tsx` ｜ 最近提交：`a693050 2026-10-29`
- 功能（PARTIAL）：上游 200 出真实 686,174 B，但 UI 未落地；通道 0 直连 502（4 条 defects）
- 三动作（UNVERIFIED）：notExercised 未列，但无三动作记录
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：design19b：视觉+结构已 DONE  → 证据 `evidence/design19b-visual-parity`
- 可复核证据：`evidence/real-acceptance/PRINT_EXTRACT/result.json`
- **下一修复动作**：修逐张状态同步+刷新丢任务（P1）；补三动作

### 26. `AI_POSE_GENERATOR` AI姿势生成 — **PARTIAL**

- 路由：`/tools/product-design/ai-pose-generator` ｜ 工作区：`web/src/components/tools/workspaces/model.tsx` ｜ 最近提交：`9769896 2026-10-28`
- 功能（PASS）：真实 1024×1024 / 1,550,004 B（b64 直取，sha256 校验）
- 三动作（PASS）：task: assetId h3TVsX8D + canvasNodeId image-17 + 下载
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/AI_POSE_GENERATOR/result.json`
- **下一修复动作**：补默认值；视觉逐项 diff

### 27. `AI_DRESSING_XSY` AI试衣XSY — **PARTIAL**

- 路由：`/tools/product-design/ai-dressing-xsy` ｜ 工作区：`web/src/components/tools/workspaces/dressing-xsy.tsx` ｜ 最近提交：`e325ca7 2026-10-28`
- 功能（PASS）：真实 720×960 / 1,069,621 B
- 三动作（PARTIAL）：存入资产 WBaAYDKP… + 画布 ahxLQ_-z… 已 UI 复核；下载仅验按钮可用
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/AI_DRESSING_XSY/result.json`
- **下一修复动作**：补下载真实落盘；视觉 diff

### 28. `FISSION_LINK` 场景裂变链接 — **PARTIAL**

- 路由：`/tools/product-design/fission-link` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（PASS）：真实 1024×1024 / 1,672,875 B（上游 URL 直下）
- 三动作（PARTIAL）：steps 记录下载链接；not_exercised 仍列三动作 → 存资产/发画布无点击
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/FISSION_LINK/result.json`
- **下一修复动作**：补存资产/发画布点击；多张裂变

### 29. `IMAGE_TEXT_EDIT` 图片文字编辑 — **PARTIAL**

- 路由：`/tools/product-design/image-text-edit` ｜ 工作区：`web/src/components/tools/workspaces/image-text-edit.tsx` ｜ 最近提交：`b043e4e 2026-10-28`
- 功能（PASS）：真实 844,613 B（复用零成本）
- 三动作（PASS）：下载 844,613 B + assetId zwXD2FKp… + 画布 MqJ9VDxS…（刷新后仍在）
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（BLOCKED）：BLOCKED：page-dom 判定原站不可 1:1 验收  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/IMAGE_TEXT_EDIT/result.json`
- **下一修复动作**：确认视觉基线来源；补默认值

### 30. `MATERIAL_UPPER_BODY` 上装换料 — **PARTIAL**

- 路由：`/tools/product-design/material-upper-body` ｜ 工作区：`web/src/components/tools/workspaces/dress.tsx` ｜ 最近提交：`954c2d7 2026-10-28`
- 功能（PASS）：真实 1024×1024 / 1,699,450 B（sha256 校验，非源图回显）
- 三动作（PASS）：下载可用 + 存资产 xJiPzZnv…（/assets 独立核对 1.6MB）+ 发画布 kCkxO-Qx…
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无独立入口（B8：套图子能力）
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：B8/page-dom：PARTIAL，40 控件已对  → 证据 `evidence/B8-original-parity-20261029.md`
- 可复核证据：`evidence/real-acceptance/MATERIAL_UPPER_BODY/result.json`
- **下一修复动作**：补默认值；补独立入口视觉基线

### 31. `NEW_DESIGNER` 商品图设计器 — **PARTIAL**

- 路由：`/tools/product-design/new-designer` ｜ 工作区：`web/src/components/tools/workspaces/designer.tsx` ｜ 最近提交：`9da665b 2026-10-29`
- 功能（PASS）：本地 compositor 导出 1200×1200 / 32,854 B（sha256 一致）
- 三动作（PASS）：存入资产 #mfnXslFb + 发送画布 pCUHXPb8…（字节一致）
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/NEW_DESIGNER/result.json`
- **下一修复动作**：补下载证据；视觉 diff

### 32. `PRODUCT_MARKET_MATERIAL` 商品营销素材 — **PARTIAL**

- 路由：`/tools/product-design/product-market-material` ｜ 工作区：`web/src/components/tools/workspaces/suite.tsx` ｜ 最近提交：`aee6b6b 2026-10-29`
- 功能（PARTIAL）：checks PASS 但无字节记录
- 三动作（UNVERIFIED）：无三动作记录
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：page-dom：PARTIAL-待本地对照  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/PRODUCT_MARKET_MATERIAL/result.json`
- **下一修复动作**：补真实产物字节+三动作

### 33. `SCENE_TRANSFER` 场景迁移 — **BLOCKED**

- 路由：`/tools/product-design/scene-transfer` ｜ 工作区：`web/src/components/tools/workspaces/scene.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（PARTIAL）：route 通过、上游依赖 canvas-proxy（risk），无字节记录
- 三动作（UNVERIFIED）：notExercised 未列三动作，但无点击证据
- 历史（PASS）：B5 已验证
- 案例（BLOCKED）：原站无案例模块（但视觉基线 BLOCKED）
- 默认值（UNVERIFIED）：未测
- 视觉（BLOCKED）：BLOCKED：page-dom 判定不可 1:1 验收  → 证据 `evidence/page-dom-20261028/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/SCENE_TRANSFER/result.json`
- **下一修复动作**：确认真实产物字节；视觉基线来源需确认

### 34. `IMAGE_TO_VIDEO` 图转视频 — **PARTIAL**

- 路由：`/tools/ai-video/image-to-video` ｜ 工作区：`web/src/components/tools/workspaces/image-to-video.tsx` ｜ 最近提交：`95e6f97 2026-10-28`
- 功能（PASS）：真实 mp4 1,297,168 B，ffprobe h264 1344×768 5.17s + aac
- 三动作（PARTIAL）：存入资产 PASS（IndexedDB 字节一致）；发送画布 blocked_at_runtime（busy 禁用+机器饱和）
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测（且全局 videoModel 指向已删除 channel → 默认模型会 401）
- 视觉（PARTIAL）：page-dom/b6：PARTIAL  → 证据 `evidence/b6-cases/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/IMAGE_TO_VIDEO/result.json`
- **下一修复动作**：补发画布；修 config videoModel

### 35. `SALE_VIDEO` 带货口播 — **BLOCKED**

- 路由：`/tools/ai-video/sale-video` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（BLOCKED）：上游 404（cc-ai 中转无 /videos）+ P1：页面时长/比例/分辨率未进请求体，恒用全局 config
- 三动作（UNVERIFIED）：无结果 → 三动作未验
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：video6：PARTIAL（布局文案已收敛一轮）  → 证据 `evidence/B9/video6 报告`
- 可复核证据：`evidence/real-acceptance/SALE_VIDEO/result.json`
- **下一修复动作**：接可用视频 provider + 修参数绑定（D1）

### 36. `VIDEO_REPLICATION` 视频复刻 — **BLOCKED**

- 路由：`/tools/ai-video/video-replication` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（BLOCKED）：上游 404 page not found（provider-rejected, retryable=false）；流程 6 步已真实验证
- 三动作（UNVERIFIED）：无结果 → 三动作未验
- 历史（UNVERIFIED）：dock 挂载未验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：video6：PARTIAL  → 证据 `evidence/video6 报告`
- 可复核证据：`evidence/real-acceptance/VIDEO_REPLICATION/result.json`
- **下一修复动作**：接视频 provider；『生成脚本草稿』接文本模型

### 37. `AI_VIDEO_EDITING` 视频编辑 — **BLOCKED**

- 路由：`/tools/ai-video/ai-video-editing` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（BLOCKED）：上游 404；本轮修 D1（JSON→multipart 降级）后仍未出片
- 三动作（PASS）：b4：借真实产物验证三动作
- 历史（PASS）：B5 已验证
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：video6：PARTIAL  → 证据 `evidence/video6 报告`
- 可复核证据：`evidence/real-acceptance/AI_VIDEO_EDITING/result.json`、`evidence/real-acceptance/AI_VIDEO_EDITING/b4-actions.json`
- **下一修复动作**：接视频 provider 后重跑真实出片

### 38. `VIDEO_TRANSLATION` 视频翻译 — **PARTIAL**

- 路由：`/tools/ai-video/video-translation` ｜ 工作区：`web/src/components/tools/workspaces/video-translation.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（PARTIAL）：真实运行上游 400；新增 JSON 内联分支仅单测+探针覆盖，无成功样例
- 三动作（UNVERIFIED）：无三动作记录
- 历史（PARTIAL）：自有历史实现（代码），本轮未实测
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：video6：PARTIAL  → 证据 `evidence/video6 报告`
- 可复核证据：`evidence/real-acceptance/VIDEO_TRANSLATION/result.json`
- **下一修复动作**：拿到一次真实成功样例；补三动作

### 39. `VIDEO_CONCAT` 视频拼接 — **PARTIAL**

- 路由：`/tools/ai-video/video-concat` ｜ 工作区：`web/src/components/tools/workspaces/video.tsx` ｜ 最近提交：`1f850b6 2026-10-29`
- 功能（PARTIAL）：未发起真实拼接（明示不声称出片）；输入校验/封面拦截/裁剪夹取已用真实 mp4 验证
- 三动作（UNVERIFIED）：notExercised=[真实拼接出片,封面多帧校验,下载/存资产/发画布]
- 历史（PASS）：历史区块 0 条空态 + 查看结果回填已验
- 案例（MISSING）：原站无案例模块
- 默认值（UNVERIFIED）：未测
- 视觉（PARTIAL）：b6：PARTIAL  → 证据 `evidence/b6-cases/visual-parity.json`
- 可复核证据：`evidence/real-acceptance/VIDEO_CONCAT/result.json`
- **下一修复动作**：真实拼接一次；补三动作

## 全局卡口（按影响面排序）

| # | 卡口 | 事实 | 影响工具数 | 证据 |
| --- | --- | --- | --- | --- |
| G1 | 默认值未落地 | 20 个工具 `defaults_keys=0`（字段名对齐、默认值全缺）；19 个工具从未测量 | 39 | `b9-visual-parity-20261029/visual-parity.json` |
| G2 | 视觉全站未 1:1 | 33 个 PARTIAL + 4 个 BLOCKED，仅 AREA_REPAIR / REMOVE_PEN 通过 | 37 | `B9-edit8`、`D19`、`B10`、`page-dom-20261028` |
| G3 | 案例模块仅 1 个真实 | 只有 AI_OUTPAINTING 接了 `AI_OUTPAINTING_CASES`+做同款；套图/商品设计显示「案例库尚未接入」/「暂无优秀案例」 | 38 | `b6-cases/visual-parity.json`、`tool-cases-data.ts` |
| G4 | 三动作未覆盖 | 17 个工具无真实点击回执（仅按钮渲染或单测） | 17 | 各 `<ID>/result.json` 的 `notExercised` |
| G5 | 历史面板未验 | 34 个工具挂了 dock，仅 17 个实测；自有历史 3 个已验（CHANGE_COLOR / VIDEO_CONCAT / AI_OUTPAINTING 代码已接） | 17 | `B5_HISTORY_DOCK/summary.json`(17/17) |
| G6 | provider/原站阻塞 | 视频链路无 `/videos` 端点（404）；FIX_COLOR 上游超时/502；AI_TEXT/ORNAMENT_TEXT 原站 302 下架 | 7 | 各 `result.json` 的 `blocker`/`defects` |
| G7 | 共享框架差异 | 促销条/徽标/更多菜单/用户区/主题/窄屏断点仍缺；窄屏本地数据不可用 | 34 | `b12-frame-parity-20261029/` |

## 修复优先级

**P0（阻塞交付口径，先做）**
1. `SALE_VIDEO` D1：页面时长/比例/分辨率未进请求体（恒用全局 `videoSeconds/size`）——即便通道恢复也会出错误规格成片。
2. `IMAGE_TO_VIDEO` config：全局 `videoModel` 指向已删除的 channel id，落回无 key 的默认 channel → 任何「跟随默认模型」的视频工具都会 401。
3. `PRINT_EXTRACT`：上游 200 但 UI 不落地 + 失败后刷新丢任务（P1，用户不可恢复）。
4. `AI_TEXT`：上游真实出图但结果区 98s 后仍「成功0」，属结果落地链路缺陷。
5. 视频工具统一：接一个可用 `/videos` provider，否则 35/36/37 永远无法出片。

**P1（1:1 口径，按工具批处理）**
6. 默认值（G1）：给 39 工具在 registry 声明默认值并补 B9 采集脚本字段；这是唯一"全 0"的维度。
7. 案例（G3）：把 `tool-cases-data.ts` 从 1 个工具扩到套图/商品设计/视频；无真实案例的工具先落"如实空态"而不是占位文案。
8. 视觉（G2）：按 `B10`（套图 6）→ `D19`（设计 10）→ video6 顺序逐页对齐列宽/间距/字号/文案，主题（浅色 `#f5f7fa` vs 本地深色）先定调。
9. 三动作（G4）：17 个 UNVERIFIED 工具逐个补真实点击（下载字节 / assetId / projectId+nodeId）。

**P2（收口）**
10. 历史 dock 剩余 17 个工具实测；`AI_OUTPAINTING` 历史自述与代码矛盾需复验。
11. 窄屏断点重采（B12：唯一汉堡为「打开 Agent」，override 未生效）。
12. `AI_TEXT`/`ORNAMENT_TEXT`/`SCENE_TRANSFER`/`IMAGE_TEXT_EDIT` 视觉基线需产品确认（原站入口失效）。

## 复核方法（可复算）

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
# 单工具证据
python3 -m json.tool docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/result.json
python3 -m json.tool docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/SCALE_UP/b4-actions.json
# 历史 dock 17 个
python3 -m json.tool docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/B5_HISTORY_DOCK/summary.json
# 默认值 / 案例
python3 -m json.tool docs/V1.0/plan_linkfox_navigation/evidence/b9-visual-parity-20261029/visual-parity.json
python3 -m json.tool docs/V1.0/plan_linkfox_navigation/evidence/b6-cases/visual-parity.json
# 本表机读版
python3 -c "import json;d=json.load(open('docs/V1.0/plan_linkfox_navigation/reports/final-1to1-matrix.json'));print(len(d['tools']))"
```

## 本次未做的事（边界声明）

- 未改动 `web/src` 任何文件；未重新提交任何真实生成请求（零算力消耗，全部基于既有真实证据）。
- 19 个工具的默认值、17 个工具的 dock 历史、窄屏断点三项**仍是未测量**，本表按"未验证"记录，不按"通过"处理。
- 3 个工具的视觉基线（AI_TEXT / ORNAMENT_TEXT / SCENE_TRANSFER）缺原站 DOM，不能声称 1:1。

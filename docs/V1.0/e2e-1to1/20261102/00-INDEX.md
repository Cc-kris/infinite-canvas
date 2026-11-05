# LinkFox 39 工具 E2E 验收总表（2026-11-02）

> 总报告见 [`FINAL-REPORT.md`](FINAL-REPORT.md)：结论为**目标未达成**，已列出可复现验证结果与未完成项。


## 验收口径

- 范围：39 个工具工作区；全局促销、账号、算力计费、学习中心、HelpDock 单列为壳层差异，不计入工具主体。
- 视口：双端 1600×1000；原站只读，不在 LinkFox 提交生成；本轮未产生真实生成费用。
- 判定：视觉/布局需要双端截图与几何证据；交互需要点击前后差异；功能以真实 provider 或本地处理代码路径 + 既有真实回执为准，本轮未实跑统一 NOT_RUN/UNVERIFIED。
- 第一轮报告是**修复前基线**；第二轮已根据 `local-current.png` 复核共享壳层与已修页面。
- 当前工程状态：39/39 双端报告、39/39 最新截图、39/39 布局检查通过、`tsc` 0 错误、1588 个单测全绿。
- 字段契约：`FIELD-PARITY.md` 与 `web/scripts/real-acceptance/spec-field-parity.mjs` 把「规格字段表」与「实现字段常量」逐页比对，**18 页一致、0 页差异**（其中 3 页通过运行时调用 `build*Fields` 取得真实请求字段）；另 21 页缺可提取来源，无法自动比对（不等于通过）。
- **基线可达性**（重要）：`BASELINE-AUDIT.md` 与 `web/scripts/real-acceptance/original-baseline-audit.mjs` 在登录态下逐页读页面正文核验：**31/39 页可做 1:1 对照且基线齐备**；3 页本账号不可见（AI_TEXT、ORNAMENT_TEXT、PRODUCT_MARKET_MATERIAL），5 页原站无独立页面（AI姿势生成、AI试衣XSY、场景裂变链接、上装换料、场景迁移）。
- **一处已更正的误判**：此前用本地 slug 拼 `/draw/<slug>` 探测，把 11 页误判为「原站不存在」并隔离其基线；原站路由与本地 slug 不是同一套命名（如服装套图是 `/draw/clothing-image-suite`）。已在登录态复核更正，恢复 9 张基线，详见 `LOGIN-RECHECK.md`。
- 真实生成证据：`IMAGE_TO_VIDEO/real-generation.md` 记录了唯一可跑通的真实闭环（本机账号只有视频模型 `MiniMax-H3`）：提交 200 → 上游任务 ID → 轮询 200 → 约 220s 出片（`<video src="blob:...">`）。
- 环境限制：本机测试账号 `GET /v1/models` 仅返回 1 个视频模型，无图像模型；图像类工具实测被上游拒绝（`404 Model "gpt-image-2" is not available for this group`），因此图像类真实生成在当前环境不可完成，这属于环境能力缺失而非代码缺陷。
- 功能闭环证据：`IMAGE_CROP/functional-accept.md` 记录了「真实上传 → 平台预设 → 下载真实 PNG 字节（IHDR 校验尺寸）」8/8 通过，脚本 `web/scripts/real-acceptance/crop-functional-accept.mjs` 可复现，且不消耗算力。
- 证据更新：`SCREENSHOT-INDEX.md` 与各页 `local-current.png` 已由 `tools-screenshot-audit.mjs` 用当前代码重跑（39/39，1600×1000），旧的过期截图不再作为判断依据。
- 当前 1:1 状态：**仍未完成**。第一轮 39 份报告中视觉 PASS 2、FAIL 28、BLOCKED 5；布局 PASS 5、FAIL 28、BLOCKED 5。第二轮复核确认共享壳层已改善，但三栏顺序、工具条、结果区空态与自造控件仍未全部收口。
- 本轮新增：全 39 页统一白底/紫主操作/300–360 配置列、左侧族导航、无重复页头；图片裁剪按原站重做（通栏工具条、535 空态卡、250 配置、平台列表、更多弹层收纳提交）；智能扩图改为画布 + 右侧 300 结果 + 底部参数条；高清放大改为顶部工具条 + 左原图/右高清图；一键换色改为画布 + 307 配置 + 330 结果三栏；商品精修改为画布 + 240 配置 + 300 结果三栏，并移除自造精修强度/色彩校正；色差修复改为画布 + 300 结果 + 255 配置（配置在最右），并移除自造区域色/目标色/版本区块；手部修复改为画布 + 240 配置 + 300 结果，工具条回到画布顶部；印花修复改为画布 + 240 校验/提交 + 300 结果，删除自造强度/版本/对比方式；商品替换改为画布 + 底部参数条 + 300 结果列，删除重复导航/键盘面板/锁定读数；姿势裂变把姿势库/补充描述收成折叠行卡、生成按钮吸底（原 y2758 → 首屏 944）；商品图仍是左配置 + 右模板，待重做为居中上传 + 类目画廊。商品套图/局部重绘/局部消除/AI穿戴/上装换料完成第二轮收口。
- 最终校验：`tsc` 0 错误；单测 1607 通过、0 失败；39 页布局门禁 39/39 通过；39/39 有双端报告与最新截图。

## 汇总

- 总工具：39
- 已有双端报告：39
- 视觉 PASS：2
- 布局 PASS：5
- 交互 PASS：36
- 功能本轮未实跑/未验证：16

| # | 工具 | 视觉 | 布局 | 交互 | 功能 | 截图 | 报告 |
|---:|---|---|---|---|---|---:|---|
| 1 | `PRODUCT_IMAGE_SUITE` | FAIL | FAIL | PASS | REAL_PROVIDER | 11 | [report](./PRODUCT_IMAGE_SUITE/report.md) |
| 2 | `DRESS_WEAR_SET` | FAIL | FAIL | PASS | REAL_PROVIDER | 7 | [report](./DRESS_WEAR_SET/report.md) |
| 3 | `CHANGE_COLOR_V2` | FAIL | FAIL | PASS | REAL_PROVIDER | 7 | [report](./CHANGE_COLOR_V2/report.md) |
| 4 | `IMAGE_TRANSLATION` | FAIL | FAIL | PASS | REAL_PROVIDER + 额外 OCR 本地扩展 | 6 | [report](./IMAGE_TRANSLATION/report.md) |
| 5 | `SCALE_UP` | FAIL | FAIL | PASS | REAL_PROVIDER | 6 | [report](./SCALE_UP/report.md) |
| 6 | `AI_OUTPAINTING` | FAIL | FAIL | PASS | REAL_PROVIDER | 6 | [report](./AI_OUTPAINTING/report.md) |
| 7 | `AREA_REPAIR` | FAIL | FAIL | PASS | REAL_PROVIDER | 6 | [report](./AREA_REPAIR/report.md) |
| 8 | `REMOVE_PEN` | FAIL | FAIL | PASS | REAL_PROVIDER | 7 | [report](./REMOVE_PEN/report.md) |
| 9 | `CHANGE_COLOR` | FAIL | FAIL | PASS | REAL_PROVIDER | 8 | [report](./CHANGE_COLOR/report.md) |
| 10 | `IMAGE_CROP` | FAIL | FAIL | PASS | LOCAL_PROCESSING | 7 | [report](./IMAGE_CROP/report.md) |
| 11 | `PRODUCT_REFINE` | FAIL | FAIL | PASS | REAL_PROVIDER | 10 | [report](./PRODUCT_REFINE/report.md) |
| 12 | `FIX_COLOR` | FAIL | FAIL | PASS | REAL_PROVIDER | 9 | [report](./FIX_COLOR/report.md) |
| 13 | `PRINTING_REPAIR` | FAIL | FAIL | PASS | REAL_PROVIDER | 7 | [report](./PRINTING_REPAIR/report.md) |
| 14 | `HAND_REPAIR` | FAIL | FAIL | PASS | REAL_PROVIDER | 6 | [report](./HAND_REPAIR/report.md) |
| 15 | `NEW_REPLACE_BG_V2` | FAIL | FAIL | PASS | UNVERIFIED | 6 | [report](./NEW_REPLACE_BG_V2/report.md) |
| 16 | `REPLACE_GOODS` | FAIL | FAIL | PASS | UNVERIFIED | 4 | [report](./REPLACE_GOODS/report.md) |
| 17 | `PRODUCT_SCENE` | FAIL | FAIL | PASS | UNVERIFIED | 2 | [report](./PRODUCT_SCENE/report.md) |
| 18 | `HANDHELD_GOODS` | FAIL | FAIL | 本地 PASS | UNVERIFIED | 4 | [report](./HANDHELD_GOODS/report.md) |
| 19 | `AI_DRESSING_V2` | FAIL | FAIL | PASS | UNVERIFIED | 4 | [report](./AI_DRESSING_V2/report.md) |
| 20 | `AI_POSTURE` | FAIL | FAIL | 本地 PASS | UNVERIFIED | 4 | [report](./AI_POSTURE/report.md) |
| 21 | `AI_WEARABLE` | FAIL | FAIL | PASS | REAL_PROVIDER | 22 | [report](./AI_WEARABLE/report.md) |
| 22 | `AI_TEXT` | BLOCKED | BLOCKED | PASS | REAL_PROVIDER | 5 | [report](./AI_TEXT/report.md) |
| 23 | `ORNAMENT_TEXT` | BLOCKED | BLOCKED | PASS | REAL_PROVIDER | 3 | [report](./ORNAMENT_TEXT/report.md) |
| 24 | `SDS_DESIGN` | FAIL | FAIL | PASS | REAL_PROVIDER | 15 | [report](./SDS_DESIGN/report.md) |
| 25 | `PRINT_EXTRACT` | FAIL | FAIL | PASS | REAL_PROVIDER | 11 | [report](./PRINT_EXTRACT/report.md) |
| 26 | `AI_POSE_GENERATOR` | BLOCKED | BLOCKED | PASS | REAL_PROVIDER | 9 | [report](./AI_POSE_GENERATOR/report.md) |
| 27 | `AI_DRESSING_XSY` | FAIL | FAIL | PASS | UNVERIFIED | 12 | [report](./AI_DRESSING_XSY/report.md) |
| 28 | `FISSION_LINK` | FAIL | FAIL | PASS | REAL_PROVIDER | 10 | [report](./FISSION_LINK/report.md) |
| 29 | `IMAGE_TEXT_EDIT` | BLOCKED | BLOCKED | PASS | REAL_PROVIDER | 5 | [report](./IMAGE_TEXT_EDIT/report.md) |
| 30 | `MATERIAL_UPPER_BODY` | FAIL | FAIL | PASS | UNVERIFIED | 12 | [report](./MATERIAL_UPPER_BODY/report.md) |
| 31 | `NEW_DESIGNER` | FAIL | FAIL | PASS | LOCAL_PROCESSING | 11 | [report](./NEW_DESIGNER/report.md) |
| 32 | `PRODUCT_MARKET_MATERIAL` | FAIL | FAIL | PASS | UNVERIFIED | 7 | [report](./PRODUCT_MARKET_MATERIAL/report.md) |
| 33 | `SCENE_TRANSFER` | BLOCKED | BLOCKED | PASS | UNVERIFIED | 6 | [report](./SCENE_TRANSFER/report.md) |
| 34 | `IMAGE_TO_VIDEO` | PARTIAL | PASS | PASS | NOT_RUN | 33 | [report](./IMAGE_TO_VIDEO/report.md) |
| 35 | `SALE_VIDEO` | PASS | PASS | PASS | NOT_RUN | 11 | [report](./SALE_VIDEO/report.md) |
| 36 | `VIDEO_REPLICATION` | PARTIAL | PASS | PASS | NOT_RUN | 12 | [report](./VIDEO_REPLICATION/report.md) |
| 37 | `AI_VIDEO_EDITING` | PASS | PARTIAL | PARTIAL | NOT_RUN | 6 | [report](./AI_VIDEO_EDITING/report.md) |
| 38 | `VIDEO_TRANSLATION` | PARTIAL | PASS | PASS | NOT_RUN | 12 | [report](./VIDEO_TRANSLATION/report.md) |
| 39 | `VIDEO_CONCAT` | PARTIAL | PASS | PASS | NOT_RUN | 8 | [report](./VIDEO_CONCAT/report.md) |

## 修复优先级

1. **P0 可达性**：AI_DRESSING_V2 无滚动容器；AI_POSTURE/NEW_REPLACE_BG_V2/HANDHELD_GOODS 的生成按钮在首屏外；AI_VIDEO_EDITING 资产库详情默认展开。
2. **P0 结构**：局部重绘/局部消除/商品精修/色差修复/印花修复/手部修复的结果区必须回到右侧独立列；配置栏宽度按页对齐原站。
3. **P1 自造 UI**：删除原站没有的公告条、检测类型/模特类型/场景类型、精修强度/色彩校正、修复版本/对比方式、重复历史列表。
4. **P1 素材入口**：作品库/商品库即使为空也要打开诚实空态弹层，不应直接 disabled。
5. **P1 默认值**：局部重绘 2 张/自动扩大开、AI穿戴 4 张、手部修复 4 张、裁剪 1024×1024、印花提取透明图默认关。
6. **P1 功能真实边界**：视频翻译仅提示词重生成；视频拼接非确定性；商品链接解析未接入；这些不得在验收中判 PASS。

## 证据

- 每工具目录：`docs/V1.0/e2e-1to1/20261102/<ID>/`（original.png、local.png、交互截图、report.md、meta/clicks JSON）
- 机读状态：`docs/V1.0/e2e-1to1/20261102/summary.json`

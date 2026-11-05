# agent-lf-suite：电商套图族 4 页视觉收口

任务空间：`agent-lf-suite`。原站只读（打开页面、点开弹层、量 DOM），没有点生成。

## 原站实测（1600×1000，2026-11-05）

| 项 | 商品套图 | 服装套图 | 套图换色 | 批量翻译 |
|---|---|---|---|---|
| 结果区页签 | 生成结果 / 优秀案例 + 右端「历史记录」外链 | 同左 | 同左 | 只有「生成结果」+ 右端「历史记录」 |
| 空态 | `_caseGuide` 958×488，无标题，3 个案例 | 同左，参数标签「上传服装图」 | 958×519，卡内标题「上传整套商品图，批量生成多色变体结果」20px，6 个案例，结果图 352×352 居中 | 白卡 850×590（圆角 12、内边距 40）+ 静态海报 770×465 + 16px #939599「快速翻译成多语言，快速上架」，无做同款 |
| 轮播顺序 | 与 `PRODUCT_SUITE_CASES` 前 3 条一致 | 与 `DRESS_SET_CASES` 前 3 条一致 | 与 `COLOR_V2_CASES` 前 6 条一致 | — |
| 或试试这些 | 上传卡内：分隔线 + 2 组（3 图 / 2 图），组卡白底 1px rgba(0,0,0,.08) 圆角 6 内边距 4，缩略 40×40 圆角 4，组间距 8 | 上传卡内：2 组（2 图 / 3 图） | 无 | 无 |

商品套图弹层（逐条核对 `SUITE_1TO1_NOTES.md`）：
- 模型设置：模型选择 = LF智能模型 G-2.5 Sunburst（NEW）/ 分辨率 1K 2K 4K / 品质 5 档 / 完成。本地「实际调用模型」行此前已删。
- 主副图设置：卖点图 / 白底图 / 场景图 / 商品尺寸图 / 特写图 / 特写白底图；「选择卖点图排版」；生成比例 1:1 3:4 4:3 2:3 自定比例 更多；图片尺寸 宽 px 高 px「按 2K · 1:1 自动计算，可直接修改」。生成比例在主副图弹层内，不是独立区块。
- A+图设置：高级A+（1464×600）/ 手机A+（600×450）/ 普通A+（970×600）/ 自定比例；「选择排版」。

## 进度

### 1. 商品套图 PRODUCT_IMAGE_SUITE（代码已改，测试通过）

- 上传卡 `hint` 槽内加「或试试这些」：分隔线 + 2 组真实示例（`PRODUCT_SUITE_SAMPLES`，图在 `web/public/__cases/product-image-suite/samples/`），点一组 = 整组入库进上传区、首图作商品图（复用 `applyCase`，改为支持多图）。
- 结果区空态：删掉孤立的「生成结果」小字、裸「一键做同款」按钮和一行空态文案，改为 `ToolCaseGuide`（`PRODUCT_SUITE_CASES` 前 3 条，参数标签「上传商品图」，垂直居中）。未上传时的校验提示行只在已有商品图时显示（无图原因仍挂在「开始生成」的 title 上）。
- 历史记录入口改成原站样式（时钟图标 + 12px 灰字，去掉 ↗）。
- 弹层：A+ 选项带尺寸标注（1464×600 / 600×450 / 970×600）；主副图排版标题改「选择卖点图排版」；「生成比例」从独立区块移进主副图弹层；模型设置弹层加「模型选择 · LF智能模型 G-2.5 Sunburst NEW」行。
- 未改（需动注册表 `features/tools/registry/product-image-suite.ts`，不在我的文件范围，且会改请求字段）：主副图类型集合（原站有「商品尺寸图」，本地是写死的 5 项）、比例集合（原站 1:1 3:4 4:3 2:3 自定比例 + 宽高 px，本地 schema 是 1:1 3:4 4:3 2:3 3:2）。
- `suite.test.tsx`：新增空态断言；「生成比例 / 5 比例」断言改为「默认折叠不渲染」。

### 2. 服装套图 DRESS_WEAR_SET（代码已改）

- 配置列：删掉自造步骤条（「1 2 3 第一步…我是高手，不再提醒」，原站这是新手引导气泡，按约定不复刻）、多余的「上传服装图」小标题和独立「优秀案例」分区卡。
- 上传卡内：限制行改进卡内（居中），下面加「或试试这些」2 组真实示例（`DRESS_SET_SAMPLES`，图在 `web/public/__cases/dress-wear-set/samples/`），点一组 = 整组入库进上传区。`applyCase` 改为支持多图。
- 结果区：从一个「生成结果」小卡改为原站结构：42px 页签栏「生成结果 / 优秀案例」+ 右端「历史记录」入口位；空态是 `ToolCaseGuide`（`DRESS_SET_CASES` 前 3 条，标签「上传服装图」）；原独立「优秀案例」移到「优秀案例」页签（`ToolCases` 全量）。有任务后的结果面板、分组、重试逻辑不变。
- 未改：上传上限原站文案「最多上传16张图」，本地 `DRESS_UPLOAD_LIMITS.maxFiles` = 5（边界值，需要用户确认才能改，文案按本地真实值显示）；配置列其余分区（品牌与合规为下拉平铺、模型为下拉 + chip、生成类型为两张卡）与原站「行卡 + 弹层」形态仍不同，属于本次 brief 之外的结构差异。

### 3. 套图换色 CHANGE_COLOR_V2（代码已改）

- 结果区空态：删掉「第一步：上传 1 张需要换色的商品图片」、结果区里重复的上传卡（左列已有同一上传入口）、3 张小卡横排和底部数字分页，改为单张 `ToolCaseGuide`：卡内标题「上传整套商品图，批量生成多色变体结果」、`COLOR_V2_CASES` 前 6 条（6 个分页点）、标签「上传商品图」、结果图按原站 352×352 并整行居中（用 className 任意变体约束 figure，不改共享组件）。
- 结果区 section 去掉整片白底，只保留 42px 白色页签条，内容透出主列 `#edeff5`（原站 `_body` 透明）。
- 删除无用的 `resultPage` / `emptyCasePages`。

### 4. 批量翻译 IMAGE_TRANSLATION（代码已改）

- 页签：只留「生成结果」；「历史记录」改为页签栏右端小入口（时钟图标 + 12px），点开仍是本地真实 `ToolHistoryDock`。
- 空态（未上传图片）：原站 `_guide > _imageBox` 形态，白卡 850 宽、圆角 12、内边距 40 + 原站静态海报（`web/public/__cases/image-translation/poster-translation.png`，原站同源 1564×850）+ 16px 灰字「快速翻译成多语言，快速上架」。原站这页没有做同款。
- 删掉两个只有 ▸ 三角的空折叠行：「校对」直接是可折叠卡（只在上传后出现）；「重试失败项 / 展开快照」只在有结果后出现，不再包一层空折叠。
- 「上传多张图片，开始批量翻译」从纯文字链改为原站描边按钮 + 箭头。

## 改动文件

- `web/src/components/tools/workspaces/suite.tsx`（只改 `ProductImageSuiteWorkspace` 内部与顶部 import，未碰 `ProductMarketMaterialWorkspace`）
- `web/src/components/tools/workspaces/dress-suite.tsx`
- `web/src/components/tools/workspaces/color-v2.tsx`
- `web/src/components/tools/workspaces/translate.tsx`
- `web/src/features/tools/tool-cases-data.ts`：末尾追加 `PRODUCT_SUITE_SAMPLES`、`DRESS_SET_SAMPLES`、`IMAGE_TRANSLATION_GUIDE_POSTER`
- `web/public/__cases/product-image-suite/samples/`（5 张）、`web/public/__cases/dress-wear-set/samples/`（5 张）、`web/public/__cases/image-translation/poster-translation.png`：原站 cdn 同源原图
- 测试：`suite.test.tsx`（改）、`suite-family-empty.test.tsx`（新建）

## 前后对比结论（重采本地截图，看 `<TOOL>/pair.jpg`）

- 商品套图：上传卡内示例组、结果区 958 宽案例轮播 + 3 个分页点已与原站一致。
- 服装套图：步骤条和独立优秀案例卡已去掉，示例组进上传卡，结果区有「生成结果 / 优秀案例」页签和案例轮播，已一致。
- 套图换色：单张大卡轮播（卡内标题、352×352 两图居中、6 个分页点）已与原站一致。
- 批量翻译：只有「生成结果」页签 + 右端历史入口，空态是原站海报白卡，空折叠行已删，已一致。
- 本地交互自测：点商品套图示例组 1 → 3 张图真实入库进上传区，「生成将使用第 1 张作为商品图」出现；主副图弹层里有「选择卖点图排版」与生成比例，模型弹层有「模型选择」。自测后已移除这 3 张，草稿恢复为空。

## 仍未收口

- 商品套图主副图类型集合（今天原站弹层是 卖点图 / 白底图 / 场景图 / 商品尺寸图 / 特写图 / 特写白底图，本地只缺「商品尺寸图」）、比例集合（缺「自定比例」与宽高 px 输入，多 3:2）：由 `features/tools/registry/product-image-suite.ts` 的 `MAIN_SUB_MODULES` / `SUITE_RATIOS` / zod schema 决定，会改请求字段与 prompt，需要主代理决定是否改注册表。
- 服装套图上传上限：原站 16 张，本地 `DRESS_UPLOAD_LIMITS.maxFiles` = 5，属于边界值，按 AGENTS.md 需用户确认才能改。
- 服装套图配置列其余分区（商品类目、品牌与合规、模型、生成内容）原站是「行卡 + 弹层」，本地是平铺表单，结构差异较大，不在本次 brief 内。
- 共享 `ToolCaseGuide` 与原站的小差异（不在我的文件范围）：箭头是 lucide 小白箭头，原站是 107×47 紫色渐变箭头图；标题 font-medium，原站 400。
- 截图里商品套图/服装套图的案例卡比原站稍宽、偏右，原因是本地主列更宽（窗口布局），不是组件尺寸问题。

## 测试

- `cd web && bun test src/components/tools/workspaces/suite.test.tsx src/components/tools/workspaces/suite-family-empty.test.tsx`：11 pass / 0 fail。
- `cd web && npx tsc --noEmit -p .`：102 个错误，全部在 `src/components/tools/workspaces/enhance.tsx`（另一个子任务正在改，缺 import）。用只包含我改动文件的临时 tsconfig 单独检查：0 错误。
- 过程中 dev server 曾短暂不可用、`video.tsx` / `image-text-edit.tsx` 出现 Vite 语法错误浮层（别的子任务的中间态），重采脚本改为等浮层消失再截图。

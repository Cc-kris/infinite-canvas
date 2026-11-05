# agent-lf-designer 报告：商品图设计器首页 + 图片文字编辑

负责工具：NEW_DESIGNER（`/tools/product-design/new-designer`）、IMAGE_TEXT_EDIT（`/tools/product-design/image-text-edit`）。

## 进度

- [阶段 0] 读完 README / AGENTS.md / VISUAL-PARITY.md、两页 original.png / local.png、`designer.tsx`、`image-text-edit.tsx`、`tool-workspace-columns.tsx`、`tools-layout-check.mjs`。现状：设计器首页已有隐藏的 `designer-home`（`homeOpen` 默认 false，模板是纯色块）；图片文字编辑是表单式三栏。两页都没有组件级 `*.test.tsx`，只有 adapter 测试。
- [阶段 1] 原站只读取证（ego-browser 空间 `agent-lf-designer`，未点任何模板/生成）：
  - `/draw/designer-home`：左侧二级导航 180px（项高 40、16px、选中 `#723cf9` + `rgba(141,52,249,.05)`）；头部白卡 240 高（拖拽上传框虚线 `#d9d9d9` + 渐变按钮 122×32 `#3a7df9→#723cf9`；右侧 370×208 是循环视频 `guide-ai-designer.mp4`，不是两张卡片）；「模板推荐」卡头 56 高，筛选：类型（卖点图/场景图/尺寸图/细节图/白底图）、适合品类（日用百货/家居家装/服饰箱包/美妆个护/家用电器/玩具类目/儿童 & 母婴/3C数码/办公用品）、版式（方形/横版/竖版）、搜索框「搜索关键词」；瀑布流 6 列、列宽 219、间距 10、悬停遮罩「以此模版创建新设计」；共 165 个模板，首屏接口每页 30。
  - 模板列表接口 `image/designer/official/list` 返回体是加密串，没有解密；改为在原站逐个选择筛选项、滚动到底，按出现的图片记录每个模板的类型/品类（只读 GET）。版式按图片宽高比判定。
  - 素材落盘：`web/public/__cases/new-designer/templates/` 40 张（原站首屏前 40 个，512 宽带原站水印，cwebp 压缩后 13–56KB）；`examples/product-1..6.webp`（「或试试这些」6 张）；`guide-ai-designer.mp4`（254KB，原站原文件）。
  - `/designer?type=78`：顶栏 64；左竖向菜单 56（文字/素材/背景/模板/标注/图层，项 56×56）；左面板 360（添加文字 / AI生成文案 / 搜索 / 默认字体样式 98×40 虚线卡 / 推荐字体风格 154×80 卡）；中间画布区灰底、底部缩放条 120×36；右面板 360（头「画布」48 高、「画布尺寸」下拉 326×32）。
- [阶段 2] 代码完成：新建 `designer-home.tsx`（首页），`designer.tsx` 改为默认进首页；`image-text-edit.tsx` 重排为原站编辑器布局。`npx tsc --noEmit -p .` 只剩 `handheld-goods.tsx(390)` 一处错误（别人的文件，未动）。
- [阶段 3] 测试：`bun test src/features/tools/adapters/new-designer.test.ts src/features/tools/adapters/image-text-edit.test.ts` 61 pass / 0 fail（更新了两处首屏渲染断言以匹配新布局，并新增首页 / 禁用入口断言）。
- [阶段 4] 本地截图重采（`/tmp/agent-lf-designer-capture.mjs`，SIDES=local）+ `visual-parity-pair.py`，浏览器功能自测（未点任何生成），`task.finish({ keep: [] })` 已结束空间。

## 改动文件

| 文件 | 改动 |
|---|---|
| `web/src/components/tools/workspaces/designer-home.tsx`（新建） | 导出 `DesignerHome`、`DESIGNER_HOME_TEMPLATES`、`DesignerHomeTemplate`。原站首页：180px 二级导航（创建设计 / 我的设计 / 我的模板 / 团队空间）、虚线拖拽上传框 + 渐变「上传商品图」+「或试试这些」6 张示例、右侧原站演示视频、「模板推荐」卡（类型 / 适合品类 / 版式 三个筛选 + 搜索），6 列最矮列优先瀑布流，悬停遮罩「以此模版创建新设计」。我的设计 = 本地唯一草稿卡（有草稿时可「继续编辑」）；我的模板 / 团队空间 = 诚实空态。 |
| `web/src/components/tools/workspaces/designer.tsx` | 删除原来隐藏的纯色块首页和 5 个色块模板；`homeOpen` 默认 `!imageUrl`（宿主带图进来直接进编辑器）；新增 `startDocument` / `startFromUpload` / `startFromTemplate`：上传商品图真实入库 → 新建 1200×1200 文档，商品图按原比例居中（长边 80%）；点模板 → 按模板宽高比新建文档（长边 1024），模板图作为铺满画布的底图图层；历史回放时关闭首页。编辑器本身没改。 |
| `web/src/components/tools/workspaces/image-text-edit.tsx` | 按原站编辑器重排：顶栏（返回 / 标题 / 撤销重做 / 「已保存到本地草稿」/ 预计输出 / 生成图片文字）；56px 竖向工具栏（文字 / 背景 / 图层可用；素材 / 模板 / 标注禁用 + title）；360px 左面板（文字：添加文字、AI生成文案（禁用 + title）、字体风格搜索、默认字体样式 标题·副标题·正文、推荐字体风格卡 = 本地 5 个真实字族；背景：源图上传 / 更换；图层：文字框列表含排序删除）；中间灰底画布区 + 底部缩放条（自适应 / ±10% / 点百分比恢复自适应）；右 360px 面板（选中文字框 = 原属性编辑；否则 = 画布尺寸（只读，等于源图）+ 导出格式 PNG/JPEG/WebP），下方固定校验、上传提示和生成结果（`ToolResult` + 输入快照）。所有 `data-testid` 保留。另修一个已有 bug：草稿从来没写 `assetIds`，刷新后源图 blob: 地址失效显示裂图；现在写入 `sourceAssetIds`，恢复时用 `loadToolAssetRecords` 按 storageKey 重新签发；找不到资产时提示「上次的源图已不在本地，请重新上传。」 |
| `web/src/features/tools/adapters/new-designer.test.ts` | 渲染测试补首页断言（导航 / 上传区 / 筛选文案、40 张模板、6 张示例；React 19 SSR 会给 `<img>` 多出 preload link，所以按去重后的路径数计数）；带 `imageUrl` 时断言不显示首页。 |
| `web/src/features/tools/adapters/image-text-edit.test.ts` | 首屏渲染断言改为新布局文案；新增 4 个禁用入口（AI生成文案 / 素材 / 模板 / 标注）的 disabled + title 断言。 |
| `web/public/__cases/new-designer/` | `templates/*.webp` 40 张（13–56KB）、`examples/product-1..6.webp`、`guide-ai-designer.mp4`（254KB），合计 1.5MB。 |

没有改 `tool-page.tsx`、`text.tsx`、`tool-cases-data.ts`、`globals.css`。首页渲染在 `DesignerWorkspace` 内部，`NewDesignerHostWorkspace` 不需要改挂载入口。

## 前后对比

- **NEW_DESIGNER**：之前直接进三栏编辑器；现在首屏和原站同构（二级导航、上传区 + 示例、右侧演示视频、模板推荐筛选 + 6 列瀑布流，模板图与顺序都取自原站首屏）。`pair.jpg` 剩下的差异来自外壳：本地多一列 180px 工具侧栏，原站顶部是自己的导航和营销条。
- **IMAGE_TEXT_EDIT**：之前是表单式三栏 + 下方结果卡；现在是原站编辑器的五段结构（顶栏 / 竖向工具栏 / 左面板 / 灰底画布 + 缩放 / 右面板），尺寸取自原站 DOM（56 / 360 / 360、顶栏 64、缩放条 36 高）。
- 浏览器功能自测（本地）：图片文字编辑「上传 → 添加文字 → 右面板切到『文字』属性 → 填字后生成按钮解除禁用」通过（没有点生成）；上传后刷新，源图和文字框都能恢复。设计器：点模板进编辑器（1 层，763×1024，导出可用），点示例商品和上传商品图都能进编辑器，商品图居中；「我的设计」显示草稿卡。

## 仍未收口的差异和原因

1. **布局断言 NEW_DESIGNER 失败**：`tools-layout-check.mjs --only=NEW_DESIGNER,IMAGE_TEXT_EDIT --json=/tmp/...` 结果是 IMAGE_TEXT_EDIT PASS（配置列 360 / 主区 1004，74%），NEW_DESIGNER FAIL「配置栏 0px」。原因：原站首页本身没有 240–360px 的配置列（只有 180px 二级导航），编辑器的 `ToolWorkspaceColumns` 在首页时是隐藏的。**需要主代理把 `NEW_DESIGNER` 加进该脚本的 `NO_CONFIG_COLUMN`**（我没改脚本，也没覆盖 `docs/analysis/tools-layout-baseline.json`）。
2. **全局样式冲突（需要主代理决定是否改 `globals.css`）**：antd reset 注入的未分层 `p { margin-bottom: 1em }` 会压过 Tailwind 的 `m*-` 工具类；`button { color: inherit }` 的 `revert-layer` 回落只覆盖 `tool-config-column` / `tool-main-column` 等容器，首页导航和编辑器顶栏 / 竖向工具栏不在范围内。我在自己的文件里绕开：`<p>` 改用 `<div>`，这些按钮的文字色用 `text-…!`。全局修法是给 `globals.css` 加 `p` 的 margin 回落，并把 `[data-testid="tool-workspace"] button` 加进现有选择器。
3. **模板只能当底图**：原站模板是可编辑的分层文档，列表接口返回体加密，拿不到图层结构，所以本地点模板 = 模板整图作为底图图层，图内文字不可编辑。模板图带原站水印「本图片由 LinkFox AI 生成」（OSS 签名处理参数，去掉会 403）。
4. **搜索只匹配标签**：原站模板名称拿不到，搜索框匹配类型 / 品类 / 版式标签（输入框 title 有说明）。
5. **推荐字体风格卡**：原站卡片是远端字体的预览图（Brazil / Moda / Story 等），本地没有这些字体，卡片换成本地 5 个真实字族，用对应字体渲染。
6. **图片文字编辑顶栏**：原站「下载图片」是本地合成导出；本地这个工具的真实产物是模型生成结果，所以顶栏主按钮是「生成图片文字」，下载在右面板结果区的 `ToolResult` 里。原站「…」菜单和画布尺寸下拉没做（本地画布尺寸固定等于源图，只读展示）。
7. 本地截图里的手表图和「（空文本）」框是我自测留在浏览器本地草稿里的数据，不是代码差异。

## 文档 / CHANGELOG（按 README 不归我改，请主代理补）

- `CHANGELOG.md` Unreleased 建议：`[调整] 商品图设计器新增原站同款首页（上传商品图 / 示例商品 / 模板推荐筛选瀑布流）；图片文字编辑改为原站编辑器布局。` `[修复] 图片文字编辑刷新后源图丢失（草稿未保存源资产 id）。`
- `pending-test.mdx` 建议加：设计器首页上传 / 示例 / 模板进入编辑器；图片文字编辑新布局下上传、框选、属性、导出格式、生成；刷新后源图恢复。

## 测试命令与结果

- `cd web && npx tsc --noEmit -p .`：无错误（中途出现过 `handheld-goods.tsx(390)` 一处错误，属其他任务的并发改动，最终复跑已消失）。
- `cd web && bun test src/features/tools/adapters/new-designer.test.ts src/features/tools/adapters/image-text-edit.test.ts`：61 pass / 0 fail。
- 截图：`docs/V1.0/e2e-1to1/20261105/NEW_DESIGNER/{local.png,pair.jpg}`、`IMAGE_TEXT_EDIT/{local.png,pair.jpg}` 已重采。

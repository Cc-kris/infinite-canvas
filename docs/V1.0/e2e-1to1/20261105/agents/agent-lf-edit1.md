# agent-lf-edit1：智能修图画布类工具（第一组）视觉 1:1 收口

任务空间 `agent-lf-edit1`；原站只读（未点生成/开始消除/开始精修）。本地 1600×1000 截图用 `/tmp/agent-lf-edit1-capture.mjs`（`SIDES=["local"]`）重采，`pair.jpg` 左原站右本地。

## 原站实测要点（ego-browser，1600×1000，DOM getBoundingClientRect / getComputedStyle）

- 主按钮「从本地上传 / 上传图片 / 开始精修 / 立即生成」：`linear-gradient(90deg,#3a7df9,#723cf9)`、圆角 6、高 32（工具条内 28）；次按钮白底 1px `#722ed1` 边紫字。
- 局部重绘 / 局部消除空态按钮是另一套：`从本地上传` 通栏 30 高圆角 4 纯紫，下方「从作品库选择 / 从商品库选择」各半。
- 结果列：`#edeff5` 圆角 8；页签头白底 42 高，选中 14px 紫字 + 2px 紫下划线；右侧 12px 紫色「历史记录」带时钟图标；空态 antd `Empty` simple（64×41）+ 14px 60% 黑字。
- 空态示例素材（已下载到 `web/public/__cases/<slug>/`，全部为原站同源文件）：
  - 高清放大：`file-ai.linkfox.com/UPLOAD/example/upscale-before.png / upscale-after.png`
  - 商品精修：`cdn.linkfox.com/ai-site/workbench/product-refine-{before,after}-{1..4}.jpg`（slick 轮播 4 组）
  - 智能扩图：`guide-aioutpainting.mp4` + `poster-aioutpainting.png`（原 2.5MB PNG，转存为 JPG 海报）
  - 局部重绘：`guide-area-repair.mp4` + `guide-area-repair.jpg`
  - 局部消除：`guide-remove-pen.mp4` + 「或试试这些」`uploadExample29~32.jpg`
  - 一键换色：`guide-changecolor.mp4`
- 注意：原站多数空态示例是循环播放的引导视频，不是静态图；本地按原站用 `<video autoplay muted loop>` + 海报。

## 公共改动：`web/src/components/tools/edit8-frame.tsx`（只追加导出，未改已有组件/props）

- `edit8GradientButtonClass` / `edit8OutlineButtonClass`：原站主/次按钮。
- `useEdit8Upload`：真实 `uploadToolAsset` / `adoptLibraryAsset`，失败原因原样展示。
- `Edit8UploadCard`：画布空态白卡（media + heading + 按钮组，`layout="row" | "stacked"`，整卡可拖拽；作品库就地展开；商品库按钮如实禁用）。隐藏 input 保留 `data-testid="tool-asset-file-input"`，验收脚本选择器不变。
- `Edit8Dropzone`：配置列 antd Dragger 样式上传框。
- `Edit8Switch`：antd Switch 外观的真实 checkbox（保留 `checked` 语义与 testid）。
- `Edit8ResultTabs` / `Edit8Empty`：结果列页签头与空态。
- 踩坑：`antd/dist/reset.css` 注入未分层的 `h1-h6 { margin-bottom: .5em }`、`p { margin-bottom: 1em }`、`button { color: inherit }`，会压过 Tailwind v4 分层工具类。`tool-main-column / tool-config-column` 内按钮已由 globals.css 回落，但结果列等其他容器没有。本组用 `m-0!` / `text-primary!` 局部处理，未改 globals.css。建议主代理评估是否把 `p, h1-h6` 的 margin 也按 globals.css 现有做法回落（会影响全部工具页，属于跨页决策）。

## 进度

### SCALE_UP 高清放大 ✅

改动：`enhance.tsx` 的 `ScaleUpWorkspace` 视图。
- 去掉右侧独立 620px 结果列 → 主区 `#edeff5` 圆角 8 = 40px 白色单行工具条 + 左「原图」/ 右「高清放大图」两栏等宽，两栏顶端浮灰色标签（↙ 原图 / 高清放大图 ↘）。
- 工具条：四个模式按钮 antd small default 样式（28 高、圆角 4、12px，「自定义」112 宽）；面部美化改 small Switch；分隔线 + 「重新上传」；右侧约 43% 宽为渐变「立即生成」+「下载图片」+ 紫色「历史记录」。未上传时阻塞原因挂在生成按钮 `title`。
- 左栏空态卡 420 宽：原站示例大图 + 左上 100×81 白边原图缩略 + 「原图 / 高清放大后」标签 + 26px 标题 + 20px 灰副标题 + 「从本地上传 / 从作品库选择 / 批量高清放大 →」（批量本地未接入，禁用）+ 三行限制提示。
- 右栏空态 antd Empty +「暂无结果图 / 请在左侧上传图片后，进行图片高清放大操作」（16px，同原站）。
- 输出尺寸只在已上传原图后显示（原站空态不显示）。
- pair 结论：结构、尺寸、文案、示例图与原站一致。剩余差异：原站空态时「立即生成」仍是亮色（点了才提示），本地按「没有原图不可提交」保持禁用；原站工具条右侧有一个禁用「⋮」更多按钮，下拉内容不可见，本地不做。

### PRODUCT_REFINE 商品精修 ✅

改动：`enhance.tsx` 的 `ProductRefineWorkspace` 视图；删除原站没有的 `ComparePreviewCard`（画布与结果列两条 4 格槽位条）和重复的「开始精修」。
- 三列：画布 `#edeff5` | 配置 240（白卡）+ 卡外渐变「开始精修」| 结果 300，列间距 10，外边距 10。
- 画布空态卡 542 宽：原站 4 组「精修前 | 精修后」示例（各 271×300，左上胶囊标签，底部分页点可切换）+ 20px「商品精修」+ 16px 灰两行说明 +「上传图片 / 从作品库选择」。原站轮播自动播放；本地只做点击切换，未加定时器。
- 配置：「精修模式」分段单选（整图精修 / 去背景精修，antd Radio.Button 样式）→「上传待精修的商品图」Dragger → 底部 💡 尺寸规则提示。上传后在上传框下方显示原图尺寸与预计输出尺寸。
- 结果列：只有「生成结果」页签 + 右侧「历史记录」链接 + antd Empty「暂无生成结果图」。
- pair 结论：结构、文案、示例图一致。

### AI_OUTPAINTING 智能扩图 ✅

改动：`outpaint.tsx` 视图。
- 去掉画布顶部的 inline `OrigRail`（已被 globals.css 隐藏，DOM 也删除）。
- 布局：左画布卡（白边框圆角 8，内部 `#edeff5` 画布 + 底部 48px 白色参数条，上边 3px `#f5f7fa`）| 右结果卡（`#edeff5`），两列按原站宽度比 884:502，间距 10。原来参数条横跨两列，现在只在画布卡底部。
- 参数条按原站：灰底 `#f7f7f7` 圆角 6 的分组「默认尺寸 [1024] × [1024]」/ 提示词输入 /「生成：4张 ⌄」+ 187 宽渐变「立即生成」。
- 空态卡 474×474：原站引导视频 `guide-aioutpainting.mp4`（海报为原站 poster）+ 20px「智能扩图」+ 16px 说明 + 渐变「从本地上传」+ 紫边「从作品库选择」。
- 结果卡页签「生成结果 / 优秀案例」+ 紫色「历史记录」，空态「暂无生成结果图 / 快在左侧操作智能扩图吧~」。
- 剩余差异：原站「默认尺寸」是带图标的下拉，下拉项本地没有对应选项（本地尺寸/比例预设在上传后的画布工具条里），保持文本标签。

### AREA_REPAIR 局部重绘 ✅

改动：`mask.tsx` 的 `MaskWorkspace` 视图；删除旧的 `MaskUploadCard`（两处调用都改用 `Edit8UploadCard`）。
- 浏览器里的残留草稿：本地局部重绘原来没有「移除已上传图」的入口。按原站在工具条加了「重新上传」（只在已上传时显示），用它清掉残留图后再对照空态。
- 画布：`#edeff5` + 40px 白色工具条（画笔 / 大小 InputNumber 框 + 像素 ⌄ / 自动扩大选择区域 small Switch / 反选 / 撤销 / 重做 / 重置，禁用态 25% 黑）。
- 空态：542 宽 `#f7f7f7` 面板内 `#fafafa` 卡，原站引导视频 `guide-area-repair.mp4`（海报 `guide-area-repair.jpg`）+ 22px 标题 + 两行灰说明 + 通栏「从本地上传」+「从作品库选择 / 从商品库选择」各半（商品库禁用）。
- 配置：白卡「重绘描述*」原站 placeholder「请补充重绘画面中想要出现的内容，支持中英文，例如：加一个包，卷发，微笑，眼睛睁大等。」+ 右下 `0 / 600`；「生成张数」1/2/3/4（选中 `#f9f0ff` 底紫边）；卡外渐变「立即生成」。去掉本地多出的「将生成 N 张」行（改为按钮 title）。
- 结果列：`#edeff5` + 「生成结果」页签 + 紫色「历史记录」+ 空态。
- 剩余差异：pair 截图里本地「重绘描述」框内有残留草稿文字（浏览器草稿，不是代码差异）。

### REMOVE_PEN 局部消除 ✅

改动：`mask.tsx` 的 `RemovePenWorkspace` 视图。
- 工具条：48px 白条（1px `#d8d8d8` 边、上圆角 8、轻阴影）左右两半。左：画笔 / 大小 / 重置 / 撤销 / 重做 / 重新上传。右：渐变「开始消除」+ 带图标的「下载图片 / 高清放大 / 商品图 / 手部修复」（无结果时禁用灰底）+ 紫色「历史记录」。
- 空态：540 宽 `#f7f7f7` 面板内 520 宽卡：原站引导视频 `guide-remove-pen.mp4` + 22px「局部消除」+ 说明 + 通栏「从本地上传」+ 两个各半库按钮 +「或试试这些」分隔线 + 4 张 40×40 原站示例（`uploadExample29~32.jpg`，原来用的是仓库里别的工具的素材）。点示例仍走真实入库再载入画布。
- pair 结论：结构、尺寸、文案、示例图一致。原站空态时「开始消除」是亮色，本地无图时禁用（同高清放大）。

### CHANGE_COLOR 一键换色 ✅

改动：`color.tsx`。
- 布局：左白卡 = `#edeff5` 画布 + 307 配置列 | 右 330 结果卡（`#edeff5`），间距 10。
- 分区顺序与默认展开态按原站：收藏色卡（收起）→ 选择颜色（展开）→ 细调颜色效果（展开）→ 光影优化（收起）→ 边缘优化（展开）→ 色彩平衡（收起）→ 曲线（收起）。分区样式为 antd Collapse（`#f9f9f9` 圆角 8、12px 30% 黑标题、收起 ∧ / 展开 ∨）。收起的分区内容仍在 DOM 里（`hidden`），表单值和测试锚点不受影响。
- 字段归位（只调视图，请求字段不变）：「曲线」原来塞在「边缘优化」里，现在单独成「曲线」分区；「边缘优化 / 颜色边缘修复」两个开关原来在「光影优化」里，现在放进「边缘优化」分区；「光影优化」分区 =「根据原图优化光影」开关 + 强度滑杆 + 重置。
- 选择颜色：一行 5 个原站圆形色点（`#EDB393 #90CCAF #88ACEC #9285F4 #EB88A0`，32px 白圈 + 24px 色块）+ 彩虹取色器（背后是真实 `<input type=color>`）+ 吸管（本地未接入，禁用）；下面是颜色参考图 Dragger（`Edit8Dropzone`，上传后显示缩略图和移除按钮，刷新后按 `referenceAssetId` 恢复）；去除杂色 Switch（开启/关闭字样）；通栏胶囊「重置」。
- 细调：每项「标签 + 50×24 数值框」一行，滑杆在下一行，底部胶囊「重置」。
- 画布空态：660 宽 `#f7f7f7` 面板内白卡：原站引导视频 `guide-changecolor.mp4` + 20px「一键快速上色」+ 16px 说明 +「从本地上传 / 从作品库选择 / 从商品库选择 / 批量一键换色 →」。原站「批量一键换色」跳到 `/draw/batch-generate-images`（批量生图），本地没有这一页，所以保持禁用。
- 结果卡：「生成结果 / 优秀案例」页签 + 紫色「历史记录」+ 空态。删除原站没有的顶部「支持上传颜色参考图…知道了」提示卡；「本次提交」参数卡只在上传原图后显示（原站没有这张卡，属于本地调试信息，保留但空态不显示）。
- 上传后画布工具条加「重新上传」，用来清掉已上传的原图。
- 剩余差异：本地在色点下方保留一行 hex 输入框（`change-color-hex`，`run-one.mjs` 真实生成配方依赖它），原站没有。原站空态时配置项整体禁用，本地空态时配置可编辑。

## 自测

- `cd web && npx tsc --noEmit -p .`：通过（0 错误）。中途一度报 `handheld-goods.tsx`（别的子任务的文件），最后一次已无错误。
- `cd web && bun test src/components/tools/workspaces/{color,enhance,outpaint,mask}.test.tsx src/features/tools/adapters/remove-pen.test.ts src/components/tools/tool-result.test.tsx`：79 pass / 0 fail。
  - 更新的断言：`enhance.test.tsx`（去掉空态「待上传原图 / 输出尺寸」，原站空态不显示；新增原站示例图、两栏文案、商品精修渲染用例）；`color.test.tsx`（加分区顺序、原站色点、不渲染提示卡和空态「本次提交」的断言）。
  - 踩坑：`Edit8Empty` 起初用 antd `Empty`，`import("antd")` 冷启动约 6 秒，`remove-pen.test.ts` 的渲染用例超过 bun 默认 5 秒超时。已改为内联同款 64×41 SVG，没有改超时设置。
- 浏览器上传冒烟（ego-browser，本地 `web/public/__acc/product-watch.jpg`，未点任何生成）：六个页面的空态卡上传都能进入已上传状态；高清放大、商品精修、局部重绘、局部消除、智能扩图、一键换色的「重新上传」都能回到空态。测试结束后六个页面都已回到空态，没有残留草稿。
- 截图：六个工具都重采了 `local.png` / `pair.jpg`（`docs/V1.0/e2e-1to1/20261105/<TOOL>/`）。

## 需要主代理关注

1. `antd/dist/reset.css` 的未分层规则（`h1-h6/p` margin、`button { color: inherit }`）会压过 Tailwind v4 分层工具类。本组用 `!` 后缀局部处理；globals.css 现有的 `revert-layer` 回落只覆盖 `tool-main-column / tool-config-column` 等容器里的按钮，结果列等容器没覆盖，`p/h*` margin 也没覆盖。是否扩大回落范围需主代理决定（会影响全部工具页）。
2. 原站这几页的空态主按钮「立即生成 / 开始消除」在未上传时仍是亮色可点，本地按「不可提交」保持禁用。这是行为差异，有意保留。
3. 新增素材在 `web/public/__cases/{scale-up,product-refine,ai-outpainting,area-repair,remove-pen,change-color}/`，全部从原站登录态页面下载的同源文件，共约 3.2MB（含 4 个引导 mp4，约 1.8MB）。没有往 `tool-cases-data.ts` 追加常量，这几个工具的空态是静态示例或引导视频，不是「做同款」案例数据。

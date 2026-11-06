# agent-lf-pbeditor：商品图（NEW_REPLACE_BG_V2）第二步编辑器照原站补齐 + 无限画布配色

任务空间 `agent-lf-pbeditor`（ego-browser space 11，已 `task.finish({ keep: [] })`）。本地路由 `/tools/product-design/new-replace-bg-v2`，原站 `/draw/product-home` → `/draw/ai-product`。全程没有点原站和本地的「立即生成」，也没有提交任何任务。

## 原站核对结论（只读，登录态）

- **布局**：第二步是全屏编辑器，站点左侧族导航隐藏。左窄栏（原站约 84px）上是「返回 / 参考图 / 商品 / 元素」，底部是「免责声明」。抽屉（约 776px）**浮在画布上**，不挤压画布。中间画布顶部是小贴士条，正文是「您可以调整商品主体到合适的画面位置，或调整参考图大小、位置、消除的区域等。」。右侧配置栏 300px。
- **参考图抽屉页签**：智能推荐 / 预设 / 我的 / 收藏 / 历史 / 采集。
  - 智能推荐：排序（智能推荐 / 按收藏时间 / 按素材热度）+ 搜索；「商品：」全部 + 16 类；「场景：」全部 / 室内 / 室外 / 节日活动 / 简单背景 / 工作场所 / 休闲场所 / 运动场所 / 自然环境；「收起」；建议条；5 列卡片。
  - 预设：三个下拉，品类（全部 + 3C数码 / 日用百货 / 美妆个护 / 服饰箱包 / 家居家装 / 家用电器 / 钟表首饰 / 食品饮料 / 母婴产品，默认美妆个护）、场景（纯色 / 展台 / 简约 / 礼物 / 自然 / 户外 / 运动 / 鲜花 / 节日）、视角（水平拍摄 / 倾斜30°拍摄 / 倾斜45°拍摄 / 垂直俯拍）。卡片是无标题的纯背景图。
  - 我的：「上传参考图」卡片。
  - 收藏：「来自：智能推荐 / 预设场景」+「在智能推荐图右下角点击星号按钮…加入收藏」。
  - 历史：「POD素材 / 场景素材」下拉 +「选择没有过多主体的场景图，效果更佳!」+「没有更多数据了」。
  - 采集：「暂无素材图 / 通过插件…下载插件」。
- **商品**：抽屉页签是「商品素材 / 素材库」。商品素材里有「上传商品图」卡和本次会话的抠图结果，素材库里有「添加素材筛选分类 / 采集素材」和空态。
- **元素**：抽屉页签是「我的元素 / 素材库」，只有「上传元素图」卡片。**原站没有内置贴纸**，元素就是用户自己上传的图片图层，所以没有需要下载的原站元素素材。
- **画布**：
  - 选中商品时，工具条是「编辑主图」+ 继续编辑 / 上移一层 / 下移一层 / 透视 / 扭曲 / 垂直翻转 / 水平翻转 / 重置大小和位置 / 删除（tooltip 实测）。
  - 选中参考图时，底部是「背景调节 小—大（antd slider min 1、max 3）/ 重置 / 删除」。slider 以画布中心缩放参考图，参考图也能拖动。
- **配置栏**：
  - 「商品替换」下多出「高级自定义 → 保留遮挡物 开启/关闭」（默认关闭；未选参考图时开关禁用），说明文字是「提取商品主体前的遮挡物置于画面最顶层，保留原图的遮挡关系。」。「商品合成」下没有高级自定义。
  - 商品替换下，已选参考图卡片会显示原站识别出的「替换区域」白色剪影，还有「编辑替换区域」按钮。
  - 卡片 hover 时显示「编辑 / 删除 / 重新选择」。
- **抠图弹窗**（上传 product-watch.jpg 实测）：
  - 原站真的先跑了自动抠图，弹窗打开时右侧已经是抠好的结果。
  - 顶栏：手动选择 / 保留 / 去除 / 反选 / 重置 / 撤销 / 重做 / 局部消除 / 预览背景色（透明 / 白色 / 黑色 / 绿色 / 其他）/ 取消 / 确认使用。
  - 左侧工具列：自动识别 / 手动选择 / 画笔（大小 / 硬度 / 不透明度）/ 橡皮擦 / 钢笔 / 移动 / 缩放。
  - 左边是「原图」，右边是「保留区域」棋盘格预览，另有「也可以 上传一张蒙版图 (已经抠好的商品的透明图)」。
  - 「局部消除」会打开第二个弹窗（画笔 / 开始消除），需要重绘模型。

## 改动文件

- `web/src/components/tools/workspaces/product-bg.tsx`：第二步按原站重做成全屏编辑器，首屏和编辑器都改用无限画布配色。
- 新建 `web/src/components/tools/workspaces/product-bg-cutout.tsx`：抠图编辑弹窗。
- 新建 `web/src/components/tools/workspaces/product-bg-panels.tsx`：场景卡、参考图抽屉（6 个页签）、商品 / 元素抽屉。
- `web/src/features/tools/registry/new-replace-bg-v2-scenes.ts`：在文件末尾追加抽屉页签、场景筛选项、预设三个下拉、43 张预设背景索引、`productBgPrompt` / `productBgOcclusionOf` / `productBgTitleOf`、保留遮挡物说明。
- `web/src/features/tools/adapters/new-replace-bg-v2.test.ts`：新增 2 个测试（保留遮挡物进提示词并通过防丢参守卫；抽屉页签和预设按品类过滤）。
- `web/scripts/real-acceptance/run-one.mjs`：只改 `NEW_REPLACE_BG_V2` 配方。上传后抠图弹窗会自动打开，所以删掉了 `scene-cutout-mode-mask` 一步，改为等弹窗出现 → 上传蒙版 → 确认使用 → 等弹窗关闭。抽屉没开时先点「参考图」。
- 新建 `web/public/__cases/new-replace-bg-v2/presets/preset-01~43.webp`：原站「预设」页签每个品类的前 12 张（不足 12 张取全部），去重后 43 张，512 宽 webp，合计 836KB。来源是 `file-ai.linkfox.com/UPLOAD/MANAGE/*`，用 OSS `resize,w_512/format,webp` 下载，与原站同源。
- **没有改** `gateway.ts`（没有新增字段）、`tool-page.tsx`（全屏见下文）、adapter 本体。

## 逐项完成情况

1. **全屏编辑器**（已完成）：第二步渲染期间，组件内的 `<style>` 隐藏 `.tool-linkfox-surface [data-testid="tool-sidebar"]`；回到首屏后族导航恢复（浅色和深色截图都已核对）。`tool-page.tsx` 里的 `WithRail` inline 条本来就被 `globals.css` 设成 `display:none`，不占位，所以没改 `tool-page.tsx`。新增了显式的 `editing` 状态：编辑器里删除商品后停在编辑器，画布中间显示「上传商品」按钮，与原站一致。
2. **左窄栏「商品 / 元素」**（已完成）：
   - 商品抽屉：「商品素材」页签有「上传商品图」卡和本次会话用过的商品（点击切换，并记住各自的蒙版）；「素材库」页签读本地作品库 `useAssetStore` 的图片。
   - 元素抽屉：「我的元素」页签有「上传元素图」卡和已上传的元素；「素材库」页签同样读作品库。
   - 元素是画布图层，可拖动、可用右上角手柄缩放、可删除。
3. **参考图抽屉六个页签**（已完成）：
   - 智能推荐：「场景：」行已补上，但只有「全部」可用，其余选项置灰并有 title 说明（本地场景图没有室内 / 室外属性）。「收起 / 展开」已做。
   - 预设：品类下拉真实过滤 43 张原站预设背景；场景 / 视角下拉只保留「全部」并置灰。我在原站逐项抓过，场景 / 视角的筛选结果和品类对不上（例如任何品类选「节日」都返回同一批 12 张），这份数据不可信，所以没有标注。
   - 我的：「上传参考图」+ 作品库图片。
   - 历史：读本工具成功任务的结果图。
   - 收藏 / 采集：诚实空态，说明依赖原站账号和插件。
4. **保留遮挡物**（已完成）：只在商品替换下出现「高级自定义 → 保留遮挡物 开启/关闭」，默认关闭，未选参考图时禁用。adapter 没有对应字段，开启后**写进 `customPrompt`**（追加「；保留遮挡物：提取参考图中商品主体前的遮挡物置于画面最顶层，保留原图的遮挡关系」）。adapter 会把 customPrompt 原样写进提示词，并通过防丢参守卫校验。页签和开关的状态都从 customPrompt 反推，没有新增字段。
5. **画布底部工具条**（已完成）：
   - 选中参考图：「背景调节 小—大（1~3，与原站一致）/ 重置 / 删除」，参考图可拖动平移。
   - 选中商品：「编辑主图 / 大小 slider / 重置大小和位置 / 删除」，商品可拖动，右上角手柄可缩放。
   - 选中元素：「删除元素」。
   - 提交时，只要背景调节、平移或元素有改动，就按画布所见（object-cover + 平移 + 缩放 + 元素）在前端合成一张 PNG，真实入库后作为 `bgAssetId` 参考图提交，adapter 字段不变。同一布局只合成一次，结果过期判断用的也是这次合成的 id。
6. **抠图编辑弹窗**（已完成）：自己上传的图（首屏、商品抽屉、素材库都算）会弹出弹窗，左原图（橙色半透明标出保留区）、右「保留区域」预览。
   - 能用的操作：保留 / 去除画笔（大小可调）、反选、重置、撤销、重做（按操作列表回放）、预览背景色（透明 / 白色 / 黑色 / 绿色 / 其他取色）、「也可以 上传一张蒙版图」（透明图按 alpha、黑白图按亮度）、取消、确认使用。
   - 确认使用时导出与原图同尺寸的黑白蒙版 PNG，入库后走 adapter 现有字段（`cutoutMode=mask` + `maskAssetId` + `cutoutConfirmed`）。
   - **自动抠图**：本地没有模型。图片自带透明通道时按 alpha 识别主体并提示「已按图片透明通道识别…」；否则直接进入手动模式，提示「本地没有自动抠图模型，已进入手动模式…」。不伪造抠图结果，「自动识别」按钮置灰。
   - 取消后配置栏显示琥珀色待办条「请先上传主体蒙版…去抠图」，立即生成仍被门禁拦住。点「编辑主图」可以再次打开弹窗，并带上已确认的蒙版。
   - 示例图仍用原站已抠好的透明图，不弹窗。
7. **配色**：
   - 主按钮改为 `bg-primary text-primary-foreground`；张数、类目 chip、排序 chip 的选中态用 `border-selected bg-selected-soft`；左窄栏、抽屉页签、抠图工具的选中态用 `bg-accent`；页签下划线用 `border-foreground`。
   - 提示条用 amber token；`bg-black/[0.04]` 等改为 `bg-foreground/[0.04]`。
   - 编辑器和首屏根节点的底色用 `var(--canvas)`，卡片用 `bg-background`。
   - 本页 3 个文件里已经没有 `723cf9 / 3a7df9 / 8d34f9 / 722ed1`。
   - 浅色和深色都已截图核对。保留的硬编码颜色只有图片上的遮罩、角标（`bg-black/50 text-white`、场景卡白底标签）、棋盘格、canvas 绘制色和预览背景色。

## 实施中发现并在本页内处理的全局问题（请主代理决定是否上收）

- **antd reset 覆盖按钮文字色**：antd reset 给 `button` 注入未分层的 `color: inherit`。`globals.css` 只对几个容器（`tool-config-column` / `tool-main-column` 等）做了 `revert-layer`，本页不在其中，结果 `bg-primary text-primary-foreground` 成了深底深字。我在本页注入了 `[data-testid="scene-workspace"] button{color:revert-layer}`（`BUTTON_COLOR_FIX`）。**建议**把 `[data-testid="scene-workspace"] button` 加进 `globals.css` 第 168 行那组选择器，然后删掉本页这条。
- **按钮的 `ml-auto` / `mx-auto` 失效**：同一个 reset 把 button 的 margin 也压掉了。本页改成用外层 span / div 来布局。其他页面如果有 `<button className="ml-auto">` 也会失效。
- **`.tool-linkfox-surface .bg-canvas` 被映射为 `--background`**：所以本页根节点直接用 `bg-[var(--canvas)]`。

## 仍未收口的差异和原因

- **全屏方式**：用的是组件内 `<style>` 隐藏族导航侧栏。更干净的做法是 ToolShell / tool-page 提供一个「隐藏侧栏」参数，但这需要改共享文件，留给主代理决定。
- **商品替换的「替换区域」剪影 /「编辑替换区域」/ 参考图卡片上的「编辑」按钮**：需要在参考图上检测商品区域的模型，本地没有，所以没做。删除和重新选择已做。
- **抠图弹窗的「手动选择」（点选分割）/ 钢笔 / 移动 / 缩放工具，画笔的硬度 / 不透明度，「局部消除」**：前两项需要分割或重绘模型，按钮置灰并有说明；钢笔、平移和缩放工具没做（只是放大查看，不影响产出）。
- **商品工具条的上移 / 下移一层、透视、扭曲、翻转**：adapter 的 `transform` 只有位置 / 缩放 / 旋转，翻转和透视加了也传不到请求里，所以没做。元素统一画在商品下层（提交时合成进参考图，商品层始终在上），没有做层级调整。
- **抽屉里的原站飞书「小贴士」外链、左栏「免责声明」**：没复刻（站外文档链接和原站法务文案）。
- **元素、背景调节、商品列表不进草稿**：刷新后会丢，只有商品 / 蒙版 / 参考图 / 参数会恢复，与之前一致。
- **合成参考图这条路径（有元素或背景调节时）**：浏览器里验证了画布交互和预览，但为了零费用**没有真实提交**。`IC_DRY` 配方走的是不合成的路径。建议主代理真实验收时补一次「背景调节 1.6 + 加一个元素 → 立即生成」，核对 references 里的参考图是合成后的 PNG。
- **原站「我的商品」区块、「更多 →」、新手引导**：与上一轮相同，没有做。

## 边界值

- 背景调节 slider 范围 1~3、step 0.1，照原站实测（antd slider min 1、max 3）。
- 平移限制在 ±1 倍画布、元素宽 0.03~1.5 倍画布、抠图画笔 4~120 像素：这三项只是 UI 拖动范围，不影响请求、上传或失败处理。
- 没有新增超时、重试、大小或并发上限。合成参考图和抠图蒙版都按原图或输出尺寸生成，不做降采样。蒙版上传沿用 `SCENE_MASK_LIMITS`（PNG，8M）：原图很大时黑白蒙版 PNG 通常远小于 8M，超出会按现有上传校验报错。

## 测试

- `cd web && npx tsc --noEmit -p .`：无错误。
- `cd web && bun test src/features/tools/adapters/new-replace-bg-v2.test.ts src/features/tools/adapters/scene-transfer.test.ts src/features/tools/registry/registry.test.ts src/features/tools/adapters/product-scene.test.ts`：106 pass / 0 fail。
- `cd web && IC_DRY=1 node scripts/real-acceptance/run-one.mjs NEW_REPLACE_BG_V2`：`ok: true, dry: true`，gate 为「立即生成」可用、张数 1、`issuesAtGate: []`（证据在 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/NEW_REPLACE_BG_V2/`）。这次运行走完了上传 → 抠图弹窗 → 上传蒙版 → 确认使用 → 选参考图 → 张数，没有提交。
- ego-browser 自测截图在 `docs/V1.0/e2e-1to1/20261106/NEW_REPLACE_BG_V2/`：
  - 浅色：`light-home`、`light-editor-drawer`、`light-drawer-preset`、`light-editor-bg-adjust`（背景调节）、`light-editor-goods-occlusion`（商品替换 + 保留遮挡物开启 + 张数 2）、`light-drawer-element`、`light-editor-element`（元素图层拖动后）、`light-drawer-goods`、`light-cutout-paint`（自有图 → 手动模式提示 + 保留画笔）、`light-cutout-reedit` / `light-cutout-remove-green`（去除画笔 + 绿色预览）/ `light-cutout-invert`（撤销后反选）、`light-editor-own-goods`（上传蒙版确认后商品按蒙版预览）、`light-editor-cutout-pending`（取消后的待办提示）。
  - 深色：`dark-home`、`dark-editor`、`dark-editor-drawer`、`dark-drawer-preset`、`dark-drawer-favorite`、`dark-editor-bg-advanced`、`dark-cutout`、`dark-drawer-goods`。
  - `light-cutout-mask-upload.png` 是修复 canvas 不渲染 bug 之前截的，右侧预览是空的，可以忽略。
- `visual-parity-pair.py NEW_REPLACE_BG_V2` 已重采（首屏）。`20261105/NEW_REPLACE_BG_V2/pair.jpg` 已更新，副本在 `20261106/NEW_REPLACE_BG_V2/pair-home.jpg`。结构与原站一致，配色为无限画布暖灰。
- 自测中修过的 bug：
  - StrictMode 下 rAF 句柄没清零，导致抠图画布不渲染。
  - 商品缩放手柄在画布外时被 `overflow-hidden` 裁掉、点不到（已移到右上角，并补了大小 slider）。

## 给主代理的待办

1. 把 `[data-testid="scene-workspace"] button` 加进 `globals.css` 的 `color: revert-layer` 选择器组，然后删掉 `product-bg.tsx` 里的 `BUTTON_COLOR_FIX`；顺带排查其他工具页里 `<button>` 上的 `ml-auto` / `mx-auto` 是否失效。
2. 决定是否给 ToolShell / tool-page 加一个正式的「隐藏族导航侧栏」参数，替换本页注入的 `<style>`。
3. 真实验收时补一次合成参考图的提交（背景调节或元素有改动）。
4. CHANGELOG `Unreleased` 和 `pending-test.mdx` 由主代理补：
   - [新增] 商品图编辑器补齐原站「商品 / 元素」抽屉、参考图六个页签、抠图编辑弹窗、背景调节和保留遮挡物；
   - [调整] 商品图页配色改为无限画布风格。

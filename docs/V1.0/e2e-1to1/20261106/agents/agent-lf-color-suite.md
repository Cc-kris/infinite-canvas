# agent-lf-color-suite：电商套图 / 商品图设计 11 页配色收口

按 `20261106/COLOR-GUIDE.md` 处理主代理机械替换后剩余的颜色。只改了 className 和内联颜色，布局、尺寸、文案、testid、请求字段都没动。所有改动都是精确字符串替换（脚本 `/tmp/agent-lf-color-suite-fix.py`，每条替换先校验命中数再写入）。

## 改动文件

`web/src/components/tools/workspaces/` 下：

| 文件 | 主要改动 |
|---|---|
| `suite.tsx`（商品套图 + 营销素材） | 参数选中（分辨率 / 品质 / 比例 / 排版 / A+ 类型 / 主副图类型 / 平台 / 模型 chip / 下拉选中项）`border-primary bg-primary/10 text-primary` 和 `stone-800` 实心改成 `border-selected bg-selected-soft text-selected`；结果页签下划线 `border-primary text-primary` 改成 `border-foreground text-foreground`；「历史记录」改成 `text-muted-foreground`；`#E6E6EB/#EDEDF0/#d8d8e0/#d9d9e0/#3b3b4f/#2b2b3a/#6b6b80` 改成 token；`stone-*` 加 `dark:stone-*` 成对写法统一改成 `foreground/muted-foreground/border-border`；`amber-50/300/800` 错误条改成 amber 规范色；`text-red-600` 改成 `text-destructive`；向导弹窗「确定」改成 `text-primary-foreground!`（原因见下） |
| `dress-suite.tsx` | 参数选中改成橙色；页签下划线改成 foreground；结果「下载 / 入库」链接改成 muted 色；checkbox 的 `accent` 改成 `var(--selected)`；去掉 `dark:border-white/10` |
| `color-v2.tsx` | 提色 / 历史模式切换的选中字色改成 foreground；参考方案缩略图、换色方案行、常用部位、模型品质的选中态改成 selected（内联 `var(--primary)` 改成 `var(--selected)`）；右侧页签和历史记录改成 foreground / muted |
| `translate.tsx` | 目标语言 chip 选中从黑底白字改成 `bg-selected-soft text-selected`；素材列表选中改成橙色；「上传多张图片」次按钮改成 `border-border bg-background hover:bg-accent`；结果页签下划线改成 foreground；结果区的语言切换（导航性质）改成 `bg-accent`；去掉 `dark:text-white/60` |
| `dressing-xsy.tsx` | 选项选中改成橙色；上下装 / 连体页签改成灰色 `bg-accent`；`text-black` 改成 `text-foreground`；两条 amber 提示条加 `dark:text-amber-400` |
| `ai-text-static.tsx`（POD素材） | `#ccc/#f2f2f2/#81849b/#f3f3f3/#8d34f9/#723cf9`、`border-black/30`、`hover:text-black` 全部换成 token；创意风格选中 `border-selected/15 bg-primary/15` 改成 `border-selected bg-selected-soft`；两处页签下划线改成 `border-foreground`；模板对勾角标改成 `bg-selected text-white`；「相似裂变」次按钮改成 border 款；案例遮罩上「做同款」补 `text-primary-foreground`；相似裂变弹窗「立即生成」改成 `text-primary-foreground!` |
| `text.tsx`（饰品文字） | `hover:bg-[#723cf9]/5` 改成 `hover:bg-selected-soft`；`focus:border-[#723cf9]` 改成 `focus:border-selected`；`border-black/[0.16]` 改成 `border-border`；对勾角标改成 `bg-selected`；字体 / 挂环缩略图容器 `bg-background` 改成 `bg-white`（素材是透明底黑字 PNG，深色下看不见，按素材底色处理） |
| `listing-fission.tsx` | `focus:border-[#723cf9]` ×3 改成 `focus:border-selected`；对勾角标改成 `bg-selected` |
| `material-preview.tsx` | `hover:text-black/60` 改成 `hover:text-foreground` |
| `ai-pose-generator.tsx` | 「智能扩写」次按钮 `border-selected` 改成 `border-border bg-background hover:bg-accent` |

自查：10 个文件里 `723cf9 / 3a7df9 / 8d34f9 / 722ed1` 都是 0 处。剩下的硬编码只有：弹窗遮罩 `bg-black/30~70`、图片上的遮罩和角标 `bg-black/40~50 text-white`、`shadow-[...rgba]`、棋盘格 `#ccc`、颜色选择器默认值 `#ffffff`、canvas 绘制色，这些都按规范保留。没有测试断言这些类名，所以没改测试。

## 每页浅色 / 深色结论

截图在 `docs/V1.0/e2e-1to1/20261106/color/<TOOL>-{light,dark}.png`，1600×1000，任务空间 `agent-lf-color-suite`。

| 工具 | 浅色 | 深色 | 另外打开看过的弹层 |
|---|---|---|---|
| PRODUCT_IMAGE_SUITE | 通过 | 通过 | A+ / 主副图设置展开（`-popup-`）、商品信息向导（`-wizard-`）：选中 chip 是橙色，「完成」和「确定」按钮文字可读 |
| DRESS_WEAR_SET | 通过 | 通过 | — |
| CHANGE_COLOR_V2 | 通过 | 通过 | 模型品质选中是橙色浅底 |
| IMAGE_TRANSLATION | 通过 | 通过 | 目标语言选中是橙色浅底 |
| AI_TEXT（POD素材） | 通过 | 通过 | 优秀案例（`-cases-`）、相似裂变弹窗（`-similar-`）：修复前「立即生成」在两种主题下都是同色字，修复后可读 |
| ORNAMENT_TEXT | 通过 | 通过 | 字体弹层（`-popup-`）：修复前深色下字体预览看不见，改成白底后可读 |
| MATERIAL_UPPER_BODY | 通过 | 通过 | — |
| FISSION_LINK | 通过 | 通过 | 交付方式和 A+ 类型选中是橙色，主副图对勾是橙色 |
| AI_POSE_GENERATOR | 通过 | 通过 | 模板库弹层（`-popup-`） |
| AI_DRESSING_XSY | 通过 | 通过 | — |
| PRODUCT_MARKET_MATERIAL | 通过 | 通过 | 营销素材向导弹窗按钮读取的计算色与商品套图相同，已一起修复 |

两种主题下都没有白底块、看不见的字或紫色残留。结束时主题已切回 light，并执行了 `task.finish({ keep: [] })`。

## 仍有问题（需要主代理处理）

1. **`globals.css` 里 antd `button { color: inherit }` 的回落规则覆盖不全**（第 168–174 行）。`color: revert-layer` 只对 `tool-shell / tool-config-column / tool-main-column` 等 testid 内的按钮生效。工作区自己渲染的 `fixed` 弹窗（例如 `ai-text-similar-modal`、`SuiteWizardDialog`）DOM 上不在这些容器里，所以 `text-primary-foreground` 被压掉，出现「深底深字 / 浅底浅字」。我在自己的文件里对两个主按钮用了 `text-primary-foreground!` 局部兜底。建议在 globals.css 把选择器扩到 `.tool-linkfox-surface button`，之后可以去掉这两个 `!`。同一原因下，弹窗里的「关闭 / 取消」等 `text-muted-foreground` 按钮实际显示成 foreground 色，能读但比设计的颜色深。其他子任务的弹窗大概率也有同样问题。
2. `text.tsx` 的字体 / 挂环缩略图底色用了 `bg-white`。这是素材底，不是 UI 色：素材 PNG 是透明底黑字，跟着主题变暗就看不见。如果主代理更想在素材侧处理（例如换成带底色的素材），可以改回去。
3. 不属于本任务的共享组件这次没发现新的配色问题。截图里结果区的空态案例轮播（`tool-case-guide.tsx`）在深色下正常。

## 测试

- `cd web && npx tsc --noEmit -p .`：0 错误。
- `cd web && bun test`，覆盖 `suite.test.tsx`、`suite-family-empty.test.tsx`、`dressing-xsy-restore.test.tsx`，以及 image-translation、product-image-suite、ai-text-v2、ornament-text、ai-pose-generator、product-market-material、ai-dressing-xsy、change-color-v2、dress-wear-set 的 adapter 测试和 listing-fission、material-preview 的 registry 测试：14 个文件 249 pass / 0 fail。

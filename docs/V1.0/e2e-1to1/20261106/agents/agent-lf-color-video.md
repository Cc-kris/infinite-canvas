# agent-lf-color-video：AI 视频族 / 设计器两页 / 工具页共享组件配色收口

按 `COLOR-GUIDE.md` 手工处理机械替换没覆盖的颜色；只改 className 与注释，不改布局、尺寸、文案、testid、请求字段。

## 改动文件

共享组件（`web/src/components/tools/`）：

- `tool-case-guide.tsx`：图上标签胶囊 `bg-black/60 text-white` → `bg-foreground/60 text-background`（胶囊在图片上方，不叠在图上）；未选分页点 `bg-black/30` → `bg-foreground/30`；注释删掉原站紫/蓝色值。
- `tool-asset-input.tsx`：标题、配额、列表行、库面板的 `stone-*` 改为 `foreground` / `muted-foreground` / `border-border`；错误 → `text-destructive`；草稿隔离 / 冲突提示条 → amber 规范（`border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300`，原来没有深色变体）；linkfox 上传卡 hover 与拖拽态 → `border-selected`。
- `tool-result.tsx`：结果预览底 `bg-stone-100 dark:bg-stone-900` → `bg-muted`。
- `tool-task-history.tsx`、`tool-history-dock.tsx`：`text-red-600` → `text-destructive`；`text-amber-600` / `text-emerald-600` 补 `dark:` 变体。
- `task-status.tsx`：neutral 徽标 stone → `border-border bg-muted text-foreground/70`（其余状态色已有深色变体，保留）。
- `history-record-panel.tsx`：选中页签 `bg-primary/10 text-primary` → `bg-accent text-foreground`。
- `workspaces/orig-rail.tsx`：非侧栏形态的当前项 `border-primary bg-primary/10` → `border-foreground bg-accent`。
- `tool-cases.tsx`、`tool-shell.tsx`、`capability-notice.tsx`、`watermark-group-panel.tsx`、`tool-workspace-columns.tsx`、`tool-sidebar.tsx`：剩下的只有图片遮罩和弹层遮罩（`bg-black/40~70 text-white`），按规范保留，未改。

AI 视频族：

- `workspaces/video.tsx`（6 页共用的 `VF_*` 常量也在这里）：文本框边、工具条字、placeholder、分段 hover → token；比例卡选中 `#6043bd` 紫 → `border-selected bg-selected-soft text-selected`，未选 `#f3f2f5` → `bg-muted`；视频拼接比例 / 时长、视频复刻国家 / 语言、分析模式的选中 `border-primary bg-primary/10` → selected 橙色；分隔线 `bg-black/10` → `bg-border`；主按钮内 `text-white/60` → `text-primary-foreground/60`（深色下主按钮是浅底，白字会看不见）；amber 小字补深色。
- `workspaces/image-to-video.tsx`：模式分段 `#f4f4f8` / `#625c6d` → `bg-muted` / `text-foreground/70`；开关关闭态 `#c9c6d0` → `bg-foreground/20`；必填星号 `#fa5151` → `text-destructive`；「怎么写描述？」`#1677ff` → 链接规范；模板 / 自定义 / 提示词优化选中 → `text-selected`；按钮内 `text-white/60` → `text-primary-foreground/60`。
- `workspaces/video-translation.tsx`、`video-translation-honesty.tsx`：amber 提示条统一成规范（含两处原本没有深色变体的）；插画占位底 `#5f3aae` → `bg-muted`；`#6b6478` / `#938d99` → `text-muted-foreground`；右侧页签下划线 `border-primary` → `border-foreground`。

设计器两页（只改编辑器外壳，图层 / 文字颜色 / 模板图未改）：

- `workspaces/designer-home.tsx`：左侧入口选中 `bg-selected-soft` + 紫色内阴影 → `bg-accent font-medium`（导航用灰色）；`bg-black/*`、`text-black/*`、`#202020` → foreground 系；拖拽态 → `bg-selected-soft`。
- `workspaces/designer.tsx`：画布尺寸预设、字体选中 `border-primary bg-primary/10 text-primary` → selected 橙色；旋转 / 不透明度滑块加 `accent-primary`（原来是浏览器默认蓝）。图层选中描边 `outline-primary` 与 `canvasThemes.selectionStroke` 一致，保留。
- `workspaces/image-text-edit.tsx`：顶栏 / 分栏边框 `border-black/15~20` → `border-border`；「生成图片文字」`bg-black text-white` → `bg-primary text-primary-foreground`；「添加文字」「AI生成文案」紫浅底 → 次按钮规范；工具栏选中 → `bg-accent`；画布区 `#f5f6fa` → `bg-canvas`；选中框 / focus ring `#723cf9` → `ring-selected`；缩放条 `bg-white/95` → `bg-background/95 border-border`；字重 / 对齐 / 导出格式选中 → selected 橙色；「已保存到本地草稿」`#58a919` → `text-emerald-600 dark:text-emerald-400`。

测试：`workspaces/video-translation-i18n.test.tsx` 断言 `text-amber-800` → `text-amber-700`（跟随提示条配色调整，仍校验 12px 字号）。

自查：我负责的 21 个文件里 `723cf9 / 3a7df9 / 8d34f9 / 722ed1` 为 0。剩余硬编码只有视频播放器 `bg-black`、图片悬浮遮罩、弹层遮罩、设计器颜色输入默认值 `#ffffff`，均按规范保留。

## 每页浅 / 深结论

截图：`docs/V1.0/e2e-1to1/20261106/color/<TOOL>-{light,dark}.png`，另有 `VIDEO_CONCAT-editor-*`、`NEW_DESIGNER-editor-*`（进入编辑态后）。

| 工具 | 浅色 | 深色 |
|---|---|---|
| IMAGE_TO_VIDEO 图转视频 | 通过 | 通过；结果区白色块是原站引导素材图 `/__cases/image-to-video/empty-guide.png` 自带白底，不是 DOM 背景，按规范不改 |
| SALE_VIDEO 带货口播 | 通过 | 通过 |
| VIDEO_REPLICATION 视频复刻 | 通过 | 通过 |
| AI_VIDEO_EDITING 视频编辑 | 通过 | 通过 |
| VIDEO_TRANSLATION 视频翻译 | 通过；amber 提示条可读 | 通过；顶部插画是原站素材 |
| VIDEO_CONCAT 视频拼接 | 通过（空态 + 编辑态，比例 / 时长选中为橙色） | 通过；空态里的白色剪辑器示意是原站素材图 |
| NEW_DESIGNER 商品图设计器 | 通过（首页 + 编辑器） | 通过；右上「卖点图 / 尺寸图」演示视频为原站素材 |
| IMAGE_TEXT_EDIT 图片文字编辑 | 通过 | 通过 |

所有页面：深色下没有 DOM 白底块（脚本扫描了 1600×1000 视口内背景亮度 >200 的元素，只剩 `bg-primary` 主按钮，深色下主按钮本来就是浅底深字）；没有看不见的字；没有紫色残留。浅色下主按钮为深底白字，可读。

## 别族抽查（共享组件影响面）

- PRODUCT_IMAGE_SUITE 商品套图：浅 / 深都正常，案例卡、标签胶囊、「一键做同款」、分页点正确。
- AREA_REPAIR 局部重绘：浅 / 深都正常，上传卡、生成张数橙色选中正常。
- AI_DRESSING_V2 AI穿衣：浅 / 深都正常，素材行卡、「移除」按钮、案例卡正常（列表里的绿色方块是本地草稿里已有的测试素材）。

注意：抽查截图沿用了 `color/<TOOL>-{light,dark}.png` 的命名，覆盖了 `PRODUCT_IMAGE_SUITE`、`AREA_REPAIR`、`AI_DRESSING_V2` 三组文件（截于 10:32 左右）。负责这些页面的子任务如果需要自己的版本，要重新截一次。

## 仍有问题 / 需要主代理处理

- 不需要改 token。
- `tool-case-guide.tsx` 的标签胶囊在深色下是浅底深字（`bg-foreground/60 text-background`），与原站深底白字相反，但和两种主题都一致。如果希望两种主题都是深底白字，可改回 `bg-black/60 text-white`，由主代理决定。
- 原站素材图（i2v 引导图、拼接剪辑器示意、视频翻译插画、设计器演示视频）在深色下是亮色块，属于素材，按规范不改。

## 测试

- `cd web && npx tsc --noEmit -p .`：无错误。
- `bun test` 跑了 `src/components/tools/*.test.tsx`、`video-translation-honesty.test.tsx`、`video-translation-i18n.test.tsx`、`suite.test.tsx`、`suite-family-empty.test.tsx`，以及 `src/features/tools/adapters/` 下的 sale-video、image-to-video、handheld-goods、image-text-edit、new-designer、video-translation、ai-video-editing：共 16 个文件、291 个测试，全部通过。
- ego-browser 任务空间 `agent-lf-color-video` 已把主题切回 light，并执行了 `task.finish({ keep: [] })`。

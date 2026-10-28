> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、39 工具逐页 DOM/chunk 证据；逐页事实源为 `page-specs/`。日期更新：2026-10-28。

# UI Brief｜LinkFox 布局复刻 × 无限画布视觉

节点评分：2。优先级：用户目标 > 可访问性 > 一致性 > 美感 > DX。

## 1. 产品语境与目标感受

高频电商生产工具，目标是专业、可信、克制、高密度但不拥挤。不能做成营销落地页，也不能把 39 页做成同一副通用卡片。

## 2. 参考对象与证据（不少于 2 个）

1. [原站布局线框](evidence/reference-linkfox-layout.svg)：根据真实 LinkFox DOM/计算样式绘制，不是伪称截图。
2. [无限画布目标线框](evidence/reference-infinite-canvas-layout.svg)：目标组件和状态区线框。
3. [原站商品套图 DOM](evidence/category_product_suite.json) 与 [智能修图 DOM](evidence/linkfox_tool_dom.json)：可追溯实际文本、尺寸、颜色。
4. 既有 `/image`、`/video`、`/canvas` 为现有产品风格锚点；实施时须在真实页面复核，不能用本线框代替最终 UI 验收。

## 3. 复刻与对齐边界

复刻：五类导航、二级关系、左工具栏/右内容、输入—配置—结果、历史与批量工作流。对齐无限画布：背景/前景/主色/边框令牌、字体、焦点环、按钮、卡片、圆角、阴影；不复制 LinkFox 紫色品牌和算力区。

## 4. 布局与密度

- 桌面顶栏 48px，工具侧栏 184px，内容头 56px；内容区 `minmax(320px,360px) + minmax(0,1fr)`，间距 16px，页面 padding 20px。
- 原站实测 1920px 下顶栏含状态区 110px、侧栏约 180px；本项目不复制状态区，保留有效内容密度。
- ≥1440 双栏；1024–1439 配置栏 320px；<1024 单栏且结果在下；<768 侧栏变 Drawer，顶栏二级菜单变全屏抽屉。
- 控件高 36px，主按钮 40px，卡片圆角 10px，输入圆角 8px，表格行 44px，可点击区最小 40×40px。

## 5. 色彩、字体与状态

背景 `bg-background`，面板 `bg-card`，正文 `text-foreground`，次级 `text-muted-foreground`，边框 `border-border`，主按钮 `bg-primary text-primary-foreground`，选中 `bg-accent`，错误 `text-destructive`。深色模式全部使用令牌。正文 14px/22px，标题 20px/28px，页面标题 24px/32px；数字用 tabular-nums。

## 6. 导航、侧栏与全局组件

一级菜单激活为前景色+底部 2px 主色；下拉 280px，分组标题 12px；侧栏选中项左侧 3px 主色+浅色底，补充工具用中性“补充”徽章，不用警告色。下拉支持方向键、Esc、Enter、焦点返回；点击外部关闭。

## 7. 核心组件与反 AI 化约束

上传是具体商品框/文本框/视频帧，不用空泛插画；结果是真实缩略图、状态与操作；配置按任务分组，不堆渐变、光斑、玻璃拟态、无意义欢迎语。骨架匹配结果网格；进度用任务状态，不伪造百分比。

## 8. 39 个工具逐页 UI 规格

### UI-T01｜商品套图 `PRODUCT_IMAGE_SUITE`

- 路由：`/tools/ecommerce-suite/product-image-suite`；[完整 UI/交互规格](page-specs/01-product-image-suite.md)。
- **布局**/区域：商品图上传与 AI 分析｜品牌与合规｜模型/品质｜A+ 图设置｜主副图设置｜整组结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：商品图支持本地上传、作品库、商品库；商品信息 0/2500，AI 分析/向导；品牌基因控制主色和字体风格，合规区选择敏感词库和替换词库；模型 LF G-2.5 Sunburst，1K/2K/4K，低至最大品质；A+ 单选高级/手机/普通/自定比例并设张数和排版；主副图多选卖点/白底/场景/特写/特写白底并分别设张数；比例 1:1、3:4、4:3、2:3、3:2。
- **交互/状态**联动：切换 A+ 类型只改变 A+ 模块，不清空主副图多选；排版“每种排版生成一张/无文字模式”互斥；数量和排版共同重算预计产物；主副图与 A+ 可独立展开；修改品牌基因后新草稿标记 dirty，不能覆盖已生成结果。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T02｜服装套图 `DRESS_WEAR_SET`

- 路由：`/tools/ecommerce-suite/dress-wear-set`；[完整 UI/交互规格](page-specs/02-dress-wear-set.md)。
- **布局**/区域：最多 5 张服装/配饰/细节图｜商品信息｜主副图｜A+ 图｜套图结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：主副图多选模特图、种草图、卖点图、尺码图、白底图，各自数量和排版独立；A+ 与商品套图相同；商品信息 0/2500；首步引导“上传服装配饰及细节图”。
- **交互/状态**联动：上传 1–5 张后形成有序参考列表，可删除/调序；主副图与 A+ 分别计数；模特图/种草图使用人物与场景约束，尺码图保留尺码文字；清除全部图片即禁用提交但保留其余配置。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T03｜套图换色 `CHANGE_COLOR_V2`

- 路由：`/tools/ecommerce-suite/change-color-v2`；[完整 UI/交互规格](page-specs/03-change-color-v2.md)。
- **布局**/区域：批量图片上传｜颜色选择｜换色部位｜品质｜整套结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：颜色来源含商品图提色、历史使用颜色、参考图批量上传（最多25张）；本次方案显示参考图数；换色部位文本 0/50；常用部位全身/上装/下装/鞋面/鞋底/包身/包带/外壳/瓶身/表带；品质低/中/高。
- **交互/状态**联动：参考图加入即生成独立颜色方案，删除参考图同步移除方案；点击常用部位写入部位字段但可继续编辑；整套图共享方案，单图可重跑；没有有效图片或颜色方案时禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T04｜批量翻译 `IMAGE_TRANSLATION`

- 路由：`/tools/ecommerce-suite/image-translation`；[完整 UI/交互规格](page-specs/04-image-translation.md)。
- **布局**/区域：批量图片上传｜原文语言｜目标语言分组多选｜翻译结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`BatchAssetUploader + LanguageTreeSelect + TranslationMatrix`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：单图20M、384–4096px，单图文字500字以内；原文含中英等；目标按欧美/亚洲/南亚/中东/非洲分组，多选并显示已选数。
- **交互/状态**联动：目标语言每增一个即增加一路输出，原图×语言矩阵展示进度；源语言与目标相同须提示；OCR/版式失败只失败对应单元，可编辑文本后重试；切换语言不清空已上传图片。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T05｜高清放大 `SCALE_UP`

- 路由：`/tools/ecommerce-suite/scale-up`；[完整 UI/交互规格](page-specs/05-scale-up.md)。
- **布局**/区域：原图上传｜变高清模式｜面部美化｜前后对比｜历史。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：模式：变高清、高清+2倍、高清+4倍、自定义；自定义时输出宽高可编辑；面部美化独立开关；上传区支持 jpg/jpeg/png/webp，最大4096×4096；中央原图/结果对比。
- **交互/状态**联动：倍率切换实时重算输出尺寸与格式限制；自定义尺寸需保持合法比例；面部美化只影响人脸细节，不改变倍率；重上传保留模式但清除旧结果；生成中禁止替换源图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T06｜智能扩图 `AI_OUTPAINTING`

- 路由：`/tools/ecommerce-suite/ai-outpainting`；[完整 UI/交互规格](page-specs/06-ai-outpainting.md)。
- **布局**/区域：图片上传｜画布/比例扩展｜扩展预览｜生成数量｜结果网格。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`OutpaintCanvas + AspectRatioControl + TransformHistory`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：默认尺寸与自定义比例/宽高；支持基于原图、扩展图、蒙版与 stageConfig 的画布编辑；输出1–4张；提示词用于扩展区域内容。
- **交互/状态**联动：改比例只调整外扩画布，不拉伸原图；拖动原图改变保留区域并更新 mask；恢复默认尺寸需清掉扩展变换；生成前必须确认扩展方向和最终尺寸。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T07｜局部重绘 `AREA_REPAIR`

- 路由：`/tools/smart-edit/area-repair`；[完整 UI/交互规格](page-specs/07-area-repair.md)。
- **布局**/区域：蒙版画布工具栏｜图片上传｜重绘描述｜数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`MaskCanvas + BrushToolbar + UndoRedoController`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：画笔大小（像素）、自动扩大选择区域、反选、撤销、重做、重置；重绘描述必填0/600；输出1–4。
- **交互/状态**联动：涂抹生成 maskUrl，反选只反转蒙版；自动扩边改变最终 mask 范围；撤销/重做只影响笔画；图片替换清空蒙版；描述为空或蒙版为空禁用提交。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T08｜局部消除 `REMOVE_PEN`

- 路由：`/tools/smart-edit/remove-pen`；[完整 UI/交互规格](page-specs/08-remove-pen.md)。
- **布局**/区域：消除蒙版画布｜画笔与历史｜上传｜消除结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`MaskCanvas + BrushToolbar + UndoRedoController`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：画笔大小、重置、撤销、重做、重新上传；无需提示词；结果可下载、高清放大或继续商品图/手部修复。
- **交互/状态**联动：涂抹与擦除更新 maskImageUrl；重上传清空笔画；结果页“高清放大”把当前结果作为新工具输入；消除失败保留原图和蒙版供重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T09｜一键换色 `CHANGE_COLOR`

- 路由：`/tools/smart-edit/change-color`；[完整 UI/交互规格](page-specs/09-change-color.md)。
- **布局**/区域：图片上传｜颜色/参考图｜去杂色｜颜色细调｜光影与边缘｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：收藏色卡、选择颜色或上传颜色参考图；去杂色开关；色调/饱和度/亮度/对比度滑杆与重置；光影优化、边缘优化、颜色边缘修复、色彩平衡、曲线。
- **交互/状态**联动：颜色参考图提取色卡；细调参数实时更新预览，不直接修改原图；重置仅重置当前组；换色与高级调色合并为一次提交快照；生成期间锁定参数防错配。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T10｜图片裁剪 `IMAGE_CROP`

- 路由：`/tools/smart-edit/image-crop`；[完整 UI/交互规格](page-specs/10-image-crop.md)。
- **布局**/区域：裁剪画布与历史｜尺寸调整｜比例调整｜平台预设｜自定义尺寸。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`CropCanvas + PlatformPresetGrid + PixelSizeForm`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：自由裁剪；Amazon 1600²、Walmart 2000²、Etsy 2000²、Temu 1200²、Shopify 方/横/竖、SHEIN 1340×1785 等平台；目标宽/高和保存自定义尺寸；撤销/重做/重置/重新上传/下载。
- **交互/状态**联动：选择平台同时写入平台、比例和像素尺寸；手动拖框切为自由裁剪但不删除预设；锁定比例时拖角保持比例；换图重置画布变换；下载使用当前裁剪结果。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T11｜商品精修 `PRODUCT_REFINE`

- 路由：`/tools/smart-edit/product-refine`；[完整 UI/交互规格](page-specs/11-product-refine.md)。
- **布局**/区域：精修案例对比｜商品上传｜精修模式｜自动尺寸规则｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：整图精修/去背景精修；20M内；原图≤512放大4倍、513–1024放大2倍、>1024保持原尺寸；目标是轮廓、光泽、材质与颜色。
- **交互/状态**联动：切去背景精修额外产生透明/分段结果并改变输出规则；上传后显示预计输出尺寸；替换图片清掉旧精修结果；失败可保留模式重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T12｜色差修复 `FIX_COLOR`

- 路由：`/tools/smart-edit/fix-color`；[完整 UI/交互规格](page-specs/12-fix-color.md)。
- **布局**/区域：色差源图与商品参考｜色彩区域/版本｜校正结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：原站真实菜单“色差修复”对应 `/draw/color-diff-repair`，不是 `/draw/fix-color`；载荷含 fixColorSegUrl、fixColorUrl、imageSegUrl、version。页面按上传原图、校正参考/区域、版本选择、结果对比组织。
- **交互/状态**联动：区域分段变化只更新待修复 mask；版本切换重算预览并保留上一版；原图与校正参考缺一不可；失败保留原图、分段与版本。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T13｜印花修复 `PRINTING_REPAIR`

- 路由：`/tools/smart-edit/printing-repair`；[完整 UI/交互规格](page-specs/13-printing-repair.md)。
- **布局**/区域：Step1 消除错误印花｜Step2 导入正确印花｜Step3 位置调整画布｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：两个上传分别20M内；第三步在画布调整印花位置、大小、旋转；载荷 point/rotate/scale/config/targetConfig。
- **交互/状态**联动：只有完成前两步才开放位置画布；移动/缩放/旋转只改正确印花层；重新上传错误图清空全部步骤；重新上传正确印花保留原图但重置变换。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T14｜手部修复 `HAND_REPAIR`

- 路由：`/tools/smart-edit/hand-repair`；[完整 UI/交互规格](page-specs/14-hand-repair.md)。
- **布局**/区域：手部蒙版画布｜人物类型｜生成数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：画笔大小、重置、撤销、重做；成年男性/成年女性/男孩/女孩；1–4张；原站菜单标下架但路由仍显示工作区。
- **交互/状态**联动：人物类型作为结构约束随任务快照保存；换图清蒙版；无蒙版不能生成；页面展示“原站已下架”证据标签，但本项目仍按独立工具实现。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T15｜商品图 `NEW_REPLACE_BG_V2`

- 路由：`/tools/product-design/new-replace-bg-v2`；[完整 UI/交互规格](page-specs/15-new-replace-bg-v2.md)。
- **布局**/区域：场景推荐/自定义背景｜商品层｜材质/锁定层｜合成画布｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：chunk 状态含 canvasData、sizeData、imageRecords、bgLayerRef、goodsLayerRef、bgMaskLayerRef、bgEraseLayerRef、bgExtractLayerRef、lockCutoutModal、weight=.7、sceneType=Recommend。页面是图层合成工作台而非简单两上传表单。
- **交互/状态**联动：背景/商品/材质/锁定层独立选择和抠图；拖动商品只更新 goods 层 point/scale/rotate；背景强度 weight 与场景类型进入任务快照；锁定层保护不应重绘区域；重置可分层撤销。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T16｜商品替换 `REPLACE_GOODS`

- 路由：`/tools/product-design/replace-goods`；[完整 UI/交互规格](page-specs/16-replace-goods.md)。
- **布局**/区域：参考场景画布｜透视/扭曲工具｜商品与锁定区域｜场景变化程度｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`PerspectiveWarpCanvas + LayerLockPanel + SkuWorkspaceSwitcher`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：工具快捷键透视T、扭曲N，Ctrl+拖动扭曲，左右键切画布；生成尺寸1024×1024；场景变化程度不变/高；4张；多商品批量替换。
- **交互/状态**联动：透视/扭曲改变 targetConfig 而非简单缩放；锁定图/蒙版保护原场景；变化程度控制背景重绘；切画布保留各SKU独立配置；未完成商品定位禁用提交。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T17｜场景裂变 `PRODUCT_SCENE`

- 路由：`/tools/product-design/product-scene`；[完整 UI/交互规格](page-specs/17-product-scene.md)。
- **布局**/区域：商品/场景参考上传｜背景相似度｜场景描述｜模型｜尺寸/数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：背景相似度；智能模式自动场景；场景描述可选0/100；写实/简约/智能；默认/自定义尺寸；1–4张。
- **交互/状态**联动：智能模式隐藏或弱化相似度手调并显示解释；描述与模型共同进入草稿；自定义尺寸展开宽高；改变参考图清结果但保留描述；批量多图可转套图流程。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T18｜手持商品 `HANDHELD_GOODS`

- 路由：`/tools/product-design/handheld-goods`；[完整 UI/交互规格](page-specs/18-handheld-goods.md)。
- **布局**/区域：商品图上传｜手持姿势库｜数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：商品图10M、384–4096；姿势参考展示手持部位与姿势；1–4张；示例流程上传手持物品→选择参考图→结果。
- **交互/状态**联动：姿势卡选择更新 modelId/modelTabType/sceneTabType；换姿势不重新上传商品；商品与姿势缺一不可；批量商品各自保留姿势快照。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T19｜AI穿衣 `AI_DRESSING_V2`

- 路由：`/tools/product-design/ai-dressing-v2`；[完整 UI/交互规格](page-specs/19-ai-dressing-v2.md)。
- **布局**/区域：上下装/连体衣 Tab｜服装上传｜模特选择｜数量｜试穿结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：上下装分别上传上装正面和下装正面；连体衣只上传套装；支持仅上/下装；10M；模特参考展示穿衣部位；批量穿衣入口。
- **交互/状态**联动：Tab 切换清理不适用服装字段但保留另一 Tab 草稿；模特与服装独立选择；生成任务固化 modelPose/modelType 和 garment masks；缺失当前 Tab 必填服装时禁用。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T20｜姿势裂变 `AI_POSTURE`

- 路由：`/tools/product-design/ai-posture`；[完整 UI/交互规格](page-specs/20-ai-posture.md)。
- **布局**/区域：模特姿势图上传｜姿势库/自定义｜姿势选择｜数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：上传单张模特图；姿势库或自定义文本；姿势选择可选；1–4张；一张模特图生成N种姿势。
- **交互/状态**联动：选择姿势库卡片写入结构化姿势，自定义切为文本 prompt；二者切换不互相覆盖草稿；未选姿势可自动裂变；结果按来源姿势分组。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T21｜AI穿戴 `AI_WEARABLE`

- 路由：`/tools/product-design/ai-wearable`；[完整 UI/交互规格](page-specs/21-ai-wearable.md)。
- **布局**/区域：穿戴商品上传｜商品品类｜穿戴模特｜数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：上传穿戴商品，建议用模特穿戴效果图；选择商品品类和穿戴模特；部位、角度与画面占比尽量相近；1–4张。
- **交互/状态**联动：品类改变可选穿戴部位和模特过滤；换模特不重新上传商品；商品/品类/模特全部必需；结果可回到原选择做单件重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T22｜POD素材 `AI_TEXT`

- 路由：`/tools/product-design/ai-text`；[完整 UI/交互规格](page-specs/22-ai-text.md)。
- **布局**/区域：POD 素材输入｜风格/平铺｜提示词与变体｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：当前账号访问 `/draw/ai-text` 重定向首页；依据字段组织 aiSimpleTextPrompt/prompt、styles/stylesCn、tilingPreset、mode、ratio、outputNum、variationStrength、useAutopromptOption；支持参考图与案例变体。
- **交互/状态**联动：简易文字与完整提示词模式互斥编辑；自动提示词开启时显示生成预览且可解锁手改；平铺预设改变图案重复规则；案例变体继承样式但新建任务。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T23｜饰品文字 `ORNAMENT_TEXT`

- 路由：`/tools/product-design/ornament-text`；[完整 UI/交互规格](page-specs/23-ornament-text.md)。
- **布局**/区域：饰品文字内容｜字体与字号｜左右定位｜效果预览｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：当前账号 `/draw/ornament-text` 重定向首页；字段明确为 prompt、fontname、fontSize、left、right。界面以文字样式编辑和预览为主，不虚构材质库。
- **交互/状态**联动：字体/字号变化实时更新文字层；left/right 控制文字在饰品上的相对位置；修改文字只更新预览，生成后保存参数快照。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T24｜素材贴合 `SDS_DESIGN`

- 路由：`/tools/product-design/sds-design`；[完整 UI/交互规格](page-specs/24-sds-design.md)。
- **布局**/区域：素材上传｜产品选择｜颜色选择｜素材操作画布｜贴合结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：上传素材；选择产品；选择颜色；素材操作用于位置/缩放/旋转；载荷 imageList/materialList/productId；20算力仅作证据不复制计费。
- **交互/状态**联动：产品改变替换承载模型/产品图层并重新计算可贴区域；颜色只改产品颜色；素材变换不影响产品层；缺素材或产品时禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T25｜印花提取 `PRINT_EXTRACT`

- 路由：`/tools/product-design/print-extract`；[完整 UI/交互规格](page-specs/25-print-extract.md)。
- **布局**/区域：商品图上传｜透明图开关｜提取结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ExtractUploader + TransparencySwitch + AssetResultGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：20M、384–4096、宽高比<5；支持批量；生成透明图开/关；目标是从商品中提取印花。
- **交互/状态**联动：透明开关决定背景移除和输出格式；批量时每张独立状态；换图清结果；提取不完整可回到原图重试，不自动生成假蒙版。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T26｜AI姿势生成 `AI_POSE_GENERATOR`

- 路由：`/tools/product-design/ai-pose-generator`；[完整 UI/交互规格](page-specs/26-ai-pose-generator.md)。
- **布局**/区域：姿势提示词｜场景提示词｜参考预览｜生成结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：补充工具，依据字段 prompt 与 scenePrompts；与 AI_POSTURE 的“已有模特图姿势裂变”不同，本页从文字生成姿势参考。
- **交互/状态**联动：姿势描述与场景描述分栏，场景不能覆盖姿势约束；可保存姿势预设；修改任一描述只更新草稿；无姿势描述禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T27｜AI试衣XSY `AI_DRESSING_XSY`

- 路由：`/tools/product-design/ai-dressing-xsy`；[完整 UI/交互规格](page-specs/27-ai-dressing-xsy.md)。
- **布局**/区域：模特图｜分步服装上传｜模特风格/姿势｜步骤状态｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段含 modelImageUrl、step、modelStyle/modelPose/modelType、upper/down/suit 三组图片和 mask；是分步试衣流程，区别于 AI 穿衣的参考模特选择。
- **交互/状态**联动：step 驱动“模特→服装→蒙版/姿势→生成”；回退上一步保留下游草稿但标为需重确认；切换上下装/套装清理冲突字段；每步显示完成状态。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T28｜场景裂变链接 `FISSION_LINK`

- 路由：`/tools/product-design/fission-link`；[完整 UI/交互规格](page-specs/28-fission-link.md)。
- **布局**/区域：参考图片/链接输入｜裂变数量｜场景变体结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：补充工具，字段 imageUrl/outputNum；与 PRODUCT_SCENE 的场景描述/模型/相似度不同，本页只做基于单图链接的快速裂变。
- **交互/状态**联动：合法图片 URL 加载预览后才可提交；数量决定变体组；链接变化作废旧预览和结果；失败保留链接便于修正。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- 路由：`/tools/product-design/image-text-edit`；[完整 UI/交互规格](page-specs/29-image-text-edit.md)。
- **布局**/区域：图片文字画布｜文本框列表｜属性编辑｜导出。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 boxes、图片尺寸/格式、resultImageUrl；每个 box 有位置、尺寸、文本和样式，中央画布与右侧属性联动。
- **交互/状态**联动：选画布文字框同步选右侧条目；编辑内容/字体/位置实时改 boxes；删除可撤销；导出前检查溢出和缺字；原图永不被覆盖。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T30｜上装换料 `MATERIAL_UPPER_BODY`

- 路由：`/tools/product-design/material-upper-body`；[完整 UI/交互规格](page-specs/30-material-upper-body.md)。
- **布局**/区域：上装图片｜材质类目｜抠图开关｜数量｜换料结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 categoryIds/categoryName/subType/isMatting/outputNum；只处理上装材质，保留版型。
- **交互/状态**联动：类目选择联动子类；isMatting 开启时先预览上装蒙版；换图清类目相关结果但可保留材质；缺材质类目禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T31｜商品图设计器 `NEW_DESIGNER`

- 路由：`/tools/product-design/new-designer`；[完整 UI/交互规格](page-specs/31-new-designer.md)。
- **布局**/区域：设计器宿主页｜素材/画布/图层｜属性面板｜完成回传。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`DesignerHost + LayerPanel + CanvasPropertyPanel + DoneBridge`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 designerId/imageUrl/isDesignerUse/open/onClose/onDone；是完整设计器宿主而非生成表单。三栏：素材与图层、中央画布、右侧属性，顶部撤销/重做/预览/完成。
- **交互/状态**联动：open 控制宿主；onDone 将设计结果保存为资产并返回来源工具；onClose 有未保存确认；designerId 恢复草稿；从图片进入时作为可编辑底图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- 路由：`/tools/product-design/product-market-material`；[完整 UI/交互规格](page-specs/32-product-market-material.md)。
- **布局**/区域：商品多图与信息｜品牌/平台/语言｜A+与营销画幅｜营销素材结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 APlusAspectRatio、aspectRatio、isCustomAspectRatio、platform、salesRegion、language、brandDNA、quality/resolution；与商品套图相比聚焦营销/A+，不设普通主副图组合。
- **交互/状态**联动：平台切换过滤合法 A+ 比例；自定义比例展开尺寸；品牌DNA控制字体主色；语言与销售地区随任务快照；输出按营销模块分组。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T33｜场景迁移 `SCENE_TRANSFER`

- 路由：`/tools/product-design/scene-transfer`；[完整 UI/交互规格](page-specs/33-scene-transfer.md)。
- **布局**/区域：商品图｜场景风格参考图｜相似度｜迁移结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 imageStyleUrl、imageUrl、segImageUrl、similarity；核心是商品与风格双输入，区别于 PRODUCT_SCENE 的文字场景裂变。
- **交互/状态**联动：风格参考加载后显示预览；相似度只影响场景风格保留程度；商品分段可预览重算；任一图缺失禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T34｜图转视频 `IMAGE_TO_VIDEO`

- 路由：`/tools/ai-video/image-to-video`；[完整 UI/交互规格](page-specs/34-image-to-video.md)。
- **布局**/区域：参考素材/首尾帧/商品链接｜商品信息｜视频类型｜模型品质｜时长比例地区语言｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：参考图最多9张；商品信息AI分析0/1600；视频类型必填，模板/自定义描述；产品展示、UGC种草、痛点解决、家居场景；MiniMax H3；768P/1080P；5/10/15秒；7种比例；销售国家与语言。
- **交互/状态**联动：素材模式切换保留各模式草稿但只提交当前模式；首尾帧开放首帧/尾帧上传；视频类型改变模板和提示词；国家联动默认语言；时长/分辨率/比例进入同一任务快照；生成中不可改源配置。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T35｜带货口播 `SALE_VIDEO`

- 路由：`/tools/ai-video/sale-video`；[完整 UI/交互规格](page-specs/35-sale-video.md)。
- **布局**/区域：商品多图｜口播提示词｜国家语言/AI帮写｜模型分辨率｜时长比例｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：最多9张商品图；提示词0/4000；美国/英语默认，AI帮写；Seedance 2.0 fast；480P/720P；5/10/15秒；7种比例。
- **交互/状态**联动：AI帮写只替换提示词草稿并可撤销；国家切换联动语言；图片/提示词/模型变化标记结果过期；口播不是数字人时间线，不虚构额外编辑器。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T36｜视频复刻 `VIDEO_REPLICATION`

- 路由：`/tools/ai-video/video-replication`；[完整 UI/交互规格](page-specs/36-video-replication.md)。
- **布局**/区域：TikTok链接/参考视频｜5–30秒截取｜商品参考图｜AI脚本分析｜视频设置｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：链接解析或MP4/MOV上传100M内；上传后截取5–30秒；商品参考最多6张；AI脚本分析选填默认自动；Seedance 2.0 fast；480/720P；Auto/5/10/15秒；比例/国家/语言。
- **交互/状态**联动：链接与上传互斥；视频解析成功才开放截取和脚本分析；截取更新 clipStart/clipEnd/duration；Auto时长跟随参考片段；替换参考视频清脚本和截取，但保留商品图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T37｜视频编辑 `AI_VIDEO_EDITING`

- 路由：`/tools/ai-video/ai-video-editing`；[完整 UI/交互规格](page-specs/37-ai-video-editing.md)。
- **布局**/区域：原视频与片段截取｜参考图｜编辑需求｜模型｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：MP4/MOV100M，至少4秒，超长截取30秒内；参考图最多30张；编辑需求0/2500并可提示词优化；Seedance 2.5；是提示词视频编辑，不是多轨时间线。
- **交互/状态**联动：视频上传后开放片段截取；参考图可排序删除；提示词优化可撤销；换源视频清截取和结果；编辑失败保留源视频/参考图/描述。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T38｜视频翻译 `VIDEO_TRANSLATION`

- 路由：`/tools/ai-video/video-translation`；[完整 UI/交互规格](page-specs/38-video-translation.md)。
- **布局**/区域：原视频｜高级模式｜目标语言｜口型同步｜翻译结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：MP4/MOV100M，建议2–30秒且音频完整；智能识别源语言；高级模式；目标语言；口型同步默认开启；原视频/翻译结果对比。
- **交互/状态**联动：目标语言改变只更新翻译配置；口型同步关闭时保留配音翻译但不做嘴形重绘；视频无效/无音轨给具体错误；失败保留语言配置可重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。
### UI-T39｜视频拼接 `VIDEO_CONCAT`

- 路由：`/tools/ai-video/video-concat`；[完整 UI/交互规格](page-specs/39-video-concat.md)。
- **布局**/区域：片段列表｜预览播放器｜排序/裁剪｜封面与比例｜导出。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。
- **配色/风格**与**组件**：组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。
- 真实控件：字段 videoList/videoTime/videoRatio/videoCoverUrl/editType；与 AI_VIDEO_EDITING 明确区分：本页是片段编排和拼接。左侧片段列表，中央预览，下方顺序/时长，右侧封面比例导出。
- **交互/状态**联动：拖拽排序即时更新总时长和预览顺序；单片裁剪改变 videoTime；封面可来自帧或上传图片；比例只改输出画布；任一片段失败可单独替换，不重传全部。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 响应式：桌面保留专用工作区；窄屏按输入/编辑/结果分步；画布、蒙版、播放器和片段列表不得缩成不可点击图标。


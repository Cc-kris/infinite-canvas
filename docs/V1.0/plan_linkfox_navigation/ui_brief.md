> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、五类页面 DOM；推断与补充关系均单独标注。

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

### UI-T01｜商品套图

- **类型/路由**：`PRODUCT_IMAGE_SUITE`；`/tools/ecommerce-suite/product-image-suite`；原站关系。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条；分类侧栏选中“商品套图”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `imageUrl`、`outputNum`。
- **交互/状态**：上传后选择套图组合；结果按视角分组，可单张重做或整组入库；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 成果槽横向滚动且配置在上；≤767px 分步 Tab 为“上传/分镜/结果”，保留当前步骤草稿。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T02｜服装套图

- **类型/路由**：`DRESS_WEAR_SET`；`/tools/ecommerce-suite/dress-wear-set`；原站关系。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条；分类侧栏选中“服装套图”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid。字段控件必须覆盖 `aspectRatio`、`brandDNA`、`brandKey`、`brandName`、`coverList`、`imageUrl`、`images`、`language`、`name`、`needIntelligent`、`outputNum`、`platform`、`provider`、`quality`、`resolution`、`salesRegion`。
- **交互/状态**：服装上传→平台/地区/语言→品牌信息→场景与比例→整组生成；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 成果槽横向滚动且配置在上；≤767px 分步 Tab 为“上传/分镜/结果”，保留当前步骤草稿。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T03｜套图换色

- **类型/路由**：`CHANGE_COLOR_V2`；`/tools/ecommerce-suite/change-color-v2`；原站关系。
- **布局**：色彩工作区：左配置、中央原图/结果对比、底部套图缩略图；分类侧栏选中“套图换色”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector。字段控件必须覆盖 `imageName`、`imageUrl`。
- **交互/状态**：先选套图，再在对比区统一预览；逐张微调不能破坏整组一致性；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 预览在上；≤767px 换色/场景/文案按手风琴分组，底部固定提交。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T04｜批量翻译

- **类型/路由**：`IMAGE_TRANSLATION`；`/tools/ecommerce-suite/image-translation`；原站关系。
- **布局**：翻译工作区：左语言与批任务、中央文本框画布、右校对列表；分类侧栏选中“批量翻译”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector。字段控件必须覆盖 `imageName`、`imageSegUrl`、`imageUrl`、`sourceLanguage`、`targetLanguage`。
- **交互/状态**：源/目标语言联动；逐文本框校对；确认后批量应用；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 参数摘要在上；≤767px 行表格转卡片，批量操作进入底部动作栏。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T05｜高清放大

- **类型/路由**：`SCALE_UP`；`/tools/ecommerce-suite/scale-up`；原站关系。
- **布局**：增强工作区：左参数、中央放大对比、右下输出信息卡；分类侧栏选中“高清放大”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl。字段控件必须覆盖 `enhanceFace`、`enhanceQuality`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`magnification`。
- **交互/状态**：倍率、面部增强、质量增强即时反映输出尺寸与限制；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 表单在上、结果在下；≤767px 结果双列或单列，下载操作不溢出。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T06｜智能扩图

- **类型/路由**：`AI_OUTPAINTING`；`/tools/ecommerce-suite/ai-outpainting`；原站关系。
- **布局**：扩图画布：左比例/尺寸、中央可拖拽边界画布、底部结果；分类侧栏选中“智能扩图”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor、SizeRatioControl。字段控件必须覆盖 `config`、`editFlag`、`height`、`imageConfig`、`imageExpandUrl`、`imageName`、`imageUrl`、`maskUrl`、`originImageUrl`、`outputNum`、`prompt`、`ratio`、`sizeSetHeight`、`sizeSetName`、`sizeSetType`、`sizeSetValue`、`sizeSetWidth`、`stageConfig`、`width`。
- **交互/状态**：拖拽扩图边界；原图锁定；比例、尺寸与蒙版同步；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 坐标编辑器全宽；≤767px 画布/属性分 Tab，保留撤销与精确数值输入。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T07｜局部重绘

- **类型/路由**：`AREA_REPAIR`；`/tools/smart-edit/area-repair`；原站关系。
- **布局**：蒙版工作区：左任务参数、中央画笔画布、右前后对比；分类侧栏选中“局部重绘”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor。字段控件必须覆盖 `autoExpand`、`imageName`、`imageUrl`、`maskUrl`、`outputNum`、`prompt`。
- **交互/状态**：画笔/橡皮/羽化；原图与结果并排；可撤销蒙版笔画；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 编辑器置上、参数在下；≤767px 画布适配屏宽，工具条横滑，涂抹需触控笔/手指。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T08｜局部消除

- **类型/路由**：`REMOVE_PEN`；`/tools/smart-edit/remove-pen`；原站关系。
- **布局**：蒙版工作区：左任务参数、中央画笔画布、右前后对比；分类侧栏选中“局部消除”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor。字段控件必须覆盖 `eraseImageUrl`、`imageName`、`imageUrl`、`maskImageUrl`。
- **交互/状态**：仅显示消除所需控件；涂抹预览与前后对比；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 编辑器置上、参数在下；≤767px 画布适配屏宽，工具条横滑，涂抹需触控笔/手指。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T09｜一键换色

- **类型/路由**：`CHANGE_COLOR`；`/tools/smart-edit/change-color`；原站关系。
- **布局**：色彩工作区：左配置、中央原图/结果对比、底部套图缩略图；分类侧栏选中“一键换色”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、InteractiveCanvas / PropertyInspector。字段控件必须覆盖 `adjustLight`、`colorParams`、`coverList`、`doInpaint`、`imageFormat`、`imageHeight`、`imageMaskUrl`、`imageName`、`imageSegUrl`、`imageSize`、`imageTagData`、`imageUrl`、`imageWidth`、`images`、`name`、`sourceImageUrl`。
- **交互/状态**：区域选择→目标色→光照/重绘选项→对比；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 预览在上；≤767px 换色/场景/文案按手风琴分组，底部固定提交。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T10｜图片裁剪

- **类型/路由**：`IMAGE_CROP`；`/tools/smart-edit/image-crop`；原站关系。
- **布局**：裁剪工作区：左平台/比例、中央裁剪框、右输出预览；分类侧栏选中“图片裁剪”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl。字段控件必须覆盖 `activeTab`、`contentUrl`、`imageCropUrl`、`imageFormat`、`imageHeight`、`imageSize`、`imageUrl`、`imageWidth`、`platform`、`platformTitle`、`ratio`、`selectedMode`。
- **交互/状态**：裁剪框、平台预设、自由比例和输出尺寸同步；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 坐标编辑器全宽；≤767px 画布/属性分 Tab，保留撤销与精确数值输入。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T11｜商品精修

- **类型/路由**：`PRODUCT_REFINE`；`/tools/smart-edit/product-refine`；原站关系。
- **布局**：增强工作区：左参数、中央放大对比、右下输出信息卡；分类侧栏选中“商品精修”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl。字段控件必须覆盖 `color`、`imageOutputLength`、`imageSegUrl`、`imageUrl`、`imgTransform`、`isRmBg`、`ratio`、`realImageUrl`。
- **交互/状态**：精修强度、去背景、比例与色彩配置集中显示；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 表单在上、结果在下；≤767px 结果双列或单列，下载操作不溢出。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T12｜色差修复

- **类型/路由**：`FIX_COLOR`；`/tools/smart-edit/fix-color`；原站关系。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比；分类侧栏选中“色差修复”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor。字段控件必须覆盖 `fixColorSegUrl`、`fixColorUrl`、`imageName`、`imageResultUrl`、`imageSegUrl`、`imageUrl`、`version`。
- **交互/状态**：选择修复区域，版本与分割结果可追溯；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 编辑器置上、参数在下；≤767px 画布适配屏宽，工具条横滑，涂抹需触控笔/手指。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T13｜印花修复

- **类型/路由**：`PRINTING_REPAIR`；`/tools/smart-edit/printing-repair`；原站关系。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比；分类侧栏选中“印花修复”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl。字段控件必须覆盖 `config`、`height`、`imageResultUrl`、`imageUrl`、`point`、`rotate`、`scale`、`stampingFlowerSegUrl`、`stampingFlowerUrl`、`targetConfig`、`url`、`version`、`width`。
- **交互/状态**：定位印花→修复强度/旋转缩放→局部对比；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 编辑器置上、参数在下；≤767px 画布适配屏宽，工具条横滑，涂抹需触控笔/手指。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T14｜手部修复

- **类型/路由**：`HAND_REPAIR`；`/tools/smart-edit/hand-repair`；原站关系。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比；分类侧栏选中“手部修复”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor。字段控件必须覆盖 `imageName`、`imageUrl`、`maskUrl`、`outputNum`、`personType`。
- **交互/状态**：人物类型、手部蒙版、输出数量；标注原站即将下架；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 编辑器置上、参数在下；≤767px 画布适配屏宽，工具条横滑，涂抹需触控笔/手指。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T15｜商品图

- **类型/路由**：`NEW_REPLACE_BG_V2`；`/tools/product-design/new-replace-bg-v2`；原站关系。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格；分类侧栏选中“商品图”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `fields_clean=[]`：不得解释为无参数；实施前回查原 chunk 与动态配置。
- **交互/状态**：商品上传→抠图确认→场景模板或自定义→结果网格；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 场景在上、参数在下；≤767px 场景横滑、结果单列。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T16｜商品替换

- **类型/路由**：`REPLACE_GOODS`；`/tools/product-design/replace-goods`；原站关系。
- **布局**：双对象合成：左双输入、中央位置/蒙版编辑、右合成结果；分类侧栏选中“商品替换”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl。字段控件必须覆盖 `config`、`cutoutProvider`、`denoiseStrength`、`height`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`lockImageUrl`、`maskUrl`、`outputNum`、`point`、`ratio`、`rotate`、`scale`、`sourceImageUrl`、`sourceOriginUrl`、`targetConfig`、`targetImageUrl`、`targetOriginUrl`、`url`、`width`。
- **交互/状态**：目标商品与新商品双输入；位置、缩放、旋转和蒙版可视化；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 双图上传上下排列；≤767px 参考/模特分 Tab 并持续显示两张缩略图。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T17｜场景裂变

- **类型/路由**：`PRODUCT_SCENE`；`/tools/product-design/product-scene`；原站关系。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格；分类侧栏选中“场景裂变”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid。字段控件必须覆盖 `cutoutProvider`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`mode`、`originImageUrl`、`outputNum`、`prompt`、`provider`、`ratio`、`sceneKeyword`、`segImageUrl`、`sizeType`、`strength`。
- **交互/状态**：模式、场景词、强度、尺寸、Provider 能力与输出数量联动；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 场景在上、参数在下；≤767px 场景横滑、结果单列。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T18｜手持商品

- **类型/路由**：`HANDHELD_GOODS`；`/tools/product-design/handheld-goods`；原站关系。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果；分类侧栏选中“手持商品”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid。字段控件必须覆盖 `checkType`、`imageMaskUrl`、`imageResultUrl`、`imageUrl`、`modelId`、`modelTabType`、`outputNum`、`sceneTabType`、`targetMaskUrl`、`targetOriginUrl`、`targetResultUrl`。
- **交互/状态**：模特/场景/商品类别选择，商品与目标区域双预览；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 姿态矩阵置上、右侧参数下移；≤767px 单图三姿态横滑，结果逐张排列。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T19｜AI穿衣

- **类型/路由**：`AI_DRESSING_V2`；`/tools/product-design/ai-dressing-v2`；原站关系。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果；分类侧栏选中“AI穿衣”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid。字段控件必须覆盖 `coverList`、`downImageUrl`、`downMaskUrl`、`downOriginUrl`、`genOriRes`、`images`、`isSecondOperate`、`modelPose`、`modelPoseList`、`modelType`、`name`、`outputNum`、`provider`、`suitImageUrl`、`suitMaskUrl`、`suitOriginUrl`、`upperImageUrl`、`upperMaskUrl`、`upperOriginUrl`、`version`。
- **交互/状态**：分步选择服装部位；原图/蒙版/结果状态可回溯；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 服装画廊置上；≤767px 双列服装卡，单品配置逐项展开。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T20｜姿势裂变

- **类型/路由**：`AI_POSTURE`；`/tools/product-design/ai-posture`；原站关系。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果；分类侧栏选中“姿势裂变”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid。字段控件必须覆盖 `imageTags`、`imageUrl`、`outputNum`、`prompt`。
- **交互/状态**：人物上传→姿势/标签→Prompt→多结果选择；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 姿态矩阵置上、右侧参数下移；≤767px 单图三姿态横滑，结果逐张排列。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T21｜AI穿戴

- **类型/路由**：`AI_WEARABLE`；`/tools/product-design/ai-wearable`；原站关系。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果；分类侧栏选中“AI穿戴”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid。字段控件必须覆盖 `checkType`、`imageMaskUrl`、`imageResultUrl`、`imageUrl`、`isSecondOperate`、`modelId`、`modelTabType`、`outputNum`、`productCategory`、`sceneTabType`、`targetMaskUrl`、`targetOriginUrl`、`targetResultUrl`。
- **交互/状态**：穿戴部位、品类、模特与目标蒙版联动；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 服装画廊置上；≤767px 双列服装卡，单品配置逐项展开。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T22｜POD素材

- **类型/路由**：`AI_TEXT`；`/tools/product-design/ai-text`；原站关系。
- **布局**：POD 工作区：左风格与素材、中央模板/平铺预览、右结果；分类侧栏选中“POD素材”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ImageResultGrid。字段控件必须覆盖 `aiSimpleTextPrompt`、`imageUrl`、`isCase`、`mode`、`outputNum`、`prompt`、`ratio`、`requestId`、`responseId`、`styles`、`stylesCn`、`tilingPreset`、`useAutopromptOption`、`variationStrength`。
- **交互/状态**：模式/风格/平铺/自动Prompt/变化强度分组配置；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 图层移到底部；≤767px 图层/属性/预览三 Tab，选中态保持同步。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T23｜饰品文字

- **类型/路由**：`ORNAMENT_TEXT`；`/tools/product-design/ornament-text`；原站关系。
- **布局**：文字工作区：左文字/字体参数、中央画布文本框、右预览；分类侧栏选中“饰品文字”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、PromptEditor、CapabilityNotice、TaskStatusPanel、PromptComposer、InteractiveCanvas / PropertyInspector。字段控件必须覆盖 `fontSize`、`fontname`、`left`、`prompt`、`right`。
- **交互/状态**：文字内容、字体、字号和左右区域参数实时预览；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px SVG 预览与参数上下排列；≤767px 代码编辑与预览分 Tab。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T24｜素材贴合

- **类型/路由**：`SDS_DESIGN`；`/tools/product-design/sds-design`；原站关系。
- **布局**：POD 工作区：左风格与素材、中央模板/平铺预览、右结果；分类侧栏选中“素材贴合”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `imageList`、`imageName`、`imageUrl`、`materialList`、`productId`。
- **交互/状态**：商品与素材多选；贴合对象和输出预览一一对应；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 图层移到底部；≤767px 图层/属性/预览三 Tab，选中态保持同步。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T25｜印花提取

- **类型/路由**：`PRINT_EXTRACT`；`/tools/product-design/print-extract`；原站关系。
- **布局**：提取工作区：左透明背景选项、中央原图、右提取结果；分类侧栏选中“印花提取”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel。字段控件必须覆盖 `imageUrl`、`isTransparent`。
- **交互/状态**：透明背景开关与原图/提取结果对比；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 表单在上、结果在下；≤767px 结果双列或单列，下载操作不溢出。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T26｜AI姿势生成

- **类型/路由**：`AI_POSE_GENERATOR`；`/tools/product-design/ai-pose-generator`；补充关系（原站五类未直接给出）。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果；分类侧栏选中“AI姿势生成”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid。字段控件必须覆盖 `prompt`、`scenePrompts`。
- **交互/状态**：场景 Prompt 列表与主 Prompt 分层编辑；补充工具标识；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 姿态矩阵置上、右侧参数下移；≤767px 单图三姿态横滑，结果逐张排列。
- **证据边界**：五类 draw 菜单无此 drawType；JS 仅出现在工具类型集合，不是菜单证据。

### UI-T27｜AI试衣XSY

- **类型/路由**：`AI_DRESSING_XSY`；`/tools/product-design/ai-dressing-xsy`；补充关系（原站五类未直接给出）。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果；分类侧栏选中“AI试衣XSY”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid。字段控件必须覆盖 `downImageUrl`、`downMaskUrl`、`downOriginUrl`、`modelImageUrl`、`modelPose`、`modelStyle`、`modelType`、`outputNum`、`provider`、`step`、`suitImageUrl`、`suitMaskUrl`、`suitOriginUrl`、`upperImageUrl`、`upperMaskUrl`、`upperOriginUrl`、`version`。
- **交互/状态**：步骤条、服装/模特输入、Provider 与版本能力检查；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 服装画廊置上；≤767px 双列服装卡，单品配置逐项展开。
- **证据边界**：五类 draw 菜单无该 drawType，本项目按最近业务域补充。

### UI-T28｜场景裂变链接

- **类型/路由**：`FISSION_LINK`；`/tools/product-design/fission-link`；补充关系（原站五类未直接给出）。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格；分类侧栏选中“场景裂变链接”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `imageUrl`、`outputNum`。
- **交互/状态**：单图输入和数量控制；与 PRODUCT_SCENE 区分，不混用契约；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 场景在上、参数在下；≤767px 场景横滑、结果单列。
- **证据边界**：五类 draw 菜单无此 drawType；JS 仅出现在分享/工具类型相关集合，不是菜单证据。

### UI-T29｜图片文字编辑

- **类型/路由**：`IMAGE_TEXT_EDIT`；`/tools/product-design/image-text-edit`；补充关系（原站五类未直接给出）。
- **布局**：文字工作区：左文字/字体参数、中央画布文本框、右预览；分类侧栏选中“图片文字编辑”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector。字段控件必须覆盖 `boxes`、`imageFormat`、`imageHeight`、`imageName`、`imageSize`、`imageUrl`、`imageWidth`、`resultImageUrl`。
- **交互/状态**：画布文本框选择、内容编辑、尺寸保持和结果回写；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px SVG 预览与参数上下排列；≤767px 代码编辑与预览分 Tab。
- **证据边界**：五类 draw 菜单无该 drawType，本项目按最近业务域补充。

### UI-T30｜上装换料

- **类型/路由**：`MATERIAL_UPPER_BODY`；`/tools/product-design/material-upper-body`；补充关系（原站五类未直接给出）。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果；分类侧栏选中“上装换料”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `categoryIds`、`categoryName`、`imageName`、`imageUrl`、`isMatting`、`outputNum`、`subType`。
- **交互/状态**：上装与材质分类联动；抠图开关和数量配置；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 服装画廊置上；≤767px 双列服装卡，单品配置逐项展开。
- **证据边界**：五类 draw 菜单无该 drawType，本项目按最近业务域补充。

### UI-T31｜商品图设计器

- **类型/路由**：`NEW_DESIGNER`；`/tools/product-design/new-designer`；补充关系（原站五类未直接给出）。
- **布局**：设计器宿主：顶部文档操作条、左素材/模板、中央画布、右属性；分类侧栏选中“商品图设计器”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、DesignerHost / DraftRecovery。字段控件必须覆盖 `designerId`、`imageUrl`、`isDesignerUse`、`onClose`、`onDone`、`open`。
- **交互/状态**：设计器宿主、返回/完成回调、草稿恢复；不是普通生成表单；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 设计器占满内容区；≤767px 图层/属性进 Drawer，画布手势不劫持页面返回。
- **证据边界**：五类 draw 菜单无此 drawType；创建设计侧栏 path 无 drawType，不把宿主页面等同该类型。

### UI-T32｜商品营销素材

- **类型/路由**：`PRODUCT_MARKET_MATERIAL`；`/tools/product-design/product-market-material`；补充关系（原站五类未直接给出）。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条；分类侧栏选中“商品营销素材”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid。字段控件必须覆盖 `APlusAspectRatio`、`aspectRatio`、`brandDNA`、`brandKey`、`brandName`、`coverList`、`images`、`isCustomAspectRatio`、`language`、`name`、`platform`、`provider`、`quality`、`resolution`、`salesRegion`。
- **交互/状态**：平台、销售地区、品牌、A+比例与模板组合；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 成果槽横向滚动且配置在上；≤767px 分步 Tab 为“上传/分镜/结果”，保留当前步骤草稿。
- **证据边界**：五类 draw 菜单无此 drawType；JS 仅出现在推荐/工具类型相关配置，不是菜单证据。

### UI-T33｜场景迁移

- **类型/路由**：`SCENE_TRANSFER`；`/tools/product-design/scene-transfer`；补充关系（原站五类未直接给出）。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格；分类侧栏选中“场景迁移”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid。字段控件必须覆盖 `imageStyleUrl`、`imageUrl`、`segImageUrl`、`similarity`。
- **交互/状态**：商品图+风格参考图双输入，相似度连续调节；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 场景在上、参数在下；≤767px 场景横滑、结果单列。
- **证据边界**：五类 draw 菜单无该 drawType，本项目按最近业务域补充。

### UI-T34｜图转视频

- **类型/路由**：`IMAGE_TO_VIDEO`；`/tools/ai-video/image-to-video`；原站关系。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“图转视频”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `aspectRatio`、`duration`、`extension`、`fileKey`、`fileName`、`imageInputMode`、`imageList`、`imageUrl`、`isPro`、`language`、`lastFrameImageUrl`、`productInfo`、`productUrl`、`prompt`、`promptOptimizer`、`referenceAudios`、`referenceDocument`、`referenceVideo`、`saleCountry`、`size`、`sourceImageUrl`、`templateKey`、`templateName`、`thumbUrl`、`url`、`videoTime`、`videoType`。
- **交互/状态**：首帧/首尾帧、参考素材、时长/比例/清晰度/音频分步配置；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T35｜带货口播

- **类型/路由**：`SALE_VIDEO`；`/tools/ai-video/sale-video`；原站关系。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“带货口播”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `aspectRatio`、`hiddenPrompt`、`imageList`、`imageUrl`、`isPro`、`language`、`prompt`、`resolution`、`saleCountry`、`videoTime`、`videoType`、`visiblePrompt`。
- **交互/状态**：商品信息、可见Prompt、隐藏Prompt、语言/地区与视频参数；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T36｜视频复刻

- **类型/路由**：`VIDEO_REPLICATION`；`/tools/ai-video/video-replication`；原站关系。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“视频复刻”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `analyzeRedisKey`、`aspectRatio`、`clipEnd`、`clipMode`、`clipStart`、`coverUrl`、`duration`、`imageSegUrl`、`imageUrl`、`isPro`、`originalVideoId`、`originalVideoUrl`、`prompt`、`promptOptimizer`、`ratio`、`refImageList`、`refVideoName`、`refVideoUrl`、`resolution`、`saleCountry`、`sourceVideoDuration`、`sourceVideoUrl`、`targetLanguage`、`videoCoverType`、`videoSource`、`videoTime`、`videoType`。
- **交互/状态**：视频上传→片段裁剪→分析→替换素材→目标语言与输出；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T37｜视频编辑

- **类型/路由**：`AI_VIDEO_EDITING`；`/tools/ai-video/ai-video-editing`；原站关系。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“视频编辑”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `duration`、`outputNum`、`prompt`、`refImageUrls`、`sourceVideoDuration`、`sourceVideoUrl`、`videoType`。
- **交互/状态**：源视频、参考图、编辑Prompt、时长和视频类型联动；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T38｜视频翻译

- **类型/路由**：`VIDEO_TRANSLATION`；`/tools/ai-video/video-translation`；原站关系。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“视频翻译”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `lipSync`、`outputNum`、`sourceLanguage`、`sourceVideoName`、`sourceVideoUrl`、`targetLanguage`、`videoType`。
- **交互/状态**：源/目标语言、口型同步能力检查、输出数量和播放器对比；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单数组存在相同 drawType；canonical 归属按该菜单。

### UI-T39｜视频拼接

- **类型/路由**：`VIDEO_CONCAT`；`/tools/ai-video/video-concat`；补充关系（原站五类未直接给出）。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态；分类侧栏选中“视频拼接”，内容头显示类型与草稿状态。
- **组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer。字段控件必须覆盖 `editType`、`imageFormat`、`imageHeight`、`imageSize`、`imageUrl`、`imageWidth`、`videoCoverUrl`、`videoList`、`videoRatio`、`videoTime`。
- **交互/状态**：时间线排序、片段裁剪、封面、比例与总时长；补充工具；上传、校验、运行、空结果、失败、恢复均有对应视觉态。
- **配色/风格**：沿用第 5 节无限画布令牌；只有画布、蒙版、播放器等使用中性深色工作面；结果选中环用 primary，失败用 destructive，不用 LinkFox 品牌紫。
- **响应式**：≤1199px 播放器置上、时间线全宽；≤767px 上传/分镜/播放分步，禁止把多轨压成不可点小图标。
- **证据边界**：五类 draw 菜单无此 drawType；视频编辑入口实际 drawType=MOLI_VIDEO_EDIT，拼接仅见推荐/类型引用。

## 9. 可访问性与视觉验收

键盘完成菜单、上传、表单、结果操作；焦点可见；错误与状态不只靠颜色；文本对比≥4.5:1；200% 缩放不丢功能；减少动态效果遵循 `prefers-reduced-motion`。最终需桌面/移动真实页面证据；本轮无截图权限，故只交付文档与线框，不声明 UI 已实现。
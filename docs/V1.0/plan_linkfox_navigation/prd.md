> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、五类页面 DOM；推断与补充关系均单独标注。

# PRD｜LinkFox 五类导航与 39 工具独立工作区

节点评分：2。版本：1.0。目标：在无限画布内提供原站式信息架构和完整工具工作流，而不是画布节点。

## 1. 背景与产品判断

- 用户是高频处理电商图片/视频的运营与设计人员，需要少跳转、可恢复、可批量、结果可复用。
- 复刻原站的信息架构、工具布局与交互；无限画布保留自身品牌、设计令牌、模型配置和资产体系。
- 原站五类并非天然互斥覆盖 39 个 create 类型。本项目使用唯一主分类；批量类通过引用编排，避免重复计数。

## 2. 范围

### In scope

五类顶部菜单、39 个工具独立路由、左侧工具栏、右侧工具内容、上传/配置/任务/结果/历史、批量任务、保存资产/发送画布、移动端 Drawer、失败与能力降级。

### Out of scope（本轮及首版边界）

选品、算力包、原站鉴权/积分、原站服务端直接调用、未经证实的 Prompt 或模型能力、自动商用原站素材。文档交付不等于任何代码已完成。

## 3. 导航与页面结构

- 顶栏一级顺序：电商套图 → 智能修图 → 批量生图 → 商品图设计 → AI视频。
- 一级点击进入分类默认页；hover/focus 打开二级菜单；二级点击进入 `/tools/:category/:toolId`。
- 工具页左侧固定工具栏，右侧内容；分类、菜单、侧栏和面包屑四态同步。
- 批量生图引用 12 个适用工具；进入 `mode=batch`，每个 SKU/输入行生成独立子任务。

## 4. 角色与核心流程

运营：上传商品→选工具→生成→筛选→保存资产。设计：上传→蒙版/位置/文本调整→对比→送画布。批量人员：导入 SKU→映射字段→预检→分批执行→失败行重试。

## 5. 功能需求

### REQ-001 五类一级菜单顺序、键盘/触屏操作与激活态完整。
**验收**：五类一级菜单顺序、键盘/触屏操作与激活态完整。 对应测试 TC-001；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-002 39 个 type 无重复无遗漏，均有独立标题、布局、字段和路由。
**验收**：39 个 type 无重复无遗漏，均有独立标题、布局、字段和路由。 对应测试 TC-002；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-003 分类页为左工具栏+右内容；原站关系与补充关系可辨识。
**验收**：分类页为左工具栏+右内容；原站关系与补充关系可辨识。 对应测试 TC-003；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-004 上传支持本地/资产库，校验格式/大小/尺寸，展示进度与取消。
**验收**：上传支持本地/资产库，校验格式/大小/尺寸，展示进度与取消。 对应测试 TC-004；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-005 表单由真实 ToolSpec 驱动，禁止无效字段和静默丢参。
**验收**：表单由真实 ToolSpec 驱动，禁止无效字段和静默丢参。 对应测试 TC-005；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-006 任务具备 draft/ready/queued/running/succeeded/failed/canceled 状态。
**验收**：任务具备 draft/ready/queued/running/succeeded/failed/canceled 状态。 对应测试 TC-006；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-007 刷新/断网恢复任务；不得重复提交或重复扣费。
**验收**：刷新/断网恢复任务；不得重复提交或重复扣费。 对应测试 TC-007；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-008 结果支持预览、下载、保存资产、发送画布；视频支持播放。
**验收**：结果支持预览、下载、保存资产、发送画布；视频支持播放。 对应测试 TC-008；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-009 批量支持行级预检、并发上限、部分成功、单行重试和导出报告。
**验收**：批量支持行级预检、并发上限、部分成功、单行重试和导出报告。 对应测试 TC-009；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-010 Provider 不支持参考视频/蒙版/口型等时明确禁用或替代确认。
**验收**：Provider 不支持参考视频/蒙版/口型等时明确禁用或替代确认。 对应测试 TC-010；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-011 Prompt 区分可见输入、模板变量、隐藏编排，不伪造服务端黑盒。
**验收**：Prompt 区分可见输入、模板变量、隐藏编排，不伪造服务端黑盒。 对应测试 TC-011；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-012 桌面、平板、移动布局无溢出，键盘焦点和对比度合格。
**验收**：桌面、平板、移动布局无溢出，键盘焦点和对比度合格。 对应测试 TC-012；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-013 既有画布、图片、视频、资产、设置路由不回归。
**验收**：既有画布、图片、视频、资产、设置路由不回归。 对应测试 TC-013；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-014 所有异常有用户可理解提示、诊断 ID 和安全重试路径。
**验收**：所有异常有用户可理解提示、诊断 ID 和安全重试路径。 对应测试 TC-014；最终须有真实 UI/API/持久化证据，不接受只读代码。

### REQ-015 原站素材仅作开发基准；生产资产遵守授权和签名 URL 生命周期。
**验收**：原站素材仅作开发基准；生产资产遵守授权和签名 URL 生命周期。 对应测试 TC-015；最终须有真实 UI/API/持久化证据，不接受只读代码。

## 6. 通用状态与异常

空态说明输入要求；草稿自动保存；上传/提交按钮防连点；运行中允许离开；失败保留输入；取消不删除已产物；权限/模型未配置时跳到对应设置但不清空草稿。

## 7. 39 个工具逐页产品需求

### REQ-T01｜商品套图 `PRODUCT_IMAGE_SUITE`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/product-image-suite`；原站关系。
- **用户目标**：一张商品图生成多视角白底图与实拍套图。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `imageUrl`、`outputNum`。
- **核心交互**：上传后选择套图组合；结果按视角分组，可单张重做或整组入库。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T02｜服装套图 `DRESS_WEAR_SET`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/dress-wear-set`；原站关系。
- **用户目标**：围绕服装商品生成平台化套图。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid；契约字段 `aspectRatio`、`brandDNA`、`brandKey`、`brandName`、`coverList`、`imageUrl`、`images`、`language`、`name`、`needIntelligent`、`outputNum`、`platform`、`provider`、`quality`、`resolution`、`salesRegion`。
- **核心交互**：服装上传→平台/地区/语言→品牌信息→场景与比例→整组生成。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T03｜套图换色 `CHANGE_COLOR_V2`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/change-color-v2`；原站关系。
- **用户目标**：对整套商品图执行一致换色。
- **布局**：色彩工作区：左配置、中央原图/结果对比、底部套图缩略图。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector；契约字段 `imageName`、`imageUrl`。
- **核心交互**：先选套图，再在对比区统一预览；逐张微调不能破坏整组一致性。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T04｜批量翻译 `IMAGE_TRANSLATION`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/image-translation`；原站关系。
- **用户目标**：翻译图片内文字并保留版式。
- **布局**：翻译工作区：左语言与批任务、中央文本框画布、右校对列表。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector；契约字段 `imageName`、`imageSegUrl`、`imageUrl`、`sourceLanguage`、`targetLanguage`。
- **核心交互**：源/目标语言联动；逐文本框校对；确认后批量应用。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T05｜高清放大 `SCALE_UP`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/scale-up`；原站关系。
- **用户目标**：放大图片并增强细节。
- **布局**：增强工作区：左参数、中央放大对比、右下输出信息卡。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl；契约字段 `enhanceFace`、`enhanceQuality`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`magnification`。
- **核心交互**：倍率、面部增强、质量增强即时反映输出尺寸与限制。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T06｜智能扩图 `AI_OUTPAINTING`

- **归属/路由**：电商套图；`/tools/ecommerce-suite/ai-outpainting`；原站关系。
- **用户目标**：调整画布比例并补全画面。
- **布局**：扩图画布：左比例/尺寸、中央可拖拽边界画布、底部结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor、SizeRatioControl；契约字段 `config`、`editFlag`、`height`、`imageConfig`、`imageExpandUrl`、`imageName`、`imageUrl`、`maskUrl`、`originImageUrl`、`outputNum`、`prompt`、`ratio`、`sizeSetHeight`、`sizeSetName`、`sizeSetType`、`sizeSetValue`、`sizeSetWidth`、`stageConfig`、`width`。
- **核心交互**：拖拽扩图边界；原图锁定；比例、尺寸与蒙版同步。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T07｜局部重绘 `AREA_REPAIR`

- **归属/路由**：智能修图；`/tools/smart-edit/area-repair`；原站关系。
- **用户目标**：用蒙版和提示词重绘局部。
- **布局**：蒙版工作区：左任务参数、中央画笔画布、右前后对比。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor；契约字段 `autoExpand`、`imageName`、`imageUrl`、`maskUrl`、`outputNum`、`prompt`。
- **核心交互**：画笔/橡皮/羽化；原图与结果并排；可撤销蒙版笔画。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T08｜局部消除 `REMOVE_PEN`

- **归属/路由**：智能修图；`/tools/smart-edit/remove-pen`；原站关系。
- **用户目标**：涂抹移除不需要的区域。
- **布局**：蒙版工作区：左任务参数、中央画笔画布、右前后对比。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor；契约字段 `eraseImageUrl`、`imageName`、`imageUrl`、`maskImageUrl`。
- **核心交互**：仅显示消除所需控件；涂抹预览与前后对比。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T09｜一键换色 `CHANGE_COLOR`

- **归属/路由**：智能修图；`/tools/smart-edit/change-color`；原站关系。
- **用户目标**：对选中商品区域换色。
- **布局**：色彩工作区：左配置、中央原图/结果对比、底部套图缩略图。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、InteractiveCanvas / PropertyInspector；契约字段 `adjustLight`、`colorParams`、`coverList`、`doInpaint`、`imageFormat`、`imageHeight`、`imageMaskUrl`、`imageName`、`imageSegUrl`、`imageSize`、`imageTagData`、`imageUrl`、`imageWidth`、`images`、`name`、`sourceImageUrl`。
- **核心交互**：区域选择→目标色→光照/重绘选项→对比。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T10｜图片裁剪 `IMAGE_CROP`

- **归属/路由**：智能修图；`/tools/smart-edit/image-crop`；原站关系。
- **用户目标**：按比例或平台规格裁剪图片。
- **布局**：裁剪工作区：左平台/比例、中央裁剪框、右输出预览。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl；契约字段 `activeTab`、`contentUrl`、`imageCropUrl`、`imageFormat`、`imageHeight`、`imageSize`、`imageUrl`、`imageWidth`、`platform`、`platformTitle`、`ratio`、`selectedMode`。
- **核心交互**：裁剪框、平台预设、自由比例和输出尺寸同步。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T11｜商品精修 `PRODUCT_REFINE`

- **归属/路由**：智能修图；`/tools/smart-edit/product-refine`；原站关系。
- **用户目标**：提升商品质感并控制背景处理。
- **布局**：增强工作区：左参数、中央放大对比、右下输出信息卡。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl；契约字段 `color`、`imageOutputLength`、`imageSegUrl`、`imageUrl`、`imgTransform`、`isRmBg`、`ratio`、`realImageUrl`。
- **核心交互**：精修强度、去背景、比例与色彩配置集中显示。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T12｜色差修复 `FIX_COLOR`

- **归属/路由**：智能修图；`/tools/smart-edit/fix-color`；原站关系。
- **用户目标**：修复商品色差和局部色彩异常。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor；契约字段 `fixColorSegUrl`、`fixColorUrl`、`imageName`、`imageResultUrl`、`imageSegUrl`、`imageUrl`、`version`。
- **核心交互**：选择修复区域，版本与分割结果可追溯。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T13｜印花修复 `PRINTING_REPAIR`

- **归属/路由**：智能修图；`/tools/smart-edit/printing-repair`；原站关系。
- **用户目标**：修复印花区域并保持图案结构。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl；契约字段 `config`、`height`、`imageResultUrl`、`imageUrl`、`point`、`rotate`、`scale`、`stampingFlowerSegUrl`、`stampingFlowerUrl`、`targetConfig`、`url`、`version`、`width`。
- **核心交互**：定位印花→修复强度/旋转缩放→局部对比。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T14｜手部修复 `HAND_REPAIR`

- **归属/路由**：智能修图；`/tools/smart-edit/hand-repair`；原站关系。
- **用户目标**：修复人物手部结构异常。
- **布局**：修复工作区：左区域与版本参数、中央局部编辑器、右对比。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor；契约字段 `imageName`、`imageUrl`、`maskUrl`、`outputNum`、`personType`。
- **核心交互**：人物类型、手部蒙版、输出数量；标注原站即将下架。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T15｜商品图 `NEW_REPLACE_BG_V2`

- **归属/路由**：商品图设计；`/tools/product-design/new-replace-bg-v2`；原站关系。
- **用户目标**：为商品生成新背景/场景图。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `fields_clean=[]`：不得解释为无参数；实施前回查原 chunk 与动态配置。
- **核心交互**：商品上传→抠图确认→场景模板或自定义→结果网格。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T16｜商品替换 `REPLACE_GOODS`

- **归属/路由**：商品图设计；`/tools/product-design/replace-goods`；原站关系。
- **用户目标**：将场景中的原商品替换为新商品。
- **布局**：双对象合成：左双输入、中央位置/蒙版编辑、右合成结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl；契约字段 `config`、`cutoutProvider`、`denoiseStrength`、`height`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`lockImageUrl`、`maskUrl`、`outputNum`、`point`、`ratio`、`rotate`、`scale`、`sourceImageUrl`、`sourceOriginUrl`、`targetConfig`、`targetImageUrl`、`targetOriginUrl`、`url`、`width`。
- **核心交互**：目标商品与新商品双输入；位置、缩放、旋转和蒙版可视化。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T17｜场景裂变 `PRODUCT_SCENE`

- **归属/路由**：商品图设计；`/tools/product-design/product-scene`；原站关系。
- **用户目标**：基于商品与场景关键词裂变商品图。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid；契约字段 `cutoutProvider`、`imageName`、`imageOutputHeight`、`imageOutputWidth`、`imageUrl`、`mode`、`originImageUrl`、`outputNum`、`prompt`、`provider`、`ratio`、`sceneKeyword`、`segImageUrl`、`sizeType`、`strength`。
- **核心交互**：模式、场景词、强度、尺寸、Provider 能力与输出数量联动。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T18｜手持商品 `HANDHELD_GOODS`

- **归属/路由**：商品图设计；`/tools/product-design/handheld-goods`；原站关系。
- **用户目标**：生成模特手持商品图。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid；契约字段 `checkType`、`imageMaskUrl`、`imageResultUrl`、`imageUrl`、`modelId`、`modelTabType`、`outputNum`、`sceneTabType`、`targetMaskUrl`、`targetOriginUrl`、`targetResultUrl`。
- **核心交互**：模特/场景/商品类别选择，商品与目标区域双预览。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T19｜AI穿衣 `AI_DRESSING_V2`

- **归属/路由**：商品图设计；`/tools/product-design/ai-dressing-v2`；原站关系。
- **用户目标**：给模特替换上装、下装或套装。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid；契约字段 `coverList`、`downImageUrl`、`downMaskUrl`、`downOriginUrl`、`genOriRes`、`images`、`isSecondOperate`、`modelPose`、`modelPoseList`、`modelType`、`name`、`outputNum`、`provider`、`suitImageUrl`、`suitMaskUrl`、`suitOriginUrl`、`upperImageUrl`、`upperMaskUrl`、`upperOriginUrl`、`version`。
- **核心交互**：分步选择服装部位；原图/蒙版/结果状态可回溯。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T20｜姿势裂变 `AI_POSTURE`

- **归属/路由**：商品图设计；`/tools/product-design/ai-posture`；原站关系。
- **用户目标**：基于人物图生成姿势变体。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid；契约字段 `imageTags`、`imageUrl`、`outputNum`、`prompt`。
- **核心交互**：人物上传→姿势/标签→Prompt→多结果选择。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T21｜AI穿戴 `AI_WEARABLE`

- **归属/路由**：商品图设计；`/tools/product-design/ai-wearable`；原站关系。
- **用户目标**：把饰品或穿戴商品合成到模特。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid；契约字段 `checkType`、`imageMaskUrl`、`imageResultUrl`、`imageUrl`、`isSecondOperate`、`modelId`、`modelTabType`、`outputNum`、`productCategory`、`sceneTabType`、`targetMaskUrl`、`targetOriginUrl`、`targetResultUrl`。
- **核心交互**：穿戴部位、品类、模特与目标蒙版联动。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T22｜POD素材 `AI_TEXT`

- **归属/路由**：商品图设计；`/tools/product-design/ai-text`；原站关系。
- **用户目标**：生成 POD 图案和文字素材。
- **布局**：POD 工作区：左风格与素材、中央模板/平铺预览、右结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ImageResultGrid；契约字段 `aiSimpleTextPrompt`、`imageUrl`、`isCase`、`mode`、`outputNum`、`prompt`、`ratio`、`requestId`、`responseId`、`styles`、`stylesCn`、`tilingPreset`、`useAutopromptOption`、`variationStrength`。
- **核心交互**：模式/风格/平铺/自动Prompt/变化强度分组配置。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T23｜饰品文字 `ORNAMENT_TEXT`

- **归属/路由**：商品图设计；`/tools/product-design/ornament-text`；原站关系。
- **用户目标**：生成饰品文字效果。
- **布局**：文字工作区：左文字/字体参数、中央画布文本框、右预览。
- **输入/组件**：ToolPageHeader、PromptEditor、CapabilityNotice、TaskStatusPanel、PromptComposer、InteractiveCanvas / PropertyInspector；契约字段 `fontSize`、`fontname`、`left`、`prompt`、`right`。
- **核心交互**：文字内容、字体、字号和左右区域参数实时预览。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T24｜素材贴合 `SDS_DESIGN`

- **归属/路由**：商品图设计；`/tools/product-design/sds-design`；原站关系。
- **用户目标**：把素材贴合到商品表面。
- **布局**：POD 工作区：左风格与素材、中央模板/平铺预览、右结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `imageList`、`imageName`、`imageUrl`、`materialList`、`productId`。
- **核心交互**：商品与素材多选；贴合对象和输出预览一一对应。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T25｜印花提取 `PRINT_EXTRACT`

- **归属/路由**：商品图设计；`/tools/product-design/print-extract`；原站关系。
- **用户目标**：从图片提取印花图案。
- **布局**：提取工作区：左透明背景选项、中央原图、右提取结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel；契约字段 `imageUrl`、`isTransparent`。
- **核心交互**：透明背景开关与原图/提取结果对比。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T26｜AI姿势生成 `AI_POSE_GENERATOR`

- **归属/路由**：商品图设计；`/tools/product-design/ai-pose-generator`；补充关系（原站五类未直接给出）。
- **用户目标**：通过提示词与场景提示生成姿势参考。
- **布局**：模特工作区：左人物与场景、中央模特/姿势选择、右结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid；契约字段 `prompt`、`scenePrompts`。
- **核心交互**：场景 Prompt 列表与主 Prompt 分层编辑；补充工具标识。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T27｜AI试衣XSY `AI_DRESSING_XSY`

- **归属/路由**：商品图设计；`/tools/product-design/ai-dressing-xsy`；补充关系（原站五类未直接给出）。
- **用户目标**：使用 XSY 流程完成分步试衣。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid；契约字段 `downImageUrl`、`downMaskUrl`、`downOriginUrl`、`modelImageUrl`、`modelPose`、`modelStyle`、`modelType`、`outputNum`、`provider`、`step`、`suitImageUrl`、`suitMaskUrl`、`suitOriginUrl`、`upperImageUrl`、`upperMaskUrl`、`upperOriginUrl`、`version`。
- **核心交互**：步骤条、服装/模特输入、Provider 与版本能力检查；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T28｜场景裂变链接 `FISSION_LINK`

- **归属/路由**：商品图设计；`/tools/product-design/fission-link`；补充关系（原站五类未直接给出）。
- **用户目标**：从图片生成相似场景裂变结果。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `imageUrl`、`outputNum`。
- **核心交互**：单图输入和数量控制；与 PRODUCT_SCENE 区分，不混用契约。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- **归属/路由**：商品图设计；`/tools/product-design/image-text-edit`；补充关系（原站五类未直接给出）。
- **用户目标**：直接编辑图片中的文本框。
- **布局**：文字工作区：左文字/字体参数、中央画布文本框、右预览。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector；契约字段 `boxes`、`imageFormat`、`imageHeight`、`imageName`、`imageSize`、`imageUrl`、`imageWidth`、`resultImageUrl`。
- **核心交互**：画布文本框选择、内容编辑、尺寸保持和结果回写；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T30｜上装换料 `MATERIAL_UPPER_BODY`

- **归属/路由**：商品图设计；`/tools/product-design/material-upper-body`；补充关系（原站五类未直接给出）。
- **用户目标**：替换上装材质并保留版型。
- **布局**：试衣工作区：顶部分步条、左服装/模特输入、右试穿结果。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `categoryIds`、`categoryName`、`imageName`、`imageUrl`、`isMatting`、`outputNum`、`subType`。
- **核心交互**：上装与材质分类联动；抠图开关和数量配置；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T31｜商品图设计器 `NEW_DESIGNER`

- **归属/路由**：商品图设计；`/tools/product-design/new-designer`；补充关系（原站五类未直接给出）。
- **用户目标**：在宿主内打开完整设计器。
- **布局**：设计器宿主：顶部文档操作条、左素材/模板、中央画布、右属性。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、DesignerHost / DraftRecovery；契约字段 `designerId`、`imageUrl`、`isDesignerUse`、`onClose`、`onDone`、`open`。
- **核心交互**：设计器宿主、返回/完成回调、草稿恢复；不是普通生成表单。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- **归属/路由**：商品图设计；`/tools/product-design/product-market-material`；补充关系（原站五类未直接给出）。
- **用户目标**：生成 A+ 与营销场景素材。
- **布局**：多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid；契约字段 `APlusAspectRatio`、`aspectRatio`、`brandDNA`、`brandKey`、`brandName`、`coverList`、`images`、`isCustomAspectRatio`、`language`、`name`、`platform`、`provider`、`quality`、`resolution`、`salesRegion`。
- **核心交互**：平台、销售地区、品牌、A+比例与模板组合；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T33｜场景迁移 `SCENE_TRANSFER`

- **归属/路由**：商品图设计；`/tools/product-design/scene-transfer`；补充关系（原站五类未直接给出）。
- **用户目标**：把商品迁移到参考场景风格。
- **布局**：场景工作区：左商品/场景配置、中央场景模板、右结果网格。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid；契约字段 `imageStyleUrl`、`imageUrl`、`segImageUrl`、`similarity`。
- **核心交互**：商品图+风格参考图双输入，相似度连续调节；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T34｜图转视频 `IMAGE_TO_VIDEO`

- **归属/路由**：AI视频；`/tools/ai-video/image-to-video`；原站关系。
- **用户目标**：从图片和提示词生成视频。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer；契约字段 `aspectRatio`、`duration`、`extension`、`fileKey`、`fileName`、`imageInputMode`、`imageList`、`imageUrl`、`isPro`、`language`、`lastFrameImageUrl`、`productInfo`、`productUrl`、`prompt`、`promptOptimizer`、`referenceAudios`、`referenceDocument`、`referenceVideo`、`saleCountry`、`size`、`sourceImageUrl`、`templateKey`、`templateName`、`thumbUrl`、`url`、`videoTime`、`videoType`。
- **核心交互**：首帧/首尾帧、参考素材、时长/比例/清晰度/音频分步配置。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=true。

### REQ-T35｜带货口播 `SALE_VIDEO`

- **归属/路由**：AI视频；`/tools/ai-video/sale-video`；原站关系。
- **用户目标**：生成商品带货口播视频。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer；契约字段 `aspectRatio`、`hiddenPrompt`、`imageList`、`imageUrl`、`isPro`、`language`、`prompt`、`resolution`、`saleCountry`、`videoTime`、`videoType`、`visiblePrompt`。
- **核心交互**：商品信息、可见Prompt、隐藏Prompt、语言/地区与视频参数。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T36｜视频复刻 `VIDEO_REPLICATION`

- **归属/路由**：AI视频；`/tools/ai-video/video-replication`；原站关系。
- **用户目标**：分析参考视频并复刻结构和风格。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer；契约字段 `analyzeRedisKey`、`aspectRatio`、`clipEnd`、`clipMode`、`clipStart`、`coverUrl`、`duration`、`imageSegUrl`、`imageUrl`、`isPro`、`originalVideoId`、`originalVideoUrl`、`prompt`、`promptOptimizer`、`ratio`、`refImageList`、`refVideoName`、`refVideoUrl`、`resolution`、`saleCountry`、`sourceVideoDuration`、`sourceVideoUrl`、`targetLanguage`、`videoCoverType`、`videoSource`、`videoTime`、`videoType`。
- **核心交互**：视频上传→片段裁剪→分析→替换素材→目标语言与输出。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T37｜视频编辑 `AI_VIDEO_EDITING`

- **归属/路由**：AI视频；`/tools/ai-video/ai-video-editing`；原站关系。
- **用户目标**：用提示词编辑已有视频。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、VideoTimeline / VideoResultPlayer；契约字段 `duration`、`outputNum`、`prompt`、`refImageUrls`、`sourceVideoDuration`、`sourceVideoUrl`、`videoType`。
- **核心交互**：源视频、参考图、编辑Prompt、时长和视频类型联动。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T38｜视频翻译 `VIDEO_TRANSLATION`

- **归属/路由**：AI视频；`/tools/ai-video/video-translation`；原站关系。
- **用户目标**：翻译视频语音并可选口型同步。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer；契约字段 `lipSync`、`outputNum`、`sourceLanguage`、`sourceVideoName`、`sourceVideoUrl`、`targetLanguage`、`videoType`。
- **核心交互**：源/目标语言、口型同步能力检查、输出数量和播放器对比。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

### REQ-T39｜视频拼接 `VIDEO_CONCAT`

- **归属/路由**：AI视频；`/tools/ai-video/video-concat`；补充关系（原站五类未直接给出）。
- **用户目标**：拼接多个视频片段并设置封面。
- **布局**：视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态。
- **输入/组件**：ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer；契约字段 `editType`、`imageFormat`、`imageHeight`、`imageSize`、`imageUrl`、`imageWidth`、`videoCoverUrl`、`videoList`、`videoRatio`、`videoTime`。
- **核心交互**：时间线排序、片段裁剪、封面、比例与总时长；补充工具。
- **完成定义**：该页可从顶部和侧栏到达；空/上传/校验/运行/成功/失败/恢复状态完整；结果可保存；不支持能力明确阻断。批量引用=false。

## 8. 数据与指标

记录 toolId、提交成功率、P50/P95 耗时、取消率、失败原因、保存资产率、送画布率；不记录 Prompt 原文和私有图片到分析日志。

## 9. 发布门禁

39 工具逐页验收；至少每类一个真实生成链路及全部工具的请求契约测试；性能/无障碍/回归通过；未接能力不得显示可用。
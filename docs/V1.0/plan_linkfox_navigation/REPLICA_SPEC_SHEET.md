# REPLICA_SPEC SHEET｜39 工具逐页验收事实清单

> 自动生成，勿手改：`python3 docs/V1.0/plan_linkfox_navigation/tools/gen_replica_spec_sheet.py`

> 事实源：`page-specs/NN-*.md`（区域/控件/组件）、`tool_specs.json`（字段名即提交键）、`ui_brief.md §4`（布局数值）。

> 运行时断言脚本：`web/scripts/real-acceptance/tools-layout-check.mjs`（与本表同一套数值）。


## 0. 唯一布局规则（所有 39 页共同，不许各页自创）

| 项 | 值 | 断言 |
|---|---|---|
| 工具侧栏 | 184px（现 180 允许 ±4） | `[data-testid=tool-sidebar]` width 176–188 |
| 配置栏 | 320–360px；画布类（mask/outpaint/crop/designer）上限 420 | `[data-testid=tool-config-column]` width |
| 结果/编辑区 | `minmax(0,1fr)`，≥ 工作区宽度 55% | `[data-testid=tool-main-column]` width |
| 列间距 / 页面内边距 | 16px / 20px | 视觉 |
| 竖排 fallback | <1024px 单列，结果在下 | — |

**禁用文案（39 页正文均不得出现）**：算力、点/张、积分、免费领、立即购买、会员、免责声明、水印分组、促销、折、余额

**禁用视觉**：LinkFox 紫 `#723cf9`、渐变光斑、玻璃拟态、原站像素 className。一律用无限画布令牌（`bg-background`/`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border`/`bg-primary`/`bg-accent`/`text-destructive`）。

**控件尺寸**：控件高 36px、主按钮 40px、卡片圆角 10px、输入圆角 8px、最小点击区 40×40、正文 14/22。


## 1. 逐页清单

### T01｜商品套图 `PRODUCT_IMAGE_SUITE`

- 路由：`/tools/ecommerce-suite/product-image-suite`　layout：`suite`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品图上传与 AI 分析 ｜ 品牌与合规 ｜ 模型/品质 ｜ A+ 图设置 ｜ 主副图设置 ｜ 整组结果
- 必备控件（§2）：商品图支持本地上传、作品库、商品库；商品信息 0/2500，AI 分析/向导；品牌基因控制主色和字体风格，合规区选择敏感词库和替换词库；模型 LF G-2.5 Sunburst，1K/2K/4K，低至最大品质；A+ 单选高级/手机/普通/自定比例并设张数和排版；主副图多选卖点/白底/场景/特写/特写白底并分别设张数；比例 1:1、3:4、4:3、2:3、3:2。
- 组件（§6）：SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups
- 提交字段（字段名即提交键，禁改名）：imageUrl / outputNum
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/01-product-image-suite.md`

### T02｜服装套图 `DRESS_WEAR_SET`

- 路由：`/tools/ecommerce-suite/dress-wear-set`　layout：`suite`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：最多 5 张服装/配饰/细节图 ｜ 商品信息 ｜ 主副图 ｜ A+ 图 ｜ 套图结果
- 必备控件（§2）：主副图多选模特图、种草图、卖点图、尺码图、白底图，各自数量和排版独立；A+ 与商品套图相同；商品信息 0/2500；首步引导“上传服装配饰及细节图”。
- 组件（§6）：SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups
- 提交字段（字段名即提交键，禁改名）：aspectRatio / brandDNA / brandKey / brandName / coverList / imageUrl / images / language / name / needIntelligent / outputNum / platform / provider / quality / resolution / salesRegion
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/02-dress-wear-set.md`

### T03｜套图换色 `CHANGE_COLOR_V2`

- 路由：`/tools/ecommerce-suite/change-color-v2`　layout：`color`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：批量图片上传 ｜ 颜色选择 ｜ 换色部位 ｜ 品质 ｜ 整套结果
- 必备控件（§2）：颜色来源含商品图提色、历史使用颜色、参考图批量上传（最多25张）；本次方案显示参考图数；换色部位文本 0/50；常用部位全身/上装/下装/鞋面/鞋底/包身/包带/外壳/瓶身/表带；品质低/中/高。
- 组件（§6）：ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid
- 提交字段（字段名即提交键，禁改名）：imageName / imageUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/03-change-color-v2.md`

### T04｜批量翻译 `IMAGE_TRANSLATION`

- 路由：`/tools/ecommerce-suite/image-translation`　layout：`translate`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：批量图片上传 ｜ 原文语言 ｜ 目标语言分组多选 ｜ 翻译结果
- 必备控件（§2）：单图20M、384–4096px，单图文字500字以内；原文含中英等；目标按欧美/亚洲/南亚/中东/非洲分组，多选并显示已选数。
- 组件（§6）：BatchAssetUploader + LanguageTreeSelect + TranslationMatrix
- 提交字段（字段名即提交键，禁改名）：imageName / imageSegUrl / imageUrl / sourceLanguage / targetLanguage
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/04-image-translation.md`

### T05｜高清放大 `SCALE_UP`

- 路由：`/tools/ecommerce-suite/scale-up`　layout：`enhance`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：原图上传 ｜ 变高清模式 ｜ 面部美化 ｜ 前后对比 ｜ 历史
- 必备控件（§2）：模式：变高清、高清+2倍、高清+4倍、自定义；自定义时输出宽高可编辑；面部美化独立开关；上传区支持 jpg/jpeg/png/webp，最大4096×4096；中央原图/结果对比。
- 组件（§6）：EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare
- 提交字段（字段名即提交键，禁改名）：enhanceFace / enhanceQuality / imageName / imageOutputHeight / imageOutputWidth / imageUrl / magnification
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/05-scale-up.md`

### T06｜智能扩图 `AI_OUTPAINTING`

- 路由：`/tools/ecommerce-suite/ai-outpainting`　layout：`outpaint`　adapter：`None`　**画布类**
- 布局断言：配置栏 320–420px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：图片上传 ｜ 画布/比例扩展 ｜ 扩展预览 ｜ 生成数量 ｜ 结果网格
- 必备控件（§2）：默认尺寸与自定义比例/宽高；支持基于原图、扩展图、蒙版与 stageConfig 的画布编辑；输出1–4张；提示词用于扩展区域内容。
- 组件（§6）：OutpaintCanvas + AspectRatioControl + TransformHistory
- 提交字段（字段名即提交键，禁改名）：config / editFlag / height / imageConfig / imageExpandUrl / imageName / imageUrl / maskUrl / originImageUrl / outputNum / prompt / ratio / sizeSetHeight / sizeSetName / sizeSetType / sizeSetValue / sizeSetWidth / stageConfig / width
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/06-ai-outpainting.md`

### T07｜局部重绘 `AREA_REPAIR`

- 路由：`/tools/smart-edit/area-repair`　layout：`mask`　adapter：`None`　**画布类**
- 布局断言：配置栏 320–420px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：蒙版画布工具栏 ｜ 图片上传 ｜ 重绘描述 ｜ 数量 ｜ 结果
- 必备控件（§2）：画笔大小（像素）、自动扩大选择区域、反选、撤销、重做、重置；重绘描述必填0/600；输出1–4。
- 组件（§6）：MaskCanvas + BrushToolbar + UndoRedoController
- 提交字段（字段名即提交键，禁改名）：autoExpand / imageName / imageUrl / maskUrl / outputNum / prompt
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/07-area-repair.md`

### T08｜局部消除 `REMOVE_PEN`

- 路由：`/tools/smart-edit/remove-pen`　layout：`mask`　adapter：`None`　**画布类**
- 布局断言：配置栏 320–420px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：消除蒙版画布 ｜ 画笔与历史 ｜ 上传 ｜ 消除结果
- 必备控件（§2）：画笔大小、重置、撤销、重做、重新上传；无需提示词；结果可下载、高清放大或继续商品图/手部修复。
- 组件（§6）：MaskCanvas + BrushToolbar + UndoRedoController
- 提交字段（字段名即提交键，禁改名）：eraseImageUrl / imageName / imageUrl / maskImageUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/08-remove-pen.md`

### T09｜一键换色 `CHANGE_COLOR`

- 路由：`/tools/smart-edit/change-color`　layout：`color`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：图片上传 ｜ 颜色/参考图 ｜ 去杂色 ｜ 颜色细调 ｜ 光影与边缘 ｜ 结果
- 必备控件（§2）：收藏色卡、选择颜色或上传颜色参考图；去杂色开关；色调/饱和度/亮度/对比度滑杆与重置；光影优化、边缘优化、颜色边缘修复、色彩平衡、曲线。
- 组件（§6）：ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid
- 提交字段（字段名即提交键，禁改名）：adjustLight / colorParams / coverList / doInpaint / imageFormat / imageHeight / imageMaskUrl / imageName / imageSegUrl / imageSize / imageTagData / imageUrl / imageWidth / images / name / sourceImageUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/09-change-color.md`

### T10｜图片裁剪 `IMAGE_CROP`

- 路由：`/tools/smart-edit/image-crop`　layout：`crop`　adapter：`None`　**画布类**
- 布局断言：配置栏 320–420px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：裁剪画布与历史 ｜ 尺寸调整 ｜ 比例调整 ｜ 平台预设 ｜ 自定义尺寸
- 必备控件（§2）：自由裁剪；Amazon 1600²、Walmart 2000²、Etsy 2000²、Temu 1200²、Shopify 方/横/竖、SHEIN 1340×1785 等平台；目标宽/高和保存自定义尺寸；撤销/重做/重置/重新上传/下载。
- 组件（§6）：CropCanvas + PlatformPresetGrid + PixelSizeForm
- 提交字段（字段名即提交键，禁改名）：activeTab / contentUrl / imageCropUrl / imageFormat / imageHeight / imageSize / imageUrl / imageWidth / platform / platformTitle / ratio / selectedMode
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/10-image-crop.md`

### T11｜商品精修 `PRODUCT_REFINE`

- 路由：`/tools/smart-edit/product-refine`　layout：`enhance`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：精修案例对比 ｜ 商品上传 ｜ 精修模式 ｜ 自动尺寸规则 ｜ 结果
- 必备控件（§2）：整图精修/去背景精修；20M内；原图≤512放大4倍、513–1024放大2倍、>1024保持原尺寸；目标是轮廓、光泽、材质与颜色。
- 组件（§6）：EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare
- 提交字段（字段名即提交键，禁改名）：color / imageOutputLength / imageSegUrl / imageUrl / imgTransform / isRmBg / ratio / realImageUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/11-product-refine.md`

### T12｜色差修复 `FIX_COLOR`

- 路由：`/tools/smart-edit/fix-color`　layout：`repair`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：色差源图与商品参考 ｜ 色彩区域/版本 ｜ 校正结果
- 必备控件（§2）：原站真实菜单“色差修复”对应 `/draw/color-diff-repair`，不是 `/draw/fix-color`；载荷含 fixColorSegUrl、fixColorUrl、imageSegUrl、version。页面按上传原图、校正参考/区域、版本选择、结果对比组织。
- 组件（§6）：RepairStepper + LayerTransformCanvas + MaskCanvas
- 提交字段（字段名即提交键，禁改名）：fixColorSegUrl / fixColorUrl / imageName / imageResultUrl / imageSegUrl / imageUrl / version
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/12-fix-color.md`

### T13｜印花修复 `PRINTING_REPAIR`

- 路由：`/tools/smart-edit/printing-repair`　layout：`repair`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：Step1 消除错误印花 ｜ Step2 导入正确印花 ｜ Step3 位置调整画布 ｜ 结果
- 必备控件（§2）：两个上传分别20M内；第三步在画布调整印花位置、大小、旋转；载荷 point/rotate/scale/config/targetConfig。
- 组件（§6）：RepairStepper + LayerTransformCanvas + MaskCanvas
- 提交字段（字段名即提交键，禁改名）：config / height / imageResultUrl / imageUrl / point / rotate / scale / stampingFlowerSegUrl / stampingFlowerUrl / targetConfig / url / version / width
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/13-printing-repair.md`

### T14｜手部修复 `HAND_REPAIR`

- 路由：`/tools/smart-edit/hand-repair`　layout：`repair`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：手部蒙版画布 ｜ 人物类型 ｜ 生成数量 ｜ 结果
- 必备控件（§2）：画笔大小、重置、撤销、重做；成年男性/成年女性/男孩/女孩；1–4张；原站菜单标下架但路由仍显示工作区。
- 组件（§6）：RepairStepper + LayerTransformCanvas + MaskCanvas
- 提交字段（字段名即提交键，禁改名）：imageName / imageUrl / maskUrl / outputNum / personType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/14-hand-repair.md`

### T15｜商品图 `NEW_REPLACE_BG_V2`

- 路由：`/tools/product-design/new-replace-bg-v2`　layout：`scene`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：场景推荐/自定义背景 ｜ 商品层 ｜ 材质/锁定层 ｜ 合成画布 ｜ 结果
- 必备控件（§2）：chunk 状态含 canvasData、sizeData、imageRecords、bgLayerRef、goodsLayerRef、bgMaskLayerRef、bgEraseLayerRef、bgExtractLayerRef、lockCutoutModal、weight=.7、sceneType=Recommend。页面是图层合成工作台而非简单两上传表单。
- 组件（§6）：SceneLayerComposer + SimilarityControl + SceneVariantGrid
- 提交字段（字段名即提交键，禁改名）：—
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/15-new-replace-bg-v2.md`

### T16｜商品替换 `REPLACE_GOODS`

- 路由：`/tools/product-design/replace-goods`　layout：`replace`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：参考场景画布 ｜ 透视/扭曲工具 ｜ 商品与锁定区域 ｜ 场景变化程度 ｜ 结果
- 必备控件（§2）：工具快捷键透视T、扭曲N，Ctrl+拖动扭曲，左右键切画布；生成尺寸1024×1024；场景变化程度不变/高；4张；多商品批量替换。
- 组件（§6）：PerspectiveWarpCanvas + LayerLockPanel + SkuWorkspaceSwitcher
- 提交字段（字段名即提交键，禁改名）：config / cutoutProvider / denoiseStrength / height / imageName / imageOutputHeight / imageOutputWidth / imageUrl / lockImageUrl / maskUrl / outputNum / point / ratio / rotate / scale / sourceImageUrl / sourceOriginUrl / targetConfig / targetImageUrl / targetOriginUrl / url / width
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/16-replace-goods.md`

### T17｜场景裂变 `PRODUCT_SCENE`

- 路由：`/tools/product-design/product-scene`　layout：`scene`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品/场景参考上传 ｜ 背景相似度 ｜ 场景描述 ｜ 模型 ｜ 尺寸/数量 ｜ 结果
- 必备控件（§2）：背景相似度；智能模式自动场景；场景描述可选0/100；写实/简约/智能；默认/自定义尺寸；1–4张。
- 组件（§6）：SceneLayerComposer + SimilarityControl + SceneVariantGrid
- 提交字段（字段名即提交键，禁改名）：cutoutProvider / imageName / imageOutputHeight / imageOutputWidth / imageUrl / mode / originImageUrl / outputNum / prompt / provider / ratio / sceneKeyword / segImageUrl / sizeType / strength
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/17-product-scene.md`

### T18｜手持商品 `HANDHELD_GOODS`

- 路由：`/tools/product-design/handheld-goods`　layout：`model`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品图上传 ｜ 手持姿势库 ｜ 数量 ｜ 结果
- 必备控件（§2）：商品图10M、384–4096；姿势参考展示手持部位与姿势；1–4张；示例流程上传手持物品→选择参考图→结果。
- 组件（§6）：ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl
- 提交字段（字段名即提交键，禁改名）：checkType / imageMaskUrl / imageResultUrl / imageUrl / modelId / modelTabType / outputNum / sceneTabType / targetMaskUrl / targetOriginUrl / targetResultUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/18-handheld-goods.md`

### T19｜AI穿衣 `AI_DRESSING_V2`

- 路由：`/tools/product-design/ai-dressing-v2`　layout：`dress`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：上下装/连体衣 Tab ｜ 服装上传 ｜ 模特选择 ｜ 数量 ｜ 试穿结果
- 必备控件（§2）：上下装分别上传上装正面和下装正面；连体衣只上传套装；支持仅上/下装；10M；模特参考展示穿衣部位；批量穿衣入口。
- 组件（§6）：GarmentTabs + GarmentMaskUploader + ModelPosePicker
- 提交字段（字段名即提交键，禁改名）：coverList / downImageUrl / downMaskUrl / downOriginUrl / genOriRes / images / isSecondOperate / modelPose / modelPoseList / modelType / name / outputNum / provider / suitImageUrl / suitMaskUrl / suitOriginUrl / upperImageUrl / upperMaskUrl / upperOriginUrl / version
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/19-ai-dressing-v2.md`

### T20｜姿势裂变 `AI_POSTURE`

- 路由：`/tools/product-design/ai-posture`　layout：`model`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：模特姿势图上传 ｜ 姿势库/自定义 ｜ 姿势选择 ｜ 数量 ｜ 结果
- 必备控件（§2）：上传单张模特图；姿势库或自定义文本；姿势选择可选；1–4张；一张模特图生成N种姿势。
- 组件（§6）：ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl
- 提交字段（字段名即提交键，禁改名）：imageTags / imageUrl / outputNum / prompt
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/20-ai-posture.md`

### T21｜AI穿戴 `AI_WEARABLE`

- 路由：`/tools/product-design/ai-wearable`　layout：`dress`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：穿戴商品上传 ｜ 商品品类 ｜ 穿戴模特 ｜ 数量 ｜ 结果
- 必备控件（§2）：上传穿戴商品，建议用模特穿戴效果图；选择商品品类和穿戴模特；部位、角度与画面占比尽量相近；1–4张。
- 组件（§6）：GarmentTabs + GarmentMaskUploader + ModelPosePicker
- 提交字段（字段名即提交键，禁改名）：checkType / imageMaskUrl / imageResultUrl / imageUrl / isSecondOperate / modelId / modelTabType / outputNum / productCategory / sceneTabType / targetMaskUrl / targetOriginUrl / targetResultUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/21-ai-wearable.md`

### T22｜POD素材 `AI_TEXT`

- 路由：`/tools/product-design/ai-text`　layout：`pod`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：POD 素材输入 ｜ 风格/平铺 ｜ 提示词与变体 ｜ 结果
- 必备控件（§2）：当前账号访问 `/draw/ai-text` 重定向首页；依据字段组织 aiSimpleTextPrompt/prompt、styles/stylesCn、tilingPreset、mode、ratio、outputNum、variationStrength、useAutopromptOption；支持参考图与案例变体。
- 组件（§6）：PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas
- 提交字段（字段名即提交键，禁改名）：aiSimpleTextPrompt / imageUrl / isCase / mode / outputNum / prompt / ratio / requestId / responseId / styles / stylesCn / tilingPreset / useAutopromptOption / variationStrength
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/22-ai-text.md`

### T23｜饰品文字 `ORNAMENT_TEXT`

- 路由：`/tools/product-design/ornament-text`　layout：`text`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：饰品文字内容 ｜ 字体与字号 ｜ 左右定位 ｜ 效果预览 ｜ 结果
- 必备控件（§2）：当前账号 `/draw/ornament-text` 重定向首页；字段明确为 prompt、fontname、fontSize、left、right。界面以文字样式编辑和预览为主，不虚构材质库。
- 组件（§6）：TextLayerCanvas + FontPropertyPanel + TextBoxList
- 提交字段（字段名即提交键，禁改名）：fontSize / fontname / left / prompt / right
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/23-ornament-text.md`

### T24｜素材贴合 `SDS_DESIGN`

- 路由：`/tools/product-design/sds-design`　layout：`pod`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：素材上传 ｜ 产品选择 ｜ 颜色选择 ｜ 素材操作画布 ｜ 贴合结果
- 必备控件（§2）：上传素材；选择产品；选择颜色；素材操作用于位置/缩放/旋转；载荷 imageList/materialList/productId；20算力仅作证据不复制计费。
- 组件（§6）：PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas
- 提交字段（字段名即提交键，禁改名）：imageList / imageName / imageUrl / materialList / productId
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/24-sds-design.md`

### T25｜印花提取 `PRINT_EXTRACT`

- 路由：`/tools/product-design/print-extract`　layout：`extract`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品图上传 ｜ 透明图开关 ｜ 提取结果
- 必备控件（§2）：20M、384–4096、宽高比<5；支持批量；生成透明图开/关；目标是从商品中提取印花。
- 组件（§6）：ExtractUploader + TransparencySwitch + AssetResultGrid
- 提交字段（字段名即提交键，禁改名）：imageUrl / isTransparent
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/25-print-extract.md`

### T26｜AI姿势生成 `AI_POSE_GENERATOR`

- 路由：`/tools/product-design/ai-pose-generator`　layout：`model`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：姿势提示词 ｜ 场景提示词 ｜ 参考预览 ｜ 生成结果
- 必备控件（§2）：补充工具，依据字段 prompt 与 scenePrompts；与 AI_POSTURE 的“已有模特图姿势裂变”不同，本页从文字生成姿势参考。
- 组件（§6）：ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl
- 提交字段（字段名即提交键，禁改名）：prompt / scenePrompts
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/26-ai-pose-generator.md`

### T27｜AI试衣XSY `AI_DRESSING_XSY`

- 路由：`/tools/product-design/ai-dressing-xsy`　layout：`dress`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：模特图 ｜ 分步服装上传 ｜ 模特风格/姿势 ｜ 步骤状态 ｜ 结果
- 必备控件（§2）：字段含 modelImageUrl、step、modelStyle/modelPose/modelType、upper/down/suit 三组图片和 mask；是分步试衣流程，区别于 AI 穿衣的参考模特选择。
- 组件（§6）：GarmentTabs + GarmentMaskUploader + ModelPosePicker
- 提交字段（字段名即提交键，禁改名）：downImageUrl / downMaskUrl / downOriginUrl / modelImageUrl / modelPose / modelStyle / modelType / outputNum / provider / step / suitImageUrl / suitMaskUrl / suitOriginUrl / upperImageUrl / upperMaskUrl / upperOriginUrl / version
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/27-ai-dressing-xsy.md`

### T28｜场景裂变链接 `FISSION_LINK`

- 路由：`/tools/product-design/fission-link`　layout：`scene`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：参考图片/链接输入 ｜ 裂变数量 ｜ 场景变体结果
- 必备控件（§2）：补充工具，字段 imageUrl/outputNum；与 PRODUCT_SCENE 的场景描述/模型/相似度不同，本页只做基于单图链接的快速裂变。
- 组件（§6）：SceneLayerComposer + SimilarityControl + SceneVariantGrid
- 提交字段（字段名即提交键，禁改名）：imageUrl / outputNum
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/28-fission-link.md`

### T29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- 路由：`/tools/product-design/image-text-edit`　layout：`text`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：图片文字画布 ｜ 文本框列表 ｜ 属性编辑 ｜ 导出
- 必备控件（§2）：字段 boxes、图片尺寸/格式、resultImageUrl；每个 box 有位置、尺寸、文本和样式，中央画布与右侧属性联动。
- 组件（§6）：TextLayerCanvas + FontPropertyPanel + TextBoxList
- 提交字段（字段名即提交键，禁改名）：boxes / imageFormat / imageHeight / imageName / imageSize / imageUrl / imageWidth / resultImageUrl
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/29-image-text-edit.md`

### T30｜上装换料 `MATERIAL_UPPER_BODY`

- 路由：`/tools/product-design/material-upper-body`　layout：`dress`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：上装图片 ｜ 材质类目 ｜ 抠图开关 ｜ 数量 ｜ 换料结果
- 必备控件（§2）：字段 categoryIds/categoryName/subType/isMatting/outputNum；只处理上装材质，保留版型。
- 组件（§6）：GarmentTabs + GarmentMaskUploader + ModelPosePicker
- 提交字段（字段名即提交键，禁改名）：categoryIds / categoryName / imageName / imageUrl / isMatting / outputNum / subType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/30-material-upper-body.md`

### T31｜商品图设计器 `NEW_DESIGNER`

- 路由：`/tools/product-design/new-designer`　layout：`designer`　adapter：`None`　**画布类**
- 布局断言：配置栏 320–420px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：设计器宿主页 ｜ 素材/画布/图层 ｜ 属性面板 ｜ 完成回传
- 必备控件（§2）：字段 designerId/imageUrl/isDesignerUse/open/onClose/onDone；是完整设计器宿主而非生成表单。三栏：素材与图层、中央画布、右侧属性，顶部撤销/重做/预览/完成。
- 组件（§6）：DesignerHost + LayerPanel + CanvasPropertyPanel + DoneBridge
- 提交字段（字段名即提交键，禁改名）：designerId / imageUrl / isDesignerUse / onClose / onDone / open
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/31-new-designer.md`

### T32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- 路由：`/tools/product-design/product-market-material`　layout：`suite`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品多图与信息 ｜ 品牌/平台/语言 ｜ A+与营销画幅 ｜ 营销素材结果
- 必备控件（§2）：字段 APlusAspectRatio、aspectRatio、isCustomAspectRatio、platform、salesRegion、language、brandDNA、quality/resolution；与商品套图相比聚焦营销/A+，不设普通主副图组合。
- 组件（§6）：SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups
- 提交字段（字段名即提交键，禁改名）：APlusAspectRatio / aspectRatio / brandDNA / brandKey / brandName / coverList / images / isCustomAspectRatio / language / name / platform / provider / quality / resolution / salesRegion
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/32-product-market-material.md`

### T33｜场景迁移 `SCENE_TRANSFER`

- 路由：`/tools/product-design/scene-transfer`　layout：`scene`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品图 ｜ 场景风格参考图 ｜ 相似度 ｜ 迁移结果
- 必备控件（§2）：字段 imageStyleUrl、imageUrl、segImageUrl、similarity；核心是商品与风格双输入，区别于 PRODUCT_SCENE 的文字场景裂变。
- 组件（§6）：SceneLayerComposer + SimilarityControl + SceneVariantGrid
- 提交字段（字段名即提交键，禁改名）：imageStyleUrl / imageUrl / segImageUrl / similarity
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/33-scene-transfer.md`

### T34｜图转视频 `IMAGE_TO_VIDEO`

- 路由：`/tools/ai-video/image-to-video`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：参考素材/首尾帧/商品链接 ｜ 商品信息 ｜ 视频类型 ｜ 模型品质 ｜ 时长比例地区语言 ｜ 结果
- 必备控件（§2）：参考图最多9张；商品信息AI分析0/1600；视频类型必填，模板/自定义描述；产品展示、UGC种草、痛点解决、家居场景；MiniMax H3；768P/1080P；5/10/15秒；7种比例；销售国家与语言。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：aspectRatio / duration / extension / fileKey / fileName / imageInputMode / imageList / imageUrl / isPro / language / lastFrameImageUrl / productInfo / productUrl / prompt / promptOptimizer / referenceAudios / referenceDocument / referenceVideo / saleCountry / size / sourceImageUrl / templateKey / templateName / thumbUrl / url / videoTime / videoType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/34-image-to-video.md`

### T35｜带货口播 `SALE_VIDEO`

- 路由：`/tools/ai-video/sale-video`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：商品多图 ｜ 口播提示词 ｜ 国家语言/AI帮写 ｜ 模型分辨率 ｜ 时长比例 ｜ 结果
- 必备控件（§2）：最多9张商品图；提示词0/4000；美国/英语默认，AI帮写；Seedance 2.0 fast；480P/720P；5/10/15秒；7种比例。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：aspectRatio / hiddenPrompt / imageList / imageUrl / isPro / language / prompt / resolution / saleCountry / videoTime / videoType / visiblePrompt
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/35-sale-video.md`

### T36｜视频复刻 `VIDEO_REPLICATION`

- 路由：`/tools/ai-video/video-replication`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：TikTok链接/参考视频 ｜ 5–30秒截取 ｜ 商品参考图 ｜ AI脚本分析 ｜ 视频设置 ｜ 结果
- 必备控件（§2）：链接解析或MP4/MOV上传100M内；上传后截取5–30秒；商品参考最多6张；AI脚本分析选填默认自动；Seedance 2.0 fast；480/720P；Auto/5/10/15秒；比例/国家/语言。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：analyzeRedisKey / aspectRatio / clipEnd / clipMode / clipStart / coverUrl / duration / imageSegUrl / imageUrl / isPro / originalVideoId / originalVideoUrl / prompt / promptOptimizer / ratio / refImageList / refVideoName / refVideoUrl / resolution / saleCountry / sourceVideoDuration / sourceVideoUrl / targetLanguage / videoCoverType / videoSource / videoTime / videoType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/36-video-replication.md`

### T37｜视频编辑 `AI_VIDEO_EDITING`

- 路由：`/tools/ai-video/ai-video-editing`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：原视频与片段截取 ｜ 参考图 ｜ 编辑需求 ｜ 模型 ｜ 结果
- 必备控件（§2）：MP4/MOV100M，至少4秒，超长截取30秒内；参考图最多30张；编辑需求0/2500并可提示词优化；Seedance 2.5；是提示词视频编辑，不是多轨时间线。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：duration / outputNum / prompt / refImageUrls / sourceVideoDuration / sourceVideoUrl / videoType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/37-ai-video-editing.md`

### T38｜视频翻译 `VIDEO_TRANSLATION`

- 路由：`/tools/ai-video/video-translation`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：原视频 ｜ 高级模式 ｜ 目标语言 ｜ 口型同步 ｜ 翻译结果
- 必备控件（§2）：MP4/MOV100M，建议2–30秒且音频完整；智能识别源语言；高级模式；目标语言；口型同步默认开启；原视频/翻译结果对比。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：lipSync / outputNum / sourceLanguage / sourceVideoName / sourceVideoUrl / targetLanguage / videoType
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/38-video-translation.md`

### T39｜视频拼接 `VIDEO_CONCAT`

- 路由：`/tools/ai-video/video-concat`　layout：`video`　adapter：`None`
- 布局断言：配置栏 320–360px + 结果区 1fr（≥55%）
- 区域顺序（§1，必须按序保留，不得退化成「上传+提示词+结果」）：片段列表 ｜ 预览播放器 ｜ 排序/裁剪 ｜ 封面与比例 ｜ 导出
- 必备控件（§2）：字段 videoList/videoTime/videoRatio/videoCoverUrl/editType；与 AI_VIDEO_EDITING 明确区分：本页是片段编排和拼接。左侧片段列表，中央预览，下方顺序/时长，右侧封面比例导出。
- 组件（§6）：VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare
- 提交字段（字段名即提交键，禁改名）：editType / imageFormat / imageHeight / imageSize / imageUrl / imageWidth / videoCoverUrl / videoList / videoRatio / videoTime
- 事实源：`docs/V1.0/plan_linkfox_navigation/page-specs/39-video-concat.md`


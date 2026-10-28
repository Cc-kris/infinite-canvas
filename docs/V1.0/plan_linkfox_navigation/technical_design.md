> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、39 工具逐页 DOM/chunk 证据；逐页事实源为 `page-specs/`。日期更新：2026-10-28。

# 技术方案｜五类导航、39 工具与批量任务

节点评分：2。基线为真实 React + React Router + Zustand + localforage，不是 Next.js。仓库根无 `package.json`；命令工作目录为 `web/`。

## 1. 架构决策

采用单一 `ToolSpec` 注册表 + 共享 ToolShell + 17 种布局 + 每工具 adapter。39 个独立 URL，不建立 39 份复制页面；差异化由规格和专用编辑器实现。批量是编排层，不复制工具定义。

## 2. 路由与导航

```text
/tools/:category/:toolId       # 39 个 canonical 工具页
/tools/batch-generate         # 批量编排首页，不是工具 detail
/tools/batch-generate/:batchId # 批量任务详情
/tools/:category              # 301/导航重定向至该分类默认 canonical 工具
```
后续修改真实文件 `web/src/router.tsx`、`web/src/components/layout/app-top-nav.tsx`、`web/src/components/layout/mobile-nav-drawer.tsx`。非法 category/toolId 显示 404；canonical route 与菜单一致；Vercel 保持 SPA 回滚。

## 3. 核心类型

```ts
type ToolCategory = "ecommerce-suite"|"smart-edit"|"batch-generate"|"product-design"|"ai-video";
type ToolLayout = "suite"|"color"|"translate"|"enhance"|"outpaint"|"mask"|"crop"|"repair"|"scene"|"replace"|"model"|"dress"|"pod"|"text"|"extract"|"designer"|"video";
type ToolAdapter = "image"|"video"|"designer-host"; // batch-image 是编排策略，不是工具执行 adapter
interface FieldSpec { key:string; control:string; required:boolean; defaultValue?:unknown; enumSource?:"chunk"|"model-catalog"; providerRule?:string; }
interface ToolSpec { id:string; makeType:number; category:ToolCategory; origin:"original"|"supplemental"; fields:FieldSpec[]; layout:ToolLayout; adapter:ToolAdapter; enabled:boolean; }
type TaskState = "draft"|"queued"|"submitting"|"running"|"succeeded"|"failed"|"cancelled"|"unknown";
interface BatchTask { id:string; toolId:string; rows:Array<{id:string;input:unknown;taskId?:string;state:TaskState}>; concurrency:1|2|3|4|5; reportAssetId?:string; }
interface ToolDraft { draftVersion:1; toolId:string; values:unknown; assetIds:string[]; updatedAt:string; revision:number; }
interface ToolTask { id:string; clientOperationId:string; toolId:string; batchId?:string; state:TaskState; upstreamTaskId?:string; resultAssetIds:string[]; diagnosisId?:string; heartbeatAt:string; }
```

## 4. 组件与目录（新增/复用明确）

**新增**：`web/src/features/tools/registry/`（39 specs）、`web/src/components/tools/`（shell/sidebar/workspaces）、`web/src/services/api/tools/`（validation/gateway/tasks/batch）、`web/src/stores/use-tool-draft-store.ts`、`use-tool-task-store.ts`。当前仓库无 `features/`，不得描述成既有目录。

**复用/按需扩展**：`web/src/services/api/image.ts`、`video.ts`、`file-storage.ts`、`image-storage.ts`、`web/src/stores/use-asset-store.ts` 与模型配置。保存资产/送画布以这些真实导出为集成点，不虚构 `saveImage/saveVideo`。

## 5. 表单与请求契约

新增 `zod` 依赖，UI 字段与上游字段分别校验；`buildRequest` 显式映射、拒绝静默丢参。`fields_clean` 是抽取下限，不是完整动态表单证明；空字段、必填、默认值和动态枚举必须回查 chunk/模型目录，未核实则 `enabled=false`。隐藏 Prompt 分可见输入、模板变量、内部编排记录。

## 6. 任务、恢复与幂等

提交前生成 `clientOperationId=UUID`；本地 queued 与后端幂等键同源。响应保存 upstreamTaskId；轮询初始 2s，10 次后 5s，失败指数退避 2/4/8/16/30s；心跳 30s，连续 3 次无心跳标 `unknown` 并查询而非重提交；默认任务超时 30min，provider 更长须显式配置。草稿 500ms 防抖；未上线不迁移旧草稿，draftVersion 不符则提示并隔离；`BroadcastChannel` 选主标签写任务，revision 冲突提示；对象 URL 在替换/卸载 revoke。

## 7. Provider 能力

能力项：imageEdit、mask、referenceVideo、lipSync、multiReference、aspectRatio、duration、resolution、outputNum。缺失时禁用并解释，或让用户显式选择降级；不能丢参考视频/蒙版继续。批量调用同一工具 adapter，`IMAGE_TO_VIDEO` 即使可批量也走 video adapter。

## 8. 批量编排

`BatchTask` 保存 canonical toolId、行输入、映射、并发和子任务。预检全行→创建 batchId→默认并发 3（1–5 可配）→部分成功汇总→仅失败行重试。重复行用内容哈希提示，不自动去重。批量支持集合以 `tool_specs.json.batchReferences` 为准。

## 9. 安全与性能

不保存 LinkFox token，不调用原站鉴权。外部 URL 仅 HTTPS 且由自建后端按域名白名单取回，禁止内网/IP/重定向绕过，防 SSRF；签名 URL TTL 15min、到期前 5min 刷新，不作永久资产键。大文件显示上传进度/取消；长结果与批量表虚拟化；路由 lazy import；日志脱敏。

## 10. 39 个工具逐页技术设计

### TECH-T01｜商品套图 `PRODUCT_IMAGE_SUITE`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/product-image-suite`，layout=`suite`，adapter=`image`。
- 页面状态与组件：专用组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRODUCT_IMAGE_SUITE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：商品图支持本地上传、作品库、商品库；商品信息 0/2500，AI 分析/向导；品牌基因控制主色和字体风格，合规区选择敏感词库和替换词库；模型 LF G-2.5 Sunburst，1K/2K/4K，低至最大品质；A+ 单选高级/手机/普通/自定比例并设张数和排版；主副图多选卖点/白底/场景/特写/特写白底并分别设张数；比例 1:1、3:4、4:3、2:3、3:2。
- 状态机联动：切换 A+ 类型只改变 A+ 模块，不清空主副图多选；排版“每种排版生成一张/无文字模式”互斥；数量和排版共同重算预计产物；主副图与 A+ 可独立展开；修改品牌基因后新草稿标记 dirty，不能覆盖已生成结果。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageUrl, outputNum`；逐字段控件与校验见[页面规格](page-specs/01-product-image-suite.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T02｜服装套图 `DRESS_WEAR_SET`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/dress-wear-set`，layout=`suite`，adapter=`image`。
- 页面状态与组件：专用组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:DRESS_WEAR_SET`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：主副图多选模特图、种草图、卖点图、尺码图、白底图，各自数量和排版独立；A+ 与商品套图相同；商品信息 0/2500；首步引导“上传服装配饰及细节图”。
- 状态机联动：上传 1–5 张后形成有序参考列表，可删除/调序；主副图与 A+ 分别计数；模特图/种草图使用人物与场景约束，尺码图保留尺码文字；清除全部图片即禁用提交但保留其余配置。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`aspectRatio, brandDNA, brandKey, brandName, coverList, imageUrl, images, language, name, needIntelligent, outputNum, platform, provider, quality, resolution, salesRegion`；逐字段控件与校验见[页面规格](page-specs/02-dress-wear-set.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T03｜套图换色 `CHANGE_COLOR_V2`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/change-color-v2`，layout=`color`，adapter=`image`。
- 页面状态与组件：专用组件：`ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:CHANGE_COLOR_V2`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：颜色来源含商品图提色、历史使用颜色、参考图批量上传（最多25张）；本次方案显示参考图数；换色部位文本 0/50；常用部位全身/上装/下装/鞋面/鞋底/包身/包带/外壳/瓶身/表带；品质低/中/高。
- 状态机联动：参考图加入即生成独立颜色方案，删除参考图同步移除方案；点击常用部位写入部位字段但可继续编辑；整套图共享方案，单图可重跑；没有有效图片或颜色方案时禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageName, imageUrl`；逐字段控件与校验见[页面规格](page-specs/03-change-color-v2.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T04｜批量翻译 `IMAGE_TRANSLATION`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/image-translation`，layout=`translate`，adapter=`image`。
- 页面状态与组件：专用组件：`BatchAssetUploader + LanguageTreeSelect + TranslationMatrix`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:IMAGE_TRANSLATION`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：单图20M、384–4096px，单图文字500字以内；原文含中英等；目标按欧美/亚洲/南亚/中东/非洲分组，多选并显示已选数。
- 状态机联动：目标语言每增一个即增加一路输出，原图×语言矩阵展示进度；源语言与目标相同须提示；OCR/版式失败只失败对应单元，可编辑文本后重试；切换语言不清空已上传图片。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageName, imageSegUrl, imageUrl, sourceLanguage, targetLanguage`；逐字段控件与校验见[页面规格](page-specs/04-image-translation.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T05｜高清放大 `SCALE_UP`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/scale-up`，layout=`enhance`，adapter=`image`。
- 页面状态与组件：专用组件：`EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:SCALE_UP`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：模式：变高清、高清+2倍、高清+4倍、自定义；自定义时输出宽高可编辑；面部美化独立开关；上传区支持 jpg/jpeg/png/webp，最大4096×4096；中央原图/结果对比。
- 状态机联动：倍率切换实时重算输出尺寸与格式限制；自定义尺寸需保持合法比例；面部美化只影响人脸细节，不改变倍率；重上传保留模式但清除旧结果；生成中禁止替换源图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`enhanceFace, enhanceQuality, imageName, imageOutputHeight, imageOutputWidth, imageUrl, magnification`；逐字段控件与校验见[页面规格](page-specs/05-scale-up.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T06｜智能扩图 `AI_OUTPAINTING`

- 注册：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/ai-outpainting`，layout=`outpaint`，adapter=`image`。
- 页面状态与组件：专用组件：`OutpaintCanvas + AspectRatioControl + TransformHistory`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_OUTPAINTING`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：默认尺寸与自定义比例/宽高；支持基于原图、扩展图、蒙版与 stageConfig 的画布编辑；输出1–4张；提示词用于扩展区域内容。
- 状态机联动：改比例只调整外扩画布，不拉伸原图；拖动原图改变保留区域并更新 mask；恢复默认尺寸需清掉扩展变换；生成前必须确认扩展方向和最终尺寸。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`config, editFlag, height, imageConfig, imageExpandUrl, imageName, imageUrl, maskUrl, originImageUrl, outputNum, prompt, ratio, sizeSetHeight, sizeSetName, sizeSetType, sizeSetValue, sizeSetWidth, stageConfig, width`；逐字段控件与校验见[页面规格](page-specs/06-ai-outpainting.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T07｜局部重绘 `AREA_REPAIR`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/area-repair`，layout=`mask`，adapter=`image`。
- 页面状态与组件：专用组件：`MaskCanvas + BrushToolbar + UndoRedoController`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AREA_REPAIR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：画笔大小（像素）、自动扩大选择区域、反选、撤销、重做、重置；重绘描述必填0/600；输出1–4。
- 状态机联动：涂抹生成 maskUrl，反选只反转蒙版；自动扩边改变最终 mask 范围；撤销/重做只影响笔画；图片替换清空蒙版；描述为空或蒙版为空禁用提交。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`autoExpand, imageName, imageUrl, maskUrl, outputNum, prompt`；逐字段控件与校验见[页面规格](page-specs/07-area-repair.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T08｜局部消除 `REMOVE_PEN`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/remove-pen`，layout=`mask`，adapter=`image`。
- 页面状态与组件：专用组件：`MaskCanvas + BrushToolbar + UndoRedoController`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:REMOVE_PEN`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：画笔大小、重置、撤销、重做、重新上传；无需提示词；结果可下载、高清放大或继续商品图/手部修复。
- 状态机联动：涂抹与擦除更新 maskImageUrl；重上传清空笔画；结果页“高清放大”把当前结果作为新工具输入；消除失败保留原图和蒙版供重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`eraseImageUrl, imageName, imageUrl, maskImageUrl`；逐字段控件与校验见[页面规格](page-specs/08-remove-pen.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T09｜一键换色 `CHANGE_COLOR`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/change-color`，layout=`color`，adapter=`image`。
- 页面状态与组件：专用组件：`ColorReferencePicker + RegionPresetInput + AdjustmentSliderGroup + VariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:CHANGE_COLOR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：收藏色卡、选择颜色或上传颜色参考图；去杂色开关；色调/饱和度/亮度/对比度滑杆与重置；光影优化、边缘优化、颜色边缘修复、色彩平衡、曲线。
- 状态机联动：颜色参考图提取色卡；细调参数实时更新预览，不直接修改原图；重置仅重置当前组；换色与高级调色合并为一次提交快照；生成期间锁定参数防错配。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`adjustLight, colorParams, coverList, doInpaint, imageFormat, imageHeight, imageMaskUrl, imageName, imageSegUrl, imageSize, imageTagData, imageUrl, imageWidth, images, name, sourceImageUrl`；逐字段控件与校验见[页面规格](page-specs/09-change-color.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T10｜图片裁剪 `IMAGE_CROP`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/image-crop`，layout=`crop`，adapter=`image`。
- 页面状态与组件：专用组件：`CropCanvas + PlatformPresetGrid + PixelSizeForm`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:IMAGE_CROP`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：自由裁剪；Amazon 1600²、Walmart 2000²、Etsy 2000²、Temu 1200²、Shopify 方/横/竖、SHEIN 1340×1785 等平台；目标宽/高和保存自定义尺寸；撤销/重做/重置/重新上传/下载。
- 状态机联动：选择平台同时写入平台、比例和像素尺寸；手动拖框切为自由裁剪但不删除预设；锁定比例时拖角保持比例；换图重置画布变换；下载使用当前裁剪结果。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`activeTab, contentUrl, imageCropUrl, imageFormat, imageHeight, imageSize, imageUrl, imageWidth, platform, platformTitle, ratio, selectedMode`；逐字段控件与校验见[页面规格](page-specs/10-image-crop.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T11｜商品精修 `PRODUCT_REFINE`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/product-refine`，layout=`enhance`，adapter=`image`。
- 页面状态与组件：专用组件：`EnhanceModeRadio + OutputSizeCalculator + BeforeAfterCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRODUCT_REFINE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：整图精修/去背景精修；20M内；原图≤512放大4倍、513–1024放大2倍、>1024保持原尺寸；目标是轮廓、光泽、材质与颜色。
- 状态机联动：切去背景精修额外产生透明/分段结果并改变输出规则；上传后显示预计输出尺寸；替换图片清掉旧精修结果；失败可保留模式重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`color, imageOutputLength, imageSegUrl, imageUrl, imgTransform, isRmBg, ratio, realImageUrl`；逐字段控件与校验见[页面规格](page-specs/11-product-refine.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T12｜色差修复 `FIX_COLOR`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/fix-color`，layout=`repair`，adapter=`image`。
- 页面状态与组件：专用组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:FIX_COLOR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：原站真实菜单“色差修复”对应 `/draw/color-diff-repair`，不是 `/draw/fix-color`；载荷含 fixColorSegUrl、fixColorUrl、imageSegUrl、version。页面按上传原图、校正参考/区域、版本选择、结果对比组织。
- 状态机联动：区域分段变化只更新待修复 mask；版本切换重算预览并保留上一版；原图与校正参考缺一不可；失败保留原图、分段与版本。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`fixColorSegUrl, fixColorUrl, imageName, imageResultUrl, imageSegUrl, imageUrl, version`；逐字段控件与校验见[页面规格](page-specs/12-fix-color.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T13｜印花修复 `PRINTING_REPAIR`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/printing-repair`，layout=`repair`，adapter=`image`。
- 页面状态与组件：专用组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRINTING_REPAIR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：两个上传分别20M内；第三步在画布调整印花位置、大小、旋转；载荷 point/rotate/scale/config/targetConfig。
- 状态机联动：只有完成前两步才开放位置画布；移动/缩放/旋转只改正确印花层；重新上传错误图清空全部步骤；重新上传正确印花保留原图但重置变换。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`config, height, imageResultUrl, imageUrl, point, rotate, scale, stampingFlowerSegUrl, stampingFlowerUrl, targetConfig, url, version, width`；逐字段控件与校验见[页面规格](page-specs/13-printing-repair.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T14｜手部修复 `HAND_REPAIR`

- 注册：category=`smart-edit`，route=`/tools/smart-edit/hand-repair`，layout=`repair`，adapter=`image`。
- 页面状态与组件：专用组件：`RepairStepper + LayerTransformCanvas + MaskCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:HAND_REPAIR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：画笔大小、重置、撤销、重做；成年男性/成年女性/男孩/女孩；1–4张；原站菜单标下架但路由仍显示工作区。
- 状态机联动：人物类型作为结构约束随任务快照保存；换图清蒙版；无蒙版不能生成；页面展示“原站已下架”证据标签，但本项目仍按独立工具实现。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageName, imageUrl, maskUrl, outputNum, personType`；逐字段控件与校验见[页面规格](page-specs/14-hand-repair.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T15｜商品图 `NEW_REPLACE_BG_V2`

- 注册：category=`product-design`，route=`/tools/product-design/new-replace-bg-v2`，layout=`scene`，adapter=`image`。
- 页面状态与组件：专用组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:NEW_REPLACE_BG_V2`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| 无独立 make 字段 | 使用页面合成状态 | 由场景画布状态序列化 |
- 独有控件：chunk 状态含 canvasData、sizeData、imageRecords、bgLayerRef、goodsLayerRef、bgMaskLayerRef、bgEraseLayerRef、bgExtractLayerRef、lockCutoutModal、weight=.7、sceneType=Recommend。页面是图层合成工作台而非简单两上传表单。
- 状态机联动：背景/商品/材质/锁定层独立选择和抠图；拖动商品只更新 goods 层 point/scale/rotate；背景强度 weight 与场景类型进入任务快照；锁定层保护不应重绘区域；重置可分层撤销。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`scene composer state`；逐字段控件与校验见[页面规格](page-specs/15-new-replace-bg-v2.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T16｜商品替换 `REPLACE_GOODS`

- 注册：category=`product-design`，route=`/tools/product-design/replace-goods`，layout=`replace`，adapter=`image`。
- 页面状态与组件：专用组件：`PerspectiveWarpCanvas + LayerLockPanel + SkuWorkspaceSwitcher`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:REPLACE_GOODS`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：工具快捷键透视T、扭曲N，Ctrl+拖动扭曲，左右键切画布；生成尺寸1024×1024；场景变化程度不变/高；4张；多商品批量替换。
- 状态机联动：透视/扭曲改变 targetConfig 而非简单缩放；锁定图/蒙版保护原场景；变化程度控制背景重绘；切画布保留各SKU独立配置；未完成商品定位禁用提交。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`config, cutoutProvider, denoiseStrength, height, imageName, imageOutputHeight, imageOutputWidth, imageUrl, lockImageUrl, maskUrl, outputNum, point, ratio, rotate, scale, sourceImageUrl, sourceOriginUrl, targetConfig, targetImageUrl, targetOriginUrl, url, width`；逐字段控件与校验见[页面规格](page-specs/16-replace-goods.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T17｜场景裂变 `PRODUCT_SCENE`

- 注册：category=`product-design`，route=`/tools/product-design/product-scene`，layout=`scene`，adapter=`image`。
- 页面状态与组件：专用组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRODUCT_SCENE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：背景相似度；智能模式自动场景；场景描述可选0/100；写实/简约/智能；默认/自定义尺寸；1–4张。
- 状态机联动：智能模式隐藏或弱化相似度手调并显示解释；描述与模型共同进入草稿；自定义尺寸展开宽高；改变参考图清结果但保留描述；批量多图可转套图流程。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`cutoutProvider, imageName, imageOutputHeight, imageOutputWidth, imageUrl, mode, originImageUrl, outputNum, prompt, provider, ratio, sceneKeyword, segImageUrl, sizeType, strength`；逐字段控件与校验见[页面规格](page-specs/17-product-scene.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T18｜手持商品 `HANDHELD_GOODS`

- 注册：category=`product-design`，route=`/tools/product-design/handheld-goods`，layout=`model`，adapter=`image`。
- 页面状态与组件：专用组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:HANDHELD_GOODS`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：商品图10M、384–4096；姿势参考展示手持部位与姿势；1–4张；示例流程上传手持物品→选择参考图→结果。
- 状态机联动：姿势卡选择更新 modelId/modelTabType/sceneTabType；换姿势不重新上传商品；商品与姿势缺一不可；批量商品各自保留姿势快照。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`checkType, imageMaskUrl, imageResultUrl, imageUrl, modelId, modelTabType, outputNum, sceneTabType, targetMaskUrl, targetOriginUrl, targetResultUrl`；逐字段控件与校验见[页面规格](page-specs/18-handheld-goods.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T19｜AI穿衣 `AI_DRESSING_V2`

- 注册：category=`product-design`，route=`/tools/product-design/ai-dressing-v2`，layout=`dress`，adapter=`image`。
- 页面状态与组件：专用组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_DRESSING_V2`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：上下装分别上传上装正面和下装正面；连体衣只上传套装；支持仅上/下装；10M；模特参考展示穿衣部位；批量穿衣入口。
- 状态机联动：Tab 切换清理不适用服装字段但保留另一 Tab 草稿；模特与服装独立选择；生成任务固化 modelPose/modelType 和 garment masks；缺失当前 Tab 必填服装时禁用。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`coverList, downImageUrl, downMaskUrl, downOriginUrl, genOriRes, images, isSecondOperate, modelPose, modelPoseList, modelType, name, outputNum, provider, suitImageUrl, suitMaskUrl, suitOriginUrl, upperImageUrl, upperMaskUrl, upperOriginUrl, version`；逐字段控件与校验见[页面规格](page-specs/19-ai-dressing-v2.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T20｜姿势裂变 `AI_POSTURE`

- 注册：category=`product-design`，route=`/tools/product-design/ai-posture`，layout=`model`，adapter=`image`。
- 页面状态与组件：专用组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_POSTURE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：上传单张模特图；姿势库或自定义文本；姿势选择可选；1–4张；一张模特图生成N种姿势。
- 状态机联动：选择姿势库卡片写入结构化姿势，自定义切为文本 prompt；二者切换不互相覆盖草稿；未选姿势可自动裂变；结果按来源姿势分组。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageTags, imageUrl, outputNum, prompt`；逐字段控件与校验见[页面规格](page-specs/20-ai-posture.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T21｜AI穿戴 `AI_WEARABLE`

- 注册：category=`product-design`，route=`/tools/product-design/ai-wearable`，layout=`dress`，adapter=`image`。
- 页面状态与组件：专用组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_WEARABLE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：上传穿戴商品，建议用模特穿戴效果图；选择商品品类和穿戴模特；部位、角度与画面占比尽量相近；1–4张。
- 状态机联动：品类改变可选穿戴部位和模特过滤；换模特不重新上传商品；商品/品类/模特全部必需；结果可回到原选择做单件重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`checkType, imageMaskUrl, imageResultUrl, imageUrl, isSecondOperate, modelId, modelTabType, outputNum, productCategory, sceneTabType, targetMaskUrl, targetOriginUrl, targetResultUrl`；逐字段控件与校验见[页面规格](page-specs/21-ai-wearable.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T22｜POD素材 `AI_TEXT`

- 注册：category=`product-design`，route=`/tools/product-design/ai-text`，layout=`pod`，adapter=`image`。
- 页面状态与组件：专用组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_TEXT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：当前账号访问 `/draw/ai-text` 重定向首页；依据字段组织 aiSimpleTextPrompt/prompt、styles/stylesCn、tilingPreset、mode、ratio、outputNum、variationStrength、useAutopromptOption；支持参考图与案例变体。
- 状态机联动：简易文字与完整提示词模式互斥编辑；自动提示词开启时显示生成预览且可解锁手改；平铺预设改变图案重复规则；案例变体继承样式但新建任务。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`aiSimpleTextPrompt, imageUrl, isCase, mode, outputNum, prompt, ratio, requestId, responseId, styles, stylesCn, tilingPreset, useAutopromptOption, variationStrength`；逐字段控件与校验见[页面规格](page-specs/22-ai-text.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T23｜饰品文字 `ORNAMENT_TEXT`

- 注册：category=`product-design`，route=`/tools/product-design/ornament-text`，layout=`text`，adapter=`image`。
- 页面状态与组件：专用组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:ORNAMENT_TEXT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：当前账号 `/draw/ornament-text` 重定向首页；字段明确为 prompt、fontname、fontSize、left、right。界面以文字样式编辑和预览为主，不虚构材质库。
- 状态机联动：字体/字号变化实时更新文字层；left/right 控制文字在饰品上的相对位置；修改文字只更新预览，生成后保存参数快照。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`fontSize, fontname, left, prompt, right`；逐字段控件与校验见[页面规格](page-specs/23-ornament-text.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T24｜素材贴合 `SDS_DESIGN`

- 注册：category=`product-design`，route=`/tools/product-design/sds-design`，layout=`pod`，adapter=`image`。
- 页面状态与组件：专用组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:SDS_DESIGN`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：上传素材；选择产品；选择颜色；素材操作用于位置/缩放/旋转；载荷 imageList/materialList/productId；20算力仅作证据不复制计费。
- 状态机联动：产品改变替换承载模型/产品图层并重新计算可贴区域；颜色只改产品颜色；素材变换不影响产品层；缺素材或产品时禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageList, imageName, imageUrl, materialList, productId`；逐字段控件与校验见[页面规格](page-specs/24-sds-design.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T25｜印花提取 `PRINT_EXTRACT`

- 注册：category=`product-design`，route=`/tools/product-design/print-extract`，layout=`extract`，adapter=`image`。
- 页面状态与组件：专用组件：`ExtractUploader + TransparencySwitch + AssetResultGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRINT_EXTRACT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：20M、384–4096、宽高比<5；支持批量；生成透明图开/关；目标是从商品中提取印花。
- 状态机联动：透明开关决定背景移除和输出格式；批量时每张独立状态；换图清结果；提取不完整可回到原图重试，不自动生成假蒙版。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageUrl, isTransparent`；逐字段控件与校验见[页面规格](page-specs/25-print-extract.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T26｜AI姿势生成 `AI_POSE_GENERATOR`

- 注册：category=`product-design`，route=`/tools/product-design/ai-pose-generator`，layout=`model`，adapter=`image`。
- 页面状态与组件：专用组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_POSE_GENERATOR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：补充工具，依据字段 prompt 与 scenePrompts；与 AI_POSTURE 的“已有模特图姿势裂变”不同，本页从文字生成姿势参考。
- 状态机联动：姿势描述与场景描述分栏，场景不能覆盖姿势约束；可保存姿势预设；修改任一描述只更新草稿；无姿势描述禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`prompt, scenePrompts`；逐字段控件与校验见[页面规格](page-specs/26-ai-pose-generator.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T27｜AI试衣XSY `AI_DRESSING_XSY`

- 注册：category=`product-design`，route=`/tools/product-design/ai-dressing-xsy`，layout=`dress`，adapter=`image`。
- 页面状态与组件：专用组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_DRESSING_XSY`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段含 modelImageUrl、step、modelStyle/modelPose/modelType、upper/down/suit 三组图片和 mask；是分步试衣流程，区别于 AI 穿衣的参考模特选择。
- 状态机联动：step 驱动“模特→服装→蒙版/姿势→生成”；回退上一步保留下游草稿但标为需重确认；切换上下装/套装清理冲突字段；每步显示完成状态。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`downImageUrl, downMaskUrl, downOriginUrl, modelImageUrl, modelPose, modelStyle, modelType, outputNum, provider, step, suitImageUrl, suitMaskUrl, suitOriginUrl, upperImageUrl, upperMaskUrl, upperOriginUrl, version`；逐字段控件与校验见[页面规格](page-specs/27-ai-dressing-xsy.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T28｜场景裂变链接 `FISSION_LINK`

- 注册：category=`product-design`，route=`/tools/product-design/fission-link`，layout=`scene`，adapter=`image`。
- 页面状态与组件：专用组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:FISSION_LINK`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：补充工具，字段 imageUrl/outputNum；与 PRODUCT_SCENE 的场景描述/模型/相似度不同，本页只做基于单图链接的快速裂变。
- 状态机联动：合法图片 URL 加载预览后才可提交；数量决定变体组；链接变化作废旧预览和结果；失败保留链接便于修正。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageUrl, outputNum`；逐字段控件与校验见[页面规格](page-specs/28-fission-link.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- 注册：category=`product-design`，route=`/tools/product-design/image-text-edit`，layout=`text`，adapter=`image`。
- 页面状态与组件：专用组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:IMAGE_TEXT_EDIT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 boxes、图片尺寸/格式、resultImageUrl；每个 box 有位置、尺寸、文本和样式，中央画布与右侧属性联动。
- 状态机联动：选画布文字框同步选右侧条目；编辑内容/字体/位置实时改 boxes；删除可撤销；导出前检查溢出和缺字；原图永不被覆盖。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`boxes, imageFormat, imageHeight, imageName, imageSize, imageUrl, imageWidth, resultImageUrl`；逐字段控件与校验见[页面规格](page-specs/29-image-text-edit.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T30｜上装换料 `MATERIAL_UPPER_BODY`

- 注册：category=`product-design`，route=`/tools/product-design/material-upper-body`，layout=`dress`，adapter=`image`。
- 页面状态与组件：专用组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:MATERIAL_UPPER_BODY`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 categoryIds/categoryName/subType/isMatting/outputNum；只处理上装材质，保留版型。
- 状态机联动：类目选择联动子类；isMatting 开启时先预览上装蒙版；换图清类目相关结果但可保留材质；缺材质类目禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`categoryIds, categoryName, imageName, imageUrl, isMatting, outputNum, subType`；逐字段控件与校验见[页面规格](page-specs/30-material-upper-body.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T31｜商品图设计器 `NEW_DESIGNER`

- 注册：category=`product-design`，route=`/tools/product-design/new-designer`，layout=`designer`，adapter=`designer-host`。
- 页面状态与组件：专用组件：`DesignerHost + LayerPanel + CanvasPropertyPanel + DoneBridge`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:NEW_DESIGNER`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 designerId/imageUrl/isDesignerUse/open/onClose/onDone；是完整设计器宿主而非生成表单。三栏：素材与图层、中央画布、右侧属性，顶部撤销/重做/预览/完成。
- 状态机联动：open 控制宿主；onDone 将设计结果保存为资产并返回来源工具；onClose 有未保存确认；designerId 恢复草稿；从图片进入时作为可编辑底图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`designerId, imageUrl, isDesignerUse, onClose, onDone, open`；逐字段控件与校验见[页面规格](page-specs/31-new-designer.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- 注册：category=`product-design`，route=`/tools/product-design/product-market-material`，layout=`suite`，adapter=`image`。
- 页面状态与组件：专用组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRODUCT_MARKET_MATERIAL`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 APlusAspectRatio、aspectRatio、isCustomAspectRatio、platform、salesRegion、language、brandDNA、quality/resolution；与商品套图相比聚焦营销/A+，不设普通主副图组合。
- 状态机联动：平台切换过滤合法 A+ 比例；自定义比例展开尺寸；品牌DNA控制字体主色；语言与销售地区随任务快照；输出按营销模块分组。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`APlusAspectRatio, aspectRatio, brandDNA, brandKey, brandName, coverList, images, isCustomAspectRatio, language, name, platform, provider, quality, resolution, salesRegion`；逐字段控件与校验见[页面规格](page-specs/32-product-market-material.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T33｜场景迁移 `SCENE_TRANSFER`

- 注册：category=`product-design`，route=`/tools/product-design/scene-transfer`，layout=`scene`，adapter=`image`。
- 页面状态与组件：专用组件：`SceneLayerComposer + SimilarityControl + SceneVariantGrid`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:SCENE_TRANSFER`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 imageStyleUrl、imageUrl、segImageUrl、similarity；核心是商品与风格双输入，区别于 PRODUCT_SCENE 的文字场景裂变。
- 状态机联动：风格参考加载后显示预览；相似度只影响场景风格保留程度；商品分段可预览重算；任一图缺失禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`imageStyleUrl, imageUrl, segImageUrl, similarity`；逐字段控件与校验见[页面规格](page-specs/33-scene-transfer.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T34｜图转视频 `IMAGE_TO_VIDEO`

- 注册：category=`ai-video`，route=`/tools/ai-video/image-to-video`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:IMAGE_TO_VIDEO`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：参考图最多9张；商品信息AI分析0/1600；视频类型必填，模板/自定义描述；产品展示、UGC种草、痛点解决、家居场景；MiniMax H3；768P/1080P；5/10/15秒；7种比例；销售国家与语言。
- 状态机联动：素材模式切换保留各模式草稿但只提交当前模式；首尾帧开放首帧/尾帧上传；视频类型改变模板和提示词；国家联动默认语言；时长/分辨率/比例进入同一任务快照；生成中不可改源配置。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`aspectRatio, duration, extension, fileKey, fileName, imageInputMode, imageList, imageUrl, isPro, language, lastFrameImageUrl, productInfo, productUrl, prompt, promptOptimizer, referenceAudios, referenceDocument, referenceVideo, saleCountry, size, sourceImageUrl, templateKey, templateName, thumbUrl, url, videoTime, videoType`；逐字段控件与校验见[页面规格](page-specs/34-image-to-video.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T35｜带货口播 `SALE_VIDEO`

- 注册：category=`ai-video`，route=`/tools/ai-video/sale-video`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:SALE_VIDEO`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：最多9张商品图；提示词0/4000；美国/英语默认，AI帮写；Seedance 2.0 fast；480P/720P；5/10/15秒；7种比例。
- 状态机联动：AI帮写只替换提示词草稿并可撤销；国家切换联动语言；图片/提示词/模型变化标记结果过期；口播不是数字人时间线，不虚构额外编辑器。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`aspectRatio, hiddenPrompt, imageList, imageUrl, isPro, language, prompt, resolution, saleCountry, videoTime, videoType, visiblePrompt`；逐字段控件与校验见[页面规格](page-specs/35-sale-video.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T36｜视频复刻 `VIDEO_REPLICATION`

- 注册：category=`ai-video`，route=`/tools/ai-video/video-replication`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:VIDEO_REPLICATION`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：链接解析或MP4/MOV上传100M内；上传后截取5–30秒；商品参考最多6张；AI脚本分析选填默认自动；Seedance 2.0 fast；480/720P；Auto/5/10/15秒；比例/国家/语言。
- 状态机联动：链接与上传互斥；视频解析成功才开放截取和脚本分析；截取更新 clipStart/clipEnd/duration；Auto时长跟随参考片段；替换参考视频清脚本和截取，但保留商品图。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`analyzeRedisKey, aspectRatio, clipEnd, clipMode, clipStart, coverUrl, duration, imageSegUrl, imageUrl, isPro, originalVideoId, originalVideoUrl, prompt, promptOptimizer, ratio, refImageList, refVideoName, refVideoUrl, resolution, saleCountry, sourceVideoDuration, sourceVideoUrl, targetLanguage, videoCoverType, videoSource, videoTime, videoType`；逐字段控件与校验见[页面规格](page-specs/36-video-replication.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T37｜视频编辑 `AI_VIDEO_EDITING`

- 注册：category=`ai-video`，route=`/tools/ai-video/ai-video-editing`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_VIDEO_EDITING`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：MP4/MOV100M，至少4秒，超长截取30秒内；参考图最多30张；编辑需求0/2500并可提示词优化；Seedance 2.5；是提示词视频编辑，不是多轨时间线。
- 状态机联动：视频上传后开放片段截取；参考图可排序删除；提示词优化可撤销；换源视频清截取和结果；编辑失败保留源视频/参考图/描述。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`duration, outputNum, prompt, refImageUrls, sourceVideoDuration, sourceVideoUrl, videoType`；逐字段控件与校验见[页面规格](page-specs/37-ai-video-editing.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T38｜视频翻译 `VIDEO_TRANSLATION`

- 注册：category=`ai-video`，route=`/tools/ai-video/video-translation`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:VIDEO_TRANSLATION`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：MP4/MOV100M，建议2–30秒且音频完整；智能识别源语言；高级模式；目标语言；口型同步默认开启；原视频/翻译结果对比。
- 状态机联动：目标语言改变只更新翻译配置；口型同步关闭时保留配音翻译但不做嘴形重绘；视频无效/无音轨给具体错误；失败保留语言配置可重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`lipSync, outputNum, sourceLanguage, sourceVideoName, sourceVideoUrl, targetLanguage, videoType`；逐字段控件与校验见[页面规格](page-specs/38-video-translation.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。
### TECH-T39｜视频拼接 `VIDEO_CONCAT`

- 注册：category=`ai-video`，route=`/tools/ai-video/video-concat`，layout=`video`，adapter=`video`。
- 页面状态与组件：专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:VIDEO_CONCAT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

- 独有控件：字段 videoList/videoTime/videoRatio/videoCoverUrl/editType；与 AI_VIDEO_EDITING 明确区分：本页是片段编排和拼接。左侧片段列表，中央预览，下方顺序/时长，右侧封面比例导出。
- 状态机联动：拖拽排序即时更新总时长和预览顺序；单片裁剪改变 videoTime；封面可来自帧或上传图片；比例只改输出画布；任一片段失败可单独替换，不重传全部。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。
- 字段契约：`editType, imageFormat, imageHeight, imageSize, imageUrl, imageWidth, videoCoverUrl, videoList, videoRatio, videoTime`；逐字段控件与校验见[页面规格](page-specs/39-video-concat.md)。
- 测试：必须覆盖本页主流程、独有联动、配置快照一致性、源文件替换、部分失败与草稿恢复；禁止只测路由能打开。


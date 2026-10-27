> 状态：文档基线，**本轮未修改代码**。日期：2026-10-27。  
> 事实来源：`schema_final.json`、真实 `workbench-0vHvVyx6.js`、五类页面 DOM；推断与补充关系均单独标注。

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

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/product-image-suite`，origin=`original`，makeType=`71`。
- **页面**：layout=`suite`（多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=["imageUrl", "outputNum"]`；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定。
- **状态/交互**：上传后选择套图组合；结果按视角分组，可单张重做或整组入库；草稿键 `tool-draft:PRODUCT_IMAGE_SUITE`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T02｜服装套图 `DRESS_WEAR_SET`

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/dress-wear-set`，origin=`original`，makeType=`69`。
- **页面**：layout=`suite`（多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid`。
- **契约**：`fields_clean=["aspectRatio", "brandDNA", "brandKey", "brandName", "coverList", "imageUrl", "images", "language", "name", "needIntelligent", "outputNum", "platform", "provider", "quality", "resolution", "salesRegion"]`；`aspectRatio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`brandDNA`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`brandKey`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`brandName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`coverList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`images`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`language`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`name`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`needIntelligent`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`platform`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`provider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`quality`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`resolution`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`salesRegion`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：服装上传→平台/地区/语言→品牌信息→场景与比例→整组生成；草稿键 `tool-draft:DRESS_WEAR_SET`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T03｜套图换色 `CHANGE_COLOR_V2`

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/change-color-v2`，origin=`original`，makeType=`93`。
- **页面**：layout=`color`（色彩工作区：左配置、中央原图/结果对比、底部套图缩略图）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector`。
- **契约**：`fields_clean=["imageName", "imageUrl"]`；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验。
- **状态/交互**：先选套图，再在对比区统一预览；逐张微调不能破坏整组一致性；草稿键 `tool-draft:CHANGE_COLOR_V2`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T04｜批量翻译 `IMAGE_TRANSLATION`

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/image-translation`，origin=`original`，makeType=`45`。
- **页面**：layout=`translate`（翻译工作区：左语言与批任务、中央文本框画布、右校对列表）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector`。
- **契约**：`fields_clean=["imageName", "imageSegUrl", "imageUrl", "sourceLanguage", "targetLanguage"]`；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`sourceLanguage`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`targetLanguage`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：源/目标语言联动；逐文本框校对；确认后批量应用；草稿键 `tool-draft:IMAGE_TRANSLATION`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T05｜高清放大 `SCALE_UP`

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/scale-up`，origin=`original`，makeType=`7`。
- **页面**：layout=`enhance`（增强工作区：左参数、中央放大对比、右下输出信息卡）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl`。
- **契约**：`fields_clean=["enhanceFace", "enhanceQuality", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "magnification"]`；`enhanceFace`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`enhanceQuality`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`magnification`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：倍率、面部增强、质量增强即时反映输出尺寸与限制；草稿键 `tool-draft:SCALE_UP`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T06｜智能扩图 `AI_OUTPAINTING`

- **注册**：category=`ecommerce-suite`，route=`/tools/ecommerce-suite/ai-outpainting`，origin=`original`，makeType=`25`。
- **页面**：layout=`outpaint`（扩图画布：左比例/尺寸、中央可拖拽边界画布、底部结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor、SizeRatioControl`。
- **契约**：`fields_clean=["config", "editFlag", "height", "imageConfig", "imageExpandUrl", "imageName", "imageUrl", "maskUrl", "originImageUrl", "outputNum", "prompt", "ratio", "sizeSetHeight", "sizeSetName", "sizeSetType", "sizeSetValue", "sizeSetWidth", "stageConfig", "width"]`；`config`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`editFlag`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`height`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageConfig`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageExpandUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`maskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`originImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`sizeSetHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sizeSetName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sizeSetType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sizeSetValue`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sizeSetWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`stageConfig`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`width`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：拖拽扩图边界；原图锁定；比例、尺寸与蒙版同步；草稿键 `tool-draft:AI_OUTPAINTING`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T07｜局部重绘 `AREA_REPAIR`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/area-repair`，origin=`original`，makeType=`32`。
- **页面**：layout=`mask`（蒙版工作区：左任务参数、中央画笔画布、右前后对比）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、MaskEditor`。
- **契约**：`fields_clean=["autoExpand", "imageName", "imageUrl", "maskUrl", "outputNum", "prompt"]`；`autoExpand`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`maskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）。
- **状态/交互**：画笔/橡皮/羽化；原图与结果并排；可撤销蒙版笔画；草稿键 `tool-draft:AREA_REPAIR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T08｜局部消除 `REMOVE_PEN`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/remove-pen`，origin=`original`，makeType=`23`。
- **页面**：layout=`mask`（蒙版工作区：左任务参数、中央画笔画布、右前后对比）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor`。
- **契约**：`fields_clean=["eraseImageUrl", "imageName", "imageUrl", "maskImageUrl"]`；`eraseImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`maskImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验。
- **状态/交互**：仅显示消除所需控件；涂抹预览与前后对比；草稿键 `tool-draft:REMOVE_PEN`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T09｜一键换色 `CHANGE_COLOR`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/change-color`，origin=`original`，makeType=`19`。
- **页面**：layout=`color`（色彩工作区：左配置、中央原图/结果对比、底部套图缩略图）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、InteractiveCanvas / PropertyInspector`。
- **契约**：`fields_clean=["adjustLight", "colorParams", "coverList", "doInpaint", "imageFormat", "imageHeight", "imageMaskUrl", "imageName", "imageSegUrl", "imageSize", "imageTagData", "imageUrl", "imageWidth", "images", "name", "sourceImageUrl"]`；`adjustLight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`colorParams`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 ColorPicker+hex 文本；#RRGGBB/#RRGGBBAA；`coverList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`doInpaint`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageFormat`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSize`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageTagData`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imageWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`images`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`name`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验。
- **状态/交互**：区域选择→目标色→光照/重绘选项→对比；草稿键 `tool-draft:CHANGE_COLOR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T10｜图片裁剪 `IMAGE_CROP`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/image-crop`，origin=`original`，makeType=`67`。
- **页面**：layout=`crop`（裁剪工作区：左平台/比例、中央裁剪框、右输出预览）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl`。
- **契约**：`fields_clean=["activeTab", "contentUrl", "imageCropUrl", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "platform", "platformTitle", "ratio", "selectedMode"]`；`activeTab`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`contentUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageCropUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageFormat`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSize`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imageWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`platform`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`platformTitle`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`selectedMode`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：裁剪框、平台预设、自由比例和输出尺寸同步；草稿键 `tool-draft:IMAGE_CROP`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T11｜商品精修 `PRODUCT_REFINE`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/product-refine`，origin=`original`，makeType=`56`。
- **页面**：layout=`enhance`（增强工作区：左参数、中央放大对比、右下输出信息卡）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl`。
- **契约**：`fields_clean=["color", "imageOutputLength", "imageSegUrl", "imageUrl", "imgTransform", "isRmBg", "ratio", "realImageUrl"]`；`color`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 ColorPicker+hex 文本；#RRGGBB/#RRGGBBAA；`imageOutputLength`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imgTransform`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`isRmBg`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`realImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验。
- **状态/交互**：精修强度、去背景、比例与色彩配置集中显示；草稿键 `tool-draft:PRODUCT_REFINE`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T12｜色差修复 `FIX_COLOR`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/fix-color`，origin=`original`，makeType=`26`。
- **页面**：layout=`repair`（修复工作区：左区域与版本参数、中央局部编辑器、右对比）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor`。
- **契约**：`fields_clean=["fixColorSegUrl", "fixColorUrl", "imageName", "imageResultUrl", "imageSegUrl", "imageUrl", "version"]`；`fixColorSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 ColorPicker+hex 文本；#RRGGBB/#RRGGBBAA；`fixColorUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 ColorPicker+hex 文本；#RRGGBB/#RRGGBBAA；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`version`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：选择修复区域，版本与分割结果可追溯；草稿键 `tool-draft:FIX_COLOR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T13｜印花修复 `PRINTING_REPAIR`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/printing-repair`，origin=`original`，makeType=`29`。
- **页面**：layout=`repair`（修复工作区：左区域与版本参数、中央局部编辑器、右对比）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl`。
- **契约**：`fields_clean=["config", "height", "imageResultUrl", "imageUrl", "point", "rotate", "scale", "stampingFlowerSegUrl", "stampingFlowerUrl", "targetConfig", "url", "version", "width"]`；`config`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`height`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`point`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`rotate`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`scale`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`stampingFlowerSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`stampingFlowerUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetConfig`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`url`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`version`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`width`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：定位印花→修复强度/旋转缩放→局部对比；草稿键 `tool-draft:PRINTING_REPAIR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T14｜手部修复 `HAND_REPAIR`

- **注册**：category=`smart-edit`，route=`/tools/smart-edit/hand-repair`，origin=`original`，makeType=`31`。
- **页面**：layout=`repair`（修复工作区：左区域与版本参数、中央局部编辑器、右对比）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor`。
- **契约**：`fields_clean=["imageName", "imageUrl", "maskUrl", "outputNum", "personType"]`；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`maskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`personType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：人物类型、手部蒙版、输出数量；标注原站即将下架；草稿键 `tool-draft:HAND_REPAIR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T15｜商品图 `NEW_REPLACE_BG_V2`

- **注册**：category=`product-design`，route=`/tools/product-design/new-replace-bg-v2`，origin=`original`，makeType=`28`。
- **页面**：layout=`scene`（场景工作区：左商品/场景配置、中央场景模板、右结果网格）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=[]`；`fields_clean=[]`：回查 chunk 后才可定义 FieldSpec；禁止按空表单提交。
- **状态/交互**：商品上传→抠图确认→场景模板或自定义→结果网格；草稿键 `tool-draft:NEW_REPLACE_BG_V2`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T16｜商品替换 `REPLACE_GOODS`

- **注册**：category=`product-design`，route=`/tools/product-design/replace-goods`，origin=`original`，makeType=`12`。
- **页面**：layout=`replace`（双对象合成：左双输入、中央位置/蒙版编辑、右合成结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、SizeRatioControl`。
- **契约**：`fields_clean=["config", "cutoutProvider", "denoiseStrength", "height", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "lockImageUrl", "maskUrl", "outputNum", "point", "ratio", "rotate", "scale", "sourceImageUrl", "sourceOriginUrl", "targetConfig", "targetImageUrl", "targetOriginUrl", "url", "width"]`；`config`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`cutoutProvider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`denoiseStrength`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`height`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`lockImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`maskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`point`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`rotate`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`scale`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`sourceOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetConfig`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`targetOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`url`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`width`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：目标商品与新商品双输入；位置、缩放、旋转和蒙版可视化；草稿键 `tool-draft:REPLACE_GOODS`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T17｜场景裂变 `PRODUCT_SCENE`

- **注册**：category=`product-design`，route=`/tools/product-design/product-scene`，origin=`original`，makeType=`13`。
- **页面**：layout=`scene`（场景工作区：左商品/场景配置、中央场景模板、右结果网格）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid`。
- **契约**：`fields_clean=["cutoutProvider", "imageName", "imageOutputHeight", "imageOutputWidth", "imageUrl", "mode", "originImageUrl", "outputNum", "prompt", "provider", "ratio", "sceneKeyword", "segImageUrl", "sizeType", "strength"]`；`cutoutProvider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageOutputWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`mode`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`originImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`provider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`sceneKeyword`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`segImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`sizeType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`strength`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：模式、场景词、强度、尺寸、Provider 能力与输出数量联动；草稿键 `tool-draft:PRODUCT_SCENE`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T18｜手持商品 `HANDHELD_GOODS`

- **注册**：category=`product-design`，route=`/tools/product-design/handheld-goods`，origin=`original`，makeType=`49`。
- **页面**：layout=`model`（模特工作区：左人物与场景、中央模特/姿势选择、右结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid`。
- **契约**：`fields_clean=["checkType", "imageMaskUrl", "imageResultUrl", "imageUrl", "modelId", "modelTabType", "outputNum", "sceneTabType", "targetMaskUrl", "targetOriginUrl", "targetResultUrl"]`；`checkType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`imageResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`modelId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`modelTabType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`sceneTabType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`targetOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：模特/场景/商品类别选择，商品与目标区域双预览；草稿键 `tool-draft:HANDHELD_GOODS`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T19｜AI穿衣 `AI_DRESSING_V2`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-dressing-v2`，origin=`original`，makeType=`24`。
- **页面**：layout=`dress`（试衣工作区：顶部分步条、左服装/模特输入、右试穿结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid`。
- **契约**：`fields_clean=["coverList", "downImageUrl", "downMaskUrl", "downOriginUrl", "genOriRes", "images", "isSecondOperate", "modelPose", "modelPoseList", "modelType", "name", "outputNum", "provider", "suitImageUrl", "suitMaskUrl", "suitOriginUrl", "upperImageUrl", "upperMaskUrl", "upperOriginUrl", "version"]`；`coverList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`downImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`downMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`downOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`genOriRes`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`images`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`isSecondOperate`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`modelPose`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`modelPoseList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`modelType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`name`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`provider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`suitImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`suitMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`suitOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`upperImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`upperMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`upperOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`version`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：分步选择服装部位；原图/蒙版/结果状态可回溯；草稿键 `tool-draft:AI_DRESSING_V2`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T20｜姿势裂变 `AI_POSTURE`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-posture`，origin=`original`，makeType=`58`。
- **页面**：layout=`model`（模特工作区：左人物与场景、中央模特/姿势选择、右结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid`。
- **契约**：`fields_clean=["imageTags", "imageUrl", "outputNum", "prompt"]`；`imageTags`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）。
- **状态/交互**：人物上传→姿势/标签→Prompt→多结果选择；草稿键 `tool-draft:AI_POSTURE`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T21｜AI穿戴 `AI_WEARABLE`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-wearable`，origin=`original`，makeType=`34`。
- **页面**：layout=`dress`（试衣工作区：顶部分步条、左服装/模特输入、右试穿结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ImageResultGrid`。
- **契约**：`fields_clean=["checkType", "imageMaskUrl", "imageResultUrl", "imageUrl", "isSecondOperate", "modelId", "modelTabType", "outputNum", "productCategory", "sceneTabType", "targetMaskUrl", "targetOriginUrl", "targetResultUrl"]`；`checkType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`imageResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isSecondOperate`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`modelId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`modelTabType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`productCategory`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sceneTabType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`targetOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`targetResultUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：穿戴部位、品类、模特与目标蒙版联动；草稿键 `tool-draft:AI_WEARABLE`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T22｜POD素材 `AI_TEXT`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-text`，origin=`original`，makeType=`14`。
- **页面**：layout=`pod`（POD 工作区：左风格与素材、中央模板/平铺预览、右结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ImageResultGrid`。
- **契约**：`fields_clean=["aiSimpleTextPrompt", "imageUrl", "isCase", "mode", "outputNum", "prompt", "ratio", "requestId", "responseId", "styles", "stylesCn", "tilingPreset", "useAutopromptOption", "variationStrength"]`；`aiSimpleTextPrompt`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isCase`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`mode`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`requestId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`responseId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`styles`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`stylesCn`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`tilingPreset`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`useAutopromptOption`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`variationStrength`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围。
- **状态/交互**：模式/风格/平铺/自动Prompt/变化强度分组配置；草稿键 `tool-draft:AI_TEXT`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T23｜饰品文字 `ORNAMENT_TEXT`

- **注册**：category=`product-design`，route=`/tools/product-design/ornament-text`，origin=`original`，makeType=`17`。
- **页面**：layout=`text`（文字工作区：左文字/字体参数、中央画布文本框、右预览）；组件 `ToolPageHeader、PromptEditor、CapabilityNotice、TaskStatusPanel、PromptComposer、InteractiveCanvas / PropertyInspector`。
- **契约**：`fields_clean=["fontSize", "fontname", "left", "prompt", "right"]`；`fontSize`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`fontname`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`left`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`right`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：文字内容、字体、字号和左右区域参数实时预览；草稿键 `tool-draft:ORNAMENT_TEXT`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T24｜素材贴合 `SDS_DESIGN`

- **注册**：category=`product-design`，route=`/tools/product-design/sds-design`，origin=`original`，makeType=`22`。
- **页面**：layout=`pod`（POD 工作区：左风格与素材、中央模板/平铺预览、右结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=["imageList", "imageName", "imageUrl", "materialList", "productId"]`；`imageList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`materialList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`productId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：商品与素材多选；贴合对象和输出预览一一对应；草稿键 `tool-draft:SDS_DESIGN`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T25｜印花提取 `PRINT_EXTRACT`

- **注册**：category=`product-design`，route=`/tools/product-design/print-extract`，origin=`original`，makeType=`60`。
- **页面**：layout=`extract`（提取工作区：左透明背景选项、中央原图、右提取结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel`。
- **契约**：`fields_clean=["imageUrl", "isTransparent"]`；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isTransparent`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：透明背景开关与原图/提取结果对比；草稿键 `tool-draft:PRINT_EXTRACT`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T26｜AI姿势生成 `AI_POSE_GENERATOR`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-pose-generator`，origin=`supplemental`，makeType=`57`。
- **页面**：layout=`model`（模特工作区：左人物与场景、中央模特/姿势选择、右结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、ImageResultGrid`。
- **契约**：`fields_clean=["prompt", "scenePrompts"]`；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`scenePrompts`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 TextArea，1–4000 字（服务端更严时取交集）。
- **状态/交互**：场景 Prompt 列表与主 Prompt 分层编辑；补充工具标识；草稿键 `tool-draft:AI_POSE_GENERATOR`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T27｜AI试衣XSY `AI_DRESSING_XSY`

- **注册**：category=`product-design`，route=`/tools/product-design/ai-dressing-xsy`，origin=`supplemental`，makeType=`39`。
- **页面**：layout=`dress`（试衣工作区：顶部分步条、左服装/模特输入、右试穿结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、MaskEditor、ModelCapabilitySelect、ImageResultGrid`。
- **契约**：`fields_clean=["downImageUrl", "downMaskUrl", "downOriginUrl", "modelImageUrl", "modelPose", "modelStyle", "modelType", "outputNum", "provider", "step", "suitImageUrl", "suitMaskUrl", "suitOriginUrl", "upperImageUrl", "upperMaskUrl", "upperOriginUrl", "version"]`；`downImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`downMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`downOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`modelImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`modelPose`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`modelStyle`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`modelType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`provider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`step`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`suitImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`suitMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`suitOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`upperImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`upperMaskUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 MaskEditor 导出 PNG；须与原图同尺寸；`upperOriginUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`version`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：步骤条、服装/模特输入、Provider 与版本能力检查；补充工具；草稿键 `tool-draft:AI_DRESSING_XSY`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T28｜场景裂变链接 `FISSION_LINK`

- **注册**：category=`product-design`，route=`/tools/product-design/fission-link`，origin=`supplemental`，makeType=`83`。
- **页面**：layout=`scene`（场景工作区：左商品/场景配置、中央场景模板、右结果网格）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=["imageUrl", "outputNum"]`；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定。
- **状态/交互**：单图输入和数量控制；与 PRODUCT_SCENE 区分，不混用契约；草稿键 `tool-draft:FISSION_LINK`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- **注册**：category=`product-design`，route=`/tools/product-design/image-text-edit`，origin=`supplemental`，makeType=`78`。
- **页面**：layout=`text`（文字工作区：左文字/字体参数、中央画布文本框、右预览）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、InteractiveCanvas / PropertyInspector`。
- **契约**：`fields_clean=["boxes", "imageFormat", "imageHeight", "imageName", "imageSize", "imageUrl", "imageWidth", "resultImageUrl"]`；`boxes`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageFormat`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSize`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imageWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`resultImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验。
- **状态/交互**：画布文本框选择、内容编辑、尺寸保持和结果回写；补充工具；草稿键 `tool-draft:IMAGE_TEXT_EDIT`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T30｜上装换料 `MATERIAL_UPPER_BODY`

- **注册**：category=`product-design`，route=`/tools/product-design/material-upper-body`，origin=`supplemental`，makeType=`16`。
- **页面**：layout=`dress`（试衣工作区：顶部分步条、左服装/模特输入、右试穿结果）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=["categoryIds", "categoryName", "imageName", "imageUrl", "isMatting", "outputNum", "subType"]`；`categoryIds`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`categoryName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isMatting`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`subType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：上装与材质分类联动；抠图开关和数量配置；补充工具；草稿键 `tool-draft:MATERIAL_UPPER_BODY`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T31｜商品图设计器 `NEW_DESIGNER`

- **注册**：category=`product-design`，route=`/tools/product-design/new-designer`，origin=`supplemental`，makeType=`99`。
- **页面**：layout=`designer`（设计器宿主：顶部文档操作条、左素材/模板、中央画布、右属性）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、DesignerHost / DraftRecovery`。
- **契约**：`fields_clean=["designerId", "imageUrl", "isDesignerUse", "onClose", "onDone", "open"]`；`designerId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isDesignerUse`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`onClose`：callback；required=是（宿主契约）；由 DesignerHost 注入，禁止 JSON 序列化；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`onDone`：callback；required=是（宿主契约）；由 DesignerHost 注入，禁止 JSON 序列化；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`open`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：设计器宿主、返回/完成回调、草稿恢复；不是普通生成表单；草稿键 `tool-draft:NEW_DESIGNER`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`designer-host`；设计器走宿主回调和草稿恢复；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- **注册**：category=`product-design`，route=`/tools/product-design/product-market-material`，origin=`supplemental`，makeType=`64`。
- **页面**：layout=`suite`（多结果套图工作区：左配置、右侧 2×2 结果网格与整组状态条）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、SizeRatioControl、ModelCapabilitySelect、ImageResultGrid`。
- **契约**：`fields_clean=["APlusAspectRatio", "aspectRatio", "brandDNA", "brandKey", "brandName", "coverList", "images", "isCustomAspectRatio", "language", "name", "platform", "provider", "quality", "resolution", "salesRegion"]`；`APlusAspectRatio`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`aspectRatio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`brandDNA`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`brandKey`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`brandName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`coverList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`images`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`isCustomAspectRatio`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`language`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`name`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`platform`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`provider`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`quality`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`resolution`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`salesRegion`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：平台、销售地区、品牌、A+比例与模板组合；补充工具；草稿键 `tool-draft:PRODUCT_MARKET_MATERIAL`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T33｜场景迁移 `SCENE_TRANSFER`

- **注册**：category=`product-design`，route=`/tools/product-design/scene-transfer`，origin=`supplemental`，makeType=`63`。
- **页面**：layout=`scene`（场景工作区：左商品/场景配置、中央场景模板、右结果网格）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、ImageResultGrid`。
- **契约**：`fields_clean=["imageStyleUrl", "imageUrl", "segImageUrl", "similarity"]`；`imageStyleUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`segImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`similarity`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：商品图+风格参考图双输入，相似度连续调节；补充工具；草稿键 `tool-draft:SCENE_TRANSFER`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`image`；图片走上传/编辑/生成与资产入库；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T34｜图转视频 `IMAGE_TO_VIDEO`

- **注册**：category=`ai-video`，route=`/tools/ai-video/image-to-video`，origin=`original`，makeType=`30`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["aspectRatio", "duration", "extension", "fileKey", "fileName", "imageInputMode", "imageList", "imageUrl", "isPro", "language", "lastFrameImageUrl", "productInfo", "productUrl", "prompt", "promptOptimizer", "referenceAudios", "referenceDocument", "referenceVideo", "saleCountry", "size", "sourceImageUrl", "templateKey", "templateName", "thumbUrl", "url", "videoTime", "videoType"]`；`aspectRatio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`duration`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`extension`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`fileKey`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`fileName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageInputMode`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isPro`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`language`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`lastFrameImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`productInfo`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`productUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`promptOptimizer`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`referenceAudios`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`referenceDocument`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`referenceVideo`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`saleCountry`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`size`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 结构化编辑器+JSON schema；坐标/尺寸/引用逐项校验；`sourceImageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`templateKey`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`templateName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`thumbUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`url`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoTime`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：首帧/首尾帧、参考素材、时长/比例/清晰度/音频分步配置；草稿键 `tool-draft:IMAGE_TO_VIDEO`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=true；UI 配色仅引用全局令牌。

### TECH-T35｜带货口播 `SALE_VIDEO`

- **注册**：category=`ai-video`，route=`/tools/ai-video/sale-video`，origin=`original`，makeType=`73`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["aspectRatio", "hiddenPrompt", "imageList", "imageUrl", "isPro", "language", "prompt", "resolution", "saleCountry", "videoTime", "videoType", "visiblePrompt"]`；`aspectRatio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`hiddenPrompt`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isPro`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`language`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`resolution`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`saleCountry`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoTime`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`visiblePrompt`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：商品信息、可见Prompt、隐藏Prompt、语言/地区与视频参数；草稿键 `tool-draft:SALE_VIDEO`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T36｜视频复刻 `VIDEO_REPLICATION`

- **注册**：category=`ai-video`，route=`/tools/ai-video/video-replication`，origin=`original`，makeType=`89`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、SizeRatioControl、ModelCapabilitySelect、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["analyzeRedisKey", "aspectRatio", "clipEnd", "clipMode", "clipStart", "coverUrl", "duration", "imageSegUrl", "imageUrl", "isPro", "originalVideoId", "originalVideoUrl", "prompt", "promptOptimizer", "ratio", "refImageList", "refVideoName", "refVideoUrl", "resolution", "saleCountry", "sourceVideoDuration", "sourceVideoUrl", "targetLanguage", "videoCoverType", "videoSource", "videoTime", "videoType"]`；`analyzeRedisKey`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`aspectRatio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`clipEnd`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`clipMode`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`clipStart`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`coverUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`duration`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`imageSegUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`isPro`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`originalVideoId`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`originalVideoUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`promptOptimizer`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`ratio`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 RatioCards/Select；仅 provider 返回比例；`refImageList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`refVideoName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`refVideoUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`resolution`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`saleCountry`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceVideoDuration`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceVideoUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`targetLanguage`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`videoCoverType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoSource`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoTime`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：视频上传→片段裁剪→分析→替换素材→目标语言与输出；草稿键 `tool-draft:VIDEO_REPLICATION`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T37｜视频编辑 `AI_VIDEO_EDITING`

- **注册**：category=`ai-video`，route=`/tools/ai-video/ai-video-editing`，origin=`original`，makeType=`95`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、PromptComposer、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["duration", "outputNum", "prompt", "refImageUrls", "sourceVideoDuration", "sourceVideoUrl", "videoType"]`；`duration`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`prompt`：string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk；控件 TextArea，1–4000 字（服务端更严时取交集）；`refImageUrls`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`sourceVideoDuration`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceVideoUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`videoType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：源视频、参考图、编辑Prompt、时长和视频类型联动；草稿键 `tool-draft:AI_VIDEO_EDITING`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T38｜视频翻译 `VIDEO_TRANSLATION`

- **注册**：category=`ai-video`，route=`/tools/ai-video/video-translation`，origin=`original`，makeType=`96`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["lipSync", "outputNum", "sourceLanguage", "sourceVideoName", "sourceVideoUrl", "targetLanguage", "videoType"]`；`lipSync`：boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined；控件 Switch/Slider；布尔开关或目录数值，不从名称猜范围；`outputNum`：integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1；控件 InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定；`sourceLanguage`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`sourceVideoName`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`sourceVideoUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`targetLanguage`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用；`videoType`：string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用；控件 Select/RadioCards；选项来自 chunk/模型目录，未知即禁用。
- **状态/交互**：源/目标语言、口型同步能力检查、输出数量和播放器对比；草稿键 `tool-draft:VIDEO_TRANSLATION`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

### TECH-T39｜视频拼接 `VIDEO_CONCAT`

- **注册**：category=`ai-video`，route=`/tools/ai-video/video-concat`，origin=`supplemental`，makeType=`52`。
- **页面**：layout=`video`（视频工作区：左分步配置、中央分镜/时间线、右播放器与任务状态）；组件 `ToolPageHeader、AssetUploader、CapabilityNotice、TaskStatusPanel、VideoTimeline / VideoResultPlayer`。
- **契约**：`fields_clean=["editType", "imageFormat", "imageHeight", "imageSize", "imageUrl", "imageWidth", "videoCoverUrl", "videoList", "videoRatio", "videoTime"]`；`editType`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageFormat`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageHeight`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageSize`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`imageUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验；`imageWidth`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoCoverUrl`：string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoList`：array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoRatio`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐；`videoTime`：string/unknown；required=按 chunk；未确认类型前不得提交，adapter 显式校验；控件 按字段语义的文本/结构化输入；必填、默认值和枚举须由契约证据补齐。
- **状态/交互**：时间线排序、片段裁剪、封面、比例与总时长；补充工具；草稿键 `tool-draft:VIDEO_CONCAT`，任务键 `tool-task:{taskId}`。
- **执行**：adapter=`video`；视频走异步任务与播放器；模型能力检查先于提交，批量支持不改变 adapter。
- **专项测试**：路由/字段序列化/交互状态/失败恢复；批量支持=false；UI 配色仅引用全局令牌。

## 11. 实施顺序与回滚

先导航与注册表→ToolShell→上传/任务基础设施→每类样板→逐工具 adapter→批量→全量验收。导航可经 feature flag 回滚；单工具通过 registry enabled 回滚，不影响其他页面。

## 12. 非目标与未决验证

本文不声称 39 个真实生成已完成。`NEW_REPLACE_BG_V2` 空字段、`NEW_DESIGNER` 宿主契约、动态模型/枚举、参考视频/口型能力必须在该工具任务实施前重新核实；未核实不得开启提交。
# 27｜AI试衣XSY `AI_DRESSING_XSY`

- 分类：商品图设计；目标路由：`/tools/product-design/ai-dressing-xsy`；页面类型：`dress`。
- 目标：使用 XSY 流程完成分步试衣。
- 证据级别：`supplemental_chunk_design`；原站 URL：`补充工具无本轮直达 URL`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

模特图｜分步服装上传｜模特风格/姿势｜步骤状态｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

字段含 modelImageUrl、step、modelStyle/modelPose/modelType、upper/down/suit 三组图片和 mask；是分步试衣流程，区别于 AI 穿衣的参考模特选择。

## 3. 状态联动与校验

step 驱动“模特→服装→蒙版/姿势→生成”；回退上一步保留下游草稿但标为需重确认；切换上下装/套装清理冲突字段；每步显示完成状态。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传模特→选服装类型并上传→确认蒙版/风格姿势→生成→结果对比。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`GarmentTabs + GarmentMaskUploader + ModelPosePicker`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_DRESSING_XSY`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `downImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `downMaskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `downOriginUrl` | 下载源地址；导出时由结果资产生成，只读 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `modelImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `modelPose` | 模特姿势；从姿势模板/姿势编辑器选择 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `modelStyle` | 模特风格；风格卡片选择并筛选候选模特 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `modelType` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `provider` | 模型服务商；由当前模型卡片固定映射，不开放自由文本 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `step` | 当前步骤；由步骤条和每步校验推进，可返回编辑 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `suitImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `suitMaskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `suitOriginUrl` | 套装原始图地址；上传套装参考后自动绑定 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `upperImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `upperMaskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `upperOriginUrl` | 上装原始图地址；上装上传控件自动绑定 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `version` | 算法或修复版本选择；切换只重算当前预览，不删除历史结果 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

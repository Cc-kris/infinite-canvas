# 06｜智能扩图 `AI_OUTPAINTING`

- 分类：电商套图；目标路由：`/tools/ecommerce-suite/ai-outpainting`；页面类型：`outpaint`。
- 目标：调整画布比例并补全画面。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/ai-outpainting`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

图片上传｜画布/比例扩展｜扩展预览｜生成数量｜结果网格。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

默认尺寸与自定义比例/宽高；支持基于原图、扩展图、蒙版与 stageConfig 的画布编辑；输出1–4张；提示词用于扩展区域内容。

## 3. 状态联动与校验

改比例只调整外扩画布，不拉伸原图；拖动原图改变保留区域并更新 mask；恢复默认尺寸需清掉扩展变换；生成前必须确认扩展方向和最终尺寸。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传→选择目标比例/尺寸→拖动原图定位→输入扩展内容→生成→查看多结果并保存/送画布。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`OutpaintCanvas + AspectRatioControl + TransformHistory`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`OutpaintCanvas + AspectRatioControl + TransformHistory`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_OUTPAINTING`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `config` | 当前模块结构化配置；由本页控件生成并在提交时保存快照 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `editFlag` | 编辑状态标记；进入/退出编辑模式自动更新 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `height` | 目标高度数值；与宽度、比例和尺寸预设联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageConfig` | 图片配置；由比例、尺寸、品质和数量控件生成 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageExpandUrl` | 扩图结果地址；扩图任务成功后自动绑定 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `imageName` | 图片文件名/展示名；上传后自动填入，可编辑显示名称 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `maskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `originImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `prompt` | TextArea，1–4000 字（服务端更严时取交集） | string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk |
| `ratio` | RatioCards/Select；仅 provider 返回比例 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `sizeSetHeight` | 尺码表高度；尺寸/尺码编辑器字段 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sizeSetName` | 尺码名称；尺码表 editable row 字段 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sizeSetType` | 尺码类型；尺码表类型选择 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sizeSetValue` | 尺码数值；尺码表 editable row 字段 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sizeSetWidth` | 尺码表宽度；尺寸/尺码编辑器字段 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `stageConfig` | 分阶段配置；由上传、分析、编辑、生成各步骤状态组成 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `width` | 目标宽度数值；与高度、比例和尺寸预设联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

- 智能扩图
- 一键无缝扩展，打破视觉边界，释放每一张照片的无限可能~
- 从本地上传
- 从作品库选择
- 默认尺寸
- 生成：
- 4张
- 立即生成
- (40算力)
- 生成结果
- 优秀案例
- 历史记录
- 暂无生成结果图
- 快在左侧操作智能扩图吧~

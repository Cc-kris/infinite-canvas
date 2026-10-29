# 29｜图片文字编辑 `IMAGE_TEXT_EDIT`

- 分类：商品图设计；目标路由：`/tools/product-design/image-text-edit`；页面类型：`text`。
- 目标：直接编辑图片中的文本框。
- 证据级别：`route_not_found`；原站 URL：`https://www.linkfox.com/draw/designer`。
- 证据文件：`../evidence/page-dom-20261028/IMAGE_TEXT_EDIT.json`（2026-10-29 实拍：`/draw/designer` 实测 404「页面不存在」；`/draw/ai-image-edit` 被白名单重定向 /home；文字编辑态经 /draw/designer-home 进入，未取得独立 DOM）
- 路由依据：`workbench-BcUrzOPA.js` 侧栏菜单表 text/label/path/drawType/whitelist（非猜测）。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

图片文字画布｜文本框列表｜属性编辑｜导出。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

字段 boxes、图片尺寸/格式、resultImageUrl；每个 box 有位置、尺寸、文本和样式，中央画布与右侧属性联动。

## 3. 状态联动与校验

选画布文字框同步选右侧条目；编辑内容/字体/位置实时改 boxes；删除可撤销；导出前检查溢出和缺字；原图永不被覆盖。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传图片→识别/新增文本框→逐个改文字和样式→检查溢出→导出/保存。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`TextLayerCanvas + FontPropertyPanel + TextBoxList`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:IMAGE_TEXT_EDIT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `boxes` | 检测/编辑框集合；由画布框选产生并保存归一化坐标 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageFormat` | 图片格式；上传文件元数据或导出格式选项（PNG/JPEG/WebP） | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageHeight` | 图片高度；从源文件元数据或目标尺寸控件读取，正整数 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageName` | 图片文件名/展示名；上传后自动填入，可编辑显示名称 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageSize` | 文件字节数；上传时自动计算并按页面限制校验 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `imageWidth` | 图片宽度；从源文件元数据或目标尺寸控件读取，正整数 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `resultImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

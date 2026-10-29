# 39｜视频拼接 `VIDEO_CONCAT`

- 分类：AI视频；目标路由：`/tools/ai-video/video-concat`；页面类型：`video`。
- 目标：拼接多个视频片段并设置封面。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/video-concat`。
- 证据文件：`../evidence/page-dom-20261028/VIDEO_CONCAT.json`（2026-10-29 实拍：视频拼接真实工作区 DOM（12 控件：2~4 素材/比例 16:9·9:16·1:1·4:3/60 算力））
- 路由依据：`workbench-BcUrzOPA.js` 侧栏菜单表 text/label/path/drawType/whitelist（非猜测）。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

片段列表｜预览播放器｜排序/裁剪｜封面与比例｜导出。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

字段 videoList/videoTime/videoRatio/videoCoverUrl/editType；与 AI_VIDEO_EDITING 明确区分：本页是片段编排和拼接。左侧片段列表，中央预览，下方顺序/时长，右侧封面比例导出。

## 3. 状态联动与校验

拖拽排序即时更新总时长和预览顺序；单片裁剪改变 videoTime；封面可来自帧或上传图片；比例只改输出画布；任一片段失败可单独替换，不重传全部。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

导入多个视频→排序→逐段裁剪→设封面和比例→预览全片→导出拼接视频。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`VideoSourceUploader + VideoPromptPanel + VideoParameterForm + VideoResultCompare`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:VIDEO_CONCAT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `editType` | 视频/图片编辑模式；由当前编辑器模式固定 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageFormat` | 图片格式；上传文件元数据或导出格式选项（PNG/JPEG/WebP） | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageHeight` | 图片高度；从源文件元数据或目标尺寸控件读取，正整数 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageSize` | 文件字节数；上传时自动计算并按页面限制校验 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `imageWidth` | 图片宽度；从源文件元数据或目标尺寸控件读取，正整数 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `videoCoverUrl` | 视频封面；封面选择器或指定帧生成 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `videoList` | 有序视频片段列表；添加、排序、删除并显示时长 | array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用 |
| `videoRatio` | 视频输出比例；比例卡片并同步预览画布 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `videoTime` | 输出视频时长；Auto/5/10/15 秒，Auto 跟随参考片段 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

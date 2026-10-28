# 37｜视频编辑 `AI_VIDEO_EDITING`

- 分类：AI视频；目标路由：`/tools/ai-video/ai-video-editing`；页面类型：`video`。
- 目标：用提示词编辑已有视频。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/ai-video-edit`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

原视频与片段截取｜参考图｜编辑需求｜模型｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

MP4/MOV100M，至少4秒，超长截取30秒内；参考图最多30张；编辑需求0/2500并可提示词优化；Seedance 2.5；是提示词视频编辑，不是多轨时间线。

## 3. 状态联动与校验

视频上传后开放片段截取；参考图可排序删除；提示词优化可撤销；换源视频清截取和结果；编辑失败保留源视频/参考图/描述。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传原视频→截取→上传参考图→描述编辑需求→优化提示词→生成→前后对比下载。

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
- 草稿键：`tool-draft:v1:AI_VIDEO_EDITING`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `duration` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `prompt` | TextArea，1–4000 字（服务端更严时取交集） | string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk |
| `refImageUrls` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用 |
| `sourceVideoDuration` | 源视频时长；视频元数据读取后自动写入 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `sourceVideoUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `videoType` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

- 原视频
- 上传需要编辑的视频
- 本地上传
- 作品选择
- 支持MP4/MOV格式，100M以内，时长不低于4秒
- 超长视频可截取30秒以内片段
- 参考图（选填）
- 图片规则
- 参考图（选填）
- 支持上传30张图，10M以内，384*384 ~ 4096*4096，宽高比（宽÷高）0.4～2.5（含边界）
- 本地上传
- 作品选择
- 商品库选择
- 编辑需求描述
- 提示词优化
- 0 / 2500
- 视频模型
- Seedance 2.5
- 商品人物精准编辑
- 立即生成
- 1190 算力
- 生成结果
- 优秀案例
- 历史记录
- 上传原视频与参考图，输入编辑需求，AI 智能编辑视频
- 原视频
- 编辑结果
- 一键做同款

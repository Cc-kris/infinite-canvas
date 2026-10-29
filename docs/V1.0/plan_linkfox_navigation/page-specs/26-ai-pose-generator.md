# 26｜AI姿势生成 `AI_POSE_GENERATOR`

- 分类：商品图设计；目标路由：`/tools/product-design/ai-pose-generator`；页面类型：`model`。
- 目标：通过提示词与场景提示生成姿势参考。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/ai-posture`。
- 证据文件：`../evidence/page-dom-20261028/AI_POSE_GENERATOR.json`（2026-10-29 实拍：姿势裂变真实工作区 DOM（21 控件：姿势库/自定义/生成张数）；字段 modelPose/modelStyle/outputNum 与本地一致）
- 路由依据：`workbench-BcUrzOPA.js` 侧栏菜单表 text/label/path/drawType/whitelist（非猜测）。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

姿势提示词｜场景提示词｜参考预览｜生成结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

补充工具，依据字段 prompt 与 scenePrompts；与 AI_POSTURE 的“已有模特图姿势裂变”不同，本页从文字生成姿势参考。

## 3. 状态联动与校验

姿势描述与场景描述分栏，场景不能覆盖姿势约束；可保存姿势预设；修改任一描述只更新草稿；无姿势描述禁用生成。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

输入姿势→补场景→生成参考→筛选→保存为 AI_POSTURE/模特工具参考。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`ReferenceModelPicker + PoseOrCategorySelect + OutputCountControl`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_POSE_GENERATOR`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `prompt` | TextArea，1–4000 字（服务端更严时取交集） | string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk |
| `scenePrompts` | TextArea，1–4000 字（服务端更严时取交集） | array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

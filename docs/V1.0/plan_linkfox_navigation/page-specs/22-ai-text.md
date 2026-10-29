# 22｜POD素材 `AI_TEXT`

- 分类：商品图设计；目标路由：`/tools/product-design/ai-text`；页面类型：`pod`。
- 目标：生成 POD 图案和文字素材。
- 证据级别：`permission_redirect_home`；原站 URL：`https://www.linkfox.com/draw/ai-text`（本账号被重定向 `https://www.linkfox.com/home`）。
- 证据文件：`../evidence/page-dom-20261028/AI_TEXT.json`（2026-10-29 实拍）。
- 路由依据：bundle 菜单表 `text:创意文字, label:创意文字, path:/draw/ai-text, drawType:P.AI_TEXT, whitelist:!0, noQuick:!0`；本账号同源 iframe finalUrl=https://www.linkfox.com/home → 白名单未开通。原站现名「创意文字」，本地沿用旧名「POD素材」。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

POD 素材输入｜风格/平铺｜提示词与变体｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

当前账号访问 `/draw/ai-text` 重定向首页；依据字段组织 aiSimpleTextPrompt/prompt、styles/stylesCn、tilingPreset、mode、ratio、outputNum、variationStrength、useAutopromptOption；支持参考图与案例变体。

## 3. 状态联动与校验

简易文字与完整提示词模式互斥编辑；自动提示词开启时显示生成预览且可解锁手改；平铺预设改变图案重复规则；案例变体继承样式但新建任务。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

选素材模式→输入文字/提示词→选风格和平铺→数量/变体强度→生成→下载透明素材或送贴合。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`PodMaterialForm + TilingPresetSelect + ProductPlacementCanvas`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:AI_TEXT`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `aiSimpleTextPrompt` | 简短提示词输入；可经 AI 优化展开为完整提示词 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `isCase` | Switch/Slider；布尔开关或目录数值，不从名称猜范围 | boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined |
| `mode` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用 |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `prompt` | TextArea，1–4000 字（服务端更严时取交集） | string；required=条件（自动文案/模板关闭时必填）；trim 后非空，长度取 chunk |
| `ratio` | RatioCards/Select；仅 provider 返回比例 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `requestId` | 请求 ID；提交时生成，用于日志和幂等追踪 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `responseId` | 响应 ID；服务端返回后绑定，用于重试/结果追踪 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `styles` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `stylesCn` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `tilingPreset` | Switch/Slider；布尔开关或目录数值，不从名称猜范围 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `useAutopromptOption` | 自动提示词开关；开启时隐藏手工必填并显示自动生成状态 | boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined |
| `variationStrength` | Switch/Slider；布尔开关或目录数值，不从名称猜范围 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

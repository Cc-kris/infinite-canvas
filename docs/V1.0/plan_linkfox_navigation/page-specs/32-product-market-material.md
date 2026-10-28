# 32｜商品营销素材 `PRODUCT_MARKET_MATERIAL`

- 分类：商品图设计；目标路由：`/tools/product-design/product-market-material`；页面类型：`suite`。
- 目标：生成 A+ 与营销场景素材。
- 证据级别：`supplemental_chunk_design`；原站 URL：`补充工具无本轮直达 URL`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

商品多图与信息｜品牌/平台/语言｜A+与营销画幅｜营销素材结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

字段 APlusAspectRatio、aspectRatio、isCustomAspectRatio、platform、salesRegion、language、brandDNA、quality/resolution；与商品套图相比聚焦营销/A+，不设普通主副图组合。

## 3. 状态联动与校验

平台切换过滤合法 A+ 比例；自定义比例展开尺寸；品牌DNA控制字体主色；语言与销售地区随任务快照；输出按营销模块分组。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传商品多图→填信息/品牌→选平台地区语言→选 A+/营销比例→生成→按模块下载。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`SuiteComposer + ModuleCountEditor + LayoutModeRadio + AssetResultGroups`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:PRODUCT_MARKET_MATERIAL`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `APlusAspectRatio` | A+ 图比例；仅作用于 A+ 模块 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `aspectRatio` | RatioCards/Select；仅 provider 返回比例 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `brandDNA` | 品牌基因配置；选择/编辑品牌主色、字体和风格 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `brandKey` | 品牌基因标识；选择品牌配置后自动绑定 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `brandName` | 品牌名称；品牌输入框，随品牌基因配置保存 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `coverList` | 套图封面/主图有序列表；支持选择、排序和删除 | array/object；required=按编辑器步骤；逐项 schema、坐标有限数值、不得空引用 |
| `images` | 参考图片列表；按本页数量上限添加、排序、删除 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `isCustomAspectRatio` | 自定义比例开关；开启后显示宽高输入 | boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined |
| `language` | 输出/界面语言选择；与文案、翻译或语音任务联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `name` | 项目/资产/模板名称输入；按所在卡片上下文显示 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `platform` | 目标平台卡片；决定尺寸、语言和套图约束 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `provider` | 模型服务商；由当前模型卡片固定映射，不开放自由文本 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `quality` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | string enum；required=是；只允许 chunk/模型目录枚举，动态选项未加载时禁用 |
| `resolution` | 视频分辨率单选；480P/720P | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `salesRegion` | 销售地区选择；影响语言、文案与合规模板 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

无工作区摘录；本页依据 chunk 字段/状态或权限重定向事实设计，未伪称实测。

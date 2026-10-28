# 16｜商品替换 `REPLACE_GOODS`

- 分类：商品图设计；目标路由：`/tools/product-design/replace-goods`；页面类型：`replace`。
- 目标：将场景中的原商品替换为新商品。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/product-replacement`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

参考场景画布｜透视/扭曲工具｜商品与锁定区域｜场景变化程度｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

工具快捷键透视T、扭曲N，Ctrl+拖动扭曲，左右键切画布；生成尺寸1024×1024；场景变化程度不变/高；4张；多商品批量替换。

## 3. 状态联动与校验

透视/扭曲改变 targetConfig 而非简单缩放；锁定图/蒙版保护原场景；变化程度控制背景重绘；切画布保留各SKU独立配置；未完成商品定位禁用提交。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传参考场景→选择原商品→上传替换商品→透视/扭曲定位→设场景变化程度→生成→逐SKU检查。

提交按钮旁显示产物数量/预计输出，不显示原站算力。任务提交后锁定本次配置快照；仍允许编辑下一稿。结果支持下载、保存资产、发送到画布（如适用）、单结果重试和查看本次输入快照。

## 5. 失败与恢复

- 上传失败：保留其他输入和配置，定位到失败文件；格式/尺寸/数量错误在控件旁说明，不只弹通用错误。
- 任务失败：保留源资产、全部配置、蒙版/图层/片段等工作数据；允许按相同快照重试或修改后新建任务。
- 部分失败：按结果单元/语言/SKU/片段显示状态，只重试失败单元，已成功结果不重复生成。
- 离开/刷新：保存当前工具草稿和编辑器状态；有未保存画布工作时弹出确认。网络超时进入 `unknown`，先查询任务再决定是否重试，禁止盲目重复提交。

## 6. UI 组件与视觉

组件：`PerspectiveWarpCanvas + LayerLockPanel + SkuWorkspaceSwitcher`。面板用 `bg-card`，主区用 `bg-background`，边框 `border-border`，选中 `bg-accent`，主操作 `bg-primary`；正文 14px/22px，控件 36px，主按钮 40px，圆角 8–10px。颜色、字体和焦点环全部取无限画布令牌；不使用 LinkFox 紫色品牌。画布工具必须提供 40×40px 最小点击区、键盘焦点和撤销/重做。

## 7. 技术绑定与数据

- 专用组件：`PerspectiveWarpCanvas + LayerLockPanel + SkuWorkspaceSwitcher`；共享 ToolShell 只负责导航、资产选择、任务状态和历史，不吞掉本页专用状态。
- 草稿键：`tool-draft:v1:REPLACE_GOODS`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `config` | 当前模块结构化配置；由本页控件生成并在提交时保存快照 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `cutoutProvider` | 抠图引擎；由抠图模式或引擎卡片映射 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `denoiseStrength` | 去噪强度滑杆；与修复预览联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `height` | 目标高度数值；与宽度、比例和尺寸预设联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageName` | 图片文件名/展示名；上传后自动填入，可编辑显示名称 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageOutputHeight` | 输出图片高度；由比例/尺寸预设计算，可自定义时编辑 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageOutputWidth` | 输出图片宽度；由比例/尺寸预设计算，可自定义时编辑 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `lockImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `maskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `point` | 画布/蒙版坐标点；由指针或拖动操作产生，保存相对坐标 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `ratio` | RatioCards/Select；仅 provider 返回比例 | 按本页控件和任务状态自动绑定；提交前校验来源、类型与联动约束 |
| `rotate` | 旋转角；由旋转控件/手势写入，撤销可恢复 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `scale` | 缩放比例；由缩放控件/手势写入，保持预览与导出一致 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sourceImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `sourceOriginUrl` | 源资产地址；上传/作品库选择后自动绑定 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `targetConfig` | 目标对象配置；由当前选中对象的位置、尺寸和样式控件生成 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `targetImageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `targetOriginUrl` | 目标原始资产地址；选择目标图后自动绑定，只读 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `url` | 当前来源链接或资产地址；由解析/上传动作自动写入 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `width` | 目标宽度数值；与高度、比例和尺寸预设联动 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

- 💡 温馨提示：支持上传多张商品图进行批量替换
- 商品替换
- 上传参考图，一键替换商品，快来替换您的商品吧~
- 上传参考图
- 键盘快捷键
- 工具快捷键
- 透视
- T
- 扭曲
- N
- 画布快捷操作
- 扭曲
- Ctrl+拖动
- 向右切换画布
- 键盘右键
- 向左切换画布
- 键盘左键
- 生成尺寸: 1024x1024
- 参考图场景变化程度：
- 不变
- 高
- 生成：
- 4张
- 立即生成
- (40算力)
- 生成结果
- 优秀案例
- 历史记录
- 暂无生成结果图
- 快在左侧合成您的第一张商品图吧~

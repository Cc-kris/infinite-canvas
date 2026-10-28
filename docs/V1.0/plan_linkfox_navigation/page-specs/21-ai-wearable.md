# 21｜AI穿戴 `AI_WEARABLE`

- 分类：商品图设计；目标路由：`/tools/product-design/ai-wearable`；页面类型：`dress`。
- 目标：把饰品或穿戴商品合成到模特。
- 证据级别：`workspace_dom`；原站 URL：`https://www.linkfox.com/draw/ai-wearable`。
- 实现边界：复刻信息架构和操作逻辑，使用无限画布设计令牌、资产、任务和模型服务；不搬 LinkFox 前端代码，不复制算力区。

## 1. 页面区域与布局

穿戴商品上传｜商品品类｜穿戴模特｜数量｜结果。桌面采用工具侧栏 + 页面内容；内容内按上述实际工作区组织，不得替换成统一“上传 + 提示词 + 结果”空壳。配置区保持 320–420px 或按画布工具需要扩展；主要编辑/预览区 `minmax(0,1fr)`；结果区有明确空、生成、成功、失败状态。移动端按“输入/编辑/结果”分步，不压缩画布到不可操作。

## 2. 真实控件与内容

上传穿戴商品，建议用模特穿戴效果图；选择商品品类和穿戴模特；部位、角度与画面占比尽量相近；1–4张。

## 3. 状态联动与校验

品类改变可选穿戴部位和模特过滤；换模特不重新上传商品；商品/品类/模特全部必需；结果可回到原选择做单件重试。

通用状态必须落到具体字段：`draft/dirty → validating → submitting → running → succeeded|failed|cancelled`；切换配置不删除已完成任务；重新上传源文件时使旧结果标记为“来自旧版本”，不能冒充当前配置结果。

## 4. 主操作路径

上传饰品→选品类→选部位匹配模特→生成→检查佩戴位置→下载。

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
- 草稿键：`tool-draft:v1:AI_WEARABLE`；任务包含 `toolId + draftRevision + configSnapshot + sourceAssetIds + clientOperationId`。
- 提交前在当前页面执行必填、数量、尺寸、蒙版/位置等校验；服务端按同一 schema 再校验。

| 字段 | 页面控件 | 校验/说明 |
|---|---|---|
| `checkType` | 检测类型选择；决定敏感词/合规/主体检测规则 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `imageMaskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `imageResultUrl` | 生成结果地址；任务成功后由结果资产自动绑定，只读 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `imageUrl` | Upload/AssetPicker；HTTPS/本地资产 ID，类型/大小由 provider 校验 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `isSecondOperate` | Switch/Slider；布尔开关或目录数值，不从名称猜范围 | boolean；required=是；显式默认 false/true 来自 chunk，不得 undefined |
| `modelId` | Select/RadioCards；选项来自 chunk/模型目录，未知即禁用 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `modelTabType` | 模特类型页签；切换只改变模特候选与相关默认配置 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `outputNum` | InputNumber/Slider；整数，范围由 ToolSpec/provider 目录决定 | integer；required=是；范围取 chunk/模型目录，未加载时禁用；outputNum 默认 1 |
| `productCategory` | 商品分类；分类选择器，影响模板和提示词 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `sceneTabType` | 场景类型页签；切换只改变场景候选，不重置商品图 | 按本行控件自动绑定；类型、必填与取值随所属页面 schema 校验，禁止自由拼接 |
| `targetMaskUrl` | MaskEditor 导出 PNG；须与原图同尺寸 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `targetOriginUrl` | 目标原始资产地址；选择目标图后自动绑定，只读 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |
| `targetResultUrl` | 目标处理结果地址；该子任务成功后自动写入 | string(URL)；required=是（输出/结果字段除外）；HTTPS、上传后资产 ID、签名 URL 15min |

## 8. 本页验收

1. 首屏能看到并操作本页独有区域与控件，不是通用任务卡片；上述全部主流程可实际走通。
2. 逐项验证第 3 节联动；源图替换、Tab 切换、数量/语言/比例变化不会串改无关状态。
3. 上传失败、生成失败、部分失败、刷新恢复均按第 5 节执行；结果与提交快照一致。
4. 1920/1440/1024/768/390px 下无关键控件消失；深色模式、键盘操作和移动端主要流程可用。

## 9. 原站实测文案摘录

- 上传穿戴商品
- 💡 以模特穿戴效果图作为商品图，会为AI提供更好的作图参考
- 图片规则
- 上传商品图
- 从本地上传
- 从作品库选择
- 从商品库选择
- 10M以内，384*384 ~ 4096*4096
- 或试试这些
- 选择商品品类
- 选择商品品类
- 穿戴的商品品类
- 选择穿戴模特
- 选择穿戴模特
- 穿戴的部位与模特参考
- 选择生成张数
- 1
- 2
- 3
- 4
- Tips：为您的穿戴商品选择与原图角度、部位与画面占比相近的模特参考，生成的效果更好哦！
- 立即生成
- (40算力)
- 生成结果
- 优秀案例
- 历史记录
- 选择穿戴区域，上传穿戴物品，快速将物品穿戴上身生成特写图
- 上传穿戴物品
- 选择参考图
- 生成结果
- 一键做同款
- 第一步：选择示例图或上传模特穿戴商品图片
- 我是高手，不再提醒

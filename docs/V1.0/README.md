# 无限画布 × LinkFox 功能复刻｜V1.0 文档中心

本目录是 **39 个图片/视频工具复刻的 V1.0 正式基线**。功能以独立工具页实现，不新增画布节点；业务编排放在前端，复用无限画布现有模型、上传、任务和本地资产能力。

## 验收结论（V1.0 收口）

> **39 工具 × 六维 = 234 个单元：233 PASS，1 PARTIAL（`VIDEO_TRANSLATION.F`），0 FAIL。**
> 唯一非全绿项受上游渠道能力限制（未开通 `SEED_V25` 视频翻译模型），代码侧已就绪，换 key 即可验证。详见 **[V1.0 验收收口报告](./03-acceptance-closeout-v1.0.md)**。

## 阅读顺序

1. **[V1.0 正式复刻方案](./01-replica-plan-v1.0.md)**  
   范围、39 工具契约、五类 Prompt 策略、模型参数、实施排期、验收标准、风险与取证边界。
2. **[V1.0 架构蓝图](./02-architecture-blueprint.md)**  
   真实代码落点、模块边界、数据结构、任务状态机、恢复机制、39 工具适配器实现矩阵。
3. **[资产分册索引](./assets/README.md)**  
   16 类资产各自独立成册，每册均标注**应用位置、使用方式、边界与原始数据源**。
4. **[五类导航与 39 工具研发包](./plan_linkfox_navigation/README.md)**  
   PRD、逐工具 UI、技术方案、测试、验收、51 个实施 TASK、原站 DOM/JS 证据与共享规格矩阵。

## 资产速查

| 资产 | 分册 | 主要用途 |
|---|---|---|
| 官方案例 | [01-case-library](./assets/01-case-library.md) | 示例、黄金样本、A/B 验收 |
| 样式库 | [02-style-library](./assets/02-style-library.md) | 样式表单、参考图与运行时数据 |
| 服务端场景 Prompt | [03-scene-prompts](./assets/03-scene-prompt-pool.md) | B 类模板引擎 |
| 场景矩阵 | [04-scene-matrix](./assets/04-scene-matrix.md) | `sceneType × num × ratio` 控件 |
| A+ / 套图模板 | [05-aplus-scene-templates](./assets/05-aplus-scene-templates.md) | C 类槽位模板，共 77 条 |
| 蒙版 | [06-mask-assets](./assets/06-mask-assets.md) | D 类局部编辑，878 个唯一 URL |
| 首帧 / 模特参考图 | [07-first-frame-assets](./assets/07-model-first-frame-assets.md) | 模特、换装、视频首帧 |
| 模型能力 | [08-model-catalog](./assets/08-model-catalog.md) | 模型选择、比例/分辨率联动 |
| 工具提交契约 | [09-tool-schemas](./assets/09-tool-schemas.md) | 39 个 `ToolSpec` 与适配器 |
| 类型枚举 | [10-type-enum](./assets/10-make-type-enum.md) | 79 个 makeType 对照 |
| Prompt 原子 | [11-prompt-atoms](./assets/11-prompt-atoms.md) | 正负面词与姿态修饰 |
| 原文案原料 | [12-example-prompt-text](./assets/12-example-prompt-raw.md) | 示例文案参考，不作模板全集 |
| 提示词市场 | [13-prompt-market](./assets/13-prompt-market-metadata.md) | 仅作示例库参考，不是内部 Prompt |
| UI 文案 | [14-ui-labels](./assets/14-tool-ui-labels.md) | 中文界面与 i18n 词条 |
| 接口证据 | [15-api-endpoints](./assets/15-endpoint-catalog.md) | 逆向审计与契约追溯 |
| 加解密样本 | [16-protocol-and-capture-samples](./assets/16-protocol-and-capture-samples.md) | 取证回归，不进入产品运行时 |

## 关键基线数字

- **39** 个目标工具、**79** 个已识别 makeType、**39** 份提交契约。
- **584** 条案例、**2029** 条样式、**1153** 条服务端场景 Prompt。
- **77** 条完整 A+/套图模板、**878** 个唯一蒙版 URL、**535** 个首帧参考 URL。
- **24** 个去重模型；图片 91 条、视频 78 条工具→模型映射。
- 五类实现：**A=11、B=3、C=2、D=4、E=19**。

> V1.0 文档是复刻开发基线，不代表功能已经编码或通过真实生成验收。发布前必须执行正式方案第 10 章的逐工具 A/B、错误处理、恢复和资产入库测试。

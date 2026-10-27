# V1.0 爬取资产分册索引

> 本目录把每类资产拆成独立 Markdown，并明确它在复刻架构中的应用位置。JSON/GZ 原始数据仍保留在 `../../analysis/assets/linkfox/`；MD 用于阅读、评审与实现对照。

## 分册总览

| 分册 | 原始来源 | 数据范围 | 应用位置 |
|---|---|---|---|
| [资产 01｜官方案例库](./01-case-library.md) | `make_cases.json.gz` | 584 条案例，189 条含非空 prompt | 黄金样本、工具页示例、A/B 验收基准；实现 `ExampleGallery` 与验收数据集 |
| [资产 02｜样式与场景条目库](./02-style-library.md) | `style_library.json.gz` | 2029 条样式条目 | 工具页样式选择器、场景缩略图、prompt/蒙版/模特图的联合索引 |
| [资产 03｜服务端场景 Prompt 池](./03-scene-prompt-pool.md) | `scene_prompts_pool.json` | 1153 条去重 prompt，覆盖 6 个 type | B 类工具的模板引擎；也作为 A/C 类工具的候选风格库 |
| [资产 04｜场景编排矩阵实例](./04-scene-matrix.md) | `make_cases.json.gz` | 93 条真实 configData 实例 | 套图/穿搭批量编排器：场景勾选、每场景数量、主图与 A+ 配置 |
| [资产 05｜A+ 与套图槽位模板](./05-aplus-scene-templates.md) | `aplus_style_templates.json` | 77 条完整模板 | C 类工具的模板选择与槽位填充；`TemplateComposer` 的直接输入 |
| [资产 06｜蒙版资产](./06-mask-assets.md) | `style_library.json.gz` | 878 个唯一蒙版 URL，分布在 728 个样式条目 | 局部重绘、换商品、换装、服装区域选择；`MaskSelector` 与本地分割校准 |
| [资产 07｜首帧与模特参考图](./07-model-first-frame-assets.md) | `style_library.json.gz` | 535 条首帧/模特参考图 | 换装、穿搭、姿势/首帧参考；多图输入组合器 |
| [资产 08｜模型能力与工具映射](./08-model-catalog.md) | `models_catalog.json` | 24 个去重模型，169 条工具映射 | 模型选择器、参数裁剪、能力路由与原站成本参考 |
| [资产 09｜39 工具提交契约](./09-tool-schemas.md) | `schema_final.json / schema_clean.json / tool_types_and_coverage.json` | 39 个工具契约 | `ToolSpec` 注册表、动态表单、zod 校验、`buildRequest` 请求构造 |
| [资产 10｜makeType 权威枚举](./10-make-type-enum.md) | `enum_maketype.json` | 79 个枚举，其中 39 个属于复刻范围 | 原始数据阅读、type 对照、防止 `biz/type` 混用 |
| [资产 11｜Prompt 原子片段](./11-prompt-atoms.md) | `prompt_atoms.json` | 11 条原子 prompt | 姿势/视角/体型/环境片段库；局部工具模板组装 |
| [资产 12｜Prompt 相关原文原料](./12-example-prompt-raw.md) | `example_prompts_raw.json` | 277 条原文，来自 81 个 chunk | 逆向佐证、界面文案参考、模板片段筛选；不是直接模板库 |
| [资产 13｜提示词市场元数据（非工具内部 Prompt）](./13-prompt-market-metadata.md) | `prompt_library_179.json` | 179 条市场条目，14 个原始分组 | 仅作可选提示词市场/分类 UI 参考；不参与 39 工具生成链路 |
| [资产 14｜工具 UI 文案与标签](./14-tool-ui-labels.md) | `tool_ui_labels.json` | 14 组 chunk 文案 | 独立工具页标题、说明、表单标签与中英 i18n 对照 |
| [资产 15｜整站接口目录](./15-endpoint-catalog.md) | `endpoints_526.txt` | 526 行原始目录 | 接口回归检查、数据血缘与范围排除依据；不是开发任务清单 |
| [资产 16｜协议、加解密与实抓样本](./16-protocol-and-capture-samples.md) | `create_plain.txt / create_cipher_sample.json / decrypt_linkfox.py / create_payload_product_suite.json / sale_video_plain.json / relay.py / relay2.py` | 2 组实抓载荷 + 1 组密文样本 + 解密/转发脚本 | 取证回归与契约校验；不进入 V1.0 产品运行时 |

## 资产到运行时的映射

```text
案例库 01 ───────────────→ 示例画廊 / A-B 验收
样式库 02 ──┬────────────→ 样式选择器
场景 Prompt 03 ──────────┤
A+ 模板 05 ──────────────┼→ TemplateComposer → 模型适配器
Prompt 原子 11 ──────────┘
场景矩阵 04 ─────────────→ BatchPlanner → 子任务
蒙版 06 / 首帧图 07 ─────→ 输入资产组合器
模型目录 08 ─────────────→ ModelRegistry / 参数裁剪
工具契约 09 + 枚举 10 ───→ ToolRegistry / 动态表单 / buildRequest
UI 文案 14 ──────────────→ i18n / 工具页
接口目录 15 + 协议 16 ───→ 仅取证与回归，不进产品运行时
原文原料 12 / 市场元数据 13 → 参考资产，需筛选，不等于内部 Prompt
```

## 数据真实性说明

- 案例、样式、模型、契约等数字均由原始 JSON/GZ 在本次生成时重新统计。
- `prompt_library_179.json` 已勘误为提示词市场元数据；不能用于证明工具内部 prompt 覆盖。
- 未把原站签名 URL 转存为本地图片；带过期参数的 URL 可能失效，实现阶段应重新获取或仅使用长期 `file-ai` 资源。

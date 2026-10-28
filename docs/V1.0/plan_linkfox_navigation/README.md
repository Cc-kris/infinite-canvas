# 五类导航与 39 工具｜研发文档包

状态：**文档交付，本轮未修改代码**。正式阅读顺序：

1. [PRD](prd.md)：产品范围、15 条全局需求、39 个逐工具需求。
2. [UI Brief](ui_brief.md)：布局/组件/交互/配色/响应式，39 个逐页规格。
3. [技术方案](technical_design.md)：路由、ToolSpec、组件、请求、任务、恢复、39 个 adapter 设计。
4. [39 页逐页规格](page-specs/README.md)：每页独立事实源，含真实控件、区域、状态联动、主流程、失败恢复、字段表与验收。
5. [39 工具唯一矩阵](tool-matrix.md)：五类归属、canonical route、原站/补充关系、批量引用。
6. [测试用例](test_cases.md)：64 条计划用例；当前未执行。
7. [验收方案](acceptance.md)：64 条验收项；产品功能均待实施。
8. [任务清单](task_list.md)：细粒度 TASK、依赖、影响文件、回滚边界。
9. [文档审核](document_review.md)：独立专家逐轮结论。
10. [共享规格](tool_specs.json) / [自动校验报告](document_validation.json)。

## 关键口径

- 39 个工具各有唯一主分类；“批量生图”引用 12 个适用工具做批量编排，不虚构第 40 个工具。
- 30 个类型能在原站 workbench 菜单配置找到关系，9 个标为补充关系；不能把推断写成原站事实。
- 原站另有 `SMART_REPAIR`、`MATTING`、`IMAGE_REPLICATION` 等非 39 schema 类型，不挤入本矩阵。
- `fields_clean` 是静态抽取下限，动态枚举/必填规则需从 chunk 与模型目录核实；未知能力必须阻断而非静默丢参。

## 证据

[39 页逐页规格](page-specs/README.md)与[2026-10-28 页面证据索引](evidence/page-dom-20261028/README.md)为本轮事实源。30 个 original 中 28 个有工作区证据（色差修复以正确工作区 URL 归档）、2 个当前权限重定向；9 个补充工具及受限工具使用 chunk/schema 设计依据，不伪称真实页面实测。

[原站菜单 JS](evidence/workbench-0vHvVyx6.js)、[商品套图 DOM](evidence/category_product_suite.json)、[智能修图 DOM](evidence/linkfox_tool_dom.json)、[AI视频 DOM](evidence/category_ai_video.json)、[批量生图 DOM](evidence/category_batch_generate.json)、[商品图设计 DOM](evidence/category_designer.json)。`.json` DOM 文件是浏览器返回的 JavaScript 对象文本，应以 `ast.literal_eval` 安全读取，不是标准 JSON。

## 使用边界

本包是后续编码基线，不证明导航、页面或真实生成已经实现。任何发布声明必须满足验收方案的全部证据门禁。

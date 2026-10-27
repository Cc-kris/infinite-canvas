# 产品/UI 复审 R2（仅关闭 R1 条件）

日期：2026-10-27｜角色：独立产品 + UI 复审｜范围：只核 R1 的通过条件，不扩展需求，不改代码和原稿。

## 读取与核验方法

- 读取：`review_product_ui_r1.md`、`tool-matrix.md`、`ui_brief.md`、`prd.md`、`document_validation.json`，并用 `evidence/workbench-0vHvVyx6.js` 做交叉核验。
- 用脚本抽取 JS 里所有 `label…path:/draw/…drawType:P.X` 菜单项，得到 draw 菜单 drawType 集合，再和矩阵"关系"列逐行比对。
- 用脚本切分 ui_brief 的 39 个 UI-T 段落，逐段检查布局、组件、交互、响应式、证据边界。
- 实测 sha256：prd.md、ui_brief.md、tool_specs.json 与 `document_validation.json` 记录一致（文档未在校验后被改动）。

## 逐项结论

### C1｜5 个 supplemental 是否被误标（R1 M1–M5）：已关闭

- 矩阵 39 行与 draw 菜单 drawType 集合对比，零偏差：30 个"原站"都在 draw 菜单里有对应 drawType；9 个"补充"都没有。
- AI_POSE_GENERATOR、FISSION_LINK、NEW_DESIGNER、PRODUCT_MARKET_MATERIAL、VIDEO_CONCAT 都没有任何 `drawType:P.X` 菜单项。它们在 JS 里出现的位置分别是：工具类型集合数组、推荐卡配置（`recommend_fun_*`）、历史记录筛选参数（`/draw/history?type=…VIDEO_CONCAT…`）、批量功能卡数组。
- VIDEO_CONCAT 在"视频剪辑"菜单项里只作为图标 `U.VIDEO_CONCAT` 出现，这个菜单项的 drawType 是 `MOLI_VIDEO_EDIT`。文档写明了这一点，并要求两者不得混同。
- 结论：R1 怀疑的误标不存在，"补充"标注正确。

### C2｜其他 JS 引用是否有语义说明（R1 条件 2）：已关闭

- tool-matrix.md 开头新增了"证据语义"：original 只表示 type 出现在 draw 侧栏数组；一级分类归属是本项目的 canonical 决策；推荐、历史筛选、类型集合中的 JS 引用不等于菜单证据。
- ui_brief 的 39 段每段都有"证据边界"。5 个有争议的类型各自写明了引用出处（类型集合 / 分享 / 推荐 / 创建设计宿主 path 不带 drawType / MOLI_VIDEO_EDIT 区分）。
- prd.md 中 9 个补充工具都标注"补充关系（原站五类未直接给出）"，口径和矩阵、README 一致。
- 观察项（不阻断）：PRODUCT_MARKET_MATERIAL 还出现在批量功能卡数组里（title 为"商品套图"，qrcodeUrl 为 batch_product_material）。UI-T32 只概括为"推荐/工具类型相关配置"，没有点出"批量卡片"这层语境。这不影响"非 draw 菜单"的结论，可以在实施时顺手补一句。

### C3｜39 页响应式是否按布局细化（R1 N1）：已关闭

- R1 指出 39 段响应式逐字相同。现在已经改成按布局族区分，每段使用的响应式和它的布局族一一对应：
  - 视频工作区 T34–T39：播放器置上、时间线全宽；≤767px 按上传/分镜/播放分步，禁止把多轨压成小图标。
  - 设计器宿主 T31：设计器占满内容区，图层/属性进 Drawer，画布手势不劫持页面返回。
  - 双对象合成 T16：双图上下排列；≤767px 分 Tab，两张缩略图持续可见。
  - 蒙版/修复 T07/08/12/13/14：编辑器置上，工具条横滑，支持触控涂抹。
  - 坐标编辑 T06/T10、POD 图层 T22/T24、文字 T23/T29、套图 T01/02/32、试衣 T19/21/27/30、模特姿态 T18/20/26、场景 T15/17/28/33、翻译 T04、增强/提取 T05/11/25、色彩 T03/09 也各自有对应写法。
- 观察项（不阻断）：T33 场景迁移在 PRD 里是"商品图 + 风格参考图"双输入，但套用了场景族的响应式，没有写双输入的堆叠顺序。T03 套图换色的手风琴分组写了"换色/场景/文案"，其中"场景/文案"对这个工具来说偏泛。

### C4｜39 页的布局和组件是否仍完整：已关闭

- ui_brief 共 39 个 UI-T 段落，每段都有布局、组件、核心交互、响应式、证据边界，没有缺项。`document_validation.json` 中 `ui_brief.md_39_sections`、`ui_brief.md_all_ids`、`ui_layout_component_interaction_color` 都是 true。
- 组件仍是可实现的具体组件（ToolPageHeader、AssetUploader、MaskEditor、VideoTimeline、DesignerHost 等），字段清单还在。R1 的差异化结论没有因为本轮修订而退化。

## 范围外说明

`document_validation.json` 的总体 status 是 FAIL，唯一失败项是 `no_task_over_200`，属于 task_list 的任务粒度问题，归技术/测试复审线处理，不在本次产品/UI 条件范围内，不影响本结论。其余 13 项检查都是 true，`code_modified=false`。

## 汇总

| R1 条件 | 状态 |
|---|---|
| C1 5 个 supplemental 关系核实 | 已关闭 |
| C2 JS 非菜单引用语义说明 | 已关闭 |
| C3 响应式按布局细化 | 已关闭 |
| C4 39 页布局/组件完整 | 已关闭 |

未关闭：0。观察项 2 条（UI-T32 批量卡语境；T33/T03 响应式措辞），都不阻断。

VERDICT: PASS


> 主会话补注：报告写作时读取的是修订前校验快照；随后 `validate_documents.py` 已按任务清单的 350 行上限修正并实跑，最新 `document_validation.json` 为 PASS。该补注不改变独立 R2 的产品/UI 结论。

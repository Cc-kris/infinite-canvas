# D19B｜design19 后 9 工具视觉终验笔记（2026-10-29）

## 0. 范围确认（以 registry design19 列表为准）

registry `product-design` 共 19 个工具（index 15–33）。A 组覆盖前 10（index 15–24，
`evidence/design19-visual-parity-20261029/`），本组负责**后 9**（index 25–33）：

| idx | id | 原站 URL（采集用） | 本地路由 |
|---|---|---|---|
|25|PRINT_EXTRACT|/draw/print-extract|/tools/product-design/print-extract|
|26|AI_POSE_GENERATOR|/draw/ai-posture|/tools/product-design/ai-pose-generator|
|27|AI_DRESSING_XSY|/draw/ai-dressing|/tools/product-design/ai-dressing-xsy|
|28|FISSION_LINK|/draw/product-scene?type=2|/tools/product-design/fission-link|
|29|IMAGE_TEXT_EDIT|/draw/designer-home|/tools/product-design/image-text-edit|
|30|MATERIAL_UPPER_BODY|/draw/clothing-image-suite|/tools/product-design/material-upper-body|
|31|NEW_DESIGNER|/draw/designer-home|/tools/product-design/new-designer|
|32|PRODUCT_MARKET_MATERIAL|/draw/product-image-suite?batchType=PRODUCT_MATERIAL|/tools/product-design/product-market-material|
|33|SCENE_TRANSFER|/draw/product-scene?type=2|/tools/product-design/scene-transfer|

采集口径：viewport 1908×781、默认未上传态；证据
`evidence/design19b-visual-parity-20261029/{real,local}/<ID>/{shot.jpg,shot-full.jpg,form.json,text.txt}`，
采集器 `tools/capture_design19b.py`（`--side local|real|both`）。2026-10-29 已重采 local 侧 9 个。

## 1. 原站真实页面类型（关键事实，2026-10-29 实测 bodyText）

- **工具页**（单页表单 + 结果区）：PRINT_EXTRACT、AI_POSE_GENERATOR（=姿势裂变同页 ai-posture）、
  AI_DRESSING_XSY（ai-dressing）、FISSION_LINK 与 SCENE_TRANSFER（=product-scene?type=2 同页）。
- **套图页**（整页套图编排：商品信息/品牌合规/模型/分辨率/品质/主副图/A+图/算力合计）：
  MATERIAL_UPPER_BODY（clothing-image-suite）、PRODUCT_MARKET_MATERIAL（product-image-suite?batchType=PRODUCT_MATERIAL）。
- **设计器首页**（上传商品图 + 模板推荐/类型·品类·版式筛选 + 管理水印分组）：
  IMAGE_TEXT_EDIT、NEW_DESIGNER —— 二者原站 URL 都落到 designer-home，**不存在独立工具页**。

推论：IMAGE_TEXT_EDIT / NEW_DESIGNER 的视觉对标对象是**设计器首页**，不是文字编辑/设计器工作台；
套图两工具的真实页面是整套“套图编排表单”，与本地“上装换料/商品营销素材”字段模型不同。

## 2. 原站共用骨架（9 页一致）

- 页面卡片：x=190..1898、y=110..781（1728×671），body `#F5F7FA`，卡片 1px `rgba(0,0,0,.08)` 圆角 8。
- 左栏：300px 白底表单列，内边距 16，控件区 268 宽。
- 右栏：`#EDEFF5`；顶部 42px 白 header，左 `生成结果`（选中 `rgb(114,60,249)`）/中间或右侧 `优秀案例`、`历史记录`（14px）。
- 主按钮：品牌紫 `rgb(114,60,249)`，高 32，圆角 6–8，文案带算力 `立即生成（40算力）` / `开始生成（600算力）`。
- 空态卡：白底 460×300、圆角 12，标题 20px + 副标 16px `rgba(0,0,0,.6)`。
- 案例区：`上传商品/服装图 → 生成结果 → 一键做同款` 卡片，底部 1/2/3 分页；无真实案例时按规格用中性占位。
- 原站无「工具标题/面包屑/副标题」头部，表单从 y≈141 直接开始。

## 3. 本地当前差异（2026-10-29 重采 local 后实测）

1. 每个工具页顶部多出一条头部（面包屑 `/tools/product-design/...` + 标题 + 「补充」徽标 + 副标题），
   原站没有 → 需对这些 workspace 用 `ToolShell immersive`（组件已支持）去掉。
2. 右侧多出「连接本地 Agent（Claude Code / Codex / Galley）」面板，原站无 → 共享外壳问题，
   本组不改 shell，记录为共享差异（归属 B12/外壳组）。
3. 左栏工具列表带「补充」徽标；原站导航是 商品图/我的商品/场景参考图/…，无「补充」字样。
4. 右栏缺少原站的 42px header + `生成结果 / 优秀案例 / 历史记录` 三页签结构（部分工具只有结果+历史）。
5. 文案与字段：FISSION_LINK 缺 `背景相似度 / 生图模型（写实·简约·智能）/ 设置生成尺寸`；
   AI_POSE_GENERATOR 本地仍是「提示词+场景列表」工作台，与原站「上传模特姿势图 + 姿势库 + 张数 + 40算力」不符。
6. UI 文案残留 `LinkFox`（如 NEW_DESIGNER「对应 LinkFox 设计器『背景』面板」）→ 必须去品牌。

## 4. 结论口径

- 结构可 1:1 的工具（单页表单型）：目标 PASS（左栏 300 + 右栏 EDEFF5 + 三页签 + 算力 CTA + 空态/案例）。
- 原站是「套图整页/设计器首页」的 4 个（IMAGE_TEXT_EDIT、NEW_DESIGNER、MATERIAL_UPPER_BODY、
  PRODUCT_MARKET_MATERIAL）：视觉骨架对齐，字段模型不同 → **PARTIAL**，逐项列出未对齐字段。
- 原站无案例数据的：案例区按规格中性占位 = N/A（不伪造真实案例）。

## 2026-10-29 过程记录（补充）

### 截图黑帧（已解决）
现象：macOS Chrome 对被遮挡/后台标签 `Page.captureScreenshot` 返回纯黑帧（local 3 张、后续复现 2 张）。
定位：同 driver 先 `Page.bringToFront` 再截 → 画面正常；DOM 亮度探测一直正常，说明非页面暗色。
修复：`tools/capture_parity.py::save_shot` 改为「bringToFront → sleep(1.2+attempt*1.2) → 截图 → PIL 亮度校验(<80 视为黑帧) → 最多 4 次重试」。
结果：evidence/design19b-visual-parity-20261029 下 local/real 共 18 张截图全部有效（mean 213–245）。

### 已落地的视觉对齐
1. `tool-page.tsx` IMMERSIVE_TOOL_IDS 补入后 9 个工具 ID（PRINT_EXTRACT/AI_POSE_GENERATOR/AI_DRESSING_XSY/FISSION_LINK/IMAGE_TEXT_EDIT/MATERIAL_UPPER_BODY/NEW_DESIGNER/PRODUCT_MARKET_MATERIAL/SCENE_TRANSFER）→ 去掉 dev 面包屑+`/tools/...` 路由行，左栏 y 对齐原站 y=120。
2. `workspaces/scene.tsx` FISSION_LINK：根 `flex flex-col gap-2.5 lg:flex-row`；左栏 `w-[300px] bg-white rounded-lg p-4`；右栏 `flex-1 bg-[#EDEFF5]` + 42px 白页签栏（生成结果/优秀案例/历史记录，历史接 ToolTaskHistory）。
3. `registry/fission-link.ts` CTA → 「立即生成 (40算力)」/「立即生成 N 张 (40算力/张)」，`adapters/fission-link.test.ts` 断言同步；`bun test` 22 pass。

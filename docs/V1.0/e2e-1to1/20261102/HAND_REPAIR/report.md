# HAND_REPAIR｜手部修复 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/hand-repair （标题「手部修复 - LinkFox」，已登录、可访问、无重定向；左 rail 标「下架」）
- 本地 URL：http://127.0.0.1:3000/tools/smart-edit/hand-repair （标题「无限画布」）
- 视口：双端 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 1600/1000，DPR=1；未固定时原站为 1920×849，所有 rect 在固定后重测）
- 验收时间：2026-11-02；只读验收：未改源码，未点原站生成/购买/删除，未提交生成，未操作既有用户标签。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/local.png` |
| 原站 · 性别与年龄 / 张数 / 笔刷 交互后 | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/original-interaction.png` |
| 原站 · 「从作品库选择」弹层 | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/original-works-picker.png` |
| 本地 · 人物类型/张数/笔刷交互后 | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/local-interaction.png` |
| 本地 · 历史记录 Tab | `docs/V1.0/e2e-1to1/20261102/HAND_REPAIR/local-history-tab.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | FAIL | 双端截图齐备；原站是「画布内涂抹工具条（画笔/大小/像素/重置-撤销-重做）+ 240px 窄栏（性别与年龄 + 生成张数）」，本地是「页头 + 徽标行 + 自造 chip 条 + 1044/300 两栏 + 历史任务列表」，视觉结构差异明显（见差异 3–9） |
| 布局 | FAIL | 原站「画布 840(含工具条) + 配置 240 @x1040 + 结果 300 @x1290」三列；本地「画布 1044 + 配置 300 @x1268」两列，结果 Tab 在画布下方（@225,594），无独立结果列（见差异 1–2） |
| 交互 | PASS | 双端各实测 ≥5 个零费用控件（性别与年龄 4 项、生成张数 1–4、笔刷大小、上传入口、作品库入口、生成结果/历史记录 Tab；原站另有重置/撤销/重做），均有前后差异证据 |
| 功能 | REAL_PROVIDER（引用既有真实证据；结果为 PARTIAL） | 本轮未提交。`web/src/features/tools/adapters/hand-repair.ts:225` → `useToolTaskStore.getState().runTool()` → 真实 images/edits；既有真实证据 `evidence/real-acceptance/HAND_REPAIR/result.json`（生成 PASS：真实上游 200、产物 1024×1024、resultDiffersFromSource=true；但 verdict 为 **PARTIAL**，下载/存库/发画布三个结果动作当轮未取得真实点击证据） |

## 双端实测数据

原站（1600×1000）：
- 左 rail 180×890 @0,110；「即将下架」分组下「手部修复」+「下架」标
- 画布区 `_drawContent_` @190,120 宽 840；**画布顶部涂抹工具条** `_header_k8cna_8` 838×40 @191,121，内含 `.ant-space` 367×28 @211,127：「🖌 画笔 · 大小：{spinbutton 21×22 @327,130} · 像素 · 重置(disabled) 46×28 @420,127 · 撤销(disabled) 46×28 @476,127 · 重做(disabled) 46×28 @532,127」——**重置/撤销/重做在空态即 disabled**
- 空态卡 @339,~322：标题「手部修复」+ 副文案「上传图片，涂抹畸形的手部区域，即可对其畸形矫正与还原」+ `上传图片` 108×32 @493,713 + `从作品库选择` 116×32 @611,713
- **配置栏 240px @x1040**（`_drawOptions_`，240×870），文案精确为两段：
  - `性别与年龄`：`成年男性` 82×26 @1056,162 / `成年女性` 82×26 @1148,162 / `男孩` 58×26 @1056,198 / `女孩` 58×26 @1124,198（`_imgCountItem_1q7u4_65`，**默认无任何项 active**，边框 rgb(204,204,204)）
  - `生成张数`：`1` 40×26 @1056,282 / `2` 41×26 @1106,282 / `3` 42×26 @1157,282 / `4` 42×26 @1208,282（`_imgCountItem_1rhd3_12`，**默认选中「4」**，`_active_1rhd3_30`，字色 #723CF9）
- 提交按钮 `立即生成` 240×32 @1040,958（空态下 **enabled**）+ `限免` 标
- **结果栏 300px @x1290**：Tab「生成结果」@1303,130 + 右上「历史记录」外链 `href=/draw/history?type=31`；空态「暂无生成结果图」
- 配置栏内 DOM 控件：checkbox 0 / select 0 / switch 0 / slider 0 / `input[type=color]` 0

本地（1600×1000）：
- header 56 + 左 rail 180；面包屑「智能修图 / 手部修复」@200,68；H1 16px；route `/tools/smart-edit/hand-repair`
- 自造徽标行 @200,181：`手部修复`(14px) + `原站即将下架`（琥珀色 badge，data-testid=hand-repair-deprecated）+ `智能修图 · 最多 4 张`；副文案「上传图片，涂抹畸形的手部区域，即可对其畸形矫正与还原」；下方「请先上传图片，再立即生成」；右上 `立即生成` 100×34 @1436,196（disabled）+ `限免` 红标
- 自造 **同类工具 chip 条** @212,~296：图片编辑 / 局部重绘 / 局部消除 / 一键换色 / 图片裁剪 / 质量提升 / 商品精修 / 图像修复 / 色差修复 / 印花修复 / 抠图工具 / 精细抠图 / 批量抠图 / 企业功能 / 即将下架 / **手部修复（当前）** / 下架
- 主体 `grid grid-cols-[1044px_300px]` @212,341（1356×460）：
  - 左 1044：虚线涂抹区（高 ~250）+ **画布下方**工具条 y528：`画笔` + `大小：` + range（默认 35）+ `像素` + `撤销` 58×28 @519,528 / `重做` 58×28 @585,528 / `重置` 58×28 @651,528（三者默认 disabled）+ 下方结果 Tab `生成结果` @225,594 / `历史记录` @297,594 + 「暂无生成结果图」
  - 右 300 @x1268：`上传图片` 卡（`上传图片` 56×22 @1281,354 + `从本地上传` 210×24 @1294,412 + `从作品库选择` 100×24 @1294,444 **disabled** `title=资产库暂时没有可用图片`）→ `性别与年龄` 2×2 按钮 144×36（成年男性 @1281,559 / 成年女性 @1431,559 / 男孩 @1281,601 / 女孩 @1431,601）→ `生成张数` 1–4 各 32×32 @1281/1317/1353/1389,703 + 「预计输出 3 张（每张都是独立真实请求）」
- 页面下方：`历史任务 1 条`（2026-10-29 17:01 已完成，prompt 为英文 `Repair the hand anatomy inside the white mask region and…`，模型 `default::gpt-image-2`）

## 逐条差异

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 布局 · 结果区独立列 | P1 | 生成结果 / 历史记录 | 结果区是画布右侧**独立 300px 列**（x1290），首屏并列可见 | 结果 Tab 在**画布下方**（@225,594），结果面板通栏；右侧 300px 列只放配置 | `_drawResult_` 300×870 @1290 vs 本地 Tab @225,594 |
| 2 | 布局 · 配置栏位置与宽度 | P1 | 性别与年龄 / 生成张数 | 240px，位于画布**右侧**（x1040），结果栏之前 | 300px，位于画布**右侧但最外**（x1268），结果栏消失 | 原站 240 vs 本地 300；顺序 画布→配置→结果 vs 画布→配置 |
| 3 | 布局 · 画布涂抹工具条位置 | P0 | 画笔 / 大小 / 像素 / 撤销 / 重做 / 重置 | 工具条在**画布顶部**（y121，`_header_k8cna_8` 838×40），与画布同宽 | 工具条在**画布下方**（y528），紧贴画布底边 | 原站 @191,121；本地 @519,528 |
| 4 | 默认值 | P0 | 生成张数 1/2/3/4 | **默认选中「4」**（`_imgCountItem_1rhd3_12 _active_1rhd3_30`，两次独立加载均为 4） | **默认选中「3」**（实测 aria-pressed 在 3；`HAND_REPAIR_DEFAULT_OUTPUT=1` 但组件初始状态被草稿/默认覆盖为 3） | original 两次 run active=["4"]；本地 @1353,703 aria-pressed=true |
| 5 | 默认值 | P1 | 性别与年龄 | **默认无选中项**（4 项均无 `_active_`，边框 #ccc） | **默认选中「女孩」**（aria-pressed=true；代码默认 `HAND_REPAIR_DEFAULT_PERSON_TYPE="adult-male"`，与渲染不符） | 原站 items 无 active；本地 4 项中「女孩」true |
| 6 | 默认值 | P1 | 立即生成 可用性 | 空态下 `立即生成` **enabled**（点击后由服务端/前端再校验） | 空态下 `立即生成` **disabled**，并常驻「请先上传图片，再立即生成」 | 原站 disabled=false；本地 disabled=true |
| 7 | 视觉 · 提交按钮位置 | P1 | 立即生成 | 固定在配置栏底部 240×32 @1040,958 | 移到页头右上 100×34 @1436,196，与配置栏分离 | 双端 rect |
| 8 | 本地自造 | P1 | 同类工具 chip 条 | 无（左侧 rail 已承担工具导航） | 画布上方 17 个 chip 横条（含当前项高亮 + 「企业功能/即将下架/下架」徽标），占 1 行 | local.png y~296 |
| 9 | 本地自造 | P2 | 「原站即将下架」「智能修图 · 最多 4 张」徽标行 | 无（仅左 rail 有「下架」小标） | 页头两组徽标 + 说明文字 | local.png @200,181 |
| 10 | 视觉 · 空态卡 | P1 | 上传入口 | 画布空态卡内并排 `上传图片` 108×32 + `从作品库选择` 116×32（14px 圆角 6） | 画布空态只有虚线框；上传入口挪到右侧配置列（210×24 + 100×24，12px），空态区无按钮 | original @493,713 vs local @1294,412 |
| 11 | 缺失 | P1 | 从作品库选择 | 可点，打开「我的/历史作图/其他 + / 手部修复 + 标签」弹层 | **disabled**，`title=资产库暂时没有可用图片` | 原站 original-works-picker.png；本地 title 探针 |
| 12 | 布局 · 工具条尺寸 | P2 | 撤销/重做/重置 | 各 46×28，`ant-btn` 描边风格，空态 disabled | 各 58×28，扁平文字按钮，空态 disabled（语义一致） | 原站 @420/@476/@532,127；本地 @519/@585/@651,528 |
| 13 | 布局 · 笔刷大小 | P2 | 大小：35 像素 | `InputNumber` spinbutton 21×22 + 「像素」文案，无滑杆 | `range` 滑杆 + 「大小：」「像素」文案（无数字输入框） | 原站 @327,130 spinbutton；本地 input[type=range] 默认 35 |
| 14 | 本地自造 | P2 | 历史记录双形态 | 历史记录是外链 `/draw/history?type=31` | 既做 Tab（@297,594）又另起「历史任务 1 条」列表（y~876） | 原站 `<a href>`；本地 local-history-tab.png |
| 15 | 缺陷（文案） | P2 | 张数说明 | 无 | 「预计输出 3 张（每张都是独立真实请求）」——默认 3 张与 `HAND_REPAIR_DEFAULT_OUTPUT=1` 不一致，且「独立真实请求」是实现细节外泄到 UI | local.png @1281,730 区 |
| 16 | 本地自造 | P3 | 面包屑 + route 文本 | 无 | 「智能修图 / 手部修复」+「/tools/smart-edit/hand-repair」 | local.png y69/y121 |
| 17 | 视觉 · 品牌色 | — | 选中态 | LinkFox 紫 #723CF9 描边 + 紫字 | 无限画布令牌（深色填充 + 白字，草稿恢复后为浅紫 `bg-primary/10`） | 按项目规范属预期差异，不计缺陷 |
| 18 | 壳层（不计入工具主体） | P3 | 双 11 促销条、算力 350/购买、学习中心、HelpDock、管理水印分组 | 有 | 无 | 双端基线截图 |

## 交互实测记录（零费用控件，双端）

| 控件 | 原站 | 本地 |
|---|---|---|
| 性别与年龄 | 点「成年女性」→ 高亮迁到成年女性；点「男孩」→ 迁到男孩（原站空态切换不触发网络） | 点「成年女性」`aria-pressed` true（「女孩」转 false）；点「女孩」迁回；草稿 `personType:"girl"` |
| 生成张数 | 默认「4」；点「2」→ `_active_` 迁到 2；点「4」→ 迁回 4 | 点「1」→ aria-pressed 迁到 1，说明变「预计输出 1 张」；点「2」→ 变「预计输出 2 张」；草稿 `outputNum:2` |
| 笔刷大小 | spinbutton 35 → 输入 60 + Enter → value 60 | range 35 → 60（input+change 派发），草稿 `brushSize:60` |
| 撤销/重做/重置 | 空态三者均 disabled（未涂抹无可撤销） | 空态三者均 disabled（语义一致） |
| 上传入口 | 「上传图片」弹出 file chooser（multiple=false），已取消未提交 | 「上传图片」可点（210×24） |
| 从作品库选择 | 打开弹层：`我的 / 历史作图 / 其他` + `/ 手部修复` + `标签` + `暂无传过的图` | disabled（「资产库暂时没有可用图片」） |
| 生成结果/历史记录 | 只有「生成结果」Tab；历史记录是外链（未点，避免离开工具） | Tab aria-selected 迁移；历史 Tab 渲染「历史任务 1 条」真实记录 |
| 立即生成 | enabled（未点击，避免消耗算力） | disabled（缺少源图与蒙版） |

## 功能核验（只读源码 + 既有证据）

- 适配器：`web/src/features/tools/adapters/hand-repair.ts:225-229` `run: (input, options) => useToolTaskStore.getState().runTool(input, options)`，走共享 TaskGateway → 真实 images/edits。
- 字段落点（`registry/index.ts:229` HAND_REPAIR fields，makeType 31）：`imageUrl`（源图）/ `maskUrl`（涂抹蒙版，REQUIRED）/ `outputNum`（integer，required）/ `personType`（enum，`enumSource=model-catalog`）/ `imageName`；`outputNum` 的默认在 registry 是 1。
- 蒙版：本地为真实 canvas 像素导出（`rasterizeMask`，画笔/橡皮/羽化/反选），非占位；无蒙版时提交被锁并给出具体原因（「请先在图片上涂抹畸形的手部区域，空蒙版无法生成」）。
- 张数语义：本地按 `outputNum` 拆成 N 个独立真实请求（UI 明说「每张都是独立真实请求」），`progress` 显示「生成中 x/N」——这点比原站（一次提交 N 张）实现更重，但与原站可见行为不冲突，仅文案外泄实现细节（差异 15）。
- 真实上游证据（非本轮）：`evidence/real-acceptance/HAND_REPAIR/result.json` —— `generation.status=PASS`：`POST https://api.cc-ai.xyz/v1/images/edits` 200 / 30093ms，产物 `https://oss-us.dimenoss.com/.../1793199487_….png` 1024×1024、1353583 bytes、sha256 前缀 `3e53cf33`、`resultDiffersFromSource=true`；但 `verdict=PARTIAL`：下载/存储库/发画布三个结果动作当轮 marked「rendered but clicked=false」，未取得真实点击证据。
- 本轮未提交生成（0 算力），故「真实生成」以代码路径 + 引用证据判定 REAL_PROVIDER，结果动作按既有证据标注 PARTIAL。

## 结论

配置栏两段（性别与年龄 4 项 / 生成张数 1–4）与画布涂抹工具条的核心控件集合保留，且原站「下架」状态在本地有显式提示。但存在 3 个 P0/P1 级问题：工具条从画布顶部移到了画布下方、生成张数默认 4→3、性别与年龄默认空→「女孩」；结果区不再是右侧独立列，空态上传入口也从空态卡挪走，「从作品库选择」disabled。**不给 PASS**。

# PRODUCT_REFINE｜商品精修 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/product-refine （标题「商品精修 - LinkFox」，已登录、可访问、无重定向）
- 本地 URL：http://127.0.0.1:3000/tools/smart-edit/product-refine （标题「无限画布」）
- 视口：双端 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 innerWidth/innerHeight = 1600/1000，DPR=1；未固定时原站为 1920×849，所有 rect 均在固定后重测）
- 验收时间：2026-11-02；只读验收：未改源码，未点原站生成/购买/删除，未提交生成，未操作既有用户标签（作品库弹层只读打开，未建/改标签）。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local.png` |
| 原站 · 精修模式切换（整图→去背景→整图） | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/original-interaction.png` |
| 原站 · 「上传图片」file chooser 已弹出（未提交） | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/original-upload-chooser.png` |
| 原站 · 「从作品库选择」弹层（我的/历史作图/其他） | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/original-works-picker.png` |
| 本地 · 精修强度/色彩校正/模式交互后 | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local-interaction.png` |
| 本地 · 精修前/精修后 Tab + 生成结果/历史记录 Tab | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local-tabs.png` |
| 本地 · 历史记录 Tab 内容（1 条真实任务） | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local-history-tab.png` |
| 本地 · 「从资产库选择（63）」展开 | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local-asset-drawer.png` |
| 本地 · 「从作品库选择」点击后（等价于展开资产库 details） | `docs/V1.0/e2e-1to1/20261102/PRODUCT_REFINE/local-works-picker.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | FAIL | 双端截图齐备；上传卡形态、画布空态（示例对比图 vs 4 空格）、自造控件（精修强度/色彩校正）导致视觉结构明显不同（见差异 4–8） |
| 布局 | FAIL | 原站「画布 840 + 配置 240(右侧 x1040) + 结果 300(最右 x1290)」三列同行；本地「配置 300(最左 x200) + 画布 1068」，结果区在画布下方通栏（见差异 1–3） |
| 交互 | PASS | 双端各实测 ≥5 个零费用控件（精修模式、精修强度、色彩校正开关、hex 输入、精修前/精修后 Tab、生成结果/历史记录 Tab、上传入口、作品库入口、资产库 details），均有前后差异证据 |
| 功能 | REAL_PROVIDER（引用既有真实证据） | 本轮未提交（禁付费）。`web/src/features/tools/adapters/product-refine.ts:229` → `gateway.submit()` / `waitForResult()` 走共享 TaskGateway 真实 images 生成；既有真实证据 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/PRODUCT_REFINE/result.json`（verdict PASS：真实 OSS 产物 2048×1488、存入资产回执、发送画布节点） |

## 双端实测数据

原站（1600×1000）：
- 左 rail `aside` 180×890 @0,110；菜单含「图片编辑 / 智能修图 / 局部重绘 / … / 商品精修 / 图像修复 / 色差修复 / 印花修复 / … / 手部修复(下架)」
- 画布区 `_drawContent_` 840×870 @190,120；空态卡 `_emptyWarpper_` 542×467 @339,322，内含「精修前/精修后」对比轮播 542×300（真实示例商品图 + 紫色角标）、标题「商品精修」、副文案「一键提升商品质感 / 改善商品的轮廓、光泽、材质与颜色等」、按钮行 `上传图片` 108×32 @493,732 + `从作品库选择` 116×32 @611,732（圆角 6px、14px）
- **配置栏 240px @x1040**（`_drawOptions_1bm1e_1`，240×870）：区块只有两段 —— ①`精修模式`（`整图精修` 109×32 @1052,162 **默认选中**、字色 #723CF9；`去背景精修` 109×32 @1160,162）+ ②`上传待精修的商品图`（虚线拖拽区 `.ant-upload-wrapper` 216×103 @1052,256，文案「拖拽 或 点击上传 需要修复的图 / 20M以内，jpg/jpeg/png/webp」）+ 底部提示「💡默认生图尺寸规则：原图尺寸≤512px → 放大 4 倍，513~1024px → 放大 2 倍，＞1024px → 原尺寸」
- 提交按钮 `开始精修` 240×32 @1040,958，行内右侧 `限免` 34×19 @1246,958（bg rgb(250,81,81)）
- **结果栏 300px @x1290**（`_drawResult_14inx_1`，300×870）：Tab「生成结果」56×22 @1303,130（唯一 Tab）+ 右上「历史记录」外链 `href=/draw/history?type=56`；空态「暂无生成结果图」
- 配置栏内 DOM 控件统计：checkbox 0、select 0、number/spin 0、switch 0、slider 0 —— 原站该页只有「模式单选 + 上传」，**没有强度、没有颜色校正、没有张数**

本地（1600×1000）：
- 顶部 header 56px；左工具 rail 180；内容区 `main` x209 y166 1374×817；页头三行：面包屑「智能修图 / 商品精修」(@200,68)、H1「商品精修」16px、route 文本「/tools/smart-edit/product-refine」
- 主体 `grid grid-cols-[300px_minmax(0,1fr)]`，实测 `grid-template-columns: 300px 1068px` @200,181
- **配置 300px 在左**（x200..500），自上而下 4 张卡：`一键提升商品质感`(300×268) → `精修强度`(300×117) → `色彩校正`(300×113) → `精修模式`(300×223)
  - 上传卡内含标题「一键提升商品质感」15px + 副文案 12px + `上传图片` 210×24 @222,258（紫底）+ `从作品库选择` 100×24 @222,290 + 拖拽提示 + `20M以内，jpg/jpeg/png/webp`
  - `<details>从资产库选择（63）` 256×16 @222,387
  - `预计输出尺寸：待上传原图 待上传原图`（**同一文案重复两次**）
  - 精修强度：`轻度/标准/强力` 各 46×36（radiogroup，默认「标准」，与代码 `DEFAULT_PRODUCT_REFINE_VALUES.strength="standard"` 一致），下方 hint 随选中项联动
  - 色彩校正：checkbox 13×13 + `目标颜色` color input 36×36 + hex input 144×32（placeholder `#RRGGBB 或 #RRGGBBAA`）
  - 精修模式：`整图精修` 74×36（默认选中）/`去背景精修` 88×36 + 尺寸规则提示 + 2 条校验文案 + `开始精修` 282×32 @209,887（无图时 disabled）+「预计产出 1 张主结果…」
- 右侧 1068px：对比卡 1068×314 @512,181（Tab `精修前`58×30 @521,190 / `精修后`58×30 @583,190 + 4 个空格子 258×258 @521/785/1049/1313,228）；结果卡 1068×325 @512,552（Tab `生成结果`72×32 @512,507 / `历史记录`72×32 @588,507；结果卡内「生成结果 · 已完成 · 共 1 个结果 · 图片 1」+ 结果缩略 + `下载/存入资产/发送画布`）

## 逐条差异

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 布局 · 三段顺序 | P1 | 画布 / 配置 / 结果 | 画布 840 → 配置 **240 @x1040** → 结果 **300 @x1290**，三列同行、同一 y=120 起 | 配置 **300 在最左 @x200** → 画布 1068；结果区落到画布下方通栏（1068 宽） | 原站 `_drawOptions_` 240×870 @1040；`_drawResult_` 300×870 @1290；本地 grid `300px 1068px` @200,181，结果 Tab @512,507 |
| 2 | 布局 · 结果区独立列 | P1 | 生成结果 / 历史记录 | 结果区是画布右侧**独立 300px 列**，首屏与画布并列 | 结果区是画布下方**通栏面板**（1068×325 @512,552），与画布上下堆叠 | original.png / local.png；rect 对比同上 |
| 3 | 布局 · 配置栏宽度 | P2 | 右侧（本地为左侧）配置栏 | 240px（拖拽区 216 宽） | 300px（拖拽区 282 宽、主按钮 282 宽），宽出 25% | `_drawOptions_` 240 vs 本地 300（4 张卡均 300） |
| 4 | 本地自造 | P1 | 精修强度（轻度/标准/强力） | **不存在**（配置栏 checkbox/select/number/switch/slider 全为 0） | 独立 `精修强度` 卡 + 3 个 radiobutton 46×36 + hint 文案 | 原站控件统计全 0；本地 @209,505 |
| 5 | 本地自造 | P1 | 色彩校正（checkbox + ColorPicker + hex） | **不存在**（原站 `color` 字段无对应 UI） | `色彩校正` 卡：checkbox + `<input type=color>` + hex 输入 + 两条校验文案 | 原站控件统计 0；本地 @209,636/659/661 |
| 6 | 视觉 · 画布空态 | P1 | 精修前 / 精修后 | 卡内是**真实示例对比图**（542×300 轮播，多个「精修前/精修后」角标 + 底部 1–4 轮播点） | 卡内是 `精修前/精修后` Tab + **4 个空格子**（258×258，仅有占位小方块），无示例图/无轮播 | original.png 卡内商品对比图；local.png 4 空格子 |
| 7 | 视觉 · 上传入口 | P1 | 上传图片 / 从作品库选择 | 两个按钮**并排**：108×32 + 116×32（14px、圆角 6），位于空态卡内；配置栏另有独立虚线拖拽区 216×103 | 主按钮 `上传图片` **210×24 独占一行**（12px）+ 副按钮 `从作品库选择` 100×24 换行；配置栏内无独立「上传待精修的商品图」区块标题 | 原站 @493,732 / @611,732 h32；本地 @222,258 / @222,290 h24 |
| 8 | 缺失 | P2 | 上传区块标题 | 配置栏有明确区块头「上传待精修的商品图」 | 无该标题，上传并入「一键提升商品质感」卡 | 原站 cfgText 第 4 项；本地卡内只有画布级标题 |
| 9 | 缺失 | P2 | 限免标 | 「开始精修」内右侧红色 `限免` 34×19（#FA5151） | 无 `限免` 标 | 原站 `_free_1kho5_373` @1246,958；本地 text 全文无「限免」 |
| 10 | 缺失 | P2 | 历史记录（外链式） | 右上独立外链 `/draw/history?type=56`，点击离开工具 | 并入 Tab（`历史记录` @588,507），Tab 内是本地任务列表（1 条 2026-10-29 16:53） | 原站 `<a href="/draw/history?type=56">`；本地 Tab aria-selected 迁移 |
| 11 | 本地自造 | P2 | 作品库入口形态 | 「从作品库选择」打开弹层：Tab「我的/历史作图/其他」+ 工具分类「商品精修」+「标签」+「暂无传过的图」 | 「从作品库选择」按钮实际展开页面内 `<details>从资产库选择（63）`（63 个「使用」小格），**无弹层、无标签**；再点一次不收起（需点 summary） | 原站 original-works-picker.png；本地 local-works-picker.png + `details.open=true` 且 `[role=dialog]` 数 0 |
| 12 | 缺陷（文案） | P3 | 预计输出尺寸 | 只有一条尺寸规则提示 | 「预计输出尺寸：」后把「待上传原图」渲染两遍 | 本地 text 数组同段出现两次「待上传原图」 |
| 13 | 本地自造 | P2 | 面包屑 + route 文本 | 无 | 「智能修图 / 商品精修」(@200,68) + `/tools/smart-edit/product-refine` (@200,121) | local.png y69/y121 |
| 14 | 本地自造 | P3 | 左侧「同类工具」rail | 原站 rail 带图标、分组可折叠（箭头）、有「批量生图」入口 | 本地 rail 无图标、分组不可折叠、多出「企业功能 / 即将下架 / 下架」徽标 | 双端基线截图 |
| 15 | 视觉 · 品牌色 | — | 选中态 | LinkFox 紫 #723CF9（文字/描边） | 无限画布令牌（深色填充 + 白字） | 按项目规范属预期差异，不计缺陷 |
| 16 | 壳层（不计入工具主体） | P3 | 双 11 促销条、算力 350/购买、学习中心、用户菜单、HelpDock、管理水印分组浮层 | 有 | 无（改为 我的画布/生图工作台/配置/主题/版本/GitHub） | 双端基线截图 |

## 交互实测记录（零费用控件，双端）

| 控件 | 原站 | 本地 |
|---|---|---|
| 精修模式 | 点 `去背景精修`：`ant-radio-button-wrapper-checked` 由「整图精修」迁到「去背景精修」；再点回「整图精修」恢复（A1/A2） | 点「整图精修」`aria-checked true`，`去背景精修` false（A5）；草稿 `mode` 落盘可刷新恢复 |
| 精修强度 | 不存在 | 点「轻度」→`aria-checked true` 迁到轻度；点「标准」→ 迁回标准（A1/A2），hint 文案同步变化（截图 local-interaction.png） |
| 色彩校正开关 | 不存在 | checkbox true→false→true（A3），关掉后 `colorEnabled` 不再进入校验 |
| hex 输入 | 不存在 | 填 `#FF0000`：input.value 更新，草稿 `color:"#FF0000"`（A4，IndexedDB `tool-draft:v1:PRODUCT_REFINE`） |
| 精修前/精修后 Tab | 画布只有示例轮播（无 Tab） | Tab aria-selected 由 `精修前`→`精修后`（A6） |
| 生成结果/历史记录 Tab | 历史记录是外链（未点，避免离开工具） | `生成结果`⇄`历史记录` aria-selected 迁移；历史 Tab 渲染 1 条真实任务（A7） |
| 上传入口 | 「上传图片」弹出 file chooser（multiple=false），已取消未提交 | 「上传图片」弹出 file chooser（multiple=false），已取消未提交 |
| 作品库入口 | 打开弹层（我的/历史作图/其他 + 标签） | 展开页面内 details（63 条资产 + 「使用」按钮） |
| 资产库 details | 无此区块 | 展开/收起正常（A8 open=true，A9 open=false） |

## 功能核验（只读源码 + 既有证据）

- 适配器：`web/src/features/tools/adapters/product-refine.ts:197-250`，`gateway.submit(input)` → `gateway.waitForResult(id)` / `gateway.retry(taskId)`，走共享 TaskGateway → 真实 images 生成（provider 由用户模型配置决定）。
- 真实字段映射：`isRmBg` 由精修模式显式布尔下发（`PRODUCT_REFINE_MODES.cutout.isRmBg=true`），`ratio`/`imageOutputLength` 由自动尺寸规则 `computeProductRefineOutput()` 推导，`color` 仅在开启色彩校正且 hex 合法时进入请求（`registry/index.ts:184` fields 含 `color/isRmBg/ratio/imageOutputLength`）。
- 自动尺寸规则与本轮实测一致：原站/本地均展示「≤512→×4，513–1024→×2，＞1024 原尺寸」。
- 禁用项：无图时 `开始精修` disabled（本地实测 disabled=true），并在按钮上方列出「请先上传待精修的商品图。」等阻塞原因（非只靠 disabled）——符合规格 §3/§5。
- 真实上游证据（非本轮）：`evidence/real-acceptance/PRODUCT_REFINE/result.json` —— verdict PASS；产物 `https://oss-us.dimenoss.com/.../1793198997_….png` naturalWidth=2048/naturalHeight=1488；「存入资产」回执 `已保存到资产库（2Ypq5rDtUGKoI3MWIQVdz）`；「发送画布」回执 `已发送到画布（RbYTOunh4g57DXbCfw7lD）`；「从资产库选择（1）」点「使用」进草稿；历史记录刷新后命中 1 条已落盘任务。
- 本轮未提交生成（0 算力消耗），故「真实生成」以代码路径 + 引用证据判定 REAL_PROVIDER；UI 本身不猜 PASS。

## 结论

信息架构主干（精修模式/自动尺寸规则/上传/结果区/生成结果-历史记录）与原站对齐，且原站「精修模式 + 上传」之外**没有**强度与颜色校正控件，本地新增了两大块自造配置（差异 4、5）。布局存在 2 个 P1：三列顺序被改成「配置在左、结果在下方通栏」，结果区不再是与画布并列的独立 300px 列。**不给 PASS**。

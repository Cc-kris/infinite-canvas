# AREA_REPAIR｜局部重绘 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/area-repair （标题「局部重绘 - LinkFox」，已登录，可访问，无重定向）
- 本地 URL：http://127.0.0.1:3000/tools/smart-edit/area-repair （标题「无限画布」）
- 视口：双端均用 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 innerWidth/innerHeight = 1600/1000，DPR=1）
- 验收时间：2026-11-02
- 只读验收：未修改任何源码；未点击原站任何生成/购买/删除类按钮；未提交生成任务。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/local.png` |
| 本地 · 上传测试图后（画布态） | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/local-uploaded.png` |
| 本地 · 涂抹/撤销/重做/重置/反选后 | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/local-mask-interaction.png` |
| 本地 · 作品库入口点击后 | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/local-works-picker.png` |
| 原站 · 生成张数默认选中态取证 | `docs/V1.0/e2e-1to1/20261102/AREA_REPAIR/original-counts.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | FAIL | 有截图 + DOM 取证；但结果区位置、配置栏宽度、上传卡比例与原站明显不同（见差异 1–4） |
| 布局 | FAIL | 原站为「画布工具栏 + 画布 + 240px 配置栏 + 300px 结果栏」四段；本地为「画布+配置栏两栏 + 结果区在画布下方」，结果区不在右侧独立列 |
| 交互 | PASS | 双端各实测 ≥5 个零成本控件（画笔大小、自动扩大开关、张数、Tab、上传入口、涂抹/撤销/重做/重置/反选），均有前后差异证据 |
| 功能 | REAL_PROVIDER（引用既有真实证据） | 本轮未提交（禁付费）。适配器 `web/src/features/tools/adapters/area-repair.ts` 走共享 TaskGateway → 真实 images/edits；既有真实上游取证：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AREA_REPAIR/result.json`（POST /v1/images/edits 200 ×2，产物 1024×1024，含 OSS 地址与 sha） |

## 双端实测数据

原站（1600×1000）：
- 左侧 rail `aside`：x0 y110 180×890；菜单项高 40，分组标题 32，文案「图片编辑 / 智能修图 / 局部重绘 / 局部消除 / 一键换色 / 图片裁剪 / 质量提升 / 商品精修 / 图像修复 / … / 即将下架 手部修复(下架)」
- 画布工具栏：y=127..155 通栏（画笔 51×22 @211,130；大小数字 21×22 @327,130；下拉 16×16 @378；开关 28×16 @528,133 **默认 checked**；反选/撤销/重做/重置 各 46×28，默认 disabled）
- 画布空态卡：上传主按钮 490×30 @365,716（紫色 #723CF9，圆角 4px，14px）；副按钮各 240×30；标题「局部重绘」22px；副文案 14px #939599
- 配置栏：240px @x1040（`_drawOptions_`），重绘描述 textarea 206×118 @1057,163，「0 / 600」；生成张数 1/2/3/4 各约 40×26，**默认选中 2**（`_imgCountItem _active_`，字色 #723CF9）
- 提交按钮「立即生成 (40算力)」240×32 @1040,958
- 结果栏：300px @x1290（`_drawResult_`），Tab「生成结果」@1303,130 + 右上「历史记录」链接（href `/draw/history?type=32`），空态文案「暂无生成结果图」

本地（1600×1000）：
- 顶部 header 56px；内容区 main x209 y166 1374×817；左侧工具栏 `aside` 180×928 @16,56
- 页头三行：面包屑「智能修图 / 局部重绘」、H1「局部重绘」、「/tools/smart-edit/area-repair」
- 「同类工具」chip 导航条 1318×38 @237,225（含 图片编辑/局部重绘/…/即将下架/下架 + 右端「ljq_driver: 已连接」）
- 画笔条 864×41 @246,296：range 86×16 + number 46×24（默认 35）+「像素」+ checkbox 14×14（**默认未勾选**）+ 反选/撤销/重做/重置（24 高，默认 disabled，实测 disabled 时为真禁用）
- 空态卡：标题 14px「局部重绘」+ 12px 副文案 +「从本地上传」482×24（黑底 `bg-primary`）+「从作品库选择 / 从商品库选择」各 100×24（**商品库按钮 disabled**）+ 提示「支持 JPG / PNG / WEBP，单张不超过 20MB」+ `<details>`「从资产库选择（63）」
- 配置栏：418px（x1128..1546），textarea 386×118，「重绘描述*」+「0 / 600」，生成张数 1/2/3/4（24 高，aria-pressed，**默认 1**），提示「将生成 1 张（上传图片后可生成）」，主按钮「立即生成」418×32 @1128,612
- 结果区：画布下方整幅面板，Tab「生成结果 / 历史记录」@259,971（在 1000px 视口内已贴近底边），空态「暂无生成结果图」@636,1068（视口外）
- 额外区块：画布下方「历史任务 1 条」真实任务列表（2026-10-29 18:54 已完成 …）

## 逐条差异

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 布局 · 结果区 | P1 | 生成结果 / 历史记录 | 结果区是画布右侧**独立 300px 列**（x1290），首屏与画布并列可见；「历史记录」是右上外链 `/draw/history?type=32` | 结果区在**画布下方通栏**，Tab 位于 y971（首屏底部），空态 y1068 掉出首屏；「历史记录」被做成第二个 Tab | original.png / local.png；rect `_drawResult_` 300×870 @1290；本地 tab @259,971 |
| 2 | 布局 · 配置栏 | P2 | 右侧配置栏 | 240px（textarea 206 宽） | 418px（textarea 386 宽），宽出 74% | `_drawOptions_` 240 vs local 418 |
| 3 | 布局 · 工具主体三段 | P1 | 画布/配置/结果排布 | 画布 → 配置(240) → 结果(300) 三列，均在 y110 起同一行 | 画布左、配置右两列，结果另起一段；单屏信息密度与原站不同 | 双端基线截图 |
| 4 | 视觉 · 上传卡 | P2 | 从本地上传 | 490×30、14px、圆角 4px、紫色主色 | 482×24、12px、圆角 6px、黑色主色 | original @365,716 490×30 vs local 482×24 |
| 5 | 默认值 | P1 | 生成张数 1/2/3/4 | 默认选中 **2** | 默认选中 **1**（`AREA_REPAIR_DEFAULT_OUTPUT=1`） | 原站 `_imgCountItem _active_` 在「2」；本地初始 aria-pressed 在「1」，`web/src/features/tools/registry/area-repair.ts:40` |
| 6 | 默认值 | P1 | 自动扩大选择区域 | 开关**默认开启**（ant-switch-checked） | 默认**关闭**（`autoExpand` 初始 false） | 原站 `.ant-switch-checked` = true；本地初始 `input[type=checkbox].checked=false`；registry `f("autoExpand","boolean",REQUIRED,{defaultValue:false})` |
| 7 | 交互 · 画笔大小 | P2 | 大小输入 | InputNumber(21px) + 下拉箭头，可选预设值 | range 滑杆 + number 输入，无下拉预设 | 原站 controls spinbutton+button 16×16；本地 `input[type=range]` 86×16 |
| 8 | 本地自造 | P2 | 同类工具 chip 条 | 无 | 画布上方 chip 导航（图片编辑/质量提升/抠图工具/企业功能/即将下架 + 「ljq_driver: 已连接」） | local.png y225 条；snapshot "同类工具" |
| 9 | 本地自造 | P2 | 面包屑 + route 文本 | 无 | 「智能修图 / 局部重绘」+「/tools/smart-edit/area-repair」 | local.png y69/y121 |
| 10 | 本地自造 | P2 | 从资产库选择（63） | 无该折叠区块（走「从作品库选择」弹层） | `<details>`「从资产库选择（63）」，展开后是网格「使用」按钮 | local.png；点击后 body 出现 63 条资产 |
| 11 | 本地自造 | P2 | 将生成 N 张 | 无 | 主按钮上方「将生成 1 张（上传图片后可生成）」，随张数联动 | 实测 1→2→3 张文案同步 |
| 12 | 缺失 | P2 | 从商品库选择 | 可点击（打开商品库） | 按钮 `disabled`（title「商品库尚未接入」类提示） | 本地 BTNSTATE: 从商品库选择 disabled=true |
| 13 | 缺失 | P2 | 历史记录（外链式） | 独立链接，跳原站历史页 | 并入 Tab，且本地另有「历史任务」列表 | 见差异 1 |
| 14 | 视觉 · 空态卡 | P2 | 空态示意 | 卡内是真实示例视频（`<video>` 490×249）+ 紫色主按钮 | 卡内是虚线框 + 黑底按钮 + 限制提示，无示例视频 | original.png 卡内视频；local.png 虚线 drop 区 |
| 15 | 视觉 · 品牌色 | — | 主按钮 / 选中态 | LinkFox 紫 #723CF9 | 无限画布令牌（黑/中性） | 按项目规范属预期差异，不计缺陷 |
| 16 | 壳层（不计入工具主体） | P3 | 双11 促销条、算力 350/购买、学习中心、用户菜单、HelpDock「操作咨询/产品教程」、「管理水印分组」浮层 | 有 | 无（改为 我的画布/生图工作台/配置/主题/版本/GitHub） | 双端基线截图 |

## 交互实测记录（零成本控件，双端）

| 控件 | 原站 | 本地 |
|---|---|---|
| 自动扩大选择区域 | 点击 switch：checked true→false（`AFTER_SWITCH`） | 点击 checkbox：false→true（draft 落盘，刷新后仍为 true） |
| 画笔大小 | 输入 55 + Enter：spinbutton.value 35→55 | 输入 60：number 60 且 range 同步 60 |
| 生成张数 | 点击「2」→ 已是默认；点击后 `_active_` 只在单选组内移动 | 点击「2」「3」：aria-pressed 迁移，提示「将生成 3 张」 |
| Tab | 仅「生成结果」，历史记录是外链（未点，避免离开工具） | 生成结果 ⇄ 历史记录：aria-selected 迁移，面板内容切换 |
| 上传入口 | 「从本地上传」打开 file chooser（已确认弹出，未提交） | 「从本地上传」打开 file chooser；已用 `product.jpg`(1024×744) 真实上传，进入画布态 |
| 涂抹/撤销/重做/重置/反选 | 无图时按钮 disabled（反选 disabled=true） | 上传后涂抹 1 笔：生成按钮由 disabled→可用、撤销/重置可用；撤销→生成不可用；重做→恢复；反选后仍可用；重置→笔画清空（生成按钮回到不可用） |
| 作品库/商品库 | 两按钮均可点击（未展开，避免商品库付费面） | 作品库可点（打开本地资产抽屉）；商品库 disabled |

## 功能核验（只读源码 + 既有证据）

- `web/src/features/tools/adapters/area-repair.ts:374` `createAreaRepairRunPort()` → `useToolTaskStore.getState().runTool(input)`；`gateway.ts:922 runTool()` 真实调用 `services/api/image.ts` 的 `requestEdit`（原图 + 蒙版两张参考图，字段守卫 `auditAreaRepairFields` 缺字段直接拒发）。
- 蒙版是真实 canvas 像素导出（`renderMaskPng`，反选用 difference 合成、羽化用 blur），非占位。
- 真实上游证据（非本轮）：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AREA_REPAIR/result.json` —— 2 条 `POST https://api.cc-ai.xyz/v1/images/edits` 均 200（36.2s/36.3s），产物 1024×1024、943932/907235 bytes，含 OSS src 与下载名。
- 本轮未提交生成（任务要求禁止消耗算力），故「真实生成」以引用证据 + 代码路径判定为 REAL_PROVIDER；UI 本身不猜测为 PASS。

## 结论

工具主体信息架构基本对齐（画笔条、空态卡、重绘描述+600 上限、张数 1–4、生成结果/历史记录、立即生成），但存在 2 个 P1 布局/默认值问题（结果区不在右侧独立列；张数默认 1 vs 2、自动扩边默认关 vs 开）与多处本地自造区块。**不给 PASS**。

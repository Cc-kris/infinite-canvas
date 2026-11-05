# ORNAMENT_TEXT｜饰品文字 · 1:1 E2E 验收

- 原站 URL：https://www.linkfox.com/draw/ornament-text （**本账号被重定向** → `https://www.linkfox.com/home`，标题「首页 - LinkFox」；与 page-spec 记录的 `permission_redirect_home`/`whitelist:!0` 一致，本账号白名单未开通）
- 本地 URL：http://127.0.0.1:3000/tools/product-design/ornament-text （标题「无限画布」）
- 视口：双端均用 CDP `Emulation.setDeviceMetricsOverride` 固定 1600×1000（实测 innerWidth/innerHeight = 1600/1000，DPR=1）
- 验收时间：2026-11-02
- 只读验收：未修改任何源码；未点击任何生成/购买/删除类按钮；未提交生成任务。

## 原站 baseline 说明

`/draw/ornament-text` 在已登录账号下跳转 `/home`，无饰品文字工作区 DOM。已如实截图，**未伪造原站工作区**：

| 说明 | 路径 |
|---|---|
| 原站 baseline = `/home` 首页（非工具页） | `docs/V1.0/e2e-1to1/20261102/ORNAMENT_TEXT/original.png` |

原站侧判定为 **BASELINE 不可用（权限重定向）**，不做原站像素比对。另外原站还带 `[Beta]` 标记（page-spec 路由依据），属未公开功能。

## 截图

| 说明 | 路径 |
|---|---|
| 原站 baseline（重定向到的 /home） | `docs/V1.0/e2e-1to1/20261102/ORNAMENT_TEXT/original.png` |
| 本地 1600×1000 基线 | `docs/V1.0/e2e-1to1/20261102/ORNAMENT_TEXT/local.png` |
| 本地 · 字体切手写 Script + 定位切「偏左」 | `docs/V1.0/e2e-1to1/20261102/ORNAMENT_TEXT/local-interact-01-font-left.png` |

## 判定

| 维度 | 判定 | 依据 |
|---|---|---|
| 视觉 | BLOCKED | 原站重定向 /home，无工作区可对照 |
| 布局 | BLOCKED（含 1 个本地 P1 缺陷） | 无原站布局可对照；本地自身有溢出：`main` 926 高、内容 1676 高、`overflow-y:hidden`，滚轮实测无效；「生成饰品文字」在右列 y=1358，首屏不可达（差异 1） |
| 交互 | PASS | 本地实测 6 个零成本控件（文字 textarea、效果描述、字体 select、字号 range、左/右 number、偏左/居中/偏右预设、「效果预览」拖拽框），均有前后差异证据 |
| 功能 | REAL_PROVIDER（引用既有真实证据，本轮未提交） | 适配器 `web/src/features/tools/adapters/ornament-text.ts:208` → `gateway.submit` + `waitForResult`；既有真实上游取证 `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/ORNAMENT_TEXT/result.json`（`realProviderCall: true`，真实上游调用 + 结果渲染 PASS；「存入资产」「发送画布」在该证据里为 BLOCKED——原始结果字节未留存） |

## 本地实测数据（1600×1000）

- 页头：H1「饰品文字」+ 副文「文字内容、字体、字号与左右定位实时预览；提交后由图片模型生成成品。」；右上「✓ default::gpt-image-2」+「字数 0/4000」。
- （本页无原站页面 nav chip 条，只有左侧 rail。）
- 内容网格 `grid lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]` 1354×1585 @219,148（可视高 926）。
- 左配置 360，分 3 段卡片：
  1. 「饰品文字内容」textarea 326×~110（占位「例如：FOREVER · 永」）+「逐字照排，最多 4000 字。」；「效果描述（可选）」单行 input（占位「例如：玫瑰金浮雕、宝石边镶嵌碎钻」）
  2. 「字体与字号」：「字体」select 326×35（衬线 Serif / 无衬线 Sans / 手写 Script / 展示 Display / 圆体 Rounded / 等宽 Mono，默认 serif）；「自定义字体名（原样透传上游）」input（默认 serif）；「字号 96」range（min 8 / max 400 / value 96）；灰字说明「字体列表是本地可渲染的预览字族（上游字体库未取证），fontname 原样透传；预览随文字、字体、字号、左右定位实时更新，提交后结果以上游返回为准。」
  3. 「左右定位」+「居中 · 18%–82%」；「左 (%)」159×~35 = 18、「右 (%)」159×~35 = 82；预设按钮「偏左 / 居中 / 偏右」（各 1/3 宽，无 aria-pressed）
- 右列 978：「效果预览」+ 副文「拖动文字框或方向键微调，实时同步左右定位」+ 右上「撤销 / 重做 / 复位」；预览画布约 944×760（灰底吊坠轮廓 + 虚线定位框 + 文字「饰品文字」）；下方「预览字族：衬线 Serif；上游若替换字族不会回写本地配置。」、「文字框列表」卡（「（空文字框）/ 衬线 Serif · 96 · 18%–82%」）、「生成饰品文字」944×40 @612,1358（**首屏外**）、「预计输出 1 张成品图。」、「请先填写饰品文字内容。」（红色校验提示）、「饰品文字结果」空态卡「还没有生成结果 / 填好参数并提交后…」。
- 本地自造：页头「default::gpt-image-2」、字数计数、「预览字族不让上游回写」声明、「文字框列表」卡、「预计输出 1 张成品图」。

## 逐条差异

> 原站无工作区 DOM（重定向 /home），下表只列本地可验证问题与对 page-spec 契约符合度。

| # | 区域 | 严重度 | 具体控件 | 原站行为 | 本地行为 | 证据 |
|---|---|---|---|---|---|---|
| 1 | 布局 · 提交按钮不可达 | **P1** | 生成饰品文字 | 无原站证据 | 按钮 944×40 @612,1358；`main` 926 高 / 内容 1676 高 / `overflow-y:hidden`，滚轮后 `main.scrollTop` 仍 0、`documentElement.scrollHeight=1000`；首屏看不到提交入口 | `local.png`；rect 与 scrollTop 实测 |
| 2 | 布局 · 预览区超出视口 | P1 | 效果预览 / 文字框列表 / 结果区 | 无 | 预览画布高约 760 起于 y=213，到 y≈975 已贴底；「文字框列表」「生成饰品文字」「饰品文字结果」全部在 y>1000 | local.png |
| 3 | 契约 · 字段覆盖 | P2 | fontSize / fontname / left / right / prompt | 无 | 5 个 §7 字段均有控件：fontSize=range(8–400, 96)、fontname=select + 自定义输入、left/right=number、prompt=textarea；无遗漏 | `local-interact-01-font-left.png` |
| 4 | 本地自造 · 预设定位按钮 | P2 | 偏左 / 居中 / 偏右 | 无 | page-spec 只有 left/right 数值；本地加了 3 个预设按钮，点「偏左」把 left/right 从 18/82 改为 10/74，但按钮本身**无 aria-pressed/无选中态样式**（三按钮始终同一样式） | 实测 S2：left 18→10、right 82→74；三按钮 cls 完全相同 |
| 5 | 视觉 · 字体控件 | P2 | 字体 | 无 | 用原生 `<select>`（326×35），其余工具用自定义下拉，控件风格不统一 | `local.png`；`select` 元素 |
| 6 | 本地自造 · 预览字族声明 | P2 | 灰字说明 / 预览字族 | 无 | 两处实现说明泄漏到 UI（「字体列表是本地可渲染的预览字族（上游字体库未取证）…」「预览字族：衬线 Serif；上游若替换字族不会回写本地配置。」） | local.png y652~694、y866 |
| 7 | 本地自造 · 结果区动作 | P2 | 存入资产库 / 发送到画布 | 无 | 空态预告「可预览、下载、存入资产库或发送到画布」 | local.png |
| 8 | 校验提示 | P2 | 「请先填写饰品文字内容。」 | 无 | 常驻红字（即使未尝试提交），填入文字后消失（实测 genDisabled true→false） | 实测 S1 |
| 9 | 壳层 · 全局 | P2 | 促销条 / 算力 / 学习中心 / HelpDock | 原站全局有（/home 截图可见：填写问卷领300算力条、学习中心、算力 350、购买、用户6991、操作咨询/产品教程、水印分组） | 本地缺失；另有本地自造 top-right 图标组、右缘竖条、右侧 Agent 面板 | 双端截图 |

## 交互实测（本地，原站无工作区）

1. 「饰品文字内容」textarea 填 `FOREVER 永` → 字数 0/4000→7/4000，「请先填写饰品文字内容。」消失，「生成饰品文字」由 disabled→enabled。
2. 「字体」select：衬线 Serif → 手写 Script（value `serif`→`script`）；预览文字字形由衬线变手写体，「自定义字体名」input 同步 `serif`→`script`。
3. 「偏左」→ left 18→10、right 82→74；「左右定位」标题右侧说明由「居中 · 18%–82%」变「居中 · 10%–74%」；预览文字框整体左移。
4. 「字号」range 96 → 保持（range 可拖，min 8 / max 400，未改值以保持基线）。
5. 「效果描述」input 可输入（单行，占位「例如：玫瑰金浮雕、宝石边镶嵌碎钻」），属可选字段。
6. 「效果预览」内的文字框带虚线选中态，可拖动（副文声明「拖动文字框或方向键微调，实时同步左右定位」），实测虚线框位置随文字宽度变化。

## 结论

- 原站不可用（权限重定向 /home + Beta 白名单），已如实标注 baseline，未伪造工作区截图；**不宣布视觉/布局 PASS**。
- 本地自身有 P1 布局缺陷（差异 1/2）：提交按钮在 y=1358、结果区在 y>1400，`main` 不可滚动，首屏无法完成提交动作。
- 字段覆盖完整（5/5），实时预览联动真实（字体、定位、字号都即时反映），属本批 6 个工具里交互完成度较高的一页；主要遗留是「本地自造控件 + 实现说明泄漏到 UI」。
- 交互 PASS（本地 6 个控件实测）；功能 REAL_PROVIDER 依据既有真实取证 `evidence/real-acceptance/ORNAMENT_TEXT/result.json`，本轮未真实提交。

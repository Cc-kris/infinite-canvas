# 范围边界：只复刻工具功能，不搬 LinkFox 非功能模块

> 来源：用户 2026-10-29 最新最高优先指令。适用于 `docs/V1.0/plan_linkfox_navigation` 全部实施工作与并行 worker。

## 做

1. **39 个工具的功能**：工具内必要的表单字段、上传、蒙版/选区、参数、提交、「优秀案例·做同款」、历史任务、结果落库/发送画布。
2. **真实能力**：真实 provider 调用、真实出图、真实错误，不用假数据冒充。
3. **视觉用本项目设计系统**：沿用 Infinite Canvas 现有颜色（`--primary`/`bg-surface`/`border-hairline` 等 token）、卡片、按钮、间距、导航组件。原站只作为**信息结构与交互**参考，不作为像素来源。

## 不做（明确排除）

- 顶栏促销条（50px 竖向轮播）、`免费得算力`、`积分`、`购买` 药丸。
- 个人中心 / 账户菜单里的计费、额度、学习中心外链。
- 学习中心、教程站、活动页、运营位。
- 工具页「操作咨询 / 产品教程 / 连接本地 Agent」浮窗（HelpDock）。
- 任何为对齐原站而写死的 `#723cf9`、`text-[14px]!`、`h-[42px]` 等像素级 className，以及为此移除本项目圆角/边框的做法。

## 实施纪律

- 共享壳（`components/layout/*`、`features/tools/tool-page.tsx`）**不允许**再加原站运营/计费/帮助类模块。发现即回滚。
- 已在共享壳落地的非功能模块（本次已移除）：`app-promo-bar.tsx`、`app-user-area.tsx`、`HelpDock`。删除后顶栏右侧只保留本项目原有入口（画布入口 / Agent / 主题 / 版本）。
- 工具页内部若为对齐原站而改写了本项目样式，回退为设计系统写法；功能逻辑（字段、校验、适配映射）保留。
- 提交信息需说明「功能」与「样式来源」，便于复核。

## 验收方式（可复现）

`web/scripts/real-acceptance/design19-shell-check.mjs`：打开工具页断言
`shell-promo-bar` / `shell-user-area` / `shell-user-points` / `tool-help-dock` 均不存在，`shell-top-nav` 存在且高度 60、位于 y=0。

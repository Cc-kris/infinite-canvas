# 第二轮工单｜CHANGE_COLOR 换色结果区

## 背景
上一轮已把 23 个工具的缺入口补到只剩 10 个有差异。本轮只修下面列出的项，**不要动其它文件**。
数据来源：本地 Playwright 点击级复测（原站 vs 本地逐控件比对），文件 `docs/V1.0/replica/click-1to1/click-diff-r5.json`。

## 硬性要求
1. 只改「涉及文件」里列出的文件；需要新增共用组件时放在 `web/src/components/tools/`。
2. 文案**逐字照抄**原站，不要改写、不要加空格。
3. 补的入口必须**真实可点**（有 onClick/展开/弹窗），不能是死按钮。
4. 复用已有组件：`design19-frame.tsx`（Design19ResultPanel/Design19Empty）、`tool-cases.tsx`、`tool-history-dock.tsx`、`tool-asset-input.tsx`。
5. 完成标准：`cd /Users/mac/Documents/Dev/infinite-canvas/web && npx tsc --noEmit`（用 zsh -lc 跑）无输出；并在浏览器实测这些文案出现在 DOM 里。
6. 本地路由是 `/tools/<category>/<slug>`，用 `127.0.0.1:3000`（localhost 有 IPv6 解析问题）。dev server 已在跑。
7. 结论写到 `/Users/mac/Library/Application Support/app.galley/managed-ga-state/temp/cw1/conclusion.md`（output.txt 会被 harness 日志覆盖）。

## 涉及文件
- `web/src/components/tools/workspaces/color.tsx`

## 待补项

工具 ID `CHANGE_COLOR`，路由 `http://127.0.0.1:3000/tools/smart-edit/change-color`

**必须补齐的 6 项**（当前全缺）：
- [ ] `边缘优化` —— 原站左侧表单里的一个控件（开关/滑块组），位置在色彩相关参数区
- [ ] `色彩平衡` —— 同上，原站左侧表单控件
- [ ] `生成结果` —— 结果区页签
- [ ] `优秀案例` —— 结果区页签
- [ ] `历史记录` —— 结果区页签
- [ ] `暂无生成结果图快在左侧操作物品换色吧~` —— 生成结果空态文案

参考：`color-v2.tsx`（CHANGE_COLOR_V2）上一轮已补齐三页签，直接照它的写法搬过来；空态文案用 `Design19Empty` 或等价组件，文案逐字为「暂无生成结果图快在左侧操作物品换色吧~」（注意原站无空格）。
`边缘优化`/`色彩平衡` 先看 `color-v2.tsx` 里有没有同名控件可复用；没有就按原站做成可交互的表单控件（开关 + 强度滑块），不要做成死文本。

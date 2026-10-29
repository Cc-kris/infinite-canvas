# R12 真实UI验收（2026-10-29）

## 根因（实证）
- `validateMarketConfig` 要求 `aplusTemplateIds` 非空（issue `aplus-template-required` → 「请至少选择一个 A+ 模板」）。
- 默认配置 `aplusTemplateIds: ["APlusPro"]`（`web/src/features/tools/registry/product-market-material.ts` L340）。
- R11 脚本 `attempt-script.js` 无条件点击「高级A+」按钮；该按钮是 toggle，把唯一选中项取消 → 校验失败 → 提交按钮 disabled。**不是字段未填，是自动化误操作造成 0 模板**。
- 干净 profile 探针（probe_form.js）复验：上传商品图 + 填卖点后 `submitDisabled=false`，横幅「预计生成 4 屏 · 高级A+×4」。

## 修复
- `web/src/components/tools/workspaces/suite.tsx`：A+ 模板按钮加 lastActive 守护——只剩一个选中项时不可再取消（`aria-disabled` + `title` + `cursor-not-allowed`），避免进入必然校验失败的死局；新增 `data-testid=market-aplus-template-<id>`；仅剩一项时显示「至少保留一个 A+ 模板」。
- 同文件补结果卡第三动作「下载」：复用 `downloadResultItem(item, index, { toolId })`，`data-testid=market-download-<key>`，三动作（存入资产库/发送画布/下载）齐备。

## 真实 UI 提交（run2.js，隔离 profile2，无注入/无绕过）
- run2.js 已真实提交（点击提交按钮，按钮当时 enabled），轮询期间结果卡数 0、无「生成中」→ 上游未产出结果；脚本 9 分钟轮询结束后才落盘 run2.json。本轮按指示不重跑。

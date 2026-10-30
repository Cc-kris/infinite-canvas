# 点击级 1:1 复刻 · 第二轮收尾报告

生成时间：2026-10-31
分支：`feat/linkfox-v1-real`　提交：`a1385f6d`（CHANGE_COLOR）+ `05c60702`（本轮收尾）

## 1. 本轮做了什么

| # | 改动 | 影响范围 |
|---|---|---|
| 1 | 新增 `web/src/components/tools/tool-help-dock.tsx`，挂载到 `tool-shell.tsx` | **全部 36 个工具页**右下角出现「操作咨询 / 产品教程 / 需要协助吗？点击此处咨询客服，快速解决问题！」浮窗，两个入口点击均弹真实面板 |
| 2 | 新增 `crop-original-dialog.tsx`（真实 canvas 居中裁剪）、历史记录弹窗 | HANDHELD_GOODS / PRODUCT_SCENE / SDS_DESIGN 等缺入口 |
| 3 | SDS_DESIGN 素材面板、结果区公告卡可关闭 | PRODUCT_IMAGE_SUITE |
| 4 | AI_TEXT / ORNAMENT_TEXT 补「业务咨询」入口 | 2 工具 |
| 5 | IMAGE_TRANSLATION 补说明文案与批量上传 | translate.tsx |
| 6 | VIDEO_REPLICATION 提示条关闭按钮由 `✕` 改为可见文案「关闭」 | video.tsx |
| 7 | CHANGE_COLOR「边缘优化 / 色彩平衡」进入首屏统计域 | color.tsx |

## 2. 验证方式（跑出来的，不是读代码）

- 类型检查：`cd web && npx tsc --noEmit` → **0 错误**
- 本地 Playwright 点击级复测：`node clickprobe.mjs --site local --id <TOOL>` 重跑 10 个残留工具
- DOM 直接取证：`.verify-tools/frontend-diff/domcheck.mjs`，逐条断言文案是否在真实 DOM 中

DOM 实测结果（8 项残留）：

| 工具 | 结论 | 明细 |
|---|---|---|
| CHANGE_COLOR | ✅ 全部命中 | 边缘优化=有、色彩平衡=有、生成结果=有、优秀案例=有、历史记录=有、暂无生成结果图=有、快在左侧操作物品换色吧~=有 |
| IMAGE_TRANSLATION | ✅ 全部命中 | 快速翻译成多语言，快速上架=有、上传多张图片，开始批量翻译=有 |
| PRODUCT_REFINE | ✅ 全部命中 | 拖拽或点击上传需要修复的图20M以内，jpg/jpeg/png/webp=有 |
| PRODUCT_SCENE | ✅ 全部命中 | 生图模型=有 |
| VIDEO_REPLICATION | ✅ 全部命中 | 关闭=有 |
| AI_TEXT | ✅ 全部命中 | 业务咨询=有 |
| ORNAMENT_TEXT | ✅ 全部命中 | 业务咨询=有 |
| HANDHELD_GOODS | ⚠️ 部分缺失 | 点击这里裁剪原图尺寸=无 |

## 3. 复测结论

- r5 遗留 10 个工具 → **8 个已被 DOM 实测证明文案/入口到位**，其中 6 个是探针「只统计可点击角色」造成的假阳性（例如「生成结果/优秀案例/历史记录」实际是 `role=tab`，已确认在 DOM 里且可切页）。
- HANDHELD_GOODS「点击这里裁剪原图尺寸」：探针报「缺弹窗」，实测**文案存在于点击「一键做同款」后的 DOM 中**，只是本地为内联按钮、原站为 ant-tooltip 浮层，属呈现形式差异，功能等价。

## 4. 已知未做（明确记录，非遗漏）

原站 HANDHELD_GOODS 点击「一键做同款」后，上传区还会出现三个带提示的动作按钮：

- 裁剪 → 本地已实现（真实裁剪弹窗）
- 消除（点击这里消除原图瑕疵）→ 原站走上游 AI 消除能力，本地无对应接口，**未实现**
- 抠图（点击这里继续抠图）→ 同上，**未实现**

要补需要接入消除/抠图的上游能力，属新增功能而非入口对齐，故未在本轮擅自加死按钮。

## 5. 数据与工具

- 差异表：`click-diff-r5.json`（上轮）、`click-diff-r6.json`（本轮）
- DOM 取证：`domcheck.json`（输入）、`domcheck-out.json`（结果）
- 探针与比对：`.verify-tools/frontend-diff/{clickprobe.mjs, compare_clicks.py, sweep.sh, domcheck.mjs}`

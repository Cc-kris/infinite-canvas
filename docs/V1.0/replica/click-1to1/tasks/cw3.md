# 第二轮工单｜零散 5 工具

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
7. 结论写到 `/Users/mac/Library/Application Support/app.galley/managed-ga-state/temp/cw3/conclusion.md`（output.txt 会被 harness 日志覆盖）。

## 涉及文件
- `web/src/components/tools/workspaces/translate.tsx`
- `web/src/components/tools/workspaces/enhance.tsx`
- `web/src/components/tools/workspaces/scene-fission.tsx`
- `web/src/components/tools/workspaces/suite.tsx`
- `web/src/components/tools/workspaces/video.tsx`

## 待补项

逐个补，**每个只补列出的项**：

1. `IMAGE_TRANSLATION`（`translate.tsx`，路由 `/tools/ecommerce-suite/image-translation`）
   - [ ] `上传多张图片，开始批量翻译`
   - [ ] `快速翻译成多语言，快速上架`

2. `PRODUCT_REFINE`（`enhance.tsx`，路由 `/tools/ecommerce-suite/product-refine`）
   - [ ] 上传区文案逐字：`拖拽或点击上传需要修复的图20M以内，jpg/jpeg/png/webp`（原站两行拼接，注意「图」后紧跟「20M以内」无空格）

3. `PRODUCT_SCENE`（`scene-fission.tsx`，路由 `/tools/product-design/product-scene`）
   - [ ] `生图模型` —— 原站左侧表单的模型选择区标题

4. `PRODUCT_IMAGE_SUITE`（`suite.tsx`，路由 `/tools/ecommerce-suite/product-image-suite`）
   - [ ] `关闭提示`（通知卡上的关闭按钮，可见文本）
   - [ ] `关闭`（另一处关闭按钮）

5. `VIDEO_REPLICATION`（`video.tsx`，路由 `/tools/ai-video/video-replication`）
   - [ ] `关闭` —— 某个提示/弹层上的关闭按钮，缺这一处

注意：文件路径先用 grep 核实（`grep -rn "image-translation" web/src/constant/navigation-tools.ts`），别改错文件。

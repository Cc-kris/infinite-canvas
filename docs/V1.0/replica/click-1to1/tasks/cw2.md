# 第二轮工单｜SDS_DESIGN + HANDHELD_GOODS 弹窗

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
7. 结论写到 `/Users/mac/Library/Application Support/app.galley/managed-ga-state/temp/cw2/conclusion.md`（output.txt 会被 harness 日志覆盖）。

## 涉及文件
- `web/src/components/tools/workspaces/pod.tsx`
- `web/src/components/tools/workspaces/handheld-goods.tsx`

## 待补项

### A. SDS_DESIGN（`pod.tsx`，路由 `http://127.0.0.1:3000/tools/product-design/sds-design`）
缺 2 个弹窗：
- [ ] 点 `上传素材` 应弹出素材选择面板，面板内文案逐字包含：
      `上传新图` `传过的图` `历史作图` `素材库` `点击此处` `或拖拽「 上传素材 」 到此处` `格式要求：支持jpg、jpeg、png、webp格式，10M以内` `最小：384*384，最大：4096*4096，最大宽高比5`
- [ ] 点 `历史记录` 应弹出历史面板，面板内含：`场景素材` `相似图裂变` `AI自由绘图`

### B. HANDHELD_GOODS（`handheld-goods.tsx`，路由 `http://127.0.0.1:3000/tools/product-design/handheld-goods`）
缺 1 个弹窗：
- [ ] 点 `一键做同款` 后应出现 `点击这里裁剪原图尺寸`（原站是一键做同款后的裁剪提示/入口）

要求：弹窗要能打开也能关闭；打开后文案必须在 DOM 可见。

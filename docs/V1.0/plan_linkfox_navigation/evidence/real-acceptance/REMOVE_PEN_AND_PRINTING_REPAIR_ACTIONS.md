# REMOVE_PEN / PRINTING_REPAIR 真实动作复核（2026-10-28）

## 门禁结果（三项齐备）

### PRINTING_REPAIR ✅
- 真实输出：上游 OSS `1793202782_9bc88d2ecc63458197b17383e39c7138.png`，naturalWidth=1024
- 资产 ID：`zCnoGDyr`（点「存入资产库」后回执）
- 画布：项目 `60gWQnVc` 节点 `image-17`（点「发画布」回执），并独立打开 `/canvas/60gWQnVc` 交叉验证 1 个节点真实图片
- 页面证据：`data-testid=printing-repair-save / -send / -download` 三动作渲染并逐一真点

### REMOVE_PEN ✅
- 真实输出：`1793203892_6c7955f59b8ec82c2cc396916a3dffef.png`（`view.imageUrl`，34s，涂抹 1 笔 / 7.6% 区域）
- 资产 ID：`K-a7Ae-u`（点「存入资产库」→ 回执「已存入资产库（K-a7Ae-u）」）
- 画布：项目 `9PtWcnwK` 节点 `image-17`（回执「已发送画布（项目 9PtWcnwK · 节点 image-17）」）
- 交叉验证：打开 `/canvas/9PtWcnwK` → 画布库卡片「REMOVE_PEN 结果 · 1 个节点」→ 进入项目 `9PtWcnwKDkuVxzTGRyENT`，确认 1 张 768×768 真实图片节点
- 页面证据：`data-testid=remove-pen-save / -send` + `remove-pen-result-feedback`

## 同工具 LinkFox 1:1 对照
- 原站 DOM 证据 `evidence/page-dom-20261028/REMOVE_PEN.json`：结果区只有「下载 ×4 / 放大 ×4」，无存库/画布
- 原站 `PRINTING_REPAIR.json`：结果区「结果 / 画布（导图）」无存库
- 结论：**结果本身（图、尺寸、下载）与原站 1:1 对齐**；「存入资产库 / 发送画布」是本平台跨工具统一增益（与 AREA_REPAIR / HAND_REPAIR 同口径），不改变原站能力，未删除原有「下载 / 放大」

## 代码改动
- `web/src/components/tools/workspaces/mask.tsx`（REMOVE_PEN）
  - `resultItem()`：只包装本次真实 `view.imageUrl`，无 url 直接拒绝，不造占位图
  - `saveResult()` / `sendResult()`：`saveResultItemToAssets` / `sendResultItemToCanvas`
  - 结果卡动作条 `remove-pen-save` / `remove-pen-send` + 回执 `remove-pen-result-feedback`
- `web/src/components/tools/workspaces/printing-repair.tsx`
  - `PrintingRepairResultActions`：存入资产库 / 发送画布 / 下载
- 测试：`mask.test.tsx` 新增「局部消除结果动作」2 例；`printing-repair-result-actions.test.tsx` 3 例

## 验证
- `tsc --noEmit` → 0 错
- `bun test src/components/tools/workspaces` → **28 pass / 0 fail**（6 文件）
- 真实链路跑通两轮（PRINTING_REPAIR 15:52Z 提交 → 出图 1024²；REMOVE_PEN 16:11:08Z 提交 → 34s 出图）

## 坑 / 结论
- **Vite HMR 后工具任务会假挂起**：改完源码不经整页 reload 直接提交，面板「正在提交…」可挂 8min+；整页 reload 后同参数 34s 出图。验收真实链路前必须 `location.reload()`
- 页面内 `fetch` 探针抓不到工具任务提交（走别的通道），只能靠 DOM 面板判定
- 上游出图时长波动：20s ~ 5min+
- `mask.tsx` 中另有一处**他人在做**的 AREA_REPAIR 改动（并发 1 + onOutcome），提交时已用 blob 隔离，只提交本任务片段，工作区保留其改动

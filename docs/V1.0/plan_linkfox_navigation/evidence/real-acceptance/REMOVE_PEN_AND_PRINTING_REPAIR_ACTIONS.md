# REMOVE_PEN / PRINTING_REPAIR 真实动作复核（2026-10-28）

## 门禁结果

### PRINTING_REPAIR（已完成）
- 真实输出：上游 OSS `1793202782_9bc88d2ecc63458197b17383e39c7138.png`，naturalWidth=1024
- 资产 ID：`zCnoGDyr`（点「存入资产库」后按钮禁用 → 回执）
- 画布：项目 `60gWQnVc` 节点 `image-17`（点「发画布」回执），并独立打开 `/canvas/60gWQnVc` 交叉验证 1 个节点真实图片
- 页面证据：`data-testid=printing-repair-save / -send / -download` 三动作渲染并逐一真点

### REMOVE_PEN（代码已补齐，真实动作点击待最终一次出图）
- 15:59:07 一次真实成功：20s，结果 `1793203168_558343828fc0b.png`
- 该版本结果卡缺「存入资产库 / 发送画布」→ 本次修复
- 16:02:32 复跑用于验证新动作条，上游长时间未返回（>5min running）

## 代码改动
- `web/src/components/tools/workspaces/mask.tsx`（REMOVE_PEN 组件）
  - 新增 `resultItem()`：只包装本次真实返回的 `view.imageUrl`，无 url 直接拒绝，不造占位图
  - 新增 `saveResult()` / `sendResult()`：调用 `saveResultItemToAssets` / `sendResultItemToCanvas`
  - 结果卡底部新增动作条 `remove-pen-save` / `remove-pen-send` + 回执 `remove-pen-result-feedback`
- `web/src/components/tools/workspaces/printing-repair.tsx`（上一提交 a735c20 已含）
  - `PrintingRepairResultActions`：存入资产库 / 发送画布 / 下载

## 验证
- `./node_modules/.bin/tsc --noEmit` → 0 错
- `~/.bun/bin/bun test src/components/tools/workspaces` → 26 pass / 0 fail

## 坑
- Vite HMR 整页刷新会清空涂抹与 run 状态（首次验证跑就是这样“消失”的），验收期间不要改仓库源码
- 页面内 `fetch` 探针抓不到工具任务提交（走的是别的通道），只能用 DOM 面板判定
- 上游出图时长波动大：同类请求 20s ~ 5min+

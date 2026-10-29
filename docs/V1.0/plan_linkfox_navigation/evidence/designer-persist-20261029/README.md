# NEW_DESIGNER 真实任务持久化 + fresh reload 历史（2026-10-29）

## 改了什么
- `824405a` NEW_DESIGNER 导出即落真实任务：`runDesigner` 回传 `onDone` + `persist=upsertTask`，
  任务带 `inputSnapshot`（可回放文档）、`upstreamProvider=designer-canvas-composite`；
  历史坞对带快照的任务多出「回放画布」按钮（`stores/use-tool-replay-store` 做信箱）。
- `46d05f4` 结果项携带真实 `composite.blob` → `ingestResultMedia` 写入 media_files 并回写
  `storageKey`，刷新后按 storageKey 重建 URL。修复刷新后「存资产/发画布」报 `Failed to fetch`
  （根因：`isFetchableResultUrl` 只认 http(s)，`blob:` 不入库 → 无 storageKey 兜底）。

## 如何验证（真实浏览器，非 mock）
脚本：`e2e-designer-persist.mjs`、`e2e-verify-actions3.mjs`（playwright + 系统 Chrome，
`channel:"chrome"`；dev server 127.0.0.1:3000）。直接读码不可替代。

实测链路：
1. 打开 `/tools/product-design/new-designer`，`input[type=file]` 上传 `dist/logo.png` → 图层 1。
2. 点 `designer-export` → 任务 `succeeded`，`engine=designer-canvas-composite`，
   item `bytes=267296`、1200×1200。
3. `page.reload()` → 历史坞 `1 条`、1 个下载/存资产/发画布按钮（无注入历史，
   全部来自导出时真实落盘的任务）。
4. 点「回放画布」→ 提示「已回放历史任务 task-… 的画布（1 个图层 · 1200×1200）」，`layers=1`。
5. 刷新后三动作实测反馈：
   - 下载：`已下载 new-designer-result-1.png`
   - 存资产：`已存入资产库（image · EEWgIMVxDmOgamZYM2H7j）`
   - 发画布：`已发送到画布（uxd2yLMCnClOjyOkPPfie / image-1793267628816-wfoqs）`
6. 刷新后 item 仍带 `storageKey=tool-result:*`，url 由 storageKey 重新生成（新 blob id）。

单测：`bun test src/features/tools/adapters/new-designer.test.ts` 36 pass、
`tool-history-dock.test.tsx` 7 pass；`tsc --noEmit` 通过。
全量 `bun test`：1412 tests / 4 fail / 4 errors —— 4 个失败全部是
`web/tests/*.spec.ts`（Playwright e2e）被 bun test 误跑，与本改动无关，未处理。

## 已知边界 / 风险
- 合成走本地 canvas（无外部 provider 调用），未提交任何 LLM 生成请求。
- 旧任务若仍是 `blob:` 无 storageKey（本次修复前的历史数据），刷新后仍取不到字节；
  需要重新导出一次才会带有 storageKey。
- `web/temp/` 下的临时脚本已清理，仅本目录保留脚本副本与截图。

# AI_DRESSING_XSY 真实持久化验收（2026-10-29 续做）— 结果

## 结论速览
- 真实 UI 提交 1 次（连体衣服，输出 1 张）→ 真实出图 1576288B / sha256 `a52e70d4…4a8a94`，原始回执 2.1MB 落盘。
- **修复前 fresh reload = 真实缺陷**：任务已持久化、历史坞显示「已完成 1 条」，但工作区结果区空（无图 / 无下载 / 无存资产 / 无发画布）。
- **修复后 fresh reload = 通过**：结果区 1 张图、ToolResult 1 图 + 下载/存资产/发画布可用；重新下载字节 sha256 与原图完全一致。

## 事实（读码 + 实测）
- 仓库 HEAD = e8121d7；`32ef68e` 只改了 PRODUCT_SCENE/AI_WEARABLE 的 `getPersistedToolGateway()`，没改 XSY。
- XSY 提交链：`dressing-xsy.tsx submit()` → `createXsyRunPort().run()` → `useToolTaskStore.runTool()` → 持久化网关 → 真实 `POST /v1/images/edits`（经代理）。
- 缺陷根因：`dressing-xsy.tsx` 结果区只读内存态 `outcome`（`mapXsyTaskToOutcome`），`ToolResult` 只拿到会话内 `task`；刷新后两者都空 → 与 `color.tsx:501` 的 `useRestoredTask` 模式不一致。
- 修复：
  1. 接 `useRestoredTask(toolId, task)`，`ToolResult task={activeTask}`；
  2. 结果图走 `xsyDisplayImages(outcome?.images, restoredImages)`（adapter 内纯函数：内存有实时结果用实时，否则回落持久化任务的图）。
- 真实 provider：`ccai-accept::gpt-image-2`（channels ccai-accept / sf-accept，keyLen 67，proxy 开启），由 `web/scripts/real-acceptance/provider.mjs` 从 keychain 注入，未打印密钥。
- 提交前历史坞 0 条（干净基线），提交后 1 条。

## 证据文件
- `result-0.png` 1576288B，sha256 `a52e70d46e31cbc47e307113a6f5592ab6f40c14884483ac527dba173e4a8a94`
- `provider-receipt.json` / `provider-receipt-raw.json`（原始响应 2104232B，含 b64_json 2101720 字符）
- `run-summary.json`：afterSubmit（dock 1 条、grid 1、ToolResult 1 图、download 可用）/ afterReload（修复前：dock 1 条但 grid 0、ToolResult 0 图、download 无）
- `reload-summary.json`：修复后 reload 取证（grid 1、ToolResult 1 图 + 总结「共 1 个结果 · 图片 1」、download 可用）
- `downloads/` 三次真实下载（提交后 / 修复前 reload / 修复后 reload），后两者 sha256 均等于原图
- 脚本：`web/scripts/real-acceptance/xsy-persist-restore-20261029.mjs`（`submit` | `reload`，`IC_DRY=1` 为试跑不提交）

## 验证
- `bun run typecheck` → EXIT 0
- `bun test src/components/tools/workspaces/dressing-xsy-restore.test.tsx src/features/tools/adapters/ai-dressing-xsy.test.ts` → 20 pass / 0 fail
- 全量 `bun test` → 1402 pass；4 fail 全部来自 `tests/*.spec.ts`（Playwright e2e 被 bun test 误扫，既有问题，非本次改动）

## 资产 / 画布落盘复核（只读 + 一次不扣费点击）
- 「存资产」：路径 `ToolResult` → `saveResultItemToAssets` → `use-asset-store` 持久化到 **IDB `infinite-canvas` / `app_state` 键 `infinite-canvas:asset_store`**（localForage 字符串化）。
  实测存在记录：`{ id: RDLBH3-mg4hSTH0KdUJDZ, title: "AI_DRESSING_XSY 结果 1", bytes: 1576288, storageKey: image:XAUAz1Ga6DpW1DajoNyNt, meta.taskId: task-mvtbf7ue-n28x46, createdAt 09:03:13Z }` → 刷新后仍在（真复现）。
- 「发画布」：写入 `infinite-canvas:canvas_store`，**持久化有 400ms 防抖**（`use-canvas-store.ts` setItem + setTimeout）。
  提交脚本点完立刻 reload，定时器被卸载打断 → 当时 `projects: []`。补做一次（不调用 provider，不扣费）：
  点「发画布」→ 出现 `l5Gt5e9TKXkwgbLFZ8lt-`（1 节点 / 1 图）→ 等 3s → reload → **仍在**（`canvas-persist-check.json`）。
  结论：是脚本时序现象，不是产品缺陷；用户正常停留不会触发。

## 已知脚本小瑕疵（不影响结论）
- `reDownload.bytesMatchOriginal` 在 reload 阶段恒为 false：脚本拿 `summary.result`（reload 阶段为 null）对比；字节一致性以 sha256 == 原图为准（已核对相等）。

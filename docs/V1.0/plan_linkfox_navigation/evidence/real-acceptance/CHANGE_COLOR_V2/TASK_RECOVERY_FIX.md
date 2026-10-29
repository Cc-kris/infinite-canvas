# CHANGE_COLOR_V2 任务终态不收敛：根因与修复（2026-10-29）

## 现象（独立矩阵 worker 实测，未标 PASS）

真实链路跑 CHANGE_COLOR_V2（提色 → 4 单元矩阵）后，历史里出现：

- 2 条任务永久停在「提交中」；
- 2 条任务停在「结果未知」；
- 刷新页面任意次都不变化，历史记录永远不给结论。

## 根因（两处，都在共用任务层，不在换色适配器）

1. **恢复流程没有调用方**：`web/src/stores/use-tool-task-store.ts` 已实现
   `hydrateAndRecoverToolTasks()`（hydrate 落盘快照 + `recoverAll()`），但全仓
   grep 调用方为 0。刷新后任务只是被原样从 localStorage 读回来，
   没有任何代码去查询上游或收敛终态 → 「提交中 / 结果未知」永久停留。

2. **恢复本身也不收敛**：`gateway.recover()` 对「没有 upstreamTaskId」的任务
   只会写回 `unknown`（注释里明说服务端没有按 clientOperationId 反查的接口）。
   `unknown` 仍是非终态，于是依然没人推进。

3. **提交没有本地时限**：`executeImage()` 直接 await provider 请求，代理/上游
   挂住时页面侧任务会一直停在「提交中」。

## 修复

| 文件 | 改动 |
| --- | --- |
| `web/src/services/api/tools/gateway.ts` | `recover()`：`plan.action === "none"`（已终态 / 未提交）早退，不误伤终态任务；对 `reconcile` 且没有 `upstreamTaskId` 的任务调用新增的 `closeUnconfirmed()`，收敛为**终态 failed**，`error.code = submit-unconfirmed`、`reconcileRequired = true`、`retryable = true`，文案明确「重试前先到服务商后台确认，避免重复计费」。仍然**绝不自动重提交**（`canAutoResubmit` 不变）。 |
| 同上 | `executeImage()`：新增 `IMAGE_REQUEST_TIMEOUT_MS = 10min` 本地超时；超时（非用户取消）走同一个 `closeUnconfirmed("submit-timeout")`，避免活会话里永久「提交中」。 |
| `web/src/features/tools/use-task-recovery.ts`（新增） | 页面挂载执行一次 `hydrateAndRecoverToolTasks()`，失败静默（任务仍在本地，下次挂载再试）。 |
| `web/src/features/tools/tool-page.tsx` | `ToolPage` 调用 `useTaskRecovery()`，所有工具页统一生效。 |
| `web/src/components/tools/tool-task-history.tsx` | 失败/未定任务在历史列表直接显示 `task.error.message`（`data-testid="tool-task-history-error"`），不再只有红点。 |

状态机本身（`task-machine.ts`）未改语义：不自动重提交这条不变量保持。

## 验证

### 单测（新增）

`web/src/services/api/tools/gateway.recovery.test.ts`（4 例，全过）

- 刷新后「提交中」且无 upstreamTaskId → 收敛 failed，`canAutoResubmit` 仍为 false；
- 刷新后「结果未知」且无 upstreamTaskId → 同样收敛 failed；
- `recoverAll()` 把落盘的所有未完结任务一次收敛，不留非终态；
- 已终态任务不被 recover 改动（这条测试当场抓出 `failed → failed` 非法转移的真实 bug，已修）。

全量：`bun test src/services/api/tools src/components/tools src/features/tools` → **1309 pass / 0 fail**；
`bunx tsc --noEmit` → **exit 0**。

### 真实浏览器验收（dev 服务 127.0.0.1:3000）

1. 在 localStorage 写入两条快照：`status=submitting`、`status=unknown`，
   均无 `upstreamTaskId`，`submittedAt` 为 10 分钟前（超出 60s 提交宽限）；
2. 打开 `/tools/ecommerce-suite/change-color-v2` 并 reload；
3. 结果（原始证据：`round3-recovery-20261029/recovery-ui-evidence.txt`）：

```
probe-submitting → failed, code=submit-unconfirmed, reconcileRequired=true
probe-unknown    → failed, code=submit-unconfirmed, reconcileRequired=true
历史面板 dockItems: [{status:"failed", text:"…失败 recovery probe…"} ×2]
stillNonTerminal: []   // 刷新后已无任何非终态残留
```

探针已从 localStorage 清除，未污染用户历史。

## 未完成 / 风险

- 没有 `upstreamTaskId` 的任务在服务端确实无法反查（缺 `clientOperationId` 查询接口），
  因此只能收敛成「失败 + 请先确认」，不能自动判定真实结果；这是产品决策而非实现遗漏。
- 若后续新增按 `clientOperationId` 反查的接口，应把 `closeUnconfirmed` 换成真实查询，
  `planRecovery.reason` 已预留 `reconcile` 语义。
- 本轮真实出图仍受环境限制：代理 `127.0.0.1:23210 → api.openai.com/v1/images/edits`
  返回 401（4/4 单元失败），属凭据/代理问题，不在本次代码修复范围，故本工具
  **仍未获得真实成功出图证据，不标 PASS**。

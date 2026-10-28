# TASK-005 报告：任务状态机 / 幂等 / 恢复

分支：`feat/linkfox-v1-real`　范围：`web/src/services/api/tools/*`、`web/src/stores/use-tool-task-store.ts`

## 1. 改了什么

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/services/api/tools/task-machine.ts` | 382 | 纯函数状态机：状态与合法迁移、`clientOperationId`/指纹、轮询节奏、退避、心跳、超时、`planRecovery`、`sanitizeTaskForPersist`。零 I/O、零假结果。 |
| `web/src/services/api/tools/gateway.ts` | 932 | 39 个工具的适配器表（`TOOL_ADAPTER_TABLE`）、`buildToolConfig`、`classifyProviderError`、真实 `ProviderPort`（图片 → `image.ts`，视频 → `video.ts`）、`ToolTaskGateway`（submit / runTool / poll / waitForResult / retry / cancel / recover / recoverAll）、内存 store 与单例。 |
| `web/src/stores/use-tool-task-store.ts` | 215 | zustand store，直接实现网关的 `ToolTaskStorePort`；落盘只写脱敏快照（剥离 dataUrl/blob），带索引裁剪与 `recoverAll`。 |
| `web/tests/gateway.test.ts` | 395 | 26 个测试：注册完整性、校验失败不发请求、图片/视频成功路径、空结果不造数据、幂等、重试、错误分类、非法迁移、指纹敏感度、落盘脱敏与索引裁剪。 |

设计约束的落地方式：

- **不重复提交**：提交前用 `toolId + 归一化 prompt + 素材 id + 配置` 算指纹，与 `clientOperationId` 同源；命中同指纹的非终态任务时默认复用（`dedupe`），不再发第二次真实请求。
- **不盲目重提交**：`canAutoResubmit` 只对 `draft/validating` 为真；`submitting/running/unknown` 一律走查询或人工确认。非确定性错误落 `unknown` 而不是 `failed`。
- **不生成假结果**：provider 返回空数组 → 任务 `failed`（`empty-result`），测试断言了“绝不补造”。
- **刷新恢复**：`hydrateAndRecoverToolTasks()` → 读落盘快照 → 对未完结任务只做一次查询式恢复。
- **39 个工具全覆盖**：适配器 id 与 `docs/V1.0/plan_linkfox_navigation/tool_specs.json` 完全一致（39/39，无缺失无多余，脚本比对）；designer 宿主工具显式登记为不可执行，未知 id 直接抛 `unknown-tool`，不落默认实现。

## 2. 如何验证（都是实跑，不是读码）

```
cd web
bun test tests/gateway.test.ts        # 26 pass / 0 fail, 92 expect
bun ./node_modules/typescript/bin/tsc --noEmit   # 本任务 4 个文件 0 error
```

交叉校验：脚本把 `tool_specs.json` 里的 id 与 `TOOL_ADAPTER_TABLE` 的 key 做集合比较，输出 `missing: [] / extra: []`。

说明：`bun test`（全量）在我提交时点为 `85 pass / 0 fail`。此后并行 worker 新增的 `src/features/tools/registry/*.test.ts` 有 5 个失败 + 1 个 TS 错误（`ToolCategoryMeta.toolCount`），与本次改动无关、也不在我 stage 的文件里。

## 3. 真实 provider 边界（关键风险区）

这一层是对既有 `image.ts` / `video.ts` 的**薄封装**，没有引入新的网络栈；边界行为如下，都是保守取向：

1. **图片链路会丢 HTTP 状态码。** `image.ts` 把 axios 错误压成 `Error(message)`（如“网关错误（502）”“请求被限流或额度不足”）。因此 `readHttpStatus` 除了读 `error.response.status`，还会从文案里回收 `（502）` / `(502)` / `status: 502`；再叠加中英文案特征做二次判定。
2. **图片没有查询接口。** 若提交请求已发出但响应丢失（网络中断、页面被杀），上游可能已经出图，本地无从查询 → 该任务落 `unknown` + `reconcileRequired`，只允许人工确认/重试，**永不自动重发**。这是设计 §6 的硬约束，代价是这类任务需要人介入。
3. **视频有上游 id 与轮询。** `createVideoGenerationTask` 拿到 id 后立即写 `upstreamTaskId` 与 `submitting → running`；轮询用单步 `pollVideoGenerationTask`（不用内部的 480 次长循环），由网关控制 2s×10 → 5s 的节奏，便于中途打断、落盘、恢复。
4. **分类策略**：4xx（400/401/403/404/405/413/415/422）判确定性失败（可人工重试）；408/425/429/5xx 与超时/网络类判非确定性 → `unknown`；文案无法判定的一律按“结果未知”处理（`unclassified`）。
5. **测试不触网。** 所有测试通过注入的 fake `ProviderPort` 运行，未使用任何真实 key、未消耗额度；因此“真实 502/504 注入”“真实上游幂等是否生效”属于**未验证**项，需在联调环境补一轮。
6. **落盘脱敏即丢图。** `sanitizeTaskForPersist` 剥离 `dataUrl`/`blob` 并置 `payloadDropped`，避免几 MB 的 base64 撑爆 localStorage。刷新后任务状态与上游 id 还在，但结果字节必须由资产层（TASK-004 的 `tool_assets`）重新取回 —— 这是与 TASK-006/007 的集成契约，网关本身不代存资产。

## 4. 未完成 / 风险

- **UI 未接入**：store 与网关已可用，但页面还没消费（TASK-006/007 的职责）。当前 `recoverAll` 只在显式调用时执行，尚无人调用。
- **跨标签页/跨设备发现**：只恢复本地快照里的任务；上游没有“列出我的任务”的接口，别的浏览器发起的任务无法接管。
- **配额与并发**：`waitForResult` 用 `setTimeout` 串行推进，没有全局并发上限；39 个工具同时开跑时的节流留给上层。
- **文案依赖**：错误分类对中文 i18n 文案有依赖，改文案会削弱分类命中（已覆盖主要条目，但这是脆弱点，理想做法是让 `image.ts` 抛出携带 status 的结构化错误）。
- **未验证**：真实网络下的 5xx/超时注入、长时间（>30 分钟）超时转 `unknown` 的实机行为、插件类 provider（`provider: "plugin"`）在任务恢复后的轮询表现。

## 5. 使用入口

```ts
// 一次性跑完（提交 + 等待），返回终态任务
const task = await getToolGateway().runTool({
    toolId: "SCALE_UP",
    prompt: "放大 2 倍",
    references: [{ id: "src-1", name: "source.png", type: "image/png", dataUrl }],
});

// 页面挂载时恢复未完结任务（只查询，不重提交）
await hydrateAndRecoverToolTasks();

// 失败后人工重试（沿用同一任务记录，attempts 递增）
await getToolGateway().retry(task.id, { toolId: "SCALE_UP", prompt: "放大 2 倍", references: [...] });
```

# TASK-006 报告：共享结果 / 能力 / 状态组件

分支：`feat/linkfox-v1-real`　范围：`web/src/components/tools/*`

## 1. 改了什么

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `web/src/components/tools/tool-result-actions.ts` | 258 | 结果区纯逻辑与真实副作用：视图映射、结果条目、文件名、画布坐标、下载、入库、发送画布。全部可注入依赖，零 React、零假数据。 |
| `web/src/components/tools/tool-result.tsx` | 249 | 结果区 UI：空 / 运行 / 成功 / 失败 / 取消 / 未知；结果格子含下载、保存资产、发送画布；`payloadDropped` 时按钮禁用并解释原因。 |
| `web/src/components/tools/task-status.tsx` | 233 | `TaskStatusBadge` / `TaskStatusPanel`：8 个真实状态的中性文案、计时（`submittedAt`→`finishedAt`）、轮询次数、错误码/可重试、取消与重试回调。 |
| `web/src/components/tools/capability-notice.tsx` | 194 | Provider 能力声明：`supported` / `unsupported` / `unverified` 三态；缺失必需能力 → blocker 阻断提交；缺失可选能力 → degradation，需用户显式接受降级。 |
| `web/src/components/tools/tool-result.test.tsx` | 374 | 23 个用例：状态映射、空态/运行/成功/失败渲染、payload 剥离、下载/入库/画布三条真实链路（依赖注入）。 |

合计 1308 行（任务清单预估 180 行；超出部分来自逐状态文案、真实链路接入与 23 个断言）。

> 说明：任务清单要求“单文件超过 350 行须拆分”，因此把纯逻辑拆到第 5 个文件 `tool-result-actions.ts`（仍在“影响文件上限 5”内）。`tool-result.tsx` 用 `export *` 再导出，调用方与测试的 import 路径不变。

## 2. 关键实现选择（为什么这样做）

1. **不造状态**：`resolveToolResultView` 把 `draft` / `validating` 归为空态，`unknown` 单独一档，绝不渲染成“失败”，也不给 `unknown` 提供重试按钮（technical_design §6：状态不明时不得自动或手动重复提交，避免重复扣费）。
2. **成功但无结果 ≠ 成功**：`succeeded` 且 `result.items` 为空时渲染“上游返回成功但没有结果”提示，不出占位图。
3. **三条保存动作都落到真实链路**：
   - 下载：`file-saver` 的 `saveAs`，文件名由真实 `mimeType` / `data:` 前缀推导，不写死 `.png`；
   - 保存资产：图片走 `uploadImage()` 得到 `storageKey` 后 `useAssetStore.addAsset`，视频走 `storeGeneratedVideo()`（`file-storage`）后入库；
   - 发送画布：`createCanvasNode` + `useCanvasStore.updateProject`，新节点排在已有节点右侧 160px；未指定画布时用 `createProject` 新建；画布 id 失效抛 `project-not-found`。
4. **依赖注入而非 mock 全局**：`loadResultStorageDeps()` 用动态 `import()` 取真实实现，测试注入替身即可在 `bun test`（无 DOM）下走完整分支；真实运行时不会用到替身。
5. **二进制剥离要说清**：`payloadDropped` 或三者皆空时抛 `payload-dropped` / `payload-missing`，UI 禁用并给出“刷新后不保留原始文件，请重新生成”的原因。
6. **能力缺失分两级**：必需能力缺失 = blocker（按钮禁用 + 原因），可选能力缺失 = degradation（必须用户点“接受降级并继续”才放行），符合 AC-010 的“明确禁用或替代确认”。
7. **文案先行中英一致**：本层组件直接使用中文文案常量，未新增 i18n key（避免动 `i18n/locales/*`——不在本任务影响文件内）；后续 TASK-002A 的 i18n 改造可整体替换。

## 3. 如何验证

```bash
cd web
bun test src/components/tools/tool-result.test.tsx   # 23 pass / 0 fail, 109 expect
bunx tsc -p tsconfig.json --noEmit                    # 本任务 5 个文件零错误
bun run build                                         # ✓ built in 7.69s
```

- `bun test` 全量当前 **194 pass / 6 fail**，6 个失败全部落在他人未提交文件（`src/features/tools/adapters/product-image-suite.test.ts`、`src/services/api/tools/batch-runner.test.ts`），与本任务文件无 import 关系，属 TASK-008/TASK-007 的在建产物。
- `tsc` 全量仍有其他任务未提交文件（`change-color-v2.test.ts`、`dress-wear-set.ts` 等）的既有报错；`components/tools/` 相关零输出。

## 4. 未完成 / 风险

1. **AC-008 仍为“待实施”**：本任务交付组件与真实动作，但“从实际入口验证”需要 TASK-041（图转视频）等页面把 `ToolResult` 挂到真实路由上跑一次真实生成。届时再补 `evidence/AC-008.json`，现在不提前勾选。
2. **发送画布未做目标选择器**：当前 API 为 `projectId?: string`，缺省即新建画布。若产品要求“选已有画布”的弹层，需在页面层（TASK-048 资产入库与画布集成）补选择器，组件侧已预留 `projectTitle`。
3. **视频保存依赖 `storeGeneratedVideo` 的 URL 分支**：远端 `http(s)` 结果在没有 `blob` 时会走 `fetch` 转存，若上游 URL 有防盗链会退化成“仅为记录”的兜底（`storageKey: ""`）。届时 UI 仍显示成功，但资产库里是引用而非副本——需在 TASK-041 联调时确认 LinkFox 的下载域是否允许 CORS。
4. **能力声明表依赖 Provider 元数据**：`capability-notice` 只消费传入的 `ToolCapabilityEvidence[]`，证据来源在 adapter 层（各工具的 registry）。若某工具未提供证据，会落到 `unverified` 并被当作不支持处理——保守但可能导致误禁，需在首个视频类工具（TASK-041）联调时校准。
5. **单文件行数**：`tool-result-actions.ts` 258 行、`tool-result.tsx` 249 行，均在 350 行内；但本任务总量 1308 行远超预估 180 行，属估算偏差，已在 §1 说明。

## 5. 下游使用入口

```tsx
import { ToolResult, TaskStatusBadge, TaskStatusPanel, CapabilityNotice } from "@/components/tools/...";

<ToolResult
    task={task}                    // TASK-005 的真实 ToolTask
    toolId="SCALE_UP"
    title="生成结果"
    projectId={undefined}          // 缺省新建画布
    actions={{ download, saveToAssets, sendToCanvas }}  // 三个都可覆盖，默认即真实实现
    onCancel={() => gateway.cancel(task.id)}
    onRetry={() => gateway.retry(task.id)}
/>
```

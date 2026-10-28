# TASK-048 结果资产入库与发送画布 — 实施报告

- **分支**：`feat/linkfox-v1-real`
- **代码提交**：`6f0a0c4` feat(tools): TASK-048 结果资产入库与发送画布（真实媒体链路 + 幂等/过期/撤销 + 30 项测试）
- **测试**：`web/src/services/api/tools/result-assets.test.ts` — **30 pass / 0 fail**（95 expect）
- **类型检查**：`bun run typecheck` — 我涉及的文件 **0 error**（仓库内仍剩 1 条来自他人未跟踪新文件，见 §6）

## 1. 交付物（严格限定在授权文件内）

| 文件 | 变更 | 说明 |
|---|---|---|
| `web/src/services/api/tools/result-assets.ts` | 新增 571 行 | 结果资产服务唯一权威实现：能力门禁 / 过期判定 / 入库 / 批量 / 发送画布 / 撤销 / UI 门面 |
| `web/src/services/file-storage.ts` | +108 / -9 | 真实媒体下载（超时+取消+HTTP 校验）、0 字节拒绝、魔数嗅探 MIME、`mediaStorageStatus` 过期检测 |
| `web/src/stores/use-asset-store.ts` | +68 / -9 | `upsertAsset` / `replaceAsset` / `removeAssets` / `setAssetStale`、`AssetBase.revision+stale`、视频 `durationMs`、水合期 stale 标记 |
| `web/src/services/api/tools/result-assets.test.ts` | 新增 465 行 | 30 项测试，全部依赖注入，断言真实分支（含失败路径） |

未改动 `tool-result-actions.ts`（TASK-006 所有）。

## 2. 关键实现点

1. **能力门禁（`resultCapability`）**：统一给出 `canSave / canSendToCanvas / canSendAsVideoNode / blockers`。
   `payloadDropped`、无载荷、过期草稿分别落不同 blocker，UI 不需要自己拼判断。
2. **过期判定（`resultStaleness` + `RESULT_STALE_REASONS`）**：`payload-dropped`、`media-missing`、`draft-revision-mismatch`、`source-replaced`，
   命中即在资产/节点 metadata 里落 `staleReasons`，发送默认拦截（`rejectStale !== false`）。
3. **幂等入库（`ingestResultAsset` + `upsertAsset`）**：以 `resultAssetKey = toolId:taskId:itemId` 为键，
   重复点击「保存」不产生重复资产，而是 `revision + 1` 并返回 `created: false`；撤销恢复旧快照（`replaceAsset`）而非删光。
4. **无假成功**：
   - `file-storage.fetchMediaBlob`：非 2xx 直接 `fetch-failed`，5 分钟超时 → `timeout`，取消 → `aborted`；
   - `uploadMediaFile` 对空字符串/0 字节抛 `MediaStoreError`；
   - 发送画布时若真实上传字节为 0 → `empty-media`，并回滚刚自动创建的空画布（`removeProjects`）；
   - 上传异常 → `upload-failed`（`retryable: true`）；画布不存在 → `project-not-found`。
5. **字段全量保留**：`resultId / taskId / toolId / draftRevision / prompt / model / sourceAssetIds / mimeType / bytes / width / height / durationMs`
   以及扩展 metadata 全部写入资产 `metadata`，并原样带进画布节点 metadata，链路可追溯。
6. **批处理**：`ingestResultBatch` 并发上限 6（默认 3）、`signal` 取消、`onProgress`，单条失败不影响其他条，返回逐条 `ResultItemOutcome`。
7. **发送画布**：`sendResultToCanvas` 复用真实 `canvas-store.updateProject` + `canvas-node-factory`；新节点排在现有内容右侧（`nextResultNodePosition`），不重叠；
   返回 `undo` 句柄，支持摘除节点并清理自动创建且已空的项目。
8. **测试可运行性**：模块内对 `image-storage` / `canvas-node-factory` / store 全部改为**动态导入 + 纯 type 顶层导入**，
   否则 `@/i18n` 在模块加载期读 `localStorage` 会让 bun 测试直接崩（已实测并修复）。

## 3. 验证证据

```
$ cd web && bun test src/services/api/tools/result-assets.test.ts
 30 pass
 0 fail
 95 expect() calls
Ran 30 tests across 1 file. [62.00ms]
```

覆盖的失败/边界路径（非“成功演示”）：

- 0 字节结果 → `empty-media`，资产库不写入、画布回滚；
- 上传抛错 → `upload-failed` + `retryable`；
- `payloadDropped` → 拒绝入库，不落一条打不开的资产；
- 草稿版本不一致 → 入库带 `staleReasons`；
- 开始前 `signal` 已取消 → 零写入；
- 目标画布不存在 → `project-not-found`；
- 严格模式拒绝发送过期结果；非严格模式发送但节点带 `staleReasons`；
- 撤销：只删自己那条资产 / 摘除节点并清理空项目。

```
$ cd web && bun run typecheck
src/features/tools/adapters/video-replication.test.ts(133,49): error TS2345 ...（非本任务文件）
```
本任务 4 个文件 0 error（修复过程中我引入的 2 个类型错误已在本分支前序迭代修掉：`durationMs` 未进 `VideoAsset.data` 类型、`stale-result` 未入错误码联合）。

## 4. 与已有代码的关系

- `tool-result-actions.ts`（TASK-006）保持不变；本模块是能力更强的超集（幂等、过期、批量、撤销、真实字节校验），
  UI 层迁移时把调用点换成 `createResultAssetActions(ctx)` 即可，行为向后兼容。
- 复用而非重写：`image-storage.uploadImage`、`file-storage.uploadMediaFile`、`canvas-node-factory.createCanvasNode/imageMetadata/videoMetadata`、`use-canvas-store`。

## 5. 使用入口

```ts
import { createResultAssetActions } from "@/services/api/tools/result-assets";

const actions = createResultAssetActions({ toolId, taskId, title, draftRevision, prompt, model, sourceAssetIds });

actions.capability(item);        // 按钮可用性 + 拦截原因
await actions.save(item);        // 入库（幂等）
await actions.saveBatch(items);  // 批量（部分成功）
const sent = await actions.send(item, { projectId });  // 发送画布，返回 undo
await actions.undo(sent.undo);   // 撤销
```

## 6. 遗留与风险

1. **仓库内仍有 1 条类型错误**来自 `web/src/features/tools/adapters/video-replication.test.ts`（`createdAt: number` vs `string`）。
   该文件是**他人未跟踪的新文件**（`git show HEAD:` 不存在），不在本任务授权修改范围，未触碰。
2. 入库时若上游只给远程 URL 且该 URL 已过期，会在 `upload-failed` 阶段失败——这是预期行为（拒绝把打不开的地址当结果保存），
   但需要 UI 提示「结果链接已过期，请重新生成」。
3. `mediaStorageStatus` 目前只在资产 store 水合时用于标记视频 stale；图片资产仍沿用原有 `dataUrl` 逻辑，未做 blob 存在性探测（图片走 `dataUrl` 内联，风险较低）。
4. 批量入库并发上限写死 6，未做成可配置常量；如后续需要按工具类型区分，可提到 `BatchIngestOptions`。

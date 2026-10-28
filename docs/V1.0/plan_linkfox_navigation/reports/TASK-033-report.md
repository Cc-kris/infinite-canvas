# TASK-033 场景迁移（SCENE_TRANSFER）实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`e3853d1` feat(tools): 场景迁移 SCENE_TRANSFER 契约、适配器与工作区
- 页面规格：[`page-specs/33-scene-transfer.md`](../page-specs/33-scene-transfer.md)
- 契约来源：`web/src/features/tools/registry/index.ts` 的 `ToolSpec`（index 33、makeType 63、slug `scene-transfer`、route `/tools/product-design/scene-transfer`、layout `scene`、adapter `image`），字段只有 4 个：`imageStyleUrl` / `imageUrl` / `segImageUrl` / `similarity`
- 网关契约：`web/src/services/api/tools/gateway.ts#TOOL_ADAPTER_TABLE.SCENE_TRANSFER`（`kind: image`、`requiresReferences: true`、`promptRequired: true`、上述 4 字段）

## 1. 改了什么（4 个文件，1675 行）

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `web/src/features/tools/registry/scene-transfer.ts` | 365 | 页面事实来源：4 字段契约、相似度收敛、提示词构造、提交前校验、快照与漂移判定、草稿读写 |
| `web/src/features/tools/adapters/scene-transfer.ts` | 427 | 运行链路：参考图/字段构造 → 提交前守卫 → 真实 `submit`/`waitForResult`/`retry` → 结果单元与能力说明 |
| `web/src/components/tools/workspaces/scene.tsx` | +410 | 追加 `SceneTransferWorkspace`（原 `SceneWorkspace` 默认导出与 `ProductSceneWorkspace`/`FissionLinkWorkspace` 均未改动） |
| `web/src/features/tools/adapters/scene-transfer.test.ts` | 473 | 29 例测试（契约、分割图不伪造、请求守卫、fake gateway 真实提交、结果单元、SSR 渲染） |

### 1.1 registry：只认这 4 个字段

- **相似度**：`SCENE_TRANSFER_SIMILARITY`（min 0 / max 100 / step 5 / 默认 70），`clampSimilarity()` 把任意输入按 5 的步长四舍五入并夹紧——`73 → 75`、`"88" → 90`、`Infinity → 70`。相似度同时出现在**提示词**（`similarity = N%`）、**字段**（`similarity`）和**快照**三处，任何一处被吞都会在提交前抛错。
- **提示词**：`buildTransferPrompt(values, segmentation)` 明确参考图顺序（第 1 张商品、第 2 张场景风格、第 3 张商品分割图），并区分「有分割图 → 按边界迁移、背景完全替换」与「无分割图 → 整图级迁移，不要假设已分割」。
- **分割图不伪造**：`resolveTransferSegmentation({ segImageUrl })` 只有拿到 `http(s)` / `data:` / `blob:` 这类**真实可读地址**才返回 `provided: true`；否则 `provided: false` 并带原因文案（`没有分割图时不要假设已经分割…`）。**本仓库没有本地分割服务**（全仓检索只有 `resolveSceneSegmentation` 的同名判定，无推理服务），因此 UI 不提供"自动分割"，只接受用户主动上传，缺失时如实标注。
- **校验**：`validateSceneTransferState()` 逐条给具体 code——`product-missing`、`style-missing`、`model-missing`、`similarity-invalid`、`not-executable`、`segmentation-missing`（仅当调用方显式 `requireSegmentation` 才阻断，默认不阻断但会提示）。
- **快照**：`createSceneTransferSnapshot()` 锁定 `toolId / revision / productAssetId / styleAssetId / segAssetId / similarity / prompt / fieldKeys`；`describeTransferDrift()` 比对当前值与快照，结果页据此标「旧配置」，不用旧图冒充新参数。

### 1.2 adapter：提交前把不一致挡住

- `buildTransferInput()` 产出 `toolId + prompt + references + count:1 + fields`；`references` 顺序固定 `[商品图, 场景风格参考图, (商品分割图)]`。
- `buildTransferFields()` 里 `imageUrl` / `imageStyleUrl` 用 `transferImageRef()`（`http(s)` 链接原样、本地资产退化为 `assetId`，**data URL 不进字段**，避免把 base64 塞进上游字段）；`segImageUrl` 只在真有分割图时写入。
- `assertTransferInput()` 三道守卫在 `submit` 之前跑：`similarity` 字段值必须等于收敛后的值且提示词含 `similarity = N%`；参考图数量必须与分割图有无一致（2 或 3）；参考图顺序不得颠倒。任一不符抛 `SceneTransferAdapterError`，不降级发送。
- `runSceneTransfer()`：`gateway.submit(input, { signal, draftRevision })` → `waitForResult` → 返回 `{ task, snapshot }`，`onUpdate` 逐次回传任务状态；`retrySceneTransfer()` 用 `gateway.retry(taskId, 当前页面参数)`，避免拿旧参数重试。
- 结果侧：`sceneTransferItems()` / `sceneTransferCells()`（`ready` / `missing` / `failed` / `pending` 四态，`cancelled`→failed，`unknown`→pending 并说明"上游状态未知"）、`summarizeTransferExecution()`（网关字段缺失只做说明，不做可用性承诺）。

### 1.3 workspace：双图 + 相似度滑杆 + 真实结果

`SceneTransferWorkspace`（`workspaces/scene.tsx` 追加，命名导出）：

1. **商品图**：`ToolAssetInput` 单张（`toolId` = `${toolId}-product`，≤10MB，PNG/JPEG/WebP）。
2. **场景风格参考图**：单张（`-style`），与商品图互不复用。
3. **商品分割图（可选）**：单张（`-seg`），无分割服务时给明确说明，不上传就不写 `segImageUrl`。
4. **相似度**：0–100 步长 5 的滑杆 + 三个预设（30 轻度 / 55 平衡 / 80 强风格），保留原 `similarity` 字段名进草稿。
5. **生成与结果**：`product / style / model / similarity` 任一不就绪时按钮 `disabled`，`data-testid="scene-transfer-issue"` 列出**每条真实原因**；生成中可取消；结果区用 `ToolResult` 展示，失败不发占位图。
6. **本次提交快照**：`data-testid="scene-transfer-snapshot"` 显示锁定的商品图/风格图/分割图/相似度；无提交时给空态文案。

状态链路沿用既有模式：`useToolDraftStore` 草稿（`hydrate` → `patch` 防抖 → `flush`），刷新后按 assetId 重新解析，解析不到时提示而非静默丢图。与 NEW_REPLACE_BG_V2 / PRODUCT_SCENE / FISSION_LINK 不共享任何 state。

## 2. 如何验证

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
export PATH=$HOME/.bun/bin:/usr/local/bin:$PATH
bun test src/features/tools/adapters/scene-transfer.test.ts   # 29 pass / 0 fail / 105 expect
npx tsc --noEmit -p tsconfig.json                             # 0 error（全库）
```

测试覆盖的关键点（都是跑出来的，不是读代码得出的结论）：

- 常量与 registry 一致（index 33 / makeType 63 / layout `scene` / route）；
- 网关 4 字段与页面契约完全对齐（动态 import 真网关比对，不写死）；
- 相似度 `73→75`、`"88"→90`、`Infinity→70`、`serialize(42)→40`；
- 无分割图 → 不写 `segImageUrl` + 提示词走整图迁移；有真实分割图 → 3 张参考图 + 字段写入；
- `data URL` 不进字段、纯 `assetId` 不可当引用、`similarity` 被吞/丢图/多图/顺序颠倒都会抛错；
- fake gateway 下真实提交一次、缺模型或缺风格图不提交、重试沿用当前参数；
- 结果单元：成功 1 张 → 1 个 `ready`；空结果标 `missing`（不接受占位图）；改相似度后结果标旧配置；
- SSR 渲染：六个分区齐全、未上传时按钮 `disabled` 且列出真实拦截原因、默认 70% 且说明无分割服务。

## 3. 未完成 / 风险

1. **工具页尚未接线工作区**：`features/tools/tool-page.tsx` 目前对**所有**工具都渲染 `WorkspacePlaceholder`，`SceneTransferWorkspace`、`ProductSceneWorkspace`、`FissionLinkWorkspace`、`ProductMarketMaterialWorkspace` 都处于「已导出未挂载」状态。接线需要改 `tool-page.tsx`（不在本任务允许文件内），本次只保证组件可独立渲染、可被直接挂载。
2. **无本地分割服务**：`segImageUrl` 完全依赖用户上传真实分割图；没有上游分割能力时，页面会明确显示「整图级迁移」。若后续接入分割服务，只需让调用方把真实地址交给 `resolveTransferSegmentation()`，adapter 无需改动。
3. **上游字段真实语义未验证**：`imageStyleUrl` / `segImageUrl` 的语义来自 registry 契约与规格，本轮没有对真实 provider 发起计费请求，因此「字段被上游正确消费」属于未验证项（测试只覆盖到「请求构造与守卫」这一层）。
4. **相似度是提示词约束而非硬参数**：`similarity` 作为数值进字段，但图像模型对「相似度百分比」的服从度不可控；页面文案已按"约束强度"表述，不承诺具体像素级结果。

## 4. 使用入口

- 页面路由：`/tools/product-design/scene-transfer`（registry 已声明 index 33 / makeType 63 / layout `scene` / adapter `image`）
- 组件入口：`import { SceneTransferWorkspace } from "@/components/tools/workspaces/scene";`
- 运行入口：`runSceneTransfer({ gateway: getToolGateway(), values, product, style, segAsset, model, revision, descriptor, signal, onUpdate })`
- 契约与文案：`@/features/tools/registry/scene-transfer`（`DEFAULT_SCENE_TRANSFER_VALUES`、`buildTransferPrompt`、`validateSceneTransferState`、`createSceneTransferSnapshot`）
- 测试：`bun test src/features/tools/adapters/scene-transfer.test.ts`

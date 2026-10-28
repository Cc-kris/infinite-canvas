# TASK-035 场景裂变链接（FISSION_LINK）实现报告

- 分支：`feat/linkfox-v1-real`
- 工具：`FISSION_LINK` slug `fission-link`，分类 `product-design`，路由 `/tools/product-design/fission-link`，layout `scene`
- 范围：仅本任务 4 个文件（registry / adapter / adapter 测试 / scene 工作台），未触碰他人文件

## 1. 交付内容

| 文件 | 说明 |
| --- | --- |
| `web/src/features/tools/registry/fission-link.ts`（新增） | 工具规格、状态归一化（`imageUrl` + `outputNum` 1–4）、来源体检（remote / dev-remote / data / asset / invalid）、提示词与字段组装、快照指纹与“参数已变”判定、提交前校验、草稿序列化（只恢复输入、不恢复“预览已就绪”）、契约自检 `checkFissionLinkContract()` |
| `web/src/features/tools/adapters/fission-link.ts`（新增） | 真实执行适配器：单格 = 一次真实请求（`runFissionLinkUnit`）、批量扇出 `runFissionLink`（并发受控、逐格回调 `onUnitTask`/`onUnitDone`）、失败格保留原因不补造、单格重试 `retryFissionLinkUnit`、结果视图 `fissionLinkResultView`、默认端口 `createFissionLinkRunPort()`（走共享任务网关） |
| `web/src/features/tools/adapters/fission-link.test.ts`（新增） | 22 个断言用例，覆盖规格/校验/来源体检/指纹/扇出/失败与取消语义/重试 |
| `web/src/components/tools/workspaces/scene.tsx`（追加 440 行） | `FissionLinkWorkspace` 工作台：左侧粘贴链接或上传本地图（二选一）+ 数量选择（1–4，显式提示“将发起 N 次真实请求”）+ 提交/取消；右侧按格展示每张真实结果、失败原因与“只重试这一张”；参数变更后旧结果标记为过期 |

## 2. 关键语义（与规格一致）

1. **数量 = 请求扇出**：`outputNum` 张 → N 次独立请求，每张一次，文案明示请求次数，不做“一次请求切多图”。
2. **失败不补造**：某格失败只标记该格失败并给出 code/message（`fissionLinkFailedRun`），其余格继续；取消/未知状态不当作成功。
3. **单格重试**：沿用同一 unit（同提示词、同参考图、同快照指纹）重新发一次真实请求，不重发整批。
4. **草稿只恢复输入**：刷新后必须重新完成来源体检才能提交，避免“看起来就绪实际没加载”。
5. **指纹只覆盖会让结果变样的字段**：`sourceUrl / sourceAssetId / sourceWidth / sourceHeight / outputNum / version / model`；客户端操作 id、草稿 revision 不参与，避免同一配置重开被判成旧结果。

## 3. 验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 单测 | `cd web && bun test src/features/tools/adapters/fission-link.test.ts` | **22 pass / 0 fail，108 expect()** |
| 类型检查 | `cd web && bunx tsc --noEmit -p tsconfig.json`（过滤本任务文件） | 本任务 4 个文件 **0 报错**；仓库内 `dress.tsx`、`image-text-edit.tsx`、`new-designer.test.ts` 有并行他人改动的既有报错，未修改 |
| 生产构建 | `cd web && bun run build` | `✓ built in 12.05s`，产物正常（仅历史 chunk 体积提示） |

## 4. 风险与已知边界

- **路由接线不在本任务**：`src/features/tools/tool-page.tsx` 当前对所有工具统一渲染 `WorkspacePlaceholder`；本任务导出 `FissionLinkWorkspace` 并通过 registry 自动登记（`import.meta.glob("./registry/*.ts")`），待接线任务消费后即可在路由内渲染。
- **真实出图依赖用户图像渠道配置**：未配置可用图像渠道时，提交前校验会拦下并提示（`adapter-not-executable`），不会发出请求。
- **并发扇出**：批量请求并发受适配器内控制，最坏情况 4 次请求同时进行；上游限流时表现为个别格失败，可单格重试。

## 5. 使用入口

- 路由：`/tools/product-design/fission-link`
- 代码入口：`web/src/features/tools/registry/fission-link.ts`（规格与校验）、`web/src/features/tools/adapters/fission-link.ts`（执行）、`web/src/components/tools/workspaces/scene.tsx` 末尾 `FissionLinkWorkspace`

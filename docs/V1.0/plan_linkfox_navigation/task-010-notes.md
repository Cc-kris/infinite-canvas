# TASK-010 notes (CHANGE_COLOR_V2, 套图换色)

repo: /Users/mac/Documents/Dev/infinite-canvas (branch feat/linkfox-v1-real), web app in ./web
Allowed files (my scope): `web/src/features/tools/registry/change-color-v2.ts`, `web/src/features/tools/adapters/change-color-v2.ts`, `web/src/features/tools/adapters/change-color-v2.test.ts`, `web/src/components/tools/workspaces/color-v2.tsx`
Commit: `e44d764 feat(tools): CHANGE_COLOR_V2 套图换色契约、适配器与工作台（TASK-010）` (4 files, +2518)

## Status
- registry/change-color-v2.ts: DONE — 规格常量（≤12 商品图 / ≤25 方案 / ≤50 部位字符 / ≤10MB）、部位预设（全身/上装/下装/鞋面/鞋底/包身/包带/外壳/瓶身/表带）、品质档位（low/medium/high → providerQuality）、ColorPlan 契约、DEFAULT_COLOR_V2_VALUES、createColorPlan / addColorPlan(去重+上限) / toggleReferencePlan / pushHistoryColor、validateColorV2State、estimatedOutputCount、zod parse。
- adapters/change-color-v2.ts: DONE — buildSuiteFromValues（unitId = `assetId::planId`）、prompt 组装（方案色值 + 参考图 + 部位 + 单图微调）、buildUnitInput（references + quality + fields）、runColorV2Suite（并发、可 abort、per-unit onOutcome）、mapTaskToOutcome、retryableUnit(s)、mergeOutcomes、summarizeByPlan、auditSuiteConsistency、isSnapshotStale / buildColorV2Snapshot、sampleImagePalette / paletteToPlans。
- adapters/change-color-v2.test.ts: DONE — 36 pass / 0 fail（`bun test`，112 expect）。
- components/tools/workspaces/color-v2.tsx: DONE（869 行）— 左栏 6 段（商品图 / 方案 / 部位 / 品质 / 单图微调 / 校验与提交）+ 右栏整套结果（汇总、按方案对比、单元卡片、过期提示、单单元重试、下载/入库）。

## Verified
- `npx tsc --noEmit` → exit 0
- `npx vite build` → exit 0（7.25s）
- `bun test src/features/tools` → 103 pass / 0 fail（含 shared components 与既有 suites）
- SSR 冒烟渲染（renderToStaticMarkup + MemoryRouter + localStorage shim，临时脚本已删）：全部段落、部位预设、品质档位、校验文案、快照 hash 均正常输出，无运行时崩溃。

## Design decisions / pitfalls
- `ToolAssetInput` 是**非受控**组件且自己写 `draft.assetIds`，两个实例会互相覆盖 → 整套商品图用 ToolAssetInput；参考图用自建上传器写 `values.referenceAssetIds`。
- 参考图/商品图的 `record.url` 可能是 `blob:`（localforage），provider 需要 base64 → 提交前用 `imageToDataUrl({storageKey, url})` 换成 dataURL 再 `assetRecordToReference`。
- 草稿恢复在 `useEffect` 里（`hydrateDraft` → `parseColorV2Values`），因此 SSR 静态渲染永远看到默认值；浏览器里 `hydrate` 命中 `hydrated[toolId]` 即返回草稿。
- 结果与快照绑定：`isSnapshotStale` 依据 hash 标记过期，输入变更后不冒充新结果。
- 失败单元单独重试（`retryableUnit`），partial failure 保留成功项。

## Next step (out of my 4-file scope)
组件**尚未被任何路由引用**（`web/src/features/tools/tool-page.tsx` 仍渲染 `WorkspacePlaceholder`，`data-testid="tool-workspace-placeholder"`）。需要在路由层加：slug `change-color-v2` → 懒加载 `@/components/tools/workspaces/color-v2` 的映射，路径 `/tools/ecommerce-suite/change-color-v2`（registry/index.ts 中 spec 已存在，makeType 93）。接入后即可端到端验收。

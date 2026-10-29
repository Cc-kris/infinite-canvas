# 历史恢复（本人负责 7 工具）进展与坑位

## 已改代码（未提交）
- `web/src/components/tools/workspaces/enhance.tsx`：SCALE_UP / PRODUCT_REFINE 共 4 处
  `getToolGateway()` → `getPersistedToolGateway()`（任务才进 store/落盘）。
- `web/src/components/tools/workspaces/color.tsx`：CHANGE_COLOR 2 处同上。
- 新增 `web/src/components/tools/use-restored-task.ts`：store 水合后回放本工具最近一次
  succeeded 任务（当前有任务时以当前为准，不只回放失败态）。
- enhance/color 结果区与 `changeColorResultFromTask` 改用 activeTask。

## 验收脚本
`web/scripts/real-acceptance/run-history-recovery-mine.mjs <TOOLID...>`
- fresh context 真空跑（真 provider）→ F5 刷新 → Dock/历史页签条目 → 点条目 → 切回结果页签
  → 断言结果图 naturalWidth>0 → 下载字节（`tool-result-download-0`）→ 存资产（`tool-result-save-0`）。
- 证据：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/HISTORY_RECOVERY_MINE/<TOOL>/`

## 已实测
- SCALE_UP：全绿。刷新后回放成功图（1024×752 blob），下载 871973 B。
- CHANGE_COLOR：真跑 200、storageKey 入 IDB、刷新后 1 任务、历史"1 条"、blob 1024×1024 解码。
  首轮脚本停在历史页签导致下载断言 skipped（已修脚本）。

## 坑位
- CHANGE_COLOR 的「立即生成」要求：源图 + 目标色（`change-color-hex`，native setter + input 事件），
  否则永久 disabled 且 issues 提示「请选择颜色或上传颜色参考图提色。」。
- 该页有两个 `tool-asset-file-input`（源图 / 颜色参考图），取 `.first()` 才是源图。
- 工具调用 ≤600s：真实生图任务必须 nohup 后台跑，轮询 /tmp/histlog/*.log。
- 本机无 bun（bun:test 单测跑不了），用 `npx tsc -p tsconfig.json --noEmit` 兜类型。

## 交棒（未完成，留给后续 worker）

本轮只完成并实测了 **SCALE_UP**、**CHANGE_COLOR** 两个工具的真实历史恢复闭环；
其余工具**未改动、未实测**，请接手者按同样口径（fresh context 真跑 → F5 → 历史条目 → 结果/下载/入库）
逐个验证，只有发现真实缺陷才改：

| 工具 | 入口文件 | 已知线索（未验证，勿当结论） |
| --- | --- | --- |
| AI_OUTPAINTING | `workspaces/outpaint.tsx` | 已走 `createTaskStoreRunPort()`，无 `useRestoredTask` 回放，刷新后结果区可能为空 |
| HAND_REPAIR | `workspaces/repair.tsx` + `adapters/hand-repair.ts` | 适配器内部用 store.runTool，落盘应该正常；回放待验 |
| PRINTING_REPAIR | `workspaces/printing-repair.tsx` | 同上，待验 |
| AREA_REPAIR / REMOVE_PEN | `workspaces/mask.tsx` | mask.tsx 已有 storedTasks/restored 逻辑（7 处命中），待真跑复验 |
| IMAGE_CROP | `workspaces/crop.tsx` | 已有 restoredTask 回放（参考实现），待真跑复验 |

脚本 `run-history-recovery-mine.mjs` 已支持追加配方：新增一个 RECIPES 条目
（route / fixture / historyTab / resultTab / run）即可复用同一套断言。

## 风险
- 未提交的其它 worker 改动（`docs/.../evidence/*` 等）本轮**未触碰**，提交时用显式路径 add。
- 本机无 bun，`*.test.tsx`（bun:test）跑不了，仅以 `npx tsc --noEmit` + 真机验收兜底。
- 视频类工具（SALE_VIDEO 等）不在本轮范围。

# R8-fix 视频 4 工具 H/R 收口说明（2026-10-29）

## 真实现状（ego lite 真实 profile，非空档案）

| 工具 | 真实任务 | 状态 | 字节 | H | R |
|---|---|---|---|---|---|
| AI_VIDEO_EDITING | task-mvt42rpv-kfl1ov | succeeded | 2,268,656B（刷新后可 fetch，mp4 ftyp+moov，mvhd 6.584s / timescale 1000） | PARTIAL | PASS（沿用） |
| IMAGE_TO_VIDEO | task-mvt71akq-bu2hxh | failed | 无（上游 S3 NoSuchKey：`open inline image`，sub2::MiniMax-H3） | PARTIAL | BLOCKED（保留失败原因） |
| VIDEO_REPLICATION | task-mvs9mpoz-e8u2ry | failed | 无（provider 404 `api.cc-ai.xyz/videos`，default::grok-imagine-video） | PARTIAL | BLOCKED（保留失败原因） |
| VIDEO_TRANSLATION | 无 | — | 无 | PARTIAL | BLOCKED |

失败任务一律保留真实失败原因，不伪造成功（cec98a1 空产物边界不回退）。

## 本轮修的真实缺陷

VIDEO-H-RESULT-NOT-RESTORED：任务快照与结果字节都已落盘（`use-tool-task-store` + `media_files/storageKey` 可复原对象 URL），
但四个视频工作台的结果区只读本会话 `useState<ToolTask>`，刷新/重进后结果区为空，下载 / 存资产 / 发画布全部点不到。

机器回执（AI_VIDEO_EDITING.reload-receipt.json）：navType=reload、坞 7 条恢复、结果区 data-view=empty（修复前），
任务记录 blob 地址 fetch 得到 2,268,656B 真实字节。

## 修复

- 新增 `web/src/features/tools/stored-tool-task.ts`（纯函数 `latestStoredTask`，可单测）与
  `web/src/features/tools/use-stored-tool-task.ts`（挂载 hydrate + 派生最近一条落盘任务）。
- 四个工作台接线：仅在本会话没有任务时回填，不覆盖新提交；失败任务同样回填以显示真实原因。
- 快照/指纹为空时 `stale` 判定返回 false，回填不会误报「来自旧版本配置」。

## 验证

- `bunx tsc --noEmit -p tsconfig.json`：无输出（通过）。
- `bun test src/features/tools`：1149 pass / 0 fail（含新增 3 例）。
- 浏览器 reload 复验：ego lite 目标标签残留调试会话（`Another debugger is already attached`），本次未取到修复后 DOM 回执，
  故 H 保持 PARTIAL，不按「已验证」计。

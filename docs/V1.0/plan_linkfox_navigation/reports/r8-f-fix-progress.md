# R8 F 边界修复断点（2026-10-29）

仓库：/Users/mac/Documents/Dev/infinite-canvas（分支 feat/linkfox-v1-real）
约束：只修 R8 F 功能边界；禁止新生成/注入历史；不碰审计、recoverAll、POSE、批量源码；每 2 个工具跑测试+tsc 后提交。

## 已提交
- d208987 PIS/DWS 空结果降级
- cec98a1 视频区「成功但 0 产物」降级（replication→failed；concat 报错；ToolResult succeeded+0 → 琥珀「无结果」徽章 + 重新生成，仅 onRetry 时）
- 8ad16ec MARKET 刷新还原（restoreMarketUnitsFromTasks + effect + 清空守卫）
- 856757d HAND_REPAIR 刷新回填（printingRepairRunFromStoredTask / latestPrintingRepairTask + effect）

## 进行中
- Batch5 NEW_DESIGNER 刷新回填：
  - new-designer.ts 已加 designerResultFromStoredTask / latestDesignerTask
  - 待办：designer.tsx 加 useToolTaskStore(tasks/hydrated/hydrate) + 回填 effect（有 result 时不覆盖、只取最近一条、还原 fingerprint 便于 stale 判定、restoreNotice 不覆盖草稿提示）
  - 待办：new-designer.test.ts 补用例；跑 tools 全量 + tsc；提交

## 关键事实
- printing-repair 的 run 渲染走 `run.task` → ToolResult，回填 run 即恢复全部结果动作。
- store hydrate 会用 storageKey 从 IndexedDB 重建 item.url（对象 URL 不过夜），所以回填 task 后下载/存资产/发画布可用。
- designer 任务字段含 fingerprint（createTaskRecord input.fingerprint），可用于 stale 判定。

## 已提交（续）
- 0b86a73 NEW_DESIGNER 刷新回填（designerResultFromStoredTask / latestDesignerTask + effect）
  注：该提交顺带带入了此前已暂存的 4 个文件（bunfig.toml、verification 文档、2 个 store 测试微调），非本批次内容。

## 判定为「取证缺口，非代码缺陷」（未改代码）
| 工具 | 工作台 | 刷新后结果路径 |
|---|---|---|
| IMAGE_TO_VIDEO | image-to-video.tsx | 有 restoreFromTask（历史坞 onSelectTask → 真实任务回填） |
| SALE_VIDEO | video.tsx | 历史坞 onSelectTask → setTask → ToolResult 渲染 |
| AI_VIDEO_EDITING | video.tsx | 同上 |
| VIDEO_TRANSLATION | video-translation.tsx | 历史坞 onSelectTask → setTask → ToolResult 渲染 |

结论：这 4 个工具刷新后结果不会自动出现在结果区，但历史坞里有真实任务（store 已按 storageKey 重建视频 URL），
点选即可恢复——缺的是审计取证（reload 回执），不是功能。按要求「只改实际缺陷」，未加自动回填。

## 最终验证
`bun test src/components/tools src/features/tools` → 1267 pass / 0 fail；`tsc --noEmit` 0 error。


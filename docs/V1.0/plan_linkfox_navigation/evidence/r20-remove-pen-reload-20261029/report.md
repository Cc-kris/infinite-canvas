# r20 — REMOVE_PEN 历史主定位/结果恢复根因修复 + 真实 UI 生成回执

日期：2026-10-29　　基线：3afe2c2

## 1. 根因（代码级）
REMOVE_PEN 的结果恢复链路只认 `dataUrl` / `url` 两个**内存地址**：

- `mask.tsx` 历史定位过滤：`Boolean(item.dataUrl || item.url)` —— 快照剥离 dataUrl 后，本通道（b64 优先、无远端 url）只剩 `storageKey`，历史任务直接被过滤掉；
- `mask.tsx` resultItem 用 `view.imageUrl` 字符串重建结果项，**丢掉 storageKey**，三动作拿不到真实字节；
- `removePenResultView` 只暴露 `imageUrl`，storageKey 无处传递。

结论：不是字节丢失，是**定位符在判据里被丢弃** → r17b 记的 `BLOCKED_NO_LOCATOR`。

## 2. 修复
| 文件 | 改动 |
|---|---|
| `web/src/features/tools/adapters/remove-pen.ts` | 视图新增 `imageStorageKey/imageBytes/hasImage`；新增 `removePenResultItem(run)`（必带 storageKey/bytes）；新增 `removePenTaskHasResult(task)`（判据 dataUrl‖url‖storageKey） |
| `web/src/components/tools/workspaces/mask.tsx` | 历史定位改用 `removePenTaskHasResult`；结果项改用 `removePenResultItem`；新增 `resolveMediaUrl(storageKey)` 回读对象 URL 作 `resultUrl` 兜底 |

## 3. 真实生成（无注入）
- 输入图：Unsplash 公网图 `photo-1518791841217-8f162f1e1131`（Unsplash License，1024×683，本地 124,700 B）
- 指令：REMOVE_PEN_INSTRUCTION（参考图1=原图，参考图2=画布导出蒙版 PNG）
- 上游：`POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → **200**
- 任务：`task-mvtmnhk5-nr2g0z`　终态 **succeeded**　耗时 34s
- 结果：`storageKey=tool-result:task-mvtmnhk5-nr2g0z:0:komJnSXgwkxdOFeQHXTGI`，**2,440,825 B**，1024×1024，`url=""`，`payloadDropped=false`

## 4. fresh reload 三动作（真实点击后的应用回执）
| 动作 | 结果 |
|---|---|
| 面板恢复 | 「已按落盘任务 task-mvtmnhk5-nr2g0z 恢复结果：下载/存入资产/发送画布都沿用该任务的真实图片字节。」渲染图 `blob:`（由 storageKey 回读） |
| 下载 | `public_input-erased.png`，**2,440,825 B**，与任务字节一致 |
| 存入资产 | 已存入资产库（1xIHbpny） |
| 发送画布 | 已发送画布（项目 ojUWiNT5 · 节点 image-17） |

## 5. 闸门
- `tsc --noEmit` → exit 0
- `bun test remove-pen.test.ts + mask.test.tsx` → 28 pass / 0 fail / 152 expect

## 6. 未完成 / 风险
- r17b 的两条修复前任务（`task-mvsa3pt6-4wqy46` 等）IDB 无字节，本次**未回灌**，仍不可恢复；
- 本通道结果 `url` 为空串（仅 b64），因此 storageKey 是唯一持久定位符——这也是本次修复必须覆盖 storageKey 的原因；
- 新增导出的 `removePenResultItem` / `removePenTaskHasResult` 暂由 `mask.tsx` 与人工回执覆盖，未补单测。

## 7. 自洽性补充（提交前复核）
- 结果项 `removePenResultItem(run, id, resolvedUrl)`：`dataUrl` 缺失时把 **storageKey 回读的对象 URL** 一并写入 `url`，因此即便结果区仍走 `dataUrl‖url‖blob` 的旧门禁，刷新后的 REMOVE_PEN 结果也能通过。
- 门禁范围说明：本工作树同时存在**其他工作流未完成的 WIP**（`web/src/lib/task-snapshot.ts` 未跟踪、`tool-result.tsx/actions/test` 半成品，独立 `tsc` 报 4 处错误、1 个用例失败），不属本次改动范围，未提交、未改动。
- 本次两份文件的门禁：`tsc --noEmit` 中 `remove-pen.ts` / `mask.tsx` 错误数 = **0**；`bun test remove-pen.test.ts + mask.test.tsx` = **28 pass / 0 fail**。

# R24 严格 H 机读回执：PRINT_EXTRACT PASS / REMOVE_PEN BLOCKED_NO_BYTES

- 日期：2026-10-29
- 运行 commit：`65d83b29`（工作区未改动源码，仅新增本证据目录）
- 浏览器：ego lite（Chrome/156），真实 profile，origin `http://127.0.0.1:3000`
- 口径：单会话人工 UI 操作 + 只读存储探针。**未重新生成、未注入字节、未派 worker**。

## 1. 逐项核对 r10 判 PARTIAL 的硬断言

| 硬断言 | r10 结论（PRINT_EXTRACT） | r24 实测 | 证据字段 |
| --- | --- | --- | --- |
| taskId primary 绑定 | PASS | PASS | `taskId=task-mvtlxua2-kh39uf` / `resultItemId=…-0` / `storageKey=tool-result:…:jf8VlMsU9spY5W5raRSnO` |
| reload 腿 | **FAIL（navType=navigate + cache-buster）** | **PASS（真 `location.reload()`：`timeOrigin` 1793284987751 → 1793285027102.4，`navType=reload`）** | `reload` 段 |
| 真实字节 | PARTIAL | PASS（IDB `media_files` 里 Blob = 2783996B，sha256 `1577dafd…d822`，PNG 头 137,80,78,71） | `realBytes` 段 |
| 下载 | PARTIAL（本轮自动化点击被下载策略拦） | PASS（真 reload 后新文档里第 1 次下载 → `~/Downloads/print-extract-result-1 (1).png` 2783996B 同 sha） | `download` 段 |
| assetId | PASS | PASS（`5iFK1BE8Ukthz2hh4qzI5`，计数 55→56，meta.taskId 绑定，资产 Blob 同 sha） | `asset` 段 |
| canvasNodeId | 缺失 | PASS（`canvasNodeId=image-1793285127749-alejh`，项目 `pU7Vsj40yiESBZOgZkjxW`） | `canvas` 段 |

### 1.1 两个易错点（本轮实证，供审计复核）

1. **下载策略的真因**：Chrome「自动下载」在同一 document 里只允许 1 次。r16 在同一 document 里点了第 2 次下载因此被拦；真 reload 后第 1 次点击即落盘（`priorDownloadsInDocument=0`）。
2. **UI 反馈里的 id 是 projectId 不是 nodeId**：`已发送到画布（pU7Vsj40yiESBZOgZkjxW）` 中的 id 是**项目 id**，节点 id 需从 `canvas_store.state.projects[].nodes[]` 读，实测为 `image-1793285127749-alejh`。若直接把反馈 id 当 canvasNodeId 记录即为错证。

## 2. REMOVE_PEN：真实失败原因（非"未做"）

真实 profile 里只有 3 个 REMOVE_PEN 任务，全部 `succeeded` 但结果项都在落盘时被剥成
`{id, kind:"image", payloadDropped:true}`，**无 storageKey / url / bytes**：

| taskId | createdAt | result.items |
| --- | --- | --- |
| task-mvsa3pt6-4wqy46 | 1793201885034 | `[{id:"…-0", kind:"image", payloadDropped:true}]` |
| task-mvsba8fo-iplfjq | 1793203868724 | 同上 |
| task-mvsaus49-i7vsmt | 1793203147737 | 同上 |

字节侧：`infinite-canvas/media_files` 共 112 个 Blob，最大 2840825B，**不存在 850799B 的 Blob**
（850799B 是 `B5_HISTORY_DOCK/recovery4/downloads/REMOVE_PEN-remove-pen-result-1.png` 的大小，
sha256 `67d5d6a6…f392`）。该文件是真实历史下载，但**没有任何 taskId 能机器绑定到它的字节/sha**，
因此不能作为 taskId-primary 的回执证据——用它就是把孤立产物当任务产物，属于伪证。

r20 回执里的 `task-mvtmnhk5-nr2g0z` 跑在一次性 Playwright profile 中，该 profile 已被丢弃，
任务记录、assetId、canvasNodeId 全都不存在（真实 profile 的 localStorage / IndexedDB 中零命中）。

### 2.1 根因（代码定位）

- `web/src/services/api/tools/task-machine.ts:404-423`：`sanitizeTaskForPersist` 在既无 `storageKey`
  也无持久 `url` 时，只保留 `id/kind` 并置 `payloadDropped:true`——历史版本在字节落 IDB **之前**就写了快照，
  于是旧任务永久丢失字节。
- `web/src/services/api/tools/gateway.ts:427` 记录了同样的"剥离二进制并标记"行为。
- `web/src/services/api/tools/result-assets.ts:127,254`：`payloadDropped` 会正当地阻断 下载/存资产/发画布。

所以恢复路径**按设计正确拒绝**，缺的是底层字节本身。只读手段无法再造出字节；
唯一出路是**一次真实新生成**（上传+蒙版+提交），产出带 `storageKey` 的结果项后，
再按下表走一遍 PRINT_EXTRACT 的取证链。该动作被本次任务明令禁止，故记为 `BLOCKED_NO_BYTES`。

## 3. 闸门

- `tsc --noEmit`（`web/node_modules/.bin/tsc`，PATH 补 `/opt/homebrew/bin` 提供 node）：**exit 0**
- `bun test src/services/api/tools/result-assets.test.ts src/services/api/tools/task-machine.test.ts src/stores`：**47 pass / 0 fail**，156 expect()

## 4. 机读回执

- [receipt-print-extract.machine.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r24-strict-h-20261029/receipt-print-extract.machine.json)
- [receipt-remove-pen.machine.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r24-strict-h-20261029/receipt-remove-pen.machine.json)

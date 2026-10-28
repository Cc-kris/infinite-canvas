# B7 worklog（REMOVE_PEN / IMAGE_CROP / PRINTING_REPAIR / FIX_COLOR / IMAGE_TEXT_EDIT）

审计口径来源：`docs/V1.0/plan_linkfox_navigation/reports/final-gap-audit.md` B7（5 个工具缺 `result.json`）。

## 已核实的真实事实（2026-10-29 探测）

| 工具 | 真实任务 | 上游产物（HTTP 200） | 字节 | 尺寸 | sha256 | 已有资产回执 | 已有画布回执 |
|---|---|---|---|---|---|---|---|
| REMOVE_PEN | task-mvsba8fo-iplfjq（2026-10-28T16:11Z succeeded） | oss-us.dimenoss.com/images/2026/10/29/1793203892_6c7955f59b8ec82c2cc396916a3dffef.png | 850799 | 待测 | 67d5d6a637518af3e0aa9147bfc0f855b350a244b3345b93ab05d3faa223f392 | K-a7Ae-u（**已不在资产库**，被 cleanup 清理） | 项目 9PtWcnwKDkuVxzTGRyENT / 节点 image-1793203945768-3q7sk ✅ |
| PRINTING_REPAIR | task-mvsamffh-uh79ky（15:52Z succeeded） | .../2026/10/28/1793202782_9bc88d2ecc63458197b17383e39c7138.png | 1153165 | 1024² | 6ce8e2aa312bfb7e879ecab915eac77c058f02d7f138ee3c6eee63bef3bab5c3 | zCnoGDyrrXtDC1RqSgohA ✅（bytes=1153165 与 OSS 一致） | 项目 60gWQnVc91jG9BANlR-CI / 节点 image-1793202869275-w1zis ✅ |
| IMAGE_TEXT_EDIT | task-mvs8bhu1-hhue24（14:48Z succeeded） | .../2026/10/28/1793198918_efe68b3d380801d28b26a09588374ae9.png | 844613 | 1024² | e7b260e7b0642dd1acd0e41e41eedf9bfe635a3a28e8175029d3248aabf5be4c（与 evidence/IMAGE_TEXT_EDIT/03-result-image.png 逐字节相同） | 无 | 无 |
| IMAGE_CROP | 无上游（本地像素裁剪） | 本地产物 evidence/IMAGE_CROP/result.png | 205951 | 1024x744 | c046374eac48b82e5a7a76c1ff8c151a9fee60e3257ffe5d10a8912eecaeb708 | 无 | 无 |
| FIX_COLOR | 无成功任务（历史仅 timeout/502/execution-context） | 无 | - | - | - | 无 | 无 |

## 发现的真实缺陷

1. **结果 URL 在持久化时被丢弃**：`gateway.executeImage()` 只写 `{id, kind:'image', dataUrl}`；上游（cc-ai / gpt-image-2）返回的 `dataUrl` 实际是 OSS `https://` 地址。`sanitizeTaskForPersist()` 见到 `dataUrl` 即剥离并置 `payloadDropped=true`，刷新/历史回填后结果图无法下载/存资产/发画布。可从 localStorage 快照实测：REMOVE_PEN / PRINTING_REPAIR / IMAGE_TEXT_EDIT 三个成功任务的 result item 均为 `{payloadDropped:true}`、无 `url`。
   - 修法（最小、不碰 image.ts / tool-result-actions.ts）：网关落 item 时，若 `dataUrl` 是 http(s) 地址则同时写入 `url`，`sanitizeTaskForPersist` 已有「有 url 即保留」的分支。

## 验收方式（不重复付费）

按仓库既有 `web/scripts/real-acceptance/run-reuse-actions.mjs` 的既有模式：把**上一轮真实生成**的 OSS 产物 URL 回填成任务快照（标注 provenance），刷新后从历史恢复结果，再点真实「下载 / 存入资产 / 发送画布」按钮，读取资产库与画布 store 的真实回执。整个过程不提交生成请求。

## 待办

- [ ] 修 gateway 结果 URL 丢失 + 单测
- [ ] 5 个 result.json（真实字节/尺寸/sha、动作回执、历史回填、LinkFox 对照、未覆盖项）
- [ ] 每工具单独 commit

## 收尾状态（2026-10-29）

| 工具 | 状态 | 关键证据 |
| --- | --- | --- |
| IMAGE_TEXT_EDIT | VERIFIED | result.json；下载 844613B / sha256 e7b260e7…；存资产 reload 后读回；发画布 +1 节点 |
| IMAGE_CROP | VERIFIED | result.json；本地裁剪 1024x744，下载 205951B / sha256 c046374e… 与结果卡一致；存资产 reload 后读回；发画布 +1 节点 |
| REMOVE_PEN | VERIFIED（资产已清理） | result.json；850799B / sha256 67d5d6a6… 1024²；画布项目 9PtWcnwK 节点 image-17 |
| PRINTING_REPAIR | VERIFIED | result.json；1153165B / sha256 6ce8e2aa… 1024²；项目 60gWQnVc 节点 image-17 |
| FIX_COLOR | PARTIAL | result.json；上游对该通道持续 502/超时，无真实结果，动作三项未覆盖 |

缺陷修复：`web/src/services/api/tools/gateway.ts` 新增 `imageResultItems()`，远程 `https://` 结果落 `url` 而非 `dataUrl`，避免 `sanitizeTaskForPersist()` 剥离导致刷新后无法下载/存资产/发画布。单测 `gateway.result-items.test.ts` 4 项通过（`~/.bun/bin/bun test`）。

复盘：验收脚本 `web/scripts/real-acceptance/b7-actions.mjs` 里对应用模块的 `import("/src/…")` 必须取 `performance.getEntriesByType("resource")` 中的真实 URL（dev 下带 `?t=` 版本参数，否则拿到的是另一个模块实例，注入 store 不生效）；资产库用 localForage(IndexedDB) 持久化，校验必须 reload 后读 store，`localStorage` 无效。

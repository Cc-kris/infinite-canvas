# 4 个视频工具：历史/刷新验收（2026-10-29）

浏览器：真实 Chrome 标签页，页面 `http://127.0.0.1:3000`（本机 dev 栈），当前真实 profile 的 `localStorage`
（`tool-task:v1:index`，抓取时 53 条）。全部**复用已知真实任务**，不重新生成、不伪造结果、不改字段文案
（字段文案归另一组）。采集脚本见 `web/../temp/probe_rows.js` / `panel.js` / `av_restore.js`（临时脚本，未入库）。

判定口径：刷新网页（`location.reload()` 后 `performance.navigation.type === "reload"`）再看历史坞/结果区；
结果字节同时从**页面 blob** 和 **IndexedDB `infinite-canvas/media_files` 的 storageKey** 两路取，比字节数与 sha256。

## 一、SALE_VIDEO（`/tools/ai-video/sale-video`）

证据：`SALE_VIDEO.dock-after-reload.json`、`idb-byte-check.json`

| 检查 | 实测 |
| --- | --- |
| 刷新后历史坞 | 3 条：1 条 `已完成`、2 条 `失败` |
| 成功条目 | `task-mvt76u6p-7cfnff`，`sub2::MiniMax-H3`，1:1，素材 `Q_xXsAv4MdJFz05SMo1lp`，`1 个结果` |
| 展开后媒体 | `<video>` 预览（`data-testid` 走历史坞下载/存入资产/发送到画布三个按钮） |
| 三个按钮 | 下载 / 存入资产 / 发送到画布，全部 `disabled=false` |
| 页面 blob 字节 | 1,366,190 B，sha256 `39193f0a2c97c24e3a06fd6d38f8c633e6b6a53546d1c235038f4f7cb22bcb73` |
| IDB `tool-result:Be9yI14yvxVSg1r0TjYPJ` | 1,366,190 B，`video/mp4`，sha256 同上 → **逐字节一致** |
| 失败条目 | `404 page not found · api.cc-ai.xyz/videos · HTTP 404`；`请先配置 API Key`（两条都无结果、无「查看结果」误导） |

## 二、IMAGE_TO_VIDEO（`/tools/ai-video/image-to-video`）

证据：`IMAGE_TO_VIDEO.history-after-reload.json`

| 检查 | 实测 |
| --- | --- |
| 历史条数 | 1 条（`task-mvt71akq-bu2hxh`），状态 `failed`，刷新前后一致 |
| 配置快照 | `sub2::MiniMax-H3` / openai / `auto` / `768P` / 1 张，素材 `u9-F8H3uLv0nE5RBMv90y`、`HsNAWNskFtoPh49lr1kEK` |
| 真实失败原因 | `open inline image: operation error S3: GetObject … StatusCode: 404 … NoSuchKey`（上游取图失败，本地无成片） |
| 声明 | 该工具在 `evidence/real-acceptance/IMAGE_TO_VIDEO/` 里有一份 2026-10-28 的 1,297,168 B 成片（sha `56226153…`），那是**临时 profile** 跑出来的，不在当前 profile 的 `tool-task:v1:index` 里，因此本 profile 无可恢复成片；不伪造。 |

## 三、AI_VIDEO_EDITING（`/tools/ai-video/ai-video-editing`）

证据：`AI_VIDEO_EDITING.tasks-localStorage.json`、`AI_VIDEO_EDITING.panel-broken-preview-before-fix.json`、`AI_VIDEO_EDITING.panel-after-fix.json`

| 检查 | 实测 |
| --- | --- |
| 历史条数（刷新后） | 7 条（历史区「历史记录 7 条」），与 store 里的 7 个任务一一对应 |
| 成功任务 | `task-mvt42rpv-kfl1ov`，`MiniMax-H3`，结果 1 个：2,268,656 B，`video/mp4`，`storageKey=tool-result:6x-FsSnD1IMk76p5iayw-` |
| 刷新后面板初始态 | 结果区空（按设计提示「点击「查看结果」把历史任务放回上方结果区」），**没有**伪造结果 |
| 点「查看结果」 | toast `已载入历史任务结果；素材与编辑需求未改动`；结果区变 `已完成 共 1 个结果` |
| 未修复前 | 结果项渲染成 `<img data-testid="tool-result-image">`，`naturalWidth=0 / complete=false`（**破图**），汇总缺「· 视频 1」；但字节本身正确：2,268,656 B，sha `47573c14…`，magic `…66747970 69736f6d`（ftypisom） |
| 根因 | 该条历史快照的 result item 只写了 `mimeType=video/mp4`，**缺 `kind`**（早期外部恢复写入的记录：`fingerprint=claude-recover:…`）；`tool-result.tsx` 用 `item.kind === "video"` 分支，缺省落入图片分支 |
| 修复 | `tool-result-actions.ts` 的 `resultItems()` 按 `mimeType`（其次 `blob.type`、`dataUrl` 前缀）兜底推导 `kind`；已带正确 kind 的项原样返回（引用不变，避免无谓重渲染）。新增单测 |
| 修复后（同一页面、同一任务） | `<video data-testid="tool-result-video">`，汇总 `共 1 个结果 · 视频 1`，下载/存入资产/发送画布 `disabled=false` |

## 四、VIDEO_REPLICATION（`/tools/ai-video/video-replication`）

证据：`VIDEO_REPLICATION.history-after-reload.json`、`VIDEO_REPLICATION.panel-after-reload.json`

| 检查 | 实测 |
| --- | --- |
| 历史条数 | 1 条（`task-mvs9mpoz-e8u2ry`），`failed`，刷新前后一致 |
| 配置快照 | `default::grok-imagine-video` / openai / `9:16` / 1 张，素材 `TBO1_P4CZ32M2UR2Gr2K_`、`TN8pClbH-6w2jne-QmFT0` |
| 真实失败原因 | `404 page not found · api.cc-ai.xyz/videos · HTTP 404`（该中转没有 `/videos`） |
| 误导检查 | 无结果时不显示「查看结果」，只给「回填表单」 |

## 五、代码验证

```
cd web && ~/.bun/bin/bun test src/components/tools/tool-result.test.tsx   # 29 pass / 0 fail
cd web && ~/.bun/bin/bunx tsc --noEmit -p tsconfig.json                   # 无输出（通过）
```

新增用例：`result view mapping > derives missing kind from mimeType so video results never render as images`。

## 六、结论与风险

- 三个工具（SALE_VIDEO / IMAGE_TO_VIDEO / VIDEO_REPLICATION）刷新后历史坞、配置快照、素材、失败原文都完整，成功项字节可从 IndexedDB 复原且与页面一致。
- AI_VIDEO_EDITING 刷新后「结果区为空 + 点查看结果复原」的交互本身是对的，但**缺 `kind` 的历史快照会被渲染成破图**，已在读结果项处兜底修好（不影响其他组负责的字段文案）。
- 风险：本次采集期间其它 worker 仍在往同一浏览器 profile 写任务（index 由 38 涨到 53），因此各 JSON 条数带时间戳口径；视频 `readyState` 在自动播放受限时为 0，属浏览器策略，非缺陷（下载/sha 校验已证明字节可播）。

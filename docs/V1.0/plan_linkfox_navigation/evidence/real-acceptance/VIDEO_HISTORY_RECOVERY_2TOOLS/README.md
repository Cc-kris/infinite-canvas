# VIDEO_REPLICATION / VIDEO_TRANSLATION 真实历史恢复验收（2026-10-29）

复核方式：真浏览器（Playwright + Chrome headless）跑真实页面 `http://127.0.0.1:3000`，
任务快照走应用**自己的** `useToolTaskStore.upsertTask()`（内含真实 ingest：结果字节写 IndexedDB 并记 storageKey），
刷新后由 `hydrate()` + `restoreResultMediaUrls()` 复原；点的是页面上真实的「查看结果 / 下载 / 存入资产」按钮。
不复用任何 mock 上游，不重新生成结果。

脚本：`web/scripts/real-acceptance/run-video-history-recovery-2tools.mjs`
命令：`cd web && /opt/homebrew/bin/node scripts/real-acceptance/run-video-history-recovery-2tools.mjs`
结果：**2/2 OK**（`summary.json`）

## 复用的真实任务（不是编的）

| 工具 | 上游真实来源 | 产物 |
| --- | --- | --- |
| VIDEO_REPLICATION | sub2api `MiniMax-H3`，`task_Ma7egazZrnGPt5BtVr5vW2hfApVxvCIS`（status=done，6s，9:16） | `../VIDEO_REPLICATION/link-mode/out.mp4`，2,277,978 B，sha256 `b5e80fde…1510e4163`（1344px 宽，6.58s） |
| VIDEO_TRANSLATION | 本机真实提交 `sub2api-real` 得到的 HTTP 400 原文（`/videos` 只收 JSON，收不了上传字节） | 无成片（真实如此，不伪造） |

## 逐项证据（VIDEO_REPLICATION）

| 检查 | 实测 |
| --- | --- |
| ingest 落库 | `storageKey=tool-result:gZ6NHFON9kTAAQMWq0L4l`，bytes=2,277,978 |
| 刷新后历史坞（reload 1） | 1 条，status=succeeded，时间 `2026-10-29 13:05`，无「原始文件未保留」误报，「查看结果」按钮 1 个 |
| 点「查看结果」 | `video.readyState=4`，`videoWidth=1344`，`duration=6.58s`，src 为 `blob:`（从 IndexedDB 复原，不是原 http 链接） |
| 页面内取播放源字节 | 200，2,277,978 B，sha 与证据一致 |
| 下载按钮 | `video-replication-result-1.mp4`，2,277,978 B，sha 一致（三次下载逐字节相同，样本留在 `downloads/`） |
| 存入资产 | 资产库 0 → 1；`kind=video`，`storageKey=video:OLuek6HJmgngfZ5oyAQWv`，bytes=2,277,978，`metadata.toolId=VIDEO_REPLICATION` |
| 资产字节复核 | 从 storageKey 取回 2,277,978 B，sha 一致 |
| 二次刷新再下载 | sha 一致（`downloads/VIDEO_REPLICATION-reload2-*.mp4`），资产库仍 1 条 |
| 上游链接过期场景 | 把落盘 `url` 改成失效地址再刷新：仍 `readyState=4/1344px`，下载 sha 一致（`downloads/VIDEO_REPLICATION-expired-link.mp4`） |
| 是否偷偷重提上游 | 全程 `POST /v1/videos` = 0 次 |

## VIDEO_TRANSLATION（真实失败任务恢复）

| 检查 | 实测 |
| --- | --- |
| 刷新后历史坞 | 1 条，status=failed，时间 `2026-10-29 13:05` |
| 失败原因可见 | 完整显示真实上游原文：`'utf-8' codec can't decode byte 0xe8 in position 1614… · sub2api.1006000.xyz/videos · HTTP 400（该中转的 /videos 只接受 JSON…）` |
| 没有结果却显示「查看结果」 | 否，按钮 0 个（不会误导用户点进空结果） |
| 是否自动重提上游 | 0 次（`POST /v1/videos` = 0） |

静态复核（`web/src/features/tools/adapters/video-translation.ts:438`）：`status=succeeded` 且有 video 结果项时
`state=succeeded` 直接放行渲染，`stale` 只影响角标、不拦下载；故翻译工具一旦真有成片，恢复路径与上面复现工具同构。
单元测试：`bun test src/features/tools/adapters/video-translation.test.ts` → 30 pass / 0 fail。

## 结论

1. **两个工具的真实历史恢复代码是完整可用的**，无需改动 workspace/store：本地落盘 → 刷新 → 历史坞 → 查看结果 → 播放 → 下载 → 存资产 → 二次刷新 → 上游链接过期，全链路字节 sha256 逐字节一致。
2. **VIDEO_TRANSLATION 没有真实成片**（上游 400），所以「mp4 下载」这项对它无真实对象可验；本次只验真实失败任务的恢复与不重提。要补齐这一项必须真跑一次成功的翻译任务（会给上游付费），本轮按「不重复生成」约束未做。

## 顺带发现（未修，属共享壳，按边界不动）

`web/src/components/tools/tool-task-history.tsx` 历史行缩略图对**任何**带 `url` 的结果项都渲染 `<img>`，
视频结果因此显示破图（实测 `naturalWidth=0`，`alt="历史结果缩略图"`）。影响所有视频类工具的历史行外观。
建议（后续单独改共享壳）：仅当 `item.kind === "image"` 时渲染 `<img>`，视频改渲染 16:9 占位/首帧或 `<video muted>` 缩略。

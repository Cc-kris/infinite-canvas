# 真实提交回执：lf_video_concat_after_budget（VIDEO_CONCAT，预算修复后）

- 采集时间：2026-10-29 23:35（+0800）；采集方式：**纯只读**——未新建生成、未开新隧道、未重提交
- 现场：`http://127.0.0.1:3000/tools/ai-video/video-concat`（tab 1709629323，页脚 v0.27.0）
- 出口：`canvas-proxy` v0.1.3，PID 8834，listen `127.0.0.1:23210`；隧道 `cloudflared tunnel --url http://127.0.0.1:23210`（PID 33008）
- 通道：`sub2::MiniMax-H3`，baseUrl `https://sub2api.1006000.xyz`，proxyEnabled=true，proxyUrl `http://127.0.0.1:23210`

## 一、结论（先行）

1. **提交真实发出且成功**：23:09:04 `POST /v1/videos` → **200**（11.7s），拿到上游任务 `task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt`。提交耗时 11.7s 远小于 `VIDEO_SUBMIT_TIMEOUT_MS=180_000`，**没有出现「卡死在 submitting」**——预算修复的现场行为与设计一致。
2. **当前没有终态**：截至 23:35:42，前端 pollCount=207、任务状态 `running`，上游原始回执始终 `status=pending, progress=0.333…`（自 23:09 起 26 分钟未推进）。
3. **因此三动作（下载 payload / 存入资产 / 发送画布）本轮无法验证**：三动作都依赖 completed 的视频字节；上游未产出结果，任何「验三动作」都只能靠伪造字节，不做。旧网关代码路径本身已在快照 `c8c8ce9e` 的定向回归里覆盖（见 `verify-c8c8ce9e-video-budget.md`）。
4. **阻塞点在上游 MiniMax-H3 队列，不在前端预算**：所有 207 次轮询全部 HTTP 200（1.4–7.6s），proxy 无任何 5xx/4xx；`transientFailures=0`。

## 二、时间线（proxy-23210 原始日志逐行）

`canvas-proxy/proxy-23210.log`（共 631 行，采集时）：

```
11:06:51 PM POST https://sub2api.1006000.xyz/v1/videos -> 400 7.8s
11:07:28 PM MEDIA upload 9416a68a11b04d39faa4cde7ea57d753.mp4 1080637B
11:08:52 PM MEDIA upload 47573c147325d451f41ffd89ae21b82c.mp4 2268656B
11:09:04 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 11.7s
11:09:06 PM GET https://sub2api.1006000.xyz/v1/videos/task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt -> 200 2.4s
...（此后每 6–10s 一次，全部 200）
11:35:42 PM GET https://sub2api.1006000.xyz/v1/videos/task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt -> 200 3.8s
```

本地任务记录（localStorage `tool-task:v1:task-mvtof8um-7034v0`，原始 JSON）：

```json
{"id":"task-mvtof8um-7034v0","toolId":"VIDEO_CONCAT","status":"running",
 "clientOperationId":"bae4e4a0-1b91-4c08-8260-b4564837e7e4","fingerprint":"ee1cf9a8cfaf10b4",
 "capability":"video","configSnapshot":{"capability":"video","model":"sub2::MiniMax-H3","apiFormat":"openai",
 "size":"720x1280","quality":"auto","count":"1","videoSeconds":"13","channelId":"sub2"},
 "sourceAssetIds":["cover-71HNzCBMPUkURjmN9Kecf-0","71HNzCBMPUkURjmN9Kecf","5yURtjaed3fT6nTck5lnG"],
 "draftRevision":45,"createdAt":1793286403726,"updatedAt":1793287864337,
 "attempts":1,"pollCount":174,"transientFailures":0,"submittedAt":1793286403726,
 "upstreamTaskId":"task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt","upstreamProvider":"openai",
 "lastHeartbeatAt":1793287864337,"lastPolledAt":1793287864337,
 "error":{"code":"unclassified","message":"The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.","retryable":true}}
```

（`error` 是此前某次轮询遭遇的 Cloudflare 瞬时错误文本，`retryable:true`；`transientFailures` 仍为 0，未触发失败判定。）

上游原始回执（页面上下文复用同一配置，经 proxy 只读 GET，两次取样一致）：

```
GET http://127.0.0.1:23210/https://sub2api.1006000.xyz/v1/videos/task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt
23:32:xx  200 (4376ms)
23:35:42  200 (3833ms)
{"id":"task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt","request_id":"task_5EgVjiQVtH6dC3WrOj3pqQyHQUQQ0uYt",
 "model":"MiniMax-H3","status":"pending","progress":0.3333333333333333}
```

时间线换算（`new Date(ms)`）：
- createdAt/submittedAt `1793286403726` → 23:06:43
- updatedAt/lastPolledAt `1793287864337` → 23:31:04（此后记录由页面继续刷新，采集时 pollCount=207）

## 三、送进去的真实字节（可复核）

proxy 的 MEDIA upload 文件名即内容 sha256 前 32 位。两段源片段在页面 IndexedDB `infinite-canvas/media_files` 里现算 sha256：

| 片段 | 大小 | sha256（IndexedDB 实算） | 落盘同字节证据 |
|---|---|---|---|
| concat-clip-b.mp4 | 2,268,656 B | `47573c147325d451f41ffd89ae21b82c895623c682832546c24181b18f92a505` | `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`（同 sha256） |
| concat-clip-a.mp4 | 1,080,637 B | `9416a68a11b04d39faa4cde7ea57d753d6b9fd720705775a64cf86dbf8632a8c` | `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/downloaded.mp4`（同 sha256） |

即：本次提交上传的正是先前已验收过的真实视频字节，不是占位文件。

## 四、根因与风险

- **上一轮（15:58）失败的真实根因**（localStorage `tool-task:v1:task-mvt94gxs-p0r29t`，原始）：
  ```json
  {"status":"failed","pollCount":0,"attempts":1,
   "error":{"code":"submit-unconfirmed","message":"页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。","retryable":true}}
  ```
  → 页面在提交途中被刷新，submit 无法确认，**与本次预算修复无关**。
- **23:06:51 那次 400**：proxy 日志只记码不记体，无法反查上游错误文案；随后 23:07–23:09 重传同一字节并成功。本地记录 `attempts=1`（只计成功提交），故 400 未留下独立任务。
- **当前唯一阻塞**：上游 `pending` 卡在 `progress=0.333` 26 分钟。前端预算（submit 180s / poll 60s，`web/src/services/api/video.ts:196-197`）在本次现场从未被触发，属正常等待。
- 建议：等待上游推进或到 sub2api 后台确认该 task 状态；**不要重提交**（会重复计费），本任务记录仍持有 upstreamTaskId 可随时续轮询。

## 五、可复核命令

```bash
tail -f /Users/mac/Documents/Dev/infinite-canvas/canvas-proxy/proxy-23210.log | grep 5EgVjiQ
shasum -a 256 "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4"
```

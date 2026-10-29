# r21 外部通道终态回执：VIDEO_REPLICATION / AI_VIDEO_EDITING（2026-10-29）

**范围**：`lf_video_external_final` 已退出且未提交；本报告只做**只读复核 + 回执落库**，未重试生成、未注入页面、未改源码。
**HEAD**：`a1dbe6b`（提交期间有并发 worker 在写 mask/remove-pen，故本次不纳入其工作区文件）
**环境**：`http://127.0.0.1:3000`（vite dev）+ `canvas-proxy :23210`，浏览器 tab `1709629322`。

---

## 1. VIDEO_REPLICATION — `task-mvtk9pu3-sfifnh` ：真实成功（字节已独立验算）

| 项 | 值 |
| --- | --- |
| status | `succeeded`（attempts=1，pollCount=171） |
| 上游任务 | `task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G`（openai / sub2::MiniMax-H3） |
| 结果项 | `task-mvtk9pu3-sfifnh-0`，`kind=video`，`mimeType=video/mp4`，`payloadDropped=false` |
| 字节 | **1,963,716 B** |
| sha256 | `e5cd3158a67c86d6f79e578792f1351ee50c77cc78853113aa97b95564179afd` |
| 存储 | IndexedDB `tool-result:4zwepLZTtpMan11tTGMKR` |

**字节复核方式（本轮重跑，不采信上轮摘要）**：页面内 `getMediaBlob('tool-result:4zwepLZTtpMan11tTGMKR')` → `Blob{size:1963716,type:"video/mp4"}` → `crypto.subtle.digest('SHA-256')` = 上表 sha256；头部 `00 00 00 20 66 74 79 70 69 73 6f 6d`（`ftypisom`）。同一字节导出落盘为 `VIDEO_REPLICATION-result-1.mp4`，本地 sha256 与页面一致。

**上游真实回执（`canvas-proxy/proxy-23210.log` 原文摘录，见 `proxy-log-excerpt.txt`）**：
- `9:11:35 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 7.5s`
- `9:32:24 / 9:32:29 / 9:32:37 PM GET .../v1/videos/task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G/content -> 200`（5.2s / 5.8s / 7.7s）

### fresh reload 实测（本 HEAD）
`location.reload()` → `navigationType=reload`；结果区 `data-view="succeeded"`；瓦片 `data-kind="video" data-dropped="true"`，文案 **「上游未返回该结果的文件」**；`tool-result-download-0 / -save-0 / -canvas-0` 三个按钮 **均 disabled**；页面存在 `<video src="blob:…">` 但 `videoWidth=0`。

→ 因此 **「下载 / 存入资产 / 发送画布」三动作记为 UNVERIFIED**（按钮不可点，不做伪造点击，不用注入绕过）。

### 本地缺口（如实记录，本轮不修）
持久化结果项只剩 `storageKey/bytes/mimeType`，没有 `url/dataUrl`；而结果瓦片以「可渲染源」判定 `dropped`，于是刷新后即便 IDB 字节完好（1,963,716B、`blob:` URL 可 fetch 200）也整卡判死、三动作全灰。`lf_video_external_final` 自己声明未改源码，本组亦未在该轮做源码修改，故只登记症状与判定依据，不写「已修复」。

---

## 2. AI_VIDEO_EDITING — `task-mvtkgo4b-gaomk5` ：UNVERIFIED（上游未受理）

| 项 | 值 |
| --- | --- |
| status | `failed`（attempts=1，pollCount=0） |
| error.code | `submit-unconfirmed` |
| error.message | 页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。 |
| upstreamTaskId | 无 |
| result | 无（0 产物） |

**上游真实回执**：
- `9:15:55 PM POST /v1/videos -> 400 3.3s`（multipart 首次被 sub2 拒，属已知路径）
- `9:16:35 PM MEDIA upload 56226153….mp4 1,297,168B`（源视频已发布到公网基址）
- `9:18:40 PM POST /v1/videos -> 502 124.7s`
- `9:20:46 PM POST /v1/videos -> 502 125.1s`

两次 JSON 重发均 502 挂满 ~2 分钟，上游始终未给 taskId。故终态记 **UNVERIFIED**（既不能算成功，也不能据此断言本地链路坏），**未重试刷量、未回填、未注入**。

---

## 3. 提交口径

- 只提交：本目录（`receipt.json` / `report.md` / `VIDEO_REPLICATION-result-1.mp4` / `proxy-log-excerpt.txt`）。
- 不提交：`mask.tsx`、`remove-pen.ts`（并发 worker `lf_remove_pen_final` 正在改）、`matrix.{json,md}`、`project_memory.md`（他组工作区）。
- 本轮**未改任何源码**，故无 tsc/测试变更需要跑；证据文件不参与构建。

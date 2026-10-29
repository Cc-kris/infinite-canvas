# R18 — VIDEO_REPLICATION `task-mvtk9pu3-sfifnh` 续查（未终态，如实收口）

- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 续查时间窗：2026-10-29 21:27:04 → 21:30:30（+08）
- 环境：应用 http://127.0.0.1:3000（vite，node PID 80431，v0.27.0）、canvas-proxy :23210（PID 8834）、页面标签 `1709629322`（`/tools/ai-video/video-replication`，上一组自建，非本轮新开）
- 模型/渠道：`sub2::MiniMax-H3`，渠道 `sub2` = `https://sub2api.1006000.xyz`
- 上游任务：`task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G`
- 动作边界：**0 次重生成、0 次状态注入、0 行源码改动**；本轮只有只读 GET 探针

## 结论：`UNVERIFIED`（上游网关 invalid/incomplete response，含 502）

- taskId（本地）：`task-mvtk9pu3-sfifnh`
- taskId（上游）：`task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G`（渠道 `sub2` = `https://sub2api.1006000.xyz`，模型 `MiniMax-H3`）
- 判定：**UNVERIFIED** —— 上游多次返回 Cloudflare `invalid/incomplete response` 与 **502 Bad gateway**（Ray `a52288ee4b94c5bf`）；任务从未进入 `succeeded`/`failed` 终态，本地停在 `running`，`result` 不存在。既无产物可验，也无权威失败原因可归因，故如实记为 **未验证（UNVERIFIED）/ 事实上的 failed-to-verify**，不再重试。

**任务在续查窗口结束时仍未终态（既非 succeeded 也非 failed）：本地 `running`，上游 `pending / progress=0.833`。**

因此：
- 无 MP4 产物 → **ftyp 校验、字节 sha256、fresh reload 持久化、下载/存资产/发画布 三动作全部无法执行**（保持 BLOCKED）
- 未把任何探针结果写回应用/任务记录（`tool-task:v1:*` 全程由应用自身轮询写入）

| 项 | 值 |
|---|---|
| 本地 taskId | `task-mvtk9pu3-sfifnh`（`tool-task:v1:task-mvtk9pu3-sfifnh`） |
| toolId / status | `VIDEO_REPLICATION` / **`running`** |
| 提交时间 | 21:10:27.340（`submittedAt`，attempts=1） |
| 最后轮询 | 21:30:26.860（`lastPolledAt`，`pollCount=157`） |
| 上游 taskId | `task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G` |
| 上游最后正常回执 | 21:29:27 `{"status":"pending","progress":0.8333…}`（HTTP 200） |
| 最后一次探针 | 21:30:24 **HTTP 502**（Cloudflare "Bad gateway"，Ray ID `a52288ee4b94c5bf`，13:30:30 UTC） |
| `result` | 不存在 |
| 页面文案 | `生成中 · 上游处理中，可以离开页面稍后回来 · 18m44s · 轮询 …` |
| 记录内 `error` | `{"code":"unclassified","message":"The origin web server returned an invalid or incomplete response to Cloudflare. This typically indicates the origin is overloaded or misconfigured.","retryable":true}` |

> `error` 字段是**瞬时 5xx 留下的可重试提示**，不是终态失败：同一时刻任务仍是 `running`，`pollCount` 持续递增（146→157），代理日志里每 2–3s 有 `GET … -> 200`。请勿据此把任务判为 failed。

## 原始回执（证据目录 `evidence/`）

### 1) 上游状态时间线（只读 GET，经 canvas-proxy 23210 转发）

| 时间（+08） | HTTP | 上游 body | 本地 pollCount |
|---|---|---|---|
| 21:28:01 | 200 | `{"id":"task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G","model":"MiniMax-H3","status":"pending","progress":0.6667}` | 128→ |
| 21:28:54 | 200 | 同 id，`status=pending`，`progress=0.8333` | 146 |
| 21:29:07 | 200 | `pending` / 0.8333 | 147 |
| 21:29:20 | 200 | `pending` / 0.8333 | 148 |
| 21:29:23 | 200 | `pending` / 0.8333 | 149 |
| 21:29:25 | 200 | `pending` / 0.8333 | 149 |
| 21:29:27 | 200 | `pending` / 0.8333 | 149 |
| **21:30:24** | **502** | Cloudflare Bad gateway（HTML 全文见 `final-upstream-body-2130.txt`） | 155 |

（逐条含原始 body 的完整记录：`upstream-poll.jsonl`；解码版：`poll-timeline-decoded.json`）

### 2) 本地任务原始串（21:30:26 抓取，原样未改）

- `task-state-raw-2130.json`：`status=running`、`attempts=1`、`pollCount=157`、`upstreamTaskId=task_2Jtj…`、无 `result`、无 `finishedAt`
- `lease-raw-2130.json`：`ownerId=page-85e78be7-…`、`heartbeatAt=1793280553143`（21:29:13）
- `final-snapshot-2130.json`：上述两者 + 上游 502 原文 + 页面可见文案快照

### 3) 代理侧请求回执

- `proxy-23210-snapshot-2128.log`（267 行，21:28）
- `proxy-23210-snapshot-2130.log`（303 行，21:30）
- 内容形态：`GET https://sub2api.1006000.xyz/v1/videos/task_2Jtj… -> 200 1.3~3.7s`，每 2–3s 一条，无 POST、无 MEDIA upload → 本轮**没有任何新的生成请求**发出。

## 探针的边界（重要）

- 本轮用一个页内 `setInterval`（5s）做**只读 GET**，把上游原始 body 经本地接收端 `127.0.0.1:8899` 落到 `upstream-poll.jsonl`。
- 该接收端**只是收据通道**：它不参与任务状态计算，也没有向应用写入任何数据；应用自己的轮询（每 2–3s）是任务态的唯一来源。
- 探针已于 21:30:12 清除（`clearInterval`），接收端进程随后停止；页面回到应用原生状态继续自己轮询。

## 未完成 / 风险

1. 任务未终态：需要在**同一个仍打开的标签**上继续等待（应用轮询窗口），或下次会话重新读 `tool-task:v1:task-mvtk9pu3-sfifnh` 拿终态。**不要重新提交**（同参数重复提交会复用未完成任务，但换参数就会重复计费）。
2. 上游 21:30:24 出现 Cloudflare 502（Ray `a52288ee4b94c5bf`），与 21:23 前一组的 502 同形态；属网关侧抖动，任务本身未报错。
3. 一旦拿到 `result`，仍需补做：MP4 下载→`ftyp` 魔数校验→字节数+sha256→fresh reload 后持久化确认→下载/存资产/发画布 三动作机器回执。
4. 本报告未改动源码，未跑 typecheck/test/build（无源码改动，不引入门禁影响）。

## 证据清单

| 文件 | 说明 |
|---|---|
| `evidence/upstream-poll.jsonl` | 探针原始落盘（recvAt + 原始 payload，未改一字） |
| `evidence/poll-timeline-decoded.json` | 上者解码（保留 `raw` 原文） |
| `evidence/final-upstream-body-2130.txt` | 21:30:24 上游 502 响应全文（6426 B） |
| `evidence/task-state-raw-2130.json` | localStorage 任务原始串（21:30:26） |
| `evidence/lease-raw-2130.json` | lease 原始串 |
| `evidence/final-snapshot-2130.json` | 综合快照（上游 body + task + lease + 页面文案） |
| `evidence/proxy-23210-snapshot-2128.log` | 代理日志 21:28 快照（267 行） |
| `evidence/proxy-23210-snapshot-2130.log` | 代理日志 21:30 快照（303 行） |

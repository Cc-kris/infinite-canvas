# R17 — VIDEO_REPLICATION / AI_VIDEO_EDITING 真实提交回执（lf_vr_ave_last 组收口）

- 组：`lf_vr_ave_last`（已退出、未提交；本报告只做**证据入库**，未重生成、未注入、未改源码、未另派 worker）
- 入库时间：2026-10-29 21:24（+08）
- 仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
- 环境：应用 http://127.0.0.1:3000（vite，node PID 80431）、canvas-proxy :23210（PID 8834）、TMWebDriver :18766
- 模型/渠道：`sub2::MiniMax-H3`，渠道 sub2api `https://sub2api.1006000.xyz`（localStorage `infinite-canvas:ai_config_store`）
- 素材公网基址：`https://laura-identical-station-execute.trycloudflare.com`（原 `hidden-metallica-…` 隧道已失效，对 23210 返回 502）

## 结论（如实，不做美化）

| 工具 | 本地 taskId | 状态 | 上游 taskId | 结果产物 | 三动作（下载/存资产/发画布） |
|---|---|---|---|---|---|
| VIDEO_REPLICATION | `task-mvtk9pu3-sfifnh` | **running**（21:23:50 仍在轮询，pollCount=102） | `task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G` | **无**（未终态） | **未执行**（无产物可验） |
| AI_VIDEO_EDITING | `task-mvtkgo4b-gaomk5` | **failed**（`submit-unconfirmed`，21:21:49 关闭） | 无（`upstreamTaskId=null`） | 无 | **未执行** |
| VIDEO_REPLICATION（前置失败） | `task-mvtk5qfr-jogdhg` | **failed**（`submit-unconfirmed`，21:10:07） | 无 | 无 | 未执行 |

> running 保持 running，failed 保持 failed，**未做任何状态改写或补造**。

## 1) VIDEO_REPLICATION — 真实提交、上游受理、仍在跑

- 页面 `/tools/ai-video/video-replication`（组自建标签 1709629322）
- 输入：参考视频 `06-result-video.mp4`（1,297,168 B / 1344×768 / 5.167 s，截 0–5 s）+ 参考图 + 口播脚本
- 落库：`tool-task:v1:task-mvtk9pu3-sfifnh`，`toolId=VIDEO_REPLICATION`，`submittedAt=21:10:27`，`attempts=1`，`upstreamProvider=openai`
- 页面实况（21:24 读取）：`生成中 · 上游处理中，可以离开页面稍后回来 · 13m51s · 轮询 92 次`（UI 文案滞后于 store：同一时刻 store `pollCount=102` / `updatedAt=21:23:50`），同时残留一条错误条
  `任务失败 / The origin web server returned an invalid or incomplete response to Cloudflare… 诊断码 unclassified · 可按原参数重试`
  → 该错误条来自 `store.error`（`transientFailures` 侧），任务本身仍是 running 且继续 200 轮询；两者并存按原样记录。
- 原始回执（代理日志 `canvas-proxy/proxy-23210.log`，原文见 `evidence/proxy-23210-videos-lines.txt`）：
  ```
  9:11:27 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B
  9:11:35 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 7.5s
  9:12:56 PM GET  .../task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 502 4.7s
  9:13:06 PM GET  .../task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 200 3.6s
  9:16:22 PM GET  ... -> 502 4.0s
  9:18:06 PM GET  ... -> 502 3.9s
  9:18:36 PM GET  ... -> 502 3.9s
  ...（快照截至 9:23:50 PM：该 task 的 GET 200 × 177 条、GET 502 × 4 条，轮询间隔 1–7 s）
  ```
- 结论：上游已受理、未产出 MP4 → **H 三腿（ftyp/sha、reload、三动作）无法执行**，保持 BLOCKED/PARTIAL。

## 2) AI_VIDEO_EDITING — 真实提交、网关 5xx、被页面刷新关闭为 failed

- 页面 `/tools/ai-video/ai-video-editing`（组自建标签 1709629323）
- 落库：`tool-task:v1:task-mvtkgo4b-gaomk5`，`submittedAt=21:15:51`，`attempts=1`，`pollCount=0`，`upstreamTaskId=null`，`reconcileRequired=true`
- 终态错误（原文）：`submit-unconfirmed` — “页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。”
- 原始回执：
  ```
  9:15:55 PM POST https://sub2api.1006000.xyz/v1/videos -> 400 3.3s        ← multipart 被 sub2 拒（预期路径）
  9:16:35 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B    ← 源视频发布成功
  9:18:40 PM POST https://sub2api.1006000.xyz/v1/videos -> 502 124.7s     ← JSON 重发，网关超时
  9:20:46 PM POST https://sub2api.1006000.xyz/v1/videos -> 502 125.1s     ← 同形态重发（组原报告漏记）
  9:22:54 PM POST https://sub2api.1006000.xyz/v1/videos -> 524 125.7s     ← 再次重发，Cloudflare 524；归属未与任何任务记录绑定（store 无对应 submitting 记录）
  ```
- **风险提示**：21:21:49 关闭为 failed 之后，21:22:54 仍有同形态 POST 在飞 → 服务商侧可能已受理/计费，重试前须先到 sub2 后台确认（与 `reconcileRequired=true` 语义一致）。本报告不做任何重试。

## 3) 已验字节（真实本地素材，投递到页面且与代理回执一致）

| 文件 | 字节 | sha256 | 代理回执 |
|---|---|---|---|
| `06-result-video.mp4` | 1,297,168 B（1344×768 / 5.167 s） | `56226153eb7e1f8b9b8a5db680ffc966bc2b2da81f4411005fd33de1212a3acf` | `MEDIA upload 56226153…mp4 1297168B` ×2 |
| `product.png` | 144,874 B（1024×744） | `8b43d4219e1d783803c5b2575811f15540c3c33306a4a91683305b073cd51b7d` | `MEDIA upload 8b43d421…png 144874B` |

sha256 为本会话独立重算（不采信组内摘要），字节数与代理上传回执逐一对齐。

## 4) 动作真实性

- 两个工具均为页面真实点击（`[data-testid=video-replication-submit]` / `ai-video-editing-submit`）、真实 file input change、真实表单提交；任务落 localStorage `tool-task:v1:*`，非 mock。
- 前期两次 `POST -> 400`（9:07:30 / 9:10:44）伴随 `MEDIA upload 2cf24dba…bin 5B`、`2d711642…bin 1B`，属探测性空载荷尝试，未产生上游计费。
- 本轮 0 次重生成、0 次注入、0 行源码改动（`git status web/src` 空；先前 4 个 `.ts/.tsx` 的 `M` 是 stat 脏，`git diff` 为空）。

## 5) 未完成 / 待办

1. VIDEO_REPLICATION 仍 running：需要等上游终态（或下次会话重新读 store 拿 result），才能做 ftyp/sha + reload + 三动作。
2. AI_VIDEO_EDITING 是 failed 且不可反查：若判定要补验收，须换一个**未刷新页面**的完整提交流程，且先去 sub2 后台核对 9:18–9:23 三次 POST 是否已被受理，避免重复计费。
3. 本次未更新 R9 矩阵（`matrix.json/md` 的未提交改动属矩阵组，未纳入本提交）。

## 证据清单（`evidence/`）

- `proxy-23210.log` — 代理日志全量快照（捕获时 198 行）
- `proxy-23210-videos-lines.txt` — 上者中 `/v1/videos` 与 `MEDIA upload` 相关行（193 行）
- `group-raw-receipts.log` — 组自产原始回执摘录（含行号，未改一字）
- `group-PROGRESS.md` — 组退出前进度记录（含 mediaHostUrl 诊断）
- `task-state-raw-2123.json` — localStorage 三任务原始串（21:23:53 抓取）
- `task-state-2123.json` — 同上解析版（task + lease）

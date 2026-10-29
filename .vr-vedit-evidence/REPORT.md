# VIDEO_REPLICATION / AI_VIDEO_EDITING 真实提交报告（2026-10-29 21:13）
环境：应用 http://127.0.0.1:3000（vite，node PID 80431）、canvas-proxy :23210（PID 8834）、TMWebDriver :18766
方式：真实 UI 点击（无注入、无 mock、无子 worker）

## 1) VIDEO_REPLICATION —— 已真实提交（上游受理，仍在跑）
- 页面：/tools/ai-video/video-replication（我新建标签 1709629322）
- 输入：参考视频 06-result-video.mp4（1,297,168 B / 1344×768 / 5.167 s，截取 0–5 s）+ 参考图 + 口播脚本（已填）
- 模型：sub2::MiniMax-H3（渠道 sub2api https://sub2api.1006000.xyz）
- **taskId（本地）：task-mvtk9pu3-sfifnh**
- **taskId（上游）：task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G**
- 代理原始日志（canvas-proxy/proxy-23210.log）：
  ```
  9:11:27 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B
  9:11:35 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 7.5s
  9:11:37 PM GET  https://sub2api.1006000.xyz/v1/videos/task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 200
  ...（每 4-5s 轮询 200）
  9:12:56 PM GET .../task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 502 4.7s   ← 单次瞬时 502
  9:13:06 PM GET .../task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 200 3.6s   ← 恢复
  ```
- 状态：running（pollCount≈15），UI 出现一次瞬时错误条 "The origin web server returned an invalid or incomplete response to Cloudflare / unclassified"，重试后已回到 200 轮询 → **未终态，无 MP4，三动作不可验**
- 前置失败：task-mvtk5qfr-jogdhg → 素材上传失败 Failed to fetch（旧 mediaHostUrl 指向失效隧道 hidden-metallica-...trycloudflare.com，502）
- 已修配置：设置→偏好设置→素材公网基址 = https://laura-identical-station-execute.trycloudflare.com（实测 POST /__media/upload 200 并返回 sha256）

## 2) AI_VIDEO_EDITING —— 未提交（真实阻塞，未伪造）
- 页面：/tools/ai-video/ai-video-editing（我新建标签 1709629323；旧标签 1709629266 被其它调试器 attach，未动）
- 草稿已恢复：源视频 06-result-video.mp4（1.2MB / 1344×768 / 5.2s）、编辑需求已填、视频类型=商品人物精准编辑、模型 MiniMax-H3（sub2api）
- **阻塞点**：参考图槽位里躺着的是同一个 .mp4（1.2 MB · 1344×768 · video/mp4），不是图片；页面提示「本地网关对本工具要求至少 1 张参考图（原站标注选填，当前链路必须 1 张以上）」，`ai-video-editing-submit` 按钮 disabled=true
- 已备好真实素材：product.png 144,874 B sha256 8b43d4219e1d783803c5b2575811f15540c3c33306a4a91683305b073cd51b7d

## 21:20 最终收口（如实，未编造）
### A. VIDEO_REPLICATION —— 已真实提交，上游受理并在跑，尚未产出 MP4
- 本地 taskId：`task-mvtk9pu3-sfifnh`（submittedAt 21:10:27，tool=VIDEO_REPLICATION，model sub2::MiniMax-H3）
- 上游 taskId：`task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G`
- 原始回执（canvas-proxy/proxy-23210.log）：
  - `9:11:27 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B`
  - `9:11:35 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 7.5s`
  - `GET /v1/videos/task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G -> 200` 共 109 次（含 9:12:56、9:18:36 两次 502 瞬时抖动，已恢复）
- 当前终态：status=running，轮询 62 次 / 8m42s，UI 计时器在走 → **无结果 MP4 可验**（ftyp/sha/reload/三动作未执行，因为产物不存在）
- 备注：期间 store.error 留有一次 unclassified（Cloudflare invalid response）瞬时错误，随后继续 200 轮询

### B. AI_VIDEO_EDITING —— 已真实提交，上游 502，未拿到上游 taskId
- 本地 taskId：`task-mvtkgo4b-gaomk5`（submittedAt 21:15:51，attempts=1，model sub2::MiniMax-H3）
- 上游回执：`9:15:55 POST /v1/videos -> 400 3.3s`（multipart 被 sub2 拒）→ 走发布素材
  - `9:16:35 PM MEDIA upload 56226153...mp4 1297168B`（源视频发布成功）
  - `9:18:40 PM POST https://sub2api.1006000.xyz/v1/videos -> 502 124.7s`（JSON 重发，网关 124.7s 后 502）
- 当前终态：status=submitting，upstreamTaskId=null → 无 task 可轮询

### C. 已验字节（真实本地素材，实际投递到页面）
- product.png：144,874 B，sha256 `8b43d4219e1d783803c5b2575811f15540c3c33306a4a91683305b073cd51b7d`（代理日志 `MEDIA upload 8b43d421...png 144874B` 回执一致）
- 06-result-video.mp4：1,297,168 B，sha256 `56226153eb7e1f8b9b8a5db680ffc966...`（代理日志 `MEDIA upload 56226153...mp4 1297168B` 一致）

### D. 动作（纯 UI / 无注入）
- 两个工具均在页面上真实点击「立即生成 / 开始生成」，真实 file input change，真实表单提交；任务落 localStorage `tool-task:v1:*`，非 mock

## 21:5x R17 终态核查（只查不刷量，已提交外部阻塞终态）
- AI_VIDEO_EDITING `task-mvtkgo4b-gaomk5` 本地记录终态：**status=failed / error.code=submit-unconfirmed / attempts=1 / pollCount=0 / reconcileRequired=true / 无 upstreamTaskId**（21:15:51.707 提交 → 21:21:49.911 关闭，存活 358.2s）
- 上游原始回执（canvas-proxy/proxy-23210.log，程序化抽取存 `raw-receipts-verified-r17.log`）：21:15:55 POST 400 → 21:16:35 MEDIA upload 56226153…mp4 1297168B → **21:18:40 POST 502 124.7s → 21:20:46 POST 502 125.1s → 21:22:54 POST 524 125.7s**；此后无任何视频 POST（全日志仅 7 条 POST /v1/videos，已逐条归属）
- 只读探测：GET https://sub2api.1006000.xyz/v1/videos（经 23210）1.0s 返 404 无列表端点（链路可达但无法反查受理）；IDB 无 video_generation_logs 仓 → 无第二处 requestId
- 结论：无 upstream id 可轮询，"恢复成功"前提不成立；字节/fresh reload/三动作**不可执行**（不伪造）。未新增提交、未改代码配置、未派 worker。
- 详见 `TERMINAL-task-mvtkgo4b-gaomk5.md`

# VIDEO6 剩余 4 工具 · 真实链路运行记录（2026-10-29）

工具：IMAGE_TO_VIDEO / SALE_VIDEO / VIDEO_TRANSLATION / VIDEO_CONCAT

## 1. 环境事实（本次实测）

| 项 | 值 | 证据 |
|---|---|---|
| App | http://127.0.0.1:3000（infinite-canvas Vite dev） | 页面 DOM |
| 代理 | canvas-proxy :23210 / :23211 | `lsof` |
| 素材公网基址 | `https://hidden-metallica-voices-periodically.trycloudflare.com` | 见下 1.1 |
| 视频通道 | sub2api `https://sub2api.1006000.xyz/v1/videos`，模型 `sub2::MiniMax-H3` | 配置弹窗 DOM |
| 前端配置 | localStorage：videoModel=sub2::MiniMax-H3、mediaHostUrl=隧道 | 配置弹窗复核 |

### 1.1 素材公网通道双向可用（实测）

```
POST http://127.0.0.1:23211/__media/upload  → 200
{"ok":true,"path":"/__media/5e6c1ffa9ba51bd9c3c5b8ec95cfb47b.bin","bytes":11,"mimeType":"application/octet-stream"}
GET  https://hidden-metallica-voices-periodically.trycloudflare.com/__media/5e6c1ffa9ba51bd9c3c5b8ec95cfb47b.bin → 200, size=11, body="hello-media"
POST https://hidden-metallica-voices-periodically.trycloudflare.com/__media/upload → 200
```

结论：本地视频可经隧道变成上游可拉取的公网 https 直链（此前 VIDEO_TRANSLATION 400「中转只收 JSON / 需公网直链」的前置条件已具备）。

## 2. 上游状态（阻塞点）

`POST https://sub2api.1006000.xyz/v1/videos`

| 时间 | 请求体 | 结果 |
|---|---|---|
| 14:38 | `{}` | 400 `{"error":{"message":"model is required","type":"invalid_request_error"}}` |
| 14:46 | `{model:MiniMax-H3, prompt, duration:6, images:[公网URL]}` | **503** `{"error":{"message":"No eligible Grok media accounts","type":"grok_media_no_eligible_account"}}`（2.9s） |
| 14:52 | 同上 | **503** 同样原文 |

- 网关 `/health` → 200 `{"status":"ok"}`，说明不是整体宕机，而是**媒体（Grok）账号池当前无可用账号**。
- 参考：今日 01:20 该通路 JSON 形状探针仍 200（task_DNhsAxEHAUJd0OUiCE121dBGrkdslvvq 等 4 个任务号）；10:47 replication 真实出片；说明是**时段性账号池耗尽**，不是接口变更。
- cc-ai（`api.cc-ai.xyz`）/v1/models 仅 3 个非视频模型，无视频兜底通道。

## 3. UI 侧真实提交回执（IMAGE_TO_VIDEO）

结果面板原文（未加工）：

```
视频结果 / 结果未知 / 4s
任务失败
上游网关抖动（自动重试 3 次仍失败），通常是中转/Cloudflare 瞬时故障，稍后重试即可：
No eligible Grok media accounts · sub2api.1006000.xyz/videos · HTTP 503
诊断码：unclassified · 可按原参数重试
需要人工确认
请求可能已被上游受理，为避免重复扣费不会自动重发。请用上游任务编号核对后再决定。
结果未知时不会自动重试，避免上游已受理导致的重复扣费。
```

处理：503 属"上游明确未受理"，不产生任务号、不扣费；按原参数重试安全。

## 4. 复用已有真实结果（不重复扣费）

| 工具 | 真实产物 | 字节/格式 |
|---|---|---|
| IMAGE_TO_VIDEO | `IMAGE_TO_VIDEO/06-result-video.mp4` | 1,297,168 B · h264 1344x768 · 5.167s · aac 5.167s（task_ee59WDydFTvP1EJkT76YtmR3eJAs8fuP，200 创建、31 次轮询、content 200） |
| VIDEO_REPLICATION | `VIDEO_REPLICATION/link-mode/out.mp4` | 真实出片，可作 CONCAT/TRANSLATION 的输入素材 |
| VIDEO_CONCAT | 无 | 上一轮 PARTIAL：UI/校验/历史实测，未真实拼接 |
| VIDEO_TRANSLATION | 无 | 上一轮 PARTIAL：上游 400（multipart），JSON 通路探针 200 但缺公网直链（现已具备） |
| SALE_VIDEO | 无 | 上一轮 404（用错通道 cc-ai） |

## 5. 下一步

1. 账号池恢复后：按原参数重试 IMAGE_TO_VIDEO，跑 SALE_VIDEO / VIDEO_TRANSLATION / VIDEO_CONCAT 真实生成（视频经隧道公网化）。
2. 每次提交保留原始 HTTP 回执与任务号；unknown 只续查不重发。

# 六视频工具真实生成终验 — 现场实测发现（2026-10-29，续 5d64fed）

## 1. 上游能力实测（sub2api / MiniMax-H3，真实调用，无 mock）

| 请求形态 | 结果 | 原文/耗时 |
| --- | --- | --- |
| `GET /v1/models` | 200，仅 `MiniMax-H3` | 108B |
| `POST /v1/videos` 带 `videos:["data:video/mp4;base64,…"]` | **400** | `content[1].video_url.url must be a public HTTPS URL`（3.8s） |
| `POST /v1/videos` 带 `videos:["https://<tunnel>/small.mp4"]` | **200 建任务 → done 真实出片** | task_7GaZlkJjRq7uphoVzka6KvB0Am3nXMuY，约 185s 完成，成片 2.61MB / 6s，usage input_seconds=3 output_seconds=6 |
| `POST /v1/videos` multipart（带视频文件字节） | 400 | `'utf-8' codec can't decode byte 0xe8`（中转把二进制当文本，前次实测） |

结论：
1. 该通道**只接受 JSON**，且**源视频必须是公网 HTTPS 地址**（data URL 内联一律 400）。
2. 出片链路本身可用（创建 → pending → done → `/v1/videos/<id>/content` 带 Bearer 下载）。
3. 纯前端应用「本地上传 → data URL」的素材形态，在该通道上**永远拿不到成片**，只能拿到上面的原始 400 —— 这属于真实上游限制，不是 UI 假失败，也不是可 mock 掉的。

## 2. UI 现状（代码事实）

- `web/src/services/api/video.ts` `collectPublicVideoUrls()` 只收 `^https?://`；`planVideoSubmitPayloads()` 仅在 `inlineVideos` 时把 JSON 放首位。
- 源视频工作台只有「本地上传」；`video.tsx:2325` 的「TikTok 链接」页签明确写着「链接解析能力尚未接入」并禁用。
- 图片可 `data:image/...;base64` 内联（SALE_VIDEO / FISSION_LINK 属图像输入，不受此限）。

## 3. 对验收判定的直接影响

- 需要「源视频」的 4 个工具（AI_VIDEO_EDITING / VIDEO_REPLICATION / VIDEO_CONCAT / VIDEO_TRANSLATION）：UI 本地上传 → 原始 400，判 PARTIAL 或 BLOCKED，附上游原文。
- 图像输入工具（SALE_VIDEO / FISSION_LINK）：可走完整真实出片 + 三动作。

## 4. 环境快照

- app `http://127.0.0.1:3000`（vite dev，PID 80431）
- canvas-proxy `http://127.0.0.1:23210`（PID 51086）
- 静态素材站 `http://127.0.0.1:18471`（`/tmp/ic_cors_root`：`small.mp4` 640×360/3s、`probe.mp4`、`product-watch.jpg`）
- 公网隧道 `https://modifications-ant-routing-lyrics.trycloudflare.com`（cloudflared PID 6156；`small.mp4` 200 / 16830B，会随进程重启变化）

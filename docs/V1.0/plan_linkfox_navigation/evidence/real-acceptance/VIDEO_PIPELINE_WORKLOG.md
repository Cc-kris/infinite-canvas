# 视频真实链路打通 - 工作记录（2026-10-29）

## 环境事实
- 仓库 `/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`。
- dev server `http://127.0.0.1:3000` 与 `http://localhost:3000` 同一站点（不同 origin 的 localStorage 不共享）。
- 本机 canvas-proxy `http://127.0.0.1:23210`，用法 `http://127.0.0.1:23210/<完整上游URL>`；1.7MB JSON body 约 3s。
- 只有 `http://localhost:3000` origin 配了 sub2api 通道：
  - id `sub2api-real`, baseUrl `https://sub2api.1006000.xyz`, apiFormat openai, models `[MiniMax-H3/video]`
  - `127.0.0.1:3000` origin 只有 ccai-tmp（api.cc-ai.xyz，视频 API 不支持）
- 上游能力实测：
  - `GET /v1/models` → 200，仅 `MiniMax-H3`
  - `GET /v1/videos` → 404（只有 POST）
  - `POST /v1/videos` multipart → 400 `'utf-8' codec can't decode byte ...`（把二进制当文本解码）
  - `POST /v1/videos` JSON + 图片 data URL → 200 建任务（IMAGE_TO_VIDEO 已 PASS）
  - `POST /v1/videos` JSON + `videos:[https://公网]` → 200 建任务（VIDEO_TRANSLATION 记录）
  - 上传端点 `/v1/files`、`/v1/uploads`、`/v1/videos/upload` 全 404（OPTIONS 204 是代理层）
- 公网出口：`cloudflared tunnel --url http://127.0.0.1:18471` → `https://modifications-ant-routing-lyrics.trycloudflare.com`（仅验收用，非产品能力）
- 本地 CORS 静态站 `127.0.0.1:18471`（`/tmp/ic_cors_server.py`，根目录 `/tmp/ic_cors_root`），素材 `probe.mp4`(1.3MB)、`small.mp4`(16KB, 640x360 3s)

## 代码事实
- `web/src/services/api/video.ts`：`planVideoSubmitPayloads`@241、`collectPublicVideoUrls`@265、`createOpenAIVideoTask`@283。
  - 图片可内联 data URL；视频/音频当前只在 `url` 是 http(s) 时才进 JSON（`inlineVideos`），否则只能 multipart。
- 5 个工具 adapter：`web/src/features/tools/adapters/{sale-video,video-replication,ai-video-editing,video-translation,video-concat}.ts`
- 验收脚本：`web/scripts/real-acceptance/`（lib.mjs 提供 launchBrowser/prepareContext/evidenceDir）
  - `accept-video-translation.mjs` 从 `http://127.0.0.1:18471/` 取 `{baseUrl, apiKey}`（旧 key 服务已不在）

## 待判定（核心）
MiniMax-H3 是否接受 **视频 data URL 内联**（`videos:["data:video/mp4;base64,..."]`）。
若能接受 → 在 video.ts 增加视频内联，4 个带源视频的工具（复刻/编辑/翻译/拼接）无需外部存储即可真实出片。
若不接受 → 只有公网 http(s) URL 可行，产品侧需「源视频公网可访问」前提，真实生成只能用隧道临时验证并如实记录 PARTIAL/边界。

## 关键约束（用户/主控）
- 不读密钥文件；用应用已配置的 sub2api 通道。
- 不 mock、不伪报；create-poll-blob-ffprobe 证据链。
- 另加硬验收：5 个视频工具需 1:1 视觉/文案/字段/交互对照，证据 `visual-parity.json` + 对比截图；取不到原站证据就 PARTIAL。

# VIDEO_TRANSLATION 真实验收 · 运行时发现（2026-10-29 终稿）

## 结论一句话
真实 UI 全链路（真 Chrome + 真文件上传 + 真 provider 调用）已跑通，**卡在上游参数形态**：sub2api 的 `/v1/videos` 只吃 JSON，应用带源视频时只发 multipart → 稳定 400，本轮无法产出翻译成片，证据保留为 **PARTIAL**。

## 1. 配置现状（真读 localStorage）
- 两个 origin 独立：`localhost:3000`（本次验收域，已注入 sub2api 渠道）与 `127.0.0.1:3000`（channels 为空）。
- 应用默认 `default` 渠道指向 `api.openai.com` 占位（视频模型 `grok-imagine-video`），无真实 key。

## 2. 真实提交与上游原文
- 请求：`POST https://sub2api.1006000.xyz/v1/videos`，`Content-Type: multipart/form-data`（源视频 1,297,168B / H.264 / 5.167s）
- 响应：`HTTP 400 {"error":{"message":"'utf-8' codec can't decode byte 0xe8 in position 1614: invalid continuation byte"}}`
- 语义：中转把视频字节当文本解码 → 只支持 JSON 体

## 3. 上游字段探针（同一把 key，直接建任务）
| JSON 形状 | HTTP | taskId |
|---|---|---|
| `videos: [公网 https URL]` | 200 | task_DNhsAxEHAUJd0OUiCE121dBGrkdslvvq |
| `video_url: 公网 https URL` | 200 | task_Q2qtvaiynLurmLHeXRtcltkJQNSZuZdv |
| `input_reference: 公网 https URL` | 200 | task_IN9NHhCBMe7cMUq48DKUBVxzUnBvYFCx |
| `content[].video_url.url` 公网 https URL | 200 | task_qvw92rVvPECWV731lLRBFZfNKp7HVga8 |

→ 上游支持「JSON + 源视频公网直链」；multipart 与 data URL 都不通。

## 4. 为什么应用拿不到公网直链
上传媒体走 `file-storage.ts`：IndexedDB + objectURL，本地生成，**不产生公网地址**。所以「JSON 内联 videos[]」这条通路在真实上传场景下不可达，需要产品层面引入对象存储/CDN 才闭环。

## 5. 本轮修复（前端参数/路由问题）
`web/src/services/api/video.ts`
1. `collectPublicVideoUrls()`：只认 `http(s)`，过滤 `blob:` / `data:`。
2. 源视频全部具备公网 URL 时，把 `videos: [url]` 内联进 JSON 体。
3. `planVideoSubmitPayloads({ inlineVideos })`：已内联则不再强制 multipart，中转域先发 JSON。
4. `relayMultipartRejectionHint()`：命中上游 400 原文时，把「该中转只接受 JSON，源视频需公网 http(s) 地址」写进用户可见报错。

验证：`bun test src/services/api/video.submit-plan.test.ts` → 6 pass；`npx tsc --noEmit` → 0 error；重跑真实 UI 验收 → 报错文本出现新诊断。

## 6. 环境踩坑（下次省时间）
- Playwright 验收脚本须在前台页跑：后台标签（`document.hidden=true`）会让 `<video>` 元数据加载被节流，误报「读不到原视频时长」。headless 不受影响，所以最终改走 `web/scripts/real-acceptance/`。
- macOS 无 `timeout`；非登录 shell 里 `node`/`bun` 不在 PATH（`/opt/homebrew/bin/node`、`~/.bun/bin/bun`）。
- 仓库测试跑 `bun test`，且 bun 无 DOM：模块顶层读 `localStorage` 的用例需先 stub 再动态 import。
- 8799、8899 已被占用 → 本地密钥/文件服务用 **18471**。

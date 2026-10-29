# VIDEO_TRANSLATION · `/videos` 请求形态一致性审计（只读复核，2026-10-29）

结论：**本地代码与已抓取的真实协议一致，未发现明确本地错误 → 不修改源码**。
剩余不可判定项按 `UNVERIFIED` 记录，归属外部（中转/模型）能力边界，非本地参数形态问题。

审计口径：只读代码 + 仓库内已抓取的真实请求/响应；本轮**未开隧道、未提交新任务、未轮询**。

## 1. 已抓取的真实协议（证据存在仓库内）

证据目录：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/`

### 1.1 上游原文（multipart 被拒）
```
POST https://sub2api.1006000.xyz/v1/videos    Content-Type: multipart/form-data
HTTP 400
{"error":{"message":"'utf-8' codec can't decode byte 0xe8 in position 1614: invalid continuation byte","type":"invalid_request_error"}}
```
见 `findings_runtime.md` §2、`result.json` → `realRun.upstreamRequest/upstreamResponse`。

### 1.2 上游原文（JSON 受理，实测 200）
`run-translation.json` 的 `receipts`（同一任务 task-mvth8drs-dk86it）：
```
11:45:31  POST /v1/videos  400  {"error":{"message":"'utf-8' codec can't decode byte 0xe8 …"}}
11:46:34  POST /v1/videos  200  {"id":"task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd","request_id":"…","status":"pending","model":"MiniMax-H3"}
11:46:36  GET  /v1/videos/task_ye7…  200  {"id":"task_ye7…","model":"MiniMax-H3","status":"pending","progress":0}
```
终态（`run-resume-translation.json`，resume-only 不重提交）：
```
reload.items[0].status = succeeded，1 个结果（task-mvth8drs-dk86it，upstream task_ye7…）
result: bytes=1080637, duration=6.583008, 768×768, magic=ftyp, headHex=00 00 00 20 66 74 79 70 69 73 6f 6d
issues: []
```

### 1.3 素材公网 URL 要求（上游字段探针，同一把 key）
`result.json` → `upstreamCapabilityProbe`：

| JSON 形状 | HTTP | taskId |
|---|---|---|
| `videos: [公网 https URL]` | 200 | task_DNhsAxEHAUJd0OUiCE121dBGrkdslvvq |
| `video_url: 公网 https URL` | 200 | task_Q2qtvaiynLurmLHeXRtcltkJQNSZuZdv |
| `input_reference: 公网 https URL` | 200 | task_IN9NHhCBMe7cMUq48DKUBVxzUnBvYFCx |
| `content[].video_url.url` 公网 https URL | 200 | task_qvw92rVvPECWV731lLRBFZfNKp7HVga8 |

即：**JSON + 源视频公网 https 直链才能建任务**；multipart 与 data URL 均不通。

## 2. 三项逐条比对（真实协议 ↔ 本地代码）

| 维度 | 真实协议 | 本地实现（文件:行） | 判定 |
|---|---|---|---|
| Content-Type（JSON） | 只接受 JSON 体 | `video.ts:52 aiHeaders()` 不设 CT；`video.ts` `post()` 对非 FormData 显式 `"Content-Type": "application/json"` | 一致 |
| Content-Type（multipart） | 被中转当文本解码 → 400 | `post()` 对 FormData 不设 CT（交给浏览器带 boundary） | 一致（且已不再作为中转首选） |
| 源视频字段名 | `videos: [url]`（字符串数组） | `jsonFields.videos = publicVideoUrls`（`planVideoSubmitPayloads({inlineVideos})` → 中转域先 JSON） | 一致 |
| 其它视频字段 | `model`=去掉前缀的模型名（响应 `"model":"MiniMax-H3"`）、`prompt/seconds/size/resolution_name/generate_audio/watermark/mode` | `modelOptionName(model)` 去前缀；同名 snake_case 字段同序 | 一致 |
| 素材公网要求 | 必须公网 http(s)，blob/data/127.0.0.1 一律拉不到 | `media-publish.ts:isPublicMediaUrl()` 拒绝非 http(s) 与回环/私网/`.local`；`collectPublicVideoUrls()` 用它过滤 | 一致 |
| 本地素材兜底 | 中转 400 原文命中即说明"只吃 JSON" | `relayMultipartRejectionHint()` 命中 `codec can't decode` / `Expecting value` → `publishReferenceVideos({requireHttps:true, hostBase: mediaHostUrl})` → JSON 重发一次；发布失败直接抛错，不降级 | 一致 |
| 轮询/取片 | `GET /v1/videos/{id}` → `GET /v1/videos/{id}/content` | `pollOpenAIVideoTask()` 同路径，`videoResultUrl()` 兼容 `video.url` 嵌套 | 一致 |
| 工具层字段 | 上游无口型/语种等参数 | adapter 的 7 个 camelCase 字段只做 gateway 校验 + 写进 prompt（`composeVideoTranslationPrompt`），不伪造上游字段 | 一致（设计如此，非丢参） |

代码位置：
- `web/src/services/api/video.ts`：`planVideoSubmitPayloads` / `collectPublicVideoUrls` / `relayMultipartRejectionHint` / `createOpenAIVideoTask`
- `web/src/services/media-publish.ts`：`isPublicMediaUrl` / `isLocalHostname` / `publishReferenceVideos`
- `web/src/features/tools/adapters/video-translation.ts`：`buildVideoTranslationFields` / `auditVideoTranslationFields`
- `web/src/services/api/tools/gateway.ts:180 buildToolConfig()`：表单值 → `seconds/size`（`buildToolConfig` 只映射这三项，其余不进 provider 请求）

## 3. 本轮验证（跑，不是读）

```
cd web && bun test src/services/api/video.submit-plan.test.ts src/features/tools/adapters/video-translation.test.ts
→ 39 pass / 0 fail / 97 expect() / 2 files, 578ms
```
单测覆盖的正是三条协议断言：中转域有公网视频先发 JSON、本地 blob 只发 multipart、`collectPublicVideoUrls` 过滤 `blob:/data:/127.0.0.1`。
本轮未改源码，故未重跑 `tsc`（工作树无代码改动）。

## 4. UNVERIFIED（外部阻塞，非本地参数形态）

1. **公网媒体基址是外部依赖**：应用媒体落 IndexedDB/objectURL，JSON 通路必须有 `mediaHostUrl`（隧道或对象存储）才能给上游直链。真实运行用的是临时 cloudflared 隧道 `https://telephony-affects-borders-wider.trycloudflare.com`；无此基址时 `publishReferenceVideos` 抛 `missing-host`，属环境缺失而非代码错误。**UNVERIFIED**：产品化（常驻对象存储/CDN）是否上线。
2. **"翻译是否真的生效"不可由该中转校验**：上游请求只有 `prompt`+源视频，无 `target_language`/`lip_sync` 字段，成片是否真的换语言/对口型只能人耳肉眼判定。本轮证据只有字节与可播放性（1,080,637B / 6.583s / 768×768），**UNVERIFIED**：语义级翻译保真。
3. **失败首跳延迟**：本地视频 + 中转域名时先发 multipart（必然 400），实测 11:45:31 → 11:46:34 共 63s 才落到 JSON 200。这是"不预先发布以免给 cc-ai 类收 multipart 的中转白传字节"的取舍，不是正确性错误；未改。**UNVERIFIED**：是否值得按域名白名单提前发布。
4. **跨通道一致性**：`ccai` 中转整站不支持视频 API（`Video API is not supported for this platform`），未在本轮复测。

## 5. 复现入口
- 实现：`web/src/services/api/video.ts`、`web/src/services/media-publish.ts`、`web/src/features/tools/adapters/video-translation.ts`
- 真实验收脚本：`web/scripts/real-acceptance/accept-video-translation.mjs`（需真 Chrome + 渠道 key + 公网媒体基址）
- 既有证据：`docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/`（含 `downloaded.mp4` 1,080,637B）

# VIDEO_REPLICATION · 链接模式（公网直链）实测记录

日期：2026-10-29　提交：`fff8132`

## 1. 为什么改

旧实现里「参考视频」只支持本地上传，且 TikTok 链接模式在 UI 上直接写死
「链接解析能力尚未接入（需要服务端解析）」，`sourceState.linkResolved` 恒为 `false`，
导致链接模式永远无法提交 —— 属于「假装支持」。

上游实测（sub2api → MiniMax-H3 `/v1/videos`）：

| 送源方式 | 结果 |
| --- | --- |
| `content[].video_url.url = data:video/...`（本地字节内联） | 400 `content[1].video_url.url must be a public HTTPS URL` |
| `videos: ["https://…/small.mp4"]`（公网直链） | 200 建任务 |
| `content[].input_image.url = data:image/...`（图片内联） | 200，`usage.input_image_count=1`，正常出片 |

结论：源视频必须公网 HTTPS；图片可以内联。所以链接模式应当**透传公网直链**，而不是拒绝。

## 2. 改了什么

- `adapters/video-replication.ts`
  - `parsePublicVideoLink(raw)`：`link-empty`（空）/`link-invalid`（blob:、data:、非 http(s)）/
    `link-unresolved`（tiktok/douyin/kuaishou 分享页，明确说「需要服务端解析，当前未接入」）；
    合法直链原样返回（trim 后）。
  - `linkToVideoReplicationVideoRef(url)`：按扩展名给 MIME（`.mp4`→`video/mp4`，`.mov`→`video/quicktime`），保留完整 URL 与文件名。
- `registry/video-replication.ts`：交给 `parsePublicVideoLink` 判定，链接模式不再依赖「服务端解析」；
  `blob:`/`data:` 判 `link-invalid` 并给出「上游拿不到」的可执行原因。
- `components/tools/workspaces/video.tsx`：link 模式下用直链构造 `video` / `videoRef` 提交，
  UI 实时显示「已识别公网直链：<url>」或错误原因，去掉「未接入」的安慰式文案。
- `adapters/video-replication.test.ts`：重写原「链接解析未接入」断言，补直链成功/空/本地地址/
  分享页/MIME 映射/提交校验正反例/上传模式仍需真实视频共 8 组用例。

## 3. 验证

- `bun test src/features/tools/adapters/video-replication.test.ts` → **36 pass / 0 fail**
- `bun run typecheck`（tsc --noEmit）→ **exit 0**
- 全套 `bun test`：1351 pass / 3 fail / 3 errors，失败用例全部在本次未改动的文件
  （`tool-page.integration.test.tsx` 期望 `/tools/smart-edit`、`product-scene.test.ts` ×2），
  **在 HEAD（不含本次改动）的 worktree 里复跑同样 3 个失败** → 属既有失败，与本次改动无关；
  3 个 errors 是 Playwright e2e 文件被 `bun test` 扫到导致的 `test.describe()` 报错，属环境噪声。

## 4. 真实生成（链接模式链路）

本目录 `run-submit.json` / `run-final.json` / `out.mp4` 为公网直链源视频的真实任务记录：

- 源视频：`https://modifications-ant-routing-lyrics.trycloudflare.com/small.mp4`（640×360 / 3s / 16830B，公网可访问，HTTP 200）
- 提交：`POST /v1/videos`，`{"model":"MiniMax-H3","videos":[<上面的 URL>],...}` → HTTP 200，`task_Ma7egazZrnGPt5BtVr5vW2hfApVxvCIS`
- 轮询至 `status=done`（约 4 分钟），`usage = {input_seconds: 3, output_seconds: 6, total_seconds: 6}`，
  说明上游**确实读到了那 3 秒源视频**（input_seconds 来自直链下载），不是忽略入参。
- 产物 `out.mp4`：2,277,978 B，`ffprobe` → h264 1344×768 24fps + AAC，时长 6.58s。

结论：链接模式「公网直链 → 上游建任务 → 出片」整链路已真跑通（API 层）。
UI 点击级验收（工作台填直链 → 提交 → 结果卡 → 发画布）尚未做，状态保持 PARTIAL，不得据此宣称 UI PASS。

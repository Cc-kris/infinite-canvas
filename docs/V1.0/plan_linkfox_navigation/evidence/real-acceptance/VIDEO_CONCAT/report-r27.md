# R27 VIDEO_CONCAT 真实提交验收报告（2026-10-29 23:26–23:30）

## 1. 结论（先说结果）

本轮**没有拿到上游 taskId，也没有产生任何费用**：两次真实 `POST /v1/videos` 都被上游以 400 拒绝，
页面在 3 分钟（189s）内把任务收敛为 `failed`，错误码 `submit-not-dispatched`（retryable=true，
文案「这次提交在请求发出之前就中断了（页面刷新或关闭），上游没有收到请求，也不会产生费用。可以直接重试。」）。

即：`c8c8ce9e` 修的「永久卡 submitting」**已生效**（不再无限挂起，会收敛到确定失败态），
但**错误归因不准**——真实原因是上游 400，被报成了「请求未发出」。

## 2. 真实上游交互（原文，来自页面网络拦截 + 23220 代理日志）

通道：`sub2api-real` / `MiniMax-H3` / openai 格式 / 720x1280 / 20s
本地任务：`task-mvtp52jt-4yy3d4`（clientOperationId `41f7d918-0f02-4ce2-8971-a4a31e63bfd4`）

| 时间(本地) | 事件 | 结果 |
|---|---|---|
| 23:26:48.643 | POST /v1/videos（第 1 次，JSON 内联素材） | 400 `{"error":{"message":"'utf-8' codec can't decode byte 0xff in position 1535: invalid start byte","type":"invalid_request_error"}}` |
| 23:27:02–23:28:15 | 4 次 `POST /__media/upload` → trycloudflare 隧道（素材发布为公网 URL） | 成功，返回 3 个 `.../__media/<hash>.mp4` |
| 23:29:49.767 | POST /v1/videos（重试，带公网 URL，body 25463B） | 400 `{"error":{"message":"references exceed limits: images 9, videos 3, audio 3, total 12","type":"invalid_request_error"}}` |
| 23:29:57 | 任务收敛 failed | code=`submit-not-dispatched`, retryable=true |

响应体原始记录见 `r27-run.json` → `upstream.responses`。

## 3. 两个真实原因

1. **中转把二进制当文本解码**：sub2api 的 /videos 对「含二进制的请求体」直接 400（`utf-8 codec can't decode`）。
   `video.ts:314 relayMultipartRejectionHint` 已能识别该报文并改走「发布公网 URL + JSON 重发」，这条链路**工作正常**
   （4 次 media/upload 成功、重试请求带上了 URL）。
2. **参考素材超限（images 9 / videos 3 / total 12）**：本次草稿里残留了上一轮的 2 个片段
   （small.mp4 3s、clip-b.mp4 4s），脚本再上传 2 个（downloaded.mp4 6.6s、task_QFvq6WMc_video.mp4 6.6s），
   变成 4 段 20s；每段各带封面帧（cover-rj_…-0）+ 内联图，最终 references 计数 9 图 3 视频 3 音频。
   上游上限：videos ≤3、total ≤12 —— 直接拒绝。

## 4. 需要修的三点（未在本次改动，作为结论交给下一轮）

1. `submit-not-dispatched` 的定性过宽：请求**确实发出并收到 400** 时不应套用「请求未发出」文案，
   应保留上游 400 原文（这里能直接看出 references 超限）。建议：dispatch 阶段一旦拿到 HTTP 响应，
   就写 `submit-rejected`+上游 message，而不是走队尾的 lease 收敛。
2. 提交前应做 references 上限预检（count 图像/视频/音频），超限时在本地直接给可读错误，
   不必把 20s 的素材发布到公网再被拒（浪费 4 次 upload / 3 分钟）。
3. 验收脚本应在测试前清空 `ToolAssetInput` 里已存在的片段（本轮因草稿残留变成 4 段）。

## 5. 复现方式

```
cd web && /opt/homebrew/bin/node scripts/real-acceptance/accept-r27-concat-real.mjs
# 产物：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r27-run.json
#       r27-*.png（提交前/提交后/fresh reload 三张 DOM 截图）
```

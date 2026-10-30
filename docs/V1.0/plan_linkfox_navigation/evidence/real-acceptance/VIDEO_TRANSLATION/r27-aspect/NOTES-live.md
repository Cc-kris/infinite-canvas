# r27-aspect 现场笔记（边跑边记）

时间 2026-10-30
- 13:02 受信点击「立即生成」→ 本地 task-mvui9wua-5aed92，上游 task_E6QMbFgZ765iJbrmOXnvCpeYe0Hh4wTA
- 13:21 上游 succeeded（pollCount=154，transientFailures=0，finishedAt=1793337812414）
- 提交参数（持久化 configSnapshot）：model=sub2::MiniMax-H3, size=1280x720, quality=auto, count=1, videoSeconds=6, channelId=sub2
- 全局 config.size = 1:1；旧基线 r22-f 同源片在 1:1 下输出 768x768 → 本次 size 由 videoRatio=16:9 分支改写（03-request-derivation.json）
- 页面中途被并发改源码打成 error boundary（handleDisableLipSync is not defined @ video-translation.tsx:474），重载后恢复；源码此刻已无该标识符

## 发现（真实、需写进报告）
- 结果项 result.items[0].ingestError = 「媒体下载失败（HTTP 401）。」，无 storageKey
- 原因链：ingestResultMedia → uploadMediaFile(url) → fetchMediaBlob → fetch(withLocalProxy(url)) **不带 Authorization** → 上游 /content 需鉴权 → 401
- 对照：另一任务 task-mvuilah9-v6u5s1（13:11，size=720x720）ingest 成功，说明不是必然发生（该任务上游返回的地址可匿名取）
- 复现：curl http://127.0.0.1:23210/https://sub2api.../content → 401 API_KEY_REQUIRED
- 页面用全局 config.apiKey 带 Bearer → 401 INVALID_API_KEY（任务走 sub2 渠道 key，需 resolveModelChannel）

## 复现/校验手段
- 本地收件服务：127.0.0.1:8899 POST /put?name=xxx（/tmp/r27sink/sink.py），用于把页面取到的真实字节落盘
- 待办：用渠道 key 取 /content → 落盘 → ffprobe 验 1280x720 → 记录 sha256

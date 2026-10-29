# VIDEO_REPLICATION / AI_VIDEO_EDITING 真实提交 — 进度与发现 (2026-10-29)

## 环境
- 应用 :3000 (vite, node PID 80431)，canvas-proxy :23210 (PID 8834)，TMWebDriver :18766
- 我的标签：1709629322 = /tools/ai-video/video-replication（用 CDP Target.createTarget 新建）
- 另一个标签 1709629266 = /tools/ai-video/ai-video-editing（被别的调试器 attach，web_scan 报 "Another debugger is already attached"）

## 配置真相（localStorage infinite-canvas:ai_config_store）
- channels: sub2 (sub2api https://sub2api.1006000.xyz, models: MiniMax-H3 capability=video)
             default (ccai-tmp https://api.cc-ai.xyz, gpt-image-2/grok-imagine-video/gpt-5.5/gpt-4o-mini-tts)
- videoModel = sub2::MiniMax-H3 ; proxyEnabled=true proxyUrl=http://127.0.0.1:23210
- mediaHostUrl = https://hidden-metallica-voices-periodically.trycloudflare.com  ← 该域名是 23211 隧道(旧)，对 23210 返回 502

## 第 1 次提交（真实 UI 点击）
- 按钮 [data-testid=video-replication-submit] → taskId task-mvtk5qfr-jogdhg，模型 sub2::MiniMax-H3
- 结果 status=unknown, error={code:"timeout-or-network", message:"素材上传失败：Failed to fetch · sub2api.1006000.xyz/videos"}
- 抓包：POST https://hidden-metallica-voices-periodically.trycloudflare.com/__media/upload → TypeError: Failed to fetch
- 即：卡在素材公网托管，**未打到上游 /v1/videos，未产生计费**

## 根因
mediaHostUrl 指向失效隧道；23210 当前隧道域名（/private/tmp/ic_media/tunnel23210.log）=
  https://laura-identical-station-execute.trycloudflare.com

## 下一步
把 mediaHostUrl 改为上面这个活跃域名（走 UI 设置），再提交一次；失败保留真实错误。

## 21:17 进展追加
- VIDEO_REPLICATION task-mvtk9pu3-sfifnh / 上游 task_2JtjPzuJuUBegKsPPvQoQWrXCdGt5B9G：running（pollCount≈39），多次 200 轮询；9:12:56 单次 502 已恢复
- AI_VIDEO_EDITING 已真实提交 task-mvtkgo4b-gaomk5（sub2::MiniMax-H3，attempts=1）
  - 9:15:55 POST /v1/videos -> 400（multipart 被 sub2 拒，预期路径）
  - 9:16:35 MEDIA upload 56226153...mp4 1297168B（源视频已发布到公网基址）
  - 之后停在 submitting，无 JSON 重发 POST（观察中）
- 关键坑：素材公网基址失效时，视频类工具会在「发布素材」阶段失败，错误文案含 Failed to fetch；修好后连上
- 关键坑2：AI_VIDEO_EDITING 参考图槽必须真实图片，若塞 mp4 会 disabled

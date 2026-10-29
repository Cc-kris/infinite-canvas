# VIDEO6 余 4 工具 现场检查点（worker，2026-10-29）

## 环境（已实测）
- vite dev `http://127.0.0.1:3000`（node PID 13543 / 80431 两个进程，只有一个独占 3000）
- canvas-proxy `127.0.0.1:23211`（PID 59793）→ 隧道 `https://hidden-metallica-voices-periodically.trycloudflare.com`（cloudflared 60473）
- 静态素材站 `127.0.0.1:18471`（cloudflared 6156），示例 `small.mp4` 640×360/3s
- 素材托管实测：`POST <tunnel>/__media/upload` → 200 `{"path":"/__media/<sha>.bin"}`；`GET /__media/notexist` → 404

## 通道
- 应用当前配置：`infinite-canvas:ai_config_store`，channel=cc-ai `https://api.cc-ai.xyz`，videoModel=`default::grok-imagine-video`；cc-ai 无 `/v1/videos`（AI_VIDEO_EDITING 历史任务 404 原文留存）。
- sub2api `https://sub2api.1006000.xyz` key 有效：`GET /v1/models` 200，仅 `MiniMax-H3`（2.08s）。
- 上游语义（VIDEO6_LIVE_FINDINGS）：源视频必须公网 HTTPS；`images[]` 可用 data URL；成片约 185s、2.61MB/6s。

## 已有真实结果（可复用，勿重复扣费）
- task_7GaZlkJjRq7uphoVzka6KvB0Am3nXMuY：经公网 small.mp4 出片 2.61MB/6s。
- 历史视频链路：1344×768 / 5.17s / 5.41MB MP4；下载即 404（一次性 content）。

## 打开自有标签页的可行路径
- window.open / <a target=_blank> click 均未生成新标签（浏览器拦截）。
- 扩展 background.js 支持 `{cmd:'tabs', method:'create', url}`；待找到从页面触发该 cmd 的通道（content.js postMessage 或 TMWebDriver master 转发）。

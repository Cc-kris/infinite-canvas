# R9 视频缺口：VIDEO_TRANSLATION / VIDEO_CONCAT 真实提交记录（2026-10-29 19:30–20:00）

## 一、通道事实（本轮修复的根因）

| 环节 | 事实 |
|---|---|
| 旧 canvas-proxy 23210 | 进程加载的是**旧版 server.js**（根响应无 `media` 字段），`POST /__media/upload` 未命中 → 素材无法发布公网 |
| 新 canvas-proxy 23220 | 仓库当前 `canvas-proxy/server.js` 起在同一端口段（`/tmp/ic_media/proxy23220.mjs`），根响应含 `media.upload`，上传/回读可用 |
| 公网基址 | `https://telephony-affects-borders-wider.trycloudflare.com` → 23220；实测上传 1,297,168 B mp4 后公网 GET 200、同字节 |
| 为什么必须发布 | sub2api `/v1/videos` 的 multipart 通道会把文件字节当文本解码，返回 `400 'utf-8' codec can't decode byte 0xe8`；应用内 `video.ts` 已内置「被拒 → 发布公网 URL → JSON 重发」兜底 |

## 二、两次真实提交（UI 真点、真文件、真 provider）

| 工具 | multipart 首投 | 公网兜底后 JSON | 真实 taskId | 提交后状态 |
|---|---|---|---|---|
| VIDEO_TRANSLATION | `400` utf-8 codec | `200`（19:46:34） | `task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd` | pending，上游持续轮询 |
| VIDEO_CONCAT | `400` utf-8 codec | `200`（19:52:03） | `task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF` | pending，上游持续轮询 |

- 两工具均使用 MiniMax-H3（sub2api-real），素材为本仓库既有合法素材：
  翻译 = `IMAGE_TO_VIDEO/06-result-video.mp4`（1,297,168 B）；拼接 = `small.mp4` + `clip-b.mp4`（422,358 B 已发布到公网）。
- 翻译首次提交被页面能力阻断（模型无「口型同步」声明）→ 走页面自身按钮「关闭口型同步后继续」后才提交，属真实 UI 路径，未绕过校验。
- 原始回执：`proxy-receipts.json`（POST 400/200 时间戳、MEDIA upload 记录、153 条上游轮询）。

## 三、当前结论（如实）

- **通道已打通**：两工具都拿到上游 200 + 真实 taskId，历史缺口「无该工具绑定的真实 task」不再成立。
- **产物仍 pending**：截止记录时上游未返回 completed，因此 **MP4 magic/字节校验、fresh reload 历史、下载/存资产/发画布三动作尚未取证**，本轮状态记 `PARTIAL`，不写 PASS。
- 待 upstream 完成，用同脚本 `web/scripts/real-acceptance/accept-r9-video-gaps.mjs`（持久 profile，历史不注入）自动补完这三段验收并写 `evidence/<TOOL>/run-<tool>.json`。

## 四、复跑方式

```bash
# 1) 新 proxy（带 /__media/upload）
/usr/local/bin/node /tmp/ic_media/proxy23220.mjs
# 2) 公网隧道
/opt/homebrew/bin/cloudflared tunnel --url http://127.0.0.1:23220 --no-autoupdate
# 3) 验收（真 UI 提交 + 全链路取证）
cd web && IC_PROXY_URL=http://127.0.0.1:23220 \
  IC_MEDIA_HOST=https://<你的隧道域名> \
  /usr/local/bin/node scripts/real-acceptance/accept-r9-video-gaps.mjs --tool=translation
```

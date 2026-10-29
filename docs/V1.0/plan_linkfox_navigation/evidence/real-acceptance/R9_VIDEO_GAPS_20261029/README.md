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

## 三、当前结论（2026-10-29 20:13 续查后：PASS）

- **通道已打通**：两工具都拿到上游 200 + 真实 taskId，历史缺口「无该工具绑定的真实 task」不再成立。
- **上游终态**：两个 taskId 均已 `done`（TR 6s / CC 7s，`/v1/videos/{id}/content` 可取）。
- **应用侧终态**：续查（不重提交）后本地任务均为 `succeeded` 且各 1 条 video 结果，见下节 §五。
- 三段验收（MP4 magic+字节 / fresh reload 历史 / 下载·存资产·发画布）已全部取证。

## 五、续查结果（resume-only，未重新提交）

脚本：`web/scripts/real-acceptance/accept-r9-video-resume.mjs`（复用 922edd5 留下的持久 profile，靠应用自身
`hydrateAndRecoverToolTasks` 查询式恢复推进到终态；页面不点「立即生成」，全程无 POST /v1/videos）。

| 项 | VIDEO_TRANSLATION | VIDEO_CONCAT |
|---|---|---|
| 上游 taskId | task_ye7NHl8fwVr1Roh5ysCKB1C7Nr2lMwZd | task_JjRxRSbjgytomlSzPrtLNQPwhIuhLBWF |
| 本地 taskId | task-mvth8drs-dk86it | task-mvthgaa4-pdg1eq |
| 本地终态 | `succeeded` | `succeeded` |
| 结果项 | 1 × video/mp4，1080637 B | 1 × video/mp4，2133234 B |
| 结果区实测 | readyState=4，6.583s，768×768 | readyState=4，7.292s，768×1344 |
| MP4 magic | `ftyp`（`00 00 00 20 66 74 79 70 69 73 6f 6d`） | 同 |
| 下载 | `video-translation-result-1.mp4`，1080637 B，**与结果字节一致** | `video-concat-result-1.mp4`，2133234 B，**一致** |
| fresh reload 历史 | 命中 1 条 `data-task-status=succeeded`，「查看结果」可点 | 同 |
| 存资产 | 回执 `已保存到资产库（B6d0Tr3H2GZ6MNBYXIe09）` | `已保存到资产库（NCM6l4cDKtyL6cz6o67OG）` |
| 发画布 | 回执 `已发送到画布（C62Iwwjc0E4NP9TcXH7C_）` | `已发送到画布（ce14D3JIahdvNNuS173zT）` |

回执文件：`evidence/real-acceptance/VIDEO_TRANSLATION/run-resume-translation.json`（首次跑，含 `succeeded` 快照）、
`evidence/real-acceptance/VIDEO_CONCAT/run-resume-concat.json`（全链路）。

已知取证局限（不掩饰）：`存资产`/`发画布` 的**读回**用的是 `import("/src/stores/...")`，
在 Vite dev 下拿到的是 HMR 的另一份模块实例，所以 `assets.count=0`、`videoNodes=null` 不可信；
**可信的是页面自己的反馈文案**（含资产 id、画布节点 id），截图 `result-restored.png` / `sent-canvas.png` 为证。

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

### 独立复核（不走应用代码，直接读落盘文件）

```
VIDEO_TRANSLATION/downloaded.mp4  1080637 bytes  magic=0000002066747970  sha256=9416a68a11b04d39faa4cde7ea57d753d6b9fd720705775a64cf86dbf8632a8c
VIDEO_CONCAT/downloaded.mp4       2133234 bytes  magic=0000002066747970  sha256=daf59082f500fa964baa508b9ece84a62c3f2093f46e12c2a309eec501613b2f
```

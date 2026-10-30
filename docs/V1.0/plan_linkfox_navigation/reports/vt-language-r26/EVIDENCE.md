# EVIDENCE — vt-language-r26（真实上游回执 + ASR 判定）

时间：2026-10-30 13:11–13:22（本机 CST）
仓库：`/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`
结论：**真实上游调用成功（succeeded），但目标语言 zh 未生效（成片仍是英语）**；「朗读提示词」缺陷已不再复现。

## 1. 任务回执

```json
{
  "localTaskId": "task-mvuilah9-v6u5s1",
  "upstreamTaskId": "task_fnyYPg9WDzJfWzhWzjI9y80mBKUQNmT9",
  "upstreamProvider": "openai",
  "channelId": "sub2",
  "model": "sub2::MiniMax-H3",
  "status": "succeeded",
  "attempts": 1,
  "pollCount": 13,
  "submittedAt": "2026-10-30T13:11:14+08:00",
  "terminalAt": "2026-10-30T13:22:29+08:00",
  "wallClockSec": 675,
  "resultItems": 1
}
```

- 提交请求体不含任何语言字段（`sourceLanguage/targetLanguage/lipSync` 均未发出），
  与 REPORT §2-R1 一致：**语言只能靠提示词承载**。
- `configSnapshot`：`{capability: video, model: MiniMax-H3, apiFormat: openai, size: 720x720,
  quality: auto, count: 1, videoSeconds: 6, channelId: sub2}`。
- 构建产物 `auditMissing = []`，prompt 长度 1267 字符（含新增语言契约与禁朗读/静音条款）。

## 2. 成片文件

| 项 | 值 |
|---|---|
| 文件 | `artifacts/04-result.mp4` |
| 大小 | 1,199,227 B |
| sha256 | `a3613615999ab80d38871233c49e5975fadec3be2bb3930f57b0b9089c3a276d` |
| 时长 | 6.583333 s |
| 视频 | h264 768×768 |
| 音频 | aac 32 kHz 立体声 |

（同一 sha256 与页面 IndexedDB 中 `tool-result:task-mvuilah9-v6u5s1:0:...` 字节数一致，
说明落盘文件就是上游返回体，未经转码。）

## 3. ASR 判定（whisper.cpp small，本地，同模型同条件）

源片 `evidence/real-acceptance/SALE_VIDEO/r12-downloaded.mp4`（6.592s，英文真人声）：

```
-l en → Meet the watch that tracks your day and night, sapphire glass, 7-day battery,
        and a band that breathes with you. Grab yours today!
```

成片 `04-result.mp4`：

```
-l auto / -l en → Meet the watch that tracks your day and night, sapphireles roost with you,
                  flenches iron glocks, drojure cloche, shun yours today.
-l zh           → meet the watch that tracks your day and night sapphireles roost with you
                  flencher's iron glocks droger cloche shun yours today   （0 个中文字符）
```

判定要点：
1. 目标语言 = `zh`，成片音轨 = **英语**，零中文字符 → 翻译未发生；
2. 成片文本与页面提示词正文**无重合** → r22-f 的「朗读提示词」现象未复现（R2 修复生效）；
3. 首句与源片逐字一致、后半段失真 → 属生成模型语音重综合的退化，不是翻译错误。

## 4. 复验脚本（可重跑）

```bash
# 0) 前置：本地栈 http://127.0.0.1:3000 + 媒体代理 http://127.0.0.1:23210
#    页面需已配置可用渠道（本机为 sub2 / MiniMax-H3）。全程不读取密钥内容。

# 1) 页面内提交（真实 adapter + gateway，无 mock）
#    page.evaluate:
#      buildVideoTranslationBrowserInput({sourceUrl, values:{targetLanguage:'zh', ...}})
#      → port.submit(...) → gateway.submit → POST /v1/videos
#    记录返回的 task.id 与 upstreamTaskId

# 2) 轮询（关键坑：动态 import 的 store 与页面运行实例不是同一份，
#    getToolGateway().poll 会报 "Unknown tool task"；必须显式绑定 port）
#    createToolGateway({ store: {get,set,remove,list,readPersisted}, lease: null })

# 3) 取结果字节
#    getMediaBlob(task.result.items[0].storageKey)
#    → POST http://127.0.0.1:23210/__media/upload  → curl 落盘

# 4) 判定
/opt/homebrew/bin/ffmpeg -v error -y -i 04-result.mp4 -ac 1 -ar 16000 -c:a pcm_s16le res16k.wav
/opt/homebrew/bin/whisper-cli -m ggml-small.bin -f res16k.wav -l zh -nt
/opt/homebrew/bin/whisper-cli -m ggml-small.bin -f res16k.wav -l en -nt
```

## 5. 本轮踩到的坑（避免下轮重复）

1. **无头浏览器新 context 没有 localStorage** → 没有渠道 key → `provider-rejected: 请先配置 API Key`。
   必须复用已登录页面（本机 `http://127.0.0.1:3000/tools/ai-video/video-translation`）。
2. **页面 store 的 hydrate 是异步的** → 刚打开页面就读 `config.channels` 是空的（会误选 `default::grok-imagine-video`）。
   提交前必须等 `channels.length > 0`。
3. **`18471` 不是密钥服务**，是本机静态素材目录（`clip-b.mp4` 等）；别再当 key server 用。
4. **页面 HMR 会清空内存 tasks** → 先 `hydrate()` 从 `localStorage['tool-task:v1:<id>']` 恢复。
5. `node` 不在 bash 的 PATH 中，用 `/opt/homebrew/bin/node`；`ffmpeg/ffprobe/whisper-cli` 同在 `/opt/homebrew/bin`。
6. HuggingFace 直连超时，`https://hf-mirror.com/...` 可用（466MB 模型约 1 分钟）。

## 6. 运行时观察（非本轮改动，记录在此）

页面 `/tools/ai-video/video-translation` 在 13:22 一度抛出
`ReferenceError: handleDisableLipSync is not defined`（`video-translation.tsx`），
属工作区并行编辑（r27 诚实降级改造）的中间态；13:24 重新加载后页面正常渲染（上传区出现），
当前 `handleDisableLipSync` 已无任何引用。若后续再出现，检查该文件是否存在悬空回调引用。

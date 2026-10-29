# AI_VIDEO_EDITING 原真实任务 task-mvtkgo4b-gaomk5 — 终态核查（R17 / 2026-10-29）

> 约束遵守：未派子 worker、未读调度 SOP、**未新增任何提交（无刷量）**、无 mock/无注入、无编造。
> 本轮只做两件事：① 读原真实任务的本地记录；② 读上游原始回执与做一次只读连通探测。

## 1. 原真实任务记录（来源：localStorage `tool-task:v1:task-mvtkgo4b-gaomk5`，同源标签 1709629323 读）

| 字段 | 值 |
|---|---|
| id | `task-mvtkgo4b-gaomk5` |
| toolId | `AI_VIDEO_EDITING` |
| status | **`failed`**（已终态，不是 running/submitting） |
| attempts | 1 |
| pollCount | 0（从未拿到 upstreamTaskId，一次轮询都没发生） |
| upstreamTaskId | **不存在**（记录内无该字段） |
| clientOperationId | `3759ae7a-beef-478b-bd96-bcd1c5927552` |
| reconcileRequired | `true` |
| error.code | **`submit-unconfirmed`** |
| error.message | 页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。 |
| submittedAt | 2026-10-29 21:15:51.707 (+08) |
| finishedAt | 2026-10-29 21:21:49.911 (+08)（存活 358.2s） |
| 模型/参数 | sub2::MiniMax-H3 / 1280x720 / count=1 / videoSeconds=6 / channel=sub2 |

记录全文（verbatim，唯一删节为 prompt 正文，其余字段原样）：

```json
{
 "id": "task-mvtkgo4b-gaomk5",
 "toolId": "AI_VIDEO_EDITING",
 "status": "failed",
 "clientOperationId": "3759ae7a-beef-478b-bd96-bcd1c5927552",
 "fingerprint": "38fd9c683967bbc5",
 "capability": "video",
 "draftRevision": 67,
 "sourceAssetIds": [
  "07ZQ4-A0PdJNwzc93S1wX",
  "VT4dPYKTgrzzdyFmlp-ag",
  "07ZQ4-A0PdJNwzc93S1wX"
 ],
 "configSnapshot": {
  "capability": "video",
  "model": "sub2::MiniMax-H3",
  "apiFormat": "openai",
  "size": "1280x720",
  "quality": "auto",
  "count": "1",
  "videoSeconds": "6",
  "channelId": "sub2"
 },
 "createdAt": 1793279751707,
 "submittedAt": 1793279751707,
 "updatedAt": 1793280109911,
 "finishedAt": 1793280109911,
 "attempts": 1,
 "pollCount": 0,
 "transientFailures": 0,
 "reconcileRequired": true,
 "upstreamTaskId": null,
 "error": {
  "code": "submit-unconfirmed",
  "message": "页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。",
  "retryable": true
 }
}
```

## 2. 上游原始回执（来源：`canvas-proxy/proxy-23210.log`，程序化抽取未编辑）

```
# 原始回执行（程序化抽取，来源 canvas-proxy/proxy-23210.log，未编辑）
6: 9:07:30 PM POST https://sub2api.1006000.xyz/v1/videos -> 400 8.8s
7: 9:08:33 PM MEDIA upload 2cf24dba5fb0a30e26e83b2ac5b9e29e.bin 5B
8: 9:10:44 PM POST https://sub2api.1006000.xyz/v1/videos -> 400 17.4s
9: 9:10:47 PM MEDIA upload 2d711642b726b04401627ca9fbac32f5.bin 1B
10: 9:11:27 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B
11: 9:11:35 PM POST https://sub2api.1006000.xyz/v1/videos -> 200 7.5s
28: 9:12:52 PM MEDIA upload 8b43d4219e1d783803c5b2575811f155.png 144874B
75: 9:15:55 PM POST https://sub2api.1006000.xyz/v1/videos -> 400 3.3s
86: 9:16:35 PM MEDIA upload 56226153eb7e1f8b9b8a5db680ffc966.mp4 1297168B
121: 9:18:40 PM POST https://sub2api.1006000.xyz/v1/videos -> 502 124.7s
155: 9:20:46 PM POST https://sub2api.1006000.xyz/v1/videos -> 502 125.1s
187: 9:22:54 PM POST https://sub2api.1006000.xyz/v1/videos -> 524 125.7s
```

归属判定（按时间线拆分）：
- 第 6/8/11 行（21:07:30 / 21:10:44 / 21:11:35）= **VIDEO_REPLICATION** 的 task-mvtk9pu3-sfifnh（前两次 400 是素材基址失效，第三次 200 受理）
- 第 28 行 21:12:52 = 参考图 product.png 发布
- 第 75 行 21:15:55 → 400 3.3s = AI_VIDEO_EDITING 首次 POST（multipart 被 sub2 拒，走素材发布回退）
- 第 86 行 21:16:35 → 素材发布成功（56226153…mp4, 1297168B）
- 第 121 行 **21:18:40 → 502 124.7s**
- 第 155 行 **21:20:46 → 502 125.1s**（即"两连 502"）
- 第 187 行 **21:22:54 → 524 125.7s**（第三次，Cloudflare 源站超时）
- 全日志 `POST https://sub2api.1006000.xyz/v1/videos` 共 **7 条**，以上为全部；21:22:54 之后**再无任何视频 POST**（21:23 之后日志只有 api.cc-ai.xyz 的 `/v1/images/edits`）

三次尝试耗时 124.7 / 125.1 / 125.7 s，全部卡在 ~125s 网关上限后由 Cloudflare 断流（524 = 源站在 100s 内无响应）。**上游从未返回过任务体 → 不可能有 upstreamTaskId。**

## 3. 是否"已恢复成功"（只读探测，未新建任务）

- 经 canvas-proxy 以 `http://127.0.0.1:23210/https://sub2api.1006000.xyz/v1/videos` 只读 GET：**1.0s 返回 404 `404 page not found`**
  - 说明：网关链路此刻可达（不是 502），但 sub2api 未注册视频列表端点 → 无法借列表反查该次提交是否被受理。
- 本地 IDB 对象仓集合 = `app_state / image_files / image_previews / media_files / prompt_cache / tool_assets`（**无 video_generation_logs 仓**，也无任何含 `mvtkgo4b` 的记录）→ 无第二处 requestId 可查。
- 结论：**没有任何上游 id 可轮询**；"恢复成功"这一前提在物理上不成立——该任务已被应用自身以 `submit-unconfirmed` 关闭为 failed。

## 4. 终态判定（如实）

**外部阻塞（upstream 阻塞），UNVERIFIED → 关闭为 failed。**
- 阻塞点：`POST https://sub2api.1006000.xyz/v1/videos`（MiniMax-H3 视频编辑 JSON 提交）在 21:18:40–21:22:54 连续三次被网关以 502/502/524 截断，均约 125s，远超 Cloudflare 100s 源站超时。
- 影响范围：AI_VIDEO_EDITING 的 **提交阶段**（素材发布已成功，编辑请求未被上游确认受理）。
- 因此以下验证项**不可执行**（产物不存在，执行即为伪造）：
  1. 结果视频字节数 / sha256 / ftyp 魔数
  2. fresh reload 后重取产物并比对字节一致
  3. 三条交互动作（播放、暂停、进度定位到中段）

## 5. 本轮做了什么 / 没做什么

做了：
- 读原任务真实记录（`failed`/`submit-unconfirmed`/attempts=1/pollCount=0）
- 程序化抽取代理日志全部视频相关原始回执，单独落盘 `raw-receipts-verified-r17.log`
- 一次只读上游连通探测（GET，1s，404）

没做（明确声明）：
- ❌ 没有重新提交任何任务（`attempts` 保持 1，未产生新计费风险）
- ❌ 没有改任何代码 / 配置 / 本地任务记录
- ❌ 没有构造、伪造任何视频、截图或"验证通过"结论
- ❌ 没有派子 worker、没有读调度 SOP

## 6. 解除阻塞需要的条件（供决策）

1. sub2api 侧（MiniMax-H3 编辑通道）POST 响应能从 ~125s+ 降到 Cloudflare 可承受范围内，或
2. 该通道改为"提交即返回 taskId + 异步轮询"（当前 VIDEO_REPLICATION 已能 7.5s 拿到 taskId，说明差别在这条编辑 JSON 链路的处理时长）。
满足后由用户明确授权再提交一次（届时 attempts 才允许 +1），届时按"字节 → fresh reload → 三动作"顺序验收。

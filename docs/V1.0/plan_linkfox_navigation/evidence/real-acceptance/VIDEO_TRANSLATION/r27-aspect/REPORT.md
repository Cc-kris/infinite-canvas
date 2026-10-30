# VIDEO_TRANSLATION 画幅修复真实验收（r27-aspect）

- 仓库 `/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`，本地栈 `http://127.0.0.1:3000`（v0.27.0）
- 通道：`sub2::MiniMax-H3`（channelId=sub2，上游 `https://sub2api.1006000.xyz`）
- 源片：`/tmp/r22f-source.mp4`（ffprobe：h264 1344×768，5.167s，aac 5.167s）
- 方式：真实 Chrome 页面 + CDP 受信鼠标点击提交（非脚本注水）；数值取自页面持久化记录 / 代理日志 / 页面内应用模块真实执行
- 时间：2026-10-30 13:02 提交 → 13:21 上游 succeeded

## 结论（分两段，必须分开看）

### A. 请求侧画幅修正：通过 ✅

| 证据 | 值 | 出处 |
|---|---|---|
| UI 选择 | `outputRatio=source`（跟随原视频） | `01-pre-submit-ui.json` |
| UI 摘要 | 本次提交画幅：**16:9（1280x720）**；源画面 7:4（1344×768） | 同上 |
| UI 诚实提示 | 「上游只提供固定画幅档位…→ 本次输出 16:9（1280x720）。这不是逐像素保持」 | 同上 |
| 持久化提交配置 | `configSnapshot.size = "1280x720"`（全局 `config.size = 1:1`） | `02-tool-task-record.json` |
| 同一代码路径复现 | `resolveVideoTranslationOutputPlan({outputRatio:'source'}, 1344×768)` → ratio `16:9`、size `1280x720`；`buildToolConfig(cfg,'video',input)` → size `1280x720`（全局仍 1:1） | `03-request-derivation.json` |
| 真实提交链路 | POST `/v1/videos` → 200；上游任务 `task_E6QMbFgZ765iJbrmOXnvCpeYe0Hh4wTA` | `04-proxy-log-excerpt.txt` |

对比旧基线（r22-f，同源片）：当时全局 `size=1:1` → 上游输出 **768×768**（`r22-f/REPORT.md` F3）。本次同一页面、同一模型，仅画幅策略改为 16:9，请求档位即变为 1280×720 —— **「画面被静默改成 1:1」这一缺陷在请求侧已修复**。

### B. 输出侧像素验证：被上游产物丢失阻断 ⛔（本次未完成）

- 13:21 上游 `succeeded`（pollCount=154，transientFailures=0，`finishedAt` 见 `05-tool-task-record-succeeded.json`）
- 客户端入库结果：`items[0].ingestError = 「媒体下载失败（HTTP 401）。」`，无 `storageKey`
- 代理日志时间线（`06-proxy-log-content-401-404.txt`）：
  - 13:23:20 `GET /v1/videos/<id>` → 200（任务当时仍可见）
  - 13:23:30 `GET /v1/videos/<id>/content` → **502**（9.6s，Cloudflare/源站）
  - 13:23:32 起 `/content` → **404**；13:24–13:26 多次 **401**（匿名取件）
  - 13:27:22 之后 `GET /v1/videos/<id>` 也 → **404**（任务记录已不可见）
  - 13:28:01 用当前渠道 key 查另一个已知 sub2 任务（`task_fnyYPg9…`）同样 404；`GET /v1/models` → 200（key 本身有效）

即：**产物在上游 502 之后就查不到了**，此后任何鉴权尝试都只能拿到 404，故无法下载字节做 ffprobe 尺寸校验。

## 顺带发现的真实缺陷（均未改源码，仅记录）

- **D1（客户端，中）结果入库走匿名取件**：`ingestResultMedia → uploadMediaFile(url) → fetchMediaBlob → fetch(withLocalProxy(url))` 不带 `Authorization`；对 sub2api 这类需要鉴权的 `/v1/videos/<id>/content` 必然 401（日志 13:23:32–13:26:19 连续 401，响应体 `API_KEY_REQUIRED`）。对照：`services/api/video.ts:450` 的 `pollOpenAIVideoTask` 走的是 `axios.get(..., {headers: aiHeaders(config)})` 的**鉴权**路径，两条链路不一致。
- **D2（上游/环境，阻断）产物 502 后蒸发**：`/content` 先 502 再 404，随后状态查询也 404，同时段另一任务同样 404。属上游侧数据丢失，客户端无补救手段（本地既无 `storageKey` 也无字节）。
- **D3（环境，观察）跑批期间页面被并发改源码打崩**：13:2x 页面 `handleDisableLipSync is not defined`（video-translation.tsx:474）错误边界；重载后恢复，源码此刻已无该标识符。与本次验收无关，但会打断长跑任务的 UI 观测。

## 证据文件

| 文件 | 内容 |
|---|---|
| `01-pre-submit-ui.json` | 提交前 UI 全量状态（outputRatio / 摘要 / 提示 / 语言 / 口型 / 数量 / 资产） |
| `02-tool-task-record.json` | 本地任务记录（含 configSnapshot、sourceAssetIds） |
| `03-request-derivation.json` | 页面内应用模块实测：plan → 16:9/1280x720，buildToolConfig → 1280x720（全局 1:1） |
| `04-proxy-log-excerpt.txt` | 提交/上传/受理日志（POST /v1/videos 400→200） |
| `05-tool-task-record-succeeded.json` | 终态记录（succeeded + result.items + ingestError） |
| `06-proxy-log-content-401-404.txt` | 产物取件失败时间线（502 → 404 → 401） |
| `NOTES-live.md` | 现场笔记（含排查路径与坑） |

## 若要把 B 段补完（建议，需重跑一次）

1. 重新上传同一源片，画幅选「跟随原视频」，提交 → 记录 `configSnapshot.size` 应为 1280x720（已可预期）
2. 在上游返回 `succeeded` 的**同一分钟**内完成取件（本次 502 出现在完成前 10s，产物随即消失）：可用页面内 `resolveModelRequestConfig(cfg,'sub2::MiniMax-H3').apiKey` + `GET /v1/videos/<id>/content` 拉字节
3. 字节落盘后 `ffprobe -show_entries stream=width,height` 校验应为 **1280x720**（而非 r22-f 的 768×768）
4. 若仍 404/502，则判定为上游不可用，应换通道或用可匿名读取的结果地址复验

## 修复是否需动代码

- 画幅修复（请求侧）：**已验证生效，无需再改**
- D1（入库缺鉴权）：建议在 `fetchMediaBlob`/结果入库路径对「同源中转的相对/绝对 `/content` 地址」附带渠道鉴权，或复用 `video.ts` 的鉴权下载函数；此为独立缺陷，不在本次改动范围

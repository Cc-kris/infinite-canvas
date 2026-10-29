# AI_VIDEO_EDITING 既有真实任务续查 / 历史恢复（2026-10-29）

## 结论

上游真实任务 `task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm`（MiniMax-H3，通道 sub2 / https://sub2api.1006000.xyz）
**已出片，终态 `done`**，本地任务记录恢复为 `succeeded`，结果字节真实入库并可复现。

- 未新建任务、未重复提交、未重复扣费（全程只 GET 同一 taskId）。
- 未伪造任何 PASS：下面的数值全部来自 provider 回执与实测文件。

## 1. 上游回执（原始）

```
GET https://sub2api.1006000.xyz/videos/task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm
→ HTTP 200  application/json; charset=utf-8   (经应用本地代理 http://127.0.0.1:23210，与前端 withLocalProxy 同一路径)
```

```json
{"id":"task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm","model":"MiniMax-H3","progress":1,
 "request_id":"task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm","status":"done",
 "usage":{"input_image_count":2,"input_seconds":6,"output_seconds":6,"total_seconds":6},
 "video":{"duration":6,"url":"/videos/task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm/content"}}
```

完整记录见 `receipt.json`。

## 2. 真实产物校验（下载 + 字节 + 格式 + 时长）

```
GET /videos/task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm/content → 200 video/mp4
bytes   = 2,268,656
sha256  = 47573c147325d451f41ffd89ae21b82c895623c682832546c24181b18f92a505
文件头   = 00 00 00 20 66 74 79 70 ("ftypisom")
```

ffprobe（详见 `video-verify.json`）：

| 项 | 值 |
| --- | --- |
| format | mov/mp4，duration 6.583s，bitrate 2,756,847 |
| video | h264 1344×768 @24fps，158 帧 |
| audio | aac 6.575s（207 帧） |

> provider 声明 `output_seconds=6`，容器实测 6.583s；以实测为准（记入 receipt.json notes）。

## 3. 历史恢复（"修历史恢复"的实证）

现象：本地任务快照在长轮询期间已不存在（`localStorage` 全量 54 键 + IndexedDB/sessionStorage 均无 `task-mvt42rpv-kfl1ov`、无 `task_QFvq...` 字样），
即历史里根本没有这条任务，刷新/重进工具页都看不到结果。

处理（全部走应用自身代码，不手改业务逻辑、不伪造）：

1. 用 `useToolTaskStore` 以 `unknown` + 真实 `upstreamTaskId` 重建记录（`configSnapshot: {capability: video, model: MiniMax-H3, apiFormat: http, count:1, channelId: sub2}`）；
2. 调 store 的 `recoverAll()` → `gateway.recover()` → `planRecovery()` 判定为 `poll`（`unknown` 有 upstreamTaskId 时只查询、绝不重提交）；
3. 真实轮询命中 `done`，任务转 `succeeded`；
4. 结果字节经 `uploadMediaFile()` 写入 IndexedDB `infinite-canvas/media_files`，`storageKey = tool-result:6x-FsSnD1IMk76p5iayw-`，并回写进任务快照。

库内字节与本地文件的一致性（页面内 `crypto.subtle.digest` 实测）：

```
IDB blob size   = 2,268,656   type = video/mp4
IDB sha256      = 47573c147325d451f41ffd89ae21b82c895623c682832546c24181b18f92a505
文件   sha256   = 47573c147325d451f41ffd89ae21b82c895623c682832546c24181b18f92a505   → 一致
快照   = {status: succeeded, reconcileRequired: false, item:{storageKey, bytes:2268656, mimeType:video/mp4, durationMs:6583}}
```

## 3.1 测试证据

```
cd web && bun test src/services/api/tools src/stores
→ 80 pass / 0 fail / 322 expect() calls / 5 files   (2026-10-29 15:59 CST)
```

覆盖文件：`assets.test.ts`、`batch-runner.test.ts`、`gateway.recovery.test.ts`、`gateway.result-items.test.ts`、`result-assets.test.ts`。
原始输出见 `test-report.txt`（含「刷新后提交中/结果未知 → 收敛不重提交」「真实网关 submit 链路：OSS 结果刷新后仍可下载」等与本链路直接相干的用例）。

## 4. 复现路径（用户侧）

工具页 `/tools/ai-video/ai-video-editing` → 历史记录中该任务为「成功」，结果可播放/下载（数据来自 IndexedDB `media_files`，刷新后由 `restorePersistedTaskMedia` 重建 objectURL）。

## 5. 已知边界（未做/风险，不掩盖）

- 该任务的**原始提交参数（prompt、两张输入图、源视频）未能恢复**：`localStorage` 记录已被清空，历史会话日志只保留了读取脚本、未回显记录内容。本次恢复只重建了「上游 ID + 终态 + 真实产物字节」，快照的 prompt/输入字段为空。
- 未在共享浏览器里做二次 UI 点击复现：该标签页被并行 worker 反复导航（观测到 HMR 刷新与新标签弹出），长脚本会被打断；因此验收以「存储层 + 字节层」双证据为准（sha256 双向一致），未以 UI 截图充当证据。
- 未修改任何业务源码，未新增 provider 配置。

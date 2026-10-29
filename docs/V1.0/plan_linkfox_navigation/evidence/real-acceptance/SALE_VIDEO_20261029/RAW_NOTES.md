# SALE_VIDEO 续查原始记录（2026-10-29 续查轮）

任务：`task-mvt76u6p-7cfnff`（succeeded，pollCount 22，上游 `task_hhe2FmdxNCwz8Vn86YO7kYxrudtQDGVx`）
结果：video 1,366,190 B / video/mp4 / storageKey `tool-result:Be9yI14yvxVSg1r0TjYPJ`

## 1. 磁盘字节
- `sale-video-task-mvt76u6p.mp4` 1,366,190 B
- sha256 `39193f0a2c97c24e3a06fd6d38f8c633e6b6a53546d1c235038f4f7cb22bcb73`
- ffprobe：H.264 High / yuv420p / 768x768 / 24fps / 158 帧 / 6.583333s；AAC-LC 32kHz stereo 6.575s；bit_rate 1,660,180

## 2. 全解码（代替 video 元素验证播放）
- `/opt/homebrew/bin/ffmpeg -v error -i ... -f null -` 退出码 0（0 错误日志）
- 3s 抽帧 `frame_at3s.png` 768x768，均值 RGB(72.5,57.0,54.6)、stddev ≈50（非纯黑，有画面内容）

## 3. IndexedDB 内字节
- db `infinite-canvas` / store `media_files`，key `tool-result:Be9yI14yvxVSg1r0TjYPJ`
- blob 1,366,190 B video/mp4，页面内 sha256 与磁盘一致

## 4. fresh reload 历史恢复
- `location.reload()` → navigation type = `reload`
- localStorage `tool-task:v1:task-mvt76u6p-7cfnff` 仍在，status=succeeded，bytes=1366190
- blob URL 由 IDB 重生：`dda6bebe-…` → `71e8f0ca-cee6-474c-9b6f-c22ab955a3bf`（旧 URL 失效后重建）
- 历史记录 2 条（15:04 已完成 / 00:13 失败），点击「查看结果」把结果放回上方结果区，`<video>` 与「下载 / 存入资产 / 发送画布」三个按钮（`data-testid=tool-result-{download,save,canvas}-0`）出现且可用
- 对该 blob `fetch()` → 200，1,366,190 B，sha256 与磁盘一致

## 5. 环境限制（重要）
- 该浏览器标签 `document.visibilityState === 'hidden'`，`hasFocus=false`
- 媒体管线被完全延迟：video 元素没有任何 `loadstart/progress/loadedmetadata` 事件，readyState 恒 0、networkState 2、`duration=null`，`play()` 超时
- H.264 支持检测为 `probably`（非编解码器缺失），是渲染器隐藏导致，不是链路缺陷
- 结论：不能用 video 元素取证播放，改用 ffmpeg 全解码 + 抽帧

## 6. SALE_VIDEO 历史任务清单（原样记录）
| 任务 id | 状态 | 时间 | 说明 |
| --- | --- | --- | --- |
| task-mvt76u6p-7cfnff | succeeded | 2026-10-29 14:51:43 → 15:07:03（历史区标签显示 15:04） | 1 个结果，1366190B |
| task-mvsbd685-5tzfuw | failed | 2026-10-29 00:13:25 | `provider-rejected` / 404 page not found · api.cc-ai.xyz/videos · HTTP 404（attempts 1，pollCount 0） |
| task-mvs6m72i-eidjm6 | failed | 2026-10-28 22:00:28 | `provider-rejected` / 请先配置 API Key（attempts 1，pollCount 0） |

failed 任务不重试、不新建，只按原样记录。本轮 `unknown` 0 条。

## 7. 下载 / 资产库 / 画布（同一轮）
- 下载：点「下载」→ 页面反馈「已下载 sale-video-result-1.mp4」→ `~/Downloads/sale-video-result-1.mp4` 1,366,190 B，sha256 与源文件相同，ffprobe 6.583333s / h264 768x768 + aac
- 资产库：asset id `CSjc856F5YIETwEX435Cr`（08:30:14Z），bytes 1366190，storageKey `video:1AYEDh1wUV9Fa61rqtVpT`（sha256 同源）；`/assets` 页出现 2 张「SALE_VIDEO 结果 1｜工具结果｜视频」卡（一条为上一轮 15:08 入库）
- 画布：新项目 `P3rUhnqi1Rm9ZpAqs4KPo`「SALE_VIDEO 结果」，1 个 video 节点 storageKey `video:2mcYvf2X6QWmd31QyZDDs`（sha256 同源），metadata bytes 1366190
- 资产 metadata 仅 `toolId/taskId/resultItemId`（**无 resultAssetKey** → 重复入库会产生重复条目）；资产/画布宽高 1280x720 为 `FALLBACK_VIDEO_WIDTH` 回退值，data 无 durationMs

完整表格见同目录 [`FOLLOWUP_20261029.md`](./FOLLOWUP_20261029.md)。

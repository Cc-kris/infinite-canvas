# VIDEO_TRANSLATION 真实浏览器验收（r22-f）

- 环境：仓库 `/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`，本地栈 `http://localhost:3000`（v0.27.0）
- 通道：`sub2api-real`（模型 `sub2api-real::MiniMax-H3`），上游任务 `task_dYZmmUVNwbfqKzryL2BbRqR1fHXwMTdK`
- 方式：真实 Chrome 页面 + CDP trusted 输入（非脚本注水）；所有数值来自页面 IndexedDB / 下载文件 / 代理日志实测

## 结论

产品链路 **通过**：上传真实视频 → 提交 → 轮询至 succeeded → 预览可播放 → 下载 → 存入资产 → 发送画布（项目与节点真实落库）。
同时记录 3 条可复现的输出/元数据问题（见「发现」）。

## 执行时间线（同一任务 `task-mvuflf9e-djxprc`）

| 阶段 | 时间 | 证据 |
|---|---|---|
| 提交（POST /v1/videos → 200） | 11:48:17 | `04-proxy-log-excerpt.txt` L698 |
| 任务记录 running，upstreamTaskId 已绑定 | 运行中 | `02-tool-task-record.json` |
| 轮询 127 次，0 次瞬时失败 | `2026-10-30 11:47:21` → `2026-10-30 12:02:11`（约 15 分钟） | `05-tool-task-record-succeeded.json` |
| 状态 succeeded，结果 1 条 | 2026-10-30 12:02:11 | 同上 |

结果条目：`id=task-mvuflf9e-djxprc-0`，`storageKey=tool-result:task-mvuflf9e-djxprc:0:WPiVUb0sWmR8AnsfZCHKK`，
`bytes=1249837`，`mimeType=video/mp4`，`payloadDropped=False`。

## 四步 UI 操作逐项核验

1. **任务成功**：任务卡片状态由 running → succeeded；页面无错误横幅，`transientFailures=0`。
2. **下载**：`06-result-video.mp4` 与页面预览 blob 字节一致，sha256 `7c15bdb2…274c`（见 `06-result-sha256.txt`）。
   - `mdls`：H.264 + MPEG-4 AAC，6.584s，768×768。
3. **存入资产**：页面 Toast「已存入资产」，资产库新增 `M9g-UrvgLtZIYEjMIqrVk`（`07-canvas-and-asset-idb.json`）。
   - 资产记录 `bytes=1249837`、`storageKey=video:zgzM_z3Up7vmQEjpY14TJ`，与下载文件一致。
4. **发送画布**：Toast「已发送到画布（XAlXhFqR_ZxWSJMImYk6r）」；打开该画布后 DOM 存在节点
   `video-1793333636962-aoazu`，IndexedDB `infinite-canvas/app_state → infinite-canvas:canvas_store` 中
   项目 `XAlXhFqR_ZxWSJMImYk6r`（标题「VIDEO_TRANSLATION 结果」，createdAt 2026-10-30T04:13:56.936Z）
   含 1 个 video 节点，`metadata` 为
   `{content: blob:…, status: success, storageKey: video:l_O76YiQrJhKGVKy-Jw5d, bytes: 1249837, mimeType: video/mp4, durationMs: 6583, naturalWidth: 768, naturalHeight: 768}`。

## 发现（按严重度）

### F1（中）「存入资产」写入了 1280×720 兜底尺寸，与真实 768×768 不符
- 实测：资产 `M9g-UrvgLtZIYEjMIqrVk` 的 `data.width/height = 1280/720`，而同一份字节解码为 768×768。
- 根因（代码级）：`web/src/services/media-metadata.ts:20` `FALLBACK_VIDEO_WIDTH = 1280`；
  `readVideoMeta` 超时即用 1280×720 放行，`file-storage.ts` 的 `UploadedFile` 只带 `timedOut` 标记，
  而 `tool-result-actions.ts::saveResultItemToAssets` 直接把 `stored.width/height` 写入资产记录，未做二次校正。
- 对照组：发画布路径已修复（HEAD `0ac1e48f`），节点 `naturalWidth/Height=768` 正确；
  即同一份视频在两条路径上得到两种尺寸，属修复未覆盖的同类缺口。
- 建议：资产入库时若 `timedOut`，异步二次解码校正，或复用 `video-meta-reconcile` 的校正逻辑。

### F2（中，上游输出）成片时长比源片长 27%
- 源 `/tmp/r22f-source.mp4`：5.167s（mvhd 实测）；结果：6.584s。差 +1.42s。
- 任务提示要求「保持原画面、镜头节奏与字幕时间轴不变」，时长膨胀与目标冲突；从包络看是**开头多出约 0.8s 静音**（最佳对齐 lag=+16 帧 ×50ms）。
- 属模型输出特性，前端如实透传，无出错；但「标准翻译」模式下时长守恒应在 UI 侧提示或以拼接裁剪兜底。

### F3（中，上游输出）画幅被改：1344×768 → 768×768
- 源 `tkhd` 为 1344×768（1.75:1），结果 768×768（1:1），画幅与配置 `size=1:1` 一致，
  但提示词要求「保持原画面」仅替换音轨，二者矛盾。建议在 VIDEO_TRANSLATION 的配置里锁定跟随源画幅。

### F4（低，工具方法学）标签页不可见时 CDP 输入事件被丢弃
- 现象：我另开画布标签后，工具页 `visibilityState=hidden`，trusted 点击（CDP Input.*）全部无响应，
  页面看起来「按钮点了没反应」；`Page.bringToFront` 后立即恢复。JS `.click()` 始终有效但不构成可信验收。
- 已写入 SOP 提示：真实验收前必须确保目标标签在前台。

## 音轨客观比对（`08-audio-envelope-compare.json`）

WebAudio `decodeAudioData` + 50ms RMS 包络互相关：

| 指标 | 源 | 结果 |
|---|---|---|
| 时长 | 5.167s | 6.575s |
| RMS | 0.197 | 0.199 |
| 峰值 | 0.269 | 0.372 |
| 包络相关性 | — | 0.921（lag +0.8s） |

判读：结果音轨**非静音、非简单复制**，能量包络与源高度同步但整体后移约 0.8s，符合「重新配音 + 开头补静音」的特征。

## 局限（未验证项，不宣称通过）

- 未做语音语言识别（无本地 ASR），因此「是否已译为英语」「字幕是否烧录且语言正确」属**未客观验证**，
  仅有视觉播放与音轨能量证据。
- 未逐句比对字幕时间轴与源画面口型（口型同步本就配置为关闭）。

## 复现步骤

1. 启动本地栈，打开 `http://localhost:3000/tools/VIDEO_TRANSLATION`，上传真实视频（本用例 `/tmp/r22f-source.mp4`，sha256 `56226153…a3acf`）。
2. 目标语言 English、口型同步关闭、数量 1，提交；等待 succeeded（本用例约 15 分钟、127 次轮询）。
3. 依次点击 预览播放 / 下载 / 存入资产 / 发送画布；用 `mdls`、sha256、IndexedDB（`infinite-canvas:canvas_store`、`infinite-canvas:asset_store`）核对。

## 附件清单

`01-source-sha256.txt` `02-tool-task-record.json` `03-mainworld-net-poll.json` `04-proxy-log-excerpt.txt`
`05-tool-task-record-succeeded.json` `06-result-sha256.txt` `06-result-video.mp4`
`07-canvas-and-asset-idb.json` `08-audio-envelope-compare.json`

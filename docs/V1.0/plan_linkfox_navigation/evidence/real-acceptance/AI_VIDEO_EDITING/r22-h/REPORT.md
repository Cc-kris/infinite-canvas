# AI_VIDEO_EDITING · R22-H 真实浏览器验收报告（草稿分槽恢复）

- 日期：2026-10-30
- 分支：`feat/linkfox-v1-real`
- 修复提交：`a9d66329 fix(ai-video-editing): 草稿分槽恢复——两上传区各占槽位、参考图 id 落盘、旧草稿按 mime 归位`
- 真实任务：`task-mvug7gog-h1df2z`（模型 `sub2::MiniMax-H3`，视频编辑），最终 `succeeded`
- 本目录即证据目录（视频/帧/探针/JSON 均在身边）

## 1. 缺陷与修复

| # | 缺陷（修复前实测） | 修复 |
|---|---|---|
| A | 视频编辑页两个上传区（源视频 / 参考图）共用一份草稿槽位，刷新后素材串槽：源视频区显示 `2/1`（把参考图也算进源视频） | `video.tsx` 的 `ToolAssetInput` 分别声明 `draftSlot="source-video"` / `"reference-images"` 并各自 `syncIds` |
| B | 参考图选中 id 未落盘，刷新后参考图区丢失 | `serializeAiVideoEditingDraftValues` 增加第 3 参持久化 `referenceAssetIds` |
| C | 历史草稿 `assetIds` 是混合数组，恢复时无法区分视频/图片 | hydrate 阶段按 `mimeType` 归类：`video/*` → 源视频槽，`image/*` → 参考图槽 |

单测 42 例通过、`tsc` 0 error。

## 2. 验收链路（全真实浏览器 + 真实上游）

1. **上传 + 提交**：真实上传 `source.mp4`（1344×768，5.167s，1.2MB）与 `ref.png`（1024×744），填写编辑需求，走 `sub2::MiniMax-H3` 真实提交，task id `task-mvug7gog-h1df2z`。
2. **刷新恢复（关键回归点）**：页面被整页 reload 后，草稿两槽分别恢复为 `source.mp4`（1/1）与 `ref.png`（1/30），不再出现 `2/1` 串槽 → 证据 `01-reload-restore.json`。
3. **刷新后任务续跑**：reload 打断了轮询，但 `use-task-recovery` 在挂载时基于 lease 重新接力，页面每 ~7s 向上游 `.../v1/videos/task_r5xju...` 轮询，任务由 `running` → `succeeded`（约 23 分钟，上游耗时本身较长，非前端问题）。
4. **结果真实性硬校验**：结果视频从 blob 落盘后 `ffprobe`：
   - 结果：`h264` 1344×768 24fps、**6.583s / 158 帧**、含 `aac` 音轨、1,984,977 B
   - 源片：`h264` 1344×768 24fps、5.167s / 124 帧、1,297,168 B
   - 帧级比对：结果 1s 帧 vs 源片 1s 帧 → 平均像素差 26.86、41.1% 像素显著变化（同场景但确被编辑）；vs 参考图 → 145.63 / 98.6%（非贴图合成）
5. **UI 文案**：结果区 `视频编辑结果 | 已完成 | 共 1 个结果 · 视频 1`，含 下载 / 存入资产 / 发送画布 三动作 → `02-task-result.json`。

## 3. 本目录文件

| 文件 | 说明 |
|---|---|
| `01-reload-restore.json` | 刷新后两槽恢复状态（分槽修复证据） |
| `02-task-result.json` | 任务终态 + 槽位 + 结果 video 字节 + 草稿 revision 205 的 key 值 |
| `source-input.mp4` / `source-input.ffprobe.txt` | 输入源视频及其探针 |
| `reference-input.png` | 输入参考图 |
| `result-video.mp4` / `result-video.ffprobe.txt` | **模型真实产出**及探针 |
| `result-frame-1s.png` / `result-frame-5s.png` / `source-frame-1s.png` | 抽帧用于像素对账 |

## 4. 发现与风险

1. **HMR/其他 agent 改动会整页 reload**，会打断正在提交的 `submitting` 任务（本次提交前 8 分钟就被打断一次）。建议：`submitting` 阶段对整页刷新加保护（`beforeunload` 提示或提交幂等键）。
2. **上游耗时可达 23 分钟**，前端轮询未设超时上限（一直每 7s 轮询，无错误）。建议给轮询加总时长上限 + 可取消，避免标签页长期占用。
3. `<video>` 元素 `readyState` 长期为 0（后台标签媒体节流），**不能用 video 元素的 duration/videoWidth 判定结果有效性**，必须走 blob 字节 + `ffprobe` 对账（本次即按此路径取证）。
4. 结果时长（6.583s）与请求的截取时长（5.2s）不完全一致，属上游行为，已在 r22-f 同类记录中提示。

## 5. 复现入口

- 页面：`http://127.0.0.1:3000/tools/video-editing?tool=AI_VIDEO_EDITING`（本地栈）
- 手工步骤：上传源视频 + 参考图 → 填编辑需求 → 生成 → 等待上游 → 刷新页面确认两槽不串、任务续跑 → 结果区下载视频用 `ffprobe` 核对时长/帧数/尺寸。

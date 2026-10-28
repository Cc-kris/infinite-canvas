# VIDEO_REPLICATION 实测记录（2026-10-28）

## 环境
- 分支 `feat/linkfox-v1-real`，dev server `127.0.0.1:3000`，受控浏览器（ego lite）。
- 素材：`/tmp/ic_vid_upload/clip.mp4`（5.167s，1344×768，1.30MB）+ `ref.png`（720×960，1.06MB）。
- 上传手法：CORS 静态服务 `127.0.0.1:8921` → 页面内 `fetch` → `new File` → `DataTransfer` → `input.files` + `change`。
  - 注意：8899 / 8901 已被其它进程占用，勿动。

## 已修复缺陷（本次）
1. **上传后源视频时长恒为 0**（`web/src/components/tools/workspaces/video.tsx` handleVideoChange）
   - 旧：`sourceVideoDuration: previous.sourceVideoDuration` → 片段区间退化为 0–15s，与实际 5.2s 不符，时长/提示词全错。
   - 新：按 `record.durationMs` 计算秒（一位小数），`clipStart=0`，`clipEnd=min(autoSeconds, 时长)`；读不到时长才退回旧值。
   - 验证：上传后片段摘要 `0–15s（共 15s）` → `0–5.2s（共 5.2s）`，提交按钮文案 `约 5 秒`。
2. **同工具两个上传区互相覆盖草稿**（`web/src/components/tools/tool-asset-input.tsx`）
   - 旧：只按 `toolId` 存顶层 `assetIds`，视频区与参考图区共用一个键 → 刷新后视频槽被恢复成 ref.png，并报「ref.png 格式不支持：仅 MP4 / MOV」。
   - 新：新增 `draftSlot?: string`；传了则读写 `draft.values["assetSlot:<slot>"]`，未传保持旧行为（向后兼容）。video.tsx 两处分别传 `source-video` / `reference-images`。
   - 验证：刷新后两槽均为空且互不串素材；各自上传后独立保留。

## 验收用 testid（新增）
`video-replication-workspace` / `-clip` / `-script` / `-script-draft` / `-submit` / `-submit-top` / `-result` / `-country`

## 端到端提交结果
- 提交后确实发起真实请求，任务状态流转 `submitting → failed`，耗时 26s。
- 失败原因：`api.cc-ai.xyz/videos · HTTP 404 page not found`，诊断码 `provider-rejected`（上游未提供该端点）。
- 判定：前端编排（指纹去重、状态机、诊断码、重试入口）正常；失败属 provider 侧端点缺失，实测只能到 provider 边界。

## 待办
- 核对视频 create 路径是否缺 `/v1`（`web/src/services/api/video.ts`）。

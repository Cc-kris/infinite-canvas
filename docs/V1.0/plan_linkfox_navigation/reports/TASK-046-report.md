# TASK-046 视频拼接 `VIDEO_CONCAT` 实施报告

- 分支：`feat/linkfox-v1-real`
- 提交：`2ea03ba` feat(tools): TASK-046 视频拼接 VIDEO_CONCAT 工作区（registry + adapter + 47 项测试）
- 依据：REQ-T39 / TC-054 / AC-054（`acceptance.md:71`、`test_cases.md:67`）
- 文件清单（与 `task_list.md:56` 一致）：
  1. `web/src/features/tools/registry/video-concat.ts`（+590）
  2. `web/src/features/tools/adapters/video-concat.ts`（+542）
  3. `web/src/features/tools/adapters/video-concat.test.ts`（+477）
  4. `web/src/components/tools/workspaces/video.tsx`（本任务新增 `VideoConcatWorkspace`，行 710–1384）

## 1. 做了什么

### registry 层（纯函数，无 IO）
- 片段模型：`durationMs / startMs / endMs`，`videoConcatClipMs` 按区间夹取（start∈[0,d]，end∈[start,d]），
  时长未知（`durationMs=0`）时返回 0 而不是猜一个默认值。
- 时间线操作：`moveVideoConcatClip`（交换顺序，越界返回副本不抛）、`removeVideoConcatClip`（越界不删）。
- 目录级校验 `validateVideoConcatState`：`no-clips`、`too-few-clips`（下限 2）、`duplicate-clip`（同一 assetId 加两次）、
  `clip-too-long`、`clip-duration-unknown`（读不到真实时长→本页不用猜测值提交）、`model-missing`。
- 快照 `createVideoConcatSnapshot` + `isVideoConcatSnapshotStale`：提交时冻结 model/editType/ratio/time/clips(assetId+区间)/cover，
  配置变更后结果被标记 stale，而不是把旧结果当新结果展示。
- 草稿 `toVideoConcatDraftValues / parse / apply`：只存稳定事实（assetId + start/end），刷新后用资产索引还原 url/时长。

### adapter 层
- 通道能力 `resolveVideoConcatProviderCapability` 按**真实 apiFormat 证据**分支，缺省一律 `unverified` 且阻断：
  - `openai`：多段参考视频 supported，不阻断；
  - `gemini`：只取 `videos[0]` → 多段会静默丢片段 → **阻断**；
  - `http`：丢弃 `videos` 字段 → **阻断**；
  - `plugin`：无证据 → unverified 阻断。
- 提交前 `assertVideoConcatInput`：先页面校验、再能力校验，任一不满足抛 `VideoConcatAdapterError`（带 code，UI 原样展示）。
- `buildVideoConcatFields` / `auditVideoConcatFields`：10 个字段（editType, imageFormat, imageHeight, imageSize, imageUrl,
  imageWidth, videoCoverUrl, videoList, videoRatio, videoTime）逐个落齐并审计缺参，杜绝静默丢参。
- `buildVideoConcatBrowserInput`：把片段顺序/裁剪区间/比例/总时长/封面写进确定性 prompt（视频服务只吃 prompt）。
- `mapVideoConcatFailure`：上游错误码 → 用户可执行说明；未知码保留原文，绝不改写成成功。
- `videoConcatResultView`：无任务=「尚未提交」；成功但无视频=「没返回视频」，不冒充完成产物。

### 工作区 UI（`VideoConcatWorkspace`）
- 片段列表：上移/下移重排、删除、区间裁剪（读真实 `video.duration` 后用 `probeVideoDurationMs` 夹取）。
- 封面：本地上传或从片段 `canvas` 抓帧，`bytes/storageKey` 一并带上（provider 走 `getMediaBlob`）。
- 比例 / 总时长（auto = 各段裁剪后之和）：`effectiveVideoConcatSeconds`。
- 能力门禁提示：不满足直接禁用提交并说明原因（`capability-notice`）。
- 任务提交与轮询：真实 store 任务 + 结果卡片，失败给可执行提示与重试。

## 2. 验证（跑出来的，不是读码推断）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 本任务用例 | `bun test src/features/tools/adapters/video-concat.test.ts` | **47 pass / 0 fail**，105 expect() |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 本任务 3 个文件 + video.tsx 我的组件段 **0 错误**；仓库余 7 错误全在 `adapters/ai-video-editing.test.ts`（他任务） |
| tools 目录回归 | `bun test src/features/tools` | **983 pass / 5 fail**，5 失败全属他任务（`VIDEO_TRANSLATION` 1 项、`AI_VIDEO_EDITING` 4 项） |
| registry 结构门禁 | 同上（`structural integrity` 组） | pass：ids/indexes/routes/makeTypes 唯一且连续 |

`VIDEO_CONCAT` 已在 `registry/index.ts:605` 注册：`index 39 / makeType 52 / route /tools/ai-video/video-concat / layout video / adapter video / enabled true`，
10 个字段键与本 adapter 的 `VIDEO_CONCAT_FIELD_KEYS` 一致（该项在更早的提交里，不在本提交内）。

## 3. 未完成 / 风险

1. **路由未接线（阻塞 AC-054 / TC-054 的 PASS）**：全仓没有文件 `import` `components/tools/workspaces/*`，
   即「toolId → 工作区组件」的挂载层尚不存在（不属 TASK-046 文件范围）。因此 AC-054 的页面级证据
   （`evidence/AC-054-video-concat.json`）当前只能标 **BLOCKED**，不能标 PASS。
2. **`video.tsx` 被三个任务共用**（SALE_VIDEO / AI_VIDEO_EDITING / VIDEO_REPLICATION / 本任务）：
   - 期间出现过模块级 `export default` 重复（两个），已删除多余的一行 `export default VideoReplicationWorkspace;` 使模块可通过编译；
   - 本提交把并行同事已写入但未提交的 AI_VIDEO_EDITING / VIDEO_REPLICATION 工作区一并带入，**这两块不属 TASK-046**，
     需要各自任务的报告与验收分别覆盖。后续再改此文件须用唯一锚点 patch，避免互相覆盖（本次已发生一次 import 被覆盖）。
3. **没有对接真实上游做端到端提交**：能力门禁按 apiFormat 证据阻断/放行，未在真实网关跑通一次「拼接→出片」，
   因此「enabled=true 时真实结果入库」这一条只能由挂载+真实模型后再验。

## 4. 使用入口

- 路由（注册值）：`/tools/ai-video/video-concat`
- 组件：`VideoConcatWorkspace`（`web/src/components/tools/workspaces/video.tsx:710`）
- 契约/校验：`web/src/features/tools/registry/video-concat.ts`
- 适配器：`web/src/features/tools/adapters/video-concat.ts`
- 用例：`web/src/features/tools/adapters/video-concat.test.ts`（47 项）

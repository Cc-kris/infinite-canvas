# R25 独立审计报告（infinite-canvas · 39 工具六维）

## 0. 结论

在审计点 `2ecd958d` 上，39 个工具 × 6 维共 234 个单元：各维度分布与基线相同。**非全绿单元 1 个 / 工具 1 个**。

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 1 / PASS 38 |
| T | PASS 39 |
| R | PASS 39 |
| H | PASS 39 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 1. 审计点与门禁

- PIN（审计点）：`2ecd958d64832da4bf2729be122412d66b8c3742`，分支 `feat/linkfox-v1-real`
- 门禁绑定提交：`c4b3611aeb708a5236e4a7feefbedded63cd7c7e`（tree `18a9ad0935ef5ad53e256fb2cc5049aaf42bf496`，web 树 `ede2d0e243d7ec46095108ede4ff7190947af2dd`）
- 门禁日志来源：`docs/V1.0/reports/verify-head-r24-fixed (PIN tree blob)`（随该提交入库，本工具从 blob 现读，不读工作区、不引用他人临时目录）
  - typecheck：exit0=True，error TS 计数 0，22.26s
  - test：1509 pass / 0 fail / 1509 tests · 87 files，exit0=True
  - build：23.99s · 8830 modules · index-BNvVASBg.js ≈ 5614.23 kB · dist 443 文件，exit0=True
- 覆盖关系（本工具实测）：`c4b3611a:web` == `2ecd958d:web` == `ede2d0e2`，故门禁覆盖审计点的源码内容。
- 原始日志副本：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r25-matrix/evidence/gate-logs/`；机读摘要：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r25-matrix/evidence/gate.json`
- 边界：门禁只断言「该提交的源码 + 单测 + 构建」为绿；真实模型调用、E2E 与浏览器视觉验收不在三闸范围内（见第 5 节 nonClaims）。

## 2. 本轮复核明细（6 条，逐条硬断言）

### REMOVE_PEN.H：PASS → PASS（维持原判，断言全过）

- 断言 36/36 通过

R23 复核（r22-h 回执机检）：同一真实任务 task-mvtp33dv-57nmbx 的**四条腿**（任务结果 media_files / 面板下载落盘 / 存入资产 asset_store / 发送画布 canvas_store 节点）字节均 1,831,533B 且 sha 2f8f7f11… 全等；审计侧对四个已提交产物 blob 重算 size+sha256 亦与回执声明一致。fresh reload 标记 navType=reload（timeOrigin 1793331967901.4）+ 刷新后 resultImg blob 1024×1024 complete + 三动作按钮 enabled；回执自判 checks.canvasSent=true（R21 时该腿缺失，本轮补齐），四腿在同一机读回执内闭合。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/result.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/downloads/apple_1024-erased.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/asset-blob.bin`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/canvas-node-blob.bin`

### IMAGE_TEXT_EDIT.H：PASS → PASS（维持原判，断言全过）

- 断言 36/36 通过

R23 复核（r22-h 五腿回执机检）：真实任务 task-mvufj9u8-wefie4 succeeded，**五条链路**（media_files 结果位图 / 工具面板下载 / asset_store 入库 / canvas_store 节点 / /assets 资产卡下载）字节均 1,050,148B、sha 5665d290… 全等；审计侧对两个已提交 png blob 重算一致。reload 标记为 CDP Page.reload 后 navigation.type=reload，刷新后 asset_store 与画布节点 image:LnKmlw… 均在、字节 sha 仍全等。回执同时自报并发写风险（首次存资产的 assetId 在持久化 store 中缺失，疑似跨标签 last-write-wins），已在 risks 记录，不据此改判 H。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png`

### AI_VIDEO_EDITING.H：PASS → PASS（维持原判，断言全过）

- 断言 35/35 通过

R23 复核（r21 recovery 回执 + 外置验证脚本）：真实任务 task-mvt42rpv-kfl1ov succeeded（上游 task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm），结果项 storageKey 为任务绑定键 tool-result:task-mvt42rpv-kfl1ov:0:video-0（legacy 键字节由 adoptLegacyResultMedia 原样搬运，非生成、非快照回填），payloadDropped=false。fresh reload 为同标签 CDP Page.reload（navType=reload、timeOrigin 1793288782457.9→1793288879030.1、sessionStorage 探针存活），刷新后历史卡可见、点「查看结果」回填结果区、三动作按钮 enabled。legacy/采纳键/下载落盘/入库资产/画布节点五处字节 2,268,656B 且 sha 47573c14… 全等，审计侧对已提交归档 mp4（docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4）重算 size+sha256 一致；外置脚本 tools/verify_ai_video_editing_h_r21.py 复跑 20/20 PASS。

证据：
- `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- `tools/verify_ai_video_editing_h_r21.py`
- `web/src/stores/use-tool-task-store.ts`
- `web/src/stores/use-tool-task-store.provenance-heal.test.ts`

### AI_VIDEO_EDITING.H：PASS → PASS（维持原判，断言全过）

- 断言 35/35 通过

R25 新增佐证（2ecd958d / r22-h）：**另一次**真实任务 `task-mvug7gog-h1df2z`（旧证据是 r21 recovery 回执，本轮不复用）—— 刷新后两上传区各回本槽（源 1/1、参考 1/1，修复前源槽会串入 ref.png），任务续跑至 succeeded；结果视频 1,984,977B（sha `e0c85726…`），本工具解析 1344×768 / 6.584s / 158 帧，与源片 5.167s / 124 帧可区分。（全部断言通过）**未主张**：该目录无下载/存资产/发画布三动作字节腿（仅结果区三按钮文案），故不构成 F 证据；上游时长/画幅与请求不完全一致属上游行为，未做前端兜底验证。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/01-reload-restore.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/02-task-result.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.ffprobe.txt`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md`

### VIDEO_CONCAT.F：PASS → PASS（维持原判，断言全过）

- 断言 33/33 通过

R23 复核（r22-f 回执机检）：过期任务 task-mvtof8um-7034v0 按 upstreamTaskId 真查上游后恢复成功（succeeded），结果 4,633,118B sha 928c4113…。三动作（下载 / 存入资产 / 发送画布）均真实点击且有回执，字节全部 4,633,118B 且与任务结果同 sha；审计侧对已提交 downloaded.mp4 重算 size+sha256 一致；另经 /__media/upload 发布后公网回读 HTTP 200、Content-Type video/mp4、回读字节与 sha 全等，preview-public.png 证明可解码预览。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

### VIDEO_TRANSLATION.F：PARTIAL → PARTIAL（维持原判，断言全过）

- 断言 55/55 通过

R25 吸收 cd553cc4（r22-f）后缺口缩窄但**不升级**。已闭合：真实任务 `task-mvuflf9e-djxprc`（上游 `task_dYZmmUVNwbfqKzryL2BbRqR1fHXwMTdK`）status=succeeded、running→succeeded 同一 clientOperationId/fingerprint/上游键、无 payloadDropped；四条腿字节同为 **1,249,837B** —— 任务结果条 / 面板下载落盘 `06-result-video.mp4`（sha `7c15bdb2…` 由本工具 `git cat-file blob` 现算，与 `06-result-sha256.txt` 声明一致）/ 存入资产 `video:zgzM_z3Up7vmQEjpY14TJ` / 发送画布节点 `video:l_O76YiQrJhKGVKy-Jw5d`，资产 metadata 与画布节点均绑定同一 taskId+resultItemId，两腿 storageKey 互异（非同键复用）；本工具另自行解析 mp4：768×768 / 6.584s / 158 个视频样本，与画布节点 naturalWidth/naturalHeight=768×768、durationMs=6583 互证。**仍未闭合（R23 已写明的最小缺口 b）**：asset / canvas 两腿在仓库内既无 blob 也无声明 sha256，故「三动作字节+sha 一致」只做到字节一致，sha 一侧无从复核；另 asset.data.width/height=1280×720 为兜底值与真实画面冲突（F1）。→ 维持 PARTIAL；补齐方式：在动作回执内记录 asset/canvas 两键的实际 sha256（或各存一份产物 blob）即可直接升 PASS。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/02-tool-task-record.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-sha256.txt`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-video.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/07-canvas-and-asset-idb.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/REPORT.md`

## 3. 精确剩余非全绿项

### VIDEO_TRANSLATION.F = PARTIAL

R25 吸收 cd553cc4（r22-f）后缺口缩窄但**不升级**。已闭合：真实任务 `task-mvuflf9e-djxprc`（上游 `task_dYZmmUVNwbfqKzryL2BbRqR1fHXwMTdK`）status=succeeded、running→succeeded 同一 clientOperationId/fingerprint/上游键、无 payloadDropped；四条腿字节同为 **1,249,837B** —— 任务结果条 / 面板下载落盘 `06-result-video.mp4`（sha `7c15bdb2…` 由本工具 `git cat-file blob` 现算，与 `06-result-sha256.txt` 声明一致）/ 存入资产 `video:zgzM_z3Up7vmQEjpY14TJ` / 发送画布节点 `video:l_O76YiQrJhKGVKy-Jw5d`，资产 metadata 与画布节点均绑定同一 taskId+resultItemId，两腿 storageKey 互异（非同键复用）；本工具另自行解析 mp4：768×768 / 6.584s / 158 个视频样本，与画布节点 naturalWidth/naturalHeight=768×768、durationMs=6583 互证。**仍未闭合（R23 已写明的最小缺口 b）**：asset / canvas 两腿在仓库内既无 blob 也无声明 sha256，故「三动作字节+sha 一致」只做到字节一致，sha 一侧无从复核；另 asset.data.width/height=1280×720 为兜底值与真实画面冲突（F1）。→ 维持 PARTIAL；补齐方式：在动作回执内记录 asset/canvas 两键的实际 sha256（或各存一份产物 blob）即可直接升 PASS。

证据路径：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/02-tool-task-record.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-sha256.txt`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-video.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/07-canvas-and-asset-idb.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/REPORT.md`

## 4. 不得写成通过（nonClaims，逐条已备案）

| # | 维度 | 不主张 | 实测事实 | 闭合方式 |
| --- | --- | --- | --- | --- |
| NC1 | F | VIDEO_TRANSLATION 三动作「字节+sha 一致」已闭合 | 四腿字节同为 1,249,837B 已核；sha256 仅下载腿可算（7c15bdb2…，与 06-result-sha256.txt 一致），asset/canvas 两腿仓库内无 blob 也无声明 sha256。 | 在动作回执内记录 asset/canvas 两键实际 sha256，或各存一份产物 blob。 |
| NC2 | F | VIDEO_TRANSLATION 的 ASR/字幕/配音语种正确 | 任务产物只有视频文件与字节证据；该次回执未含 ASR 识别文本、目标语种判定或字幕时间轴证据，REPORT.md 亦自列「未验证项」。 | 补一条含 ASR 文本/目标语种断言/字幕文件 sha 的回执。 |
| NC3 | F | 资产库记录的尺寸可信 | 07 导出中 asset.data.width/height=1280×720，而本工具解析 06-result-video.mp4 的 tkhd 为 768×768（画布节点 naturalWidth/Height 也是 768×768）→ 该尺寸是兜底值，与真实画面冲突（产品侧 F1 缺陷）。 | 资产入库时以真实媒体元数据写入 width/height，并在回执里复算比对。 |
| NC4 | F | AI_VIDEO_EDITING 三动作（下载/存资产/发画布）已由新证据复核 | r22-h 只有任务终态 + reload 分槽 + 结果/源视频 blob（本工具自解析 1344×768/6.584s/158 样本），没有任何动作字节回执；该工具 F 维维持基线判，不由本轮新证据支撑。 | 为该次（或新一次）真实任务补三动作回执 + 每条腿字节/sha。 |
| NC5 | F | AI_VIDEO_EDITING 结果时长与源片一致（未解释偏差） | 源 5.167s/124 帧 → 结果 6.584s/158 帧（+27%），报告只陈述事实未给解释；属上游模型行为，未验是否合规。 | 确认为上游能力边界并写入产品说明，或复测确认可复现。 |
| NC6 | GATE | PIN 之后的所有提交都通过三闸 | 三闸绑定 c4b3611a；本工具复核该提交的 web 树与 PIN 2ecd958d 的 web 树逐字节相同，故 PIN 的源码内容被覆盖；PIN 之后新增的并发提交（如 eacc18f7 等）不在结论内。 | 在最新 commit 上重跑三闸并在报告中绑定该 commit。 |
| NC7 | ALL | 工作区未提交的 r24 内容已复核 | 工作区存在 reports/vt-content-r24/ 与 .tmp_*/.worker-* 等未跟踪文件；PIN 树 0 文件 → 一律不参与任何判据。 | 提交后重跑本工具（PIN 前移到该提交）即可纳入。 |

## 5. 可复核证据路径（本轮复核单元）

- **REMOVE_PEN.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/result.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/downloads/apple_1024-erased.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/asset-blob.bin`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/canvas-node-blob.bin`
- **IMAGE_TEXT_EDIT.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png`
- **AI_VIDEO_EDITING.H**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/01-reload-restore.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/02-task-result.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/result-video.ffprobe.txt`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/r22-h/REPORT.md`
- **VIDEO_TRANSLATION.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/02-tool-task-record.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-sha256.txt`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/06-result-video.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/07-canvas-and-asset-idb.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/REPORT.md`
- **VIDEO_CONCAT.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

## 6. 缺陷与风险（不改判，但须记录）

| # | 严重度 | 问题 | 影响 | 证据 |
| --- | --- | --- | --- | --- |
| F1 | medium | 视频资产入库尺寸写死兜底 1280×720 | VIDEO_TRANSLATION 结果真实画面 768×768（本工具解析 tkhd），但 IDB 资产记录 width/height=1280×720；画布节点侧却是正确的 768×768 → 同一资产两处元数据不一致，下游按资产库尺寸排版会拉伸。 不改判 F（字节/任务键已闭合），但会影响资产列表/插入画布的显示比例。 | `07-canvas-and-asset-idb.json` |
| F2 | low | 视频翻译任务上游耗时与并发轮询未量化 | 05 记录 submittedAt→finishedAt 完整，但未记录上游轮询次数/间隔；无法据此判断限流或重试策略是否生效。 不影响判据。 | `05-tool-task-record-succeeded.json` |
| F3 | low | AI_VIDEO_EDITING 结果时长较源片 +27% | 源 5.167s → 结果 6.584s（124→158 帧），报告只陈述未解释；属上游模型行为。 不影响 F/H 判据，但产品说明需注明能力边界。 | `REPORT.md` |

- **IMAGE_TEXT_EDIT**：ITE 首次「存入资产」返回的 assetId 在持久化 asset_store 中缺失（疑似跨标签 last-write-wins 覆盖）→ 真实并发写缺陷，需后续修复；不影响本条五腿字节一致结论（第二次入库记录与字节均已复核）。
- **AI_VIDEO_EDITING**：AI_VIDEO_EDITING.H 的证据来自 **r21 历史任务的恢复回执**（本次审计未重新生成媒体）：结果字节由 adoptLegacyResultMedia 从 IndexedDB legacy 键搬运（copy，不重算）。rubric 字面满足（三动作 + 结果 + 刷新观测 + 已提交归档字节可复核），但若要求「同一会话内新生成」，需补一次全新跑。
- **AI_VIDEO_EDITING**：01-reload-restore.json 是单引号 Python-repr 而非合法 JSON（json.loads 报 line 1 column 2），本工具用 ast.literal_eval 容错解析；机器可读性不达标，建议重导为 JSON
- **VIDEO_CONCAT**：画布节点 metadata.naturalWidth/Height = 1280x720，与真实 768x1344 不符：发送画布时 readVideoMeta 在后台标签超时 → 走 FALLBACK_VIDEO_WIDTH/HEIGHT（media-metadata.ts:17，timedOut 标记设计如此）。后果：后台标签里发画布会得到 16:9 尺寸。建议（未做）：超时后置 timedOut 时不写死尺寸，改为按 storageKey 二次测量或用内容真实比例。
- **VIDEO_CONCAT**：本仓库无 archiveUrl 字段实现（rg 'archiveUrl' src 为空），公网回读是用项目自带 /__media/upload 通道完成，非产品内建归档能力。
- **VIDEO_CONCAT**：任务结果区在后台标签下 video 不显示画面（同上节流），用户切到该标签即恢复，属浏览器行为。

## 7. 断言总表

- 断言 26/26 通过

## 8. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 tools/recompute_scope_matrix_r25.py --check     # 在任意后续 HEAD 上重算并与本矩阵比对
```

重算器只读 `git cat-file`（PIN 树），不读工作区未提交内容，因此结论不随后续提交漂移。

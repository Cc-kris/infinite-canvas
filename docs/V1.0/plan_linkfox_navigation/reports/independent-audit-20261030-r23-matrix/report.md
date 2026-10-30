# R23 独立审计报告（infinite-canvas · 39 工具六维）

## 0. 结论

在审计点 `a9d66329` 上，39 个工具 × 6 维共 234 个单元：F 由 [PARTIAL 2 / PASS 37] 变为 [PARTIAL 1 / PASS 38]；H 由 [PARTIAL 3 / PASS 36] 变为 [PASS 39]。**非全绿单元 1 个 / 工具 1 个**。

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 1 / PASS 38 |
| T | PASS 39 |
| R | PASS 39 |
| H | PASS 39 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

## 1. 审计点与门禁（PIN 快照）

- PIN：`a9d66329abf7f86377f89bd8731e72eace5eb680`（tree `c5c68667579d5cff9b23c9489badecf31ebcc8cf`），分支 `feat/linkfox-v1-real`
- 门禁在隔离目录 `/tmp/r23-gate`（`git archive PIN` 解包 + `bun install --frozen-lockfile`）自跑：
  - typecheck：TC_EXIT=0
  - test：1494 pass / 0 fail / 1494 tests · 85 files
  - build：45.32s · index-DXFpiqIy.js 5,610,025B
- 原始日志随报告提交：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r23-matrix/evidence/logs/`；机读摘要：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r23-matrix/evidence/gate.json`
- 说明：仓库内既有 r22 门禁日志只覆盖 `382cebf6:web`（729b29e0），其后的 `a9d66329` 改动过 `web/src`，故本报告**不引用**旧日志，全部重跑。

## 2. 本轮改判（5 条，逐条硬断言）

### REMOVE_PEN.H：PARTIAL → PASS（PASS）

- 断言 36/36 通过

R23 复核（r22-h 回执机检）：同一真实任务 task-mvtp33dv-57nmbx 的**四条腿**（任务结果 media_files / 面板下载落盘 / 存入资产 asset_store / 发送画布 canvas_store 节点）字节均 1,831,533B 且 sha 2f8f7f11… 全等；审计侧对四个已提交产物 blob 重算 size+sha256 亦与回执声明一致。fresh reload 标记 navType=reload（timeOrigin 1793331967901.4）+ 刷新后 resultImg blob 1024×1024 complete + 三动作按钮 enabled；回执自判 checks.canvasSent=true（R21 时该腿缺失，本轮补齐），四腿在同一机读回执内闭合。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/result.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/downloads/apple_1024-erased.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/asset-blob.bin`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/canvas-node-blob.bin`

### IMAGE_TEXT_EDIT.H：PARTIAL → PASS（PASS）

- 断言 36/36 通过

R23 复核（r22-h 五腿回执机检）：真实任务 task-mvufj9u8-wefie4 succeeded，**五条链路**（media_files 结果位图 / 工具面板下载 / asset_store 入库 / canvas_store 节点 / /assets 资产卡下载）字节均 1,050,148B、sha 5665d290… 全等；审计侧对两个已提交 png blob 重算一致。reload 标记为 CDP Page.reload 后 navigation.type=reload，刷新后 asset_store 与画布节点 image:LnKmlw… 均在、字节 sha 仍全等。回执同时自报并发写风险（首次存资产的 assetId 在持久化 store 中缺失，疑似跨标签 last-write-wins），已在 risks 记录，不据此改判 H。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/r22h-bytes-and-propagation-20261030.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/tool-download-1050148-5665d290.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/r22-h/artifacts/asset-card-download-1050148-5665d290.png`

### AI_VIDEO_EDITING.H：PARTIAL → PASS（PASS）

- 断言 35/35 通过

R23 复核（r21 recovery 回执 + 外置验证脚本）：真实任务 task-mvt42rpv-kfl1ov succeeded（上游 task_QFvq6WMc09jv2kSZzh4fFboNx5ZccHBm），结果项 storageKey 为任务绑定键 tool-result:task-mvt42rpv-kfl1ov:0:video-0（legacy 键字节由 adoptLegacyResultMedia 原样搬运，非生成、非快照回填），payloadDropped=false。fresh reload 为同标签 CDP Page.reload（navType=reload、timeOrigin 1793288782457.9→1793288879030.1、sessionStorage 探针存活），刷新后历史卡可见、点「查看结果」回填结果区、三动作按钮 enabled。legacy/采纳键/下载落盘/入库资产/画布节点五处字节 2,268,656B 且 sha 47573c14… 全等，审计侧对已提交归档 mp4（docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4）重算 size+sha256 一致；外置脚本 tools/verify_ai_video_editing_h_r21.py 复跑 20/20 PASS。

证据：
- `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
- `tools/verify_ai_video_editing_h_r21.py`
- `web/src/stores/use-tool-task-store.ts`
- `web/src/stores/use-tool-task-store.provenance-heal.test.ts`

### VIDEO_CONCAT.F：PARTIAL → PASS（PASS）

- 断言 33/33 通过

R23 复核（r22-f 回执机检）：过期任务 task-mvtof8um-7034v0 按 upstreamTaskId 真查上游后恢复成功（succeeded），结果 4,633,118B sha 928c4113…。三动作（下载 / 存入资产 / 发送画布）均真实点击且有回执，字节全部 4,633,118B 且与任务结果同 sha；审计侧对已提交 downloaded.mp4 重算 size+sha256 一致；另经 /__media/upload 发布后公网回读 HTTP 200、Content-Type video/mp4、回读字节与 sha 全等，preview-public.png 证明可解码预览。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

### VIDEO_TRANSLATION.F：PARTIAL → PARTIAL（PASS）

- 断言 3/3 通过

R23 复核：PIN 树内 VIDEO_TRANSLATION 无任何含三动作（下载/存资产/发画布）字节回执的 JSON（机检 action_like=[]）；工作区存在 r22-f 运行产物（06-result-video.mp4 1,249,837B、05-tool-task-record-succeeded.json 显示 succeeded），但**未提交**（PIN 树该目录 0 文件），按 rubric「回执文件必须在 HEAD 中提交」不计。最小硬证据缺口：(a) 该次真实运行的回执需提交（任务键、上游回执、结果字节 sha）；(b) 同一回执内需闭合下载/存资产/发画布三动作的字节与 sha 一致性。

证据：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`

## 3. 精确剩余非全绿项

### VIDEO_TRANSLATION.F = PARTIAL

R23 复核：PIN 树内 VIDEO_TRANSLATION 无任何含三动作（下载/存资产/发画布）字节回执的 JSON（机检 action_like=[]）；工作区存在 r22-f 运行产物（06-result-video.mp4 1,249,837B、05-tool-task-record-succeeded.json 显示 succeeded），但**未提交**（PIN 树该目录 0 文件），按 rubric「回执文件必须在 HEAD 中提交」不计。最小硬证据缺口：(a) 该次真实运行的回执需提交（任务键、上游回执、结果字节 sha）；(b) 同一回执内需闭合下载/存资产/发画布三动作的字节与 sha 一致性。

证据路径：
- `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`

## 4. 可复核证据路径（本轮升级）

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
  - `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/AI_VIDEO_EDITING.recovery-receipt-r21-20261029.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/AI_VIDEO_EDITING/receipt-20261029/task_QFvq6WMc_video.mp4`
  - `tools/verify_ai_video_editing_h_r21.py`
  - `web/src/stores/use-tool-task-store.ts`
  - `web/src/stores/use-tool-task-store.provenance-heal.test.ts`
- **VIDEO_TRANSLATION.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_TRANSLATION/r22-f/05-tool-task-record-succeeded.json`
- **VIDEO_CONCAT.F**：
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/receipt-r22-f.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/downloaded.mp4`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-file.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/preview-public.png`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/public-publish.json`
  - `docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/r22-f/store-records.json`

## 5. 风险与未解决项（不改判，但须记录）

- **IMAGE_TEXT_EDIT**：ITE 首次「存入资产」返回的 assetId 在持久化 asset_store 中缺失（疑似跨标签 last-write-wins 覆盖）→ 真实并发写缺陷，需后续修复；不影响本条五腿字节一致结论（第二次入库记录与字节均已复核）。
- **AI_VIDEO_EDITING**：AI_VIDEO_EDITING.H 的证据来自 **r21 历史任务的恢复回执**（本次审计未重新生成媒体）：结果字节由 adoptLegacyResultMedia 从 IndexedDB legacy 键搬运（copy，不重算）。rubric 字面满足（三动作 + 结果 + 刷新观测 + 已提交归档字节可复核），但若要求「同一会话内新生成」，需补一次全新跑。
- **VIDEO_CONCAT**：画布节点 metadata.naturalWidth/Height = 1280x720，与真实 768x1344 不符：发送画布时 readVideoMeta 在后台标签超时 → 走 FALLBACK_VIDEO_WIDTH/HEIGHT（media-metadata.ts:17，timedOut 标记设计如此）。后果：后台标签里发画布会得到 16:9 尺寸。建议（未做）：超时后置 timedOut 时不写死尺寸，改为按 storageKey 二次测量或用内容真实比例。
- **VIDEO_CONCAT**：本仓库无 archiveUrl 字段实现（rg 'archiveUrl' src 为空），公网回读是用项目自带 /__media/upload 通道完成，非产品内建归档能力。
- **VIDEO_CONCAT**：任务结果区在后台标签下 video 不显示画面（同上节流），用户切到该标签即恢复，属浏览器行为。

## 6. 断言总表

- 断言 15/15 通过

## 7. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 tools/recompute_scope_matrix_r23.py --check     # 在任意后续 HEAD 上重算并与本矩阵比对
```

重算器只读 `git cat-file`（PIN 树），不读工作区未提交内容，因此结论不随后续提交漂移。

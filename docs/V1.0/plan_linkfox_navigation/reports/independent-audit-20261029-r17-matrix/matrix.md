# R17 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：HEAD `65d83b2`（`feat/linkfox-v1-real`）
- 基线：R16 419b0dec（matrix head 0bec102：F35/4 T39/0 R39/0 H34/5 K12/27 U39；非全绿 9 单元 / 7 工具）
- 生成：2026-10-29T22:42:05+0800；审计器：`tools/recompute_scope_matrix_r17.py`（继承 R16 判据，**只收紧**：只吸收 committed 证据，散文/未提交一律不计，且升级须过硬断言）
- 证据源：`git ls-tree -r -l HEAD` + blob sha256 现算；**未提交/未跟踪内容不吸收**

## 统计（F/T/R/H/K/U）

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 36 | 3 | — |
| T | 39 | 0 | — |
| R | 39 | 0 | — |
| H | 35 | 4 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

非全绿单元：**7** 个（6 个工具）

相对 R16 改判：**2 处**

- **VIDEO_REPLICATION** `F` PARTIAL → PASS（docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json）
- **VIDEO_REPLICATION** `H` PARTIAL → PASS（docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json）

## 吸收的已提交证据

- `3f7a5fc9` — fix(result-recovery)：storageKey-only 视频恢复→三动作真可用 + 机器回执 result-recovery-e2e-task-mvtk9pu3-sfifnh.json（1,963,716B / sha e5cd3158… / 下载·存资产·发画布 + freshReload 观测）
- `4d42080e` — r20 REMOVE_PEN 机读回执：task-mvtmnhk5-nr2g0z succeeded 2,440,825B / storageKey / fresh reload / 三动作（assetId 1xIHbpny / 画布 image-17）；sha256 未采（unavailable_after_run）
- `c99a3f98` — r22 CCV2 真实 UI 复跑：task-mvtn1xg0-sbk0fl succeeded 2,545,568B / sha e1b1d638…；下载 PASS，存资产当时误判 FAIL(no tool_assets)，发画布 UNVERIFIED；reload 后卡面 + 三按钮 enabled
- `de79a8f6` — r23 CCV2 fresh-reload 三动作真跑 PASS：assetId zxuUxQCyoeBWjoVp8YahO / projectId QGxsBR8KJkmhAo-lwneap / nodeId image-1793284560236-0grci；纠正 asset_store 口径

### 吸收但不改判（逐条说明为何不升级）

- **3f7a5fc9 / VIDEO_REPLICATION.F、H（改判项，见上）** — 同一提交只把『视频结果恢复后三动作』这条腿补硬：回执 task-mvtk9pu3-sfifnh 的 freshReload 观测与三动作字节/sha 均能被已提交 mp4 复算，故由 PARTIAL 升 PASS；其余工具（AI_VIDEO_EDITING/IMAGE_TO_VIDEO/SALE_VIDEO）无新回执 → 不连带升级
- **4d42080e / REMOVE_PEN.H** — r20 机读回执 task-mvtmnhk5-nr2g0z succeeded / 2,440,825B / storageKey 齐全，fresh reload 后三动作（下载 assetId 1xIHbpny / 画布 node image-17）都有结果，但回执自带 sha256 = "unavailable_after_run"（仅 bytes 声明），且 HEAD 内无任何 2,440,825B 已提交产物（见 byte_leg_audit）→ 字节腿不可复核，维持 PARTIAL（不放宽）
- **c99a3f98 + de79a8f6 / CHANGE_COLOR_V2.H** — r22 记 task-mvtn1xg0-sbk0fl succeeded / 2,545,568B / sha e1b1d638…，r23 记 fresh reload 后下载/存资产(assetId zxuUxQCyoeBWjoVp8YahO)/发画布(node image-1793284560236-0grci) 三动作真跑 PASS；但 (a) HEAD 内无 2,545,568B 已提交产物（byte_leg_audit 已机检），字节腿无法与已提交产物对账；(b) r23 的『fresh reload』是**新开标签**（全新会话、内存态清零），不是 rubric 要求的同文档 reload/Page.reload 机读标记，r22 的 reload_verified 只记卡面与按钮态、无机器 reload 标记 → H 的两条腿仍缺其一，维持 PARTIAL
- **b85b13e / AI_VIDEO_EDITING.H、F** — task-mvtkgo4b-gaomk5 status=failed（上游 502 两连，无 upstreamTaskId、无产物），本轮无新回执 → 维持 PARTIAL
- **a1dbe6b / IMAGE_TRANSLATION、IMAGE_TEXT_EDIT 等其余 PARTIAL** — 本轮 4 个新提交未触及这些工具的字节/动作腿 → 维持原判
- **3f7a5fc9 / 源码侧** — tool-result.tsx 走 useStoredResultUrl(storageKey→resolveMediaUrl)、hasUsablePayload 认 storageKey、新增 pickRicherTaskSnapshot 择优快照；本审计器自跑门禁：web tsc --noEmit exit 0、bun test tool-result.test.tsx + tool-result-actions.deps.test.ts = 35 pass / 0 fail（2026-10-29 本地）。只改善恢复路径的正确性，不补齐历史任务的字节腿 → 除 VIDEO_REPLICATION.F/H 外判定不变
- **de79a8f6 / 口径纠正** — 『存资产库 writes to app_state/asset_store, NOT tool_assets』是 r22 的查错纠正，属工具链口径而非判定腿；不影响任何维度判定，仅登记防误判

## 矩阵（39 工具）

| # | 工具 | F | T | R | H | K | U |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PRODUCT_IMAGE_SUITE | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 | DRESS_WEAR_SET | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 | CHANGE_COLOR_V2 | PASS | PASS | PASS | PARTIAL | PASS | PASS |
| 4 | IMAGE_TRANSLATION | PASS | PASS | PASS | PASS | N/A | PASS |
| 5 | SCALE_UP | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 | AI_OUTPAINTING | PASS | PASS | PASS | PASS | PASS | PASS |
| 7 | AREA_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 8 | REMOVE_PEN | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 9 | CHANGE_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 10 | IMAGE_CROP | PASS | PASS | PASS | PASS | N/A | PASS |
| 11 | PRODUCT_REFINE | PASS | PASS | PASS | PASS | N/A | PASS |
| 12 | FIX_COLOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 13 | PRINTING_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 14 | HAND_REPAIR | PASS | PASS | PASS | PASS | N/A | PASS |
| 15 | NEW_REPLACE_BG_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 16 | REPLACE_GOODS | PASS | PASS | PASS | PASS | PASS | PASS |
| 17 | PRODUCT_SCENE | PASS | PASS | PASS | PASS | PASS | PASS |
| 18 | HANDHELD_GOODS | PASS | PASS | PASS | PASS | N/A | PASS |
| 19 | AI_DRESSING_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
| 20 | AI_POSTURE | PASS | PASS | PASS | PASS | N/A | PASS |
| 21 | AI_WEARABLE | PASS | PASS | PASS | PASS | PASS | PASS |
| 22 | AI_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 23 | ORNAMENT_TEXT | PASS | PASS | PASS | PASS | N/A | PASS |
| 24 | SDS_DESIGN | PASS | PASS | PASS | PASS | PASS | PASS |
| 25 | PRINT_EXTRACT | PASS | PASS | PASS | PASS | N/A | PASS |
| 26 | AI_POSE_GENERATOR | PASS | PASS | PASS | PASS | N/A | PASS |
| 27 | AI_DRESSING_XSY | PASS | PASS | PASS | PASS | N/A | PASS |
| 28 | FISSION_LINK | PASS | PASS | PASS | PASS | N/A | PASS |
| 29 | IMAGE_TEXT_EDIT | PASS | PASS | PASS | PARTIAL | N/A | PASS |
| 30 | MATERIAL_UPPER_BODY | PASS | PASS | PASS | PASS | N/A | PASS |
| 31 | NEW_DESIGNER | PASS | PASS | PASS | PASS | N/A | PASS |
| 32 | PRODUCT_MARKET_MATERIAL | PASS | PASS | PASS | PASS | N/A | PASS |
| 33 | SCENE_TRANSFER | PASS | PASS | PASS | PASS | N/A | PASS |
| 34 | IMAGE_TO_VIDEO | PASS | PASS | PASS | PASS | PASS | PASS |
| 35 | SALE_VIDEO | PASS | PASS | PASS | PASS | N/A | PASS |
| 36 | VIDEO_REPLICATION | PASS | PASS | PASS | PASS | N/A | PASS |
| 37 | AI_VIDEO_EDITING | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 38 | VIDEO_TRANSLATION | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 39 | VIDEO_CONCAT | PARTIAL | PASS | PASS | PASS | N/A | PASS |

## 剩余非全绿清单（断点精确到单元）

| # | 工具 | 维度 | 判定 | 唯一缺口 |
| --- | --- | --- | --- | --- |
| 1 | CHANGE_COLOR_V2 | H | PARTIAL | CHANGE_COLOR_V2 有成功真实任务，但回执 r14h-20261029/receipt-BLOCKED.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 2 | REMOVE_PEN | H | PARTIAL | REMOVE_PEN 有成功真实任务，但回执 edit8-h-real-20261029/REMOVE_PEN.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 3 | IMAGE_TEXT_EDIT | H | PARTIAL | IMAGE_TEXT_EDIT 有成功真实任务，但回执 real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json 记 BLOCKED(payload)：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 4 | AI_VIDEO_EDITING | F | PARTIAL | 仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL |
| 5 | AI_VIDEO_EDITING | H | PARTIAL | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 6 | VIDEO_TRANSLATION | F | PARTIAL | 上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞） |
| 7 | VIDEO_CONCAT | F | PARTIAL | 0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL |

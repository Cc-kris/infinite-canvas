# R17 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：HEAD `815fbdb`（`feat/linkfox-v1-real`）
- 基线：R16 419b0dec（matrix head 0bec102：F35/4 T39/0 R39/0 H34/5 K12/27 U39；非全绿 9 单元 / 7 工具）
- 生成：2026-10-29T22:52:15+0800；审计器：`tools/recompute_scope_matrix_r17.py`（继承 R16 判据，**只收紧**：只吸收 committed 证据，散文/未提交一律不计，且升级须过硬断言）
- 证据源：`git ls-tree -r -l HEAD` + blob sha256 现算；**未提交/未跟踪内容不吸收**

## 统计（F/T/R/H/K/U）

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 36 | 3 | — |
| T | 39 | 0 | — |
| R | 39 | 0 | — |
| H | 36 | 3 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

非全绿单元：**6** 个（5 个工具）

相对 R16 改判：**3 处**

- **CHANGE_COLOR_V2** `H` PARTIAL → PASS（r24-20261029/receipt-ccv2.json）
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
| 3 | CHANGE_COLOR_V2 | PASS | PASS | PASS | PASS | PASS | PASS |
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
| 1 | REMOVE_PEN | H | PARTIAL | REMOVE_PEN 有成功真实任务，但回执 edit8-h-real-20261029/REMOVE_PEN.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 2 | IMAGE_TEXT_EDIT | H | PARTIAL | IMAGE_TEXT_EDIT 有成功真实任务，但回执 real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json 记 BLOCKED(payload)：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 3 | AI_VIDEO_EDITING | F | PARTIAL | 仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL |
| 4 | AI_VIDEO_EDITING | H | PARTIAL | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 5 | VIDEO_TRANSLATION | F | PARTIAL | 上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞） |
| 6 | VIDEO_CONCAT | F | PARTIAL | 0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL |

## 审计执行与自检（report 独有）

### 1. 硬断言清单（升级项的机器校验，全部 PASS 才允许改判）

| 断言 | 结果 | 取值 |
| --- | --- | --- |
| PRODUCT_SCENE.H:schema | PASS | `h-reload-three-actions/v1` |
| PRODUCT_SCENE.H:toolId | PASS | `PRODUCT_SCENE` |
| PRODUCT_SCENE.H:task.status | PASS | `succeeded` |
| PRODUCT_SCENE.H:task.id | PASS | `task-mvtly3vu-fdqgy7` |
| PRODUCT_SCENE.H:task.storageKey | PASS | `tool-result:task-mvtly3vu-fdqgy7:0:TTlb-VmksNFfPn_GhRyTk` |
| PRODUCT_SCENE.H:reload.navType | PASS | `reload` |
| PRODUCT_SCENE.H:reload.domContentLoaded | PASS | `1793283612760` |
| PRODUCT_SCENE.H:post.panelView | PASS | `succeeded` |
| PRODUCT_SCENE.H:post.panelSha | PASS | `fa5ee380ab79` |
| PRODUCT_SCENE.H:post.panelBytes | PASS | `2398828` |
| PRODUCT_SCENE.H:action.download.present | PASS | `download` |
| PRODUCT_SCENE.H:action.download.sha | PASS | `fa5ee380ab79` |
| PRODUCT_SCENE.H:action.download.bytes | PASS | `2398828` |
| PRODUCT_SCENE.H:action.saveAsset.present | PASS | `saveAsset` |
| PRODUCT_SCENE.H:action.saveAsset.sha | PASS | `fa5ee380ab79` |
| PRODUCT_SCENE.H:action.saveAsset.bytes | PASS | `2398828` |
| PRODUCT_SCENE.H:action.sendCanvas.present | PASS | `sendCanvas` |
| PRODUCT_SCENE.H:action.sendCanvas.sha | PASS | `fa5ee380ab79` |
| PRODUCT_SCENE.H:action.sendCanvas.bytes | PASS | `2398828` |
| PRODUCT_SCENE.H:byteAgreement.allEqual | PASS | `True` |
| PRODUCT_SCENE.H:byteAgreement.bytes | PASS | `2398828` |
| PRODUCT_SCENE.H:noNewGeneration | PASS | `generationCalled` |
| HANDHELD_GOODS.H:schema | PASS | `h-reload-three-actions/v1` |
| HANDHELD_GOODS.H:toolId | PASS | `HANDHELD_GOODS` |
| HANDHELD_GOODS.H:task.status | PASS | `succeeded` |
| HANDHELD_GOODS.H:task.id | PASS | `task-mvtm8p59-8qkp5s` |
| HANDHELD_GOODS.H:task.storageKey | PASS | `tool-result:task-mvtm8p59-8qkp5s:0:c3Xf2R0z4RYt31DCxRmmX` |
| HANDHELD_GOODS.H:reload.navType | PASS | `reload` |
| HANDHELD_GOODS.H:reload.domContentLoaded | PASS | `1793283685252` |
| HANDHELD_GOODS.H:post.panelView | PASS | `succeeded` |
| HANDHELD_GOODS.H:post.panelSha | PASS | `29c1afcd7bda` |
| HANDHELD_GOODS.H:post.panelBytes | PASS | `1455193` |
| HANDHELD_GOODS.H:action.download.present | PASS | `download` |
| HANDHELD_GOODS.H:action.download.sha | PASS | `29c1afcd7bda` |
| HANDHELD_GOODS.H:action.download.bytes | PASS | `1455193` |
| HANDHELD_GOODS.H:action.saveAsset.present | PASS | `saveAsset` |
| HANDHELD_GOODS.H:action.saveAsset.sha | PASS | `29c1afcd7bda` |
| HANDHELD_GOODS.H:action.saveAsset.bytes | PASS | `1455193` |
| HANDHELD_GOODS.H:action.sendCanvas.present | PASS | `sendCanvas` |
| HANDHELD_GOODS.H:action.sendCanvas.sha | PASS | `29c1afcd7bda` |
| HANDHELD_GOODS.H:action.sendCanvas.bytes | PASS | `1455193` |
| HANDHELD_GOODS.H:byteAgreement.allEqual | PASS | `True` |
| HANDHELD_GOODS.H:byteAgreement.bytes | PASS | `1455193` |
| HANDHELD_GOODS.H:noNewGeneration | PASS | `generationCalled` |
| PRINT_EXTRACT.H:task.success | PASS | `succeeded` |
| PRINT_EXTRACT.H:task.id | PASS | `task-mvtlxua2-kh39uf` |
| PRINT_EXTRACT.H:reload.documentRecreated | PASS | `True` |
| PRINT_EXTRACT.H:reload.timeOriginChanged | PASS | `1793283410632->1793283495679` |
| PRINT_EXTRACT.H:reload.mechanism | PASS | `location.reload() 与 CDP Page.reload 均被 G` |
| PRINT_EXTRACT.H:post.panelText | PASS | `提取结果 / 已完成 / 共 1 个结果 · 图片 1 / 下载 / 存入资产 ` |
| PRINT_EXTRACT.H:post.actionButtons | PASS | `['tool-result-download-0', 'tool-result-save-0', 'tool-resul` |
| PRINT_EXTRACT.H:bytes.size | PASS | `2783996 vs 2783996` |
| PRINT_EXTRACT.H:bytes.sha | PASS | `1577dafdcda3 vs 1577dafdcda3` |
| PRINT_EXTRACT.H:bytes.storageKey | PASS | `tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO` |
| PRINT_EXTRACT.H:action.download.present | PASS | `download` |
| PRINT_EXTRACT.H:action.download.sha | PASS | `1577dafdcda3` |
| PRINT_EXTRACT.H:action.download.bytes | PASS | `2783996` |
| PRINT_EXTRACT.H:action.saveAsset.present | PASS | `saveToAssets` |
| PRINT_EXTRACT.H:action.saveAsset.sha | PASS | `1577dafdcda3` |
| PRINT_EXTRACT.H:action.saveAsset.bytes | PASS | `2783996` |
| PRINT_EXTRACT.H:action.sendCanvas.present | PASS | `sendToCanvas` |
| PRINT_EXTRACT.H:action.sendCanvas.sha | PASS | `1577dafdcda3` |
| PRINT_EXTRACT.H:action.sendCanvas.bytes | PASS | `2783996` |
| CHANGE_COLOR_V2.H:task.success | PASS | `succeeded` |
| CHANGE_COLOR_V2.H:task.id | PASS | `task-mvtn1xg0-sbk0fl` |
| CHANGE_COLOR_V2.H:task.storageKey | PASS | `tool-result:task-mvtn1xg0-sbk0fl:0:KWct7e2ggt9qZP80UbreK` |
| CHANGE_COLOR_V2.H:reload.documentRecreated | PASS | `True` |
| CHANGE_COLOR_V2.H:reload.navigationType | PASS | `reload` |
| CHANGE_COLOR_V2.H:reload.sameDocumentSession | PASS | `docId=2486dccf-199d-426d-a4f8-495084046eaa` |
| CHANGE_COLOR_V2.H:reload.inMemoryMarkerDropped | PASS | `False` |
| CHANGE_COLOR_V2.H:reload.timeOriginChanged | PASS | `1793285159394.8->1793285186666.1` |
| CHANGE_COLOR_V2.H:reload.domContentLoaded | PASS | `713.6000000238419` |
| CHANGE_COLOR_V2.H:reload.notNewTab | PASS | `CDP Page.reload on the SAME document/tab (tabId 1709629349),` |
| CHANGE_COLOR_V2.H:post.panelText | PASS | `已从本地恢复上次生成的真实结果（任务 sbk0fl · 1 张），下载/存资产库` |
| CHANGE_COLOR_V2.H:post.actionButtons | PASS | `['color-v2-restored-download', 'color-v2-restored-save', 'co` |
| CHANGE_COLOR_V2.H:bytes.size | PASS | `2545568 vs 2545568` |
| CHANGE_COLOR_V2.H:bytes.sha | PASS | `e1b1d638f6eb vs e1b1d638f6eb` |
| CHANGE_COLOR_V2.H:bytes.storageKey | PASS | `tool-result:task-mvtn1xg0-sbk0fl:0:KWct7e2ggt9qZP80UbreK` |
| CHANGE_COLOR_V2.H:action.download.present | PASS | `download` |
| CHANGE_COLOR_V2.H:action.download.sha | PASS | `e1b1d638f6eb` |
| CHANGE_COLOR_V2.H:action.download.bytes | PASS | `2545568` |
| CHANGE_COLOR_V2.H:action.saveToAssets.present | PASS | `saveToAssets` |
| CHANGE_COLOR_V2.H:action.saveToAssets.sha | PASS | `e1b1d638f6eb` |
| CHANGE_COLOR_V2.H:action.saveToAssets.bytes | PASS | `2545568` |
| CHANGE_COLOR_V2.H:action.sendToCanvas.present | PASS | `sendToCanvas` |
| CHANGE_COLOR_V2.H:action.sendToCanvas.sha | PASS | `e1b1d638f6eb` |
| CHANGE_COLOR_V2.H:action.sendToCanvas.bytes | PASS | `2545568` |
| CHANGE_COLOR_V2.H:byteAgreement.allEqual | PASS | `True` |
| CHANGE_COLOR_V2.H:byteAgreement.committedBytes | PASS | `2545568` |
| CHANGE_COLOR_V2.H:noNewGeneration.generationCalled | PASS | `False` |
| VIDEO_REPLICATION.R:task.present | PASS | `VIDEO_REPLICATION` |
| VIDEO_REPLICATION.R:claim.bytes | PASS | `1963716 vs 1963716` |
| VIDEO_REPLICATION.R:claim.sha | PASS | `e5cd3158a67c vs e5cd3158a67c` |
| VIDEO_REPLICATION.R:claim.notDropped | PASS | `False` |
| VIDEO_REPLICATION.R:claim.mime | PASS | `video/mp4` |
| VIDEO_REPLICATION.R:artifact.mp4Header | PASS | `ftypisom 由校验器另核（见 VERIFY 日志）` |
| VIDEO_REPLICATION.F:kind | PASS | `result-recovery-e2e-receipt` |
| VIDEO_REPLICATION.F:toolId | PASS | `VIDEO_REPLICATION` |
| VIDEO_REPLICATION.F:task.id | PASS | `task-mvtk9pu3-sfifnh` |
| VIDEO_REPLICATION.F:source.storageKey | PASS | `tool-result:4zwepLZTtpMan11tTGMKR` |
| VIDEO_REPLICATION.F:source.bytes==artifact | PASS | `1963716 vs 1963716` |
| VIDEO_REPLICATION.F:source.sha==artifact | PASS | `e5cd3158a67c vs e5cd3158a67c` |
| VIDEO_REPLICATION.F:source.mime | PASS | `video/mp4` |
| VIDEO_REPLICATION.F:reload.node.present | PASS | `freshReload` |
| VIDEO_REPLICATION.F:reload.tile.kind | PASS | `video` |
| VIDEO_REPLICATION.F:reload.tile.dataDropped | PASS | `false` |
| VIDEO_REPLICATION.F:reload.postObservation | PASS | `共 1 个结果 · 视频 1` |
| VIDEO_REPLICATION.F:reload.buttons.enabled | PASS | `{'download': False, 'save': False, 'canvas': False}` |
| VIDEO_REPLICATION.F:act.download.pass | PASS | `True` |
| VIDEO_REPLICATION.F:act.download.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.F:act.download.sha==artifact | PASS | `e5cd3158a67c` |
| VIDEO_REPLICATION.F:act.saveAsset.pass | PASS | `A3ADQamjcXYza0iIYwuKe` |
| VIDEO_REPLICATION.F:act.saveAsset.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.F:act.saveAsset.sha==artifact | PASS | `e5cd3158a67c` |
| VIDEO_REPLICATION.F:act.sendCanvas.pass | PASS | `video-1793284267434-g6jb5` |
| VIDEO_REPLICATION.F:act.sendCanvas.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.F:noNewGeneration | PASS | `noNewGeneration` |
| VIDEO_REPLICATION.H:kind | PASS | `result-recovery-e2e-receipt` |
| VIDEO_REPLICATION.H:toolId | PASS | `VIDEO_REPLICATION` |
| VIDEO_REPLICATION.H:task.id | PASS | `task-mvtk9pu3-sfifnh` |
| VIDEO_REPLICATION.H:source.storageKey | PASS | `tool-result:4zwepLZTtpMan11tTGMKR` |
| VIDEO_REPLICATION.H:source.bytes==artifact | PASS | `1963716 vs 1963716` |
| VIDEO_REPLICATION.H:source.sha==artifact | PASS | `e5cd3158a67c vs e5cd3158a67c` |
| VIDEO_REPLICATION.H:source.mime | PASS | `video/mp4` |
| VIDEO_REPLICATION.H:reload.node.present | PASS | `freshReload` |
| VIDEO_REPLICATION.H:reload.tile.kind | PASS | `video` |
| VIDEO_REPLICATION.H:reload.tile.dataDropped | PASS | `false` |
| VIDEO_REPLICATION.H:reload.postObservation | PASS | `共 1 个结果 · 视频 1` |
| VIDEO_REPLICATION.H:reload.buttons.enabled | PASS | `{'download': False, 'save': False, 'canvas': False}` |
| VIDEO_REPLICATION.H:act.download.pass | PASS | `True` |
| VIDEO_REPLICATION.H:act.download.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.H:act.download.sha==artifact | PASS | `e5cd3158a67c` |
| VIDEO_REPLICATION.H:act.saveAsset.pass | PASS | `A3ADQamjcXYza0iIYwuKe` |
| VIDEO_REPLICATION.H:act.saveAsset.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.H:act.saveAsset.sha==artifact | PASS | `e5cd3158a67c` |
| VIDEO_REPLICATION.H:act.sendCanvas.pass | PASS | `video-1793284267434-g6jb5` |
| VIDEO_REPLICATION.H:act.sendCanvas.bytes==artifact | PASS | `1963716` |
| VIDEO_REPLICATION.H:noNewGeneration | PASS | `noNewGeneration` |

### 2. 反证检查

- 反证（字节/sha 不符、非法 taskId、产物未提交）：**0** 条
- 反证阻断项（payloadDropped/快照回填）日志：**4** 条
  - REMOVE_PEN.H payload_drop=true → 不可升级
  - IMAGE_TEXT_EDIT.H payload_drop=true → 不可升级
  - REMOVE_PEN.H 字节腿机检：回执声明 2,440,825B；HEAD 内同尺寸已提交文件 0 个 → 不可复核，维持 PARTIAL
  - CHANGE_COLOR_V2.H 字节腿机检：回执声明 2,545,568B；HEAD 内同尺寸已提交文件 1 个 → 需 sha 对账

### 3. 判定口径（未放宽）

- **F**：结果 + >=2 项动作回执（下载/存资产/发画布），且回执文件必须在 HEAD 中提交
- **T**：无 LinkFox 品牌 / 无算力·积分计费 / 无案例库占位
- **R**：回执声明字节须能由已提交产物复核（尺寸或 sha256）
- **H**：真实 task-mv*（primary taskId 绑定、非 failed、非 synthetic）+ 机器 fresh reload 标记（phase/navType=reload、reload/fresh_reload 对象节点、Page.reload/location.reload() 回执）且同一回执内有刷新后观测（dockItems 数组/rows/stored_bytes/result_img_in_card）并指向该 task 或其结果字节/sha + 下载/入库/发画布字节须由该工具已提交产物按同尺寸（+声明 sha256 时）同 sha 复核；b5-*/task-real-*、recovery|inject 目录、payloadDropped、快照回填一律不计
- **K**：原站案例数据（evidence/b6-cases/origin）已提交
- **U**：未知/越界能力残留

### 4. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r17.py --check
```

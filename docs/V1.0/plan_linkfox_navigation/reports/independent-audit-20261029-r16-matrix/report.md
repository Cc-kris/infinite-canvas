# R16 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：HEAD `0bec102`（`feat/linkfox-v1-real`）
- 基线：R15 7a15c0f（matrix head 469fbec：F35/4 T39/0 R38/1 H31/8 K12/27 U39）
- 生成：2026-10-29T22:30:11+0800；审计器：`tools/recompute_scope_matrix_r16.py`（继承 R15 判据，**只收紧**：只吸收 committed 证据，散文/未提交一律不计，且升级须过硬断言）
- 证据源：`git ls-tree -r -l HEAD` + blob sha256 现算；**未提交/未跟踪内容不吸收**

## 统计（F/T/R/H/K/U）

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 35 | 4 | — |
| T | 39 | 0 | — |
| R | 39 | 0 | — |
| H | 34 | 5 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

非全绿单元：**9** 个（7 个工具）

相对 R15 改判：**4 处**

- **PRODUCT_SCENE** `H` PARTIAL → PASS（r18-h-reload-actions-20261029/receipt-product-scene.json）
- **HANDHELD_GOODS** `H` PARTIAL → PASS（r18-h-reload-actions-20261029/receipt-handheld-goods.json）
- **PRINT_EXTRACT** `H` PARTIAL → PASS（PRINT_EXTRACT/reload-verify-r16.json）
- **VIDEO_REPLICATION** `R` PARTIAL → PASS（r21-video-external-20261029/receipt.json）

## 吸收的已提交证据

- `cb6d5af` — r17 HANDHELD_GOODS 首个落库成功任务 task-mvtm8p59-8qkp5s：1455193B / sha 29c1afcd… / storageKey + 三动作 + freshReload 段落（报告自述）
- `09f7279` — r18 机器 reload 后三动作回执（schema h-reload-three-actions/v1）：PRODUCT_SCENE task-mvtly3vu-fdqgy7、HANDHELD_GOODS task-mvtm8p59-8qkp5s
- `a94e382` — r16 PRINT_EXTRACT 复用 task-mvtlxua2-kh39uf：cache-buster 全文档重建 + 刷新后面板三按钮 + 三动作全机器凭证（2783996B/sha 1577dafd…）
- `b85b13e` — r21 视频外部通道真实终态：VIDEO_REPLICATION succeeded 1963716B/sha e5cd3158…（独立实算）；AI_VIDEO_EDITING 上游 502 两连记 UNVERIFIED；fresh reload 三动作 disabled 如实登记
- `a1dbe6b` — gateway 定性修复（dispatchedAt / recover 宽限期 / 历史坞 storageKey 定位）+ CCV2 提交确认回执
- `8982e82` — gate 报告：固定快照 a1dbe6b 三闸 typecheck/test/build exit 0（1477 pass / 0 fail / 84 files，408 源文件）
- `09df7a4` — gate 报告 HEAD 漂移说明（验证对象仍为 a1dbe6b，未追并发 HEAD）

### 吸收但不改判（逐条说明为何不升级）

- **b85b13e / VIDEO_REPLICATION.H、F** — 刷新后结果瓦片 data-dropped=true（卡片文案『上游未返回该结果的文件』），下载/存资产/发画布三按钮全 disabled，回执明确『未伪造点击』→ 无三动作回执，H/F 无双腿，维持 PARTIAL；另登记为刷新后渲染回归缺口（字节在库、瓦片不认 storageKey）
- **b85b13e / AI_VIDEO_EDITING.H、F** — task-mvtkgo4b-gaomk5 status=failed（上游 502 两连，无 upstreamTaskId、无产物），无新成功任务/无动作回执 → 维持 PARTIAL
- **a1dbe6b / CHANGE_COLOR_V2.H** — RECEIPT.md §3.2 记录新真实任务 task-mvtml34y-cd8qm6 succeeded / 2,445,799B / storageKey，§3.3 记录 Page.reload 后三按钮 enabled；但三动作**只验证 enabled、未执行**，且 HEAD 内无 2,445,799B 已提交产物 → 字节腿与动作腿均不成立，维持 PARTIAL（不放宽）
- **a1dbe6b / 代码侧** — gateway submit 定性（dispatchedAt → submit-not-dispatched vs submit-unconfirmed）、recover 尊重 60s 宽限期、历史坞 url||storageKey 定位；8982e82+09df7a4 门禁：固定快照 a1dbe6b 三闸 typecheck/test/build exit 0（1477 pass / 0 fail / 84 files）。只影响未来任务的定性，不补齐任何历史任务的字节/动作腿 → 全维判定不变
- **09f7279 / PRODUCT_SCENE.F、HANDHELD_GOODS.F** — 三动作回执同时使 F 的事实更完整（此前 F_note 标『无三动作回执』但判定已为 PASS），判定不变，仅更新注记
- **a94e382 / PRINT_EXTRACT.F** — 存资产此前 UNVERIFIED，现 assetId fjzr1NhaALbnYz5LOAv9r + 同字节 sha 齐全；F 原判 PASS，维持，仅更新注记

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
| 36 | VIDEO_REPLICATION | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 37 | AI_VIDEO_EDITING | PARTIAL | PASS | PASS | PARTIAL | N/A | PASS |
| 38 | VIDEO_TRANSLATION | PARTIAL | PASS | PASS | PASS | N/A | PASS |
| 39 | VIDEO_CONCAT | PARTIAL | PASS | PASS | PASS | N/A | PASS |

## 剩余非全绿清单（断点精确到单元）

| # | 工具 | 维度 | 判定 | 唯一缺口 |
| --- | --- | --- | --- | --- |
| 1 | CHANGE_COLOR_V2 | H | PARTIAL | CHANGE_COLOR_V2 有成功真实任务，但回执 r14h-20261029/receipt-BLOCKED.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 2 | REMOVE_PEN | H | PARTIAL | REMOVE_PEN 有成功真实任务，但回执 edit8-h-real-20261029/REMOVE_PEN.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 3 | IMAGE_TEXT_EDIT | H | PARTIAL | IMAGE_TEXT_EDIT 有成功真实任务，但回执 real-acceptance/H4-real-20261029/IMAGE_TEXT_EDIT-natural-20261029.json 记 BLOCKED(payload)：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 4 | VIDEO_REPLICATION | F | PARTIAL | HEAD 内无任何该工具的动作回执（无 download/saveAsset/sendCanvas 结构化字段），a565e63 只是字节抽样 → 维持 PARTIAL |
| 5 | VIDEO_REPLICATION | H | PARTIAL | task-mvtk9pu3-sfifnh 现为 succeeded（a565e63 抽样 1,963,716B），但仅 README 散文、无机器 reload 回执/刷新后观测；且无该尺已提交产物 |
| 6 | AI_VIDEO_EDITING | F | PARTIAL | 仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL |
| 7 | AI_VIDEO_EDITING | H | PARTIAL | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| 8 | VIDEO_TRANSLATION | F | PARTIAL | 上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞） |
| 9 | VIDEO_CONCAT | F | PARTIAL | 0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL |

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
| VIDEO_REPLICATION.R:task.present | PASS | `VIDEO_REPLICATION` |
| VIDEO_REPLICATION.R:claim.bytes | PASS | `1963716 vs 1963716` |
| VIDEO_REPLICATION.R:claim.sha | PASS | `e5cd3158a67c vs e5cd3158a67c` |
| VIDEO_REPLICATION.R:claim.notDropped | PASS | `False` |
| VIDEO_REPLICATION.R:claim.mime | PASS | `video/mp4` |
| VIDEO_REPLICATION.R:artifact.mp4Header | PASS | `ftypisom 由校验器另核（见 VERIFY 日志）` |

### 2. 反证检查

- 反证（字节/sha 不符、非法 taskId、产物未提交）：**0** 条
- 反证阻断项（payloadDropped/快照回填）日志：**2** 条
  - REMOVE_PEN.H payload_drop=true → 不可升级
  - IMAGE_TEXT_EDIT.H payload_drop=true → 不可升级

### 3. 判定口径（未放宽）

- **F**：结果 + >=2 项动作回执（下载/存资产/发画布），且回执文件必须在 HEAD 中提交
- **T**：无 LinkFox 品牌 / 无算力·积分计费 / 无案例库占位
- **R**：回执声明字节须能由已提交产物复核（尺寸或 sha256）
- **H**：真实 task-mv*（primary taskId 绑定、非 failed、非 synthetic）+ 机器 fresh reload 标记（phase/navType=reload、reload/fresh_reload 对象节点、Page.reload/location.reload() 回执）且同一回执内有刷新后观测（dockItems 数组/rows/stored_bytes/result_img_in_card）并指向该 task 或其结果字节/sha + 下载/入库/发画布字节须由该工具已提交产物按同尺寸（+声明 sha256 时）同 sha 复核；b5-*/task-real-*、recovery|inject 目录、payloadDropped、快照回填一律不计
- **K**：原站案例数据（evidence/b6-cases/origin）已提交
- **U**：未知/越界能力残留

### 4. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r16.py --check
```

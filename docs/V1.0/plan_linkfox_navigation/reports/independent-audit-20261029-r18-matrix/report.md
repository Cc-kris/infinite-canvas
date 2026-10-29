# R18 独立审计矩阵（39 工具 · 严格重算）

- 审计对象 HEAD：`97952074676764befef6f4ec0895f243c8f2992c`（branch `feat/linkfox-v1-real`）
- 基线：R17 753074cc（其自带 matrix：F36/3 T39/0 R39/0 H35/4 K12/27 U39；非全绿 7 单元 / 6 工具）
- 审计器：`tools/recompute_scope_matrix_r18.py`（本目录 `auditor.py` 为同一快照）
- 复现：`python3 tools/recompute_scope_matrix_r18.py`

## 0. 统计（精确计数）

| 维度 | 口径 | PASS | PARTIAL | N/A |
|---|---|---|---|---|
| F | F 功能面 | 36 | 3 | 0 |
| T | T 测试闸 | 39 | 0 | 0 |
| R | R 取回/重启 | 39 | 0 | 0 |
| H | H 硬证据（真任务/真字节/真动作） | 36 | 3 | 0 |
| K | K 知识库 | 12 | 0 | 27 |
| U | U 用户链路 | 39 | 0 | 0 |

总计：**39** 个工具；非全绿 **6** 单元 / **5** 个工具；相对 R17 改判 **1** 处。

## 1. 相对 R17 的改判

- **CHANGE_COLOR_V2** `H` PARTIAL → PASS（r24-20261029/receipt-ccv2.json；产物 `docs/V1.0/plan_linkfox_navigation/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png`）

## 2. 剩余非全绿项（全部）

| 工具 | 维度 | 缺口 |
|---|---|---|
| REMOVE_PEN | H | r24 严格 H 探针（0dc21b06）判定 BLOCKED_NO_BYTES：3 个真实成功任务全部 resultHasBytes=false / resultItems[0].payloadDropped=true；IDB media_files 112 条内无 850,799B 孤图（blobOfSize850799Present=false）、HEAD 内亦无 R17 声称的 2,440,825B 同尺产物；r20 回执 NOT_REUSABLE（临时 profile 已销毁）。根因 task-machine.ts 404-423 落盘剥 bytes，源码未改 → 需真跑一次上传+蒙版+提交才可补三动作 |
| IMAGE_TEXT_EDIT | H | 97952074 回执（自称 H_PASS）已补齐 provenance：task-mvs8bhu1-hhue24 的 payloadDropped true→false，回填 storageKey tool-result:…:ZQg4pDfHC25ssM7hDsse7 / 844,613B / sha e7b260…，且与已提交 real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png 现算 sha 相等（硬腿 1）。仍缺：① 下载文件磁盘字节+sha（仅 toast 文案）② 存资产/发画布字节对账（仅 assetId BmtqvOWUMLOt_-6ITewQa / nodeId JXNuqx1kX4ydpBGfhPTcQ + IDB id 命中，无 bytes/sha）③ 机读 reload 标记（无 navigationType/timeOrigin）→ 按 R16-R18 同一判据维持 PARTIAL |
| AI_VIDEO_EDITING | F | 仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL |
| AI_VIDEO_EDITING | H | AI_VIDEO_EDITING 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 无字节可下载/存资产/发画布 |
| VIDEO_TRANSLATION | F | 上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞） |
| VIDEO_CONCAT | F | 0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL |

## 3. 门禁（新源码落地必跑）

- 快照：`/tmp/ic-gate-r18 (git archive 8751bd6e → clean tree, node_modules 软链到工作区, bunfig.toml 同 HEAD)`（clean `git archive HEAD`）
- typecheck：`bun run typecheck (tsc --noEmit)` → **EXIT 0，无输出告警**
- 相关测试-恢复/去笔：`bun test src/stores/use-tool-task-store.provenance-heal.test.ts src/features/tools/adapters/remove-pen.test.ts` → **27 pass / 0 fail（113 expect，2 files）**
- 相关测试-结果卡/三动作：`bun test src/components/tools/tool-result.test.tsx src/components/tools/tool-result-actions.deps.test.ts` → **35 pass / 0 fail（174 expect，2 files）**
- 说明：覆盖 d5aa048a（use-tool-task-store reattach / image-text-edit 回执地址回填）与 51a0ec1e（remove-pen fixture 去 blob: url）两个新源码提交；日志见同目录 typecheck.txt / tests-related.txt（tests-related.txt 只含第一组，第二组输出见 report.md）

## 4. 判据与严格性

- **absorb**：仅 committed 证据（git ls-tree HEAD + blob sha256 现算）；工作区未提交/未跟踪内容不参与
- **upgrade_rule**：每条升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等），断言失败即保持 R17 原判
- **downgrade_rule**：仅反证可降级（产物字节/sha 不符、payloadDropped、快照回填、非法 taskId）；『无法复核』不构成降级
- **negative_evidence_rule**：BLOCKED_* 负证只用于维持 PARTIAL，绝不作升级依据；负证本身也须机检通过
- **loosened**：False

## 5. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r18.py --check
```
## 6. 逐工具明细

| # | 工具 | F | T | R | H | K | U |
|---|---|---|---|---|---|---|---|
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

## 7. 吸收的已提交证据

- **e5b6d970**：CCV2 H 两腿回执（同文档 Page.reload 机读标记 + 2,545,568B/sha e1b1d638 已提交产物 + 三动作字节四方全等）
- **c5c27a1b**：CCV2 H 判 PARTIAL->PASS（修正 notNewTab 断言大小写；本轮用自建严格断言复算，不继承其结论）
- **0dc21b06**：PRINT_EXTRACT 严格 H 全腿 PASS 回执；REMOVE_PEN BLOCKED_NO_BYTES 根因定位（负证）
- **815fbdb2**：r24 证据迁到 plan_linkfox_navigation/evidence（产物路径可解析，避免路径解析误判）
- **51a0ec1e**：remove-pen 测试 fixture 去 blob: url，附 0069428b 三闸独立验证报告
- **8751bd6e**：VIDEO_CONCAT R24 机读负证（无本地任务/字节）
- **d5aa048a**：image-text-edit 草稿回执地址回填（源码修复，无字节证据）

## 8. 已吸收但不改判的条目

- `8751bd6e / evidence/real-acceptance/VIDEO_CONCAT/r24-no-task-bytes-20261029.json`：负证：本地 profile 内该成功任务记录与 2,133,234B 视频字节均不存在（IDB 同尺 0 条、localStorage 无 task-mvthgaa4-pdg1eq），不注入、不重生成即无法补『存资产/发画布』回执 → F 维持 PARTIAL
- `0dc21b06 / evidence/r24-strict-h-20261029/receipt-remove-pen.machine.json`：严格 H 探针判定 BLOCKED_NO_BYTES：3 个真实任务均 payloadDropped、HEAD 内无 2,440,825B 同尺产物；根因在 task-machine.ts 404-423 落盘剥 bytes（源码未改）→ H 维持 PARTIAL
- `d5aa048a / web/src/stores/use-tool-task-store.ts`：源码修复：草稿恢复后对最新 succeeded 任务 reattach 一次，把持久结果地址回填被剥掉的 result.items[0] 来源；已被 97952074 的真机回执验证生效（payloadDropped true→false，storageKey/bytes 回填）
- `97952074 / evidence/real-acceptance/IMAGE_TEXT_EDIT/r18-provenance-heal-20261029.json`：回执自称 H_PASS，但按同一判据只够 1 条字节硬腿（IDB restoredBytes 844,613B/sha e7b260…== 已提交 03-result-image.png 现算 sha）；缺下载磁盘字节 sha、缺存资产/发画布字节对账（仅 assetId/nodeId 文案+IDB id 命中）、缺机读 reload 标记（只写 location.reload()，无 navigationType/timeOrigin）→ IMAGE_TEXT_EDIT.H 维持 PARTIAL，不因回执自称 PASS 而放宽
- `51a0ec1e / web/src/features/tools/adapters/remove-pen.test.ts`：测试修正：storageKey-only 用例 fixture 去掉 blob: url（原为假锁），变异 4/4 可捕获；纯测试，无证据升级
- `0dc21b06 / evidence/r24-strict-h-20261029/receipt-print-extract.machine.json`：PRINT_EXTRACT.H 在 R17 已判 PASS，本轮补真 reload（navTypeAfter=reload）+ assetId + canvasNodeId 全腿、下载字节/sha 与 IDB blob 相等 → 维持 PASS（补硬腿，不改判）

## 9. 字节腿机检

- **REMOVE_PEN.H** 声称 2,440,825B → 同尺已提交产物：（无）；字节腿不可复核 → 维持 PARTIAL
- **CHANGE_COLOR_V2.H** 声称 2,545,568B → 同尺已提交产物：docs/V1.0/plan_linkfox_navigation/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png；已用已提交产物 sha 对账通过（四方字节全等）

## 10. 断言与矛盾

- 断言总数 198，失败 0
- 反证：无

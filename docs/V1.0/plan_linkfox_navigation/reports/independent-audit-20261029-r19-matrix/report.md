# R19 独立审计矩阵（39 工具 · 严格重算）

- 审计对象 HEAD：`03b8f47edc0fa18c09c667fe9748387cf1684577`（branch `feat/linkfox-v1-real`）
- 基线：R18 7af1814c（其自带 matrix：F36/3 T39/0 R39/0 H36/3 K12/27 U39；非全绿 6 单元 / 5 工具）
- 审计器：`tools/recompute_scope_matrix_r19.py`（本目录 `auditor.py` 为同一快照）
- 复现：`python3 tools/recompute_scope_matrix_r19.py --check`

## 0. 统计（精确计数）

| 维度 | 口径 | PASS | PARTIAL | N/A | 合计 |
|---|---|---|---|---|---|
| F | F 功能面 | 36 | 3 | 0 | 39 |
| T | T 测试闸 | 39 | 0 | 0 | 39 |
| R | R 取回/重启 | 39 | 0 | 0 | 39 |
| H | H 硬证据（真任务/真字节/真动作） | 36 | 3 | 0 | 39 |
| K | K 知识库 | 12 | 0 | 27 | 39 |
| U | U 用户链路 | 39 | 0 | 0 | 39 |

简式：**F 36/3/0 · T 39/0/0 · R 39/0/0 · H 36/3/0 · K 12/0/27 · U 39/0/0**（每维按 PASS/PARTIAL/N/A）

总计：**39** 个工具；非全绿 **6** 单元 / **5** 个工具（AI_VIDEO_EDITING, IMAGE_TEXT_EDIT, REMOVE_PEN, VIDEO_CONCAT, VIDEO_TRANSLATION）；相对 R18 改判 **0** 处；复验通过 **7** 项。

## 1. 相对 R18 的改判

- 无改判（0 处）：本轮新提交均为负证/门禁证据，无一条满足三动作字节硬腿；未放宽任何判据


## 2. 剩余非全绿项（全部）

| # | 工具 | 维度 | 缺口 |
|---|---|---|---|
| 1 | REMOVE_PEN | H | r25（044465c5）对真实任务 task-mvtmnhk5-nr2g0z 再次判定 BLOCKED_NO_BYTES 且为 physical_gap_confirmed：resultItem storageKey tool-result:task-mvtmnhk5-nr2g0z:0:komJnSXgwkxdOFeQHXTGI、声称 2,440,825B，但 sha256=null（unavailable_after_run）；r20 临时 profile /tmp/ic-profile 已删、无 APFS 快照、find 2440825B 命中 0、三个真实浏览器 profile 内 taskId/storageKey 0 命中、HEAD 无同尺产物；下载/存资产/发画布三动作均 NOT_VERIFIABLE_NO_BYTES。→ 无字节可对账，三动作无法在不注入前提下复验；需真跑一次上传+蒙版+提交（并保证该轮 profile 不被销毁）才能补 H |
| 2 | IMAGE_TEXT_EDIT | H | 97952074 回执已补齐 provenance（payloadDropped true→false，回填 storageKey tool-result:…:ZQg4pDfHC25ssM7hDsse7 / 844,613B / sha e7b260…），且与已提交 real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png 现算 sha 相等（硬腿 1，R19 复验通过）。仍缺（R19 逐字段机检为「不存在」）：① 下载文件磁盘字节+sha ② 存资产/发画布字节对账（仅 assetId/nodeId + IDB 命中）③ 机读 reload 标记（navigationType/timeOrigin）→ 维持 PARTIAL |
| 3 | AI_VIDEO_EDITING | F | 仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL |
| 4 | AI_VIDEO_EDITING | H | 有成功真实任务，但回执 r7-d19-history-20261029/orphan-tasks-127-3000-20261029.json 记 payloadDropped=true：结果项无 storageKey/url，字节未入库 → 维持 PARTIAL |
| 5 | VIDEO_TRANSLATION | F | 上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞） |
| 6 | VIDEO_CONCAT | F | 0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL |

## 3. 门禁（新源码落地必跑）

- 来源：03b8f47e 提交的原始日志（独立目录 git archive + bun install --frozen-lockfile 全量重装）
- 快照：`d5aa048a（tree 3ef46fd6；机检 web/ 与 HEAD 逐 blob 相同 → 结论对 HEAD 有效）`
- typecheck：`bun run typecheck (tsc --noEmit)` → **EXIT 0（TC_EXIT=0）**
- test：`bun test（全量）` → **1483 pass / 0 fail / 8342 expect（84 文件），TEST_EXIT=0**
- build：`bun run build` → **built in 30.34s，index-DPpMYq6s.js 5,607,804B，BUILD_EXIT=0**
- typecheck-scope：`tsc --listFiles` → **3437 行文件清单，web/src 入编译**
- 说明：日志路径 docs/V1.0/reports/verify-d5aa048a-20261029-logs/；本目录 evidence/gate.json 为机检摘要（含 web/ 一致性断言）

## 4. 判据与严格性

- **absorb**：仅 committed 证据（git ls-tree HEAD + blob sha256 现算）；工作区未提交/未跟踪内容不参与
- **upgrade_rule**：每条升级必须通过 UPGRADES 硬断言（字段/取值/字节/sha 三方以上相等），断言失败即保持 R18 基线原判；基线已 PASS 者重跑同一套断言做复验
- **downgrade_rule**：仅反证可降级（产物字节/sha 不符、payloadDropped、快照回填、非法 taskId）；『无法复核』不构成降级
- **negative_evidence_rule**：BLOCKED_* 负证只用于维持 PARTIAL，绝不作升级依据；负证本身也须机检通过
- **loosened**：False

## 5. 复现方式

```bash
cd /Users/mac/Documents/Dev/infinite-canvas && python3 tools/recompute_scope_matrix_r19.py --check
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

## 7. 吸收的已提交证据（R19 新增）

- **044465c5**：REMOVE_PEN 真实任务 task-mvtmnhk5-nr2g0z 字节物理缺口确认（BLOCKED_NO_BYTES，7 探针机检；负证不改判）
- **03b8f47e**：快照 d5aa048a 独立三闸全绿原始日志（typecheck/test/build 全 0）+ 草稿回写地址恢复 6/6；本轮机检 web/ 与 HEAD 相同

## 8. 已吸收但不改判的条目

- `044465c5 / r25-real-task-bytes-gap-20261029/receipt-remove-pen.machine.json`：BLOCKED_NO_BYTES：sha256=null（unavailable_after_run）、三动作 NOT_VERIFIABLE_NO_BYTES、find 2440825B=0 且真实 profile 内 taskId 0 命中、HEAD 无同尺产物 → 负证只维持 PARTIAL，绝不升级
- `03b8f47e / docs/V1.0/reports/verify-d5aa048a-20261029-logs/`：门禁证据（T 维不改判）：独立快照三闸 exit 0；web/ 与 HEAD 逐 blob 相同，故对 HEAD 有效；R19 将它作为 gate 记录，T 仍按 rubric 机检（无 LinkFox 品牌/计费/案例占位）
- `97952074 / evidence/real-acceptance/IMAGE_TEXT_EDIT/r18-provenance-heal-20261029.json`：R19 重跑缺口机检：download 仍无 bytes/sha/file，saveAsset 与 sendToCanvas 仍无 bytes/sha/imageBytes，freshReload 仍无 navigationType/timeOrigin；唯一硬腿为「IDB 844,613B / sha e7b260… == 已提交 03-result-image.png」 → 按同一判据仍 PARTIAL
- `044465c5 / 源码未改`：回执 constraints 明示 sourceCodeChanged=false、未重生成、未注入；rootCauseCheck 认定历史字节丢失来自快照时序 + 运行时实例已删，非可复现代码根因

## 9. 升级断言复验（R19 逐项重跑）

| 工具 | 维度 | 基线 | 断言数 | 结果 | 产物字节 | 证据 |
|---|---|---|---|---|---|---|
| PRODUCT_SCENE | H | PASS | 22 | OK | 2,398,828B | `r18-h-reload-actions-20261029/receipt-product-scene.json` |
| HANDHELD_GOODS | H | PASS | 22 | OK | 1,455,193B | `r18-h-reload-actions-20261029/receipt-handheld-goods.json` |
| PRINT_EXTRACT | H | PASS | 19 | OK | 2,783,996B | `PRINT_EXTRACT/reload-verify-r16.json` |
| VIDEO_REPLICATION | R | PASS | 6 | OK | 1,963,716B | `r21-video-external-20261029/receipt.json` |
| VIDEO_REPLICATION | F | PASS | 21 | OK | 1,963,716B | `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json` |
| VIDEO_REPLICATION | H | PASS | 21 | OK | 1,963,716B | `docs/diagnostics/result-recovery-e2e-task-mvtk9pu3-sfifnh.json` |
| CHANGE_COLOR_V2 | H | PASS | 50 | OK | 2,545,568B | `r24-20261029/receipt-ccv2.json` |

## 10. 字节腿机检

- **REMOVE_PEN.H** 声称 2,440,825B → 同尺已提交产物：（无）；字节腿不可复核（无产物、无 sha）→ 维持 PARTIAL
- **CHANGE_COLOR_V2.H** 声称 2,545,568B → 同尺已提交产物：docs/V1.0/plan_linkfox_navigation/evidence/r24-20261029/CHANGE_COLOR_V2-result-1.png；已用已提交产物现算 sha 对账通过
- **IMAGE_TEXT_EDIT.H** 声称 844,613B → 同尺已提交产物：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/03-result-image.png, docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/IMAGE_TEXT_EDIT/result.png；已用已提交产物现算 sha 对账通过
- **VIDEO_CONCAT.F** 声称 2,133,234B → 同尺已提交产物：docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/VIDEO_CONCAT/downloaded.mp4；已用已提交产物现算 sha 对账通过

## 11. 断言与矛盾

- 断言总数 235，失败 0
- 反证：无

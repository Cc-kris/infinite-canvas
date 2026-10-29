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

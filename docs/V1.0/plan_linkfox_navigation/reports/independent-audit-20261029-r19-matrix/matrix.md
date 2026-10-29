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

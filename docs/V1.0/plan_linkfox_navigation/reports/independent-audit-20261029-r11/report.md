# R11 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：`6636e1f`（`feat/linkfox-v1-real`）；基线 = R10 `e0608bd` + R9 crosscheck `434bc44`
- 生成：2026-10-29T19:58:26+08:00；审计器：`tools/recompute_scope_matrix_r11.py`（继承 R10，只补映射与归因，不放宽判定）
- 证据源：`git ls-tree HEAD` 内已提交文件；**未提交内容一律不计**
- 本报告**未生成任何新证据、未改业务源码、未派 worker、未生成任何任务**
- 吸收提交：`bcafd94`（REPLACE_GOODS 真实生成）、`c4af102`（NEW_DESIGNER 专项三腿 / IMAGE_TEXT_EDIT 自然恢复）、`e8da2c7`（image-text-edit 快照回填修复）、`0850ae2`（typecheck/test/build 全绿）、`d107ab0`（NEW_REPLACE_BG_V2 retry 真实复测）、`06f6f53` 等后续已提交证据

## 1. 结论总览

| 维度 | 分布 |
| --- | --- |
| F（结果 + ≥2 动作回执） | PARTIAL 11 / PASS 28 |
| T（无品牌/计费/占位） | PARTIAL 7 / PASS 32 |
| R（字节可由已提交产物复核） | BLOCKED 2 / PARTIAL 2 / PASS 35 |
| **H（严格三腿：真实 task + 机器 reload + 字节对账）** | **PARTIAL 13 / PASS 26** |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

H 由 R10 的 22 项升到 **26 项 PASS**，全部来自**已提交回执 + 已提交产物**的重新对账，无一项靠推断补齐。

## 2. 相对 R10 的改判（4 项，逐条独立复核）

| 工具 | R10 | R11 | 依据（已实算） |
| --- | --- | --- | --- |
| REPLACE_GOODS | PARTIAL | PASS | `h4-design-realgen-20261029/REPLACE_GOODS.json`：task-mvtgiiu1-hrp6z3 succeeded、payloadDropped=false、1,192,722B、sha256 `0ac369c5…`；`REPLACE_GOODS-result.png` 与 `REPLACE_GOODS-download-1793273153608.png` 实算 sha 与之一致；harness `h4-realgen-design.mjs` 真实 `page.reload()`，`dockAfterReload.items` 命中同一 taskId 且 `persistedAfterReload=true`；下载/存资产/发画布三动作 ok |
| NEW_REPLACE_BG_V2 | PARTIAL | PASS | `h4-design-realgen-retry-20261029/NEW_REPLACE_BG_V2.json`（`d107ab0`）：task-mvthl08d-06efgs succeeded、verdict PASS、`reloadNavType=reload`、三动作 ok、837,987B；磁盘 `NEW_REPLACE_BG_V2-result.png` 实算 sha256 `e3646058d0463b4b…` 与回执逐位相同；reload 后 dock 命中同 taskId。注：`bcafd94` 那两次 502 是**更早的失败尝试**，不覆盖后来成功的真实复测 |
| PRODUCT_IMAGE_SUITE | PARTIAL | PASS | `history-restore-20261029/summary.json`（已提交）：`fresh_reload_path` + items 内 task-mvt6vpdo-sc1x8w succeeded、2,840,825B、`sha256_16=4047edd57e482b45`、`match_task_bytes=true`；仓库 `PRODUCT_IMAGE_SUITE/r10/result.png` 实算 sha16 **4047edd57e482b45** 与之一致 |
| DRESS_WEAR_SET | PARTIAL | PASS | 同上 summary：task-mvt74l6q-1vljau succeeded、1,883,817B、`sha256_16=9b7e62daebc97949`、`match_task_bytes=true`；`DRESS_WEAR_SET/r10/result.png` 实算 sha16 **9b7e62daebc97949** 与之一致 |

## 3. R11 证据映射修正（只补映射，不动阈值）

1. **`reloadDockItems`**：h4 harness 刷新后的观测写在 `"dockAfterReload": { mounted, countText, items:[{taskId,status}], thumbs:[…] }`，其 `items` 与已接受的 `dockItems` 同形，此前整份漏读 → 现识别为刷新后观测。判定条件不变：观测与 reload 标记必须**同处一条已提交回执**且绑定同一 task，字节仍须与产物对账。
2. **上游 BLOCKED 归因**：带 `verdict=BLOCKED` + `blockedReason=no-task-record-after-submit` + 5xx 的回执改为原文引用，替代 R10 里陈旧的 `countForTool=0` 措辞（仅措辞，不改判定）。

未放宽任何一项：H 仍要求 primary taskId（非 failed/非 synthetic）+ 机器 reload 标记 + 同一回执内刷新后观测 + 字节/ sha 对账。

## 4. 机器硬断言（`h_asserts`，回执字段 + 磁盘字节实算）

审计器对 4 个被改判/新增证据的工具跑了字段级断言，**0 项失败**：task 状态、payloadDropped、动作回执、reload 型别、dock 同 taskId、persisted、尺寸与 sha256 全绿（明细见 `matrix.md` 末节与 `matrix.json.h_asserts`）。

## 5. 风险与未完成（如实标注，未修）

1. **DRESS_WEAR_SET `r10/actions.json` 自述 UNVERIFIED**（"dock 三动作点击已执行但脚本超时未回收回执"）：H 三腿不受影响（本维度不要求动作回执），但其 F 腿的强证据仍偏薄，建议下一轮补一次三动作回执。
2. **NEW_DESIGNER**：`c4af102` 专项回执里"发送画布"本次 `Failed to fetch`（canvasChanged=false）。F **仍为 PARTIAL**（矩阵口径：F 需 ≥2 项机器动作回执，本工具仅本地导出 + 画布截图，无资产/画布机器回执）；H=PASS 不受影响（下载 ok、411801B/sha 90e28e0f… 与产物一致）。
3. **IMAGE_TEXT_EDIT**：`e8da2c7` 修复后自然恢复成立（task + reload 两腿），但该真实任务 payloadDropped=true、无 storageKey/bytes，三动作如实禁用 → 字节腿不成立，**保持 PARTIAL，不伪 PASS**。
4. **HEAD 漂移**：本矩阵生成于 `6636e1f`，审计期间仓库仍被并发提交推进（提交后 HEAD 已前进），复现时请以 `6636e1f` 为准。当前 HEAD 为 `5c25200`（r12 三闸），其后 `7664498`（DRESS_WEAR_SET 三动作回执）等提交**不属于本矩阵审计范围**，未计入、未改判。
5. **DRESS_WEAR_SET 动作补证（跨 HEAD）**：`7664498` 已提交 DRESS_WEAR_SET 整页 reload + 下载/存资产/发画布真实回执，可解风险 1；但该提交晚于 `6636e1f`，按「未提交不计」口径本轮不据此改判，留待下一轮复核。

## 5.1 crosscheck（2026-10-29，独立复核 `3c9d81a`）

- 独立复跑：在 `6636e1f` 临时 worktree 上用本修订版审计器重算，tally 与 `h_pass=26`、`h_asserts failures: []` 完全一致；统计**零变更**
- 已修映射错误（仅映射/归属，不改阈值）：① `NEW_REPLACE_BG_V2` 的 `h_asserts` 原断言 `bcafd94` 的 502 回执，与 H=PASS 源不符 → 改为断言 `d107ab0` retry 回执（14 项全绿）；② `NEW_DESIGNER` 的 `H_evidence` 追加项多带了 `evidence/` 前缀（该列表本就相对 evidence/）→ 去重；③ `h_changes_vs_r10.commit` 原对 4 项统一写 `bcafd94` → 改为逐工具真实提交（6986988 / 6f7ee1c / d107ab0 / bcafd94）；④ `r11_notes`/`supersedes` 里 NEW_REPLACE_BG_V2 仍是 BLOCKED 文案 → 改为 d107ab0 复测 PASS；⑤ 吸收提交清单补 6986988、6f7ee1c、d107ab0
- 字节复核（实算）：REPLACE_GOODS 1192722B/0ac369c5、NEW_REPLACE_BG_V2 837987B/e3646058、PRODUCT_IMAGE_SUITE 2840825B/4047edd5、DRESS_WEAR_SET 1883817B/9b7e62da、NEW_DESIGNER 411801B/90e28e0f，全部与回执一致
- 未做：未新增任何 PASS、未改业务源码、未生成新证据、未派 worker

## 6. 复现

```bash
cd docs/V1.0/plan_linkfox_navigation
python3 tools/recompute_scope_matrix_r11.py                    # 生成 matrix.json / matrix.md
python3 tools/recompute_scope_matrix_r11.py --debug --only REPLACE_GOODS NEW_REPLACE_BG_V2 PRODUCT_IMAGE_SUITE DRESS_WEAR_SET
python3 tools/recompute_scope_matrix_r11.py --json /tmp/x.json --md /tmp/x.md   # 不覆盖基准
```

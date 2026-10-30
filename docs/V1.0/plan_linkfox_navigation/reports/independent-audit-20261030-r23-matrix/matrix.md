# R23 独立矩阵（39 工具 · 六维）

- 审计点（PIN）：`a9d66329abf7f86377f89bd8731e72eace5eb680`
- 基线：`d4226f46`（docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r21-matrix/matrix.json）
- 重算器：`tools/recompute_scope_matrix_r23.py`

## 汇总

| 维度 | 分布 |
| --- | --- |
| F | PARTIAL 1 / PASS 38 |
| T | PASS 39 |
| R | PASS 39 |
| H | PASS 39 |
| K | N/A 27 / PASS 12 |
| U | PASS 39 |

- 非全绿单元：1（VIDEO_TRANSLATION.F）

## 本轮改判

| 工具 | 维度 | 前 | 后 | 断言 |
| --- | --- | --- | --- | --- |
| REMOVE_PEN | H | PARTIAL | PASS | 36/36 |
| IMAGE_TEXT_EDIT | H | PARTIAL | PASS | 36/36 |
| AI_VIDEO_EDITING | H | PARTIAL | PASS | 35/35 |
| VIDEO_CONCAT | F | PARTIAL | PASS | 33/33 |
| VIDEO_TRANSLATION | F | PARTIAL | PARTIAL | 3/3 |

## 门禁（PIN 快照自跑）

- 快照：`a9d66329abf7f86377f89bd8731e72eace5eb680` tree `c5c68667579d5cff9b23c9489badecf31ebcc8cf`（隔离目录重建，未复用他人日志）
- install：931 packages，exit0=True
- typecheck：exit0=True
- test：1494 pass / 0 fail / 85 files，exit0=True
- build：45.32s，index-DXFpiqIy.js = 5610025B，exit0=True

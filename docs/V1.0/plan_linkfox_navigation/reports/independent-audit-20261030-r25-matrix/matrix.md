# R25 独立矩阵（39 工具 · 六维）

- 审计点（PIN）：`2ecd958d64832da4bf2729be122412d66b8c3742`
- 基线：`c4b3611aeb708a5236e4a7feefbedded63cd7c7e`（docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r23-matrix/matrix.json）
- 重算器：`tools/recompute_scope_matrix_r25.py`

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

## 本轮复核单元（判据前 → 后）

| 工具 | 维度 | 前 | 后 | 断言 |
| --- | --- | --- | --- | --- |
| REMOVE_PEN | H | PASS | PASS | 36/36 |
| IMAGE_TEXT_EDIT | H | PASS | PASS | 36/36 |
| AI_VIDEO_EDITING | H | PASS | PASS | 35/35 |
| AI_VIDEO_EDITING | H | PASS | PASS | 35/35 |
| VIDEO_CONCAT | F | PASS | PASS | 33/33 |
| VIDEO_TRANSLATION | F | PARTIAL | PARTIAL | 55/55 |

## 门禁（固定 HEAD 三闸，日志随 PIN 提交入库）

- 来源：`docs/V1.0/reports/verify-head-r24-fixed (PIN tree blob)`
- 绑定提交：`c4b3611aeb708a5236e4a7feefbedded63cd7c7e`（tree `18a9ad0935ef5ad53e256fb2cc5049aaf42bf496`，web 树 `ede2d0e243d7ec46095108ede4ff7190947af2dd`）
- 提交主题：audit(r23): 独立六维矩阵 R23（PIN a9d66329）——H 37→39，F 38，残留 VT.F
- 该轮自评：PASS (3/3 gates green on pinned commit c4b3611a)
- typecheck：exit0=True，error TS 计数=0，22.26s
- test：1509 pass / 0 fail / 87 files（8431 expect）exit0=True
- build：23.99s，8830 modules，入口 index-BNvVASBg.js ≈ 5614.23 kB，dist 443 文件，exit0=True

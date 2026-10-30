# R27 独立矩阵（39 工具 · 六维）

- 审计点（PIN）：`e2529d422b9f2f4b50209b12f73ec4e7bbd8e492`
- 基线：`7f656bd5cf98c953ebdf8f0c0bd843a539c31e71`（docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261030-r25-matrix/matrix.json）
- 重算器：`tools/recompute_scope_matrix_r27.py`

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
- 未吸收（审计时未提交，不参与判据）：5 项
- 门禁覆盖缺口：四闸绑定 `eacc18f7`，晚于它的 `2dd097bb`（画幅）未被覆盖

## 本轮复核单元（判据前 → 后）

| 工具 | 维度 | 前 | 后 | 断言 |
| --- | --- | --- | --- | --- |
| REMOVE_PEN | H | PASS | PASS | 36/36 |
| IMAGE_TEXT_EDIT | H | PASS | PASS | 36/36 |
| AI_VIDEO_EDITING | H | PASS | PASS | 35/35 |
| AI_VIDEO_EDITING | H | PASS | PASS | 35/35 |
| VIDEO_CONCAT | F | PASS | PASS | 33/33 |
| VIDEO_TRANSLATION | F | PARTIAL | PARTIAL | 125/125 |

## 门禁（固定 HEAD 四闸，日志随 PIN 提交入库）

- 来源：`docs/V1.0/reports/verify-head-r26-fixed (PIN tree blob)`
- 绑定提交：`eacc18f7cb16d15ed40afaed6beeff13da1c39a9`（tree `3fbda4bac69ca39f92f94f25e6bf74b6a5ef43eb`，web 树 `3722e3cfa871ba792c2f21d0f3d54f677b385655`）
- 提交主题：fix(tools): 存入资产不再写 1280x720 视频兜底尺寸，改严格测量+后台校正
- 该轮自评：PASS (4/4)
- typecheck：exit0=True，error TS 计数=0，369.03s
- test：1514 pass / 0 fail / 88 files（8458 expect）exit0=True
- build：88.0s，8830 modules，入口 index-BM1Z8JG7.js ≈ 5616.02 kB，dist 443 文件，exit0=True

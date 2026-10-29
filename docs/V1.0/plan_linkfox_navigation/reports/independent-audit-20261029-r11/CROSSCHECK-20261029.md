# R11 crosscheck（独立复核 `3c9d81a` 的 matrix/report）

- 复核对象：`3c9d81a`（`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r11/{matrix.json,matrix.md,report.md}` 与 `tools/recompute_scope_matrix_r11.py`）
- 被测审计 HEAD：`6636e1f`；复核时仓库 HEAD：`5c25200`（r12 三闸）
- 复核方式：不派 worker、不读调度 SOP；直接读提交内容 + 在 `6636e1f` 的临时 worktree 里重跑审计器（`git ls-tree HEAD` 口径不变）+ 磁盘字节实算
- 边界：**只修报告/审计器的映射错误；不改业务源码、不新增 PASS、不生成任何新证据、不新建任务**

## 1. 统计复核（全部对上）

| 维度 | matrix.json 逐行重数 | summary | report §1 |
| --- | --- | --- | --- |
| F | PASS 28 / PARTIAL 11 | 同 | 同 |
| T | PASS 32 / PARTIAL 7 | 同 | 同 |
| R | PASS 35 / PARTIAL 2 / BLOCKED 2 | 同 | 同 |
| H | PASS 26 / PARTIAL 13 | 同 | 同 |
| K | PASS 12 / N/A 27 | 同 | 同 |
| U | PASS 39 | 同 | 同 |

- PASS 清单（H）：除 13 项 PARTIAL 外全部；13 项 PARTIAL = CHANGE_COLOR_V2、REMOVE_PEN、PRODUCT_SCENE、HANDHELD_GOODS、PRINT_EXTRACT、FISSION_LINK、IMAGE_TEXT_EDIT、PRODUCT_MARKET_MATERIAL、IMAGE_TO_VIDEO、VIDEO_REPLICATION、AI_VIDEO_EDITING、VIDEO_TRANSLATION、VIDEO_CONCAT
- 字节实算复核（全部一致）：REPLACE_GOODS 1,192,722B/`0ac369c5…`；NEW_REPLACE_BG_V2 837,987B/`e3646058…`；PRODUCT_IMAGE_SUITE 2,840,825B/`4047edd5…`；DRESS_WEAR_SET 1,883,817B/`9b7e62da…`；NEW_DESIGNER 411,801B/`90e28e0f…`；AI_TEXT 1,445,425B
- F 的 PARTIAL 复核：PRODUCT_IMAGE_SUITE / DRESS_WEAR_SET 的 `b4-actions.json` 仅在工作区、**未在 `6636e1f` 提交** → F=PARTIAL 判定正确，未改

## 2. 发现并修正的映射错误（5 处，均不改阈值）

1. `h_asserts["NEW_REPLACE_BG_V2"]` 原断言 `h4-design-realgen-20261029/NEW_REPLACE_BG_V2.json`（bcafd94 的 502 回执），而 H=PASS 的来源是 `h4-design-realgen-retry-20261029`（d107ab0）→ 断言与结论源不一致。改为断言 retry 回执（现 14 项断言全绿：task-mvthl08d-06efgs / succeeded / reload / dockItems=1 / 837987B / sha e3646058 逐位相等 / 三动作 ok）
2. `NEW_DESIGNER.H_evidence` 追加项写成 `evidence/real-acceptance/…`，但该列表本就相对 `evidence/` → 路径无效，已去掉多余前缀
3. `h_changes_vs_r10[*].commit` 原对 4 项统一硬编码 `bcafd94` → 改为逐工具真实提交：PRODUCT_IMAGE_SUITE `6986988`、DRESS_WEAR_SET `6f7ee1c`、NEW_REPLACE_BG_V2 `d107ab0`、REPLACE_GOODS `bcafd94`
4. `r11_notes` 与 `supersedes.reason` 里 NEW_REPLACE_BG_V2 仍是「两次 502 → BLOCKED」，与 H=PASS 自相矛盾 → 改为「早期 502（历史归因保留）+ d107ab0 复测 PASS」
5. 吸收提交清单补 `6986988`、`6f7ee1c`、`d107ab0`（矩阵实际用到的已提交证据）
6. 报告 §5.2「NEW_DESIGNER … F 仍成立（≥2 动作）」与 matrix 的 `F=PARTIAL` 矛盾 → 改为「F 仍为 PARTIAL（本地导出+画布截图，无资产/画布机器回执）」

## 3. HEAD 与提交一致性

- 审计器/矩阵自述 HEAD=`6636e1f`，与 `matrix.json.head` 一致；`6636e1f` 确为真实提交且是 `3c9d81a` 的祖先
- 报告原先写「吸收 `06f6f53` 等后续已提交证据」，但 `06f6f53`、`7664498` 均**晚于** `6636e1f` → 已显式标注为「跨 HEAD、不计入、未改判」
- 当前 HEAD=`5c25200`，R11 之后仍有推进（属正常 HEAD 漂移，报告已标注复现须用 `6636e1f`）

## 4. 复跑验证（可复现）

```bash
git worktree add --detach /tmp/icw-6636e1f 6636e1f
mkdir -p /tmp/icw-6636e1f/docs/V1.0/plan_linkfox_navigation/tools
cp docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r*.py \
   /tmp/icw-6636e1f/docs/V1.0/plan_linkfox_navigation/tools/
cd /tmp/icw-6636e1f && python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r11.py \
   --json /tmp/post.json --md /tmp/post.md
```

结果：tally 与 `h_pass=26` 不变，`h_asserts failures: []`；与已提交矩阵的差异**仅**为上列映射/归属项。

## 5. 未做/风险

- 未据 `7664498`（DRESS_WEAR_SET 三动作回执，晚于审计 HEAD）改判，只作为跨 HEAD 风险注记写入报告
- `matrix.json` 由修订版审计器在 `6636e1f` 全量重跑生成，故 AI_TEXT 行证据指向最新已提交回执（1,445,425B `real-acceptance/AI_TEXT/r10-real-20261029/03-result.png`），判定仍 PASS

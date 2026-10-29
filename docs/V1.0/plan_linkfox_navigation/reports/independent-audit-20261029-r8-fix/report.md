# R8-fix：39 工具矩阵「证据映射」修正版（2026-10-29）

- 取代：`reports/independent-audit-20261029-r8/`（R8，commit `76957dd`）
- 生成时 HEAD：`0b86a737f7df77d96e0a3530b33878b3e31dc053`
- 生成时间：2026-10-29T18:28:12+08:00
- 复算脚本：`tools/recompute_scope_matrix_r8_fix.py`
- 产物：`matrix.json`、`matrix.md`、本文件
- 本次**不生成任何新证据**，只做「已提交证据 → 结论」的重新映射。

## 1. R8 的问题：不是判错，是「找不到」

R8 的 H 维度只从 R7 矩阵里存的 `H_evidence` 字符串出发，逐个 `tracked()` 查文件；
凡是 R7 没在那串里列出的证据，一律写成「未取证：无 reload 快照恢复回执」。

两个具体缺陷：

1. **路径不接受真实目录**：`tracked()` 只试 `evidence/<rel>`、`evidence/real-acceptance/<rel>`，
   而大量回执就在 `evidence/real-acceptance/xxx/` 之外的目录（`suite-design-history-*`、
   `r7-d19-history-*`、`video-4tools-*` 等），于是「存在但找不到」。
2. **task id 正则不匹配通配写法**：R7 有 `task-mvt0rvni-*` 这类省略尾段的写法，
   `_ID_RE` 要求 `task-mv[a-z0-9]{4,}-[a-z0-9]{4,}`，通配 id 直接不成立，
   于是 5fc2e69 / 0d1eaaa / fc38b49 / df765ff 批次的真实取证被判成「未取证」。

R8-fix 改为**全仓已提交文本扫描 + 工具绑定**，绑定方式四选一：
① JSON 子树里 `toolId == tid`；② 根键 `{tid: [...], byTool: {tid: ...}}`；
③ 路径名即工具名（单工具采集文件）；④ 顶层 `toolId` 字段。
`b5-*` / `task-real-*` / `recovery|inject` 目录、合成 id（`task-*` 且无真实上游）、
`b5` 注入快照一律不计 —— 判定标准没有放宽，只是**看得见了**。

## 2. 结论变化：仅 3 项 PARTIAL → PASS

三项都由「专用回执（toolId 自证）+ 结构化 reload 标记 + 结果字节可对账」三件同时成立支撑：

| 工具 | 代表 task | reload 机器标记 | 字节对账 |
|---|---|---|---|
| AI_DRESSING_XSY | `task-mvtbf7ue-n28x46` | `"phase":"reload"` + `afterReload` | result-0.png **1576288B**，sha `a52e70d4…` 与文件一致 |
| FISSION_LINK | `task-mvt18lrt-rsnifn` | `"freshReload":{"marker":"sessionStorage.__accept_marker=1 后 location.reload()"}` | 结果 **1988694B**，下载落盘同字节，`bytesMatchStored: true`；下载后 `b5-restored-download.png` sha `bbc0ca08…` 一致 |
| SALE_VIDEO | `task-mvt76u6p-7cfnff` | `"nav":"reload"` 的历史坞转储 | mp4 **1366190B**，sha `39193f0a…` 与产物一致 |

对应证据文件：
- `evidence/real-acceptance/AI_DRESSING_XSY_20261029_persist/reload-summary.json`
- `evidence/real-acceptance/FISSION_LINK/b5-restore-after-reload.json`
- `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`

## 3. 刻意「不」改判的项（标准不放宽）

| 工具 | 为什么不给 PASS | 依据 |
|---|---|---|
| IMAGE_CROP | 回执自述 `"resultRestored": false`：刷新只恢复草稿与源图，裁剪结果不回流 | `real-acceptance/IMAGE_CROP/result.json` |
| IMAGE_TEXT_EDIT | 任务记录是审计脚本用真实产物 URL「回填任务快照」后渲染，不是历史自然恢复 | `real-acceptance/IMAGE_TEXT_EDIT/result.json` |
| AI_POSE_GENERATOR | fresh reload 后历史坞确有 5 条、1 succeeded，但 `resultItemPayloadDropped: true`：快照只存元数据，下载/入库/上画布三键同提示「原始文件未保留」 | `suite-design-history-20261029-b/POSE_UB.AI_POSE_GENERATOR.json` |
| REMOVE_PEN / PRINTING_REPAIR / HAND_REPAIR | 只有注入快照或普通页面采集，无机器 reload 回执 | `recovery4`、`b4-actions.json` |
| design19 系列（NEW_REPLACE_BG_V2 / REPLACE_GOODS / PRODUCT_SCENE / AI_DRESSING_V2 / AI_POSTURE / AI_WEARABLE / PRINT_EXTRACT / MATERIAL_UPPER_BODY / NEW_DESIGNER / PRODUCT_MARKET_MATERIAL / HANDHELD_GOODS） | 历史坞 0 条或仅 failed，无 succeeded 结果可读回 | `r7-d19-history-20261029/*.json` |
| CHANGE_COLOR_V2 | 任务 `unknown`、0 结果 | `real-acceptance/CHANGE_COLOR_V2/*` |
| VIDEO_TRANSLATION / AI_VIDEO_EDITING 等 | 无机器 reload 回执，或全仓无 taskId+toolId 同现 | 全仓扫描结果 |

另外，原本由 R8 用旧链路判过 PASS 的 11 项（PRODUCT_IMAGE_SUITE、DRESS_WEAR_SET、
IMAGE_TRANSLATION、SCALE_UP、CHANGE_COLOR、FIX_COLOR、AI_TEXT、ORNAMENT_TEXT、
SDS_DESIGN、SCENE_TRANSFER、VIDEO_CONCAT）**原样保留 PASS**，不改判、不改口径。

## 4. 统计（39 工具）

```json
{
 "F": {"PASS": 28, "PARTIAL": 11},
 "T": {"PASS": 32, "PARTIAL": 7},
 "R": {"PASS": 35, "BLOCKED": 2, "PARTIAL": 2},
 "H": {"PASS": 14, "PARTIAL": 25},
 "K": {"PASS": 12, "N/A": 27},
 "U": {"PASS": 39}
}
```

- F / T / R / K / U **与 R8 逐工具完全一致**（脚本级校验：0 处差异）。
- H：PASS 11 → 14。变动 3 项，其余 30 项只改结论文案（把「未取证」换成
  「有真实 task X、但缺机器 reload 回执 / 结果不回流 / 快照回填 / 字节不可复原」这类可核查原因）。

## 5. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas
python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r8_fix.py          # 生成矩阵
python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r8_fix.py --debug  # 逐工具候选明细
```

脚本以 `git ls-tree HEAD` 判定「已提交」，任何未提交文件都不参与，保证结论可被别人复算。

## 6. 已知局限 / 风险

1. **只读证据，不判产品**：H=PASS 只意味着「该工具的真实任务在 fresh reload 后结果可读回、
   字节可复核」，不等于产品无缺陷（F/R 维有独立的 BLOCKED/PARTIAL）。
2. **负面标记优先**：工具名下任意一份专用回执自述 `resultRestored=false`，即使另一份回执
   显示成功也压到 PARTIAL（保守取值，避免用「有利回执」盖掉「不利回执」）。
3. **回填识别靠措辞**：`回填任务快照 / 快照回填 / upsertTask` 等命中即不计自然恢复；
   若未来新回执用别的措辞描述注入，需要同步更新 `BACKFILL_RE`，否则可能高估。
4. **代表 task 的选取**：多任务转储里按 `realTaskId/reusedTask` 优先、其次字节窗口、
   再次 succeeded 排序；若回执里没有任何主任务指针且多任务都带字节，该 id 仅供引用，
   结论仍以「字节是否可对账」为准。

# R8 输入 · 39 工具 H/F/R 真实剩余 gap-map（只读归并）

- 仓库 `/Users/mac/Documents/Dev/infinite-canvas`，分支 `feat/linkfox-v1-real`，核对起点 HEAD `0a6d2c8`；核对期间被并行提交推进（`9873bb4` → `5fc2e69`），本报告提交落在其之上
- 基准：`1e698eb`（R7 报告 `reports/independent-audit-20261029-r7/`，F 23/16、R 37/2、H 13/26）
- 核对提交：`ec74701`、`7125df1`、`0d1eaaa`、`fde27e9`、`0b9aecf`、`fc38b49`、`0a6d2c8`、`9873bb4`、`5fc2e69`（`6d9bd86`、`b43a21d` 早于 R7 且已被 R7 吸收，见 matrix 的 FIX_COLOR/SALE_VIDEO 条目）
- 口径未放宽：**只认已提交的机器回执**（JSON/DOM 序列化/字节/sha256）；仅 MD 文字记录、单测、注入快照不支撑新 PASS
- 本次只读：未改功能源码、未重新生成、未起浏览器

## 一、ec74701「七工具」名称确认（逐字取自该提交 REPORT.md 范围行）

1. `PRODUCT_IMAGE_SUITE`
2. `DRESS_WEAR_SET`
3. `AI_POSTURE`
4. `AI_POSE_GENERATOR`（= POSE_UB）
5. `MATERIAL_UPPER_BODY`（= FLITE）
6. `NEW_DESIGNER`
7. `PRODUCT_MARKET_MATERIAL`

判定原文：仅前 2 个 `PASS`（各 2 条 succeeded 任务，fresh reload 后 dock 2 条，2/2 sha256 与 IndexedDB 一致）；其余 5 个「dock 已挂载但 0 条」= BLOCKED。表中另加第 8 行 `PRODUCT_SCENE`（右栏历史页签在、0 条，同为 BLOCKED）——**标题写 7、表里 8 行**，R8 引用时须按上面 7 名单，勿把 `PRODUCT_SCENE` 计入七工具。
- 该提交自述的 BLOCKED 根因：5 个工具的运行记录都在**临时 playwright profile**（`design19b-nv-final/_runs/`），与真实用户 profile（ego lite · Profile 1，`tool-task:v1:index` 33 条）不是同一份存储。
- 注意：`2151517B` 属 R7 matrix 的 `PRODUCT_IMAGE_SUITE` b4 三动作回执，**不是** ec74701 的数字，勿混引。

## 二、统计（R7 → 本报告可支撑）

| 维度 | R7 | 现可支撑 | 变化 |
|---|---|---|---|
| F | 23 PASS / 16 PARTIAL | 23 / 16 | 无新增（无新的「下载+存资产+发画布」三动作执行回执） |
| R | 37 PASS / 2 BLOCKED | 37 / 2 | 无新增（视频四工具均为复用既有任务，无新生成） |
| H | 13 PASS / 26 PARTIAL | **18 / 21** | +5（下表） |

## 三、H 可升 PASS 的 5 个（均已提交、含 reload 或 IDB 机器回执）

| 工具 | 证据路径（相对 `docs/V1.0/plan_linkfox_navigation/`） | 关键实测 |
|---|---|---|
| AI_DRESSING_XSY | `evidence/real-acceptance/AI_DRESSING_XSY_20261029_persist/reload-summary.json`、`canvas-persist-check.json`、`provider-receipt.json` | 真实 200；task-mvtbf7ue-n28x46 1576288B；reload 后 dock 1 + grid 1 + 下载按钮可用；重下 sha `a52e70d4…4a8a94` 与原件一致；发画布 reload 后 projects 1 / images 1 |
| SALE_VIDEO | `evidence/real-acceptance/VIDEO_4TOOLS_HISTORY_20261029/SALE_VIDEO.dock-after-reload.json`、`idb-byte-check.json` | `nav:"reload"`；3 行（1 成功 2 失败含 404 原文）；页面 blob 与 IDB 双路 1366190B、sha `39193f0a…` 逐字节一致 |
| IMAGE_TO_VIDEO | 同目录 `IMAGE_TO_VIDEO.history-after-reload.json` | `nav:"reload"`；1 行 failed，配置快照 + 上游 `NoSuchKey` 原文（失败可回溯，同 VIDEO_CONCAT 口径） |
| VIDEO_REPLICATION | 同目录 `VIDEO_REPLICATION.history-after-reload.json` | `nav:"reload"`；1 行 failed + 配置快照 + `api.cc-ai.xyz/videos HTTP 404` |
| AI_VIDEO_EDITING | 同目录 `AI_VIDEO_EDITING.tasks-localStorage.json`、`panel-after-fix.json`、`idb-byte-check.json` | 7 行与 store 一一对应；2268656B sha `47573c14…`；点「查看结果」后 `<video data-testid="tool-result-video">` + 三按钮 enabled |

> 待 R8 复核一点：`IMAGE_TO_VIDEO` / `VIDEO_REPLICATION` 仅失败任务，若 R8 采用「失败任务不算 H」的更严口径，则 H 为 **16/23**（去掉这两个）。

## 四、H 仍不可 PASS（21 项）与缺口类型

**A. 有文字纪要、无机器回执（0d1eaaa，R8 只需补原始 JSON 即可判）**
`PRODUCT_REFINE`、`PRINTING_REPAIR`、`HAND_REPAIR`、`AI_OUTPAINTING`、`IMAGE_CROP`
证据仅 `evidence/real-acceptance/HISTORY_FRESH_RELOAD_5TOOLS.md`。已核：五条 taskId（task-mvtb3nuj-3d0mnv 等）在仓库内**只出现在 `r7-d19-history-20261029/*.json` 的 `indexIds` 全量索引数组**，不在任何工具的 DOM 行里 → 无行级回执，**不得判 PASS**。

**B. 已提交的冷启取证（`9873bb4` 落盘证据 + `5fc2e69` 补 PRODUCT_SCENE 表面）**
`evidence/r7-d19-history-20261029/tool-*.json`（13 份）、`product-scene-surface.json`、`REPORT.md`
13 个工具里只有 4 个有真实行，其余 9 个为「dock 存在但 0 条（空态文案正确）」——**空态不是 H 证据**。

| 工具 | dock 行数 | 内容 | 可判性 |
|---|---|---|---|
| HANDHELD_GOODS | 1 | failed 2026-10-28 21:34（0 结果 + 配置快照） | 按 VIDEO_CONCAT 口径可判 H=PASS（仅失败任务）；索引自愈前不可见，`0b9aecf` 后可见 |
| PRINT_EXTRACT | 1 | failed 2026-10-28 21:25（0 结果） | 同上 |
| IMAGE_TEXT_EDIT | 1 | succeeded 但 `payloadDropped`（`storageKey:null`、`url:""`） | 行级恢复成立、产物可用性为 0 → 仍 PARTIAL |
| AI_POSE_GENERATOR | 5 | 1 成功（同 payloadDropped）+ 4 failed | 归 design19_b 范围，D19 报告自行不判定 → 仍 PARTIAL |
| 其余 9 个（AI_DRESSING_V2/AI_POSTURE/AI_WEARABLE/MATERIAL_UPPER_BODY/NEW_DESIGNER/NEW_REPLACE_BG_V2/PRODUCT_MARKET_MATERIAL/REPLACE_GOODS/PRODUCT_SCENE） | 0 | 无真实任务 | 无历史可恢复，H 无证据 |

**C. 仍无可用回执（沿用 R7 PARTIAL）**
`AREA_REPAIR`、`REMOVE_PEN`（注入验证）、`VIDEO_TRANSLATION`（注入验证；且 R 亦 BLOCKED）、`NEW_REPLACE_BG_V2`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`AI_DRESSING_V2`、`AI_WEARABLE`、`MATERIAL_UPPER_BODY`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`AI_POSTURE`

> 合计 H 剩余：A 5 + B 4 + C 12 = 21 项，与第二节 21 一致。

## 五、F 仍 PARTIAL（16 项，均缺「三动作执行回执」）

`CHANGE_COLOR_V2`、`IMAGE_TRANSLATION`、`CHANGE_COLOR`、`PRODUCT_REFINE`、`HAND_REPAIR`、`REPLACE_GOODS`、`PRODUCT_SCENE`、`PRINT_EXTRACT`、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`、`IMAGE_TO_VIDEO`、`SALE_VIDEO`、`VIDEO_REPLICATION`、`AI_VIDEO_EDITING`、`VIDEO_TRANSLATION`、`VIDEO_CONCAT`

- 典型：`SALE_VIDEO` 下载 sha 已实测一致，但「存入资产 / 发画布」仍只记在 `SALE_VIDEO_20261029/FOLLOWUP_20261029.md` 文字里（无 JSON/DOM 回执）；本轮 `0a6d2c8` 只证明了按钮 `disabled=false`（**可用 ≠ 已执行**），故 F 不得升。
- 视频四工具同样：dock 里三按钮 enabled 但无 click → 下载落盘/资产记录/画布节点回执。

## 六、R 仍 BLOCKED（2 项）

`VIDEO_TRANSLATION`、`VIDEO_CONCAT`：无成功产物字节；本轮所有视频证据均为既有任务复用，未产生新成片。

## 七、证据质量问题（R8 引用前必读）

1. **字段误判**：`AI_DRESSING_XSY_20261029_persist/reload-summary.json` 中 `reDownload.bytesMatchOriginal=false`，但同条 `bytes=1576288`、`sha256=a52e70d4…` 与 `state.json.resultSha` 完全一致 → 该布尔是脚本比对变量写错，**以字节/sha 为准**，R8 应修正比对逻辑而非采信该字段。
2. **时序冲突**：`ec74701`（17:0x）判 `AI_POSE_GENERATOR` 0 条，而 `0b9aecf` 索引自愈后 D19 探针同工具 5 条 → 「0 条」部分是 `tool-task:v1:index` 丢条导致的假阴性，不能当作「该工具从无历史」。
3. **并发推进**：核对开始时 D19 的 13 份 `tool-*.json` 只是 staged；核对过程中被 `9873bb4` 提交、`5fc2e69` 补表面证据，HEAD 已前进。引用时以 `9873bb4` 为准，勿再说「未提交」。
4. **按钮可用性瑕疵**：`IMAGE_TEXT_EDIT` 的历史成功项 `payloadDropped` 时，「下载/存入资产/发画布」仍为可点，点了才报「原始文件未保留…请重新生成」——属明确失败而非静默假成功，但无字节时应置灰（D19 报告建议由 owner 统一决策，未改）。
5. **口径一致性**：失败任务能否算 H=PASS，R7 对 `VIDEO_CONCAT` 判过 PASS，本报告据此给 IMAGE_TO_VIDEO/VIDEO_REPLICATION 记 PASS；若 R8 收紧，需三处一起改。

## 八、R8 最小待办

1. D19 证据已入库（`9873bb4`/`5fc2e69`），直接按「失败任务可回溯」口径判 HANDHELD_GOODS / PRINT_EXTRACT 是否记 H=PASS（并同步第三节的严格口径开关）。
2. 为 0d1eaaa 五工具补原始 JSON（现有 MD 已含 storageKey 与字节，重跑一次读 DOM 即可），否则保持 PARTIAL。
3. 对 9 个「0 条」工具各跑 1 次真实任务（生成＝照常计费），再 reload 取 dock 行 + 字节。
4. F 项统一补「下载落盘 / 资产记录 / 画布节点」三动作 JSON。
5. 修 `bytesMatchOriginal` 比对 bug；跑 `tools/independent_evidence_audit.py` 出 r8 矩阵，勿手改状态。

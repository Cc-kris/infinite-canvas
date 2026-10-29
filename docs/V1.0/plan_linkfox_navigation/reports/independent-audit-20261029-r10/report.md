# R10 独立复核：严格三腿矩阵（39 工具）

- 审计对象（committed tree）：`3f772a9`（`feat/linkfox-v1-real`）；基线 `d596c25`(R9) + `434bc44`(R9 crosscheck)
- 生成：2026-10-29；审计器：`tools/recompute_scope_matrix_r10.py`（继承 R9，只补映射与归因，不放宽判定）
- 证据源：`git ls-tree HEAD` 内已提交文件；工作区未提交内容一律不计
- 本报告**未生成任何新证据、未改业务源码、未派 worker**

## 1. 结论总览

| 维度 | 分布 |
| --- | --- |
| F | PASS 28 / PARTIAL 11 |
| T | PASS 32 / PARTIAL 7 |
| R | PASS 35 / PARTIAL 2 / BLOCKED 2 |
| **H** | **PASS 22 / PARTIAL 17**（R9 13 → crosscheck 19 → R10 **22**） |
| K | PASS 12 / N/A 27 |
| U | PASS 39 |

R10 相对 R9（`d596c25`）共 **9 项改判，全部 PARTIAL→PASS，无一项回退**：

| 工具 | 来源 | 关键证据 |
| --- | --- | --- |
| AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN / SCENE_TRANSFER | crosscheck 映射修复（`dockItems` 数组观测） | `real-acceptance/B2G1/<TOOL>/run-b2g1.json` 的 `g1.afterReload`（storageKey+bytes+sha256）+ 同目录 `downloaded-*.png` 实算 sha 逐位相同 |
| AI_POSE_GENERATOR / NEW_DESIGNER | crosscheck 映射修复（`navType=reload` + 字节） | `suite-design-realgen-20261029/*` |
| **AI_DRESSING_V2** | 新提交证据（`c39ad37`+`c2246ce`） | `task-mvtgeodr-5vx7tw`（succeeded）+ `"fresh_reload"`（CDP Page.reload）+ `stored_bytes:[2115031]` ↔ `result1_live_20261029.png` 2115031B / sha `860007f2…` |
| **AI_WEARABLE** | 新提交证据（`c39ad37`+`c2246ce`） | `task-mvtglxwi-ys0y85` + `"fresh_reload"` + `stored_bytes:[1247574]` ↔ `result1_live_20261029.png` 1247574B / sha `0cf9444…`；下载动作落盘 sha 一致 |
| **SALE_VIDEO** | R9/crosscheck 均漏读的字节字段（本次补 `fetchedSha256`） | `SALE_VIDEO.dock-after-reload.json`（`nav=reload` + `rows[0].results[0].media.fetchedBytes=1366190` / `fetchedSha256=39193f0a…`）↔ `SALE_VIDEO_20261029/sale-video-task-mvt76u6p.mp4` 同尺寸同 sha |

> 关键校验：以上 7 项中每一项的「声明字节」都由仓库内该工具已提交产物**实际复算**校验过尺寸；含 sha 声明的还做了 sha256 逐位比对（AI_TEXT `9019ffaf…`、ORNAMENT_TEXT `d7a57b9b…`、SDS_DESIGN `a119eb6c…`、SCENE_TRANSFER `dfb33c53…`、AI_DRESSING_V2 `860007f2…`、AI_WEARABLE `0cf9444…`、SALE_VIDEO `39193f0a…`）。

### 1.1 R10 相对 crosscheck（19）的增量

crosscheck 已把 6 项漏读纠正为 PASS，但仍有 3 个映射点未覆盖；R10 补齐后多出 3 项：

1. reload 节点写的是 `"fresh_reload": {…}`（snake_case），不在 R9 的 reload 节点白名单；
2. 刷新后观测是 `history_card_status: "succeeded"` + `stored_bytes: [<n>]` + `result_img_in_card: 1`，而 R9 的观测正则只认 `dockItems/rows/items` 这类对象数组；
3. 字节 sha 字段名是 `sha256_browser` / `sha256_on_disk` / `fetchedSha256`，R9 只认 `sha256/sha/digest`；且产物声明节点没有 `fileName/file/storageKey` 提示字段，被 artifact 候选过滤掉。

R10 因此新增：`fresh_reload` 节点识别、`stored_bytes`/`history_card_status` 观测、`sha256_browser`/`sha256_on_disk`/`fetchedSha256` 键，以及**带路径的 artifact 声明**（`result.*` / `actions.download.*` / `rows.results.media.*`）。**对账口径不变**：仍要求同尺寸，声明 sha 时必须同 sha。

### 1.2 归因修正（结论不变，只改原因文字）

| 工具 | 旧原因 | R10 原因（回执原文） |
| --- | --- | --- |
| IMAGE_TEXT_EDIT | 记为「task 失败」 | `H4-real-20261029/IMAGE_TEXT_EDIT.json`：`verdict=BLOCKED(payload)`、`payloadDropped=true`、`storageKey/bytes=null` —— 自然恢复链路成立但结果字节未入库 |
| REMOVE_PEN | 记为「task failed」 | `edit8-h-real-20261029/REMOVE_PEN.json`：有 3 条 succeeded 任务，但 `payloadDropped=true`（字节未入库）；`018a6e1` 已如实记录 |
| CHANGE_COLOR_V2 | 记为「无 reload」 | 同上：`task-mvsc4fyg-qobp8k` succeeded 但 `payloadDropped=true`，且无 fresh reload 回执 |
| PRODUCT_MARKET_MATERIAL | 记为「仅在自由文本出现」 | `tool-product-market-material.json`：`dockToolId=PRODUCT_MARKET_MATERIAL`、`count="0 条"`、`rows=[]`、`storedTasks=[]` → **countForTool=0**，该工具压根无任务 |

## 2. 判定口径（R10 未放宽）

PASS 必须同时满足三腿，且全部取自**已提交**字节：

1. **taskId 绑定**：真实 `task-mv*`，来自 primary 指针（`taskId` / `data-task-id` / localStorage 快照键），非 failed、非 synthetic（`b5-*` / `task-real-*` 不计）；
2. **fresh reload 标记 + 刷新后观测**：`phase/navType=reload`、`reload|fresh_reload` 对象节点、或 `Page.reload()/location.reload()` 回执；且同一回执内出现刷新后观测（`dockItems/rows/stored_bytes/restoredPanel/result_img_in_card`），并指向同一 task 或其结果字节/sha；
3. **字节**：下载/资产/画布字节须由该工具的已提交产物按**同尺寸**校验；声明 sha256 时须**同 sha**。

排除项照旧：`recovery|inject` 目录、`快照回填`（`backfill`）、`payloadDropped=true`、失败/未确认任务。

## 3. 剩余 17 项缺口清单（按可推进性排序）

| 类型 | 工具 | 缺口 |
| --- | --- | --- |
| 有 reload 采集但字节不可复核 | PRODUCT_IMAGE_SUITE（2840825B）、DRESS_WEAR_SET（2516552B） | 回执声明字节，但仓库内无同尺寸同 sha 的该工具产物 → 补一张已提交 result PNG 即可转 PASS |
| 任务真实但 payloadDropped | IMAGE_TEXT_EDIT、REMOVE_PEN、CHANGE_COLOR_V2 | 需「结果入库修复后」的一条新真实任务，重新走 reload + 三动作 |
| 无该工具任务快照 | PRODUCT_MARKET_MATERIAL（countForTool=0）、NEW_REPLACE_BG_V2、REPLACE_GOODS、PRODUCT_SCENE、PRINT_EXTRACT | 需该工具一次真实提交（生成）后采集；其中 PRODUCT_SCENE 的历史字节缺口与 crosscheck 结论一致 |
| task 失败/未确认 | HANDHELD_GOODS、IMAGE_TO_VIDEO、VIDEO_REPLICATION、VIDEO_CONCAT | 需成功任务后重采 |
| 无机器 reload 标记 | FISSION_LINK、AI_VIDEO_EDITING、VIDEO_TRANSLATION | 有真实 task，缺 `Page.reload` 级回执 |
| 无证据 | VIDEO_TRANSLATION | 证据包无该工具回执 |

K 维度 27 项 N/A 仍属「证据包未覆盖该模型/渠道回执」，非失败。

## 4. 风险与可复现性提示（R10 新增）

1. **B2G1 四项的历史任务已不在当前 live 任务库**：`d66e690` 的只读取证显示 `AI_TEXT/ORNAMENT_TEXT/SDS_DESIGN` 的 `tool-task:v1:*` 键与 IDB 记录在当前 profile 中零命中（`dockRows=0`）。这不否定已提交回执（当时的真实 reload + 下载产物仍在仓库中，且 sha 可复算），但**无法在今天原地重放**；R10 依据「已提交证据 + 可复算字节」判定，不依赖当前 live store。
2. **SALE_VIDEO 的刷新后字节来自页面内 `fetch(blob)` 回读**（`fetchedBytes/fetchedSha256`），属机器观测而非 UI 元信息，已与仓库内 mp4 同尺寸同 sha 对账；其 `visibilityState=hidden` 导致的 `<video>` duration 不可读不影响字节判定。
3. `434bc44` 之后 HEAD 前进到 `3f772a9`（仅测试 fixture 类型修复），不影响证据口径；R10 明确记录审计 HEAD。

## 5. 复现

```bash
python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r10.py            # 生成 matrix.json/matrix.md
python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r10.py --debug --only AI_DRESSING_V2 AI_WEARABLE SALE_VIDEO
```

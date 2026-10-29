# R14 只读独立复核（R14-review）

- 复核对象：HEAD `6ca29da`（`feat/linkfox-v1-real`）中的 R14 矩阵
  - 矩阵：`docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r14-matrix/matrix.{json,md}`
  - R14 审计树：`e78f634`；基线：R13 `7069b84`；审计器：`tools/recompute_scope_matrix_r14.py`
- 复核方式：**只读**。未改任何源码、未改矩阵文件、未重跑工具、未派 worker；全部结论由 HEAD 树内回执 JSON + 磁盘字节/sha 实算复核。

## 1. 结论（39 工具）

R14 入库统计（原样引用，未改动）：

| 维度 | PASS | PARTIAL | 其它 |
| --- | --- | --- | --- |
| F | 33 | 6 | — |
| T | 39 | 0 | — |
| R | 37 | 2 | — |
| H | 31 | 8 | — |
| K | 12 | 0 | N/A 27 |
| U | 39 | 0 | — |

复核后**唯一需要回正的单元格**：`NEW_DESIGNER / R`（PARTIAL → 应为 PASS，见 §3.1）。回正后 R = 38 PASS / 1 PARTIAL；其余 15 个非全绿单元格**维持**。

> 回正依据是判据文本本身（R：回执声明字节可由**已提交产物**按尺寸或 sha256 复核）+ 对产物的实算，**不是放宽判据**；对 F 未做任何放宽（见 §3.2）。

## 2. 最小剩余清单（12 工具 / 15 单元，精确到工具+维度）

| # | 工具 | 维度 | 缺的那一腿（唯一硬缺口） | 最小闭环动作 | 阻塞类型 |
| --- | --- | --- | --- | --- | --- |
| 1 | HAND_REPAIR | F | 只有 download 一条动作回执；存资产/发画布无机器回执 | 同一真实 task 补点「存入资产库」「发送画布」，回执含 assetStore 增量 + canvas node | 动作覆盖不足 |
| 2 | NEW_DESIGNER | F | `c034fae` 已闭环代码腿，但**修复后无三动作机器回执**（现有回执只有 UI 文案 ID，无 assetStore/canvas 结构化字段） | 修复后复点一次，落 machine JSON（assetCount 前后 + project/node id + 三动作 bytes） | 代码已修，缺回执 |
| 3 | VIDEO_REPLICATION | F | 只有 download；且该下载回执声明 1297168B 与本工具已提交产物 2277978B 不同尺 | 重跑一次真实任务，三动作回执 + 产物同尺同 sha | 上游阻塞+动作覆盖 |
| 4 | AI_VIDEO_EDITING | F | 只有 download 一条动作回执 | 与 H 同一轮重跑后补存资产/发画布 | 动作覆盖不足 |
| 5 | VIDEO_TRANSLATION | F | 上游 `/videos` 只收 JSON、拒上传字节（400），无成功样例可挂动作 | 修上传链路或换端点，跑通 1 次后补三动作 | 上游接口阻塞 |
| 6 | VIDEO_CONCAT | F | `af0522f` 已修 storageKey→字节还原，但**修复后**存资产 `tool_assets` 0 条同尺、`media_files` 无该 storageKey、`canvasVideoNodes=[]` | 修复后复点「存入资产」+「发送画布」，回执需见落库字节（非页面文案） | 代码已修，缺回执 |
| 7 | VIDEO_REPLICATION | R | 回执声明 1297168B，本工具已提交产物仅 2277978B（1297168B 属 IMAGE_TO_VIDEO 产物，不能跨工具顶替） | 与 #3 同轮重跑后落同尺产物 | 同上 |
| 8 | CHANGE_COLOR_V2 | H | 历史真实任务 `payloadDropped=true`，items 无 storageKey/url/bytes → 无字节可三动作 | 重跑 1 次（0a20bff 映射已修）拿非降级 items + reload 绑定 | 数据侧 payload 丢失 |
| 9 | REMOVE_PEN | H | 回执内 3 处 `payloadDropped: true`，无字节 | 重跑 1 次（5743ea8 已支持 storageKey-only） | 数据侧 payload 丢失 |
| 10 | HANDHELD_GOODS | H | 唯一落库任务刷新中断记 failed，无字节无 sha | 重跑 1 次拿 succeeded + reload 回执 | 任务态失败 |
| 11 | PRINT_EXTRACT | H | 落库任务 failed（刷新中断），无字节 | 重跑 1 次 | 任务态失败 |
| 12 | IMAGE_TEXT_EDIT | H | H4-real 回执 `payloadDropped=true`（BLOCKED(payload)） | 重跑 1 次（24165da 已修 hydrate） | 数据侧 payload 丢失 |
| 13 | PRODUCT_SCENE | H | 无带 `taskId`/`data-task-id` 绑定的成功任务（`storedTasks=[]`，indexIds 里仅自由文本提及） | 跑 1 次真实任务并让结果区暴露 taskId 绑定 + fresh reload 回执 | 无成功任务/无绑定 |
| 14 | VIDEO_REPLICATION | H | 任务 `task-mvtk9pu3-sfifnh` running→上游 CF 502（Ray a52288ee4b94c5bf），无终态 | 上游恢复后重跑 1 次（禁注入/禁快照回填） | 上游阻塞 |
| 15 | AI_VIDEO_EDITING | H | 任务 `task-mvtkgo4b-gaomk5` failed，无 upstream 产物 | 重跑 1 次 | 任务态失败 |

最小动作归并：

- **代码已修、只差回执（2 格）**：`NEW_DESIGNER F`、`VIDEO_CONCAT F` → 各复点一次即可闭合。
- **一次重跑可清多格**：`VIDEO_REPLICATION F/R/H`（3 格）、`AI_VIDEO_EDITING F/H`（2 格）。
- **数据侧 payload 丢失（4 格）**：`CHANGE_COLOR_V2 H`、`REMOVE_PEN H`、`HANDHELD_GOODS H`、`IMAGE_TEXT_EDIT H` → 各重跑 1 次。
- **任务态 failed（2 格）**：`PRINT_EXTRACT H`、`AI_VIDEO_EDITING H`。
- **上游链路阻塞（2 格）**：`VIDEO_TRANSLATION F`（400 拒字节）、`VIDEO_REPLICATION H`（CF 502）。
- **无成功任务/无绑定（1 格）**：`PRODUCT_SCENE H`。
- **动作覆盖不足（2 格）**：`HAND_REPAIR F`、`AI_VIDEO_EDITING F`。

## 3. 与 R13/R14 的 delta（只用 committed evidence）

### 3.1 `NEW_DESIGNER / R`：R14 仍记 PARTIAL，属**陈旧误判**（应为 PASS）

- 判据文本：`R = 回执声明字节须能由已提交产物复核（尺寸或 sha256）`。
- 回执：`docs/.../evidence/real-acceptance/H4-real-20261029/NEW_DESIGNER.json`
  - `task.declaredBytes = 411801`，`imageBytes.sha256 = 90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88`，`matchTaskBytes = true`
- 已提交产物：`docs/.../evidence/suite-design-realgen-20261029/new-designer-result-1.png`
  - 实测 **411801 B**，sha256 **90e28e0f…**（逐位相同）。独立实算，非引用矩阵结论。
- 该产物自 `5f41f91`（2026-10-29 18:08:59）入库，且**已在 R13 树 7069b84 内**（`git cat-file -s 7069b84:…` = 411801）→ R13 原注"回执声明 411801B 无同尺寸已提交产物"自始不成立；R14 未复查，只把理由改写为"请求腿无修复后回执支撑落盘一致性"，该要求**不在判据 R 文本内**，属判据漂移（收紧）。
- 另一份回执 `real-acceptance/NEW_DESIGNER/result.json` 声明 32854B/sha `2ee5aa7b300b…`，其产物 `result.png` 实测 32854B/sha `2ee5aa7b300b…` —— 同样可复核。
- 结论：**R = PASS**。若确要引入"请求腿落盘一致性"这一新口径，必须显式声明为 R′ 并对 39 工具全量重算（会连带影响其它 R PASS 的依据），不能在单工具上静默收紧。

### 3.2 未放宽判据的三处自查（避免"凑绿"）

- `PRODUCT_IMAGE_SUITE / F`：b4-actions.json 有真实 `assetCountBefore 0 → After 1`、`lastAsset.id=UYp_dv-uc0hSomtg1eSDm`、`bytesMatch.same=true`（2151517B）→ PASS 站得住。
  - 但需记录**证据覆盖边界**：`e78f634` 文档自述修复前结果卡"保存"只上传媒体未入作品库（假回执），而 b4 回执的反馈文案是"已存入资产库（image · …）"（另一条面板级按钮路径），**两者不是同一按钮**。因此 PIS F 绿不构成对"逐条保存"路径的证明；`e78f634` 的修复后真实回执（assetId `iWK4VVTJEg96zsnpGmGFA` / project `Y8Og23eXg0atwd4BdFmTB` / node `image-1793280885550-zk9ly` / 2785837B）**只写在 markdown 里、无 machine JSON**，故不予吸收、也不改判。
- `NEW_DESIGNER / F`：不因 `c034fae` 升 PASS。修复提交只动 3 个源码文件（`tool-result-actions.ts` / `designer.tsx` / `new-designer.ts`），**无修复后机器回执**；把 UI 文案里的 ID 当"机器字段"会放宽 F 的既有硬口径（其它工具 F PASS 均带 assetStore 前后增量），**不采纳**。
- `VIDEO_CONCAT / F`：`af0522f` 的 IDB 复核结论是"存资产 62 条中 0 条 2133234B、media_files 无该 storageKey、canvasVideoNodes=[]"，只有下载一条硬腿 → PARTIAL 正确。

### 3.3 复核确认成立的 R14 改判（4 处）

- `IMAGE_TO_VIDEO / H` PASS：`reports/independent-audit-20261029-r16/evidence/receipt-fresh-reload-sequence.json` 含 `steps.freshLoad`（机器全新加载）+ `persistedTask`（`task-mvtjhbcg-e8lnin` succeeded、`payloadDropped:false`、storageKey、1266723B）+ `panelAfterReload`；同提交 `verify-store.json` 显示 asset `vT7_AZTJmExCSJO3_dt3j`、canvas 项目 `c86DFKiJXDkVfHFgz5-jP` 含 video 节点、`mediaBlobs` 与下载同为 1266723B → 三腿同尺，满足 H 判据。
- `PRODUCT_IMAGE_SUITE / T`、`VIDEO_TRANSLATION / T`：对 HEAD blob 独立复扫 `web/src/components/tools/workspaces/suite.tsx`（84207B）与 `video.tsx`（142440B），关键词"暂无优秀案例/暂无真实案例/案例库未接入/敬请期待/即将上线/算力/积分/LinkFox"**各 0 命中**，与 R14 一致。
- `PRODUCT_MARKET_MATERIAL / T`：**未做独立代码复扫**——HEAD 中不存在 `workspaces/market.tsx`（`git cat-file -s HEAD:…` NOT-IN-HEAD），R14 该格证据为回执 `real-acceptance/PRODUCT_MARKET_MATERIAL/receipt.json`（页面级文案实测），本轮沿用 R14 结论、不额外背书。

## 4. 独立实算记录（全部在本机 HEAD 树上完成）

| 对象 | 实测 |
| --- | --- |
| `suite-design-realgen-20261029/new-designer-result-1.png` | 411801 B / sha256 `90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88`（= 回执 imageBytes sha） |
| `real-acceptance/NEW_DESIGNER/result.png` | 32854 B / sha256 `2ee5aa7b300b…`（= result.json 声明） |
| `real-acceptance/NEW_DESIGNER/step-2-canvas.png` | 36509 B |
| `VIDEO_REPLICATION/link-mode/out.mp4` | 2277978 B（≠ 回执声明 1297168B） |
| `git ls-tree -r HEAD --long` 中 1297168B 的唯一产物 | `real-acceptance/IMAGE_TO_VIDEO/06-result-video.mp4`（**跨工具，不能顶替 VR**） |
| `edit8-h-real-20261029/REMOVE_PEN.json` | 3 处 `"payloadDropped": true`（与 PARTIAL 一致） |
| `r7-d19-history-20261029/tool-product-scene.json` | `storedTasks: []`、`hasDock: false`（无成功任务可绑，与 PARTIAL 一致） |
| `PRODUCT_IMAGE_SUITE/b4-actions.json` | `assetCount 0→1`、`bytesMatch.same=true`、2151517B（F PASS 有效） |

## 5. 证据卫生（不改变本轮判据，但影响后续吸收）

1. `e78f634`（PIS 逐条保存真入作品库）**只有 markdown 回执**，无 machine JSON → 下一轮若要吸收为 F 加固证据，需补 `assetId / projectId / nodeId / bytes / sha` 的结构化回执文件。
2. `recompute_scope_matrix_r14.py` 的 `NOTE_REFRESH14` / `EXTRA_NOTE14` 会在产物已可复核时仍保留旧结论（`NEW_DESIGNER R` 即此类）；建议审计器对每个 PARTIAL 增加"产物字节/sha 自动对账"断言，避免人工备注与实算脱节。
3. 工作区存在未提交的 `reports/independent-audit-20261029-r9/matrix.*` 与 `project_memory.md` 变更（非本轮产生，**未纳入**本提交）。

## 6. 边界声明

- 本轮**未修改任何源码**，未改 R13/R14 矩阵文件，未重跑任何工具、未注入/未重生成任务、未派子 worker。
- 唯一产出为本目录（只读复核报告）。所有"应为 PASS"的表述均限定在**既有判据文本 + 已提交产物实算**范围内。

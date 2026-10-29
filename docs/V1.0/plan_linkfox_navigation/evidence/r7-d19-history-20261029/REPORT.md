# R7 · design19（13 工具）历史取证报告 · 2026-10-29

范围（本 worker 独占，不碰 AI_DRESSING_XSY / POSE·FLITE 归属 design19_b）：
NEW_REPLACE_BG_V2 / REPLACE_GOODS / PRODUCT_SCENE / HANDHELD_GOODS / AI_DRESSING_V2 /
AI_POSTURE / AI_WEARABLE / PRINT_EXTRACT / AI_POSE_GENERATOR / IMAGE_TEXT_EDIT /
MATERIAL_UPPER_BODY / NEW_DESIGNER / PRODUCT_MARKET_MATERIAL

约束遵守：只复用真实任务；**未注入、未重跑、未新建任务、未派子 worker**；每个工具都是
`Page.navigate` 硬导航（等价 fresh reload）后等 hydrate 再读 DOM + localStorage。

环境：ego lite Profile 1 → `http://127.0.0.1:3000`（vite dev，HMR 生效）；
专用标签 `1709629220`（我自己开的，收工关闭）。

## 一、发现并修复的共享缺陷（已提交 0b9aecf）

**任务索引与实际数据键失配 → 历史坞永久丢真实任务。**

- 现场：`localStorage` 有 53 个 `tool-task:v1:task-*`，`tool-task:v1:index` 只剩 38 个 id。
- 后果：15 条真实任务（含本批 PRINT_EXTRACT / HANDHELD_GOODS 的 2 条）在历史坞里
  **永远不可见**，且刷新不会自愈——`readPersistedTasks` 只信索引。
- 修法：索引 ∪ 实际键取并集；新增 `healTaskIndex()` 在 hydrate 前校正索引；
  `TASK_MAX_PERSISTED` 50→100（否则自愈后立刻裁掉最老真实任务）；memoryStorage 补 key/length。
- 真机验证：同一工具页硬导航后 index 38→53，HANDHELD_GOODS 由「0 条」变「1 条」
  （2026-10-28 21:34 失败任务行）。
- 单测 4/4，`tsc --noEmit` 干净。

## 二、13 工具逐项取证（冷启后）

| 工具 | 路由 | 历史表面 | 冷启条数 | 真实任务 | 结论 |
|---|---|---|---|---|---|
| NEW_REPLACE_BG_V2 | /tools/product-design/new-replace-bg-v2 | dock | 0 条 | 无 | 空态文案正确，表面可用 |
| REPLACE_GOODS | /tools/product-design/replace-goods | dock | 0 条 | 无 | 同上 |
| PRODUCT_SCENE | /tools/product-design/product-scene | 右栏「历史记录」页签（WORKSPACE_OWN_HISTORY，页底不挂 dock） | 0 条 | 无 | 点开页签后 dock `data-tool-id=PRODUCT_SCENE`，空态文案正确；`product-scene-surface.json` |
| HANDHELD_GOODS | /tools/product-design/handheld-goods | dock | **1 条** | failed 2026-10-28 21:34 `default::gpt-image-2` 0 结果 | 修复前不可见→现可见，展开有配置快照+输入素材 |
| AI_DRESSING_V2 | /tools/product-design/ai-dressing-v2 | dock | 0 条 | 无 | 空态正确 |
| AI_POSTURE | /tools/product-design/ai-posture | dock | 0 条 | 无 | 空态正确 |
| AI_WEARABLE | /tools/product-design/ai-wearable | dock | 0 条 | 无 | 空态正确 |
| PRINT_EXTRACT | /tools/product-design/print-extract | dock | **1 条** | failed 2026-10-28 21:25 `default::gpt-image-2` 0 结果 | 修复前不可见→现可见；展开「该任务没有结果项」 |
| AI_POSE_GENERATOR | /tools/product-design/ai-pose-generator | dock | 5 条 | 5 条（1 条 dropped） | **他人范围**（design19_b），本报告仅落盘 `tool-ai-pose-generator.json`，不判定 |
| IMAGE_TEXT_EDIT | /tools/product-design/image-text-edit | dock | **1 条** | succeeded 2026-10-28 22:48 `default::gpt-image-2` 1 结果 | 唯一成功行，但字节已被策略剥离 |
| MATERIAL_UPPER_BODY | /tools/product-design/material-upper-body | dock | 0 条 | 无 | 空态正确 |
| NEW_DESIGNER | /tools/product-design/new-designer | dock | 0 条 | 无 | 空态正确 |
| PRODUCT_MARKET_MATERIAL | /tools/product-design/product-market-material | dock | 0 条 | 无 | 空态正确 |

## 三、历史结果可用性（真机动作，非读码）

IMAGE_TEXT_EDIT 那条成功任务：item = `{payloadDropped: true, storageKey: null, url: ""}`，
界面上仍显示「下载 / 存入资产 / 发送到画布」。**真机点击「下载」**：

- 行内黄字：`原始文件未保留（历史快照只存元数据），如需文件请重新生成。`
- 点击后红字反馈：`结果字节已被持久化策略剥离（刷新后不保留原始文件），请重新生成后再保存。`

→ 属**明确失败**而非静默假成功（`assertResultPayload` 抛出 `ToolResultActionError("payload-dropped")`），
但按钮未在无字节时置灰/隐藏，属可用性瑕疵（用户要先点一次才知道）。**未改**：改按钮可见性会影响
所有工具的历史坞样式与既有 testid 语义，超出本批自限范围，建议由 owner 统一决策。

成功路径（有字节时下载/入库/发画布）：本批 13 个工具的真实历史**不存在**「成功且保留字节」的任务，
无法在不重新生成的前提下取得真机证据；已用仓库既有单测补齐回归面：

```
bun test src/components/tools/tool-result-actions.deps.test.ts \
         src/components/tools/tool-result-actions.hydration.test.ts
→ 8 pass / 0 fail（含「发画布水合竞态」对照组缺陷可复现）
```

## 四、结论

1. 13 个工具的历史表面（dock 或自带 tab）**全部存在且在冷启后正确渲染**（9 个空态文案正确，3 个有真实行）。
2. 取证期间发现并修复共享缺陷「索引失配导致真实历史永久不可见」，已提交 `0b9aecf` 并附单测，
   修复前后同页对比可复现。
3. 本批真实数据现状：13 个工具共 4 条历史（3 失败、1 成功但字节被剥离），
   因此「下载/入库/画布」的真机成功路径无法在禁重跑约束下取证——已在报告中标注为缺口，
   由有成功字节的任务归属方补证。

## 五、复现命令

```bash
cd web && ~/.bun/bin/bun test src/stores/use-tool-task-store.index-heal.test.ts   # 4 pass
cd web && PATH=/opt/homebrew/bin:$PATH ./node_modules/.bin/tsc --noEmit            # 干净
python3 docs/V1.0/plan_linkfox_navigation/evidence/r7-d19-history-20261029/capture_d19_history.py
```

证据文件：`capture-summary.json`、`tool-<slug>.json`（13 份）、`PROBE_NOTES.md`。

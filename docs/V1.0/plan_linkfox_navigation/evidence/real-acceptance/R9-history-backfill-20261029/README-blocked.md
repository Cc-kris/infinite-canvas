# R9 三腿补录：物理阻断记录（AI_TEXT / ORNAMENT_TEXT / SDS_DESIGN）

- 时间：2026-10-29
- origin：http://127.0.0.1:3000（服务 200 在线，Vite dev）
- 执行方式：真实 Chrome（Galley CDP bridge，`tabs create` + `Page.close`，只读 JS）
- 约束遵守：**未注入、未新生成任何任务、未改审计器**（`tools/recompute_scope_matrix_r9.py` 的既有未提交改动未被触碰）

## 结论（一句话）

三条被要求复用的历史任务在当前浏览器 profile 中**已不存在**，且这三个工具在任务库里**一条任务都没有**，
因此「真实整页 reload → 历史坞/结果面板观测 → 真实下载 bytes+sha」三腿**无法在不新生成的前提下补齐**。

## 目标与期望（来自 R9 矩阵 H_note）

| 工具 | primary taskId | 结果存储键（receipt 记录的） | R9 现状 |
|---|---|---|---|
| AI_TEXT | `task-mvsdhatp-kdyvt6` | `tool-result:IHXDX5ekYGw5A5g9zPYm3` | H=PARTIAL（有 afterReload 声明，缺刷新后观测绑定） |
| ORNAMENT_TEXT | `task-mvsdivlg-6slebs` | `tool-result:fwfbptF9hIuRm4lozH8J4` | H=PARTIAL（同上） |
| SDS_DESIGN | `task-mvsdlqxd-ttx3pl` | `tool-result:LOADB6TqqrfGBPU2BYCfF` | H=PARTIAL（同上） |

## 物理取证（全部为真实运行，非推断）

1. **live localStorage 全量**（新开 127.0.0.1:3000 标签）：78 键，其中 `tool-task:v1:task-*` 66 条；
   三个 taskId 的**键名与键值**均零命中；三个 `tool-result:*` 键 `getItem()` 均为 `null`。
2. **IndexedDB 全库全值扫描**：`canvas-assets` / `infinite-canvas` / `localforage` / `tool-assets`
   四个 store 的 cursor 全值 `indexOf` 六 ID → 零命中。
3. **按工具维度统计**：66 条任务的 `toolId` 里没有 `AI_TEXT` / `ORNAMENT_TEXT` / `SDS_DESIGN`
   （即这些工具的历史坞应为空；页面内也确为 `dockRows = 0`）。
4. **磁盘旁证**（排除“只是没进 live 库”）：Chrome `Default`、`Profile 1`（含 `Local Storage/leveldb`）、
   `Citro Labs/ego lite` 的 `Profile 1`/`Profile 2`、仓库工作区、`/tmp` ——
   `grep -a -r "mvsdhatp"` 均零命中。

原始机器数据：[probe.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/R9-history-backfill-20261029/probe.json)

## 现有可复用资产（下次直接接着跑）

- [r9_history_probe3.py](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/tools/r9_history_probe3.py)
  —— 三路由只读取证（新开标签 → 读任务库/历史坞 → 关自己开的标签），已跑通。
- [r9_history_backfill.py](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/tools/r9_history_backfill.py)
  —— 补录主驱动骨架（`tabs create` / `cdp Page.reload` / 页面 JS 通道已验证可用）。
- 验证过的通道能力：`{"cmd":"tabs","method":"create"}` 开标签、`{"cmd":"cdp","method":"Page.reload","tabId":N}`
  真实整页 reload、`{"cmd":"cdp","method":"Page.close","tabId":N}` 收尾。

## 待用户决策（三选一）

1. **提供承载任务的浏览器 profile**（这三条任务在哪个 profile / 是否被清理过），我在该 profile 下重跑三腿；
2. **换现存真实任务**：指定这三工具当前实有任务，或允许我从其它工具的真实任务里挑同构样本补齐三腿；
3. **解除“禁止新生成”**：允许我为这三工具各跑一次真实生成（真实上游），再按 `Page.reload` 全链路取证。

## 风险提示

- 若强行用 `localStorage.setItem` 回填这三条任务 = 注入，**明确禁止**，本次未做；
- 审计器不做任何改动：三工具将保持 H=PARTIAL，直到上述决策落地。

# HAND_REPAIR 收尾结论：PARTIAL（真实出图 PASS；存库/发画布/下载 未取证）

日期：2026-10-29 · 分支 `feat/linkfox-v1-real`

## 1. 已通过的部分（真实出图）

- `run-edit6.json`：`POST http://127.0.0.1:23210/https://api.cc-ai.xyz/v1/images/edits` → **200 / 30093ms**
- 结果图：`https://oss-us.dimenoss.com/images/2026/10/28/1793199487_1ae76b65bdf7c0c415e9fed0e8025f06.png`
- `result.png` 1024×1024 / 1353583B / sha `3e53cf331d5dae4b`，与源图 sha `6fa693cbc2a1bf08` **不同**（非回显）
- 刷新后 `images: 2 / hasResult: true`
- 结果 DOM 里三个动作按钮均渲染且 `disabled=false`：`hand-repair-save-1`、`hand-repair-send-1`、「下载」

## 2. 未通过 / 缺失

| 门禁 | 状态 | 证据 |
| --- | --- | --- |
| 存库 → assetId | **缺失** | `run-actions.json`（16:19:23Z 起）300s 超时未拿到结果，未点击；`ui-error.png` |
| 发画布 → projectId | **缺失** | 同上 |
| 下载 → download 事件 | **缺失** | 按钮可点但本轮未落盘 download |
| `assets.png` / `canvas.png` | **缺失** | 需前两项真实点通后才能回验 |

## 3. 为什么不补跑（不重复生成）

用 Browser Control 在真实 Chrome（`origin http://127.0.0.1:3000`）直接查了持久化状态，
结果落在 `browser-control-probe.json`：

- `persistedTaskTotal: 31`，其中 `HAND_REPAIR` / `AREA_REPAIR` 任务 **0 条**
- `tool_assets` 共 35 条，`hand-repair` 来源资产 **0 条**（`anyRepairAssets: 0`）

即：没有可复用的已完成任务或已入库资产，补齐 存库/发画布 只能**重新生成一次**。
主会话明确「禁止重复生成」，故如实记 PARTIAL，不伪造点击证据。

## 4. 一处需要澄清的旧记录

`run-actions.json` 里 `fixtureSha256 == resultSha256 == 6fa693cbc2a1bf08`、`bogusSourceEcho: true`、
`ok: false`。那是**源图被当成结果回显**的假阳性一次，与 `run-edit6.json` 的真实出图无关；
本次结论以 `run-edit6.json` + `result.png` 为准。`result.json` 已把该次记为无效。

## 5. 补齐 PARTIAL 的最小步骤（供主会话决定，需允许一次生成）

1. `node web/scripts/real-acceptance/run-repair-actions.mjs --tool HAND_REPAIR`
   （把门禁等待上限从 300s 提到 ≥600s，上游单张约 30s，超时是运行方等待时间不足）
2. 脚本会真点 `hand-repair-save-1` / `-send-1` 并回验 `/assets`、`/canvas/<projectId>`，
   落 `assets.png` / `canvas.png` 后再把本文件结论从 PARTIAL 改 PASS。

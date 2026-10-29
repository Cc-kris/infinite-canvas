# R14 PRINT_EXTRACT（印花提取）本组盘点：无成功任务 / 无绑定字节，H 维持 PARTIAL

- 日期：2026-10-29｜分支 `feat/linkfox-v1-real`｜环境 `http://127.0.0.1:3000`（vite，真实 canvas-proxy 23210）
- 约束：本轮不新生成、不注入、不改任务库；只读盘点 + 一次 fresh reload
- 机器回执：`evidence/real-acceptance/PRINT_EXTRACT/r14-inventory-no-success-20261029.json`

## 1. 任务库盘点（localStorage `tool-task:v1:task-*`）

- 共 69 条任务；`toolId=PRINT_EXTRACT` 仅 **1** 条：`task-mvs5dd71-4s35w2`
- 状态 `failed`，`hasResultItems=false`，`error.code=submit-unconfirmed`（页面刷新中断，`retryable=true`，需人工对账，防重复扣费口径正确）
- `sourceAssetIds=["8I3lM9-V5fu7BXCkvEJ2N"]`（真实源商品图），`clientOperationId=ac4810bf-93e1-4e3a-80d0-282eeab11d22`
- **succeeded 的 PRINT_EXTRACT 任务：0 条**

## 2. IDB 扫描（同源）

| store | 行数 | PRINT_EXTRACT 命中 |
| --- | --- | --- |
| infinite-canvas/tool_assets | 62 | 0 |
| infinite-canvas/image_files | 102 | 0 |
| infinite-canvas/media_files | 103 | 0 |
| infinite-canvas/app_state | 39 | 1（工具注册表/页面状态文本，非产物） |

结论：本 profile 没有该工具的结果资产、没有可复原的结果字节。

## 3. fresh reload 实测（机器可读）

```json
{"navType":"reload","reloadAt":"2026-10-29T13:51:51.006Z",
 "panel":{"taskId":"task-mvs5dd71-4s35w2","status":"failed"},
 "resultImages":0,"actionButtons":[]}
```

刷新后结果区按落库任务重建（58d0be2 的修复生效：taskId 与失败终态都在），但没有结果项，因此 **下载 / 存入资产 / 发送到画布 三动作没有可作用对象**——这是数据事实，不是按钮缺失。

## 4. 磁盘上的真实产物（不可用于 H）

| 文件 | 字节 | sha256 | taskId 绑定 |
| --- | --- | --- | --- |
| `evidence/real-acceptance/PRINT_EXTRACT/result_url_download.png`（10-28 18:44 上游 200 下载） | 686174 | `804be5318a8c0b13e1e681ccbaa5be72e6acc6f11e6a43f1635d48de9a06b14b` | 无 |
| `design19b-nv-final/_runs/run-PRINT_EXTRACT-1793254199616.json` | 662813 | `34423454ae6bdb3d9a46dc0d…`（asset `4TeztYaVANIEKxLkiuQs-` / node `OvybpLZ7-wZ5YJsnzBdUC`） | 无 |
| `design19b-nv-final/_runs/run-PRINT_EXTRACT-1793255818347.json` | 630238 | `7d95732cc6a7a1ed8d117550…`（asset `yU_TPCyuZUfUp3EuALdor` / node `PZhTU1hJn2X6Eeq41Eqsc`） | 无 |

后两条来自**另一个 Chrome profile** 的 harness 运行（本 profile IDB 对这两个 assetId / nodeId 扫描 0 命中），且记录里没有 taskId，不满足 H 的「taskId primary 绑定 + 同源观测」判据。

## 5. 代码侧结论（为什么本轮不改代码）

- 成功任务的路径：`printExtractResultPanelTask(toolTasks)` → 共享 `ToolResult` → `downloadResultItem / saveResultItemToAssets / sendResultItemToCanvas`（三动作均带 `hydrateResultItemBytes` 复原真实字节），刷新后由落库任务重建面板。
- 失败任务路径：无 result items，`ToolResult` 渲染失败态（诊断码 + 人工确认提示），不渲染三动作——符合口径。
- 未发现与三动作相关的明确根因；按「只修明确根因」原则，本轮不改代码，也未跑无关改动。

## 6. 交接

- H 维持 PARTIAL，需接续组用一条**真实成功**的 PRINT_EXTRACT 任务（taskId 落库 + 结果字节）做一次 fresh reload 后三动作回执：`taskId + 字节 sha256 + assetId + canvasNodeId` 四项同时可复核即可收口。
- 本条失败任务的 `submit-unconfirmed` 属上游已受理未知，重试前需服务商后台对账，禁止自动重发。

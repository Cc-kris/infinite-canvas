# r17b 复用既有真实任务 · fresh reload 三动作回执（2026-10-29）

## 结论
`BLOCKED_NO_LOCATOR`：CHANGE_COLOR_V2 / REMOVE_PEN 两条既有真实任务在 fresh reload 后仍然无字节、无可反查定位符，
下载按钮 disabled，存入资产 / 发送画布不可达。**6ede584 + a565e63 的修复本身已在运行期生效**（见下），
失败原因是这两条任务在修复前的落库版本里地址与字节同时被剥离，属不可逆历史损失，不需要再打补丁。

## 实测（不是读码）
| 项 | CCV2 | REMOVE_PEN |
| --- | --- | --- |
| taskId | task-mvsc4fyg-qobp8k | task-mvsa3pt6-4wqy46 |
| fresh reload 路由 | /tools/ecommerce-suite/change-color-v2 | /tools/smart-edit/remove-pen |
| 快照 item | `{id,kind,payloadDropped:true}` | `{id,kind,payloadDropped:true}` |
| URL / storageKey | 无 / 无 | 无 / 无 |
| media_files 反查 | `tool-result:task-mvsc4fyg-qobp8k:*` → 0 条 | `tool-result:task-mvsa3pt6-4wqy46:*` → 0 条 |
| UI 证据 | 历史行「原始文件未保留…」 | `tool-history-dock-payload-dropped` 同文案，下载图片 disabled |
| 上游仍存活 | 200 / 1,115,668B / sha256 dd56d504… | 兄弟任务 200 / 850,799B / sha256 67d5d6a6…（另一条 404）|

## 修复生效证据（同一浏览器、同一 reload 会话）
- `typeof (await import("/src/stores/use-tool-task-store.ts")).healResultMediaByProvenance === "function"` → true。
- 两条**修复后**创建的真实任务在 reload 后仍有字节：`task-mvtlxua2-kh39uf`（PRINT_EXTRACT，2,783,996B）、
  `task-mvtly3vu-fdqgy7`（PRODUCT_SCENE，2,398,828B），storageKey 均为新方案 `tool-result:<taskId>:0:<nanoid>`，payloadDropped=false。
- 全库 39 条 succeeded：30 项有 storageKey、9 项 dropped（7 个工具，全部产生于修复前）、**0 项 urlOnly** →
  新自愈链路的 url 分支在既有数据里没有输入，无法用历史任务跑到。

## 未完成 / 风险
- 三动作（下载 / 存资产 / 发画布）对这两条任务物理不可达，assetId / canvasNodeId 均为 null。
- 唯一可行的恢复方式：把上游仍存活的真实产物回灌到这两条历史项（属于写存储 = 注入边界），需主控授权后另开一轮。
- 机器回执：[receipt.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r17b-20261029-reuse-fresh-reload/receipt.json)

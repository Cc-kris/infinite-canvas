# R14-H 腿实测回执（CHANGE_COLOR_V2 / REMOVE_PEN）：BLOCKED_NO_BYTES

机器回执：[receipt-BLOCKED.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r14h-20261029/receipt-BLOCKED.json)

## 一句话结论

两条工具确有**真实 succeeded 任务**，但结果项在历史落盘时被剥成 `{id,kind,payloadDropped:true}`，本机**不存在对应真实字节**（103 条 media blob 中无 1,115,668B / 850,799B），因此 fresh reload 后历史行没有可下载/可入库/可发画布的字节源；在"不新生成、不注入"约束下**无法**产出 `assetId` / `canvasNodeId` 回执。**这是实测到的真实阻塞原因，不是没做。**

## 关键事实（可复核）

| 项 | CHANGE_COLOR_V2 | REMOVE_PEN |
|---|---|---|
| primary taskId | `task-mvsc4fyg-qobp8k` | `task-mvsa3pt6-4wqy46`（另两条 succeeded：`task-mvsaus49-i7vsmt`、`task-mvsba8fo-iplfjq`） |
| status | succeeded（1793205308288） | succeeded（1793202144236） |
| result.items | `[{id:"…-0",kind:"image",payloadDropped:true}]` | 同形态 |
| storageKey / url / bytes / upstreamTaskId | 全部缺失 | 全部缺失 |
| 历史真实字节（磁盘） | `real-acceptance/CHANGE_COLOR_V2/05-unit1-result.png` 1,115,668 B | `real-acceptance/B5_HISTORY_DOCK/recovery4/downloads/REMOVE_PEN-remove-pen-result-1.png` 850,799 B |
| 上游持久地址是否还活 | **是**：`https://oss-us.dimenoss.com/images/2026/10/29/1793205308_f2532a74dca46886316b645a820d05c7.png` → HTTP 200 / 1,115,668 B / sha256 `dd56d50404c37c6ab740919fb31a63186ada6cabd914ed411974c0cb8db1562b` | 证据中**未留**该任务的结果地址 |

- 本机 `IndexedDB infinite-canvas / media_files`：103 条（png 54 / jpeg 27 / mp4 22），前缀 `tool-result:` 26、`tool-asset:` 40、`video:` 4，**均不含上述两个字节数**。
- `storageKey` 规则 `tool-result:<nanoid>` **不含 taskId** → 即使字节还在也无法按任务 provenance 反查。
- `tool_assets` / `app_state(asset_store, canvas_store)` 中亦无这两条结果（`850799`/`1115668` 字符串 0 命中）。

## 根因（代码层，已确认非"功能缺失未实现"）

`web/src/stores/use-tool-task-store.ts` 的字节链路是完整的：
- `ingestResultMedia()` 成功即写 `media_files` 并回填 `storageKey/bytes/mimeType`；
- `restoreResultMediaUrls()` hydrate 后按 `storageKey` 还原对象 URL；
- `healPersistedTaskMedia()` 对"只有远程地址"的历史任务补做一次真实入库；
- 文件内注释明确：批量工作台（套图/换色）若不经 `getPersistedToolGateway()`，任务只进内存端口，刷新即丢。

这批历史记录属于**旧版本已剥离落盘**的形态：既未入库，也没留下 durable url，故链路修复对它们无字节可救。修复只对**新任务**有效（本次不允许新生成，故无法以此产生回执）。

## 可放行的两条路径（需主控拍板，本次未执行）

- **A. 上游回捞（复用真实 task，不生成）**：CCV2 的持久结果地址仍 200 且 sha 与历史回执一致，可原样入库后跑三动作；REMOVE_PEN 需先找到它自己的 durable url（当前证据里没有）。
- **B. 用已落盘真实结果图回填**（850,799B / 1,115,668B，sha 可与历史对账）后 fresh reload 验三动作 —— 风险：属"向存储写字节"，复核方可能判定为注入。

## 环境与合规说明

- 服务 `http://127.0.0.1:3000` 200；CDP 9333 直连 502，通道走 `web_execute_js`。
- `window.open` 被弹窗拦截、`Target.createTarget` 因目标标签已被调试器占用失败 → 未能新建自有标签；所有读取均在既有标签 `1709629290` 上**只读**完成（未导航、未点击、未改数据），未动任何他人标签。

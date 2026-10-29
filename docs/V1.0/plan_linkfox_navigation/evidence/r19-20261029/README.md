# r19 CHANGE_COLOR_V2 / REMOVE_PEN 真实 UI 复跑回执（吸收共同字节修复后）

时间：2026-10-29 22:0x（本地）｜执行者：单 worker（未派子 worker，未注入任何结果字节）

## 0. 本轮前提

- 共同字节持久化修复已落地并吸收：`6ede584`（image.ts 保留 b64+远程 url；gateway.imageResultItems 双落；
  file-storage 结果键改 `tool-result:<taskId>:<index>:<nano>` + `listTaskResultMedia`；store 增
  `healResultMediaByProvenance` / `mergeWithoutStorageKeyDowngrade`），证据文档 `a565e63`。
- 本轮**未改动任何源码**（未发现这两个工具自身的适配缺陷需要修；共同根因由上述提交覆盖）。

## 1. 路由纠错（本轮实测）

| 期望 | 实际 |
|---|---|
| `/tools/product-design/change-color-v2` | **404 页面不存在** |
| `/tools/ecommerce-suite/change-color-v2` | 正常（registry `CHANGE_COLOR_V2_ROUTE`） |
| `/tools/smart-edit/remove-pen` | registry `REMOVE_PEN_ROUTE`（本轮未跑） |

## 2. CHANGE_COLOR_V2：真实 UI 提交一次（拒绝注入）

真实操作路径（逐点真实 UI，无脚本构造数据）：

1. 打开 `/tools/ecommerce-suite/change-color-v2`，复用页面既有**真实草稿**：
   商品图 `linkfox-case-2069709136760979456-source.jpeg`（41 KB · 569×639 · image/jpeg，来自 linkfox 案例。
   「从作品库/从商品库」两个入口在本机为 disabled）。
2. 换色 `#EB88A0`，换色部位 `上装`，品质 `中品质`，预计输出 1 张。
3. 真实点击「开始生成」（DOM 真实事件链 mousedown/mouseup/click；此前一次 CDP Input 点击未生效，无任务产生）。

### 2.1 真实 taskId 与终态（原始记录，未加工）

- taskId：`task-mvtm1ebp-ajdzk7`
- clientOperationId：`0d8c3e8b-148a-456e-9d83-b21ac3540db6`
- fingerprint：`d56a6b915f368588`
- createdAt / submittedAt：`1793282398405`（同一毫秒，attempts=1）
- finishedAt：`1793282637966`（提交后约 240s）
- **终态：`failed`**
- error（原文）：`submit-unconfirmed` ——「页面刷新中断了这次请求，本服务无法反查上游是否已受理。已关闭为失败；重试前请先到服务商后台确认，避免重复计费。」
- `reconcileRequired: true`，`pollCount: 0`，`result: null`，items 为空
- 提交快照（configSnapshot）：`capability=image, model=default::gpt-image-2, apiFormat=openai, size=1:1, quality=medium, count=1, channelId=default`
- prompt（原文）：「对上传商品图「linkfox-case-2069709136760979456-source.jpeg」做换色：把上装改成色值 #EB88A0。
  保持商品轮廓、结构、缝合线、材质纹理、Logo 位置、光照方向、投影与背景不变；不要增加或删除任何部件。
  整张图其余区域保持原样，输出一张与原图同构图、同视角的图片。 输出品质：中品质。」

### 2.2 失败原因（如实归因，不粉饰）

提交确实发出（submittedAt 与 createdAt 同刻、attempts=1），但在轮询窗口内**承载该任务的页面被刷新**，
store 的提交看门狗据此判为「无法确认上游是否受理」并落 `failed`，且标记 `reconcileRequired`。
本轮期间浏览器标签 session id 发生整轮更替（原先承载 CCV2 的标签 id 330 消失、330 被复用到微信标签），
与「页面被刷新」的现象一致；**这是本轮环境事实，不是这两个工具的业务逻辑缺陷**。

### 2.3 真实字节 / 三动作

- IndexedDB（`media*` 库，键前缀含 `task-mvtm1ebp` 或 `tool-result:`）：**0 条**。
  即该任务没有产生任何结果字节，`result` 为 null。
- 因此「下载 / 存资产 / 发画布」三动作**无对象可验**：结果区为空，按钮不存在。
  **如实记为未验证（NOT_VERIFIED，无结果对象）**，不以任何方式补造。
- 失败态原始记录已保存：`task-mvtm1ebp-ajdzk7.raw.json`（本目录）。

## 3. REMOVE_PEN：本轮未产生新真实任务

- 本轮配额与轮次用于 CCV2 的真实复跑与收口，REMOVE_PEN **没有发起新的真实提交**。
- 该工具既有事实（`r14h` 证据 + 本次基线复核）：历史 5 条任务中 3 条 succeeded 但
  `items[].payloadDropped=true` 且 `storageKey/bytes/dataUrl/url` 全空，2 条 failed。
  这一「成功却无字节」正是 `6ede584` 修复的共同根因，**但 REMOVE_PEN 端尚未在新修复下做真实复跑取证**。
- 结论：REMOVE_PEN 维持 **PARTIAL / 未复跑**，不做任何 PASS 宣称。

## 4. 基线（吸收修复前的对照数据，同一份读数）

| toolId | 任务数 | succeeded | 其中 payloadDropped 无字节 |
|---|---|---|---|
| CHANGE_COLOR_V2 | 5 | 1 | 1（`task-mvsc4fyg-qobp8k`） |
| REMOVE_PEN | 5 | 3 | 3（`task-mvsba8fo-iplfjq` / `task-mvsaus49-i7vsmt` / `task-mvsa3pt6-4wqy46`） |

真实环境另有 CCV2 失败任务 `task-mvsc7s58-2rrnqz` 等，均为 `submit-unconfirmed` 同类刷新中断。

## 5. 下一步（交接，不声称已完成）

1. 需要一次**不被刷新打断**的 CCV2 真实提交：提交后不得导航/重载承载页面（本轮即被刷新打断）；
   已有 `reconcileRequired` 的任务在服务商后台核对是否计费后，才允许重试。
2. REMOVE_PEN 需在其真实画笔 UI 上涂抹生成蒙版（白色=消除区域）后提交，再按 `tool-result:<taskId>:<index>:*`
   前缀复核 IDB 真实字节，并 fresh reload 验证 provenance 自愈是否把字节挂回 item。
3. 三动作（下载 / 存资产 / 发画布）必须在**有真实结果字节**的前提下逐项验，缺一记 FAIL。

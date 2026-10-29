# CHANGE_COLOR_V2 提交确认与历史任务主定位修复（2026-10-29）

## 一、根因（代码级）

### R1 `recover()` 把「等待」和「未发出」都写成 submit-unconfirmed

`web/src/services/api/tools/gateway.ts` recover()：

1. `planRecovery()` 在 `SUBMIT_GRACE_MS=60s` 内给出 `action: "wait"`，但 recover() 只判断
   `plan.action === "none"` 后就直接进 closeUnconfirmed 分支 —— 宽限期形同虚设，
   点「开始生成」后 60s 内刷新/新标签 recoverAll 就会把仍在飞行的请求判死
   （cross-tab 用例 `lf_pose_real_generate` 已记录同类误关）。
2. 任务没有 `upstreamTaskId` 时一律 closeUnconfirmed("submit-unconfirmed")，
   **无法区分「请求已发往上游」与「刷新发生在组包/校验阶段、上游根本没收到」**。
   真实证据：本地 `tool-task:v1:*` 中 task-mvtm1ebp-ajdzk7 / task-mvsc7s58-2rrnqz
   与 task-mvsb41o4-obzwag 均为 `failed + submit-unconfirmed + reconcileRequired:true`，
   但快照里没有任何「已发出」的痕迹 → 提示用户去服务商后台对账，属于过度告警。

### R2 历史任务结果定位只看 `url`，忽略 `storageKey`

`web/src/components/tools/tool-task-history.tsx`：

- `taskHasRecoverableResult()` 与缩略图筛选均只判断 `Boolean(item.url)`。
- 结果项持久化时 `url` 被剥离、只留 `storageKey`（`tool-result:<taskId>:<index>:<seed>`）
  与字节数；刷新后 url 由 store hydrate 重建。
- 因此「刷新后仍有磁盘字节」的健康任务在历史坞里被判成
  「原始文件未保留」→ 没有「查看结果」入口 → 下载 / 存资产库 / 发画布
  三个动作在历史里不可达（旧任务 BLOCKED_NO_LOCATOR 的 UI 侧成因）。

## 二、改动

| 文件 | 改动 |
| --- | --- |
| `web/src/services/api/tools/task-machine.ts` | `ToolTask` 新增 `dispatchedAt?: number`（请求真正发往上游的时刻，老快照缺省=未发出） |
| `web/src/services/api/tools/gateway.ts` | ① `executeImage()` 调用 provider 前同一 tick 打点 `dispatchedAt`；② `recover()` 对 `plan.action === "wait"` 直接返回，不结案；③ 无 upstreamTaskId 时按 `dispatchedAt` 分流：未发出 → `submit-not-dispatched` + `reconcileRequired:false`；已发出 → `submit-unconfirmed` + `reconcileRequired:true`；④ `closeUnconfirmed()` 增加 `options.reconcileRequired` |
| `web/src/components/tools/tool-task-history.tsx` | 新增 `hasResultLocator(item)`（`url || storageKey`），`taskHasRecoverableResult` 与 dropped 提示均改用它 |
| `gateway.recovery.test.ts` / `gateway.cross-tab-recovery.test.ts` | 断言更新为新语义；cross-tab 的 seed 显式写入 `dispatchedAt`（这些场景语义是「请求已在飞行」），新增宽限期内 wait 用例与 not-dispatched 用例 |

## 三、验证

### 3.1 静态与单测

- `bunx tsc --noEmit -p tsconfig.json` → 退出码 0，无输出。
- `bun test gateway.recovery / gateway.cross-tab-recovery / gateway.result-items / tool-task-history / use-tool-task-store.provenance-heal`
  → **30 pass / 0 fail，116 expect()**。

### 3.2 真实 UI 生成（无注入，真实 provider）

- 页面：`http://127.0.0.1:3000/tools/ecommerce-suite/change-color-v2`
- 商品图：`linkfox-case-2069709136760979456-source.jpeg`（569×639，41 KB）
- 方案：从商品图提色 → 换色 `#EB88A0`，部位「全身」，中品质
- 点击「开始生成」后上游真实返回：

| 字段 | 值 |
| --- | --- |
| taskId | `task-mvtml34y-cd8qm6` |
| status | `succeeded` |
| submittedAt | 1793283317026 |
| dispatchedAt | 1793283317028（新增打点，证明请求确已发出） |
| finishedAt | 1793283351063（耗时 34.0s） |
| result.items[0].kind | `image` |
| result.items[0].storageKey | `tool-result:task-mvtml34y-cd8qm6:0:AsA6O0mww0klbp7uv39Z6` |
| 字节数 | **2,445,799 B**（UI 显示 2388 KB） |
| url | 持久化快照中已剥离（符合设计），刷新后由 storageKey 还原 |

### 3.3 fresh reload 三动作（同一标签页 `Page.reload({ignoreCache:true})`）

刷新后 DOM 实测（`web_execute_js` 取真实节点）：

- 结果区文案：「已从本地恢复上次生成的真实结果（任务 cd8qm6 · 1 张），下载/存资产库/发画布均按库内字节执行。」
- 缩略图：`blob:` 源，`naturalWidth × naturalHeight = 1024 × 1024`（真实解码成功）
- 三个动作按钮均挂载且 `disabled === false`：
  - `data-testid="color-v2-restored-download"` → 下载
  - `data-testid="color-v2-restored-save"` → 存资产库
  - `data-testid="color-v2-restored-send"` → 发画布
- 历史坞中该条为「已完成 · 1 个结果」，与旧任务「原始文件未保留（历史快照只存元数据）」形成对照，
  证明 storageKey 定位符修复后历史条目可正常定位结果。

> 说明：下载动作会触发浏览器下载交互，未在无头上下文中强制落盘核验；
> 三动作的可用性以按钮 enabled + 结果字节可从 storageKey 还原（1024×1024 真实解码）为证据。

## 四、保留未动的现状（如实）

- 旧任务 `task-mvsc4fyg-qobp8k`（succeeded，2026-10-29 00:34）结果项
  **既无 url、也无 storageKey、IndexedDB 无对应字节**（已遍历 `canvas-assets` / `tool-assets` /
  `infinite-canvas` / `localforage` / `tool-result:*` 全部存储域确认）→ 不可逆，按禁止注入要求不做补造。
- 旧 failed 任务（task-mvtm1ebp-ajdzk7 / task-mvsc7s58-2rrnqz / task-mvsb41o4-obzwag）
  保留原 `submit-unconfirmed + reconcileRequired:true` 终态，不回改历史快照。
- 修复只影响**新任务**的定性：未来刷新不会再把「未发出」误报为「可能计费」。

## 五、结论

- 提交确认语义已可区分「已发出 / 未发出」，宽限期不再被绕过（R1 修复）。
- 历史任务结果定位改用 `url || storageKey`，刷新后健康任务三动作可达（R2 修复）。
- 真实 UI 生成一次成功，taskId/终态/字节/storageKey 与 fresh reload 行为均已留证。

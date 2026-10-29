# r25 — REMOVE_PEN 真实任务 `task-mvtmnhk5-nr2g0z` 字节考古：物理缺口确认（无字节 → 只提交原始失败）

- 日期：2026-10-29
- 基线 commit：`0dc21b06`（本目录仅新增证据，**源码零改动**）
- 约束：未派 worker、未重新生成、未注入任何字节；未新增/伪造 sha。
- master 指令：立即停止全盘扫描，提交已找到的真实 sha/机读回执**或**真实缺口后退出 → 本轮结论为**真实缺口**。

## 1. 待定位对象（来自 r20 / 4d42080e，非本轮生成）

| 字段 | 值 |
| --- | --- |
| taskId | `task-mvtmnhk5-nr2g0z` |
| 结果项 | `...-0`（kind=image） |
| storageKey | `tool-result:task-mvtmnhk5-nr2g0z:0:komJnSXgwkxdOFeQHXTGI` |
| bytes（r20 实测） | `2440825` |
| sha256 | **不可得**（本轮再次实测确认字节不在任何可读位置） |

## 2. 逐项物理探测（每条都是实跑命令 + 实测输出）

| # | 探测 | 命令（要点） | 实测结果 |
| --- | --- | --- | --- |
| 1 | r20 运行实例的 profile 是否还在 | `ls -d /tmp/ic-profile /private/tmp/ic-profile` | `No such file or directory`（两个路径都不存在） |
| 2 | r20 当年到底用了哪个 profile | `grep -n launchPersistentContext /private/tmp/ic_run2.mjs /private/tmp/ic_run4.mjs` | 均为 `chromium.launchPersistentContext('/tmp/ic-profile')` → 即上条那个已被删除的目录 |
| 3 | APFS 本地快照能否救回 | `tmutil listlocalsnapshots /` | `Snapshots for disk /:` 后**空**（无任何本地快照） |
| 4 | 磁盘上是否存在 2440825 字节的产物文件 | `find $HOME /tmp /private/var/folders -xdev -type f -size 2440825c` | **0 命中**（`/tmp/ic_download.png`、`~/Downloads/public_input-erased.png` 均不存在） |
| 5 | 临时目录里是否残留任务/字节 | `rg -a -uu -l "mvtmnhk5" /private/tmp` | 仅命中文本证据：`ic_tasks.json`、`ic_task_latest.json`、`ic_run4.mjs/.json` 与 `ic-snap-*` 仓库快照里的 md/json —— **零 leveldb/blob 命中** |
| 6 | 真实浏览器 profile 是否存在该任务（IDB + LocalStorage） | 先 `find ~/Library -maxdepth 9 -type d -name "http_127.0.0.1_3000.indexeddb.leveldb"` 定位，再 `rg -a -uu -l "mvtmnhk5\|komJnSXgwkxdOFeQHXTGI"` 扫该 profile 的 `IndexedDB/` 与 `Local Storage/` | 命中的真实 profile 共 3 处：`Google/Chrome/Profile 1`、`Citro Labs/ego lite/Profile 1`、`Citro Labs/ego lite/Profile 2`（后者另有 `http_localhost_3000`）→ **三处全部 0 命中** |
| 7 | 是否被删进废纸篓可捞 | `ls ~/.Trash` | `Operation not permitted`（本进程无「完全磁盘访问」）→ **唯一未覆盖的残余可能，记为风险而非证据** |

## 3. 结论（机器可复核）

1. `task-mvtmnhk5-nr2g0z` 的记录与字节**只存在于 r20 那次一次性 Playwright profile `/tmp/ic-profile`**，该目录连同 `/tmp/ic_download.png` 已被清理且无快照可回滚。
2. 三个真实浏览器 profile 的 `127.0.0.1:3000` IndexedDB / LocalStorage 中，**搜不到该 taskId 或该 storageKey 的任何字节** —— 即“换对 profile 再读一次”这条路径已被实测排除，不是找错了库。
3. 因此 `storageKey` 只是**已失效的定位符**（其指向的 IDB Blob 已随 profile 一起消失），sha256 与「下载 / 存资产 / 发画布」三动作的真实字节验证**在本机物理上不可能完成**。
4. 按任务约束：**只提交原始失败**（BLOCKED_NO_BYTES），不重新生成、不注入字节、不以 `B5_HISTORY_DOCK` 里那份 850799B 的孤立下载冒充本任务产物。

## 4. 代码侧核对：没有新的可修根因

| 位置 | 现状 | 判定 |
| --- | --- | --- |
| `web/src/services/api/tools/task-machine.ts` `sanitizeTaskForPersist` | 已有 G1 分支：`item.storageKey || url` → 保留 storageKey/bytes 且清 `payloadDropped`；只有「纯内存 dataUrl/blob 且未落库」才标 `payloadDropped:true` | 正确，无需改 |
| `web/src/services/api/tools/gateway.ts` `imageResultItems` | 已有 B7 分支：provider 返回的 `https://` dataUrl 归一为持久 `url` | 正确，无需改 |
| `web/src/services/api/tools/result-assets.ts` | `payloadDropped` 正当阻断三动作 | 按设计正确 |

结论：本轮**没有明确根因可修**（旧任务的字节丢失是历史快照时序 + 运行实例被删，不是当前代码缺陷），因此不改源码、不引入风险改动。

## 5. 闸门（实跑）

- `web/node_modules/.bin/tsc --noEmit` → **exit 0**（日志 `/tmp/r25-tsc.log`）
- `bun test src/services/api/tools/result-assets.test.ts src/services/api/tools/task-machine.test.ts` → **51 pass / 0 fail / 192 expect**
  - 备注：`src/features/tools/adapters/remove-pen.test.ts` 不在仓库该路径（bun 报 2 files），相关 remove-pen 用例由既有 `mask.test.tsx` 覆盖，本轮未改相关代码故未重跑 UI 层用例。

## 6. 机读回执

- [receipt-remove-pen.machine.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/r25-real-task-bytes-gap-20261029/receipt-remove-pen.machine.json)

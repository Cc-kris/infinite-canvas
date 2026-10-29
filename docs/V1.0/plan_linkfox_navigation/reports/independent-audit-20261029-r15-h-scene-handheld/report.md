# R15：PRODUCT_SCENE / HANDHELD_GOODS H 格复核（只读探测 + 机器回执）

- 环境：`http://127.0.0.1:3000`（vite dev，PID 80431）；任务库 `localStorage tool-task:v1:*`（useToolTaskStore）；字节库 IndexedDB `infinite-canvas/media_files`
- 本轮规则：不新生成、不注入、不派子 worker；只用**已存在**的真实任务与真实图片字节做判定
- 结论：两格 H **仍为 PARTIAL**，且**未改源码**（缺口不是可修的代码缺陷，见 §3）
- 机器回执：[receipt.json](file:///Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/reports/independent-audit-20261029-r15-h-scene-handheld/receipt.json)

## 1. 现场探测结果（机器可读）

| 项 | PRODUCT_SCENE | HANDHELD_GOODS |
|---|---|---|
| 工具落库任务数 | **0** | 1 |
| taskId | 无 | `task-mvs5p8g8-or3oim` |
| status / items | — | `failed` / `0` |
| 错误 | — | `submit-unconfirmed`（刷新中断） |
| 结果区可绑定任务 | 无 | 有，但 items 为空 → 三动作不可点 |
| 历史坞条目 | 0（「本工具还没有历史任务」） | 1（失败项） |
| IDB 是否仍有真实结果字节 | 否（1421980B 不在 media_files） | 是（`tool-asset:HxIvmLcx48GX5RKHrrcPH`、`tool-asset:KCjvumCNW4N7sDdhTBlae` 各 1060068B） |

任务库共 69 条，toolId 全集 28 个，**不存在 PRODUCT_SCENE**；因此不存在"real task 落在别的 toolId 下"的常量错配，也没有可改的映射缺陷。

## 2. 真实图片与已发生过的三动作（历史证据，非本轮）

- PRODUCT_SCENE：`evidence/real-acceptance/PRODUCT_SCENE/result1.png`，1421980B，1024×1024，sha256 `260071186391d7d05d364c969394797194855f377974f5f9d513bfec08a5d256`
  - 已有三动作回执：`evidence/design19-nv-20261029/actions/PRODUCT_SCENE.json`（2026-10-29T05:03Z）→ 下载 1421980B、资产 `p3pucsdT3htpEzvu5fyfu`、画布工程 `VZNxUX71lxMHOLs_i3t5Z` / 节点 `image-1793250210617-8rsms`
  - 但那是**历史坞项的临时态**，刷新后坞项消失（今日 19:11 复核 itemCount=0），字节也不在 IDB，无法在 fresh reload 后复现。
- HANDHELD_GOODS：`evidence/real-acceptance/HANDHELD_GOODS/result.png`，1060068B，720×960，sha256 `fbb05871e134260c198dc4624b8b78e9d3ef2972854ba83646f5396dc7efd081`
  - 已有三动作回执：`evidence/real-acceptance/HANDHELD_GOODS/b4-actions.json`（2026-10-28T17:39Z）→ 三条腿均 1060068B、资产 `KZgy-xw_ySIshJW3_h9q9`、画布 `f13JWJ-cRpB0hL_4SMoXN`/`image:Ml5H-qndVKYJohx8mWGEF`
  - 同一批字节今天仍在 IDB，但**没有任何任务的 `result.items[].storageKey` 指向它们**（任务在刷新时被判 `submit-unconfirmed` 失败、items=0）。

## 3. 为什么不改代码

H 需要「成功任务 + 刷新后可读到 items + 字节 sha 对账」。当前两格缺的是**数据**，不是功能：

- PRODUCT_SCENE：从来没有任务被写进任务库，结果只存在于历史坞临时项 → 要变成落库成功任务，只能新跑一次真实生成（本轮禁止）。
- HANDHELD_GOODS：任务已是终态 `failed`、`upstreamTaskId` 为 null（无法向上游对账），items 为空 → 要把 1060068B 补成任务项，只能写库回填（=注入，本轮禁止）。

两处若强行"补"，都会产出不真实的回执，故按规则如实保留 PARTIAL，未跑 tsc/测试（无源码改动）。

## 4. 闭合所需（下一轮）

1. PRODUCT_SCENE：允许一次真实生成，或让历史坞项持久化到 `tool-task:v1`（需产品决策）。
2. HANDHELD_GOODS：允许对该任务做上游对账（前提是提交时把 `upstreamTaskId` 落盘；当前提交路径未落盘，可作为独立缺陷单独立项）。

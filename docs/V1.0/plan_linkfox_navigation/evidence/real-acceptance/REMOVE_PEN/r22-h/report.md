# REMOVE_PEN.H · r22-h 真实浏览器验收（复用真实任务，单一机读回执）

- 结论：**PASS（11/11 断言）**
- 运行：2026-10-30T03:46:02Z → 03:46:24Z，`http://127.0.0.1:3000`，持久化 profile `.acceptance-profile/r26b`（真实历史数据，含已成功任务）
- 自有 tab：`tabId=967838F79EABB243C448BC9D1E1DA7E5`（CDP `Target.getTargetInfo.targetId`，独立 persistent context 内唯一页面；未触碰用户既有 10 个标签）
- 任务：`task-mvtp33dv-57nmbx`（复用已 succeeded 的真实结果，**未提交任何新生成请求**，`requests=[]`）
- 机读回执：[receipt.json](/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h/receipt.json)（顶层 `receipt` 为扁平摘要，`legs` 为四路明细）

## 1. 链路（同一浏览器会话、同一 tab，连续完成）

| 步骤 | 真实动作 | 证据 |
|---|---|---|
| 1 | 打开 `/tools/smart-edit/remove-pen`，真实结果渲染 | `beforeReloadTask`（task=succeeded，storageKey 命中） |
| 2 | **同文档真实 reload**：CDP `Page.reload` | `navType=reload`、`timeOrigin 1793331964433.4 → 1793331967901.4`（跨文档单调递增）、注入的 `window.__r22_docMarker` 丢失 |
| 3 | reload 后**结果恢复** | `img[alt=消除结果]` `complete=true, natural 1024x1024`，`srcScheme=blob` |
| 4 | **真实点击下载**（浏览器 download 事件） | `downloads/apple_1024-erased.png`，同时落 `~/Downloads/r22h-2f8f7f11-apple_1024-erased.png` |
| 5 | **真实点击「存入资产」** | feedback `已存入资产库（wdwqvHbN）`；`assetId=wdwqvHbNsra6AtPJ4L5h8`，`revision 2→3`、`updatedAt` 变化（幂等 upsert 更新而非新建） |
| 6 | **真实点击「发送画布」** | feedback `已发送画布（项目 3XGEZ9HC · 节点 image-17）`；`canvas_store` 前后快照差集得到唯一新节点 `nodeId=image-1793331976905-gdoom`（project `3XGEZ9HCyBNSi3TpXbJfB`） |

## 2. 四路真实字节（全部 1831533 B / 同一 sha256）

核对基准：`sha256=2f8f7f112bccc0a67d13bf8fb5a166da715ec85c2ff169f8c147f7e3d3cf415e`，`bytes=1831533`

| 腿 | 来源（真实读取路径） | storageKey / 标识 | bytes | sha256 |
|---|---|---|---|---|
| 结果 | IDB `infinite-canvas` / **`media_files`**（任务媒体库） | `tool-result:task-mvtp33dv-57nmbx:0:3yrrtwJa4FBz7TxtYTf29` | 1831533 | `2f8f7f11…3cf415e` |
| Downloads 文件 | 浏览器 download 事件落盘文件（`statSync`+读盘重算） | — | 1831533 | `2f8f7f11…3cf415e` |
| 资产 | IDB `infinite-canvas` / **`image_files`**（`image:…` 键），记录在 `infinite-canvas:asset_store` | `assetId=wdwqvHbNsra6AtPJ4L5h8`，`image:RnFFtxkXogTK8TT7UiLFs` | 1831533 | `2f8f7f11…3cf415e` |
| 画布节点 | IDB `infinite-canvas` / **`image_files`**，节点存于 `infinite-canvas:canvas_store → state.projects[].nodes` | `nodeId=image-1793331976905-gdoom`，`image:7I43LrlqrtQlC-MV41vJy` | 1831533 | `2f8f7f11…3cf415e` |

`canvasSent=true` 判定条件（均为真实状态，未硬编码）：真实点击产生 feedback `已发送画布` **且** `canvas_store` 中出现在点击前不存在的节点 **且** 该节点 `metadata.storageKey` 回读出与结果相同的字节。

## 3. 断言（`receipt.checks`）

`taskSucceeded` / `reloadMarked` / `resultVisibleAfterReload` / `resultBytesMatch` / `downloadLandedMatch` / `assetSavedReal` / `assetBytesMatch` / `canvasSent` / `canvasBytesMatch` / `noNewGenerationRequest` / `fourLegsSameSha` —— 全部 true。

## 4. 相对 R21 缺口的修复（只改验收脚本，不改产品代码）

1. **canvas 读取错位（R21 canvasSent 恒 false 根因）**：r26b 脚本只在 `app_state` 顶层找 `state.nodes`；canvas 为 zustand persist，真实结构是 `state.projects[].nodes`。r22-h 改为解析 `projects[].nodes`，并在发送前后做节点差集取新节点。
2. **reload 判定无效**：r26b 的 `freshReload` 只是布尔声明；r22-h 改为机读三元证据 `PerformanceNavigationTiming.type=reload` + 注入标记丢失 + `performance.timeOrigin` 严格增大（注意 `timeOrigin` 属于 `Performance`，不属于 `PerformanceNavigationTiming`——首版即因此误判为 false）。
3. **存资产判据**：同 `resultAssetKey` 走 `upsertAsset` 更新（`created:false`），故判据改为 feedback 成功 + `revision/updatedAt` 变化，避免“新建记录”这一错误前提。

## 5. 复现

```bash
cd /Users/mac/Documents/Dev/infinite-canvas/web
PATH=/opt/homebrew/bin:$PATH NO_PROXY=localhost,127.0.0.1 \
IC_BASE_URL=http://127.0.0.1:3000 \
IC_PROFILE=/Users/mac/Documents/Dev/infinite-canvas/.acceptance-profile/r26b \
IC_OUT=/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/plan_linkfox_navigation/evidence/real-acceptance/REMOVE_PEN/r22-h \
/opt/homebrew/bin/node scripts/real-acceptance/_r22_remove_pen_h.mjs
```

脚本：`web/scripts/real-acceptance/_r22_remove_pen_h.mjs`

## 6. 证据清单（本目录）

| 文件 | 说明 |
|---|---|
| `receipt.json` | 单一机读回执（含 `receipt` 扁平摘要 + `legs` 四路明细 + `checks`） |
| `result.png` | 结果腿字节落档（1831533 B） |
| `downloads/apple_1024-erased.png` | 下载腿真实落盘文件（1831533 B） |
| `asset-blob.bin` | 资产腿字节副本（1831533 B） |
| `canvas-node-blob.bin` | 画布节点腿字节副本（1831533 B） |
| `01-after-reload.png` … `04-after-send.png` | 各步骤页面截图（reload 后 / 下载后 / 存资产后 / 发画布后） |

## 7. 风险与未覆盖

- 画布节点 `metadata` 只含 `content/status/storageKey/naturalWidth/naturalHeight/bytes/mimeType`，**不含 `toolId/taskId`**，故节点与任务的绑定只能由「点击前不存在的唯一新节点 + storageKey 指向同一字节 + 反馈文案」共同证明；这是产品侧可考虑补强的点（非本次改动范围）。
- 复用真实任务意味着**未重新走生成链路**；生成侧由既有 r26/r26b 证据覆盖。
- 本次在用户真实下载目录留下一个副本 `~/Downloads/r22h-2f8f7f11-apple_1024-erased.png`（用于“Downloads 文件”这一腿的实物证据）。

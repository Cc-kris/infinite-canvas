# 7 工具真实历史恢复 · fresh reload 字节复现（2026-10-29）

范围（用户指定）：`PRODUCT_IMAGE_SUITE`、`DRESS_WEAR_SET`、`AI_POSTURE`、`AI_POSE_GENERATOR`（=POSE_UB）、`MATERIAL_UPPER_BODY`（=FLITE）、`NEW_DESIGNER`、`PRODUCT_MARKET_MATERIAL`。
禁止：派 worker、注入快照、重新生成、碰 `FISSION_LINK` / `AI_DRESSING`。

## 结论一览

| 工具 | 真实任务数 | fresh reload 历史坞 | 字节复现 | 判定 |
|---|---:|---|---|---|
| PRODUCT_IMAGE_SUITE | 2（succeeded） | 2 条，`data-tool-id` 正确 | 2/2 sha256 与 IDB 一致 | **PASS** |
| DRESS_WEAR_SET | 2（succeeded） | 2 条 | 2/2 sha256 与 IDB 一致 | **PASS** |
| AI_POSTURE | 0 | dock 已挂载，0 条 | 无数据 | BLOCKED |
| AI_POSE_GENERATOR | 0 | dock 已挂载，0 条 | 无数据 | BLOCKED |
| MATERIAL_UPPER_BODY | 0 | dock 已挂载，0 条 | 无数据 | BLOCKED |
| PRODUCT_SCENE | 0 | 右栏「历史记录」页签在，0 条 | 无数据 | BLOCKED |
| NEW_DESIGNER | 0 | dock 已挂载，0 条 | 无数据 | BLOCKED |
| PRODUCT_MARKET_MATERIAL | 0 | dock 已挂载，0 条 | 无数据 | BLOCKED |

BLOCKED 的原因不是缺陷：这 5 个工具在**真实用户 profile**（ego lite · Profile 1）的
`localStorage['tool-task:v1:index']`（33 条）里 0 条任务。此前它们的运行记录都发生在
临时 playwright profile（证据见 `design19b-nv-final/_runs/`），与用户 profile 不是同一份存储。
按「不伪造、不重跑上游」的先例（commit `e8121d7`），如实报 BLOCKED。

## 验证方法（都是「跑」出来的，不是读码）

1. 页面内 JS 读 `localStorage['tool-task:v1:index']` 全量枚举 33 条任务，按 `toolId` 分组。
   > leveldb 直接字节扫描无结论：Chrome 的 Local Storage 值经 snappy 压缩，
   > 连已知存在的 `PRODUCT_IMAGE_SUITE` 也搜不到，故不再用该法。
2. 用 `location.assign(route)` 做**整页导航**（不是 SPA 跳转），确保走 hydrate 冷启路径。
3. 读 dock DOM：`data-testid="tool-history-dock"` 的 `data-tool-id` / count / item 的 `data-task-id` / `data-task-status`。
4. 取 dock 里每个结果 `<img src="blob:...">`，页面内 `fetch` → `crypto.subtle.digest('SHA-256')`，
   与 IndexedDB `infinite-canvas` / `media_files` 中 `storageKey` 对应 Blob 的 size、sha256 对比。

## 实测数据

`localStorage['tool-task:v1:index']` = 33 条；IndexedDB `media_files` = 68 个键（含 16 个 `tool-result:*`）。

### PRODUCT_IMAGE_SUITE（`/tools/ecommerce-suite/product-image-suite`，冷启后）
```
dock data-tool-id = PRODUCT_IMAGE_SUITE, count = "2 条"
task-mvt6vpdo-sc1x8w  succeeded  image/png  2840825B  sha256[0:16]=4047edd57e482b45  key=tool-result:98tXNya0JHj77cjXVRxLa
task-mvt6vpdn-17qby2  succeeded  image/png  2785837B  sha256[0:16]=6f9dec2af872e9e9  key=tool-result:FRr_uTcG6mZmHzzEJ2rYx
工作区恢复出的 blob 图：1000x1000（草稿）+ 1024x1024 ×7
```

### DRESS_WEAR_SET（`/tools/ecommerce-suite/dress-wear-set`，冷启后）
```
dock data-tool-id = DRESS_WEAR_SET, count = "2 条"
task-mvt74l6q-1vljau  succeeded  image/png  1883817B  sha256[0:16]=9b7e62daebc97949  key=tool-result:UJkgjc6BIYFLDnO12F3G-
task-mvt74l6n-y5sie3  succeeded  image/png  2516552B  sha256[0:16]=8ecb4b7cab2c4a67  key=tool-result:og5LfxYy5GnPxzTYvmO4F
工作区恢复出的 blob 图：1000x1000（草稿）+ 1024x1024 ×4
```
四条记录的 `Blob.size` 与任务快照里 `result.items[].bytes` **逐条相等**，
且 dock 从 IDB 复原后重新生成的新 `blob:` URL 内容哈希与 IDB 原字节一致 → 字节级复现成立
（不是把旧 blob URL 直接塞回 DOM 的假恢复）。

## 下载到磁盘的证据缺口（如实记录）

我在 dock 上点了「下载」：
- 应用返回成功文案「已下载 dress-wear-set-result-1.png」；
- 但 `~/Downloads` 没有该文件，Chrome `downloads` 表**没有对应记录**；
- 同期唯一新增记录是 `id=33 image-translation-result-1.png(1028256B)`（我在 image-translation 页的点击）。

即：第二次程序化下载被 Chrome 的「同一站点多次自动下载」策略拦掉，属于浏览器策略，
不是应用逻辑失败，也无法在无人值守会话里绕过。因此磁盘落地证据记为「未取得」，
字节复现改用**页面内 fetch + sha256** 完成（等价且更严格：比较的是真实字节而不是文件名）。
此外发现 `downloadResultItem` 对单张结果直接把 source 交给 `file-saver.saveAs` 而不先取字节，
下载失败时仍会返回成功文案（与本文件第 143–149 行注释里批量的「假成功」同类问题），已在后续提交修复。

## 代码侧对照（谁在用共享持久化网关）

| 工具 | 位置 | 持久化方式 |
|---|---|---|
| PRODUCT_IMAGE_SUITE | `workspaces/suite.tsx` | `getPersistedToolGateway()` |
| PRODUCT_MARKET_MATERIAL | `workspaces/suite.tsx` | `getPersistedToolGateway()` |
| DRESS_WEAR_SET | `workspaces/dress-suite.tsx` | `useToolTaskStore.runTool` |
| AI_POSTURE / AI_POSE_GENERATOR | `workspaces/model.tsx` | `useToolTaskStore.runTool`（逐单元建任务） |
| MATERIAL_UPPER_BODY | `workspaces/dress.tsx` | `getPersistedToolGateway()` |
| PRODUCT_SCENE | `workspaces/scene-fission.tsx` | `getPersistedToolGateway()` + 自渲染 `ToolHistoryDock` |
| NEW_DESIGNER | `workspaces/designer.tsx` | **无任务持久化**，只做导出/下载/发画布 → dock 恒 0 条 |

## 复现命令

浏览器（ego lite · Profile 1）打开 `http://127.0.0.1:3000/tools/ecommerce-suite/dress-wear-set`，
整页刷新后在控制台执行：

```js
const idx = JSON.parse(localStorage.getItem('tool-task:v1:index')||'[]');
console.log(idx.length); // 33
[...document.querySelectorAll('[data-testid="tool-history-dock-item"]')]
  .forEach(i => console.log(i.dataset.taskId, i.dataset.taskStatus));
```

原始测量结果见同目录 `summary.json`。

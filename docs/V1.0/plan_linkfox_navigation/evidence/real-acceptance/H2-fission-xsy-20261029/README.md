# H2 · FISSION_LINK / AI_DRESSING_XSY 真实历史恢复（2026-10-29）

## 约束
- 只用既有真实历史任务，**未新建任务**、**未注入任何快照/blob**；
- 通过浏览器（ego lite，真实 profile）执行真实 `location.reload()` 全量刷新；
- 其他 design 工具不碰（fix-color 标签为他人在跑，未操作）。

## FISSION_LINK：已完成全链路真实验收
| 环节 | 证据 | 结论 |
| --- | --- | --- |
| 刷新后历史坞 | 头部「历史任务 5 条」，顶层 5 行（4 已完成 / 1 失败），缩略图 `img.naturalWidth=1024` ×4 | 真实任务从 IndexedDB 恢复，不是快照 |
| 刷新后结果区自动回填 | 提示「已从本地持久化恢复上次真实任务（2026/10/29 12:20:11 提交，状态 succeeded，任务 task-mvt18lrt-rsnifn）」+ 结果格「裂变结果 1」1024×1024 | 恢复走 `resolveMediaUrl(storageKey)` 重建 blob，旧 blob URL 不会失效 |
| 下载 | `~/Downloads/fission-link-result-1 (1).png` = 1 988 694 B，sha256 `bbc0ca08…`，与页面 blob 字节逐一比对一致 | MD5/SHA 级一致 |
| 存入资产库 | assetId `i28CzCpbrBdqVvU_8sKuC`（1024×1024 / 1 988 694 B / image/png）；IDB `infinite-canvas:asset_store` 落盘；`/assets` 页卡片「FISSION_LINK 结果 1 · 工具结果 · 图片 · 1024x1024 · 1.9 MB · image/png」渲染正常 | 资产真实存在且字节一致 |
| 发送到画布 | projectId `4YJKL9Hoq-HRiYvhqIozS` / nodeId `image-1793262996953-ratzx`；`/canvas/<id>` 页 1 节点渲染，节点元数据 `naturalWidth=1024 / bytes=1988694 / storageKey=image:vQS5lC_aduFTSLCermwZo` | 画布节点真实持久化（`app_state` 内 projects 快照） |

补充核对：`image_files` 中两个键 `image:vQS5lC_aduFTSLCermwZo`、`image:FSVCI_OJN83joCnIf9vqU` 均为 1 988 694 B / image/png（画布副本 + 资产副本各一份）。

## FISSION_LINK：代码缺口已由 scene.tsx 恢复接线闭合（本次实测生效）
`web/src/components/tools/workspaces/scene.tsx`（FissionLinkWorkspace）：
- `runFromStoredTask(task)`：按 `storageKey → resolveMediaUrl` 重建结果 URL，不重发请求；
- 挂载时 `hydrateTasks()`，随后无会话结果时自动回填**最近一条状态 succeeded 且含真实图片项**的落盘任务；
- `ToolTaskHistory onSelectTask` → `applyStoredTask` 点击任一历史任务即可回填到结果格并切到「结果」页签；
- 结果格数量 `Math.max(state.outputNum, runs.length)`，避免恢复 1 张时被 `outputNum` 撑出空坑；
- 恢复出来的结果沿用同一套「下载 / 存入资产库 / 发送到画布」，已在上表逐项验证。

## AI_DRESSING_XSY：无法恢复（缺真实数据，非网关缺口）
| 检查 | 结果 |
| --- | --- |
| `/tools/product-design/ai-dressing-xsy` 历史坞 | 存在，`历史任务 0 条`，空态文案正确；17 字段表单（`xsy-step-*`）渲染正常 |
| `localStorage['tool-task:index']` | 33 条索引，XSY 命中 0 |
| 全 profile 扫描（Chrome/Chromium/Edge/Brave/Vivaldi/@hilo/Novabox 的 Local Storage leveldb） | `AI_DRESSING_XSY` 0 命中 |
| 时间线 | XSY 真实出图 2026-10-28 12:36（资产 `WBaAYDKP5CU031kS2kDJQ`，720×960，taskId `xsy-real-1793193360`）；持久化接线提交 `e325ca7` 为 2026-10-28 17:11 → **先跑后接线**，任务记录从未落盘 |
| 当前代码 | `useToolTaskStore.runTool → getGateway()`（store port 持久化），统一历史坞已挂载 |

结论：XSY 属历史遗留的数据缺失，当前网关无缺口；按「不新建任务、不注入快照」约束，本工具的刷新恢复真实证据仍缺（不伪造）。

## 验证命令
```bash
cd web && ./node_modules/.bin/tsc --noEmit          # exit 0
cd web && bun test src/components/tools/             # 104 pass / 0 fail
```
